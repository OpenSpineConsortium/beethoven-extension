// Settings: the options page once the agreement is accepted. The welcome page's column, titled
// "Settings", with quiet cards: Your worker, Appearance, Your grid, Connection (12.0.0), The agreement,
// Activity, Google Drive in Claude (optional), and, folded, For your lab lead. A student never needs it.
// Every control sends one Action (core/model.ts); "Change" asks Chrome for the new origin inside its own
// click, and the key's protection switch runs its passkey step inside its own click (rpc.ts KeyGesture),
// on and off: it is off by default, and nothing is lost by leaving it off.
import type { Appearance } from '../core/keys';
import { WORDS, type Action, type SettingsView } from '../core/model';
import { add, clear, copyText, downloadText, el, morph, toast } from './dom';
import { icon } from './icons';
import { LABELS } from './labels';
import { saveHelper } from './helperFile';
import { fold, foldToggle, tickBox } from './parts';
import type { Act } from './rpc';
import { checkPortal, fullText, loadTexts, portalField, termsRegion, type Texts } from './sections';
import type { Gestures } from './welcome';
import { currentKeyGesture } from './rpc';
import { drawnCheck, spinner } from './icons';
import type { ConnectionSettingsView } from '../core/model';

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
  /** 12.0.0: "Forget this computer?" [Forget] [Keep it] */
  confirmForget: boolean;
  /** the key's protection: its passkey step is up */
  keyBusy: boolean;
  /** what the last passkey step came to, until the next view says it */
  keyNote?: string;
  /** what came of Forget this computer (stays until the page closes) */
  forgetNote?: string;
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

function switchRow(id: string, label: string, on: boolean, onToggle: (on: boolean) => void, opts: { note?: string; disabled?: boolean; busy?: boolean } = {}): HTMLElement {
  return el(
    'div',
    { class: `s-row${opts.note ? ' has-note' : ''}` },
    el('label', { class: 's-label', for: id }, el('span', { text: label }), opts.note ? el('span', { class: 's-sub', id: `${id}-note`, text: opts.note }) : null),
    opts.busy ? spinner(18) : null,
    el('button', { type: 'button', class: 'switch', id, role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-describedby': opts.note ? `${id}-note` : undefined, disabled: opts.disabled || opts.busy, onClick: () => onToggle(!on) }),
  );
}

export function mountSettings(root: HTMLElement, opts: { act: Act; gestures: Gestures; local?: Partial<SettingsLocal>; onAppearance?: (a: Appearance) => void }): { show: (v: SettingsView) => void } {
  const g = opts.gestures;
  const local: SettingsLocal = { nameEditing: false, changeOpen: false, termsOpen: false, activityOpen: false, labLeadOpen: false, confirmDisconnect: false, confirmForget: false, keyBusy: false, ...(opts.local ?? {}) };
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

  /** the key's protection, on or off: the passkey step inside this click, then protect-key with what came of it */
  const toggleProtect = (c: ConnectionSettingsView, on: boolean) => {
    if (local.keyBusy || !c.protectKey.available) return;
    if (!c.protectKey.present) {
      // no key yet: the choice is remembered for the first sign-in, whose sheet carries the tick
      void opts.act({ kind: 'protect-key', on, outcome: on ? 'on' : 'off' });
      return;
    }
    const running = currentKeyGesture().protect(on);
    set({ keyBusy: true, keyNote: undefined });
    void running
      .catch(() => 'failed' as const)
      .then((outcome) => {
        const P = WORDS.direct.protectKey;
        // the outcome stays in view under the switch ("Protected." included) until the page closes
        // turning it off that did not happen leaves it on, and says so (never "can't protect": it IS protected)
        const off = !on && outcome !== 'off';
        set({ keyBusy: false, keyNote: off ? P.notOff : outcome === 'on' ? P.turnedOn : outcome === 'cancelled' ? P.cancelled : outcome === 'unsupported' ? P.unsupported : outcome === 'failed' ? P.cancelled : undefined });
        void opts.act({ kind: 'protect-key', on, outcome });
      });
  };

  /** 12.0.0: "Connection": the mode, the key's protection (off by default), the helper, Forget this computer */
  function connectionCard(c: ConnectionSettingsView): HTMLElement {
    const pk = c.protectKey;
    return card(
      c.title,
      // the mode's own label only when it says more than the card's title ("Connection" twice reads as a fault)
      el('div', { class: 's-row stack' }, c.mode.label !== c.title ? el('span', { class: 's-sub', text: c.mode.label }) : null, seg(c.mode.label, c.mode.value, c.mode.options, (m) => void opts.act({ kind: 'set-connection', connection: m }))),
      switchRow('protect-key', pk.label, pk.value, (on) => toggleProtect(c, on), { note: pk.available ? pk.note : WORDS.direct.protectKey.unsupported, disabled: !pk.available, busy: local.keyBusy }),
      // said plainly: turned on after setup, an older unprotected copy can stay in the browser's files a while
      pk.laterNote && pk.available ? el('p', { class: 's-note s-fine', text: pk.laterNote }) : null,
      local.keyNote ? el('p', { class: 's-note', role: 'status', text: local.keyNote }) : null,
      el(
        'div',
        { class: 's-row' },
        el('span', { class: 's-label' }, el('span', { class: 's-sub', text: c.helper.label }), el('span', { class: 's-line' }, c.helper.installed ? drawnCheck(16, 0, 'plain') : null, el('span', { text: c.helper.text }))),
        el(
          'div',
          { class: 'btns' },
          !c.helper.installed && c.helper.download
            ? el('a', { class: 'btn btn-outline', href: c.helper.download.url, download: c.helper.download.file, onClick: (e: Event) => saveHelper(e, c.helper.download!, () => void opts.act({ kind: 'bridge-downloaded', os: c.helper.download!.os })) }, icon('download', 14), el('span', { text: WORDS.direct.installHelper.download(c.helper.download.osLabel) }))
            : null,
          el('button', { type: 'button', class: 'btn btn-outline', text: c.helper.checkAgain.label, onClick: () => c.helper.checkAgain.action && void opts.act(c.helper.checkAgain.action) }),
        ),
      ),
      el(
        'div',
        { class: 's-row has-note' },
        // while confirming, the question takes the note's place, before its two buttons
        el('span', { class: 's-label' }, el('span', { text: c.keyLine }), local.confirmForget ? el('span', { class: 's-sub s-ask', role: 'alert', text: c.forget.confirm }) : el('span', { class: 's-sub', text: c.forget.note })),
        local.confirmForget
          ? el(
              'div',
              { class: 'btns' },
              el('button', { type: 'button', class: 'btn btn-text', text: WORDS.home.keep, onClick: () => set({ confirmForget: false }) }),
              el('button', {
                type: 'button',
                class: 'btn btn-brick',
                style: 'height:36px',
                'aria-label': c.forget.confirm,
                text: c.forget.button.label,
                onClick: () => {
                  set({ confirmForget: false, forgetNote: undefined });
                  // a protected key not unlocked this session: unlocked first, inside this click, so the grid forgets it too
                  const unlocked = c.forget.locked ? currentKeyGesture().unlock().catch(() => 'failed' as const) : Promise.resolve('unlocked' as const);
                  void unlocked.then(async (u) => {
                    if (c.forget.locked) await opts.act({ kind: 'unlock-key', outcome: u });
                    const r = c.forget.button.action ? await opts.act(c.forget.button.action) : undefined;
                    const S = WORDS.direct.settings;
                    const onGrid = (r as { onGrid?: string } | undefined)?.onGrid;
                    set({ forgetNote: onGrid === 'forgotten' || onGrid === 'none' ? S.forgotten : r ? S.forgottenHere : undefined });
                  });
                },
              }),
            )
          : el('button', { type: 'button', class: 'btn btn-outline', text: c.forget.label, disabled: c.forget.disabled, onClick: () => set({ confirmForget: true, forgetNote: undefined }) }),
      ),
      local.confirmForget && c.forget.locked ? el('p', { class: 's-note', text: WORDS.direct.settings.forgetLocked }) : null,
      local.forgetNote ? el('p', { class: 's-note', role: 'status', text: local.forgetNote }) : null,
    );
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
      v.connection ? connectionCard(v.connection) : null,
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
