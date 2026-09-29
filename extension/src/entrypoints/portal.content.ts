// The page script on the student's portal origin: the extension's only network client. It is
// not in the manifest; the background registers it for the one origin the student granted from
// the "Connect this portal" button. It answers operations from the extension (checked by
// sender.id), runs them through the portal client and its audit chokepoint with the page's own
// fetch and WebSocket (so the portal cookie and Origin are the page's, which is what the
// dashboard's CSRF check and the Shell app's origin check require), and touches nothing on the
// page: no DOM changes, no reading of forms, no listening to the page's own scripts.
import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { Audit } from '../core/audit';
import { REVOKED_KEY } from '../core/keys';
import { fail, succeed, type Answer, type Request } from '../core/messages';
import { PORTAL_OPS, PortalClient, type PortalApi, type PortalOp } from '../core/portal';
import { local, portalSettings } from '../ext/storage';

export default defineContentScript({
  // registered at runtime for the granted origin only; nothing here is applied at install
  registration: 'runtime',
  matches: [],
  runAt: 'document_idle',
  main() {
    void start();
  },
});

async function start(): Promise<void> {
  const settings = await portalSettings();
  const origin = location.origin;
  // defence in depth: even if the registration outlived a disconnect, answer only on the connected origin
  if (!settings || settings.origin !== origin) return;
  const audit = new Audit(local, {
    revocation: async () => local.get<{ revoked: boolean; message: string }>(REVOKED_KEY),
  });
  const client: PortalApi = new PortalClient(origin, { fetch: (input, init) => window.fetch(input, init), WebSocket: window.WebSocket }, audit, { shellHost: settings.shell_host });

  browser.runtime.onMessage.addListener((message: unknown, sender): Promise<Answer> | undefined => {
    if (sender.id !== browser.runtime.id) return undefined;
    const msg = message as Request;
    if (!msg || typeof msg !== 'object') return undefined;
    if (msg.type === 'portal.ping') return Promise.resolve(succeed(true));
    if (msg.type === 'portal.call') {
      if (!PORTAL_OPS.includes(msg.op)) return Promise.resolve(fail(new Error(`unknown portal operation ${String(msg.op)}`)));
      const fn = client[msg.op as PortalOp] as (...a: unknown[]) => Promise<unknown>;
      return fn
        .apply(client, msg.args ?? [])
        .then((v) => succeed(v))
        .catch((e) => fail(e));
    }
    return undefined;
  });

  try {
    await browser.runtime.sendMessage({ type: 'portal.hello', origin } satisfies Request);
  } catch {
    /* the background was asleep; the next call finds this tab by its URL */
  }
}
