// The first run's moments in the panel (the specification's moments 4 to 12, AM2's one-time key step,
// and 12.0.0's direct way, drawn by direct.ts), each one column: the title, the body, the moment's one control, then a spacer that keeps the
// primary 32 px from the bottom. Every word comes from the view (core/model.ts JourneyView). The
// four-node track is drawn above the moments by the panel (panel.ts), so it stays put while they slide.
import { WORDS, formatTimer, type ProblemView, type ClaudeMoment, type ConnectMoment, type GlobalProtectMoment, type GridMoment, type JourneyView, type LoginSetupMoment, type OnlineMoment, type QueueMoment, type StartingMoment, type StatementMoment, type WelcomeMoment } from '../core/model';
import { el, svg } from './dom';
import { codeBox, type CodeBoxState } from './codebox';
import { drawnCheck, icon, spinner, type IconName } from './icons';
import { logFold, type LogWords } from './log';
import { button, checklist, fold, foldToggle, glyph, liveSub, orb, problem, tickBox, type OnAct } from './parts';
import type { LogLine } from '../core/model';
import { renderDirect, type DirectCtx } from './direct';
import { WORDS12 } from './model12';

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
  /** 12.0.0: the direct way's moments (direct.ts) */
  direct: DirectCtx;
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
      return renderDirect(j, ctx.direct) ?? el('section', { class: 'screen moment' });
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
  // 12.0.0: the grid's terminal may ask for the Google Authenticator code too; a student who has one must not run 2FA Setup
  const codeNote = m.phase === 'password' ? el('p', { class: 'm-fine', style: 'margin-top:14px' }, icon('alert', 15), el('span', { text: WORDS12.loginSetupCode })) : null;
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
    el('div', { class: 'm-foot' }, button(m.primary, ctx.onAct, { pending: ctx.pending })),
  );
}
