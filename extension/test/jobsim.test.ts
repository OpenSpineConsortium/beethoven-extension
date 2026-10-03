// 13.0.0 (the review of the direct-way fix, m3): the mock cluster's worker jobs (mock-ood/lib/jobsim.mjs)
// heartbeat updated_at every 30 s in every live state, as the real job's main loop does
// (framework/jobs/worker.sbatch.tpl: write_status every HEARTBEAT_S). Only "online" did before, so a run on
// the reviewers' mock that sat in "starting", "need_login" or "need_consent" read as stale (R12) after three
// minutes, and since the direct-way fix a stale run found in the folder offers Connect.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { advance } from '../mock-ood/lib/jobsim.mjs';

const S = 1000;
const T0 = Date.parse('2026-10-02T20:00:00Z');
const at = (s: number) => new Date(T0 + s * S).toISOString().replace(/\.\d{3}Z$/, 'Z');

describe('the mock job simulator: a heartbeat in every live state', () => {
  let home: string;
  let rd: string;
  beforeEach(() => {
    home = mkdtempSync(path.join(os.tmpdir(), 'jobsim-'));
    rd = path.join(home, 'state', 'worker');
    mkdirSync(rd, { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  /** one worker in line, as lib/tool.mjs start leaves it, its time in line over at T0 */
  const seed = (sim: Record<string, unknown>) => {
    mkdirSync(path.join(home, '.mock-ood'), { recursive: true });
    const job = {
      cluster: 'mock',
      status: 'queued',
      pbsid: '100001',
      jobname: 'hpcw_worker',
      username: 'st1234',
      nodes: [],
      sim: {
        kind: 'worker', run: 'worker', rd, site: 'mock', title: 'Mock grid', home, user: 'st1234', submitted_at: T0 - 60 * S, start_at: T0, start_s: 0,
        reason: 'Priority', expected: 'estimate', phase: 'pending', renew_s: 8 * 3600, renew_queue_s: 10, chain: false, renewal: false, permission_mode: 'default',
        claude_default: true, consent_default: true, abandon_s: 3600, reconnect_after_s: 0, env_url: 'https://claude.ai/code?environment=env_01Mock', env_id: 'env_01Mock',
        session: 'node01-mock', requested: 'Mock grid', workspaceShown: '/x/ws', rcLogShown: '/x/rc.log', tokenShown: '/x/job.token',
        ...sim,
      },
    };
    writeFileSync(path.join(home, '.mock-ood', 'jobs.json'), JSON.stringify([job]));
  };
  const status = () => JSON.parse(readFileSync(path.join(rd, 'status.json'), 'utf8')) as { state: string; updated_at: string; stop_reason?: string };
  const tick = (s: number) => advance(home, { now: T0 + s * S });

  it('"starting" on a cold node: the file is written again every 30 s until Claude Code answers', async () => {
    seed({ start_s: 600 });
    await tick(0);
    expect(status()).toMatchObject({ state: 'starting', updated_at: at(0) });
    await tick(20);
    expect(status().updated_at).toBe(at(0));
    await tick(31);
    expect(status()).toMatchObject({ state: 'starting', updated_at: at(31) });
    await tick(62);
    expect(status()).toMatchObject({ state: 'starting', updated_at: at(62) });
  });

  it('"need_login" and "need_consent": the waiting file is heartbeated too', async () => {
    seed({ claude_default: false });
    await tick(0);
    await tick(1);
    expect(status()).toMatchObject({ state: 'need_login', updated_at: at(1) });
    await tick(32);
    expect(status()).toMatchObject({ state: 'need_login', updated_at: at(32) });
    rmSync(path.join(home, '.mock-ood'), { recursive: true, force: true });
    seed({ consent_default: false });
    await tick(0);
    await tick(1);
    expect(status()).toMatchObject({ state: 'need_consent', updated_at: at(1) });
    await tick(32);
    expect(status()).toMatchObject({ state: 'need_consent', updated_at: at(32) });
  });

  it('"online" as before, every 30 s; a stopped job writes nothing more', async () => {
    seed({});
    await tick(0);
    await tick(1);
    expect(status()).toMatchObject({ state: 'online', updated_at: at(1) });
    await tick(31);
    expect(status().updated_at).toBe(at(31));
    await tick(45);
    expect(status().updated_at).toBe(at(31));
    writeFileSync(path.join(rd, 'stop'), '');
    await tick(50);
    expect(status()).toMatchObject({ state: 'stopped', stop_reason: 'request', updated_at: at(50) });
    await tick(120);
    expect(status().updated_at).toBe(at(50));
  });
});
