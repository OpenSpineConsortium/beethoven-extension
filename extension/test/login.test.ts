// The login terminal's reader: the framework's plain-mode lines out of split, code-laden frames;
// only Anthropic's own pages are ever opened; the outcome is taken once; the code prompt is seen
// even without a newline.
import { describe, expect, it } from 'vitest';
import { commands, isClaudeAuthUrl, parseLoginLine, type ConnectEvent } from '../src/core/contract';
import { CODE_AFTER_LINK_MS, CodeGate, ConnectWatcher, LoginWatcher, loginFailureSentence } from '../src/core/login';

const URL = 'https://claude.ai/oauth/authorize?code=true&client_id=abc&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=xyz';

describe('the plain login lines', () => {
  it('types exactly the plain login command and nothing else interactive', () => {
    expect(commands.claudeLoginPlain).toBe('bash ~/.hpcworker/bin/hpcworker claude login --plain');
  });

  it('parses each of the framework\'s lines and ignores Claude Code\'s own text', () => {
    expect(parseLoginLine('HPCW-LOGIN 1 plain')).toEqual({ kind: 'started', detail: '1 plain' });
    expect(parseLoginLine('HPCW-LOGIN: asking the scheduler')).toEqual({ kind: 'started', detail: 'asking the scheduler' });
    expect(parseLoginLine(`AUTH-URL: ${URL}`)).toEqual({ kind: 'auth-url', url: URL });
    expect(parseLoginLine('SIGNED-IN student@example.edu max')).toEqual({ kind: 'signed-in', detail: 'student@example.edu max' });
    expect(parseLoginLine('SIGNED-IN')).toEqual({ kind: 'signed-in', detail: '' });
    expect(parseLoginLine('HPCW-LOGIN-FAILED the code was not accepted')).toEqual({ kind: 'failed', detail: 'the code was not accepted' });
    expect(parseLoginLine('Paste code here if prompted > ')).toEqual({ kind: 'code-prompt' });
    expect(parseLoginLine('HPCW-LOGIN: paste the code from that page')).toEqual({ kind: 'code-prompt' });
    expect(parseLoginLine('HPCW-LOGIN: code received, checking')).toEqual({ kind: 'started', detail: 'code received, checking' });
    expect(parseLoginLine('HPCW-LOGIN-FAILED: no code arrived within 10 minutes; start the sign-in again')).toEqual({ kind: 'failed', detail: 'no code arrived within 10 minutes; start the sign-in again' });
    expect(parseLoginLine('HPCW-LOGIN-DRY: url_seen=1 prompt_seen=1')).toBeUndefined();
    expect(parseLoginLine('Browser didn\'t open? Use the url below to sign in:')).toBeUndefined();
    expect(parseLoginLine('  ')).toBeUndefined();
    expect(parseLoginLine('some SIGNED-IN in the middle')).toBeUndefined();
  });

  it('opens only https pages on claude.ai or claude.com', () => {
    expect(isClaudeAuthUrl(URL)).toBe(true);
    expect(isClaudeAuthUrl('https://platform.claude.com/oauth/code/callback')).toBe(true);
    expect(isClaudeAuthUrl('https://claude.com/login')).toBe(true);
    expect(isClaudeAuthUrl('http://claude.ai/oauth/authorize')).toBe(false);
    expect(isClaudeAuthUrl('https://claude.ai.evil.example/oauth')).toBe(false);
    expect(isClaudeAuthUrl('https://evil.example/?u=https://claude.ai')).toBe(false);
    expect(isClaudeAuthUrl('javascript:alert(1)')).toBe(false);
    expect(isClaudeAuthUrl(undefined)).toBe(false);
  });

  it('assembles lines across frames and terminal codes, emits each event once, and sees the prompt without a newline', () => {
    const w = new LoginWatcher();
    w.feed('HPCW-LOGIN 1 plain\r\nHPCW-LOGIN: node01 allocated\r\n\x1b[1mBrowser didn\'t open?\x1b[0m\r\nAUTH-U');
    expect(w.events.map((e) => e.kind)).toEqual(['started', 'started']);
    w.feed(`RL: ${URL.slice(0, 30)}`);
    expect(w.authUrl).toBeUndefined();
    w.feed(`${URL.slice(30)}\r\n\r\nPaste code here if prompted > `);
    expect(w.authUrl).toBe(URL);
    expect(w.events.map((e) => e.kind)).toEqual(['started', 'started', 'auth-url', 'code-prompt']);
    // the line is redrawn by the terminal: not a second page
    w.feed(`\rAUTH-URL: ${URL}\r\n`);
    expect(w.events.filter((e) => e.kind === 'auth-url')).toHaveLength(1);
    w.feed('Login successful.\r\nSIGNED-IN student@example.edu max\r\nSIGNED-IN again\r\n');
    expect(w.outcome).toBe('signed-in');
    expect(w.detail).toBe('student@example.edu max');
    expect(w.events.filter((e) => e.kind === 'signed-in')).toHaveLength(1);
  });

  it('refuses a link that is not Anthropic\'s and reports the failure line', () => {
    const seen: string[] = [];
    const w = new LoginWatcher((e) => seen.push(e.kind));
    w.feed('AUTH-URL: https://evil.example/phish\n');
    expect(w.authUrl).toBeUndefined();
    expect(seen).toEqual(['refused-url']);
    w.feed('HPCW-LOGIN-FAILED Claude Code\'s sign-in exited 1\n');
    expect(w.outcome).toBe('failed');
    expect(loginFailureSentence(w.detail)).toBe("The sign-in did not complete: Claude Code's sign-in exited 1. You can try again; nothing was stored.");
    expect(loginFailureSentence('')).toMatch(/did not complete\. You can try again/);
    // a detail that is a sentence of its own (explainClose) keeps one full stop
    expect(loginFailureSentence('The shell closed normally.')).toBe('The sign-in did not complete: The shell closed normally. You can try again; nothing was stored.');
  });
});

// 11.0.0: the `hpcworker connect` sitting (docs/V11_CONTRACT.md §5) and the rule for the pasted code.
describe('the connect sitting\'s reader', () => {
  it('assembles lines across frames and terminal codes, tolerates the keepalive anywhere, opens one link once, and stops at the last step', () => {
    const seen: ConnectEvent[] = [];
    const w = new ConnectWatcher((e) => seen.push(e));
    w.feed("exec bash '/rs/x/bin/hpcworker' connect --name 'worker'\r\n");
    w.feed('HPCW-STEP setup ready\r\nHPCW-STEP con');
    w.feed('sent\r\nHPCW-STEP queued 40501234 new /rs/rs_grp_oschome/st1234/hpcworker/worker\r\n');
    w.feed('HPCW-STEP signin\r\nHPCW-LOGIN: requesting a compute node\r\nHPCW-LOGIN: still waiting\r\n');
    w.feed('HPCW-LOGIN: on asx15; checking whether you are signed in alreadyHPCW-LOGIN: still waiting\r\n');
    w.feed(`\x1b[0mAUTH-URL: ${URL}\r\nAUTH-URL: ${URL}\r\n`);
    w.feed('HPCW-LOGIN: paste the code from that page\r\nHPCW-LOGIN: code received, checking\r\n');
    w.feed('SIGNED-IN alex@wayne.edu max\r\nHPCW-STEP signed-in alex@wayne.edu max\r\nHPCW-STEP done\r\nHPCW-STEP failed other late\r\n');
    const kinds = seen.map((e) => (e.kind === 'step' ? `step:${e.step.step}` : e.kind));
    expect(kinds).toEqual(['step:setup', 'step:consent', 'step:queued', 'step:signin', 'signin-wait', 'signin-node', 'auth-url', 'code-prompt', 'code-received', 'signed-in', 'step:signed-in', 'step:done']);
    expect(w.ended).toBe('done');
    expect(w.authUrl).toBe(URL);
    expect(w.tail.length).toBeLessThanOrEqual(20);
  });

  it('sees Claude Code\'s own prompt on an unfinished line, and never hands on a link that is not Anthropic\'s', () => {
    const seen: ConnectEvent[] = [];
    const w = new ConnectWatcher((e) => seen.push(e));
    w.feed('AUTH-URL: https://evil.example/oauth\r\nPaste code here if prompted > ');
    expect(seen.map((e) => e.kind)).toEqual(['refused-url', 'code-prompt']);
    expect(w.authUrl).toBeUndefined();
  });
});

describe('the pasted code', () => {
  function gate() {
    let now = 0;
    const sent: string[] = [];
    const timers: Array<{ at: number; fn: () => void }> = [];
    const g = new CodeGate((s) => sent.push(s), { now: () => now, setTimer: (fn, ms) => (timers.push({ at: now + ms, fn }), timers.length as unknown as ReturnType<typeof setTimeout>), clearTimer: () => timers.splice(0) });
    const advance = (ms: number) => {
      now += ms;
      for (const t of timers.splice(0)) if (t.at <= now) t.fn();
        else timers.push(t);
    };
    return { g, sent, advance };
  }

  it('is typed once, with Enter, after the framework\'s prompt; a code that is not one never reaches the grid', () => {
    const { g, sent } = gate();
    expect(g.submit('not a code')).toBe('bad');
    g.onEvent({ kind: 'auth-url', url: URL });
    g.onEvent({ kind: 'code-prompt' });
    expect(g.submit('  AbC123#xyz-state  ')).toBe('typed');
    expect(sent).toEqual(['AbC123#xyz-state\r']);
    expect(g.submit('AbC123#xyz-state')).toBe('already');
    expect(sent).toHaveLength(1);
  });

  it('a code pasted before the prompt is held a few seconds at most, then typed; 5 s after the link without a prompt it is typed too', () => {
    const a = gate();
    a.g.onEvent({ kind: 'auth-url', url: URL });
    expect(a.g.submit('AbC123#xyz-state')).toBe('held');
    expect(a.g.holding).toBe(true);
    expect(a.sent).toEqual([]);
    a.g.onEvent({ kind: 'code-prompt' });
    expect(a.sent).toEqual(['AbC123#xyz-state\r']);
    const b = gate();
    b.g.onEvent({ kind: 'auth-url', url: URL });
    expect(b.g.submit('AbC123#xyz-state')).toBe('held');
    b.advance(CODE_AFTER_LINK_MS);
    expect(b.sent).toEqual(['AbC123#xyz-state\r']);
  });

  it('may be pasted again only after the framework says the last one was not accepted; nothing after the sitting ends', () => {
    const { g, sent } = gate();
    g.onEvent({ kind: 'code-prompt' });
    g.submit('FirstCode123');
    g.onEvent({ kind: 'code-rejected' });
    expect(g.submit('SecondCode456')).toBe('typed');
    expect(sent).toEqual(['FirstCode123\r', 'SecondCode456\r']);
    g.onEvent({ kind: 'step', step: { step: 'signed-in', email: 'a', plan: 'max' } });
    g.onEvent({ kind: 'code-rejected' });
    expect(g.submit('ThirdCode789')).toBe('closed');
    const h = gate();
    h.g.onEvent({ kind: 'auth-url', url: URL });
    h.g.submit('HeldCode123');
    h.g.close();
    h.advance(CODE_AFTER_LINK_MS);
    expect(h.sent).toEqual([]);
  });
});
