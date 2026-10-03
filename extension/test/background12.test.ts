// 12.0.0's direct way through the real background (src/entrypoints/background.ts), run whole under Node:
// the fake Chrome of test/fakebrowser.ts (now with native messaging and IndexedDB), the bundled helper
// played in-process by its wire contract (test/fakebrowser.ts nativeHelperToTcp), and the grid stand-in
// (test/sshgrid/server.py, the grid's algorithms, its password-then-code sign-in, a gate for the key).
// D3: the direct way first; the helper offered when Chrome has none; the sheet with the grid's own
// prompts; the key enrolled in that session and checked by a second connection; the account recorded
// and the approval check sent only after; the Claude sign-in in the held session; nothing typed kept;
// "Forget this computer" through the gate.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, nativeHelperToTcp, openPort, send, sleep, type World } from './fakebrowser';
import { havePythonAsyncssh, startGrid, type Grid } from './sshgrid/harness';

const INSTALL = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://ondemand.grid.wayne.edu';
const PY = havePythonAsyncssh();
const PROFILE = JSON.parse(readFileSync(fileURLToPath(new URL('../public/profiles/wayne.json', import.meta.url)), 'utf8')) as Record<string, unknown>;

async function boot(world: World) {
  const terms = await import('../src/core/terms');
  const disclosure = await import('../src/core/disclosure');
  const audit = await import('../src/core/audit');
  audit.FLOORS_MS.scheduler = 1_500;
  audit.FLOORS_MS.status = 1_500;
  audit.FLOORS_MS.shell = 300;
  const now = new Date().toISOString();
  Object.assign(world.storage.local, {
    'bridge.install_id': INSTALL,
    'bridge.terms': await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '12.0.0', host: 'Chrome 153', installId: INSTALL }),
    'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
    'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
    'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
  });
  // no VPN on this computer: the portal does not answer
  world.opts.reach = false;
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
}

const view = (panel: ReturnType<typeof openPort>) => panel.last()?.view as { kind: string; journey?: Record<string, unknown> & { moment: string }; home?: Record<string, unknown> } | undefined;

async function until(panel: ReturnType<typeof openPort>, cond: () => boolean, ms = 20_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out; last view ${JSON.stringify(view(panel))?.slice(0, 600)}`);
    panel.tick();
    await sleep(150);
  }
}

describe.skipIf(!PY)('the direct way, through the background', () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid();
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    // the bundled profile, with the stand-in's host key as the pin (the real one pins the grid's)
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('no helper yet: the bundled installer is offered, with GlobalProtect beside it; once it answers, the sheet', async () => {
    world.files.set('/bridge/manifest.json', JSON.stringify({ v: 1, helper: '1', files: [{ os: 'windows', file: 'beethoven-bridge-setup.cmd', bytes: 3100, kind: 'script' }] }));
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'install-helper');
    const ih = view(panel)!.journey as unknown as { download?: { url: string; label: string }; useVpn: { label: string } };
    expect(ih.download).toMatchObject({ url: 'chrome-extension://ext/bridge/beethoven-bridge-setup.cmd', label: 'Download for Windows' });
    expect(ih.useVpn.label).toBe('Use GlobalProtect instead');
    // the student runs the installer: Chrome finds the helper now
    await send(world, { type: 'action', action: { kind: 'bridge-downloaded', os: 'windows' } });
    nativeHelperToTcp(world, grid.port);
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account', 20_000);
    expect(world.log.some((l) => l.includes('runtime.connectNative com.openspineconsortium.beethoven.bridge'))).toBe(true);
    // nothing went to the portal: no VPN, and the direct way does not need it
    expect(world.log.filter((l) => /tabs\.create .*pun\/sys\/dashboard/.test(l))).toEqual([]);
  }, 60_000);

  it('the first sign-in: the grid prompts, the key enrolled, the account recorded only after, Connect signs in to Claude in the held session, nothing typed kept', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    expect(await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'st1234' } })).toMatchObject({ ok: true, value: { started: true } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    expect(view(panel)!.journey!.prompts).toEqual([{ text: 'Password: ', echo: false, kind: 'password' }]);
    // the account is nowhere yet: no record, no approval check
    expect(world.storage.local['bridge.direct']).toBeUndefined();
    expect(world.storage.local['bridge.identity']).toBeUndefined();
    const postsBefore = world.external.filter((e) => e.startsWith('POST')).length;
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
    expect(world.external.filter((e) => e.startsWith('POST')).length).toBe(postsBefore);
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
    await until(panel, () => view(panel)?.journey?.moment === 'enrolled', 30_000);
    expect(world.storage.local['bridge.direct']).toMatchObject({ account: 'st1234', enrolled_at: expect.any(String), key_fp: expect.stringMatching(/^SHA256:/) });
    expect(world.storage.local['bridge.identity']).toMatchObject({ username: 'st1234' });
    const g1 = await grid.state();
    expect(g1.keys.st1234).toHaveLength(1);
    expect(g1.state.commands).toContain('gate version');
    // the one-time card, then the statement (made already), then Connect
    await send(world, { type: 'action', action: { kind: 'grid-signin-continue' } });
    await until(panel, () => view(panel)?.journey?.moment === 'protect-key-optional');
    await send(world, { type: 'action', action: { kind: 'protect-key-later' } });
    await until(panel, () => view(panel)?.journey?.moment === 'statement');
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await until(panel, () => world.log.some((l) => /tabs\.create .*claude\.ai\/oauth/.test(l)), 30_000);
    await until(panel, () => view(panel)?.journey?.moment === 'claude');
    expect(await send(world, { type: 'action', action: { kind: 'paste-code', code: 'goodcode-abcdef' } })).toMatchObject({ ok: true });
    await until(panel, () => (world.storage.session['bridge.run'] as { job?: string } | undefined)?.job === '40509876', 30_000);
    let g2 = await grid.state();
    for (let i = 0; i < 100 && g2.state.claude !== 'yes'; i++) {
      panel.tick();
      await sleep(200);
      g2 = await grid.state();
    }
    expect(g2.state.claude).toBe('yes');
    // connect ran in the student's own signed-in session (any --login), never through the gate with a login
    expect(g2.state.commands.some((c) => c.startsWith("exec bash '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker' connect --name 'worker' --profile 'wayne'"))).toBe(true);
    expect(g2.state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([]);
    // the run is read through the gate
    await until(panel, () => (world.storage.session['bridge.run'] as { status?: { state?: string } } | undefined)?.status?.state === 'queued', 20_000);
    // nothing the student typed is anywhere
    const everything = JSON.stringify(world.storage) + world.log.join('\n');
    for (const secret of ['pw-correct', '864209', 'goodcode-abcdef']) expect(everything).not.toContain(secret);
    // 14.0.0: the debug log says what happened under the hood, and holds none of it either
    const dl = (await send(world, { type: 'action', action: { kind: 'copy-debug-log' } })) as { ok: boolean; value: { text: string } };
    expect(dl.ok).toBe(true);
    const text = dl.value.text;
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toMatch(/^Beethoven \S+ debug log · mode direct · portal ondemand\.grid\.wayne\.edu · account st1234 · worker worker · \d{4}-\d\d-\d\dT[\d:.]+Z · \d+ lines, newest last$/);
    for (const re of [
      / sw service worker started: Beethoven /,
      / mode setup \(preference direct; bridge /,
      / mode direct \(preference direct; bridge helper; key enrolled\)/,
      / bridge probe in \d+ ms: chosen helper/,
      / sheet enrol: prompt, the grid asks for password/,
      / sheet enrol: prompt, the grid asks for code/,
      / ssh open grid\.wayne\.edu:22 as st1234 through the helper bridge \(.+\) in \d+ ms/,
      / gate version: exit 0 in \d+ ms: /,
      / access signin: /,
      / press connect$/m,
      / ready connect: go \(mode direct\)/,
      / connect start \d+: login auto, worker worker, site wayne/,
      / connect start \d+: the direct way, in a sign-in sitting/,
      / sitting \d+ open: ssh in the held sign-in session, login auto/,
      / sitting \d+ auth-url: claude\.ai\/oauth\/authorize \(the link itself is not logged\)/,
      / sitting \d+ pasted code typed \(the code itself is never logged\)/,
      / sitting \d+ step queued: job 40509876 \(new\)/,
      / read direct: status\.json: job 40509876, state queued, updated_at .* -> phase queued/,
      / gate read worker status\.json: exit 0 in \d+ ms/,
      / panel journey /,
    ])
      expect(text, String(re)).toMatch(re);
    for (const secret of ['pw-correct', '864209', 'goodcode-abcdef', 'client_id', 'code=true']) expect(text, secret).not.toContain(secret);
    // Details for your lab lead has the last 200 lines under their heading
    const details = openPort(world, 'details');
    await until(details, () => !!(details.last()?.view as { debugLog?: unknown } | undefined)?.debugLog);
    const dv = details.last()!.view as unknown as { debugLog: { title: string; lines: string[]; copy: { action: { kind: string } } } };
    expect(dv.debugLog.title).toBe('Debug log');
    expect(dv.debugLog.copy.action).toEqual({ kind: 'copy-debug-log' });
    expect(dv.debugLog.lines.length).toBeGreaterThan(10);
    expect(dv.debugLog.lines.length).toBeLessThanOrEqual(200);
    expect(dv.debugLog.lines.join('\n')).not.toContain('pw-correct');
    // the Grid row says how the grid is reached
    await send(world, { type: 'action', action: { kind: 'tour', event: 'skip' } });
  }, 120_000);

  it('Forget this computer: the line through the gate, then the key here', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'ab1234' } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
    await until(panel, () => view(panel)?.journey?.moment === 'enrolled', 30_000);
    expect((await grid.state()).keys.ab1234).toHaveLength(1);
    const r = await send(world, { type: 'action', action: { kind: 'forget-computer' } });
    expect(r).toMatchObject({ ok: true, value: { forgotten: true, onGrid: 'forgotten' } });
    expect((await grid.state()).keys.ab1234).toEqual([]);
    expect((world.storage.local['bridge.direct'] as { enrolled_at?: string }).enrolled_at).toBeUndefined();
  }, 90_000);

  it("the grid's \"wrong code, or no 2FA\" refusal: the sheet asks which; \"I don't have a grid code yet\": the route choice, then the phone route with its square codes", async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'nocode' } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    // never taken for "no code" by itself: the code may have been mistyped (2FA Setup would replace a working code)
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'code-refused');
    expect(view(panel)!.journey).toMatchObject({ problem: { button: { action: { kind: 'grid-signin-retry' } } }, secondary: { action: { kind: 'no-grid-code' } } });
    // the refusal is counted for the account, in storage.session (never an answer)
    expect(JSON.stringify(world.storage.session['bridge.refusals'])).toMatch(/"nocode":\{"count":1/);
    expect(JSON.stringify(world.storage.session)).not.toContain('pw-correct');
    await send(world, { type: 'action', action: { kind: 'no-grid-code' } });
    await until(panel, () => view(panel)?.journey?.moment === 'choose-route');
    await send(world, { type: 'action', action: { kind: 'choose-route', route: 'phone' } });
    await until(panel, () => view(panel)?.journey?.moment === 'code-setup');
    const cs = view(panel)!.journey as unknown as { qr: Array<{ url: string }> };
    expect(cs.qr.map((q) => q.url)).toContain('https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid');
    // nothing was recorded for an account the grid did not accept
    expect(world.storage.local['bridge.direct']).toBeUndefined();
  }, 60_000);
});

describe.skipIf(!PY)('the direct way, through the background, when Claude Code is signed in on the grid already', () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid({ claude: 'yes' });
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });

  it('Connect goes through the gate with the key (always --login never), and the run is read through it', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'st1234' } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
    await until(panel, () => view(panel)?.journey?.moment === 'enrolled', 30_000);
    await send(world, { type: 'action', action: { kind: 'grid-signin-continue' } });
    await send(world, { type: 'action', action: { kind: 'protect-key-later' } });
    await until(panel, () => view(panel)?.journey?.moment === 'statement');
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await until(panel, () => (world.storage.session['bridge.run'] as { job?: string } | undefined)?.job === '40501234', 30_000);
    const g = await grid.state();
    expect(g.state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([`gate connect worker wayne ${INSTALL} default chain`]);
    expect(g.state.commands.some((c) => c.includes(' connect --name '))).toBe(false);
    // no Anthropic tab: the grid is signed in to Claude already
    expect(world.log.some((l) => /claude\.ai\/oauth/.test(l))).toBe(false);
    await until(panel, () => (world.storage.session['bridge.run'] as { status?: { state?: string } } | undefined)?.status?.state === 'queued', 20_000);
    expect((await grid.state()).state.commands).toContain('gate read worker status.json');
  }, 120_000);
});

describe.skipIf(!PY)("the direct way, through the background: GlobalProtect chosen and given up, a cap at Connect, ~/.bashrc noise", () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid({ claude: 'yes', gate_limit: 'names', bashrc: 'Welcome to warrior (module system loaded)\n' });
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });

  it('"Use GlobalProtect instead" shows the fallback once; Settings\' "Direct when possible" brings the direct way back', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    await send(world, { type: 'action', action: { kind: 'use-vpn' } });
    await until(panel, () => view(panel)?.journey?.moment === 'fallback-to-vpn');
    expect((world.storage.local['bridge.direct'] as { vpn_chosen_at?: string }).vpn_chosen_at).toBeTruthy();
    // Settings: "Direct when possible" undoes the choice (it used to stick for good)
    await send(world, { type: 'action', action: { kind: 'set-connection', connection: 'direct' } });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet');
    expect((world.storage.local['bridge.direct'] as { vpn_chosen_at?: string } | undefined)?.vpn_chosen_at).toBeUndefined();
  }, 60_000);

  it("a Connect through the gate that meets its names cap says so in its own words; version still reads after the account's ~/.bashrc line", async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'st1234' } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
    // the gate's version line comes after the ~/.bashrc line: the key is still verified and enrolled
    await until(panel, () => view(panel)?.journey?.moment === 'enrolled', 30_000);
    await send(world, { type: 'action', action: { kind: 'grid-signin-continue' } });
    await send(world, { type: 'action', action: { kind: 'protect-key-later' } });
    await until(panel, () => view(panel)?.journey?.moment === 'statement');
    await send(world, { type: 'action', action: { kind: 'connect' } });
    const { WORDS } = await import('../src/core/model');
    await until(panel, () => JSON.stringify(view(panel) ?? {}).includes(WORDS.direct.gate.names), 30_000);
  }, 120_000);
});

// 2026-10-02 evening (docs/V12_STATUS.md, "the direct-way hang"): a fresh copy signs in on the direct way
// for an account whose worker folder already holds a run that has ended without its file saying so (the job
// killed; status.json left "online" or "running", its heartbeat hours old). Claude Code is signed in on the
// grid. The panel stayed on "Starting · Connecting to Claude…" with no button, and nothing was ever sent:
// the gate's read carries no modified time, the background stamped the moment of the read in its place, so
// the heartbeat never aged (R12 never fired), and the first run's moment trusted the run's phase anyway.
async function firstSignIn(world: World, panel: ReturnType<typeof openPort>): Promise<void> {
  await send(world, { type: 'panel.opened', windowId: 1 });
  await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
  await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'st1234' } });
  await until(panel, () => view(panel)?.journey?.phase === 'prompt');
  await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
  await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
  await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
  await until(panel, () => view(panel)?.journey?.moment === 'enrolled', 30_000);
  await send(world, { type: 'action', action: { kind: 'grid-signin-continue' } });
  await send(world, { type: 'action', action: { kind: 'protect-key-later' } });
}
const runRecord = (world: World) =>
  world.storage.session['bridge.run'] as { job?: string; started_by?: string; status?: { state?: string; stop_reason?: string; next_job?: string }; listed_at?: string; alive_seen?: boolean } | undefined;
const offersConnect = (panel: ReturnType<typeof openPort>) => /"kind":"connect"/.test(JSON.stringify(view(panel) ?? {}));

for (const dead of [
  { name: '"online" with no link', cfg: { run_state: 'online' } },
  { name: '"online" with its link', cfg: { run_state: 'online', run_link: true } },
  { name: '"running"', cfg: { run_state: 'running' } },
]) {
  describe.skipIf(!PY)(`the direct way, a fresh copy, a run already in the worker folder that ended with its status.json left ${dead.name} (heartbeat two hours old)`, () => {
    let grid: Grid;
    let world: World;
    beforeAll(async () => {
      grid = await startGrid({ claude: 'yes', job: '40400001', run_age_s: 7200, ...dead.cfg });
    }, 60_000);
    afterAll(() => grid?.stop());
    beforeEach(() => {
      vi.resetModules();
      world = install();
      world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
    });
    afterEach(() => {
      for (const s of [...world.sockets]) s.close(1000);
    });

    it('after the sign-in the panel offers Connect, never "Connecting to Claude…" for the dead run, and Connect goes through the gate', async () => {
      nativeHelperToTcp(world, grid.port);
      await boot(world);
      const panel = openPort(world, 'panel');
      await firstSignIn(world, panel);
      // the background finds the old run through the gate and reads its file
      await until(panel, () => runRecord(world)?.job === '40400001' && runRecord(world)?.status?.state === dead.cfg.run_state, 30_000);
      const seen: string[] = [];
      await until(
        panel,
        () => {
          const j = view(panel)?.journey;
          const b = j ? `${j.moment}${j.sub ? ` ${JSON.stringify(j.sub)}` : ''}` : String(view(panel)?.kind);
          if (seen[seen.length - 1] !== b) seen.push(b);
          return offersConnect(panel);
        },
        30_000,
      );
      // a dead run is never shown as one coming up, nor as online
      expect(view(panel)?.journey?.moment).not.toBe('starting');
      expect(view(panel)?.journey?.moment).not.toBe('online');
      expect((world.storage.local['bridge.once'] as { first_online_at?: string } | undefined)?.first_online_at).toBeUndefined();
      await send(world, { type: 'action', action: { kind: 'connect' } });
      await until(panel, () => runRecord(world)?.job === '40501234', 30_000);
      const g = await grid.state();
      expect(g.state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([`gate connect worker wayne ${INSTALL} default chain`]);
      expect(seen.some((s) => s.startsWith('starting'))).toBe(false);
    }, 120_000);
  });
}

describe.skipIf(!PY)('the direct way, a fresh copy, a worker in the folder that is alive (its heartbeat moves every 30 s)', () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid({ claude: 'yes', job: '40400001', run_state: 'running', run_age_s: 0, run_live: true });
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('is shown coming up ("Starting"), with no Connect, and nothing is started', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await firstSignIn(world, panel);
    await until(panel, () => runRecord(world)?.status?.state === 'running' && view(panel)?.journey?.moment === 'starting', 30_000);
    for (let i = 0; i < 20; i++) {
      panel.tick();
      await sleep(150);
    }
    expect(view(panel)?.journey?.moment).toBe('starting');
    expect(offersConnect(panel)).toBe(false);
    expect((await grid.state()).state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([]);
  }, 120_000);
});

// 14.0.0 (framework 14): a worker that resumed an earlier session prints that session's own link, and framework 14
// writes it as session_url with environment_url "". 13.0.0 knew only the environment link: on 2026-10-03 it showed
// "Starting · Connecting to Claude…" for go2432's worker (job 40554211), online all along.
describe.skipIf(!PY)("framework 14, the direct way: a live worker online on a resumed session's own link", () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid({ claude: 'yes', job: '40554211', run_state: 'online', run_age_s: 0, run_live: true, run_link: 'session' });
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('is online, with Open my session opening the session link; never "Connecting to Claude…", no Connect, nothing started', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await firstSignIn(world, panel);
    await until(panel, () => runRecord(world)?.job === '40554211' && runRecord(world)?.status?.state === 'online', 30_000);
    const seen: string[] = [];
    const online = () => {
      const v = view(panel);
      const j = v?.journey;
      const h = v?.home as { hero?: { state?: string } } | undefined;
      const b = j ? `${j.moment}${j.sub ? ` ${JSON.stringify(j.sub)}` : ''}` : `home ${h?.hero?.state ?? ''}`;
      if (seen[seen.length - 1] !== b) seen.push(b);
      return j?.moment === 'online' || h?.hero?.state === 'online' || h?.hero?.state === 'online-new';
    };
    await until(panel, online, 30_000);
    expect(/"kind":"open-session"/.test(JSON.stringify(view(panel)))).toBe(true);
    expect(offersConnect(panel)).toBe(false);
    expect(seen.filter((x) => /Connecting to Claude/.test(x))).toEqual([]);
    expect(await send(world, { type: 'action', action: { kind: 'open-session' } })).toMatchObject({ ok: true, value: { opened: true } });
    expect(world.log.some((l) => /tabs\.create #\d+ https:\/\/claude\.ai\/code\/session_01TestResumedSession000000 /.test(l))).toBe(true);
    expect((await grid.state()).state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([]);
    // the debug log says what it read and what the panel made of it
    const dl = (await send(world, { type: 'action', action: { kind: 'copy-debug-log' } })) as { ok: boolean; value: { text: string } };
    expect(dl.value.text).toMatch(/ read direct: status\.json: job 40554211, state online, updated_at .* -> phase online, stale no, alive_seen (yes|no), link present \(session link\)/);
    expect(dl.value.text).toMatch(/ open session tab: opened \(link present \(session link\)\)/);
  }, 120_000);
});

// 13.0.0 (the review, m5): a live worker whose grid clock lags this computer's by five minutes. Its file's own
// updated_at is five minutes old at every read, and the worker writes it once a heartbeat (HEARTBEAT_S, 30 s), so
// every read before its next heartbeat sees the same file and cannot tell it from a dead one: the stale view
// (Connect) may last up to one heartbeat, and the first read after it, which sees the file changed, shows the
// worker coming up. The stand-in heartbeats every BEAT_S seconds here, to keep the case short.
const BEAT_S = 6;
describe.skipIf(!PY)("the direct way, a fresh copy, a live worker whose heartbeat reads five minutes old (the grid's clock behind this one)", () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid({ claude: 'yes', job: '40400001', run_state: 'running', run_age_s: 300, run_live: true, run_beat_s: BEAT_S });
  }, 60_000);
  afterAll(() => grid?.stop());
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('the stale view lasts at most one heartbeat; then "Starting", which stays, and nothing is started', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world);
    const panel = openPort(world, 'panel');
    await firstSignIn(world, panel);
    // each read of the run's files stamps the record's listed_at: the reads are counted from it, and a read made
    // before the file was seen to change (alive_seen not yet set) is one that showed the stale view
    const reads = new Set<string>();
    const staleReads = new Set<string>();
    let startingAt: number | undefined;
    await until(
      panel,
      () => {
        const r = runRecord(world);
        if (r?.job === '40400001' && r.status?.state === 'running' && r.listed_at) {
          reads.add(r.listed_at);
          if (!r.alive_seen) staleReads.add(r.listed_at);
        }
        if (view(panel)?.journey?.moment === 'starting' && reads.size > 0) startingAt = reads.size;
        return startingAt !== undefined;
      },
      40_000,
    );
    expect(runRecord(world)?.alive_seen).toBe(true);
    // the reads that showed the stale view all fall within one heartbeat of the first (a read's stamp is taken when
    // its answer is in, so 1.5 s for the reads' own time); the read after the heartbeat showed "Starting"
    const stale = [...staleReads].map((s) => Date.parse(s));
    expect(stale.length).toBeGreaterThan(0);
    expect(Math.max(...stale) - Math.min(...stale)).toBeLessThanOrEqual(BEAT_S * 1000 + 1500);
    expect(reads.size).toBeGreaterThan(staleReads.size);
    // and it stays so across later reads: the stale view never comes back
    const until8 = Date.now() + 8_000;
    while (Date.now() < until8) {
      panel.tick();
      await sleep(150);
      const r = runRecord(world);
      if (r?.listed_at) reads.add(r.listed_at);
      expect(view(panel)?.journey?.moment).toBe('starting');
      expect(offersConnect(panel)).toBe(false);
    }
    expect(reads.size).toBeGreaterThan(startingAt!);
    expect((await grid.state()).state.commands.filter((c) => c.startsWith('gate connect'))).toEqual([]);
  }, 120_000);
});

// Framework 13 (bin/hpcworker successor_refresh): a job that ended naming a successor the scheduler no longer has
// (2026-10-02: go2432's successor cancelled at 20:42:10, the job at 20:42:16; status.json left "preempted",
// next_job 40551869) is reported by the gate's status as "stopped", stop_reason successor_gone. The panel then
// offers Connect: at once for a fresh copy that finds it, and within the minute for a browser already showing
// the run as renewing (13.0.0 asks `worker status` while renewing, as while in line).
for (const c of [
  { name: 'found that way by a fresh copy', after: 0 },
  { name: 'found renewing, its successor cancelled afterwards', after: 1 },
]) {
  describe.skipIf(!PY)(`framework 13, the direct way: a worker whose next job in the chain is gone, ${c.name}`, () => {
    let grid: Grid;
    let world: World;
    beforeAll(async () => {
      grid = await startGrid({ claude: 'yes', job: '40400001', run_state: 'preempted', run_next: '40551869', run_successor: 'gone', gone_after_status: c.after, run_age_s: 3600 });
    }, 60_000);
    afterAll(() => grid?.stop());
    beforeEach(() => {
      vi.resetModules();
      world = install();
      world.files.set('/profiles/wayne.json', JSON.stringify({ ...PROFILE, ssh_host: 'grid.wayne.edu', ssh_port: 22, ssh_host_key: grid.fp, ssh_relay: null }));
    });
    afterEach(() => {
      for (const s of [...world.sockets]) s.close(1000);
    });

    it('the panel shows it stopped and offers Connect, and Connect goes through the gate', async () => {
      nativeHelperToTcp(world, grid.port);
      await boot(world);
      const panel = openPort(world, 'panel');
      await firstSignIn(world, panel);
      const seen: string[] = [];
      const note = () => {
        const j = view(panel)?.journey;
        const b = j ? `${j.moment}${j.sub ? ` ${JSON.stringify(j.sub)}` : ''}` : String(view(panel)?.kind);
        if (seen[seen.length - 1] !== b) seen.push(b);
      };
      if (c.after > 0) {
        // the successor still in line when the run is found: renewing ("Starting", reconnecting), no Connect
        await until(panel, () => (note(), runRecord(world)?.status?.state === 'preempted' && view(panel)?.journey?.moment === 'starting'), 30_000);
        expect(offersConnect(panel)).toBe(false);
      }
      await until(panel, () => (note(), runRecord(world)?.status?.state === 'stopped' && offersConnect(panel)), 30_000);
      expect(runRecord(world)?.status).toMatchObject({ state: 'stopped', stop_reason: 'successor_gone', next_job: '' });
      expect(view(panel)?.journey?.moment).toBe('statement');
      if (c.after === 0) expect(seen.some((s) => s.startsWith('starting'))).toBe(false);
      const statusCalls = (await grid.state()).state.commands.filter((x) => x === 'gate status worker').length;
      expect(statusCalls).toBe(c.after + 1);
      await send(world, { type: 'action', action: { kind: 'connect' } });
      await until(panel, () => runRecord(world)?.job === '40501234', 30_000);
      const g = await grid.state();
      expect(g.state.commands.filter((x) => x.startsWith('gate connect'))).toEqual([`gate connect worker wayne ${INSTALL} default chain`]);
    }, 120_000);
  });
}
