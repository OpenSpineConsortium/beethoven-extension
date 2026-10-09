// 19.0.0, "Beethoven signs in" (greg's card tap of 2026-10-09 03:01Z), through the real background against the
// fake Chrome: its webRequest.onAuthRequired answers the portal's HTTP Basic challenge to checkGrid's own
// dashboard request, and nothing else, with the password the student gave the sheet; a password the grid turns
// down is sent at most once; Forget, Disconnect and another portal leave nothing behind.
//
// The page (src/ext/gridSignin.ts) is not imported: this file does what it does, by hand. The record store is
// injected through install({ indexedDB: true }), which puts the fake IndexedDB on globalThis.indexedDB; the
// background's indexedDbRecords() (core/vault.ts) looks that up at each call, so a record this file seals with
// makePasskey (the fake authenticator) and sealPassword and puts with indexedDbRecords().put() is the one the
// background opens. The note goes in storage.local, the unlock and the one-shot in storage.session (before
// main(), as storage a browser session left; after it, through chrome.storage so storage.onChanged fires), and
// then the grid-signin action, which carries no secret.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_KEY, SIGNIN_NOPRF_KEY, SIGNIN_NOTE_KEY, SIGNIN_ONCE_KEY, SIGNIN_STATE_KEY, SIGNIN_UNLOCK_KEY, type SigninNote, type SigninState } from '../src/core/keys';
import { LOG_WORDS, WORDS } from '../src/core/model';
import { base64, indexedDbRecords, makePasskey, sealPassword, SIGNIN_DB, unbase64, unlockPasskey, VaultError } from '../src/core/vault';
import { fakeAuthenticator, type FakeAuthenticator } from './fakeauthenticator';
import { EXT, install, openPort, ORIGIN, send, sleep, type World } from './fakebrowser';

const INSTALL = '0123456789abcdef0123456789abcdef';
const USER = 'st1234';
const DASHBOARD = '/pun/sys/dashboard/';
const OTHER = 'https://ondemand.other.edu';

async function termsRecord() {
  const terms = await import('../src/core/terms');
  return terms.buildTermsRecord({ license: 'L', privacy: 'P', checked: { agree: true }, termsEndReached: false, openedInTab: false, savedCopy: false, printed: false, productVersion: '19.0.0', host: 'Chrome 156', installId: INSTALL });
}

/** a new service worker: the background's module afresh (memory empty, storage as it was), its main() */
async function startWorker(): Promise<void> {
  vi.resetModules();
  const audit = await import('../src/core/audit');
  audit.FLOORS_MS.scheduler = 1_500;
  audit.FLOORS_MS.shell = 300;
  const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
  bg.main();
  await sleep(50);
}

async function boot(world: World): Promise<void> {
  const disclosure = await import('../src/core/disclosure');
  const now = new Date().toISOString();
  Object.assign(world.storage.local, {
    'bridge.install_id': INSTALL,
    'bridge.terms': await termsRecord(),
    'bridge.portal': { origin: ORIGIN, hostname: 'ondemand.grid.wayne.edu', connected_at: now, shell_host: 'default', site: 'wayne' },
    'bridge.access': { v: 1, access_id: USER, portal: 'ondemand.grid.wayne.edu', approved: true, checked_at: now, last_attempt_at: now },
    'bridge.statements': { [disclosure.makeAcknowledgement('worker').work_dir]: disclosure.makeAcknowledgement('worker') },
    'bridge.channel': { origin: ORIGIN, mode: 'direct', shell: 'ok', tested_at: now },
    'bridge.once': { first_online_at: now },
  });
  await startWorker();
}

/** the worker stops (memory gone, storage kept), or the browser quits (storage.session and Chrome's sign-in cache gone too), and starts again */
async function restart(world: World, how: 'worker' | 'browser'): Promise<void> {
  if (how === 'worker') world.stopWorker();
  else world.restartBrowser();
  await startWorker();
}

/** a saved sign-in as the page makes it: a passkey, the password sealed with its PRF output, the record put where the background reads it */
interface Saved {
  fa: FakeAuthenticator;
  cred: string;
  prfSalt: string;
  /** base64 of the PRF output, as the page writes it into the unlock */
  prf: string;
  note: SigninNote;
}
async function seal(password: string): Promise<Saved> {
  const fa = fakeAuthenticator();
  const p = await makePasskey(fa, { origin: ORIGIN, username: USER });
  const savedAt = new Date().toISOString();
  await indexedDbRecords().put(await sealPassword(p.prf, { origin: ORIGIN, username: USER, cred: p.cred, prfSalt: p.prfSalt, password, savedAt }));
  const prf = base64(p.prf);
  p.prf.fill(0);
  return { fa, cred: p.cred, prfSalt: p.prfSalt, prf, note: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: p.cred } };
}

/** what the page left in storage before this worker started: the note, and the unlock when it was unlocked in this browser session */
function placed(world: World, s: Saved, o: { unlocked: boolean }): void {
  world.storage.local[SIGNIN_NOTE_KEY] = { ...s.note };
  if (o.unlocked) world.storage.session[SIGNIN_UNLOCK_KEY] = { prf: s.prf, cred: s.cred };
}

/** the page's unlock with the fake authenticator: one passkey prompt, then the unlock in storage.session */
async function unlock(world: World, s: Saved): Promise<void> {
  const prf = await unlockPasskey(s.fa, { cred: s.cred, prfSalt: s.prfSalt });
  await world.chrome.storage.session.set({ [SIGNIN_UNLOCK_KEY]: { prf: base64(prf), cred: s.cred } });
  prf.fill(0);
}

/** the sheet's Sign in without Remember: the one-shot in storage.session */
async function typed(world: World, password: string, at = new Date().toISOString()): Promise<void> {
  await world.chrome.storage.session.set({ [SIGNIN_ONCE_KEY]: { origin: ORIGIN, username: USER, password, at } });
}

let world: World;
/** every action's whole answer, for the planted-password check */
let results: unknown[];

async function act(action: unknown): Promise<any> {
  const r = (await send(world, { type: 'action', action })) as { ok: boolean; value?: unknown; error?: unknown };
  results.push(r);
  expect(r?.ok, JSON.stringify(r)).toBe(true);
  return r.value;
}

const count = (re: RegExp) => world.log.filter((l) => re.test(l)).length;
/** Beethoven's own answers with a password, as Chrome's log line names them */
const creds = () => count(/webRequest\.onAuthRequired #\d+ .* -> credentials$/);
const cancels = () => count(/webRequest\.onAuthRequired #\d+ .* -> cancel$/);
const tabsCreated = () => world.log.filter((l) => /tabs\.create /.test(l));
const note = () => world.storage.local[SIGNIN_NOTE_KEY] as SigninNote | undefined;
const state = () => world.storage.session[SIGNIN_STATE_KEY] as SigninState | undefined;
const gridWord = () => (world.storage.session['bridge.grid'] as { session?: string } | undefined)?.session;
const activityText = () => JSON.stringify(world.storage.session[ACTIVITY_KEY] ?? []);
const debugText = async (): Promise<string> => (await act({ kind: 'copy-debug-log' })).text;

/** a one-shot's time strictly after the refusal on record (the page stamps it at the press, never in the refusal's millisecond) */
const afterRefusal = () => new Date(Math.max(Date.now(), Date.parse(state()!.refused!.at) + 1)).toISOString();

async function until(cond: () => boolean | Promise<boolean>, ms = 5_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await cond()) return true;
    await sleep(50);
  }
  return cond();
}

/** the panel's view (PanelView) once it is the one wanted */
async function panelView(panel: ReturnType<typeof openPort>, want: (v: any) => boolean, ms = 5_000): Promise<any> {
  await until(() => {
    const v = panel.last()?.view;
    return !!v && want(v);
  }, ms);
  return panel.last()?.view;
}

/** a challenge raised while the next dashboard request of the worker is in flight (inside checkGrid's armed window), `afterMs` after it starts */
function duringNextWindow(afterMs: number, raise: () => Promise<string>): Promise<string> {
  return new Promise((resolve) => {
    world.onPortalRequest = (r) => {
      if (r.tabId !== -1 || new URL(r.url).pathname !== DASHBOARD) return;
      world.onPortalRequest = undefined;
      setTimeout(() => void raise().then(resolve), afterMs);
    };
  });
}

beforeEach(() => {
  results = [];
});
afterEach(() => {
  for (const s of [...world.sockets]) s.close(1000);
  // every event got exactly one callback, and nothing ever widened who may read storage.session (I3)
  expect(world.log.filter((l) => /answered twice|never answered|listener returned|listener threw/.test(l))).toEqual([]);
  expect(world.sessionAccessLevel).toBeUndefined();
});

describe('19.0.0: Beethoven signs in to the grid', () => {
  it('1. an unlocked saved sign-in signs a press in with no tab, one answer, and the press goes on', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.claudeSignedIn = true;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    const panel = openPort(world, 'panel');
    await act({ kind: 'connect' });
    const ticker = setInterval(() => panel.tick(), 500);
    await until(() => world.connectLines.length > 0, 10_000);
    await sleep(800);
    clearInterval(ticker);
    expect(tabsCreated()).toEqual([]);
    expect(world.boxes.size).toBe(0);
    expect(creds()).toBe(1);
    expect(cancels()).toBe(0);
    expect(world.badAnswers).toBe(0);
    expect(world.connectLines).toHaveLength(1);
    await until(() => !!note()?.proven_at);
    expect(note()).toMatchObject({ proven_at: expect.any(String), refusals: 0, realm: world.realm });
    expect(note()?.refused_at).toBeUndefined();
    expect(state()?.pending).toBeUndefined();
  }, 30_000);

  it('2. a wrong saved password is sent once; ticks, alarms, a worker restart, a browser restart and the unlock never send it again; typing the right one signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Wrong-saved-pw-1');
    placed(world, s, { unlocked: true });
    await boot(world);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    expect(cancels()).toBe(1);
    expect(world.badAnswers).toBe(1);
    expect(await until(() => !!note()?.refused_at)).toBe(true);
    expect(note()?.refusals).toBe(1);
    expect(await activityText()).toContain(LOG_WORDS.signinRefused);

    // the panel's checks and ticks, a retry, the alarms with no page open
    let panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    for (let i = 0; i < 3; i++) {
      panel.tick();
      await sleep(300);
    }
    await act({ kind: 'retry-grid' });
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (v) => !!v.signin)).signin.text).toBe(WORDS.settings.signinRefused);
    settings.close();
    panel.close();
    await world.fireAlarm('bridge.poll');
    expect(creds()).toBe(1);

    // a worker restart: the attempt state survives in storage.session
    await restart(world, 'worker');
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await world.fireAlarm('bridge.poll');
    expect(creds()).toBe(1);

    // a browser restart: the session's state and unlock are gone, the note keeps the refusal
    await restart(world, 'browser');
    await world.fireAlarm('bridge.poll');
    panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    // saved and locked, but turned down: no Unlock anywhere
    const home = await panelView(panel, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.kind).toBe('home');
    expect(home.home.rows.grid.link?.action).toEqual({ kind: 'sign-in-grid' });
    expect(home.overlays.unlock).toBeUndefined();
    expect(creds()).toBe(1);
    // the sheet, still locked: the password typed, never Windows Hello for a password the grid turned down
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const locked = await panelView(panel, (v) => v.journey?.moment === 'grid' && !!v.journey.sheet);
    expect(locked.journey.sheet).toMatchObject({ phase: 'type', saved: 'locked', note: WORDS.grid.refused });

    // the page's unlock (the fake authenticator) and grid-signin unlocked: still nothing sent
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await world.fireAlarm('bridge.poll');
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const sheet = await panelView(panel, (v) => v.journey?.moment === 'grid' && v.journey.sheet?.saved === 'ready' && v.journey.sheet.phase !== 'working');
    expect(sheet.journey.sheet).toMatchObject({ phase: 'type', note: WORDS.grid.refused, saved: 'ready', username: USER });
    expect(sheet.overlays.unlock).toBeUndefined();
    expect(tabsCreated()).toEqual([]);

    // the right password, typed: signs in
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(1);
    expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
  }, 60_000);

  it('3. a saved sign-in still locked: no answer and no tab; the grid moment is the locked phase, Overlays.unlock set', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: false });
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    const home = await panelView(panel, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.home.rows.grid.link).toMatchObject({ label: WORDS.home.unlock, action: { kind: 'unlock-grid' } });
    expect(home.overlays.unlock).toEqual({ unlockWith: 'Windows Hello' });
    const r = await act({ kind: 'connect' });
    expect(r).toMatchObject({ started: false, waiting: 'grid' });
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid');
    expect(v.journey.sheet).toMatchObject({ phase: 'locked', saved: 'locked', unlockWith: 'Windows Hello', username: USER });
    expect(v.journey.sheet.note).toBeUndefined();
    // a press waits on it: Not now drops the press
    expect(v.journey.sheet.later?.action).toEqual({ kind: 'cancel' });
    expect(v.journey.sheet.box.action).toEqual({ kind: 'sign-in-grid-box' });
    expect(v.overlays.unlock).toEqual({ unlockWith: 'Windows Hello' });
    expect(creds()).toBe(0);
    expect(tabsCreated()).toEqual([]);
    expect(world.boxes.size).toBe(0);
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (x) => !!x.signin)).signin).toMatchObject({ text: WORDS.settings.signinSaved(USER, 'Windows Hello'), username: USER, forget: { action: { kind: 'forget-grid-signin' } } });

    // a typed password turned down: every automatic sign-in stops (no Unlock is offered any more), but the
    // saved one was never tried, so Settings does not say it "didn't work last time"
    await typed(world, 'Wrong-typed-pw-3');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    const after = await panelView(panel, (x) => x.journey?.sheet?.note === WORDS.grid.refused);
    expect(after.overlays.unlock).toBeUndefined();
    expect(note()?.refused_at).toBeUndefined();
    await sleep(300);
    expect(settings.last()?.view.signin.text).toBe(WORDS.settings.signinSaved(USER, 'Windows Hello'));
  }, 30_000);

  it('4. challenges that are not the armed window\'s own never get the password: outside it, a second one inside it, a proxy, another realm, another origin, a tab', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);

    // outside any armed window
    expect(await world.realmChallenge(world.realm)).toBe('none');
    // a second request inside the window, after its own was answered
    const second = duringNextWindow(450, () => world.realmChallenge(world.realm));
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await second).toBe('none');
    expect(creds()).toBe(1);

    // inside the next window (Chrome's cache lets its own request in): a proxy, another realm, another origin
    world.grant(OTHER);
    const proxy = duringNextWindow(50, () => world.proxyChallenge());
    await act({ kind: 'grid-signin', how: 'unlocked' });
    const realm = duringNextWindow(50, () => world.realmChallenge('another-realm'));
    await act({ kind: 'grid-signin', how: 'unlocked' });
    const origin = duringNextWindow(50, () => world.originChallenge(OTHER));
    await act({ kind: 'grid-signin', how: 'unlocked' });
    expect([await proxy, await realm, await origin]).toEqual(['none', 'none', 'none']);

    // a tab of the student's own: Chrome's box, and nothing of its address in Beethoven's log
    const secret = '/pun/sys/dashboard/files/fs/home/st1234/thesis-draft-Q7';
    const tab = world.openTab(`${ORIGIN}${secret}`, 1, true);
    expect(await world.tabChallenge(tab.id, secret)).toBe('none');
    expect(world.log.some((l) => l.endsWith(`Chrome's sign-in box over tab #${tab.id}`))).toBe(true);

    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(0);
    const text = await debugText();
    expect(text).not.toContain('thesis-draft-Q7');
    for (const why of ['not-armed', 'armed-once', 'proxy', 'realm', 'origin']) expect(text, why).toContain(`(${why};`);
    // of a tab's sign-in request Beethoven keeps nothing, not even a line in its debug log (the texts say so)
    expect(text).not.toContain('(tab;');
    expect(text).not.toContain(', a tab');
  }, 30_000);

  it('4. a tab\'s challenge for the dashboard inside the armed window gets nothing and Chrome\'s box; the worker\'s own request is answered once', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    // a tab of the student's on the portal's front page (no sign-in asked there), then the dashboard in it
    const tab = world.openTab(`${ORIGIN}/`, 1, true);
    await sleep(100);
    const boxLines = () => world.log.filter((l) => l.endsWith(`Chrome's sign-in box over tab #${tab.id}`)).length;
    const before = boxLines();
    // 10 ms into the worker's own dashboard request: the window is armed and not yet answered
    const inWindow = duringNextWindow(10, () => world.tabChallenge(tab.id, DASHBOARD));
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await inWindow).toBe('none');
    expect(boxLines()).toBe(before + 1);
    expect(world.boxes.get(tab.id)?.url.endsWith(DASHBOARD)).toBe(true);
    // no answer with a password ever went to a tab; exactly one went to the worker's own dashboard request
    expect(world.authAnswers.filter((a) => a.tabId !== -1 && a.answer === 'credentials')).toEqual([]);
    const mine = world.authAnswers.filter((a) => a.answer === 'credentials');
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ tabId: -1, type: 'xmlhttprequest', path: DASHBOARD });
    expect(world.badAnswers).toBe(0);
  }, 30_000);

  it('4. two checks asked for at the same moment make one request, so one window and one answer', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    const from = world.log.length;
    void send(world, { type: 'panel.opened', windowId: 1 });
    void send(world, { type: 'panel.opened', windowId: 1 });
    // inside the first request's 300 ms: the second check found it in flight and made none of its own
    await sleep(200);
    expect(world.log.slice(from).filter((l) => /fetch GET \/pun\/sys\/dashboard\/$/.test(l))).toHaveLength(1);
    expect(await until(() => gridWord() === 'signed-in')).toBe(true);
    expect(creds()).toBe(1);
  }, 20_000);

  it('4. two challenges for the armed address raised in the same task, with a wrong saved password: one answer, one bad try', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal('Wrong-saved-pw-4'), { unlocked: true });
    await boot(world);
    world.holdChallenges();
    let second: Promise<string> | undefined;
    world.onPortalRequest = (r) => {
      if (r.tabId !== -1 || new URL(r.url).pathname !== DASHBOARD) return;
      world.onPortalRequest = undefined;
      // the window's own challenge is queued after the dashboard's delay; then a second one, and both go in one task
      setTimeout(() => {
        second = world.realmChallenge(world.realm);
        world.releaseChallenges();
      }, world.opts.dashboardDelayMs + 150);
    };
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(await second).toBe('none');
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
  }, 30_000);

  it('5. a planted password appears nowhere: storage.local, the logs, Details, the audit export, the activity log, a view or an action result', async () => {
    const PLANTED = 'Planted-pw-7q9Zx';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.gridPassword = PLANTED;
    await boot(world);
    const panel = openPort(world, 'panel');
    const settings = openPort(world, 'settings');
    const details = openPort(world, 'details');
    // the page's save: the record, the note, the unlock, then grid-signin saved
    const s = await seal(PLANTED);
    await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: s.note });
    await world.chrome.storage.session.set({ [SIGNIN_UNLOCK_KEY]: { prf: s.prf, cred: s.cred } });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    expect(activityText()).toContain(LOG_WORDS.signinSaved);
    // the grid's password changes and Chrome's cache empties: the saved one is turned down, then typed again and turned down
    world.opts.gridPassword = 'Changed-pw-2k';
    world.opts.signedIn = false;
    await act({ kind: 'retry-grid' });
    // typed after the refusal is on record, never in its millisecond
    expect(await until(() => !!state()?.refused)).toBe(true);
    await typed(world, PLANTED, afterRefusal());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(world.badAnswers).toBe(2);
    expect(creds()).toBe(3);
    await sleep(300);
    const before = { debug: await debugText(), details: (await act({ kind: 'copy-details' })).text as string, audit: (await act({ kind: 'audit', op: 'export' })).text as string, log: await act({ kind: 'log', open: true }) };
    expect(await act({ kind: 'forget-grid-signin' })).toEqual({ forgotten: true });
    await sleep(300);
    const after = { debug: await debugText(), details: (await act({ kind: 'copy-details' })).text as string, audit: (await act({ kind: 'audit', op: 'export' })).text as string };
    const where: Record<string, string> = {
      'storage.local': JSON.stringify(world.storage.local),
      'storage.session after Forget': JSON.stringify(world.storage.session),
      'the fake browser log': world.log.join('\n'),
      'copy-debug-log': `${before.debug}\n${after.debug}`,
      'copy-details': `${before.details}\n${after.details}`,
      'the audit export': `${before.audit}\n${after.audit}`,
      'the activity log': `${activityText()}\n${JSON.stringify(before.log)}`,
      'the panel views': JSON.stringify(panel.views),
      'the settings views': JSON.stringify(settings.views),
      'the details views': JSON.stringify(details.views),
      'the action results': JSON.stringify(results),
    };
    const forms = [PLANTED, Buffer.from(PLANTED).toString('base64'), Buffer.from(`${USER}:${PLANTED}`).toString('base64'), encodeURIComponent(PLANTED)];
    for (const [name, text] of Object.entries(where)) for (const f of forms) expect(text.includes(f), `${name} holds ${f}`).toBe(false);
    // the record is gone with Forget
    expect(await indexedDbRecords().get()).toBeUndefined();
  }, 40_000);

  it('6. "Use Chrome\'s sign-in box instead" opens the 18.0.0 tab, and the box signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    await boot(world);
    const panel = openPort(world, 'panel');
    expect(await act({ kind: 'sign-in-grid-box', windowId: 1 })).toEqual({ opened: true });
    expect(tabsCreated().some((l) => l.includes(DASHBOARD))).toBe(true);
    expect(await until(() => world.boxes.size > 0)).toBe(true);
    // the box path's moment: no sheet while its tab is watched
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid');
    expect(v.journey.sheet).toBeUndefined();
    const [tabId] = [...world.boxes.keys()];
    expect(await world.answerBox(tabId!, USER, world.opts.gridPassword)).toBe(true);
    const ticker = setInterval(() => panel.tick(), 500);
    expect(await until(() => gridWord() === 'signed-in', 8_000)).toBe(true);
    clearInterval(ticker);
    // Chrome's box carried it; Beethoven gave the grid nothing
    expect(creds()).toBe(0);
  }, 30_000);

  it('6. without webRequest (the Firefox build) the Grid row\'s Sign in opens the tab, and nothing of the sheet is shown', async () => {
    world = install({ webRequest: false });
    world.opts.signedIn = false;
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    const home = await panelView(panel, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.overlays.unlock).toBeUndefined();
    expect(await act({ kind: 'sign-in-grid', windowId: 1 })).toEqual({ opened: true });
    expect(tabsCreated().some((l) => l.includes(DASHBOARD))).toBe(true);
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid');
    expect(v.journey.sheet).toBeUndefined();
    expect(v.journey.body).toBe(WORDS.grid.body);
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (x) => !!x.title)).signin).toBeUndefined();
  }, 30_000);

  it('7. the password changed on the grid after a proven sign-in, with a tick running the check and the run poll together on a new client: Beethoven sends at most one', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    const mine = creds();
    const bad = world.badAnswers;
    const chromeBefore = world.chromeBadTries;
    // the password changes on the grid; Chrome still holds the old one, and a new worker has a new client
    world.opts.gridPassword = 'New-grid-pw-9';
    await restart(world, 'worker');
    const panel = openPort(world, 'panel');
    for (let i = 0; i < 4; i++) {
      panel.tick();
      await sleep(500);
    }
    await world.fireAlarm('bridge.poll');
    await sleep(500);
    expect(creds() - mine).toBeLessThanOrEqual(1);
    expect(world.badAnswers - bad).toBeLessThanOrEqual(1);
    // Chrome's own sends of the stale copy are recorded, not counted against Beethoven (how many the grid counts is not yet measured)
    expect(world.chromeBadTries).toBeGreaterThan(chromeBefore);
    expect(await until(() => !!note()?.refused_at)).toBe(true);
  }, 30_000);

  describe('8. Forget, Disconnect and another portal leave nothing of the sign-in; the same portal keeps it', () => {
    async function placeAll(): Promise<void> {
      const s = await seal('Any-pw-8');
      placed(world, s, { unlocked: true });
      world.storage.local[SIGNIN_NOPRF_KEY] = { at: new Date().toISOString(), os: 'win' };
      world.storage.session[SIGNIN_ONCE_KEY] = { origin: ORIGIN, username: USER, password: 'Any-pw-8', at: new Date().toISOString() };
      // a request id no fresh answer of these tests can be given (a small one could be the next answer's own)
      world.storage.session[SIGNIN_STATE_KEY] = { sent: ['99999'], refusals: 1, refused: { at: new Date(Date.now() - 60_000).toISOString(), source: 'saved' } };
    }
    async function stores(): Promise<Record<string, boolean>> {
      return {
        record: !!(await indexedDbRecords().get()),
        note: SIGNIN_NOTE_KEY in world.storage.local,
        noPrf: SIGNIN_NOPRF_KEY in world.storage.local,
        unlock: SIGNIN_UNLOCK_KEY in world.storage.session,
        once: SIGNIN_ONCE_KEY in world.storage.session,
        state: SIGNIN_STATE_KEY in world.storage.session,
      };
    }
    const none = { record: false, note: false, noPrf: false, unlock: false, once: false, state: false };
    const all = { record: true, note: true, noPrf: true, unlock: true, once: true, state: true };

    it('Forget', async () => {
      world = install({ indexedDB: true });
      await placeAll();
      await boot(world);
      expect(await stores()).toEqual(all);
      expect(await act({ kind: 'forget-grid-signin' })).toEqual({ forgotten: true });
      expect(await stores()).toEqual(none);
      expect(activityText()).toContain(LOG_WORDS.signinForgotten);
      // memory forgot too: the next attempt's record of requests starts afresh
      await typed(world, world.opts.gridPassword);
      world.opts.signedIn = false;
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
      expect(await until(() => state()?.pending === undefined && (state()?.sent.length ?? 0) > 0)).toBe(true);
      expect(state()?.sent).not.toContain('99999');
      expect(state()?.refusals).toBe(0);
      // the words say nothing of the passkey being gone (I8): the log line names none, Settings' sentence only that a list may still show it
      expect(LOG_WORDS.signinForgotten).not.toMatch(/passkey/i);
      const words = WORDS.settings.forgotten(USER);
      expect(words).not.toMatch(/passkey\b[^.]*\b(removed|deleted|gone|forgotten)\b/i);
      expect(words).toMatch(/may still/);
    }, 20_000);

    it('Disconnect', async () => {
      world = install({ indexedDB: true });
      await placeAll();
      await boot(world);
      await act({ kind: 'disconnect' });
      expect(await stores()).toEqual(none);
    }, 20_000);

    it('another portal', async () => {
      world = install({ indexedDB: true });
      await placeAll();
      await boot(world);
      world.grant(OTHER);
      await act({ kind: 'change-portal', origin: OTHER, granted: true });
      expect(await stores()).toEqual(none);
      // memory forgot too (R2-19): back on the first portal, a wrong typed try is the first in a row, and no old request id is kept
      world.grant(ORIGIN);
      await act({ kind: 'change-portal', origin: ORIGIN, granted: true });
      world.opts.signedIn = false;
      const panel = openPort(world, 'panel');
      await act({ kind: 'sign-in-grid' });
      await typed(world, 'Typo-8');
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
      expect(await until(() => !!state()?.refused)).toBe(true);
      expect(state()?.sent).not.toContain('99999');
      expect(state()?.refusals).toBe(1);
      expect((await panelView(panel, (v) => v.journey?.sheet?.note === WORDS.grid.refused || v.journey?.sheet?.note === WORDS.grid.refusedTwice)).journey.sheet.note).toBe(WORDS.grid.refused);
    }, 20_000);

    it('the same portal again', async () => {
      world = install({ indexedDB: true });
      const s = await seal(world.opts.gridPassword);
      placed(world, s, { unlocked: true });
      world.storage.local[SIGNIN_NOPRF_KEY] = { at: new Date().toISOString(), os: 'win' };
      world.storage.session[SIGNIN_ONCE_KEY] = { origin: ORIGIN, username: USER, password: 'Any-pw-8', at: new Date().toISOString() };
      world.storage.session[SIGNIN_STATE_KEY] = { sent: ['99999'], refusals: 0 };
      await boot(world);
      await act({ kind: 'change-portal', origin: ORIGIN, granted: true });
      expect(await stores()).toEqual(all);
      // and memory kept it (R2-20): the unlocked saved sign-in still answers
      world.opts.signedIn = false;
      await world.chrome.storage.session.remove(SIGNIN_ONCE_KEY);
      expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
      expect(creds()).toBe(1);
    }, 20_000);
  });

  it('9. the 16.0.0 cleanup of the direct way never removes the sign-in\'s database or keys', async () => {
    world = install({ indexedDB: true });
    const s = await seal('Any-pw-9');
    placed(world, s, { unlocked: true });
    world.storage.local[SIGNIN_NOPRF_KEY] = { at: new Date().toISOString(), os: 'mac' };
    world.storage.session[SIGNIN_ONCE_KEY] = { origin: ORIGIN, username: USER, password: 'Any-pw-9', at: new Date().toISOString() };
    world.storage.session[SIGNIN_STATE_KEY] = { sent: [], refusals: 1 };
    // what 15.0.0 left
    world.storage.local['bridge.direct'] = { account: USER, enrolled_at: '2026-10-05T10:00:00Z', key_fp: 'SHA256:abc' };
    world.storage.session['bridge.keyUnlock'] = { x: 1 };
    world.idb!.dbs.set('beethoven-key', new Map([['keys', new Map()]]));
    await boot(world);
    await Promise.all(world.chrome.runtime.onInstalled.fire({ reason: 'update' }));
    await Promise.all(world.chrome.runtime.onStartup.fire());
    await sleep(100);
    expect(world.storage.local['bridge.direct']).toBeUndefined();
    expect(world.storage.session['bridge.keyUnlock']).toBeUndefined();
    expect(world.log.some((l) => l.endsWith('indexedDB.deleteDatabase beethoven-key'))).toBe(true);
    expect(world.log.some((l) => l.includes(`deleteDatabase ${SIGNIN_DB}`))).toBe(false);
    expect(world.idb!.dbs.has(SIGNIN_DB)).toBe(true);
    expect(await indexedDbRecords().get()).toMatchObject({ cred: s.cred });
    for (const k of [SIGNIN_NOTE_KEY, SIGNIN_NOPRF_KEY]) expect(world.storage.local[k], k).toBeDefined();
    for (const k of [SIGNIN_UNLOCK_KEY, SIGNIN_ONCE_KEY, SIGNIN_STATE_KEY]) expect(world.storage.session[k], k).toBeDefined();
  }, 20_000);

  it('10. registered with nothing granted, then the grant: the listener comes back once, and an unlocked saved sign-in gives one answer', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    world.revoke(ORIGIN);
    await boot(world);
    expect(count(/webRequest\.onAuthRequired\.addListener refused \(no host permission\)/)).toBe(1);
    world.grant(ORIGIN);
    await sleep(50);
    const ls = world.chrome.webRequest.onAuthRequired.ls as Array<{ refused: boolean }>;
    expect(ls.map((e) => e.refused)).toEqual([false]);
    expect((world.chrome.webRequest.onCompleted.ls as unknown[]).length).toBe(1);
    expect((world.chrome.webRequest.onErrorOccurred.ls as unknown[]).length).toBe(1);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(1);
    expect(cancels()).toBe(0);
    // a second grant (another portal's address) registers again, never twice
    world.grant(OTHER);
    await sleep(50);
    expect((world.chrome.webRequest.onAuthRequired.ls as unknown[]).length).toBe(1);
  }, 20_000);

  describe('11. the one-shot (a password typed without Remember)', () => {
    it('is used for one attempt and removed, right or wrong', async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      await boot(world);
      await typed(world, 'Wrong-typed-pw');
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      expect(creds()).toBe(1);
      // nothing tries it again: a check of the panel's
      await send(world, { type: 'panel.opened', windowId: 1 });
      expect(creds()).toBe(1);
      expect(await until(() => !!state()?.refused)).toBe(true);
      await typed(world, world.opts.gridPassword, afterRefusal());
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      expect(creds()).toBe(2);
      expect(world.badAnswers).toBe(1);
      // never written to storage.local or kept in the note
      expect(note()).toBeUndefined();
    }, 20_000);

    it('older than two minutes: not used, and removed by its alarm; a fresh one waits for its own two minutes', async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      await boot(world);
      await typed(world, world.opts.gridPassword, new Date(Date.now() - 125_000).toISOString());
      // what the page sent for it is too late: no answer, and the attempt removes it
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: false });
      expect(creds()).toBe(0);
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      // a leftover nobody sent an action for: the alarm set when it was written takes it
      await typed(world, world.opts.gridPassword, new Date(Date.now() - 125_000).toISOString());
      expect(await world.fireAlarm('bridge.signinOnce')).toBe(true);
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      // a fresh one is left for its own two minutes, and the alarm is set again
      await typed(world, world.opts.gridPassword);
      expect(await world.fireAlarm('bridge.signinOnce')).toBe(true);
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeDefined();
      expect(await world.chrome.alarms.get('bridge.signinOnce')).toBeDefined();
      expect(creds()).toBe(0);
    }, 20_000);

    it('while Chrome\'s cache already signs in: unused, removed, and the result is this attempt\'s', async () => {
      world = install({ indexedDB: true });
      await boot(world);
      await typed(world, world.opts.gridPassword);
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      expect(creds()).toBe(0);
    }, 20_000);

    it('while the grid is out of reach: removed, and the result says it did not sign in', async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      await boot(world);
      world.opts.reach = false;
      await typed(world, world.opts.gridPassword);
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: false });
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      expect(creds()).toBe(0);
    }, 20_000);

    it('while another check is in flight: it waits for that one, then makes its own attempt', async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      world.opts.dashboardDelayMs = 600;
      await boot(world);
      const opened = send(world, { type: 'panel.opened', windowId: 1 });
      await sleep(100);
      await typed(world, world.opts.gridPassword);
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
      await opened;
      expect(world.storage.session[SIGNIN_ONCE_KEY]).toBeUndefined();
      expect(creds()).toBe(1);
      expect(count(/fetch GET \/pun\/sys\/dashboard\/$/)).toBe(2);
    }, 20_000);
  });

  it('12. a refused saved password replaced by a typed one: the stale record goes, and nothing sends the old one again', async () => {
    const OLD = 'Old-grid-pw-12';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.gridPassword = 'New-grid-pw-12';
    const s = await seal(OLD);
    placed(world, s, { unlocked: true });
    await boot(world);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!note()?.refused_at)).toBe(true);
    await restart(world, 'browser');
    const panel = openPort(world, 'panel');
    const ticker = setInterval(() => panel.tick(), 400);
    // Remember ticked: the passkey step is cancelled, so the page uses the typed password this once
    s.fa.options.queue.push('cancel');
    const e = await unlockPasskey(s.fa, { cred: s.cred, prfSalt: s.prfSalt }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(VaultError);
    expect((e as VaultError).code).toBe('not-allowed');
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => note() === undefined)).toBe(true);
    expect(await indexedDbRecords().get()).toBeUndefined();
    expect(activityText()).toContain(LOG_WORDS.signinReplaced);
    clearInterval(ticker);
    panel.close();
    await restart(world, 'browser');
    const again = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    const home = await panelView(again, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.overlays.unlock).toBeUndefined();
    expect(home.home.rows.grid.link?.action).toEqual({ kind: 'sign-in-grid' });
    again.close();
    await world.fireAlarm('bridge.poll');
    expect(world.authAnswers.filter((a) => a.answer === 'credentials' && a.accepted === false)).toHaveLength(1);
    expect(world.badAnswers).toBe(1);
  }, 40_000);

  it('13. a right answer met by the cold per-user server (500) is proven, never refused', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.coldPun = 60_000;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()?.refused_at).toBeUndefined();
    expect(state()?.refused).toBeUndefined();
    expect(cancels()).toBe(0);
    expect(creds()).toBe(1);
  }, 20_000);

  it('14. an answer whose retry is lost stays unsettled (the listener answers nothing meanwhile) until a check reads signed in; a wrong one cut off by a stopped worker is never sent again', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(creds()).toBe(1);
    expect(state()?.pending).toBeDefined();
    expect(note()?.proven_at).toBeUndefined();
    // the next window: its own request goes in on Chrome's cache; another challenge in it meanwhile gets nothing
    const meanwhile = duringNextWindow(5, () => world.realmChallenge(world.realm));
    await send(world, { type: 'panel.opened', windowId: 1 });
    expect(await meanwhile).toBe('none');
    expect(await debugText()).toContain('(unsettled;');
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(state()?.pending).toBeUndefined();
    expect(creds()).toBe(1);
  }, 20_000);

  it('14. a wrong answer, the worker stopped before the grid replied: never a second answer', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 500;
    placed(world, await seal('Wrong-saved-pw-14'), { unlocked: true });
    await boot(world);
    void send(world, { type: 'action', action: { kind: 'grid-signin', how: 'unlocked' } });
    expect(await until(() => creds() === 1)).toBe(true);
    world.stopWorker();
    const stoppedAt = Date.now();
    await sleep(800);
    expect(world.badAnswers).toBe(1);
    await startWorker();
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    await act({ kind: 'grid-signin', how: 'unlocked' });
    for (let i = 0; i < 3; i++) {
      panel.tick();
      await sleep(300);
    }
    expect(await until(() => !!note()?.refused_at)).toBe(true);
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
    // the stopped worker's check still waits out its outcome (OUTCOME_WAIT_MS); it ends inside this test, not in the next one's world
    await sleep(Math.max(0, stoppedAt + 7_000 - Date.now()));
  }, 30_000);

  it('15. two refusals in a row: the sheet says refusedTwice; a proven sign-in sets the count back to nothing', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    await boot(world);
    const panel = openPort(world, 'panel');
    await act({ kind: 'sign-in-grid' });
    await typed(world, 'Wrong-typed-1');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect((await panelView(panel, (v) => v.journey?.sheet?.note === WORDS.grid.refused)).journey.sheet.note).toBe(WORDS.grid.refused);
    await typed(world, 'Wrong-typed-2');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect((await panelView(panel, (v) => v.journey?.sheet?.note === WORDS.grid.refusedTwice)).journey.sheet.note).toBe(WORDS.grid.refusedTwice);
    expect(state()?.refusals).toBe(2);
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => state()?.refusals === 0)).toBe(true);
    expect(state()?.refused).toBeUndefined();
    expect(world.badAnswers).toBe(2);
    expect(creds()).toBe(3);
  }, 30_000);

  it('16. the Grid row\'s Sign in shows the sheet with Not now; Not now goes back home', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    await boot(world);
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    const home = await panelView(panel, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.home.rows.grid.link?.action).toEqual({ kind: 'sign-in-grid' });
    expect(await act({ kind: 'sign-in-grid', windowId: 1 })).toEqual({ opened: false });
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid');
    expect(v.journey.body).toBe(WORDS.grid.sheetBody);
    expect(v.journey.problem).toBeUndefined();
    expect(v.journey.sheet).toMatchObject({ phase: 'type', saved: 'none', origin: ORIGIN, unlockWith: 'Windows Hello', later: { label: WORDS.grid.notNow, action: { kind: 'grid-signin-later' } }, box: { label: WORDS.grid.useBox, action: { kind: 'sign-in-grid-box' } } });
    expect(tabsCreated()).toEqual([]);
    expect(await act({ kind: 'grid-signin-later' })).toEqual({ recorded: true });
    expect((await panelView(panel, (x) => x.kind === 'home')).kind).toBe('home');
  }, 20_000);
});

/** the page's save while this worker runs: the record, the note whole, the unlock (a re-seal reuses the passkey) */
async function sealNow(password: string): Promise<Saved> {
  const s = await seal(password);
  await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: { ...s.note } });
  await world.chrome.storage.session.set({ [SIGNIN_UNLOCK_KEY]: { prf: s.prf, cred: s.cred } });
  return s;
}
/** the page's re-seal under the same passkey: a new record for another password, not put yet */
async function resealed(s: Saved, password: string, savedAt = new Date().toISOString()) {
  return { savedAt, rec: await sealPassword(unbase64(s.prf), { origin: ORIGIN, username: USER, cred: s.cred, prfSalt: s.prfSalt, password, savedAt }) };
}
/** Beethoven's answers the grid turned down (Chrome's own sends of a cached pair are world.chromeBadTries) */
const wrongAnswers = () => world.authAnswers.filter((a) => a.answer === 'credentials' && a.accepted === false).length;

describe('19.0.0 review: one wrong try, whichever password was given and whenever the browser closed', () => {
  it('17. a typed password turned down while the same one is saved and locked: after a browser restart the saved one is neither offered nor sent, and Settings does not call it turned down', async () => {
    const STALE = 'Stale-pw-17';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(STALE);
    placed(world, s, { unlocked: false });
    await boot(world);
    await typed(world, STALE);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(world.badAnswers).toBe(1);
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.refused_at).toBeUndefined();
    await restart(world, 'browser');
    const panel = openPort(world, 'panel');
    await send(world, { type: 'panel.opened', windowId: 1 });
    const home = await panelView(panel, (v) => v.kind === 'home' && v.home.rows.grid.state === 'signed-out');
    expect(home.overlays.unlock).toBeUndefined();
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (v) => !!v.signin)).signin.text).toBe(WORDS.settings.signinSaved(USER, 'Windows Hello'));
    settings.close();
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await world.fireAlarm('bridge.poll');
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const sheet = await panelView(panel, (v) => v.journey?.moment === 'grid' && v.journey.sheet?.saved === 'ready' && v.journey.sheet.phase !== 'working');
    expect(sheet.journey.sheet.phase).toBe('type');
  }, 40_000);

  it('18. then another typed password that works: the saved one, locked and so not compared, is forgotten and never sent', async () => {
    const STALE = 'Stale-pw-18';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(STALE);
    placed(world, s, { unlocked: false });
    await boot(world);
    await typed(world, STALE);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!state()?.refused)).toBe(true);
    await typed(world, world.opts.gridPassword, afterRefusal());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => note() === undefined)).toBe(true);
    expect(await indexedDbRecords().get()).toBeUndefined();
    expect(activityText()).toContain(LOG_WORDS.signinSetAside);
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    await world.fireAlarm('bridge.poll');
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(2);
  }, 40_000);

  it('19. a typo turned down, then the saved password typed: it worked, so the hold is lifted and the saved sign-in kept (and used after a restart)', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: true });
    await boot(world);
    await typed(world, 'Typo-pw-19');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    await typed(world, world.opts.gridPassword, afterRefusal());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note() && !note()!.stopped_at)).toBe(true);
    expect(note()).toMatchObject({ refusals: 0, saved_at: s.note.saved_at });
    expect(note()?.refused_at).toBeUndefined();
    expect(await indexedDbRecords().get()).toBeDefined();
    expect(await debugText()).toContain('the password typed is the saved one, and it worked');
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(3);
    expect(world.badAnswers).toBe(1);
  }, 40_000);

  for (const route of ['their own portal tab', "the sheet's box tab"] as const) {
    it(`20. an answer whose outcome never came, then a sign-in in Chrome's box through ${route}: never counted as the saved one's, so it is not sent again after a browser restart`, async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      const s = await seal('Wrong-saved-20');
      placed(world, s, { unlocked: true });
      await boot(world);
      world.dropAuthRetry();
      expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
      expect(state()?.pending).toBeDefined();
      if (route === 'their own portal tab') world.openTab(`${ORIGIN}${DASHBOARD}`);
      else expect(await act({ kind: 'sign-in-grid-box', windowId: 1 })).toEqual({ opened: true });
      expect(await until(() => world.boxes.size > 0)).toBe(true);
      const [tabId] = [...world.boxes.keys()];
      // the student types into the box
      await sleep(1_000);
      expect(await world.answerBox(tabId!, USER, world.opts.gridPassword)).toBe(true);
      await act({ kind: 'retry-grid' });
      expect(await until(() => gridWord() === 'signed-in')).toBe(true);
      // on hold, and only that: nothing said the grid turned it down, so no refusal is counted either
      expect(await until(() => !!note()?.stopped_at)).toBe(true);
      expect(note()?.proven_at).toBeUndefined();
      expect(note()?.refused_at).toBeUndefined();
      if (route === 'their own portal tab') expect(await debugText()).toContain("an answer's outcome cannot be told");
      await restart(world, 'browser');
      // the browser-restart rule leaves a hold placed after the try as it is: never turned into a refusal
      await sleep(300);
      expect(note()?.stopped_at).toBeDefined();
      expect(note()?.refused_at).toBeUndefined();
      expect(note()?.refusals ?? 0).toBe(0);
      const settings = openPort(world, 'settings');
      expect((await panelView(settings, (v) => !!v.signin)).signin.text).toBe(WORDS.settings.signinSaved(USER, 'Windows Hello'));
      settings.close();
      await unlock(world, s);
      expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
      await world.fireAlarm('bridge.poll');
      // the first answer, whose retry was lost, and nothing after it
      expect(wrongAnswers()).toBe(1);
      expect(creds()).toBe(1);
    }, 40_000);
  }

  it('21. a re-seal (the same passkey) landing while a check answers: nothing is answered from a seal the note does not name, the note heals, and the new password is tried once', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    const s = await seal('Stale-old-21');
    placed(world, s, { unlocked: true });
    await boot(world);
    world.holdChallenges();
    const seen = new Promise<void>((res) => {
      world.onPortalRequest = (r) => {
        if (r.tabId !== -1 || new URL(r.url).pathname !== DASHBOARD) return;
        world.onPortalRequest = undefined;
        res();
      };
    });
    const check = send(world, { type: 'action', action: { kind: 'retry-grid' } });
    await seen;
    await sleep(world.opts.dashboardDelayMs + 50);
    // the page's save(): the record first ...
    const { savedAt, rec } = await resealed(s, 'Typo-new-21');
    await indexedDbRecords().put(rec);
    world.releaseChallenges();
    await check;
    expect(creds()).toBe(0);
    expect(note()?.saved_at).toBe(savedAt);
    expect(note()?.attempt_at).toBeUndefined();
    expect(await debugText()).toContain('the saved sign-in changed while it was read');
    // ... then the note whole, and its grid-signin saved: the new password, tried once
    await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred } });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!note()?.refused_at)).toBe(true);
    expect(note()?.saved_at).toBe(savedAt);
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(1);
  }, 40_000);

  it('22. a re-seal landing while the background writes its attempt for the old record: the old password is not sent, its marks never reach the new note, and the new one signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Stale-old-22');
    placed(world, s, { unlocked: true });
    await boot(world);
    const NEW = world.opts.gridPassword;
    const { savedAt, rec } = await resealed(s, NEW, new Date(Date.now() + 1).toISOString());
    const raw = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
    const orig = raw.set.bind(raw);
    let landed = false;
    raw.set = async (items) => {
      if (!landed && items[SIGNIN_STATE_KEY]?.pending) {
        landed = true;
        await indexedDbRecords().put(rec);
        await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred } });
      }
      return orig(items);
    };
    await act({ kind: 'retry-grid' });
    expect(landed).toBe(true);
    expect(creds()).toBe(0);
    expect(note()).toEqual({ origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()?.refused_at).toBeUndefined();
    expect((await indexedDbRecords().get())?.saved_at).toBe(savedAt);
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(0);
  }, 40_000);

  it("23. the page's note landing inside the background's read-modify-write of the old one: the old password is not sent, the note ends as the page's seal, and it signs in", async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Stale-old-23');
    placed(world, s, { unlocked: true });
    await boot(world);
    const NEW = world.opts.gridPassword;
    const { savedAt, rec } = await resealed(s, NEW, new Date(Date.now() + 1).toISOString());
    const ses = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
    const loc = world.chrome.storage.local as { get(keys: any): Promise<Record<string, any>>; set(items: Record<string, any>): Promise<void> };
    const sesSet = ses.set.bind(ses);
    const locGet = loc.get.bind(loc);
    const locSet = loc.set.bind(loc);
    let armed = false;
    let landed = false;
    ses.set = async (items) => {
      if (items[SIGNIN_STATE_KEY]?.pending) armed = true;
      return sesSet(items);
    };
    // the background reads the old note; the page's save (the record, the note whole) lands; then the background writes
    loc.get = async (keys) => {
      const r = await locGet(keys);
      const wantsNote = keys === SIGNIN_NOTE_KEY || (Array.isArray(keys) && keys.includes(SIGNIN_NOTE_KEY));
      if (armed && !landed && wantsNote) {
        landed = true;
        await indexedDbRecords().put(rec);
        await locSet({ [SIGNIN_NOTE_KEY]: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred } });
      }
      return r;
    };
    await act({ kind: 'retry-grid' });
    expect(landed).toBe(true);
    expect(await until(() => note()?.saved_at === savedAt)).toBe(true);
    expect(note()?.attempt_at).toBeUndefined();
    expect(creds()).toBe(0);
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()?.saved_at).toBe(savedAt);
    expect(world.badAnswers).toBe(0);
  }, 40_000);

  it('24. a re-seal while the old password is on the wire: the old one\'s refusal stays with its seal, and the new one is sent and signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 600;
    const s = await seal('Stale-old-24');
    placed(world, s, { unlocked: true });
    await boot(world);
    const check = send(world, { type: 'action', action: { kind: 'retry-grid' } });
    expect(await until(() => creds() === 1)).toBe(true);
    // the page's save runs whole before the grid replies: the record, the note, the unlock, then its action at once
    const { savedAt, rec } = await resealed(s, world.opts.gridPassword);
    await indexedDbRecords().put(rec);
    await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred } });
    await world.chrome.storage.session.set({ [SIGNIN_UNLOCK_KEY]: { prf: s.prf, cred: s.cred } });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    await check;
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()).toMatchObject({ saved_at: savedAt, refusals: 0 });
    expect(note()?.refused_at).toBeUndefined();
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(2);
  }, 40_000);

  it('25. the right password typed while an earlier saved answer is still unsettled: it is sent, and the result is its own', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal('Wrong-saved-25'), { unlocked: true });
    await boot(world);
    const panel = openPort(world, 'panel');
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(state()?.pending).toBeDefined();
    await act({ kind: 'sign-in-grid' });
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(world.authAnswers.filter((a) => a.answer === 'credentials' && a.accepted === true)).toHaveLength(1);
    expect(creds()).toBe(2);
    expect(state()?.refused).toBeUndefined();
    // the earlier one was the wrong saved password: it stays turned down, and its record goes
    expect(await until(() => note() === undefined)).toBe(true);
    const v = await panelView(panel, (x) => x.journey?.sheet?.note === undefined, 2_000);
    expect(v.journey?.sheet?.note).toBeUndefined();
  }, 40_000);

  for (const how of ['typed', 'saved'] as const) {
    it(`26. a typo whose retry was lost, then the right password ${how === 'typed' ? 'typed' : 'typed with Remember'}: settled first, then sent once, and it signs in`, async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      await boot(world);
      openPort(world, 'panel');
      await act({ kind: 'sign-in-grid' });
      world.dropAuthRetry();
      await typed(world, 'Typo-pw-26');
      expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: false });
      expect(state()?.pending).toBeDefined();
      await sleep(5);
      if (how === 'typed') await typed(world, world.opts.gridPassword);
      else await sealNow(world.opts.gridPassword);
      expect(await act({ kind: 'grid-signin', how })).toEqual({ signedIn: true, refused: false });
      expect(creds()).toBe(2);
      expect(world.badAnswers).toBe(0);
      // the cached typo, sent once by Chrome itself as the settling check began
      expect(world.chromeBadTries).toBe(1);
      expect(state()?.pending).toBeUndefined();
    }, 30_000);
  }

  it('26. the same typo retyped after its retry was lost: one more wrong try for the one more press, never two', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    await boot(world);
    await act({ kind: 'sign-in-grid' });
    world.dropAuthRetry();
    await typed(world, 'Typo-pw-26b');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: false });
    await sleep(5);
    await typed(world, 'Typo-pw-26b');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(world.badAnswers + world.chromeBadTries).toBe(2);
    expect(creds()).toBe(2);
  }, 30_000);

  it('27. the right password typed while a check is trying a stale saved one: it is sent after that refusal, and signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 500;
    placed(world, await seal('Stale-saved-27'), { unlocked: true });
    await boot(world);
    const panel = openPort(world, 'panel');
    await act({ kind: 'sign-in-grid' });
    const opened = send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(100);
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    await opened;
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(1);
    const v = await panelView(panel, (x) => x.journey?.sheet?.note === undefined, 2_000);
    expect(v.journey?.sheet?.note).toBeUndefined();
  }, 30_000);

  it('28. a typed refusal with a one-shot stamped before it: not typed again, so nothing is sent', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    await boot(world);
    await typed(world, 'Wrong-typed-28');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!state()?.refused)).toBe(true);
    await typed(world, world.opts.gridPassword, new Date(Date.now() - 5_000).toISOString());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
  }, 20_000);

  it('28. a typed refusal while a wrong password is saved and unlocked: an unlock and the same seal send nothing', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal('Wrong-saved-28'), { unlocked: true });
    await boot(world);
    await typed(world, 'Wrong-typed-28');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    expect(note()?.refused_at).toBeUndefined();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    // the same note (sealed before the typed refusal): no new seal, nothing sent
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
    // a seal made after it is the student's new password: it is tried
    await sealNow(world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
  }, 30_000);

  it('28. a refusal the note could not keep (storage.local failing): the session\'s refusal alone stops an unlock and the same seal', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal('Wrong-saved-28c'), { unlocked: true });
    await boot(world);
    const loc = world.chrome.storage.local as { set(items: Record<string, any>): Promise<void> };
    const orig = loc.set.bind(loc);
    let failed = 0;
    loc.set = async (items) => {
      if (items[SIGNIN_NOTE_KEY]?.refused_at) {
        failed++;
        throw new Error('QUOTA_BYTES quota exceeded');
      }
      return orig(items);
    };
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(failed).toBe(1);
    expect(note()?.refused_at).toBeUndefined();
    expect(state()?.refused).toMatchObject({ source: 'saved' });
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: false, refused: true });
    await act({ kind: 'retry-grid' });
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
  }, 30_000);

  for (const status of [401, 403] as const) {
    it(`29. an answered request that ends ${status} at onCompleted, with no second challenge: refused there, and never sent again`, async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      if (status === 401) world.opts.authRepeatLimit = 1;
      else world.opts.answeredStatus = 403;
      placed(world, await seal('Wrong-saved-29'), { unlocked: true });
      await boot(world);
      expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
      expect(cancels()).toBe(0);
      expect(await until(() => !!note()?.refused_at)).toBe(true);
      expect(note()?.refusals).toBe(1);
      const panel = openPort(world, 'panel');
      await send(world, { type: 'panel.opened', windowId: 1 });
      for (let i = 0; i < 3; i++) {
        panel.tick();
        await sleep(300);
      }
      await act({ kind: 'retry-grid' });
      await world.fireAlarm('bridge.poll');
      expect(creds()).toBe(1);
      expect(world.badAnswers).toBe(1);
      expect(await debugText()).toContain(`the answered request ended: HTTP ${status}`);
    }, 30_000);
  }

  for (const source of ['saved', 'typed'] as const) {
    it(`27b. the ${source} password's attempt cannot be put on record: nothing is answered`, async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      if (source === 'saved') placed(world, await seal(world.opts.gridPassword), { unlocked: true });
      await boot(world);
      const raw = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
      const orig = raw.set.bind(raw);
      let refused = 0;
      raw.set = async (items) => {
        if (items[SIGNIN_STATE_KEY]?.pending) {
          refused++;
          throw new Error('QUOTA_BYTES quota exceeded');
        }
        return orig(items);
      };
      if (source === 'typed') await typed(world, world.opts.gridPassword);
      expect(await act({ kind: 'grid-signin', how: source === 'saved' ? 'unlocked' : 'typed' })).toEqual({ signedIn: false, refused: false });
      expect(refused).toBeGreaterThan(0);
      expect(creds()).toBe(0);
      expect(world.authAnswers.at(-1)?.answer).toBe('none');
      expect(note()?.attempt_at).toBeUndefined();
      expect(state()?.pending).toBeUndefined();
      expect(await debugText()).toContain('the sign-in state could not be written');
    }, 20_000);
  }

  // R2-08: this pinned refused_at and one refusal until the second review; the outcome was lost, not turned
  // down, so it is a hold now (stopped_at), with no refusal counted, and the sheet still asks for the password
  it('30. a wrong saved answer, the browser closed before the grid replied: put on hold at once (its outcome cannot be told), never a second answer', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 500;
    const s = await seal('Wrong-saved-30');
    placed(world, s, { unlocked: true });
    await boot(world);
    void send(world, { type: 'action', action: { kind: 'grid-signin', how: 'unlocked' } });
    expect(await until(() => creds() === 1)).toBe(true);
    const stoppedAt = Date.now();
    await restart(world, 'browser');
    expect(await until(() => !!note()?.stopped_at, 1_000)).toBe(true);
    expect(note()?.refused_at).toBeUndefined();
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await world.fireAlarm('bridge.poll');
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(1);
    expect(note()?.refusals ?? 0).toBe(0);
    expect(note()?.refused_at).toBeUndefined();
    const panel = openPort(world, 'panel');
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const sheet = await panelView(panel, (v) => v.journey?.moment === 'grid' && v.journey.sheet?.saved === 'ready' && v.journey.sheet.phase !== 'working');
    // a hold's own words (core/steps.ts, the facts' `held`): never the refusal's, nor the second refusal's
    // (this pinned only "some note, not refusedTwice" until the last review gave a hold its words)
    expect(sheet.journey.sheet).toMatchObject({ phase: 'type', saved: 'ready', note: WORDS.grid.held });
    expect(sheet.overlays.unlock).toBeUndefined();
    // the closed browser's worker still waits out its outcome (OUTCOME_WAIT_MS); it ends inside this test
    await sleep(Math.max(0, stoppedAt + 7_000 - Date.now()));
  }, 30_000);

  it('31. a saved password turned down, the browser restarted, then a wrong one typed: the second in a row says so; the right one sets the count back', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal('Old-saved-31'), { unlocked: true });
    await boot(world);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => note()?.refusals === 1)).toBe(true);
    await restart(world, 'browser');
    const panel = openPort(world, 'panel');
    await act({ kind: 'sign-in-grid' });
    await typed(world, 'Wrong-typed-31');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect((await panelView(panel, (v) => v.journey?.sheet?.note === WORDS.grid.refusedTwice)).journey.sheet.note).toBe(WORDS.grid.refusedTwice);
    expect(world.badAnswers).toBe(2);
    await typed(world, world.opts.gridPassword, afterRefusal());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => state()?.refusals === 0)).toBe(true);
  }, 30_000);

  it('32. the realm a sign-in worked in outlives the browser: after a restart a challenge naming another realm gets no password', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: true });
    await boot(world);
    const realm = world.realm;
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => note()?.realm === realm)).toBe(true);
    await restart(world, 'browser');
    await unlock(world, s);
    world.realm = 'another-realm';
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(creds()).toBe(1);
    expect(await debugText()).toContain('(realm;');
    expect(note()?.realm).toBe(realm);
  }, 30_000);

  it('33. a grant while an answer is on its way does not register the listener again (Chrome would let the request go unanswered): the password reaches the grid', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    const raw = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
    const orig = raw.set.bind(raw);
    let granted = false;
    raw.set = async (items) => {
      if (!granted && items[SIGNIN_STATE_KEY]?.pending) {
        granted = true;
        world.grant(OTHER);
      }
      return orig(items);
    };
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(granted).toBe(true);
    expect(count(/let go unanswered/)).toBe(0);
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()?.refused_at).toBeUndefined();
    expect(creds()).toBe(1);
    expect((world.chrome.webRequest.onAuthRequired.ls as unknown[]).length).toBe(1);
  }, 20_000);
  it("34. the welcome page's last word after the press, on a first run whose grid is signed out: a step to the panel's sign-in, no check mark; once signed in, the panel carries on", async () => {
    world = install({ indexedDB: true });
    world.storage.local['bridge.install_id'] = INSTALL;
    await startWorker();
    world.opts.reach = true;
    world.opts.signedIn = false;
    const tab = world.openTab(`${EXT}/options.html`, 1, true);
    const welcome = openPort(world, 'welcome', { tabId: tab.id });
    await world.chrome.storage.local.set({ 'bridge.terms': await termsRecord() });
    const panel = openPort(world, 'panel');
    expect((await act({ kind: 'agree', origin: ORIGIN, granted: true, panelOpened: true, tabId: tab.id, windowId: 1 })).signedInAlready).toBe(false);
    const ticked = async (want: (w: any, p: any) => boolean) => until(() => {
      panel.tick();
      welcome.tick();
      return want(welcome.last()?.view, panel.last()?.view);
    }, 8_000);
    expect(await ticked((w, p) => w?.state === 'handoff' && p?.journey?.moment === 'grid' && !!p.journey.sheet)).toBe(true);
    expect(welcome.last().view.handoff).toEqual({ text: WORDS.welcome.handoffSignin, done: false });
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await ticked((w) => w?.handoff?.done === true)).toBe(true);
    expect(welcome.last().view.handoff.text).toBe(WORDS.welcome.handoff);
  }, 30_000);
});

// The second review: a sign-in made in Chrome's own box puts its password in the cache Beethoven's answer went
// into, and Chrome takes it for Beethoven's own request too (after the grid turns Beethoven's down) and for every
// later reading, so neither can be counted as the saved password working. One rule closes every way in: while an
// answer waits for its outcome, a portal tab asked to sign in, or a portal tab's request let in, marks it, and a
// marked answer is never proven, nor counted as turned down; it is put on hold. A box submitted before Beethoven
// answers is no such sign (the answer replaces it in the cache), and a box left open changes nothing.
describe('19.0.0 second review: a sign-in in Chrome\'s box is never counted as the saved password working', () => {
  /** storage reads that answer late, as Chrome's do over IPC to a worker an event just woke (that latency is not yet measured) */
  function slowStorageReads(delay: 'a macrotask' | '40 ms'): void {
    for (const area of [world.chrome.storage.session, world.chrome.storage.local] as Array<{ get(k: unknown): Promise<unknown> }>) {
      const get = area.get.bind(area);
      area.get = async (k: unknown) => {
        await (delay === 'a macrotask' ? new Promise((r) => setTimeout(r, 0)) : sleep(40));
        return get(k);
      };
    }
  }

  /** after a browser restart and the unlock: the password the grid turned down is not sent again */
  async function notSentAgain(s: Saved): Promise<void> {
    await restart(world, 'browser');
    await unlock(world, s);
    await act({ kind: 'grid-signin', how: 'unlocked' });
    await world.fireAlarm('bridge.poll');
    await sleep(300);
  }

  for (const delay of ['a macrotask', '40 ms'] as const) {
    it(`35. (R2-01) a portal tab's challenge that wakes the stopped worker before its state is read (storage ${delay} late) still marks the unsettled answer`, async () => {
      world = install({ indexedDB: true });
      world.opts.signedIn = false;
      const s = await seal('Wrong-saved-35');
      placed(world, s, { unlocked: true });
      await boot(world);
      world.dropAuthRetry();
      expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
      expect(state()?.pending).toBeDefined();
      world.stopWorker();
      slowStorageReads(delay);
      // the student opens a portal tab: Chrome starts the worker to hand it the tab's challenge
      vi.resetModules();
      const bg = (await import('../src/entrypoints/background')).default as unknown as { main(): void };
      bg.main();
      const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
      expect(await until(() => world.boxes.has(tab.id))).toBe(true);
      expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
      // the student signs in in Chrome's box with the right password; the next check reads signed in
      expect(await world.answerBox(tab.id, USER, world.opts.gridPassword)).toBe(true);
      await act({ kind: 'retry-grid' });
      expect(await until(() => gridWord() === 'signed-in')).toBe(true);
      expect(await until(() => !!note()?.stopped_at)).toBe(true);
      expect(note()?.proven_at).toBeUndefined();
      expect(note()?.refused_at).toBeUndefined();
      await notSentAgain(s);
      expect(creds()).toBe(1);
      expect(wrongAnswers()).toBe(1);
    }, 40_000);
  }

  it("36. (R2-02) a stale saved password answered while Chrome's box, open before it, is signed in: the grid's 200 for Beethoven's own request is the box's, never counted as the saved one's", async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    // the grid takes a while to turn a wrong password down (a fail delay; how long at Wayne State is not yet measured)
    world.opts.dashboardDelayMs = 1_500;
    const s = await seal('Stale-saved-36');
    placed(world, s, { unlocked: false });
    await boot(world);
    // the student's own portal tab: Chrome's box over it, before any answer of Beethoven's
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    await unlock(world, s);
    const r = send(world, { type: 'action', action: { kind: 'grid-signin', how: 'unlocked' } });
    expect(await until(() => creds() === 1)).toBe(true);
    // while the grid is still checking it, the student signs in in Chrome's box with the right password
    await sleep(200);
    expect(await world.answerBox(tab.id, USER, world.opts.gridPassword)).toBe(true);
    await r;
    // Chrome finished Beethoven's own request with the box's password (no event): the saved one is put on hold
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(world.badAnswers).toBe(1);
    expect(note()?.proven_at).toBeUndefined();
    expect(note()?.refused_at).toBeUndefined();
    await notSentAgain(s);
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(1);
  }, 40_000);

  it("37. (R2-02) a box open before the answer and signed in after its retry was lost: the unsettled stale saved password is not counted as proven", async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Stale-saved-37');
    placed(world, s, { unlocked: false });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    await unlock(world, s);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(state()?.pending?.tainted).toBeUndefined();
    expect(await world.answerBox(tab.id, USER, world.opts.gridPassword)).toBe(true);
    // the tab's request let in while the answer waits: marked
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    await act({ kind: 'retry-grid' });
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.proven_at).toBeUndefined();
    await notSentAgain(s);
    expect(creds()).toBe(1);
    expect(wrongAnswers()).toBe(1);
  }, 40_000);

  it('38. (R2-14) a portal tab opening as the window\'s own answer goes on record, the retry lost, a sign-in in its box: never counted as the saved one\'s', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Wrong-saved-38');
    placed(world, s, { unlocked: true });
    await boot(world);
    world.dropAuthRetry();
    const raw = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
    const orig = raw.set.bind(raw);
    let opened = false;
    raw.set = async (items) => {
      // the student's portal tab loads while the window's answer is being put on record
      if (!opened && items[SIGNIN_STATE_KEY]?.pending) {
        opened = true;
        world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
      }
      return orig(items);
    };
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(await until(() => world.boxes.size > 0)).toBe(true);
    const [tabId] = [...world.boxes.keys()];
    expect(await world.answerBox(tabId!, USER, world.opts.gridPassword)).toBe(true);
    await act({ kind: 'retry-grid' });
    expect(await until(() => gridWord() === 'signed-in')).toBe(true);
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.proven_at).toBeUndefined();
    await notSentAgain(s);
    expect(wrongAnswers()).toBe(1);
    expect(creds()).toBe(1);
  }, 40_000);

  it('39. (R2-14) a portal tab asked to sign in inside the window before its own challenge, the answer\'s retry lost, a box sign-in: never counted as the saved one\'s', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    const s = await seal('Wrong-saved-39');
    placed(world, s, { unlocked: true });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}/`, 1, true);
    await sleep(100);
    world.dropAuthRetry();
    const inWindow = duringNextWindow(10, () => world.tabChallenge(tab.id, DASHBOARD));
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    await inWindow;
    expect(state()?.pending).toBeDefined();
    expect(world.boxes.has(tab.id)).toBe(true);
    expect(await world.answerBox(tab.id, USER, world.opts.gridPassword)).toBe(true);
    await act({ kind: 'retry-grid' });
    expect(await until(() => gridWord() === 'signed-in')).toBe(true);
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.proven_at).toBeUndefined();
    await notSentAgain(s);
    expect(wrongAnswers()).toBe(1);
    expect(creds()).toBe(1);
  }, 40_000);

  it('40. (R2-15) the mark survives a worker restart between the box sign-in and the reading', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Wrong-saved-40');
    placed(world, s, { unlocked: true });
    await boot(world);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    world.openTab(`${ORIGIN}${DASHBOARD}`);
    expect(await until(() => world.boxes.size > 0)).toBe(true);
    const [tabId] = [...world.boxes.keys()];
    expect(await world.answerBox(tabId!, USER, world.opts.gridPassword)).toBe(true);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    await restart(world, 'worker');
    await act({ kind: 'retry-grid' });
    expect(await until(() => gridWord() === 'signed-in')).toBe(true);
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.proven_at).toBeUndefined();
    await notSentAgain(s);
    expect(wrongAnswers()).toBe(1);
  }, 40_000);

  it('41. (R2-05) a marked answer read signed out is not the grid turning the saved password down: a hold, no refusal counted, and Settings does not say it failed', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    // the right saved password is given, and the retry carrying it is lost
    await unlock(world, s);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    // the student mistypes in Chrome's box: the typo takes the right pair's place in Chrome's cache, and goes with it
    expect(await world.answerBox(tab.id, USER, 'Typo-in-the-box-41')).toBe(false);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    await act({ kind: 'retry-grid' });
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(world.badAnswers).toBe(0);
    expect(note()?.refused_at).toBeUndefined();
    expect(note()?.refusals ?? 0).toBe(0);
    expect(state()?.refused).toBeUndefined();
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (v) => !!v.signin)).signin.text).not.toBe(WORDS.settings.signinRefused);
  }, 30_000);

  it('41. a marked answer still waiting when the student types the right password: its reading settles it (no refusal), and the typed one is tried once and signs in', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    await unlock(world, s);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(await world.answerBox(tab.id, USER, 'Typo-in-the-box-41')).toBe(false);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    // the typed attempt's own window reads signed out, which settles the marked answer and tries nothing: a second round does
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(0);
    expect(note()?.refused_at).toBeUndefined();
  }, 30_000);

  it('41. a marked answer the attempt\'s first reading cannot settle (out of reach): the attempt\'s own window settles it, and a second round tries the typed one once', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    await unlock(world, s);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(await world.answerBox(tab.id, USER, 'Typo-in-the-box-41')).toBe(false);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    // the settling check reads out of reach (the marked answer stays); the grid answers again for the attempt's window
    world.opts.reach = false;
    const raw = world.chrome.storage.session as { set(items: Record<string, any>): Promise<void> };
    const orig = raw.set.bind(raw);
    raw.set = async (items) => {
      if (items['bridge.grid']?.session === 'unreachable') world.opts.reach = true;
      return orig(items);
    };
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(0);
    expect(note()?.refused_at).toBeUndefined();
  }, 30_000);

  it('42. (R2-23) a tab of another granted site asked to sign in while an answer is unsettled marks nothing: the reading proves it', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    placed(world, await seal(world.opts.gridPassword), { unlocked: true });
    await boot(world);
    world.grant(OTHER);
    await sleep(50);
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(state()?.pending).toBeDefined();
    // the listener as Chrome calls it for a tab of the other site
    const fn = (world.chrome.webRequest.onAuthRequired.ls as Array<{ fn: Function }>)[0]!.fn;
    await new Promise<void>((res) => fn({ requestId: '9001', url: `${OTHER}/x`, tabId: 77, type: 'main_frame', frameId: 0, parentFrameId: -1, method: 'GET', timeStamp: Date.now(), scheme: 'basic', realm: 'other', isProxy: false, challenger: { host: 'ondemand.other.edu', port: 443 }, statusCode: 401 }, () => res()));
    // and the other site's tab let in
    for (const l of world.chrome.webRequest.onCompleted.ls as Array<{ fn: Function }>) l.fn({ requestId: '9002', url: `${OTHER}/y`, tabId: 77, type: 'main_frame', statusCode: 200, fromCache: false });
    await sleep(50);
    expect(state()?.pending?.tainted).toBeUndefined();
    await act({ kind: 'retry-grid' });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(note()?.stopped_at).toBeUndefined();
  }, 30_000);

  it('43. a box over a portal tab when Beethoven answers the right saved password, left open or signed in after: proven, never put on hold', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.proven_at)).toBe(true);
    expect(world.boxes.has(tab.id)).toBe(true);
    // the student signs in in the box afterwards: nothing waits for an outcome, so nothing changes
    expect(await world.answerBox(tab.id, USER, world.opts.gridPassword)).toBe(true);
    await act({ kind: 'retry-grid' });
    await sleep(200);
    expect(note()?.stopped_at).toBeUndefined();
    expect(note()?.refused_at).toBeUndefined();
    // and after a browser restart the saved one signs in again
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(0);
  }, 40_000);
});

describe('19.0.0 second review: typed passwords and the saved one', () => {
  it("44. (R2-03) a typed password, the same as the saved (locked) one, cut off by the browser closing: the saved one is put on hold, never sent after the restart", async () => {
    const STALE = 'Stale-same-44';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 500;
    const s = await seal(STALE);
    placed(world, s, { unlocked: false });
    await boot(world);
    await typed(world, STALE);
    void send(world, { type: 'action', action: { kind: 'grid-signin', how: 'typed' } });
    expect(await until(() => creds() === 1)).toBe(true);
    // the typed try is on the note before the password goes: a time only
    expect(note()?.typed_attempt_at).toBeDefined();
    expect(JSON.stringify(note())).not.toContain(STALE);
    const stoppedAt = Date.now();
    await restart(world, 'browser');
    expect(await until(() => !!note()?.stopped_at, 1_000)).toBe(true);
    expect(note()?.typed_attempt_at).toBeUndefined();
    expect(note()?.refused_at).toBeUndefined();
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await world.fireAlarm('bridge.poll');
    await sleep(300);
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(1);
    // the closed browser's worker still waits out its outcome (OUTCOME_WAIT_MS); it ends inside this test
    await sleep(Math.max(0, stoppedAt + 7_000 - Date.now()));
  }, 30_000);

  it('44. a typed password that works while one is saved leaves no mark: after a browser restart the saved one is used', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note() && note()!.typed_attempt_at === undefined)).toBe(true);
    expect(note()?.stopped_at).toBeUndefined();
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(0);
  }, 30_000);

  it("45. (R2-04) the saved password typed while a check is trying that same saved one, typed before it was given: the grid gets it once", async () => {
    const STALE = 'Stale-same-45';
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 500;
    placed(world, await seal(STALE), { unlocked: true });
    await boot(world);
    openPort(world, 'panel');
    await act({ kind: 'sign-in-grid' });
    const opened = send(world, { type: 'panel.opened', windowId: 1 });
    await sleep(100);
    // the student types the password they know, which is the one saved (both stale), before the saved one was tried
    // (another password typed the same way is test 27: tried once after that refusal, and it signs in)
    await typed(world, STALE);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    await opened;
    await sleep(300);
    expect(world.badAnswers).toBe(1);
    expect(creds()).toBe(1);
    // and typed again after that refusal, it is the student's own word: tried once more
    await typed(world, STALE, afterRefusal());
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(2);
  }, 30_000);

  it('46. (R2-21) a typed refusal while a password is saved counts on the note, so the second after a browser restart says refusedTwice', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: false });
    await boot(world);
    await typed(world, 'Typo-46-1');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(note()?.refusals).toBe(1);
    // the typed try's mark went with its outcome
    expect(note()?.typed_attempt_at).toBeUndefined();
    await restart(world, 'browser');
    const panel = openPort(world, 'panel');
    await act({ kind: 'sign-in-grid' });
    await typed(world, 'Typo-46-2');
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: false, refused: true });
    const v = await panelView(panel, (x) => x.journey?.sheet?.note === WORDS.grid.refusedTwice, 3_000);
    expect(v.journey?.sheet?.note).toBe(WORDS.grid.refusedTwice);
  }, 30_000);

  it("47. (R2-18) a re-seal stamped before the old seal's answer went out still ends that seal's refusal: decided by seal, not by clock", async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 600;
    const s = await seal('Stale-old-47');
    placed(world, s, { unlocked: true });
    await boot(world);
    // the page stamps the new seal, then seals and puts it; the background answers with the old record meanwhile
    const { savedAt, rec } = await resealed(s, world.opts.gridPassword);
    await sleep(5);
    const check = send(world, { type: 'action', action: { kind: 'retry-grid' } });
    expect(await until(() => creds() === 1)).toBe(true);
    // the new seal's time is earlier than the old one's answer, so its refusal too: a clock would keep it
    expect(Date.now()).toBeGreaterThan(Date.parse(savedAt));
    await indexedDbRecords().put(rec);
    await world.chrome.storage.local.set({ [SIGNIN_NOTE_KEY]: { origin: ORIGIN, username: USER, saved_at: savedAt, cred: s.cred } });
    await world.chrome.storage.session.set({ [SIGNIN_UNLOCK_KEY]: { prf: s.prf, cred: s.cred } });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: true, refused: false });
    await check;
    expect(creds()).toBe(2);
    expect(world.badAnswers).toBe(1);
  }, 30_000);
});

// The last review of 19.0.0 (the skeptic's K1, K1b and K2): a hold takes effect in memory in the same turn as
// a refusal does, whatever becomes of the note's write, and the pages word it as a hold, never as a refusal.
describe('19.0.0 last review: a hold stops the saved password at once, and is never called a refusal', () => {
  /** the saved password answered, its retry lost, and a portal tab asked to sign in meanwhile (Chrome's box, never used): the answer is marked */
  async function markedSavedAnswer(): Promise<void> {
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    expect(state()?.pending).toBeDefined();
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => world.boxes.has(tab.id))).toBe(true);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    world.closeTab(tab.id);
  }

  it('48. (K1) the hold on a marked saved answer read signed out takes effect before its note is written: the same Unlock\'s own window sends nothing', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Wrong-saved-48');
    placed(world, s, { unlocked: true });
    await boot(world);
    await markedSavedAnswer();
    expect(creds()).toBe(1);
    // the hold's own write takes longer than the dashboard's round trip (Chrome's write latency is not yet measured)
    const loc = world.chrome.storage.local as { set(items: Record<string, any>): Promise<void> };
    const orig = loc.set.bind(loc);
    let slow = 0;
    loc.set = async (items) => {
      if (items[SIGNIN_NOTE_KEY]?.stopped_at) {
        slow++;
        await sleep(60);
      }
      return orig(items);
    };
    // the settle check reads signed out (marked: a hold), then the Unlock's own window
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    await act({ kind: 'retry-grid' });
    await world.fireAlarm('bridge.poll');
    await sleep(300);
    expect(slow).toBeGreaterThan(0);
    expect(creds()).toBe(1);
    // the one answer's retry never reached the grid
    expect(world.badAnswers).toBe(0);
    expect(note()?.stopped_at).toBeDefined();
    expect(note()?.refused_at).toBeUndefined();
    expect(state()?.held).toMatchObject({ source: 'saved', seal: s.note.saved_at });
  }, 30_000);

  it('49. (K1b) a hold the note could not keep (storage.local failing): the session\'s hold alone stops an unlock, the same seal, a check and the alarm; a typed password that works and differs replaces it', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal('Wrong-saved-49');
    placed(world, s, { unlocked: true });
    await boot(world);
    await markedSavedAnswer();
    const loc = world.chrome.storage.local as { set(items: Record<string, any>): Promise<void> };
    const orig = loc.set.bind(loc);
    let failed = 0;
    loc.set = async (items) => {
      if (items[SIGNIN_NOTE_KEY]?.stopped_at || items[SIGNIN_NOTE_KEY]?.refused_at) {
        failed++;
        throw new Error('QUOTA_BYTES quota exceeded');
      }
      return orig(items);
    };
    // the reading: signed out, and the answer marked: a hold, which the note cannot keep
    await act({ kind: 'retry-grid' });
    expect(await until(() => failed > 0)).toBe(true);
    expect(note()?.stopped_at).toBeUndefined();
    await act({ kind: 'retry-grid' });
    await world.fireAlarm('bridge.poll');
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(await act({ kind: 'grid-signin', how: 'saved' })).toEqual({ signedIn: false, refused: true });
    await sleep(300);
    expect(creds()).toBe(1);
    expect(world.badAnswers).toBe(0);
    expect(state()?.held).toMatchObject({ source: 'saved', seal: s.note.saved_at });
    // the panel says it is a hold, and offers no Unlock
    const panel = openPort(world, 'panel');
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid' && !!x.journey.sheet && x.journey.sheet.phase !== 'working');
    expect(v.journey.sheet).toMatchObject({ phase: 'type', note: WORDS.grid.held });
    expect(v.overlays.unlock).toBeUndefined();
    // the right password typed, another than the saved one: it is sent once and works, and the saved one goes
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(2);
    expect(await until(() => !note())).toBe(true);
    expect(await indexedDbRecords().get()).toBeUndefined();
    expect(world.badAnswers).toBe(0);
  }, 40_000);

  it('51. a hold the note could not keep, then the saved password typed and taken: the session\'s hold is lifted with the note\'s, so the saved one signs in again when Chrome has lost its copy', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: true });
    await boot(world);
    // the right saved password answered, its retry lost (Chrome keeps the copy); a portal tab let in meanwhile marks it
    world.dropAuthRetry();
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: false });
    const tab = world.openTab(`${ORIGIN}${DASHBOARD}`, 1, true);
    expect(await until(() => state()?.pending?.tainted === true)).toBe(true);
    world.closeTab(tab.id);
    const loc = world.chrome.storage.local as { set(items: Record<string, any>): Promise<void> };
    const orig = loc.set.bind(loc);
    loc.set = async (items) => {
      if (items[SIGNIN_NOTE_KEY]?.stopped_at || items[SIGNIN_NOTE_KEY]?.refused_at) throw new Error('QUOTA_BYTES quota exceeded');
      return orig(items);
    };
    // Chrome has no copy (the lost retry's, gone): the reading is signed out, and the marked answer a hold the note cannot keep
    world.authCache = undefined;
    await act({ kind: 'retry-grid' });
    expect(await until(() => !!state()?.held)).toBe(true);
    expect(note()?.stopped_at).toBeUndefined();
    // the student types the very password saved: taken, so the saved one is the same and kept, its hold lifted
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !state()?.held)).toBe(true);
    expect(await indexedDbRecords().get()).toBeDefined();
    // Chrome loses its copy again (browsing data cleared): the next check answers with the saved one, once
    world.authCache = undefined;
    const before = creds();
    await act({ kind: 'retry-grid' });
    expect(await until(() => gridWord() === 'signed-in')).toBe(true);
    expect(creds()).toBe(before + 1);
    expect(world.badAnswers).toBe(0);
  }, 40_000);

  it('50. (K2) a right saved password marked by a portal tab let in while its answer is on the wire: the next session\'s sheet says the hold\'s words, never that it did not work, and typing it keeps it', async () => {
    world = install({ indexedDB: true });
    world.opts.signedIn = false;
    world.opts.dashboardDelayMs = 300;
    const s = await seal(world.opts.gridPassword);
    placed(world, s, { unlocked: true });
    await boot(world);
    // the student's portal tab loads a page while Beethoven's answer is on the wire: Chrome's cache carries
    // that answer for it, and the grid lets it in (a sign, too, of a sign-in in Chrome's box: a hold)
    world.onPortalRequest = (r) => {
      if (r.tabId !== -1 || new URL(r.url).pathname !== DASHBOARD) return;
      world.onPortalRequest = undefined;
      setTimeout(() => world.openTab(`${ORIGIN}/pun/sys/dashboard/files`, 1, false), 330);
    };
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note()?.stopped_at)).toBe(true);
    expect(world.badAnswers).toBe(0);
    expect(note()?.refused_at).toBeUndefined();
    expect(note()?.refusals ?? 0).toBe(0);
    // the browser closes; in the next session the saved one is not sent, and the sheet words it as a hold
    await restart(world, 'browser');
    const panel = openPort(world, 'panel');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: false, refused: true });
    expect(creds()).toBe(1);
    expect(await act({ kind: 'sign-in-grid' })).toEqual({ opened: false });
    const v = await panelView(panel, (x) => x.journey?.moment === 'grid' && !!x.journey.sheet && x.journey.sheet.phase !== 'working');
    expect(v.journey.sheet).toMatchObject({ phase: 'type', saved: 'ready', note: WORDS.grid.held });
    expect(v.journey.sheet.note).not.toBe(WORDS.grid.refused);
    expect(v.overlays.unlock).toBeUndefined();
    const settings = openPort(world, 'settings');
    expect((await panelView(settings, (x) => !!x.signin)).signin.text).not.toBe(WORDS.settings.signinRefused);
    // the student types the same password: it works, so the saved one is kept and used again
    await typed(world, world.opts.gridPassword);
    expect(await act({ kind: 'grid-signin', how: 'typed' })).toEqual({ signedIn: true, refused: false });
    expect(await until(() => !!note() && !note()!.stopped_at)).toBe(true);
    await restart(world, 'browser');
    await unlock(world, s);
    expect(await act({ kind: 'grid-signin', how: 'unlocked' })).toEqual({ signedIn: true, refused: false });
    expect(creds()).toBe(3);
    expect(world.badAnswers).toBe(0);
  }, 40_000);
});
