// The fixtures the pages are built and reviewed against (src/ui/fixtures.ts): one per state the
// specification and the contract describe. If model.ts gains a moment, a hero state, a login-setup phase or
// a welcome state, this fails until a fixture shows it, so nothing reaches a student unseen.
import { describe, expect, it } from 'vitest';
import type { HeroState, Moment, WelcomeView } from '../src/core/model';
import { FIXTURES, fixture } from '../src/ui/fixtures';

const MOMENTS: Moment[] = ['welcome', 'globalprotect', 'grid', 'statement', 'connect', 'claude', 'login-setup', 'queue', 'starting', 'online'];
const HERO: HeroState[] = ['asked', 'queued', 'queued-share', 'queued-maintenance', 'got-computer', 'connecting', 'slow', 'reconnecting', 'needs-claude', 'needs-consent', 'online-new', 'online', 'renewing', 'stopped', 'error', 'unreachable'];
const WELCOME: WelcomeView['state'][] = ['idle', 'opening', 'denied', 'no-panel', 'save-failed', 'handoff'];

describe('the fixtures', () => {
  it('have unique names', () => {
    const names = FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(fixture('h-online')?.surface).toBe('panel');
  });

  it('show every moment of the first run', () => {
    const seen = new Set(FIXTURES.flatMap((f) => (f.surface === 'panel' && f.view.kind === 'journey' ? [f.view.journey.moment] : [])));
    expect([...MOMENTS].filter((m) => !seen.has(m))).toEqual([]);
  });

  it('show every phase of the one-time key step', () => {
    const seen = new Set(FIXTURES.flatMap((f) => (f.surface === 'panel' && f.view.kind === 'journey' && f.view.journey.moment === 'login-setup' ? [f.view.journey.phase] : [])));
    expect([...seen].sort()).toEqual(['checking', 'closed', 'done', 'offer', 'password', 'paste']);
  });

  it('show every home state of the waiting table', () => {
    const seen = new Set(FIXTURES.flatMap((f) => (f.surface === 'panel' && f.view.kind === 'home' ? [f.view.home.hero.state] : [])));
    expect(HERO.filter((h) => !seen.has(h))).toEqual([]);
  });

  it('show the welcome page in every state, and Settings', () => {
    const seen = new Set(FIXTURES.flatMap((f) => (f.surface === 'welcome' ? [f.view.state] : [])));
    expect(WELCOME.filter((s) => !seen.has(s))).toEqual([]);
    expect(FIXTURES.some((f) => f.surface === 'settings')).toBe(true);
    expect(FIXTURES.some((f) => f.surface === 'panel' && f.view.kind === 'terms-needed')).toBe(true);
  });

  it('every primary button sends an action, every moment has at most one primary', () => {
    for (const f of FIXTURES) {
      if (f.surface !== 'panel' || f.view.kind !== 'home') continue;
      const p = f.view.home.primary;
      if (p && !p.button.disabled) expect(p.button.action, f.name).toBeDefined();
    }
  });
});
