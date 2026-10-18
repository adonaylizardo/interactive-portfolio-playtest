#!/usr/bin/env node
/**
 * Content-agent smoke for /preview-contenido/: reading view, cases, CV, writings, map door.
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
const SHOTS = path.join(ROOT, 'artifacts/contenido-verify');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

const CASE_IDS = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];

async function consoleErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function runViewport(page, label, width, height, touch) {
  const tag = `contenido-${label}`;
  const errors = [];
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(800);

  await qa(page, () => {
    window.__playtestQa?.setLayout?.('split');
  });
  await wait(300);

  await page.locator('[data-action="reading"]').first().click();
  await wait(400);
  const list = await qa(page, () => ({
    reading: document.body.dataset.reading === '1',
    hash: location.hash,
    rows: document.querySelectorAll('.reading-view__row').length,
  }));
  if (!list.reading || !list.hash.includes('/leer')) errors.push(`${tag}: reading view not open`);
  if (list.rows < 8) errors.push(`${tag}: expected >=8 list rows, got ${list.rows}`);

  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${label}-01-leer-list.png`) });

  for (const id of CASE_IDS) {
    await page.goto(`${BASE}#/leer/${id}`, { waitUntil: 'networkidle' });
    await wait(500);
    const detail = await qa(page, (caseId) => ({
      hash: location.hash,
      title: document.querySelector('.reading-view__detail-title')?.textContent ?? '',
      bodyLen: document.querySelector('.reading-view__article')?.textContent?.length ?? 0,
    }), id);
    if (!detail.hash.includes(caseId)) errors.push(`${tag}: hash for ${id} is ${detail.hash}`);
    if (detail.bodyLen < 80) errors.push(`${tag}: case ${id} body too short (${detail.bodyLen})`);
    if (touch) {
      await page.locator('[data-back-list]').tap();
    } else {
      await page.locator('[data-back-list]').click();
    }
    await wait(300);
  }

  await page.goto(`${BASE}#/leer/volaris`, { waitUntil: 'networkidle' });
  await wait(300);
  await page.reload({ waitUntil: 'networkidle' });
  await wait(600);
  const afterReload = await qa(page, () => ({
    hash: location.hash,
    reading: document.body.dataset.reading === '1',
    hasCase: !!document.querySelector('.case__text'),
  }));
  if (!afterReload.reading || !afterReload.hash.includes('volaris')) {
    errors.push(`${tag}: deep link refresh failed (${afterReload.hash})`);
  }
  if (!afterReload.hasCase) errors.push(`${tag}: volaris case text missing after refresh`);

  await page.goto(`${BASE}#/leer/writings`, { waitUntil: 'networkidle' });
  await wait(400);
  const writingLink = page.locator('.reading-view__row--link').first();
  const href = await writingLink.getAttribute('href');
  if (!href?.includes('adonaylizardo.com/writing-database')) {
    errors.push(`${tag}: writings link missing or wrong (${href})`);
  }

  await page.locator('[data-back]').first().click();
  await wait(500);
  const onMap = await qa(page, () => ({
    reading: document.body.dataset.reading,
    canvasVis: getComputedStyle(document.getElementById('game-canvas')).visibility,
  }));
  if (onMap.reading === '1') errors.push(`${tag}: still in reading mode after back to map`);

  await qa(page, () => window.__playtestQa.enterInterior('bain'));
  await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 20000 });
  await wait(400);
  await page.screenshot({ path: path.join(SHOTS, `${label}-02-map-door.png`) });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(500);
  await qa(page, () => window.__playtestQa.setLayout('split'));
  await wait(200);
  const [cvPage] = await Promise.all([
    page.context().waitForEvent('page'),
    page.locator('a.ui-btn--primary').filter({ hasText: /CV|Descargar/ }).first().click(),
  ]);
  await cvPage.waitForLoadState('domcontentloaded');
  await wait(500);
  if (!/\.pdf/i.test(cvPage.url())) errors.push(`${tag}: CV tab URL is not PDF (${cvPage.url()})`);
  await cvPage.close();

  await page.screenshot({ path: path.join(SHOTS, `${label}-03-sidebar.png`) });

  return errors;
}

async function main() {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = await consoleErrors(page);
  const all = [];
  try {
    all.push(...(await runViewport(page, '390', 390, 844, true)));
    all.push(...(await runViewport(page, '1280', 1280, 800, false)));
  } finally {
    await ctx.close();
    await browser.close();
  }
  all.push(...pageErrors.map((e) => `console: ${e}`));
  for (const e of all) console.error(`FAIL ${e}`);
  if (all.length) process.exit(1);
  console.log(`OK contenido verify @ ${BASE}`);
  console.log(`Screenshots: ${SHOTS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
