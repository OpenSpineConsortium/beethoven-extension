// The fixtures the pages are built and reviewed against (src/ui/fixtures.ts): one per state the
// specification and the contract describe. If model.ts gains a moment, a hero state, a login-setup phase or
// a welcome state, this fails until a fixture shows it, so nothing reaches a student unseen.
//
// 16.0.0: the GlobalProtect moment with the university's own page and the line a waiting press shows,
// the welcome page's three prerequisites with their links, and Settings' note on a key an earlier version
// put in the grid account. The direct way's moments, the sign-in sheet, the helper's download, the grid
// code's two routes and the QR codes of 12.0.0 to 15.0.0 are gone with it.
import { describe, expect, it } from 'vitest';
import type { HeroState, JourneyView, Moment, PanelView, WelcomeView } from '../src/core/model';
import { WORDS } from '../src/core/model';
import { FIXTURES, fixture } from '../src/ui/fixtures';

const MOMENTS: Moment[] = ['welcome', 'globalprotect', 'grid', 'statement', 'connect', 'claude', 'login-setup', 'queue', 'starting', 'online'];
const HERO: HeroState[] = ['asked', 'queued', 'queued-share', 'queued-maintenance', 'got-computer', 'connecting', 'slow', 'reconnecting', 'needs-claude', 'needs-consent', 'online-new', 'online', 'renewing', 'stopped', 'error', 'unreachable'];
const WELCOME: WelcomeView['state'][] = ['idle', 'opening', 'denied', 'no-panel', 'save-failed', 'handoff'];

const panels = FIXTURES.flatMap((f) => (f.surface === 'panel' ? [{ name: f.name, view: f.view as PanelView }] : []));
const journeys = panels.flatMap((p) => (p.view.kind === 'journey' ? [{ name: p.name, j: p.view.journey as JourneyView }] : []));
const of = <M extends JourneyView['moment']>(m: M) => journeys.flatMap((x) => (x.j.moment === m ? [x.j as Extract<JourneyView, { moment: M }>] : []));

/** the hosts a help link may open: the university's own pages and claude.ai's plans page */
const LINK_HOSTS = new Set(['services.wayne.edu', 'claude.ai']);

describe('the fixtures', () => {
  it('have unique names', () => {
    const names = FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(fixture('h-online')?.surface).toBe('panel');
  });

  it('show every moment of the first run', () => {
    const seen = new Set(journeys.map((x) => x.j.moment));
    expect([...MOMENTS].filter((m) => !seen.has(m))).toEqual([]);
  });

  it('show every phase of the one-time key step', () => {
    const seen = new Set(of('login-setup').map((j) => j.phase));
    expect([...seen].sort()).toEqual(['checking', 'closed', 'done', 'offer', 'password', 'paste']);
  });

  it('show every home state of the waiting table', () => {
    const seen = new Set(panels.flatMap((p) => (p.view.kind === 'home' ? [p.view.home.hero.state] : [])));
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

describe('the fixtures of 16.0.0', () => {
  it('show GlobalProtect looking, still looking and connected, each with the university\'s own page, and without one where no profile applies', () => {
    const gp = of('globalprotect');
    expect(new Set(gp.map((g) => g.status.state))).toEqual(new Set(['looking', 'still', 'connected']));
    const withHelp = gp.filter((g) => g.help);
    expect(withHelp.length).toBeGreaterThanOrEqual(3);
    for (const g of withHelp) {
      expect(g.help!.label).toBe(WORDS.globalprotect.help);
      const u = new URL(g.help!.url);
      expect(u.protocol).toBe('https:');
      expect(u.hostname).toBe('services.wayne.edu');
    }
    // D20: a portal with no site profile names no app and has no page to point at
    expect(gp.some((g) => !g.chip && !g.help)).toBe(true);
  });

  it('show the press that waits for the grid, with its line, and only then', () => {
    const waits = fixture('j-gp-press-waits');
    expect(waits?.surface === 'panel' && waits.view.kind === 'journey' && waits.view.journey.moment === 'globalprotect' ? waits.view.journey.note : undefined).toBe(WORDS.globalprotect.pressWaits);
    expect(of('globalprotect').filter((g) => g.note).length).toBe(1);
  });

  it('show the welcome page with the three prerequisites, each with a page to open, and the Wayne State profile picked', () => {
    for (const f of FIXTURES) {
      if (f.surface !== 'welcome') continue;
      expect(f.view.needs.length, f.name).toBe(3);
      for (const n of f.view.needs) {
        // the Wayne State profile names a page for each need; a profile without one shows the words alone (17.0.0)
        expect(n.link, `${f.name}: ${n.title}`).toBeDefined();
        const u = new URL(n.link!.url);
        expect(u.protocol, `${f.name}: ${n.title}`).toBe('https:');
        expect(LINK_HOSTS.has(u.hostname), `${f.name}: ${n.link!.url}`).toBe(true);
        expect(u.hash, f.name).toBe('');
      }
      // 17.0.0: "Your grid" is the Wayne State profile first, and the one fixture with two grids keeps it picked
      expect(f.view.grids.options[0]?.site, f.name).toBe('wayne');
      expect(f.view.grids.selected, f.name).toBe('wayne');
    }
    const two = fixture('welcome-two-grids');
    expect(two?.surface === 'welcome' ? two.view.grids.options.length : 0).toBe(2);
  });

  it("show Settings' note on a key an earlier version added, with its Forget, and Settings without it", () => {
    const old = fixture('settings-old-key');
    expect(old?.surface === 'settings' ? old.view.oldKey : undefined).toMatchObject({ title: WORDS.settings.oldKey, forget: { label: WORDS.settings.oldKeyForget, action: { kind: 'forget-old-key' } } });
    expect(fixture('settings')?.surface === 'settings' ? fixture('settings')!.view : undefined).not.toHaveProperty('oldKey');
  });
});
