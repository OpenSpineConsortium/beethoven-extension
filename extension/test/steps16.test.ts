// 16.0.0, the one way: a press made while the grid is out of reach is not refused and not forgotten. The
// journey shows GlobalProtect with the line that says the press carries on by itself, and the university's
// own page about its VPN is a link under the body whenever the site profile names one. The rest of the
// GlobalProtect moment is 11.0.0's, in steps.test.ts.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../src/core/keys';
import { WORDS } from '../src/core/model';
import { journey, momentOf, type Facts, type RunFacts } from '../src/core/steps';
import { accessFact, type AccessRecord } from '../src/licensing/access';

const NOW = Date.parse('2026-10-01T13:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const ORIGIN = 'https://ondemand.grid.wayne.edu';
const HOST = 'ondemand.grid.wayne.edu';
const HELP = 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client';

const record = (): AccessRecord => ({ v: 1, access_id: 'st1234', portal: HOST, approved: true, checked_at: ago(60 * MIN), until: null, last_attempt_at: ago(60 * MIN) });
const NO_RUN: RunFacts = { present: false, phase: 'none', live: false, stale: false, renewal: false, chain: true, reason: 'line', pressed: false };

type Over = Partial<Omit<Facts, 'grid' | 'site'>> & { grid?: Partial<Facts['grid']>; site?: Partial<Facts['site']> };

/** a returning student, set up and approved, whose grid has stopped answering (the VPN dropped) */
function facts(o: Over = {}): Facts {
  const base: Facts = {
    now: NOW,
    terms: true,
    portal: { origin: ORIGIN, hostname: HOST, site: 'wayne' },
    granted: true,
    site: { vpnApp: 'GlobalProtect', vpnPortal: 'protect.wayne.edu', vpnHelpUrl: HELP, title: 'Wayne State grid', hours: 8 },
    grid: { reach: 'no-route', session: 'unknown', lookingSince: NOW - 5_000 },
    signin: { waiting: false },
    channel: { origin: ORIGIN, mode: 'tab', shell: 'ok', tested_at: ago(MIN) },
    access: accessFact({ record: record(), accessId: 'st1234', portal: HOST, now: new Date(NOW) }),
    setup: { state: 'ready' },
    statement: { inForce: true, workerName: 'worker' },
    connect: { inFlight: false, queued: false, signin: 'none' },
    run: NO_RUN,
    waits: [],
    once: { first_online_at: ago(60 * MIN) },
    prefs: DEFAULT_PREFS,
    stopping: false,
    workingInTab: false,
  };
  return { ...base, ...o, grid: { ...base.grid, ...(o.grid ?? {}) }, site: { ...base.site, ...(o.site ?? {}) } };
}

const gp = (f: Facts) => {
  const j = journey(f);
  if (j.moment !== 'globalprotect') throw new Error(`moment ${j.moment}`);
  return j;
};

describe('a press while the grid is out of reach', () => {
  it('waits on GlobalProtect, says so under the status, and carries on with the moment\'s own words', () => {
    const f = facts({ press: { kind: 'connect', at: ago(1_000) } });
    expect(momentOf(f)).toBe('globalprotect');
    const m = gp(f);
    expect(m.title).toBe('Turn on GlobalProtect.');
    expect(m.status.state).toBe('looking');
    expect(m.note).toBe(WORDS.globalprotect.pressWaits);
    // the same when the portal answers nothing at all
    expect(gp(facts({ press: { kind: 'connect', at: ago(1_000) }, grid: { reach: 'answers', session: 'unreachable' } })).note).toBe(WORDS.globalprotect.pressWaits);
  });

  it('shows no such line without a press, and none on a first run (the press cannot be made before the grid sign-in)', () => {
    expect(gp(facts()).note).toBeUndefined();
    expect(gp(facts({ once: {}, press: { kind: 'connect', at: ago(1_000) } })).note).toBeUndefined();
  });

  it('shows no such line once the grid answers: the moment holds "Connected." and the press goes on', () => {
    const m = gp(facts({ press: { kind: 'connect', at: ago(1_000) }, grid: { reach: 'answers', session: 'signed-out', answeredAt: NOW - 300 } }));
    expect(m.status.state).toBe('connected');
    expect(m.note).toBeUndefined();
  });
});

describe("the university's own page about its VPN", () => {
  it('is a link under the body when the site profile names one', () => {
    expect(gp(facts()).help).toEqual({ label: WORDS.globalprotect.help, url: HELP });
  });

  it('is absent when the profile names none (and under D20, with no profile at all)', () => {
    expect(gp(facts({ site: { vpnHelpUrl: undefined } })).help).toBeUndefined();
    const none = gp(facts({ site: { vpnApp: undefined, vpnPortal: undefined, vpnHelpUrl: undefined } }));
    expect(none.title).toBe('Turn on your VPN.');
    expect(none.help).toBeUndefined();
  });
});
