// 24.0.0: core/workers.ts, the pure part of Your workers: which folders of the state directory are runs, what a worker's
// status.json says of it, and whether this browser can show it.
import { describe, expect, it } from 'vitest';
import type { StatusFile } from '../src/core/contract';
import { accountOf, accountsOf, offerOf, runFolders, showable, workerSeen, WORKERS_MAX } from '../src/core/workers';

const LINK = 'https://claude.ai/code?environment=env_01AbCdEf';
const SESSION = 'https://claude.ai/code/session_01AbCdEf';

describe('the run folders', () => {
  it('takes worker-named folders only, in name order, no hidden or shared folder and no file', () => {
    const e = (name: string, type = 'd') => ({ name, type });
    expect(runFolders([e('worker'), e('account2'), e('.accounts'), e('workspaces'), e('notes.txt', 'f'), e('bad name'), e('log')])).toEqual(['account2', 'worker']);
  });
  it('stops at WORKERS_MAX', () => {
    expect(runFolders(Array.from({ length: 40 }, (_, i) => ({ name: `w${String(i).padStart(2, '0')}`, type: 'd' })))).toHaveLength(WORKERS_MAX);
  });
});

describe('a worker as its status file says', () => {
  const st = (o: Partial<StatusFile>): StatusFile => ({ state: 'online', ...o });
  it('is no worker without a status file', () => {
    expect(workerSeen('w', undefined)).toBeUndefined();
  });
  it('carries its link only while online, either form, and its account lower-cased', () => {
    expect(workerSeen('w', st({ environment_url: LINK, claude_login: { loggedIn: true, email: 'A@X.edu' } }))).toEqual({ name: 'w', state: 'online', link: LINK, account: 'a@x.edu' });
    expect(workerSeen('w', st({ session_url: SESSION, environment_url: LINK }))?.link).toBe(SESSION);
    expect(workerSeen('w', st({ state: 'queued', environment_url: LINK }))).toEqual({ name: 'w', state: 'queued' });
    expect(workerSeen('w', st({ environment_url: 'https://example.com/' }))?.link).toBeUndefined();
  });
  it('names no account when Claude Code says it is signed out, or reports no address', () => {
    expect(workerSeen('w', st({ claude_login: { loggedIn: false, email: 'a@x.edu' } }))?.account).toBeUndefined();
    expect(accountOf('not an address')).toBeUndefined();
    expect(accountOf(42)).toBeUndefined();
  });
});

describe('where a worker opens', () => {
  const on = (account?: string) => ({ name: 'w', state: 'online' as const, link: LINK, ...(account ? { account } : {}) });
  it('here while no account is named for this browser, or the worker is on that one', () => {
    expect(offerOf(on('a@x.edu'), undefined)).toBe('show');
    expect(offerOf(on('a@x.edu'), 'a@x.edu')).toBe('show');
    expect(offerOf(on(), 'a@x.edu')).toBe('show');
  });
  it('in another profile when it runs on another account', () => {
    expect(offerOf(on('b@x.edu'), 'a@x.edu')).toBe('elsewhere');
  });
  it('nowhere until it is online with a link', () => {
    expect(offerOf({ name: 'w', state: 'starting' }, undefined)).toBe('none');
  });
  it('a press names only a worker offered here', () => {
    const list = { checked_at: '', workers: [on('a@x.edu'), { ...on('b@x.edu'), name: 'x' }] };
    expect(showable(list, 'w', 'a@x.edu')?.link).toBe(LINK);
    expect(showable(list, 'x', 'a@x.edu')).toBeUndefined();
    expect(showable(list, 'nobody', undefined)).toBeUndefined();
    expect(accountsOf(list)).toEqual(['a@x.edu', 'b@x.edu']);
  });
});
