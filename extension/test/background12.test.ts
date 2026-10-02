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
