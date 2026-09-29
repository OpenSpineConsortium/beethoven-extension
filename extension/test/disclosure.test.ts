// The data statement: kept per workspace on the text version it was made on, shown again when the
// text or the workspace changes, and the consent marker's exact content.
import { describe, expect, it } from 'vitest';
import { ackCovers, ackSubject, consentFileContent, DATA_CLASSIFICATION_STATEMENT, makeAcknowledgement, REMOTE_CONTROL_SENTENCE, STATEMENT_TEXT, STATEMENT_VERSION, statementFor, type Statements } from '../src/core/disclosure';
import { paths } from '../src/core/contract';

describe('the data statement', () => {
  it('carries the Remote Control sentence and is versioned as an integer', () => {
    expect(STATEMENT_TEXT).toBe(`${DATA_CLASSIFICATION_STATEMENT} ${REMOTE_CONTROL_SENTENCE}`);
    expect(REMOTE_CONTROL_SENTENCE).toBe("Claude Code's Remote Control will be enabled for this worker; this answers Claude Code's one-time question for you.");
    expect(Number.isInteger(STATEMENT_VERSION)).toBe(true);
    expect(STATEMENT_VERSION).toBe(2);
  });

  it('is kept per workspace and covers only the text in force', () => {
    const a = makeAcknowledgement('worker', '2026-09-29T10:00:00Z');
    expect(a).toMatchObject({ v: 2, work_dir: 'workspaces/worker', text_version: STATEMENT_VERSION, statement: STATEMENT_TEXT, acknowledged_at: '2026-09-29T10:00:00Z' });
    const all: Statements = { [a.work_dir]: a };
    expect(statementFor(all, 'worker')).toEqual(a);
    expect(statementFor(all, 'thesis')).toBeUndefined();
    expect(statementFor(undefined, 'worker')).toBeUndefined();
    // the text changed: shown again
    expect(ackCovers({ ...a, text_version: STATEMENT_VERSION - 1 }, ackSubject('worker'))).toBe(false);
    expect(ackCovers({ ...a, statement: 'an older sentence' }, ackSubject('worker'))).toBe(false);
    // the old session-only record shape is not a statement
    expect(ackCovers({ v: 1, work_dir: 'workspaces/worker', disclosure_at: 'x', classification_at: 'x', statement: DATA_CLASSIFICATION_STATEMENT } as unknown as Statements[string], 'workspaces/worker')).toBe(false);
  });

  it('writes the consent marker as "yes <iso> <install id>" at ~/.hpcworker/consent', () => {
    expect(consentFileContent('2026-09-29T10:00:00.000Z', 'a1b2c3')).toBe('yes 2026-09-29T10:00:00.000Z a1b2c3\n');
    expect(paths.consent('/home/ab1234')).toBe('/home/ab1234/.hpcworker/consent');
  });
});
