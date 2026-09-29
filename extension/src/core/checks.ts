// The seventeen checks from the research report, in its order, as diagnostics nodes. Each one
// says in plain words what it needs, what it found, and what the student can do about it. The
// dependency edges are the ones the table implies: nothing portal-side is tried without the
// origin grant and a signed-in session; nothing compute-side is judged without the probe job's
// file; the shell is opened once (check 5) and its output is reused by check 10. The files and
// fields come from framework version 1 (contract.ts).
import type { KV } from './audit';
import { ackCovers, ackSubject, type Acknowledgement, ACK_KEY } from './disclosure';
import { commands, parseDiscovery, paths, stateDirFrom, type Discovery, type ProbeFile } from './contract';
import type { DiagNode } from './diagnostics';
import { IDENTITY_KEY, KILLLIST_KEY, LICENSE_KEY, SESSION_SEEN_KEY, type LicenseState, type PortalSettings, type Prefs } from './keys';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';
import { verifyLicense, type KeyRing } from '../licensing/license';
import type { PortalApi, SessionInfo } from './portal';
import { recordInForce, TERMS_KEY } from './terms';

export interface DiagEnv {
  version: string;
  now(): Date;
  local: KV;
  session: KV;
  keys: KeyRing;
  hasOriginPermission(origin: string): Promise<boolean>;
  /** is a page script answering in a portal tab? */
  portalAlive(): Promise<boolean>;
  /** the portal operations, relayed to the page script; undefined when no portal tab is open */
  portal(): PortalApi | undefined;
}

export interface DiagCtx {
  env: DiagEnv;
  settings?: PortalSettings;
  prefs: Prefs;
  /** what earlier checks learned, for later ones */
  cache: {
    home?: string;
    user?: string;
    stateDir?: string;
    session?: SessionInfo;
    discoveryText?: string;
    discovery?: Discovery;
    probe?: ProbeFile;
    shellHost?: string;
  };
}

const SESSION_HOURS = 8;

function portalOf(ctx: DiagCtx): PortalApi {
  const p = ctx.env.portal();
  if (!p) throw new Error('no portal tab is open');
  return p;
}

async function home(ctx: DiagCtx): Promise<string> {
  if (!ctx.cache.home) ctx.cache.home = await portalOf(ctx).home();
  return ctx.cache.home;
}

/** the framework's state directory: the profile's shared_state_dir, expanded with the student's home and username */
async function stateDir(ctx: DiagCtx): Promise<string> {
  if (ctx.cache.stateDir) return ctx.cache.stateDir;
  const h = await home(ctx);
  const user = ctx.cache.user ?? ctx.cache.session?.username ?? (await portalOf(ctx).whoAmI()) ?? h.split('/').filter(Boolean).pop() ?? '';
  ctx.cache.user = user;
  const profile = await portalOf(ctx).readFileIfExists(paths.profile(h));
  ctx.cache.stateDir = stateDirFrom(profile, { home: h, user });
  return ctx.cache.stateDir;
}

async function probeFile(ctx: DiagCtx): Promise<ProbeFile | undefined> {
  if (ctx.cache.probe) return ctx.cache.probe;
  const text = await portalOf(ctx).readFileIfExists(paths.probe(await stateDir(ctx)));
  if (!text) return undefined;
  try {
    ctx.cache.probe = JSON.parse(text) as ProbeFile;
  } catch {
    throw new Error('probe.json is not valid JSON');
  }
  return ctx.cache.probe;
}

const reached = (code: string | number | undefined) => {
  const n = Number(code);
  return Number.isFinite(n) && n > 0;
};

export function buildNodes(): DiagNode<DiagCtx>[] {
  return [
    {
      id: 'licence',
      title: 'Licence and agreement',
      layer: 'licence',
      dependsOn: [],
      assumption: 'the terms are accepted in this browser, the key verifies offline, the kill-list is valid and this version is not withdrawn',
      manualFix: 'Open the setup page: accept the terms and enter your licence key.',
      fixAction: 'open-onboarding',
      futureRisk: 'a new signing key or a withdrawn release changes the answer without any change on the cluster',
      async check(ctx) {
        const terms = await ctx.env.local.get(TERMS_KEY);
        if (!recordInForce(terms)) return { ok: false, detail: 'the licence terms have not been accepted in this browser' };
        const lic = await ctx.env.local.get<LicenseState>(LICENSE_KEY);
        const stored = await ctx.env.local.get<StoredKillList>(KILLLIST_KEY);
        const identity = (await ctx.env.local.get<{ username?: string }>(IDENTITY_KEY))?.username;
        const v = await verifyLicense(lic?.key, { keys: ctx.env.keys, now: Math.floor(ctx.env.now().getTime() / 1000), identity: { accessId: lic?.identity?.accessId || identity }, revoked: stored?.list.revoked_lids ?? [] });
        if (!v.ok) return { ok: false, detail: v.status === 'missing' ? 'no licence key entered yet (a trial key is free)' : v.detail };
        const verdict = killListVerdict(stored, ctx.env.version, v.payload?.lid);
        if (verdict.versionRevoked) return { ok: false, detail: `this version (${ctx.env.version}) has been withdrawn; update to continue. ${verdict.message}`.trim() };
        const listNote = stored ? `kill-list of ${new Date(stored.list.issued * 1000).toISOString().slice(0, 10)}` : 'kill-list not fetched yet (works offline on the last good list)';
        return { ok: true, warn: !stored || v.status === 'grace', detail: `${v.detail}; ${listNote}` };
      },
    },
    {
      id: 'origin-granted',
      title: 'Portal connected',
      layer: 'browser',
      dependsOn: [],
      assumption: 'the student granted this extension access to exactly one origin, their Open OnDemand portal',
      manualFix: 'Open your portal in a tab, then use the toolbar button and choose "Connect this portal".',
      fixAction: 'connect-portal',
      futureRisk: 'Firefox and Safari let a person revoke a site permission from the address bar; the grant is re-checked at every start',
      async check(ctx) {
        if (!ctx.settings) return { ok: false, detail: 'no portal connected yet' };
        const has = await ctx.env.hasOriginPermission(ctx.settings.origin);
        return has ? { ok: true, detail: `${ctx.settings.hostname} (granted ${ctx.settings.connected_at.slice(0, 10)})` } : { ok: false, detail: `access to ${ctx.settings.hostname} was revoked in the browser; connect it again` };
      },
    },
    {
      id: 'portal-tab',
      title: 'Portal tab open',
      layer: 'browser',
      dependsOn: ['origin-granted'],
      assumption: 'a portal tab is open, so the page script that carries your sign-in can answer (this extension never reads cookies; it works only from your own portal tab)',
      manualFix: 'Open your portal in a tab and keep it open while Ashley Bridge works.',
      fixAction: 'open-portal',
      futureRisk: 'a browser that unloads background tabs aggressively makes the page script disappear until the tab is shown again',
      async check(ctx) {
        return (await ctx.env.portalAlive()) ? { ok: true, detail: 'the page script answers from your portal tab' } : { ok: false, detail: 'no portal tab is open (or it has not finished loading)' };
      },
    },
    {
      id: 'signed-in',
      title: 'Portal reachable and signed in',
      layer: 'portal',
      dependsOn: ['portal-tab'],
      assumption: 'GET /pun/sys/dashboard/ answers 200 with the dashboard (a redirect to a sign-in page or a VPN page means it does not)',
      manualFix: 'Connect the VPN and sign in to your portal in its tab, then check again. Ashley Bridge never signs in for you.',
      fixAction: 'open-portal',
      futureRisk: 'the portal session lasts about eight hours; a 302 or 401 after that is the sign to sign in again',
      async check(ctx) {
        const s = await portalOf(ctx).session();
        ctx.cache.session = s;
        if (s.signedIn) {
          await ctx.env.session.set(SESSION_SEEN_KEY, { checked_at: s.checkedAt });
          if (s.username) {
            ctx.cache.user = s.username;
            await ctx.env.local.set(IDENTITY_KEY, { username: s.username });
          }
          return { ok: true, detail: `signed in${s.username ? ` as ${s.username}` : ''}${s.isOnDemand ? '' : ' (the page does not say OnDemand; is this the right portal?)'}`, warn: !s.isOnDemand };
        }
        return { ok: false, detail: s.detail };
      },
    },
    {
      id: 'shell',
      title: 'Shell app admits a connection',
      layer: 'login-node',
      dependsOn: ['signed-in'],
      assumption: 'the Shell page carries a token and the socket opens; one command line runs and the shell is closed again',
      manualFix: 'If the shell is refused, the message names the reason: no cluster defined, an origin check behind an extra proxy, or a host not in the allowlist. Those are settings only the portal administrator can change; a different shell host can be tried in the extension settings.',
      futureRisk: 'a site may disable the Shell app; the framing itself has not changed since OnDemand 2.0',
      slow: true,
      async check(ctx) {
        const p = portalOf(ctx);
        const wait = await p.auditWait('scheduler');
        // the login node is asked at most once a minute; a check that would break that rule waits its turn
        if (wait > 0) return { ok: true, skip: true, detail: `the login node was asked less than a minute ago; this check runs again in ${Math.ceil(wait / 1000)} s` };
        const r = await p.shell(commands.discover(), { timeoutMs: 45_000 });
        ctx.cache.discoveryText = r.output;
        ctx.cache.shellHost = ctx.settings?.shell_host ?? 'default';
        return { ok: true, detail: `shell opened, one command ran (exit ${r.exitCode}, ${r.ms} ms) and the shell closed` };
      },
    },
    {
      id: 'files',
      title: 'Files app lists your home',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'GET files/fs/<home> with Accept: application/json answers with files[]; files_upload_path shows uploads are allowed',
      manualFix: 'The Files app is disabled at your site, so there is no mailbox for the worker to write to. Ask your research computing centre.',
      futureRisk: 'OOD_ALLOWLIST_PATH or a disabled Files app removes the only status channel that needs no administrator',
      async check(ctx) {
        const h = await home(ctx);
        const l = await portalOf(ctx).listDir(h);
        const uploads = !!l.files_upload_path;
        const installed = l.files.some((f) => f.name === '.hpcworker' && f.type === 'd');
        return { ok: true, warn: !uploads, detail: `${h}: ${l.files.length} entries${uploads ? ', uploads allowed' : ', uploads disabled at this site (writes still use PUT)'}${installed ? '; hpcworker is installed' : '; hpcworker not installed yet'}` };
      },
    },
    {
      id: 'active-jobs',
      title: 'Active Jobs lists your clusters',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'GET activejobs.json?jobcluster=all&jobfilter=user answers with data[][] and names no unconfigured cluster in errors',
      manualFix: 'The portal could not ask the scheduler. If errors name a cluster, the portal is misconfigured for it; tell your centre.',
      futureRisk: 'the shape (an array of arrays) is stable since Active Jobs moved into the dashboard; a 5.0 change would show here first',
      async check(ctx) {
        const a = await portalOf(ctx).activeJobs();
        if (a.errors.length) return { ok: true, warn: true, detail: `${a.jobs.length} job(s); the portal reports: ${a.errors.join('; ').slice(0, 160)}` };
        return { ok: true, detail: `${a.jobs.length} job(s) of yours${a.clusters.length ? ` on ${a.clusters.join(', ')}` : ''}` };
      },
    },
    {
      id: 'optional-routes',
      title: 'Optional submit routes (informational)',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'the Job Composer JSON and Projects routes are recorded as present or absent; nothing depends on them',
      manualFix: 'Nothing to do: these routes are optional and the worker is started through the shell.',
      futureRisk: 'the Job Composer disappears in OnDemand 5.0',
      async check(ctx) {
        const r = await portalOf(ctx).probeRoutes();
        return { ok: true, detail: `Job Composer JSON ${r.workflows_json === 200 ? 'present' : `absent (${r.workflows_json})`}; Projects ${r.projects === 200 ? 'present' : `absent (${r.projects})`}` };
      },
    },
    {
      id: 'reverse-proxy',
      title: 'Reverse proxy (informational)',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'GET /rnode/<shell host>/1/ answers 503 "Failed to connect" when the proxy is on, 404 when it is off',
      manualFix: 'Nothing to do: without the proxy the worker is read through its files (mailbox mode), which works everywhere.',
      futureRisk: 'a site may narrow host_regex; the probe would then answer 404 for the shell host while compute nodes still match',
      async check(ctx) {
        const host = ctx.cache.shellHost && ctx.cache.shellHost !== 'default' ? ctx.cache.shellHost : new URL(ctx.settings!.origin).hostname;
        const r = await portalOf(ctx).probeRnode(host);
        return { ok: true, warn: r.state === 'unknown', detail: r.detail };
      },
    },
    {
      id: 'login-discovery',
      title: 'Scheduler and container runtime found',
      layer: 'login-node',
      dependsOn: ['shell'],
      assumption: 'the discovery names a scheduler, a container runtime and the partitions, under a second of login-node CPU',
      manualFix: 'No scheduler or no container runtime was found from the login node. Some sites hide modules on login nodes (the probe job looks again on a compute node); if the probe also finds none, the cluster cannot run the worker.',
      futureRisk: 'a module rename or a new scheduler CLI name lands here',
      async check(ctx) {
        if (!ctx.cache.discoveryText) return { ok: false, detail: 'the shell check did not run (or the shell was rate-limited); run the checks again in a minute' };
        const d = parseDiscovery(ctx.cache.discoveryText);
        ctx.cache.discovery = d;
        const parts: string[] = [];
        if (d.scheduler) parts.push(`scheduler ${d.scheduler}`);
        if (d.runtime || d.modules || d.pyxis) parts.push(`runtime ${[d.runtime, d.modules, d.pyxis ? 'pyxis' : ''].filter(Boolean).join(' ')}`);
        if (d.partitions?.length) parts.push(`${d.partitions.length} partition(s)`);
        if (d.os) parts.push(d.os);
        if (d.tmux === false) parts.push('no tmux on the login node (the job checks the compute node)');
        if (!d.scheduler) return { ok: false, detail: `no scheduler command found on the login node${parts.length ? ` (${parts.join('; ')})` : ''}` };
        if (!d.runtime && !d.modules && !d.pyxis) return { ok: true, warn: true, detail: `${parts.join('; ')}; no container runtime visible from the login node (the probe job checks the compute node)` };
        return { ok: true, detail: parts.join('; ') };
      },
    },
    {
      id: 'probe-job',
      title: 'Probe job has run on a compute node',
      layer: 'compute-node',
      dependsOn: ['files', 'login-discovery'],
      assumption: 'a five-minute job on the default partition wrote <state_dir>/probe/probe.json: node-local temp and /dev/shm, user namespaces, the container running, and the reach of api.anthropic.com, platform.claude.com and claude.ai with and without the proxy',
      manualFix: 'Run "Set up the cluster" (it installs the tool), then "Run the probe job", and check again once the job has finished.',
      fixAction: 'run-probe',
      futureRisk: 'egress is the least uniform thing across campuses and can change without notice; the probe is cheap to rerun',
      slow: true,
      async check(ctx) {
        const p = await probeFile(ctx);
        if (!p) return { ok: false, detail: `no probe.json at ${paths.probe(await stateDir(ctx))} yet: the probe job has not run (or has not finished)` };
        const e = p.egress ?? {};
        const bare = e.without_proxy_vars ?? {};
        const env = e.with_inherited_env ?? {};
        const reach = ['api.anthropic.com', 'platform.claude.com', 'claude.ai'].map((h) => `${h} ${env[h] ?? '?'}${bare[h] !== undefined && bare[h] !== env[h] ? ` (bare ${bare[h]})` : ''}`).join(', ');
        const okEgress = e.class ? e.class !== 'none' : (reached(env['api.anthropic.com']) || reached(bare['api.anthropic.com'])) && (reached(env['platform.claude.com']) || reached(bare['platform.claude.com']));
        const detail = `${p.when ? `probe of ${p.when.slice(0, 16)}` : 'probe'} on ${p.hostname ?? '?'}: node temp ${p.node_tmp?.ok ? `${p.node_tmp.free_gb ?? '?'} GB free at ${p.node_tmp.path ?? '?'}` : 'NOT usable'}, /dev/shm ${p.dev_shm?.writable ? `${Math.round((p.dev_shm.free_kb ?? 0) / 1e6)} GB free` : 'not writable'}, user namespaces ${p.user_namespaces?.unshare_works ? 'yes' : 'no'}, container ${p.runtime?.ok ? 'runs' : 'FAILS'}, egress ${e.class ?? '?'} (${reach})${e['statsig.anthropic.com'] && /no DNS/i.test(e['statsig.anthropic.com']) ? '; statsig.anthropic.com has no DNS record here' : ''}`;
        if (!p.runtime?.ok) return { ok: false, detail: `${detail}. The container runtime could not run the image on the compute node.` };
        if (!okEgress) return { ok: false, detail: `${detail}. Compute nodes cannot reach api.anthropic.com or platform.claude.com; ask your centre for an HTTP proxy (Claude Code refuses SOCKS).` };
        if (!p.node_tmp?.ok) return { ok: false, detail: `${detail}. The node-local temp directory named by the profile is not usable.` };
        return { ok: true, warn: !p.tmux?.present, detail: `${detail}${p.tmux?.present ? '' : '; no tmux on the node (script -qfc is the fallback)'}` };
      },
    },
    {
      id: 'worker-binary',
      title: 'Claude Code runs on the compute node',
      layer: 'compute-node',
      dependsOn: ['probe-job'],
      assumption: 'the probe ran `claude --version` inside the worker image and got a version string',
      manualFix: 'The worker image cannot run Claude Code on this node (a glibc or musl mismatch, or the image path in the profile is wrong). Report the probe output to the maintainer.',
      futureRisk: 'a Claude Code release that raises its glibc floor, or an image rebuilt on a different base',
      async check(ctx) {
        const p = await probeFile(ctx);
        const v = p?.image?.claude_version;
        return v ? { ok: true, detail: `claude ${v} (node ${p?.image?.node_version ?? '?'}, first exec ${p?.image?.first_exec_seconds ?? '?'} s)` } : { ok: false, detail: `the probe reported no Claude Code version${p?.image?.path ? ` from ${p.image.path}` : ''}` };
      },
    },
    {
      id: 'claude-login',
      title: 'Signed in to Claude on the cluster',
      layer: 'claude',
      dependsOn: ['probe-job'],
      assumption: 'the probe ran `claude auth status` (never reading the credential) and found a sign-in in the configured Claude folder; the job strips CLAUDE_CODE_OAUTH_TOKEN and the other credential variables itself',
      manualFix: 'Choose "Sign in to Claude on the cluster": it opens the portal\'s own shell where you run "hpcworker claude login" yourself (Claude Code\'s paste-code flow, on a compute node). Never use setup-token: Remote Control needs a full sign-in.',
      fixAction: 'sign-in-claude',
      futureRisk: 'the sign-in expires after roughly a month; a Remote Control session that outlives it stops making progress',
      async check(ctx) {
        const p = await probeFile(ctx);
        const a = p?.claude_auth;
        if (!a) return { ok: false, detail: 'the probe reported nothing about the Claude sign-in' };
        if (!a.loggedIn) return { ok: false, detail: a.config_dir_present ? 'not signed in to Claude on the cluster' : 'not signed in to Claude on the cluster (the Claude folder named in the profile does not exist yet)' };
        const who = [a.email, a.subscriptionType].filter(Boolean).join(', ');
        const method = a.authMethod && !/claude\.ai|oauth/i.test(a.authMethod) ? ` (sign-in method "${a.authMethod}": Remote Control needs a claude.ai sign-in, not an API key or setup-token)` : '';
        return { ok: !method, warn: false, detail: `signed in${who ? ` (${who})` : ''}${method}` };
      },
    },
    {
      id: 'remote-control-ready',
      title: 'Remote Control consent recorded',
      layer: 'claude',
      dependsOn: ['claude-login'],
      assumption: 'the student answered Claude Code\'s one-time "Enable Remote Control?" themselves (hpcworker claude consent records only that they did), and the image\'s `claude remote-control` accepts the flags the job uses',
      manualFix: 'Choose "Sign in to Claude on the cluster" and run "hpcworker claude consent" there: you answer Claude Code\'s "Enable Remote Control?" and "Trust this folder?" questions yourself, once. If a running job reports "Couldn\'t verify Remote Control eligibility", the compute nodes cannot reach Anthropic\'s feature-flag service; tell your centre.',
      fixAction: 'sign-in-claude',
      futureRisk: 'Anthropic can change Remote Control eligibility for a plan class at any time; a running job\'s status.json is where it would show',
      async check(ctx) {
        const p = await probeFile(ctx);
        if (p?.consent_recorded === undefined) return { ok: false, detail: 'the probe did not report on the consent marker' };
        if (!p.consent_recorded) return { ok: false, detail: 'your answer to "Enable Remote Control?" is not recorded yet (the job would wait in need_consent)' };
        if (p.remote_control_flags === '') return { ok: false, detail: 'consent is recorded, but `claude remote-control --help` printed no flags inside the image: this Claude Code may be too old for Remote Control' };
        return { ok: true, detail: `consent recorded${p.remote_control_flags ? `; remote-control flags: ${p.remote_control_flags.slice(0, 80)}` : ''}` };
      },
    },
    {
      id: 'xdg-runtime',
      title: 'Runtime directory writable on the node',
      layer: 'compute-node',
      dependsOn: ['probe-job'],
      assumption: 'the probe checked that /dev/shm/$USER/xdg is writable on the node and inside the image (the upstream EACCES on /run/user/<uid> is closed "not planned")',
      manualFix: 'The framework points XDG_RUNTIME_DIR at /dev/shm. If the bash tool still fails with EACCES on /run/user, record it as the known upstream defect and tell the maintainer the node name.',
      futureRisk: 'a node image that mounts /dev/shm noexec or small breaks the fix',
      async check(ctx) {
        const p = await probeFile(ctx);
        const x = p?.xdg_fix;
        if (!x) return { ok: true, warn: true, detail: 'the probe did not report on the runtime directory' };
        const inImage = x.in_image === true || (typeof x.in_image === 'string' && /^(true|ok|writable|yes)/i.test(x.in_image));
        if (!x.host_writable) return { ok: false, detail: `${x.dir ?? '/dev/shm/$USER/xdg'} is not writable on the node` };
        if (!inImage) return { ok: false, detail: `${x.dir ?? 'the runtime directory'} is writable on the node but not inside the image (${String(x.in_image ?? 'not reported')})` };
        return { ok: true, detail: `${x.dir ?? '/dev/shm runtime directory'} works on the node and inside the image` };
      },
    },
    {
      id: 'data-classification',
      title: 'Data classification acknowledged',
      layer: 'student',
      dependsOn: ['licence'],
      assumption: 'this browser session, the student read where the transcript goes and stated that the worker\'s workspace holds no FERPA, IRB, PHI, export-controlled or restricted data',
      manualFix: 'Read the disclosure in the panel and tick the statement for the worker you will start. It is asked once per browser session.',
      fixAction: 'acknowledge',
      futureRisk: 'a change of plan class (Team, Enterprise, ZDR) changes what the disclosure must say',
      async check(ctx) {
        const ack = await ctx.env.session.get<Acknowledgement>(ACK_KEY);
        const subject = ackSubject(ctx.prefs.worker_name);
        return ackCovers(ack, subject) ? { ok: true, detail: `acknowledged this session for worker "${ctx.prefs.worker_name}"` } : { ok: false, detail: `not acknowledged this session for worker "${ctx.prefs.worker_name}"` };
      },
    },
    {
      id: 'session-lifetime',
      title: 'Portal session age',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'the portal session lasts about eight hours; after that (or on the first 302/401) the student signs in again in a tab and nothing is cached across the re-login',
      manualFix: 'Sign in to the portal again in its tab. Ashley Bridge keeps nothing from the old session.',
      fixAction: 'open-portal',
      async check(ctx) {
        const seen = await ctx.env.session.get<{ checked_at: string }>(SESSION_SEEN_KEY);
        if (!seen) return { ok: true, warn: true, detail: 'first sign-in check this session' };
        const hours = (ctx.env.now().getTime() - new Date(seen.checked_at).getTime()) / 3_600_000;
        if (hours >= SESSION_HOURS) return { ok: true, warn: true, detail: `signed in ${hours.toFixed(1)} h ago; the portal will ask you to sign in again soon` };
        return { ok: true, detail: `signed in ${hours < 1 ? `${Math.round(hours * 60)} min` : `${hours.toFixed(1)} h`} ago` };
      },
    },
  ];
}

/** the ids in the report's order; the test pins the graph to it */
export const CHECK_IDS = ['licence', 'origin-granted', 'portal-tab', 'signed-in', 'shell', 'files', 'active-jobs', 'optional-routes', 'reverse-proxy', 'login-discovery', 'probe-job', 'worker-binary', 'claude-login', 'remote-control-ready', 'xdg-runtime', 'data-classification', 'session-lifetime'];
