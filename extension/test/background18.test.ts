// 18.0.0's fixes from greg's own sitting (2026-10-09), through the real background against the fake Chrome:
// the grid's sign-in comes to the front with its window whichever tab carries it (a welcome tab navigated
// while another tab was up held Chrome's box out of sight until the student clicked over to it), and a press
// made while the grid is already known to be out of reach waits on GlobalProtect at once, without the
// dashboard's own 5 s of nothing first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXT, install, openPort, ORIGIN, send, sleep, type World } from './fakebrowser';

const INSTALL = '0123456789abcdef0123456789abcdef';

async function termsRecord() {
  const terms = await import('../src/core/terms');
  return terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '18.0.0', host: 'Chrome 156', installId: INSTALL });
}

async function boot(world: World, o: { ready: boolean }) {
  const disclosure = await import('../src/core/disclosure');
  const audit = await import('../src/core/audit');
  audit.FLOORS_MS.scheduler = 1_500;
  audit.FLOORS_MS.shell = 300;
  const now = new Date().toISOString();
  world.storage.local['bridge.install_id'] = INSTALL;
  if (o.ready) {
    Object.assign(world.storage.local, {
      'bridge.terms': await termsRecord(),
      'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
      'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
      'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
      'bridge.channel': { origin: ORIGIN, mode: 'direct', shell: 'ok', tested_at: now },
      'bridge.once': { first_online_at: now },
    });
  }
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
}

let world: World;
beforeEach(() => {
  vi.resetModules();
  world = install();
});
afterEach(() => {
  for (const s of [...world.sockets]) s.close(1000);
});

describe('18.0.0: the grid sign-in in front', () => {
  // 19.0.0: the sign-in tab is the path of a browser without webRequest (the Firefox build), and of "Use Chrome's
  // sign-in box instead"; where the browser can answer the grid's sign-in, the panel's sheet comes first (background19)
  beforeEach(() => {
    world = install({ webRequest: false });
  });
  it('the welcome tab becomes the sign-in in front, with its window, when the student had another tab up', async () => {
    await boot(world, { ready: false });
    world.opts.reach = false;
    world.opts.signedIn = false;
    const welcome = world.openTab(`${EXT}/options.html`, 1, true);
    openPort(world, 'welcome', { tabId: welcome.id });
    await world.chrome.storage.local.set({ 'bridge.terms': await termsRecord() });
    const panel = openPort(world, 'panel');
    await send(world, { type: 'action', action: { kind: 'agree', origin: ORIGIN, granted: true, panelOpened: true, tabId: welcome.id, windowId: 1 } });
    const ticker = setInterval(() => panel.tick(), 1_000);
    await sleep(1_500);
    expect(panel.last()?.view?.journey?.moment).toBe('globalprotect');
    // the student opens the university's GlobalProtect page from the panel: a new tab, in front
    const help = world.openTab('https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314', 1, true);
    world.tabs.get(welcome.id)!.active = false;
    world.opts.reach = true;
    await sleep(5_000);
    clearInterval(ticker);
    // the welcome page's own tab carries the sign-in, brought to the front, and its window too
    expect(world.log.some((l) => l.includes(`tabs.update #${welcome.id} url`) && l.includes('/pun/sys/dashboard'))).toBe(true);
    expect(world.tabs.get(welcome.id)?.active).toBe(true);
    expect(world.tabs.get(help.id)?.active).toBe(false);
    expect(world.log.some((l) => l.endsWith('windows.update #1 focused'))).toBe(true);
    expect(panel.last()?.view?.journey?.moment).toBe('grid');
  }, 30_000);

  it('a press that opens a sign-in tab of its own brings its window to the front', async () => {
    await boot(world, { ready: true });
    world.opts.signedIn = false;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(800);
    const opened = world.log.find((l) => /tabs\.create .*\/pun\/sys\/dashboard/.test(l));
    expect(opened).toBeDefined();
    expect(world.log.some((l) => l.endsWith('windows.update #1 focused'))).toBe(true);
    expect(panel.last()?.view?.journey?.moment).toBe('grid');
  }, 20_000);
});

describe('18.0.0: the GlobalProtect wait', () => {
  it('a press made while the grid is known to be out of reach waits on GlobalProtect at once, without asking the dashboard first', async () => {
    await boot(world, { ready: true });
    world.opts.reach = false;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    // the panel's tick finds no route: the GlobalProtect check has run
    for (let i = 0; i < 3; i++) {
      panel.tick();
      await sleep(400);
    }
    const before = ((await send(world, { type: 'action', action: { kind: 'copy-debug-log' } })) as { value: { text: string } }).value.text;
    const asked = (t: string) => t.split('\n').filter((l) => /portal \(press\)/.test(l)).length;
    const t0 = Date.now();
    const r = (await send(world, { type: 'action', action: { kind: 'connect' } })) as { ok: boolean; value: { started: boolean; kept?: boolean; waiting?: string } };
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(r.value).toMatchObject({ started: false, kept: true, waiting: 'grid' });
    const after = ((await send(world, { type: 'action', action: { kind: 'copy-debug-log' } })) as { value: { text: string } }).value.text;
    expect(asked(after)).toBe(asked(before));
    await sleep(300);
    panel.tick();
    await sleep(300);
    expect(panel.last()?.view?.journey?.moment).toBe('globalprotect');
    // and it goes ahead by itself once the grid answers
    world.opts.reach = true;
    for (let i = 0; i < 8; i++) {
      panel.tick();
      await sleep(500);
    }
    expect(panel.last()?.view?.journey?.moment).not.toBe('globalprotect');
  }, 30_000);
});

describe('18.0.0: Chrome keeps its offer to save the grid password', () => {
  // 19.0.0: the sign-in tab is the path of a browser without webRequest (the Firefox build), and of "Use Chrome's
  // sign-in box instead"; where the browser can answer the grid's sign-in, the panel's sheet comes first (background19)
  beforeEach(() => {
    world = install({ webRequest: false });
  });
  async function signInThroughPress(o: { leaveInFront: boolean }) {
    await boot(world, { ready: true });
    world.opts.signedIn = false;
    const own = world.openTab('https://example.org/reading', 1, true);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(800);
    const line = world.log.find((l) => /tabs\.create #\d+ .*\/pun\/sys\/dashboard/.test(l));
    expect(line).toBeDefined();
    const signin = Number(/#(\d+)/.exec(line!)![1]);
    expect(world.tabs.get(signin)?.active).toBe(true);
    if (!o.leaveInFront) world.tabs.get(signin)!.active = false;
    // the student answers Chrome's box: the watch on the panel's tick finds the sign-in
    world.opts.signedIn = true;
    const ticker = setInterval(() => panel.tick(), 500);
    return { own, signin, panel, stop: () => clearInterval(ticker) };
  }
  const removed = (id: number) => world.log.some((l) => l.includes(`tabs.remove #${id} `));

  it('the sign-in tab in front stays for the offer, and goes when the student moves to another tab, without pulling them back', async () => {
    const { own, signin, stop } = await signInThroughPress({ leaveInFront: true });
    await sleep(5_000);
    expect(removed(signin)).toBe(false);
    // the student, done with Chrome's offer, clicks another tab
    const other = world.openTab('https://example.org/notes', 1, false);
    await world.chrome.tabs.update(other.id, { active: true });
    await sleep(500);
    stop();
    expect(removed(signin)).toBe(true);
    const at = world.log.findIndex((l) => l.includes(`tabs.remove #${signin} `));
    expect(world.log.slice(at).some((l) => l.endsWith(`tabs.update #${own.id} active`))).toBe(false);
    expect(world.tabs.get(other.id)?.active).toBe(true);
  }, 30_000);

  it('a sign-in tab the student already left closes as soon as the sign-in is seen', async () => {
    const { signin, stop } = await signInThroughPress({ leaveInFront: false });
    await sleep(4_000);
    stop();
    expect(removed(signin)).toBe(true);
  }, 30_000);
});
