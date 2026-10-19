#!/usr/bin/env node
/**
 * K2 real-input checks (N1 top controls, experience copy, history M6, writings, placeholders).
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
const SHOTS = path.join(ROOT, 'artifacts/k2-real-input');
fs.mkdirSync(SHOTS, { recursive: true });

async function hitTest(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return '';
      const lang = el.closest?.('.chrome__lang-opt');
      if (lang) return `lang-${lang.getAttribute('data-lang')}`;
      const act = el.closest?.('[data-action]');
      if (act) return act.getAttribute('data-action') ?? act.className;
      return el.className?.toString?.() ?? el.tagName;
    },
    { x, y },
  );
}

async function tapTopControls(page, touch, label) {
  const results = [];
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const sheetOpen = await page.locator('.chrome--sheet').count();
  if (!sheetOpen && touch) {
    await page.locator('[data-dock="intro"]').click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const sound = page.locator('.chrome__tools-phone [data-action="sound"]').first();
  const center = page.locator('.chrome__tools-phone [data-action="center"]').first();
  const en = page.locator('.chrome > .chrome__lang .chrome__lang-opt[data-lang="en"]');
  const es = page.locator('.chrome > .chrome__lang .chrome__lang-opt[data-lang="es"]');
  for (const [id, loc] of [
    ['sound', sound],
    ['center', center],
    ['EN', en],
    ['ES', es],
  ]) {
    const box = await loc.boundingBox();
    if (!box) {
      results.push({ id: `N1-${id}`, pass: false, detail: 'no box', viewport: label });
      continue;
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const hit = await hitTest(page, cx, cy);
    const overlapFail =
      (id === 'sound' || id === 'center') && hit.startsWith('lang-');
    const langBefore = await page.evaluate(() => document.documentElement.lang);
    if (touch) await page.touchscreen.tap(cx, cy);
    else await page.mouse.click(cx, cy);
    await page.waitForTimeout(350);
    const langAfter = await page.evaluate(() => document.documentElement.lang);
    const langOk =
      id === 'EN'
        ? langAfter === 'en'
        : id === 'ES'
          ? langAfter === 'es'
          : langAfter === langBefore;
    results.push({
      id: `N1-${id}`,
      pass: !overlapFail && langOk,
      detail: `hit=${hit} lang ${langBefore}->${langAfter}`,
      viewport: label,
    });
  }
  await page.screenshot({ path: path.join(SHOTS, `${label}-top-controls.png`) });
  return results;
}

async function experienceCopy(page, label) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  if (label === '1280') {
    await page.evaluate(() => window.__playtestQa?.setLayout?.('split'));
    await page.waitForTimeout(300);
  }
  const texts = await page.evaluate(() =>
    [...document.querySelectorAll('.chrome__exp-meta span[data-i18n]')].map((el) => el.textContent),
  );
  const joined = texts.join('|');
  const pass =
    joined.includes('talPor') &&
    !joined.includes('LoremLabs') &&
    !joined.includes('Product Strategist · Volaris') &&
    joined.includes('Senior UX/UI Designer');
  return { id: 'M-exp-CV', pass, detail: joined.slice(0, 120), viewport: label };
}

async function historyM6(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__playtestQa?.setLayout?.('split'));
  const leer = page.locator('.chrome__column button[data-action="reading"]');
  await leer.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('volaris'));
  await page.waitForTimeout(8000);
  await page.goBack();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__playtestQa?.dismissBuildingPanel?.());
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(400);
  await page.goForward();
  await page.waitForTimeout(600);
  const st = await page.evaluate(() => ({
    layout: document.body.dataset.layout,
    reading: document.body.dataset.reading,
    panelOpen: document.querySelector('.building-panel--open') !== null,
    canvasVis: getComputedStyle(document.getElementById('game-canvas')).visibility,
  }));
  const pass =
    st.reading !== '1' &&
    st.layout !== 'panel' &&
    !st.panelOpen &&
    st.canvasVis !== 'hidden';
  return { id: 'M6-history-forward', pass, detail: JSON.stringify(st), viewport: '1280' };
}

async function placeholderBain(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__playtestQa?.setLayout?.('split');
    window.__playtestQa?.tapBuildingDoor?.('bain');
  });
  await page.waitForTimeout(10000);
  const txt = await page.evaluate(
    () => document.querySelector('.case-read__hero-label')?.textContent ?? '',
  );
  return { id: 'M1-bain-hero', pass: !/IMAGE PLACEHOLDER/i.test(txt), detail: txt || '(empty)', viewport: '1280' };
}

async function langPersist(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const pt = await page.evaluate(() => {
    const btn = document.querySelector('.chrome > .chrome__lang [data-lang="en"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const lang = await page.evaluate(() => document.documentElement.lang);
  return { id: 'L-lang-persist', pass: lang === 'en', detail: lang, viewport: '390' };
}

async function main() {
  const all = [];
  const browser = await launchBrowser(chromium);
  for (const [label, w, h, touch] of [
    ['390', 390, 844, true],
    ['360', 360, 844, true],
    ['430', 430, 844, true],
    ['844x390', 844, 390, true],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await ctx.newPage();
    all.push(...(await tapTopControls(page, touch, label)));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    all.push(await experienceCopy(page, '1280'));
    all.push(await placeholderBain(page));
    all.push(await historyM6(page));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    all.push(await langPersist(page));
    all.push(await experienceCopy(page, '390'));
    await ctx.close();
  }
  await browser.close();

  console.log('\n| Check | Pass | Detail |');
  console.log('| --- | --- | --- |');
  for (const r of all) {
    console.log(`| ${r.viewport} ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`);
  }
  const fail = all.filter((r) => !r.pass);
  if (fail.length) {
    console.error('\nFailed', fail.length);
    process.exit(1);
  }
  console.log(`\nOK k2 @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
