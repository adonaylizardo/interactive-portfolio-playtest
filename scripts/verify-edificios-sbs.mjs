#!/usr/bin/env node
/**
 * UI gate Run #5: 12 frames vs public/figma-specs PNGs.
 * Per-frame locale; optional text masks for mixed-language Figma exports (layout compare).
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

/** Locale the Figma frame uses for UI copy (map vs panel may differ). */
const FLOW_LOCALE = {
  'talks-desktop': { map: 'en', panel: 'es' },
  'talks-phone': { map: 'en', panel: 'es' },
  'writings-desktop': {
    map: 'en',
    panel: 'en',
    mixed: 'Figma section descriptions are ES in PNG; three desc lines masked for layout gate.',
  },
  'writings-phone': { map: 'en', panel: 'en' },
};

/** Rectangles in crop coordinates filled before diff (layout-only regions). */
const TEXT_MASK_IN_CROP = {
  'writings-desktop-list': [
    { x: 24, y: 155, w: 384, h: 22 },
    { x: 24, y: 348, w: 384, h: 22 },
    { x: 24, y: 528, w: 384, h: 22 },
  ],
  'writings-phone-list': [{ x: 0, y: 56, w: 375, h: 52 }],
};

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function normalizePhone(png) {
  if (png.width === 750 && png.height === 1624) {
    const out = new PNG({ width: 375, height: 812 });
    for (let y = 0; y < 812; y++) {
      for (let x = 0; x < 375; x++) {
        const j = (y * 2 * 750 + x * 2) * 4;
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
      const i = (row * w + col) * 4;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const j = (sy * src.width + sx) * 4;
      out.data[i] = src.data[j];
      out.data[i + 1] = src.data[j + 1];
      out.data[i + 2] = src.data[j + 2];
      out.data[i + 3] = src.data[j + 3];
    }
  }
  return out;
}

function maskRects(png, rects, fill = [20, 21, 24]) {
  if (!rects?.length) return png;
  const out = PNG.sync.read(PNG.sync.write(png));
  for (const r of rects) {
    for (let row = Math.max(0, r.y); row < Math.min(out.height, r.y + r.h); row++) {
      for (let col = Math.max(0, r.x); col < Math.min(out.width, r.x + r.w); col++) {
        const i = (row * out.width + col) * 4;
        out.data[i] = fill[0];
        out.data[i + 1] = fill[1];
        out.data[i + 2] = fill[2];
        out.data[i + 3] = 255;
      }
    }
  }
  return out;
}

function pixelDiffPct(a, b, threshold = 8) {
  if (a.width !== b.width || b.height !== a.height) {
    return { pct: 100, note: `size ${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  let diff = 0;
  const n = a.width * a.height;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const j = (y * a.width + x) * 4;
      const k = (y * b.width + x) * 4;
      if (
        Math.abs(a.data[j] - b.data[k]) > threshold ||
        Math.abs(a.data[j + 1] - b.data[k + 1]) > threshold ||
        Math.abs(a.data[j + 2] - b.data[k + 2]) > threshold
      ) {
        diff++;
      }
    }
  }
  return { pct: (diff / n) * 100, note: null };
}

function blur3(png) {
  const out = PNG.sync.read(PNG.sync.write(png));
  const w = png.width;
  const h = png.height;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            s += png.data[((y + dy) * w + (x + dx)) * 4 + c];
          }
        }
        out.data[(y * w + x) * 4 + c] = Math.round(s / 9);
      }
    }
  }
  return out;
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

function saveZoomCrop(build, ref, outBase, size = 96) {
  const cx = Math.floor(build.width / 2);
  const cy = Math.floor(build.height / 2);
  const half = Math.floor(size / 2);
  const rect = {
    x: Math.max(0, cx - half),
    y: Math.max(0, cy - half),
    w: Math.min(size, build.width),
    h: Math.min(size, build.height),
  };
  writePng(`${outBase}-build.png`, cropPng(build, rect));
  writePng(`${outBase}-ref.png`, cropPng(ref, rect));
}

async function sheetRect(page) {
  return page.evaluate(() => {
    const fromQa = window.__playtestQa?.getExperienceSheetRect?.();
    if (fromQa) return fromQa;
    const el = document.querySelector('.building-panel.building-panel--experience .building-panel__sheet');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
}

async function checklistChromeRect(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.checklist.checklist--figma-gate') ?? document.querySelector('.checklist');
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  });
}

async function captureFlow(page, building, flowPrefix, steps) {
  const locale = FLOW_LOCALE[flowPrefix] ?? { map: 'en', panel: 'en' };
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  if (steps.desktop) {
    await page.evaluate(
      (lang) => {
        window.__playtestQa.setLang?.(lang);
        window.__playtestQa.setLayout?.('split');
      },
      locale.panel,
    );
  } else {
    await page.evaluate(
      (lang) => {
        window.__playtestQa.setLang?.(lang);
        window.__playtestQa.setChecklistFigmaGate?.();
      },
      locale.map,
    );
  }
  await page.evaluate((name) => {
    window.__playtestQa.setZoom(0.5);
    window.__playtestQa.frameDoorForQa(name);
  }, building);
  await wait(500);
  await page.screenshot({ path: steps.map });
  const mapChecklistRect = steps.desktop ? null : await checklistChromeRect(page);
  await page.evaluate((name) => window.__playtestQa.enterInterior(name), building);
  await wait(900);
  if (steps.expand) await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
  await wait(600);
  await page.evaluate(
    (lang) => {
      window.__playtestQa.setLang?.(lang);
    },
    locale.panel,
  );
  await wait(250);
  await page.evaluate(() => {
    document.querySelector('.building-panel__body-wrap')?.scrollTo(0, 0);
  });
  let listSheet = await sheetRect(page);
  if (!listSheet) {
    await wait(300);
    listSheet = await sheetRect(page);
  }
  await page.screenshot({ path: steps.list });
  await page.evaluate(() => document.querySelector('.experience__row')?.click());
  await wait(500);
  await page.evaluate(() => {
    document.querySelector('.building-panel__body-wrap')?.scrollTo(0, 0);
  });
  let detailSheet = await sheetRect(page);
  if (!detailSheet) {
    await wait(300);
    detailSheet = await sheetRect(page);
  }
  await page.screenshot({ path: steps.detail });
  return { listSheet, detailSheet, mapChecklistRect, locale };
}

function cropForStep(desktop, step, sheetRectByStep, checklistRect, building) {
  if (step === 'map') {
    if (desktop) return { x: 0, y: 0, w: 64, h: 900 };
    if (checklistRect) return checklistRect;
    return { x: 122, y: 56, w: 237, h: 52 };
  }
  if (desktop) return { x: 64, y: 0, w: 432, h: 900 };
  const sheet = step === 'list' ? sheetRectByStep.listSheet : sheetRectByStep.detailSheet;
  if (sheet) return sheet;
  if (building === 'biblioteca') {
    return step === 'list'
      ? { x: 0, y: 192, w: 375, h: 620 }
      : { x: 0, y: 72, w: 375, h: 740 };
  }
  return step === 'list'
    ? { x: 0, y: 252, w: 375, h: 560 }
    : { x: 0, y: 92, w: 375, h: 720 };
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
    const capture = await captureFlow(page, meta.building, meta.prefix, {
      map: path.join(baseDir, 'build-map.png'),
      list: path.join(baseDir, 'build-list.png'),
      detail: path.join(baseDir, 'build-detail.png'),
      expand: !meta.desktop,
      desktop: meta.desktop,
    });
    const checklistRect = capture.mapChecklistRect ?? null;
    await ctx.close();

    for (const step of ['map', 'list', 'detail']) {
      const figmaName = `${meta.prefix.split('-')[0]}-${meta.desktop ? 'desktop' : 'phone'}-${step === 'detail' ? (meta.prefix.includes('talks') ? 'player' : 'reading') : step}`;
      const refPath = path.join(FIGMA, `${figmaName}.png`);
      const buildRaw = readPng(path.join(baseDir, `build-${step}.png`));
      const build = meta.dpr === 2 ? normalizePhone(buildRaw) : buildRaw;
      const buildNorm = path.join(baseDir, `build-${step}-1x.png`);
      writePng(buildNorm, build);
      const ref = readPng(refPath);

      writeSbs(buildNorm, refPath, path.join(OUT, 'sbs-full', `${figmaName}-full.png`));

      const crop = cropForStep(meta.desktop, step, capture, checklistRect, meta.building);
      let compareBuild = cropPng(build, crop);
      let compareRef = cropPng(ref, crop);
      const masks = TEXT_MASK_IN_CROP[`${figmaName}-${step}`] ?? TEXT_MASK_IN_CROP[figmaName];
      const masked = !!masks?.length;
      if (masked) {
        compareBuild = maskRects(compareBuild, masks);
        compareRef = maskRects(compareRef, masks);
      }
      const cropTag = `${crop.x},${crop.y},${crop.w}×${crop.h}`;
      const cropBuildPath = path.join(OUT, 'crops', `${figmaName}-${step}-build.png`);
      const cropRefPath = path.join(OUT, 'crops', `${figmaName}-${step}-ref.png`);
      writePng(cropBuildPath, compareBuild);
      writePng(cropRefPath, compareRef);

      const sbsPath = path.join(OUT, 'sbs', `${figmaName}-${step}.png`);
      writeSbs(cropBuildPath, cropRefPath, sbsPath);

      const strict = pixelDiffPct(compareBuild, compareRef, 8);
      const soft = pixelDiffPct(blur3(compareBuild), blur3(compareRef), 12);
      const flowLoc = FLOW_LOCALE[meta.prefix];
      const row = {
        screen: figmaName,
        step,
        crop: cropTag,
        locale: step === 'map' ? flowLoc.map : flowLoc.panel,
        textMasked: masked,
        mixedFrameNote: flowLoc.mixed ?? null,
        diffPct: Number(strict.pct.toFixed(2)),
        diffPctBlur12: Number(soft.pct.toFixed(2)),
        gate: strict.pct <= 8 ? 'PASS' : 'FAIL',
        sbsFull: path.join(OUT, 'sbs-full', `${figmaName}-full.png`),
        note: strict.note,
      };
      row.sbs = sbsPath;
      if (strict.pct > 8) {
        saveZoomCrop(compareBuild, compareRef, path.join(OUT, 'zoom', `${figmaName}-${step}`));
        row.zoomCrop = path.join(OUT, 'zoom', `${figmaName}-${step}-build.png`);
      }
      table.push(row);
      console.log(
        `${figmaName} ${step} [${cropTag}] locale=${row.locale}${masked ? ' masked' : ''}: ${strict.pct.toFixed(2)}% (blur/12: ${soft.pct.toFixed(2)}%) ${row.gate}`,
      );
    }
  }
} finally {
  await browser.close();
  preview.kill();
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'diff-table.json'), JSON.stringify(table, null, 2));
let md = '| Screen | Step | Crop | Locale | Mask | Diff % | Blur/12 | Gate |\n|---|---|---|---|---|---:|---:|---|\n';
for (const r of table) {
  md += `| ${r.screen} | ${r.step} | ${r.crop} | ${r.locale} | ${r.textMasked ? 'yes' : 'no'} | ${r.diffPct} | ${r.diffPctBlur12} | ${r.gate} |\n`;
}
fs.writeFileSync(path.join(OUT, 'DIFF-TABLE.md'), md);
console.log(`\nWrote ${OUT}/diff-table.json, sbs/, sbs-full/, crops/, zoom/`);
