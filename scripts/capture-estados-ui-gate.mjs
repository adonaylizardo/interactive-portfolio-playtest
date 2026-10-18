#!/usr/bin/env node
/**
 * Error / empty / offline UI gate — compare crops to docs/ref/estados-ui/.
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
const OUT = path.join(ROOT, 'artifacts/estados-ui-gate');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { id: 'telefono-vertical', width: 390, height: 844 },
  { id: 'telefono-horizontal', width: 844, height: 390 },
  { id: 'desktop', width: 1280, height: 800 },
];

async function dismissWelcome(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      typeof window.__showFatalState === 'function' ||
      typeof window.__playtestQa?.showFatalState === 'function',
    { timeout: 180000 },
  );
  const welcome = page.locator('[data-boot-start]');
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 }).catch(() => {});
}

async function cropFatal(page, outPath) {
  const el = page.locator('#fatal-state');
  await el.screenshot({ path: outPath });
}

async function cropPanel(page, outPath) {
  const sheet = page.locator('.building-panel__sheet');
  await sheet.screenshot({ path: outPath });
}

async function cropReadingMain(page, outPath) {
  const main = page.locator('.reading-view__main');
  await main.screenshot({ path: outPath });
}

async function cropOfflineToast(page, outPath) {
  const toast = page.locator('#playtest-offline.playtest-toast--visible');
  await toast.screenshot({ path: outPath });
}

async function captureState(browser, stateId, setup) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.width <= 430 ? 3 : 1,
      locale: 'en-US',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(180000);
    await setup(page, vp);
    await page.waitForTimeout(400);
    const outPath = path.join(OUT, `${vp.id}_${stateId}.png`);
    if (stateId === 'webgl' || stateId === 'carga-fallida') await cropFatal(page, outPath);
    else if (stateId === 'sin-conexion') await cropOfflineToast(page, outPath);
    else if (stateId === 'talks-vacio') await cropPanel(page, outPath);
    else if (stateId === 'ruta-no-encontrada') await cropReadingMain(page, outPath);
    await ctx.close();
  }
}

async function main() {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  await captureState(browser, 'webgl', async (page) => {
    await dismissWelcome(page);
    await page.evaluate(() => (window.__showFatalState ?? window.__playtestQa?.showFatalState)?.('webgl'));
    await page.waitForSelector('#fatal-state');
  });

  await captureState(browser, 'carga-fallida', async (page) => {
    await dismissWelcome(page);
    await page.evaluate(() =>
      (window.__showFatalState ?? window.__playtestQa?.showFatalState)?.('load-failed'),
    );
    await page.waitForSelector('#fatal-state');
  });

  await captureState(browser, 'sin-conexion', async (page) => {
    await dismissWelcome(page);
    await page.context().setOffline(true);
    await page.waitForFunction(
      () => document.getElementById('playtest-offline')?.classList.contains('playtest-toast--visible'),
      { timeout: 15000 },
    );
  });

  await captureState(browser, 'talks-vacio', async (page) => {
    await dismissWelcome(page);
    await page.waitForFunction(() => typeof window.__playtestQa?.showTalksEmptyForQa === 'function', {
      timeout: 180000,
    });
    await page.evaluate(() => window.__playtestQa?.showTalksEmptyForQa?.());
    await page.waitForSelector('.building-panel--open', { timeout: 20000 });
    await page.waitForSelector('.experience__empty', { timeout: 10000 });
  });

  await captureState(browser, 'ruta-no-encontrada', async (page) => {
    await page.goto(`${BASE}#/leer/nope`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.reading-view:not([hidden])', { timeout: 60000 });
    await page.waitForSelector('.reading-view__miss', { timeout: 15000 });
  });

  const webglBrowser = await chromium.launch({
    args: ['--disable-gpu', '--disable-software-rasterizer'],
  });
  const ctx = await webglBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE);
  await page.waitForSelector('#fatal-state', { timeout: 120000 }).catch(() => {});
  const realWebgl = await page.locator('#fatal-state').isVisible().catch(() => false);
  await webglBrowser.close();
  await browser.close();

  console.log('Captures →', OUT);
  console.log('Real WebGL block (390):', realWebgl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
