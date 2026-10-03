// The first direct sign-in (12.0.0, docs/V12_CONTRACT.md "The sign-in sheet"), and every Claude sign-in
// on the direct way.
//
// Beethoven's own sheet (an extension page) asks for the AccessID; then the background opens the
// connection through the bridge, checks the grid's host key against the pin, and asks for
// keyboard-interactive. Whatever the grid asks comes to the sheet exactly as it was asked, one request
// at a time (the password, then the Google Authenticator code at Wayne State): the sheet never invents a
// prompt. Each answer is held in memory only until the request it belongs to is complete, then sent once
// inside the encrypted session and dropped; it is never stored, logged, counted into a view or offered to
// be remembered (R2). A refusal is the grid's own: it asks again, and after three refusals Beethoven stops
// and offers GlobalProtect; the count is kept for the account (storage.session) across "Try again", and
// a new sign-in for that account waits out a cooldown (COOLDOWN_MS) so the grid's own lockout is never
// reached through Beethoven. The grid's "wrong code, or no 2FA set up" refusal names both causes, so it
// is never taken for "no code": the sheet says the code was not accepted and offers to type it again, or
// "I don't have a grid code yet" (only then the route choice, whose 2FA Setup replaces an existing code).
//
// This computer's key is made (or opened) BEFORE the grid is asked for anything, so a key the browser
// cannot keep, or a protected key not unlocked, stops the sheet before a password is typed.
//
// Once the grid has accepted the sign-in, in that same session: the enrolment line (framework 11
// `hpcworker browser-key add <type> <base64> beethoven-browser`) puts this computer's PUBLIC key on the
// grid as one line restricted to the gate; the account is set up to use the lab's copy (`install
// --shared`, as 11.0.0's moment 6 did); then a SECOND connection, made with the key, runs `version`
// through the gate, and only when the gate names the same account is the key marked enrolled. The account
// is then recorded for the approval check, which is sent only after the grid accepted the sign-in.
//
// A Claude sign-in through the gate is impossible by design (the gate's connect is always --login
// never). So when a worker needs one, the sheet is shown again (or the session of a sign-in that just
// happened is used, if it is still held): `connect` runs in the student's own signed-in session, with a
// pty as 11.0.0's portal terminal gave it, and reads the pasted code from its standard input.
//
// Nothing is kept after the session but the account name (and the key, which was made before it).
import type { Audit, EndpointClass } from './audit';
import { BridgeError, GRID_HOST, GRID_HOST_KEY_PIN, GRID_PORT, type BridgeProvider } from './bridge';
import { browserKeyAddedFingerprint, browserKeyAddLine, CODE_PROMPT_RE, commands, isUnknownVerb, parseKeyRefusal, PASSWORD_PROMPT_RE, TWO_FA_REFUSAL_RE, type GateVersion } from './contract';
import { ensureKey, KeyringError, markEnrolled, type Keyring } from './keyring';
import type { ShellSession, ShellSessionEnd } from './shell';
import { SESSION_MAX_MS } from './shell';
import { SshConnection, type KiRequest, type SshIdentity } from '../ssh';

/** an AccessID: letters and digits, starting with a letter (Wayne State's are two letters and four digits) */
export const ACCOUNT_RE = /^[a-z][a-z0-9]{1,15}$/;
/** refusals before Beethoven stops (so the account is not locked by the grid's own limits) */
export const MAX_REFUSALS = 3;
/** how long the signed-in session of a first sign-in is held for a Claude sign-in at the first Connect */
export const HOLD_MS = 10 * 60_000;
/** after MAX_REFUSALS refusals for an account, how long until Beethoven asks the grid for it again */
export const COOLDOWN_MS = 15 * 60_000;

/**
 * phases: code-refused, the grid's "wrong code, or no 2FA set up" refusal (the student types the code
 * again, or says they have no grid code yet); stopped, three refusals (retryAt: when Try again works again)
 */
export type SheetPhase = 'account' | 'connecting' | 'prompt' | 'working' | 'stopped' | 'failed' | 'code-refused' | 'done';
export type SheetWork = 'signing-in' | 'setting-up' | 'checking' | 'claude';
/**
 * key-store: this browser could not make or open the key (before anything was sent); key-refused: the
 * enrolment line refused (keyRefusal carries the framework's own sentence); old-copy: the lab's copy on
 * the grid has no browser-key verb (older than framework 11)
 */
export type SheetFailure = 'no-bridge' | 'unreachable' | 'wrong-grid' | 'dropped' | 'key-not-taken' | 'key-refused' | 'key-store' | 'old-copy' | 'no-shared' | 'unsupported' | 'locked';

/** the refusals counted for one account (storage.session in the browser) */
export interface RefusalStore {
  get(account: string): Promise<{ count: number; at: number } | undefined>;
  set(account: string, note: { count: number; at: number }): Promise<void>;
  clear(account: string): Promise<void>;
}

export function memoryRefusalStore(): RefusalStore & { notes: Map<string, { count: number; at: number }> } {
  const notes = new Map<string, { count: number; at: number }>();
  return {
    notes,
    get: async (a) => notes.get(a),
    set: async (a, n) => void notes.set(a, n),
    clear: async (a) => void notes.delete(a),
  };
}

/** the sheet as the facts see it (never an answer, never a count of characters typed) */
export interface SheetState {
  purpose: 'enrol' | 'claude';
  phase: SheetPhase;
  account?: string;
  /** the grid's banner and instruction above its prompts, verbatim (never its 2FA refusal) */
  instruction?: string;
  /** the grid's prompts now up, verbatim */
  prompts?: Array<{ text: string; echo: boolean; kind: 'password' | 'code' | 'other' }>;
  /** answers given so far to the prompts now up (the answers themselves are not here) */
  answered: number;
  /** a refusal came and the grid asks again */
  notAccepted?: boolean;
  work?: SheetWork;
  failure?: SheetFailure;
  /** refusals so far */
  refusals: number;
  /** stopped: when a new sign-in for this account is allowed again (ms) */
  retryAt?: number;
  /** code-refused: how many times in a row the grid gave its "wrong code, or no 2FA" refusal */
  codeRefusals?: number;
  /** key-refused: the enrolment line's own sentence (framework 11 "HPCW-KEY refused <code> <sentence>") */
  keyRefusal?: string;
  /** Details only */
  detail?: string;
}

export interface SignInOutcome {
  account: string;
  /** the account now uses the lab's copy (install --shared answered 0) */
  setupReady: boolean;
  version: GateVersion;
}

export interface SignInDeps {
  bridge(): Promise<BridgeProvider>;
  keyring: Keyring;
  /** the lab's shared copy (the site profile's shared_install) */
  sharedDir(): Promise<string | undefined>;
  /** the site profile's name, for install --shared; undefined: skipped (connect sets the account up itself) */
  site(): Promise<string | undefined>;
  /** the second connection, with the key: version through the gate (sshChannel.ts) */
  verify(account: string, identity: SshIdentity): Promise<GateVersion>;
  /** the state moved: push the views */
  changed(state: SheetState): void;
  log?: (line: string) => void;
  /**
   * 14.0.0, the debug log (core/debuglog.ts): this flow's own ssh connection, opened and closed, with the reason and
   * how long it lived. Never a prompt's answer: the password and the code are the grid's business, not the log's.
   */
  debug?: (tag: string, line: string) => void;
  pin?: string;
  host?: string;
  port?: number;
  holdMs?: number;
  maxRefusals?: number;
  /** the audit chokepoint: the commands run in the signed-in session are recorded (and the sitting held to the scheduler's floor), as on the 11.0.0 way */
  audit?: Audit;
  /** the refusals per account, kept across Try again (absent: this flow's memory only) */
  refusals?: RefusalStore;
  cooldownMs?: number;
  now?: () => number;
}

class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

function promptKind(text: string): 'password' | 'code' | 'other' {
  if (CODE_PROMPT_RE.test(text)) return 'code';
  if (PASSWORD_PROMPT_RE.test(text)) return 'password';
  return 'other';
}

export class SignInFlow {
  state: SheetState;
  private gen = 0;
  private conn: SshConnection | undefined;
  /** when the sign-in's connection was opened (the debug log's "after") */
  private openedAt: number | undefined;
  private pending: { answers: string[]; need: number; resolve: (a: string[]) => void; reject: (e: Error) => void } | undefined;
  /** the grid gave its "wrong code, or no 2FA set up" refusal in this attempt */
  private codeRefused = false;
  private heldTimer: ReturnType<typeof setTimeout> | undefined;
  private outcome: Promise<SignInOutcome | undefined> | undefined;
  private readonly refusalStore: RefusalStore;

  constructor(
    private readonly d: SignInDeps,
    purpose: 'enrol' | 'claude',
    account?: string,
  ) {
    this.state = { purpose, phase: 'account', answered: 0, refusals: 0, ...(account ? { account } : {}) };
    this.refusalStore = d.refusals ?? memoryRefusalStore();
  }

  private nowMs(): number {
    return this.d.now ? this.d.now() : Date.now();
  }

  private cooldown(): number {
    return this.d.cooldownMs ?? COOLDOWN_MS;
  }

  /** one command in the signed-in session, through the chokepoint when there is one */
  private audited<T>(cls: EndpointClass, verb: string, fn: () => Promise<T>, outcome: (r: T) => string): Promise<T> {
    if (!this.d.audit) return fn();
    return this.d.audit.request({ method: 'SSH', endpoint: `ssh://${this.d.host ?? GRID_HOST}/session/${verb}`, cls, mutates: true, via: 'extension' }, async () => {
      const r = await fn();
      return { result: r, bytes: 0, outcome: outcome(r) };
    });
  }

  private set(patch: Partial<SheetState>, drop: Array<keyof SheetState> = []): void {
    const next = { ...this.state, ...patch };
    for (const k of drop) delete next[k];
    this.state = next;
    this.d.changed(this.state);
  }

  /** the AccessID from the sheet: false when it is not one (nothing is opened) */
  start(rawAccount: string): boolean {
    const account = String(rawAccount ?? '').trim().toLowerCase();
    if (!ACCOUNT_RE.test(account)) return false;
    this.cancelInner();
    const gen = ++this.gen;
    this.codeRefused = false;
    // a run of "wrong code, or no 2FA" refusals continues across Try again for the same account
    const codeRefusals = this.state.account === account ? this.state.codeRefusals : undefined;
    const drop: Array<keyof SheetState> = ['failure', 'prompts', 'instruction', 'notAccepted', 'work', 'detail', 'retryAt', 'keyRefusal'];
    if (!codeRefusals) drop.push('codeRefusals');
    this.set({ account, phase: 'connecting', answered: 0, refusals: 0, ...(codeRefusals ? { codeRefusals } : {}) }, drop);
    this.outcome = this.go(gen, account).catch((e) => {
      if (gen === this.gen && !(e instanceof Cancelled)) this.fail('dropped', (e as Error).message);
      return undefined;
    });
    return true;
  }

  /** resolves when the sign-in has ended (undefined: it did not get through) */
  done(): Promise<SignInOutcome | undefined> {
    return this.outcome ?? Promise.resolve(undefined);
  }

  /** one answer, to the first prompt now up not answered yet; the request goes once every prompt of it has one */
  answer(text: string): { sent: boolean; waiting: number } {
    const p = this.pending;
    if (!p || this.state.phase !== 'prompt') return { sent: false, waiting: 0 };
    p.answers.push(String(text ?? ''));
    if (p.answers.length < p.need) {
      this.set({ answered: p.answers.length });
      return { sent: false, waiting: p.need - p.answers.length };
    }
    this.pending = undefined;
    const answers = p.answers;
    this.set({ phase: 'working', work: 'signing-in', answered: 0 }, ['prompts', 'notAccepted']);
    p.resolve(answers);
    return { sent: true, waiting: 0 };
  }

  /** back to the AccessID field; the connection in flight is closed and nothing is kept */
  cancel(): void {
    this.gen++;
    this.cancelInner();
    this.set({ phase: 'account', answered: 0 }, ['prompts', 'instruction', 'notAccepted', 'work', 'failure', 'detail', 'retryAt', 'keyRefusal', 'codeRefusals']);
  }

  /** a new sign-in from the AccessID this sheet has (after three refusals: refused again until the cooldown has passed) */
  retry(): boolean {
    return this.state.account ? this.start(this.state.account) : false;
  }

  private cancelInner(): void {
    if (this.pending) {
      this.pending.reject(new Cancelled());
      this.pending = undefined;
    }
    this.releaseHeld();
  }

  private fail(failure: SheetFailure, detail: string, extra: Partial<SheetState> = {}): void {
    this.cancelInner();
    this.set({ phase: 'failed', failure, detail: detail.slice(0, 300), ...extra }, ['prompts', 'work', 'notAccepted', 'retryAt', ...(extra.keyRefusal ? [] : (['keyRefusal'] as Array<keyof SheetState>))]);
  }

  /** the refusals still counting for this account (the last one less than the cooldown ago) */
  private async priorRefusals(account: string): Promise<{ count: number; at: number } | undefined> {
    const n = await this.refusalStore.get(account).catch(() => undefined);
    if (!n || !(n.count > 0) || this.nowMs() - n.at >= this.cooldown()) return undefined;
    return n;
  }

  /** one more refusal, counted for the account: true when that makes MAX_REFUSALS (the sheet has stopped) */
  private async refused(account: string): Promise<boolean> {
    const refusals = this.state.refusals + 1;
    const at = this.nowMs();
    await this.refusalStore.set(account, { count: refusals, at }).catch(() => undefined);
    if (refusals >= (this.d.maxRefusals ?? MAX_REFUSALS)) {
      this.cancelInner();
      this.set({ phase: 'stopped', refusals, retryAt: at + this.cooldown() }, ['prompts', 'work', 'notAccepted']);
      return true;
    }
    this.set({ refusals });
    return false;
  }

  /** the grid's "wrong code, or no 2FA set up": counted as a refusal, then the sheet asks which it was */
  private async onCodeRefused(account: string): Promise<undefined> {
    this.cancelInner();
    if (await this.refused(account)) return undefined;
    this.set({ phase: 'code-refused', codeRefusals: (this.state.codeRefusals ?? 0) + 1 }, ['prompts', 'work', 'notAccepted', 'instruction']);
    return undefined;
  }

  /** what the grid asks, to the sheet; its "wrong code, or no 2FA" refusal ends the attempt */
  private ask(gen: number, req: KiRequest): Promise<string[]> {
    if (gen !== this.gen) return Promise.reject(new Cancelled());
    const all = [req.name, req.instruction, req.banner, ...req.prompts.map((p) => p.prompt)].join('\n');
    if (TWO_FA_REFUSAL_RE.test(all)) {
      this.codeRefused = true;
      // nothing more is answered in this attempt: the sheet asks the student what it was
      return req.prompts.length ? Promise.reject(new Cancelled()) : Promise.resolve([]);
    }
    if (!req.prompts.length) return Promise.resolve([]);
    const instruction = [req.banner, req.name, req.instruction].map((s) => s.trim()).filter(Boolean).join('\n').slice(0, 2000);
    return new Promise<string[]>((resolve, reject) => {
      this.pending = { answers: [], need: req.prompts.length, resolve, reject };
      this.set(
        {
          phase: 'prompt',
          prompts: req.prompts.map((p) => ({ text: p.prompt, echo: p.echo, kind: promptKind(p.prompt) })),
          answered: 0,
          ...(instruction ? { instruction } : {}),
        },
        ['work', ...(instruction ? [] : (['instruction'] as Array<keyof SheetState>))],
      );
    });
  }

  private async go(gen: number, account: string): Promise<SignInOutcome | undefined> {
    const live = () => {
      if (gen !== this.gen) throw new Cancelled();
    };
    // three refusals a moment ago: the grid is not asked again for this account until the cooldown has passed
    const prior = await this.priorRefusals(account);
    live();
    if (prior && prior.count >= (this.d.maxRefusals ?? MAX_REFUSALS)) {
      this.set({ phase: 'stopped', refusals: prior.count, retryAt: prior.at + this.cooldown() }, ['prompts', 'work', 'notAccepted']);
      return undefined;
    }
    if (prior) this.set({ refusals: prior.count });
    // this computer's key, before anything is asked of the grid: a key the browser cannot keep (or a
    // protected key not unlocked this browser session) stops here, before a password is typed
    let identity: SshIdentity;
    try {
      identity = await ensureKey(this.d.keyring);
    } catch (e) {
      live();
      this.fail(e instanceof KeyringError && e.code === 'locked' ? 'locked' : 'key-store', (e as Error).message);
      return undefined;
    }
    live();
    // the bridge, the connection, the pin
    let bridge: BridgeProvider;
    try {
      bridge = await this.d.bridge();
    } catch (e) {
      live();
      this.fail('no-bridge', (e as Error).message);
      return undefined;
    }
    live();
    let stream;
    try {
      stream = await bridge.open(this.d.host ?? GRID_HOST, this.d.port ?? GRID_PORT);
    } catch (e) {
      live();
      this.fail(e instanceof BridgeError && e.state !== 'unreachable' && e.state !== 'refused' ? 'no-bridge' : 'unreachable', (e as Error).message);
      return undefined;
    }
    if (gen !== this.gen) {
      stream.close();
      throw new Cancelled();
    }
    const conn = new SshConnection({ stream, username: account, pinnedFingerprint: this.d.pin ?? GRID_HOST_KEY_PIN, ...(this.d.log ? { log: this.d.log } : {}) });
    this.conn = conn;
    const t0 = Date.now();
    this.openedAt = t0;
    try {
      await conn.connect();
    } catch (e) {
      this.debug(`open ${this.d.host ?? GRID_HOST}:${this.d.port ?? GRID_PORT} for the sign-in as ${account} failed after ${Date.now() - t0} ms: ${(e as Error).message}`);
      live();
      this.fail((e as { hostKeyMismatch?: boolean }).hostKeyMismatch ? 'wrong-grid' : 'unreachable', (e as Error).message);
      return undefined;
    }
    this.debug(`open ${this.d.host ?? GRID_HOST}:${this.d.port ?? GRID_PORT} for the sign-in as ${account} through the ${bridge.id} bridge in ${Date.now() - t0} ms; the grid asks its own questions next`);
    live();
    // the grid's own conversation
    try {
      const methods = await conn.authMethods();
      live();
      if (!methods.success) {
        if (!methods.methods.includes('keyboard-interactive')) {
          this.fail('unsupported', `the grid offers ${methods.methods.join(',') || 'nothing'}; Beethoven answers only the grid's own prompts`);
          return undefined;
        }
        for (;;) {
          let ok = false;
          try {
            ok = (await conn.authKeyboardInteractive((req) => this.ask(gen, req))).success;
          } catch (e) {
            if (!this.codeRefused) throw e;
          }
          live();
          if (ok) break;
          if (this.codeRefused) return this.onCodeRefused(account);
          if (await this.refused(account)) return undefined;
          this.set({ notAccepted: true });
        }
      }
    } catch (e) {
      if (e instanceof Cancelled || gen !== this.gen) throw new Cancelled();
      const desc = (e as { serverDisconnect?: { desc: string } }).serverDisconnect?.desc ?? '';
      if (this.codeRefused || TWO_FA_REFUSAL_RE.test(desc)) return this.onCodeRefused(account);
      this.fail('dropped', (e as Error).message);
      return undefined;
    }
    live();
    // signed in: the count for this account starts again
    await this.refusalStore.clear(account).catch(() => undefined);
    // this computer's key, in this session
    this.set({ phase: 'working', work: 'setting-up' }, ['prompts', 'notAccepted', 'instruction', 'codeRefusals']);
    const dir = await this.d.sharedDir();
    if (!dir) {
      this.fail('no-shared', 'no shared copy of the tool is known for this site');
      return undefined;
    }
    live();
    // every signed-in session puts the line in place again (framework 11 prints "HPCW-KEY added <fp>" when
    // it is there already): a line that expired or was removed is mended by the next sign-in
    const add = await this.audited('shell', 'browser-key-add', () => conn.exec(browserKeyAddLine(dir, identity.keyType, identity.publicKeyBase64()), { pty: true, timeoutMs: 60_000 }), (r) => `exit ${r.exitStatus ?? '-'}`);
    live();
    const said = `${add.stdoutText}\n${add.stderrText}`;
    const detail = `browser-key add: exit ${add.exitStatus ?? '-'}: ${said.replace(/\s+/g, ' ').trim().slice(-240)}`;
    const added = browserKeyAddedFingerprint(said, add.exitStatus);
    if (!added) {
      const refusal = parseKeyRefusal(said);
      if (refusal) this.fail('key-refused', detail, { keyRefusal: refusal.sentence || refusal.code });
      else this.fail(isUnknownVerb(said) ? 'old-copy' : 'key-not-taken', detail);
      return undefined;
    }
    // the line the grid wrote must be THIS computer's key
    const mine = await identity.fingerprint();
    if (added !== mine) {
      this.fail('key-not-taken', `the grid added ${added}, not this computer's key ${mine}`);
      return undefined;
    }
    let setupReady = false;
    // the account is set up to use the lab's copy when this computer is enrolled; a later sign-in (for a
    // Claude sign-in) does not run it again: connect sets the account up itself when it must, and the
    // login node is spared the profile check (R7)
    const site = this.state.purpose === 'enrol' ? await this.d.site() : undefined;
    if (site) {
      const r = await this.audited('shell', 'install', () => conn.exec(commands.installShared(dir, site), { timeoutMs: 120_000 }), (x) => `exit ${x.exitStatus ?? '-'}`).catch(() => undefined);
      setupReady = r?.exitStatus === 0;
    }
    live();
    // the key, checked by a second connection made with it
    this.set({ work: 'checking' });
    let v: GateVersion;
    try {
      v = await this.d.verify(account, identity);
    } catch (e) {
      live();
      this.fail('key-not-taken', `the check with the new key failed: ${(e as Error).message}`);
      return undefined;
    }
    live();
    if (v.account.toLowerCase() !== account) {
      this.fail('key-not-taken', `the gate names ${v.account}, not ${account}`);
      return undefined;
    }
    await markEnrolled(this.d.keyring, account);
    // the signed-in session is held a while: a Claude sign-in at the first Connect needs no second sign-in
    this.holdFor(this.d.holdMs ?? HOLD_MS);
    this.set({ phase: 'done' }, ['work', 'failure', 'detail']);
    return { account, setupReady, version: v };
  }

  // ---- the held session and the Claude sitting --------------------------------------------------------

  private holdFor(ms: number): void {
    if (this.heldTimer) clearTimeout(this.heldTimer);
    this.heldTimer = setTimeout(() => this.releaseHeld(), ms);
  }

  private releaseHeld(): void {
    if (this.heldTimer) clearTimeout(this.heldTimer);
    this.heldTimer = undefined;
    const c = this.conn;
    this.conn = undefined;
    if (c) {
      this.debug(`close the sign-in session after ${this.openedAt !== undefined ? Date.now() - this.openedAt : '?'} ms (${this.state.phase === 'done' ? 'held for a Claude sign-in and not used, or let go' : `the sign-in ${this.state.phase}`})`);
      void c.close().catch(() => undefined);
    }
  }

  private debug(line: string): void {
    try {
      this.d.debug?.('ssh', line);
    } catch {
      /* the debug log never stops a sign-in */
    }
  }

  /** a signed-in session is held (a first sign-in a moment ago, still open) */
  holding(): boolean {
    return !!this.conn && !this.conn.endedWith && this.state.phase === 'done';
  }

  /**
   * The Claude sign-in sitting: `line` (contract.ts commands.connect, any --login) in the held session,
   * with a pty, its output to onOutput as it comes, the pasted code written to its standard input by the
   * caller's CodeGate through send(). The session ends with the sitting (or after fifteen minutes).
   */
  async openSitting(line: string, onOutput: (text: string) => void, o: { maxMs?: number } = {}): Promise<ShellSession> {
    const conn = this.conn;
    if (!conn || conn.endedWith) throw new Error('no signed-in session is held');
    if (this.heldTimer) clearTimeout(this.heldTimer);
    this.heldTimer = undefined;
    this.conn = undefined; // the sitting owns it now
    this.set({ work: 'claude' });
    const t0 = Date.now();
    let outBytes = 0;
    let inBytes = 0;
    const td = new TextDecoder();
    // the sitting is a scheduler call (connect submits and allocates): the 11.0.0 floor holds it, and a refusal of the floor leaves the session held for the caller's retry
    const h = await this.audited('scheduler', 'connect', () => conn.startExec(line, { pty: true }), () => 'opened').catch((e) => {
      this.conn = conn;
      this.holdFor(this.d.holdMs ?? HOLD_MS);
      throw e;
    });
    h.onStdout((b) => {
      outBytes += b.length;
      onOutput(td.decode(b, { stream: true }));
    });
    h.onStderr((b) => {
      outBytes += b.length;
      onOutput(td.decode(b, { stream: true }));
    });
    let reason: ShellSessionEnd['reason'] = 'closed';
    const cap = setTimeout(() => {
      reason = 'timeout';
      void h.close();
    }, o.maxMs ?? SESSION_MAX_MS);
    this.debug('the held sign-in session carries the Claude sign-in sitting now');
    const done = h.done.then(() => {
      clearTimeout(cap);
      this.debug(`close the sign-in session: the sitting ended (${reason}) after ${Date.now() - t0} ms, ${outBytes} bytes out, ${inBytes} bytes in`);
      void conn.close().catch(() => undefined);
      return { reason, outputBytes: outBytes, inputBytes: inBytes, ms: Date.now() - t0 } satisfies ShellSessionEnd;
    });
    return {
      send: (text: string) => {
        inBytes += text.length;
        void h.write(text).catch(() => undefined);
      },
      close: () => {
        if (reason === 'closed') reason = 'client';
        void h.close();
        void conn.close().catch(() => undefined);
      },
      done,
    };
  }

  /** everything goes: the connection, any answer still held */
  dispose(): void {
    this.gen++;
    this.cancelInner();
  }
}
