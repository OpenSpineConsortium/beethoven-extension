// One ssh connection over a byte stream (a bridge: core/bridge.ts), from the handshake to the last
// channel. It authenticates by one of three methods and runs commands on session channels: exec to
// completion, or exec with stdin (the Claude sign-in sitting reads the pasted code from it). No shell,
// no port forwarding, no agent, no X11; a pty only when asked (the sitting, as 11.0.0's portal terminal
// gave it one).
//
// NEW B (the 12.0.0 review: "a channel id is reused after an exec timeout"): the transport hands every
// application message to dispatch() here, in order, and dispatch() routes it at once: the
// authentication replies to one queue, each channel's messages to that channel by its id, the replies
// to global requests to theirs. A read that times out leaves no waiter behind (Queue.next removes its
// own), and a channel's id is never given to another channel: a channel given up after a timeout stays
// registered, absorbing what the server still sends for it, until the server's CHANNEL_CLOSE.
//
// Credentials are overwritten as soon as they have been sent; authentication packets are padded to a
// 256-byte bucket (transport.ts AUTH_PAD).
import { concat, fromUtf8, Reader, SshProtocolError, utf8, Writer, zero } from './bytes';
import { EXTENDED_DATA_STDERR, isChannelMessage, MSG } from './messages';
import { Transport, type Negotiated } from './transport';
import type { SshIdentity } from './identity';

/** the byte stream a bridge gives: anything that writes, and calls back with data and on its end */
export interface ByteStream {
  write(b: Uint8Array): void;
  onData(cb: (b: Uint8Array) => void): void;
  onClose(cb: (why?: string) => void): void;
  close(): void;
}

export class SshTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} timed out`);
    this.name = 'SshTimeoutError';
  }
}

/** an ordered queue whose reads can time out without consuming anything (no orphaned waiter) */
export class Queue<T> {
  private items: T[] = [];
  private waiters: Array<{ res: (v: T) => void; rej: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }> = [];
  private err: Error | undefined;
  push(x: T): void {
    if (this.err) return;
    const w = this.waiters.shift();
    if (w) {
      if (w.timer) clearTimeout(w.timer);
      w.res(x);
    } else this.items.push(x);
  }
  next(timeoutMs?: number, what = 'reply'): Promise<T> {
    if (this.items.length) return Promise.resolve(this.items.shift()!);
    if (this.err) return Promise.reject(this.err);
    return new Promise<T>((res, rej) => {
      const w: { res: (v: T) => void; rej: (e: Error) => void; timer?: ReturnType<typeof setTimeout> } = { res, rej };
      if (timeoutMs !== undefined && timeoutMs > 0) {
        w.timer = setTimeout(() => {
          const i = this.waiters.indexOf(w);
          if (i >= 0) this.waiters.splice(i, 1);
          rej(new SshTimeoutError(what));
        }, timeoutMs);
      }
      this.waiters.push(w);
    });
  }
  fail(e: Error): void {
    if (this.err) return;
    this.err = e;
    for (const w of this.waiters.splice(0)) {
      if (w.timer) clearTimeout(w.timer);
      w.rej(e);
    }
  }
  get size(): number {
    return this.items.length;
  }
}

export interface AuthResult {
  success: boolean;
  methods: string[];
  partial: boolean;
}

/** one set of keyboard-interactive prompts, exactly as the server sent them */
export interface KiRequest {
  name: string;
  instruction: string;
  prompts: Array<{ prompt: string; echo: boolean }>;
  /** the USERAUTH_BANNER text received since the last request, verbatim */
  banner: string;
  /** 1 for the first request of this attempt, 2 for the next … */
  round: number;
}

export interface ExecResult {
  stdout: Uint8Array;
  stderr: Uint8Array;
  stdoutText: string;
  stderrText: string;
  exitStatus: number | null;
  exitSignal: { signal: string; message: string } | null;
  /** the output cap or the time limit cut it short */
  truncated: boolean;
  timedOut: boolean;
}

export interface ExecOptions {
  /** cap on each of stdout and stderr (8 MiB) */
  maxOutput?: number;
  /** wall-clock limit (60 s) */
  timeoutMs?: number;
  /** a pty (the sitting); a key restricted on the grid refuses it, which is not an error here */
  pty?: boolean;
}

/** a running command with stdin open */
export interface ExecHandle {
  /** the channel's id on this side (never reused within a connection) */
  readonly id: number;
  write(data: Uint8Array | string): Promise<void>;
  /** send EOF on stdin */
  eof(): Promise<void>;
  onStdout(cb: (b: Uint8Array) => void): void;
  onStderr(cb: (b: Uint8Array) => void): void;
  /** resolves when the channel closes (the command ended, or close()) */
  readonly done: Promise<{ exitStatus: number | null; exitSignal: { signal: string; message: string } | null }>;
  /** close the channel (the command gets SIGHUP from the server when it has a pty) */
  close(): Promise<void>;
}

export interface ConnectionOptions {
  stream: ByteStream;
  username: string;
  pinnedFingerprint: string;
  log?: (line: string) => void;
  hostKeyAlgos?: string[];
  handshakeTimeoutMs?: number;
  /** a server reply to an authentication or channel request (30 s) */
  replyTimeoutMs?: number;
  keepaliveMs?: number;
}

const LOCAL_WINDOW = 2 * 1024 * 1024;
const LOCAL_MAX_PACKET = 32 * 1024;
/** pty modes: ECHO (53) off, then TTY_OP_END: a code typed into the sitting is never echoed back */
const PTY_MODES = new Uint8Array([53, 0, 0, 0, 0, 0]);

interface Channel {
  id: number;
  remoteId: number;
  remoteWindow: number;
  remoteMax: number;
  localWindow: number;
  opened: boolean;
  sentClose: boolean;
  closed: boolean;
  eofSent: boolean;
  exitStatus: number | null;
  exitSignal: { signal: string; message: string } | null;
  stdout: (b: Uint8Array) => void;
  stderr: (b: Uint8Array) => void;
  /** output that came before its reader was attached (the exec's reply and its first bytes can share a read) */
  early: Array<{ err: boolean; b: Uint8Array }>;
  /** replies to this channel's want_reply requests, in order */
  replies: Queue<boolean>;
  openWait: { res: () => void; rej: (e: Error) => void } | null;
  windowWaiters: Array<() => void>;
  doneRes: () => void;
  done: Promise<void>;
}

export class SshConnection {
  readonly transport: Transport;
  private readonly log: (line: string) => void;
  private readonly replyTimeoutMs: number;
  private readonly auth = new Queue<Uint8Array>();
  private readonly globalReplies = new Queue<Uint8Array>();
  private readonly channels = new Map<number, Channel>();
  private nextChannelId = 0;
  private serviceAccepted = false;
  private bannerText = '';
  private authenticated = false;
  /** why the connection ended, once it has */
  endedWith: Error | null = null;

  constructor(private readonly opts: ConnectionOptions) {
    this.log = opts.log ?? (() => undefined);
    this.replyTimeoutMs = opts.replyTimeoutMs ?? 30_000;
    this.transport = new Transport({
      send: (b) => opts.stream.write(b),
      pinnedFingerprint: opts.pinnedFingerprint,
      log: this.log,
      ...(opts.hostKeyAlgos ? { hostKeyAlgos: opts.hostKeyAlgos } : {}),
      ...(opts.handshakeTimeoutMs !== undefined ? { handshakeTimeoutMs: opts.handshakeTimeoutMs } : {}),
      ...(opts.keepaliveMs !== undefined ? { keepaliveMs: opts.keepaliveMs } : {}),
      // FIX 1: on any fatal error the stream is closed at once and every waiter here is told
      onFatal: (e) => this.ended(e),
    });
    this.transport.onMessage = (p) => this.dispatch(p);
    opts.stream.onData((b) => this.transport.receive(b));
    opts.stream.onClose((why) => this.transport.remoteClosed(why || 'connection closed by peer'));
  }

  get username(): string {
    return this.opts.username;
  }

  /** the version exchange and the first key exchange */
  async connect(): Promise<{ negotiated: Negotiated | null; hostKeyFingerprint: string; strictKex: boolean; serverIdent: string }> {
    await this.transport.start();
    return { negotiated: this.transport.negotiated, hostKeyFingerprint: this.transport.serverHostKeyFp, strictKex: this.transport.strictKex, serverIdent: this.transport.serverIdent };
  }

  private ended(e: Error): void {
    if (this.endedWith) return;
    this.endedWith = e;
    this.auth.fail(e);
    this.globalReplies.fail(e);
    for (const ch of this.channels.values()) this.finishChannel(ch, e);
    try {
      this.opts.stream.close();
    } catch {
      /* gone already */
    }
  }

  // ---- the one consumer (NEW B) ---------------------------------------------------------------------

  private dispatch(p: Uint8Array): void {
    const type = p[0]!;
    if (type === MSG.SERVICE_ACCEPT || (type >= 50 && type < 80)) {
      if (type === MSG.USERAUTH_BANNER) {
        try {
          const r = new Reader(p);
          r.byte();
          this.bannerText += r.text().slice(0, 4096);
        } catch {
          /* a malformed banner is dropped */
        }
        return;
      }
      if (this.authenticated) return; // nothing of authentication is expected after success
      this.auth.push(p);
      return;
    }
    if (type === MSG.REQUEST_SUCCESS || type === MSG.REQUEST_FAILURE) {
      this.globalReplies.push(p);
      return;
    }
    if (type === MSG.CHANNEL_OPEN) {
      // the server may not open channels to this client (no forwarding of any kind)
      try {
        const r = new Reader(p);
        r.byte();
        r.text();
        const sender = r.u32();
        void this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_OPEN_FAILURE).u32(sender).u32(1).string('refused').string('').bytes()).catch(() => undefined);
      } catch {
        /* malformed: dropped */
      }
      return;
    }
    if (isChannelMessage(type)) {
      let id: number;
      try {
        id = new Reader(p.subarray(1)).u32();
      } catch {
        return;
      }
      const ch = this.channels.get(id);
      if (!ch) return; // a message for a channel already finished: absorbed
      try {
        this.channelMessage(ch, p);
      } catch (e) {
        this.transport.close((e as Error).message);
      }
    }
  }

  private channelMessage(ch: Channel, p: Uint8Array): void {
    const r = new Reader(p);
    const type = r.byte();
    r.u32();
    switch (type) {
      case MSG.CHANNEL_OPEN_CONFIRMATION: {
        ch.remoteId = r.u32();
        ch.remoteWindow = r.u32();
        ch.remoteMax = r.u32();
        ch.opened = true;
        ch.openWait?.res();
        ch.openWait = null;
        return;
      }
      case MSG.CHANNEL_OPEN_FAILURE: {
        const code = r.u32();
        const desc = r.text();
        ch.openWait?.rej(new SshProtocolError(`channel open failed (${code}): ${desc}`));
        ch.openWait = null;
        this.channels.delete(ch.id);
        return;
      }
      case MSG.CHANNEL_WINDOW_ADJUST: {
        ch.remoteWindow = Math.min(0xffffffff, ch.remoteWindow + r.u32());
        for (const w of ch.windowWaiters.splice(0)) w();
        return;
      }
      case MSG.CHANNEL_DATA: {
        const data = r.string();
        this.consumeWindow(ch, data.length);
        ch.stdout(data);
        return;
      }
      case MSG.CHANNEL_EXTENDED_DATA: {
        const code = r.u32();
        const data = r.string();
        this.consumeWindow(ch, data.length);
        if (code === EXTENDED_DATA_STDERR) ch.stderr(data);
        return;
      }
      case MSG.CHANNEL_EOF:
        return;
      case MSG.CHANNEL_REQUEST: {
        const req = r.text();
        const wantReply = r.bool();
        if (req === 'exit-status') ch.exitStatus = r.u32();
        else if (req === 'exit-signal') {
          const signal = r.text();
          r.bool();
          ch.exitSignal = { signal, message: r.text() };
        }
        if (wantReply) void this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_FAILURE).u32(ch.remoteId).bytes()).catch(() => undefined);
        return;
      }
      case MSG.CHANNEL_SUCCESS:
        ch.replies.push(true);
        return;
      case MSG.CHANNEL_FAILURE:
        ch.replies.push(false);
        return;
      case MSG.CHANNEL_CLOSE: {
        if (!ch.sentClose && ch.opened) {
          ch.sentClose = true;
          void this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_CLOSE).u32(ch.remoteId).bytes()).catch(() => undefined);
        }
        this.finishChannel(ch);
        return;
      }
    }
  }

  private consumeWindow(ch: Channel, n: number): void {
    ch.localWindow -= n;
    if (ch.localWindow < 0) throw new SshProtocolError('the server sent past the window');
    if (ch.localWindow < LOCAL_WINDOW / 2 && !ch.closed) {
      const add = LOCAL_WINDOW - ch.localWindow;
      ch.localWindow += add;
      void this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_WINDOW_ADJUST).u32(ch.remoteId).u32(add).bytes()).catch(() => undefined);
    }
  }

  private finishChannel(ch: Channel, e?: Error): void {
    if (ch.closed) return;
    ch.closed = true;
    this.channels.delete(ch.id);
    ch.openWait?.rej(e ?? new SshProtocolError('channel closed'));
    ch.openWait = null;
    ch.replies.fail(e ?? new SshProtocolError('channel closed'));
    for (const w of ch.windowWaiters.splice(0)) w();
    ch.doneRes();
  }

  // ---- authentication --------------------------------------------------------------------------------

  private async authReply(): Promise<Uint8Array> {
    return this.auth.next(this.replyTimeoutMs, "the grid's answer");
  }

  /** the banner the server sent so far (verbatim), and clears it */
  takeBanner(): string {
    const b = this.bannerText;
    this.bannerText = '';
    return b;
  }

  private async requestService(): Promise<void> {
    if (this.serviceAccepted) return;
    await this.transport.sendPacket(new Writer().byte(MSG.SERVICE_REQUEST).string('ssh-userauth').bytes());
    const p = await this.authReply();
    if (p[0] !== MSG.SERVICE_ACCEPT) throw new SshProtocolError(`expected SERVICE_ACCEPT, got ${p[0]}`);
    this.serviceAccepted = true;
  }

  private result(p: Uint8Array): AuthResult {
    if (p[0] === MSG.USERAUTH_SUCCESS) {
      this.authenticated = true;
      return { success: true, methods: [], partial: false };
    }
    if (p[0] === MSG.USERAUTH_FAILURE) {
      const r = new Reader(p);
      r.byte();
      return { success: false, methods: r.nameList(), partial: r.bool() };
    }
    throw new SshProtocolError(`unexpected authentication reply ${p[0]}`);
  }

  private request(method: string): Writer {
    return new Writer().byte(MSG.USERAUTH_REQUEST).string(this.opts.username).string('ssh-connection').string(method);
  }

  /** the "none" request: which methods the server offers */
  async authMethods(): Promise<AuthResult> {
    await this.requestService();
    await this.transport.sendPacket(this.request('none').bytes(), { auth: true });
    return this.result(await this.authReply());
  }

  /** the password method (no second factor can be asked this way); the bytes are zeroed after sending */
  async authPassword(password: string): Promise<AuthResult & { changeRequested?: boolean }> {
    await this.requestService();
    const pw = utf8(password);
    const pkt = this.request('password').bool(false).string(pw).bytes();
    try {
      await this.transport.sendPacket(pkt, { auth: true });
    } finally {
      zero(pkt);
      zero(pw);
    }
    const p = await this.authReply();
    if (p[0] === MSG.USERAUTH_60) return { success: false, methods: [], partial: false, changeRequested: true };
    return this.result(p);
  }

  /**
   * keyboard-interactive (RFC 4256). `answer` receives each set of prompts as the server sent it and
   * returns one answer per prompt (it may take as long as the person needs; the server's own login
   * grace time is the limit). The answers are zeroed after sending. Ends with the server's verdict.
   */
  async authKeyboardInteractive(answer: (req: KiRequest) => Promise<string[]>): Promise<AuthResult> {
    await this.requestService();
    await this.transport.sendPacket(this.request('keyboard-interactive').string('').string('').bytes(), { auth: true });
    for (let round = 1; ; round++) {
      const p = await this.authReply();
      if (p[0] === MSG.USERAUTH_SUCCESS || p[0] === MSG.USERAUTH_FAILURE) return this.result(p);
      if (p[0] !== MSG.USERAUTH_60) throw new SshProtocolError(`unexpected keyboard-interactive reply ${p[0]}`);
      const r = new Reader(p);
      r.byte();
      const name = r.text();
      const instruction = r.text();
      r.text(); // language tag
      const n = r.u32();
      if (n > 16) throw new SshProtocolError('too many prompts');
      const prompts: KiRequest['prompts'] = [];
      for (let i = 0; i < n; i++) prompts.push({ prompt: r.text(), echo: r.bool() });
      const answers = await answer({ name, instruction, prompts, banner: this.takeBanner(), round });
      if (!Array.isArray(answers) || answers.length !== prompts.length) throw new Error('one answer per prompt');
      const resp = new Writer().byte(MSG.USERAUTH_INFO_RESPONSE).u32(answers.length);
      const bufs = answers.map((a) => utf8(a));
      for (const b of bufs) resp.string(b);
      const pkt = resp.bytes();
      try {
        await this.transport.sendPacket(pkt, { auth: true });
      } finally {
        zero(pkt);
        for (const b of bufs) zero(b);
      }
    }
  }

  /** publickey with the signature straight away (no query round trip) */
  async authPublicKey(identity: SshIdentity): Promise<AuthResult> {
    await this.requestService();
    if (this.transport.closedError) throw this.transport.closedError;
    const sessionId = this.transport.sessionId;
    if (!sessionId) throw new SshProtocolError('no session yet');
    const signed = this.request('publickey').bool(true).string(identity.keyType).string(identity.publicKeyBlob()).bytes();
    const sig = await identity.sign(new Writer().string(sessionId).raw(signed).bytes());
    await this.transport.sendPacket(concat(signed, new Writer().string(sig).bytes()), { auth: true });
    return this.result(await this.authReply());
  }

  // ---- channels --------------------------------------------------------------------------------------

  private async openSession(): Promise<Channel> {
    if (this.endedWith) throw this.endedWith;
    const id = this.nextChannelId++; // never reused within this connection
    let doneRes!: () => void;
    const done = new Promise<void>((r) => (doneRes = r));
    const ch: Channel = {
      id,
      remoteId: -1,
      remoteWindow: 0,
      remoteMax: 0,
      localWindow: LOCAL_WINDOW,
      opened: false,
      sentClose: false,
      closed: false,
      eofSent: false,
      exitStatus: null,
      exitSignal: null,
      stdout: (b) => ch.early.push({ err: false, b: b.slice() }),
      stderr: (b) => ch.early.push({ err: true, b: b.slice() }),
      early: [],
      replies: new Queue<boolean>(),
      openWait: null,
      windowWaiters: [],
      doneRes,
      done,
    };
    this.channels.set(id, ch);
    const opened = new Promise<void>((res, rej) => (ch.openWait = { res, rej }));
    await this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_OPEN).string('session').u32(id).u32(LOCAL_WINDOW).u32(LOCAL_MAX_PACKET).bytes());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([opened, new Promise<never>((_, rej) => (timer = setTimeout(() => rej(new SshTimeoutError('opening a channel')), this.replyTimeoutMs)))]);
    } catch (e) {
      // given up: the id stays taken; a late confirmation is closed when it comes
      if (!ch.opened) ch.openWait = { res: () => void this.closeChannel(ch), rej: () => undefined };
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    return ch;
  }

  /** attach the readers of a channel's output, handing them what came before */
  private attach(ch: Channel, out?: (b: Uint8Array) => void, err?: (b: Uint8Array) => void): void {
    if (out) ch.stdout = out;
    if (err) ch.stderr = err;
    const keep: Channel['early'] = [];
    for (const e of ch.early.splice(0)) {
      if (e.err ? err : out) (e.err ? err! : out!)(e.b);
      else keep.push(e);
    }
    ch.early.push(...keep);
  }

  private async channelRequest(ch: Channel, w: Writer): Promise<boolean> {
    await this.transport.sendPacket(w.bytes());
    return ch.replies.next(this.replyTimeoutMs, 'a channel request');
  }

  private async closeChannel(ch: Channel): Promise<void> {
    if (ch.sentClose || ch.closed) return;
    ch.sentClose = true;
    if (ch.opened) await this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_CLOSE).u32(ch.remoteId).bytes()).catch(() => undefined);
    // the channel stays registered until the server's CHANNEL_CLOSE, absorbing what it still sends (NEW B)
  }

  private async send(ch: Channel, data: Uint8Array): Promise<void> {
    let off = 0;
    while (off < data.length) {
      if (ch.closed || ch.sentClose || this.endedWith) throw this.endedWith ?? new SshProtocolError('channel closed');
      if (ch.remoteWindow <= 0) {
        await new Promise<void>((r) => ch.windowWaiters.push(r));
        continue;
      }
      const n = Math.min(data.length - off, ch.remoteWindow, Math.max(1, ch.remoteMax || LOCAL_MAX_PACKET) - 64, 16 * 1024);
      const chunk = data.subarray(off, off + n);
      ch.remoteWindow -= n;
      off += n;
      await this.transport.sendPacket(new Writer().byte(MSG.CHANNEL_DATA).u32(ch.remoteId).string(chunk).bytes());
    }
  }

  private async startCommand(command: string, pty: boolean): Promise<Channel> {
    const ch = await this.openSession();
    if (pty) {
      // a key restricted on the grid refuses a pty; the command runs without one
      await this.channelRequest(ch, new Writer().byte(MSG.CHANNEL_REQUEST).u32(ch.remoteId).string('pty-req').bool(true).string('xterm').u32(200).u32(50).u32(0).u32(0).string(PTY_MODES)).catch(() => false);
    }
    const ok = await this.channelRequest(ch, new Writer().byte(MSG.CHANNEL_REQUEST).u32(ch.remoteId).string('exec').bool(true).string(command));
    if (!ok) {
      await this.closeChannel(ch);
      throw new SshProtocolError('the grid refused to run the command');
    }
    return ch;
  }

  /** run one command to its end; collect stdout, stderr and the exit status (with a cap and a time limit) */
  async exec(command: string, o: ExecOptions = {}): Promise<ExecResult> {
    const maxOutput = o.maxOutput ?? 8 * 1024 * 1024;
    const timeoutMs = o.timeoutMs ?? 60_000;
    const out: Uint8Array[] = [];
    const err: Uint8Array[] = [];
    let outLen = 0;
    let errLen = 0;
    let truncated = false;
    const ch = await this.startCommand(command, !!o.pty);
    this.attach(
      ch,
      (b) => {
        if (outLen >= maxOutput) return void (truncated = true);
        const take = b.subarray(0, maxOutput - outLen);
        if (take.length < b.length) truncated = true;
        out.push(take.slice());
        outLen += take.length;
      },
      (b) => {
        if (errLen >= maxOutput) return void (truncated = true);
        const take = b.subarray(0, maxOutput - errLen);
        if (take.length < b.length) truncated = true;
        err.push(take.slice());
        errLen += take.length;
      },
    );
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      ch.done,
      new Promise<void>((res) => {
        timer = setTimeout(() => {
          timedOut = true;
          res();
        }, timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    if (timedOut) {
      truncated = true;
      await this.closeChannel(ch);
    }
    const stdout = concat(...out);
    const stderr = concat(...err);
    return { stdout, stderr, stdoutText: fromUtf8(stdout), stderrText: fromUtf8(stderr), exitStatus: ch.exitStatus, exitSignal: ch.exitSignal, truncated, timedOut };
  }

  /** run one command with stdin open (the sitting); its output arrives through the handle's callbacks */
  async startExec(command: string, o: { pty?: boolean } = {}): Promise<ExecHandle> {
    const ch = await this.startCommand(command, !!o.pty);
    const self = this;
    return {
      id: ch.id,
      write: (data) => self.send(ch, typeof data === 'string' ? utf8(data) : data),
      eof: async () => {
        if (ch.eofSent || ch.closed) return;
        ch.eofSent = true;
        await self.transport.sendPacket(new Writer().byte(MSG.CHANNEL_EOF).u32(ch.remoteId).bytes());
      },
      onStdout: (cb) => self.attach(ch, cb),
      onStderr: (cb) => self.attach(ch, undefined, cb),
      done: ch.done.then(() => ({ exitStatus: ch.exitStatus, exitSignal: ch.exitSignal })),
      close: () => self.closeChannel(ch),
    };
  }

  /** the number of channels still registered (for the tests: a timed-out channel stays until the server closes it) */
  get channelCount(): number {
    return this.channels.size;
  }

  /** a DISCONNECT when the session is up, then the stream is closed */
  async close(): Promise<void> {
    try {
      await this.transport.disconnect();
    } catch {
      /* best effort */
    }
    this.transport.close('closed by client');
  }
}
