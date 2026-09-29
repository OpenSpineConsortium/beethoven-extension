// The seventeen checks: their order is the report's, their dependencies hold, a failure blocks
// its dependants with the root cause named, and with a fake portal serving the framework's files
// (profile.json, probe.json in probe.sbatch's shape) the portal-side and compute-side checks pass.
// Also: each floor class has its own clock (a full run never trips itself), the reverse-proxy
// probe says which host it asked, the restricted marker refuses check 16, and check 1 reads the
// access service's record for the account the dashboard showed (nothing typed, nothing fetched).
import { describe, expect, it } from 'vitest';
import type { EndpointClass } from '../src/core/audit';
import { buildNodes, CHECK_IDS, type DiagCtx, type DiagEnv } from '../src/core/checks';
import { formatReport, order, runDiagnostics } from '../src/core/diagnostics';
import { ackSubject, makeAcknowledgement, STATEMENTS_KEY, type Statements } from '../src/core/disclosure';
import { ACCESS_KEY, IDENTITY_KEY, KILLLIST_KEY, type PortalSettings } from '../src/core/keys';
import type { PortalApi } from '../src/core/portal';
import { TERMS_KEY, TERMS_VERSION } from '../src/core/terms';
import { APPROVED_TTL_MS, type AccessRecord } from '../src/licensing/access';
import { memoryKV, NOW } from './helpers';

const NOW_MS = NOW * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
/** the access service's last word, as the background records it */
const record = (o: Partial<AccessRecord> & { agoMs?: number } = {}): AccessRecord => {
  const { agoMs = 3_600_000, ...rest } = o;
  return { v: 1, access_id: 'ab1234', portal: 'ood.example', approved: true, checked_at: iso(NOW_MS - agoMs), until: null, last_attempt_at: iso(NOW_MS - agoMs), ...rest };
};
const PROFILE = JSON.stringify({ schema_version: 1, site: 'wayne', scheduler: 'slurm', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker' });
const STATE = '/rs/rs_grp_oschome/ab1234/hpcworker';
const DISCOVER_JSON = '{"version":1,"host":"warrior","scheduler":{"family":"slurm"},"runtime":{"candidates":[{"name":"apptainer"}],"modules":["apptainer/1.2.2"],"pyxis":false,"user_namespaces":{"max":15000}},"partitions":[{"name":"reqp","timelimit":"7-00:00:00","avail":"up"}],"tools":{"tmux":"/usr/bin/tmux","python3":"/usr/bin/python3"},"os":"CentOS Linux 7 (Core)"}';

interface FakeOpts {
  probe?: Record<string, unknown>;
  withProfile?: boolean;
  profile?: string;
  /** extra files served by path */
  files?: Record<string, string>;
  discoverOutput?: string;
}

function fakePortal(over: Partial<PortalApi> = {}, o: FakeOpts = {}): PortalApi {
  const files = new Map<string, string>(Object.entries(o.files ?? {}));
  if (o.withProfile !== false) files.set('/home/ab1234/.hpcworker/profile.json', o.profile ?? PROFILE);
  if (o.probe) files.set(`${STATE}/probe/probe.json`, JSON.stringify(o.probe));
  return {
    session: async () => ({ ok: true, status: 200, finalUrl: 'https://ood.example/pun/sys/dashboard/', signedIn: true, isOnDemand: true, csrf: 't', username: 'ab1234', checkedAt: new Date(NOW * 1000).toISOString(), detail: 'signed in to the portal' }),
    warm: async () => ({ ok: true, attempts: 1, status: 200, signedIn: true, detail: 'your portal is awake', session: await fakePortal().session() }),
    whoAmI: async () => 'ab1234',
    home: async () => '/home/ab1234',
    listDir: async (p) => ({ path: p, files: [{ id: '1', type: 'd', name: '.hpcworker', size: 0, modified_at: 0, owner: 'ab1234', mode: 0 }], files_upload_path: '/x' }),
    readFile: async (p) => {
      const f = files.get(p);
      if (f === undefined) throw Object.assign(new Error('404'), { status: 404 });
      return f;
    },
    readFileIfExists: async (p) => files.get(p),
    // existence from the parent's listing, as the real client does; the fake keeps files by full path
    stat: async (p) => (files.has(p) ? { id: p, type: 'f', name: p.split('/').pop() ?? '', size: 0, modified_at: 0, owner: 'ab1234', mode: 0 } : undefined),
    exists: async (p) => files.has(p),
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    touch: async (p) => void files.set(p, ''),
    activeJobs: async () => ({ jobs: [], clusters: ['wayne'], errors: [] }),
    cancelJob: async () => undefined,
    shell: async () => ({ output: o.discoverOutput ?? DISCOVER_JSON, exitCode: 0, transcript: '', ms: 900 }),
    probeRnode: async () => ({ state: 'disabled', status: 404, detail: 'off' }),
    probeRoutes: async () => ({ workflows_json: 404, projects: 200 }),
    auditWait: async () => 0,
    auditRecords: async () => [],
    auditExport: async () => '',
    auditClear: async () => undefined,
    ...over,
  };
}

async function ctxWith(opts: { terms?: boolean; /** the access record on file; null for none (default: approved an hour ago) */ access?: AccessRecord | null; settings?: boolean; granted?: boolean; alive?: boolean; portal?: PortalApi; ack?: boolean; /** the account name the dashboard showed; null for none (default ab1234) */ observed?: string | null; worker?: string }): Promise<DiagCtx> {
  const local = memoryKV();
  const session = memoryKV();
  if (opts.terms !== false) await local.set(TERMS_KEY, { v: 1, terms_version: TERMS_VERSION, edition: 'trial', signed_name: 'A. Student' });
  if (opts.access !== null) await local.set(ACCESS_KEY, opts.access ?? record());
  if (opts.observed !== null) await local.set(IDENTITY_KEY, { username: opts.observed ?? 'ab1234' });
  const worker = opts.worker ?? 'worker';
  if (opts.ack) await local.set(STATEMENTS_KEY, { [ackSubject(worker)]: makeAcknowledgement(worker) } satisfies Statements);
  const settings: PortalSettings | undefined = opts.settings === false ? undefined : { origin: 'https://ood.example', hostname: 'ood.example', connected_at: '2026-09-28T00:00:00Z', shell_host: 'default', site: 'wayne' };
  const env: DiagEnv = {
    version: '1.0.0',
    now: () => new Date(NOW * 1000),
    local,
    session,
    hasOriginPermission: async () => opts.granted !== false,
    portalAlive: async () => opts.alive !== false,
    portal: () => opts.portal,
  };
  return { env, settings, prefs: { worker_name: worker, permission_mode: 'default', auto_start: true, open_claude_on_connect: true }, cache: {} };
}

const byId = (rep: Awaited<ReturnType<typeof runDiagnostics>>) => Object.fromEntries(rep.reports.map((r) => [r.id, r]));

/** probe.json as jobs/probe.sbatch writes it, on a good day */
const GOOD_PROBE = {
  version: 1,
  when: '2026-09-28T01:00:00Z',
  job: '4243100',
  hostname: 'asx15',
  os: 'CentOS Linux 7 (Core)',
  glibc: '2.17',
  node_tmp: { path: '/tmp/ab1234/hpcworker_4243100', ok: true, free_gb: 210, fs: 'xfs', device: '/dev/sda3' },
  tmpdir: { value: '/wsu/tmp', fs: 'ceph', device: 'ceph-fuse', node_local: false },
  dev_shm: { size_kb: 65000000, free_kb: 64000000, writable: true },
  user_namespaces: { max: 15000, unshare_works: true },
  run_user_dir: { path: '/run/user/1000', present: false },
  xdg_fix: { dir: '/dev/shm/ab1234/xdg', host_writable: true, in_image: 'true' },
  tmux: { present: true, version: 'tmux 1.8' },
  script_present: true,
  runtime: { ok: true, name: 'apptainer', bin: '/wsu/el7/gnu7/apptainer/1.2.2/bin/apptainer', module: 'apptainer/1.2.2', version: 'apptainer version 1.2.2' },
  image: { type: 'sandbox', path: '/rs/shared/claude-node22', node_version: 'v22.12.0', claude_version: '2.1.283 (Claude Code)', first_exec_seconds: 3, curl_api_from_image: '404' },
  remote_control_flags: '--name --capacity --permission-mode --continue',
  claude_auth: { loggedIn: true, subscriptionType: 'max', email: 'a@wayne.edu', authMethod: 'claude.ai', config_dir_present: true },
  consent_recorded: true,
  egress: { class: 'direct', inherited_proxy: {}, with_inherited_env: { 'api.anthropic.com': '404', 'platform.claude.com': '200', 'claude.ai': '403' }, without_proxy_vars: { 'api.anthropic.com': '404', 'platform.claude.com': '200', 'claude.ai': '403' }, 'statsig.anthropic.com': 'no DNS record' },
};

describe('diagnostics', () => {
  it('has the seventeen checks of the report, in its order, with every dependency earlier in the list', () => {
    const nodes = buildNodes();
    expect(nodes.map((n) => n.id)).toEqual(CHECK_IDS);
    expect(CHECK_IDS).toHaveLength(17);
    expect(order(nodes).map((n) => n.id)).toEqual(CHECK_IDS);
    const seen = new Set<string>();
    for (const n of nodes) {
      for (const d of n.dependsOn) expect(seen.has(d), `${n.id} depends on ${d}, which must come earlier`).toBe(true);
      seen.add(n.id);
    }
    for (const n of nodes) {
      expect(n.title.length).toBeGreaterThan(3);
      expect(n.manualFix.length).toBeGreaterThan(10);
      expect(n.assumption.length).toBeGreaterThan(10);
    }
  });

  it('refuses a graph with an unknown dependency or a cycle', () => {
    const n = buildNodes();
    expect(() => order([{ ...n[0]!, dependsOn: ['nope'] }])).toThrow(/unknown/);
    expect(() => order([{ ...n[0]!, id: 'a', dependsOn: ['b'] }, { ...n[1]!, id: 'b', dependsOn: ['a'] }])).toThrow(/cycle/);
  });

  it('with no portal connected, the portal checks are blocked and name the root cause', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ settings: false }));
    const by = byId(rep);
    // a warn, not a fail: the approval on file stands but no kill-list has been fetched yet in this fresh store
    expect(['ok', 'warn']).toContain(by['access']!.status);
    expect(by['origin-granted']!.status).toBe('fail');
    expect(by['origin-granted']!.fixAction).toBe('connect-portal');
    for (const id of ['portal-tab', 'signed-in', 'shell', 'files', 'active-jobs', 'login-discovery', 'probe-job', 'worker-binary', 'claude-login', 'remote-control-ready', 'xdg-runtime', 'session-lifetime']) {
      expect(by[id]!.status, id).toBe('blocked');
      expect(by[id]!.rootCause, id).toBe('origin-granted');
    }
    expect(by['data-classification']!.status).toBe('fail');
    expect(by['data-classification']!.detail).toMatch(/restricted marker could not be checked/);
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['origin-granted', 'data-classification']);
    expect(formatReport(rep)).toMatch(/2 thing\(s\) to fix/);
  });

  it('without accepted terms check 1 fails and points at the setup page; without an approval it fails and says what the service said', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ terms: false, portal: fakePortal() }));
    const acc = rep.reports.find((r) => r.id === 'access')!;
    expect(acc.status).toBe('fail');
    expect(acc.detail).toMatch(/not been accepted/);
    expect(acc.fixAction).toBe('open-onboarding');
    const none = byId(await runDiagnostics(buildNodes(), await ctxWith({ access: null, portal: fakePortal() })));
    expect(none['access']!.status).toBe('fail');
    expect(none['access']!.detail).toMatch(/not checked yet for ab1234 at ood\.example/);
    const denied = byId(await runDiagnostics(buildNodes(), await ctxWith({ access: record({ approved: false, until: undefined }), portal: fakePortal() })));
    expect(denied['access']!.status).toBe('fail');
    expect(denied['access']!.detail).toMatch(/ab1234 at ood\.example is not on the approved list yet/);
    // everything student-side downstream is blocked on it, and the portal checks are not
    expect(denied['data-classification']!.status).toBe('blocked');
    expect(denied['data-classification']!.rootCause).toBe('access');
    expect(denied['signed-in']!.status).toBe('ok');
    const withdrawn = byId(await runDiagnostics(buildNodes(), await ctxWith({ access: record({ approved: false, until: undefined, withdrawn: true }), portal: fakePortal() })));
    expect(withdrawn['access']!.detail).toMatch(/^Access withdrawn: ask again/);
  });

  it('check 1 reads "Access approved for <account> at <portal> (checked <time>); kill-list of <date>", WARN past a day, FAIL past seven days or when the account is someone else', async () => {
    const ctx = await ctxWith({ portal: fakePortal(), observed: 'ab1234' });
    await ctx.env.local.set(KILLLIST_KEY, { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: [], revoked_lids: [], message: '' } });
    const ok = byId(await runDiagnostics(buildNodes(), ctx));
    expect(ok['access']!.status).toBe('ok');
    expect(ok['access']!.detail).toBe(`Access approved for ab1234 at ood.example (checked ${iso(NOW_MS - 3_600_000).slice(0, 16).replace('T', ' ')} UTC); kill-list of 2026-09-21`);
    // no kill-list fetched yet: a warn that says so
    const noList = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal() })));
    expect(noList['access']!.status).toBe('warn');
    expect(noList['access']!.detail).toMatch(/kill-list not fetched yet/);
    // an approval older than a day that the service has not confirmed since: WARN
    const stale = await ctxWith({ portal: fakePortal(), access: record({ agoMs: APPROVED_TTL_MS + 1, last_error: 'ENETUNREACH' }) });
    await stale.env.local.set(KILLLIST_KEY, { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: [], revoked_lids: [], message: '' } });
    const staleBy = byId(await runDiagnostics(buildNodes(), stale));
    expect(staleBy['access']!.status).toBe('warn');
    expect(staleBy['access']!.detail).toMatch(/has not confirmed it since \(ENETUNREACH\); kept for seven days/);
    // older than seven days: FAIL
    const lapsed = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal(), access: record({ agoMs: 8 * 86_400_000, last_error: 'ENETUNREACH' }) })));
    expect(lapsed['access']!.status).toBe('fail');
    expect(lapsed['access']!.detail).toMatch(/has not answered for seven days/);
    // the dashboard shows another account than the one approved: the record does not count
    const other = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal(), observed: 'zz9999' })));
    expect(other['access']!.status).toBe('fail');
    expect(other['access']!.detail).toMatch(/not checked yet for zz9999/);
    // no account name on record at all
    const noId = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal(), observed: null })));
    expect(noId['access']!.status).toBe('fail');
    expect(noId['access']!.detail).toMatch(/cannot be checked until your portal shows who is signed in/);
    // a withdrawn version
    const rev = await ctxWith({ portal: fakePortal() });
    await rev.env.local.set(KILLLIST_KEY, { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: ['1.0.0'], revoked_lids: [], message: 'update please' } });
    const revBy = byId(await runDiagnostics(buildNodes(), rev));
    expect(revBy['access']!.status).toBe('fail');
    expect(revBy['access']!.detail).toBe('this version (1.0.0) has been withdrawn; update to continue. update please');
  });

  it('check 4 records the account name the dashboard shows, and nothing else ever writes it', async () => {
    const ctx = await ctxWith({ portal: fakePortal(), observed: null, access: null });
    await runDiagnostics(buildNodes(), ctx);
    expect(await ctx.env.local.get(IDENTITY_KEY)).toMatchObject({ username: 'ab1234' });
    const by = byId(await runDiagnostics(buildNodes(), { ...ctx, cache: {} }));
    expect(by['signed-in']!.detail).toMatch(/signed in as ab1234/);
    // a dashboard without a username says so, and does not write one
    const anon = await ctxWith({ portal: fakePortal({ session: async () => ({ ...(await fakePortal().session()), username: undefined }) }), observed: null });
    const anonBy = byId(await runDiagnostics(buildNodes(), anon));
    expect(anonBy['signed-in']!.status).toBe('warn');
    expect(anonBy['signed-in']!.detail).toMatch(/your access cannot be checked until it does/);
    expect(await anon.env.local.get(IDENTITY_KEY)).toBeUndefined();
  });

  it('with a portal and a good probe everything passes; the shell is opened once and its output feeds checks 9 and 10', async () => {
    let shells = 0;
    const portal = fakePortal({ shell: async (...a) => { shells++; return fakePortal().shell(...a); } }, { probe: GOOD_PROBE });
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal, ack: true, observed: 'ab1234' }));
    const bad = rep.reports.filter((r) => r.status === 'fail' || r.status === 'blocked');
    expect(bad.map((r) => `${r.id}: ${r.detail}`)).toEqual([]);
    expect(shells).toBe(1);
    const by = byId(rep);
    expect(by['login-discovery']!.detail).toMatch(/login node warrior/);
    expect(by['login-discovery']!.detail).toMatch(/scheduler slurm/);
    expect(by['login-discovery']!.detail).toMatch(/apptainer/);
    expect(by['reverse-proxy']!.detail).toMatch(/probed \/rnode\/warrior\/1\/, the login node the shell reached/);
    expect(by['probe-job']!.detail).toMatch(/egress direct/);
    expect(by['probe-job']!.detail).toMatch(/asx15/);
    expect(by['worker-binary']!.detail).toMatch(/2\.1\.283/);
    expect(by['claude-login']!.detail).toMatch(/a@wayne.edu, max/);
    expect(by['remote-control-ready']!.status).toBe('ok');
    expect(by['xdg-runtime']!.status).toBe('ok');
    expect(by['data-classification']!.detail).toMatch(/statement made for worker "worker".*the workspace is not marked restricted/);
    expect(by['session-lifetime']!.status).toBe('ok');
  });

  it('the reverse-proxy probe names the host it asked: the settings host, else the portal host with the caveat', async () => {
    // the fallback discovery (no JSON) names no login node; the shell host is "default": the portal host is probed
    const fallback = 'sched=/usr/bin/sbatch\nrt=\nuserns=0\nos=Rocky\npart=reqp*|7-00:00:00|up\n';
    const hosts: string[] = [];
    const portal = fakePortal({ probeRnode: async (h) => { hosts.push(h); return { state: 'disabled', status: 404, detail: 'off' }; } }, { probe: GOOD_PROBE, discoverOutput: fallback });
    const rep = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal, ack: true })));
    expect(hosts).toEqual(['ood.example']);
    expect(rep['reverse-proxy']!.detail).toMatch(/the portal host \(ood.example\), because the shell host is "default"/);
    // a shell host set by hand is used when the discovery names none
    const ctx = await ctxWith({ portal: fakePortal({ probeRnode: async (h) => { hosts.push(h); return { state: 'enabled', status: 503, detail: 'on' }; } }, { probe: GOOD_PROBE, discoverOutput: fallback }), ack: true });
    ctx.settings!.shell_host = 'login2';
    const rep2 = byId(await runDiagnostics(buildNodes(), ctx));
    expect(hosts.at(-1)).toBe('login2');
    expect(rep2['reverse-proxy']!.detail).toMatch(/the shell host from the settings \(login2\)/);
  });

  it('the probe is read from the profile\'s shared_state_dir, expanded with the username', async () => {
    // without a profile the tool's own folder is assumed, so a probe written under the CephFS path is not found
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: GOOD_PROBE, withProfile: false }), ack: true }));
    const probe = rep.reports.find((r) => r.id === 'probe-job')!;
    expect(probe.status).toBe('fail');
    expect(probe.detail).toMatch(/\/home\/ab1234\/\.hpcworker\/probe\/probe\.json/);
  });

  it('a probe that finds no egress, no sign-in or no consent says so in plain words', async () => {
    const noEgress = { ...GOOD_PROBE, egress: { class: 'none', with_inherited_env: { 'api.anthropic.com': '000', 'platform.claude.com': '000', 'claude.ai': '000' }, without_proxy_vars: { 'api.anthropic.com': '000', 'platform.claude.com': '000', 'claude.ai': '000' } } };
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: noEgress }), ack: true }));
    const by = byId(rep);
    expect(by['probe-job']!.status).toBe('fail');
    expect(by['probe-job']!.detail).toMatch(/cannot reach api.anthropic.com/);
    // everything downstream of the probe is blocked on it, so one root cause is reported, not four
    expect(by['claude-login']!.status).toBe('blocked');
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['probe-job']);

    const notSignedIn = { ...GOOD_PROBE, claude_auth: { loggedIn: false, config_dir_present: false }, consent_recorded: false };
    const by2 = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: notSignedIn }), ack: true })));
    expect(by2['claude-login']!.status).toBe('fail');
    expect(by2['claude-login']!.detail).toMatch(/not signed in/);
    expect(by2['claude-login']!.fixAction).toBe('sign-in-claude');
    expect(by2['remote-control-ready']!.status).toBe('blocked');

    const noConsent = { ...GOOD_PROBE, consent_recorded: false, xdg_fix: { dir: '/dev/shm/ab1234/xdg', host_writable: true, in_image: 'EACCES' } };
    const by3 = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: noConsent }), ack: true })));
    expect(by3['remote-control-ready']!.status).toBe('fail');
    expect(by3['remote-control-ready']!.detail).toMatch(/Enable Remote Control/);
    expect(by3['xdg-runtime']!.status).toBe('fail');
    expect(by3['xdg-runtime']!.detail).toMatch(/inside the image/);
  });

  it('empty Remote Control flags from a probe that ran signed out are "known once you are signed in", not "too old"', async () => {
    // measured on the grid (probe of 2026-09-29 04:06Z, signed out): `flags: ` empty; the signed-in worker listed them
    const signedOut = { ...GOOD_PROBE, remote_control_flags: '', claude_auth: { loggedIn: false, config_dir_present: true } };
    const ctx = await ctxWith({ portal: fakePortal({}, { probe: signedOut }), ack: true });
    // the sign-in made from this browser since the probe satisfies check 13, so check 14 runs
    await ctx.env.local.set('bridge.loginSeen', { at: '2026-09-28T02:00:00Z', detail: 'a@wayne.edu max' });
    const by = byId(await runDiagnostics(buildNodes(), ctx));
    expect(by['claude-login']!.status).toBe('ok');
    expect(by['remote-control-ready']!.status).toBe('warn');
    expect(by['remote-control-ready']!.detail).toMatch(/known once you are signed in/);
    expect(by['remote-control-ready']!.detail).not.toMatch(/too old/);
    // signed in at probe time and still no flags: that is the old-version verdict
    const signedInNoFlags = { ...GOOD_PROBE, remote_control_flags: '' };
    const by2 = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: signedInNoFlags }), ack: true })));
    expect(by2['remote-control-ready']!.status).toBe('fail');
    expect(by2['remote-control-ready']!.detail).toMatch(/too old/);
  });

  it('a workspace marked restricted (its .restricted file, or the profile) fails check 16 even with the statement made', async () => {
    const marker = { [`${STATE}/workspaces/worker/.restricted`]: '' };
    const by = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: GOOD_PROBE, files: marker }), ack: true })));
    expect(by['data-classification']!.status).toBe('fail');
    expect(by['data-classification']!.detail).toMatch(/marked restricted \(\.restricted file present\); the worker will not start there/);
    const profile = JSON.stringify({ schema_version: 1, site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker', restricted_workspaces: ['worker'] });
    const by2 = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: GOOD_PROBE, profile }), ack: true })));
    expect(by2['data-classification']!.status).toBe('fail');
    expect(by2['data-classification']!.detail).toMatch(/site profile marks the workspace of worker "worker" restricted/);
    // another worker's marker does not touch this one
    const by3 = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: GOOD_PROBE, files: marker }), ack: true, worker: 'thesis' })));
    // a warn, not a fail: the statement is made and the consent marker is written at the next start
    expect(by3['data-classification']!.status).toBe('warn');
    expect(by3['data-classification']!.detail).toMatch(/consent marker is written at the next start/);
  });

  it('each floor class has its own clock: a running jobs clock skips check 7 only, a running discover clock skips check 5 and its dependants', async () => {
    const jobsBusy = fakePortal({ auditWait: async (cls: EndpointClass) => (cls === 'jobs' ? 30_000 : 0) }, { probe: GOOD_PROBE });
    const rep = byId(await runDiagnostics(buildNodes(), await ctxWith({ portal: jobsBusy, ack: true })));
    expect(rep['active-jobs']!.status).toBe('skipped');
    expect(rep['active-jobs']!.detail).toMatch(/job list was asked less than a minute ago/);
    expect(rep['shell']!.status).toBe('ok');
    expect(rep['login-discovery']!.status).toBe('ok');
    expect(rep['probe-job']!.status).toBe('ok');

    const discoverBusy = fakePortal({ auditWait: async (cls: EndpointClass) => (cls === 'discover' ? 42_000 : 0) }, { probe: GOOD_PROBE });
    const rep2 = await runDiagnostics(buildNodes(), await ctxWith({ portal: discoverBusy, ack: true }));
    const by2 = byId(rep2);
    expect(by2['shell']!.status).toBe('skipped');
    expect(by2['login-discovery']!.status).toBe('skipped');
    expect(by2['probe-job']!.status).toBe('skipped');
    expect(by2['active-jobs']!.status).toBe('ok');
    expect(rep2.ok).toBe(true);
  });

  it('a quick run skips the slow checks', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, { probe: GOOD_PROBE }), ack: true }), { quick: true });
    const by = byId(rep);
    expect(by['shell']!.status).toBe('skipped');
    expect(by['files']!.status).toBe('ok');
    expect(by['files']!.detail).toMatch(/hpcworker is installed/);
  });
});
