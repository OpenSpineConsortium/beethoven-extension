# Builds and signs beethoven-bridge-windows.msi, the per-user installer of the bridge's binary
# edition, on the maintainer's own Windows machine. Nothing here runs in CI: the signing needs the
# maintainer's Azure Artifact Signing account (formerly Trusted Signing) reached through their own
# Entra sign-in (for example az login), and no key file, token or account secret exists anywhere in
# this repository. The only identifiers the script needs, the Endpoint and the two account names,
# come from signing.json beside it, which is gitignored; signing.example.json shows the shape.
#
# In order: check the tools; read helper/VERSION; cargo build --release for the MSVC target, with
# the C runtime linked in statically, into a work folder under the temp directory; stage
# beethoven-bridge.exe, the native messaging manifest (its "path" the relative "beethoven-bridge.exe",
# which Chrome resolves against the manifest's own folder on Windows) and README.txt; sign the exe
# through the Dlib; build the MSI with WiX v5 from Package.wxs in the work folder; sign the MSI the
# same way; verify both; only then copy the MSI to OutDir and write beside it the sidecar <msi>.json
# that node helper/build.mjs checks before it copies the package into the extension. A failed step
# leaves OutDir as it was.
#
# Windows PowerShell 5.1 (the one every Windows 10 and 11 carries): no ??, no ternary, no &&.
#
# -SkipSign builds the MSI unsigned to try the packaging on a machine without the signing account.
# It goes to <OutDir>\trial with no sidecar, as the Mac scripts' trials do, so the build cannot pick
# the file up and it never replaces a signed one; the output must never ship.
#
# The usual route is the Mac: build-msi-mac.sh, run by release.sh, builds and signs the same package
# from bridge.wxs with no Windows machine. This script is the fallback until a release has gone
# through that way (Artifact Signing's answer to a Mac is not yet measured; helper/release/README.md).

[CmdletBinding()]
param(
    # The published extension's identifier, 32 letters a to p, read in the Chrome Web Store developer
    # dashboard. It is baked into the manifest as the one allowed origin, so the installed bridge
    # answers that Beethoven and no other.
    [Parameter(Mandatory = $true)]
    [string]$StoreId,

    # JSON with Endpoint, CodeSigningAccountName and CertificateProfileName (the maintainer's own
    # names, never committed; copy signing.example.json to signing.json and fill it in).
    [string]$SigningConfig = (Join-Path $PSScriptRoot 'signing.json'),

    # signtool.exe from the Windows SDK. Empty: the newest one under the SDK's bin folder.
    [string]$SignTool = '',

    # Azure.CodeSigning.Dlib.dll, the signtool plug-in of the Artifact Signing client. Empty: the
    # newest copy in the user's NuGet cache under the package's name at the time of writing.
    [string]$Dlib = '',

    # The WiX v5 command. Empty is not accepted; the default is the one on PATH.
    [string]$Wix = 'wix',

    # Where the MSI and its sidecar go. Empty: the repository's helper\signed (gitignored).
    [string]$OutDir = '',

    # The Rust target. The MSI is x64 only, so only an x86_64 Windows target is accepted.
    [string]$Target = 'x86_64-pc-windows-msvc',

    # A trial build: no signing, no sidecar, never shipped.
    [switch]$SkipSign
)

Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$HostName = 'com.openspineconsortium.beethoven.bridge'
$MsiName = 'beethoven-bridge-windows.msi'
$ExeName = 'beethoven-bridge.exe'
$TimestampUrl = 'http://timestamp.acs.microsoft.com'
$Utf8 = New-Object System.Text.UTF8Encoding($false)

function Step([string]$text) { [Console]::Out.WriteLine($text) }

# Runs a native command and throws when it fails, naming only the command, never its arguments: the
# argument list of the signing calls holds paths the maintainer need not see repeated. The exit
# code is the verdict; Windows PowerShell 5.1 would otherwise turn cargo's progress lines, which go
# to stderr, into errors whenever the output is redirected.
function Run([string]$what, [string]$exe, [string[]]$arguments) {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $exe @arguments } finally { $ErrorActionPreference = $saved }
    if ($LASTEXITCODE -ne 0) { throw "$what failed ($exe exited with $LASTEXITCODE)." }
}

# The newest file matching a glob whose grandparent folder is a version number (the Windows SDK and
# the NuGet cache both lay their copies out as <version>\<arch>\<file>).
function Find-Newest([string]$glob) {
    $best = $null
    $bestVersion = $null
    foreach ($f in @(Get-ChildItem -Path $glob -File -ErrorAction SilentlyContinue)) {
        $v = $null
        try { $v = [Version]$f.Directory.Parent.Name } catch { $v = $null }
        if ($null -eq $v) { continue }
        if ($null -eq $bestVersion -or $v -gt $bestVersion) { $best = $f.FullName; $bestVersion = $v }
    }
    return $best
}

# ---- arguments ---------------------------------------------------------------------------

if ($StoreId -cnotmatch '^[a-p]{32}$') {
    throw 'StoreId must be the published extension''s identifier, 32 letters a to p, as the Chrome Web Store developer dashboard shows it.'
}
$Origin = "chrome-extension://$StoreId/"

if ($Target -notmatch '^x86_64-pc-windows-') {
    throw "The package is x64 only (Package.wxs is built with -arch x64), so Target must be an x86_64-pc-windows target, not $Target."
}

$HelperRoot = [IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot, '..', '..'))
$RustDir = [IO.Path]::Combine($HelperRoot, 'src', 'rust')
$Wxs = Join-Path $PSScriptRoot 'Package.wxs'
$PayloadReadme = Join-Path $PSScriptRoot 'README.txt'
if ($OutDir -eq '') { $OutDir = Join-Path $HelperRoot 'signed' }
$OutDir = [IO.Path]::GetFullPath($OutDir)
if ($SkipSign) { $OutDir = Join-Path $OutDir 'trial' }
$FinalMsi = Join-Path $OutDir $MsiName

foreach ($p in $Wxs, $PayloadReadme, (Join-Path $RustDir 'Cargo.toml'), (Join-Path $HelperRoot 'VERSION')) {
    if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { throw "Missing $p; run this script from a complete checkout." }
}

# ---- the tools ----------------------------------------------------------------------------

Step 'Checking the tools (cargo, the Rust target, wix; signtool and the signing client unless -SkipSign).'

if ($null -eq (Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'cargo is not on PATH; install the Rust toolchain (rustup) with the MSVC target.' }
if ($null -ne (Get-Command rustup -ErrorAction SilentlyContinue)) {
    $installed = @(& rustup target list --installed)
    if ($installed -notcontains $Target) { throw "The Rust target $Target is not installed; run: rustup target add $Target" }
} else {
    # A toolchain installed without rustup (a distribution package) has no target list to read; cargo
    # itself refuses a missing target with a plain message, so the build is still checked.
    Step 'rustup is not on PATH, so the installed targets are not listed here; cargo will say if the target is missing.'
}
if ($null -eq (Get-Command $Wix -ErrorAction SilentlyContinue)) { throw "The WiX command $Wix is not on PATH; install WiX v5 (dotnet tool install --global wix) or pass -Wix." }

$Signing = $null
if (-not $SkipSign) {
    if ($SignTool -eq '') {
        # The Windows SDK installs one signtool per SDK version under Windows Kits\10\bin\<version>\x64.
        $SignTool = Find-Newest "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe"
        if ($null -eq $SignTool) { throw 'signtool.exe was not found under the Windows SDK (Windows Kits\10\bin\<version>\x64); install the Windows SDK or pass -SignTool.' }
    }
    if (-not (Test-Path -LiteralPath $SignTool -PathType Leaf)) { throw "SignTool $SignTool does not exist." }

    if ($Dlib -eq '') {
        # The NuGet package was named Microsoft.Trusted.Signing.Client when this was written. The
        # service has since been renamed Azure Artifact Signing and the package may have followed;
        # that was not checked from here, so a copy under another name is passed with -Dlib.
        $Dlib = Find-Newest "$env:USERPROFILE\.nuget\packages\microsoft.trusted.signing.client\*\bin\x64\Azure.CodeSigning.Dlib.dll"
        if ($null -eq $Dlib) { throw 'Azure.CodeSigning.Dlib.dll was not found in the NuGet cache; install the Artifact Signing client package and pass its bin\x64\Azure.CodeSigning.Dlib.dll with -Dlib.' }
    }
    if (-not (Test-Path -LiteralPath $Dlib -PathType Leaf)) { throw "Dlib $Dlib does not exist." }

    # signing.json: the three names the Dlib needs, nothing else is read and nothing secret is in it.
    if (-not (Test-Path -LiteralPath $SigningConfig -PathType Leaf)) {
        throw "No signing configuration at $SigningConfig; copy signing.example.json to signing.json beside this script and fill in your own Endpoint, CodeSigningAccountName and CertificateProfileName."
    }
    $cfg = ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($SigningConfig))
    $Signing = [ordered]@{}
    foreach ($k in 'Endpoint', 'CodeSigningAccountName', 'CertificateProfileName') {
        $prop = $cfg.PSObject.Properties[$k]
        $v = ''
        if ($null -ne $prop -and $prop.Value -is [string]) { $v = $prop.Value.Trim() }
        if ($v -eq '' -or $v.Contains('<') -or $v.Contains('>')) {
            throw "$SigningConfig has no usable $k; copy signing.example.json to signing.json and replace its placeholders with your own names."
        }
        $Signing[$k] = $v
    }
}

# ---- version -------------------------------------------------------------------------------

$Version = [IO.File]::ReadAllText((Join-Path $HelperRoot 'VERSION')).Trim()
if ($Version -notmatch '^\d+\.0\.0$') { throw "helper/VERSION must be a whole-number version like 1.0.0, not $Version" }
Step "Building the Beethoven bridge $Version for $Target."

# ---- work folder ---------------------------------------------------------------------------
# Under the temp directory, removed at the end: it holds the compiled files and metadata.json, which
# names the signing account, and nothing else of ours ever goes there.

$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$Work = Join-Path $TempRoot ('beethoven-bridge-msi-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Force -Path $Work
$TargetDir = Join-Path $Work 'target'
$Stage = Join-Path $Work 'stage'
$Msi = Join-Path $Work $MsiName
$null = New-Item -ItemType Directory -Force -Path $Stage

try {
    # ---- build -----------------------------------------------------------------------------

    Step "Compiling with cargo (release) into the work folder $Work."
    # The MSVC target links the C runtime as DLLs unless told otherwise, and one of them,
    # VCRUNTIME140.dll, comes only with the Visual C++ Redistributable, which the MSI does not install
    # and a fresh Windows lacks; crt-static links the runtime into the exe, as the Mac route's
    # mingw-w64 build carries its own. RUSTFLAGS is extended, not replaced, and put back afterwards.
    $savedRustFlags = $env:RUSTFLAGS
    if ($Target -like '*-msvc') {
        if ($env:CARGO_ENCODED_RUSTFLAGS) { throw 'CARGO_ENCODED_RUSTFLAGS is set, so cargo would ignore the static C runtime this build adds through RUSTFLAGS; unset it and run again.' }
        $env:RUSTFLAGS = ("$savedRustFlags -C target-feature=+crt-static").Trim()
    }
    Push-Location -LiteralPath $RustDir
    try {
        Run 'cargo build' 'cargo' @('build', '--release', '--target', $Target, '--target-dir', $TargetDir)
    } finally {
        Pop-Location
        $env:RUSTFLAGS = $savedRustFlags
    }
    $BuiltExe = [IO.Path]::Combine($TargetDir, $Target, 'release', $ExeName)
    if (-not (Test-Path -LiteralPath $BuiltExe -PathType Leaf)) { throw "cargo build finished but $BuiltExe is not there." }

    # ---- stage -----------------------------------------------------------------------------

    Step "Staging $ExeName, the host manifest and README.txt."
    $StagedExe = Join-Path $Stage $ExeName
    Copy-Item -LiteralPath $BuiltExe -Destination $StagedExe -Force
    Copy-Item -LiteralPath $PayloadReadme -Destination (Join-Path $Stage 'README.txt') -Force
    # The same text install.ps1 writes, with the one difference the MSI needs: a relative path, so
    # the file is the same for every account and carries no user name.
    $manifest = "{`n" +
        "  `"name`": `"$HostName`",`n" +
        "  `"description`": `"The Beethoven bridge: carries Beethoven's encrypted ssh connection to the grid.`",`n" +
        "  `"path`": `"$ExeName`",`n" +
        "  `"type`": `"stdio`",`n" +
        "  `"allowed_origins`": [`"$Origin`"]`n" +
        "}`n"
    [IO.File]::WriteAllText((Join-Path $Stage "$HostName.json"), $manifest, $Utf8)

    # ---- sign the exe ----------------------------------------------------------------------

    $MetadataPath = Join-Path $Work 'metadata.json'
    if (-not $SkipSign) {
        # The Dlib reads its account from this file; a fresh CorrelationId ties the two signatures of
        # one build together in the service's own log. The file is written and handed over, never
        # shown: its contents are the maintainer's account names.
        $meta = [ordered]@{
            Endpoint = $Signing['Endpoint']
            CodeSigningAccountName = $Signing['CodeSigningAccountName']
            CertificateProfileName = $Signing['CertificateProfileName']
            CorrelationId = [Guid]::NewGuid().ToString()
        }
        [IO.File]::WriteAllText($MetadataPath, (ConvertTo-Json -InputObject $meta -Depth 2), $Utf8)

        Step "Signing $ExeName through Azure Artifact Signing (SHA-256, timestamped)."
        Run 'signing the exe' $SignTool @('sign', '/v', '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256', '/dlib', $Dlib, '/dmdf', $MetadataPath, $StagedExe)
    } else {
        Step "Not signing $ExeName (-SkipSign)."
    }

    # ---- build the MSI ---------------------------------------------------------------------
    # WiX v5's command line; Package.wxs uses core elements only, so no WiX extension is needed.

    Step "Building $MsiName with WiX from Package.wxs in the work folder."
    Run 'wix build' $Wix @('build', '-arch', 'x64', '-d', "StageDir=$Stage", '-d', "Version=$Version", $Wxs, '-o', $Msi)
    if (-not (Test-Path -LiteralPath $Msi -PathType Leaf)) { throw "wix build finished but $Msi is not there." }

    # ---- sign and verify the MSI -----------------------------------------------------------

    if (-not $SkipSign) {
        Step "Signing $MsiName the same way."
        Run 'signing the MSI' $SignTool @('sign', '/v', '/fd', 'SHA256', '/tr', $TimestampUrl, '/td', 'SHA256', '/dlib', $Dlib, '/dmdf', $MetadataPath, $Msi)

        Step 'Verifying both signatures against the Windows Authenticode policy.'
        Run 'verifying the exe' $SignTool @('verify', '/pa', '/v', $StagedExe)
        Run 'verifying the MSI' $SignTool @('verify', '/pa', '/v', $Msi)
    }

    # ---- output ----------------------------------------------------------------------------
    # Only a signed and verified MSI (or a trial, into its own folder) reaches OutDir.

    $null = New-Item -ItemType Directory -Force -Path $OutDir
    Step "Copying $MsiName to $OutDir."
    Copy-Item -LiteralPath $Msi -Destination $FinalMsi -Force

    if (-not $SkipSign) {
        # ---- sidecar -----------------------------------------------------------------------
        # What node helper/build.mjs checks before the MSI enters the extension: the same helper
        # version and protocol, the file's own size and hash, the origins it was built for.

        Step "Writing the sidecar $MsiName.json."
        $msiItem = Get-Item -LiteralPath $FinalMsi
        $signToolVersion = ''
        try { $signToolVersion = [string]([Version](Get-Item -LiteralPath $SignTool).Directory.Parent.Name) } catch { $signToolVersion = '' }
        if ($signToolVersion -eq '') { $signToolVersion = [string](Get-Item -LiteralPath $SignTool).VersionInfo.ProductVersion }
        $sidecar = [ordered]@{
            name = $MsiName
            os = 'windows'
            kind = 'binary'
            helper = $Version
            protocol = [int]1
            size = [long]$msiItem.Length
            sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $FinalMsi).Hash.ToLowerInvariant()
            allowed_origins = @($Origin)
            signed = 'authenticode'
            built_at = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
            tools = [ordered]@{
                rustc = ((& rustc --version) -join ' ').Trim()
                signtool = $signToolVersion
                wix = ((& $Wix --version) -join ' ').Trim()
                windows = [System.Environment]::OSVersion.VersionString
            }
        }
        $json = (ConvertTo-Json -InputObject $sidecar -Depth 4).Replace("`r`n", "`n") + "`n"
        [IO.File]::WriteAllText("$FinalMsi.json", $json, $Utf8)

        Step "Done: $FinalMsi and its sidecar are ready for helper/signed; node helper/build.mjs --store-id picks them up from there."
    } else {
        Step "Done: $FinalMsi is built but unsigned and has no sidecar, in a folder of its own that the extension's build never reads; this file is for trying the installer here and must never ship."
    }
} finally {
    # Only our own work folder, created above under the temp directory, is ever removed.
    if ($Work.StartsWith($TempRoot) -and (Test-Path -LiteralPath $Work -PathType Container)) {
        Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
