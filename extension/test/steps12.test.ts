// 12.0.0's moments (core/steps.ts directMoment, directJourney) against D3 and D2: the direct way first
// (the helper offered when no bridge answers, "Use GlobalProtect instead" beside it), the sign-in sheet
// with the grid's own prompts, the 2FA refusal turned into the route choice and its two routes with
// their square codes, "This computer is set up.", the optional protection (off by default), the
// fallback, the Grid row's "Direct" / "Through GlobalProtect", and the 11.0.0 way unchanged when the
// direct facts are absent or Settings says GlobalProtect only.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../src/core/keys';
import { DIRECT_LINKS, WORDS, type JourneyView } from '../src/core/model';
import { connectionMode, directMoment, home, journey, momentOf, panelView, type DirectFacts, type Facts, type RunFacts } from '../src/core/steps';
import { accessFact } from '../src/licensing/access';

const NOW = Date.parse('2026-10-02T13:00:00Z');
const ORIGIN = 'https://ondemand.grid.wayne.edu';
const HOST = 'ondemand.grid.wayne.edu';
const NO_RUN: RunFacts = { present: false, phase: 'none', live: false, stale: false, renewal: false, chain: true, reason: 'line', pressed: false };

const direct = (o: Partial<DirectFacts> = {}): DirectFacts => ({
  pref: 'direct',
  vpnChosen: false,
  bridge: 'helper',
  helper: { state: 'available', version: '1' },
  probing: false,
  key: { present: true, wrapped: false, locked: false, enrolled: true },
  unreachable: false,
  account: 'st1234',
  sheetWanted: false,
  enrolledSeen: true,
  protectOffer: false,
  fallbackSeen: false,
  links: { globalProtect: DIRECT_LINKS.globalProtect, gridCode: DIRECT_LINKS.gridCode, gridSite: `${ORIGIN}/pun/sys/dashboard/` },
  ...o,
});

function facts(o: Partial<Facts> = {}, d: Partial<DirectFacts> | null = {}): Facts {
  return {
    now: NOW,
    terms: true,
    portal: { origin: ORIGIN, hostname: HOST, site: 'wayne' },
    granted: true,
    site: { vpnApp: 'GlobalProtect', vpnPortal: 'protect.wayne.edu', title: 'Wayne State grid', hours: 8 },
    grid: { reach: 'answers', session: 'signed-in', account: 'st1234' },
    signin: { waiting: false },
    access: accessFact({ record: { v: 1, access_id: 'st1234', portal: HOST, approved: true, checked_at: new Date(NOW - 60_000).toISOString(), until: null, last_attempt_at: new Date(NOW - 60_000).toISOString() }, accessId: 'st1234', portal: HOST, now: new Date(NOW) }),
    setup: { state: 'ready' },
    statement: { inForce: true, workerName: 'worker' },
    connect: { inFlight: false, queued: false, signin: 'none' },
    run: NO_RUN,
    waits: [],
    once: {},
    prefs: DEFAULT_PREFS,
    stopping: false,
    workingInTab: false,
    ...(d === null ? {} : { direct: direct(d) }),
    ...o,
  };
}

const J = <M extends JourneyView['moment']>(f: Facts) => journey(f) as Extract<JourneyView, { moment: M }>;

describe('which way: connectionMode', () => {
  it('the 11.0.0 way without direct facts, with GlobalProtect only, or when chosen', () => {
    expect(connectionMode(facts({}, null))).toBe('vpn');
    expect(connectionMode(facts({}, { pref: 'vpn' }))).toBe('vpn');
    expect(connectionMode(facts({}, { vpnChosen: true }))).toBe('vpn');
    expect(connectionMode(facts({}, { unreachable: true, fallbackSeen: true }))).toBe('vpn');
  });
  it('setup until a bridge and an enrolled, unlocked key are there; then direct', () => {
    expect(connectionMode(facts({}, { bridge: 'none' }))).toBe('setup');
    expect(connectionMode(facts({}, { bridge: 'unknown' }))).toBe('setup');
    expect(connectionMode(facts({}, { key: { present: false, wrapped: false, locked: false, enrolled: false } }))).toBe('setup');
    expect(connectionMode(facts({}, { key: { present: true, wrapped: true, locked: true, enrolled: true } }))).toBe('setup');
    expect(connectionMode(facts())).toBe('direct');
  });
});

describe('D3: the direct way first, the helper offered, GlobalProtect beside it', () => {
  it('no bridge: the bundled helper for this computer, with Check again and Use GlobalProtect instead', () => {
    const f = facts({}, { bridge: 'none', helper: { state: 'not-installed' }, key: { present: false, wrapped: false, locked: false, enrolled: false }, download: { os: 'windows', osLabel: 'Windows', url: 'chrome-extension://id/bridge/beethoven-bridge-setup.cmd', file: 'beethoven-bridge-setup.cmd', size: '3 KB', kind: 'script' } });
    expect(momentOf(f)).toBe('install-helper');
    const v = J<'install-helper'>(f);
    expect(v.title).toBe(WORDS.direct.installHelper.title);
    expect(v.download).toMatchObject({ label: 'Download for Windows', url: 'chrome-extension://id/bridge/beethoven-bridge-setup.cmd', fileLine: 'beethoven-bridge-setup.cmd · 3 KB' });
    expect(v.steps).toEqual([...WORDS.direct.installHelper.steps.windows]);
    const named = J<'install-helper'>(facts({}, { bridge: 'none', download: { os: 'windows', osLabel: 'Windows', url: 'u', file: 'beethoven-bridge-windows.zip', open: 'install.cmd' } }));
    expect(named.steps[1]).toMatch(/double-click install\.cmd/);
    expect(v.checkAgain.action).toEqual({ kind: 'check-bridge' });
    expect(v.useVpn).toMatchObject({ label: 'Use GlobalProtect instead', action: { kind: 'use-vpn' } });
    expect(v.status.state).toBe('idle');
    // right after the download Beethoven looks by itself: waiting, not a failure, and Check again stays pressable
    expect(J<'install-helper'>(facts({}, { bridge: 'none', downloadedAt: NOW - 5_000 })).status.state).toBe('waiting');
    expect(J<'install-helper'>(facts({}, { bridge: 'none', downloadedAt: NOW - 5_000, probing: true })).checkAgain.busy).toBeUndefined();
    // "Not found yet" after the student's own Check again, or once the eager ten minutes are over
    expect(J<'install-helper'>(facts({}, { bridge: 'none', downloadedAt: NOW - 5_000, checkedByHand: true })).status.state).toBe('not-found');
    expect(J<'install-helper'>(facts({}, { bridge: 'none', downloadedAt: NOW - 11 * 60_000 })).status.state).toBe('not-found');
    expect(J<'install-helper'>(facts({}, { bridge: 'none', probing: true, probingByHand: true })).status.state).toBe('looking');
    expect(J<'install-helper'>(facts({}, { bridge: 'none', probing: true, probingByHand: true })).checkAgain.busy).toBe(true);
    expect(named.osNote).toMatch(/Unblock/);
    expect(J<'install-helper'>(facts({}, { bridge: 'none', helper: { state: 'broken' } })).status.state).toBe('broken');
  });

  it('"Helper found." holds a moment, then the sheet', () => {
    const d = { foundAt: NOW - 200, key: { present: false, wrapped: false, locked: false, enrolled: false } };
    expect(J<'install-helper'>(facts({}, d)).status.state).toBe('found');
    expect(momentOf(facts({}, { ...d, foundAt: NOW - 5_000 }))).toBe('sign-in-sheet');
  });

  it('a bridge and no enrolled key: the sheet asks for the AccessID, the protection offered unticked (off by default)', () => {
    const f = facts({}, { key: { present: false, wrapped: false, locked: false, enrolled: false }, account: undefined });
    expect(momentOf(f)).toBe('sign-in-sheet');
    const v = J<'sign-in-sheet'>(f);
    expect(v.phase).toBe('account');
    expect(v.account.label).toBe('AccessID');
    expect(v.privacy).toBe(WORDS.direct.signin.privacy);
    expect(v.protect).toMatchObject({ label: 'Protect my key with Windows Hello / Touch ID' });
    expect(v.useVpn?.action).toEqual({ kind: 'use-vpn' });
  });

  it("the grid's prompts verbatim, the code's hint, the refusal's notice, the work, three refusals", () => {
    const sheet = (s: Partial<NonNullable<DirectFacts['sheet']>>) => facts({}, { key: { present: true, wrapped: false, locked: false, enrolled: false }, sheet: { purpose: 'enrol', phase: 'prompt', account: 'st1234', answered: 0, refusals: 0, ...s } });
    const p = J<'sign-in-sheet'>(sheet({ prompts: [{ text: 'Your google authenticator one-time verification code: ', echo: false, kind: 'code' }], notAccepted: true }));
    expect(p.prompts).toEqual([{ text: 'Your google authenticator one-time verification code: ', echo: false, kind: 'code', hint: WORDS.direct.signin.codeHint }]);
    expect(p.notice).toBe('Not accepted. Try again.');
    expect(J<'sign-in-sheet'>(sheet({ phase: 'working', work: 'setting-up' })).status).toBe('Setting up this computer…');
    const stopped = J<'sign-in-sheet'>(sheet({ phase: 'stopped', refusals: 3 }));
    // GlobalProtect is the way on; Try again is the quiet second (after the cooldown: see below)
    expect(stopped.problem).toMatchObject({ title: "That didn't work three times.", button: { action: { kind: 'use-vpn' } } });
    expect(stopped.secondary).toMatchObject({ tone: 'text', action: { kind: 'grid-signin-retry' } });
    // the wrong grid: its own title, nothing sent, and a quiet Try again (the pin is checked again)
    const wrong = J<'sign-in-sheet'>(sheet({ phase: 'failed', failure: 'wrong-grid' }));
    expect(wrong.problem).toMatchObject({ title: WORDS.direct.signin.wrongGridTitle, body: WORDS.direct.signin.wrongGrid, button: { tone: 'text', action: { kind: 'grid-signin-retry' } } });
    expect(wrong.useVpn).toBeTruthy();
    expect(J<'sign-in-sheet'>(sheet({ phase: 'failed', failure: 'key-store' })).problem?.title).toBe(WORDS.direct.signin.keyStoreTitle);
    expect(J<'sign-in-sheet'>(sheet({ phase: 'failed', failure: 'key-refused', keyRefusal: 'your home folder can be written by others' })).problem?.body).toMatch(/your home folder can be written by others/);
  });

  it('the protected key, locked this browser session: Unlock', () => {
    const f = facts({ press: { kind: 'connect', at: new Date(NOW).toISOString() } }, { key: { present: true, wrapped: true, locked: true, enrolled: true } });
    expect(momentOf(f)).toBe('sign-in-sheet');
    expect(J<'sign-in-sheet'>(f)).toMatchObject({ phase: 'unlock', title: 'Unlock Beethoven' });
  });
});

describe("the grid's 2FA refusal: the route choice, and its two routes", () => {
  it("the grid's \"wrong code, or no 2FA\" refusal: the sheet asks which (type the code again first; the second time in a row, no code first)", () => {
    const once = facts({}, { key: { present: true, wrapped: false, locked: false, enrolled: false }, sheet: { purpose: 'enrol', phase: 'code-refused', account: 'st1234', answered: 0, refusals: 1, codeRefusals: 1 } });
    expect(momentOf(once)).toBe('sign-in-sheet');
    const v1 = J<'sign-in-sheet'>(once);
    expect(v1).toMatchObject({ phase: 'code-refused', problem: { title: "The grid didn't accept the code", button: { action: { kind: 'grid-signin-retry' } } }, secondary: { action: { kind: 'no-grid-code' }, tone: 'text' } });
    expect(v1.problem!.body).toMatch(/mistyped/);
    const twice = facts({}, { key: { present: true, wrapped: false, locked: false, enrolled: false }, sheet: { purpose: 'enrol', phase: 'code-refused', account: 'st1234', answered: 0, refusals: 2, codeRefusals: 2 } });
    expect(J<'sign-in-sheet'>(twice)).toMatchObject({ problem: { button: { action: { kind: 'no-grid-code' } } }, secondary: { action: { kind: 'grid-signin-retry' } } });
  });

  it("three refusals: GlobalProtect first; Try again waits out the cooldown", () => {
    const f = facts({}, { key: { present: true, wrapped: false, locked: false, enrolled: false }, sheet: { purpose: 'enrol', phase: 'stopped', account: 'st1234', answered: 0, refusals: 3, retryAt: NOW + 10 * 60_000 } });
    const v = J<'sign-in-sheet'>(f);
    expect(v.problem!.button!.action).toEqual({ kind: 'use-vpn' });
    expect(v.secondary).toMatchObject({ disabled: true });
    expect(v.secondary!.label).toMatch(/^Try again at /);
    const later = facts({ now: NOW + 11 * 60_000 }, { key: { present: true, wrapped: false, locked: false, enrolled: false }, sheet: { purpose: 'enrol', phase: 'stopped', account: 'st1234', answered: 0, refusals: 3, retryAt: NOW + 10 * 60_000 } });
    expect(J<'sign-in-sheet'>(later).secondary).toMatchObject({ label: 'Try again', action: { kind: 'grid-signin-retry' } });
  });

  it('no code yet (the student said so): the route choice with the 2FA Setup warning', () => {
    const f = facts({}, { key: { present: true, wrapped: false, locked: false, enrolled: false }, route: 'choose' });
    expect(momentOf(f)).toBe('choose-route');
    const v = J<'choose-route'>(f);
    expect(v.options.map((o) => o.button.action)).toEqual([
      { kind: 'choose-route', route: 'laptop' },
      { kind: 'choose-route', route: 'phone' },
    ]);
    expect(v.warning).toMatch(/Don't run 2FA Setup/);
  });

  it('the phone route: the GlobalProtect app (App Store, Google Play), Google Authenticator in both stores, the grid code page (KB 20242), each drawn as a square code', () => {
    const v = J<'code-setup'>(facts({}, { route: 'phone' }));
    expect(v.route).toBe('phone');
    expect(v.qr.map((q) => q.url)).toEqual([DIRECT_LINKS.globalProtectIos, DIRECT_LINKS.globalProtectAndroid, DIRECT_LINKS.authenticatorIos, DIRECT_LINKS.authenticatorAndroid, DIRECT_LINKS.gridCode]);
    // GlobalProtect by Palo Alto Networks (iTunes lookup, 2026-10-02); id1135985407 was a dead page
    expect(DIRECT_LINKS.globalProtectIos).toBe('https://apps.apple.com/app/globalprotect/id1400555706');
    expect(DIRECT_LINKS.gridCode).toBe('https://services.wayne.edu/TDClient/277/Portal/KB/Article/20242/How-do-I-set-up-and-use-Google-Authenticator-for-the-Grid');
    expect(v.steps.join(' ')).toMatch(/Enter a setup key/);
    expect(v.steps.join(' ')).toMatch(/protect\.wayne\.edu/);
    expect(v.steps.join(' ')).toMatch(/Microsoft Authenticator/);
    expect(v.steps.join(' ')).toMatch(/Launch 2FA Setup/);
    expect(v.done.action).toEqual({ kind: 'grid-signin-retry' });
    expect(v.warning).toMatch(/replaces your code/);
  });

  it("the laptop route: the grid's own page and site", () => {
    const v = J<'code-setup'>(facts({}, { route: 'laptop' }));
    expect(v.qr.map((q) => q.id)).toEqual(['grid-code', 'authenticator-ios', 'authenticator-android', 'grid-site']);
    expect(v.back.action).toEqual({ kind: 'route-back' });
  });
});

describe('after the sign-in', () => {
  it('"This computer is set up." until Continue, then the optional protection once, then the 11.0.0 moments', () => {
    const d = { enrolledAt: NOW - 1_000, enrolledSeen: false, protectOffer: true };
    expect(momentOf(facts({}, d))).toBe('enrolled');
    expect(J<'enrolled'>(facts({}, d)).continue.action).toEqual({ kind: 'grid-signin-continue' });
    const after = { ...d, enrolledSeen: true };
    expect(momentOf(facts({}, after))).toBe('protect-key-optional');
    const pk = J<'protect-key-optional'>(facts({}, after));
    expect(pk.notNow.action).toEqual({ kind: 'protect-key-later' });
    expect(pk.on.label).toBe('Turn on');
    expect(momentOf(facts({}, { ...after, protectOffer: false }))).toBe('statement');
  });

  it('the home: the Grid row says Direct, or Through GlobalProtect, and Locked when the protected key waits', () => {
    const once = { first_online_at: new Date(NOW - 3_600_000).toISOString() };
    const dh = home(facts({ once }));
    expect(dh.rows.grid.via).toEqual({ mode: 'direct', text: 'Direct' });
    expect(home(facts({ once }, { pref: 'vpn' })).rows.grid.via).toEqual({ mode: 'vpn', text: 'Through GlobalProtect' });
    expect(home(facts({ once }, { key: { present: true, wrapped: true, locked: true, enrolled: true } })).rows.grid.via?.locked).toEqual({ text: 'Locked', unlock: 'Unlock' });
    expect(home(facts({ once }, null)).rows.grid.via).toBeUndefined();
  });

  it('the direct way cannot reach the grid: the fallback once, then the 11.0.0 moments', () => {
    const f = facts({ grid: { reach: 'answers', session: 'unreachable' } }, { unreachable: true });
    expect(momentOf(f)).toBe('fallback-to-vpn');
    const v = J<'fallback-to-vpn'>(f);
    expect(v.title).toBe('Using GlobalProtect');
    expect(v.continue.action).toEqual({ kind: 'fallback-continue' });
    expect(v.tryDirect.action).toEqual({ kind: 'try-direct' });
    expect(momentOf(facts({ grid: { reach: 'no-route', session: 'unreachable' } }, { unreachable: true, fallbackSeen: true }))).toBe('globalprotect');
  });

  it('on the direct way the portal sign-in box never appears: a lapsed key brings the sheet', () => {
    expect(momentOf(facts({ grid: { reach: 'answers', session: 'unknown' } }))).toBe('sign-in-sheet');
    expect(J<'sign-in-sheet'>(facts({ grid: { reach: 'answers', session: 'unknown' } })).phase).toBe('connecting');
  });

  it('after the first run, a press with no key waits on the sheet; without a press the home stays', () => {
    const once = { first_online_at: new Date(NOW - 3_600_000).toISOString() };
    const noKey = { key: { present: false, wrapped: false, locked: false, enrolled: false } };
    expect(panelView(facts({ once }, noKey)).kind).toBe('home');
    const pv = panelView(facts({ once, press: { kind: 'connect', at: new Date(NOW).toISOString() } }, noKey));
    expect(pv.kind === 'journey' && pv.journey.moment).toBe('sign-in-sheet');
    expect(directMoment(facts({ once }, { ...noKey, sheetWanted: true }), false)).toBe('sign-in-sheet');
  });
});

describe('the 11.0.0 way, unchanged', () => {
  it('without direct facts the first run is GlobalProtect, then the portal sign-in', () => {
    expect(momentOf(facts({ grid: { reach: 'no-route', session: 'unreachable' } }, null))).toBe('globalprotect');
    expect(momentOf(facts({ grid: { reach: 'answers', session: 'signed-out' } }, null))).toBe('grid');
    expect(momentOf(facts({ grid: { reach: 'answers', session: 'signed-out' } }, { pref: 'vpn' }))).toBe('grid');
  });
});
