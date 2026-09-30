// Anything token-shaped is replaced before it reaches the audit log, a message, or the screen.
// The shell's CSRF token travels in a query string, a signed token (the kill-list's signature, or
// a token of the vendor's VS Code extension someone pastes into a shell) is a long base64url run,
// and a command's output can contain whatever the student's shell printed; none of it belongs in a
// record the student may export and send to someone.
const RULES: Array<[RegExp, string]> = [
  [/(csrf=)[^&\s"']+/gi, '$1[redacted]'],
  [/ASHLEY(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/BEETHOVEN(?:REV)?1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[signed-token]'],
  [/sk-ant-[A-Za-z0-9_-]+/g, '[redacted]'],
  [/\b(Bearer)\s+\S+/g, '$1 [redacted]'],
  [/\b(token|secret|password|passwd|api[_-]?key|authorization)(\s*[=:]\s*)\S+/gi, '$1$2[redacted]'],
  // a long base64url run is a token until proven otherwise; job ids, hostnames and paths are short
  [/[A-Za-z0-9_-]{40,}/g, '[redacted]'],
];

export function redact(text: string): string {
  let s = String(text ?? '');
  for (const [re, rep] of RULES) s = s.replace(re, rep);
  return s;
}

/** A URL reduced to what an audit record needs: path and a redacted query, never the origin's credentials. */
export function auditEndpoint(url: string): string {
  try {
    const u = new URL(url, 'https://portal.invalid');
    return redact(u.pathname + (u.search ? u.search : ''));
  } catch {
    return redact(url);
  }
}
