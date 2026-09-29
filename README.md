# Ashley Bridge (working name)

Ashley Bridge puts a student's own Claude Code session, running as an ordinary batch job on their
university's cluster, inside claude.ai and the Claude phone app. It does this with a feature Anthropic
already ships to Pro and Max subscribers, Claude Code Remote Control: the `claude` process in the job
registers with Anthropic over outbound HTTPS and polls for work, and claude.ai/code or the app becomes
a window onto that session, with attachments, transcript sync and push notifications. Nothing is
intercepted, nothing is forged, no inbound port is opened on the cluster, and no credential passes
through anything the vendor operates. The design, and the rejection of the earlier idea of patching
claude.ai from a browser extension, are set out in `docs/RESEARCH_REPORT.md`.

Two pieces do the work. The cluster-side **framework** (`framework/`, working name `hpcworker`) is
shell and Python that runs in the student's own account, kept once per site by the lab where the
site has a shared directory for it and copied into the student's home elsewhere (*Build and
release*, below): a static site profile per university, a
scheduler/runtime/egress adapter (Slurm first; PBS Pro and LSF next), one job template, a probe job
that discovers what the site's documentation does not say, and a worker entrypoint that starts
`claude remote-control` inside `tmux` in an Apptainer image, queues its own successor before its wall
time ends so the worker stays on, and writes `status.json` and `connection.json` (the session name and
its claude.ai link) to shared storage. The browser **extension** (`extension/`, working name
`ood-worker`) is a launcher and a diagnostics panel. It talks to exactly one origin, the student's
Open OnDemand portal, over surfaces that exist on every Open OnDemand 3.x and 4.x site without
administrator help: the Shell WebSocket (to run one `sbatch`, and to hold one sign-in sitting open),
the Files JSON routes (to read the job's status files), and Active Jobs JSON (to reconcile). It rides
the portal session the student already has in the browser; it never reads the cookie and never
automates a login.

The product is small on purpose. On twelve sampled US university clusters the things that break a
worker, egress from compute nodes, the container runtime, node-local temp, login-node rules, proxy
settings, are undocumented or administrator-controlled, so most of the extension's value is that it
finds them from inside a probe job and explains each failure in one sentence. Portability is a
by-product of designing for Wayne State's rules: a worker that never runs anything persistent on the
login node, keeps IPC under `/dev/shm`, keeps images and caches off the parallel home filesystem and
treats `/tmp` as ephemeral satisfies every other site sampled.

## How the Remote Control path fits together

```
student's browser / phone            university network (VPN where required)                Anthropic
────────────────────────             ──────────────────────────────────────────              ─────────
claude.ai/code, Claude app  ◀════════════════ outbound HTTPS only, from the job ═══════════▶ api.anthropic.com
  (sees the session by name;                                                                  ▲ registers,
   transcript stored while connected)                                                          │ polls for work
                                                                                               │
Ashley Bridge extension ──▶ https://ondemand.<university>.edu ──▶ login node ──sbatch──▶ compute node (Slurm job)
  (one origin, one            │ Shell WebSocket: one sbatch, then close;      (nothing else)   tmux ▶ apptainer exec
   content script;            │   once, held open for the sign-in sitting                      ▶ claude remote-control
   the icon runs the steps)   │ Files JSON: list, then read status.json, rc.log                 writes status.json,
                              │ Active Jobs JSON: reconcile                                     connection.json, rc.log
                              └────────── shared storage <state_dir>/<run>/ ◀──────────────────────────┘
```

What a student does, in order, after installing the extension from the browser's store and accepting
the agreement once on its setup page (there is no key and nothing to paste: their own sign-in to the
portal identifies them, and the extension confirms with the vendor's access service that the account
the portal shows is approved; if it is not, the panel's one button is *Ask for access*):

1. **Open your portal tab.** Sign in to `ondemand.<university>.edu` the usual way (VPN first if the
   university requires it) and keep the tab open.
2. **Click the Ashley Bridge icon.** The first click asks the browser once for access to that one
   site. Then the extension does the rest by itself, in order, and says in one line what it is doing:
   wakes the portal up, checks it is signed in, confirms your account is approved, sets the
   framework up in your account if it is not there (pointing your account at the lab's shared copy
   where there is one), checks a compute node once (a short job,
   the first time only), signs you in to Claude if the cluster is not signed in (step 3), shows where
   your work goes and takes your statement about it (once per workspace), starts your worker through
   the portal shell, and waits for Claude Code to connect.
3. **Sign in to Claude once, when the panel asks.** The extension opens Anthropic's sign-in page in a
   new tab; you sign in with your own Claude account, click *Authorize*, and paste the code the page
   shows into the one box in the extension's panel. The code is typed once into the sign-in sitting
   running on a compute node and is not kept. When your worker connects, the claude.ai tab opens by
   itself, once for each new session link in this browser; after that, and on every later click on
   the icon, the panel shows the green *Open in Claude* button (with *Copy link* beside it), which
   opens it again.

The paste stays because that is where Anthropic's rule puts the line: the sign-in must complete
through Anthropic's own flow, so the extension opens the page and takes the code from you, and never
reads it from an Anthropic page or from your clipboard by itself. There is no page of options to work
through, no `y` to type at Claude Code's one-time Remote Control question (the panel takes your
answer in the same statement, records it in your cluster account, and your worker gives it to Claude
Code when asked) and no terminal to break out of: the sitting ends itself when Claude Code says it is
signed in. The settings that exist (shell host, site profile, permission mode, *start my worker when I
open my portal* and *open claude.ai when my worker connects*, both on by default in the current build)
live on the extension's options page, and the seventeen checks and the logs sit under
*Details* in the panel for the day something does not work.

The optional step *Connect Google Drive in claude.ai* is still there: it opens
`https://claude.ai/settings/connectors` in a new tab with one sentence saying what to do and a *done*
box kept only in the browser; the extension has no presence on that page.

## What it never does

From the report's "deliberately absent" list and its security controls:

- No code on claude.ai or any Anthropic page: no content script, no host permission, no `fetch`
  patch, no forged responses. It opens exactly two kinds of page outside the portal, in a new tab,
  as a bookmark would: the sign-in page Claude Code printed during the sitting you started, and your
  session's `https://claude.ai/code?environment=...` link (plus the connectors page from the optional
  step). It never reads those pages.
- No handling of a Claude credential: no `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no reading of
  Claude Code's credentials file, no multi-account rotation. The student signs in through Anthropic's
  own flow on a compute node; the one-time code they paste into the panel is passed once into that
  sitting, never stored, never logged (the audit log holds one line for the sitting with the counts
  of bytes read and typed, never the text) and never sent anywhere else. The framework starts Claude
  Code where the credential already is, reads
  `claude auth status`, and reads two yes-or-no keys from Claude Code's own settings file (whether the
  Remote Control question has been answered, whether the folder is trusted), nothing else.
- No answer typed into Claude Code that the student did not give. The Remote Control question is
  answered from the student's own recorded statement (a marker file the panel writes on their
  acknowledgement, and Claude Code's own record after the first session), and folder trust for the
  worker's workspace is recorded in Claude Code's settings by the framework when a worker starts.
- No deleting outside its own run directories and node-local temp: never the Claude Code login
  folder, the workspace, another run or anything else in the student's home. A destructive
  subcommand refuses to run from an agent context (`CLAUDECODE`, `ASHLEY_REQUEST_ID` or a similar
  marker in the environment) or without a terminal on standard input. `SECURITY.md` records the
  incident of 2026-09-28 behind this rule.
- No install-time host permission. Access to the one portal origin is requested from the click on
  the icon (or the *Connect* button on the setup page).
- No `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`,
  `nativeMessaging`, `debugger`, `identity` or `clipboardRead` permission. The portal cookie is
  carried by the browser's network stack and never read.
- No automated login and no touch on the MFA step: a redirect to the identity provider means "sign
  in to your portal in a tab".
- No remote code: no `eval`, no fetched scripts. The kill-list is JSON, verified with WebCrypto against
  a public key compiled into the bundle, and the extension works offline on the last good list.
- Nothing persistent on the login node: one `sbatch --parsable` through the shell, then the shell is
  closed; the sign-in sitting holds the shell open once, for as long as the sitting lasts (up to ten
  minutes waiting for a compute node and ten minutes for the paste, both the framework's own limits;
  the panel closes the connection after fifteen minutes whatever happened), and no longer.
  Scheduler-facing calls never faster than once a minute; the job writes `status.json` and clients
  read the file.
- No durable secret in extension storage. Connection state lives in `storage.session`; the audit log
  of every portal request stays on the device and is never transmitted.
- No transmission of command text, file paths, prompts, job output, portal cookies or tokens to the
  vendor. The only thing sent to the vendor about the student is the approval check (the account name
  the portal's dashboard shows, the portal hostname, the product and the version), answered yes or no
  by the access service; the only other requests to the vendor's site are the daily downloads of the
  service address (`services.json`) and the signed withdrawn-versions list. All of them are made only
  after the agreement is accepted. There is no licence key: see `docs/TESTERS.md` for the flow.

## Status

Pre-release. Designed from the research report of 2026-09-28 and being tested on Wayne State
University's grid (`ondemand.grid.wayne.edu`, Slurm, Apptainer, CentOS 7 login node). Three of the
twelve open questions were measured on 2026-09-28 and 2026-09-29 (compute-node egress; paste-code
login from a compute node inside the image; Remote Control registering from an `sbatch` job under a
pseudo-terminal, answered yes at 02:22 UTC on 2026-09-29 with Ashley's phone host, job 40496445 on
`asx15`). On 2026-09-29 at 05:13 local the maintainer ran the extension against the live portal:
signed in as `go2432`, shell open and closed in 1.9 s, Files and Active Jobs answering, discovery and
probe green, and three defects found (a content script registered but not injected into the open
tab; a cold per-user web server answering "Server Error" on the first request; a missing file read as
present because the Files app answers a missing download with an HTML page). The probe the panel read
that morning (run at 04:06 UTC) said the cluster was not signed in to Claude; a worker started by hand
at 09:55 UTC the same day (job 40501099, `asx1`) reported `loggedIn: true`, plan `max`, and registered,
so the sign-in was redone by hand between the two, by a path not recorded. A worker that finds no
sign-in does not fail: it writes `need_login` to `status.json` with its own words, "Claude Code on the
cluster is not signed in; sign in from the panel (or run: hpcworker claude login). This job waits and
asks again every minute." Their fixes and the three-step flow above are being built this week;
`docs/OPEN_QUESTIONS.md` records what was measured and `docs/ARCHITECTURE.md` what is being built. The
product name and identifier carry no university name. Written approval from Wayne State C&IT and a
written answer from Anthropic precede any paid edition.

Versions in this tree: the extension is 5.0.0 (4.0.0 was the first version without licence keys;
5.0.0 sets up the lab's shared copy of the framework where a site has one); the framework's `VERSION`
file is 5; the agreement `LICENSE.txt` is version 4 and the extension's
`TERMS_VERSION` (`extension/src/core/terms.ts`) is 4 to match; `PRIVACY.md` is version 5. All
integers; a changed text moves its version with it.

## Build and release (for the next developer)

Everything below runs from a fresh clone on Windows (Git Bash or WSL), macOS or Linux. Nothing is
downloaded at run time by the product; the build needs the network only for `npm ci`.

**Prerequisites.** Git; Node 22 (nodejs.org or nvm; on the maintainer's Windows machine it is
`export PATH=/c/Users/grego/tools/node22:$PATH`); Python 3.8 or newer for the framework tests and the
site pages; `bash`; `pandoc` only for the site pages; `unzip`/`sha256sum` (Git Bash has both). No
cluster account is needed for any test: the tests run against the mock portal in `extension/mock-ood`.

**Clone.** `git clone https://github.com/OpenSpineConsortium/ashley-bridge.git` (the organisation's
private copy; the maintainer's personal copy is `GregorySchwing/ashley-bridge`). Keep the line endings
as they are in the repository (LF); Windows Git may warn about CRLF and is harmless.

**Extension.**

```
cd extension
npm ci                 # pinned versions from package-lock.json
npm run typecheck      # tsc --noEmit
npm test               # vitest: 130+ tests, starts the mock portal itself
npm run build          # -> .output/chrome-mv3 (Chrome, Edge) and .output/firefox-mv2 (Firefox)
npm run zip:all        # -> .output/ashley-bridge-<version>-{chrome,firefox,edge,safari}.zip + -sources.zip
```

`npm run build` first runs `scripts/sync-framework.mjs`, which copies `../framework/`, `../LICENSE.txt`
and `../PRIVACY.md` into `public/` and stops if the agreement's "Version N" line disagrees with
`TERMS_VERSION` in `src/core/terms.ts`. Load `.output/chrome-mv3` unpacked in Chrome or Edge, or
`.output/firefox-mv2/manifest.json` as a temporary add-on in Firefox, to try a build by hand
(`docs/store/TEST_BEFORE_UPLOAD.md`).

**Framework (the cluster side).** `HPCW_PYTHON=python3 bash framework/tests/run.sh` (about
seven minutes under Git Bash on the Windows laptop, measured 2026-09-29; a few tests skip without a
scheduler). The framework reaches a student's account in one of
two ways (`docs/ARCHITECTURE.md` 2.1):

- *The lab's shared copy*, where the site profile names `shared_install` (Wayne State's does:
  `/rs/rs_grp_oschome/shared/ashley/hpcworker/current`, a link to a versioned directory `v<N>/` beside
  it). The maintainer publishes each framework version there from the laptop with
  `bash tools/deploy_shared.sh` (options in its header; `--dry-run` says what it would do): it checks
  the two version lines, the line endings and the shell syntax, packs the framework's files with a
  SHA-256 manifest, unpacks them over ssh into a new `v<N>/` (file work only on the login node), gives
  the group read and traverse without write, switches `current` in one rename, keeps every older
  version (a running worker stays on the one it started with until it is started again), and prints
  what changed, the tree and the ACLs. A student's account is set up with one line, which the
  extension types through the portal's shell:
  `bash <shared_install>/bin/hpcworker install --shared <shared_install> --profile <site>`. The account
  gets a launcher, a marker naming the shared directory and the profile, and no code; an own copy
  already there is moved aside into `~/.hpcworker/replaced/`, never deleted. `hpcworker version` then
  says "5 (shared copy at ...)". The extension never replaces or updates a shared copy.
- *The student's own copy*, at every other site and as the fallback when the account cannot use the
  shared copy: copy `framework/` to the cluster and run
  `bash framework/bin/hpcworker install --profile <site>`; the extension does the same through the
  portal's Files app, and again when its bundled `framework/VERSION` is newer than the installed one.

Either way the install adds `~/.hpcworker/bin` to PATH through a managed block in `~/.bashrc`, so a
new terminal finds `hpcworker`; a terminal opened before the install needs
`export PATH="$HOME/.hpcworker/bin:$PATH"` once. At Wayne State the student's account must be in the
lab's group `oschome` in both cases: the image, the shared copy and the state directory are all on the
group's volume, which others cannot enter (`docs/OPEN_QUESTIONS.md`).

**Site pages.** `python3 tools/site_bridge_build.py` renders the privacy statement and the agreement into
the website checkout expected beside this repository (`../openspineconsortium.github.io/ashley/bridge/`)
and checks that every word of the source texts is on the page; `--check-only` verifies without writing.

**Access service.** The approval check the extension makes is served by the Cloudflare Worker in the
`ashley` repository (`tools/intake/worker.js`, contract in `tools/intake/ACCESS_CHECK.md`); it is deployed
from there, not from here.

**Releasing a version.**

1. Versions are integers: `extension/package.json` (and `packages[""].version` in `package-lock.json`)
   move to the next whole number; a changed agreement or privacy statement moves its own "Version N"
   line and, for the agreement, `TERMS_VERSION`/`TERMS_DATE` in `src/core/terms.ts`; a changed framework
   moves `framework/VERSION` and the `VERSION=` line at the top of `framework/bin/hpcworker`.
2. `npm run typecheck && npm test && npm run build && npm run zip:all` in `extension/`, and the framework
   tests. A changed framework is then published to each site's shared copy with
   `bash tools/deploy_shared.sh`, before the extension that needs it reaches students: the extension
   runs whatever the lab's copy is.
3. Copy the zips into `release/<version>/`, write `SHA256SUMS.txt` (`sha256sum *.zip > SHA256SUMS.txt`)
   and a short `README.md` there (see `release/5.0.0/`), commit, tag `v<version>`, push both remotes:
   `bash tools/push_via_grid.sh` (the personal copy, through the grid's token) and `bash tools/push_org.sh`
   (the organisation's copy, from a shell whose git credential can push to OpenSpineConsortium; on the
   maintainer's machine that is WSL). Attach the zips and `SHA256SUMS.txt` to a GitHub release named
   `v<version>` on the organisation's copy, which is the download page developers and testers are given.
4. Test by hand (`docs/store/TEST_BEFORE_UPLOAD.md`), then upload store by store
   (`docs/store/SUBMISSION.md`, texts in `docs/store/LISTING.md`), then rebuild and push the site pages if
   a text changed.

## Documents

- `docs/RESEARCH_REPORT.md`: the research and the build specification everything else derives from.
- `docs/ARCHITECTURE.md`: components, site profile, the two install modes (the lab's shared copy
  and the student's own), adapter interface, job template, the Remote
  Control launch sequence, the sign-in sitting and its output contract, the step machine behind the
  icon, the Open OnDemand channels (with the warm-up and the existence rule), the extension per
  browser, security controls.
- `docs/DIAGNOSTICS.md`: the automatic steps the icon runs, the 17 checks under *Details*, and the
  framework's cluster-side checks.
- `docs/OPEN_QUESTIONS.md`: the 12 ranked open questions, their first tests and results, and the
  live-portal findings of 2026-09-29.
- `docs/STORE_LISTING.md`: single-purpose statement, permission justifications, privacy answers per
  store, reviewer access, the 13-item checklist.
- `docs/WAYNE_STATE_PILOT.md`: the pilot plan for the first campus, with the three-step script.
- `docs/MAC_AND_SAFARI.md`: what the Safari edition needs.
- `docs/LICENSE-FULL-NOTE.md`: how a paid edition's agreement will be made.
- `docs/TESTERS.md`: what a tester does, from asking for access to the first worker; nothing to paste.
- `LICENSE.txt`, `PRIVACY.md`: the Trial Edition agreement (version 4; the extension's
  `TERMS_VERSION` is 4) and the privacy statement (version 5).
- `SECURITY.md`: threat model, controls, how to report a problem.
- `CLAUDE.md`: working rules for this repository.
- `docs/prior_analysis_architecture.txt`, `docs/prior_analysis_protocols.txt`: the two earlier
  analyses that proposed intercepting claude.ai, kept for the record; the report rejects that design.
