# Ashley Bridge: the browser extension

One codebase (WXT + TypeScript, plain DOM) for Chrome and Edge (MV3 service worker + side panel),
Firefox (MV2 persistent background + sidebar) and a Safari build for Apple's packager. It starts,
monitors and stops a Claude Code worker on the student's own Open OnDemand cluster and hands them
the worker's Claude environment link and session name. It talks to exactly one origin, the portal
the student connects, and never to claude.ai.

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
- No remote code. The kill-list is JSON, verified with WebCrypto Ed25519 against the bundled keys.
- Nothing deleted on the cluster, ever: it writes files, touches the framework's stop file and the
  student's own `.restricted` marker, and types hpcworker's verbs. Removing a marker is the student's
  job in the portal's Files app.
- Nothing durable beyond the portal hostname and origin, preferences, the acceptance record, the
  licence key, the on-device audit log, the last good kill-list, the per-workspace data statement, the
  student's own checklist ticks, and three small notes the strip keeps (the Claude links it opened, the
  time of the last sign-in it saw, the probe job it submitted). Connection state lives in `storage.session`.

## Layout

```
wxt.config.ts               the manifest (per the report's permission table; no default_popup: the toolbar button is the "go" button)
src/entrypoints/
  background.ts             the toolbar click (open the strip, ask for the portal origin, load the page script into the tab, all in one gesture);
                            alarms (status files every 60 s, kill-list daily); the message broker; the ONE worker-start path; the once-only opening of the Claude link
  portal.content.ts         the page script on the portal origin: the ONLY network client; hosts the sign-in terminal behind a port
  sidepanel/                the flight strip (side panel / sidebar / a tab on Safari)
  options/                  the setup page (options_ui, opened on install and from right-click > Options): agreement, key, connect/disconnect, statement, settings, audit export, Google Drive step
src/core/
  steps.ts                  the strip's state machine: a pure function from facts to the one step (status line, one button or one automatic action)
  facts.ts                  gathering those facts from storage, the browser and the cluster (reads only)
  connect.ts                connecting a portal: grant, register the page script, load it into the open tab, ping until it answers
  portal.ts                 PortalClient: every OOD endpoint, fetch+WebSocket injected; PUN warm-up with backoff; existence from listings; the login shell
  shell.ts                  the Shell app driver: one command line, framed output, 3146 reasons; the interactive sitting for the sign-in
  login.ts                  the sign-in terminal's reader: the framework's plain-mode lines out of the shell's frames
  install.ts                setting up the cluster: upload the bundled framework, run its install once
  audit.ts  redact.ts       the chokepoint: audit record per request, one floor clock per class, redaction, revocation
  diagnostics.ts checks.ts  the node model (id, title, dependsOn, assumption, manualFix, futureRisk, check, repair) and the 17 checks
  worker.ts                 start and stop (and the consent marker), shared by the strip, the Details buttons and the background
  identity.ts               which username a key is matched to (the portal's own name wins over a typed one)
  contract.ts               files and commands shared with framework/ (paths, status.json, connection.json, probe.json, the registration block, the plain-login lines)
  terms.ts disclosure.ts    the agreement mechanics; the plan-class disclosure and the per-workspace data statement
  keys.ts messages.ts       storage keys; the message bus types and the login port's frames
src/licensing/
  license.ts keys.json      verifyLicense (port of Ashley grid/license.js), the two public keys
  killlist.ts               the signed kill-list: shape, verification, fail-safe refresh
src/ext/                    storage.ts (browser.storage as the KV the core expects), connectApi.ts (the browser behind core/connect.ts)
src/ui/                     strip.ts, terminal.ts, details.ts, options.ts, sections.ts, dom.ts, rpc.ts, style.css
public/                     LICENSE.txt and PRIVACY.md (copied from the repository root by scripts/sync-framework.mjs at build time), icons
scripts/sync-framework.mjs  bundles ../framework into public/framework/ and copies the agreement texts before every build and zip
mock-ood/                   a mock Open OnDemand portal (server.mjs, only dependency: ws) with fake scheduler commands and a seeded hpcworker
test/                       vitest: the step machine, connecting, the plain-login reader, the statement, licence, kill-list, audit, shell, diagnostics, worker, identity, integration against the mock
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
accept the agreement (scroll to the end, four statements, typed name, "Accept and Continue") and, if you have
one already, paste the licence key. Everything else happens from the strip.

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
| 4 | licence key | | paste it in the strip's box (or "Ask for access"): a personal key must name your portal username, a site key a domain your portal is in; read-only checks are never blocked on it |
| 5 | tool installed | upload the bundled framework, run `hpcworker install` once | |
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
probe again, sign in on the cluster, start, stop, read status now), the seventeen checks, `rc.log`, the audit log
with its export, the licence line, the settings and the Google Drive step with its done box.

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
- **Updating the tool**: `~/.hpcworker/VERSION` is compared with the bundled `framework/VERSION` on every look at
  the cluster; an older or missing one is set up again (upload, one `install` line; the tool keeps the profile and
  prints `upgraded 1 -> 2`), and an update that ran and left the old number behind is reported once, not repeated.
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
| `shell` | any other single line through the bootstrap shell (`install`) | 15 s |
| `files`, `dashboard`, `probe` | reads and writes through the Files app, the dashboard, the rnode probe | none (paced by the once-a-minute alarm) |

A full "Run the checks" opens the shell once (discover), asks Active Jobs once (jobs) and reads files;
none blocks another, and a check whose clock is still running is skipped with the time left, never
failed. Clearing the audit log keeps the clocks.

## Test against the mock portal

Unit and integration tests need nothing running: `npm test` starts the mock on an ephemeral port.

To drive the extension by hand:

```
npm run build:dev                                  # development build: http://localhost grantable
node mock-ood/server.mjs --port 8080               # http://127.0.0.1:8080 ; sign in at /login
```

Load `.output/chrome-mv3` unpacked, open `http://127.0.0.1:8080/login`, click "Sign in as student", then click the
toolbar button on that tab: the strip opens, the browser asks to allow that one site, and the steps run. The mock
seeds a stand-in `hpcworker` into its home so the install, the probe, the sign-in terminal, "Start worker" and "Stop"
produce the files the strip reads (`status.json`, `connection.json`, `rc.log` with the exact registration block of
Claude Code 2.1.283). Its `claude login --plain` prints the framework's lines (`HPCW-LOGIN`, `AUTH-URL:`, `SIGNED-IN`,
`HPCW-LOGIN-FAILED`) and takes the typed code on its standard input; any code of six or more letters, digits, `#`,
`_` or `-` is accepted (no mock authorize page is needed: the URL is only opened). Flags: `--rnode enabled` (503
instead of 404 on `/rnode/`), `--no-clusters` (the shell closes 3146 "No clusters defined."), `--cold` (first request
bounces through `/nginx/init`), `--cold-pun MS` (the first `/pun/` request after MS ms of quiet answers 500 once, as
the live portal's per-user nginx does), `--job-composer`, `--no-cookie`, `--cert F --key F` (https with your own
self-signed pair, e.g. from `openssl req -x509 -newkey ed25519 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30`).
A `?download=1` of a file that does not exist answers 200 with an HTML page, as the live Files app does.

Environment variables the seeded tool reads (set them for the mock server's process): `MOCK_LOGGED_IN=false`
(the probe reports no Claude sign-in), `MOCK_CONSENT=false` (the probe reports no Remote Control answer on record),
`MOCK_EGRESS=none` (the probe reports no egress; `http-proxy-auto` is also accepted), `MOCK_ENV_ID=env_01...`
(the environment id in the registration block; by default one stable id per mock home, as Claude Code keys it
to the machine), `MOCK_LOGIN_FAIL=1` (the plain sign-in ends with `HPCW-LOGIN-FAILED` whatever code is typed). The
mock's `worker start` refuses a workspace holding `.restricted`, its `worker stop` writes `stop.done`, and its
`claude login` without `--plain` explains the one-sitting flow (`claude consent` is an alias that explains).

The fake PTY is a real bash (Git Bash on Windows; set `MOCK_BASH` to choose another) running each typed line with
`mock-ood/bin` first on PATH, so `sbatch --parsable`, `squeue`, `scancel`, `sinfo` and `hpcworker` are fakes and the
shell semantics are real. A non-JSON frame closes the mock socket with 1011 and counts in `state.fatal`, because the
real Shell app would crash there.

## The cluster-side contract

`src/core/contract.ts` follows framework version 2 (`framework/VERSION`; `bin/hpcworker`, `lib/login_plain.sh`,
`jobs/probe.sbatch`, `jobs/worker.sbatch.tpl`). The build (`scripts/sync-framework.mjs`, run before every build
and zip) bundles `framework/**` as it is on disk, copies the root `LICENSE.txt` and `PRIVACY.md` over the shipped
copies, and stops with exit 1 when the copied `LICENSE.txt`'s "Version N, date" line disagrees with `TERMS_VERSION`
and `TERMS_DATE` in `src/core/terms.ts`:

- The tool lives at `~/.hpcworker/bin/hpcworker`. The extension types exactly one line per action through the
  portal's Shell app: `install --profile <site>`, `discover`, `probe`, `worker start --name <n> --permission-mode <m>`,
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

"Set up the cluster" uploads whatever `scripts/sync-framework.mjs` bundled from `../framework` (text files only,
LF endings) to `~/.hpcworker/` with `PUT files/fs`, then runs the install line once; the tool strips CR endings
and copies nothing when it already runs from `~/.hpcworker`. If `framework/` was empty at build time the button
says so instead of installing nothing.

## Licence keys: personal and site

Both are Ashley's `ASHLEY1.<payload>.<signature>` keys, verified offline in `src/licensing/license.ts` against the
public keys in `keys.json`. A **personal key** names one person (`sub`): it verifies only when `sub` equals the
portal username, and the username the portal's dashboard shows always wins over one typed on the setup page. A
**site key** (`edition: "site"`, a `domain` such as `wayne.edu`, no `sub`) is one key for everyone at a university,
the way the maintainer hands one key to all testers. The verifier matches such a key against an e-mail in that
domain (subdomains count, look-alikes do not), so the extension builds one from what it has, never stores or
sends it, and uses it for the comparison only (`src/core/identity.ts`):

    <portal username>@<site e-mail domain>

where the site e-mail domain is, in order: the site profile's `email_domain` field when `~/.hpcworker/profile.json`
names one (an optional field of the framework's profile schema, read where the extension reads the profile anyway
and remembered with the portal settings as `email_domain`, so the strip, the setup page and the checks agree; it
matters at a site whose portal is not under its e-mail domain), else the registrable domain of the portal
hostname: the last two labels (`ondemand.grid.wayne.edu` -> `wayne.edu`), three under a two-label public suffix
such as `.ac.uk` or `.edu.au` (`ondemand.hpc.cam.ac.uk` -> `cam.ac.uk`; a short list in `identity.ts`). At Wayne
State both rules give `wayne.edu`. The panel says what was matched: "site key for wayne.edu, matched to your portal
username go2432 at ondemand.grid.wayne.edu". From a portal outside the domain the key is refused with "this is a
site key for wayne.edu; your portal is in osc.edu, not in that domain"; a connected portal whose address yields no
domain at all (the mock at `127.0.0.1`, a bare hostname) is outside every site and refused too, unless the profile
it serves names the domain. Before a portal is connected there is nothing to compare with, and the key is matched
once one is, as a typed username is. The kill-list withdraws a site key by its `lid` like any other, which is how a
tester key is ended when the pilot ends. The key boxes on the strip and the setup page take a pasted site key as
they take a personal one and ask for nothing else; the audit log redacts every key the same way.

## The signed kill-list

Fetched once a day from `https://openspineconsortium.com/ashley/bridge-killlist.json` (the server must send
`Access-Control-Allow-Origin: *`: the extension holds no host permission for that origin). Shape and verification
in `src/licensing/killlist.ts`: outer JSON `{v, kid, issued, revoked_versions, revoked_lids, message, sig}` where
`sig` is `ASHLEYREV1.<base64url payload>.<base64url Ed25519 signature>` over `ASHLEYREV1.<payload>`, the same
scheme and public keys as Ashley's revocation list. Only the signed payload is trusted; offline keeps the last good
list; a withdrawn version stops sending commands (the chokepoint refuses anything that mutates) and still reads status.

## Store listing pointers

Single purpose, permission justifications (one sentence each, in `wxt.config.ts`), the privacy policy, the
data-collection declaration for AMO, "payment required" wording and the reviewer walk-through belong to the docs
stream (`../docs/`). The manifest emitted for Chrome is the one to paste into the listing's permission section.
