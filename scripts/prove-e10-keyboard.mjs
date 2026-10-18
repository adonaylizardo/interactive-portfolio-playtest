#!/usr/bin/env node
/** e10: real keyboard in search + back button on 390. */
import { chromium } from 'playwright';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';

async function waitMap(page) {
  await page.waitForFunction(() => document.querySelector('#game-canvas') && document.querySelector('.chrome'));
  await page.waitForTimeout(900);
}

const report = { base: BASE, checks: [] };

const browser = await chromium.launch();
try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await waitMap(page);
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await page.waitForTimeout(400);
    await page.evaluate(() => document.querySelector('[data-action="search"]')?.click());
    await page.waitForSelector('.search-palette--open');
    const backVisible = await page.evaluate(
      () => getComputedStyle(document.querySelector('.search-palette__back')).display !== 'none',
    );
    report.checks.push({ id: '390 search back visible', pass: backVisible });
    await page.keyboard.type('design', { delay: 40 });
    await page.waitForTimeout(500);
    const typed = await page.inputValue('.search-palette__input');
    const keys = await page.evaluate(() => ({
      walk: document.getElementById('game-canvas')?.dataset.walkGoal ?? null,
      groups: [...document.querySelectorAll('.search-palette__group-label')].map((el) => el.textContent),
    }));
    report.checks.push({
      id: '390 keyboard design full string',
      pass: typed === 'design',
      typed,
    });
    report.checks.push({
      id: '390 search design groups',
      pass: keys.groups.some((g) => g?.startsWith('Cases')),
      keys,
    });
    await page.locator('.search-palette__back').click();
    report.checks.push({
      id: '390 back closes palette',
      pass: await page.evaluate(() => !document.querySelector('.search-palette--open')),
    });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await waitMap(page);
    await page.locator('.chrome__rail [data-action="search"]').click();
    await page.waitForSelector('.search-palette--open');
    await page.keyboard.type('design', { delay: 30 });
    await page.waitForTimeout(400);
    const typed = await page.inputValue('.search-palette__input');
    report.checks.push({ id: '1280 keyboard design', pass: typed === 'design', typed });
    report.bundle = await page.evaluate(() => ({
      js: [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src),
    }));
    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
