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
import { PRODUCT_NAME } from './terms';

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

/**
 * Which floor applies. Each class has its own clock, so one action never trips a different one:
 * a full check run opens the shell once (discover), reads the Files app and asks Active Jobs once,
 * and none of the three blocks the others.
 *   scheduler  a shell line that submits, cancels or allocates a job (sbatch, scancel, srun,
 *              hpcworker probe, hpcworker worker start|stop, hpcworker claude login, whose
 *              sitting is an srun on the login node): once a minute
 *   jobs       the portal's Active Jobs app (a GET that runs squeue, the DELETE that runs
 *              scancel): once a minute
 *   discover   the login-node discovery batch (one sinfo among cheap reads): once a minute
 *   shell      any other single line through the bootstrap shell (install, diag): every 15 s
 *   files, dashboard, probe, vendor: no floor of their own; their pace is the once-a-minute alarm
 */
export type EndpointClass = 'dashboard' | 'files' | 'jobs' | 'scheduler' | 'discover' | 'shell' | 'probe' | 'vendor';

export const FLOORS_MS: Record<EndpointClass, number> = {
  scheduler: 60_000,
  jobs: 60_000,
  discover: 60_000,
  shell: 15_000,
  files: 0,
  dashboard: 0,
  probe: 0,
  vendor: 0,
};

/** what the floor refusal calls each class, in the student's words */
const CLASS_WORDS: Record<EndpointClass, string> = {
  scheduler: 'the cluster scheduler',
  jobs: "the portal's job list",
  discover: 'the login node',
  shell: 'the login-node shell',
  files: 'the Files app',
  dashboard: 'the portal',
  probe: 'the portal',
  vendor: 'the vendor',
};

/** hpcworker's own verbs that submit, cancel or allocate a job (the login sitting is an srun), and the raw scheduler commands that do */
export const SCHEDULER_COMMAND = /\b(hpcworker\s+(probe|worker\s+(start|stop|restart)|claude\s+(login|consent))|sbatch|scancel|srun|salloc|qsub|qdel|bsub|bkill|condor_submit|condor_rm)\b/;

/** hpcworker's read-only verbs, and the raw commands that only read from the scheduler */
export const DISCOVERY_COMMAND = /\b(hpcworker\s+(discover|diag)|sinfo|squeue|sacct|sacctmgr|scontrol|qstat|bjobs|condor_q)\b/;

const HPCWORKER_VERB = /\bhpcworker\s+(probe|worker\s+(?:start|stop|restart)|claude\s+(?:login|consent)|discover|diag)\b/;

/**
 * The floor class of one command line, by what it really costs the cluster. hpcworker's own verb
 * decides first: the discovery batch names `sbatch` inside a `command -v` and runs one `sinfo`,
 * and that is a read, not a submission. A line without the tool is judged by the raw commands in it.
 */
export function classifyCommand(command: string): 'scheduler' | 'discover' | 'shell' {
  const c = String(command ?? '');
  const verb = HPCWORKER_VERB.exec(c)?.[1];
  if (verb) return verb === 'discover' || verb === 'diag' ? 'discover' : 'scheduler';
  if (SCHEDULER_COMMAND.test(c)) return 'scheduler';
  if (DISCOVERY_COMMAND.test(c)) return 'discover';
  return 'shell';
}

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
    super(`too soon: ${CLASS_WORDS[cls]} was asked less than ${Math.round(FLOORS_MS[cls] / 1000)} s ago; wait ${Math.ceil(waitMs / 1000)} s`);
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
          return new RevokedError(`This version of ${PRODUCT_NAME} has been withdrawn and no longer sends commands. ${r.message || 'Update to continue.'}`.trim());
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

  /** Forget the records, never the clocks: a cleared log must not reopen a floor. */
  async clear(): Promise<void> {
    await this.serial(async () => {
      const state = await this.load();
      await this.kv.set(AUDIT_KEY, { v: 1, records: [], last: state.last });
    });
  }
}

/** The same rule for a page that clears the log straight from storage when the page script is unreachable. */
export async function clearRecordsKeepingClocks(kv: KV): Promise<void> {
  const s = await kv.get<AuditState>(AUDIT_KEY);
  await kv.set(AUDIT_KEY, { v: 1, records: [], last: s?.last ?? {} });
}
