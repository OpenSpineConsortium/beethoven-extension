// The options page: the welcome page (moment 2) until the agreement is accepted, then Settings. Which
// one is drawn is the background's view (surface "welcome" or "settings"); this page holds the port.
// A browser with no side panel (Safari): once the agreement is made, this tab becomes the panel's own
// page, which then carries the journey full width.
import { recordInForce, TERMS_KEY } from '../core/terms';
import type { SurfaceView } from '../core/model';
import { applyAppearance } from './dom';
import { realGestures, startPage } from './boot';
import { packaged, sendAction, subscribe } from './rpc';
import { mountSettings } from './settings';
import { mountWelcome } from './welcome';
import { browser } from 'wxt/browser';
import { local } from '../ext/storage';

export async function mountOptions(root: HTMLElement): Promise<void> {
  if (await startPage(root, 'options')) return;
  const gestures = await realGestures();
  const accepted = recordInForce(await local.get(TERMS_KEY).catch(() => undefined));
  let welcome: ReturnType<typeof mountWelcome> | undefined;
  let settings: ReturnType<typeof mountSettings> | undefined;
  const show = (sv: SurfaceView) => {
    if (sv.surface === 'welcome') {
      settings = undefined;
      welcome ??= mountWelcome(root, {
        act: sendAction,
        gestures,
        onAccepted: () => {
          if (!gestures.hasPanel) location.assign(packaged('/sidepanel.html'));
        },
      });
      welcome.show(sv.view);
    } else if (sv.surface === 'settings') {
      welcome = undefined;
      document.title = `${sv.view.title} · Beethoven`;
      settings ??= mountSettings(root, { act: sendAction, gestures, onAppearance: applyAppearance });
      settings.show(sv.view);
    }
  };
  // once the agreement is in force this tab is Settings: when the panel's ⋯ > Settings focuses it (the
  // background says so), or when it comes back into view. The direct way never navigates the welcome tab
  // away (11.0.0's portal sign-in did), so without this it would go on drawing the welcome page.
  let current: 'welcome' | 'settings' = accepted ? 'settings' : 'welcome';
  let sub = subscribe(current, show, gestures.windowId);
  const toSettings = async () => {
    if (current === 'settings') return;
    if (!recordInForce(await local.get(TERMS_KEY).catch(() => undefined))) return;
    if ((current as string) === 'settings') return; // another event switched it during the read
    current = 'settings';
    sub.close();
    sub = subscribe('settings', show, gestures.windowId);
  };
  browser.runtime.onMessage.addListener((m: unknown) => {
    if ((m as { type?: string } | undefined)?.type === 'show-settings') void toSettings();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void toSettings();
  });
}
