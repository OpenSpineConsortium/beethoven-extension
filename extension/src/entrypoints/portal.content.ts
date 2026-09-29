// The page script on the student's portal origin: the extension's only network client. It is
// not in the manifest; the background registers it for the one origin the student granted from
// the toolbar click, and loads it into the tab that was already open. It answers operations from
// the extension (checked by sender.id), runs them through the portal client and its audit
// chokepoint with the page's own fetch and WebSocket (so the portal cookie and Origin are the
// page's, which is what the dashboard's CSRF check and the Shell app's origin check require),
// and touches nothing on the page: no DOM changes, no reading of forms, no listening to the
// page's own scripts.
//
// The message listener is attached before anything is awaited: a page loaded by
// scripting.executeScript is asked "are you there?" within milliseconds, and a listener attached
// after a storage read lost that race on the live portal.
//
// The login terminal is a port from the panel (LOGIN_PORT): one interactive shell sitting running
// exactly the plain login command, output relayed out as text, the pasted code relayed in as
// keystrokes. When the panel goes away the port disconnects and the shell is closed with it.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Audit } from '../core/audit';
import { commands } from '../core/contract';
import { REVOKED_KEY } from '../core/keys';
import { LoginWatcher } from '../core/login';
import { fail, LOGIN_PORT, succeed, type Answer, type LoginIn, type LoginOut, type Request } from '../core/messages';
import { PORTAL_OPS, PortalClient, type PortalOp } from '../core/portal';
import type { ShellSession } from '../core/shell';
import { local, portalSettings } from '../ext/storage';

/** set on the page's window (the extension's own isolated world) by the first copy of this script in a tab */
const LOADED_MARKER = '__ashleyBridgePortalScriptLoaded';

export default defineContentScript({
  // registered at runtime for the granted origin only; nothing here is applied at install
  registration: 'runtime',
  matches: [],
  runAt: 'document_idle',
  main() {
    // One copy per tab. The background loads this script into an already-open tab with
    // executeScript, and the runtime registration loads it at document_idle; a tab still loading
    // when the grant lands gets both. Two copies would each answer every relayed call (one typed
    // command becomes two, one audit line two), so the second one leaves at once.
    const w = window as unknown as Record<string, unknown>;
    if (w[LOADED_MARKER]) return;
    w[LOADED_MARKER] = true;
    start();
  },
});

interface Ready {
  client: PortalClient;
}

function start(): void {
  const origin = location.origin;
  // the client exists once the settings say this origin is the connected one; calls that arrive
  // earlier wait for that answer instead of finding no listener at all
  const ready: Promise<Ready | undefined> = (async () => {
    const settings = await portalSettings();
    // defence in depth: even if the registration outlived a disconnect, answer only on the connected origin
    if (!settings || settings.origin !== origin) return undefined;
    const audit = new Audit(local, {
      revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY),
    });
    const client = new PortalClient(origin, { fetch: (input, init) => window.fetch(input, init), WebSocket: window.WebSocket }, audit, { shellHost: settings.shell_host });
    return { client };
  })();

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
    return undefined;
  });

  browser.runtime.onConnect.addListener((port) => {
    if (port.sender?.id !== browser.runtime.id || port.name !== LOGIN_PORT) return;
    void hostLogin(port, ready);
  });

  void ready.then(async (r) => {
    if (!r) return;
    try {
      await browser.runtime.sendMessage({ type: 'portal.hello', origin } satisfies Request);
    } catch {
      /* the background was asleep; the next call finds this tab by its URL */
    }
  });
}

/** one login sitting behind one port; the port's life is the shell's life */
async function hostLogin(port: { postMessage(m: LoginOut): void; disconnect(): void; onMessage: { addListener(fn: (m: unknown) => void): void }; onDisconnect: { addListener(fn: () => void): void } }, ready: Promise<Ready | undefined>): Promise<void> {
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
