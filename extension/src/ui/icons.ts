// Line icons, drawn for Beethoven on a 24-unit grid with a 1.5 px stroke in the current colour (the
// specification: "Line icons at 1.5 px stroke. No emoji."). Each is a few paths, no font, no file.
import { svg } from './dom';

type Part = ['path', string] | ['circle', number, number, number, boolean?] | ['rect', number, number, number, number, number];

const ICONS: Record<string, Part[]> = {
  chevronRight: [['path', 'M9.5 6l6 6-6 6']],
  chevronDown: [['path', 'M6 9.5l6 6 6-6']],
  chevronLeft: [['path', 'M14.5 6l-6 6 6 6']],
  more: [['circle', 6, 12, 1.5, true], ['circle', 12, 12, 1.5, true], ['circle', 18, 12, 1.5, true]],
  copy: [['rect', 9, 9, 11, 11, 2.5], ['path', 'M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5']],
  check: [['path', 'M5 12.5l4.5 4.5L19 7.5']],
  close: [['path', 'M6.5 6.5l11 11M17.5 6.5l-11 11']],
  phone: [['rect', 7, 2.75, 10, 18.5, 2.5], ['path', 'M10.75 18h2.5']],
  external: [['path', 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10']],
  plus: [['path', 'M12 5v14M5 12h14']],
  play: [['path', 'M8.5 5.75v12.5L18.5 12z']],
  eye: [['path', 'M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12z'], ['circle', 12, 12, 2.75]],
  clock: [['circle', 12, 12, 8.75], ['path', 'M12 7.25V12l3.25 2']],
  shield: [['path', 'M12 3.25l7.25 2.9v5.6c0 4.4-3.05 8-7.25 9.1-4.2-1.1-7.25-4.7-7.25-9.1v-5.6z']],
  gauge: [['path', 'M4.6 17a8.5 8.5 0 1 1 14.8 0'], ['path', 'M12 13l4-4.25'], ['circle', 12, 13, 1.25, true]],
  tag: [['path', 'M3.75 12.4V4.75a1 1 0 0 1 1-1h7.65l7.85 7.85-8.65 8.65z'], ['circle', 8.25, 8.25, 1.4]],
  id: [['rect', 3, 5.25, 18, 13.5, 2.5], ['circle', 9, 11, 2.1], ['path', 'M5.9 16.1c.55-1.45 1.7-2.25 3.1-2.25s2.55.8 3.1 2.25M14.75 10h3.75M14.75 13.25h2.75']],
  alert: [['circle', 12, 12, 8.75], ['path', 'M12 7.5v5.25'], ['circle', 12, 16.1, 0.9, true]],
  scale: [['path', 'M12 4.5v15M8 19.5h8M5.5 7.5h13M5.5 7.5L3 13.25a2.6 2.6 0 0 0 5 0zM18.5 7.5L16 13.25a2.6 2.6 0 0 0 5 0z']],
  key: [['circle', 8, 15.5, 3.75], ['path', 'M10.7 12.8L19 4.5M15.75 7.75l2.5 2.5']],
  terminal: [['rect', 3, 4.75, 18, 14.5, 2.5], ['path', 'M7 9.75l3 2.5-3 2.5M12.75 15h4.25']],
  lock: [['rect', 5, 10.75, 14, 9.5, 2.25], ['path', 'M8.25 10.75V8a3.75 3.75 0 0 1 7.5 0v2.75']],
  folder: [['path', 'M3.5 7.25A1.75 1.75 0 0 1 5.25 5.5H9.5l2 2h7.25a1.75 1.75 0 0 1 1.75 1.75v8.5a1.75 1.75 0 0 1-1.75 1.75H5.25A1.75 1.75 0 0 1 3.5 17.75z']],
  sliders: [['path', 'M4 7.5h9.5M17.5 7.5H20M4 16.5h3.5M11.5 16.5H20'], ['circle', 15.5, 7.5, 2], ['circle', 9.5, 16.5, 2]],
  help: [['circle', 12, 12, 8.75], ['path', 'M9.6 9.6a2.45 2.45 0 1 1 3.4 2.25c-.6.28-1 .8-1 1.45v.35'], ['circle', 12, 16.6, 0.9, true]],
  doc: [['path', 'M6.75 3.5h7l4.5 4.5v12a.5.5 0 0 1-.5.5H6.75a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z'], ['path', 'M13.5 3.5v4.75h4.75M9 12.25h6M9 15.75h6']],
  sparkle: [['path', 'M12 3.75l1.7 4.85 4.85 1.7-4.85 1.7L12 16.85l-1.7-4.85-4.85-1.7 4.85-1.7z'], ['path', 'M18.5 15.5l.65 1.85 1.85.65-1.85.65-.65 1.85-.65-1.85-1.85-.65 1.85-.65z']],
  pin: [['path', 'M9.25 3.75h5.5l-.9 4.6 3.4 3.4v1.5H6.75v-1.5l3.4-3.4z'], ['path', 'M12 13.25v7']],
  arrowRight: [['path', 'M4.5 12h15M14 6.5l5.5 5.5-5.5 5.5']],
  power: [['path', 'M12 3.75v7.5'], ['path', 'M7.4 6.6a7.5 7.5 0 1 0 9.2 0']],
  rack: [['rect', 5, 3.5, 14, 17, 2.25], ['path', 'M8.25 8h7.5M8.25 12h7.5M8.25 16h3.25'], ['circle', 15.25, 16, 0.9, true]],
  // 12.0.0: the bundled download, the opt-in protection, the two routes, the direct way to the grid
  download: [['path', 'M12 4v11M7.25 10.5L12 15.25l4.75-4.75'], ['path', 'M4.5 16.5v1.75A1.75 1.75 0 0 0 6.25 20h11.5a1.75 1.75 0 0 0 1.75-1.75V16.5']],
  fingerprint: [['path', 'M6.6 6.9A7.5 7.5 0 0 1 19.5 12v1.25'], ['path', 'M4.5 14.75V12c0-.9.16-1.75.45-2.55'], ['path', 'M8.25 18.6A9.6 9.6 0 0 0 9 15V12a3 3 0 0 1 6 0v1.5'], ['path', 'M12 12v3a12.5 12.5 0 0 1-1.6 5.4'], ['path', 'M15 16.5a17 17 0 0 1-.9 3.75'], ['path', 'M19.1 16.6a19 19 0 0 1-.45 1.9']],
  laptop: [['rect', 4.75, 5.5, 14.5, 10, 1.75], ['path', 'M2.75 18.5h18.5']],
  shieldCheck: [['path', 'M12 3.25l7.25 2.9v5.6c0 4.4-3.05 8-7.25 9.1-4.2-1.1-7.25-4.7-7.25-9.1v-5.6z'], ['path', 'M8.75 12.1l2.3 2.3 4.2-4.4']],
  route: [['circle', 6, 6, 2.25], ['circle', 18, 18, 2.25], ['path', 'M8.25 6h6.5a3.25 3.25 0 0 1 0 6.5h-5.5a3.25 3.25 0 0 0 0 6.5h6.5']],
  eyeOff: [['path', 'M4 4l16 16'], ['path', 'M9.9 5.75A9.6 9.6 0 0 1 12 5.5c5.75 0 9.25 6.5 9.25 6.5a17 17 0 0 1-2.9 3.7M6.4 7.4C4 9.1 2.75 12 2.75 12S6.25 18.5 12 18.5a9 9 0 0 0 4-.9'], ['path', 'M10.1 10.2a2.75 2.75 0 0 0 3.7 3.7']],
};

export type IconName = keyof typeof ICONS;

/** a line icon, `size` px square, decorative (aria-hidden) unless a label is given */
export function icon(name: IconName, size = 20, cls = ''): SVGElement {
  const parts = ICONS[name] ?? [];
  return svg(
    'svg',
    { class: `ico ${cls}`.trim(), width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' },
    ...parts.map((p) => {
      if (p[0] === 'path') return svg('path', { d: p[1] });
      if (p[0] === 'circle') return svg('circle', { cx: p[1], cy: p[2], r: p[3], ...(p[4] ? { fill: 'currentColor', stroke: 'none' } : {}) });
      return svg('rect', { x: p[1], y: p[2], width: p[3], height: p[4], rx: p[5] });
    }),
  );
}

/** the drawn check: a circle that draws in 300 ms, then a tick in 200 ms (`delay` in ms staggers a list) */
export function drawnCheck(size = 20, delay = 0, cls = ''): SVGElement {
  return svg(
    'svg',
    { class: `drawn ${cls}`.trim(), width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', style: `--d:${delay}ms` },
    svg('circle', { class: 'drawn-disc', cx: 12, cy: 12, r: 11 }),
    svg('circle', { class: 'drawn-ring', cx: 12, cy: 12, r: 10.25, pathLength: 100 }),
    svg('path', { class: 'drawn-tick', d: 'M7.25 12.4l3.1 3.1 6.4-6.6', pathLength: 100 }),
  );
}

/** a turning arc (the orb's waiting state, small in status lines and checklist rows) */
export function spinner(size = 16, cls = ''): SVGElement {
  return svg(
    'svg',
    { class: `spin ${cls}`.trim(), width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { class: 'spin-track', cx: 12, cy: 12, r: 9.5 }),
    svg('circle', { class: 'spin-arc', cx: 12, cy: 12, r: 9.5, pathLength: 100 }),
  );
}
