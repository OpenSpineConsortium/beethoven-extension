// The tour (moment 10, and ⋯ > "See what it can do"): 16 s, four scenes over the website's own diagram
// in its tall variant (public/tour/diagram.js and diagram.css, bundled; nothing is fetched). A camera
// pans the tall figure to what each scene is about, the rest of the figure dims to 40 %, and one dot runs
// the route that carries the scene. Skip (and Esc) ends it; the four dots jump to a scene; a tap on the
// figure pauses; a 1 px teal line along the top fills over the 16 s. Then "Try asking" replaces the
// figure: the three questions with Copy, and Done. With reduced motion the scenes are still frames
// with Next. If the diagram does not load, the tour closes silently.
//
// The player owns its DOM and its clock, so the panel's morph leaves it alone (data-keep).
import { WORDS, type TourView } from '../core/model';
import { copyText, el, reducedMotion, toast } from './dom';
import { icon } from './icons';
import { LABELS } from './labels';
import { packaged } from './rpc';

declare global {
  interface Window {
    FLOW_FIGURE?: string;
  }
}

/** what each scene frames, in the tall figure's units (viewBox 360 × 626) */
const FRAMES: Array<[number, number]> = [
  [0, 312],
  [286, 560],
  [372, 626],
  [0, 312],
];

let loading: Promise<string | undefined> | undefined;

/** the bundled diagram: its stylesheet once, its script once; the figure's markup, or undefined */
function loadFigure(view: TourView): Promise<string | undefined> {
  if (loading) return loading;
  loading = new Promise((resolve) => {
    if (window.FLOW_FIGURE) return resolve(window.FLOW_FIGURE);
    if (!document.getElementById('tour-css')) document.head.append(el('link', { id: 'tour-css', rel: 'stylesheet', href: packaged(view.assets.style) }));
    const s = el('script', { src: packaged(view.assets.script) });
    s.addEventListener('load', () => resolve(window.FLOW_FIGURE));
    s.addEventListener('error', () => {
      loading = undefined;
      resolve(undefined);
    });
    document.head.append(s);
    setTimeout(() => resolve(window.FLOW_FIGURE), 4000);
  });
  return loading;
}

/** the figure, parsed (never innerHTML), with the parts each scene lights marked by data-part */
function buildFigure(markup: string): HTMLElement | undefined {
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const fig = doc.querySelector('figure.flow');
  if (!fig) return undefined;
  const node = document.importNode(fig, true) as HTMLElement;
  node.setAttribute('aria-hidden', 'true');
  node.querySelector('.flow__art--wide')?.remove();
  const tall = node.querySelector('.flow__art--tall');
  if (!tall) return undefined;
  const mark = (els: Iterable<Element>, part: string) => {
    for (const e of els) e.setAttribute('data-part', `${e.getAttribute('data-part') ?? ''} ${part}`.trim());
  };
  const q = (sel: string) => Array.from(tall.querySelectorAll(sel));
  mark(q('.b-win, .b-bar, .b-rule, .b-dot, .b-url, .b-lock, .b-rail, .b-railrule, .b-ico, .b-ico-l, .b-bars, .b-av, .b-sk, .b-card, .b-comp, .b-caret, .b-send, .b-send-a'), 'browser');
  mark(q('.b-ax, .b-wh, .b-box, .b-med, .b-jit'), 'browser chart');
  mark(q('.n-cloud').map((c) => c.closest('g') ?? c), 'cloud');
  mark(q('.n-rack, .n-foot, .n-unit, .n-led, .n-vent, .n-prompt'), 'rack');
  mark(q('.n-brk, .n-board, .n-gold, .n-fan, .n-spin'), 'gpu');
  const routes = ['chat', 'code', 'model', 'lift'];
  q('.fl-a').forEach((a, i) => mark([a], routes[i] ?? 'route'));
  q('.fl-d').forEach((d, i) => mark([d], routes[i] ?? 'route'));
  mark(q('.fl-port'), 'browser');
  // the labels sit over the figure as HTML, in the order the site writes them
  const labels = Array.from(node.querySelectorAll('.flow__t'));
  const byText = (t: string) => labels.filter((l) => (l.textContent ?? '').replace(/\s+/g, ' ').trim().startsWith(t));
  mark(byText('claude.ai'), 'browser');
  mark(node.querySelectorAll('.t-ask'), 'browser');
  mark(byText('a chat'), 'chat');
  mark(byText('Claude servers'), 'cloud');
  mark(byText('a Code session'), 'code');
  mark(byText('Wayne State grid'), 'rack');
  mark(node.querySelectorAll('.t-me'), 'rack');
  mark(byText('the model'), 'model');
  mark(byText('the heavy lifting'), 'lift');
  mark(byText('GPU'), 'gpu');
  return node;
}

export interface TourCallbacks {
  /** Skip or Esc */
  skip: () => void;
  /** Done after "Try asking" */
  done: () => void;
  /** the figure failed to load: close without a word */
  failed: () => void;
}

export class TourPlayer {
  readonly root: HTMLElement;
  private scene = 0;
  private paused = false;
  private finished = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sceneStarted = 0;
  private sceneLeft = 0;
  private readonly still = reducedMotion();
  private readonly viewport: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly caption: HTMLElement;
  private readonly dots: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly next: HTMLButtonElement;
  private readonly body: HTMLElement;
  private stage: HTMLElement | undefined;
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.root.isConnected) {
      e.preventDefault();
      this.stop();
      this.cb.skip();
    }
  };
  private readonly onResize = () => this.pan();

  constructor(private readonly view: TourView, private readonly cb: TourCallbacks, full: boolean) {
    this.progress = el('span', { class: 'tour-progress', 'aria-hidden': 'true' }, el('i'));
    this.wrap = el('div', { class: 'tour-stage-wrap' });
    this.viewport = el('div', {
      class: 'tour-view',
      role: 'button',
      tabindex: '0',
      'aria-label': this.still ? WORDS.tour.bar : LABELS.pause,
      onClick: () => this.togglePause(),
      onKeydown: (e: Event) => {
        const k = e as KeyboardEvent;
        if (k.key === ' ' || k.key === 'Enter') {
          k.preventDefault();
          this.togglePause();
        }
      },
    }, this.wrap);
    this.caption = el('p', { class: 'tour-cap', 'aria-live': 'polite' });
    this.dots = el('div', { class: 'tour-dots', role: 'group', 'aria-label': WORDS.tour.bar });
    this.next = el('button', { type: 'button', class: 'btn btn-outline', text: WORDS.tour.next, hidden: !this.still, onClick: () => this.go(this.scene + 1) });
    this.body = el('div', { class: 'tour-body', style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, this.viewport, this.caption, el('div', { class: 'tour-foot' }, this.dots, this.next));
    this.root = el(
      'section',
      { class: `tour${full ? ' full' : ''}`, 'aria-label': WORDS.tour.bar },
      el('div', { class: 'tour-bar' }, this.progress, el('span', { class: 'eyebrow', text: WORDS.tour.bar }), el('button', { type: 'button', class: 'btn btn-text', text: WORDS.tour.skip, onClick: () => { this.stop(); this.cb.skip(); } })),
      this.body,
    );
    view.captions.forEach((_, i) =>
      this.dots.append(el('button', { type: 'button', class: 'tour-dot', 'aria-label': LABELS.scene(i + 1, view.captions.length), onClick: () => this.go(i) }, el('i'))),
    );
    document.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    void this.start();
  }

  private async start(): Promise<void> {
    const markup = await loadFigure(this.view);
    const fig = markup ? buildFigure(markup) : undefined;
    if (!fig) {
      this.stop();
      this.cb.failed();
      return;
    }
    this.stage = fig;
    this.wrap.append(fig);
    this.go(0);
  }

  private go(i: number): void {
    if (this.finished || !this.stage) return;
    if (i >= this.view.captions.length) return this.finish();
    this.scene = Math.max(0, i);
    this.stage.setAttribute('data-scene', String(this.scene + 1));
    this.caption.replaceChildren(el('span', { text: this.view.captions[this.scene] ?? '' }));
    Array.from(this.dots.children).forEach((d, k) => {
      if (k === this.scene) d.setAttribute('aria-current', 'step');
      else d.removeAttribute('aria-current');
    });
    this.restartProgress();
    // restart the scene's own animations (the typing, the rising charts)
    this.stage.querySelectorAll<HTMLElement | SVGElement>('.t-ask, [data-part~="chart"]').forEach((e) => {
      const s = (e as HTMLElement).style;
      s.animation = 'none';
      void (e as HTMLElement).getBoundingClientRect();
      s.animation = '';
    });
    this.pan();
    if (this.timer) clearTimeout(this.timer);
    if (!this.still) {
      this.sceneStarted = Date.now();
      this.sceneLeft = this.view.sceneMs;
      if (!this.paused) this.timer = setTimeout(() => this.go(this.scene + 1), this.sceneLeft);
    }
  }

  private restartProgress(): void {
    const bar = this.progress.firstElementChild as HTMLElement | null;
    if (!bar) return;
    const total = this.view.sceneMs * this.view.captions.length;
    if (this.still) {
      bar.style.setProperty('--still', String((this.scene + 1) / this.view.captions.length));
      return;
    }
    bar.style.animation = 'none';
    void bar.getBoundingClientRect();
    bar.style.animation = '';
    bar.style.animationDuration = `${total}ms`;
    bar.style.animationDelay = `-${this.scene * this.view.sceneMs}ms`;
  }

  /** move the camera so the scene's part of the tall figure fills the viewport */
  private pan(): void {
    if (!this.stage) return;
    const w = this.viewport.clientWidth;
    const h = this.viewport.clientHeight;
    if (!w || !h) return;
    const scale = w / 360;
    const full = 626 * scale;
    const [a, b] = FRAMES[this.scene] ?? FRAMES[0]!;
    const centre = ((a + b) / 2) * scale;
    const y = Math.min(0, Math.max(h - full, h / 2 - centre));
    this.wrap.style.setProperty('--pan', `${Math.round(y)}px`);
  }

  private togglePause(): void {
    if (this.still || this.finished) return;
    this.paused = !this.paused;
    this.root.classList.toggle('paused', this.paused);
    this.viewport.setAttribute('aria-label', this.paused ? LABELS.resume : LABELS.pause);
    this.stage?.querySelectorAll<SVGElement>('.fl-d, .n-spin').forEach((e) => (e.style.animationPlayState = this.paused ? 'paused' : ''));
    if (this.paused) {
      if (this.timer) clearTimeout(this.timer);
      this.sceneLeft = Math.max(0, this.sceneLeft - (Date.now() - this.sceneStarted));
    } else {
      this.sceneStarted = Date.now();
      this.timer = setTimeout(() => this.go(this.scene + 1), this.sceneLeft);
    }
  }

  /** after scene 4: "Try asking" with the three questions, Copy, and Done */
  private finish(): void {
    this.finished = true;
    // the Try asking step: one heading, no Skip (Done ends it), a quiet Done
    this.root.classList.add('finished');
    if (this.timer) clearTimeout(this.timer);
    const bar = this.progress.firstElementChild as HTMLElement | null;
    if (bar) {
      bar.style.animation = 'none';
      bar.style.transform = 'scaleX(1)';
    }
    const asks = el(
      'div',
      { class: 'tour-done' },
      el('p', { class: 'eyebrow', text: WORDS.home.tryAsking, style: 'margin-top:8px' }),
      el(
        'ul',
        { class: 'tour-asks', 'aria-label': LABELS.prompts },
        ...this.view.prompts.map((p) =>
          el(
            'li',
            { class: 'try-item' },
            el('p', { text: p }),
            el('button', {
              type: 'button',
              class: 'btn btn-icon',
              'aria-label': `${LABELS.copyPrompt}: ${p}`,
              onClick: () => void copyText(p).then((ok) => ok && toast(WORDS.home.promptCopied)),
            }, icon('copy', 16)),
          ),
        ),
      ),
      el('div', { class: 'm-spacer' }),
      el('button', { type: 'button', class: 'btn btn-outline btn-block tour-done-btn', text: WORDS.tour.done, onClick: () => { this.stop(); this.cb.done(); } }),
    );
    this.body.replaceWith(asks);
  }

  stop(): void {
    this.finished = true;
    if (this.timer) clearTimeout(this.timer);
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
  }
}
