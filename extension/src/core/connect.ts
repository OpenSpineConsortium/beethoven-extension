// Connecting a portal, in one sequence used by the toolbar click and by the strip's button:
// ask the browser for that one origin (the caller makes that call synchronously inside the
// gesture, as Firefox requires, and hands the promise in), register the page script for the
// origin, and load it into the tab that is already open right away, because a runtime
// registration applies only to pages loaded after it (measured on the live portal 2026-09-29:
// "Could not establish connection. Receiving end does not exist." until the tab was reloaded).
// The injected script needs a moment to attach its listener, so the tab is pinged a few times
// before the connection is called unanswered. The browser API is passed in, so the sequence is
// tested against a fake.
import { siteFromHostname, type PortalSettings } from './keys';

export const SCRIPT_ID = 'ashley-bridge-portal';
export const SCRIPT_FILE = '/content-scripts/portal.js';

export interface ConnectApi {
  containsOrigin(origin: string): Promise<boolean>;
  scriptRegisteredFor(): Promise<string | undefined>;
  registerScript(origin: string): Promise<void>;
  unregisterScript(): Promise<void>;
  inject(tabId: number): Promise<void>;
  ping(tabId: number): Promise<boolean>;
  loadSettings(): Promise<PortalSettings | undefined>;
  saveSettings(s: PortalSettings): Promise<void>;
  /** forget the remembered portal tab; the next call finds the tab afresh */
  forgetTab(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export interface TabLook {
  origin: string;
  hostname: string;
  path: string;
  /** the page is an Open OnDemand page (a /pun/ path), or the tab is on the portal already connected */
  ood: boolean;
}

/** what a tab's address says: usable at all (http/https), and does it look like Open OnDemand */
export function lookAtTab(url: string | undefined, storedHostname?: string): TabLook | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    const ood = /^\/pun\//.test(u.pathname) || /^\/nginx\//.test(u.pathname) || (!!storedHostname && u.hostname === storedHostname);
    return { origin: u.origin, hostname: u.hostname, path: u.pathname, ood };
  } catch {
    return undefined;
  }
}

/** "ondemand.grid.wayne.edu", "https://ondemand.grid.wayne.edu/pun/sys/dashboard" -> "https://ondemand.grid.wayne.edu" */
export function normaliseOrigin(input: string): string {
  let s = String(input ?? '').trim();
  if (!s) throw new Error('type your portal address first');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const u = new URL(s);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error('the portal must be an https address');
  return u.origin;
}

export interface ConnectOutcome {
  settings: PortalSettings;
  /** the page script in the given tab answered a ping by the end */
  answered: boolean;
  /** the script was loaded into the tab by this call (it was not answering before) */
  injected: boolean;
  /** the settings were new or changed by this call */
  changed: boolean;
}

export interface ConnectInput {
  origin: string;
  /** the tab that is already open on the portal, to load the page script into now */
  tabId?: number;
  /** browser.permissions.request(...) for the origin, already called inside the gesture */
  granting: Promise<boolean>;
  /** pings after an injection: how many and how far apart */
  pingTries?: number;
  pingGapMs?: number;
}

export async function connectSequence(api: ConnectApi, input: ConnectInput): Promise<ConnectOutcome> {
  const origin = normaliseOrigin(input.origin);
  const granted = await input.granting;
  if (!granted) throw new Error('access to the portal was not granted; nothing was connected');
  const registeredFor = await api.scriptRegisteredFor();
  if (registeredFor !== origin) {
    if (registeredFor) await api.unregisterScript();
    await api.registerScript(origin);
  }
  const previous = await api.loadSettings();
  const hostname = new URL(origin).hostname;
  const same = previous?.origin === origin;
  const settings: PortalSettings = same
    ? previous
    : { origin, hostname, connected_at: new Date().toISOString(), shell_host: 'default', site: siteFromHostname(hostname) };
  if (!same) {
    await api.saveSettings(settings);
    await api.forgetTab();
  }
  let answered = false;
  let injected = false;
  if (input.tabId !== undefined) {
    answered = await api.ping(input.tabId).catch(() => false);
    if (!answered) {
      try {
        await api.inject(input.tabId);
        injected = true;
      } catch {
        /* the tab may be mid-navigation; the registration covers its next load */
      }
      const tries = input.pingTries ?? 8;
      for (let i = 0; i < tries && !answered; i++) {
        await api.sleep(input.pingGapMs ?? 250);
        answered = await api.ping(input.tabId).catch(() => false);
      }
    }
  }
  return { settings, answered, injected, changed: !same };
}
