// The one chokepoint every portal request passes through. It does three things and nothing else:
// appends an audit record {ts, method, endpoint, job, bytes, outcome} to a bounded on-device log,
// enforces a per-endpoint-class floor (60 s for anything that reaches the scheduler, so a clicked
// button can never become a polling loop the cluster's operators would object to), and refuses to
// send commands when a verified kill-list has withdrawn this version. The log is the floor's
// memory: the last attempt of each class is kept beside the records, so a reload of the portal
// tab does not reset the clock.
//
// Storage is passed in (browser.storage.local in the content script, a Map in tests). Records are
// redacted on the way in, never on the way out.
import { auditEndpoint, redact } from './redact';

export interface AuditRecord {
  /** UTC time */
  ts: string;
  method: string;
  endpoint: string;
  /** the job id the call concerned, when there is one */
  job?: string;
  /** bytes sent plus received, as far as the caller could count them */
  bytes: number;
  outcome: string;
}

/** Which floor applies. `scheduler` is anything that reaches Slurm (or PBS, or LSF). */
export type EndpointClass = 'dashboard' | 'files' | 'scheduler' | 'shell' | 'probe' | 'vendor';

// The report's floors: a minute for anything scheduler-facing, and a login-node shell no more
// often than every 15 s. File reads and writes have no floor of their own (an upload is a burst
// of PUTs); their pace is set by the once-a-minute alarm that asks for them.
export const FLOORS_MS: Record<EndpointClass, number> = {
  scheduler: 60_000,
  shell: 15_000,
  files: 0,
  dashboard: 0,
  probe: 0,
  vendor: 0,
};

/** commands that reach the scheduler when run through the bootstrap shell */
export const SCHEDULER_COMMAND = /\b(sbatch|squeue|scancel|sacct|sinfo|scontrol|srun|qsub|qstat|qdel|bsub|bjobs|bkill|condor_submit|condor_q|condor_rm|hpcworker\s+(start|stop|probe|restart))\b/;

export const AUDIT_KEY = 'bridge.audit';
export const DEFAULT_MAX_RECORDS = 2000;

export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

interface AuditState {
  v: 1;
  records: AuditRecord[];
  /** last attempt per class, ms since epoch */
  last: Partial<Record<EndpointClass, number>>;
}

export class FloorError extends Error {
  constructor(
    public readonly cls: EndpointClass,
    public readonly waitMs: number,
  ) {
    super(`too soon: the ${cls === 'scheduler' ? 'cluster scheduler' : 'login-node shell'} was asked less than ${Math.round(FLOORS_MS[cls] / 1000)} s ago; wait ${Math.ceil(waitMs / 1000)} s`);
    this.name = 'FloorError';
  }
}

export class RevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RevokedError';
  }
}

export interface RequestMeta {
  method: string;
  /** the full URL or path; reduced and redacted before it is stored */
  endpoint: string;
  cls: EndpointClass;
  job?: string;
  /** true for anything that changes state on the cluster (writes, submissions, cancels, shell commands) */
  mutates?: boolean;
}

export interface RequestOutcome<T> {
  result: T;
  bytes: number;
  outcome: string;
}

export interface AuditOpts {
  now?: () => number;
  maxRecords?: number;
  /** consulted before any mutating call; the background keeps it current from the kill-list */
  revocation?: () => Promise<{ revoked: boolean; message: string } | undefined>;
}

export class Audit {
  private readonly now: () => number;
  private readonly max: number;
  private readonly revocation?: AuditOpts['revocation'];
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly kv: KV,
    opts: AuditOpts = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.max = opts.maxRecords ?? DEFAULT_MAX_RECORDS;
    this.revocation = opts.revocation;
  }

  private async load(): Promise<AuditState> {
    const s = await this.kv.get<AuditState>(AUDIT_KEY);
    return s && s.v === 1 && Array.isArray(s.records) ? { v: 1, records: s.records, last: s.last ?? {} } : { v: 1, records: [], last: {} };
  }

  /** serialise read-modify-write so two calls in flight cannot drop each other's record */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async append(state: AuditState, rec: AuditRecord): Promise<void> {
    state.records.push(rec);
    if (state.records.length > this.max) state.records.splice(0, state.records.length - this.max);
    await this.kv.set(AUDIT_KEY, state);
  }

  /** Time until this class may be called again; 0 when it may be called now. */
  async waitFor(cls: EndpointClass): Promise<number> {
    const state = await this.load();
    const last = state.last[cls];
    if (!last) return 0;
    return Math.max(0, last + FLOORS_MS[cls] - this.now());
  }

  /** Run one portal request through the chokepoint. */
  async request<T>(meta: RequestMeta, fn: () => Promise<RequestOutcome<T>>): Promise<T> {
    const endpoint = auditEndpoint(meta.endpoint);
    const base = { method: meta.method, endpoint, ...(meta.job ? { job: redact(meta.job) } : {}) };
    // admission: floor, then revocation; a refusal is itself recorded so the log shows the attempt
    const admitted = await this.serial(async () => {
      const state = await this.load();
      const last = state.last[meta.cls];
      const wait = last ? last + FLOORS_MS[meta.cls] - this.now() : 0;
      if (wait > 0) {
        await this.append(state, { ts: new Date(this.now()).toISOString(), ...base, bytes: 0, outcome: `refused: floor (${Math.ceil(wait / 1000)} s left)` });
        return new FloorError(meta.cls, wait);
      }
      if (meta.mutates && this.revocation) {
        const r = await this.revocation();
        if (r?.revoked) {
          await this.append(state, { ts: new Date(this.now()).toISOString(), ...base, bytes: 0, outcome: 'refused: this version has been withdrawn' });
          return new RevokedError(`This version of Ashley Bridge has been withdrawn and no longer sends commands. ${r.message || 'Update to continue.'}`.trim());
        }
      }
      state.last[meta.cls] = this.now();
      await this.kv.set(AUDIT_KEY, state);
      return undefined;
    });
    if (admitted) throw admitted;
    let out: RequestOutcome<T> | undefined;
    let failure: unknown;
    try {
      out = await fn();
    } catch (e) {
      failure = e;
    }
    await this.serial(async () => {
      const state = await this.load();
      await this.append(state, {
        ts: new Date(this.now()).toISOString(),
        ...base,
        bytes: out ? out.bytes : 0,
        outcome: redact(out ? out.outcome : `error: ${(failure as Error)?.message ?? String(failure)}`).slice(0, 200),
      });
    });
    if (failure) throw failure;
    return (out as RequestOutcome<T>).result;
  }

  async records(): Promise<AuditRecord[]> {
    return (await this.load()).records;
  }

  /** JSON lines, newest last: the form a student can hand to a security office. */
  async exportText(): Promise<string> {
    return (await this.records()).map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  async clear(): Promise<void> {
    await this.serial(async () => {
      const state = await this.load();
      await this.kv.set(AUDIT_KEY, { v: 1, records: [], last: state.last });
    });
  }
}
