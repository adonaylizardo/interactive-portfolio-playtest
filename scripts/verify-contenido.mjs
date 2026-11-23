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

async function runViewport(page, label, _width, _height, touch) {
  const tag = `contenido-${label}`;
  const errors = [];
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(800);

  await qa(page, () => {
    window.__playtestQa?.setLayout?.('split');
  });
  await wait(300);

  if (!touch) {
    await page.screenshot({ path: path.join(SHOTS, `${label}-00-sidebar.png`) });
  }
  await page.goto(`${BASE}#/leer`, { waitUntil: 'domcontentloaded' });
  await wait(500);
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
    const detail = await qa(
      page,
      (caseId) => ({
        hash: location.hash,
        title: document.querySelector('.reading-view__detail-title')?.textContent ?? '',
        bodyLen: document.querySelector('.reading-view__article')?.textContent?.length ?? 0,
      }),
      id,
    );
    if (!detail.hash.includes(id)) errors.push(`${tag}: hash for ${id} is ${detail.hash}`);
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
  await page.reload({ waitUntil: 'domcontentloaded' });
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

  await page.goto(`${BASE}#/leer/talks`, { waitUntil: 'networkidle' });
  await wait(400);
  const talks = await qa(page, () => ({
    rows: document.querySelectorAll('.reading-view__row--talk').length,
    podcast: document.querySelector('.reading-view__section-title')?.textContent ?? '',
    firstHref: document.querySelector('.reading-view__row--talk')?.getAttribute('href') ?? '',
  }));
  if (talks.rows < 14) errors.push(`${tag}: expected >=14 talk rows, got ${talks.rows}`);
  if (!talks.firstHref.startsWith('http')) errors.push(`${tag}: talk link missing (${talks.firstHref})`);
  await page.screenshot({ path: path.join(SHOTS, `${label}-03-talks.png`) });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(500);
  await qa(page, () => window.__playtestQa?.setLayout?.('split'));
  await wait(300);
  const logros = await qa(page, () => ({
    count: document.querySelectorAll('#chrome-logros .chrome__logro').length,
    text: document.querySelector('#chrome-logros .chrome__logro p')?.textContent ?? '',
  }));
  if (logros.count !== 4) errors.push(`${tag}: expected 4 logros, got ${logros.count}`);
  if (logros.text.includes('30+') || logros.text.includes('Coming soon') || logros.text.includes('Próximamente')) {
    errors.push(`${tag}: stale logros copy (${logros.text.slice(0, 40)})`);
  }
  if (!touch) {
    await page.screenshot({ path: path.join(SHOTS, `${label}-04-logros.png`) });
  }

  await page.goto(`${BASE}#/leer/writings`, { waitUntil: 'networkidle' });
  await wait(400);
  const writingLink = page.locator('.reading-view__row--link').first();
  const href = await writingLink.getAttribute('href');
  if (!href?.includes('adonaylizardo.com/writing-database')) {
    errors.push(`${tag}: writings link missing or wrong (${href})`);
  }

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await wait(800);
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
  const cvBtn = touch
    ? page.locator('.chrome__intro a.ui-btn--primary').filter({ hasText: /CV|Descargar/ })
    : page.locator('.chrome__column a.ui-btn--primary').filter({ hasText: /CV|Descargar/ });
  const cvHref = await cvBtn.getAttribute('href');
  if (!cvHref?.includes('cv/adonay-lizardo-cv.pdf')) {
    errors.push(`${tag}: CV href wrong (${cvHref})`);
  } else {
    const cvUrl = new URL(cvHref, BASE).toString();
    const res = await page.request.get(cvUrl);
    const type = res.headers()['content-type'] ?? '';
    if (!res.ok() || !type.includes('pdf')) {
      errors.push(`${tag}: CV fetch failed (${res.status()}, ${type})`);
    }
  }

  return errors;
}

async function main() {
  const browser = await launchBrowser(chromium);
  const all = [];
  for (const [label, width, height, touch] of [
    ['390', 390, 844, true],
    ['1280', 1280, 800, false],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    const pageErrors = await consoleErrors(page);
    try {
      all.push(...(await runViewport(page, label, width, height, touch)));
      all.push(...pageErrors.map((e) => `console-${label}: ${e}`));
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  for (const e of all) console.error(`FAIL ${e}`);
  if (all.length) process.exit(1);
  console.log(`OK contenido verify @ ${BASE}`);
  console.log(`Screenshots: ${SHOTS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
