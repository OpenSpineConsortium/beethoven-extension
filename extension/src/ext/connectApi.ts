// The browser behind core/connect.ts: the one place the extension asks for a permission,
// registers its page script and loads it into an open tab. Used by the background (toolbar
// click) and by the strip's own "Connect this portal" button. `permissions.request` itself is
// called by the caller, synchronously inside the click, and its promise handed in.
import { browser } from 'wxt/browser';
import { connectSequence, SCRIPT_FILE, SCRIPT_ID, type ConnectApi, type ConnectOutcome } from '../core/connect';
import { ACCESS_KEY, IDENTITY_KEY, PORTAL_KEY, PORTAL_TAB_KEY, RUN_KEY, type PortalSettings } from '../core/keys';
import type { Answer } from '../core/messages';
import { local, portalSettings, session } from './storage';

export const connectApi: ConnectApi = {
  containsOrigin: (origin) => browser.permissions.contains({ origins: [`${origin}/*`] }),
  async scriptRegisteredFor() {
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
    const m = existing[0]?.matches?.[0];
    return m ? m.replace(/\/\*$/, '') : undefined;
  },
  registerScript: (origin) => browser.scripting.registerContentScripts([{ id: SCRIPT_ID, js: [SCRIPT_FILE], matches: [`${origin}/*`], runAt: 'document_idle', persistAcrossSessions: true }]),
  unregisterScript: () => browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => undefined),
  async inject(tabId) {
    await browser.scripting.executeScript({ target: { tabId }, files: [SCRIPT_FILE] });
  },
  async ping(tabId) {
    const a = (await browser.tabs.sendMessage(tabId, { type: 'portal.ping' })) as Answer<boolean> | undefined;
    return !!a && a.ok && a.value === true;
  },
  loadSettings: () => portalSettings(),
  saveSettings: (s: PortalSettings) => local.set(PORTAL_KEY, s),
  forgetTab: () => session.remove(PORTAL_TAB_KEY),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** the permission call, made first and synchronously by every click handler that connects */
export function requestOrigin(origin: string): Promise<boolean> {
  return browser.permissions.request({ origins: [`${origin}/*`] });
}

export function connectPortal(origin: string, tabId: number | undefined, granting: Promise<boolean>): Promise<ConnectOutcome> {
  return connectSequence(connectApi, { origin, tabId, granting });
}

export async function disconnectPortal(): Promise<void> {
  const settings = await portalSettings();
  await connectApi.unregisterScript();
  if (settings) await browser.permissions.remove({ origins: [`${settings.origin}/*`] }).catch(() => undefined);
  await local.remove(PORTAL_KEY);
  await local.remove(IDENTITY_KEY);
  // the approval was for this account at this portal; the next portal is asked about afresh
  await local.remove(ACCESS_KEY);
  await session.remove(PORTAL_TAB_KEY);
  await session.remove(RUN_KEY);
}

export async function originGranted(origin: string): Promise<boolean> {
  return connectApi.containsOrigin(origin);
}
