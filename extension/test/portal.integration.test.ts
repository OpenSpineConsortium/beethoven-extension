// The portal client against the mock portal, in Node: session, username, Files reads, writes and
// touches (with the Rails CSRF and Origin rules), Active Jobs, cancel, the shell bootstrap with
// a real bash behind it, the 3146 refusals, the reverse-proxy probe, the floors (one clock per
// class, so a check run never trips itself), and the seeded hpcworker's install / probe / worker
// start / stop with the files the extension reads back, including the registration block and the
// stop-file path the panel uses.
//
// Every shell round spawns Git Bash plus node, so the seeded-tool tests carry their own timeouts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Audit, FloorError } from '../src/core/audit';
import { commands, isClaudeAuthUrl, isEnvironmentUrl, parseJobId, parseRegistration, paths, siteFrom, stateDirFrom } from '../src/core/contract';
import { makeAcknowledgement, type Acknowledgement } from '../src/core/disclosure';
import { LoginWatcher } from '../src/core/login';
import { PortalClient, PortalError } from '../src/core/portal';
import { runShellCommand, ShellError } from '../src/core/shell';
import { startWorker, stopWorker } from '../src/core/worker';
import { createMockPortal } from '../mock-ood/server.mjs';
import { cookieNet, memoryKV } from './helpers';

type Portal = Awaited<ReturnType<typeof createMockPortal>>;

const SLOW = 120_000;
let mock: Portal;
let t = 1_790_000_000_000;
const clock = { now: () => t, advance: (ms: number) => (t += ms) };

function client(p: Portal, net = cookieNet(p.cookie, p.origin), opts: { warmDelaysMs?: number[] } = {}) {
  const audit = new Audit(memoryKV(), { now: clock.now });
  return { client: new PortalClient(p.origin, net, audit, { shellHost: 'default', ...opts }), audit };
}

const ACK: Acknowledgement = makeAcknowledgement('worker');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  it('home, listing, write, read, mkdir and touch through the Files routes', async () => {
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
    // touch: an empty file appears, an existing one keeps its content
    await c.touch(`${home}/proj/stop`);
    expect(await c.readFileIfExists(`${home}/proj/stop`)).toBe('');
    await c.touch(`${home}/proj/hello.txt`);
    expect(await c.readFile(`${home}/proj/hello.txt`)).toBe('hello from the extension\n');
  });

  it('a missing file downloads as an HTML page with status 200 (the live portal\'s answer): that is "not a file", and existence comes from the listing', async () => {
    const { client: c } = client(mock);
    const home = await c.home();
    // what the Files app really does: 200 and a page, 58,730 bytes on the live portal
    const raw = await fetch(`${mock.origin}/pun/sys/dashboard/files/fs${home}/nothing/.restricted?download=1`, { headers: { cookie: mock.cookie } });
    expect(raw.status).toBe(200);
    expect(raw.headers.get('content-type')).toMatch(/text\/html/);
    expect((await raw.text()).length).toBeGreaterThan(1000);
    // the client does not mistake the page for the file
    expect(await c.readFileIfExists(`${home}/nothing/.restricted`)).toBeUndefined();
    await expect(c.readFile(`${home}/nothing/.restricted`)).rejects.toMatchObject({ status: 404 });
    expect(await c.exists(`${home}/nothing/.restricted`)).toBe(false);
    expect(await c.exists(`${home}/proj/.restricted`)).toBe(false);
    expect(await c.stat(`${home}/proj/.restricted`)).toBeUndefined();
    // an empty marker really there: the listing names it, and its download is empty, not a page
    await c.touch(`${home}/proj/.restricted`);
    expect(await c.exists(`${home}/proj/.restricted`)).toBe(true);
    expect(await c.stat(`${home}/proj/.restricted`)).toMatchObject({ name: '.restricted', type: 'f', size: 0 });
    expect(await c.readFileIfExists(`${home}/proj/.restricted`)).toBe('');
    expect(await c.exists(`${home}/proj/hello.txt`)).toBe(true);
    expect(await c.exists(`${home}/proj`)).toBe(true);
  });

  it('a cold PUN: the first request after an idle answers 500 once; the client wakes it with backoff before any Files call, and again after a 5xx', async () => {
    const cold = await createMockPortal({ port: 0, coldPun: 400 });
    try {
      // a fresh client's first Files call warms the portal first: one 500, one retry, then the listing
      const { client: c, audit } = client(cold, cookieNet(cold.cookie, cold.origin), { warmDelaysMs: [20, 20, 20] });
      const home = await c.home();
      expect(cold.state.coldHits).toBe(1);
      const l = await c.listDir(home);
      expect(l.files.length).toBeGreaterThan(0);
      expect(cold.state.coldHits).toBe(1);
      // warm() itself reports what it took
      const w = await c.warm();
      expect(w.ok).toBe(true);
      expect(w.attempts).toBe(1);
      expect(w.detail).toMatch(/awake/);
      // the PUN idles out again: a read meets the 500, the client warms again and the read succeeds
      await c.writeFile(`${home}/status.json`, '{"state":"online"}');
      await sleep(500);
      expect(await c.readFileIfExists(`${home}/status.json`)).toBe('{"state":"online"}');
      expect(cold.state.coldHits).toBe(2);
      // a cold answer during the warm-up itself is retried with the backoff and counted
      await sleep(500);
      const again = await c.warm();
      expect(again.ok).toBe(true);
      expect(again.attempts).toBe(2);
      expect(again.detail).toMatch(/woke up after 2 tries/);
      // every attempt left a dashboard record and none a token
      const text = await audit.exportText();
      expect(text.match(/"endpoint":"\/pun\/sys\/dashboard\/"/g)?.length).toBeGreaterThanOrEqual(4);
      expect(text).not.toContain(cold.railsToken);
    } finally {
      await cold.close();
    }
  });

  it('a PUN that never wakes: the warm-up stops after the backoff and says so instead of looping', async () => {
    const stuck = await createMockPortal({ port: 0, coldPun: 1 });
    try {
      const { client: c } = client(stuck, cookieNet(stuck.cookie, stuck.origin), { warmDelaysMs: [5, 5, 5] });
      const w = await c.warm();
      expect(w.ok).toBe(false);
      expect(w.attempts).toBe(4);
      expect(w.status).toBe(500);
      expect(w.detail).toMatch(/did not wake up after 4 tries/);
    } finally {
      await stuck.close();
    }
  });

  it('the dashboard refuses a write with a foreign Origin or a stale token (422), as Rails does', async () => {
    const url = `${mock.origin}/pun/sys/dashboard/files/fs${mock.virtualHome}/evil.txt`;
    const foreign = await fetch(url, { method: 'PUT', headers: { cookie: mock.cookie, origin: 'https://evil.example', 'X-CSRF-Token': mock.railsToken }, body: 'x' });
    expect(foreign.status).toBe(422);
    const stale = await fetch(url, { method: 'PUT', headers: { cookie: mock.cookie, origin: mock.origin, 'X-CSRF-Token': 'stale' }, body: 'x' });
    expect(stale.status).toBe(422);
    const { client: c } = client(mock, cookieNet(mock.cookie, 'https://evil.example'));
    await expect(c.writeFile(`${mock.virtualHome}/evil.txt`, 'x')).rejects.toThrow(/stale form token/);
    await expect(c.touch(`${mock.virtualHome}/evil.txt`)).rejects.toThrow(/stale form token/);
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
    // the job now shows in Active Jobs (its own clock, so no wait after the submit), and can be cancelled through the portal's own route
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

  it('the floors: a submit holds its 60 s clock, a plain line its 15 s clock, the job list and the discovery their own', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    await c.shell('true', { timeoutMs: 20_000 });
    // a plain `true` is a shell call (15 s floor); a submit is a scheduler call (60 s floor)
    clock.advance(16_000);
    await c.shell('sbatch --parsable x', { timeoutMs: 20_000 });
    clock.advance(30_000);
    await expect(c.shell('sbatch --parsable y')).rejects.toBeInstanceOf(FloorError);
    expect(await c.auditWait('scheduler')).toBe(30_000);
    // the job list and the cancel share the jobs clock; neither is held by the submit
    await c.activeJobs();
    await expect(c.activeJobs()).rejects.toMatchObject({ cls: 'jobs' });
    await expect(c.cancelJob('mock', '1')).rejects.toBeInstanceOf(FloorError);
    // the discovery batch is admitted beside both, and then holds its own clock
    await c.shell(commands.discover(), { timeoutMs: 20_000 });
    await expect(c.shell(commands.discover())).rejects.toMatchObject({ cls: 'discover' });
    expect(await c.auditWait('files')).toBe(0);
  }, SLOW);

  it('a full check run in one go: the discovery shell and then Active Jobs, with no wait between them', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    const d = await c.shell(commands.discover(), { timeoutMs: 20_000 });
    expect(d.exitCode).toBe(0);
    const jobs = await c.activeJobs();
    expect(jobs.errors).toEqual([]);
  }, SLOW);

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

  describe('the seeded hpcworker', () => {
    let home = '';
    let user = '';
    let stateDir = '';

    it('install writes the profile; the probe writes probe.json under the state directory', async () => {
      const { client: c } = client(mock);
      home = await c.home();
      user = (await c.whoAmI())!;
      // install: one shell line; the profile names the state directory
      clock.advance(61_000);
      const inst = await c.shell(commands.install('mock'), { timeoutMs: 30_000 });
      expect(inst.exitCode).toBe(0);
      expect(inst.output).toMatch(/installed hpcworker 1/);
      const profile = await c.readFileIfExists(paths.profile(home));
      expect(profile).toBeDefined();
      stateDir = stateDirFrom(profile, { home, user });
      expect(stateDir).toBe(`${home}/.hpcworker/state`);
      expect(siteFrom(profile)).toBe('mock');
      // probe: the sentence carries the job id; the file lands under the state directory
      clock.advance(61_000);
      const probe = await c.shell(commands.probe(), { timeoutMs: 30_000 });
      expect(parseJobId(probe.output)).toMatch(/^\d+$/);
      const probeJson = JSON.parse((await c.readFileIfExists(paths.probe(stateDir)))!);
      expect(probeJson.consent_recorded).toBe(true);
      expect(probeJson.consent_source).toBe('claude_config');
      expect(probeJson.workspace_trusted).toBe(true);
      expect(probeJson.egress.class).toBe('direct');
      expect(probeJson.image.claude_version).toMatch(/2\.1\.283/);
    }, SLOW);

    it('worker start writes status.json, connection.json and rc.log with the registration block; a second start finds the job', async () => {
      const { client: c } = client(mock);
      clock.advance(61_000);
      const start = await startWorker(c, { name: 'worker', permissionMode: 'default', site: 'fallback', ack: ACK });
      expect(start.job).toMatch(/^\d+$/);
      expect(start.site).toBe('mock');
      expect(start.stateDir).toBe(stateDir);
      expect(start.alreadyRunning).toBe(false);
      const status = JSON.parse((await c.readFileIfExists(paths.status(stateDir, 'worker')))!);
      expect(status.state).toBe('online');
      expect(status.job).toBe(start.job);
      expect(status.session_name).toMatch(/^node01-[a-z]+-[a-z]+$/);
      expect(isEnvironmentUrl(status.environment_url)).toBe(true);
      expect(status.claude_login.loggedIn).toBe(true);
      const conn = JSON.parse((await c.readFileIfExists(paths.connection(stateDir, 'worker')))!);
      expect(conn.session_name).toBe(status.session_name);
      expect(conn.environment_url).toBe(status.environment_url);
      expect(conn.capacity).toBe('1/32');
      expect(conn.permission_mode).toBe('default');
      expect(conn.requested_name).toBe(`mock-${start.job}`);
      expect(status.consent_source).toBe('claude_config');
      expect(status.chain).toBe(true);
      expect(status.next_job).toMatch(/^\d+$/);
      // rc.log carries the exact registration block, and the parser reads the same name and link out of it
      const log = (await c.readFileIfExists(paths.rcLog(stateDir, 'worker')))!;
      expect(log).toMatch(/·✔︎· Connected · phone · HEAD/);
      expect(log).toMatch(/Capacity: 1\/32 · New sessions will be created in the current directory/);
      const reg = parseRegistration(log);
      expect(reg.session_name).toBe(status.session_name);
      expect(reg.environment_url).toBe(status.environment_url);
      expect(reg.capacity).toBe('1/32');
      // a second start finds the running job instead of submitting another
      clock.advance(61_000);
      const again = await startWorker(c, { name: 'worker', permissionMode: 'default', site: 'fallback', ack: ACK });
      expect(again.job).toBe(start.job);
      expect(again.alreadyRunning).toBe(true);
    }, SLOW);

    it('the environment link is the same for every worker on this login', async () => {
      const { client: c } = client(mock);
      clock.advance(61_000);
      const second = await startWorker(c, { name: 'thesis', permissionMode: 'default', site: 'mock', ack: makeAcknowledgement('thesis') });
      const a = JSON.parse((await c.readFileIfExists(paths.connection(stateDir, 'worker')))!);
      const b = JSON.parse((await c.readFileIfExists(paths.connection(stateDir, 'thesis')))!);
      expect(b.environment_url).toBe(a.environment_url);
      expect(b.session_name).not.toBe(a.session_name);
      expect(second.job).not.toBe(a.job);
    }, SLOW);

    it('stop right after a start: the stop file is written through the Files app and the scheduler is not asked again', async () => {
      const { client: c } = client(mock);
      clock.advance(61_000);
      // one client, as in the browser (the clocks live in storage.local there): the start a moment ago
      // holds the scheduler clock, so the stop file is the mechanism and the tool line waits
      const started = await startWorker(c, { name: 'thesis', permissionMode: 'default', site: 'mock', ack: makeAcknowledgement('thesis') });
      expect(started.alreadyRunning).toBe(true);
      const out = await stopWorker(c, { stateDir, run: 'thesis', job: started.job });
      expect(out.stopFile).toBe(true);
      expect(out.toolStop).toBeUndefined();
      expect(out.note).toMatch(/stop file is written/);
      expect(out.note).toMatch(/asked less than a minute ago/);
      expect(await c.readFileIfExists(paths.stop(stateDir, 'thesis'))).toBe('');
      // a minute later the tool's own stop runs as well, once
      clock.advance(61_000);
      const later = await stopWorker(c, { stateDir, run: 'thesis', job: started.job });
      expect(later.stopFile).toBe(true);
      expect(later.toolStop?.exitCode).toBe(0);
      expect(later.toolStop?.output).toMatch(/left on its own/);
      expect(await c.readFileIfExists(paths.stopDone(stateDir, 'thesis'))).toBeDefined();
    }, SLOW);

    it('stop through the tool ends the worker job, and a workspace marked restricted is never started', async () => {
      const { client: c } = client(mock);
      const job = (await c.readFileIfExists(paths.jobId(stateDir, 'worker')))!.trim();
      clock.advance(61_000);
      const stop = await stopWorker(c, { stateDir, run: 'worker', job });
      expect(stop.toolStop?.exitCode).toBe(0);
      const status = JSON.parse((await c.readFileIfExists(paths.status(stateDir, 'worker')))!);
      expect(status.state).toBe('stopped');
      clock.advance(61_000);
      expect((await c.activeJobs()).jobs.some((j) => j.pbsid === job)).toBe(false);
      // the student's own marker: the extension refuses before typing anything, and so does the tool
      await c.touch(paths.restrictedMarker(stateDir, 'worker'));
      clock.advance(61_000);
      const before = mock.state.shells;
      await expect(startWorker(c, { name: 'worker', permissionMode: 'default', site: 'mock', ack: ACK })).rejects.toThrow(/marked restricted/);
      expect(mock.state.shells).toBe(before);
      const r = await c.shell(commands.workerStart('worker', 'default'), { timeoutMs: 30_000 });
      expect(r.exitCode).not.toBe(0);
      expect(r.output).toMatch(/marked restricted/);
    }, SLOW);

    it('a start writes the consent marker for the student\'s acknowledgement when it is not on the cluster yet', async () => {
      const { client: c } = client(mock);
      const consent = paths.consent(await c.home());
      expect(await c.exists(consent)).toBe(false);
      clock.advance(61_000);
      const out = await startWorker(c, { name: 'thesis', permissionMode: 'default', site: 'mock', ack: makeAcknowledgement('thesis'), consent: { installId: 'install0001', written: false } });
      expect(out.consentWritten).toBe(true);
      expect(await c.exists(consent)).toBe(true);
      expect(await c.readFile(consent)).toMatch(/^yes 20\d\d-\S+ install0001\n$/);
    }, SLOW);

    it('the login terminal: the plain sitting prints AUTH-URL, takes the typed code, ends with SIGNED-IN; the audit keeps byte counts and never the code', async () => {
      const { client: c, audit } = client(mock);
      clock.advance(61_000);
      let opened: string | undefined;
      let session: Awaited<ReturnType<typeof c.openLoginShell>> | undefined;
      let finished = false;
      let sent = false;
      const CODE = 'AbCdEf123456#mock-code';
      // what the panel's terminal does: open the page once, type the code once at the prompt, close the sitting once the outcome is known
      const watcher = new LoginWatcher((ev) => {
        if (ev.kind === 'auth-url' && !opened) {
          opened = ev.url;
          expect(isClaudeAuthUrl(ev.url)).toBe(true);
        }
        if (ev.kind === 'code-prompt' && !sent && session) {
          sent = true;
          session.send(`${CODE}\r`);
        }
        if ((ev.kind === 'signed-in' || ev.kind === 'failed') && !finished) {
          finished = true;
          session?.close();
        }
      });
      const sessionP = c.openLoginShell(commands.claudeLoginPlain, (text) => watcher.feed(text));
      session = await sessionP;
      // the sitting is an srun on the login node: it took the scheduler clock, so a second sitting within the minute waits
      expect(await c.auditWait('scheduler')).toBe(60_000);
      await expect(c.openLoginShell(commands.claudeLoginPlain, () => undefined)).rejects.toBeInstanceOf(FloorError);
      if (finished) session.close();
      const end = await session.done;
      expect(opened).toMatch(/^https:\/\/claude\.ai\/oauth\/authorize\?/);
      expect(watcher.outcome).toBe('signed-in');
      expect(watcher.detail).toMatch(/student@example.edu/);
      expect(end.inputBytes).toBe(CODE.length + 1);
      expect(end.outputBytes).toBeGreaterThan(100);
      // the framework's consent marker is there afterwards (the mock's login writes it, as the real one records the answer)
      expect(await c.exists(paths.consent(await c.home()))).toBe(true);
      const records = await audit.records();
      const rec = records.find((r) => /login terminal/.test(r.outcome));
      expect(rec).toBeDefined();
      expect(rec!.method).toBe('WS');
      expect(rec!.bytes).toBe(end.outputBytes + end.inputBytes);
      expect(rec!.outcome).toMatch(new RegExp(`${CODE.length + 1} bytes typed`));
      expect(JSON.stringify(records)).not.toContain(CODE);
      expect(JSON.stringify(records)).not.toContain('mock-code');
    }, SLOW);

    it('the login terminal: a refused code ends with HPCW-LOGIN-FAILED and the sentence; the shell is closed either way', async () => {
      const { client: c } = client(mock);
      clock.advance(61_000);
      const before = mock.state.shells;
      process.env.MOCK_LOGIN_FAIL = '1';
      try {
        let session: Awaited<ReturnType<typeof c.openLoginShell>> | undefined;
        let finished = false;
        let sent = false;
        const watcher = new LoginWatcher((ev) => {
          if (ev.kind === 'code-prompt' && !sent && session) {
            sent = true;
            session.send('wrong\r');
          }
          if ((ev.kind === 'signed-in' || ev.kind === 'failed') && !finished) {
            finished = true;
            session?.close();
          }
        });
        const p = c.openLoginShell(commands.claudeLoginPlain, (text) => watcher.feed(text));
        session = await p;
        if (finished) session.close();
        const end = await session.done;
        expect(watcher.outcome).toBe('failed');
        expect(watcher.detail).toMatch(/not accepted/);
        expect(end.reason).toBe('client');
        expect(mock.state.shells).toBe(before + 1);
        expect(mock.state.fatal).toBe(0);
      } finally {
        delete process.env.MOCK_LOGIN_FAIL;
      }
    }, SLOW);
  });

  it('the discovery runs in under a few seconds and parses, naming the login node', async () => {
    const { client: c } = client(mock);
    clock.advance(61_000);
    const r = await c.shell(commands.discover(), { timeoutMs: 20_000 });
    expect(r.exitCode).toBe(0);
    // the seeded tool answers with JSON; the fallback would answer key=value lines
    const j = JSON.parse(r.output);
    expect(j.scheduler.family).toBe('slurm');
    expect(j.host).toBe('login1');
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
