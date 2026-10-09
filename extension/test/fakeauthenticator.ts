// A platform authenticator for the tests (19.0.0, core/vault.ts): navigator.credentials.create() and get()
// as Chrome answers them on the extension's own page, with WebAuthn's PRF extension, and the two static
// probes. Injected as a PasskeyApi, never installed as a global, so the background tests never see WebAuthn
// (the service worker has none). Node 22 has no WebAuthn, and a real Windows Hello or Touch ID is not
// testable here: what one does with an extension's passkey is not yet measured (docs/OPEN_QUESTIONS.md).
//
// What it holds to, from the WebAuthn spec and Chromium's source (read 2026-10-09):
// - the PRF output is fixed per credential and salt: HMAC-SHA-256 of the credential's own secret over
//   SHA-256("WebAuthn PRF" || 0x00 || salt), the client's salt mapping; the secret is derived from the
//   credential id and the authenticator's seed, so the same id and salt give the same 32 bytes in every run,
//   and another seed is a stranger's authenticator;
// - at create() an authenticator may give the output, or only say it can (prf.enabled true, results from a
//   get()), or say it cannot (enabled false), or a client may say nothing at all; a credential without PRF
//   answers a get() with no results, silently;
// - the user verification flag is byte 32 of the authenticator data (0x04), handed back by create() through
//   response.getAuthenticatorData() and by get() as response.authenticatorData;
// - one passkey per RP ID and user handle: making one again for the same user replaces the earlier one;
// - a cancelled prompt and a timeout are both NotAllowedError; an abort rejects with the signal's reason;
//   an rp.id other than the extension's id is a SecurityError.
// No signature and no credential public key: nothing here checks one. The ceremony log holds outcomes
// only, never a PRF output.
import type { PasskeyApi, PasskeyStatics } from '../src/core/vault';

/** where a new passkey's PRF output comes from */
export type PrfMode = 'create' | 'get' | 'disabled' | 'none';
/** the student's answer to the next prompt; 'hang' waits until the page aborts */
export type PromptAnswer = 'approve' | 'cancel' | 'timeout' | 'hang';

export interface FakeAuthenticatorOptions {
  /**
   * For passkeys made from now on: 'create', the output at create() (an authenticator with the prf
   * extension, such as iCloud Keychain on macOS 15, or Windows Hello through webauthn.dll version 8 from
   * Chrome 147); 'get', prf.enabled at create() and the output from a get() only; 'disabled', prf.enabled
   * false (an authenticator without PRF: Chrome's own Touch ID authenticator, Windows Hello before
   * KB5077181); 'none', no prf entry at all. Default 'create'.
   */
  prf?: PrfMode;
  /** the UV flag in the authenticator data of every answer from now on; false plays an authenticator that claims no verification. Default true */
  uv?: boolean;
  /** the answer to every prompt the queue does not answer. Default 'approve' */
  answer?: PromptAnswer;
  /** answers for the next prompts, in order, before `answer` */
  queue?: PromptAnswer[];
  /** how long 'timeout' takes (default 5 ms; a real one waits the request's timeout) */
  timeoutMs?: number;
  /** the extension's id, the RP ID Chrome fills in on its own page. Default 'ext' */
  rpId?: string;
  /** what isUserVerifyingPlatformAuthenticatorAvailable() says. Default true */
  platform?: boolean;
  /** what getClientCapabilities() says, or 'absent' for a browser without it. Default extension:prf true */
  capabilities?: Record<string, boolean> | 'absent';
  /** the secret every passkey's PRF secret is derived from. Default 'fake-authenticator' */
  seed?: string;
}

/** a passkey as the student's passkey list would show it */
export interface FakePasskey {
  cred: string;
  rpId: string;
  rpName: string;
  /** base64url of the user handle */
  userId: string;
  userName: string;
  displayName: string;
  prf: PrfMode;
}

export interface FakeAuthenticator extends PasskeyApi {
  /** the knobs, read at each prompt, so a test may change them between two */
  readonly options: FakeAuthenticatorOptions & { queue: PromptAnswer[] };
  /** PublicKeyCredential's two probes, as the options say now */
  readonly statics: PasskeyStatics;
  /** calls of create() and get(), answered or not */
  creates: number;
  gets: number;
  readonly ceremonies: number;
  /** `webauthn.create -> ok`, `webauthn.get -> cancel`, …: outcomes only */
  readonly log: string[];
  /** what each call was given, in order (salts and challenges; no secret is ever in one) */
  readonly calls: Array<{ kind: 'create'; options: CredentialCreationOptions } | { kind: 'get'; options: CredentialRequestOptions }>;
  passkeys(): FakePasskey[];
  /** the student deleted it from the passkey list; true when it was there */
  remove(cred: string): boolean;
  /** the output this authenticator gives for a passkey and a salt (bytes, or base64 as a record keeps it) */
  prfFor(cred: string, salt: Uint8Array | string): Promise<Uint8Array>;
}

const enc = (s: string) => new TextEncoder().encode(s);
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64');
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromB64url = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

function concat(...parts: ArrayLike<number>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** a BufferSource's bytes, or undefined for anything else */
function bytes(x: unknown): Uint8Array | undefined {
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  return undefined;
}

async function sha256(b: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(b)));
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', new Uint8Array(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new Uint8Array(data)));
}

const notAllowed = () => new DOMException('The operation either timed out or was not allowed. See: https://www.w3.org/TR/webauthn-2/#sctn-privacy-considerations-client.', 'NotAllowedError');

/** CBOR for the attestation object of attestation 'none': {fmt: "none", attStmt: {}, authData: bytes} */
function attestationNone(authData: Uint8Array): Uint8Array<ArrayBuffer> {
  const text = (s: string) => concat([0x60 + s.length], enc(s));
  const len = authData.length < 24 ? [0x40 + authData.length] : authData.length < 256 ? [0x58, authData.length] : [0x59, authData.length >> 8, authData.length & 0xff];
  return concat([0xa3], text('fmt'), text('none'), text('attStmt'), [0xa0], text('authData'), len, authData);
}

interface Held extends FakePasskey {
  userIdBytes: Uint8Array;
}

export function fakeAuthenticator(init: FakeAuthenticatorOptions = {}): FakeAuthenticator {
  const options: FakeAuthenticatorOptions & { queue: PromptAnswer[] } = { ...init, queue: [...(init.queue ?? [])] };
  const held = new Map<string, Held>();
  const log: string[] = [];
  const calls: FakeAuthenticator['calls'] = [];
  const rpId = () => options.rpId ?? 'ext';
  const origin = () => `chrome-extension://${rpId()}`;

  const prfFor = async (cred: string, salt: Uint8Array | string): Promise<Uint8Array<ArrayBuffer>> => {
    const s = typeof salt === 'string' ? new Uint8Array(Buffer.from(salt, 'base64')) : salt;
    const secret = await hmac(enc(options.seed ?? 'fake-authenticator'), fromB64url(cred));
    return hmac(secret, await sha256(concat(enc('WebAuthn PRF'), [0], s)));
  };

  /** rpIdHash (Chrome hashes the whole origin for an extension), flags, a zero sign count, and on create the credential id */
  const authData = async (credId?: Uint8Array): Promise<Uint8Array<ArrayBuffer>> => {
    const flags = 0x01 | (options.uv === false ? 0 : 0x04) | (credId ? 0x40 : 0);
    const head = concat(await sha256(enc(origin())), [flags], [0, 0, 0, 0]);
    return credId ? concat(head, new Uint8Array(16), [credId.length >> 8, credId.length & 0xff], credId) : head;
  };

  const clientData = (type: string, challenge: Uint8Array) => concat(enc(JSON.stringify({ type, challenge: b64url(challenge), origin: origin(), crossOrigin: false })));

  /** the student's answer to this prompt, or the page's abort */
  const prompt = (kind: 'create' | 'get', signal?: AbortSignal | null): Promise<void> => {
    const answer = options.queue.shift() ?? options.answer ?? 'approve';
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        log.push(`webauthn.${kind} -> aborted`);
        reject(signal.reason);
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        log.push(`webauthn.${kind} -> aborted`);
        reject(signal!.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const end = (f: () => void, ms = 0) => {
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          f();
        }, ms);
      };
      if (answer === 'approve') end(resolve);
      else if (answer === 'cancel') end(() => (log.push(`webauthn.${kind} -> cancel`), reject(notAllowed())));
      else if (answer === 'timeout') end(() => (log.push(`webauthn.${kind} -> timeout`), reject(notAllowed())), options.timeoutMs ?? 5);
      // 'hang': only the signal ends it
    });
  };

  const checkRpId = (id: string | undefined) => {
    if (id !== undefined && id !== rpId()) throw new DOMException(`The relying party ID '${id}' is not this extension's.`, 'SecurityError');
  };

  const fa: FakeAuthenticator = {
    options,
    get statics(): PasskeyStatics {
      const caps = options.capabilities ?? { 'extension:prf': true, userVerifyingPlatformAuthenticator: true };
      return { uvpaa: async () => options.platform ?? true, ...(caps === 'absent' ? {} : { caps: async () => ({ ...caps }) }) };
    },
    creates: 0,
    gets: 0,
    get ceremonies() {
      return fa.creates + fa.gets;
    },
    log,
    calls,

    async create(o) {
      fa.creates++;
      calls.push({ kind: 'create', options: o });
      const pk = o?.publicKey;
      if (!pk) throw new DOMException('Only public-key credentials here.', 'NotSupportedError');
      const challenge = bytes(pk.challenge);
      const userId = bytes(pk.user?.id);
      if (!challenge || challenge.length < 16) throw new TypeError('challenge: at least 16 bytes');
      if (typeof pk.rp?.name !== 'string') throw new TypeError('rp.name is required');
      checkRpId(pk.rp.id);
      if (!userId || userId.length < 1 || userId.length > 64) throw new TypeError('user.id: 1 to 64 bytes');
      if (typeof pk.user.name !== 'string' || typeof pk.user.displayName !== 'string') throw new TypeError('user.name and user.displayName are required');
      if (!pk.pubKeyCredParams?.some((p) => p.type === 'public-key' && (p.alg === -7 || p.alg === -257))) throw new DOMException('No algorithm this authenticator has.', 'NotSupportedError');
      const prfIn = pk.extensions?.prf;
      const salt = prfIn?.eval ? bytes(prfIn.eval.first) : undefined;
      if (prfIn?.eval && !salt) throw new TypeError('prf.eval.first: a BufferSource');
      await prompt('create', o.signal);
      // a platform authenticator only; asked for another kind, Chrome waits for one that never comes
      if (pk.authenticatorSelection?.authenticatorAttachment === 'cross-platform') {
        log.push('webauthn.create -> no authenticator');
        throw notAllowed();
      }
      const rawId = crypto.getRandomValues(new Uint8Array(16));
      const cred = b64url(rawId);
      const mode = options.prf ?? 'create';
      for (const [k, p] of held) if (p.rpId === rpId() && b64url(p.userIdBytes) === b64url(userId)) held.delete(k);
      held.set(cred, { cred, rpId: rpId(), rpName: pk.rp.name, userId: b64url(userId), userIdBytes: new Uint8Array(userId), userName: pk.user.name, displayName: pk.user.displayName, prf: mode });
      const ad = await authData(rawId);
      const prfOut =
        !prfIn ? undefined
        : mode === 'create' ? { enabled: true, ...(salt ? { results: { first: (await prfFor(cred, salt)).buffer } } : {}) }
        : mode === 'get' ? { enabled: true }
        : mode === 'disabled' ? { enabled: false }
        : undefined;
      log.push('webauthn.create -> ok');
      return {
        id: cred,
        rawId: rawId.buffer,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: clientData('webauthn.create', challenge).buffer,
          attestationObject: attestationNone(ad).buffer,
          getAuthenticatorData: () => ad.slice().buffer,
          getTransports: () => ['internal'],
        },
        getClientExtensionResults: () => (prfOut ? { prf: { ...prfOut } } : {}),
      } as unknown as Credential;
    },

    async get(o) {
      fa.gets++;
      calls.push({ kind: 'get', options: o });
      const pk = o?.publicKey;
      if (!pk) throw new DOMException('Only public-key credentials here.', 'NotSupportedError');
      const challenge = bytes(pk.challenge);
      if (!challenge || challenge.length < 16) throw new TypeError('challenge: at least 16 bytes');
      checkRpId(pk.rpId);
      await prompt('get', o.signal);
      const allowed = (pk.allowCredentials ?? []).map((d) => bytes(d.id)).filter((b): b is Uint8Array => !!b).map(b64url);
      const mine = [...held.values()].filter((p) => p.rpId === rpId());
      const found = allowed.length ? allowed.map((id) => held.get(id)).find((p) => p && p.rpId === rpId()) : mine.at(-1);
      // Chrome says there is no passkey for this site; dismissing that is NotAllowedError
      if (!found) {
        log.push('webauthn.get -> no passkey');
        throw notAllowed();
      }
      const prfIn = pk.extensions?.prf;
      const salt = bytes(prfIn?.evalByCredential?.[found.cred]?.first ?? prfIn?.eval?.first);
      const results = prfIn && salt && (found.prf === 'create' || found.prf === 'get') ? { results: { first: (await prfFor(found.cred, salt)).buffer } } : {};
      const rawId = fromB64url(found.cred);
      const ad = await authData();
      log.push('webauthn.get -> ok');
      return {
        id: found.cred,
        rawId: rawId.buffer,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: clientData('webauthn.get', challenge).buffer,
          authenticatorData: ad.buffer,
          signature: new ArrayBuffer(64),
          userHandle: new Uint8Array(found.userIdBytes).buffer,
        },
        // a credential without PRF: the browser drops the request and says nothing
        getClientExtensionResults: () => (prfIn && found.prf !== 'none' ? { prf: { ...results } } : {}),
      } as unknown as Credential;
    },

    passkeys: () => [...held.values()].map(({ userIdBytes: _u, ...p }) => ({ ...p })),
    remove: (cred) => held.delete(cred),
    prfFor,
  };
  return fa;
}

/** the PRF output as SIGNIN_UNLOCK_KEY keeps it (base64), for comparing with what a page wrote */
export async function prfBase64(fa: FakeAuthenticator, cred: string, salt: Uint8Array | string): Promise<string> {
  return b64(await fa.prfFor(cred, salt));
}
