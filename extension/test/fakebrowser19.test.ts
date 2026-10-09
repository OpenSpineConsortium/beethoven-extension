// The fake browser's 19.0.0 parts, driven directly: Chrome's HTTP auth cache, webRequest.onAuthRequired as
// Chromium's source reads (none of it measured against the live portal yet), and the worker's life. The
// background tests written against this fake are only as good as these rules, so each is pinned here on its
// own, with no extension code in the way.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXT, ORIGIN, install, openPort, type World } from './fakebrowser';

const DASH = `${ORIGIN}/pun/sys/dashboard/`;
const SOCKET = `wss://ondemand.grid.wayne.edu/pun/sys/shell/ssh/default?csrf=abc123`;
const FILTER = { urls: [`${ORIGIN}/*`] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let world: World;
const wr = () => world.chrome.webRequest;
/** what a listener answers with the pair the grid takes now */
const right = () => ({ authCredentials: { username: world.opts.gridUser, password: world.opts.gridPassword } });
const wrong = { authCredentials: { username: 'st1234', password: 'not-the-password' } };
/** a worker fetch as the background's portal client makes it */
const get = (url = DASH, credentials: RequestCredentials = 'include') => fetch(url, { credentials });
/** nothing a listener was given, nor the pair the grid takes, ever reaches the log or the answers kept */
const noSecretKept = () => {
  const kept = `${world.log.join('\n')}\n${JSON.stringify(world.authAnswers)}`;
  expect(kept).not.toContain(world.opts.gridPassword);
  expect(kept).not.toContain('not-the-password');
};
async function until(f: () => boolean, ms = 2_000) {
  const end = Date.now() + ms;
  while (!f()) {
    if (Date.now() > end) throw new Error('the condition never held');
    await sleep(5);
  }
}

beforeEach(() => {
  world = install();
});
afterEach(() => {
  for (const s of [...world.sockets]) s.close(1000);
});

describe('19.0.0 fake: the grid challenge with no listener (every test before 19.0.0)', () => {
  it('a signed-out worker request gets the 401 with its challenge, and a tab gets Chrome\'s box', async () => {
    world.opts.signedIn = false;
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Basic realm="private"');
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.get(t.id)).toMatchObject({ url: DASH });
    expect(world.log.some((l) => l.endsWith(`Chrome's sign-in box over tab #${t.id}`))).toBe(true);
    expect(world.authAnswers).toEqual([]);
  });

  it('every page behind the sign-in answers 401 signed out, /pun/sys/dashboard/files among them, and each carries the realm', async () => {
    world.opts.signedIn = false;
    world.realm = 'grid';
    for (const p of ['/pun/sys/dashboard/', '/pun/sys/dashboard/files', '/pun/sys/dashboard/files/fs/home/st1234', '/pun/sys/dashboard/files/fs/home/st1234/a?download=1', '/pun/sys/shell/ssh/default']) {
      const res = await get(`${ORIGIN}${p}`);
      expect(res.status, p).toBe(401);
      expect(res.headers.get('www-authenticate'), p).toBe('Basic realm="grid"');
    }
    world.opts.signedIn = true;
    expect((await get(`${ORIGIN}/pun/sys/dashboard/files`)).status).toBe(200);
  });

  it('credentials "omit", and "same-origin" from the worker, carry no sign-in and raise no event', async () => {
    let asked = 0;
    wr().onAuthRequired.addListener(() => void asked++, FILTER, ['blocking']);
    expect((await get(DASH, 'omit')).status).toBe(401);
    expect((await get(DASH, 'same-origin')).status).toBe(401);
    expect(asked).toBe(0);
    // signed in, the cached pair still goes only where Chrome attaches it
    expect((await get(DASH, 'include')).status).toBe(200);
    expect(asked).toBe(0);
  });
});

describe('19.0.0 fake: opts.signedIn over the auth cache', () => {
  it('true seeds the pair the grid takes, false empties the cache, and a password changed on the grid turns it false', () => {
    expect(world.opts.signedIn).toBe(true);
    expect(world.authCache).toEqual({ user: 'st1234', password: world.opts.gridPassword, realm: 'private' });
    world.opts.signedIn = false;
    expect(world.authCache).toBeUndefined();
    world.opts.signedIn = true;
    const before = world.authCache;
    world.opts.gridPassword = 'changed-on-the-grid';
    // the cache still holds the old pair: Chrome does not know yet
    expect(world.authCache).toEqual(before);
    expect(world.opts.signedIn).toBe(false);
    world.authCache = { user: 'st1234', password: 'changed-on-the-grid', realm: 'private' };
    expect(world.opts.signedIn).toBe(true);
  });

  it('a signed-in tab loads with no box, and setting signedIn true takes every waiting box away', async () => {
    const a = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(a.id)).toBe(false);
    world.opts.signedIn = false;
    const b = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(b.id)).toBe(true);
    world.opts.signedIn = true;
    expect(world.boxes.size).toBe(0);
  });
});

describe('19.0.0 fake: registering', () => {
  it('a registration made with no host granted is kept and never dispatched, even after the grant, until it is made again', async () => {
    world.revoke(ORIGIN);
    expect(world.granted.size).toBe(0);
    let early = 0;
    const earlyFn = () => {
      early++;
      return right();
    };
    wr().onAuthRequired.addListener(earlyFn, FILTER, ['blocking']);
    expect(world.log.some((l) => l.endsWith('webRequest.onAuthRequired.addListener refused (no host permission)'))).toBe(true);
    expect(wr().onAuthRequired.hasListener(earlyFn)).toBe(true);
    const added: unknown[] = [];
    world.chrome.permissions.onAdded.addListener((p: unknown) => added.push(p));
    world.grant(ORIGIN);
    expect(added).toEqual([{ origins: [`${ORIGIN}/*`], permissions: [] }]);
    world.grant(ORIGIN);
    expect(added).toHaveLength(1);
    world.opts.signedIn = false;
    expect((await get()).status).toBe(401);
    expect(early).toBe(0);
    // what the background must do on permissions.onAdded: take the listener off and add it again
    wr().onAuthRequired.removeListener(earlyFn);
    expect(wr().onAuthRequired.hasListener(earlyFn)).toBe(false);
    wr().onAuthRequired.addListener(earlyFn, FILTER, ['blocking']);
    expect((await get()).status).toBe(200);
    expect(early).toBe(1);
    noSecretKept();
  });

  it('onCompleted and onErrorOccurred registrations are refused the same way, and revoke fires onRemoved', () => {
    const removed: unknown[] = [];
    world.chrome.permissions.onRemoved.addListener((p: unknown) => removed.push(p));
    world.revoke(ORIGIN);
    expect(removed).toEqual([{ origins: [`${ORIGIN}/*`], permissions: [] }]);
    wr().onCompleted.addListener(() => undefined, FILTER);
    wr().onErrorOccurred.addListener(() => undefined, FILTER);
    expect(world.log.filter((l) => /webRequest\.on(Completed|ErrorOccurred)\.addListener refused \(no host permission\)$/.test(l))).toHaveLength(2);
  });

  it('permissions.request grants what it asks for and fires onAdded; permissions.remove fires onRemoved; each only on a change', async () => {
    const events: string[] = [];
    world.chrome.permissions.onAdded.addListener((p: any) => events.push(`added ${p.origins}`));
    world.chrome.permissions.onRemoved.addListener((p: any) => events.push(`removed ${p.origins}`));
    expect(await world.chrome.permissions.request({ origins: ['https://other.example/*'] })).toBe(true);
    expect(await world.chrome.permissions.request({ origins: ['https://other.example/*'] })).toBe(true);
    expect(await world.chrome.permissions.contains({ origins: ['https://other.example/*'] })).toBe(true);
    expect(await world.chrome.permissions.remove({ origins: ['https://other.example/*'] })).toBe(true);
    expect(await world.chrome.permissions.remove({ origins: ['https://other.example/*'] })).toBe(true);
    expect(events).toEqual(['added https://other.example/*', 'removed https://other.example/*']);
    expect((await world.chrome.permissions.getAll()).permissions).toEqual(expect.arrayContaining(['webRequest', 'webRequestAuthProvider']));
  });

  it('refuses what Chrome refuses: no filter, an unknown extraInfoSpec, blocking with asyncBlocking', () => {
    expect(() => wr().onAuthRequired.addListener(() => undefined)).toThrow(TypeError);
    expect(() => wr().onAuthRequired.addListener(() => undefined, FILTER, ['requestBody'])).toThrow(TypeError);
    expect(() => wr().onAuthRequired.addListener(() => undefined, FILTER, ['blocking', 'asyncBlocking'])).toThrow(TypeError);
    expect(() => wr().onCompleted.addListener(() => undefined, FILTER, ['asyncBlocking'])).toThrow(TypeError);
  });

  it('each addListener call is a listener of its own, the same function twice included, and removeListener takes every copy', async () => {
    world.opts.signedIn = false;
    let calls = 0;
    const fn = () => void calls++;
    wr().onAuthRequired.addListener(fn, FILTER, ['blocking']);
    wr().onAuthRequired.addListener(fn, FILTER, ['blocking']);
    await get();
    expect(calls).toBe(2);
    wr().onAuthRequired.removeListener(fn);
    expect(wr().onAuthRequired.hasListeners()).toBe(false);
    await get();
    expect(calls).toBe(2);
  });

  it('a listener is reached only through its filter and a granted host', async () => {
    world.opts.signedIn = false;
    const hit: string[] = [];
    wr().onAuthRequired.addListener(() => void hit.push('other'), { urls: ['https://other.example/*'] }, ['blocking']);
    wr().onAuthRequired.addListener(() => void hit.push('frames'), { ...FILTER, types: ['main_frame'] }, ['blocking']);
    wr().onAuthRequired.addListener(() => void hit.push('tab 99'), { ...FILTER, tabId: 99 }, ['blocking']);
    wr().onAuthRequired.addListener(() => void hit.push('worker'), { ...FILTER, types: ['xmlhttprequest'], tabId: -1 }, ['blocking']);
    await get();
    expect(hit).toEqual(['worker']);
  });
});

describe('19.0.0 fake: the event and its answers', () => {
  it('gives the details Chrome gives, and logs one line per answer with no user name or password', async () => {
    world.opts.signedIn = false;
    const seen: any[] = [];
    wr().onAuthRequired.addListener((d: any) => (seen.push(d), right()), FILTER, ['blocking', 'responseHeaders']);
    const res = await get();
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ url: DASH, method: 'GET', type: 'xmlhttprequest', tabId: -1, frameId: -1, initiator: EXT, scheme: 'basic', realm: 'private', challenger: { host: 'ondemand.grid.wayne.edu', port: 443 }, isProxy: false, statusCode: 401 });
    expect(typeof seen[0].requestId).toBe('string');
    expect(seen[0].responseHeaders).toEqual([{ name: 'WWW-Authenticate', value: 'Basic realm="private"' }]);
    expect(world.log.some((l) => l.endsWith(`webRequest.onAuthRequired #${seen[0].requestId} xmlhttprequest /pun/sys/dashboard/ tab=-1 -> credentials`))).toBe(true);
    expect(world.authAnswers).toEqual([{ requestId: seen[0].requestId, type: 'xmlhttprequest', tabId: -1, path: '/pun/sys/dashboard/', answer: 'credentials', accepted: true }]);
    // the answer went into the cache: the next request needs no event
    expect(world.opts.signedIn).toBe(true);
    expect((await get()).status).toBe(200);
    expect(seen).toHaveLength(1);
    noSecretKept();
  });

  it('merges Chrome\'s way: any cancel wins over credentials and silence', async () => {
    world.opts.signedIn = false;
    wr().onAuthRequired.addListener(() => right(), FILTER, ['blocking']);
    wr().onAuthRequired.addListener(() => ({ cancel: true }), FILTER, ['blocking']);
    wr().onAuthRequired.addListener(() => undefined, FILTER, ['blocking']);
    expect((await get()).status).toBe(401);
    expect(world.authAnswers.map((a) => a.answer)).toEqual(['cancel']);
    expect(world.authCache).toBeUndefined();
  });

  it('merges Chrome\'s way: with no cancel the first listener\'s credentials are the ones sent', async () => {
    world.opts.signedIn = false;
    world.opts.authRepeatLimit = 1;
    const first = () => right();
    const second = () => wrong;
    wr().onAuthRequired.addListener(() => ({}), FILTER, ['blocking']);
    wr().onAuthRequired.addListener(first, FILTER, ['blocking']);
    wr().onAuthRequired.addListener(second, FILTER, ['blocking']);
    expect((await get()).status).toBe(200);
    wr().onAuthRequired.removeListener(first);
    wr().onAuthRequired.addListener(first, FILTER, ['blocking']);
    world.opts.signedIn = false;
    // now the wrong pair is registered first, so it is the one sent
    expect((await get()).status).toBe(401);
    expect(world.authAnswers.map((a) => a.accepted)).toEqual([true, false]);
    expect(world.badAnswers).toBe(1);
    noSecretKept();
  });

  it('asyncBlocking: Chrome waits for every listener\'s callback before it merges', async () => {
    world.opts.signedIn = false;
    wr().onAuthRequired.addListener((_d: unknown, cb: (r: unknown) => void) => void setTimeout(() => cb(right()), 200), FILTER, ['asyncBlocking']);
    wr().onAuthRequired.addListener((_d: unknown, cb: (r: unknown) => void) => cb({}), FILTER, ['asyncBlocking']);
    const t0 = Date.now();
    expect((await get()).status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
    // a late cancel still beats an early answer
    world.opts.signedIn = false;
    wr().onAuthRequired.addListener((_d: unknown, cb: (r: unknown) => void) => void setTimeout(() => cb({ cancel: true }), 150), FILTER, ['asyncBlocking']);
    expect((await get()).status).toBe(401);
    expect(world.authAnswers.map((a) => a.answer)).toEqual(['credentials', 'cancel']);
  });

  it('asyncBlocking: a listener that never calls back is logged "never answered" and taken as no answer', async () => {
    world.opts.signedIn = false;
    world.opts.authTimeoutMs = 100;
    wr().onAuthRequired.addListener(() => undefined, FILTER, ['asyncBlocking']);
    expect((await get()).status).toBe(401);
    expect(world.log.some((l) => /webRequest\.onAuthRequired #\d+ never answered$/.test(l))).toBe(true);
    expect(world.authAnswers.map((a) => a.answer)).toEqual(['none']);
  });

  it('a returned Promise is no answer: asyncBlocking reads only its callback, blocking takes a Promise as nothing', async () => {
    world.opts.signedIn = false;
    world.opts.authTimeoutMs = 100;
    const async1 = async () => right();
    wr().onAuthRequired.addListener(async1, FILTER, ['asyncBlocking']);
    expect((await get()).status).toBe(401);
    expect(world.log.some((l) => l.endsWith('listener returned a value; Chrome ignores it'))).toBe(true);
    expect(world.log.some((l) => l.endsWith('never answered'))).toBe(true);
    wr().onAuthRequired.removeListener(async1);
    wr().onAuthRequired.addListener(async () => right(), FILTER, ['blocking']);
    world.opts.authTimeoutMs = 3_000;
    const t0 = Date.now();
    expect((await get()).status).toBe(401);
    // blocking does not wait for the timeout: the Promise is read as nothing at once
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(world.log.some((l) => l.endsWith('listener returned a Promise; Chrome takes it as no answer'))).toBe(true);
    expect(world.opts.signedIn).toBe(false);
  });

  it('a callback called twice: the first answer stands and the second is logged and ignored', async () => {
    world.opts.signedIn = false;
    wr().onAuthRequired.addListener(
      (_d: unknown, cb: (r: unknown) => void) => {
        cb(right());
        cb({ cancel: true });
      },
      FILTER,
      ['asyncBlocking'],
    );
    expect((await get()).status).toBe(200);
    expect(world.log.some((l) => l.endsWith('answered twice; the second answer is ignored'))).toBe(true);
  });

  it('wrong credentials fire the event again for the same request, up to authRepeatLimit, then LOOP and the 401', async () => {
    world.opts.signedIn = false;
    world.opts.authRepeatLimit = 3;
    const ids: string[] = [];
    const statuses: number[] = [];
    wr().onCompleted.addListener((d: any) => statuses.push(d.statusCode), FILTER);
    wr().onAuthRequired.addListener((d: any) => (ids.push(d.requestId), wrong), FILTER, ['blocking']);
    expect((await get()).status).toBe(401);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(world.badAnswers).toBe(3);
    expect(world.log.some((l) => l.endsWith(`webRequest.onAuthRequired #${ids[0]} LOOP: 3 answers for one request; the 401 goes through`))).toBe(true);
    await sleep(5);
    expect(statuses).toEqual([401]);
    // a turned-down answer leaves the cache
    expect(world.authCache).toBeUndefined();
    noSecretKept();
  });

  it('wrong credentials and then the right ones: the same request is let in on its second event', async () => {
    world.opts.signedIn = false;
    const ids: string[] = [];
    wr().onAuthRequired.addListener((d: any) => (ids.push(d.requestId), ids.length === 1 ? wrong : right()), FILTER, ['blocking']);
    expect((await get()).status).toBe(200);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(world.authAnswers.map((a) => a.accepted)).toEqual([false, true]);
    expect(world.badAnswers).toBe(1);
  });
});

describe('19.0.0 fake: the cache across requests', () => {
  it('a stale pair is sent by every request that started before the first stale 401, counted as Chrome\'s, then dropped', async () => {
    world.opts.gridPassword = 'changed-on-the-grid';
    const ids: string[] = [];
    const res = await Promise.all([get(), get(), get()]);
    expect(res.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(world.chromeBadTries).toBe(3);
    expect(world.authCache).toBeUndefined();
    // a request that starts after the drop sends nothing at all
    expect((await get()).status).toBe(401);
    expect(world.chromeBadTries).toBe(3);
    // with a listener, each of the requests the stale pair failed meets the event once, and the answer is cached
    world.authCache = { user: 'st1234', password: 'grid-Pass-0f1e2d', realm: 'private' };
    wr().onAuthRequired.addListener((d: any) => (ids.push(d.requestId), right()), FILTER, ['blocking']);
    // the challenges wait until all three have met their stale 401: an answer cached before the last of them
    // would be sent by it with no event (the next test), and how many met the event would hang on timer order
    world.holdChallenges();
    const all = Promise.all([get(), get(), get()]);
    for (let i = 0; i < 200 && world.chromeBadTries < 6; i++) await sleep(10);
    expect(world.chromeBadTries).toBe(6);
    expect(ids).toEqual([]);
    world.releaseChallenges();
    const again = await all;
    expect(again.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(world.chromeBadTries).toBe(6);
    expect(new Set(ids).size).toBe(3);
    expect(world.opts.signedIn).toBe(true);
    expect(world.badAnswers).toBe(0);
  });

  it('after a 401 Chrome sends, by the realm, a pair another request put in the cache meanwhile, with no event', async () => {
    world.opts.signedIn = false;
    let asked = 0;
    wr().onAuthRequired.addListener(() => void asked++, FILTER, ['blocking']);
    world.onPortalRequest = () => void setTimeout(() => (world.opts.signedIn = true), 5);
    expect((await get()).status).toBe(200);
    expect(asked).toBe(0);
    expect(world.authAnswers).toEqual([]);
  });

  it('holdChallenges and releaseChallenges dispatch challenges due together in one task', async () => {
    world.opts.signedIn = false;
    world.holdChallenges();
    let n = 0;
    wr().onAuthRequired.addListener(() => (n++, undefined), FILTER, ['blocking']);
    const pending = Promise.all([get(), get()]);
    await sleep(60);
    expect(n).toBe(0);
    world.releaseChallenges();
    expect(n).toBe(2);
    expect((await pending).map((r) => r.status)).toEqual([401, 401]);
  });

  it('dropAuthRetry: the retry fails as a network error, onErrorOccurred names the request, and the pair is already cached', async () => {
    world.opts.signedIn = false;
    const asked: string[] = [];
    const errors: any[] = [];
    wr().onAuthRequired.addListener((d: any) => (asked.push(d.requestId), right()), FILTER, ['blocking']);
    wr().onErrorOccurred.addListener((d: any) => errors.push(d), FILTER);
    world.dropAuthRetry();
    await expect(get()).rejects.toThrow(TypeError);
    await sleep(5);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ requestId: asked[0], error: 'net::ERR_CONNECTION_RESET', url: DASH, tabId: -1 });
    expect(world.opts.signedIn).toBe(true);
    // only the next retry was lost: the request after it goes in on the cache, with no event
    expect((await get()).status).toBe(200);
    expect(asked).toHaveLength(1);
  });

  it('onCompleted tells each request\'s status, onErrorOccurred a grid out of reach, and neither a refused listener', async () => {
    const done: any[] = [];
    const errors: any[] = [];
    wr().onCompleted.addListener((d: any) => done.push(d), FILTER);
    wr().onErrorOccurred.addListener((d: any) => errors.push(d), FILTER);
    expect((await get()).status).toBe(200);
    world.opts.signedIn = false;
    expect((await get()).status).toBe(401);
    await sleep(5);
    expect(done.map((d) => [d.statusCode, d.type, d.tabId])).toEqual([
      [200, 'xmlhttprequest', -1],
      [401, 'xmlhttprequest', -1],
    ]);
    world.opts.reach = false;
    await expect(get()).rejects.toThrow(TypeError);
    await sleep(5);
    expect(errors.map((d) => d.error)).toEqual(['net::ERR_CONNECTION_TIMED_OUT']);
    world.opts.reach = true;
    world.revoke(ORIGIN);
    const late: unknown[] = [];
    wr().onCompleted.addListener((d: unknown) => late.push(d), FILTER);
    world.grant(ORIGIN);
    await get();
    await sleep(5);
    expect(late).toEqual([]);
  });
});

describe('19.0.0 fake: tabs', () => {
  it('a tab challenge no listener answers gives Chrome\'s box; answerBox puts the pair in the cache, and a wrong pair brings the box back', async () => {
    world.opts.signedIn = false;
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(true);
    expect(world.authAnswers).toEqual([]);
    expect(await world.answerBox(t.id, 'st1234', 'not-the-password')).toBe(false);
    // turned down: the box comes back over the same tab
    expect(world.boxes.has(t.id)).toBe(true);
    expect(world.opts.signedIn).toBe(false);
    expect(await world.answerBox(t.id, 'st1234', world.opts.gridPassword)).toBe(true);
    expect(world.opts.signedIn).toBe(true);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(false);
    await expect(world.answerBox(t.id, 'st1234', 'x')).rejects.toThrow(/no sign-in box/);
    noSecretKept();
  });

  it('a box signed in resumes the boxed request itself: onCompleted 200 under its own id, also for a challenge raised for another path of the tab', async () => {
    world.opts.signedIn = false;
    const done: Array<{ requestId: string; tabId: number; statusCode: number }> = [];
    const asked: string[] = [];
    wr().onCompleted.addListener((d: { requestId: string; tabId: number; statusCode: number }) => done.push(d), FILTER);
    wr().onAuthRequired.addListener((d: { requestId: string; tabId: number }) => void (d.tabId !== -1 && asked.push(d.requestId)), FILTER, ['blocking']);
    const t = world.openTab(`${ORIGIN}/`);
    await sleep(30);
    expect(await world.tabChallenge(t.id, '/pun/sys/dashboard/')).toBe('none');
    expect(world.boxes.has(t.id)).toBe(true);
    expect(asked).toHaveLength(1);
    expect(await world.answerBox(t.id, 'st1234', world.opts.gridPassword)).toBe(true);
    await sleep(30);
    expect(done).toMatchObject([{ requestId: asked[0], tabId: t.id, statusCode: 200 }]);
  });

  it('a tab challenge a listener cancels gives the 401 page and no box (onCompleted 401 for that tab)', async () => {
    world.opts.signedIn = false;
    const done: Array<{ tabId: number; type: string; statusCode: number }> = [];
    wr().onCompleted.addListener((d: { tabId: number; type: string; statusCode: number }) => done.push(d), FILTER);
    wr().onAuthRequired.addListener(() => ({ cancel: true }), { ...FILTER, types: ['main_frame'] }, ['blocking']);
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(false);
    expect(world.authAnswers).toMatchObject([{ type: 'main_frame', tabId: t.id, answer: 'cancel' }]);
    expect(done).toMatchObject([{ tabId: t.id, type: 'main_frame', statusCode: 401 }]);
    expect(world.log.some((l) => l.endsWith(`tab #${t.id}: the 401 page (a listener cancelled the challenge)`))).toBe(true);
    await expect(world.answerBox(t.id, 'st1234', world.opts.gridPassword)).rejects.toThrow(/no sign-in box/);
  });

  it('answeredStatus 403: a turned-down answer ends the request with 403, no second event and no box', async () => {
    world.opts.signedIn = false;
    world.opts.answeredStatus = 403;
    const done: Array<{ tabId: number; statusCode: number }> = [];
    wr().onCompleted.addListener((d: { tabId: number; statusCode: number }) => done.push(d), FILTER);
    wr().onAuthRequired.addListener(() => ({ authCredentials: { username: 'st1234', password: 'not-the-password' } }), FILTER, ['blocking']);
    const res = await fetch(DASH, { credentials: 'include' });
    expect(res.status).toBe(403);
    expect(res.headers.get('www-authenticate')).toBeNull();
    expect(world.authAnswers).toHaveLength(1);
    expect(world.badAnswers).toBe(1);
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(false);
    expect(done.map((d) => d.statusCode)).toEqual([403, 403]);
  });

  it('removeListener lets go of a request the removed listener holds, with no answer: the worker\'s fetch gets the 401', async () => {
    world.opts.signedIn = false;
    const held: Array<(r: unknown) => void> = [];
    const fn = (_d: unknown, cb: (r: unknown) => void) => void held.push(cb);
    wr().onAuthRequired.addListener(fn, FILTER, ['asyncBlocking']);
    const res = fetch(DASH, { credentials: 'include' });
    await sleep(60);
    expect(held).toHaveLength(1);
    wr().onAuthRequired.removeListener(fn);
    expect((await res).status).toBe(401);
    expect(world.log.some((l) => /webRequest\.onAuthRequired #\d+ let go unanswered \(the listener was removed\)$/.test(l))).toBe(true);
    // the late callback reaches nothing
    held[0]!({ authCredentials: { username: 'st1234', password: world.opts.gridPassword } });
    expect(world.authAnswers.map((a) => a.answer)).toEqual(['none']);
  });

  it('a tab challenge a listener answers loads the page, and tabChallenge challenges whatever the cache holds', async () => {
    const t = world.openTab(DASH);
    await sleep(30);
    expect(await world.tabChallenge(t.id, '/pun/sys/dashboard/files')).toBe('none');
    expect(world.boxes.get(t.id)).toMatchObject({ url: `${ORIGIN}/pun/sys/dashboard/files` });
    wr().onAuthRequired.addListener(() => right(), FILTER, ['blocking']);
    const u = world.openTab(`${ORIGIN}/pun/sys/shell/ssh/default`);
    await sleep(30);
    expect(world.boxes.has(u.id)).toBe(false);
    expect(await world.tabChallenge(u.id, '/pun/sys/dashboard/')).toBe('credentials');
    expect(world.boxes.has(u.id)).toBe(false);
    expect(world.authAnswers.at(-1)).toMatchObject({ type: 'main_frame', tabId: u.id, path: '/pun/sys/dashboard/', answer: 'credentials', accepted: true });
  });

  it('a box belongs to its navigation: it goes when the tab moves on or closes, and a late answer never boxes a page left', async () => {
    world.opts.signedIn = false;
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(true);
    world.navigate(t.id, 'https://example.org/reading');
    expect(world.boxes.has(t.id)).toBe(false);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(false);
    world.navigate(t.id, DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(true);
    world.closeTab(t.id);
    expect(world.boxes.has(t.id)).toBe(false);
    // the student leaves while a listener is still thinking: its "no" comes too late for a box
    wr().onAuthRequired.addListener((_d: unknown, cb: (r: unknown) => void) => void setTimeout(() => cb({}), 60), FILTER, ['asyncBlocking']);
    const u = world.openTab(DASH);
    await sleep(20);
    world.navigate(u.id, 'https://example.org/reading');
    await sleep(100);
    expect(world.boxes.has(u.id)).toBe(false);
  });

  it('a page script\'s request is the tab\'s, with the portal as initiator', async () => {
    world.opts.signedIn = false;
    world.opts.pageScript = true;
    const seen: any[] = [];
    wr().onAuthRequired.addListener((d: any) => void seen.push(d), FILTER, ['blocking']);
    const t = world.openTab(DASH);
    await sleep(30);
    seen.length = 0;
    const r = await world.chrome.tabs.sendMessage(t.id, { type: 'portal.call', op: 'session' });
    expect(r?.value?.signedIn).toBe(false);
    expect(seen[0]).toMatchObject({ type: 'xmlhttprequest', tabId: t.id, initiator: ORIGIN });
  });
});

describe('19.0.0 fake: the worker\'s WebSocket rides the cache', () => {
  function open(url = SOCKET) {
    const ws = new (globalThis as any).WebSocket(url);
    const got: string[] = [];
    let code: number | undefined;
    ws.addEventListener('open', () => got.push('open'));
    ws.addEventListener('error', () => got.push('error'));
    ws.addEventListener('close', (e: any) => (got.push('close'), (code = e.code)));
    return { ws, got, code: () => code };
  }

  it('opens on a pair the grid takes, and fails before open without one, with no event ever', async () => {
    let asked = 0;
    wr().onAuthRequired.addListener(() => (asked++, right()), { urls: ['<all_urls>'] }, ['blocking']);
    const a = open();
    await sleep(40);
    expect(a.got).toEqual(['open']);
    world.opts.signedIn = false;
    const b = open();
    await sleep(40);
    expect(b.got).toEqual(['error', 'close']);
    expect(b.code()).toBe(1006);
    expect(b.ws.readyState).toBe(3);
    expect(asked).toBe(0);
    expect(world.log.some((l) => l.includes('ws /pun/sys/shell/ssh/default: handshake 401'))).toBe(true);
  });

  it('is a portal request of type websocket for onPortalRequest, and one the student cannot be asked about', async () => {
    const started: Array<{ type: string; tabId: number }> = [];
    world.onPortalRequest = (r) => started.push(r);
    world.opts.signedIn = false;
    const a = open();
    await sleep(40);
    expect(started).toMatchObject([{ type: 'websocket', tabId: -1, url: SOCKET }]);
    expect(a.got).toEqual(['error', 'close']);
    expect(world.boxes.size).toBe(0);
  });

  it('takes the pair the cache held when it started, and a stale one is Chrome\'s bad try and leaves the cache', async () => {
    const a = open();
    world.opts.signedIn = false;
    await sleep(40);
    expect(a.got).toEqual(['open']);
    world.opts.signedIn = true;
    world.opts.gridPassword = 'changed-on-the-grid';
    const b = open();
    await sleep(40);
    expect(b.got).toEqual(['error', 'close']);
    expect(world.chromeBadTries).toBe(1);
    expect(world.authCache).toBeUndefined();
  });
});

describe('19.0.0 fake: the build without webRequest', () => {
  it('install({ webRequest: false }) has no webRequest and declares neither of its permissions; tabs get the box', async () => {
    world = install({ webRequest: false });
    expect(world.chrome.webRequest).toBeUndefined();
    const perms = world.chrome.runtime.getManifest().permissions as string[];
    expect(perms).not.toContain('webRequest');
    expect(perms).not.toContain('webRequestAuthProvider');
    expect(await world.chrome.permissions.contains({ permissions: ['webRequest'] })).toBe(false);
    world.opts.signedIn = false;
    expect((await get()).status).toBe(401);
    const t = world.openTab(DASH);
    await sleep(30);
    expect(world.boxes.has(t.id)).toBe(true);
    expect(await world.answerBox(t.id, 'st1234', world.opts.gridPassword)).toBe(true);
    expect((await get()).status).toBe(200);
  });

  it('the Chrome build declares webRequest and webRequestAuthProvider, and nothing the product forbids', async () => {
    const perms = world.chrome.runtime.getManifest().permissions as string[];
    expect(perms).toEqual(expect.arrayContaining(['webRequest', 'webRequestAuthProvider']));
    for (const p of ['cookies', 'tabs', 'debugger', 'identity', 'declarativeNetRequest', 'nativeMessaging', 'webRequestBlocking']) expect(perms).not.toContain(p);
    expect(await world.chrome.permissions.contains({ permissions: ['webRequestAuthProvider'] })).toBe(true);
    expect(await world.chrome.permissions.contains({ permissions: ['cookies'] })).toBe(false);
    expect(await world.chrome.permissions.contains({ origins: [`${ORIGIN}/*`], permissions: ['webRequest'] })).toBe(true);
  });
});

describe('19.0.0 fake: challenges that are not the grid\'s', () => {
  it('a proxy, another realm and another origin reach a listener as Chrome would show them, and are never cached', async () => {
    world.opts.signedIn = false;
    const seen: any[] = [];
    wr().onAuthRequired.addListener((d: any) => (seen.push(d), right()), { urls: ['<all_urls>'] }, ['blocking']);
    expect(await world.proxyChallenge()).toBe('credentials');
    expect(seen[0]).toMatchObject({ isProxy: true, statusCode: 407, challenger: { host: 'proxy.wayne.edu', port: 3128 } });
    expect(await world.realmChallenge('elsewhere')).toBe('credentials');
    expect(seen[1]).toMatchObject({ realm: 'elsewhere', isProxy: false, challenger: { host: 'ondemand.grid.wayne.edu', port: 443 } });
    // another origin reaches a listener only once its host is granted
    expect(await world.originChallenge('https://other.example')).toBe('none');
    expect(seen).toHaveLength(2);
    world.grant('https://other.example');
    expect(await world.originChallenge('https://other.example:8443')).toBe('credentials');
    expect(seen[2]).toMatchObject({ url: 'https://other.example:8443/pun/sys/dashboard/', challenger: { host: 'other.example', port: 8443 } });
    expect(world.authAnswers.every((a) => a.foreign === true && a.accepted === undefined)).toBe(true);
    expect(world.authCache).toBeUndefined();
    noSecretKept();
  });
});

describe('19.0.0 fake: the worker\'s life', () => {
  it('stopWorker empties every listener, lets a held event go unanswered, closes sockets 1006 and keeps storage', async () => {
    world.opts.signedIn = false;
    await world.chrome.storage.local.set({ 'bridge.kept': 1 });
    let held = false;
    wr().onAuthRequired.addListener(() => void (held = true), FILTER, ['asyncBlocking']);
    wr().onCompleted.addListener(() => undefined, FILTER);
    world.chrome.runtime.onMessage.addListener(() => undefined);
    world.chrome.permissions.onAdded.addListener(() => undefined);
    world.chrome.alarms.onAlarm.addListener(() => undefined);
    const told: unknown[] = [];
    world.chrome.runtime.onConnect.addListener((port: any) => port.onMessage.addListener((m: unknown) => told.push(m)));
    const page = openPort(world, 'panel');
    expect(told).toHaveLength(1);
    world.authCache = { user: 'st1234', password: world.opts.gridPassword, realm: 'private' };
    const sock = new (globalThis as any).WebSocket(SOCKET);
    let closed: number | undefined;
    sock.addEventListener('close', (e: any) => (closed = e.code));
    await sleep(40);
    world.opts.signedIn = false;
    const pending = get();
    await until(() => held);
    world.stopWorker();
    expect((await pending).status).toBe(401);
    expect(world.log.some((l) => /webRequest\.onAuthRequired #\d+ let go unanswered \(the worker stopped\)$/.test(l))).toBe(true);
    for (const e of [wr().onAuthRequired, wr().onCompleted, wr().onErrorOccurred]) expect(e.hasListeners()).toBe(false);
    for (const e of [world.chrome.runtime.onMessage, world.chrome.runtime.onConnect, world.chrome.permissions.onAdded, world.chrome.permissions.onRemoved, world.chrome.alarms.onAlarm, world.chrome.tabs.onUpdated]) expect(e.ls).toHaveLength(0);
    page.tick();
    expect(told).toHaveLength(1);
    await sleep(5);
    expect(closed).toBe(1006);
    expect(world.storage.local['bridge.kept']).toBe(1);
  });

  it('restartBrowser empties storage.session, the auth cache and the boxes, and keeps storage.local', async () => {
    await world.chrome.storage.local.set({ 'bridge.kept': 1 });
    await world.chrome.storage.session.set({ 'bridge.signinUnlock': { at: 1 } });
    world.opts.signedIn = false;
    const t = world.openTab(DASH);
    await sleep(30);
    world.opts.signedIn = true;
    world.boxes.set(t.id, { requestId: 'x', url: DASH });
    world.restartBrowser();
    expect(world.storage.session).toEqual({});
    expect(world.authCache).toBeUndefined();
    expect(world.opts.signedIn).toBe(false);
    expect(world.boxes.size).toBe(0);
    expect(world.storage.local['bridge.kept']).toBe(1);
    expect(world.log.some((l) => l.endsWith('the browser restarted: storage.session and the HTTP auth cache are empty'))).toBe(true);
  });

  it('fireAlarm fires a set alarm and waits for its listeners; a one-time alarm is then gone', async () => {
    const fired: any[] = [];
    world.chrome.alarms.onAlarm.addListener(async (a: any) => {
      await sleep(20);
      fired.push(a);
    });
    await world.chrome.alarms.create('once', { delayInMinutes: 1 });
    await world.chrome.alarms.create('every', { periodInMinutes: 1 });
    expect(await world.fireAlarm('once')).toBe(true);
    expect(fired.map((a) => a.name)).toEqual(['once']);
    expect(await world.fireAlarm('once')).toBe(false);
    expect(await world.fireAlarm('every')).toBe(true);
    expect(await world.fireAlarm('every')).toBe(true);
    expect(fired.map((a) => a.name)).toEqual(['once', 'every', 'every']);
    expect(typeof fired[0].scheduledTime).toBe('number');
  });

  it('getPlatformInfo says the operating system world.os names, Windows when none', async () => {
    expect((await world.chrome.runtime.getPlatformInfo()).os).toBe('win');
    world.os = 'mac';
    expect((await world.chrome.runtime.getPlatformInfo()).os).toBe('mac');
  });

  it('storage.session.setAccessLevel is kept and logged', async () => {
    expect(world.sessionAccessLevel).toBeUndefined();
    await world.chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(world.sessionAccessLevel).toBe('TRUSTED_CONTEXTS');
    expect(world.log.some((l) => l.endsWith('storage.session.setAccessLevel TRUSTED_CONTEXTS'))).toBe(true);
  });

  it('there is no IndexedDB unless the test asks for one, and deleteDatabase is logged', async () => {
    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
    world = install({ indexedDB: true });
    const idb = world.idb!;
    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBe(idb);
    await new Promise<void>((r) => {
      const req = idb.open('beethoven-signin');
      req.onsuccess = () => r();
    });
    expect((await idb.databases()).map((d) => d.name)).toEqual(['beethoven-signin']);
    await new Promise<void>((r) => {
      const req = idb.deleteDatabase('beethoven-signin');
      req.onsuccess = () => r();
    });
    expect(world.log.some((l) => l.endsWith('indexedDB.deleteDatabase beethoven-signin'))).toBe(true);
    // the next install without one does not inherit it
    world = install();
    expect((globalThis as { indexedDB?: unknown }).indexedDB).toBeUndefined();
  });
});
