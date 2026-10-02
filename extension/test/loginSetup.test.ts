// AM2's one-time key step (UNPROVEN ON THE GRID), with its browser and clock faked: nothing is typed
// before the student's "I'm in" or the title's sign; then the one line, the re-test every 2 s, the
// fallback to "Paste, then press Enter." after 10 s of failures, the terminal tab closed on success
// (and only then), "Not done yet." when the student closed it first, and the waiting press carried on.
import { describe, expect, it } from 'vitest';
import { GIVE_UP_MS, LoginSetupFlow, PASTE_AFTER_MS, PASTE_RETEST_MS, RETEST_MS, type LoginSetupDeps, type LoginSetupPhase } from '../src/core/loginSetup';
import type { TerminalTyped } from '../src/core/messages';
import type { ShellTestResult } from '../src/core/shell';

const LINE = 'bash /rs/rs_grp_oschome/shared/beethoven/hpcworker/current/bin/hpcworker login-setup';

function harness(o: { typed?: TerminalTyped; tests?: Array<ShellTestResult | 'error'>; open?: boolean } = {}) {
  let now = 0;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let seq = 0;
  const log: string[] = [];
  const phases: LoginSetupPhase[] = [];
  const tests = [...(o.tests ?? [])];
  let tabOpen = false;
  let done = 0;
  const deps: LoginSetupDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    openTerminal: async () => {
      log.push('open');
      tabOpen = o.open ?? true;
      return tabOpen;
    },
    type: async (line) => {
      log.push(`type ${line}`);
      return o.typed ?? { typed: true, how: 'xterm' };
    },
    test: async () => {
      log.push('test');
      return tests.length ? tests.shift()! : 'password';
    },
    terminalOpen: async () => tabOpen,
    closeTerminal: async () => {
      log.push('close');
      tabOpen = false;
    },
    changed: (p) => void phases.push(p),
    done: () => void done++,
  };
  const flow = new LoginSetupFlow(LINE, deps);
  /** run the clock forward, firing timers in order and letting their promises settle */
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift();
      now = t.at;
      t.fn();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    now = end;
  };
  return { flow, log, phases, advance, closeTab: () => (tabOpen = false), done: () => done, tests };
}

describe('the one-time key step', () => {
  it('offers the terminal, opens it, and types nothing until the student says they are in', async () => {
    const h = harness();
    expect(h.flow.phase).toBe('offer');
    expect(await h.flow.open()).toBe(true);
    expect(h.flow.phase).toBe('password');
    await h.advance(60_000);
    // a minute at the password prompt: nothing typed, nothing tested
    expect(h.log).toEqual(['open']);
    const r = await h.flow.imIn();
    expect(r).toEqual({ typed: true, how: 'xterm' });
    expect(h.log).toEqual(['open', `type ${LINE}`]);
    expect(h.flow.phase).toBe('checking');
  });

  it('re-tests every 2 s; on success it closes the tab it opened, says done, and the waiting press carries on', async () => {
    const h = harness({ tests: ['password', 'password', 'ok'] });
    await h.flow.open();
    await h.flow.imIn();
    await h.advance(RETEST_MS);
    await h.advance(RETEST_MS);
    expect(h.flow.phase).toBe('checking');
    expect(h.done()).toBe(0);
    await h.advance(RETEST_MS);
    expect(h.log.filter((l) => l === 'test')).toHaveLength(3);
    expect(h.log[h.log.length - 1]).toBe('close');
    expect(h.flow.phase).toBe('done');
    expect(h.done()).toBe(1);
    expect(h.phases).toEqual(['password', 'checking', 'done']);
  });

  it('after 10 s of failures: "Paste, then press Enter." and it keeps testing, less often, then gives up quietly after 5 minutes', async () => {
    const h = harness({ tests: Array(200).fill('password') });
    await h.flow.open();
    await h.flow.imIn();
    await h.advance(PASTE_AFTER_MS);
    expect(h.flow.phase).toBe('paste');
    const before = h.log.filter((l) => l === 'test').length;
    expect(before).toBe(PASTE_AFTER_MS / RETEST_MS);
    await h.advance(60_000);
    expect(h.log.filter((l) => l === 'test').length - before).toBe(Math.floor(60_000 / PASTE_RETEST_MS));
    await h.advance(GIVE_UP_MS);
    const after = h.log.filter((l) => l === 'test').length;
    await h.advance(60_000);
    expect(h.log.filter((l) => l === 'test').length).toBe(after);
    expect(h.flow.phase).toBe('paste');
    expect(h.log).not.toContain('close');
  });

  it('a pasted line works too: success in the paste phase closes the tab and carries on', async () => {
    const h = harness({ tests: [...Array(5).fill('password'), 'ok'] });
    await h.flow.open();
    await h.flow.imIn();
    await h.advance(PASTE_AFTER_MS);
    expect(h.flow.phase).toBe('paste');
    await h.advance(PASTE_RETEST_MS);
    expect(h.flow.phase).toBe('done');
    expect(h.done()).toBe(1);
  });

  it('an older terminal Beethoven cannot type into goes straight to "Paste, then press Enter."', async () => {
    const h = harness({ typed: { typed: false, how: 'unsupported', why: 'unsupported' } });
    await h.flow.open();
    await h.flow.imIn();
    expect(h.flow.phase).toBe('paste');
  });

  it('the title\'s sign that the shell is up types the line, like "I\'m in", and only once', async () => {
    const h = harness();
    await h.flow.open();
    await Promise.all([h.flow.shellUp(), h.flow.imIn()]);
    expect(h.log.filter((l) => l.startsWith('type'))).toHaveLength(1);
    // nothing is typed in any other phase
    const g = harness();
    expect(await g.flow.imIn()).toBeUndefined();
    expect(g.log).toEqual([]);
  });

  it('the tab closed first: one last test, then "Not done yet." with the same button', async () => {
    const h = harness({ tests: ['password', 'password'] });
    await h.flow.open();
    await h.flow.imIn();
    h.closeTab();
    await h.advance(RETEST_MS);
    expect(h.flow.phase).toBe('closed');
    expect(h.done()).toBe(0);
    // the student pasted the line and closed the tab: the last test finds it done
    const g = harness({ tests: ['ok'] });
    await g.flow.open();
    await g.flow.imIn();
    await g.flow.tabClosed();
    expect(g.flow.phase).toBe('done');
    expect(g.log).not.toContain('close');
    // from "Not done yet." the terminal opens again
    expect(await h.flow.open()).toBe(true);
    expect(h.flow.phase).toBe('password');
  });

  it('stopped (the press was cancelled): no more tests', async () => {
    const h = harness({ tests: Array(20).fill('password') });
    await h.flow.open();
    await h.flow.imIn();
    h.flow.stop();
    await h.advance(30_000);
    expect(h.log.filter((l) => l === 'test')).toHaveLength(0);
  });
});
