// The login terminal's reader: the framework's plain-mode lines out of split, code-laden frames;
// only Anthropic's own pages are ever opened; the outcome is taken once; the code prompt is seen
// even without a newline.
import { describe, expect, it } from 'vitest';
import { commands, isClaudeAuthUrl, parseLoginLine } from '../src/core/contract';
import { LoginWatcher, loginFailureSentence } from '../src/core/login';

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
