// Beethoven's own grid sign-in (19.0.0), the decision half: an onAuthRequired event is answered only
// for Beethoven's own background GET of the dashboard inside checkGrid's armed window, HTTP Basic from
// the portal itself, once per window (I2); a challenge that comes back for a request already given the
// password is cancelled, and a refusal stops the source it stops until the student types again (I1).
// Every reason is checked alone and in the specification's order, where two apply at once.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DASHBOARD } from '../src/core/portal';
import {
  ACCESS_ID,
  authVerdict,
  ONCE_MS,
  onceExpired,
  portOf,
  unlockWord,
  type AuthContext,
  type AuthDetails,
  type AuthPassWhy,
  type AuthVerdict,
} from '../src/core/gridsignin';

const PORTAL = 'https://ondemand.grid.wayne.edu';
const EXT = 'chrome-extension://ext';
const ARMED_URL = PORTAL + DASHBOARD;

/** Beethoven's own dashboard GET, challenged by the portal: the one event that is answered */
function details(over: Partial<AuthDetails> = {}): AuthDetails {
  return {
    requestId: 'r1',
    url: ARMED_URL,
    tabId: -1,
    initiator: EXT,
    isProxy: false,
    scheme: 'basic',
    realm: 'private',
    challenger: { host: 'ondemand.grid.wayne.edu', port: 443 },
    ...over,
  };
}

/** an armed window for a saved sign-in, nothing sent, nothing refused, the realm recorded */
function context(over: Partial<AuthContext> = {}): AuthContext {
  return {
    extOrigin: EXT,
    portalOrigin: PORTAL,
    armed: { url: ARMED_URL, source: 'saved' },
    sent: new Set<string>(),
    refusedOnce: false,
    refusedSaved: false,
    realm: 'private',
    ...over,
  };
}

const pass = (why: AuthPassWhy): AuthVerdict => ({ act: 'pass', why });
const ANSWER_SAVED: AuthVerdict = { act: 'answer', source: 'saved' };
const ANSWER_ONCE: AuthVerdict = { act: 'answer', source: 'once' };
const CANCEL: AuthVerdict = { act: 'cancel', why: 'repeat' };

describe('authVerdict: the one answer', () => {
  it("answers Beethoven's own dashboard GET in the armed window, with the armed source", () => {
    expect(authVerdict(details(), context())).toEqual(ANSWER_SAVED);
    expect(authVerdict(details(), context({ armed: { url: ARMED_URL, source: 'once' } }))).toEqual(ANSWER_ONCE);
  });

  it('the query and fragment of the address do not matter; the path does, to the last slash', () => {
    expect(authVerdict(details({ url: `${ARMED_URL}?x=1` }), context())).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ url: `${ARMED_URL}#top` }), context())).toEqual(ANSWER_SAVED);
    expect(authVerdict(details(), context({ armed: { url: `${ARMED_URL}?y=2`, source: 'saved' } }))).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ url: PORTAL + DASHBOARD.replace(/\/$/, '') }), context())).toEqual(pass('not-armed'));
  });

  it('the scheme is compared in lower case; a challenge with no challenger named is not refused for it', () => {
    expect(authVerdict(details({ scheme: 'Basic' }), context())).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ scheme: 'BASIC' }), context())).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ challenger: undefined }), context())).toEqual(ANSWER_SAVED);
  });

  it("the portal's origin is compared as an origin: case, a trailing slash or the default port written out change nothing", () => {
    expect(authVerdict(details(), context({ portalOrigin: `${PORTAL}/` }))).toEqual(ANSWER_SAVED);
    expect(authVerdict(details(), context({ portalOrigin: 'https://OnDemand.Grid.Wayne.Edu:443' }))).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ challenger: { host: 'OnDemand.Grid.Wayne.Edu', port: 443 } }), context())).toEqual(ANSWER_SAVED);
  });

  it('with no realm recorded yet (the first sign-in), any realm is answered', () => {
    expect(authVerdict(details({ realm: 'anything' }), context({ realm: undefined }))).toEqual(ANSWER_SAVED);
    expect(authVerdict(details({ realm: undefined }), context({ realm: undefined }))).toEqual(ANSWER_SAVED);
  });

  it('the pending request itself is not held back as unsettled', () => {
    expect(authVerdict(details(), context({ pending: 'r1' }))).toEqual(ANSWER_SAVED);
  });
});

describe('authVerdict: each reason alone', () => {
  it("tab: a tab's challenge is left to Chrome's own box, whatever else it carries", () => {
    expect(authVerdict(details({ tabId: 7 }), context())).toEqual(pass('tab'));
    expect(authVerdict(details({ tabId: 0 }), context())).toEqual(pass('tab'));
    expect(authVerdict(details({ tabId: 7, initiator: PORTAL }), context())).toEqual(pass('tab'));
  });

  it('initiator: tabId -1 with no initiator is not Beethoven, nor another extension, nor a page', () => {
    expect(authVerdict(details({ initiator: undefined }), context())).toEqual(pass('initiator'));
    expect(authVerdict(details({ initiator: 'chrome-extension://another' }), context())).toEqual(pass('initiator'));
    expect(authVerdict(details({ initiator: PORTAL }), context())).toEqual(pass('initiator'));
    expect(authVerdict(details({ initiator: `${EXT}/` }), context())).toEqual(pass('initiator'));
    // an empty origin on both sides is still no initiator
    expect(authVerdict(details({ initiator: '' }), context({ extOrigin: '' }))).toEqual(pass('initiator'));
  });

  it('proxy: a proxy asking for a password never gets the grid one', () => {
    expect(authVerdict(details({ isProxy: true }), context())).toEqual(pass('proxy'));
  });

  it('scheme: only Basic', () => {
    expect(authVerdict(details({ scheme: 'digest' }), context())).toEqual(pass('scheme'));
    expect(authVerdict(details({ scheme: 'negotiate' }), context())).toEqual(pass('scheme'));
    expect(authVerdict(details({ scheme: 'ntlm' }), context())).toEqual(pass('scheme'));
    expect(authVerdict(details({ scheme: undefined }), context())).toEqual(pass('scheme'));
    expect(authVerdict(details({ scheme: '' }), context())).toEqual(pass('scheme'));
  });

  it('origin: no portal known, another origin, another port or scheme, a look-alike host, or an address that cannot be read', () => {
    expect(authVerdict(details(), context({ portalOrigin: undefined }))).toEqual(pass('origin'));
    expect(authVerdict(details(), context({ portalOrigin: '' }))).toEqual(pass('origin'));
    expect(authVerdict(details(), context({ portalOrigin: 'not a url' }))).toEqual(pass('origin'));
    expect(authVerdict(details({ url: `https://mail.wayne.edu${DASHBOARD}` }), context())).toEqual(pass('origin'));
    expect(authVerdict(details({ url: `https://ondemand.grid.wayne.edu.example${DASHBOARD}` }), context())).toEqual(pass('origin'));
    expect(authVerdict(details({ url: `https://ondemand.grid.wayne.edu:8443${DASHBOARD}` }), context())).toEqual(pass('origin'));
    expect(authVerdict(details({ url: `http://ondemand.grid.wayne.edu${DASHBOARD}` }), context())).toEqual(pass('origin'));
    expect(authVerdict(details({ url: 'not a url' }), context())).toEqual(pass('origin'));
    // an origin with no host (its origin reads 'null') never matches another such
    expect(authVerdict(details({ url: 'data:text/plain,x' }), context({ portalOrigin: 'data:text/plain,y' }))).toEqual(pass('origin'));
  });

  it("challenger: the challenge must come from the portal's host and port", () => {
    expect(authVerdict(details({ challenger: { host: 'proxy.wayne.edu', port: 443 } }), context())).toEqual(pass('challenger'));
    expect(authVerdict(details({ challenger: { host: 'ondemand.grid.wayne.edu', port: 8443 } }), context())).toEqual(pass('challenger'));
    expect(authVerdict(details({ challenger: { host: 'ondemand.grid.wayne.edu', port: 80 } }), context())).toEqual(pass('challenger'));
  });

  it('challenger: an http portal (the dev build) defaults to port 80, an explicit port is its own', () => {
    const local = 'http://localhost';
    const at = (origin: string, port: number, host = 'localhost') =>
      authVerdict(
        details({ url: origin + DASHBOARD, challenger: { host, port } }),
        context({ portalOrigin: origin, armed: { url: origin + DASHBOARD, source: 'once' } }),
      );
    expect(at(local, 80)).toEqual(ANSWER_ONCE);
    expect(at(local, 443)).toEqual(pass('challenger'));
    expect(at('http://127.0.0.1:8080', 8080, '127.0.0.1')).toEqual(ANSWER_ONCE);
    expect(at('http://127.0.0.1:8080', 80, '127.0.0.1')).toEqual(pass('challenger'));
    expect(at('http://[::1]:8080', 8080, '::1')).toEqual(ANSWER_ONCE);
    expect(at('http://[::1]:8080', 8080, '[::1]')).toEqual(ANSWER_ONCE);
  });

  it('repeat: a challenge for a request already given the password is the grid turning it down, and is cancelled', () => {
    expect(authVerdict(details(), context({ sent: new Set(['r0', 'r1']) }))).toEqual(CANCEL);
    // wherever the window now stands: disarmed, answered, refused or held
    expect(authVerdict(details(), context({ sent: new Set(['r1']), armed: undefined }))).toEqual(CANCEL);
    expect(authVerdict(details(), context({ sent: new Set(['r1']), armed: { url: ARMED_URL, answered: 'r1', source: 'saved' } }))).toEqual(CANCEL);
    expect(authVerdict(details(), context({ sent: new Set(['r1']), refusedOnce: true, refusedSaved: true }))).toEqual(CANCEL);
    expect(authVerdict(details(), context({ sent: new Set(['r1']), pending: 'r1' }))).toEqual(CANCEL);
    // another request of the same window is not a repeat
    expect(authVerdict(details({ requestId: 'r2' }), context({ sent: new Set(['r1']) }))).toEqual(ANSWER_SAVED);
  });

  it("not-armed: outside checkGrid's window, or another address on the portal", () => {
    expect(authVerdict(details(), context({ armed: undefined }))).toEqual(pass('not-armed'));
    expect(authVerdict(details({ url: `${PORTAL}/pun/sys/dashboard/files/fs/home` }), context())).toEqual(pass('not-armed'));
    expect(authVerdict(details({ url: `${PORTAL}/pun/sys/shell/ssh/default` }), context())).toEqual(pass('not-armed'));
    expect(authVerdict(details({ url: `${PORTAL}/` }), context())).toEqual(pass('not-armed'));
    expect(authVerdict(details(), context({ armed: { url: 'not a url', source: 'saved' } }))).toEqual(pass('not-armed'));
    expect(authVerdict(details(), context({ armed: { url: '', source: 'saved' } }))).toEqual(pass('not-armed'));
  });

  it('armed-once: one answer per armed window, also when that answer found no password to send', () => {
    expect(authVerdict(details({ requestId: 'r2' }), context({ armed: { url: ARMED_URL, answered: 'r1', source: 'saved' } }))).toEqual(pass('armed-once'));
    expect(authVerdict(details(), context({ armed: { url: ARMED_URL, answered: 'r1', source: 'once' } }))).toEqual(pass('armed-once'));
  });

  it('unsettled: while an earlier answer has no outcome, another request gets nothing', () => {
    expect(authVerdict(details({ requestId: 'r2' }), context({ pending: 'r1' }))).toEqual(pass('unsettled'));
  });

  it('refused, split by source: a typing is stopped by a refusal of this session only; a saved one also by its note', () => {
    const once = { url: ARMED_URL, source: 'once' as const };
    const saved = { url: ARMED_URL, source: 'saved' as const };
    // SigninState.refused set: both flags
    expect(authVerdict(details(), context({ armed: once, refusedOnce: true, refusedSaved: true }))).toEqual(pass('refused'));
    expect(authVerdict(details(), context({ armed: saved, refusedOnce: true, refusedSaved: true }))).toEqual(pass('refused'));
    // only the note's refused_at (after a browser restart): the saved password stays stopped, a new typing goes
    expect(authVerdict(details(), context({ armed: saved, refusedSaved: true }))).toEqual(pass('refused'));
    expect(authVerdict(details(), context({ armed: once, refusedSaved: true }))).toEqual(ANSWER_ONCE);
    // each source reads its own flag and no other
    expect(authVerdict(details(), context({ armed: saved, refusedOnce: true }))).toEqual(ANSWER_SAVED);
    expect(authVerdict(details(), context({ armed: once, refusedOnce: true }))).toEqual(pass('refused'));
  });

  it('realm: once a realm is recorded, another one, or none, is not answered (case counts)', () => {
    expect(authVerdict(details({ realm: 'another' }), context())).toEqual(pass('realm'));
    expect(authVerdict(details({ realm: undefined }), context())).toEqual(pass('realm'));
    expect(authVerdict(details({ realm: 'Private' }), context())).toEqual(pass('realm'));
    expect(authVerdict(details({ realm: '' }), context())).toEqual(pass('realm'));
  });
});

describe('authVerdict: the order, where two reasons apply', () => {
  // everything wrong at once; mending one thing at a time in the specification's order shows the next reason
  it('each reason wins over every later one', () => {
    const d = details({
      requestId: 'r1',
      tabId: 3,
      initiator: undefined,
      isProxy: true,
      scheme: 'digest',
      url: `https://mail.wayne.edu${DASHBOARD}`,
      challenger: { host: 'proxy.wayne.edu', port: 3128 },
      realm: 'another',
    });
    const c = context({
      portalOrigin: undefined,
      sent: new Set(['r1']),
      armed: undefined,
      pending: 'r0',
      refusedOnce: true,
      refusedSaved: true,
      realm: 'private',
    });
    const steps: Array<[AuthVerdict, () => void]> = [
      [pass('tab'), () => (d.tabId = -1)],
      [pass('initiator'), () => (d.initiator = EXT)],
      [pass('proxy'), () => (d.isProxy = false)],
      [pass('scheme'), () => (d.scheme = 'basic')],
      [pass('origin'), () => (c.portalOrigin = PORTAL)],
      [pass('origin'), () => (d.url = `${ARMED_URL}?x=1`)],
      [pass('challenger'), () => (d.challenger = { host: 'ondemand.grid.wayne.edu', port: 443 })],
      [CANCEL, () => (c.sent = new Set(['r0']))],
      [pass('not-armed'), () => (c.armed = { url: ARMED_URL, answered: 'r0', source: 'saved' })],
      [pass('armed-once'), () => (c.armed = { url: ARMED_URL, source: 'saved' })],
      [pass('unsettled'), () => (c.pending = undefined)],
      [pass('refused'), () => ((c.refusedOnce = false), (c.refusedSaved = false))],
      [pass('realm'), () => (d.realm = 'private')],
      [ANSWER_SAVED, () => undefined],
    ];
    for (const [want, mend] of steps) {
      expect(authVerdict(d, c)).toEqual(want);
      mend();
    }
  });

  it('pairs that matter on their own', () => {
    // a repeat from a challenger that is not the portal is passed, not counted as a refusal
    expect(authVerdict(details({ challenger: { host: 'proxy.wayne.edu', port: 443 } }), context({ sent: new Set(['r1']) }))).toEqual(pass('challenger'));
    // a tab's repeat is Chrome's affair
    expect(authVerdict(details({ tabId: 4 }), context({ sent: new Set(['r1']) }))).toEqual(pass('tab'));
    // a request outside the window is not-armed even while a refusal stands
    expect(authVerdict(details(), context({ armed: undefined, refusedSaved: true }))).toEqual(pass('not-armed'));
    // a second request of an answered window is armed-once, before unsettled
    expect(authVerdict(details({ requestId: 'r2' }), context({ armed: { url: ARMED_URL, answered: 'r1', source: 'saved' }, pending: 'r1' }))).toEqual(pass('armed-once'));
    // unsettled before refused, refused before realm
    expect(authVerdict(details({ requestId: 'r2' }), context({ pending: 'r1', refusedSaved: true }))).toEqual(pass('unsettled'));
    expect(authVerdict(details({ realm: 'another' }), context({ refusedSaved: true }))).toEqual(pass('refused'));
    // a proxy that also asks with another scheme: proxy
    expect(authVerdict(details({ isProxy: true, scheme: 'negotiate' }), context())).toEqual(pass('proxy'));
    // tabId -1 with no initiator, and everything else wrong too: initiator
    expect(authVerdict(details({ initiator: undefined, isProxy: true }), context({ portalOrigin: undefined }))).toEqual(pass('initiator'));
  });

  it('decides without changing what it is given', () => {
    const d = details();
    const c = context({ sent: new Set(['r0']), pending: 'r1' });
    const before = JSON.stringify({ d, c, sent: [...c.sent] });
    authVerdict(d, c);
    expect(JSON.stringify({ d, c, sent: [...c.sent] })).toBe(before);
  });
});

describe('portOf', () => {
  it("an origin's own port, else 443 for https: and 80 for http:; nothing that matches a port otherwise", () => {
    expect(portOf(PORTAL)).toBe(443);
    expect(portOf(`${PORTAL}:443`)).toBe(443);
    expect(portOf(`${PORTAL}:8443`)).toBe(8443);
    expect(portOf('http://localhost')).toBe(80);
    expect(portOf('http://localhost:80')).toBe(80);
    expect(portOf('http://127.0.0.1:8080')).toBe(8080);
    expect(portOf('not a url')).toBeNaN();
    expect(portOf('')).toBeNaN();
    expect(portOf('ftp://files.example')).toBeNaN();
  });
});

describe('unlockWord', () => {
  it("names the computer's own unlock", () => {
    expect(unlockWord('win')).toBe('Windows Hello');
    expect(unlockWord('mac')).toBe('Touch ID');
    for (const os of ['linux', 'cros', 'android', 'openbsd', 'fuchsia', '']) expect(unlockWord(os)).toBe('your screen lock');
  });
});

describe('onceExpired', () => {
  const now = Date.parse('2026-10-09T12:00:00.000Z');
  const at = (ms: number) => new Date(now + ms).toISOString();

  it('two minutes', () => {
    expect(ONCE_MS).toBe(120_000);
  });

  it('fresh until two minutes have passed; at two minutes it is expired, so the alarm set for then removes it', () => {
    expect(onceExpired(at(0), now)).toBe(false);
    expect(onceExpired(at(-1_000), now)).toBe(false);
    expect(onceExpired(at(-ONCE_MS + 1), now)).toBe(false);
    expect(onceExpired(at(-ONCE_MS), now)).toBe(true);
    expect(onceExpired(at(-3 * 60_000), now)).toBe(true);
    expect(onceExpired(at(-24 * 3600_000), now)).toBe(true);
  });

  it('a stamp that cannot be read is expired', () => {
    for (const s of ['', 'soon', 'not a date', 'NaN']) expect(onceExpired(s, now)).toBe(true);
  });

  it('a stamp far ahead of the clock is expired; a little ahead (the clock moved) is not', () => {
    expect(onceExpired(at(5_000), now)).toBe(false);
    expect(onceExpired(at(ONCE_MS), now)).toBe(true);
    expect(onceExpired(at(3600_000), now)).toBe(true);
  });
});

describe('ACCESS_ID', () => {
  it("takes the dashboard's own characters, one to 64 of them", () => {
    for (const s of ['st1234', 'ab1234', 'go2432', 'first.last', 'first.last@wayne.edu', 'a_b-c', 'A', 'x'.repeat(64)]) {
      expect(ACCESS_ID.test(s), s).toBe(true);
    }
  });

  it('refuses an empty name, a long one, spaces, a line break, a colon (it would end the user name in the answer) and anything else', () => {
    for (const s of ['', 'x'.repeat(65), 'st 1234', ' st1234', 'st1234 ', 'st1234\n', '\nst1234', 'st:1234', 'st1234:pw', 'st/1234', 'st\\1234', 'ünï', 'st1234;', '<b>']) {
      expect(ACCESS_ID.test(s), JSON.stringify(s)).toBe(false);
    }
  });

  it('holds no state between tests (no global flag)', () => {
    expect(ACCESS_ID.flags).toBe('');
  });
});

describe('the module', () => {
  it('is pure: it imports nothing and reaches no browser, storage, network or page', () => {
    const src = readFileSync(new URL('../src/core/gridsignin.ts', import.meta.url), 'utf8');
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l))
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
    expect(/^\s*import\b/m.test(code)).toBe(false);
    expect(/\b(?:browser|chrome|navigator|indexedDB|localStorage|sessionStorage|document|window|globalThis|self|crypto)\s*[.[(]/.test(code)).toBe(false);
    expect(/\b(?:fetch|setTimeout|setInterval|Math\.random|Date\.now)\s*\(/.test(code)).toBe(false);
    expect(/\bnew Date\s*\(\s*\)/.test(code)).toBe(false);
  });
});
