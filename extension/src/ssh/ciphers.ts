// Packet ciphers: a payload in, wire bytes out; and one whole packet out of a receive buffer, its
// integrity checked before any byte of it is returned. "none" (until the first NEWKEYS),
// aes{128,192,256}-ctr with hmac-sha1 or hmac-sha2-256 (encrypt-and-MAC), and aes256-gcm@openssh.com.
// ETM MACs are not implemented (the grid offers hmac-sha1 only).
//
// 12.0.0:
//   - a packet split across reads: CtrMacCipher decrypts the first block of a packet once and keeps it
//     (and the packet length it read) until the rest has arrived, instead of decrypting it and winding
//     the counter back on every call that finds the packet incomplete;
//   - authentication packets are padded so their length says nothing finer than a 256-byte bucket
//     (`padTo`): a password's or a code's length is not visible on the wire.
import { concat, equalBytes, SshProtocolError } from './bytes';
import { AesCtr, AesGcm, Hmac } from './crypto';

/** a generous upper bound on packet_length (RFC 4253 says an implementation MUST accept 35000) */
export const PACKET_MAX = 256 * 1024;

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}

function rand(n: number): Uint8Array {
  const b = new Uint8Array(n);
  if (n) globalThis.crypto.getRandomValues(b);
  return b;
}

export interface Unpacked {
  payload: Uint8Array;
  consumed: number;
}

export interface PackOptions {
  /** pad so that the padded part's length is a multiple of this (256 for authentication packets), when a padding of 4 to 255 bytes can do it */
  padTo?: number;
  /**
   * an authentication packet (a password, a code): every plaintext copy this pack makes (the packet, the
   * MAC's input, the copies handed to WebCrypto) is zeroed once the wire bytes exist. A browser cannot
   * promise when other memory is overwritten; this keeps Beethoven's own copies from lingering.
   */
  wipe?: boolean;
}

export interface PacketCipher {
  readonly blockSize: number;
  readonly macLen: number;
  pack(payload: Uint8Array, seq: number, o?: PackOptions): Promise<Uint8Array>;
  /** one whole packet from the front of `buf`, or null when it has not all arrived yet */
  unpack(buf: Uint8Array, seq: number): Promise<Unpacked | null>;
}

/**
 * The padding length: at least 4, at most 255, making `fixed + payload + padding` a multiple of the
 * block size, and (padTo) of padTo when that is reachable. `fixed` is 5 for the classic layout
 * (length and padding-length bytes inside the block alignment), 1 for AES-GCM (the length is AAD).
 */
export function paddingFor(fixed: number, payloadLen: number, blockSize: number, padTo?: number): number {
  let pad = blockSize - ((fixed + payloadLen) % blockSize);
  if (pad < 4) pad += blockSize;
  // the classic minimum total of 16 bytes
  while (fixed === 5 && fixed + payloadLen + pad < 16) pad += blockSize;
  if (padTo && padTo % blockSize === 0) {
    let p = padTo - ((fixed + payloadLen) % padTo);
    if (p === padTo) p = 0;
    while (p < 4) p += padTo;
    if (p <= 255) pad = p;
  }
  return pad;
}

/** no encryption, no MAC; block size 8. Before the first NEWKEYS. */
export class NoneCipher implements PacketCipher {
  readonly blockSize = 8;
  readonly macLen = 0;
  async pack(payload: Uint8Array, _seq: number, o: PackOptions = {}): Promise<Uint8Array> {
    const padLen = paddingFor(5, payload.length, this.blockSize, o.padTo);
    return concat(u32be(1 + payload.length + padLen), new Uint8Array([padLen]), payload, rand(padLen));
  }
  async unpack(buf: Uint8Array): Promise<Unpacked | null> {
    if (buf.length < 4) return null;
    const len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0);
    if (len < 5 || len > PACKET_MAX) throw new SshProtocolError('bad packet_length');
    if (buf.length < 4 + len) return null;
    const padLen = buf[4]!;
    if (padLen < 4 || 1 + padLen > len) throw new SshProtocolError('bad padding');
    return { payload: buf.slice(5, 4 + len - padLen), consumed: 4 + len };
  }
}

/** AES-CTR with an HMAC (encrypt-and-MAC). */
export class CtrMacCipher implements PacketCipher {
  readonly blockSize = 16;
  /** the first block of the packet in progress, decrypted once, and the length it carries */
  private head: { block: Uint8Array; len: number } | undefined;
  constructor(
    private readonly aes: AesCtr,
    private readonly mac: Hmac,
  ) {}
  get macLen(): number {
    return this.mac.macLen;
  }
  async pack(payload: Uint8Array, seq: number, o: PackOptions = {}): Promise<Uint8Array> {
    const padLen = paddingFor(5, payload.length, this.blockSize, o.padTo);
    const plain = concat(u32be(1 + payload.length + padLen), new Uint8Array([padLen]), payload, rand(padLen));
    const macIn = concat(u32be(seq), plain);
    try {
      const tag = await this.mac.tag(macIn, !!o.wipe);
      const ct = await this.aes.xform(plain, !!o.wipe);
      return concat(ct, tag);
    } finally {
      if (o.wipe) {
        plain.fill(0);
        macIn.fill(0);
      }
    }
  }
  async unpack(buf: Uint8Array, seq: number): Promise<Unpacked | null> {
    const bs = this.blockSize;
    if (!this.head) {
      if (buf.length < bs) return null;
      const block = await this.aes.xform(buf.subarray(0, bs));
      const len = new DataView(block.buffer, block.byteOffset, 4).getUint32(0);
      if (len < 12 || len > PACKET_MAX || (4 + len) % bs !== 0) throw new SshProtocolError('bad packet_length');
      this.head = { block, len };
    }
    const { block, len } = this.head;
    const need = 4 + len + this.macLen;
    if (buf.length < need) return null; // the rest is still on its way; the head waits, the counter has moved past it once
    this.head = undefined;
    const rest = len + 4 > bs ? await this.aes.xform(buf.subarray(bs, 4 + len)) : new Uint8Array(0);
    const plain = concat(block, rest);
    const mac = buf.subarray(4 + len, need);
    if (!equalBytes(mac, await this.mac.tag(concat(u32be(seq), plain)))) throw new SshProtocolError('MAC verification failed', 5);
    const padLen = plain[4]!;
    if (padLen < 4 || 5 + padLen > 4 + len) throw new SshProtocolError('bad padding');
    return { payload: plain.slice(5, 4 + len - padLen), consumed: need };
  }
}

/** aes256-gcm@openssh.com: the length in clear as AAD, a 16-byte tag. */
export class GcmCipher implements PacketCipher {
  readonly blockSize = 16;
  readonly macLen = 16;
  constructor(private readonly gcm: AesGcm) {}
  async pack(payload: Uint8Array, _seq: number, o: PackOptions = {}): Promise<Uint8Array> {
    const padLen = paddingFor(1, payload.length, this.blockSize, o.padTo);
    const aad = u32be(1 + payload.length + padLen);
    const pt = concat(new Uint8Array([padLen]), payload, rand(padLen));
    try {
      const ctTag = await this.gcm.seal(aad, pt, !!o.wipe);
      return concat(aad, ctTag);
    } finally {
      if (o.wipe) pt.fill(0);
    }
  }
  async unpack(buf: Uint8Array): Promise<Unpacked | null> {
    if (buf.length < 4) return null;
    const len = new DataView(buf.buffer, buf.byteOffset, 4).getUint32(0);
    if (len < 16 || len > PACKET_MAX || len % this.blockSize !== 0) throw new SshProtocolError('bad packet_length');
    const need = 4 + len + this.macLen;
    if (buf.length < need) return null;
    const pt = await this.gcm.open(buf.subarray(0, 4), buf.subarray(4, need));
    const padLen = pt[0]!;
    if (padLen < 4 || 1 + padLen > len) throw new SshProtocolError('bad padding');
    return { payload: pt.slice(1, len - padLen), consumed: need };
  }
}

export const CIPHER_INFO: Record<string, { keyBytes: number; ivBytes: number; kind: 'ctr' | 'gcm' }> = {
  'aes128-ctr': { keyBytes: 16, ivBytes: 16, kind: 'ctr' },
  'aes192-ctr': { keyBytes: 24, ivBytes: 16, kind: 'ctr' },
  'aes256-ctr': { keyBytes: 32, ivBytes: 16, kind: 'ctr' },
  'aes256-gcm@openssh.com': { keyBytes: 32, ivBytes: 12, kind: 'gcm' },
};

export const MAC_INFO: Record<string, { alg: 'SHA-1' | 'SHA-256'; keyBytes: number; macLen: number }> = {
  'hmac-sha1': { alg: 'SHA-1', keyBytes: 20, macLen: 20 },
  'hmac-sha2-256': { alg: 'SHA-256', keyBytes: 32, macLen: 32 },
};

export async function makeCtrCipher(macName: string, encKey: Uint8Array, iv: Uint8Array, macKey: Uint8Array): Promise<CtrMacCipher> {
  const m = MAC_INFO[macName];
  if (!m) throw new SshProtocolError(`unknown mac ${macName}`);
  return new CtrMacCipher(await AesCtr.create(encKey, iv), await Hmac.create(m.alg, macKey, m.macLen));
}

export async function makeGcmCipher(encKey: Uint8Array, iv: Uint8Array): Promise<GcmCipher> {
  return new GcmCipher(await AesGcm.create(encKey, iv));
}
