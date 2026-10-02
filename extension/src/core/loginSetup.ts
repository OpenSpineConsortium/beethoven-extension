// AM2: the one-time key step inside the first Connect. UNPROVEN ON THE GRID until a student without a
// key has tried it (contract.ts LOGIN_SETUP_PROVEN).
//
// When the portal's Shell asks for a password while a press waits, the panel offers "Open the grid
// terminal". The student's only act is typing their grid password into the university's own terminal
// page; Beethoven never sees it. Beethoven types nothing while the terminal may still be at the
// password prompt: it types the one line (`bash <shared>/bin/hpcworker login-setup`) only after the
// student's "I'm in", or after its page script saw the page title change to the shell's own title
// (st1234@warrior:~), never on a guess or a timer. Then it re-tests its own channel; on success it
// closes the terminal tab it opened, says "Done. You won't need this again." and the press that was
// waiting carries on. After 10 s of failures the panel falls back to "Paste, then press Enter." (the
// line is on the clipboard since the click on "Open the grid terminal"); if the tab is closed first,
// "Not done yet." Nothing about the key is kept in the browser: the flow holds the line (which carries
// no secret) and its phase, nothing else.
//
// The flow is a class with its browser and its clock injected, so the timing is tested in Node.
import type { TerminalTyped } from './messages';
import type { LoginSetupMoment } from './model';
import type { ShellTestResult } from './shell';

export type LoginSetupPhase = LoginSetupMoment['phase'];

/** the re-test cadence while "Checking…" (AM2: every two seconds) */
export const RETEST_MS = 2_000;
/** "Paste, then press Enter." after this long of failed tests */
export const PASTE_AFTER_MS = 10_000;
/**
 * The re-test cadence once the panel says "Paste, then press Enter.". AM2 and the contract say every
 * 2 s for up to 5 minutes; each test is one ssh login from the OnDemand server that stops at the
 * password prompt, and 150 of those in five minutes can look like an attack to the login node's
 * defences (a ban there would stop every student's shell). This build tests every 10 s after the
 * first 10 s: a departure, said in the build report.
 */
export const PASTE_RETEST_MS = 10_000;
/** testing stops this long after the line was typed (the panel stays on "Paste, then press Enter.") */
export const GIVE_UP_MS = 5 * 60_000;

export interface LoginSetupDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** open the grid's terminal page in a tab in front, in the panel's window; false when it could not */
  openTerminal(): Promise<boolean>;
  /** ask Beethoven's page script in that tab to type the line and Enter */
  type(line: string): Promise<TerminalTyped>;
  /** one test of Beethoven's own channel to the shell */
  test(): Promise<ShellTestResult | 'error'>;
  /** the terminal tab Beethoven opened still exists */
  terminalOpen(): Promise<boolean>;
  /** close the terminal tab, under the guards (only while it is on the Shell page; never the window's last tab) */
  closeTerminal(): Promise<void>;
  /** the phase changed: push a new view */
  changed(phase: LoginSetupPhase): void;
  /** the key step is done: the press that was waiting carries on */
  done(): void;
}

export class LoginSetupFlow {
  phase: LoginSetupPhase = 'offer';
  private typedAt: number | undefined;
  private timer: unknown;
  private busy = false;
  private stopped = false;

  constructor(
    readonly line: string,
    private readonly d: LoginSetupDeps,
  ) {}

  private set(p: LoginSetupPhase): void {
    if (this.phase === p) return;
    this.phase = p;
    this.d.changed(p);
  }

  /** "Open the grid terminal" (the page already put the line on the clipboard inside its click) */
  async open(): Promise<boolean> {
    if (this.phase === 'done') return false;
    this.clear();
    const ok = await this.d.openTerminal();
    if (!ok) return false;
    this.typedAt = undefined;
    this.set('password');
    return true;
  }

  /**
   * "I'm in", or the page script's sign that the shell is up. Only now is anything typed: the one line
   * and Enter. An older terminal Beethoven cannot type into goes straight to "Paste, then press Enter."
   */
  async imIn(): Promise<TerminalTyped | undefined> {
    if (this.phase !== 'password' || this.busy) return undefined;
    this.busy = true;
    let r: TerminalTyped;
    try {
      r = await this.d.type(this.line);
    } catch {
      r = { typed: false, how: 'unsupported', why: 'unsupported' };
    } finally {
      this.busy = false;
    }
    if (this.phase !== 'password') return r;
    this.typedAt = this.d.now();
    this.set(r.typed ? 'checking' : 'paste');
    this.schedule(RETEST_MS);
    return r;
  }

  /** the page script saw the title change to the shell's own (D31): the same as "I'm in" */
  shellUp(): Promise<TerminalTyped | undefined> {
    return this.imIn();
  }

  /** the terminal tab is gone: one last test (the student may have pasted the line and closed it), then "Not done yet." */
  async tabClosed(): Promise<void> {
    if (this.phase === 'done' || this.phase === 'offer' || this.phase === 'closed') return;
    this.clear();
    const r = this.typedAt !== undefined ? await this.d.test().catch(() => 'error' as const) : 'unknown';
    if (r === 'ok') return this.finish(false);
    this.set('closed');
  }

  /** the flow is dropped (the press was cancelled, the panel's journey moved on) */
  stop(): void {
    this.stopped = true;
    this.clear();
  }

  private clear(): void {
    if (this.timer !== undefined) this.d.clearTimer(this.timer);
    this.timer = undefined;
  }

  private schedule(ms: number): void {
    this.clear();
    if (this.stopped) return;
    this.timer = this.d.setTimer(() => {
      this.timer = undefined;
      void this.tick();
    }, ms);
  }

  private async tick(): Promise<void> {
    if (this.stopped || (this.phase !== 'checking' && this.phase !== 'paste')) return;
    if (this.typedAt !== undefined && this.d.now() - this.typedAt > GIVE_UP_MS) return;
    if (!(await this.d.terminalOpen().catch(() => false))) return this.tabClosed();
    const r = await this.d.test().catch(() => 'error' as const);
    if (this.stopped || (this.phase !== 'checking' && this.phase !== 'paste')) return;
    if (r === 'ok') return this.finish(true);
    if (this.phase === 'checking' && this.typedAt !== undefined && this.d.now() - this.typedAt >= PASTE_AFTER_MS) this.set('paste');
    this.schedule(this.phase === 'paste' ? PASTE_RETEST_MS : RETEST_MS);
  }

  private async finish(closeTab: boolean): Promise<void> {
    this.clear();
    if (closeTab) await this.d.closeTerminal().catch(() => undefined);
    this.set('done');
    this.d.done();
  }
}
