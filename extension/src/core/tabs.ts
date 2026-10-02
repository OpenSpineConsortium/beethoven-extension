// The rules for the tabs Beethoven opens (AM7, docs/V11_CONTRACT.md §17), as pure decisions. A tab is
// closed by Beethoven only if Beethoven opened or navigated it itself, only while it is still where
// Beethoven left it, and never as the window's last tab (a New Tab is opened first, which keeps the
// window and its panel). Where Beethoven left it:
//   the grid sign-in tab   still on the portal's origin (its address is visible because the origin is granted)
//   the grid terminal tab  still on the Shell app's page (AM2)
//   Anthropic's tab        no new page load since the student pasted the code (its address is never visible)
// claude.ai's tab is never closed; it is brought forward only while it has had no new load since
// Beethoven's own load completed. None of this needs the "tabs" permission: loads are counted from
// tabs.onUpdated status events, and an address is visible on the granted origin only.
import type { AnthropicTab, OpenedTab } from './keys';

/** what the browser says of a tab now; `url` is undefined where the extension may not see it */
export interface TabNow {
  id: number;
  windowId: number;
  url?: string;
}

export type CloseDecision = 'close' | 'open-new-then-close' | 'leave';

function sameOrigin(a: string | undefined, b: string): boolean {
  if (!a) return false;
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function samePath(a: string | undefined, b: string): boolean {
  if (!a) return false;
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname.replace(/\/+$/, '') === y.pathname.replace(/\/+$/, '');
  } catch {
    return false;
  }
}

/** is the tab still where Beethoven left it? */
export function stillWhereLeft(rec: OpenedTab | AnthropicTab, now: TabNow | undefined): boolean {
  if (!now || now.id !== rec.tabId) return false;
  switch (rec.purpose) {
    case 'welcome':
    case 'press':
      return sameOrigin(now.url, rec.url);
    case 'terminal':
      return samePath(now.url, rec.url);
    case 'session':
      // claude.ai is never closed
      return false;
    case 'anthropic': {
      // Anthropic's sign-in tab: its address is never visible to the extension; only its loads are counted
      const a = rec as AnthropicTab;
      return !!a.pasted_at && (a.loads_since_paste ?? 0) === 0;
    }
    default:
      return false;
  }
}

/**
 * May Beethoven close this tab it recorded, given the tab now and how many tabs its window holds?
 * A recorded tab that no longer exists, has moved on, or was not opened by Beethoven is left alone.
 */
export function closeDecision(rec: OpenedTab | AnthropicTab | undefined, now: TabNow | undefined, tabsInWindow: number): CloseDecision {
  if (!rec || !now) return 'leave';
  if (!stillWhereLeft(rec, now)) return 'leave';
  return tabsInWindow <= 1 ? 'open-new-then-close' : 'close';
}

/** "Open my session": bring the remembered claude.ai tab forward only while it has had no new load since Beethoven's own completed; otherwise open the link in one new tab */
export function sessionTabDecision(rec: OpenedTab | undefined, exists: boolean): 'focus' | 'open' {
  if (!rec || !exists || rec.purpose !== 'session') return 'open';
  if (!rec.loaded) return 'focus';
  return (rec.loads_after ?? 0) === 0 ? 'focus' : 'open';
}

/**
 * A tabs.onUpdated status event on a recorded tab: "complete" the first time marks Beethoven's own load
 * done; every "loading" after that counts as a new load (and, for Anthropic's tab, after the paste).
 */
export function noteLoad<T extends OpenedTab | AnthropicTab>(rec: T, status: string | undefined): T {
  if (status === 'complete') return rec.loaded ? rec : { ...rec, loaded: true };
  if (status !== 'loading') return rec;
  if (!rec.loaded) return rec;
  const next = { ...rec, loads_after: (rec.loads_after ?? 0) + 1 };
  const a = next as AnthropicTab;
  if (a.pasted_at !== undefined) a.loads_since_paste = (a.loads_since_paste ?? 0) + 1;
  return next;
}
