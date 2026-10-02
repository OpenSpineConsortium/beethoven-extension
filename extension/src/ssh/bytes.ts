// SSH wire encodings (RFC 4251 section 5) and small byte helpers. No dependencies.
//
// Ported to TypeScript for Beethoven 12.0.0 from the spike's client (scratchpad v12/iwa/app/client,
// bytes.js), unchanged in behaviour: string, mpint (unsigned and two's complement), name-list, base64,
// constant-time comparison.

const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: false });

export const utf8 = (s: string): Uint8Array => te.encode(s);
export const fromUtf8 = (b: Uint8Array): string => td.decode(b);

/** a fresh ArrayBuffer holding exactly these bytes (what WebCrypto is handed: never a view of a larger buffer) */
export function ab(b: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(b.byteLength);
  new Uint8Array(out).set(b);
  return out;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export function unhex(h: string): Uint8Array {
  const s = h.replace(/\s+/g, '');
  if (s.length % 2) throw new Error('odd hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    s += i + 1 < b.length ? B64[(n >> 6) & 63]! : '=';
    s += i + 2 < b.length ? B64[n & 63]! : '=';
  }
  return s;
}

export function unbase64(s: string): Uint8Array {
  const clean = s.replace(/[\s=]/g, '');
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const c of clean) {
    const v = B64.indexOf(c);
    if (v < 0) throw new Error('bad base64');
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export const base64url = (b: Uint8Array): string => base64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** constant-time comparison of two byte arrays (the length alone may leak) */
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i]! ^ b[i]!;
  return d === 0;
}

/** overwrite a buffer that held a secret (a password, a code, a key's bytes in transit) */
export function zero(b: Uint8Array | undefined): void {
  if (b && typeof b.fill === 'function') b.fill(0);
}

/** strip leading zero bytes; keep one 0x00 if the top bit of the first remaining byte is set */
export function mpintBodyUnsigned(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length && bytes[i] === 0) i++;
  const body = bytes.subarray(i);
  if (body.length && body[0]! & 0x80) return concat(new Uint8Array([0]), body);
  return body.slice();
}

/** two's-complement mpint body from a BigInt (RFC 4251's examples include negatives) */
export function mpintBodyBigInt(v: bigint): Uint8Array {
  if (v === 0n) return new Uint8Array(0);
  const neg = v < 0n;
  const bytes: number[] = [];
  let x = neg ? -v : v;
  while (x > 0n) {
    bytes.unshift(Number(x & 0xffn));
    x >>= 8n;
  }
  if (!neg) {
    if (bytes[0]! & 0x80) bytes.unshift(0);
    return new Uint8Array(bytes);
  }
  const n = bytes.length;
  const mod = 1n << BigInt(8 * n);
  let t = mod + v;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(Number(t & 0xffn));
    t >>= 8n;
  }
  if (!(out[0]! & 0x80)) out.unshift(0xff);
  return new Uint8Array(out);
}

export class SshProtocolError extends Error {
  /** the DISCONNECT reason code this error would send */
  readonly reason: number;
  constructor(msg: string, reason = 2) {
    super(msg);
    this.name = 'SshProtocolError';
    this.reason = reason;
  }
}

export class Writer {
  private readonly parts: Uint8Array[] = [];
  byte(v: number): this {
    this.parts.push(new Uint8Array([v & 0xff]));
    return this;
  }
  bool(v: boolean): this {
    return this.byte(v ? 1 : 0);
  }
  u32(v: number): this {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0);
    this.parts.push(b);
    return this;
  }
  raw(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }
  string(v: Uint8Array | string): this {
    const b = typeof v === 'string' ? utf8(v) : v;
    this.u32(b.length);
    this.parts.push(b);
    return this;
  }
  nameList(list: readonly string[]): this {
    for (const n of list) if (!n || n.includes(',')) throw new Error('bad name in name-list');
    return this.string(list.join(','));
  }
  /** unsigned mpint from big-endian bytes */
  mpint(bytes: Uint8Array): this {
    return this.string(mpintBodyUnsigned(bytes));
  }
  mpintBig(v: bigint): this {
    return this.string(mpintBodyBigInt(v));
  }
  bytes(): Uint8Array {
    return concat(...this.parts);
  }
}

export class Reader {
  private o = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number): void {
    if (this.o + n > this.b.length) throw new SshProtocolError('truncated message');
  }
  byte(): number {
    this.need(1);
    return this.b[this.o++]!;
  }
  bool(): boolean {
    return this.byte() !== 0;
  }
  u32(): number {
    this.need(4);
    const v = new DataView(this.b.buffer, this.b.byteOffset + this.o, 4).getUint32(0);
    this.o += 4;
    return v;
  }
  raw(n: number): Uint8Array {
    this.need(n);
    const v = this.b.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  string(): Uint8Array {
    const n = this.u32();
    return this.raw(n);
  }
  text(): string {
    return fromUtf8(this.string());
  }
  nameList(): string[] {
    const s = fromUtf8(this.string());
    return s === '' ? [] : s.split(',');
  }
  /** mpint as unsigned big-endian bytes; refuses negatives and non-minimal encodings */
  mpintUnsigned(): Uint8Array {
    const b = this.string();
    if (b.length && b[0]! & 0x80) throw new SshProtocolError('negative mpint');
    if (b.length > 1 && b[0] === 0 && !(b[1]! & 0x80)) throw new SshProtocolError('non-minimal mpint');
    return b[0] === 0 ? b.subarray(1) : b;
  }
  rest(): Uint8Array {
    const v = this.b.subarray(this.o);
    this.o = this.b.length;
    return v;
  }
  done(): boolean {
    return this.o === this.b.length;
  }
}

/** left-pad big-endian bytes to n (throws if longer after stripping zeros) */
export function leftPad(b: Uint8Array, n: number): Uint8Array {
  let i = 0;
  while (b.length - i > n && b[i] === 0) i++;
  const body = b.subarray(i);
  if (body.length > n) throw new Error('integer too long');
  const out = new Uint8Array(n);
  out.set(body, n - body.length);
  return out;
}
