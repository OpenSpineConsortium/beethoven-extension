// Connecting a portal against a fake browser: the grant comes first, the page script is registered
// for the origin AND loaded into the tab that is already open (the live-portal finding: a runtime
// registration alone leaves an open tab without the script until it is reloaded), the tab is
// pinged until it answers, a refused grant connects nothing, and what a tab's address says.
// And the rule since 10.0.0 (9.0.0 asked the browser for claude.ai before it refused it): no
// Anthropic address is ever asked for, offered, kept or used, decided by one predicate, before any
// request, synchronously; look-alikes and the local mock are still portals.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { acceptedSettings, ANTHROPIC_REFUSAL, connectSequence, dropAnthropicGrants, guardedRequest, isAnthropicAddress, isAnthropicHost, isAnthropicPattern, lookAtTab, mayRequestOrigin, normaliseOrigin, type ConnectApi } from '../src/core/connect';
import type { ClickNote, PortalSettings } from '../src/core/keys';

function fakeBrowser(o: { registered?: string; settings?: PortalSettings; answersAfterInject?: number; answersBeforeInject?: boolean; injectFails?: boolean } = {}) {
  const calls: string[] = [];
  let registered = o.registered;
  let settings = o.settings;
  let injected = 0;
  let pings = 0;
  const api: ConnectApi = {
    containsOrigin: async () => true,
    scriptRegisteredFor: async () => registered,
    registerScript: async (origin) => {
      calls.push(`register ${origin}`);
      registered = origin;
    },
    unregisterScript: async () => {
      calls.push('unregister');
      registered = undefined;
    },
    inject: async (tabId) => {
      calls.push(`inject ${tabId}`);
      if (o.injectFails) throw new Error('Cannot access contents of the page');
      injected++;
    },
    ping: async (tabId) => {
      pings++;
      calls.push(`ping ${tabId}`);
      if (o.answersBeforeInject) return true;
      if (!injected) return false;
      // the injected script attaches its listener a moment later
      return pings > (o.answersAfterInject ?? 2);
    },
    loadSettings: async () => settings,
    saveSettings: async (s) => {
      calls.push(`save ${s.hostname}`);
      settings = s;
    },
    forgetTab: async () => void calls.push('forget-tab'),
    sleep: async () => undefined,
  };
  return { api, calls, get settings() { return settings; } };
}

describe('connecting a portal', () => {
  it('after the grant: registers the script, saves the settings, loads the script into the open tab and pings until it answers', async () => {
    const b = fakeBrowser();
    const out = await connectSequence(b.api, { origin: 'https://ood.example', tabId: 7, granting: Promise.resolve(true) });
    expect(out.answered).toBe(true);
    expect(out.injected).toBe(true);
    expect(out.changed).toBe(true);
    expect(out.settings).toMatchObject({ origin: 'https://ood.example', hostname: 'ood.example', shell_host: 'default', site: 'ood' });
    expect(b.calls.slice(0, 4)).toEqual(['register https://ood.example', 'save ood.example', 'forget-tab', 'ping 7']);
    expect(b.calls).toContain('inject 7');
    expect(b.calls.filter((c) => c === 'ping 7').length).toBeGreaterThan(2);
  });

  it('a tab whose script already answers is not injected again; settings for the same origin are kept', async () => {
    const settings: PortalSettings = { origin: 'https://ood.example', hostname: 'ood.example', connected_at: '2026-09-28T00:00:00Z', shell_host: 'login2', site: 'wayne' };
    const b = fakeBrowser({ registered: 'https://ood.example', settings, answersBeforeInject: true });
    const out = await connectSequence(b.api, { origin: 'https://ood.example/pun/sys/dashboard/', tabId: 3, granting: Promise.resolve(true) });
    expect(out).toMatchObject({ answered: true, injected: false, changed: false });
    expect(out.settings.shell_host).toBe('login2');
    expect(b.calls).toEqual(['ping 3']);
  });

  it('a different origin replaces the registration and the settings; a refused grant connects nothing', async () => {
    const settings: PortalSettings = { origin: 'https://old.example', hostname: 'old.example', connected_at: 'x', shell_host: 'default', site: 'old' };
    const b = fakeBrowser({ registered: 'https://old.example', settings });
    const out = await connectSequence(b.api, { origin: 'https://ood.example', tabId: 1, granting: Promise.resolve(true), pingTries: 3 });
    expect(out.changed).toBe(true);
    expect(b.calls.slice(0, 3)).toEqual(['unregister', 'register https://ood.example', 'save ood.example']);
    const refused = fakeBrowser();
    await expect(connectSequence(refused.api, { origin: 'https://ood.example', tabId: 1, granting: Promise.resolve(false) })).rejects.toThrow(/not granted/);
    expect(refused.calls).toEqual([]);
  });

  it('when the injection itself fails (the tab is mid-navigation) the connection stands and says the tab did not answer yet', async () => {
    const b = fakeBrowser({ injectFails: true });
    const out = await connectSequence(b.api, { origin: 'https://ood.example', tabId: 9, granting: Promise.resolve(true), pingTries: 2 });
    expect(out.answered).toBe(false);
    expect(out.injected).toBe(false);
    expect(b.settings?.hostname).toBe('ood.example');
  });

  it('reads a tab address: a /pun/ page or the connected portal looks like Open OnDemand, anything else does not', () => {
    expect(lookAtTab('https://ondemand.grid.wayne.edu/pun/sys/dashboard/')).toMatchObject({ origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu', path: '/pun/sys/dashboard/', ood: true });
    expect(lookAtTab('https://ondemand.grid.wayne.edu/nginx/init?redir=/pun/sys/dashboard')?.ood).toBe(true);
    expect(lookAtTab('https://ondemand.grid.wayne.edu/')?.ood).toBe(false);
    expect(lookAtTab('https://ondemand.grid.wayne.edu/', 'ondemand.grid.wayne.edu')?.ood).toBe(true);
    expect(lookAtTab('https://claude.ai/code')?.ood).toBe(false);
    expect(lookAtTab('chrome://extensions')).toBeUndefined();
    expect(lookAtTab(undefined)).toBeUndefined();
    expect(normaliseOrigin('ondemand.grid.wayne.edu')).toBe('https://ondemand.grid.wayne.edu');
    expect(normaliseOrigin('https://ondemand.grid.wayne.edu/pun/sys/dashboard')).toBe('https://ondemand.grid.wayne.edu');
    expect(() => normaliseOrigin('http://ood.example')).toThrow(/https/);
    expect(normaliseOrigin('http://localhost:8080/login')).toBe('http://localhost:8080');
    for (const h of ['claude.ai', 'https://claude.ai/code', 'app.claude.com', 'console.anthropic.com', 'https://ANTHROPIC.com/']) expect(() => normaliseOrigin(h)).toThrow(/Anthropic/);
    expect(normaliseOrigin('claude.ai.example.edu')).toBe('https://claude.ai.example.edu');
  });
});

/** the three hosts, names under them, and the spellings a browser accepts for them */
const ANTHROPIC = ['claude.ai', 'claude.com', 'anthropic.com', 'www.claude.ai', 'api.anthropic.com', 'console.anthropic.com', 'app.claude.com', 'CLAUDE.AI', 'claude.ai.', 'a.b.claude.com'];
/** look-alikes that are someone else's sites, and the local mock: all still portals */
const NOT_ANTHROPIC = ['claude.ai.example.edu', 'notclaude.ai', 'anthropic.com.evil.edu', 'claude-ai.edu', 'myanthropic.com', 'ondemand.grid.wayne.edu', 'localhost'];

describe('never an Anthropic address', () => {
  it('one predicate names the three hosts and every name under them, and nothing else', () => {
    for (const h of ANTHROPIC) expect(isAnthropicHost(h), h).toBe(true);
    for (const h of NOT_ANTHROPIC) expect(isAnthropicHost(h), h).toBe(false);
    expect(isAnthropicHost(undefined)).toBe(false);
    expect(isAnthropicHost('')).toBe(false);
    for (const a of ['https://claude.ai', 'https://www.claude.ai/code', 'claude.ai/new', 'http://api.anthropic.com:8443/v1', 'wss://claude.com/x']) expect(isAnthropicAddress(a), a).toBe(true);
    for (const a of ['https://claude.ai.example.edu', 'notclaude.ai', 'http://localhost:8080', '', 'not an address at all']) expect(isAnthropicAddress(a), a).toBe(false);
  });

  it('normaliseOrigin refuses every one of them in the one sentence, and still takes the look-alikes and the local mock', () => {
    for (const h of ANTHROPIC) {
      expect(() => normaliseOrigin(h), h).toThrow(ANTHROPIC_REFUSAL);
      expect(() => normaliseOrigin(`https://${h}/pun/sys/dashboard`), h).toThrow(/Anthropic address/);
    }
    expect(normaliseOrigin('claude.ai.example.edu')).toBe('https://claude.ai.example.edu');
    expect(normaliseOrigin('notclaude.ai')).toBe('https://notclaude.ai');
    expect(normaliseOrigin('http://localhost')).toBe('http://localhost');
    expect(normaliseOrigin('http://localhost:8080/pun/sys/dashboard')).toBe('http://localhost:8080');
    expect(normaliseOrigin('http://127.0.0.1:9000')).toBe('http://127.0.0.1:9000');
    expect(() => normaliseOrigin('')).toThrow(/type your portal address/);
    expect(() => normaliseOrigin('two words')).toThrow(/type your portal address/);
  });

  it('an Anthropic host is refused under any scheme or slash typo, and another scheme is never read as a host', () => {
    // 10.0.0's first build put https:// in front of these and asked the browser for "https://ftp", "https://wss" and "https://https"
    for (const h of ['ftp://claude.ai', 'wss://claude.ai', 'ws://api.anthropic.com/x', 'https:/claude.ai', 'https:claude.ai', 'HTTPS:/CLAUDE.AI/pun/', 'http:/claude.com', 'ftp:/claude.ai', 'wss:claude.ai', 'foo://www.claude.ai', 'https:///claude.ai']) {
      expect(isAnthropicAddress(h), h).toBe(true);
      expect(() => normaliseOrigin(h), h).toThrow(ANTHROPIC_REFUSAL);
    }
    for (const h of ['ftp://ondemand.example.edu', 'wss://ondemand.example.edu', 'mailto:someone@claude.ai', 'javascript:alert(1)', 'file:///C:/x', 'about:blank']) expect(() => normaliseOrigin(h), h).toThrow(/https address/);
    // a port is not a scheme
    expect(normaliseOrigin('localhost:8443')).toBe('https://localhost:8443');
    expect(normaliseOrigin('ondemand.example.edu:443/pun/sys/dashboard')).toBe('https://ondemand.example.edu');
    expect(normaliseOrigin('localhost:')).toBe('https://localhost');
    expect(() => normaliseOrigin('claude.ai:8443'), 'claude.ai:8443').toThrow(ANTHROPIC_REFUSAL);
    // the slash typo on a portal still names the portal
    expect(normaliseOrigin('https:/ondemand.example.edu/pun/')).toBe('https://ondemand.example.edu');
  });

  it('the connect sequence loads the page script only into a tab on the origin it connects', async () => {
    const b = fakeBrowser();
    const at: Array<[number, string]> = [];
    const api: ConnectApi = { ...b.api, inject: async (tabId, origin) => void at.push([tabId, origin]) };
    await connectSequence(api, { origin: 'ondemand.grid.wayne.edu', tabId: 7, granting: Promise.resolve(true), pingTries: 1, pingGapMs: 0 });
    expect(at).toEqual([[7, 'https://ondemand.grid.wayne.edu']]);
  });

  it('the permission request never reaches the browser for one of them, and answers "not granted"', async () => {
    const asked: string[][] = [];
    const request = guardedRequest(async (patterns) => {
      asked.push(patterns);
      return true;
    });
    for (const h of ANTHROPIC) {
      const origin = `https://${h.toLowerCase().replace(/\.$/, '')}`;
      expect(mayRequestOrigin(origin), origin).toBe(false);
      await expect(request(origin), origin).resolves.toBe(false);
    }
    // nor for an origin normaliseOrigin would not make (not https, not canonical, not an origin)
    for (const o of ['http://ood.example', 'https://OOD.example', 'https://ood.example/', 'ood.example', 'https://claude.ai.', 'https://claude.ai:*', '']) await expect(request(o), o).resolves.toBe(false);
    expect(asked).toEqual([]);
  });

  it('a legitimate portal is asked for synchronously, in the same turn as the click, with its one pattern', async () => {
    for (const origin of ['https://ondemand.grid.wayne.edu', 'https://claude.ai.example.edu', 'https://notclaude.ai', 'http://localhost', 'http://localhost:8080']) {
      const asked: string[][] = [];
      const request = guardedRequest((patterns) => {
        asked.push(patterns);
        return Promise.resolve(true);
      });
      expect(mayRequestOrigin(origin), origin).toBe(true);
      const p = request(origin);
      // no await before the browser call: Chrome shows its prompt only inside the gesture
      expect(asked, origin).toEqual([[`${origin}/*`]]);
      await expect(p).resolves.toBe(true);
    }
  });

  it('a tab on an Anthropic host is never an Open OnDemand page, whatever its path, and its path is not kept', () => {
    for (const h of ANTHROPIC) {
      for (const p of ['/pun/sys/dashboard/', '/nginx/init', '/code', '/']) {
        const look = lookAtTab(`https://${h}${p}`, h);
        expect(look, `${h}${p}`).toMatchObject({ ood: false, anthropic: true, path: '' });
      }
    }
    expect(lookAtTab('https://claude.ai.example.edu/pun/sys/dashboard/')).toMatchObject({ ood: true, anthropic: false, path: '/pun/sys/dashboard/' });
    expect(lookAtTab('http://localhost:8080/pun/sys/dashboard/')).toMatchObject({ origin: 'http://localhost:8080', ood: true, anthropic: false });
  });

  it('11.0.0 has no toolbar click that inspects a tab: the only way a portal is offered is the welcome page\'s address, refused for an Anthropic one before any prompt', () => {
    // the welcome page's default (the site profile's ood_base_url) and a typed "Use another portal"
    expect(mayRequestOrigin(normaliseOrigin('ondemand.grid.wayne.edu'))).toBe(true);
    for (const typed of ['claude.ai', 'https://claude.ai/code', 'www.claude.com', 'api.anthropic.com']) {
      expect(() => normaliseOrigin(typed), typed).toThrow(ANTHROPIC_REFUSAL);
      expect(mayRequestOrigin(typed), typed).toBe(false);
    }
    void (undefined as unknown as ClickNote);
  });

  it('the connect sequence refuses one even after a grant, and touches nothing', async () => {
    for (const h of ANTHROPIC) {
      const b = fakeBrowser();
      await expect(connectSequence(b.api, { origin: h, tabId: 2, granting: Promise.resolve(true) }), h).rejects.toThrow(/Anthropic address/);
      expect(b.calls, h).toEqual([]);
    }
  });

  it('stored settings naming one are not a portal', () => {
    const ok: PortalSettings = { origin: 'https://ood.example', hostname: 'ood.example', connected_at: 'x', shell_host: 'default', site: 'ood' };
    expect(acceptedSettings(ok)).toBe(ok);
    expect(acceptedSettings(undefined)).toBeUndefined();
    expect(acceptedSettings({ ...ok, origin: 'https://claude.ai', hostname: 'claude.ai' })).toBeUndefined();
    expect(acceptedSettings({ ...ok, origin: 'https://api.anthropic.com' })).toBeUndefined();
    expect(acceptedSettings({ ...ok, hostname: 'www.claude.com' })).toBeUndefined();
    expect(acceptedSettings({ ...ok, origin: 'https://claude.ai.example.edu', hostname: 'claude.ai.example.edu' })).toBeTruthy();
  });

  it('grants an earlier build obtained on one are removed, and nothing is asked of the browser when none is held', async () => {
    expect(isAnthropicPattern('https://claude.ai/*')).toBe(true);
    expect(isAnthropicPattern('https://www.claude.ai/*')).toBe(true);
    expect(isAnthropicPattern('*://*.anthropic.com/*')).toBe(true);
    expect(isAnthropicPattern('https://claude.com:443/*')).toBe(true);
    for (const p of ['https://*/*', '<all_urls>', 'https://claude.ai.example.edu/*', 'https://notclaude.ai/*', 'http://localhost/*', 'https://ondemand.grid.wayne.edu/*']) expect(isAnthropicPattern(p), p).toBe(false);

    const removed: string[][] = [];
    const api = (held: string[] | Error) => ({
      heldOrigins: async () => {
        if (held instanceof Error) throw held;
        return held;
      },
      removeOrigins: async (patterns: string[]) => void removed.push(patterns),
    });
    expect(await dropAnthropicGrants(api([]))).toEqual([]);
    expect(await dropAnthropicGrants(api(['https://ondemand.grid.wayne.edu/*']))).toEqual([]);
    expect(await dropAnthropicGrants(api(new Error('no permissions API')))).toEqual([]);
    expect(removed).toEqual([]);
    const held = ['https://ondemand.grid.wayne.edu/*', 'https://claude.ai/*', 'https://api.anthropic.com/*', 'https://claude.ai.example.edu/*'];
    expect(await dropAnthropicGrants(api(held))).toEqual(['https://claude.ai/*', 'https://api.anthropic.com/*']);
    expect(removed).toEqual([['https://claude.ai/*', 'https://api.anthropic.com/*']]);
  });

  it('the source calls browser.permissions.request in one place only, behind the guard', () => {
    const SRC = fileURLToPath(new URL('../src', import.meta.url));
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : n.endsWith('.ts') ? [path.join(d, n)] : []));
    const hits = walk(SRC).flatMap((p) =>
      readFileSync(p, 'utf8')
        .split('\n')
        .filter((l) => /permissions\s*\.\s*request\b/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l))
        .map((l) => ({ file: path.relative(SRC, p).replace(/\\/g, '/'), line: l.trim() })),
    );
    expect(hits.map((h) => h.file)).toEqual(['ext/connectApi.ts']);
    expect(hits[0]?.line).toMatch(/guardedRequest\(/);
  });
});
