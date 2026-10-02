// Show log: closed every time the panel opens; it expands in place over 320 ms and its chevron turns
// 90°. A box of at most 240 px in Plex Mono 11.5 that scrolls inside, holding the plain-words timeline
// the core merged from Beethoven's own events and the worker's progress.log (model.ts LogLine), oldest
// first. "Copy log" and "Hide log" sit at its end. No shell output, job id or path ever reaches it: the
// lines are the core's, from LOG_WORDS.
import type { LogLine } from '../core/model';
import { el } from './dom';
import { spinner } from './icons';
import { fold, foldToggle } from './parts';

export interface LogWords {
  show: string;
  hide: string;
  copy: string;
}

export function logText(lines: LogLine[]): string {
  return lines.map((l) => `${l.clock} ${l.text}`).join('\n');
}

export function logFold(open: boolean, lines: LogLine[] | undefined, words: LogWords, cb: { toggle: () => void; copy: (text: string) => void }): HTMLElement {
  // the toggle says what it will do: "Show log" closed, "Hide log" open
  const label = open ? words.hide : words.show.replace(/\s*›\s*$/, '');
  const box = el(
    'ol',
    { class: 'logbox', tabindex: open ? '0' : undefined, 'aria-label': words.show.replace(/\s*›\s*$/, '') },
    ...(lines ?? []).map((l, i) => el('li', { key: `${l.at}-${i}` }, el('span', { class: 'lt', text: l.clock }), el('span', { text: l.text }))),
  );
  return el(
    'section',
    { class: 'log' },
    foldToggle('log-fold', open, label, cb.toggle, 'btn-text log-toggle'),
    fold(
      'log-fold',
      open,
      lines === undefined ? el('div', { class: 'logbox' }, spinner(14)) : box,
      el(
        'div',
        { class: 'log-actions' },
        el('button', { type: 'button', class: 'btn btn-text', text: words.copy, disabled: !lines?.length, onClick: () => cb.copy(logText(lines ?? [])) }),
      ),
    ),
  );
}
