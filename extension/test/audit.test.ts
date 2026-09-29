// The chokepoint: every request leaves a record, the floors hold and each class keeps its own
// clock, commands are classed by what they cost the cluster, tokens never reach the log, a
// withdrawn version sends no commands, and a cleared log keeps the clocks.
import { describe, expect, it } from 'vitest';
import { Audit, AUDIT_KEY, classifyCommand, clearRecordsKeepingClocks, FloorError, RevokedError, type AuditRecord } from '../src/core/audit';
import { commands } from '../src/core/contract';
import { auditEndpoint, redact } from '../src/core/redact';
import { memoryKV } from './helpers';

function clockAudit(opts: { maxRecords?: number; revoked?: boolean } = {}) {
  const kv = memoryKV();
  let t = 1_790_000_000_000;
  const audit = new Audit(kv, { now: () => t, maxRecords: opts.maxRecords, revocation: async () => ({ revoked: !!opts.revoked, message: 'test withdrawal' }) });
  return { kv, audit, tick: (ms: number) => (t += ms) };
}
const ok = <T>(result: T, bytes = 10, outcome = '200') => async () => ({ result, bytes, outcome });

describe('audit chokepoint', () => {
  it('appends {ts, method, endpoint, job, bytes, outcome} for every call, including failures', async () => {
    const { audit } = clockAudit();
    const v = await audit.request({ method: 'GET', endpoint: 'https://ood.example/pun/sys/dashboard/', cls: 'dashboard' }, ok('x', 123, '200 signed in'));
    expect(v).toBe('x');
    await expect(audit.request({ method: 'PUT', endpoint: '/pun/sys/dashboard/files/fs/home/a/b', cls: 'files', job: '4242', mutates: true }, async () => { throw new Error('boom 500'); })).rejects.toThrow('boom 500');
    const r = await audit.records();
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ method: 'GET', endpoint: '/pun/sys/dashboard/', bytes: 123, outcome: '200 signed in' });
    expect(r[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r[1]).toMatchObject({ method: 'PUT', endpoint: '/pun/sys/dashboard/files/fs/home/a/b', job: '4242', bytes: 0, outcome: 'error: boom 500' });
  });

  it('holds the 60 s floor for scheduler-facing calls and records the refusal', async () => {
    const { audit, tick } = clockAudit();
    await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'scheduler' }, ok(1));
    tick(20_000);
    let err: unknown;
    try {
      await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'scheduler' }, ok(2));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FloorError);
    expect((err as FloorError).waitMs).toBe(40_000);
    expect((err as FloorError).message).toMatch(/the cluster scheduler was asked less than 60 s ago; wait 40 s/);
    expect(await audit.waitFor('scheduler')).toBe(40_000);
    // the shell class has its own clock; files are not held by the scheduler floor
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/files/fs/home', cls: 'files' }, ok(3));
    tick(40_000);
    expect(await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'scheduler' }, ok(4))).toBe(4);
    const outcomes = (await audit.records()).map((r) => r.outcome);
    expect(outcomes.some((o) => /refused: floor \(40 s left\)/.test(o))).toBe(true);
  });

  it('keeps one clock per class: a submit, a job-list read and a discovery back to back are all admitted', async () => {
    const { audit, tick } = clockAudit();
    await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'discover' }, ok(1));
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'jobs' }, ok(2));
    await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'scheduler' }, ok(3));
    await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'shell' }, ok(4));
    // each of the four is now on its own 60 s (15 s for the shell) clock
    await expect(audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'jobs' }, ok(5))).rejects.toMatchObject({ cls: 'jobs' });
    await expect(audit.request({ method: 'DELETE', endpoint: '/pun/sys/dashboard/activejobs?cluster=x&pbsid=1', cls: 'jobs' }, ok(5))).rejects.toBeInstanceOf(FloorError);
    await expect(audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'discover' }, ok(6))).rejects.toMatchObject({ cls: 'discover' });
    tick(16_000);
    expect(await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'shell' }, ok(7))).toBe(7);
    expect(await audit.waitFor('jobs')).toBe(44_000);
    expect(await audit.waitFor('files')).toBe(0);
  });

  it('classes a command line by what it costs: submit and cancel are scheduler, the discovery batch is discover, the rest is shell', () => {
    expect(classifyCommand(commands.workerStart('worker', 'default'))).toBe('scheduler');
    expect(classifyCommand(commands.workerStop('worker'))).toBe('scheduler');
    expect(classifyCommand(commands.probe())).toBe('scheduler');
    // the sign-in sitting is an srun on the login node: the scheduler clock, so two "Try again" within a minute wait
    expect(classifyCommand(commands.claudeLoginPlain)).toBe('scheduler');
    expect(classifyCommand(commands.claudeLogin)).toBe('scheduler');
    expect(classifyCommand('sbatch --parsable job.sbatch')).toBe('scheduler');
    expect(classifyCommand('scancel 123')).toBe('scheduler');
    // the discovery's fallback contains one sinfo: a scheduler read, on its own clock, never the submit clock
    expect(classifyCommand(commands.discover())).toBe('discover');
    expect(classifyCommand(commands.diag())).toBe('discover');
    expect(classifyCommand('squeue -h -j 1')).toBe('discover');
    expect(classifyCommand(commands.install('wayne'))).toBe('shell');
    expect(classifyCommand(commands.installShared('/rs/rs_grp_oschome/shared/ashley/hpcworker/current', 'wayne'))).toBe('shell');
    expect(classifyCommand('true')).toBe('shell');
    expect(classifyCommand('echo hello')).toBe('shell');
  });

  it('never stores a token: csrf query values, signed tokens, sk-ant keys and bearer tokens are redacted', async () => {
    const { audit } = clockAudit();
    await audit.request({ method: 'WS', endpoint: 'wss://ood.example/pun/sys/shell/ssh/default?csrf=AbC-123_xyz', cls: 'shell' }, ok(1, 5, 'exit 0; printed ASHLEY1.eyJ2IjoxfQ.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl and sk-ant-api03-SECRET and Bearer eyJhbGciOi'));
    const [r] = (await audit.records()) as AuditRecord[];
    expect(r!.endpoint).toBe('/pun/sys/shell/ssh/default?csrf=[redacted]');
    expect(r!.outcome).not.toMatch(/ASHLEY1\.|sk-ant-api03-SECRET|eyJhbGciOi/);
    expect(r!.outcome).toMatch(/\[signed-token\]/);
    expect(redact('list ASHLEYREV1.eyJ2IjoxfQ.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl ok')).toBe('list [signed-token] ok');
    expect(redact('token=abc123 password: hunter2 apikey=zz')).toBe('token=[redacted] password: [redacted] apikey=[redacted]');
    expect(redact('job 123456 on node01')).toBe('job 123456 on node01');
    expect(auditEndpoint('/pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user')).toBe('/pun/sys/dashboard/activejobs.json?jobcluster=all&jobfilter=user');
  });

  it('is bounded: only the newest records are kept', async () => {
    const { audit, kv } = clockAudit({ maxRecords: 5 });
    for (let i = 0; i < 12; i++) await audit.request({ method: 'GET', endpoint: `/f/${i}`, cls: 'files' }, ok(i));
    const r = await audit.records();
    expect(r).toHaveLength(5);
    expect(r.map((x) => x.endpoint)).toEqual(['/f/7', '/f/8', '/f/9', '/f/10', '/f/11']);
    expect((kv.store.get(AUDIT_KEY) as { v: number }).v).toBe(1);
  });

  it('a withdrawn version refuses commands but still reads status', async () => {
    const { audit } = clockAudit({ revoked: true });
    expect(await audit.request({ method: 'GET', endpoint: '/status', cls: 'files' }, ok('read'))).toBe('read');
    await expect(audit.request({ method: 'PUT', endpoint: '/write', cls: 'files', mutates: true }, ok('no'))).rejects.toBeInstanceOf(RevokedError);
    const r = await audit.records();
    expect(r.at(-1)?.outcome).toBe('refused: this version has been withdrawn');
  });

  it('exports JSON lines and clears without forgetting the floor, from the chokepoint and from a page', async () => {
    const { audit, kv } = clockAudit();
    await audit.request({ method: 'WS', endpoint: '/pun/sys/shell/ssh/default', cls: 'scheduler' }, ok(1));
    const text = await audit.exportText();
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(text.trim())).toMatchObject({ method: 'WS' });
    await audit.clear();
    expect(await audit.records()).toHaveLength(0);
    expect(await audit.waitFor('scheduler')).toBe(60_000);
    // the panel's fallback when the page script is away: the same rule, straight on storage
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/files/fs/h', cls: 'files' }, ok(2));
    await clearRecordsKeepingClocks(kv);
    expect(await audit.records()).toHaveLength(0);
    expect(await audit.waitFor('scheduler')).toBe(60_000);
  });
});
