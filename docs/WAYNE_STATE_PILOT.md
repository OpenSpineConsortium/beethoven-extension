# Wayne State pilot

The concrete plan for the first campus. Wayne State is the design case: its rules (a 20-process cap on
the login node `warrior` with immediate deletion and suspension for violations, nothing
container-related on the login node, a swept `/tmp`, a Panasas home, a CentOS 7 login node, a VPN-only
portal) are the strictest in the sample, and a product that satisfies them is portable by construction
(report, "Twelve of twelve sampled clusters"). Written for the maintainer and for whoever at C&IT reads
it.

## Prerequisites

For the student:

- A Wayne State AccessID on the approved list for the Trial Edition.
- The Wayne State VPN (GlobalProtect) connected: `https://ondemand.grid.wayne.edu/` is VPN-only.
- An Open OnDemand login at that address (AccessID and password) and a grid account.
- A Claude Pro or Max subscription in the student's own name. Remote Control is available on Pro, Max,
  Team and Enterprise; API keys and `setup-token` credentials do not work.
- A browser the extension supports (Chrome or Edge 148 and later, Firefox; Safari only if that edition
  ships).

For the site profile (`framework/profiles/wayne.json`, `site: wayne`, so sessions are named
`wayne-<jobid>`): scheduler `slurm`, `submit_host: warrior`; `partition_cpu: secp` with `qos_cpu:
secondary` for interactive allocations, the probe and tests; `partition_cpu_batch: reqp` with
`qos_batch: requeue` for long workers; GPU partitions `gmsap` and `gvohp`; `shared_state_dir:
/rs/rs_grp_oschome/$USER/hpcworker` (the CephFS volume; the home is a Panasas soft quota that was 93
percent full, `home_filesystem: panfs`); `runtime: apptainer` with `runtime_module: apptainer/1.2.2`
(measured to build and exec unprivileged sandboxes on `asx1`); `node_tmp: /tmp/$USER/hpcworker_$SLURM_JOB_ID`
with `tmpdir_is_node_local: false`, because `$TMPDIR` on this grid points at CephFS; `ipc_dir:
/dev/shm`; the image is the existing shared sandbox `/rs/rs_grp_oschome/shared/ashley/containers/claude-node22`
with Node 22 and the pinned Claude Code (new images at this site should be SIF because the home is
Panasas); `claude_config_dir: $HOME/.ashley/claude`, the student's existing Claude Code login from
Ashley, which the framework only starts Claude Code in; `egress.class: direct` for the three named
hosts (measured, below); `ood_base_url: https://ondemand.grid.wayne.edu`; `ood_shell_host` not yet
known; `ood_rnode_enabled` not yet measured; `vpn_required: true`; `login_node_rules:
{max_processes: 20, poll_floor_seconds: 60}`; `xdg_runtime_fix: true` until question 5 says
otherwise. The template submits with `-D` because `#SBATCH --output` resolves against the submit
directory here, and chains with `afterany`, never `afterok`. Container temp and cache
(`APPTAINER_TMPDIR`, `APPTAINER_CACHEDIR`) sit on the compute node's local disk; no container command
runs on `warrior`.

## The student's seven steps

1. Install the extension from the store, read and accept the agreement, type
   `ondemand.grid.wayne.edu`, click *Connect this portal*, and allow that one site when the browser
   asks.
2. Connect the VPN and sign in to the portal in a tab. The extension runs its checks and one
   five-minute probe job on `secp`, and says in a sentence what works.
3. Once, in one sitting: sign in to Claude on a compute node. The extension shows one command to paste
   into the portal's shell, `hpcworker claude login`. It asks the scheduler for a short allocation on
   `secp` and, inside the worker image, runs `claude auth login` (paste-code flow); then, if Claude
   Code has not yet recorded the student's answer to *Enable Remote Control?*, it runs
   `claude remote-control` once in the worker's folder on CephFS, so the student answers *y* (and *y*
   again if Claude Code asks to trust the folder), sees the session appear, and presses Ctrl-C, all in
   the same sitting. Claude Code records the answer itself in its own settings; the framework reads
   only that record and never a credential. A student who already signed in through Ashley
   (`$HOME/.ashley/claude`) is told so and skips the sign-in half. `hpcworker claude consent` remains
   as a name that explains this; it is no longer a separate step.
4. Click *Start worker*. The disclosure about where files, output and the transcript go is shown and
   acknowledged; one job is submitted on `reqp` through the portal shell and the shell is closed. From
   here the worker is always on: before its wall time ends the job queues one successor
   (`sbatch --dependency=afterany:<its own id>` of the same job file, never more than one), and the
   successor reconnects the same session. *Stop* writes the stop file that ends the chain and cancels
   the job.
5. When the panel shows the session, click the green *Open in Claude* button, which opens the
   session's claude.ai link in a new tab (*Copy link* copies it), or open claude.ai/code or tap *Code*
   in the Claude app and pick the session by name.
6. Work from claude.ai or the phone. The panel shows job state from `status.json`, read no more than
   once a minute. A setting that is off by default, *start my worker when I open my portal*, runs the
   same start as the button whenever the portal tab is connected and the worker is not online, at the
   same once-a-minute floor; the setting's own text says exactly that.
7. Optional: *Connect Google Drive in claude.ai*. The checklist step opens
   `https://claude.ai/settings/connectors` in a new tab with one sentence saying what to do there; the
   student ticks *done* when finished, and the tick is kept only in the browser. The extension does
   nothing on that page.

## What C&IT must approve, and how the product is presented

Wayne State's generative-AI guideline says "All AI tools must first be approved by C&IT; third-party AI
bots are not approved for use at this time," and bars FERPA data, PII, PHI, financial and HR records
and "unsanitized research data" from AI tools. Until C&IT approves, Ashley Bridge is, on the face of
that guideline, a third-party AI bot. The request to C&IT presents it as what it is:

- The AI is the student's own Claude Code, under the student's own Anthropic subscription, running as an
  ordinary Slurm job in the student's own account. The vendor runs no model, sees no prompt and holds no
  credential.
- It is supervised by default: every command is approved by the student in the Remote Control
  interface. This is the mode Utah, NERSC and USC require of coding agents on their systems.
- Nothing container-related runs on `warrior`, and nothing of ours goes under its `/tmp`. That is
  C&IT's instruction of 2026-09-28, given after a container build left files under `/tmp` there, and
  the framework enforces it: container commands run only inside jobs, with temp and cache on the
  compute node's local disk.
- Nothing else runs on `warrior` beyond one `sbatch`, `squeue` or `scancel` per action. That follows
  the published grid policy (no more than 20 processes on Warrior; the login node is for job
  submission, status and transfers), not a new instruction.
- Scheduler-facing polling never faster than once a minute, and every job has a wall time. These two
  are the product's own etiquette, taken from the strictest published rules in the twelve-site sample
  (FASRC's once-a-minute rule, TACC's "every few minutes") and from Ashley's own licence terms; C&IT
  has not asked for them, and the framework keeps them anyway: the job writes `status.json` and
  clients read the file.
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

Also to put to C&IT, from the earlier Ashley reports: the ownership question for a tool built by a
university employee, and whether the portal's Shell app host and `rnode_uri` setting can be confirmed
rather than probed.

## The two written answers still needed

Both precede any paid key; neither blocks the free, approved-list pilot on the maintainer's own account.

1. **Wayne State C&IT:** written approval of Ashley Bridge as a supervised, user-run Claude Code inside
   a batch job, under the generative-AI guideline, with the data restrictions above. Ask also for the
   Shell app's target host and whether the reverse proxy admits compute nodes.
2. **Anthropic:** a written answer, through the route the Claude Code legal page names, on hosting the
   unmodified binary under each student's own subscription with Remote Control started from a Slurm
   job. The draft in Ashley's `docs/ANTHROPIC_REQUEST.md` covers the pattern; add Remote Control from an
   `sbatch` job explicitly to its third question before sending.

## Measurements to collect

Already measured:

- 2026-09-28, compute-node egress from `asx15`, direct: `api.anthropic.com` HTTP 404 (reachable),
  `platform.claude.com` 200, `claude.ai` 403 to curl, `statsig.anthropic.com` no DNS record. The
  feature-flag host is unnamed by Anthropic, so the last result settles nothing.
- 2026-09-28, paste-code `claude auth login` completed from a compute node inside the image, in
  `$HOME/.ashley/claude` (Ashley's `CLAUDE_CONFIG_DIR`, which the Wayne profile's `claude_config_dir`
  points at); `claude auth status` reported `loggedIn: true`, plan `max`. That login was lost when the
  folder was deleted at 22:34 local the same evening (`SECURITY.md`, incident record); the student
  signs in again with `hpcworker claude login`.
- 2026-09-29 (02:22 UTC), Remote Control from a batch job (Q1): Ashley's phone host, Slurm job 40496445 on
  `asx15`, `sbatch` with a pseudo-terminal from `script -qfc`, the student's Remote Control answer
  already on record, registered and served a session opened from the phone. Q1 is answered yes.

To collect, in this order (each maps to `OPEN_QUESTIONS.md`):

| Measurement | How | Records |
|---|---|---|
| Remote Control registers from `sbatch` under a pseudo-terminal and stays registered (Q1) | answered yes 2026-09-29 (02:22 UTC) with Ashley's phone host (job 40496445, `asx15`); repeat once with this framework's own template on `reqp` from the worker's CephFS workspace: watch `rc.log` and claude.ai/code; send a prompt from the phone; leave it an hour | the registration block (`Connected`, `Capacity`, the session name line, the `https://claude.ai/code?environment=...` URL), time to appear, whether a prompt round-trips, the `rc.log` tail when it exits |
| Feature-flag reachability (Q2, remainder) | the probe's dry run: grep `rc.log` for "Couldn't verify Remote Control eligibility" | present or absent |
| Trusted Devices enrolment from a node (Q3, remainder) | turn on *Require trusted devices* on the account, sign in on the node, check the session is steerable | works or the error text |
| Requeue and `--continue` (Q4) | let the always-on chain run past one wall time (the successor runs `--continue` when `connection.json` is younger than 4 h, else registers afresh in the same environment); separately, `scontrol requeue` a live session | whether the transcript continues; whether the environment URL stays the same; elapsed time |
| Bash tool `EACCES` and the `/dev/shm` XDG fix (Q5) | the probe's smoke test with and without the variable | pass/fail each way |
| `/rnode/` on or off (Q6) | signed in on the VPN: `GET /rnode/<compute node>/1/` | 404 or 503 |
| Shell host and admission (Q7) | check 5 against the live portal | the host, the prompt or the 3146 reason |
| Firefox cookie behaviour (Q8, Firefox half) | the same GET from content script and background under strict ETP | carried or not |
| Write endpoints and the csrf meta tag (Q9) | checks 6 to 8; view source of the dashboard | which routes exist; the OOD version string if visible |
| User namespaces and `srun --overlap` on nodes (Q10) | the probe job | pass/fail |
| Service-worker WebSocket lifetime (Q11) | an instrumented bootstrap held 90 s with pings only | which side closes, when |
| Login-node footprint | `ps -u $USER` on `warrior` during a full start; `find /tmp -user $USER` afterwards | process count peak (must stay far under 20); nothing under `/tmp` |
| Portal request rate | the extension's audit log over one hour of monitoring | requests per minute to the scheduler-facing routes (must be at most one) and to Files |
| Time to first prompt | from *Start worker* to a prompt answered on the phone | seconds, with the queue wait separated out |
| Usage-limit effect | the plan's usage indicator before and after a one-hour supervised session | what a student should expect to spend |

Each result goes into the results column of `OPEN_QUESTIONS.md` with date, node and the raw line, and
the log under `docs/measurements/`.
