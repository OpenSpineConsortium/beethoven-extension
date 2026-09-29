// The slice of the `ws` package the tests use; `ws` ships no types and a types package would be
// one more dependency for a mock.
declare module 'ws' {
  export interface ClientOptions {
    headers?: Record<string, string>;
    origin?: string;
  }
  export default class WebSocket {
    constructor(url: string, options?: ClientOptions);
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
    addEventListener(type: 'open', listener: () => void): void;
    addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
    addEventListener(type: 'close', listener: (ev: { code: number; reason: string }) => void): void;
    addEventListener(type: 'error', listener: (ev: unknown) => void): void;
  }
  export class WebSocketServer {
    constructor(options: { noServer: boolean });
    clients: Set<WebSocket>;
    handleUpgrade(...args: unknown[]): void;
  }
}
