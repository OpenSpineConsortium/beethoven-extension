# Beethoven: the browser extension

One codebase (WXT + TypeScript, plain DOM) for Chrome and Edge (MV3 service worker + side panel),
Firefox (MV2 persistent background + sidebar) and a Safari build for Apple's packager. It starts,
monitors and stops a Claude Code worker on the student's own Open OnDemand cluster and hands them
the worker's Claude environment link and session name. It talks to the portal the student connects
and, after the agreement is accepted, to the maintainer's access service and site (below); never to
claude.ai.

Beethoven runs Claude Code and is not an Anthropic product; "Claude" and "Claude Code" are Anthropic's marks,
used here to say what it runs; "Open OnDemand" is the mark of its publisher.

## What it never does

- No code on claude.ai: no content script, no host permission, no fetch patch. The green "Open in
  Claude" button and the Google Drive step only open a claude.ai page in a new tab (`browser.tabs.create`,
  which needs no `tabs` permission).
- No Claude credential: it never reads, stores or relays one. The sign-in is Claude Code's own paste-code
  flow on a compute node (`hpcworker claude login --plain`, typed into the portal's own shell from the
  strip's terminal); the extension opens Anthropic's page in a tab, passes the code the student pastes
  into its one box on to that shell as keystrokes, keeps the code nowhere, and reads only what the probe
  job and the worker report from `claude auth status`. It never reads an Anthropic page or the clipboard.
- No `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger` or `identity` permission, and no
  install-time host permission. The portal origin is requested from the toolbar click on a portal tab
  (or the setup page's Connect button); the page script is registered for that origin at runtime
  (`scripting.registerContentScripts`) and loaded into the already-open tab (`scripting.executeScript`).
- No remote code. The kill-list is JSON, verified with WebCrypto Ed25519 against the bundled public key.
- No cookie read, anywhere (`test/hygiene.test.ts` checks the source), and no licence key: see *Access* below.
- Nothing deleted on the cluster, ever: it writes files, touches the framework's stop file and the
  student's own `.restricted` marker, and types hpcworker's verbs. Removing a marker is the student's
  job in the portal's Files app.
- Nothing durable beyond the portal hostname and origin, preferences, the acceptance record, the
  account name the portal's dashboard showed with the access service's last answer (and the
  `services.json` it read), the on-device audit log, the last good kill-list, the per-workspace data statement, the
  student's own checklist ticks, and three small notes the strip keeps (the Claude links it opened, the
  time of the last sign-in it saw, the probe job it submitted). Connection state lives in `storage.session`.

## Layout

```
wxt.config.ts               the manifest (per the report's permission table; no default_popup: the toolbar button is the "go" button)
src/entrypoints/
  background.ts             the toolbar click (open the strip, ask for the portal origin, load the page script into the tab, all in one gesture);
                            alarms (status files every 60 s, kill-list and access check daily); the ONE place the access service is asked;
                            the message broker; the ONE worker-start path; the once-only opening of the Claude link
  portal.content.ts         the page script on the portal origin: the ONLY network client; hosts the sign-in terminal behind a port
  sidepanel/                the flight strip (side panel / sidebar / a tab on Safari)
  options/                  the setup page (options_ui, opened on install and from right-click > Options): agreement, access, connect/disconnect, statement, settings, audit export, Google Drive step
src/core/
  steps.ts                  the strip's state machine: a pure function from facts to the one step (status line, one button or one automatic action)
  facts.ts                  gathering those facts from storage, the browser and the cluster (reads only)
  connect.ts                connecting a portal: grant, register the page script, load it into the open tab, ping until it answers
  portal.ts                 PortalClient: every OOD endpoint, fetch+WebSocket injected; PUN warm-up with backoff; existence from listings; the login shell
  shell.ts                  the Shell app driver: one command line, framed output, 3146 reasons; the interactive sitting for the sign-in
  login.ts                  the sign-in terminal's reader: the framework's plain-mode lines out of the shell's frames
  install.ts                setting up the cluster: link the lab's shared copy (one line), else upload the bundled framework and run its install once
  audit.ts  redact.ts       the chokepoint: audit record per request, one floor clock per class, redaction, revocation
  diagnostics.ts checks.ts  the node model (id, title, dependsOn, assumption, manualFix, futureRisk, check, repair) and the 17 checks
  worker.ts                 start and stop (and the consent marker), shared by the strip, the Details buttons and the background
  contract.ts               files and commands shared with framework/ (paths, status.json, connection.json, probe.json, the registration block, the plain-login lines)
  terms.ts disclosure.ts    the agreement mechanics; the plan-class disclosure and the per-workspace data statement
  keys.ts messages.ts       storage keys; the message bus types and the login port's frames
src/licensing/
  access.ts                 the approval check: services.json, the POST to access_check, the caches (24 h yes, 7 days' grace, 10 min no), the pure decision
  signed.ts keys.json       the Ed25519 token verifier (port of grid/license.js in the vendor's VS Code extension) and the one public key the kill-list is signed with
  killlist.ts               the signed kill-list: shape, verification, fail-safe refresh; withdraws versions only
src/ext/                    storage.ts (browser.storage as the KV the core expects), connectApi.ts (the browser behind core/connect.ts)
src/ui/                     strip.ts, terminal.ts, details.ts, options.ts, sections.ts, dom.ts, rpc.ts, style.css
public/                     LICENSE.txt and PRIVACY.md (copied from the repository root by scripts/sync-framework.mjs at build time), icons
scripts/sync-framework.mjs  bundles ../framework into public/framework/ and copies the agreement texts before every build and zip
mock-ood/                   a mock Open OnDemand portal (server.mjs, only dependency: ws) with fake scheduler commands and a seeded hpcworker
test/                       vitest: the step machine, connecting, the plain-login reader, the statement, access, kill-list, audit, shell, diagnostics, worker, source hygiene, integration against the mock
```

## Build

Node 22. On the Windows machine: `export PATH=/c/Users/grego/tools/node22:$PATH` in Git Bash.

```
npm ci                      # pinned: wxt 0.21.4, vite 8.3.1, typescript 5.9.3, vitest 5.0.2, ws 8.22.0, @types/node 22
npm run build               # -> .output/chrome-mv3 and .output/firefox-mv2 (runs scripts/sync-framework.mjs first)
npm run zip                 # -> .output/*.zip (+ the Firefox sources zip AMO requires)
npm run typecheck
npm test
```

`npm run build:safari` emits `.output/safari-mv3` for `xcrun safari-web-extension-packager` (untested: needs a Mac; a manifest hook strips the Chrome-only side-panel keys from that build).
`npm run build:dev` is the Chrome build with `http://localhost/*` added to the optional host permissions so the
mock portal can be connected over plain http; a release build never lists it.

## Load unpacked

- Edge: `edge://extensions`, turn on Developer mode, "Load unpacked", pick `.output/chrome-mv3`.
- Chrome: `chrome://extensions`, Developer mode, "Load unpacked", pick `.output/chrome-mv3`.
- Firefox: `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", pick `.output/firefox-mv2/manifest.json`.

On install the setup page opens (manifest `options_ui`; also right-click the toolbar button, then Options):
accept the agreement (scroll to the end, four statements, typed name, "Accept and Continue"). There is nothing
else to enter; everything else happens from the strip.

## Three steps: install, open your portal, click the button

The toolbar button is the "go" button. Clicked from an Open OnDemand tab (a `/pun/` page, or the portal already
connected), it opens the strip (side panel in Chrome and Edge, sidebar in Firefox, a tab in Safari) and, in the same
gesture, asks the browser for that one origin, registers the page script for it and loads the script into the tab
that is already open (a runtime registration alone leaves an open tab without the script until it is reloaded; that
was the "Receiving end does not exist" seen on the live portal). The strip then walks the steps by itself and asks
only when a person must act:

| # | step | by itself | asks the student |
|---|---|---|---|
| 1 | portal tab open | | connect this portal / open my portal |
| 2 | portal awake and signed in | GET the dashboard; on 5xx or `/nginx/init` wait 2 s, 5 s, 10 s ("waking up your portal...") | sign in to the portal in its tab |
| 3 | agreement | | read and accept it, once per browser profile (the setup page) |
| 4 | access approved | the background asks the access service about the account the dashboard shows (cached: yes 24 h, no 10 min) | "Ask for access" when not approved: opens the request page with the account filled in; read-only checks are never blocked on it |
| 5 | tool installed | where the site profile names a shared folder (`shared_install`): one line, `hpcworker install --shared`, run from the lab's copy, nothing uploaded; elsewhere, or when the account cannot read that folder: upload the bundled framework, run `hpcworker install` once | |
| 6 | probe run | submit the five-minute probe once, wait for `probe.json` | |
| 7 | signed in to Claude on the cluster | open the sign-in terminal (below) | sign in on Anthropic's page, paste the code |
| 8 | data statement | | read where the work goes, tick the statement (once per workspace; written to `~/.hpcworker/consent`) |
| 9 | worker started | `hpcworker worker start` through the background's one start path (60 s floor) | |
| 10 | worker online | read `status.json` / `connection.json` every 10 s for two minutes after a start, then every 60 s | |
| 11 | open in Claude | open `environment_url` in a new tab the first time this browser sees it (setting, on by default) | the green button afterwards |

**The sign-in terminal.** When the probe (or a running job's `needs: login`) says there is no Claude sign-in on the
cluster, the strip shows a small terminal: the page script opens the portal's Shell WebSocket (same client, same
CSRF scrape) and types exactly `bash ~/.hpcworker/bin/hpcworker claude login --plain`. The output is rendered with
codes stripped and auto-scrolled; the framework's lines drive it: `AUTH-URL: <url>` opens that page in a new tab
(only `claude.ai` or `claude.com`, over https) and focuses the one box, "Paste the code from that page here";
Enter sends the code plus a carriage return as keystrokes and clears the box; `SIGNED-IN` marks the step green and
the machine goes on to start the worker; `HPCW-LOGIN-FAILED` shows one sentence and a Retry. The code is never
stored anywhere: not in storage, not in the audit log (whose one record for the sitting carries the byte counts of
what was read and typed), not in the page beyond the box. The terminal is a port from the strip to the page script,
so closing the strip closes the shell; no keep-alive frames are sent (the shell's own output is the only traffic);
the framework's own ten-minute limit ends a sitting nobody finished. The paste-code step stays manual by design:
it is the credential boundary, and the extension never reads an Anthropic page or the clipboard.

**Details** (collapsed under the strip) keeps the worker card with the buttons (set up the cluster again, run the
probe again, sign in on the cluster, start, stop, read status now) under one line saying which copy of the tool
the account runs ("tool: the lab's shared copy, version N" or "tool: your own copy, version N", never with a path,
with the one-line note when the shared copy could not be used), the seventeen checks, `rc.log`, the audit log with its export, the
access line, the settings and the Google Drive step with its done box.

## What the strip and the buttons do on the cluster

- **A start** types one line (`hpcworker worker start --name N --permission-mode M`) after the data statement
  for that worker's workspace is on record and the workspace is not marked restricted; when the statement's
  consent marker has not reached the cluster yet (the portal was away when it was made), the start writes
  `~/.hpcworker/consent` ("yes <iso time> <install id>") first. Every start, from the strip or from the
  background's setting, goes through the background's one start path, which gathers the facts afresh and starts
  only when the machine says it is the next step; at most one start is in flight.
- Once the job registers, the strip shows the green **Open in Claude** button (it opens the
  `https://claude.ai/code?environment=env_...` link the job reported, and nothing else), **Copy link**, and
  "Find `<session name>` under Code in the Claude app". A first message cannot be prefilled on claude.ai (no code
  runs there); the strip says so in one line. Claude Code names the session itself (`asx10-hazy-meadow` in the
  maintainer's run); the name and link are read from `connection.json`, `status.json`, or the registration block
  in `rc.log` (`parseRegistration` in `contract.ts`).
- **Stop** touches the framework's stop file `<state>/<name>/stop` through the Files app (a write, no floor) so the
  job leaves on its own and ends its own chain; then, if the scheduler floor allows it, the tool's own
  `hpcworker worker stop` runs once. A stopped worker stays stopped until the student starts it again: the strip
  offers one **Start again** button (also for a worker that ended with a problem), and that press is the one start
  the background accepts for a stopped or failed run; it waits out the scheduler floor like any other start.
- **Start my worker when I open my portal** (Settings; on by default, `DEFAULT_PREFS` in `keys.ts`, and the
  settings text says so): the background runs the same start path when the portal tab connects and at the
  once-a-minute check; a start that would break the scheduler floor waits for the next minute; a stopped or
  failed worker is never started this way.
- **After the sign-in**: a job that still says `need_login` right after the panel's terminal reported `SIGNED-IN`
  is given three minutes to re-ask (it does so every 60 s) before the sign-in step comes back; a sign-in made from
  this browser in the last ten minutes outweighs an older "not signed in" from the probe or from a job that checked
  before it. The sign-in sitting itself is a scheduler call (it runs `srun` on the login node): once a minute, and
  the panel closes it after fifteen minutes at the latest (`SESSION_MAX_MS`, the privacy statement's number).
- **Updating the tool**: an account on the lab's shared copy (the marker `~/.hpcworker/shared` names the folder)
  is never updated by the extension: the lab keeps that copy current in one place, and Details shows the version
  its `VERSION` file holds. An account with its own copy has `~/.hpcworker/VERSION` compared with the bundled
  `framework/VERSION` on every look at the cluster; an older or missing one is set up again (upload, one
  `install` line; the tool keeps the profile and prints `upgraded 2 -> 3`; where the site keeps a shared copy,
  that update is the move to it), and an update that ran and left the old number behind is reported once, not
  repeated.
- **Open claude.ai when the worker connects** (Settings; on by default): the first time this browser sees the
  worker's link it opens it in a new tab; afterwards the green button does.
- **Mark this workspace restricted** (in the statement) touches `<workspace>/.restricted`; check 16 and every start
  refuse a workspace so marked (or one a profile's `restricted_workspaces` names). Whether a file exists is read
  from its directory's JSON listing, never from a download: the Files app answers a download of a missing file with
  200 and an HTML page (58,730 bytes on the live portal), and every download whose content type is `text/html` is
  treated as "not a file".

## Floors (one clock per class, `src/core/audit.ts`)

| class | what | floor |
|---|---|---|
| `scheduler` | a shell line that submits or cancels: `hpcworker probe`, `hpcworker worker start|stop`, `sbatch`, `scancel` | 60 s |
| `jobs` | the portal's Active Jobs read and its DELETE cancel (the portal runs squeue/scancel) | 60 s |
| `discover` | the login-node discovery batch (`hpcworker discover`, `diag`, or the fallback with one `sinfo`) | 60 s |
| `shell` | any other single line through the bootstrap shell (`install`, `install --shared`; the fallback waits this clock out between the two) | 15 s |
| `files`, `dashboard`, `probe` | reads and writes through the Files app, the dashboard, the rnode probe | none (paced by the once-a-minute alarm) |

A full "Run the checks" opens the shell once (discover), asks Active Jobs once (jobs) and reads files;
none blocks another, and a check whose clock is still running is skipped with the time left, never
failed. Clearing the audit log keeps the clocks.

## Test against the mock portal

Unit and integration tests need nothing running: `npm test` starts the mock on an ephemeral port.

To drive the extension by hand:

```
npm run build:dev                                  # development build: http://localhost grantable
node mock-ood/server.mjs --port 8080 --user st1234 # http://127.0.0.1:8080 ; sign in at /login
```

Load `.output/chrome-mv3` unpacked, accept the agreement on the setup page, open `http://127.0.0.1:8080/login`, click
"Sign in as st1234", then click the toolbar button on that tab: the strip opens, the browser asks to allow that one
site, and the steps run. Every build asks the real access service, and `st1234` is on its approved list for exactly
this purpose; with another `--user` (the default is `student`) the strip stops at *Ask for access*. A release build
cannot connect plain http: use `--cert`/`--key` and `--host localhost` (the recipe in `../docs/store/LISTING.md`). The mock
seeds a stand-in `hpcworker` into its home so the install, the probe, the sign-in terminal, "Start worker" and "Stop"
produce the files the strip reads (`status.json`, `connection.json`, `rc.log` with the exact registration block of
Claude Code 2.1.283). Its `claude login --plain` prints the framework's lines (`HPCW-LOGIN`, `AUTH-URL:`, `SIGNED-IN`,
`HPCW-LOGIN-FAILED`) and takes the typed code on its standard input; any code of six or more letters, digits, `#`,
`_` or `-` is accepted (no mock authorize page is needed: the URL is only opened). Flags: `--port N`, `--host H`
(`127.0.0.1` by default), `--user NAME` (the account the dashboard shows; `student` by default), `--home DIR`,
`--approve a,b` and `--access-limit N` (the mock's own stand-in for the access service at `/beethoven/access_check`, for
the tests only: no build points at it), `--rnode enabled` (503
instead of 404 on `/rnode/`), `--no-clusters` (the shell closes 3146 "No clusters defined."), `--cold` (first request
bounces through `/nginx/init`), `--cold-pun MS` (the first `/pun/` request after MS ms of quiet answers 500 once, as
the live portal's per-user nginx does), `--job-composer`, `--no-cookie`, `--cert F --key F` (https with your own
self-signed pair, e.g. from `openssl req -x509 -newkey ed25519 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30`),
`--display-home DIR` (the home the seeded tool prints and records in place of the mock home's real path; by default the
portal's own `/home/<user>`, so the strip's output box reads like a cluster wherever the mock home sits on disk),
`--shared-install [PATH]` (the lab's shared copy of the tool: a second directory, seeded with the stand-in tool, a
`VERSION` and `profiles/mock.json`, served read-only by the Files routes at `PATH`, default
`/lab/shared/hpcworker/current`; a typed line naming `PATH` runs against it), `--shared-version N` (its `VERSION`,
5 by default) and `--shared-unreadable` (an account outside the lab's group: the Files routes answer 403 there and
bash cannot open the shared launcher, exit 127); `MOCK_SHARED_INSTALL=PATH` in the server's environment does
what `--shared-install PATH` does. The strip takes the shared path from the bundled profile of the
site named in Settings, so to see the shared mode by hand, set the site profile name to one whose bundled profile
names the `--shared-install` path (for `wayne`, `--shared-install /rs/rs_grp_oschome/shared/beethoven/hpcworker/current`;
from Git Bash prefix `MSYS_NO_PATHCONV=1`, or the path reaches node rewritten as a Windows path); or open the mock
at `https://ondemand.wayne.localhost:<port>` (Chromium resolves any `*.localhost` name to this machine), which makes
the site `wayne` from the first click, as `ondemand.grid.wayne.edu` does.
The CLI starts the home with the stand-in set up as the account's own copy: `~/.hpcworker/profile.json` and
`~/.hpcworker/VERSION` at the version the build carries (`public/framework/files/VERSION`), so the strip finds the
tool installed and current and uploads nothing; this is what the store reviewer's recipe sees (`tool: your own copy,
version N` under Details). `--fresh-home` starts with the stand-in command only: the strip then uploads the real
framework and runs its install, which refuses a mock site (it has no profile for `localhost`) and whose jobs the
stand-in scheduler would never run anyway, so the upload path can be watched only up to that refusal.
`--shared-install` never seeds an own copy. `createMockPortal` seeds the command only unless `seedInstalled: true`.
A `?download=1` of a file that does not exist answers 200 with an HTML page, as the live Files app does.

Environment variables the seeded tool reads (set them for the mock server's process): `MOCK_LOGGED_IN=false`
(the probe reports no Claude sign-in), `MOCK_CONSENT=false` (the probe reports no Remote Control answer on record),
`MOCK_EGRESS=none` (the probe reports no egress; `http-proxy-auto` is also accepted), `MOCK_ENV_ID=env_01...`
(the environment id in the registration block; by default one stable id per mock home, as Claude Code keys it
to the machine), `MOCK_LOGIN_FAIL=1` (the plain sign-in ends with `HPCW-LOGIN-FAILED` whatever code is typed),
`MOCK_DISPLAY_HOME=/home/st1234` (the same as `--display-home`: the tool's sentences, `status.json` and `connection.json`
carry this home in place of the real one; the files themselves stay where they are). `MOCK_SHARED_INSTALL` and
`MOCK_SHARED_REAL` (set by `--shared-install`: the shared folder as the portal shows it and where it sits on disk)
make the stand-in's `install --shared DIR` behave as framework 5's does: it copies no code, writes a launcher
`~/.hpcworker/bin/hpcworker` (a regular file) that runs the shared one, the marker `~/.hpcworker/shared` naming the
folder and the profile, and moves an own copy aside (never deletes it); its plain `install` moves a marker aside
in turn, and its `version` says which copy runs. The
mock's `worker start` refuses a workspace holding `.restricted`, its `worker stop` writes `stop.done`, and its
`claude login` without `--plain` explains the one-sitting flow (`claude consent` is an alias that explains).

The fake PTY is a real bash (Git Bash on Windows; set `MOCK_BASH` to choose another) running each typed line with
`mock-ood/bin` first on PATH, so `sbatch --parsable`, `squeue`, `scancel`, `sinfo` and `hpcworker` are fakes and the
shell semantics are real. A non-JSON frame closes the mock socket with 1011 and counts in `state.fatal`, because the
real Shell app would crash there.

## The cluster-side contract

`src/core/contract.ts` follows framework version 6 (`framework/VERSION`; `bin/hpcworker`, `lib/login_plain.sh`,
`jobs/probe.sbatch`, `jobs/worker.sbatch.tpl`, `profiles/<site>.json`). The build (`scripts/sync-framework.mjs`, run before every build
and zip) bundles `framework/**` as it is on disk, copies the root `LICENSE.txt` and `PRIVACY.md` over the shipped
copies, and stops with exit 1 when the copied `LICENSE.txt`'s "Version N, date" line disagrees with `TERMS_VERSION`
and `TERMS_DATE` in `src/core/terms.ts`:

- The tool is called as `~/.hpcworker/bin/hpcworker` in both modes: the account's own copy, or, where the site
  profile names a shared folder (`shared_install`, framework 5), a small launcher that runs the lab's copy there,
  with the marker `~/.hpcworker/shared` naming the folder. The extension types exactly one line per action through the
  portal's Shell app: `install --profile <site>` (own copy) or
  `bash '<shared>/bin/hpcworker' install --shared '<shared>' --profile '<site>'` (the lab's copy), `discover`, `probe`, `worker start --name <n> --permission-mode <m>`,
  `worker stop --name <n>`, `diag --json`; and one interactive sitting, `claude login --plain`, in the strip's
  sign-in terminal (the framework prints `HPCW-LOGIN`, `AUTH-URL:`, `SIGNED-IN` and `HPCW-LOGIN-FAILED` lines;
  the extension opens the URL and types the code the student pastes, and never sees the credential).
  `claude consent` is an alias that explains; the data statement writes the consent marker instead.
- The state directory is the profile's `shared_state_dir` (`~/.hpcworker/profile.json`, with `$USER`/`$HOME`
  expanded; CephFS at Wayne State), falling back to `~/.hpcworker`. Under it: `probe/probe.json`,
  `<name>/status.json` (state `starting|need_login|need_consent|running|online|stopped|preempted|error`,
  `claude_login` with `loggedIn`/`email`/`subscriptionType` only, `consent`, `session_name`, `environment_url`),
  `<name>/connection.json` (`session_name`, `environment_url`, `capacity`, ...), `<name>/rc.log`, `<name>/job.id`
  (the chain's current job), `<name>/stop` and `<name>/stop.done`, and the worker's workspace `workspaces/<name>/`
  with the student's optional `.restricted` marker; `~/.hpcworker/consent`, the framework's fallback consent marker,
  written by the extension when the student makes the data statement. `status.json` also carries `needs`
  (`login`, `consent` or `nothing`) and `hint`, the job's own word on what the student must do now.
- Job ids are read from the sentences the tool prints ("submitted as job N", "already has job N",
  "probe job N submitted") and from `sbatch --parsable`'s own output. The session name and environment link
  come from the files, or from the registration block in `rc.log` when the files do not carry them yet.
- The extension reads the files only from the 60-second alarm or a button and never asks the scheduler faster
  than once a minute per class (`Active Jobs` is read for check 7 only; a stop is the stop file).

"Set up the cluster" first reads the bundled profile of the site (`public/framework/files/profiles/<site>.json`).
When it names a `shared_install` folder, nothing is uploaded: one line runs the lab's copy's own install
(`bash '<shared>/bin/hpcworker' install --shared '<shared>' --profile '<site>'`), which sets the account up with
the launcher, the marker, the profile and the PATH block. When bash cannot open that launcher (exit 126 or 127:
an account outside the lab's group, or a folder not there) or the tool refuses the folder, the extension falls
back to the upload below and leaves a one-line note in Details; any other failure is reported as it is. Whether the
account can use the shared copy is judged by that shell line, not by the portal's Files app, whose view of a lab
volume was never measured. Otherwise, it uploads whatever `scripts/sync-framework.mjs` bundled from `../framework`
(text files only, LF endings) to `~/.hpcworker/` with `PUT files/fs`, then runs the install line once; the tool
strips CR endings and copies nothing when it already runs from `~/.hpcworker`. If `framework/` was empty at build
time the button says so instead of installing nothing. The extension never writes into a shared folder: it reads
only `<shared>/VERSION`, to show it, with its own error handling (a 403 there is said, never taken for a portal
that is asleep).

## Access: who you are and whether you may

There are no licence keys (decided 2026-09-29; `src/licensing/access.ts` has the contract in its header). Who
the student is comes from their own sign-in to their Open OnDemand portal: the account name the dashboard shows
for the signed-in session ("Logged in as ...", read by `PortalClient.session()`), never a typed name, never a
cookie, and never the home directory's owner (that fallback names paths only). Whether they may use
Beethoven is the maintainer's approved list, asked by the background alone: it reads `access_check` from
`https://openspineconsortium.com/beethoven/services.json` (cached a day) and POSTs
`{"v":1,"access_id":"<account>","portal":"<hostname>","product":"bridge","version":"7.0.0"}` as
`text/plain;charset=UTF-8` without cookies when the portal tab connects, about once a day, and on a toolbar click
after a no or a failed attempt or once the last yes is a day old; never before the acceptance record is in
storage (the same gate as the kill-list). A yes is kept 24 hours (up to 7 days while the service cannot be
reached; check 1 turns WARN after the first day); a no is kept 10 minutes, and the strip's one button becomes *Ask for access*, which opens
`https://openspineconsortium.com/beethoven/request.html?access_id=<account>`. The one URL taken from an answer is a
page on that site. Workers start only while the answer is yes; read-only checks never wait on it.

## The signed kill-list

Fetched once a day from `https://openspineconsortium.com/beethoven/killlist.json` (the server must send
`Access-Control-Allow-Origin: *`: the extension holds no host permission for that origin). Shape and verification
in `src/licensing/killlist.ts`: outer JSON `{v, kid, issued, revoked_versions, revoked_lids, message, sig}` where
`sig` is `ASHLEYREV1.<base64url payload>.<base64url Ed25519 signature>` over `ASHLEYREV1.<payload>`, the same
scheme and public key as the revocation list of the vendor's VS Code extension, Beethoven for VS Code
(`ASHLEYREV1` is that format's tag, which the issuing tool checks; from 8.0.0 the verifier accepts `BEETHOVENREV1`
as well). Only the signed payload is trusted; offline keeps the last good list; a withdrawn version stops sending
commands (the chokepoint refuses anything that mutates) and still reads status.
Since 4.0.0 the list withdraws versions only; `revoked_lids` is read for older lists and never acted on.

## Store listing pointers

Single purpose, permission justifications (one sentence each, in `wxt.config.ts`), the privacy policy, the
data-collection declaration for AMO, "payment required" wording and the reviewer walk-through belong to the docs
stream (`../docs/`). The manifest emitted for Chrome is the one to paste into the listing's permission section.
