// The one press of "Agree and continue" (moment 2), and "Use this portal" / Settings' "Change": the
// browser calls that need the click's own user activation, made by the page itself inside its click
// handler, synchronously, before any await (a gesture does not survive a message to the background,
// nor an await). Observed in Chromium 153 from one click on an extension page, in both orders:
// sidePanel.open({windowId}) and permissions.request({origins}) both succeed (silent/gesture/result.json,
// fewest/basic/run2-panel-first.log, run2-perm-first.log). The window id is read when the page loads
// (currentWindowId), never inside the click.
//
// The page then writes the acceptance record itself (terms.ts buildTermsRecord) and sends the action
// {kind: 'agree', origin, granted, panelOpened, tabId, windowId} with what the two calls answered; the
// background does the rest. An Anthropic address never reaches permissions.request (requestOrigin's
// guard), and no panel is opened for one.
import { browser } from 'wxt/browser';
import { isAnthropicAddress, mayRequestOrigin } from '../core/connect';
import { requestOrigin } from './connectApi';

interface SidePanelApi {
  open(o: { windowId?: number; tabId?: number }): Promise<void>;
}
interface SidebarApi {
  open(): Promise<void>;
}

const sidePanelApi = (): SidePanelApi | undefined => (browser as unknown as { sidePanel?: SidePanelApi }).sidePanel;
const sidebarApi = (): SidebarApi | undefined => (browser as unknown as { sidebarAction?: SidebarApi }).sidebarAction;

/** this browser has a panel Beethoven can open beside the page (Chrome and Edge's side panel, Firefox's sidebar); Safari has none, and the page carries the journey itself */
export function hasPanel(): boolean {
  return !!sidePanelApi() || !!sidebarApi();
}

/** the page's own window, read when the page loads so the click needs no await */
export async function currentWindowId(): Promise<number | undefined> {
  try {
    const w = await browser.windows.getCurrent();
    return w.id;
  } catch {
    return undefined;
  }
}

/** the page's own tab, read when the page loads (the welcome tab becomes the grid's sign-in) */
export async function currentTabId(): Promise<number | undefined> {
  try {
    const t = await browser.tabs.getCurrent();
    return t?.id;
  } catch {
    return undefined;
  }
}

/**
 * Open the panel for the whole window, inside a click. Synchronous call; the promise says whether it
 * opened (false where this browser has no panel, or the call was refused).
 */
export function openPanelInGesture(windowId: number | undefined): Promise<boolean> {
  try {
    const sp = sidePanelApi();
    if (sp && windowId !== undefined) return sp.open({ windowId }).then(
      () => true,
      () => false,
    );
    const sb = sidebarApi();
    if (sb) return sb.open().then(
      () => true,
      () => false,
    );
  } catch {
    /* refused synchronously */
  }
  return Promise.resolve(false);
}

export interface AgreeGesture {
  /** the panel opened for the window */
  panel: Promise<boolean>;
  /** Chrome granted the portal's origin (false for an address that may not be asked for: an Anthropic one, or one that is not https) */
  granted: Promise<boolean>;
}

/**
 * "Agree and continue": both calls in the same click, before any await. `origin` is the portal the
 * page offers (the site profile's ood_base_url, or the one typed under "Use another portal").
 */
export function agreeGesture(o: { windowId: number | undefined; origin: string }): AgreeGesture {
  // an Anthropic address is refused before any prompt, and opens nothing
  if (isAnthropicAddress(o.origin) || !mayRequestOrigin(o.origin)) return { panel: Promise.resolve(false), granted: Promise.resolve(false) };
  const panel = openPanelInGesture(o.windowId);
  const granted = requestOrigin(o.origin);
  return { panel, granted };
}

/** "Use this portal" and Settings' "Change": the permission request alone, inside the click */
export function portalGesture(origin: string): Promise<boolean> {
  return requestOrigin(origin);
}
