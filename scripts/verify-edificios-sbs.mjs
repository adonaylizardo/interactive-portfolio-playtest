#!/usr/bin/env node
/**
 * UI gate: 12 Talks/Writings frames vs public/figma-specs PNGs.
 * Phone captures at DPR 2 are downscaled to 1x before compare.
 * Panel list/detail use a fixed crop on desktop; map uses chrome crops + notes when >8%.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'verify-edificios-sbs');
const FIGMA = path.join(ROOT, 'public', 'figma-specs');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** Downscale 2x phone screenshot to Figma 1x dimensions. */
function normalizePhone(png) {
  if (png.width === 750 && png.height === 1624) {
    const out = new PNG({ width: 375, height: 812 });
    for (let y = 0; y < 812; y++) {
      for (let x = 0; x < 375; x++) {
        const sx = x * 2;
        const sy = y * 2;
        const j = (sy * 750 + sx) * 4;
        const i = (y * 375 + x) * 4;
        out.data[i] = png.data[j];
        out.data[i + 1] = png.data[j + 1];
        out.data[i + 2] = png.data[j + 2];
        out.data[i + 3] = png.data[j + 3];
      }
    }
    return out;
  }
  return png;
}

function cropPng(src, rect) {
  const { x, y, w, h } = rect;
  const out = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const sx = x + col;
      const sy = y + row;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const j = (sy * src.width + sx) * 4;
      const i = (row * w + col) * 4;
      out.data[i] = src.data[j];
      out.data[i + 1] = src.data[j + 1];
      out.data[i + 2] = src.data[j + 2];
      out.data[i + 3] = src.data[j + 3];
    }
  }
  return out;
}

function pixelDiffPct(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { pct: 100, note: `size ${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  let diff = 0;
  const n = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const j = (y * a.width + x) * 4;
      const k = (y * b.width + x) * 4;
      if (
        Math.abs(a.data[j] - b.data[k]) > 8 ||
        Math.abs(a.data[j + 1] - b.data[k + 1]) > 8 ||
        Math.abs(a.data[j + 2] - b.data[k + 2]) > 8
      ) {
        diff++;
      }
    }
  }
  return { pct: (diff / n) * 100, note: null };
}

function writeSbs(buildPath, refPath, outPath) {
  const a = readPng(buildPath);
  const b = readPng(refPath);
  const w = a.width + b.width + 8;
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 20,
        g = 21,
        bl = 24,
        al = 255;
      if (x < a.width && y < a.height) {
        const j = (y * a.width + x) * 4;
        r = a.data[j];
        g = a.data[j + 1];
        bl = a.data[j + 2];
        al = a.data[j + 3];
      } else if (x >= a.width + 8 && x - a.width - 8 < b.width && y < b.height) {
        const bx = x - a.width - 8;
        const j = (y * b.width + bx) * 4;
        r = b.data[j];
        g = b.data[j + 1];
        bl = b.data[j + 2];
        al = b.data[j + 3];
      }
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = bl;
      out.data[i + 3] = al;
    }
  }
  writePng(outPath, out);
}

async function captureFlow(page, building, steps) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  await page.evaluate(() => window.__playtestQa.setLang?.('es'));
  if (steps.desktop) {
    await page.evaluate(() => window.__playtestQa.setLayout?.('split'));
  }
  await page.evaluate((name) => {
    window.__playtestQa.setZoom(0.5);
    window.__playtestQa.frameDoorForQa(name);
  }, building);
  await wait(500);
  await page.screenshot({ path: steps.map });
  await page.evaluate((name) => window.__playtestQa.enterInterior(name), building);
  await wait(900);
  if (steps.expand) await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
  await wait(400);
  await page.screenshot({ path: steps.list });
  await page.evaluate(() => document.querySelector('.experience__row')?.click());
  await wait(500);
  await page.screenshot({ path: steps.detail });
}

function cropFor(desktop, step) {
  if (desktop) {
    if (step === 'map') return { x: 0, y: 0, w: 64, h: 900 };
    return { x: 64, y: 0, w: 432, h: 900 };
  }
  if (step === 'map') return { x: 0, y: 0, w: 375, h: 128 };
  /* Bottom sheet only (expanded experience panel). */
  return { x: 0, y: 288, w: 375, h: 524 };
}

const flowMeta = [
  { prefix: 'talks-desktop', building: 'teresa', desktop: true, dpr: 1 },
  { prefix: 'talks-phone', building: 'teresa', desktop: false, dpr: 2 },
  { prefix: 'writings-desktop', building: 'biblioteca', desktop: true, dpr: 1 },
  { prefix: 'writings-phone', building: 'biblioteca', desktop: false, dpr: 2 },
];

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(1200);

const browser = await launchBrowser(chromium);
const table = [];

try {
  for (const meta of flowMeta) {
    const ctx = await browser.newContext({
      viewport: meta.desktop ? { width: 1440, height: 900 } : { width: 375, height: 812 },
      deviceScaleFactor: meta.dpr,
    });
    const page = await ctx.newPage();
    const baseDir = path.join(OUT, meta.prefix);
    await captureFlow(page, meta.building, {
      map: path.join(baseDir, 'build-map.png'),
      list: path.join(baseDir, 'build-list.png'),
      detail: path.join(baseDir, 'build-detail.png'),
      expand: !meta.desktop,
      desktop: meta.desktop,
    });
    await ctx.close();

    for (const step of ['map', 'list', 'detail']) {
      const figmaName = `${meta.prefix.split('-')[0]}-${meta.desktop ? 'desktop' : 'phone'}-${step === 'detail' ? (meta.prefix.includes('talks') ? 'player' : 'reading') : step}`;
      const refPath = path.join(FIGMA, `${figmaName}.png`);
      const buildRaw = readPng(path.join(baseDir, `build-${step}.png`));
      const build = meta.dpr === 2 ? normalizePhone(buildRaw) : buildRaw;
      const buildNorm = path.join(baseDir, `build-${step}-1x.png`);
      writePng(buildNorm, build);
      const ref = readPng(refPath);

      const crop = cropFor(meta.desktop, step);
      let compareBuild = build;
      let compareRef = ref;
      let cropTag = 'full';
      if (crop) {
        compareBuild = cropPng(build, crop);
        compareRef = cropPng(ref, crop);
        cropTag = `${crop.x},${crop.y},${crop.w}×${crop.h}`;
        writePng(path.join(OUT, 'crops', `${figmaName}-${step}-build.png`), compareBuild);
        writePng(path.join(OUT, 'crops', `${figmaName}-${step}-ref.png`), compareRef);
      }

      const sbsPath = path.join(OUT, 'sbs', `${figmaName}-${step}.png`);
      writeSbs(
        crop
          ? path.join(OUT, 'crops', `${figmaName}-${step}-build.png`)
          : buildNorm,
        crop ? path.join(OUT, 'crops', `${figmaName}-${step}-ref.png`) : refPath,
        sbsPath,
      );

      const { pct, note } = pixelDiffPct(compareBuild, compareRef);
      const row = {
        screen: figmaName,
        step,
        crop: cropTag,
        diffPct: Number(pct.toFixed(2)),
        gate: pct <= 8 ? 'PASS' : 'FAIL',
        sbs: sbsPath,
        note,
      };
      if (pct > 8 && step === 'map') {
        row.explain =
          'Map center is live Pixi art; crop compares chrome rail (desktop) or top checklist strip (phone). See artifacts/verify-edificios-sbs/crops/.';
      }
      table.push(row);
      console.log(`${figmaName} ${step} [${cropTag}]: ${pct.toFixed(2)}% ${row.gate}`);
    }
  }
} finally {
  await browser.close();
  preview.kill();
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'diff-table.json'), JSON.stringify(table, null, 2));
let md = '| Screen | Step | Crop | Diff % | Gate |\n|---|---|---|---:|---|\n';
for (const r of table) {
  md += `| ${r.screen} | ${r.step} | ${r.crop} | ${r.diffPct} | ${r.gate} |\n`;
}
fs.writeFileSync(path.join(OUT, 'DIFF-TABLE.md'), md);
console.log(`\nWrote ${OUT}/diff-table.json and sbs/`);
