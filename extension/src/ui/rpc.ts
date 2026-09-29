// What the pages do through the background and the browser: talk to the portal page script,
// connect or disconnect a portal, open the portal's own tabs. Connecting is the one place the
// extension asks for a permission, and it asks for exactly one origin, from a click.
import { browser } from 'wxt/browser';
import type { RunState } from '../entrypoints/background';
import { IDENTITY_KEY, PORTAL_KEY, PORTAL_TAB_KEY, RUN_KEY, siteFromHostname, type PortalSettings } from '../core/keys';
import { unwrap, type Answer, type Request } from '../core/messages';
import type { PortalApi, PortalOp } from '../core/portal';
import { local, portalSettings, session } from '../ext/storage';

export const SCRIPT_ID = 'ashley-bridge-portal';
export const SCRIPT_FILE = '/content-scripts/portal.js';

export async function send<T = unknown>(msg: Request): Promise<T> {
  const a = (await browser.runtime.sendMessage(msg)) as Answer<T> | undefined;
  return unwrap(a);
}

/** the portal operations as a typed object; each call is relayed to the page script in the portal tab */
export const portal: PortalApi = new Proxy({} as PortalApi, {
  get: (_t, op: string) => (...args: unknown[]) => send({ type: 'portal.call', op: op as PortalOp, args }),
});

export const portalAlive = (): Promise<boolean> => send<boolean>({ type: 'portal.ping' }).catch(() => false);
export const currentRun = (): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.get' });
export const refreshRun = (): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.refresh' });
export const setRun = (stateDir: string, run: string, job: string, site?: string): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.set', stateDir, run, job, site });
export const clearRun = (): Promise<void> => send({ type: 'run.clear' });
export const refreshKillList = (): Promise<{ detail: string; revoked: boolean }> => send({ type: 'killlist.refresh' });

/** "ondemand.grid.wayne.edu", "https://ondemand.grid.wayne.edu/pun/sys/dashboard" -> "https://ondemand.grid.wayne.edu" */
export function normaliseOrigin(input: string): string {
  let s = String(input ?? '').trim();
  if (!s) throw new Error('type your portal address first');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error('the portal must be an https address');
  return u.origin;
}

/**
 * Connect a portal. Call this directly from a click handler: browser.permissions.request runs
 * before the first await, which is what Firefox requires of a permission prompt.
 */
export function connectPortal(input: string, tabId?: number): Promise<PortalSettings> {
  const origin = normaliseOrigin(input);
  const granting = browser.permissions.request({ origins: [`${origin}/*`] });
  return (async () => {
    const granted = await granting;
    if (!granted) throw new Error('access to the portal was not granted; nothing was connected');
    const existing = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] }).catch(() => []);
    if (existing.length) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    await browser.scripting.registerContentScripts([{ id: SCRIPT_ID, js: [SCRIPT_FILE], matches: [`${origin}/*`], runAt: 'document_idle', persistAcrossSessions: true }]);
    const previous = await portalSettings();
    const hostname = new URL(origin).hostname;
    const settings: PortalSettings = {
      origin,
      hostname,
      connected_at: new Date().toISOString(),
      shell_host: previous?.origin === origin ? previous.shell_host : 'default',
      site: previous?.origin === origin ? previous.site : siteFromHostname(hostname),
    };
    await local.set(PORTAL_KEY, settings);
    await session.remove(PORTAL_TAB_KEY);
    if (tabId !== undefined) {
      // the tab is already open: load the page script into it now rather than after a reload
      try {
        await browser.scripting.executeScript({ target: { tabId }, files: [SCRIPT_FILE] });
      } catch {
        /* the tab may be mid-navigation; the registration covers the next load */
      }
    }
    return settings;
  })();
}

export async function disconnectPortal(): Promise<void> {
  const settings = await portalSettings();
  await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => undefined);
  if (settings) await browser.permissions.remove({ origins: [`${settings.origin}/*`] }).catch(() => undefined);
  await local.remove(PORTAL_KEY);
  await local.remove(IDENTITY_KEY);
  await session.remove(PORTAL_TAB_KEY);
  await session.remove(RUN_KEY);
}

export async function originGranted(origin: string): Promise<boolean> {
  return browser.permissions.contains({ origins: [`${origin}/*`] });
}

export async function openPortalTab(): Promise<void> {
  const s = await portalSettings();
  if (!s) throw new Error('no portal connected yet');
  await browser.tabs.create({ url: `${s.origin}/pun/sys/dashboard/` });
}

/** the portal's own Shell app: where the student types the two Claude commands themselves */
export async function openShellTab(): Promise<void> {
  const s = await portalSettings();
  if (!s) throw new Error('no portal connected yet');
  await browser.tabs.create({ url: `${s.origin}/pun/sys/shell/ssh/${encodeURIComponent(s.shell_host || 'default')}` });
}

export async function openOnboarding(): Promise<void> {
  await browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
}

/** the active tab's origin, when the browser lets us see it (activeTab after a toolbar click) */
export async function activeTabOrigin(): Promise<{ origin: string; tabId: number; path: string } | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined) return undefined;
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    return { origin: u.origin, tabId: tab.id, path: u.pathname };
  } catch {
    return undefined;
  }
}

/** open the monitoring surface this browser has: Chrome/Edge side panel, Firefox sidebar */
export async function openPanel(): Promise<boolean> {
  const b = browser as unknown as { sidePanel?: { open(o: { windowId: number }): Promise<void> }; sidebarAction?: { open(): Promise<void> }; windows: { getCurrent(): Promise<{ id?: number }> } };
  try {
    if (b.sidePanel) {
      const w = await b.windows.getCurrent();
      if (w.id !== undefined) {
        await b.sidePanel.open({ windowId: w.id });
        return true;
      }
    } else if (b.sidebarAction) {
      await b.sidebarAction.open();
      return true;
    }
  } catch {
    /* fall through to the fallback */
  }
  return false;
}
