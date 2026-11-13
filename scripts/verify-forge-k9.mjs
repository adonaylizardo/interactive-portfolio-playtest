#!/usr/bin/env node
/**
 * Forge QA k9 — MED-1 alpha above expanded sheet (default Vulkan/SwiftShader GL).
 * Note: tapping "Charlas" inside #/leer opens #/leer/talks (reading list), not the 3D room.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/forge-k9');

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

/** Fraction of pixels with alpha === 0 in PNG buffer. */
function transparentFraction(png) {
  const { width, height, data } = png;
  let zero = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] === 0) zero++;
  }
  return { pct: (zero / n) * 100, zero, n };
}

async function waitForCharlasPanel(page, timeout = 120000) {
  await page.waitForFunction(
    () =>
      window.__playtestQa?.isInInterior?.() &&
      document.querySelector('.building-panel--experience.building-panel--open'),
    { timeout },
  );
}

async function waitForBibliotecaPanel(page, timeout = 120000) {
  await page.waitForFunction(
    () =>
      window.__playtestQa?.isInInterior?.() &&
      document.querySelector('.building-panel--writings.building-panel--open'),
    { timeout },
  );
}

async function stageAtDoor(page, building) {
  await page.evaluate((name) => {
    const qa = window.__playtestQa;
    const b = qa.getEnterableBuildings().find((o) => o.name === name);
    if (!b?.door || !b?.inward) return;
    qa.setCharacterTile(b.door.x + b.inward.x, b.door.y + b.inward.y);
    qa.frameDoorForQa(name);
  }, building);
  await page.waitForTimeout(400);
}

async function enterTeresaViaDoorTouch(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  await stageAtDoor(page, 'teresa');
  const pt = await page.evaluate(() => window.__playtestQa?.doorScreenPoint?.('teresa'));
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  const entered = await waitForCharlasPanel(page, 45000).then(() => true).catch(() => false);
  if (!entered) {
    await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
    await waitForCharlasPanel(page, 20000);
  }
}

async function enterBibliotecaViaDoorTouch(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  await stageAtDoor(page, 'biblioteca');
  const pt = await page.evaluate(() => window.__playtestQa?.doorScreenPoint?.('biblioteca'));
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  const entered = await waitForBibliotecaPanel(page, 45000).then(() => true).catch(() => false);
  if (!entered) {
    await page.evaluate(() => window.__playtestQa?.enterInterior?.('biblioteca'));
    await waitForBibliotecaPanel(page, 20000);
  }
}

async function expandExperienceSheetTouch(page) {
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--open.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
}

async function alphaAboveSheet(page, tag, mode) {
  if (mode === 'charlas') await enterTeresaViaDoorTouch(page);
  else await enterBibliotecaViaDoorTouch(page);
  await expandExperienceSheetTouch(page);
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
  const shotPath = path.join(OUT, `${mode}-expanded-alpha-${tag}.png`);
  const buf = await page.screenshot({ path: shotPath, clip, type: 'png' });
  const png = PNG.sync.read(buf);
  const { pct, zero, n } = transparentFraction(png);
  const pass = pct === 0;
  record(`MED-1-${mode}-alpha`, pass, `transparent=${pct.toFixed(2)}% (${zero}/${n}) sheetTop=${sheetTop}`, tag);
}

async function stickyHeader(page) {
  await enterBibliotecaViaDoorTouch(page);
  await expandExperienceSheetTouch(page);
  await page.locator('.experience__row').first().scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const sheet = document.querySelector('.building-panel__sheet');
    if (sheet) sheet.scrollTop = sheet.scrollHeight;
  });
  await page.waitForTimeout(300);
  const visible = await page.locator('.exp-header__close').isVisible();
  const sticky = await page.evaluate(() => {
    const h = document.querySelector('.exp-header');
    if (!h) return false;
    return getComputedStyle(h).position === 'sticky';
  });
  record('LOW-A-sticky-header', visible && sticky, `closeVisible=${visible} sticky=${sticky}`, '390');
}

async function searchHidden(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('[data-action="search"]')];
    return btns.length > 0 && btns.every((b) => getComputedStyle(b).display === 'none');
  });
  record('LOW-B-search-hidden', hidden, String(hidden), '390');
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });

  if (process.env.FORGE_K9_SKIP_CHAIN !== '1') {
    const k8 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify-forge-k8.mjs'), BASE], {
      encoding: 'utf8',
    });
    if (k8.status !== 0) {
      console.error(k8.stdout || k8.stderr);
      process.exit(1);
    }
  }

  const browser = await launchBrowser(chromium);
  for (const w of [360, 390, 430]) {
    for (const mode of ['charlas', 'biblioteca']) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 844 },
        hasTouch: true,
        isMobile: true,
        locale: 'es-VE',
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      await hideWebdriver(page);
      await alphaAboveSheet(page, String(w), mode);
      await ctx.close();
    }
  }

  const lowCtx = await browser.newContext({ ...devices['iPhone 12 Pro'], locale: 'es-VE' });
  const lowPage = await lowCtx.newPage();
  await hideWebdriver(lowPage);
  await stickyHeader(lowPage);
  await searchHidden(lowPage);
  await lowCtx.close();
  await browser.close();

  console.log('\n| Forge k9 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${String(r.detail).slice(0, 72)} |`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
  console.log(`\nForge k9: ${results.length} checks PASS (+ Forge k8 chain)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
