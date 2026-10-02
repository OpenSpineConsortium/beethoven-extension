// The agreement of 11.0.0 against something outside the code: the first line of the LICENSE.txt at the
// repository root (the canonical text) and the copy the extension ships; and the record (TermsRecord
// v2) against what the welcome page shows: one tick (Decision 1's shipping variant), the counsel
// variant ready as one constant, "Show terms" optional and recorded truthfully, no typed name, no
// scrolling gate. A version 1 record (8.0.0 to 10.0.0) is kept and out of force: everyone accepts once
// more. A mismatch between the constants and the text is the defect that shipped once: an acceptance
// recorded as "version 1" beside a text headed "Version 2".
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acceptanceComplete, AFFIRMATION, AFFIRMATIONS_TWO, AGREE_BUTTON, bindAccount, buildTermsRecord, endReached, END_SLACK_PX, openedSentence, recordInForce, recordText, withHistory, sha256, SUMMARY, TERMS_DATE, TERMS_REFUSAL, TERMS_VERSION, tickLabel, ticks, TWO_TICKS, type TermsRecord, type TermsRecordV1 } from '../src/core/terms';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('the terms version', () => {
  it('is 9, dated 2026-10-02 (12.0.0: the direct way, LICENSE version 9, PRIVACY version 10)', () => {
    expect(TERMS_VERSION).toBe(9);
    expect(TERMS_DATE).toBe('2026-10-02');
  });

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
});

describe('what the welcome page shows', () => {
  it('the four summary lines, verbatim', () => {
    expect(SUMMARY).toEqual([
      "Free while you're approved. Licensed to you, not sold.",
      'To check your approval, it sends the lab your AccessID and an ID for this browser.',
      'The grid, Anthropic or the browser store can stop it working at any time. You accept that risk.',
      'Disputes: written notice first, then one person at a time in Michigan courts, with no jury.',
    ]);
  });

  it('one tick (Greg\'s decision), its sentence naming the waivers and the risks; the button says Agree', () => {
    expect(TWO_TICKS).toBe(false);
    expect(ticks()).toEqual([AFFIRMATION]);
    expect(AFFIRMATION).toEqual({ id: 'agree', bold: "I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or older.", soft: 'That includes giving up a jury trial and class actions, and accepting the risks above.' });
    expect(tickLabel(AFFIRMATION)).toBe("I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or older. That includes giving up a jury trial and class actions, and accepting the risks above.");
    expect(AGREE_BUTTON).toBe('Agree and continue');
  });

  it('the two-tick variant for counsel is ready: the agree box alone, and a second, separate box', () => {
    expect(AFFIRMATIONS_TWO).toEqual([
      { id: 'agree', bold: "I've read and agree to the Beethoven terms and privacy statement, and I'm 18 or older." },
      { id: 'specific', bold: 'I specifically accept the dispute terms (no jury trial, no class actions) and the known risks (sections 8, 19 and 20).' },
    ]);
  });

  it('is complete with the tick alone: no name, no reading gate', () => {
    expect(acceptanceComplete([{ id: 'agree', checked: true }])).toEqual({ ok: true, missing: [] });
    expect(acceptanceComplete([{ id: 'agree', checked: false }])).toEqual({ ok: false, missing: ['agree'] });
    expect(acceptanceComplete([])).toEqual({ ok: false, missing: ['agree'] });
  });

  it('the refusal wherever the terms are not accepted', () => {
    expect(TERMS_REFUSAL).toBe("The Beethoven terms haven't been accepted in this browser yet. Open Beethoven's welcome page to accept them.");
  });
});

describe('the record (TermsRecord v2)', () => {
  const input = { license: 'Version 8, 2026-10-01.\r\nThe text.', privacy: 'Version 9, 2026-10-01.\nThe statement.', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: true, printed: false, productVersion: '11.0.0', host: 'Chrome 153', installId: '0123456789abcdef0123456789abcdef', at: '2026-10-01T12:00:00.000Z' };

  it('says what was shown, what was ticked, whether the full text was opened, and from which installation', async () => {
    const r = await buildTermsRecord(input);
    expect(r).toMatchObject({ v: 2, terms_version: 9, terms_date: '2026-10-02', edition: 'trial', summary_lines: [...SUMMARY], button_label: 'Agree and continue', surface: 'welcome', terms_opened: false, terms_end_reached: false, opened_in_tab: false, saved_copy: true, printed: false, accepted_at: '2026-10-01T12:00:00.000Z', product_version: '11.0.0', host: 'Chrome 153', install_id: input.installId });
    expect(r.affirmations).toEqual([{ id: 'agree', label: tickLabel(AFFIRMATION), checked: true }]);
    expect(r.license_sha256).toBe(await sha256(input.license));
    // CRLF and LF hash alike: the text, not its line endings
    expect(r.license_sha256).toBe(await sha256('Version 8, 2026-10-01.\nThe text.'));
    expect(r.summary_sha256).toBe(await sha256(SUMMARY.join('\n')));
    expect(r.terms_opened_at).toBeUndefined();
    expect(r.bound_account).toBeUndefined();
    expect(recordInForce(r)).toBe(true);
    expect(openedSentence(r)).toBe('The full text was not opened before Agree.');
    const opened = await buildTermsRecord({ ...input, termsOpenedAt: '2026-10-01T11:59:00.000Z', termsEndReached: true });
    expect(opened).toMatchObject({ terms_opened: true, terms_opened_at: '2026-10-01T11:59:00.000Z', terms_end_reached: true });
    expect(openedSentence(opened)).toBe('The full text was opened before Agree.');
  });

  it('is in force only as v2 for version 9 with the box ticked; a v1 record and a version 8 record are kept, out of force', async () => {
    const r = await buildTermsRecord(input);
    expect(r.terms_version).toBe(9);
    expect(recordInForce({ ...r, terms_version: 8 })).toBe(false);
    expect(recordInForce({ ...r, terms_version: 7 })).toBe(false);
    expect(recordInForce({ ...r, affirmations: [{ ...r.affirmations[0]!, checked: false }] })).toBe(false);
    expect(recordInForce(await buildTermsRecord({ ...input, checked: {} }))).toBe(false);
    const v1: TermsRecordV1 = { v: 1, terms_version: 9, edition: 'trial', license_sha256: 'a', privacy_sha256: 'b', accepted_at: 'x', surface: 'extension', button_label: 'Accept and Continue', affirmations: [], signed_name: 'A. Student', scrolled_to_end: true, product_version: '10.0.0', host: 'Chrome', install_id: 'x' };
    expect(recordInForce(v1)).toBe(false);
    expect(recordInForce({ ...v1, terms_version: 7 })).toBe(false);
    // a v1 record with its box ticked and this version's number is still out of force: only a v2 record counts
    expect(recordInForce({ ...v1, edition: 'trial', affirmations: [{ id: 'agree', label: 'x', checked: true }], accepted_at: '2026-10-01T00:00:00Z' })).toBe(false);
    expect(recordInForce(undefined)).toBe(false);
    expect(recordInForce(JSON.parse(JSON.stringify(r)))).toBe(true);
  });

  it('keeps the records it replaces (10.0.0\'s v1 included), and gives the person their record as text with the install id', async () => {
    const r = await buildTermsRecord(input);
    const v1 = { v: 1, terms_version: 7, signed_name: 'A. Student' };
    expect(withHistory(undefined, v1)).toEqual([v1]);
    expect(withHistory([v1], v1)).toEqual([v1]);
    expect(withHistory([v1], undefined)).toEqual([v1]);
    expect(withHistory(Array.from({ length: 12 }, (_, i) => ({ i })), v1)).toHaveLength(10);
    const text = recordText(bindAccount(r, 'st1234', '2026-10-01T09:00:00Z'));
    expect(text).toContain(`Installation ID: ${r.install_id}`);
    expect(text).toContain('Account: st1234 (shown by your portal at 2026-10-01T09:00:00Z, after the acceptance)');
    expect(text).toContain('The full text was not opened before Agree.');
    expect(text).toContain(`Ticked: yes: "${r.affirmations[0]!.label}"`);
    expect(text).toContain('"v": 2');
  });

  it('gains the account the grid showed, once, afterwards, and says so', async () => {
    const r = await buildTermsRecord(input);
    const bound: TermsRecord = bindAccount(r, 'st1234', '2026-10-01T12:05:00.000Z');
    expect(bound).toMatchObject({ bound_account: 'st1234', bound_account_seen_at: '2026-10-01T12:05:00.000Z' });
    expect(bindAccount(bound, 'zz9999')).toBe(bound);
    expect(recordInForce(bound)).toBe(true);
  });

  it('the one measure left of the reading gate sets terms_end_reached and gates nothing', () => {
    expect(endReached({ scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false);
    expect(endReached({ scrollTop: 0, clientHeight: 360, scrollHeight: 61_000 })).toBe(false);
    expect(endReached({ scrollTop: 60_640, clientHeight: 360, scrollHeight: 61_000 })).toBe(true);
    expect(endReached({ scrollTop: 60_640 - END_SLACK_PX, clientHeight: 360, scrollHeight: 61_000 })).toBe(true);
    expect(endReached({ scrollTop: 60_640 - END_SLACK_PX - 1, clientHeight: 360, scrollHeight: 61_000 })).toBe(false);
    expect(endReached({ scrollTop: 0, clientHeight: 360, scrollHeight: 300 })).toBe(true);
  });
});
