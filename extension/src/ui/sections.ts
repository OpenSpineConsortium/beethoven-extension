// Pieces the welcome page and Settings share: the agreement's full text, expanding in place in a 360 px
// scroll region with "Open in a tab · Save a copy · Print" (MCL 450.838(3): the text can always be kept
// and printed), and the portal field ("Use another portal" on the welcome page, "Change" in Settings),
// which refuses an Anthropic address before any prompt.
import { ANTHROPIC_REFUSAL, normaliseOrigin } from '../core/connect';
import { WORDS } from '../core/model';
import { el } from './dom';
import { icon } from './icons';
import { LABELS } from './labels';
import { fold } from './parts';

export const SEPARATOR = '\n\n\n==================== PRIVACY STATEMENT ====================\n\n';

export interface Texts {
  license: string;
  privacy: string;
}

let texts: Promise<Texts> | undefined;

/** LICENSE.txt and PRIVACY.md as bundled in the package (read from the package, nothing is fetched elsewhere) */
export function loadTexts(url: (p: string) => string): Promise<Texts> {
  texts ??= Promise.all([fetch(url('/LICENSE.txt')).then((r) => r.text()), fetch(url('/PRIVACY.md')).then((r) => r.text())]).then(([license, privacy]) => ({ license, privacy }));
  return texts;
}

/**
 * The text for reading on screen: the files are wrapped at about 100 columns, which breaks badly in a
 * narrower box, so each paragraph's lines are joined. A line in capitals is a heading; a line that
 * starts a list item ("(a)", "1.", "-", "*") starts a new line. The hashes are of the files as bundled,
 * never of this.
 */
export function paragraphs(text: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const block of text.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const raw = block.trim();
    if (!raw) continue;
    const md = raw.replace(/^#+\s*/, '');
    if (md !== raw || (/^[A-Z0-9 ,.;:'()&-]{6,}$/.test(raw) && !/[a-z]/.test(raw))) {
      out.push(el('h4', { text: md }));
      continue;
    }
    const lines: string[] = [];
    for (const line of raw.split('\n')) {
      const l = line.trim();
      if (lines.length && !/^(\([a-z0-9]+\)|\d+\.|[-*•])\s/.test(l)) lines[lines.length - 1] += ` ${l}`;
      else lines.push(l);
    }
    out.push(el('p', {}, ...lines.flatMap((l, i) => (i ? [el('br'), l.replace(/\*\*/g, '')] : [l.replace(/\*\*/g, '')]))));
  }
  return out;
}

export function fullText(t: Texts): string {
  return `${t.license}${SEPARATOR}${t.privacy}`;
}

export interface TermsActs {
  openInTab: () => void;
  save: () => void;
  print: () => void;
  /** the region was scrolled: the page measures whether the end was reached */
  scrolled: (box: HTMLElement) => void;
}

/** the full text in a 360 px region with a soft fade at the bottom edge, and the three ways to keep it */
export function termsRegion(id: string, open: boolean, t: Texts | undefined, acts: TermsActs): HTMLElement {
  return fold(
    id,
    open,
    el(
      'div',
      { class: 'terms-region' },
      el('div', { class: 'terms-box', tabindex: '0', role: 'region', 'aria-label': WORDS.settings.showTerms, 'data-keep': t ? 'terms-text' : 'terms-wait', onScroll: (e: Event) => acts.scrolled(e.currentTarget as HTMLElement) }, ...(t ? [...paragraphs(t.license), el('hr'), ...paragraphs(t.privacy)] : [])),
      el(
        'p',
        { class: 'terms-links noprint' },
        el('button', { type: 'button', class: 'btn btn-link', onClick: acts.openInTab }, el('span', { text: WORDS.welcome.openInTab }), icon('external', 13)),
        el('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
        el('button', { type: 'button', class: 'btn btn-link', text: WORDS.welcome.saveCopy, onClick: acts.save }),
        el('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
        el('button', { type: 'button', class: 'btn btn-link', text: WORDS.welcome.print, onClick: acts.print }),
      ),
    ),
  );
}

/** what a typed address means: an https origin, or the sentence that says why not (Anthropic first) */
export function checkPortal(input: string): { origin?: string; error?: string } {
  try {
    return { origin: normaliseOrigin(input) };
  } catch (e) {
    const m = (e as Error).message;
    if (m === ANTHROPIC_REFUSAL) return { error: WORDS.welcome.anthropicRefused };
    return { error: m ? `${m.charAt(0).toUpperCase()}${m.slice(1)}.` : WORDS.welcome.anthropicRefused };
  }
}

/** the portal field: one input prefilled with the address, and a pill; `use` runs inside the click */
export function portalField(id: string, open: boolean, value: string, error: string | undefined, label: string, cb: { input: (v: string) => void; use: (value: string) => void }): HTMLElement {
  return el(
    'div',
    { class: 'portal-field' },
    fold(
      id,
      open,
      el(
        'div',
        { class: 'field-row' },
        el('input', {
          type: 'text',
          class: 'field',
          id: `${id}-input`,
          value,
          'aria-label': LABELS.portalAddress,
          'aria-invalid': error ? 'true' : undefined,
          'aria-describedby': error ? `${id}-error` : undefined,
          autocomplete: 'off',
          spellcheck: 'false',
          inputmode: 'url',
          onInput: (e: Event) => cb.input((e.currentTarget as HTMLInputElement).value),
          onKeydown: (e: Event) => {
            const k = e as KeyboardEvent;
            if (k.key === 'Enter') {
              k.preventDefault();
              cb.use((k.currentTarget as HTMLInputElement).value);
            }
          },
        }),
        el('button', { type: 'button', class: 'btn btn-ink', text: label, onClick: () => cb.use((document.getElementById(`${id}-input`) as HTMLInputElement | null)?.value ?? value) }),
      ),
      error ? el('p', { class: 'field-error', id: `${id}-error`, role: 'alert', text: error }) : null,
    ),
  );
}
