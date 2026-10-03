// The debug log (14.0.0, core/debuglog.ts): a ring of at most 3000 lines in the background's memory, each made safe
// on the way in. What is tested: the cap (the oldest go first), a line repeated right after itself counted rather
// than kept twice, the header Copy debug log puts first, the tail Details shows, and the second wall: whatever a
// caller hands it, no password, one-time code, pasted Claude code, key, token or full authorize link is kept.
import { describe, expect, it } from 'vitest';
import { DEBUG_DETAILS_LINES, DEBUG_LINE_MAX, DEBUG_MAX, DebugRing, debugHeader, debugOutput, debugSafe, formatEntry } from '../src/core/debuglog';

const T0 = Date.parse('2026-10-03T12:00:00Z');

function ring(max?: number) {
  let t = T0;
  const r = new DebugRing(max, () => (t += 1000));
  return r;
}

describe('the ring', () => {
  it('keeps at most 3000 lines, dropping the oldest first', () => {
    expect(DEBUG_MAX).toBe(3000);
    expect(DEBUG_DETAILS_LINES).toBe(200);
    const r = ring();
    for (let i = 0; i < 3500; i++) r.add('read', `line ${i}`);
    expect(r.size).toBe(3000);
    const all = r.entries();
    expect(all[0]!.text).toBe('line 500');
    expect(all[all.length - 1]!.text).toBe('line 3499');
    // a smaller ring for the same rule
    const small = ring(3);
    for (const t of ['a', 'b', 'c', 'd']) small.add('x', t);
    expect(small.entries().map((e) => e.text)).toEqual(['b', 'c', 'd']);
  });

  it('stamps each line with its ISO time and a short tag, newest last', () => {
    const r = ring();
    r.add('mode', 'direct (preference direct; bridge helper; key enrolled)');
    r.add('Gate Verb!!', 'version: exit 0');
    const [a, b] = r.entries();
    expect(a).toMatchObject({ at: '2026-10-03T12:00:01.000Z', tag: 'mode', text: 'direct (preference direct; bridge helper; key enrolled)' });
    expect(b!.tag).toBe('gateverb');
    expect(r.tail(1)).toEqual(['2026-10-03T12:00:02.000Z gateverb version: exit 0']);
  });

  it('counts a line repeated right after itself instead of keeping it twice', () => {
    const r = ring();
    r.add('read', 'status.json: state online');
    r.add('read', 'status.json: state online');
    r.add('read', 'status.json: state online');
    r.add('panel', 'home online');
    r.add('read', 'status.json: state online');
    expect(r.size).toBe(3);
    expect(r.tail(3)).toEqual([
      '2026-10-03T12:00:01.000Z read status.json: state online (x3, last 2026-10-03T12:00:03.000Z)',
      '2026-10-03T12:00:04.000Z panel home online',
      '2026-10-03T12:00:05.000Z read status.json: state online',
    ]);
  });

  it('gives the newest lines for Details, and the whole log with its header for Copy debug log', () => {
    const r = ring();
    for (let i = 0; i < 250; i++) r.add('read', `line ${i}`);
    const tail = r.tail(DEBUG_DETAILS_LINES);
    expect(tail).toHaveLength(200);
    expect(tail[0]).toMatch(/ read line 50$/);
    expect(tail[199]).toMatch(/ read line 249$/);
    const text = r.text({ version: '14.0.0', mode: 'direct', portal: 'ondemand.grid.wayne.edu', account: 'go2432', worker: 'worker', at: Date.parse('2026-10-03T12:30:00Z') });
    const lines = text.trimEnd().split('\n');
    expect(lines[0]).toBe('Beethoven 14.0.0 debug log · mode direct · portal ondemand.grid.wayne.edu · account go2432 · worker worker · 2026-10-03T12:30:00.000Z · 250 lines, newest last');
    expect(lines).toHaveLength(251);
    expect(lines[1]).toMatch(/ read line 0$/);
    expect(lines[250]).toMatch(/ read line 249$/);
    r.clear();
    expect(r.size).toBe(0);
  });

  it('names what it does not know in the header with a dash', () => {
    expect(debugHeader({ version: '14.0.0', mode: 'setup', at: T0 }, 1)).toBe('Beethoven 14.0.0 debug log · mode setup · portal - · account - · worker - · 2026-10-03T12:00:00.000Z · 1 line, newest last');
  });

  it('cuts a line to one line of at most 400 characters, and an output to its first 160', () => {
    const s = debugSafe(`first\nsecond\r\nthird\t${'w '.repeat(400)}`);
    expect(s.startsWith('first | second | third | w w')).toBe(true);
    expect(s.length).toBe(DEBUG_LINE_MAX);
    expect(s.endsWith('…')).toBe(true);
    const o = debugOutput(`HPCW-GATE version account st1234 framework 14 claude yes\n${'x '.repeat(200)}`);
    expect(o.length).toBe(160);
    expect(o.startsWith('HPCW-GATE version account st1234 framework 14 claude yes | x x')).toBe(true);
    expect(formatEntry({ at: '2026-10-03T12:00:00.000Z', tag: 'sw', text: 'started' })).toBe('2026-10-03T12:00:00.000Z sw started');
  });
});

describe('what is never kept, whatever a caller hands it', () => {
  const AUTHORIZE = 'https://claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fconsole.anthropic.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&code_challenge=Kq3vQ7mZp9xW2yL8nR4tB6cD1fH5jA0sE3gU7iO9kVw&code_challenge_method=S256&state=Zx8cV2bN4mQ6wE1rT3yU5iO7pA9sD0fG2hJ4kL6zX8c';

  it('an authorize link keeps its host and path only', () => {
    const s = debugSafe(`sitting 3 auth-url: ${AUTHORIZE}`);
    expect(s).toBe('sitting 3 auth-url: https://claude.ai/oauth/authorize');
    expect(s).not.toMatch(/code_challenge|state=|client_id|redirect_uri/);
    // every address, not only Anthropic's: a portal address with a query keeps no query either
    expect(debugSafe('GET https://ondemand.grid.wayne.edu/pun/sys/shell/ws/default?csrf=abc123def456&x=1')).toBe('GET https://ondemand.grid.wayne.edu/pun/sys/shell/ws/default');
    // an address with a user and password keeps neither
    expect(debugSafe('relay wss://st1234:hunter2@relay.example/ws')).toBe('relay wss://relay.example/ws');
    // the environment link loses its query (the link is not the log's business: it says only that one is there)
    expect(debugSafe('opened https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt')).toBe('opened https://claude.ai/code');
  });

  it('a one-time code, a password or a pin named as such loses its value', () => {
    for (const [input, out] of [
      ['code: 864209', 'code: [redacted]'],
      ['the one-time code=864209 was sent', 'the one-time code=[redacted] was sent'],
      ['otp=123456', 'otp=[redacted]'],
      ['passcode: 112233', 'passcode: [redacted]'],
      ['password=pw-correct', 'password=[redacted]'],
      ['Password: hunter2', 'Password: [redacted]'],
    ] as const) {
      expect(debugSafe(input), input).toBe(out);
    }
  });

  it('a pasted Claude code, a token, a JSON web token, a key in any form', () => {
    const pasted = 'vQ3ZpKx9mT2wL8nR4tB6cD1fH5jA0sE3gU7iO9kVwYz#Zx8cV2bN4mQ6wE1rT3yU5iO7pA9sD0fG2hJ4kL6zX8c';
    expect(debugSafe(`typed ${pasted}`)).not.toMatch(/vQ3ZpKx9|Zx8cV2bN/);
    expect(debugSafe('Authorization: Bearer abc.def.ghi')).not.toContain('abc.def.ghi');
    expect(debugSafe('sk-ant-oat01-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).not.toContain('AbCdEfGh');
    expect(debugSafe('token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdDEyMzQifQ.c2lnbmF0dXJl')).not.toMatch(/eyJ/);
    expect(debugSafe('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzdDEyMzQifQ.c2lnbmF0dXJl')).toBe('jwt [redacted]');
    const pem = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\nQyNTUxOQAAACD3x2\n-----END OPENSSH PRIVATE KEY-----';
    expect(debugSafe(`key: ${pem} done`)).toBe('key: [key] done');
    expect(debugSafe('-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg')).toBe('[key]');
    expect(debugSafe('added ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl beethoven-browser 2026-12-01')).toBe('added ssh-ed25519 [key] beethoven-browser 2026-12-01');
    expect(debugSafe('ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBH+/abc=')).toBe('ecdsa-sha2-nistp256 [key]');
    // base64 with + / = this long, a SHA-256 in hex, a signed token
    expect(debugSafe('blob QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo+/0123456789abcdefgh==')).toBe('blob [redacted]');
    expect(debugSafe(`sha ${'ab12'.repeat(16)}`)).toBe('sha [redacted]');
    expect(debugSafe('BEETHOVEN1.eyJ2IjoxfQ.c2lnbmF0dXJlLXRoYXQtaXMtbG9uZw')).not.toMatch(/c2lnbmF0/);
  });

  it('keeps what a lab lead needs: job ids, names, hosts, short paths and the words', () => {
    const line = 'read direct: status.json: job 40554211, state online, updated_at 2026-10-03T11:58:30Z -> phase online, stale no, alive_seen yes, link present (session link)';
    expect(debugSafe(line)).toBe(line);
    const path = 'the shared copy at /rs/rs_grp_oschome/shared/beethoven/hpcworker/current cannot be used';
    expect(debugSafe(path)).toBe(path);
    expect(debugSafe('ssh open grid.wayne.edu:22 as go2432 through the helper bridge (one action) in 812 ms')).toBe('ssh open grid.wayne.edu:22 as go2432 through the helper bridge (one action) in 812 ms');
    // a failure code that ends in "code" is a word, not a code
    expect(debugSafe('sitting 2 step failed: signin-code: the code was not accepted')).toBe('sitting 2 step failed: signin-code: the code was not accepted');
    expect(debugSafe('gate read worker status.json: exit 0 in 233 ms: {"version":14,"site":"wayne","run":"worker","job":"40554211"}')).toBe('gate read worker status.json: exit 0 in 233 ms: {"version":14,"site":"wayne","run":"worker","job":"40554211"}');
  });

  it('the ring applies all of it on the way in', () => {
    const r = ring();
    r.add('sitting', `auth-url ${AUTHORIZE}`);
    r.add('fail', 'direct sign-in: dropped: password=pw-correct code: 864209');
    r.add('sheet', 'added ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl');
    const text = r.text({ version: '14.0.0', mode: 'direct', at: T0 });
    for (const secret of ['pw-correct', '864209', 'code_challenge', 'state=', 'AAAAC3NzaC1lZDI1NTE5', 'client_id']) expect(text, secret).not.toContain(secret);
    expect(text).toContain('auth-url https://claude.ai/oauth/authorize');
  });
});
