// The background itself (src/entrypoints/background.ts), run whole under Node against a fake Chrome
// and a fake portal (test/fakebrowser.ts), on the 11.0.0 way (Settings: GlobalProtect only): the defects the 11.0.0 review found by running it, each
// checked here so they cannot come back. One Connect press types one connect line even when the panel's
// tick carries the same press meanwhile; a welcome tab the student has used for something else is never
// taken over; the run record keeps what only the Connect knows, so "You're online." and claude.ai's tab
// come once; the background's own scheduler question never takes a Stop's turn; the grant taken away
// reads as itself, not as a VPN problem; nothing reaches the network before the agreement; and a sign-in
// the background lost says so.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXT, install, openPort, ORIGIN, send, sleep, STATE, type World } from './fakebrowser';

const INSTALL = '0123456789abcdef0123456789abcdef';
const LINK = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';

async function boot(world: World, o: { terms?: boolean; ready?: boolean; firstRun?: boolean; connection?: 'direct' | 'vpn'; channel?: 'direct' | 'tab' } = {}) {
  const terms = await import('../src/core/terms');
  const disclosure = await import('../src/core/disclosure');
  const audit = await import('../src/core/audit');
  // the scheduler's floor shortened for the test (it is the same module instance the background uses)
  audit.FLOORS_MS.scheduler = 1_500;
  audit.FLOORS_MS.shell = 300;
  const now = new Date().toISOString();
  world.storage.local['bridge.install_id'] = INSTALL;
  // these tests run the 11.0.0 way (GlobalProtect and the portal), which 12.0.0 keeps for "GlobalProtect only";
  // test/background12.test.ts runs the direct way
  world.storage.local['bridge.prefs'] = { connection: o.connection ?? 'vpn' };
  if (o.terms !== false) {
    world.storage.local['bridge.terms'] = await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '11.0.0', host: 'Chrome 153', installId: INSTALL });
  }
  if (o.ready !== false) {
    Object.assign(world.storage.local, {
      'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
      'bridge.access': { v: 1, access_id: 'st1234', portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
      'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
      'bridge.channel': { origin: ORIGIN, mode: o.channel ?? 'direct', shell: 'ok', tested_at: now },
      ...(o.firstRun ? {} : { 'bridge.once': { first_online_at: now } }),
    });
  }
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
}

let world: World;
beforeEach(() => {
  vi.resetModules();
  world = install();
});
afterEach(() => {
  for (const s of [...world.sockets]) s.close(1000);
});

describe('the background, run whole', () => {
  it('one Connect press types one connect line, even when the tick carries the same press meanwhile', async () => {
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(1_500);
    world.opts.dashboardDelayMs = 400;
    world.opts.shellPageDelayMs = 800;
    const pressed = send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(150);
    panel.tick();
    await pressed;
    const ticker = setInterval(() => panel.tick(), 500);
    await sleep(6_000);
    clearInterval(ticker);
    expect(world.connectLines).toHaveLength(1);
    expect(world.log.filter((l) => /tabs\.create .*claude\.ai\/oauth/.test(l))).toHaveLength(1);
  }, 30_000);

  it('the run record keeps the Connect (pressed), so "You\'re online." and claude.ai\'s tab come once', async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const run = world.storage.session['bridge.run'] as { pressed?: boolean; started_by?: string; job?: string };
    expect(run).toMatchObject({ job: '40501234', pressed: true, started_by: 'connect' });
    // the worker comes online: the files say so
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: new Date().toISOString(), online_at: new Date().toISOString(), updated_at: new Date().toISOString(), environment_url: LINK }));
    await sleep(8_000);
    clearInterval(ticker);
    const opened = world.log.filter((l) => l.includes(`tabs.create`) && l.includes('claude.ai/code?environment'));
    if (opened.length !== 1) console.log(JSON.stringify(world.storage.session['bridge.run'], null, 1), world.log.slice(-40).join('\n'));
    expect(opened).toHaveLength(1);
    expect(world.storage.local['bridge.once']).toMatchObject({ first_online_at: expect.any(String) });
  }, 40_000);

  // 14.0.0: framework 13 wrote a worker that resumed an earlier session as online with both links empty (2026-10-03);
  // on this way rc.log is read, and Claude Code's own line there carries the session's link
  it("framework 13's file of a resumed session (online, both links empty): the session link from rc.log, online, and its tab once", async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const SES = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    const at = new Date().toISOString();
    world.fs.set(`${STATE}/worker/rc.log`, `\x1b[2J\x1b[HResuming session session_01N4R9mLRJ5wFbf1oaDe5pyj (43m ago)\r\n·✔︎· Connected · phone · HEAD\r\n    Single session · exits when complete\r\nContinue coding in the Claude mobile app or ${SES}\r\n`);
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, resumed: true, session_url: '', environment_url: '', environment_id: '' }));
    // two listings, 5 s apart while it starts: the first takes the online file, the second reads rc.log for its link
    await sleep(13_000);
    clearInterval(ticker);
    const run = world.storage.session['bridge.run'] as { registration?: { session_url?: string } };
    expect(run.registration?.session_url).toBe(SES);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(SES))).toHaveLength(1);
    const h = panel.last()?.view;
    expect(JSON.stringify(h)).toContain(SES);
    expect(JSON.stringify(h)).not.toContain('Connecting to Claude');
    // the session's own link alone: no New session, and the action opens nothing
    expect(JSON.stringify(h)).not.toContain('"kind":"new-session"');
    expect(await send(world, { type: 'action', action: { kind: 'new-session' } })).toMatchObject({ ok: true, value: { opened: false } });
  }, 40_000);

  // 14.0.0: framework 14 writes the link printed last as session_url and the environment link as environment_url; a worker that
  // printed both opens its session first, and New session (offered whichever link is the run's own) opens the environment link
  it('a worker that printed both links: its session tab opens with the session link, and New session opens the environment link', async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const SES = 'https://claude.ai/code/session_01N4R9mLRJ5wFbf1oaDe5pyj';
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    const at = new Date().toISOString();
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, resumed: true, session_url: SES, environment_url: LINK, environment_id: 'env_01XzAN32jsbL8W1PAFSvitBt' }));
    await sleep(8_000);
    clearInterval(ticker);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(SES))).toHaveLength(1);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(0);
    const h = JSON.stringify(panel.last()?.view);
    expect(h).toContain(SES);
    expect(h).toContain('"kind":"new-session"');
    expect(await send(world, { type: 'action', action: { kind: 'new-session' } })).toMatchObject({ ok: true, value: { opened: true } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(1);
  }, 40_000);

  // 21.0.0: a project named in Settings: the tab opened when the worker the student started comes online is the project's
  // page, once, never the worker's own link; Open my project brings that tab forward; New session still opens the environment link
  it("a project named in Settings: its page opens when the worker is ready, once; Open my project brings it forward; New session keeps the worker's link", async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const PROJECT = 'https://claude.ai/code/project/chan_01HxQ7mK2pT9vR4sW8nL3bYc';
    const stored = () => (world.storage.local['bridge.prefs'] as { project_url?: string } | undefined)?.project_url;
    // a session's or environment link is refused and nothing is kept; the address pasted with a thread open is kept in its one form
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { project_url: LINK } } })).toMatchObject({ ok: true, value: { saved: false } });
    expect(stored()).toBeUndefined();
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { project_url: `  ${PROJECT}?thread=cmsg_01JV1B5DpVW16Xd9rDo7wKF5 ` } } })).toMatchObject({ ok: true, value: { saved: true } });
    expect(stored()).toBe(PROJECT);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    const at = new Date().toISOString();
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, environment_url: LINK, environment_id: 'env_01XzAN32jsbL8W1PAFSvitBt' }));
    await sleep(8_000);
    clearInterval(ticker);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(PROJECT))).toHaveLength(1);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(0);
    const h = JSON.stringify(panel.last()?.view);
    expect(h).toContain('"kind":"open-project"');
    expect(h).toContain('Work locally');
    expect(h).toContain('"kind":"new-session"');
    expect(h).toContain(LINK);
    // Open my project: the tab Beethoven opened, brought forward; no second tab
    expect(await send(world, { type: 'action', action: { kind: 'open-project' } })).toMatchObject({ ok: true, value: { focused: true, opened: false } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(PROJECT))).toHaveLength(1);
    // New session: the worker's own environment link, as before
    expect(await send(world, { type: 'action', action: { kind: 'new-session' } })).toMatchObject({ ok: true, value: { opened: true } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(1);
    // Open my session asks for the worker's link; New session recorded no tab, so it opens one of its own
    expect(await send(world, { type: 'action', action: { kind: 'open-session' } })).toMatchObject({ ok: true, value: { focused: false, opened: true } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(2);
    // each address keeps its own tab: Open my project brings the project's tab forward again, Open my session the session's
    expect(await send(world, { type: 'action', action: { kind: 'open-project' } })).toMatchObject({ ok: true, value: { focused: true, opened: false } });
    expect(await send(world, { type: 'action', action: { kind: 'open-session' } })).toMatchObject({ ok: true, value: { focused: true, opened: false } });
    expect(world.log.filter((l) => l.includes('tabs.create') && (l.includes(PROJECT) || l.includes(LINK)))).toHaveLength(3);
    // the project card's x is kept with the other one-time notes
    expect(await send(world, { type: 'action', action: { kind: 'dismiss', card: 'project-tip' } })).toMatchObject({ ok: true, value: { recorded: true } });
    expect(world.storage.local['bridge.once']).toMatchObject({ project_card_dismissed_at: expect.any(String) });
    // Clear: an empty address forgets the project
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { project_url: '' } } })).toMatchObject({ ok: true, value: { saved: true } });
    expect(stored()).toBeUndefined();
    expect(await send(world, { type: 'action', action: { kind: 'open-project' } })).toMatchObject({ ok: true, value: { focused: false, opened: false } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(PROJECT))).toHaveLength(1);
  }, 40_000);

  // 24.0.0: Your workers: every worker's status file is read on the panel's tick; Show moves the Claude tab Beethoven opened
  // to another worker on the same account, and a worker on another account than Settings names is not shown here
  it('24.0.0: Your workers lists every worker; Show moves the Claude tab to one on this account and never to one on another', async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const at = new Date().toISOString();
    const login = (email: string) => ({ loggedIn: true, email, subscriptionType: 'max', checked_at: at });
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, environment_url: LINK, environment_id: 'env_01XzAN32jsbL8W1PAFSvitBt', claude_login: login('Student@Wayne.edu') }));
    const OTHER = 'https://claude.ai/code?environment=env_01OtherWorkerOnSameAcct';
    const AWAY = 'https://claude.ai/code?environment=env_01WorkerOnAnotherAccount';
    for (const [name, link, email] of [['second', OTHER, 'student@wayne.edu'], ['account2', AWAY, 'second@example.com']] as const) {
      world.dirs.add(`${STATE}/${name}`);
      world.fs.set(`${STATE}/${name}/status.json`, JSON.stringify({ version: 1, run: name, job: '900', state: 'online', updated_at: at, environment_url: link, claude_login: login(email) }));
    }
    world.dirs.add(`${STATE}/workspaces`);
    await sleep(8_000);
    // Your workers opened reads every worker's file again, at most once in five seconds
    const count = () => (world.storage.session['bridge.workers'] as { workers?: unknown[] } | undefined)?.workers?.length ?? 0;
    for (let i = 0; i < 12 && count() < 3; i++) {
      await send(world, { type: 'action', action: { kind: 'workers-fold', open: true } });
      await sleep(1_000);
    }
    // the tab opened when the worker came online is the one Show moves
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(1);
    const listed = world.storage.session['bridge.workers'] as { workers: Array<{ name: string; account?: string }> };
    expect(listed.workers.map((w) => [w.name, w.account])).toEqual([['account2', 'second@example.com'], ['second', 'student@wayne.edu'], ['worker', 'student@wayne.edu']]);
    let h = JSON.stringify(panel.last()?.view);
    expect(h).toContain('"kind":"show-worker","name":"second"');
    expect(await send(world, { type: 'action', action: { kind: 'show-worker', name: 'second' } })).toMatchObject({ ok: true, value: { moved: true, opened: false } });
    expect(world.log.filter((l) => l.includes('tabs.update') && l.includes(`-> ${OTHER}`))).toHaveLength(1);
    // and back: the same tab again, still no second tab
    expect(await send(world, { type: 'action', action: { kind: 'show-worker', name: 'worker' } })).toMatchObject({ ok: true, value: { moved: true, opened: false } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes('claude.ai/code'))).toHaveLength(1);
    // Settings names this browser's account: the worker on the other one is not shown here, and the home says where it opens
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { claude_account: 'not an address' } } })).toMatchObject({ ok: true, value: { saved: false } });
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { claude_account: ' Student@Wayne.edu ' } } })).toMatchObject({ ok: true, value: { saved: true } });
    expect((world.storage.local['bridge.prefs'] as { claude_account?: string }).claude_account).toBe('student@wayne.edu');
    expect(await send(world, { type: 'action', action: { kind: 'show-worker', name: 'account2' } })).toMatchObject({ ok: true, value: { moved: false, opened: false } });
    expect(world.log.filter((l) => l.includes(AWAY))).toHaveLength(0);
    await sleep(1_000);
    h = JSON.stringify(panel.last()?.view);
    expect(h).toContain('Open it in the Chrome profile signed in to claude.ai as second@example.com');
    expect(h).not.toContain('"kind":"show-worker","name":"account2"');
    clearInterval(ticker);
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { claude_account: '' } } })).toMatchObject({ ok: true, value: { saved: true } });
    expect((world.storage.local['bridge.prefs'] as { claude_account?: string }).claude_account).toBeUndefined();
  }, 40_000);

  it("21.0.0: the project's tab Beethoven opened before the worker was ready is brought forward when the worker is ready, never a second one", async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const PROJECT = 'https://claude.ai/code/project/chan_01HxQ7mK2pT9vR4sW8nL3bYc';
    const created = () => world.log.filter((l) => l.includes('tabs.create') && l.includes(PROJECT)).length;
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { project_url: PROJECT } } })).toMatchObject({ ok: true, value: { saved: true } });
    expect(await send(world, { type: 'action', action: { kind: 'open-project' } })).toMatchObject({ ok: true, value: { focused: false, opened: true } });
    expect(created()).toBe(1);
    const tab = (world.storage.session['bridge.projectTab'] as { tabId: number }).tabId;
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    const at = new Date().toISOString();
    const before = world.log.length;
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, environment_url: LINK, environment_id: 'env_01XzAN32jsbL8W1PAFSvitBt' }));
    await sleep(8_000);
    clearInterval(ticker);
    expect(created()).toBe(1);
    expect(world.log.slice(before).some((l) => l.endsWith(`tabs.update #${tab} active`))).toBe(true);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(LINK))).toHaveLength(0);
  }, 40_000);

  it('21.0.0: a project named with "Open Claude when my worker is ready" off: nothing opens when the worker is ready; Open my project opens it on request', async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(800);
    const PROJECT = 'https://claude.ai/code/project/chan_01HxQ7mK2pT9vR4sW8nL3bYc';
    expect(await send(world, { type: 'action', action: { kind: 'set-pref', prefs: { open_claude_on_connect: false, project_url: PROJECT } } })).toMatchObject({ ok: true, value: { saved: true } });
    const ticker = setInterval(() => panel.tick(), 250);
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const sj = `${STATE}/worker/status.json`;
    const prev = JSON.parse(world.fs.get(sj)!);
    const at = new Date().toISOString();
    world.fs.set(sj, JSON.stringify({ ...prev, state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, environment_url: LINK, environment_id: 'env_01XzAN32jsbL8W1PAFSvitBt' }));
    await sleep(8_000);
    clearInterval(ticker);
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes('claude.ai/code'))).toHaveLength(0);
    expect(JSON.stringify(panel.last()?.view)).toContain('"kind":"open-project"');
    expect(await send(world, { type: 'action', action: { kind: 'open-project' } })).toMatchObject({ ok: true, value: { focused: false, opened: true } });
    expect(world.log.filter((l) => l.includes('tabs.create') && l.includes(PROJECT))).toHaveLength(1);
  }, 40_000);

  it("the scheduler's reason is never asked while a Stop waits: the Stop goes first", async () => {
    await boot(world);
    world.opts.claudeSignedIn = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await sleep(2_500);
    const before = world.shellLines.length;
    const stopping = send(world, { type: 'action', action: { kind: 'stop' } });
    const ticker = setInterval(() => panel.tick(), 200);
    await stopping;
    clearInterval(ticker);
    const after = world.shellLines.slice(before).map((l) => l.line);
    const stopAt = after.findIndex((l) => /worker stop/.test(l));
    expect(stopAt).toBeGreaterThanOrEqual(0);
    expect(after.slice(0, stopAt).some((l) => /worker status/.test(l))).toBe(false);
  }, 30_000);

  it('a welcome tab the student has since used for something else is never navigated or closed', async () => {
    // 19.0.0: the sign-in tab is the path of a browser without webRequest (the Firefox build); where the browser
    // can answer the grid's sign-in, no tab opens at all (background19.test.ts)
    world = install({ webRequest: false });
    await boot(world, { terms: false, ready: false, firstRun: true });
    world.opts.reach = false;
    world.opts.signedIn = false;
    const welcome = world.openTab(`${EXT}/options.html`, 1, true);
    const page = openPort(world, 'welcome', { tabId: welcome.id });
    const terms = await import('../src/core/terms');
    await world.chrome.storage.local.set({ 'bridge.terms': await terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '11.0.0', host: 'Chrome 153', installId: INSTALL }) });
    const panel = openPort(world, 'panel');
    await send(world, { type: 'action', action: { kind: 'agree', origin: ORIGIN, granted: true, panelOpened: true, tabId: welcome.id, windowId: 1 } });
    const ticker = setInterval(() => panel.tick(), 1_000);
    await sleep(1_500);
    // the student uses the welcome tab to look GlobalProtect up: the welcome page is gone from it
    world.navigate(welcome.id, 'https://www.google.com/search?q=wayne+globalprotect');
    page.close();
    world.opts.reach = true;
    await sleep(5_000);
    clearInterval(ticker);
    expect(world.tabs.get(welcome.id)?.url).toBe('https://www.google.com/search?q=wayne+globalprotect');
    expect(world.log.some((l) => l.includes(`tabs.update #${welcome.id} url`) && l.includes('google'))).toBe(false);
    // the sign-in opened in a tab of its own
    expect(world.log.some((l) => /tabs\.create .*pun\/sys\/dashboard/.test(l))).toBe(true);
  }, 30_000);

  it('the grant taken away after the first run reads as itself, with "Allow again", not as a VPN problem', async () => {
    await boot(world);
    world.granted.clear();
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(2_000);
    const v = panel.last();
    expect(v?.view?.kind).toBe('journey');
    expect(v?.view?.journey).toMatchObject({ moment: 'welcome', state: 'revoked', button: { label: 'Allow again' } });
  }, 20_000);

  it('before the agreement, no action reaches the network or opens a tab', async () => {
    await boot(world, { terms: false, ready: false, firstRun: true });
    world.storage.local['bridge.portal'] = { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: new Date().toISOString(), shell_host: 'default', site: 'wayne' };
    openPort(world, 'panel');
    for (const a of [{ kind: 'sign-in-grid', windowId: 1 }, { kind: 'retry-grid' }, { kind: 'connect' }, { kind: 'stop' }, { kind: 'open-files' }, { kind: 'run-checks' }, { kind: 'check-compute-node' }, { kind: 'restrict', workerName: 'worker' }]) {
      await send(world, { type: 'action', action: a });
    }
    await sleep(1_000);
    expect(world.log.filter((l) => /fetch|ws open|tabs\.create|tabs\.update|EXTERNAL/.test(l))).toEqual([]);
  }, 20_000);

  it('a sign-in the background lost (stopped mid-sitting) says so, with Sign in again', async () => {
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await send(world, { type: 'action', action: { kind: 'connect' } });
    for (let i = 0; i < 4; i++) {
      await sleep(700);
      panel.tick();
    }
    expect(panel.last()?.view?.journey?.moment).toBe('claude');
    // the service worker stops: its listeners and memory go, its sockets close
    for (const k of ['onMessage', 'onConnect', 'onInstalled', 'onStartup']) world.chrome.runtime[k].ls.length = 0;
    for (const e of [world.chrome.storage.onChanged, world.chrome.alarms.onAlarm, world.chrome.tabs.onUpdated, world.chrome.tabs.onRemoved]) e.ls.length = 0;
    for (const s of [...world.sockets]) s.close(1006);
    vi.resetModules();
    const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
    bg.main();
    const again = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    for (let i = 0; i < 3; i++) {
      await sleep(600);
      again.tick();
    }
    expect(again.last()?.view?.journey).toMatchObject({ moment: 'claude', problem: { body: 'The sign-in stopped before it finished.', button: { label: 'Sign in again' } } });
  }, 30_000);

  // greg, 2026-10-04: no API key anywhere. A sign-in link that is not a Claude subscription's (the Console's) is not
  // opened and its sitting is closed; the sentence holds the Claude moment only until the grid says otherwise
  it("a Console sign-in link: nothing opened, the plain sentence, and the worker coming online after all ends the moment", async () => {
    const { WORDS } = await import('../src/core/model');
    await boot(world);
    world.opts.authUrl = 'https://platform.claude.com/oauth/authorize?code=true&client_id=test&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback';
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await until(panel, () => panel.last()?.view?.journey?.problem?.body === WORDS.claude.subscriptionOnly);
    expect(panel.last()?.view?.journey).toMatchObject({ moment: 'claude', problem: { button: { label: 'Sign in again', action: { kind: 'sign-in-claude' } } } });
    expect(world.log.filter((l) => /tabs\.create/.test(l) && /claude\.(?:ai|com)|anthropic\.com/.test(l))).toEqual([]);
    // signed in on the grid another way, the worker comes online: the refusal no longer holds the panel
    const sj = `${STATE}/worker/status.json`;
    const at = new Date().toISOString();
    world.fs.set(sj, JSON.stringify({ ...JSON.parse(world.fs.get(sj)!), state: 'online', node: 'asx1', got_computer_at: at, online_at: at, updated_at: at, environment_url: LINK, claude_login: { loggedIn: true, email: 'st1234@wayne.edu', subscriptionType: 'max', checked_at: at } }));
    await until(panel, () => !JSON.stringify(panel.last()?.view).includes(WORDS.claude.subscriptionOnly), 15_000);
    expect(panel.last()?.view?.journey?.moment).not.toBe('claude');
  }, 40_000);

  // tab mode: Chrome fires a port's onDisconnect only on the far end, so a sitting closed from the background
  // (Sign in again, Cancel, a refused link) lowers "Working on the grid…" and closes its own portal tab itself
  it('tab mode: a sitting closed from here lowers "Working on the grid…" and closes its own tab (Sign in again, Cancel, a refused link)', async () => {
    const { WORDS } = await import('../src/core/model');
    await boot(world, { channel: 'tab' });
    world.opts.pageScript = true;
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(1_500);
    // each sitting opens a portal tab of its own (inactive) for its page script
    const sittingTabs = () => world.log.filter((l) => /tabs\.create #\d+ https:\/\/ondemand\.grid\.wayne\.edu\/pun\/sys\/dashboard\/ active=false/.test(l)).map((l) => Number(/#(\d+)/.exec(l)![1]));
    const portalTabs = () => [...world.tabs.values()].filter((t) => t.url.startsWith(`${ORIGIN}/`));
    const settled = () => !panel.last()?.view?.overlays?.workingInTab && portalTabs().length === 0;
    const links = () => world.log.filter((l) => /tabs\.(?:create|update) .*claude\.ai\/oauth/.test(l)).length;
    await send(world, { type: 'action', action: { kind: 'connect' } });
    await until(panel, () => links() === 1);
    // Sign in again: the waiting sitting gives way to a new one (after the scheduler's floor), then Cancel closes that one too
    await sleep(1_600);
    await send(world, { type: 'action', action: { kind: 'sign-in-claude' } });
    await until(panel, () => links() === 2);
    await send(world, { type: 'action', action: { kind: 'cancel' } });
    await until(panel, settled, 10_000);
    expect(sittingTabs()).toHaveLength(2);
    expect(world.log.filter((l) => /connect port disconnected by the extension/.test(l))).toHaveLength(2);
    for (const id of sittingTabs()) expect(world.log.some((l) => l.includes(`tabs.remove #${id} `))).toBe(true);
    // a refused link closes its sitting the same way
    world.opts.authUrl = 'https://console.anthropic.com/oauth/authorize?code=true&client_id=test';
    await sleep(1_600);
    await send(world, { type: 'action', action: { kind: 'sign-in-claude' } });
    await until(panel, () => panel.last()?.view?.journey?.problem?.body === WORDS.claude.subscriptionOnly);
    await until(panel, settled, 10_000);
    expect(sittingTabs()).toHaveLength(3);
    expect(world.log.filter((l) => /connect port disconnected by the extension/.test(l))).toHaveLength(3);
    expect(world.log.some((l) => l.includes(`tabs.remove #${sittingTabs()[2]} `))).toBe(true);
    expect(world.log.filter((l) => /tabs\.create/.test(l) && /console\.anthropic\.com|platform\.claude\.com/.test(l))).toEqual([]);
  }, 60_000);
});

async function until(panel: ReturnType<typeof openPort>, cond: () => boolean, ms = 20_000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out; last view ${JSON.stringify(panel.last())?.slice(0, 600)}\n${world.log.slice(-25).join('\n')}`);
    panel.tick();
    await sleep(150);
  }
}
