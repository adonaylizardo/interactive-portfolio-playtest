#!/usr/bin/env node
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const BASE = 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/?r21=DBE2EkI6';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser(chromium, { headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 80; i++) {
  if (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) break;
  await wait(100);
}

async function snap(tag) {
  const s = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    return {
      cx: +j.cx.toFixed(2),
      cy: +j.cy.toFixed(2),
      mph: j.mph,
      driving: j.driving,
      goal: j.driveGoal,
      pathN: j.pathN,
      sitWhy: j.sitWhy,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      interior: r.interior,
    };
  });
  console.log(tag, JSON.stringify(s));
  return s;
}

async function spawn() {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
  });
}

for (const [from, to, delay] of [
  ['sambil', 'finoa', 800],
  ['sambil', 'mentoria', 800],
  ['flor', 'volaris', 1500],
  ['estudio', 'pg', 800],
]) {
  console.log('\n=== QA', from, '→', to, '===');
  await spawn();
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(0.12);
  }, from);
  const a = await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), from);
  console.log('first', a);
  await snap('t0');
  await wait(delay);
  await snap('pre2');
  const b = await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), to);
  console.log('second', b);
  await snap('t2');
  for (const t of [2000, 5000, 10000]) {
    await wait(t === 2000 ? 2000 : t - (t === 5000 ? 2000 : 5000));
    await snap(`t${t}`);
  }
}

await browser.close();
