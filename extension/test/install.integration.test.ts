// Setting up the cluster against the mock portal, with a real bash behind the shell: the lab's
// shared copy (the mock's sharedInstall), where one line sets the account up without uploading
// anything and everything after it runs through the launcher; an account outside the lab's group
// (sharedReadable: false), where bash cannot open the shared launcher and nothing is uploaded
// instead; a site whose profile names no shared folder, where nothing is typed at all; an account
// that still runs its own copy from a build before 8.0.0; and the store reviewer's recipe, whose mock
// home starts already set up on the shared copy. Whether the account runs the lab's copy (what ticks
// "Your grid account is ready" in 11.0.0) is read over the real portal client each time
// (install.ts usesSharedCopy).
//
// Every shell round spawns Git Bash plus node, so these tests carry their own timeouts, and the
// audit clock is a fake one the tests advance past the floors (the install's own wait for the shell
// clock advances it too).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Audit } from '../src/core/audit';
import { commands, parseJobId, paths } from '../src/core/contract';
import { installFramework, noSharedForSite, usesSharedCopy } from '../src/core/install';
import { PortalClient } from '../src/core/portal';
import { cliOptions, createMockPortal, DEFAULT_SHARED_INSTALL } from '../mock-ood/server.mjs';
import { cookieNet, memoryKV } from './helpers';

type Portal = Awaited<ReturnType<typeof createMockPortal>>;

const SLOW = 120_000;
const SHARED = '/lab/shared/hpcworker/current';
let t = 1_790_000_000_000;
const clock = { now: () => t, advance: (ms: number) => (t += ms) };
/** the install's wait for the shell clock: the fake clock moves instead of the test sleeping */
const sleep = async (ms: number) => void clock.advance(ms);

function client(p: Portal): PortalClient {
  return new PortalClient(p.origin, cookieNet(p.cookie, p.origin), new Audit(memoryKV(), { now: clock.now }), { shellHost: 'default' });
}

/** the extension's own files as a build carries them: the site profile only, naming the shared folder, or not */
function assets(shared?: string) {
  const profile = JSON.stringify({ schema_version: 1, site: 'mock', scheduler: 'slurm', shared_state_dir: '$HOME/.hpcworker/state', ...(shared ? { shared_install: shared } : {}) });
  return async (p: string): Promise<Response> => (p === '/profiles/mock.json' ? new Response(profile) : new Response('not found', { status: 404 }));
}

describe("the lab's shared copy, for a member of the lab's group", () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0, sharedInstall: SHARED });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it('one line sets the account up: nothing uploaded, the stand-in command moved aside, the marker, a launcher, the profile from the shared folder', async () => {
    const c = client(mock);
    const home = await c.home();
    // the Files app serves the shared copy read-only
    expect((await c.readFile(`${SHARED}/VERSION`)).trim()).toMatch(/^\d+$/);
    await expect(c.writeFile(`${SHARED}/VERSION`, '6\n')).rejects.toMatchObject({ status: 403 });
    // before: not set up on the lab's copy, so moment 6 sets it up by itself
    expect(await usesSharedCopy(c, SHARED)).toBe(false);
    const progress: string[] = [];
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep, onProgress: (x) => progress.push(x) });
    expect(r).toMatchObject({ ok: true, exitCode: 0, sharedDir: SHARED });
    // the log names the lab's folder in words (the panel shows no cluster path), while the line typed is the exact command
    expect(r.log).toContain("running the install of the lab's shared copy, one line through the portal's shell; nothing is uploaded");
    expect(r.log).not.toContain('/lab/shared');
    // the mock seeds the stand-in command in bin/, so this is a move: framework 5's sentence, nothing deleted
    expect(r.log).toMatch(/switched to the shared copy of hpcworker \d+; your own copy was moved to \/home\/student\/\.hpcworker\/replaced\/\d{8}-\d{6} \(nothing deleted\)/);
    const replaced = await fs.readdir(path.join(mock.home, '.hpcworker', 'replaced'));
    expect(replaced).toHaveLength(1);
    expect(progress.length).toBeGreaterThan(1);
    // the marker names the folder as the portal shows it; the launcher is a regular file, never a link
    expect(await c.readFile(paths.sharedMarker(home))).toBe(`${SHARED}\n`);
    const launcher = path.join(mock.home, '.hpcworker', 'bin', 'hpcworker');
    const st = await fs.lstat(launcher);
    expect(st.isFile() && !st.isSymbolicLink()).toBe(true);
    expect(await fs.readFile(launcher, 'utf8')).toMatch(/^#!\/bin\/bash\n# hpcworker launcher for a shared copy \(managed: "hpcworker install" rewrites this file\)\n/);
    expect(await c.readFileIfExists(paths.version(home))).toBeUndefined();
    expect(JSON.parse((await c.readFile(paths.profile(home)))!).shared_install).toBe(SHARED);
    // "Your grid account is ready": the marker names the folder, the launcher carries its tag, the profile is there
    expect(await usesSharedCopy(c, SHARED)).toBe(true);
    expect(await usesSharedCopy(c, '/some/other/copy')).toBe(false);
  }, SLOW);

  it('everything after the install goes through the launcher as before', async () => {
    const c = client(mock);
    clock.advance(61_000);
    const v = await c.shell('bash ~/.hpcworker/bin/hpcworker version', { timeoutMs: 30_000 });
    expect(v.output).toMatch(/\(shared copy at \/lab\/shared\/hpcworker\/current\)\s*$/m);
    clock.advance(61_000);
    const probe = await c.shell(commands.probe(), { timeoutMs: 30_000 });
    expect(parseJobId(probe.output)).toMatch(/^\d+$/);
  }, SLOW);

  it('setting up again keeps the profile and moves nothing', async () => {
    const c = client(mock);
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep });
    expect(r).toMatchObject({ ok: true });
    expect(r.log).toMatch(/profile\.json exists; kept/);
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

  it('bash cannot open the shared launcher: nothing is uploaded instead, and the panel says whom to ask', async () => {
    const c = client(mock);
    const home = await c.home();
    await expect(c.readFileIfExists(`${SHARED}/VERSION`)).rejects.toMatchObject({ status: 403 });
    const listed = (await c.listDir(paths.root(home))).files.map((f) => f.name).sort();
    clock.advance(61_000);
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(SHARED), sleep });
    // bash names the mock's real folder here, which is not the path the profile gives (hideSharedPath's own cases are in install.test.ts)
    expect(r.log).toMatch(/bin\/hpcworker: No such file or directory/);
    expect(r.log).not.toContain('/lab/shared');
    expect(r.log).toMatch(/^exit 127$/m);
    expect(r).toMatchObject({ ok: false, exitCode: 127, sharedDir: SHARED });
    expect(r.noShared).toBe("your lab's shared copy of the tool cannot be used from your account: it is not there, or your account cannot reach it");
    // nothing was written to the account: the same entries as before, no profile, no VERSION
    expect((await c.listDir(paths.root(home))).files.map((f) => f.name).sort()).toEqual(listed);
    expect(await c.readFileIfExists(paths.profile(home))).toBeUndefined();
    expect(await c.readFileIfExists(paths.version(home))).toBeUndefined();
    // still not on the lab's copy: the panel shows "Your grid account can't use the lab's copy yet. Ask your lab lead."
    expect(await usesSharedCopy(c, SHARED)).toBe(false);
  }, SLOW);
});

describe('a site whose profile names no shared folder', () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0 });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it('types nothing and uploads nothing; the panel says the lab\'s shared copy is needed without trying', async () => {
    const c = client(mock);
    const home = await c.home();
    const shellsBefore = mock.state.shells;
    const r = await installFramework(c, { site: 'mock', fetchAsset: assets(undefined), sleep });
    expect(r).toMatchObject({ ok: false, noShared: noSharedForSite('mock') });
    expect(r.log).not.toMatch(/--shared|upload(?:ing|ed) \d/);
    expect(mock.state.shells).toBe(shellsBefore);
    expect(await c.readFileIfExists(paths.profile(home))).toBeUndefined();
  }, SLOW);
});

describe('an account that still runs its own copy from a build before 8.0.0', () => {
  let mock: Portal;
  beforeAll(async () => {
    mock = await createMockPortal({ port: 0, sharedInstall: SHARED, seedInstalled: true });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it("is not the lab's copy: 11.0.0's setup line (and connect's own setup) points it at the shared copy; until then it keeps running", async () => {
    const c = client(mock);
    expect(await usesSharedCopy(c, SHARED)).toBe(false);
    clock.advance(61_000);
    const v = await c.shell('bash ~/.hpcworker/bin/hpcworker version', { timeoutMs: 30_000 });
    expect(v.output.trim()).toBe('1');
  }, SLOW);
});

describe("the store reviewer's recipe: the mock's command line with no home flag", () => {
  let mock: Portal;
  beforeAll(async () => {
    // docs/store/LISTING.md: node mock-ood/server.mjs --port 8443 --host localhost --user st1234 --cert cert.pem --key key.pem (here plain http on a free port)
    mock = await createMockPortal({ ...cliOptions(['--port', '0', '--host', '127.0.0.1', '--user', 'st1234'], {}), log: () => {} });
  });
  afterAll(async () => {
    await mock?.close();
  });

  it("starts set up on the lab's shared copy, so a site with no bundled profile (localhost) needs no setup line, and the rest runs through the launcher", async () => {
    expect(mock.sharedInstall).toBe(DEFAULT_SHARED_INSTALL);
    const c = client(mock);
    const home = await c.home();
    expect(await c.readFile(paths.sharedMarker(home))).toBe(`${DEFAULT_SHARED_INSTALL}\n`);
    // the recipe's portal is https://localhost:8443, so the site is "localhost", for which no build carries a
    // profile: 11.0.0 names the shared copy the account's own marker names, and the account is ready
    expect(await usesSharedCopy(c, DEFAULT_SHARED_INSTALL)).toBe(true);
    // nothing of the tool in the account but the launcher
    expect(await c.readFileIfExists(paths.version(home))).toBeUndefined();
    clock.advance(61_000);
    const probe = await c.shell(commands.probe(), { timeoutMs: 30_000 });
    expect(parseJobId(probe.output)).toMatch(/^\d+$/);
  }, SLOW);

  it('MOCK_SHARED_INSTALL and the other home flags change only what they say', () => {
    expect(cliOptions([], { MOCK_SHARED_INSTALL: '/opt/lab/tool' })).toMatchObject({ sharedInstall: '/opt/lab/tool', seedShared: true, seedTool: false });
    expect(cliOptions(['--shared-install', '/x/y'], {})).toMatchObject({ sharedInstall: '/x/y', seedShared: false });
    expect(cliOptions(['--shared-install'], {})).toMatchObject({ sharedInstall: DEFAULT_SHARED_INSTALL, seedShared: false });
    expect(cliOptions(['--fresh-home'], {})).toMatchObject({ sharedInstall: DEFAULT_SHARED_INSTALL, seedShared: false, seedTool: false });
    expect(cliOptions(['--own-copy'], {})).toMatchObject({ seedShared: false, seedTool: true, seedInstalled: true });
    expect(cliOptions(['--shared-unreadable'], {})).toMatchObject({ sharedReadable: false, seedShared: false });
  });
});
