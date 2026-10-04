# The Mac package: beethoven-bridge-mac.pkg

The signed, notarized installer of the Beethoven bridge's binary edition (`helper/src/rust`) for
macOS, built only on the maintainer's own Mac by `build-pkg.sh` in this folder. Beethoven runs
Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks, used
here to say what it runs; "Open OnDemand" is the mark of its publisher.

The package installs into the current user's home only (`distribution.xml`: `enable_currentUserHome`
and nothing else), so the Installer asks for no administrator password. Its payload, relative to the
home, is `Library/Application Support/Beethoven/bridge/` with `beethoven-bridge` (a universal binary,
arm64 and x86_64), `uninstall.command`, `README.txt` and `allowed_origins.json`; its `postinstall`
script writes `com.openspineconsortium.beethoven.bridge.json` into Chrome's `NativeMessagingHosts`
folder under `Library/Application Support/Google/Chrome/` (always) and into Microsoft Edge's and
Chromium's (only when that browser's folder exists), with the absolute path to the installed binary,
`"type": "stdio"` and the origins from `allowed_origins.json`. The installed binary reads `allow.txt`
beside itself as the script hosts do (`helper/README.md`, "Adding an allowed host"), so a lab that
needs a second host adds that file to the installed folder; the package carries none.

Nothing in this folder runs in CI. CI keeps building the unsigned rust binaries for maintainers as it
did; this script is the step that turns one of them into something a student's Mac will open.

## What the maintainer must have

- An Apple Developer Program membership, and in the login keychain the two certificates it issues
  for distribution outside the App Store: `Developer ID Application: <Name> (<TEAMID>)` for the
  binary and `Developer ID Installer: <Name> (<TEAMID>)` for the package. The script takes their
  names; a certificate of another kind is refused, since a package signed with it is one every
  student's Mac rejects.
- A notarytool keychain profile, made once with `xcrun notarytool store-credentials <name>`, which
  asks for the Apple ID, the team identifier and an app-specific password and keeps them in the
  keychain. The script takes the profile's name and never sees what is behind it.
- Xcode or the Xcode command line tools (`xcode-select --install`): `lipo`, `codesign`, `pkgbuild`,
  `productbuild`, `xcrun`, `spctl`, `pkgutil`, and `/usr/bin/python3` to write the sidecar.
- Rust with both targets: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
- The extension's identifier from the Chrome Web Store developer dashboard: 32 letters, `a` to `p`.

## Running it

```
bash helper/release/mac/build-pkg.sh \
  --store-id <32 letters a-p> \
  --app-identity "Developer ID Application: <Name> (<TEAMID>)" \
  --installer-identity "Developer ID Installer: <Name> (<TEAMID>)" \
  --notary-profile <name>
```

| Argument | Meaning |
|---|---|
| `--store-id ID` | Required. The extension's identifier; `allowed_origins.json` in the package holds exactly `["chrome-extension://<ID>/"]`, and the download picker offers the package only to the extension it names. Anything but 32 letters `a` to `p` is refused (exit 2). |
| `--app-identity NAME` | Required. The `Developer ID Application` certificate's name, for `codesign`. |
| `--installer-identity NAME` | Required. The `Developer ID Installer` certificate's name, for `productbuild`. |
| `--notary-profile NAME` | Required unless `--no-notarize`. The keychain profile for `xcrun notarytool`. |
| `--no-notarize` | A trial of the steps on a Mac without a notary profile. The package goes to `<out>/trial/`, no sidecar is written, and the script says the result must never ship. Gatekeeper rejects such a package, and the script says so instead of failing. |
| `--out DIR` | Where the package and its sidecar go. Default: `helper/signed` (gitignored). |
| `--targets "T1 T2"` | The Rust targets joined by `lipo`. Default: `aarch64-apple-darwin x86_64-apple-darwin`. Apple targets only. |
| `--keep-work` | Keep the work folder (`mktemp -d` under `$TMPDIR`) that holds the builds, the payload root, the component package and the filled-in `distribution.xml`; by default it is removed when the script ends, however it ends. |

The steps, each announced with one line: check the tools and that both targets are installed; read
`helper/VERSION`; `cargo build --release --locked --target <t>` for each target, with `--target-dir`
in the work folder so the repository's `target/` is untouched; `lipo -create` the builds into one
binary; `codesign --force --options runtime --timestamp --sign "<app identity>"` and then
`codesign --verify --strict --verbose=2`; lay out the payload root (`beethoven-bridge` and
`uninstall.command` 0755, `README.txt` and `allowed_origins.json` 0644); `pkgbuild --root ... --scripts
... --identifier com.openspineconsortium.beethoven.bridge --version <helper version>
--install-location /`; fill `@COMPONENT_PKG@` and `@VERSION@` into `distribution.xml`; `productbuild
--distribution ... --resources ... --package-path ... --sign "<installer identity>" --timestamp`;
`xcrun notarytool submit <pkg> --keychain-profile <name> --wait` (the status must be `Accepted`);
`xcrun stapler staple` then `xcrun stapler validate`; `pkgutil --check-signature` and `spctl -a -vv -t
install`, whose output is printed; copy the package to `--out`; write the sidecar.

The package reaches `--out` only after every check has passed, so a refused notarization or a
Gatekeeper rejection leaves nothing there. Exit status: 2 for a bad argument, 3 for a missing tool,
4 when a step did not produce what it should, 5 when Apple or Gatekeeper refused.

## What the script never does

- It takes no password, key, token or certificate file, on the command line or anywhere else. The
  identities are certificate names; the keychain holds the certificates and their keys, and the
  notary profile's credentials, and `codesign`, `productbuild` and `notarytool` ask it themselves.
  The script prints what Apple's tools print and nothing it was not given.
- It writes nothing into the repository but `helper/signed/` (gitignored) when `--out` is left at
  its default, and nothing into `helper/src/rust/target/`.
- It deletes nothing but its own work folder, and that only when `--keep-work` is not given.

## The output and what to do with it

`<out>/beethoven-bridge-mac.pkg` and beside it the sidecar `<out>/beethoven-bridge-mac.pkg.json`:

```
{"name":"beethoven-bridge-mac.pkg","os":"mac","kind":"binary","helper":"1.0.0","protocol":1,
 "size":<bytes>,"sha256":"<64 lower-case hex>","allowed_origins":["chrome-extension://<id>/"],
 "signed":"developer-id-notarized","built_at":"<ISO 8601 UTC>",
 "tools":{"rustc":"...","macos":"...","xcodebuild":"...","pkgbuild":"...","productbuild":"..."}}
```

`signed` is `developer-id-notarized` only because notarization ran and stapling validated; a trial
build gets no sidecar at all. `size` and `sha256` are of the final, stapled file. The `tools`
entries are a record of what built the package; each is left out when the tool did not answer.

On the releasing machine, put the package and its sidecar into `helper/signed/` (they are already
there when the script ran on that machine with the default `--out`), then run `node
helper/build.mjs --store-id <id>`: it checks the sidecar against the file and against
`helper/VERSION`, copies the package into `extension/public/bridge/` and lists it in
`manifest.json`. A sidecar whose version, size, hash, name, origins or `signed` value does not fit
makes that build fail with the reason, so a stale or mismatched package never ships by accident.

On the student's side, the panel offers the package to the extension whose identifier it names and
says: open the file you downloaded; the macOS Installer opens; click Continue, then Install; it
installs into your own account, so no administrator password is asked; when it says the installation
was successful, close it and press Check again. Removal is `uninstall.command` in the installed
folder, which also runs `pkgutil --forget` for the package's record in the user's receipt database.

## Tests

`extension/test/releaseMac.test.ts` runs `build-pkg.sh` on Linux against stand-ins for `cargo`,
`rustup`, `rustc`, `lipo`, `codesign`, `pkgbuild`, `productbuild`, `xcrun`, `spctl`, `pkgutil`,
`sw_vers` and `xcodebuild` that record their arguments and leave behind what the real tools would,
and runs `postinstall` and `uninstall.command` against a stand-in home. It checks the script's own
work: the order and flags of every signing, notarization and stapling call, the payload and its
modes, the sidecar, the argument errors, and the two installed scripts. It cannot run the bash 3.2
that macOS ships; a static search for the bash 4 constructs (`declare -A`, `mapfile`, `${x,,}`,
`|&`) stands in for that.

## Not yet measured

Nothing in this folder has run on a real Mac. In particular:

- Apple's tools taking these exact arguments: `codesign` with `--options runtime --timestamp`,
  `productbuild` with `--sign` and `--timestamp`, `notarytool submit --keychain-profile --wait`
  printing `status: Accepted`, `stapler staple` and `stapler validate` on a `.pkg`, and whether
  `pkgbuild --version` and `productbuild --version` print a line (the sidecar leaves them out when
  they do not).
- Gatekeeper's behaviour for a notarized package installed into the user's home: that
  `spctl -a -vv -t install` says `accepted` with `source=Notarized Developer ID`, and that the
  Installer opens the downloaded file without a warning.
- The Installer's handling of a home-only package: that it asks for no administrator password, what
  it shows between Continue and Install, that it passes the home as `$2` to `postinstall` (the
  script falls back to `$HOME`), the ownership and modes it gives the installed files, and that it
  runs `postinstall` as the user.
- Chrome starting the installed binary through the manifest `postinstall` writes, and the hello
  answering with `kind: "binary"`, `runtime: "rust"`, `os: "mac"`.
- The Edge and Chromium folders: that `Library/Application Support/Microsoft Edge` and
  `Library/Application Support/Chromium` are where those browsers read `NativeMessagingHosts` on a
  Mac, and that they exist whenever the browser is installed.
- The binary under the hardened runtime making outgoing connections without an entitlement file.
- `pkgutil --forget <id> --volume "$HOME"` removing the per-user receipt.
- The universal binary running on both an Apple silicon and an Intel Mac.
