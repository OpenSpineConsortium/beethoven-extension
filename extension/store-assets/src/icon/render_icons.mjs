// Rasterise the icon SVGs in Chromium (Playwright) at their exact pixel sizes, with a transparent background,
// and lay the results out on a review sheet: true size on a light and a dark toolbar, and the 16 px icon blown
// up 8x without smoothing so its actual pixels can be looked at.
//
// Usage: node render_icons.mjs <playwright module dir> <Newsreader font dir> <out dir for the sheet>
//   renders candidates/*/*.svg to PNG beside each SVG, and icon*.svg if they exist
//   writes <out>/sheet.png (and compare-16px.png beside this script, kept for the record)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [pwDir, fontDir, outDir] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(path.join(pwDir, 'index.mjs')).href);

const SIZES = [128, 96, 48, 32, 16];
const names = ['route', 'worker', 'monogram'];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function rasterise(svgPath, size) {
  const svg = fs.readFileSync(svgPath, 'utf8');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
  const png = svgPath.replace(/\.svg$/, '.png');
  await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  return png;
}

const rows = [];
for (const n of names) {
  const r = { name: n, png: {} };
  for (const s of SIZES) r.png[s] = await rasterise(path.join(HERE, 'candidates', n, `${n}-${s}.svg`), s);
  rows.push(r);
}
if (fs.existsSync(path.join(HERE, 'icon.svg'))) {
  const r = { name: 'icon (winner)', png: {} };
  for (const s of SIZES) r.png[s] = await rasterise(path.join(HERE, s === 128 ? 'icon.svg' : `icon-${s}.svg`), s);
  rows.push(r);
}

// the review sheet
const uri = (p) => pathToFileURL(p).href;
const font = uri(path.join(fontDir, 'Newsreader[opsz,wght].ttf'));
const siteMark = `<svg viewBox="0 0 28 28" width="SZ" height="SZ" style="color:#0E5F58"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M14 3.5 C 10 6, 18 9, 14 12.5 C 10 16, 18 19, 14 24.5"/><line x1="8.5" y1="6.2" x2="19.5" y2="6.2"/><line x1="8.5" y1="12.5" x2="19.5" y2="12.5"/><line x1="8.5" y1="18.8" x2="19.5" y2="18.8"/></g></svg>`;
const css = `
@font-face { font-family: NR; src: url("${font}"); }
body { margin: 0; padding: 24px; background: #F1EEE3; font: 13px/1.3 "Segoe UI", sans-serif; color: #585B50; width: 1180px; }
.row { display: grid; grid-template-columns: 110px 150px 70px 50px 160px 160px 260px; align-items: center; gap: 14px; padding: 14px 0; border-bottom: 1px solid rgba(26,28,24,.14); }
.nm { font-family: NR, serif; font-size: 20px; color: #1A1C18; }
img { display: block; }
.px { image-rendering: pixelated; width: 128px; height: 128px; }
.tb { display: flex; align-items: center; gap: 10px; padding: 0 10px; height: 34px; border-radius: 8px; }
.tb.light { background: #FFFFFF; border: 1px solid #ddd; }
.tb.dark { background: #3C3C3C; }
.tb .omni { height: 22px; flex: 1; border-radius: 11px; }
.light .omni { background: #F1F3F4; } .dark .omni { background: #282828; }
.brand { display: flex; align-items: center; gap: 8px; font-family: NR, serif; font-size: 19px; color: #1A1C18; }
.mag { display: flex; gap: 8px; }
.mag div { padding: 8px; } .mag .l { background: #fff; } .mag .d { background: #3C3C3C; }
.hd { font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8C8E82; }
`;
const cell = (r) => `
<div class="row">
  <div class="nm">${r.name}</div>
  <img src="${uri(r.png[128])}" width="128" height="128">
  <img src="${uri(r.png[48])}" width="48" height="48">
  <img src="${uri(r.png[32])}" width="32" height="32">
  <div><div class="tb light"><img src="${uri(r.png[16])}" width="16" height="16"><div class="omni"></div></div>
       <div class="tb dark" style="margin-top:8px"><img src="${uri(r.png[16])}" width="16" height="16"><div class="omni"></div></div></div>
  <div class="brand">${siteMark.replace(/SZ/g, '26')}<img src="${uri(r.png[32])}" width="26" height="26" style="width:26px;height:26px"></div>
  <div class="mag"><div class="l"><img class="px" src="${uri(r.png[16])}"></div><div class="d"><img class="px" src="${uri(r.png[16])}"></div></div>
</div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="row hd"><div></div><div>128 (package)</div><div>48</div><div>32</div><div>16 on toolbars</div><div>beside the site mark</div><div>16 px, 8x, no smoothing</div></div>
${rows.map(cell).join('\n')}
</body></html>`;
fs.mkdirSync(outDir, { recursive: true });
const sheetHtml = path.join(outDir, 'sheet.html');
fs.writeFileSync(sheetHtml, html);
const sp = await browser.newPage({ viewport: { width: 1228, height: 400 }, deviceScaleFactor: 1 });
await sp.goto(uri(sheetHtml));
await sp.waitForTimeout(400);
await sp.screenshot({ path: path.join(outDir, 'sheet.png'), fullPage: true });
fs.copyFileSync(path.join(outDir, 'sheet.png'), path.join(HERE, 'compare-16px.png'));
await browser.close();
console.log('rendered', rows.map((r) => r.name).join(', '));
