// The login terminal's reader: it turns the plain-mode sitting's output into events. The text
// arrives in frames that split lines anywhere, so complete lines are assembled first; each is then
// matched against the framework's lines (contract.ts, LOGIN_LINES). Only an AUTH-URL on
// claude.ai or claude.com is ever handed on to be opened; anything else on that line is reported
// as a refusal and the sitting continues so the student can read what happened. No browser
// import: the tests feed frames in and read events out.
//
// 11.0.0 adds the reader of the `hpcworker connect` sitting (ConnectWatcher: HPCW-STEP lines, the
// sign-in's lines, the keepalive tolerated wherever it lands) and the one rule for typing the pasted
// code (CodeGate): once, after the framework's prompt (or 5 s after the link when Claude Code words its
// prompt differently), only a plausible code, and again only after the framework says the last one was
// not accepted. The code is held in memory for those few seconds at most and never stored or logged.
import { isClaudeAuthUrl, parseConnectLine, parseLoginLine, plausibleCode, type ConnectEvent, type LoginEvent } from './contract';
import { clean } from './shell';

export type LoginWatchEvent = LoginEvent | { kind: 'refused-url'; url: string };

export class LoginWatcher {
  private pending = '';
  /** the events in the order they were seen */
  readonly events: LoginWatchEvent[] = [];
  authUrl: string | undefined;
  outcome: 'signed-in' | 'failed' | undefined;
  detail = '';

  constructor(private readonly onEvent?: (e: LoginWatchEvent) => void) {}

  /** feed one frame of terminal text (already cleaned or not; codes are stripped again, harmlessly) */
  feed(frame: string): void {
    this.pending += clean(frame);
    let nl: number;
    while ((nl = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, nl);
      this.pending = this.pending.slice(nl + 1);
      this.line(line);
    }
    // the code prompt ends without a newline: look at the unfinished line too
    const partial = parseLoginLine(this.pending);
    if (partial?.kind === 'code-prompt') {
      this.pending = '';
      this.emit(partial);
    }
  }

  private line(line: string): void {
    const ev = parseLoginLine(line);
    if (!ev) return;
    if (ev.kind === 'auth-url') {
      if (!isClaudeAuthUrl(ev.url)) return this.emit({ kind: 'refused-url', url: ev.url });
      if (this.authUrl === ev.url) return; // a redrawn line is not a second page
      this.authUrl = ev.url;
    }
    if (ev.kind === 'signed-in' || ev.kind === 'failed') {
      if (this.outcome) return;
      this.outcome = ev.kind;
      this.detail = ev.detail;
    }
    this.emit(ev);
  }

  private emit(e: LoginWatchEvent): void {
    this.events.push(e);
    this.onEvent?.(e);
  }
}

/** the one sentence shown when the sitting failed; a detail that is itself a sentence keeps one full stop */
export function loginFailureSentence(detail: string): string {
  const d = String(detail ?? '').trim().replace(/[.\s]+$/, '');
  return d ? `The sign-in did not complete: ${d}. You can try again; nothing was stored.` : 'The sign-in did not complete. You can try again; nothing was stored.';
}

// ---- 11.0.0: the `hpcworker connect` sitting ---------------------------------------------------------

/**
 * Turns the connect sitting's terminal text into events (contract.ts parseConnectLine): complete
 * lines are assembled across frames first, terminal codes stripped. A redrawn AUTH-URL line is not a
 * second page; nothing after `HPCW-STEP done` or `HPCW-STEP failed` is reported. Claude Code's own
 * "Paste code here", which ends without a newline, is seen on the unfinished line too. The
 * terminal's text itself goes nowhere: only these events leave this class.
 */
export class ConnectWatcher {
  private pending = '';
  readonly events: ConnectEvent[] = [];
  authUrl: string | undefined;
  /** the sitting's last step line: done or failed */
  ended: 'done' | 'failed' | undefined;
  /** the last few lines, for Details only when the socket closes with no done or failed (never shown to a student) */
  readonly tail: string[] = [];

  constructor(private readonly onEvent?: (e: ConnectEvent) => void) {}

  feed(frame: string): void {
    this.pending += clean(frame);
    let nl: number;
    while ((nl = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, nl);
      this.pending = this.pending.slice(nl + 1);
      this.line(line);
    }
    if (this.pending.length > 8192) this.pending = this.pending.slice(-4096);
    // a prompt ends without a newline: look at the unfinished line for it alone
    const partial = parseConnectLine(this.pending);
    if (partial?.kind === 'code-prompt') {
      this.pending = '';
      this.emit(partial);
    }
  }

  private line(raw: string): void {
    const l = raw.trim();
    if (l) {
      this.tail.push(l.slice(0, 300));
      if (this.tail.length > 20) this.tail.shift();
    }
    const ev = parseConnectLine(l);
    if (!ev || ev.kind === 'keepalive') return;
    if (this.ended) return;
    if (ev.kind === 'auth-url') {
      if (this.authUrl === ev.url) return;
      this.authUrl = ev.url;
    }
    if (ev.kind === 'step' && (ev.step.step === 'done' || ev.step.step === 'failed')) this.ended = ev.step.step;
    this.emit(ev);
  }

  private emit(e: ConnectEvent): void {
    this.events.push(e);
    this.onEvent?.(e);
  }
}

/** what CodeGate.submit did with a pasted code */
export type CodeOutcome =
  /** typed into the sitting now */
  | 'typed'
  /** held a few seconds until the sitting asks for it (the prompt, or 5 s after the link) */
  | 'held'
  /** not a plausible code: nothing reaches the grid */
  | 'bad'
  /** a code was already typed and the sitting has not said it was refused */
  | 'already'
  /** no sitting is waiting for a code */
  | 'closed';

/** how long after the AUTH-URL line a code is typed when no prompt line came (Claude Code may word its prompt differently) */
export const CODE_AFTER_LINK_MS = 5_000;

/**
 * The rule for the pasted code, in one place for both hosts of the sitting (the background in direct
 * mode, the page script's port in tab mode): `send` is called once per accepted code with the code
 * and a carriage return as one input. The code is never stored, logged or counted into a view; it is
 * held in this object only while it waits for the prompt, at most CODE_AFTER_LINK_MS.
 */
export class CodeGate {
  private linkAt: number | undefined;
  private prompted = false;
  private typed = false;
  private held: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private open = true;

  constructor(
    private readonly send: (input: string) => void,
    private readonly opts: { now?: () => number; setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>; clearTimer?: (t: ReturnType<typeof setTimeout>) => void } = {},
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : Date.now();
  }

  /** feed every event of the sitting */
  onEvent(e: ConnectEvent): void {
    if (e.kind === 'auth-url') {
      this.linkAt = this.now();
      this.arm(CODE_AFTER_LINK_MS);
    } else if (e.kind === 'code-prompt') {
      this.prompted = true;
      this.flush();
    } else if (e.kind === 'code-rejected') {
      // the framework asks again: one more code may be typed
      this.typed = false;
      this.prompted = true;
    } else if (e.kind === 'signed-in' || e.kind === 'login-failed' || (e.kind === 'step' && (e.step.step === 'done' || e.step.step === 'failed' || e.step.step === 'signed-in'))) {
      this.close();
    }
  }

  /** the sitting may be typed into: the prompt came, or the link came at least CODE_AFTER_LINK_MS ago */
  private ready(): boolean {
    return this.prompted || (this.linkAt !== undefined && this.now() - this.linkAt >= CODE_AFTER_LINK_MS);
  }

  submit(pasted: unknown): CodeOutcome {
    const code = plausibleCode(pasted);
    if (!code) return 'bad';
    if (!this.open) return 'closed';
    if (this.typed) return 'already';
    if (this.ready()) {
      this.type(code);
      return 'typed';
    }
    this.held = code;
    if (this.linkAt !== undefined) this.arm(Math.max(0, CODE_AFTER_LINK_MS - (this.now() - this.linkAt)));
    return 'held';
  }

  /** a code is waiting for the prompt */
  get holding(): boolean {
    return this.held !== undefined;
  }

  /** the sitting ended or was cancelled: anything held is dropped */
  close(): void {
    this.open = false;
    this.held = undefined;
    if (this.timer) (this.opts.clearTimer ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }

  private arm(ms: number): void {
    if (this.timer) (this.opts.clearTimer ?? clearTimeout)(this.timer);
    this.timer = (this.opts.setTimer ?? setTimeout)(() => {
      this.timer = undefined;
      this.flush();
    }, ms);
  }

  private flush(): void {
    if (!this.open || this.held === undefined || !this.ready()) return;
    const code = this.held;
    this.held = undefined;
    this.type(code);
  }

  private type(code: string): void {
    this.typed = true;
    this.send(`${code}\r`);
  }
}
