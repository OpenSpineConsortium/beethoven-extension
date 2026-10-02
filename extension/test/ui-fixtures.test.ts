// The fixtures the pages are built and reviewed against (src/ui/fixtures.ts): one per state the
// specification and the contract describe. If model.ts gains a moment, a hero state, a login-setup phase or
// a welcome state, this fails until a fixture shows it, so nothing reaches a student unseen.
//
// 12.0.0: the direct way's moments, every phase of the sign-in sheet, every state of the helper's
// download, both routes of the grid code, the Grid row's three ways, Settings' Connection card, the
// welcome page's four prerequisites with the route choice, and where every QR code goes: only to
// Wayne State's own pages and the app stores' pages, over https.
import { describe, expect, it } from 'vitest';
import type { DirectMoment, HeroState, JourneyView, Moment, PanelView, QrLink, SignInSheetMoment, WelcomeView } from '../src/core/model';
import { FIXTURES, fixture } from '../src/ui/fixtures';
import { needsView, placeGroups, qrGroups, routeQr, routesView, type WelcomeView12 } from '../src/ui/model12';
import { qrUrl } from '../src/ui/routes';

const DIRECT: DirectMoment[] = ['choose-route', 'install-helper', 'sign-in-sheet', 'code-setup', 'enrolled', 'fallback-to-vpn', 'protect-key-optional'];
const MOMENTS: Moment[] = ['welcome', 'globalprotect', 'grid', 'statement', 'connect', 'claude', 'login-setup', 'queue', 'starting', 'online', ...DIRECT];
const HERO: HeroState[] = ['asked', 'queued', 'queued-share', 'queued-maintenance', 'got-computer', 'connecting', 'slow', 'reconnecting', 'needs-claude', 'needs-consent', 'online-new', 'online', 'renewing', 'stopped', 'error', 'unreachable'];
const WELCOME: WelcomeView['state'][] = ['idle', 'opening', 'denied', 'no-panel', 'save-failed', 'handoff'];
const SHEET: SignInSheetMoment['phase'][] = ['account', 'connecting', 'prompt', 'working', 'stopped', 'failed', 'unlock', 'code-refused'];

const panels = FIXTURES.flatMap((f) => (f.surface === 'panel' ? [{ name: f.name, view: f.view as PanelView }] : []));
const journeys = panels.flatMap((p) => (p.view.kind === 'journey' ? [{ name: p.name, j: p.view.journey as JourneyView }] : []));
const of = <M extends JourneyView['moment']>(m: M) => journeys.flatMap((x) => (x.j.moment === m ? [x.j as Extract<JourneyView, { moment: M }>] : []));

/** the hosts a QR code may open: Wayne State's own pages, the grid's own website, and the two app stores */
const QR_HOSTS = new Set(['services.wayne.edu', 'ondemand.grid.wayne.edu', 'apps.apple.com', 'play.google.com']);

describe('the fixtures', () => {
  it('have unique names', () => {
    const names = FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    expect(fixture('h-online')?.surface).toBe('panel');
  });

  it('show every moment of the first run, 12.0.0 direct way included', () => {
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

describe('the fixtures of 12.0.0', () => {
  it('show every phase of the sign-in sheet, the password and the code prompts, a refusal and the opt-in', () => {
    const sheets = of('sign-in-sheet');
    expect(SHEET.filter((p) => !sheets.some((s) => s.phase === p))).toEqual([]);
    const prompts = sheets.flatMap((s) => s.prompts ?? []);
    expect(prompts.some((p) => p.kind === 'password' && !p.echo)).toBe(true);
    expect(prompts.some((p) => p.kind === 'code')).toBe(true);
    expect(sheets.some((s) => !!s.notice)).toBe(true);
    // the opt-in is offered before the first sign-in and is unticked unless the student ticks it
    const account = fixture('j-sheet-account');
    expect(account?.surface === 'panel' && account.view.kind === 'journey' && account.view.journey.moment === 'sign-in-sheet' && !!account.view.journey.protect).toBe(true);
    expect(account?.surface === 'panel' ? account.local?.protectTicked : undefined).toBeFalsy();
  });

  it('never carry an answer: no sheet fixture holds a password or a code, only the grid prompts', () => {
    for (const s of of('sign-in-sheet')) {
      expect(Object.keys(s)).not.toContain('answers');
      for (const p of s.prompts ?? []) expect(Object.keys(p).sort()).toEqual(['echo', 'kind', 'text', ...(p.hint ? ['hint'] : [])].sort());
    }
  });

  it("show every state of the helper's download, per system, with its file and size", () => {
    const h = of('install-helper');
    expect(['idle', 'waiting', 'looking', 'found', 'not-found', 'broken'].filter((st) => !h.some((x) => x.status.state === st))).toEqual([]);
    expect(new Set(h.flatMap((x) => (x.download ? [x.download.os] : [])))).toEqual(new Set(['windows', 'mac', 'linux']));
    for (const x of h) if (x.download) expect(x.download.fileLine).toContain(x.download.file);
    expect(h.some((x) => !x.download)).toBe(true);
  });

  it('show both routes of the grid code, and the optional protection in every outcome', () => {
    expect(new Set(of('code-setup').map((c) => c.route))).toEqual(new Set(['laptop', 'phone']));
    const p = of('protect-key-optional');
    expect(p.some((x) => !x.outcome)).toBe(true);
    expect(p.some((x) => !x.on.available)).toBe(true);
    expect(p.filter((x) => x.outcome).length).toBeGreaterThanOrEqual(2);
  });

  it("show the Grid row's three ways: Direct, Through GlobalProtect, Locked", () => {
    const vias = panels.flatMap((p) => (p.view.kind === 'home' && p.view.home.rows.grid.via ? [p.view.home.rows.grid.via] : []));
    expect(vias.some((v) => v.mode === 'direct' && !v.locked)).toBe(true);
    expect(vias.some((v) => v.mode === 'vpn')).toBe(true);
    expect(vias.some((v) => !!v.locked)).toBe(true);
  });

  it("show Settings' Connection card with the protection off by default, on, unavailable, and with no key yet", () => {
    const c = FIXTURES.flatMap((f) => (f.surface === 'settings' && f.view.connection ? [f.view.connection] : []));
    expect(fixture('settings')?.surface === 'settings' && fixture('settings')?.view && (fixture('settings')!.view as { connection?: { protectKey: { value: boolean } } }).connection?.protectKey.value).toBe(false);
    expect(c.some((x) => x.protectKey.value)).toBe(true);
    expect(c.some((x) => !x.protectKey.available)).toBe(true);
    expect(c.some((x) => !x.protectKey.present && x.forget.disabled)).toBe(true);
    expect(c.some((x) => x.mode.value === 'vpn')).toBe(true);
  });

  it('show Details with the direct way', () => {
    expect(FIXTURES.some((f) => f.surface === 'panel' && !!f.details?.direct)).toBe(true);
  });

  it('show the welcome page with four prerequisites and the route choice, both routes open', () => {
    const w = FIXTURES.flatMap((f) => (f.surface === 'welcome' && f.name !== 'welcome-core-view' ? [{ f, v: f.view as WelcomeView12 }] : []));
    expect(w.every(({ v }) => v.needs.length === 4 && !!v.routes)).toBe(true);
    // and the core's view as it is sent today (three needs, no routes), which the page draws in the 12.0.0 form
    const core = fixture('welcome-core-view');
    expect(core?.surface === 'welcome' && core.view.needs.length === 3 && !('routes' in core.view && core.view.routes)).toBe(true);
    expect(new Set(w.flatMap(({ f }) => (f.local?.route ? [f.local.route] : [])))).toEqual(new Set(['laptop', 'phone']));
  });
});

describe('the QR codes', () => {
  const all = (): Array<{ where: string; url: string }> => {
    const out: Array<{ where: string; url: string }> = [];
    for (const c of of('code-setup')) for (const q of c.qr) out.push({ where: `code-setup ${c.route} ${q.id}`, url: q.url });
    const nv = needsView();
    for (const n of nv.needs) for (const g of n.qrs ?? []) for (const l of g.links) out.push({ where: `need ${n.id}`, url: l.url });
    for (const r of nv.routes.routes) for (const s of r.steps) for (const g of s.qrs ?? []) for (const l of g.links) out.push({ where: `route ${r.id}`, url: l.url });
    for (const f of FIXTURES) if (f.surface === 'welcome') for (const n of (f.view as WelcomeView12).needs) for (const g of 'qrs' in n ? (n.qrs ?? []) : []) for (const l of g.links) out.push({ where: `welcome ${f.name}`, url: l.url });
    return out;
  };

  it("open only Wayne State's pages and the app stores', over https", () => {
    const urls = all();
    expect(urls.length).toBeGreaterThan(10);
    for (const { where, url } of urls) {
      const u = new URL(url);
      expect(u.protocol, where).toBe('https:');
      expect(QR_HOSTS.has(u.hostname), `${where}: ${url}`).toBe(true);
      // nothing of the student's travels in a code: no query but the app store's own id, no fragment
      expect(u.hash, where).toBe('');
      if (u.search) expect(u.search, where).toMatch(/^\?id=[a-z0-9.]+$/);
    }
  });

  it("include Wayne State's KB 20242 (the grid's code), the GlobalProtect app in both stores, and both Authenticator stores; KB 20314 (GlobalProtect for computers) is a link", () => {
    const urls = all().map((x) => x.url);
    expect(urls.some((u) => /\/KB\/Article\/20242\//.test(u))).toBe(true);
    // the phone route's first code is the GlobalProtect app itself (KB 20314 covers Windows, macOS and ChromeOS only)
    expect(urls).toContain('https://apps.apple.com/app/globalprotect/id1400555706');
    expect(urls).toContain('https://play.google.com/store/apps/details?id=com.paloaltonetworks.globalprotect');
    expect(urls.some((u) => /id1135985407/.test(u))).toBe(false);
    expect(urls.some((u) => /apps\.apple\.com\/app\/google-authenticator\//.test(u))).toBe(true);
    expect(urls.some((u) => /com\.google\.android\.apps\.authenticator2/.test(u))).toBe(true);
    // the needs are links only (the codes are drawn once, inside the chosen route); KB 20314 is the GlobalProtect need's link
    const nv = needsView();
    expect(nv.needs.every((n) => !n.qrs?.length)).toBe(true);
    expect(nv.needs.find((n) => n.id === 'vpn')?.link?.url).toMatch(/\/KB\/Article\/20314\//);
  });

  it("encode a Wayne State article in its short form (fewer, larger modules), every other page as it is", () => {
    expect(qrUrl('https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid')).toBe('https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20242');
    expect(qrUrl('https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client')).toBe('https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20314');
    expect(qrUrl('https://apps.apple.com/app/globalprotect/id1400555706')).toBe('https://apps.apple.com/app/globalprotect/id1400555706');
    expect(qrUrl('https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20199')).toBe('https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20199');
  });

  it("put the phone route's square codes under the steps that name them, in order, and the 2FA Setup notice under its step", () => {
    const groups = qrGroups(routeQr('phone'));
    const steps = placeGroups('phone', ['Scan the first square code.', 'Scan the second square code.', 'Scan the third square code. Then 2FA Setup.', 'Type the setup key.', 'Come back.'], groups);
    expect(steps.map((s) => (s.qrs ?? []).length)).toEqual([1, 1, 1, 0, 0]);
    expect(steps[2]!.warn).toBeTruthy();
    expect(steps[3]!.note).toBeTruthy();
    // the laptop route opens the grid's pages here, as links; only the phone's app codes are square codes
    const laptop = routesView().routes[0];
    const codes = laptop.steps.flatMap((s) => s.qrs ?? []).flatMap((g) => g.links.map((l) => new URL(l.url).hostname));
    expect(codes.every((h) => h === 'apps.apple.com' || h === 'play.google.com')).toBe(true);
    expect(laptop.steps.some((s) => (s.links ?? []).some((l) => /20242/.test(l.url)))).toBe(true);
  });

  it('every code of the code setup is drawn from a known kind of page', () => {
    const ids: QrLink['id'][] = ['globalprotect-ios', 'globalprotect-android', 'authenticator-ios', 'authenticator-android', 'grid-code', 'grid-site'];
    for (const c of of('code-setup')) for (const q of c.qr) expect(ids).toContain(q.id);
  });
});
