// What the student is told, in the report's words, before a worker starts, and must acknowledge
// once per workspace: the plan-class disclosure (where the transcript goes) and the data statement
// (what must not be in the working directory, and that Remote Control will be enabled). The
// acknowledgement is kept in storage.local per workspace name with the version of the text it was
// made on, so it is shown again only when the text changes or the workspace changes. On
// acknowledgement the extension writes ~/.hpcworker/consent on the cluster, the framework's
// fallback marker, which answers Claude Code's one-time "Enable Remote Control?" for the student's
// worker. The worker is refused a start without the acknowledgement, and in a workspace the
// student has marked restricted.
import { STATEMENTS_KEY } from './keys';

export { STATEMENTS_KEY };

/** Bump when the statement text below changes in substance; every workspace is asked again. Integer. */
export const STATEMENT_VERSION = 2;

export const PLAN_CLASS_DISCLOSURE: string[] = [
  'Files the worker reads and every command\'s output are sent to Anthropic.',
  'While you are connected through claude.ai or the Claude app, the transcript is also stored on Anthropic\'s servers.',
  'On a personal plan the transcript is retained five years if model training is on and 30 days otherwise.',
  'No Business Associate Agreement covers a personal plan.',
  'FERPA records, IRB data and export-controlled technical data must not be in the working directory.',
  'Remote Control usage draws from your plan\'s shared limit: a long cluster run reduces what you have left for chat.',
  'The worker runs in supervised mode by default: every command waits for your approval in claude.ai or the Claude app.',
];

export const DATA_CLASSIFICATION_STATEMENT =
  "The worker's working directory on the cluster (its workspace, named below) holds none of the following and I will put none of it there: student education records (FERPA), data under an IRB protocol, protected health information, export-controlled technical data (EAR or ITAR), or data my university classifies as restricted.";

export const REMOTE_CONTROL_SENTENCE = "Claude Code's Remote Control will be enabled for this worker; this answers Claude Code's one-time question for you.";

/** the exact text the box is ticked against: the classification statement and the Remote Control sentence */
export const STATEMENT_TEXT = `${DATA_CLASSIFICATION_STATEMENT} ${REMOTE_CONTROL_SENTENCE}`;

/** what an acknowledgement is about: the named worker's workspace, <state_dir>/workspaces/<name> on the cluster */
export const ackSubject = (workerName: string): string => `workspaces/${workerName}`;

export interface Acknowledgement {
  v: 2;
  /** the workspace the statement was made about: ackSubject(worker name) */
  work_dir: string;
  /** STATEMENT_VERSION at the time */
  text_version: number;
  /** the exact text acknowledged */
  statement: string;
  acknowledged_at: string;
  /** when ~/.hpcworker/consent was written through the Files app; absent when that write is still owed */
  consent_written_at?: string;
}

/** every workspace's acknowledgement, by subject */
export type Statements = Record<string, Acknowledgement>;

/** true only for the text in force, about this workspace */
export function ackCovers(ack: Acknowledgement | undefined, workDir: string): boolean {
  return !!ack && ack.v === 2 && ack.work_dir === workDir && ack.text_version === STATEMENT_VERSION && ack.statement === STATEMENT_TEXT && !!ack.acknowledged_at;
}

export function statementFor(all: Statements | undefined, workerName: string): Acknowledgement | undefined {
  const a = all?.[ackSubject(workerName)];
  return ackCovers(a, ackSubject(workerName)) ? a : undefined;
}

export function makeAcknowledgement(workerName: string, at = new Date().toISOString()): Acknowledgement {
  return { v: 2, work_dir: ackSubject(workerName), text_version: STATEMENT_VERSION, statement: STATEMENT_TEXT, acknowledged_at: at };
}

/** the body of ~/.hpcworker/consent: "yes <iso time> <install id>" (the framework tests only for the file's presence) */
export function consentFileContent(iso: string, installId: string): string {
  return `yes ${iso} ${installId}\n`;
}

/** where the framework looks for the marker: $HPCW_HOME/consent */
export const consentFilePath = (home: string): string => `${home}/.hpcworker/consent`;
