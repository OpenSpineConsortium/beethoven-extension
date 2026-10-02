// The portal client over a scripted network layer, for the answers the mock cannot hold still:
// a Files download that keeps answering 500 after the one re-warm is thrown (the caller says
// "could not be checked"), while a 404 or the Files app's own HTML page means "not there".
import { describe, expect, it } from 'vitest';
import { Audit } from '../src/core/audit';
import type { PortalNet } from '../src/core/net';
import { PortalClient, PortalError } from '../src/core/portal';
import { memoryKV } from './helpers';

const ORIGIN = 'https://ood.example';
const DASHBOARD = '<html><head><meta name="csrf-token" content="tok"></head><body>Open OnDemand. Logged in as ab1234</body></html>';

/** every download under /files/fs answers as `downloads` says; the dashboard is warm and signed in */
function scripted(downloads: Record<string, { status: number; body?: string; type?: string }>): { net: PortalNet; calls: string[] } {
  const calls: string[] = [];
  const net: PortalNet = {
    fetch: async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/pun/sys/dashboard/')) return new Response(DASHBOARD, { status: 200, headers: { 'content-type': 'text/html' } });
      if (url.endsWith('/pun/sys/dashboard/files')) return new Response(JSON.stringify({ path: '/home/ab1234', files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      const hit = Object.entries(downloads).find(([p]) => url.includes(`/files/fs${p}?download=1`));
      if (hit) return new Response(hit[1].body ?? '', { status: hit[1].status, headers: { 'content-type': hit[1].type ?? 'application/octet-stream' } });
      return new Response('nope', { status: 404 });
    },
    WebSocket: class {
      constructor() {
        throw new Error('no sockets in this test');
      }
    } as unknown as PortalNet['WebSocket'],
  };
  return { net, calls };
}

function client(net: PortalNet): PortalClient {
  return new PortalClient(ORIGIN, net, new Audit(memoryKV()), { warmDelaysMs: [1, 1, 1] });
}

describe('readFileIfExists', () => {
  it('returns the body, undefined for a 404 and for the Files app\'s page, and throws a 500 that survives the re-warm', async () => {
    const { net, calls } = scripted({
      '/home/ab1234/there.json': { status: 200, body: '{"state":"online"}' },
      '/home/ab1234/gone.json': { status: 404, body: 'Not Found' },
      '/home/ab1234/page.json': { status: 200, body: '<!DOCTYPE html><html>File not found</html>', type: 'text/html; charset=utf-8' },
      '/home/ab1234/broken.json': { status: 500, body: 'Error: Server Error' },
      '/home/ab1234/forbidden.json': { status: 403, body: 'Forbidden' },
    });
    const c = client(net);
    expect(await c.readFileIfExists('/home/ab1234/there.json')).toBe('{"state":"online"}');
    expect(await c.readFileIfExists('/home/ab1234/gone.json')).toBeUndefined();
    expect(await c.readFileIfExists('/home/ab1234/page.json')).toBeUndefined();
    const before = calls.filter((u) => u.includes('broken.json')).length;
    await expect(c.readFileIfExists('/home/ab1234/broken.json')).rejects.toMatchObject({ name: 'PortalError', status: 500 });
    // one read, one re-warm of the dashboard, one more read: then the failure is the caller's to say
    expect(calls.filter((u) => u.includes('broken.json')).length - before).toBe(2);
    await expect(c.readFileIfExists('/home/ab1234/forbidden.json')).rejects.toBeInstanceOf(PortalError);
    await expect(c.readFileIfExists('/home/ab1234/forbidden.json')).rejects.toMatchObject({ status: 403 });
  });
});

// 11.0.0: the background's dashboard GET tells signed in, signed out and unreachable apart, and never
// says "Failed to fetch" (spec: portal.ts session()).
describe('the grid sign-in, as one dashboard GET says it', () => {
  const page = '<html><head><meta name="csrf-token" content="tok"></head><body>Open OnDemand. Logged in as st1234</body></html>';
  function net(answer: (url: string, init?: RequestInit) => Promise<Response>, seen: RequestInit[] = []): PortalNet {
    return {
      fetch: async (input, init) => {
        seen.push(init ?? {});
        return answer(String(input), init);
      },
      WebSocket: class {
        constructor() {
          throw new Error('no sockets in this test');
        }
      } as unknown as PortalNet['WebSocket'],
    };
  }
  const redirected = (body: string, status: number, url: string) => {
    const r = new Response(body, { status, headers: { 'content-type': 'text/html' } });
    Object.defineProperty(r, 'url', { value: url });
    return r;
  };
  const mk = (n: PortalNet, timeoutMs?: number) => new PortalClient(ORIGIN, n, new Audit(memoryKV()), { credentials: 'include', vpnApp: 'GlobalProtect', ...(timeoutMs ? { sessionTimeoutMs: timeoutMs } : {}) });

  it('200 on the dashboard with its form token is signed in, with the account it shows; the request carries the browser\'s sign-in (credentials "include")', async () => {
    const seen: RequestInit[] = [];
    const s = await mk(net(async () => new Response(page, { status: 200, headers: { 'content-type': 'text/html' } }), seen)).session();
    expect(s).toMatchObject({ state: 'signed-in', signedIn: true, username: 'st1234' });
    expect(seen[0]?.credentials).toBe('include');
  });

  it('401 (the browser holds no HTTP sign-in), a redirect to another site, or off the dashboard, is signed out', async () => {
    expect((await mk(net(async () => new Response('sign in', { status: 401, headers: { 'www-authenticate': 'Basic realm="private"' } }))).session()).state).toBe('signed-out');
    expect((await mk(net(async () => redirected('<html>idp</html>', 200, 'https://login.wayne.edu/idp'))).session()).state).toBe('signed-out');
    expect((await mk(net(async () => redirected('<html>start</html>', 200, `${ORIGIN}/public/start.html`))).session()).state).toBe('signed-out');
  });

  it('a network error or no answer within the timeout is unreachable, in the panel\'s words; never "Failed to fetch"', async () => {
    const failed = await mk(net(async () => Promise.reject(new TypeError('Failed to fetch')))).session();
    expect(failed).toMatchObject({ state: 'unreachable', status: 0, signedIn: false, detail: "Can't reach the grid. Is GlobalProtect on?" });
    expect(JSON.stringify(failed)).not.toMatch(/Failed to fetch/);
    const t0 = Date.now();
    const slow = await mk(
      net((_u, init) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))),
      200,
    ).session();
    expect(slow.state).toBe('unreachable');
    expect(Date.now() - t0).toBeLessThan(2_000);
    // a client with no VPN name says "your VPN"
    const plain = await new PortalClient(ORIGIN, net(async () => Promise.reject(new TypeError('Failed to fetch'))), new Audit(memoryKV())).session();
    expect(plain.detail).toBe("Can't reach the grid. Is your VPN on?");
  });

  it('200 with no form token is not an OnDemand portal; 5xx is a per-user server still starting', async () => {
    expect((await mk(net(async () => new Response('<html>hello</html>', { status: 200, headers: { 'content-type': 'text/html' } }))).session()).state).toBe('not-ood');
    expect((await mk(net(async () => new Response('Server Error', { status: 503 }))).session()).state).toBe('cold');
  });
});

describe('the dashboard is the only identity', () => {
  it("a directory owner found by whoAmI() is never reported by session() as who is signed in", async () => {
    const page = '<html><head><meta name="csrf-token" content="tok"></head><body>Open OnDemand</body></html>';
    const net: PortalNet = {
      fetch: async (input) => {
        const url = String(input);
        if (url.endsWith('/pun/sys/dashboard/')) return new Response(page, { status: 200, headers: { 'content-type': 'text/html' } });
        if (url.endsWith('/pun/sys/dashboard/files')) return new Response(JSON.stringify({ path: '/home/cd5678', files: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (url.includes('/files/fs/home/cd5678')) return new Response(JSON.stringify({ path: '/home/cd5678', files: [{ id: '1', type: 'd', name: '.', size: 0, modified_at: 0, owner: 'cd5678', mode: 0 }] }), { status: 200, headers: { 'content-type': 'application/json' } });
        return new Response('nope', { status: 404 });
      },
      WebSocket: class {
        constructor() {
          throw new Error('no sockets in this test');
        }
      } as unknown as PortalNet['WebSocket'],
    };
    const c = client(net);
    expect((await c.session()).username).toBeUndefined();
    // paths may use the directory's owner...
    expect(await c.whoAmI()).toBe('cd5678');
    // ...but the access check's identity stays what the dashboard shows: nothing
    const again = await c.session();
    expect(again.signedIn).toBe(true);
    expect(again.username).toBeUndefined();
  });
});
