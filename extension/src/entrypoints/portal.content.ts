// Beethoven's page script on the student's portal origin. 11.0.0 never registers it and lists it in no
// manifest entry: the background loads it with scripting.executeScript into a tab it opened itself,
// and only while that tab is on the one origin the student granted. It has two jobs.
//
// Tab mode (a portal whose sign-in the browser does not carry on the extension's own WebSocket): it
// answers operations from the extension (checked by sender.id), runs them through the portal client
// and its audit chokepoint with the page's own fetch and WebSocket, and hosts the `hpcworker connect`
// sitting behind a port (CONNECT_PORT), building the one line itself and sending back parsed events
// only, never the terminal's text. 10.0.0's login port (LOGIN_PORT) is kept for that build's panel.
//
// The one-time grid key step (AM2; UNPROVEN ON THE GRID until a student without a key has tried it),
// on the grid's own terminal page, in direct mode too: it watches the page title only (no keyboard,
// input or clipboard listener, nothing of the terminal's contents read, nothing stored), tells the
// background once that the shell is up, and types the one login-setup line when the background asks,
// after the student's "I'm in" or that sign (core/terminal.ts).
//
// It touches nothing else on the page: no DOM changes, no reading of forms, no listening to the page's
// own scripts. The message listener is attached before anything is awaited: a page loaded by
// scripting.executeScript is asked "are you there?" within milliseconds.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Audit } from '../core/audit';
import { isAnthropicHost } from '../core/connect';
import { commands, plausibleCode } from '../core/contract';
import { REVOKED_KEY } from '../core/keys';
import { ConnectWatcher, LoginWatcher } from '../core/login';
import { CONNECT_PORT, fail, LOGIN_PORT, succeed, type Answer, type ConnectIn, type ConnectOut, type LoginIn, type LoginOut, type Request, type TerminalTyped } from '../core/messages';
import { PORTAL_OPS, PortalClient, type PortalOp } from '../core/portal';
import type { ShellSession } from '../core/shell';
import { typeLoginSetupLine, watchShellTitle, type TerminalPage, type TitleSource } from '../core/terminal';
import { local, portalSettings } from '../ext/storage';

/** set on the page's window (the extension's own isolated world) by the first copy of this script in a tab */
const LOADED_MARKER = '__beethovenPortalScriptLoaded';

export default defineContentScript({
  // loaded by the background into its own tabs only; nothing here is applied at install
  registration: 'runtime',
  matches: [],
  runAt: 'document_idle',
  main() {
    // never on an Anthropic site, whatever loaded it: nothing of the extension runs there (core/connect.ts isAnthropicHost)
    if (isAnthropicHost(location.hostname)) return;
    // One copy per tab: a second load would answer every relayed call twice.
    const w = window as unknown as Record<string, unknown>;
    if (w[LOADED_MARKER]) return;
    w[LOADED_MARKER] = true;
    start();
  },
});

interface Ready {
  client: PortalClient;
}

type Port = { name: string; sender?: { id?: string }; postMessage(m: unknown): void; disconnect(): void; onMessage: { addListener(fn: (m: unknown) => void): void }; onDisconnect: { addListener(fn: () => void): void } };

function start(): void {
  const origin = location.origin;
  // the title when this script loaded: the shell's own title must be a change from it (D31)
  const initialTitle = document.title;
  // the client exists once the settings say this origin is the connected one; calls that arrive
  // earlier wait for that answer instead of finding no listener at all
  const ready: Promise<Ready | undefined> = (async () => {
    const settings = await portalSettings();
    // defence in depth: answer only on the connected origin
    if (!settings || settings.origin !== origin) return undefined;
    const audit = new Audit(local, {
      revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY),
    });
    const client = new PortalClient(origin, { fetch: (input, init) => window.fetch(input, init), WebSocket: window.WebSocket }, audit, { shellHost: settings.shell_host, credentials: 'same-origin', via: 'page' });
    return { client };
  })();
  let stopWatching: (() => void) | undefined;

  browser.runtime.onMessage.addListener((message: unknown, sender): Promise<Answer> | undefined => {
    if (sender.id !== browser.runtime.id) return undefined;
    const msg = message as Request;
    if (!msg || typeof msg !== 'object') return undefined;
    if (msg.type === 'portal.ping') return ready.then((r) => succeed(!!r));
    if (msg.type === 'portal.call') {
      if (!PORTAL_OPS.includes(msg.op)) return Promise.resolve(fail(new Error(`unknown portal operation ${String(msg.op)}`)));
      return ready.then((r) => {
        if (!r) return fail(new Error('this tab is not the connected portal'));
        const fn = r.client[msg.op as PortalOp] as (...a: unknown[]) => Promise<unknown>;
        return fn
          .apply(r.client, msg.args ?? [])
          .then((v) => succeed(v))
          .catch((e) => fail(e));
      });
    }
    // AM2: only on the grid's own terminal page
    if (msg.type === 'terminal.watch') {
      return ready.then((r) => {
        if (!r || !onShellPage()) return fail(new Error('not the grid terminal page'));
        stopWatching?.();
        stopWatching = watchShellTitle(titleSource(), String(msg.account ?? ''), () => {
          void browser.runtime.sendMessage({ type: 'terminal.shell-up' } satisfies Request).catch(() => undefined);
        }, initialTitle);
        return succeed({ watching: true });
      });
    }
    if (msg.type === 'terminal.type') {
      return ready.then((r) => {
        if (!r || !onShellPage()) return succeed({ typed: false, how: 'unsupported', why: 'refused' } satisfies TerminalTyped);
        return succeed(typeLoginSetupLine(terminalPage(), msg.line));
      });
    }
    return undefined;
  });

  browser.runtime.onConnect.addListener((port: Port) => {
    if (port.sender?.id !== browser.runtime.id) return;
    if (port.name === CONNECT_PORT) void hostConnect(port, ready);
    else if (port.name === LOGIN_PORT) void hostLogin(port, ready);
  });

  void ready.then(async (r) => {
    if (!r) return;
    try {
      await browser.runtime.sendMessage({ type: 'portal.hello', origin } satisfies Request);
    } catch {
      /* the background was asleep */
    }
  });
}

/** the Shell app's page (/pun/sys/shell/ssh/<host>) */
function onShellPage(): boolean {
  return /^\/pun\/sys\/shell\/ssh\//.test(location.pathname);
}

/** the page title, and a MutationObserver on <title> (the head's subtree, in case the element is replaced) */
function titleSource(): TitleSource {
  return {
    get title() {
      return document.title;
    },
    onChange(cb) {
      const target = document.head ?? document.documentElement;
      const mo = new MutationObserver(() => cb());
      mo.observe(target, { childList: true, characterData: true, subtree: true });
      return () => mo.disconnect();
    },
  };
}

/** xterm.js's helper textarea and the two synthetic events (D30); an older terminal has no such textarea */
function terminalPage(): TerminalPage {
  return {
    helperTextarea: () => document.querySelector<HTMLTextAreaElement>('textarea.xterm-helper-textarea'),
    pasteEvent(text) {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      return new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    },
    enterEvent: () => new InputEvent('input', { data: '\r', inputType: 'insertText', bubbles: true }),
  };
}

/**
 * One connect sitting behind one port (tab mode): the line is built here from the first frame's
 * options (commands.connect checks every value and refuses the rest); the terminal's text goes into
 * the reader and nowhere else; parsed events go back. The only text typed after the line is the
 * pasted code, and only in the shape of one (the background's code gate decides when).
 */
async function hostConnect(port: Port, ready: Promise<Ready | undefined>): Promise<void> {
  const say = (m: ConnectOut) => {
    try {
      port.postMessage(m);
    } catch {
      /* the opener is gone */
    }
  };
  let session: ShellSession | undefined;
  let gone = false;
  port.onDisconnect.addListener(() => {
    gone = true;
    session?.close();
  });
  const first = await new Promise<Extract<ConnectIn, { type: 'connect' }> | undefined>((resolve) => {
    const t = setTimeout(() => resolve(undefined), 10_000);
    port.onMessage.addListener((m: unknown) => {
      const msg = m as ConnectIn;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'connect') {
        clearTimeout(t);
        resolve(msg);
      } else if (msg.type === 'input' && typeof msg.text === 'string' && session) {
        // the pasted code and its Enter, in the shape of one only
        const code = msg.text.endsWith('\r') ? msg.text.slice(0, -1) : msg.text;
        if (plausibleCode(code) === code) session.send(`${code}\r`);
      } else if (msg.type === 'close') session?.close();
    });
  });
  const r = await ready;
  if (!r) return say({ type: 'error', message: 'this tab is not the connected portal' });
  if (!first) return say({ type: 'error', message: 'no connect frame arrived' });
  let line: string;
  try {
    line = commands.connect(first.sharedDir, first.options);
  } catch (e) {
    return say({ type: 'error', message: (e as Error).message });
  }
  const watcher = new ConnectWatcher((event) => say({ type: 'event', event }));
  try {
    session = await r.client.openLoginShell(line, (text) => watcher.feed(text));
  } catch (e) {
    say({ type: 'error', message: (e as Error).message });
    return;
  }
  if (gone) {
    session.close();
    return;
  }
  say({ type: 'open' });
  const end = await session.done;
  if (end.reason === 'password') say({ type: 'password' });
  say({ type: 'closed', reason: end.reason, closeCode: end.closeCode, closeReason: end.closeReason });
  try {
    port.disconnect();
  } catch {
    /* already gone */
  }
}

/** 10.0.0's login sitting behind one port; the port's life is the shell's life */
async function hostLogin(port: Port, ready: Promise<Ready | undefined>): Promise<void> {
  const say = (m: LoginOut) => {
    try {
      port.postMessage(m);
    } catch {
      /* the panel is gone */
    }
  };
  let session: ShellSession | undefined;
  let gone = false;
  port.onDisconnect.addListener(() => {
    gone = true;
    session?.close();
  });
  const r = await ready;
  if (!r) return say({ type: 'error', message: 'this tab is not the connected portal' });
  const watcher = new LoginWatcher((ev) => {
    if (ev.kind === 'auth-url') say({ type: 'auth-url', url: ev.url });
    else if (ev.kind === 'refused-url') say({ type: 'refused-url' });
    else if (ev.kind === 'code-prompt') say({ type: 'code-prompt' });
    else if (ev.kind === 'signed-in') say({ type: 'signed-in', detail: ev.detail });
    else if (ev.kind === 'failed') say({ type: 'failed', detail: ev.detail });
  });
  try {
    session = await r.client.openLoginShell(commands.claudeLoginPlain, (text) => {
      say({ type: 'out', text });
      watcher.feed(text);
    });
  } catch (e) {
    say({ type: 'error', message: (e as Error).message });
    return;
  }
  if (gone) {
    session.close();
    return;
  }
  say({ type: 'open' });
  port.onMessage.addListener((m: unknown) => {
    const msg = m as LoginIn;
    if (!msg || typeof msg !== 'object') return;
    // the typed text (the pasted code) goes straight to the shell and is kept nowhere
    if (msg.type === 'input' && typeof msg.text === 'string') session?.send(msg.text);
    else if (msg.type === 'close') session?.close();
  });
  const end = await session.done;
  say({ type: 'closed', reason: end.reason, closeCode: end.closeCode, closeReason: end.closeReason });
  try {
    port.disconnect();
  } catch {
    /* already gone */
  }
}
