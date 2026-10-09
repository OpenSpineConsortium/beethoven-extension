// The fixtures the pages are built and reviewed against (src/ui/fixtures.ts): one per state the
// specification and the contract describe. If model.ts gains a moment, a hero state, a login-setup phase or
// a welcome state, this fails until a fixture shows it, so nothing reaches a student unseen.
//
// 16.0.0: the GlobalProtect moment with the university's own page and the line a waiting press shows,
// the welcome page's three prerequisites with their links, and Settings' note on a key an earlier version
// put in the grid account. The direct way's moments, the sign-in sheet, the helper's download, the grid
// code's two routes and the QR codes of 12.0.0 to 15.0.0 are gone with it.
//
// 19.0.0: the grid sign-in sheet in every phase, the Grid row's Unlock, Settings' saved sign-in row and the
// welcome sentences' place names; then the pages themselves, drawn into a document (linkedom, pinned
// as a dev dependency) from the fixtures: the AccessID kept across a re-draw, the caret's place per phase, the
// password field's always-present note, the press that never keeps the password, the chained unlock and
// Forget's order.
import { parseHTML } from 'linkedom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Action, GridSheet, HeroState, JourneyView, Moment, PanelView, SettingsView, WelcomeView } from '../src/core/model';
import { WORDS } from '../src/core/model';
import type { GridSignin } from '../src/ext/gridSignin';
import { FIXTURES, fixture, type Fixture } from '../src/ui/fixtures';
import type { PanelLocal } from '../src/ui/panel';

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

// ---- 19.0.0 ------------------------------------------------------------------------------------------------

const sheetOf = (f: Fixture | undefined): GridSheet | undefined => (f?.surface === 'panel' && f.view.kind === 'journey' && f.view.journey.moment === 'grid' ? f.view.journey.sheet : undefined);
const SHEET_FIXTURES = FIXTURES.filter((f) => sheetOf(f));
const NEW_FIXTURES = FIXTURES.filter((f) => f.note.startsWith('19.0.0') || f.surface === 'welcome' || f.name === 'j-welcome-revoked');
const HOST = 'ondemand.grid.wayne.edu';
const PLACE = 'the Wayne State University HPC grid';

describe('the fixtures of 19.0.0', () => {
  it('show the sheet in every phase, each with and without Not now, and signed in', () => {
    for (const name of ['type', 'type-refused', 'type-refused-twice', 'type-held', 'type-unsupported', 'type-replace-saved', 'locked', 'working']) {
      for (const later of [false, true]) {
        const s = sheetOf(fixture(`j-grid-sheet-${name}${later ? '-later' : ''}`));
        expect(s, name).toBeDefined();
        expect(!!s!.later, name).toBe(later);
      }
    }
    expect(new Set(SHEET_FIXTURES.map((f) => sheetOf(f)!.phase))).toEqual(new Set(['type', 'locked', 'working']));
    expect(sheetOf(fixture('j-grid-sheet-type-refused'))!.note).toBe(WORDS.grid.refused);
    expect(sheetOf(fixture('j-grid-sheet-type-refused-twice'))!.note).toBe(WORDS.grid.refusedTwice);
    expect(sheetOf(fixture('j-grid-sheet-type-held'))!.note).toBe(WORDS.grid.held);
    expect(sheetOf(fixture('j-grid-sheet-type-replace-saved'))!.saved).not.toBe('none');
    expect(fixture('j-grid-sheet-type-unsupported')?.local).toMatchObject({ gridSupport: false });
    const signed = fixture('j-grid-sheet-signed-in');
    expect(signed?.surface === 'panel' && signed.view.kind === 'journey' && signed.view.journey.moment === 'grid' ? signed.view.journey.signedIn : undefined).toBe(WORDS.grid.signedIn('st1234'));
    // the page's own sentences, each shown once
    const notes = new Set(FIXTURES.flatMap((f) => (f.surface === 'panel' && f.local?.gridNote ? [f.local.gridNote] : [])));
    expect(notes).toEqual(new Set([WORDS.grid.noPassword, WORDS.grid.notSaved, WORDS.grid.notUnlocked]));
  });

  it('show the Grid row with Unlock, its as-of line, and the unlock the presses start', () => {
    const h = fixture('h-signed-out-locked');
    const v = h?.surface === 'panel' && h.view.kind === 'home' ? h.view : undefined;
    expect(v?.home.rows.grid.link).toMatchObject({ label: WORDS.home.unlock, action: { kind: 'unlock-grid' } });
    expect(v?.home.hero.asOf).toBe(WORDS.home.asOfLocked('9:02 AM', 'Windows Hello'));
    expect(v?.overlays.unlock).toEqual({ unlockWith: 'Windows Hello' });
  });

  it("show Settings' saved sign-in saved, turned down and none, its confirm row and what Forget says", () => {
    const row = (name: string): SettingsView['signin'] => {
      const f = fixture(name);
      return f?.surface === 'settings' ? f.view.signin : undefined;
    };
    expect(row('settings-signin-saved')).toMatchObject({ text: WORDS.settings.signinSaved('st1234', 'Windows Hello'), forget: { action: { kind: 'forget-grid-signin' } } });
    expect(row('settings-signin-refused')?.text).toBe(WORDS.settings.signinRefused);
    expect(row('settings-signin-none')).toMatchObject({ text: WORDS.settings.signinNone });
    expect(row('settings-signin-none')?.forget).toBeUndefined();
    expect(fixture('settings-signin-confirm')?.local).toMatchObject({ confirmForget: true });
    expect(fixture('settings-signin-forgotten')?.local).toMatchObject({ signinForgotten: WORDS.settings.forgotten('st1234') });
    expect(fixture('settings-disconnect-confirm')?.local).toMatchObject({ confirmDisconnect: true });
  });

  it('name the grid by its profile, never its host, in the welcome sentences', () => {
    for (const f of FIXTURES) {
      if (f.surface !== 'welcome') continue;
      expect(f.view.allowNote, f.name).toContain(PLACE);
      expect(f.view.allowNote, f.name).not.toContain(HOST);
      if (f.view.problem) expect(f.view.problem, f.name).not.toContain(HOST);
    }
    const denied = fixture('welcome-denied');
    expect(denied?.surface === 'welcome' ? denied.view.problem : undefined).toBe(WORDS.welcome.denied(PLACE));
    const revoked = fixture('j-welcome-revoked');
    expect(revoked?.surface === 'panel' && revoked.view.kind === 'journey' && revoked.view.journey.moment === 'welcome' ? revoked.view.journey.body : undefined).toBe(WORDS.welcomeMoment.revokedBody(PLACE));
  });
});

/** the page side of the sign-in, stood in: what each press handed it, in order, and promises left open */
function stubSignin(calls: string[]) {
  const submits: Array<{ origin: string; username: string; password: string; remember: boolean }> = [];
  const signin: GridSignin = {
    supportNow: () => Promise.resolve(true),
    submitSheet: (o) => {
      calls.push('submitSheet');
      submits.push({ origin: o.origin, username: o.username, password: o.password, remember: o.remember });
      return new Promise(() => undefined);
    },
    unlockNow: () => {
      calls.push('unlockNow');
      return new Promise(() => undefined);
    },
    forgetNow: () => Promise.resolve(true),
  };
  return { signin, submits };
}

describe('the pages of 19.0.0, drawn', () => {
  let doc: Document;
  let win: Window & Record<string, unknown>;
  let panel: typeof import('../src/ui/panel');
  let settings: typeof import('../src/ui/settings');
  let welcome: typeof import('../src/ui/welcome');
  const focused: Element[] = [];

  beforeAll(async () => {
    const dom = parseHTML('<!doctype html><html><body></body></html>');
    win = dom.window as unknown as Window & Record<string, unknown>;
    doc = dom.document as unknown as Document;
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    for (const k of ['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLDetailsElement', 'HTMLButtonElement', 'SVGElement', 'Event']) vi.stubGlobal(k, win[k]);
    vi.stubGlobal('getComputedStyle', () => ({ position: 'relative' }));
    vi.stubGlobal('fetch', () => Promise.resolve({ text: () => Promise.resolve('') }));
    // wxt/browser takes globalThis.chrome when it is imported; nothing here reaches it
    vi.stubGlobal('chrome', { runtime: { id: 'test', getURL: (p: string) => p, getManifest: () => ({ version: '19.0.0' }) }, storage: { local: {}, session: {} } });
    // linkedom's select has no value setter (the welcome page's "Your grid" sets one)
    Object.defineProperty((win.HTMLSelectElement as unknown as { prototype: object }).prototype, 'value', {
      configurable: true,
      get(this: Element) {
        return this.querySelector('option[selected]')?.getAttribute('value') ?? '';
      },
      set(this: Element, v: string) {
        for (const o of Array.from(this.querySelectorAll('option'))) o.toggleAttribute('selected', o.getAttribute('value') === v);
      },
    });
    // focus() does nothing in linkedom: record where the caret is sent instead
    (win.HTMLElement as unknown as { prototype: { focus: () => void } }).prototype.focus = function (this: Element) {
      focused.push(this);
    };
    vi.resetModules();
    panel = await import('../src/ui/panel');
    settings = await import('../src/ui/settings');
    welcome = await import('../src/ui/welcome');
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const fire = (e: Element, type: string, extra: Record<string, unknown> = {}) => {
    const ev = new (win.Event as unknown as typeof Event)(type, { bubbles: true });
    for (const [k, v] of Object.entries(extra)) Object.defineProperty(ev, k, { value: v });
    e.dispatchEvent(ev);
  };
  /** the element on the screen that stays (never one inside a screen that is leaving) */
  const live = <T extends Element = HTMLElement>(root: Element, sel: string): T | undefined => Array.from(root.querySelectorAll<T>(sel)).find((e) => !e.closest('.leaving'));
  const panelView = (name: string): { view: PanelView; local?: Partial<PanelLocal> } => {
    const f = fixture(name);
    if (f?.surface !== 'panel') throw new Error(`no panel fixture ${name}`);
    return { view: f.view, ...(f.local ? { local: f.local } : {}) };
  };
  const mountFixture = (name: string, local: Partial<PanelLocal> = {}) => {
    const { view, local: l } = panelView(name);
    const root = doc.createElement('div');
    doc.body.append(root);
    const calls: string[] = [];
    const acts: Action[] = [];
    const { signin, submits } = stubSignin(calls);
    const p = panel.mountPanel(root as unknown as HTMLElement, {
      act: (a: Action) => {
        acts.push(a);
        calls.push(`act:${a.kind}`);
        return Promise.resolve(undefined as never);
      },
      signin,
      fixture: { view, local: { ...l, ...local } },
    });
    p.show(view);
    return { root, p, calls, acts, submits };
  };

  it('every fixture of 19.0.0 renders, the welcome page and Settings among them', () => {
    const gestures = { hasPanel: true, openPanel: () => Promise.resolve(true), request: () => Promise.resolve(true), openTab: () => undefined, url: (p: string) => p, productVersion: () => '19.0.0', host: () => 'Chrome', installId: () => Promise.resolve('x'), save: () => Promise.resolve() };
    expect(NEW_FIXTURES.length).toBeGreaterThan(30);
    for (const f of NEW_FIXTURES) {
      const root = doc.createElement('div');
      doc.body.append(root);
      const act = () => Promise.resolve(undefined as never);
      if (f.surface === 'panel') panel.mountPanel(root as unknown as HTMLElement, { act, fixture: { view: f.view, ...(f.local ? { local: f.local } : {}) } }).show(f.view);
      else if (f.surface === 'settings') settings.mountSettings(root as unknown as HTMLElement, { act, gestures, ...(f.local ? { local: f.local } : {}) }).show(f.view);
      else welcome.mountWelcome(root as unknown as HTMLElement, { act, gestures, ...(f.local ? { local: f.local } : {}) }).show(f.view);
      expect(root.textContent?.length ?? 0, f.name).toBeGreaterThan(20);
      root.remove();
    }
  });

  it('the welcome page\'s last word: a step to the panel\'s sign-in has no check mark and no hero; "You\'re set" keeps both', () => {
    const gestures = { hasPanel: true, openPanel: () => Promise.resolve(true), request: () => Promise.resolve(true), openTab: () => undefined, url: (p: string) => p, productVersion: () => '19.0.0', host: () => 'Chrome', installId: () => Promise.resolve('x'), save: () => Promise.resolve() };
    const draw = (name: string) => {
      const f = fixture(name);
      if (f?.surface !== 'welcome') throw new Error(`no welcome fixture ${name}`);
      const root = doc.createElement('div');
      doc.body.append(root);
      welcome.mountWelcome(root as unknown as HTMLElement, { act: () => Promise.resolve(undefined as never), gestures }).show(f.view);
      const h = root.querySelector('.handoff');
      const out = { text: h?.querySelector('.handoff-head span')?.textContent, check: !!h?.querySelector('svg.drawn'), hero: (h?.children.length ?? 0) > 1 };
      root.remove();
      return out;
    };
    expect(draw('welcome-handoff-signin')).toEqual({ text: WORDS.welcome.handoffSignin, check: false, hero: false });
    expect(draw('welcome-handoff')).toEqual({ text: WORDS.welcome.handoff, check: true, hero: true });
  });

  it('keeps the AccessID typed and the password field itself across a click on the tick and a line arriving above them', () => {
    const { root, p } = mountFixture('j-grid-sheet-type');
    const user = live<HTMLInputElement>(root, '#grid-user')!;
    const pass = live<HTMLInputElement>(root, '#grid-pass')!;
    user.value = 'ab1234';
    fire(user, 'input');
    pass.value = 'correct horse';
    const tick = live<HTMLInputElement>(root, '#grid-remember')!;
    tick.checked = true;
    fire(tick, 'change');
    expect(live(root, '#grid-user')).toBe(user);
    expect(user.value).toBe('ab1234');
    expect(live<HTMLInputElement>(root, '#grid-remember')!.checked).toBe(true);
    // a problem line arrives above the fields: the same two fields, the typed values untouched
    p.show(panelView('j-grid-sheet-unreachable').view);
    expect(live(root, '.m-problem')).toBeDefined();
    expect(live(root, '#grid-user')).toBe(user);
    expect(user.value).toBe('ab1234');
    expect(live(root, '#grid-pass')).toBe(pass);
    expect(pass.value).toBe('correct horse');
    expect(pass.hasAttribute('name')).toBe(false);
    root.remove();
  });

  it('puts data-autofocus where the caret belongs in each phase, and nowhere while signing in', () => {
    const at = (name: string, local: Partial<PanelLocal> = {}) => {
      const { root } = mountFixture(name, local);
      const marked = Array.from(root.querySelectorAll('[data-autofocus]')).filter((e) => !e.closest('.leaving') && !e.closest('.hdr-slot'));
      root.remove();
      return marked.map((e) => e.id);
    };
    expect(at('j-grid-sheet-type')).toEqual(['grid-user']);
    expect(at('j-grid-sheet-type-refused')).toEqual(['grid-pass']);
    expect(at('j-grid-sheet-type-replace-saved-later')).toEqual(['grid-pass']);
    expect(at('j-grid-sheet-locked')).toEqual(['grid-unlock']);
    expect(at('j-grid-sheet-locked-later', { typeInstead: true })).toEqual(['grid-pass']);
    expect(at('j-grid-sheet-working')).toEqual([]);
  });

  it("points the password's aria-describedby at the note that is always there, whatever it says", () => {
    let checked = 0;
    for (const f of SHEET_FIXTURES) {
      const local: Partial<PanelLocal> = (f.surface === 'panel' ? f.local : undefined) ?? {};
      const s = sheetOf(f)!;
      const { root } = mountFixture(f.name);
      const pass = live<HTMLInputElement>(root, '#grid-pass');
      if (pass) {
        checked += 1;
        expect(pass.getAttribute('aria-describedby'), f.name).toBe('grid-pass-note');
        expect(pass.getAttribute('type'), f.name).toBe(local.passShown ? 'text' : 'password');
        expect(pass.hasAttribute('value'), f.name).toBe(false);
        const note = live(root, '#grid-pass-note');
        expect(note?.getAttribute('role'), f.name).toBe('alert');
        // the core's refusal steps aside while a new attempt runs
        expect(note?.textContent, f.name).toBe(local.gridNote ?? (s.phase === 'working' ? undefined : s.note) ?? '');
        // a refusal says the password was wrong; a hold never does (whether it worked could not be told)
        if (local.gridNote === undefined && s.phase !== 'working') expect(pass.getAttribute('aria-invalid'), f.name).toBe(s.note && s.note !== WORDS.grid.held ? 'true' : null);
      } else expect((s.phase === 'locked' || (s.phase === 'working' && local.gridBusy === 'unlock')) && !local.typeInstead, f.name).toBe(true);
      root.remove();
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('Sign in reads the fields, empties the password field inside the click, and never sends the password', () => {
    const { root, calls, acts, submits } = mountFixture('j-grid-sheet-type-later', { remember: true });
    const user = live<HTMLInputElement>(root, '#grid-user')!;
    const pass = live<HTMLInputElement>(root, '#grid-pass')!;
    // nothing typed: the AccessID is asked for first, nothing handed over
    fire(live(root, '#grid-signin')!, 'click');
    expect(submits).toEqual([]);
    expect(live(root, '#grid-user-note')!.textContent).toBe(WORDS.grid.badAccessId);
    // the AccessID typed, the password not: said under it
    user.value = 'st1234';
    fire(user, 'input');
    expect(live(root, '#grid-user-note')!.textContent).toBe('');
    fire(live(root, '#grid-signin')!, 'click');
    expect(submits).toEqual([]);
    expect(live(root, '#grid-pass-note')!.textContent).toBe(WORDS.grid.noPassword);
    expect(live(root, '#grid-pass')!.getAttribute('aria-invalid')).toBe('true');
    // an AccessID that is not one
    user.value = 'st 1234';
    fire(user, 'input');
    pass.value = 'correct horse';
    fire(live(root, '#grid-signin')!, 'click');
    expect(submits).toEqual([]);
    expect(live(root, '#grid-user-note')!.textContent).toBe(WORDS.grid.badAccessId);
    expect(live(root, '#grid-user')!.getAttribute('aria-invalid')).toBe('true');
    // Enter in the password field presses Sign in
    user.value = 'st1234';
    fire(user, 'input');
    fire(pass, 'keydown', { key: 'Enter' });
    expect(submits).toEqual([{ origin: `https://${HOST}`, username: 'st1234', password: 'correct horse', remember: true }]);
    expect(pass.value).toBe('');
    expect(calls).toEqual(['submitSheet']);
    expect(JSON.stringify(acts)).not.toContain('correct horse');
    // busy until the page side answers: a second press hands nothing over
    expect(live(root, '#grid-signin')!.getAttribute('aria-busy')).toBe('true');
    expect(live(root, '.gs-status')!.textContent).toBe(WORDS.grid.signingIn);
    pass.value = 'again';
    fire(live(root, '#grid-signin')!, 'click');
    expect(submits.length).toBe(1);
    root.remove();
  });

  it('the eye flips only the live field’s type, under one name whose pressed state says the password is shown', () => {
    const { root } = mountFixture('j-grid-sheet-type');
    const pass = live<HTMLInputElement>(root, '#grid-pass')!;
    pass.value = 'correct horse';
    const eye = () => live(root, '.field-eye')!;
    expect([eye().getAttribute('aria-label'), eye().getAttribute('aria-pressed')]).toEqual(['Show password', 'false']);
    fire(eye(), 'click');
    expect(live(root, '#grid-pass')).toBe(pass);
    expect(pass.type).toBe('text');
    // a toggle keeps its name: "Show password, pressed" while shown, never "Hide password, pressed"
    expect([eye().getAttribute('aria-label'), eye().getAttribute('aria-pressed')]).toEqual(['Show password', 'true']);
    fire(eye(), 'click');
    expect(pass.type).toBe('password');
    expect(pass.value).toBe('correct horse');
    expect([eye().getAttribute('aria-label'), eye().getAttribute('aria-pressed')]).toEqual(['Show password', 'false']);
    root.remove();
  });

  it('announces the heading the sheet draws: "Unlock your grid sign-in" while locked, the sign-in heading once Type it instead is pressed', async () => {
    const said = () => doc.querySelector('.sr-only[aria-live="polite"]')?.textContent;
    const settle = () => new Promise((r) => setTimeout(r, 100));
    const { root } = mountFixture('j-grid-sheet-locked-later');
    await settle();
    expect(said()).toBe(WORDS.grid.lockedTitle);
    fire(live(root, '[data-key="grid-type-instead"]')!, 'click');
    await settle();
    expect(said()).toBe(WORDS.grid.title);
    root.remove();
  });

  it('a refusal growing under the password while the caret stays in it brings the field out from under the foot; a push that moves nothing, or a field still clear, is left alone', () => {
    // as Chrome lays the sheet out at 360 x 560: the password's question 48 px, its note four lines once it speaks
    let footTop = 400;
    const proto = (win.HTMLElement as unknown as { prototype: Record<string, unknown> }).prototype;
    const scrolled: Element[] = [];
    proto.getBoundingClientRect = function (this: Element) {
      if (this.classList.contains('m-foot')) return { top: footTop, bottom: 560 };
      if (this.classList.contains('gs-q') && this.querySelector('#grid-pass')) return { top: 300, bottom: 348 + (this.querySelector('#grid-pass-note')?.textContent ? 75 : 0) };
      return { top: 0, bottom: 0 };
    };
    proto.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    let caret: Element | null = null;
    Object.defineProperty(doc, 'activeElement', { configurable: true, get: () => caret });
    try {
      // Enter in the password: the caret stays there through the attempt and the refusal (no focusin comes)
      const { root, p } = mountFixture('j-grid-sheet-type-later');
      const pass = live<HTMLInputElement>(root, '#grid-pass')!;
      caret = pass;
      p.show(panelView('j-grid-sheet-working-later').view);
      expect(scrolled).toEqual([]);
      p.show(panelView('j-grid-sheet-type-refused-later').view);
      expect(scrolled).toEqual([pass.closest('.gs-q')]);
      // the same view again moves nothing: the student's own scrolling is left alone
      p.show(panelView('j-grid-sheet-type-refused-later').view);
      expect(scrolled.length).toBe(1);
      root.remove();
      // a taller panel: the warning ends above the foot, and nothing scrolls
      footTop = 500;
      scrolled.length = 0;
      const tall = mountFixture('j-grid-sheet-working-later');
      caret = live(tall.root, '#grid-pass')!;
      tall.p.show(panelView('j-grid-sheet-type-refused-later').view);
      expect(scrolled).toEqual([]);
      tall.root.remove();
    } finally {
      delete proto.getBoundingClientRect;
      delete proto.scrollIntoView;
      delete (doc as unknown as Record<string, unknown>).activeElement;
    }
  });

  it('after a refusal the caret goes to the password field', () => {
    const { root, p } = mountFixture('j-grid-sheet-working');
    focused.length = 0;
    p.show(panelView('j-grid-sheet-type-refused').view);
    expect(focused.map((e) => e.id)).toEqual(['grid-pass']);
    // a tick or a toggle afterwards never takes the caret again
    focused.length = 0;
    const tick = live<HTMLInputElement>(root, '#grid-remember')!;
    tick.checked = true;
    fire(tick, 'change');
    expect(focused).toEqual([]);
    root.remove();
  });

  it('a press that needs the grid is sent first and starts the unlock in the same click; without a locked sign-in it does not', () => {
    const locked = mountFixture('h-stopped-locked');
    fire(live(locked.root, '.home-primary button')!, 'click');
    expect(locked.calls).toEqual(['act:connect', 'unlockNow']);
    locked.root.remove();
    const plain = mountFixture('h-stopped');
    fire(live(plain.root, '.home-primary button')!, 'click');
    expect(plain.calls).toEqual(['act:connect']);
    plain.root.remove();
  });

  it('"Open my session" never needs the grid: with a saved sign-in locked it starts no unlock', () => {
    const h = mountFixture('h-signed-out-locked');
    expect(live(h.root, '.home-primary button')?.textContent).toContain(WORDS.home.openSession);
    fire(live(h.root, '.home-primary button')!, 'click');
    expect(h.calls).toEqual(['act:open-session']);
    h.root.remove();
  });

  it('after an unlock the sheet stays the locked one, Unlock busy and "Signing in…", never the type form with an empty password', () => {
    const working = (name: string): PanelView => {
      const v = structuredClone(panelView(name).view) as Extract<PanelView, { kind: 'journey' }>;
      const j = v.journey as Extract<JourneyView, { moment: 'grid' }>;
      j.sheet = { ...j.sheet!, phase: 'working', saved: 'ready' };
      return v;
    };
    // the sheet's own Unlock
    const sheet = mountFixture('j-grid-sheet-locked');
    fire(live(sheet.root, '#grid-unlock')!, 'click');
    sheet.p.show(working('j-grid-sheet-locked'));
    expect(live(sheet.root, '#grid-pass')).toBeUndefined();
    expect(live(sheet.root, '#grid-unlock')!.getAttribute('aria-busy')).toBe('true');
    expect(live(sheet.root, '.gs-status')?.textContent).toBe(WORDS.grid.signingIn);
    sheet.root.remove();
    // a press that needs the grid, its unlock started in the same click, and the sheet it leads to
    const press = mountFixture('h-stopped-locked');
    fire(live(press.root, '.home-primary button')!, 'click');
    expect(press.calls).toEqual(['act:connect', 'unlockNow']);
    press.p.show(working('j-grid-sheet-press-waits'));
    expect(live(press.root, '#grid-pass')).toBeUndefined();
    expect(live(press.root, '#grid-unlock')!.getAttribute('aria-busy')).toBe('true');
    press.root.remove();
    // the gallery's fixture draws the same
    const f = mountFixture('j-grid-sheet-unlocked-working');
    expect(live(f.root, '#grid-pass')).toBeUndefined();
    expect(live(f.root, '.gs-status')?.textContent).toBe(WORDS.grid.signingIn);
    f.root.remove();
  });

  it("the Grid row's Unlock and the sheet's Unlock run the unlock here, and never reach the background", () => {
    const row = mountFixture('h-signed-out-locked');
    fire(live(row.root, '.row-link')!, 'click');
    expect(row.calls).toEqual(['unlockNow']);
    row.root.remove();
    const sheet = mountFixture('j-grid-sheet-locked');
    fire(live(sheet.root, '#grid-unlock')!, 'click');
    expect(sheet.calls).toEqual(['unlockNow']);
    expect(live(sheet.root, '#grid-unlock')!.getAttribute('aria-busy')).toBe('true');
    fire(live(sheet.root, '#grid-unlock')!, 'click');
    expect(sheet.calls).toEqual(['unlockNow']);
    sheet.root.remove();
  });

  it("the Grid row's unlock that does not open leads to the sheet, which says so beside Type it instead", async () => {
    const { view } = panelView('h-signed-out-locked');
    const root = doc.createElement('div');
    doc.body.append(root);
    const acts: Action[] = [];
    const p = panel.mountPanel(root as unknown as HTMLElement, {
      act: (a: Action) => {
        acts.push(a);
        return Promise.resolve(undefined as never);
      },
      signin: { supportNow: () => Promise.resolve(true), submitSheet: () => Promise.resolve({ saved: false }), unlockNow: () => Promise.resolve('cancelled' as const), forgetNow: () => Promise.resolve(true) },
      fixture: { view },
    });
    p.show(view);
    fire(live(root, '.row-link')!, 'click');
    await Promise.resolve();
    await Promise.resolve();
    expect(acts.map((a) => a.kind)).toEqual(['sign-in-grid']);
    p.show(panelView('j-grid-sheet-locked-later').view);
    expect(live(root, '#grid-unlock-note')?.textContent).toBe(WORDS.grid.notUnlocked);
    expect(live(root, '[data-key="grid-type-instead"]')?.textContent).toBe(WORDS.grid.typeInstead);
    root.remove();
  });

  it("the Grid row's unlock whose sign-in the grid turns down leads to the sheet, which says so", async () => {
    const { view } = panelView('h-signed-out-locked');
    const root = doc.createElement('div');
    doc.body.append(root);
    const acts: Action[] = [];
    const p = panel.mountPanel(root as unknown as HTMLElement, {
      act: (a: Action) => {
        acts.push(a);
        return Promise.resolve(undefined as never);
      },
      signin: { supportNow: () => Promise.resolve(true), submitSheet: () => Promise.resolve({ saved: false }), unlockNow: () => Promise.resolve('refused' as const), forgetNow: () => Promise.resolve(true) },
      fixture: { view },
    });
    p.show(view);
    fire(live(root, '.row-link')!, 'click');
    await Promise.resolve();
    await Promise.resolve();
    expect(acts.map((a) => a.kind)).toEqual(['sign-in-grid']);
    p.show(panelView('j-grid-sheet-type-refused-later').view);
    expect(live(root, '#grid-pass-note')?.textContent).toBe(WORDS.grid.refused);
    root.remove();
  });

  it("Settings' Forget: the confirm row, then the passkey signal, then the background, then what it says", () => {
    const f = fixture('settings-signin-saved');
    if (f?.surface !== 'settings') throw new Error('no fixture');
    const calls: string[] = [];
    const root = doc.createElement('div');
    doc.body.append(root);
    const gestures = { hasPanel: true, openPanel: () => Promise.resolve(true), request: () => Promise.resolve(true), openTab: () => undefined, url: (p: string) => p, productVersion: () => '19.0.0', host: () => 'Chrome', installId: () => Promise.resolve('x'), save: () => Promise.resolve(), unknownPasskey: (cred: string) => calls.push(`unknown:${cred}`) };
    const page = settings.mountSettings(root as unknown as HTMLElement, {
      act: (a: Action) => {
        calls.push(`act:${a.kind}`);
        return Promise.resolve(undefined as never);
      },
      gestures,
    });
    page.show(f.view);
    const row = () => live(root, '[data-key="signin"]')!;
    expect(row().textContent).toContain(WORDS.settings.signinSaved('st1234', 'Windows Hello'));
    fire(row().querySelector('button')!, 'click');
    expect(calls).toEqual([]);
    expect(row().querySelector('.s-ask')?.textContent).toBe(WORDS.settings.forgetConfirm);
    expect(row().querySelector('.s-ask')?.getAttribute('role')).toBe('alert');
    const forget = row().querySelector('.btn-brick')!;
    expect(forget.getAttribute('aria-label')).toBe(WORDS.settings.forgetConfirm);
    fire(forget, 'click');
    expect(calls).toEqual([`unknown:${f.view.signin!.cred}`, 'act:forget-grid-signin']);
    // said once the background's view says nothing is saved, never under the saved row
    expect(live(root, '[data-key="signin-forgotten"]')).toBeUndefined();
    const none = fixture('settings-signin-none');
    if (none?.surface !== 'settings') throw new Error('no fixture');
    page.show(none.view);
    const said = live(root, '[data-key="signin-forgotten"]');
    expect(said?.getAttribute('role')).toBe('status');
    expect(said?.textContent).toBe(WORDS.settings.forgotten('st1234'));
    root.remove();
  });

  it("Settings never shows Forget's sentence under a sign-in saved again", () => {
    const view = (name: string): SettingsView => {
      const f = fixture(name);
      if (f?.surface !== 'settings') throw new Error(`no settings fixture ${name}`);
      return f.view;
    };
    const root = doc.createElement('div');
    doc.body.append(root);
    const gestures = { hasPanel: true, openPanel: () => Promise.resolve(true), request: () => Promise.resolve(true), openTab: () => undefined, url: (p: string) => p, productVersion: () => '19.0.0', host: () => 'Chrome', installId: () => Promise.resolve('x'), save: () => Promise.resolve(), unknownPasskey: () => undefined };
    const page = settings.mountSettings(root as unknown as HTMLElement, { act: () => Promise.resolve(undefined as never), gestures });
    const forgotten = () => live(root, '[data-key="signin-forgotten"]')?.textContent;
    page.show(view('settings-signin-saved'));
    fire(live(root, '[data-key="signin"]')!.querySelector('button')!, 'click');
    fire(live(root, '[data-key="signin"]')!.querySelector('.btn-brick')!, 'click');
    page.show(view('settings-signin-none'));
    expect(forgotten()).toBe(WORDS.settings.forgotten('st1234'));
    // saved again from the panel while Settings stays open: the row says so, and nothing says it was forgotten
    page.show(view('settings-signin-saved'));
    expect(live(root, '[data-key="signin"]')!.textContent).toContain(WORDS.settings.signinSaved('st1234', 'Windows Hello'));
    expect(forgotten()).toBeUndefined();
    // and that forget is over: a later view with nothing saved does not bring the old sentence back
    page.show(view('settings-signin-none'));
    expect(forgotten()).toBeUndefined();
    root.remove();
  });
});
