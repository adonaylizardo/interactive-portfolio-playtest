#!/usr/bin/env node
/** Phone: welcome → Empezar → Sambil ficha — intro sheet must not stack behind ficha. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const OUT = '/tmp/ficha-mobile-intro';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
try {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.boot-flow--welcome', { timeout: 180000 });
  await page.locator('[data-boot-start]').click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.openPlaceCard, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__playtestQa.openPlaceCard('sambil'));
  await page.waitForSelector('.place-card--open');
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const intro = document.querySelector('.chrome__intro');
    const introStyle = intro ? getComputedStyle(intro) : null;
    const chrome = document.querySelector('.chrome');
    return {
      layout: document.body.dataset.layout,
      chromeSheet: chrome?.classList.contains('chrome--sheet'),
      introVisible:
        intro &&
        introStyle?.visibility !== 'hidden' &&
        introStyle?.display !== 'none' &&
        intro.getBoundingClientRect().height > 40,
      placeOpen: !!document.querySelector('.place-card--open'),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'sambil-ficha-after-empezar.png'), fullPage: true });
  const errors = [];
  if (state.chromeSheet) errors.push('chrome--sheet still active with ficha open');
  if (state.introVisible) errors.push('chrome__intro still visible behind ficha');
  if (state.layout !== 'map') errors.push(`expected data-layout=map, got ${state.layout}`);
  console.log(JSON.stringify({ state, shot: path.join(OUT, 'sambil-ficha-after-empezar.png') }, null, 2));
  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('qa-ficha-mobile-intro: ok');
} finally {
  await ctx.close();
  await browser.close();
}
