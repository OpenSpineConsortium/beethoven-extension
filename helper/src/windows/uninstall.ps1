# Removes the Beethoven bridge from this Windows account: the registry entries that tell Chrome and
# Edge about it, then the bridge's own files in %LOCALAPPDATA%\Beethoven\bridge, by name, and the
# folder if nothing else is left in it. Nothing else is touched.
#
# When it was started by the uninstall.cmd inside that folder, it leaves that one file and exits
# with 10, and uninstall.cmd deletes itself (a running batch file cannot be deleted from outside).
# Test hooks as in install.ps1: BEETHOVEN_BRIDGE_ROOT, BEETHOVEN_BRIDGE_REGKEYS, BEETHOVEN_BRIDGE_YES.

param([string]$Caller = '')

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$HostName = 'com.openspineconsortium.beethoven.bridge'
$Quiet = $env:BEETHOVEN_BRIDGE_YES -eq '1'

function Say([string]$text) { [Console]::Out.WriteLine($text) }

if ($env:BEETHOVEN_BRIDGE_ROOT) { $Root = $env:BEETHOVEN_BRIDGE_ROOT } else { $Root = Join-Path $env:LOCALAPPDATA 'Beethoven\bridge' }
$Root = [IO.Path]::GetFullPath($Root)
$RegKeys = @("Software\Google\Chrome\NativeMessagingHosts\$HostName", "Software\Microsoft\Edge\NativeMessagingHosts\$HostName")
if ($env:BEETHOVEN_BRIDGE_REGKEYS) {
    $RegKeys = @($env:BEETHOVEN_BRIDGE_REGKEYS -split ';' | Where-Object { $_ -ne '' })
    foreach ($k in $RegKeys) {
        if (-not ($k.StartsWith('Software\') -and $k.EndsWith("\NativeMessagingHosts\$HostName"))) { Say "Refusing registry key $k"; exit 9 }
    }
}

Say "This removes the Beethoven bridge from your Windows account: its files in $Root and the entries that tell Chrome and Edge about it."
if (-not $Quiet) { $null = Read-Host 'Press Enter to remove it, or close this window to cancel' }

foreach ($k in $RegKeys) {
    try { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree($k, $false) } catch { }
}

$selfCmd = Join-Path $Root 'uninstall.cmd'
$fromInside = $false
if ($Caller -ne '') {
    try { $fromInside = [IO.Path]::GetFullPath($Caller) -eq $selfCmd } catch { $fromInside = $false }
}
$files = @('bridge.cmd', 'bridge.ps1', 'allow.txt', 'README.txt', "$HostName.json", 'uninstall.ps1')
if (-not $fromInside) { $files += 'uninstall.cmd' }
$failed = @()
foreach ($f in $files) {
    $p = Join-Path $Root $f
    if (Test-Path -LiteralPath $p -PathType Leaf) {
        try { Remove-Item -LiteralPath $p -Force } catch { $failed += $f }
    }
}
if (-not $fromInside -and (Test-Path -LiteralPath $Root -PathType Container)) {
    if (@(Get-ChildItem -LiteralPath $Root -Force).Count -eq 0) { Remove-Item -LiteralPath $Root -Force }
    $parent = Split-Path -Parent $Root
    if (-not $env:BEETHOVEN_BRIDGE_ROOT -and (Test-Path -LiteralPath $parent -PathType Container) -and @(Get-ChildItem -LiteralPath $parent -Force).Count -eq 0) {
        Remove-Item -LiteralPath $parent -Force
    }
}

if ($failed.Count -gt 0) {
    Say ('The bridge is switched off for Chrome and Edge, but Windows kept some of its files (' + ($failed -join ', ') + '); close Chrome and run this again to remove them.')
} else {
    Say 'The Beethoven bridge is removed from this computer.'
}
if (-not $Quiet) { Say ''; $null = Read-Host 'Press Enter to close this window' }
if ($fromInside) { exit 10 }
exit 0
