// Beethoven's own grid sign-in (19.0.0), the decision half: whether one webRequest.onAuthRequired event
// gets the password the student gave Beethoven, is left to Chrome, or is cancelled. It is pure and
// reads nothing, because the listener must decide in its first synchronous turn from memory only: two
// challenges raised in the same task must not both find the armed window unanswered (I1).
//
// The only challenge answered (I2) is HTTP Basic, from the portal itself, on Beethoven's own background
// GET of the dashboard inside checkGrid's armed window, once per window. A tab's challenge is left to
// Chrome's own box, and a proxy, another extension, another origin, host, port or realm, the reach
// probe (it sends no credentials, so it is never challenged) and any other request get nothing. A
// challenge that comes back for a request Beethoven already gave the password to is the grid turning
// it down: it is cancelled, and the refusal stops every automatic sign-in until the student types the
// password again (I1).

/** what onAuthRequired says of the request (Chrome's own fields, by the same names) */
export interface AuthDetails {
  requestId: string;
  url: string;
  tabId: number;
  initiator?: string;
  isProxy: boolean;
  scheme?: string;
  realm?: string;
  challenger?: { host: string; port: number };
}

/** what the background holds in memory when the event arrives */
export interface AuthContext {
  /** `chrome-extension://<id>`, built from the id, never through URL (its origin is 'null' outside Chrome) */
  extOrigin: string;
  portalOrigin?: string;
  armed?: { url: string; answered?: string; source: 'once' | 'saved' };
  /** requestIds Beethoven gave the password to */
  sent: ReadonlySet<string>;
  /** requestId of an unsettled answer */
  pending?: string;
  /** SigninState.refused is set */
  refusedOnce: boolean;
  /** SigninState.refused is set, the note has refused_at or stopped_at, or SigninState.held covers the note's seal */
  refusedSaved: boolean;
  realm?: string;
}

export type AuthPassWhy =
  | 'tab'
  | 'initiator'
  | 'proxy'
  | 'scheme'
  | 'origin'
  | 'challenger'
  | 'not-armed'
  | 'armed-once'
  | 'unsettled'
  | 'refused'
  | 'realm';

export type AuthVerdict = { act: 'answer'; source: 'once' | 'saved' } | { act: 'cancel'; why: 'repeat' } | { act: 'pass'; why: AuthPassWhy };

/** a one-shot (a password typed without Remember) is used within this long, and removed after it */
export const ONCE_MS = 120_000;

/** an AccessID as the dashboard shows one; a colon, which would end the user name in a Basic answer, is not in it */
export const ACCESS_ID = /^[A-Za-z0-9._@-]{1,64}$/;

function webUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : undefined;
  } catch {
    return undefined;
  }
}

/** the address without its query or fragment */
function bare(url: string): string | undefined {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return undefined;
  }
}

/** an IPv6 host may be written with or without its brackets */
function sameHost(a: string, b: string): boolean {
  const plain = (h: string) => h.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  return plain(a) === plain(b);
}

/** the port an origin is reached on: its own, else 443 for https: and 80 for http:; NaN (equal to no port) for anything else */
export function portOf(origin: string): number {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return NaN;
  }
  if (u.port) return Number(u.port);
  if (u.protocol === 'https:') return 443;
  if (u.protocol === 'http:') return 80;
  return NaN;
}

/** the passkey's unlock, named as the student knows it */
export function unlockWord(os: string): string {
  if (os === 'win') return 'Windows Hello';
  if (os === 'mac') return 'Touch ID';
  return 'your screen lock';
}

/**
 * Is a one-shot stamped `at` past its use? At ONCE_MS old it is, so the alarm set for that moment always
 * finds it expired (I5); so is a stamp that cannot be read, or one more than ONCE_MS ahead of the clock,
 * which would otherwise live as long as the clock is wrong.
 */
export function onceExpired(at: string, now: number): boolean {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return true;
  return Math.abs(now - t) >= ONCE_MS;
}

/** the verdict, in the order of the specification; the first reason that applies wins */
export function authVerdict(d: AuthDetails, c: AuthContext): AuthVerdict {
  if (d.tabId !== -1) return { act: 'pass', why: 'tab' };
  if (!d.initiator || d.initiator !== c.extOrigin) return { act: 'pass', why: 'initiator' };
  if (d.isProxy) return { act: 'pass', why: 'proxy' };
  if ((d.scheme ?? '').toLowerCase() !== 'basic') return { act: 'pass', why: 'scheme' };
  const portal = webUrl(c.portalOrigin);
  const url = webUrl(d.url);
  if (!portal || !url || url.origin !== portal.origin) return { act: 'pass', why: 'origin' };
  if (d.challenger && !(sameHost(d.challenger.host, portal.hostname) && d.challenger.port === portOf(portal.origin))) {
    return { act: 'pass', why: 'challenger' };
  }
  // a repeat is a refusal wherever the window now stands: checkGrid may have disarmed while the grid answered
  if (c.sent.has(d.requestId)) return { act: 'cancel', why: 'repeat' };
  const armed = c.armed;
  const want = armed ? bare(armed.url) : undefined;
  if (!armed || !want || bare(d.url) !== want) return { act: 'pass', why: 'not-armed' };
  if (armed.answered) return { act: 'pass', why: 'armed-once' };
  // an earlier answer whose end Chrome never reported may have been counted by the grid; nothing more until a check settles it
  if (c.pending && c.pending !== d.requestId) return { act: 'pass', why: 'unsettled' };
  // a saved password's refusal outlives the browser on its note; a typing is stopped only by a refusal of this session
  if (armed.source === 'once' ? c.refusedOnce : c.refusedSaved) return { act: 'pass', why: 'refused' };
  if (c.realm !== undefined && d.realm !== c.realm) return { act: 'pass', why: 'realm' };
  return { act: 'answer', source: armed.source };
}
