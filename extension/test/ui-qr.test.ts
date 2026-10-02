// The QR encoder (src/vendor/qrcodegen.ts, a compact port of Project Nayuki's library) against
// symbols made by the original library itself: byte mode, error correction M, no boosting. The
// three cover a version without alignment patterns (1), the claude.ai link the panel shows (5), and a
// version that carries version information (8, mask forced to 5). Each row is hex, padded right.
// Checked once more by hand on 2026-10-01: 450 symbols identical to the original, versions 1 to 40,
// every mask; OpenCV decoded 19 of 19 back to their text.
import { describe, expect, it } from 'vitest';
import { encodeText } from '../src/vendor/qrcodegen';

const VECTORS: Array<{ text: string; mask: number; version: number; chosenMask: number; size: number; rows: string[] }> = [
 {
  "text": "Hello, world!",
  "mask": -1,
  "version": 1,
  "chosenMask": 2,
  "size": 21,
  "rows": [
   "fe0bf8",
   "825208",
   "babae8",
   "ba82e8",
   "bacae8",
   "82f208",
   "feabf8",
   "00a000",
   "be73e0",
   "198ce8",
   "12ee70",
   "653d60",
   "de8b08",
   "0087c0",
   "fe6f30",
   "82ad70",
   "bade98",
   "baa1c0",
   "bafb20",
   "822ce0",
   "fed290"
  ]
 },
 {
  "text": "https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt",
  "mask": -1,
  "version": 5,
  "chosenMask": 6,
  "size": 37,
  "rows": [
   "fef3f1c3f8",
   "82a70e6a08",
   "ba9b2eeae8",
   "ba5974cae8",
   "ba9ad22ae8",
   "8224e56a08",
   "feaaaaabf8",
   "0020047800",
   "9f97aca4b8",
   "f0da4a64d0",
   "733e42b6e8",
   "b92d4231b8",
   "13cc18bb08",
   "3cdce130c8",
   "22b95e50f8",
   "58ace10378",
   "7f5fcc52b8",
   "b56cede320",
   "f26d4f1108",
   "506c02c388",
   "de59403f80",
   "e527b5b0a8",
   "b641631348",
   "953ecf01f0",
   "725be5df10",
   "a4c6d86c80",
   "cbf4db9ad8",
   "98592b0ef0",
   "a3868adfe0",
   "008d9a08a0",
   "fec91faa88",
   "82e3e27888",
   "ba9006bf80",
   "baeaa4de10",
   "ba4b9bc0f8",
   "8228f93ef8",
   "fe89498b08"
  ]
 },
 {
  "text": "https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt&title=Wayne%20State%20grid&from=beethoven-11&padding=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "mask": 5,
  "version": 8,
  "chosenMask": 5,
  "size": 49,
  "rows": [
   "fe074abbbcbf8",
   "82a363ece3a08",
   "bab1db1ec1ae8",
   "bad5af9ffd2e8",
   "ba09fffa842e8",
   "82694e343a208",
   "feaaaaaaaabf8",
   "00f37a2893800",
   "82ca4be70ae70",
   "a9803aee77eb0",
   "2e8300251f4e8",
   "cdca313ec0990",
   "ba33bdaace480",
   "fd3aa3d644350",
   "178884f933838",
   "285f677110aa8",
   "4bb78ac359f20",
   "e14cf7c64d6c0",
   "fb1abcd111768",
   "fc30b43ca07c0",
   "92abab850da30",
   "3924dff7aff30",
   "9fe68be9fefc8",
   "a8ce9e3f99898",
   "3ae576aee9a88",
   "b892d62fcc898",
   "dfa853e242fd8",
   "bc11bb46270e0",
   "afc15b676f198",
   "bc91f1efdc360",
   "33bf99a8483a8",
   "9d8b0e39b34d0",
   "c7804d4359cb8",
   "65861aaeee5e0",
   "237c33dca7a58",
   "9c9e032fe5158",
   "82b2750b8b010",
   "a09691a75d100",
   "47f13099e3208",
   "71a04103b3478",
   "e3008ff10bf98",
   "00b13226cd890",
   "fe58aaa8e6a88",
   "824efa3ee18c0",
   "ba6a5be33afb0",
   "ba62dc076f718",
   "ba4e05887a740",
   "8262c859b2248",
   "fea5520eef588"
  ]
 }
];

const hexRows = (modules: boolean[][]): string[] =>
  modules.map((row) => {
    const bits = row.map((c) => (c ? '1' : '0')).join('').padEnd(Math.ceil(row.length / 4) * 4, '0');
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  });

describe('the QR encoder', () => {
  for (const v of VECTORS) {
    it(`matches the original library for a ${v.text.length}-byte text (version ${v.version}, mask ${v.chosenMask})`, () => {
      const q = encodeText(v.text, v.mask);
      expect(q.version).toBe(v.version);
      expect(q.size).toBe(v.size);
      expect(q.mask).toBe(v.chosenMask);
      expect(hexRows(q.modules)).toEqual(v.rows);
    });
  }

  it('picks the smallest version that holds the text at level M', () => {
    expect(encodeText('x'.repeat(14)).version).toBe(1);
    expect(encodeText('x'.repeat(15)).version).toBe(2);
    expect(encodeText('x'.repeat(62)).version).toBe(4);
    expect(encodeText('x'.repeat(63)).version).toBe(5);
    expect(encodeText('x'.repeat(2331)).version).toBe(40);
    expect(() => encodeText('x'.repeat(2332))).toThrow(RangeError);
  });

  it('draws the three finder patterns', () => {
    const q = encodeText('https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt');
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        expect(q.modules[y0 + y]![x0 + x], `${x0 + x},${y0 + y}`).toBe(d !== 2);
      }
    };
    finder(0, 0);
    finder(q.size - 7, 0);
    finder(0, q.size - 7);
  });
});
