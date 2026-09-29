// The seventeen checks: their order is the report's, their dependencies hold, a failure blocks
// its dependants with the root cause named, and with a fake portal serving the framework's files
// (profile.json, probe.json in probe.sbatch's shape) the portal-side and compute-side checks pass.
import { describe, expect, it } from 'vitest';
import { buildNodes, CHECK_IDS, type DiagCtx, type DiagEnv } from '../src/core/checks';
import { formatReport, order, runDiagnostics } from '../src/core/diagnostics';
import { ACK_KEY, ackSubject, DATA_CLASSIFICATION_STATEMENT } from '../src/core/disclosure';
import { LICENSE_KEY, type PortalSettings } from '../src/core/keys';
import type { PortalApi } from '../src/core/portal';
import { TERMS_KEY, TERMS_VERSION } from '../src/core/terms';
import { issuer, memoryKV, NOW } from './helpers';

const I = issuer();
const PROFILE = JSON.stringify({ schema_version: 1, site: 'wayne', scheduler: 'slurm', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker' });
const STATE = '/rs/rs_grp_oschome/ab1234/hpcworker';

function fakePortal(over: Partial<PortalApi> = {}, probe?: Record<string, unknown>, withProfile = true): PortalApi {
  const files = new Map<string, string>();
  if (withProfile) files.set('/home/ab1234/.hpcworker/profile.json', PROFILE);
  if (probe) files.set(`${STATE}/probe/probe.json`, JSON.stringify(probe));
  return {
    session: async () => ({ ok: true, status: 200, finalUrl: 'https://ood.example/pun/sys/dashboard/', signedIn: true, isOnDemand: true, csrf: 't', username: 'ab1234', checkedAt: new Date(NOW * 1000).toISOString(), detail: 'signed in to the portal' }),
    whoAmI: async () => 'ab1234',
    home: async () => '/home/ab1234',
    listDir: async (p) => ({ path: p, files: [{ id: '1', type: 'd', name: '.hpcworker', size: 0, modified_at: 0, owner: 'ab1234', mode: 0 }], files_upload_path: '/x' }),
    readFile: async (p) => {
      const f = files.get(p);
      if (f === undefined) throw Object.assign(new Error('404'), { status: 404 });
      return f;
    },
    readFileIfExists: async (p) => files.get(p),
    writeFile: async () => undefined,
    mkdir: async () => undefined,
    activeJobs: async () => ({ jobs: [], clusters: ['wayne'], errors: [] }),
    cancelJob: async () => undefined,
    shell: async () => ({ output: '{"version":1,"scheduler":{"family":"slurm"},"runtime":{"candidates":[{"name":"apptainer"}],"modules":["apptainer/1.2.2"],"pyxis":false,"user_namespaces":{"max":15000}},"partitions":[{"name":"reqp","timelimit":"7-00:00:00","avail":"up"}],"tools":{"tmux":"/usr/bin/tmux","python3":"/usr/bin/python3"},"os":"CentOS Linux 7 (Core)"}', exitCode: 0, transcript: '', ms: 900 }),
    probeRnode: async () => ({ state: 'disabled', status: 404, detail: 'off' }),
    probeRoutes: async () => ({ workflows_json: 404, projects: 200 }),
    auditWait: async () => 0,
    auditRecords: async () => [],
    auditExport: async () => '',
    auditClear: async () => undefined,
    ...over,
  };
}

async function ctxWith(opts: { terms?: boolean; key?: boolean; settings?: boolean; granted?: boolean; alive?: boolean; portal?: PortalApi; ack?: boolean }): Promise<DiagCtx> {
  const local = memoryKV();
  const session = memoryKV();
  if (opts.terms !== false) await local.set(TERMS_KEY, { v: 1, terms_version: TERMS_VERSION, edition: 'trial', signed_name: 'A. Student' });
  if (opts.key !== false) await local.set(LICENSE_KEY, { key: I.license(), identity: { accessId: 'ab1234' }, saved_at: 'x' });
  if (opts.ack) await session.set(ACK_KEY, { v: 1, work_dir: ackSubject('worker'), disclosure_at: 'x', classification_at: 'x', statement: DATA_CLASSIFICATION_STATEMENT });
  const settings: PortalSettings | undefined = opts.settings === false ? undefined : { origin: 'https://ood.example', hostname: 'ood.example', connected_at: '2026-09-28T00:00:00Z', shell_host: 'default', site: 'wayne' };
  const env: DiagEnv = {
    version: '1.0.0',
    now: () => new Date(NOW * 1000),
    local,
    session,
    keys: I.keys,
    hasOriginPermission: async () => opts.granted !== false,
    portalAlive: async () => opts.alive !== false,
    portal: () => opts.portal,
  };
  return { env, settings, prefs: { worker_name: 'worker', permission_mode: 'default' }, cache: {} };
}

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
    const by = Object.fromEntries(rep.reports.map((r) => [r.id, r]));
    // a warn, not a fail: the key verifies but no kill-list has been fetched yet in this fresh store
    expect(['ok', 'warn']).toContain(by['licence']!.status);
    expect(by['origin-granted']!.status).toBe('fail');
    expect(by['origin-granted']!.fixAction).toBe('connect-portal');
    for (const id of ['portal-tab', 'signed-in', 'shell', 'files', 'active-jobs', 'login-discovery', 'probe-job', 'worker-binary', 'claude-login', 'remote-control-ready', 'xdg-runtime', 'session-lifetime']) {
      expect(by[id]!.status, id).toBe('blocked');
      expect(by[id]!.rootCause, id).toBe('origin-granted');
    }
    expect(by['data-classification']!.status).toBe('fail');
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['origin-granted', 'data-classification']);
    expect(formatReport(rep)).toMatch(/2 thing\(s\) to fix/);
  });

  it('without accepted terms the licence check fails and points at the setup page', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ terms: false, portal: fakePortal() }));
    const lic = rep.reports.find((r) => r.id === 'licence')!;
    expect(lic.status).toBe('fail');
    expect(lic.detail).toMatch(/not been accepted/);
    expect(lic.fixAction).toBe('open-onboarding');
    const rep2 = await runDiagnostics(buildNodes(), await ctxWith({ key: false, portal: fakePortal() }));
    expect(rep2.reports.find((r) => r.id === 'licence')!.detail).toMatch(/no licence key/);
  });

  it('with a portal and a good probe everything passes; the shell is opened once and its output feeds check 10', async () => {
    let shells = 0;
    const portal = fakePortal({ shell: async (...a) => { shells++; return fakePortal().shell(...a); } }, GOOD_PROBE);
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal, ack: true }));
    const bad = rep.reports.filter((r) => r.status === 'fail' || r.status === 'blocked');
    expect(bad.map((r) => `${r.id}: ${r.detail}`)).toEqual([]);
    expect(shells).toBe(1);
    const by = Object.fromEntries(rep.reports.map((r) => [r.id, r]));
    expect(by['login-discovery']!.detail).toMatch(/scheduler slurm/);
    expect(by['login-discovery']!.detail).toMatch(/apptainer/);
    expect(by['probe-job']!.detail).toMatch(/egress direct/);
    expect(by['probe-job']!.detail).toMatch(/asx15/);
    expect(by['worker-binary']!.detail).toMatch(/2\.1\.283/);
    expect(by['claude-login']!.detail).toMatch(/a@wayne.edu, max/);
    expect(by['remote-control-ready']!.status).toBe('ok');
    expect(by['xdg-runtime']!.status).toBe('ok');
    expect(by['data-classification']!.detail).toMatch(/worker "worker"/);
    expect(by['session-lifetime']!.status).toBe('ok');
  });

  it('the probe is read from the profile\'s shared_state_dir, expanded with the username', async () => {
    // without a profile the tool's own folder is assumed, so a probe written under the CephFS path is not found
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, GOOD_PROBE, false), ack: true }));
    const probe = rep.reports.find((r) => r.id === 'probe-job')!;
    expect(probe.status).toBe('fail');
    expect(probe.detail).toMatch(/\/home\/ab1234\/\.hpcworker\/probe\/probe\.json/);
  });

  it('a probe that finds no egress, no sign-in or no consent says so in plain words', async () => {
    const noEgress = { ...GOOD_PROBE, egress: { class: 'none', with_inherited_env: { 'api.anthropic.com': '000', 'platform.claude.com': '000', 'claude.ai': '000' }, without_proxy_vars: { 'api.anthropic.com': '000', 'platform.claude.com': '000', 'claude.ai': '000' } } };
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, noEgress), ack: true }));
    const by = Object.fromEntries(rep.reports.map((r) => [r.id, r]));
    expect(by['probe-job']!.status).toBe('fail');
    expect(by['probe-job']!.detail).toMatch(/cannot reach api.anthropic.com/);
    // everything downstream of the probe is blocked on it, so one root cause is reported, not four
    expect(by['claude-login']!.status).toBe('blocked');
    expect(rep.rootCauses.map((r) => r.id)).toEqual(['probe-job']);

    const notSignedIn = { ...GOOD_PROBE, claude_auth: { loggedIn: false, config_dir_present: false }, consent_recorded: false };
    const rep2 = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, notSignedIn), ack: true }));
    const by2 = Object.fromEntries(rep2.reports.map((r) => [r.id, r]));
    expect(by2['claude-login']!.status).toBe('fail');
    expect(by2['claude-login']!.detail).toMatch(/not signed in/);
    expect(by2['claude-login']!.fixAction).toBe('sign-in-claude');
    expect(by2['remote-control-ready']!.status).toBe('blocked');

    const noConsent = { ...GOOD_PROBE, consent_recorded: false, xdg_fix: { dir: '/dev/shm/ab1234/xdg', host_writable: true, in_image: 'EACCES' } };
    const rep3 = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, noConsent), ack: true }));
    const by3 = Object.fromEntries(rep3.reports.map((r) => [r.id, r]));
    expect(by3['remote-control-ready']!.status).toBe('fail');
    expect(by3['remote-control-ready']!.detail).toMatch(/Enable Remote Control/);
    expect(by3['xdg-runtime']!.status).toBe('fail');
    expect(by3['xdg-runtime']!.detail).toMatch(/inside the image/);
  });

  it('when the login node was asked less than a minute ago, the shell check is skipped and check 10 with it', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({ auditWait: async () => 42_000 }, GOOD_PROBE), ack: true }));
    const by = Object.fromEntries(rep.reports.map((r) => [r.id, r]));
    expect(by['shell']!.status).toBe('skipped');
    expect(by['login-discovery']!.status).toBe('skipped');
    expect(by['probe-job']!.status).toBe('skipped');
    expect(rep.ok).toBe(true);
  });

  it('a quick run skips the slow checks', async () => {
    const rep = await runDiagnostics(buildNodes(), await ctxWith({ portal: fakePortal({}, GOOD_PROBE), ack: true }), { quick: true });
    const by = Object.fromEntries(rep.reports.map((r) => [r.id, r]));
    expect(by['shell']!.status).toBe('skipped');
    expect(by['files']!.status).toBe('ok');
    expect(by['files']!.detail).toMatch(/hpcworker is installed/);
  });
});
