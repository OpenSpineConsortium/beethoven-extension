// The files and commands the extension and the cluster-side framework (framework/, the
// `hpcworker` command) agree on. Everything the extension learns about a run it learns by reading
// these files through the portal's Files routes; the only commands it ever types are the ones
// listed here, one line at a time, through the portal's Shell app. If the framework moves a path
// or renames a field, change it here and in framework/ together. Written against framework
// version 1 (framework/bin/hpcworker, jobs/probe.sbatch, jobs/worker.sbatch.tpl, README.md).
//
// Layout:
//   ~/.hpcworker/                             the installed tool (bin/, lib/, jobs/, profiles/)
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
// At Wayne State shared_state_dir is /rs/rs_grp_oschome/$USER/hpcworker (CephFS), not the home.
//
// The extension never deletes anything on the cluster: it writes files, touches the stop file and
// types hpcworker's verbs. Removing a marker is done by the student in the portal's Files app.
export const FRAMEWORK_DIR = '.hpcworker';
export const HPCWORKER = `~/${FRAMEWORK_DIR}/bin/hpcworker`;
export const DEFAULT_WORKER_NAME = 'worker';
export const RESTRICTED_MARKER = '.restricted';

export const paths = {
  root: (home: string) => `${home}/${FRAMEWORK_DIR}`,
  bin: (home: string) => `${home}/${FRAMEWORK_DIR}/bin/hpcworker`,
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
};

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
  /** after the files are uploaded: make the tool executable and install with the site profile (it strips CR endings itself) */
  install: (profile: string) => `chmod 755 ${HPCWORKER} 2>/dev/null; bash ${HPCWORKER} install --profile '${safe(profile)}'`,
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
   * Shown to the student to type in the portal's own Shell tab; never typed by the extension. One
   * sitting: Claude Code's `auth login`, then, if the student has not yet answered "Enable Remote
   * Control?", `claude remote-control` once in the workspace so they answer y and press Ctrl-C.
   */
  claudeLogin: `bash ${HPCWORKER} claude login`,
  /** kept as an alias that explains; the login command covers it */
  claudeConsent: `bash ${HPCWORKER} claude consent`,
};

export type WorkerState = 'starting' | 'need_login' | 'need_consent' | 'running' | 'online' | 'stopped' | 'preempted' | 'error' | 'unknown';

/** where the framework found the student's Remote Control answer: Claude Code's own settings file, a marker file, or nowhere */
export type ConsentSource = 'claude_config' | 'marker' | 'none' | string;

/** the consent source in the student's words (never the value itself) */
export function consentSourceWords(src: ConsentSource | undefined): string {
  if (src === 'claude_config') return 'recorded by Claude Code itself';
  if (src === 'marker') return 'recorded in a marker file (the fallback)';
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
  started_at?: string;
  updated_at?: string;
  /** the name Claude Code printed at registration (e.g. asx10-hazy-meadow); until then the requested one */
  session_name?: string;
  /** "<site>-<jobid>", what the job asked for with --name */
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
  egress?: {
    class?: 'direct' | 'http-proxy-auto' | 'http-proxy-module' | 'none' | string;
    inherited_proxy?: Record<string, string>;
    with_inherited_env?: Record<string, string>;
    without_proxy_vars?: Record<string, string>;
    'statsig.anthropic.com'?: string;
  };
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

/** the job id in a submit answer: hpcworker's sentences, `job=123`, `123;cluster` (sbatch --parsable), or a bare number */
export function parseJobId(output: string): string | undefined {
  const s = String(output ?? '');
  const m =
    /submitted as job\s+([0-9]+)/i.exec(s) ??
    /already has job\s+([0-9]+)/i.exec(s) ??
    /probe job\s+([0-9]+)\s+submitted/i.exec(s) ??
    /\bjob=([0-9]+)/.exec(s) ??
    /Submitted batch job\s+([0-9]+)/.exec(s) ??
    /^\s*([0-9]+)(?:;[\w.-]+)?\s*$/m.exec(s);
  return m ? m[1] : undefined;
}

/**
 * "<site>-<jobid>": the name the framework asks Claude Code for with `--name`. Claude Code 2.1.283
 * names the session itself at registration (asx10-hazy-meadow, in the maintainer's run), so the
 * panel shows what the files report and uses this only to say what was asked for.
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
