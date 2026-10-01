// The terms constants against something outside the code: the first line of the LICENSE.txt at the
// repository root (the canonical text), the copy the extension ships, and the sentence the signing
// dialog records. A mismatch here is the defect that shipped once: an acceptance recorded as
// "version 1" beside a text headed "Version 2".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acceptanceComplete, AFFIRMATIONS, END_SLACK_PX, laidOut, measureReading, NOT_READ, openedInTab, readingHint, readingRecord, recordInForce, TERMS_DATE, TERMS_VERSION, textRead, type BoxGeometry, type TermsRecord } from '../src/core/terms';

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

// The reading gate of the signing dialog (9.0.0 measured the box before it was on the page, found
// scrollHeight 0, called the text read and enabled the button with the text unread at the top).
describe('the reading gate', () => {
  /** the box as 9.0.0 measured it: built, not yet on the page */
  const DETACHED: BoxGeometry = { scrollTop: 0, clientHeight: 0, scrollHeight: 0 };
  /** the box on the page: 46vh tall, the agreement and the privacy statement far longer */
  const AT_TOP: BoxGeometry = { scrollTop: 0, clientHeight: 420, scrollHeight: 61_000 };
  const HALFWAY: BoxGeometry = { scrollTop: 30_000, clientHeight: 420, scrollHeight: 61_000 };
  const AT_END: BoxGeometry = { scrollTop: 60_580, clientHeight: 420, scrollHeight: 61_000 };
  const SHORT: BoxGeometry = { scrollTop: 0, clientHeight: 420, scrollHeight: 400 };

  it('a box not yet on the page proves nothing: the gate stays shut', () => {
    expect(laidOut(DETACHED)).toBe(false);
    const s = measureReading(NOT_READ, DETACHED);
    expect(textRead(s)).toBe(false);
    expect(s).toEqual(NOT_READ);
    expect(readingHint(s)).toBe('Scroll the text above to its end to continue, or open it in tabs.');
  });

  it('the text at the top or halfway is not read; at its end it is, within the slack', () => {
    expect(textRead(measureReading(NOT_READ, AT_TOP))).toBe(false);
    expect(textRead(measureReading(NOT_READ, HALFWAY))).toBe(false);
    const end = measureReading(NOT_READ, AT_END);
    expect(end).toEqual({ scrolledToEnd: true, fits: false, openedInTab: false });
    expect(readingHint(end)).toBe('You have reached the end of the text.');
    expect(textRead(measureReading(NOT_READ, { ...AT_END, scrollTop: AT_END.scrollTop - END_SLACK_PX }))).toBe(true);
    expect(textRead(measureReading(NOT_READ, { ...AT_END, scrollTop: AT_END.scrollTop - END_SLACK_PX - 1 }))).toBe(false);
  });

  it('a text that fits its laid-out box needs no scrolling, and says so', () => {
    const s = measureReading(NOT_READ, SHORT);
    expect(s).toEqual({ scrolledToEnd: false, fits: true, openedInTab: false });
    expect(textRead(s)).toBe(true);
    expect(readingHint(s)).toMatch(/whole text was in view/);
  });

  it('opening both texts in tabs counts, and the hint says that is what happened', () => {
    const s = openedInTab(measureReading(NOT_READ, AT_TOP));
    expect(textRead(s)).toBe(true);
    expect(readingHint(s)).toBe('You opened the agreement and the privacy statement in tabs, which counts as reading them.');
  });

  it('what is done stays done: the box leaving the page or scrolling back up does not undo it', () => {
    const end = measureReading(NOT_READ, AT_END);
    expect(measureReading(end, DETACHED)).toEqual(end);
    expect(measureReading(end, AT_TOP)).toEqual(end);
    expect(textRead(measureReading(openedInTab(NOT_READ), DETACHED))).toBe(true);
  });

  it('the record says what happened: scrolled_to_end only for the end reached or a text that fitted, opened_in_tab apart', () => {
    expect(readingRecord(NOT_READ)).toEqual({ scrolled_to_end: false, opened_in_tab: false });
    expect(readingRecord(measureReading(NOT_READ, AT_END))).toEqual({ scrolled_to_end: true, opened_in_tab: false });
    expect(readingRecord(measureReading(NOT_READ, SHORT))).toEqual({ scrolled_to_end: true, opened_in_tab: false });
    expect(readingRecord(openedInTab(NOT_READ))).toEqual({ scrolled_to_end: false, opened_in_tab: true });
    expect(readingRecord(openedInTab(measureReading(NOT_READ, AT_END)))).toEqual({ scrolled_to_end: true, opened_in_tab: true });
  });

  it('the agreement is not complete until the text is read, whatever else is done', () => {
    const all = AFFIRMATIONS.map((a) => ({ ...a, checked: true }));
    expect(acceptanceComplete(all, 'A. Student', textRead(measureReading(NOT_READ, DETACHED)))).toEqual({ ok: false, missing: ['text_read'] });
    expect(acceptanceComplete(all, 'A. Student', textRead(measureReading(NOT_READ, AT_END))).ok).toBe(true);
    expect(acceptanceComplete(all, 'A. Student', textRead(openedInTab(NOT_READ))).ok).toBe(true);
  });

  it('keeps a record written by 9.0.0 in force (scrolled_to_end true, no opened_in_tab) and one written now', () => {
    const v9: TermsRecord = {
      v: 1,
      terms_version: TERMS_VERSION,
      edition: 'trial',
      license_sha256: 'a'.repeat(64),
      privacy_sha256: 'b'.repeat(64),
      accepted_at: '2026-09-30T20:00:00.000Z',
      surface: 'extension',
      button_label: 'Accept and Continue',
      affirmations: AFFIRMATIONS.map((a) => ({ ...a, checked: true })),
      signed_name: 'A. Student',
      scrolled_to_end: true,
      product_version: '9.0.0',
      host: 'Chrome 148',
      install_id: '0123456789abcdef0123456789abcdef',
    };
    expect('opened_in_tab' in v9).toBe(false);
    expect(recordInForce(v9)).toBe(true);
    expect(recordInForce(JSON.parse(JSON.stringify(v9)))).toBe(true);
    expect(recordInForce({ ...v9, product_version: '10.0.0', ...readingRecord(openedInTab(NOT_READ)) })).toBe(true);
  });
});
