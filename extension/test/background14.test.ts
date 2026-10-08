// 14.0.0's fixes from a student's sitting (hy9698, 2026-10-03) that outlive the direct way, through the
// real background: Settings' Change field refills from the bundled profile instead of coming back empty
// when no portal is stored (after Settings' Disconnect), and "Start over" returns the side panel to its
// first screen and keeps everything durable. 16.0.0: the panel's first screen out of reach of the grid is
// GlobalProtect, and the enrolment record is gone with the direct way.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { install, openPort, send, sleep, type World } from './fakebrowser';

const INSTALL = '0123456789abcdef0123456789abcdef';
const ORIGIN = 'https://ondemand.grid.wayne.edu';
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
    'bridge.terms': await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '16.0.0', host: 'Chrome 153', installId: INSTALL }),
    ...(opts.portal
      ? {
          'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
          'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
        }
      : {}),
    'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
  });
  // the grid out of reach: the journey's first screen is then GlobalProtect
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

describe('after Disconnect: no stored portal at all', () => {
  let world: World;
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify(PROFILE));
    // 17.0.0: the list the welcome page's "Your grid" reads; the press stores the deployment whose profile declares the portal
    world.files.set('/deployments.json', JSON.stringify({ sites: ['wayne'] }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it("Settings' Change field gets the bundled suggestion; the address slot stays honest", async () => {
    await boot(world, { portal: false });
    const settings = openPort(world, 'settings');
    // suggested, not address: the label keeps saying no portal is stored, Disconnect stays off
    await until(settings, () => view(settings)?.grid?.suggested === 'ondemand.grid.wayne.edu');
    expect(view(settings)?.grid?.address).toBeUndefined();
  });
});

describe('Start over', () => {
  let world: World;
  beforeEach(() => {
    vi.resetModules();
    world = install();
    world.files.set('/profiles/wayne.json', JSON.stringify(PROFILE));
    // 17.0.0: the list the welcome page's "Your grid" reads; the press stores the deployment whose profile declares the portal
    world.files.set('/deployments.json', JSON.stringify({ sites: ['wayne'] }));
  });
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('returns the panel to its first screen; the agreement, the portal and the preferences stay', async () => {
    await boot(world, { portal: true });
    world.storage.local['bridge.once'] = { first_online_at: new Date().toISOString() };
    world.storage.local['bridge.prefs'] = { worker_name: 'alpha' };
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await until(panel, () => !!view(panel)?.journey || !!(view(panel) as { home?: unknown })?.home);
    expect(await send(world, { type: 'action', action: { kind: 'start-over' } })).toMatchObject({ ok: true, value: { restarted: true } });
    // the journey's progress went
    await until(panel, () => world.storage.local['bridge.once'] === undefined);
    // everything durable stayed: the agreement, the portal, the preferences
    expect(world.storage.local['bridge.terms']).toBeDefined();
    expect(world.storage.local['bridge.portal']).toMatchObject({ site: 'wayne' });
    expect(world.storage.local['bridge.prefs']).toMatchObject({ worker_name: 'alpha' });
    // and the panel walks the journey from its start again: out of reach, that is GlobalProtect
    await until(panel, () => view(panel)?.journey?.moment === 'globalprotect');
  });
});
