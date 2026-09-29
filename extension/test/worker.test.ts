// Starting and stopping through a fake portal: the refusals before anything is typed (no
// statement, no tool, a restricted workspace), the one line a start types, and the stop path
// (stop file first, the tool's line only when the scheduler floor allows it).
import { describe, expect, it } from 'vitest';
import { FloorError } from '../src/core/audit';
import { commands, paths } from '../src/core/contract';
import { ackSubject, DATA_CLASSIFICATION_STATEMENT, type Acknowledgement } from '../src/core/disclosure';
import type { PortalApi } from '../src/core/portal';
import { restrictedReason, startWorker, stopWorker, workerLive, clusterContext } from '../src/core/worker';

const STATE = '/rs/rs_grp_oschome/ab1234/hpcworker';
const PROFILE = JSON.stringify({ site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker' });
const ACK: Acknowledgement = { v: 1, work_dir: ackSubject('worker'), disclosure_at: 'x', classification_at: 'x', statement: DATA_CLASSIFICATION_STATEMENT };

function fake(o: { profile?: string | false; files?: string[]; shellOutput?: string; shellError?: Error; floorScheduler?: boolean } = {}) {
  const files = new Set<string>(o.files ?? []);
  const typed: string[] = [];
  const touched: string[] = [];
  const p = {
    home: async () => '/home/ab1234',
    whoAmI: async () => 'ab1234',
    readFileIfExists: async (path: string) => (path === '/home/ab1234/.hpcworker/profile.json' ? (o.profile === false ? undefined : o.profile ?? PROFILE) : files.has(path) ? '' : undefined),
    touch: async (path: string) => void touched.push(path),
    shell: async (command: string) => {
      typed.push(command);
      if (o.shellError) throw o.shellError;
      if (o.floorScheduler && /worker (start|stop)/.test(command)) throw new FloorError('scheduler', 41_000);
      return { output: o.shellOutput ?? 'worker worker submitted as job 4243102 (reqp/requeue, 8 h). When it runs...', exitCode: 0, transcript: '', ms: 1200 };
    },
  } as unknown as PortalApi;
  return { p, typed, touched };
}

describe('worker start and stop', () => {
  it('reads the cluster context from the profile through the portal', async () => {
    const { p } = fake();
    const ctx = await clusterContext(p);
    expect(ctx).toMatchObject({ home: '/home/ab1234', user: 'ab1234', stateDir: STATE, site: 'wayne' });
  });

  it('refuses a start without the statement, without the tool, or in a restricted workspace, typing nothing', async () => {
    const { p, typed } = fake();
    await expect(startWorker(p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: undefined })).rejects.toThrow(/make the data statement/);
    await expect(startWorker(p, { name: 'thesis', permissionMode: 'default', site: 'wayne', ack: ACK })).rejects.toThrow(/worker "thesis"/);
    const noTool = fake({ profile: false });
    await expect(startWorker(noTool.p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: ACK })).rejects.toThrow(/not installed yet/);
    const marked = fake({ files: [paths.restrictedMarker(STATE, 'worker')] });
    await expect(startWorker(marked.p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: ACK })).rejects.toThrow(/marked restricted/);
    expect(await restrictedReason(marked.p, await clusterContext(marked.p), 'worker')).toMatch(/\.restricted file/);
    expect(await restrictedReason(marked.p, await clusterContext(marked.p), 'other')).toBeUndefined();
    const byProfile = fake({ profile: JSON.stringify({ site: 'wayne', shared_state_dir: STATE, restricted_workspaces: ['worker'] }) });
    await expect(startWorker(byProfile.p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: ACK })).rejects.toThrow(/site profile marks/);
    expect(typed).toEqual([]);
    expect(marked.typed).toEqual([]);
  });

  it('a start types exactly the tool\'s line and reads the job id and site back', async () => {
    const { p, typed } = fake();
    const out = await startWorker(p, { name: 'worker', permissionMode: 'acceptEdits', site: 'fallback', ack: ACK });
    expect(typed).toEqual([commands.workerStart('worker', 'acceptEdits')]);
    expect(out).toMatchObject({ job: '4243102', site: 'wayne', stateDir: STATE, alreadyRunning: false });
    const again = fake({ shellOutput: 'worker worker already has job 4243102 (RUNNING on asx15); nothing submitted' });
    expect((await startWorker(again.p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: ACK })).alreadyRunning).toBe(true);
    const bad = fake({ shellOutput: 'hpcworker: the scheduler refused the job: invalid partition' });
    await expect(startWorker(bad.p, { name: 'worker', permissionMode: 'default', site: 'wayne', ack: ACK })).rejects.toThrow(/printed no job id/);
  });

  it('a stop touches the stop file first, then runs the tool\'s stop once; a held scheduler clock leaves the file to do the work', async () => {
    const { p, typed, touched } = fake({ shellOutput: 'worker worker: stopped (the job left on its own)' });
    const out = await stopWorker(p, { stateDir: STATE, run: 'worker', job: '4243102' });
    expect(touched).toEqual([paths.stop(STATE, 'worker')]);
    expect(typed).toEqual([commands.workerStop('worker')]);
    expect(out.stopFile).toBe(true);
    expect(out.toolStop?.exitCode).toBe(0);
    const held = fake({ floorScheduler: true });
    const o2 = await stopWorker(held.p, { stateDir: STATE, run: 'worker', job: '4243102' });
    expect(held.touched).toHaveLength(1);
    expect(o2.stopFile).toBe(true);
    expect(o2.toolStop).toBeUndefined();
    expect(o2.note).toMatch(/stop file is enough/);
  });

  it('when neither the file nor the line can be sent, the stop fails and says why', async () => {
    const { p } = fake({ shellError: new Error('the portal tab did not answer') });
    (p as { touch: unknown }).touch = async () => {
      throw new Error('403 not allowed');
    };
    await expect(stopWorker(p, { stateDir: STATE, run: 'worker', job: '1' })).rejects.toThrow(/could not be written.*did not answer/s);
  });

  it('knows a live worker from a finished or stale one', () => {
    const now = Date.parse('2026-09-28T12:00:00Z');
    expect(workerLive(undefined, now)).toBe(false);
    expect(workerLive({ state: 'online', updated_at: '2026-09-28T11:59:30Z' }, now)).toBe(true);
    expect(workerLive({ state: 'starting' }, now)).toBe(true);
    expect(workerLive({ state: 'need_consent', updated_at: '2026-09-28T11:58:00Z' }, now)).toBe(true);
    expect(workerLive({ state: 'online', updated_at: '2026-09-28T11:50:00Z' }, now)).toBe(false);
    expect(workerLive({ state: 'stopped', updated_at: '2026-09-28T11:59:59Z' }, now)).toBe(false);
    expect(workerLive({ state: 'preempted', updated_at: '2026-09-28T11:59:59Z' }, now)).toBe(false);
    expect(workerLive({ state: 'error' }, now)).toBe(false);
  });
});
