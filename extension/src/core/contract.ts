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
//   <state_dir>/<name>/status.json            heartbeat every 30 s: state, job, node, message, session_name, session_url, claude_login, consent
//   <state_dir>/<name>/connection.json        session_name, session_url, node, job, pid, started_at, token_path, workspace, permission_mode
//   <state_dir>/<name>/rc.log                 Claude Code's terminal (control codes and all)
//   <state_dir>/<name>/job.id                 the scheduler's job id
//   <state_dir>/workspaces/<name>/            the worker's working directory (never the home directory itself)
// At Wayne State shared_state_dir is /rs/rs_grp_oschome/$USER/hpcworker (CephFS), not the home.
export const FRAMEWORK_DIR = '.hpcworker';
export const HPCWORKER = `~/${FRAMEWORK_DIR}/bin/hpcworker`;
export const DEFAULT_WORKER_NAME = 'worker';

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
  workspace: (stateDir: string, name: string) => `${stateDir}/workspaces/${name}`,
};

/** `$USER`, `${USER}`, `$HOME`, `${HOME}` and a leading `~` in a profile path, as the job's shell would expand them */
export function expandPath(raw: string, vars: { home: string; user: string }): string {
  return String(raw ?? '')
    .replace(/^~(?=\/|$)/, vars.home)
    .replace(/\$\{?USER\}?/g, vars.user)
    .replace(/\$\{?HOME\}?/g, vars.home)
    .replace(/\/+$/, '');
}

/** the state directory: the profile's shared_state_dir, else the tool's own folder */
export function stateDirFrom(profileJson: string | undefined, vars: { home: string; user: string }): string {
  if (profileJson) {
    try {
      const p = JSON.parse(profileJson) as { shared_state_dir?: string };
      if (p.shared_state_dir) return expandPath(p.shared_state_dir, vars);
    } catch {
      /* unreadable profile: fall through */
    }
  }
  return paths.root(vars.home);
}

/** the profile's site name, used in the session name `<site>-<jobid>` */
export function siteFrom(profileJson: string | undefined): string | undefined {
  try {
    return profileJson ? (JSON.parse(profileJson) as { site?: string }).site : undefined;
  } catch {
    return undefined;
  }
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
  /** touch the stop file and cancel the job in one go (the job deregisters Remote Control on its way out) */
  workerStop: (name: string) => `bash ${HPCWORKER} worker stop --name '${safe(name)}'`,
  /** the tool's own checks, one JSON document */
  diag: () => `bash ${HPCWORKER} diag --json`,
  /** shown to the student to type in the portal's own Shell tab; never typed by the extension */
  claudeLogin: `bash ${HPCWORKER} claude login`,
  claudeConsent: `bash ${HPCWORKER} claude consent`,
};

export type WorkerState = 'starting' | 'need_login' | 'need_consent' | 'running' | 'online' | 'stopped' | 'preempted' | 'error' | 'unknown';

/** status.json as worker.sbatch.tpl writes it */
export interface StatusFile {
  version?: number;
  site?: string;
  run?: string;
  job?: string;
  node?: string;
  pid?: number | string;
  state: WorkerState;
  message?: string;
  started_at?: string;
  updated_at?: string;
  session_name?: string;
  session_url?: string;
  /** loggedIn, email, subscriptionType and nothing else: never a token */
  claude_login?: { loggedIn?: boolean; email?: string; subscriptionType?: string; checked_at?: string };
  consent?: boolean;
  rc_alive?: boolean;
  resumed?: boolean;
  tmux?: boolean;
  restarts?: number;
  workspace?: string;
  rc_log?: string;
  token_path?: string;
}

/** connection.json as worker.sbatch.tpl writes it */
export interface ConnectionFile {
  session_name?: string;
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
  runtime?: { ok?: boolean; name?: string; bin?: string; module?: string; version?: string };
  image?: { type?: string; path?: string; node_version?: string; claude_version?: string; first_exec_seconds?: number; curl_api_from_image?: string };
  remote_control_flags?: string;
  remote_control_help_head?: string;
  claude_auth?: { loggedIn?: boolean; subscriptionType?: string; email?: string; authMethod?: string; config_dir_present?: boolean };
  consent_recorded?: boolean;
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

/** "<site>-<jobid>": the name the student looks for at claude.ai/code (the framework names the session so) */
export function sessionName(site: string, job: string): string {
  return `${site}-${job}`;
}
