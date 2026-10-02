// The tabs Beethoven opens, in the browser (11.0.0). The decisions are core/tabs.ts's; this file only
// asks the browser. No "tabs" permission: tabs.create, tabs.update, tabs.remove, tabs.get and
// tabs.query need none, an address is visible only on the granted origin, and loads are counted from
// tabs.onUpdated status events (the background keeps the counts in the records).
import { browser } from 'wxt/browser';
import { closeDecision, type CloseDecision, type TabNow } from '../core/tabs';
import type { TabHost } from '../core/channel';
import { isAnthropicAddress } from '../core/connect';
import type { AnthropicTab, OpenedTab } from '../core/keys';
import type { Answer } from '../core/messages';
import { unwrap } from '../core/messages';
import type { PortalOp } from '../core/portal';
import { connectApi } from './connectApi';

/** the tab as the browser shows it now, or undefined when it is gone */
export async function tabNow(tabId: number): Promise<(TabNow & { status?: string; active?: boolean }) | undefined> {
  try {
    const t = await browser.tabs.get(tabId);
    if (t.id === undefined) return undefined;
    return { id: t.id, windowId: t.windowId ?? -1, ...(t.url ? { url: t.url } : {}), ...(t.status ? { status: t.status } : {}), active: !!t.active };
  } catch {
    return undefined;
  }
}

/** how many tabs a window holds (tabs.query by window needs no permission) */
export async function countTabs(windowId: number): Promise<number> {
  try {
    return (await browser.tabs.query({ windowId })).length;
  } catch {
    return 0;
  }
}

/** the tab in front in a window (to return focus to it later) */
export async function activeTabIn(windowId: number | undefined): Promise<number | undefined> {
  try {
    const q = windowId !== undefined ? { active: true, windowId } : { active: true, lastFocusedWindow: true };
    return (await browser.tabs.query(q))[0]?.id;
  } catch {
    return undefined;
  }
}

/** bring a tab and its window to the front */
export async function focusTab(tabId: number, windowId?: number): Promise<boolean> {
  try {
    await browser.tabs.update(tabId, { active: true });
    if (windowId !== undefined) await browser.windows.update(windowId, { focused: true }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** open a tab; never on an Anthropic address unless `anthropicOk` (Anthropic's own sign-in page and the claude.ai environment link, opened as a bookmark would) */
export async function openTab(url: string, o: { windowId?: number; active: boolean; anthropicOk?: boolean }): Promise<{ tabId: number; windowId: number } | undefined> {
  if (isAnthropicAddress(url) && !o.anthropicOk) return undefined;
  try {
    const t = await browser.tabs.create({ url, active: o.active, ...(o.windowId !== undefined ? { windowId: o.windowId } : {}) });
    return t.id === undefined ? undefined : { tabId: t.id, windowId: t.windowId ?? o.windowId ?? -1 };
  } catch {
    return undefined;
  }
}

/**
 * Close a tab Beethoven recorded, under the guards: only while it is where Beethoven left it, and
 * never as the window's last tab (a New Tab is opened first, so the window and its panel stay).
 */
export async function closeUnderGuards(rec: OpenedTab | AnthropicTab | undefined): Promise<CloseDecision> {
  if (!rec) return 'leave';
  const now = await tabNow(rec.tabId);
  if (!now) return 'leave';
  const decision = closeDecision(rec, now, await countTabs(now.windowId));
  if (decision === 'leave') return decision;
  if (decision === 'open-new-then-close') await browser.tabs.create({ windowId: now.windowId, active: true }).catch(() => undefined);
  try {
    await browser.tabs.remove(rec.tabId);
  } catch {
    return 'leave';
  }
  if (rec.return_tab_id !== undefined && decision === 'close') await focusTab(rec.return_tab_id).catch(() => false);
  return decision;
}

/** wait until a tab's load completes (or it is gone, or the time is up) */
export function waitComplete(tabId: number, timeoutMs = 20_000): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpd);
      browser.tabs.onRemoved.removeListener(onRem);
      resolve(ok);
    };
    const onUpd = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    const onRem = (id: number) => {
      if (id === tabId) finish(false);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    browser.tabs.onUpdated.addListener(onUpd);
    browser.tabs.onRemoved.addListener(onRem);
    void browser.tabs
      .get(tabId)
      .then((t) => {
        if (t.status === 'complete') finish(true);
      })
      .catch(() => finish(false));
  });
}

/** tab mode's browser side (core/channel.ts withPortalTab): inactive tabs on the portal, the page script loaded by injection, closed under the guards */
export function tabHost(origin: string): TabHost {
  const opened = new Set<number>();
  return {
    async openInactive(url, windowId) {
      const t = await openTab(url, { windowId, active: false });
      if (!t) throw new Error('could not open a portal tab');
      opened.add(t.tabId);
      await waitComplete(t.tabId);
      return t.tabId;
    },
    async keep(tabId) {
      await browser.tabs.update(tabId, { autoDiscardable: false } as never);
    },
    inject: (tabId) => connectApi.inject(tabId, origin),
    ping: (tabId) => connectApi.ping(tabId),
    async call(tabId, op: PortalOp, args) {
      const a = (await browser.tabs.sendMessage(tabId, { type: 'portal.call', op, args })) as Answer | undefined;
      return unwrap(a);
    },
    async close(tabId) {
      if (!opened.has(tabId)) return;
      opened.delete(tabId);
      const now = await tabNow(tabId);
      if (!now?.url) return;
      let on = false;
      try {
        on = new URL(now.url).origin === origin;
      } catch {
        on = false;
      }
      if (!on) return;
      if ((await countTabs(now.windowId)) <= 1) await browser.tabs.create({ windowId: now.windowId, active: true }).catch(() => undefined);
      await browser.tabs.remove(tabId).catch(() => undefined);
    },
    async onPortal(tabId) {
      const now = await tabNow(tabId);
      if (!now?.url) return false;
      try {
        return new URL(now.url).origin === origin;
      } catch {
        return false;
      }
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}
