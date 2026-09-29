# Ashley Bridge: the browser extension

One codebase (WXT + TypeScript, plain DOM) for Chrome and Edge (MV3 service worker + side panel),
Firefox (MV2 persistent background + sidebar) and a Safari build for Apple's packager. It starts,
monitors and stops a Claude Code worker on the student's own Open OnDemand cluster and hands them
the Remote Control session name. It talks to exactly one origin, the portal the student connects,
and never to claude.ai.

## What it never does

- No code on claude.ai: no content script, no host permission, no fetch patch.
- No Claude credential: it never reads, stores or relays one. The student runs `claude auth login`
  on a compute node themselves (through the portal's own Shell tab); the extension only reads what
  the probe job reports from `claude auth status`.
- No `cookies`, `tabs`, `webRequest`, `nativeMessaging`, `debugger` or `identity` permission, and no
  install-time host permission. The portal origin is requested from the "Connect" button and the
  page script is registered for that origin at runtime (`scripting.registerContentScripts`).
- No remote code. The kill-list is JSON, verified with WebCrypto Ed25519 against the bundled keys.
- Nothing durable beyond the portal hostname and origin, preferences, the acceptance record, the
  licence key, the on-device audit log and the last good kill-list. Connection state and the
  per-session acknowledgements live in `storage.session`.

## Layout

```
wxt.config.ts               the manifest (per the report's permission table)
src/entrypoints/
  background.ts             alarms (status files every 60 s, kill-list daily), message broker
  portal.content.ts         the page script on the portal origin: the ONLY network client
  onboarding/               the setup page: signing dialog, licence key, disclosure, connect
  sidepanel/  popup/        the monitor (side panel / sidebar) and the toolbar popup
src/core/
  portal.ts                 PortalClient: every OOD endpoint, fetch+WebSocket injected
  shell.ts                  the Shell app driver: one command line, framed output, 3146 reasons
  audit.ts  redact.ts       the chokepoint: audit record per request, floors, redaction, revocation
  diagnostics.ts checks.ts  the node model (id, title, dependsOn, assumption, manualFix, futureRisk, check, repair) and the 17 checks
  contract.ts               files and commands shared with framework/ (paths, status.json, connection.json, probe.json)
  terms.ts disclosure.ts    the agreement mechanics and the plan-class disclosure text
  keys.ts messages.ts       storage keys; the message bus types
src/licensing/
  license.ts keys.json      verifyLicense (port of Ashley grid/license.js), the two public keys
  killlist.ts               the signed kill-list: shape, verification, fail-safe refresh
src/ui/                     panel.ts, onboarding.ts, sections.ts, dom.ts, rpc.ts, style.css
public/                     LICENSE.txt and PRIVACY.md (placeholders copied from Ashley; the docs stream writes the final texts), icons
scripts/sync-framework.mjs  bundles ../framework into public/framework/ before every build and zip
mock-ood/                   a mock Open OnDemand portal (server.mjs, only dependency: ws) with fake scheduler commands
test/                       vitest: licence, kill-list, audit chokepoint, shell parser, diagnostics, integration against the mock
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
"Accept and Continue"), paste the licence key, read the disclosure, connect the portal. The toolbar button
opens the popup; from a portal tab its "Connect this portal" button asks the browser for that one origin.
The monitor is the side panel (Chrome/Edge) or the sidebar (Firefox); the popup's "Open the panel" button opens it.

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
`rc.log`). Flags: `--rnode enabled` (503 instead of 404 on `/rnode/`), `--no-clusters` (the shell closes 3146
"No clusters defined."), `--cold` (first request bounces through `/nginx/init`), `--job-composer`, `--no-cookie`,
`--cert F --key F` (https with your own self-signed pair, e.g. from `openssl req -x509 -newkey ed25519 -nodes -keyout key.pem -out cert.pem -subj /CN=localhost -days 30`).
Environment: `MOCK_LOGGED_IN=false` or `MOCK_RC=consent_needed` change what the seeded probe reports.

The fake PTY is a real bash (Git Bash on Windows; set `MOCK_BASH` to choose another) running each typed line with
`mock-ood/bin` first on PATH, so `sbatch --parsable`, `squeue`, `scancel`, `sinfo` and `hpcworker` are fakes and the
shell semantics are real. A non-JSON frame closes the mock socket with 1011 and counts in `state.fatal`, because the
real Shell app would crash there.

## The cluster-side contract

`src/core/contract.ts` follows framework version 1 (`framework/bin/hpcworker`, `jobs/probe.sbatch`,
`jobs/worker.sbatch.tpl`):

- The tool lives at `~/.hpcworker/bin/hpcworker`. The extension types exactly one line per action through the
  portal's Shell app: `install --profile <site>`, `discover`, `probe`, `worker start --name <n> --permission-mode <m>`,
  `worker stop --name <n>`, `diag --json`. It never types `claude login` or `claude consent`: those two are shown
  to the student to run in the portal's own Shell tab.
- The state directory is the profile's `shared_state_dir` (`~/.hpcworker/profile.json`, with `$USER`/`$HOME`
  expanded; CephFS at Wayne State), falling back to `~/.hpcworker`. Under it: `probe/probe.json`,
  `<name>/status.json` (state `starting|need_login|need_consent|running|online|stopped|preempted|error`,
  `claude_login` with `loggedIn`/`email`/`subscriptionType` only, `consent`, `session_name`, `session_url`),
  `<name>/connection.json`, `<name>/rc.log`, `<name>/job.id`, and the worker's workspace `workspaces/<name>/`.
- Job ids are read from the sentences the tool prints ("submitted as job N", "already has job N",
  "probe job N submitted") and from `sbatch --parsable`'s own output.
- The extension reads the files only from the 60-second alarm or a button and never polls the scheduler faster
  than once a minute (`Active Jobs` is used for reconciliation and as the cancel fallback).

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
