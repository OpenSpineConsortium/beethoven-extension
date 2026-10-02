// Key derivation (RFC 4253 section 7.2): per direction an IV, an encryption key and an integrity key,
// each HASH(K || H || letter || session_id) expanded to the length needed. K is encoded as an mpint.
import { concat, Writer } from './bytes';
import { digest, type HashName } from './crypto';

export async function deriveKey(hashAlg: HashName, kMpintBody: Uint8Array, H: Uint8Array, sessionId: Uint8Array, letter: string, need: number): Promise<Uint8Array> {
  // K as on the wire: uint32 length || body, exactly as it went into H
  const kEnc = new Writer().string(kMpintBody).bytes();
  const base = concat(kEnc, H);
  const first = await digest(hashAlg, concat(base, new Uint8Array([letter.charCodeAt(0)]), sessionId));
  let acc: Uint8Array = first.slice();
  while (acc.length < need) acc = concat(acc, await digest(hashAlg, concat(base, acc)));
  return acc.subarray(0, need);
}

export interface KeySizes {
  ivCtoS: number;
  ivStoC: number;
  encCtoS: number;
  encStoC: number;
  intCtoS: number;
  intStoC: number;
}

export interface DerivedKeys {
  ivCtoS: Uint8Array;
  ivStoC: Uint8Array;
  encCtoS: Uint8Array;
  encStoC: Uint8Array;
  intCtoS: Uint8Array;
  intStoC: Uint8Array;
}

export async function deriveAll(hashAlg: HashName, kMpintBody: Uint8Array, H: Uint8Array, sessionId: Uint8Array, sizes: KeySizes): Promise<DerivedKeys> {
  const [ivCtoS, ivStoC, encCtoS, encStoC, intCtoS, intStoC] = await Promise.all([
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'A', sizes.ivCtoS),
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'B', sizes.ivStoC),
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'C', sizes.encCtoS),
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'D', sizes.encStoC),
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'E', sizes.intCtoS),
    deriveKey(hashAlg, kMpintBody, H, sessionId, 'F', sizes.intStoC),
  ]);
  return { ivCtoS: ivCtoS!, ivStoC: ivStoC!, encCtoS: encCtoS!, encStoC: encStoC!, intCtoS: intCtoS!, intStoC: intStoC! };
}
