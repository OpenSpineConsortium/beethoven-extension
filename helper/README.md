# The Beethoven bridge

A small program on the student's own computer that lets Beethoven reach the grid's ssh port
(`grid.wayne.edu:22`) without the GlobalProtect VPN. A browser extension cannot open a TCP socket;
Chrome's native messaging lets it talk to a program the student has installed, and that program
can. The bridge carries bytes and nothing else: the ssh session inside them is made, encrypted and
checked by Beethoven itself (the host key is pinned there), so the bridge never sees a password, a
code, a key or a command, and it could not read them if it tried.

The bridge ships **inside the extension package** (`extension/public/bridge/`), one zip per
operating system, so nothing is downloaded from the website. An extension cannot run a program it
contains, so the student saves the zip from a Beethoven page and runs its installer once. The hosts
are scripts in languages each system already has, so there is nothing to compile, sign or
notarize:

| System  | Host Chrome starts                                    | Installer          | Installs to                                   |
|---------|-------------------------------------------------------|--------------------|-----------------------------------------------|
| Windows | `bridge.cmd`, which runs `bridge.ps1` in Windows PowerShell 5.1 (`-NoProfile -ExecutionPolicy Bypass -File`) | `install.cmd` (runs `install.ps1`) | `%LOCALAPPDATA%\Beethoven\bridge`, registry keys under `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts` and `...\Microsoft\Edge\...` |
| macOS   | `bridge.pl` run by `/usr/bin/perl`                    | `install.command`  | `~/Library/Application Support/Beethoven/bridge`, manifest in `~/Library/Application Support/Google/Chrome/NativeMessagingHosts` (and Edge, Chromium when installed) |
| Linux   | `bridge` (a two-line launcher) running `bridge.pl` with perl, or `bridge.py` with python3 where perl is missing | `install.sh` | `~/.local/share/beethoven/bridge`, manifest in `~/.config/google-chrome/NativeMessagingHosts` (and chromium, microsoft-edge when present) |

None of them needs administrator rights. Every installer says in one sentence what it will do and
waits for Enter or Return before doing it, then says in one sentence how it went, after starting
the installed bridge once and checking that it answers. Each has an uninstaller that removes
exactly what it installed, by name. Apple said in the macOS Catalina 10.15 release notes (2019)
that scripting runtimes such as Perl are included "for compatibility with legacy software" and
that future versions of macOS might not include them by default; `/usr/bin/perl` has shipped with
every release since, but if it ever goes, the Mac installer says so and Beethoven uses the VPN
route. A compiled variant is the answer then (see the end of this file).

## The wire contract (protocol 1)

Native messaging host name `com.openspineconsortium.beethoven.bridge`. Every message is a 4-byte
little-endian length followed by that many bytes of UTF-8 JSON; the bridge accepts messages of at
most 1 MiB from the extension and sends data in pieces of at most 48 KiB (64 KiB of base64).

Extension to bridge:

```
{"t":"hello","v":1}
{"t":"open","id":"<id>","host":"grid.wayne.edu","port":22}
{"t":"data","id":"<id>","b64":"<base64>"}
{"t":"close","id":"<id>"}
```

Bridge to extension:

```
{"t":"hello","v":1,"helper":"1.0.0","os":"windows|mac|linux","kind":"script","runtime":"powershell|perl|python","allow":["grid.wayne.edu:22", ...]}
{"t":"opened","id":"<id>"}
{"t":"data","id":"<id>","b64":"<base64>"}
{"t":"closed","id":"<id>","reason":"local|eof|reset"}
{"t":"error","id":"<id or empty>","reason":"<short>"}
```

`runtime` is an addition to the contract the streams were given, for diagnostics; nothing needs to
read it. Behaviour every host shares (the test suite checks each of these on each host):

- An `id` is 1 to 64 of `A-Z a-z 0-9 . _ : -`. It is free again once its connection has ended.
- `open` is checked against the allowlist **before** any name lookup or connection. The built-in
  list is `grid.wayne.edu:22`; `allow.txt` beside the host may add up to eight more (below).
  Comparison is exact on the lower-cased `host:port`.
- A connection that never opened ends with one `error` (`not_allowed`, `refused`, `dns`,
  `timeout`, `unreachable`, `connect_failed`, `too_many`, `duplicate_id`, `bad_id`, `bad_host`,
  `bad_port`). One that opened ends with one `closed`: `eof` when the server closed (every byte it
  sent is delivered first), `reset` on a socket error, `local` in answer to `close`.
- `data` may be sent before `opened`; it is held and written once the connection is up.
- `close` answers `closed(local)` at once, then the bridge still writes everything queued for that
  connection, shuts down its sending side (the server sees end of file), drains the server for up
  to 2 s and closes. A connection still flushing holds its slot for at most 12 s.
- Malformed input gets an `error` and the bridge carries on: `bad_json` (not one flat JSON object,
  invalid UTF-8, an empty message, a nested value), `bad_message` (no `t`), `unknown_type`,
  `unknown_id`, `bad_b64` (anything but strict padded base64). A declared length over 1 MiB gets
  `too_large` and the bridge exits with status 1, because the stream cannot be resynchronised.
- At most 8 connections at once (one ssh session needs one). The connect timeout, name lookup
  included, is 30 s: on the machine these were tested on, every Windows name lookup took 11 s.
- Backpressure: when more than 8 MiB waits to be written to the network, the bridge stops reading
  from Chrome until it is under 2 MiB, so a slow server cannot make it grow without bound.
- It writes nothing to stdout but protocol messages and nothing to stderr at all, keeps no log,
  writes no file, and exits as soon as Chrome closes its stdin (status 0), closing every socket.
- The extension's side: `chrome.runtime.connectNative('com.openspineconsortium.beethoven.bridge')`
  needs the `nativeMessaging` permission. If the bridge is not installed, the port disconnects at
  once with `chrome.runtime.lastError` set ("Specified native messaging host not found."); if it is,
  `hello` answers in about 2 s on Windows (PowerShell starts slowly) and well under a second
  elsewhere. Compare `hello.helper` with `helper` in `extension/public/bridge/manifest.json` to
  offer a reinstall when the installed bridge is older.

## Adding an allowed host

The allowlist is fixed in each host (`grid.wayne.edu:22`) so that the bridge cannot be pointed
anywhere else by a page or by the extension. A site other than Wayne State, or a lab running its
own relay, adds entries in a file named `allow.txt` placed **in the unpacked zip folder before
running the installer**; the installer copies it beside the host (and removes an old one when the
folder has none, so the installed list always matches what was installed). One `host:port` per
line, `#` starts a comment, at most eight entries are read:

```
# allow.txt
login.hpc.example.edu:22
```

Each host reads the file once when Chrome starts it. Anyone able to write into the install folder
can already run programs as that user, so the file grants nothing new. To change the built-in
entry, edit `BUILTIN_ALLOW` / `@BUILTIN_ALLOW` / `$BuiltinAllow` in the three hosts, bump
`helper/VERSION` and the version string in each host and installer, and rebuild.

## Building

```
export PATH=/c/Users/grego/tools/node22:$PATH     # Node 22, nothing to install
node helper/build.mjs                             # writes extension/public/bridge/
node helper/build.mjs --check                     # fails if the files there differ from a fresh build
```

The build checks that every host and installer carries the version in `helper/VERSION`, that the
sources are LF-only printable ASCII, and writes reproducible zips (fixed timestamps, sorted entries,
Unix modes so macOS keeps `install.command` executable, CRLF only for the Windows `.cmd`, `.ps1`
and `.txt` files) and `manifest.json` (name, size and SHA-256 of each zip, the helper version, the
protocol, the allowed origins and whether they are filled).

### The extension identifier: written in at download time, no release step

Chrome starts a native messaging host only for the extensions named in its manifest's
`allowed_origins`. The zips are built with the placeholder
`chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/` (`manifest.json` says
`"origins_filled": false`), which every installer refuses with "This copy of the bridge was built
without Beethoven's extension identifier".

A student never gets that file. The extension page that offers the download (the helper moment and
Settings) reads the packaged zip from the extension itself, replaces `allowed_origins.json` in a copy
with exactly `["chrome-extension://<chrome.runtime.id>/"]`, and saves that copy
(`extension/src/core/bridgeZip.ts`, `extension/src/ui/helperFile.ts`). Every other entry is copied
byte for byte (compressed bytes, CRC, sizes, Unix modes), so the zip names exactly the Beethoven it was
saved from: the Chrome Web Store's, Edge Add-ons', or a development build's. No identifier has to be
known when the package is built, and a release package can never name a development extension. If
the copy cannot be made, the packaged file is saved unchanged and its installer refuses (fail closed).

Building a zip by hand for another purpose still works: `node helper/build.mjs --store-id <id>`
names a published extension; `--unpacked-id <id>` (a development build) is refused unless `--dev` is
given as well, and such a build must not be shipped. `helper/extension-ids.json`
(`{"store": "<id>", "unpacked": ["<id>"]}`) is read the same way.

## Tests

Everything below was run on 2026-10-02 on the maintainer's Windows 11 machine (Node 22.23.3,
Windows PowerShell 5.1) and in its WSL Ubuntu 24.04 (perl 5.38.2, Python 3.12.3). Nothing was run
on a Mac.

```
# one host, the way Chrome starts it (on Windows through cmd.exe /d /c with --parent-window)
node helper/test/suite.mjs --host <bridge.cmd | bridge.pl | bridge.py | installed launcher>
     [--sshd 127.0.0.1:PORT]                         # an ssh banner and key exchange through it
     [--ssh-user U --ssh-fp SHA256:... --ssh-authkeys FILE --ssh-client DIR]
                                                     # a whole publickey sign-in and exec through it,
                                                     # with Beethoven's WebCrypto ssh client
     [--grid-banner]                                 # one connection to grid.wayne.edu:22 that reads
                                                     # the banner and closes, sending nothing
# installers, from the built zips to an uninstalled machine (Windows; or Linux under WSL)
node helper/test/installers.mjs --work DIR [--playwright <path to node_modules/playwright>] [-- <suite flags>]
```

`suite.mjs` starts local TCP servers (echo, sink, a sender that half-closes, a slow reader, a
listener that must never be reached, a closed port), writes their ports to `allow.txt` beside the
real host file for the run, and removes it afterwards. `installers.mjs` on Windows registers the
bridge only under `HKEY_CURRENT_USER\Software\Chromium\NativeMessagingHosts` (the key Playwright's
Chrome for Testing reads; never the Chrome or Edge keys), installs into a test folder whose path
has a space and a non-ASCII letter, lets Chromium start the installed bridge through
`connectNative` from a test extension whose identifier is fixed by a generated key
(`test/e2e-chromium.mjs`), uninstalls from inside the installed folder and removes the key. The
ssh server used is an unprivileged OpenSSH in WSL configured like the grid (RSA host key, aes-ctr,
hmac-sha1).

Measured results (2026-10-02), each host installed from its zip by its own installer:

| Host | Suite | Cold start to hello | Echo round trip (median / p95) | 4 MiB each way | Exit after stdin closes |
|------|-------|--------------------|--------------------------------|----------------|-------------------------|
| Windows, PowerShell 5.1 | 19/19 | 2.0 s | 11.1 / 41.1 ms | 1.81 s (2.2 MiB/s) | 2.3 s (PowerShell's own shutdown) |
| Linux, perl 5.38 | 19/19 | 0.08 s | 1.3 / 1.8 ms | 0.19 s (21 MiB/s) | 4 ms |
| Linux, python 3.12 | 19/19 | 0.09 s | 1.2 / 1.8 ms | 0.23 s (17 MiB/s) | 4 ms |

A whole ssh sign-in with a throwaway key plus a command took 0.29 s through the Windows host and
0.17 s through the others. Installers: 15/15 on Windows (including Chromium starting the
installed bridge, first hello in 2.3 s), 18/18 on Linux (perl and python installs, and the macOS
installer's logic under bash 5 with a stand-in home). The grid's banner (`SSH-2.0-OpenSSH_7.4`)
came back through the built-in allowlist once from Windows and once from WSL; nothing was sent to
it.

On the release build (the final assembly, 2026-10-02) the installer tests gave 16/16 on Windows (one
check added: a development identifier without `--dev` is refused; the wire suite 17/17, its two ssh
cases needing `--sshd`; Chromium's first hello in 2.1 s) and 19/19 on Linux. The download from the
extension's own page was run in Playwright's Chromium 153 (the browser harness, scenario 13): the
saved zip came from `blob:chrome-extension://<id>/`, was the packaged zip with only
`allowed_origins.json` changed to that extension's ID, and its `install.cmd` installed with exit 0.

Not tested here: a real Mac (Gatekeeper's prompts, `xattr`, the bash 3.2 that macOS ships,
`/usr/bin/perl` there), Edge, branded Chrome, Windows on ARM, and a computer where policy restricts
PowerShell.

## Known limits

- Windows: a computer whose PowerShell is restricted by policy (an execution policy set by Group
  Policy, Constrained Language Mode, AppLocker) cannot run the bridge; the installer's own check
  notices and says to use GlobalProtect. Antivirus may take a scripted relay for something worse; on
  the test machine Microsoft Defender, with real-time protection on, did not object.
- Windows: PowerShell takes about 2 s to start and about 2.3 s to exit; the bridge moves 2 to 3 MiB/s,
  far more than an ssh control session needs.
- macOS: the zip is not signed, so the first open of `install.command` needs Control-click, Open
  (on macOS 15 and later: System Settings, Privacy & Security, Open Anyway). The installer removes
  `com.apple.quarantine` from the copies it makes, and says so before it does.
- Linux: Chrome or Chromium installed as a Snap or Flatpak cannot start programs outside its
  sandbox, so the bridge does not work there.

## A compiled variant later (optional)

Compiled binaries would remove the dependence on PowerShell and Perl but bring back signing and
notarization. If they are ever added (a Go toolchain unpacked into a scratch folder is enough to
build them), these are the commands; none of them has been run for this project.

```
# Build (Go, static, no cgo)
#   GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o beethoven-bridge.exe ./cmd/bridge
#   GOOS=windows GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o beethoven-bridge-arm64.exe ./cmd/bridge
#   GOOS=darwin  GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o bridge-arm64 ./cmd/bridge
#   GOOS=darwin  GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o bridge-amd64 ./cmd/bridge
#   lipo -create -output beethoven-bridge bridge-arm64 bridge-amd64          # on a Mac
#   GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o beethoven-bridge ./cmd/bridge
#
# Windows Authenticode (signtool from the Windows SDK; the certificate's key must sit on a hardware
# token or in a cloud signing service, so for example with Azure Trusted Signing):
#   signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 ^
#     /dlib Azure.CodeSigning.Dlib.dll /dmdf metadata.json beethoven-bridge.exe
#   signtool verify /pa /v beethoven-bridge.exe
#
# macOS Developer ID signing with the hardened runtime, then notarization (Apple Developer Program):
#   codesign --force --options runtime --timestamp \
#     --sign "Developer ID Application: <Name> (<TEAMID>)" beethoven-bridge
#   ditto -c -k --keepParent beethoven-bridge beethoven-bridge-notarize.zip
#   xcrun notarytool submit beethoven-bridge-notarize.zip --keychain-profile <profile> --wait
#   (a bare binary cannot be stapled; to staple, ship it in a signed disk image, which needs no
#    administrator rights to use:
#    hdiutil create -volname "Beethoven bridge" -srcfolder payload -ov -format UDZO beethoven-bridge.dmg
#    codesign --sign "Developer ID Application: <Name> (<TEAMID>)" --timestamp beethoven-bridge.dmg
#    xcrun notarytool submit beethoven-bridge.dmg --keychain-profile <profile> --wait
#    xcrun stapler staple beethoven-bridge.dmg)
#   spctl --assess --type execute -vv beethoven-bridge
```
