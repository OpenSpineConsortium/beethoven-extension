// The login terminal inside the panel: a port to the portal page script that runs exactly
// `hpcworker claude login --plain` in the portal's shell, the shell's text rendered with codes
// stripped and auto-scrolled, the AUTH-URL opened in a new tab (only claude.ai or claude.com),
// and one box, "Paste the code from that page here", whose content is sent as keystrokes and
// cleared. The code is never stored anywhere: not in storage, not in the audit log (which counts
// its bytes), not in this page beyond the box until Enter. Closing the panel disconnects the port,
// and the page script closes the shell with it.
import { browser } from 'wxt/browser';
import { isClaudeAuthUrl } from '../core/contract';
import { LOGIN_SEEN_KEY, type LoginSeen } from '../core/keys';
import { loginFailureSentence } from '../core/login';
import { LOGIN_PORT, type LoginIn, type LoginOut } from '../core/messages';
import { explainClose } from '../core/shell';
import { local } from '../ext/storage';
import { add, el } from './dom';

export interface TerminalHandlers {
  /** SIGNED-IN arrived: the step is green */
  onSignedIn(detail: string): void;
  /** HPCW-LOGIN-FAILED, a refused shell, or the shell closed before SIGNED-IN */
  onFailed(sentence: string): void;
  /** the sitting is over one way or the other (after onSignedIn or onFailed) */
  onClosed(): void;
}

export interface Terminal {
  root: HTMLElement;
  close(): void;
}

const MAX_CHARS = 60_000;

/** open the sitting now; the returned element is the terminal area to place in the strip */
export function openTerminal(tabId: number, h: TerminalHandlers): Terminal {
  const out = el('pre', { class: 'term', 'aria-live': 'polite', 'aria-label': 'Sign-in terminal' });
  const line = el('div', { class: 'muted small', text: 'Asking a compute node for Claude Code\'s sign-in...' });
  const input = el('input', { type: 'text', class: 'wide mono', placeholder: 'Paste the code from that page here', 'aria-label': 'Paste the code from that page here', autocomplete: 'off', spellcheck: 'false', disabled: true });
  const openAgain = el('button', { class: 'small', text: 'Open the sign-in page again', hidden: true });
  const root = el('div', { class: 'terminal' });
  add(root, line, out, el('div', { class: 'row' }, input, openAgain));
  let authUrl: string | undefined;
  let finished = false;
  let text = '';
  const append = (t: string) => {
    text = (text + t).slice(-MAX_CHARS);
    out.textContent = text;
    out.scrollTop = out.scrollHeight;
  };
  const port = browser.tabs.connect(tabId, { name: LOGIN_PORT });
  const post = (m: LoginIn) => {
    try {
      port.postMessage(m);
    } catch {
      /* the port is gone */
    }
  };
  const finish = (ok: boolean, sentence: string) => {
    if (finished) return;
    finished = true;
    input.disabled = true;
    line.className = ok ? 'ok small' : 'fail small';
    line.textContent = sentence;
    if (ok) h.onSignedIn(sentence);
    else h.onFailed(sentence);
  };
  const openPage = (url: string) => {
    if (!isClaudeAuthUrl(url)) return;
    void browser.tabs.create({ url });
  };
  openAgain.addEventListener('click', () => authUrl && openPage(authUrl));
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const code = input.value.trim();
    if (!code) return;
    // the pasted code goes to the shell as keystrokes and is forgotten here
    post({ type: 'input', text: `${code}\r` });
    input.value = '';
    line.textContent = 'Code sent; waiting for Claude Code to finish the sign-in...';
  });
  port.onMessage.addListener((m: unknown) => {
    const msg = m as LoginOut;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'open':
        line.textContent = 'The sign-in is starting on a compute node (this can take a minute while the scheduler finds one)...';
        break;
      case 'out':
        append(msg.text);
        break;
      case 'auth-url':
        authUrl = msg.url;
        openPage(msg.url);
        openAgain.hidden = false;
        input.disabled = false;
        input.focus();
        line.textContent = 'Sign in to Claude in the tab that opened and press Authorize; then paste the code it shows here and press Enter.';
        break;
      case 'refused-url':
        line.textContent = 'The sign-in printed a link that is not on claude.ai or claude.com; it was not opened. Ask the maintainer.';
        break;
      case 'code-prompt':
        input.disabled = false;
        input.focus();
        break;
      case 'signed-in':
        void local.set(LOGIN_SEEN_KEY, { at: new Date().toISOString(), detail: msg.detail } satisfies LoginSeen);
        finish(true, `Signed in to Claude on the cluster${msg.detail ? ` (${msg.detail})` : ''}.`);
        post({ type: 'close' });
        break;
      case 'failed':
        finish(false, loginFailureSentence(msg.detail));
        post({ type: 'close' });
        break;
      case 'error':
        finish(false, loginFailureSentence(msg.message));
        break;
      case 'closed': {
        if (finished) break;
        // the shell's close code becomes a sentence (explainClose); the raw reason is never shown
        const why = msg.reason === 'timeout' ? 'the sitting ran out of time' : msg.closeCode !== undefined && msg.closeCode !== 1000 ? explainClose(msg.closeCode, msg.closeReason ?? '') : 'the shell closed before the sign-in finished';
        finish(false, loginFailureSentence(why));
        break;
      }
    }
  });
  port.onDisconnect.addListener(() => {
    if (!finished) finish(false, loginFailureSentence('the portal tab went away'));
    h.onClosed();
  });
  return {
    root,
    close() {
      post({ type: 'close' });
      try {
        port.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
}
