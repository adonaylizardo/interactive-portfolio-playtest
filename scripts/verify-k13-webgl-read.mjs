#!/usr/bin/env node
/** MED-2: WebGL off → Read instead must not throw (0 pageerrors). */
import { chromium } from 'playwright';

const BASE =
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

async function runViewport(width, height) {
  const browser = await chromium.launch({
    args: ['--disable-webgl', '--disable-webgl2'],
  });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  page.setDefaultTimeout(120000);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#fatal-state', { timeout: 60000 });
  const read = page.locator('.fatal-state__btn--primary, .fatal-state__btn--ghost').last();
  await read.click();
  await page.waitForTimeout(800);
  await page.waitForFunction(() => location.hash.includes('/leer'), { timeout: 15000 }).catch(() => {});
  await browser.close();
  return { width, height, errors };
}

async function main() {
  const results = [];
  for (const vp of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    results.push(await runViewport(vp.width, vp.height));
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.errors.length)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
