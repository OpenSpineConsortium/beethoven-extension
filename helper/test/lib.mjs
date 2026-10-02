// Test helpers for the Beethoven bridge: a client that speaks Chrome's native messaging framing to a
// host process, and the small TCP servers the suite connects through it.
import { spawn } from 'node:child_process';
import net from 'node:net';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/';

// Starts a host the way Chrome does: on Windows through cmd.exe /d /c with the caller's origin and
// --parent-window; elsewhere by executing the host path with the origin as its only argument.
export function launchHost(hostPath) {
  if (process.platform === 'win32') {
    return new NativeHost('cmd.exe', ['/d', '/c', hostPath, ORIGIN, '--parent-window=0']);
  }
  return new NativeHost(hostPath, [ORIGIN]);
}

export class NativeHost {
  constructor(command, args) {
    this.t0 = performance.now();
    this.proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.buf = Buffer.alloc(0);
    this.queue = [];
    this.waiters = [];
    this.sinks = new Map();
    this.stderr = '';
    this.maxB64 = 0;
    this.maxFrame = 0;
    this.badFrames = 0;
    this.frames = 0;
    this.exitInfo = null;
    this.exited = new Promise((resolve) => {
      this.proc.on('exit', (code, signal) => {
        this.exitInfo = { code, signal, at: performance.now() };
        resolve(this.exitInfo);
        for (const w of this.waiters.splice(0)) { clearTimeout(w.timer); w.reject(new Error(`host exited (code ${code}) while waiting for ${w.label}`)); }
      });
    });
    this.proc.on('error', (e) => { this.stderr += `spawn error: ${e.message}\n`; });
    this.proc.stdout.on('data', (d) => this._onData(d));
    this.proc.stderr.on('data', (d) => { this.stderr += d.toString(); });
    this.proc.stdin.on('error', () => {});
  }

  _onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 4) {
      const n = this.buf.readUInt32LE(0);
      if (n > 1024 * 1024) { this.badFrames++; this.buf = Buffer.alloc(0); return; }
      if (this.buf.length < 4 + n) break;
      const body = this.buf.subarray(4, 4 + n).toString('utf8');
      this.buf = this.buf.subarray(4 + n);
      this.frames++;
      if (n > this.maxFrame) this.maxFrame = n;
      let m;
      try { m = JSON.parse(body); } catch { this.badFrames++; continue; }
      m._at = performance.now();
      if (typeof m.b64 === 'string' && m.b64.length > this.maxB64) this.maxB64 = m.b64.length;
      this._deliver(m);
    }
  }

  _deliver(m) {
    if (m.t === 'data' && this.sinks.has(m.id)) { this.sinks.get(m.id)(Buffer.from(m.b64, 'base64'), m); return; }
    const i = this.waiters.findIndex((w) => w.pred(m));
    if (i >= 0) {
      const w = this.waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve(m);
      return;
    }
    this.queue.push(m);
  }

  send(obj) { this.sendRaw(Buffer.from(JSON.stringify(obj), 'utf8')); }

  sendRaw(body) {
    const h = Buffer.alloc(4);
    h.writeUInt32LE(body.length, 0);
    this.proc.stdin.write(Buffer.concat([h, body]));
  }

  sendHeaderOnly(n) {
    const h = Buffer.alloc(4);
    h.writeUInt32LE(n >>> 0, 0);
    this.proc.stdin.write(h);
  }

  waitFor(pred, ms = 10000, label = 'a message') {
    const i = this.queue.findIndex(pred);
    if (i >= 0) return Promise.resolve(this.queue.splice(i, 1)[0]);
    if (this.exitInfo) return Promise.reject(new Error(`host already exited while waiting for ${label}`));
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, reject, label };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new Error(`timed out after ${ms} ms waiting for ${label}`));
      }, ms);
      this.waiters.push(w);
    });
  }

  waitT(t, id, ms, label) {
    return this.waitFor((m) => m.t === t && (id === undefined || m.id === id), ms, label || `${t} ${id ?? ''}`);
  }

  // Data messages for this id go to fn(buffer) instead of the queue.
  sink(id, fn) { this.sinks.set(id, fn); }

  // Sends bytes as data messages of at most 48 KiB each (64 KiB of base64, the contract's limit).
  sendBytes(id, bytes, chunk = 49152) {
    for (let off = 0; off < bytes.length; off += chunk) {
      this.send({ t: 'data', id, b64: bytes.subarray(off, off + chunk).toString('base64') });
    }
  }

  closeStdin() { this.proc.stdin.end(); }
  kill() { try { this.proc.kill(); } catch { /* gone */ } }
}

export function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

// echo: writes back what it reads; ends when the client ends.
export async function echoServer() {
  const conns = new Set();
  const server = net.createServer((s) => {
    conns.add(s);
    s.on('close', () => conns.delete(s));
    s.on('error', () => {});
    s.pipe(s);
  });
  const port = await listen(server);
  return { port, conns, close: () => { for (const s of conns) s.destroy(); server.close(); } };
}

// sink: records every byte and whether the client's FIN arrived, then ends its side.
export async function sinkServer() {
  const results = [];
  const waiters = [];
  const server = net.createServer({ allowHalfOpen: true }, (s) => {
    const parts = [];
    const r = { bytes: 0, fin: false, sha: null, reset: false };
    s.on('data', (d) => { parts.push(d); r.bytes += d.length; });
    s.on('end', () => { r.fin = true; r.sha = sha(Buffer.concat(parts)); s.end(); });
    s.on('error', () => { r.reset = true; });
    s.on('close', () => { if (!r.sha) r.sha = sha(Buffer.concat(parts)); results.push(r); for (const w of waiters.splice(0)) w(r); });
  });
  const port = await listen(server);
  return {
    port,
    results,
    next: (ms = 15000) => new Promise((resolve, reject) => {
      if (results.length) return resolve(results.shift());
      const t = setTimeout(() => reject(new Error('sink saw no connection close')), ms);
      waiters.push((r) => { clearTimeout(t); results.splice(results.indexOf(r), 1); resolve(r); });
    }),
    close: () => server.close(),
  };
}

// slow sink: reads nothing for the first `stallMs`, so the bridge's queue fills and it must stop
// reading Chrome (backpressure) until the server catches up; then records like sink.
export async function slowSinkServer(stallMs) {
  const results = [];
  const waiters = [];
  const server = net.createServer({ allowHalfOpen: true }, (s) => {
    const hash = crypto.createHash('sha256');
    const r = { bytes: 0, fin: false, sha: null };
    s.pause();
    setTimeout(() => s.resume(), stallMs);
    s.on('data', (d) => { hash.update(d); r.bytes += d.length; });
    s.on('end', () => { r.fin = true; r.sha = hash.digest('hex'); s.end(); });
    s.on('error', () => {});
    s.on('close', () => { results.push(r); for (const w of waiters.splice(0)) w(); });
  });
  const port = await listen(server);
  return {
    port,
    next: (ms = 60000) => new Promise((resolve, reject) => {
      if (results.length) return resolve(results.shift());
      const t = setTimeout(() => reject(new Error('slow sink saw no connection close')), ms);
      waiters.push(() => { clearTimeout(t); resolve(results.shift()); });
    }),
    close: () => server.close(),
  };
}

// sender: writes a fixed block of random bytes, then shuts down its sending side while still reading.
export async function senderServer(size) {
  const payload = crypto.randomBytes(size);
  const server = net.createServer({ allowHalfOpen: true }, (s) => {
    s.on('error', () => {});
    s.on('data', () => {});
    s.on('end', () => s.destroy());
    s.end(payload);
  });
  const port = await listen(server);
  return { port, payload, close: () => server.close() };
}

// counter: counts connections it accepts (for "refused before any connection").
export async function counterServer() {
  let accepts = 0;
  const server = net.createServer((s) => { accepts++; s.destroy(); });
  const port = await listen(server);
  return { port, get accepts() { return accepts; }, close: () => server.close() };
}

// A port with nothing listening on it.
export async function closedPort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((r) => server.close(r));
  return port;
}

export function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { n: s.length, min: +s[0].toFixed(2), median: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +s[s.length - 1].toFixed(2) };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
