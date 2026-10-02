// The network layer the portal client is given rather than reaches for. In the background (11.0.0)
// it is the service worker's own fetch and WebSocket, and the browser attaches the grid sign-in it
// holds (the HTTP sign-in it keeps after the student typed into its own box, or a cookie); in the
// tab-mode page script it is the page's own fetch and WebSocket; in tests it is Node's fetch plus a
// WebSocket from the `ws` package that carries a header. Nothing under src/core imports a browser
// global for network access.

/** the subset of the WebSocket interface the shell driver uses; both the browser's and ws's satisfy it */
export interface WsLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open', listener: () => void): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'close', listener: (ev: { code: number; reason: string }) => void): void;
  addEventListener(type: 'error', listener: (ev: unknown) => void): void;
}

export interface WsConstructor {
  new (url: string): WsLike;
}

export interface PortalNet {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  WebSocket: WsConstructor;
}

/** how long the reachability check waits: a name the VPN alone resolves times out rather than failing at once */
export const REACH_TIMEOUT_MS = 5_000;

/**
 * Does the grid answer at all? One request to the portal's address with no sign-in and no cookie
 * (credentials omitted) in no-cors mode, so it needs no permission: a server that answered, whatever
 * it said, resolves with an opaque response; no route to it (GlobalProtect off, an unresolvable name,
 * a refused connection) rejects or runs out the timeout. It never claims to know the VPN's state, only
 * that the grid answered (observed in Chromium 153: limits/reach.log). Run only after the agreement is
 * accepted (PRIVACY: "Before you agree to the terms, the extension sends nothing anywhere").
 */
export async function reach(origin: string, fetchFn: (input: string, init?: RequestInit) => Promise<Response>, timeoutMs = REACH_TIMEOUT_MS): Promise<'answers' | 'no-route'> {
  let url: string;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'no-route';
    url = `${u.origin}/`;
  } catch {
    return 'no-route';
  }
  const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answered = await Promise.race([
      fetchFn(url, { mode: 'no-cors', credentials: 'omit', cache: 'no-store', redirect: 'manual', ...(ctl ? { signal: ctl.signal } : {}) }).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => {
          ctl?.abort();
          resolve(false);
        }, timeoutMs);
      }),
    ]);
    return answered ? 'answers' : 'no-route';
  } finally {
    if (timer) clearTimeout(timer);
  }
}
