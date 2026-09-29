# Diagnostics

Every assumption Ashley Bridge makes, from the licence key to the pseudo-terminal on the compute node,
is a check with a plain-words message for the student, a technical test for the engineer and a fix
hint. The model is Ashley's (`extension/src/core/diagnostics.ts`): each check is a node with an `id`, a
`title`, `dependsOn`, a one-sentence `assumption`, a `check`, a `manualFix`, a `futureRisk` and,
where safe to run unattended, a `repair`. A run goes in dependency order; a node whose dependency
failed is reported blocked with the root cause, so one broken piece reads as one problem, not a
cascade. Ashley's rule carries over: no feature integrates until its pieces are nodes here.

The seventeen checks below are the report's ("Diagnostics the extension runs, in order"), in that
order. Student-facing wording is what the panel shows; it names no internals. Statuses: pass, warn,
fail, repaired, blocked, skipped.

## The 17 checks the extension runs

| # | id | What the student reads when it fails | Technical check | Pass | Fix hint (student) / note (engineer) |
|---|---|---|---|---|---|
| 1 | `licence` | "Your trial has ended" or "This version has been withdrawn: update to continue" | Offline key verification against the bundled public keys (`ASHLEY1.` format); acceptance record present for the current agreement version; kill-list signature valid; this version not revoked | all true | Trial or renewal prompt from the onboarding page. Engineer: the kill-list is fail-safe; refuse only on a verified revocation, never on a fetch failure |
| 2 | `portal-origin` | "Connect your portal" | `permissions.contains({origins: ["https://<host>/*"]})` | true | The *Connect this portal* button; re-check at every startup, because Firefox and Safari users can revoke per site |
| 3 | `cookie-posture` | "Your browser is blocking the portal's sign-in for the extension; using the slower path" (Chrome and Edge only) | A test GET from the service worker compared with the same GET from the content script | cookie carried by both | Fall back to content-script-only mode; warn if third-party cookies are blocked or the window is Incognito. Skipped on Firefox and Safari, which always use the content script |
| 4 | `portal-signed-in` | "Connect the VPN and sign in to `<hostname>` in a tab" | `GET /pun/sys/dashboard/` following redirects | 200 HTML | A 302 to the identity provider, a captive page or a connection error all give this message; never automate the login. Note the time of this check for check 17 |
| 5 | `shell-admitted` | "The portal's shell is not available to you; ask your computing centre" (with the specific reason) | `GET /pun/sys/shell/ssh/<host>` shows `csrf=`; a probe WebSocket opens and a prompt arrives | open, prompt received | Map close code 3146: "No clusters defined." (administrator never configured a cluster), `Host ... not specified` (wrong host: try the profile's `ood_shell_host`), "Invalid Origin." (site behind an extra proxy; administrator sets `OOD_SHELL_ORIGIN_CHECK`), "Bad CSRF Token." (retry with a fresh scrape) |
| 6 | `files-json` | "The portal's Files app is switched off at your site" or "Uploads are switched off" | `GET files/fs/<home>` with `Accept: application/json` | 200 with `files[]`; `files_upload_path` present | No Files app means no mailbox and no status reading: stop here and say so. No uploads means the request files must be written through the shell instead |
| 7 | `active-jobs` | "The portal cannot list your jobs" | `GET activejobs.json?jobcluster=all&jobfilter=user` | cluster ids present | Show the `errors` array; it names unconfigured clusters |
| 8 | `submit-routes` | (informational; nothing shown unless asked) | `GET /pun/sys/myjobs/workflows.json`; `GET /pun/sys/dashboard/projects` | 200 or 404 recorded | Records whether a shell-free submission route exists; Job Composer is deprecated in 4.1 and gone in 5.0, so nothing depends on it |
| 9 | `reverse-proxy` | (informational: "Live view available" or "Using the file mailbox") | `GET /rnode/<shell host>/1/` | 503 "Failed to connect" | 404 means the proxy is off or `host_regex` does not match: mailbox mode. Never treat the proxy as authenticating the worker |
| 10 | `login-node-discovery` | "This cluster's scheduler is not supported yet" or "No container runtime was found" (with the module list) | Through the bootstrap shell, one command batch under 1 s of CPU, then close: scheduler CLIs, `module -t avail`, Pyxis flag, `user.max_user_namespaces`, proxy and temp variables, `sinfo`, OS release, glibc | scheduler, runtime, partitions, sysctl and environment captured | Engineer: this is the only login-node work besides `sbatch`; it must stay under a second and never run a container |
| 11 | `probe-job` | "Your cluster's compute nodes cannot reach Anthropic; ask your centre for an HTTP proxy" or the egress class found | Submit the five-minute probe once; read `probe.json` from the state directory | node-local temp and `/dev/shm` sizes; user namespaces on the node; `apptainer exec docker://alpine true`; HTTP codes for the three Anthropic hosts with and without proxy | The probe is not optional (TACC hides the runtime module on login nodes). Read the result through Files, never by polling the scheduler |
| 12 | `worker-binary` | "Claude Code does not run on this cluster's nodes" | Probe job runs `claude --version` inside the image | version string | glibc or musl mismatch guidance from Claude Code's install troubleshooting; the image, not the host, decides this |
| 13 | `claude-login` | "Sign in to Claude on a compute node first" (with the command shown) | Probe job runs `claude auth status` (a non-model command) and confirms `CLAUDE_CODE_OAUTH_TOKEN` is unset in the worker environment | full-scope login reported | "Run `hpcworker claude login` from the portal's Shell tab" (one sitting: Claude Code's paste-code sign-in, then its one-time Remote Control question); never `setup-token`. The framework never reads the credential file, only the status answer |
| 14 | `remote-control-ready` | "Answer Claude Code's one-time question once, on a compute node" (the same `hpcworker claude login` sitting) or "Your cluster cannot reach Anthropic's feature-flag service" | Claude Code's own record first: `remoteDialogSeen: true` in `<claude_config_dir>/.claude.json` and `hasTrustDialogAccepted: true` for the workspace (the only two keys read from that file; the profile's marker file is the fallback); then the probe's short `claude remote-control` dry run, grepping for `Workspace not trusted`, the consent prompt, or `Couldn't verify Remote Control eligibility` | record present; the registration block | The extension never types the answers; the framework reads Claude Code's record of them and the probe checks afterwards |
| 15 | `xdg-runtime` | "A known Claude Code problem on this cluster's nodes; a workaround is applied" | Probe job checks `/dev/shm/$USER/xdg` is writable and runs a bash-tool smoke test | writable, smoke test passes | Repair: set `XDG_RUNTIME_DIR=/dev/shm/$USER/xdg` in the template. If `EACCES` persists, record it as the known upstream defect (closed "not planned") and say so |
| 16 | `data-acknowledged` | "Read where your files and transcript go, and confirm" | Working directory not marked restricted; the plan-class disclosure shown and acknowledged this session | acknowledged | Refuse to start otherwise. Also refuse when the CLI reports Remote Control unavailable under Zero Data Retention |
| 17 | `session-age` | "Sign in to your portal again in a tab" | Time since check 4; any 302 or 401 on a later request | under about 8 hours and no redirect | Never cache anything across the re-login; re-run from check 4 |

Dependencies, for the graph: 2 depends on 1; 3 and 4 on 2; 5, 6, 7, 8, 9 on 4; 10 on 5; 11 on 6 and 10;
12, 13, 14, 15 on 11; 16 on 13 and 14; 17 on 4. Checks 8 and 9 are informational and never block.

## What the student sees

One list, plain words, the lowest failing check first, each with a button where a person must act
("Connect this portal", "Open the portal", "Show me the sign-in commands") and nothing where the fix
ran by itself. A student never sees close codes, endpoint paths, environment variable names or module
lists; those go to the log the student can open and export.

Three things in the same list are not checks. The green *Open in Claude* button appears when
`connection.json` carries the session's claude.ai link and opens it in a new tab (with *Copy link*
beside it). The setting *start my worker when I open my portal*, off by default, is explained in its
own sentence where it is switched on. The optional step *Connect Google Drive in claude.ai* opens
`https://claude.ai/settings/connectors` in a new tab with one sentence of instruction and a *done*
tick that is kept only in the browser; the extension has no presence on that page.

## The framework's cluster-side checks

These run inside jobs the student owns and write their answers to files the extension reads through
the Files channel. Nothing here is run by the extension directly.

### Phase 1: login node, through the bootstrap shell (one batch, under 1 s, no network)

| id | Assumption | Check | On failure |
|---|---|---|---|
| `scheduler-cli` | A supported scheduler's client is on `PATH` or in `bin_dir` | `command -v sbatch`, `qsub`, `bsub`, `condor_submit` | "Unsupported scheduler"; record what was found |
| `runtime-hint` | A container runtime is visible, or is expected only on compute nodes | `command -v apptainer singularity podman enroot`; `module -t avail`; `srun --help \| grep -c container-image` | Informational; the probe job decides |
| `userns-login` | User namespaces are enabled | `sysctl -n user.max_user_namespaces` | Predict the fakeroot rung; confirm on the node |
| `partitions` | The profile's partitions exist and are up | `sinfo -h -o '%P\|%l\|%a'` | Name the missing partition |
| `env-proxy-tmp` | Proxy and temp variables are known | `env` filtered for `*_proxy`, `TMPDIR`, `SLURM_TMPDIR`, `L_SCRATCH` | Seed the profile; the probe overwrites |
| `os-glibc` | The host OS and glibc are recorded | `/etc/os-release`; `ldd --version` | Informational (the container absorbs an old glibc) |
| `login-tmp-clean` | Nothing of ours is under the login node's `/tmp` | `find /tmp -maxdepth 1 -user "$USER" \( -name 'rootfs-*' -o -name 'build-temp-*' -o -name 'apptainer*' -o -name 'singularity*' -o -name 'sbuild-*' -o -size +50M \)`, the grouping as in Ashley's `grid/ashley`: `-user` first, then the name alternatives in one parenthesised group, so the check and its repair never match another user's entries | Repair: remove recognisable leftovers (Ashley's `grid.login-tmp`) |

### Phase 2: the probe job (five minutes, default partition)

| id | Assumption | Check | On failure |
|---|---|---|---|
| `node-tmp` | Node-local temp resolves and is writable and large enough | `node_tmp()` order; `df`; write test. On Wayne State `$TMPDIR` is CephFS, so a local-disk test is required, not an environment read | Fall to the next candidate; record size |
| `dev-shm` | `/dev/shm` is writable with room for IPC and the XDG directory | `df /dev/shm`; write test | "No shared-memory scratch"; refuse to start the worker |
| `userns-node` | User namespaces work on the compute node | `unshare -Ur true` or the runtime's own check | Adjust the fakeroot rung |
| `runtime-exec` | The runtime can pull and run a container from the node | `apptainer exec docker://alpine true` with temp and cache on node-local disk | Distinguishes registry egress from namespace failure by the error text |
| `egress-matrix` | Compute nodes reach Anthropic's hosts directly or through an HTTP proxy | `curl -m 10 -o /dev/null -w '%{http_code}'` against `api.anthropic.com`, `platform.claude.com`, `claude.ai`, with and without inherited proxy variables | Egress class `none`: "ask your centre for an HTTP proxy". Measured on Wayne State 2026-09-28 from `asx15`: `api.anthropic.com` 404 (reachable), `platform.claude.com` 200, `claude.ai` 403 to curl |
| `flag-host` | Claude Code can reach its feature-flag service | Only observable through check 14's dry run; the hostname is not named by Anthropic | "Couldn't verify Remote Control eligibility" is the signature. On 2026-09-28 `statsig.anthropic.com` had no DNS record from the node; this does not settle the question |
| `claude-version` | The pinned Claude Code runs inside the image | `claude --version` | glibc or musl mismatch |
| `claude-auth` | A full-scope login exists and no token variable overrides it | `claude auth status` with `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL` and the file-descriptor variants removed from the environment | "Run `claude auth login` on a compute node" |
| `rc-dry-run` | Consent and directory trust are pre-accepted; eligibility verifiable | `claude remote-control` under `script -qfc` for a few seconds in the project directory; grep for the registration line, `Workspace not trusted`, the consent prompt, `Couldn't verify Remote Control eligibility`, the full-scope-token error | Map each to the student message in check 14 |
| `xdg-fix` | The bash tool works with `XDG_RUNTIME_DIR` under `/dev/shm` | Create `/dev/shm/$USER/xdg`; run a bash-tool smoke test | Record the known upstream defect |
| `attach-allowed` | `srun --overlap` attach is permitted (diagnostic only) | `srun --jobid=$SLURM_JOB_ID --overlap true` | Informational; attach disabled for this site |

### At every worker start (the job template itself)

| id | Assumption | Check | On failure |
|---|---|---|---|
| `state-dir` | The run's state directory on shared storage is writable | `mkdir -p`; write `status.json` (`state: starting`) | Exit with a reason in the job log |
| `job-token` | A per-job token exists, mode 0600, never in the environment or argv | `stat -c %a` on the token file | Regenerate; refuse if the mode cannot be set |
| `manifest` | The working directory is inside the task manifest and not marked restricted; partitions and egress hosts match | Compare against the manifest file the extension wrote | Refuse to start; `status.json` says why in plain words |
| `credential-env-clean` | No credential variable reaches Claude Code | Assert the variables listed under `claude-auth` are unset before `tmux` starts | Refuse to start |
| `registration` | Remote Control registered | The registration line appears in `rc.log` within the timeout | `status.json` `state: error` with the last cleaned line of `rc.log`; the extension maps the full-scope-token error to "sign in again on a node" |
| `heartbeat` | The worker is alive and the login still valid | `status.json` rewritten every 30 s (`HEARTBEAT_S`, the template default in `lib/profile.py`; the loop wakes every 5 s), `.part` then rename; `claude auth status` at start and then every 300 s (`AUTH_EVERY_S`), also while the job waits in `need_login`; the answer recorded as `loggedIn`, `email` and `subscriptionType` only, never the credential; the only thing read from the login directory is Claude Code's own `remoteDialogSeen` key (and the workspace's `hasTrustDialogAccepted`), never the credentials file | `state: need_login` |
| `consent-on-record` | The student answered Claude Code's Remote Control question themselves | `remoteDialogSeen` is `true` in `<claude_config_dir>/.claude.json`, Claude Code's own record of the answer (the profile's `consent_markers` are the fallback); nothing else is read from that file | `state: need_consent`; the job waits; `hpcworker claude login` answers it in one sitting |
| `successor` | Exactly one successor is queued before the wall time ends, so the worker is always on | `sbatch --dependency=afterany:$SLURM_JOB_ID` of the same rendered script, once, its id recorded in the run directory; no submission when the stop file exists or a successor id is already recorded | The chain ends; `status.json` says the worker will not come back by itself and *Start* is needed |
| `cleanup-scope` | The job removes only its own node-local temp and its `/dev/shm` directory | The cleanup trap's paths are checked to lie under `node_tmp` and `ipc_dir/$USER` before `rm -rf`; nothing under the login directory, the workspace or another run is ever removed | Refuse to start rather than clean up outside those paths |
| `sigterm-flush` | Preemption and the wall time are recorded | The `SIGTERM` trap (`--signal=B:TERM@120`) writes `state: preempted` and a `resume_hint`; after a stop request it writes `state: stopped` instead | The successor already queued with `afterany` reconnects: `--continue` while `connection.json` is younger than 4 h, else a fresh registration in the same environment |

## Adding a check

1. Give it an id, a title, its dependencies, a one-sentence assumption, a check, a manual fix in plain
   words, the future risk it guards against (how a university or vendor update could break it), and a
   repair only when the repair is safe to run unattended.
2. Cluster-side checks emit one line per node in the same shape (`id`, verdict, detail) into the file
   the extension reads; the extension carries a mirror node with the same id.
3. Add the ids to the feature's required list so the test fails when they go missing.
4. Wording for students is reviewed against the rule in `CLAUDE.md`: one path, no internals.
