// The browser side of connecting (ext/connectApi.ts) against a stand-in for the extension API: the
// real requestOrigin never calls browser.permissions.request for claude.ai, claude.com,
// anthropic.com or a name under them, and calls it at once (no await first) for a portal; the
// clean-up at start removes a grant an earlier build obtained on one of them, a stored setting
// naming one and a page script registered for one, and asks the browser to remove nothing when
// nothing of the kind is held; stored settings naming one are never read back as the portal.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PORTAL_KEY, type PortalSettings } from '../src/core/keys';

type Area = { get(k: string): Promise<Record<string, unknown>>; set(o: Record<string, unknown>): Promise<void>; remove(k: string): Promise<void>; map: Map<string, unknown> };
function area(): Area {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k) => (map.has(k) ? { [k]: structuredClone(map.get(k)) } : {}),
    set: async (o) => {
      for (const [k, v] of Object.entries(o)) map.set(k, structuredClone(v));
    },
    remove: async (k) => {
      map.delete(k);
    },
  };
}

const seen = { request: [] as unknown[], remove: [] as unknown[], getAll: 0, register: [] as unknown[], unregister: 0, execute: [] as unknown[], order: [] as string[] };
let held: string[] = [];
const tabUrls = new Map<number, string | undefined>();
let registered: Array<{ id: string; matches: string[] }> = [];
const local = area();
const fake = {
  permissions: {
    request: (o: { origins: string[] }) => {
      seen.order.push('permissions.request');
      seen.request.push(o);
      return Promise.resolve(true);
    },
    contains: async () => true,
    getAll: async () => {
      seen.getAll++;
      return { permissions: ['storage'], origins: [...held] };
    },
    remove: async (o: { origins: string[] }) => {
      seen.remove.push(o);
      held = held.filter((p) => !o.origins.includes(p));
      return true;
    },
  },
  scripting: {
    getRegisteredContentScripts: async () => registered.map((s) => ({ ...s })),
    registerContentScripts: async (s: Array<{ id: string; matches: string[] }>) => {
      seen.register.push(s);
      registered.push(...s.map((x) => ({ id: x.id, matches: x.matches })));
    },
    unregisterContentScripts: async () => {
      seen.unregister++;
      registered = [];
    },
    executeScript: async (o: unknown) => {
      seen.execute.push(o);
      return [];
    },
  },
  tabs: {
    get: async (id: number) => ({ id, url: tabUrls.get(id) }),
  },
  storage: { local, session: area() },
  sidePanel: {
    open: (o: { windowId?: number }) => {
      seen.order.push(`sidePanel.open ${o.windowId}`);
      return Promise.resolve();
    },
  },
};

let api: typeof import('../src/ext/connectApi');
let storage: typeof import('../src/ext/storage');
let gesture: typeof import('../src/ext/gesture');

beforeAll(async () => {
  // wxt/browser picks globalThis.chrome when there is no globalThis.browser with a runtime id; it reads it once, at import
  vi.stubGlobal('chrome', fake);
  api = await import('../src/ext/connectApi');
  storage = await import('../src/ext/storage');
  gesture = await import('../src/ext/gesture');
});

beforeEach(() => {
  seen.request = [];
  seen.remove = [];
  seen.getAll = 0;
  seen.register = [];
  seen.unregister = 0;
  seen.execute = [];
  seen.order = [];
  tabUrls.clear();
  held = [];
  registered = [];
  local.map.clear();
});

const PORTAL: PortalSettings = { origin: 'https://ondemand.grid.wayne.edu', hostname: 'ondemand.grid.wayne.edu', connected_at: '2026-09-30T00:00:00Z', shell_host: 'default', site: 'wayne' };

describe('ext/connectApi.ts', () => {
  it('requestOrigin never calls browser.permissions.request for an Anthropic origin, whoever calls it', async () => {
    for (const o of ['https://claude.ai', 'https://claude.com', 'https://anthropic.com', 'https://www.claude.ai', 'https://api.anthropic.com', 'https://console.anthropic.com', 'http://claude.ai', 'https://claude.ai.']) {
      await expect(api.requestOrigin(o), o).resolves.toBe(false);
    }
    expect(seen.request).toEqual([]);
  });

  it('requestOrigin asks for a portal at once, before anything is awaited, with its one pattern', async () => {
    for (const o of ['https://ondemand.grid.wayne.edu', 'https://claude.ai.example.edu', 'https://notclaude.ai', 'http://localhost', 'http://localhost:8080']) {
      seen.request = [];
      const p = api.requestOrigin(o);
      expect(seen.request, o).toEqual([{ origins: [`${o}/*`] }]);
      await expect(p).resolves.toBe(true);
    }
  });

  it('registerScript refuses an Anthropic origin without calling the browser', async () => {
    await expect(api.connectApi.registerScript('https://claude.ai')).rejects.toThrow(/Anthropic address/);
    await expect(api.connectApi.registerScript('https://api.anthropic.com')).rejects.toThrow(/Anthropic address/);
    expect(seen.register).toEqual([]);
    await api.connectApi.registerScript(PORTAL.origin);
    expect(seen.register).toHaveLength(1);
  });

  it('inject loads the page script only into a tab that is on the granted origin now', async () => {
    tabUrls.set(1, 'https://ondemand.grid.wayne.edu/pun/sys/dashboard');
    await api.connectApi.inject(1, PORTAL.origin);
    expect(seen.execute).toEqual([{ target: { tabId: 1 }, files: ['/content-scripts/portal.js'] }]);
    // the tab moved on to claude.ai (a toolbar click there gives activeTab, so its address shows), to
    // another site, or shows no address at all (no access there): nothing is loaded
    tabUrls.set(2, 'https://claude.ai/new');
    tabUrls.set(3, 'https://example.org/');
    tabUrls.set(4, undefined);
    for (const id of [2, 3, 4]) await expect(api.connectApi.inject(id, PORTAL.origin), String(id)).rejects.toThrow(/not on the portal/);
    await expect(api.connectApi.inject(2, 'https://claude.ai'), 'claude.ai itself').rejects.toThrow(/not on the portal/);
    expect(seen.execute).toHaveLength(1);
  });

  it('the clean-up at start asks the browser to remove nothing when nothing of the kind is held', async () => {
    held = ['https://ondemand.grid.wayne.edu/*'];
    await local.set({ [PORTAL_KEY]: PORTAL });
    registered = [{ id: 'beethoven-portal', matches: ['https://ondemand.grid.wayne.edu/*'] }];
    expect(await api.dropAnthropicLeftovers()).toEqual([]);
    expect(seen.getAll).toBe(1);
    expect(seen.remove).toEqual([]);
    expect(seen.unregister).toBe(0);
    expect(local.map.get(PORTAL_KEY)).toEqual(PORTAL);
    expect(held).toEqual(['https://ondemand.grid.wayne.edu/*']);
    // and on a fresh profile with nothing at all
    held = [];
    local.map.clear();
    registered = [];
    expect(await api.dropAnthropicLeftovers()).toEqual([]);
    expect(seen.remove).toEqual([]);
  });

  it('the clean-up removes a grant 9.0.0 obtained on an Anthropic address, keeping the portal', async () => {
    held = ['https://ondemand.grid.wayne.edu/*', 'https://claude.ai/*', 'https://www.claude.com/*'];
    expect(await api.dropAnthropicLeftovers()).toEqual(['https://claude.ai/*', 'https://www.claude.com/*']);
    expect(seen.remove).toEqual([{ origins: ['https://claude.ai/*', 'https://www.claude.com/*'] }]);
    expect(held).toEqual(['https://ondemand.grid.wayne.edu/*']);
  });

  it('a stored setting naming an Anthropic address is never the portal, and the clean-up removes it with any page script', async () => {
    const bad: PortalSettings = { origin: 'https://claude.ai', hostname: 'claude.ai', connected_at: 'x', shell_host: 'default', site: 'claude' };
    await local.set({ [PORTAL_KEY]: bad });
    expect(await storage.portalSettings()).toBeUndefined();
    registered = [{ id: 'beethoven-portal', matches: ['https://claude.ai/*'] }];
    await api.dropAnthropicLeftovers();
    expect(local.map.has(PORTAL_KEY)).toBe(false);
    expect(registered).toEqual([]);
    await local.set({ [PORTAL_KEY]: PORTAL });
    expect(await storage.portalSettings()).toEqual(PORTAL);
  });
});

// 11.0.0: the welcome page's one press (ext/gesture.ts). Both calls go out inside the click, in the same
// turn, before anything is awaited (a gesture survives no await): the panel for the window, and the one
// origin. An Anthropic address opens nothing and asks for nothing.
describe('ext/gesture.ts', () => {
  it('"Agree and continue" opens the panel for the window and asks for the one origin, both before anything is awaited', async () => {
    const g = gesture.agreeGesture({ windowId: 12, origin: PORTAL.origin });
    expect(seen.order).toEqual(['sidePanel.open 12', 'permissions.request']);
    expect(seen.request).toEqual([{ origins: [`${PORTAL.origin}/*`] }]);
    await expect(g.panel).resolves.toBe(true);
    await expect(g.granted).resolves.toBe(true);
    expect(gesture.hasPanel()).toBe(true);
  });

  it('an Anthropic address opens no panel and asks the browser for nothing', async () => {
    for (const o of ['https://claude.ai', 'https://api.anthropic.com', 'https://www.claude.com']) {
      const g = gesture.agreeGesture({ windowId: 12, origin: o });
      await expect(g.panel, o).resolves.toBe(false);
      await expect(g.granted, o).resolves.toBe(false);
    }
    expect(seen.order).toEqual([]);
    expect(seen.request).toEqual([]);
  });

  it('"Use this portal" asks for the origin alone, in the same turn', () => {
    void gesture.portalGesture('https://ood.example.edu');
    expect(seen.request).toEqual([{ origins: ['https://ood.example.edu/*'] }]);
    expect(seen.order).toEqual(['permissions.request']);
  });
});
