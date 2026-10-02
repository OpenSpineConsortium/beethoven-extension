// The browser behind core/connect.ts: the one place the extension asks for a permission and
// loads its page script into a tab. `permissions.request` itself is called by the page, synchronously
// inside the click (ext/gesture.ts), through requestOrigin below. No Anthropic address ever reaches the
// browser from here: requestOrigin and registerScript refuse one before the browser is called, and an
// earlier build's grants on one are removed at start.
//
// 11.0.0 registers no page script: it loads it with scripting.executeScript into the tabs it opened
// itself, and only while they are on the granted origin (tab mode's action tab, and the grid's terminal
// tab of the one-time key step). A registration an earlier build left is removed at start.
import { browser } from 'wxt/browser';
import { acceptedSettings, ANTHROPIC_REFUSAL, connectSequence, dropAnthropicGrants, guardedRequest, isAnthropicAddress, SCRIPT_FILE, SCRIPT_ID, type ConnectApi, type ConnectOutcome } from '../core/connect';
import { ACCESS_KEY, CHANNEL_KEY, GRID_KEY, IDENTITY_KEY, LAST_KNOWN_KEY, PORTAL_KEY, PORTAL_TAB_KEY, PRESS_KEY, RUN_KEY, SIGNIN_TAB_KEY, type PortalSettings } from '../core/keys';
import type { Answer } from '../core/messages';
import { local, portalSettings, session } from './storage';

export const connectApi: ConnectApi = {
  containsOrigin: (origin) => browser.permissions.contains({ origins: [`${origin}/*`] }),
  async scriptRegisteredFor() {
    const all = await browser.scripting.getRegisteredContentScripts().catch(() => []);
    // the extension registers one page script; one under another id is an earlier build's (7.0.0
    // renamed the id), which a browser that keeps registrations across an update would go on loading
    // into the portal, even after a disconnect, so it goes here
    const stale = all.map((s) => s.id).filter((id) => id !== SCRIPT_ID);
    if (stale.length) await browser.scripting.unregisterContentScripts({ ids: stale }).catch(() => undefined);
    const m = all.find((s) => s.id === SCRIPT_ID)?.matches?.[0];
    return m ? m.replace(/\/\*$/, '') : undefined;
  },
  async registerScript(origin) {
    if (isAnthropicAddress(origin)) throw new Error(ANTHROPIC_REFUSAL);
    await browser.scripting.registerContentScripts([{ id: SCRIPT_ID, js: [SCRIPT_FILE], matches: [`${origin}/*`], runAt: 'document_idle', persistAcrossSessions: true }]);
  },
  // no filter: every page script this extension registered, an earlier build's included
  unregisterScript: () => browser.scripting.unregisterContentScripts().catch(() => undefined),
  async inject(tabId, origin) {
    // only into a tab that is on the granted origin now: the tab id can come from an earlier click (the
    // panel's buttons) and the tab may have moved on since, to an Anthropic page among others. The
    // browser shows a tab's address only where the extension holds access, so a tab elsewhere reads as
    // no address and is skipped; the registration covers the portal's next load either way.
    const tab = await browser.tabs.get(tabId);
    let at = '';
    try {
      at = tab.url ? new URL(tab.url).origin : '';
    } catch {
      at = '';
    }
    if (!at || at !== origin || isAnthropicAddress(at)) throw new Error('that tab is not on the portal now; nothing was loaded into it');
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

/**
 * The permission call, made first and synchronously by every click handler that connects. The
 * choke point: an origin normaliseOrigin would refuse (an Anthropic one above all) never reaches
 * browser.permissions.request, so no browser prompt is ever shown for it, whoever calls; its answer
 * is "not granted". Callers check first too, so the person reads the refusal instead.
 */
export const requestOrigin: (origin: string) => Promise<boolean> = guardedRequest((origins) => browser.permissions.request({ origins }));

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
  // how this browser reaches the portal, and the worker last seen there, belong to that portal
  await local.remove(CHANNEL_KEY);
  await local.remove(LAST_KNOWN_KEY);
  await session.remove(PORTAL_TAB_KEY);
  await session.remove(RUN_KEY);
  await session.remove(GRID_KEY);
  await session.remove(PRESS_KEY);
  await session.remove(SIGNIN_TAB_KEY);
}

/** save the portal the student granted (welcome's "Agree and continue", "Use this portal", Settings' "Change"); a new origin forgets what belonged to the old one */
export async function savePortal(s: PortalSettings): Promise<{ changed: boolean }> {
  const previous = await portalSettings();
  if (previous && previous.origin === s.origin) return { changed: false };
  if (previous) {
    await browser.permissions.remove({ origins: [`${previous.origin}/*`] }).catch(() => undefined);
    await local.remove(IDENTITY_KEY);
    await local.remove(ACCESS_KEY);
    await local.remove(CHANNEL_KEY);
    await local.remove(LAST_KNOWN_KEY);
    await session.remove(RUN_KEY);
    await session.remove(GRID_KEY);
  }
  await local.set(PORTAL_KEY, s);
  return { changed: true };
}

export async function originGranted(origin: string): Promise<boolean> {
  return connectApi.containsOrigin(origin);
}

/**
 * What an earlier build may have left on an Anthropic address, removed: host grants (9.0.0 asked the
 * browser for an address before refusing it), a portal setting naming one, and a page script
 * registered for one. Run when the background starts (install, update, browser start); with nothing
 * of the kind held it removes nothing. Returns the grant patterns it removed.
 */
export async function dropAnthropicLeftovers(): Promise<string[]> {
  const removed = await dropAnthropicGrants({
    heldOrigins: async () => (await browser.permissions.getAll()).origins ?? [],
    removeOrigins: async (origins) => {
      await browser.permissions.remove({ origins });
    },
  });
  const raw = await local.get<PortalSettings>(PORTAL_KEY);
  if (raw && !acceptedSettings(raw)) {
    await connectApi.unregisterScript();
    await local.remove(PORTAL_KEY);
  }
  const registered = await connectApi.scriptRegisteredFor().catch(() => undefined);
  if (registered && isAnthropicAddress(registered)) await connectApi.unregisterScript();
  return removed;
}
