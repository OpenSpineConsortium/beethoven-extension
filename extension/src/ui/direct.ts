// 12.0.0: the direct way's moments in the panel (core/model.ts DirectMoment): the bundled helper's
// one-time download, Beethoven's own sign-in sheet, the route choice when the grid has no code for the
// account, the code setup with its QR codes, "This computer is set up.", the optional protection of the
// key, and the fallback to GlobalProtect. Same anchor as every moment: the glyph slot, the title at one
// height, the body, the one control at the foot.
//
// The sheet (R2): the AccessID, then the grid's own prompts as they arrive, each answered once. A
// password field is masked; nothing is ever written into an attribute, kept in the page's state or
// offered to be remembered; the fields are emptied as their answers are sent. The fields are kept out
// of the morph (data-keep) so a re-render never copies, clears or moves what is being typed.
//
// Every passkey step (Turn on, the sheet's tick, Unlock) runs in the page inside the click (WebAuthn
// needs a document; rpc.ts KeyGesture), then the page sends what came of it.
import { WORDS, type ButtonView, type ChooseRouteMoment, type CodeSetupMoment, type EnrolledMoment, type FallbackMoment, type HelperDownload, type InstallHelperMoment, type JourneyView, type ProblemView, type ProtectKeyMoment, type SheetPrompt, type SignInSheetMoment } from '../core/model';
import { el } from './dom';
import { drawnCheck, icon, spinner, type IconName } from './icons';
import { LABELS } from './labels';
import { WORDS12, placeGroups, qrGroups } from './model12';
import { button, tickBox, type OnAct } from './parts';
import { personalHelperUrl, saveHelper } from './helperFile';
import { routeSteps, type QrCtx } from './routes';

/** what the direct moments keep on the page alone, and the acts that need the click */
export interface DirectCtx {
  onAct: OnAct;
  pending?: string;
  qr: QrCtx;
  /** the sheet's opt-in tick (unticked by default) */
  protectTicked: boolean;
  setProtectTicked: (on: boolean) => void;
  /** a passkey step is up (the system's prompt): its button turns */
  keyBusy?: 'protect' | 'unlock' | 'create';
  /** the sheet's AccessID could not be sent (empty, or not an AccessID): the core's sentence */
  accountError?: string;
  /** the sheet's Continue: reads the fields, runs the opt-in passkey step when ticked, sends the answers */
  submitSheet: (m: SignInSheetMoment) => void;
  /** "Turn on" (protect-key-optional): the passkey step inside the click */
  protect: () => void;
  /** "Unlock" (the sheet's unlock phase): the passkey step inside the click */
  unlock: () => void;
  /** the bundled installer was saved from this page (page-local, then bridge-downloaded) */
  downloaded: boolean;
  download: (d: HelperDownload) => void;
}

function screen(name: string, ...children: Array<Node | null | false | undefined>): HTMLElement {
  return el('section', { class: `screen moment m-${name}`, 'data-moment': name }, ...children);
}

function title(text: string): HTMLElement {
  return el('h1', { class: 'm-title', text, 'data-swap': text });
}

function body(text: string, cls = ''): HTMLElement {
  return el('p', { class: `m-body${cls ? ` ${cls}` : ''}`, text });
}

function spacer(): HTMLElement {
  return el('div', { class: 'm-spacer', 'aria-hidden': 'true' });
}

function glyph(name: IconName, tone: '' | 'bad' | 'quiet' = ''): HTMLElement {
  return el('span', { class: `glyph${tone ? ` ${tone}` : ''}`, 'aria-hidden': 'true' }, icon(name, 26));
}

function statusLine(text: string, state: 'turning' | 'done' | 'plain' = 'turning'): HTMLElement {
  return el('p', { class: `status m-status${state === 'done' ? ' ok' : ''}`, role: 'status', 'data-swap': text }, state === 'done' ? drawnCheck(18) : state === 'turning' ? spinner(16) : null, el('span', { text }));
}

function problemLine(p: ProblemView): HTMLElement {
  return el('p', { class: 'problem-body m-problem', role: 'alert' }, icon('alert', 18), el('span', { text: p.body }));
}

/** a soft text button under the primary: "Use GlobalProtect instead", "Cancel", "Back" */
function soft(b: ButtonView | undefined, ctx: DirectCtx): HTMLElement | null {
  return b ? button({ ...b, tone: 'text' }, ctx.onAct, { pending: ctx.pending, block: false, cls: 'm-alt' }) : null;
}

export function renderDirect(j: JourneyView, ctx: DirectCtx): HTMLElement | undefined {
  switch (j.moment) {
    case 'install-helper':
      return installHelper(j, ctx);
    case 'sign-in-sheet':
      return signInSheet(j, ctx);
    case 'choose-route':
      return chooseRoute(j, ctx);
    case 'code-setup':
      return codeSetup(j, ctx);
    case 'enrolled':
      return enrolled(j, ctx);
    case 'protect-key-optional':
      return protectKey(j, ctx);
    case 'fallback-to-vpn':
      return fallback(j, ctx);
    default:
      return undefined;
  }
}

// ---- the helper's one-time download -----------------------------------------------------------------

/**
 * Two screens in one moment: before the download, what it is and the one button (with its file name and
 * size under it); once it is saved, the three steps for this system, why the system may warn, and the
 * check that advances by itself (the drawn check when the helper answers). "Use GlobalProtect instead"
 * stays beneath both.
 */
function installHelper(m: InstallHelperMoment, ctx: DirectCtx): HTMLElement {
  const st = m.status;
  const after = ctx.downloaded || st.state !== 'idle';
  const d = m.download;
  if (d) void personalHelperUrl(d);
  // before: the one ink button; after: the same file again as a quiet link under Check again
  const downloadButton = d
    ? el(
        'a',
        {
          class: after ? 'btn btn-link dl-link' : 'btn btn-ink btn-block dl-btn',
          href: d.url,
          download: d.file,
          // the copy made out to this extension (helperFile.ts) is what the browser saves
          onClick: (e: Event) => saveHelper(e, d, () => ctx.download(d)),
        },
        icon('download', after ? 15 : 18),
        el('span', { class: 'btn-label', text: d.label }),
      )
    : null;
  const statusEl =
    st.state === 'found'
      ? statusLine(st.text ?? '', 'done')
      : st.state === 'looking' || st.state === 'waiting'
        ? statusLine(st.text ?? '')
        : st.text && (st.state === 'not-found' || st.state === 'broken')
          ? el('p', { class: `problem-body m-problem${st.state === 'not-found' ? ' wait' : ''}`, role: 'status', 'data-swap': st.state }, icon('alert', 18), el('span', { text: st.text }))
          : null;
  if (!after) {
    return screen(
      'install-helper',
      glyph('download'),
      title(m.title),
      body(m.body),
      d ? null : el('p', { class: 'problem-body m-problem', role: 'status' }, icon('alert', 18), el('span', { text: WORDS.direct.installHelper.noDownload })),
      // why the system may warn, said before it does
      d ? el('p', { class: 'm-fine' }, icon('shield', 15), el('span', { text: m.unsignedNote })) : null,
      spacer(),
      el('div', { class: 'm-foot' }, downloadButton, d ? el('p', { class: 'm-note mono-note', text: d.fileLine }) : null, soft(m.useVpn, ctx)),
    );
  }
  return screen(
    'install-helper',
    glyph('download'),
    title(m.title),
    el('ol', { class: 'rsteps os-steps' }, ...m.steps.map((s, i) => el('li', { class: 'rstep', key: `s${i}` }, el('span', { class: 'rstep-num', 'aria-hidden': 'true', text: String(i + 1) }), el('div', { class: 'rstep-body' }, el('p', { class: 'rstep-text', text: s }))))),
    // why the system warns was said before the download (the screen above); here only what to do when it blocks
    m.osNote ? el('p', { class: 'm-fine' }, icon('alert', 15), el('span', { text: m.osNote })) : el('p', { class: 'm-fine' }, icon('shield', 15), el('span', { text: m.unsignedNote })),
    spacer(),
    // the check's word sits with Check again, in the foot that stays in view while the steps scroll
    el(
      'div',
      { class: 'm-foot sticky' },
      statusEl,
      st.state === 'found' ? null : button({ ...m.checkAgain, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true }),
      d && st.state !== 'found' ? el('div', { class: 'dl-again', title: d.fileLine }, downloadButton) : null,
      soft(m.useVpn, ctx),
    ),
  );
}

// ---- the sign-in sheet --------------------------------------------------------------------------------

function promptField(p: SheetPrompt, i: number, first: boolean, notice: string | undefined): HTMLElement {
  const id = `sheet-p${i}`;
  const masked = !p.echo;
  const code = p.kind === 'code';
  const label = p.kind === 'password' ? LABELS.sheetPassword : code ? LABELS.sheetCode : LABELS.gridQuestion;
  const input = el('input', {
    id,
    class: `field sheet-field${code ? ' code' : ''}`,
    type: masked && !code ? 'password' : 'text',
    // never offered to be remembered: no form, no name, autocomplete off (a code: the platform's one-time-code)
    autocomplete: code ? 'one-time-code' : 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: code ? 'numeric' : 'text',
    maxlength: code ? '12' : undefined,
    'aria-describedby': `${id}-asks${p.hint ? ` ${id}-hint` : ''}`,
    'data-prompt': String(i),
    // the morph leaves the field exactly as it is while the grid's prompt is the same one
    'data-keep': `prompt:${i}:${p.text}:${notice ?? ''}`,
    'data-focus-key': first ? `prompt:${i}:${p.text}:${notice ?? ''}` : undefined,
    onKeydown: (e: Event) => {
      const k = e as KeyboardEvent;
      if (k.key !== 'Enter') return;
      k.preventDefault();
      const next = document.getElementById(`sheet-p${i + 1}`) as HTMLInputElement | null;
      if (next) next.focus();
      else (document.getElementById('sheet-submit') as HTMLButtonElement | null)?.click();
    },
  });
  const reveal =
    masked && !code
      ? el(
          'button',
          {
            type: 'button',
            class: 'btn btn-icon bare field-eye',
            'aria-label': LABELS.showPassword,
            'aria-pressed': 'false',
            'aria-controls': id,
            onClick: (e: Event) => {
              // page-local and visual only: the field's own type flips; nothing is copied anywhere
              const f = document.getElementById(id) as HTMLInputElement | null;
              const b = e.currentTarget as HTMLElement;
              if (!f) return;
              const show = f.type === 'password';
              f.type = show ? 'text' : 'password';
              b.setAttribute('aria-pressed', show ? 'true' : 'false');
              b.setAttribute('aria-label', show ? LABELS.hidePassword : LABELS.showPassword);
              b.replaceChildren(icon(show ? 'eyeOff' : 'eye', 18));
            },
          },
          icon('eye', 18),
        )
      : null;
  return el(
    'div',
    { class: 'sheet-q', key: `q${i}:${p.text}` },
    el('label', { class: 'sheet-label', for: id, text: label }),
    el('div', { class: `field-wrap${reveal ? ' has-eye' : ''}` }, input, reveal),
    p.hint ? el('p', { class: 'sheet-hint', id: `${id}-hint`, text: p.hint }) : null,
    el('p', { class: 'sheet-asks', id: `${id}-asks` }, el('span', { class: 'asks-tag', text: LABELS.gridAsks }), el('span', { class: 'asks-text', text: p.text.trim() })),
  );
}

function accountBlock(m: SignInSheetMoment, ctx: DirectCtx): HTMLElement {
  const editable = m.phase === 'account';
  const err = m.account.error ?? ctx.accountError;
  if (!editable) {
    // past the AccessID: it stays in view, quiet, with Change (back to the field; the connection closes)
    return el(
      'div',
      { class: 'sheet-who', key: 'who' },
      icon('id', 18),
      el('span', { class: 'who-id mono', text: m.account.value ?? '' }),
      m.phase === 'connecting' || m.phase === 'prompt' ? button({ label: LABELS.change, tone: 'link', action: { kind: 'grid-signin-change' } }, ctx.onAct, { block: false, pending: ctx.pending, cls: 'who-change' }) : null,
    );
  }
  return el(
    'div',
    { class: 'sheet-q', key: 'account' },
    el('label', { class: 'sheet-label', for: 'sheet-account', text: m.account.label }),
    el('input', {
      id: 'sheet-account',
      class: `field sheet-field${err ? ' bad' : ''}`,
      type: 'text',
      placeholder: m.account.placeholder,
      value: m.account.value ?? '',
      autocomplete: 'username',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-invalid': err ? 'true' : undefined,
      'aria-describedby': err ? 'sheet-account-err' : undefined,
      'data-keep': `account:${m.account.value ?? ''}`,
      'data-focus-key': `account:${m.account.value ?? ''}`,
      onKeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key !== 'Enter') return;
        k.preventDefault();
        (document.getElementById('sheet-submit') as HTMLButtonElement | null)?.click();
      },
    }),
    err ? el('p', { class: 'field-error', id: 'sheet-account-err', role: 'alert', text: err }) : null,
  );
}

/**
 * "That didn't work three times." and the failures: a brick tile, the problem's title in the moment's
 * place; a failure without a title of its own keeps the sheet's and says what happened beside the mark.
 */
function sheetEnded(m: SignInSheetMoment, ctx: DirectCtx): HTMLElement {
  const p = m.problem!;
  return screen(
    'sign-in-sheet',
    glyph('alert', 'bad'),
    title(p.title ?? m.title),
    p.body ? (p.title ? body(p.body) : problemLine(p)) : null,
    spacer(),
    el(
      'div',
      { class: 'm-foot' },
      // a quiet button (the wrong grid's Try again) stays quiet; any other is the moment's one ink button
      p.button ? (p.button.tone === 'text' ? soft(p.button, ctx) : button({ ...p.button, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true })) : null,
      m.secondary ? (m.secondary.disabled ? el('p', { class: 'm-note', role: 'status', text: m.secondary.label }) : soft(m.secondary, ctx)) : null,
      // back to the AccessID field (a mistyped AccessID); the stop still holds for the account it was for
      el('div', { class: 'm-alts' }, m.phase === 'stopped' || m.phase === 'code-refused' ? soft(m.cancel, ctx) : null, soft(m.useVpn, ctx)),
    ),
  );
}

function signInSheet(m: SignInSheetMoment, ctx: DirectCtx): HTMLElement {
  if ((m.phase === 'stopped' || m.phase === 'failed' || m.phase === 'code-refused') && m.problem) return sheetEnded(m, ctx);
  if (m.phase === 'unlock') {
    const busy = ctx.keyBusy === 'unlock';
    return screen(
      'sign-in-sheet',
      glyph('fingerprint'),
      title(m.title),
      m.instruction ? body(m.instruction) : m.status ? body(m.status) : null,
      busy ? statusLine(WORDS.direct.protectKey.turningOn) : m.problem ? problemLine(m.problem) : null,
      spacer(),
      el('div', { class: 'm-foot' }, button({ ...m.submit, tone: 'ink', action: undefined, busy }, ctx.onAct, { block: true, onClick: () => ctx.unlock(), icon: 'fingerprint' }), el('div', { class: 'm-alts' }, soft(m.useVpn, ctx), soft(m.secondary, ctx))),
    );
  }
  const asking = m.phase === 'prompt' && !!m.prompts?.length;
  // past "Signing in…": the grid took the answers, so the sheet says whose sign-in it was, with the drawn check
  const accepted = m.phase === 'working' && !!m.status && m.status !== WORDS.direct.signin.working && !!m.account.value;
  const busy = m.phase === 'connecting' || m.phase === 'working';
  const protect = m.protect && m.phase === 'account';
  return screen(
    'sign-in-sheet',
    glyph('key'),
    title(m.title),
    (m.phase === 'account' || m.phase === 'prompt') && m.purpose === 'enrol' ? body(WORDS12.sheetWhy, 'sheet-why') : null,
    el(
      'div',
      { class: `signin-form${busy ? ' busy' : ''}` },
      accountBlock(m, ctx),
      accepted ? el('p', { class: 'm-signed', role: 'status' }, drawnCheck(20), el('span', { text: WORDS.grid.signedIn(m.account.value!) })) : null,
      m.instruction && asking ? el('div', { class: 'sheet-instruction' }, el('span', { class: 'asks-tag', text: WORDS.direct.signin.gridSays }), el('p', { class: 'asks-text', text: m.instruction })) : null,
      m.notice && asking ? el('p', { class: 'problem-body sheet-notice', role: 'alert' }, icon('alert', 18), el('span', { text: m.notice })) : null,
      ...(asking ? m.prompts!.map((p, i) => promptField(p, i, i === 0, m.notice)) : []),
      busy && m.status ? statusLine(m.status) : null,
      m.problem ? problemLine(m.problem) : null,
      protect
        ? el(
            'div',
            { class: 'sheet-protect' },
            tickBox('sheet-protect', m.protect!.label, undefined, ctx.protectTicked && m.protect!.available, ctx.setProtectTicked, { describedBy: 'sheet-protect-note' }),
            el('p', { class: 'sheet-protect-note', id: 'sheet-protect-note', text: m.protect!.note }),
          )
        : null,
    ),
    spacer(),
    el(
      'div',
      { class: 'm-foot' },
      el('p', { class: 'sheet-privacy' }, icon('lock', 15), el('span', { text: m.privacy })),
      busy
        ? null
        : el(
            'button',
            {
              type: 'button',
              id: 'sheet-submit',
              class: `btn btn-ink btn-block${ctx.keyBusy === 'create' || m.submit.busy ? ' busy' : ''}`,
              disabled: m.submit.disabled,
              'aria-busy': ctx.keyBusy === 'create' ? 'true' : undefined,
              onClick: () => ctx.submitSheet(m),
            },
            ctx.keyBusy === 'create' ? spinner(18) : null,
            el('span', { class: 'btn-label', text: m.submit.label }),
          ),
      el('div', { class: 'm-alts' }, soft(m.cancel, ctx), accepted ? null : soft(m.useVpn, ctx)),
    ),
  );
}

// ---- the grid code ------------------------------------------------------------------------------------

function chooseRoute(m: ChooseRouteMoment, ctx: DirectCtx): HTMLElement {
  return screen(
    'choose-route',
    glyph('phone'),
    title(m.title),
    body(m.body),
    el('p', { class: 'route-warn', role: 'note', style: 'margin-top:16px' }, icon('alert', 18), el('span', { text: m.warning })),
    el(
      'div',
      { class: 'routes-pick stack', role: 'group', 'aria-label': m.title },
      ...m.options.map((o) =>
        el(
          'button',
          {
            type: 'button',
            class: `route-card${o.button.busy || ctx.pending === o.button.action?.kind ? ' busy' : ''}`,
            key: o.id,
            onClick: () => o.button.action && ctx.onAct(o.button.action),
          },
          el('span', { class: 'route-ico', 'aria-hidden': 'true' }, icon(o.id === 'laptop' ? 'laptop' : 'phone', 20)),
          el('span', { class: 'route-txt' }, el('span', { class: 'route-title', text: o.title }), el('span', { class: 'route-detail', text: o.detail }), el('span', { class: 'route-go' }, el('span', { text: o.button.label }), icon('chevronRight', 14))),
        ),
      ),
    ),
    spacer(),
    el('div', { class: 'm-foot' }, soft(m.useVpn, ctx)),
  );
}

function codeSetup(m: CodeSetupMoment, ctx: DirectCtx): HTMLElement {
  // the phone route's codes under the steps that name them; the laptop route's grid pages as links
  const steps = placeGroups(m.route, m.steps, qrGroups(m.qr));
  return screen(
    'code-setup',
    el('div', { class: 'm-back' }, button({ ...m.back, tone: 'text' }, ctx.onAct, { block: false, pending: ctx.pending, icon: 'chevronLeft' })),
    title(m.title),
    routeSteps(`setup-${m.route}`, steps, ctx.qr, { numberGroups: m.route === 'phone' }),
    el('p', { class: 'route-never' }, icon('lock', 14), el('span', { text: WORDS12.routes.never })),
    spacer(),
    el('div', { class: 'm-foot sticky' }, button({ ...m.done, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true }), soft(m.useVpn, ctx)),
  );
}

// ---- after the sign-in ----------------------------------------------------------------------------------

function enrolled(m: EnrolledMoment, ctx: DirectCtx): HTMLElement {
  return screen(
    'enrolled',
    el('span', { class: 'glyph done', 'aria-hidden': 'true' }, drawnCheck(30)),
    title(m.title),
    m.account ? el('p', { class: 'm-signed', role: 'status', style: 'margin-top:0' }, icon('id', 18), el('span', { text: WORDS.grid.signedIn(m.account) })) : null,
    body(m.body, m.account ? 'after-signed' : ''),
    spacer(),
    el('div', { class: 'm-foot' }, button({ ...m.continue, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true })),
  );
}

/**
 * Optional, and calm: "Not now" is the default and carries the moment on; "Turn on" runs the passkey
 * step inside its click. A browser that cannot gets the plain sentence and no Turn on.
 */
function protectKey(m: ProtectKeyMoment, ctx: DirectCtx): HTMLElement {
  const busy = ctx.keyBusy === 'protect';
  const on = m.outcome === WORDS.direct.protectKey.turnedOn;
  return screen(
    'protect-key-optional',
    glyph('fingerprint'),
    title(m.title),
    body(m.body),
    m.outcome ? el('p', { class: `m-outcome${on ? ' ok' : ''}`, role: 'status', 'data-swap': m.outcome }, on ? drawnCheck(18) : icon('shield', 18), el('span', { text: m.outcome })) : null,
    !m.on.available && !m.outcome ? el('p', { class: 'm-outcome', role: 'status' }, icon('shield', 18), el('span', { text: WORDS.direct.protectKey.unsupported })) : null,
    spacer(),
    el(
      'div',
      { class: 'm-foot' },
      m.on.available && !on
        ? el(
            'button',
            { type: 'button', class: `btn btn-outline btn-block btn-tall${busy ? ' busy' : ''}`, 'aria-busy': busy ? 'true' : undefined, onClick: () => !busy && ctx.protect() },
            busy ? spinner(18) : icon('fingerprint', 18),
            el('span', { class: 'btn-label', text: busy ? m.on.busyLabel : m.on.label }),
          )
        : null,
      button({ ...m.notNow, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true }),
    ),
  );
}

function fallback(m: FallbackMoment, ctx: DirectCtx): HTMLElement {
  return screen(
    'fallback-to-vpn',
    glyph('lock'),
    title(m.title),
    body(m.body),
    spacer(),
    el('div', { class: 'm-foot' }, button({ ...m.continue, tone: 'ink' }, ctx.onAct, { pending: ctx.pending, block: true }), soft(m.tryDirect, ctx)),
  );
}
