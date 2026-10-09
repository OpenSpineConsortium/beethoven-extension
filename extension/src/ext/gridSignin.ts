// The page side of Beethoven's own grid sign-in (19.0.0, "Beethoven signs in"; greg's card tap of
// 2026-10-09 03:01Z). WebAuthn runs only in a window, never in the service worker, so this is the one
// module that makes a passkey, unlocks one and seals the password under it (core/vault.ts makePasskey,
// unlockPasskey, sealPassword); a source scan keeps those calls out of the background and every other
// module (test/gridSigninPage.test.ts). The background only opens a sealed record when the grid asks,
// and deletes it.
//
// What the password may touch here (I4, I5): the arguments of submitSheet, then either the sealed record
// (ciphertext, in IndexedDB, only when the student ticked Remember and this computer's passkey gave an
// output) or the one-shot in storage.session for one attempt, which this page also removes once that
// attempt is over. Never an action, an action's result, storage.local, a log line or an error: every
// function here answers with a short outcome and never throws, so no message can carry anything typed.
// The panel reads the fields and empties the password field before its first await, and keeps nothing.
//
// Everything the browser offers is passed in (deps), so the tests stand in for the authenticator, the
// stores and the background, and so this module reads no browser global when it loads: only
// defaultDeps(), which the panel calls, touches them.
import { browser } from 'wxt/browser';
import type { KV } from '../core/audit';
import { isAnthropicAddress } from '../core/connect';
import { ACCESS_ID } from '../core/gridsignin';
import { SIGNIN_NOPRF_KEY, SIGNIN_NOTE_KEY, SIGNIN_ONCE_KEY, SIGNIN_UNLOCK_KEY, type SigninNote, type SigninNoPrf, type SigninOnce, type SigninUnlock } from '../core/keys';
import { unwrap, type Answer } from '../core/messages';
import type { Action } from '../core/model';
import { base64, browserPasskeys, browserStatics, indexedDbRecords, makePasskey, passkeySupport, sealPassword, unbase64, unlockPasskey, VaultError, type PasskeyApi, type PasskeyStatics, type RecordStore, type SigninRecord } from '../core/vault';

/** a storage area as ext/storage offers it: the audit's KV and remove */
export type SigninKV = KV & { remove(key: string): Promise<void> };

export interface GridSigninDeps {
  /** navigator.credentials on this page, or undefined where there is none */
  passkeys: PasskeyApi | undefined;
  statics?: PasskeyStatics;
  /** the sealed record (IndexedDB on the extension's origin) */
  records: RecordStore;
  session: SigninKV;
  local: SigninKV;
  /** one action to the background, answered with its result */
  send(a: Action): Promise<unknown>;
  /** runtime.getPlatformInfo's os ('win', 'mac', …), for the no-PRF mark */
  os(): Promise<string>;
  /**
   * Tell the passkey provider a passkey Beethoven made is unused (best-effort, never awaited). Default:
   * the browser's own PublicKeyCredential.signalUnknownCredential where it has one, which is expected to
   * change nothing for an extension's passkey (not yet measured), so no text claims it removes one.
   */
  unknownPasskey?(cred: string): void;
}

export interface GridSignin {
  /** may the sheet offer Remember? */
  supportNow(): Promise<boolean>;
  /** the sheet's Sign in, called synchronously from the click with the values the panel just read and emptied */
  submitSheet(o: { origin: string; username: string; password: string; remember: boolean; signal?: AbortSignal }): Promise<{ saved: boolean; note?: 'not-saved' }>;
  /**
   * "Unlock with …": the saved sign-in's passkey, one prompt; nothing at all while the saved password stands
   * refused. 'refused' also when the grid turns down the sign-in this unlock carried: the page then shows
   * the sheet, where the refusal is said and only a typed password may be tried
   */
  unlockNow(signal?: AbortSignal): Promise<'unlocked' | 'cancelled' | 'failed' | 'refused'>;
  /** Settings' Forget, after its confirm row; true when the saved sign-in is gone */
  forgetNow(cred?: string): Promise<boolean>;
}

/** the browser's signal, guarded: TypeScript's DOM types lack it, and so may the browser */
export function signalUnknownPasskey(cred: string): void {
  try {
    type Signal = (o: { rpId: string; credentialId: string }) => Promise<void>;
    const P = (globalThis as { PublicKeyCredential?: { signalUnknownCredential?: Signal } }).PublicKeyCredential;
    // on the extension's own page the host is the extension's id, the RP ID its passkeys were made with
    const rpId = (globalThis as { location?: { protocol?: string; hostname?: string } }).location;
    if (typeof P?.signalUnknownCredential !== 'function' || rpId?.protocol !== 'chrome-extension:' || !rpId.hostname) return;
    void P.signalUnknownCredential({ rpId: rpId.hostname, credentialId: cred }).catch(() => undefined);
  } catch {
    /* best-effort */
  }
}

/** the session's unlock as bytes, or undefined when it is not one a passkey gave */
function unlocked(u: SigninUnlock): Uint8Array | undefined {
  try {
    const b = unbase64(u.prf);
    return b.length === 32 ? b : undefined;
  } catch {
    return undefined;
  }
}

/** a portal origin a password may be given for: http(s), written as its own origin, never an Anthropic address */
function grantableOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.origin === origin && !isAnthropicAddress(origin);
  } catch {
    return false;
  }
}

export function gridSignin(deps: GridSigninDeps): GridSignin {
  const unknown = (cred: string | undefined): void => {
    if (!cred) return;
    try {
      (deps.unknownPasskey ?? signalUnknownPasskey)(cred);
    } catch {
      /* best-effort */
    }
  };
  const quietly = async (p: () => Promise<unknown>): Promise<boolean> => {
    try {
      await p();
      return true;
    } catch {
      return false;
    }
  };
  const send = async (a: Action): Promise<unknown> => {
    try {
      return await deps.send(a);
    } catch {
      // the next view says what happened; an error here carries nothing typed anyway
      return undefined;
    }
  };

  // isUserVerifyingPlatformAuthenticatorAvailable and the capabilities do not change while a page is open
  let probe: Promise<boolean> | undefined;
  const supportNow = async (): Promise<boolean> => {
    try {
      if (await deps.local.get<SigninNoPrf>(SIGNIN_NOPRF_KEY)) return false;
    } catch {
      return false;
    }
    return (probe ??= passkeySupport(deps.passkeys, deps.statics).then(
      (s) => s !== 'no',
      () => false,
    ));
  };

  /**
   * Remember, ticked and offered: the password sealed under the passkey (the session's unlock when it is
   * this record's, else one prompt to unlock the saved one for the same account, else a new passkey),
   * then the record, the note and the unlock. Throws on anything that keeps it from being saved; the
   * caller falls back to the one-shot.
   */
  const save = async (o: { origin: string; username: string; password: string; signal?: AbortSignal }, api: PasskeyApi): Promise<void> => {
    const [had, unlock] = await Promise.all([
      deps.records.get().catch(() => undefined),
      deps.session.get<SigninUnlock>(SIGNIN_UNLOCK_KEY).catch(() => undefined),
    ]);
    // the passkey is named after the account ("<AccessID> (grid)"), so it is reused only for that account
    // at that grid; another one gets its own, and the one it replaces is no longer used
    const same: SigninRecord | undefined = had && had.origin === o.origin && had.username === o.username ? had : undefined;
    let prf: Uint8Array | undefined;
    let made: string | undefined;
    let kept = false;
    try {
      let cred: string;
      let prfSalt: string;
      if (same) {
        ({ cred, prfSalt } = same);
        prf = (unlock?.cred === same.cred ? unlocked(unlock) : undefined) ?? (await unlockPasskey(api, { cred, prfSalt, ...(o.signal ? { signal: o.signal } : {}) }));
      } else {
        const p = await makePasskey(api, { origin: o.origin, username: o.username, ...(o.signal ? { signal: o.signal } : {}) });
        ({ cred, prfSalt, prf } = p);
        made = cred;
      }
      const rec = await sealPassword(prf, { origin: o.origin, username: o.username, cred, prfSalt, password: o.password, savedAt: new Date().toISOString() });
      await deps.records.put(rec);
      kept = true;
      // whole, and nothing but these four: a new seal clears what the background noted of the last one
      const note: SigninNote = { origin: rec.origin, username: rec.username, saved_at: rec.saved_at, cred: rec.cred };
      await deps.local.set(SIGNIN_NOTE_KEY, note);
      const u: SigninUnlock = { prf: base64(prf), cred: rec.cred };
      await deps.session.set(SIGNIN_UNLOCK_KEY, u);
    } catch (e) {
      // a passkey made here whose record was never kept is unused (makePasskey's own errors carry theirs)
      if (made && !kept) unknown(made);
      throw e;
    } finally {
      prf?.fill(0);
    }
    if (had && !same && had.cred !== made) unknown(had.cred);
    await quietly(() => deps.local.remove(SIGNIN_NOPRF_KEY));
  };

  /** a passkey step that ended without a saved sign-in: what it leaves behind, and the no-PRF mark */
  const failedSave = async (e: unknown): Promise<void> => {
    if (!(e instanceof VaultError)) return;
    // only makePasskey's errors carry a credential: the passkey it just made, which nothing uses
    unknown(e.cred);
    if (e.code === 'no-prf' && e.cred) {
      let os = 'unknown';
      try {
        os = (await deps.os()) || os;
      } catch {
        /* the mark still stands */
      }
      const mark: SigninNoPrf = { at: new Date().toISOString(), os };
      await quietly(() => deps.local.set(SIGNIN_NOPRF_KEY, mark));
    }
  };

  const submitSheet: GridSignin['submitSheet'] = async (o) => {
    // the panel checks the fields and says why; this only refuses what must never be sent
    if (typeof o.password !== 'string' || !o.password || typeof o.username !== 'string' || !ACCESS_ID.test(o.username) || !grantableOrigin(o.origin)) return { saved: false };
    let note: 'not-saved' | undefined;
    if (o.remember) {
      const api = deps.passkeys;
      if (api && (await supportNow())) {
        let saved = false;
        try {
          await save(o, api);
          saved = true;
        } catch (e) {
          await failedSave(e);
        }
        if (saved) {
          await send({ kind: 'grid-signin', how: 'saved' });
          return { saved: true };
        }
      }
      note = 'not-saved';
    }
    const result = { saved: false, ...(note ? { note } : {}) };
    // the page is going away: nothing is written that no attempt would remove
    if (o.signal?.aborted) return result;
    const once: SigninOnce = { origin: o.origin, username: o.username, password: o.password, at: new Date().toISOString() };
    if (!(await quietly(() => deps.session.set(SIGNIN_ONCE_KEY, once)))) return result;
    try {
      await send({ kind: 'grid-signin', how: 'typed' });
    } finally {
      // the background removes it when the attempt ends; this removes it too when the action never got
      // there, and leaves alone one a later press of Sign in wrote meanwhile
      await quietly(async () => {
        const left = await deps.session.get<SigninOnce>(SIGNIN_ONCE_KEY);
        if (left && left.at === once.at && left.username === once.username && left.origin === once.origin) await deps.session.remove(SIGNIN_ONCE_KEY);
      });
    }
    return result;
  };

  /** the unlock's own sign-in: the background answers for this attempt alone, never an earlier one's refusal */
  const signInUnlocked = async (): Promise<'unlocked' | 'refused'> => {
    const r = (await send({ kind: 'grid-signin', how: 'unlocked' })) as { refused?: unknown } | undefined;
    return r?.refused === true ? 'refused' : 'unlocked';
  };

  // one prompt at a time: the press handlers start it without waiting (the chained unlock), and two
  // presses in a row join the prompt already open
  let unlocking: Promise<'unlocked' | 'cancelled' | 'failed' | 'refused'> | undefined;
  const unlockOnce = async (signal?: AbortSignal): Promise<'unlocked' | 'cancelled' | 'failed' | 'refused'> => {
    let note: SigninNote | undefined;
    try {
      note = await deps.local.get<SigninNote>(SIGNIN_NOTE_KEY);
    } catch {
      return 'failed';
    }
    if (!note) return 'failed';
    // the grid turned the saved password down, or a typed one while it was saved (the record may hold
    // that same password), or an outcome could not be told: only a typed one may be tried now (I1); a
    // hold the note does not carry yet is the background's to refuse (its grid-signin answers refused)
    if (note.refused_at || note.stopped_at) return 'refused';
    let rec: SigninRecord | undefined;
    let open: SigninUnlock | undefined;
    try {
      [rec, open] = await Promise.all([deps.records.get(), deps.session.get<SigninUnlock>(SIGNIN_UNLOCK_KEY).catch(() => undefined)]);
    } catch {
      return 'failed';
    }
    if (!rec || rec.cred !== note.cred || rec.origin !== note.origin || rec.username !== note.username) return 'failed';
    // already open this browser session (another page unlocked it): no second prompt, only the attempt
    const already = open?.cred === rec.cred ? unlocked(open) : undefined;
    if (already) {
      already.fill(0);
      return signInUnlocked();
    }
    const api = deps.passkeys;
    if (!api) return 'failed';
    let prf: Uint8Array;
    try {
      prf = await unlockPasskey(api, { cred: rec.cred, prfSalt: rec.prfSalt, ...(signal ? { signal } : {}) });
    } catch (e) {
      return e instanceof VaultError && e.code === 'not-allowed' ? 'cancelled' : 'failed';
    }
    try {
      const u: SigninUnlock = { prf: base64(prf), cred: rec.cred };
      await deps.session.set(SIGNIN_UNLOCK_KEY, u);
    } catch {
      return 'failed';
    } finally {
      prf.fill(0);
    }
    return signInUnlocked();
  };
  const unlockNow: GridSignin['unlockNow'] = (signal) =>
    (unlocking ??= unlockOnce(signal).finally(() => {
      unlocking = undefined;
    }));

  const forgetNow: GridSignin['forgetNow'] = async (cred) => {
    unknown(cred);
    const r = (await send({ kind: 'forget-grid-signin' })) as { forgotten?: unknown } | undefined;
    if (r?.forgotten === true) return true;
    // the background did not answer: what this page can reach goes from here (its memory follows the
    // storage changes)
    const done = await Promise.all([
      quietly(() => deps.records.delete()),
      quietly(() => deps.local.remove(SIGNIN_NOTE_KEY)),
      quietly(() => deps.local.remove(SIGNIN_NOPRF_KEY)),
      quietly(() => deps.session.remove(SIGNIN_UNLOCK_KEY)),
      quietly(() => deps.session.remove(SIGNIN_ONCE_KEY)),
    ]);
    return done.every(Boolean);
  };

  return { supportNow, submitSheet, unlockNow, forgetNow };
}

type RawArea = { get(keys: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void>; remove(keys: string): Promise<void> };

/** a storage area of the browser's, as ext/storage wraps one, looked up at each call */
function area(of: () => RawArea): SigninKV {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      return (await of().get(key))[key] as T | undefined;
    },
    set: (key, value) => of().set({ [key]: value }),
    remove: (key) => of().remove(key),
  };
}

/** what the panel and Settings build their instance from; touches the browser only when called */
export function defaultDeps(): GridSigninDeps {
  const statics = browserStatics();
  return {
    passkeys: browserPasskeys(),
    ...(statics ? { statics } : {}),
    records: indexedDbRecords(),
    local: area(() => browser.storage.local),
    session: area(() => browser.storage.session),
    send: async (action) => unwrap((await browser.runtime.sendMessage({ type: 'action', action })) as Answer | undefined),
    os: async () => (await browser.runtime.getPlatformInfo()).os,
  };
}
