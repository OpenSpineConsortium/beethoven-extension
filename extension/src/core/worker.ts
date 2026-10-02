// The worker's verbs, in one place, through the portal client the caller hands in (the background's
// own in direct mode, the page script's in tab mode). 11.0.0: every write is one of the lab's tool's
// own verbs typed through the shell, never a Files write: the dashboard's Rails origin check would
// refuse a PUT carrying Origin chrome-extension://.
//
//   start    `exec bash '<shared>/bin/hpcworker' connect …` (the interactive sitting; core/login.ts reads it)
//   stop     `bash '<shared>/bin/hpcworker' worker stop --name N`: the tool's stop alone
//   restrict `bash '<shared>/bin/hpcworker' worker restrict --name N`: the restricted marker
//   status   `bash '<shared>/bin/hpcworker' worker status --name N --json`: one squeue, only while queued
//
// The chokepoint (audit.ts) holds the scheduler-class lines (connect, worker status, worker stop) to
// one a minute; a refusal of that floor is waited out here and retried, never shown to the student.
import { FloorError } from './audit';
import { commands, parseStatusJson, paths, profileRestricts, siteFrom, stateDirFrom, type ConnectOptions, type StatusFile, type StatusJson, type WorkerState } from './contract';
import type { PortalApi } from './portal';

export interface ClusterContext {
  home: string;
  user: string;
  stateDir: string;
  site?: string;
  profile?: string;
}

/** home, username, the profile's state directory and site: what finding a run, a restricted marker or a probe needs to know */
export async function clusterContext(portal: PortalApi): Promise<ClusterContext> {
  const home = await portal.home();
  const user = (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
  const profile = await portal.readFileIfExists(paths.profile(home));
  return { home, user, stateDir: stateDirFrom(profile, { home, user }), site: siteFrom(profile), profile };
}

/**
 * Why the named workspace must not host a worker, or undefined when it may: the student's own
 * `.restricted` marker in the workspace (its presence read from the workspace's listing, never
 * from a download), or a profile that marks it so.
 */
export async function restrictedReason(portal: PortalApi, ctx: ClusterContext, workerName: string): Promise<string | undefined> {
  if (profileRestricts(ctx.profile, workerName)) return `the site profile marks the workspace of worker "${workerName}" restricted`;
  const marker = paths.restrictedMarker(ctx.stateDir, workerName);
  if (await portal.exists(marker)) return `the workspace ${paths.workspace(ctx.stateDir, workerName)} is marked restricted (it holds a ${marker.split('/').pop()} file); the worker will not start there`;
  return undefined;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Run a scheduler-class or shell line, waiting out a refused floor silently (at most twice): a
 * clicked button never becomes a refusal the student reads, and never a polling loop either.
 */
export async function withFloor<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void> = realSleep, still: () => boolean = () => true): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (!still()) throw new GivenUpError();
    try {
      return await fn();
    } catch (e) {
      const waitMs = (e as FloorError).waitMs;
      if (attempt < 2 && (e instanceof FloorError || (e as Error)?.name === 'FloorError') && typeof waitMs === 'number') {
        await sleep(waitMs + 250);
        continue;
      }
      throw e;
    }
  }
}

/** the press a floor wait was for was given up meanwhile (Stop, Cancel, another sign-in): nothing was sent */
export class GivenUpError extends Error {
  constructor() {
    super('given up before it was sent');
    this.name = 'GivenUpError';
  }
}

/** the one connect line for these options (contract.ts commands.connect); throws on a bad value before anything is typed */
export function connectLine(sharedDir: string, o: ConnectOptions): string {
  return commands.connect(sharedDir, o);
}

export interface StopOutcome {
  /** the tool said the worker is stopped (exit 0 and "worker <name>: stopped (") */
  stopped: boolean;
  exitCode: number;
  /** what the tool printed, for Details only */
  output: string;
}

/** The tool's stop alone, through the shell (contract §7.1): the stop file, the job's own leaving, then one scancel if needed. */
export async function stopByShell(portal: PortalApi, sharedDir: string, name: string, sleep?: (ms: number) => Promise<void>): Promise<StopOutcome> {
  const line = commands.stop(sharedDir, name);
  const r = await withFloor(() => portal.shell(line, { timeoutMs: 90_000 }), sleep);
  return { stopped: r.exitCode === 0 && /^worker \S+: stopped \(/m.test(r.output), exitCode: r.exitCode, output: r.output };
}

/** The restricted marker, written by the tool (contract §7.2); it does not stop a running worker. */
export async function restrictByShell(portal: PortalApi, sharedDir: string, name: string, sleep?: (ms: number) => Promise<void>): Promise<{ marked: boolean; output: string }> {
  const r = await withFloor(() => portal.shell(commands.restrict(sharedDir, name), { timeoutMs: 45_000 }), sleep);
  return { marked: r.exitCode === 0 && /^worker \S+: (already )?marked restricted/m.test(r.output), output: r.output };
}

/** `worker status --json` (contract §6): one JSON line; asks the scheduler once, and only while the run is queued */
export async function statusByShell(portal: PortalApi, sharedDir: string, name: string, sleep?: (ms: number) => Promise<void>, still?: () => boolean | Promise<boolean>): Promise<StatusJson | undefined> {
  // the background asks this for itself: when its floor's wait is over, it asks only if the answer is still wanted
  let wanted = true;
  const r = await withFloor(
    async () => {
      if (still && !(await still())) {
        wanted = false;
        return { output: '', exitCode: -1, transcript: '', ms: 0 };
      }
      return portal.shell(commands.statusJson(sharedDir, name), { timeoutMs: 45_000 });
    },
    sleep,
  );
  if (!wanted) return undefined;
  return parseStatusJson(r.output);
}

/** the Remote Control answer alone (Details; connect --consent does the same inside connect) */
export async function recordConsentByShell(portal: PortalApi, sharedDir: string, installId: string, sleep?: (ms: number) => Promise<void>): Promise<boolean> {
  const r = await withFloor(() => portal.shell(commands.consentRecord(sharedDir, installId), { timeoutMs: 45_000 }), sleep);
  return r.exitCode === 0 && /^recorded in /m.test(r.output);
}

/** the states in which a job of the run is alive on the cluster; framework 10's "queued" is one (R2) */
const LIVE: WorkerState[] = ['queued', 'starting', 'need_login', 'need_consent', 'running', 'online'];
/** a heartbeat older than this means the job has gone (it writes every 30 s); a queued file has no heartbeat to keep */
export const STALE_AFTER_MS = 3 * 60_000;

/** Is a worker alive on the cluster, as far as its status file says? A queued file is live without a heartbeat (the job has not started). */
export function workerLive(status: StatusFile | undefined, now = Date.now()): boolean {
  if (!status) return false;
  if (!LIVE.includes(status.state)) return false;
  if (status.state === 'queued') return true;
  if (!status.updated_at) return true;
  const age = now - new Date(status.updated_at).getTime();
  return !Number.isFinite(age) || age < STALE_AFTER_MS;
}
