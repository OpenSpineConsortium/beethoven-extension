// What the pages do through the background and the browser: talk to the portal page script,
// ask for a start, open the portal's own tabs and the options page. Connecting lives in
// ext/connectApi.ts (the one place a permission is asked for).
import { browser } from 'wxt/browser';
import type { AccessOutcome, RunState, StartResult } from '../entrypoints/background';
import { isAnthropicHost } from '../core/connect';
import { unwrap, type Answer, type Request } from '../core/messages';
import type { PortalApi, PortalOp } from '../core/portal';
import { portalSettings } from '../ext/storage';

export { connectPortal, disconnectPortal, originGranted, requestOrigin } from '../ext/connectApi';

export async function send<T = unknown>(msg: Request): Promise<T> {
  const a = (await browser.runtime.sendMessage(msg)) as Answer<T> | undefined;
  return unwrap(a);
}

/** the portal operations as a typed object; each call is relayed to the page script in the portal tab */
export const portal: PortalApi = new Proxy({} as PortalApi, {
  get: (_t, op: string) => (...args: unknown[]) => send({ type: 'portal.call', op: op as PortalOp, args }),
});

export const portalAlive = (): Promise<boolean> => send<boolean>({ type: 'portal.ping' }).catch(() => false);
export const portalTab = (): Promise<{ tabId: number; origin: string } | undefined> => send({ type: 'portal.tab' });
export const currentRun = (): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.get' });
export const refreshRun = (): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.refresh' });
export const setRun = (stateDir: string, run: string, job: string, site?: string): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.set', stateDir, run, job, site });
export const markStopped = (): Promise<RunState | undefined> => send<RunState | undefined>({ type: 'run.stopped' });
export const clearRun = (): Promise<void> => send({ type: 'run.clear' });
export const startWorkerNow = (): Promise<StartResult> => send<StartResult>({ type: 'worker.start' });
export const openEnvironment = (): Promise<{ opened: boolean; url?: string }> => send({ type: 'run.open' });
export const refreshKillList = (): Promise<{ detail: string; revoked: boolean }> => send({ type: 'killlist.refresh' });
/** ask the background to ask Licensor's access service; `force` asks again after a refusal or a failed attempt (an approval under a day old still holds) */
export const checkAccessNow = (force = false): Promise<AccessOutcome> => send<AccessOutcome>({ type: 'access.check', force });

export async function openPortalTab(): Promise<void> {
  const s = await portalSettings();
  if (!s) throw new Error('no portal connected yet');
  await browser.tabs.create({ url: `${s.origin}/pun/sys/dashboard/` });
}

/** the setup page: everything that used to be the popup (the agreement, access, connect, settings, audit) */
export async function openOptions(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

/** the active tab's origin, when the browser lets us see it (activeTab after a toolbar click); never an Anthropic one */
export async function activeTabOrigin(): Promise<{ origin: string; tabId: number; path: string } | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.id === undefined) return undefined;
  try {
    const u = new URL(tab.url);
    if (!/^https?:$/.test(u.protocol) || isAnthropicHost(u.hostname)) return undefined;
    return { origin: u.origin, tabId: tab.id, path: u.pathname };
  } catch {
    return undefined;
  }
}
