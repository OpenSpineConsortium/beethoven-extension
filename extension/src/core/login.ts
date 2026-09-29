// The login terminal's reader: it turns the plain-mode sitting's output into events. The text
// arrives in frames that split lines anywhere, so complete lines are assembled first; each is then
// matched against the framework's lines (contract.ts, LOGIN_LINES). Only an AUTH-URL on
// claude.ai or claude.com is ever handed on to be opened; anything else on that line is reported
// as a refusal and the sitting continues so the student can read what happened. No browser
// import: the tests feed frames in and read events out.
import { isClaudeAuthUrl, parseLoginLine, type LoginEvent } from './contract';
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
