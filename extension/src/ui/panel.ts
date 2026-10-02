// The side panel: window-wide, the student's home. It draws whatever PanelView the background pushes
// (core/model.ts): the note before the agreement, a moment of the first run, or the home. A new moment
// slides in (320 ms); a change inside one is a morph, so nothing that is still there is redrawn. The
// four-node track sits above the moments and stays put while they slide. The tour plays below the queue
// once, or over the home from ⋯. Details is a sheet from the right. Show log is closed every time the
// panel opens. The page keeps only what is on screen: a tick, a fold, the confirm row, the phone view.
import { WORDS, type Action, type DetailsView, type JourneyView, type LogLine, type LoginSetupMoment, type PanelView, type SurfaceView, type TourView, type TrackView } from '../core/model';
import { announce, copyText, el, morph, reducedMotion, slideSwap, toast } from './dom';
import { requestOrigin } from '../ext/connectApi';
import { renderDetails } from './details';
import { renderHome } from './home';
import { renderMoment } from './journey';
import { LABELS } from './labels';
import { button, header, track } from './parts';
import { startPage } from './boot';
import { currentWindowId, panelOpened, sendAction, subscribe, type Act } from './rpc';
import { TourPlayer } from './tour';

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
}

export interface PanelOptions {
  act: Act;
  windowId?: number;
  /** the gallery: a fixed view (and the page-local state to show it in); nothing is subscribed */
  fixture?: { view: PanelView; local?: Partial<PanelLocal>; details?: DetailsView; log?: LogLine[] };
  /** a subscription to the Details surface while the sheet is open */
  details?: (onView: (v: SurfaceView) => void) => { close(): void };
}

const ORDER: Record<string, number> = { terms: 0, 'j:welcome': 1, 'j:globalprotect': 2, 'j:grid': 3, 'j:statement': 4, 'j:wait': 5, 'j:claude': 6, 'j:login-setup': 6, 'j:queue-tour': 7, 'j:online': 9, home: 10, tour: 11 };

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
  const local: PanelLocal = { menuOpen: false, statementTicked: false, moreOpen: false, loginFoldOpen: false, confirmStop: false, phone: false, logOpen: false, detailsOpen: false, tourAutoClosed: false, codeTyped: false, codeBad: false, tryIndex: 0, ...(opts.fixture?.local ?? {}) };
  if (opts.fixture?.log) local.logLines = opts.fixture.log;
  let view: PanelView | undefined;
  let details: DetailsView | undefined = opts.fixture?.details;
  let detailsSub: { close(): void } | undefined;
  let curKey = '';
  let curScreen: HTMLElement | undefined;
  let lastToast: string | undefined;
  let player: { source: 'auto' | 'menu'; p: TourPlayer } | undefined;

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
  const onAct = (a: Action): void => {
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
    const action: Action = a.kind === 'sign-in-grid' && a.windowId === undefined && opts.windowId !== undefined ? { ...a, windowId: opts.windowId } : a;
    set({ pending: action.kind });
    const clear = setTimeout(() => {
      if (local.pending === action.kind) set({ pending: undefined });
    }, 8000);
    void opts.act(action).then((r) => {
      const res = r as Record<string, unknown> | undefined;
      if (action.kind === 'copy-details' && typeof res?.text === 'string') copy(res.text, WORDS.globalprotect.copied);
      if (action.kind === 'copy-report' && typeof res?.text === 'string') copy(res.text, WORDS.globalprotect.copied);
      if (action.kind === 'new-session' && res?.firstTime) toast(WORDS.home.newSessionTip);
      if (action.kind === 'paste-code' && res && res.typed === false) set({ codeBad: true });
      setTimeout(() => {
        clearTimeout(clear);
        if (local.pending === action.kind) set({ pending: undefined });
      }, 1200);
    });
  };

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

  const journeyMenu = (): Array<{ label: string; action: Action }> => [
    { label: WORDS.home.menu.settings, action: { kind: 'open-settings' } },
    { label: WORDS.home.menu.details, action: { kind: 'open-details' } },
    { label: WORDS.home.menu.help, action: { kind: 'open-help' } },
  ];

  const tourDone = (source: 'auto' | 'menu', event: 'skip' | 'done' | 'failed') => {
    player = undefined;
    if (source === 'auto') set({ tourAutoClosed: true });
    else set({ tourMenu: undefined });
    if (event !== 'failed') void opts.act({ kind: 'tour', event });
  };

  const screenFor = (v: PanelView): { key: string; node: HTMLElement } => {
    const working = v.kind !== 'terms-needed' && v.overlays.workingInTab ? LABELS.workingInTab : undefined;
    const logCtx = { open: local.logOpen, lines: local.logLines, words: { show: WORDS.home.showLog, hide: WORDS.home.hideLog, copy: WORDS.home.copyLog }, toggle: toggleLog, copy: (t: string) => copy(t, WORDS.globalprotect.copied) };
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
    const menu = v.kind === 'home' ? v.home.header.menu : v.kind === 'journey' ? journeyMenu() : undefined;
    morphSlot(
      hdrSlot,
      header(v.kind === 'home' ? v.home.header.wordmark : WORDS.product, local.tourMenu ? undefined : menu, local.menuOpen, (open) => {
        set({ menuOpen: open });
        if (open) setTimeout(() => (hdrSlot.querySelector('.menu-item') as HTMLElement | null)?.focus(), 0);
      }, onAct),
    );
    // the track, above the moments
    const tr = local.tourMenu ? undefined : trackOf(v);
    trackSlot.classList.toggle('open', !!tr);
    trackSlot.setAttribute('aria-hidden', tr ? 'false' : 'true');
    if (tr) morphSlot(trackInner, el('div', { class: 'trackbar' }, track(tr.t, { waiting: tr.waiting })));
    // the screen
    const { key, node } = screenFor(v);
    if (key === curKey && curScreen && curScreen.isConnected) morph(curScreen, node);
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
    else if (e.key === 'Escape' && local.confirmStop) set({ confirmStop: false });
  });

  return {
    show(v: PanelView) {
      if (view && local.pending) local.pending = undefined;
      // a new moment starts with its own page-local state
      const prevKey = view ? (view.kind === 'journey' ? `j:${view.journey.moment}` : view.kind) : '';
      const nextKey = v.kind === 'journey' ? `j:${v.journey.moment}` : v.kind;
      if (prevKey && prevKey !== nextKey) Object.assign(local, { confirmStop: false, codeBad: false, codeTyped: false, loginFoldOpen: false });
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
