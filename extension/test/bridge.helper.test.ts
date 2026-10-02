// The extension's side of the bridge (core/bridge.ts HelperBridge) against the bundled helper itself
// (helper/src/windows/bridge.ps1, Windows PowerShell), spoken to as Chrome speaks to a native messaging
// host: 4-byte little-endian lengths and UTF-8 JSON on its stdin and stdout. The helper is copied to a
// temporary folder with an allow.txt naming the grid stand-in on 127.0.0.1 (the second entry an installer
// may write), so nothing reaches the university; then an ssh sign-in and a command run through it.
// Skipped off Windows, or where the helper's sources or Python's asyncssh are missing.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HELPER_HOST, HelperBridge, type NativeApi, type NativePort } from '../src/core/bridge';
import { SshConnection, type KiRequest } from '../src/ssh';
import { havePythonAsyncssh, startGrid, type Grid } from './sshgrid/harness';

const PS1 = fileURLToPath(new URL('../../helper/src/windows/bridge.ps1', import.meta.url));
const RUN = process.platform === 'win32' && existsSync(PS1) && havePythonAsyncssh();

/** Chrome's side of native messaging, for a host started from `dir` */
function nativeFrom(dir: string, procs: ChildProcessWithoutNullStreams[]): NativeApi {
  let lastError: string | undefined;
  return {
    lastError: () => lastError,
    connectNative(name: string): NativePort {
      expect(name).toBe(HELPER_HOST);
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'bridge.ps1'), 'chrome-extension://test/'], { stdio: ['pipe', 'pipe', 'pipe'] });
      procs.push(p);
      const msgL: Array<(m: unknown) => void> = [];
      const discL: Array<() => void> = [];
      let buf = Buffer.alloc(0);
      p.stdout.on('data', (d: Buffer) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4) {
          const n = buf.readUInt32LE(0);
          if (buf.length < 4 + n) break;
          const msg = JSON.parse(buf.subarray(4, 4 + n).toString('utf8')) as unknown;
          buf = buf.subarray(4 + n);
          for (const f of msgL) f(msg);
        }
      });
      p.stderr.on('data', () => undefined);
      p.on('exit', () => {
        lastError = 'Native host has exited.';
        for (const f of discL) f();
        lastError = undefined;
      });
      return {
        postMessage(m: unknown) {
          const b = Buffer.from(JSON.stringify(m), 'utf8');
          const h = Buffer.alloc(4);
          h.writeUInt32LE(b.length);
          p.stdin.write(Buffer.concat([h, b]));
        },
        disconnect() {
          p.stdin.end();
        },
        onMessage: { addListener: (f) => msgL.push(f) },
        onDisconnect: { addListener: (f) => discL.push(f) },
      };
    },
  };
}

describe.skipIf(!RUN)('the bundled helper (PowerShell), spoken to as Chrome does', () => {
  let grid: Grid;
  let dir: string;
  const procs: ChildProcessWithoutNullStreams[] = [];
  beforeAll(async () => {
    grid = await startGrid();
    dir = mkdtempSync(path.join(tmpdir(), 'beethoven-bridge-test-'));
    copyFileSync(PS1, path.join(dir, 'bridge.ps1'));
    writeFileSync(path.join(dir, 'allow.txt'), `127.0.0.1:${grid.port}\n`);
  }, 60_000);
  afterAll(() => {
    grid?.stop();
    for (const p of procs) p.kill();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the process may still hold it a moment */
    }
  });

  it('says hello with its version, its system and its allowlist (the grid built in)', async () => {
    const r = await new HelperBridge(nativeFrom(dir, procs), { helloTimeoutMs: 20_000 }).probe();
    expect(r.state).toBe('available');
    expect(r.helper).toMatchObject({ os: 'windows', kind: 'script' });
    expect(r.helper?.allow).toEqual(expect.arrayContaining(['grid.wayne.edu:22', `127.0.0.1:${grid.port}`]));
  }, 60_000);

  it('refuses a destination outside its allowlist', async () => {
    const b = new HelperBridge(nativeFrom(dir, procs), { helloTimeoutMs: 20_000 });
    await expect(b.open('example.org', 22)).rejects.toMatchObject({ state: 'refused' });
  }, 60_000);

  it('carries an ssh session: the pinned handshake, the sign-in, a command and its output', async () => {
    const b = new HelperBridge(nativeFrom(dir, procs), { helloTimeoutMs: 20_000, openTimeoutMs: 30_000 });
    const stream = await b.open('127.0.0.1', grid.port);
    const conn = new SshConnection({ stream, username: 'st1234', pinnedFingerprint: grid.fp });
    const info = await conn.connect();
    expect(info.hostKeyFingerprint).toBe(grid.fp);
    const r = await conn.authKeyboardInteractive(async (req: KiRequest) => req.prompts.map((p) => (/password/i.test(p.prompt) ? 'pw-correct' : '864209')));
    expect(r.success).toBe(true);
    const out = await conn.exec('BIG:300000', { timeoutMs: 60_000 });
    expect(out.stdout.length).toBeGreaterThanOrEqual(300_000);
    const echo = await conn.exec('echo through the helper');
    expect(echo.stdoutText).toBe('through the helper\n');
    await conn.close();
  }, 120_000);
});
