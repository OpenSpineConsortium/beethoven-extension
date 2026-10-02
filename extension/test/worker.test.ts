// The worker's verbs through a fake portal (11.0.0): every write is the lab's tool's own verb typed
// through the shell, never a Files write (the dashboard's Rails origin check would refuse a PUT from
// chrome-extension://). Connect is one line; Stop is `worker stop` alone; Mark restricted is `worker
// restrict`; the scheduler's reason comes from `worker status --json`. A refused floor is waited out
// silently and retried, never shown. And a queued worker is live.
import { describe, expect, it } from 'vitest';
import { FloorError } from '../src/core/audit';
import { commands, paths } from '../src/core/contract';
import type { PortalApi } from '../src/core/portal';
import { clusterContext, connectLine, recordConsentByShell, restrictByShell, restrictedReason, statusByShell, stopByShell, withFloor, workerLive } from '../src/core/worker';

const STATE = '/rs/rs_grp_oschome/ab1234/hpcworker';
const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const PROFILE = JSON.stringify({ site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker' });

function fake(o: { output?: string | ((cmd: string) => string); exitCode?: number; floors?: number; files?: string[] } = {}) {
  const typed: string[] = [];
  const writes: string[] = [];
  let floors = o.floors ?? 0;
  const files = new Set(o.files ?? []);
  const p = {
    home: async () => '/home/ab1234',
    whoAmI: async () => 'ab1234',
    readFileIfExists: async (path: string) => (path === '/home/ab1234/.hpcworker/profile.json' ? PROFILE : undefined),
    exists: async (path: string) => files.has(path),
    // any write through the Files app is a defect in 11.0.0
    writeFile: async (path: string) => void writes.push(`write ${path}`),
    touch: async (path: string) => void writes.push(`touch ${path}`),
    mkdir: async (path: string) => void writes.push(`mkdir ${path}`),
    cancelJob: async (c: string, id: string) => void writes.push(`cancel ${c} ${id}`),
    shell: async (command: string) => {
      if (floors > 0) {
        floors--;
        throw new FloorError('scheduler', 1_000);
      }
      typed.push(command);
      const output = typeof o.output === 'function' ? o.output(command) : (o.output ?? '');
      return { output, exitCode: o.exitCode ?? 0, transcript: '', ms: 10 };
    },
  } as unknown as PortalApi;
  return { p, typed, writes };
}

const noSleep = async () => undefined;

describe('the worker through the shell', () => {
  it('connect is one line, built from checked parts', () => {
    expect(connectLine(SHARED, { name: 'worker', site: 'wayne', installId: '0123456789abcdef0123456789abcdef', login: 'auto', permissionMode: 'default', chain: true })).toBe(commands.connect(SHARED, { name: 'worker', site: 'wayne', installId: '0123456789abcdef0123456789abcdef', login: 'auto', permissionMode: 'default', chain: true }));
    expect(() => connectLine(SHARED, { name: '../x', site: 'wayne', login: 'auto', permissionMode: 'default', chain: true })).toThrow();
  });

  it('Stop is `worker stop` alone, typed through the shell; no stop file is written through the Files app', async () => {
    const { p, typed, writes } = fake({ output: 'worker worker: stopped (the job left on its own; the chain ended)' });
    const out = await stopByShell(p, SHARED, 'worker', noSleep);
    expect(typed).toEqual([`bash '${SHARED}/bin/hpcworker' worker stop --name 'worker'`]);
    expect(writes).toEqual([]);
    expect(out).toMatchObject({ stopped: true, exitCode: 0 });
    const notStopped = fake({ output: 'hpcworker: no worker named worker', exitCode: 1 });
    expect((await stopByShell(notStopped.p, SHARED, 'worker', noSleep)).stopped).toBe(false);
  });

  it('a refused floor is waited out and retried silently, at most twice, then said', async () => {
    const once = fake({ floors: 1, output: 'worker worker: stopped (x)' });
    expect((await stopByShell(once.p, SHARED, 'worker', noSleep)).stopped).toBe(true);
    expect(once.typed).toHaveLength(1);
    const always = fake({ floors: 5 });
    await expect(stopByShell(always.p, SHARED, 'worker', noSleep)).rejects.toBeInstanceOf(FloorError);
    const slept: number[] = [];
    await withFloor(
      (() => {
        let n = 0;
        return async () => {
          if (n++ === 0) throw new FloorError('scheduler', 41_000);
          return 'ok';
        };
      })(),
      async (ms) => void slept.push(ms),
    );
    expect(slept).toEqual([41_250]);
  });

  it('Mark restricted is `worker restrict`, through the shell', async () => {
    const { p, typed, writes } = fake({ output: 'worker worker: marked restricted (/x/.restricted); it will not start there until the marker is removed' });
    expect((await restrictByShell(p, SHARED, 'worker', noSleep)).marked).toBe(true);
    expect(typed).toEqual([`bash '${SHARED}/bin/hpcworker' worker restrict --name 'worker'`]);
    expect(writes).toEqual([]);
    const already = fake({ output: 'worker worker: already marked restricted (/x/.restricted)' });
    expect((await restrictByShell(already.p, SHARED, 'worker', noSleep)).marked).toBe(true);
  });

  it('the scheduler\'s reason comes from `worker status --json`, one line among the shell\'s noise', async () => {
    const json = { v: 1, run: 'worker', job: '40501234', next_job: '', state_dir: STATE, status: { state: 'queued', job: '40501234' }, connection: null, scheduler: { state: 'PENDING', reason: 'Priority', expected_start: '', node: '', checked_at: '2026-10-01T12:58:03Z' }, line: 'Your worker is in line for a computer (14 min so far).' };
    const { p, typed } = fake({ output: `Last login: x\n${JSON.stringify(json)}\n` });
    const out = await statusByShell(p, SHARED, 'worker', noSleep);
    expect(typed).toEqual([`bash '${SHARED}/bin/hpcworker' worker status --name 'worker' --json`]);
    expect(out?.scheduler?.reason).toBe('Priority');
    expect(out?.status?.state).toBe('queued');
  });

  it('the Remote Control answer alone (Details) is `claude consent --record`', async () => {
    const { p, typed } = fake({ output: 'recorded in /home/ab1234/.hpcworker/consent (fallback marker): your workers may now host Remote Control' });
    expect(await recordConsentByShell(p, SHARED, '0123456789abcdef0123456789abcdef', noSleep)).toBe(true);
    expect(typed).toEqual([`bash '${SHARED}/bin/hpcworker' claude consent --record '0123456789abcdef0123456789abcdef'`]);
  });

  it('reads the cluster context and a restricted marker from listings, never a download', async () => {
    const { p } = fake({ files: [paths.restrictedMarker(STATE, 'worker')] });
    const ctx = await clusterContext(p);
    expect(ctx).toMatchObject({ home: '/home/ab1234', user: 'ab1234', stateDir: STATE, site: 'wayne' });
    expect(await restrictedReason(p, ctx, 'worker')).toMatch(/\.restricted file/);
    expect(await restrictedReason(p, ctx, 'other')).toBeUndefined();
  });

  it('knows a live worker: queued is live with no heartbeat; others need one under 3 minutes', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    expect(workerLive(undefined, now)).toBe(false);
    expect(workerLive({ state: 'queued', updated_at: '2026-10-01T10:00:00Z' }, now)).toBe(true);
    expect(workerLive({ state: 'online', updated_at: '2026-10-01T11:59:30Z' }, now)).toBe(true);
    expect(workerLive({ state: 'starting' }, now)).toBe(true);
    expect(workerLive({ state: 'online', updated_at: '2026-10-01T11:50:00Z' }, now)).toBe(false);
    expect(workerLive({ state: 'stopped', updated_at: '2026-10-01T11:59:59Z' }, now)).toBe(false);
    expect(workerLive({ state: 'preempted', updated_at: '2026-10-01T11:59:59Z' }, now)).toBe(false);
    expect(workerLive({ state: 'error' }, now)).toBe(false);
  });
});
