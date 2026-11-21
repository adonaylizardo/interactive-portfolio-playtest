#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = '/opt/cursor/artifacts/e11-search-rows';

async function openSearch(page) {
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-action="search"]')?.click());
  await page.waitForSelector('.search-palette--open');
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const report = { base: BASE, checks: [], bundle: null };

try {
  for (const vp of [
    { w: 390, h: 844, tag: '390' },
    { w: 1280, h: 800, tag: '1280' },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.w < 900 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1000);
    await openSearch(page);
    await page.keyboard.type('design', { delay: 35 });
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => ({
      hits: document.querySelectorAll('.search-palette__hit').length,
      groups: [...document.querySelectorAll('.search-palette__group-label')].map((e) => e.textContent),
    }));
    report.checks.push({ id: `${vp.tag} search hit count`, pass: state.hits > 0, state });
    if (!report.bundle) {
      report.bundle = await page.evaluate(() => ({
        js: [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src),
        css: [...document.querySelectorAll('link[href*="index-"]')].map((l) => l.href),
      }));
    }
    await page.screenshot({ path: path.join(OUT, `${vp.tag}-search-design.png`) });
    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
