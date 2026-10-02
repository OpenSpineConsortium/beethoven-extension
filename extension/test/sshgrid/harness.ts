// The tests' grid stand-in (test/sshgrid/server.py, Python asyncssh on 127.0.0.1) and a Node TCP socket
// in the ByteStream shape a bridge gives the ssh client. Nothing here reaches the university.
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import type { ByteStream } from '../../src/ssh';

const SERVER = fileURLToPath(new URL('./server.py', import.meta.url));

/** Python with asyncssh is here (the tests that need the stand-in skip without it, and say so) */
export function havePythonAsyncssh(): boolean {
  try {
    const r = spawnSync('python', ['-c', 'import asyncssh'], { timeout: 20_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export interface Grid {
  port: number;
  fp: string;
  state(): Promise<{ keys: Record<string, Array<[string, string]>>; state: { claude: string; job: string; state: string; forgotten: number; commands: string[] } }>;
  stop(): void;
}

export function startGrid(cfg: Record<string, unknown> = {}): Promise<Grid> {
  return new Promise((resolve, reject) => {
    const p: ChildProcessWithoutNullStreams = spawn('python', ['-u', SERVER, JSON.stringify(cfg)], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    const waiting: Array<(v: unknown) => void> = [];
    let ready = false;
    const timer = setTimeout(() => reject(new Error('the grid stand-in did not start')), 30_000);
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line.startsWith('READY ') && !ready) {
          ready = true;
          clearTimeout(timer);
          const info = JSON.parse(line.slice(6)) as { port: number; fp: string };
          resolve({
            port: info.port,
            fp: info.fp,
            state: () =>
              new Promise((res) => {
                waiting.push(res as (v: unknown) => void);
                p.stdin.write('state\n');
              }) as ReturnType<Grid['state']>,
            stop: () => {
              try {
                p.stdin.end();
              } catch {
                /* gone */
              }
              p.kill();
            },
          });
        } else if (line.startsWith('STATE ')) waiting.shift()?.(JSON.parse(line.slice(6)));
      }
    });
    p.stderr.on('data', () => undefined);
    p.on('exit', (code) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new Error(`the grid stand-in exited (${code})`));
      }
    });
  });
}

/** a TCP socket to 127.0.0.1:port as a ByteStream; `chunk` splits every read into pieces of that size, each in its own macrotask */
export function tcpStream(port: number, o: { chunk?: number; host?: string } = {}): Promise<ByteStream & { written: number[]; sock: net.Socket }> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: o.host ?? '127.0.0.1', port });
    sock.setNoDelay(true);
    let onData: (b: Uint8Array) => void = () => undefined;
    let onClose: (why?: string) => void = () => undefined;
    const written: number[] = [];
    sock.on('data', (b: Buffer) => {
      const u = new Uint8Array(b.buffer, b.byteOffset, b.byteLength).slice();
      if (!o.chunk) return onData(u);
      for (let i = 0; i < u.length; i += o.chunk) {
        const part = u.subarray(i, i + o.chunk);
        setImmediate(() => onData(part));
      }
    });
    sock.on('close', () => onClose('socket closed'));
    sock.on('error', () => undefined);
    sock.once('connect', () =>
      resolve({
        write: (b) => {
          written.push(b.length);
          sock.write(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
        },
        onData: (cb) => (onData = cb),
        onClose: (cb) => (onClose = cb),
        close: () => sock.destroy(),
        written,
        sock,
      }),
    );
    sock.once('error', reject);
  });
}
