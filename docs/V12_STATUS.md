# Beethoven 12.0.0 and framework 11: where the build stands

2026-10-02, after the build streams, the four reviews, the fix passes and the final assembly (section
3.7). **Nothing here was run against
the Wayne State grid with a sign-in.** The build's only contacts with `grid.wayne.edu:22` were three
connections that ended at the server's banner or its answer to the unauthenticated "none" request,
with no password, key or signature sent (section 3.6); nothing reached `ondemand.grid.wayne.edu` or
the live access service except through the mock's stand-in. Every sign-in, key and gate in this
document was proven against ssh servers the build ran itself on this computer. Nothing was committed,
pushed, deployed, uploaded or tagged. The release folder is `release/12.0.0/` (its `README.md` and
`SHA256SUMS.txt`).

Versions: extension 12.0.0; framework 11 (`framework/VERSION`); the helper ("the Beethoven bridge")
1.0.0, protocol 1 (`helper/VERSION`); `LICENSE.txt` version 9 and `PRIVACY.md` version 10, both dated
2026-10-02; `TERMS_VERSION` 9. The contract between the pieces is `docs/V12_CONTRACT.md`; the
students' and the lab lead's guides are in `docs/guides/`.

## 1. What 12.0.0 does differently from 11.0.0

**The direct way first, GlobalProtect second.** 11.0.0 reached the grid only through Open OnDemand,
which needs GlobalProtect every time. 12.0.0 first tries ssh to the login node from the student's own
computer, with no VPN (decision D3), through the first bridge the browser has: a browser-only bridge
(none exists, so a stub that says "not available"), a relay the site profile names (none is named, so
"not configured"), then the helper that ships inside the extension. Only when none works does it use
11.0.0's portal path, unchanged, behind **Use GlobalProtect instead**.

**The helper inside the package** (decision D1). A browser cannot open a socket, so a small program on
the student's computer carries the encrypted ssh bytes to `grid.wayne.edu:22` and nowhere else. It is a
script every system already runs (a `.cmd` launcher and Windows PowerShell; Perl on macOS and Linux,
Python 3 where Perl is absent), so nothing is compiled, signed or notarized. The extension offers its
installer from its own package, as a zip the page writes the extension's own ID into before saving;
nothing comes from the website. The installer needs no administrator rights, asks before it acts, and
writes only into the student's own folders and their own part of the registry. It holds no credential,
logs nothing it carries, has no shell.

**Beethoven's own sign-in sheet.** The first direct sign-in is the student's: AccessID, then the grid's
own prompts (the password, then the Google Authenticator code), typed into an extension page and sent
only inside the encrypted session, after the grid's host key matched the pin (`SHA256:kLTz1x...`), and
never kept (R2). Three refusals in a row stop the sheet for fifteen minutes. The grid's refusal "wrong
code, or no 2FA set up" names two causes, so the sheet asks which: type the code again, or "I don't
have a grid code yet", and only then the two routes to set one up. The signed-in session is held for
up to ten minutes so the first Connect's Claude sign-in needs no second password.

**A key in the browser, opt-in protection** (decision D2). In that session Beethoven makes a key in the
browser and adds one restricted line to the student's `~/.ssh/authorized_keys`; from then on the
browser signs in with the key and the line can run only framework 11's gate, which can never sign a
worker in to Claude (R3). Windows Hello or Touch ID protection is off by default, offered on the sheet,
once after setup, and in Settings, and can be turned off again. **Forget this computer** removes the
key and, through the gate, the line.

**Setting up the grid code, on a computer or on a phone.** For a student with no Google Authenticator
code, two routes to OnDemand's 2FA Setup app: on this computer (with GlobalProtect), or with a phone
(GlobalProtect on the phone), with QR codes drawn on the device for the GlobalProtect and Google
Authenticator store pages and Wayne State's KB 20242, each address printed under its code, and the 2FA
Setup warning wherever a step could lead to running it twice.

**Framework 11** (the grid side): `hpcworker browser-key add|remove|check`, the gate with eight verbs
and its caps, `worker watch --json`, `connect` and `claude login --plain` with or without a terminal,
and, new in this pass, **no python3 on the login node for anything Beethoven types**: the site profile
is read and the job file and workspace guide are filled by awk and bash (`lib/profile.awk`,
`lib/profile_sh.sh`), byte for byte as `profile.py` did (section 3.1).

**Texts and documents.** The agreement (version 9) and the privacy statement (version 10) describe the
direct way, the helper, the key and its limits, the held session and the refusal pause
(`docs/TEXTS_V9_V10.md` lists every changed sentence with its reason). Four guides: `INSTALL.md`,
`USE.md` (students), `ACCOUNTS.md` and `LAB_LEAD.md` (Greg). The store documents
(`docs/store/`) and the website's support and reviewers page sources are brought up to date.

## 2. Greg's orders, and where each landed

| What Greg asked (2026-10-02) | What was built | Departure, and why |
|---|---|---|
| "the phone based vpn approach, which should just display a qr code linking to the instructions for downloading global protect on ios, along with a link to instructions for setting up grid 2fa (KB 20242)" | The phone route: QR codes for GlobalProtect (App Store and Google Play), Google Authenticator (both stores) and KB 20242, drawn on the device with the address printed under each; the welcome page and **What you need** also show KB 20314 (Wayne State's GlobalProtect guide) as a code. | The phone route's GlobalProtect code opens the app store page, not KB 20314, because KB 20314 covers Windows, macOS and ChromeOS only (read from the saved page). The App Store address was corrected in review (`id1400555706`, fetched with a 200; the first build's `id1135985407` was a 404). |
| "native integration between the google authentication app and the on screen qr code displayed by the interactive app" | The route tells the student to scan the 2FA Setup page's code with Google Authenticator from another screen, or, on a phone, to type the setup key if the page shows one. | **Not delivered.** A phone cannot scan its own screen, and Beethoven cannot read or link into OnDemand's page (it is behind the VPN, and Beethoven runs nothing there). Whether the 2FA Setup page shows a typable key, or a link that opens Google Authenticator, is not known (test G2). |
| "tries the ssh, nonvpn approach, possibly requiring a password as first and then sets up the ssh key for future seamless connectivity" | Built as asked: the direct way first; the first sign-in with password and code; the key enrolled in the same session; later connections ask for nothing but a Claude sign-in. | None in the design. Proven only against local servers (section 4). |
| "explore any possible way to do the helper program in the browser, possible using another extension on the google marketplace, or cloudflare, or a web-based ssh ... only resorting to a local terminal as the last resort" | Explored (section 5.1). No browser-only bridge exists: Chromium lets only Google's Secure Shell open sockets and it offers other extensions no byte stream; a Cloudflare Worker relay is forbidden by Cloudflare's terms; web ssh services run the client or relay on someone else's server. | The helper is a program on the student's computer, the last resort Greg named, because nothing else can carry the bytes. It needs no terminal on Windows or macOS (Linux: one command). The store bridge is a stub; the relay is code that stays "not configured". |
| "could you bootstrap compile the helper on the local machine entirely browser based without admin permissions ... or distribute the helpers as binaries with the extension" | Distributed inside the extension as scripts (D1): no compile, no admin. | No compiled binaries ship: exploration C built Go binaries for six systems in scratch (about 21 MB, unsigned), but on Windows Chrome still starts them through `cmd.exe`, they draw more store scrutiny, and unsigned binaries meet the same warnings. "Bootstrap compiling in the browser" was not pursued: the result would still be a file to save and run. |
| "Where students download the helper" (raised to Greg; no answer recorded) | From the extension's own package: an extension page offers it. | The website hosts no helper, which keeps Greg's earlier rule. |
| "students [have] the option to not use windows hello or touch id ... they can opt in if they want" | Off by default everywhere; opt-in on the sheet, once after setup, or in Settings; off again in Settings. | The default key is stored wrapped under a non-extractable browser key beside it, not as a plain non-extractable key, so protection can be turned on and off on the same key with no grid change. Costs, said in the texts: extension code could export it, and protection turned on later does not reach older copies of the browser's files. Decision 1 in section 7. |
| "build this end to end and test it and create the release package for 12.0" | Built and tested end to end on this computer (section 3); the release package is `release/12.0.0/` (section 3.7). | Not committed; the commit is the maintainer's. |
| "DETAILED INSTRUCTIONS FOR INSTALLING AND USE AND ANY NEW SUBSCRIPTIONS OR ACCOUNTS" | `docs/guides/INSTALL.md`, `USE.md`, `ACCOUNTS.md`, `LAB_LEAD.md`. | ACCOUNTS's short answer: no new account or subscription is needed. |

## 3. What ran, and against what

Logs are in this session's scratchpad, `v12/build/` (`fixB/`, `final/`, `review-*`, `explore*`,
`helper/`, `core/`, `framework11/`).

### 3.1 Framework 11 (this pass, under WSL, a copy of the working tree)

- **The suite** (`bash framework/tests/run.sh`): `bash -n` of every script, the rendered job file's
  syntax, LF line endings, then **351 unittest tests, all passed** under bash 5.2.21 with Python 3.12.3
  (475 s), and **351 of 351 again with bash 4.2.46** (EL7's, built from source) first on PATH (502 s).
- **The ssh end-to-end test** (`tests/e2e_sshd.sh`, a real OpenSSH 9.6p1 `sshd` on 127.0.0.1, StrictModes
  on, the grid's algorithms): **59 of 59 checks, "E2E ALL OK", under bash 5.2 and again with the copy run
  by bash 4.2.46.** Its watch check is now scoped to its own folder (a review saw it fail on another
  session's process).
- **No python3 on the login node**: `tests/test_login_node.py` runs every line the extension types (an
  install, the first connect of a never-set-up account, every gate verb, `browser-key add`, and the first
  command after the profile changed) with a failing stand-in for every banned program first on PATH and
  python3 replaced by a recorder: **no python3 call, and no banned program looked up.**
- **The awk and bash reader against `profile.py`** (`tests/test_profile_awk.py`, 23 tests): the schema
  line by line; the P_ lines byte for byte for Wayne State's profile and profiles bent to reach every
  branch (escapes, `\u` and surrogate pairs, non-ASCII, a repeated key, an older account's file, odd
  numbers); the verdict and the words of `validate` for about 90 profiles; `get`; the job file and the
  workspace guide byte for byte (slurm, PBS, LSF, a proxy module, `proxy_env`, a CA bundle, binds,
  overrides); the refusals; and that nothing in the caller's environment can fill a placeholder. Passed
  with **gawk 5.2 and with mawk 1.3.4** as `awk` (with mawk: 70 of 70 across the parity, login-node,
  guide and render tests), and on the Windows checkout with Git Bash's gawk 5.0 (142 tests across the
  parity, guide, login-node, command-line, render and profile tests: all passed, 5 skipped as
  Linux-only). The whole suite was not re-run on the Windows checkout.
- **Speed** (WSL): reading Wayne State's profile with awk took 25 to 35 ms beyond sourcing the tool (about
  55 ms); load, job file and guide together 130 to 210 ms; `profile.py shellenv` alone took 110 ms on the
  same machine. Not measured on warrior.
- What changed in the framework in this pass, each with tests: python3 removed (above); a folder above
  the lab's copy that others may write is refused unless sticky; `authorized_keys.beethoven-prev` never
  keeps a Beethoven line; the names cap counts a name for 7 days after its last use and the student's own
  sign-in clears it; a `restrict` of a name with no run takes no name (it counts toward the hour); a gate
  watch takes no slot for a run that does not exist, and `worker` gives a slot back however it ends;
  `browser-key add` is refused under the gate by `HPCW_GATE`, not by `SSH_ORIGINAL_COMMAND` (which a
  site's own ForceCommand would set; the Claude sign-in keeps both walls); `claude consent --record`
  refuses under the gate; `job.key` is gone (the job file is filled afresh at every start: nothing is
  reused from a folder others might change); `hpcworker profile check [FILE]` gives `validate`'s verdict
  without python3; README brought in line (three statements a review found untrue, and the new rules).

### 3.2 The helper (the helper stream and the observing review)

Windows installers 15 of 15 (the suite against the installed host, Chrome for Testing 153 starting it
through `connectNative`, a path with a space and an accented letter); Linux installers 18 of 18 (Perl and
Python hosts, and the macOS installer's logic under bash 5); the 19-case wire suite against each installed
host (Windows PowerShell, Linux Perl, Linux Python); a whole publickey sign-in through each to a grid-like
OpenSSH 9.6. Typical numbers: hello in about 2 s on Windows (0.08 s on Linux), echo round trip 11 ms on
Windows (1.3 ms Linux), 4 MiB each way in 1.8 s on Windows. Microsoft Defender raised nothing in about 25
runs. Exploration C saw Chrome 154 download the bundled files with no warning but with the Mark of the
Web, and Windows show "Open File - Security Warning ... Unknown Publisher ... Run" when the installer was
opened from Explorer. **Nothing was run on a Mac.**

### 3.3 The extension (the reviews' runs; the fix pass's own report has its final numbers)

At the time of the reviews: `npx tsc --noEmit` clean; `npm run build` and `npm run zip` succeed (Chrome
zip 491,005 bytes); vitest 445 of 445 across 39 files after the observing review's seam fixes. The
security review's own probes 9 of 9 (the pin refusing before any secret, a 1-byte-per-read handshake,
`--login never` never outranked, the helper's allowlist enforced before an open, protection on and off
keeping the same public key). The extension was then fixed in parallel with this pass against the four
reviews (the enrolment line's real answer, `rc.log` out of the gate's reads, the refusal pause, the code
question, the wording the guides now quote, the helper zip made out to the extension at download time,
Forget with a locked key, and others). The final numbers on the release build are in section 3.7.

### 3.4 End to end in a real browser, against a local grid stand-in (the observing review)

Playwright's Chromium 153 with the built 12.0.0 extension and a manifest key, the Windows helper
installed from the panel's own download by its installer, and a local asyncssh "grid" (the grid's
algorithms, an RSA host key, its two prompts, an account with no code) whose key sessions run real
framework 11 from the working tree. Scenario 13 (the first run, returning, the stand-in down, Forget)
88 passed and 4 failed; 14 (the opt-in passkey, CDP virtual authenticator with PRF) 45 and 1; 15 (no
helper, the GlobalProtect path) 38 and 5; 16 (the door: down, a wrong host key, reduced motion at 320
px) 44 and 1. The failures were product issues the review listed (among them: "Use GlobalProtect
instead" could not be undone, Settings unreachable in the first session, the welcome page's iPhone and
Android tabs, a wrong-host-key stop with no way on, and the enrolment check that read the framework's
answer wrongly, which the review fixed). Seen working: one restricted line written and the approval check
sent only after the grid accepted, the Claude sitting in the held session, every read through the forced
gate with no pty, a wrong host key stopping before any user name was sent, Forget removing the line.
The fix pass re-ran them on its build, and the final assembly re-ran them on the release build
(section 3.7).

### 3.5 Exploration (what was established by running or reading, not assumed)

- **A store extension as the bridge** (exploration A): Chromium's source allows the `sockets` key and
  Direct Sockets to Google's Secure Shell (stable and dev) and to platform apps only; Secure Shell's
  external API refuses its ssh channel to other extensions (observed). A second extension can open
  Secure Shell's terminal and act as its ssh agent (observed against a local sshd), which keeps the key
  in Beethoven but lets Beethoven read nothing back.
- **Relays and accounts** (exploration B): Cloudflare's self-serve agreement section 2.2.1(j) forbids
  using the services "to provide a virtual private network or other similar proxy services"; a lab-run
  relay is feasible for about US$50 to 75 a year with a named maintainer; third-party web ssh services
  fail R2 to R4. Prices in `guides/ACCOUNTS.md`.
- **The script helper** (exploration C): the wire contract run in Chromium 153, Chrome 154 and Chrome for
  Testing 151 under WSL; Chrome's 1 MiB cap exact; downloads from an extension page need no `downloads`
  permission; the Mark of the Web and the Windows dialogs above.

### 3.6 Contacts with the grid

Three connections to `grid.wayne.edu:22` in the whole build: two by the helper stream (the banner
`SSH-2.0-OpenSSH_7.4` through the Windows and the Perl host, nothing sent) and one by the extension's
core (the host key pin matched, the host key's signature verified under the negotiated algorithm, the
encrypted "none" exchange completed with the user name `beethoven-pin-check`, nothing more). None
reached OnDemand. This pass made none.

### 3.7 The final assembly (the release build, 2026-10-02)

The release package `release/12.0.0/beethoven-12.0.0-chrome.zip` (497,984 bytes, SHA-256
`d6c9ca3c379cd84f29f79ce0f7157181a79972fc83e55a6fe4f110ecd3de44cc`) was built from this working tree
and checked as follows; logs in `v12/build/assemble/logs/`.

- `node helper/build.mjs` rewrote `extension/public/bridge/` byte for byte as it was, and `--check`
  passed (the zips carry the extension-ID placeholder by design: the page writes the ID in).
- `npx tsc --noEmit` exit 0; `npm run build` and `npm run zip` exit 0; `npx vitest run` after the
  build: 40 files, **459 of 459** passed, none skipped (the built-package hygiene tests ran). The
  packaged texts are byte-identical to the root ones.
- Framework 11 under WSL: **351 of 351** under bash 5.2.21 and again under bash 4.2.46, and
  `tests/e2e_sshd.sh` **59 of 59**.
- Helper installers: Windows **16 of 16** (Chromium 153 starting the installed bridge, hello in 2.1 s),
  Linux **19 of 19**.
- The browser harness's direct-way scenarios on this release build (Playwright's Chromium 153, the
  package with a test key, the Windows helper installed from the panel's own download, the local
  asyncssh grid running framework 11; never the grid): **13 FAIL, 100 passed and 1 failed**; **14
  PASS, 48 of 48**; **15 FAIL, 40 passed and 3 failed**; **16 PASS, 47 of 47**. Scenario 13's one
  failure is "Expected around ..." on moment 9: the stand-in's fake `squeue` gives no start time
  (`N/A`), so the estimate path is not exercised there. Scenario 15's three are on 11.0.0's
  GlobalProtect path on the mock: "Expected around ..." was not seen within the harness's 75 s, and
  while it waited the worker got its computer (20:49:58 UTC) and came online with claude.ai opened
  (20:50:04), so the harness missed moments 11 and 12 (it reached them at 20:50:14). The same three
  checks failed intermittently on 11.0.0's own scenario 1 (`v11/e2e/verify/final_all.log`, and the
  race recorded in `v11/e2e/evidence/race-pressed-lost-01/`); whether this run's are that race or
  only the harness's wait was not established. Seen working, among the rest: the saved helper zip is
  the packaged one with only `allowed_origins.json` changed to the extension's own ID, and its
  `install.cmd` installed; "Waiting for the helper." after the download; the "wrong code, or no 2FA"
  refusal asking which; three refusals pausing the sheet with GlobalProtect first; one restricted
  line written and the approval check sent only after the grid accepted, with no new field; the
  Claude sitting in the held session; every later read through the forced gate; Forget removing the
  line; the opt-in passkey on and off and **Locked · Unlock** after a real browser restart with
  nothing signed in before Unlock; a wrong host key stopping before any user name, with a quiet Try
  again; the door down; 320 px with reduced motion; "Use GlobalProtect instead" undone from Settings;
  the verification guard saw no attempt to reach `grid.wayne.edu`. The test registry key
  (`HKCU\Software\Chromium\NativeMessagingHosts\com.openspineconsortium.beethoven.bridge`) was
  written by `install.cmd` in each scenario and removed at its end; it is absent now, and the Chrome
  and Edge keys hold only their earlier entries.
- `tools/deploy_shared.sh` (section 8's two changes, now made): `--here` into a scratch folder under
  WSL published v11 with `wayne.json: ok` from `hpcworker profile check`, published again idempotently,
  and refused a v10 build while `current` named v11 ("Nothing changed"); its ssh command line would be
  22,832 characters (limit 30,000).
- The reviewers' mock-portal zip (rebuilt from 11.0.0's mock, unchanged since: 30 files) answered
  `GET /login` with 200 and "Sign in as st1234" by its own recipe.
- No secret under `release/12.0.0/`, `helper/` or `extension/public/bridge/`, zip members included.
- No connection to `grid.wayne.edu`, `ondemand.grid.wayne.edu` or the live access service.

## 4. What is unproven, and the tests only Greg can run

Unproven, because no sign-in was made on the grid:

- OpenSSH 7.4 on warrior accepting a `restrict,command=...` line with an `ssh-ed25519` or
  `ecdsa-sha2-nistp256` key, and the forced command running the gate.
- StrictModes on Wayne State's home folders admitting the line; whether `$HOME` is a link there (refused).
- Warrior's bash 4.2.46, coreutils 8.22 and gawk 4.0.2 running the gate, `browser-key` and `profile.awk`
  (bash 4.2.46 and two other awks were tested here; gawk 4.0.2 and coreutils 8.22 were not).
- Whether warrior's bash reads `~/.bashrc` before a forced command (the extension reads lines by prefix).
- The modes of `/rs/rs_grp_oschome`, `shared`, `shared/beethoven`: `browser-key add` now refuses while any
  of them is group-writable and not sticky.
- The grid's own reaction to failed sign-ins (fail2ban or similar) and to a held connection per student.
- `srun` without `--pty` relaying standard input on Slurm 23.02 (Beethoven uses a pty, so this matters
  only for other callers).
- What OnDemand's 2FA Setup page shows on a phone; whether a phone can paste into OnDemand's terminal.
- A real Windows Hello or Touch ID with the PRF extension, before and after a browser restart (virtual
  authenticators lose PRF on export, so a real restart could not be shown).
- Anything on a Mac: Gatekeeper's dialogs for the installer, whether `bash install.command` skips them,
  `/usr/bin/perl`, Chrome starting a quarantined host.
- Smart App Control, App Control or AppLocker, a Group Policy execution policy, a third-party antivirus.
- The Chrome Web Store accepting a package that carries installer scripts.

**G0. Before anything (5 minutes, read only, on warrior with GlobalProtect on).**

```
stat -c '%A %U:%G %n' /rs /rs/rs_grp_oschome /rs/rs_grp_oschome/shared /rs/rs_grp_oschome/shared/beethoven /rs/rs_grp_oschome/shared/beethoven/hpcworker
```

Any folder with a group or other `w` and no `t` must change before students enrol (`LAB_LEAD.md`,
section 2). Then publish framework 11 (`tools/deploy_shared.sh --site wayne`, after the two changes in
section 8) and run `bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker
browser-key check`: it must end `HPCW-KEY check ok`.

**G1. Your key on the real grid, with the VPN off (about 25 minutes).** The 12.0.0 extension shows no
screen with its public key, so the OnDemand half uses a throwaway key of the same kind, and the
extension's own first sign-in enrols its own key.

1. In WSL, a throwaway key that is never used for anything else: `ssh-keygen -t ed25519 -N '' -C
   bt-g1 -f ~/bt-g1`, and `cat ~/bt-g1.pub`.
2. GlobalProtect on. In OnDemand's shell: `bash
   /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker browser-key add ssh-ed25519
   <the base64 part of bt-g1.pub>`. Expect `HPCW-KEY added SHA256:...`, and `grep beethoven-browser
   ~/.ssh/authorized_keys` shows one line beginning `restrict,command="/rs/.../current/bin/hpcworker gate"`.
3. GlobalProtect off (check that OnDemand no longer loads). In WSL:
   `ssh -F /dev/null -o IdentitiesOnly=yes -o IdentityAgent=none -o MACs=+hmac-sha1 -i ~/bt-g1 go2432@grid.wayne.edu version`.
   Pass: `HPCW-GATE ok 11 never go2432 claude=...` (perhaps after lines your `~/.bashrc` prints).
   Then `... go2432@grid.wayne.edu 'cat /etc/passwd'` must answer `HPCW-GATE refused`; `ssh -t ...
   version` must not give a shell; `... forget` answers `HPCW-KEY forgotten`. Delete `~/bt-g1*`.
4. The extension's own path. A separate test Chrome (`chrome.exe --user-data-dir=C:\bt-test`), the
   12.0.0 build loaded, the helper installed from its panel, GlobalProtect off. Sign in on the sheet with
   your AccessID, password and Google Authenticator code. Pass: **This computer is set up.**, one
   `beethoven-browser` line on the grid (check later through OnDemand), and, after closing and reopening
   that Chrome, the **Grid** line **Direct** with nothing asked; then **Connect** (or **Stop**) works
   with the VPN off. Afterwards **Forget this computer**, and delete the test profile.

**G2. The phone (5 minutes, iPhone; never with your own grid code at risk).** With GlobalProtect on the
phone, open OnDemand's shell in Safari, copy a short line from Notes, long-press in the terminal and see
whether **Paste** appears and runs. Do **not** press Launch on 2FA Setup: it would replace your code.
What the 2FA Setup page shows on a phone (a typable setup key, a link to Google Authenticator) can be
learned only from a student who has no code yet, or from C&IT; ask, and write the answer into
`USE.md`, part 2, Route B.

**G3. Real Windows Hello and Touch ID (5 minutes each).** In the G1 test profile, sign in afresh with
**Protect my key with Windows Hello / Touch ID** ticked on the sheet. Note what Chrome and Windows ask.
Restart that Chrome: the **Grid** line says **Locked · Unlock**; **Unlock** asks once and the panel goes
on. Turn protection off in Settings, then on again; **Forget this computer** (it asks to unlock first if
locked). Check the passkey list (Windows **Settings**, **Accounts**, **Passkeys**). The same on the Mac
with Touch ID, which also settles the Mac helper's first-run dialogs: write down exactly what macOS
showed, for `INSTALL.md`.

## 5. Departures from the orders and the rules, and why

### 5.1 Which bridges exist as code, and which only as stubs

| Bridge | State in 12.0.0 | Why |
|---|---|---|
| A browser-only bridge from another store extension | **Stub** that answers "not available" | None can exist: Chromium allows sockets to Google's Secure Shell alone, and Secure Shell refuses its ssh channel to other extensions (observed). Secure Shell as the student's terminal with Beethoven as its ssh agent works against a local server, but Beethoven reads nothing back and the first password would go into Secure Shell's window, not Beethoven's sheet; a later candidate, free, not built. |
| A relay (WebSocket to a server that relays to port 22) | **Code**, inactive: "not configured" unless the site profile names `ssh_relay`; Wayne State names none; no ticket is ever requested | A Cloudflare Worker relay is forbidden by Cloudflare's self-serve terms (2.2.1(j)) and would share an account with the access service; a lab-run server is possible (about US$50 to 75 a year) but needs a maintainer, C&IT's agreement and a new privacy statement. |
| The helper inside the package | **Real**, the first working path | D1. Scripts, no compile, no admin. |
| An Isolated Web App with Direct Sockets | **Separate pilot**, not in the runtime order | Works on this laptop, but installs only through two developer flags with a warning bar at every start; WebAuthn is refused on its origin. Given only to a student who asks (texts, LICENSE section 1). |
| Compiled helper binaries | **Not shipped** | Built in scratch by exploration C (Go, six systems); unsigned, about 21 MB, still started through `cmd.exe` on Windows. Optional later. |

### 5.2 Other departures

- **The key's form** (D2 says "a non-extractable WebCrypto key"): stored wrapped under a non-extractable
  browser key beside it, used non-extractable (section 2). Decision 1.
- **The held password session**: the first sign-in's session stays open up to ten minutes for the first
  Claude sign-in; disclosed in LICENSE 5(b)(ii) and PRIVACY. Decision 2.
- **The refusal pause**: three refusals pause the sheet for fifteen minutes per AccessID (the security
  review: "Try again" used to reset the count at once).
- **Framework 11 refuses a group-writable folder above the lab's copy** (the security review; the
  framework stream had reported it without refusing). At Wayne State this may block every enrolment
  until `/rs/rs_grp_oschome` is made sticky or loses group write (G0). Decision 3.
- **The gate's names cap** counts a name for seven days and is cleared by the student's own sign-in (the
  framework review: a renamed worker was locked out for good).
- **No python3 on the login node** (R7): framework 11's first build still ran it for the first connect,
  for `install --shared` and after each publish; this pass replaced those calls with awk and bash, held
  to `profile.py`'s output byte for byte by tests.
- **The phone route's "native integration"** with Google Authenticator: not delivered (section 2).
- **R2's sheet**: the password and code are "dropped once sent" rather than "cleared": a browser cannot
  promise when memory is overwritten (the texts say so).

## 6. What the website and the store still need

**Website** (`openspineconsortium.github.io`): the support and reviewers page sources are updated
(`tools/pages/beethoven/support/body.html`, `reviewers/body.html`; checked against the site build's own
rules: no other browser named, no package link, the notice address word for word). Still to do: run
`tools/build_site.py` to regenerate `terms.html` (version 9), `privacy.html` (version 10), `support.html`
and `reviewers.html`, check them (`docs/PUBLISHING_SITE.md`), and publish them before the store review
(reviewers open the privacy URL). The site hosts no helper and no package link.

**Chrome Web Store** (`docs/store/`): the release folder `release/12.0.0/` exists with
`SHA256SUMS.txt`, built from the uncommitted working tree (two builds of that tree, the fix pass's and
the final assembly's, gave the same Chrome zip, SHA-256 `d6c9ca3c...`); after the commit, a rebuild from
the clean tree should be compared with it; the five screenshots captured again from 12.0.0 (`PASTE.md`, field 7) with no real
AccessID, code or fingerprint; the promo video field left empty; the Privacy practices tab with the new
`nativeMessaging` justification and "Authentication information" ticked; the Test instructions walked on
the release build (the mock now shows the helper's screen first: the recipe says to press **Use
GlobalProtect instead**); the first upload. No rebuild for the store item's ID is needed: the helper zip
is made out to the extension at download time. Open risk: whether the store accepts installer scripts
inside the package (a 2016 Google staff note said native hosts belong in a separate installer).

**Other texts** to bring in line, outside this pass's files: the repository's `CLAUDE.md` and
`SECURITY.md` still say `nativeMessaging` is never requested and the MFA step is never touched (true of
11.0.0, not of 12.0.0).

## 7. Decisions for Greg

1. **The default key**: keep it wrapped under a browser key (protection on and off on the same key, no
   grid change; extension code could export it), or make it strictly non-extractable (turning
   protection on later then makes a new key and asks for the password and code once more).
2. **The held password session** (up to ten minutes, for the first Claude sign-in): keep, or drop it and
   ask for the password and code a second time.
3. **The folders above the lab's copy**: ask C&IT to make `/rs/rs_grp_oschome` sticky (or remove group
   write), and fix any folder of yours below it; or move the lab's copy to a path whose every parent is
   safe. Until then, framework 11 refuses every student's key.
4. **Key lifetime**: set `browser_key_days` in `wayne.json` (none today), so a lost laptop's key lapses.
5. **An emergency switch** that makes the gate refuse everything without touching students' files: not
   built; a small framework change if wanted.
6. **The pilot app and the one-installation rule**: a student using both the pilot and the extension
   would be refused on one of them (LICENSE section 1 counts the pilot as an installation).
7. **Counsel** to read LICENSE version 9 and PRIVACY version 10 (`docs/TEXTS_V9_V10.md` has the questions).
8. **C&IT**: send the note in `LAB_LEAD.md`, section 3, and wait for the answer before students use the
   direct way.
9. **Secure Shell as a later path** (free, no account; section 5.1): build it in a later version, or not.
10. **Where students download the helper**: from the extension's package, as built (your earlier rule);
    say if you want it elsewhere.

## 8. Changes outside the fix passes' files

- Done in the final assembly: `tools/deploy_shared.sh` checks each site profile with `bash
  "$dest/bin/hpcworker" profile check "$f"` (awk; the same verdict) instead of `python3 .../profile.py
  validate`, and refuses to move `current` from version 11 or later back below 11 (every key would
  meet a copy with no gate); `extension/public/LICENSE.txt`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md`
  re-synced by the build's prebuild step (`test/terms.test.ts` passes).
- Still open, for Greg: `CLAUDE.md` and `SECURITY.md` at the repository's root (section 6) still say
  `nativeMessaging` is never requested and the MFA step is never touched.
- Anything that copies `framework/` by a file list must include `lib/profile.awk` and
  `lib/profile_sh.sh` (`deploy_shared.sh` takes every file under `lib/`; `hpcworker install` of an own
  copy lists them).
