// The fixture gallery: development builds only (boot.ts imports this file behind
// import.meta.env.MODE === 'development', so a production build carries neither it nor the fixtures).
//   sidepanel.html?gallery            every panel fixture side by side at the panel's real 360 × 658
//   sidepanel.html?fixture=<name>     one fixture, live (ticks, folds and menus work; actions are logged)
//   options.html?fixture=welcome      the welcome page or Settings at full width
// Add &theme=system to see the dark palette under "Match system".
import './gallery.css';
import { applyAppearance, el } from './dom';
import { FIXTURES, SAMPLE_LOG, fixture } from './fixtures';
import type { Action12 } from './model12';
import { mountPanel } from './panel';
import { manifestVersion, packaged, registerKeyGesture, type Act } from './rpc';
import { mountSettings } from './settings';
import { mountWelcome, type Gestures } from './welcome';

/** the gallery's background: every action is logged; a few answer the way the real one would */
const stubAct: Act = async (action: Action12) => {
  // the sheet's answers are a password and a code: the gallery logs that one was sent, never what
  console.info('[gallery] action', action.kind === 'grid-signin-answer' ? '{"kind":"grid-signin-answer","text":"(not shown)"}' : JSON.stringify(action));
  switch (action.kind) {
    case 'log':
      return { lines: SAMPLE_LOG } as never;
    case 'new-session':
      return { opened: true, firstTime: true } as never;
    case 'copy-details':
      return { text: 'Beethoven 11.0.0: the shared copy at /rs/rs_grp_oschome/shared/beethoven/hpcworker/current cannot be used from this account.' } as never;
    case 'audit':
      return { text: '{"ts":"2026-10-01T12:44:01Z","method":"GET","endpoint":"/pun/sys/dashboard/","outcome":"200"}\n' } as never;
    case 'copy-debug-log':
      return { text: 'Beethoven 14.0.0 debug log · mode direct · portal ondemand.grid.wayne.edu · account st1234 · worker worker · 2026-10-03T12:00:00.000Z · 1 line, newest last\n2026-10-03T11:59:58.000Z sw service worker started: Beethoven 14.0.0\n' } as never;
    default:
      return undefined;
  }
};

// 12.0.0: the passkey steps, stood in for: a second and a half of "Windows Hello", then done. The real
// ones are the core's keyring (rpc.ts registerKeyGesture); this stand-in never touches WebAuthn.
registerKeyGesture({
  protect: (on) => new Promise((r) => setTimeout(() => r(on ? 'on' : 'off'), 1500)),
  createProtected: () => new Promise((r) => setTimeout(() => r('on'), 1500)),
  unlock: () => new Promise((r) => setTimeout(() => r('unlocked'), 1500)),
});

const stubGestures: Gestures = {
  hasPanel: true,
  openPanel: () => Promise.resolve(true),
  request: () => Promise.resolve(true),
  openTab: (url) => void window.open(url, '_blank', 'noopener'),
  url: packaged,
  productVersion: manifestVersion,
  host: () => 'Chrome',
  installId: () => Promise.resolve('gallery'),
  save: () => Promise.resolve(),
};

export function mountGallery(root: HTMLElement, page: 'panel' | 'options', q: URLSearchParams): void {
  if (q.get('theme') === 'system') applyAppearance('system');
  const sequence = q.get('sequence');
  if (sequence) {
    const names = sequence.split(',');
    const step = Number(q.get('step') ?? 1800);
    const first = fixture(names[0] ?? '');
    if (!first || first.surface !== 'panel') return;
    document.body.classList.remove('page');
    document.body.classList.add('panel');
    const p = mountPanel(root, { act: stubAct, fixture: { view: first.view, local: first.local, details: first.details, log: first.log } });
    p.show(first.view);
    names.slice(1).forEach((n, i) => {
      const f = fixture(n);
      if (f && f.surface === 'panel') setTimeout(() => p.show(f.view), step * (i + 1));
    });
    return;
  }
  const name = q.get('fixture');
  if (!name) {
    document.body.classList.remove('panel');
    document.body.classList.add('page');
    root.replaceChildren(
      el(
        'div',
        { class: 'gallery' },
        el('h1', { text: `Beethoven ${manifestVersion()}: ${FIXTURES.length} fixtures` }),
        ...FIXTURES.map((f) =>
          f.surface === 'panel'
            ? el('figure', {}, el('figcaption', {}, el('a', { href: `?fixture=${f.name}`, text: f.name }), ` · ${f.note}`), el('iframe', { src: `?fixture=${f.name}${q.get('theme') ? `&theme=${q.get('theme')}` : ''}`, title: f.name, loading: 'lazy' }))
            : el('figure', {}, el('figcaption', {}, el('a', { href: `options.html?fixture=${f.name}`, text: f.name }), ` · ${f.note} (full width)`)),
        ),
      ),
    );
    return;
  }
  const f = fixture(name);
  if (!f) {
    root.replaceChildren(el('p', { style: 'padding:20px', text: `No fixture named "${name}".` }));
    return;
  }
  document.title = `${f.name} · Beethoven gallery`;
  if (f.surface === 'panel') {
    document.body.classList.remove('page');
    document.body.classList.add('panel');
    const p = mountPanel(root, { act: stubAct, fixture: { view: f.view, local: f.local, details: f.details, log: f.log } });
    p.show(f.view);
    return;
  }
  document.body.classList.remove('panel');
  document.body.classList.add('page');
  if (f.surface === 'welcome') mountWelcome(root, { act: stubAct, gestures: stubGestures, local: f.local }).show(f.view);
  else mountSettings(root, { act: stubAct, gestures: stubGestures, local: f.local, onAppearance: applyAppearance }).show(f.view);
  void page;
}
