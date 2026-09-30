// Access by Licensor's approved list, with no key anywhere: the wire request is exactly the one
// the service codes to, every answer it can give lands in the record it should, the caches and
// grace windows hold (a day for an approval, seven days without the service, ten minutes for a
// refusal, fifteen minutes after no answer, a click asks again), a withdrawn approval is told
// apart from a plain refusal, the request page carries the account name, and the pure decision
// turns each record into the one state the strip and check 1 show. The last block runs the same
// client against the mock portal's stand-in for the service.
import { describe, expect, it } from 'vitest';
import { createMockPortal } from '../mock-ood/server.mjs';
import { accessDue, accessFact, APPROVED_GRACE_MS, APPROVED_TTL_MS, askService, checkAccess, DENIED_TTL_MS, fetchServices, normalizeAccount, PRODUCT, REQUEST_PAGE_URL, requestUrl, RETRY_MS, safeSitePage, SERVICES_TTL_MS, SERVICES_URL, type AccessRecord, type StoredServices } from '../src/licensing/access';

const T0 = Date.parse('2026-09-29T12:00:00Z');
const at = (ms: number) => new Date(ms);
const iso = (ms: number) => new Date(ms).toISOString();
const CHECK = 'https://beethoven-access.openspineconsortium.workers.dev/access_check';
const SERVICES: StoredServices = { fetched_at: iso(T0), access_check: CHECK, request_page: REQUEST_PAGE_URL };

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

describe('the wire request', () => {
  it('is one POST with a text/plain JSON body of exactly {v, access_id, portal, product, version}, without cookies', async () => {
    const { fetchFn, seen } = fakeService();
    const out = await checkAccess({ accessId: 'ST1234', portal: 'OnDemand.grid.wayne.edu', version: '4.0.0', fetchFn, now: () => at(T0) });
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
    expect(JSON.parse(String(post.body))).toEqual({ v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', product: 'bridge', version: '4.0.0' });
    expect(Object.keys(JSON.parse(String(post.body)))).toEqual(['v', 'access_id', 'portal', 'product', 'version']);
    expect(PRODUCT).toBe('bridge');
    expect(seen[0]!.init.credentials).toBe('omit');
    // the address came from services.json, and the services are handed back to be stored
    expect(out.services).toMatchObject({ access_check: CHECK, request_page: REQUEST_PAGE_URL });
  });

  it('refuses to ask for anything that is not an account name, and asks about nothing typed', async () => {
    const { fetchFn, seen } = fakeService();
    await expect(checkAccess({ accessId: 'not an account', portal: 'p', version: '4.0.0', fetchFn })).rejects.toThrow(/not an account name/);
    await expect(checkAccess({ accessId: '', portal: 'p', version: '4.0.0', fetchFn })).rejects.toThrow(/not an account name/);
    await expect(checkAccess({ accessId: 'st1234', portal: '', version: '4.0.0', fetchFn })).rejects.toThrow(/no portal/);
    expect(seen).toHaveLength(0);
    expect(normalizeAccount(' ST1234 ')).toBe('st1234');
    expect(normalizeAccount('a.b_c-d@e')).toBe('a.b_c-d@e');
    expect(normalizeAccount('/home/st1234')).toBeUndefined();
    expect(normalizeAccount(undefined)).toBeUndefined();
  });
});

describe('the answers', () => {
  it('200 approved:false is a refusal with the request page; approved:false after an approval is a withdrawal', async () => {
    const { fetchFn } = fakeService({ approved: [] });
    const first = await checkAccess({ accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn, now: () => at(T0) });
    expect(first.record).toMatchObject({ approved: false, request_page: REQUEST_PAGE_URL, checked_at: iso(T0) });
    expect(first.record.withdrawn).toBeUndefined();
    expect(first.detail).toMatch(/not on the approved list yet/);
    const later = await checkAccess({ previous: approvedRecord(2 * APPROVED_TTL_MS), accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn, now: () => at(T0) });
    expect(later.record).toMatchObject({ approved: false, withdrawn: true });
    expect(later.record.until).toBeUndefined();
    expect(later.detail).toMatch(/withdrawn/);
    // approved again later: the withdrawal is forgotten
    const again = await checkAccess({ previous: later.record, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService().fetchFn, now: () => at(T0 + DENIED_TTL_MS + 1) });
    expect(again.record).toMatchObject({ approved: true });
    expect(again.record.withdrawn).toBeUndefined();
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
      const out = await checkAccess({ previous: prev, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService(o).fetchFn, now: () => at(T0) });
      expect(out.asked, why.source).toBe(true);
      expect(out.fresh, why.source).toBe(false);
      expect(out.record.approved, why.source).toBe(true);
      expect(out.record.checked_at, why.source).toBe(prev.checked_at);
      expect(out.record.last_attempt_at, why.source).toBe(iso(T0));
      expect(out.record.last_error, why.source).toMatch(why);
      expect(out.detail, why.source).toMatch(why);
    }
    // askService alone, for the two answers it accepts
    expect(await askService(CHECK, { v: 1, access_id: 'st1234', portal: 'p', product: 'bridge', version: '4.0.0' }, fakeService({ body: { approved: true, access_id: 'st1234', checked: 'x', until: '2027-01-01T00:00:00Z' } }).fetchFn)).toEqual({ kind: 'approved', checked: 'x', until: '2027-01-01T00:00:00Z' });
    expect(await askService(CHECK, { v: 1, access_id: 'st1234', portal: 'p', product: 'bridge', version: '4.0.0' }, fakeService({ body: { approved: false, requestPage: 'https://evil.example/x' } }).fetchFn)).toEqual({ kind: 'denied', requestPage: undefined });
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
    const out = await checkAccess({ services: d.current, accessId: 'st1234', portal: 'p.example', version: '4.0.0', fetchFn: noKey.fetchFn, now: () => at(T0) });
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
    const held = await checkAccess({ previous: fresh, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService().fetchFn, now: () => at(T0), force: true });
    expect(held.asked).toBe(false);
    expect(held.record).toBe(fresh);
    expect(accessDue(approvedRecord(APPROVED_TTL_MS + 1), at(T0))).toBe(true);
    // the service is down: the approval is kept, the attempt is noted, and the next attempt waits fifteen minutes
    const down = fakeService({ throwOn: 'check' });
    const kept = await checkAccess({ previous: approvedRecord(APPROVED_TTL_MS + 1), services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: down.fetchFn, now: () => at(T0) });
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
    const held = await checkAccess({ previous: denied, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService().fetchFn, now: () => at(T0) });
    expect(held.asked).toBe(false);
    expect(held.detail).toMatch(/less than ten minutes old/);
    const clicked = await checkAccess({ previous: denied, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService().fetchFn, now: () => at(T0), force: true });
    expect(clicked.asked).toBe(true);
    expect(clicked.record.approved).toBe(true);
  });

  it('a record for another account or another portal is discarded, not updated', async () => {
    const other = approvedRecord(0, { access_id: 'zz9999' });
    const out = await checkAccess({ previous: other, services: SERVICES, accessId: 'st1234', portal: 'ondemand.grid.wayne.edu', version: '4.0.0', fetchFn: fakeService().fetchFn, now: () => at(T0) });
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
      const yes = await checkAccess({ accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', fetchFn: fetch, servicesUrl });
      expect(yes.record).toMatchObject({ approved: true, access_id: 'st1234', until: null });
      expect(yes.services?.access_check).toBe(`${mock.origin}/beethoven/access_check`);
      const no = await checkAccess({ services: yes.services, accessId: 'zz9999', portal: '127.0.0.1', version: '4.0.0', fetchFn: fetch, servicesUrl });
      expect(no.record).toMatchObject({ approved: false, access_id: 'zz9999', request_page: REQUEST_PAGE_URL });
      expect(mock.state.accessChecks).toBe(2);
      expect(mock.state.accessBodies).toEqual([
        { v: 1, access_id: 'st1234', portal: '127.0.0.1', product: 'bridge', version: '4.0.0' },
        { v: 1, access_id: 'zz9999', portal: '127.0.0.1', product: 'bridge', version: '4.0.0' },
      ]);
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
      const first = await checkAccess({ accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', fetchFn: fetch, servicesUrl, now: () => at(T0) });
      expect(first.record.approved).toBe(true);
      const second = await checkAccess({ previous: first.record, services: first.services, accessId: 'st1234', portal: '127.0.0.1', version: '4.0.0', fetchFn: fetch, servicesUrl, now: () => at(T0 + APPROVED_TTL_MS + 1) });
      expect(second.asked).toBe(true);
      expect(second.fresh).toBe(false);
      expect(second.record.approved).toBe(true);
      expect(second.record.last_error).toMatch(/too many checks/);
    } finally {
      await mock.close();
    }
  });
});
