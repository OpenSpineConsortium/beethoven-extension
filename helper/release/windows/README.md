# The Windows installer of the Beethoven bridge (binary edition)

`beethoven-bridge-windows.msi` is the bridge's binary edition (`helper/src/rust`, the same helper
1.0.0 and protocol 1 as the script zips; its hello says `"kind":"binary","runtime":"rust"`) as a
per-user MSI, Authenticode-signed through Azure Artifact Signing (formerly Trusted Signing). It is
built on the maintainer's own machine, and there are two ways to build it that leave the same two
files:

- **On the Mac (the usual way):** `build-msi-mac.sh` cross-builds the exe with Rust and the
  mingw-w64 linker, builds the MSI from `bridge.wxs` with msitools' `wixl`, and signs both files
  with `jsign` through the same Artifact Signing account. `bash helper/release/release.sh` runs it
  with the names from `release.json` in the vendor folder (`../README.md`). It needs no Windows
  machine, but whether Artifact Signing accepts a signature request from a Mac is not yet measured,
  so keep the Windows machine until one release has gone through this way.
- **On a Windows machine (the fallback):** `build-msi.ps1` builds the exe with the MSVC toolchain,
  the MSI from `Package.wxs` with WiX v5, and signs with `signtool` and the Artifact Signing client,
  with the names from the gitignored `signing.json` beside it.

`Package.wxs` and `bridge.wxs` are one package written twice, once for WiX v5 and once in the WiX v3
schema `wixl` reads; they change together, and `extension/test/releaseWindowsMac.test.ts` holds them
equal. CI builds unsigned rust artifacts for maintainers and nothing here; no identity, certificate,
token, key file or account secret enters the repository.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## What the package does on a student's computer

- Installs for the one Windows account that opens it, with no administrator rights (WiX
  `Scope="perUser"`, `InstallScope="perUser"` in `bridge.wxs`): `beethoven-bridge.exe`,
  `com.openspineconsortium.beethoven.bridge.json` and `README.txt` in
  `%LOCALAPPDATA%\Beethoven\bridge\`.
- The host manifest's `"path"` is the relative `beethoven-bridge.exe`, which Chrome allows on Windows
  (it resolves it against the manifest's folder), so the same file serves every account. Its
  `allowed_origins` is the one origin baked in at build time from the store identifier.
- Writes the default value of `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openspineconsortium.beethoven.bridge`
  and of the same key under `HKCU\Software\Microsoft\Edge\...` to the manifest's full path, plus
  one marker value per component under `HKCU\Software\OpenSpineConsortium\Beethoven bridge` (the
  per-user key paths Windows Installer wants for files under the user profile, ICE38). Nothing
  under HKLM; no custom action; no service, shortcut or startup entry.
- Uninstall: Settings > Apps > "Beethoven bridge" > Uninstall removes the three files, the folder
  and every value above. An older bridge is replaced in place (`MajorUpgrade`); a newer one already
  installed refuses the downgrade.

The payload's `README.txt` here is the student text installed beside the exe.

## On the Mac: build-msi-mac.sh

### What the Mac must have

All of it from Homebrew, except Rust:

```
rustup target add x86_64-pc-windows-gnu
brew install mingw-w64 msitools osslsigncode azure-cli
brew install jsign            # or: jsign.jar from Maven Central (net.jsign:jsign) in the vendor folder, with java (below)
```

- `mingw-w64` is the linker Rust uses for the Windows exe (`x86_64-w64-mingw32-gcc`) and the
  `x86_64-w64-mingw32-objdump` the script reads the exe's imports with.
- `msitools` gives `wixl` (builds the MSI) and `msiinfo` (reads its tables back).
- `jsign` signs PE and MSI files from any system; its `TRUSTEDSIGNING` store type is the Artifact
  Signing service. The script runs the command in `JSIGN` if that is set (for example
  `JSIGN="java -jar /path/jsign.jar"`), else `jsign` on PATH, else `java -jar` on a jar in the vendor
  folder: `<vendor>/jsign.jar`, else the first `<vendor>/jsign/*.jar` (the two places the release's
  setup check, `setup-mac.sh`, accepts too). The vendor folder is `BEETHOVEN_VENDOR_DIR`, else
  `ASHLEY_VENDOR_DIR`, else `~/.beethoven-vendor`. `JSIGN` is split at spaces and its quotes are not
  read, so a jar whose path has a space goes in the vendor folder instead, whose path may have
  spaces; the script refuses such a `JSIGN` before anything is built.
- Java, for the jar: `brew install openjdk`. Homebrew keeps it off PATH, and macOS's `/usr/bin/java`
  is only a stub until a Java runtime is registered, so also run the line brew prints,
  `sudo ln -sfn "$(brew --prefix)/opt/openjdk/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk.jdk`,
  or put `"$(brew --prefix openjdk)/bin"` first on PATH. The script checks that `java -version` runs
  before anything is built.
- `osslsigncode` reads each signature back.
- `az` (azure-cli), signed in with `az login` as the identity that holds the certificate profile's
  signer role.
- The Artifact Signing account and its certificate profile, the same ones the Windows route uses
  (see below).

### Running it

From the repository root:

```
bash helper/release/windows/build-msi-mac.sh --store-id <32 letters a-p> \
  --azure-endpoint <region>.codesigning.azure.net --azure-account <account> --azure-profile <profile>
```

The three Azure names are the maintainer's own and live in the vendor folder, never in the
repository; the one-command release on the Mac reads them from there and passes them in. The
endpoint may be given as the portal shows it (`https://<region>.codesigning.azure.net/`, in any
case); the script takes it down to the host in lower case. The account's name is letters, digits and
hyphens, the profile's may also hold `_`, as the release's config accepts; which names Azure itself
allows is not yet measured.

Each step prints one line saying what it does. The output is `helper/signed/beethoven-bridge-windows.msi`
and `helper/signed/beethoven-bridge-windows.msi.json`, the sidecar, which `node helper/build.mjs`
reads before it copies the MSI into `extension/public/bridge/`.

| Option | Meaning |
| --- | --- |
| `--store-id ID` | Required. The published extension's identifier, 32 letters a to p, as the Chrome Web Store developer dashboard shows it. Baked into the host manifest as the only allowed origin. |
| `--azure-endpoint HOST` | Required unless `--no-sign`. The account's endpoint host, like `<region>.codesigning.azure.net`. |
| `--azure-account NAME` | Required unless `--no-sign`. The Artifact Signing account. |
| `--azure-profile NAME` | Required unless `--no-sign`. The certificate profile in that account. |
| `--no-sign` | A trial: builds and checks everything but signs nothing, writes the MSI to `<out>/trial`, writes no sidecar, and says that the output must never ship. |
| `--out DIR` | Where the MSI and its sidecar go. Default: `helper/signed`. |
| `--keep-work` | Keep the work folder (under `$TMPDIR`) instead of removing it. |

Exit status: 2 an argument is wrong, 3 a tool is missing (the message names the Homebrew line that
fixes it), 4 a step did not produce what it should, 5 Azure refused or could not be reached.

### What it does, in order

1. Checks the tools, and that `az` can get a token for Artifact Signing (nothing is printed), so a
   lapsed sign-in is found before anything is built.
2. Reads `helper/VERSION`.
3. `cargo build --release --locked --target x86_64-pc-windows-gnu` into its own work folder, with
   `CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc`; the repository's `target/`
   is untouched.
4. Lists the exe's imported libraries with `objdump -p` and refuses any that is not one of Windows'
   own (a mingw runtime library such as `libwinpthread-1.dll` would keep the bridge from starting
   on a student's computer). On 2026-10-04, cross-built on Linux with Ubuntu's mingw-w64 11, whose C
   runtime is msvcrt, the bridge imported `KERNEL32`, `ntdll`, `msvcrt`, `WS2_32`,
   `bcryptprimitives` and `api-ms-win-core-synch`, all part of Windows. A mingw-w64 whose default C
   runtime is the Universal CRT (upstream's default since mingw-w64 12, and so likely Homebrew's)
   links the `api-ms-win-crt-*-l1-1-0` sets in place of `msvcrt`; the Universal CRT is part of
   Windows 10 and 11, and the script accepts those names (and `ucrtbase.dll`) too. Simulated on Linux
   by linking against the Universal CRT's import library: the bridge then imported eight
   `api-ms-win-crt-*` sets and no `msvcrt`, and the script went on.
5. Stages the exe, the host manifest (the same bytes `build-msi.ps1` writes) and `README.txt`.
6. Signs the exe: `jsign --storetype TRUSTEDSIGNING --keystore <endpoint> --alias <account>/<profile>
   --storepass env:<variable> --alg SHA-256 --tsaurl http://timestamp.acs.microsoft.com --tsmode RFC3161`,
   then checks the signature with `osslsigncode verify`: a signature is there, its digest is the
   file's own, and it carries a timestamp. Whether osslsigncode on the Mac can also follow the chain
   to Microsoft's root is printed and does not decide (not yet measured; Windows checks the chain
   against its own roots).
7. Builds the MSI with `wixl -a x64 -D Version=<version> -D StageDir=<stage> bridge.wxs` and refuses
   any warning: `wixl` warns about an attribute it does not know and then leaves it out, and the MSI
   it writes would look right and not be this package.
8. Reads the MSI back with `msiinfo`: six registry values, all under `HKEY_CURRENT_USER` (Root 1),
   the Chrome and Edge `NativeMessagingHosts` default values set to the manifest's path, the two
   `MajorUpgrade` rows on the package's UpgradeCode, no `ALLUSERS` property, the summary's "no
   administrator rights" bit, x64, and the three files at their staged sizes.
9. Signs the MSI the same way and checks that signature.
10. Copies the MSI to `--out` and writes the sidecar. The MSI reaches `--out` only after every
    check, so a refused signature leaves nothing for a build to pick up.

### The access token

The only credential is an Entra access token for the maintainer's own sign-in. For each of the two
signatures the script asks `az account get-access-token --resource https://codesigning.azure.net
--query accessToken --output tsv`, whose answer goes straight into a shell variable through a pipe;
the variable is exported for the one `jsign` call, which reads it with `--storepass env:<variable>`,
and it is unset the moment `jsign` returns. The token is never an argument of any program, never in
a file, never printed, and no other tool runs while it is in the environment. The three Azure names
are arguments to `jsign` (`--keystore`, `--alias`); they name the account and are not secrets, the
same as the certificate names `build-pkg.sh` gives `codesign`.

## On a Windows machine: build-msi.ps1

From a Windows PowerShell 5.1 or PowerShell 7 prompt on the releasing machine, signed in to Azure
(for example `az login`) with the identity that may sign with the certificate profile:

```
powershell -ExecutionPolicy Bypass -File helper\release\windows\build-msi.ps1 -StoreId <32 letters a-p>
```

Each step prints one line saying what it does. The output is `helper\signed\beethoven-bridge-windows.msi`
and `helper\signed\beethoven-bridge-windows.msi.json`, the same two files the Mac route writes. Copy
both into `helper/signed/` on the machine that builds the extension when that is another one.

### Parameters

| Parameter | Default | Meaning |
| --- | --- | --- |
| `-StoreId` | required | The published extension's identifier, 32 letters a to p, as the Chrome Web Store developer dashboard shows it. Baked into the manifest as the only allowed origin. Anything else is refused in one sentence. |
| `-SigningConfig` | `signing.json` beside the script | JSON with `Endpoint`, `CodeSigningAccountName` and `CertificateProfileName`. Absent, incomplete or still holding the example's placeholders: the script stops and names `signing.example.json`. |
| `-SignTool` | the newest `signtool.exe` under `%ProgramFiles(x86)%\Windows Kits\10\bin\<version>\x64\` | signtool from the Windows SDK. None found: the script stops. |
| `-Dlib` | the newest `Azure.CodeSigning.Dlib.dll` under `%USERPROFILE%\.nuget\packages\microsoft.trusted.signing.client\<version>\bin\x64\` | The Artifact Signing client's signtool plug-in. The NuGet package may have followed the service's rename; that was not checked from here, so pass the path when the default finds nothing. |
| `-Wix` | `wix` on PATH | The WiX v5 command (`dotnet tool install --global wix`). |
| `-OutDir` | the repository's `helper\signed` | Where the MSI and its sidecar go. |
| `-Target` | `x86_64-pc-windows-msvc` | The Rust target. The MSI is built `-arch x64`, so only an `x86_64-pc-windows-*` target is accepted. |
| `-SkipSign` | off | A trial build: compiles and packages without signtool, the Dlib or `signing.json`, writes no sidecar, and says that the output must never ship. |

### What the Windows machine must have

- The Artifact Signing client package (its `Azure.CodeSigning.Dlib.dll`), in the NuGet cache or
  anywhere `-Dlib` can point at.
- `signtool.exe` from the Windows SDK (Windows Kits 10).
- WiX v5 as a .NET tool. `Package.wxs` uses core elements only, so no WiX extension is installed or
  referenced.
- The Rust toolchain through rustup with the `x86_64-pc-windows-msvc` target, which needs the
  Visual Studio Build Tools (MSVC and a Windows SDK).
- An Entra sign-in on the machine, for example `az login`; the Dlib uses the signed-in identity.

### The signing and build lines, as the script runs them

```
signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib <Azure.CodeSigning.Dlib.dll> /dmdf <metadata.json> <file>
wix build -arch x64 -d StageDir=<stage> -d Version=<helper version> Package.wxs -o <OutDir>\beethoven-bridge-windows.msi
signtool verify /pa /v <file>
```

The exe is signed first, then packaged, then the MSI is signed and both are verified.
`metadata.json` (Endpoint, CodeSigningAccountName, CertificateProfileName, a fresh CorrelationId) is
written to the script's own temp work folder, never printed, and removed with that folder at the end.

## The Artifact Signing account (both routes)

- An Azure subscription with an Artifact Signing account, identity validation completed, and a
  certificate profile (public trust) in it; the signing identity holds the Certificate Profile
  Signer role on that account.
- The account's names (endpoint, account, certificate profile) are the maintainer's own: in
  `release.json` in the vendor folder for the Mac route (`windows.azure_endpoint`,
  `windows.azure_account`, `windows.azure_profile`; `../release.example.json` shows the shape), in
  the gitignored `signing.json` beside `build-msi.ps1` for the Windows route (`Endpoint`,
  `CodeSigningAccountName`, `CertificateProfileName`; `signing.example.json` shows the shape). Both
  examples hold placeholders only, and each names the other.

## What neither script does

- Holds a key, a certificate, a token or a password, or takes one as a parameter; the only signing
  inputs are the account's names and the maintainer's own Entra sign-in.
- Puts a secret on a command line, in a file or in its output.
- Deletes anything but its own work folder, which it created itself under the temp directory.
- Runs in CI.

## The sidecar

`beethoven-bridge-windows.msi.json`, UTF-8 without BOM, LF:

```
{"name":"beethoven-bridge-windows.msi","os":"windows","kind":"binary","helper":"1.0.0","protocol":1,
 "size":<bytes>,"sha256":"<64 lower-case hex>","allowed_origins":["chrome-extension://<id>/"],
 "signed":"authenticode","built_at":"<ISO 8601 UTC>","tools":{...}}
```

`tools` records what built the file: from the Mac `rustc`, `mingw`, `wixl`, `jsign`, `osslsigncode`,
`macos` and `system`; from Windows `rustc`, `signtool`, `wix` and `windows`. `node helper/build.mjs`
refuses a sidecar whose helper differs from `helper/VERSION`, whose protocol is not 1, whose size
or sha256 differ from the file's, whose origins are empty, malformed or (with `--store-id`) not the
given one, or whose `signed` is not `authenticode`; it does not read `built_at` or `tools`.

## SmartScreen

The signature lets Windows check who made the file. A publisher new to Microsoft SmartScreen may
still see "Windows protected your PC" on the first downloads until the certificate has built
reputation; the student then chooses More info, then Run anyway, as the panel's step says. Whether
Artifact Signing's public-trust certificates skip that wait for this package is not yet measured.

## Not yet measured

Nothing here has been run on a Mac or on a Windows machine yet, and Artifact Signing has not been
asked for a signature. In particular:

- `build-msi-mac.sh` has run end to end only on Linux (2026-10-04): the real cross-build, the real
  `wixl` and `msiinfo`, and, by hand, the real `jsign` and `osslsigncode` signing and reading back an
  exe and an MSI with a throwaway certificate and a local timestamp server. On a Mac none of it has
  run: the Homebrew formulas named above (that `jsign` and `msitools` are there under those names
  included), the bash 3.2 that macOS ships, and the Homebrew `wixl` staying silent on a clean build.
- Which C runtime Homebrew's mingw-w64 links (the Universal CRT is likely; the script accepts it and
  msvcrt alike), and that an exe linked against the Universal CRT starts on Windows: no such exe of
  the bridge has run on Windows.
- That Homebrew's `openjdk` with the `ln -sfn` line above makes `/usr/bin/java` run jsign's jar.
- That Artifact Signing accepts `jsign`'s `TRUSTEDSIGNING` request with an `az` token from a Mac,
  and that Microsoft's timestamp server answers `jsign`'s RFC 3161 request.
- Whether osslsigncode on the Mac follows the certificate chain to Microsoft's root (the script
  prints its verdict and does not depend on it).
- That Windows Installer installs, upgrades and uninstalls the `wixl`-built MSI as it would the WiX v5
  one. `wixl` writes a smaller standard action sequence than WiX does (only the actions the package's
  tables need), it signs without the optional `MsiDigitalSignatureEx` stream that `signtool` adds,
  and the MSI it writes has not been run through Windows Installer's ICE validation.
- `build-msi.ps1` has not been run end to end: cargo for the MSVC target, signtool with the Dlib, WiX
  v5 on `Package.wxs` (ICE validation included), and the two verifications.
- No MSI has been installed, upgraded or uninstalled on a Windows machine, and Chrome has not been
  seen to start the installed `beethoven-bridge.exe` through the relative `"path"`.
- Edge's `NativeMessagingHosts` key has not been seen to be read by Edge for this host.
- The SmartScreen outcome above.
- The NuGet package's current name after the rename to Azure Artifact Signing, and whether its
  Dlib still sits at `bin\x64\Azure.CodeSigning.Dlib.dll`.
- Windows on ARM is not built: the package is x64 only, and whether the x64 exe runs under
  emulation there is not yet measured.

The tests in `extension/test/releaseWindows.test.ts` check the Windows route's files statically and,
where `pwsh` is on PATH on Linux, run `build-msi.ps1 -SkipSign` against stand-ins.
`extension/test/releaseWindowsMac.test.ts` holds `bridge.wxs` equal to `Package.wxs`, runs every
refusal of `build-msi-mac.sh`, builds a trial MSI with the real `wixl` and reads every table back
with `msiinfo`, runs a signed build against stand-ins for `az`, `jsign` and `osslsigncode` (the token
must reach `jsign`'s environment and nothing else) whose sidecar `helper/build.mjs` must accept, and,
where the Windows target and mingw-w64 are installed, cross-builds the real exe and checks its
imports.
