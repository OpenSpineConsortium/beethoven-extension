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
// a frame the server's JSON.parse would choke on is never sent (it would throw inside the one process
// that is the student's only shell).
//
// 11.0.0: this runs in the service worker too (the browser attaches the grid sign-in it holds to the
// page GET and to the socket's handshake), so the page GET takes a credentials mode. While a line runs
// an empty frame "{}" goes out every 20 s: OnDemand's shell parses it and ignores it (neither input nor
// resize; OOD 4.1 app.js 253-260), and the traffic keeps Chrome's 30-second service-worker window
// open. It does not reset OnDemand's own idle timer (only input and output do), which is why the
// cluster tool prints its own keepalive line under `connect`. A password prompt before anything is
// typed ends the run with nothing typed, as a distinct outcome: the one-time key step follows (AM2).
import type { PortalNet, WsLike } from './net';

/**
 * control sequences and carriage returns, as the vendor's phone host (phone.js) strips them. In a JavaScript class
 * `\/` is the slash itself, so the CSI intermediates [ -\/] are space to slash (0x20-0x2F), as they should be; the
 * same text in a sed bracket expression is space to backslash, the framework's defect fixed in framework 14
 * (test/shell.test.ts pins it: ESC[K right before a link takes nothing with it)
 */
export const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b[()][A-Za-z0-9]|\r/g;

export function clean(s: string): string {
  return String(s).replace(ANSI, '');
}

/** what the login node says when it wants a password: the shell reached no prompt without one */
export const PASSWORD_PROMPT = /password:|passphrase|Permission denied/i;

/**
 * A prompt for a password, a passphrase or a code, waiting at the end of the output (the last line has
 * no newline yet). Watched for after a line was typed too, until the line is seen to run: ssh would have
 * read that line as a password, and nothing more may be typed.
 */
export const PASSWORD_ASK = /(password|passphrase|verification code|one-time code)[^\n]*:\s*$/i;

/** sshd prints this only once the sign-in went through (PrintLastLog): a shell is coming */
export const SIGNED_IN_SIGN = /(^|\n)Last login:/;

/**
 * The last line of what the login node said ends like a shell's prompt: "[st1234@warrior ~]$ ",
 * "st1234@login1:~$ ", "bash-4.2# ", "host% ", "> ". A banner line ends with a newline and a password
 * prompt with a colon, so neither reads as one. Evidence, not a guess, that a shell is up: nothing is
 * typed before it (or before a long quiet after sshd's "Last login", for a prompt of an unusual shape).
 */
export function looksLikePrompt(cleaned: string): boolean {
  const lines = String(cleaned ?? '').split('\n');
  const last = lines[lines.length - 1] ?? '';
  return /[$#%>]\s*$/.test(last) && !PASSWORD_ASK.test(last);
}

/**
 * With output and no prompt of a known shape, the shell is taken as up after this long quiet only when
 * sshd said "Last login" (a signed-in session with an unusual prompt). Never on silence alone, never
 * when no output came at all: the line is then not typed, and the sitting ends in words.
 */
export const QUIET_TYPE_MS = 4_000;
/** a shell that has said nothing at all this long after it opened is given up (nothing typed) */
export const SILENT_GIVE_UP_MS = 30_000;

/** the shell is up: a prompt of a known shape, or sshd's "Last login" followed by a long quiet */
function shellUp(cleaned: string, quietMs: number): boolean {
  if (PASSWORD_PROMPT.test(cleaned)) return false;
  if (looksLikePrompt(cleaned)) return true;
  return SIGNED_IN_SIGN.test(cleaned) && quietMs >= QUIET_TYPE_MS;
}

/** an empty frame every this often while a line runs (messages.ts SHELL_KEEPALIVE_MS says the same) */
export const KEEPALIVE_FRAME_MS = 20_000;

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
  // the code and the raw reason stay on the ShellError for the log; the student gets a sentence
  return "The connection to the portal's shell closed early. Try again; if it keeps happening, sign in to the portal again in its tab.";
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

/**
 * The only frames ever sent: {"input": "..."}, {"resize": {...}} and the empty keepalive {}. Anything
 * else is refused before it reaches the socket (a frame the server does not understand, or that is
 * not JSON, would throw inside the student's shell process).
 */
export function frameAllowed(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0) return true;
  return keys.length === 1 && (('input' in obj && typeof obj.input === 'string') || ('resize' in obj && !!obj.resize && typeof obj.resize === 'object'));
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
  /** the page GET's credentials mode: "same-origin" from a page on the portal, "include" from the background */
  credentials?: RequestCredentials;
  /** wait for the command's end marker at most this long */
  timeoutMs?: number;
  /** time to wait for the prompt to settle before typing */
  settleMs?: number;
  connectTimeoutMs?: number;
  /** the empty keepalive frame's period; 0 sends none */
  keepaliveMs?: number;
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
  /** the portal answered the shell page with this status (401 and 403: the grid sign-in is gone) */
  status?: number;
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

/**
 * The login node asked for a password before anything was typed: nothing was typed, and the run
 * ended. The one-time key step (AM2) is what follows; Beethoven never types a password.
 */
export class PasswordError extends ShellError {
  readonly password = true;
  constructor(transcript = '') {
    super('the grid asked for a password before the line was typed; nothing was typed', transcript);
    this.name = 'PasswordError';
  }
}

export function isPasswordError(e: unknown): boolean {
  return !!e && typeof e === 'object' && ((e as { name?: string }).name === 'PasswordError' || (e as { password?: boolean }).password === true);
}

export interface ShellSessionOpts {
  origin: string;
  host: string;
  /** typed exactly as given, once, after the login prompt has settled */
  command: string;
  net: PortalNet;
  credentials?: RequestCredentials;
  /** every text frame, terminal codes stripped, as it arrives */
  onOutput(text: string): void;
  connectTimeoutMs?: number;
  settleMs?: number;
  /** the whole sitting is closed after this long whatever state it is in */
  maxMs?: number;
  keepaliveMs?: number;
}

export interface ShellSessionEnd {
  /** "password": the login node asked for a password before the line was typed, and nothing was typed */
  reason: 'closed' | 'client' | 'timeout' | 'password';
  closeCode?: number;
  closeReason?: string;
  /** bytes received from the shell */
  outputBytes: number;
  /** bytes typed by the student, counted and never kept */
  inputBytes: number;
  ms: number;
}

export interface ShellSession {
  /** type into the shell; the text is counted for the audit record and never stored */
  send(text: string): void;
  close(): void;
  readonly done: Promise<ShellSessionEnd>;
}

/**
 * The longest a sitting may hold the portal's shell open: fifteen minutes, the number the privacy
 * statement gives ("the extension closes the connection after fifteen minutes at the latest",
 * PRIVACY.md). The cluster tool's `connect` ends within fourteen (docs/V11_CONTRACT.md D7).
 */
export const SESSION_MAX_MS = 15 * 60_000;

async function shellToken(o: { origin: string; host: string; net: PortalNet; credentials?: RequestCredentials }): Promise<string> {
  const page = await o.net.fetch(shellPageUrl(o.origin, o.host), { credentials: o.credentials ?? 'same-origin', redirect: 'follow', headers: { Accept: 'text/html' }, cache: 'no-store' });
  if (!page.ok) {
    const e = new ShellError(`the portal's Shell app answered ${page.status}; sign in to the grid again and try again`);
    e.status = page.status;
    throw e;
  }
  let final: URL | undefined;
  try {
    final = new URL(page.url || shellPageUrl(o.origin, o.host));
  } catch {
    final = undefined;
  }
  if (final && final.origin !== new URL(o.origin).origin) {
    const e = new ShellError("the portal sent the Shell app's page to another site to sign in; sign in to the grid again");
    e.status = 401;
    throw e;
  }
  const csrf = scrapeCsrf(await page.text());
  if (!csrf) throw new ShellError("the portal's Shell app page carries no token; the Shell app may be disabled at your site");
  return csrf;
}

function startKeepalive(ws: WsLike, ms: number | undefined, timers: ReturnType<typeof setInterval>[]): void {
  const every = ms ?? KEEPALIVE_FRAME_MS;
  if (!every) return;
  const t = setInterval(() => {
    try {
      if (ws.readyState === 1) ws.send('{}');
    } catch {
      /* closing */
    }
  }, every);
  timers.push(t);
}

/**
 * The interactive form of the shell, for the one sitting that needs a person (`hpcworker connect`):
 * open, type one command line, then relay output out and typed text in until the far side closes,
 * the caller closes, or the time is up. Nothing is framed or parsed here; the caller reads the lines.
 * An empty frame goes out every 20 s while it is open. A password prompt before the line is typed
 * ends the sitting with reason "password" and nothing typed.
 */
export async function openShell(o: ShellSessionOpts): Promise<ShellSession> {
  const t0 = Date.now();
  if (!o.command.trim() || /[\r\n]/.test(o.command)) throw new ShellError('the login terminal runs exactly one command line');
  const csrf = await shellToken(o);
  const ws: WsLike = new o.net.WebSocket(shellSocketUrl(o.origin, o.host, csrf));
  let outputBytes = 0;
  let inputBytes = 0;
  let typed = false;
  let raw = '';
  let ended: ShellSessionEnd | undefined;
  let resolveDone!: (e: ShellSessionEnd) => void;
  const done = new Promise<ShellSessionEnd>((r) => (resolveDone = r));
  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
  };
  const end = (reason: ShellSessionEnd['reason'], code?: number, why?: string) => {
    if (ended) return;
    ended = { reason, closeCode: code, closeReason: why, outputBytes, inputBytes, ms: Date.now() - t0 };
    for (const t of timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    try {
      if (ws.readyState === 0 || ws.readyState === 1) ws.close(1000, 'done');
    } catch {
      /* already closing */
    }
    resolveDone(ended);
  };
  const sendFrame = (obj: Record<string, unknown>) => {
    if (!frameAllowed(obj)) throw new Error('refusing to send a frame the shell does not understand');
    ws.send(JSON.stringify(obj));
  };
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let quietTimer: ReturnType<typeof setTimeout> | undefined;
  let lastOutAt = 0;
  /** after the line was typed: until the line is seen to run, a password prompt means it went to ssh */
  let afterTyping = '';
  let running = false;
  const marker = o.command.slice(0, 24);
  const type = () => {
    if (typed || ended) return;
    typed = true;
    try {
      sendFrame({ input: `${o.command}\r` });
    } catch (e) {
      end('client', undefined, `could not type the command: ${(e as Error).message}`);
    }
  };
  /** type only on evidence that a shell is up (a prompt, or "Last login" and a quiet); never on silence */
  const tryType = () => {
    if (typed || ended) return;
    const c = clean(raw);
    if (shellUp(c, Date.now() - lastOutAt)) type();
    else if (SIGNED_IN_SIGN.test(c) && !quietTimer) {
      quietTimer = setTimeout(() => {
        quietTimer = undefined;
        tryType();
      }, QUIET_TYPE_MS);
      timers.push(quietTimer);
    }
  };
  const settle = () => {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(tryType, o.settleMs ?? 400);
    timers.push(settleTimer);
  };
  return new Promise<ShellSession>((resolve, reject) => {
    let opened = false;
    later(() => {
      if (!opened) {
        end('timeout');
        reject(new ShellError('the portal shell did not open in time'));
      }
    }, o.connectTimeoutMs ?? 15_000);
    later(() => end('timeout'), o.maxMs ?? SESSION_MAX_MS);
    ws.addEventListener('open', () => {
      opened = true;
      try {
        sendFrame({ resize: { cols: 120, rows: 40 } });
      } catch {
        /* harmless */
      }
      startKeepalive(ws, o.keepaliveMs, timers);
      // a shell that says nothing at all: given up with nothing typed (no blind typing on silence)
      later(() => {
        if (!typed && !raw) end('timeout', undefined, 'the shell said nothing');
      }, SILENT_GIVE_UP_MS);
      resolve({
        send(text: string) {
          if (ended) return;
          inputBytes += new TextEncoder().encode(text).length;
          sendFrame({ input: text });
        },
        close() {
          end('client');
        },
        done,
      });
    });
    ws.addEventListener('message', (ev: { data: unknown }) => {
      if (typeof ev.data !== 'string') return;
      outputBytes += ev.data.length;
      lastOutAt = Date.now();
      const text = clean(ev.data);
      if (!typed) {
        raw += ev.data;
        if (PASSWORD_PROMPT.test(clean(raw))) {
          end('password');
          return;
        }
        settle();
      } else if (!running) {
        // the line was typed: it runs once its echo or the tool's own first line comes back; a password
        // prompt before that means ssh took it as a password (nothing more is typed, ever)
        afterTyping += text;
        if (afterTyping.includes(marker) || afterTyping.includes('HPCW-')) running = true;
        else if (PASSWORD_ASK.test(afterTyping) || /Permission denied/i.test(afterTyping)) {
          end('password');
          return;
        }
        if (afterTyping.length > 20_000) running = true;
      }
      o.onOutput(text);
    });
    ws.addEventListener('close', (ev: { code: number; reason: string }) => {
      if (!opened) reject(new ShellError(explainClose(ev.code, ev.reason), clean(raw), ev.code, ev.reason));
      end('closed', ev.code, ev.reason);
    });
    ws.addEventListener('error', () => {
      later(() => {
        if (!ended) {
          if (!opened) reject(new ShellError('the connection to the portal shell failed'));
          end('closed');
        }
      }, 1_000);
    });
  });
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
  const csrf = await shellToken(o);

  const transcript = new ShellTranscript(nonce);
  const ws: WsLike = new o.net.WebSocket(shellSocketUrl(o.origin, o.host, csrf));
  let closed: { code: number; reason: string } | undefined;
  let typed = false;
  let lastFrameAt = 0;

  const send = (obj: Record<string, unknown>) => {
    if (!frameAllowed(obj)) throw new Error('refusing to send a frame the shell does not understand');
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
      for (const t of timers) {
        clearTimeout(t);
        clearInterval(t);
      }
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
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const tryType = () => {
      if (typed || finished) return;
      const c = transcript.cleaned;
      if (shellUp(c, Date.now() - lastFrameAt)) type();
      else if (SIGNED_IN_SIGN.test(c) && !quietTimer) {
        quietTimer = later(() => {
          quietTimer = undefined;
          tryType();
        }, QUIET_TYPE_MS);
      }
    };
    const settle = () => {
      // the far side is a fresh login shell with a banner; type once it shows its prompt (never on silence alone)
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(tryType, o.settleMs ?? 400);
    };

    later(() => finish(new ShellError('the portal shell did not open in time', transcript.cleaned)), o.connectTimeoutMs ?? 15_000);

    ws.addEventListener('open', () => {
      try {
        send({ resize: { cols: 200, rows: 50 } });
      } catch {
        /* a failed resize is harmless */
      }
      startKeepalive(ws, o.keepaliveMs, timers);
      // a login shell that prints nothing at all is given up with nothing typed (no blind typing on silence)
      later(() => {
        if (!typed && !lastFrameAt) finish(new ShellError('the portal shell said nothing', transcript.cleaned));
      }, SILENT_GIVE_UP_MS);
    });
    ws.addEventListener('message', (ev: { data: unknown }) => {
      const data = ev.data;
      lastFrameAt = Date.now();
      transcript.feed(data);
      if (typeof data === 'string') {
        o.onFrame?.(clean(data));
        if (!typed) {
          if (PASSWORD_PROMPT.test(clean(transcript.raw))) {
            finish(new PasswordError(transcript.cleaned));
            return;
          }
          settle();
        } else if (transcript.phase === 'waiting' && PASSWORD_ASK.test(transcript.cleaned)) {
          // typed, and the begin marker never came back: ssh took the line as a password; stop here
          finish(new PasswordError(transcript.cleaned));
          return;
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

/** what one test of the shell found: a prompt with no password ("ok"), a password prompt, or no word either way in time */
export type ShellTestResult = 'ok' | 'password' | 'unknown';

export interface ShellTestOpts {
  origin: string;
  host: string;
  net: PortalNet;
  credentials?: RequestCredentials;
  /** quiet time after the last output that counts as a settled prompt */
  settleMs?: number;
  /** how long to wait for any output at all */
  firstOutputMs?: number;
  connectTimeoutMs?: number;
}

/**
 * The channel test's shell half (and AM2's re-test): open one shell, wait for the login node's first
 * words, and say whether they settled into a prompt with no password asked ("ok") or asked for one
 * ("password"). Nothing is typed but `exit` after a prompt; the socket is always closed. A refused
 * handshake (the browser did not carry the grid sign-in on the socket) throws a ShellError.
 */
export async function testShell(o: ShellTestOpts): Promise<ShellTestResult> {
  const csrf = await shellToken(o);
  const ws: WsLike = new o.net.WebSocket(shellSocketUrl(o.origin, o.host, csrf));
  return new Promise<ShellTestResult>((resolve, reject) => {
    let raw = '';
    let opened = false;
    let finished = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (r?: ShellTestResult, err?: Error) => {
      if (finished) return;
      finished = true;
      for (const t of timers) clearTimeout(t);
      if (settleTimer) clearTimeout(settleTimer);
      try {
        if (r === 'ok' && ws.readyState === 1) ws.send(JSON.stringify({ input: 'exit\r' }));
      } catch {
        /* closing */
      }
      try {
        if (ws.readyState === 0 || ws.readyState === 1) ws.close(1000, 'done');
      } catch {
        /* closing */
      }
      if (err) reject(err);
      else resolve(r ?? 'unknown');
    };
    timers.push(setTimeout(() => finish(undefined, new ShellError('the portal shell did not open in time')), o.connectTimeoutMs ?? 15_000));
    ws.addEventListener('open', () => {
      opened = true;
      try {
        ws.send(JSON.stringify({ resize: { cols: 120, rows: 40 } }));
      } catch {
        /* harmless */
      }
      // no answer either way in time: "unknown" (never "ok" on output that showed no prompt)
      timers.push(setTimeout(() => finish(shellUp(clean(raw), Date.now() - lastAt) ? 'ok' : 'unknown'), o.firstOutputMs ?? 8_000));
    });
    let lastAt = 0;
    ws.addEventListener('message', (ev: { data: unknown }) => {
      if (typeof ev.data !== 'string') return;
      raw += ev.data;
      lastAt = Date.now();
      if (PASSWORD_PROMPT.test(clean(raw))) return finish('password');
      if (settleTimer) clearTimeout(settleTimer);
      // "ok" only on evidence a shell is up: its prompt, or sshd's "Last login" and then a quiet
      const check = () => {
        if (shellUp(clean(raw), Date.now() - lastAt)) finish('ok');
        else if (SIGNED_IN_SIGN.test(clean(raw))) settleTimer = setTimeout(check, QUIET_TYPE_MS);
      };
      settleTimer = setTimeout(check, o.settleMs ?? 600);
    });
    ws.addEventListener('close', (ev: { code: number; reason: string }) => {
      if (!opened) return finish(undefined, new ShellError(explainClose(ev.code, ev.reason), clean(raw), ev.code, ev.reason));
      const c = clean(raw);
      finish(PASSWORD_PROMPT.test(c) ? 'password' : looksLikePrompt(c) || SIGNED_IN_SIGN.test(c) ? 'ok' : 'unknown');
    });
    ws.addEventListener('error', () => {
      timers.push(
        setTimeout(() => {
          if (!opened) finish(undefined, new ShellError('the connection to the portal shell failed'));
        }, 1_000),
      );
    });
  });
}
