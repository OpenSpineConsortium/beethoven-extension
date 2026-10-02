// Stand-ins for Anthropic's pages, answered by the harness itself (Playwright routes) so nothing ever
// reaches claude.ai, claude.com or anthropic.com: the browser's resolver also maps those hosts to
// NOTFOUND. They imitate only what a student does there: "Authorize" on the sign-in page, then the
// code page with "Copy Code", and the Remote Control environment page.
import crypto from 'node:crypto';

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#1a1c18}button{font:inherit;padding:10px 22px;border-radius:8px;border:1px solid #1a1c18;background:#1a1c18;color:#fff;cursor:pointer}code{display:block;word-break:break-all;background:#f1eee3;padding:12px;border-radius:8px;margin:12px 0}.note{color:#585b50;font-size:13px}</style></head><body>${body}<p class="note">Harness stand-in for an Anthropic page; nothing was sent to Anthropic.</p></body></html>`;

/** the code the stand-in hands out for an authorize link: base64url, "#", the link's state, like Anthropic's */
export function codeFor(state) {
  return `${crypto.randomBytes(24).toString('base64url')}#${String(state || 'mockstate').slice(0, 43)}`;
}

/** the page for an Anthropic URL; `codes` collects the codes handed out so the harness can say which was pasted */
export function anthropicPage(url, codes = []) {
  const u = new URL(url);
  if (/\/oauth\/authorize$/.test(u.pathname)) {
    const cb = u.searchParams.get('redirect_uri') || 'https://platform.claude.com/oauth/code/callback';
    const code = codeFor(u.searchParams.get('state'));
    codes.push(code);
    const next = `${cb}${cb.includes('?') ? '&' : '?'}code=${encodeURIComponent(code.split('#')[0])}&state=${encodeURIComponent(code.split('#')[1])}`;
    return page('Authorize · Claude', `<h1>Claude Code would like to connect to your Claude account</h1><p>client ${esc(u.searchParams.get('client_id') ?? '')}</p><button id="authorize" onclick="location.href=${esc(JSON.stringify(next))}">Authorize</button>`);
  }
  if (/\/oauth\/code\/callback$/.test(u.pathname)) {
    const code = `${u.searchParams.get('code') ?? ''}#${u.searchParams.get('state') ?? ''}`;
    return page('Authentication code · Claude', `<h1>Authentication code</h1><p>Paste this into Claude Code:</p><code id="code">${esc(code)}</code><button id="copy" onclick="(async()=>{try{await navigator.clipboard.writeText(document.getElementById('code').textContent);}catch(e){const t=document.createElement('textarea');t.value=document.getElementById('code').textContent;document.body.append(t);t.select();document.execCommand('copy');t.remove();}this.textContent='Copied';})()">Copy Code</button>`);
  }
  if (u.pathname.startsWith('/code')) {
    return page('Claude Code', `<h1>Claude Code</h1><p>Remote Control environment <b>${esc(u.searchParams.get('environment') ?? '')}</b>. In the real claude.ai, "Wayne State grid" shows here with a green dot when the worker is online.</p>`);
  }
  return page('Claude (stand-in)', `<h1>Claude</h1><p>${esc(u.href.slice(0, 200))}</p>`);
}
