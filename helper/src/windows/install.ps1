# Installs the Beethoven bridge for this Windows account. No administrator rights: everything goes
# under %LOCALAPPDATA% and HKEY_CURRENT_USER, which the student's own account may always write.
#
# In order: check that the folder it runs from is complete and was built with Beethoven's extension
# identifier; say in one sentence what will happen and wait for Enter; copy the bridge, the
# uninstaller and the README into %LOCALAPPDATA%\Beethoven\bridge; remove Windows' downloaded-file
# mark (the Zone.Identifier stream) from those copies; write the native messaging manifest there;
# point Chrome's and Edge's per-user registry keys at it; start the installed bridge once and check
# that it answers; say in one sentence how that went.
#
# Test hooks, used only by helper/test (a student never sets them): BEETHOVEN_BRIDGE_ROOT installs
# into another folder; BEETHOVEN_BRIDGE_REGKEYS replaces the registry keys (semicolon-separated,
# each under Software\ in HKEY_CURRENT_USER and ending in \NativeMessagingHosts\ plus the host
# name); BEETHOVEN_BRIDGE_YES=1 skips both prompts.

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$HostName = 'com.openspineconsortium.beethoven.bridge'
$BridgeVersion = '1.0.0'
$Here = $PSScriptRoot
$Quiet = $env:BEETHOVEN_BRIDGE_YES -eq '1'

function Say([string]$text) { [Console]::Out.WriteLine($text) }

function Finish([int]$code) {
    if (-not $Quiet) {
        Say ''
        $null = Read-Host 'Press Enter to close this window'
    }
    exit $code
}

# ---- what to install, and where -----------------------------------------------------------

foreach ($f in 'bridge.cmd', 'bridge.ps1', 'uninstall.cmd', 'uninstall.ps1', 'allowed_origins.json') {
    if (-not (Test-Path -LiteralPath (Join-Path $Here $f) -PathType Leaf)) {
        Say 'Some of the bridge''s files are missing from this folder. Extract the whole zip file first (right-click it, Extract All), then open install.cmd in the folder that appears.'
        Finish 2
    }
}

$Origins = @()
try {
    Add-Type -AssemblyName System.Web.Extensions
    $raw = [IO.File]::ReadAllText((Join-Path $Here 'allowed_origins.json'))
    $parsed = (New-Object System.Web.Script.Serialization.JavaScriptSerializer).DeserializeObject($raw)
    if ($parsed -is [object[]]) {
        foreach ($o in $parsed) {
            if ($o -is [string] -and $o -cmatch '^chrome-extension://[a-p]{32}/\z') { $Origins += $o } else { $Origins = @(); break }
        }
    }
} catch {
    $Origins = @()
}
if ($Origins.Count -eq 0) {
    Say 'This copy of the bridge was built without Beethoven''s extension identifier, so Chrome would not let Beethoven use it. Ask your lab lead for the bridge from a released Beethoven.'
    Finish 3
}

if ($env:BEETHOVEN_BRIDGE_ROOT) { $Root = $env:BEETHOVEN_BRIDGE_ROOT } else { $Root = Join-Path $env:LOCALAPPDATA 'Beethoven\bridge' }
$Root = [IO.Path]::GetFullPath($Root)
$RegKeys = @("Software\Google\Chrome\NativeMessagingHosts\$HostName", "Software\Microsoft\Edge\NativeMessagingHosts\$HostName")
if ($env:BEETHOVEN_BRIDGE_REGKEYS) {
    $RegKeys = @($env:BEETHOVEN_BRIDGE_REGKEYS -split ';' | Where-Object { $_ -ne '' })
    foreach ($k in $RegKeys) {
        if (-not ($k.StartsWith('Software\') -and $k.EndsWith("\NativeMessagingHosts\$HostName"))) { Say "Refusing registry key $k"; exit 9 }
    }
}

# ---- consent ------------------------------------------------------------------------------

Say "Beethoven bridge $BridgeVersion"
Say ''
Say "This installs the Beethoven bridge for your Windows account only, with no administrator rights: it copies its small script files into $Root, removes the mark Windows puts on downloaded files from those copies so they can start, and tells Chrome and Edge where to find them."
if (-not $Quiet) {
    Say ''
    $null = Read-Host 'Press Enter to install, or close this window to cancel'
}

# ---- install ------------------------------------------------------------------------------

try {
    $null = New-Item -ItemType Directory -Force -Path $Root
    foreach ($f in 'bridge.cmd', 'bridge.ps1', 'uninstall.cmd', 'uninstall.ps1', 'README.txt') {
        $src = Join-Path $Here $f
        if (Test-Path -LiteralPath $src -PathType Leaf) { Copy-Item -LiteralPath $src -Destination (Join-Path $Root $f) -Force }
    }
    # allow.txt is the only way to add a host beside the grid; the installed copy always matches
    # the folder it was installed from.
    $allowSrc = Join-Path $Here 'allow.txt'
    $allowDst = Join-Path $Root 'allow.txt'
    if (Test-Path -LiteralPath $allowSrc -PathType Leaf) { Copy-Item -LiteralPath $allowSrc -Destination $allowDst -Force }
    elseif (Test-Path -LiteralPath $allowDst) { Remove-Item -LiteralPath $allowDst -Force }

    Get-ChildItem -LiteralPath $Root -File | Unblock-File

    $manifestPath = Join-Path $Root "$HostName.json"
    $hostPath = (Join-Path $Root 'bridge.cmd').Replace('\', '\\').Replace('"', '\"')
    $originList = ($Origins | ForEach-Object { '"' + $_ + '"' }) -join ', '
    $manifest = "{`n" +
        "  `"name`": `"$HostName`",`n" +
        "  `"description`": `"The Beethoven bridge: carries Beethoven's encrypted ssh connection to the grid.`",`n" +
        "  `"path`": `"$hostPath`",`n" +
        "  `"type`": `"stdio`",`n" +
        "  `"allowed_origins`": [$originList]`n" +
        "}`n"
    [IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding($false)))

    foreach ($k in $RegKeys) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($k)
        $key.SetValue('', $manifestPath)
        $key.Close()
    }
} catch {
    Say ('The bridge could not be installed: ' + $_.Exception.Message)
    Finish 5
}

# ---- does it start? -----------------------------------------------------------------------
# Started the way Chrome starts it: cmd.exe on bridge.cmd, one hello message on stdin.

function Test-Bridge {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
    $psi.Arguments = '/d /s /c ""' + (Join-Path $Root 'bridge.cmd') + '" chrome-extension://installer-check/"'
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    try {
        $hello = [Text.Encoding]::UTF8.GetBytes('{"t":"hello","v":1}')
        $in = $p.StandardInput.BaseStream
        $in.Write([BitConverter]::GetBytes([int]$hello.Length), 0, 4)
        $in.Write($hello, 0, $hello.Length)
        $in.Flush()
        $out = $p.StandardOutput.BaseStream
        $buf = New-Object byte[] 8192
        $got = 0
        $until = [DateTime]::UtcNow.AddSeconds(45)
        while ($got -lt 4 -or $got -lt 4 + [BitConverter]::ToInt32($buf, 0)) {
            $left = [int]($until - [DateTime]::UtcNow).TotalMilliseconds
            if ($left -le 0 -or $got -ge $buf.Length) { return $null }
            $t = $out.ReadAsync($buf, $got, $buf.Length - $got)
            if (-not $t.Wait($left)) { return $null }
            if ($t.Result -le 0) { return $null }
            $got += $t.Result
        }
        return [Text.Encoding]::UTF8.GetString($buf, 4, [BitConverter]::ToInt32($buf, 0))
    } finally {
        try { $p.StandardInput.Close() } catch { }
        if (-not $p.WaitForExit(10000)) { try { $p.Kill() } catch { } }
    }
}

$reply = $null
try { $reply = Test-Bridge } catch { $reply = $null }

Say ''
if ($null -ne $reply -and $reply.Contains('"t":"hello"') -and $reply.Contains('"helper":"' + $BridgeVersion + '"')) {
    Say "The Beethoven bridge $BridgeVersion is installed for Chrome and Edge. Go back to Beethoven and press Check again."
    Finish 0
}
$policy = 'Undefined'
try {
    foreach ($scope in 'MachinePolicy', 'UserPolicy') {
        $v = [string](Get-ExecutionPolicy -Scope $scope)
        if ($v -ne 'Undefined') { $policy = $v }
    }
} catch { }
if ($policy -ne 'Undefined') {
    Say "The bridge is installed, but a policy on this computer stops PowerShell scripts from running ($policy), so it cannot start. Use GlobalProtect in Beethoven instead, and tell your lab lead."
} else {
    Say 'The bridge is installed, but it did not answer when started. Press Check again in Beethoven; if it still does not connect, use GlobalProtect in Beethoven instead and tell your lab lead.'
}
Finish 4
