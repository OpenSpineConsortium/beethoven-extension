// Settings: the options page once the agreement is accepted. The welcome page's column, titled
// "Settings", with quiet cards: Your worker, Appearance, Your grid, The agreement, Activity, Google
// Drive in Claude (optional), and, folded, For your lab lead. A student never needs it. Every control
// sends one Action (core/model.ts); "Change" asks Chrome for the new origin inside its own click.
import type { Appearance } from '../core/keys';
import { WORDS, type Action, type SettingsView } from '../core/model';
import { add, clear, copyText, downloadText, el, morph, toast } from './dom';
import { icon } from './icons';
import { LABELS } from './labels';
import { fold, foldToggle, tickBox } from './parts';
import type { Act } from './rpc';
import { checkPortal, fullText, loadTexts, portalField, termsRegion, type Texts } from './sections';
import type { Gestures } from './welcome';

export interface SettingsLocal {
  nameEditing: boolean;
  nameValue?: string;
  changeOpen: boolean;
  portalInput?: string;
  portalError?: string;
  termsOpen: boolean;
  activityOpen: boolean;
  activityText?: string;
  labLeadOpen: boolean;
  confirmDisconnect: boolean;
}

function seg<T extends string>(label: string, value: T, options: Array<{ value: T; label: string }>, onPick: (v: T) => void): HTMLElement {
  return el(
    'div',
    {
      class: 'seg',
      role: 'radiogroup',
      'aria-label': label,
      onKeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key !== 'ArrowRight' && k.key !== 'ArrowLeft') return;
        k.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = options[(i + (k.key === 'ArrowRight' ? 1 : options.length - 1)) % options.length]!;
        onPick(next.value);
        setTimeout(() => (document.querySelector(`[data-seg="${label}"][data-v="${next.value}"]`) as HTMLElement | null)?.focus(), 0);
      },
    },
    ...options.map((o) =>
      el('button', { type: 'button', class: 'seg-opt', role: 'radio', 'aria-checked': o.value === value ? 'true' : 'false', tabindex: o.value === value ? '0' : '-1', 'data-seg': label, 'data-v': o.value, text: o.label, onClick: () => onPick(o.value) }),
    ),
  );
}

function switchRow(id: string, label: string, on: boolean, onToggle: (on: boolean) => void): HTMLElement {
  return el(
    'div',
    { class: 's-row' },
    el('label', { class: 's-label', for: id, text: label }),
    el('button', { type: 'button', class: 'switch', id, role: 'switch', 'aria-checked': on ? 'true' : 'false', onClick: () => onToggle(!on) }),
  );
}

export function mountSettings(root: HTMLElement, opts: { act: Act; gestures: Gestures; local?: Partial<SettingsLocal>; onAppearance?: (a: Appearance) => void }): { show: (v: SettingsView) => void } {
  const g = opts.gestures;
  const local: SettingsLocal = { nameEditing: false, changeOpen: false, termsOpen: false, activityOpen: false, labLeadOpen: false, confirmDisconnect: false, ...(opts.local ?? {}) };
  let view: SettingsView | undefined;
  let texts: Texts | undefined;
  let page: HTMLElement | undefined;
  void loadTexts(g.url).then((t) => {
    texts = t;
    render();
  }).catch(() => undefined);
  const set = (patch: Partial<SettingsLocal>) => {
    Object.assign(local, patch);
    render();
  };
  const pref = (prefs: Extract<Action, { kind: 'set-pref' }>['prefs']) => void opts.act({ kind: 'set-pref', prefs });

  const changePortal = (value: string) => {
    const c = checkPortal(value);
    if (!c.origin) return set({ portalError: c.error, portalInput: value });
    const granting = g.request(c.origin);
    set({ portalError: undefined, portalInput: value });
    void granting.then((granted) => opts.act({ kind: 'change-portal', origin: c.origin!, granted })).then(() => set({ changeOpen: false }));
  };

  const showActivity = async () => {
    if (local.activityOpen) return set({ activityOpen: false });
    const r = await opts.act({ kind: 'audit', op: 'export' });
    set({ activityOpen: true, activityText: r?.text ?? '' });
  };

  function card(title: string, ...rows: Array<Node | null | false>): HTMLElement {
    return el('section', { class: 's-card' }, el('h2', { class: 'eyebrow', text: title }), ...rows);
  }

  function render(): void {
    const v = view;
    if (!v) return;
    const w = v.worker;
    const nameRow = local.nameEditing
      ? el(
          'div',
          { class: 's-row' },
          el('input', {
            type: 'text',
            class: 'field',
            id: 'worker-name',
            value: local.nameValue ?? w.name,
            'aria-label': LABELS.workerName,
            'data-autofocus': '',
            onInput: (e: Event) => {
              local.nameValue = (e.currentTarget as HTMLInputElement).value;
            },
            onKeydown: (e: Event) => {
              const k = e as KeyboardEvent;
              if (k.key === 'Escape') set({ nameEditing: false, nameValue: undefined });
              if (k.key === 'Enter') {
                const name = (k.currentTarget as HTMLInputElement).value.trim();
                if (name) pref({ worker_name: name });
                set({ nameEditing: false });
              }
            },
          }),
          el('button', { type: 'button', class: 'btn btn-outline', text: v.grid.change, onClick: () => { const name = (local.nameValue ?? w.name).trim(); if (name) pref({ worker_name: name }); set({ nameEditing: false }); } }),
        )
      : el('div', { class: 's-row' }, el('span', { class: 's-label', text: WORDS.statement.workerName(w.name) }), el('button', { type: 'button', class: 'btn btn-outline', text: v.grid.change, onClick: () => { set({ nameEditing: true }); setTimeout(() => (document.getElementById('worker-name') as HTMLInputElement | null)?.focus(), 0); } }));
    const next = el(
      'main',
      { class: 'settings' },
      el('div', { class: 'w-mark' }, el('img', { src: g.url('/icon/48.png'), alt: '', width: '28', height: '28' }), el('span', { text: WORDS.product })),
      el('h1', { text: v.title }),
      card(
        WORDS.settings.worker,
        nameRow,
        el('div', { class: 's-row stack' }, seg(LABELS.permissionMode, w.permissionMode, w.modes, (m) => pref({ permission_mode: m }))),
        switchRow('keep-running', WORDS.settings.keepRunning, w.keepRunning, (on) => pref({ auto_start: on })),
        switchRow('open-claude', WORDS.settings.openClaude, w.openClaude, (on) => pref({ open_claude_on_connect: on })),
      ),
      card(
        WORDS.settings.appearance,
        el('div', { class: 's-row' }, seg(LABELS.appearance, v.appearance.value, v.appearance.options, (a) => { opts.onAppearance?.(a); pref({ appearance: a }); })),
      ),
      card(
        WORDS.settings.grid,
        el(
          'div',
          { class: 's-row' },
          el('span', { class: 's-label mono', text: v.grid.address ?? '—' }),
          el('div', { class: 'btns' },
            el('button', { type: 'button', class: 'btn btn-outline', 'aria-expanded': local.changeOpen ? 'true' : 'false', 'aria-controls': 'change-fold', text: v.grid.change, onClick: () => set({ changeOpen: !local.changeOpen, portalInput: local.portalInput ?? v.grid.address ?? '' }) }),
            local.confirmDisconnect
              ? el('button', { type: 'button', class: 'btn btn-brick', style: 'height:36px', text: v.grid.disconnect, onClick: () => { set({ confirmDisconnect: false }); void opts.act({ kind: 'disconnect' }); } })
              : el('button', { type: 'button', class: 'btn btn-outline', text: v.grid.disconnect, disabled: !v.grid.address, onClick: () => set({ confirmDisconnect: true }) }),
          ),
        ),
        portalField('change-fold', local.changeOpen, local.portalInput ?? v.grid.address ?? '', local.portalError, WORDS.welcome.usePortal, { input: (val) => { local.portalInput = val; }, use: changePortal }),
      ),
      card(
        WORDS.settings.agreement,
        v.agreement.installId
          ? el(
              'div',
              { class: 's-row' },
              el('span', { class: 's-label' }, el('span', { class: 's-sub', text: v.agreement.installIdLabel }), el('span', { class: 'mono s-id', text: v.agreement.installId })),
              el('button', { type: 'button', class: 'btn btn-outline', 'aria-label': `${LABELS.copy}: ${v.agreement.installIdLabel}`, onClick: () => void copyText(v.agreement.installId!).then((ok) => ok && toast(WORDS.globalprotect.copied)) }, icon('copy', 14), el('span', { text: WORDS.globalprotect.copy })),
            )
          : null,
        v.agreement.record
          ? el(
              'div',
              { class: 's-row' },
              el('span', { class: 's-label', text: v.agreement.acceptedOn ?? '' }),
              el('button', { type: 'button', class: 'btn btn-outline', text: v.agreement.saveRecord, onClick: () => downloadText(`${WORDS.product}-acceptance-record.txt`, v.agreement.record!) }),
            )
          : null,
        el(
          'div',
          { class: 's-row' },
          el('span', { class: 's-label', text: v.agreement.record ? '' : v.agreement.acceptedOn ?? '' }),
          el('div', { class: 'btns' },
            el('button', { type: 'button', class: 'btn btn-outline', text: v.agreement.save, onClick: () => texts && downloadText(`${WORDS.product}-agreement.txt`, fullText(texts)) }),
            el('button', { type: 'button', class: 'btn btn-outline', text: v.agreement.print, onClick: () => { set({ termsOpen: true }); setTimeout(() => window.print(), 50); } }),
          ),
        ),
        el('div', { class: 's-row stack' }, foldToggle('s-terms', local.termsOpen, local.termsOpen ? WORDS.welcome.hideTerms : v.agreement.showTerms, () => set({ termsOpen: !local.termsOpen })), termsRegion('s-terms', local.termsOpen, texts, { openInTab: () => { g.openTab(g.url('/LICENSE.txt')); g.openTab(g.url('/PRIVACY.md')); }, save: () => texts && downloadText(`${WORDS.product}-agreement.txt`, fullText(texts)), print: () => window.print(), scrolled: () => undefined })),
      ),
      card(
        WORDS.settings.activity,
        el(
          'div',
          { class: 's-row' },
          el('span', { class: 's-label' }, el('span', { class: 'mono', text: String(v.activity.count) })),
          el('div', { class: 'btns' },
            el('button', { type: 'button', class: 'btn btn-outline', 'aria-expanded': local.activityOpen ? 'true' : 'false', text: v.activity.show, onClick: () => void showActivity() }),
            el('button', { type: 'button', class: 'btn btn-outline', text: v.activity.export, onClick: async () => { const r = await opts.act({ kind: 'audit', op: 'export' }); if (r?.text !== undefined) downloadText(`beethoven-activity-${new Date().toISOString().slice(0, 10)}.jsonl`, r.text, 'application/x-ndjson'); } }),
            el('button', { type: 'button', class: 'btn btn-outline', text: v.activity.clear, onClick: async () => { await opts.act({ kind: 'audit', op: 'clear' }); set({ activityText: '' }); } }),
          ),
        ),
        fold('s-activity', local.activityOpen, el('pre', { class: 's-audit', text: local.activityText || '—' })),
      ),
      card(
        WORDS.settings.drive,
        el('div', { class: 's-row stack' }, el('p', { class: 'fine', text: LABELS.driveBody }), el('a', { class: 'btn btn-link', href: LABELS.driveUrl, target: '_blank', rel: 'noopener noreferrer', style: 'align-self:flex-start' }, el('span', { text: LABELS.driveOpen }), icon('external', 13))),
        el('div', { class: 's-row' }, tickBox('drive-tick', LABELS.driveTick, undefined, v.drive.connected, (on) => void opts.act({ kind: 'drive-connected', done: on }))),
      ),
      el(
        'section',
        { class: 's-card' },
        el('div', { class: 's-row', style: 'border-top:0' }, foldToggle('s-lablead', local.labLeadOpen, v.labLead.title, () => set({ labLeadOpen: !local.labLeadOpen }), 'btn-text')),
        fold(
          's-lablead',
          local.labLeadOpen,
          el('div', { class: 's-kv', style: 'padding:0 0 14px' }, el('div', { text: `${v.labLead.shellHost}` }), el('div', { text: `${v.labLead.siteProfile}` }), ...v.labLead.hashes.map((h) => el('div', { text: h }))),
        ),
      ),
      el('p', { class: 's-version' }, LABELS.version(g.productVersion()), ' ', el('button', { type: 'button', class: 'btn btn-link', style: 'font-size:13px', 'aria-label': LABELS.copy, onClick: () => void copyText(LABELS.version(g.productVersion())).then((ok) => ok && toast(WORDS.globalprotect.copied)) }, icon('copy', 13))),
    );
    if (page && page.isConnected) morph(page, next);
    else {
      clear(root);
      add(root, next);
      page = next;
    }
  }

  return {
    show(v: SettingsView) {
      view = v;
      render();
    },
  };
}
