#!/usr/bin/env node
/**
 * UI-ready gate: capture loading + welcome on deployed preview-contenido at 390×844, 844×390, 1280×800.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/carga-ui-gate');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { id: 'telefono-vertical', width: 390, height: 844 },
  { id: 'telefono-horizontal', width: 844, height: 390 },
  { id: 'desktop', width: 1280, height: 800 },
];

async function captureLoading(page, tag) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#boot.boot-flow', { timeout: 120000 });
  await page.waitForFunction(
    () => {
      const pct = parseInt(document.querySelector('.boot-flow__pct')?.textContent ?? '0', 10);
      return pct >= 18 && pct < 92 && document.body.classList.contains('boot-loading');
    },
    { timeout: 120000 },
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, `${tag}-carga.png`), fullPage: false });
}

async function captureWelcome(page, tag) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boot-flow--welcome', { timeout: 180000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${tag}-bienvenida.png`), fullPage: false });
}

async function proveRouting(browser) {
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
  };

  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-VE' });
  const p1 = await ctx1.newPage();
  p1.setDefaultTimeout(180000);
  watch(p1);
  await p1.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.boot-flow--welcome', { timeout: 180000 });
  await p1.locator('[data-boot-read]').click();
  await p1.waitForFunction(() => location.hash.replace(/^#/, '') === '/leer', { timeout: 30000 });
  const readHash = await p1.evaluate(() => location.hash);
  await ctx1.close();

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-VE' });
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(180000);
  watch(p2);
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p2.waitForSelector('.boot-flow--welcome', { timeout: 180000 });
  await p2.locator('[data-boot-start]').click();
  await p2.waitForFunction(() => !document.getElementById('boot'), { timeout: 15000 });
  await ctx2.close();

  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-VE' });
  const p3 = await ctx3.newPage();
  p3.setDefaultTimeout(180000);
  watch(p3);
  await p3.goto(`${BASE}#/leer`, { waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => location.hash.includes('/leer'), { timeout: 180000 });
  const deepRead = await p3.evaluate(() => location.hash);
  const skipWelcome = await p3.evaluate(() => !document.getElementById('boot'));
  await ctx3.close();

  return { readHash, deepRead, skipWelcome, errors };
}

async function main() {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.width <= 430 ? 3 : 1,
      hasTouch: vp.width <= 844,
      isMobile: vp.width < 768,
      locale: 'es-VE',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    try {
      sessionStorage.clear();
    } catch {
      /* fresh context */
    }
    await captureLoading(page, vp.id);
    await captureWelcome(page, vp.id);
    await ctx.close();
  }

  const routing = await proveRouting(browser);
  await browser.close();

  console.log('Captures →', OUT);
  console.log('Routing:', JSON.stringify(routing, null, 2));
  if (routing.errors.length) {
    console.error('Console errors:', routing.errors);
    process.exit(1);
  }
  if (!routing.readHash.includes('/leer') || !routing.deepRead.includes('/leer') || !routing.skipWelcome) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
