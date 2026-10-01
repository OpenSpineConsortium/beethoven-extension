// Builds every Chrome Web Store image and the promo video from the pages in this folder, with Playwright's
// Chromium, at the store's exact sizes. Run from anywhere:
//
//   node build_assets.mjs [--pw <playwright package dir>] [--only shots|tiles|video] [--sync-site <site repo>]
//
//   --pw         the directory of an installed `playwright` package (or set PLAYWRIGHT_DIR); without it the
//                script tries a plain `import('playwright')`
//   --only       build one group: shots (the five screenshots), tiles (the small tile and the marquee),
//                icon (copy the store icon), video (the promo and its poster); default: all of them
//   --webm       record the video as a real-time .webm with Playwright even when ffmpeg is there
//   --sync-site  first copy the home page diagram again from the site repository
//                (tools/pages/index/body.html, between flow:start and flow:end, into diagram.js; the diagram
//                rules of assets/css/hero.css into diagram.css), so the images follow the site
//
// Writes, one folder up (store-assets/): screenshot-0[1-5]-*.png (1280x800), promo-tile-440x280.png,
// marquee-1400x560.png, store-icon-128.png (the package's 128 px icon, copied from icon/icon.png, with its
// transparent padding), promo/beethoven-promo.mp4 (1280x720, 30 fps, H.264, no sound) and
// promo/beethoven-promo-poster.png. Every screenshot and tile is checked: exact size, 8-bit RGB, no alpha
// channel and no transparency chunk; one that Chromium wrote with alpha is flattened on the site's cream
// (#F1EEE3) before the check. The icon is checked for its size and for being RGBA.
//
// The video is drawn frame by frame: promo.html exposes __seek(t), which sets every animation on the page
// (the site's own CSS animations of the diagram, and the scene's) to time t; each frame is a screenshot.
// ffmpeg encodes the frames; it is looked for on PATH, then inside WSL (`wsl -e ffmpeg`). With neither, the
// script records the page in real time with Playwright's video recorder instead and keeps that .webm.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(SRC, '..');

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
function opt(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }
const only = opt('--only');
const want = (g) => !only || only.split(',').includes(g);
const PAPER = [0xF1, 0xEE, 0xE3];

// ---------------------------------------------------------------- the diagram, from the site
function syncSite(siteDir) {
  const body = fs.readFileSync(path.join(siteDir, 'tools/pages/index/body.html'), 'utf8').replace(/\r\n/g, '\n');
  const m = body.match(/<!-- flow:start -->\n([\s\S]*?)\n<!-- flow:end -->/);
  if (!m) throw new Error('flow:start / flow:end not found in the site body');
  const js = '// The home page diagram of openspineconsortium.com, copied verbatim by build_assets.mjs --sync-site from\n' +
    '// tools/pages/index/body.html (between flow:start and flow:end). Do not edit; sync again instead.\n' +
    `window.FLOW_FIGURE = ${JSON.stringify(m[1])};\n`;
  fs.writeFileSync(path.join(SRC, 'diagram.js'), js);

  const css = fs.readFileSync(path.join(siteDir, 'assets/css/hero.css'), 'utf8').replace(/\r\n/g, '\n');
  const cut = (from, to) => {
    const a = css.indexOf(from), b = css.indexOf(to, a + 1);
    if (a < 0 || b < 0) throw new Error(`hero.css: section not found: ${from}`);
    return css.slice(a, b).trimEnd();
  };
  const parts = [
    cut('/* ---------- home: the diagram ----------', '/* ---------- home: what you need ---------- */'),
    cut('/* ---------- home: tablets ----------', '/* ---------- home: tablets and phones ---------- */'),
    css.slice(css.indexOf('/* ---------- reduced motion: everything holds still ---------- */')).trimEnd(),
  ];
  fs.writeFileSync(path.join(SRC, 'diagram.css'),
    '/* The home page diagram\'s rules, copied verbatim by build_assets.mjs --sync-site from the site\'s\n' +
    '   assets/css/hero.css (the diagram, the tablet rule for its labels, reduced motion). Do not edit. */\n\n' +
    parts.join('\n\n') + '\n');
  console.log('synced diagram.js and diagram.css from', siteDir);
}
if (opt('--sync-site')) syncSite(opt('--sync-site'));

// ---------------------------------------------------------------- PNG: inspect, and flatten if needed
function pngChunks(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('not a PNG');
  const out = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}
function pngInfo(file) {
  const ch = pngChunks(fs.readFileSync(file));
  const h = ch[0].data;
  return { w: h.readUInt32BE(0), h: h.readUInt32BE(4), depth: h[8], colorType: h[9], interlace: h[12],
           trns: ch.some(c => c.type === 'tRNS') };
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}
// 8-bit RGBA, not interlaced (what Chromium writes) -> 8-bit RGB composited on the cream
function flattenPng(file) {
  const ch = pngChunks(fs.readFileSync(file));
  const ih = ch[0].data, w = ih.readUInt32BE(0), h = ih.readUInt32BE(4);
  if (ih[8] !== 8 || ih[9] !== 6 || ih[12] !== 0) throw new Error(`${file}: cannot flatten this PNG layout`);
  const raw = zlib.inflateSync(Buffer.concat(ch.filter(c => c.type === 'IDAT').map(c => c.data)));
  const bpp = 4, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const out = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    out[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const s = y * stride + x * 4, d = y * (w * 3 + 1) + 1 + x * 3, al = px[s + 3] / 255;
      for (let k = 0; k < 3; k++) out[d + k] = Math.round(px[s + k] * al + PAPER[k] * (1 - al));
    }
  }
  const ihdr = Buffer.from(ih); ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(out, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}
function ensureRgb(file, w, h) {
  let i = pngInfo(file);
  if (i.colorType === 6) { flattenPng(file); i = pngInfo(file); console.log(`  flattened ${path.basename(file)} on #F1EEE3`); }
  const ok = i.w === w && i.h === h && i.depth === 8 && i.colorType === 2 && !i.trns && i.interlace === 0;
  console.log(`  ${ok ? 'ok ' : 'BAD'} ${path.relative(OUT, file)}: ${i.w}x${i.h}, ${i.depth}-bit, colour type ${i.colorType}` +
    `${i.colorType === 2 ? ' (RGB, no alpha)' : ''}${i.trns ? ', tRNS!' : ''}`);
  if (!ok) throw new Error(`${file} is not a ${w}x${h} 24-bit RGB PNG without alpha`);
}

// ---------------------------------------------------------------- Playwright
async function loadPlaywright() {
  const dir = opt('--pw') || process.env.PLAYWRIGHT_DIR;
  if (dir) return import(pathToFileURL(path.join(dir, 'index.mjs')).href);
  try { return await import('playwright'); }
  catch { throw new Error('Playwright not found: pass --pw <dir of the playwright package> or set PLAYWRIGHT_DIR'); }
}
const need = ['shots', 'tiles', 'video'].some(want);
const { chromium } = need ? await loadPlaywright() : {};
const browser = need ? await chromium.launch() : null;

async function render(file, out, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'light',
                                       reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => errors.push(`request failed: ${r.url()}`));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push(`network request: ${r.url()}`); });
  await page.goto(pathToFileURL(path.join(SRC, file)).href);
  const info = await page.evaluate(() => window.__ready);
  if (errors.length) throw new Error(`${file}: ${errors.join('; ')}`);
  const unloaded = info.faces.filter(f => !f.endsWith('loaded'));
  if (unloaded.length) throw new Error(`${file}: fonts not loaded: ${unloaded.join(', ')}`);
  if (info.w !== w || info.h !== h) throw new Error(`${file}: the page is ${info.w}x${info.h}, not ${w}x${h}`);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  ensureRgb(out, w, h);
}

const SHOTS = [
  ['shot-01.html', 'screenshot-01-your-grid.png'],
  ['shot-02.html', 'screenshot-02-click-once.png'],
  ['shot-03.html', 'screenshot-03-sign-in-once.png'],
  ['shot-04.html', 'screenshot-04-seventeen-checks.png'],
  ['shot-05.html', 'screenshot-05-by-approval-only.png'],
];
if (want('shots')) {
  console.log('screenshots (1280x800)');
  for (const [src, out] of SHOTS) await render(src, path.join(OUT, out), 1280, 800);
}
if (want('tiles')) {
  console.log('promo tiles');
  await render('tile-440x280.html', path.join(OUT, 'promo-tile-440x280.png'), 440, 280);
  await render('marquee-1400x560.html', path.join(OUT, 'marquee-1400x560.png'), 1400, 560);
}
if (want('icon')) {
  console.log('store icon');
  // the package's own 128: 96 px of artwork inside 16 px of transparent padding, which is what the store asks of
  // an icon (screenshots and tiles must have no alpha; the icon may, and on the store's white page it should)
  fs.copyFileSync(path.join(SRC, 'icon', 'icon.png'), path.join(OUT, 'store-icon-128.png'));
  const ic = pngInfo(path.join(OUT, 'store-icon-128.png'));
  if (ic.w !== 128 || ic.h !== 128 || ic.depth !== 8 || ic.colorType !== 6) throw new Error('store-icon-128.png is not a 128x128 RGBA PNG');
  console.log('  ok  store-icon-128.png: 128x128, 8-bit RGBA (transparent padding)');
}

// ---------------------------------------------------------------- the promo video
function findFfmpeg() {
  const native = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (native.status === 0) return { cmd: 'ffmpeg', pre: [], p: (f) => f, name: native.stdout.split('\n')[0] };
  if (process.platform === 'win32') {
    const wsl = spawnSync('wsl', ['-e', 'ffmpeg', '-version'], { encoding: 'utf8' });
    if (wsl.status === 0) {
      const p = (f) => { const a = path.resolve(f); return `/mnt/${a[0].toLowerCase()}${a.slice(2).replace(/\\/g, '/')}`; };
      return { cmd: 'wsl', pre: ['-e', 'ffmpeg'], p, name: `${wsl.stdout.split('\n')[0]} (WSL)` };
    }
  }
  return null;
}

if (want('video')) {
  const FPS = 30, W = 1280, H = 720;
  const promoDir = path.join(OUT, 'promo');
  fs.mkdirSync(promoDir, { recursive: true });
  const ff = argv.includes('--webm') ? null : findFfmpeg();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: 'light' });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push(`network request: ${r.url()}`); });
  await page.goto(pathToFileURL(path.join(SRC, 'promo.html')).href + '?record');
  const info = await page.evaluate(() => window.__ready);
  if (errors.length) throw new Error(`promo.html: ${errors.join('; ')}`);
  if (info.faces.some(f => !f.endsWith('loaded'))) throw new Error('promo.html: fonts not loaded');
  const duration = await page.evaluate(() => window.__duration);
  const poster = await page.evaluate(() => window.__poster);
  console.log(`promo video: ${duration} s at ${FPS} fps, ${W}x${H}; encoder: ${ff ? ff.name : 'none (Playwright .webm)'}`);

  // the poster frame
  await page.evaluate((t) => window.__seek(t), poster);
  const posterFile = path.join(promoDir, 'beethoven-promo-poster.png');
  await page.screenshot({ path: posterFile, clip: { x: 0, y: 0, width: W, height: H } });
  ensureRgb(posterFile, W, H);

  if (ff) {
    const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'beethoven-promo-'));
    const n = Math.round(duration * FPS);
    for (let i = 0; i < n; i++) {
      await page.evaluate((t) => window.__seek(t), i / FPS);
      await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: W, height: H } });
      if (i % 150 === 0) console.log(`  frame ${i}/${n}`);
    }
    const mp4 = path.join(promoDir, 'beethoven-promo.mp4');
    const args = [...ff.pre, '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', ff.p(path.join(frames, 'f%04d.png')),
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
      '-movflags', '+faststart', '-an', ff.p(mp4)];
    const r = spawnSync(ff.cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
    fs.rmSync(frames, { recursive: true, force: true });
    console.log(`  wrote ${path.relative(OUT, mp4)} (${fs.statSync(mp4).size} bytes, ${n} frames)`);
  } else {
    // no ffmpeg: record the page as it plays, in real time
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beethoven-promo-webm-'));
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir, size: { width: W, height: H } } });
    const p2 = await ctx.newPage();
    await p2.goto(pathToFileURL(path.join(SRC, 'promo.html')).href);
    await p2.evaluate(() => window.__ready);
    await p2.waitForTimeout(duration * 1000 + 300);
    const v = p2.video();
    await ctx.close();
    const webm = path.join(promoDir, 'beethoven-promo.webm');
    fs.copyFileSync(await v.path(), webm);
    console.log(`  wrote ${path.relative(OUT, webm)} (real-time recording; starts with up to a second of loading)`);
  }
  await page.close();
}

if (browser) await browser.close();
console.log('done');
