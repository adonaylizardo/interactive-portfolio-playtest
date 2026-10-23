#!/usr/bin/env node
/** MED-1: sample canvas alpha above expanded Teresa talks sheet (SwiftShader / Vulkan). */
import { chromium } from 'playwright';

const BASE =
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=vulkan', '--enable-features=Vulkan'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__playtestQa?.enterInterior === 'function', {
    timeout: 180000,
  });
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--open', { timeout: 30000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheet?.());
  await page.waitForSelector('.building-panel--expanded', { timeout: 15000 });

  const sample = () =>
    page.evaluate(() => {
      const sheet = document.querySelector('.building-panel__sheet');
      if (!sheet) return { error: 'missing sheet' };
      const top = sheet.getBoundingClientRect().top;
      const points = [];
      for (let y = 32; y < top - 8; y += 28) {
        for (let x = 32; x < 358; x += 36) {
          points.push({ x, y });
        }
      }
      const colors = window.__playtestQa?.sampleCanvasColors?.(points) ?? [];
      let alpha0 = 0;
      let n = 0;
      for (const c of colors) {
        if (!c) continue;
        n += 1;
        if (c.a === 0) alpha0 += 1;
      }
      return { top, alpha0Pct: n ? (alpha0 / n) * 100 : 100, samples: n };
    });

  await page.waitForTimeout(900);
  const r1 = await sample();
  await page.waitForTimeout(1100);
  const r2 = await sample();
  await page.waitForTimeout(3000);
  const r3 = await sample();
  await browser.close();
  console.log(JSON.stringify({ r1, r2, r3 }, null, 2));
  const fail = [r1, r2, r3].some((r) => r.alpha0Pct > 50);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
