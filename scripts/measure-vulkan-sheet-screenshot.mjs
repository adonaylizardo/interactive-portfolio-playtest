#!/usr/bin/env node
/**
 * MED-1 proof: Page.captureScreenshot PNG alpha in the band above expanded Teresa sheet.
 * Matches Forge hostile QA (not preserveDrawingBuffer / sampleCanvasColors readback).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pngjs from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts/k13-vulkan-alpha');
fs.mkdirSync(OUT, { recursive: true });

const BASE =
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

function alphaStats(png, clip) {
  const { x, y, width, height } = clip;
  let alpha0 = 0;
  let n = 0;
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const idx = (png.width * py + px) << 2;
      n += 1;
      if (png.data[idx + 3] === 0) alpha0 += 1;
    }
  }
  return { alpha0Pct: n ? (alpha0 / n) * 100 : 100, pixels: n };
}

async function captureClip(page, clipCss, dpr, name) {
  const buf = await page.screenshot({
    type: 'png',
    clip: {
      x: clipCss.x * dpr,
      y: clipCss.y * dpr,
      width: clipCss.width * dpr,
      height: clipCss.height * dpr,
    },
  });
  const png = pngjs.PNG.sync.read(buf);
  const stats = alphaStats(png, {
    x: 0,
    y: 0,
    width: png.width,
    height: png.height,
  });
  fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
  return stats;
}

async function runViewport(page, label, width, height, dpr) {
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__playtestQa?.enterInterior === 'function', {
    timeout: 180000,
  });
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--open', { timeout: 30000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheet?.());
  await page.waitForSelector('.building-panel--expanded', { timeout: 15000 });

  const clip = await page.evaluate(({ roiW, roiH }) => {
    const canvas =
      document.getElementById('game-canvas-present')?.classList.contains('is-active')
        ? document.getElementById('game-canvas-present')
        : document.getElementById('game-canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    return {
      x: r.left,
      y: r.top,
      width: Math.min(roiW, r.width),
      height: Math.min(roiH, r.height),
    };
  }, { roiW: Math.min(384, width), roiH: 334 });
  if (!clip) return { label, error: 'missing canvas' };

  const samples = [];
  for (const waitMs of [900, 1100, 3000]) {
    await page.waitForTimeout(waitMs);
    const stats = await captureClip(page, clip, dpr, `${label}-t${waitMs}`);
    samples.push({ waitMs, ...stats, clip });
  }
  return { label, samples };
}

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=vulkan', '--enable-features=Vulkan'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* */
    }
  });

  const portrait = await runViewport(page, '390x844', 390, 844, 3);
  await ctx.close();

  const ctx2 = await browser.newContext({
    viewport: { width: 360, height: 784 },
    deviceScaleFactor: 2,
    locale: 'en-US',
  });
  const page2 = await ctx2.newPage();
  page2.setDefaultTimeout(180000);
  await page2.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* */
    }
  });
  const narrow = await runViewport(page2, '360x784', 360, 784, 2);
  await ctx2.close();
  await browser.close();

  const report = { portrait, narrow, OUT };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  const fail = [portrait, narrow].some((r) =>
    r.samples?.some((s) => s.alpha0Pct > 15),
  );
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
