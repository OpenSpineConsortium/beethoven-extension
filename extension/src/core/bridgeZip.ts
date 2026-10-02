// The helper's zip, made out to THIS extension (12.0.0, decision D1).
//
// Chrome starts a native messaging host only for the extensions its manifest names (allowed_origins),
// and the installer inside each bundled zip writes that manifest from the zip's allowed_origins.json.
// The package cannot know its own Chrome Web Store, Edge Add-ons or development identifier when it is
// built, so the zips are built with a placeholder the installers refuse; the page that offers the
// download writes this extension's own identifier (chrome.runtime.id) into a copy of the zip, in
// memory, and offers that copy. Nothing else in the zip changes: every other entry is copied byte for
// byte (its compressed bytes, CRC, sizes and Unix mode), and only allowed_origins.json is replaced, with
// exactly one origin. Nothing is fetched from anywhere but the extension's own package.
//
// A zip this does not understand (zip64, data descriptors, an entry it cannot find) is refused, and the
// page offers the packaged file unchanged: its installer then refuses with its own sentence (fail closed).

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
export const ORIGINS_ENTRY = 'allowed_origins.json';
const ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}\/$/;

let table: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (table = t);
}

/** CRC-32 (the zip and gzip one) */
export function crc32(data: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

interface Entry {
  name: string;
  central: Uint8Array;
  local: Uint8Array;
}

function view(b: Uint8Array): DataView {
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

/** the entries of a plain zip (no zip64, no data descriptors, no multi-disk), each with its central record and its local record and data */
export function readZip(zip: Uint8Array): Entry[] {
  const v = view(zip);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ZipError('no end of central directory');
  const count = v.getUint16(end + 10, true);
  const cdSize = v.getUint32(end + 12, true);
  const cdOff = v.getUint32(end + 16, true);
  if (v.getUint16(end + 4, true) !== 0 || v.getUint16(end + 6, true) !== 0 || v.getUint16(end + 8, true) !== count) throw new ZipError('a multi-disk zip');
  if (count === 0xffff || cdOff === 0xffffffff || cdOff + cdSize > end) throw new ZipError('a zip64 or damaged directory');
  const out: Entry[] = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || v.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError('a damaged central record');
    const flags = v.getUint16(p + 8, true);
    if (flags & 0x0008) throw new ZipError('a data descriptor');
    if (flags & 0x0001) throw new ZipError('an encrypted entry');
    const csize = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const localOff = v.getUint32(p + 42, true);
    if (csize === 0xffffffff || localOff === 0xffffffff) throw new ZipError('a zip64 entry');
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    const central = zip.subarray(p, p + 46 + nameLen + extraLen + commentLen);
    if (localOff + 30 > cdOff || v.getUint32(localOff, true) !== SIG_LOCAL) throw new ZipError('a damaged local record');
    const lNameLen = v.getUint16(localOff + 26, true);
    const lExtraLen = v.getUint16(localOff + 28, true);
    const dataEnd = localOff + 30 + lNameLen + lExtraLen + csize;
    if (dataEnd > cdOff) throw new ZipError('an entry past the directory');
    out.push({ name, central, local: zip.subarray(localOff, dataEnd) });
    p += central.length;
  }
  return out;
}

/** the stored (uncompressed) bytes of one entry, or undefined when it is not stored */
export function storedEntry(zip: Uint8Array, name: string): Uint8Array | undefined {
  const e = readZip(zip).find((x) => x.name === name);
  if (!e) return undefined;
  const v = view(e.local);
  if (v.getUint16(8, true) !== 0) return undefined;
  const n = v.getUint16(26, true);
  const x = v.getUint16(28, true);
  return e.local.subarray(30 + n + x);
}

/** allowed_origins.json for one extension: the same text the build writes (a JSON array and a newline) */
export function originsJson(origin: string): Uint8Array {
  if (!ORIGIN_RE.test(origin)) throw new ZipError('not a Chrome extension origin');
  return new TextEncoder().encode(JSON.stringify([origin]) + '\n');
}

/** "chrome-extension://<id>/" for an extension identifier (32 letters a-p), or undefined */
export function originOf(id: string | undefined): string | undefined {
  return id && /^[a-p]{32}$/.test(id) ? `chrome-extension://${id}/` : undefined;
}

/**
 * A copy of the helper's zip whose allowed_origins.json names exactly `origin`. Every other entry is
 * copied byte for byte; the new entry is stored, keeps its central record's Unix mode and DOS time.
 * Throws a ZipError when the zip has no such entry or is not a plain zip.
 */
export function withAllowedOrigins(zip: Uint8Array, origin: string): Uint8Array {
  const data = originsJson(origin);
  const entries = readZip(zip);
  if (!entries.some((e) => e.name === ORIGINS_ENTRY)) throw new ZipError(`no ${ORIGINS_ENTRY} in the zip`);
  const crc = crc32(data);
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    let local: Uint8Array;
    const central = e.central.slice();
    const cv = view(central);
    if (e.name === ORIGINS_ENTRY) {
      const lv = view(e.local);
      const nameLen = lv.getUint16(26, true);
      const head = e.local.slice(0, 30 + nameLen);
      const hv = view(head);
      hv.setUint16(6, 0, true); // flags
      hv.setUint16(8, 0, true); // stored
      hv.setUint32(14, crc, true);
      hv.setUint32(18, data.length, true);
      hv.setUint32(22, data.length, true);
      hv.setUint16(28, 0, true); // no extra field
      local = new Uint8Array(head.length + data.length);
      local.set(head, 0);
      local.set(data, head.length);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
    } else {
      local = e.local;
    }
    cv.setUint32(42, offset, true);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = view(end);
  ev.setUint32(0, SIG_END, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const b of [...locals, ...centrals, end]) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}
