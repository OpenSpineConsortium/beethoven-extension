// Starting and stopping the worker, in one place, so the panel's buttons and the background's
// "start when my portal opens" setting do exactly the same thing. Everything goes through the
// portal client the caller hands in: the panel passes the relayed one, the background its own.
//
// A start is one shell line (`hpcworker worker start`), which the chokepoint classes as a
// scheduler call: once a minute, refused otherwise. A stop is the framework's stop file, touched
// through the Files app (no floor: it is a write), and then the tool's own stop line once if the
// scheduler floor allows it; the job notices the file within seconds, leaves on its own, writes
// stop.done and ends its own chain, so the extra line is belt and braces, never the mechanism.
import { FloorError } from './audit';
import { commands, parseJobId, paths, profileRestricts, siteFrom, stateDirFrom, type StatusFile, type WorkerState } from './contract';
import { ackCovers, ackSubject, type Acknowledgement } from './disclosure';
import type { PortalApi } from './portal';

export interface ClusterContext {
  home: string;
  user: string;
  stateDir: string;
  site?: string;
  profile?: string;
}

/** home, username, the profile's state directory and site: what a start, a stop or a probe needs to know */
export async function clusterContext(portal: PortalApi): Promise<ClusterContext> {
  const home = await portal.home();
  const user = (await portal.whoAmI()) ?? home.split('/').filter(Boolean).pop() ?? '';
  const profile = await portal.readFileIfExists(paths.profile(home));
  return { home, user, stateDir: stateDirFrom(profile, { home, user }), site: siteFrom(profile), profile };
}

/**
 * Why the named workspace must not host a worker, or undefined when it may: the student's own
 * `.restricted` marker in the workspace, or a profile that marks it so.
 */
export async function restrictedReason(portal: PortalApi, ctx: ClusterContext, workerName: string): Promise<string | undefined> {
  if (profileRestricts(ctx.profile, workerName)) return `the site profile marks the workspace of worker "${workerName}" restricted`;
  const marker = paths.restrictedMarker(ctx.stateDir, workerName);
  const present = await portal.readFileIfExists(marker);
  if (present !== undefined) return `the workspace ${paths.workspace(ctx.stateDir, workerName)} is marked restricted (it holds a ${marker.split('/').pop()} file); the worker will not start there`;
  return undefined;
}

export interface StartOpts {
  name: string;
  permissionMode: string;
  /** the site name to fall back on when the profile names none */
  site: string;
  /** this session's acknowledgement; the start is refused without one for this worker */
  ack: Acknowledgement | undefined;
}

export interface StartOutcome {
  job: string;
  site: string;
  stateDir: string;
  output: string;
  /** the tool found the worker's job already pending or running and submitted nothing */
  alreadyRunning: boolean;
}

export async function startWorker(portal: PortalApi, o: StartOpts): Promise<StartOutcome> {
  if (!ackCovers(o.ack, ackSubject(o.name))) throw new Error(`Before a start: read "Where your work goes" and make the data statement for worker "${o.name}", this session.`);
  const ctx = await clusterContext(portal);
  if (!ctx.profile) throw new Error('hpcworker is not installed yet (no ~/.hpcworker/profile.json): choose "Set up the cluster" first.');
  const why = await restrictedReason(portal, ctx, o.name);
  if (why) throw new Error(`Not started: ${why}.`);
  const r = await portal.shell(commands.workerStart(o.name, o.permissionMode), { timeoutMs: 90_000 });
  const job = parseJobId(r.output);
  if (!job) throw new Error(`the start command printed no job id (exit ${r.exitCode}); see its output`);
  return { job, site: ctx.site ?? o.site, stateDir: ctx.stateDir, output: r.output, alreadyRunning: /already has job/i.test(r.output) };
}

export interface StopOutcome {
  /** the stop file was written through the Files app */
  stopFile: boolean;
  /** the tool's own stop line ran (exit code and what it printed), when the scheduler floor allowed it */
  toolStop?: { exitCode: number; output: string };
  /** what to tell the student, in plain words */
  note: string;
}

export async function stopWorker(portal: PortalApi, state: { stateDir: string; run: string; job: string }): Promise<StopOutcome> {
  let stopFile = false;
  let note = '';
  try {
    await portal.touch(paths.stop(state.stateDir, state.run), state.job);
    stopFile = true;
    note = 'The stop file is written; the job ends itself within a few seconds and its chain with it.';
  } catch (e) {
    note = `The stop file could not be written (${(e as Error).message}).`;
  }
  try {
    const r = await portal.shell(commands.workerStop(state.run), { timeoutMs: 60_000, job: state.job });
    note += ` The tool's stop ran (exit ${r.exitCode}).`;
    return { stopFile, toolStop: { exitCode: r.exitCode, output: r.output }, note };
  } catch (e) {
    if (e instanceof FloorError || (e as Error).name === 'FloorError') {
      note += stopFile ? ` The scheduler was asked less than a minute ago, so it was not asked again; the stop file is enough.` : ` The scheduler was asked less than a minute ago; press Stop again in ${Math.ceil(((e as FloorError).waitMs ?? 60_000) / 1000)} s.`;
    } else note += ` The tool's stop did not run (${(e as Error).message}).`;
    if (!stopFile) throw new Error(note);
    return { stopFile, note };
  }
}

const LIVE: WorkerState[] = ['starting', 'need_login', 'need_consent', 'running', 'online'];
/** a heartbeat older than this means the job has gone (it writes every 30 s) */
export const STALE_AFTER_MS = 3 * 60_000;

/** Is a worker alive on the cluster, as far as its status file says? */
export function workerLive(status: StatusFile | undefined, now = Date.now()): boolean {
  if (!status) return false;
  if (!LIVE.includes(status.state)) return false;
  if (!status.updated_at) return true;
  const age = now - new Date(status.updated_at).getTime();
  return !Number.isFinite(age) || age < STALE_AFTER_MS;
}
