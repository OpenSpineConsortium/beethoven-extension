// The seventeen checks from the research report, in its order, as diagnostics nodes. Each one
// says in plain words what it needs, what it found, and what the student can do about it. The
// dependency edges are the ones the table implies: nothing portal-side is tried without the
// origin grant and a signed-in session; nothing compute-side is judged without the probe job's
// file; the shell is opened once (check 5) and its output is reused by checks 9 and 10. The files
// and fields come from framework version 1 (contract.ts).
//
// Floors: check 5 opens the shell for the discovery batch (its own once-a-minute clock), check 7
// asks the portal's job list (another clock), and the Files reads have none; so a full run never
// refuses one of its own checks, and a check whose clock is still running is skipped with the
// time left, never failed.
import type { KV } from './audit';
import { statementFor, type Statements } from './disclosure';
import { commands, consentSourceWords, parseDiscovery, paths, probeVerdict, profileRestricts, stateDirFrom, type Discovery, type ProbeFile } from './contract';
import type { DiagNode } from './diagnostics';
import { ACCESS_KEY, IDENTITY_KEY, KILLLIST_KEY, LOGIN_SEEN_KEY, SERVICES_KEY, SESSION_SEEN_KEY, STATEMENTS_KEY, type IdentityNote, type LoginSeen, type PortalSettings, type Prefs } from './keys';
import { accessFact, type AccessRecord, type StoredServices } from '../licensing/access';
import { killListVerdict, type StoredKillList } from '../licensing/killlist';
import type { PortalApi, SessionInfo } from './portal';
import { PRODUCT_NAME, recordInForce, TERMS_KEY } from './terms';

export interface DiagEnv {
  version: string;
  now(): Date;
  local: KV;
  session: KV;
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
    profile?: string;
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
  ctx.cache.profile = profile;
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

/** the discovery, parsed once from the shell check's output */
function discoveryOf(ctx: DiagCtx): Discovery | undefined {
  if (!ctx.cache.discovery && ctx.cache.discoveryText) ctx.cache.discovery = parseDiscovery(ctx.cache.discoveryText);
  return ctx.cache.discovery;
}

/** The sign-in instruction, used wherever a check points at it. */
export const SIGN_IN_INSTRUCTION = `Choose "Sign in on the cluster": the strip at the top opens a small terminal, asks a compute node for Claude Code's own sign-in, opens Anthropic's sign-in page in a tab, and takes the code that page shows in one box; Claude Code exchanges the code on the compute node and ${PRODUCT_NAME} never sees the credential. Never use setup-token: Remote Control needs a full sign-in.`;

export function buildNodes(): DiagNode<DiagCtx>[] {
  return [
    {
      id: 'access',
      title: 'Access and agreement',
      layer: 'access',
      dependsOn: [],
      assumption: "the terms are accepted in this browser; Licensor's access service has confirmed, within the last day (an older answer is kept up to seven days when the service cannot be reached), that the account your portal's dashboard shows is on the approved list; the kill-list is valid and this version is not withdrawn",
      manualFix: `Open the setup page and accept the terms. If your account is not approved yet, ask for access with the button in the strip; once the maintainer has approved it, click the ${PRODUCT_NAME} button again.`,
      fixAction: 'open-onboarding',
      futureRisk: 'an approval withdrawn from the list, a withdrawn release, or a service outage longer than seven days changes the answer without any change on the cluster',
      async check(ctx) {
        const terms = await ctx.env.local.get(TERMS_KEY);
        if (!recordInForce(terms)) return { ok: false, detail: 'the agreement has not been accepted in this browser' };
        const stored = await ctx.env.local.get<StoredKillList>(KILLLIST_KEY);
        const verdict = killListVerdict(stored, ctx.env.version);
        const record = await ctx.env.local.get<AccessRecord>(ACCESS_KEY);
        const services = await ctx.env.local.get<StoredServices>(SERVICES_KEY);
        // the account name the dashboard showed (check 4 and the background record it); nothing typed
        const observed = (await ctx.env.local.get<IdentityNote>(IDENTITY_KEY))?.username;
        const a = accessFact({ record, services, accessId: observed, portal: ctx.settings?.hostname, now: ctx.env.now(), versionRevoked: verdict.versionRevoked, revokedMessage: verdict.message });
        if (!a.ok) return { ok: false, detail: a.state === 'version-revoked' ? `this version (${ctx.env.version}) has been withdrawn; update to continue. ${verdict.message}`.trim() : a.detail };
        const listNote = stored ? `kill-list of ${new Date(stored.list.issued * 1000).toISOString().slice(0, 10)}` : 'kill-list not fetched yet (works offline on the last good list)';
        return { ok: true, warn: !stored || a.warn, detail: `${a.detail}; ${listNote}` };
      },
    },
    {
      id: 'origin-granted',
      title: 'Portal connected',
      layer: 'browser',
      dependsOn: [],
      assumption: 'the student granted this extension access to exactly one origin, their Open OnDemand portal',
      manualFix: `Open your portal in a tab and click the ${PRODUCT_NAME} button there; the browser asks you to allow that one site.`,
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
      manualFix: `Open your portal in a tab and keep it open while ${PRODUCT_NAME} works.`,
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
      manualFix: `Connect the VPN and sign in to your portal in its tab, then check again. ${PRODUCT_NAME} never signs in for you.`,
      fixAction: 'open-portal',
      futureRisk: 'the portal session lasts about eight hours; a 302 or 401 after that is the sign to sign in again',
      async check(ctx) {
        const s = await portalOf(ctx).session();
        ctx.cache.session = s;
        if (s.signedIn) {
          await ctx.env.session.set(SESSION_SEEN_KEY, { checked_at: s.checkedAt });
          if (s.username) {
            ctx.cache.user = s.username;
            await ctx.env.local.set(IDENTITY_KEY, { username: s.username, seen_at: s.checkedAt } satisfies IdentityNote);
          }
          return { ok: true, detail: `signed in${s.username ? ` as ${s.username}` : ' (the dashboard shows no username; your access cannot be checked until it does)'}${s.isOnDemand ? '' : ' (the page does not say OnDemand; is this the right portal?)'}`, warn: !s.isOnDemand || !s.username };
        }
        return { ok: false, detail: s.detail };
      },
    },
    {
      id: 'shell',
      title: 'Shell app admits a connection',
      layer: 'login-node',
      dependsOn: ['signed-in'],
      assumption: 'the Shell page carries a token and the socket opens; one discovery batch runs (under a second of login-node CPU) and the shell is closed again',
      manualFix: 'If the shell is refused, the message names the reason: no cluster defined, an origin check behind an extra proxy, or a host not in the allowlist. Those are settings only the portal administrator can change; a different shell host can be tried in the extension settings.',
      futureRisk: 'a site may disable the Shell app; the framing itself has not changed since OnDemand 2.0',
      slow: true,
      async check(ctx) {
        const p = portalOf(ctx);
        const wait = await p.auditWait('discover');
        // the discovery batch asks the login node (one sinfo among cheap reads) at most once a minute
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
        // which copy: the shared-copy marker in ~/.hpcworker (framework 5) means the lab's; a listing that fails says nothing either way
        const inner = installed ? await portalOf(ctx).listDir(paths.root(h)).catch(() => undefined) : undefined;
        const which = !inner ? '' : inner.files.some((f) => f.name === 'shared' && f.type !== 'd') ? " (the lab's shared copy)" : ' (your own copy)';
        return { ok: true, warn: !uploads, detail: `your home folder: ${l.files.length} entries${uploads ? ', uploads allowed' : ', uploads disabled at this site (writes still use PUT)'}${installed ? `; the tool is set up${which}` : '; the tool is not set up yet'}` };
      },
    },
    {
      id: 'active-jobs',
      title: 'Active Jobs lists your clusters',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'GET activejobs.json?jobcluster=all&jobfilter=user answers with data[][] and names no unconfigured cluster in errors (asked at most once a minute: the portal runs squeue for it)',
      manualFix: 'The portal could not ask the scheduler. If errors name a cluster, the portal is misconfigured for it; tell your centre.',
      futureRisk: 'the shape (an array of arrays) is stable since Active Jobs moved into the dashboard; a 5.0 change would show here first',
      async check(ctx) {
        const p = portalOf(ctx);
        const wait = await p.auditWait('jobs');
        if (wait > 0) return { ok: true, skip: true, detail: `the portal's job list was asked less than a minute ago; this check runs again in ${Math.ceil(wait / 1000)} s` };
        const a = await p.activeJobs();
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
      assumption: 'GET /rnode/<shell host>/1/ answers 503 "Failed to connect" when the proxy is on, 404 when it is off; the shell host is the login node the discovery named, else the one in the settings, else the portal host',
      manualFix: 'Nothing to do: without the proxy the worker is read through its files (mailbox mode), which works everywhere.',
      futureRisk: 'a site may narrow host_regex; the probe would then answer 404 for the shell host while compute nodes still match',
      async check(ctx) {
        // the host that was really reached comes from the discovery (hostname -s on the login node);
        // a shell host set by hand is next; the portal host is the last resort and a 404 there says less
        const discovered = discoveryOf(ctx)?.host;
        const setting = ctx.cache.shellHost ?? ctx.settings?.shell_host;
        let host: string;
        let which: string;
        if (discovered) {
          host = discovered;
          which = `the login node the shell reached (${discovered})`;
        } else if (setting && setting !== 'default') {
          host = setting;
          which = `the shell host from the settings (${setting})`;
        } else {
          host = new URL(ctx.settings!.origin).hostname;
          which = `the portal host (${host}), because the shell host is "default" and the discovery did not name the login node; a 404 here can also mean the proxy admits only compute nodes`;
        }
        const r = await portalOf(ctx).probeRnode(host);
        return { ok: true, warn: r.state === 'unknown', detail: `${r.detail}; asked for ${which}` };
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
        const d = discoveryOf(ctx)!;
        const parts: string[] = [];
        if (d.host) parts.push(`login node ${d.host}`);
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
      assumption: 'a short job (ten minutes at most) on the default partition wrote <state_dir>/probe/probe.json: node-local temp and /dev/shm, user namespaces, the container running, and the reach of api.anthropic.com, platform.claude.com and claude.ai with and without the proxy',
      manualFix: 'Run "Set up the cluster" (it installs the tool), then "Run the probe job", and check again once the job has finished.',
      fixAction: 'run-probe',
      futureRisk: 'egress is the least uniform thing across campuses and can change without notice; the probe is cheap to rerun',
      slow: true,
      async check(ctx) {
        const p = await probeFile(ctx);
        if (!p) return { ok: false, detail: 'no probe report yet: the probe job has not run (or has not finished)' };
        const v = probeVerdict(p);
        return { ok: v.ok, warn: v.warn, detail: v.detail };
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
        return v ? { ok: true, detail: `claude ${v} (node ${p?.image?.node_version ?? '?'}, first exec ${p?.image?.first_exec_seconds ?? '?'} s)` } : { ok: false, detail: 'the probe reported no Claude Code version from the worker image' };
      },
    },
    {
      id: 'claude-login',
      title: 'Signed in to Claude on the cluster',
      layer: 'claude',
      dependsOn: ['probe-job'],
      assumption: 'the probe ran `claude auth status` (never reading the credential) and found a sign-in in the configured Claude folder; the job strips CLAUDE_CODE_OAUTH_TOKEN and the other credential variables itself',
      manualFix: SIGN_IN_INSTRUCTION,
      fixAction: 'sign-in-claude',
      futureRisk: 'the sign-in expires after roughly a month; a Remote Control session that outlives it stops making progress',
      async check(ctx) {
        const p = await probeFile(ctx);
        const a = p?.claude_auth;
        // a sign-in made from this browser's login terminal after the probe ran overtakes the probe's word
        const seen = await ctx.env.local.get<LoginSeen>(LOGIN_SEEN_KEY);
        const probeAt = p?.when ? new Date(p.when).getTime() : 0;
        if (seen && new Date(seen.at).getTime() > probeAt) return { ok: true, detail: `signed in from this browser on ${seen.at.slice(0, 16).replace('T', ' ')}${seen.detail ? ` (${seen.detail})` : ''}; the next probe will confirm it` };
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
      assumption: 'the student\'s answer to Claude Code\'s one-time "Enable Remote Control?" is on record: Claude Code\'s own settings file (remoteDialogSeen), or the marker file ' + PRODUCT_NAME + ' writes when the data statement is acknowledged; the probe reads that; the image\'s `claude remote-control` accepts the flags the job uses',
      manualFix: `Make the data statement in the strip at the top: it writes the answer for your worker. ${SIGN_IN_INSTRUCTION} If a running job reports "Couldn't verify Remote Control eligibility", the compute nodes cannot reach Anthropic's feature-flag service; tell your centre.`,
      fixAction: 'acknowledge',
      futureRisk: 'Anthropic can change Remote Control eligibility for a plan class at any time; a running job\'s status.json is where it would show',
      async check(ctx) {
        const p = await probeFile(ctx);
        if (p?.consent_recorded === undefined) return { ok: false, detail: 'the probe did not report on your Remote Control answer' };
        if (!p.consent_recorded) return { ok: false, detail: 'your answer to "Enable Remote Control?" was not on record when the probe ran (the data statement in the strip records it; the job waits for it otherwise)' };
        if (p.remote_control_flags === '') {
          // signed out, `claude remote-control --help` prints nothing (measured on the grid, probe of 2026-09-29 04:06Z); that says nothing about the version
          if (!p.claude_auth?.loggedIn) return { ok: true, warn: true, detail: `your answer is ${consentSourceWords(p.consent_source) || 'on record'}; whether this Claude Code can host Remote Control is known once you are signed in (the probe ran signed out; the next probe after the sign-in tells)` };
          return { ok: false, detail: 'your answer is on record, but Claude Code printed no Remote Control options inside the image while signed in: this Claude Code may be too old for Remote Control' };
        }
        const trust = p.workspace_trusted === false ? '; the workspace is not yet trusted in Claude Code (the job records that itself at the first start)' : '';
        return { ok: true, detail: `your answer is ${consentSourceWords(p.consent_source) || 'on record'}${trust}${p.remote_control_flags ? `; remote-control flags: ${p.remote_control_flags.slice(0, 80)}` : ''}` };
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
        if (!x.host_writable) return { ok: false, detail: 'the runtime directory in /dev/shm is not writable on the node' };
        if (!inImage) return { ok: false, detail: `the runtime directory is writable on the node but not inside the image (${String(x.in_image ?? 'not reported')})` };
        return { ok: true, detail: 'the runtime directory in /dev/shm works on the node and inside the image' };
      },
    },
    {
      id: 'data-classification',
      title: 'Data classification acknowledged',
      layer: 'student',
      dependsOn: ['access'],
      assumption: 'the worker\'s workspace is not marked restricted (no .restricted file in it, read from the workspace\'s listing; no profile flag), and the student read where the transcript goes and made the data statement for this workspace on the text now in force (kept in this browser per workspace; asked again when the text or the workspace changes)',
      manualFix: 'Read the disclosure in the strip and tick the statement for the worker you will start. A workspace marked restricted is never started: remove the marker in the portal\'s Files app only if the restriction no longer applies.',
      fixAction: 'acknowledge',
      futureRisk: 'a change of plan class (Team, Enterprise, ZDR) changes what the disclosure must say',
      async check(ctx) {
        const name = ctx.prefs.worker_name;
        // the restricted half first: it needs the portal, and its absence is noted, never failed
        let restricted: string | undefined;
        let markerNote = '';
        try {
          const sd = await stateDir(ctx);
          if (profileRestricts(ctx.cache.profile, name)) restricted = `the site profile marks the workspace of worker "${name}" restricted`;
          else if (await portalOf(ctx).exists(paths.restrictedMarker(sd, name))) restricted = `the workspace of worker "${name}" is marked restricted (.restricted file present)`;
          else markerNote = '; the workspace is not marked restricted';
        } catch {
          markerNote = '; the restricted marker could not be checked (no portal tab)';
        }
        if (restricted) return { ok: false, detail: `${restricted}; the worker will not start there` };
        const ack = statementFor(await ctx.env.local.get<Statements>(STATEMENTS_KEY), name);
        if (!ack) return { ok: false, detail: `the data statement has not been made for worker "${name}" on the text now in force${markerNote}` };
        return { ok: true, warn: !ack.consent_written_at, detail: `statement made for worker "${name}" on ${ack.acknowledged_at.slice(0, 10)}${ack.consent_written_at ? '; the consent marker is written on the cluster' : '; the consent marker is written at the next start'}${markerNote}` };
      },
    },
    {
      id: 'session-lifetime',
      title: 'Portal session age',
      layer: 'portal',
      dependsOn: ['signed-in'],
      assumption: 'the portal session lasts about eight hours; after that (or on the first 302/401) the student signs in again in a tab and nothing is cached across the re-login',
      manualFix: `Sign in to the portal again in its tab. ${PRODUCT_NAME} keeps nothing from the old session.`,
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
export const CHECK_IDS = ['access', 'origin-granted', 'portal-tab', 'signed-in', 'shell', 'files', 'active-jobs', 'optional-routes', 'reverse-proxy', 'login-discovery', 'probe-job', 'worker-binary', 'claude-login', 'remote-control-ready', 'xdg-runtime', 'data-classification', 'session-lifetime'];
