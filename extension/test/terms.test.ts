// The terms constants against something outside the code: the first line of the LICENSE.txt at the
// repository root (the canonical text), the copy the extension ships, and the sentence the signing
// dialog records. A mismatch here is the defect that shipped once: an acceptance recorded as
// "version 1" beside a text headed "Version 2".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AFFIRMATIONS, recordInForce, TERMS_DATE, TERMS_VERSION } from '../src/core/terms';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the terms version', () => {
  it('is an integer that names the LICENSE.txt line at the repository root, with its date', () => {
    expect(Number.isInteger(TERMS_VERSION)).toBe(true);
    const head = /^Version (\d+), (\d{4}-\d{2}-\d{2})\./m.exec(read('../../LICENSE.txt'));
    expect(head, 'LICENSE.txt carries a "Version N, yyyy-mm-dd." line').toBeTruthy();
    expect(Number(head![1])).toBe(TERMS_VERSION);
    expect(head![2]).toBe(TERMS_DATE);
  });

  it('ships the root texts byte for byte (scripts/sync-profiles.mjs copies them before every build)', () => {
    expect(read('../public/LICENSE.txt')).toBe(read('../../LICENSE.txt'));
    expect(read('../public/PRIVACY.md')).toBe(read('../../PRIVACY.md'));
  });

  it('names the version and date in the sentence the student ticks, and keeps no acceptance of an earlier version in force', () => {
    const agree = AFFIRMATIONS.find((a) => a.id === 'read_agree')!;
    expect(agree.label).toContain(`(version ${TERMS_VERSION}, ${TERMS_DATE})`);
    const record = { v: 1, terms_version: TERMS_VERSION, edition: 'trial', signed_name: 'A. Student' };
    expect(recordInForce(record)).toBe(true);
    expect(recordInForce({ ...record, terms_version: TERMS_VERSION - 1 })).toBe(false);
  });
});
