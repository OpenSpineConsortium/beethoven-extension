// The portal client against the mock portal, in Node: session, username, Files reads and writes
// (with the Rails CSRF and Origin rules), Active Jobs, cancel, the shell bootstrap with a real
// bash behind it, the 3146 refusals, the reverse-proxy probe, the floors, and the seeded
// hpcworker's install / probe / worker start / stop with the files the extension reads back.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Audit, FloorError } from '../src/core/audit';
import { commands, parseJobId, paths, siteFrom, stateDirFrom } from '../src/core/contract';
import { PortalClient, PortalError } from '../src/core/portal';
import { runShellCommand, ShellError } from '../src/core/shell';
import { createMockPortal } from '../mock-ood/server.mjs';
import { cookieNet, memoryKV } from './helpers';

type Portal = Awaited<ReturnType<typeof createMockPortal>>;

let mock: Portal;
let t = 1_790_000_000_000;
const clock = { now: () => t, advance: (ms: number) => (t += ms) };

function client(p: Portal, net = cookieNet(p.cookie, p.origin)) {
  const audit = new Audit(memoryKV(), { now: clock.now });
  return { client: new PortalClient(p.origin, net, audit, { shellHost: 'default' }), audit };
}

beforeAll(async () => {
  mock = await createMockPortal({ port: 0 });
});
afterAll(async () => {
  await mock?.close();
});

describe('portal client against the mock portal', () => {
  it('session check: signed in, dashboard, csrf token and username from the page', async () => {
    const { client: c } = client(mock);
    const s = await c.session();
    expect(s.signedIn).toBe(true);
    expect(s.isOnDemand).toBe(true);
    expect(s.username).toBe('student');
    expect(s.csrf).toBe(mock.railsToken);
    expect(await c.whoAmI()).toBe('student');
  });

  it('without the portal cookie the check says to sign in, and never tries to', async () => {
    const audit = new Audit(memoryKV(), { now: clock.now });
    const c = new PortalClient(mock.origin, { fetch: (i, init) => fetch(i, init), WebSocket: WebSocket as never }, audit);
    const s = await c.session();
    expect(s.signedIn).toBe(false);
    expect(s.detail).toMatch(/sign in/);
  });

  it('home, listing, write, read, mkdir through the Files routes', async () => {
    const { client: c } = client(mock);
    const home = await c.home();
    expect(home).toBe(mock.virtualHome);
    const l = await c.listDir(home);
    expect(l.files.some((f) => f.name === '.hpcworker' && f.type === 'd')).toBe(true);
    expect(l.files_upload_path).toBeDefined();
    await c.mkdir(`${home}/proj`);
    await c.mkdir(`${home}/proj`); // exists: not an error
    await c.writeFile(`${home}/proj/hello.txt`, 'hello from the extension\n');
    expect(await c.readFile(`${home}/proj/hello.txt`)).toBe('hello from the extension\n');
    expect(await fs.readFile(path.join(mock.home, 'proj', 'hello.txt'), 'utf8')).toBe('hello from the extension\n');
    expect(await c.readFileIfExists(`${home}/proj/missing.json`)).toBeUndefined();
    await expect(c.readFile(`${home}/proj/missing.json`)).rejects.toBeInstanceOf(PortalError);
  });

  it('the dashboard refuses a write with a foreign Origin or a stale token (422), as Rails does', async () => {
    const url = `${mock.origin}/pun/sys/dashboard/files/fs${mock.virtualHome}/evil.txt`;
    const foreign = await fetch(url, { method: 'PUT', headers: { cookie: mock.cookie, origin: 'https://evil.example', 'X-CSRF-Token': mock.railsToken }, body: 'x' });
    expect(foreign.status).toBe(422);
    const stale = await fetch(url, { method: 'PUT', headers: { cookie: mock.cookie, origin: mock.origin, 'X-CSRF-Token': 'stale' }, body: 'x' });
    expect(stale.status).toBe(422);
    const { client: c } = client(mock, cookieNet(mock.cookie, 'https://evil.example'));
    await expect(c.writeFile(`${mock.virtualHome}/evil.txt`, 'x')).rejects.toThrow(/stale form token/);
  });

  it('one command line through the shell: real bash, fake sbatch, exit code and output framed', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    const r = await c.shell('echo hello; sbatch --parsable ~/job.sbatch; echo done', { timeoutMs: 20_000 });
    expect(r.exitCode).toBe(0);
    const lines = r.output.split('\n');
    expect(lines[0]).toBe('hello');
    expect(lines[1]).toMatch(/^\d{6}$/);
    expect(lines[2]).toBe('done');
    expect(parseJobId(`${lines[1]};mock`)).toBe(lines[1]);
    // the job now shows in Active Jobs, and can be cancelled through the portal's own route
    clock.advance(61_000);
    const jobs = await c.activeJobs();
    expect(jobs.jobs.some((j) => j.pbsid === lines[1])).toBe(true);
    expect(jobs.clusters).toEqual(['mock']);
    clock.advance(61_000);
    await c.cancelJob('mock', lines[1]!);
    clock.advance(61_000);
    expect((await c.activeJobs()).jobs.some((j) => j.pbsid === lines[1])).toBe(false);
  });

  it('a failing command reports its exit code; the socket is closed either way', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    const before = mock.state.shells;
    const r = await c.shell('echo oops >&2; exit 3', { timeoutMs: 20_000 });
    expect(r.exitCode).toBe(3);
    expect(r.output).toBe('oops');
    expect(mock.state.shells).toBe(before + 1);
    expect(mock.state.fatal).toBe(0);
  });

  it('the scheduler floor holds between two shell submissions', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    await c.shell('true', { timeoutMs: 20_000 });
    // a plain `true` is a shell call (15 s floor); a submit is a scheduler call (60 s floor)
    clock.advance(16_000);
    await c.shell('sbatch --parsable x', { timeoutMs: 20_000 });
    clock.advance(30_000);
    await expect(c.shell('sbatch --parsable y')).rejects.toBeInstanceOf(FloorError);
    expect(await c.auditWait('scheduler')).toBe(30_000);
  });

  it('the shell refuses a bad token and a foreign origin with 3146 and the exact reason', async () => {
    const net = cookieNet(mock.cookie, mock.origin);
    const staleNet = { ...net, fetch: async (i: string, init?: RequestInit) => { const r = await net.fetch(i, init); const html = (await r.text()).replace(/csrf=[^"]+/, 'csrf=stale-token'); return new Response(html, { status: r.status, headers: { 'content-type': 'text/html' } }); } };
    let err: unknown;
    try {
      await runShellCommand({ origin: mock.origin, host: 'default', command: 'true', net: staleNet });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ShellError);
    expect((err as ShellError).closeCode).toBe(3146);
    expect((err as ShellError).closeReason).toBe('Bad CSRF Token.');
    expect((err as ShellError).message).toMatch(/token had already expired/);

    const foreign = cookieNet(mock.cookie, mock.origin, 'https://evil.example');
    await expect(runShellCommand({ origin: mock.origin, host: 'default', command: 'true', net: foreign })).rejects.toMatchObject({ closeCode: 3146, closeReason: 'Invalid Origin.' });
    await expect(runShellCommand({ origin: mock.origin, host: 'nothere', command: 'true', net })).rejects.toMatchObject({ closeCode: 3146, closeReason: 'Host "nothere" not specified in allowlist or cluster configs.' });
  });

  it('a portal with no clusters closes with "No clusters defined."', async () => {
    const empty = await createMockPortal({ port: 0, noClusters: true });
    try {
      await expect(runShellCommand({ origin: empty.origin, host: 'default', command: 'true', net: cookieNet(empty.cookie, empty.origin) })).rejects.toMatchObject({ closeCode: 3146, closeReason: 'No clusters defined.' });
      const { client: c } = client(empty);
      clock.advance(61_000);
      const jobs = await c.activeJobs();
      expect(jobs.errors.length).toBeGreaterThan(0);
    } finally {
      await empty.close();
    }
  });

  it('the reverse-proxy probe tells 404 (off) from 503 "Failed to connect" (on)', async () => {
    const { client: c } = client(mock);
    expect((await c.probeRnode('node01')).state).toBe('disabled');
    const on = await createMockPortal({ port: 0, rnode: 'enabled' });
    try {
      const { client: c2 } = client(on);
      const r = await c2.probeRnode('node01');
      expect(r.state).toBe('enabled');
      expect(r.status).toBe(503);
    } finally {
      await on.close();
    }
    const routes = await c.probeRoutes();
    expect(routes.workflows_json).toBe(404);
    expect(routes.projects).toBe(200);
  });

  it('the seeded hpcworker: install writes the profile, probe and worker start write the files the extension reads back', async () => {
    const { client: c } = client(mock);
    const home = await c.home();
    const user = (await c.whoAmI())!;
    // install: one shell line; the profile names the state directory
    clock.advance(61_000);
    const inst = await c.shell(commands.install('mock'), { timeoutMs: 20_000 });
    expect(inst.exitCode).toBe(0);
    expect(inst.output).toMatch(/installed hpcworker 1/);
    const profile = await c.readFileIfExists(paths.profile(home));
    expect(profile).toBeDefined();
    const stateDir = stateDirFrom(profile, { home, user });
    expect(stateDir).toBe(`${home}/.hpcworker/state`);
    expect(siteFrom(profile)).toBe('mock');
    // probe: the sentence carries the job id; the file lands under the state directory
    clock.advance(61_000);
    const probe = await c.shell(commands.probe(), { timeoutMs: 20_000 });
    expect(parseJobId(probe.output)).toMatch(/^\d+$/);
    const probeJson = JSON.parse((await c.readFileIfExists(paths.probe(stateDir)))!);
    expect(probeJson.consent_recorded).toBe(true);
    expect(probeJson.egress.class).toBe('direct');
    expect(probeJson.image.claude_version).toMatch(/2\.1\.283/);
    // start: the sentence carries the job id; status.json, connection.json and rc.log appear in <state>/<name>/
    clock.advance(61_000);
    const start = await c.shell(commands.workerStart('worker', 'default'), { timeoutMs: 20_000 });
    const job = parseJobId(start.output)!;
    expect(job).toMatch(/^\d+$/);
    expect(start.output).toMatch(/find the session named mock-\d+/);
    const status = JSON.parse((await c.readFileIfExists(paths.status(stateDir, 'worker')))!);
    expect(status.state).toBe('online');
    expect(status.session_name).toBe(`mock-${job}`);
    expect(status.claude_login.loggedIn).toBe(true);
    const conn = JSON.parse((await c.readFileIfExists(paths.connection(stateDir, 'worker')))!);
    expect(conn.session_url).toMatch(/^https:\/\/claude\.ai\/code\//);
    expect(conn.permission_mode).toBe('default');
    expect(await c.readFileIfExists(paths.rcLog(stateDir, 'worker'))).toMatch(/Remote Control session registered/);
    // a second start finds the running job instead of submitting another
    clock.advance(61_000);
    const again = await c.shell(commands.workerStart('worker', 'default'), { timeoutMs: 20_000 });
    expect(parseJobId(again.output)).toBe(job);
    expect(again.output).toMatch(/already has job/);
    // stop
    clock.advance(61_000);
    const stop = await c.shell(commands.workerStop('worker'), { timeoutMs: 20_000 });
    expect(stop.output).toMatch(/stop requested/);
    clock.advance(61_000);
    expect((await c.activeJobs()).jobs.some((j) => j.pbsid === job)).toBe(false);
  });

  it('the discovery runs in under a few seconds and parses', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    const r = await c.shell(commands.discover(), { timeoutMs: 20_000 });
    expect(r.exitCode).toBe(0);
    // the seeded tool answers with JSON; the fallback would answer key=value lines
    expect(JSON.parse(r.output).scheduler.family).toBe('slurm');
    expect(r.ms).toBeLessThan(15_000);
  });

  it('every request left an audit record, none carrying a token', async () => {
    const { client: c, audit } = client(mock);
    await c.session();
    clock.advance(61_000);
    await c.shell('true', { timeoutMs: 20_000 });
    const text = await audit.exportText();
    expect(text).toMatch(/"method":"GET","endpoint":"\/pun\/sys\/dashboard\/"/);
    expect(text).toMatch(/"method":"WS","endpoint":"\/pun\/sys\/shell\/ssh\/default"/);
    expect(text).not.toMatch(/csrf=[A-Za-z0-9]/);
    expect(text).not.toContain(mock.railsToken);
  });
});
