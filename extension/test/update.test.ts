// 23.0.0: Beethoven restarts into a version Chrome downloaded from the store, only while nothing a restart
// would lose is under way (core/update.ts), through the real background against the fake Chrome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMustWait, type UpdateFacts } from '../src/core/update';
import { install, openPort, sleep, type World } from './fakebrowser';

const IDLE: UpdateFacts = { pageOpen: false, pressing: false, pressKept: false, sitting: false, stopping: false, gate: false, gridSignin: false };

describe('updateMustWait', () => {
  it('restarts when nothing is under way', () => {
    expect(updateMustWait(IDLE)).toBeUndefined();
  });
  it('waits for each thing a restart would lose', () => {
    for (const k of Object.keys(IDLE) as Array<keyof UpdateFacts>) expect(updateMustWait({ ...IDLE, [k]: true }), k).toBeTruthy();
  });
});

let world: World;
beforeEach(() => {
  vi.resetModules();
  world = install();
});

async function boot() {
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
  await sleep(20);
}

const settle = () => sleep(20);

describe('the background and a downloaded version', () => {
  afterEach(() => {
    for (const s of [...world.sockets]) s.close(1000);
  });

  it('restarts at once when no page is open and nothing is under way', async () => {
    await boot();
    world.chrome.runtime.onUpdateAvailable.fire({ version: '23.0.0.200' });
    await settle();
    expect(world.reloads).toBe(1);
  });

  it('waits while a page is open, and restarts when the last one closes', async () => {
    await boot();
    const panel = openPort(world, 'panel');
    world.chrome.runtime.onUpdateAvailable.fire({ version: '23.0.0.200' });
    await settle();
    expect(world.reloads).toBe(0);
    expect(world.storage.session['bridge.updateReady']).toBe('23.0.0.200');
    panel.close();
    await settle();
    expect(world.reloads).toBe(1);
  });

  it('waits while a press is kept for the grid', async () => {
    await boot();
    world.storage.session['bridge.press'] = { kind: 'connect', at: new Date().toISOString() };
    world.chrome.runtime.onUpdateAvailable.fire({ version: '23.0.0.200' });
    await settle();
    expect(world.reloads).toBe(0);
  });

  it('asks the store once a day, and restarts on its answer', async () => {
    await boot();
    expect(await world.chrome.alarms.get('bridge.updateCheck')).toMatchObject({ periodInMinutes: 24 * 60 });
    world.updateCheck = { status: 'update_available', version: '23.0.0.201' };
    world.chrome.alarms.onAlarm.fire({ name: 'bridge.updateCheck' });
    await settle();
    expect(world.log.some((l) => l.endsWith('runtime.requestUpdateCheck'))).toBe(true);
    expect(world.reloads).toBe(1);
  });

  it('does nothing when the store has no newer version', async () => {
    await boot();
    world.chrome.alarms.onAlarm.fire({ name: 'bridge.updateCheck' });
    await settle();
    expect(world.reloads).toBe(0);
  });
});
