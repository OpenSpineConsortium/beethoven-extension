// Connecting a portal against a fake browser: the grant comes first, the page script is registered
// for the origin AND loaded into the tab that is already open (the live-portal finding: a runtime
// registration alone leaves an open tab without the script until it is reloaded), the tab is
// pinged until it answers, a refused grant connects nothing, and what a tab's address says.
import { describe, expect, it } from 'vitest';
import { connectSequence, lookAtTab, normaliseOrigin, type ConnectApi } from '../src/core/connect';
import type { PortalSettings } from '../src/core/keys';

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
