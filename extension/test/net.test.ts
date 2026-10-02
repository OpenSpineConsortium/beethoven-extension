// The GlobalProtect check (core/net.ts reach): one credential-free, cookie-free no-cors request that
// tells "a server answered, whatever it said" from "no route to it", with no permission (observed in
// Chromium 153: limits/reach.log). Here against a local server, a closed port and a request that never
// answers; and the request it makes carries no sign-in.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reach } from '../src/core/net';

let server: http.Server;
let origin = '';
const seen: http.IncomingHttpHeaders[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(401, { 'www-authenticate': 'Basic realm="private"' });
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

describe('does the grid answer?', () => {
  it('a server that answers, even 401, answers; the request is no-cors, credentials omitted, to the origin\'s root', async () => {
    const inits: RequestInit[] = [];
    const r = await reach(origin, (u, init) => {
      inits.push(init ?? {});
      return fetch(u, { ...init, mode: undefined });
    });
    expect(r).toBe('answers');
    expect(inits[0]).toMatchObject({ mode: 'no-cors', credentials: 'omit', cache: 'no-store' });
    expect(seen.at(-1)?.authorization).toBeUndefined();
    expect(seen.at(-1)?.cookie).toBeUndefined();
  });

  it('a refused connection, a name that does not resolve, or no answer within the timeout is no route', async () => {
    expect(await reach('http://127.0.0.1:9', (u, init) => fetch(u, { ...init, mode: undefined }))).toBe('no-route');
    const t0 = Date.now();
    expect(await reach(origin, () => new Promise<Response>(() => undefined), 100)).toBe('no-route');
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(await reach('not a url', fetch)).toBe('no-route');
    expect(await reach('ftp://x.example', fetch)).toBe('no-route');
  });
});
