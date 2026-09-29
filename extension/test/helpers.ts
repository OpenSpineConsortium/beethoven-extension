// Test helpers: a signer that signs exactly as Ashley's grid/license.js does (so the kill-list tests
// need no vendor key), an in-memory KV, and a cookie-carrying network layer for the mock portal.
import { createPrivateKey, generateKeyPairSync, sign as nodeSign, type KeyObject } from 'node:crypto';
import WsWebSocket from 'ws';
import type { KV } from '../src/core/audit';
import type { PortalNet, WsLike } from '../src/core/net';

export const DAY = 86400;
export const NOW = 1_790_000_000; // 2026-09-21

export function b64u(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** raw 32-byte public key, base64, as keys.json stores it (license.js rawFromPublicKey) */
export function rawFromPublicKey(pub: KeyObject): string {
  const der = pub.export({ type: 'spki', format: 'der' }) as Buffer;
  return der.subarray(der.length - 32).toString('base64');
}

/** license.js sign(): the signature covers the ASCII text "<prefix>.<payload part>" */
export function signToken(prefix: string, payload: unknown, priv: KeyObject | string): string {
  const body = `${prefix}.${b64u(Buffer.from(JSON.stringify(payload), 'utf8'))}`;
  const sig = nodeSign(null, Buffer.from(body, 'ascii'), typeof priv === 'string' ? createPrivateKey(priv) : priv);
  return `${body}.${b64u(sig)}`;
}

export function issuer(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const keys = { [kid]: rawFromPublicKey(publicKey) };
  return { privateKey, publicKey, keys };
}

export function memoryKV(): KV & { store: Map<string, unknown> } {
  const store = new Map<string, unknown>();
  return {
    store,
    async get<T>(key: string) {
      return structuredClone(store.get(key)) as T | undefined;
    },
    async set(key: string, value: unknown) {
      store.set(key, structuredClone(value));
    },
  };
}

/** Node's fetch and ws, carrying the mock portal's session cookie the way a portal tab's own requests would */
export function cookieNet(cookie: string, origin: string, wsOrigin = origin): PortalNet {
  const fetchWithCookie: PortalNet['fetch'] = (input, init = {}) => {
    const headers = new Headers(init.headers ?? {});
    headers.set('cookie', cookie);
    if (init.method && init.method !== 'GET') headers.set('origin', origin);
    const { credentials: _c, ...rest } = init;
    return fetch(input, { ...rest, headers });
  };
  class CookieWS extends WsWebSocket implements WsLike {
    constructor(url: string) {
      super(url, { headers: { cookie: cookie, origin: wsOrigin } });
    }
  }
  return { fetch: fetchWithCookie, WebSocket: CookieWS as unknown as PortalNet['WebSocket'] };
}
