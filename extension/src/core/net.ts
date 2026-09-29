// The network layer the portal client is given rather than reaches for. In the content script it
// is the page's own fetch and WebSocket (so the portal cookie and Origin are the page's); in tests
// it is Node's fetch plus a WebSocket from the `ws` package that carries a cookie header. Nothing
// under src/core imports a browser global for network access.

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
