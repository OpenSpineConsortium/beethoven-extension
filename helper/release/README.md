# Releasing the signed bridge installers

The maintainer's runbook for the two signed packages Windows and macOS students get on a store build
of Beethoven: `beethoven-bridge-mac.pkg` and `beethoven-bridge-windows.msi`. Both are the bridge's
binary edition (`helper/src/rust/`, helper 1.0.0, protocol 1; its hello says `"kind":"binary"`,
`"runtime":"rust"`), built, signed and packaged **only on the maintainer's own machines** by the
scripts in this folder, never in CI. Linux, and a development build on any system, keep the script
zips `helper/build.mjs` writes from `helper/src/`.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## What never enters the repository or CI

- Any identity: the Developer ID certificates and their private keys, the Apple team identifier, the
  notarization keychain profile and the app-specific password or App Store Connect key behind it, the
  Azure subscription, the Artifact Signing account name, the certificate profile name and its endpoint,
  the Entra sign-in. The Windows account names live in `helper/release/windows/signing.json`, which
  `.gitignore` keeps out; only the committed example beside it, with placeholders, is tracked.
- The signed packages and their sidecars (`helper/signed/`, gitignored).
- The `.pkg` and `.msi` a release build copies into `extension/public/bridge/` (gitignored there), and
  the `manifest.json` a release build writes beside them, which lists the signed entries and is
  restored before any commit (last step below). The tracked `manifest.json` lists the three zips only.
- CI stays as it is: its rust lane builds unsigned binaries for maintainers and collaborators, and the
  suite job proves the tracked zips and manifest are a fresh build of `helper/src`
  (`node ../helper/build.mjs --check --no-signed`). No token, key file or account secret is a CI
  secret, and nothing in CI signs.

## Where the store item identifier is read

Both scripts take `--store-id <id>`, required: the 32 letters `a` to `p` that identify the published
Beethoven. Read it in the Chrome Web Store developer dashboard, on the item (it is also the "ID" a
copy installed from the store shows in `chrome://extensions` with Developer mode on). The scripts bake
`allowed_origins = ["chrome-extension://<id>/"]` into the package, so Chrome starts the installed
bridge for that Beethoven and no other. A development build, whose identifier the packages do not
name, is never offered them: the page compares the manifest entry's origins with `chrome.runtime.id`
and falls back to the script zip, as before. Give the scripts the store's identifier, never a
development build's.

## Prerequisites

### The Mac

- Xcode command line tools (`xcode-select --install`): `codesign`, `lipo`, `pkgbuild`,
  `productbuild`, `xcrun notarytool`, `xcrun stapler`.
- `rustup` with both targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`. The
  two builds are joined with `lipo` into one universal binary.
- Apple Developer Program membership, with the two certificates in the login keychain:
  **Developer ID Application** (signs the binary, with the hardened runtime and a timestamp) and
  **Developer ID Installer** (signs the package).
- One time, the notarization profile: `xcrun notarytool store-credentials <profile>`. It asks for the
  Apple ID, the team identifier and an app-specific password, or for an App Store Connect API key;
  they go into the keychain under that profile name and nowhere else. The script submits with
  `xcrun notarytool submit ... --keychain-profile <profile> --wait` and staples the ticket with
  `xcrun stapler staple`. The profile name is the script's parameter; see its header for the default.

### The Windows machine

- The Rust MSVC toolchain (`rustup`, target `x86_64-pc-windows-msvc`; the Visual Studio Build Tools
  it needs).
- The Windows SDK's `signtool.exe`. Signing goes through its `/dlib` switch, which needs a recent
  SDK; which version first carried it is not checked from here, so if `signtool` does not know
  `/dlib`, update the SDK.
- WiX v5: `dotnet tool install --global wix`. The package is per-user (`Scope="perUser"`), so no
  administrator rights are asked and it is removed from Settings > Apps > "Beethoven bridge" >
  Uninstall.
- An Azure subscription with an **Artifact Signing** account (the service was called Trusted Signing
  until its rename), identity validation completed and a certificate profile under it. The signing
  itself is done by the service; no certificate or key is ever on this machine.
- The Dlib package the service's signtool integration needs. It was published on NuGet as
  `Microsoft.Trusted.Signing.Client` and may have followed the rename; this is not checked from here,
  which is why the script takes the path of `Azure.CodeSigning.Dlib.dll` as a parameter instead of
  guessing a folder. See the script's header.
- An Entra sign-in with rights on the signing account (the "Trusted Signing Certificate Profile
  Signer" role, as the service's documents named it), made in the same session as the build, for
  example with `az login`. The sign-in is the maintainer's own; the script never takes a key file,
  a client secret or a token.
- `helper/release/windows/signing.json`, copied from the committed example beside it and filled with
  the account's `Endpoint`, `CodeSigningAccountName` and `CertificateProfileName`. The script writes
  them into the `metadata.json` that `signtool sign /fd SHA256 /tr http://timestamp.acs.microsoft.com
  /td SHA256 /dlib <Azure.CodeSigning.Dlib.dll> /dmdf <metadata.json>` reads, and signs the
  executable first and the MSI after it.

### The machine that releases

Node 22 and the repository checkout, with the extension's `npm ci` done. Any of the three machines
can be it; the signed pairs are copied to it over whatever the maintainer trusts (the sidecars carry
the size and SHA-256, and `build.mjs` refuses a file that does not match them).

## The order

1. **On the Mac:** from the repository root, `bash helper/release/mac/build-pkg.sh --store-id <id>`.
   It builds the two targets, joins them, codesigns the binary with "Developer ID Application" plus
   `--options runtime --timestamp`, assembles the payload (`beethoven-bridge`, `uninstall.command`,
   `README.txt`, `allowed_origins.json`), builds the package with a `distribution.xml` that allows the
   current user's home only (`enable_currentUserHome="true"`, the other two domains `false`), signs it
   with "Developer ID Installer", notarizes, staples, and leaves `beethoven-bridge-mac.pkg` and
   `beethoven-bridge-mac.pkg.json` in `helper/signed/`. The package's postinstall writes the browser's
   host file for Chrome (always) and for Microsoft Edge and Chromium (when that browser's folder exists)
   under the user's home, with the absolute path of the installed bridge, and deletes nothing.
2. **On Windows:** from the repository root in PowerShell, `helper\release\windows\build-msi.ps1
   -StoreId <id>` (the parameter spelling is the script's; see its header). It builds
   `beethoven-bridge.exe` for x64, signs it, builds the per-user MSI with WiX v5 (files in
   `%LOCALAPPDATA%\Beethoven\bridge\`: the executable, the host file whose `path` is the relative
   `beethoven-bridge.exe`, which Chrome allows on Windows, and `README.txt`; the default values of the
   Chrome and Edge `NativeMessagingHosts` keys under `HKCU` set to the host file's full path), signs
   the MSI, and leaves `beethoven-bridge-windows.msi` and `beethoven-bridge-windows.msi.json` in
   `helper/signed/`.
3. **Copy both pairs** into `helper/signed/` on the machine that releases: four files, the two
   packages and the two sidecars, nothing else in that folder.
4. **Run the extension's checks first**, while `extension/public/bridge/` is still the tracked
   build: from `extension/`, `npx tsc --noEmit` and `npx vitest run`. The suite's bridge tests read
   the packaged zips and expect the placeholder; after step 5 they would read a release build.
5. **Merge:** from the repository root, `node helper/build.mjs --store-id <id>`. It verifies each
   sidecar (helper version, protocol, size, SHA-256, origins equal to the store identifier, the way it
   is signed), copies the two packages into `extension/public/bridge/`, writes `manifest.json` with
   the three script entries first and the two signed entries after them, and prints one `NOTE: signed
   installer ...` line per package: name, system, the first twelve hex digits of the SHA-256 and the
   number of origins. Read both lines. The same `--store-id` also writes the identifier into the three
   zips' `allowed_origins.json`, as it always has. A refusal names the sidecar and the reason, in one
   sentence, and writes nothing.
6. **Package:** from `extension/`, `npm run zip`. The Chrome zip in `extension/.output/` carries
   `bridge/` with six files.
7. **Record the shipped files** in `release/<version>/` as earlier releases did (`release/14.0.0/`
   is the model): the Chrome zip, a `bridge/` folder with the six files from `extension/public/bridge/`
   and their own `SHA256SUMS.txt`, the guides, a `README.md` that says what was built, from which
   commit, with which tool versions (the sidecars' `tools` and `built_at` fields have them), what was
   checked and what is not proven, and a `SHA256SUMS.txt` over the folder.
8. **Restore the tracked files:** `git checkout -- extension/public/bridge/`. The manifest with the
   signed entries, and the zips with the store identifier written in, are never committed: the
   tracked build is the placeholder build that `node helper/build.mjs --check --no-signed` proves in
   CI. The `.pkg` and `.msi` stay in that folder until the next plain `node helper/build.mjs` removes
   them (it says so), and a plain `--check` names them until then. `git status` must show nothing
   under `extension/public/bridge/` before the commit.

## The sidecar

Each script writes, beside its package, `<name>.json`:

```
{"name":"beethoven-bridge-mac.pkg","os":"mac","kind":"binary","helper":"1.0.0","protocol":1,
 "size":<bytes>,"sha256":"<64 lower-case hex>","allowed_origins":["chrome-extension://<id>/"],
 "signed":"developer-id-notarized","built_at":"<ISO 8601 UTC>","tools":{"<tool>":"<version string>", ...}}
```

Windows: `"os":"windows"`, `beethoven-bridge-windows.msi`, `"signed":"authenticode"`. `build.mjs`
refuses a sidecar whose `helper` is not `helper/VERSION`, whose `protocol` is not 1, whose `size` or
`sha256` is not the file's, whose `name` has a character outside letters, digits, `.`, `_` and `-` or
does not end in `.pkg` (mac) or `.msi` (windows), whose origins are empty, not each
`chrome-extension://<32 letters a to p>/`, or not the `--store-id` given, or whose `signed` is not
`developer-id-notarized` for mac or `authenticode` for windows; and a package in the folder with no
sidecar beside it. `built_at` and `tools` are the release record's; the build does not read them.

## Not yet measured

Nothing below has been shown by a real machine. Each item stays here until it has.

- Nothing of the bridge has run on a real Mac: not the script zip, not the binary edition, not the
  installer package. Gatekeeper's behaviour on the stapled package, `pkgbuild`'s and `productbuild`'s
  exact options as the script spells them, and whether a current-user-home package installs without
  any prompt are not yet measured.
- The signed installers have not been built or opened anywhere: neither `build-pkg.sh` nor
  `build-msi.ps1` has run on a machine with the identities, and no student has opened a `.pkg` or an
  `.msi` of the bridge. The whole runbook above is the design, not yet measured.
- Notarization's acceptance of the hardened-runtime binary and the package is not yet measured.
- SmartScreen's reaction to a new publisher is not yet measured: an Authenticode signature from a
  publisher Windows has not seen before may still show "Windows protected your PC" until the
  signature has reputation, and how long that takes is not yet measured. The panel's words allow for
  it ("More info, then Run anyway").
- Whether the Windows SDK on the maintainer's machine carries `signtool /dlib`, and whether the Dlib
  package kept its NuGet name after the service's rename, are not yet measured.
- The Edge and Chromium host files the Mac postinstall writes when those browsers' folders exist,
  and the Edge registry value on Windows, have not been exercised by either browser: not yet measured.
- The installed binary edition's first hello time on a real Mac and on a real Windows machine is not
  yet measured (the script hosts' times are in `helper/README.md`).
