// Plain DOM, no framework: the pages are small and a reviewer should be able to read them.
//
// The pages are pure functions of a view (core/model.ts) and of a little page-local state (a tick, a
// fold, the confirm row). Each update draws the page again into a detached tree and morphs the live
// page into it (morph below): elements that are still there are kept, so focus, the text being typed,
// a running CSS animation (the orb's arc, the fan in the tour) and a fold's position survive the
// background's pushes. Listeners live in a per-element table that the morph carries over, so a kept
// button always runs the newest handler.
//
// Motion: everything here honours prefers-reduced-motion (reducedMotion()). The curves and timings are
// the specification's ("The look"): one curve, cubic-bezier(0.22,1,0.36,1), 120 to 600 ms.

type Child = Node | string | number | null | undefined | false;
type Handler = (e: Event) => void;
type Handlers = Record<string, Handler>;
type Live = Element & { __h?: Handlers; __tick?: () => string };

const SVG_NS = 'http://www.w3.org/2000/svg';

function dispatch(this: Live, e: Event): void {
  this.__h?.[e.type]?.call(this, e);
}

function setAttrs(e: Live, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.setAttribute('class', String(v));
    else if (k === 'text') e.textContent = String(v);
    else if (k === 'key') e.setAttribute('data-key', String(v));
    else if (k === 'tick' && typeof v === 'function') {
      e.__tick = v as () => string;
      e.setAttribute('data-tick', '');
    } else if (k.startsWith('on') && typeof v === 'function') {
      const type = k.slice(2).toLowerCase();
      (e.__h ??= {})[type] = v as Handler;
      e.addEventListener(type, dispatch as EventListener);
    } else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, String(v));
  }
}

function append(parent: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/**
 * An HTML element. Attributes: class, text, key (data-key, for the morph), tick (a function the
 * one-second ticker calls for this element's text), on<Event> handlers, booleans as present/absent
 * attributes, and everything else as attributes. `value` and `checked` are applied as properties too.
 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag) as HTMLElementTagNameMap[K] & Live;
  setAttrs(e, attrs);
  if ('value' in attrs && attrs.value !== undefined) (e as unknown as HTMLInputElement).value = String(attrs.value);
  if ('checked' in attrs) (e as unknown as HTMLInputElement).checked = !!attrs.checked;
  append(e, children);
  return e;
}

/** an SVG element (line icons, the orb's ring, the drawn check, the QR code) */
export function svg(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): SVGElement {
  const e = document.createElementNS(SVG_NS, tag) as SVGElement & Live;
  setAttrs(e, attrs);
  append(e, children);
  return e;
}

/** append, skipping the nulls that conditional children produce */
export function add(parent: Element, ...children: Child[]): void {
  append(parent, children);
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// ---- the morph -------------------------------------------------------------------------------------

function sameKind(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== Node.ELEMENT_NODE) return true;
  const x = a as Element;
  const y = b as Element;
  return x.tagName === y.tagName && x.getAttribute('data-key') === y.getAttribute('data-key') && x.namespaceURI === y.namespaceURI;
}

/**
 * Make `from` look like `to`, keeping every element that is still there. `to` is discarded.
 * - data-key pairs children; unkeyed children pair by position and tag.
 * - an input keeps what the person is typing while it has focus.
 * - data-swap: when its value changes, the element crossfades (riseSwap) instead of changing at once.
 * - data-keep: the element is left exactly as it is while the new one carries the same data-keep value
 *   (the QR code, the tour's figure: costly to draw and owning their own state).
 */
export function morph(from: Element, to: Element): void {
  const f = from as Live;
  const t = to as Live;
  const keep = t.getAttribute('data-keep');
  if (keep !== null && f.getAttribute('data-keep') === keep) {
    f.__h = t.__h;
    return;
  }
  const swapOld = f.getAttribute('data-swap');
  const swapNew = t.getAttribute('data-swap');
  const swapping = swapOld !== null && swapNew !== null && swapOld !== swapNew && f.isConnected;
  const ghost = swapping ? (f.cloneNode(true) as HTMLElement) : undefined;

  // attributes
  for (const a of Array.from(f.attributes)) if (!t.hasAttribute(a.name)) f.removeAttribute(a.name);
  for (const a of Array.from(t.attributes)) if (f.getAttribute(a.name) !== a.value) f.setAttribute(a.name, a.value);
  // handlers: the kept element runs the newest ones
  const oldTypes = Object.keys(f.__h ?? {});
  const newH = t.__h ?? {};
  for (const type of Object.keys(newH)) if (!oldTypes.includes(type)) f.addEventListener(type, dispatch as EventListener);
  f.__h = { ...newH };
  f.__tick = t.__tick;
  // form state
  if (f instanceof HTMLInputElement && t instanceof HTMLInputElement) {
    if (f.type === 'checkbox' || f.type === 'radio') f.checked = t.checked;
    else if (document.activeElement !== f && f.value !== t.value) f.value = t.value;
  }
  if (f instanceof HTMLDetailsElement && t instanceof HTMLDetailsElement) f.open = t.open;

  // children
  const newKids = Array.from(t.childNodes);
  const oldKids = Array.from(f.childNodes);
  const keyed = new Map<string, Element>();
  for (const k of oldKids) if (k instanceof Element && k.hasAttribute('data-key')) keyed.set(k.getAttribute('data-key')!, k);
  const used = new Set<Node>();
  let cursor = 0;
  const result: Node[] = [];
  for (const nk of newKids) {
    let match: Node | undefined;
    const key = nk instanceof Element ? nk.getAttribute('data-key') : null;
    if (key !== null) {
      const cand = keyed.get(key);
      if (cand && !used.has(cand) && sameKind(cand, nk)) match = cand;
    } else {
      while (cursor < oldKids.length && (used.has(oldKids[cursor]!) || (oldKids[cursor] instanceof Element && (oldKids[cursor] as Element).hasAttribute('data-key')))) cursor++;
      const cand = oldKids[cursor];
      if (cand && sameKind(cand, nk)) {
        match = cand;
        cursor++;
      }
    }
    if (match) {
      used.add(match);
      if (match.nodeType === Node.ELEMENT_NODE) morph(match as Element, nk as Element);
      else if (match.nodeValue !== nk.nodeValue) match.nodeValue = nk.nodeValue;
      result.push(match);
    } else result.push(nk);
  }
  for (const k of oldKids) if (!used.has(k)) k.remove();
  // put the children in order, moving or inserting only what is out of place
  result.forEach((node, i) => {
    const at = f.childNodes[i];
    if (at !== node) f.insertBefore(node, at ?? null);
  });

  if (ghost) riseSwap(f as HTMLElement, ghost);
}

// ---- motion ----------------------------------------------------------------------------------------

/**
 * Run `then` when the element's own animations have finished (never a child's: animationend bubbles,
 * and a drawn check inside a leaving screen would end it early). Through the Web Animations API, so a
 * slowed or paused document waits too; `fallbackMs` covers an element that has no animation at all.
 */
export function afterOwnAnimations(node: Element, then: () => void, fallbackMs = 450): void {
  let ran = false;
  const once = () => {
    if (ran) return;
    ran = true;
    then();
  };
  const anims = typeof node.getAnimations === 'function' ? node.getAnimations() : [];
  if (!anims.length) {
    setTimeout(once, fallbackMs);
    return;
  }
  void Promise.all(anims.map((a) => a.finished)).then(once, once);
}

export function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * A state change in place: the old content (a clone, laid over it) fades out over 120 ms, then the new
 * content rises 8 px and fades in over 280 ms. With reduced motion, a 120 ms crossfade.
 */
export function riseSwap(node: HTMLElement, ghost: HTMLElement): void {
  const parent = node.parentElement;
  if (!parent) return;
  const r = node.getBoundingClientRect();
  const p = parent.getBoundingClientRect();
  ghost.removeAttribute('data-swap');
  ghost.removeAttribute('id');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('swap-ghost');
  Object.assign(ghost.style, { position: 'absolute', left: `${r.left - p.left + parent.scrollLeft}px`, top: `${r.top - p.top + parent.scrollTop}px`, width: `${r.width}px`, margin: '0', pointerEvents: 'none' });
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  parent.append(ghost);
  node.classList.remove('swap-in');
  void node.offsetWidth;
  node.classList.add('swap-in');
  afterOwnAnimations(ghost, () => ghost.remove());
  afterOwnAnimations(node, () => node.classList.remove('swap-in'));
}

/**
 * A change of moment: the old screen leaves 24 px to the left and fades, the new one arrives from 24 px
 * to the right, over 320 ms (reduced motion: a 120 ms crossfade). `back` reverses the direction.
 */
export function slideSwap(stage: HTMLElement, next: HTMLElement, opts: { back?: boolean; fade?: boolean } = {}): void {
  const old = Array.from(stage.children).filter((c) => !c.classList.contains('leaving')) as HTMLElement[];
  const mode = reducedMotion() || opts.fade ? 'fade' : opts.back ? 'back' : 'fwd';
  next.classList.add('screen', `enter-${mode}`);
  stage.append(next);
  for (const o of old) {
    o.classList.add('leaving', `leave-${mode}`);
    o.setAttribute('aria-hidden', 'true');
    o.setAttribute('inert', '');
    afterOwnAnimations(o, () => o.remove());
  }
  afterOwnAnimations(next, () => next.classList.remove(`enter-${mode}`));
}

/** the one-second clock: every element drawn with `tick` gets its text again (the queue timer, "up 2 h 14 min") */
export function startTicker(): () => void {
  const id = setInterval(() => {
    for (const e of Array.from(document.querySelectorAll('[data-tick]')) as Live[]) {
      const text = e.__tick?.();
      if (text !== undefined && e.textContent !== text) e.textContent = text;
    }
  }, 1000);
  return () => clearInterval(id);
}

// ---- toasts, announcements, the clipboard ----------------------------------------------------------

let toastHost: HTMLElement | undefined;

/** a toast: rises 12 px, stays 2.4 s, fades; one at a time */
export function toast(text: string): void {
  if (!toastHost || !toastHost.isConnected) {
    toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  clear(toastHost);
  const t = el('div', { class: 'toast', text });
  toastHost.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), reducedMotion() ? 120 : 280);
  }, 2400);
}

let liveRegion: HTMLElement | undefined;
let lastAnnounced = '';

/** aria-live, polite, headlines only: says `text` once, and only when it is new */
export function announce(text: string | undefined): void {
  if (!text || text === lastAnnounced) return;
  lastAnnounced = text;
  if (!liveRegion || !liveRegion.isConnected) {
    liveRegion = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => {
    if (liveRegion) liveRegion.textContent = text;
  }, 60);
}

/** write text to the clipboard inside a click (the click's own user activation); true when it worked */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // an extension page without focus refuses the async clipboard; the old way still works inside a click
    try {
      const ta = el('textarea', { class: 'sr-only', 'aria-hidden': 'true' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** trigger a download of text from an extension page; no downloads permission is involved */
export function downloadText(filename: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** the theme: cream whatever the system says, unless Settings chose "Match system" */
export function applyAppearance(appearance: 'cream' | 'system' | undefined): void {
  document.documentElement.setAttribute('data-theme', appearance === 'system' ? 'system' : 'cream');
}
