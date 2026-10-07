# How Beethoven reaches the grid from the browser

The design record of the bridge's transport, as of extension 15.0.0 (helper 1.0.0, protocol 1),
2026-10-04. Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are
Anthropic's marks, used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## What the bridge is for

A browser extension cannot open a TCP socket, so a small program on the student's computer, started
by Chrome through native messaging, carries Beethoven's ssh bytes to the grid's own ssh port
(`grid.wayne.edu:22`), the one destination built into it. An `allow.txt` placed beside it at install
time can add up to eight more; the installers in the package bring none. The ssh session inside those
bytes (the pinned host key, the sign-in, every command) is made and encrypted by Beethoven's own
client in the browser (`extension/src/ssh/`, TypeScript on WebCrypto), so the bridge never sees a
password, a code, a key or a command, and holds none. What it does see in the clear is what ssh sends
in the clear to anyone on the path before the keys are agreed: the two version banners, the algorithm
lists and the grid's host key. Everything after that is encrypted.

## Where this record comes from

- **The analysis.** Greg's Google Doc "Browser HPC Bridge Architecture Analysis" (its heading:
  "Architectural Trade-off Analysis: Zero-Admin Browser-to-HPC Bridge Mechanisms"), Drive file
  `15ajSPhNuZz3rk7RsYwwZNxBViL9D1NxQzO5A9KMAQP0`, added to the project on 2026-10-04 and read in full
  that day. It scores five transports from 1 to 5 on five axes and recommends a self-hosted relay
  first, with native messaging scripts as the local fallback.
- **The checks**, made on 2026-10-04 (two pages read again on 2026-10-05) against the pages listed at
  the end (chromestatus.com returned no feature text and Microsoft's `about_execution_policies`
  answered 403; nothing rests on either), and the repository at 9aa1171, to which the line numbers
  below refer. A verdict is confirmed or
  wrong (with its source), not checked here (no source read covers it), or not yet measured.

## The analysis's premises, against this product

The analysis wants no administrator, a way around "the mandatory daily VPN requirement for
off-campus users", and no "paid code-signing certificates". Against this product:

- **What needs the VPN.** Wayne State's KB 20239 says Grid OnDemand needs the VPN and says nothing
  about ssh. `grid.wayne.edu:22` answered from the internet on 2026-10-01 and 2026-10-02
  (`framework/profiles/wayne.json:88`, `framework/contract-text/V12_CONTRACT.md` "Facts") and asks for the password and
  then the Google Authenticator code itself. That shows the port can be reached, not what Wayne State
  expects: whether off-campus users are meant to be on the VPN for ssh is not checked here (no
  statement of C&IT's on off-campus ssh has been read). The direct way is a plain ssh connection to
  that public port and disguises nothing. If C&IT does expect the VPN for ssh from off campus, the
  direct way would be going around a requirement, which this record says the product does not do;
  asking C&IT settles it (below, "Not yet measured, or not checked").
- **Signing is paid for.** Greg decided the signed binary on 2026-10-04 at 15:41Z: "if i have to pay
  100 bucks to get it working seamlessly on a mac without any terminal usage i will, i want it to be
  professional".

Its claim that campus networks "routinely block outbound Port 22" is not checked here; what an
on-campus network does to it is not yet measured. Where one blocks it, Beethoven offers **Use
GlobalProtect instead**, the 11.0.0 portal path.

## The five transports

| # | Transport (the analysis's name) | Score | In this product |
|---|---|---|---|
| 1 | Isolated Web App with Direct Sockets | 14/25 | not in the extension's bridge order; a separate developer-flag pilot, given only to a student who asks |
| 2 | Native messaging host (script) | 19/25 | built in 12.0.0; the way while no site profile names a relay; a signed binary edition since 15.0.0 |
| 3 | Local loopback WebSocket daemon | 15/25 | not built |
| 4 | Open OnDemand session forwarding | 14/25 | the 11.0.0 portal path, kept as the fallback; not a direct way |
| 5 | Self-hosted cloud relay over wss (wstunnel) | 25/25 | set aside as a plan; the code still tries a relay a site profile names before the native host (below) |

**1. Isolated Web App.** *The analysis:* IWAs get raw TCP through Direct Sockets, but unmanaged
installs exist only on ChromeOS "as of Chrome 150". Windows gets them through device management "in
Chrome 161", and anyone else must turn on `chrome://flags/#enable-isolated-web-app-dev-mode`.
*Checked,* in parts:
- Windows and macOS: confirmed. developer.chrome.com's Direct Sockets page says the API is
  "restricted to Isolated Web Apps", and its IWA introduction names the same flag for development.
- ChromeOS: not confirmed. The IWA introduction (last updated 2026-02-06, read again 2026-10-05) says
  the first release is "only available to Chrome Enterprise administered ChromeOS devices and select
  development partners", with "unmanaged and cross-platform devices" only planned, so as of that page
  unmanaged ChromeOS is not among them. Whether Chrome 150 changed that is not checked here (its notes
  were not read); nor is Chrome 161.
- The extensions' side, from the repository's exploration A (`docs/V12_STATUS.md` 3.5): Chromium's
  source gives the `sockets` key and Direct Sockets to Google's Secure Shell (stable and dev) and to
  platform apps only, so no other store extension can lend Beethoven a socket
  (`docs/guides/ACCOUNTS.md` 2.3).

*This product:* no Isolated Web App in the extension's bridge order. A separate pilot exists, built in
the 12.0.0 exploration with its sources outside this repository: it installs only through two
developer flags, shows a warning bar at every Chrome start, and is given only to a student who asks
(`LICENSE.txt` section 1, the "Pilot App"; `PRIVACY.md` "Relays and the pilot app";
`docs/V12_STATUS.md` 5.1; `docs/guides/ACCOUNTS.md` 2.4). The extension's first provider, "store", is
a different transport: a named stub for a browser-only bridge another store extension might offer,
such as Google's Secure Shell, which answers "not available" (`extension/src/core/bridge.ts:5-7`,
68-83).

**2. Native messaging script host.** *The analysis:* registering a host per user needs no
administrator. Defender and EDR products watch the `HKCU` `NativeMessagingHosts` keys because malware
(Lunex, PEEP) abused them, and an unnotarized `.exe` host meets SmartScreen and Defender. Scripts run
by a signed system interpreter avoid the binary checks of Gatekeeper and SmartScreen. *Checked:*
- The three per-user locations are confirmed by developer.chrome.com's native messaging page. The
  page also says `path` must be absolute on macOS and Linux (relative is allowed on Windows) and that
  `allowed_origins` takes no wildcards. The installers match (`helper/src/windows/install.ps1:64`,
  `helper/src/mac/install.command:50-52`, `helper/src/linux/install.sh:61-63`,
  `helper/release/windows/Package.wxs:82-83`, `helper/release/mac/scripts/postinstall:45-47`).
- PEEP: SOCRadar's write-up confirms that it registers a host (`com.peep.lab`) under the Chrome and
  Edge keys. It does not say that Defender or EDR products watch those keys. Lunex, and "EDR monitors
  these paths aggressively", are not checked here.
- Scripts getting past Gatekeeper and SmartScreen: not checked here (no Apple or Microsoft page read
  speaks of scripts that way); the repository does not rely on it, and the one Windows observation on
  record goes against it (below).

*This product:* built in 12.0.0, and the way while no site profile names a relay (below).

**3. Local loopback daemon.** *The analysis:* Chrome's Private Network Access needs a CORS preflight
answered with `Access-Control-Allow-Private-Network: true`. Chrome 147 extended that to WebSockets,
and the WICG specification splits the permission into local-network and loopback-network, with a
prompt to come. *Checked,* in four parts:
- Mechanism wrong. Local Network Access replaced PNA's preflight with a permission: the WICG explainer
  says it "differs by gating access on a permission rather than via preflight requests", and Chrome's
  blog says it "replaces that effort, after PNA was put on hold".
- Version right. Chrome 147's release notes say "WebSockets connections to local addresses now
  trigger permission prompts". The blog has the prompt itself arriving in Chrome 142.
- The split is Chrome's, not the explainer's. Chrome 145's release notes describe `local-network` and
  `loopback-network`, but the WICG explainer, as read, still describes one permission.
- Whether an extension's own pages or service worker are subject to it: not checked here; none of
  the pages read mentions extensions.

*This product:* no loopback daemon (`extension/src/core/bridge.ts:1-15`); set aside below.

**4. Open OnDemand forwarding.** *The analysis:* ride the portal's cookies, its `/rnode/` proxy and
`slurmrestd` tokens. It fails because the portal needs the VPN. *Checked:* KB 20239 confirms that
Grid OnDemand needs the VPN. *This product:* the portal path of 11.0.0, kept behind **Use
GlobalProtect instead**: a content script on the one portal origin the student grants, never a cookie
read, no automated sign-in; `/rnode/` held in reserve (`docs/ARCHITECTURE.md`); no `slurmrestd`,
which none of the university documentation sets sampled mentions exposing ("treat it as absent",
`docs/RESEARCH_REPORT.md`). As a direct way it is set aside.

**5. Self-hosted cloud relay.** *The analysis:* the extension opens `wss://` to a small cloud server
running wstunnel on port 443, which opens TCP to `grid.wayne.edu:22` and never sees inside ssh; pings
every 20 s keep the service worker alive under Chrome 116. *Checked:* the keepalive is confirmed (the
lifecycle page: "Active WebSocket connections now extend extension service worker lifetimes"; the
Chrome 116 blog: "all WebSocket activity will reset the 30s service worker idle timer", with a
20-second example). *This product:* set aside as a plan, for the reasons below, though the code
would still use a relay a site profile named.

## Why native messaging is the way

Native messaging is not open to re-scoring here: it is Greg's decision of 2026-10-02 and one of the
project's fixed rules (`CLAUDE.md`). Since 12.0.0 Beethoven requests `nativeMessaging` for one host
only, its own bundled bridge `com.openspineconsortium.beethoven.bridge`, which carries bytes to the
grid's ssh port and nothing else. Chrome's permission names no host, so the one-host limit is the
code's: the extension calls `connectNative` with that one name and no other
(`extension/src/core/bridge.ts:26`, 246). What this section adds is how the analysis's reasons and the
pages read bear on that decision. It stays "the way" only while no site profile names a relay, which
the code would try first ("The relay, set aside", below).

Where it was checked, the analysis's case holds: native messaging runs as the user, needs no server,
avoids the loopback permission and keeps the service worker alive, which the lifecycle page confirms
in its Chrome 105 entry ("connecting to a native messaging host using `browser.runtime.connectNative()`
will keep a service worker alive"). The analysis says, in the past tense, that early Manifest V3
background scripts "were forcefully terminated after 30 seconds of inactivity, or after 5 minutes of
total execution time, regardless of ongoing tasks", and then describes the fixes of Chrome 105 and
116. The lifecycle page as read now gives the limits this product works under: five minutes for a
single request or event, beside the 30-second idle timer. The background holds the port
(`extension/src/core/bridge.ts:246`) with no `offscreen` permission (`extension/wxt.config.ts:21-23`),
and the ssh transport sends an `SSH_MSG_IGNORE` after 20 s idle (`extension/src/ssh/transport.ts:38`,
215-220).

The design rests as much on what the analysis does not name. Chrome starts the host only for the
extensions in its manifest's `allowed_origins` and talks to it over standard input and output, so
nothing listens on a port. The host opens TCP only to its allowlist (`grid.wayne.edu:22`, plus at most
eight entries from an `allow.txt` the installer copied), checked before any name lookup. It carries
the ssh stream without reading it (encrypted from the key exchange on), holds no credential, has no
shell, writes no log and exits when Chrome closes its input (`helper/README.md`, "The wire contract").
No server of ours is in the path, and no administrator is needed to install or remove a script host
(for the signed installers, see the table below).

## Scripts and the signed binary, side by side (15.0.0)

The analysis argues for scripts because an unsigned, unnotarized binary is stopped: the "damaged"
dialog on macOS, SmartScreen and Defender on Windows. That argument is about unsigned binaries, and
Greg's 15:41Z decision signs the binary. Apple's Gatekeeper guide confirms that Gatekeeper checks
downloaded apps, plug-ins and installer packages for an identified developer's signature, notarization
and alteration, and its notarization page says "all software built after June 1, 2019, and
distributed with Developer ID must be notarized". The analysis's `posix_spawn` and AMFI account for a
host Chrome starts is not checked here. Both editions stay: the signed binary for store builds on Mac
and Windows; the scripts for Linux, for development builds, and as the fallback in any build that
carries no signed installer naming it.

| Edition | Who gets it | Installing | At Gatekeeper or SmartScreen |
|---|---|---|---|
| Windows script zip (`bridge.cmd`, Windows PowerShell 5.1) | development builds; any build with no signed installer naming it | Extract all, double-click `install.cmd`, press Enter | Observed in exploration C (the 12.0.0 build, recorded on 2026-10-02): Chrome downloaded the bundled files with the Mark of the Web, and opening the installer from Explorer showed "Open File - Security Warning ... Unknown Publisher ... Run" (`docs/V12_STATUS.md` 3.2, 3.5); the machine was Greg's Windows 11 with Smart App Control off (`docs/guides/ACCOUNTS.md` 2.1). That was a direct download of the packaged file, before a student's copy became a `blob:` download made in memory, whose Mark of the Web is not yet measured (below). SmartScreen itself and Smart App Control: not yet measured. |
| macOS script zip (`bridge.pl`, `/usr/bin/perl`) | development builds; any build with no signed installer naming it, which so far is every store build (below) | unzip, open `install.command`; if blocked, Privacy & Security, Open Anyway (Control-click, Open on 14 and earlier); Return | The steps expect a plain double-click to be blocked. Nothing of the bridge has run on a real Mac: not yet measured. |
| Linux script zip (perl, else python3) | every Linux student | `bash install.sh`, Enter | Neither applies. That a Chrome installed from Snap or Flatpak cannot start it is a known limit in `helper/README.md`, not checked against a source here; no Snap or Flatpak run is recorded: not yet measured. |
| `beethoven-bridge-windows.msi` (signed binary) | store builds on Windows | open it, Install (or More info, Run anyway) | Not yet built or opened anywhere. A new publisher's signature may still meet "Windows protected your PC" until it has reputation, which SmartScreen's overview allows for: not yet measured. |
| `beethoven-bridge-mac.pkg` (signed, notarized, stapled) | store builds on macOS | open it, Continue, Install, as the panel's steps expect (`extension/src/core/model.ts:429`); built for the current user's home only (`enable_currentUserHome`), so that no administrator password should be asked: not yet measured | Not yet built or opened anywhere. Gatekeeper's verdict on the stapled package: not yet measured. |

The picker offers a binary only when it is signed and names the running extension, else the script
zip (`extension/src/core/bridge.ts:526-531`); it does not require a signed installer to be there. On
macOS that fallback is the Terminal step Greg's 15:41Z decision pays to remove: `install.command`
opens in Terminal and waits for Return. The one-command release uploads a store build only with both
signed installers in it (`helper/release/release.sh`, `publish-store.mjs --require-signed`), but
`publish-store.mjs` without that flag accepts a package with none and prints a note saying so
(`helper/release/publish-store.mjs:583-588`), and every store build up to 14.0.0 had none. So until a
`.pkg` made out to the store item is built and shipped, which has not happened, a store build gives
Mac students the script zip and its Terminal step.

The scripts do not rely on two more of the analysis's points:
- **The quarantine mark.** The analysis says the mark on a script does not matter: not checked here.
  The Mac installer removes `com.apple.quarantine` from its copies and says so first
  (`helper/src/mac/install.command:57`, 74-78); the Windows one runs `Unblock-File` on its copies
  (`install.ps1:97`). Whether the bridge would start with the mark left on is not yet measured.
- **The interpreter.** The analysis's Mac host runs on `/usr/bin/env python3`; Beethoven's runs on
  `/usr/bin/perl` (`helper/src/common/bridge.pl:1`), python3 being a Linux fallback only. Apple's 10.15
  notes say runtimes "such as Python, Ruby, and Perl" are kept "for compatibility with legacy
  software" and future versions "won't include scripting language runtimes by default"; 12.3's say
  "Python 2.7 was removed". Whether `/usr/bin/python3` without the Command Line Tools is only a stub is
  not checked here. If `/usr/bin/perl` goes, the installer says so (`install.command:42-45`).

On Windows the script host starts PowerShell with `-ExecutionPolicy Bypass` (`bridge.cmd:6`), which
Microsoft's Set-ExecutionPolicy page describes as "Nothing is blocked and there are no warnings or
prompts". The installer starts the bridge it has just installed; only when that does not answer does
it read the execution policies set by Group Policy (`MachinePolicy`, `UserPolicy`), and when one is set
it names it and sends the student to GlobalProtect, otherwise it says the bridge did not answer and
offers Check again or GlobalProtect (`install.ps1:160-178`). A Group Policy setting under which the
bridge still answers gets the "installed" message. Smart App Control's overview says it blocks
"unknown, unsigned code" but nothing about `.ps1` or `.cmd`, so the panel's sentence that it blocks
downloaded scripts (`extension/src/core/model.ts:431-433`) is not checked here; nor is how EDR
products treat a `-ExecutionPolicy Bypass` host.

## The relay, set aside

The analysis ranks the relay first, and its reasons for that are what set it aside here. It says the
traffic "appears indistinguishable from standard HTTPS", "evades campus DPI firewalls" and "bypasses
the mandatory VPN requirement". Its Phase 2 binds the relay to port 443 "to ensure the traffic is
perceived as standard HTTPS". This product does not build a transport whose purpose is to get past a
campus network's inspection, or a university's VPN requirement, by disguising ssh as web traffic
through a server we would run. The bridge reaches the grid's own public ssh port, which asks for the
password and one-time code itself, and nothing hides what the connection is. Phase 2 is not taken
into the record as a plan.

The other reasons:
- **It is not needed for reach.** The grid's ssh port already answers from the internet, and the
  VPN is documented for the portal (KB 20239). What Wayne State expects of off-campus ssh is not
  checked here (above), and a relay would not change that answer.
- **It would be a server we run, and every student's grid traffic would cross it.** ssh stays
  encrypted, but who connects, when, from where and how much would pass one machine of ours, needing a
  named maintainer, updates, a certificate, a new privacy statement, and C&IT told first, since every
  student would reach the grid from one address (`docs/guides/ACCOUNTS.md` 2.2). A Cloudflare Worker
  cannot be it: Cloudflare's self-serve agreement, 2.2.1(j), forbids using the services "to provide a
  virtual private network or other similar proxy services" (exploration B, `docs/V12_STATUS.md` 3.5).
- **TCP over TCP is not the reason.** The analysis's "TCP-over-TCP Meltdown" (its heading; its text
  says "TCP-over-TCP Tax" or "TCP meltdown") does not fit a wstunnel port forward: meltdown comes from
  tunnelling packets that carry their own TCP inside a TCP stream (a VPN over TCP), while a port
  forward joins two separate TCP connections at the relay, with no inner retransmission timer (from
  the layering; not checked against a source read now). What remains is an extra hop, and
  head-of-line blocking on one connection, which the direct path has too.

What stays in the code is not set aside in the code's order. A relay a site's own profile names
(`ssh_relay`) is the second provider in decision D3's order, after the "store" stub and before the
native host (`framework/contract-text/V12_CONTRACT.md` "Bridges"; `extension/src/entrypoints/background.ts:3008`;
`extension/src/core/bridge.ts:3-14`). `chooseBridge` stops at the first provider that answers
"available" (`bridge.ts:432`), and a configured relay answers "available" without being tried
(`bridge.ts:130-134`). So one `ssh_relay` line in a site profile makes that relay the transport, and
the native host is not even probed: native messaging stays the way only while no profile names a
relay.
Wayne State's names none (`framework/profiles/wayne.json:71`, `ssh_relay: null`), and nothing is
deployed. The relay provider goes to `grid.wayne.edu:22` only (`bridge.ts:138`). Its class takes an
optional ticket function, but the background builds it without one, so no ticket is ever asked for
(`docs/V12_STATUS.md` 5.1). The agreement texts disclose the relay as a route a site profile can name,
and promise that the privacy statement names who runs it and what it sees before any version uses it
(`LICENSE.txt` 5(b)(i), `PRIVACY.md` "Relays and the pilot app"). Taking the relay out of the order, or
keeping it, is a decision for Greg; this record does not make it.

## The loopback daemon, Isolated Web Apps and portal forwarding, set aside

- **Loopback daemon.** Any local program can connect to a program listening on `127.0.0.1`, so it
  would have to check its callers, run all the time and start with the computer, and Chrome is putting
  local addresses behind a permission prompt (above). A native host listens on nothing.
- **Isolated Web Apps.** An unmanaged Windows or macOS computer cannot install one without a
  developer flag. Among web apps Direct Sockets is open only to them; among extensions and apps,
  Chromium's source gives it, with the `sockets` key, to Google's Secure Shell and to platform apps
  only (exploration A, above). The pilot stays what it is: a separate app for a student who asks, not
  a way the extension uses.
- **Open OnDemand forwarding.** It needs the VPN, which the direct way exists to spare. It stays as
  the fallback, as built in 11.0.0.

## The one-time key step, against the analysis's Phase 1

| | The analysis's Phase 1 | Beethoven (`framework/contract-text/V12_CONTRACT.md` "The sign-in sheet", "The key") |
|---|---|---|
| Key | `generateKey({name:"Ed25519"}, true, ...)` on install | Made at the first direct sign-in, before the grid is asked anything: Ed25519 where WebCrypto has it, else ECDSA P-256 (`extension/src/ssh/identity.ts:24-36`, `extension/src/core/keyring.ts:277-279`). By default it is extractable only so it can be wrapped once, and is kept wrapped (AES-256-GCM) under a non-extractable browser key (`keyring.ts:3-8`, 314-326). With the opt-in "Protect my key with Windows Hello / Touch ID" it is wrapped instead under a key derived from a passkey's PRF output (HKDF-SHA-256), and the browser key, if there was one, is deleted (the key is made that way from the start when the student ticks the opt-in before the first sign-in, `keyring.ts:365-378`); turning the opt-in on or off once the key exists unwraps the same key as an extractable key in memory, only for the moment of re-wrapping (`keyring.ts:10-18`, 385-422). Either way signing uses a non-extractable key held in memory, and the clear key is never written anywhere. Chrome 137's notes add Ed25519 to Web Cryptography, and with `minimum_chrome_version` 148 (`extension/wxt.config.ts:76`) every Chrome that installs Beethoven has it. |
| Format | `exportKey("spki")`, "the raw 32-byte SPKI output" converted to `ssh-ed25519` | Wrong as stated: SPKI wraps the key in a header. Beethoven exports `raw`, which gives the 32 bytes (`keyring.ts:319`, 370), and writes string `"ssh-ed25519"` followed by string key (`identity.ts:57-63`), as RFC 8709 defines. |
| Sign-in | AccessID and password, once | AccessID, then the grid's own prompts (the password, then the Google Authenticator code), asked only after the host key matched the pin, and never stored (`extension/src/core/signin.ts:1-27`). |
| On the grid | append to `~/.ssh/authorized_keys` | One restricted line, `restrict,command="<shared>/bin/hpcworker gate" ... beethoven-browser <date>` (`extension/src/core/contract.ts:1077-1084`), written by `hpcworker browser-key add`. Beethoven refuses, before anything is sent, a key type or blob that is not exactly an Ed25519 or P-256 public key (`contract.ts:1250-1261`, the client's check); the framework checks again (the type prefix and the 68- or 140-character length, `bk_parse_key` in the hpcworker repository's `framework/lib/browser_key.sh`) and answers `HPCW-KEY refused key` (`framework/contract-text/V12_CONTRACT.md` "The sign-in sheet"). There is one line per account, and the key counts as enrolled only when a second connection made with it names the same account. |
| Afterwards | no more MFA | The key reaches only the gate's eight verbs (version, status, watch, connect with `--login never`, stop, restrict, read, forget). A Claude sign-in asks for the password and code again, and **Forget this computer** removes the line. |

A plain append would give a key held by a browser a full shell on the grid. The gate line limits it to
eight verbs.

## Not yet measured, or not checked

- Anything of the bridge on a real Mac: the script zip, the binary, the `.pkg`, Gatekeeper's dialogs,
  Chrome starting a host that still carries the quarantine mark, and `/usr/bin/perl` there.
- Whether the current-user-home `.pkg` installs with no administrator password, the property Greg's
  15:41Z decision pays for.
- The signed `.msi` and `.pkg`, never yet built, signed, notarized or opened; SmartScreen's verdict
  on a new publisher, and for how long.
- On a student's Windows: whether SmartScreen or Smart App Control stops the script zip's installer,
  and whether the zip Beethoven makes in memory (a `blob:` download) carries the Mark of the Web.
- What an on-campus network does to outbound port 22.
- What Wayne State expects of ssh from off campus without the VPN: not checked here; no statement of
  C&IT's on it has been read, and asking C&IT settles it.
- Chrome or Chromium installed from Snap or Flatpak starting the host.
- Edge and Chromium starting the host from the manifests the installers write for them.
- The installed binary edition's first hello on a real Mac and on a real Windows machine.

## Pages read on 2026-10-04

developer.chrome.com (Native messaging; the extension service worker lifecycle; What's new in Chrome
116 for Extensions; New permission prompt for Local Network Access; Direct Sockets; Isolated Web Apps
introduction; release notes 137, 145 and 147); WICG `local-network-access/explainer.md`; Apple
(support.apple.com 102445, Platform Security on Gatekeeper, the macOS 10.15 and 12.3 release notes,
"Notarizing macOS software before distribution"); learn.microsoft.com (SmartScreen overview, Smart App
Control overview, Set-ExecutionPolicy); RFC 8709; MDN `SubtleCrypto.exportKey()`; Wayne State KB
20239; SOCRadar on PEEP. Read again on 2026-10-05 for this revision: the Isolated Web Apps
introduction and the extension service worker lifecycle page. Greg's analysis was read again from Drive
the same day.
