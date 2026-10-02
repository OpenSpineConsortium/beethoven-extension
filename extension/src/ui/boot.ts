// What every page does as it starts: the theme from the stored preference (cream unless "Match
// system"), the one-second ticker, and, in a development build only, the fixture gallery. The panel's
// own start is in panel.ts (bootPanel), the options page's in options.ts (mountOptions), so each page's
// bundle carries its own code.
//
// The gallery: "?fixture=<name>", "?gallery" or "?sequence=a,b,c" draw fixtures instead of the live
// view (gallery.ts). A production build drops that branch at build time (import.meta.env.MODE is
// "production" there, so the dynamic import is dead code and Vite emits no gallery chunk): neither the
// gallery nor a fixture is in the package. test/hygiene.test.ts checks the release package for it.
import { browser } from 'wxt/browser';
import { PREFS_KEY, WELCOME_PRESS_KEY, type Prefs } from '../core/keys';
import { applyAppearance, startTicker } from './dom';
import { currentTabId, currentWindowId, manifestVersion, packaged } from './rpc';
import type { Gestures } from './welcome';
import { requestOrigin } from '../ext/connectApi';
import { browserName, installId, local } from '../ext/storage';

async function themeFromStorage(): Promise<void> {
  try {
    const p = await local.get<Partial<Prefs>>(PREFS_KEY);
    applyAppearance(p?.appearance);
  } catch {
    applyAppearance('cream');
  }
  try {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[PREFS_KEY]) applyAppearance((changes[PREFS_KEY].newValue as Partial<Prefs> | undefined)?.appearance);
    });
  } catch {
    /* no storage events: the theme stays as loaded */
  }
}

/** the page's common start; true when the development gallery took the page instead */
export async function startPage(root: HTMLElement, page: 'panel' | 'options'): Promise<boolean> {
  document.body.classList.add(page === 'panel' ? 'panel' : 'page');
  startTicker();
  void themeFromStorage();
  if (import.meta.env.MODE !== 'development') return false;
  const q = new URLSearchParams(location.search);
  if (!q.has('fixture') && !q.has('gallery') && !q.has('sequence')) return false;
  const g = await import('./gallery');
  g.mountGallery(root, page, q);
  return true;
}

/** what the welcome page and Settings need from the browser, read before the first click */
export async function realGestures(): Promise<Gestures> {
  const windowId = await currentWindowId();
  const tabId = await currentTabId();
  const sidePanel = (browser as unknown as { sidePanel?: { open?: (o: { windowId: number }) => Promise<void> } }).sidePanel;
  const sidebar = (browser as unknown as { sidebarAction?: { open?: () => Promise<void> } }).sidebarAction;
  const hasPanel = !!(sidePanel?.open || sidebar?.open);
  return {
    hasPanel,
    // called inside the click, before any await: the gesture reaches the browser
    openPanel: () => {
      try {
        if (sidePanel?.open && windowId !== undefined) return sidePanel.open({ windowId }).then(() => true, () => false);
        if (sidebar?.open) return sidebar.open().then(() => true, () => false);
      } catch {
        /* no panel in this browser */
      }
      return Promise.resolve(false);
    },
    request: (origin) => requestOrigin(origin),
    openTab: (url) => void browser.tabs.create({ url }).catch(() => window.open(url, '_blank', 'noopener')),
    url: packaged,
    productVersion: manifestVersion,
    host: browserName,
    installId,
    save: (key, value) => local.set(key, value),
    load: (key) => local.get(key),
    // session storage only (gone when the browser closes): the panel opening in this same click reads it
    notePress: () => {
      try {
        void browser.storage.session.set({ [WELCOME_PRESS_KEY]: { at: new Date().toISOString() } }).catch(() => undefined);
      } catch {
        /* no session storage: the panel says "Finish on the welcome page" a moment longer */
      }
    },
    tabId,
    windowId,
  };
}
