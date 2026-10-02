# The Beethoven bridge: the Windows host (Windows PowerShell 5.1, present on every Windows 10 and 11).
#
# Chrome starts bridge.cmd, which starts this script, when Beethoven asks for the bridge (native
# messaging), and speaks to it over stdin and stdout: every message is a 4-byte little-endian
# length followed by that many bytes of UTF-8 JSON. The bridge opens a TCP connection only to a
# host:port on its allowlist (the grid's ssh port, plus the few entries an installer may write to
# allow.txt beside this file) and carries bytes both ways as base64. Those bytes are an ssh
# session that Beethoven encrypts and checks itself, so the bridge cannot read them; it never logs
# them, holds no credential, runs no shell and starts no other program. It exits when Chrome
# closes its stdin.
#
# One thread waits on every pending read, write and connect at once (Task.WaitAny), so a slow
# socket never holds up the others and nothing runs on a thread pool callback. Every value a .NET
# call returns is discarded on purpose: anything a PowerShell statement leaves in the pipeline
# would be printed to stdout and corrupt the message stream, and the main loop runs under
# Out-Null as a second guard.
#
# Protocol 1 (helper/README.md has the whole contract):
#   in : hello {v} | open {id, host, port} | data {id, b64} | close {id}
#   out: hello {v, helper, os, kind, runtime, allow} | opened {id} | data {id, b64}
#        | closed {id, reason} | error {id, reason}
# A connection that never opened ends with "error"; one that opened ends with "closed".

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$BridgeVersion = '1.0.0'
$Protocol = 1
$BuiltinAllow = @('grid.wayne.edu:22')

$MaxFrame = 1048576          # largest message accepted from Chrome
$Chunk = 49152               # bytes per socket read: 64 KiB once in base64
$MaxConn = 8
$MaxExtraAllow = 8
$ConnectTimeoutMs = 30000      # name lookup and connect; some resolvers take 10 s or more
$CloseFlushMs = 10000        # a closed connection may take this long to send what is queued
$LingerMs = 2000             # then this long to drain the peer after our side shut down
$HighWater = 8MB             # stop reading Chrome while this much waits for the network
$LowWater = 2MB              # and start again below this

Add-Type -AssemblyName System.Web.Extensions
$Json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$Json.MaxJsonLength = 4194304
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)

$StdIn = [Console]::OpenStandardInput()
$StdOut = [Console]::OpenStandardOutput()

# ---- allowlist ----------------------------------------------------------------------------

$Allow = New-Object 'System.Collections.Generic.List[string]'
foreach ($a in $BuiltinAllow) { $Allow.Add($a) }
$AllowFile = Join-Path $PSScriptRoot 'allow.txt'
if (Test-Path -LiteralPath $AllowFile -PathType Leaf) {
    $extra = 0
    foreach ($line in [IO.File]::ReadAllLines($AllowFile)) {
        $l = ($line -replace '#.*$', '').Trim().ToLowerInvariant()
        if ($l -notmatch '^[a-z0-9.-]{1,253}:([0-9]{1,5})$') { continue }
        $p = [int]$Matches[1]
        if ($p -lt 1 -or $p -gt 65535 -or $Allow.Contains($l)) { continue }
        if ($extra -ge $MaxExtraAllow) { break }
        $Allow.Add($l)
        $extra++
    }
}

# ---- state --------------------------------------------------------------------------------

$script:Conns = New-Object 'System.Collections.Generic.Dictionary[string,object]'   # ordinal keys
$script:Closing = New-Object System.Collections.ArrayList
$script:InBuf = New-Object byte[] ($MaxFrame + 4 + 65536)
$script:InLen = 0
$script:StdinTask = $null
$script:Queued = 0
$script:Paused = $false

# ---- output -------------------------------------------------------------------------------

function Send-Frame([string]$text) {
    $body = $Utf8.GetBytes($text)
    try {
        $StdOut.Write([BitConverter]::GetBytes([int]$body.Length), 0, 4)
        $StdOut.Write($body, 0, $body.Length)
        $StdOut.Flush()
    } catch {
        Exit-Bridge 0   # Chrome is gone
    }
}

function Send-Error([string]$id, [string]$reason) { Send-Frame ('{"t":"error","id":"' + $id + '","reason":"' + $reason + '"}') }
function Send-Closed([string]$id, [string]$reason) { Send-Frame ('{"t":"closed","id":"' + $id + '","reason":"' + $reason + '"}') }

function Send-Hello {
    $list = ($Allow | ForEach-Object { '"' + $_ + '"' }) -join ','
    Send-Frame ('{"t":"hello","v":' + $Protocol + ',"helper":"' + $BridgeVersion + '","os":"windows","kind":"script","runtime":"powershell","allow":[' + $list + ']}')
}

function Exit-Bridge([int]$code) {
    foreach ($c in @($script:Conns.Values) + @($script:Closing)) { try { $c.Client.Close() } catch { } }
    [Environment]::Exit($code)
}

# ---- connections --------------------------------------------------------------------------

function Start-StdinRead {
    if ($null -eq $script:StdinTask) {
        $script:StdinTask = $StdIn.ReadAsync($script:InBuf, $script:InLen, $script:InBuf.Length - $script:InLen)
    }
}

function Test-Resume {
    if ($script:Paused -and $script:Queued -lt $LowWater) {
        $script:Paused = $false
        Start-StdinRead
    }
}

function Clear-Queue($c) {
    $left = $c.Pending
    foreach ($b in $c.Queue) { $left += $b.Length }
    $script:Queued -= $left
    $c.Queue.Clear()
    $c.Pending = 0
    Test-Resume
}

# Closes the socket; nothing more is said to the extension about it.
function Remove-Conn($c) {
    Clear-Queue $c
    try { $c.Client.Close() } catch { }
    $c.State = 'gone'
    $c.ReadTask = $null
    $c.WriteTask = $null
    $c.ConnectTask = $null
    if ($script:Closing.Contains($c)) { $script:Closing.Remove($c) }
}

function Close-Conn($c, [string]$reason) {
    if ($script:Conns.ContainsKey($c.Id) -and [object]::ReferenceEquals($script:Conns[$c.Id], $c)) { $null = $script:Conns.Remove($c.Id) }
    Remove-Conn $c
    Send-Closed $c.Id $reason
}

function Start-Read($c) {
    if ($null -eq $c.ReadTask -and $null -ne $c.Stream) {
        try { $c.ReadTask = $c.Stream.ReadAsync($c.Buf, 0, $c.Buf.Length) } catch { $c.ReadTask = $null; Fail-Conn $c }
    }
}

function Fail-Conn($c) {
    if ($c.State -eq 'open') { Close-Conn $c 'reset' } else { Remove-Conn $c }
}

function Start-Write($c) {
    if ($null -ne $c.WriteTask -or $null -eq $c.Stream) { return }
    if ($c.Queue.Count -gt 0) {
        $b = $c.Queue.Dequeue()
        $c.Pending = $b.Length
        try { $c.WriteTask = $c.Stream.WriteAsync($b, 0, $b.Length) } catch { $c.WriteTask = $null; Fail-Conn $c }
        return
    }
    if ($c.State -eq 'closing') {
        try { $c.Client.Client.Shutdown([System.Net.Sockets.SocketShutdown]::Send) } catch { }
        $c.State = 'linger'
        $c.Deadline = [DateTime]::UtcNow.AddMilliseconds($LingerMs)
        Start-Read $c
    }
}

function Get-ConnectReason($ex) {
    $e = $ex
    while ($null -ne $e -and -not ($e -is [System.Net.Sockets.SocketException])) { $e = $e.InnerException }
    if ($null -eq $e) { return 'connect_failed' }
    switch ($e.SocketErrorCode.ToString()) {
        'ConnectionRefused' { return 'refused' }
        'TimedOut' { return 'timeout' }
        'HostNotFound' { return 'dns' }
        'NoData' { return 'dns' }
        'TryAgain' { return 'dns' }
        'NetworkUnreachable' { return 'unreachable' }
        'HostUnreachable' { return 'unreachable' }
    }
    return 'connect_failed'
}

# ---- messages from Chrome -----------------------------------------------------------------

function Get-Str($m, [string]$k) {
    if ($m.ContainsKey($k) -and $m[$k] -is [string]) { return $m[$k] }
    return $null
}

function Get-Id($m) {
    $id = Get-Str $m 'id'
    if ($null -ne $id -and $id -cmatch '^[A-Za-z0-9._:-]{1,64}\z') { return $id }
    return $null
}

function Invoke-Open($m) {
    $id = Get-Id $m
    if ($null -eq $id) { Send-Error '' 'bad_id'; return }
    if ($script:Conns.ContainsKey($id)) { Send-Error $id 'duplicate_id'; return }
    $hostName = Get-Str $m 'host'
    if ($null -eq $hostName -or $hostName.ToLowerInvariant() -cnotmatch '^[a-z0-9.-]{1,253}\z') { Send-Error $id 'bad_host'; return }
    $hostName = $hostName.ToLowerInvariant()
    $port = $null
    if ($m.ContainsKey('port')) { $port = $m['port'] }
    if (-not (($port -is [int]) -or ($port -is [long])) -or $port -lt 1 -or $port -gt 65535) { Send-Error $id 'bad_port'; return }
    # The allowlist is checked before any name lookup or connection.
    if (-not $Allow.Contains($hostName + ':' + $port)) { Send-Error $id 'not_allowed'; return }
    if ($script:Conns.Count + $script:Closing.Count -ge $MaxConn) { Send-Error $id 'too_many'; return }
    $c = @{
        Id = $id; State = 'connecting'; Client = (New-Object System.Net.Sockets.TcpClient); Stream = $null
        ConnectTask = $null; ReadTask = $null; WriteTask = $null; Pending = 0
        Queue = (New-Object 'System.Collections.Generic.Queue[byte[]]'); Buf = (New-Object byte[] $Chunk)
        Deadline = [DateTime]::UtcNow.AddMilliseconds($ConnectTimeoutMs)
    }
    try {
        $c.ConnectTask = $c.Client.ConnectAsync($hostName, [int]$port)
    } catch {
        try { $c.Client.Close() } catch { }
        Send-Error $id (Get-ConnectReason $_.Exception)
        return
    }
    $script:Conns[$id] = $c
}

function Invoke-Data($m) {
    $id = Get-Id $m
    if ($null -eq $id) { Send-Error '' 'bad_id'; return }
    if (-not $script:Conns.ContainsKey($id)) { Send-Error $id 'unknown_id'; return }
    $c = $script:Conns[$id]
    $b64 = Get-Str $m 'b64'
    if ($null -eq $b64 -or ($b64.Length % 4) -ne 0 -or $b64 -cnotmatch '^[A-Za-z0-9+/]*={0,2}\z') { Send-Error $id 'bad_b64'; return }
    try { $bytes = [Convert]::FromBase64String($b64) } catch { Send-Error $id 'bad_b64'; return }
    if ($bytes.Length -eq 0) { return }
    $c.Queue.Enqueue($bytes)
    $script:Queued += $bytes.Length
    if ($script:Queued -gt $HighWater) { $script:Paused = $true }
    if ($c.State -eq 'open') { Start-Write $c }
}

function Invoke-Close($m) {
    $id = Get-Id $m
    if ($null -eq $id) { Send-Error '' 'bad_id'; return }
    if (-not $script:Conns.ContainsKey($id)) { Send-Error $id 'unknown_id'; return }
    $c = $script:Conns[$id]
    $null = $script:Conns.Remove($id)
    Send-Closed $id 'local'
    if ($c.State -eq 'connecting') { Remove-Conn $c; return }
    # What the extension sent before closing still goes out, then our side shuts down.
    $c.State = 'closing'
    $c.Deadline = [DateTime]::UtcNow.AddMilliseconds($CloseFlushMs)
    $null = $script:Closing.Add($c)
    Start-Write $c
}

function Invoke-Message([string]$text) {
    $m = $null
    try { $m = $Json.DeserializeObject($text) } catch { $m = $null }
    if (-not ($m -is [System.Collections.Generic.Dictionary[string, object]])) { Send-Error '' 'bad_json'; return }
    foreach ($v in $m.Values) {
        if ($v -is [System.Collections.IDictionary] -or ($v -is [System.Collections.IEnumerable] -and -not ($v -is [string]))) { Send-Error '' 'bad_json'; return }
    }
    $t = Get-Str $m 't'
    $idOrEmpty = Get-Id $m
    if ($null -eq $idOrEmpty) { $idOrEmpty = '' }
    if ($null -eq $t) { Send-Error $idOrEmpty 'bad_message'; return }
    switch -CaseSensitive ($t) {
        'hello' { Send-Hello; return }
        'open' { Invoke-Open $m; return }
        'data' { Invoke-Data $m; return }
        'close' { Invoke-Close $m; return }
    }
    Send-Error $idOrEmpty 'unknown_type'
}

function Read-Frames {
    $off = 0
    while ($script:InLen - $off -ge 4) {
        $len = [BitConverter]::ToUInt32($script:InBuf, $off)
        if ($len -gt $MaxFrame) { Send-Error '' 'too_large'; Exit-Bridge 1 }
        if ($script:InLen - $off - 4 -lt $len) { break }
        $text = $null
        if ($len -gt 0) {
            try { $text = $Utf8Strict.GetString($script:InBuf, $off + 4, [int]$len) } catch { $text = $null }
        }
        $off += 4 + [int]$len
        if ($null -eq $text) { Send-Error '' 'bad_json' } else { Invoke-Message $text }
    }
    if ($off -gt 0) {
        [Buffer]::BlockCopy($script:InBuf, $off, $script:InBuf, 0, $script:InLen - $off)
        $script:InLen -= $off
    }
}

# ---- completions --------------------------------------------------------------------------

function Complete-Stdin {
    $t = $script:StdinTask
    $script:StdinTask = $null
    if ($t.IsFaulted -or $t.IsCanceled) { Exit-Bridge 0 }
    $n = $t.Result
    if ($n -le 0) { Exit-Bridge 0 }   # Chrome closed the pipe: Beethoven is gone
    $script:InLen += $n
    Read-Frames
    if (-not $script:Paused) { Start-StdinRead }
}

function Complete-Connect($c) {
    $t = $c.ConnectTask
    $c.ConnectTask = $null
    if ($c.State -ne 'connecting') { return }
    if ($t.IsFaulted -or $t.IsCanceled) {
        $reason = 'connect_failed'
        if ($t.IsFaulted) { $reason = Get-ConnectReason $t.Exception }
        $null = $script:Conns.Remove($c.Id)
        Remove-Conn $c
        Send-Error $c.Id $reason
        return
    }
    $c.Client.NoDelay = $true
    $c.Stream = $c.Client.GetStream()
    $c.State = 'open'
    Send-Frame ('{"t":"opened","id":"' + $c.Id + '"}')
    Start-Read $c
    Start-Write $c
}

function Complete-Read($c) {
    $t = $c.ReadTask
    $c.ReadTask = $null
    if ($c.State -eq 'gone') { return }
    $failed = $t.IsFaulted -or $t.IsCanceled
    $n = 0
    if (-not $failed) { $n = $t.Result }
    if ($c.State -ne 'open') {
        # Closed by the extension: drain whatever the peer still sends, and drop it.
        if ($failed -or $n -eq 0) { Remove-Conn $c } elseif ($c.State -eq 'linger') { Start-Read $c }
        return
    }
    if ($failed) { Close-Conn $c 'reset'; return }
    if ($n -eq 0) { Close-Conn $c 'eof'; return }
    Send-Frame ('{"t":"data","id":"' + $c.Id + '","b64":"' + [Convert]::ToBase64String($c.Buf, 0, $n) + '"}')
    Start-Read $c
}

function Complete-Write($c) {
    $t = $c.WriteTask
    $c.WriteTask = $null
    if ($c.State -eq 'gone') { return }
    if ($t.IsFaulted -or $t.IsCanceled) { Fail-Conn $c; return }
    $script:Queued -= $c.Pending
    $c.Pending = 0
    Start-Write $c
    Test-Resume
}

function Test-Deadlines {
    $now = [DateTime]::UtcNow
    foreach ($c in @($script:Conns.Values)) {
        if ($c.State -eq 'connecting' -and $now -ge $c.Deadline) {
            $null = $script:Conns.Remove($c.Id)
            Remove-Conn $c
            Send-Error $c.Id 'timeout'
        }
    }
    foreach ($c in @($script:Closing)) {
        if ($now -ge $c.Deadline) { Remove-Conn $c }
    }
}

# ---- the loop -----------------------------------------------------------------------------

function Invoke-Loop {
    Start-StdinRead
    # Built once and cleared each turn: New-Object is slow in PowerShell 5.1.
    $tasks = New-Object 'System.Collections.Generic.List[System.Threading.Tasks.Task]'
    $kinds = New-Object 'System.Collections.Generic.List[string]'
    $owners = New-Object 'System.Collections.Generic.List[object]'
    $nextDeadlineCheck = [DateTime]::UtcNow
    while ($true) {
        $tasks.Clear(); $kinds.Clear(); $owners.Clear()
        if ($null -ne $script:StdinTask) { $tasks.Add($script:StdinTask); $kinds.Add('stdin'); $owners.Add($null) }
        foreach ($group in $script:Conns.Values, $script:Closing) {
            foreach ($c in $group) {
                if ($null -ne $c.ConnectTask) { $tasks.Add($c.ConnectTask); $kinds.Add('connect'); $owners.Add($c) }
                if ($null -ne $c.ReadTask) { $tasks.Add($c.ReadTask); $kinds.Add('read'); $owners.Add($c) }
                if ($null -ne $c.WriteTask) { $tasks.Add($c.WriteTask); $kinds.Add('write'); $owners.Add($c) }
            }
        }
        if ($tasks.Count -eq 0) { Start-StdinRead; continue }
        $i = [System.Threading.Tasks.Task]::WaitAny($tasks.ToArray(), 250)
        if ($i -ge 0) {
            # Handle every task that has finished, not only the first, in list order. A handler
            # may replace or drop another entry's task, so each is checked against its owner's
            # current one before it is handled.
            for ($k = 0; $k -lt $tasks.Count; $k++) {
                $t = $tasks[$k]
                if (-not $t.IsCompleted) { continue }
                $c = $owners[$k]
                switch ($kinds[$k]) {
                    'stdin' { if ([object]::ReferenceEquals($script:StdinTask, $t)) { Complete-Stdin } }
                    'connect' { if ([object]::ReferenceEquals($c.ConnectTask, $t)) { Complete-Connect $c } }
                    'read' { if ([object]::ReferenceEquals($c.ReadTask, $t)) { Complete-Read $c } }
                    'write' { if ([object]::ReferenceEquals($c.WriteTask, $t)) { Complete-Write $c } }
                }
            }
        }
        if ([DateTime]::UtcNow -ge $nextDeadlineCheck) {
            Test-Deadlines
            $nextDeadlineCheck = [DateTime]::UtcNow.AddMilliseconds(200)
        }
    }
}

try {
    Invoke-Loop | Out-Null
} catch {
    Exit-Bridge 1
}
