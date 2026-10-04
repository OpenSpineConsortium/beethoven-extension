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

## Uploading to the Chrome Web Store

`helper/release/publish-store.mjs` uploads the Chrome zip to Beethoven's item on the Chrome Web Store
and submits it for review, so a release ends with one command on the Mac (greg, 2026-10-04: "i want
the chrome extension to automatically upload the newest version to the chrome marketplace when its
ready"). It runs on the maintainer's own machine only: the zip it uploads carries the signed
installers, which exist only there, and its Google sign-in lives in the vendor folder beside the
signing keys. Node 22 and nothing else; it has no dependency.

### Once, by hand

1. In the Google Cloud console, make a project for this (any name) and enable the **Chrome Web Store
   API** in it.
2. Set up the project's OAuth consent screen with user type **External**, and either add the Google
   account that owns the Beethoven item as a test user (the app stays in "Testing") or publish the
   app. Google expires the refresh tokens of an app in "Testing" after seven days (see "Not yet
   measured" below).
3. Create an OAuth client ID of type **Desktop app** and download its JSON (`client_secret_....json`).
   Not a "Web application" client: the tool refuses one.
4. On the Mac, from the repository root:
   `node helper/release/publish-store.mjs sign-in --client ~/Downloads/client_secret_....json`.
   It copies the client's id and secret into `~/.beethoven-vendor/chrome-web-store/client.json`,
   prints a Google address and opens it in the browser. Sign in with the account that owns the item
   and allow access to the Chrome Web Store; the tab says "Signed in. You can close this tab." and the
   refresh token is saved in `token.json` beside `client.json` (both mode 0600, their folder 0700).
   Then delete the downloaded file: nothing in it is needed again.
5. Note the two identifiers every upload takes: the **publisher ID** (developer dashboard,
   Publisher > Settings) and the **item ID** (the 32 letters `a` to `p`, the same identifier as
   `--store-id` above).

The vendor folder is `BEETHOVEN_VENDOR_DIR`, else `ASHLEY_VENDOR_DIR`, else `~/.beethoven-vendor`, as
for the signing keys; a vendor folder inside the repository checkout is refused. The sign-in is
Google's loopback flow for installed apps: a listener on 127.0.0.1 at a free port, PKCE and a random
state, five minutes at most, and an answer whose state is not this sign-in's is refused. The store's
own documentation reaches a refresh token through the OAuth 2.0 Playground instead, which hands it to a
third-party page; this tool never does. When Google stops accepting the saved sign-in, the next run
says so in one sentence and exits 3; `node helper/release/publish-store.mjs sign-in` again (the saved
client is reused, no `--client` needed) is one visit in the browser.

### Every release

Once the package is built with the signed installers in it (step 6 of "The order"), from the
repository root:

```
node helper/release/publish-store.mjs upload --publisher <publisher id> --item <item id> \
  --zip extension/.output/beethoven-<version>-chrome.zip --require-signed --publish
```

Before any request it checks the zip: it is a zip, its `manifest.json` is Manifest V3 with
`extension/package.json`'s version, no `"key"` field and no localhost or 127.0.0.1 origin (a
development build); with `--require-signed`, `bridge/beethoven-bridge-mac.pkg` and
`bridge/beethoven-bridge-windows.msi` are in it, each listed once in `bridge/manifest.json` as kind
`"binary"` with the size and SHA-256 of the file in the zip and with this item's origin among its
`allowed_origins`. A refusal is one sentence and exit 2, and nothing is sent. Then it prints the zip's
SHA-256 (the same as the release record's, step 7), renews the access token, uploads, prints the
answer, and with `--publish` submits the item and prints that answer.

Every upload is reviewed by Google. `--publish` submits it for review, and the new version goes out to
the item's testers when the review passes. The tool sends no listing setting with the submission. Two more commands, with the same `--publisher` and
`--item`: `status` prints where the item stands, and `publish` alone submits an item already
uploaded (after an upload without `--publish`, or a submission that failed).

| Exit | Meaning |
|---|---|
| 0 | every request answered with HTTP 2xx |
| 1 | a request failed, was cut off, or answered 2xx with a state that reads as a failure |
| 2 | refused before any request: the arguments, the zip, the vendor folder, its file modes, or a test base other than 127.0.0.1 |
| 3 | a sign-in is needed: none is saved, or Google answered `invalid_grant` |

### What never enters the repository or CI here

The downloaded client file, `client.json` and `token.json` are on the maintainer's Mac only, the last
two in the vendor folder. The command line takes paths and identifiers only: the client secret, the
refresh token, the access token and the authorization code are never an argument, a log line or
printed, and any of them an answer echoes is printed as `[redacted]`. Nothing of this is a GitHub
secret, and CI never uploads: the zip it would upload exists only on the maintainer's machines.
`extension/test/publishStore.test.ts` runs the tool against a stand-in for Google on 127.0.0.1, through
`BEETHOVEN_CWS_TEST_BASE`, which the tool takes only as `http://127.0.0.1:<port>` so that a stray
variable can never send the saved sign-in anywhere else.

### Not yet measured here

- The answers of upload, fetchStatus and publish. The store's API page does not describe their
  bodies, so the tool reads none of their fields: it takes HTTP 2xx as success, prints each answer
  whole after its top-level keys and every field named like a state or status, and stops when a 2xx
  answer has a state-like field reading as a failure or a non-empty field named like an error. The
  first real run's output is the measurement; record it here.
- Whether a refresh token of this unverified personal app lasts past seven days, in "Testing" or
  published.
- The whole flow against the real store: the consent screen, the upload sent as the page's `curl`
  example sends it (the zip as the body, no content type), the submission sent with no body, whether
  it keeps the item Private to its trusted testers as the dashboard sets it, how the review treats a
  package that carries the two installers, and how long the review takes.
- The format of the publisher ID: the tool takes letters, digits, `.`, `_` and `-`, and refuses
  anything else.
- Opening the browser on Windows (`cmd /c start`); the printed address works on any system.

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
