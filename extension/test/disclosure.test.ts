// The data statement (Acknowledgement v3): the four lines and the tick shown before the first worker
// starts, made with the button "Connect", kept per workspace on the text version it was made on, shown
// again when the text or the workspace changes; and the moment the lab's tool says the Remote Control
// answer is on record (HPCW-STEP consent).
import { describe, expect, it } from 'vitest';
import { ackCovers, ackSubject, makeAcknowledgement, PLAN_CLASS_DISCLOSURE, SHORT_STATEMENT, STATEMENT_BUTTON, STATEMENT_TICK, STATEMENT_VERSION, statementFor, withConsentRecorded, type Statements } from '../src/core/disclosure';

describe('the data statement', () => {
  it('is version 3: four lines, one tick naming the data and Remote Control, the button Connect, and the seven sentences in the fold', () => {
    expect(STATEMENT_VERSION).toBe(3);
    expect(Number.isInteger(STATEMENT_VERSION)).toBe(true);
    expect(SHORT_STATEMENT).toEqual(['Claude sees the files your worker reads and what its commands print.', 'Anthropic keeps the chat under your plan: 30 days, or 5 years if you allow training.', 'No business associate agreement (HIPAA) covers a personal plan.', "It uses your Claude plan's limits."]);
    expect(STATEMENT_TICK).toBe("I'll keep FERPA, IRB, health and export-controlled data out of my worker, and turn on Remote Control for it.");
    expect(STATEMENT_BUTTON).toBe('Connect');
    expect(PLAN_CLASS_DISCLOSURE).toHaveLength(7);
  });

  it('records the words shown and the button, per workspace, and covers only the text in force', () => {
    const a = makeAcknowledgement('worker', '2026-10-01T10:00:00Z');
    expect(a).toEqual({ v: 3, work_dir: 'workspaces/worker', text_version: 3, statement: { tick: STATEMENT_TICK, lines: [...SHORT_STATEMENT] }, button_label: 'Connect', acknowledged_at: '2026-10-01T10:00:00Z' });
    const all: Statements = { [a.work_dir]: a };
    expect(statementFor(all, 'worker')).toEqual(a);
    expect(statementFor(all, 'thesis')).toBeUndefined();
    expect(statementFor(undefined, 'worker')).toBeUndefined();
    // the text changed: shown again
    expect(ackCovers({ ...a, text_version: 2 }, ackSubject('worker'))).toBe(false);
    expect(ackCovers({ ...a, statement: { ...a.statement, tick: 'an older sentence' } }, ackSubject('worker'))).toBe(false);
    expect(ackCovers({ ...a, statement: { ...a.statement, lines: a.statement.lines.slice(1) } }, ackSubject('worker'))).toBe(false);
    // what a page says it showed is recorded; when it is not the text in force, it covers nothing
    const other = makeAcknowledgement('worker', '2026-10-01T10:00:00Z', { tick: 'something else', lines: ['x'], buttonLabel: 'Connect' });
    expect(other.statement).toEqual({ tick: 'something else', lines: ['x'] });
    expect(ackCovers(other, ackSubject('worker'))).toBe(false);
    // 10.0.0's v2 entry (the Files-written marker era) is kept and out of force
    const v2 = { v: 2, work_dir: 'workspaces/worker', text_version: 2, statement: 'old', acknowledged_at: 'x', consent_written_at: 'y' };
    expect(statementFor({ 'workspaces/worker': v2 }, 'worker')).toBeUndefined();
  });

  it('notes when the lab\'s tool recorded the Remote Control answer (HPCW-STEP consent)', () => {
    const a = withConsentRecorded(makeAcknowledgement('worker', '2026-10-01T10:00:00Z'), '2026-10-01T10:00:05Z');
    expect(a.consent_recorded_at).toBe('2026-10-01T10:00:05Z');
    expect(ackCovers(a, ackSubject('worker'))).toBe(true);
  });
});
