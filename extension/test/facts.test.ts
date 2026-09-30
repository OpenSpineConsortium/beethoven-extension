// Fact gathering against a fake portal serving the framework's files: the sign-in made from this
// browser outlives a live job's older "not signed in", the tool's VERSION is compared with the
// bundled one (an own copy only: the lab's shared copy, named by the marker, is never outdated, and
// a shared VERSION the Files app refuses is said without making the portal look asleep), an
// update that ran and changed nothing is reported rather than repeated, and the
// access service's record is read (never fetched) for the account the dashboard showed.
import { describe, expect, it } from 'vitest';
import { makeAcknowledgement, STATEMENTS_KEY, type Statements } from '../src/core/disclosure';
import { gatherFacts, INSTALL_RETRY_MS, type FactsEnv, type RunLike } from '../src/core/facts';
import { ACCESS_KEY, IDENTITY_KEY, INSTALL_KEY, KILLLIST_KEY, LOGIN_SEEN_KEY, type InstallNote, type LoginSeen, type PortalSettings } from '../src/core/keys';
import type { PortalApi } from '../src/core/portal';
import { decide, LOGIN_SEEN_FRESH_MS } from '../src/core/steps';
import { TERMS_KEY, TERMS_VERSION } from '../src/core/terms';
import { APPROVED_GRACE_MS, APPROVED_TTL_MS, type AccessRecord } from '../src/licensing/access';
import { memoryKV, NOW } from './helpers';

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

/** the portal's Files routes over a map; a path in `denied` answers as the lab volume answers an outsider (the client throws on a 403) */
function fakePortal(files: Record<string, string>, denied: string[] = []): PortalApi {
  const m = new Map(Object.entries(files));
  return {
    auditWait: async () => 0,
    home: async () => HOME,
    whoAmI: async () => 'ab1234',
    exists: async (p: string) => m.has(p),
    readFileIfExists: async (p: string) => {
      if (denied.includes(p)) throw Object.assign(new Error(`could not read ${p} (403)`), { name: 'PortalError', status: 403 });
      return m.get(p);
    },
  } as unknown as PortalApi;
}

/** the access service's last word: approved for ab1234 at ood.example an hour ago (as the background records it) */
const approved = (checkedAgoMs = 3_600_000, extra: Partial<AccessRecord> = {}): AccessRecord => ({ v: 1, access_id: 'ab1234', portal: 'ood.example', approved: true, checked_at: iso(NOW_MS - checkedAgoMs), until: null, last_attempt_at: iso(NOW_MS - checkedAgoMs), ...extra });

async function env(o: { files?: Record<string, string>; run?: RunLike; seenAgoMs?: number; /** null: a build that carries no framework */ bundled?: string | null; installNote?: InstallNote; access?: AccessRecord | null; /** the shared folder the bundled site profile names */ shared?: string; denied?: string[] } = {}): Promise<FactsEnv> {
  const local = memoryKV();
  await local.set(TERMS_KEY, { v: 1, terms_version: TERMS_VERSION, edition: 'trial', signed_name: 'A. Student' });
  if (o.access !== null) await local.set(ACCESS_KEY, o.access ?? approved());
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
    settings,
    prefs: { worker_name: 'worker', permission_mode: 'default', auto_start: true, open_claude_on_connect: true },
    granted: async () => true,
    alive: async () => true,
    portal: () => fakePortal(files, o.denied),
    run: o.run,
    transient: { warm: { state: 'warm' } },
    bundledFrameworkVersion: async () => (o.bundled === null ? undefined : o.bundled ?? '2'),
    bundledSharedInstall: async (site) => (site === 'wayne' ? o.shared : undefined),
  };
}

const SHARED = '/rs/rs_grp_oschome/shared/ashley/hpcworker/current';
/**
 * An account set up on the lab's shared copy: the marker, and the shared VERSION when given. The
 * env's own ~/.hpcworker/VERSION (2) stays, as a leftover of an own copy would if a conversion
 * left it behind: with the marker there it must not count.
 */
const sharedFiles = (version: string | undefined): Record<string, string> => ({
  [`${HOME}/.hpcworker/shared`]: `${SHARED}\n`,
  [`${HOME}/.hpcworker/bin/hpcworker`]: `#!/bin/bash\n# hpcworker launcher for a shared copy (managed: "hpcworker install" rewrites this file)\nHPCW_SHARED_ROOT=${SHARED}\n`,
  ...(version !== undefined ? { [`${SHARED}/VERSION`]: `${version}\n` } : {}),
});

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

  it('reads the access record for the account the dashboard showed: approved, stale, lapsed, refused, withdrawn, none, another account; and never fetches', async () => {
    const ok = await gatherFacts(await env());
    expect(ok.facts.access).toMatchObject({ ok: true, state: 'approved', accessId: 'ab1234', portal: 'ood.example', needsCheck: false, warn: false });
    expect(ok.facts.access.detail).toBe(`Access approved for ab1234 at ood.example (checked ${iso(NOW_MS - 3_600_000).slice(0, 16).replace('T', ' ')} UTC)`);
    expect(ok.facts.access.requestUrl).toBe('https://openspineconsortium.com/beethoven/request.html?access_id=ab1234');
    // past a day with the service silent: still good, warned, and due (the strip asks the background quietly)
    const stale = await gatherFacts(await env({ access: approved(APPROVED_TTL_MS + 1, { last_error: 'x', last_attempt_at: iso(NOW_MS - 3_600_000) }) }));
    expect(stale.facts.access).toMatchObject({ ok: true, state: 'stale', warn: true, needsCheck: true });
    expect(decide(stale.facts, NOW_MS).step).toBe('login');
    // past seven days: not good any more
    const lapsed = await gatherFacts(await env({ access: approved(APPROVED_GRACE_MS + 1, { last_error: 'x', last_attempt_at: iso(NOW_MS - 3_600_000) }) }));
    expect(lapsed.facts.access).toMatchObject({ ok: false, state: 'lapsed' });
    expect(decide(lapsed.facts, NOW_MS)).toMatchObject({ step: 'access', primary: { action: 'retry-access' } });
    // refused: the one button asks for access
    const denied = await gatherFacts(await env({ access: approved(60_000, { approved: false, until: undefined }) }));
    expect(denied.facts.access).toMatchObject({ ok: false, state: 'denied' });
    expect(decide(denied.facts, NOW_MS)).toMatchObject({ step: 'access', primary: { label: 'Ask for access', action: 'ask-access' } });
    // withdrawn: said as such
    const withdrawn = await gatherFacts(await env({ access: approved(60_000, { approved: false, until: undefined, withdrawn: true }) }));
    expect(withdrawn.facts.access.state).toBe('withdrawn');
    expect(decide(withdrawn.facts, NOW_MS).status).toMatch(/^Access withdrawn: ask again/);
    // nothing on record: checking, and the machine asks the background
    const none = await gatherFacts(await env({ access: null }));
    expect(none.facts.access).toMatchObject({ ok: false, state: 'checking', needsCheck: true });
    expect(decide(none.facts, NOW_MS)).toMatchObject({ step: 'access', auto: 'check-access' });
    // a record for another account (the dashboard now shows someone else) does not count
    const other = await gatherFacts(await env({ access: approved(60_000, { access_id: 'zz9999' }) }));
    expect(other.facts.access.state).toBe('checking');
    // a record for another portal does not count either
    const elsewhere = await gatherFacts(await env({ access: approved(60_000, { portal: 'ondemand.osc.edu' }) }));
    expect(elsewhere.facts.access.state).toBe('checking');
    // the strip's own attempt in flight, and one that could not ask
    const e = await env({ access: null });
    e.transient = { warm: { state: 'warm' }, accessChecking: true };
    expect((await gatherFacts(e)).facts.access).toMatchObject({ state: 'checking', needsCheck: false });
    e.transient = { warm: { state: 'warm' }, accessFailed: 'Your portal has not shown who is signed in yet' };
    expect((await gatherFacts(e)).facts.access).toMatchObject({ state: 'failed', detail: 'Your portal has not shown who is signed in yet' });
    // a withdrawn version outranks an approval
    const e2 = await env();
    await e2.local.set(KILLLIST_KEY, { fetched_at: 'x', list: { v: 1, kid: 'k1', issued: NOW, revoked_versions: ['1.0.0'], revoked_lids: [], message: 'update please' } });
    const revoked = await gatherFacts(e2);
    expect(revoked.facts.access).toMatchObject({ ok: false, state: 'version-revoked', versionRevoked: true });
    expect(revoked.facts.access.detail).toMatch(/withdrawn; update to continue\. update please/);
    const v = decide(revoked.facts, NOW_MS);
    expect(v.step).toBe('access');
    expect(v.primary).toBeUndefined();
    expect(v.auto).toBeUndefined();
  });

  it("the lab's shared copy: the marker names it, its own VERSION is shown, and it is never outdated against the bundled one", async () => {
    const g = await gatherFacts(await env({ files: sharedFiles('5'), bundled: '9', shared: SHARED }));
    expect(g.facts.install).toMatchObject({ installed: true, shared: { dir: SHARED, version: '5' }, sharedRoot: SHARED });
    expect(g.facts.install.outdated).toBeUndefined();
    expect(g.facts.install.failed).toBeUndefined();
    expect(g.facts.install.version).toBeUndefined();
    expect(decide(g.facts, NOW_MS).step).toBe('login');
    // a marker at a site whose bundled profile names no shared folder is still the account's truth
    const elsewhere = await gatherFacts(await env({ files: sharedFiles('6'), bundled: '9' }));
    expect(elsewhere.facts.install.shared).toEqual({ dir: SHARED, version: '6' });
    expect(elsewhere.facts.install.sharedRoot).toBeUndefined();
  });

  it("a shared VERSION the Files app will not serve is said, not taken for a cold portal, and does not set the tool up again", async () => {
    const g = await gatherFacts(await env({ files: sharedFiles(undefined), bundled: '9', shared: SHARED, denied: [`${SHARED}/VERSION`] }));
    expect(g.facts.warm.state).toBe('warm');
    expect(g.facts.install.shared?.dir).toBe(SHARED);
    expect(g.facts.install.shared?.version).toBeUndefined();
    expect(g.facts.install.shared?.unreadable).toMatch(/could not read its VERSION file.*403/);
    expect(g.facts.install.outdated).toBeUndefined();
    // the rest of the facts were still read: the probe, then the sign-in
    expect(g.facts.probe.present).toBe(true);
    expect(decide(g.facts, NOW_MS).step).toBe('login');
    // no VERSION there at all, and a marker that names no folder
    const none = await gatherFacts(await env({ files: sharedFiles(undefined), shared: SHARED }));
    expect(none.facts.install.shared?.unreadable).toMatch(/finds no VERSION file/);
    const junk = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/shared`]: 'somewhere else\n' } }));
    expect(junk.facts.install.shared).toMatchObject({ dir: 'somewhere else', unreadable: 'the marker file does not name a folder' });
  });

  it('a marker without the launcher is an own copy (an upload over the launcher leaves the marker behind)', async () => {
    const own = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/shared`]: `${SHARED}\n`, [`${HOME}/.hpcworker/bin/hpcworker`]: '#!/bin/bash\n# the full tool, copied into the account\nVERSION=2\n', [`${HOME}/.hpcworker/VERSION`]: '2\n' }, shared: SHARED }));
    expect(own.facts.install.shared).toBeUndefined();
    expect(own.facts.install).toMatchObject({ installed: true, version: '2', sharedRoot: SHARED });
  });

  it('an own copy at a site with a shared folder: shown with its version, and moved to the shared copy when it is older', async () => {
    const same = await gatherFacts(await env({ shared: SHARED }));
    expect(same.facts.install).toMatchObject({ installed: true, version: '2', sharedRoot: SHARED });
    expect(same.facts.install.shared).toBeUndefined();
    expect(same.facts.install.outdated).toBeUndefined();
    const older = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, shared: SHARED }));
    expect(older.facts.install.outdated).toEqual({ installed: '1', bundled: '2' });
    const v = decide(older.facts, NOW_MS);
    expect(v).toMatchObject({ step: 'install', auto: 'install' });
    expect(v.status).toBe("Moving your account to your lab's shared copy of the tool (your own copy is version 1)...");
    // while a worker runs from the own copy the move waits (framework 5 would refuse it), and the strip goes on
    const busy = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, shared: SHARED, run: { ...needLoginRun(30_000), status: { ...needLoginRun(30_000).status!, state: 'online', needs: 'nothing', claude_login: { loggedIn: true } } } }));
    expect(busy.facts.run.live).toBe(true);
    expect(busy.facts.install.outdated).toBeUndefined();
    expect(busy.facts.install.version).toBe('1');
    // at a site with no shared folder an older own copy is updated as before, running worker or not
    const plain = await gatherFacts(await env({ files: { [`${HOME}/.hpcworker/VERSION`]: '1\n' }, run: { ...needLoginRun(30_000), status: { ...needLoginRun(30_000).status!, state: 'online' } } }));
    expect(plain.facts.install.outdated).toEqual({ installed: '1', bundled: '2' });
    // not installed yet: the first set-up says it uses the lab's copy
    const e = await env({ shared: SHARED });
    e.portal = () => fakePortal({});
    const fresh = await gatherFacts(e);
    expect(fresh.facts.install).toMatchObject({ installed: false, sharedRoot: SHARED });
    expect(decide(fresh.facts, NOW_MS).status).toBe("Setting up the cluster with your lab's shared copy of the tool...");
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
