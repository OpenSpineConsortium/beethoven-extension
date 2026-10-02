# The browser harness and the mock portal for Beethoven 11.0.0

Two things live here and in `../mock-ood/`:

- the **mock portal** (`mock-ood/server.mjs`, its stand-in tool `mock-ood/bin/hpcworker` with
  `mock-ood/lib/tool.mjs`, and the job clock `mock-ood/lib/jobsim.mjs`), which plays Wayne State's
  Open OnDemand portal and framework 10 as `docs/V11_CONTRACT.md` describes them;
- the **browser harness** (`e2e/run.mjs`), which loads the built extension into Chromium, walks a
  scenario as a student would, and records everything it saw.

Nothing here touches the university or Anthropic, and the lab's live access service is never asked
unless you pass `--live-access` (and then only about `st1234` at `localhost`).

**Unproven on the grid:** the one-time key step (AM2, scenario 6) is played on the mock's keyless
account only. It stays unproven until a student without a key has tried it on the real grid.

## Requirements

- Node 22.18 or later (it strips TypeScript types itself; the harness imports `src/core/*.ts` for the
  contract's parsers and the words). On this machine: `export PATH=/c/Users/grego/tools/node22:$PATH`.
- Git for Windows (the mock's shell is a real Git Bash; `openssl` and `ssh-keygen` come from it).
- Playwright with Chromium. The harness looks in `PLAYWRIGHT_DIR`, else in the session scratchpad's
  `pw/node_modules/playwright`.
- Windows PowerShell, for UI Automation: Chrome's permission prompt, Chrome's own sign-in box and the
  window pictures are reached through it (`e2e/uia/*.ps1`; each touches only the test browser's process).
- The `ws` package from the extension's own `node_modules` (already installed for the tests).

## The mock by itself

```
node e2e/mock-selftest.mjs                    # every section, about 3 minutes
node e2e/mock-selftest.mjs --only keyless     # one section: basic cookie origin idle connect queue
                                              # failures clock keyless terminal access legacy
node e2e/mock-selftest.mjs --only long --long # the 11-minute sitting, code pasted at 10:30 (AM4, D32)
```

It checks every route and mode against the contract with the extension's own parsers
(`parseConnectLine`, `parseStatusJson`, `parseProgressLine`, `loginSetupOutcome`, `reasonClass`) and
builders (`commands.connect`, `statusJson`, `stop`, `restrict`, `consentRecord`, `loginSetup`).

Start it by hand (Git Bash, from `extension/`):

```
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem \
  -subj /CN=localhost -days 30 -addext subjectAltName=DNS:localhost,DNS:ondemand.wayne.localhost,IP:127.0.0.1
MOCK_QUEUE_S=75 MOCK_LOGGED_IN=false node mock-ood/server.mjs --port 8443 --host 127.0.0.1 \
  --user st1234 --auth basic --shared-install /rs/rs_grp_oschome/shared/beethoven/hpcworker/current \
  --cert cert.pem --key key.pem
```

Open it as `https://ondemand.wayne.localhost:8443`: Chrome resolves `*.localhost` to this computer,
and the site then reads as `wayne`, so the bundled Wayne profile, its shared copy's path and "Wayne
State grid" apply. Sign in with `st1234` / `mockpass` in Chrome's own box.

### Switches

| Switch | Default | What it plays |
|---|---|---|
| `--auth basic` / `MOCK_AUTH=basic` | cookie | the live portal as it answered on 2026-10-01: `401` with `WWW-Authenticate: Basic realm="private"` on `/pun/*` and on the shell's handshake; `/` answers `302` to `/public/start.html` ("LOGIN TO ONDEMAND"); `--password` / `MOCK_PASSWORD` (default `mockpass`) |
| `--samesite lax\|none\|strict` | lax | cookie mode's session cookie (`none` adds `Secure`); `lax` and `strict` do not travel on an extension's WebSocket, so Beethoven must use tab mode |
| `--keyless` / `MOCK_SHELL_KEYLESS=1` | off | AM2's student without a key: every shell asks `st1234@login1's password: ` until `hpcworker login-setup` has authorised `from="10.0.0.1"`; wrong password: "Permission denied, please try again."; three: the session ends |
| `--terminal stub\|xterm\|hterm` | stub (xterm when keyless) | the Shell page: 10.0.0's token-only page, a working terminal with xterm.js's helper textarea (keys, a `paste` event, an `insertText` input event; the title follows OSC 0/2 and starts "Shell"), or a working terminal without that textarea (an older OnDemand) |
| `--bracketed-paste` | off | each prompt turns bracketed paste on (bash 5.1+; CentOS 7's 4.2 does not) |
| `--shell-idle S`, `--shell-max S`, `--shell-sweep S` | 300, 3600, 30 | OnDemand's inactivity limit, maximum session and sweep; `{}` frames are parsed and ignored and are no activity, as in OOD 4.1 |
| `--access list\|approved\|denied\|other-installation\|other-account\|update-required\|withdrawn\|down` | list | the access-service stand-in's answer for everyone (`list` = 10.0.0's per-account rule: `--approve`, one installation each); `GET /_mock/access?mode=` changes it while running |
| `--no-shell-title` | title on | each prompt sets the title `ESC ] 0 ; st1234@login1:~ BEL`, as RHEL's bash does for an xterm |
| `MOCK_QUEUE_S`, `MOCK_QUEUE_REASON`, `MOCK_QUEUE_EXPECT=none` | 0, Priority | a worker framework 10 submits waits in line that long; `squeue -h -j ID -o '%T\|%r\|%S\|%N'` answers `PENDING\|<reason>\|<start>\|` then `RUNNING\|None\|<start>\|node01` |
| `MOCK_START_S` | 4 | from "Got a computer" to online |
| `MOCK_SIGNIN_WAIT_S`, `MOCK_ALLOC_WAIT_S` | 1, 600 | the sign-in computer's wait and its budget (`failed signin-node` past it) |
| `MOCK_CODE_WAIT_S`, `MOCK_KEEPALIVE_S` | min(600, 840 − elapsed), 20 | the code budget (`failed signin-timeout`), the keepalive period |
| `MOCK_PLAN`, `MOCK_EMAIL` | max, `<user>@wayne.edu` | `SIGNED-IN` and `HPCW-STEP signed-in`; `free` exercises the refusal |
| `MOCK_LOGGED_IN=false` | signed in | the account starts signed out of Claude (a first run) |
| `MOCK_LOGIN_FAIL=1`, `MOCK_CODE_REJECT=n` | | the first code ends the sitting (`signin-code`); the first n codes are "not accepted; paste it again" |
| `MOCK_CONSENT=false`, `MOCK_SBATCH_FAIL=1` | | no Remote Control answer on record (need_consent); the scheduler refuses (`failed refused`) |
| `MOCK_RENEW_S`, `MOCK_RENEW_QUEUE_S`, `MOCK_ABANDON_S`, `MOCK_RECONNECT_AFTER_S` | 8 h, 10, 1200, off | the wall time and renewal, the sign-in abandon (`login_abandoned`), one Remote Control restart |
| `--home DIR` | a temp folder | keep the account (and the job table) across a restart of the mock |

Without any `MOCK_QUEUE_S`/`MOCK_START_S`/`MOCK_SIM=1`, a `worker start` typed by 10.0.0 stays instant
(online at once), as 10.0.0's tests and reviewer recipe expect. `connect` always uses the job clock.

### Routes for the harness (never part of a real portal)

`GET /_mock/log` (every request and handshake with the sign-in it carried and the answer; every shell
with the command lines typed at its prompt, never what was typed into a running command or at the
password prompt), `GET /_mock/state` (counters: shells, `{}` frames, idle kills, password prompts,
lines typed at a password prompt, scheduler calls, the jobs, the Claude sign-in, whether login-setup
ran), `GET /_mock/access?mode=`, `POST /_mock/reset`.

### The unit tests that start the mock

`test/portal.integration.test.ts`, `test/install.integration.test.ts` and `test/access.test.ts` call
`createMockPortal` (and `cliOptions` for the reviewer's recipe); `test/hygiene.test.ts` reads every
file under `mock-ood/` (no banned word, no old name). Every option and default those tests use is kept.

## The harness

```
node e2e/run.mjs list
node e2e/run.mjs infra                 # 0: the harness's own machinery, with any build (10.0.0 works)
node e2e/run.mjs first-run             # 1
node e2e/run.mjs all                   # 1 to 12, in order (about 75 minutes)
node e2e/run.mjs long-signin --minutes 10.5   # 9 with the contract's 11-minute sitting
node e2e/run.mjs long-signin --panel-open     # 9 with the panel open (AM4's fallback)
```

Options: `--ext DIR` (default `.output/chrome-mv3`; the harness builds nothing: run `npm run build`
first), `--live-access` (scenario 1 or 2 only, against the live access service as st1234 at
`localhost`: then start the mock on `https://localhost:8443` instead, see below), `--offline` (also
keep the lab's site out: the kill-list is not fetched). Environment: `E2E_OUT` (where everything is
written; default the session scratchpad's `v11/e2e/out`), `E2E_PORT` (8443), `PLAYWRIGHT_DIR`.

| # | Scenario | What it walks |
|---|---|---|
| 0 | infra | one trusted click opening the panel and Chrome's prompt (a test button added to the options page), Allow through UI Automation, the real side panel read over its DevTools socket, Chrome's sign-in box filled, the service worker's fetch and WebSocket carrying the browser's Basic sign-in, the keyless terminal page |
| 1 | first-run | HTTP Basic, a 75 s queue: install, welcome, Use another portal, tick, Agree and continue (panel and prompt from the one press), Allow, Chrome's box, the tab closing itself, where your work goes, Connect, the Claude tab (Authorize, Copy Code), the paste, in line with the timer and the tour, starting, "You're online.", the claude.ai tab, the home, Show log, Phone, New session, Copy link, Stop with its confirmation, Stopped; the press count |
| 2 | returning | online, browser restart: "As of …", "Signed out · Sign in", Open my session without the grid, Sign in, Stop, restart, Connect signing in again with no Claude sign-in |
| 3 | unreachable | the mock down at Agree (GlobalProtect moment, "Still looking", "Connected." by itself), then online, the mock down ("Can't reach the grid"), Open my session, the mock back |
| 4 | tab-mode | a SameSite=Lax cookie portal: the portal tab kept, the channel "tab", connect through the page script, "Working on the grid…", the tab closed when the work ends |
| 5 | approval | not approved (Ask for access), another installation, another account, withdrawn version (`update_required`), service down, an approval withdrawn after a yes |
| 6 | login-setup | AM2 on the keyless mock: xterm (the line typed for the student after the password), hterm ("Paste, then press Enter."), the terminal closed first ("Not done yet.") |
| 7 | motion-width | `--force-prefers-reduced-motion`, the welcome page at 360 px with Show terms, the panel at 320 px, the tour as still frames |
| 8 | anthropic-portal | Anthropic addresses under Use another portal: refused, no prompt, no grant, no request |
| 9 | long-signin | the student takes 6 minutes to paste, the panel closed meanwhile (the service worker alone holds the sitting) |
| 10 | home-extras | the home's other buttons: Try asking's copy, Show log closed again when the panel is reopened, Stop then Keep it, every item of the ⋯ menu (See what it can do, Your files, Settings, Details for your lab lead, Help), then Stop, Connect from the home (what the panel says while the press waits for the scheduler floor; no "Sign in to Claude" moment when already signed in), the home in line (timer, Worker row, "Asked at", Cancel), Cancel with Keep it, Cancel for real |
| 11 | queue-reasons | two runs with a 240 s queue: QOSMaxJobsPerUserLimit ("Waiting for your share of the grid") and ReqNodeNotAvail ("The grid is under maintenance"), with the toolbar's badge and title; "past 15 min" is not played |
| 12 | welcome-extras | the welcome page at 1280 x 720: Show terms opened in place, then with the university's default address "Agree and continue" ("Opening the grid…" while Chrome asks) and Deny ("Beethoven needs ondemand.grid.wayne.edu to work." with Try again); nothing granted, nothing reaches the university |

### What a run leaves (under `E2E_OUT/<scenario>/`)

- `NN-<moment>.txt`: the panel's text, the front page's text, the toolbar's title and badge;
  `NN-<moment>.panel.png`, `.page.png`, `.window.png` (the whole browser window with the side panel);
- `prompt-<ms>.png` and `signin-box-<ms>.png`: the window when Chrome's prompt or its sign-in box
  appeared (the sign-in box is in the picture; the permission bubble is drawn by Chrome as a widget
  `PrintWindow` does not reach, so the picture shows the window dimmed under it, and its words and
  buttons are in `prompts.json` from UI Automation);
- `events.log` (the timeline and every PASS/FAIL), `result.json`, `requests.json` (every request:
  where it went, from the service worker or which page, before or after the agreement, its body),
  `tabs.json` (every tab and the side panel: opened, navigated, closed, and whether the harness or the
  extension opened it), `prompts.json`, `mock-log.json`, `mock-server.log`, `panel-texts.json`;
- a fresh `mock-home/` (the next run of the scenario deletes it), and `run-trace.json` (every change of the
  extension's run record, `bridge.run` in session storage; `E2E_TRACE_RUN=0` turns it off).

The browser profile is NOT in the scenario folder: it lives under `E2E_PROFILES` (default `<E2E_OUT>/../p/<short
hash of the scenario>`). Chrome's extension storage (LevelDB under `<profile>/Default/Local Extension
Settings/<id>/`) fails with "IO error: …MANIFEST-000001: Unable to create writable file" once the whole path
passes Windows' 260 characters; the session scratchpad is already about 130 deep, so a profile under a long
scenario folder left `chrome.storage.local` unusable and the welcome page blank.

`E2E_SHOTS=1` also copies every moment's pictures to `<E2E_OUT>/../shots/_raw/<scenario>/`, with the side
panel emulated at the specification's 360 x 658 CSS px at 1x and pages captured in CSS pixels (the welcome page
at 1280 x 720).

Harness artifacts to know (none is the product's behaviour):

- Chrome installs an unpacked extension loaded with `--load-extension` afresh at every launch, so after a browser
  restart `onInstalled` fires with "install" and the options page opens; scenario 2 notes it and closes it. The
  optional site grant does survive the restart.
- Playwright can attach to a tab the extension opened many seconds late; a page it has not attached is not routed,
  so it may load the real lab site or show Chrome's error page for a NOTFOUND host first. Checks on such tabs read
  the browser's own target list (`tabs.json`).
- The harness keeps a DevTools session on the extension's service worker (Playwright attaches to it, and the run
  tracer evaluates in it), which may keep the worker alive: scenario 9 therefore shows that the sitting survives,
  not that an unattached service worker would.
- A press during a fade (Try asking's, for instance) can be lost; the flows wait for fades and check the result.

`summary.json` beside the scenario folders lists the last run's totals.

### How the side panel is driven

Chrome exposes the side panel as a page target that Playwright does not attach (it is absent from
`context.pages()`). The harness starts Chromium with `--remote-debugging-port` and talks to the panel
over its own DevTools socket: trusted clicks (`Input.dispatchMouseEvent` at the element's centre),
Ctrl+V for the paste (`Input.dispatchKeyEvent` with the paste command), screenshots
(`Page.captureScreenshot`), its text and its network requests. Controls are found by their visible
label (`button`, `a`, `input`, `label`, `[role=…]`), so the harness depends on the specification's
words, not on the pages' markup. The toolbar button is pressed with `Extensions.triggerAction`. Only
when no side panel exists does the harness open `sidepanel.html` as a tab, and the result says so
(`panelAsTab`). The 320 px panel of scenario 7 is DevTools emulation: a real side panel's width is the
student's drag, which no API sets.

### Live access (hard rule)

The live service may be reached only by the real extension, against the mock at `localhost`, as
`st1234`. With `--live-access` the harness lets `*.workers.dev` through and aborts (and reports as
FAIL) any request naming another account or another portal. Such a run must use the portal
`https://localhost:8443`: set `E2E_HOST=localhost` (the harness refuses `--live-access` otherwise). At
`localhost` no bundled profile applies, so the mock account starts set up on the mock's own shared copy
and the checks that name "Wayne State grid" or GlobalProtect do not apply. Every other approval answer comes from the
mock's stand-in (`--access …`), which is what every scenario uses by default: the harness answers
`openspineconsortium.com/beethoven/services.json` itself, pointing the extension at the mock.

## What waits for the build

The mock and the self-test are complete and pass. The scenarios are written against the
specification's words and the contract, and scenario 0 runs today; scenarios 1 to 9 need the 11.0.0
package in `.output/chrome-mv3` (`npm run build`). Run against 10.0.0 they stop at the first missing
11.0.0 words, which is the expected FAIL. Things to look at on the first run against 11.0.0:

- if a press cannot find its control, the label in the page differs from `WORDS` (`src/core/model.ts`):
  the FAIL line names the label it looked for and the moment's `.txt` shows what was there;
- "Use another portal" and "Use this portal": the flow presses "Use this portal" before the tick and
  "Agree and continue"; if the pages make "Use this portal" do the agreement's gesture too, the prompt
  is counted there (the check accepts either);
- scenario 6 presses "I'm in" only when the panel has not moved within 6 s of the password;
- scenario 5's last case dates the stored approval 25 hours back (a test device, logged as such) so
  that opening the panel asks the service again.
