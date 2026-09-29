// Setting up the cluster against the mock portal, in both modes, with a real bash behind the
// shell: the lab's shared copy (the mock's --shared-install), where one line sets the account up
// without uploading anything and everything after it runs through the launcher; an account
// outside the lab's group (--shared-unreadable), where bash cannot open the shared launcher, the
// tool goes to the student's own account instead with a note, and a marker left from before is
// moved aside by the own copy's install so the facts follow it; and a site with no shared folder,
// where nothing changes. The fact gathering runs over the real portal client each time.
//
// Every shell round spawns Git Bash plus node, so these tests carry their own timeouts, and the
// audit clock is a fake one the tests advance past the floors (the install's own wait between two
// shell lines advances it too).
import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Audit } from '../src/core/audit';
import { commands, parseJobId, paths } from '../src/core/contract';
import { gatherFacts, type FactsEnv } from '../src/core/facts';
import { installFramework } from '../src/core/install';
import type { PortalSettings } from '../src/core/keys';
import { PortalClient } from '../src/core/portal';
import { createMockPortal } from '../mock-ood/server.mjs';
import { cookieNet, memoryKV } from './helpers';

type Portal = Awaited<ReturnType<typeof createMockPortal>>;

const SLOW = 120_000;
const SHARED = '/lab/shared/hpcworker/current';
const STUB = readFileSync(fileURLToPath(new URL('../mock-ood/bin/hpcworker', import.meta.url)), 'utf8');
let t = 1_790_000_000_000;
const clock = { now: () => t, advance: (ms: number) => (t += ms) };
/** the install's wait for the shell clock: the fake clock moves instead of the test sleeping */
const sleep = async (ms: number) => void clock.advance(ms);

function client(p: Portal): PortalClient {
  return new PortalClient(p.origin, cookieNet(p.cookie, p.origin), new Audit(memoryKV(), { now: clock.now }), { shellHost: 'default' });
}

/** the extension's own files as a build carries them: the mock's stand-in as the tool, and a site profile naming the shared folder, or not */
function assets(shared?: string) {
  const files: Record<string, string> = {
    'bin/hpcworker': STUB,
    VERSION: '5\n',
    'profiles/mock.json': JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', shared_state_dir: '$HOME/.hpcworker/state', ...(shared ? { shared_install: shared } : {}) }),
  };
  return async (p: string): Promise<Response> => {
    if (p === '/framework/manifest.json') return Response.json({ v: 1, generated: 'test', files: Object.entries(files).map(([path, body]) => ({ path, bytes: body.length, sha256: '', mode: path.startsWith('bin/') ? '0755' : '0644' })) });
    const rel = p.replace(/^\/framework\/files\//, '');
    return rel in files ? new Response(files[rel]) : new Response('not found', { status: 404 });
  };
}

/** the facts about the tool, gathered over the real client as the strip gathers them */
async function toolFacts(c: PortalClient, shared: string | undefined, bundled = '9') {
  const settings: PortalSettings = { origin: 'http://127.0.0.1', hostname: '127.0.0.1', connected_at: '2026-09-29T00:00:00Z', shell_host: 'default', site: 'mock' };
  const e: FactsEnv = {
    version: '5.0.0',
    now: () => Date.now(),
    local: memoryKV(),
    settings,
    prefs: { worker_name: 'worker', permission_mode: 'default', auto_start: false, open_claude_on_connect: false },
    granted: async () => true,
    alive: async () => true,
    portal: () => c,
    transient: { warm: { state: 'warm' } },
    bundledFrameworkVersion: async () => bundled,
    bundledSharedInstall: async () => shared,
  };
  const g = await gatherFacts(e);
  return { warm: g.facts.warm, install: g.facts.install };
}

describe("the lab's shared copy, for a member of the lab's group", () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0, sharedInstall: SHARED });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it('one line sets the account up: nothing uploaded, the own copy moved aside, the marker, a launcher, the profile from the shared folder', async () => {
    const c = client(mock);
    const home = await c.home();
    // the Files app serves the shared copy read-only
    expect((await c.readFile(`${SHARED}/VERSION`)).trim()).toBe('5');
    await expect(c.writeFile(`${SHARED}/VERSION`, '6\n')).rejects.toMatchObject({ status: 403 });
    const progress: string[] = [];
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep, onProgress: (x) => progress.push(x) });
    expect(r).toMatchObject({ ok: true, exitCode: 0, uploaded: 0, mode: 'shared', sharedDir: SHARED });
    expect(r.log).toContain(`running: bash '${SHARED}/bin/hpcworker' install --shared '${SHARED}' --profile 'mock'`);
    // the mock seeds an own copy of the tool, so this is a move: framework 5's sentence, nothing deleted
    expect(r.log).toMatch(/switched to the shared copy of hpcworker 5 at \/lab\/shared\/hpcworker\/current; your own copy was moved to \/home\/student\/\.hpcworker\/replaced\/\d{8}-\d{6} \(nothing deleted\)/);
    const replaced = await fs.readdir(path.join(mock.home, '.hpcworker', 'replaced'));
    expect(replaced).toHaveLength(1);
    expect((await fs.readdir(path.join(mock.home, '.hpcworker', 'replaced', replaced[0]!, 'bin')))).toEqual(['hpcworker']);
    expect(progress.length).toBeGreaterThan(1);
    // the marker names the folder as the portal shows it; the launcher is a regular file, never a link
    expect(await c.readFile(paths.sharedMarker(home))).toBe(`${SHARED}\n`);
    const launcher = path.join(mock.home, '.hpcworker', 'bin', 'hpcworker');
    const st = await fs.lstat(launcher);
    expect(st.isFile() && !st.isSymbolicLink()).toBe(true);
    expect(await fs.readFile(launcher, 'utf8')).toMatch(/^#!\/bin\/bash\n# hpcworker launcher for a shared copy \(managed: "hpcworker install" rewrites this file\)\n/);
    expect(await c.readFileIfExists(paths.version(home))).toBeUndefined();
    expect(JSON.parse((await c.readFile(paths.profile(home)))!).shared_install).toBe(SHARED);
    // the facts: the shared copy with its own version, never outdated against a newer bundled one
    const f = await toolFacts(c, SHARED);
    expect(f.warm.state).toBe('warm');
    expect(f.install).toMatchObject({ installed: true, shared: { dir: SHARED, version: '5' }, sharedRoot: SHARED });
    expect(f.install.outdated).toBeUndefined();
  }, SLOW);

  it('everything after the install goes through ~/.hpcworker/bin/hpcworker as before', async () => {
    const c = client(mock);
    clock.advance(61_000);
    const v = await c.shell('bash ~/.hpcworker/bin/hpcworker version', { timeoutMs: 30_000 });
    expect(v.output).toMatch(/^5 \(shared copy at \/lab\/shared\/hpcworker\/current\)\s*$/m);
    clock.advance(61_000);
    const probe = await c.shell(commands.probe(), { timeoutMs: 30_000 });
    expect(parseJobId(probe.output)).toMatch(/^\d+$/);
  }, SLOW);

  it('setting up again keeps the profile and moves nothing', async () => {
    const c = client(mock);
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep });
    expect(r).toMatchObject({ ok: true, mode: 'shared' });
    expect(r.log).toMatch(/profile\.json exists; kept/);
    expect(r.log).toContain(`hpcworker 5: shared copy at ${SHARED}; launcher and marker refreshed (nothing copied)`);
    expect(r.log).not.toMatch(/moved to/);
  }, SLOW);
});

describe("an account outside the lab's group", () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0, sharedInstall: SHARED, sharedReadable: false });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it("falls back to its own copy, with the note, after bash could not open the shared launcher", async () => {
    const c = client(mock);
    const home = await c.home();
    await expect(c.readFileIfExists(`${SHARED}/VERSION`)).rejects.toMatchObject({ status: 403 });
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep });
    expect(r.log).toMatch(/bin\/hpcworker: No such file or directory/);
    expect(r.log).toMatch(/^exit 127$/m);
    expect(r).toMatchObject({ ok: true, mode: 'own', uploaded: 3, sharedDir: SHARED });
    expect(r.note).toBe(`Your lab's shared copy of the tool at ${SHARED} could not be used from your account: it is not there, or your account cannot reach it. The tool was put in your own account instead.`);
    expect(r.log).toMatch(/installed hpcworker 1 at \/home\/student\/\.hpcworker/);
    expect((await c.readFile(paths.version(home))).trim()).toBe('5');
    const f = await toolFacts(c, SHARED, '5');
    expect(f.install).toMatchObject({ installed: true, version: '5', sharedRoot: SHARED });
    expect(f.install.shared).toBeUndefined();
    expect(f.install.outdated).toBeUndefined();
  }, SLOW);

  it('a marker left from before is said without a cold portal, and the own copy moves it aside when set up again', async () => {
    const c = client(mock);
    const home = await c.home();
    // as if the account had been on the shared copy and then left the group: the marker is still there,
    // but the full copy in bin/ is what runs (the tool's own rule), so the facts say an own copy, version 5
    await c.writeFile(paths.sharedMarker(home), `${SHARED}\n`);
    const before = await toolFacts(c, SHARED, '5');
    expect(before.warm.state).toBe('warm');
    expect(before.install.shared).toBeUndefined();
    expect(before.install.version).toBe('5');
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep });
    expect(r).toMatchObject({ ok: true, mode: 'own' });
    expect(r.log).toMatch(/this account now uses its own copy; the shared copy at \/lab\/shared\/hpcworker\/current is no longer used \(its marker is in \/home\/student\/\.hpcworker\/replaced\/\d{8}-\d{6}\)/);
    expect(await c.readFileIfExists(paths.sharedMarker(home))).toBeUndefined();
    const after = await toolFacts(c, SHARED, '5');
    expect(after.install.shared).toBeUndefined();
    expect(after.install.version).toBe('5');
  }, SLOW);
});

describe('a site with no shared folder', () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0 });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it('uploads the tool and runs one install line, as before', async () => {
    const c = client(mock);
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(undefined), sleep });
    expect(r).toMatchObject({ ok: true, mode: 'own', uploaded: 3 });
    expect(r.sharedDir).toBeUndefined();
    expect(r.note).toBeUndefined();
    expect(r.log).not.toMatch(/--shared/);
    const f = await toolFacts(c, undefined, '5');
    expect(f.install).toMatchObject({ installed: true, version: '5' });
    expect(f.install.sharedRoot).toBeUndefined();
  }, SLOW);
});

describe("the store reviewer's recipe: the mock's CLI home (seedInstalled)", () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0, user: 'st1234', seedInstalled: true });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it('finds the stand-in set up as the own copy at the version the build carries, so the strip uploads nothing', async () => {
    const c = client(mock);
    const carried = ['../public/framework/files/VERSION', '../../framework/VERSION']
      .map((p) => fileURLToPath(new URL(p, import.meta.url)))
      .map((f) => { try { return readFileSync(f, 'utf8').trim(); } catch { return ''; } })
      .find((v) => /^\d+$/.test(v)) ?? '1';
    expect((await fs.readFile(path.join(mock.home, '.hpcworker', 'VERSION'), 'utf8')).trim()).toBe(carried);
    const f = await toolFacts(c, undefined, carried);
    expect(f.install).toMatchObject({ installed: true, version: carried });
    expect(f.install.outdated).toBeUndefined();
    expect(f.install.shared).toBeUndefined();
    // and the stand-in answers, as the recipe's later steps need
    clock.advance(61_000);
    const v = await c.shell('bash ~/.hpcworker/bin/hpcworker version', { timeoutMs: 30_000 });
    expect(v.output.trim()).toBe(carried);
  }, SLOW);
});
