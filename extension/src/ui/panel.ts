// The side panel: window-wide, the student's home. It draws whatever PanelView the background pushes
// (core/model.ts): the note before the agreement, a moment of the first run, or the home. A new moment
// slides in (320 ms); a change inside one is a morph, so nothing that is still there is redrawn. The
// four-node track sits above the moments and stays put while they slide. The tour plays below the queue
// once, or over the home from ⋯. Details is a sheet from the right. Show log is closed every time the
// panel opens. The page keeps only what is on screen: a tick, a fold, the confirm row, the phone view.
//
// 12.0.0: the direct way's moments (direct.ts), the "What you need" screen from ⋯ (the prerequisites
// with their QR codes and the grid code's two routes), and the three passkey steps that must run inside
// the click (rpc.ts KeyGesture): the sheet's opt-in tick, "Turn on", and "Unlock".
import { WORDS, type DetailsView, type HelperDownload, type JourneyView, type LogLine, type LoginSetupMoment, type PanelView, type SignInSheetMoment, type SurfaceView, type TourView, type TrackView } from '../core/model';
import { announce, copyText, el, morph, reducedMotion, slideSwap, toast } from './dom';
import { requestOrigin } from '../ext/connectApi';
import { renderDetails } from './details';
import { renderHome } from './home';
import { renderMoment } from './journey';
import { LABELS } from './labels';
import { button, header, track } from './parts';
import { startPage } from './boot';
import { currentKeyGesture, currentWindowId, panelOpened, sendAction, subscribe, type Act } from './rpc';
import { TourPlayer } from './tour';
import type { DirectCtx } from './direct';
import { needsView, WORDS12, type Action12 } from './model12';
import { needsBlock, routeChoice } from './routes';

export interface PanelLocal {
  menuOpen: boolean;
  pending?: string;
  statementTicked: boolean;
  moreOpen: boolean;
  loginFoldOpen: boolean;
  confirmStop: boolean;
  phone: boolean;
  logOpen: boolean;
  logLines?: LogLine[];
  detailsOpen: boolean;
  /** the tour started from ⋯ or the one-time card */
  tourMenu?: TourView;
  /** the once-only tour below the queue was skipped or finished here */
  tourAutoClosed: boolean;
  codeTyped: boolean;
  codeBad: boolean;
  tryIndex: number;
  // 12.0.0
  /** the sign-in sheet's opt-in "Protect my key with Windows Hello / Touch ID" (unticked by default) */
  protectTicked: boolean;
  /** a passkey step is up (the system's own prompt) */
  keyBusy?: 'protect' | 'unlock' | 'create';
  /** the sheet's AccessID was not one */
  accountError?: string;
  /** the helper's installer was saved from this panel */
  helperDownloaded: boolean;
  /** which QR code of each group is shown */
  qrPick: Record<string, number>;
  /** "What you need" (from ⋯) is open, and the route open in it */
  needsOpen: boolean;
  route?: 'laptop' | 'phone';
}

export interface PanelOptions {
  act: Act;
  windowId?: number;
  /** the gallery: a fixed view (and the page-local state to show it in); nothing is subscribed */
  fixture?: { view: PanelView; local?: Partial<PanelLocal>; details?: DetailsView; log?: LogLine[] };
  /** a subscription to the Details surface while the sheet is open */
  details?: (onView: (v: SurfaceView) => void) => { close(): void };
}

const ORDER: Record<string, number> = {
  terms: 0,
  'j:welcome': 1,
  'j:fallback-to-vpn': 1.5,
  'j:globalprotect': 2,
  'j:install-helper': 2.2,
  'j:sign-in-sheet': 2.4,
  'j:choose-route': 2.5,
  'j:code-setup': 2.6,
  'j:enrolled': 2.8,
  'j:protect-key-optional': 2.9,
  'j:grid': 3,
  'j:statement': 4,
  'j:wait': 5,
  'j:claude': 6,
  'j:login-setup': 6,
  'j:queue-tour': 7,
  'j:online': 9,
  home: 10,
  needs: 11,
  tour: 11,
};

/** an AccessID: letters and digits (the core's sentence says so; the grid decides the rest) */
const ACCESS_ID = /^[A-Za-z0-9]{2,16}$/;

/**
 * The screen's key: a change of key slides, a change inside one key morphs (crossfading what changed).
 * Asking, in line and starting are one layout with a new headline, so they share a key and crossfade in
 * place; the queue with the tour below it is its own.
 */
function keyOf(v: PanelView, tourHere: boolean): string {
  if (v.kind !== 'journey') return v.kind === 'home' ? 'home' : 'terms';
  const m = v.journey.moment;
  if (m === 'queue' && tourHere) return 'j:queue-tour';
  if (m === 'connect' || m === 'queue' || m === 'starting') return 'j:wait';
  return `j:${m}`;
}

/** the tour from ⋯ when the background has not sent one yet: the bundled diagram and the spec's words */
export function menuTour(): TourView {
  return { source: 'menu', captions: WORDS.tour.captions, sceneMs: 4000, assets: { script: '/tour/diagram.js', style: '/tour/diagram.css' }, prompts: WORDS.home.prompts };
}

function headline(v: PanelView): string | undefined {
  if (v.kind === 'terms-needed') return v.body;
  if (v.kind === 'home') return v.home.hero.announce || v.home.hero.word;
  const j = v.journey;
  if ('title' in j && j.title) {
    const p = 'problem' in j ? j.problem : undefined;
    return p?.title ?? j.title;
  }
  if ('hero' in j) return j.hero;
  return undefined;
}

function trackOf(v: PanelView): { t: TrackView; waiting: boolean } | undefined {
  // while the tour plays below the queue, the slim bar carries the state and the track steps aside
  if (v.kind === 'journey' && v.journey.moment === 'queue' && v.overlays.tour?.source === 'auto') return undefined;
  if (v.kind === 'journey' && 'track' in v.journey) return { t: v.journey.track, waiting: v.journey.moment === 'queue' };
  if (v.kind === 'home' && v.home.track) return { t: v.home.track, waiting: /^queued/.test(v.home.hero.state) };
  return undefined;
}

export function mountPanel(root: HTMLElement, opts: PanelOptions): { show: (v: PanelView) => void; setDetails: (d: DetailsView) => void } {
  const local: PanelLocal = { menuOpen: false, statementTicked: false, moreOpen: false, loginFoldOpen: false, confirmStop: false, phone: false, logOpen: false, detailsOpen: false, tourAutoClosed: false, codeTyped: false, codeBad: false, tryIndex: 0, protectTicked: false, helperDownloaded: false, qrPick: {}, needsOpen: false, ...(opts.fixture?.local ?? {}) };
  if (opts.fixture?.log) local.logLines = opts.fixture.log;
  let view: PanelView | undefined;
  let details: DetailsView | undefined = opts.fixture?.details;
  let detailsSub: { close(): void } | undefined;
  let curKey = '';
  let curScreen: HTMLElement | undefined;
  let lastToast: string | undefined;
  let player: { source: 'auto' | 'menu'; p: TourPlayer } | undefined;
  let focusKey = '';

  root.classList.add('panel-root');
  const hdrSlot = el('div', { class: 'hdr-slot' });
  const trackInner = el('div');
  const trackSlot = el('div', { class: 'trackwrap', 'aria-hidden': 'false' }, trackInner);
  const stage = el('main', { class: 'stage', id: 'main' });
  const sheetSlot = el('div', { class: 'sheet-slot' });
  root.replaceChildren(hdrSlot, trackSlot, stage, sheetSlot);

  const set = (patch: Partial<PanelLocal>) => {
    Object.assign(local, patch);
    render();
  };

  const copy = (text: string, toastText: string) => {
    void copyText(text).then((ok) => {
      if (ok) toast(toastText);
    });
  };

  const toggleLog = () => {
    const open = !local.logOpen;
    set({ logOpen: open });
    // the log opens where the student can see it: scrolled into view once its fold has opened
    const reveal = () => (stage.querySelector('.log .fold.open') as HTMLElement | null)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (open) setTimeout(reveal, reducedMotion() ? 140 : 340);
    void opts.act({ kind: 'log', open }).then((r) => {
      if (r?.lines) set({ logLines: r.lines });
      else if (open && !local.logLines) set({ logLines: [] });
      if (open) setTimeout(reveal, 60);
    });
  };

  /** a press: shows its spinner until the next view, and handles what an answer asks of the page */
  const onAct = (a: Action12): void => {
    if (a.kind === 'open-needs') {
      set({ needsOpen: true, menuOpen: false, phone: false });
      return;
    }
    if (a.kind === 'open-details') {
      openDetails();
      return;
    }
    if (a.kind === 'tour' && a.event === 'start') {
      set({ tourMenu: view && view.kind !== 'terms-needed' && view.overlays.tour?.source === 'menu' ? view.overlays.tour : menuTour(), menuOpen: false, phone: false });
      void opts.act(a);
      return;
    }
    if (a.kind === 'log') {
      if (a.open !== local.logOpen) toggleLog();
      return;
    }
    const action: Action12 = a.kind === 'sign-in-grid' && a.windowId === undefined && opts.windowId !== undefined ? { ...a, windowId: opts.windowId } : a;
    set({ pending: action.kind });
    const clear = setTimeout(() => {
      if (local.pending === action.kind) set({ pending: undefined });
    }, 8000);
    void opts.act(action).then((r) => {
      const res = r as Record<string, unknown> | undefined;
      if (action.kind === 'copy-details' && typeof res?.text === 'string') copy(res.text, WORDS.globalprotect.copied);
      if (action.kind === 'copy-debug-log' && typeof res?.text === 'string') copy(res.text, WORDS.home.debugLogCopied);
      if (action.kind === 'copy-report' && typeof res?.text === 'string') copy(res.text, WORDS.globalprotect.copied);
      if (action.kind === 'new-session' && res?.firstTime) toast(WORDS.home.newSessionTip);
      if (action.kind === 'paste-code' && res && res.typed === false) set({ codeBad: true });
      setTimeout(() => {
        clearTimeout(clear);
        if (local.pending === action.kind) set({ pending: undefined });
      }, 1200);
    });
  };

  // ---- 12.0.0: the passkey steps run here, inside the click, before any await (rpc.ts KeyGesture) ----

  /** "Turn on" (protect-key-optional) */
  const protectNow = () => {
    if (local.keyBusy) return;
    const running = currentKeyGesture().protect(true);
    set({ keyBusy: 'protect' });
    void running.then(
      (outcome) => {
        set({ keyBusy: undefined });
        void opts.act({ kind: 'protect-key', on: true, outcome });
      },
      () => {
        set({ keyBusy: undefined });
        void opts.act({ kind: 'protect-key', on: true, outcome: 'failed' });
      },
    );
  };

  /** "Unlock" (the sheet's unlock phase, the Grid row's Unlock) */
  const unlockNow = () => {
    if (local.keyBusy) return;
    const running = currentKeyGesture().unlock();
    set({ keyBusy: 'unlock' });
    void running.then(
      (outcome) => {
        set({ keyBusy: undefined });
        void opts.act({ kind: 'unlock-key', outcome });
      },
      () => {
        set({ keyBusy: undefined });
        void opts.act({ kind: 'unlock-key', outcome: 'failed' });
      },
    );
  };

  /**
   * The sheet's Continue. The AccessID: checked here, then (when the opt-in is ticked) the passkey step
   * for the new key inside this click, then grid-signin-account. The grid's prompts: each field's answer
   * in order, one grid-signin-answer each; the fields are emptied as they are read, and the answers are
   * held nowhere but in this call until they are sent.
   */
  const submitSheet = (m: SignInSheetMoment) => {
    if (m.phase === 'account') {
      const input = document.getElementById('sheet-account') as HTMLInputElement | null;
      const account = (input?.value ?? '').trim();
      if (!ACCESS_ID.test(account)) {
        set({ accountError: WORDS.direct.signin.accountBad });
        input?.focus();
        return;
      }
      if (local.keyBusy) return;
      set({ accountError: undefined });
      if (local.protectTicked && m.protect?.available) {
        const creating = currentKeyGesture().createProtected();
        set({ keyBusy: 'create' });
        void creating
          .catch(() => 'failed' as const)
          .then((outcome) => {
            set({ keyBusy: undefined });
            void opts.act({ kind: 'protect-key', on: true, outcome });
            onAct({ kind: 'grid-signin-account', account });
          });
        return;
      }
      onAct({ kind: 'grid-signin-account', account });
      return;
    }
    if (m.phase === 'prompt') {
      const fields = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-prompt]')).filter((f) => !f.closest('.leaving'));
      fields.sort((a, b) => Number(a.dataset.prompt) - Number(b.dataset.prompt));
      const empty = fields.find((f) => !f.value);
      if (empty) {
        empty.focus();
        return;
      }
      const answers = fields.map((f) => f.value);
      for (const f of fields) f.value = '';
      set({ pending: 'grid-signin-answer' });
      void answers.reduce<Promise<unknown>>((p, text) => p.then(() => opts.act({ kind: 'grid-signin-answer', text })), Promise.resolve());
      return;
    }
    if (m.submit.action) onAct(m.submit.action);
  };

  const downloadHelper = (d: HelperDownload) => {
    // the browser saves the packaged file (the <a download> of this click); the background starts looking
    set({ helperDownloaded: true });
    void opts.act({ kind: 'bridge-downloaded', os: d.os });
  };

  const directCtx = (): DirectCtx => ({
    onAct,
    pending: local.pending,
    qr: { qrPick: local.qrPick, setQrPick: (g, i) => set({ qrPick: { ...local.qrPick, [g]: i } }) },
    protectTicked: local.protectTicked,
    setProtectTicked: (on) => set({ protectTicked: on }),
    keyBusy: local.keyBusy,
    accountError: local.accountError,
    submitSheet,
    protect: protectNow,
    unlock: unlockNow,
    downloaded: local.helperDownloaded,
    download: downloadHelper,
  });

  const openTerminal = (m: LoginSetupMoment) => {
    // inside the click: the line goes on the clipboard first (the click's own user activation)
    void copyText(m.line);
    onAct({ kind: 'open-terminal-for-login-setup', ...(opts.windowId !== undefined ? { windowId: opts.windowId } : {}) });
  };

  const openDetails = () => {
    set({ detailsOpen: true, menuOpen: false });
    void opts.act({ kind: 'open-details' });
    if (!detailsSub && opts.details)
      detailsSub = opts.details((sv) => {
        if (sv.surface === 'details') {
          details = sv.view;
          render();
        }
      });
  };

  const closeDetails = () => {
    const sheet = sheetSlot.firstElementChild as HTMLElement | null;
    detailsSub?.close();
    detailsSub = undefined;
    if (!sheet) return set({ detailsOpen: false });
    sheet.classList.add('closing');
    const gone = () => set({ detailsOpen: false });
    sheet.addEventListener('animationend', gone, { once: true });
    setTimeout(gone, 400);
    (document.getElementById('more-btn') as HTMLElement | null)?.focus();
  };

  /** "What you need" sits in every ⋯ menu, before Help (page-local: the screen is drawn here) */
  const NEEDS_ITEM = { label: WORDS12.needs.menu, action: { kind: 'open-needs' } as Action12 };
  const withNeeds = (menu: Array<{ label: string; action: Action12 }>): Array<{ label: string; action: Action12 }> => {
    if (menu.some((m) => m.action.kind === 'open-needs')) return menu;
    const help = menu.findIndex((m) => m.action.kind === 'open-help');
    return help < 0 ? [...menu, NEEDS_ITEM] : [...menu.slice(0, help), NEEDS_ITEM, ...menu.slice(help)];
  };

  const journeyMenu = (): Array<{ label: string; action: Action12 }> =>
    withNeeds([
      { label: WORDS.home.menu.settings, action: { kind: 'open-settings' } },
      { label: WORDS.home.menu.details, action: { kind: 'open-details' } },
      { label: WORDS.home.menu.debugLog, action: { kind: 'copy-debug-log' } },
      { label: WORDS.home.menu.help, action: { kind: 'open-help' } },
    ]);

  /** the panel's "What you need": the four prerequisites with their QR codes, then the grid code's two routes */
  const needsScreen = (): HTMLElement => {
    const nv = needsView();
    const qr = { qrPick: local.qrPick, setQrPick: (g: string, i: number) => set({ qrPick: { ...local.qrPick, [g]: i } }) };
    return el(
      'section',
      { class: 'screen needs-screen', 'data-screen': 'needs' },
      el(
        'div',
        { class: 'needs-head' },
        el('h1', { class: 'm-title', text: WORDS12.needs.menu, tabindex: '-1', 'data-autofocus': '' }),
        el('button', { type: 'button', class: 'btn btn-text needs-done', text: WORDS12.needs.done, onClick: () => set({ needsOpen: false }) }),
      ),
      needsBlock(nv.needs, qr, { compact: true }),
      routeChoice(nv.routes, { ...qr, route: local.route, setRoute: (r) => set({ route: r }) }, { heading: 'h2' }),
    );
  };

  const tourDone = (source: 'auto' | 'menu', event: 'skip' | 'done' | 'failed') => {
    player = undefined;
    if (source === 'auto') set({ tourAutoClosed: true });
    else set({ tourMenu: undefined });
    if (event !== 'failed') void opts.act({ kind: 'tour', event });
  };

  const screenFor = (v: PanelView): { key: string; node: HTMLElement } => {
    const working = v.kind !== 'terms-needed' && v.overlays.workingInTab ? LABELS.workingInTab : undefined;
    const logCtx = { open: local.logOpen, lines: local.logLines, words: { show: WORDS.home.showLog, hide: WORDS.home.hideLog, copy: WORDS.home.copyLog }, toggle: toggleLog, copy: (t: string) => copy(t, WORDS.globalprotect.copied) };
    if (local.needsOpen && !local.tourMenu) return { key: 'needs', node: needsScreen() };
    if (local.tourMenu && v.kind !== 'terms-needed') {
      return { key: 'tour', node: el('section', { class: 'screen tour-screen', style: 'display:flex;flex-direction:column' }, el('div', { 'data-keep': 'tour:menu', class: 'tour-slot', style: 'display:flex;flex-direction:column;flex:1;min-height:0' })) };
    }
    if (v.kind === 'terms-needed') {
      return {
        key: 'terms',
        node: el('section', { class: 'screen' }, el('div', { class: 'center-moment' }, el('img', { class: 'app-ico', src: '/icon/128.png', alt: '' }), el('p', { class: 'm-body', text: v.body }), button(v.button, onAct, { pending: local.pending, block: false }))),
      };
    }
    if (v.kind === 'home') {
      return {
        key: 'home',
        node: renderHome(v.home, {
          onAct,
          pending: local.pending,
          confirm: local.confirmStop,
          setConfirm: (on) => set({ confirmStop: on }),
          phone: local.phone,
          setPhone: (on) => set({ phone: on }),
          copy,
          log: logCtx,
          tryIndex: local.tryIndex,
          setTryIndex: (i) => set({ tryIndex: i }),
          working,
          unlock: unlockNow,
          keyBusy: local.keyBusy,
        }),
      };
    }
    let j: JourneyView = v.journey;
    if (j.moment === 'claude' && local.codeBad && !j.problem) j = { ...j, problem: { body: WORDS.claude.badCode } };
    const tourHere = j.moment === 'queue' && v.overlays.tour?.source === 'auto' && !local.tourAutoClosed;
    return {
      key: keyOf(v, tourHere),
      node: renderMoment(j, {
        onAct,
        pending: local.pending,
        statementTicked: local.statementTicked,
        setStatementTicked: (on) => set({ statementTicked: on }),
        moreOpen: local.moreOpen,
        toggleMore: () => set({ moreOpen: !local.moreOpen }),
        loginFoldOpen: local.loginFoldOpen,
        toggleLoginFold: () => set({ loginFoldOpen: !local.loginFoldOpen }),
        code: { typed: local.codeTyped, bad: local.codeBad },
        codeCb: {
          submit: (code) => {
            set({ codeTyped: false, codeBad: false });
            onAct({ kind: 'paste-code', code });
          },
          typed: (on) => {
            if (on !== local.codeTyped || local.codeBad) set({ codeTyped: on, codeBad: false });
          },
          bad: () => set({ codeBad: true, codeTyped: false }),
        },
        copy,
        openTerminal,
        log: logCtx,
        tour: tourHere ? el('div', { 'data-keep': 'tour:auto', class: 'tour-slot', style: 'display:flex;flex-direction:column;flex:1;min-height:0' }) : undefined,
        working,
        // "Allow again": Chrome asks for the portal inside this click, then the background is told
        allowAgain: (origin) => {
          const granting = requestOrigin(origin);
          set({ pending: 'use-portal' });
          void granting.then((granted) => opts.act({ kind: 'use-portal', origin, granted })).finally(() => set({ pending: undefined }));
        },
        direct: directCtx(),
      }),
    };
  };

  /** put the tour player into its slot once the slot is on the page; stop it when its slot has gone */
  const placeTour = (v: PanelView) => {
    const slot = Array.from(stage.querySelectorAll<HTMLElement>('[data-keep^="tour:"]')).find((s) => !s.closest('.leaving'));
    const source = slot?.getAttribute('data-keep') === 'tour:menu' ? 'menu' : slot ? 'auto' : undefined;
    if (player && (!source || player.source !== source || !player.p.root.isConnected || player.p.root.closest('.leaving'))) {
      if (!source || player.source !== source) {
        player.p.stop();
        player = undefined;
      }
    }
    if (!slot || !source) return;
    if (!player) {
      const tv = source === 'menu' ? (local.tourMenu ?? menuTour()) : v.kind !== 'terms-needed' ? v.overlays.tour : undefined;
      if (!tv) return;
      const p = new TourPlayer(tv, { skip: () => tourDone(source, 'skip'), done: () => tourDone(source, 'done'), failed: () => tourDone(source, 'failed') }, source === 'menu');
      player = { source, p };
      // the auto tour says it has begun with its own event ('auto'): the background notes it was shown
      // (the home's "See what it can do" card is then not offered) without taking it for the menu's tour,
      // whose 'start' turns overlays.tour into the menu's and would remove this slot
      if (source === 'auto') void opts.act({ kind: 'tour', event: 'auto' });
    }
    if (!slot.contains(player.p.root)) slot.replaceChildren(player.p.root);
  };

  const morphSlot = (slot: HTMLElement, next: HTMLElement | null) => {
    const cur = slot.firstElementChild;
    if (!next) {
      if (cur) slot.replaceChildren();
      return;
    }
    if (cur && cur.tagName === next.tagName && cur.className.split(' ')[0] === next.className.split(' ')[0]) morph(cur, next);
    else slot.replaceChildren(next);
  };

  function render(): void {
    const v = view;
    if (!v) return;
    // the header: the wordmark, and ⋯ with its menu
    const menu = v.kind === 'home' ? withNeeds(v.home.header.menu) : v.kind === 'journey' ? journeyMenu() : undefined;
    morphSlot(
      hdrSlot,
      header(v.kind === 'home' ? v.home.header.wordmark : WORDS.product, local.tourMenu || local.needsOpen ? undefined : menu, local.menuOpen, (open) => {
        set({ menuOpen: open });
        if (open) setTimeout(() => (hdrSlot.querySelector('.menu-item') as HTMLElement | null)?.focus(), 0);
      }, onAct),
    );
    // the track, above the moments
    const tr = local.tourMenu || local.needsOpen ? undefined : trackOf(v);
    trackSlot.classList.toggle('open', !!tr);
    trackSlot.setAttribute('aria-hidden', tr ? 'false' : 'true');
    if (tr) morphSlot(trackInner, el('div', { class: 'trackbar' }, track(tr.t, { waiting: tr.waiting })));
    // the screen
    const { key, node } = screenFor(v);
    const slid = !(key === curKey && curScreen && curScreen.isConnected);
    if (!slid) morph(curScreen!, node);
    else {
      const back = (ORDER[key] ?? 0) < (ORDER[curKey] ?? 0) && key !== 'home';
      const fade = !curKey || key === 'home' || curKey === 'tour' || key === 'tour';
      slideSwap(stage, node, { back, fade });
      curScreen = node;
      const first = !curKey;
      curKey = key;
      if (!first) setTimeout(() => (node.querySelector('[data-autofocus]') as HTMLElement | null)?.focus({ preventScroll: true }), 340);
      else (node.querySelector('[data-autofocus]') as HTMLElement | null)?.focus({ preventScroll: true });
      if (local.phone && key !== 'home') local.phone = false;
    }
    // 12.0.0: a field the moment asks for next (the sheet's AccessID, then each prompt of the grid's)
    // takes the caret when it arrives, also within one moment, once per field
    const fk = Array.from(stage.querySelectorAll<HTMLElement>('[data-focus-key]')).find((e) => !e.closest('.leaving'));
    const fkv = fk?.getAttribute('data-focus-key') ?? '';
    if (fk && fkv !== focusKey) {
      focusKey = fkv;
      setTimeout(() => fk.isConnected && fk.focus({ preventScroll: true }), slid ? 340 : 0);
    }
    placeTour(v);
    // Details
    if (local.detailsOpen) {
      const sheet = renderDetails(details, { onAct, pending: local.pending, close: closeDetails, copy: (t) => copy(t, WORDS.globalprotect.copied) }, WORDS.details.title, WORDS.details.done);
      const had = !!sheetSlot.firstElementChild;
      morphSlot(sheetSlot, sheet);
      if (!had) setTimeout(() => (sheetSlot.querySelector('[data-autofocus]') as HTMLElement | null)?.focus({ preventScroll: true }), 50);
    } else if (sheetSlot.firstElementChild) sheetSlot.replaceChildren();
    // headline announcements, and a toast the core asked for once
    announce(headline(v));
    const asked = v.kind === 'home' ? v.home.toast : v.kind === 'journey' ? v.overlays.toast : undefined;
    if (asked && asked !== lastToast) {
      lastToast = asked;
      toast(asked);
    }
  }

  document.addEventListener('pointerdown', (e) => {
    if (!local.menuOpen) return;
    const t = e.target as Element | null;
    if (t && (t.closest('.menu') || t.closest('#more-btn'))) return;
    set({ menuOpen: false });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && local.menuOpen) {
      set({ menuOpen: false });
      (document.getElementById('more-btn') as HTMLElement | null)?.focus();
    } else if (e.key === 'Escape' && local.detailsOpen) closeDetails();
    else if (e.key === 'Escape' && local.phone) set({ phone: false });
    else if (e.key === 'Escape' && local.needsOpen) set({ needsOpen: false });
    else if (e.key === 'Escape' && local.confirmStop) set({ confirmStop: false });
  });

  return {
    show(v: PanelView) {
      if (view && local.pending) local.pending = undefined;
      // a new moment starts with its own page-local state
      const prevKey = view ? (view.kind === 'journey' ? `j:${view.journey.moment}` : view.kind) : '';
      const nextKey = v.kind === 'journey' ? `j:${v.journey.moment}` : v.kind;
      if (prevKey && prevKey !== nextKey) Object.assign(local, { confirmStop: false, codeBad: false, codeTyped: false, loginFoldOpen: false, accountError: undefined, helperDownloaded: false, protectTicked: false });
      view = v;
      render();
    },
    setDetails(d: DetailsView) {
      details = d;
      render();
    },
  };
}

/** the side panel's start: the port to the background, the views it pushes, and "panel.opened" */
export async function bootPanel(root: HTMLElement): Promise<void> {
  if (await startPage(root, 'panel')) return;
  const windowId = await currentWindowId();
  const panel = mountPanel(root, { act: sendAction, windowId, details: (cb) => subscribe('details', cb, windowId) });
  subscribe(
    'panel',
    (sv: SurfaceView) => {
      if (sv.surface === 'panel') panel.show(sv.view);
    },
    windowId,
  );
  panelOpened(windowId);
}
