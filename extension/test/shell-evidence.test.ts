// The shell is typed into only on evidence that a shell is up (11.0.0 review): a prompt of a known
// shape, or sshd's "Last login" followed by a quiet. Never on silence, never on a banner that settles
// before the password prompt: a line typed at a password prompt is a failed sign-in against the
// student's AccessID. And once a line was typed, a password prompt before the line is seen to run ends
// the sitting with nothing more typed. testShell (the channel test, AM2's re-test) says "ok" only on the
// same evidence. A pre-authentication banner and a slow sshd are what a keyless student's login node may
// show; the timings below are the reviewer's (scratchpad/v11/review/banner.mts).
import { describe, expect, it } from 'vitest';
import { looksLikePrompt, openShell, runShellCommand, testShell } from '../src/core/shell';

type Script = Array<[number, string]>;

function net(script: Script, sent: string[], onInput?: (ws: { emit(t: string, e: unknown): void }, input: string) => void) {
  class WS {
    readyState = 0;
    ls: Record<string, Array<(e: unknown) => void>> = {};
    constructor(_u: string) {
      setTimeout(() => {
        this.readyState = 1;
        this.emit('open', {});
        for (const [at, text] of script) setTimeout(() => this.readyState === 1 && this.emit('message', { data: text }), at);
      }, 5);
    }
    addEventListener(t: string, f: (e: unknown) => void) {
      (this.ls[t] ??= []).push(f);
    }
    emit(t: string, e: unknown) {
      for (const f of this.ls[t] ?? []) f(e);
    }
    send(d: string) {
      sent.push(d);
      const m = JSON.parse(d) as { input?: string };
      if (typeof m.input === 'string') onInput?.(this, m.input);
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => this.emit('close', { code: 1000, reason: '' }), 1);
    }
  }
  const fetch = async () => {
    const r = new Response('<script>csrf=abc</script>', { status: 200 });
    Object.defineProperty(r, 'url', { value: 'https://p.example.edu/pun/sys/shell/ssh/default' });
    return r;
  };
  return { fetch, WebSocket: WS as never };
}

const ORIGIN = 'https://p.example.edu';
const inputs = (sent: string[]) => sent.filter((s) => s.includes('"input"'));

describe('a shell is typed into only on evidence that it is up', () => {
  it('knows a prompt from a banner line and from a password prompt', () => {
    expect(looksLikePrompt('Last login: Wed\n[st1234@warrior ~]$ ')).toBe(true);
    expect(looksLikePrompt('st1234@login1:~$ ')).toBe(true);
    expect(looksLikePrompt('bash-4.2# ')).toBe(true);
    expect(looksLikePrompt('WARNING: Authorized use only.\n')).toBe(false);
    expect(looksLikePrompt("st1234@warrior's password: ")).toBe(false);
    expect(looksLikePrompt('Password: ')).toBe(false);
  });

  it('a banner, then the password prompt 1 s later: "password", nothing typed', async () => {
    const script: Script = [[50, 'WARNING: Authorized use only. Activity is monitored.\r\n'], [1100, "st1234@warrior.grid.wayne.edu's password: "]];
    const a: string[] = [];
    expect(await testShell({ origin: ORIGIN, host: 'default', net: net(script, a) })).toBe('password');
    expect(inputs(a)).toEqual([]);
    const b: string[] = [];
    const s = await openShell({ origin: ORIGIN, host: 'default', command: "exec bash '/x/bin/hpcworker' connect --name 'worker'", net: net(script, b), onOutput: () => undefined, keepaliveMs: 0, maxMs: 9000 });
    expect((await s.done).reason).toBe('password');
    expect(inputs(b)).toEqual([]);
  });

  it('silence for 6 s, then the password prompt: nothing typed blind', async () => {
    const script: Script = [[6000, "st1234@warrior.grid.wayne.edu's password: "]];
    const b: string[] = [];
    const s = await openShell({ origin: ORIGIN, host: 'default', command: "exec bash '/x/bin/hpcworker' connect --name 'worker'", net: net(script, b), onOutput: () => undefined, keepaliveMs: 0, maxMs: 9000 });
    expect((await s.done).reason).toBe('password');
    expect(inputs(b)).toEqual([]);
  }, 15_000);

  it('a prompt of the usual shape: typed at once; testShell "ok" and only "exit"', async () => {
    const script: Script = [[30, 'Last login: Wed Oct  1 08:00:00 2026 from 10.0.0.1\r\n'], [60, '[st1234@warrior ~]$ ']];
    const a: string[] = [];
    expect(await testShell({ origin: ORIGIN, host: 'default', net: net(script, a) })).toBe('ok');
    expect(inputs(a)).toEqual(['{"input":"exit\\r"}']);
    const b: string[] = [];
    const s = await openShell({ origin: ORIGIN, host: 'default', command: 'echo hi', net: net(script, b), onOutput: () => undefined, keepaliveMs: 0, maxMs: 3000, settleMs: 50 });
    await new Promise((r) => setTimeout(r, 400));
    expect(inputs(b)).toEqual(['{"input":"echo hi\\r"}']);
    s.close();
  });

  it('an unusual prompt after "Last login": typed after the quiet, never before', async () => {
    const script: Script = [[30, 'Last login: Wed Oct  1 08:00:00 2026\r\nwarrior ❯ ']];
    const b: string[] = [];
    const s = await openShell({ origin: ORIGIN, host: 'default', command: 'echo hi', net: net(script, b), onOutput: () => undefined, keepaliveMs: 0, maxMs: 9000, settleMs: 50 });
    await new Promise((r) => setTimeout(r, 1000));
    expect(inputs(b)).toEqual([]);
    await new Promise((r) => setTimeout(r, 4500));
    expect(inputs(b)).toEqual(['{"input":"echo hi\\r"}']);
    s.close();
  }, 10_000);

  it('a line typed just as a password prompt arrives: the sitting ends "password", nothing more is sent', async () => {
    // the prompt looked like a shell's, then ssh asked anyway (a reused terminal, a slow second factor)
    const script: Script = [[30, '[st1234@warrior ~]$ ']];
    const b: string[] = [];
    const s = await openShell({
      origin: ORIGIN,
      host: 'default',
      command: "exec bash '/x/bin/hpcworker' connect --name 'worker'",
      net: net(script, b, (ws) => setTimeout(() => ws.emit('message', { data: 'Permission denied, please try again.\r\nPassword: ' }), 20)),
      onOutput: () => undefined,
      keepaliveMs: 0,
      maxMs: 5000,
      settleMs: 50,
    });
    expect((await s.done).reason).toBe('password');
    s.send('CODE-123');
    expect(inputs(b)).toHaveLength(1);
  });

  it('runShellCommand: a password prompt after the line, before its begin marker, is a PasswordError', async () => {
    const script: Script = [[30, '[st1234@warrior ~]$ ']];
    const b: string[] = [];
    const p = runShellCommand({ origin: ORIGIN, host: 'default', command: 'true', net: net(script, b, (ws) => setTimeout(() => ws.emit('message', { data: 'Password: ' }), 20)), timeoutMs: 3000, settleMs: 50 });
    await expect(p).rejects.toMatchObject({ name: 'PasswordError' });
  });
});
