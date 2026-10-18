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

  const measure = async (label) => {
    await page.waitForTimeout(label === '+0.9s' ? 900 : label === '+2s' ? 2000 : 5000);
    return page.evaluate(() => {
      const sheet = document.querySelector('.building-panel__sheet');
      const canvas = document.getElementById('game-canvas');
      if (!sheet || !canvas) return { error: 'missing nodes' };
      const top = sheet.getBoundingClientRect().top;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'no 2d context (preserveDrawingBuffer?)' };
      const w = canvas.width;
      const h = canvas.height;
      const scale = w / canvas.clientWidth;
      const yPx = Math.max(0, Math.floor((top / 2) * scale));
      const img = ctx.getImageData(0, 0, w, yPx);
      let transparent = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        if (img.data[i] === 0) transparent += 1;
      }
      const total = img.data.length / 4;
      return { top, alpha0Pct: total ? (transparent / total) * 100 : 0, pixels: total };
    });
  };

  const r1 = await measure('+0.9s');
  const r2 = await measure('+2s');
  const r3 = await measure('+5s');
  await browser.close();
  console.log(JSON.stringify({ r1, r2, r3 }, null, 2));
  const fail = [r1, r2, r3].some((r) => r.alpha0Pct > 50);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
