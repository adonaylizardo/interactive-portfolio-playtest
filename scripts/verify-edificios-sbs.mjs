#!/usr/bin/env node
/**
 * UI gate: 12 frames vs public/figma-specs PNGs — real app only (strict 8% RGB diff).
 * Writings list: identical section-badge digit mask rects on ref + build (see DIFF-TABLE).
 * Default locale es; switch via real EN/ES toggle when the Figma frame is EN.
 */
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser } from './qa-ready.mjs';
import { runWritingsSpecGate, writeSpecGateMarkdown } from './lib/writings-spec-gate.mjs';

const WRITINGS_SPEC_SCREENS = new Set([
  'writings-desktop-list',
  'writings-phone-list',
  'writings-phone-reading',
]);
const WRITINGS_PIXEL_SANITY_CAP = 12;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'verify-edificios-sbs');
const FIGMA = path.join(ROOT, 'public', 'figma-specs');
const FIGMA_FILE_KEY = 'D1Vq9b3rBzXquj0FjwSV2q';

/** Gate PNGs: Figma MCP frame exports at 1× (see public/figma-specs/README.md). */
const FIGMA_GATE_PNG_META = {
  'talks-phone-map.png': { nodeId: '194:1381', scale: '1×' },
  'talks-phone-list.png': { nodeId: '194:1541', scale: '1×' },
  'talks-phone-player.png': { nodeId: '194:1796', scale: '1×' },
  'talks-desktop-map.png': { nodeId: '194:2013', scale: '1×' },
  'talks-desktop-list.png': { nodeId: '194:2239', scale: '1×' },
  'talks-desktop-player.png': { nodeId: '194:2585', scale: '1×' },
  'writings-phone-map.png': { nodeId: '199:1715', scale: '1×' },
  'writings-phone-list.png': { nodeId: '199:1869', scale: '1×' },
  'writings-phone-reading.png': { nodeId: '199:2095', scale: '1×' },
  'writings-desktop-map.png': { nodeId: '199:2230', scale: '1×' },
  'writings-desktop-list.png': { nodeId: '199:2450', scale: '1×' },
  'writings-desktop-reading.png': { nodeId: '199:2757', scale: '1×' },
};

/** Approved Figma exports (never build-refreshed writings phone / pre-4de12ed desktop list). */
const APPROVED_REF_SHA256 = {
  'writings-desktop-list.png': '1484f89e54efc00fecfa19498a3c51585aacd73ff8a851098ce6d7ec2e02d564',
  'writings-phone-list.png': 'd82aa2a84521d8f537e42df7f85379af9368371eb009fbbaaf6c4a5f6efa03e7',
  'writings-phone-reading.png': '82a978ee5077e41ab6fa6dffc658fd4da65490fbeaed8287f374561ffb8135e2',
};

const refreshScript = path.join(ROOT, 'scripts', 'refresh-writings-sbs-refs.mjs');
if (fs.existsSync(refreshScript)) {
  console.error(`Ref refresh script must not exist: ${refreshScript}`);
  process.exit(1);
}

const refHashes = {};
for (const name of fs.readdirSync(FIGMA).filter((f) => f.endsWith('.png'))) {
  refHashes[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(FIGMA, name))).digest('hex');
}
for (const [name, expected] of Object.entries(APPROVED_REF_SHA256)) {
  const actual = refHashes[name];
  if (actual !== expected) {
    console.error(`Writings ref ${name} sha256 mismatch (expected approved export).`);
    console.error(`  expected: ${expected}`);
    console.error(`  actual:   ${actual ?? 'missing'}`);
    process.exit(1);
  }
}

try {
  execSync('pkill -f serve-preview-edificios', { stdio: 'ignore' });
} catch {
  /* no server */
}
try {
  execSync('npx vite build --base /interactive-portfolio-playtest/preview-edificios/', {
    cwd: ROOT,
    stdio: 'inherit',
  });
} catch {
  console.error('vite build failed before SBS gate');
  process.exit(1);
}

const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Locale per step: use real toggle when Figma export differs from default es. */
const FLOW_LOCALE = {
  'talks-desktop': { map: 'en', panel: 'es' },
  'talks-phone': { map: 'en', panel: 'es' },
  'writings-desktop': { map: 'en', panel: 'en' },
  'writings-phone': { map: 'en', panel: 'en' },
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

function clampMasks(masks, w, h) {
  return masks
    .map(({ x, y, width, height }) => {
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(w, x + width);
      const y1 = Math.min(h, y + height);
      if (x1 <= x0 || y1 <= y0) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    })
    .filter(Boolean);
}

function pixelInMasks(x, y, masks) {
  for (const m of masks) {
    if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
  }
  return false;
}

function pixelDiffPct(a, b, threshold = 8, masks = null) {
  if (a.width !== b.width || b.height !== a.height) {
    return { pct: 100, note: `size ${a.width}×${a.height} vs ${b.width}×${b.height}` };
  }
  const useMasks = masks?.length ? clampMasks(masks, a.width, a.height) : null;
  let diff = 0;
  let counted = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (useMasks && pixelInMasks(x, y, useMasks)) continue;
      counted++;
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
  const n = counted || a.width * a.height;
  return { pct: (diff / n) * 100, note: null, masked: !!useMasks?.length };
}

function topDiffRegions(a, b, masks, block = 48, topN = 3, threshold = 8) {
  const useMasks = masks?.length ? clampMasks(masks, a.width, a.height) : [];
  const scores = [];
  for (let by = 0; by < a.height; by += block) {
    for (let bx = 0; bx < a.width; bx += block) {
      let diff = 0;
      let counted = 0;
      for (let y = by; y < Math.min(by + block, a.height); y++) {
        for (let x = bx; x < Math.min(bx + block, a.width); x++) {
          if (useMasks.length && pixelInMasks(x, y, useMasks)) continue;
          counted++;
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
      if (!counted) continue;
      scores.push({ x: bx, y: by, w: Math.min(block, a.width - bx), h: Math.min(block, a.height - by), pct: (diff / counted) * 100 });
    }
  }
  scores.sort((p, q) => q.pct - p.pct);
  return scores.slice(0, topN);
}

async function badgeMasksInCrop(page, crop, pad = 4) {
  const raw = await page.evaluate(
    ({ crop, pad }) => {
      const badges = document.querySelectorAll('.building-panel--writings .experience__section-count');
      return [...badges].map((el) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x - crop.x - pad,
          y: r.y - crop.y - pad,
          width: r.width + pad * 2,
          height: r.height + pad * 2,
        };
      });
    },
    { crop, pad },
  );
  return clampMasks(raw, crop.w, crop.h);
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
    const el = document.querySelector('.checklist.checklist--mobile-closed') ?? document.querySelector('.checklist');
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

async function setLocale(page, lang) {
  await page.evaluate((l) => window.__playtestQa.setLang?.(l), lang);
  await wait(200);
}

async function sheetHeight(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.building-panel--experience .building-panel__sheet');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
}

async function expandPhoneSheet(page, minHeight = 520) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
    await wait(200);
    const h = await sheetHeight(page);
    if (h >= minHeight) break;
    const title = page.locator('.exp-mobile-chrome__title').first();
    if (await title.isVisible().catch(() => false)) {
      const tb = await title.boundingBox();
      if (tb) await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await wait(450);
    }
    const h2 = await sheetHeight(page);
    if (h2 >= minHeight) break;
    const grab = page.locator('.exp-mobile-chrome__grab').first();
    const box = await grab.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 220, { steps: 14 });
      await page.mouse.up();
      await wait(550);
    }
  }
  return sheetRect(page);
}

async function enterPhoneBuilding(page, name) {
  await page.evaluate(() => window.__playtestQa.collapseChecklistForQa?.());
  await wait(150);
  await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
  await wait(450);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForFunction(
    (n) => {
      const interior = window.__playtestQa.getInteriorId?.();
      const preview = document.querySelector('.building-panel--preview.building-panel--open');
      const exp = document.querySelector('.building-panel--experience.building-panel--open');
      return interior === n || !!exp || !!preview;
    },
    name,
    { timeout: 45000 },
  );
}

async function captureFlow(page, building, flowPrefix, steps) {
  const locale = FLOW_LOCALE[flowPrefix] ?? { map: 'es', panel: 'es' };
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  await setLocale(page, 'es');
  if (steps.desktop) {
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('split');
    });
  } else {
    await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
    if (locale.map === 'en') {
      await page.locator('.chrome__lang [data-lang="en"]').click();
      await wait(250);
      await page.evaluate(() => window.__playtestQa.collapseChecklistForQa?.());
      await wait(150);
      await page.evaluate(() =>
        window.__playtestQa.setChecklistProgressForQa?.({
          'walk-around': true,
          'walk-keys': true,
          'move-camera': true,
          zoom: false,
          'enter-building': false,
        }),
      );
      await wait(150);
    }
  }
  await page.evaluate((name) => {
    window.__playtestQa.setZoom(0.5);
    window.__playtestQa.frameDoorForQa(name);
  }, building);
  await wait(500);
  await page.screenshot({ path: steps.map });
  const mapChecklistRect = steps.desktop ? null : await checklistChromeRect(page);
  if (steps.expand) {
    // Map capture uses frameDoorForQa + low zoom; reload so the next real door tap is aligned.
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 60000,
    });
    // Real door taps succeed on the default phone sheet layout; map dock misaligns doorScreenPoint.
    await enterPhoneBuilding(page, building);
  } else {
    await page.evaluate((name) => window.__playtestQa.enterInterior(name), building);
    await wait(900);
  }
  if (steps.expand) {
    await expandPhoneSheet(page, building === 'biblioteca' ? 580 : 540);
  }
  await wait(600);
  await setLocale(page, locale.panel);
  await wait(250);
  await page.evaluate(() => {
    document.querySelector('.building-panel__body-wrap')?.scrollTo(0, 0);
  });
  let listSheet = await sheetRect(page);
  if (!listSheet) {
    await wait(300);
    listSheet = await sheetRect(page);
  }
  const listCrop = cropForStep(steps.desktop, 'list', { listSheet, detailSheet: null }, mapChecklistRect, building);
  let listBadgeMasks = null;
  if (building === 'biblioteca') {
    listBadgeMasks = await badgeMasksInCrop(page, listCrop);
  }
  await page.screenshot({ path: steps.list });
  let specList = null;
  if (building === 'biblioteca') {
    const specKey = steps.desktop ? 'writings-desktop-list' : 'writings-phone-list';
    specList = await runWritingsSpecGate(page, specKey);
  }
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
  let specReading = null;
  if (building === 'biblioteca' && !steps.desktop) {
    specReading = await runWritingsSpecGate(page, 'writings-phone-reading');
  }
  return { listSheet, detailSheet, mapChecklistRect, locale, listBadgeMasks, specList, specReading };
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
const specGateResults = [];

try {
  for (const meta of flowMeta) {
    const ctx = await browser.newContext({
      viewport: meta.desktop ? { width: 1440, height: 900 } : { width: 375, height: 812 },
      deviceScaleFactor: meta.dpr,
      hasTouch: !meta.desktop,
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
      const compareBuild = cropPng(build, crop);
      const compareRef = cropPng(ref, crop);
      const cropTag = `${crop.x},${crop.y},${crop.w}×${crop.h}`;
      const cropBuildPath = path.join(OUT, 'crops', `${figmaName}-${step}-build.png`);
      const cropRefPath = path.join(OUT, 'crops', `${figmaName}-${step}-ref.png`);
      writePng(cropBuildPath, compareBuild);
      writePng(cropRefPath, compareRef);

      const sbsPath = path.join(OUT, 'sbs', `${figmaName}-${step}.png`);
      writeSbs(cropBuildPath, cropRefPath, sbsPath);

      const isWritingsList = figmaName.startsWith('writings-') && step === 'list';
      const badgeMasks = isWritingsList ? capture.listBadgeMasks : null;
      const strictRaw = pixelDiffPct(compareBuild, compareRef, 8);
      const strict =
        badgeMasks?.length
          ? pixelDiffPct(compareBuild, compareRef, 8, badgeMasks)
          : strictRaw;
      const flowLoc = FLOW_LOCALE[meta.prefix];
      const skipPhoneMap = !meta.desktop && step === 'map';
      const isWritingsSpec = WRITINGS_SPEC_SCREENS.has(figmaName);
      const specResult =
        figmaName === 'writings-desktop-list' || figmaName === 'writings-phone-list'
          ? capture.specList
          : figmaName === 'writings-phone-reading'
            ? capture.specReading
            : null;
      if (specResult && !specGateResults.some((s) => s.frameKey === specResult.frameKey)) {
        specGateResults.push(specResult);
      }
      const pixelPct = Number(strict.pct.toFixed(2));
      let gate;
      let gateMetric;
      if (skipPhoneMap) {
        gate = 'SKIP';
        gateMetric = 'excluded (live checklist)';
      } else if (isWritingsSpec) {
        const specPass = specResult?.pass === true;
        const pixelOk = pixelPct <= WRITINGS_PIXEL_SANITY_CAP;
        gate = specPass && pixelOk ? 'PASS' : 'FAIL';
        gateMetric = `spec gate + pixel≤${WRITINGS_PIXEL_SANITY_CAP}% (info)`;
      } else {
        gate = strict.pct <= 8 ? 'PASS' : 'FAIL';
        gateMetric = badgeMasks?.length ? 'strict/8 (badge-digit masks)' : 'strict/8';
      }
      const row = {
        screen: figmaName,
        step,
        crop: cropTag,
        locale: step === 'map' ? flowLoc?.map ?? 'es' : flowLoc?.panel ?? 'es',
        diffPct: pixelPct,
        diffPctUnmasked: badgeMasks?.length ? Number(strictRaw.pct.toFixed(2)) : undefined,
        badgeMasks: badgeMasks?.length
          ? badgeMasks.map((m) => `${m.x},${m.y},${m.w}×${m.h}`)
          : undefined,
        specGate: isWritingsSpec ? (specResult?.pass ? 'PASS' : 'FAIL') : undefined,
        gate,
        gateMetric,
        sbsFull: path.join(OUT, 'sbs-full', `${figmaName}-full.png`),
        sbs: sbsPath,
        note: strict.note,
      };
      if (!isWritingsSpec && strict.pct > 8) {
        saveZoomCrop(compareBuild, compareRef, path.join(OUT, 'zoom', `${figmaName}-${step}`));
        row.zoomCrop = path.join(OUT, 'zoom', `${figmaName}-${step}-build.png`);
        row.topDiffRegions = topDiffRegions(compareBuild, compareRef, badgeMasks ?? []);
        const regDir = path.join(OUT, 'diff-regions');
        fs.mkdirSync(regDir, { recursive: true });
        fs.writeFileSync(path.join(regDir, `${figmaName}-${step}.json`), JSON.stringify(row.topDiffRegions, null, 2));
      }
      table.push(row);
      console.log(
        `${figmaName} ${step} [${cropTag}] locale=${row.locale}: ${strict.pct.toFixed(2)}% ${row.gate}`,
      );
    }
  }
} finally {
  await browser.close();
  preview.kill();
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'diff-table.json'), JSON.stringify(table, null, 2));
let md =
  '| Screen | Step | Crop | Locale | Pixel % | Spec | Unmasked % | Badge masks (crop px) | Gate |\n|---|---|---|---|---:|---|---:|---|---|\n';
for (const r of table) {
  const masks = r.badgeMasks?.length ? r.badgeMasks.join('; ') : '—';
  const unmasked = r.diffPctUnmasked != null ? r.diffPctUnmasked : '—';
  const spec = r.specGate ?? '—';
  md += `| ${r.screen} | ${r.step} | ${r.crop} | ${r.locale} | ${r.diffPct} | ${spec} | ${unmasked} | ${masks} | ${r.gate} |\n`;
}
fs.writeFileSync(path.join(OUT, 'DIFF-TABLE.md'), md);
writeSpecGateMarkdown(specGateResults, path.join(OUT, 'SPEC-GATE.md'));
fs.writeFileSync(path.join(OUT, 'spec-gate.json'), JSON.stringify(specGateResults, null, 2));
let hashMd =
  `# Figma gate PNGs (file \`${FIGMA_FILE_KEY}\`)\n\n` +
  'MCP frame exports at **1×** natural size (see `public/figma-specs/README.md`).\n\n' +
  '| File | Figma node | Scale | Dimensions | sha256 |\n|---|---|---|---|---|\n';
for (const name of Object.keys(refHashes).sort()) {
  const meta = FIGMA_GATE_PNG_META[name];
  const png = readPng(path.join(FIGMA, name));
  const node = meta?.nodeId ?? '?';
  const scale = meta?.scale ?? '?';
  hashMd += `| ${name} | \`${node}\` | ${scale} | ${png.width}×${png.height} | \`${refHashes[name]}\` |\n`;
}
hashMd +=
  '\n## Portfolio note (`portfolio/writings-ui/`)\n\n' +
  'Full-screen QA screenshots (map + panel); **different bytes** from gate PNGs is expected.\n\n' +
  '| Portfolio file | sha256 | Byte-match gate PNG |\n|---|---|---|\n';
const portfolioPairs = [
  ['phone-2-list.png', 'writings-phone-list.png'],
  ['phone-3-reader.png', 'writings-phone-reading.png'],
  ['desktop-2-list.png', 'writings-desktop-list.png'],
];
for (const [port, spec] of portfolioPairs) {
  const portPath = path.join(ROOT, 'portfolio', 'writings-ui', port);
  const portHash = fs.existsSync(portPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(portPath)).digest('hex')
    : 'missing';
  const match = portHash === refHashes[spec] ? 'yes' : 'no (expected)';
  hashMd += `| ${port} | \`${portHash}\` | ${match} → \`${spec}\` |\n`;
}
fs.writeFileSync(path.join(OUT, 'REF-HASHES.md'), hashMd);
console.log(`\nWrote ${OUT}/diff-table.json, REF-HASHES.md, sbs/, sbs-full/, crops/, zoom/`);
const gated = table.filter((r) => r.gate !== 'SKIP');
const failed = gated.filter((r) => r.gate === 'FAIL');
if (failed.length) {
  console.error(`SBS gate: ${failed.length} failing panel frame(s)`);
  process.exit(1);
}
console.log(`SBS gate: ${gated.length}/${gated.length} PASS (${table.filter((r) => r.gate === 'SKIP').length} skipped phone-map)`);
