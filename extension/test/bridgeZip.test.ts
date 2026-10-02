// The helper's zip made out to this extension (src/core/bridgeZip.ts): every entry but allowed_origins.json
// is the packaged one byte for byte, allowed_origins.json names exactly the one origin, and the result is
// a zip every reader takes (each entry's CRC checks, the Unix modes stay).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, originOf, readZip, storedEntry, withAllowedOrigins, ZipError } from '../src/core/bridgeZip';

const BRIDGE = path.join(__dirname, '..', 'public', 'bridge');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${ID}/`;

/** each entry's name, mode and uncompressed bytes, checked against its CRC */
function contents(zip: Uint8Array): Map<string, { mode: number; data: Buffer }> {
  const out = new Map<string, { mode: number; data: Buffer }>();
  for (const e of readZip(zip)) {
    const cv = new DataView(e.central.buffer, e.central.byteOffset, e.central.byteLength);
    const lv = new DataView(e.local.buffer, e.local.byteOffset, e.local.byteLength);
    const method = lv.getUint16(8, true);
    const crc = cv.getUint32(16, true);
    const usize = cv.getUint32(24, true);
    const body = Buffer.from(e.local.subarray(30 + lv.getUint16(26, true) + lv.getUint16(28, true)));
    const data = method === 0 ? body : zlib.inflateRawSync(body);
    expect(data.length, e.name).toBe(usize);
    expect(crc32(data), e.name).toBe(crc);
    expect(zlib.crc32(data) >>> 0, e.name).toBe(crc);
    out.set(e.name, { mode: (cv.getUint32(38, true) >>> 16) & 0o777, data });
  }
  return out;
}

describe('the helper zip, made out to this extension', () => {
  const zips = fs.readdirSync(BRIDGE).filter((f) => f.endsWith('.zip'));

  it('ships three zips, each carrying the placeholder the installers refuse', () => {
    expect(zips.sort()).toEqual(['beethoven-bridge-linux.zip', 'beethoven-bridge-mac.zip', 'beethoven-bridge-windows.zip']);
    for (const z of zips) {
      const c = contents(new Uint8Array(fs.readFileSync(path.join(BRIDGE, z))));
      expect(c.get('allowed_origins.json')?.data.toString('utf8'), z).toMatch(/REPLACE_WITH_EXTENSION_ID/);
    }
  });

  for (const z of ['beethoven-bridge-windows.zip', 'beethoven-bridge-mac.zip', 'beethoven-bridge-linux.zip']) {
    it(`${z}: only allowed_origins.json changes, to exactly this extension`, () => {
      const src = new Uint8Array(fs.readFileSync(path.join(BRIDGE, z)));
      const out = withAllowedOrigins(src, ORIGIN);
      const a = contents(src);
      const b = contents(out);
      expect([...b.keys()]).toEqual([...a.keys()]);
      for (const [name, e] of a) {
        expect(b.get(name)!.mode, name).toBe(e.mode);
        if (name === 'allowed_origins.json') {
          expect(b.get(name)!.data.toString('utf8')).toBe(`["${ORIGIN}"]\n`);
          expect(JSON.parse(b.get(name)!.data.toString('utf8'))).toEqual([ORIGIN]);
        } else {
          expect(b.get(name)!.data.equals(e.data), name).toBe(true);
        }
      }
      // the executable bits that macOS and Linux need survive
      if (z.includes('mac')) expect(b.get('install.command')!.mode).toBe(0o755);
      if (z.includes('linux')) expect(b.get('install.sh')!.mode).toBe(0o755);
      expect(storedEntry(out, 'allowed_origins.json') && Buffer.from(storedEntry(out, 'allowed_origins.json')!).toString('utf8')).toBe(`["${ORIGIN}"]\n`);
      // made twice, the same bytes (the copy is reproducible)
      expect(Buffer.from(withAllowedOrigins(src, ORIGIN)).equals(Buffer.from(out))).toBe(true);
      // and again from the made copy, for another extension
      const again = contents(withAllowedOrigins(out, 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/'));
      expect(again.get('allowed_origins.json')!.data.toString('utf8')).toBe('["chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba/"]\n');
    });
  }

  it('refuses anything but one Chrome extension origin, and a zip it does not understand', () => {
    const src = new Uint8Array(fs.readFileSync(path.join(BRIDGE, zips[0]!)));
    for (const bad of ['chrome-extension://short/', `chrome-extension://${ID}`, `https://${ID}/`, `chrome-extension://${ID.toUpperCase()}/`, `chrome-extension://${ID}/"]`, '*']) {
      expect(() => withAllowedOrigins(src, bad), bad).toThrow(ZipError);
    }
    expect(() => withAllowedOrigins(new Uint8Array(100), ORIGIN)).toThrow(ZipError);
    expect(() => withAllowedOrigins(src.subarray(0, src.length - 30), ORIGIN)).toThrow(ZipError);
    expect(originOf(ID)).toBe(ORIGIN);
    expect(originOf('nope')).toBeUndefined();
    expect(originOf(undefined)).toBeUndefined();
  });
});
