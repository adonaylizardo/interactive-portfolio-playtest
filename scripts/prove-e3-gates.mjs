#!/usr/bin/env node
/**
 * E3 proof: top-control hit targets (elementFromPoint), phone experience chain, NPCs with webdriver masked.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:4196/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpTouchTap(page, x, y) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

function centerOf(sel) {
  return (page) =>
    page.evaluate((selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, sel);
}

async function tapOwnCenter(page, selector) {
  const pt = await centerOf(selector)(page);
  if (!pt || pt.w < 8 || pt.h < 8) return { ok: false, reason: 'missing or tiny', pt };
  const hit = await page.evaluate(({ x, y, selector }) => {
    const target = document.querySelector(selector);
    const el = document.elementFromPoint(x, y);
    return !!target && (el === target || target.contains(el));
  }, { ...pt, selector });
  return { ok: hit, pt };
}

async function proveControls(page, viewport, label) {
  await page.setViewportSize(viewport);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
  await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
  await wait(400);
  const tests = [];
  const langEn = await tapOwnCenter(page, '.chrome__lang [data-lang="en"]');
  tests.push({ test: `${label} EN`, pass: langEn.ok, ...langEn });
  const langEs = await tapOwnCenter(page, '.chrome__lang [data-lang="es"]');
  tests.push({ test: `${label} ES`, pass: langEs.ok, ...langEs });
  const mobileChrome = viewport.width < 768 || viewport.height < 500;
  if (mobileChrome) {
    const search = await tapOwnCenter(page, '.chrome__tools-phone [data-action="search"]');
    const sound = await tapOwnCenter(page, '.chrome__tools-phone [data-action="sound"]');
    tests.push({ test: `${label} Search`, pass: search.ok, ...search });
    tests.push({ test: `${label} Sound`, pass: sound.ok, ...sound });
  } else {
    const search = await tapOwnCenter(page, '.chrome__rail [data-action="search"]');
    const sound = await tapOwnCenter(page, '.chrome__tools-stack [data-action="sound"]');
    tests.push({ test: `${label} Search`, pass: search.ok, ...search });
    tests.push({ test: `${label} Sound`, pass: sound.ok, ...sound });
  }
  return tests;
}

const preview = spawn(process.execPath, ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4196' },
});
await wait(1200);

const browser = await launchBrowser(chromium);
const results = [];

try {
  const npcCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await npcCtx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => (window.__playtestQa?.npcs?.()?.npcs?.length ?? 0) > 0,
    null,
    { timeout: 60000 },
  );
  const npcs = await page.evaluate(() => ({
    webdriver: navigator.webdriver,
    count: window.__playtestQa?.npcs?.()?.npcs?.length ?? null,
  }));
  results.push({
    test: 'webdriver masked + NPCs present',
    pass: npcs.webdriver === false && typeof npcs.count === 'number' && npcs.count > 0,
    ...npcs,
  });

  for (const [label, vp] of [
    ['360×780', { width: 360, height: 780 }],
    ['390×844', { width: 390, height: 844 }],
    ['430×932', { width: 430, height: 932 }],
    ['844×390', { width: 844, height: 390 }],
    ['1280×900', { width: 1280, height: 900 }],
  ]) {
    const p = await (await browser.newContext({ viewport: vp, hasTouch: vp.width < 768 })).newPage();
    results.push(...(await proveControls(p, vp, label)));
    await p.close();
  }

  await npcCtx.close();

  const chainCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const chainPage = await chainCtx.newPage();
  await chainPage.goto(BASE, { waitUntil: 'networkidle' });
  await chainPage.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
  await chainPage.evaluate(() => window.__playtestQa.setLayout('map'));
  await wait(300);
  await chainPage.evaluate(() => window.__playtestQa.prepareDoorEntryForQa('biblioteca'));
  await wait(400);
  let pt = await chainPage.evaluate(() => window.__playtestQa.doorScreenPoint('biblioteca'));
  await chainPage.touchscreen.tap(pt.x, pt.y);
  await chainPage.waitForFunction(
    () => !!document.querySelector('.building-panel--experience.building-panel--open'),
    null,
    { timeout: 60000 },
  );
  await chainPage.locator('[data-exp-mobile-close]').click();
  await chainPage.waitForFunction(() => !window.__playtestQa.isInInterior?.(), null, { timeout: 20000 });
  await wait(500);
  await chainPage.evaluate(() => window.__playtestQa.prepareDoorEntryForQa('flor'));
  await wait(400);
  pt = await chainPage.evaluate(() => window.__playtestQa.doorScreenPoint('flor'));
  await chainPage.touchscreen.tap(pt.x, pt.y);
  await chainPage.waitForFunction(
    () => window.__playtestQa.getInteriorId?.() === 'flor',
    null,
    { timeout: 60000 },
  );
  await wait(400);
  const trap = await chainPage.evaluate(() => {
    const expOpen = document.querySelector('.building-panel--experience.building-panel--open');
    const expVisible = document.querySelector('[data-experience]:not([hidden])');
    const exit = document.querySelector('[data-exit]');
    const exitBox = exit?.getBoundingClientRect();
    const stale = !!expOpen || !!expVisible;
    let exitBlocked = false;
    if (exitBox && exitBox.width > 0) {
      const hit = document.elementFromPoint(exitBox.left + exitBox.width / 2, exitBox.top + exitBox.height / 2);
      exitBlocked = hit !== exit && !exit?.contains(hit);
    }
    return { staleExperience: stale, exitBlocked };
  });
  results.push({
    test: 'phone biblioteca × → flor (no stale experience over Salir)',
    pass: !trap.staleExperience && !trap.exitBlocked,
    ...trap,
  });
  await chainCtx.close();
} finally {
  await browser.close();
  preview.kill();
}

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);
