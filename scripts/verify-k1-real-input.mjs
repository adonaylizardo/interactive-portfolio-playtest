#!/usr/bin/env node
/**
 * K1 real-input smoke (no __playtestQa tapBuildingDoor / tapScreen for actions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const SHOTS = path.join(ROOT, 'artifacts/k1-real-input');
fs.mkdirSync(SHOTS, { recursive: true });

async function consoleErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function hitTest(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.className?.toString?.() ?? el?.tagName ?? '';
    },
    { x, y },
  );
}

async function runViewport(label, width, height, touch) {
  const results = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await ctx.newPage();
  const cerr = await consoleErrors(page);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.locator('[data-action="intro-close"]').click({ timeout: 2500 }).catch(() => {});

  if (touch) {
    await page.locator('[data-action="show-panel"]').click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
  } else {
    await page.evaluate(() => window.__playtestQa?.setLayout?.('split'));
    await page.waitForTimeout(300);
  }

  const leer = page.locator('button[data-action="reading"]').first();
  const leerBox = await leer.boundingBox();
  if (leerBox) {
    const cx = leerBox.x + leerBox.width / 2;
    const cy = leerBox.y + leerBox.height / 2;
    const hit = await hitTest(page, cx, cy);
    results.push({
      id: 'B1-overlay',
      pass: !String(hit).includes('building-map-labels'),
      detail: hit,
    });
    if (touch) await page.touchscreen.tap(cx, cy);
    else await page.mouse.click(cx, cy);
    await page.waitForTimeout(600);
    const hash = await page.evaluate(() => location.hash);
    results.push({ id: 'Leer-opens-reading', pass: hash.includes('/leer'), detail: hash });
  } else {
    results.push({ id: 'Leer-opens-reading', pass: false, detail: 'no leer button' });
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const langBtn = page.locator('.chrome__lang-opt[data-lang="en"]').first();
  const lb = await langBtn.boundingBox();
  if (lb) {
    const cx = lb.x + lb.width / 2;
    const cy = lb.y + lb.height / 2;
    if (touch) await page.touchscreen.tap(cx, cy);
    else await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    const lang = await page.evaluate(() => document.documentElement.lang);
    results.push({ id: 'EN-toggle', pass: lang === 'en', detail: lang });
  }

  await page.goto(`${BASE}#/leer/bain`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const bodyLen = await page.evaluate(
    () => document.querySelector('.reading-view .case__text')?.textContent?.length ?? 0,
  );
  results.push({
    id: 'B2-case-body-mobile',
    pass: bodyLen >= 200,
    detail: `bodyLen=${bodyLen}`,
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  if (!touch) await page.evaluate(() => window.__playtestQa?.setLayout?.('split'));
  for (const building of ['volaris', 'bain', 'pg']) {
    await page.evaluate((name) => window.__playtestQa?.frameDoorForQa?.(name), building);
    await page.waitForTimeout(400);
    const doorPt = await page.evaluate((name) => window.__playtestQa?.doorScreenPoint?.(name), building);
    if (!doorPt) {
      results.push({ id: `H4-${building}-door`, pass: false, detail: 'no door point' });
      continue;
    }
    if (touch) await page.touchscreen.tap(doorPt.x, doorPt.y);
    else await page.mouse.click(doorPt.x, doorPt.y);
    await page.waitForTimeout(16000);
    const opened = await page.evaluate(() => {
      const p = document.querySelector('.building-panel');
      return !!(p?.classList.contains('building-panel--open') && p.classList.contains('building-panel--preview'));
    });
    results.push({ id: `H4-${building}-door`, pass: opened, detail: String(opened) });
    if (!opened) break;
    await page.evaluate(() => window.__playtestQa?.dismissBuildingPanel?.());
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: path.join(SHOTS, `${label}-final.png`), fullPage: false });
  await ctx.close();
  await browser.close();

  const consoleFail = cerr.filter((e) => !e.includes('WebGL') && !e.includes('preload'));
  results.push({ id: 'console', pass: consoleFail.length === 0, detail: consoleFail.join('; ') || 'ok' });
  return results.map((r) => ({ ...r, viewport: label }));
}

async function main() {
  const all = [];
  for (const [label, w, h, touch] of [
    ['390', 390, 844, true],
    ['1280', 1280, 800, false],
  ]) {
    all.push(...(await runViewport(label, w, h, touch)));
  }
  console.log('\n| Check | 390 | 1280 |');
  console.log('| --- | --- | --- |');
  const ids = [...new Set(all.map((r) => r.id))];
  for (const id of ids) {
    const a = all.find((r) => r.id === id && r.viewport === '390');
    const b = all.find((r) => r.id === id && r.viewport === '1280');
    console.log(`| ${id} | ${a?.pass ? 'PASS' : 'FAIL'} | ${b?.pass ? 'PASS' : 'FAIL'} |`);
  }
  const fail = all.filter((r) => !r.pass);
  if (fail.length) {
    for (const f of fail) console.error('FAIL', f.viewport, f.id, f.detail);
    process.exit(1);
  }
  console.log(`\nOK k1 real-input @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
