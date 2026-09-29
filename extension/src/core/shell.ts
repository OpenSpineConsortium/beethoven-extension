// The Open OnDemand Shell app, driven for exactly one command line. The page at
// /pun/sys/shell/ssh/<host> embeds a CSRF token in its inline script; the socket is
// wss://<ood>/pun/sys/shell/ssh/<host>?csrf=<token> with no subprotocol; the client sends JSON
// text frames {"input": "..."} and {"resize": {"cols", "rows"}} and receives raw PTY bytes as
// text frames. That framing has been byte-identical from OOD 2.0 to 4.2.5. The far side is an
// ssh to a login node, so the rule is: open, run one line, read until the end marker, exit, close.
// Nothing is left running on the login node and the socket never outlives the command.
//
// The token is scraped seconds before connecting (it is per Node process and Passenger kills an
// idle shell app after 300 s), every incoming frame is validated as text before it is parsed, and
// a non-JSON frame is never sent (the server's JSON.parse would throw inside the one process that
// is the student's only shell).
import type { PortalNet, WsLike } from './net';

/** control sequences and carriage returns, as Ashley's phone.js strips them */
export const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b[()][A-Za-z0-9]|\r/g;

export function clean(s: string): string {
  return String(s).replace(ANSI, '');
}

/** The shell page's URL builder is `base + separator + "csrf={{csrfToken}}"`; the token is base64url with '-' and '_'. */
export function scrapeCsrf(html: string): string | undefined {
  const m = /csrf=([A-Za-z0-9_\-%.~]+)/.exec(String(html ?? ''));
  return m ? m[1] : undefined;
}

/** The three admission gates plus the allowlist, in the order app.js tests them; code 3146 carries the reason. */
export function explainClose(code: number, reason: string): string {
  const r = String(reason ?? '').trim();
  if (code === 3146) {
    if (/No clusters defined/i.test(r)) return 'The portal has no cluster configured for its shell. Ask your research computing centre to define a cluster for Open OnDemand.';
    if (/Invalid Origin/i.test(r)) return "The portal's shell refused the connection because of its origin check (the portal sits behind an extra proxy). Its administrator can set OOD_SHELL_ORIGIN_CHECK to the portal's https address.";
    if (/Bad CSRF Token/i.test(r)) return 'The shell token had already expired. Try again; the extension fetches a fresh one each time.';
    if (/not specified in allowlist/i.test(r)) return `The shell host is not allowed by the portal (${r}). Set a different shell host in the extension's settings or ask your centre which host the Shell app uses.`;
    return `The portal's shell refused the connection: ${r || 'no reason given'}.`;
  }
  if (code === 1006) return 'The connection to the portal dropped before the shell answered. Check that you are on the VPN and signed in to the portal.';
  if (code === 1000) return 'The shell closed normally.';
  return `The shell closed (code ${code}${r ? `, ${r}` : ''}).`;
}

export function markerFor(nonce: string): { base: string; begin: string; end: RegExp } {
  const base = `ASHBR${nonce}`;
  return { base, begin: `${base}_BEGIN\n`, end: new RegExp(`\\n?${base}_END:(\\d+)`) };
}

/**
 * The one line that is typed. The markers are built by the shell from a variable, so the echo of
 * the typed line never contains the expanded marker and cannot be mistaken for output. The
 * command runs in a subshell so that its own `exit` or `cd` cannot skip the end marker; `exit`
 * at the end closes the login shell, which ends the ssh and the socket.
 */
export function wrapCommand(command: string, nonce: string): string {
  const c = String(command ?? '');
  if (!c.trim()) throw new Error('empty command');
  if (/[\r\n]/.test(c)) throw new Error('the bootstrap shell runs exactly one command line');
  if (!/^[A-Za-z0-9]+$/.test(nonce)) throw new Error('nonce must be alphanumeric');
  return `__b=ASHBR${nonce}; printf '\\n%s_BEGIN\\n' "$__b"; ( ${c} ) 2>&1; printf '\\n%s_END:%s\\n' "$__b" "$?"; exit`;
}

export type TranscriptPhase = 'waiting' | 'running' | 'done';

/**
 * Accumulates PTY text frames and finds the framed output. Frames that are not strings are
 * counted and ignored (the real server only ever sends text; anything else is a proxy artefact).
 */
export class ShellTranscript {
  raw = '';
  ignoredFrames = 0;
  phase: TranscriptPhase = 'waiting';
  output = '';
  exitCode: number | undefined;
  private readonly m: ReturnType<typeof markerFor>;

  constructor(nonce: string) {
    this.m = markerFor(nonce);
  }

  feed(frame: unknown): void {
    if (typeof frame !== 'string') {
      this.ignoredFrames++;
      return;
    }
    this.raw += frame;
    if (this.raw.length > 2_000_000) this.raw = this.raw.slice(-1_000_000);
    this.scan();
  }

  private scan(): void {
    if (this.phase === 'done') return;
    const text = clean(this.raw);
    const b = text.indexOf(this.m.begin);
    if (b < 0) return;
    const after = text.slice(b + this.m.begin.length);
    const e = this.m.end.exec(after);
    if (!e) {
      this.phase = 'running';
      this.output = after;
      return;
    }
    this.output = after.slice(0, e.index).replace(/\n$/, '');
    this.exitCode = Number(e[1]);
    this.phase = 'done';
  }

  /** the cleaned text, for a "what the shell said" view when something went wrong */
  get cleaned(): string {
    return clean(this.raw);
  }
}

export interface ShellRunOpts {
  origin: string;
  /** "default" lets the portal pick its default login host */
  host: string;
  command: string;
  net: PortalNet;
  /** wait for the command's end marker at most this long */
  timeoutMs?: number;
  /** time to wait for the prompt to settle before typing */
  settleMs?: number;
  connectTimeoutMs?: number;
  nonce?: string;
  onFrame?(text: string): void;
}

export interface ShellResult {
  output: string;
  exitCode: number;
  /** the whole cleaned transcript, for diagnostics */
  transcript: string;
  ms: number;
  closeCode?: number;
  closeReason?: string;
}

export function shellPageUrl(origin: string, host: string): string {
  return `${origin}/pun/sys/shell/ssh/${encodeURIComponent(host)}`;
}

export function shellSocketUrl(origin: string, host: string, csrf: string): string {
  const u = new URL(shellPageUrl(origin, host));
  u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
  u.search = `csrf=${csrf}`;
  return u.toString();
}

export class ShellError extends Error {
  constructor(
    message: string,
    public readonly transcript = '',
    public readonly closeCode?: number,
    public readonly closeReason?: string,
  ) {
    super(message);
    this.name = 'ShellError';
  }
}

function randomNonce(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Open the shell, run one command line, return its output, and close. Never leaves the socket open. */
export async function runShellCommand(o: ShellRunOpts): Promise<ShellResult> {
  const t0 = Date.now();
  const nonce = o.nonce ?? randomNonce();
  const line = wrapCommand(o.command, nonce);
  const page = await o.net.fetch(shellPageUrl(o.origin, o.host), { credentials: 'same-origin', redirect: 'follow', headers: { Accept: 'text/html' } });
  if (!page.ok) throw new ShellError(`the portal's Shell app answered ${page.status}; sign in to the portal in a tab and try again`);
  const csrf = scrapeCsrf(await page.text());
  if (!csrf) throw new ShellError("the portal's Shell app page carries no token; the Shell app may be disabled at your site");

  const transcript = new ShellTranscript(nonce);
  const ws: WsLike = new o.net.WebSocket(shellSocketUrl(o.origin, o.host, csrf));
  let closed: { code: number; reason: string } | undefined;
  let typed = false;
  let lastFrameAt = 0;

  const send = (obj: Record<string, unknown>) => {
    // the only two frame shapes the server understands; anything else would throw in its handler
    if (!('input' in obj) && !('resize' in obj)) throw new Error('refusing to send a frame the shell does not understand');
    ws.send(JSON.stringify(obj));
  };

  return new Promise<ShellResult>((resolve, reject) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.push(t);
      return t;
    };
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = (err?: Error, result?: ShellResult) => {
      if (finished) return;
      finished = true;
      for (const t of timers) clearTimeout(t);
      if (settleTimer) clearTimeout(settleTimer);
      try {
        if (ws.readyState === 0 || ws.readyState === 1) ws.close(1000, 'done');
      } catch {
        /* already closing */
      }
      if (err) reject(err);
      else resolve(result as ShellResult);
    };
    const type = () => {
      if (typed || finished) return;
      typed = true;
      try {
        send({ input: `${line}\r` });
      } catch (e) {
        finish(new ShellError(`could not send the command: ${(e as Error).message}`, transcript.cleaned));
      }
      later(() => finish(new ShellError(`the command did not finish within ${Math.round((o.timeoutMs ?? 60_000) / 1000)} s`, transcript.cleaned)), o.timeoutMs ?? 60_000);
    };
    const settle = () => {
      // the far side is a fresh login shell with a banner; type once it has been quiet for a moment
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(type, o.settleMs ?? 400);
    };

    later(() => finish(new ShellError('the portal shell did not open in time', transcript.cleaned)), o.connectTimeoutMs ?? 15_000);

    ws.addEventListener('open', () => {
      try {
        send({ resize: { cols: 200, rows: 50 } });
      } catch {
        /* a failed resize is harmless */
      }
      // if the login shell prints nothing at all (quiet banner), still type after a few seconds
      later(() => {
        if (!typed && !lastFrameAt) type();
      }, 5_000);
    });
    ws.addEventListener('message', (ev: { data: unknown }) => {
      const data = ev.data;
      lastFrameAt = Date.now();
      transcript.feed(data);
      if (typeof data === 'string') {
        o.onFrame?.(clean(data));
        if (!typed) {
          if (/password:|passphrase|Permission denied/i.test(clean(transcript.raw))) {
            finish(new ShellError('the portal could not log you into the login node without a password; ask your centre about the Shell app', transcript.cleaned));
            return;
          }
          settle();
        }
      }
      if (transcript.phase === 'done') {
        // let the login shell see our exit; the server closes the socket when ssh ends
        finish(undefined, { output: transcript.output, exitCode: transcript.exitCode ?? -1, transcript: transcript.cleaned, ms: Date.now() - t0 });
      }
    });
    ws.addEventListener('close', (ev: { code: number; reason: string }) => {
      closed = { code: ev.code, reason: ev.reason };
      if (transcript.phase === 'done') {
        finish(undefined, { output: transcript.output, exitCode: transcript.exitCode ?? -1, transcript: transcript.cleaned, ms: Date.now() - t0, closeCode: ev.code, closeReason: ev.reason });
      } else {
        finish(new ShellError(explainClose(ev.code, ev.reason), transcript.cleaned, ev.code, ev.reason));
      }
    });
    ws.addEventListener('error', () => {
      // the close event that follows carries the code; only act here if none follows
      later(() => {
        if (!closed) finish(new ShellError('the connection to the portal shell failed', transcript.cleaned));
      }, 1_000);
    });
  });
}
