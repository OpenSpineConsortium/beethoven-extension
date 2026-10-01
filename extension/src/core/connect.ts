// Connecting a portal, in one sequence used by the toolbar click and by the strip's button:
// ask the browser for that one origin (the caller makes that call synchronously inside the
// gesture, as Firefox requires, and hands the promise in), register the page script for the
// origin, and load it into the tab that is already open right away, because a runtime
// registration applies only to pages loaded after it (measured on the live portal 2026-09-29:
// "Could not establish connection. Receiving end does not exist." until the tab was reloaded).
// The injected script needs a moment to attach its listener, so the tab is pinged a few times
// before the connection is called unanswered. The browser API is passed in, so the sequence is
// tested against a fake. An Anthropic address is refused here, and by every caller before it asks
// the browser for anything.
import { siteFromHostname, type PortalSettings } from './keys';
import { PRODUCT_NAME } from './terms';

export const SCRIPT_ID = 'beethoven-portal';
export const SCRIPT_FILE = '/content-scripts/portal.js';

export interface ConnectApi {
  containsOrigin(origin: string): Promise<boolean>;
  scriptRegisteredFor(): Promise<string | undefined>;
  registerScript(origin: string): Promise<void>;
  unregisterScript(): Promise<void>;
  /** load the page script into the tab, only while the tab is on that origin (it throws otherwise) */
  inject(tabId: number, origin: string): Promise<void>;
  ping(tabId: number): Promise<boolean>;
  loadSettings(): Promise<PortalSettings | undefined>;
  saveSettings(s: PortalSettings): Promise<void>;
  /** forget the remembered portal tab; the next call finds the tab afresh */
  forgetTab(): Promise<void>;
  sleep(ms: number): Promise<void>;
}

// Never an Anthropic site: Beethoven has, asks for and uses no access to claude.ai, claude.com or
// anthropic.com, nor to any name under them. This one predicate is the rule; normaliseOrigin, the
// tab reading, the permission request (ext/connectApi.ts requestOrigin), the stored settings, the
// page script and the clean-up of grants an earlier build obtained all ask it. 9.0.0 refused such an
// address only after it had asked the browser for it, so the browser's Allow/Deny prompt came first.
const ANTHROPIC_HOST = /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/;

/** the end of the refusal sentence, for the places that say it in their own words */
export const ANTHROPIC_NEVER = `${PRODUCT_NAME} never connects to claude.ai, claude.com or anthropic.com`;
/** the refusal sentence wherever an Anthropic address is typed or clicked from */
export const ANTHROPIC_REFUSAL = `that is an Anthropic address, not a portal: ${ANTHROPIC_NEVER}`;

/** "claude.ai", "www.claude.ai", "api.anthropic.com", "CLAUDE.COM." -> true; "claude.ai.example.edu", "notclaude.ai" -> false */
export function isAnthropicHost(hostname: string | undefined | null): boolean {
  // a fully qualified name may end in a dot ("claude.ai." is claude.ai)
  const h = String(hostname ?? '').trim().toLowerCase().replace(/\.+$/, '');
  return ANTHROPIC_HOST.test(h);
}

// A typed address names its scheme when it starts with one and a colon, unless what follows the colon
// is a port ("localhost:8443", "portal.example.edu:443/pun/", or "localhost:" with nothing after it).
// "https:/claude.ai" and "https:claude.ai" are https addresses on claude.ai (the URL standard reads
// them so), and "ftp://claude.ai", "wss://claude.ai" and "ftp:/claude.ai" name claude.ai under another
// scheme; 10.0.0's first build put https:// in front of all of these and asked the browser for the
// hosts "https", "ftp" and "wss" instead.
const EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$)|$)/i;

/** a typed address, an origin or a URL, read as the URL standard reads it, https:// put in front when it names no scheme; undefined when it is no address */
function parseAddress(input: string): URL | undefined {
  const s = String(input ?? '').trim();
  if (!s) return undefined;
  try {
    return new URL(/^https?:/i.test(s) || EXPLICIT_SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return undefined;
  }
}

/** the host an address names, with or without its scheme ("claude.ai/code" -> "claude.ai", "ftp://claude.ai" -> "claude.ai"); undefined when it names none */
function hostOf(input: string): string | undefined {
  return parseAddress(input)?.hostname || undefined;
}

/** an origin, a URL or a typed address on an Anthropic host */
export function isAnthropicAddress(input: string | undefined | null): boolean {
  return isAnthropicHost(hostOf(String(input ?? '')));
}

/** a host permission pattern ("https://claude.ai/*", "*://*.anthropic.com/*") on an Anthropic host; the all-hosts patterns are not */
export function isAnthropicPattern(pattern: string): boolean {
  const m = /^[a-z*]+:\/\/([^/]*)\//i.exec(String(pattern ?? ''));
  if (!m) return false;
  const host = (m[1] ?? '').replace(/:(\d+|\*)$/, '').replace(/^\*\./, '');
  return host !== '*' && isAnthropicHost(host);
}

export interface TabLook {
  origin: string;
  hostname: string;
  /** the page's path; empty for an Anthropic tab, whose address is never kept */
  path: string;
  /** the page is an Open OnDemand page (a /pun/ path), or the tab is on the portal already connected; never on an Anthropic host */
  ood: boolean;
  /** the tab is on claude.ai, claude.com or anthropic.com (or under them): never a portal, whatever its path */
  anthropic: boolean;
}

/** what a tab's address says: usable at all (http/https), and does it look like Open OnDemand */
export function lookAtTab(url: string | undefined, storedHostname?: string): TabLook | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return undefined;
    if (isAnthropicHost(u.hostname)) return { origin: u.origin, hostname: u.hostname, path: '', ood: false, anthropic: true };
    const ood = /^\/pun\//.test(u.pathname) || /^\/nginx\//.test(u.pathname) || (!!storedHostname && u.hostname === storedHostname);
    return { origin: u.origin, hostname: u.hostname, path: u.pathname, ood, anthropic: false };
  } catch {
    return undefined;
  }
}

/** "ondemand.grid.wayne.edu", "https://ondemand.grid.wayne.edu/pun/sys/dashboard" -> "https://ondemand.grid.wayne.edu" */
export function normaliseOrigin(input: string): string {
  if (!String(input ?? '').trim()) throw new Error('type your portal address first');
  const u = parseAddress(input);
  if (!u) throw new Error('type your portal address first');
  // the Anthropic refusal comes first, whatever the scheme: "ftp://claude.ai" is refused as claude.ai
  if (isAnthropicHost(u.hostname)) throw new Error(ANTHROPIC_REFUSAL);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) throw new Error('the portal must be an https address');
  return u.origin;
}

/**
 * May the browser be asked for this origin? Only an origin exactly as normaliseOrigin makes it (so
 * never an Anthropic one, and https or the local mock only). Synchronous, so a click handler can ask
 * it before the permission request without losing the gesture.
 */
export function mayRequestOrigin(origin: string): boolean {
  try {
    return typeof origin === 'string' && normaliseOrigin(origin) === origin;
  } catch {
    return false;
  }
}

/** The permission request behind its check: a refused origin never reaches the browser, and its answer is "not granted". */
export function guardedRequest(request: (patterns: string[]) => Promise<boolean>): (origin: string) => Promise<boolean> {
  return (origin) => (mayRequestOrigin(origin) ? request([`${origin}/*`]) : Promise.resolve(false));
}

/** settings read back from storage, unless they name an Anthropic address (an earlier build or a hand edit cannot make one a portal) */
export function acceptedSettings(s: PortalSettings | undefined | null): PortalSettings | undefined {
  if (!s || typeof s !== 'object') return undefined;
  if (isAnthropicAddress(s.origin) || isAnthropicHost(s.hostname)) return undefined;
  return s;
}

/** the browser's grants, as the clean-up below needs them */
export interface GrantApi {
  heldOrigins(): Promise<string[]>;
  removeOrigins(patterns: string[]): Promise<void>;
}

/**
 * Remove every host grant on an Anthropic name. 9.0.0 asked for an address before refusing it, so a
 * tester who pressed Allow there holds a grant this extension never used; it goes on install, update
 * and browser start. With nothing held, nothing is removed and the browser is not asked to remove
 * anything. Returns the patterns it removed.
 */
export async function dropAnthropicGrants(api: GrantApi): Promise<string[]> {
  const held = (await api.heldOrigins().catch(() => [] as string[])).filter(isAnthropicPattern);
  if (held.length) await api.removeOrigins(held).catch(() => undefined);
  return held;
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
        await api.inject(input.tabId, origin);
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
