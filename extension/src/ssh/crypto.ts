// Crypto primitives over WebCrypto (globalThis.crypto.subtle), and the few pieces WebCrypto does not
// shape the way SSH needs (a 128-bit counter kept across packets, a hand-built SPKI for an RSA host
// key, SSH's signature encodings). No dependencies.
//
// Review fix (12.0.0, "the host-key signature algorithm is not checked against the negotiated one"):
// verifyHostSig takes the algorithm KEXINIT negotiated and accepts a signature only of exactly that
// algorithm, over a key of the type that algorithm names. Before, an RSA host could have signed with
// SHA-1 ("ssh-rsa") after rsa-sha2-512 was agreed, and the client would have accepted the downgrade.
import { ab, base64, concat, leftPad, Reader, SshProtocolError } from './bytes';

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

export type HashName = 'SHA-1' | 'SHA-256' | 'SHA-512';

export async function digest(alg: HashName, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest(alg, ab(data)));
}
export const sha256 = (d: Uint8Array): Promise<Uint8Array> => digest('SHA-256', d);
export const sha512 = (d: Uint8Array): Promise<Uint8Array> => digest('SHA-512', d);

/** HMAC; the full tag (the cipher truncates to its MAC length when it must) */
export async function hmac(alg: 'SHA-1' | 'SHA-256', key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', ab(key), { name: 'HMAC', hash: alg }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, ab(data)));
}

/** A keyed HMAC kept for the life of a direction's keys (one importKey, not one per packet). */
export class Hmac {
  private constructor(
    private readonly key: CryptoKey,
    readonly macLen: number,
  ) {}
  static async create(alg: 'SHA-1' | 'SHA-256', key: Uint8Array, macLen: number): Promise<Hmac> {
    return new Hmac(await subtle().importKey('raw', ab(key), { name: 'HMAC', hash: alg }, false, ['sign']), macLen);
  }
  /** wipe: the copy handed to WebCrypto is zeroed once it has answered (an authentication packet's plaintext) */
  async tag(data: Uint8Array, wipe = false): Promise<Uint8Array> {
    const copy = ab(data);
    try {
      return new Uint8Array(await subtle().sign('HMAC', this.key, copy)).subarray(0, this.macLen);
    } finally {
      if (wipe) new Uint8Array(copy).fill(0);
    }
  }
}

/** AES-CTR keeping a 128-bit big-endian counter across calls, as SSH requires. */
export class AesCtr {
  private constructor(
    private readonly key: CryptoKey,
    readonly counter: Uint8Array,
  ) {}
  static async create(key: Uint8Array, iv: Uint8Array): Promise<AesCtr> {
    if (![16, 24, 32].includes(key.length)) throw new Error('bad aes key length');
    const k = await subtle().importKey('raw', ab(key), { name: 'AES-CTR' }, false, ['encrypt']);
    return new AesCtr(k, iv.slice(0, 16));
  }
  /** encrypt or decrypt (CTR is symmetric); advances the counter by ceil(len / 16) blocks */
  async xform(data: Uint8Array, wipe = false): Promise<Uint8Array> {
    const copy = ab(data);
    try {
      const out = new Uint8Array(await subtle().encrypt({ name: 'AES-CTR', counter: ab(this.counter), length: 128 }, this.key, copy));
      this.advance(Math.ceil(data.length / 16));
      return out;
    } finally {
      if (wipe) new Uint8Array(copy).fill(0);
    }
  }
  advance(blocks: number): void {
    let add = BigInt(blocks);
    const c = this.counter;
    for (let i = 15; i >= 0 && add > 0n; i--) {
      const s = BigInt(c[i]!) + (add & 0xffn);
      c[i] = Number(s & 0xffn);
      add = (add >> 8n) + (s >> 8n);
    }
    // wraps modulo 2^128, exactly as SSH requires
  }
}

/** AES-GCM for aes256-gcm@openssh.com: a 4-byte fixed part and an 8-byte invocation counter. */
export class AesGcm {
  private constructor(
    private readonly key: CryptoKey,
    readonly iv: Uint8Array,
  ) {}
  static async create(key: Uint8Array, iv: Uint8Array): Promise<AesGcm> {
    const k = await subtle().importKey('raw', ab(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    return new AesGcm(k, iv.slice(0, 12));
  }
  async seal(aad: Uint8Array, pt: Uint8Array, wipe = false): Promise<Uint8Array> {
    const copy = ab(pt);
    try {
      const ctTag = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: ab(this.iv), additionalData: ab(aad), tagLength: 128 }, this.key, copy));
      this.bump();
      return ctTag;
    } finally {
      if (wipe) new Uint8Array(copy).fill(0);
    }
  }
  async open(aad: Uint8Array, ctTag: Uint8Array): Promise<Uint8Array> {
    let pt: Uint8Array;
    try {
      pt = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: ab(this.iv), additionalData: ab(aad), tagLength: 128 }, this.key, ab(ctTag)));
    } catch {
      throw new SshProtocolError('AES-GCM tag verification failed', 5);
    }
    this.bump();
    return pt;
  }
  /**
   * Earlier fix kept (review t8): the invocation counter's carry. `++u8[i]` evaluates to 256, never 0,
   * so a carry never propagated and the nonce repeated every 256 packets; store first, then test.
   */
  bump(): void {
    for (let i = 11; i >= 4; i--) {
      this.iv[i] = (this.iv[i]! + 1) & 0xff;
      if (this.iv[i] !== 0) break;
    }
  }
}

// ---- key exchange: X25519 and ECDH P-256 ----------------------------------------------------------

export interface Ephemeral {
  pub: Uint8Array;
  deriveShared(peer: Uint8Array): Promise<Uint8Array>;
}

/** this runtime's WebCrypto has X25519 */
export async function hasX25519(): Promise<boolean> {
  try {
    const kp = (await subtle().generateKey({ name: 'X25519' } as unknown as AlgorithmIdentifier, true, ['deriveBits'])) as CryptoKeyPair;
    await subtle().exportKey('raw', kp.publicKey);
    return true;
  } catch {
    return false;
  }
}

export async function x25519Ephemeral(): Promise<Ephemeral> {
  const kp = (await subtle().generateKey({ name: 'X25519' } as unknown as AlgorithmIdentifier, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  return {
    pub,
    async deriveShared(peer) {
      if (peer.length !== 32) throw new SshProtocolError('bad curve25519 public value', 3);
      const peerKey = await subtle().importKey('raw', ab(peer), { name: 'X25519' } as unknown as AlgorithmIdentifier, false, []);
      return new Uint8Array(await subtle().deriveBits({ name: 'X25519', public: peerKey } as unknown as EcdhKeyDeriveParams, kp.privateKey, 256));
    },
  };
}

export async function ecdhP256Ephemeral(): Promise<Ephemeral> {
  const kp = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  return {
    pub,
    async deriveShared(peer) {
      const peerKey = await subtle().importKey('raw', ab(peer), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      return new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: peerKey }, kp.privateKey, 256));
    },
  };
}

// ---- host key signature ------------------------------------------------------------------------------

/** the host-key algorithms this client accepts, and the key type and hash each one means */
export const HOSTKEY_ALGORITHMS: Record<string, { keyType: string; hash?: HashName }> = {
  'rsa-sha2-512': { keyType: 'ssh-rsa', hash: 'SHA-512' },
  'rsa-sha2-256': { keyType: 'ssh-rsa', hash: 'SHA-256' },
  'ssh-ed25519': { keyType: 'ssh-ed25519' },
  'ecdsa-sha2-nistp256': { keyType: 'ecdsa-sha2-nistp256', hash: 'SHA-256' },
  'ssh-rsa': { keyType: 'ssh-rsa', hash: 'SHA-1' },
};

/**
 * Verify the host's signature over the exchange hash H. `negotiated` is the host-key algorithm KEXINIT
 * agreed: the key blob must be of the type it names and the signature blob must carry exactly that
 * algorithm, or the answer is false whatever the signature.
 */
export async function verifyHostSig(negotiated: string, hostKeyBlob: Uint8Array, sigBlob: Uint8Array, H: Uint8Array): Promise<boolean> {
  const spec = HOSTKEY_ALGORITHMS[negotiated];
  if (!spec) return false;
  const kr = new Reader(hostKeyBlob);
  const kt = kr.text();
  const sr = new Reader(sigBlob);
  const st = sr.text();
  if (kt !== spec.keyType || st !== negotiated) return false;
  try {
    if (kt === 'ssh-rsa') {
      const e = kr.mpintUnsigned();
      const n = kr.mpintUnsigned();
      const sig = sr.string();
      const key = await importRsaSpki(n, e, spec.hash!);
      return await subtle().verify({ name: 'RSASSA-PKCS1-v1_5' }, key, ab(sig), ab(H));
    }
    if (kt === 'ssh-ed25519') {
      const pub = kr.string();
      const sig = sr.string();
      const key = await subtle().importKey('raw', ab(pub), { name: 'Ed25519' } as unknown as AlgorithmIdentifier, false, ['verify']);
      return await subtle().verify({ name: 'Ed25519' } as unknown as AlgorithmIdentifier, key, ab(sig), ab(H));
    }
    if (kt === 'ecdsa-sha2-nistp256') {
      if (kr.text() !== 'nistp256') return false;
      const q = kr.string();
      const inner = new Reader(sr.string());
      const r = inner.mpintUnsigned();
      const s = inner.mpintUnsigned();
      const raw = concat(leftPad(r, 32), leftPad(s, 32));
      const key = await subtle().importKey('raw', ab(q), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, ab(raw), ab(H));
    }
  } catch {
    return false;
  }
  return false;
}

/** an RSA public key from (n, e) as RSASSA-PKCS1-v1_5 with the given hash, through a minimal SubjectPublicKeyInfo */
async function importRsaSpki(n: Uint8Array, e: Uint8Array, hash: HashName): Promise<CryptoKey> {
  const rsaPub = derSeq(concat(derInt(n), derInt(e)));
  const algId = derSeq(concat(derOid([1, 2, 840, 113549, 1, 1, 1]), new Uint8Array([0x05, 0x00])));
  const spki = derSeq(concat(algId, derBitString(rsaPub)));
  return subtle().importKey('spki', ab(spki), { name: 'RSASSA-PKCS1-v1_5', hash }, false, ['verify']);
}

function derLen(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  const bytes: number[] = [];
  let x = n;
  while (x > 0) {
    bytes.unshift(x & 0xff);
    x >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}
function derTLV(tag: number, body: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), derLen(body.length), body);
}
export function derSeq(body: Uint8Array): Uint8Array {
  return derTLV(0x30, body);
}
export function derInt(bytesBE: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytesBE.length - 1 && bytesBE[i] === 0) i++;
  let body = bytesBE.subarray(i);
  if (body[0]! & 0x80) body = concat(new Uint8Array([0]), body);
  return derTLV(0x02, body);
}
export function derBitString(body: Uint8Array): Uint8Array {
  return derTLV(0x03, concat(new Uint8Array([0]), body));
}
export function derOid(parts: number[]): Uint8Array {
  const out: number[] = [40 * parts[0]! + parts[1]!];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i]!;
    const stack = [v & 0x7f];
    v >>= 7;
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v >>= 7;
    }
    out.push(...stack);
  }
  return derTLV(0x06, new Uint8Array(out));
}

/** "SHA256:<base64 without padding>", as ssh-keygen -l prints it */
export async function fingerprintOf(blob: Uint8Array): Promise<string> {
  return 'SHA256:' + base64(await sha256(blob)).replace(/=+$/, '');
}
