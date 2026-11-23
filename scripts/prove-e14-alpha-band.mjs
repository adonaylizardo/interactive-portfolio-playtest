#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE =
  process.env.PREVIEW_URL ??
  'http://127.0.0.1:4173/interactive-portfolio-playtest/preview-edificios/';

async function alphaZeroFraction(page) {
  return page.evaluate(async () => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return { error: 'no canvas' };
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return { error: 'no blob' };
    const bmp = await createImageBitmap(blob);
    const x0 = 21;
    const y0 = 0;
    const w = 369 - 21;
    const h = 230;
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext('2d');
    ctx.drawImage(bmp, x0, y0, w, h, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    let alpha0 = 0;
    const n = w * h;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) alpha0++;
    }
    return {
      alpha0Pct: (100 * alpha0) / n,
      n,
      introTop: document.querySelector('.chrome__intro')?.getBoundingClientRect().top,
      expanded: document.querySelector('.chrome__intro')?.classList.contains('chrome__intro--expanded'),
      bodyOpen: !document.querySelector('[data-sheet-body]')?.classList.contains('chrome__sheet-body--collapsed'),
    };
  });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(1500);
const before = await alphaZeroFraction(page);
await page.evaluate(() => document.querySelector('.chrome__dock [data-action="achievements"]')?.click());
await page.waitForTimeout(900);
const after = await alphaZeroFraction(page);
console.log(JSON.stringify({ before, after }, null, 2));
await browser.close();
