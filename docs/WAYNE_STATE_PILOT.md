# Wayne State pilot

The concrete plan for the first campus. Wayne State is the design case: its rules (a 20-process cap on
the login node `warrior` with immediate deletion and suspension for violations, nothing
container-related on the login node, a swept `/tmp`, a Panasas home, a CentOS 7 login node, a VPN-only
portal) are the strictest in the sample, and a product that satisfies them is portable by construction
(report, "Twelve of twelve sampled clusters"). Written for the maintainer and for whoever at C&IT reads
it.

## Prerequisites

For the student:

- A Wayne State AccessID approved for Beethoven
  ([From request to installation](#from-request-to-installation)); one approval covers one
  installation.
- The Wayne State VPN (GlobalProtect) connected: `https://ondemand.grid.wayne.edu/` is VPN-only.
- An Open OnDemand login at that address (AccessID and password) and a grid account.
- Membership of the grid group `oschome`, added by C&IT or the group's owner before the first run.
  The lab's volume `/rs/rs_grp_oschome` is readable by that group only (`other::---`), and
  everything the worker needs sits under it: the shared copy of the tool
  (`.../shared/beethoven/hpcworker/current`), the container image, the `claude` binary and the
  student's state directory. Without it neither install mode helps (read from the permissions, not
  yet seen with a second account: the extension falls back to uploading its own copy, and the probe
  then fails on the image). On 2026-09-29 the group had two members (ab5188, go2432); how and how
  fast a student is added is not yet known.
- A Claude Pro or Max subscription in the student's own name. Remote Control is available on Pro, Max,
  Team and Enterprise; API keys and `setup-token` credentials do not work.
- Google Chrome 148 or later, signed in with the Google account given on the request form. Beethoven
  8.0.0 is offered only on a private Chrome Web Store listing, which opens for the members of the
  lab's Google Group `Beethoven-users` and for no one else; there is no download and no other store.

For the site profile (`framework/profiles/wayne.json`, `site: wayne`, so sessions are asked for as
`wayne-<jobid>`): scheduler `slurm`, `submit_host: warrior`; `partition_cpu: secp` with `qos_cpu:
secondary` for interactive allocations (the sign-in sitting), the probe and tests;
`partition_cpu_batch: reqp` with `qos_batch: requeue` for long workers; GPU partitions `gmsap` and
`gvohp`; `shared_state_dir: /rs/rs_grp_oschome/$USER/hpcworker` (the CephFS volume; the home is a
Panasas soft quota that was 93 percent full, `home_filesystem: panfs`); `runtime: apptainer` with
`runtime_module: apptainer/1.2.2` (measured to build and exec unprivileged sandboxes on `asx1`);
`node_tmp: /tmp/$USER/hpcworker_$SLURM_JOB_ID` with `tmpdir_is_node_local: false`, because `$TMPDIR`
on this grid points at CephFS; `ipc_dir: /dev/shm`; the image is the existing shared sandbox
`/rs/rs_grp_oschome/shared/beethoven/containers/claude-node22` with Node 22 and the pinned Claude
Code (new images at this site should be SIF because the home is Panasas); `claude_config_dir:
$HOME/.beethoven/claude`, the student's existing Claude Code login folder from Beethoven for VS
Code, which the framework only starts Claude Code in (the lab folder and the sign-in folder were
`shared/ashley` and `~/.ashley/claude` until 2026-09-30; both names are now links); `egress.class:
direct` for the three named hosts (measured, below); `ood_base_url:
https://ondemand.grid.wayne.edu`; `ood_shell_host` `default` (measured 2026-09-29: it reaches
`warrior` without a password); `ood_rnode_enabled` false for the login node (measured 2026-09-29:
`/rnode/warrior/1/` 404), compute nodes not yet probed; `vpn_required: true`; `login_node_rules:
{max_processes: 20, poll_floor_seconds: 60}`; `xdg_runtime_fix: true` until question 5 says
otherwise. The template submits with `-D` because `#SBATCH --output` resolves against the submit
directory here, and chains with `afterany`, never `afterok`. Container temp and cache
(`APPTAINER_TMPDIR`, `APPTAINER_CACHEDIR`) sit on the compute node's local disk; no container
command runs on `warrior`. Since framework 9 the profile also sets `scheduler_in_worker: true`: each
worker job binds the host's own Slurm client into its container on the compute node (the host's
`/usr/bin`, read-only, under `/opt/host/bin` and off the container's PATH, with five wrappers that
reach it; `/usr/lib64/slurm`, the munge library and socket, `/etc/slurm`, and
user lists that add the `slurm` and `munge` accounts), so the student's Claude Code in the worker can
submit, follow and cancel the student's own jobs with `sbatch`, `squeue`, `sacct`, `scancel` and
`sinfo`. `scontrol` is not offered: on the node it needs a library the container lacks. No other
site profile sets the flag.

## From request to installation

Five stages, each stamped with its time on the student's record in the access service (the Worker in
the repository of Beethoven for VS Code, `tools/intake/`; `ACCESS_CHECK.md` there is the contract).
The admin page (`https://openspineconsortium.com/beethoven/admin.html`, behind the admin token) and
`admin.mjs list` show each account's stage.

| Stage | What happens | Who acts | Recorded |
|---|---|---|---|
| Submitted | The form at `/beethoven/request.html`: AccessID, name, `<AccessID>@wayne.edu`, the Google account the student signs in to Chrome with, what it is for, an optional CV (PDF or Word, 5 MB) | student | `submitted_at` |
| Confirmed | With `MAIL_STUDENTS` `"1"`, a *Confirm it is you* link goes to `<AccessID>@wayne.edu` (24 hours, one use), and the maintainer is e-mailed only once it is pressed; a request nobody confirms lapses after 7 days and the student can send the form again. With `"0"`, as deployed on 2026-09-30 (the sending domain is not verified at Resend yet), this stage is skipped and the maintainer's e-mail says the mailbox is not verified | student | `confirmed_at` |
| Decided | *Approve for Beethoven*, *Lab membership only* or *Deny*, from the one-use links in the maintainer's e-mail or on the admin page | maintainer | `decided_at`, `decision` |
| Invited | The maintainer adds the Google account to the Google Group `Beethoven-users` at `https://groups.google.com/g/beethoven-users/members`, then presses *Done, invited* on the page the Approve link shows, or *Mark invited* on the admin page. A daily e-mail (13:00 UTC, from `beethoven-access` only) lists every approval for Beethoven not invited after an hour, the store reviewers' mock account and accounts already installed aside, each with its own *Done, invited* link | maintainer | `invited_at`, `invited_by` |
| Installed | The student installs from the private listing; its first approval check binds the account to that installation | student (the extension, by itself) | `installed_at` |

The invitation is by hand because the group belongs to a personal Google account, and Google offers
no programming interface for the members of such a group (its Directory API serves only groups a
Google Workspace owns); the service's part is to remember who is approved and not yet invited, and to
remind the maintainer once a day. When the lab has a Google
Workspace, `GROUP_MODE` `"workspace"` makes Approve add the account itself through the Workspace
Directory API (`members.insert` on `beethoven-users@openspineconsortium.com`, as a service account with
domain-wide delegation acting for a Workspace administrator; its key is `google_group_sa.json` in the
vendor folder, sent as the secret `GROUP_SA_KEY`); any error there falls back to the manual step with
the error shown. That adapter is off by default, tested against a stub only, and has never been
called against Google. Google sends no invitation when the service adds someone, so in that mode the
student's approval e-mail says they are already in the group and that the maintainer sends the
listing's link, and the Approve page and the admin page tell the maintainer to send it.

When the service e-mails students, an approval for Beethoven also tells the student to watch for the
Google Groups invitation at the Google account they gave and accept it, to install from the private
listing once, and where the page that says how it works is (`ONBOARDING_PAGE`,
`https://openspineconsortium.com/beethoven/`). Being in the group is what lets Chrome install
Beethoven; the approval check is what lets an installation work. Both are needed, and removing
someone means both: Remove on the admin page (or *Withdraw approval* in an e-mail), and taking the
account out of the group.

## The student's three steps

Once, before the first run: install the extension from its private listing on the Chrome Web Store
(above) and read and accept the agreement on its setup page. There is no key to paste: the extension
reads the AccessID the portal's dashboard shows for the signed-in session and asks Licensor's access
service whether that account is on the approved list. A student not yet on it presses *Ask for
access* (the request page opens with the AccessID filled in), and the stages above follow; the next
click of the icon after the approval re-checks.

1. **Open the portal tab.** Connect the VPN, sign in at `ondemand.grid.wayne.edu`, and keep the tab
   open.
2. **Click the Beethoven icon.** The first time, the browser asks once to allow that one site.
   Then the extension works through its steps by itself and says which one it is on: it wakes the
   portal's web server up, checks the sign-in, installs `hpcworker` into the account if it is not
   there (files through the Files app, one install line through the shell), runs one check job on
   `secp` the first time (the probe: ten minutes of wall time, its checks budgeted to end within about
   six; it also reports whether Claude Code on the cluster is signed in), signs the student in to
   Claude if it is not (step 3), shows *Where your work
   goes* and takes the student's statement about the worker's workspace once (this also records the
   student's answer to Claude Code's one-time Remote Control question, so no `y` is ever typed by
   hand), submits the worker on `reqp` through the portal shell (one `sbatch`, then the shell closes)
   and waits for Claude Code to connect, reading `status.json` every ten seconds for the first two
   minutes and once a minute after that (file reads touch no scheduler).
3. **Sign in to Claude once, when the panel asks.** The extension starts a short sign-in sitting on
   `secp` inside the worker image (`hpcworker claude login --plain`), opens Anthropic's sign-in page
   in a new tab, and shows one box. The student signs in with their own Claude account, clicks
   *Authorize*, and pastes the code the page shows into the box. The code is typed once into that
   sitting and forgotten; Claude Code keeps the credential in `$HOME/.beethoven/claude`; the sitting
   ends by itself within ten minutes. The worker is then started, registers, and the claude.ai tab
   opens by itself, once per new session link in this browser (the setting *open claude.ai when my
   worker connects* is on unless the student turns it off; the green *Open in Claude* button stays
   either way). A student whose sign-in still holds sees this step end at once with no page to open.

From then on the worker is always on: before its wall time ends the job queues one successor
(`sbatch --dependency=afterany:<its own id>,singleton` of the same job file, never more than one), and
the successor reconnects the same session. A later click on the icon, with the worker alive, brings
up the panel at *Open in Claude*, whose green button opens the claude.ai tab again (*Copy link*
beside it); the tab opens by itself only once per new link in this browser. *Stop* under *Details*
writes the stop file that ends the chain and cancels the job. Settings (shell host, site profile, permission mode, the two automatic behaviours,
error reports) are on the extension's options page, not in the panel. The optional step *Connect
Google Drive in claude.ai* remains: it opens `https://claude.ai/settings/connectors` in a new tab with
one sentence saying what to do there; the student ticks *done* when finished, and the tick is kept
only in the browser. The extension does nothing on that page.

What the student never types: `hpcworker claude login` (the extension runs the sitting), `y` to
"Enable Remote Control?" (answered from the recorded statement), Ctrl-C (the sitting ends itself when
Claude Code reports the sign-in), or a second command of any kind. The one thing they paste is the
code, because Anthropic's rule puts the sign-in inside Anthropic's own flow and the extension never
reads that page or the clipboard.

## What C&IT must approve, and how the product is presented

Wayne State's generative-AI guideline says "All AI tools must first be approved by C&IT; third-party AI
bots are not approved for use at this time," and bars FERPA data, PII, PHI, financial and HR records
and "unsanitized research data" from AI tools. Until C&IT approves, Beethoven is, on the face of
that guideline, a third-party AI bot. The request to C&IT presents it as what it is:

- The AI is the student's own Claude Code, under the student's own Anthropic subscription, running as an
  ordinary Slurm job in the student's own account. The vendor runs no model, sees no prompt and holds no
  credential; the one-time sign-in code the student pastes passes through their own browser into their
  own job's terminal and is not stored or logged.
- It is supervised by default: every command is approved by the student in the Remote Control
  interface. This is the mode Utah, NERSC and USC require of coding agents on their systems.
- Nothing container-related runs on `warrior`, and nothing of ours goes under its `/tmp`. That is
  C&IT's instruction of 2026-09-28, given after a container build left files under `/tmp` there, and
  the framework enforces it: container commands run only inside jobs, with temp and cache on the
  compute node's local disk.
- Nothing else runs on `warrior` beyond one `sbatch`, `squeue` or `scancel` per action, plus, once,
  the `srun` client of the student's own sign-in sitting for as long as the sitting lasts (up to ten
  minutes waiting for a node and ten for the paste, the framework's own limits; the panel closes the
  connection after fifteen minutes whatever happened), which is exactly what the student would
  run by typing the command in the portal's own shell. That follows the published grid policy (no
  more than 20 processes on Warrior;
  the login node is for job submission, status and transfers), not a new instruction.
- From framework 9 the student's Claude Code inside the worker can submit, follow and cancel the
  student's own jobs, through the host's own Slurm client bound into the container on the compute
  node (read-only, but for the munge socket); none of it touches `warrior`. A job submitted that way is an ordinary job of the
  student's account, under the same partitions, QoS and limits, runs outside the container and
  outlives the worker. In the default permission mode the student approves each command in the
  Remote Control interface, and the guide the framework writes into the workspace tells Claude Code
  to follow a job at most once a minute, to cancel only its own jobs by id and never the worker, and
  to keep a container job's temp and cache on the node's local disk.
- Scheduler-facing calls never faster than once a minute, and every job has a wall time. These two
  are the product's own etiquette, taken from the strictest published rules in the twelve-site
  sample (FASRC's once-a-minute rule, TACC's "every few minutes") and from the licence terms of
  Beethoven for VS Code; C&IT has not asked for them, and the framework keeps them anyway: the job
  writes `status.json` and clients read the file.
- Using the student's own portal session from the student's own browser is the student's own use under
  UP 00-1, which prohibits accessing another person's account and obtaining credentials through
  another's negligence, not software a user installs in their own browser. The extension does not touch
  the MFA approval step.
- The data guideline is enforced, not merely disclosed: the extension refuses to start a worker in a
  folder the student has marked restricted, and tells the student at every start that files and output
  go to Anthropic, that the transcript is stored on Anthropic's servers while connected, that a personal
  plan has no BAA, and that FERPA, IRB and export-controlled data must not be in the working directory.
- The exact host and permission list is published so C&IT can pin the extension to
  `ondemand.grid.wayne.edu` with browser policy if it manages any machines.

Also to put to C&IT, from the earlier reports of the VS Code edition (then Ashley): the ownership
question for a tool built by a university employee, and whether the reverse proxy admits compute
nodes (the Shell app's host is now measured: `default` reaches `warrior`).

## The two written answers still needed

Both precede any paid edition; neither blocks the free, approved-list pilot on the maintainer's own account.

1. **Wayne State C&IT:** written approval of Beethoven as a supervised, user-run Claude Code inside
   a batch job, under the generative-AI guideline, with the data restrictions above. Ask also whether
   the reverse proxy admits compute nodes.
2. **Anthropic:** a written answer, through the route the Claude Code legal page names, on hosting
   the unmodified binary under each student's own subscription with Remote Control started from a
   Slurm job. The draft in the `docs/ANTHROPIC_REQUEST.md` of Beethoven for VS Code covers the
   pattern; add Remote Control from an `sbatch` job explicitly to its third question before sending.

## Measurements to collect

Already measured:

- 2026-09-28, compute-node egress from `asx15`, direct: `api.anthropic.com` HTTP 404 (reachable),
  `platform.claude.com` 200, `claude.ai` 403 to curl, `statsig.anthropic.com` no DNS record. The
  feature-flag host is unnamed by Anthropic, so the last result settles nothing.
- 2026-09-28, paste-code `claude auth login` completed from a compute node inside the image, in
  `$HOME/.ashley/claude` (Ashley's `CLAUDE_CONFIG_DIR`, which the Wayne profile's `claude_config_dir`
  points at); `claude auth status` reported `loggedIn: true`, plan `max`. That login was lost when the
  folder was deleted at 22:34 local the same evening (`SECURITY.md`, incident record); it is redone
  through the extension's sign-in step.
- 2026-09-29 (02:22 UTC), Remote Control from a batch job (Q1): Ashley's phone host, Slurm job 40496445 on
  `asx15`, `sbatch` with a pseudo-terminal from `script -qfc`, the student's Remote Control answer
  already on record, registered and served a session opened from the phone. Q1 is answered yes.
- 2026-09-29 (05:13 local), the extension against the live portal, signed in as `go2432`: shell open
  and closed in 1.9 s through the `default` host (`warrior`, no password); Files lists the home,
  uploads disabled, `PUT` works; 83 active jobs; Job Composer JSON 200, Projects 500;
  `/rnode/warrior/1/` 404; discovery `slurm`, `apptainer/1.2.2` plus singularity modules, 12
  partitions, CentOS 7; the probe from `asx1` fine, egress direct, Claude Code 2.1.283 in the image; not
  signed in to Claude on the cluster by the probe's word (the probe of 04:06 UTC; a worker in that
  state writes `need_login`, "Claude Code on the cluster is not signed in; sign in from the panel (or
  run: hpcworker claude login). This job waits and asks again every minute."). By 09:55 UTC a worker
  started by hand (job 40501099, `asx1`) reported `loggedIn: true`, plan `max`, and registered: the
  sign-in was redone by hand between the two, by a path not recorded. Three defects found and their
  fixes decided (`OPEN_QUESTIONS.md`,
  findings a to c): the page script not injected into the already-open tab; a cold per-user web server
  answering "Server Error" once; a missing `.restricted` read as present because the Files app answers
  a missing download with a 200 HTML page.
- 2026-09-30, the Slurm client inside the worker's container (framework 9): check job 40518457 on
  `asx1` (`secp/secondary`, five minutes asked, not a worker), with the binds made as a worker makes
  them. Inside the container `squeue -u go2432`, `sinfo -s`, `sacct -j 40518457 -X` and
  `scancel --version` (`slurm 23.02.6`) worked, and `sbatch --test-only -p secp -q secondary` was
  answered by the controller without submitting anything; `scontrol show job` failed on a missing
  `libreadline.so.6` and is not offered since. Two changes made after that job (no `scontrol`, the
  host's `LD_LIBRARY_PATH` in the wrappers) have not been run on the grid, nor has a real
  submission by a worker's Claude Code (`framework/README.md`, "What was run on the Wayne State
  grid").

To collect, in this order (each maps to `OPEN_QUESTIONS.md`):

| Measurement | How | Records |
|---|---|---|
| One whole run under the new flow | from the icon click on a fresh account: the steps in order, the probe, the sign-in sitting, the worker registering, the claude.ai tab opening | time per step; the framework's marker lines as printed; the time from the click to `AUTH-URL:`; whether the portal's five-minute idle timer closed the shell while the student was on Anthropic's page (nothing is printed while the code is awaited); for a worker that was already waiting in `need_login`, how long it took to notice the sign-in |
| Remote Control registers from `sbatch` under a pseudo-terminal and stays registered (Q1) | answered yes 2026-09-29 (02:22 UTC) with Ashley's phone host (job 40496445, `asx15`); repeat once with this framework's own template on `reqp` from the worker's CephFS workspace: watch `rc.log` and claude.ai/code; send a prompt from the phone; leave it an hour | the registration block (`Connected`, `Capacity`, the session name line, the `https://claude.ai/code?environment=...` URL), time to appear, whether a prompt round-trips, the `rc.log` tail when it exits |
| Feature-flag reachability (Q2, remainder) | known once signed in: the worker greps its own `rc.log` for "Couldn't verify Remote Control eligibility" and writes `state: error` with a sentence naming the node; read `status.json` and the `rc.log` tail of the first worker on each partition (no failure on `asx1` on 2026-09-29: worker 40501099 registered) | present or absent, per node |
| Trusted Devices enrolment from a node (Q3, remainder) | turn on *Require trusted devices* on the account, sign in through the sitting, check the session is steerable | works or the error text |
| Requeue and `--continue` (Q4) | let the always-on chain run past one wall time (the successor runs `--continue` when `connection.json` is younger than 4 h, else registers afresh in the same environment); separately, `scontrol requeue` a live session | whether the transcript continues; whether the environment URL stays the same; elapsed time |
| Bash tool `EACCES` and the `/dev/shm` XDG fix (Q5) | the probe's smoke test with and without the variable, once a sign-in exists | pass/fail each way |
| `/rnode/` for compute nodes (Q6, remainder) | signed in on the VPN: `GET /rnode/asx1/1/` | 404 or 503 |
| User namespaces and `srun --overlap` on nodes (Q10, remainder) | the probe job's `--overlap` test | pass/fail |
| Service-worker WebSocket lifetime (Q11) | an instrumented bootstrap held 90 s with pings only; and the sign-in sitting's idle behaviour above | which side closes, when |
| Login-node footprint | `ps -u $USER` on `warrior` during a full run including the sign-in sitting; `find /tmp -user $USER` afterwards | process count peak (must stay far under 20); nothing under `/tmp` |
| Portal request rate | the extension's audit log over one hour of monitoring | requests per minute to the scheduler-facing routes (must be at most one) and to Files |
| Time to first prompt | from the icon click to a prompt answered on the phone | seconds, with the queue wait and the sign-in separated out |
| A job submitted from inside a worker (framework 9) | from a Remote Control session, ask the worker's Claude Code to submit a one-minute job with `sbatch`, follow it and report its output | whether it submits; the new job's environment (the host's PATH, no `SLURM_` variable of the worker's but `SLURM_CONF`); that it runs on after the worker stops; how often `squeue` or `sacct` was called |
| Usage-limit effect | the plan's usage indicator before and after a one-hour supervised session | what a student should expect to spend |

Each result goes into the results column of `OPEN_QUESTIONS.md` with date, node and the raw line, and
the log under `docs/measurements/`.
