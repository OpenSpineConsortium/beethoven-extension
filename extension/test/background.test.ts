// The background itself (src/entrypoints/background.ts), run whole under Node against a fake Chrome
// and a fake portal (test/fakebrowser.ts): the defects the 11.0.0 review found by running it, each
// checked here so they cannot come back. One Connect press types one connect line even when the panel's
// tick carries the same press meanwhile; a welcome tab the student has used for something else is never
// taken over; the run record keeps what only the Connect knows, so "You're online." and claude.ai's tab
// come once; the background's own scheduler question never takes a Stop's turn; the grant taken away
// reads as itself, not as a VPN problem; nothing reaches the network before the agreement; and a sign-in
// the background lost says so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXT, install, openPort, ORIGIN, send, sleep, STATE, type World } from './fakebrowser';

const INSTALL = '0123456789abcdef0123456789abcdef';
const LINK = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';

async function boot(world: World, o: { terms?: boolean; ready?: boolean; firstRun?: boolean } = {}) {
  const terms = await import('../src/core/terms');
  const disclosure = await import('../src/core/disclosure');
  const audit = await import('../src/core/audit');
  // the scheduler's floor shortened for the test (it is the same module instance the background uses)
  audit.FLOORS_MS.scheduler = 1_500;
  audit.FLOORS_MS.shell = 300;
  const now = new Date().toISOString();
  world.storage.local['bridge.install_id'] = INSTALL;
  if (o.terms !== false) {
    world.storage.local['bridge.terms'] = await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '11.0.0', host: 'Chrome 153', installId: INSTALL });
  }
  if (o.ready !== false) {
    Object.assign(world.storage.local, {
      'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
      'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
      'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
      'bridge.channel': { origin: ORIGIN, mode: 'direct', shell: 'ok', tested_at: now },
      ...(o.firstRun ? {} : { 'bridge.once': { first_online_at: now } }),
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

describe('the background, run whole', () => {
  it('one Connect press types one connect line, even when the tick carries the same press meanwhile', async () => {
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(1_500);
    world.opts.dashboardDelayMs = 400;
    world.opts.shellPageDelayMs = 800;
    const pressed = send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(150);
    panel.tick();
    await pressed;
    const ticker = setInterval(() => panel.tick(), 500);
    await sleep(6_000);
    clearInterval(ticker);
    expect(world.connectLines).toHaveLength(1);
    expect(world.log.filter((l) => /tabs\.create .*claude\.ai\/oauth/.test(l))).toHaveLength(1);
  }, 30_000);

  it('the run record keeps the Connect (pressed), so "You\'re online." and claude.ai\'s tab come once', async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const run = world.storage.session['bridge.run'] as { pressed?: boolean; started_by?: string; job?: string };
    expect(run).toMatchObject({ job: '40501234', pressed: true, started_by: 'connect' });
    // the worker comes online: the files say so
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: new Date().toISOString(), online_at: new Date().toISOString(), updated_at: new Date().toISOString(), environment_url: LINK }));
    await sleep(8_000);
    clearInterval(ticker);
    const opened = world.log.filter((l) => l.includes(`tabs.create`) && l.includes('claude.ai/code?environment'));
    if (opened.length !== 1) console.log(JSON.stringify(world.storage.session['bridge.run'], null, 1), world.log.slice(-40).join('\n'));
    expect(opened).toHaveLength(1);
    expect(world.storage.local['bridge.once']).toMatchObject({ first_online_at: expect.any(String) });
  }, 40_000);

  it("the scheduler's reason is never asked while a Stop waits: the Stop goes first", async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const before = world.shellLines.length;
    const stopping = send(world, { type: 'action', action: { kind: 'stop' } });
    const ticker = setInterval(() => panel.tick(), 200);
    await stopping;
    clearInterval(ticker);
    const after = world.shellLines.slice(before).map((l) => l.line);
    const stopAt = after.findIndex((l) => /worker stop/.test(l));
    expect(stopAt).toBeGreaterThanOrEqual(0);
    expect(after.slice(0, stopAt).some((l) => /worker status/.test(l))).toBe(false);
  }, 30_000);

  it('a welcome tab the student has since used for something else is never navigated or closed', async () => {
    await boot(world, { terms: false, ready: false, firstRun: true });
    world.opts.reach = false;
    world.opts.signedIn = false;
    const welcome = world.openTab(`${EXT}/options.html`, 1, true);
    const page = openPort(world, 'welcome', { tabId: welcome.id });
    const terms = await import('../src/core/terms');
    await world.chrome.storage.local.set({ 'bridge.terms': await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '11.0.0', host: 'Chrome 153', installId: INSTALL }) });
    const panel = openPort(world, 'panel');
    await send(world, { type: 'action', action: { kind: 'agree', origin: ORIGIN, granted: true, panelOpened: true, tabId: welcome.id, windowId: 1 } });
    const ticker = setInterval(() => panel.tick(), 1_000);
    await sleep(1_500);
    // the student uses the welcome tab to look GlobalProtect up: the welcome page is gone from it
    world.navigate(welcome.id, 'https://www.google.com/search?q=wayne+globalprotect');
    page.close();
    world.opts.reach = true;
    await sleep(5_000);
    clearInterval(ticker);
    expect(world.tabs.get(welcome.id)?.url).toBe('https://www.google.com/search?q=wayne+globalprotect');
    expect(world.log.some((l) => l.includes(`tabs.update #${welcome.id} url`) && l.includes('google'))).toBe(false);
    // the sign-in opened in a tab of its own
    expect(world.log.some((l) => /tabs\.create .*pun\/sys\/dashboard/.test(l))).toBe(true);
  }, 30_000);

  it('the grant taken away after the first run reads as itself, with "Allow again", not as a VPN problem', async () => {
    await boot(world);
    world.granted.clear();
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(2_000);
    const v = panel.last();
    expect(v?.view?.kind).toBe('journey');
    expect(v?.view?.journey).toMatchObject({ moment: 'welcome', state: 'revoked', button: { label: 'Allow again' } });
  }, 20_000);

  it('before the agreement, no action reaches the network or opens a tab', async () => {
    await boot(world, { terms: false, ready: false, firstRun: true });
    world.storage.local['bridge.portal'] = { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: new Date().toISOString(), shell_host: 'default', site: 'wayne' };
    openPort(world, 'panel');
    for (const a of [{ kind: 'sign-in-grid', windowId: 1 }, { kind: 'retry-grid' }, { kind: 'connect' }, { kind: 'stop' }, { kind: 'open-files' }, { kind: 'run-checks' }, { kind: 'check-compute-node' }, { kind: 'restrict', workerName: 'worker' }]) {
      await send(world, { type: 'action', action: a });
    }
    await sleep(1_000);
    expect(world.log.filter((l) => /fetch|ws open|tabs\.create|tabs\.update|EXTERNAL/.test(l))).toEqual([]);
  }, 20_000);

  it('a sign-in the background lost (stopped mid-sitting) says so, with Sign in again', async () => {
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await send(world, { type: 'action', action: { kind: 'connect' } });
    for (let i = 0; i < 4; i++) {
      await sleep(700);
      panel.tick();
    }
    expect(panel.last()?.view?.journey?.moment).toBe('claude');
    // the service worker stops: its listeners and memory go, its sockets close
    for (const k of ['onMessage', 'onConnect', 'onInstalled', 'onStartup']) world.chrome.runtime[k].ls.length = 0;
    for (const e of [world.chrome.storage.onChanged, world.chrome.alarms.onAlarm, world.chrome.tabs.onUpdated, world.chrome.tabs.onRemoved]) e.ls.length = 0;
    for (const s of [...world.sockets]) s.close(1006);
    vi.resetModules();
    const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
    bg.main();
    const again = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    for (let i = 0; i < 3; i++) {
      await sleep(600);
      again.tick();
    }
    expect(again.last()?.view?.journey).toMatchObject({ moment: 'claude', problem: { body: 'The sign-in stopped before it finished.', button: { label: 'Sign in again' } } });
  }, 30_000);
});
