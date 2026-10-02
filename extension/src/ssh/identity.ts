// An ssh identity held as a WebCrypto key: ecdsa-sha2-nistp256, or ssh-ed25519 where the browser's
// WebCrypto has Ed25519. The identity only signs; its private key is a non-extractable CryptoKey
// (core/keyring.ts keeps it wrapped at rest). Ported from the spike's passkey/lib/sshid.js.
import { ab, base64, concat, Writer } from './bytes';

export type KeyAlg = 'ecdsa-p256' | 'ed25519';

interface AlgSpec {
  keyType: 'ecdsa-sha2-nistp256' | 'ssh-ed25519';
  gen: EcKeyGenParams | AlgorithmIdentifier;
  imp: EcKeyImportParams | AlgorithmIdentifier;
  sig: EcdsaParams | AlgorithmIdentifier;
  rawLen: number;
}

export const ALGS: Record<KeyAlg, AlgSpec> = {
  'ecdsa-p256': { keyType: 'ecdsa-sha2-nistp256', gen: { name: 'ECDSA', namedCurve: 'P-256' }, imp: { name: 'ECDSA', namedCurve: 'P-256' }, sig: { name: 'ECDSA', hash: 'SHA-256' }, rawLen: 65 },
  ed25519: { keyType: 'ssh-ed25519', gen: { name: 'Ed25519' }, imp: { name: 'Ed25519' }, sig: { name: 'Ed25519' }, rawLen: 32 },
};

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** a key pair; `extractable` true only so the private key can be wrapped once (keyring.ts) */
export async function generateKeyPair(alg: KeyAlg, extractable: boolean): Promise<CryptoKeyPair> {
  return (await subtle().generateKey(ALGS[alg].gen, extractable, ['sign', 'verify'])) as CryptoKeyPair;
}

/** WebCrypto here signs with Ed25519 (Chrome 137 and later, Node 22) */
export async function hasEd25519(): Promise<boolean> {
  try {
    const kp = await generateKeyPair('ed25519', false);
    await subtle().sign(ALGS.ed25519.sig, kp.privateKey, new Uint8Array([1]));
    return true;
  } catch {
    return false;
  }
}

/** SSH mpint of an unsigned big-endian integer, as a whole field */
function mpintField(b: Uint8Array): Uint8Array {
  return new Writer().mpint(b).bytes();
}

export class SshIdentity {
  readonly keyType: 'ecdsa-sha2-nistp256' | 'ssh-ed25519';
  constructor(
    readonly alg: KeyAlg,
    readonly privateKey: CryptoKey,
    /** the raw public key: the 65-byte P-256 point or the 32-byte Ed25519 key */
    readonly pubRaw: Uint8Array,
  ) {
    if (pubRaw.length !== ALGS[alg].rawLen) throw new Error('bad public key length');
    this.keyType = ALGS[alg].keyType;
  }

  /** the public-key blob: for ecdsa string type, string "nistp256", string Q; for ed25519 string type, string key */
  publicKeyBlob(): Uint8Array {
    return this.alg === 'ecdsa-p256' ? new Writer().string('ecdsa-sha2-nistp256').string('nistp256').string(this.pubRaw).bytes() : new Writer().string('ssh-ed25519').string(this.pubRaw).bytes();
  }

  /** the blob in base64, as an authorized_keys line carries it */
  publicKeyBase64(): string {
    return base64(this.publicKeyBlob());
  }

  async fingerprint(): Promise<string> {
    const h = new Uint8Array(await subtle().digest('SHA-256', ab(this.publicKeyBlob())));
    return 'SHA256:' + base64(h).replace(/=+$/, '');
  }

  /** the SSH signature blob (RFC 5656 / RFC 8709) over `data` */
  async sign(data: Uint8Array): Promise<Uint8Array> {
    const raw = new Uint8Array(await subtle().sign(ALGS[this.alg].sig, this.privateKey, ab(data)));
    if (raw.length !== 64) throw new Error('unexpected signature length');
    if (this.alg === 'ecdsa-p256') return new Writer().string(this.keyType).string(concat(mpintField(raw.subarray(0, 32)), mpintField(raw.subarray(32)))).bytes();
    return new Writer().string(this.keyType).string(raw).bytes();
  }
}

/** a private key belongs to a public key: sign a random message, verify it */
export async function keysMatch(alg: KeyAlg, privateKey: CryptoKey, pubRaw: Uint8Array): Promise<boolean> {
  const a = ALGS[alg];
  const pub = await subtle().importKey('raw', ab(pubRaw), a.imp, false, ['verify']);
  const msg = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const sig = await subtle().sign(a.sig, privateKey, ab(msg));
  return subtle().verify(a.sig, pub, sig, ab(msg));
}
