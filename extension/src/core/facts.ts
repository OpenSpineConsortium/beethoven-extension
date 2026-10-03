// The facts the views are made from (11.0.0): the run as its files say, by the contract's rules R1 to
// R13 (docs/V11_CONTRACT.md §9.3); which of the run folder's files to download after a listing; and
// Show log's lines, Beethoven's own events merged with the worker's progress.log. Pure: the background
// lists, downloads and stores; these functions decide. Nothing here touches the browser or the grid.
//
// The defects these rules fix, observed in 10.0.0 (worker-start-status/states.out): a status.json from
// an earlier job showed the wrong state; nothing on disk said "queued", so a fresh submit looked dead
// and the strip fell back to "Starting your worker…"; and the wait was counted from the browser.
import { isEnvironmentUrl, parseProgressLine, reasonClass, type ConnectionFile, type ProgressKind, type Registration, type StatusFile, type StatusJson } from './contract';
import type { ActivityEntry } from './keys';
import { formatClock, LOG_WORDS, type LogLine } from './model';
import type { DirEntry } from './portal';
import type { RunFacts, RunPhase } from './steps';
import { STALE_AFTER_MS } from './worker';

/** the run as the background keeps it in storage.session (RUN_KEY) */
export interface RunState {
  /** the framework's state directory (the profile's shared_state_dir, expanded) */
  stateDir: string;
  /** the worker's name: its run folder is <stateDir>/<run> */
  run: string;
  /** the run's current job (a renewal moves it to the successor, R1) */
  job: string;
  /** the queued successor, when the files name one */
  next_job?: string;
  /** the profile's site name */
  site?: string;
  /** when this run was recorded here */
  set_at?: string;
  /** how the run was found: the student's Connect, the "Keep my worker running" restart, or the files of a run already there */
  started_by?: 'connect' | 'auto' | 'found';
  /**
   * 13.0.0: this browser has seen the run's status.json change between two of its reads (a heartbeat, or any
   * write): its worker was alive then. A run found already in the folder without it may have been gone for hours
   * (RunFacts.neverSeenAlive): the direct-way hang of 2026-10-02, docs/V12_STATUS.md.
   */
  alive_seen?: boolean;
  /** the student's own Connect submitted this job (open once, "ready N min after you asked", the wait history) */
  pressed?: boolean;
  status?: StatusFile;
  /** the listing's modified_at of status.json (s) when it was last downloaded */
  status_mtime?: number;
  connection?: ConnectionFile;
  connection_mtime?: number;
  /** the listing's modified_at of the node file (s), when listed */
  node_mtime?: number;
  /** the node file's one line, read once, for Details */
  node?: string;
  progress_mtime?: number;
  /** the last lines of progress.log (Show log and Details) */
  progress_tail?: string[];
  rc_mtime?: number;
  rc_tail?: string;
  /** what the registration block in rc.log says, when the files do not carry the link yet */
  registration?: Registration;
  /** when the run folder was last listed (ISO) */
  listed_at?: string;
  /** jobs this browser has seen past "queued" (R3: never backwards) */
  past_queued?: string[];
  /** the last `worker status --json` answer's scheduler part, and when it came */
  scheduler?: StatusJson['scheduler'];
  status_json_at?: string;
  /** the student pressed Stop: the run stays stopped until they connect again */
  stopped_by_student?: boolean;
  /** the environment link opened once for this press */
  opened_env?: string;
  /** the job whose wait went into WAIT_HISTORY_KEY */
  wait_recorded_job?: string;
  /** the job whose "online" was announced in front of the panel */
  online_announced_job?: string;
  /** "<job>|<reason class>" last written to Show log as "In line: …", so each class is said once per job */
  reason_logged?: string;
  /** the last read that failed, for Details */
  error?: string;
  updated?: string;
  /**
   * the grid's clock minus this computer's (ms), from the Files app's Date header; 0 or absent when they
   * agree within a few seconds. Every time the files carry is on the grid's clock: runFacts moves them
   * onto this computer's before comparing them with "now" or handing them to a timer.
   */
  clock_offset_ms?: number;
}

/** R5: an online state counts only with a heartbeat under this old when the file was read */
export const ONLINE_HEARTBEAT_MS = 90_000;
/** R7: starting or running this long from got_computer_at with no online is slow */
export const SLOW_AFTER_MS = 3 * 60_000;
/** R11: the Claude row trusts claude_login this long */
export const CLAUDE_FRESH_MS = 5 * 60_000;

const t = (iso: string | undefined): number | undefined => {
  if (!iso) return undefined;
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : undefined;
};

/** the environment link of a run, only when it is Claude's own Code page for an environment */
export function environmentLinkOf(run: Pick<RunState, 'connection' | 'status' | 'registration'> | undefined): string | undefined {
  if (!run) return undefined;
  const raw = run.connection?.environment_url ?? run.status?.environment_url ?? run.registration?.environment_url ?? run.connection?.session_url ?? run.status?.session_url;
  return isEnvironmentUrl(raw) ? raw : undefined;
}

/** some link was reported and it is not a claude.ai/code environment link */
function badLinkOf(run: RunState): boolean {
  const raw = run.connection?.environment_url ?? run.status?.environment_url ?? run.registration?.environment_url;
  return !!raw && !isEnvironmentUrl(raw);
}

/**
 * R1 and R3, applied when a status.json has been downloaded: the file is taken only when its job is
 * the run's job or the run's next job (which then becomes the run's job: a renewal); a "queued" file
 * for a job already seen further along is ignored. Returns the run to store, and whether the file was
 * taken.
 */
export function applyStatus(run: RunState, status: StatusFile, mtime?: number): { run: RunState; taken: boolean } {
  const job = status.job ? String(status.job) : '';
  let next = run;
  if (job && job !== run.job) {
    if (run.next_job && job === run.next_job) next = { ...run, job, next_job: undefined, connection: undefined, connection_mtime: undefined };
    else return { run: { ...run, ...(mtime !== undefined ? { status_mtime: mtime } : {}) }, taken: false };
  }
  const past = new Set(next.past_queued ?? []);
  if (status.state === 'queued' && job && past.has(job)) return { run: { ...next, ...(mtime !== undefined ? { status_mtime: mtime } : {}) }, taken: false };
  if (status.state !== 'queued' && job) past.add(job);
  const nextJob = status.next_job ? String(status.next_job) : next.next_job;
  // 13.0.0: a listing whose modified_at moved since the last download of this run's file: written in between (alive_seen)
  const wrote = mtime !== undefined && run.status !== undefined && run.status_mtime !== undefined && mtime !== run.status_mtime;
  return {
    run: { ...next, status, ...(mtime !== undefined ? { status_mtime: mtime } : {}), past_queued: [...past].slice(-10), ...(nextJob && nextJob !== next.job ? { next_job: nextJob } : {}), ...(wrote ? { alive_seen: true } : {}) },
    taken: true,
  };
}

/**
 * 12.0.0, the direct way: R1 and R3 for a status.json read through the gate, whose read carries no
 * modified time. The heartbeat is then the file's own updated_at (R5, R12), and the moment of the read
 * (`readAt`, s) stands in for the listing's modified_at only as proof of life: when the file changed
 * since the last read of the same job (the worker wrote a heartbeat in between). A first read of a job,
 * or a read of a file that has not changed, never refreshes it, so a run whose worker has gone (its
 * file left "online" or "running") reads as stale; and a grid clock behind this computer's cannot make
 * a heartbeating worker stale past the first read after its next heartbeat (up to one heartbeat, 30 s, on
 * a fresh copy). Stamping every read with its own moment, as the
 * direct way did at first, made every such file look alive for ever (2026-10-02, docs/V12_STATUS.md).
 * 13.0.0: a file that changed between two reads also marks the run alive_seen (a renewal's first file too).
 */
export function applyStatusRead(run: RunState, status: StatusFile, readAt: number): { run: RunState; taken: boolean } {
  const before = run.status;
  const r = applyStatus(run, status);
  if (!r.taken) return r;
  const changed = !!before && JSON.stringify(before) !== JSON.stringify(status);
  const seen = changed ? { alive_seen: true } : {};
  const sameJob = !!before && String(before.job ?? '') === String(status.job ?? '') && run.job === r.run.job;
  if (!sameJob) return { run: { ...r.run, ...seen, status_mtime: undefined }, taken: true };
  return changed ? { run: { ...r.run, ...seen, status_mtime: readAt }, taken: true } : r;
}

/** R1 for connection.json: taken only for the run's job */
export function applyConnection(run: RunState, conn: ConnectionFile, mtime?: number): { run: RunState; taken: boolean } {
  if (conn.job && String(conn.job) !== run.job) return { run: { ...run, ...(mtime !== undefined ? { connection_mtime: mtime } : {}) }, taken: false };
  return { run: { ...run, connection: conn, ...(mtime !== undefined ? { connection_mtime: mtime } : {}) }, taken: true };
}

/** which files of the run folder to download after a listing: only those whose modified_at changed (status.json, connection.json), the node file once, progress.log when Show log or Details wants it */
export interface ListingPlan {
  status: boolean;
  connection: boolean;
  node: boolean;
  progress: boolean;
  rc: boolean;
  /** the listing's modified_at (s) of each name, for the run to keep */
  mtimes: Partial<Record<'status' | 'connection' | 'node' | 'progress' | 'rc', number>>;
  /** the run folder lists no status.json (yet) */
  noStatus: boolean;
}

export function listingPlan(run: RunState, entries: DirEntry[], want: { progress?: boolean; rc?: boolean } = {}): ListingPlan {
  const at = (name: string) => entries.find((e) => e.name === name && e.type !== 'd')?.modified_at;
  const m = { status: at('status.json'), connection: at('connection.json'), node: at('node'), progress: at('progress.log'), rc: at('rc.log') };
  return {
    status: m.status !== undefined && m.status !== run.status_mtime,
    connection: m.connection !== undefined && m.connection !== run.connection_mtime,
    node: m.node !== undefined && m.node !== run.node_mtime,
    progress: !!want.progress && m.progress !== undefined && m.progress !== run.progress_mtime,
    rc: !!want.rc && m.rc !== undefined && m.rc !== run.rc_mtime,
    mtimes: Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined)) as ListingPlan['mtimes'],
    noStatus: m.status === undefined,
  };
}

/** a time from the grid's files, moved onto this computer's clock (R5, R10, R12 compare like with like) */
const onLaptop = (iso: string | undefined, offset: number): number | undefined => {
  const v = t(iso);
  return v === undefined ? undefined : v - offset;
};

/** R4: the node file was written for this job: modified at or after its submitted_at */
function nodeForThisJob(run: RunState): boolean {
  const sub = t(run.status?.submitted_at);
  if (run.node_mtime === undefined) return false;
  return sub === undefined ? run.status?.state !== 'queued' : run.node_mtime * 1000 >= sub - 1000;
}

/** the heartbeat as it stood when the file was read: updated_at, or the listing's modified_at when the clocks disagree (the later of the two), on this computer's clock */
function heartbeatAt(run: RunState): number | undefined {
  const off = run.clock_offset_ms ?? 0;
  const u = onLaptop(run.status?.updated_at, off);
  const m = run.status_mtime !== undefined ? run.status_mtime * 1000 - off : undefined;
  if (u === undefined) return m;
  if (m === undefined) return u;
  return Math.max(u, m);
}

/** whole minutes from a to b */
const minutes = (a: number | undefined, b: number | undefined): number | undefined => (a === undefined || b === undefined || b < a ? undefined : Math.round((b - a) / 60_000));

const LIVE_STATES = new Set(['queued', 'starting', 'need_login', 'need_consent', 'running', 'online']);

/**
 * The run as its files say, by R1 to R13. `now` is the browser's clock; the files' own times decide
 * every clock the student sees (R10), never the browser's moment of asking.
 */
export function runFacts(run: RunState | undefined, now: number): RunFacts {
  const none: RunFacts = { present: false, phase: 'none', live: false, stale: false, renewal: false, chain: true, reason: 'line', pressed: false };
  if (!run) return none;
  const s = run.status && (!run.status.job || String(run.status.job) === run.job) ? run.status : undefined;
  const checkedAt = t(run.listed_at);
  // R1: the link only from this job's files (a status of another job, should one be on the record, says nothing)
  const link = environmentLinkOf({ connection: run.connection, status: s, registration: run.registration });
  const title = s?.title || run.connection?.title || undefined;
  const renewal = !!s?.renewal;
  const base: RunFacts = {
    ...none,
    present: true,
    pressed: !!run.pressed,
    renewal,
    chain: s?.chain !== false,
    // 13.0.0 (M1): found already in the folder, and its file never seen to change here
    ...(run.started_by === 'found' && !run.alive_seen ? { neverSeenAlive: true } : {}),
    ...(checkedAt !== undefined ? { checkedAt } : {}),
    ...(link ? { link } : {}),
    ...(title ? { title } : {}),
  };
  if (!s) {
    // framework 10 writes the queued file before it says "queued", so this is a run not read yet
    return { ...base, phase: run.stopped_by_student ? 'stopped' : 'queued', live: !run.stopped_by_student, reason: reasonClass(run.scheduler?.reason) };
  }
  // every grid time on this computer's clock (RunState.clock_offset_ms), so "now" and the page's timers agree with them
  const off = run.clock_offset_ms ?? 0;
  const submitted = onLaptop(s.submitted_at, off);
  const got = onLaptop(s.got_computer_at, off) ?? (nodeForThisJob(run) && run.node_mtime !== undefined ? run.node_mtime * 1000 - off : undefined);
  const online = onLaptop(s.online_at ?? run.connection?.online_at, off);
  const beat = heartbeatAt(run);
  const reason = reasonClass(s.reason || run.scheduler?.reason);
  const est = onLaptop(s.expected_start || run.scheduler?.expected_start, off);
  const ends = onLaptop(s.ends_at, off);
  const facts: RunFacts = {
    ...base,
    reason,
    ...(est !== undefined && est > now ? { expectedStart: new Date(est).toISOString() } : {}),
    ...(submitted !== undefined && !renewal ? { submittedAt: new Date(submitted).toISOString() } : {}),
    ...(got !== undefined ? { gotComputerAt: new Date(got).toISOString() } : {}),
    ...(online !== undefined ? { onlineAt: new Date(online).toISOString() } : {}),
    ...(ends !== undefined ? { endsAt: new Date(ends).toISOString() } : {}),
    ...(s.stop_reason ? { stopReason: s.stop_reason } : {}),
  };
  // R11: the Claude row trusts claude_login only while it is under five minutes old
  const cl = s.claude_login;
  const clAt = onLaptop(cl?.checked_at, off);
  if (cl && clAt !== undefined && now - clAt < CLAUDE_FRESH_MS) facts.claude = { loggedIn: !!cl.loggedIn, ...(cl.subscriptionType ? { plan: cl.subscriptionType } : {}), ...(cl.email ? { email: cl.email } : {}) };
  // R13: "Ready in Claude, 7 min after you asked."
  if (!renewal) {
    const ready = minutes(submitted, online);
    if (ready !== undefined) facts.readyMinutes = ready;
  }
  const liveState = LIVE_STATES.has(s.state);
  // R12: a live state whose heartbeat is over three minutes old reads as last known (a queued file has no heartbeat)
  facts.stale = liveState && s.state !== 'queued' && beat !== undefined && now - beat > STALE_AFTER_MS;
  facts.live = liveState && !facts.stale;
  let phase: RunPhase;
  switch (s.state) {
    case 'queued':
      // R3 and R4: a node file for this job means it has a computer, whatever the queued file says
      phase = nodeForThisJob(run) ? 'got-computer' : 'queued';
      break;
    case 'starting':
      // R6: it had been online and is starting Remote Control again
      if ((s.restarts ?? 0) >= 1 && online !== undefined) phase = 'reconnecting';
      else phase = got !== undefined && now - got >= SLOW_AFTER_MS ? 'slow' : 'got-computer';
      break;
    case 'running':
      phase = got !== undefined && now - got >= SLOW_AFTER_MS ? 'slow' : 'connecting';
      break;
    case 'need_login':
      phase = 'needs-claude';
      break;
    case 'need_consent':
      phase = 'needs-consent';
      break;
    case 'online': {
      // R5: online with a claude.ai/code link and a heartbeat under 90 s old when the file was read
      const fresh = beat === undefined || checkedAt === undefined || checkedAt - beat < ONLINE_HEARTBEAT_MS;
      if (badLinkOf({ ...run, status: s }) && !link) {
        phase = 'online';
        facts.badLink = true;
      } else phase = link && fresh ? 'online' : 'connecting';
      break;
    }
    case 'preempted':
      // R8: renewing when a successor is queued
      phase = s.next_job || run.next_job ? 'renewing' : 'ended';
      break;
    case 'stopped':
      phase = 'stopped';
      break;
    case 'error':
      phase = 'error';
      break;
    default:
      phase = 'none';
  }
  return { ...facts, phase };
}

/** WAIT_HISTORY_KEY's minutes for a job (R13): got_computer_at − submitted_at, only for a job the student's Connect submitted */
export function waitMinutes(f: RunFacts): number | undefined {
  if (f.renewal || !f.pressed) return undefined;
  return minutes(t(f.submittedAt), t(f.gotComputerAt));
}

/** the history with one more wait, newest last, at most five */
export function addWait(history: number[] | undefined, m: number): number[] {
  return [...(history ?? []), Math.max(0, Math.round(m))].slice(-5);
}

// ---- Show log ----------------------------------------------------------------------------------------

/** the worker's progress kinds in Show log's words */
function progressWords(kind: ProgressKind, title: string): string {
  switch (kind) {
    case 'asked':
      return LOG_WORDS.asked;
    case 'got-computer':
      return LOG_WORDS.gotComputer;
    case 'connecting':
      return LOG_WORDS.connecting;
    case 'online':
      return LOG_WORDS.online(title);
    case 'waiting-signin':
      return LOG_WORDS.waitingSignin;
    case 'reconnecting':
      return LOG_WORDS.reconnecting;
    case 'renewing':
      return LOG_WORDS.renewing;
    case 'ended':
      return LOG_WORDS.ended;
    case 'stopped':
      return LOG_WORDS.stopped;
    case 'signin-abandoned':
      return LOG_WORDS.signinAbandoned;
    case 'error':
      return LOG_WORDS.error;
  }
}

/** within this long, the same words from Beethoven and from the worker are one event; the worker's is kept */
export const LOG_SAME_EVENT_MS = 90_000;

/**
 * Show log: Beethoven's own events and the worker's progress.log, oldest first, in plain words on the
 * browser's clock ("8:44 Signed in to the grid as st1234"). A progress line outside the fixed set is
 * left out (Details shows it); the tool's own sentences ("Couldn't start: <message>") are never shown.
 */
export function mergeLog(activity: ActivityEntry[] | undefined, progress: string[] | undefined, title: string): LogLine[] {
  const worker: LogLine[] = [];
  for (const raw of progress ?? []) {
    const p = parseProgressLine(raw);
    if (!p) continue;
    worker.push({ at: p.at, clock: formatClock(p.at, false), text: progressWords(p.kind, title), source: 'worker' });
  }
  const own: LogLine[] = [];
  for (const a of activity ?? []) {
    const at = t(a.at);
    if (at === undefined) continue;
    const dup = worker.some((w) => w.text === a.text && Math.abs((t(w.at) ?? 0) - at) <= LOG_SAME_EVENT_MS);
    if (dup) continue;
    own.push({ at: a.at, clock: formatClock(a.at, false), text: a.text, source: 'beethoven' });
  }
  return [...worker, ...own].sort((x, y) => (t(x.at) ?? 0) - (t(y.at) ?? 0));
}

/** one more activity entry, at most `max` kept (oldest dropped), never the same words twice within a minute */
export function addActivity(list: ActivityEntry[] | undefined, text: string, at: string, max = 200): ActivityEntry[] {
  const l = list ?? [];
  const last = l[l.length - 1];
  if (last && last.text === text && Math.abs((t(at) ?? 0) - (t(last.at) ?? 0)) < 60_000) return l;
  return [...l, { at, text }].slice(-max);
}

/** Show log as text for "Copy log" */
export function logText(lines: LogLine[]): string {
  return lines.map((l) => `${l.clock} ${l.text}`).join('\n');
}
