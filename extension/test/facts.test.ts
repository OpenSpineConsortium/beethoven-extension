// Fact gathering against a fake portal serving the framework's files: the sign-in made from this
// browser outlives a live job's older "not signed in", the tool's VERSION is compared with the
// bundled one, and an update that ran and changed nothing is reported rather than repeated.
import { describe, expect, it } from 'vitest';
import { makeAcknowledgement, STATEMENTS_KEY, type Statements } from '../src/core/disclosure';
import { gatherFacts, INSTALL_RETRY_MS, type FactsEnv, type RunLike } from '../src/core/facts';
import { IDENTITY_KEY, INSTALL_KEY, LICENSE_KEY, LOGIN_SEEN_KEY, type InstallNote, type LoginSeen, type PortalSettings } from '../src/core/keys';
import type { PortalApi } from '../src/core/portal';
import { decide, LOGIN_SEEN_FRESH_MS } from '../src/core/steps';
import { TERMS_KEY, TERMS_VERSION } from '../src/core/terms';
import { issuer, memoryKV, NOW } from './helpers';

const I = issuer();
const NOW_MS = NOW * 1000;
const HOME = '/home/ab1234';
const STATE = '/rs/rs_grp_oschome/ab1234/hpcworker';
const PROFILE = JSON.stringify({ schema_version: 1, site: 'wayne', scheduler: 'slurm', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker' });
const iso = (ms: number) => new Date(ms).toISOString();

/** a probe that passes, written twenty minutes ago, signed out at the time */
const PROBE = {
  when: iso(NOW_MS - 20 * 60_000),
  hostname: 'asx15',
  node_tmp: { path: '/tmp/ab1234/x', ok: true, free_gb: 200 },
  dev_shm: { free_kb: 64_000_000, writable: true },
  user_namespaces: { unshare_works: true },
  runtime: { ok: true, name: 'apptainer' },
  tmux: { present: true },
  egress: { class: 'direct', with_inherited_env: { 'api.anthropic.com': '404', 'platform.claude.com': '200', 'claude.ai': '403' } },
  claude_auth: { loggedIn: false, config_dir_present: true },
  consent_recorded: true,
};

function fakePortal(files: Record<string, string>): PortalApi {
  const m = new Map(Object.entries(files));
  return {
    auditWait: async () => 0,
    home: async () => HOME,
    whoAmI: async () => 'ab1234',
    exists: async (p: string) => m.has(p),
    readFileIfExists: async (p: string) => m.get(p),
  } as unknown as PortalApi;
}

async function env(o: { files?: Record<string, string>; run?: RunLike; seenAgoMs?: number; /** null: a build that carries no framework */ bundled?: string | null; installNote?: InstallNote } = {}): Promise<FactsEnv> {
  const local = memoryKV();
  await local.set(TERMS_KEY, { v: 1, terms_version: TERMS_VERSION, edition: 'trial', signed_name: 'A. Student' });
  await local.set(LICENSE_KEY, { key: I.license(), identity: { accessId: 'ab1234' }, saved_at: 'x' });
  await local.set(IDENTITY_KEY, { username: 'ab1234' });
  await local.set(STATEMENTS_KEY, { 'workspaces/worker': { ...makeAcknowledgement('worker'), consent_written_at: iso(NOW_MS - 3_600_000) } } satisfies Statements);
  if (o.seenAgoMs !== undefined) await local.set(LOGIN_SEEN_KEY, { at: iso(NOW_MS - o.seenAgoMs), detail: 'a@wayne.edu max' } satisfies LoginSeen);
  if (o.installNote) await local.set(INSTALL_KEY, o.installNote);
  const settings: PortalSettings = { origin: 'https://ood.example', hostname: 'ood.example', connected_at: '2026-09-28T00:00:00Z', shell_host: 'default', site: 'wayne' };
  const files = { [`${HOME}/.hpcworker/profile.json`]: PROFILE, [`${HOME}/.hpcworker/VERSION`]: '2\n', [`${STATE}/probe/probe.json`]: JSON.stringify(PROBE), ...(o.files ?? {}) };
  return {
    version: '1.0.0',
    now: () => NOW_MS,
    local,
    keys: I.keys,
    settings,
    prefs: { worker_name: 'worker', permission_mode: 'default', auto_start: true, open_claude_on_connect: true },
    granted: async () => true,
    alive: async () => true,
    portal: () => fakePortal(files),
    run: o.run,
    transient: { warm: { state: 'warm' } },
    bundledFrameworkVersion: async () => (o.bundled === null ? undefined : o.bundled ?? '2'),
  };
}

/** a live job that says need_login, whose sign-in check was made `checkedAgoMs` ago */
function needLoginRun(checkedAgoMs: number): RunLike {
  return {
    stateDir: STATE,
    run: 'worker',
    job: '4243102',
    set_at: iso(NOW_MS - 30 * 60_000),
    status: { state: 'need_login', needs: 'login', job: '4243102', updated_at: iso(NOW_MS - 20_000), claude_login: { loggedIn: false, checked_at: iso(NOW_MS - checkedAgoMs) } },
  };
}

describe('gathering the facts', () => {
  it('a sign-in made here after the job last asked outweighs the job\'s older "not signed in"; the machine then waits for the job to re-ask', async () => {
    const g = await gatherFacts(await env({ run: needLoginRun(5 * 60_000), seenAgoMs: 2 * 60_000 }));
    expect(g.facts.login.loggedIn).toBe(true);
    expect(g.facts.login.seenAt).toBe(NOW_MS - 2 * 60_000);
    expect(g.facts.run.live).toBe(true);
    const v = decide(g.facts, NOW_MS);
    expect(v.step).toBe('login');
    expect(v.auto).toBe('poll');
    expect(v.status).toMatch(/re-checks within a minute/);
  });

  it('a job that checked after the sign-in and still says no is believed once the sign-in is older than the fresh window', async () => {
    const g = await gatherFacts(await env({ run: needLoginRun(60_000), seenAgoMs: LOGIN_SEEN_FRESH_MS + 1 }));
    expect(g.facts.login.loggedIn).toBe(false);
    expect(g.facts.login.detail).toMatch(/your worker says so/);
    expect(decide(g.facts, NOW_MS)).toMatchObject({ step: 'login', auto: 'login' });
  });

  it('with no sign-in from this browser, the probe\'s word stands until the job\'s', async () => {
    const g = await gatherFacts(await env());
    expect(g.facts.login.loggedIn).toBe(false);
    expect(g.facts.install).toMatchObject({ installed: true });
    expect(g.facts.install.outdated).toBeUndefined();
    expect(decide(g.facts, NOW_MS).step).toBe('login');
  });

  it('compares ~/.hpcworker/VERSION with the bundled VERSION: older or missing means set up again', async () => {
    const older = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' } }));
    expect(older.facts.install).toMatchObject({ installed: true, outdated: { installed: '1', bundled: '2' } });
    expect(decide(older.facts, NOW_MS)).toMatchObject({ step: 'install', auto: 'install' });
    const e = await env();
    // a copy without a VERSION file (the mock's stand-in tool) counts as older
    e.portal = () => fakePortal({ [`${HOME}/.hpcworker/profile.json`]: PROFILE, [`${STATE}/probe/probe.json`]: JSON.stringify(PROBE) });
    const missing = await gatherFacts(e);
    expect(missing.facts.install.outdated).toEqual({ installed: 'unknown', bundled: '2' });
    // no bundled VERSION (a build without the framework): nothing to compare, nothing to update
    const none = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, bundled: null }));
    expect(none.facts.install).toMatchObject({ installed: true });
    expect(none.facts.install.outdated).toBeUndefined();
    expect(none.facts.install.failed).toBeUndefined();
  });

  it('an update that just ran and left the old version behind is reported once, not run again every minute', async () => {
    const note: InstallNote = { attempted_at: iso(NOW_MS - 60_000), ok: true, detail: 'exit 0' };
    const g = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, installNote: note }));
    expect(g.facts.install.outdated).toBeUndefined();
    expect(g.facts.install.failed).toMatch(/still reports version 1 after the update to version 2/);
    expect(decide(g.facts, NOW_MS)).toMatchObject({ step: 'install', primary: { action: 'retry-install' } });
    // the note ages out and the update is tried again
    const old: InstallNote = { attempted_at: iso(NOW_MS - INSTALL_RETRY_MS - 1), ok: true, detail: 'exit 0' };
    const again = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, installNote: old }));
    expect(again.facts.install.outdated).toEqual({ installed: '1', bundled: '2' });
  });
});
