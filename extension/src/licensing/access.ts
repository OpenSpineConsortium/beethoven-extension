// Approval by Licensor's access service. Beethoven has no keys. The person is authenticated
// by their own sign-in to their Open OnDemand portal (university single sign-on), and the
// extension reads the account name the portal's dashboard shows for that session (core/portal.ts
// session(), the same name check 4 records); nothing typed ever stands in for it, and no cookie
// is read. Authorization is Licensor's approved list, asked through one small request, only after
// the agreement is accepted and a portal is connected:
//
//   address:  https://openspineconsortium.com/beethoven/services.json, key "access_check" (cached 24 h)
//   request:  POST <access_check>, Content-Type text/plain;charset=UTF-8 (no preflight), no cookies
//             {"v":1,"access_id":"st1234","portal":"ondemand.grid.wayne.edu","product":"bridge","version":"8.0.0","install_id":"<32 hex>"}
//   answers:  200 {"approved":true,"access_id":"st1234","checked":"<iso>","until":null|"<iso>"}
//             200 {"approved":false,"access_id":"st1234","requestPage":"https://openspineconsortium.com/beethoven/request.html"}
//             200 {"approved":false,...,"reason":"other_installation"|"other_account"|"update_required"}
//             400 a malformed body; 429 the service's rate limit. Anything else, or nothing, is "no answer".
//
// One approved account, one installation (8.0.0). install_id is the random identifier
// ext/storage.ts installId() makes the first time it is needed in this installation, from the
// browser's random generator and nothing about the device; uninstalling removes it and a reinstall
// makes a new one. The service binds an approved account to the first installation that asks and
// refuses any other with reason "other_installation" until the maintainer moves the approval; an
// installation bound to one approved account is refused for any other with "other_account"; a
// build that sends no identifier (before 8.0.0) is refused with "update_required". v stays 1: the
// service before 8.0.0 refuses any other v and ignores a field it does not know, so this request
// works against the service before and after it learned about installations. This is a check in
// the client, not a proof: it keeps an approval from being passed around, and the texts claim no
// more than that.
//
// Caches and grace: an approval is good for 24 hours without asking again, and is kept up to
// 7 days when the service does not answer; a refusal is kept 10 minutes (a click on the toolbar
// button asks again at once, so an approval just given is seen); an attempt that got no answer is
// not repeated for 15 minutes. Withdrawal (the service answering approved:false for an account
// it approved before) stops every start at the next check and is said as such; an approval moved
// to another installation reaches this one the same way. A reason the service gives is said in its
// own sentence, ahead of the withdrawal. The service's answers are data: the only URL taken from
// them is a page on Licensor's own site.
//
// Nothing here touches the browser: storage, fetch and the clock are handed in, so the whole
// thing runs in Node against a fake service.
import { PRODUCT_NAME } from '../core/terms';

export const SERVICES_URL = 'https://openspineconsortium.com/beethoven/services.json';
export const SITE_ORIGIN = 'https://openspineconsortium.com';
export const REQUEST_PAGE_URL = `${SITE_ORIGIN}/beethoven/request.html`;
export const PRODUCT = 'bridge';
/** how often the background asks by itself (minutes) */
export const ACCESS_PERIOD_MINUTES = 24 * 60;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const SERVICES_TTL_MS = 24 * HOUR;
export const APPROVED_TTL_MS = 24 * HOUR;
export const APPROVED_GRACE_MS = 7 * 24 * HOUR;
export const DENIED_TTL_MS = 10 * MINUTE;
export const RETRY_MS = 15 * MINUTE;
/**
 * each request's budget: generous, because it runs in the background while the strip says it is
 * checking, and a cold DNS lookup on a VPN can take longer than ten seconds (measured 2026-09-29 on
 * the maintainer's machine: about 11 s for a host not resolved recently, which aborted the first check
 * at the earlier 10 s budget)
 */
export const FETCH_TIMEOUT_MS = 30_000;
/** what a dashboard may call an account (core/portal.ts reads it with the same alphabet), lower-cased */
export const ACCOUNT_RE = /^[a-z0-9][a-z0-9._@-]{0,63}$/;

/** the installation identifier as ext/storage.ts installId() makes it: 16 random bytes as 32 hex characters */
export const INSTALL_ID_RE = /^[0-9a-f]{32}$/;

/** the account name as it is sent and compared: trimmed and lower-cased (the approved list is lower-case), or undefined when it is not a plain account name */
export function normalizeAccount(name: unknown): string | undefined {
  const s = String(name ?? '').trim().toLowerCase();
  return ACCOUNT_RE.test(s) ? s : undefined;
}

/** why the service refused, when it said: the account is set up on another installation, this installation is set up for another account, or the request carried no installation identifier */
export type AccessReason = 'other_installation' | 'other_account' | 'update_required';
const REASONS: ReadonlySet<string> = new Set<AccessReason>(['other_installation', 'other_account', 'update_required']);

/** the strip's sentence when the account is set up on another installation; there is nothing for the student to press */
export const OTHER_INSTALLATION = 'This account is already set up on another computer. Ask your lab lead to move it here.';
/** the strip's sentence when this installation is set up for another approved account; only the lab lead can release it */
export const OTHER_ACCOUNT = `This installation of ${PRODUCT_NAME} is already set up for another account. Ask your lab lead to move it to yours.`;
/** the strip's sentence when the service asks for the current build */
export const UPDATE_REQUIRED = `Install the current ${PRODUCT_NAME} from the lab's private listing.`;

// Why the background did not ask the service, as bare reasons like checkAccess's own details; the
// page that shows one puts the label in front (accessOutcomeWords), so the label is said once.
/** the background's reason when no agreement is accepted */
export const NOT_ASKED_TERMS = 'the agreement has not been accepted yet';
/** the background's reason when no portal is connected */
export const NOT_ASKED_NO_PORTAL = 'no portal connected yet';
/** the background's reason when the dashboard has shown no account name */
export const NOT_ASKED_NO_ACCOUNT = 'your portal has not shown who is signed in yet: open it in a tab and sign in there, then try again';

/**
 * What a press of "Check my access now" came to, in one line. The label ("Checked", "Not asked") is
 * said here and nowhere else; the detail is the bare reason the background or checkAccess gave.
 * 9.0.0 had the label on both sides and showed "Not asked: not asked: ...".
 */
export function accessOutcomeWords(o: { asked: boolean; approved?: boolean; detail: string }): { kind: 'ok' | 'warn' | 'info'; text: string } {
  const detail = String(o.detail ?? '').trim().replace(/^(?:not asked|checked)\s*:\s*/i, '').replace(/[.\s]+$/, '');
  return { kind: o.asked ? (o.approved ? 'ok' : 'warn') : 'info', text: `${o.asked ? 'Checked' : 'Not asked'}: ${detail}.` };
}

/**
 * A bare reason as a sentence of its own, for the strip's status line where no label goes in front:
 * "your portal has not shown who is signed in yet: ..." -> "Your portal has not shown who is signed in
 * yet: ....". A leading "not asked:" or "checked:" label is dropped, as in accessOutcomeWords.
 */
export function reasonSentence(detail: string): string {
  const d = String(detail ?? '').trim().replace(/^(?:not asked|checked)\s*:\s*/i, '').trim();
  if (!d) return d;
  const s = d.charAt(0).toUpperCase() + d.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** services.json as last read: the addresses this build talks to, none of them compiled in but the file's own */
export interface StoredServices {
  fetched_at: string;
  access_check?: string;
  request_page?: string;
}

/** the last word from the service about one account at one portal, kept in storage.local (keys.ts ACCESS_KEY) */
export interface AccessRecord {
  v: 1;
  access_id: string;
  portal: string;
  /** the service's last answer; absent until it has answered once */
  approved?: boolean;
  /** when that answer came (this browser's clock, so the cache arithmetic is one clock) */
  checked_at?: string;
  /** the approval's end, when the service named one */
  until?: string | null;
  /** where the service said to ask, when it refused */
  request_page?: string;
  /** the service approved this account here once and later did not */
  withdrawn?: boolean;
  /** why the service said no, when it gave a reason this version knows; said ahead of a withdrawal */
  reason?: AccessReason;
  last_attempt_at: string;
  /** why the last attempt got no answer, when it did not */
  last_error?: string;
}

export interface AccessRequest {
  v: 1;
  access_id: string;
  portal: string;
  product: typeof PRODUCT;
  version: string;
  /** this installation's random identifier (ext/storage.ts installId) */
  install_id: string;
}

export type AccessAnswer = { kind: 'approved'; checked?: string; until: string | null } | { kind: 'denied'; requestPage?: string; reason?: AccessReason } | { kind: 'error'; detail: string; status?: number };

export type AccessState =
  /** nothing on record yet for this account at this portal */
  | 'checking'
  | 'approved'
  /** approved more than a day ago and the service has not answered since; still good, up to seven days */
  | 'stale'
  /** approved more than seven days ago and the service has not answered since */
  | 'lapsed'
  | 'denied'
  /** approved before, refused now */
  | 'withdrawn'
  /** the account is approved and set up on another installation; the maintainer moves it */
  | 'other-installation'
  /** this installation is set up for another approved account; the maintainer releases it */
  | 'other-account'
  /** the service asks for the current build */
  | 'update-required'
  /** asked, no answer yet */
  | 'unreachable'
  /** the portal has not shown who is signed in */
  | 'no-identity'
  /** this extension version is on the kill-list */
  | 'version-revoked'
  /** the background could not ask (transient, from the strip's own attempt) */
  | 'failed';

export interface AccessFact {
  /** approved, on a record within its window, and the version not withdrawn: workers may start */
  ok: boolean;
  state: AccessState;
  /** one sentence for the strip and the checks */
  detail: string;
  /** the background should ask the service (the caches say the answer is due); never a network call by the caller itself */
  needsCheck: boolean;
  /** ok, but on an answer older than a day */
  warn: boolean;
  accessId?: string;
  portal?: string;
  /** when the service last answered (ms since epoch) */
  checkedAt?: number;
  /** where "Ask for access" goes, with the account name filled in */
  requestUrl: string;
  versionRevoked: boolean;
}

/** a page on Licensor's own site, or nothing: the only kind of URL taken from a service answer */
export function safeSitePage(u: unknown): string | undefined {
  if (typeof u !== 'string') return undefined;
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && x.origin === SITE_ORIGIN ? x.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** the request page with ?access_id=<account> (the person asks; the maintainer approves) */
export function requestUrl(page: string | undefined, accessId?: string): string {
  const base = new URL(safeSitePage(page) ?? REQUEST_PAGE_URL);
  if (accessId) base.searchParams.set('access_id', accessId);
  return base.toString();
}

const ageMs = (iso: string | undefined, now: Date): number => {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, now.getTime() - t) : Infinity;
};

const stamp = (iso: string | undefined): string => (iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : 'never');

/**
 * Is the service due to be asked for this record? An approval under a day old is never asked
 * again (not even by a click); a refusal under ten minutes old is asked again only by a click;
 * an attempt that got no answer is not repeated for fifteen minutes unless a person asks.
 */
export function accessDue(record: AccessRecord | undefined, now: Date, force = false): boolean {
  if (!record) return true;
  if (record.approved === true && ageMs(record.checked_at, now) < APPROVED_TTL_MS) return false;
  if (force) return true;
  if (record.approved === false && ageMs(record.checked_at, now) < DENIED_TTL_MS) return false;
  if (record.last_error && ageMs(record.last_attempt_at, now) < RETRY_MS) return false;
  return true;
}

export interface FactOpts {
  record?: AccessRecord;
  services?: StoredServices;
  /** the account name the portal's dashboard showed (core/keys.ts IDENTITY_KEY), never a typed one */
  accessId?: string;
  /** the connected portal's hostname; a record for another portal does not count */
  portal?: string;
  now: Date;
  versionRevoked?: boolean;
  revokedMessage?: string;
  /** the strip's own attempt is in flight */
  checking?: boolean;
  /** the strip's own attempt could not ask, in one sentence */
  failed?: string;
}

/** The pure decision: what the record on file means for this account at this portal, right now. */
export function accessFact(o: FactOpts): AccessFact {
  const id = normalizeAccount(o.accessId);
  const portal = String(o.portal ?? '').trim().toLowerCase() || undefined;
  const r = o.record && o.record.access_id === id && (!portal || o.record.portal === portal) ? o.record : undefined;
  const at = portal ?? r?.portal;
  const where = at ? ` at ${at}` : '';
  const url = requestUrl(r?.request_page ?? o.services?.request_page, id);
  const base = { accessId: id, portal: at, requestUrl: url, versionRevoked: !!o.versionRevoked, warn: false };
  const fact = (ok: boolean, state: AccessState, detail: string, needsCheck: boolean, extra: Partial<AccessFact> = {}): AccessFact => ({ ok, state, detail, needsCheck, ...base, ...extra });
  if (o.versionRevoked) return fact(false, 'version-revoked', `This version of ${PRODUCT_NAME} has been withdrawn; update to continue. ${o.revokedMessage ?? ''}`.trim(), false);
  if (o.checking) return fact(false, 'checking', "Checking your access with Licensor's service...", false);
  if (!id) return fact(false, 'no-identity', 'your access cannot be checked until your portal shows who is signed in (open it in a tab and sign in there)', true);
  const answered = r?.approved !== undefined;
  if (o.failed && !answered) return fact(false, 'failed', o.failed, false);
  if (!r) return fact(false, 'checking', `not checked yet for ${id}${where}`, true);
  const checkedAt = r.checked_at ? new Date(r.checked_at).getTime() : undefined;
  const due = accessDue(r, o.now);
  if (!answered) return fact(false, 'unreachable', `Licensor's access service has not answered yet (${r.last_error ?? 'no answer'}); ${PRODUCT_NAME} starts no worker until it has`, due, { checkedAt });
  if (r.approved) {
    const untilT = r.until ? new Date(r.until).getTime() : NaN;
    if (Number.isFinite(untilT) && untilT < o.now.getTime()) return fact(false, 'denied', `your approval for ${id}${where} ended on ${String(r.until).slice(0, 10)}; ask for access again if you still need ${PRODUCT_NAME}`, due, { checkedAt });
    const age = ageMs(r.checked_at, o.now);
    const head = `Access approved for ${id}${where} (checked ${stamp(r.checked_at)})`;
    if (age < APPROVED_TTL_MS) return fact(true, 'approved', head, false, { checkedAt });
    if (age < APPROVED_GRACE_MS) return fact(true, 'stale', `${head}; the service has not confirmed it since${r.last_error ? ` (${r.last_error})` : ''}; kept for seven days`, due, { checkedAt, warn: true });
    return fact(false, 'lapsed', `your approval for ${id}${where} was last confirmed ${stamp(r.checked_at)} and Licensor's access service has not answered for seven days${r.last_error ? ` (${r.last_error})` : ''}; ${PRODUCT_NAME} starts no worker until it does`, due, { checkedAt });
  }
  if (r.reason === 'other_installation') return fact(false, 'other-installation', OTHER_INSTALLATION, due, { checkedAt });
  if (r.reason === 'other_account') return fact(false, 'other-account', OTHER_ACCOUNT, due, { checkedAt });
  if (r.reason === 'update_required') return fact(false, 'update-required', UPDATE_REQUIRED, due, { checkedAt });
  if (r.withdrawn) return fact(false, 'withdrawn', `Access withdrawn: ask again if you still need ${PRODUCT_NAME} (your account ${id}${where} is no longer on the approved list; checked ${stamp(r.checked_at)})`, due, { checkedAt });
  return fact(false, 'denied', `your account ${id}${where} is not on the approved list yet (checked ${stamp(r.checked_at)})`, due, { checkedAt });
}

export interface ServicesOutcome {
  current?: StoredServices;
  detail: string;
  fresh: boolean;
}

function timeoutSignal(): AbortSignal | undefined {
  const A = globalThis.AbortSignal as (typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }) | undefined;
  return A && typeof A.timeout === 'function' ? A.timeout(FETCH_TIMEOUT_MS) : undefined;
}

/** an address worth talking to: https, or plain http on the loopback address (the mock portal's stand-in for the service, in tests) */
const httpsOnly = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return v;
    if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return v;
  } catch {
    /* not a URL */
  }
  return undefined;
};

/**
 * services.json: read once a day, kept on failure. A copy without the access_check address is
 * kept only for the retry window, so the address is seen within minutes of being published.
 */
export async function fetchServices(previous: StoredServices | undefined, fetchFn: typeof fetch, now: () => Date = () => new Date(), url = SERVICES_URL): Promise<ServicesOutcome> {
  if (previous) {
    const age = ageMs(previous.fetched_at, now());
    if (age < (previous.access_check ? SERVICES_TTL_MS : RETRY_MS)) return { current: previous, fresh: false, detail: 'services.json from the cache' };
  }
  let j: Record<string, unknown>;
  try {
    const res = await fetchFn(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: timeoutSignal() });
    if (!res.ok) return { current: previous, fresh: false, detail: `services.json answered ${res.status}` };
    const body = (await res.json()) as unknown;
    if (!body || typeof body !== 'object') return { current: previous, fresh: false, detail: 'services.json is not a JSON object' };
    j = body as Record<string, unknown>;
  } catch (e) {
    return { current: previous, fresh: false, detail: `services.json unreachable (${(e as Error).message})` };
  }
  const current: StoredServices = { fetched_at: now().toISOString() };
  const check = httpsOnly(j.access_check);
  if (check) current.access_check = check;
  const page = safeSitePage(j.request_page);
  if (page) current.request_page = page;
  return { current, fresh: true, detail: check ? 'services.json read' : 'services.json read, but it names no access_check address yet' };
}

/** One request to the service; the answer as data. */
export async function askService(url: string, body: AccessRequest, fetchFn: typeof fetch): Promise<AccessAnswer> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: timeoutSignal(),
    });
  } catch (e) {
    return { kind: 'error', detail: `Licensor's access service could not be reached (${(e as Error).message})` };
  }
  if (res.status === 429) return { kind: 'error', status: 429, detail: 'Licensor\'s access service answered "too many checks from this network today"; try again later' };
  if (res.status === 400) return { kind: 'error', status: 400, detail: "Licensor's access service did not accept the request (400)" };
  if (!res.ok) return { kind: 'error', status: res.status, detail: `Licensor's access service answered ${res.status}` };
  let j: Record<string, unknown>;
  try {
    const parsed = (await res.json()) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    j = parsed as Record<string, unknown>;
  } catch {
    return { kind: 'error', status: res.status, detail: "Licensor's access service answered with something that is not JSON" };
  }
  if (typeof j.approved !== 'boolean') return { kind: 'error', status: res.status, detail: "Licensor's access service answered in a shape this version does not know" };
  if (j.access_id !== undefined && normalizeAccount(j.access_id) !== body.access_id) return { kind: 'error', status: res.status, detail: "Licensor's access service answered for a different account" };
  if (j.approved) return { kind: 'approved', checked: typeof j.checked === 'string' ? j.checked : undefined, until: typeof j.until === 'string' ? j.until : null };
  // a reason this version does not know is a plain no
  const reason = typeof j.reason === 'string' && REASONS.has(j.reason) ? (j.reason as AccessReason) : undefined;
  return reason ? { kind: 'denied', requestPage: safeSitePage(j.requestPage), reason } : { kind: 'denied', requestPage: safeSitePage(j.requestPage) };
}

export interface CheckOpts {
  previous?: AccessRecord;
  services?: StoredServices;
  /** the account name the dashboard showed */
  accessId: string;
  /** the connected portal's hostname */
  portal: string;
  /** this extension's version, as the request states it */
  version: string;
  /** this installation's random identifier (ext/storage.ts installId), sent with every check */
  installId: string;
  fetchFn: typeof fetch;
  now?: () => Date;
  /** a person asked (toolbar click, a button): a refusal or a failed attempt is asked again at once; an approval under a day old still is not */
  force?: boolean;
  servicesUrl?: string;
}

export interface CheckOutcome {
  /** the record to store */
  record: AccessRecord;
  /** the services to store, when one was read or kept */
  services?: StoredServices;
  /** the service was asked this time */
  asked: boolean;
  /** the service answered this time */
  fresh: boolean;
  detail: string;
}

/**
 * Ask when due, and turn the answer into the record. `fetchFn` and `now` are handed in for tests.
 * The address comes from services.json, never from this file; a record for another account or
 * another portal is discarded, not updated.
 */
export async function checkAccess(o: CheckOpts): Promise<CheckOutcome> {
  const now = o.now ?? (() => new Date());
  const id = normalizeAccount(o.accessId);
  if (!id) throw new Error(`"${String(o.accessId)}" is not an account name`);
  const portal = String(o.portal ?? '').trim().toLowerCase();
  if (!portal) throw new Error('no portal to ask for');
  const install = String(o.installId ?? '').trim().toLowerCase();
  if (!INSTALL_ID_RE.test(install)) throw new Error(`"${String(o.installId)}" is not this installation's identifier`);
  const prev = o.previous && o.previous.access_id === id && o.previous.portal === portal ? o.previous : undefined;
  if (prev && !accessDue(prev, now(), o.force)) return { record: prev, services: o.services, asked: false, fresh: false, detail: prev.approved ? 'the approval on file is less than a day old' : prev.approved === false ? 'the refusal on file is less than ten minutes old' : 'the last attempt was less than fifteen minutes ago' };
  const attemptAt = now().toISOString();
  const record: AccessRecord = prev ? { ...prev, last_attempt_at: attemptAt } : { v: 1, access_id: id, portal, last_attempt_at: attemptAt };
  const svc = await fetchServices(o.services, o.fetchFn, now, o.servicesUrl);
  const services = svc.current;
  if (services?.request_page) record.request_page = record.request_page ?? services.request_page;
  const url = services?.access_check;
  if (!url) {
    record.last_error = `the address of Licensor's access service is not known (${svc.detail})`;
    return { record, services, asked: false, fresh: false, detail: record.last_error };
  }
  const body: AccessRequest = { v: 1, access_id: id, portal, product: PRODUCT, version: o.version, install_id: install };
  const a = await askService(url, body, o.fetchFn);
  if (a.kind === 'error') {
    record.last_error = a.detail;
    return { record, services, asked: true, fresh: false, detail: a.detail };
  }
  delete record.last_error;
  record.checked_at = attemptAt;
  if (a.kind === 'approved') {
    record.approved = true;
    record.until = a.until;
    delete record.withdrawn;
    delete record.reason;
    return { record, services, asked: true, fresh: true, detail: `approved for ${id} at ${portal}${a.until ? ` until ${a.until.slice(0, 10)}` : ''}` };
  }
  // an installation that was approved and whose approval was moved elsewhere keeps "withdrawn"
  // beneath the reason, so it is said as a withdrawal if the reason later goes and the no stays
  const wasApproved = prev?.approved === true || prev?.withdrawn === true;
  record.approved = false;
  delete record.until;
  if (wasApproved) record.withdrawn = true;
  if (a.reason) record.reason = a.reason;
  else delete record.reason;
  if (a.requestPage) record.request_page = a.requestPage;
  const detail =
    a.reason === 'other_installation'
      ? `${id} is already set up on another computer`
      : a.reason === 'other_account'
        ? `this installation is already set up for an account other than ${id}`
        : a.reason === 'update_required'
          ? `the service asks for the current ${PRODUCT_NAME} from the lab's private listing`
          : wasApproved
            ? `access withdrawn for ${id} at ${portal}`
            : `${id} is not on the approved list yet`;
  return { record, services, asked: true, fresh: true, detail };
}
