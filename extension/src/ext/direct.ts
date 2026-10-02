// The browser side of the direct way (12.0.0): this computer's key ring (IndexedDB, and the passkey's
// unlock for this browser session in storage.session), the bundled helper through native messaging,
// and the bridge manifest the package carries. The pages import the key-ring calls that need WebAuthn
// (it runs in a page, inside the student's click) from here; the background imports the rest.
import { browser } from 'wxt/browser';
import { HelperBridge, helperOsFrom, parseBridgeManifest, type BridgeManifest, type NativeApi, type NativePort } from '../core/bridge';
import { KEY_UNLOCK_KEY } from '../core/keys';
import { browserPasskeys, createProtectedKey, forgetKey, indexedDbStore, keyState, passkeySupport, protectKey, unlockKey, unprotectKey, type Keyring, type UnlockStore } from '../core/keyring';
import type { HelperOs } from '../core/model';
import { assetUrl, session } from './storage';

/** the passkey's output for this browser session: storage.session (memory only; not exposed to page scripts) */
function sessionUnlockStore(): UnlockStore {
  return {
    get: () => session.get<{ secret: string; cred: string }>(KEY_UNLOCK_KEY),
    set: (v) => session.set(KEY_UNLOCK_KEY, v),
    remove: () => session.remove(KEY_UNLOCK_KEY),
  };
}

let ring: Keyring | undefined;

/** this browser's key ring (one IndexedDB record; the unlock in storage.session) */
export function browserKeyring(): Keyring {
  return (ring ??= { store: indexedDbStore(), unlock: sessionUnlockStore() });
}

/** chrome.runtime.connectNative, when the browser has it and the permission is granted */
export function nativeApi(): NativeApi | undefined {
  const rt = browser.runtime as unknown as { connectNative?: (name: string) => NativePort; lastError?: { message?: string } };
  if (typeof rt.connectNative !== 'function') return undefined;
  return {
    connectNative: (name) => rt.connectNative!(name),
    lastError: () => {
      const g = globalThis as { chrome?: { runtime?: { lastError?: { message?: string } } } };
      return g.chrome?.runtime?.lastError?.message ?? rt.lastError?.message;
    },
  };
}

export function helperBridge(): HelperBridge {
  return new HelperBridge(nativeApi());
}

/** this computer's operating system, as the helper names it (undefined: ChromeOS and others have no helper) */
export async function helperOs(): Promise<HelperOs | undefined> {
  try {
    return helperOsFrom((await browser.runtime.getPlatformInfo()).os);
  } catch {
    return undefined;
  }
}

let manifest: Promise<BridgeManifest | undefined> | undefined;

/** public/bridge/manifest.json, read once */
export function bridgeManifest(): Promise<BridgeManifest | undefined> {
  return (manifest ??= fetch(assetUrl('/bridge/manifest.json'))
    .then((r) => (r.ok ? r.json() : undefined))
    .then((j) => parseBridgeManifest(j))
    .catch(() => undefined));
}

// ---- for the pages: the passkey steps, inside the student's click ------------------------------------

/** "Turn on" (the protection card, the Settings switch): the same key, re-wrapped under a new passkey */
export async function pageProtectKey(): Promise<'on' | 'cancelled' | 'unsupported' | 'failed'> {
  try {
    await protectKey(browserKeyring(), browserPasskeys());
    return 'on';
  } catch (e) {
    return outcomeOf(e);
  }
}

/** the Settings switch turned off: one prompt, then the key is back under a browser key */
export async function pageUnprotectKey(): Promise<'off' | 'cancelled' | 'unsupported' | 'failed'> {
  try {
    await unprotectKey(browserKeyring(), browserPasskeys());
    return 'off';
  } catch (e) {
    // the key IS protected already: a passkey that answers without its output (a synced copy, a reset
    // Windows Hello) is a failure of this attempt, never "this browser can't" (which would disable the switch)
    const o = outcomeOf(e);
    return o === 'on' || o === 'unsupported' ? 'failed' : o;
  }
}

/** the switch ticked before the first sign-in: the first key, made protected */
export async function pageCreateProtectedKey(): Promise<'on' | 'cancelled' | 'unsupported' | 'failed'> {
  try {
    await createProtectedKey(browserKeyring(), browserPasskeys());
    return 'on';
  } catch (e) {
    return outcomeOf(e);
  }
}

/** "Unlock", once per browser session */
export async function pageUnlockKey(): Promise<'unlocked' | 'cancelled' | 'failed'> {
  try {
    await unlockKey(browserKeyring(), browserPasskeys());
    return 'unlocked';
  } catch (e) {
    const o = outcomeOf(e);
    return o === 'cancelled' ? 'cancelled' : 'failed';
  }
}

function outcomeOf(e: unknown): 'on' | 'cancelled' | 'unsupported' | 'failed' {
  const code = (e as { code?: string })?.code;
  if (code === 'not-allowed') return 'cancelled';
  if (code === 'no-webauthn' || code === 'no-prf') return 'unsupported';
  if (code === 'already') return 'on';
  return 'failed';
}

export { keyState, forgetKey, passkeySupport };
