// The run as its files say (core/facts.ts), by the contract's rules R1 to R13 (docs/V11_CONTRACT.md
// §9.3), against the three defects 10.0.0 had (worker-start-status/states.out): a status.json from an
// earlier job showed the wrong state (R1 ignores it); nothing on disk said "queued" (framework 10 writes
// it, and it is live, R2); and the wait was counted from the browser (every clock counts from the files,
// R10). Also: which files a listing downloads, the wait history, and Show log's merge.
import { describe, expect, it } from 'vitest';
import type { StatusFile } from '../src/core/contract';
import { addActivity, addWait, applyConnection, applyStatus, listingPlan, mergeLog, runFacts, waitMinutes, type RunState } from '../src/core/facts';
import { formatClock } from '../src/core/model';
import type { DirEntry } from '../src/core/portal';

const NOW = Date.parse('2026-10-01T13:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const S = 1000;
const MIN = 60 * S;
const LINK = 'https://claude.ai/code?environment=env_01AbCdEf';
const STATE = '/rs/rs_grp_oschome/st1234/hpcworker';

const queuedFile = (job = '40501234', extra: Partial<StatusFile> = {}): StatusFile => ({ version: 10, run: 'worker', job, node: '', state: 'queued', message: 'waiting for a computer', needs: 'nothing', submitted_at: ago(3 * MIN), updated_at: ago(3 * MIN), title: 'Wayne State grid', renewal: false, chain: true, next_job: '', ...extra });

function runWith(status: StatusFile | undefined, extra: Partial<RunState> = {}): RunState {
  return { stateDir: STATE, run: 'worker', job: '40501234', set_at: ago(3 * MIN), started_by: 'connect', pressed: true, listed_at: ago(2 * S), ...(status ? { status, status_mtime: Math.floor((NOW - 3 * MIN) / 1000) } : {}), ...extra };
}

const entry = (name: string, mtimeS: number): DirEntry => ({ id: name, type: 'f', name, size: 1, modified_at: mtimeS, owner: 'st1234', mode: 420 });

describe('R1: a status.json for another job is ignored; the next job becomes the run\'s job', () => {
  it('ignores a stale file left by an earlier job', () => {
    const stale: StatusFile = { state: 'online', job: '39999999', environment_url: LINK, updated_at: ago(5 * S) };
    const r = applyStatus(runWith(undefined), stale, 100);
    expect(r.taken).toBe(false);
    expect(r.run.status).toBeUndefined();
    expect(r.run.status_mtime).toBe(100);
    // the run itself reads as just asked for, not as the old job's online
    expect(runFacts(r.run, NOW).phase).toBe('queued');
  });

  it('takes the next job\'s file and moves the run to it (a renewal)', () => {
    const base = applyStatus(runWith(undefined), { state: 'online', job: '40501234', next_job: '40509999', environment_url: LINK, updated_at: ago(10 * S) }).run;
    expect(base.next_job).toBe('40509999');
    const renewed = applyStatus(base, { state: 'starting', job: '40509999', renewal: true, got_computer_at: ago(20 * S), updated_at: ago(5 * S) });
    expect(renewed.taken).toBe(true);
    expect(renewed.run.job).toBe('40509999');
    expect(renewed.run.next_job).toBeUndefined();
    const f = runFacts(renewed.run, NOW);
    expect(f.renewal).toBe(true);
    // no queue clock counted from hours ago for a renewal (R10)
    expect(f.submittedAt).toBeUndefined();
  });

  it('a status file of another job that is somehow on the run is never read as the run\'s state', () => {
    // runFacts holds to R1 itself, whatever applyStatus let through
    const foreign = runWith({ state: 'online', job: '39999999', environment_url: LINK, updated_at: ago(5 * S) });
    expect(runFacts(foreign, NOW).phase).toBe('queued');
    expect(runFacts(foreign, NOW).link).toBeUndefined();
  });

  it('compares the grid\'s times with the grid\'s clock (a laptop 4 min ahead still reads a fresh worker as online)', () => {
    const online: StatusFile = { state: 'online', job: '40501234', environment_url: LINK, submitted_at: ago(10 * MIN), online_at: ago(5 * MIN), updated_at: ago(10 * S) };
    // the laptop's clock runs 4 minutes ahead of the grid's: every grid time is 4 min "old" to it
    const ahead = 4 * MIN;
    const skewed = runWith({ ...online, updated_at: new Date(NOW - ahead - 10 * S).toISOString(), online_at: new Date(NOW - ahead - 5 * MIN).toISOString(), submitted_at: new Date(NOW - ahead - 10 * MIN).toISOString() }, { status_mtime: Math.floor((NOW - ahead - 10 * S) / 1000) });
    expect(runFacts(skewed, NOW)).toMatchObject({ phase: 'connecting', stale: true });
    const corrected = runFacts({ ...skewed, clock_offset_ms: -ahead }, NOW);
    expect(corrected).toMatchObject({ phase: 'online', stale: false, live: true });
    // and the clocks the student sees are on this computer's clock
    expect(corrected.onlineAt).toBe(ago(5 * MIN));
    expect(corrected.submittedAt).toBe(ago(10 * MIN));
  });

  it('connection.json is taken only for the run\'s job', () => {
    expect(applyConnection(runWith(undefined), { job: '1', environment_url: LINK }).taken).toBe(false);
    expect(applyConnection(runWith(undefined), { job: '40501234', environment_url: LINK }).taken).toBe(true);
  });
});

describe('R2, R3, R4: queued is live; never backwards; a node file for this job is a computer', () => {
  it('a queued file is live without a heartbeat, with the clock from submitted_at', () => {
    const f = runFacts(runWith(queuedFile()), NOW);
    expect(f).toMatchObject({ present: true, phase: 'queued', live: true, stale: false, submittedAt: ago(3 * MIN), reason: 'line' });
  });

  it('a queued file for a job already seen further along is ignored (R3)', () => {
    let run = applyStatus(runWith(undefined), queuedFile()).run;
    run = applyStatus(run, { ...queuedFile(), state: 'starting', got_computer_at: ago(MIN), updated_at: ago(10 * S) }).run;
    const back = applyStatus(run, queuedFile());
    expect(back.taken).toBe(false);
    expect(runFacts(back.run, NOW).phase).toBe('got-computer');
  });

  it('the node file written at or after submitted_at means a computer even under a queued file (R4); an older one does not', () => {
    const fresh = runWith(queuedFile(), { node_mtime: Math.floor((NOW - MIN) / 1000) });
    expect(runFacts(fresh, NOW)).toMatchObject({ phase: 'got-computer', gotComputerAt: new Date(Math.floor((NOW - MIN) / 1000) * 1000).toISOString() });
    const old = runWith(queuedFile(), { node_mtime: Math.floor((NOW - 60 * MIN) / 1000) });
    expect(runFacts(old, NOW).phase).toBe('queued');
  });

  it('the scheduler\'s reason, its class, and an estimate only when it is in the future (D12)', () => {
    expect(runFacts(runWith(queuedFile('40501234', { reason: 'QOSMaxJobsPerUserLimit' })), NOW).reason).toBe('share');
    expect(runFacts(runWith(queuedFile('40501234', { reason: 'ReqNodeNotAvail' })), NOW).reason).toBe('maintenance');
    expect(runFacts(runWith(queuedFile('40501234', { expected_start: ago(-12 * MIN) })), NOW).expectedStart).toBe(ago(-12 * MIN));
    expect(runFacts(runWith(queuedFile('40501234', { expected_start: ago(12 * MIN) })), NOW).expectedStart).toBeUndefined();
    // the reason can come from the last worker status --json too
    expect(runFacts(runWith(queuedFile(), { scheduler: { state: 'PENDING', reason: 'AssocGrpCPULimit', expected_start: '', node: '', checked_at: ago(S) } }), NOW).reason).toBe('share');
  });
});

describe('R5 to R9: online, reconnecting, slow, renewing, stopped', () => {
  const st = (s: Partial<StatusFile>) => runWith({ ...queuedFile(), node: 'asx15', got_computer_at: ago(2 * MIN), ...s } as StatusFile);

  it('online needs the link and a heartbeat under 90 s when the file was read (R5)', () => {
    expect(runFacts(st({ state: 'online', environment_url: LINK, online_at: ago(MIN), updated_at: ago(20 * S) }), NOW)).toMatchObject({ phase: 'online', link: LINK });
    const old = st({ state: 'online', environment_url: LINK, updated_at: ago(2 * MIN) });
    expect(runFacts({ ...old, status_mtime: Math.floor((NOW - 2 * MIN) / 1000) }, NOW).phase).toBe('connecting');
    expect(runFacts(st({ state: 'online', environment_url: 'https://evil.example/x', updated_at: ago(10 * S) }), NOW)).toMatchObject({ phase: 'online', badLink: true });
  });

  it('starting after having been online with a restart is reconnecting (R6); running 3 min with no link is slow (R7)', () => {
    expect(runFacts(st({ state: 'starting', restarts: 1, online_at: ago(30 * MIN), updated_at: ago(5 * S) }), NOW).phase).toBe('reconnecting');
    expect(runFacts(st({ state: 'starting', updated_at: ago(5 * S) }), NOW).phase).toBe('got-computer');
    expect(runFacts(st({ state: 'running', updated_at: ago(5 * S) }), NOW).phase).toBe('connecting');
    expect(runFacts(st({ state: 'running', got_computer_at: ago(4 * MIN), updated_at: ago(5 * S) }), NOW).phase).toBe('slow');
  });

  it('preempted with a successor is renewing (R8), without one has ended; stopped carries its reason (R9)', () => {
    expect(runFacts(st({ state: 'preempted', next_job: '40509999', updated_at: ago(5 * S) }), NOW).phase).toBe('renewing');
    expect(runFacts(st({ state: 'preempted', updated_at: ago(5 * S) }), NOW).phase).toBe('ended');
    expect(runFacts(st({ state: 'stopped', stop_reason: 'login_abandoned' }), NOW)).toMatchObject({ phase: 'stopped', stopReason: 'login_abandoned', live: false });
    expect(runFacts(st({ state: 'need_login', updated_at: ago(5 * S) }), NOW).phase).toBe('needs-claude');
    expect(runFacts(st({ state: 'need_consent', updated_at: ago(5 * S) }), NOW).phase).toBe('needs-consent');
    expect(runFacts(st({ state: 'error' }), NOW).phase).toBe('error');
  });
});

describe('R10 to R13: the clocks, the Claude row, stale reads, "ready N min after you asked"', () => {
  it('a live state whose heartbeat is over 3 minutes old reads as last known (R12)', () => {
    const r = runWith({ ...queuedFile(), state: 'online', environment_url: LINK, updated_at: ago(4 * MIN) });
    expect(runFacts({ ...r, status_mtime: Math.floor((NOW - 4 * MIN) / 1000) }, NOW)).toMatchObject({ stale: true, live: false });
  });

  it('the Claude row trusts claude_login only under 5 minutes old (R11)', () => {
    const r = (checkedAgo: number) => runWith({ ...queuedFile(), state: 'online', environment_url: LINK, updated_at: ago(5 * S), claude_login: { loggedIn: true, subscriptionType: 'max', email: 'alex@wayne.edu', checked_at: ago(checkedAgo) } });
    expect(runFacts(r(MIN), NOW).claude).toEqual({ loggedIn: true, plan: 'max', email: 'alex@wayne.edu' });
    expect(runFacts(r(6 * MIN), NOW).claude).toBeUndefined();
  });

  it('"ready N min after you asked" is online_at − submitted_at, for the job the student\'s Connect submitted (R13); the wait history is got_computer_at − submitted_at', () => {
    const r = runWith({ ...queuedFile(), submitted_at: ago(10 * MIN), got_computer_at: ago(4 * MIN), online_at: ago(3 * MIN), state: 'online', environment_url: LINK, updated_at: ago(5 * S) });
    const f = runFacts(r, NOW);
    expect(f.readyMinutes).toBe(7);
    expect(waitMinutes(f)).toBe(6);
    expect(waitMinutes({ ...f, pressed: false })).toBeUndefined();
    expect(waitMinutes({ ...f, renewal: true })).toBeUndefined();
    expect(addWait([1, 2, 3, 4, 5], 6)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('a listing downloads only what changed', () => {
  it('status.json and connection.json by modified_at, the node file once, progress.log and rc.log only when wanted', () => {
    const r = runWith(queuedFile(), { status_mtime: 100, connection_mtime: 50 });
    const entries = [entry('status.json', 100), entry('connection.json', 60), entry('node', 70), entry('progress.log', 80), entry('rc.log', 90), entry('job.token', 99)];
    const p = listingPlan(r, entries);
    expect(p).toMatchObject({ status: false, connection: true, node: true, progress: false, rc: false, noStatus: false });
    expect(p.mtimes).toEqual({ status: 100, connection: 60, node: 70, progress: 80, rc: 90 });
    expect(listingPlan(r, entries, { progress: true, rc: true })).toMatchObject({ progress: true, rc: true });
    expect(listingPlan({ ...r, node_mtime: 70 }, entries).node).toBe(false);
    expect(listingPlan(r, [entry('job.id', 1)]).noStatus).toBe(true);
  });
});

describe('Show log', () => {
  it('merges Beethoven\'s events with the worker\'s progress.log, oldest first, on the browser\'s clock; the same words within 90 s are one line (the worker\'s)', () => {
    const t = (min: number) => new Date(Date.parse('2026-10-01T12:44:00Z') + min * MIN).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const activity = [
      { at: t(0), text: 'Signed in to the grid as st1234' },
      { at: t(0), text: 'Approved' },
      { at: t(0.2), text: 'Asked the grid for a computer' },
      { at: t(1), text: 'Signed in to Claude · Max' },
      { at: t(2), text: 'In line: the grid is busy' },
    ];
    const progress = [`${t(0.1)} Asked the grid for a computer`, `${t(6)} Got a computer`, `${t(7)} Online: ${LINK}`, `${t(8)} Couldn't start: secret detail`, `${t(9)} something only Details shows`];
    const lines = mergeLog(activity, progress, 'Wayne State grid');
    expect(lines.map((l) => l.text)).toEqual(['Signed in to the grid as st1234', 'Approved', 'Asked the grid for a computer', 'Signed in to Claude · Max', 'In line: the grid is busy', 'Got a computer', 'Online · Wayne State grid', "Couldn't start"]);
    expect(lines.find((l) => l.text === 'Asked the grid for a computer')?.source).toBe('worker');
    expect(lines[0]!.clock).toBe(formatClock(t(0), false));
    expect(lines.some((l) => /secret|Details shows/.test(l.text))).toBe(false);
  });

  it('keeps at most the newest entries and never the same words twice within a minute', () => {
    let l = addActivity(undefined, 'Approved', ago(10 * S));
    l = addActivity(l, 'Approved', ago(5 * S));
    expect(l).toHaveLength(1);
    for (let i = 0; i < 5; i++) l = addActivity(l, `e${i}`, ago(S), 3);
    expect(l.map((x) => x.text)).toEqual(['e2', 'e3', 'e4']);
  });
});
