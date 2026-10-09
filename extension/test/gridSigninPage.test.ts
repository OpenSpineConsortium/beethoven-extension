// The page side of Beethoven's own grid sign-in (19.0.0, src/ext/gridSignin.ts): the sheet's Sign in, the
// unlock and Forget, against the fake authenticator (test/fakeauthenticator.ts), the in-memory record
// store and two in-memory storage areas, with a stand-in for the background that records every action.
// No browser global is installed: the module must load and run without one.
//
// What it holds the module to (SPEC_V19 sections 6.5 and 7, I3 to I5, I8): the password reaches the
// sealed record or the one-shot and nothing else (no action, no result, no storage.local, no error);
// the one-shot is gone when the attempt is over; Remember is honoured only where the passkey gives an
// output, and a passkey that cannot is remembered as such (zero prompts the next time); "Type it
// instead" leaves a saved sign-in alone; an unlock is never offered for a password the grid turned
// down; and no other module of the extension makes, unlocks or seals.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIGNIN_NOPRF_KEY, SIGNIN_NOTE_KEY, SIGNIN_ONCE_KEY, SIGNIN_UNLOCK_KEY } from '../src/core/keys';
import type { Action } from '../src/core/model';
import { memoryRecords, openPassword, type SigninRecord } from '../src/core/vault';
import { defaultDeps, gridSignin, type GridSigninDeps, type SigninKV } from '../src/ext/gridSignin';
import { fakeAuthenticator, prfBase64, type FakeAuthenticatorOptions } from './fakeauthenticator';

const ORIGIN = 'https://ondemand.grid.wayne.edu';
const USER = 'st1234';
// planted: distinctive enough that any copy of it, plain or in base64, shows up in a search
const PASSWORD = 'Tr0ub4dor&3-planted-7Qz';
const PASSWORD_B64 = Buffer.from(PASSWORD).toString('base64');
const PASSWORD_B64URL = Buffer.from(PASSWORD).toString('base64url');
const NEW_PASSWORD = 'N3w-planted-Pw!x9';

/** a storage area in memory, with every value ever written kept as JSON */
function memoryArea(): SigninKV & { data: Map<string, unknown>; writes: string[] } {
  const data = new Map<string, unknown>();
  const writes: string[] = [];
  return {
    data,
    writes,
    async get<T>(key: string) {
      return data.has(key) ? (structuredClone(data.get(key)) as T) : undefined;
    },
    async set(key: string, value: unknown) {
      writes.push(JSON.stringify({ [key]: value }));
      data.set(key, structuredClone(value));
    },
    async remove(key: string) {
      data.delete(key);
    },
  };
}

interface Harness {
  fa: ReturnType<typeof fakeAuthenticator>;
  records: ReturnType<typeof memoryRecords>;
  local: ReturnType<typeof memoryArea>;
  session: ReturnType<typeof memoryArea>;
  /** every action the page sent, as JSON at the moment it was sent */
  sent: string[];
  /** what the session held under the one-shot's key when each grid-signin typed arrived */
  onceAtSend: unknown[];
  /** every result an action answered with */
  results: string[];
  signals: string[];
  page: ReturnType<typeof gridSignin>;
  deps: GridSigninDeps;
  /** the browser closed: storage.session is empty again (the record, storage.local and the passkeys stay) */
  restartBrowser(): void;
  /** a new page (the panel opened again): a fresh instance over the same stores */
  newPage(): ReturnType<typeof gridSignin>;
}

function setup(o: { auth?: FakeAuthenticatorOptions; noPasskeys?: boolean; backgroundRemovesOnce?: boolean; background?: (a: Action, h: Harness) => unknown } = {}): Harness {
  const fa = fakeAuthenticator(o.auth);
  const h = {
    fa,
    records: memoryRecords(),
    local: memoryArea(),
    session: memoryArea(),
    sent: [] as string[],
    onceAtSend: [] as unknown[],
    results: [] as string[],
    signals: [] as string[],
  } as Harness;
  const deps: GridSigninDeps = {
    passkeys: o.noPasskeys ? undefined : fa,
    statics: fa.statics,
    records: h.records,
    session: h.session,
    local: h.local,
    os: async () => 'mac',
    unknownPasskey: (cred) => void h.signals.push(cred),
    async send(a) {
      h.sent.push(JSON.stringify(a));
      let r: unknown;
      if (o.background) r = await o.background(a, h);
      else if (a.kind === 'grid-signin') {
        if (a.how === 'typed') {
          h.onceAtSend.push(await h.session.get(SIGNIN_ONCE_KEY));
          // the background's finally (SPEC 5.7), unless a test plays one that never got the action
          if (o.backgroundRemovesOnce !== false) await h.session.remove(SIGNIN_ONCE_KEY);
        }
        r = { signedIn: true, refused: false };
      } else if (a.kind === 'forget-grid-signin') {
        await h.records.delete();
        for (const k of [SIGNIN_NOTE_KEY, SIGNIN_NOPRF_KEY]) await h.local.remove(k);
        for (const k of [SIGNIN_UNLOCK_KEY, SIGNIN_ONCE_KEY]) await h.session.remove(k);
        r = { forgotten: true };
      }
      h.results.push(JSON.stringify(r ?? null));
      return r;
    },
  };
  h.deps = deps;
  h.page = gridSignin(deps);
  h.restartBrowser = () => h.session.data.clear();
  h.newPage = () => (h.page = gridSignin(deps));
  return h;
}

const sentKinds = (h: Harness) => h.sent.map((s) => JSON.parse(s) as Action);

/** nothing typed anywhere it must not be */
function expectNoPassword(h: Harness, ...extra: unknown[]): void {
  const places: Record<string, string> = {
    actions: h.sent.join('\n'),
    results: h.results.join('\n'),
    'storage.local (every write)': h.local.writes.join('\n'),
    'storage.local (now)': JSON.stringify([...h.local.data]),
    'the unlock': JSON.stringify(h.session.data.get(SIGNIN_UNLOCK_KEY) ?? null),
    record: JSON.stringify(h.records.record ?? null),
    'the authenticator': JSON.stringify(h.fa.calls) + h.fa.log.join('\n'),
    extra: JSON.stringify(extra),
  };
  for (const [where, text] of Object.entries(places)) {
    for (const secret of [PASSWORD, PASSWORD_B64, PASSWORD_B64URL, NEW_PASSWORD]) expect(text.includes(secret), `${where} holds the password`).toBe(false);
  }
}

/** the one passkey the student's list shows for this account */
const theCred = (h: Harness) => h.fa.passkeys()[0]!.cred;

async function savedOnce(h: Harness, password = PASSWORD): Promise<SigninRecord> {
  expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password, remember: true })).toEqual({ saved: true });
  return h.records.record!;
}

describe('supportNow: may the sheet offer Remember', () => {
  it('yes on a computer with a platform passkey and PRF, and also where the browser cannot say (offered like yes)', async () => {
    expect(await setup().page.supportNow()).toBe(true);
    expect(await setup({ auth: { capabilities: 'absent' } }).page.supportNow()).toBe(true);
  });

  it('no without WebAuthn, without a platform authenticator, or where the browser says it has no PRF', async () => {
    expect(await setup({ noPasskeys: true }).page.supportNow()).toBe(false);
    expect(await setup({ auth: { platform: false } }).page.supportNow()).toBe(false);
    expect(await setup({ auth: { capabilities: { 'extension:prf': false } } }).page.supportNow()).toBe(false);
  });

  it('no while the no-PRF mark is there, whatever the probe says, and yes again once Forget removed it', async () => {
    const h = setup();
    await h.local.set(SIGNIN_NOPRF_KEY, { at: '2026-10-09T03:00:00.000Z', os: 'win' });
    expect(await h.page.supportNow()).toBe(false);
    expect(await h.page.forgetNow()).toBe(true);
    expect(await h.page.supportNow()).toBe(true);
  });

  it('asks the platform once per page', async () => {
    const h = setup();
    let probes = 0;
    const statics = h.fa.statics;
    h.deps.statics = { uvpaa: () => (probes++, statics.uvpaa()), caps: () => statics.caps!() };
    const page = gridSignin(h.deps);
    await page.supportNow();
    await page.supportNow();
    await page.supportNow();
    expect(probes).toBe(1);
  });
});

describe('submitSheet: Remember ticked', () => {
  it('makes one passkey for the account, seals the password, writes the record, the note whole, the unlock, and sends grid-signin saved', async () => {
    const h = setup();
    const rec = await savedOnce(h);
    expect(h.fa.ceremonies).toBe(1);
    const [pk, ...others] = h.fa.passkeys();
    expect(others).toEqual([]);
    expect(pk!.userName).toBe(`${USER} (grid)`);
    expect(rec).toMatchObject({ v: 1, origin: ORIGIN, username: USER, cred: pk!.cred });
    // the note: these four and nothing else
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toEqual({ origin: ORIGIN, username: USER, saved_at: rec.saved_at, cred: pk!.cred });
    // the unlock is the passkey's output for the record's salt, and it opens the record to what was typed
    expect(h.session.data.get(SIGNIN_UNLOCK_KEY)).toEqual({ prf: await prfBase64(h.fa, pk!.cred, rec.prfSalt), cred: pk!.cred });
    const prf = await h.fa.prfFor(pk!.cred, rec.prfSalt);
    expect(await openPassword(prf, rec, { origin: ORIGIN, username: USER })).toEqual({ username: USER, password: PASSWORD });
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'saved' }]);
    expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);
    expect(h.local.data.has(SIGNIN_NOPRF_KEY)).toBe(false);
    expect(h.signals).toEqual([]);
    expectNoPassword(h);
  });

  it('takes two prompts where the passkey gives its output only to a get(), and still saves', async () => {
    const h = setup({ auth: { prf: 'get' } });
    await savedOnce(h);
    expect([h.fa.creates, h.fa.gets]).toEqual([1, 1]);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'saved' }]);
  });

  it('a passkey that cannot lock a password: one prompt, the no-PRF mark, one signal, the one-shot this once; zero prompts the next time', async () => {
    const h = setup({ auth: { prf: 'disabled' } });
    expect(await h.page.supportNow()).toBe(true);
    const first = await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true });
    expect(first).toEqual({ saved: false, note: 'not-saved' });
    expect(h.fa.ceremonies).toBe(1);
    expect(h.signals).toEqual([theCred(h)]);
    const mark = h.local.data.get(SIGNIN_NOPRF_KEY) as { at: string; os: string };
    expect(mark.os).toBe('mac');
    expect(Number.isFinite(Date.parse(mark.at))).toBe(true);
    expect(Object.keys(mark).sort()).toEqual(['at', 'os']);
    // nothing saved; the password went to the one attempt only, and is gone
    expect(h.records.record).toBeUndefined();
    expect(h.local.data.has(SIGNIN_NOTE_KEY)).toBe(false);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
    expect(h.onceAtSend[0]).toMatchObject({ origin: ORIGIN, username: USER, password: PASSWORD });
    expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);

    // the next time, on this page or a new one: no tick, and a Remember that slips through asks nothing
    for (const page of [h.page, h.newPage()]) {
      expect(await page.supportNow()).toBe(false);
      expect(await page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    }
    expect(h.fa.ceremonies).toBe(1);
    expect(h.signals).toHaveLength(1);
    expectNoPassword(h);
  });

  it('a passkey that says nothing about PRF and gives no output: two prompts, then the mark', async () => {
    const h = setup({ auth: { prf: 'none' } });
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    expect([h.fa.creates, h.fa.gets]).toEqual([1, 1]);
    expect(h.local.data.has(SIGNIN_NOPRF_KEY)).toBe(true);
    expect(h.signals).toEqual([theCred(h)]);
    expect(await h.page.supportNow()).toBe(false);
  });

  it('the prompt cancelled or timed out: not saved, no mark, the password used this once', async () => {
    for (const answer of ['cancel', 'timeout'] as const) {
      const h = setup({ auth: { answer } });
      expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
      expect(h.fa.passkeys()).toEqual([]);
      expect(h.signals).toEqual([]);
      expect(h.local.data.has(SIGNIN_NOPRF_KEY)).toBe(false);
      expect(await h.page.supportNow()).toBe(true);
      expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
      expect(h.onceAtSend).toHaveLength(1);
      expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);
    }
  });

  it('a passkey made and then left unused (its second prompt cancelled, or made without verifying the student) is signalled once, with no mark', async () => {
    const cancelled = setup({ auth: { prf: 'get', queue: ['approve', 'cancel'] } });
    expect(await cancelled.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    expect(cancelled.signals).toEqual([theCred(cancelled)]);
    expect(cancelled.local.data.has(SIGNIN_NOPRF_KEY)).toBe(false);

    const noUv = setup({ auth: { uv: false } });
    expect(await noUv.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    expect(noUv.signals).toEqual([theCred(noUv)]);
    expect(noUv.records.record).toBeUndefined();
    expect(sentKinds(noUv)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
  });

  it('a record that cannot be kept: not saved, and the passkey just made is signalled', async () => {
    const h = setup();
    h.records.put = async () => {
      throw new Error('quota');
    };
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    expect(h.signals).toEqual([theCred(h)]);
    expect(h.local.data.has(SIGNIN_NOTE_KEY)).toBe(false);
    expect(h.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
  });

  it('saving again while unlocked re-seals under the same passkey with no prompt, and the note is new and whole', async () => {
    const h = setup();
    const first = await savedOnce(h);
    // what the background notes of the attempts (SPEC section 3), which a new seal clears
    await h.local.set(SIGNIN_NOTE_KEY, { ...(h.local.data.get(SIGNIN_NOTE_KEY) as object), attempt_at: '2026-10-09T03:10:00.000Z', refused_at: '2026-10-09T03:10:01.000Z', refusals: 1, realm: 'private' });
    const second = await savedOnce(h, NEW_PASSWORD);
    expect(h.fa.ceremonies).toBe(1);
    expect(h.fa.passkeys()).toHaveLength(1);
    expect(second.cred).toBe(first.cred);
    expect(second.prfSalt).toBe(first.prfSalt);
    expect(second.iv).not.toBe(first.iv);
    expect(second.ct).not.toBe(first.ct);
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toEqual({ origin: ORIGIN, username: USER, saved_at: second.saved_at, cred: second.cred });
    expect(Date.parse(second.saved_at)).toBeGreaterThan(Date.parse('2026-10-09T03:10:01.000Z'));
    const prf = await h.fa.prfFor(second.cred, second.prfSalt);
    expect((await openPassword(prf, second, { origin: ORIGIN, username: USER })).password).toBe(NEW_PASSWORD);
    expect(h.signals).toEqual([]);
    expectNoPassword(h);
  });

  it('saving again after the browser restarted asks for the saved passkey once (no new passkey) and re-seals', async () => {
    const h = setup();
    const first = await savedOnce(h);
    h.restartBrowser();
    h.newPage();
    const second = await savedOnce(h, NEW_PASSWORD);
    expect([h.fa.creates, h.fa.gets]).toEqual([1, 1]);
    expect(h.fa.passkeys().map((p) => p.cred)).toEqual([first.cred]);
    expect(second.cred).toBe(first.cred);
    expect(h.session.data.get(SIGNIN_UNLOCK_KEY)).toEqual({ prf: await prfBase64(h.fa, first.cred, first.prfSalt), cred: first.cred });
  });

  it('the saved password refused, the browser restarted, a new one typed with Remember and the unlock cancelled: the one-shot this once, and the saved sign-in left as it was', async () => {
    const h = setup();
    const before = await savedOnce(h);
    const refusedNote = { ...(h.local.data.get(SIGNIN_NOTE_KEY) as object), attempt_at: '2026-10-09T03:10:00.000Z', refused_at: '2026-10-09T03:10:01.000Z', refusals: 1 };
    await h.local.set(SIGNIN_NOTE_KEY, refusedNote);
    h.restartBrowser();
    h.newPage();
    h.fa.options.queue.push('cancel');
    h.sent.length = 0;
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: NEW_PASSWORD, remember: true })).toEqual({ saved: false, note: 'not-saved' });
    expect(h.records.record).toEqual(before);
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toEqual(refusedNote);
    expect(h.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
    expect(h.onceAtSend.at(-1)).toMatchObject({ password: NEW_PASSWORD });
    expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);
    // the saved passkey still holds a saved sign-in: it is never called unused
    expect(h.signals).toEqual([]);
  });

  it('another account gets its own passkey, and the one it replaces is signalled', async () => {
    const h = setup();
    const old = await savedOnce(h);
    expect(await h.page.submitSheet({ origin: ORIGIN, username: 'ab9876', password: NEW_PASSWORD, remember: true })).toEqual({ saved: true });
    const now = h.records.record!;
    expect(now.username).toBe('ab9876');
    expect(now.cred).not.toBe(old.cred);
    expect(h.fa.passkeys().map((p) => p.userName).sort()).toEqual(['ab9876 (grid)', `${USER} (grid)`]);
    expect(h.signals).toEqual([old.cred]);
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toMatchObject({ username: 'ab9876', cred: now.cred });
    expect(h.session.data.get(SIGNIN_UNLOCK_KEY)).toMatchObject({ cred: now.cred });
  });
});

describe('submitSheet: Remember not ticked', () => {
  it('writes the one-shot for one attempt, sends grid-signin typed, and the one-shot is gone when it returns', async () => {
    const h = setup();
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false })).toEqual({ saved: false });
    expect(h.fa.ceremonies).toBe(0);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'typed' }]);
    const once = h.onceAtSend[0] as Record<string, unknown>;
    expect(Object.keys(once).sort()).toEqual(['at', 'origin', 'password', 'username']);
    expect(once).toMatchObject({ origin: ORIGIN, username: USER, password: PASSWORD });
    expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);
    expect(h.local.writes).toEqual([]);
    expect(h.records.record).toBeUndefined();
    expectNoPassword(h);
  });

  it('removes the one-shot itself when the background never got the action, and leaves alone one a later Sign in wrote', async () => {
    const lost = setup({ backgroundRemovesOnce: false });
    await lost.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false });
    expect(lost.onceAtSend).toHaveLength(1);
    expect(lost.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);

    const thrown = setup();
    thrown.deps.send = async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };
    expect(await gridSignin(thrown.deps).submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false })).toEqual({ saved: false });
    expect(thrown.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);

    const later = { origin: ORIGIN, username: USER, password: NEW_PASSWORD, at: '2099-01-01T00:00:00.000Z' };
    const overtaken = setup({
      background: async (a, h) => {
        if (a.kind === 'grid-signin') await h.session.set(SIGNIN_ONCE_KEY, later);
        return { signedIn: false, refused: false };
      },
    });
    await overtaken.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false });
    expect(overtaken.session.data.get(SIGNIN_ONCE_KEY)).toEqual(later);
  });

  it('"Type it instead" with the box unticked keeps the saved record, its note and its unlock, and asks for no passkey', async () => {
    const h = setup();
    const rec = await savedOnce(h);
    const note = h.local.data.get(SIGNIN_NOTE_KEY);
    h.restartBrowser();
    h.newPage();
    const ceremonies = h.fa.ceremonies;
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: NEW_PASSWORD, remember: false })).toEqual({ saved: false });
    expect(h.fa.ceremonies).toBe(ceremonies);
    expect(h.records.record).toEqual(rec);
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toEqual(note);
    expect(sentKinds(h).at(-1)).toEqual({ kind: 'grid-signin', how: 'typed' });
    expect(h.signals).toEqual([]);

    // and while unlocked: the unlock stays too
    const u = setup();
    await savedOnce(u);
    const unlock = u.session.data.get(SIGNIN_UNLOCK_KEY);
    const uRec = u.records.record;
    await u.page.submitSheet({ origin: ORIGIN, username: USER, password: NEW_PASSWORD, remember: false });
    expect(u.session.data.get(SIGNIN_UNLOCK_KEY)).toEqual(unlock);
    expect(u.records.record).toEqual(uRec);
  });

  it('refuses what must never be sent: no password, an AccessID the grid does not use, an origin that is not one, an Anthropic address', async () => {
    const h = setup();
    const bad = [
      { origin: ORIGIN, username: USER, password: '' },
      { origin: ORIGIN, username: 'st:1234', password: PASSWORD },
      { origin: ORIGIN, username: '', password: PASSWORD },
      { origin: `${ORIGIN}/pun/sys/dashboard`, username: USER, password: PASSWORD },
      { origin: 'ftp://grid.example.edu', username: USER, password: PASSWORD },
      { origin: 'https://claude.ai', username: USER, password: PASSWORD },
    ];
    for (const b of bad) for (const remember of [false, true]) expect(await h.page.submitSheet({ ...b, remember })).toEqual({ saved: false });
    expect(h.sent).toEqual([]);
    expect(h.session.writes).toEqual([]);
    expect(h.local.writes).toEqual([]);
    expect(h.fa.ceremonies).toBe(0);
  });

  it('writes and sends nothing once the page is going away (pagehide aborted it)', async () => {
    const gone = new AbortController();
    gone.abort();
    const h = setup();
    expect(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false, signal: gone.signal })).toEqual({ saved: false });
    expect(h.sent).toEqual([]);
    expect(h.session.writes).toEqual([]);

    const mid = new AbortController();
    const hang = setup({ auth: { answer: 'hang' } });
    const p = hang.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true, signal: mid.signal });
    await new Promise((r) => setTimeout(r, 10));
    mid.abort();
    expect(await p).toEqual({ saved: false, note: 'not-saved' });
    expect(hang.sent).toEqual([]);
    expect(hang.session.writes).toEqual([]);
    expect(hang.local.writes).toEqual([]);
  });
});

describe('unlockNow', () => {
  it('a saved sign-in after the browser restarted: one prompt, the unlock written, grid-signin unlocked', async () => {
    const h = setup();
    const rec = await savedOnce(h);
    h.restartBrowser();
    h.newPage();
    h.sent.length = 0;
    expect(await h.page.unlockNow()).toBe('unlocked');
    expect(h.fa.gets).toBe(1);
    expect(h.session.data.get(SIGNIN_UNLOCK_KEY)).toEqual({ prf: await prfBase64(h.fa, rec.cred, rec.prfSalt), cred: rec.cred });
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'unlocked' }]);
    expect(h.local.data.get(SIGNIN_NOTE_KEY)).toEqual({ origin: ORIGIN, username: USER, saved_at: rec.saved_at, cred: rec.cred });
    expectNoPassword(h);
  });

  it('sends nothing and asks for nothing while the grid has turned the saved password down, or while it is on hold', async () => {
    for (const mark of [{ refused_at: '2026-10-09T03:10:01.000Z', refusals: 1 }, { stopped_at: '2026-10-09T03:10:01.000Z', refusals: 1 }]) {
      const h = setup();
      await savedOnce(h);
      await h.local.set(SIGNIN_NOTE_KEY, { ...(h.local.data.get(SIGNIN_NOTE_KEY) as object), ...mark });
      h.restartBrowser();
      h.newPage();
      h.sent.length = 0;
      const ceremonies = h.fa.ceremonies;
      expect(await h.page.unlockNow()).toBe('refused');
      expect(h.fa.ceremonies).toBe(ceremonies);
      expect(h.sent).toEqual([]);
      expect(h.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
    }
  });

  it('cancelled, timed out or aborted: nothing written, nothing sent', async () => {
    for (const answer of ['cancel', 'timeout', 'hang'] as const) {
      const h = setup();
      await savedOnce(h);
      h.restartBrowser();
      h.newPage();
      h.sent.length = 0;
      h.fa.options.answer = answer;
      const ac = new AbortController();
      const p = h.page.unlockNow(ac.signal);
      if (answer === 'hang') setTimeout(() => ac.abort(), 10);
      expect(await p).toBe('cancelled');
      expect(h.sent).toEqual([]);
      expect(h.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
    }
  });

  it('fails without a prompt when nothing is saved, the note and the record disagree, or there is no WebAuthn; and when the passkey is not the one saved', async () => {
    expect(await setup().page.unlockNow()).toBe('failed');

    const h = setup();
    await savedOnce(h);
    h.restartBrowser();
    await h.local.set(SIGNIN_NOTE_KEY, { ...(h.local.data.get(SIGNIN_NOTE_KEY) as object), cred: 'AAAAAAAAAAAAAAAAAAAAAA' });
    const ceremonies = h.fa.ceremonies;
    expect(await h.newPage().unlockNow()).toBe('failed');
    expect(h.fa.ceremonies).toBe(ceremonies);

    const n = setup();
    await savedOnce(n);
    n.restartBrowser();
    n.deps.passkeys = undefined;
    expect(await gridSignin(n.deps).unlockNow()).toBe('failed');
    expect(n.sent.map((s) => JSON.parse(s) as Action)).toEqual([{ kind: 'grid-signin', how: 'saved' }]);

    // the student deleted the passkey from their list: the browser says no passkey, as a cancel
    const d = setup();
    const rec = await savedOnce(d);
    d.restartBrowser();
    d.fa.remove(rec.cred);
    expect(await d.newPage().unlockNow()).toBe('cancelled');
    expect(d.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
  });

  it('asks for no second prompt when the sign-in is already open this browser session', async () => {
    const h = setup();
    await savedOnce(h);
    h.sent.length = 0;
    const ceremonies = h.fa.ceremonies;
    expect(await h.newPage().unlockNow()).toBe('unlocked');
    expect(h.fa.ceremonies).toBe(ceremonies);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'unlocked' }]);
    // an unlock of another passkey, or one that is not 32 bytes, is no unlock of this one
    for (const other of [{ prf: (h.session.data.get(SIGNIN_UNLOCK_KEY) as { prf: string }).prf, cred: 'AAAAAAAAAAAAAAAAAAAAAA' }, { prf: 'AAAA', cred: h.records.record!.cred }]) {
      await h.session.set(SIGNIN_UNLOCK_KEY, other);
      expect(await h.newPage().unlockNow()).toBe('unlocked');
    }
    expect(h.fa.ceremonies).toBe(ceremonies + 2);
  });

  it("says refused when the grid turns down the sign-in the unlock carried, with the sign-in already open or after a prompt; one the grid did not turn down is unlocked", async () => {
    // the background's answer for this unlock's own attempt (SPEC 5.7); this stand-in marks no note, so each
    // unlock below is asked again
    let answer: { signedIn: boolean; refused: boolean } | undefined = { signedIn: true, refused: false };
    const h = setup({ background: (a) => (a.kind === 'grid-signin' ? answer : undefined) });
    await savedOnce(h);
    answer = { signedIn: false, refused: true };
    h.sent.length = 0;
    const ceremonies = h.fa.ceremonies;
    expect(await h.newPage().unlockNow()).toBe('refused');
    expect(h.fa.ceremonies).toBe(ceremonies);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'unlocked' }]);
    h.restartBrowser();
    h.sent.length = 0;
    const gets = h.fa.gets;
    expect(await h.newPage().unlockNow()).toBe('refused');
    expect(h.fa.gets).toBe(gets + 1);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'unlocked' }]);
    // out of reach, or no answer at all: no refusal to speak of
    for (const r of [{ signedIn: false, refused: false }, undefined]) {
      answer = r;
      h.restartBrowser();
      expect(await h.newPage().unlockNow()).toBe('unlocked');
    }
    expectNoPassword(h);
  });

  it('two presses in a row share one prompt', async () => {
    const h = setup();
    await savedOnce(h);
    h.restartBrowser();
    h.newPage();
    h.sent.length = 0;
    const [a, b] = await Promise.all([h.page.unlockNow(), h.page.unlockNow()]);
    expect([a, b]).toEqual(['unlocked', 'unlocked']);
    expect(h.fa.gets).toBe(1);
    expect(sentKinds(h)).toEqual([{ kind: 'grid-signin', how: 'unlocked' }]);
    // and a later one is its own: after the next restart, another prompt
    h.restartBrowser();
    expect(await h.page.unlockNow()).toBe('unlocked');
    expect(h.fa.gets).toBe(2);
  });
});

describe('forgetNow', () => {
  it('signals the passkey (best-effort), then sends forget-grid-signin; the background forgets', async () => {
    const h = setup();
    const rec = await savedOnce(h);
    h.sent.length = 0;
    const order: string[] = [];
    h.deps.unknownPasskey = (c) => void order.push(`signal ${c}`);
    const send = h.deps.send;
    h.deps.send = (a) => (order.push(`send ${a.kind}`), send(a));
    expect(await gridSignin(h.deps).forgetNow(rec.cred)).toBe(true);
    expect(order).toEqual([`signal ${rec.cred}`, 'send forget-grid-signin']);
    expect(h.records.record).toBeUndefined();
    expect(h.local.data.has(SIGNIN_NOTE_KEY)).toBe(false);
    expect(h.session.data.has(SIGNIN_UNLOCK_KEY)).toBe(false);
  });

  it('a signal that throws changes nothing', async () => {
    const h = setup();
    const rec = await savedOnce(h);
    h.deps.unknownPasskey = () => {
      throw new Error('no');
    };
    expect(await gridSignin(h.deps).forgetNow(rec.cred)).toBe(true);
    expect(h.records.record).toBeUndefined();
  });

  it('removes what the page reaches itself when the background does not answer', async () => {
    const h = setup({ background: async () => undefined });
    const rec = await savedOnce(h);
    await h.local.set(SIGNIN_NOPRF_KEY, { at: '2026-10-09T03:00:00.000Z', os: 'mac' });
    await h.session.set(SIGNIN_ONCE_KEY, { origin: ORIGIN, username: USER, password: PASSWORD, at: new Date().toISOString() });
    expect(await h.page.forgetNow(rec.cred)).toBe(true);
    expect(h.records.record).toBeUndefined();
    for (const k of [SIGNIN_NOTE_KEY, SIGNIN_NOPRF_KEY]) expect(h.local.data.has(k), k).toBe(false);
    for (const k of [SIGNIN_UNLOCK_KEY, SIGNIN_ONCE_KEY]) expect(h.session.data.has(k), k).toBe(false);
    expect(sentKinds(h).at(-1)).toEqual({ kind: 'forget-grid-signin' });
  });
});

describe('the password reaches nothing but the sealed record and the one-shot', () => {
  it('after saving, unlocking, typing, a refusal and Forget: in no action, no result, no storage.local, no return value', async () => {
    const h = setup({ auth: { prf: 'get' } });
    const returned: unknown[] = [];
    returned.push(await h.page.supportNow());
    returned.push(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true }));
    h.restartBrowser();
    returned.push(await h.newPage().unlockNow());
    await h.local.set(SIGNIN_NOTE_KEY, { ...(h.local.data.get(SIGNIN_NOTE_KEY) as object), refused_at: new Date().toISOString(), refusals: 1 });
    returned.push(await h.page.unlockNow());
    returned.push(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: NEW_PASSWORD, remember: false }));
    returned.push(await h.page.submitSheet({ origin: ORIGIN, username: USER, password: NEW_PASSWORD, remember: true }));
    returned.push(await h.page.forgetNow(h.records.record?.cred));
    expectNoPassword(h, returned);
    expect(h.session.data.has(SIGNIN_ONCE_KEY)).toBe(false);
    // every action the page sent is one of the four that carry no secret
    for (const a of sentKinds(h)) expect(['grid-signin', 'forget-grid-signin']).toContain(a.kind);
    for (const a of sentKinds(h)) expect(Object.keys(a).sort()).toEqual(a.kind === 'grid-signin' ? ['how', 'kind'] : ['kind']);
  });

  it('never throws, so no error a page shows can carry it: every store, the authenticator and the background failing', async () => {
    const boom = (what: string) => async () => {
      throw new Error(`${what} failed`);
    };
    const failing: SigninKV = { get: boom('get'), set: boom('set'), remove: boom('remove') };
    const fa = fakeAuthenticator();
    const deps: GridSigninDeps = {
      passkeys: {
        create: async () => {
          throw new TypeError('create failed');
        },
        get: fa.get,
      },
      statics: fa.statics,
      records: { get: boom('records.get'), put: boom('records.put'), delete: boom('records.delete') },
      session: failing,
      local: failing,
      send: boom('send'),
      os: boom('os'),
      unknownPasskey: () => {
        throw new Error('signal failed');
      },
    };
    const page = gridSignin(deps);
    const outcomes = await Promise.allSettled([
      page.supportNow(),
      page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true }),
      page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: false }),
      page.unlockNow(),
      page.forgetNow('AAAA'),
    ]);
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(JSON.stringify(outcomes)).not.toContain(PASSWORD);
    expect(outcomes.map((o) => (o as PromiseFulfilledResult<unknown>).value)).toEqual([false, { saved: false, note: 'not-saved' }, { saved: false }, 'failed', false]);
  });
});

describe("the passkey's output", () => {
  it('is zeroed in the buffer the browser handed back once the unlock is written, at creation, at a get and at an unlock', async () => {
    for (const prf of ['create', 'get'] as const) {
      const h = setup({ auth: { prf } });
      const outputs: ArrayBuffer[] = [];
      const watch = (c: Credential | null): Credential | null => {
        const first = (c as unknown as { getClientExtensionResults(): { prf?: { results?: { first?: ArrayBuffer } } } } | null)?.getClientExtensionResults().prf?.results?.first;
        if (first) outputs.push(first);
        return c;
      };
      h.deps.passkeys = { create: async (o) => watch(await h.fa.create(o)), get: async (o) => watch(await h.fa.get(o)) };
      const page = gridSignin(h.deps);
      const rec = (await page.submitSheet({ origin: ORIGIN, username: USER, password: PASSWORD, remember: true }), h.records.record!);
      h.restartBrowser();
      expect(await page.unlockNow()).toBe('unlocked');
      expect(outputs).toHaveLength(2);
      for (const b of outputs) expect([...new Uint8Array(b)], prf).toEqual(new Array(32).fill(0));
      // what was kept was taken before the zeroing
      expect(h.session.data.get(SIGNIN_UNLOCK_KEY)).toEqual({ prf: await prfBase64(h.fa, rec.cred, rec.prfSalt), cred: rec.cred });
    }
  });
});

describe('defaultDeps', () => {
  it('can be built where there is no browser and no WebAuthn (Node): it touches neither until a call needs it', async () => {
    const d = defaultDeps();
    expect(d.passkeys).toBeUndefined();
    expect(d.statics).toBeUndefined();
    // a page built on it here offers no Remember and fails quietly
    const page = gridSignin(d);
    expect(await page.supportNow()).toBe(false);
    expect(await page.unlockNow()).toBe('failed');
  });
});

// The passkey and the seal run in a window, inside the student's click, so they belong to the pages; the
// background only opens a record when the grid asks. One module carries them out for every page.
describe('only src/ext/gridSignin.ts makes, unlocks or seals', () => {
  const ROOT = path.resolve(__dirname, '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(m?[jt]s|tsx?|html|vue)$/.test(n) ? [p] : [];
    });

  /** the code without its comments (strings kept, so a URL's // is not taken for one) */
  function code(text: string): string {
    let out = '';
    let i = 0;
    let quote: string | undefined;
    while (i < text.length) {
      const c = text[i]!;
      const next = text[i + 1];
      if (quote) {
        out += c;
        if (c === '\\') out += text[++i] ?? '';
        else if (c === quote) quote = undefined;
        i++;
      } else if (c === '/' && next === '/') {
        while (i < text.length && text[i] !== '\n') i++;
      } else if (c === '/' && next === '*') {
        const end = text.indexOf('*/', i + 2);
        i = end < 0 ? text.length : end + 2;
      } else {
        if (c === '"' || c === "'" || c === '`') quote = c;
        out += c;
        i++;
      }
    }
    return out;
  }

  const CALLS = /\b(makePasskey|unlockPasskey|sealPassword)\b/;
  const ALLOWED = new Set(['src/ext/gridSignin.ts', 'src/core/vault.ts']);

  it('no other module of the extension names makePasskey, unlockPasskey or sealPassword, the background least of all', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'mock-ood')), path.join(ROOT, 'wxt.config.ts')];
    const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
    expect(files.map(rel)).toContain('src/entrypoints/background.ts');
    const hits = files.filter((p) => !ALLOWED.has(rel(p)) && CALLS.test(code(readFileSync(p, 'utf8')))).map(rel);
    expect(hits).toEqual([]);
    // and the one module that may does
    const mine = code(readFileSync(path.join(ROOT, 'src/ext/gridSignin.ts'), 'utf8'));
    for (const name of ['makePasskey', 'unlockPasskey', 'sealPassword']) expect(mine).toMatch(new RegExp(`\\b${name}\\(`));
  });

  it('the scan sees a call, an import and a re-export, passes over a comment, and takes no // inside a string for one', () => {
    expect(CALLS.test(code("import { makePasskey } from '../core/vault';"))).toBe(true);
    expect(CALLS.test(code('const p = await unlockPasskey(api, o);'))).toBe(true);
    expect(CALLS.test(code("export { sealPassword } from './vault';"))).toBe(true);
    expect(CALLS.test(code("const u = 'https://example.edu'; sealPassword(p, o);"))).toBe(true);
    expect(CALLS.test(code('// the background never calls makePasskey\n/* nor sealPassword */ const x = 1;'))).toBe(false);
  });
});
