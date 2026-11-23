#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/about-ui-gate');
fs.mkdirSync(OUT, { recursive: true });

async function dismissWelcome(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* ignore */
    }
  });
}

async function capture(page, name, selector) {
  const el = page.locator(selector);
  await el.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForTimeout(300);
  await el.screenshot({ path: path.join(OUT, name) });
}

async function runViewport(browser, vp, file) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.width <= 430 ? 3 : 1,
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  await dismissWelcome(page);
  await page.goto(`${BASE}#/leer/estudio`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.reading-view:not([hidden])', { timeout: 120000 });
  await page.waitForSelector('.reading-about__contact', { timeout: 30000 });
  const mailto = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')),
  );
  const badEmail = mailto.some((h) => h?.includes('hello@adonaylizardo.com'));
  if (badEmail) throw new Error('hello@ still present');
  if (!mailto.some((h) => h === 'mailto:adolizardo@gmail.com')) {
    throw new Error('missing adolizardo@gmail.com mailto');
  }
  await capture(page, file, '.reading-view__scroll');
  await page.goto(`${BASE}#/leer/estudio#finding-my-creative-spark`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#finding-my-creative-spark', { timeout: 30000 });
  const anchorOk = await page.evaluate(() => {
    const el = document.getElementById('finding-my-creative-spark');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < 200;
  });
  if (!anchorOk) console.warn('anchor scroll may be off on', file);
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  await runViewport(browser, { width: 390, height: 844 }, 'telefono-vertical_leer.png');
  await runViewport(browser, { width: 1280, height: 800 }, 'desktop_leer.png');
  await browser.close();
  console.log('Captures →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
