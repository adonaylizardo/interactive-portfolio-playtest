#!/usr/bin/env node
/**
 * Forge QA k10 — no __playtestQa. Real door tap (map pill anchor), real [data-exp-expand],
 * Page.captureScreenshot alpha above sheet (default Vulkan + GL), orientation redraw.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/forge-k10');

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

function transparentFractionPng(png) {
  const n = png.width * png.height;
  let zero = 0;
  for (let i = 0; i < n; i++) if (png.data[i * 4 + 3] === 0) zero++;
  return { pct: (zero / n) * 100, zero, n };
}

function rgbStats(png) {
  const n = png.width * png.height;
  let r = 0;
  let g = 0;
  let b = 0;
  let r2 = 0;
  let g2 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const pr = png.data[o];
    const pg = png.data[o + 1];
    const pb = png.data[o + 2];
    r += pr;
    g += pg;
    b += pb;
    r2 += pr * pr;
    g2 += pg * pg;
    b2 += pb * pb;
  }
  const mr = r / n;
  const mg = g / n;
  const mb = b / n;
  const std = Math.sqrt(Math.max(0, (r2 + g2 + b2) / n - (mr * mr + mg * mg + mb * mb)));
  return { mean: [mr, mg, mb], std };
}

function glArgs() {
  if (process.env.QA_GL === 'gl') return ['--use-angle=gl', '--ignore-gpu-blocklist'];
  return [];
}

async function launchBrowser() {
  return chromium.launch({ args: glArgs() });
}

async function waitGameReady(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    () => {
      const canvas = document.getElementById('game-canvas');
      return Boolean(canvas?.dataset?.zoom && document.querySelector('.chrome'));
    },
    { timeout: 180000 },
  );
  await page.waitForTimeout(800);
}

async function dismissIntroIfNeeded(page) {
  const close = page.locator('[data-action="intro-close"]');
  if (await close.isVisible().catch(() => false)) {
    await close.tap();
    await page.waitForTimeout(400);
  }
}

/** Map pill starts walk-to-door; entry fires on the door tile (real touch, no __playtestQa). */
async function enterBuildingViaDoor(page, buildingId, panelSel) {
  await waitGameReady(page);
  await dismissIntroIfNeeded(page);
  const pill = page.locator(`.building-map-label[data-id="${buildingId}"]`);
  await pill.waitFor({ state: 'attached', timeout: 20000 });
  const pillBox = await pill.boundingBox();
  if (!pillBox?.width) throw new Error(`${buildingId} map pill missing`);
  await page.touchscreen.tap(pillBox.x + pillBox.width / 2, pillBox.y + pillBox.height / 2);
  const entered = await page
    .waitForFunction(
      (sel) => document.querySelector(sel)?.classList.contains('building-panel--open'),
      panelSel,
      { timeout: 120000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!entered) throw new Error(`${buildingId} walk-to-door timeout`);
}

async function tapRealExpand(page) {
  const btn = page.locator('[data-exp-expand]').first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error('expand box');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 30000 },
  );
}

async function cdpScreenshotPng(page, clip) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...clip, scale: 1 },
  });
  return PNG.sync.read(Buffer.from(data, 'base64'));
}

async function alphaAboveSheet(page, tag, backend) {
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 0,
  );
  const vw = (await page.viewportSize()).width;
  const clip = {
    x: 6,
    y: 1,
    width: Math.min(vw - 12, 384),
    height: Math.max(40, Math.floor(Math.min(sheetTop - 8, 334))),
  };
  const checkpoints = [900, 2000, 5000];
  let elapsed = 0;
  let worst = 0;
  for (const target of checkpoints) {
    await page.waitForTimeout(target - elapsed);
    elapsed = target;
    const png = await cdpScreenshotPng(page, clip);
    const { pct } = transparentFractionPng(png);
    worst = Math.max(worst, pct);
  }
  const pass = worst === 0;
  record(`MED-1-alpha-${backend}`, pass, `worstTransparent=${worst.toFixed(2)}% sheetTop=${sheetTop}`, tag);
}

async function med1Suite(page, w, buildingId, panelSel, mode, backend) {
  const tag = `${w}-${mode}-${backend}`;
  await enterBuildingViaDoor(page, buildingId, panelSel);
  await tapRealExpand(page);
  await alphaAboveSheet(page, tag, `${mode}-${backend}`);
}

async function orientationRoom(page, backend) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });
  await enterBuildingViaDoor(page, 'teresa', '.building-panel--experience');
  await tapRealExpand(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 844,
    height: 390,
    deviceScaleFactor: 3,
    mobile: true,
    screenOrientation: { type: 'landscapePrimary', angle: 90 },
  });
  await page.waitForTimeout(1200);
  const sheetRight = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().right ?? 400,
  );
  const clip = {
    x: Math.ceil(sheetRight + 8),
    y: 20,
    width: Math.max(80, 844 - Math.ceil(sheetRight) - 16),
    height: 350,
  };
  const land = await cdpScreenshotPng(page, clip);
  const landStats = rgbStats(land);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle: 0 },
  });
  await page.waitForTimeout(1200);
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 500,
  );
  const portClip = {
    x: 6,
    y: 1,
    width: 360,
    height: Math.max(40, Math.floor(Math.min(sheetTop - 8, 334))),
  };
  const port = await cdpScreenshotPng(page, portClip);
  const portStats = rgbStats(port);
  const portAlpha = transparentFractionPng(port).pct;
  const pass = landStats.std > 5 && portStats.std > 5 && portAlpha === 0;
  record(
    `MED-orient-${backend}`,
    pass,
    `landStd=${landStats.std.toFixed(2)} portStd=${portStats.std.toFixed(2)} portAlpha=${portAlpha.toFixed(2)}%`,
    '390↔844',
  );
}

async function runBackend(backendLabel) {
  const browser = await launchBrowser();
  for (const w of [360, 390, 430]) {
    for (const [buildingId, panelSel, mode] of [
      ['teresa', '.building-panel--experience', 'charlas'],
      ['biblioteca', '.building-panel--writings', 'biblioteca'],
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 844 },
        hasTouch: true,
        isMobile: true,
        locale: 'es-VE',
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
      try {
        await med1Suite(page, w, buildingId, panelSel, mode, backendLabel);
      } catch (e) {
        record(`MED-1-${mode}-${backendLabel}`, false, String(e.message ?? e), String(w));
      }
      await ctx.close();
    }
  }
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'es-VE',
    });
    const page = await ctx.newPage();
    try {
      await orientationRoom(page, backendLabel);
    } catch (e) {
      record(`MED-orient-${backendLabel}`, false, String(e.message ?? e), '390↔844');
    }
    await ctx.close();
  }
  await browser.close();
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });
  if (process.env.FORGE_K10_GL_ONLY === '1') {
    process.env.QA_GL = 'gl';
    await runBackend('gl');
  } else if (process.env.FORGE_K10_VULKAN_ONLY === '1') {
    await runBackend('vulkan');
  } else {
    await runBackend('vulkan');
    process.env.QA_GL = 'gl';
    await runBackend('gl');
  }
  console.log('\n| Forge k10 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${String(r.detail).slice(0, 72)} |`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
  console.log(`\nForge k10: ${results.length} checks PASS @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
