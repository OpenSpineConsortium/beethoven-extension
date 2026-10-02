// What the pages say to the background (core/messages.ts, docs/V11_CONTRACT.md "Messages and tabs"):
// one port per page that subscribes to its surface and receives every new view, "tick" every 2 s while
// the page is open (which also tells the background a panel is open), and one message per Action.
// The pages never talk to the portal, the lab or Anthropic themselves.
import { browser } from 'wxt/browser';
import type { Action, ActionKind, ProtectOutcome, ResultOf, Surface, SurfaceView } from '../core/model';
import { TICK_MS, unwrap, VIEW_PORT, type Answer, type ViewIn, type ViewOut } from '../core/messages';
import type { Action12 } from './model12';

export interface ViewSubscription {
  close(): void;
}

/**
 * Hold a port to the background for one surface and call `onView` with each view it pushes. If the
 * port drops (the background restarted), connect again after a second, while the page is open.
 */
export function subscribe(surface: Surface, onView: (v: SurfaceView) => void, windowId?: number): ViewSubscription {
  let closed = false;
  let port: ReturnType<typeof browser.runtime.connect> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const open = () => {
    if (closed) return;
    try {
      port = browser.runtime.connect({ name: VIEW_PORT });
    } catch {
      setTimeout(open, 1000);
      return;
    }
    port.onMessage.addListener((m: unknown) => {
      const out = m as ViewOut;
      if (out?.type === 'view' && out.view) onView(out.view);
    });
    port.onDisconnect.addListener(() => {
      if (ticker) clearInterval(ticker);
      ticker = undefined;
      port = undefined;
      if (!closed) setTimeout(open, 1000);
    });
    const hello: ViewIn = { type: 'subscribe', surface, ...(windowId !== undefined ? { windowId } : {}) };
    port.postMessage(hello);
    ticker = setInterval(() => {
      try {
        port?.postMessage({ type: 'tick' } satisfies ViewIn);
      } catch {
        /* the port is going away; onDisconnect reconnects */
      }
    }, TICK_MS);
  };
  open();
  return {
    close() {
      closed = true;
      if (ticker) clearInterval(ticker);
      try {
        port?.disconnect();
      } catch {
        /* already gone */
      }
    },
  };
}

/** one Action, answered with its result (the rest arrives as a new view) */
export async function act<A extends Action>(action: A): Promise<ResultOf<A['kind']>> {
  const a = (await browser.runtime.sendMessage({ type: 'action', action })) as Answer<ResultOf<A['kind']>> | undefined;
  return unwrap(a);
}

/** what an action answers at once (model.ts ActionResults); the page-local "open-needs" answers nothing */
export type Result12<K> = K extends ActionKind ? ResultOf<K> : { done?: boolean };

/** how a page carries out an action: the real background, or the gallery's stand-in */
export type Act = <A extends Action12>(action: A) => Promise<Result12<A['kind']> | undefined>;

/** the real one; an error becomes undefined (the next view says what happened) */
export const sendAction: Act = async (action) => {
  try {
    return (await act(action as Action)) as never;
  } catch {
    return undefined;
  }
};

/**
 * D2: the opt-in protection of the browser's key needs a passkey step, and WebAuthn runs only in a
 * document (never in the background's worker), inside the click that asked for it (model.ts PageAct
 * 'protect-key', 'unprotect-key', 'unlock-key'; core/keyring.ts). The page calls these synchronously in
 * the click, before any await, then sends what came of it (the actions "protect-key", "unlock-key").
 * The core registers its keyring at page start (registerKeyGesture); until then the page says the
 * protection is not available here, never that it was turned on.
 */
export interface KeyGesture {
  /** on: keyring.protectKey (the passkey made, the key wrapped under it); off: keyring.unprotectKey */
  protect(on: boolean): Promise<ProtectOutcome>;
  /** the sheet's tick before the first sign-in: keyring.createProtectedKey */
  createProtected(): Promise<ProtectOutcome>;
  /** once per browser session while the protection is on: keyring.unlockKey */
  unlock(): Promise<'unlocked' | 'cancelled' | 'failed'>;
}

const NO_GESTURE: KeyGesture = {
  protect: () => Promise.resolve('unsupported'),
  createProtected: () => Promise.resolve('unsupported'),
  unlock: () => Promise.resolve('failed'),
};

let keyGesture: KeyGesture = NO_GESTURE;

/** the core's ceremony (ext/): call once as the page starts */
export function registerKeyGesture(g: KeyGesture): void {
  keyGesture = g;
}

/** the ceremony the page runs inside a click */
export function currentKeyGesture(): KeyGesture {
  return keyGesture;
}

export type { ActionKind };

/** the panel on load: the access re-check LICENSE 3(a) ties to opening it, and the live grid check */
export function panelOpened(windowId?: number): void {
  void browser.runtime.sendMessage({ type: 'panel.opened', ...(windowId !== undefined ? { windowId } : {}) }).catch(() => undefined);
}

/** the window this page is in (the panel's window, for tabs the background opens beside it) */
export async function currentWindowId(): Promise<number | undefined> {
  try {
    return (await browser.windows.getCurrent()).id;
  } catch {
    return undefined;
  }
}

/** the tab this page is in (the welcome page, which the background turns into the grid's sign-in) */
export async function currentTabId(): Promise<number | undefined> {
  try {
    return (await browser.tabs.getCurrent())?.id;
  } catch {
    return undefined;
  }
}

/** the package's own file, by its path in public/ (fonts, texts, the tour's diagram) */
export function packaged(path: string): string {
  try {
    return browser.runtime.getURL(path as never);
  } catch {
    return path;
  }
}

export function manifestVersion(): string {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return '';
  }
}
