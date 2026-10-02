// The files and commands the extension and the cluster-side framework (framework/, the
// `hpcworker` command) agree on. Everything the extension learns about a run it learns by reading
// these files through the portal's Files routes; the only commands it ever types are the ones
// listed here, one line at a time, through the portal's Shell app. If the framework moves a path
// or renames a field, change it here and in framework/ together. Written against framework
// version 2 (framework/VERSION; bin/hpcworker, lib/login_plain.sh, jobs/probe.sbatch,
// jobs/worker.sbatch.tpl, README.md as they stood on 2026-09-29) and checked against version 3 the
// same day: 3 moved none of the paths, fields or commands below (it lengthened the resume window
// to seven days, named the session after the worker rather than the job, and dropped the profile's
// email_domain, which the extension no longer reads). Framework 5 (the same evening) added the
// shared copy: a site profile may name "shared_install", a folder on the lab's volume holding the
// whole tool, maintained by the lab in one place; `hpcworker install --shared <that folder>` then
// sets up the account without copying code (a launcher, a marker, the profile, log/).
//
// Since 8.0.0 the extension sets up only the second mode below and carries no copy of the tool; the
// first is what a build before 8.0.0 left in an account, which the framework keeps running.
// Layout, in either of two modes:
//   the student's own copy (set up by a build before 8.0.0):
//   ~/.hpcworker/                             the installed tool (bin/, lib/, jobs/, profiles/)
//   ~/.hpcworker/VERSION                      the installed tool's integer version, shown under Details
//   the lab's shared copy (framework 5):
//   <shared_install>/                         bin/, lib/, jobs/, profiles/, VERSION, README.md, kept by the lab
//   ~/.hpcworker/shared                       the marker: one line naming <shared_install>; while it exists the account runs that copy
//   ~/.hpcworker/bin/hpcworker                a small launcher that runs <shared_install>/bin/hpcworker (a regular file, never a link)
//   in both:
//   ~/.hpcworker/profile.json                 the site profile; its shared_state_dir names the state directory
//   ~/.hpcworker/discover.json                `hpcworker discover --save` (optional)
//   <state_dir>/probe/probe.json              written by the probe job
//   <state_dir>/<name>/status.json            heartbeat every 30 s: state, job, node, message, session_name, requested_name, environment_url,
//                                             environment_id, claude_login, consent, consent_source, workspace_trusted, chain, next_job, chain_note
//   <state_dir>/<name>/connection.json        session_name, requested_name, environment_url, environment_id, node, job, pid, started_at,
//                                             token_path, workspace, permission_mode, capacity, next_job
//   <state_dir>/<name>/rc.log                 Claude Code's terminal (control codes and all)
//   <state_dir>/<name>/job.id                 the scheduler's job id of the link that was submitted by hand
//   <state_dir>/<name>/next.id                "<successor id> <parent id>": the job queued (afterany) to take over at the wall time
//   <state_dir>/<name>/stop                   the stop file: touch it and the job leaves on its own, cancels its successor and ends the chain
//   <state_dir>/<name>/stop.done              written by the job once it has left after a stop request
//   <state_dir>/workspaces/<name>/            the worker's working directory (never the home directory itself)
//   <state_dir>/workspaces/<name>/.restricted the student's own marker: a workspace so marked is never started
//   ~/.hpcworker/consent                      the framework's fallback consent marker; the extension writes it when the
//                                             student acknowledges the data statement ("yes <iso> <install id>")
// At Wayne State shared_state_dir is /rs/rs_grp_oschome/$USER/hpcworker (CephFS), not the home.
//
// Framework 10 (for Beethoven 11.0.0; docs/V11_CONTRACT.md is the wire contract, exact to the
// character, and wins over this comment where they differ) adds, without moving anything above:
//   <state_dir>/<name>/progress.log           one plain line per event: "<ISO-8601 UTC> <sentence>", from a fixed set (PROGRESS)
//   <state_dir>/<name>/node                   the compute node's short name, written by the job as its first act; removed by
//                                             `worker start` right after a submit, so a fresh one means "this job has a computer"
//   status.json state "queued"                written by `worker start` the moment the scheduler accepts the job, with submitted_at
//   status.json submitted_at, got_computer_at, online_at, ends_at, renewal, title, stop_reason, and, while queued,
//                                             scheduler_state, reason, expected_start, checked_at (from `worker status`)
//   the verbs  connect, worker status --json (v 1), worker restrict, claude consent --record, login-setup [--remove]
// Every 11.0.0 command line names the lab's shared copy by its full path (toolPath), never the
// launcher in ~/.hpcworker/bin, so that the first `connect` works on an account not set up yet.
//
// Whether a file exists is learned from the JSON listing of its directory (files[] names), never from
// a download: the Files app answers a download of a missing file with 200 and an HTML page.
//
// The extension never deletes anything on the cluster: it writes files, touches the stop file and
// types hpcworker's verbs. Removing a marker is done by the student in the portal's Files app. It
// never writes into a shared folder either: it only reads <shared_install>/VERSION to show it.
import { PRODUCT_NAME } from './terms';

export const FRAMEWORK_DIR = '.hpcworker';
export const HPCWORKER = `~/${FRAMEWORK_DIR}/bin/hpcworker`;
/** the second line of ~/.hpcworker/bin/hpcworker when it is the launcher of a shared copy (framework 5 LAUNCHER_TAG); a full copy of the tool has no such line */
export const LAUNCHER_TAG = '# hpcworker launcher for a shared copy (managed: "hpcworker install" rewrites this file)';
export const DEFAULT_WORKER_NAME = 'worker';
export const RESTRICTED_MARKER = '.restricted';

export const paths = {
  root: (home: string) => `${home}/${FRAMEWORK_DIR}`,
  bin: (home: string) => `${home}/${FRAMEWORK_DIR}/bin/hpcworker`,
  version: (home: string) => `${home}/${FRAMEWORK_DIR}/VERSION`,
  profile: (home: string) => `${home}/${FRAMEWORK_DIR}/profile.json`,
  discover: (home: string) => `${home}/${FRAMEWORK_DIR}/discover.json`,
  probe: (stateDir: string) => `${stateDir}/probe/probe.json`,
  run: (stateDir: string, name: string) => `${stateDir}/${name}`,
  status: (stateDir: string, name: string) => `${stateDir}/${name}/status.json`,
  connection: (stateDir: string, name: string) => `${stateDir}/${name}/connection.json`,
  rcLog: (stateDir: string, name: string) => `${stateDir}/${name}/rc.log`,
  jobId: (stateDir: string, name: string) => `${stateDir}/${name}/job.id`,
  nextId: (stateDir: string, name: string) => `${stateDir}/${name}/next.id`,
  stop: (stateDir: string, name: string) => `${stateDir}/${name}/stop`,
  stopDone: (stateDir: string, name: string) => `${stateDir}/${name}/stop.done`,
  workspace: (stateDir: string, name: string) => `${stateDir}/workspaces/${name}`,
  restrictedMarker: (stateDir: string, name: string) => `${stateDir}/workspaces/${name}/${RESTRICTED_MARKER}`,
  consent: (home: string) => `${home}/${FRAMEWORK_DIR}/consent`,
  /** the shared-copy marker `hpcworker install --shared` writes: one line, the shared folder */
  sharedMarker: (home: string) => `${home}/${FRAMEWORK_DIR}/shared`,
  /** the shared copy's own VERSION: the lab's copy is the one that counts (the package carries none) */
  sharedVersion: (dir: string) => `${dir}/VERSION`,
  /** framework 10: the run's plain-words event log (PROGRESS), read for Show log and Details only */
  progressLog: (stateDir: string, name: string) => `${stateDir}/${name}/progress.log`,
  /** framework 10 (written since framework 2, removed at submit since framework 10): one line, the compute node's short name */
  node: (stateDir: string, name: string) => `${stateDir}/${name}/node`,
};

/** the framework version that first has `connect`, status.json "queued", `worker status --json` v 1, `worker restrict`, `claude consent --record` and `login-setup` */
export const FRAMEWORK_CONNECT_VERSION = 10;

/**
 * The tool as every 11.0.0 command line names it: the lab's shared copy by its full path. `sharedDir`
 * has passed sharedRootOf (absolute; letters, digits and . _ + - only), so it needs no quoting.
 */
export function toolPath(sharedDir: string): string {
  return `${sharedDir}/bin/hpcworker`;
}

/** how `connect` treats the Claude sign-in (V11_CONTRACT.md, "connect") */
export type LoginMode = 'auto' | 'always' | 'fresh' | 'never';

export type PermissionMode = 'default' | 'acceptEdits' | 'plan';

/** what the extension hands `commands.connect`; every field is checked before it reaches a command line */
export interface ConnectOptions {
  /** the worker's name: ^[A-Za-z0-9_-]{1,32}$ */
  name: string;
  /** the site profile's name ("wayne"), for setting up an account that has none */
  site: string;
  /** this installation's 32 hex characters; given only when the data statement for this worker is in force (writes the Remote Control answer) */
  installId?: string;
  login: LoginMode;
  permissionMode: PermissionMode;
  /** "Keep my worker running": false adds --no-chain */
  chain: boolean;
}

const WORKER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const SITE_RE = /^[a-z0-9-]{1,32}$/;
const INSTALL_RE = /^[0-9a-f]{32}$/;
const MODES: readonly PermissionMode[] = ['default', 'acceptEdits', 'plan'];
const LOGINS: readonly LoginMode[] = ['auto', 'always', 'fresh', 'never'];

/**
 * The only line the portal page script will ever type into a terminal page (AM2): the login-setup
 * line and nothing else. The page script checks a line against this before it dispatches anything.
 */
export const LOGIN_SETUP_LINE_RE = /^bash (\/[A-Za-z0-9._+-]+)+\/bin\/hpcworker login-setup$/;

/** LOGIN_SETUP_LINE_RE, and the folder before /bin/hpcworker passes sharedRootOf (no "." or ".." segment) */
export function isLoginSetupLine(line: unknown): line is string {
  if (typeof line !== 'string' || !LOGIN_SETUP_LINE_RE.test(line)) return false;
  const dir = line.slice('bash '.length, line.length - '/bin/hpcworker login-setup'.length);
  return sharedRootOf(dir) === dir;
}

/** AM2's one-time key step has not yet been tried on the real grid by a student without a key: Details says so while this is false */
export const LOGIN_SETUP_PROVEN = false;

/**
 * A shared folder the extension will name on a command line: absolute, made of letters, digits and
 * . _ + - only, no "." or ".." segment. Anything else is not used (the site then reads as keeping no
 * shared copy, and nothing is set up), so no path from a profile or a marker is ever quoted around.
 */
export function sharedRootOf(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim().replace(/\/+$/, '');
  if (!/^(\/[A-Za-z0-9._+-]+)+$/.test(s)) return undefined;
  if (s.split('/').some((seg) => seg === '.' || seg === '..')) return undefined;
  return s;
}

/** the profile's "shared_install" (framework 5), when it names a usable folder */
export function sharedInstallFrom(profileJson: string | undefined): string | undefined {
  return sharedRootOf(parseProfile(profileJson)?.shared_install);
}

/** "/a/b/c" -> {dir: "/a/b", name: "c"}; what a listing-based existence check needs */
export function splitPath(abs: string): { dir: string; name: string } {
  const s = String(abs ?? '').replace(/\/+$/, '');
  const i = s.lastIndexOf('/');
  return { dir: i <= 0 ? '/' : s.slice(0, i), name: s.slice(i + 1) };
}

/** `$USER`, `${USER}`, `$HOME`, `${HOME}` and a leading `~` in a profile path, as the job's shell would expand them */
export function expandPath(raw: string, vars: { home: string; user: string }): string {
  return String(raw ?? '')
    .replace(/^~(?=\/|$)/, vars.home)
    .replace(/\$\{?USER\}?/g, vars.user)
    .replace(/\$\{?HOME\}?/g, vars.home)
    .replace(/\/+$/, '');
}

function parseProfile(profileJson: string | undefined): Record<string, unknown> | undefined {
  if (!profileJson) return undefined;
  try {
    const p = JSON.parse(profileJson) as unknown;
    return p && typeof p === 'object' ? (p as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** the state directory: the profile's shared_state_dir, else the tool's own folder */
export function stateDirFrom(profileJson: string | undefined, vars: { home: string; user: string }): string {
  const p = parseProfile(profileJson);
  const raw = p?.shared_state_dir;
  if (typeof raw === 'string' && raw) return expandPath(raw, vars);
  return paths.root(vars.home);
}

/** the profile's site name, the first half of the session name the framework asks for */
export function siteFrom(profileJson: string | undefined): string | undefined {
  const site = parseProfile(profileJson)?.site;
  return typeof site === 'string' ? site : undefined;
}

/**
 * Does the site profile mark a workspace restricted? The framework's schema (version 1) has no such
 * key yet; this reads `restricted_workspaces` (a list of worker names, or `"*"`) or `restricted: true`
 * if a later profile carries them, so a site can forbid workers without touching each workspace.
 */
export function profileRestricts(profileJson: string | undefined, workerName: string): boolean {
  const p = parseProfile(profileJson);
  if (!p) return false;
  if (p.restricted === true) return true;
  const list = p.restricted_workspaces;
  return Array.isArray(list) && list.some((x) => x === '*' || x === workerName);
}

/** single quotes and control characters cannot be typed into a quoted argument */
function safe(s: string): string {
  return String(s ?? '').replace(/['\r\n\x00-\x1f]/g, '');
}

/** The command lines the extension types, each exactly one line, each one of hpcworker's own verbs. */
export const commands = {
  /**
   * The lab's shared copy (framework 5), the only install the extension types: nothing is uploaded; the shared tool sets up the account
   * itself (launcher, marker, profile, the PATH block). `dir` has passed sharedRootOf, so it holds
   * no quote or space; the quotes are the same habit as every other argument here.
   */
  installShared: (dir: string, profile: string) => `bash '${safe(dir)}/bin/hpcworker' install --shared '${safe(dir)}' --profile '${safe(profile)}'`,
  /** the login-node phase-1 discovery (JSON); a one-line fallback when the tool is not installed yet */
  discover: () =>
    `bash ${HPCWORKER} discover 2>/dev/null || { echo "sched=$(command -v sbatch qsub bsub condor_submit 2>/dev/null | tr '\\n' ' ')"; echo "rt=$(command -v apptainer singularity podman enroot 2>/dev/null | tr '\\n' ' ')"; echo "userns=$(sysctl -n user.max_user_namespaces 2>/dev/null)"; echo "os=$(. /etc/os-release 2>/dev/null; echo $PRETTY_NAME)"; echo "glibc=$(ldd --version 2>/dev/null | head -1)"; echo "tmp=\${SLURM_TMPDIR:-}|\${TMPDIR:-}"; echo "proxy=\${https_proxy:-\${HTTPS_PROXY:-}}"; sinfo -h -o 'part=%P|%l|%a' 2>/dev/null | head -40; }`,
  /** submit the five-minute probe job; prints "probe job <id> submitted" */
  probe: () => `bash ${HPCWORKER} probe`,
  /** start (or find running) the named worker; prints "worker <name> submitted as job <id>" or "already has job <id>" */
  workerStart: (name: string, permissionMode: string) => `bash ${HPCWORKER} worker start --name '${safe(name)}' --permission-mode '${safe(permissionMode)}'`,
  /** the tool's stop: touches the stop file, waits for the job to leave, then one scancel if it did not (the job ends its own chain) */
  workerStop: (name: string) => `bash ${HPCWORKER} worker stop --name '${safe(name)}'`,
  /** the tool's own checks, one JSON document */
  diag: () => `bash ${HPCWORKER} diag --json`,
  /**
   * The one sitting a student can also type in the portal's own Shell tab: Claude Code's `auth login`,
   * then, if the student has not yet answered "Enable Remote Control?", `claude remote-control` once
   * in the workspace so they answer y and press Ctrl-C.
   */
  claudeLogin: `bash ${HPCWORKER} claude login`,
  /**
   * The same sitting in plain mode, the only interactive command the extension ever types, into the
   * login terminal inside its own panel: the framework prints machine-readable lines (LOGIN_LINES)
   * around Claude Code's own paste-code sign-in, the extension opens the AUTH-URL in a tab and types
   * the code the student pastes into the panel, and nothing else. The credential never passes
   * through the extension: Claude Code exchanges the code on the compute node.
   */
  claudeLoginPlain: `bash ${HPCWORKER} claude login --plain`,
  /** kept as an alias that explains; the login command covers it */
  claudeConsent: `bash ${HPCWORKER} claude consent`,

  // ---- 11.0.0 (framework 10). V11_CONTRACT.md, "Command lines". Each is exactly one line and names
  // the lab's shared copy by its full path. `connect` is the only interactive one: it is typed into an
  // open shell (shell.ts openShell) with `exec`, so the ssh session ends when connect ends and nothing
  // is left on the login node; the others go through the framed runShellCommand. Each builder throws
  // on an argument that fails its check, so a bad value never reaches a shell.

  connect(sharedDir: string, o: ConnectOptions): string {
    if (!sharedRootOf(sharedDir)) throw new Error('no usable shared copy');
    if (!WORKER_NAME_RE.test(o.name)) throw new Error('worker name must be letters, digits, _ or -');
    if (!SITE_RE.test(o.site)) throw new Error('site profile name must be lower-case letters, digits or -');
    if (o.installId !== undefined && !INSTALL_RE.test(o.installId)) throw new Error('installation id must be 32 hex characters');
    if (!LOGINS.includes(o.login)) throw new Error('unknown login mode');
    if (!MODES.includes(o.permissionMode)) throw new Error('unknown permission mode');
    return `exec bash '${toolPath(sharedDir)}' connect --name '${o.name}' --profile '${o.site}'${o.installId ? ` --consent '${o.installId}'` : ''} --login '${o.login}' --permission-mode '${o.permissionMode}'${o.chain ? '' : ' --no-chain'}`;
  },
  /** one JSON line (StatusJson); asks the scheduler once, and only while the run is queued */
  statusJson(sharedDir: string, name: string): string {
    if (!sharedRootOf(sharedDir) || !WORKER_NAME_RE.test(name)) throw new Error('bad status arguments');
    return `bash '${toolPath(sharedDir)}' worker status --name '${name}' --json`;
  },
  /** the tool's stop alone (the stop file, the job's own leaving, then one scancel if needed); prints "worker <name>: stopped (...)" */
  stop(sharedDir: string, name: string): string {
    if (!sharedRootOf(sharedDir) || !WORKER_NAME_RE.test(name)) throw new Error('bad stop arguments');
    return `bash '${toolPath(sharedDir)}' worker stop --name '${name}'`;
  },
  /** the restricted marker, written by the tool; prints "worker <name>: marked restricted ..." or "worker <name>: already marked restricted" */
  restrict(sharedDir: string, name: string): string {
    if (!sharedRootOf(sharedDir) || !WORKER_NAME_RE.test(name)) throw new Error('bad restrict arguments');
    return `bash '${toolPath(sharedDir)}' worker restrict --name '${name}'`;
  },
  /** the Remote Control answer alone, non-interactive (connect --consent does the same inside connect) */
  consentRecord(sharedDir: string, installId: string): string {
    if (!sharedRootOf(sharedDir) || !INSTALL_RE.test(installId)) throw new Error('bad consent arguments');
    return `bash '${toolPath(sharedDir)}' claude consent --record '${installId}'`;
  },
  /**
   * AM2: the one line the student's own terminal runs once (Beethoven types it for them, or they
   * paste it from the clipboard). Unquoted on purpose: the student may read it ("What does the line
   * do?"), and sharedRootOf has already refused anything that would need quotes. UNPROVEN ON THE
   * GRID until a student without a key has tried it (LOGIN_SETUP_PROVEN).
   */
  loginSetup(sharedDir: string): string {
    if (!sharedRootOf(sharedDir)) throw new Error('no usable shared copy');
    return `bash ${toolPath(sharedDir)} login-setup`;
  },
};

/**
 * The lines `hpcworker claude login --plain` prints for the extension (framework/lib/login_plain.sh),
 * one per line, at the start of a line (terminal codes stripped first): "HPCW-LOGIN: <progress>"
 * (informational; "paste the code from that page" is the cue for the panel's box), "AUTH-URL: <url>"
 * (open it in a tab; the student signs in there and gets a code), "SIGNED-IN <email> <plan>" (done),
 * "HPCW-LOGIN-FAILED: <sentence>" (the rest of the line says why). Claude Code's own screen is never
 * copied to that output; anything else that arrives is the shell's own text and is only shown.
 */
export const LOGIN_LINES = {
  started: /^HPCW-LOGIN\b(?!-(?:FAILED|DRY))/,
  authUrl: /^AUTH-URL:\s*(\S+)/,
  signedIn: /^SIGNED-IN\b/,
  failed: /^HPCW-LOGIN-FAILED\b/,
  /** the framework's cue, or Claude Code's own prompt when a shell shows it, so the panel focuses its box */
  codePrompt: /Paste code here|paste the code from that page/i,
};

/** the only pages the login terminal ever opens: Anthropic's own sign-in pages on claude.ai or claude.com, over https */
export function isClaudeAuthUrl(url: string | undefined): url is string {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'claude.ai' || h === 'claude.com' || h.endsWith('.claude.ai') || h.endsWith('.claude.com');
  } catch {
    return false;
  }
}

export type LoginEvent = { kind: 'started'; detail: string } | { kind: 'auth-url'; url: string } | { kind: 'signed-in'; detail: string } | { kind: 'failed'; detail: string } | { kind: 'code-prompt' };

/** what one complete, cleaned line of the plain login means, or undefined when it is ordinary terminal text */
export function parseLoginLine(line: string): LoginEvent | undefined {
  const l = String(line ?? '').trim();
  if (!l) return undefined;
  if (LOGIN_LINES.failed.test(l)) return { kind: 'failed', detail: l.replace(LOGIN_LINES.failed, '').replace(/^[:\s-]+/, '').trim() };
  if (LOGIN_LINES.signedIn.test(l)) return { kind: 'signed-in', detail: l.replace(LOGIN_LINES.signedIn, '').replace(/^[:\s-]+/, '').trim() };
  const url = LOGIN_LINES.authUrl.exec(l)?.[1];
  if (url) return { kind: 'auth-url', url };
  if (LOGIN_LINES.codePrompt.test(l)) return { kind: 'code-prompt' };
  if (LOGIN_LINES.started.test(l)) return { kind: 'started', detail: l.replace(LOGIN_LINES.started, '').replace(/^[:\s-]+/, '').trim() };
  return undefined;
}

// ---- framework 10: the lines `hpcworker connect` prints (V11_CONTRACT.md, "connect") --------------

/**
 * The keepalive: printed as a whole line at least every 20 s while connect waits on anything in its
 * sign-in part (the computer for the sitting, the link, the code), and only under connect (`claude
 * login --plain`, which 10.0.0 types, stays silent as in framework 9). It keeps the portal's shell
 * from closing an idle connection (OOD counts output as activity; OOD_SHELL_INACTIVE_TIMEOUT_MS is
 * 300 s by default). The extension ignores it, and removes it wherever it appears in a line in case
 * it was glued to another line's text.
 */
export const KEEPALIVE_LINE = 'HPCW-LOGIN: still waiting';

/** the failure codes of `HPCW-STEP failed <code> <sentence>`; anything else reads as "other" */
export type StepFailCode = 'usage' | 'setup' | 'restricted' | 'refused' | 'signin-node' | 'signin-code' | 'signin-timeout' | 'signin' | 'other';

const FAIL_CODES: readonly StepFailCode[] = ['usage', 'setup', 'restricted', 'refused', 'signin-node', 'signin-code', 'signin-timeout', 'signin', 'other'];

/** connect's exit status for each failure code (0 for "HPCW-STEP done"); the extension reads the line, a person at a terminal the status */
export const STEP_EXIT: Record<StepFailCode | 'done', number> = { done: 0, other: 1, usage: 2, setup: 3, restricted: 4, refused: 5, 'signin-node': 6, 'signin-code': 7, 'signin-timeout': 7, signin: 7 };

/** one `HPCW-STEP` line, parsed */
export type StepEvent =
  /** "HPCW-STEP setup ready" (the account already used the shared copy) or "HPCW-STEP setup changed" (connect set it up now) */
  | { step: 'setup'; changed: boolean }
  /** "HPCW-STEP consent": the Remote Control answer is in ~/.hpcworker/consent (written by this connect) */
  | { step: 'consent' }
  /** "HPCW-STEP queued <job> new [<run dir>]" (submitted now) or "... kept [<run dir>]" (the run already had a live job; nothing submitted) */
  | { step: 'queued'; job: string; fresh: boolean; runDir?: string }
  /** "HPCW-STEP signin": connect is asking for the computer the Claude sign-in runs on */
  | { step: 'signin' }
  /** "HPCW-STEP signed-in <email> <plan>": "-" in either place reads as undefined */
  | { step: 'signed-in'; email?: string; plan?: string }
  /** "HPCW-STEP done": the last line on success */
  | { step: 'done' }
  /** "HPCW-STEP failed <code> <sentence>": the last line on failure; the sentence is for Details and Show log's raw view only */
  | { step: 'failed'; code: StepFailCode; detail: string };

export const STEP_RE = {
  setup: /^HPCW-STEP setup(?: (ready|changed))?$/,
  consent: /^HPCW-STEP consent$/,
  queued: /^HPCW-STEP queued ([0-9]+) (new|kept)(?: (.+))?$/,
  signin: /^HPCW-STEP signin$/,
  signedIn: /^HPCW-STEP signed-in (\S+) (\S+)$/,
  done: /^HPCW-STEP done$/,
  failed: /^HPCW-STEP failed ([a-z-]+)(?: (.*))?$/,
};

const dash = (s: string | undefined): string | undefined => (s && s !== '-' ? s : undefined);

/** one cleaned line (terminal codes stripped, trimmed) -> its step, or undefined when it is not an HPCW-STEP line of this grammar */
export function parseStepLine(line: string): StepEvent | undefined {
  const l = String(line ?? '').trim();
  if (!l.startsWith('HPCW-STEP ')) return undefined;
  let m: RegExpExecArray | null;
  if ((m = STEP_RE.setup.exec(l))) return { step: 'setup', changed: m[1] === 'changed' };
  if (STEP_RE.consent.test(l)) return { step: 'consent' };
  if ((m = STEP_RE.queued.exec(l))) return { step: 'queued', job: m[1]!, fresh: m[2] === 'new', ...(m[3] ? { runDir: m[3] } : {}) };
  if (STEP_RE.signin.test(l)) return { step: 'signin' };
  if ((m = STEP_RE.signedIn.exec(l))) return { step: 'signed-in', email: dash(m[1]), plan: dash(m[2]) };
  if (STEP_RE.done.test(l)) return { step: 'done' };
  if ((m = STEP_RE.failed.exec(l))) {
    const code = (FAIL_CODES as readonly string[]).includes(m[1]!) ? (m[1] as StepFailCode) : 'other';
    return { step: 'failed', code, detail: (m[2] ?? '').trim() };
  }
  return undefined;
}

/** the keepalive alone on its line */
export function isKeepaliveLine(line: string): boolean {
  return String(line ?? '').trim() === KEEPALIVE_LINE;
}

/** a line with any glued keepalive removed (the defensive half of the one-writer rule) */
export function withoutKeepalive(line: string): string {
  return String(line ?? '').split(KEEPALIVE_LINE).join('').trim();
}

/** what one cleaned line of a connect sitting means to the extension */
export type ConnectEvent =
  | { kind: 'step'; step: StepEvent }
  | { kind: 'keepalive' }
  /** "HPCW-LOGIN: requesting a compute node": the wait for the sign-in computer begins */
  | { kind: 'signin-wait' }
  /** "HPCW-LOGIN: on <host>; checking whether you are signed in already": the sign-in has its computer */
  | { kind: 'signin-node' }
  /** "AUTH-URL: <url>": only an https link on claude.ai or claude.com (isClaudeAuthUrl) is reported; anything else is "refused-url" */
  | { kind: 'auth-url'; url: string }
  | { kind: 'refused-url' }
  /** "HPCW-LOGIN: paste the code from that page" (or Claude Code's own "Paste code here"): focus the box */
  | { kind: 'code-prompt' }
  /** "HPCW-LOGIN: code received, checking" */
  | { kind: 'code-received' }
  /** "HPCW-LOGIN: that code was not accepted; paste it again" */
  | { kind: 'code-rejected' }
  /** "SIGNED-IN <email> <plan>" from the sitting; connect follows it with "HPCW-STEP signed-in", which is the one the extension acts on */
  | { kind: 'signed-in'; email?: string; plan?: string }
  /** "HPCW-LOGIN-FAILED: <sentence>"; connect follows it with "HPCW-STEP failed signin…" */
  | { kind: 'login-failed'; detail: string }
  /** any other HPCW-LOGIN progress line */
  | { kind: 'progress'; detail: string };

/** one cleaned line of a connect sitting -> its event, or undefined for ordinary terminal text (never shown to a student) */
export function parseConnectLine(line: string): ConnectEvent | undefined {
  const raw = String(line ?? '').trim();
  if (!raw) return undefined;
  if (raw === KEEPALIVE_LINE) return { kind: 'keepalive' };
  const l = withoutKeepalive(raw);
  if (!l) return { kind: 'keepalive' };
  const step = parseStepLine(l);
  if (step) return { kind: 'step', step };
  if (/^HPCW-LOGIN: requesting a compute node\b/.test(l)) return { kind: 'signin-wait' };
  if (/^HPCW-LOGIN: on \S+; /.test(l)) return { kind: 'signin-node' };
  if (/^HPCW-LOGIN: code received, checking\b/.test(l)) return { kind: 'code-received' };
  if (/^HPCW-LOGIN: that code was not accepted\b/.test(l)) return { kind: 'code-rejected' };
  const ev = parseLoginLine(l);
  if (!ev) return undefined;
  switch (ev.kind) {
    case 'auth-url':
      return isClaudeAuthUrl(ev.url) ? { kind: 'auth-url', url: ev.url } : { kind: 'refused-url' };
    case 'code-prompt':
      return { kind: 'code-prompt' };
    case 'signed-in': {
      const [email, plan] = ev.detail.split(/\s+/);
      return { kind: 'signed-in', email: dash(email), plan: dash(plan) };
    }
    case 'failed':
      return { kind: 'login-failed', detail: ev.detail };
    case 'started':
      return { kind: 'progress', detail: ev.detail };
  }
}

/**
 * A code the student pasted, as the extension will type it: trimmed, printable ASCII without spaces,
 * 8 to 512 characters. Anything else is not typed ("That code didn't work. Copy it again from the
 * Claude tab."). The code is typed once into the sitting and forgotten: never stored, logged or shown.
 */
export function plausibleCode(code: unknown): string | undefined {
  const c = String(code ?? '').trim();
  return /^[\x21-\x7e]{8,512}$/.test(c) ? c : undefined;
}

/** the Claude plans Remote Control works on; "-" or nothing (unknown) is not refused */
export function planAllowsRemoteControl(plan: string | undefined): boolean {
  if (!plan || plan === '-') return true;
  return ['pro', 'max', 'team', 'enterprise'].includes(plan.toLowerCase());
}

/** "max" -> "Max": the plan as the panel says it ("Signed in as alex@wayne.edu · Max") */
export function planWord(plan: string | undefined): string | undefined {
  if (!plan || plan === '-') return undefined;
  const p = plan.toLowerCase();
  const known: Record<string, string> = { max: 'Max', pro: 'Pro', team: 'Team', enterprise: 'Enterprise', free: 'Free' };
  return known[p] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

// ---- framework 10: the scheduler's reason, in three classes (V11_CONTRACT.md, "Waiting") -----------

/** "line": an ordinary wait; "share": the account's own limits; "maintenance": nodes held back or a reservation */
export type ReasonClass = 'line' | 'share' | 'maintenance';

/** Slurm's %r -> its class. Unknown reasons are an ordinary wait. */
export function reasonClass(reason: string | undefined): ReasonClass {
  const r = String(reason ?? '').trim();
  if (/^(QOS(Max|Grp)|Assoc(Grp|Max))/.test(r)) return 'share';
  if (/^ReqNodeNotAvail|Reserv/i.test(r)) return 'maintenance';
  return 'line';
}

// ---- framework 10: progress.log (V11_CONTRACT.md, "progress.log") ---------------------------------

/** the fixed sentences of progress.log, by kind; `arg` is the rest of the line after "<sentence>: " where a kind has one */
export type ProgressKind = 'asked' | 'got-computer' | 'connecting' | 'online' | 'waiting-signin' | 'reconnecting' | 'renewing' | 'ended' | 'stopped' | 'signin-abandoned' | 'error';

export const PROGRESS: Record<ProgressKind, string> = {
  asked: 'Asked the grid for a computer',
  'got-computer': 'Got a computer',
  connecting: 'Connecting to Claude',
  /** followed by ": <environment link>" */
  online: 'Online',
  'waiting-signin': 'Waiting for your Claude sign-in',
  reconnecting: 'Reconnecting',
  renewing: 'Renewing',
  ended: 'Ended',
  stopped: 'Stopped',
  'signin-abandoned': 'Stopped: waiting for your Claude sign-in timed out',
  /** followed by ": <the job's message>" (Details only; Show log says "Couldn't start") */
  error: "Couldn't start",
};

export interface ProgressLine {
  /** ISO-8601 UTC */
  at: string;
  kind: ProgressKind;
  /** the link after "Online: ", or the message after "Couldn't start: " */
  arg?: string;
}

/** one line of progress.log -> its event, or undefined for a line outside the fixed set (shown in Details only) */
export function parseProgressLine(line: string): ProgressLine | undefined {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ) (.+)$/.exec(String(line ?? '').trim());
  if (!m) return undefined;
  const at = m[1]!;
  const text = m[2]!;
  // longest sentences first: "Stopped: waiting ..." before "Stopped"
  const kinds = (Object.keys(PROGRESS) as ProgressKind[]).sort((a, b) => PROGRESS[b].length - PROGRESS[a].length);
  for (const kind of kinds) {
    const s = PROGRESS[kind];
    if (text === s) return { at, kind };
    if ((kind === 'online' || kind === 'error') && text.startsWith(`${s}: `)) return { at, kind, arg: text.slice(s.length + 2) };
  }
  return undefined;
}

// ---- framework 10: login-setup (AM2; V11_CONTRACT.md, "login-setup"). UNPROVEN ON THE GRID. -------

/** the success line of `login-setup`, exactly */
export const LOGIN_SETUP_DONE = 'Done. The grid will not ask again.';
/** the success lines of `login-setup --remove`, exactly */
export const LOGIN_SETUP_REMOVED = "Done. Removed Beethoven's grid key.";
export const LOGIN_SETUP_NOTHING = 'Nothing to remove.';

/** the last non-empty line of login-setup's output says how it ended; only LOGIN_SETUP_DONE is success */
export function loginSetupOutcome(output: string): { done: boolean; line: string } {
  const lines = String(output ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  const line = lines[lines.length - 1] ?? '';
  return { done: line === LOGIN_SETUP_DONE, line };
}

// ---- framework 10: the site profile's keys the extension reads (V11_CONTRACT.md, "Site profile") ---

export interface SiteProfile {
  site?: string;
  display_name?: string;
  /** the portal the welcome page offers ("https://ondemand.grid.wayne.edu") */
  ood_base_url?: string;
  /** the Shell app host; "" lets the portal pick its default ("default") */
  ood_shell_host?: string;
  /** "http-basic" | "cookie": a hint only; the channel test decides at run time */
  ood_auth?: string;
  vpn_required?: boolean;
  /** the VPN's portal address the student types into the VPN app ("protect.wayne.edu") */
  vpn_portal?: string;
  /** the VPN app's name ("GlobalProtect") */
  vpn_app?: string;
  vpn_help_url?: string;
  grid_account_help_url?: string;
  /** the Remote Control session title ("Wayne State grid") */
  session_title?: string;
  /** seconds a job waits in need_login before it stops itself and queues no successor */
  login_abandon_s?: number;
  shared_install?: string;
  shared_state_dir?: string;
  submit_host?: string;
  worker_defaults?: { hours?: number; capacity?: number; permission_mode?: string };
  /** 12.0.0 (framework 11): the grid's ssh door, its host key pin, a relay if the lab runs one, and the Google Authenticator help page */
  ssh_host?: string;
  ssh_port?: number;
  ssh_host_key?: string;
  ssh_relay?: { url?: string; ticket_url?: string } | null;
  grid_2fa_help_url?: string;
}

/** a bundled or downloaded profile.json -> its keys, or undefined when it does not parse */
export function siteProfileFrom(profileJson: string | undefined): SiteProfile | undefined {
  return parseProfile(profileJson) as SiteProfile | undefined;
}

/** the session title for a worker: the profile's title, with " · <name>" for a worker not named "worker" (framework 10 asks Claude Code for the same) */
export function sessionTitleFor(profileTitle: string | undefined, workerName: string): string {
  const base = profileTitle || 'Grid worker';
  return workerName === DEFAULT_WORKER_NAME ? base : `${base} · ${workerName}`;
}

/**
 * status.json "state". "queued" is framework 10's: `worker start` writes it the moment the scheduler
 * accepts the job, before the job has a computer; the job's own first write replaces it. (A 10.0.0
 * extension does not know "queued" and treats it as not live: see V11_CONTRACT.md, "What framework 10
 * keeps for 10.0.0".)
 */
export type WorkerState = 'queued' | 'starting' | 'need_login' | 'need_consent' | 'running' | 'online' | 'stopped' | 'preempted' | 'error' | 'unknown';

/** why a worker is "stopped" (framework 10): the student's stop, or the job gave up waiting for the Claude sign-in (login_abandon_s) */
export type StopReason = 'request' | 'login_abandoned';

/** where the framework found the student's Remote Control answer: Claude Code's own settings file, a marker file, or nowhere */
export type ConsentSource = 'claude_config' | 'marker' | 'none' | string;

/** the consent source in the student's words (never the value itself) */
export function consentSourceWords(src: ConsentSource | undefined): string {
  if (src === 'claude_config') return 'recorded by Claude Code itself';
  if (src === 'marker') return `recorded from your data statement (the marker file ${PRODUCT_NAME} wrote)`;
  if (src === 'none') return 'not recorded';
  return src ? 'recorded' : '';
}

/** status.json as worker.sbatch.tpl writes it */
export interface StatusFile {
  version?: number;
  site?: string;
  run?: string;
  /** the current job of the chain (a successor has a new id) */
  job?: string;
  node?: string;
  pid?: number | string;
  state: WorkerState;
  message?: string;
  /** the one thing the student must do now, as the job sees it: login, consent, or nothing */
  needs?: 'login' | 'consent' | 'nothing' | string;
  /** one sentence for that, in the job's words */
  hint?: string;
  started_at?: string;
  updated_at?: string;
  /** the name Claude Code printed at registration (e.g. asx10-hazy-meadow); until then the requested one */
  session_name?: string;
  /** what the job asked Claude Code for with --name: framework 10's session title ("Wayne State grid"); framework 9 wrote "<site>-<jobid>" */
  requested_name?: string;
  /** https://claude.ai/code?environment=env_...: stable per machine id, so every job on this login opens the same environment */
  environment_url?: string;
  /** the env_... part of environment_url */
  environment_id?: string;
  /** older name of environment_url; the job writes both */
  session_url?: string;
  /** loggedIn, email, subscriptionType and nothing else: never a token */
  claude_login?: { loggedIn?: boolean; email?: string; subscriptionType?: string; checked_at?: string };
  consent?: boolean;
  consent_source?: ConsentSource;
  /** the workspace's hasTrustDialogAccepted is on record in Claude Code's settings file */
  workspace_trusted?: boolean;
  rc_alive?: boolean;
  resumed?: boolean;
  tmux?: boolean;
  restarts?: number;
  /** the worker is always on: each job queues its successor before it ends */
  chain?: boolean;
  /** the job queued to take over at this one's wall time ("" until queued) */
  next_job?: string;
  chain_note?: string;
  workspace?: string;
  rc_log?: string;
  token_path?: string;
  /** framework 9: the host's Slurm client is bound into the worker's container */
  scheduler_in_worker?: boolean;
  scheduler_note?: string;

  // ---- framework 10 (V11_CONTRACT.md, "status.json"); every time is ISO-8601 UTC, "YYYY-MM-DDTHH:MM:SSZ"
  /** when the scheduler accepted the job named in `job` (written by `worker start` with state "queued"; kept by the job) */
  submitted_at?: string;
  /** when the job named in `job` began on its node (the same instant the `node` file is written); equal to started_at for a framework 10 job */
  got_computer_at?: string;
  /** when this job's Remote Control first registered (state online with a link); "" until then */
  online_at?: string;
  /** when this job's wall time ends (got_computer_at + hours): "Renews itself at" when chain is on */
  ends_at?: string;
  /** true when this job was queued by its predecessor in the always-on chain, not by a person's start: no queue clock, no "ready N min after you asked" */
  renewal?: boolean;
  /** the session title asked of Claude Code with --name: the profile's session_title, or "<session_title> · <name>" for a worker not named "worker" */
  title?: string;
  /** state "stopped" only: why */
  stop_reason?: StopReason;
  /** written by `worker status` while state is "queued" (and only then): Slurm's %T, verbatim (PENDING, RUNNING, CONFIGURING ...), or "GONE" when squeue no longer lists the job */
  scheduler_state?: string;
  /** Slurm's %r, verbatim (Priority, Resources, None, QOSMaxJobsPerUserLimit, AssocGrpCPULimit, ReqNodeNotAvail, ...); "" when none */
  reason?: string;
  /** Slurm's %S as ISO-8601 UTC, or "" when Slurm gives N/A, Unknown, or a time not in the future */
  expected_start?: string;
  /** when `worker status` asked the scheduler */
  checked_at?: string;
}

/** `hpcworker worker status --name N --json` (framework 10, v 1): one JSON object on one line */
export interface StatusJson {
  v: 1;
  run: string;
  /** job.id ("" when none) */
  job: string;
  /** the queued successor (next.id's first field), "" when none */
  next_job: string;
  /** the state directory, expanded */
  state_dir: string;
  /** status.json after any update this call made, or null when there is none yet */
  status: StatusFile | null;
  connection: ConnectionFile | null;
  /** what this call learned from its one squeue, or null when it did not ask (the run was not queued) */
  scheduler: {
    state: string;
    reason: string;
    expected_start: string;
    node: string;
    checked_at: string;
  } | null;
  /** the person-facing first line `worker status` prints without --json ("Your worker is in line for a computer (6 min so far).") */
  line: string;
}

/** the JSON line of `worker status --json`, or undefined when the output holds none (the first line starting with "{" is read) */
export function parseStatusJson(output: string): StatusJson | undefined {
  for (const raw of String(output ?? '').split('\n')) {
    const l = raw.trim();
    if (!l.startsWith('{')) continue;
    try {
      const j = JSON.parse(l) as StatusJson;
      if (j && typeof j === 'object' && j.v === 1 && typeof j.run === 'string') return j;
    } catch {
      /* not this line */
    }
  }
  return undefined;
}

/** connection.json as worker.sbatch.tpl writes it */
export interface ConnectionFile {
  session_name?: string;
  requested_name?: string;
  environment_url?: string;
  environment_id?: string;
  /** older name of environment_url; the job writes both */
  session_url?: string;
  node?: string;
  job?: string;
  pid?: number | string;
  started_at?: string;
  token_path?: string;
  workspace?: string;
  rc_log?: string;
  permission_mode?: string;
  capacity?: string;
  resumed?: boolean;
  next_job?: string;
  /** framework 10: the session title asked for (as in status.json) */
  title?: string;
  /** framework 10: when this job's Remote Control first registered */
  online_at?: string;
}

/** probe.json as probe.sbatch writes it; every field optional because a partial probe still tells a story */
export interface ProbeFile {
  version?: number;
  when?: string;
  job?: string;
  hostname?: string;
  os?: string;
  glibc?: string;
  node_tmp?: { path?: string; ok?: boolean; free_gb?: number; fs?: string; device?: string };
  tmpdir?: { value?: string; fs?: string; device?: string; node_local?: boolean };
  dev_shm?: { size_kb?: number; free_kb?: number; writable?: boolean };
  user_namespaces?: { max?: number; unshare_works?: boolean };
  run_user_dir?: { path?: string; present?: boolean };
  xdg_fix?: { dir?: string; host_writable?: boolean; in_image?: string | boolean };
  tmux?: { present?: boolean; version?: string };
  script_present?: boolean;
  /** the node can submit jobs itself (the always-on chain needs it) */
  sbatch_on_node?: boolean;
  runtime?: { ok?: boolean; name?: string; bin?: string; module?: string; version?: string };
  image?: { type?: string; path?: string; node_version?: string; claude_version?: string; first_exec_seconds?: number; curl_api_from_image?: string };
  remote_control_flags?: string;
  remote_control_help_head?: string;
  claude_auth?: { loggedIn?: boolean; subscriptionType?: string; email?: string; authMethod?: string; config_dir_present?: boolean };
  /** the student's answer to "Enable Remote Control?" is on record (Claude Code's own remoteDialogSeen, or the marker file) */
  consent_recorded?: boolean;
  /** where the answer was read from: claude_config (Claude Code's settings file), marker, or none */
  consent_source?: ConsentSource;
  /** the worker workspace's hasTrustDialogAccepted is on record */
  workspace_trusted?: boolean;
  /** the sign-in sitting's dry run, when a probe ran one (framework 2 records it as not tried: the sitting itself is the test); never the link */
  login_flow?: { tried?: boolean; url_seen?: boolean; prompt_seen?: boolean; select_seen?: boolean; enters?: number; seconds?: number };
  egress?: {
    class?: 'direct' | 'http-proxy-auto' | 'http-proxy-module' | 'none' | string;
    inherited_proxy?: Record<string, string>;
    with_inherited_env?: Record<string, string>;
    without_proxy_vars?: Record<string, string>;
    'statsig.anthropic.com'?: string;
  };
}

const reached = (code: string | number | undefined) => {
  const n = Number(code);
  return Number.isFinite(n) && n > 0;
};

/** what probe.json says about the compute node, in one verdict, for check 11 and the strip alike */
export function probeVerdict(p: ProbeFile): { ok: boolean; detail: string; reason?: string; warn: boolean } {
  const e = p.egress ?? {};
  const bare = e.without_proxy_vars ?? {};
  const env = e.with_inherited_env ?? {};
  const reach = ['api.anthropic.com', 'platform.claude.com', 'claude.ai'].map((h) => `${h} ${env[h] ?? '?'}${bare[h] !== undefined && bare[h] !== env[h] ? ` (bare ${bare[h]})` : ''}`).join(', ');
  const okEgress = e.class ? e.class !== 'none' : (reached(env['api.anthropic.com']) || reached(bare['api.anthropic.com'])) && (reached(env['platform.claude.com']) || reached(bare['platform.claude.com']));
  const detail = `${p.when ? `probe of ${p.when.slice(0, 16)}` : 'probe'} on ${p.hostname ?? '?'}: node temp ${p.node_tmp?.ok ? `${p.node_tmp.free_gb ?? '?'} GB free` : 'NOT usable'}, /dev/shm ${p.dev_shm?.writable ? `${Math.round((p.dev_shm.free_kb ?? 0) / 1e6)} GB free` : 'not writable'}, user namespaces ${p.user_namespaces?.unshare_works ? 'yes' : 'no'}, container ${p.runtime?.ok ? 'runs' : 'FAILS'}, egress ${e.class ?? '?'} (${reach})${e['statsig.anthropic.com'] && /no DNS/i.test(e['statsig.anthropic.com']) ? '; statsig.anthropic.com has no DNS record here' : ''}`;
  if (!p.runtime?.ok) return { ok: false, detail: `${detail}. The container runtime could not run the image on the compute node.`, reason: 'The container could not run on the compute node.', warn: false };
  if (!okEgress) return { ok: false, detail: `${detail}. Compute nodes cannot reach api.anthropic.com or platform.claude.com; ask your centre for an HTTP proxy (Claude Code refuses SOCKS).`, reason: 'Compute nodes cannot reach Anthropic from your cluster; ask your research computing centre about an HTTP proxy.', warn: false };
  if (!p.node_tmp?.ok) return { ok: false, detail: `${detail}. The node-local temp directory named by the profile is not usable.`, reason: 'The node-local temp directory is not usable on the compute node.', warn: false };
  const chain = p.sbatch_on_node === false ? '; the node cannot submit jobs itself, so a worker there runs one job at a time instead of staying on' : '';
  return { ok: true, detail: `${detail}${p.tmux?.present ? '' : '; no tmux on the node (script -qfc is the fallback)'}${chain}`, warn: !p.tmux?.present || p.sbatch_on_node === false };
}

/** what the checks need from `hpcworker discover` (or the one-line fallback) */
export interface Discovery {
  /** the login node the shell reached (hostname -s), when the tool answered */
  host?: string;
  scheduler?: string;
  runtime?: string;
  modules?: string;
  pyxis?: boolean;
  user_namespaces?: number;
  os?: string;
  glibc?: string;
  tmp?: string;
  proxy?: string;
  partitions?: string[];
  tmux?: boolean;
  python3?: boolean;
}

/** Parse `hpcworker discover` JSON or the one-line fallback's key=value output. */
export function parseDiscovery(text: string): Discovery {
  const t = String(text ?? '').trim();
  const start = t.indexOf('{');
  if (start >= 0) {
    try {
      const j = JSON.parse(t.slice(start)) as Record<string, unknown>;
      const sched = j.scheduler as { family?: string } | string | undefined;
      const rt = j.runtime as { candidates?: Array<{ name?: string }>; modules?: string[]; pyxis?: boolean; user_namespaces?: { max?: number } | number } | undefined;
      const parts = j.partitions as Array<{ name?: string; timelimit?: string; avail?: string }> | undefined;
      const tools = j.tools as { tmux?: string; python3?: string } | undefined;
      const env = j.env as { TMPDIR?: string; SLURM_TMPDIR?: string; https_proxy?: string } | undefined;
      const ns = rt?.user_namespaces;
      return {
        host: typeof j.host === 'string' && j.host ? j.host : undefined,
        scheduler: typeof sched === 'string' ? sched : sched?.family || undefined,
        runtime: rt?.candidates?.map((c) => c.name).filter(Boolean).join(' ') || undefined,
        modules: rt?.modules?.join(' ') || undefined,
        pyxis: rt?.pyxis,
        user_namespaces: typeof ns === 'number' ? ns : ns?.max,
        os: typeof j.os === 'string' ? j.os : undefined,
        glibc: typeof j.glibc === 'string' ? j.glibc : undefined,
        tmp: env ? `${env.SLURM_TMPDIR ?? ''}|${env.TMPDIR ?? ''}` : undefined,
        proxy: env?.https_proxy || undefined,
        partitions: parts?.map((p) => `${p.name ?? '?'}|${p.timelimit ?? ''}|${p.avail ?? ''}`),
        tmux: tools ? !!tools.tmux : undefined,
        python3: tools ? !!tools.python3 : undefined,
      };
    } catch {
      /* not the tool's JSON: fall through to key=value */
    }
  }
  const d: Discovery = { partitions: [] };
  for (const line of t.split('\n')) {
    const m = /^(\w+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const k = m[1] ?? '';
    const v = m[2] ?? '';
    if (k === 'sched') d.scheduler = v.includes('sbatch') ? 'slurm' : v.includes('qsub') ? 'pbs' : v.includes('bsub') ? 'lsf' : v.includes('condor_submit') ? 'htcondor' : v.trim() ? v.trim() : undefined;
    else if (k === 'rt') d.runtime = v.trim() ? v.trim().split(/\s+/).map((p) => p.split('/').pop()).join(' ') : undefined;
    else if (k === 'userns') d.user_namespaces = v.trim() ? Number(v) : undefined;
    else if (k === 'os') d.os = v.trim() || undefined;
    else if (k === 'glibc') d.glibc = v.trim() || undefined;
    else if (k === 'tmp') d.tmp = v;
    else if (k === 'proxy') d.proxy = v.trim() || undefined;
    else if (k === 'part') d.partitions!.push(v);
  }
  return d;
}

/**
 * The job id in a submit answer: hpcworker's sentences (a fresh submission, a worker that already
 * has a job, a probe that is still queued or running so nothing was submitted), `job=123`,
 * `123;cluster` (sbatch --parsable), or a bare number.
 */
export function parseJobId(output: string): string | undefined {
  const s = String(output ?? '');
  const m =
    /submitted as job\s+([0-9]+)/i.exec(s) ??
    /already has job\s+([0-9]+)/i.exec(s) ??
    /probe job\s+([0-9]+)\s+submitted/i.exec(s) ??
    /probe job\s+([0-9]+)\s+is still/i.exec(s) ??
    /\bjob=([0-9]+)/.exec(s) ??
    /Submitted batch job\s+([0-9]+)/.exec(s) ??
    /^\s*([0-9]+)(?:;[\w.-]+)?\s*$/m.exec(s);
  return m ? m[1] : undefined;
}

/**
 * "<site>-<jobid>": the name framework 9 asked Claude Code for with `--name` (framework 10 asks for the
 * profile's session title, sessionTitleFor). Kept for reading a framework 9 worker's files; 11.0.0 does
 * not call it. Claude Code 2.1.283 names the session itself at registration (asx10-hazy-meadow).
 */
export function sessionName(site: string, job: string): string {
  return `${site}-${job}`;
}

/** What `claude remote-control` printed when it registered, as read from rc.log or the files. */
export interface Registration {
  session_name?: string;
  environment_url?: string;
  /** "1/32" */
  capacity?: string;
}

/** the only link the panel will open: Claude's own Code page for an environment */
export const ENVIRONMENT_URL = /https:\/\/claude\.ai\/code\?environment=env_[A-Za-z0-9_-]+/;

export function isEnvironmentUrl(url: string | undefined): url is string {
  return typeof url === 'string' && /^https:\/\/claude\.ai\/code\?environment=env_[A-Za-z0-9_-]+$/.test(url);
}

/**
 * Parse the registration block `claude remote-control` (2.1.283) prints after its QR code:
 *
 *   ·✔︎· Connected · phone · HEAD
 *       Capacity: 1/32 · New sessions will be created in the current directory
 *       asx10-hazy-meadow
 *   Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt
 *   Or ask Claude to work in this folder from your projects on claude.ai
 *
 * The session name is the bare word-word line between "Capacity:" and "Continue coding"; the
 * environment link is the one https://claude.ai/code?environment= URL. Terminal codes and carriage
 * returns are stripped first, so the raw rc.log parses too. The last registration in the text wins.
 * The shapes (a lowercase word-word name, an env_ id of letters, digits, _ and -) are the ones the
 * framework's own parser accepts (lib/adapters/common.sh, hpcw_parse_registration).
 */
export function parseRegistration(text: string): Registration {
  const clean = String(text ?? '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '');
  const out: Registration = {};
  const urls = clean.match(new RegExp(ENVIRONMENT_URL.source, 'g'));
  if (urls?.length) out.environment_url = urls[urls.length - 1];
  const lines = clean.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const cap = /^Capacity:\s*(\d+\s*\/\s*\d+)/.exec(lines[i] ?? '');
    if (!cap) continue;
    out.capacity = cap[1]!.replace(/\s+/g, '');
    // the name is the next non-empty line that is only a hyphenated word, before "Continue coding"
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
      const l = lines[j] ?? '';
      if (!l) continue;
      if (/^Continue coding/i.test(l)) break;
      if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(l)) {
        out.session_name = l;
        break;
      }
    }
  }
  return out;
}

// ---- 12.0.0 (framework 11): the gate ------------------------------------------------------------------
//
// The browser's key is on the grid as ONE restricted line (framework 11, `hpcworker browser-key add`):
//   restrict,command="<shared>/bin/hpcworker gate" <ssh-ed25519|ecdsa-sha2-nistp256> <base64> beethoven-browser <YYYY-MM-DD>
// so a connection made with it runs nothing but the gate, which reads the command the client asked for
// (SSH_ORIGINAL_COMMAND) and accepts exactly these verbs, words of [A-Za-z0-9._-] separated by one space,
// at most 200 characters. connect through the gate is ALWAYS --login never: the gate can never sign a
// worker in to Claude (a Claude sign-in needs the student's own password and code: core/signin.ts).
// Answers: "HPCW-GATE refused" exit 126 for anything else; "HPCW-KEY expired" exit 125 when the lab's
// browser_key_days has passed (the line is gone; the next direct sign-in enrols a key again).

/**
 * the four files of a run the gate reads (framework 11 gate_read). rc.log, the worker's raw terminal, is
 * deliberately NOT one of them: a copied browser key must not read it, so on the direct way the link
 * comes from connection.json and status.json only.
 */
export const GATE_FILES = ['status.json', 'connection.json', 'progress.log', 'node'] as const;
export type GateFile = (typeof GATE_FILES)[number];

/** the gate's worker-name rule (framework 11's WORKER_NAME_RE, never with a leading "-" or "_") */
export const GATE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const GATE_SITE_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** the gate's verbs, each one line the gate accepts; each builder throws on a value the gate would refuse */
export const gate = {
  version: (): string => 'version',
  status(name: string): string {
    if (!GATE_NAME_RE.test(name)) throw new Error('bad worker name for the gate');
    return `status ${name}`;
  },
  watch(name: string): string {
    if (!GATE_NAME_RE.test(name)) throw new Error('bad worker name for the gate');
    return `watch ${name}`;
  },
  stop(name: string): string {
    if (!GATE_NAME_RE.test(name)) throw new Error('bad worker name for the gate');
    return `stop ${name}`;
  },
  restrict(name: string): string {
    if (!GATE_NAME_RE.test(name)) throw new Error('bad worker name for the gate');
    return `restrict ${name}`;
  },
  read(name: string, file: GateFile): string {
    if (!GATE_NAME_RE.test(name) || !GATE_FILES.includes(file)) throw new Error('bad read for the gate');
    return `read ${name} ${file}`;
  },
  /** connect NAME SITE INSTALLID|- MODE chain|no-chain: the gate runs connect with --login never, always */
  connect(o: { name: string; site: string; installId?: string; permissionMode: PermissionMode; chain: boolean }): string {
    if (!GATE_NAME_RE.test(o.name)) throw new Error('bad worker name for the gate');
    if (!GATE_SITE_RE.test(o.site)) throw new Error('bad site for the gate');
    if (o.installId !== undefined && !INSTALL_RE.test(o.installId)) throw new Error('bad installation id');
    if (!MODES.includes(o.permissionMode)) throw new Error('bad permission mode');
    return `connect ${o.name} ${o.site} ${o.installId ?? '-'} ${o.permissionMode} ${o.chain ? 'chain' : 'no-chain'}`;
  },
  forget: (): string => 'forget',
};

/** the gate's own refusal and the key's expiry, as it prints them */
export const GATE_REFUSED = 'HPCW-GATE refused';
export const GATE_KEY_EXPIRED = 'HPCW-KEY expired';

/** the line the gate carries in place of an 11.0.0 line, or undefined (the gate has no such verb, or the line asks for a Claude sign-in) */
export function gateLineFor(line: string): string | undefined {
  const l = String(line ?? '').trim();
  let m: RegExpExecArray | null;
  if ((m = /^bash '\/[A-Za-z0-9._+/-]+\/bin\/hpcworker' worker status --name '([A-Za-z0-9_-]{1,32})' --json$/.exec(l))) return GATE_NAME_RE.test(m[1]!) ? gate.status(m[1]!) : undefined;
  if ((m = /^bash '\/[A-Za-z0-9._+/-]+\/bin\/hpcworker' worker stop --name '([A-Za-z0-9_-]{1,32})'$/.exec(l))) return GATE_NAME_RE.test(m[1]!) ? gate.stop(m[1]!) : undefined;
  if ((m = /^bash '\/[A-Za-z0-9._+/-]+\/bin\/hpcworker' worker restrict --name '([A-Za-z0-9_-]{1,32})'$/.exec(l))) return GATE_NAME_RE.test(m[1]!) ? gate.restrict(m[1]!) : undefined;
  m = /^exec bash '\/[A-Za-z0-9._+/-]+\/bin\/hpcworker' connect --name '([A-Za-z0-9_-]{1,32})' --profile '([a-z0-9-]{1,32})'(?: --consent '([0-9a-f]{32})')? --login '(auto|always|fresh|never)' --permission-mode '(default|acceptEdits|plan)'( --no-chain)?$/.exec(l);
  if (m) {
    if (m[4] !== 'never') return undefined;
    try {
      return gate.connect({ name: m[1]!, site: m[2]!, ...(m[3] ? { installId: m[3] } : {}), permissionMode: m[5] as PermissionMode, chain: !m[6] });
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** what `version` through the gate says: "HPCW-GATE ok <framework> <due|never|-> <account> claude=<yes|no|unknown>" */
export interface GateVersion {
  framework: string;
  /** the key's due date (YYYY-MM-DD), "never", or "-" */
  due: string;
  account: string;
  claude: 'yes' | 'no' | 'unknown';
}

export function parseGateVersion(output: string): GateVersion | undefined {
  for (const raw of String(output ?? '').split('\n')) {
    const m = /^HPCW-GATE ok (\S+) (\S+) (\S+) claude=(yes|no|unknown)\s*$/.exec(raw.trim());
    if (m) return { framework: m[1]!, due: m[2]!, account: m[3]!, claude: m[4] as GateVersion['claude'] };
  }
  return undefined;
}

/** forget through the gate: the browser line out ("forgotten"), none was there ("none"), or it could not be changed ("stuck") */
export function parseForget(output: string): 'forgotten' | 'none' | 'stuck' | undefined {
  const m = /^HPCW-KEY (forgotten|none|stuck)\b/m.exec(String(output ?? ''));
  return m ? (m[1] as 'forgotten' | 'none' | 'stuck') : undefined;
}

/** one of the gate's caps was reached (framework 11, exit 123): "HPCW-GATE limit names|hourly|watch|busy" */
export type GateLimit = 'names' | 'hourly' | 'watch' | 'busy';
export function parseGateLimit(output: string): GateLimit | undefined {
  const m = /^HPCW-GATE limit (names|hourly|watch|busy)\b/m.exec(String(output ?? '').replace(/\r/g, ''));
  return m ? (m[1] as GateLimit) : undefined;
}

/** the lab's copy on the grid is older than framework 11: it has no `gate` (or `browser-key`) verb at all */
export function isUnknownVerb(output: string): boolean {
  return /hpcworker: unknown command '(?:gate|browser-key)'/.test(String(output ?? ''));
}

/**
 * The bytes of one `read NAME FILE` through the gate. The account's own ~/.bashrc may print before the
 * forced command (seen with Ubuntu's bash under sshd), so the output can carry lines that are not the
 * file's. When the gate marks where the file starts ("HPCW-GATE read <bytes>" on a line of its own), the
 * file is what follows that line; otherwise the output as it came.
 */
export function gateReadBody(output: string): string {
  const t = String(output ?? '');
  const m = /(?:^|\n)HPCW-GATE read (\d+)\r?\n/.exec(t);
  if (!m) return t;
  const rest = t.slice(m.index + m[0].length);
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= rest.length ? rest.slice(0, n) : rest;
}

/**
 * A JSON file read through the gate: the whole body when it parses; otherwise the first line-start "{"
 * from which the rest parses (whatever the account's ~/.bashrc printed before it is skipped). Undefined
 * when nothing parses.
 */
export function parseGateJson<T>(output: string | undefined): T | undefined {
  if (output === undefined) return undefined;
  const t = gateReadBody(output);
  const tryParse = (x: string): T | undefined => {
    try {
      const v = JSON.parse(x) as unknown;
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const whole = tryParse(t);
  if (whole !== undefined) return whole;
  for (let i = t.indexOf('{'); i >= 0; i = t.indexOf('{', i + 1)) {
    if (i > 0 && t[i - 1] !== '\n') continue;
    const v = tryParse(t.slice(i));
    if (v !== undefined) return v;
  }
  return undefined;
}

/** a text file read through the gate, without what the account's ~/.bashrc may have printed first (node: its last line) */
export function gateText(output: string | undefined, file: 'progress.log' | 'node'): string | undefined {
  if (output === undefined) return undefined;
  const t = gateReadBody(output);
  if (file === 'node') {
    const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1]! : '';
  }
  return t;
}

/**
 * The enrolment line, run by Beethoven in the student's own password-and-code session right after the
 * grid accepted it (framework 11): it writes the restricted line above for this public key. A key type
 * and base64 that are not exactly an Ed25519 or P-256 public key are refused here, before anything is sent.
 */
export function browserKeyAddLine(sharedDir: string, keyType: string, base64Blob: string, comment = 'beethoven-browser'): string {
  if (!sharedRootOf(sharedDir)) throw new Error('no usable shared copy');
  if (keyType !== 'ssh-ed25519' && keyType !== 'ecdsa-sha2-nistp256') throw new Error('unsupported key type');
  const len = keyType === 'ssh-ed25519' ? 68 : 140;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Blob) || base64Blob.length !== len) throw new Error('not a public key of that type');
  if (!/^[A-Za-z0-9._@-]{1,64}$/.test(comment)) throw new Error('bad comment');
  return `bash '${toolPath(sharedDir)}' browser-key add ${keyType} ${base64Blob} ${comment}`;
}

/**
 * the enrolment line's success: framework 11 (lib/browser_key.sh) prints "HPCW-KEY added SHA256:<fingerprint>"
 * and exits 0, the same when the key is already there; a refusal is "HPCW-KEY refused <code> <sentence>" with
 * a non-zero exit. (The account's ~/.bashrc may print first, so the line is found anywhere in the output.)
 */
export function browserKeyAdded(output: string, exitCode: number | null): boolean {
  return browserKeyAddedFingerprint(output, exitCode) !== undefined;
}

/** the fingerprint the enrolment line says it added ("SHA256:<43>"), or undefined (not added) */
export function browserKeyAddedFingerprint(output: string, exitCode: number | null): string | undefined {
  if (exitCode !== 0) return undefined;
  const m = /^HPCW-KEY added (SHA256:[A-Za-z0-9+/]{43})\s*$/m.exec(String(output ?? '').replace(/\r/g, ''));
  return m ? m[1] : undefined;
}

/** the enrolment line's refusal: "HPCW-KEY refused <code> <sentence>" (codes key, agent, root, usage, home, ssh-dir, authorized-keys, copy) */
export function parseKeyRefusal(output: string): { code: string; sentence: string } | undefined {
  const m = /^HPCW-KEY refused ([a-z-]+)(?: (.*))?$/m.exec(String(output ?? '').replace(/\r/g, ''));
  return m ? { code: m[1]!, sentence: (m[2] ?? '').trim().slice(0, 300) } : undefined;
}

/**
 * The grid's refusal for a code it did not take (2026-10-01): "You either typed in the wrong code, or you
 * do not have Google Authenticator 2FA setup. Please try again, or login to OnDemand and run the 2FA Setup
 * app." It names BOTH causes, so it is never taken as proof that the account has no code: the sheet says
 * the code was not accepted and lets the student type it again, or say they have no grid code yet (only
 * then the route choice, whose 2FA Setup replaces an existing code). It is recognised in whatever part of
 * the conversation it arrives (a prompt, an instruction, a banner, a disconnect); it is never shown to
 * the student as it is.
 */
export const TWO_FA_REFUSAL_RE = /do not have Google Authenticator 2FA setup|run the 2FA Setup app/i;

/** the grid's Google Authenticator prompt ("Your google authenticator one-time verification code: ") */
export const CODE_PROMPT_RE = /verification code|one-time|authenticator|\bOTP\b|token code/i;
export const PASSWORD_PROMPT_RE = /password/i;
