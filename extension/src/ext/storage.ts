// browser.storage as the KV the core modules expect, plus the few typed reads the pages share.
// storage.local holds only what the report allows to be durable (portal hostname and origin,
// preferences, the acceptance record, the access service's last answer, the audit log, the last
// good kill-list, the per-workspace data statement and the small notes the strip keeps: links it
// opened, the last sign-in it saw, the probe it submitted); storage.session holds connection state.
import { browser } from 'wxt/browser';
import type { KV } from '../core/audit';
import { DEFAULT_PREFS, INSTALL_ID_KEY, PORTAL_KEY, PREFS_KEY, type PortalSettings, type Prefs } from '../core/keys';

function area(a: { get(keys: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void>; remove(keys: string): Promise<void> }): KV & { remove(key: string): Promise<void> } {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const r = await a.get(key);
      return r[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await a.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await a.remove(key);
    },
  };
}

export const local = area(browser.storage.local);
export const session = area(browser.storage.session);

export async function portalSettings(): Promise<PortalSettings | undefined> {
  return local.get<PortalSettings>(PORTAL_KEY);
}

export async function prefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...((await local.get<Partial<Prefs>>(PREFS_KEY)) ?? {}) };
}

/**
 * This installation's random identifier, made once from the browser's random generator and from
 * nothing about the device. It names the acceptance record and the consent marker, and the approval
 * check sends it so that one approved account is used from one installation (licensing/access.ts).
 * Uninstalling removes it and a reinstall makes a new one; nothing here ever clears it.
 */
export async function installId(): Promise<string> {
  let id = await local.get<string>(INSTALL_ID_KEY);
  if (!id) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    await local.set(INSTALL_ID_KEY, id);
  }
  return id;
}

/** "Chrome 148", "Firefox 140": the browser named in the acceptance record */
export function browserName(): string {
  const ua = navigator.userAgent;
  const brands = (navigator as Navigator & { userAgentData?: { brands: Array<{ brand: string; version: string }> } }).userAgentData?.brands;
  const b = brands?.find((x) => /Edge|Chrome|Chromium/i.test(x.brand) && !/Not/i.test(x.brand));
  if (b) return `${b.brand} ${b.version}`;
  const m = /(Firefox|Edg|Chrome|Safari|Version)\/([\d.]+)/.exec(ua);
  return m ? `${m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2]}` : ua.slice(0, 40);
}

export const version = (): string => browser.runtime.getManifest().version;

/** a bundled file's URL; the site profiles are generated at build time, so their paths are not in WXT's typed list */
export const assetUrl = (path: string): string => browser.runtime.getURL(path as never);
