// 12.0.0: the prerequisites and the grid code's two routes, drawn the same way on the welcome page, in
// the panel's "What you need" and in the code-setup moment.
//
// Every QR code is drawn on the device (qr.ts, the project's qrcodegen port) and encodes one public page
// only: Wayne State's own guides and the app stores' pages. Its address is printed in full under it, so
// a student can see where it goes before scanning. Beethoven never shows, reads or copies the grid code's
// secret: the university's 2FA Setup page shows it, and the student's phone reads it.
//
// The pages keep only what is on screen: which code of a group is shown, and which route is open.
import { el } from './dom';
import { icon } from './icons';
import type { NeedView, QrGroup, RouteStep, RoutesView } from './model12';
import { WORDS12 } from './model12';
import { qrSvg } from './qr';

export interface QrCtx {
  /** which code of each group is shown (page-local), by the group's id */
  qrPick: Record<string, number>;
  setQrPick: (group: string, i: number) => void;
}

export interface RoutesCtx extends QrCtx {
  /** the open route (page-local); undefined: only the two choices */
  route?: 'laptop' | 'phone';
  setRoute: (r: 'laptop' | 'phone' | undefined) => void;
}

/**
 * One group of QR codes for one thing ("Google Authenticator"): its name, its codes' names as small
 * tabs when there are two (iPhone, Android), the code drawn on the device with "Scan with your phone's
 * camera." beside it, and its address printed in full under it.
 */
/**
 * The address a square code carries: a Wayne State knowledge-base article in its short form
 * (".../KB/ArticleDet?ID=20242", which the university redirects to the article), so the code has fewer,
 * larger modules and reads from an ordinary laptop screen; any other page as it is.
 */
export function qrUrl(url: string): string {
  const m = /^(https:\/\/services\.wayne\.edu\/TDClient\/\d+\/Portal\/KB)\/Article\/(\d+)(?:\/[^?#]*)?$/.exec(url);
  return m ? `${m[1]}/ArticleDet?ID=${m[2]}` : url;
}

export function qrGroup(id: string, g: QrGroup, ctx: QrCtx, opts: { size?: number; num?: number } = {}): HTMLElement {
  const size = opts.size ?? 132;
  const i = Math.max(0, Math.min(g.links.length - 1, ctx.qrPick[id] ?? 0));
  const link = { ...g.links[i]!, url: qrUrl(g.links[i]!.url) };
  const many = g.links.length > 1;
  return el(
    'div',
    { class: 'qrg', key: `qrg-${id}` },
    el(
      'div',
      { class: 'qrg-head' },
      opts.num !== undefined ? el('span', { class: 'qrg-num', 'aria-hidden': 'true', text: String(opts.num) }) : null,
      el('span', { class: 'qrg-title', text: g.title }),
      many
        ? el(
            'div',
            { class: 'qrg-tabs', role: 'tablist', 'aria-label': g.title },
            ...g.links.map((l, k) =>
              el('button', {
                type: 'button',
                class: `qrg-tab${k === i ? ' on' : ''}`,
                role: 'tab',
                key: `t${k}`,
                id: `${id}-tab-${k}`,
                'aria-selected': k === i ? 'true' : 'false',
                'aria-controls': `${id}-panel`,
                tabindex: k === i ? '0' : '-1',
                text: l.label,
                onClick: () => ctx.setQrPick(id, k),
                onKeydown: (e: Event) => {
                  const ke = e as KeyboardEvent;
                  if (ke.key !== 'ArrowRight' && ke.key !== 'ArrowLeft') return;
                  ke.preventDefault();
                  const n = (k + (ke.key === 'ArrowRight' ? 1 : g.links.length - 1)) % g.links.length;
                  ctx.setQrPick(id, n);
                  setTimeout(() => document.getElementById(`${id}-tab-${n}`)?.focus(), 0);
                },
              }),
            ),
          )
        : null,
    ),
    el(
      'div',
      { class: 'qrg-card', id: `${id}-panel`, role: many ? 'tabpanel' : 'group', 'aria-label': many ? `${g.title}: ${link.label}` : g.title },
      el('div', { class: 'qrg-code', 'data-keep': `qr:${link.url}:${size}` }, qrSvg(link.url, size, `${g.title}: ${link.label}`)),
      el('p', { class: 'qrg-hint' }, icon('phone', 16), el('span', { text: WORDS12.needs.scan })),
      el('a', { class: 'qrg-url', href: link.url, target: '_blank', rel: 'noopener noreferrer', text: link.url }),
    ),
  );
}

/** the prerequisites: number, title, detail, help link, and the QR codes under the two that a phone needs */
export function needsBlock(needs: Array<NeedView | { title: string; detail: string; link: { label: string; url: string } }>, ctx: QrCtx, opts: { title?: string; titleId?: string; compact?: boolean } = {}): HTMLElement {
  return el(
    'section',
    { class: `w-needs${opts.compact ? ' compact' : ''}`, 'aria-labelledby': opts.titleId },
    opts.title ? el('h2', { class: 'eyebrow', id: opts.titleId, text: opts.title }) : null,
    el(
      'ol',
      {},
      ...needs.map((n, i) => {
        const id = 'id' in n ? n.id : `n${i}`;
        const qrs = 'qrs' in n ? n.qrs : undefined;
        return el(
          'li',
          { class: 'need', key: id },
          el('span', { class: 'need-num', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, el('div', { class: 'need-title', text: n.title }), el('div', { class: 'need-detail', text: n.detail })),
          n.link ? el('a', { class: 'need-link', href: n.link.url, target: '_blank', rel: 'noopener noreferrer' }, el('span', { text: n.link.label }), icon('external', 13)) : el('span'),
          qrs?.length ? el('div', { class: `need-qr${qrs.length > 1 ? ' two' : ''}` }, ...qrs.map((g, k) => qrGroup(`need-${id}-${k}`, g, ctx, { size: opts.compact ? 128 : 132 }))) : null,
        );
      }),
    ),
  );
}

/** a route's numbered steps: each sentence, then its QR codes, its link, the 2FA Setup notice and its note */
export function routeSteps(id: string, steps: RouteStep[], ctx: QrCtx, opts: { numberGroups?: boolean } = {}): HTMLElement {
  let g = 0;
  return el(
    'ol',
    { class: 'rsteps' },
    ...steps.map((s, i) =>
      el(
        'li',
        { class: 'rstep', key: `${id}-${i}` },
        el('span', { class: 'rstep-num', 'aria-hidden': 'true', text: String(i + 1) }),
        el(
          'div',
          { class: 'rstep-body' },
          el('p', { class: 'rstep-text', text: s.text }),
          s.warn ? el('p', { class: 'rstep-warn', role: 'note' }, icon('alert', 16), el('span', { text: s.warn })) : null,
          s.note ? el('p', { class: 'rstep-note', text: s.note }) : null,
          ...(s.links ?? []).map((l, k) => el('a', { class: 'rstep-link', key: `l${k}`, href: l.url, target: '_blank', rel: 'noopener noreferrer' }, el('span', { text: l.label }), icon('external', 13))),
          ...(s.qrs ?? []).map((q, k) => {
            g += 1;
            return qrGroup(`${id}-q${i}-${k}`, q, ctx, { size: 132, num: opts.numberGroups ? g : undefined });
          }),
        ),
      ),
    ),
  );
}

/**
 * The route choice: the question and the two routes as two cards; once one is chosen, the 2FA Setup
 * notice, its numbered list, and the closing line that Beethoven never sees the code.
 */
export function routeChoice(r: RoutesView, ctx: RoutesCtx, opts: { heading?: 'h2' | 'h3' } = {}): HTMLElement {
  const open = ctx.route ? r.routes.find((x) => x.id === ctx.route) : undefined;
  return el(
    'section',
    { class: 'routes', 'aria-label': r.question },
    el(opts.heading ?? 'h2', { class: 'routes-q', text: r.question }),
    el(
      'div',
      { class: 'routes-pick', role: 'group', 'aria-label': r.choose },
      ...r.routes.map((x) =>
        el(
          'button',
          {
            type: 'button',
            class: `route-card${ctx.route === x.id ? ' on' : ''}`,
            key: x.id,
            'aria-pressed': ctx.route === x.id ? 'true' : 'false',
            'aria-controls': 'route-steps',
            onClick: () => ctx.setRoute(ctx.route === x.id ? undefined : x.id),
          },
          el('span', { class: 'route-ico', 'aria-hidden': 'true' }, icon(x.id === 'laptop' ? 'laptop' : 'phone', 20)),
          el('span', { class: 'route-txt' }, el('span', { class: 'route-title', text: x.title }), el('span', { class: 'route-detail', text: x.detail })),
        ),
      ),
    ),
    open
      ? el(
          'div',
          { class: 'route-open', id: 'route-steps', key: `open-${open.id}`, 'data-swap': open.id },
          el('p', { class: 'route-warn', role: 'note' }, icon('alert', 18), el('span', { text: r.warning })),
          routeSteps(`route-${open.id}`, open.steps, ctx, { numberGroups: open.id === 'phone' }),
          el('p', { class: 'route-never' }, icon('lock', 14), el('span', { text: r.never })),
        )
      : null,
  );
}
