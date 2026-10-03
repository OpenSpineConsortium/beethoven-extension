# Beethoven 12.0.0 package, helper, guides, store kit and reviewers' mock portal

**Superseded by 13.0.0** (`release/13.0.0/README.md`, built 2026-10-03), which fixes a panel that
waited with no button on a dead worker (and, once framework 13 is on the grid, on one whose next job
was cancelled): install that one, not this copy.

Built 2026-10-02 at 20:23 UTC from this repository's working tree (not yet committed; `extension/`,
Node 22.23.3: `node helper/build.mjs`, `npx tsc --noEmit`, `npm run build`, `npm run zip`, then
`npx vitest run` with the built package present). Checksums of every file in this folder are in
`SHA256SUMS.txt`.

**Nothing in 12.0.0 has signed in to the Wayne State grid.** Every sign-in, key and gate below was
proven against ssh servers run on this computer (a WSL OpenSSH 9.6 configured like the grid, and an
asyncssh stand-in running the real framework 11), on the mock portal, and in Playwright's Chromium.
The build's only contacts with `grid.wayne.edu:22` were three connections, made by the build streams
before this pass, that ended at the server's banner or its answer to the unauthenticated "none"
request, with no password, key or signature sent. The final pass made none. 11.0.0 was built and
never submitted, so this release and the store documents carry 11.0.0's changes as well.

| File | For | Size (bytes) |
|---|---|---|
| `beethoven-12.0.0-chrome.zip` | The private Chrome Web Store listing, and nothing else | 497,984 |
| `bridge/` | The three helper zips and `manifest.json`, the same bytes as inside the package (`bridge/` there), with `SHA256SUMS.txt`, for a lab lead who wants to read them separately | 4 files and the sums, below |
| `guides/` | `INSTALL.md`, `USE.md` (students), `ACCOUNTS.md`, `LAB_LEAD.md` (Greg), copied from `docs/guides/`, and `STUDENT_QUICKSTART.md` (one page) | 5 files |
| `store-kit/` | Every file the dashboard asks for, in the order of `docs/store/PASTE.md`, one file per Test instructions box, and a note on the out-of-date screenshots | 18 files, below |
| `store-kit-12.0.0.zip` | The same folder in one zip (as `store-kit-12.0.0/...`) | 2,729,222 |
| `reviewer/beethoven-mock-portal.zip` | Only for a store reviewer who asks for the mock portal (`docs/store/SUBMISSION.md`, section 4) | 101,318 |
| `SHA256SUMS.txt` | SHA-256 of every other file in this folder | |

As with 8.0.0 to 10.0.0, the Chrome zip is the only package: no Edge, Firefox or Safari package, and
no download on the website. Students install from the private listing once they are approved and in
its Google Group; the helper comes **inside** the package, offered by the extension's own page, so
nothing for students is hosted anywhere else. Upload this copy
(`release/12.0.0/beethoven-12.0.0-chrome.zip`), not `extension/.output/`, which the next build
rewrites.

## What 12.0.0 changes against 11.0.0

**For the student.** 11.0.0 reached the grid only through Open OnDemand, which needs GlobalProtect
every time. 12.0.0 tries the **direct way** first: ssh from the student's own computer to
`grid.wayne.edu:22`, no VPN.

- **The helper ships inside the extension.** A browser cannot open a socket, so a small script on the
  student's computer carries the encrypted ssh bytes to `grid.wayne.edu:22` and nowhere else. The
  panel offers it once ("One small download, once", **Download for** Windows, macOS or Linux): the
  page reads the zip from the package, writes this extension's own ID into its `allowed_origins.json`
  and saves that copy. It installs without administrator rights (Windows: `install.cmd` runs
  PowerShell 5.1 with `-ExecutionPolicy Bypass` for that file only; macOS: `install.command`, Perl at
  `/usr/bin/perl`; Linux: `install.sh`, Perl or Python 3), asks before it acts, and has an
  uninstaller. Nothing is compiled, signed or notarized; nothing comes from the website. Helper
  1.0.0, protocol 1.
- **Beethoven's own sign-in sheet**, once per computer: the AccessID, then the grid's own prompts (the
  password, then the Google Authenticator code), sent only inside the encrypted session after the
  grid's host key matched the pinned `SHA256:kLTz1x...`, and never kept. Three refusals in a row
  pause it for fifteen minutes. The grid's "wrong code, or no 2FA" refusal asks which: **Type the code
  again**, or **I don't have a grid code yet**.
- **A key in the browser.** In that first session Beethoven adds one restricted line to the
  student's `~/.ssh/authorized_keys`; later connections sign in with the key and ask for nothing.
  The line runs only framework 11's gate, which can never sign a worker in to Claude. **Windows Hello
  / Touch ID protection is opt-in**: off by default, offered on the sheet, once after setup and in
  Settings, and can be turned off again. **Forget this computer** removes the key and the line.
- **No grid code yet?** Two routes to OnDemand's 2FA Setup: on this computer (GlobalProtect), or with
  a phone, with QR codes drawn on the device (GlobalProtect and Google Authenticator in both stores,
  Wayne State's KB 20242), each address printed under its code, and the 2FA Setup warning ("Already
  have a grid code? Don't run 2FA Setup: it replaces your code, and the old one stops working.")
  wherever a step could lead to running it twice.
- **GlobalProtect stays**, unchanged from 11.0.0, behind **Use GlobalProtect instead**, and the
  direct way can be chosen again (**Try the direct way again**, or Settings, **Direct when possible**).
- No browser-only bridge exists (Chromium lets only Google's Secure Shell open sockets, and it offers
  other extensions no byte stream), so that provider is a stub that says "not available"; the relay
  provider is code that stays "not configured" (Wayne State's profile names none).

**In the package**, compared entry by entry with the 11.0.0 build
(`extension/.output/beethoven-11.0.0-chrome.zip`, 403,198 bytes, never submitted): 38 entries then,
42 now.

- **Added:** `bridge/beethoven-bridge-windows.zip` (12,663), `bridge/beethoven-bridge-mac.zip`
  (9,174), `bridge/beethoven-bridge-linux.zip` (13,202) and `bridge/manifest.json` (906).
- **Changed:** `manifest.json` (version 12.0.0; permissions now storage, alarms, scripting,
  nativeMessaging, sidePanel, with the optional `https://*/*`; 11.0.0 had the same without
  `nativeMessaging`); `background.js` (191,075 to 296,797 bytes: the ssh client, the bridges, the
  keyring, the sign-in sheet's flow, the gate channel); the page chunks (`chunks/options-*.js`,
  `chunks/sidepanel-*.js`, and the shared `chunks/parts-*.js` with `assets/parts-*.css`, now
  `chunks/routes-*.js` with `assets/routes-*.css`); `options.html` and `sidepanel.html` (only the
  chunk names); `profiles/wayne.json` (adds `ssh_host`, `ssh_port`, `ssh_host_key`, `ssh_relay`
  null and `grid_2fa_help_url`); `LICENSE.txt` (version 8 to 9), `PRIVACY.md` (9 to 10) and
  `THIRD_PARTY_NOTICES.md` (the QR codes of the phone route; the ssh client, the passkey wrap and the
  Bridge as Licensor's own work, run on the system's PowerShell, Perl or Python).
- **The same, byte for byte (26):** `content-scripts/portal.js`, the eight fonts and their two
  licence texts, the thirteen icons, and `tour/diagram.js` and `tour/diagram.css`.

`TERMS_VERSION` is 9, dated 2026-10-02, so a student who accepted 11.0.0's agreement accepts the new
one again. The approval check sends the same fields as 11.0.0 (`v`, `access_id`, `portal`,
`product`, `version`, `install_id`), and on the direct way only after the grid has accepted the
sign-in. The texts' every changed sentence, with its reason, is in `docs/TEXTS_V9_V10.md`.

**On the grid**: framework 11 (`framework/`, not yet published; framework 10 is live at
`/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`) adds `hpcworker browser-key add|remove|check`,
the gate (eight verbs; `connect` always `--login never`; caps of three worker names a week, twelve
connects an hour and two watches), `worker watch --json`, and reads the site profile with awk and
bash, so nothing Beethoven types starts `python3` on the login node. `tools/deploy_shared.sh` checks
the profiles with `hpcworker profile check` (no `python3`) and refuses to move `current` from 11 back
below 11.

## What was checked on these files

All on 2026-10-02, on Greg's Windows 11 laptop and its WSL Ubuntu 24.04. Logs are in this session's
scratchpad, `v12/build/assemble/logs/`.

- **Extension:** `npx tsc --noEmit` exit 0; `npm run build` (Chrome MV3 and Firefox MV2) and `npm
  run zip` exit 0; `npx vitest run` after the build: **40 files, 459 of 459 tests passed, none
  skipped**, so the hygiene tests read this built package. The zip holds 42 entries; no `.map`, no
  `.ts`, no key or certificate, no `sourceMappingURL`, no `eval(` or `new Function(`. The packaged
  `LICENSE.txt`, `PRIVACY.md` and `THIRD_PARTY_NOTICES.md` are byte-identical to the repository's.
  SHA-256 `d6c9ca3c379cd84f29f79ce0f7157181a79972fc83e55a6fe4f110ecd3de44cc`.
- **Manifest** (read from this zip): version 12.0.0; permissions exactly `storage`, `alarms`,
  `scripting`, `nativeMessaging`, `sidePanel`; `optional_host_permissions` `https://*/*`; no
  `host_permissions`, `content_scripts`, `externally_connectable` or `key`; nothing names
  claude.ai, claude.com or anthropic.com. The Firefox build asks for no `nativeMessaging` (it is not
  shipped).
- **Helper:** `node helper/build.mjs` reproduced the four files in `extension/public/bridge/` byte for
  byte, and `--check` passed. Installers on Windows **16 of 16** (the placeholder build refused, a
  lone `install.cmd` refused, `install.cmd` from the Windows zip into a path with a space and an
  accented letter, the 17-case wire suite against the installed host, Chromium 153 starting it through
  `connectNative` with hello in 2.1 s, `uninstall.cmd`, the test registry key removed); on Linux under
  WSL **19 of 19** (Perl and Python installs, 17 of 17 each, and the macOS installer's logic under bash
  5). Nothing was run on a Mac.
- **Framework 11** (a copy of the working tree in WSL): `bash framework/tests/run.sh` **351 of 351**
  under bash 5.2.21 with Python 3.12.3, and **351 of 351** again with bash 4.2.46 (EL7's) first on
  PATH; `tests/e2e_sshd.sh` against a real OpenSSH 9.6p1 with StrictModes on and the grid's
  algorithms: **59 of 59, "E2E ALL OK"**. `tools/deploy_shared.sh --here` into a scratch folder: v11
  published, `wayne.json: ok` from `profile check`, a second publish idempotent, a v10 build refused
  while `current` names v11, and the ssh command line 22,832 characters (limit 30,000).
- **End to end in a browser** (Playwright's Chromium 153, the package with a test key, the Windows
  helper installed from the panel's own download, a local asyncssh grid running framework 11; never
  the grid): **13 FAIL, 100 passed and 1 failed**; **14 PASS, 48 of 48**; **15 FAIL, 40 passed and 3
  failed**; **16 PASS, 47 of 47**. Scenario 13's one failure is "Expected around ..." on moment 9:
  the stand-in's fake `squeue` gives no start time (`N/A`), so the estimate path is not exercised
  there. Scenario 15's three are on 11.0.0's GlobalProtect path on the mock: "Expected around ..."
  was not seen within the harness's 75 s, and while it waited the worker got its computer (20:49:58
  UTC) and came online with claude.ai opened (20:50:04), so the harness missed moments 11 and 12 (it
  reached them at 20:50:14). The same three checks failed intermittently on 11.0.0's own scenario 1
  (`v11/e2e/verify/final_all.log`, and the race recorded in
  `v11/e2e/evidence/race-pressed-lost-01/`); whether this run's are that race or only the harness's
  wait was not established. Seen working, among the rest: the saved helper zip is the packaged one
  with only `allowed_origins.json` changed to the extension's own ID, and its `install.cmd`
  installed; "Waiting for the helper." after the download; the "wrong code, or no 2FA" refusal
  asking which; three refusals pausing the sheet with GlobalProtect first; one restricted line
  written and the approval check sent only after the grid accepted, with no new field; the Claude
  sitting in the held session; every later read through the forced gate; Forget removing the line;
  the opt-in passkey on and off and **Locked · Unlock** after a real browser restart with nothing
  signed in before Unlock; a wrong host key stopping before any user name, with a quiet Try again;
  the door down; 320 px with reduced motion; "Use GlobalProtect instead" undone from Settings; the
  verification guard saw no attempt to reach `grid.wayne.edu`. The test registry key
  (`HKCU\Software\Chromium\NativeMessagingHosts\com.openspineconsortium.beethoven.bridge`) was
  written by `install.cmd` in each scenario and removed at its end; it is absent now, and the Chrome
  and Edge keys hold only their earlier entries.
- **The reviewers' mock portal zip** was unzipped into a scratch folder, given a certificate with the
  recipe's `openssl` line, started with `MOCK_LOGGED_IN=false node server.mjs --port 18443 --host
  localhost --user st1234 --cert cert.pem --key key.pem`, and answered `GET /login` with 200 and "Sign
  in as st1234"; then stopped.
- **No secret** in this folder, `helper/` or `extension/public/bridge/`, zip members included: no key
  or certificate file or block, no token-shaped string (the one match, `rec.password = 'accepted'` in
  the mock's `server.mjs`, is a log label).

## The helper zips (`bridge/`)

| File | Size (bytes) | Opens | SHA-256 |
|---|---|---|---|
| `beethoven-bridge-windows.zip` | 12,663 | `install.cmd` | `cc9f0d5abcf9433f9ca27cb0067a9dc1acec604e4650113de688320ab0d3320b` |
| `beethoven-bridge-mac.zip` | 9,174 | `install.command` | `ddefba0df0d7e4c7053ce5002eebd473436805f8d656b360383731c47d30959e` |
| `beethoven-bridge-linux.zip` | 13,202 | `install.sh` | `761b4c8a0dd39dd62242fa052978912f7bf8c7c8011cd9a7886e41ebd8246ffa` |
| `manifest.json` | 906 | | lists the three, the helper 1.0.0, protocol 1 |

**These are the packaged files, and their installers refuse to run as they are.** Each carries the
placeholder origin `chrome-extension://REPLACE_WITH_EXTENSION_ID_SEE_HELPER_README/`
(`manifest.json`: `"origins_filled": false`), because Chrome starts a native messaging host only for
the extensions its manifest names, and the store's ID is known only after the first upload. A
student never gets this file: the extension's page writes `["chrome-extension://<its own ID>/"]` into
a copy and saves that (`extension/src/core/bridgeZip.ts`; every other entry is copied byte for byte,
modes included). A lab lead who wants a working copy saves it from Beethoven's own panel or Settings,
or builds one with `node helper/build.mjs --store-id <ID>` (`helper/README.md`). A zip saved by a
student therefore has a different SHA-256 from the one above.

## The store kit

The folder lists in the order of `docs/store/PASTE.md`; the number in front of each name is the
field number there (fields 2, 3 and 9 to 11 are typed; `12` is the Test instructions tab). `PASTE.md`
in the kit is the same file as `docs/store/PASTE.md`.

| File | Size (bytes) | What it is |
|---|---|---|
| `00-beethoven-12.0.0-chrome.zip` | 497,984 | the package (the same bytes as the zip beside this folder) |
| `01-description.txt` | 1,650 | the detailed description: ASCII, LF line breaks, no newline at the end (1,671 if each line break counts two) |
| `04-store-icon-128.png` | 3,738 | store icon, 128x128, RGBA, 96 px of artwork in transparent padding (still true) |
| `05-promo-video-1280x720.mp4` | 1,361,824 | 9.0.0's promo video: **out of date** (its toolbar-button start); leave the field empty |
| `05-promo-video-thumbnail.png` | 92,699 | its thumbnail, **out of date** with it |
| `06-promo-tile-440x280.png` | 17,152 | small promo tile, a drawing (still true) |
| `07-screenshot-1-your-grid.png` | 92,115 | screenshot 1: the site's diagram, a drawing (still true) |
| `07-screenshot-2-click-once.png` | 110,892 | screenshot 2: 9.0.0's strip, **out of date** |
| `07-screenshot-3-sign-in-once.png` | 145,472 | screenshot 3: 9.0.0's strip with the portal shell, **out of date** |
| `07-screenshot-4-seventeen-checks.png` | 215,125 | screenshot 4: 9.0.0's Details checks, **out of date** |
| `07-screenshot-5-by-approval-only.png` | 143,363 | screenshot 5: 9.0.0's setup-page Access card, **out of date** |
| `07-SCREENSHOTS-OUT-OF-DATE.txt` | 1,268 | the same notes, in the kit |
| `08-marquee-1400x560.png` | 81,960 | marquee tile, a drawing (still true) |
| `12-test-username.txt` | 96 | Test instructions, Username, no newline at the end |
| `12-test-password.txt` | 0 | Test instructions, Password: empty, as the box stays |
| `12-test-instructions-500.txt` | 487 | Test instructions, Additional instructions (490 if each of its 3 line breaks counts two; limit 500), no newline at the end |
| `12-test-instructions-long-reply.txt` | 4,792 | not a box: the fuller text for a reply to a reviewer (4,818 if each line break counts two) |
| `PASTE.md` | 23,117 | the paste sheet: every field, in the dashboard's order |

The images are 9.0.0's, unchanged through 11.0.0 (`extension/store-assets/manifest.txt`); each is
byte-identical to its source there. Screenshots 2 to 5 and the video show screens 12.0.0 no longer
has: **capture five new screenshots from this build before submitting** (`PASTE.md`, field 7, lists
them), on the mock account `st1234` only, with no real AccessID, code or key fingerprint on screen.
The four `12-` files and `01-description.txt` are the blocks in `PASTE.md`, byte for byte.

The Additional instructions (487 characters), checked against the words of this build:

```
Beethoven runs Claude Code in a Wayne State grid account. Needs the user's AccessID, password, 2FA code, Claude Pro/Max and our approval; we cannot lend accounts.
1. Install: welcome page. Tick, Agree and continue. Chrome asks for ondemand.grid.wayne.edu only.
2. Panel: One small download, once offers the helper inside the package (bridge/), a script relaying only to grid.wayne.edu:22. Please don't sign in to the real grid. Use GlobalProtect instead skips it.
Mock portal on request.
```

## The reviewers' mock portal

`reviewer/beethoven-mock-portal.zip` holds 30 files under `beethoven-mock-portal/`: `server.mjs`,
`lib/` (`common.mjs`, `jobs.mjs`, `jobsim.mjs`, `tool.mjs`) and `bin/` (`hpcworker`, `sbatch`,
`scancel`, `sinfo`, `squeue`, Unix mode 0755) from `extension/mock-ood` (11.0.0's mock, unchanged
since), a `package.json` naming `ws` 8.22.0, and `node_modules/ws/` (its MIT `LICENSE` included).
No extension source, no type declaration, no certificate or key, no source map. It plays the portal
path only: the direct way is not part of the mock, and the recipe tells a reviewer to press **Use
GlobalProtect instead**. It is sent only to a reviewer who asks.

## What is not proven, and the tests only Greg can run

Unproven, because no sign-in was made on the grid: OpenSSH 7.4 on warrior taking the restricted
`restrict,command=".../current/bin/hpcworker gate"` line with an `ssh-ed25519` key; StrictModes on
Wayne State homes; warrior's bash 4.2.46, coreutils 8.22 and gawk 4.0.2 running the gate; whether
warrior's bash prints `~/.bashrc` output before a forced command; whether a **mistyped** Google
Authenticator code gives the same "either typed in the wrong code, or..." text; the modes of the
folders above the lab's copy (framework 11 refuses enrolment while one is group-writable and not
sticky); the grid's reaction to failed sign-ins; what OnDemand's 2FA Setup page shows on a phone;
real Windows Hello and Touch ID with the PRF extension, especially after a browser restart (a
virtual authenticator cannot show it); anything on a Mac; Smart App Control, App Control, a Group
Policy execution policy or a third-party antivirus; and whether the Chrome Web Store accepts a
package carrying installer scripts (a Google staff note of 2016 said native hosts belong in a
separate installer).

`docs/V12_STATUS.md`, section 4, has the steps in full:

- **G0 (5 minutes, read only, GlobalProtect on).** `stat -c '%A %U:%G %n'` on `/rs`,
  `/rs/rs_grp_oschome`, `.../shared`, `.../shared/beethoven` and `.../hpcworker`. Any folder with a
  group or other `w` and no `t` must change before students enrol (C&IT for the root-owned volume).
  Then publish framework 11 (`tools/deploy_shared.sh --site wayne --dry-run`, then without
  `--dry-run`) and run `hpcworker browser-key check`: it must end `HPCW-KEY check ok`.
- **G1 (about 25 minutes, VPN off).** A throwaway ed25519 key enrolled through OnDemand with
  `browser-key add`, then `ssh ... version` from WSL with the VPN off must print `HPCW-GATE ok 11
  never go2432 claude=...`; `cat /etc/passwd` must be refused; `forget` must answer `HPCW-KEY
  forgotten`. Then the extension's own first sign-in from a separate test Chrome profile, a restart
  of that Chrome (the Grid line **Direct**, nothing asked), **Connect** or **Stop** with the VPN off,
  and **Forget this computer**.
- **G2 (5 minutes, iPhone).** Whether a phone can paste into OnDemand's shell. Never press Launch on
  2FA Setup with your own account. What the 2FA Setup page shows on a phone (a typable setup key, or
  a link to Google Authenticator) can come only from a student with no code yet, or from C&IT.
- **G3 (5 minutes each).** Real Windows Hello, and Touch ID on a Mac: protection ticked on the sheet,
  Chrome restarted (**Locked · Unlock**, one prompt), off and on again in Settings, **Forget this
  computer**. On the Mac, also write down exactly what macOS shows for `install.command`.

## Accounts and subscriptions

**None new.** The helper is a script every system already runs, shipped inside the package, so there
is nothing to compile, sign or notarize, and no relay to rent. What the lab already has stays: the
Chrome Web Store developer account (a one-time fee; Google's page states no amount, secondary
sources say US$5), the `Beethoven-users` Google Group (free), the access service on Cloudflare
Workers (Free 100,000 requests a day; Paid from US$5 a month; which plan the account is on was not
established), Resend (Free, US$0 for 3,000 e-mails a month; Pro US$20 a month) and the domain.
Each student still needs, all free through Wayne State unless noted: an AccessID with a grid account,
Google Authenticator set up for the grid (once, through OnDemand's 2FA Setup on the VPN), Microsoft
Authenticator and GlobalProtect, Chrome, and Claude Pro (US$17 a month billed annually, or US$20
monthly) or Max (from US$100 a month), which the student pays.

Optional, from `guides/ACCOUNTS.md` (prices fetched 2026-10-02; "secondary" means the vendor's page
showed none without scripts):

| Option | Cost | What it removes or adds |
|---|---|---|
| Apple Developer Program | US$99 a year (fee waiver only for an organization enrolment) | Only for a compiled, notarized macOS helper; the script helper needs none and students meet Gatekeeper's **Open Anyway** once |
| Microsoft Azure Artifact Signing | US$9.99 a month for 5,000 signatures (secondary) | Only for a compiled `.exe`; a `.cmd` cannot be signed. Unsigned, students see "Unknown Publisher" once |
| OV or EV code-signing certificate | not priced | as above |
| A lab-run relay (small VM, TLS, a DNS record) | about US$50 to 75 a year: DigitalOcean US$4 or 6 a month, Lightsail US$5, or Google Cloud's free e2-micro; Let's Encrypt free | No helper needed; needs a named maintainer, C&IT told first and a new privacy statement. A Cloudflare Worker relay is barred by Cloudflare's self-serve terms 2.2.1(j) without written permission, and advised against |
| Cloudflare Zero Trust | free to 50 users, then US$7 a user a month (secondary) | Only the optional second wall on the access service's `/admin` |
| Google's Secure Shell as the student's terminal | free, no account | A later candidate, not in 12.0.0 |
| The Isolated Web App pilot's signing key | free (kept offline) | A developer-mode pilot for a student who asks; not in the runtime chain |
| A Microsoft account | free | To send Microsoft a helper file Defender wrongly flags |

## Not done here

Nothing was committed, tagged, uploaded to the store or YouTube, published to the grid or deployed.
Framework 11 is not on the grid; the access service is unchanged; the website's support and
reviewers page sources are updated in the site repository's working tree, but `tools/build_site.py`
was not run, so `terms.html` (version 9), `privacy.html` (version 10), `support.html` and
`reviewers.html` are not regenerated or published (reviewers open the privacy URL). The five
screenshots are not captured. No Chrome Web Store install or update from 10.0.0 was tried, the
Firefox build is not shipped, and no one has seen this kit in the real dashboard. The repository's
`CLAUDE.md` and `SECURITY.md` still say `nativeMessaging` is never requested and the MFA step is never
touched, which 12.0.0 changes; they wait for Greg.
