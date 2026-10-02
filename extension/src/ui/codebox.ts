// The Claude sign-in code box (moment 8): 48 px, Plex Mono 15, focused on arrival. It submits on
// paste, and Enter works too; "Continue" appears only when the code is typed by hand. The code is
// handed to the background once (the "paste-code" action, which types it into the student's own sign-in
// on the grid) and the box is emptied at once: the page keeps no copy, stores nothing and logs nothing.
// It reads only what the student pastes into this box (the paste event's own data), never the clipboard.
// The login transcript is never drawn.
import { plausibleCode } from '../core/contract';
import type { ClaudeMoment } from '../core/model';
import { el } from './dom';
import { spinner } from './icons';
import { LABELS } from './labels';

export interface CodeBoxState {
  /** typed by hand (not pasted): show Continue */
  typed: boolean;
  /** the last code did not look like one: the box shakes and the moment says so */
  bad: boolean;
}

export function codeBox(box: ClaudeMoment['box'], st: CodeBoxState, cb: { submit: (code: string) => void; typed: (on: boolean) => void; bad: () => void }): HTMLElement {
  const send = (input: HTMLInputElement, raw: string) => {
    const code = plausibleCode(raw);
    input.value = '';
    if (!code) return cb.bad();
    cb.submit(code);
  };
  const input = el('input', {
    type: 'text',
    id: 'code',
    class: 'code-input',
    placeholder: box.placeholder,
    'aria-label': LABELS.codeBox,
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    enterkeyhint: 'go',
    disabled: box.checking,
    'data-autofocus': box.focus && !box.checking ? '' : undefined,
    onPaste: (e: Event) => {
      const ce = e as ClipboardEvent;
      const text = ce.clipboardData?.getData('text/plain') ?? '';
      ce.preventDefault();
      send(ce.currentTarget as HTMLInputElement, text);
    },
    onInput: (e: Event) => {
      const ie = e as InputEvent;
      const v = (ie.currentTarget as HTMLInputElement).value;
      if (ie.inputType !== 'insertFromPaste') cb.typed(v.trim().length > 0);
    },
    onKeydown: (e: Event) => {
      const k = e as KeyboardEvent;
      if (k.key === 'Enter') {
        k.preventDefault();
        const i = k.currentTarget as HTMLInputElement;
        if (i.value.trim()) send(i, i.value);
      }
    },
  });
  return el(
    'div',
    { class: 'code-wrap' },
    el('div', { class: `codebox${st.bad ? ' bad' : ''}` }, input, box.checking ? spinner(18) : null),
    st.typed && !box.checking
      ? el('button', {
          type: 'button',
          class: 'btn btn-ink btn-block code-continue',
          text: box.continueLabel,
          onClick: () => {
            const i = document.getElementById('code') as HTMLInputElement | null;
            if (i?.value.trim()) send(i, i.value);
          },
        })
      : null,
  );
}
