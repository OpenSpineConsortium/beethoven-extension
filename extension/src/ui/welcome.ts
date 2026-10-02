// The welcome page (moment 2): the options page in a full tab until the agreement is accepted. Greg's
// prerequisites in his order (12.0.0: four, with QR codes for the grid's sign-in code and GlobalProtect,
// each drawn on the device with its address under it, then the grid code's two routes), the agreement in
// four lines, "Show terms" expanding in place (never required), one tick, and "Agree and continue".
// Before the press nothing is sent to anyone.
//
// The press is one gesture: inside the click and before any await, the page calls sidePanel.open with the
// window id it read when it loaded and permissions.request for the portal's one origin; then it writes the
// acceptance record (core/terms.ts buildTermsRecord, TermsRecord v2) and sends "agree" with what Chrome
// answered. The background turns this same tab into the grid's sign-in. Below 960 px the tick and the
// button sit in a sticky bar so the action is always in view.
import { TERMS_HISTORY_KEY, TERMS_KEY, TERMS_VERSION, buildTermsRecord, endReached, withHistory, type TermsRecord } from '../core/terms';
import { WORDS, type HeroView, type WelcomeView } from '../core/model';
import { add, clear, downloadText, el, morph } from './dom';
import { drawnCheck, icon, spinner, type IconName } from './icons';
import { foldToggle, hero, tickBox } from './parts';
import type { Act } from './rpc';
import { checkPortal, fullText, loadTexts, portalField, termsRegion, type Texts } from './sections';
import { PUBLIC_PAGES, needsList, routesView, type WelcomeView12 } from './model12';
import { needsBlock, routeChoice } from './routes';

export interface WelcomeLocal {
  ticked: Partial<Record<'agree' | 'specific', boolean>>;
  termsOpen: boolean;
  termsOpenedAt?: string;
  termsEnd: boolean;
  openedInTab: boolean;
  savedCopy: boolean;
  printed: boolean;
  portalOpen: boolean;
  portalInput?: string;
  portalError?: string;
  /** "Use this portal": the address the press will ask Chrome for (nothing is asked or saved until "Agree and continue") */
  portalChosen?: { origin: string; hostname: string };
  /** the press is in flight: the button crossfades to a spinner and "Opening the grid…" */
  pressing: boolean;
  /** what Chrome answered, when the background has not drawn it yet */
  localState?: WelcomeView['state'];
  localProblem?: string;
  recorded: boolean;
  /** 12.0.0: which QR code of each group is shown, and the route open under the prerequisites */
  qrPick: Record<string, number>;
  route?: 'laptop' | 'phone';
}

/** what only a real extension page can do; the gallery passes stand-ins */
export interface Gestures {
  /** sidePanel.open({windowId}) (Chrome), sidebarAction.open() (Firefox); called inside the click, before any await */
  openPanel: () => Promise<boolean>;
  /** whether this browser has a panel at all (Safari has none: the page carries the journey) */
  hasPanel: boolean;
  /** permissions.request for one origin, through the guarded request (never an Anthropic one); inside the click */
  request: (origin: string) => Promise<boolean>;
  openTab: (url: string) => void;
  url: (path: string) => string;
  /** the record's facts */
  productVersion: () => string;
  host: () => string;
  installId: () => Promise<string>;
  save: (key: string, value: unknown) => Promise<void>;
  /** read a stored value (the earlier acceptance record, kept in the history before the new one replaces it) */
  load?: (key: string) => Promise<unknown>;
  /** inside the click, before the panel opens: a session note that the press is under way, so the panel opening beside the page says "Almost there." (never awaited) */
  notePress?: () => void;
  tabId?: number;
  windowId?: number;
}

const SUMMARY_ICONS: IconName[] = ['tag', 'id', 'alert', 'scale'];

/** the welcome view as the core sends it (three needs) or with 12.0.0's four and the route choice (model12.ts WelcomeView12) */
type AnyWelcome = WelcomeView | WelcomeView12;

export function mountWelcome(root: HTMLElement, opts: { act: Act; gestures: Gestures; local?: Partial<WelcomeLocal>; onAccepted?: () => void }): { show: (v: AnyWelcome) => void } {
  const g = opts.gestures;
  const local: WelcomeLocal = { ticked: {}, termsOpen: false, termsEnd: false, openedInTab: false, savedCopy: false, printed: false, portalOpen: false, pressing: false, recorded: false, qrPick: {}, ...(opts.local ?? {}) };
  let view: AnyWelcome | undefined;
  let texts: Texts | undefined;
  let page: HTMLElement | undefined;
  void loadTexts(g.url).then((t) => {
    texts = t;
    render();
  }).catch(() => undefined);

  const set = (patch: Partial<WelcomeLocal>) => {
    Object.assign(local, patch);
    render();
  };

  const allTicked = (v: AnyWelcome) => v.ticks.every((t) => local.ticked[t.id]);

  /** the portal the press asks Chrome for: the one chosen under "Use another portal", else the view's (the site profile's) */
  const portalOf = (v: AnyWelcome) => local.portalChosen ?? { origin: v.portal.origin, hostname: v.portal.hostname };

  /** the one gesture: panel and permission first, synchronously, then the record and "agree" */
  const press = () => {
    const v = view;
    if (!v || !allTicked(v) || local.pressing) return;
    const { origin, hostname } = portalOf(v);
    g.notePress?.();
    const opening = g.hasPanel ? g.openPanel() : Promise.resolve(false);
    const granting = g.request(origin);
    set({ pressing: true, localProblem: undefined, localState: undefined });
    void (async () => {
      const [panelOpened, granted] = await Promise.all([opening.catch(() => false), granting.catch(() => false)]);
      if (!local.recorded) {
        try {
          const t = texts ?? (await loadTexts(g.url));
          const record: TermsRecord = await buildTermsRecord({
            license: t.license,
            privacy: t.privacy,
            checked: local.ticked,
            termsOpenedAt: local.termsOpenedAt,
            termsEndReached: local.termsEnd,
            openedInTab: local.openedInTab,
            savedCopy: local.savedCopy,
            printed: local.printed,
            productVersion: g.productVersion(),
            host: g.host(),
            installId: await g.installId(),
          });
          // an earlier acceptance (8.0.0 to 10.0.0's v1 record, or an earlier text's) is kept, out of force
          const previous = await g.load?.(TERMS_KEY).catch(() => undefined);
          if (previous) await g.save(TERMS_HISTORY_KEY, withHistory(await g.load?.(TERMS_HISTORY_KEY).catch(() => undefined), previous));
          await g.save(TERMS_KEY, record);
          local.recorded = true;
        } catch {
          set({ pressing: false, localState: 'save-failed', localProblem: WORDS.welcome.saveFailed });
          return;
        }
      }
      const answer = await opts.act({ kind: 'agree', origin, granted, panelOpened, ...(g.tabId !== undefined ? { tabId: g.tabId } : {}), ...(g.windowId !== undefined ? { windowId: g.windowId } : {}) });
      opts.onAccepted?.();
      if (!granted) set({ pressing: false, localState: 'denied', localProblem: WORDS.welcome.denied(hostname) });
      else if (g.hasPanel && !panelOpened) set({ pressing: !answer, localState: 'no-panel', localProblem: WORDS.welcome.panelNotOpened });
      else if (!answer) set({ pressing: false });
    })();
  };

  // "Use this portal" only chooses: Chrome is asked for it by "Agree and continue", inside that one click,
  // after the tick (nothing is asked, saved or sent before the agreement); an Anthropic address is refused here
  const usePortal = (value: string) => {
    const c = checkPortal(value);
    if (!c.origin) return set({ portalError: c.error, portalInput: value });
    set({ portalError: undefined, portalInput: value, portalChosen: { origin: c.origin, hostname: new URL(c.origin).hostname }, portalOpen: false, localState: undefined, localProblem: undefined });
  };

  const termsActs = {
    openInTab: () => {
      g.openTab(g.url('/LICENSE.txt'));
      g.openTab(g.url('/PRIVACY.md'));
      set({ openedInTab: true });
    },
    save: () => {
      if (!texts) return;
      downloadText(`${WORDS.product}-agreement-v${TERMS_VERSION}.txt`, fullText(texts));
      set({ savedCopy: true });
    },
    print: () => {
      set({ printed: true, termsOpen: true, termsOpenedAt: local.termsOpenedAt ?? new Date().toISOString() });
      setTimeout(() => window.print(), 50);
    },
    scrolled: (box: HTMLElement) => {
      if (!local.termsEnd && endReached({ scrollTop: box.scrollTop, clientHeight: box.clientHeight, scrollHeight: box.scrollHeight })) local.termsEnd = true;
    },
  };

  // read at render time: set() replaces local.qrPick with a new object, so a copy taken at mount would keep the first pick forever
  const qr = {
    get qrPick() {
      return local.qrPick;
    },
    setQrPick: (grp: string, i: number) => set({ qrPick: { ...local.qrPick, [grp]: i } }),
  };

  /**
   * 12.0.0's four prerequisites and the route choice. A view from a core that still sends 11.0.0's three
   * needs is drawn in the 12.0.0 form when it is Wayne State's (its account link is the university's own
   * page), with the university's addresses taken from that view; any other portal keeps what it sent.
   */
  function upgraded(v: AnyWelcome): { needs: WelcomeView12['needs']; routes?: WelcomeView12['routes'] } {
    if ('routes' in v && v.routes) return { needs: v.needs, routes: v.routes };
    const account = v.needs[0] && 'link' in v.needs[0] ? v.needs[0].link?.url : undefined;
    const vpn = v.needs[1] && 'link' in v.needs[1] ? v.needs[1].link?.url : undefined;
    if (v.needs.length !== 3 || !account || !vpn || new URL(account).hostname !== 'services.wayne.edu') return { needs: v.needs };
    const pages = { gridAccount: account, globalProtect: vpn, gridCode: PUBLIC_PAGES.gridCode, gridSite: PUBLIC_PAGES.gridSite };
    return { needs: needsList(pages), routes: routesView(pages) };
  }

  /** the prerequisites (with their QR codes), then the grid code's two routes */
  function needs(v: AnyWelcome): HTMLElement {
    const { needs: list, routes } = upgraded(v);
    return el(
      'div',
      { class: 'w-prereq' },
      needsBlock(list, qr, { title: v.needsTitle, titleId: 'needs-title' }),
      routes ? routeChoice(routes, { qrPick: local.qrPick, setQrPick: qr.setQrPick, route: local.route, setRoute: (r) => set({ route: r }) }, { heading: 'h2' }) : null,
    );
  }

  /** "Claude, on your grid.": the website's own signature, the second half in teal italic */
  function headline(text: string): HTMLElement {
    const m = /^(.*?,)\s+(.+)$/.exec(text);
    return m ? el('h1', { class: 'w-h1' }, m[1]!, ' ', el('em', { text: m[2]! })) : el('h1', { class: 'w-h1', text });
  }

  function handoff(text: string, h?: HeroView): HTMLElement {
    return el('section', { class: 'handoff', role: 'status' }, el('p', { class: 'handoff-head' }, drawnCheck(28), el('span', { text })), h ? hero(h) : null);
  }

  function agreement(v: AnyWelcome): HTMLElement {
    const state = local.localState && (v.state === 'idle' || v.state === 'opening') ? local.localState : v.state;
    const problemText = v.problem ?? (state === local.localState ? local.localProblem : undefined);
    const opening = local.pressing || state === 'opening';
    const retry = state === 'denied' || state === 'save-failed';
    const label = opening ? v.agree.busyLabel : retry ? WORDS.welcome.tryAgain : v.agree.label;
    const ready = allTicked(v);
    const chosen = portalOf(v);
    const allowNote = local.portalChosen ? WORDS.welcome.allowNote(chosen.hostname) : v.allowNote;
    return el(
      'div',
      { class: 'w-right' },
      el(
        'section',
        { class: 'agree-card', 'aria-labelledby': 'agree-title' },
        el('h2', { class: 'eyebrow', id: 'agree-title', text: v.summaryTitle }),
        el('ul', { class: 'summary' }, ...v.summary.map((s, i) => el('li', {}, icon(SUMMARY_ICONS[i] ?? 'chevronRight', 18), el('span', { text: s })))),
        el(
          'div',
          { class: 'terms-toggle' },
          foldToggle('terms-fold', local.termsOpen, local.termsOpen ? v.terms.hide : v.terms.show, () =>
            set({ termsOpen: !local.termsOpen, termsOpenedAt: local.termsOpenedAt ?? new Date().toISOString() }),
          ),
        ),
        termsRegion('terms-fold', local.termsOpen, texts, termsActs),
      ),
      // the other portal's field, where it changes what the button below does
      portalField('portal-fold', local.portalOpen, local.portalInput ?? chosen.hostname, local.portalError, v.portal.usePortal, { input: (val) => { local.portalInput = val; }, use: usePortal }),
      el(
        'div',
        { class: 'actbar' },
        ...v.ticks.map((t) => tickBox(`tick-${t.id}`, t.bold, t.soft, !!local.ticked[t.id], (on) => set({ ticked: { ...local.ticked, [t.id]: on } }))),
        problemText ? el('p', { class: 'w-problem', role: 'alert' }, icon('alert', 18), el('span', { text: problemText })) : null,
        el(
          'button',
          {
            type: 'button',
            class: `btn btn-teal agree-btn${opening ? ' busy' : ''}`,
            disabled: !ready && !opening,
            'aria-disabled': opening ? 'true' : undefined,
            'aria-busy': opening ? 'true' : undefined,
            'data-swap': label,
            onClick: press,
          },
          opening ? spinner(18) : null,
          el('span', { class: 'btn-label', text: label }),
        ),
        el('p', { class: 'allow-note', text: allowNote }),
      ),
    );
  }

  function footer(v: AnyWelcome): HTMLElement {
    return el(
      'footer',
      { class: 'w-foot' },
      el('span', { class: 'w-foot-note' }, icon('lock', 14), el('span', { text: v.footer.nothingLeaves })),
      el('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
      el('button', {
        type: 'button',
        class: 'btn btn-link',
        'aria-expanded': local.portalOpen ? 'true' : 'false',
        'aria-controls': 'portal-fold',
        text: v.footer.otherPortal,
        onClick: () => {
          const opening = !local.portalOpen;
          set({ portalOpen: opening, portalInput: local.portalInput ?? portalOf(v).hostname });
          // the field is above, beside what it changes: it comes into view with the caret in it
          if (opening) setTimeout(() => {
            const f = document.getElementById('portal-fold-input') as HTMLInputElement | null;
            f?.focus({ preventScroll: true });
            f?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 60);
        },
      }),
    );
  }

  function render(): void {
    const v = view;
    if (!v) {
      if (!root.firstChild) root.append(el('div', { class: 'w-skeleton' }, spinner(22)));
      return;
    }
    if (local.pressing && v.state !== 'idle' && v.state !== 'opening') local.pressing = false;
    const next = el(
      'main',
      { class: 'welcome' },
      el(
        'div',
        { class: 'w-left' },
        el('div', { class: 'w-mark' }, el('img', { src: g.url('/icon/48.png'), alt: '', width: '28', height: '28' }), el('span', { text: WORDS.product })),
        headline(v.headline),
        el('p', { class: 'w-lede', text: v.subline }),
        needs(v),
      ),
      v.state === 'handoff' ? el('div', { class: 'w-right' }, handoff(v.handoff?.text ?? WORDS.welcome.handoff, v.handoff?.hero)) : agreement(v),
      v.state === 'handoff' ? null : footer(v),
    );
    if (page && page.isConnected) morph(page, next);
    else {
      clear(root);
      add(root, next);
      page = next;
    }
  }

  render();
  return {
    show(v: AnyWelcome) {
      view = v;
      render();
    },
  };
}
