// The few words the pages draw that are not sentences of the specification: accessible names for
// controls that show only an icon, and the section names of Details (for the lab lead, exempt from the
// hygiene rule). Every student-facing sentence is in core/model.ts WORDS; test/hygiene.test.ts reads
// LABELS together with WORDS and the fixtures.

/** accessible names (aria-label) and tooltips for icon-only controls; student-facing */
export const LABELS = {
  menu: 'More',
  dismiss: 'Dismiss',
  copy: 'Copy',
  copyPrompt: 'Copy this question',
  scene: (n: number, of: number) => `Scene ${n} of ${of}`,
  pause: 'Pause',
  resume: 'Play',
  prompts: 'Questions to try',
  /** the statement's checklist, all three done, on one line: "Signed in as st1234 · Approved · Ready" */
  ready: 'Ready',
  permissionMode: 'What your worker may do without asking',
  appearance: 'Appearance',
  workerName: 'Worker name',
  portalAddress: 'Grid address',
  codeBox: 'Code from the Claude tab',
  tick: 'Required',
  newTab: 'Opens in a new tab',
  version: (v: string) => `Beethoven ${v}`,
  /** tab mode: a background tab carries the action (the specification's words; not in model.ts WORDS) */
  workingInTab: 'Working on the grid…',
  /** Settings, "Google Drive in Claude (optional)": 10.0.0's sentences, shortened (SettingsView.drive carries only the title) */
  driveBody: "In claude.ai, open Settings, then Connectors, and connect Google Drive. Your worker's sessions can then read files you keep in Drive.",
  driveOpen: 'Open claude.ai connectors',
  driveTick: 'Google Drive is connected in claude.ai',
  driveUrl: 'https://claude.ai/settings/connectors',
} as const;

/** Details for your lab lead: section names and field labels (exempt from the hygiene rule) */
export const DETAILS_LABELS = {
  checks: 'Checks',
  never: 'not run yet',
  run: 'The run',
  job: 'Job',
  nextJob: 'Successor job',
  partition: 'Partition',
  qos: 'QoS',
  node: 'Node',
  schedulerState: 'Slurm state',
  reason: 'Reason',
  expectedStart: 'Expected start',
  checkedAt: 'Checked at',
  submittedAt: 'Submitted',
  gotComputerAt: 'Got a computer',
  onlineAt: 'Online',
  heartbeat: 'Heartbeat age',
  restarts: 'Restarts',
  chain: 'Chain',
  consent: 'Remote Control answer',
  plan: 'Sign-in plan',
  progress: 'progress.log (last 20 lines)',
  rc: 'rc.log',
  audit: 'Audit log',
  connection: 'Connection',
  shellHost: 'Shell host',
  siteProfile: 'Site profile',
  channel: 'Channel',
  loginSetup: 'One-time grid key step',
  proven: 'proven on the grid',
  unproven: 'unproven on the grid',
  nothing: 'nothing yet',
  loading: 'Reading…',
} as const;
