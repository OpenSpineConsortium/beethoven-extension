# Releasing the signed bridge installers

The maintainer's runbook for the two signed packages Windows and macOS students get on a store build
of Beethoven: `beethoven-bridge-mac.pkg` and `beethoven-bridge-windows.msi`. Both are the bridge's
binary edition (`helper/src/rust/`, helper 1.0.0, protocol 1; its hello says `"kind":"binary"`,
`"runtime":"rust"`), built, signed and packaged **only on the maintainer's own machines** by the
scripts in this folder, never in CI. Linux, and a development build on any system, keep the script
zips `helper/build.mjs` writes from `helper/src/`.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## Your release, start to finish

Everything runs on your Mac; no Windows machine is needed. The `.pkg` is signed with your Developer ID
and notarized by Apple, the `.msi` is cross-built on the Mac and signed through Azure Artifact Signing,
and the extension goes to the Chrome Web Store from the same command. The route through a Windows
machine stays below as the fallback ("The Windows machine (the fallback)").

### Once

1. `bash helper/release/setup-mac.sh --install` installs, with Homebrew, what the build needs
   (mingw-w64, msitools, osslsigncode, azure-cli, node@22 and jsign) and the three Rust targets
   (`aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-pc-windows-gnu`), and nothing else; `brew
   uninstall` and `rustup target remove` undo each. Homebrew and rustup themselves are yours to install
   first (https://brew.sh, https://rustup.rs), and the script says so when either is missing. It ends
   with the check.
2. The steps only you can do. The check prints them, numbered, with where each is done, whenever
   something is missing:
   1. join the Apple Developer Program;
   2. make the Developer ID Application and Developer ID Installer certificates and add both to the
      login keychain;
   3. `xcrun notarytool store-credentials <a name you choose>`;
   4. in the Azure portal, an Artifact Signing account, its identity validation, a certificate profile
      and the Certificate Profile Signer role for your own sign-in;
   5. `az login`;
   6. read the store item id and the publisher id in the Chrome Web Store developer dashboard;
   7. `bash helper/release/setup-mac.sh --write-config`: it asks for each name at the terminal (Return
      keeps the one in brackets, and it never reads from a pipe) and writes `release.json` in your
      vendor folder (`BEETHOVEN_VENDOR_DIR`, else `ASHLEY_VENDOR_DIR`, else `~/.beethoven-vendor`),
      mode 0600 in a 0700 folder. Names only; `release.example.json` here shows the shape;
   8. in the Google Cloud console, a project with the Chrome Web Store API and a Desktop OAuth client,
      then `node helper/release/publish-store.mjs sign-in --client <its JSON file>`. That sign-in stays
      in `<vendor>/chrome-web-store/`, and only `publish-store.mjs` opens it.
3. `bash helper/release/setup-mac.sh` until it ends with "Everything a release needs is on this Mac."
   It calls Apple's notary service once, to check the profile.

### Every release

1. Raise the version in `extension/package.json` and `package-lock.json` (the store takes only a higher
   one), commit on `main` and push.
2. From the repository root: `bash helper/release/release.sh`. That is the whole release. It runs the
   check above and stops with its list if anything is missing; refuses a working tree that is not
   clean, a branch other than `main`, a `main` that is not `origin/main` after one `git fetch`, or a
   `release/<version>/` that is already there; clears the last release's installers; runs `npm ci`,
   `npm run sync-profiles`, `npx tsc --noEmit` and `npx vitest run` while the bridge folder is still
   the tracked build; builds, signs and notarizes the `.pkg`; builds and signs the `.msi`; merges both
   (`node helper/build.mjs --store-id`); zips the extension and runs the package tests on that zip;
   records `release/<version>/`; puts the tracked bridge files back; and uploads the recorded zip,
   submitted for review. Apple's notarization is the long wait, usually minutes. "The order" below has
   each step as it runs.
3. It ends with one summary: the version, the first twelve hex digits of each installer's SHA-256, the
   store's answer, and the `git add`, `git commit` and `git push` lines for the record. It commits and
   pushes nothing itself.

`--dry-run` prints every command in order with your names filled in and runs none of them; the checks
that only read (release.json, the clean tree, the branch) still run, and the fetch is printed, not run,
so it needs no network. `--no-upload` stops after the record and prints the upload line for later.
`--allow-branch --no-upload` rehearses on another branch, with no fetch; a rehearsal never uploads.

When a step fails, the release stops there with that step's own message and a last line naming the
step, after putting `extension/public/bridge/` back. Fix the cause and run it again: the installers in
`helper/signed/` and their copies in `extension/public/bridge/` are the script's own, cleared at the
start of the next run. A failed upload is the exception: the record is already complete, and the last
lines give the upload command for that same zip; run that command rather than the whole release, which
would refuse the existing record.

### What Google's review means

`--publish` submits the uploaded version for review. Until Google approves it, students keep the
version they have; nothing reaches them early. Once it is approved, Chrome on each student's computer
fetches the update by itself, within hours, through the private listing. A rejection is Google's
email to the developer account, and the developer dashboard shows the item's state either way.

### Not yet measured, for the one command

- No part of `release.sh` or `setup-mac.sh` has run on a Mac, nor under the bash 3.2 macOS ships (the
  tests run them under Linux's bash with stand-ins for every Mac, Apple, Azure and store tool, and
  search the scripts statically for bash 4 constructs).
- Whether Homebrew carries a jsign formula (otherwise openjdk and the jar in the vendor folder), and
  msitools, mingw-w64 and osslsigncode as Homebrew builds them on macOS.
- That `security find-identity -v` lists the Developer ID Installer identity, that `xcrun notarytool
  history --keychain-profile <name>` answers for a working profile, and that `az account show` is a
  fair test of the Azure sign-in.
- That Azure Artifact Signing accepts signing from a Mac (jsign with an access token) at all.
- `unzip -Z1` and `unzip -p` with macOS's own unzip, which the zip check uses.
- The whole extension suite on a Mac: CI runs it on Linux, and the tests that need Python's asyncssh
  skip where it is missing.
- The store's answer to the upload, its wording, and how long Google's review takes.

## What never enters the repository or CI

- Any identity: the Developer ID certificates and their private keys, the Apple team identifier, the
  notarization keychain profile and the app-specific password or App Store Connect key behind it, the
  Azure subscription, the Artifact Signing account name, the certificate profile name and its endpoint,
  the Entra sign-in, the store item id and the publisher id. On the Mac they are names in
  `<vendor>/release.json` (`release.example.json` here holds placeholders only), and the store
  sign-in is in `<vendor>/chrome-web-store/`. On the fallback route the Windows account names live in
  `helper/release/windows/signing.json`, which `.gitignore` keeps out; only the committed example
  beside it, with placeholders, is tracked.
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
- For the Windows installer, built on the same Mac: Homebrew's mingw-w64 (the linker for Rust's
  `x86_64-pc-windows-gnu` target, added with `rustup target add x86_64-pc-windows-gnu`), msitools
  (`wixl` builds the MSI), osslsigncode, azure-cli, and jsign (or openjdk and jsign's jar in the
  vendor folder). An Azure Artifact Signing account as below, and `az login` on the Mac.
- `bash helper/release/setup-mac.sh` checks all of the above and says how to fix what is missing.

### The Windows machine (the fallback)

Only when the Mac cannot build or sign the `.msi`: build it on a Windows machine with
`build-msi.ps1`, copy the pair into `helper/signed/` on the Mac, and type the steps of "The order" by
hand, as "Building the Windows installer on Windows (the fallback)" says, since `release.sh` always
builds both installers itself.

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

The Mac, with Node 22 and the repository checkout; `release.sh` runs the extension's `npm ci` itself.
On the fallback route the Windows pair is copied to it over whatever the maintainer trusts (the
sidecars carry the size and SHA-256, and `build.mjs` refuses a file that does not match them).

## The order

`release.sh` runs these, in this order, from the repository root, each with the names from
`release.json`; each can also be typed by hand, which is how the fallback route goes.

1. **The setup check:** `bash helper/release/setup-mac.sh`; then a clean working tree on `main`, and
   `main` equal to `origin/main` after `git fetch origin main`.
2. **The extension's checks first**, while `extension/public/bridge/` is still the tracked build. The
   last release's outputs go first, and nothing else: the two packages and their sidecars in
   `helper/signed/`, and the two copies of the packages that the merge left in
   `extension/public/bridge/` (gitignored there; the bridge tests fail while they are there). Then,
   from `extension/`, as CI does: `npm ci`, `npm run sync-profiles` (which `npm ci` does not run, and
   which copies the site profiles and the texts the tests read), `npx tsc --noEmit` and `npx vitest
   run`. The suite's bridge tests read the packaged zips and expect the placeholder; after the merge
   they would read a release build.
3. **The Mac installer:** `bash helper/release/mac/build-pkg.sh --store-id <id> --app-identity <name>
   --installer-identity <name> --notary-profile <name>`. It builds the two targets, joins them,
   codesigns the binary with "Developer ID Application" plus `--options runtime --timestamp`, assembles
   the payload (`beethoven-bridge`, `uninstall.command`, `README.txt`, `allowed_origins.json`), builds
   the package with a `distribution.xml` that allows the current user's home only
   (`enable_currentUserHome="true"`, the other two domains `false`), signs it with "Developer ID
   Installer", notarizes, staples, and leaves `beethoven-bridge-mac.pkg` and
   `beethoven-bridge-mac.pkg.json` in `helper/signed/`. The package's postinstall writes the browser's
   host file for Chrome (always) and for Microsoft Edge and Chromium (when that browser's folder
   exists) under the user's home, with the absolute path of the installed bridge, and deletes nothing.
4. **The Windows installer, on the same Mac:** `bash helper/release/windows/build-msi-mac.sh --store-id
   <id> --azure-endpoint <endpoint> --azure-account <account> --azure-profile <profile>`. It builds
   `beethoven-bridge.exe` with Rust's `x86_64-pc-windows-gnu` target and mingw-w64, packs the same
   per-user MSI as `build-msi.ps1` with msitools' `wixl`, signs the exe and the MSI through Azure
   Artifact Signing with jsign (the Entra access token reaches jsign through an environment variable,
   never a command line), and leaves `beethoven-bridge-windows.msi` and
   `beethoven-bridge-windows.msi.json` in `helper/signed/`; its own header has the details. On the
   fallback route this step is `build-msi.ps1` on Windows (below) and the pair is copied in.
   `release.sh` then checks that `helper/signed/` holds both packages and both sidecars, so that one
   installer can never ship alone.
5. **Merge:** `node helper/build.mjs --store-id <id>`. It verifies each sidecar (helper version,
   protocol, size, SHA-256, origins equal to the store identifier, the way it is signed), copies the
   two packages into `extension/public/bridge/`, writes `manifest.json` with the three script entries
   first and the two signed entries after them, and prints one `NOTE: signed installer ...` line per
   package: name, system, the first twelve hex digits of the SHA-256 and the number of origins. Read
   both lines. The same `--store-id` also writes the identifier into the three zips'
   `allowed_origins.json`, as it always has. A refusal names the sidecar and the reason, in one
   sentence, and writes nothing.
6. **Package:** from `extension/`, `npm run zip`. The Chrome zip in `extension/.output/` carries
   `bridge/` with six files; `release.sh` checks that they are exactly the six, byte for byte, then
   runs `npx vitest run test/hygiene.test.ts`, whose package tests read that zip.
7. **Record the shipped files** in `release/<version>/` as earlier releases did (`release/14.0.0/`
   is the model): the Chrome zip, a `bridge/` folder with the six files from `extension/public/bridge/`
   and their own `SHA256SUMS.txt`, the guides, a `README.md` that says what was built, from which
   commit, with which tool versions (the sidecars' `tools` and `built_at` fields have them), what was
   checked and what is not proven, and a `SHA256SUMS.txt` over the folder.
   `release.sh` writes it all and verifies both checksum files. The record's `bridge/manifest.json`
   and the zips name the store's extension, since that is what shipped; the README it writes does not.
8. **Restore the tracked files:** `git checkout -- extension/public/bridge/`. The manifest with the
   signed entries, and the zips with the store identifier written in, are never committed: the tracked
   build is the placeholder build that `node helper/build.mjs --check --no-signed` proves in CI.
   `release.sh` then removes the `.pkg` and `.msi` copies from that folder (by hand, or a plain `node
   helper/build.mjs` removes them and says so; a plain `--check` names them until then) and runs `node
   helper/build.mjs --check --no-signed` to prove the tracked build is back. `git status` must show
   nothing but `release/<version>/` before the commit.
9. **Upload:** `node helper/release/publish-store.mjs upload --publisher <publisher id> --item <id>
   --zip release/<version>/beethoven-<version>-chrome.zip --require-signed --publish`: the recorded
   copy, so the record holds the bytes the store got.

### Building the Windows installer on Windows (the fallback)

From the repository root in PowerShell, `helper\release\windows\build-msi.ps1 -StoreId <id>` (the
parameter spelling is the script's; see its header). It builds `beethoven-bridge.exe` for x64, signs
it, builds the per-user MSI with WiX v5 (files in `%LOCALAPPDATA%\Beethoven\bridge\`: the
executable, the host file whose `path` is the relative `beethoven-bridge.exe`, which Chrome allows on
Windows, and `README.txt`; the default values of the Chrome and Edge `NativeMessagingHosts` keys under
`HKCU` set to the host file's full path), signs the MSI, and leaves `beethoven-bridge-windows.msi` and
`beethoven-bridge-windows.msi.json` in `helper/signed/`. On the Mac, type steps 1 to 3 of the order
above by hand, copy the Windows pair into `helper/signed/` beside the Mac pair (four files, nothing
else in that folder), then type steps 5 to 9.

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
