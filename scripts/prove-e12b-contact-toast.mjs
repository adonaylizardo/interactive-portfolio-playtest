#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';

const browser = await chromium.launch();
const report = { base: BASE, checks: [] };

try {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-action="contact"]')?.click());
  await page.waitForTimeout(800);
  const state = await page.evaluate(() => {
    const sub = document.querySelector('.chrome__subtitle');
    const sheet = document.querySelector('.about-panel__sheet');
    const contact = document.getElementById('about-contact');
    if (!sub || !sheet || !contact) return { pass: false, reason: 'missing el' };
    const sr = sub.getBoundingClientRect();
    const sheetR = sheet.getBoundingClientRect();
    const cr = contact.getBoundingClientRect();
    const midX = sr.left + sr.width / 2;
    const topEl = document.elementsFromPoint(midX, sr.top + sr.height / 2)[0];
    return {
      pass:
        sr.left + sr.width < sheetR.left - 4 &&
        Number(getComputedStyle(sub).zIndex) >= 70 &&
        !topEl?.classList.contains('about-panel__sheet') &&
        cr.bottom <= sheetR.bottom + 2,
      subRect: { x: sr.x, y: sr.y, w: sr.width, h: sr.height, z: getComputedStyle(sub).zIndex },
      sheetRect: { x: sheetR.x, w: sheetR.width, bottom: sheetR.bottom },
      contactBottom: cr.bottom,
      topHit: topEl?.className ?? null,
      scrollTop: document.querySelector('.about-panel__scroll')?.scrollTop ?? 0,
    };
  });
  report.checks.push({ id: '844 contact toast + scroll', ...state });
  await page.screenshot({ path: '/opt/cursor/artifacts/e12b-844-contact.png', fullPage: false });
  await ctx.close();
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
