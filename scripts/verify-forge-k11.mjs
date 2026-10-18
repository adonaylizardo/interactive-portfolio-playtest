#!/usr/bin/env node
/**
 * Forge QA k11 — MED-1 on deployed preview-contenido.
 * Default headless Chrome (ANGLE Vulkan), DPR 3, Page.captureScreenshot alpha above sheet.
 * Real canvas door taps + real CDP touch on [data-exp-expand] (no __playtestQa, no force tap).
 *
 * Gate (k11) vs k10: k11 uses CDP Page.captureScreenshot({ fromSurface: true }), clip x=0
 * full layout width, height = sheetTop−1, DPR 3, alpha===0 on every pixel. k10 used a narrower
 * clip (x=6, max height 334), often map-pill walk entry, optional force tap on expand, and no
 * fromSurface — so k10 could report 0% while k11/user still see ~62% transparent on Vulkan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/forge-k11');
fs.mkdirSync(OUT, { recursive: true });

/** Walk-to-door canvas taps (client px, DPR 3 layout viewport). */
const DOOR_TAP = {
  teresa: {
    360: { x: 227.072, y: 134.304 },
    390: { x: 334.324, y: 240.355 },
    430: { x: 369.891, y: 235.757 },
  },
  biblioteca: {
    360: { x: 121.792, y: 117.664 },
    390: { x: 70.774, y: 180.723 },
    430: { x: 76.894, y: 169.463 },
  },
};

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

function transparentFractionPng(png) {
  const n = png.width * png.height;
  let zero = 0;
  for (let i = 0; i < n; i++) if (png.data[i * 4 + 3] === 0) zero++;
  return { pct: (zero / n) * 100, zero, n };
}

function launchArgs() {
  if (process.env.QA_GL === 'gl') return ['--use-angle=gl', '--ignore-gpu-blocklist'];
  return [];
}

async function waitGameReady(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(
    () => Boolean(document.getElementById('game-canvas')?.dataset?.zoom),
    { timeout: 180000 },
  );
  await page.waitForTimeout(600);
}

async function dismissIntro(page) {
  const close = page.locator('[data-action="intro-close"]');
  if (await close.isVisible().catch(() => false)) await close.tap();
}

async function waitPanelOpen(page, panelSel, ms = 45000) {
  return page
    .waitForFunction(
      (sel) => document.querySelector(sel)?.classList.contains('building-panel--open'),
      panelSel,
      { timeout: ms },
    )
    .then(() => true)
    .catch(() => false);
}

async function enterViaDoorTap(page, buildingId, panelSel, vw) {
  await waitGameReady(page);
  await dismissIntro(page);
  const pt = DOOR_TAP[buildingId]?.[vw];
  if (pt) {
    await page.touchscreen.tap(pt.x, pt.y);
    if (await waitPanelOpen(page, panelSel, 90000)) return;
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => Boolean(document.getElementById('game-canvas')?.dataset?.zoom),
      { timeout: 180000 },
    );
    await dismissIntro(page);
    await page.touchscreen.tap(pt.x, pt.y);
    if (await waitPanelOpen(page, panelSel, 60000)) return;
  }
  const pill = page.locator(`.building-map-label[data-id="${buildingId}"]`);
  await pill.waitFor({ state: 'visible', timeout: 30000 });
  const box = await pill.boundingBox();
  if (!box?.width) throw new Error(`${buildingId} map pill missing`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  if (!(await waitPanelOpen(page, panelSel, 45000))) {
    throw new Error(`enter ${buildingId} timeout (door + pill)`);
  }
}

async function cdpPageScreenshotPng(page, clip) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.enable');
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale: 1 },
  });
  return PNG.sync.read(Buffer.from(data, 'base64'));
}

async function roomClip(page) {
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 0,
  );
  const vw = (await page.viewportSize()).width;
  return {
    clip: {
      x: 0,
      y: 0,
      width: vw,
      height: Math.max(1, Math.floor(sheetTop - 1)),
    },
    sheetTop,
  };
}

async function worstAlphaAboveSheet(page, waitsMs = [900, 2000, 5000]) {
  const { clip } = await roomClip(page);
  let elapsed = 0;
  let worst = 0;
  for (const target of waitsMs) {
    await page.waitForTimeout(target - elapsed);
    elapsed = target;
    const png = await cdpPageScreenshotPng(page, clip);
    worst = Math.max(worst, transparentFractionPng(png).pct);
  }
  return { worst, clip };
}

async function tapExpandReal(page) {
  const btn = page.locator('[data-exp-expand]').first();
  await btn.waitFor({ state: 'attached', timeout: 15000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error('expand button box missing');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('[data-exp-expand]') != null;
    },
    { x, y },
  );
  if (!hit) throw new Error(`elementFromPoint missed expand at (${x},${y})`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 30000 },
  );
}

async function med1Case(page, vw, buildingId, panelSel, mode, backend, saveShot) {
  const tag = `${vw}-${mode}-${backend}`;
  await enterViaDoorTap(page, buildingId, panelSel, vw);
  await tapExpandReal(page);
  const { worst, clip } = await worstAlphaAboveSheet(page);
  if (saveShot) {
    const png = await cdpPageScreenshotPng(page, clip);
    fs.writeFileSync(path.join(OUT, `m1-${mode}-p${vw}-${buildingId}-exp5.png`), PNG.sync.write(png));
  }
  record(`MED-1-${mode}-${backend}`, worst === 0, `alpha0=${worst.toFixed(2)}% clipH=${clip.height}`, tag);
}

async function runBackend(label) {
  const browser = await chromium.launch({ args: launchArgs() });
  for (const w of [360, 390, 430]) {
    for (const [buildingId, panelSel, mode] of [
      ['teresa', '.building-panel--experience', 'charlas'],
      ['biblioteca', '.building-panel--writings', 'biblioteca'],
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
        locale: 'es-VE',
      });
      const page = await ctx.newPage();
      try {
        await med1Case(page, w, buildingId, panelSel, mode, label, true);
      } catch (e) {
        record(`MED-1-${mode}-${label}`, false, String(e.message ?? e), `${w}`);
      }
      await ctx.close();
    }
  }
  await browser.close();
}

async function main() {
  if (process.env.FORGE_K11_GL_ONLY === '1') {
    process.env.QA_GL = 'gl';
    await runBackend('gl');
  } else if (process.env.FORGE_K11_VULKAN_ONLY === '1') {
    await runBackend('vulkan');
  } else {
    await runBackend('vulkan');
    process.env.QA_GL = 'gl';
    await runBackend('gl');
  }
  console.log('\n| k11 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${r.detail} |`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) {
    console.error(`\nFailed ${failed.length}/${results.length}`);
    process.exit(1);
  }
  console.log(`\nForge k11: ${results.length} checks PASS @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
