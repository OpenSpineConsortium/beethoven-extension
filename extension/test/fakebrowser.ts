// A fake Chrome for running the extension's real background (src/entrypoints/background.ts) under Node,
// with a fake portal behind fetch and WebSocket (11.0.0 review: the code reviewer's harness, made a test
// helper). Nothing here reaches the network: every fetch is answered in-process, and any address that
// is not the fake portal or the extension's own files is recorded and refused.
import { readFileSync } from 'node:fs';
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

export interface World {
  log: string[];
  external: string[];
  tabs: Map<number, Tab>;
  storage: { local: Record<string, unknown>; session: Record<string, unknown> };
  fs: Map<string, string>;
  dirs: Set<string>;
  shellLines: Array<{ at: number; line: string }>;
  connectLines: Array<{ at: number; line: string }>;
  opts: { dashboardDelayMs: number; shellPageDelayMs: number; signedIn: boolean; reach: boolean; keyless: boolean; claudeSignedIn: boolean; connectHold: boolean };
  chrome: any;
  granted: Set<string>;
  sockets: Set<any>;
  t0: number;
  now(): number;
  openTab(url: string, windowId?: number, active?: boolean): Tab;
  navigate(id: number, url: string): void;
  closeTab(id: number): void;
}

let current: any = {};
const STABLE = new Proxy({}, { get: (_t, k) => current[k as string], has: (_t, k) => k in current });

export function install(): World {
  const t0 = Date.now();
  const granted = new Set<string>([`${ORIGIN}/*`]);
  const sockets = new Set<any>();
  const world: World = {
    log: [],
    external: [],
    tabs: new Map(),
    storage: { local: {}, session: {} },
    fs: new Map(),
    dirs: new Set(),
    shellLines: [],
    connectLines: [],
    opts: { dashboardDelayMs: 20, shellPageDelayMs: 0, signedIn: true, reach: true, keyless: false, claudeSignedIn: false, connectHold: false },
    chrome: undefined,
    granted,
    sockets,
    t0,
    now: () => Date.now() - t0,
    openTab: (url, windowId = 1, active = true) => openTabImpl(url, windowId, active),
    navigate: (id, url) => navigateImpl(id, url),
    closeTab: (id) => removeImpl(id),
  };
  const L = (s: string) => world.log.push(`${String(world.now()).padStart(6)} ${s}`);
  let nextTab = 10;
  const onUpdated = ev();
  const onRemoved = ev();
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
    onRemoved.fire(id, {});
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
  const alarms = new Map<string, any>();
  const runtime = {
    id: 'ext',
    lastError: undefined,
    getManifest: () => ({ version: '11.0.0' }),
    getURL: (p: string) => `${EXT}${p.startsWith('/') ? p : `/${p}`}`,
    onMessage: ev(),
    onConnect: ev(),
    onInstalled: ev(),
    onStartup: ev(),
    openOptionsPage: async () => {
      L('runtime.openOptionsPage');
    },
    sendMessage: async () => undefined,
  };
  world.chrome = {
    runtime,
    storage: { local: areas.local, session: areas.session, onChanged },
    alarms: {
      get: async (n: string) => alarms.get(n),
      create: async (n: string, o: any) => {
        alarms.set(n, { name: n, ...o });
      },
      clear: async (n: string) => alarms.delete(n),
      onAlarm: ev(),
      getAll: async () => [...alarms.values()],
    },
    tabs: {
      onUpdated,
      onRemoved,
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
        if (o.active) t.active = true;
        return tabView(t);
      },
      async remove(id: number) {
        const t = world.tabs.get(id);
        L(`tabs.remove #${id} (was ${t?.url})`);
        removeImpl(id);
      },
      async sendMessage() {
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
      connect() {
        throw new Error('no content script');
      },
      async getCurrent() {
        return undefined;
      },
    },
    windows: { update: async () => ({}), getCurrent: async () => ({ id: 1 }) },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setTitle: async () => {},
      setIcon: async () => {},
      getUserSettings: async () => ({ isOnToolbar: true }),
      onUserSettingsChanged: ev(),
    },
    permissions: {
      contains: async (p: any) => (p.origins ?? []).every((o: string) => granted.has(o)),
      getAll: async () => ({ origins: [...granted], permissions: [] }),
      remove: async (p: any) => {
        for (const o of p.origins ?? []) granted.delete(o);
        return true;
      },
      request: async () => true,
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
  };
  // one stable object for the whole test file, forwarding to this test's fake: wxt/browser (an external
  // module, never reloaded by vi.resetModules) keeps the object it found when it was first loaded
  current = world.chrome;
  (globalThis as any).chrome = STABLE;
  (globalThis as any).browser = STABLE;

  // ---- the fake portal: fetch ----
  const mkRes = (body: string, status: number, url: string, type = 'basic', contentType = 'text/html') => {
    const r = new Response(status === 204 || status === 304 ? null : body, { status, headers: { 'content-type': contentType, date: new Date().toUTCString() } });
    Object.defineProperty(r, 'url', { value: url });
    Object.defineProperty(r, 'type', { value: type });
    return r;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  (globalThis as any).fetch = async (input: any, init: any = {}) => {
    const url = String(input);
    if (url.startsWith(EXT)) {
      const p = url.slice(EXT.length).split('?')[0]!;
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
    if (!world.opts.reach) {
      await sleep(10);
      throw new TypeError('Failed to fetch');
    }
    // without host access, a cors-mode request to a server that sends no CORS headers fails like a network error
    if (!granted.has(`${ORIGIN}/*`) && init.mode !== 'no-cors') {
      L(`fetch ${u.pathname} refused by CORS (no host access)`);
      throw new TypeError('Failed to fetch');
    }
    L(`fetch ${init.method ?? 'GET'} ${u.pathname}${u.search}`);
    if (u.pathname === '/') return mkRes('', 302, url, init.mode === 'no-cors' ? 'opaqueredirect' : 'basic');
    if (u.pathname === '/pun/sys/dashboard/') {
      await sleep(world.opts.dashboardDelayMs);
      if (!world.opts.signedIn) return mkRes('Unauthorized', 401, url);
      return mkRes(`<html><head><meta name="csrf-token" content="tok123"></head><body>Open OnDemand Logged in as st1234</body></html>`, 200, url);
    }
    if (u.pathname === '/pun/sys/dashboard/files') return mkRes(JSON.stringify({ path: HOME }), 200, `${ORIGIN}/pun/sys/dashboard/files/fs${HOME}`);
    if (u.pathname.startsWith('/pun/sys/dashboard/files/fs')) {
      if (!world.opts.signedIn) return mkRes('Unauthorized', 401, url);
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
    }
    if (u.pathname.startsWith('/pun/sys/shell/ssh/')) {
      await sleep(world.opts.shellPageDelayMs);
      if (!world.opts.signedIn) return mkRes('Unauthorized', 401, url);
      return mkRes(`<html><script>var url = base + "?" + "csrf=abc123";</script></html>`, 200, url);
    }
    return mkRes('nope', 404, url);
  };
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
      L(`ws open ${new URL(url).pathname}`);
      sockets.add(this);
      setTimeout(() => {
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
      await say(`AUTH-URL: https://claude.ai/oauth/authorize?sitting=${n}`);
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
