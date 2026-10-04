# The Windows installer of the Beethoven bridge (binary edition)

`build-msi.ps1` builds `beethoven-bridge-windows.msi`: the bridge's binary edition
(`helper/src/rust`, the same helper 1.0.0 and protocol 1 as the script zips; its hello says
`"kind":"binary","runtime":"rust"`) as a per-user MSI, Authenticode-signed through Azure Artifact
Signing (formerly Trusted Signing). It runs only on the maintainer's own Windows machine. CI builds
unsigned rust artifacts for maintainers and nothing here; no identity, certificate, token, key file
or account secret enters the repository.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## What the package does on a student's computer

- Installs for the one Windows account that opens it, with no administrator rights (WiX
  `Scope="perUser"`): `beethoven-bridge.exe`, `com.openspineconsortium.beethoven.bridge.json` and
  `README.txt` in `%LOCALAPPDATA%\Beethoven\bridge\`.
- The host manifest's `"path"` is the relative `beethoven-bridge.exe`, which Chrome allows on Windows
  (it resolves it against the manifest's folder), so the same file serves every account. Its
  `allowed_origins` is the one origin baked in at build time from `-StoreId`.
- Writes the default value of `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openspineconsortium.beethoven.bridge`
  and of the same key under `HKCU\Software\Microsoft\Edge\...` to the manifest's full path, plus
  one marker value per component under `HKCU\Software\OpenSpineConsortium\Beethoven bridge` (the
  per-user key paths Windows Installer wants for files under the user profile, ICE38). Nothing
  under HKLM; no custom action; no service, shortcut or startup entry.
- Uninstall: Settings > Apps > "Beethoven bridge" > Uninstall removes the three files, the folder
  and every value above. An older bridge is replaced in place (`MajorUpgrade`); a newer one already
  installed refuses the downgrade.

The payload's `README.txt` here is the student text installed beside the exe.

## Running it

From a Windows PowerShell 5.1 or PowerShell 7 prompt on the releasing machine, signed in to Azure
(for example `az login`) with the identity that may sign with the certificate profile:

```
powershell -ExecutionPolicy Bypass -File helper\release\windows\build-msi.ps1 -StoreId <32 letters a-p>
```

Each step prints one line saying what it does. The output is `helper\signed\beethoven-bridge-windows.msi`
and `helper\signed\beethoven-bridge-windows.msi.json`, the sidecar. `helper/signed/` is gitignored;
`node helper/build.mjs` reads the sidecar, checks the file against it and copies the package into
`extension/public/bridge/` with a manifest entry. Copy both files into `helper/signed/` on the
machine that builds the extension when that is another one.

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

### What the maintainer must have

- An Azure subscription with an Artifact Signing account, identity validation completed, and a
  certificate profile (public trust) in it; the signing identity holds the Certificate Profile
  Signer role on that account.
- The Artifact Signing client package (its `Azure.CodeSigning.Dlib.dll`), in the NuGet cache or
  anywhere `-Dlib` can point at.
- `signtool.exe` from the Windows SDK (Windows Kits 10).
- WiX v5 as a .NET tool. `Package.wxs` uses core elements only, so no WiX extension is installed or
  referenced.
- The Rust toolchain through rustup with the `x86_64-pc-windows-msvc` target, which needs the
  Visual Studio Build Tools (MSVC and a Windows SDK).
- An Entra sign-in on the machine, for example `az login`; the Dlib uses the signed-in identity.

### What the script never does

- It holds no key, certificate, token or password, and takes none as a parameter; the only signing
  inputs are the three account names in the gitignored `signing.json` and the maintainer's own
  Entra sign-in.
- It puts no secret on a command line: signtool is handed `/dlib <dll> /dmdf <metadata.json>`, and
  `metadata.json` (Endpoint, CodeSigningAccountName, CertificateProfileName, a fresh CorrelationId)
  is written to the script's own temp work folder, never printed, and removed with that folder at
  the end.
- It deletes nothing but that work folder, which it created itself under the temp directory.
- Nothing in it runs in CI.

### The signing and build lines, as the script runs them

```
signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib <Azure.CodeSigning.Dlib.dll> /dmdf <metadata.json> <file>
wix build -arch x64 -d StageDir=<stage> -d Version=<helper version> Package.wxs -o <OutDir>\beethoven-bridge-windows.msi
signtool verify /pa /v <file>
```

The exe is signed first, then packaged, then the MSI is signed and both are verified.

### The sidecar

`beethoven-bridge-windows.msi.json`, UTF-8 without BOM, LF:

```
{"name":"beethoven-bridge-windows.msi","os":"windows","kind":"binary","helper":"1.0.0","protocol":1,
 "size":<bytes>,"sha256":"<64 lower-case hex>","allowed_origins":["chrome-extension://<id>/"],
 "signed":"authenticode","built_at":"<ISO 8601 UTC>",
 "tools":{"rustc":"<rustc --version>","signtool":"<SDK version folder>","wix":"<wix --version>","windows":"<OS version>"}}
```

`node helper/build.mjs` refuses a sidecar whose helper differs from `helper/VERSION`, whose protocol
is not 1, whose size or sha256 differ from the file's, whose origins are empty, malformed or (with
`--store-id`) not the given one, or whose `signed` is not `authenticode`.

## SmartScreen

The signature lets Windows check who made the file. A publisher new to Microsoft SmartScreen may
still see "Windows protected your PC" on the first downloads until the certificate has built
reputation; the student then chooses More info, then Run anyway, as the panel's step says. Whether
Artifact Signing's public-trust certificates skip that wait for this package is not yet measured.

## Not yet measured

Nothing here has been run on a Windows machine yet. In particular:

- The script has not been run end to end: cargo for the MSVC target, signtool with the Dlib, WiX v5
  on `Package.wxs` (ICE validation included), and the two verifications.
- No MSI has been installed, upgraded or uninstalled on a Windows machine, and Chrome has not been
  seen to start the installed `beethoven-bridge.exe` through the relative `"path"`.
- Edge's `NativeMessagingHosts` key has not been seen to be read by Edge for this host.
- The SmartScreen outcome above.
- The NuGet package's current name after the rename to Azure Artifact Signing, and whether its
  Dlib still sits at `bin\x64\Azure.CodeSigning.Dlib.dll`.
- Windows on ARM is not built: the package is x64 only, and whether the x64 exe runs under
  emulation there is not yet measured.

The tests in `extension/test/releaseWindows.test.ts` check the files statically (balanced XML,
the per-user scope, the two HKCU keys, no HKLM, the parameters and the signing lines, no secret
shape anywhere, LF and ASCII) and, where `pwsh` is on PATH on Linux, run `build-msi.ps1 -SkipSign`
against stand-ins for cargo, rustup and wix and check that it writes no sidecar.
