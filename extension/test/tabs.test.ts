// The rules for the tabs Beethoven opens (AM7): closed only if Beethoven opened or navigated it, only
// while it is still where Beethoven left it (the grid sign-in tab on the portal's origin, the terminal
// tab on the Shell page, Anthropic's tab with no new load since the paste), never as the window's last
// tab (a New Tab first); claude.ai's tab never closed, and brought forward only while it has had no new
// load since Beethoven's own. Loads are counted from tabs.onUpdated status events (no "tabs" permission).
import { describe, expect, it } from 'vitest';
import type { AnthropicTab, OpenedTab } from '../src/core/keys';
import { closeDecision, noteLoad, sessionTabDecision, stillWhereLeft } from '../src/core/tabs';

const PORTAL = 'https://ondemand.grid.wayne.edu';
const signin: OpenedTab = { tabId: 7, windowId: 1, url: `${PORTAL}/pun/sys/dashboard/`, opened_at: 'x', purpose: 'welcome' };
const terminal: OpenedTab = { tabId: 8, windowId: 1, url: `${PORTAL}/pun/sys/shell/ssh/default`, opened_at: 'x', purpose: 'terminal' };
const anthropic: AnthropicTab = { tabId: 9, windowId: 1, url: 'https://claude.ai', opened_at: 'x', purpose: 'anthropic' };
const claude: OpenedTab = { tabId: 10, windowId: 1, url: 'https://claude.ai/code', opened_at: 'x', purpose: 'session' };

describe('closing a tab Beethoven opened', () => {
  it('the grid sign-in tab: only while it is still on the portal\'s origin; a moved tab is left alone', () => {
    expect(closeDecision(signin, { id: 7, windowId: 1, url: `${PORTAL}/pun/sys/dashboard/` }, 3)).toBe('close');
    expect(closeDecision(signin, { id: 7, windowId: 1, url: `${PORTAL}/pun/sys/files/fs/home` }, 3)).toBe('close');
    // the student went elsewhere in that tab: its address is not visible off the granted origin
    expect(closeDecision(signin, { id: 7, windowId: 1 }, 3)).toBe('leave');
    expect(closeDecision(signin, { id: 7, windowId: 1, url: 'https://mail.wayne.edu/' }, 3)).toBe('leave');
    expect(closeDecision({ ...signin, purpose: 'press' }, { id: 7, windowId: 1, url: PORTAL + '/' }, 2)).toBe('close');
  });

  it('never the window\'s last tab: a New Tab first', () => {
    expect(closeDecision(signin, { id: 7, windowId: 1, url: `${PORTAL}/pun/sys/dashboard/` }, 1)).toBe('open-new-then-close');
  });

  it('a tab that is gone, another tab, or no record: nothing is closed', () => {
    expect(closeDecision(signin, undefined, 3)).toBe('leave');
    expect(closeDecision(signin, { id: 99, windowId: 1, url: `${PORTAL}/` }, 3)).toBe('leave');
    expect(closeDecision(undefined, { id: 7, windowId: 1, url: `${PORTAL}/` }, 3)).toBe('leave');
  });

  it('the grid terminal tab: only while it is still on the Shell page', () => {
    expect(closeDecision(terminal, { id: 8, windowId: 1, url: `${PORTAL}/pun/sys/shell/ssh/default` }, 2)).toBe('close');
    expect(closeDecision(terminal, { id: 8, windowId: 1, url: `${PORTAL}/pun/sys/shell/ssh/default/` }, 2)).toBe('close');
    expect(closeDecision(terminal, { id: 8, windowId: 1, url: `${PORTAL}/pun/sys/dashboard/` }, 2)).toBe('leave');
  });

  it("Anthropic's tab: only after the paste and with no new load since; its address is never seen", () => {
    const now = { id: 9, windowId: 1 };
    expect(closeDecision(anthropic, now, 2)).toBe('leave');
    expect(closeDecision({ ...anthropic, pasted_at: 'x', loads_since_paste: 0 }, now, 2)).toBe('close');
    expect(closeDecision({ ...anthropic, pasted_at: 'x', loads_since_paste: 1 }, now, 2)).toBe('leave');
    expect(closeDecision({ ...anthropic, pasted_at: 'x', loads_since_paste: 0 }, now, 1)).toBe('open-new-then-close');
  });

  it("claude.ai's tab is never closed", () => {
    expect(stillWhereLeft(claude, { id: 10, windowId: 1 })).toBe(false);
    expect(closeDecision(claude, { id: 10, windowId: 1 }, 5)).toBe('leave');
  });
});

describe('counting loads, and bringing claude.ai forward', () => {
  it('the first "complete" is Beethoven\'s own load; each "loading" after it is a new load, and after the paste a load since the paste', () => {
    let t: AnthropicTab = { ...anthropic };
    t = noteLoad(t, 'loading');
    expect(t.loaded).toBeUndefined();
    t = noteLoad(t, 'complete');
    expect(t.loaded).toBe(true);
    t = noteLoad(t, 'loading');
    expect(t.loads_after).toBe(1);
    expect(t.loads_since_paste).toBeUndefined();
    t = { ...t, pasted_at: 'x', loads_since_paste: 0 };
    t = noteLoad(noteLoad(t, 'complete'), 'loading');
    expect(t.loads_since_paste).toBe(1);
    expect(noteLoad(t, undefined)).toBe(t);
  });

  it('"Open my session" focuses the remembered tab only while it has had no new load since Beethoven\'s; never opens two', () => {
    expect(sessionTabDecision(undefined, false)).toBe('open');
    expect(sessionTabDecision(claude, false)).toBe('open');
    expect(sessionTabDecision(claude, true)).toBe('focus');
    expect(sessionTabDecision({ ...claude, loaded: true, loads_after: 0 }, true)).toBe('focus');
    expect(sessionTabDecision({ ...claude, loaded: true, loads_after: 1 }, true)).toBe('open');
    expect(sessionTabDecision({ ...signin }, true)).toBe('open');
  });
});
