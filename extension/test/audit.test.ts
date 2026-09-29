// The chokepoint: every request leaves a record, the floors hold, tokens never reach the log,
// a withdrawn version sends no commands.
import { describe, expect, it } from 'vitest';
import { Audit, AUDIT_KEY, FloorError, RevokedError, type AuditRecord } from '../src/core/audit';
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
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'scheduler' }, ok(1));
    tick(20_000);
    let err: unknown;
    try {
      await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'scheduler' }, ok(2));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FloorError);
    expect((err as FloorError).waitMs).toBe(40_000);
    expect(await audit.waitFor('scheduler')).toBe(40_000);
    // the shell class has its own clock; files are not held by the scheduler floor
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/files/fs/home', cls: 'files' }, ok(3));
    tick(40_000);
    expect(await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'scheduler' }, ok(4))).toBe(4);
    const outcomes = (await audit.records()).map((r) => r.outcome);
    expect(outcomes.some((o) => /refused: floor \(40 s left\)/.test(o))).toBe(true);
  });

  it('never stores a token: csrf query values, licence keys, sk-ant keys and bearer tokens are redacted', async () => {
    const { audit } = clockAudit();
    await audit.request({ method: 'WS', endpoint: 'wss://ood.example/pun/sys/shell/ssh/default?csrf=AbC-123_xyz', cls: 'shell' }, ok(1, 5, 'exit 0; printed ASHLEY1.eyJ2IjoxfQ.c2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJlc2lnbmF0dXJl and sk-ant-api03-SECRET and Bearer eyJhbGciOi'));
    const [r] = (await audit.records()) as AuditRecord[];
    expect(r!.endpoint).toBe('/pun/sys/shell/ssh/default?csrf=[redacted]');
    expect(r!.outcome).not.toMatch(/ASHLEY1\.|sk-ant-api03-SECRET|eyJhbGciOi/);
    expect(r!.outcome).toMatch(/\[licence-key\]/);
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

  it('exports JSON lines and clears without forgetting the floor', async () => {
    const { audit } = clockAudit();
    await audit.request({ method: 'GET', endpoint: '/pun/sys/dashboard/activejobs.json', cls: 'scheduler' }, ok(1));
    const text = await audit.exportText();
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(text.trim())).toMatchObject({ method: 'GET' });
    await audit.clear();
    expect(await audit.records()).toHaveLength(0);
    expect(await audit.waitFor('scheduler')).toBe(60_000);
  });
});
