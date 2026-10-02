// Details for your lab lead: a sheet that slides in from the right over the panel, with Done. The
// internal words live here and only here (job, node, partition, Slurm, shell host, the audit log):
// a student never needs this sheet, and the hygiene rule exempts it. Everything comes from DetailsView;
// "Running the checks…" clears when they finish because it is the view's own `running` flag.
import type { DetailsView } from '../core/model';
import { el } from './dom';
import { spinner } from './icons';
import { DETAILS_LABELS as L } from './labels';
import { button, type OnAct } from './parts';

function kv(label: string, value: string | number | undefined): HTMLElement | null {
  if (value === undefined || value === '') return null;
  return el('div', { class: 'd-kv' }, el('dt', { text: label }), el('dd', { text: String(value) }));
}

function section(title: string, ...children: Array<Node | null | false>): HTMLElement {
  return el('section', { class: 'd-sec' }, el('h3', { class: 'eyebrow', text: title }), ...children);
}

function pre(text: string | undefined): HTMLElement {
  return el('pre', { class: 'd-pre', text: text && text.trim() ? text : L.nothing });
}

export function renderDetails(d: DetailsView | undefined, cb: { onAct: OnAct; pending?: string; close: () => void; copy: (text: string) => void }, title: string, doneLabel: string): HTMLElement {
  const head = el(
    'div',
    { class: 'sheet-hdr' },
    el('h2', { id: 'sheet-title', text: title, tabindex: '-1', 'data-autofocus': '' }),
    el('button', { type: 'button', class: 'btn btn-text', text: doneLabel, onClick: cb.close }),
  );
  if (!d) return el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' }, head, el('div', { class: 'sheet-body' }, el('p', { class: 'd-running' }, spinner(14), el('span', { text: L.loading }))));
  const onAct: OnAct = (a) => cb.onAct(a);
  const r = d.run;
  const checks = d.checks;
  return el(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    head,
    el(
      'div',
      { class: 'sheet-body' },
      section(
        L.checks,
        el('div', { class: 'd-actions' }, button({ ...checks.run, tone: 'ink' }, onAct, { pending: cb.pending, block: false, cls: 'btn-sm' }), button({ ...checks.copy, tone: 'outline' }, onAct, { pending: cb.pending, block: false })),
        checks.running ? el('p', { class: 'd-running', role: 'status' }, spinner(14), el('span', { text: checks.runningText })) : null,
        el(
          'ol',
          { class: 'd-card d-checks' },
          ...checks.items.map((c, i) => {
            const tag = c.skip ? '—' : c.ok ? 'OK' : c.warn ? 'WARN' : 'FAIL';
            const cls = c.skip ? '' : c.ok ? 'ok' : c.warn ? 'warn' : 'fail';
            return el('li', { key: c.id }, el('span', { class: `d-tag ${cls}`, text: tag }), el('div', {}, el('div', { text: `${i + 1}. ${c.title}` }), el('div', { class: 'd-detail', text: c.detail })));
          }),
        ),
      ),
      section(
        L.run,
        el(
          'dl',
          { class: 'd-card', style: 'margin:0' },
          kv(L.job, r?.job),
          kv(L.nextJob, r?.nextJob),
          kv(L.partition, r?.partition),
          kv(L.qos, r?.qos),
          kv(L.node, r?.node),
          kv(L.schedulerState, r?.schedulerState),
          kv(L.reason, r?.reason),
          kv(L.expectedStart, r?.expectedStart),
          kv(L.checkedAt, r?.checkedAt),
          kv(L.submittedAt, r?.submittedAt),
          kv(L.gotComputerAt, r?.gotComputerAt),
          kv(L.onlineAt, r?.onlineAt),
          kv(L.heartbeat, r?.heartbeatAgeS !== undefined ? `${r.heartbeatAgeS} s` : undefined),
          kv(L.restarts, r?.restarts?.length ? r.restarts.map((x) => `${x.at ?? ''} ${x.lastRcLine ?? ''}`.trim()).join('\n') : undefined),
          kv(L.chain, r?.chainNote),
          kv(L.consent, r?.consentSource),
          kv(L.plan, r?.plan),
          r ? null : kv(L.job, L.nothing),
        ),
      ),
      section(L.progress, pre(d.progressTail.join('\n'))),
      section(L.rc, pre(d.rcTail)),
      section(L.audit, pre(d.audit.join('\n'))),
      // 12.0.0: the direct way, for the lab lead: the mode, each bridge in order, the grid's pinned
      // identity, this browser's key (fingerprint, protected or not), the port, the account the grid
      // accepted, the helper's file, and the plain statement that it is unproven on the grid
      d.direct
        ? section(
            L.direct,
            el(
              'dl',
              { class: 'd-card', style: 'margin:0' },
              kv(L.directMode, d.direct.mode),
              kv(L.bridges, d.direct.bridges.join('\n')),
              kv(L.host, d.direct.host),
              kv(L.pin, d.direct.pin),
              kv(L.key, d.direct.key),
              kv(L.reach, d.direct.reach),
              kv(L.account, d.direct.account),
              kv(L.helperFile, d.direct.helperFile),
            ),
            el('p', { class: 'd-note', text: d.direct.unproven }),
          )
        : null,
      section(
        L.connection,
        el('dl', { class: 'd-card', style: 'margin:0' }, kv(L.shellHost, d.shellHost), kv(L.siteProfile, d.siteProfile), kv(L.channel, d.channel), kv(L.loginSetup, `${d.loginSetup.proven ? L.proven : L.unproven}`)),
        el('p', { class: 'd-note', text: d.loginSetup.text }),
        el('div', { class: 'd-actions', style: 'margin-top:12px' }, button({ ...d.probe, tone: 'outline' }, onAct, { pending: cb.pending, block: false })),
      ),
      el('p', { class: 'd-note', text: d.footer }),
      el('p', { class: 'd-note', text: d.onlineLag }),
    ),
  );
}
