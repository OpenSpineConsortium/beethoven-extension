// Access by Licensor's approved list, with no key anywhere: the wire request is exactly the one
// the service codes to, every answer it can give lands in the record it should, the caches and
// grace windows hold (a day for an approval, seven days without the service, ten minutes for a
// refusal, fifteen minutes after no answer, a click asks again), a withdrawn approval is told
// apart from a plain refusal, the request page carries the account name, the installation's
// identifier goes with every check and the service's two reasons (another installation, a build
// too old) are said in their own sentences, and the pure decision turns each record into the one
// state the strip and check 1 show. The last block runs the same client against the mock portal's
// stand-in for the service, which binds an approved account to the first installation that asks.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliOptions, createMockPortal } from '../mock-ood/server.mjs';
import { accessDue, accessFact, accessOutcomeWords, reasonSentence, NOT_ASKED_NO_ACCOUNT, NOT_ASKED_NO_PORTAL, NOT_ASKED_TERMS, APPROVED_GRACE_MS, APPROVED_TTL_MS, askService, checkAccess, DENIED_TTL_MS, fetchServices, INSTALL_ID_RE, normalizeAccount, OTHER_ACCOUNT, OTHER_INSTALLATION, PRODUCT, REQUEST_PAGE_URL, requestUrl, RETRY_MS, safeSitePage, SERVICES_TTL_MS, SERVICES_URL, UPDATE_REQUIRED, type AccessRecord, type StoredServices } from '../src/licensing/access';

const T0 = Date.parse('2026-09-29T12:00:00Z');
const at = (ms: number) => new Date(ms);
const iso = (ms: number) => new Date(ms).toISOString();
const CHECK = 'https://beethoven-access.openspineconsortium.workers.dev/access_check';
const SERVICES: StoredServices = { fetched_at: iso(T0), access_check: CHECK, request_page: REQUEST_PAGE_URL };
/** an installation identifier as ext/storage.ts installId makes one, and a second installation's */
const INSTALL = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';

interface Seen {
  url: string;
  init: RequestInit;
}

/** a fake fetch that answers services.json and the access check as the real ones do, and records every request */
function fakeService(o: { approved?: string[]; status?: number; body?: unknown; servicesBody?: unknown; throwOn?: 'services' | 'check' } = {}) {
  const seen: Seen[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    seen.push({ url, init });
    if (url === SERVICES_URL) {
      if (o.throwOn === 'services') throw new Error('ENETUNREACH');
      return new Response(JSON.stringify(o.servicesBody ?? { license_service: 'https://x/trial', access_check: CHECK, request_page: REQUEST_PAGE_URL }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === CHECK) {
      if (o.throwOn === 'check') throw new Error('ENETUNREACH');
      if (o.status && o.status !== 200) return new Response(JSON.stringify(o.body ?? { error: 'x' }), { status: o.status, headers: { 'content-type': 'application/json' } });
      if (o.body !== undefined) return new Response(typeof o.body === 'string' ? o.body : JSON.stringify(o.body), { status: 200, headers: { 'content-type': 'application/json' } });
      const req = JSON.parse(String(init.body)) as { access_id: string };
      const ok = (o.approved ?? ['st1234']).includes(req.access_id);
      return new Response(JSON.stringify(ok ? { approved: true, access_id: req.access_id, checked: iso(T0), until: null } : { approved: false, access_id: req.access_id, requestPage: REQUEST_PAGE_URL }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, seen };
}

const approvedRecord = (checkedAgoMs: number, extra: Partial<AccessRecord> = {}): AccessRecord => ({ v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: iso(T0 - checkedAgoMs), until: null, last_attempt_at: iso(T0 - checkedAgoMs), ...extra });
const deniedRecord = (checkedAgoMs: number, extra: Partial<AccessRecord> = {}): AccessRecord => ({ v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: false, checked_at: iso(T0 - checkedAgoMs), request_page: REQUEST_PAGE_URL, last_attempt_at: iso(T0 - checkedAgoMs), ...extra });

// "Check my access now": the label is said once, on the page's side; the background and the client
// give bare reasons. 9.0.0 showed "Not asked: not asked: the agreement has not been accepted yet".
describe('the strip\'s status line when the background did not ask', () => {
  // the strip shows the bare reason with no label in front, so it is made a sentence of its own
  // (9.0.0's background gave this one as a sentence; 10.0.0's first build showed it lower-case)
  it('starts with a capital and ends with one full stop, with no label', () => {
    expect(reasonSentence(NOT_ASKED_NO_ACCOUNT)).toBe('Your portal has not shown who is signed in yet: open it in a tab and sign in there, then try again.');
    expect(reasonSentence(NOT_ASKED_NO_PORTAL)).toBe('No portal connected yet.');
    expect(reasonSentence(NOT_ASKED_TERMS)).toBe('The agreement has not been accepted yet.');
    expect(reasonSentence('not asked: no portal connected yet')).toBe('No portal connected yet.');
    expect(reasonSentence("Licensor's access service answered 502")).toBe("Licensor's access service answered 502.");
    expect(reasonSentence('Done.')).toBe('Done.');
    expect(reasonSentence('')).toBe('');
  });
});

describe('what a press of "Check my access now" says', () => {
  it('says "Not asked" once, before the bare reason, and ends with one full stop', () => {
    expect(accessOutcomeWords({ asked: false, detail: NOT_ASKED_TERMS })).toEqual({ kind: 'info', text: 'Not asked: the agreement has not been accepted yet.' });
    expect(accessOutcomeWords({ asked: false, detail: NOT_ASKED_NO_PORTAL }).text).toBe('Not asked: no portal connected yet.');
    expect(accessOutcomeWords({ asked: false, detail: NOT_ASKED_NO_ACCOUNT }).text).toBe('Not asked: your portal has not shown who is signed in yet: open it in a tab and sign in there, then try again.');
    expect(accessOutcomeWords({ asked: false, approved: true, detail: 'the approval on file is less than a day old' }).text).toBe('Not asked: the approval on file is less than a day old.');
    // a reason that still carries a label (as 9.0.0's did) is not labelled twice, and a full stop is not doubled
    expect(accessOutcomeWords({ asked: false, detail: 'not asked: no portal connected yet' }).text).toBe('Not asked: no portal connected yet.');
    expect(accessOutcomeWords({ asked: false, detail: 'the address is not known.' }).text).toBe('Not asked: the address is not known.');
    for (const d of [NOT_ASKED_TERMS, NOT_ASKED_NO_PORTAL, NOT_ASKED_NO_ACCOUNT]) {
      expect(d).not.toMatch(/^(not asked|checked)\b/i);
      expect(accessOutcomeWords({ asked: false, detail: d }).text).not.toMatch(/not asked:\s*not asked/i);
    }
  });

  it('says "Checked" for an answer, in the class of the answer', () => {
    expect(accessOutcomeWords({ asked: true, approved: true, detail: 'approved for st1234 at localhost' })).toEqual({ kind: 'ok', text: 'Checked: approved for st1234 at localhost.' });
    expect(accessOutcomeWords({ asked: true, approved: false, detail: 'st1234 is not on the approved list yet' })).toEqual({ kind: 'warn', text: 'Checked: st1234 is not on the approved list yet.' });
  });

  it('the background gives bare reasons, never its own "not asked:" label', () => {
    const background = readFileSync(fileURLToPath(new URL('../src/entrypoints/background.ts', import.meta.url)), 'utf8');
    expect(background).not.toMatch(/detail:\s*['"`]not asked/i);
    for (const name of ['NOT_ASKED_TERMS', 'NOT_ASKED_NO_PORTAL', 'NOT_ASKED_NO_ACCOUNT']) expect(background).toContain(`detail: ${name}`);
  });
});

describe('the wire request', () => {
  it('is one POST with a text/plain JSON body of exactly {v, access_id, portal, product, version, install_id}, without cookies', async () => {
    const { fetchFn, seen } = fakeService();
    const out = await checkAccess({ accessId: 'ST1234', portal: 'OnDemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn, now: () => at(T0) });
    expect(out.asked).toBe(true);
    expect(out.fresh).toBe(true);
    expect(out.record).toMatchObject({ v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, until: null, checked_at: iso(T0), last_attempt_at: iso(T0) });
    expect(out.record.last_error).toBeUndefined();
    // services.json first (GET, no cookies), then the check
    expect(seen.map((s) => s.url)).toEqual([SERVICES_URL, CHECK]);
    const post = seen[1]!.init;
    expect(post.method).toBe('POST');
    expect(post.headers).toEqual({ 'Content-Type': 'text/plain;charset=UTF-8' });
    expect(post.credentials).toBe('omit');
    expect(post.cache).toBe('no-store');
    expect(post.redirect).toBe('error');
    // v stays 1: the service before 8.0.0 refuses any other v and ignores install_id
    expect(JSON.parse(String(post.body))).toEqual({ v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', product: 'bridge', version: '4.0.0', install_id: INSTALL });
    expect(Object.keys(JSON.parse(String(post.body)))).toEqual(['v', 'access_id', 'portal', 'product', 'version', 'install_id']);
    expect(PRODUCT).toBe('bridge');
    expect(seen[0]!.init.credentials).toBe('omit');
    // the address came from services.json, and the services are handed back to be stored
    expect(out.services).toMatchObject({ access_check: CHECK, request_page: REQUEST_PAGE_URL });
  });

  it('refuses to ask for anything that is not an account name, and asks about nothing typed', async () => {
    const { fetchFn, seen } = fakeService();
    await expect(checkAccess({ accessId: 'not an account', portal: 'p', version: '4.0.0', installId: INSTALL, fetchFn })).rejects.toThrow(/not an account name/);
    await expect(checkAccess({ accessId: '', portal: 'p', version: '4.0.0', installId: INSTALL, fetchFn })).rejects.toThrow(/not an account name/);
    await expect(checkAccess({ accessId: 'st1234', portal: '', version: '4.0.0', installId: INSTALL, fetchFn })).rejects.toThrow(/no portal/);
    // nor without this installation's identifier, in the one shape installId() makes it
    for (const bad of ['', 'abc', `${INSTALL}0`, 'g'.repeat(32), undefined as unknown as string]) {
      await expect(checkAccess({ accessId: 'st1234', portal: 'p', version: '4.0.0', installId: bad, fetchFn })).rejects.toThrow(/not this installation's identifier/);
    }
    expect(seen).toHaveLength(0);
    expect(INSTALL_ID_RE.test(INSTALL)).toBe(true);
    // upper case is taken and sent lower-cased
    const up = fakeService();
    await checkAccess({ accessId: 'st1234', portal: 'p', version: '4.0.0', installId: INSTALL.toUpperCase(), fetchFn: up.fetchFn, now: () => at(T0) });
    expect(JSON.parse(String(up.seen[1]!.init.body)).install_id).toBe(INSTALL);
    expect(normalizeAccount(' ST1234 ')).toBe('st1234');
    expect(normalizeAccount('a.b_c-d@e')).toBe('a.b_c-d@e');
    expect(normalizeAccount('/home/st1234')).toBeUndefined();
    expect(normalizeAccount(undefined)).toBeUndefined();
  });
});

describe('the answers', () => {
  it('200 approved:false is a refusal with the request page; approved:false after an approval is a withdrawal', async () => {
    const { fetchFn } = fakeService({ approved: [] });
    const first = await checkAccess({ accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn, now: () => at(T0) });
    expect(first.record).toMatchObject({ approved: false, request_page: REQUEST_PAGE_URL, checked_at: iso(T0) });
    expect(first.record.withdrawn).toBeUndefined();
    expect(first.detail).toMatch(/not on the approved list yet/);
    const later = await checkAccess({ previous: approvedRecord(2 * APPROVED_TTL_MS), accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn, now: () => at(T0) });
    expect(later.record).toMatchObject({ approved: false, withdrawn: true });
    expect(later.record.until).toBeUndefined();
    expect(later.detail).toMatch(/withdrawn/);
    // approved again later: the withdrawal is forgotten
    const again = await checkAccess({ previous: later.record, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0 + DENIED_TTL_MS + 1) });
    expect(again.record).toMatchObject({ approved: true });
    expect(again.record.withdrawn).toBeUndefined();
  });

  it('one approved account, one installation: the reason is kept and said in its own sentence, ahead of a withdrawal; a reason this version does not know is a plain no', async () => {
    const W = 'ondemand.grid.wayne.edu';
    const fact = (record: AccessRecord, t = T0) => accessFact({ record, accessId: 'st1234', portal: W, now: at(t) });
    const otherBody = { approved: false, access_id: 'st1234', requestPage: REQUEST_PAGE_URL, reason: 'other_installation' };
    // the exact sentences the strip shows
    expect(OTHER_INSTALLATION).toBe('This account is already set up on another computer. Ask your lab lead to move it here.');
    expect(UPDATE_REQUIRED).toBe("Install the current Beethoven from the lab's private listing.");
    // a second installation asking for an approved account: refused with the reason, never called a withdrawal
    const second = await checkAccess({ accessId: 'st1234', portal: W, version: '8.0.0', installId: OTHER, fetchFn: fakeService({ body: otherBody }).fetchFn, now: () => at(T0) });
    expect(second.record).toMatchObject({ approved: false, reason: 'other_installation', checked_at: iso(T0) });
    expect(second.record.withdrawn).toBeUndefined();
    expect(second.detail).toBe('st1234 is already set up on another computer');
    expect(fact(second.record)).toMatchObject({ ok: false, state: 'other-installation', detail: OTHER_INSTALLATION, needsCheck: false });
    expect(fact(second.record, T0 + DENIED_TTL_MS + 1).needsCheck).toBe(true);
    // the approval moved away from an installation that had it: the reason, not "Access withdrawn"
    const moved = await checkAccess({ previous: approvedRecord(2 * APPROVED_TTL_MS), accessId: 'st1234', portal: W, version: '8.0.0', installId: INSTALL, fetchFn: fakeService({ body: otherBody }).fetchFn, now: () => at(T0) });
    expect(moved.record).toMatchObject({ approved: false, withdrawn: true, reason: 'other_installation' });
    expect(fact(moved.record)).toMatchObject({ state: 'other-installation', detail: OTHER_INSTALLATION });
    // later withdrawn outright: the reason goes and the withdrawal is said
    const gone = await checkAccess({ previous: moved.record, accessId: 'st1234', portal: W, version: '8.0.0', installId: INSTALL, fetchFn: fakeService({ approved: [] }).fetchFn, now: () => at(T0 + DENIED_TTL_MS + 1) });
    expect(gone.record.reason).toBeUndefined();
    expect(fact(gone.record, T0 + DENIED_TTL_MS + 1)).toMatchObject({ state: 'withdrawn' });
    // or moved back here: approved, with neither the reason nor the withdrawal left
    const back = await checkAccess({ previous: moved.record, accessId: 'st1234', portal: W, version: '8.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0 + DENIED_TTL_MS + 1) });
    expect(back.record).toMatchObject({ approved: true });
    expect(back.record.reason).toBeUndefined();
    expect(back.record.withdrawn).toBeUndefined();
    // the service asks for the current build
    const old = await checkAccess({ accessId: 'st1234', portal: W, version: '8.0.0', installId: INSTALL, fetchFn: fakeService({ body: { approved: false, access_id: 'st1234', reason: 'update_required' } }).fetchFn, now: () => at(T0) });
    expect(old.record.reason).toBe('update_required');
    expect(old.detail).toMatch(/current Beethoven from the lab's private listing/);
    expect(fact(old.record)).toMatchObject({ ok: false, state: 'update-required', detail: UPDATE_REQUIRED });
    // this installation is set up for another approved account: its own sentence, never "not on the approved list yet"
    expect(OTHER_ACCOUNT).toBe('This installation of Beethoven is already set up for another account. Ask your lab lead to move it to yours.');
    const taken = await checkAccess({ accessId: 'st1234', portal: W, version: '8.0.0', installId: INSTALL, fetchFn: fakeService({ body: { approved: false, access_id: 'st1234', requestPage: REQUEST_PAGE_URL, reason: 'other_account' } }).fetchFn, now: () => at(T0) });
    expect(taken.record).toMatchObject({ approved: false, reason: 'other_account' });
    expect(taken.detail).toBe('this installation is already set up for an account other than st1234');
    expect(fact(taken.record)).toMatchObject({ ok: false, state: 'other-account', detail: OTHER_ACCOUNT });
    // askService alone: a known reason is carried, an unknown one dropped, and a reason on a yes changes nothing
    const body = { v: 1 as const, access_id: 'st1234', portal: 'p', product: 'bridge' as const, version: '8.0.0', install_id: INSTALL };
    expect(await askService(CHECK, body, fakeService({ body: otherBody }).fetchFn)).toEqual({ kind: 'denied', requestPage: REQUEST_PAGE_URL, reason: 'other_installation' });
    const unknown = await askService(CHECK, body, fakeService({ body: { approved: false, reason: 'something_new' } }).fetchFn);
    expect(unknown).toEqual({ kind: 'denied', requestPage: undefined });
    expect('reason' in unknown).toBe(false);
    expect((await askService(CHECK, body, fakeService({ body: { approved: true, access_id: 'st1234', reason: 'other_installation' } }).fetchFn)).kind).toBe('approved');
  });

  it('400, 429, 5xx, no network, not JSON, an unknown shape and a different account are "no answer": the record keeps its last word', async () => {
    const prev = approvedRecord(2 * APPROVED_TTL_MS);
    const cases: Array<[Parameters<typeof fakeService>[0], RegExp]> = [
      [{ status: 400 }, /did not accept the request \(400\)/],
      [{ status: 429 }, /too many checks/],
      [{ status: 503 }, /answered 503/],
      [{ throwOn: 'check' }, /could not be reached \(ENETUNREACH\)/],
      [{ body: 'not json' }, /not JSON/],
      [{ body: { ok: true } }, /shape this version does not know/],
      [{ body: { approved: true, access_id: 'zz9999' } }, /different account/],
    ];
    for (const [o, why] of cases) {
      const out = await checkAccess({ previous: prev, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService(o).fetchFn, now: () => at(T0) });
      expect(out.asked, why.source).toBe(true);
      expect(out.fresh, why.source).toBe(false);
      expect(out.record.approved, why.source).toBe(true);
      expect(out.record.checked_at, why.source).toBe(prev.checked_at);
      expect(out.record.last_attempt_at, why.source).toBe(iso(T0));
      expect(out.record.last_error, why.source).toMatch(why);
      expect(out.detail, why.source).toMatch(why);
    }
    // askService alone, for the two answers it accepts
    expect(await askService(CHECK, { v: 1, access_id: 'st1234', portal: 'p', product: 'bridge', version: '4.0.0', install_id: INSTALL }, fakeService({ body: { approved: true, access_id: 'st1234', checked: 'x', until: '2027-01-01T00:00:00Z' } }).fetchFn)).toEqual({ kind: 'approved', checked: 'x', until: '2027-01-01T00:00:00Z' });
    expect(await askService(CHECK, { v: 1, access_id: 'st1234', portal: 'p', product: 'bridge', version: '4.0.0', install_id: INSTALL }, fakeService({ body: { approved: false, requestPage: 'https://evil.example/x' } }).fetchFn)).toEqual({ kind: 'denied', requestPage: undefined });
  });

  it('takes the request page only from Licensor\'s own site, and fills the account name in', () => {
    expect(safeSitePage('https://openspineconsortium.com/beethoven/request.html')).toBe('https://openspineconsortium.com/beethoven/request.html');
    expect(safeSitePage('http://openspineconsortium.com/beethoven/request.html')).toBeUndefined();
    expect(safeSitePage('https://openspineconsortium.com.evil.example/beethoven/request.html')).toBeUndefined();
    expect(safeSitePage('https://evil.example/?x=openspineconsortium.com')).toBeUndefined();
    expect(safeSitePage(42)).toBeUndefined();
    expect(requestUrl(undefined, 'st1234')).toBe('https://openspineconsortium.com/beethoven/request.html?access_id=st1234');
    expect(requestUrl('https://openspineconsortium.com/beethoven/request.html', 'a.b@c')).toBe('https://openspineconsortium.com/beethoven/request.html?access_id=a.b%40c');
    expect(requestUrl('https://evil.example/request.html', 'st1234')).toBe('https://openspineconsortium.com/beethoven/request.html?access_id=st1234');
    expect(requestUrl(undefined)).toBe(REQUEST_PAGE_URL);
  });
});

describe('services.json', () => {
  it('is read once a day, kept on failure, and a copy without the address is kept only for the retry window', async () => {
    const { fetchFn, seen } = fakeService();
    const a = await fetchServices(undefined, fetchFn, () => at(T0));
    expect(a.fresh).toBe(true);
    expect(a.current).toEqual({ fetched_at: iso(T0), access_check: CHECK, request_page: REQUEST_PAGE_URL });
    const b = await fetchServices(a.current, fetchFn, () => at(T0 + SERVICES_TTL_MS - 1));
    expect(b.fresh).toBe(false);
    expect(seen).toHaveLength(1);
    const c = await fetchServices(a.current, fetchFn, () => at(T0 + SERVICES_TTL_MS + 1));
    expect(c.fresh).toBe(true);
    expect(seen).toHaveLength(2);
    // offline: the last copy stands, however old
    const off = await fetchServices(a.current, fakeService({ throwOn: 'services' }).fetchFn, () => at(T0 + 3 * SERVICES_TTL_MS));
    expect(off.current).toBe(a.current);
    expect(off.detail).toMatch(/unreachable/);
    // the published file does not name access_check yet: nothing is compiled in, so the check cannot be made, and the copy ages out in fifteen minutes
    const noKey = fakeService({ servicesBody: { license_service: 'https://x/trial' } });
    const d = await fetchServices(undefined, noKey.fetchFn, () => at(T0));
    expect(d.current?.access_check).toBeUndefined();
    expect(d.detail).toMatch(/names no access_check/);
    expect((await fetchServices(d.current, noKey.fetchFn, () => at(T0 + RETRY_MS - 1))).fresh).toBe(false);
    expect((await fetchServices(d.current, noKey.fetchFn, () => at(T0 + RETRY_MS + 1))).fresh).toBe(true);
    const out = await checkAccess({ services: d.current, accessId: 'st1234', portal: 'p.example', version: '4.0.0', installId: INSTALL, fetchFn: noKey.fetchFn, now: () => at(T0) });
    expect(out.asked).toBe(false);
    expect(out.record.last_error).toMatch(/address of Licensor's access service is not known/);
    // only https addresses are taken
    const bad = await fetchServices(undefined, fakeService({ servicesBody: { access_check: 'http://x/access_check', request_page: 'javascript:alert(1)' } }).fetchFn, () => at(T0));
    expect(bad.current).toEqual({ fetched_at: iso(T0) });
  });
});

describe('the caches and the grace windows', () => {
  it('an approval under a day old is never asked again, not even by a click; past a day it is, and it stays good for seven days without an answer', async () => {
    const fresh = approvedRecord(APPROVED_TTL_MS - 1);
    expect(accessDue(fresh, at(T0))).toBe(false);
    expect(accessDue(fresh, at(T0), true)).toBe(false);
    const held = await checkAccess({ previous: fresh, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0), force: true });
    expect(held.asked).toBe(false);
    expect(held.record).toBe(fresh);
    expect(accessDue(approvedRecord(APPROVED_TTL_MS + 1), at(T0))).toBe(true);
    // the service is down: the approval is kept, the attempt is noted, and the next attempt waits fifteen minutes
    const down = fakeService({ throwOn: 'check' });
    const kept = await checkAccess({ previous: approvedRecord(APPROVED_TTL_MS + 1), services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: down.fetchFn, now: () => at(T0) });
    expect(kept.record.approved).toBe(true);
    expect(kept.record.last_error).toMatch(/could not be reached/);
    expect(accessDue(kept.record, at(T0 + RETRY_MS - 1))).toBe(false);
    expect(accessDue(kept.record, at(T0 + RETRY_MS - 1), true)).toBe(true);
    expect(accessDue(kept.record, at(T0 + RETRY_MS + 1))).toBe(true);
    const f = (ageMs: number) => accessFact({ record: approvedRecord(ageMs, { last_error: 'x' }), accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', now: at(T0) });
    expect(f(APPROVED_TTL_MS - 1)).toMatchObject({ ok: true, state: 'approved', warn: false, needsCheck: false });
    expect(f(APPROVED_TTL_MS + RETRY_MS + 1)).toMatchObject({ ok: true, state: 'stale', warn: true, needsCheck: true });
    expect(f(APPROVED_GRACE_MS - 1).ok).toBe(true);
    expect(f(APPROVED_GRACE_MS + 1)).toMatchObject({ ok: false, state: 'lapsed', needsCheck: true });
    expect(f(APPROVED_GRACE_MS + 1).detail).toMatch(/has not answered for seven days/);
  });

  it('a refusal is kept ten minutes and a click asks again at once; an approval that came in the meantime is then seen', async () => {
    const denied = deniedRecord(DENIED_TTL_MS - 1);
    expect(accessDue(denied, at(T0))).toBe(false);
    expect(accessDue(denied, at(T0), true)).toBe(true);
    expect(accessDue(deniedRecord(DENIED_TTL_MS + 1), at(T0))).toBe(true);
    const held = await checkAccess({ previous: denied, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0) });
    expect(held.asked).toBe(false);
    expect(held.detail).toMatch(/less than ten minutes old/);
    const clicked = await checkAccess({ previous: denied, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0), force: true });
    expect(clicked.asked).toBe(true);
    expect(clicked.record.approved).toBe(true);
  });

  it('a record for another account or another portal is discarded, not updated', async () => {
    const other = approvedRecord(0, { access_id: 'zz9999' });
    const out = await checkAccess({ previous: other, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', installId: INSTALL, fetchFn: fakeService().fetchFn, now: () => at(T0) });
    expect(out.asked).toBe(true);
    expect(out.record.access_id).toBe('st1234');
    const elsewhere = approvedRecord(0, { portal: 'ondemand.osc.edu' });
    expect(accessFact({ record: elsewhere, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', now: at(T0) })).toMatchObject({ ok: false, state: 'checking', needsCheck: true });
    expect(accessFact({ record: other, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', now: at(T0) })).toMatchObject({ ok: false, state: 'checking' });
  });
});

describe('the pure decision', () => {
  const on = (record: AccessRecord | undefined, extra: Partial<Parameters<typeof accessFact>[0]> = {}) => accessFact({ record, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', now: at(T0), ...extra });

  it('says approved for <account> at <portal> (checked <time>), and where "Ask for access" goes', () => {
    const f = on(approvedRecord(3_600_000));
    expect(f.ok).toBe(true);
    expect(f.detail).toBe('Access approved for st1234 at ondemand.grid.wayne.edu (checked 2026-09-29 11:00 UTC)');
    expect(f.requestUrl).toBe('https://openspineconsortium.com/beethoven/request.html?access_id=st1234');
    expect(f.checkedAt).toBe(T0 - 3_600_000);
    expect(f.accessId).toBe('st1234');
    expect(f.portal).toBe('ondemand.grid.wayne.edu');
  });

  it('a refusal, a withdrawal and an approval that ended are refusals with different sentences', () => {
    expect(on(deniedRecord(1))).toMatchObject({ ok: false, state: 'denied', needsCheck: false });
    expect(on(deniedRecord(1)).detail).toMatch(/st1234 at ondemand\.grid\.wayne\.edu is not on the approved list yet/);
    expect(on(deniedRecord(DENIED_TTL_MS + 1)).needsCheck).toBe(true);
    const w = on(deniedRecord(1, { withdrawn: true }));
    expect(w).toMatchObject({ ok: false, state: 'withdrawn' });
    expect(w.detail).toMatch(/^Access withdrawn: ask again/);
    const ended = on(approvedRecord(1, { until: iso(T0 - 1) }));
    expect(ended).toMatchObject({ ok: false, state: 'denied' });
    expect(ended.detail).toMatch(/ended on 2026-09-29/);
    expect(on(approvedRecord(1, { until: iso(T0 + 86_400_000) })).ok).toBe(true);
  });

  it('nothing on record, no answer yet, no account name, a withdrawn version, a check in flight and a failed attempt', () => {
    expect(on(undefined)).toMatchObject({ ok: false, state: 'checking', needsCheck: true });
    const noAnswer: AccessRecord = { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', last_attempt_at: iso(T0 - 1), last_error: 'ENETUNREACH' };
    expect(on(noAnswer)).toMatchObject({ ok: false, state: 'unreachable', needsCheck: false });
    expect(on(noAnswer).detail).toMatch(/ENETUNREACH/);
    expect(on({ ...noAnswer, last_attempt_at: iso(T0 - RETRY_MS - 1) }).needsCheck).toBe(true);
    expect(on(approvedRecord(1), { accessId: undefined })).toMatchObject({ ok: false, state: 'no-identity', needsCheck: true });
    expect(on(approvedRecord(1), { versionRevoked: true, revokedMessage: 'update please' })).toMatchObject({ ok: false, state: 'version-revoked', needsCheck: false, versionRevoked: true });
    expect(on(approvedRecord(1), { versionRevoked: true }).detail).toMatch(/has been withdrawn; update to continue/);
    expect(on(undefined, { checking: true })).toMatchObject({ ok: false, state: 'checking', needsCheck: false });
    expect(on(undefined, { failed: 'Your portal has not shown who is signed in yet' })).toMatchObject({ ok: false, state: 'failed', needsCheck: false, detail: 'Your portal has not shown who is signed in yet' });
    // a failed attempt does not override an answer on file
    expect(on(approvedRecord(1), { failed: 'x' }).state).toBe('approved');
    // no portal named: the record's own portal is shown
    expect(on(approvedRecord(1), { portal: undefined })).toMatchObject({ ok: true, portal: 'ondemand.grid.wayne.edu' });
  });
});

describe('against the mock portal\'s stand-in for the service', () => {
  it('approves st1234 and refuses another account, over the exact wire contract, with no cookie', async () => {
    const mock = await createMockPortal({ user: 'st1234', seedTool: false });
    try {
      const servicesUrl = `${mock.origin}/beethoven/services.json`;
      const yes = await checkAccess({ accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', installId: INSTALL, fetchFn: fetch, servicesUrl });
      expect(yes.record).toMatchObject({ approved: true, access_id: 'st1234', until: null });
      expect(yes.services?.access_check).toBe(`${mock.origin}/beethoven/access_check`);
      const no = await checkAccess({ services: yes.services, accessId: 'zz9999', portal: '127.0.0.1', version: '4.0.0', installId: INSTALL, fetchFn: fetch, servicesUrl });
      expect(no.record).toMatchObject({ approved: false, access_id: 'zz9999', request_page: REQUEST_PAGE_URL });
      expect(mock.state.accessChecks).toBe(2);
      expect(mock.state.accessBodies).toEqual([
        { v: 1, access_id: 'st1234', portal: '127.0.0.1', product: 'bridge', version: '4.0.0', install_id: INSTALL },
        { v: 1, access_id: 'zz9999', portal: '127.0.0.1', product: 'bridge', version: '4.0.0', install_id: INSTALL },
      ]);
      // the approved account is bound to the installation that asked; the other is bound to nothing
      expect(mock.state.seats).toEqual({ st1234: INSTALL });
      for (const h of mock.state.accessHeaders) {
        expect(h['content-type']).toBe('text/plain;charset=UTF-8');
        expect(h.cookie).toBe('');
      }
      // the preflight and the CORS headers the real Worker must send, so a browser lets the answer through
      const pre = await fetch(`${mock.origin}/beethoven/access_check`, { method: 'OPTIONS' });
      expect(pre.status).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe('*');
      expect(pre.headers.get('access-control-allow-methods')).toMatch(/POST/);
      const post = await fetch(`${mock.origin}/beethoven/access_check`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: '{"v":1' });
      expect(post.status).toBe(400);
      expect(post.headers.get('access-control-allow-origin')).toBe('*');
      expect(post.headers.get('cache-control')).toBe('no-store');
    } finally {
      await mock.close();
    }
  });

  it('a 429 from the service keeps the last word and says so', async () => {
    const mock = await createMockPortal({ user: 'st1234', seedTool: false, accessLimit: 1 });
    try {
      const servicesUrl = `${mock.origin}/beethoven/services.json`;
      const first = await checkAccess({ accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', installId: INSTALL, fetchFn: fetch, servicesUrl, now: () => at(T0) });
      expect(first.record.approved).toBe(true);
      const second = await checkAccess({ previous: first.record, services: first.services, accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', installId: INSTALL, fetchFn: fetch, servicesUrl, now: () => at(T0 + APPROVED_TTL_MS + 1) });
      expect(second.asked).toBe(true);
      expect(second.fresh).toBe(false);
      expect(second.record.approved).toBe(true);
      expect(second.record.last_error).toMatch(/too many checks/);
    } finally {
      await mock.close();
    }
  });

  it('binds an approved account to the first installation, refuses a second until the approval is moved, and asks a build without an identifier to update', async () => {
    const mock = await createMockPortal({ user: 'st1234', seedTool: false });
    try {
      const servicesUrl = `${mock.origin}/beethoven/services.json`;
      const check = `${mock.origin}/beethoven/access_check`;
      // force: a person's click, so a refusal on file is asked again at once
      const ask = (installId: string, previous?: AccessRecord, t = T0, accessId = 'st1234') => checkAccess({ previous, accessId, portal: '127.0.0.1', version: '8.0.0', installId, fetchFn: fetch, servicesUrl, now: () => at(t), force: true });
      const first = await ask(INSTALL);
      expect(first.record).toMatchObject({ approved: true });
      expect(mock.state.seats).toEqual({ st1234: INSTALL });
      // the same installation again: still approved, the seat as it was
      expect((await ask(INSTALL)).record.approved).toBe(true);
      // another computer, another browser profile or a reinstall: a new identifier, refused, the seat unchanged, the conflict counted
      const second = await ask(OTHER);
      expect(second.record).toMatchObject({ approved: false, reason: 'other_installation', request_page: REQUEST_PAGE_URL });
      expect(accessFact({ record: second.record, accessId: 'st1234', portal: '127.0.0.1', now: at(T0) })).toMatchObject({ state: 'other-installation', detail: OTHER_INSTALLATION });
      expect(mock.state.seats).toEqual({ st1234: INSTALL });
      expect(mock.state.conflicts).toEqual({ st1234: 1 });
      // the maintainer's "Move the approval to the new installation": the second is approved at its next check
      mock.state.seats.st1234 = OTHER;
      const movedHere = await ask(OTHER, second.record, T0 + 1);
      expect(movedHere.record).toMatchObject({ approved: true });
      expect(movedHere.record.reason).toBeUndefined();
      // and the first, once its day is up, hears the reason, not "Access withdrawn"
      const movedAway = await ask(INSTALL, first.record, T0 + APPROVED_TTL_MS + 1);
      expect(movedAway.record).toMatchObject({ approved: false, withdrawn: true, reason: 'other_installation' });
      expect(accessFact({ record: movedAway.record, accessId: 'st1234', portal: '127.0.0.1', now: at(T0 + APPROVED_TTL_MS + 1) }).state).toBe('other-installation');
      // an account not on the list: a plain no, and it is bound to nothing
      const stranger = await ask(OTHER, undefined, T0, 'zz9999');
      expect(stranger.record).toMatchObject({ approved: false });
      expect(stranger.record.reason).toBeUndefined();
      expect(mock.state.seats.zz9999).toBeUndefined();
      // a build before 8.0.0 sends no identifier: refused with update_required
      const post = (body: unknown) => fetch(check, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) });
      const legacy = await post({ v: 1, access_id: 'st1234', portal: '127.0.0.1', product: 'bridge', version: '7.0.0' });
      expect(await legacy.json()).toMatchObject({ approved: false, access_id: 'st1234', reason: 'update_required' });
      // an identifier that is not one is a malformed request
      expect((await post({ v: 1, access_id: 'st1234', portal: '127.0.0.1', product: 'bridge', version: '8.0.0', install_id: 'x' })).status).toBe(400);
    } finally {
      await mock.close();
    }
  });

  it('one installation, one account: an installation bound to one approved account is refused for another, which stays unbound', async () => {
    const mock = await createMockPortal({ user: 'st1234', seedTool: false, approved: ['st1234', 'ab5678'] });
    try {
      const servicesUrl = `${mock.origin}/beethoven/services.json`;
      const ask = (accessId: string, installId: string) => checkAccess({ accessId, portal: '127.0.0.1', version: '8.0.0', installId, fetchFn: fetch, servicesUrl, now: () => at(T0), force: true });
      expect((await ask('st1234', INSTALL)).record.approved).toBe(true);
      const friend = await ask('ab5678', INSTALL);
      expect(friend.record).toMatchObject({ approved: false, reason: 'other_account' });
      expect(accessFact({ record: friend.record, accessId: 'ab5678', portal: '127.0.0.1', now: at(T0) })).toMatchObject({ state: 'other-account', detail: OTHER_ACCOUNT });
      expect(mock.state.seats).toEqual({ st1234: INSTALL });
      // on an installation of its own the second account is bound as usual
      expect((await ask('ab5678', OTHER)).record.approved).toBe(true);
      expect(mock.state.seats).toEqual({ st1234: INSTALL, ab5678: OTHER });
    } finally {
      await mock.close();
    }
  });

  it('with the identifier optional (the service\'s REQUIRE_INSTALL_ID "0") a build before 8.0.0 is approved; a seat can be bound beforehand', async () => {
    expect(cliOptions([], {})).toMatchObject({ seats: {}, requireInstallId: true });
    const opts = cliOptions(['--seat', `ST1234=${OTHER}`, '--install-optional'], {});
    expect(opts).toMatchObject({ seats: { st1234: OTHER }, requireInstallId: false });
    const mock = await createMockPortal({ user: 'st1234', seedTool: false, seats: opts.seats, requireInstallId: opts.requireInstallId });
    try {
      const legacy = await fetch(`${mock.origin}/beethoven/access_check`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ v: 1, access_id: 'st1234', portal: '127.0.0.1', product: 'bridge', version: '7.0.0' }) });
      expect(await legacy.json()).toMatchObject({ approved: true });
      const here = await checkAccess({ accessId: 'st1234', portal: '127.0.0.1', version: '8.0.0', installId: INSTALL, fetchFn: fetch, servicesUrl: `${mock.origin}/beethoven/services.json`, now: () => at(T0) });
      expect(here.record).toMatchObject({ approved: false, reason: 'other_installation' });
    } finally {
      await mock.close();
    }
  });
});
