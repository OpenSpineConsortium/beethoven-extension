// The first run's moments in the panel (the specification's moments 4 to 12 and AM2's one-time key
// step), each one column: the title, the body, the moment's one control, then a spacer that keeps the
// primary 32 px from the bottom. Every word comes from the view (core/model.ts JourneyView). The
// four-node track is drawn above the moments by the panel (panel.ts), so it stays put while they slide.
//
// 19.0.0: the grid moment carries Beethoven's own sign-in sheet where the browser can answer the grid's
// sign-in (GridSheet): the AccessID and the password typed here, the unticked Remember, and the locked
// phase that opens a saved sign-in with the computer's own unlock. The password field is the page's alone:
// drawn once with no value, left exactly as it is by the morph (data-keep), read and emptied by the panel
// inside the press. Every other value comes from the view or the panel's page-local state (GridSheetCtx).
import { WORDS, formatTimer, type ButtonView, type ProblemView, type ClaudeMoment, type ConnectMoment, type GlobalProtectMoment, type GridMoment, type GridSheet, type JourneyView, type LoginSetupMoment, type OnlineMoment, type QueueMoment, type StartingMoment, type StatementMoment, type WelcomeMoment } from '../core/model';
import { el, svg } from './dom';
import { codeBox, type CodeBoxState } from './codebox';
import { drawnCheck, icon, spinner, type IconName } from './icons';
import { LABELS } from './labels';
import { logFold, type LogWords } from './log';
import { button, checklist, fold, foldToggle, glyph, liveSub, orb, problem, tickBox, type OnAct } from './parts';
import type { LogLine } from '../core/model';

/** what a moment may change on the page alone (a tick, a fold) and the acts it needs from the panel */
export interface JourneyCtx {
  onAct: OnAct;
  pending?: string;
  statementTicked: boolean;
  setStatementTicked: (on: boolean) => void;
  moreOpen: boolean;
  toggleMore: () => void;
  loginFoldOpen: boolean;
  toggleLoginFold: () => void;
  code: CodeBoxState;
  codeCb: { submit: (code: string) => void; typed: (on: boolean) => void; bad: () => void };
  copy: (text: string, toastText: string) => void;
  /** "Open the grid terminal": the line goes on the clipboard inside the click, then the action */
  openTerminal: (m: LoginSetupMoment) => void;
  log: { open: boolean; lines?: LogLine[]; words: LogWords; toggle: () => void; copy: (text: string) => void };
  /** the tour's mount point while it plays below the queue (moment 10) */
  tour?: HTMLElement;
  /** "Working on the grid…" in tab mode */
  working?: string;
  /** "Allow again" (the portal's grant taken away): Chrome is asked for the origin inside the click, then use-portal is sent */
  allowAgain?: (origin: string) => void;
  /** 19.0.0: the sign-in sheet's page-local half; without it the grid moment is drawn as 18.0.0 drew it */
  grid?: GridSheetCtx;
}

/**
 * 19.0.0: what the sign-in sheet keeps on the page alone, reset when the moment changes (panel.ts), and the
 * presses it hands back. The password is not here: only the live field holds it, until Sign in reads it.
 */
export interface GridSheetCtx {
  /** the AccessID as typed; else the view's */
  user?: string;
  /** the Remember tick, never pre-ticked */
  remember: boolean;
  /** "Type it instead": the locked phase drawn as the type phase */
  typeInstead: boolean;
  /** the page's own sentence under the password (noPassword, notUnlocked, notSaved); over the core's note */
  note?: string;
  /** the AccessID did not look like one */
  userBad: boolean;
  /** the page's probe: true offers the tick, false says why not (noRemember), undefined while it runs */
  support?: boolean;
  /** a press of this page's in flight: Sign in, or the unlock */
  busy?: 'signin' | 'unlock';
  /** the eye: the password shown as text */
  passShown: boolean;
  onUser: (value: string) => void;
  setRemember: (on: boolean) => void;
  setTypeInstead: () => void;
  togglePass: () => void;
  submit: (s: GridSheet) => void;
  unlock: () => void;
}

const STATEMENT_ICONS: IconName[] = ['eye', 'clock', 'shield', 'gauge'];

function title(text: string, swapKey?: string): HTMLElement {
  return el('h1', { class: 'm-title', text, 'data-swap': swapKey ?? text });
}

function body(text: string): HTMLElement {
  return el('p', { class: 'm-body', text });
}

function spacer(): HTMLElement {
  return el('div', { class: 'm-spacer', 'aria-hidden': 'true' });
}

function heroRow(o: Parameters<typeof orb>[0], text: string, burst = false): HTMLElement {
  return el('div', { class: 'm-hero-row', 'data-swap': text }, orb(o, burst), el('h1', { class: 'm-title', text }));
}

/** the line, with a break opportunity after each slash and space (never inside a word) */
function lineParts(line: string): Array<Node | string> {
  const out: Array<Node | string> = [];
  for (const part of line.split(/(?<=[/ ])/)) out.push(part, el('wbr'));
  return out;
}

function workingLine(text?: string): HTMLElement | null {
  return text ? el('p', { class: 'status' }, spinner(16), el('span', { text })) : null;
}

/** the moment's screen; `key` is what the panel compares to decide between a morph and a slide */
export function renderMoment(j: JourneyView, ctx: JourneyCtx): HTMLElement {
  switch (j.moment) {
    case 'welcome':
      return welcome(j, ctx);
    case 'globalprotect':
      return globalProtect(j, ctx);
    case 'grid':
      return grid(j, ctx);
    case 'statement':
      return statement(j, ctx);
    case 'connect':
      return connect(j, ctx);
    case 'claude':
      return claude(j, ctx);
    case 'login-setup':
      return loginSetup(j, ctx);
    case 'queue':
      return queue(j, ctx);
    case 'starting':
      return starting(j, ctx);
    case 'online':
      return online(j, ctx);
    default:
      return el('section', { class: 'screen moment' });
  }
}

function screen(name: string, ...children: Array<Node | null | false>): HTMLElement {
  return el('section', { class: `screen moment m-${name}`, 'data-moment': name }, ...children);
}

/**
 * A waiting moment: the same anchor as every other moment (the glyph slot, then the title at one height,
 * left-aligned), its content from the top, the log (if any) at the foot. Asking, in line and starting
 * share one layout, so the panel crossfades their headline in place rather than sliding a new screen.
 */
function wait(name: string, content: Array<Node | null | false>, foot: Array<Node | null | false> = []): HTMLElement {
  return el('section', { class: `screen moment waitm m-${name}`, 'data-moment': name }, el('div', { class: 'm-col' }, ...content), el('div', { class: 'm-spacer', 'aria-hidden': 'true' }), ...foot);
}

/** the orb, in the slot other moments give their glyph tile, so every title starts at one height */
function orbTile(state: Parameters<typeof orb>[0]): HTMLElement {
  return el('span', { class: 'glyph orb-tile', 'aria-hidden': 'true', 'data-swap': state }, orb(state));
}

function welcome(m: WelcomeMoment, ctx: JourneyCtx): HTMLElement {
  // the normal moment layout: glyph, title, body, then the one control at the foot
  const press = m.button
    ? m.state === 'revoked' && m.origin
      ? button({ ...m.button, action: undefined }, ctx.onAct, { pending: ctx.pending, block: true, onClick: () => ctx.allowAgain?.(m.origin!) })
      : button(m.button, ctx.onAct, { pending: ctx.pending, block: true })
    : null;
  return screen(
    'welcome',
    glyph(m.state === 'revoked' ? 'lock' : 'rack'),
    title(m.title),
    body(m.body),
    m.status ? el('p', { class: 'status m-status', role: 'status' }, spinner(16), el('span', { text: m.status })) : null,
    spacer(),
    el('div', { class: 'm-foot' }, press),
  );
}

function globalProtect(m: GlobalProtectMoment, ctx: JourneyCtx): HTMLElement {
  const st = m.status;
  return wait('globalprotect', [
    glyph('lock'),
    title(m.title),
    body(m.body),
    // 16.0.0: the university's own GlobalProtect page (the site profile's), when it has one
    m.help ? el('p', { class: 'm-fine' }, el('a', { class: 'need-link', href: m.help.url, target: '_blank', rel: 'noopener noreferrer' }, el('span', { text: m.help.label }), icon('external', 13))) : null,
    m.chip
      ? el(
          'div',
          { class: 'chip', style: 'margin-top:20px' },
          el('span', { class: 'chip-text', text: m.chip }),
          el('button', { type: 'button', class: 'btn', onClick: () => ctx.copy(m.chip!, WORDS.globalprotect.copied) }, icon('copy', 15), el('span', { text: WORDS.globalprotect.copy })),
        )
      : null,
    el(
      'p',
      { class: `status m-status${st.state === 'connected' ? ' ok' : ''}`, role: 'status', 'data-swap': st.state },
      st.state === 'connected' ? drawnCheck(18) : spinner(16),
      el('span', { text: st.text }),
    ),
    // 16.0.0: a press made while the grid is out of reach waits here and carries on by itself
    m.note ? el('p', { class: 'm-fine', role: 'status', text: m.note }) : null,
  ]);
}

/** Chrome's sign-in box, drawn without words: two fields and a button, a caret in the first */
function signInArt(): SVGElement {
  return svg(
    'svg',
    { class: 'signin-art', viewBox: '0 0 196 112', 'aria-hidden': 'true' },
    svg('rect', { class: 'sa-win', x: 0.5, y: 0.5, width: 195, height: 111, rx: 10 }),
    svg('rect', { class: 'sa-text', x: 16, y: 14, width: 54, height: 6, rx: 3 }),
    svg('rect', { class: 'sa-text', x: 16, y: 24, width: 104, height: 4, rx: 2 }),
    svg('rect', { class: 'sa-field', x: 16, y: 38, width: 164, height: 18, rx: 4 }),
    svg('line', { class: 'sa-caret', x1: 22, y1: 42, x2: 22, y2: 52 }),
    svg('rect', { class: 'sa-field', x: 16, y: 62, width: 164, height: 18, rx: 4 }),
    // Chrome's box on Windows: the filled "Sign in" first, then "Cancel"
    svg('rect', { class: 'sa-btn', x: 74, y: 88, width: 50, height: 14, rx: 7 }),
    svg('rect', { class: 'sa-field', x: 130, y: 88, width: 50, height: 14, rx: 7 }),
  );
}

function grid(m: GridMoment, ctx: JourneyCtx): HTMLElement {
  if (m.sheet && ctx.grid && !m.signedIn) return gridSheet(m, m.sheet, ctx, ctx.grid);
  return wait(
    'grid',
    [
      glyph('key'),
      title(m.problem?.title ?? m.title),
      body(m.body),
      m.signedIn ? el('p', { class: 'm-signed', role: 'status' }, drawnCheck(20), el('span', { text: m.signedIn })) : null,
      !m.signedIn && !m.problem ? el('div', { class: 'm-art' }, signInArt()) : null,
      m.problem ? el('div', { class: 'm-problem' }, problem(m.problem, ctx.onAct, { pending: ctx.pending })) : null,
    ],
    [workingLine(ctx.working)],
  );
}

/** the phase the sheet is drawn in: the view's, with the page's "Type it instead" and its own press over it */
export function sheetPhase(s: GridSheet, g: Pick<GridSheetCtx, 'typeInstead' | 'busy'>): GridSheet['phase'] {
  // this page's unlock and the sign-in it carries: still the locked sheet, its Unlock busy
  if (g.busy === 'unlock' && (s.phase === 'locked' || s.phase === 'working')) return 'locked';
  if (s.phase === 'working' || g.busy === 'signin') return 'working';
  return s.phase === 'locked' && !g.typeInstead ? 'locked' : 'type';
}

/** the sheet's heading as drawn in its phase, which the panel also announces as the moment's headline */
export function sheetTitle(m: GridMoment, s: GridSheet, g: Pick<GridSheetCtx, 'typeInstead' | 'busy'>): string {
  return sheetPhase(s, g) === 'locked' ? WORDS.grid.lockedTitle : (m.problem?.title ?? m.title);
}

/**
 * The sentence under the password, and whether it says the password is wrong or missing (aria-invalid on
 * the live field): the page's own first, else the core's (the refusal, or the hold, which says no password
 * was wrong), which steps aside while a new attempt runs so the last one's refusal is not read as this one's.
 */
export function passState(s: GridSheet, g: Pick<GridSheetCtx, 'note' | 'typeInstead' | 'busy'>): { note: string; invalid: boolean } {
  const core = sheetPhase(s, g) === 'working' ? undefined : s.note;
  return { note: g.note ?? core ?? '', invalid: g.note === WORDS.grid.noPassword || (g.note === undefined && !!core && core !== WORDS.grid.held) };
}

/** a quiet way out under the moment's one ink button */
function soft(b: ButtonView | undefined, ctx: JourneyCtx): HTMLElement | null {
  return b ? button({ ...b, tone: 'text' }, ctx.onAct, { pending: ctx.pending, block: false, cls: 'm-alt' }) : null;
}

/** Enter in a sheet field: the next field, or the field's own press */
function onEnter(then: () => void): (e: Event) => void {
  return (e: Event) => {
    const k = e as KeyboardEvent;
    if (k.key !== 'Enter' || k.isComposing) return;
    k.preventDefault();
    then();
  };
}

/** the live password field (never one inside a screen that is leaving) */
function livePass(): HTMLInputElement | undefined {
  return Array.from(document.querySelectorAll<HTMLInputElement>('#grid-pass')).find((f) => !f.closest('.leaving'));
}

/**
 * 19.0.0: Beethoven's own sign-in, in three phases. type: the AccessID, the password with its eye, the tick
 * where this computer can lock a saved password, one ink Sign in. locked: one ink "Unlock with Windows
 * Hello". working: the type phase with Sign in busy and "Signing in…" (after this page's unlock, the locked
 * phase with Unlock busy and the same words). The fields carry data-key, so the morph pairs them however
 * many lines come and go above them; the section carries the focus key the panel moves the caret by within
 * one moment (a refusal: the password).
 */
function gridSheet(m: GridMoment, s: GridSheet, ctx: JourneyCtx, g: GridSheetCtx): HTMLElement {
  const G = WORDS.grid;
  const phase = sheetPhase(s, g);
  // with the sheet the problem's button is never a second ink one: Sign in (or Unlock) is the moment's
  const prob = m.problem ? el('div', { class: 'm-problem', key: 'grid-problem' }, problem(m.problem.button ? { ...m.problem, button: { ...m.problem.button, tone: 'outline' } } : m.problem, ctx.onAct, { pending: ctx.pending })) : null;
  const alts = (...b: Array<HTMLElement | null>) => el('div', { class: 'm-alts', key: 'grid-alts' }, ...b);
  if (phase === 'locked') {
    const busy = g.busy === 'unlock';
    const sec = wait(
      'grid',
      [
        glyph('fingerprint'),
        title(sheetTitle(m, s, g)),
        body(G.lockedBody(s.unlockWith)),
        prob,
        el('p', { class: 'field-error gs-note', id: 'grid-unlock-note', key: 'grid-unlock-note', role: 'alert', text: g.note ?? '' }),
      ],
      [
        el(
          'div',
          { class: 'm-foot' },
          el(
            'button',
            {
              type: 'button',
              id: 'grid-unlock',
              key: 'grid-unlock',
              class: `btn btn-ink btn-block${busy ? ' busy' : ''}`,
              'aria-busy': busy ? 'true' : undefined,
              'aria-describedby': 'grid-unlock-note',
              'data-autofocus': true,
              onClick: () => {
                if (!busy) g.unlock();
              },
            },
            busy ? spinner(18) : icon('fingerprint', 16),
            el('span', { class: 'btn-label', text: G.unlock(s.unlockWith) }),
          ),
          // once the unlock has opened it, the sign-in it carries is under way
          el('p', { class: 'status gs-status', key: 'grid-working', role: 'status', text: busy && s.phase === 'working' ? G.signingIn : '' }),
          alts(el('button', { type: 'button', class: 'btn btn-text m-alt', key: 'grid-type-instead', onClick: () => g.setTypeInstead() }, el('span', { class: 'btn-label', text: G.typeInstead })), soft(s.box, ctx), soft(s.later, ctx)),
        ),
        workingLine(ctx.working),
      ],
    );
    sec.setAttribute('data-focus-key', `locked:${s.note ?? ''}`);
    sec.setAttribute('data-focus-id', 'grid-unlock');
    return sec;
  }
  const working = phase === 'working';
  const user = g.user ?? s.username ?? '';
  const said = passState(s, g);
  const userField = el(
    'div',
    { class: 'gs-q', key: 'grid-user-q' },
    el('label', { class: 'gs-label', for: 'grid-user', text: G.accessId }),
    el('input', {
      id: 'grid-user',
      key: 'grid-user',
      class: `field gs-field${g.userBad ? ' bad' : ''}`,
      type: 'text',
      value: user,
      autocomplete: 'username',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-invalid': g.userBad ? 'true' : undefined,
      'aria-describedby': 'grid-user-note',
      'data-autofocus': !working && !user ? true : undefined,
      onInput: (e: Event) => g.onUser((e.target as HTMLInputElement).value),
      onKeydown: onEnter(() => livePass()?.focus()),
    }),
    el('p', { class: 'field-error gs-note', id: 'grid-user-note', key: 'grid-user-note', role: 'alert', text: g.userBad ? G.badAccessId : '' }),
  );
  // never a value and never a name: the field is drawn once, and the morph leaves it exactly as it is
  // (data-keep), so what is typed is never copied, cleared or moved; its type and aria-invalid are set on
  // the live field itself (the eye, panel.ts)
  const pass = el('input', {
    id: 'grid-pass',
    key: 'grid-pass',
    class: 'field gs-field',
    type: g.passShown ? 'text' : 'password',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-describedby': 'grid-pass-note',
    'aria-invalid': said.invalid ? 'true' : undefined,
    'data-keep': 'grid-pass',
    'data-autofocus': !working && user ? true : undefined,
    onKeydown: onEnter(() => g.submit(s)),
  });
  const eye = el(
    'button',
    {
      type: 'button',
      class: 'btn btn-icon bare field-eye',
      key: 'grid-eye',
      // a toggle keeps one name and says its state by aria-pressed alone: "Show password, pressed" while shown
      'aria-label': LABELS.showPassword,
      'aria-pressed': g.passShown ? 'true' : 'false',
      'aria-controls': 'grid-pass',
      onClick: () => g.togglePass(),
    },
    icon(g.passShown ? 'eyeOff' : 'eye', 18),
  );
  const passField = el(
    'div',
    { class: 'gs-q', key: 'grid-pass-q' },
    el('label', { class: 'gs-label', for: 'grid-pass', text: G.password }),
    el('div', { class: 'field-wrap has-eye', key: 'grid-pass-wrap' }, pass, eye),
    // always here, so the field's aria-describedby never points at nothing; only its words change
    el('p', { class: 'field-error gs-note', id: 'grid-pass-note', key: 'grid-pass-note', role: 'alert', text: said.note }),
  );
  const remember =
    g.support === true
      ? el(
          'div',
          { class: 'gs-remember', key: 'grid-remember' },
          tickBox('grid-remember', s.saved !== 'none' ? G.replaceSaved(s.unlockWith) : G.remember(s.unlockWith), undefined, g.remember, g.setRemember, { card: true, plain: true, describedBy: 'grid-remember-note' }),
          el('p', { class: 'gs-fine', id: 'grid-remember-note', text: G.rememberNote }),
        )
      : g.support === false
        ? el('p', { class: 'gs-fine gs-remember', key: 'grid-no-remember', text: G.noRemember(s.unlockWith) })
        : null;
  const sec = wait(
    'grid',
    [glyph('key'), title(sheetTitle(m, s, g)), body(m.body), prob, el('div', { class: 'gs-form', key: 'grid-form' }, userField, passField, remember)],
    [
      el(
        'div',
        { class: 'm-foot' },
        el('p', { class: 'gs-privacy', key: 'grid-privacy' }, icon('lock', 15), el('span', { text: G.privacy })),
        // busy as the welcome page's Agree: a spinner, aria-busy, and a press that does nothing meanwhile
        el(
          'button',
          {
            type: 'button',
            id: 'grid-signin',
            key: 'grid-signin',
            class: `btn btn-ink btn-block${working ? ' busy' : ''}`,
            'aria-busy': working ? 'true' : undefined,
            onClick: () => {
              if (!working) g.submit(s);
            },
          },
          working ? spinner(18) : null,
          el('span', { class: 'btn-label', text: G.signIn }),
        ),
        // always here so the words are announced when they come; the button carries the spinner
        el('p', { class: 'status gs-status', key: 'grid-working', role: 'status', text: working ? G.signingIn : '' }),
        alts(soft(s.box, ctx), soft(s.later, ctx)),
      ),
      workingLine(ctx.working),
    ],
  );
  // within one moment the caret moves when the phase or the core's note changes: after a refusal, to the
  // password; a field the student is typing in is never taken from them by a tick or a toggle
  sec.setAttribute('data-focus-key', working ? 'working' : `type:${s.note ?? ''}`);
  sec.setAttribute('data-focus-id', working ? '' : s.note || user ? 'grid-pass' : 'grid-user');
  return sec;
}

function statement(m: StatementMoment, ctx: JourneyCtx): HTMLElement {
  const blocking = !!m.problem?.title;
  const more = m.more;
  const moreBody = fold(
    'more-fold',
    ctx.moreOpen,
    el(
      'div',
      { class: 'm-more-inner' },
      ...more.sentences.map((s) => el('p', { text: s })),
      el('div', { class: 'm-more-row' }, el('span', { text: more.workerName }), button({ ...more.change, tone: 'link' }, ctx.onAct, { pending: ctx.pending })),
      el('div', { class: 'm-more-row' }, button({ ...more.markRestricted, tone: 'link' }, ctx.onAct, { pending: ctx.pending })),
    ),
  );
  const connectButton = button({ ...m.connect, disabled: m.connect.disabled ?? !ctx.statementTicked }, ctx.onAct, { pending: ctx.pending, block: true });
  return screen(
    'statement',
    // a problem that stops the moment ("Ask your lab lead", "Update Beethoven") gets the brick tile in the glyph slot
    blocking ? el('span', { class: 'glyph bad', 'aria-hidden': 'true' }, icon('alert', 26)) : null,
    title(m.problem?.title ?? m.title),
    blocking
      ? el('p', { class: 'm-body m-blocking', role: 'status', text: m.problem!.body })
      : el(
          'div',
          { class: 'm-statement' },
          el('ul', { class: 'm-lines' }, ...m.lines.map((l, i) => el('li', { class: 'm-line', key: `l${i}` }, icon(STATEMENT_ICONS[i] ?? 'chevronRight', 18), el('span', { text: l })))),
          el('div', { class: 'm-more' }, foldToggle('more-fold', ctx.moreOpen, WORDS.statement.more.replace(/\s*›\s*$/, ''), ctx.toggleMore), moreBody),
          el('div', { style: 'margin-top:14px' }, tickBox('statement-tick', m.tick, undefined, ctx.statementTicked, ctx.setStatementTicked, { card: true, plain: true })),
        ),
    !blocking && m.problem ? el('p', { class: 'problem-body m-problem', role: 'alert' }, icon('alert', 18), el('span', { text: m.problem.body })) : null,
    spacer(),
    el(
      'div',
      { class: 'm-foot' },
      m.problem?.button ? button({ ...m.problem.button, tone: m.problem.button.tone === 'outline' ? 'ink' : m.problem.button.tone }, ctx.onAct, { pending: ctx.pending, block: true }) : blocking ? null : connectButton,
      m.problem && !blocking ? null : checklist(m.checklist),
    ),
  );
}

/** a waiting moment whose wait ended: the problem's title replaces the headline (and the timer), a brick tile above it, what to do below */
function ended(name: string, p: ProblemView, ctx: JourneyCtx): HTMLElement {
  return wait(
    name,
    [
      el('span', { class: 'glyph bad', 'aria-hidden': 'true' }, icon('alert', 26)),
      title(p.title!),
      p.body ? body(p.body) : null,
      p.button ? el('div', { class: 'm-problem' }, button(p.button, ctx.onAct, { pending: ctx.pending, block: true })) : null,
    ],
    [logFold(ctx.log.open, ctx.log.lines, ctx.log.words, ctx.log)],
  );
}

function connect(m: ConnectMoment, ctx: JourneyCtx): HTMLElement {
  if (m.problem?.title) return ended('connect', m.problem, ctx);
  return wait(
    'connect',
    [orbTile('waiting'), title(m.hero), el('p', { class: 'm-sub', text: m.sub, 'data-swap': m.sub }), m.problem ? el('div', { class: 'm-problem' }, problem(m.problem, ctx.onAct, { pending: ctx.pending })) : null],
    [logFold(ctx.log.open, ctx.log.lines, ctx.log.words, ctx.log)],
  );
}

function claude(m: ClaudeMoment, ctx: JourneyCtx): HTMLElement {
  const since = m.inLine ? new Date(m.inLine.since).getTime() : NaN;
  const inLineText = () => WORDS.claude.inLine(formatTimer(Date.now() - since));
  return screen(
    'claude',
    glyph('sparkle'),
    title(m.title),
    // once signed in, the moment reads its result, not its instruction
    m.signedIn ? null : body(m.body),
    m.signedIn
      ? el('p', { class: 'm-signed', role: 'status' }, drawnCheck(20), el('span', { text: m.signedIn }))
      : el('div', { style: 'margin-top:20px' }, codeBox(m.box, ctx.code, ctx.codeCb)),
    !m.signedIn ? el('div', { style: 'margin-top:8px' }, button({ ...m.reopen, tone: 'link' }, ctx.onAct, { pending: ctx.pending })) : null,
    m.problem ? el('div', { class: 'm-problem' }, problem(m.problem, ctx.onAct, { pending: ctx.pending })) : null,
    spacer(),
    m.inLine && Number.isFinite(since) ? el('p', { class: 'm-inline-line' }, el('span', { class: 'dot live', 'aria-hidden': 'true' }), el('span', { text: inLineText(), tick: inLineText })) : null,
  );
}

function loginSetup(m: LoginSetupMoment, ctx: JourneyCtx): HTMLElement {
  // "Open the grid terminal" puts the line on the clipboard inside the click, then asks the background
  const opens = m.button?.action?.kind === 'open-terminal-for-login-setup';
  const press = m.button
    ? button(opens ? { ...m.button, action: undefined, busy: m.button.busy || ctx.pending === 'open-terminal-for-login-setup' } : m.button, ctx.onAct, { pending: ctx.pending, onClick: opens ? () => ctx.openTerminal(m) : undefined })
    : null;
  // the grid's terminal may ask for the Google Authenticator code too; a student who has one must not run 2FA Setup
  const codeNote = m.phase === 'password' ? el('p', { class: 'm-fine', style: 'margin-top:14px' }, icon('alert', 15), el('span', { text: WORDS.loginSetup.codeNote })) : null;
  const phaseLine =
    m.phase === 'checking'
      ? el('p', { class: 'status', role: 'status' }, spinner(16), el('span', { text: m.body }))
      : m.phase === 'done'
        ? el('p', { class: 'm-signed', role: 'status' }, drawnCheck(20), el('span', { text: m.body }))
        : body(m.body);
  return screen(
    'login-setup',
    glyph('terminal'),
    title(m.title),
    phaseLine,
    codeNote,
    m.fold
      ? el(
          'div',
          { class: 'm-more', style: 'margin-top:14px' },
          foldToggle('line-fold', ctx.loginFoldOpen, m.fold.label, ctx.toggleLoginFold),
          fold(
            'line-fold',
            ctx.loginFoldOpen,
            el(
              'div',
              { class: 'm-more-inner' },
              el('div', { class: 'line-wrap' }, el('code', { class: 'line-chip' }, ...lineParts(m.fold.line)), el('button', { type: 'button', class: 'btn btn-link line-copy', onClick: () => ctx.copy(m.fold!.line, WORDS.globalprotect.copied) }, icon('copy', 14), el('span', { text: WORDS.globalprotect.copy }))),
              el('p', { text: m.fold.explain }),
            ),
          ),
        )
      : null,
    spacer(),
    el('div', { class: 'm-foot' }, press),
  );
}

function queue(m: QueueMoment, ctx: JourneyCtx): HTMLElement {
  if (m.problem?.title || !m.timer) return ended('queue', m.problem?.title ? m.problem : { title: m.hero, body: m.problem?.body ?? '' }, ctx);
  const since = new Date(m.timer.since).getTime();
  const timerText = () => formatTimer(Date.now() - since);
  const tone = m.problem ? 'error' : 'waiting';
  if (ctx.tour) {
    return screen(
      'queue',
      el('div', { class: 'm-slim', role: 'status' }, orb(tone), el('span', { class: 'slim-word', text: m.hero }), el('span', { class: 'slim-time', role: 'timer', text: timerText(), tick: timerText })),
      ctx.tour,
    );
  }
  return wait(
    'queue',
    [
      orbTile('waiting'),
      title(m.hero),
      el('p', { class: 'm-timer', role: 'timer', 'aria-label': m.hero, text: timerText(), tick: timerText }),
      ...m.sub.map((s, i) => el('p', { class: 'm-sub', key: `s${i}`, text: s })),
      m.problem ? el('div', { class: 'm-problem' }, problem(m.problem, ctx.onAct, { pending: ctx.pending })) : null,
    ],
    [workingLine(ctx.working), logFold(ctx.log.open, ctx.log.lines, ctx.log.words, ctx.log)],
  );
}

function starting(m: StartingMoment, ctx: JourneyCtx): HTMLElement {
  const tick = liveSub(m.sub, m.timer, 'timer');
  const logHere = m.problem?.button?.action?.kind === 'log';
  const log = logFold(ctx.log.open, ctx.log.lines, ctx.log.words, ctx.log);
  return wait(
    'starting',
    [
      orbTile('starting'),
      title(m.hero),
      el('p', { class: 'm-sub m-inline', text: tick ? tick() : m.sub, tick }),
      m.problem ? el('div', { class: 'm-problem' }, problem(logHere ? { body: m.problem.body } : m.problem, onLogAware(ctx), { pending: ctx.pending, tone: 'wait' })) : null,
      logHere ? log : null,
    ],
    [logHere ? null : log],
  );
}

/** a problem's "Show log" opens the fold in place instead of going to the background first */
function onLogAware(ctx: JourneyCtx): OnAct {
  return (a) => {
    if (a.kind === 'log') {
      if (!ctx.log.open) ctx.log.toggle();
      return;
    }
    ctx.onAct(a);
  };
}

function online(m: OnlineMoment, ctx: JourneyCtx): HTMLElement {
  return screen(
    'online',
    heroRow('online', m.hero, m.burst),
    el('p', { class: 'm-sub', text: m.sub }),
    m.pinTip
      ? el('div', { class: `once${m.pinTip.done ? ' done' : ''}`, role: 'status', style: 'margin-top:24px' }, m.pinTip.done ? drawnCheck(18) : icon('pin', 18), el('p', { text: m.pinTip.text }))
      : null,
    spacer(),
    // 21.0.0: with "Open my project", what to do in the project, in the home's reminder style
    el('div', { class: 'm-foot' }, button(m.primary, ctx.onAct, { pending: ctx.pending }), m.how ? el('p', { class: 'home-reminder', text: m.how }) : null),
  );
}
