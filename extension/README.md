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
- No Claude credential: it never reads, stores or relays one. The student runs `hpcworker claude login`
  on a compute node themselves (through the portal's own Shell tab); the extension only reads what
  the probe job reports from `claude auth status` and Claude Code's own "remoteDialogSeen" flag.
- No `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger` or `identity` permission, and no
  install-time host permission. The portal origin is requested from the "Connect" button and the
  page script is registered for that origin at runtime (`scripting.registerContentScripts`).
- No remote code. The kill-list is JSON, verified with WebCrypto Ed25519 against the bundled keys.
- Nothing deleted on the cluster, ever: it writes files, touches the framework's stop file and the
  student's own `.restricted` marker, and types hpcworker's verbs. Removing a marker is the student's
  job in the portal's Files app.
- Nothing durable beyond the portal hostname and origin, preferences, the acceptance record, the
  licence key, the on-device audit log, the last good kill-list and the student's own checklist ticks.
  Connection state and the per-session acknowledgements live in `storage.session`.

## Layout

```
wxt.config.ts               the manifest (per the report's permission table)
src/entrypoints/
  background.ts             alarms (status files every 60 s, kill-list daily), message broker, the optional start-on-portal-open
  portal.content.ts         the page script on the portal origin: the ONLY network client
  onboarding/               the setup page: signing dialog, licence key, disclosure, connect, Google Drive step
  sidepanel/  popup/        the monitor (side panel / sidebar) and the toolbar popup
src/core/
  portal.ts                 PortalClient: every OOD endpoint, fetch+WebSocket injected
  shell.ts                  the Shell app driver: one command line, framed output, 3146 reasons
  audit.ts  redact.ts       the chokepoint: audit record per request, one floor clock per class, redaction, revocation
  diagnostics.ts checks.ts  the node model (id, title, dependsOn, assumption, manualFix, futureRisk, check, repair) and the 17 checks
  worker.ts                 start and stop, shared by the panel's buttons and the background's automatic start
  identity.ts               which username a key is matched to (the portal's own name wins over a typed one)
  contract.ts               files and commands shared with framework/ (paths, status.json, connection.json, probe.json, the registration block)
  terms.ts disclosure.ts    the agreement mechanics and the plan-class disclosure text
  keys.ts messages.ts       storage keys; the message bus types
src/licensing/
  license.ts keys.json      verifyLicense (port of Ashley grid/license.js), the two public keys
  killlist.ts               the signed kill-list: shape, verification, fail-safe refresh
src/ui/                     panel.ts, onboarding.ts, sections.ts, dom.ts, rpc.ts, style.css
public/                     LICENSE.txt and PRIVACY.md (placeholders copied from Ashley; the docs stream writes the final texts), icons
scripts/sync-framework.mjs  bundles ../framework into public/framework/ before every build and zip
mock-ood/                   a mock Open OnDemand portal (server.mjs, only dependency: ws) with fake scheduler commands
test/                       vitest: licence, kill-list, audit chokepoint, shell parser, diagnostics, worker start/stop, identity, integration against the mock
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

On install the setup page opens: accept the agreement (scroll to the end, four statements, typed name,
"Accept and Continue"), paste the licence key, read the disclosure, connect the portal, and (optional)
connect Google Drive in claude.ai (a button opens `https://claude.ai/settings/connectors` in a tab; a
"done" box is kept on this device only). The toolbar button opens the popup; from a portal tab its
"Connect this portal" button asks the browser for that one origin. The monitor is the side panel
(Chrome/Edge) or the sidebar (Firefox); the popup's "Open the panel" button opens it.

## What the panel does

- **Start worker** types one line (`hpcworker worker start --name N --permission-mode M`) after the
  data statement for that worker was made this session and the workspace is not marked restricted.
- Once the job registers, the card shows the green **Open in Claude** button (it opens the
  `https://claude.ai/code?environment=env_...` link the job reported, and nothing else), **Copy link**,
  and "Find `<session name>` under Code in the Claude app". Claude Code names the session itself
  (`asx10-hazy-meadow` in the maintainer's run); the name and link are read from `connection.json`,
  `status.json`, or the registration block in `rc.log` (`parseRegistration` in `contract.ts`).
- **Stop** touches the framework's stop file `<state>/<name>/stop` through the Files app (a write, no
  floor) so the job leaves on its own and ends its own chain; then, if the scheduler floor allows it,
  the tool's own `hpcworker worker stop` runs once. It never asks Active Jobs and cancels back to back.
- **Start my worker when I open my portal** (Settings; off by default): when on, the background
  starts the worker when the portal tab connects (or at the next once-a-minute check) if no worker is
  alive, the terms and key are in order and the statement was made this session; at most one attempt
  a minute, and a start that would break the scheduler floor waits for the next minute.
- **Mark this workspace restricted** (Before a start) touches `<workspace>/.restricted`; check 16 and
  every start refuse a workspace so marked (or one a profile's `restricted_workspaces` names).

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

Load `.output/chrome-mv3` unpacked, open `http://127.0.0.1:8080/login`, click "Sign in as student", then use the
toolbar button on that tab and "Connect this portal". The mock seeds a stand-in `hpcworker` into its home so
"Run the probe job", "Start worker" and "Stop" produce the files the panel reads (`status.json`, `connection.json`,
`rc.log` with the exact registration block of Claude Code 2.1.283). Flags: `--rnode enabled` (503 instead of 404 on
`/rnode/`), `--no-clusters` (the shell closes 3146 "No clusters defined."), `--cold` (first request bounces through
`/nginx/init`), `--job-composer`, `--no-cookie`, `--cert F --key F` (https with your own self-signed pair, e.g. from
`openssl req -x509 -newkey ed25519 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30`).

Environment variables the seeded tool reads (set them for the mock server's process): `MOCK_LOGGED_IN=false`
(the probe reports no Claude sign-in), `MOCK_CONSENT=false` (the probe reports no Remote Control answer on record),
`MOCK_EGRESS=none` (the probe reports no egress; `http-proxy-auto` is also accepted), `MOCK_ENV_ID=env_01...`
(the environment id in the registration block; by default one stable id per mock home, as Claude Code keys it
to the machine). The mock's `worker start` refuses a workspace holding `.restricted`, its `worker stop` writes
`stop.done`, and its `claude login` explains the one-sitting flow (`claude consent` is an alias that explains).

The fake PTY is a real bash (Git Bash on Windows; set `MOCK_BASH` to choose another) running each typed line with
`mock-ood/bin` first on PATH, so `sbatch --parsable`, `squeue`, `scancel`, `sinfo` and `hpcworker` are fakes and the
shell semantics are real. A non-JSON frame closes the mock socket with 1011 and counts in `state.fatal`, because the
real Shell app would crash there.

## The cluster-side contract

`src/core/contract.ts` follows framework version 1 (`framework/bin/hpcworker`, `jobs/probe.sbatch`,
`jobs/worker.sbatch.tpl`):

- The tool lives at `~/.hpcworker/bin/hpcworker`. The extension types exactly one line per action through the
  portal's Shell app: `install --profile <site>`, `discover`, `probe`, `worker start --name <n> --permission-mode <m>`,
  `worker stop --name <n>`, `diag --json`. It never types `claude login` or `claude consent`: the login command
  is shown to the student to run in the portal's own Shell tab (it does the sign-in and, when not yet answered,
  the Remote Control question in one sitting; `consent` is an alias that explains).
- The state directory is the profile's `shared_state_dir` (`~/.hpcworker/profile.json`, with `$USER`/`$HOME`
  expanded; CephFS at Wayne State), falling back to `~/.hpcworker`. Under it: `probe/probe.json`,
  `<name>/status.json` (state `starting|need_login|need_consent|running|online|stopped|preempted|error`,
  `claude_login` with `loggedIn`/`email`/`subscriptionType` only, `consent`, `session_name`, `environment_url`),
  `<name>/connection.json` (`session_name`, `environment_url`, `capacity`, ...), `<name>/rc.log`, `<name>/job.id`
  (the chain's current job), `<name>/stop` and `<name>/stop.done`, and the worker's workspace `workspaces/<name>/`
  with the student's optional `.restricted` marker.
- Job ids are read from the sentences the tool prints ("submitted as job N", "already has job N",
  "probe job N submitted") and from `sbatch --parsable`'s own output. The session name and environment link
  come from the files, or from the registration block in `rc.log` when the files do not carry them yet.
- The extension reads the files only from the 60-second alarm or a button and never asks the scheduler faster
  than once a minute per class (`Active Jobs` is read for check 7 only; a stop is the stop file).

"Set up the cluster" uploads whatever `scripts/sync-framework.mjs` bundled from `../framework` (text files only,
LF endings) to `~/.hpcworker/` with `PUT files/fs`, then runs the install line once; the tool strips CR endings
and copies nothing when it already runs from `~/.hpcworker`. If `framework/` was empty at build time the button
says so instead of installing nothing.

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
