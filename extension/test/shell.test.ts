// The shell frame parser and the pieces around it: token scraping from the real page shape,
// the one-line wrapper, marker extraction across split frames and control sequences, and the
// 3146 reasons.
import { describe, expect, it } from 'vitest';
import { clean, explainClose, markerFor, scrapeCsrf, ShellTranscript, shellSocketUrl, wrapCommand } from '../src/core/shell';

const INDEX_HBS = `<script>
  function get_url() {
    var base = document.URL.replace(/^http/, 'ws').replace(/#.*$/, '');
    var separator = '?';
    if(base.includes('?')){ separator = '&'; }
    return base + separator + "csrf=Xk9_-abcDEF123-9zZ";
  }
</script>`;

describe('shell driver pieces', () => {
  it('scrapes the csrf token from the shell page exactly as index.hbs embeds it', () => {
    expect(scrapeCsrf(INDEX_HBS)).toBe('Xk9_-abcDEF123-9zZ');
    expect(scrapeCsrf('<html>no token</html>')).toBeUndefined();
  });

  it('builds the socket URL with the token and the right scheme', () => {
    expect(shellSocketUrl('https://ood.example', 'default', 'T')).toBe('wss://ood.example/pun/sys/shell/ssh/default?csrf=T');
    expect(shellSocketUrl('http://localhost:8080', 'login1', 'T')).toBe('ws://localhost:8080/pun/sys/shell/ssh/login1?csrf=T');
  });

  it('wraps exactly one command line and never puts the expanded marker into the typed line', () => {
    const line = wrapCommand('sbatch --parsable ~/.hpcworker/jobs/worker.sbatch', 'abc123');
    expect(line).not.toContain('ASHBRabc123_BEGIN');
    expect(line).not.toContain('ASHBRabc123_END');
    expect(line.endsWith('; exit')).toBe(true);
    expect(line).toContain('( sbatch --parsable ~/.hpcworker/jobs/worker.sbatch ) 2>&1');
    expect(() => wrapCommand('a\nb', 'abc')).toThrow(/one command line/);
    expect(() => wrapCommand('', 'abc')).toThrow(/empty/);
    expect(() => wrapCommand('ls', 'not ok')).toThrow(/alphanumeric/);
  });

  it('finds the framed output across split frames, echoes and control sequences, and reads the exit code', () => {
    const t = new ShellTranscript('abc123');
    const m = markerFor('abc123');
    t.feed('Last login: Mon\r\n\x1b[?2004h[student@login1 ~]$ ');
    expect(t.phase).toBe('waiting');
    // the echo of the typed line: contains the variable form of the markers, not the expanded ones
    t.feed('__b=ASHBRabc123; printf \'\\n%s_BEGIN\\n\' "$__b"; ( sbatch --parsable x ) 2>&1; printf \'\\n%s_END:%s\\n\' "$__b" "$?"; exit\r\n');
    expect(t.phase).toBe('waiting');
    t.feed(`\r\n${m.base}_BEG`);
    t.feed('IN\r\n123456;clus');
    expect(t.phase).toBe('running');
    t.feed(`ter\r\n\x1b[0m${m.base}_END:0\r\nlogout\r\n`);
    expect(t.phase).toBe('done');
    expect(t.output).toBe('123456;cluster');
    expect(t.exitCode).toBe(0);
  });

  it('reports a non-zero exit code and ignores frames that are not text', () => {
    const t = new ShellTranscript('ff00');
    t.feed(new Uint8Array([1, 2, 3]));
    t.feed({ not: 'a string' });
    t.feed(`\nASHBRff00_BEGIN\nbash: nope: command not found\nASHBRff00_END:127\n`);
    expect(t.ignoredFrames).toBe(2);
    expect(t.phase).toBe('done');
    expect(t.exitCode).toBe(127);
    expect(t.output).toBe('bash: nope: command not found');
  });

  it('strips ANSI, OSC and carriage returns', () => {
    expect(clean('\x1b]0;title\x07a\x1b[31mb\x1b[0m\rc\x1b(B')).toBe('abc');
  });

  it('maps the four 3146 reasons to plain words, in the order app.js tests them', () => {
    expect(explainClose(3146, 'No clusters defined.')).toMatch(/no cluster configured/);
    expect(explainClose(3146, 'Invalid Origin.')).toMatch(/origin check/);
    expect(explainClose(3146, 'Bad CSRF Token.')).toMatch(/token had already expired/);
    expect(explainClose(3146, 'Host "x" not specified in allowlist or cluster configs.')).toMatch(/not allowed by the portal/);
    expect(explainClose(3146, '')).toMatch(/refused/);
    expect(explainClose(1006, '')).toMatch(/dropped/);
  });
});
