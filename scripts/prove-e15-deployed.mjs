#!/usr/bin/env node
/**
 * e15 deployed proof on /preview-edificios/ (GitHub Pages).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE =
  process.env.PREVIEW_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = process.env.E15_OUT ?? '/opt/cursor/artifacts/e15-deployed';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const report = { base: BASE, shots: [] };

async function shot(page, name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  report.shots.push(p);
  return p;
}

{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('[data-action="about-contact"]')?.click());
  await page.waitForSelector('.about-panel--open', { timeout: 20000 });
  await shot(page, '844-about-open');
  const close = page.locator('[data-about-close]').first();
  const closeBox = await close.boundingBox();
  if (closeBox) {
    const cx = closeBox.x + closeBox.width / 2;
    const cy = closeBox.y + closeBox.height / 2;
    const hit = await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest?.('[data-about-close], .about-panel__close'),
      { x: cx, y: cy },
    );
    report.aboutCloseHit = hit;
    await close.click();
    await page.waitForTimeout(500);
    report.aboutClosed = !(await page.evaluate(() => document.body.classList.contains('about-panel-open')));
  }
  await shot(page, '844-about-after-close');
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  const intro = page.locator('.chrome__intro');
  report.introOverflow = await intro.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    delta: el.scrollHeight - el.clientHeight,
  }));
  await shot(page, '844-intro');
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator('.chrome__rail [data-action="contact"]').click();
  await page.waitForTimeout(1500);
  const sub = page.locator('#voice-subtitle');
  await sub.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  report.toast = await sub.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const viewBtn = document.querySelector('[data-view="isometrica"]');
    const vb = viewBtn?.getBoundingClientRect();
    return {
      width: r.width,
      overlapsView: vb && r.right > vb.left - 4 && r.bottom > vb.top - 4 && r.top < vb.bottom + 4,
    };
  });
  await shot(page, '1280-contact-toast');
  await ctx.close();
}

{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.locator('[data-action="search"]').click();
  await page.waitForSelector('.search-panel--open, .search-sheet--open', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, '1280-search-chips');
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
