// The channel (core/channel.ts) against small in-test portals, modelled on the design pass's
// experiments (scratchpad/v11/fewest/basic/server-basic.mjs, channel/cookietest): a portal that signs in
// with the browser's own HTTP box (HTTP Basic, as Wayne State's does, AM1), and one that signs in with a
// SameSite=Lax cookie. The "browser" is a network layer that does what Chromium was observed to do for
// an extension's own requests: it attaches a held HTTP Basic sign-in to fetches and to the WebSocket
// handshake alike, and a Lax cookie to fetches only, never to the WebSocket. So: Basic is "direct", the
// Lax cookie is "tab", a keyless account's shell says "password", and no sign-in at all is not a channel.
// Also the shell's empty keepalive frame, and tab mode's one-tab-per-action lifecycle.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WsWebSocket, { WebSocketServer } from 'ws';
import { Audit } from '../src/core/audit';
import { testChannel, withPortalTab, type TabHost } from '../src/core/channel';
import type { PortalNet, WsLike } from '../src/core/net';
import { PortalClient } from '../src/core/portal';
import { frameAllowed, openShell } from '../src/core/shell';
import { memoryKV } from './helpers';

const GOOD = `Basic ${Buffer.from('st1234:pw').toString('base64')}`;
const COOKIE = 'ood_session=s3cr3t';
const TOKEN = 'Xk9_-shelltoken';

interface StandIn {
  origin: string;
  frames: string[];
  upgrades: Array<{ auth: boolean }>;
  close(): Promise<void>;
}

/** a portal stand-in: dashboard, the Shell page with its token, and the shell's WebSocket */
async function standIn(o: { auth: 'basic' | 'cookie'; keyless?: boolean }): Promise<StandIn> {
  const frames: string[] = [];
  const upgrades: Array<{ auth: boolean }> = [];
  const authorized = (h: http.IncomingHttpHeaders) => (o.auth === 'basic' ? h.authorization === GOOD : (h.cookie ?? '').includes(COOKIE));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/login') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<p>sign in</p>');
    }
    if (!authorized(req.headers)) {
      if (o.auth === 'basic') {
        res.writeHead(401, { 'www-authenticate': 'Basic realm="private"', 'content-type': 'text/plain' });
        return res.end('sign in');
      }
      res.writeHead(302, { location: '/login' });
      return res.end();
    }
    if (url.pathname.startsWith('/pun/sys/dashboard')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html><head><meta name="csrf-token" content="rails"></head><body>Open OnDemand. Logged in as st1234</body></html>');
    }
    if (url.pathname.startsWith('/pun/sys/shell/ssh/')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(`<script>function get_url(){ return base + separator + "csrf=${TOKEN}"; }</script>`);
    }
    res.writeHead(404);
    res.end();
  });
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req: http.IncomingMessage, socket: { write(s: string): void; destroy(): void }, head: Buffer) => {
    const ok = authorized(req.headers) && (req.url ?? '').includes(`csrf=${TOKEN}`);
    upgrades.push({ auth: ok });
    if (!ok) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm="private"\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws: { send(s: string): void; close(): void; on(ev: string, fn: (m: unknown) => void): void }) => {
      ws.send(o.keyless ? "st1234@login1's password: " : 'Last login: Wed Oct  1 08:00:00 2026 from 10.0.0.1\r\n[st1234@login1 ~]$ ');
      ws.on('message', (m: unknown) => {
        const text = String(m);
        frames.push(text);
        // the real shell app parses every frame; a frame that is not JSON would throw in it
        const msg = JSON.parse(text) as { input?: string };
        if (msg.input === 'exit\r') ws.close();
        else if (typeof msg.input === 'string' && msg.input.endsWith('\r')) ws.send(`\r\nran: ${msg.input.trim()}\r\n[st1234@login1 ~]$ `);
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    origin: `http://127.0.0.1:${port}`,
    frames,
    upgrades,
    async close() {
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}

/**
 * What Chromium does for an extension's own requests (observed: fewest/basic/run2-*.log,
 * channel/cookietest): a held HTTP Basic sign-in on fetches and on the WebSocket handshake; a cookie
 * on fetches, and on the WebSocket only when it is SameSite=None.
 */
function browserNet(held: { basic?: boolean; cookie?: 'lax' | 'none' }): PortalNet {
  const add = (h: Headers) => {
    if (held.basic) h.set('authorization', GOOD);
    if (held.cookie) h.set('cookie', COOKIE);
  };
  const f: PortalNet['fetch'] = (input, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    if (init.credentials === 'include') add(headers);
    const { credentials: _c, ...rest } = init;
    return fetch(input, { ...rest, headers });
  };
  class Ws extends WsWebSocket implements WsLike {
    constructor(url: string) {
      const headers: Record<string, string> = { origin: 'chrome-extension://beethoven' };
      if (held.basic) headers.authorization = GOOD;
      if (held.cookie === 'none') headers.cookie = COOKIE;
      super(url, { headers });
    }
  }
  return { fetch: f, WebSocket: Ws as unknown as PortalNet['WebSocket'] };
}

const client = (origin: string, net: PortalNet) => new PortalClient(origin, net, new Audit(memoryKV()), { credentials: 'include', vpnApp: 'GlobalProtect', warmDelaysMs: [1] });

describe('the channel test', () => {
  let basic: StandIn;
  let keyless: StandIn;
  let cookie: StandIn;
  beforeAll(async () => {
    basic = await standIn({ auth: 'basic' });
    keyless = await standIn({ auth: 'basic', keyless: true });
    cookie = await standIn({ auth: 'cookie' });
  });
  afterAll(async () => {
    await basic?.close();
    await keyless?.close();
    await cookie?.close();
  });

  it('a portal that signs in with the browser\'s own box is "direct": the background\'s requests and its shell carry the sign-in', async () => {
    const v = await testChannel(client(basic.origin, browserNet({ basic: true })));
    expect(v.mode).toBe('direct');
    expect(v.shell).toBe('ok');
    expect(v.session.username).toBe('st1234');
    expect(basic.upgrades.at(-1)).toEqual({ auth: true });
    // the shell test typed nothing but exit after the prompt (the stand-in records it a moment later)
    await new Promise((r) => setTimeout(r, 150));
    expect(basic.frames.filter((f) => f.includes('input'))).toEqual(['{"input":"exit\\r"}']);
  });

  it('a keyless account\'s shell asks for a password: "direct", shell "password", nothing typed', async () => {
    const before = keyless.frames.length;
    const v = await testChannel(client(keyless.origin, browserNet({ basic: true })));
    expect(v).toMatchObject({ mode: 'direct', shell: 'password' });
    expect(keyless.frames.slice(before).filter((f) => f.includes('input'))).toEqual([]);
  });

  it('a SameSite=Lax cookie travels on the background\'s fetches but not on its WebSocket: "tab", and the shell word comes from the page script', async () => {
    let viaTab = 0;
    const v = await testChannel(client(cookie.origin, browserNet({ cookie: 'lax' })), async () => {
      viaTab++;
      return 'ok';
    });
    expect(v.mode).toBe('tab');
    expect(v.shell).toBe('ok');
    expect(viaTab).toBe(1);
    expect(cookie.upgrades.at(-1)).toEqual({ auth: false });
    // a SameSite=None cookie travels on the WebSocket too: "direct"
    expect((await testChannel(client(cookie.origin, browserNet({ cookie: 'none' })))).mode).toBe('direct');
  });

  it('no sign-in held is not a channel: 401 is signed out, and the test says so instead of guessing', async () => {
    const c = client(basic.origin, browserNet({}));
    const s = await c.session();
    expect(s).toMatchObject({ state: 'signed-out', status: 401, signedIn: false });
    await expect(testChannel(c)).rejects.toMatchObject({ name: 'NotSignedIn' });
    // a cookie portal's sign-in redirect is signed out too
    expect((await client(cookie.origin, browserNet({})).session()).state).toBe('signed-out');
  });
});

describe('the shell\'s frames', () => {
  let basic: StandIn;
  beforeAll(async () => {
    basic = await standIn({ auth: 'basic' });
  });
  afterAll(async () => {
    await basic?.close();
  });

  it('only {"input"}, {"resize"} and the empty keepalive {} are ever sent', () => {
    expect(frameAllowed({})).toBe(true);
    expect(frameAllowed({ input: 'x' })).toBe(true);
    expect(frameAllowed({ resize: { cols: 1, rows: 1 } })).toBe(true);
    expect(frameAllowed({ input: 1 })).toBe(false);
    expect(frameAllowed({ ping: true })).toBe(false);
    expect(frameAllowed({ input: 'x', extra: 1 })).toBe(false);
  });

  it('an open sitting sends an empty frame on its cadence, which the shell parses and ignores', async () => {
    const before = basic.frames.length;
    const out: string[] = [];
    const s = await openShell({ origin: basic.origin, host: 'default', command: 'sleep 1', net: browserNet({ basic: true }), credentials: 'include', onOutput: (t) => out.push(t), keepaliveMs: 40, settleMs: 50 });
    await new Promise((r) => setTimeout(r, 300));
    s.close();
    const end = await s.done;
    const frames = basic.frames.slice(before);
    expect(frames.filter((f) => f === '{}').length).toBeGreaterThanOrEqual(3);
    expect(frames).toContain('{"input":"sleep 1\\r"}');
    expect(end.reason).toBe('client');
    expect(out.join('')).toContain('ran: sleep 1');
  });

  it('a password prompt before the line ends the sitting with "password", nothing typed', async () => {
    const keyless = await standIn({ auth: 'basic', keyless: true });
    try {
      const s = await openShell({ origin: keyless.origin, host: 'default', command: 'exec bash x connect', net: browserNet({ basic: true }), credentials: 'include', onOutput: () => undefined, keepaliveMs: 0, settleMs: 50 });
      const end = await s.done;
      expect(end.reason).toBe('password');
      expect(keyless.frames.filter((f) => f.includes('input'))).toEqual([]);
    } finally {
      await keyless.close();
    }
  });
});

describe('tab mode: one portal tab per action, never focused, closed after', () => {
  function host(o: { kept?: boolean; failInject?: boolean } = {}) {
    const log: string[] = [];
    let ready = false;
    const h: TabHost = {
      openInactive: async (url, windowId) => (log.push(`open ${url} ${windowId}`), 5),
      keep: async (id) => void log.push(`keep ${id}`),
      inject: async (id) => {
        log.push(`inject ${id}`);
        if (!o.failInject) ready = true;
      },
      ping: async () => ready,
      call: async (id, op, args) => (log.push(`call ${id} ${op} ${JSON.stringify(args)}`), op === 'shell' ? { output: 'ok', exitCode: 0, transcript: '', ms: 1 } : undefined),
      close: async (id) => void log.push(`close ${id}`),
      onPortal: async (id) => !!o.kept && id === 9,
      sleep: async () => undefined,
    };
    return { h, log };
  }

  it('opens an inactive tab, loads the page script, runs the line there, and closes the tab', async () => {
    const { h, log } = host();
    const r = await withPortalTab(h, { origin: 'https://ood.example', windowId: 3 }, (_id, p) => p.shell('bash x worker stop', {}));
    expect(r).toMatchObject({ exitCode: 0 });
    expect(log).toEqual(['open https://ood.example/pun/sys/dashboard/ 3', 'keep 5', 'inject 5', 'call 5 shell ["bash x worker stop",{}]', 'close 5']);
  });

  it('closes the tab it opened even when the page script never answers', async () => {
    const { h, log } = host({ failInject: true });
    await expect(withPortalTab(h, { origin: 'https://ood.example' }, async () => 1)).rejects.toThrow(/did not answer/);
    expect(log.at(-1)).toBe('close 5');
  });

  it('uses the sign-in tab Beethoven kept, and leaves it open', async () => {
    const { h, log } = host({ kept: true });
    await withPortalTab(h, { origin: 'https://ood.example', keptTabId: 9 }, (_id, p) => p.shellTest());
    expect(log).toEqual(['inject 9', 'call 9 shellTest []']);
  });
});
