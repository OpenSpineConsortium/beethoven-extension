// The debug log (14.0.0): what the background does under the hood, one line per decision, so a student who is
// stuck can press More, Copy debug log, and paste it to their lab lead. Greg, 2026-10-03: "there should be a
// detailed log of what you are doing under the hood so i can paste it into here, maybe a debugging log in addition
// to the simple log". Show log stays the simple one, in the student's words; this one is in the tool's own words.
//
// A ring of at most DEBUG_MAX lines in the background's memory, newest last. It survives nothing: a service worker
// that Chrome stops, a browser restart or an update starts it empty. It is never written to storage and never sent
// anywhere; it leaves the background only as the text a page asks for (Copy debug log, and the last
// DEBUG_DETAILS_LINES lines on Details for your lab lead).
//
// Two walls keep secrets out. The first is the callers: no line is ever made from a password, a one-time code, a
// pasted Claude code, a key, a token or an authorize link (the background logs action kinds, never their fields; a
// sitting's events by kind; a link by its host and path). The second is here: every line passes through debugSafe
// on the way in, which cuts every web address to its host and path, and removes anything key-, token- or
// code-shaped, whatever a caller handed it.
import { redact } from './redact';

/** the ring's size: at most this many lines are kept, the oldest dropped first */
export const DEBUG_MAX = 3000;
/** how many of the newest lines Details for your lab lead shows */
export const DEBUG_DETAILS_LINES = 200;
/** a line's text is cut to this many characters */
export const DEBUG_LINE_MAX = 400;
/** a command's output is shown by its first this many characters */
export const DEBUG_OUTPUT_MAX = 160;

export interface DebugEntry {
  /** when (ISO, this computer's clock) */
  at: string;
  /** a short word: what kind of decision (sw, mode, bridge, ssh, gate, read, press, ready, sheet, access, sitting, fail, …) */
  tag: string;
  text: string;
  /** the same line again right after itself: how many times in all, and when last */
  n?: number;
  last?: string;
}

/** what the header line names */
export interface DebugHeader {
  version: string;
  mode: string;
  portal?: string;
  account?: string;
  worker?: string;
  /** ms since the epoch */
  at: number;
}

/** keys first, before anything else can cut them in pieces: a key in PEM form, whole; an ssh public key line's body (the type stays) */
const KEY_RULES: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g, '[key]'],
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*/g, '[key]'],
  [/\b(ssh-ed25519|ssh-rsa|ssh-dss|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com)\s+[A-Za-z0-9+/=]+/g, '$1 [key]'],
];

const RULES: Array<[RegExp, string]> = [
  // a one-time code, a password or a pin named as such, with its value
  // (not a word ending in one of them: "signin-code: the code was refused" keeps its words)
  [/(?<![\w-])(one[- ]time code|otp|totp|passcode|password|passwd|pin|code)(\s*[=:]\s*)\S+/gi, '$1$2[redacted]'],
  // a JSON web token
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[redacted]'],
  // base64url this long is a key, a code or a token until proven otherwise; job ids, names and hosts are short
  [/[A-Za-z0-9_-]{32,}/g, '[redacted]'],
];

/**
 * base64 with + and / this long: a key or a code, unless it reads as a path (a run of short words between slashes,
 * /rs/rs_grp_oschome/shared/beethoven/hpcworker/current): one with + or =, or a stretch of 24 or more between
 * slashes, goes
 */
function base64Runs(s: string): string {
  return s.replace(/[A-Za-z0-9+/]{40,}={0,2}/g, (m) => (/[+=]/.test(m) || m.split('/').some((part) => part.length >= 24) ? '[redacted]' : m));
}

/** a web address cut to its host and path: no query, no fragment, no user or password */
function hostAndPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return '[link]';
  }
}

/**
 * One line made safe for the ring: keys first (a PEM block, an ssh key line's body), then on one line, every web
 * address cut to its host and path (an authorize link keeps no code_challenge, no state, no redirect), every long
 * base64 run, the audit log's redaction (core/redact.ts), named codes and passwords, and tokens. What is left is cut
 * to DEBUG_LINE_MAX characters.
 */
export function debugSafe(text: unknown): string {
  let s = String(text ?? '');
  for (const [re, rep] of KEY_RULES) s = s.replace(re, rep);
  s = s.replace(/[\r\n\t]+/g, ' | ').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  s = s.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>|]+/gi, (m) => hostAndPath(m));
  s = base64Runs(s);
  s = redact(s);
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  return s.length > DEBUG_LINE_MAX ? `${s.slice(0, DEBUG_LINE_MAX - 1)}…` : s;
}

/** a command's output as one short line: its first DEBUG_OUTPUT_MAX characters, made safe */
export function debugOutput(text: unknown): string {
  const s = debugSafe(String(text ?? '').trim());
  return s.length > DEBUG_OUTPUT_MAX ? `${s.slice(0, DEBUG_OUTPUT_MAX - 1)}…` : s;
}

const safeTag = (tag: string): string => (String(tag ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12) || 'note');

/** one entry as a line: "<ISO> <tag> <text>", with "(x3, last <ISO>)" when it came again right after itself */
export function formatEntry(e: DebugEntry): string {
  return `${e.at} ${e.tag} ${e.text}${e.n && e.n > 1 ? ` (x${e.n}, last ${e.last ?? e.at})` : ''}`;
}

/** the one-line header Copy debug log puts first */
export function debugHeader(h: DebugHeader, lines: number): string {
  const one = (v: string | undefined) => debugSafe(v && v.trim() ? v.trim() : '-');
  return `Beethoven ${one(h.version)} debug log · mode ${one(h.mode)} · portal ${one(h.portal)} · account ${one(h.account)} · worker ${one(h.worker)} · ${new Date(h.at).toISOString()} · ${lines} line${lines === 1 ? '' : 's'}, newest last`;
}

/** The ring. Pure: the clock is given, nothing is stored or sent. */
export class DebugRing {
  private readonly lines: DebugEntry[] = [];

  constructor(
    private readonly max: number = DEBUG_MAX,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** one line: made safe, cut, stamped; the same tag and text right after itself only counts again */
  add(tag: string, text: unknown): void {
    const at = new Date(this.now()).toISOString();
    const entry: DebugEntry = { at, tag: safeTag(tag), text: debugSafe(text) };
    const prev = this.lines[this.lines.length - 1];
    if (prev && prev.tag === entry.tag && prev.text === entry.text) {
      prev.n = (prev.n ?? 1) + 1;
      prev.last = at;
      return;
    }
    this.lines.push(entry);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }

  get size(): number {
    return this.lines.length;
  }

  /** the entries, oldest first (a copy) */
  entries(): DebugEntry[] {
    return this.lines.map((e) => ({ ...e }));
  }

  /** the newest `n` lines as text lines, oldest of them first */
  tail(n: number): string[] {
    return this.lines.slice(-Math.max(0, n)).map(formatEntry);
  }

  /** Copy debug log: the header, then every line, newest last */
  text(header: DebugHeader): string {
    return [debugHeader(header, this.lines.length), ...this.lines.map(formatEntry)].join('\n') + '\n';
  }

  clear(): void {
    this.lines.length = 0;
  }
}
