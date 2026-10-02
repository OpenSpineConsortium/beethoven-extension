// AM2: what Beethoven's page script does on the grid's own terminal page (the Shell app at
// /pun/sys/shell/ssh/<host>), as functions over an injected page, so the rules are tested in Node.
// UNPROVEN ON THE GRID until a student without a key has tried it.
//
// It reads the page title and nothing else: no keyboard, input or clipboard listener, nothing of the
// terminal's contents, nothing stored. It tells the background once that the shell is up (the title,
// changed since the script loaded, begins "<AccessID>@", the title bash sets for an xterm terminal,
// D31); the password prompt never changes the title. It types exactly one line, the one that passes
// contract.ts isLoginSetupLine, and only when the background asks (after the student's "I'm in" or that
// sign), into xterm.js's helper textarea: a synthetic paste event carrying the line, then an input event
// carrying "\r" (D30: a synthetic keydown cannot carry its keyCode across the page script's isolated
// world, an input event with inputType "insertText" reaches xterm.js's own handler). An older terminal
// with no such textarea (hterm, OnDemand before its xterm.js shell) gets nothing typed; the student
// pastes the line from the clipboard instead.
import { isLoginSetupLine } from './contract';
import type { TerminalTyped } from './messages';

/**
 * The shell is up: the title changed since the script loaded, and it is the title bash sets for an
 * xterm terminal, "<user>@<host>:<dir>" (st1234@warrior:~). The account first, then a plain host name
 * and a colon: "st1234@login1's password:" never matches, should anything put a prompt in the title.
 */
export function titleSaysShellUp(initialTitle: string, title: string, account: string): boolean {
  const a = String(account ?? '').trim();
  if (!a || title === initialTitle) return false;
  const t = title.trim();
  if (!t.startsWith(`${a}@`)) return false;
  return /^[A-Za-z0-9._-]+:/.test(t.slice(a.length + 1));
}

/** the page's title, and a way to hear it change (a MutationObserver on <title> in the page script) */
export interface TitleSource {
  readonly title: string;
  /** call `cb` on every change of the title; returns the way to stop listening */
  onChange(cb: () => void): () => void;
}

/**
 * Watch the title and call `onUp` once, when titleSaysShellUp holds; the title seen when watching
 * starts is the one the change is measured from. Returns the way to stop. No title text leaves here.
 */
export function watchShellTitle(src: TitleSource, account: string, onUp: () => void, initialTitle = src.title): () => void {
  let fired = false;
  let stop: () => void = () => undefined;
  const check = () => {
    if (fired) return;
    if (titleSaysShellUp(initialTitle, src.title, account)) {
      fired = true;
      stop();
      onUp();
    }
  };
  stop = src.onChange(check);
  // a change that happened between loading and watching counts too
  check();
  return () => stop();
}

/** the slice of the page the typing needs */
export interface TerminalPage {
  /** xterm.js's hidden input: textarea.xterm-helper-textarea, or null on an older terminal */
  helperTextarea(): { focus(): void; dispatchEvent(ev: unknown): boolean } | null;
  /** new ClipboardEvent('paste', {clipboardData: <DataTransfer text/plain = text>, bubbles: true, cancelable: true}) */
  pasteEvent(text: string): unknown;
  /** new InputEvent('input', {data: '\r', inputType: 'insertText', bubbles: true}) */
  enterEvent(): unknown;
}

/** type the one login-setup line and Enter into the terminal, or say why not */
export function typeLoginSetupLine(page: TerminalPage, line: unknown): TerminalTyped {
  if (!isLoginSetupLine(line)) return { typed: false, how: 'unsupported', why: 'refused' };
  const ta = page.helperTextarea();
  if (!ta) return { typed: false, how: 'unsupported', why: 'unsupported' };
  ta.focus();
  ta.dispatchEvent(page.pasteEvent(line));
  ta.dispatchEvent(page.enterEvent());
  return { typed: true, how: 'xterm' };
}
