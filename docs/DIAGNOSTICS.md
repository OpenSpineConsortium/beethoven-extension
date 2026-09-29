# Diagnostics

Every assumption Ashley Bridge makes, from the approval of your account to the pseudo-terminal on the compute node,
is a check with a plain-words message for the student, a technical test for the engineer and a fix
hint. The model is Ashley's (`extension/src/core/diagnostics.ts`): each check is a node with an `id`, a
`title`, `dependsOn`, a one-sentence `assumption`, a `check`, a `manualFix`, a `futureRisk` and,
where safe to run unattended, a `repair`. A run goes in dependency order; a node whose dependency
failed is reported blocked with the root cause, so one broken piece reads as one problem, not a
cascade. Ashley's rule carries over: no feature integrates until its pieces are nodes here.

Since 2026-09-29 the panel a student sees is not the list of checks. It is the strip: the step the
extension is on (the first section below), one line of plain words, and one button when a person must
act. The seventeen checks, the sign-in sitting's terminal, the `rc.log` tail and the audit log sit
under *Details*, and a step that fails points at the check that explains it. The checks themselves and
their tests are unchanged from the report's table; what changed on that date is how three of them read
the portal (checks 4, 6 and 16, after the live-portal findings in `OPEN_QUESTIONS.md`).

## The automatic steps the icon runs

A click on the toolbar icon (or the portal tab connecting, when the automatic start is on) brings up
the strip, whose decision function (`decide` in `extension/src/core/steps.ts`) picks the first step
not yet satisfied from facts gathered by reads only (`gatherFacts` in `core/facts.ts`;
`ARCHITECTURE.md` 6.1). Each step is idempotent: on a cluster where everything is already in place the
strip goes straight to *Open in Claude*. The student reads the title and the status line; the
engineer's test is in the third column.

| # | id | Title the student reads | What it does | Stops, and the student sees |
|---|---|---|---|---|
| S1 | `portal` | Your portal | Connected, granted, and the page script answering. From the icon click: the clicked tab's origin (`activeTab`), `permissions.request` for that one origin straight from the click, the page script registered for the origin, the clicked tab pinged and, when it does not answer, the same file loaded into it at once with `scripting.executeScript` and pinged up to eight times a quarter-second apart (`connectSequence`; finding a); any other tab open on the origin gets the script the same way only when a later call needs a portal tab (`portalTabId` in the background, `tabs.query` by URL) | "This tab is `<host>`. Connect it as your portal" with *Connect this portal*; "Open your Open OnDemand portal in a tab and click the Ashley Bridge button there"; "Access to `<host>` was taken away in the browser. Allow it again" |
| S2 | `warm` | Waking up your portal | `warm()`: `GET /pun/sys/dashboard/`; on a 5xx or the `/nginx/init` bounce, retry after 2 s, 5 s, 10 s (finding b) | "Your portal did not wake up. Try again in a moment" (*Try again*); "Your portal could not be reached. Connect the VPN and open the portal in a tab"; "Sign in to your portal in its tab, then come back here" (*Open my portal*) |
| S3 | `terms` | The agreement | The terms record is in force for the version in force | "Read and accept the agreement once; it opens on the setup page" (*Read the agreement*) |
| S4 | `access` | Your access | No key. The account name the portal's dashboard shows for the session (never a typed one) is on Licensor's approved list: once the agreement is accepted and the portal is connected, the background asks the access service (address from `services.json`, key `access_check`) when the portal connects and once a day, and keeps the answer: an approval holds for 24 h (not asked again, not even by a click) and is kept up to 7 days while the service is unreachable; a refusal holds for 10 minutes and an attempt that got no answer 15 minutes, and a click on the icon asks again past either at once; the version is not withdrawn | "Your account is not on the approved list yet" with the one button *Ask for access*, which opens the request page with the account name filled in; approval withdrawn: "Access withdrawn" with *Ask again*; no name on the dashboard, or no answer from the service for seven days: *Check again* or *Try again*; a withdrawn version stops here with no button |
| S5 | `install` | Setting up the cluster | `~/.hpcworker/profile.json` present by the listing rule (finding c); else the framework files go up by `PUT` and the install line runs once through the shell (`installFramework`). The same again when `~/.hpcworker/VERSION` is older than the `VERSION` this build carries (the tool keeps the profile and says "upgraded"); an update that leaves the old number in place is reported, not retried, for ten minutes | "Setting up the cluster failed: `<reason>`" (*Try again*); "Updating the tool on the cluster (version N to M)..." |
| S6 | `probe` | Checking a compute node | `probe.json` present (listing and content-type rules); else one probe job is submitted under the scheduler floor and waited for, up to fifteen minutes; then its verdict (`probeVerdict`: the container runs, egress reaches Anthropic, node temp usable) | "Checking a compute node in N s (the scheduler is asked at most once a minute)"; "The check job could not be submitted: `<reason>`" (*Try again*); the verdict's own sentence with *Check again* |
| S7 | `login` | Signing in to Claude on the cluster | Runs when the sign-in is not known to be good (the probe's `claude_auth`, overtaken by a sign-in made from this browser since, then by a live worker's own word unless it checked before that sign-in or the sign-in is under ten minutes old) or a live worker says `need_login` (a dead run's last `need_login` does not count; a live worker still saying it within three minutes of a sign-in from this browser is waited out). The sitting starts an `srun` on the login node, so it waits for the 60 s scheduler floor; then the login terminal opens (`ARCHITECTURE.md` 4.1), the sign-in page opens in a tab, the box takes the code | "Signing in to Claude on the cluster in N s (the scheduler is asked at most once a minute)..."; "Sign in to Claude in the tab that opened, then paste the code it shows below"; "Signed in; your worker re-checks within a minute..."; on failure the framework's own sentence with *Try again* |
| S8 | `statement` | Where your work goes | The disclosure is shown; the statement text (the classification sentence and the Remote Control sentence) is on record for this workspace on the text version in force; the first acknowledgement writes the consent marker `~/.hpcworker/consent` (4.4); also when the run says `need_consent` | "Read where your work goes and make the statement about worker `<name>`" with the tick and *I have read this and the statement is true*; a workspace marked restricted (listing rule) stops here with the marker's path |
| S9 | `start` | Starting your worker | No live worker (a run set less than ten minutes ago with no `status.json` yet counts as live); the consent marker written if still owed; one shell line `hpcworker worker start` under the 60 s floor | "Starting your worker in N s (the scheduler is asked at most once a minute)"; "Your worker could not be started: `<reason>`" (*Try again*); "Your worker is stopped. Start it again when you want it" (*Start my worker*); "Your worker ended with a problem: `<message>`" (*Start it again*) |
| S10 | `online` | Waiting for your worker | `status.json` and `connection.json` read every 10 s for the first two minutes after a start and every 60 s after that while the strip is open (once a minute from the background's alarm otherwise; file reads touch no scheduler) until the environment link appears; a preempted job with a successor queued waits for it | "Your worker (job N): waiting for the job to start / the job is starting Claude Code / Claude Code is registering..." |
| S11 | `open` | Open in Claude | The link matches `https://claude.ai/code?environment=env_...`; opened once per link per browser (`bridge.opened`) when *open claude.ai when my worker connects* is on; the green button stays | "Your worker is online: `<session name>`" |

## The 17 checks under Details

The seventeen checks below are the report's ("Diagnostics the extension runs, in order"), in that
order. Student-facing wording is what the panel shows; it names no internals. Statuses: pass, warn,
fail, repaired, blocked, skipped. On 2026-09-29 all of them but 13 (and the ones behind it) passed on
`ondemand.grid.wayne.edu` (`OPEN_QUESTIONS.md`, finding d).

| # | id | What the student reads when it fails | Technical check | Pass | Fix hint (student) / note (engineer) |
|---|---|---|---|---|---|
| 1 | `access` | "Your account is not on the approved list yet" or "This version has been withdrawn: update to continue" | Acceptance record present for the current agreement version; the approval record for the account name the dashboard shows (never a typed one) is current, from the access service or kept from an earlier answer within its time; kill-list signature valid (bundled public keys); this version not revoked | all true | *Ask for access* opens the request page with the account name filled in; the maintainer approves in the admin console and the next icon click re-checks. Engineer: the kill-list is fail-safe (refuse only on a verified revocation, never on a fetch failure); a kept "approved" answer covers up to seven days without the service, a kept "not approved" ten minutes |
| 2 | `portal-origin` | "Connect your portal" | `permissions.contains({origins: ["https://<host>/*"]})`; the page script is registered for the origin and was injected into the open tab at the grant (`scripting.executeScript` with the same file, then pings), so `tabs.sendMessage` finds a receiver without a reload | true, and the ping answers | "Open your portal in a tab and click the Ashley Bridge button there; the browser asks you to allow that one site." Re-check at every startup, because Firefox and Safari users can revoke per site. Engineer: registration alone leaves an already-open tab without the script (finding a) |
| 3 | `cookie-posture` | "Your browser is blocking the portal's sign-in for the extension; using the slower path" (Chrome and Edge only) | A test GET from the service worker compared with the same GET from the content script | cookie carried by both | Fall back to content-script-only mode; warn if third-party cookies are blocked or the window is Incognito. Skipped on Firefox and Safari, which always use the content script |
| 4 | `portal-signed-in` | "Connect the VPN and sign in to `<hostname>` in a tab" | The PUN warm-up first (`warm()`: `GET /pun/sys/dashboard/` following redirects, retried after 2 s, 5 s and 10 s while the answer is a 5xx or ends under `/nginx/init`; "Waking up your portal..." meanwhile); then 200 HTML with the csrf meta tag and the username | 200 HTML | A 302 to the identity provider, a captive page or a connection error all give this message; never automate the login. Note the time of this check for check 17. Engineer: a cold PUN answers the first request with a 500 ("Error: Server Error ... try again in 30 seconds") or the `/nginx/init` redirect (finding b); every Files, Shell or Jobs call goes through the same warm-up once per client and again after a 5xx |
| 5 | `shell-admitted` | "The portal's shell is not available to you; ask your computing centre" (with the specific reason) | `GET /pun/sys/shell/ssh/<host>` shows `csrf=`; a probe WebSocket opens and a prompt arrives; the discovery batch runs and the shell closes | open, prompt received | Map close code 3146: "No clusters defined." (administrator never configured a cluster), `Host ... not specified` (wrong host: try the profile's `ood_shell_host`), "Invalid Origin." (site behind an extra proxy; administrator sets `OOD_SHELL_ORIGIN_CHECK`), "Bad CSRF Token." (retry with a fresh scrape). Measured 2026-09-29: `default` reaches `warrior` without a password, 1.9 s open to close |
| 6 | `files-json` | "The portal's Files app is switched off at your site" or "Uploads are switched off" | `GET files/fs/<home>` with `Accept: application/json` | 200 with `files[]`; `files_upload_path` present | No Files app means no mailbox and no status reading: stop here and say so. No uploads means the request files are written with `PUT files/fs` instead (measured 2026-09-29: uploads disabled, `PUT` works). Engineer: existence of a file is read from a listing (`stat`/`exists`: the name in `files[]`), never from a download's status, and a download whose `Content-Type` is `text/html` is "not a file" (finding c) |
| 7 | `active-jobs` | "The portal cannot list your jobs" | `GET activejobs.json?jobcluster=all&jobfilter=user` | cluster ids present | Show the `errors` array; it names unconfigured clusters. Once a minute at most: the portal runs `squeue` for it |
| 8 | `submit-routes` | (informational; nothing shown unless asked) | `GET /pun/sys/myjobs/workflows.json`; `GET /pun/sys/dashboard/projects` | 200 or 404 recorded | Records whether a shell-free submission route exists; Job Composer is deprecated in 4.1 and gone in 5.0, so nothing depends on it. Measured 2026-09-29: workflows 200, projects 500 |
| 9 | `reverse-proxy` | (informational: "Live view available" or "Using the file mailbox") | `GET /rnode/<host>/1/`, the host being the login node the discovery named, else the settings' shell host, else the portal host | 503 "Failed to connect" | 404 means the proxy is off or `host_regex` does not match: mailbox mode. Never treat the proxy as authenticating the worker. Measured 2026-09-29: `/rnode/warrior/1/` 404; the compute-node half (`asx1`) not yet probed |
| 10 | `login-node-discovery` | "This cluster's scheduler is not supported yet" or "No container runtime was found" (with the module list) | Through the bootstrap shell, one command batch under 1 s of CPU, then close: scheduler CLIs, the module list from `$MODULEPATH`, Pyxis flag, `user.max_user_namespaces`, proxy and temp variables, `sinfo`, OS release, glibc | scheduler, runtime, partitions, sysctl and environment captured | Engineer: this is the only login-node work besides `sbatch` and the sign-in sitting; it must stay under a second and never run a container. Measured 2026-09-29: `slurm`, `apptainer/1.2.2` plus the singularity modules, 12 partitions, CentOS 7 |
| 11 | `probe-job` | "Your cluster's compute nodes cannot reach Anthropic; ask your centre for an HTTP proxy" or the egress class found | Submit the probe once (ten minutes of wall time; its calls are budgeted to end within about six); read `probe.json` from the state directory (existence rule); `probeVerdict` for check 11 and the strip alike | node-local temp and `/dev/shm` sizes; user namespaces on the node; the image runs; HTTP codes for the three Anthropic hosts with and without proxy | The probe is not optional (TACC hides the runtime module on login nodes). Read the result through Files, never by polling the scheduler. Measured 2026-09-29 from `asx1`: egress direct |
| 12 | `worker-binary` | "Claude Code does not run on this cluster's nodes" | Probe job runs `claude --version` inside the image | version string | glibc or musl mismatch guidance from Claude Code's install troubleshooting; the image, not the host, decides this. Measured: 2.1.283 |
| 13 | `claude-login` | "Sign in to Claude when the strip asks" | The probe reports `claude auth status` (a non-model command) and confirms `CLAUDE_CODE_OAUTH_TOKEN` is unset in the worker environment; a sign-in made from this browser's login terminal after the probe ran (`bridge.loginSeen`) overtakes the probe's word until the next probe confirms it | full-scope login reported | The fix is step S7: the strip opens the login terminal, asks a compute node for Claude Code's own sign-in, opens Anthropic's page and takes the code in one box; the same sitting is `hpcworker claude login` in the portal's own shell. Never `setup-token`. The framework never reads the credential file, only the status answer. Measured 2026-09-29: not signed in (the login was deleted the night before) |
| 14 | `remote-control-ready` | "Make the data statement in the strip once" or "Your cluster cannot reach Anthropic's feature-flag service" | Claude Code's own record first: `remoteDialogSeen: true` in `<claude_config_dir>/.claude.json` and `hasTrustDialogAccepted: true` for the workspace (the only two keys read from that file); the consent marker `~/.hpcworker/consent` written by step S8 is the answer before the first session; then, from the probe, whether `claude remote-control --help` inside the image listed the flags the job uses (`remote_control_flags`; none means a Claude Code too old for Remote Control). The probe runs no `claude remote-control` dry run and no sign-in dry run: `Workspace not trusted`, the consent prompt and `Couldn't verify Remote Control eligibility` are known once signed in, from the running worker's own `rc.log`, which the job maps to `status.json` (`need_consent` for the prompt, `error` with a plain sentence for the eligibility line) | record or marker present; the flags listed | The job answers Claude Code's one-time question from the student's recorded statement and nothing else; the extension types nothing into Claude Code's prompts. A probe that ran before the statement was made reports the marker absent until the next probe |
| 15 | `xdg-runtime` | "A known Claude Code problem on this cluster's nodes; a workaround is applied" | Probe job checks `/dev/shm/$USER/xdg` is writable and runs a bash-tool smoke test | writable, smoke test passes | Repair: set `XDG_RUNTIME_DIR=/dev/shm/$USER/xdg` in the template. If `EACCES` persists, record it as the known upstream defect (closed "not planned") and say so |
| 16 | `data-acknowledged` | "Read where your files and transcript go, and confirm" | The workspace's `.restricted` marker is looked for in the workspace's directory listing (`exists`; never by downloading it: the Files app answers a missing download with a 200 HTML page, finding c) and the profile's `restricted_workspaces`; the statement on record for this workspace on the text version in force; warns when the consent marker is still owed to the cluster ("written at the next start") | statement made, not restricted | Refuse to start otherwise. Also refuse when the CLI reports Remote Control unavailable under Zero Data Retention. Measured 2026-09-29: the download-based test read `.restricted` as present (58,730 bytes of HTML, status 200) with no such file; the listing-based test is the fix |
| 17 | `session-age` | "Sign in to your portal again in a tab" | Time since check 4; any 302 or 401 on a later request | under about 8 hours and no redirect | Never cache anything across the re-login; re-run from check 4 |

Dependencies, for the graph: 2 depends on 1; 3 and 4 on 2; 5, 6, 7, 8, 9 on 4; 10 on 5; 11 on 6 and 10;
12, 13, 14, 15 on 11; 16 on 13 and 14; 17 on 4. Checks 8 and 9 are informational and never block.

Two things the strip does are not checks and are not in the list under *Details*: the sign-in
sitting (step S7) and the environment link (step S11). `CHECK_IDS` in `core/checks.ts` holds the
seventeen ids above and nothing else; a sitting that fails points at check 13, which is the check
that explains it. What the two steps hold themselves to:

| Step | What the student reads when it fails | What the extension does | Ends with | Note |
|---|---|---|---|---|
| S7, the sitting | "The sign-in did not complete: `<the framework's sentence>`. You can try again; nothing was stored" | One shell held open for the sitting (`openLoginShell`, one audit line with the bytes read and typed); the framework's lines arrive in order (`HPCW-LOGIN:` progress, then `AUTH-URL:` or an immediate `SIGNED-IN`, then `SIGNED-IN` or `HPCW-LOGIN-FAILED:`); `AUTH-URL` is `https` on `claude.ai` or `claude.com` before it is opened (else reported as refused); the code goes to the shell as keystrokes and is kept nowhere; the framework ends the sitting after ten minutes for the paste (and waits at most ten for a node), the panel closes the socket after fifteen | `SIGNED-IN` | Engineer: nothing is printed while the framework waits for the code and no keep-alive is sent; whether the portal's five-minute idle timer closes a slow sitting is not yet measured (a progress line once a minute is the fix if it does). A portal tab reload ends the sitting, and the strip says so |
| S11, the link | (nothing; a link that does not match is shown as text) | The link the job reported matches `https://claude.ai/code?environment=env_...` exactly; anything else is shown as text and never opened; a matching link is opened once per link per browser (`bridge.opened`) when the setting is on, and by the green button on request | the tab open | The only claude.ai page the strip opens by itself |

## What the student sees

The strip: one step title with its number, one line in plain words, and a button only where a person
must act ("Connect this portal", "Open my portal", "Ask for access", "I have read this and the statement
is true", "Try again") or the box the step needs (the statement, the login terminal with its
one box and *Open the sign-in page again*); nothing where the step runs by itself. Under *Details*:
the worker card, the buttons (*Set up the cluster again*, *Run the probe job again*, *Sign in on the
cluster*, *Start worker*, *Stop*, *Read status now*), the seventeen checks as a list, the lowest
failing check first, each with its fix sentence and a button where a person must act, the `rc.log`
tail, the audit log (view, export, clear), the access and agreement line, the settings and the Google
Drive step. A student never sees close codes, endpoint paths, environment variable names or module
lists; those go to the log the student can open and export.

Three things in the same panel are not checks. The green *Open in Claude* button appears when the
files carry the session's claude.ai link and opens it in a new tab (with *Copy link* beside it); the
strip opens that tab once by itself unless the student turned the setting off. The setting *start my
worker when I open my portal* runs the same steps when the portal tab connects, and is explained in one
sentence where it is switched (on by default in the current build; the maintainer's review settles
which ships). The optional step *Connect Google Drive in claude.ai* opens
`https://claude.ai/settings/connectors` in a new tab with one sentence of instruction and a *done* tick
that is kept only in the browser; the extension has no presence on that page.

## The framework's cluster-side checks

These run inside jobs the student owns and write their answers to files the extension reads through
the Files channel, or print them on the sign-in sitting's terminal. Nothing here is run by the
extension directly.

### Phase 1: login node, through the bootstrap shell (one batch, under 1 s, no network)

| id | Assumption | Check | On failure |
|---|---|---|---|
| `scheduler-cli` | A supported scheduler's client is on `PATH` or in `bin_dir` | `command -v sbatch`, `qsub`, `bsub`, `condor_submit` | "Unsupported scheduler"; record what was found |
| `runtime-hint` | A container runtime is visible, or is expected only on compute nodes | `command -v apptainer singularity podman enroot`; the module list from `$MODULEPATH` (`module -t avail` only with `--full`: 0.76 s of CPU on `warrior`); `srun --help \| grep -c container-image` | Informational; the probe job decides |
| `userns-login` | User namespaces are enabled | `/proc/sys/user/max_user_namespaces` | Predict the fakeroot rung; confirm on the node |
| `partitions` | The profile's partitions exist and are up | `sinfo -h -o '%P\|%l\|%a'` | Name the missing partition |
| `env-proxy-tmp` | Proxy and temp variables are known | `env` filtered for `*_proxy`, `TMPDIR`, `SLURM_TMPDIR`, `L_SCRATCH` | Seed the profile; the probe overwrites |
| `os-glibc` | The host OS and glibc are recorded | `/etc/os-release`; `ldd --version` | Informational (the container absorbs an old glibc) |
| `login-tmp-clean` | Nothing of ours is under the login node's `/tmp` | `find /tmp -maxdepth 1 -user "$USER" \( -name 'hpcworker*' -o -name 'rootfs-*' -o -name 'build-temp-*' -o -name 'apptainer*' -o -name 'singularity*' \)`: `-user` first, then the name alternatives in one parenthesised group, so the check never matches another user's entries | Reported; the framework deletes nothing there, the student removes leftovers themselves |

### The sign-in sitting (`hpcworker claude login --plain`, one short allocation with a terminal)

What `framework/lib/login_plain.sh` checks and prints, in order; every failure is one
`HPCW-LOGIN-FAILED:` sentence and exit 3.

| id | Assumption | Check | On failure |
|---|---|---|---|
| `login-alloc` | The scheduler grants a short interactive allocation on the CPU partition | `adapter_interactive` (`srun --pty` on `secp/secondary`, 2 GB): the panel's `--plain` sitting asks 20 minutes of wall time with `HPCW_ALLOC_WAIT_S=600`, so `-I600` ends a wait for a node after ten minutes in words rather than hanging; the person's form (`hpcworker claude login` typed in the shell) asks 30 minutes with no bounded wait | the scheduler's sentence; "the sign-in helper is missing from the installed copy; run hpcworker install again" when `lib/login_plain.sh` did not arrive |
| `login-image` | The image has what the sitting needs | `script`, `setsid` and the `claude` binary present; the sitting's directory under `<ipc_dir>/$USER/hpcw_login_<job>` writable, mode 0700 | "this image has no terminal helper (script); ask your lead to rebuild it" and kin |
| `login-already` | A held sign-in needs no page | `claude auth status` before anything else; `SIGNED-IN <email> <plan>` and exit 0 when `loggedIn` is already true | (not a failure) |
| `login-seed` | Claude Code's first-run screens do not sit in front of the link | The SEED adds `hasCompletedOnboarding`, `theme` and the workspace's `hasTrustDialogAccepted` to `.claude.json` before the sign-in (added only, never removed, never on an unparseable file); should a login-method menu still sit in front of the link, the sitting presses Enter for its first entry, at most six times, never while the link is up. Whether such a menu appears at all under the seeded sitting is not yet measured: the real `claude auth login` screen has not been run under it, only the stand-in | |
| `login-url` | Claude Code prints its sign-in link | `claude auth login` under `script` with echo off, the screen in a 0600 transcript under the sitting's directory; the first `https://` link on an Anthropic host containing `oauth` and `authorize`, wrapped lines rejoined, goes out once as `AUTH-URL: <url>`, then `HPCW-LOGIN: paste the code from that page` | "Claude Code did not show a sign-in link within two minutes; try again, and if it repeats ask your lead" |
| `login-code` | The code arrives once and is never echoed | One line from standard input (the shell), taken once Claude Code's paste prompt is up or five seconds after the link; sent to the pseudo-terminal, then Enter; `HPCW-LOGIN: code received, checking`; a rejection on the screen prints "that code was not accepted; paste it again" | "no code arrived within 10 minutes; start the sign-in again"; "the shell closed before a code arrived; start the sign-in again" |
| `login-result` | Claude Code's own answer after the exchange | Claude Code leaves; `claude auth status` up to three times, three seconds apart; `SIGNED-IN <email> <plan>` and exit 0 (never the token) | "Claude Code did not accept the code; start the sign-in again and paste the whole code"; "the sign-in did not complete; start it again" |
| `login-cleanup` | The sitting leaves nothing behind | Its process group is ended, its pipe, transcript and launcher removed, the terminal settings restored; the directory goes with the allocation's guarded cleanup (`hpcw_rm_own_tmp`, which refuses anything not named `hpcworker_<id>`, `hpcw_<id>` or `hpcw_probe_<id>`) | |

No probe runs the sitting: what the sign-in flow looks like at a site (whether a link and a paste
prompt appear, whether a menu sits in front of them) is known once a person has signed in through it,
and the first live sitting is the measurement (`OPEN_QUESTIONS.md`, "Not yet measured under the new
flow").

### Phase 2: the probe job (ten minutes of wall time, default partition)

Every call inside the image has its own budget (`in_image <seconds>` in `jobs/probe.sbatch`: 90, 60,
45, 45, 30, 30 s) and the six egress curls 10 s each, so the job ends inside its wall time however
slow the node is. Two probes of 2026-09-29 (09:56 UTC, `asx1`) printed their first line and hit the
earlier five-minute wall time without writing `probe.json`, with budgets that summed past it and the
sign-in dry run on top; the dry run is gone and the wall time is ten minutes. The probe does not run
the sitting: `probe.json` records `login_flow` as not probed.

| id | Assumption | Check | On failure |
|---|---|---|---|
| `node-tmp` | Node-local temp resolves and is writable and large enough | `node_tmp()` order; `df`; write test. On Wayne State `$TMPDIR` is CephFS, so a local-disk test is required, not an environment read | Fall to the next candidate; record size |
| `dev-shm` | `/dev/shm` is writable with room for IPC and the XDG directory | `df /dev/shm`; write test | "No shared-memory scratch"; refuse to start the worker |
| `userns-node` | User namespaces work on the compute node | `unshare -U true` or the runtime's own check | Adjust the fakeroot rung |
| `runtime-exec` | The runtime can run the image from the node | the image's `node --version` and `claude --version` with temp and cache on node-local disk | Distinguishes registry egress from namespace failure by the error text |
| `egress-matrix` | Compute nodes reach Anthropic's hosts directly or through an HTTP proxy | `curl -m 10 -o /dev/null -w '%{http_code}'` against `api.anthropic.com`, `platform.claude.com`, `claude.ai`, with and without inherited proxy variables | Egress class `none`: "ask your centre for an HTTP proxy". Measured on Wayne State 2026-09-28 from `asx15` and 2026-09-29 from `asx1`: `api.anthropic.com` 404 (reachable), `platform.claude.com` 200, `claude.ai` 403 to curl |
| `flag-host` | Claude Code can reach its feature-flag service | Known once signed in: the running worker greps its own `rc.log` for "Couldn't verify Remote Control eligibility" and writes `state: error` with a plain sentence naming the node; the probe cannot observe it (no dry run) and the hostname is not named by Anthropic | The sentence in `status.json` is the signal. On 2026-09-28 `statsig.anthropic.com` had no DNS record from the node; this does not settle the question. Worker 40501099 registered from `asx1` on 2026-09-29 (09:55 UTC), which it could not have done had the check failed there |
| `claude-version` | The pinned Claude Code runs inside the image | `claude --version` | glibc or musl mismatch |
| `claude-auth` | A full-scope login exists and no token variable overrides it | `claude auth status` with `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the file-descriptor variants removed from the environment | "Sign in to Claude when the strip asks" (step S7) |
| `rc-flags` | The image's `claude remote-control` accepts the flags the job uses | `claude remote-control --help` inside the image (45 s budget); the `--` flags it prints are recorded as `remote_control_flags`, with the first lines of its output so an error is visible. There is no `claude remote-control` dry run and no sign-in dry run in the probe: the registration line, `Workspace not trusted`, the consent prompt, `Couldn't verify Remote Control eligibility` and the full-scope-token error are known once signed in, from the worker's own `rc.log`, and the job maps each to a `status.json` state and sentence | Check 14 reads the flags; a `--help` that printed nothing is reported as such |
| `xdg-fix` | The bash tool works with `XDG_RUNTIME_DIR` under `/dev/shm` | Create `/dev/shm/$USER/xdg`; run a bash-tool smoke test | Record the known upstream defect |
| `attach-allowed` | `srun --overlap` attach is permitted (diagnostic only) | `srun --jobid=$SLURM_JOB_ID --overlap true` | Informational; attach disabled for this site |

### At every worker start (the job template itself)

| id | Assumption | Check | On failure |
|---|---|---|---|
| `state-dir` | The run's state directory on shared storage is writable | `mkdir -p`; write `status.json` (`state: starting`) | Exit with a reason in the job log |
| `job-token` | A per-job token exists, mode 0600, never in the environment or argv | `stat -c %a` on the token file | Regenerate; refuse if the mode cannot be set |
| `manifest` | The working directory is inside the task manifest and not marked restricted; partitions and egress hosts match | Compare against the manifest file the extension wrote | Refuse to start; `status.json` says why in plain words |
| `credential-env-clean` | No credential variable reaches Claude Code | Assert the variables listed under `claude-auth` are unset before `tmux` starts | Refuse to start |
| `registration` | Remote Control registered | The registration line appears in `rc.log` within the timeout | `status.json` `state: error` with the last cleaned line of `rc.log`; the extension maps the full-scope-token error to step S7 |
| `heartbeat` | The worker is alive and the login still valid | `status.json` rewritten every 30 s (`HEARTBEAT_S`, the template default in `lib/profile.py`; the loop wakes every 5 s), `.part` then rename; `claude auth status` at start and then every 300 s (`AUTH_EVERY_S`), also while the job waits in `need_login`; the answer recorded as `loggedIn`, `email` and `subscriptionType` only, never the credential; the only thing read from the login directory is Claude Code's own `remoteDialogSeen` key (and the workspace's `hasTrustDialogAccepted`), never the credentials file | `state: need_login` |
| `consent-on-record` | The student answered the Remote Control question themselves | `remoteDialogSeen` is `true` in `<claude_config_dir>/.claude.json`, Claude Code's own record of the answer, or the marker `~/.hpcworker/consent` (and the profile's `consent_markers`) the extension wrote on the student's acknowledgement; nothing else is read from Claude Code's file | `state: need_consent`; the job waits; step S8 writes the marker |
| `successor` | Exactly one successor is queued before the wall time ends, so the worker is always on | `sbatch --dependency=afterany:$SLURM_JOB_ID,singleton` of the same rendered script, once, its id recorded in the run directory; no submission when the stop file exists or a successor id is already recorded | The chain ends; `status.json` says the worker will not come back by itself and a start is needed |
| `cleanup-scope` | The job removes only its own node-local temp and its `/dev/shm` directory | The cleanup helper refuses any path whose last component is not `hpcworker_<id>`, `hpcw_<id>` or `hpcw_probe_<id>`; nothing under the login directory, the workspace or another run is ever removed | Refuse to start rather than clean up outside those paths |
| `sigterm-flush` | Preemption and the wall time are recorded | The `SIGTERM` trap (`--signal=B:TERM@120`) writes `state: preempted` and names the successor; after a stop request it writes `state: stopped` instead | The successor already queued with `afterany` reconnects: `--continue` while `connection.json` is younger than 4 h, else a fresh registration in the same environment |

## Adding a check

1. Give it an id, a title, its dependencies, a one-sentence assumption, a check, a manual fix in plain
   words, the future risk it guards against (how a university or vendor update could break it), and a
   repair only when the repair is safe to run unattended.
2. Cluster-side checks emit one line per node in the same shape (`id`, verdict, detail) into the file
   the extension reads; the extension carries a mirror node with the same id.
3. Add the ids to the feature's required list so the test fails when they go missing.
4. Wording for students is reviewed against the rule in `CLAUDE.md`: one path, no internals.
5. A step of the strip that can fail names the check that explains the failure; a step is not added
   without one.
