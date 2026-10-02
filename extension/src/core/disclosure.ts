// What the student is told about their data before a worker starts, and the statement they make
// about it once per workspace (moment 6, "Where your work goes"). It is separate from the agreement:
// LICENSE 5(e) requires the retention, no-BAA and FERPA sentences before the first worker starts, in
// short form with the full text one tap away ("More about your data ›", PLAN_CLASS_DISCLOSURE), and a
// one-line reminder beside Connect each time one starts.
//
// 11.0.0 (Acknowledgement v3): the statement is the tick and the four lines shown, made with the button
// "Connect"; the Remote Control answer it carries is written into the student's account by the lab's
// tool in the same command that starts the worker (`hpcworker connect --consent <install id>`), never
// through the Files app. consent_recorded_at is set when that command prints `HPCW-STEP consent`. The
// acknowledgement is kept in storage.local per workspace with the version of the text it was made on, so
// it is asked again only when the text or the workspace changes.
import { STATEMENTS_KEY } from './keys';

export { STATEMENTS_KEY };

/** Bump when the statement below changes in substance; every workspace is asked again. Integer. */
export const STATEMENT_VERSION = 3;

/** the four lines shown above the tick, verbatim (moment 6) */
export const SHORT_STATEMENT: readonly string[] = [
  'Claude sees the files your worker reads and what its commands print.',
  'Anthropic keeps the chat under your plan: 30 days, or 5 years if you allow training.',
  'No business associate agreement (HIPAA) covers a personal plan.',
  "It uses your Claude plan's limits.",
];

/** the tick, verbatim: the data statement and the Remote Control answer in one sentence */
export const STATEMENT_TICK = "I'll keep FERPA, IRB, health and export-controlled data out of my worker, and turn on Remote Control for it.";

/** the button the statement is made with */
export const STATEMENT_BUTTON = 'Connect';

/** the seven full sentences under "More about your data ›" */
export const PLAN_CLASS_DISCLOSURE: string[] = [
  "Files the worker reads and every command's output are sent to Anthropic.",
  "While you are connected through claude.ai or the Claude app, the transcript is also stored on Anthropic's servers.",
  'On a personal plan the transcript is retained five years if model training is on and 30 days otherwise.',
  'No Business Associate Agreement covers a personal plan.',
  'FERPA records, IRB data and export-controlled technical data must not be in the working directory.',
  "Remote Control usage draws from your plan's shared limit: a long cluster run reduces what you have left for chat.",
  'The worker runs in supervised mode by default: every command waits for your approval in claude.ai or the Claude app.',
];

/** what an acknowledgement is about: the named worker's workspace, <state_dir>/workspaces/<name> on the cluster */
export const ackSubject = (workerName: string): string => `workspaces/${workerName}`;

export interface Acknowledgement {
  v: 3;
  /** the workspace the statement was made about: ackSubject(worker name) */
  work_dir: string;
  /** STATEMENT_VERSION at the time */
  text_version: number;
  /** what was shown: the tick and the four lines, verbatim */
  statement: { tick: string; lines: string[] };
  /** the label of the button the statement was made with */
  button_label: string;
  acknowledged_at: string;
  /** when `hpcworker connect` printed `HPCW-STEP consent` for this workspace: the Remote Control answer is on record in the account */
  consent_recorded_at?: string;
}

/** every workspace's acknowledgement, by subject; an older version's entry stays until replaced, out of force */
export type Statements = Record<string, Acknowledgement | { v: number } | undefined>;

/** true only for the text in force, about this workspace */
export function ackCovers(ack: unknown, workDir: string): ack is Acknowledgement {
  const a = ack as Acknowledgement | undefined;
  if (!a || typeof a !== 'object' || a.v !== 3 || a.work_dir !== workDir || a.text_version !== STATEMENT_VERSION || !a.acknowledged_at) return false;
  const s = a.statement;
  return !!s && s.tick === STATEMENT_TICK && Array.isArray(s.lines) && s.lines.length === SHORT_STATEMENT.length && s.lines.every((l, i) => l === SHORT_STATEMENT[i]);
}

export function statementFor(all: Statements | undefined, workerName: string): Acknowledgement | undefined {
  const a = all?.[ackSubject(workerName)];
  return ackCovers(a, ackSubject(workerName)) ? a : undefined;
}

/**
 * The acknowledgement for a press of Connect that made the statement. `shown` is what the page says it
 * showed; the record keeps those words, and covers the workspace only when they are the text in force.
 */
export function makeAcknowledgement(workerName: string, at = new Date().toISOString(), shown: { tick: string; lines: readonly string[]; buttonLabel: string } = { tick: STATEMENT_TICK, lines: SHORT_STATEMENT, buttonLabel: STATEMENT_BUTTON }): Acknowledgement {
  return { v: 3, work_dir: ackSubject(workerName), text_version: STATEMENT_VERSION, statement: { tick: shown.tick, lines: [...shown.lines] }, button_label: shown.buttonLabel, acknowledged_at: at };
}

/** the same acknowledgement once `HPCW-STEP consent` was seen */
export function withConsentRecorded(a: Acknowledgement, at = new Date().toISOString()): Acknowledgement {
  return { ...a, consent_recorded_at: at };
}
