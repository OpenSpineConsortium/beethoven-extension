// The home panel: one headline state with its orb, exactly one primary in the same place every time,
// the online secondary row (New session, Copy link, Phone), the three-row status card, the foot row with
// Stop or Cancel and its confirmation, Try asking, the one-time cards and Show log, folded. Everything
// fits the 360 × 658 panel without scrolling while the log is closed. Pure function of HomeView and the
// page-local state the panel keeps (the confirm row, the phone view, the log fold).
import { WORDS, type HomeView, type LogLine } from '../core/model';
import { el } from './dom';
import { drawnCheck, icon, spinner } from './icons';
import { LABELS } from './labels';
import { logFold, type LogWords } from './log';
import { button, hero, statusCard, type OnAct } from './parts';
import { qrSvg } from './qr';

export interface HomeCtx {
  onAct: OnAct;
  pending?: string;
  confirm: boolean;
  setConfirm: (on: boolean) => void;
  phone: boolean;
  setPhone: (on: boolean) => void;
  copy: (text: string, toastText: string) => void;
  log: { open: boolean; lines?: LogLine[]; words: LogWords; toggle: () => void; copy: (text: string) => void };
  tryIndex: number;
  setTryIndex: (i: number) => void;
  working?: string;
  /** 12.0.0: the Grid row's "Unlock" (the passkey step inside the click) */
  unlock?: () => void;
  keyBusy?: 'protect' | 'unlock' | 'create';
}

function primary(h: HomeView, ctx: HomeCtx): HTMLElement | null {
  const p = h.primary;
  if (!p) return null;
  return el(
    'div',
    { class: 'home-primary' },
    button(p.button, ctx.onAct, { pending: ctx.pending, block: true }),
    p.kind === 'connect' ? el('p', { class: 'home-reminder', text: p.reminder }) : null,
  );
}

function secondary(h: HomeView, ctx: HomeCtx): HTMLElement | null {
  const s = h.secondary;
  if (!s || !h.link) return null;
  const link = h.link;
  return el(
    'div',
    { class: 'home-secondary' },
    button({ ...s.newSession, tone: 'outline' }, ctx.onAct, { pending: ctx.pending, block: false }),
    el('button', { type: 'button', class: 'btn btn-outline', onClick: () => ctx.copy(link, WORDS.home.linkCopied) }, el('span', { class: 'btn-label', text: s.copyLink })),
    el('button', { type: 'button', class: 'btn btn-outline', onClick: () => ctx.setPhone(true) }, el('span', { class: 'btn-label', text: s.phone })),
  );
}

function phoneView(h: HomeView, ctx: HomeCtx): HTMLElement {
  return el(
    'div',
    { class: 'flip' },
    el(
      'div',
      { class: 'flip-face flip-in phone', key: 'phone', role: 'group', 'aria-label': WORDS.home.phoneTitle },
      h.link ? el('div', { 'data-keep': `qr:${h.link}` }, qrSvg(h.link, 180, WORDS.home.phoneTitle)) : null,
      el('h2', { text: WORDS.home.phoneTitle, tabindex: '-1', 'data-autofocus': '' }),
      el('p', { text: WORDS.home.phoneBody(h.title) }),
      el('button', { type: 'button', class: 'btn btn-outline', text: WORDS.home.phoneDone, onClick: () => ctx.setPhone(false) }),
    ),
  );
}

function footRow(h: HomeView, ctx: HomeCtx): HTMLElement {
  const f = h.foot;
  if (f.stopping) return el('div', { class: 'foot-row', role: 'status' }, el('span', { class: 'stopping' }, spinner(14), el('span', { text: WORDS.home.stopping })));
  if (ctx.confirm && f.right)
    return el(
      'div',
      { class: 'confirm', role: 'alertdialog', 'aria-label': f.confirm.text },
      el('span', { class: 'confirm-text', text: f.confirm.text }),
      el('button', { type: 'button', class: 'btn btn-text', 'data-autofocus': '', text: f.confirm.keep, onClick: () => ctx.setConfirm(false) }),
      button({ ...f.confirm.stop, tone: 'ink' }, (a) => { ctx.setConfirm(false); ctx.onAct(a); }, { pending: ctx.pending, block: false, cls: 'btn-brick' }),
    );
  return el(
    'div',
    { class: 'foot-row' },
    el('span', { text: f.left ?? '' }),
    f.right ? el('button', { type: 'button', class: 'btn btn-text stop', text: f.right.label, onClick: () => ctx.setConfirm(true) }) : null,
  );
}

function tryAsking(h: HomeView, ctx: HomeCtx): HTMLElement | null {
  const t = h.tryAsking;
  if (!t) return null;
  // one compact row (the three prompts stacked live in the tour): the eyebrow with its dots and its x,
  // then one prompt with Copy; a dot shows another prompt, which crossfades in place
  const n = t.prompts.length;
  const i = Math.max(0, Math.min(n - 1, ctx.tryIndex));
  const p = t.prompts[i]!;
  return el(
    'section',
    { class: 'try', 'aria-label': t.eyebrow },
    el(
      'div',
      { class: 'try-head' },
      el('h2', { class: 'eyebrow', text: t.eyebrow }),
      el(
        'div',
        { class: 'try-dots', role: 'group', 'aria-label': LABELS.prompts },
        ...t.prompts.map((q, k) =>
          el('button', { type: 'button', class: `try-dot${k === i ? ' on' : ''}`, key: `d${k}`, 'aria-label': `${k + 1} / ${n}`, 'aria-pressed': k === i ? 'true' : 'false', onClick: () => ctx.setTryIndex(k) }, el('i')),
        ),
      ),
      el('button', { type: 'button', class: 'btn btn-icon bare', 'aria-label': LABELS.dismiss, onClick: () => ctx.onAct(t.dismiss) }, icon('close', 15)),
    ),
    el(
      'div',
      { class: 'try-item' },
      el('p', { text: p, 'data-swap': String(i) }),
      el('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `${LABELS.copyPrompt}: ${p}`, onClick: () => ctx.copy(p, t.copied) }, icon('copy', 16)),
    ),
  );
}

function cards(h: HomeView, ctx: HomeCtx): Array<HTMLElement> {
  return h.cards.map((c) => {
    if (c.id === 'tour-card')
      return el(
        'div',
        { class: 'once', key: c.id },
        icon('sparkle', 18),
        el('p', { text: c.text }),
        c.open ? el('button', { type: 'button', class: 'btn btn-outline', 'aria-label': c.text, onClick: () => c.open && ctx.onAct(c.open) }, icon('play', 14)) : null,
        el('button', { type: 'button', class: 'btn btn-icon bare', 'aria-label': LABELS.dismiss, onClick: () => ctx.onAct(c.dismiss) }, icon('close', 15)),
      );
    return el(
      'div',
      { class: `once${c.done ? ' done' : ''}`, key: c.id, role: 'status' },
      c.done ? drawnCheck(18) : icon('pin', 18),
      el('p', { text: c.text }),
      el('button', { type: 'button', class: 'btn btn-icon bare', 'aria-label': LABELS.dismiss, onClick: () => ctx.onAct(c.dismiss) }, icon('close', 15)),
    );
  });
}

export function renderHome(h: HomeView, ctx: HomeCtx): HTMLElement {
  // the hero, its primary and the secondary row leave and arrive together on a change of state (data-swap)
  const top = ctx.phone && h.link
    ? phoneView(h, ctx)
    : el('div', { class: 'flip' }, el('div', { class: 'flip-face', key: 'hero' }, el('div', { class: 'home-top', 'data-swap': `${h.hero.state}|${h.primary?.kind ?? ''}|${h.secondary ? 's' : ''}` }, el('div', { class: 'home-hero' }, hero(h.hero, { swap: false })), primary(h, ctx), secondary(h, ctx))));
  return el(
    'section',
    { class: 'screen home', 'data-screen': 'home' },
    top,
    statusCard(h.rows, WORDS.home.rows, ctx.onAct, ctx.pending, { unlock: ctx.unlock, unlocking: ctx.keyBusy === 'unlock' }),
    footRow(h, ctx),
    ctx.working ? el('p', { class: 'status', style: 'margin-top:8px' }, spinner(16), el('span', { text: ctx.working })) : null,
    tryAsking(h, ctx),
    ...cards(h, ctx),
    logFold(ctx.log.open, ctx.log.lines ?? h.log.lines, { show: h.log.show, hide: h.log.hide, copy: h.log.copy }, ctx.log),
  );
}
