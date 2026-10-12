/**
 * Before/after shots of the 12 map items and the full map, framed through the URL hash camera so
 * both builds show the same world rectangle.
 *
 * Usage: node scripts/shots-before-after.mjs <before-base-url> <after-base-url>
 * Writes artifacts/run39/before/*.png, artifacts/run39/after/*.png and side-by-side montages
 * (ImageMagick `montage`) in artifacts/run39/compare/.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installReadyWait } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'run39');
const [beforeBase, afterBase] = process.argv.slice(2);
if (!beforeBase || !afterBase) {
  console.error('usage: node scripts/shots-before-after.mjs <before-base-url> <after-base-url>');
  process.exit(1);
}

const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprites.json'), 'utf8')).assets;
const ITEMS = [
  ['estudio', 'ext/estudio/default/cerca', -512, 1688],
  ['volaris', 'ext/volaris/default/cerca', 128, 2080],
  ['bain', 'ext/bain/default/cerca', 768, 1760],
  ['mentoria', 'ext/mentoria/default/cerca', 320, 1536],
  ['finoa', 'ext/finoa/default/cerca', -320, 1216],
  ['pg', 'ext/pg/default/cerca', -768, 1440],
  ['sambil', 'ext/sambil/default/cerca', 1792, 1696],
  ['catedral', 'ext/catedral/default/cerca', -320, 480],
  ['flor', 'ext/flor/default/cerca', -448, 2624],
  ['obelisco', 'prop/obelisco/cerca', -1536, 1200],
  ['redoma', 'prop/redoma/cerca', 448, 2496],
  ['muro', 'prop/muro/cerca', -448, 2304],
];
const VIEWS = [
  { tag: 'desk', width: 1280, height: 800, dpr: 1, zoom: 1, mapZoom: 0.15 },
  { tag: '375', width: 375, height: 812, dpr: 2, zoom: 0.5, mapZoom: 0.05 },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hashFor = (cx, cy, z) => `#view=x=${(-cx).toFixed(1)}&y=${(-cy).toFixed(1)}&z=${z.toFixed(3)}`;

const browser = installReadyWait(await chromium.launch());
try {
  for (const [label, base] of [['before', beforeBase], ['after', afterBase]]) {
    fs.mkdirSync(path.join(OUT, label), { recursive: true });
    for (const vp of VIEWS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr });
      const page = await ctx.newPage();
      const shoot = async (name, hash) => {
        await page.goto('about:blank');
        await page.goto(base + hash, { waitUntil: 'networkidle' });
        await page.addStyleTag({ content: '#ui-root{visibility:hidden !important}' });
        await page.evaluate(() => window.__playtestQa?.loadAllSprites?.());
        await wait(900);
        await page.screenshot({ path: path.join(OUT, label, `${name}-${vp.tag}.png`) });
      };
      for (const [name, key, tlx, tly] of ITEMS) {
        const a = A[key];
        await shoot(name, hashFor(tlx + a.w / 2, tly + a.h / 2, vp.zoom));
      }
      await shoot('mapa', hashFor(0, 2080, vp.mapZoom));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

const cmp = path.join(OUT, 'compare');
fs.mkdirSync(cmp, { recursive: true });
for (const vp of VIEWS) {
  for (const name of [...ITEMS.map((i) => i[0]), 'mapa']) {
    const f = `${name}-${vp.tag}.png`;
    execFileSync('montage', [
      '-label', `before ${name}`, path.join(OUT, 'before', f),
      '-label', `after ${name}`, path.join(OUT, 'after', f),
      '-tile', '2x1', '-geometry', '+6+6', '-background', '#202024', '-fill', 'white', '-pointsize', vp.tag === 'desk' ? '18' : '28',
      path.join(cmp, f),
    ]);
  }
}
for (const vp of VIEWS) {
  const tiles = ITEMS.map((i) => path.join(cmp, `${i[0]}-${vp.tag}.png`));
  execFileSync('montage', [
    ...tiles, '-tile', vp.tag === 'desk' ? '2x' : '4x', '-geometry', vp.tag === 'desk' ? '720x+4+4' : '400x+4+4',
    '-background', '#101012', path.join(OUT, `overview-items-${vp.tag}.png`),
  ]);
}
console.log(`shots: ${ITEMS.length + 1} framings x ${VIEWS.length} views x before/after -> ${path.relative(ROOT, OUT)}`);
