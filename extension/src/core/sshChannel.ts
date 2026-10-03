// The direct way to the grid (12.0.0): the same PortalApi the 11.0.0 portal client implements
// (core/portal.ts), carried over ssh with this computer's key, through the gate (framework 11). The
// background's code that reads a run, stops a worker or marks a workspace restricted runs unchanged on
// it: a known 11.0.0 command line is turned into the gate's verb (contract.ts gateLineFor); anything
// else is refused here, before anything is sent. The gate's own grammar is exact: a connection made
// with the key can run nothing but the gate, which can never sign a worker in to Claude.
//
// One ssh connection per action by default (the helper's process lives exactly as long as that
// connection), on the 11.0.0 cadence. While the panel is open the background holds one connection
// (`hold`) and every read goes over it as a new channel: the "watch connection". Each command run on
// the login node through the gate is short and shell only (R7): the gate itself, cat or tail of a run
// file, or hand-over to hpcworker's own verbs.
//
// Every verb goes through the audit chokepoint (core/audit.ts), with the 11.0.0 floors: connect, stop
// and status are scheduler-class (60 s), restrict and forget shell-class (15 s), version and the reads
// have none.
import { Audit, FloorError, type EndpointClass } from './audit';
import { BridgeError, GRID_HOST, GRID_HOST_KEY_PIN, GRID_PORT, type BridgeProvider } from './bridge';
import { gate, gateLineFor, gateReadBody, GATE_FILES, GATE_KEY_EXPIRED, GATE_REFUSED, isUnknownVerb, parseForget, parseGateLimit, parseGateVersion, type GateFile, type GateLimit, type GateVersion } from './contract';
import { debugOutput } from './debuglog';
import { KeyringError } from './keyring';
import type { ActiveJobs, DirEntry, DirListing, PortalApi, RnodeState, RouteProbe, SessionInfo, WarmResult } from './portal';
import type { ShellResult, ShellTestResult } from './shell';
import { SshConnection, SshProtocolError, SshTimeoutError, type ExecResult, type SshIdentity } from '../ssh';

/** why a direct action did not happen, in one word (the facts and the views choose the sentence from it) */
export type DirectFailure =
  /** no bridge this browser has carried the connection */
  | 'no-bridge'
  /** the bridge could not reach the grid's port */
  | 'unreachable'
  /** the grid's host key did not match the pin: nothing was sent */
  | 'host-key'
  /** the grid did not accept this computer's key (never enrolled, removed, or another account) */
  | 'key-refused'
  /** the lab's key lifetime passed: the gate removed the line */
  | 'key-expired'
  /** the protected key waits for Windows Hello / Touch ID this browser session */
  | 'locked'
  /** there is no key on this computer */
  | 'no-key'
  /** the gate refused the command */
  | 'refused'
  /** one of the gate's caps (worker names, connects an hour, watches at once) was reached: DirectError.limit says which */
  | 'limit'
  /** the lab's copy on the grid is older than framework 11 (it has no gate) */
  | 'old-copy'
  | 'timeout'
  /** the connection ended for another reason */
  | 'dropped';

export class DirectError extends Error {
  constructor(
    readonly failure: DirectFailure,
    readonly detail: string,
    /** for 'limit': which cap */
    readonly limit?: GateLimit,
  ) {
    super(detail);
    this.name = 'DirectError';
  }
}

/** turn whatever a direct action threw into its failure word */
export function directFailureOf(e: unknown): DirectFailure {
  if (e instanceof DirectError) return e.failure;
  if (e instanceof BridgeError) return e.state === 'unreachable' || e.state === 'refused' ? 'unreachable' : 'no-bridge';
  if (e instanceof KeyringError) return e.code === 'locked' ? 'locked' : e.code === 'no-key' ? 'no-key' : 'key-refused';
  if ((e as { hostKeyMismatch?: boolean })?.hostKeyMismatch) return 'host-key';
  if (e instanceof SshTimeoutError || /timed out/i.test((e as Error)?.message ?? '')) return 'timeout';
  return 'dropped';
}

export interface SshPortalDeps {
  /** the bridge chosen in D3's order (throws a BridgeError when there is none) */
  bridge(): Promise<BridgeProvider>;
  /** this computer's identity (core/keyring.ts loadIdentity) */
  identity(): Promise<SshIdentity>;
  /** the account the grid accepted (the ssh user name) */
  account(): Promise<string | undefined>;
  audit: Audit;
  pin?: string;
  host?: string;
  port?: number;
  log?: (line: string) => void;
  /**
   * 14.0.0, the debug log (core/debuglog.ts): each connection opened and closed, with the reason and how long it
   * lived, and each gate verb, by its verb and name only, with its exit status, how long it took and the first
   * characters of its output. Never the key, never a command's other words.
   */
  debug?: (tag: string, line: string) => void;
  now?: () => number;
  /** how long a held connection may sit unused (2 min) */
  holdIdleMs?: number;
}

/** a gate line as the debug log names it: the verb and the worker's name (and, for read, which of the four files) */
export function gateWords(line: string): string {
  const w = String(line ?? '').split(' ');
  const verb = w[0] ?? '';
  if (verb === 'read') return `read ${w[1] ?? ''} ${w[2] ?? ''}`.trim();
  if (verb === 'version' || verb === 'forget') return verb;
  return `${verb} ${w[1] ?? ''}`.trim();
}

const FILES_OF = new Set<string>(GATE_FILES);

/** "<state dir>/<name>/<file>" -> the run's name and the file, when it is one of the four the gate reads */
export function runFileOf(path: string): { name: string; file: GateFile } | undefined {
  const parts = String(path ?? '').split('/').filter(Boolean);
  const file = parts[parts.length - 1];
  const name = parts[parts.length - 2];
  if (!file || !name || !FILES_OF.has(file)) return undefined;
  return { name, file: file as GateFile };
}

/** the floor class of a gate verb */
function classOf(verb: string): EndpointClass {
  switch (verb) {
    case 'connect':
    case 'stop':
      return 'scheduler';
    case 'status':
      return 'status';
    case 'restrict':
    case 'forget':
      return 'shell';
    default:
      return 'files';
  }
}

interface Held {
  conn: SshConnection;
  lastUsed: number;
  timer: ReturnType<typeof setInterval>;
}

export class SshPortal implements PortalApi {
  private held: Held | undefined;
  private holding = false;
  private opening: Promise<SshConnection> | undefined;
  /** when each live connection was opened, for the debug log's "closed after" */
  private readonly openedAt = new WeakMap<SshConnection, number>();
  /** the last version through the gate: the account, the framework, whether Claude Code is signed in */
  lastVersion: GateVersion | undefined;
  private readonly pin: string;
  private readonly host: string;
  private readonly port: number;
  private readonly now: () => number;

  constructor(private readonly d: SshPortalDeps) {
    this.pin = d.pin ?? GRID_HOST_KEY_PIN;
    this.host = d.host ?? GRID_HOST;
    this.port = d.port ?? GRID_PORT;
    this.now = d.now ?? (() => Date.now());
  }

  private debug(tag: string, line: string): void {
    try {
      this.d.debug?.(tag, line);
    } catch {
      /* the debug log never stops an action */
    }
  }

  /** close a connection, with the reason and its age in the debug log */
  private closeConn(conn: SshConnection, reason: string): void {
    const at = this.openedAt.get(conn);
    this.openedAt.delete(conn);
    this.debug('ssh', `close ${this.host}:${this.port}: ${reason}${at !== undefined ? ` after ${this.now() - at} ms` : ''}${conn.endedWith ? ` (it had ended: ${conn.endedWith.message})` : ''}`);
    void conn.close().catch(() => undefined);
  }

  // ---- connections -----------------------------------------------------------------------------------

  /** one signed-in connection with the key */
  private async openConnection(why: string): Promise<SshConnection> {
    const t0 = this.now();
    let conn: SshConnection | undefined;
    try {
      const account = await this.d.account();
      if (!account) throw new DirectError('key-refused', 'no account recorded for the direct way');
      const identity = await this.d.identity();
      const bridge = await this.d.bridge();
      const stream = await bridge.open(this.host, this.port);
      conn = new SshConnection({ stream, username: account, pinnedFingerprint: this.pin, ...(this.d.log ? { log: this.d.log } : {}) });
      await conn.connect();
      const r = await conn.authPublicKey(identity);
      if (!r.success) throw new DirectError('key-refused', `the grid did not accept this computer's key (methods: ${r.methods.join(',')})`);
      this.openedAt.set(conn, this.now());
      this.debug('ssh', `open ${this.host}:${this.port} as ${account} through the ${bridge.id} bridge (${why}) in ${this.now() - t0} ms`);
      return conn;
    } catch (e) {
      this.debug('ssh', `open ${this.host}:${this.port} failed after ${this.now() - t0} ms (${why}): ${directFailureOf(e)}: ${(e as Error)?.message ?? String(e)}`);
      if (conn) await conn.close().catch(() => undefined);
      throw e;
    }
  }

  /** keep one connection open for the reads while the panel is open (the watch connection), or let it go */
  hold(on: boolean): void {
    if (on !== this.holding) this.debug('ssh', on ? 'hold: the panel is open, reads share one connection' : 'hold off: the panel closed');
    this.holding = on;
    if (!on) this.dropHeld('the panel closed');
  }

  private dropHeld(reason: string): void {
    const h = this.held;
    this.held = undefined;
    if (h) {
      clearInterval(h.timer);
      this.closeConn(h.conn, reason);
    }
  }

  /** run fn on a connection: the held one when holding (opened once), else one opened and closed for this action */
  private async withConnection<T>(fn: (c: SshConnection) => Promise<T>): Promise<T> {
    if (this.holding) {
      let conn = this.held && !this.held.conn.endedWith ? this.held.conn : undefined;
      if (!conn) {
        if (!this.opening) {
          if (this.held) this.dropHeld('the held connection had ended');
          this.opening = this.openConnection('held while the panel is open').finally(() => (this.opening = undefined));
        }
        conn = await this.opening;
        // two callers may wait on one opening: the first to come back keeps it, once
        if (this.held?.conn !== conn) {
          if (this.holding) {
            const idle = this.d.holdIdleMs ?? 120_000;
            const h: Held = { conn, lastUsed: this.now(), timer: setInterval(() => (this.held === h && this.now() - h.lastUsed > idle ? this.dropHeld(`unused for ${Math.round(idle / 1000)} s`) : undefined), Math.min(idle, 30_000)) };
            this.held = h;
          } else {
            try {
              return await fn(conn);
            } finally {
              this.closeConn(conn, 'the action ended (the panel closed meanwhile)');
            }
          }
        }
      }
      if (this.held) this.held.lastUsed = this.now();
      try {
        return await fn(conn);
      } catch (e) {
        if (conn.endedWith) this.dropHeld('it ended during an action');
        throw e;
      }
    }
    const conn = await this.openConnection('one action');
    try {
      return await fn(conn);
    } finally {
      this.closeConn(conn, 'the action ended');
    }
  }

  /** one gate verb, through the chokepoint; a refusal and an expiry are typed errors */
  private async run(line: string, o: { timeoutMs?: number; job?: string } = {}): Promise<ExecResult> {
    const verb = line.split(' ')[0] ?? '';
    const words = gateWords(line);
    const t0 = this.now();
    try {
      const r = await this.d.audit.request(
        { method: 'SSH', endpoint: `ssh://${this.host}/gate/${verb}`, cls: classOf(verb), mutates: verb !== 'version' && verb !== 'read' && verb !== 'status', via: 'extension', ...(o.job ? { job: o.job } : {}) },
        async () => {
          const r = await this.withConnection((c) => c.exec(line, { timeoutMs: o.timeoutMs ?? 45_000, maxOutput: 512 * 1024 }));
          const text = r.stdoutText;
          const both = text + r.stderrText;
          if (r.exitStatus === 125 || text.includes(GATE_KEY_EXPIRED)) throw new DirectError('key-expired', 'the lab key lifetime has passed: the gate removed the line');
          if (r.exitStatus === 126 && text.includes(GATE_REFUSED)) throw new DirectError('refused', `the gate refused "${verb}"`);
          const limit = parseGateLimit(both);
          if (limit) throw new DirectError('limit', `the gate's ${limit} limit was reached`, limit);
          if (isUnknownVerb(both)) throw new DirectError('old-copy', "the lab's copy on the grid has no gate (older than framework 11)");
          return { result: r, bytes: r.stdout.length + r.stderr.length + line.length, outcome: `exit ${r.exitStatus ?? '-'}${r.timedOut ? ' (timed out)' : ''}` };
        },
      );
      this.debug('gate', `${words}: exit ${r.exitStatus ?? '-'}${r.timedOut ? ' (timed out)' : ''} in ${this.now() - t0} ms: ${debugOutput(r.stdoutText + (r.stderrText ? ` | stderr: ${r.stderrText}` : '')) || '(no output)'}`);
      return r;
    } catch (e) {
      const why = e instanceof FloorError ? `not sent: ${e.message}` : `${directFailureOf(e)}: ${(e as Error)?.message ?? String(e)}`;
      this.debug('gate', `${words}: failed in ${this.now() - t0} ms: ${why}`);
      throw e;
    }
  }

  // ---- the gate's verbs (what the background calls directly) ------------------------------------------

  /** version through the gate: the account, the framework, Claude Code's sign-in on the grid */
  async version(): Promise<GateVersion> {
    const r = await this.run(gate.version(), { timeoutMs: 20_000 });
    const v = parseGateVersion(r.stdoutText);
    if (!v) throw new DirectError('dropped', `the gate did not answer version (exit ${r.exitStatus ?? '-'})`);
    this.lastVersion = v;
    return v;
  }

  /**
   * the run's files in one connection: each `read NAME FILE` as its own channel. A file that is not there,
   * or one the gate refuses, is undefined (one file never sinks the others); a key the grid no longer
   * takes, a lost connection or a cap still ends the read. The text is as it came (the account's
   * ~/.bashrc may print first: contract.ts parseGateJson and gateText cut it).
   */
  async readRun(name: string, files: GateFile[]): Promise<Partial<Record<GateFile, string>>> {
    const out: Partial<Record<GateFile, string>> = {};
    for (const f of files) {
      let r: ExecResult;
      try {
        r = await this.run(gate.read(name, f), { timeoutMs: 30_000 });
      } catch (e) {
        if (e instanceof DirectError && e.failure === 'refused') continue;
        throw e;
      }
      if (r.exitStatus === 0) out[f] = r.stdoutText;
    }
    return out;
  }

  /** connect through the gate (--login never): the HPCW-STEP lines it printed */
  async connectGate(o: { name: string; site: string; installId?: string; permissionMode: 'default' | 'acceptEdits' | 'plan'; chain: boolean }): Promise<{ lines: string[]; exitStatus: number | null }> {
    const r = await this.run(gate.connect(o), { timeoutMs: 120_000 });
    return { lines: r.stdoutText.split(/\r?\n/), exitStatus: r.exitStatus };
  }

  /** forget through the gate: this computer's line on the grid is removed */
  async forget(): Promise<'forgotten' | 'none' | 'stuck'> {
    const r = await this.run(gate.forget(), { timeoutMs: 30_000 });
    return parseForget(r.stdoutText) ?? 'stuck';
  }

  // ---- PortalApi -------------------------------------------------------------------------------------

  async session(): Promise<SessionInfo> {
    const checkedAt = new Date(this.now()).toISOString();
    const base = { finalUrl: `ssh://${this.host}:${this.port}`, isOnDemand: false, checkedAt };
    try {
      const v = await this.version();
      return { ...base, ok: true, state: 'signed-in', status: 200, signedIn: true, username: v.account, detail: `direct: the gate answered (framework ${v.framework}, key due ${v.due}, Claude ${v.claude})` };
    } catch (e) {
      const f = directFailureOf(e);
      const state: SessionInfo['state'] = f === 'unreachable' || f === 'no-bridge' || f === 'host-key' || f === 'timeout' || f === 'dropped' ? 'unreachable' : 'signed-out';
      return { ...base, ok: false, state, status: 0, signedIn: false, detail: `direct: ${f}: ${(e as Error).message}`.slice(0, 300) };
    }
  }

  async warm(): Promise<WarmResult> {
    const s = await this.session();
    return { ok: s.signedIn, attempts: 1, status: s.status, signedIn: s.signedIn, detail: s.detail, session: s };
  }

  async whoAmI(): Promise<string | undefined> {
    return this.lastVersion?.account ?? (await this.d.account());
  }

  async home(): Promise<string> {
    throw new DirectError('refused', 'the gate does not say where the home folder is');
  }

  async listDir(): Promise<DirListing> {
    throw new DirectError('refused', 'the gate lists no folder; the run is read file by file (readRun)');
  }

  async stat(path: string): Promise<DirEntry | undefined> {
    const t = await this.readFileIfExists(path);
    if (t === undefined) return undefined;
    const name = path.split('/').pop() ?? '';
    return { id: path, type: 'f', name, size: t.length, modified_at: Math.floor(this.now() / 1000), owner: '', mode: 0o644 };
  }

  async exists(path: string): Promise<boolean> {
    return (await this.readFileIfExists(path)) !== undefined;
  }

  async readFile(path: string): Promise<string> {
    const t = await this.readFileIfExists(path);
    if (t === undefined) throw new DirectError('refused', 'no such run file');
    return t;
  }

  async readFileIfExists(path: string): Promise<string | undefined> {
    const rf = runFileOf(path);
    if (!rf) throw new DirectError('refused', 'the gate reads only the four run files');
    const r = await this.run(gate.read(rf.name, rf.file), { timeoutMs: 30_000 });
    return r.exitStatus === 0 ? gateReadBody(r.stdoutText) : undefined;
  }

  async writeFile(): Promise<void> {
    throw new DirectError('refused', 'the gate writes no file');
  }
  async mkdir(): Promise<void> {
    throw new DirectError('refused', 'the gate makes no folder');
  }
  async touch(): Promise<void> {
    throw new DirectError('refused', 'the gate touches no file');
  }
  async activeJobs(): Promise<ActiveJobs> {
    throw new DirectError('refused', 'the gate has no job list');
  }
  async cancelJob(): Promise<void> {
    throw new DirectError('refused', 'the gate cancels through stop only');
  }

  /** an 11.0.0 line, carried as the gate's verb when there is one; refused here otherwise (nothing sent) */
  async shell(command: string, opts: { timeoutMs?: number; job?: string } = {}): Promise<ShellResult> {
    const line = gateLineFor(command);
    const t0 = this.now();
    if (!line) return { output: `${GATE_REFUSED} (not sent: the gate has no verb for this line)`, exitCode: 126, transcript: '', ms: 0 };
    const r = await this.run(line, { timeoutMs: opts.timeoutMs ?? 90_000, ...(opts.job ? { job: opts.job } : {}) });
    const output = r.stdoutText + (r.stderrText ? r.stderrText : '');
    return { output, exitCode: r.exitStatus ?? -1, transcript: output, ms: this.now() - t0 };
  }

  async shellTest(): Promise<ShellTestResult> {
    const s = await this.session();
    return s.signedIn ? 'ok' : 'unknown';
  }

  async probeRnode(): Promise<{ state: RnodeState; status: number; detail: string }> {
    return { state: 'unknown', status: 0, detail: 'not asked over the direct way' };
  }
  async probeRoutes(): Promise<RouteProbe> {
    return { workflows_json: 0, projects: 0 };
  }
  async auditWait(cls: EndpointClass): Promise<number> {
    return this.d.audit.waitFor(cls);
  }
  async auditRecords(): Promise<unknown[]> {
    return this.d.audit.records();
  }
  async auditExport(): Promise<string> {
    return this.d.audit.exportText();
  }
  async auditClear(): Promise<void> {
    return this.d.audit.clear();
  }
}

/** a probe of the grid's door through a bridge, with no credential: the pinned host key answered (the Grid row's reach on 22) */
export async function reachGrid(bridge: BridgeProvider, o: { pin?: string; host?: string; port?: number; timeoutMs?: number } = {}): Promise<'answers' | 'no-route' | 'host-key'> {
  let stream;
  try {
    stream = await bridge.open(o.host ?? GRID_HOST, o.port ?? GRID_PORT);
  } catch {
    return 'no-route';
  }
  const conn = new SshConnection({ stream, username: 'beethoven-reach', pinnedFingerprint: o.pin ?? GRID_HOST_KEY_PIN, handshakeTimeoutMs: o.timeoutMs ?? 10_000, keepaliveMs: 0 });
  try {
    await conn.connect();
    return 'answers';
  } catch (e) {
    return (e as { hostKeyMismatch?: boolean }).hostKeyMismatch ? 'host-key' : 'no-route';
  } finally {
    await conn.close().catch(() => undefined);
  }
}

export { SshProtocolError };
