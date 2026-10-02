// One named fixture per state the specification describes: every journey moment and every failure
// sentence, every home state of the waiting table, the log with the sample timeline, Details, Settings,
// and the welcome page before and after the press. The gallery (gallery.ts, development builds only)
// renders any of them by name; test/hygiene.test.ts reads every string in them.
//
// Built only from the words the core owns (model.ts WORDS and LOG_WORDS, terms.ts, disclosure.ts), so a
// fixture shows exactly what the student would read. Nothing here touches the browser.
import { commands } from '../core/contract';
import { PLAN_CLASS_DISCLOSURE, SHORT_STATEMENT, STATEMENT_TICK } from '../core/disclosure';
import { LOG_WORDS, WORDS, formatClock, type Action, type ButtonView, type ChecklistRow, type DetailsView, type HeroView, type HomeView, type JourneyView, type LogLine, type Overlays, type PanelView, type SettingsView, type StatusRows, type ToolbarView, type TourView, type TrackView, type WelcomeView } from '../core/model';
import { SUMMARY, TERMS_DATE, ticks } from '../core/terms';
import type { PanelLocal } from './panel';
import type { SettingsLocal } from './settings';
import type { WelcomeLocal } from './welcome';
import { needsList, routeQr, routesView, type WelcomeView12 } from './model12';
import type { ConnectionSettingsView, DirectDetails, HelperDownload, HelperOs, SheetPrompt, SignInSheetMoment, StatusRows as Rows12 } from '../core/model';

export type Fixture =
  | { name: string; surface: 'panel'; note: string; view: PanelView; local?: Partial<PanelLocal>; details?: DetailsView; log?: LogLine[] }
  | { name: string; surface: 'welcome'; note: string; view: WelcomeView | WelcomeView12; local?: Partial<WelcomeLocal> }
  | { name: string; surface: 'settings'; note: string; view: SettingsView; local?: Partial<SettingsLocal> };

// ---- the sample student ------------------------------------------------------------------------------
const NOW = Date.now();
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const ACCOUNT = 'st1234';
const EMAIL = 'alex@wayne.edu';
const PLAN = 'Max';
const TITLE = 'Wayne State grid';
const LINK = 'https://claude.ai/code?environment=env_01XzAN32jsbL8W1PAFSvitBt';
const HOST = 'ondemand.grid.wayne.edu';
const SHARED = '/rs/rs_grp_oschome/shared/beethoven/hpcworker/current';
const VPN_APP = 'GlobalProtect';
const VPN = 'protect.wayne.edu';

// ---- builders --------------------------------------------------------------------------------------
const ink = (label: string, action?: Action, extra: Partial<ButtonView> = {}): ButtonView => ({ label, tone: 'ink', action, ...extra });
const teal = (label: string, action?: Action): ButtonView => ({ label, tone: 'teal', action });
const link = (label: string, action?: Action): ButtonView => ({ label, tone: 'link', action });

const TOOLBAR: ToolbarView = { title: WORDS.toolbar.plain, lit: false };
const overlays = (o: Partial<Overlays> = {}): Overlays => ({ toolbar: TOOLBAR, ...o });

function trackAt(current: number): TrackView {
  return WORDS.track.map((label, i) => ({ label, state: i < current ? 'done' : i === current ? 'current' : 'future' })) as TrackView;
}

const journey = (j: JourneyView, o: Partial<Overlays> = {}): PanelView => ({ kind: 'journey', journey: j, overlays: overlays(o) });

const MENU: HomeView['header']['menu'] = [
  { label: WORDS.home.menu.tour, action: { kind: 'tour', event: 'start' } },
  { label: WORDS.home.menu.files, action: { kind: 'open-files' } },
  { label: WORDS.home.menu.settings, action: { kind: 'open-settings' } },
  { label: WORDS.home.menu.details, action: { kind: 'open-details' } },
  { label: WORDS.home.menu.help, action: { kind: 'open-help' } },
];

const ROWS_ONLINE: StatusRows = {
  grid: { state: 'signed-in', text: WORDS.home.gridSignedIn(ACCOUNT) },
  claude: { state: 'signed-in', text: WORDS.home.claudeSignedIn(PLAN) },
  worker: { state: 'online', text: WORDS.home.workerOnline('20 s') },
};

const rows = (worker: StatusRows['worker'], over: Partial<StatusRows> = {}): StatusRows => ({ ...ROWS_ONLINE, worker, ...over });

const FOOT_NONE: HomeView['foot'] = { confirm: { text: WORDS.home.confirm, stop: ink(WORDS.home.confirmStop, { kind: 'stop' }), keep: WORDS.home.keep }, stopping: false };

function home(h: Partial<HomeView> & { hero: HeroView }, o: Partial<Overlays> = {}): PanelView {
  const view: HomeView = {
    header: { wordmark: WORDS.product, moreLabel: WORDS.home.more, menu: MENU },
    title: TITLE,
    rows: ROWS_ONLINE,
    foot: FOOT_NONE,
    cards: [],
    log: { show: WORDS.home.showLog, hide: WORDS.home.hideLog, copy: WORDS.home.copyLog },
    ...h,
  };
  return { kind: 'home', home: view, overlays: overlays(o) };
}

const hero = (state: HeroView['state'], orb: HeroView['orb'], word: string, sub?: string, extra: Partial<HeroView> = {}): HeroView => ({ state, orb, word, sub, announce: word, ...extra });

const onlineHome = (extra: Partial<HomeView> = {}, heroExtra: Partial<HeroView> = {}): PanelView =>
  home({
    hero: hero('online', 'online', WORDS.home.onlineHero, WORDS.home.onlineSub(TITLE, 2 * 3600_000 + 14 * 60_000), { timer: { since: ago(2 * 3600 + 14 * 60) }, ...heroExtra }),
    primary: { kind: 'open-session', button: teal(WORDS.home.openSession, { kind: 'open-session' }) },
    secondary: { newSession: { label: WORDS.home.newSession, tone: 'outline', action: { kind: 'new-session' } }, copyLink: WORDS.home.copyLink, phone: WORDS.home.phone },
    link: LINK,
    foot: { ...FOOT_NONE, left: WORDS.home.renews(formatClock(NOW + 5 * 3600_000 + 46 * 60_000, true)), right: { label: WORDS.home.stop, tone: 'text' } },
    ...extra,
  }, { toolbar: { title: WORDS.toolbar.onlineFor(2 * 3600_000 + 14 * 60_000), lit: true } });

const TRY: NonNullable<HomeView['tryAsking']> = { eyebrow: WORDS.home.tryAsking, prompts: WORDS.home.prompts, copied: WORDS.home.promptCopied, dismiss: { kind: 'dismiss', card: 'try-asking' } };

const queuedHome = (word: string, sub: string, minutes: number, extra: Partial<HomeView> = {}): PanelView =>
  home({
    hero: hero('queued', 'waiting', word, sub, { timer: { since: ago(minutes * 60 + 12) }, timerPlace: 'before' }),
    track: trackAt(1),
    rows: rows({ state: 'queued', text: WORDS.home.workerInLine(minutes) }),
    foot: { ...FOOT_NONE, left: WORDS.home.asked(formatClock(NOW - (minutes * 60 + 12) * 1000, true)), right: { label: WORDS.home.cancel, tone: 'text' } },
    ...extra,
  }, { toolbar: { title: WORDS.toolbar.inLine(minutes), lit: false, badge: { text: `${minutes}m`, color: 'ochre' } } });

const TOUR: TourView = { source: 'auto', captions: WORDS.tour.captions, sceneMs: 4000, assets: { script: '/tour/diagram.js', style: '/tour/diagram.css' }, prompts: WORDS.home.prompts };

/** the sample timeline the specification gives for Show log */
export const SAMPLE_LOG: LogLine[] = [
  { at: ago(420), clock: '8:44', text: LOG_WORDS.gridSignedIn(ACCOUNT), source: 'beethoven' },
  { at: ago(418), clock: '8:44', text: LOG_WORDS.approved, source: 'beethoven' },
  { at: ago(410), clock: '8:44', text: LOG_WORDS.asked, source: 'worker' },
  { at: ago(350), clock: '8:45', text: LOG_WORDS.claudeSignedIn(PLAN), source: 'beethoven' },
  { at: ago(300), clock: '8:46', text: LOG_WORDS.inLine.line, source: 'beethoven' },
  { at: ago(60), clock: '8:50', text: LOG_WORDS.gotComputer, source: 'worker' },
  { at: ago(5), clock: '8:51', text: LOG_WORDS.online(TITLE), source: 'worker' },
];

// ---- the moments --------------------------------------------------------------------------------------
const gp = (state: 'looking' | 'still' | 'connected', text: string): JourneyView => ({
  moment: 'globalprotect',
  title: WORDS.globalprotect.title(VPN_APP),
  body: WORDS.globalprotect.body(VPN_APP, VPN),
  chip: VPN,
  status: { state, text },
});

const gridMoment = (extra: Partial<Extract<JourneyView, { moment: 'grid' }>> = {}): JourneyView => ({ moment: 'grid', title: WORDS.grid.title, body: WORDS.grid.body, ...extra });

const CHECK_ROWS = (a: ChecklistRow['state'], b: ChecklistRow['state'], c: ChecklistRow['state']): [ChecklistRow, ChecklistRow, ChecklistRow] => [
  { text: WORDS.statement.rowSignedIn(ACCOUNT), state: a },
  { text: WORDS.statement.rowApproved, state: b },
  { text: WORDS.statement.rowReady, state: c },
];

const statementMoment = (extra: Partial<Extract<JourneyView, { moment: 'statement' }>> = {}): JourneyView => ({
  moment: 'statement',
  title: WORDS.statement.title,
  lines: [...SHORT_STATEMENT],
  more: { sentences: [...PLAN_CLASS_DISCLOSURE], workerName: WORDS.statement.workerName('worker'), change: link(WORDS.statement.change, { kind: 'open-settings' }), markRestricted: link(WORDS.statement.markRestricted, { kind: 'restrict', workerName: 'worker' }) },
  tick: STATEMENT_TICK,
  connect: ink(WORDS.statement.connect, { kind: 'connect', statement: { tick: STATEMENT_TICK, lines: [...SHORT_STATEMENT], buttonLabel: WORDS.statement.connect } }),
  checklist: CHECK_ROWS('done', 'now', 'next'),
  ...extra,
});

const connectMoment = (extra: Partial<Extract<JourneyView, { moment: 'connect' }>> = {}): JourneyView => ({ moment: 'connect', hero: WORDS.connect.hero, track: trackAt(0), sub: WORDS.connect.gettingSignin, ...extra });

const claudeMoment = (extra: Partial<Extract<JourneyView, { moment: 'claude' }>> = {}): JourneyView => ({
  moment: 'claude',
  title: WORDS.claude.title,
  body: WORDS.claude.body,
  box: { placeholder: WORDS.claude.placeholder, focus: true, checking: false, continueLabel: WORDS.claude.continue },
  reopen: link(WORDS.claude.reopen, { kind: 'reopen-claude-tab' }),
  ...extra,
});

const LINE = commands.loginSetup(SHARED);
const loginMoment = (phase: Extract<JourneyView, { moment: 'login-setup' }>['phase']): JourneyView => {
  const base = { moment: 'login-setup' as const, phase, title: WORDS.loginSetup.title, line: LINE };
  switch (phase) {
    case 'offer':
      return { ...base, body: WORDS.loginSetup.body, button: ink(WORDS.loginSetup.open, { kind: 'open-terminal-for-login-setup' }) };
    case 'password':
      return { ...base, body: WORDS.loginSetup.typePassword, button: ink(WORDS.loginSetup.imIn, { kind: 'login-setup-in' }) };
    case 'checking':
      return { ...base, body: WORDS.loginSetup.checking };
    case 'done':
      return { ...base, body: WORDS.loginSetup.done };
    case 'paste':
      return { ...base, body: WORDS.loginSetup.paste, fold: { label: WORDS.loginSetup.whatLine, line: LINE, explain: WORDS.loginSetup.lineExplain } };
    case 'closed':
      return { ...base, body: WORDS.loginSetup.notYet, button: ink(WORDS.loginSetup.open, { kind: 'open-terminal-for-login-setup' }) };
  }
};

const queueMoment = (extra: Partial<Extract<JourneyView, { moment: 'queue' }>> = {}, seconds = 161): JourneyView => ({
  moment: 'queue',
  hero: WORDS.queue.hero,
  timer: { since: ago(seconds) },
  sub: [WORDS.queue.sub],
  reason: 'line',
  track: trackAt(1),
  ...extra,
});

const startingMoment = (extra: Partial<Extract<JourneyView, { moment: 'starting' }>> = {}): JourneyView => ({
  moment: 'starting',
  hero: WORDS.starting.hero,
  sub: WORDS.starting.gotComputerTimed('0:20'),
  timer: { since: ago(20) },
  track: trackAt(2),
  ...extra,
});

const onlineMoment = (extra: Partial<Extract<JourneyView, { moment: 'online' }>> = {}): JourneyView => ({
  moment: 'online',
  hero: WORDS.online.hero,
  sub: WORDS.online.ready(7, TITLE),
  primary: teal(WORDS.online.open, { kind: 'open-session' }),
  track: trackAt(3),
  burst: true,
  ...extra,
});

// ---- the welcome page -----------------------------------------------------------------------------------
const welcomeView = (extra: Partial<WelcomeView12> = {}): WelcomeView12 => ({
  headline: WORDS.welcome.headline,
  subline: WORDS.welcome.subline,
  needsTitle: WORDS.welcome.needsTitle,
  // 12.0.0: the four prerequisites with their QR codes, and the grid code's two routes (model12.ts)
  needs: needsList(),
  routes: routesView(),
  summaryTitle: WORDS.welcome.summaryTitle,
  summary: [...SUMMARY],
  ticks: ticks().map((t) => ({ ...t })),
  terms: { show: WORDS.welcome.showTerms, hide: WORDS.welcome.hideTerms, licenseUrl: '/LICENSE.txt', privacyUrl: '/PRIVACY.md', links: { openInTab: WORDS.welcome.openInTab, save: WORDS.welcome.saveCopy, print: WORDS.welcome.print } },
  agree: { label: WORDS.welcome.agree, busyLabel: WORDS.welcome.opening },
  allowNote: WORDS.welcome.allowNote(HOST),
  footer: { nothingLeaves: WORDS.welcome.footerNothingLeaves, otherPortal: WORDS.welcome.footerOtherPortal },
  portal: { origin: `https://${HOST}`, hostname: HOST, fieldLabel: WORDS.welcome.footerOtherPortal, usePortal: WORDS.welcome.usePortal },
  state: 'idle',
  ...extra,
});

// ---- Details and Settings ---------------------------------------------------------------------------------
const CHECK_TITLES = ['Access and agreement', 'Portal connected', 'How Beethoven reaches the grid', 'Portal reachable and signed in', 'Shell app admits a connection', 'Files app lists your home', 'Active Jobs lists your clusters', 'Optional submit routes (informational)', 'Reverse proxy (informational)', 'Scheduler and container runtime found', 'Probe job has run on a compute node', 'Claude Code runs on the compute node', 'Signed in to Claude on the cluster', 'Remote Control consent recorded', 'Runtime directory writable on the node', 'Data classification acknowledged', 'Portal session age'];

const detailsView = (running = false): DetailsView => ({
  title: WORDS.details.title,
  checks: {
    running,
    runningText: WORDS.details.running,
    run: { label: WORDS.details.runChecks, tone: 'ink', action: { kind: 'run-checks' }, busy: running },
    copy: { label: WORDS.details.copyReport, tone: 'outline', action: { kind: 'copy-report' } },
    items: CHECK_TITLES.map((title, i) => ({ id: `c${i + 1}`, title, ok: i !== 10 && i !== 7, warn: i === 10, skip: i === 7, detail: i === 2 ? 'direct (the background reaches the portal with the browser sign-in)' : i === 10 ? 'probe job 4418820 last ran 3 days ago on node 1201' : i === 7 ? 'not configured at this site' : 'ok' })),
  },
  run: { job: '4419310', nextJob: '4419377', partition: 'reqp', qos: 'requeue', node: 'gpu-0203', schedulerState: 'RUNNING', reason: 'None', expectedStart: '', checkedAt: ago(40), submittedAt: ago(420), gotComputerAt: ago(60), onlineAt: ago(5), heartbeatAgeS: 12, restarts: [], chainNote: 'successor 4419377 queued to take over at the wall time', consentSource: 'connect --consent (yes 2026-10-01T12:44:03Z)', plan: 'max' },
  progressTail: ['2026-10-01T12:44:03Z Asked the grid for a computer', '2026-10-01T12:50:11Z Got a computer', '2026-10-01T12:50:40Z Connecting to Claude', `2026-10-01T12:51:02Z Online: ${LINK}`],
  rcTail: 'Remote Control active\nEnvironment: env_01XzAN32jsbL8W1PAFSvitBt\nSession: Wayne State grid',
  audit: ['2026-10-01T12:44:01Z GET /pun/sys/dashboard/ 200', '2026-10-01T12:44:03Z SHELL connect (scheduler) ok', '2026-10-01T12:45:03Z SHELL worker status --json (scheduler) ok'],
  shellHost: 'default',
  siteProfile: 'wayne',
  channel: 'direct',
  loginSetup: { proven: false, text: WORDS.details.loginSetupUnproven },
  probe: { label: WORDS.details.probe, tone: 'outline', action: { kind: 'check-compute-node' } },
  footer: WORDS.details.footer,
  onlineLag: WORDS.details.onlineLag,
});

const settingsView = (appearance: 'cream' | 'system' = 'cream'): SettingsView => ({
  title: WORDS.settings.title,
  worker: {
    name: 'worker',
    permissionMode: 'default',
    modes: [
      { value: 'default', label: WORDS.settings.modes.default },
      { value: 'acceptEdits', label: WORDS.settings.modes.acceptEdits },
      { value: 'plan', label: WORDS.settings.modes.plan },
    ],
    keepRunning: true,
    openClaude: true,
  },
  appearance: { value: appearance, options: [{ value: 'cream', label: WORDS.settings.appearances.cream }, { value: 'system', label: WORDS.settings.appearances.system }] },
  grid: { address: HOST, change: WORDS.settings.change, disconnect: WORDS.settings.disconnect },
  agreement: { acceptedOn: WORDS.settings.acceptedOn(TERMS_DATE), installId: '6f1e2a9b0c4d4e8fa1b2c3d4e5f60718', installIdLabel: WORDS.settings.installId, record: 'the record', saveRecord: WORDS.settings.saveRecord, showTerms: WORDS.settings.showTerms, save: WORDS.settings.saveCopy, print: WORDS.settings.print },
  activity: { show: WORDS.settings.show, export: WORDS.settings.export, clear: WORDS.settings.clear, count: 128 },
  drive: { title: WORDS.settings.drive, connected: false },
  labLead: { title: WORDS.settings.labLead, shellHost: 'Shell host: default', siteProfile: 'Site profile: wayne', hashes: ['LICENSE.txt sha256 3f1c…a9e2', 'PRIVACY.md sha256 77b0…41cd'] },
  connection: connectionView(),
});

// ---- 12.0.0: the direct way ----------------------------------------------------------------------------------
const D = WORDS.direct;
const APP = VPN_APP;
const textBtn = (label: string, action?: Action, extra: Partial<ButtonView> = {}): ButtonView => ({ label, tone: 'text', action, ...extra });

/** the helper stream's public/bridge/manifest.json as of 2026-10-02: each zip, its size and the installer inside it */
const BRIDGE_FILES: Record<HelperOs, { bytes: number; open: string }> = {
  windows: { bytes: 12_660, open: 'install.cmd' },
  mac: { bytes: 9_171, open: 'install.command' },
  linux: { bytes: 13_198, open: 'install.sh' },
};

const download = (os: HelperOs): HelperDownload & { label: string; fileLine: string } => {
  const osLabel = os === 'windows' ? 'Windows' : os === 'mac' ? 'macOS' : 'Linux';
  const file = `beethoven-bridge-${os}.zip`;
  const { bytes, open } = BRIDGE_FILES[os];
  const size = `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return { os, osLabel, url: `/bridge/${file}`, file, open, size, bytes, kind: 'script', version: '1.0.0', label: D.installHelper.download(osLabel), fileLine: D.installHelper.fileLine(file, size) };
};

const helperMoment = (os: HelperOs, status: Extract<JourneyView, { moment: 'install-helper' }>['status'], extra: Partial<Extract<JourneyView, { moment: 'install-helper' }>> = {}): JourneyView => ({
  moment: 'install-helper',
  title: D.installHelper.title,
  body: D.installHelper.body,
  download: download(os),
  steps: [...D.installHelper.stepsNamed[os](BRIDGE_FILES[os].open)],
  ...(D.installHelper.osNote[os] ? { osNote: D.installHelper.osNote[os]! } : {}),
  unsignedNote: D.installHelper.unsignedNote,
  status,
  checkAgain: ink(D.installHelper.checkAgain, { kind: 'check-bridge' }),
  useVpn: textBtn(D.installHelper.useVpn(APP), { kind: 'use-vpn' }),
  ...extra,
});

const PASSWORD: SheetPrompt = { text: 'Password: ', echo: false, kind: 'password' };
const CODE: SheetPrompt = { text: 'Your google authenticator one-time verification code: ', echo: true, kind: 'code', hint: D.signin.codeHint };

const sheet = (phase: SignInSheetMoment['phase'], extra: Partial<SignInSheetMoment> = {}): JourneyView => ({
  moment: 'sign-in-sheet',
  phase,
  title: D.signin.title,
  account: { label: D.signin.accountLabel, placeholder: D.signin.accountPlaceholder, ...(phase === 'account' ? {} : { value: ACCOUNT }) },
  privacy: D.signin.privacy,
  submit: ink(D.signin.continue, phase === 'account' ? { kind: 'grid-signin-account', account: '' } : { kind: 'grid-signin-answer', text: '' }),
  cancel: textBtn(D.signin.cancel, { kind: 'grid-signin-change' }),
  useVpn: textBtn(D.signin.useVpn(APP), { kind: 'use-vpn' }),
  purpose: 'enrol',
  ...(phase === 'account' ? { protect: { label: D.settings.protectKey, note: D.settings.protectKeyNote, available: true } } : {}),
  ...extra,
});

const routeChoiceMoment: JourneyView = {
  moment: 'choose-route',
  title: D.chooseRoute.title,
  body: D.chooseRoute.body,
  options: [
    { id: 'laptop', title: D.chooseRoute.laptop.title, detail: D.chooseRoute.laptop.detail, button: ink(D.chooseRoute.laptop.button, { kind: 'choose-route', route: 'laptop' }) },
    { id: 'phone', title: D.chooseRoute.phone.title, detail: D.chooseRoute.phone.detail, button: ink(D.chooseRoute.phone.button, { kind: 'choose-route', route: 'phone' }) },
  ],
  useVpn: textBtn(D.signin.useVpn(APP), { kind: 'use-vpn' }),
  warning: D.codeSetup.warning,
};

const codeSetupMoment = (route: 'laptop' | 'phone'): JourneyView => ({
  moment: 'code-setup',
  route,
  title: route === 'laptop' ? D.codeSetup.laptopTitle : D.codeSetup.phoneTitle,
  steps: [...(route === 'laptop' ? D.codeSetup.laptopSteps : D.codeSetup.phoneSteps)],
  // the laptop route: the Authenticator's two store pages (for the phone) and the grid's own pages (links here)
  qr: route === 'laptop' ? [...routeQr('laptop'), { id: 'grid-site', label: D.codeSetup.openSite, url: 'https://ondemand.grid.wayne.edu' }] : routeQr('phone'),
  warning: D.codeSetup.warning,
  done: ink(D.codeSetup.done, { kind: 'grid-signin-retry' }),
  back: textBtn(D.codeSetup.back, { kind: 'route-back' }),
  useVpn: textBtn(D.signin.useVpn(APP), { kind: 'use-vpn' }),
});

const protectMoment = (extra: Partial<Extract<JourneyView, { moment: 'protect-key-optional' }>> = {}): JourneyView => ({
  moment: 'protect-key-optional',
  title: D.protectKey.title,
  body: D.protectKey.body,
  on: { label: D.protectKey.on, busyLabel: D.protectKey.turningOn, available: true },
  notNow: ink(D.protectKey.notNow, { kind: 'protect-key-later' }),
  ...extra,
});

const via = (mode: 'direct' | 'vpn', locked = false): Rows12['grid']['via'] => ({ mode, text: mode === 'direct' ? D.rowDirect : D.rowVpn(APP), ...(locked ? { locked: { text: D.rowLocked, unlock: D.rowUnlock } } : {}) });

const directDetails = (protectedKey: boolean): DirectDetails => ({
  mode: 'direct (Connection: Direct when possible; a bridge answered)',
  bridges: ['store: not available (no allowlisted extension offers a port to others)', 'relay: not configured (the site profile names none)', 'helper: available (1.0.0, script, windows)'],
  host: 'grid.wayne.edu:22',
  pin: 'ssh-rsa SHA256:kLTz1xK6anQ1denM+31kDEryQtgan2P76r9aLno+K3s',
  key: `ecdsa-sha2-nistp256 SHA256:Xq3v0yF1m7Qd4WkR2b9cT8nJ5hL6pA1sE0uZ3gV7iYo, protected: ${protectedKey ? 'yes' : 'no'}, enrolled 2026-10-02`,
  reach: 'grid.wayne.edu:22 answered at 2026-10-02T14:05:11Z with the pinned identity',
  account: ACCOUNT,
  helperFile: 'beethoven-bridge-windows.zip, 12660 bytes, sha256 9249bf47…7c497a95',
  unproven: WORDS.details.directUnproven,
});

const connectionView = (extra: Partial<ConnectionSettingsView> = {}, protectKey: Partial<ConnectionSettingsView['protectKey']> = {}): ConnectionSettingsView => ({
  title: D.settings.title,
  mode: { label: D.settings.modeLabel, value: 'direct', options: [{ value: 'direct', label: D.settings.modes.direct }, { value: 'vpn', label: D.settings.modes.vpn }] },
  protectKey: { label: D.settings.protectKey, note: D.settings.protectKeyNote, value: false, available: true, present: true, ...protectKey },
  keyLine: protectKey.value ? D.settings.keyProtected : D.settings.keyPlain,
  forget: { label: D.settings.forget, note: D.settings.forgetNote, confirm: D.settings.forgetConfirm, button: { label: D.settings.forgetButton, tone: 'ink', action: { kind: 'forget-computer' } }, disabled: false },
  helper: { label: D.settings.helper, text: D.settings.helperInstalled('1.0.0'), installed: true, checkAgain: { label: D.installHelper.checkAgain, tone: 'outline', action: { kind: 'check-bridge' } } },
  ...extra,
});

// ---- the list ----------------------------------------------------------------------------------------------
export const FIXTURES: Fixture[] = [
  // the welcome page (moment 2)
  { name: 'welcome', surface: 'welcome', note: 'before the press', view: welcomeView() },
  { name: 'welcome-ticked', surface: 'welcome', note: 'ticked, ready to press', view: welcomeView(), local: { ticked: { agree: true } } },
  { name: 'welcome-terms', surface: 'welcome', note: 'Show terms expanded in place', view: welcomeView(), local: { termsOpen: true, termsOpenedAt: ago(10) } },
  { name: 'welcome-opening', surface: 'welcome', note: 'the press: spinner and Opening the grid…', view: welcomeView({ state: 'opening' }), local: { ticked: { agree: true } } },
  { name: 'welcome-denied', surface: 'welcome', note: 'Deny in Chrome’s prompt', view: welcomeView({ state: 'denied', problem: WORDS.welcome.denied(HOST) }), local: { ticked: { agree: true } } },
  { name: 'welcome-no-panel', surface: 'welcome', note: 'the panel did not open', view: welcomeView({ state: 'no-panel', problem: WORDS.welcome.panelNotOpened }), local: { ticked: { agree: true } } },
  { name: 'welcome-save-failed', surface: 'welcome', note: 'the record could not be saved', view: welcomeView({ state: 'save-failed', problem: WORDS.welcome.saveFailed }), local: { ticked: { agree: true } } },
  { name: 'welcome-other-portal', surface: 'welcome', note: 'Use another portal: the field slid open', view: welcomeView(), local: { portalOpen: true, portalInput: HOST } },
  { name: 'welcome-claude-address', surface: 'welcome', note: 'an Anthropic address refused before any prompt', view: welcomeView(), local: { portalOpen: true, portalInput: 'claude.ai', portalError: WORDS.welcome.anthropicRefused } },
  // the core's welcome view as it is sent today (11.0.0's three needs, no route choice): the page draws Wayne State's in the 12.0.0 form
  {
    name: 'welcome-core-view',
    surface: 'welcome',
    note: "12.0.0: the core's three-need view, drawn in the 12.0.0 form by the page",
    view: welcomeView({
      needs: [
        { ...WORDS.welcome.needs[0], link: { label: WORDS.welcome.needs[0].link, url: 'https://services.wayne.edu/TDClient/277/Portal/KB/ArticleDet?ID=20199' } },
        { ...WORDS.welcome.needs[1], link: { label: WORDS.welcome.needs[1].link, url: 'https://services.wayne.edu/TDClient/277/Portal/KB/Article/20314/Wayne-State-VPN-and-the-Global-Protect-client' } },
        { ...WORDS.welcome.needs[2], link: { label: WORDS.welcome.needs[2].link, url: 'https://claude.ai/upgrade' } },
      ],
      routes: undefined,
    }),
  },
  { name: 'welcome-route-laptop', surface: 'welcome', note: '12.0.0: No grid code yet? On this computer', view: welcomeView(), local: { route: 'laptop' } },
  { name: 'welcome-route-phone', surface: 'welcome', note: '12.0.0: No grid code yet? With my phone (the square codes under their steps)', view: welcomeView(), local: { route: 'phone', qrPick: { 'route-phone-q1-0': 1 } } },
  { name: 'welcome-qr-android', surface: 'welcome', note: '12.0.0: the Authenticator code switched to Android', view: welcomeView(), local: { qrPick: { 'need-code-1': 1 } } },
  { name: 'welcome-handoff', surface: 'welcome', note: 'after the press: the panel carries on', view: welcomeView({ state: 'handoff', handoff: { text: WORDS.welcome.handoff, hero: { state: 'asked', orb: 'starting', word: WORDS.connect.hero, sub: WORDS.connect.gettingSignin, announce: WORDS.connect.hero } } }) },

  // the panel before the agreement, and while the welcome page carries moment 2
  { name: 'terms-needed', surface: 'panel', note: 'the panel before the agreement (D19)', view: { kind: 'terms-needed', body: WORDS.termsNeeded.body, button: ink(WORDS.termsNeeded.button, { kind: 'open-settings' }) } },
  { name: 'j-welcome', surface: 'panel', note: 'the panel before the agreement, nothing pressed: finish on the welcome page', view: journey({ moment: 'welcome', state: 'finish', title: WORDS.welcomeMoment.finishTitle, body: WORDS.termsNeeded.body, button: ink(WORDS.termsNeeded.button, { kind: 'open-settings' }) }) },
  { name: 'j-welcome-waiting', surface: 'panel', note: 'the panel opened by the press, Chrome asking', view: journey({ moment: 'welcome', state: 'waiting', title: WORDS.welcomeMoment.almostTitle, body: WORDS.welcomeMoment.almostBody, status: WORDS.welcomeMoment.waiting }) },
  { name: 'j-welcome-denied', surface: 'panel', note: 'after Deny in Chrome\u2019s box', view: journey({ moment: 'welcome', state: 'denied', title: WORDS.welcomeMoment.almostTitle, body: WORDS.welcomeMoment.deniedBody }) },
  { name: 'j-welcome-revoked', surface: 'panel', note: 'the portal\u2019s grant taken away after the first run', view: journey({ moment: 'welcome', state: 'revoked', title: WORDS.welcomeMoment.revokedTitle, body: WORDS.welcomeMoment.revokedBody(HOST), button: ink(WORDS.welcomeMoment.revokedButton, { kind: 'use-portal', origin: `https://${HOST}`, granted: false }), origin: `https://${HOST}` }) },

  // 12.0.0: the direct way. The helper's one-time download (D1)
  { name: 'j-helper', surface: 'panel', note: '12.0.0: One small download, once (Windows): before the download', view: journey(helperMoment('windows', { state: 'idle' })) },
  { name: 'j-helper-waiting', surface: 'panel', note: '12.0.0: downloaded; the steps, the warning, Beethoven looks by itself (not a failure)', view: journey(helperMoment('windows', { state: 'waiting', text: D.installHelper.waiting })) },
  { name: 'j-helper-looking', surface: 'panel', note: "12.0.0: the student's own Check again", view: journey(helperMoment('windows', { state: 'looking', text: D.installHelper.checking }, { checkAgain: ink(D.installHelper.checkAgain, { kind: 'check-bridge' }, { busy: true }) })) },
  { name: 'j-helper-mac', surface: 'panel', note: '12.0.0: the steps on a Mac (Gatekeeper)', view: journey(helperMoment('mac', { state: 'looking', text: D.installHelper.checking })) },
  { name: 'j-helper-linux', surface: 'panel', note: '12.0.0: the steps on Linux', view: journey(helperMoment('linux', { state: 'looking', text: D.installHelper.checking })) },
  { name: 'j-helper-not-found', surface: 'panel', note: '12.0.0: Check again found nothing yet', view: journey(helperMoment('windows', { state: 'not-found', text: D.installHelper.notFound })) },
  { name: 'j-helper-broken', surface: 'panel', note: '12.0.0: the helper is there but did not answer', view: journey(helperMoment('windows', { state: 'broken', text: D.installHelper.broken })) },
  { name: 'j-helper-found', surface: 'panel', note: '12.0.0: the helper answered (drawn check)', view: journey(helperMoment('windows', { state: 'found', text: D.installHelper.found })) },
  { name: 'j-helper-none', surface: 'panel', note: '12.0.0: no helper for this computer (ChromeOS)', view: journey(helperMoment('windows', { state: 'idle' }, { download: undefined, steps: [] })) },

  // 12.0.0: Beethoven's own sign-in sheet (R2)
  { name: 'j-sheet-account', surface: 'panel', note: '12.0.0: Sign in to the grid: the AccessID, the opt-in tick unticked', view: journey(sheet('account')) },
  { name: 'j-sheet-account-ticked', surface: 'panel', note: '12.0.0: the opt-in ticked (Windows Hello runs in the press)', view: journey(sheet('account', { account: { label: D.signin.accountLabel, placeholder: D.signin.accountPlaceholder, value: ACCOUNT } })), local: { protectTicked: true } },
  { name: 'j-sheet-account-bad', surface: 'panel', note: '12.0.0: not an AccessID', view: journey(sheet('account', { account: { label: D.signin.accountLabel, placeholder: D.signin.accountPlaceholder, error: D.signin.accountBad } })) },
  { name: 'j-sheet-connecting', surface: 'panel', note: '12.0.0: the bridge opens the connection and checks the grid', view: journey(sheet('connecting', { status: D.signin.connecting })) },
  { name: 'j-sheet-password', surface: 'panel', note: "12.0.0: the grid's own password prompt", view: journey(sheet('prompt', { prompts: [PASSWORD] })) },
  { name: 'j-sheet-code', surface: 'panel', note: "12.0.0: the grid's own code prompt", view: journey(sheet('prompt', { prompts: [CODE] })) },
  { name: 'j-sheet-both', surface: 'panel', note: '12.0.0: a grid that asks for both at once', view: journey(sheet('prompt', { prompts: [PASSWORD, CODE] })) },
  { name: 'j-sheet-not-accepted', surface: 'panel', note: '12.0.0: refused once; the grid asks again', view: journey(sheet('prompt', { prompts: [PASSWORD], notice: D.signin.notAccepted })) },
  { name: 'j-sheet-working', surface: 'panel', note: '12.0.0: Signing in…', view: journey(sheet('working', { status: D.signin.working })) },
  { name: 'j-sheet-setting-up', surface: 'panel', note: '12.0.0: accepted; Setting up this computer…', view: journey(sheet('working', { status: D.signin.settingUp })) },
  { name: 'j-sheet-checking-key', surface: 'panel', note: '12.0.0: Checking the new key…', view: journey(sheet('working', { status: D.signin.checking })) },
  { name: 'j-sheet-stopped', surface: 'panel', note: '12.0.0: three refusals: GlobalProtect now, Try again after the cooldown', view: journey(sheet('stopped', { problem: { title: D.signin.stoppedTitle, body: D.signin.stoppedBody(APP), button: ink(D.signin.useVpn(APP), { kind: 'use-vpn' }) }, secondary: textBtn(D.signin.tryAgainAt('3:42 PM'), undefined, { disabled: true }), useVpn: undefined })) },
  { name: 'j-sheet-stopped-later', surface: 'panel', note: '12.0.0: three refusals, the cooldown over: Try again is back', view: journey(sheet('stopped', { problem: { title: D.signin.stoppedTitle, body: D.signin.stoppedBody(APP), button: ink(D.signin.useVpn(APP), { kind: 'use-vpn' }) }, secondary: textBtn(D.signin.tryAgain, { kind: 'grid-signin-retry' }), useVpn: undefined })) },
  { name: 'j-sheet-code-refused', surface: 'panel', note: "12.0.0: the grid's \"wrong code, or no 2FA\": type it again, or no code yet", view: journey(sheet('code-refused', { problem: { title: D.signin.codeRefusedTitle, body: D.signin.codeRefused, button: ink(D.signin.codeAgain, { kind: 'grid-signin-retry' }) }, secondary: textBtn(D.signin.noCode, { kind: 'no-grid-code' }) })) },
  { name: 'j-sheet-code-refused-twice', surface: 'panel', note: '12.0.0: the same refusal twice in a row: no code yet first', view: journey(sheet('code-refused', { problem: { title: D.signin.codeRefusedTitle, body: D.signin.codeRefused, button: ink(D.signin.noCode, { kind: 'no-grid-code' }) }, secondary: textBtn(D.signin.codeAgain, { kind: 'grid-signin-retry' }) })) },
  { name: 'j-sheet-wrong-grid', surface: 'panel', note: "12.0.0: the grid's identity did not match: nothing sent", view: journey(sheet('failed', { problem: { title: D.signin.wrongGridTitle, body: D.signin.wrongGrid, button: textBtn(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-unreachable', surface: 'panel', note: "12.0.0: the grid's port did not answer", view: journey(sheet('failed', { problem: { title: D.signin.unreachableTitle, body: D.signin.unreachableBody, button: ink(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-dropped', surface: 'panel', note: '12.0.0: the connection ended', view: journey(sheet('failed', { problem: { title: D.signin.droppedTitle, body: D.signin.dropped, button: ink(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-key-not-taken', surface: 'panel', note: "12.0.0: the grid didn't take the key", view: journey(sheet('failed', { problem: { title: D.signin.keyNotTakenTitle, body: D.signin.keyNotTaken, button: ink(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-key-refused', surface: 'panel', note: "12.0.0: the grid's tool refused the key, in its own sentence", view: journey(sheet('failed', { problem: { title: D.signin.keyNotTakenTitle, body: D.signin.keyRefused('your home folder can be changed by others; ask your lab lead.'), button: ink(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-key-store', surface: 'panel', note: "12.0.0: this browser couldn't keep the key (nothing was asked of the grid)", view: journey(sheet('failed', { problem: { title: D.signin.keyStoreTitle, body: D.signin.keyStore, button: ink(D.signin.tryAgain, { kind: 'grid-signin-retry' }) } })) },
  { name: 'j-sheet-old-copy', surface: 'panel', note: "12.0.0: the lab's copy on the grid is older than framework 11", view: journey(sheet('failed', { problem: { title: D.signin.keyNotTakenTitle, body: D.signin.oldCopy } })) },
  { name: 'j-sheet-unlock', surface: 'panel', note: '12.0.0: the protected key, once this browser session', view: journey(sheet('unlock', { title: D.signin.unlockTitle, instruction: D.signin.unlockBody, submit: ink(D.signin.unlock, { kind: 'unlock-key', outcome: 'unlocked' }), secondary: textBtn(D.signin.cantUnlock, { kind: 'forget-computer' }) })) },
  { name: 'j-sheet-unlock-failed', surface: 'panel', note: "12.0.0: That didn't unlock, with the ways out", view: journey(sheet('unlock', { title: D.signin.unlockTitle, instruction: D.signin.unlockBody, problem: { body: D.signin.unlockFailed }, submit: ink(D.signin.unlock, { kind: 'unlock-key', outcome: 'unlocked' }), secondary: textBtn(D.signin.cantUnlock, { kind: 'forget-computer' }) })) },
  { name: 'j-sheet-unlock-busy', surface: 'panel', note: '12.0.0: Windows Hello is up', view: journey(sheet('unlock', { title: D.signin.unlockTitle, instruction: D.signin.unlockBody, submit: ink(D.signin.unlock, { kind: 'unlock-key', outcome: 'unlocked' }), secondary: textBtn(D.signin.cantUnlock, { kind: 'forget-computer' }) })), local: { keyBusy: 'unlock' } },

  // 12.0.0: the grid has no code for this account yet
  { name: 'j-choose-route', surface: 'panel', note: '12.0.0: Set up your grid code first', view: journey(routeChoiceMoment) },
  { name: 'j-code-setup-laptop', surface: 'panel', note: '12.0.0: the code on this computer', view: journey(codeSetupMoment('laptop')) },
  { name: 'j-code-setup-phone', surface: 'panel', note: '12.0.0: the code with my phone (square codes under their steps)', view: journey(codeSetupMoment('phone')) },

  // 12.0.0: after the sign-in
  { name: 'j-enrolled', surface: 'panel', note: '12.0.0: This computer is set up.', view: journey({ moment: 'enrolled', title: D.enrolled.title, body: D.enrolled.body, account: ACCOUNT, continue: ink(D.enrolled.continue, { kind: 'grid-signin-continue' }) }) },
  { name: 'j-protect', surface: 'panel', note: '12.0.0: the optional protection (Not now is the default)', view: journey(protectMoment()) },
  { name: 'j-protect-busy', surface: 'panel', note: '12.0.0: Windows Hello is up', view: journey(protectMoment()), local: { keyBusy: 'protect' } },
  { name: 'j-protect-on', surface: 'panel', note: '12.0.0: Protected.', view: journey(protectMoment({ title: D.protectKey.titleOn, outcome: D.protectKey.turnedOn, notNow: ink(D.enrolled.continue, { kind: 'protect-key-later' }) })) },
  { name: 'j-protect-cancelled', surface: 'panel', note: '12.0.0: cancelled at the system prompt', view: journey(protectMoment({ outcome: D.protectKey.cancelled })) },
  { name: 'j-protect-unsupported', surface: 'panel', note: '12.0.0: a computer with no Windows Hello or Touch ID', view: journey(protectMoment({ on: { label: D.protectKey.on, busyLabel: D.protectKey.turningOn, available: false } })) },
  { name: 'j-fallback', surface: 'panel', note: '12.0.0: Using GlobalProtect', view: journey({ moment: 'fallback-to-vpn', title: D.fallback.title(APP), body: D.fallback.body(APP), continue: ink(D.fallback.continue, { kind: 'fallback-continue' }), tryDirect: textBtn(D.fallback.tryDirect, { kind: 'try-direct' }) }) },

  // moment 4
  { name: 'j-gp-looking', surface: 'panel', note: 'GlobalProtect: looking for the grid', view: journey(gp('looking', WORDS.globalprotect.looking)) },
  { name: 'j-gp-still', surface: 'panel', note: 'GlobalProtect: after 45 s', view: journey(gp('still', WORDS.globalprotect.still(VPN_APP))) },
  { name: 'j-gp-connected', surface: 'panel', note: 'GlobalProtect: the grid answers (700 ms)', view: journey(gp('connected', WORDS.globalprotect.connected)) },
  { name: 'j-gp-no-profile', surface: 'panel', note: 'a portal with no site profile (D20)', view: journey({ moment: 'globalprotect', title: WORDS.globalprotect.titleNoProfile, body: WORDS.globalprotect.bodyNoProfile, status: { state: 'looking', text: WORDS.globalprotect.looking } }) },

  // moment 5
  { name: 'j-grid', surface: 'panel', note: 'sign in to the grid: Chrome’s own box', view: journey(gridMoment()) },
  { name: 'j-grid-signed-in', surface: 'panel', note: 'signed in: the tab closes itself', view: journey(gridMoment({ signedIn: WORDS.grid.signedIn(ACCOUNT) })) },
  { name: 'j-grid-cancelled', surface: 'panel', note: 'Cancel or a wrong password in Chrome’s box (the two look the same to an extension)', view: journey(gridMoment({ problem: { body: WORDS.grid.notYet, button: ink(WORDS.grid.signInAgain, { kind: 'sign-in-grid' }) } })) },
  { name: 'j-grid-tab-closed', surface: 'panel', note: 'the sign-in tab was closed', view: journey(gridMoment({ problem: { body: WORDS.grid.tabClosed, button: ink(WORDS.grid.signInAgain, { kind: 'sign-in-grid' }) } })) },
  { name: 'j-grid-start-page', surface: 'panel', note: 'the tab landed on /public/start.html', view: journey(gridMoment({ problem: { body: WORDS.grid.startPage } })) },
  { name: 'j-grid-unreachable', surface: 'panel', note: 'the grid stops answering', view: journey(gridMoment({ problem: { body: WORDS.grid.unreachable(VPN_APP), button: ink(WORDS.grid.tryAgain, { kind: 'retry-grid' }) } })) },
  { name: 'j-grid-not-ood', surface: 'panel', note: 'a 200 with no "Logged in as"', view: journey(gridMoment({ problem: { body: WORDS.grid.notOod, button: ink(WORDS.grid.useAnother, { kind: 'open-settings' }) } })) },

  // moment 6
  { name: 'j-statement', surface: 'panel', note: 'Where your work goes: approval running underneath', view: journey(statementMoment()) },
  { name: 'j-statement-ticked', surface: 'panel', note: 'ticked; every row done', view: journey(statementMoment({ checklist: CHECK_ROWS('done', 'done', 'done') })), local: { statementTicked: true } },
  { name: 'j-statement-more', surface: 'panel', note: 'More about your data, open', view: journey(statementMoment()), local: { moreOpen: true } },
  { name: 'j-statement-early', surface: 'panel', note: 'pressed before setup finished: kept', view: journey(statementMoment({ connect: ink(WORDS.statement.connectingWhenReady, undefined, { busy: true }), checklist: CHECK_ROWS('done', 'done', 'now') })), local: { statementTicked: true } },
  { name: 'j-statement-not-approved', surface: 'panel', note: 'not approved', view: journey(statementMoment({ problem: { title: WORDS.statement.notApproved.title, body: WORDS.statement.notApproved.body(ACCOUNT), button: ink(WORDS.statement.notApproved.button, { kind: 'ask-access' }) }, checklist: CHECK_ROWS('done', 'next', 'next') })) },
  { name: 'j-statement-other-computer', surface: 'panel', note: 'set up on another computer', view: journey(statementMoment({ problem: { title: WORDS.statement.otherInstallation.title, body: WORDS.statement.otherInstallation.body(ACCOUNT) }, checklist: CHECK_ROWS('done', 'next', 'next') })) },
  { name: 'j-statement-other-account', surface: 'panel', note: 'another AccessID', view: journey(statementMoment({ problem: { title: WORDS.statement.otherAccount.title, body: WORDS.statement.otherAccount.body }, checklist: CHECK_ROWS('done', 'next', 'next') })) },
  { name: 'j-statement-withdrawn', surface: 'panel', note: 'withdrawn version', view: journey(statementMoment({ problem: { title: WORDS.statement.withdrawn.title, body: WORDS.statement.withdrawn.body, button: ink(WORDS.statement.withdrawn.button, { kind: 'update' }) }, checklist: CHECK_ROWS('done', 'next', 'next') })) },
  { name: 'j-statement-access-unreachable', surface: 'panel', note: 'the access service cannot be reached', view: journey(statementMoment({ problem: { body: WORDS.statement.accessUnreachable.body, button: ink(WORDS.statement.accessUnreachable.button, { kind: 'retry-access' }) }, checklist: CHECK_ROWS('done', 'now', 'next'), connect: ink(WORDS.statement.connect, undefined, { disabled: true }) })) },
  { name: 'j-statement-no-shared-copy', surface: 'panel', note: 'no usable shared copy', view: journey(statementMoment({ problem: { body: WORDS.statement.noSharedCopy.body, button: { label: WORDS.statement.noSharedCopy.button, tone: 'outline', action: { kind: 'copy-details' } } }, checklist: CHECK_ROWS('done', 'done', 'next'), connect: ink(WORDS.statement.connect, undefined, { disabled: true }) })) },
  { name: 'j-statement-restricted', surface: 'panel', note: 'a restricted workspace', view: journey(statementMoment({ problem: { body: WORDS.statement.restricted.body }, checklist: CHECK_ROWS('done', 'done', 'done'), connect: ink(WORDS.statement.connect, undefined, { disabled: true }) })), local: { statementTicked: true } },

  // moment 7
  { name: 'j-connect', surface: 'panel', note: 'Connect: asking for a computer', view: journey(connectMoment()) },
  { name: 'j-connect-busy', surface: 'panel', note: 'after 2 min waiting for the sign-in computer', view: journey(connectMoment({ sub: WORDS.connect.busy })) },
  { name: 'j-connect-refused', surface: 'panel', note: 'the grid did not take the request', view: journey(connectMoment({ problem: { title: WORDS.connect.refused, body: WORDS.connect.refusedNext, button: ink(WORDS.connect.tryAgain, { kind: 'retry' }) } })) },
  { name: 'j-connect-no-signin-computer', surface: 'panel', note: 'after 10 min', view: journey(connectMoment({ problem: { title: WORDS.connect.noSigninTitle, body: WORDS.connect.keepsPlace, button: ink(WORDS.connect.tryAgain, { kind: 'sign-in-claude' }) } })) },

  // moment 8
  { name: 'j-claude', surface: 'panel', note: 'Sign in to Claude: the box submits on paste', view: journey(claudeMoment()) },
  { name: 'j-claude-in-line', surface: 'panel', note: 'the worker already in line', view: journey(claudeMoment({ inLine: { since: ago(72) } })) },
  { name: 'j-claude-typed', surface: 'panel', note: 'typed by hand: Continue appears', view: journey(claudeMoment({ inLine: { since: ago(72) } })), local: { codeTyped: true } },
  { name: 'j-claude-checking', surface: 'panel', note: 'the code is being typed into the sign-in', view: journey(claudeMoment({ box: { placeholder: WORDS.claude.placeholder, focus: false, checking: true, continueLabel: WORDS.claude.continue }, inLine: { since: ago(90) } })) },
  { name: 'j-claude-signed-in', surface: 'panel', note: 'Signed in as … · Max, for 3 s', view: journey(claudeMoment({ signedIn: WORDS.claude.signedIn(EMAIL, PLAN), inLine: { since: ago(101) } })) },
  { name: 'j-claude-bad-code', surface: 'panel', note: 'that code did not work', view: journey(claudeMoment({ problem: { body: WORDS.claude.badCode }, inLine: { since: ago(130) } })), local: { codeBad: true } },
  { name: 'j-claude-timed-out', surface: 'panel', note: 'the sign-in timed out', view: journey(claudeMoment({ problem: { body: WORDS.claude.timedOut, button: ink(WORDS.claude.signInAgain, { kind: 'sign-in-claude' }) } })) },
  { name: 'j-claude-tab-closed', surface: 'panel', note: 'the Claude tab was closed', view: journey(claudeMoment({ problem: { body: WORDS.claude.tabClosed, button: ink(WORDS.claude.openAgain, { kind: 'reopen-claude-tab' }) } })) },
  { name: 'j-claude-interrupted', surface: 'panel', note: 'the background was stopped mid-sign-in', view: journey(claudeMoment({ problem: { body: WORDS.claude.interrupted, button: ink(WORDS.claude.signInAgain, { kind: 'sign-in-claude' }) } })) },
  { name: 'j-claude-no-plan', surface: 'panel', note: 'a plan without Remote Control', view: journey(claudeMoment({ problem: { body: WORDS.claude.noPlan, button: ink(WORDS.claude.useAnother, { kind: 'sign-in-claude', fresh: true }) } })) },

  // AM2: the one-time key step (unproven on the grid)
  { name: 'j-login-offer', surface: 'panel', note: 'AM2: One more thing, once.', view: journey(loginMoment('offer')) },
  { name: 'j-login-password', surface: 'panel', note: 'AM2: the terminal tab is open', view: journey(loginMoment('password')) },
  { name: 'j-login-checking', surface: 'panel', note: 'AM2: the line typed, re-testing every 2 s (D23)', view: journey(loginMoment('checking')) },
  { name: 'j-login-done', surface: 'panel', note: 'AM2: done, the press carries on', view: journey(loginMoment('done')) },
  { name: 'j-login-paste', surface: 'panel', note: 'AM2: after 10 s, the line is on the clipboard', view: journey(loginMoment('paste')), local: { loginFoldOpen: true } },
  { name: 'j-login-closed', surface: 'panel', note: 'AM2: the terminal tab was closed first', view: journey(loginMoment('closed')) },

  // moments 9 and 10
  { name: 'j-queue', surface: 'panel', note: 'In line for a computer', view: journey(queueMoment(), { toolbar: { title: WORDS.toolbar.inLine(2), lit: false, badge: { text: '2m', color: 'ochre' } } }) },
  { name: 'j-queue-expected', surface: 'panel', note: 'with the scheduler’s estimate', view: journey(queueMoment({ sub: [WORDS.queue.sub, WORDS.queue.expected(formatClock(NOW + 6 * 60_000, true))] })) },
  { name: 'j-queue-last-time', surface: 'panel', note: 'with this browser’s last wait', view: journey(queueMoment({ sub: [WORDS.queue.sub, WORDS.queue.lastTime(6)] })) },
  { name: 'j-queue-share', surface: 'panel', note: 'QOSMax* / AssocGrp*', view: journey(queueMoment({ hero: WORDS.queue.shareHero, sub: [WORDS.queue.shareSub], reason: 'share' })) },
  { name: 'j-queue-maintenance', surface: 'panel', note: 'ReqNodeNotAvail or a reservation', view: journey(queueMoment({ hero: WORDS.queue.maintenanceHero, sub: [WORDS.queue.maintenanceSub], reason: 'maintenance' })) },
  { name: 'j-queue-busy', surface: 'panel', note: 'past 15 min', view: journey(queueMoment({ sub: [WORDS.queue.sub, WORDS.queue.busyToday] }, 17 * 60 + 4)) },
  { name: 'j-queue-tour', surface: 'panel', note: 'the tour plays below the queue, once', view: journey(queueMoment(), { tour: TOUR }) },
  { name: 'j-queue-couldnt', surface: 'panel', note: 'the worker could not start', view: journey(queueMoment({ timer: undefined, sub: [], problem: { title: WORDS.queue.couldntStartTitle, body: '', button: ink(WORDS.queue.tryAgain, { kind: 'retry' }) } })), log: SAMPLE_LOG.slice(0, 5) },
  { name: 'j-queue-unreachable', surface: 'panel', note: 'the grid stopped answering', view: journey(queueMoment({ problem: { body: WORDS.queue.unreachable(VPN_APP) } })) },

  // moment 11
  { name: 'j-starting', surface: 'panel', note: 'Got a computer', view: journey(startingMoment(), { toolbar: { title: WORDS.toolbar.starting, lit: false, badge: { text: '…', color: 'ochre' } } }) },
  { name: 'j-starting-connecting', surface: 'panel', note: 'Connecting to Claude', view: journey(startingMoment({ sub: WORDS.starting.connecting, timer: undefined })) },
  { name: 'j-starting-slow', surface: 'panel', note: 'after 3 min with no registration', view: journey(startingMoment({ sub: WORDS.starting.connecting, timer: undefined, problem: { body: WORDS.starting.slowMoment, button: { label: WORDS.starting.showLog, tone: 'outline', action: { kind: 'log', open: true } } } })), log: SAMPLE_LOG.slice(0, 6) },
  { name: 'j-starting-needs-signin', surface: 'panel', note: 'the worker needs a Claude sign-in', view: journey(startingMoment({ sub: WORDS.starting.connecting, timer: undefined, problem: { body: WORDS.starting.needsSignin, button: ink(WORDS.starting.signInClaude, { kind: 'sign-in-claude' }) } })) },
  { name: 'j-starting-reconnecting', surface: 'panel', note: 'a restart backoff', view: journey(startingMoment({ sub: WORDS.starting.reconnectingMoment, timer: undefined })) },

  // moment 12
  { name: 'j-online', surface: 'panel', note: 'You’re online. (one 600 ms ring burst)', view: journey(onlineMoment(), { toolbar: { title: WORDS.toolbar.online, lit: true } }) },
  { name: 'j-online-pin', surface: 'panel', note: 'the one-time pin tip', view: journey(onlineMoment({ pinTip: { text: WORDS.online.pinTip, done: false } })) },
  { name: 'j-online-pinned', surface: 'panel', note: 'the pin tip, done by itself', view: journey(onlineMoment({ pinTip: { text: WORDS.online.pinned, done: true } })) },
  { name: 'j-online-bad-link', surface: 'panel', note: 'the link is not an environment link', view: journey(onlineMoment({ sub: WORDS.online.badLink(TITLE), primary: { ...teal(WORDS.online.open, { kind: 'open-session' }), disabled: true } })) },

  // the home: the waiting table
  { name: 'h-asked', surface: 'panel', note: 'the connect line in flight', view: home({ hero: hero('asked', 'starting', WORDS.connect.hero), track: trackAt(0), rows: rows({ state: 'asked', text: WORDS.home.workerAsking }) }, { toolbar: { title: WORDS.toolbar.starting, lit: false, badge: { text: '…', color: 'ochre' } } }) },
  { name: 'h-queued', surface: 'panel', note: 'In line, reason Priority / Resources / None', view: queuedHome(WORDS.queue.hero, WORDS.queue.homeSub, 3) },
  { name: 'h-queued-expected', surface: 'panel', note: 'In line, with the estimate', view: queuedHome(WORDS.queue.hero, `${WORDS.queue.homeSub} ${WORDS.queue.expected(formatClock(NOW + 6 * 60_000, true))}`, 3) },
  { name: 'h-queued-share', surface: 'panel', note: 'Waiting for your share of the grid', view: queuedHome(WORDS.queue.shareHero, WORDS.queue.shareSub, 4, { hero: hero('queued-share', 'waiting', WORDS.queue.shareHero, WORDS.queue.shareSub, { timer: { since: ago(4 * 60 + 12) }, timerPlace: 'before' }) }) },
  { name: 'h-queued-maintenance', surface: 'panel', note: 'The grid is under maintenance', view: queuedHome(WORDS.queue.maintenanceHero, WORDS.queue.maintenanceSub, 9, { hero: hero('queued-maintenance', 'waiting', WORDS.queue.maintenanceHero, WORDS.queue.maintenanceSub, { timer: { since: ago(9 * 60 + 12) }, timerPlace: 'before' }) }) },
  { name: 'h-queued-busy', surface: 'panel', note: 'In line past 15 min', view: queuedHome(WORDS.queue.hero, `${WORDS.queue.homeSub} ${WORDS.queue.busyToday}`, 17) },
  { name: 'h-got-computer', surface: 'panel', note: 'Got a computer', view: home({ hero: hero('got-computer', 'starting', WORDS.starting.hero, WORDS.starting.gotComputer, { timer: { since: ago(20) }, timerPlace: 'after' }), track: trackAt(2), rows: rows({ state: 'starting', text: WORDS.home.workerStarting }), foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }, { toolbar: { title: WORDS.toolbar.starting, lit: false, badge: { text: '…', color: 'ochre' } } }) },
  { name: 'h-connecting', surface: 'panel', note: 'Connecting to Claude', view: home({ hero: hero('connecting', 'starting', WORDS.starting.hero, WORDS.starting.connecting), track: trackAt(2), rows: rows({ state: 'starting', text: WORDS.home.workerStarting }), foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }) },
  { name: 'h-slow', surface: 'panel', note: 'Still connecting', view: home({ hero: hero('slow', 'starting', WORDS.starting.slowHero, WORDS.starting.slowSub), track: trackAt(2), rows: rows({ state: 'starting', text: WORDS.home.workerStarting }), foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }) },
  { name: 'h-reconnecting', surface: 'panel', note: 'restart backoff', view: home({ hero: hero('reconnecting', 'starting', WORDS.home.reconnectingHero, WORDS.home.reconnectingSub), rows: rows({ state: 'starting', text: WORDS.home.workerStarting }), primary: { kind: 'open-session', button: teal(WORDS.home.openSession, { kind: 'open-session' }) }, link: LINK, foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }) },
  { name: 'h-needs-claude', surface: 'panel', note: 'need_login', view: home({ hero: hero('needs-claude', 'needs', WORDS.home.needsHero, WORDS.home.needsSub), primary: { kind: 'sign-in-claude', button: ink(WORDS.home.signInClaude, { kind: 'sign-in-claude' }) }, rows: rows({ state: 'needs-you', text: WORDS.home.workerNeeds }, { claude: { state: 'needs', text: WORDS.home.claudeNeeds, link: link(WORDS.home.claudeSignIn, { kind: 'sign-in-claude' }) } }), foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }, { toolbar: { title: WORDS.toolbar.needsYou, lit: false, badge: { text: '!', color: 'ochre' } } }) },
  { name: 'h-needs-consent', surface: 'panel', note: 'need_consent (D21)', view: home({ hero: hero('needs-consent', 'needs', WORDS.home.needsHero, WORDS.home.needsConsentSub), primary: { kind: 'connect', button: ink(WORDS.home.connect, { kind: 'connect' }), reminder: WORDS.home.connectReminder }, rows: rows({ state: 'needs-you', text: WORDS.home.workerNeeds }) }) },
  { name: 'h-online-new', surface: 'panel', note: 'You’re online. (the burst), then Online', view: onlineHome({}, { state: 'online-new', word: WORDS.online.hero, sub: WORDS.online.ready(7, TITLE), burst: true, timer: undefined, announce: WORDS.online.hero }) },
  { name: 'h-online', surface: 'panel', note: 'Online: the home', view: onlineHome() },
  { name: 'h-online-try', surface: 'panel', note: 'Online, first 3 days: Try asking', view: onlineHome({ tryAsking: TRY }) },
  { name: 'h-online-cards', surface: 'panel', note: 'the one-time cards', view: onlineHome({ cards: [{ id: 'pin-tip', text: WORDS.online.pinTip, dismiss: { kind: 'dismiss', card: 'pin-tip' } }, { id: 'tour-card', text: WORDS.home.tourCard, open: { kind: 'tour', event: 'start' }, dismiss: { kind: 'dismiss', card: 'tour-card' } }] }) },
  { name: 'h-online-confirm', surface: 'panel', note: 'Stop, then its confirmation', view: onlineHome({ tryAsking: TRY }), local: { confirmStop: true } },
  { name: 'h-online-phone', surface: 'panel', note: 'Phone: the QR code', view: onlineHome(), local: { phone: true } },
  { name: 'h-online-log', surface: 'panel', note: 'Show log open: the sample timeline', view: onlineHome(), local: { logOpen: true }, log: SAMPLE_LOG },
  { name: 'h-online-menu', surface: 'panel', note: 'the ⋯ menu', view: onlineHome({ tryAsking: TRY }), local: { menuOpen: true } },
  { name: 'h-online-details', surface: 'panel', note: 'Details for your lab lead, the sheet', view: onlineHome(), local: { detailsOpen: true }, details: detailsView() },
  { name: 'h-online-details-running', surface: 'panel', note: 'Details: the checks running', view: onlineHome(), local: { detailsOpen: true }, details: detailsView(true) },
  { name: 'h-tour-menu', surface: 'panel', note: '⋯ > See what it can do', view: onlineHome(), local: { tourMenu: { ...TOUR, source: 'menu' } } },
  { name: 'h-renewing', surface: 'panel', note: 'preempted, with a successor', view: home({ hero: hero('renewing', 'starting', WORDS.home.renewingHero, WORDS.home.renewingSub(8)), primary: { kind: 'open-session', button: teal(WORDS.home.openSession, { kind: 'open-session' }) }, link: LINK, rows: rows({ state: 'renewing', text: WORDS.home.workerRenewing }), foot: { ...FOOT_NONE, right: { label: WORDS.home.stop, tone: 'text' } } }) },
  { name: 'h-stopping', surface: 'panel', note: 'Stopping…', view: onlineHome({ foot: { ...FOOT_NONE, stopping: true } }) },
  { name: 'h-stopped', surface: 'panel', note: 'Stopped', view: home({ hero: hero('stopped', 'stopped', WORDS.home.stoppedHero, WORDS.home.stoppedSub), primary: { kind: 'connect', button: ink(WORDS.home.connect, { kind: 'connect' }), reminder: WORDS.home.connectReminder }, rows: rows({ state: 'stopped', text: WORDS.home.workerStopped }, { claude: { state: 'unknown', text: WORDS.home.unknown } }) }) },
  { name: 'h-error', surface: 'panel', note: 'Couldn’t start', view: home({ hero: hero('error', 'error', WORDS.home.errorHero, WORDS.queue.couldntStart), primary: { kind: 'retry', button: ink(WORDS.home.tryAgain, { kind: 'retry' }) }, rows: rows({ state: 'error', text: WORDS.home.workerError }, { claude: { state: 'unknown', text: WORDS.home.unknown } }) }, { toolbar: { title: WORDS.toolbar.error, lit: false, badge: { text: '!', color: 'brick' } } }), log: SAMPLE_LOG.slice(0, 4) },
  { name: 'h-signed-out', surface: 'panel', note: 'after a browser restart: As of', view: onlineHome({ rows: rows({ state: 'as-of', text: WORDS.home.workerAsOf('9:02 AM', 'online') }, { grid: { state: 'signed-out', text: WORDS.home.gridSignedOut, link: link(WORDS.home.gridSignIn, { kind: 'sign-in-grid' }) }, claude: { state: 'unknown', text: WORDS.home.unknown } }) }, { asOf: WORDS.home.asOf('9:02 AM'), sub: WORDS.home.onlineSub(TITLE, 14 * 3600_000 + 3 * 60_000), timer: undefined }) },
  { name: 'h-unreachable', surface: 'panel', note: 'Can’t reach the grid (worker last seen online)', view: onlineHome({ hero: hero('unreachable', 'stopped', WORDS.home.unreachableHero, WORDS.home.unreachableSub(VPN_APP)), rows: rows({ state: 'as-of', text: WORDS.home.workerAsOf('9:02 AM', 'online') }, { grid: { state: 'unreachable', text: WORDS.home.gridUnreachable }, claude: { state: 'unknown', text: WORDS.home.unknown } }), foot: FOOT_NONE }) },
  { name: 'h-checking', surface: 'panel', note: 'the first check of a browser session (D22)', view: onlineHome({ rows: rows({ state: 'as-of', text: WORDS.home.workerAsOf('9:02 AM', 'online') }, { grid: { state: 'checking', text: WORDS.home.checking }, claude: { state: 'unknown', text: WORDS.home.unknown } }) }) },
  // 12.0.0: the home's Grid row, What you need, Details' direct section
  { name: 'h-online-direct', surface: 'panel', note: '12.0.0: Grid row: Direct', view: onlineHome({ rows: { ...ROWS_ONLINE, grid: { ...ROWS_ONLINE.grid, via: via('direct') } } }) },
  { name: 'h-online-vpn', surface: 'panel', note: '12.0.0: Grid row: Through GlobalProtect', view: onlineHome({ rows: { ...ROWS_ONLINE, grid: { ...ROWS_ONLINE.grid, via: via('vpn') } } }) },
  { name: 'h-online-locked', surface: 'panel', note: '12.0.0: Grid row: Locked · Unlock (protected key, new session)', view: onlineHome({ rows: rows({ state: 'as-of', text: WORDS.home.workerAsOf('9:02 AM', 'online') }, { grid: { state: 'signed-in', text: WORDS.home.gridSignedIn(ACCOUNT), via: via('direct', true) }, claude: { state: 'unknown', text: WORDS.home.unknown } }) }) },
  { name: 'h-stopped-direct', surface: 'panel', note: '12.0.0: Stopped, Direct', view: home({ hero: hero('stopped', 'stopped', WORDS.home.stoppedHero, WORDS.home.stoppedSub), primary: { kind: 'connect', button: ink(WORDS.home.connect, { kind: 'connect' }), reminder: WORDS.home.connectReminder }, rows: rows({ state: 'stopped', text: WORDS.home.workerStopped }, { grid: { state: 'signed-in', text: WORDS.home.gridSignedIn(ACCOUNT), via: via('direct') }, claude: { state: 'unknown', text: WORDS.home.unknown } }) }) },
  { name: 'h-needs', surface: 'panel', note: '12.0.0: ⋯ > What you need', view: onlineHome(), local: { needsOpen: true } },
  { name: 'h-needs-phone', surface: 'panel', note: '12.0.0: What you need, with my phone', view: onlineHome(), local: { needsOpen: true, route: 'phone' } },
  { name: 'h-menu-needs', surface: 'panel', note: '12.0.0: the ⋯ menu with What you need', view: onlineHome({ rows: { ...ROWS_ONLINE, grid: { ...ROWS_ONLINE.grid, via: via('direct') } } }), local: { menuOpen: true } },
  { name: 'h-online-details-direct', surface: 'panel', note: '12.0.0: Details: the direct way', view: onlineHome(), local: { detailsOpen: true }, details: { ...detailsView(), direct: directDetails(false) } },
  { name: 'h-working-in-tab', surface: 'panel', note: 'tab mode: Working on the grid…', view: { ...queuedHome(WORDS.queue.hero, WORDS.queue.homeSub, 1), overlays: overlays({ workingInTab: true }) } as PanelView },

  // Settings
  { name: 'settings', surface: 'settings', note: 'Settings', view: settingsView() },
  { name: 'settings-system', surface: 'settings', note: 'Appearance: Match system', view: settingsView('system') },
  { name: 'settings-open', surface: 'settings', note: 'Change, terms and the lab lead fold open', view: settingsView(), local: { changeOpen: true, portalInput: HOST, termsOpen: true, labLeadOpen: true } },
  { name: 'settings-protected', surface: 'settings', note: '12.0.0: the key protected (turned on)', view: { ...settingsView(), connection: connectionView({ keyLine: D.settings.keyProtected }, { value: true }) } },
  { name: 'settings-protect-busy', surface: 'settings', note: '12.0.0: the protection switch, Windows Hello up', view: settingsView(), local: { keyBusy: true } },
  { name: 'settings-forget', surface: 'settings', note: '12.0.0: Forget this computer? [Forget] [Keep it]', view: settingsView(), local: { confirmForget: true } },
  { name: 'settings-no-key', surface: 'settings', note: '12.0.0: no key yet, no helper (its download offered)', view: { ...settingsView(), connection: connectionView({ keyLine: D.settings.keyNone, forget: { label: D.settings.forget, note: D.settings.forgetNote, confirm: D.settings.forgetConfirm, button: { label: D.settings.forgetButton, tone: 'ink', action: { kind: 'forget-computer' } }, disabled: true }, helper: { label: D.settings.helper, text: D.settings.helperMissing, installed: false, download: download('windows'), checkAgain: { label: D.installHelper.checkAgain, tone: 'outline', action: { kind: 'check-bridge' } } } }, { present: false }) } },
  { name: 'settings-vpn-only', surface: 'settings', note: '12.0.0: GlobalProtect only; no Windows Hello here', view: { ...settingsView(), connection: connectionView({ mode: { label: D.settings.modeLabel, value: 'vpn', options: [{ value: 'direct', label: D.settings.modes.direct }, { value: 'vpn', label: D.settings.modes.vpn }] } }, { available: false }) } },
];

export function fixture(name: string): Fixture | undefined {
  return FIXTURES.find((f) => f.name === name);
}

/** every string a fixture holds (the hygiene test reads them; Details and Settings' lab-lead fold are kept apart, they are the lab lead's) */
export function fixtureStrings(f: Fixture): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key = '') => {
    if (typeof v === 'string') {
      // addresses, times and the line the student pastes are not sentences
      if (/^(https?:|\/|bash |exec )/.test(v) || /^\d{4}-\d{2}-\d{2}T/.test(v) || ['since', 'at', 'url', 'origin', 'line', 'link', 'licenseUrl', 'privacyUrl', 'script', 'style', 'portalInput', 'termsOpenedAt', 'file', 'fileLine', 'moment', 'sha256', 'version', 'os', 'kind', 'id', 'mode', 'route', 'phase', 'purpose', 'state', 'tone'].includes(key)) return;
      out.push(v);
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'details' && k !== 'labLead' && k !== 'action' && k !== 'dismiss' && k !== 'open' && k !== 'direct') walk(x, k);
  };
  walk(f.view);
  if (f.surface === 'panel' && f.log) walk(f.log);
  return out;
}
