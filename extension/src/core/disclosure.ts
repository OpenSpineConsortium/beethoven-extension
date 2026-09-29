// What the student is told, in the report's words, at first run and before every job start, and
// must acknowledge each browser session (storage.session, so it is asked again after a restart).
// Two acknowledgements: the plan-class disclosure (where the transcript goes) and the data
// classification (what must not be in the working directory). The worker is refused a start
// without both, and in a directory the student has marked restricted.
export const ACK_KEY = 'bridge.ack';

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

/** what an acknowledgement is about: the named worker's workspace, <state_dir>/workspaces/<name> on the cluster */
export const ackSubject = (workerName: string): string => `workspaces/${workerName}`;

export interface Acknowledgement {
  v: 1;
  /** the workspace the statement was made about: ackSubject(worker name) */
  work_dir: string;
  disclosure_at: string;
  classification_at: string;
  /** the exact sentence acknowledged */
  statement: string;
}

export function ackCovers(ack: Acknowledgement | undefined, workDir: string): boolean {
  return !!ack && ack.v === 1 && ack.work_dir === workDir && !!ack.disclosure_at && !!ack.classification_at && ack.statement === DATA_CLASSIFICATION_STATEMENT;
}
