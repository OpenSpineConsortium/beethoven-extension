// The pieces every page draws from a view: a button from a ButtonView, the orb, the four-node track,
// the self-ticking checklist, a problem, the tick, a fold, the ⋯ menu, the hero and the status card.
// Each is a pure function of its view part and a few callbacks; nothing here keeps state.
import { formatTimer, onlineFor, type ButtonView, type ChecklistRow, type HeroView, type Orb, type ProblemView, type StatusRows, type Timer, type TrackView } from '../core/model';
import { el, svg } from './dom';
import { drawnCheck, icon, spinner, type IconName } from './icons';
import { LABELS } from './labels';
import type { Action12 } from './model12';

/** a press: the core's actions, and the menu's page-local "What you need" (model12.ts Action12) */
export type OnAct = (a: Action12) => void;

/** a button drawn from the view; `pending` marks the press in flight (a spinner until the next view) */
export function button(b: ButtonView, onAct: OnAct, opts: { block?: boolean; pending?: string; cls?: string; icon?: IconName; onClick?: (e: Event) => void } = {}): HTMLButtonElement {
  const tone = b.tone === 'teal' ? 'btn-teal' : b.tone === 'ink' ? 'btn-ink' : b.tone === 'outline' ? 'btn-outline' : b.tone === 'link' ? 'btn-link' : 'btn-text';
  const busy = !!b.busy || (!!opts.pending && !!b.action && b.action.kind === opts.pending);
  const block = opts.block ?? (b.tone === 'teal' || b.tone === 'ink');
  return el(
    'button',
    {
      type: 'button',
      class: `btn ${tone}${block ? ' btn-block' : ''}${busy ? ' busy' : ''}${opts.cls ? ` ${opts.cls}` : ''}`,
      disabled: b.disabled && !busy,
      'aria-busy': busy ? 'true' : undefined,
      'aria-disabled': busy ? 'true' : undefined,
      onClick: (e: Event) => {
        if (busy) return;
        opts.onClick?.(e);
        if (b.action) onAct(b.action);
      },
    },
    busy ? spinner(18) : opts.icon ? icon(opts.icon, 16) : null,
    el('span', { class: 'btn-label', text: b.label }),
    b.tone === 'link' && !busy ? icon('chevronRight', 14, 'chev') : null,
  );
}

export function orb(state: Orb, burst = false): HTMLElement {
  return el('span', { class: `orb${burst ? ' burst' : ''}`, 'data-orb': state, 'aria-hidden': 'true' });
}

/** the four-node track; `waiting` turns the current node's arc ochre (in line) */
export function track(t: TrackView, opts: { waiting?: boolean; label?: string } = {}): HTMLElement {
  let last = 0;
  t.forEach((n, i) => {
    if (n.state !== 'future') last = i;
  });
  // the last node reached: nothing turns any more
  const reached = t[3].state !== 'future';
  return el(
    'ol',
    { class: `track${opts.waiting ? ' waiting' : ''}${reached ? ' all-done' : ''}`, 'aria-label': opts.label },
    el('span', { class: 'track-fill', style: `width:${(last / 3) * 75}%`, 'aria-hidden': 'true' }),
    ...t.map((n, i) => el('li', { class: `tn ${n.state}`, key: `tn${i}`, 'aria-current': n.state === 'current' ? 'step' : undefined }, el('span', { class: 'tn-mark', 'aria-hidden': 'true' }), el('span', { class: 'tn-label', text: n.label }))),
  );
}

/** "Signed in as st1234" / "Approved" / "Your grid account is ready", each ticking itself */
export function checklist(rows: ChecklistRow[]): HTMLElement {
  // all three done: one line, so "Where your work goes" fits the panel with its button in view
  if (rows.length === 3 && rows.every((r) => r.state === 'done')) {
    return el('ul', { class: 'checklist all' }, el('li', { class: 'cl done', key: 'all' }, el('span', { class: 'cl-mark', key: 'done' }, drawnCheck(16)), el('span', { text: `${rows[0]!.text} · ${rows[1]!.text} · ${LABELS.ready}` })));
  }
  return el(
    'ul',
    { class: 'checklist' },
    ...rows.map((r, i) =>
      el(
        'li',
        { class: `cl ${r.state}`, key: `cl${i}` },
        el('span', { class: 'cl-mark', key: r.state }, r.state === 'done' ? drawnCheck(16, i * 120) : r.state === 'now' ? spinner(16) : null),
        el('span', { text: r.text }),
      ),
    ),
  );
}

/** a problem: its body beside a mark, and its button (the moment's one control) */
export function problem(p: ProblemView, onAct: OnAct, opts: { pending?: string; tone?: 'bad' | 'wait'; onButton?: (e: Event) => void } = {}): HTMLElement {
  return el(
    'div',
    { class: 'problem', role: 'alert' },
    el('p', { class: `problem-body${opts.tone === 'wait' ? ' wait' : ''}` }, icon('alert', 18), el('span', { text: p.body })),
    p.button ? button(p.button, onAct, { pending: opts.pending, onClick: opts.onButton }) : null,
  );
}

/** the tick: a real checkbox drawn as a 22 px box; a bold first line and a soft second line in one label */
export function tickBox(id: string, bold: string, soft: string | undefined, checked: boolean, onChange: (checked: boolean) => void, opts: { card?: boolean; describedBy?: string; plain?: boolean } = {}): HTMLElement {
  const input = el('input', {
    type: 'checkbox',
    class: 'tick-input',
    id,
    checked,
    'aria-describedby': opts.describedBy,
    onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
  });
  return el(
    'label',
    { class: `tick${opts.card ? ' tick-card' : ''}`, for: id },
    input,
    el('span', { class: 'tick-box', 'aria-hidden': 'true' }, svg('svg', { viewBox: '0 0 16 16' }, svg('path', { d: 'M3.5 8.4l3 3 6-6.6' }))),
    el('span', { class: 'tick-text' }, opts.plain ? bold : el('strong', { text: bold }), soft ? ' ' : null, soft ? el('span', { class: 'soft', text: soft }) : null),
  );
}

/** a fold that opens in place (grid rows 0fr to 1fr); closed content is inert */
export function fold(id: string, open: boolean, ...children: Array<Node | null | false>): HTMLElement {
  return el('div', { class: `fold${open ? ' open' : ''}`, id, inert: !open }, el('div', { class: 'fold-inner' }, ...children));
}

/** the control that opens a fold: aria-expanded, a chevron that turns 90° */
export function foldToggle(controls: string, open: boolean, label: string, onToggle: () => void, cls = 'btn-link'): HTMLButtonElement {
  return el('button', { type: 'button', class: `btn ${cls} fold-toggle`, 'aria-expanded': open ? 'true' : 'false', 'aria-controls': controls, onClick: onToggle }, el('span', { class: 'btn-label', text: label }), icon('chevronRight', 14, 'chev'));
}

const MENU_ICON: Partial<Record<Action12['kind'], IconName>> = { tour: 'sparkle', 'open-files': 'folder', 'open-settings': 'sliders', 'open-details': 'doc', 'open-help': 'help', 'open-needs': 'id' };

/** the header: the wordmark, and "⋯" (aria-label "More") with its menu */
export function header(wordmark: string, menu: Array<{ label: string; action: Action12 }> | undefined, open: boolean, onToggle: (open: boolean) => void, onPick: (a: Action12) => void): HTMLElement {
  const items = menu ?? [];
  const menuEl = open
    ? el(
        'div',
        {
          class: 'menu',
          role: 'menu',
          id: 'more-menu',
          onKeydown: (e: Event) => {
            const k = e as KeyboardEvent;
            const all = Array.from((k.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.menu-item'));
            const i = all.indexOf(document.activeElement as HTMLElement);
            if (k.key === 'ArrowDown' || k.key === 'ArrowUp') {
              k.preventDefault();
              all[(i + (k.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus();
            } else if (k.key === 'Escape' || k.key === 'Tab') {
              if (k.key === 'Escape') {
                k.preventDefault();
                k.stopPropagation();
              }
              onToggle(false);
              document.getElementById('more-btn')?.focus();
            }
          },
        },
        ...items.map((it, i) =>
          el('button', { type: 'button', class: 'menu-item', role: 'menuitem', key: `m${i}`, onClick: () => { onToggle(false); onPick(it.action); } }, icon(MENU_ICON[it.action.kind] ?? 'chevronRight', 18), el('span', { text: it.label })),
        ),
      )
    : null;
  return el(
    'header',
    { class: 'hdr' },
    el('span', { class: 'wordmark', text: wordmark }),
    items.length
      ? el(
          'div',
          { class: 'menu-wrap' },
          el('button', { type: 'button', class: 'btn btn-icon', id: 'more-btn', 'aria-label': LABELS.menu, 'aria-haspopup': 'menu', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': 'more-menu', onClick: () => onToggle(!open) }, icon('more', 18)),
          menuEl,
        )
      : null,
  );
}

const CLOCK = /\b\d{1,2}:\d{2}(?::\d{2})?\b/;

/** the hero's subline, ticking: the first timer in it follows `timer`; "online just now" / "up 2 h 14 min" follows it when online */
export function liveSub(sub: string, timer: Timer | undefined, mode: 'timer' | 'up'): (() => string) | undefined {
  if (!timer) return undefined;
  const since = new Date(timer.since).getTime();
  if (!Number.isFinite(since)) return undefined;
  const UP = /(online just now|up .+)$/;
  if (mode === 'up') return UP.test(sub) ? () => sub.replace(UP, onlineFor(Date.now() - since)) : undefined;
  return CLOCK.test(sub) ? () => sub.replace(CLOCK, formatTimer(Date.now() - since)) : undefined;
}

/**
 * The hero: the orb, the state word in Newsreader 32, one subline, and "As of …" when not live. A waiting
 * state's clock (timer with timerPlace) is the hero's large line, 54 px tabular, under the word: the
 * timer is the hero while in line, starting or renewing (spec, "The home panel" 3). An online state's
 * timer ticks "up …" in the subline.
 */
export function hero(h: HeroView, opts: { bigTimer?: boolean; swap?: boolean } = {}): HTMLElement {
  const since = h.timer ? new Date(h.timer.since).getTime() : NaN;
  const sub = h.sub;
  const big = (opts.bigTimer ?? true) && !!h.timerPlace && Number.isFinite(since);
  const clock = () => formatTimer(Date.now() - since);
  const tick =
    sub && h.timerPlace && Number.isFinite(since) && !big
      ? () => (h.timerPlace === 'before' ? `${clock()} · ${sub}` : `${sub} · ${clock()}`)
      : sub && (h.state === 'online' || h.state === 'online-new')
        ? liveSub(sub, h.timer, 'up')
        : undefined;
  return el(
    'div',
    { class: `hero${h.asOf ? ' stale' : ''}`, ...(opts.swap === false ? {} : { 'data-swap': h.state }) },
    orb(h.orb, !!h.burst),
    el('h1', { class: 'hero-word', text: h.word }),
    big ? el('p', { class: 'hero-timer', role: 'timer', 'aria-label': h.word, text: clock(), tick: clock }) : null,
    h.sub ? el('p', { class: 'hero-sub', text: tick ? tick() : h.sub, tick }) : null,
    h.asOf ? el('p', { class: 'hero-asof', text: h.asOf }) : null,
  );
}

const DOT: Record<string, string> = {
  'signed-in': 'ok',
  'signed-out': 'off',
  unreachable: 'bad',
  checking: 'off',
  needs: 'off',
  unknown: 'off',
  online: 'ok',
  asked: 'off',
  queued: 'off',
  starting: 'off',
  'needs-you': 'off',
  renewing: 'off',
  stopped: 'off',
  error: 'bad',
  'as-of': 'off',
};

/**
 * 12.0.0: under the Grid row's value, how the grid is reached: "Direct" or "Through GlobalProtect", and,
 * while the protected key waits for this browser session, "Locked · Unlock" (the passkey step runs in
 * the click: `unlock`).
 */
function via(v: NonNullable<StatusRows['grid']['via']>, unlock?: () => void, busy?: boolean): HTMLElement {
  return el(
    'span',
    { class: `srow-via${v.locked ? ' locked' : ''}`, 'data-mode': v.mode },
    icon(v.locked ? 'lock' : v.mode === 'direct' ? 'route' : 'shield', 13),
    el('span', { text: v.text }),
    v.locked ? el('span', { class: 'via-sep', 'aria-hidden': 'true', text: '·' }) : null,
    v.locked ? el('span', { text: v.locked.text }) : null,
    v.locked ? el('span', { class: 'via-sep', 'aria-hidden': 'true', text: '·' }) : null,
    v.locked
      ? el('button', { type: 'button', class: `btn btn-link via-unlock${busy ? ' busy' : ''}`, 'aria-busy': busy ? 'true' : undefined, onClick: () => !busy && unlock?.() }, busy ? spinner(12) : null, el('span', { class: 'btn-label', text: v.locked.unlock }))
      : null,
  );
}

/** the three-row status card: Grid, Claude, Worker; every dot has its word beside it */
export function statusCard(rows: StatusRows, labels: { grid: string; claude: string; worker: string }, onAct: OnAct, pending?: string, opts: { unlock?: () => void; unlocking?: boolean } = {}): HTMLElement {
  const row = (key: string, label: string, state: string, text: string, link?: ButtonView, under?: HTMLElement | null) =>
    el(
      'li',
      { class: `srow${under ? ' two' : ''}`, key },
      el('span', { class: 'srow-label', text: label }),
      el(
        'span',
        { class: 'srow-stack' },
        el(
          'span',
          { class: 'srow-value' },
          state === 'checking' ? spinner(12) : el('span', { class: `dot ${DOT[state] ?? 'off'}`, 'aria-hidden': 'true' }),
          el('span', { class: 'txt', text: link ? `${text.replace(new RegExp(` · ${link.label}$`), '')} ·` : text }),
          link ? button({ ...link, tone: 'link' }, onAct, { block: false, pending, cls: 'row-link' }) : null,
        ),
        under ?? null,
      ),
    );
  const g = rows.grid;
  return el(
    'ul',
    { class: 'card-status' },
    // a protected key not unlocked this browser session: the account is known but nothing is read, so the dot is the quiet one
    row('grid', labels.grid, g.via?.locked && g.state === 'signed-in' ? 'unknown' : g.state, g.text, g.link, g.via ? via(g.via, opts.unlock, opts.unlocking) : null),
    row('claude', labels.claude, rows.claude.state, rows.claude.text, rows.claude.link),
    row('worker', labels.worker, rows.worker.state, rows.worker.text),
  );
}

/** a 56 px tile with a line icon, over a moment's title */
export function glyph(name: IconName): HTMLElement {
  return el('span', { class: 'glyph', 'aria-hidden': 'true' }, icon(name, 26));
}
