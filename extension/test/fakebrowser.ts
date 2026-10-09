// A fake Chrome for running the extension's real background (src/entrypoints/background.ts) under Node,
// with a fake portal behind fetch and WebSocket (11.0.0 review: the code reviewer's harness, made a test
// helper). Nothing here reaches the network: every fetch is answered in-process, and any address that
// is not the fake portal or the extension's own files is recorded and refused.
//
// 19.0.0 (Beethoven signs in): the grid's HTTP Basic sign-in as Chromium's source reads (the research
// notes; none of it is measured against the live portal yet). The profile's auth cache: Chrome picks what
// it sends at the start of each request, puts an answer in before the retry, drops an entry when a response
// turns it down, and shares it with tabs and with the worker's WebSocket, which webRequest never sees.
// webRequest.onAuthRequired with Chrome's own rules: a registration made while no host is granted is kept
// and never dispatched; every addListener call is a listener of its own; Chrome waits for every blocking one
// and merges the answers (any cancel wins); only an asyncBlocking listener's callback settles an event, never
// its return value; an answer the grid turns down fires the event again for the same request. Without an
// answer a worker's request gets the 401 and a tab gets Chrome's own box; a cancel gives a tab the 401 page.
// Removing a listener lets go of a request it holds, with no answer. `opts.signedIn` keeps its meaning,
// "the browser holds a sign-in the grid accepts", as a view of the cache.
import { readFileSync } from 'node:fs';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const EXT = 'chrome-extension://ext';
export const ORIGIN = 'https://ondemand.grid.wayne.edu';
export const HOME = '/home/st1234';
export const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
export const STATE = '/rs/rs_grp_oschome/st1234/hpcworker';
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const LAUNCHER_TAG = '# hpcworker launcher for a shared copy (managed: "hpcworker install" rewrites this file)';

type Fn = (...a: any[]) => any;
export const ev = () => {
  const ls: Fn[] = [];
  return {
    addListener: (f: Fn) => ls.push(f),
    removeListener: (f: Fn) => {
      const i = ls.indexOf(f);
      if (i >= 0) ls.splice(i, 1);
    },
    hasListener: (f: Fn) => ls.includes(f),
    fire: (...a: any[]) => ls.map((f) => f(...a)),
    ls,
  };
};

export interface Tab {
  id: number;
  windowId: number;
  url: string;
  status: string;
  active: boolean;
}

/** 19.0.0: one webRequest addListener call, a listener of its own as Chrome makes it (a sub-event per call) */
export interface WebRequestEntry {
  fn: Fn;
  filter: { urls: string[]; types?: string[]; tabId?: number };
  spec: string[];
  /** made while no host was granted: Chrome keeps it in the renderer and never dispatches to it */
  refused: boolean;
}

export type AuthAnswerKind = 'credentials' | 'cancel' | 'none';

/** 19.0.0: one merged answer to onAuthRequired as the world keeps it: what happened, never a user name or password */
export interface AuthAnswer {
  requestId: string;
  type: string;
  tabId: number;
  path: string;
  answer: AuthAnswerKind;
  /** with credentials to the grid's own challenge: whether they were the pair the grid accepts now */
  accepted?: boolean;
  /** raised by a helper (a proxy, another realm or origin), not the grid's own challenge to a request */
  foreign?: boolean;
}

/** 19.0.0: the profile's HTTP auth cache entry for the portal */
export interface AuthCacheEntry {
  user: string;
  password: string;
  realm: string;
}

export interface World {
  log: string[];
  external: string[];
  tabs: Map<number, Tab>;
  storage: { local: Record<string, unknown>; session: Record<string, unknown> };
  fs: Map<string, string>;
  dirs: Set<string>;
  shellLines: Array<{ at: number; line: string }>;
  connectLines: Array<{ at: number; line: string }>;
  /**
   * pageScript: tab mode's page script answers on a portal tab (ping, portal calls, the connect port), with a
   * portal client of the page's own; authUrl: the sign-in link the connect sitting prints instead of claude.ai's
   */
  opts: {
    dashboardDelayMs: number;
    shellPageDelayMs: number;
    /** the browser holds a sign-in the grid accepts: a view of authCache (true puts gridUser and gridPassword in it, false empties it) */
    signedIn: boolean;
    reach: boolean;
    keyless: boolean;
    claudeSignedIn: boolean;
    connectHold: boolean;
    pageScript?: boolean;
    authUrl?: string;
    /** 19.0.0: the AccessID and password the grid accepts now; a new gridPassword plays a password changed on the grid */
    gridUser: string;
    gridPassword: string;
    /** onAuthRequired fires at most this often for one request; past it the fake logs LOOP and the 401 goes through (Chrome has no cap) */
    authRepeatLimit: number;
    /** an asyncBlocking listener that has not called back by then is logged "never answered" and taken as no answer */
    authTimeoutMs: number;
    /** ms of no /pun/ request after which the next one the grid lets in answers 500 once, as the mock's --cold-pun; 0 = never */
    coldPun: number;
    /**
     * how the grid turns down a listener's answer: 401 (the default) challenges again, so Chrome raises the event
     * again; 403 ends the request with no challenge and no event, an outcome only onCompleted reports
     */
    answeredStatus?: 401 | 403;
  };
  chrome: any;
  granted: Set<string>;
  sockets: Set<any>;
  t0: number;
  now(): number;
  openTab(url: string, windowId?: number, active?: boolean): Tab;
  navigate(id: number, url: string): void;
  closeTab(id: number): void;
  /** 12.0.0: the native messaging host Chrome would start (none: "Specified native messaging host not found.") */
  native?: (name: string) => any;
  /** 12.0.0: extension files served in place of public/ (a site profile with the stand-in's host key, a bridge manifest) */
  files: Map<string, string>;
  /** 19.0.0: Chrome's HTTP auth cache for the portal (in memory, shared by the worker and the tabs); undefined when empty */
  authCache?: AuthCacheEntry;
  /** every merged answer to onAuthRequired, in order */
  authAnswers: AuthAnswer[];
  /** credentials a listener gave that the grid turned down */
  badAnswers: number;
  /** Chrome's own sends of a cached pair the grid turns down (a password changed on the grid, an answer the grid never saw) */
  chromeBadTries: number;
  /** the realm the grid's challenge names (the live portal's is "private") */
  realm: string;
  /** what runtime.getPlatformInfo() says the operating system is; undefined is 'win' */
  os?: string;
  /** Chrome's own sign-in box, by the tab it is over */
  boxes: Map<number, { requestId: string; url: string }>;
  /** what storage.session.setAccessLevel last set (undefined: Chrome's default, trusted contexts only) */
  sessionAccessLevel?: string;
  /** the IndexedDB of install({ indexedDB: true }); otherwise there is none */
  idb?: ReturnType<typeof fakeIndexedDB>;
  /** called as each request to the portal starts, so a test can act inside a window (raise a challenge, change the password) */
  onPortalRequest?: (r: { requestId: string; url: string; method: string; type: string; tabId: number }) => void;
  /** a host permission granted, as permissions.request grants it: onAdded fires */
  grant(origin: string): void;
  /** and taken away: onRemoved fires */
  revoke(origin: string): void;
  /** the student answers Chrome's box over a tab; true when the grid took the pair (the tab loads again) */
  answerBox(tabId: number, user: string, password: string): Promise<boolean>;
  /** the next retry after a listener's credentials fails as a network error, with the credentials already in the cache */
  dropAuthRetry(): void;
  /** challenges wait until releaseChallenges(), which dispatches them all in one task */
  holdChallenges(): void;
  releaseChallenges(): void;
  /** a portal page loaded in a tab is challenged (whatever the cache holds) */
  tabChallenge(tabId: number, path: string): Promise<AuthAnswerKind>;
  /** challenges that are not the grid's, raised as a worker request inside the window would meet them; never cached */
  proxyChallenge(path?: string): Promise<AuthAnswerKind>;
  realmChallenge(realm: string, path?: string): Promise<AuthAnswerKind>;
  /** reaches a listener only on a granted origin (world.grant it first) */
  originChallenge(origin: string, path?: string): Promise<AuthAnswerKind>;
  /** fires a set alarm (a one-time alarm is then gone) and waits for the listeners; false when no such alarm is set */
  fireAlarm(name: string): Promise<boolean>;
  /** the service worker stops: every listener goes, held events are let go unanswered, sockets close 1006; storage stays */
  stopWorker(): void;
  /** the browser quits and starts again: stopWorker, and storage.session and the auth cache are empty */
  restartBrowser(): void;
}

/**
 * 12.0.0: a minimal IndexedDB (one database, object stores of keyed values) for the background's key ring
 * under Node, which has none; values go in and come out as structured clones, as the browser keeps them
 * (a CryptoKey survives one). 19.0.0: deleteDatabase, logged through `log` when given, so a test can tell
 * which stores a cleanup removed (src/core/vault.ts keeps the saved sign-in in one).
 */
export function fakeIndexedDB(log?: (line: string) => void) {
  const dbs = new Map<string, Map<string, Map<unknown, unknown>>>();
  const req = (result?: unknown) => ({ result, error: null as unknown });
  return {
    dbs,
    deleteDatabase(name: string) {
      const r: any = { result: undefined, error: null, onsuccess: null, onerror: null, onblocked: null };
      setTimeout(() => {
        const had = dbs.delete(name);
        log?.(`indexedDB.deleteDatabase ${name}${had ? '' : ' (there was none)'}`);
        r.onsuccess?.();
      }, 0);
      return r;
    },
    databases: async () => [...dbs.keys()].map((name) => ({ name, version: 1 })),
    open(name: string) {
      const r: any = { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => {
        let db = dbs.get(name);
        const fresh = !db;
        if (!db) {
          db = new Map();
          dbs.set(name, db);
        }
        const d = db;
        r.result = {
          createObjectStore: (n: string) => d.set(n, new Map()),
          transaction: (n: string) => {
            const st = d.get(n)!;
            const tx: any = { oncomplete: null, onerror: null, onabort: null, error: null };
            tx.objectStore = () => ({
              get: (k: unknown) => req(structuredClone(st.get(k))),
              put: (v: unknown, k: unknown) => (st.set(k, structuredClone(v)), req(k)),
              delete: (k: unknown) => (st.delete(k), req(undefined)),
            });
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
          },
          close: () => undefined,
        };
        if (fresh) r.onupgradeneeded?.();
        r.onsuccess?.();
      }, 0);
      return r;
    },
  };
}

/**
 * 12.0.0: the bundled helper as Chrome would run it, in-process: the wire contract (hello, open, data,
 * close; opened, data, closed, error), its allowlist, and TCP to `port` on 127.0.0.1 (the grid stand-in)
 * for a stream it opens to an allowed host:port. Every port it made is in `ports`.
 */
export function nativeHelperToTcp(world: World, port: number, allow: string[] = ['grid.wayne.edu:22']) {
  const ports: any[] = [];
  world.native = (name: string) => {
    const msgL: Array<(m: unknown) => void> = [];
    const discL: Array<() => void> = [];
    const socks = new Map<string, net.Socket>();
    let open = true;
    const out = (m: unknown) => setTimeout(() => open && msgL.forEach((f) => f(m)), 0);
    const p = {
      name,
      postMessage(m: any) {
        if (!open) throw new Error('Attempting to use a disconnected port object');
        if (m.t === 'hello') out({ t: 'hello', v: 1, helper: '1', os: 'windows', kind: 'script', allow });
        else if (m.t === 'open') {
          if (!allow.includes(`${m.host}:${m.port}`)) return out({ t: 'error', id: m.id, reason: 'not in the allowlist' });
          const s = net.connect({ host: '127.0.0.1', port });
          socks.set(m.id, s);
          s.on('connect', () => out({ t: 'opened', id: m.id }));
          s.on('data', (b: Buffer) => out({ t: 'data', id: m.id, b64: b.toString('base64') }));
          s.on('close', () => out({ t: 'closed', id: m.id, reason: 'eof' }));
          s.on('error', () => undefined);
        } else if (m.t === 'data') socks.get(m.id)?.write(Buffer.from(m.b64, 'base64'));
        else if (m.t === 'close') socks.get(m.id)?.destroy();
      },
      disconnect() {
        open = false;
        for (const s of socks.values()) s.destroy();
      },
      onMessage: { addListener: (f: (m: unknown) => void) => msgL.push(f) },
      onDisconnect: { addListener: (f: () => void) => discL.push(f) },
    };
    ports.push(p);
    return p;
  };
  return ports;
}

let current: any = {};
const STABLE = new Proxy({}, { get: (_t, k) => current[k as string], has: (_t, k) => k in current });

/** the IndexedDB the last install({ indexedDB: true }) put in place */
let installedIdb: unknown;

/** the view ports each world's pages opened, so a stopped worker's listeners on them go too */
const viewPorts = new WeakMap<World, Set<{ onMessage: { ls: Fn[] }; onDisconnect: { ls: Fn[] } }>>();

/** the portal's own challenge as Chrome reports it: its host and the port the origin is reached on */
const PORTAL_CHALLENGER = { host: new URL(ORIGIN).hostname, port: 443 };
const DASHBOARD_PATH = '/pun/sys/dashboard/';

/** a Chrome match pattern ("<all_urls>", "https://*\/*", "http://localhost/*"): a pattern without a port matches any port */
function matchesPattern(pattern: string, url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const scheme = u.protocol.slice(0, -1);
  if (pattern === '<all_urls>') return ['http', 'https', 'ws', 'wss'].includes(scheme);
  const m = /^(\*|https?|wss?):\/\/(\*|\*\.[^/:]+|[^/*:]+)(?::(\d+|\*))?(\/.*)$/.exec(pattern);
  if (!m) return false;
  if (m[1] === '*' ? !['http', 'https'].includes(scheme) : m[1] !== scheme) return false;
  const host = m[2]!;
  if (host.startsWith('*.') ? !(u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1))) : host !== '*' && host !== u.hostname) return false;
  if (m[3] && m[3] !== '*' && Number(m[3]) !== Number(u.port || (scheme === 'https' || scheme === 'wss' ? 443 : 80))) return false;
  const path = new RegExp(`^${m[4]!.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return path.test(`${u.pathname}${u.search}`);
}

/** one request the fake portal sees, as webRequest names its facts; the same object across Chrome's repeats */
interface Req {
  requestId: string;
  url: string;
  method: string;
  type: 'xmlhttprequest' | 'websocket' | 'main_frame';
  tabId: number;
  initiator?: string;
  /** whether Chrome attaches HTTP auth to it at all: never for credentials "omit", nor for "same-origin" across origins */
  sendsAuth: boolean;
  /** onAuthRequired events fired for it so far */
  events: number;
}

/** the answer a merge of every listener's comes to */
type Merged = { kind: 'credentials'; username: string; password: string } | { kind: 'cancel' } | { kind: 'none' };

/** how a request the grid challenged ended up: let in, or not (with the last merged answer, when there was one) */
type Gate = { ok: boolean; last?: AuthAnswerKind; status?: 403 };

/**
 * install({ webRequest: false }) plays the browser without the webRequest API (the Firefox build), where only
 * the 18.0.0 tab path exists; install({ indexedDB: true }) gives the worker an IndexedDB (there is none otherwise).
 */
export function install(o: { webRequest?: boolean; indexedDB?: boolean } = {}): World {
  const t0 = Date.now();
  const granted = new Set<string>([`${ORIGIN}/*`]);
  const sockets = new Set<any>();
  const withWebRequest = o.webRequest !== false;
  const opts = {
    dashboardDelayMs: 20,
    shellPageDelayMs: 0,
    reach: true,
    keyless: false,
    claudeSignedIn: false,
    connectHold: false,
    gridUser: 'st1234',
    gridPassword: 'grid-Pass-0f1e2d',
    authRepeatLimit: 5,
    authTimeoutMs: 5_000,
    coldPun: 0,
  } as World['opts'];
  const world: World = {
    log: [],
    external: [],
    tabs: new Map(),
    storage: { local: {}, session: {} },
    fs: new Map(),
    dirs: new Set(),
    shellLines: [],
    connectLines: [],
    opts,
    chrome: undefined,
    granted,
    sockets,
    t0,
    now: () => Date.now() - t0,
    openTab: (url, windowId = 1, active = true) => openTabImpl(url, windowId, active),
    navigate: (id, url) => navigateImpl(id, url),
    closeTab: (id) => removeImpl(id),
    files: new Map(),
    authAnswers: [],
    badAnswers: 0,
    chromeBadTries: 0,
    realm: 'private',
    boxes: new Map(),
    grant: (origin) => grantImpl(origin),
    revoke: (origin) => revokeImpl(origin),
    answerBox: (tabId, user, password) => answerBoxImpl(tabId, user, password),
    dropAuthRetry: () => void (dropNextRetry = true),
    holdChallenges: () => void (held = true),
    releaseChallenges: () => {
      held = false;
      flushChallenges();
    },
    tabChallenge: (tabId, path) => tabChallengeImpl(tabId, path),
    proxyChallenge: (path = DASHBOARD_PATH) => foreignChallenge(`${ORIGIN}${path}`, { isProxy: true, scheme: 'basic', realm: 'proxy', challenger: { host: 'proxy.wayne.edu', port: 3128 }, statusCode: 407, statusLine: 'HTTP/1.1 407 Proxy Authentication Required' }),
    realmChallenge: (realm, path = DASHBOARD_PATH) => foreignChallenge(`${ORIGIN}${path}`, { realm }),
    originChallenge: (origin, path = DASHBOARD_PATH) => {
      const u = new URL(origin);
      return foreignChallenge(`${u.origin}${path}`, { challenger: { host: u.hostname, port: Number(u.port || (u.protocol === 'http:' ? 80 : 443)) } });
    },
    fireAlarm: (name) => fireAlarmImpl(name),
    stopWorker: () => stopWorkerImpl(),
    restartBrowser: () => {
      stopWorkerImpl();
      for (const k of Object.keys(world.storage.session)) delete world.storage.session[k];
      world.authCache = undefined;
      world.boxes.clear();
      boxReqs.clear();
      world.sessionAccessLevel = undefined;
      L('the browser restarted: storage.session and the HTTP auth cache are empty');
    },
  };
  const L = (s: string) => world.log.push(`${String(world.now()).padStart(6)} ${s}`);

  // ---- 19.0.0: the grid's HTTP Basic sign-in and Chrome's auth cache ----
  /** the Req behind each box, for its repeat when the student's answer is turned down */
  const boxReqs = new Map<number, Req>();
  /** each tab's navigations so far: a box belongs to one, and goes when the tab moves on or closes */
  const navs = new Map<number, number>();
  const gridAccepts = (c: { user: string; password: string }) => c.user === world.opts.gridUser && c.password === world.opts.gridPassword;
  const samePair = (a: { user: string; password: string }, b: { user: string; password: string }) => a.user === b.user && a.password === b.password;
  // "the browser holds a sign-in the grid accepts", the meaning every test before 19.0.0 gives it
  Object.defineProperty(opts, 'signedIn', {
    enumerable: true,
    configurable: true,
    get: () => !!world.authCache && gridAccepts(world.authCache),
    set: (v: boolean) => {
      if (v) {
        world.authCache = { user: world.opts.gridUser, password: world.opts.gridPassword, realm: world.realm };
        // Chrome sends the pair now in its cache for every box of the realm still waiting, and the boxes go
        world.boxes.clear();
        boxReqs.clear();
      } else world.authCache = undefined;
    },
  });
  world.opts.signedIn = true;
  let nextRequest = 1;
  const newReq = (url: string, method: string, type: Req['type'], tabId: number, initiator: string | undefined, credentials: string | undefined): Req => {
    let sameOrigin = false;
    try {
      sameOrigin = !!initiator && new URL(initiator).origin === new URL(url).origin;
    } catch {
      /* not an address */
    }
    // a worker's fetch is cross-origin to the portal: only credentials "include" carries the cache's pair there
    const mode = credentials ?? 'same-origin';
    return { requestId: String(nextRequest++), url, method, type, tabId, ...(initiator ? { initiator } : {}), sendsAuth: mode === 'include' || (mode === 'same-origin' && sameOrigin), events: 0 };
  };
  const pathOf = (url: string) => {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  };
  /** the facts of a request webRequest's events share */
  const requestDetails = (r: Req) => ({
    requestId: r.requestId,
    url: r.url,
    method: r.method,
    frameId: r.tabId === -1 ? -1 : 0,
    parentFrameId: -1,
    tabId: r.tabId,
    type: r.type,
    timeStamp: Date.now(),
    ...(r.initiator ? { initiator: r.initiator } : {}),
  });
  const authDetails = (r: Req): Record<string, any> => ({
    ...requestDetails(r),
    scheme: 'basic',
    realm: world.realm,
    challenger: { ...PORTAL_CHALLENGER },
    isProxy: false,
    statusCode: 401,
    statusLine: 'HTTP/1.1 401 Unauthorized',
  });

  // webRequest's events: each addListener call its own entry; refused (kept, never dispatched) while no host is granted
  const ALLOWED_SPEC: Record<string, string[]> = {
    onAuthRequired: ['responseHeaders', 'blocking', 'asyncBlocking', 'extraHeaders'],
    onCompleted: ['responseHeaders', 'extraHeaders'],
    onErrorOccurred: ['extraHeaders'],
  };
  const webRequestEvent = (name: 'onAuthRequired' | 'onCompleted' | 'onErrorOccurred') => {
    const ls: WebRequestEntry[] = [];
    return {
      addListener(fn: Fn, filter?: WebRequestEntry['filter'], spec?: string[]) {
        const bad = (why: string) => new TypeError(`Error in invocation of webRequest.${name}.addListener: ${why}`);
        if (typeof fn !== 'function') throw bad('the listener is not a function');
        if (!filter || !Array.isArray(filter.urls)) throw bad('a filter with urls is required');
        const s = [...(spec ?? [])];
        for (const x of s) if (!ALLOWED_SPEC[name]!.includes(x)) throw bad(`"${x}" is not allowed in extraInfoSpec here`);
        if (s.includes('blocking') && s.includes('asyncBlocking')) throw bad('"blocking" and "asyncBlocking" together');
        const refused = granted.size === 0;
        ls.push({ fn, filter: { ...filter, urls: [...filter.urls] }, spec: s, refused });
        if (refused) L(`webRequest.${name}.addListener refused (no host permission)`);
      },
      /**
       * every listener added with this function goes (Chrome removes each of its sub-events), and a request one
       * of them still holds for an answer goes on with none (CleanUpForListener; measured in Chromium 141 in the
       * review: the fetch gets the 401 at once)
       */
      removeListener(fn: Fn) {
        for (let i = ls.length - 1; i >= 0; i--) {
          const e = ls[i]!;
          if (e.fn !== fn) continue;
          ls.splice(i, 1);
          for (const [release, owner] of [...waiting]) if (owner === e) release('the listener was removed');
        }
      },
      hasListener: (fn: Fn) => ls.some((e) => e.fn === fn),
      hasListeners: () => ls.length > 0,
      ls,
    };
  };
  const webRequest = withWebRequest ? { onAuthRequired: webRequestEvent('onAuthRequired'), onCompleted: webRequestEvent('onCompleted'), onErrorOccurred: webRequestEvent('onErrorOccurred') } : undefined;
  /** the entries an event reaches: webRequest present, the request's host granted, the filter matching */
  const reached = (ev: { ls: WebRequestEntry[] } | undefined, d: Record<string, any>): WebRequestEntry[] => {
    if (!ev || ![...granted].some((p) => matchesPattern(p, d.url))) return [];
    return ev.ls.filter((e) => !e.refused && e.filter.urls.some((p) => matchesPattern(p, d.url)) && (!e.filter.types || e.filter.types.includes(d.type)) && (e.filter.tabId === undefined || e.filter.tabId === d.tabId));
  };
  /** onCompleted and onErrorOccurred: plain listeners, told a moment after the response is handed over */
  const report = (name: 'onCompleted' | 'onErrorOccurred', r: Req, extra: Record<string, unknown>) => {
    setTimeout(() => {
      const d = { ...requestDetails(r), fromCache: false, ...extra };
      for (const e of reached(webRequest?.[name], d)) {
        try {
          e.fn(structuredClone(d));
        } catch (err) {
          L(`webRequest.${name} listener threw: ${(err as Error).message}`);
        }
      }
    }, 0);
  };
  const completed = (r: Req, statusCode: number) => report('onCompleted', r, { statusCode, statusLine: `HTTP/1.1 ${statusCode}` });
  const errored = (r: Req, error: string) => report('onErrorOccurred', r, { error });

  // the challenges, dispatched from a queue so that challenges due together reach the listeners in one task
  let held = false;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const due: Array<() => void> = [];
  /** asyncBlocking callbacks Chrome is still waiting for, with their listener; a stopped worker or a removed listener lets them go unanswered */
  const waiting = new Map<(why: string) => void, WebRequestEntry>();
  let dropNextRetry = false;
  function flushChallenges() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = undefined;
    for (const run of due.splice(0)) run();
  }
  /** one listener's answer: an asyncBlocking callback, a blocking return value, or nothing */
  const answerOf = (e: WebRequestEntry, d: Record<string, any>): Promise<any> => {
    const details = structuredClone({ ...d, ...(e.spec.includes('responseHeaders') ? { responseHeaders: [{ name: 'WWW-Authenticate', value: `Basic realm="${d.realm}"` }] } : {}) });
    const tag = `webRequest.onAuthRequired #${d.requestId}`;
    const call = (...a: unknown[]) => {
      try {
        return e.fn(details, ...a);
      } catch (err) {
        L(`${tag} listener threw: ${(err as Error).message}`);
        return undefined;
      }
    };
    if (e.spec.includes('asyncBlocking')) {
      return new Promise((resolve) => {
        let settled = false;
        let called = false;
        const settle = (r: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          waiting.delete(release);
          resolve(r);
        };
        const release = (why: string) => {
          if (!settled) L(`${tag} let go unanswered (${why})`);
          settle(undefined);
        };
        const timer = setTimeout(() => {
          if (!settled) L(`${tag} never answered`);
          settle(undefined);
        }, world.opts.authTimeoutMs);
        waiting.set(release, e);
        const callback = (r: unknown) => {
          if (called) return void L(`${tag} answered twice; the second answer is ignored`);
          called = true;
          settle(r ?? {});
        };
        // only the callback counts: Chrome reads nothing a listener returns, a Promise included
        const returned = call(callback);
        if (returned !== undefined) {
          L(`${tag} listener returned a value; Chrome ignores it`);
          if (typeof (returned as Promise<unknown>)?.then === 'function') (returned as Promise<unknown>).then(undefined, () => undefined);
        }
      });
    }
    if (e.spec.includes('blocking')) {
      const returned = call();
      if (typeof returned?.then === 'function') {
        L(`${tag} listener returned a Promise; Chrome takes it as no answer`);
        returned.then(undefined, () => undefined);
        return Promise.resolve(undefined);
      }
      return Promise.resolve(returned);
    }
    call();
    return Promise.resolve(undefined);
  };
  /** every listener the event reaches, at once, merged as Chrome merges: any cancel wins, else the first credentials */
  const dispatchNow = async (d: Record<string, any>): Promise<{ merged: Merged; listeners: number }> => {
    const entries = reached(webRequest?.onAuthRequired, d);
    const answers = await Promise.all(entries.map((e) => answerOf(e, d)));
    if (answers.some((a) => a?.cancel === true)) return { merged: { kind: 'cancel' }, listeners: entries.length };
    const c = answers.find((a) => a?.authCredentials && typeof a.authCredentials.username === 'string' && typeof a.authCredentials.password === 'string');
    if (c) return { merged: { kind: 'credentials', username: c.authCredentials.username, password: c.authCredentials.password }, listeners: entries.length };
    return { merged: { kind: 'none' }, listeners: entries.length };
  };
  /** an onAuthRequired event, through the queue; the one log line per answer, never a user name or password */
  const raise = (d: Record<string, any>, foreign = false): Promise<Merged> =>
    new Promise((resolve) => {
      due.push(() => {
        void dispatchNow(d).then(({ merged, listeners }) => {
          if (listeners > 0) {
            L(`webRequest.onAuthRequired #${d.requestId} ${d.type} ${pathOf(d.url)} tab=${d.tabId} -> ${merged.kind}`);
            world.authAnswers.push({
              requestId: d.requestId,
              type: d.type,
              tabId: d.tabId,
              path: pathOf(d.url),
              answer: merged.kind,
              ...(merged.kind === 'credentials' && !foreign ? { accepted: gridAccepts({ user: merged.username, password: merged.password }) } : {}),
              ...(foreign ? { foreign: true } : {}),
            });
          }
          resolve(merged);
        });
      });
      if (!held && !flushTimer) flushTimer = setTimeout(flushChallenges, 0);
    });
  /**
   * What Chrome sends by itself: the pair it chose at the request's start, then (after a 401) a pair another
   * request put in the cache meanwhile, found by the realm. A pair the grid turns down is Chrome's bad try
   * and leaves the cache. True when the grid let one in.
   */
  const chromeSends = (first: AuthCacheEntry | undefined, tried: AuthCacheEntry[]): boolean => {
    let sending = first;
    for (;;) {
      if (sending) {
        if (gridAccepts(sending)) return true;
        world.chromeBadTries++;
        if (world.authCache && samePair(world.authCache, sending)) world.authCache = undefined;
        tried.push(sending);
      }
      const c = world.authCache;
      if (!c || tried.some((t) => samePair(t, c))) return false;
      sending = { ...c };
    }
  };
  /**
   * The grid's check of one request, with Chrome's side of it: its own sends, then onAuthRequired, the answer
   * put in the cache before the retry, and the event again for the same request when the grid turns an
   * answer down. `force` challenges whatever the cache holds (a helper's tab challenge).
   */
  async function authorize(r: Req, delayMs: number, force = false): Promise<Gate> {
    const tried: AuthCacheEntry[] = force && world.authCache ? [{ ...world.authCache }] : [];
    const first = r.sendsAuth && !force && world.authCache ? { ...world.authCache } : undefined;
    if (delayMs > 0) await sleep(delayMs);
    // a request that carries no auth gets the 401 as it is: Chrome asks no one
    if (!r.sendsAuth) return { ok: false };
    if (chromeSends(first, tried)) return { ok: true };
    let last: AuthAnswerKind | undefined;
    for (;;) {
      const d = authDetails(r);
      if (!reached(webRequest?.onAuthRequired, d).length) return { ok: false, ...(last ? { last } : {}) };
      if (r.events >= world.opts.authRepeatLimit) {
        L(`webRequest.onAuthRequired #${r.requestId} LOOP: ${r.events} answers for one request; the 401 goes through`);
        return { ok: false, ...(last ? { last } : {}) };
      }
      r.events++;
      const a = await raise(d);
      last = a.kind;
      if (a.kind !== 'credentials') return { ok: false, last };
      const answer = { user: a.username, password: a.password, realm: world.realm };
      // Chrome puts the answer in its cache before the retry, not knowing yet whether it is good
      world.authCache = { ...answer };
      if (dropNextRetry) {
        dropNextRetry = false;
        L(`webRequest.onErrorOccurred #${r.requestId} net::ERR_CONNECTION_RESET (the retry after the answer was lost)`);
        errored(r, 'net::ERR_CONNECTION_RESET');
        throw new TypeError('Failed to fetch');
      }
      if (delayMs > 0) await sleep(delayMs);
      if (gridAccepts(answer)) return { ok: true, last };
      world.badAnswers++;
      if (world.authCache && samePair(world.authCache, answer)) world.authCache = undefined;
      if (world.opts.answeredStatus === 403) return { ok: false, last, status: 403 };
      tried.push(answer);
      if (chromeSends(undefined, tried)) return { ok: true, last };
    }
  }
  /** a portal page loaded in a tab: let in, or Chrome's own box over the tab */
  async function tabAuth(t: Tab, r: Req, force: boolean): Promise<AuthAnswerKind> {
    const nav = navs.get(t.id);
    let g: Gate;
    try {
      g = await authorize(r, 0, force);
    } catch {
      L(`tab #${t.id}: the page did not load (network error)`);
      return 'credentials';
    }
    if (g.ok) {
      completed(r, 200);
      return g.last ?? 'none';
    }
    // a 403 carries no challenge: the page shows it, and no box
    if (g.status === 403) {
      completed(r, 403);
      L(`tab #${t.id}: the 403 page`);
      return g.last ?? 'none';
    }
    // a listener's cancel: Chrome cancels the sign-in and shows the 401's own body, never its box (CANCEL_AUTH,
    // then CancelAuth in Chromium's source; not yet measured by this project)
    if (g.last === 'cancel') {
      completed(r, 401);
      L(`tab #${t.id}: the 401 page (a listener cancelled the challenge)`);
      return 'cancel';
    }
    // a late answer never puts a box over a page the tab has left
    if (world.tabs.has(t.id) && navs.get(t.id) === nav) {
      world.boxes.set(t.id, { requestId: r.requestId, url: r.url });
      boxReqs.set(t.id, r);
      L(`Chrome's sign-in box over tab #${t.id}`);
    }
    return g.last ?? 'none';
  }
  const portalPage = (url: string) => {
    try {
      const u = new URL(url);
      return u.origin === ORIGIN && u.pathname !== '/' && !u.pathname.startsWith('/public');
    } catch {
      return false;
    }
  };
  function tabChallengeImpl(tabId: number, path: string): Promise<AuthAnswerKind> {
    const t = world.tabs.get(tabId);
    if (!t) throw new Error(`No tab with id: ${tabId}`);
    return tabAuth(t, newReq(`${ORIGIN}${path}`, 'GET', 'main_frame', tabId, undefined, 'include'), true);
  }
  async function answerBoxImpl(tabId: number, user: string, password: string): Promise<boolean> {
    const r = boxReqs.get(tabId);
    if (!r || !world.boxes.has(tabId)) throw new Error(`no sign-in box over tab #${tabId}`);
    world.boxes.delete(tabId);
    boxReqs.delete(tabId);
    L(`Chrome's sign-in box over tab #${tabId}: answered`);
    const pair = { user, password, realm: world.realm };
    world.authCache = { ...pair };
    const t = world.tabs.get(tabId);
    if (gridAccepts(pair)) {
      // Chrome resumes the boxed request itself with the pair (RestartWithAuth): it ends let in, under its own
      // id, whatever the tab's address (a challenge raised for another path of the tab included); the page then loads
      completed(r, 200);
      if (t) load(t);
      return true;
    }
    // turned down: Chrome drops it and the challenge comes again for the same request, then the box
    if (world.authCache && samePair(world.authCache, pair)) world.authCache = undefined;
    if (t) await tabAuth(t, r, false);
    return false;
  }
  async function foreignChallenge(url: string, over: Record<string, unknown>): Promise<AuthAnswerKind> {
    const r = newReq(url, 'GET', 'xmlhttprequest', -1, EXT, 'include');
    const d = { ...authDetails(r), ...over };
    if (!reached(webRequest?.onAuthRequired, d).length) return 'none';
    return (await raise(d, true)).kind;
  }
  const permAdded = ev();
  const permRemoved = ev();
  function grantImpl(origin: string) {
    const p = `${new URL(origin).origin}/*`;
    if (granted.has(p)) return;
    granted.add(p);
    L(`permissions: ${p} granted`);
    permAdded.fire({ origins: [p], permissions: [] });
  }
  function revokeImpl(origin: string) {
    const p = `${new URL(origin).origin}/*`;
    if (!granted.delete(p)) return;
    L(`permissions: ${p} removed`);
    permRemoved.fire({ origins: [p], permissions: [] });
  }
  let nextTab = 10;
  const onUpdated = ev();
  const onRemoved = ev();
  const onActivated = ev();
  const visible = (url: string) => {
    try {
      const u = new URL(url);
      if (url.startsWith(EXT)) return true;
      return granted.has(`${u.origin}/*`);
    } catch {
      return false;
    }
  };
  const tabView = (t: Tab) => ({ id: t.id, windowId: t.windowId, status: t.status, active: t.active, ...(visible(t.url) ? { url: t.url } : {}) });
  const load = (t: Tab) => {
    t.status = 'loading';
    navs.set(t.id, (navs.get(t.id) ?? 0) + 1);
    world.boxes.delete(t.id);
    boxReqs.delete(t.id);
    // 19.0.0: a portal page goes through the grid's sign-in (a box over the tab when nothing answers); the events stay as before
    if (portalPage(t.url)) {
      const r = newReq(t.url, 'GET', 'main_frame', t.id, undefined, 'include');
      setTimeout(() => void tabAuth(t, r, false), 0);
    }
    setTimeout(() => {
      if (!world.tabs.has(t.id)) return;
      onUpdated.fire(t.id, { status: 'loading' }, tabView(t));
    }, 5);
    setTimeout(() => {
      if (!world.tabs.has(t.id)) return;
      t.status = 'complete';
      onUpdated.fire(t.id, { status: 'complete' }, tabView(t));
    }, 40);
  };
  function openTabImpl(url: string, windowId: number, active: boolean): Tab {
    const t: Tab = { id: nextTab++, windowId, url: url || 'chrome://newtab/', status: 'loading', active };
    world.tabs.set(t.id, t);
    load(t);
    return t;
  }
  function navigateImpl(id: number, url: string): void {
    const t = world.tabs.get(id);
    if (!t) throw new Error(`No tab with id: ${id}`);
    t.url = url;
    load(t);
  }
  function removeImpl(id: number): void {
    if (!world.tabs.delete(id)) throw new Error(`No tab with id: ${id}`);
    world.boxes.delete(id);
    boxReqs.delete(id);
    onRemoved.fire(id, {});
  }
  // ---- tab mode's page script (world.opts.pageScript), as src/entrypoints/portal.content.ts answers ----
  const pageScriptIn = (tabId: number) => !!world.opts.pageScript && !!world.tabs.get(tabId)?.url.startsWith(`${ORIGIN}/`);
  // 19.0.0: the page's own requests are the tab's (tabId, the portal as initiator), where the worker's are tabId -1
  const pageClient = async (tabId: number) => {
    const [{ PortalClient }, { Audit }, { local }] = await Promise.all([import('../src/core/portal'), import('../src/core/audit'), import('../src/ext/storage')]);
    return new PortalClient(ORIGIN, { fetch: (i: string, init?: RequestInit) => portalFetch(i, init, { tabId, initiator: ORIGIN }), WebSocket: (globalThis as any).WebSocket }, new Audit(local), { shellHost: 'default', credentials: 'same-origin', via: 'page' });
  };
  /** the connect port: Chrome fires onDisconnect only on the far end of the side that called disconnect() */
  function pageConnectPort(tabId: number) {
    const toExt = ev();
    const extGone = ev();
    const toPage = ev();
    const pageGone = ev();
    let open = true;
    const end = (by: 'extension' | 'page') => {
      if (!open) return;
      open = false;
      L(`tab #${tabId}: connect port disconnected by the ${by}`);
      (by === 'extension' ? pageGone : extGone).fire();
    };
    const say = (m: unknown) => setTimeout(() => open && toExt.fire(m), 0);
    let session: any;
    pageGone.addListener(() => session?.close());
    toPage.addListener(async (m: any) => {
      if (m?.type === 'close') {
        L(`tab #${tabId}: the page script was asked to close its sitting`);
        session?.close();
      } else if (m?.type === 'input') session?.send(m.text);
      else if (m?.type === 'connect') {
        const [{ commands }, { ConnectWatcher }] = await Promise.all([import('../src/core/contract'), import('../src/core/login')]);
        const watcher = new ConnectWatcher((event: unknown) => say({ type: 'event', event }));
        try {
          session = await (await pageClient(tabId)).openLoginShell(commands.connect(m.sharedDir, m.options), (text: string) => watcher.feed(text));
        } catch (e) {
          say({ type: 'error', message: (e as Error).message });
          return;
        }
        if (!open) return session.close();
        say({ type: 'open' });
        const e = await session.done;
        if (e.reason === 'password') say({ type: 'password' });
        say({ type: 'closed', reason: e.reason });
        setTimeout(() => end('page'), 0);
      }
    });
    return {
      name: 'beethoven-connect',
      postMessage(m: unknown) {
        if (!open) throw new Error('Attempting to use a disconnected port object');
        setTimeout(() => toPage.fire(m), 0);
      },
      disconnect: () => end('extension'),
      onMessage: toExt,
      onDisconnect: extGone,
    };
  }
  const areas: Record<string, any> = {};
  const onChanged = ev();
  for (const name of ['local', 'session'] as const) {
    const store = world.storage[name];
    areas[name] = {
      async get(keys: string | string[]) {
        const ks = Array.isArray(keys) ? keys : [keys];
        const r: Record<string, unknown> = {};
        for (const k of ks) if (k in store) r[k] = structuredClone(store[k]);
        return r;
      },
      async set(items: Record<string, unknown>) {
        const ch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(items)) {
          ch[k] = { oldValue: store[k], newValue: structuredClone(v) };
          store[k] = structuredClone(v);
        }
        onChanged.fire(ch, name);
      },
      async remove(k: string | string[]) {
        const ks = Array.isArray(k) ? k : [k];
        const ch: Record<string, unknown> = {};
        for (const x of ks) {
          if (x in store) {
            ch[x] = { oldValue: store[x] };
            delete store[x];
          }
        }
        if (Object.keys(ch).length) onChanged.fire(ch, name);
      },
    };
  }
  // 19.0.0: who may read storage.session; Chrome's default is the extension's own pages and worker only
  areas.session.setAccessLevel = async (a: { accessLevel: string }) => {
    world.sessionAccessLevel = a.accessLevel;
    L(`storage.session.setAccessLevel ${a.accessLevel}`);
  };
  const alarms = new Map<string, any>();
  /** the manifest's permissions as the Chrome build declares them (the build without webRequest declares neither of its two) */
  const manifestPermissions = ['storage', 'alarms', 'scripting', 'sidePanel', ...(withWebRequest ? ['webRequest', 'webRequestAuthProvider'] : [])];
  const runtime = {
    id: 'ext',
    lastError: undefined,
    getManifest: () => ({ manifest_version: 3, version: '11.0.0', permissions: [...manifestPermissions], optional_host_permissions: ['https://*/*'] }),
    getURL: (p: string) => `${EXT}${p.startsWith('/') ? p : `/${p}`}`,
    onMessage: ev(),
    onConnect: ev(),
    onInstalled: ev(),
    onStartup: ev(),
    openOptionsPage: async () => {
      L('runtime.openOptionsPage');
    },
    sendMessage: async () => undefined,
    // 12.0.0
    getPlatformInfo: async () => ({ os: world.os ?? 'win', arch: 'x86-64' }),
    connectNative: (name: string) => {
      L(`runtime.connectNative ${name}`);
      if (world.native) return world.native(name);
      // Chrome with no host registered under that name: the port ends at once with this sentence
      const discL: Array<() => void> = [];
      setTimeout(() => {
        (runtime as any).lastError = { message: 'Specified native messaging host not found.' };
        for (const f of discL) f();
        (runtime as any).lastError = undefined;
      }, 1);
      return { postMessage: () => undefined, disconnect: () => undefined, onMessage: { addListener: () => undefined }, onDisconnect: { addListener: (f: () => void) => discL.push(f) } };
    },
  };
  world.chrome = {
    runtime,
    storage: { local: areas.local, session: areas.session, onChanged },
    alarms: {
      get: async (n: string) => alarms.get(n),
      create: async (n: string, o: any) => {
        alarms.set(n, { name: n, scheduledTime: o?.when ?? Date.now() + (o?.delayInMinutes ?? o?.periodInMinutes ?? 0) * 60_000, ...o });
      },
      clear: async (n: string) => alarms.delete(n),
      onAlarm: ev(),
      getAll: async () => [...alarms.values()],
    },
    tabs: {
      onUpdated,
      onRemoved,
      onActivated,
      async get(id: number) {
        const t = world.tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}`);
        return tabView(t);
      },
      async query(q: any) {
        return [...world.tabs.values()].filter((t) => (q.windowId === undefined || t.windowId === q.windowId) && (q.active === undefined || t.active === q.active)).map(tabView);
      },
      async create(o: any) {
        const t = openTabImpl(o.url ?? 'chrome://newtab/', o.windowId ?? 1, o.active ?? true);
        L(`tabs.create #${t.id} ${o.url ?? '(new tab)'} active=${o.active}`);
        return tabView(t);
      },
      async update(id: number, o: any) {
        const t = world.tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}`);
        if (o.url) {
          L(`tabs.update #${id} url ${t.url} -> ${o.url}`);
          navigateImpl(id, o.url);
        }
        if (o.active) {
          // 18.0.0: a tab brought to the front is the only active one in its window, and says so in the log
          for (const x of world.tabs.values()) if (x.windowId === t.windowId) x.active = false;
          t.active = true;
          L(`tabs.update #${id} active`);
          onActivated.fire({ tabId: id, windowId: t.windowId });
        }
        return tabView(t);
      },
      async remove(id: number) {
        const t = world.tabs.get(id);
        L(`tabs.remove #${id} (was ${t?.url})`);
        removeImpl(id);
      },
      async sendMessage(tabId: number, msg: any) {
        if (!pageScriptIn(tabId)) throw new Error('Could not establish connection. Receiving end does not exist.');
        const { fail, succeed } = await import('../src/core/messages');
        if (msg?.type === 'portal.ping') return succeed(true);
        if (msg?.type !== 'portal.call') return undefined;
        try {
          const client = (await pageClient(tabId)) as any;
          return succeed(await client[msg.op](...(msg.args ?? [])));
        } catch (e) {
          return fail(e as Error);
        }
      },
      connect(tabId: number, o: { name?: string } = {}) {
        if (!pageScriptIn(tabId) || o.name !== 'beethoven-connect') throw new Error('no content script');
        return pageConnectPort(tabId);
      },
      async getCurrent() {
        return undefined;
      },
    },
    windows: {
      async update(id: number, o: any) {
        if (o?.focused) L(`windows.update #${id} focused`);
        return {};
      },
      getCurrent: async () => ({ id: 1 }),
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
      getUserSettings: async () => ({ isOnToolbar: true }),
      onUserSettingsChanged: ev(),
    },
    permissions: {
      contains: async (p: any) => (p.origins ?? []).every((o: string) => granted.has(o)) && (p.permissions ?? []).every((x: string) => manifestPermissions.includes(x)),
      getAll: async () => ({ origins: [...granted], permissions: [...manifestPermissions] }),
      remove: async (p: any) => {
        const gone = (p.origins ?? []).filter((o: string) => granted.delete(o));
        if (gone.length) permRemoved.fire({ origins: gone, permissions: [] });
        return true;
      },
      // the student said yes: what was asked for is granted, and onAdded says so
      request: async (p: any = {}) => {
        const added = (p.origins ?? []).filter((o: string) => !granted.has(o));
        for (const x of added) granted.add(x);
        if (added.length) permAdded.fire({ origins: added, permissions: [] });
        return true;
      },
      onAdded: permAdded,
      onRemoved: permRemoved,
    },
    scripting: {
      getRegisteredContentScripts: async () => [],
      unregisterContentScripts: async () => {},
      registerContentScripts: async () => {},
      executeScript: async (o: any) => {
        L(`scripting.executeScript #${o.target?.tabId}`);
        return [];
      },
    },
    sidePanel: { setPanelBehavior: async () => {}, open: async () => {} },
    ...(webRequest ? { webRequest } : {}),
  };
  async function fireAlarmImpl(name: string): Promise<boolean> {
    const a = alarms.get(name);
    if (!a) {
      L(`alarm ${name}: not set, not fired`);
      return false;
    }
    if (a.periodInMinutes === undefined) alarms.delete(name);
    L(`alarm ${name}`);
    await Promise.all(world.chrome.alarms.onAlarm.fire({ name, scheduledTime: a.scheduledTime, ...(a.periodInMinutes !== undefined ? { periodInMinutes: a.periodInMinutes } : {}) }));
    return true;
  }
  function stopWorkerImpl() {
    L('the service worker stopped');
    const c = world.chrome;
    const events = [c.runtime.onMessage, c.runtime.onConnect, c.runtime.onInstalled, c.runtime.onStartup, c.storage.onChanged, c.alarms.onAlarm, c.tabs.onUpdated, c.tabs.onRemoved, c.tabs.onActivated, c.action.onUserSettingsChanged, permAdded, permRemoved];
    for (const e of events) e.ls.length = 0;
    if (webRequest) for (const e of Object.values(webRequest)) e.ls.length = 0;
    // the pages' ports lose the worker's end of them
    for (const p of viewPorts.get(world) ?? []) {
      p.onMessage.ls.length = 0;
      p.onDisconnect.ls.length = 0;
    }
    // Chrome lets a request a stopped listener held go on with no answer
    for (const release of [...waiting.keys()]) release('the worker stopped');
    for (const s of [...sockets]) s.close(1006);
  }
  // one stable object for the whole test file, forwarding to this test's fake: wxt/browser (an external
  // module, never reloaded by vi.resetModules) keeps the object it found when it was first loaded
  current = world.chrome;
  (globalThis as any).chrome = STABLE;
  (globalThis as any).browser = STABLE;
  // 19.0.0: no IndexedDB unless the test asks for one (or put its own in before), so code that needs one must
  // say what happens without it; an earlier test's from install() does not carry over
  if (o.indexedDB) {
    world.idb = fakeIndexedDB(L);
    (globalThis as any).indexedDB = world.idb;
    installedIdb = world.idb;
  } else if ((globalThis as any).indexedDB === installedIdb) delete (globalThis as any).indexedDB;

  // ---- the fake portal: fetch ----
  const mkRes = (body: string, status: number, url: string, type = 'basic', contentType = 'text/html', headers: Record<string, string> = {}) => {
    const r = new Response(status === 204 || status === 304 ? null : body, { status, headers: { 'content-type': contentType, date: new Date().toUTCString(), ...headers } });
    Object.defineProperty(r, 'url', { value: url });
    Object.defineProperty(r, 'type', { value: type });
    return r;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /** the grid's 401, with its challenge, as Apache sends it */
  const unauthorized = (url: string) => mkRes('Unauthorized', 401, url, 'basic', 'text/html', { 'www-authenticate': `Basic realm="${world.realm}"` });
  /** the mock's --cold-pun: the first /pun/ request the grid lets in after a quiet spell meets the per-user server starting */
  let punWarmUntil = 0;
  const coldPun = (url: string) => {
    if (!(world.opts.coldPun > 0)) return undefined;
    const now = Date.now();
    const cold = now > punWarmUntil;
    punWarmUntil = now + world.opts.coldPun;
    return cold ? mkRes('<h1>Error: Server Error</h1><p>Something went wrong. Please try again in 30 seconds.</p>', 500, url) : undefined;
  };
  /** the worker's own requests: tabId -1, the extension as initiator */
  const WORKER = { tabId: -1, initiator: EXT };
  async function portalFetch(input: any, init: any = {}, ctx: { tabId: number; initiator?: string } = WORKER): Promise<Response> {
    const url = String(input);
    if (url.startsWith(EXT)) {
      const p = url.slice(EXT.length).split('?')[0]!;
      if (world.files.has(p)) return mkRes(world.files.get(p)!, 200, url);
      try {
        return mkRes(readFileSync(PUBLIC + p, 'utf8'), 200, url);
      } catch {
        return mkRes('', 404, url);
      }
    }
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new TypeError('Failed to fetch');
    }
    if (u.origin !== ORIGIN) {
      world.external.push(`${init.method ?? 'GET'} ${url}`);
      L(`EXTERNAL ${init.method ?? 'GET'} ${url}`);
      throw new TypeError('Failed to fetch');
    }
    const r = newReq(url, init.method ?? 'GET', 'xmlhttprequest', ctx.tabId, ctx.initiator, init.credentials);
    world.onPortalRequest?.({ requestId: r.requestId, url, method: r.method, type: r.type, tabId: r.tabId });
    if (!world.opts.reach) {
      await sleep(10);
      errored(r, 'net::ERR_CONNECTION_TIMED_OUT');
      throw new TypeError('Failed to fetch');
    }
    // without host access, a cors-mode request to a server that sends no CORS headers fails like a network error
    if (!granted.has(`${ORIGIN}/*`) && init.mode !== 'no-cors') {
      L(`fetch ${u.pathname} refused by CORS (no host access)`);
      throw new TypeError('Failed to fetch');
    }
    L(`fetch ${init.method ?? 'GET'} ${u.pathname}${u.search}`);
    const done = (res: Response) => (completed(r, res.status), res);
    /** the grid's sign-in, then the page; the 401 when it does not let the request in */
    const signedPage = async (delayMs: number, page: () => Response) => {
      const g = await authorize(r, delayMs);
      if (!g.ok) return done(g.status === 403 ? mkRes('Forbidden', 403, url) : unauthorized(url));
      return done(coldPun(url) ?? page());
    };
    if (u.pathname === '/') return done(mkRes('', 302, url, init.mode === 'no-cors' ? 'opaqueredirect' : 'basic'));
    if (u.pathname === '/pun/sys/dashboard/') return signedPage(world.opts.dashboardDelayMs, () => mkRes(`<html><head><meta name="csrf-token" content="tok123"></head><body>Open OnDemand Logged in as st1234</body></html>`, 200, url));
    // 19.0.0: behind the sign-in, as the mock's (it was answered signed out until then)
    if (u.pathname === '/pun/sys/dashboard/files') return signedPage(0, () => mkRes(JSON.stringify({ path: HOME }), 200, `${ORIGIN}/pun/sys/dashboard/files/fs${HOME}`));
    if (u.pathname.startsWith('/pun/sys/dashboard/files/fs')) {
      return signedPage(0, () => {
        const p = decodeURIComponent(u.pathname.slice('/pun/sys/dashboard/files/fs'.length)).replace(/\/+$/, '');
        if (u.searchParams.has('download')) {
          const c = world.fs.get(p);
          // a download is a file (the Files app answers a missing one with its own page, which the client reads as absent)
          return c === undefined ? mkRes('<html>missing</html>', 404, url) : mkRes(c, 200, url, 'basic', 'application/octet-stream');
        }
        if (!world.dirs.has(p)) return mkRes('not found', 404, url);
        const files = [...world.fs.keys()]
          .filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes('/'))
          .map((k) => ({ name: k.slice(p.length + 1), type: 'f', size: world.fs.get(k)!.length, modified_at: mtimes.get(k) ?? Math.floor(Date.now() / 1000) }));
        const subdirs = [...world.dirs].filter((d) => d.startsWith(`${p}/`) && !d.slice(p.length + 1).includes('/')).map((d) => ({ name: d.slice(p.length + 1), type: 'd', size: 0, modified_at: 0 }));
        return mkRes(JSON.stringify({ files: [...files, ...subdirs] }), 200, url);
      });
    }
    if (u.pathname.startsWith('/pun/sys/shell/ssh/')) return signedPage(world.opts.shellPageDelayMs, () => mkRes(`<html><script>var url = base + "?" + "csrf=abc123";</script></html>`, 200, url));
    return done(mkRes('nope', 404, url));
  }
  (globalThis as any).fetch = (input: any, init?: any) => portalFetch(input, init);
  /** each file's modified_at, ticking with every write so a listing sees a change */
  const mtimes = new Map<string, number>();
  let tick = Math.floor(Date.now() / 1000);
  const origSet = world.fs.set.bind(world.fs);
  world.fs.set = (k: string, v: string) => {
    mtimes.set(k, ++tick);
    return origSet(k, v);
  };

  // ---- the fake portal: the shell WebSocket ----
  class FakeWS {
    readyState = 0;
    private ls: Record<string, Fn[]> = {};
    private buf = '';
    private codeWait?: (code: string) => void;
    constructor(readonly url: string) {
      const path = new URL(url).pathname;
      L(`ws open ${path}`);
      sockets.add(this);
      // 19.0.0: the handshake carries what Chrome's auth cache holds when it starts (webRequest never sees a
      // worker's WebSocket, so no listener is asked); without a pair the grid takes, it fails before 'open'
      const portal = new URL(url).host === new URL(ORIGIN).host;
      if (portal) {
        const r = newReq(url, 'GET', 'websocket', -1, EXT, 'include');
        world.onPortalRequest?.({ requestId: r.requestId, url, method: r.method, type: r.type, tabId: r.tabId });
      }
      const first = portal && world.authCache ? { ...world.authCache } : undefined;
      setTimeout(() => {
        if (this.readyState !== 0) return;
        if (portal && !chromeSends(first, [])) {
          this.readyState = 3;
          sockets.delete(this);
          L(`ws ${path}: handshake 401 (no sign-in in the browser's cache the grid takes)`);
          this.emit('error');
          this.emit('close', { code: 1006, reason: '' });
          return;
        }
        this.readyState = 1;
        this.emit('open');
        setTimeout(() => this.out(world.opts.keyless ? "st1234@warrior's password: " : 'Last login: today\r\n[st1234@login1 ~]$ '), 20);
      }, 10);
    }
    addEventListener(t: string, f: Fn) {
      (this.ls[t] ??= []).push(f);
    }
    private emit(t: string, e: any = {}) {
      for (const f of this.ls[t] ?? []) f(e);
    }
    private out(s: string) {
      if (this.readyState === 1) this.emit('message', { data: s });
    }
    close(code = 1000, reason = '') {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      sockets.delete(this);
      setTimeout(() => this.emit('close', { code, reason }), 1);
    }
    send(data: string) {
      const m = JSON.parse(data);
      if (typeof m.input !== 'string') return;
      if (this.codeWait) {
        const c = m.input.replace(/\r$/, '');
        const w = this.codeWait;
        this.codeWait = undefined;
        w(c);
        return;
      }
      this.buf += m.input;
      const i = this.buf.indexOf('\r');
      if (i < 0) return;
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      world.shellLines.push({ at: world.now(), line });
      L(`shell line: ${line.slice(0, 140)}`);
      // the terminal echoes the line, as bash does
      this.out(`${line}\r\n`);
      if (line === 'exit') return this.close(1000);
      const wrapped = /^__b=ASHBR([0-9a-f]+); .*\( (.*) \) 2>&1;/.exec(line);
      if (wrapped) {
        const nonce = wrapped[1]!;
        const cmd = wrapped[2]!;
        let output = '';
        if (/worker stop/.test(cmd)) {
          output = 'worker worker: stopped (the job left)';
          const sj = `${STATE}/worker/status.json`;
          if (world.fs.has(sj)) world.fs.set(sj, JSON.stringify({ ...JSON.parse(world.fs.get(sj)!), state: 'stopped', stop_reason: 'request', updated_at: new Date().toISOString() }));
        } else if (/worker status/.test(cmd)) output = JSON.stringify({ v: 1, state: 'queued', scheduler: { state: 'PENDING', reason: 'Priority' } });
        setTimeout(() => {
          this.out(`\r\nASHBR${nonce}_BEGIN\r\n${output}\r\nASHBR${nonce}_END:0\r\n`);
          this.close(1000);
        }, 20);
        return;
      }
      if (/hpcworker' connect /.test(line)) {
        world.connectLines.push({ at: world.now(), line });
        void this.connect(line);
      }
    }
    private async connect(line: string) {
      const say = async (s: string, ms = 15) => {
        await sleep(ms);
        this.out(`${s}\r\n`);
      };
      await say('HPCW-STEP setup ready');
      if (/--consent/.test(line)) await say('HPCW-STEP consent');
      const runDir = `${STATE}/worker`;
      world.dirs.add(STATE);
      world.dirs.add(runDir);
      const kept = world.fs.has(`${runDir}/status.json`) && JSON.parse(world.fs.get(`${runDir}/status.json`)!).state === 'queued';
      if (!kept) world.fs.set(`${runDir}/status.json`, JSON.stringify({ version: 10, job: '40501234', state: 'queued', submitted_at: new Date().toISOString(), updated_at: new Date().toISOString(), title: 'Wayne State grid' }));
      await say(`HPCW-STEP queued 40501234 ${kept ? 'kept' : 'new'} ${runDir}`);
      const login = /--login '(\w+)'/.exec(line)?.[1];
      if (login === 'never' || (login === 'auto' && world.opts.claudeSignedIn)) {
        if (world.opts.claudeSignedIn && login !== 'never') await say('HPCW-STEP signed-in st1234@wayne.edu max');
        await say('HPCW-STEP done');
        this.close(1000);
        return;
      }
      await say('HPCW-STEP signin');
      await say('HPCW-LOGIN: requesting a compute node');
      await say('HPCW-LOGIN: on asx1; checking whether you are signed in already', 100);
      const n = world.connectLines.length;
      await say(`AUTH-URL: ${world.opts.authUrl ?? `https://claude.ai/oauth/authorize?sitting=${n}`}`);
      await say('HPCW-LOGIN: paste the code from that page');
      const code = await new Promise<string>((r) => (this.codeWait = r));
      L(`connect sitting #${n} received a code of length ${code.length}`);
      await say('HPCW-LOGIN: code received, checking');
      world.opts.claudeSignedIn = true;
      await say('SIGNED-IN st1234@wayne.edu max');
      await say('HPCW-STEP signed-in st1234@wayne.edu max');
      await say('HPCW-STEP done');
      this.close(1000);
    }
  }
  (globalThis as any).WebSocket = FakeWS;

  // ---- the account: set up on the lab's shared copy ----
  for (const d of [HOME, `${HOME}/.hpcworker`, `${HOME}/.hpcworker/bin`]) world.dirs.add(d);
  world.fs.set(`${HOME}/.hpcworker/profile.json`, JSON.stringify({ site: 'wayne', shared_state_dir: '/rs/rs_grp_oschome/$USER/hpcworker', shared_install: SHARED }));
  world.fs.set(`${HOME}/.hpcworker/shared`, SHARED);
  world.fs.set(`${HOME}/.hpcworker/bin/hpcworker`, `#!/bin/bash\n${LAUNCHER_TAG}\nexec bash ${SHARED}/bin/hpcworker "$@"\n`);
  return world;
}

/** a view port as a page opens it; `tabId` for a page in a tab (the welcome page) */
export function openPort(world: World, surface: 'panel' | 'welcome' | 'details' | 'settings', o: { windowId?: number; tabId?: number } = {}) {
  const views: any[] = [];
  const msg = ev();
  const disc = ev();
  const port = { name: 'beethoven-view', sender: { id: 'ext', ...(o.tabId !== undefined ? { tab: { id: o.tabId } } : {}) }, postMessage: (m: any) => views.push(m), onMessage: msg, onDisconnect: disc };
  if (!viewPorts.has(world)) viewPorts.set(world, new Set());
  viewPorts.get(world)!.add({ onMessage: msg, onDisconnect: disc });
  world.chrome.runtime.onConnect.fire(port);
  msg.fire({ type: 'subscribe', surface, windowId: o.windowId ?? 1 });
  return { views, tick: () => msg.fire({ type: 'tick' }), close: () => disc.fire(), last: () => views[views.length - 1]?.view };
}

/** a message from an extension page */
export async function send(world: World, m: unknown): Promise<any> {
  const results = world.chrome.runtime.onMessage.fire(m, { id: 'ext' });
  return results.find((r: unknown) => r !== undefined);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
