// The bridges (12.0.0, docs/V12_CONTRACT.md "Bridges"): a browser extension has no socket of its own,
// so the ssh client (src/ssh) is handed a byte stream to grid.wayne.edu:22 by the first bridge this
// browser has, in decision D3's order:
//
//   1. store   a browser-only bridge another extension offers. None is known: Google's Secure Shell
//              reaches sockets because Google allows it, and offers other extensions no way in. A clearly
//              named stub that says "not available"; the integrator wires a real one if one is found.
//   2. relay   a WebSocket to a relay the site profile names (`ssh_relay`), with a short ticket; "not
//              configured" when the profile names none (Wayne State's names none: Cloudflare's
//              self-serve terms forbid a Worker used as a proxy, and nothing is deployed).
//   3. helper  the small program that comes inside Beethoven (public/bridge/), registered with Chrome as
//              the native messaging host com.openspineconsortium.beethoven.bridge. It opens TCP only to
//              its own allowlist (grid.wayne.edu:22), carries bytes both ways, holds no credential and has
//              no shell. "not installed" is read from Chrome's own words when it cannot start it.
//
// None of them sees inside the ssh session: the handshake, the pinned host key and every sign-in are
// end to end between the browser and the grid. Detection is quick (a hello within a few seconds) and no
// internal error string reaches a student's screen: a probe answers one of the BridgeState words, and
// Details alone carries Chrome's sentence.
import type { ByteStream } from '../ssh';
import type { BridgeId, BridgeState, HelperDownload, HelperOs } from './model';

export type { ByteStream } from '../ssh';

/** the native messaging host's name (helper/ and public/bridge/ register it under this name) */
export const HELPER_HOST = 'com.openspineconsortium.beethoven.bridge';
/** the wire protocol's version (the hello's "v") */
export const HELPER_PROTOCOL = 1;
/** the grid's ssh door, the only destination any bridge is asked for */
export const GRID_HOST = 'grid.wayne.edu';
export const GRID_PORT = 22;
/** the grid's host key, pinned (no trust on first use): ssh-rsa, as the grid answered on 2026-10-01 */
export const GRID_HOST_KEY_PIN = 'SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s';
/** a data message carries at most this many raw bytes (64 KiB of base64), far under Chrome's 1 MiB to the host */
export const HELPER_CHUNK = 48 * 1024;
/** how long a probe waits for the helper's hello */
export const HELLO_TIMEOUT_MS = 4_000;
/** how long an open waits for "opened" */
export const OPEN_TIMEOUT_MS = 12_000;

export interface ProbeResult {
  id: BridgeId;
  state: BridgeState;
  /** the helper's hello */
  helper?: { version: string; os: HelperOs | string; kind: 'script' | 'binary' | string; allow: string[] };
  /** Details only: Chrome's own sentence, or what went wrong (never shown to a student) */
  detail: string;
}

export interface BridgeProvider {
  readonly id: BridgeId;
  probe(): Promise<ProbeResult>;
  /** a byte stream to host:port; rejects with a BridgeError */
  open(host: string, port: number): Promise<ByteStream>;
}

/** why a bridge could not open a stream: `state` is what a student-facing word is chosen from; `detail` is for Details */
export class BridgeError extends Error {
  constructor(
    readonly state: BridgeState | 'refused' | 'unreachable',
    readonly detail: string,
  ) {
    super(detail);
    this.name = 'BridgeError';
  }
}

// ---- 1. the store-extension bridge: a named stub -----------------------------------------------------

/**
 * No browser-only bridge is known to exist for another extension to call (the exploration streams
 * report what they found; Google's Secure Shell keeps its sockets to itself). Kept as a provider so the
 * order of D3 is visible and the integrator can put a real one here.
 */
export class StoreExtensionBridge implements BridgeProvider {
  readonly id = 'store' as const;
  async probe(): Promise<ProbeResult> {
    return { id: 'store', state: 'not-available', detail: 'no browser-only bridge from another extension is known; this provider is a stub' };
  }
  async open(): Promise<ByteStream> {
    throw new BridgeError('not-available', 'the store-extension bridge is a stub');
  }
}

// ---- 2. the relay bridge -----------------------------------------------------------------------------

/** the site profile's `ssh_relay` (none at Wayne State) */
export interface RelayConfig {
  /** wss://… of the relay; its destination is fixed in the relay, never chosen here */
  url: string;
  /** where a one-connection ticket is asked for (the access service's route); absent: no ticket */
  ticket_url?: string;
}

export interface WsLikeCtor {
  new (url: string, protocols?: string | string[]): WsLikeSocket;
}
export interface WsLikeSocket {
  binaryType: string;
  readyState: number;
  send(data: ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export function relayConfigFrom(profile: { ssh_relay?: unknown } | undefined): RelayConfig | undefined {
  const r = profile?.ssh_relay as { url?: unknown; ticket_url?: unknown } | undefined;
  if (!r || typeof r.url !== 'string') return undefined;
  try {
    const u = new URL(r.url);
    if (u.protocol !== 'wss:') return undefined;
  } catch {
    return undefined;
  }
  const t = typeof r.ticket_url === 'string' && /^https:\/\//.test(r.ticket_url) ? r.ticket_url : undefined;
  return { url: r.url, ...(t ? { ticket_url: t } : {}) };
}

export class RelayBridge implements BridgeProvider {
  readonly id = 'relay' as const;
  constructor(
    private readonly config: RelayConfig | undefined,
    private readonly ws: WsLikeCtor | undefined,
    /** one fresh ticket per connection, asked for just before it opens (never stored); absent: none sent */
    private readonly ticket?: () => Promise<string | undefined>,
  ) {}
  async probe(): Promise<ProbeResult> {
    if (!this.config) return { id: 'relay', state: 'not-configured', detail: 'the site profile names no ssh relay' };
    if (!this.ws) return { id: 'relay', state: 'not-available', detail: 'no WebSocket in this context' };
    // a relay is "available" when configured; whether it answers is learned by the first connection
    return { id: 'relay', state: 'available', detail: `relay ${new URL(this.config.url).host}` };
  }
  async open(host: string, port: number): Promise<ByteStream> {
    if (!this.config || !this.ws) throw new BridgeError('not-configured', 'no relay');
    if (host !== GRID_HOST || port !== GRID_PORT) throw new BridgeError('refused', `the relay goes to ${GRID_HOST}:${GRID_PORT} only`);
    const t = this.ticket ? await this.ticket().catch(() => undefined) : undefined;
    const sock = new this.ws(this.config.url, t ? ['beethoven-ssh', `bzt1.${t}`] : ['beethoven-ssh']);
    sock.binaryType = 'arraybuffer';
    return new Promise<ByteStream>((resolve, reject) => {
      let onData: (b: Uint8Array) => void = () => undefined;
      let onClose: (why?: string) => void = () => undefined;
      let opened = false;
      const timer = setTimeout(() => {
        if (!opened) {
          try {
            sock.close();
          } catch {
            /* gone */
          }
          reject(new BridgeError('unreachable', 'the relay did not answer in time'));
        }
      }, OPEN_TIMEOUT_MS);
      sock.onopen = () => {
        opened = true;
        clearTimeout(timer);
        resolve({
          write: (b) => sock.send(b.slice()),
          onData: (cb) => (onData = cb),
          onClose: (cb) => (onClose = cb),
          close: () => sock.close(),
        });
      };
      sock.onmessage = (ev) => {
        const d = ev.data;
        if (d instanceof ArrayBuffer) onData(new Uint8Array(d));
        else if (ArrayBuffer.isView(d)) onData(new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice());
      };
      sock.onerror = () => undefined;
      sock.onclose = (ev) => {
        clearTimeout(timer);
        if (!opened) reject(new BridgeError('unreachable', `the relay closed (${ev.code ?? ''})`));
        else onClose(`relay closed (${ev.code ?? ''})`);
      };
    });
  }
}

// ---- 3. the bundled helper (native messaging) --------------------------------------------------------

/** the part of chrome.runtime this needs, injected (tests fake it) */
export interface NativeApi {
  connectNative(name: string): NativePort;
  /** chrome.runtime.lastError?.message, read inside onDisconnect */
  lastError(): string | undefined;
}
export interface NativePort {
  postMessage(m: unknown): void;
  disconnect(): void;
  onMessage: { addListener(fn: (m: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
}

/** helper -> extension messages (docs/V12_CONTRACT.md, the helper's wire contract) */
export type HelperOut =
  | { t: 'hello'; v: number; helper: string; os: string; kind: string; allow: string[] }
  | { t: 'opened'; id: string }
  | { t: 'data'; id: string; b64: string }
  | { t: 'closed'; id: string; reason?: string }
  | { t: 'error'; id?: string; reason?: string };

/**
 * Chrome's own sentences when it cannot reach a native host (chrome/browser/extensions/api/messaging
 * native_message_port_host and native_process_launcher): "not found" means no manifest is registered
 * for the name (the helper is not installed); the others mean it is registered but broken or refused.
 */
export function classifyNativeError(message: string | undefined): { state: BridgeState; detail: string } {
  const m = String(message ?? '');
  if (/specified native messaging host not found/i.test(m)) return { state: 'not-installed', detail: m };
  if (/forbidden/i.test(m)) return { state: 'broken', detail: `${m} (the manifest's allowed_origins does not name this extension)` };
  if (/has exited|failed to start|error when communicating|invalid native messaging host name/i.test(m)) return { state: 'broken', detail: m };
  if (!m) return { state: 'broken', detail: 'the helper ended without a word' };
  return { state: 'broken', detail: m };
}

const b64enc = (b: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const b64dec = (s: string): Uint8Array => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

let streamSeq = 0;

export class HelperBridge implements BridgeProvider {
  readonly id = 'helper' as const;
  constructor(
    private readonly api: NativeApi | undefined,
    private readonly o: { helloTimeoutMs?: number; openTimeoutMs?: number } = {},
  ) {}

  /** one native port that has said hello (or a classified failure) */
  private hello(): Promise<{ port: NativePort; hello: Extract<HelperOut, { t: 'hello' }>; listeners: Set<(m: HelperOut) => void>; ended: Promise<string> }> {
    const api = this.api;
    if (!api) return Promise.reject(new BridgeError('not-available', 'no native messaging in this browser or without the permission'));
    return new Promise((resolve, reject) => {
      let port: NativePort;
      try {
        port = api.connectNative(HELPER_HOST);
      } catch (e) {
        reject(new BridgeError('not-available', (e as Error).message));
        return;
      }
      const listeners = new Set<(m: HelperOut) => void>();
      let said = false;
      let endRes!: (why: string) => void;
      const ended = new Promise<string>((r) => (endRes = r));
      const timer = setTimeout(() => {
        if (said) return;
        try {
          port.disconnect();
        } catch {
          /* gone */
        }
        reject(new BridgeError('broken', 'the helper did not say hello in time'));
      }, this.o.helloTimeoutMs ?? HELLO_TIMEOUT_MS);
      port.onMessage.addListener((raw) => {
        const m = raw as HelperOut;
        if (!m || typeof m !== 'object' || typeof (m as { t?: unknown }).t !== 'string') return;
        if (!said) {
          if (m.t !== 'hello') return;
          said = true;
          clearTimeout(timer);
          if (m.v !== HELPER_PROTOCOL || !Array.isArray(m.allow)) {
            try {
              port.disconnect();
            } catch {
              /* gone */
            }
            reject(new BridgeError('broken', `the helper speaks protocol ${String(m.v)}, Beethoven ${HELPER_PROTOCOL}`));
            return;
          }
          resolve({ port, hello: m, listeners, ended });
          return;
        }
        for (const l of listeners) l(m);
      });
      port.onDisconnect.addListener(() => {
        const why = api.lastError();
        endRes(why ?? 'disconnected');
        if (!said) {
          clearTimeout(timer);
          const c = classifyNativeError(why);
          reject(new BridgeError(c.state, c.detail));
        }
      });
      try {
        port.postMessage({ t: 'hello', v: HELPER_PROTOCOL });
      } catch (e) {
        clearTimeout(timer);
        reject(new BridgeError('broken', (e as Error).message));
      }
    });
  }

  async probe(): Promise<ProbeResult> {
    try {
      const h = await this.hello();
      try {
        h.port.disconnect();
      } catch {
        /* gone */
      }
      const allowed = h.hello.allow.includes(`${GRID_HOST}:${GRID_PORT}`);
      return {
        id: 'helper',
        state: allowed ? 'available' : 'broken',
        helper: { version: String(h.hello.helper), os: h.hello.os, kind: h.hello.kind, allow: h.hello.allow.map(String) },
        detail: allowed ? `helper ${h.hello.helper} (${h.hello.kind}, ${h.hello.os})` : `the helper's allowlist does not hold ${GRID_HOST}:${GRID_PORT}`,
      };
    } catch (e) {
      const be = e instanceof BridgeError ? e : new BridgeError('broken', (e as Error).message);
      return { id: 'helper', state: be.state === 'refused' || be.state === 'unreachable' ? 'broken' : be.state, detail: be.detail };
    }
  }

  /** one native port per stream: the helper process lives exactly as long as this connection */
  async open(host: string, port: number): Promise<ByteStream> {
    const h = await this.hello();
    if (!h.hello.allow.includes(`${host}:${port}`)) {
      h.port.disconnect();
      throw new BridgeError('refused', `the helper does not carry ${host}:${port}`);
    }
    const id = `s${++streamSeq}`;
    let onData: (b: Uint8Array) => void = () => undefined;
    let onClose: (why?: string) => void = () => undefined;
    let closed = false;
    const early: Uint8Array[] = [];
    let dataReady = false;
    const end = (why: string) => {
      if (closed) return;
      closed = true;
      onClose(why);
    };
    return new Promise<ByteStream>((resolve, reject) => {
      let opened = false;
      const timer = setTimeout(() => {
        if (opened) return;
        try {
          h.port.disconnect();
        } catch {
          /* gone */
        }
        reject(new BridgeError('unreachable', 'the helper did not open the connection in time'));
      }, this.o.openTimeoutMs ?? OPEN_TIMEOUT_MS);
      h.listeners.add((m) => {
        if ('id' in m && m.id && m.id !== id) return;
        switch (m.t) {
          case 'opened':
            if (opened) return;
            opened = true;
            clearTimeout(timer);
            resolve({
              write: (b) => {
                if (closed) return;
                for (let i = 0; i < b.length; i += HELPER_CHUNK) h.port.postMessage({ t: 'data', id, b64: b64enc(b.subarray(i, i + HELPER_CHUNK)) });
              },
              onData: (cb) => {
                onData = cb;
                dataReady = true;
                for (const x of early.splice(0)) cb(x);
              },
              onClose: (cb) => (onClose = cb),
              close: () => {
                if (closed) return;
                closed = true;
                try {
                  h.port.postMessage({ t: 'close', id });
                  h.port.disconnect();
                } catch {
                  /* gone */
                }
              },
            });
            return;
          case 'data': {
            let bytes: Uint8Array;
            try {
              bytes = b64dec(m.b64);
            } catch {
              return;
            }
            if (dataReady) onData(bytes);
            else early.push(bytes);
            return;
          }
          case 'closed':
          case 'error':
            if (!opened) {
              clearTimeout(timer);
              try {
                h.port.disconnect();
              } catch {
                /* gone */
              }
              reject(new BridgeError(/refus|allow/i.test(m.reason ?? '') ? 'refused' : 'unreachable', `the helper: ${m.reason ?? m.t}`));
              return;
            }
            end(`helper: ${m.reason ?? m.t}`);
            return;
          default:
            return;
        }
      });
      void h.ended.then((why) => {
        clearTimeout(timer);
        if (!opened) reject(new BridgeError('broken', `the helper went away: ${why}`));
        else end(`helper went away: ${why}`);
      });
      h.port.postMessage({ t: 'open', id, host, port });
    });
  }
}

// ---- the order of D3 ---------------------------------------------------------------------------------

export interface BridgeChoice {
  /** the first available in D3's order, or none */
  chosen: BridgeId | 'none';
  provider?: BridgeProvider;
  probes: ProbeResult[];
}

/** probe each in order and stop at the first available (the helper is probed only when the two before it are not there) */
export async function chooseBridge(providers: BridgeProvider[]): Promise<BridgeChoice> {
  const probes: ProbeResult[] = [];
  for (const p of providers) {
    const r = await p.probe();
    probes.push(r);
    if (r.state === 'available') return { chosen: p.id, provider: p, probes };
  }
  return { chosen: 'none', probes };
}

// ---- the bundled helper's download -------------------------------------------------------------------

/**
 * public/bridge/manifest.json, as the helper stream writes it (the shape the core reads; fields it does
 * not know are ignored): { "host_name": "com.openspineconsortium.beethoven.bridge", "helper": "<version>",
 * "protocol": 1, "files": [ { "os": "windows"|"mac"|"linux", "kind": "script"|"binary", "name": "<file under
 * bridge/>", "open": "<the installer inside it>", "size": n, "sha256": "<hex>" } ] }. The older spellings
 * "file" and "bytes" are read too.
 */
export interface BridgeManifest {
  v?: number;
  helper?: string;
  host?: string;
  files: Array<{ os: string; file: string; open?: string; bytes?: number; sha256?: string; kind?: string; version?: string }>;
}

const FILE_RE = /^[A-Za-z0-9._-]+$/;

export function parseBridgeManifest(raw: unknown): BridgeManifest | undefined {
  const m = raw as { v?: unknown; protocol?: unknown; helper?: unknown; host?: unknown; host_name?: unknown; files?: unknown } | undefined;
  if (!m || typeof m !== 'object' || !Array.isArray(m.files)) return undefined;
  const files = (m.files as Array<Record<string, unknown>>)
    .map((f) => ({ f, file: typeof f?.name === 'string' ? f.name : typeof f?.file === 'string' ? f.file : '', bytes: typeof f?.size === 'number' ? f.size : f?.bytes }))
    .filter(({ f, file }) => f && typeof f.os === 'string' && FILE_RE.test(file))
    .map(({ f, file, bytes }) => ({
      os: String(f.os),
      file,
      ...(typeof f.open === 'string' && FILE_RE.test(f.open) ? { open: f.open } : {}),
      ...(typeof bytes === 'number' && bytes > 0 ? { bytes } : {}),
      ...(typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(f.sha256) ? { sha256: f.sha256.toLowerCase() } : {}),
      ...(f.kind === 'script' || f.kind === 'binary' ? { kind: f.kind } : {}),
      ...(typeof f.version === 'string' ? { version: f.version } : {}),
    }));
  const v = typeof m.v === 'number' ? m.v : typeof m.protocol === 'number' ? m.protocol : undefined;
  const host = typeof m.host_name === 'string' ? m.host_name : typeof m.host === 'string' ? m.host : undefined;
  return { ...(v !== undefined ? { v } : {}), ...(typeof m.helper === 'string' ? { helper: m.helper } : {}), ...(host ? { host } : {}), files };
}

export const OS_LABEL: Record<HelperOs, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

/** chrome.runtime.getPlatformInfo().os -> the helper's operating system (ChromeOS and others have none) */
export function helperOsFrom(platformOs: string | undefined): HelperOs | undefined {
  switch (platformOs) {
    case 'win':
      return 'windows';
    case 'mac':
      return 'mac';
    case 'linux':
    case 'openbsd':
      return 'linux';
    default:
      return undefined;
  }
}

/** "3 KB", "1.2 MB" */
export function sizeWords(bytes: number | undefined): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * This computer's file from the manifest, with the extension's own address of it. A script is preferred
 * over a binary (decision D1: the scripts need no compiler, no signing and no notarization account).
 */
export function helperDownloadFor(manifest: BridgeManifest | undefined, os: HelperOs | undefined, urlOf: (path: string) => string): HelperDownload | undefined {
  if (!manifest || !os) return undefined;
  const mine = manifest.files.filter((f) => f.os === os);
  const f = mine.find((x) => x.kind !== 'binary') ?? mine[0];
  if (!f) return undefined;
  const size = sizeWords(f.bytes);
  return {
    os,
    osLabel: OS_LABEL[os],
    url: urlOf(`/bridge/${f.file}`),
    file: f.file,
    ...(f.open ? { open: f.open } : {}),
    ...(size ? { size } : {}),
    ...(f.bytes ? { bytes: f.bytes } : {}),
    ...(f.sha256 ? { sha256: f.sha256 } : {}),
    ...(f.kind === 'script' || f.kind === 'binary' ? { kind: f.kind } : {}),
    ...(f.version ?? manifest.helper ? { version: f.version ?? manifest.helper } : {}),
  };
}
