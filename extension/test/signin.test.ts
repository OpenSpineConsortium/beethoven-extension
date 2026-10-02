// The first direct sign-in and the Claude sign-in on the direct way (core/signin.ts), and the gate's
// verbs with the key (core/sshChannel.ts), end to end against the grid stand-in (test/sshgrid, Python
// asyncssh on 127.0.0.1 with the grid's algorithms, its keyboard-interactive password then Google
// Authenticator code, its 2FA refusal, and a gate stand-in for key sessions). The bridge here is a plain
// TCP socket to the stand-in; the real ones are core/bridge.ts's.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Audit } from '../src/core/audit';
import type { BridgeProvider } from '../src/core/bridge';
import { commands } from '../src/core/contract';
import { keyState, memoryKeyStore, memoryUnlockStore, type Keyring } from '../src/core/keyring';
import { ConnectWatcher, CodeGate } from '../src/core/login';
import { SignInFlow, type SheetState } from '../src/core/signin';
import { directFailureOf, SshPortal } from '../src/core/sshChannel';
import type { ConnectEvent } from '../src/core/contract';
import { memoryKV } from './helpers';
import { havePythonAsyncssh, startGrid, tcpStream, type Grid } from './sshgrid/harness';

const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const PY = havePythonAsyncssh();

const tcpBridge = (port: number, opened: { n: number } = { n: 0 }): BridgeProvider => ({
  id: 'helper',
  probe: async () => ({ id: 'helper', state: 'available', detail: 'a TCP socket to the stand-in' }),
  open: async () => {
    opened.n++;
    return tcpStream(port);
  },
});

const until = async (cond: () => boolean, ms = 15_000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe.skipIf(!PY)('the first direct sign-in, against the grid stand-in', () => {
  let grid: Grid;
  beforeAll(async () => {
    grid = await startGrid();
  }, 60_000);
  afterAll(() => grid?.stop());

  const portalFor = (k: Keyring, account: string, kv = memoryKV()) =>
    new SshPortal({ bridge: async () => tcpBridge(grid.port), identity: async () => (await import('../src/core/keyring')).loadIdentity(k), account: async () => account, audit: new Audit(kv), pin: grid.fp });

  const flowFor = (k: Keyring, states: SheetState[], o: { purpose?: 'enrol' | 'claude'; holdMs?: number } = {}) =>
    new SignInFlow(
      {
        bridge: async () => tcpBridge(grid.port),
        keyring: k,
        sharedDir: async () => SHARED,
        site: async () => 'wayne',
        verify: async (account) => portalFor(k, account).version(),
        changed: (s) => states.push(JSON.parse(JSON.stringify(s)) as SheetState),
        pin: grid.fp,
        ...(o.holdMs !== undefined ? { holdMs: o.holdMs } : {}),
      },
      o.purpose ?? 'enrol',
    );

  it("asks exactly what the grid asks, enrols this computer's key in that session, checks it with a second connection, and keeps no answer", async () => {
    const k: Keyring = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const states: SheetState[] = [];
    const flow = flowFor(k, states);
    expect(flow.start('ST1234 ')).toBe(true);
    await until(() => flow.state.phase === 'prompt');
    expect(flow.state.prompts).toEqual([{ text: 'Password: ', echo: false, kind: 'password' }]);
    expect(flow.answer('pw-correct')).toEqual({ sent: true, waiting: 0 });
    await until(() => flow.state.phase === 'prompt' && flow.state.prompts?.[0]?.kind === 'code');
    expect(flow.state.prompts).toEqual([{ text: 'Your google authenticator one-time verification code: ', echo: false, kind: 'code' }]);
    flow.answer('864209');
    const out = await flow.done();
    expect(out).toMatchObject({ account: 'st1234', setupReady: true, version: { account: 'st1234', claude: 'no' } });
    expect(flow.state.phase).toBe('done');
    // the grid has this computer's public key, added by the enrolment line, and the account was set up
    const ks = await keyState(k);
    expect(ks).toMatchObject({ present: true, enrolled: true, account: 'st1234', wrapped: false });
    const g = await grid.state();
    const id = await (await import('../src/core/keyring')).loadIdentity(k);
    expect(g.keys.st1234).toEqual([[id.keyType, id.publicKeyBase64()]]);
    expect(g.state.commands.some((c) => c.includes(' browser-key add ') && c.endsWith(' beethoven-browser'))).toBe(true);
    expect(g.state.commands.some((c) => c.includes(' install --shared '))).toBe(true);
    expect(g.state.commands).toContain('gate version');
    // no answer anywhere in what the sheet ever showed
    const seen = JSON.stringify(states);
    expect(seen).not.toContain('pw-correct');
    expect(seen).not.toContain('864209');
    // the session is held for a Claude sign-in at the first Connect
    expect(flow.holding()).toBe(true);
    flow.dispose();
    expect(flow.holding()).toBe(false);
  });

  it('a wrong password: the grid asks again; after three refusals Beethoven stops', async () => {
    const k: Keyring = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const flow = flowFor(k, []);
    flow.start('ab1234');
    for (let i = 0; i < 3; i++) {
      await until(() => flow.state.phase === 'prompt' || flow.state.phase === 'stopped');
      if (flow.state.phase === 'stopped') break;
      if (i > 0) expect(flow.state.notAccepted).toBe(true);
      flow.answer('wrong');
      await until(() => flow.state.phase !== 'working');
    }
    await until(() => flow.state.phase === 'stopped');
    expect(flow.state.refusals).toBe(3);
    expect(await flow.done()).toBeUndefined();
    expect((await keyState(k)).enrolled).toBe(false);
  });

  it("the grid's \"wrong code, or no 2FA set up\" refusal is never taken for \"no code\": the sheet asks which, and it counts as a refusal", async () => {
    const k: Keyring = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const flow = flowFor(k, []);
    flow.start('nocode');
    await until(() => flow.state.phase === 'prompt');
    flow.answer('pw-correct');
    await until(() => flow.state.phase === 'code-refused');
    expect(await flow.done()).toBeUndefined();
    expect(flow.state).toMatchObject({ codeRefusals: 1, refusals: 1 });
    expect(flow.state.instruction ?? '').not.toMatch(/2FA/);
    // typed again: the second time in a row
    expect(flow.retry()).toBe(true);
    await until(() => flow.state.phase === 'prompt');
    flow.answer('pw-correct');
    await until(() => flow.state.phase === 'code-refused');
    expect(flow.state).toMatchObject({ codeRefusals: 2, refusals: 2 });
    // and a third: three refusals stop the sheet like any others
    flow.retry();
    await until(() => flow.state.phase === 'prompt');
    flow.answer('pw-correct');
    await until(() => flow.state.phase === 'stopped');
    expect(flow.state.refusals).toBe(3);
  });

  it('three refusals: Try again is refused for the account until the cooldown has passed (nothing is opened), across a new sheet too', async () => {
    const { memoryRefusalStore } = await import('../src/core/signin');
    const store = memoryRefusalStore();
    let now = 1_000_000;
    const opened = { n: 0 };
    const make = () =>
      new SignInFlow(
        { bridge: async () => tcpBridge(grid.port, opened), keyring: { store: memoryKeyStore(), unlock: memoryUnlockStore() }, sharedDir: async () => SHARED, site: async () => undefined, verify: async (account) => ({ framework: '11', due: 'never', account, claude: 'no' }), changed: () => undefined, pin: grid.fp, refusals: store, now: () => now, cooldownMs: 15 * 60_000 },
        'enrol',
      );
    const flow = make();
    flow.start('ab1234');
    for (let i = 0; i < 3; i++) {
      await until(() => flow.state.phase === 'prompt' || flow.state.phase === 'stopped');
      if (flow.state.phase === 'stopped') break;
      flow.answer('wrong');
      await until(() => flow.state.phase !== 'working');
    }
    await until(() => flow.state.phase === 'stopped');
    expect(flow.state.retryAt).toBe(now + 15 * 60_000);
    expect(store.notes.get('ab1234')?.count).toBe(3);
    const before = opened.n;
    // Try again at once: stopped again, and the grid is not asked
    expect(flow.retry()).toBe(true);
    await until(() => flow.state.phase === 'stopped');
    expect(opened.n).toBe(before);
    // a new sheet (a restarted background) knows it too
    const again = make();
    again.start('ab1234');
    await until(() => again.state.phase === 'stopped');
    expect(opened.n).toBe(before);
    // after the cooldown, the grid is asked again, the count starts over
    now += 15 * 60_000 + 1;
    again.retry();
    await until(() => again.state.phase === 'prompt');
    expect(opened.n).toBe(before + 1);
    expect(again.state.refusals).toBe(0);
    again.dispose();
  });

  it("a key this browser cannot keep stops the sheet before the grid is asked for anything", async () => {
    const opened = { n: 0 };
    const broken: Keyring = { store: { get: async () => undefined, put: async () => { throw new Error('Internal error opening backing store for indexedDB.open'); }, delete: async () => undefined }, unlock: memoryUnlockStore() };
    const flow = new SignInFlow({ bridge: async () => tcpBridge(grid.port, opened), keyring: broken, sharedDir: async () => SHARED, site: async () => undefined, verify: async () => ({ framework: '11', due: 'never', account: 'x', claude: 'no' }), changed: () => undefined, pin: grid.fp }, 'enrol');
    flow.start('st1234');
    await until(() => flow.state.phase === 'failed');
    expect(flow.state.failure).toBe('key-store');
    expect(opened.n).toBe(0);
  });

  it('a grid whose host key is not the pin: nothing is sent, the sheet says so', async () => {
    const k: Keyring = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const flow = new SignInFlow({ bridge: async () => tcpBridge(grid.port), keyring: k, sharedDir: async () => SHARED, site: async () => 'wayne', verify: async () => ({ framework: '11', due: 'never', account: 'x', claude: 'no' }), changed: () => undefined, pin: 'SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s' }, 'enrol');
    flow.start('st1234');
    await until(() => flow.state.phase === 'failed');
    expect(flow.state.failure).toBe('wrong-grid');
  });

  it('refuses an AccessID that is not one, and opens nothing', async () => {
    const opened = { n: 0 };
    const flow = new SignInFlow({ bridge: async () => tcpBridge(grid.port, opened), keyring: { store: memoryKeyStore(), unlock: memoryUnlockStore() }, sharedDir: async () => SHARED, site: async () => undefined, verify: async () => ({ framework: '11', due: 'never', account: 'x', claude: 'no' }), changed: () => undefined, pin: grid.fp }, 'enrol');
    expect(flow.start('ab 1234')).toBe(false);
    expect(flow.start("x';--")).toBe(false);
    expect(flow.start('')).toBe(false);
    expect(opened.n).toBe(0);
  });

  it('the Claude sign-in sitting in the held session: the link, the code on stdin, signed in', async () => {
    const k: Keyring = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const flow = flowFor(k, []);
    flow.start('st1234');
    await until(() => flow.state.phase === 'prompt');
    flow.answer('pw-correct');
    await until(() => flow.state.prompts?.[0]?.kind === 'code');
    flow.answer('864209');
    await flow.done();
    const events: ConnectEvent[] = [];
    let gate: CodeGate | undefined;
    const watcher = new ConnectWatcher((ev) => {
      events.push(ev);
      gate?.onEvent(ev);
    });
    const line = commands.connect(SHARED, { name: 'worker', site: 'wayne', installId: '0123456789abcdef0123456789abcdef', login: 'auto', permissionMode: 'default', chain: true });
    const shell = await flow.openSitting(line, (t) => watcher.feed(t));
    gate = new CodeGate((input) => shell.send(input));
    await until(() => events.some((e) => e.kind === 'auth-url'));
    expect(events.find((e) => e.kind === 'auth-url')).toMatchObject({ url: 'https://claude.ai/oauth/authorize?code=true&client_id=test' });
    await until(() => gate!.submit('goodcode-abcdef') === 'typed' || events.some((e) => e.kind === 'code-received'), 10_000).catch(() => undefined);
    const end = await shell.done;
    expect(end.reason).toBe('closed');
    expect(events.some((e) => e.kind === 'step' && e.step.step === 'signed-in')).toBe(true);
    expect(events.some((e) => e.kind === 'step' && e.step.step === 'done')).toBe(true);
    expect((await grid.state()).state.claude).toBe('yes');
  }, 60_000);
});

describe.skipIf(!PY)('the gate with the key (core/sshChannel.ts)', () => {
  let grid: Grid;
  let k: Keyring;
  beforeAll(async () => {
    k = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const { ensureKey } = await import('../src/core/keyring');
    const id = await ensureKey(k);
    grid = await startGrid({ seed_key: ['st1234', id.keyType, id.publicKeyBase64()] });
  }, 60_000);
  afterAll(() => grid?.stop());

  const portal = (kv = memoryKV(), account = 'st1234') => new SshPortal({ bridge: async () => tcpBridge(grid.port), identity: async () => (await import('../src/core/keyring')).loadIdentity(k), account: async () => account, audit: new Audit(kv), pin: grid.fp });

  it('session(): signed in, the account from the gate', async () => {
    const s = await portal().session();
    expect(s).toMatchObject({ signedIn: true, state: 'signed-in', username: 'st1234' });
  });

  it('carries the 11.0.0 lines as the gate verbs and refuses the rest before sending them', async () => {
    const p = portal();
    const before = (await grid.state()).state.commands.length;
    const refused = await p.shell(commands.installShared(SHARED, 'wayne'));
    expect(refused.exitCode).toBe(126);
    expect((await grid.state()).state.commands.length).toBe(before);
    const c = await p.connectGate({ name: 'worker', site: 'wayne', permissionMode: 'default', chain: true });
    expect(c.lines).toContain('HPCW-STEP queued 40501234 new /rs/rs_grp_oschome/st1234/hpcworker/worker');
    expect((await grid.state()).state.commands).toContain('gate connect worker wayne - default chain');
    const files = await p.readRun('worker', ['status.json', 'progress.log', 'node']);
    expect(JSON.parse(files['status.json']!)).toMatchObject({ state: 'queued', job: '40501234' });
    expect(files['progress.log']).toMatch(/Asked the grid for a computer/);
    expect(files.node).toBeUndefined();
    expect(await p.readFileIfExists('/rs/rs_grp_oschome/st1234/hpcworker/worker/status.json')).toContain('"queued"');
    await expect(p.readFileIfExists('/home/st1234/.ssh/id_rsa')).rejects.toMatchObject({ failure: 'refused' });
    // connect and stop are scheduler-class: the chokepoint holds them to one a minute, as on the 11.0.0 way
    await expect(p.shell(commands.stop(SHARED, 'worker'))).rejects.toMatchObject({ name: 'FloorError' });
    const stop = await portal().shell(commands.stop(SHARED, 'worker'));
    expect(stop.exitCode).toBe(0);
    expect(stop.output).toMatch(/^worker worker: stopped \(/m);
  });

  it('the watch connection: one connection for many reads while the panel is open', async () => {
    const opened = { n: 0 };
    const p = new SshPortal({ bridge: async () => tcpBridge(grid.port, opened), identity: async () => (await import('../src/core/keyring')).loadIdentity(k), account: async () => 'st1234', audit: new Audit(memoryKV()), pin: grid.fp });
    p.hold(true);
    await p.version();
    await p.readRun('worker', ['status.json', 'connection.json']);
    await p.version();
    expect(opened.n).toBe(1);
    p.hold(false);
    await p.version();
    expect(opened.n).toBe(2);
  });

  it('a key the grid does not take reads as signed out, and the failure word says why', async () => {
    const s = await portal(memoryKV(), 'ab1234').session();
    expect(s).toMatchObject({ signedIn: false, state: 'signed-out' });
    const e = await portal(memoryKV(), 'ab1234').version().catch((x) => x);
    expect(directFailureOf(e)).toBe('key-refused');
  });

  it('forget removes the line through the gate; the key is refused afterwards', async () => {
    const p = portal();
    expect(await p.forget()).toBe('forgotten');
    expect((await grid.state()).keys.st1234).toEqual([]);
    expect((await portal().session()).state).toBe('signed-out');
  });
});

describe.skipIf(!PY)("the gate with the key, when the account's ~/.bashrc prints first, a file is refused, or a cap is reached", () => {
  let grid: Grid;
  let k: Keyring;
  beforeAll(async () => {
    k = { store: memoryKeyStore(), unlock: memoryUnlockStore() };
    const { ensureKey } = await import('../src/core/keyring');
    const id = await ensureKey(k);
    grid = await startGrid({ seed_key: ['st1234', id.keyType, id.publicKeyBase64()], bashrc: 'Welcome to warrior (module system loaded)\n', refuse_read: ['progress.log'], gate_limit: 'names', job: '40501234' });
  }, 60_000);
  afterAll(() => grid?.stop());

  const portal = () => new SshPortal({ bridge: async () => tcpBridge(grid.port), identity: async () => (await import('../src/core/keyring')).loadIdentity(k), account: async () => 'st1234', audit: new Audit(memoryKV()), pin: grid.fp });

  it('version still reads; a cap reached on connect is its own failure, with which cap', async () => {
    expect((await portal().version()).account).toBe('st1234');
    const e = await portal()
      .connectGate({ name: 'worker', site: 'wayne', permissionMode: 'default', chain: true })
      .catch((x) => x);
    expect(directFailureOf(e)).toBe('limit');
    expect((e as { limit?: string }).limit).toBe('names');
  });

  it('a refused file never sinks the others, and the JSON is found after what ~/.bashrc printed', async () => {
    const { parseGateJson, gateText } = await import('../src/core/contract');
    const files = await portal().readRun('worker', ['status.json', 'progress.log', 'node']);
    // progress.log refused by this gate: skipped, not thrown; node not there: undefined
    expect(files['progress.log']).toBeUndefined();
    expect(files.node).toBeUndefined();
    // status.json came after the account's ~/.bashrc line: not JSON as it is, found by parseGateJson
    expect(files['status.json']).toMatch(/^Welcome to warrior/);
    expect(() => JSON.parse(files['status.json']!)).toThrow();
    expect(parseGateJson<{ state: string; job: string }>(files['status.json'])).toMatchObject({ state: 'online', job: '40501234' });
    // the same with the gate's own marker, should the framework print one, and the node's last line
    expect(parseGateJson('Welcome\nHPCW-GATE read 14\n{"state":"x"}\nnoise')).toEqual({ state: 'x' });
    expect(parseGateJson('{ not json\n{"a":1}\n')).toEqual({ a: 1 });
    expect(parseGateJson('nothing here')).toBeUndefined();
    expect(gateText('Welcome to warrior\nasx15\n', 'node')).toBe('asx15');
  });
});
