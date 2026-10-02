// Phone: the environment link as a QR code, drawn on the device as inline SVG (src/vendor/qrcodegen.ts,
// byte mode, error correction M). Nothing is fetched and the link goes nowhere but the screen. Dark
// modules on the card colour with the standard four-module quiet zone, so a phone camera reads it in
// either theme.
import { encodeText } from '../vendor/qrcodegen';
import { svg } from './dom';

export function qrSvg(text: string, px = 180, label?: string): SVGElement {
  const q = encodeText(text);
  const border = 4;
  const dim = q.size + border * 2;
  let d = '';
  for (let y = 0; y < q.size; y++) {
    let x = 0;
    while (x < q.size) {
      if (!q.modules[y]![x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < q.size && q.modules[y]![x + run]) run++;
      d += `M${x + border},${y + border}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return svg(
    'svg',
    { class: 'qr', width: px, height: px, viewBox: `0 0 ${dim} ${dim}`, 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': label ?? text },
    svg('rect', { class: 'qr-bg', x: 0, y: 0, width: dim, height: dim }),
    svg('path', { class: 'qr-fg', d }),
  );
}
