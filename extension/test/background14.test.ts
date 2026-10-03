// 14.0.0's three fixes from a student's sitting (hy9698, 2026-10-03), through the real background:
// (1) the direct way with NO stored portal — after Settings' Disconnect — still enrols: the site is
// the build's own when the portal record is gone, and the sheet no longer dead-ends "no-shared";
// (2) Settings' Change field refills from the bundled profile instead of coming back empty;
// (3) "Start over" returns the side panel to its first screen and keeps everything durable.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, nativeHelperToTcp, openPort, send, sleep, type World } from './fakebrowser';
import { havePythonAsyncssh, startGrid, type Grid } from './sshgrid/harness';

const INSTALL = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://ondemand.grid.wayne.edu';
const PY = havePythonAsyncssh();
const PROFILE = JSON.parse(readFileSync(fileURLToPath(new URL('../public/profiles/wayne.json', import.meta.url)), 'utf8')) as Record<string, unknown>;

async function boot(world: World, opts: { portal: boolean }) {
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
    ...(opts.portal
      ? {
          'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
          'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
        }
      : {}),
    'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
  });
  world.opts.reach = false;
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
}

type AnyView = { kind?: string; journey?: Record<string, unknown> & { moment: string; phase?: string }; grid?: { address?: string; suggested?: string } } | undefined;
const view = (port: ReturnType<typeof openPort>) => port.last()?.view as AnyView;

async function until(port: ReturnType<typeof openPort>, cond: () => boolean, ms = 20_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out; last view ${JSON.stringify(view(port))?.slice(0, 600)}`);
    port.tick();
    await sleep(150);
  }
}

describe.skipIf(!PY)('the direct way after Disconnect: no stored portal at all', () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid();
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

  it('the sheet enrols against the build\'s own site; "no-shared" never comes (the student\'s dead end)', async () => {
    nativeHelperToTcp(world, grid.port);
    // the student's own dead end, at its seam: the sheet is already signed in when the portal
    // record goes (her Disconnect), and the setting-up step used to die "no-shared" because the
    // site lived only in that record
    await boot(world, { portal: true });
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' && view(panel)?.journey?.phase === 'account');
    expect(await send(world, { type: 'action', action: { kind: 'grid-signin-account', account: 'st1234' } })).toMatchObject({ ok: true, value: { started: true } });
    await until(panel, () => view(panel)?.journey?.phase === 'prompt');
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: 'pw-correct' } });
    await until(panel, () => (view(panel)?.journey?.prompts as Array<{ kind: string }> | undefined)?.[0]?.kind === 'code');
    // the portal record goes mid-sheet, as the student's Disconnect had taken it before her retry
    delete world.storage.local['bridge.portal'];
    delete world.storage.local['bridge.access'];
    await send(world, { type: 'action', action: { kind: 'grid-signin-answer', text: '864209' } });
    // the verdict is the enrolment itself (the panel's view falls back to the welcome moment once
    // the portal record is gone; the sheet's work goes on underneath)
    await until(panel, () => !!(world.storage.local['bridge.direct'] as { enrolled_at?: string } | undefined)?.enrolled_at, 30_000);
    expect(world.storage.local['bridge.direct']).toMatchObject({ account: 'st1234', enrolled_at: expect.any(String), key_fp: expect.stringMatching(/^SHA256:/) });
    const g = await grid.state();
    expect(g.keys.st1234).toHaveLength(1);
  });

  it("Settings' Change field gets the bundled suggestion; the address slot stays honest", async () => {
    await boot(world, { portal: false });
    const settings = openPort(world, 'settings');
    // suggested, not address: the label keeps saying no portal is stored, Disconnect stays off
    await until(settings, () => view(settings)?.grid?.suggested === 'ondemand.grid.wayne.edu');
    expect(view(settings)?.grid?.address).toBeUndefined();
  });
});

describe.skipIf(!PY)('Start over', () => {
  let grid: Grid;
  let world: World;
  beforeAll(async () => {
    grid = await startGrid();
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

  it('returns the panel to its first screen; the agreement, the portal, the key record and the preferences stay', async () => {
    nativeHelperToTcp(world, grid.port);
    await boot(world, { portal: true });
    world.storage.local['bridge.once'] = { first_online_at: new Date().toISOString() };
    // the invariants the note names, all present so their survival is really checked
    world.storage.local['bridge.direct'] = { account: 'st1234', account_recorded_at: new Date().toISOString(), enrolled_at: new Date().toISOString(), key_fp: 'SHA256:abcdefabcdef' };
    world.storage.local['bridge.prefs'] = { worker_name: 'alpha', connection: 'direct' };
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    // the student gives up on the direct way for this computer, then wants a clean start
    await until(panel, () => !!view(panel)?.journey || !!(view(panel) as { home?: unknown })?.home);
    await send(world, { type: 'action', action: { kind: 'use-vpn' } });
    await until(panel, () => !!(world.storage.local['bridge.direct'] as { vpn_chosen_at?: string } | undefined)?.vpn_chosen_at);
    expect(await send(world, { type: 'action', action: { kind: 'start-over' } })).toMatchObject({ ok: true, value: { restarted: true } });
    // the journey's progress went
    await until(panel, () => !(world.storage.local['bridge.direct'] as { vpn_chosen_at?: string } | undefined)?.vpn_chosen_at && world.storage.local['bridge.once'] === undefined);
    // everything durable stayed: the agreement, the portal, the enrolment record, the preferences
    expect(world.storage.local['bridge.terms']).toBeDefined();
    expect(world.storage.local['bridge.portal']).toMatchObject({ site: 'wayne' });
    expect(world.storage.local['bridge.direct']).toMatchObject({ account: 'st1234', enrolled_at: expect.any(String), key_fp: 'SHA256:abcdefabcdef' });
    expect(world.storage.local['bridge.prefs']).toMatchObject({ worker_name: 'alpha' });
    // and the panel walks the journey from its start again
    await until(panel, () => view(panel)?.journey?.moment === 'sign-in-sheet' || view(panel)?.journey?.moment === 'install-helper');
  });
});
