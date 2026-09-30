# Beethoven: architecture

Public name Beethoven since 7.0.0; the repository is `OpenSpineConsortium/beethoven` since 2026-09-30 (`CLAUDE.md`).

Distilled from the research report's "Build specification for the week of 28 September 2026"
(`RESEARCH_REPORT.md`). Where this document and the report differ, the report governs; where the
report is silent, the fact is marked not yet measured. Written for the engineers building the two
streams and for a research-computing or security office reading what the pieces do.

The one-sentence design: the student's own Claude Code runs as a batch job on the cluster and
registers itself with Anthropic through Claude Code Remote Control; the browser extension only starts,
watches and stops that job through the student's existing Open OnDemand session, on one origin.

What the student does is three things: open the portal tab, click the extension's icon, and, once,
sign in to Claude when the panel asks by pasting Anthropic's code into one box. Everything else in
this document is what happens behind those three.

**Status of this design, 2026-09-29.** The flow was decided on the morning of 2026-09-29 from the
maintainer's run against the live portal (`OPEN_QUESTIONS.md`, "Live-portal findings") and is being
built this week; the code is the arbiter, so check `extension/src/` and `framework/` before claiming
an item is there. In the tree at the time of writing: the connect sequence that injects the page
script into the open tab and pings it (`core/connect.ts`), the PUN warm-up with backoff and the
listing-based existence check (`core/portal.ts`), the login terminal (`core/shell.ts` `openShell`,
`core/login.ts`, the port in `entrypoints/portal.content.ts`) and the framework's plain sign-in
sitting (`framework/lib/login_plain.sh`, `hpcworker claude login --plain`), the step machine's
decision function and its facts (`core/steps.ts`, `core/facts.ts`), the per-workspace statement and
the consent marker (`core/disclosure.ts`, `core/worker.ts`), the click handler and the one start path
(`entrypoints/background.ts`: `onActionClicked`, `startNow`), the strip and its terminal
(`ui/strip.ts`, `ui/terminal.ts`, `ui/details.ts`), the options page (`entrypoints/options`,
`ui/options.ts`; the old onboarding tab and popup are gone), the mock portal's stand-ins for the cold
PUN, the 200-HTML missing download and the plain sitting, the always-on chain and the green *Open in
Claude* button. Not yet done: a run of all of it against the live portal (`OPEN_QUESTIONS.md`, "Not
yet measured under the new flow"). Decided on the evening of 2026-09-29 and built as framework 5 and
extension 5.0.0: the lab's shared copy of the framework (2.1).

## 1. Components and what each reuses

| Component | What it is | Reused from the VS Code edition (Ashley for VS Code 2.0.0, now Beethoven for VS Code) | New here |
|---|---|---|---|
| Framework (`framework/`, `hpcworker`) | Shell plus Python kept once per site in the lab's shared directory, or copied into the student's home where there is none (2.1): site profile, scheduler/runtime/egress adapters, job template, worker entrypoint, probe job, the sign-in sitting | `grid/worker.sbatch.tpl` and `grid/bootstrap.sbatch` (the sbatch wrapper, the Apptainer sandbox recipe on a Node 22 base, node-local temp and cache with a cleanup trap, `/dev/shm` IPC, the Slurm executable wrappers inside the container, `.part`-then-rename file writes) | Site profile schema; adapter modules (Slurm first, PBS Pro and LSF next); egress probe; Remote Control launcher in `tmux`; per-job token; `status.json` and `connection.json` writers; the `XDG_RUNTIME_DIR` fix; the plain sign-in sitting and its line contract (4.1) |
| Worker image | A SIF built once from a Debian 12 or Ubuntu 22.04 base with the native installer pinned to a version; `DISABLE_AUTOUPDATER=1`; Claude Code's config directory (the profile's `claude_config_dir`; `~/.claude` by default, `$HOME/.beethoven/claude` on Wayne State, `$HOME/.ashley/claude` until 2026-09-30 and a link to it since) bind-mounted from persistent storage, never baked in | The sandbox recipe | SIF form for parallel-filesystem sites; `--fakeroot` rung detection |
| Extension (`extension/`, `ood-worker`) | WXT plus TypeScript, `browser.*` with Promises, `minimum_chrome_version` 148; one codebase for Chrome, Edge, Firefox and Safari | The Ed25519 token verifier (`grid/license.js` `open()`, `ASHLEYREV1` tokens and, from 8.0.0, `BEETHOVENREV1` ones, public keys `k1` and `trial`), used for the signed kill-list only since 4.0.0 (Bridge has no licence keys); the clickwrap text and acceptance record (`core/terms.ts`, `vscode/termsPanel.ts`); the diagnostics node model (`core/diagnostics.ts`: `id`, `title`, `dependsOn`, `assumption`, `check`, `repair`, `manualFix`, `futureRisk`) | Portal-origin content script; Shell WebSocket driver (one line, and the held-open sitting); Files and Active Jobs clients; the strip, the step machine behind the icon (6.1); side panel (Chrome/Edge), `sidebar_action` (Firefox), a panel tab (Safari); the options page; on-device audit log; kill-list verifier |
| Access service | The vendor's access service (the Cloudflare Worker behind the request page, deployed from the sibling repository of Beethoven for VS Code (`OpenSpineConsortium/beethoven-vscode`, Desktop folder `ashley`) under two names with the same code, stores and secrets: `beethoven-access.openspineconsortium.workers.dev`, which 7.0.0 uses, and the old `ashley-service.openspineconsortium.workers.dev` for Ashley for VS Code 3.0.0 and builds 4.0.0 to 6.0.0) answers yes or no for one account name (`POST` to the `access_check` address named in `https://openspineconsortium.com/beethoven/services.json`, body `{v, access_id, portal, product, version, install_id}`, where `product` stays `bridge` and, from 8.0.0, an approved account is bound to the first `install_id` that asks), from the same approved list the admin console manages for Beethoven for VS Code; plus a signed JSON kill-list of withdrawn versions on the website, served over HTTPS | The approved list, the admin console and the request page, merchant of record | The `access_check` route and its records; the extension's cached answer (24 h for yes, 7 days when unreachable, 10 min for no); kill-list signing key under hardware-key custody; daily fetch |
| Partner-site package (optional) | An Open OnDemand Interactive App (`form.yml`, `submit.yml.erb`, `template/script.sh.erb`) that launches the same job template, for campuses that will install it | The job template | The `form.yml` and `view.html.erb` |

Two things are deliberately absent (report, "Components and what each reuses"): any code on
claude.ai or any Anthropic page (no content script, no host permission, no fetch patch), and any
handling of a Claude credential (no `setup-token`, no `CLAUDE_CODE_OAUTH_TOKEN`, no read of
`~/.claude/.credentials.json`, no multi-account rotation). The one-time code the student pastes into
the panel during the sign-in sitting is not a credential the extension holds: it is typed once into
the student's own terminal on the cluster and forgotten (4.1, 7). What is carried over from the VS
Code edition's `grid/phone.js` is the behaviour, not the code: run `claude remote-control` in a
pseudo-terminal, strip every credential variable and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` from
its environment, take the one-time consent only from the student's own recorded answer (4.4),
restart with backoff, parse the session name and link, and never run `claude auth logout` (it would
revoke the login).

## 2. The site profile

One static JSON file per university, generated by two-phase discovery (section 8) and editable by
hand. Keys, from the report's "Cluster-side framework":

| Key | Values | Note |
|---|---|---|
| `scheduler` | `slurm`, `pbs`, `lsf`, `sge`, `htcondor` | Slurm covers every sampled US campus cluster but one LSF site |
| `submit_host` | hostname | the host the portal shell lands on, typically a login node |
| `bin_dir` | path | scheduler binaries, when not on `PATH` |
| `partition_cpu`, `partition_gpu` | names | |
| `qos_requeue` | name or empty | |
| `account` | name or empty | |
| `max_walltime` | `HH:MM:SS` | |
| `node_tmp_var` | `TMPDIR`, `L_SCRATCH`, `SLURM_TMPDIR`, or a literal path pattern | resolved inside the job; on Wayne State `$TMPDIR` points at CephFS, so it is not trusted blindly |
| `ipc_dir` | `/dev/shm` | also where the sign-in sitting keeps its transcript, mode 0600, removed with the sitting |
| `shared_state_dir` | path on shared storage | where `<run>/status.json` lives |
| `runtime` | `apptainer`, `singularity`, `podman`, `pyxis` | |
| `runtime_module` | module name or empty | |
| `image_store` | path | SIF on shared storage; a sandbox only where the shared filesystem is not Lustre, GPFS or PanFS |
| `cache_dir` | path | node-local |
| `fakeroot_rung` | 1 to 4, or `none` | Apptainer's documented ladder |
| `egress` | `direct`, `http-proxy-auto`, `http-proxy-module`, `none` | probed, never assumed |
| `proxy_env` or `proxy_module` | variables or module name | |
| `ca_bundle` | path or empty | for `NODE_EXTRA_CA_CERTS` |
| `ood_base_url` | URL | |
| `ood_shell_host` | the `<host>` in `/pun/sys/shell/ssh/<host>` | `default` until probed; on Wayne State `default` reaches `warrior` (measured 2026-09-29) |
| `ood_rnode_enabled` | boolean | probed (section 5, check 9) |
| `vpn_required` | boolean | |
| `login_node_rules` | `max_processes`, `poll_floor_seconds` | |
| `xdg_runtime_fix` | boolean | |

Wayne State's profile carries `reqp` with `--qos=requeue`, `gmsap` and `gvohp` for GPU work, the
CephFS path `/rs/rs_grp_oschome/<user>/`, the rule that `#SBATCH --output` resolves against the submit
directory (so the template submits with `-D`), `afterany` over `afterok`, `vpn_required: true`, a
20-process login-node cap and a 60-second poll floor. None of these is exotic.

The implemented schema (`framework/lib/profile.py schema`, schema version 1, validated and rendered
by a Python 3.6 standard-library script because the Wayne State login node is CentOS 7) extends the
report's list. Additions: `site` and `display_name`; `qos_cpu` and a separate `partition_cpu_batch`
with `qos_batch`, because on Wayne State short allocations (the sign-in sitting, the probe) go to
`secp`/`secondary` and long workers to `reqp`/`requeue`; `node_tmp` as a literal pattern with
`tmpdir_is_node_local` alongside `node_tmp_var`; `runtime_bin`; `image_store` as
`{type: sandbox|sif, path}`; `claude_bin` as seen inside the container; `binds`; `claude_config_dir`
(the student's own Claude Code login directory, whose credential the framework never reads) and
`consent_markers` (marker files whose presence records the student's Remote Control answer; the
extension writes the framework's own one, `~/.hpcworker/consent`, on the student's acknowledgement,
4.4, and Claude Code's own `remoteDialogSeen` key takes over after the first session);
`home_filesystem`; `worker_defaults`; `shared_install` (the lab's shared copy of the framework,
2.1; absolute, optional); and the measured egress result kept under `egress.measured` with
its date and node. The profile is the one place a site's facts live; the probe job corrects it and the
templates render from it.

### 2.1 Where the framework lives: the lab's shared copy, or the student's own

Decided on the evening of 2026-09-29, in the maintainer's words: "Claude Code is like gas, the
Ashley code base is the car." The container image with Claude Code in it rarely changes; the framework
(the adapters and protocols, the job templates, the site profiles, the sign-in sitting, the
`hpcworker` commands) changes with every framework version. Both are the lab's, kept once per site on
shared storage and maintained in one place. The extension is the student's thin client: it makes the
student's account see them, then starts, watches and stops the worker.

| Piece | Changes | Kept by, and where (Wayne State) | Updated by |
|---|---|---|---|
| The worker image, with Claude Code pinned inside | rarely | the lab, once: `image_store` `/rs/rs_grp_oschome/shared/beethoven/containers/claude-node22`, `claude_bin` beside it | the maintainer, rebuilt inside a Slurm job (`jobs/build_image.sbatch`), never on the login node |
| The framework (`hpcworker`) | with each framework version | the lab, once: `shared_install` `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`; an account set up by an extension build before 8.0.0 may still have its own copy in `~/.hpcworker` | the maintainer, with `tools/deploy_shared.sh`; since 8.0.0 the extension carries no copy of the framework and updates none |
| The extension | with each extension version | the student's browser | its private Chrome Web Store listing (nothing to build) |
| The student's state: the profile, the consent marker, the log, the run directories, Claude Code's sign-in | as the student works | the student's account (`~/.hpcworker`, `shared_state_dir`, `claude_config_dir`) | nobody else; no install in either mode replaces it |

Fetching the framework from the private GitHub repository is not possible for a student (there is no
token to give them) and is not designed.

**The shared copy.** A site profile may name `shared_install`, an absolute directory holding a
framework checkout (`bin/`, `lib/`, `jobs/`, `profiles/`, `VERSION`, `README.md`). At Wayne State it
is `/rs/rs_grp_oschome/shared/beethoven/hpcworker/current`, a symbolic link to a versioned directory
`v<N>/` beside it (the lab folder was `shared/ashley` until 2026-09-30; that name is a link to
`shared/beethoven`, and Beethoven 4.0.0 to 7.0.0 still reach the copy through it). `hpcworker
install --shared DIR` (DIR defaults to the profile's `shared_install`) sets up the student's home
without copying code:

- `~/.hpcworker/bin/hpcworker`, a launcher of a few lines that runs `DIR/bin/hpcworker` with the
  same arguments. It is a regular file, never a symbolic link, so neither a write through the Files
  app nor a later install in the student's account can reach through it into the lab's copy;
- `~/.hpcworker/shared`, the marker: one line naming DIR;
- `~/.hpcworker/profile.json`, copied from `DIR/profiles/<site>.json`, and kept when it is already
  there;
- `~/.hpcworker/log/`, and the managed PATH block in `~/.bashrc`.

While the marker exists, the script takes its code (`bin/`, `lib/`, `jobs/`, `profiles/`) from DIR
and keeps the profile, the consent marker and the log in `~/.hpcworker`, and the run directories
under `shared_state_dir` as before. `hpcworker version` prints DIR's `VERSION` and says "shared copy
at DIR". `hpcworker install` from a home that already has the marker refreshes the launcher, the
marker, the PATH block and the profile only. A DIR this account cannot use is refused with exit 3
and one sentence, "the shared copy at DIR cannot be used from this account: <why>. Nothing was
changed.": not an absolute path, not a directory this account can open (it does not exist, or the
account is not in the group that may read it), no whole number in `VERSION`, one of `bin/hpcworker`,
`lib/profile.py`, `lib/adapters/common.sh` or `jobs/worker.sbatch.tpl` missing, or a folder inside
`~/.hpcworker` itself. The launcher exits 3 the same way when the shared copy cannot be read.

`install --shared` over an existing per-user copy converts it: the old `bin/hpcworker`, `lib/`,
`jobs/`, `profiles/`, `VERSION` and `README.md` are moved into `~/.hpcworker/replaced/<date-time>/`,
never deleted, and the profile, the consent marker and the state stay where they are. It refuses,
with nothing changed, while a run may still read code from the home (a queued successor, a
heartbeat under three minutes old, a job submitted that has not reported yet, a probe under way;
files only, no scheduler call), because a running job reads `lib/` again on every call into the
container; the sentence asks the student to stop the worker first. The way back is
`hpcworker install --own`, which copies the code into the home and moves the marker aside the same
way. A full copy of the command in `~/.hpcworker/bin/` (an upload from an extension build before
8.0.0, or `install --own`) wins over a marker left behind.

**Publishing a version** (the maintainer, after the framework tests pass): `bash tools/deploy_shared.sh`
from the laptop (options `--site`, `--host`, `--root`, `--group`, `--dry-run`, `--replace`; `--here`
runs it from a checkout on the cluster). It checks that `framework/VERSION` matches the `VERSION=` line
of `bin/hpcworker`, that every file has LF line endings and that the shell files pass `bash -n`; packs
exactly the files it lists (`bin/`, `lib/`, `jobs/`, `profiles/`, `VERSION`, `README.md`; no tests)
with a SHA-256 manifest; and runs its own publishing part over ssh on the login node, which is file
work only (tar, chmod, setfacl, one link): no scheduler call, no container, nothing under `/tmp`. The
files are unpacked into a staging directory beside the versions, checked against the manifest and
renamed to `v<N>/`, with group read and traverse, no group write, nothing for others and read-only for
the owner too, and the ACL's group, mask and default entries set to match (Wayne State's volume
carries a group-writable default ACL). `current` is switched in one rename (`ln -s` to a new name,
then `mv -T`; coreutils 8.22's `ln -sfn` removes the old link first, leaving a moment with none). A
version already published with the same files is not unpacked again; when only its `README.md`
differs, that file is updated in place (no job reads it); one published with different code is
refused unless `--replace`, which moves the old directory aside as `v<N>.replaced-<time>` (the
script's own advice is to publish changed files as the next integer version). It appends a line
to `deploy.log` beside the versions, prints what changed against the previous `current`, the tree, the
link and the ACLs, and runs `hpcworker version` through `current`.

**A running worker and a new version.** A rendered job names the numbered directory it started from,
not `current`: the command follows the `current` link one level and no further, so
`/rs/rs_grp_oschome` stays spelled as it is and the volume's physical path never reaches a job file or
a message. A publish therefore never changes the code under a running worker, and an always-on chain,
which re-submits the same rendered job, keeps its version until the student stops the worker and
starts it again; the next start renders the job from `current`. That is why the script never removes a
version directory: an old one is removed by hand, and only when no student's worker can still name it
(nothing checks that yet). `--replace` is the exception: a worker started on `v<N>` reads the replaced
files from its next call into the container on.

**The student's own copy** (framework 4 and earlier, and extension builds before 8.0.0 at a site
with no shared directory or as their fallback): those builds uploaded the framework they carried into
`~/.hpcworker` through the Files app and ran `bash ~/.hpcworker/bin/hpcworker install --profile
<site>`. Since 8.0.0 the extension carries no framework code (the package holds the site profiles
only, as data, without their free-text `notes`; `scripts/sync-profiles.mjs`, checked by
`test/hygiene.test.ts` against the built package) and never uploads it: an account that still has its
own copy keeps running it, the framework handles it as before, and *Details* names it with its
version. `hpcworker install --own`, typed by hand, remains the framework's way to an own copy; an
install of an own copy moves a shared copy's marker aside.

**What the extension does** (`core/install.ts`, `core/facts.ts`, `core/steps.ts`; the `install` step
of 6.1). It learns whether a site has a shared copy from the site profile it carries
(`public/profiles/<site>.json`, copied from `framework/profiles/` at build time without its `notes`;
the site name comes from the portal's hostname and can be changed under *Details*). When that profile
names `shared_install`, the install step types one line through the portal's shell,
`bash <dir>/bin/hpcworker install --shared <dir> --profile <site>` (each argument in single quotes;
`commands.installShared`), and uploads nothing. The folder is used only when it is a plain absolute
path (letters, digits and `. _ + -`, no `.` or `..` segment; `sharedRootOf` in `core/contract.ts`), so
nothing from a profile or a marker is ever quoted around. Whether the account can use the shared copy
is judged by that line, run by the same account on the same login node the jobs use, not by the Files
app: when bash cannot open the shared copy's `bin/hpcworker` (exit 126, no permission; 127, not
there) or the tool says it cannot use the folder, nothing is uploaded instead: the strip shows one
sentence, "Beethoven needs your lab's shared copy of the tool on the cluster, and your account cannot
use it yet: ask your lab lead (Details says why).", with a *Try again* button, and *Details* says why
in one line. The same sentence stands, with no line typed, where the site profile names no shared
folder or the build carries no profile for the site. Any other failure is reported and not worked
around. After the install the facts read the marker; when it names
a folder they read that folder's `VERSION` through the Files app in a guarded read of its own, so a
403 or 500 there (what a student outside the lab's group, or a Files app that does not serve the lab's
volume, would get) does not make the portal look asleep. The extension compares no version: the
lab's copy is the one that counts, and *Details* says "the lab's
shared copy, version N" (or "your own copy, version N"); since 7.0.0 the panel's own sentences and the
check results name neither the shared copy's cluster path nor the tool's command name. Three places
still show them, as records: the output boxes (the tool's output as it prints it), the terminal of the
sign-in sitting, and the audit log's endpoints (at Wayne State every look at the cluster lists the
Files read of the shared copy's `VERSION` with its full path; run F in `extension/store-assets/e2e/`). A student's own copy is left running; at a site that has a shared
copy, *Set up the cluster again* under *Details* moves it there, and when the tool refuses because a
worker still runs from the own copy, the step asks the student to stop the worker first. Everything after the install (the probe, the sign-in sitting, the
statement, start, stop, status) calls `~/.hpcworker/bin/hpcworker` as before and does not know which
copy answers.

**Who can read the shared copy.** At Wayne State the lab's volume root `/rs/rs_grp_oschome` is mode
2770 for group `oschome` with `other::---`, so an account outside the group cannot traverse it at
all; on 2026-09-29 the group had two members (`OPEN_QUESTIONS.md`, "The lab's shared copy of the
framework"). That held before the shared copy existed, since the image, `claude_bin` and every
student's `shared_state_dir` sit under the same root: every student must be in `oschome` before
their first run, in either mode, and a per-user copy (the fallback of extension builds before 8.0.0)
does not help a student outside the group there. The published tree gives the group read and execute and no write, so a member can run the
lab's code and cannot change it; the directory above it, `shared/beethoven`, stays group-writable,
so a member could still rename `hpcworker/` itself (`OPEN_QUESTIONS.md`).

**Where workflow-engine templates would go.** Not built now. A site profile already holds what a
workflow engine's configuration for a cluster needs (partitions and QoS, account, runtime and image,
binds, node-local temp, egress), and `jobs/` holds the job templates rendered from it. Templates or
configurations for an engine such as Metaflow would sit beside them, in the same shared copy, and be
rendered from the same profile. Nothing passes a configuration to a workflow engine today.

## 3. The adapter interface

The report's headline calls it a six-call adapter; its specification table lists eight calls plus a
two-call egress adapter, and the table governs. Each call is a single command template plus an id or
status regex, delimited text first and JSON second, because status JSON is version-gated on every
scheduler (Slurm from 21.08, PBS Pro's `-F json`, LSF's `-json` only with `-o`).

| Call | Slurm | PBS Pro | LSF | Contract |
|---|---|---|---|---|
| `detect_scheduler()` | `command -v sbatch` | `qsub` present and `qstat -F json` succeeds | `bsub`, `bjobs` | family or `unknown`; under 1 s of login-node CPU |
| `detect_runtime()` | `command -v apptainer singularity podman enroot`; the module list from `$MODULEPATH` (`module -t avail` only with `--full`); `srun --help \| grep container-image`; `user.max_user_namespaces` | same | same | runtime, module, predicted fakeroot rung; never runs a container on the login node |
| `submit(script) → id` | `sbatch --parsable` (id before `;`) | `qsub` (bare id) | `bsub` ("Job <N> is submitted") | one call; 0.5 to 1 s between calls |
| `status(id) → {state, node}` | `squeue -h -j <id> -o '%T\|%N'`, then `sacct -P -j <id> --format=State,NodeList` | `qstat -f -F json <id>` (`-x` when finished) | `bjobs -noheader -o 'jobid stat exec_host'` | normalised to `PENDING`, `RUNNING`, `DONE`, `FAILED`, `UNKNOWN`; called only by the probe and the bootstrap, never in a loop |
| `cancel(id)` | `scancel` | `qdel` | `bkill` | idempotent |
| `attach(id)` | `srun --jobid=<id> --overlap --pty bash` | `ssh <node>` | `ssh <node>` | best-effort diagnostic; a site may forbid it |
| `node_tmp()` | `$SLURM_TMPDIR`, then `$TMPDIR`, then `/scratch/$USER/job_$SLURM_JOB_ID`, then `/tmp` | same | same | resolved inside the job; the profile's `node_tmp_var` overrides the order |
| `runtime_exec(image, cmd, binds, env)` | `apptainer exec --bind <shared_state_dir>,<ipc_dir>,<home>/.claude --env ...` | `podman run --rm -v ...` | `srun --container-image` | propagates `https_proxy`, `no_proxy`, `NODE_EXTRA_CA_CERTS` explicitly; sets `DISABLE_AUTOUPDATER=1`; never sets `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `DISABLE_GROWTHBOOK`, `ANTHROPIC_BASE_URL` or `CLAUDE_CODE_OAUTH_TOKEN` |

Two conveniences sit beside the eight calls and matter here: `adapter_interactive` (a short allocation
with a terminal: `srun --pty` on the CPU partition, 2 GB; the panel's `--plain` sitting asks 20
minutes of wall time with `HPCW_ALLOC_WAIT_S=600`, so `-I600` ends a ten-minute wait for a node in
words rather than hanging; the person's form of the sitting asks 30 minutes with no bounded wait),
which is what the sign-in sitting runs in, and `adapter_submit_after` (the successor of the always-on
chain, `afterany` plus `singleton`).

Egress adapter: `egress_probe()` runs inside the probe job and returns the class plus the working proxy
environment by testing `https://api.anthropic.com/`, `https://platform.claude.com/` and
`https://claude.ai/` with and without the inherited variables (only HTTP CONNECT proxies count; Claude
Code refuses SOCKS, so an `ssh -D` tunnel is unusable); `egress_env()` renders the variables the job
template exports into the container. Two traps from the report: Open OnDemand submits with
`--export=NONE` by default, which strips a login-set proxy from the job, so the variables are injected
explicitly; and an allowlist holding only `api.anthropic.com` passes a pre-authenticated worker and
fails a fresh login, because token exchange goes to `platform.claude.com`.

The framework also enforces a task manifest independently of the agent (report, "Security controls"):
working directory, allowed partitions, allowed egress hosts; input data read-only with a separate
writable working directory; scheduler polling never faster than the profile's floor.

## 4. The job template and the Remote Control launch sequence

### 4.1 The sign-in sitting: the login terminal and its line contract

The student signs in to Claude Code once, through Anthropic's own paste-code flow, inside the worker
image on a compute node. What changed on 2026-09-29 is who starts that sitting and where the code is
pasted: the extension starts it and takes the code in its own panel, so the student types no command,
answers no `y` and presses no Ctrl-C. The maintainer's words: "the extension starts the Claude worker,
gets me to the Claude sign-in page, I sign in / click Authorize, and a Claude session opens connected
to the grid."

**The credential boundary, stated once.** The extension opens the sign-in page Claude Code printed
(a public `https://` URL on `claude.ai` or `claude.com`) in a new tab with `tabs.create` and shows one
text box. The student signs in on Anthropic's page with their own account, clicks *Authorize*, and
pastes the code that page shows into the box. The extension never reads the code from the Anthropic
page or from the clipboard by itself (no script there; no `clipboardRead`); it types the pasted code
once into the sitting on the cluster and holds no copy. On the compute node the framework passes the
code from its standard input to Claude Code's pseudo-terminal with the terminal's echo off, so the code
is never printed back; Claude Code exchanges it for its credential inside the container and writes
that to `<claude_config_dir>/.credentials.json`, mode 0600; nothing of ours reads that file. Measured
on Wayne State 2026-09-28: the paste-code login completed from a compute node inside the image and
`claude auth status` reported `loggedIn: true`, plan `max` (that login was lost with its folder later
the same evening; `SECURITY.md`, incident record).

**The channel.** The sitting is the Shell app's WebSocket (section 5), opened by the page script on the
portal origin like every other shell use, but held open for the length of the sitting instead of one
command line (`openShell` in `core/shell.ts`; `openLoginShell` in `core/portal.ts`). The panel holds
it through a port (`LOGIN_PORT` in `core/messages.ts`) to the page script, so the sitting lives as
long as the panel that started it: closing the panel closes the shell. The one line typed is
`bash ~/.hpcworker/bin/hpcworker claude login --plain` (`commands.claudeLoginPlain`); the framework
asks the scheduler for the short allocation (`adapter_interactive`), runs Claude Code inside the image
with the clean environment of 4.3 under `script` (`framework/lib/login_plain.sh`), and prints the
lines below. The chokepoint records the whole sitting as one audit line in the scheduler class
(`classifyCommand` in `core/audit.ts`: the sitting's command allocates a job with `srun`, so it sits
under the 60 s floor, not the shell's 15 s one) with the counts of bytes read and bytes typed; the
typed text is counted and kept nowhere (7). On the login node the
sitting is the `ssh`, its shell and the `srun` client, the same three processes the student would have
by typing the command in the portal's own Shell tab, and the framework ends it after ten minutes at the
latest (the panel closes the socket after fifteen whatever happened).

**The line contract.** The extension parses nothing of Claude Code's own screen, which the framework
never copies to its standard output: the screen goes to a transcript under `<ipc_dir>/$USER/hpcw_login_<job>`
(mode 0600, removed when the sitting ends, never on shared storage), and the framework matches
patterns against it. What reaches the terminal is the login shell's own text and these lines, one per
line, at the start of the line (`LOGIN_LINES` in `core/contract.ts`; `login_plain.sh` prints them):

```
HPCW-LOGIN: requesting a compute node
HPCW-LOGIN: on <node>; checking whether you are signed in already
SIGNED-IN <email> <plan>                       already signed in: the sitting ends here, exit 0
HPCW-LOGIN: starting Claude Code's sign-in; waiting for the sign-in link
AUTH-URL: <https://claude.ai/oauth/authorize?...>   the page Claude Code printed, once; the extension
                                                    opens it in a tab and shows the box
HPCW-LOGIN: paste the code from that page
HPCW-LOGIN: code received, checking            a fixed line; never the code itself
HPCW-LOGIN: that code was not accepted; paste it again      when Claude Code rejects a code
SIGNED-IN <email> <plan>                       `claude auth status` after the exchange: loggedIn true,
                                               with the account and plan it reports; never the token
HPCW-LOGIN-FAILED: <one plain sentence>        exit 3: no link within two minutes, no code within
                                               the ten-minute budget, the shell closed, the image
                                               lacks `script` or `setsid`, an interruption
```

`login_plain.sh` keeps a dry mode (`HPCW-LOGIN-DRY: url_seen=.. prompt_seen=.. ..`) for the
framework's unit tests only; no probe runs the sitting, and what the flow looks like at a site is
known once a person has signed in through it.

Rules the two sides keep. The extension reads `^HPCW-LOGIN` (informational, shown as the sitting's
progress), `^AUTH-URL:\s*(\S+)`, `^SIGNED-IN` and `^HPCW-LOGIN-FAILED`; everything else is shown as
the terminal's text and stored nowhere durable. It opens an `AUTH-URL` only when the address is
`https` and its host is `claude.ai`, `claude.com` or a subdomain of either (`isClaudeAuthUrl`); any
other address is reported as refused, not opened, and the sitting continues so the student can read
what happened. A redrawn `AUTH-URL` line is not a second page. It sends the code as keystrokes on the
port (the pasted line, then Enter) after the framework's paste line, counts the bytes for the audit
record, clears the box, and keeps nothing; a rejected code is asked for again by the framework's own
line. The framework prints `AUTH-URL:` once, presses Enter for Claude Code should a login-method menu
sit in front of the link (at most six times, never while the link is up; whether such a menu appears
at all under the seeded sitting is not yet measured, since the real `claude auth login` screen has not
been run under it), gives Claude Code two
minutes to show the link and ten minutes for the whole sitting, runs `claude auth status` after the
exchange and reports the answer as `SIGNED-IN`, and seeds Claude Code's settings for the worker's
workspace before the sign-in (the SEED in `bin/hpcworker`: `hasCompletedOnboarding`, `theme`,
`hasTrustDialogAccepted` for the workspace; only added, never removed, never on an unparseable
file). The sitting never runs `claude remote-control`: the Remote Control question is answered by the
worker job from the student's recorded statement (4.4), so there is no `y` to type and no Ctrl-C.

The person's form of the same sitting, `hpcworker claude login` typed in the portal's own Shell tab,
still exists: it prints sentences instead of marker lines, skips its own Remote Control step when
Claude Code's record or the marker already answers it, and the extension learns of the sign-in from
the next probe or heartbeat.

**When the step runs.** The strip (6.1) runs the sitting when the sign-in is not known to be good,
before the statement and the start. The facts, in the order they override one another (`gatherFacts`
in `core/facts.ts`, `decide` in `core/steps.ts`): the probe's `claude_auth.loggedIn`; a sign-in made
from this browser since the probe ran (`bridge.loginSeen`: the time and what the `SIGNED-IN` line
said), which overtakes the probe's word; and a live worker's own `claude_login`, which wins unless it
was checked before that sign-in or the sign-in is younger than ten minutes (`LOGIN_SEEN_FRESH_MS`). A
live worker that still says `need_login` within three minutes of a sign-in from this browser is
waited out ("Signed in; your worker re-checks within a minute...", `LOGIN_RECHECK_PATIENCE_MS`) rather
than the sitting being opened again, and a dead run's last `need_login` is not a fact about now and
does not open it. Because the sitting starts an `srun` on the login node, the step treats it as a
scheduler-facing call under the 60 s floor and waits the floor out rather than refusing. A student
whose sign-in holds sees, at most, the sitting's first `SIGNED-IN` line and no page to open (the
framework answers it from a worker heartbeat younger than 15 minutes that already says `loggedIn`,
without an allocation; that heartbeat may be a stopped job's last one, which after a credential loss
would answer `SIGNED-IN` once until the next worker says `need_login`). A worker started seconds after a
sign-in asks `claude auth status` four times, ten seconds apart, before it says `need_login`, and a
worker waiting in `need_login` asks again every minute (`LOGIN_RECHECK_S`, 60 s); its `status.json`
carries `needs` (`login`, `consent` or `nothing`) and a one-sentence `hint` for the strip's line.

Remote Control requires a full-scope login: `setup-token` and `CLAUDE_CODE_OAUTH_TOKEN` credentials
can only make model requests, and a `CLAUDE_CODE_OAUTH_TOKEN` in the environment outranks the stored
login and would silently disable Remote Control in any process that inherits it. This is why the VS
Code edition's earlier `setup-token` capture (Ashley for VS Code 1.0.0) is gone rather than
supplemented.

Not yet measured: the first live sitting end to end (the three kinds of line on a real `srun`, the
time from the click to `AUTH-URL:`), and whether the portal's five-minute shell idle timer closes a
sitting while a slow student is still on Anthropic's page (nothing is printed while the framework
waits for the code and the extension sends no keep-alive; if the timer bites, a progress line once a
minute from the framework is the fix).

### 4.2 The job template

One file rendered from the profile.

Header directives: `--partition`, `--qos`, `--account`, `--time`, `--tmp`, `--requeue`,
`--signal=B:TERM@120`, `-D <shared_state_dir>/<run>` (so `--output` resolves where intended); a
successor in the always-on chain (below) is the same rendered file submitted with
`--dependency=afterany:<predecessor>,singleton`.

Fixed body, in order:

1. `cd $(node_tmp)`; stage the SIF to node-local storage if the profile says so. Node-local temp and
   the runtime's cache (`APPTAINER_TMPDIR`, `APPTAINER_CACHEDIR` and the `SINGULARITY_` twins) sit
   under the node's local disk with a cleanup trap; nothing of ours goes under a login node's `/tmp`.
2. Export the egress environment from `egress_env()`.
3. `mkdir -p /dev/shm/$USER/xdg && export XDG_RUNTIME_DIR=/dev/shm/$USER/xdg` (the bash tool's
   `EACCES ... /run/user/<uid>` defect on nodes without systemd user sessions, closed "not planned"
   upstream; whether the fix holds is open question 5).
4. `JOB_TOKEN=$(head -c 32 /dev/urandom | base64)`, written with mode 0600 into the state directory,
   never on a command line or in the environment of a submitted job.
5. Write `status.json` with `state: starting`.
6. Start the Remote Control process (4.3).
7. Write `connection.json`: `session_name` (the line of the registration block that carries the
   name: `<site>-<jobid>` when Claude Code accepts `--name`, otherwise its generated one, of the form
   `asx10-hazy-meadow`), `environment_url` (`https://claude.ai/code?environment=env_...`, the link the
   extension opens), `host`, `port` if the optional `/rnode/` service is enabled, `pid`, `started_at`,
   `token_path`.
8. A `SIGTERM` trap that flushes `status.json` (`state: preempted`, the successor's id) and exits
   cleanly.
9. Before the wall time ends (at the `--signal=B:TERM@120` warning at the latest), queue exactly one
   successor: `sbatch --dependency=afterany:$SLURM_JOB_ID,singleton` of the same rendered script, its
   id recorded in the run directory so a second submission is refused. A stop file ends the chain: no
   successor is queued, and a successor that was already queued exits at once when it starts. The
   worker is always on until the student stops it; `afterany`, never `afterok`, so a predecessor that
   ends non-zero for a trivial reason does not strand the chain.

All persistence lives on shared storage; `/tmp` is treated as ephemeral; nothing runs on the login
node beyond the one `sbatch`. The job's cleanup trap removes only its own node-local temp and its
`/dev/shm` directory; the framework deletes nothing outside its own run directories (`SECURITY.md`,
the incident of 2026-09-28). Compared with the VS Code edition's `worker.sbatch.tpl`, what changes
is the payload (`claude remote-control` in `tmux` instead of the inbox daemon) and the status files;
what stays is the `/dev/shm` scratch bound to `/tmp`, the `--signal=B:TERM@120`, `--requeue` with
`--open-mode=append`, the refusal to start when a piece the worker needs (the image, the runtime,
its temp folders) is missing, and the read-only bind of the host's Slurm client into the container
(since framework 9, where the site profile asks for it; below), which, as there, is skipped rather
than refused when a piece of it is missing on the node.

**The workspace guide** (framework 8). Claude Code reads a `CLAUDE.md` in its working folder at the
start of each session, so `hpcworker worker start` writes one into the worker's workspace
(`<shared_state_dir>/workspaces/<name>/CLAUDE.md`) from `jobs/workspace-guide.md.tpl`, filled from
the site profile by `lib/profile.py guide`: that this is a compute node under the site's scheduler
and the worker a job hpcworker started; light work in the worker, heavy or long work as its own job,
nothing on the login node, the partitions, QoS and account, `/tmp` as the job's node-local space and
`ipc_dir` for sockets; the folders the container sees, each named for what it is from facts the
profile already carries; results handed back as a path, as a file sent in the session when Claude
Code has a tool for that, and to Google Drive, Docs or Sheets only through a connector the person
turned on in Claude's settings; and what never goes in (PHI, FERPA records, IRB data without
approval, export-controlled material, credentials, the Claude sign-in folder). It is written only
when the workspace has none (a workspace from before framework 8 gets it at its next start), with
bash's noclobber, so a file already there, edited or left empty on purpose, is never replaced;
`hpcworker worker guide` prints the current text and writes nothing. The extension's texts do not
change for it. What the guide says about the scheduler follows the flag in the next paragraph:
without it, check `command -v sbatch` and, when it is missing, write the job script into the
workspace for the person to submit.

**Slurm inside the worker** (framework 9). The container has no scheduler of its own, so until
framework 9 a worker's Claude Code could write a job script but not submit it. With
`scheduler_in_worker: true` in the site profile (Wayne State's sets it; the default is false and
every other site is unchanged), each worker job binds the host's own Slurm client into the container,
the set the lab's VS Code tool measured on asx1 on 2026-09-28 and has used since: `/usr/bin` under
`/opt/host/bin` (never the whole of it on the container's PATH), `/usr/lib64/slurm`, the munge
library into `/usr/lib` (a default search folder, so no `LD_LIBRARY_PATH`), `/etc/slurm`, the munge
socket's folder, and an `/etc/passwd` and `/etc/group` that add to the container's own the host's
entries for `slurm.conf`'s `SlurmUser`, `munge` and the person (without the slurm user: "Invalid user
for SlurmUser slurm"). Everything is read-only but the socket. `hpcw_slurm_in_container` in
`lib/adapters/common.sh` makes the binds and five wrappers (`sbatch`, `squeue`, `sacct`, `scancel`,
`sinfo`; not `scontrol`, whose host binary needs a `libreadline.so.6` the bookworm image lacks) on
the compute node at the start of each job, under the job's `/dev/shm` directory (node-local, never
swept, removed with the job), and the job adds them to every container start with the wrappers'
folder `/opt/hpcw/slurm/bin` first on the container's PATH. A wrapper runs the host binary with the
host's PATH and `LD_LIBRARY_PATH` and the job's original `TMPDIR`, and removes the container's
`APPTAINER_`/`SINGULARITY_` variables, the worker's `XDG_RUNTIME_DIR` and the worker job's own
`SLURM_` variables (`SLURM_CONF` kept), so a job Claude Code submits runs on the host much as if
submitted from a terminal (the rest of Claude Code's environment, the worker's `HPCW_` variables
included, goes along), with the person's module libraries rather than the container's
`/.singularity.d/libs`, is not steered by the worker's `SLURM_CPUS_PER_TASK` or
`SLURM_MEM_PER_NODE`, and outlives the worker. A piece missing on the node does not stop the worker:
it starts without the client, and the job log, `status.json` (`scheduler_in_worker`,
`scheduler_note`), `hpcworker worker status` and `hpcworker diag` (`hpcw.slurm-in-worker`) say
which piece. `validate` refuses the flag for a scheduler other than Slurm or a runtime other than
Apptainer or Singularity. An account's `profile.json` is a copy of the site profile kept since its
install, so a field added later (`FIELDS_FROM_SITE`: this one) takes the site profile's value from
the copy the command runs, until the account sets its own with `hpcworker profile set`. With the
flag, the workspace guide says the commands are there, that a submitted job runs outside the
container and outlives the worker, to cancel only its own jobs by id and never the worker's
(`$HPCW_JOB`), to keep a container job's `APPTAINER_TMPDIR` and `APPTAINER_CACHEDIR` on node-local
disk, and to have a submitted job write under the workspace, follow it at most once a minute and
report what came out and where; a workspace that already has a `CLAUDE.md` keeps its own. Measured
by one check job on the grid (`framework/tests/grid/slurm_in_container.sbatch`, job 40518457 on
asx1, 2026-09-30, recorded in `framework/README.md`): from inside the container `squeue -u`,
`sinfo -s`, `sacct -j`, `sbatch --test-only` (answered by the controller, nothing submitted) and
`scancel --version` worked; `scontrol` did not, and the environment check showed the container's
`LD_LIBRARY_PATH` reaching a submitted job. The two changes that followed (no `scontrol` wrapper,
the host's `LD_LIBRARY_PATH` in the wrappers) have not been run on the grid, nor has a real
submission by a worker's Claude Code from a Remote Control session.

### 4.3 The batch launch

```
tmux new-session -d -s rc \
  "apptainer exec <binds> <image> claude remote-control --name '<site>-<jobid>' \
     --capacity <N> --permission-mode default 2>&1 | tee -a <shared_state_dir>/<run>/rc.log"
```

then a loop that waits for the registration line in `rc.log`, writes `connection.json` and sets
`status.json` to `state: online`. `tmux` supplies the pty the trust check requires ("when its
standard input or output isn't a terminal, the command can't ask and exits with a `Workspace not
trusted` error") and detaches the process from the job's lack of a controlling terminal;
`script -qfc` is the fallback, and is what the VS Code edition's `phone.js` uses today. Supervised mode
(`--permission-mode default`) is the default so every command is approved from the app, which is
what Utah, NERSC and USC require of agents on their systems; a student may choose a broader mode
knowingly, on the options page.

The same loop answers Claude Code's two one-time prompts, and only those, from the student's own
recorded answer: when the terminal shows `Enable Remote Control? (y/n)` (or the trust question, if
the seed did not reach the settings file) and the consent is on record (4.4), the job types `y` once;
with no record it writes `state: need_consent` and waits, and the strip's statement step is what
resolves it. The extension itself never types into Claude Code's prompts.

The registration block of Claude Code 2.1.283, after the QR code, is what the loop parses:

```
·✔︎· Connected · phone · HEAD
    Capacity: 1/32 · New sessions will be created in the current directory
    asx10-hazy-meadow
Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt
Or ask Claude to work in this folder from your projects on claude.ai
```

The name line and the `https://claude.ai/code?environment=...` URL go into `connection.json` as
`session_name` and `environment_url`. The environment id is stable per machine id, so a second host on
the same login joins the same environment. The extension opens `environment_url` in a new tab with
`browser.tabs.create` (which needs no `tabs` permission and puts no code on claude.ai) once per link
per browser (`bridge.opened` remembers which links it opened) when the setting *open claude.ai when my
worker connects* is on (its default), and shows the green *Open in Claude* button and *Copy link*
either way; it still names the session for students who prefer to pick it at claude.ai/code or under
*Code* in the Claude app. No QR code is needed.

The worker is always on. The successor queued with `afterany` reconnects the same session:
`claude remote-control --continue` in the same directory when `connection.json` is younger than four
hours (the documented recovery window), else a fresh registration, which lands in the same
environment. Whether `--continue` survives a Slurm requeue is open question 4. If `rc.log` shows the
full-scope-token error, the job writes `need_login` and the strip runs the sign-in step again; a
Remote Control session that outlives the login stops making progress.

Whether `claude remote-control` stays registered from an `sbatch` job at all was open question 1. It
was answered yes on 2026-09-29 (02:22 UTC): Ashley's phone host, Slurm job 40496445 on `asx15`, `sbatch`
under a pseudo-terminal with the student's answer already on record, registered and served a session
opened from the phone (`OPEN_QUESTIONS.md`). Before that no published account showed it under `sbatch`;
the launch sequence had been inferred from documented TTY behaviour and a community report of it
working over SSH plus `tmux`.

Session lifetime is the Slurm wall time. Server mode gives up after roughly ten minutes of network
outage and exits; the framework restarts it with backoff while the job lives.

### 4.4 The consent marker written on acknowledgement

Claude Code asks once, per login, `Enable Remote Control? (y/n)`, and records the answer itself in
`<claude_config_dir>/.claude.json` as `remoteDialogSeen: true` (alongside a `remoteControlMachineId`);
directory trust is recorded as `projects[<dir>].hasTrustDialogAccepted: true`. The framework reads
those two boolean keys and nothing else from that file, and rewrites it only to seed
`hasCompletedOnboarding`, `theme` and the workspace's `hasTrustDialogAccepted`, only in the sign-in
sitting or when a worker is about to start a session. That is unchanged.

What changed is where the student gives the answer before the first session. The strip's statement
step (6.1) shows the plan-class disclosure and one text to tick (`STATEMENT_TEXT` in
`core/disclosure.ts`): the data-classification sentence (the worker's workspace holds none of the
restricted data the notice names) followed by the Remote Control sentence ("Claude Code's Remote
Control will be enabled for this worker; this answers Claude Code's one-time question for you"). The
acknowledgement is kept in `storage.local` (`bridge.statements`), one record per workspace
(`workspaces/<name>`) with the version of the text it was made on (`STATEMENT_VERSION`, an integer,
2 at the time of writing), the exact text, the time, and the time the marker below was written; the
notice is shown at every start, and the tick is asked again only when the text's version or the
workspace changes. On acknowledgement the extension writes the framework's own marker in the student's
account through the Files app: `PUT ~/.hpcworker/consent` (`paths.consent`; the first path
`consent_markers()` in `bin/hpcworker` returns, the profile's `consent_markers` being the others),
whose body is one line, `yes <ISO time> <install id>`, where the install id is the random identifier
the browser made for the acceptance record, never an identity. If that write fails, the start writes
the marker first (`startWorker` checks the marker's existence by the listing rule and writes it when
owed) and check 16 says so. The framework tests the marker's existence only. The worker job then
answers Claude Code's question with `y` from that record at its first start (4.3), Claude Code writes
`remoteDialogSeen` itself, and from the second session on Claude Code's own record is what the
framework finds first (`consent_source: claude_config`, with `marker` as the source it started from).
The extension never types the answer into Claude Code; the job does, from the student's statement,
once per prompt. `hpcworker claude consent` remains for a person at a terminal who wants to record the
answer without the panel.

## 5. The Open OnDemand channels

Open OnDemand has no public API: no release through 4.2.5 ships one, and the maintainers say the
endpoints are internal and not on the roadmap to open. The extension therefore rides three surfaces
chosen for stability across tagged versions 2.0.32 to 4.2.5 (report, "Open OnDemand gives three
channels everywhere"), plus an optional fast path. All portal traffic passes through one chokepoint
function in the extension that appends an audit record and enforces the poll floor.

| Purpose | Endpoint | Protocol | Browser context | Notes and failure signatures |
|---|---|---|---|---|
| PUN warm-up and session check | `GET /pun/sys/dashboard/` | HTTPS, follow redirects | either | `warm()` in `core/portal.ts`, run once per client before any Files, Shell or Jobs call (`ensureWarm`), and again after any 5xx. A cold per-user NGINX answers a 5xx ("Error: Server Error ... try again in 30 seconds", a 500, seen 2026-09-29) or a 302 to `/nginx/init?redir=...` (which also loses a POST body): `looksCold` is status 500 or above, or a final URL under `/nginx/init`; on it, wait and try again after 2 s, 5 s and 10 s (`WARM_DELAYS_MS`), the strip saying "Waking up your portal..."; after the third retry, "your portal did not wake up after N tries; wait a moment and try again". Then: 302 to the IdP, a VPN captive page or a connection error means "sign in to your portal (and connect the VPN) in a tab"; never automate login. The dashboard page also yields the csrf meta tag and the username |
| Bootstrap shell: submit the job, read the id | `GET /pun/sys/shell/ssh/<host>` (scrape `csrf=` from the inline script), then `wss://<ood>/pun/sys/shell/ssh/<host>?csrf=<token>` | WebSocket, no subprotocol; send `{"input": "..."}` and `{"resize": {...}}`; receive raw PTY text frames | content script on the portal origin (a service worker is also admitted because a non-`http` Origin skips the check, but Firefox and Safari cookie behaviour makes the content script the only safe choice) | Scrape the token seconds before connecting (the secret is per Node process; Passenger kills an idle app after 300 s). Close code 3146 with reason "No clusters defined.", "Invalid Origin.", "Bad CSRF Token." or `Host "<host>" not specified in allowlist or cluster configs.`. Defaults: 5-minute idle, 1-hour maximum. Run `sbatch --parsable <script>` once, parse the id, `exit`, close. Validate every frame as JSON: a bad frame throws inside the user's only shell process. The CSRF token travels in the query string and hence into access logs. Measured 2026-09-29: `default` reaches `warrior` without a password, 1.9 s open to close |
| The sign-in sitting | the same shell page and socket, held open (`openShell`) | the same frames; the framework's marker lines (4.1) in the PTY text; no keep-alive frames, the shell's own output is the only traffic | content script only, behind a port from the panel | One sitting at a time; one audit line in the scheduler class (the sitting allocates a job, so the 60 s floor applies) with the bytes read and typed; the framework ends it after ten minutes for the paste (and waits at most ten for a node), the panel after fifteen (`SESSION_MAX_MS`); closed at `SIGNED-IN`, `HPCW-LOGIN-FAILED`, the limit, the student's cancel or the panel closing |
| Write request and control files | `PUT /pun/sys/dashboard/files/fs/<abs path>` (body = content; `?dir=true`; `?touch=true`) | HTTPS PUT with `X-CSRF-Token` from `<meta name="csrf-token">` | content script only (the Rails Origin check rejects `chrome-extension://`) | 422 = stale token or wrong Origin; 403 = allowlist or `EACCES`; 302 to `/nginx/init` = cold PUN, body lost (the warm-up above runs first). Gated by `upload_enabled` (only for the multipart route), `OOD_ALLOWLIST_PATH` and a 10 GB cap. Measured 2026-09-29: uploads disabled at Wayne State, `PUT` works; the consent marker goes up this way (builds before 8.0.0 also put the framework files there where a site had no shared copy, 2.1) |
| Poll worker state | `GET /pun/sys/dashboard/files/fs/<shared_state_dir>/<run>` with `Accept: application/json`, and `?download=1` for a file | HTTPS GET | either (service worker on Chrome/Edge; content script on Firefox/Safari) | Read `status.json`, `connection.json`, `rc.log` via `download_url` or `?download=1`; served `Cache-Control: no-store`; `files_upload_path` present if and only if uploads are enabled. File reads touch no scheduler, so they may run on a timer of seconds: the background's alarm reads them once a minute, and the strip, while it is open, every 10 s for the first two minutes after a start and every 60 s after that. Existence comes from the listing (the rule below), never from a download's status |
| Upload a file to the working directory | `POST /pun/sys/dashboard/files/upload/fs` (multipart: `parent`, `name`, `file`) | HTTPS POST + CSRF | content script | 413 above `client_max_body_size`; 404 if uploads disabled (Wayne State) |
| Job state | `GET /pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user` | HTTPS GET | either | `data` is an array of arrays (one inner array per 3,000-job slice); match `pbsid`; `errors` names unconfigured clusters. Reconciliation only; the primary state is `status.json`. Measured 2026-09-29: 83 jobs listed |
| Cancel | `DELETE /pun/sys/dashboard/activejobs?cluster=<id>&pbsid=<job>` (or `scancel` through the bootstrap shell) | HTTPS DELETE + CSRF | content script | redirects on success; the redirect is read as the success and not followed |
| Optional: Job Composer submission | `POST /pun/sys/myjobs/workflows.json`; `PUT .../workflows/:id/submit.json` (204); `GET .../workflows/:id.json` (`status`) | JSON | content script | deprecated in 4.1, gone in 5.0; 404 if hidden; "There are no configured hosts" if no clusters. Not relied on. Measured 2026-09-29: present (200); `/pun/sys/dashboard/projects` 500 |
| Optional: partner-site Interactive App | `POST /pun/sys/dashboard/batch_connect/sys/<app>/session_contexts.json` (204); then `~/ondemand/data/sys/dashboard/batch_connect/db/<id>` and `.../output/<id>/connection.yml` via Files | JSON + Files | content script | requires the admin-installed app; a user can install nothing under `/var/www/ood/apps` |
| Optional fast path to the worker | `https://<ood>/rnode/<node>/<port>/<path>` (or `/node/...` with the worker mounted under that prefix) | HTTPS / WSS | either; the worker authenticates with `X-Job-Token: <JOB_TOKEN>` in a header or body, never `Authorization`, never the OIDC cookie, never `X-Forwarded-User` | 404 = proxy not enabled or `host_regex` mismatch; 503 "Failed to connect to <host>:<port>" = enabled, no listener; Set-Cookie is rescoped to `Path=/rnode/<host>/<port>`; avoid protocol-relative redirects. Since 4.1 the portal strips `mod_auth_openidc_session*` cookies and `Authorization`/`OIDC_*` headers before proxying. Measured 2026-09-29: `/rnode/warrior/1/` 404 (mailbox mode for the login node; compute nodes not yet probed) |
| Detect-only | `/nginx/init?redir=`, `/nginx/stop`, `/logout` | HTTPS GET | none | recognised in redirects; never called; `/logout` never |

**The existence rule for Files downloads.** The Files app answers a download of a missing file with
HTTP 200 and its own HTML page: on 2026-09-29 `GET <workspace>/.restricted?download=1` returned 200
with 58,730 bytes of HTML while no such file existed, and check 16 read the workspace as restricted.
So a download's status never decides existence. `stat(path)` and `exists(path)` in `core/portal.ts`
read the parent directory's JSON listing (`GET <dir>` with `Accept: application/json`) and look for
the name in `files[]` (a 404 for the parent means "not there"; any other failure is thrown, so a
caller says "could not be checked" rather than "absent"). `readFile` treats a download whose
`Content-Type` is `text/html` as "not a file", whatever its status, so `readFileIfExists` answers
absent for it. The listing decides for `.restricted`, `profile.json` and the consent marker; the
content-type guard covers every download (`status.json`, `connection.json`, `rc.log`, `probe.json`
and the rest). A 404 alone means absent; any other failure, a 500 included, is thrown, so the caller
says "could not be checked" rather than "absent" and the strip does not submit a probe over a
failing read (a read that met a 5xx is retried once after a fresh warm-up first).

Which context talks to which endpoint is decided by cookies and CSRF together. Chrome and Edge send
the portal cookie from the service worker once the host permission is granted, unless third-party
cookies are blocked; Firefox and Safari have no documented guarantee. A content script on the portal
origin sidesteps the question, because content scripts initiate requests on behalf of the page's
origin, and it is the only context whose `Origin` passes the dashboard's
`protect_from_forgery with: :exception` for `PUT`, `POST` and `DELETE`. The rule: every write, the
shell bootstrap and the sign-in sitting run from the portal-origin content script with the page's
`X-CSRF-Token`; polling GETs may run from the service worker on Chrome and Edge; Firefox and Safari use
the content script for everything.

The session the extension inherits lasts, with Open OnDemand's defaults, 8 hours of inactivity and
8 hours maximum; the cookie is HttpOnly and SameSite=Lax; a 302 to an identity provider or a 401
means "sign in again in a tab", and nothing is cached across the re-login.

The shell is a login-node shell. It is used to open, run one `sbatch --parsable`, read the id and
close, and, once, to hold the student's own sign-in sitting open for as long as the paste takes.
Anything else that keeps a login-node process alive for the extension's benefit breaks both the
shell's timers and every login-node policy sampled (Wayne State's 20-process cap with immediate
deletion; OSC's 20 CPU-minute limit; FASRC's "not more than once a minute" polling rule).

## 6. The extension, per browser

WXT emits the Chrome/Edge MV3 service worker and the Firefox event page from one background entry and
the Safari build for Apple's packager. `browser.*` with Promises, no polyfill (the polyfill was archived
2026-07-30 and is a no-op from Chrome 148), `minimum_chrome_version: "148"`.

| Browser | Background | UI | Network contexts | Notes |
|---|---|---|---|---|
| Chrome, Edge | MV3 service worker; may hold a WebSocket alive with a ≤20-second ping only during the seconds-long bootstrap (the sign-in sitting's socket lives in the content script, not the worker) | `sidePanel`, opened from the icon click (`sidePanel.open({tabId})`, falling back to a tab) | content script for writes, the shell and the sitting; service worker allowed for polling GETs after check 3 passes | a `fetch()` taking over 30 s kills the worker, which is one reason the bootstrap is short |
| Firefox | MV2 with a persistent background, or MV3 with alarms | `sidebar_action`, opened from the icon click (`sidebarAction.open()`) | content script for everything | `port.onDisconnect` is routine: message ports cannot keep an event page alive |
| Safari | assumed to die within tens of seconds | the panel page in a tab, opened from the icon click | content script for everything | per-site prompt on first visit; see `MAC_AND_SAFARI.md` |

The `alarms` API enforces the ≥60-second scheduler-facing floor by construction, since Chrome will not
honour periods under 30 seconds. `storage.local` holds the portal hostname and granted origin,
preferences, the acceptance record, the account name the portal's dashboard showed and the last approval answer with its time, the access service's address from `services.json`, the statement made
about each worker's workspace (`bridge.statements`), the small notes the strip keeps so it does not
repeat itself (`bridge.opened`: the environment links it already opened; `bridge.loginSeen`: when the
login terminal last reported `SIGNED-IN` and what that line said; `bridge.probe`: the probe job it
submitted by itself, time and job number; `bridge.install`: the last install the strip ran by
itself or *Set up the cluster again* ran, with its time, whether it succeeded, which shared copy it
used, and the one line saying why the lab's shared copy could not be used when it could not), the audit log, the last good kill-list, a random installation
identifier and the ticks on the optional checklist steps; `storage.session`
holds the run record (`bridge.run`: the run's name and state directory, job number, the last
`status.json` and `connection.json` as read, the registration block parsed from `rc.log`, the last
4,000 characters of `rc.log` for the tail under *Details*, and the last read error), the portal tab
whose page script answers (`bridge.portalTab`), the tab the icon was last clicked from
(`bridge.click`), when check 4 last passed (`bridge.sessionSeen`), what the last automatic start did
(`bridge.autoStart`) and the last check results (`bridge.checks`); there is no durable secret (`PRIVACY.md` and `SECURITY.md` carry the same list; the report's own
sentence names four items and says "only", but the approval answer, the audit log and the last good
kill-list that its security controls also require are durable, so the list here is the complete one).
The content script is registered programmatically with `scripting.registerContentScripts` for the one
granted origin after the click-time grant, because the host is not known at build time. The tab the
click came from is pinged; when it does not answer, the same file is loaded into it at once with
`scripting.executeScript` and it is pinged up to eight times a quarter-second apart until it answers
(`connectSequence` in `core/connect.ts`; finding a of 2026-09-29: registration alone leaves an
already-open tab without the script, and `tabs.sendMessage` then fails with "Receiving end does not
exist"). Other tabs already open on the origin are not touched by the click: when a later call needs a
portal tab and the remembered one is gone, the background finds them with `tabs.query` by URL (which
the granted origin permits without the `tabs` permission) and loads the script into one that does not
answer a ping, the same way (`portalTabId` in `entrypoints/background.ts`). The page script attaches its message listener before
it awaits anything, because a script loaded by `executeScript` is asked "are you there?" within
milliseconds. Messages are accepted only after checking `sender.id`.

### 6.1 The icon click, the strip and the step machine, the panel and the options page

**The click.** The manifest's `action` has no `default_popup` (`action: { default_title: 'Beethoven' }`
in `wxt.config.ts`), so a left click on the toolbar icon fires `action.onClicked`
(`browserAction.onClicked` in the Firefox MV2 build) in the background (`onActionClicked` in
`entrypoints/background.ts`). The handler does everything that needs the gesture before its first
`await`: it opens the panel (`sidePanel.open({tabId})` on Chrome and Edge, `sidebarAction.open()` on
Firefox, a tab with the panel page on Safari or when either refuses), reads the clicked tab's address
(`activeTab` grants that for the one click, without the `tabs` permission; `lookAtTab` in
`core/connect.ts` says whether it looks like Open OnDemand: a `/pun/` or `/nginx/` path, or the
hostname already connected), notes it (`bridge.click`), and, when it does, calls
`permissions.request` for that one origin and hands the promise to the connect sequence, which
registers the page script, loads it into the tab and pings it. When the clicked tab is not a portal
and none is connected, the strip says "Open your Open OnDemand portal in a tab and click the Beethoven
button there" and offers the setup page; when a portal is connected, the strip uses the
remembered portal tab. On install the options page (the setup page) opens, not a separate onboarding
tab; the same page is reachable from the browser's extension menu and from the strip.

**The strip and the step machine.** The strip is the top of the panel: one step title with its
number, one status line, and either the automatic action the extension is taking or the one button
the student is offered, never both. It is driven by a pure decision function (`decide` in
`core/steps.ts`) over facts gathered from storage, the browser and the cluster through the page script
(`gatherFacts` in `core/facts.ts`, reads only). Steps come in a fixed order and the first one not
satisfied is the step: `portal` (connected, granted, the page script answering), `warm` (the PUN
warm-up), `terms`, `access` (the cached answer of the approval check for the account name the dashboard shows; while it is no, the one button is *Ask for access*, which opens the request page with that name filled in; while it is being asked, the strip is busy; nothing below runs until it is yes, which is how a withdrawn approval stops every start), `install` (when `profile.json` is absent by the existence rule: one
install line pointing the account at the lab's shared copy where the bundled site profile names one;
otherwise, or when that line says the account cannot use the copy, one sentence naming the lab lead
and a *Try again* button, with nothing uploaded; an own copy left by a build before 8.0.0 counts as
installed and is never set up again by itself; the tool keeps the profile; 2.1), `probe` (submitted once, in the background, when
`probe.json` is absent; up to fifteen minutes of patience; its verdict on the compute node), `login`
(the sitting of 4.1, when the sign-in is not known to be good or the run says `need_login`),
`statement` (the disclosure, the per-workspace text, the consent marker, 4.4; also when the run says
`need_consent`), `start` (`hpcworker worker start` under the 60 s floor when no worker is alive; a
worker the student stopped stays stopped until they press *Start my worker*), `online` (`status.json`
and `connection.json` once a minute until the link appears; a preempted job with a successor waits for
it) and `open` (the environment link, opened once per link per browser when the setting is on). A run
on a cluster where everything is in place goes from the click to *Open in Claude* with the warm-up,
a few Files reads and no scheduler call. A step that needs a person shows one line and one button and
resumes when the person acts (the page script's hello after a portal sign-in, the tick, the paste); a
step that fails for a cluster reason shows the reason and a *Try again* button and points at the check
under *Details*. The strip lives in the panel; the sign-in sitting lives with it (its port closes when
the panel closes). While the strip is open it reads the run's files every 10 s for the first two
minutes after a start and every 60 s after that (file reads touch no scheduler); the background's alarm
reads them once a minute whether or not the panel is open. Every start goes through one path in the
background (`startNow`): it gathers the facts afresh, lets `decide` confirm that the start is the next
step, writes the consent marker if it is still owed, and types the one shell line; the strip asks it
with `worker.start`, and the automatic start on the portal tab's connection asks it too, so two starts
never race and `hpcworker` itself finds a job that already exists.

**Two automatic behaviours, both preferences.** *Start my worker when I open my portal* runs the same
start the strip runs when the portal tab connects and everything up to the statement is in order, at
most once a minute; *open claude.ai when my worker connects* opens the session's link in a new tab
once per link. In the current build both default to on (`DEFAULT_PREFS` in `core/keys.ts`); the
earlier decision of 2026-09-29 had the first off by default, and the maintainer's review settles which
ships. The options page explains each in one sentence where it is switched.

**The panel** (`ui/strip.ts`, `ui/terminal.ts`, `ui/details.ts`): the strip, with the step's own
input when it has one (the statement, the sign-in terminal with its one box and *Open the
sign-in page again*); when the run is green, the *Open in Claude* button, *Copy link*, *Stop* and the
session name; and under *Details*: the worker card (job, node, state, the sign-in and consent the
heartbeat reports, the chain), the buttons *Set up the cluster again*, *Run the probe job again*, *Sign
in on the cluster*, *Start worker*, *Stop* and *Read status now*, the seventeen checks with *Run the
checks* and *Quick checks*, the `rc.log` tail, the audit log (view, export, clear), the approval and
agreement line, the settings, and the Google Drive step. The footer names the one host it talks to.

**The options page** (`options_ui`; `entrypoints/options`, `ui/options.ts`; opened on install, from
the browser's extension menu and from the strip): 1. the agreement (the signing dialog, or the
acceptance record with export and print), 2. the portal (connect by address, or disconnect; the usual
way in is the icon on the portal's tab), 3. *Where your work goes* (the statement for the current
worker name, which can be made again), 4. the settings (shell host, site profile name, permission
mode with the sentence saying why supervised is the default, the two automatic behaviours), 5. the
audit log with its export, 6. the optional Google Drive step. There is no key card and nothing to
type: approval is confirmed by the background against the access service for the account name the
portal shows, and the strip and *Details* say what the last answer was. Nothing on the setup page is
needed for the three steps once the agreement is in place.

**Two further panel items** decided on 2026-09-29 and unchanged since: *Open in Claude* and *Copy
link* (shown when the files carry `environment_url`, opening it with `browser.tabs.create`, no `tabs`
permission needed, nothing of the extension on the page), and *Connect Google Drive in claude.ai* (a
checklist step opening `https://claude.ai/settings/connectors` in a new tab with one sentence and a
*done* box stored in `storage.local` as one boolean; no presence on that page).

### Manifest

| Key | Value | Justification (one sentence, as the stores will see it) |
|---|---|---|
| `permissions` | `storage` | Remembers the portal hostname you connected, your preferences, your acceptance of the agreement, the last answer of the approval check and your statement about each worker's workspace |
| | `alarms` | Checks your running job no more than once a minute, repeats the approval check and the withdrawn-versions download about once a day, and reconnects after the browser suspends the extension |
| | `scripting` | Loads the extension's page script on your university portal, and only there, after you connect it, including into the tab you clicked from |
| | `activeTab` | Lets a click on the icon read the address of the portal tab you clicked from, so it can connect that one site; no install warning |
| | `sidePanel` (Chrome/Edge only) | Opens the job monitor beside your portal tab when you click the icon |
| `optional_host_permissions` | `["https://*/*"]` | You connect your university's Open OnDemand portal from its own tab; access is requested at that click for that one origin only, and the extension refuses to work until it is granted |
| `host_permissions` | none | |
| `action` / `browser_action` | `{ default_title: "Beethoven" }`, no `default_popup` | a click runs the steps and opens the panel |
| `options_ui` | the setup page | the agreement, the portal by address, the statement, the settings, the audit log, the Drive step |
| never requested | `cookies`, `tabs`, `webRequest`, `webRequestBlocking`, `declarativeNetRequest`, `nativeMessaging`, `debugger`, `identity`, `clipboardRead`, any `claude.ai`, `anthropic.com` or `claude.com` origin | stated in the negative in the listing and the privacy policy |
| `minimum_chrome_version` | `"148"` | `browser.*` namespace, Promise-returning `onMessage` |
| `browser_specific_settings.gecko` | `id` `beethoven@openspineconsortium.com`; `data_collection_permissions: { required: ["personallyIdentifyingInfo"] }` | the approval check sends the institutional account name the portal shows (with the portal hostname, product and version); no crash reports and no usage data |
| `content_security_policy` | MV3 default; no remote script sources | remote code: no |
| Firefox target | `firefox-mv2` or `firefox-mv3` with alarms | Firefox still accepts MV2 |

## 7. Security controls

From the report's "Security controls", in the order a reviewer will look for them.

- **One origin, granted at click time.** No install-time host permission; the single portal origin is
  requested from the click on the icon (or the *Connect this portal* button in the strip). A malicious
  update therefore inherits one origin per user rather than "all sites". Universities can confine it
  further with Chrome's `ExtensionSettings.runtime_blocked_hosts` and `runtime_allowed_hosts`; the
  exact host and permission list is published so a security office can set them.
- **No `cookies` permission.** The portal cookie is used by the network stack and never read.
- **No script on claude.ai or any Anthropic page.** The only content script is on the portal origin,
  which removes the DOM-injection and prototype-skimming classes for everything except the portal page
  itself. The two kinds of Anthropic page the extension opens (the sign-in page Claude Code printed;
  the session's claude.ai/code link) open in a new tab with `tabs.create` and are never read. The
  extension never stores a credential and never touches the MFA approval step.
- **The pasted code passes through and is not kept.** The one-time sign-in code the student pastes
  into the panel goes over the login port to the page script and into the shell as keystrokes; it is
  held in a local variable only, the box is cleared as it is sent, and the chokepoint's one audit line
  for the sitting carries the count of bytes typed and never the text (`login terminal: <how it
  ended>, N bytes read, M bytes typed, S s`). No storage key, error report or message to the vendor can
  carry it. On the node the framework hands it to Claude Code's pseudo-terminal with echo off and never
  copies Claude Code's screen to the terminal the extension reads. The extension has no `clipboardRead`
  permission and reads no Anthropic page, so it cannot take the code by itself. The `AUTH-URL` it
  opens must be `https` on `claude.ai`, `claude.com` or a subdomain of either; anything else the
  cluster prints is reported as refused and not opened, so a compromised framework cannot make the
  extension open an arbitrary page.
- **Only the student's own answers reach Claude Code's prompts.** The extension types nothing into
  Claude Code except the code the student pasted for that purpose. The Remote Control question is
  answered by the worker job with `y` from the student's recorded statement (the consent marker the
  strip wrote on their acknowledgement, then Claude Code's own `remoteDialogSeen`), once per prompt,
  and never without a record.
- **One chokepoint.** Every portal request passes through one function that appends an append-only,
  on-device audit record (UTC time, endpoint, method, job id, byte count, outcome), viewable and
  exportable by the student and never transmitted, and enforces the poll floor and the shell rules:
  one command line per shell open, and the sign-in sitting as the one held-open use, one at a time,
  ended by the framework after ten minutes and by the panel after fifteen.
- **Signed kill-list, fail-safe.** Once a day the service worker fetches a signed JSON document
  (permitted because JSON is data), verifies it with `crypto.subtle.verify` (Ed25519; ECDSA P-256
  fallback below Chrome 137, Firefox 130 and Safari 17) against a public key compiled into the
  bundle. A revoked version refuses to send commands and tells the student why. Offline, the last good
  list applies; the extension refuses only on a verified revocation, so an outage of a one-person
  vendor does not strand a campus. Since 4.0.0 the document withdraws versions only; its
  `revoked_lids` field stays in the file for compatibility and the extension ignores it.
- **Approval, not keys.** Authentication is the student's own portal sign-in; authorization is the
  vendor's approved list. After acceptance, once the portal is connected and the dashboard's account
  name is on record, the background asks the access service (`access_check` from `services.json`,
  cached 24 h) whether that account is approved, on an icon click once the last answer is a day old or was no and once a day; a yes is kept
  24 h and up to 7 days when the service is unreachable, a no for 10 minutes. The strip's `access`
  step sits before `install`, so an unapproved or withdrawn account starts nothing, by the strip or
  by the automatic start, and the one button is *Ask for access*. The name asked about is only the
  one the dashboard page shows (`SessionInfo.username`), never a typed one and never the
  home-directory fallback. Nothing is read from a cookie.
- **One approved account, one installation (8.0.0).** The check also carries `install_id`, the
  random identifier `installId()` in `ext/storage.ts` makes once per installation (nothing about the
  device; a reinstall makes a new one). The service binds an approved account to the first
  installation that asks and refuses any other with `"reason":"other_installation"`, which the strip
  says as "This account is already set up on another computer. Ask your lab lead to move it here."
  with no button, until the maintainer moves the approval; an installation already bound to another
  approved account gets `"reason":"other_account"`, said as "This installation of Beethoven is
  already set up for another account. Ask your lab lead to move it to yours.", also with no button;
  a check without an identifier gets `"update_required"`. The wire stays `v:1`. The binding is
  enforced by the extension against the service's answer, so it keeps an approval from being shared
  casually and proves nothing against a modified copy; a move or a withdrawal reaches an
  installation holding a fresh yes within a day (7 days offline).
- **Two gates between a request and a working installation: the group and the approval.** The
  listing on the Chrome Web Store is private, so Chrome installs Beethoven only for the Google
  accounts in the lab's Google Group `Beethoven-users`; the approval check then decides whether an
  installation works. The access service records the steps on the student's record with their times:
  submitted (the request form, which asks for the Google account), confirmed (the student's
  *Confirm it is you* link from `<AccessID>@wayne.edu`, when `MAIL_STUDENTS` is `"1"`; until then the
  maintainer's e-mail says the mailbox is not verified, and an unconfirmed request lapses after 7
  days), decided (*Approve for Beethoven*, *Lab membership only* or *Deny*), invited and installed
  (set when the first installation binds the seat). The group belongs to a personal Google account,
  and Google has no programming interface for such a group's members (the Directory API serves only
  groups a Google Workspace owns), so the invitation is a manual step the service tracks rather than
  performs: the page after *Approve* shows the Google account in
  a copy box, a link to the group's members page and a signed one-use *Done, invited* button, the
  admin page has *Mark invited*, and a daily e-mail lists approvals not invited after an hour. A
  `GROUP_MODE` `"workspace"` adapter (the Workspace Directory API's `members.insert`, a service
  account with domain-wide delegation) is built behind a switch for a lab with a Google Workspace,
  off by default and never called live; on any error it falls back to the manual step. Neither gate
  carries anything from the extension: the extension never sees the group, and the group never sees
  the extension's installation identifier. Removal takes both: Remove (or *Withdraw approval*) on the
  service, and the account out of the group.
- **The lab's shared copy is read-only to students.** The extension never writes into it: it reads
  its `VERSION` and types the one install line. The launcher in the student's home is a regular file,
  so no write in the student's account reaches the shared copy, and the published tree gives the
  group no write (2.1). The folder name is used on a command line only when it is a plain absolute
  path.
- **Per-job token.** The worker carries its own random token so that a request reaching the proxy with
  a valid portal session cannot drive another student's worker (the `/rnode/` handler does no job or
  ownership lookup).
- **Only the environment link is opened by itself.** The link the strip opens when the worker connects
  must match `https://claude.ai/code?environment=env_...` exactly; anything else the job reports is
  shown as text.
- **Release pipeline.** Lockfile and `npm ci`; actions pinned by commit SHA; a build attestation from a
  hosted builder (SLSA level 2 at minimum, signing material inaccessible to build steps as the level 3
  target); reproducible-build instructions published for all stores; no long-lived store API key in CI;
  publisher account and kill-list signing key behind a hardware security key with no third-party OAuth
  grants.
- **Cluster side.** Supervised mode by default; the task manifest (working directory, allowed
  partitions, allowed egress hosts) enforced by the framework independently of the agent; input data
  read-only with a separate writable working directory; scheduler polling never faster than the
  profile's floor; tokens never on command lines, in argv, in logs, in job files or in
  `sbatch --export`.
- **Nothing deleted outside the run directories.** The framework removes only what is under its own
  `<shared_state_dir>/<run>/`, the job's node-local temp and `/dev/shm` directories, and the sign-in
  sitting's own `/dev/shm` directory; never the Claude Code login directory, the workspace, another
  run or anything else under `$HOME`. A destructive subcommand refuses when `CLAUDECODE`,
  `BEETHOVEN_REQUEST_ID` (or its older name `ASHLEY_REQUEST_ID`) or a similar agent marker is in the
  environment, or when stdin is not a terminal. Added after the incident of 2026-09-28
  (`SECURITY.md`).
- **Claude Code's settings file, two keys.** `<claude_config_dir>/.claude.json` is read for
  `remoteDialogSeen` and the workspace's `hasTrustDialogAccepted` only, and rewritten only to seed
  `hasCompletedOnboarding`, `theme` and that trust key, only in the sign-in sitting or when a worker is
  about to start a session. The credentials file beside it is never opened.

The data disclosure the extension shows at first run and at each job start, in the report's words:
files the worker reads and every command's output are sent to Anthropic; while you are connected
through claude.ai the transcript is also stored on Anthropic's servers; a personal plan is retained
five years if model training is on and 30 days otherwise; no BAA covers a personal plan; FERPA records,
IRB data and export-controlled technical data must not be in the working directory; Remote Control
usage draws from your plan's shared limit. The extension refuses to start in a directory the student
has marked restricted (found by the existence rule, section 5), and when the CLI reports Remote
Control unavailable under Zero Data Retention.

## 8. Discovery

Phase 1 runs on the login node through the bootstrap shell, one command batch, under a second of CPU
and no network: `command -v` for the scheduler CLIs, the module list from a glob of `$MODULEPATH`
(`module -t avail`, 0.76 s of CPU on `warrior`, only with `--full`) filtered for
apptainer/singularity/podman/enroot, `srun --help | grep -c container-image` for Pyxis,
`/proc/sys/user/max_user_namespaces`, the proxy and temp environment variables, one
`sinfo -h -o '%P|%l|%a'`, `/etc/os-release` and `ldd --version`. Phase 2 is one probe job on the
default partition, ten minutes of wall time with every call inside the image on its own budget (they
sum to about five minutes, the egress checks to one more, so the job ends inside its wall time however
slow the node is; two probes of 2026-09-29 hit the earlier five-minute wall time), that prints the
node-local temp and `/dev/shm` sizes, tests that the image
runs (registry egress and user namespaces together), runs the `curl -m 10` matrix against the three
Anthropic hosts with and without the inherited proxy variables, and runs `claude --version`,
`claude auth status` and `claude remote-control --help` (for the flags the job uses) inside the
image. It runs no `claude remote-control` dry run and no sign-in dry run: what Claude Code says at
registration (the consent prompt, `Workspace not trusted`, `Couldn't verify Remote Control
eligibility`) and what the sign-in flow looks like at the site are known once signed in, from the
worker's own `rc.log` and from the first live sitting. The probe is not
optional: TACC hides the Apptainer module on login nodes, so `module avail` is negative there while
the runtime exists. A documentation-derived profile is kept as a seed only; for eight of twelve
sampled sites the documentation was silent on at least one of egress, runtime version or temp size,
and the probe overwrites it. Under the three-step flow the strip submits the probe once by itself
when no `probe.json` exists and waits for its verdict; *Run the probe job* under *Details* repeats it.

## 9. Held in reserve, not built this week

- **Custom connector relay.** A Cloudflare Worker exposing `submit_job`, `job_status` and
  `tail_output` as a remote MCP server with real OAuth (never `none`), relaying to the cluster-side
  state directory through a channel the student owns; every tool returns inside 240 seconds. For the
  narrower "ask Claude in a chat to check my job" use only, with the documented 10 to 30 percent
  spurious-failure rate stated. An Open OnDemand `/rnode/` URL behind SSO cannot be its target, because
  claude.ai must reach the server from `160.79.104.0/21` on the public internet.
- **Partner-site Open OnDemand app.** The Interactive App package above, for campuses whose
  administrators will install it; it gives a shell-free submission and a `connection.yml` the Files
  channel can read.
- **`/rnode/` fast path.** Where the proxy is on (check 9 returns 503), a small authenticated service
  inside the job for live tail and file transfer; mailbox mode through Files is the universal default,
  and is what Wayne State's login node answers (2026-09-29).
- **Self-hosted environments.** Anthropic's institutional design (runners on the cluster claiming
  sessions started from claude.ai/code), in public beta on Team and Enterprise only; the target if a
  department buys such a plan. The framework built here serves it.
- **A TTY-free `claude remote-control --headless`.** Requested upstream since March 2026 with no
  response. Open question 1 was answered yes on 2026-09-29 (02:22 UTC), so this is no longer a fallback the
  product needs; had it failed, this request, the partner-site app and the self-hosted runner would
  have been the fallbacks, not interception.
