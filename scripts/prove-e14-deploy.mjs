#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = '/opt/cursor/artifacts/e14-deploy';

function alphaBandPng(png, x0 = 21, y0 = 0, x1 = 369, y1 = 230) {
  let a0 = 0;
  const n = (x1 - x0) * (y1 - y0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (x >= png.width || y >= png.height) continue;
      const i = (png.width * y + x) * 4;
      if (png.data[i + 3] === 0) a0++;
    }
  }
  return { alpha0Pct: n ? (100 * a0) / n : 100, n, a0 };
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { base: BASE, bundle: null, checks: [] };

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    report.bundle = await page.evaluate(() => ({
      js: [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src),
      css: [...document.querySelectorAll('link[href*="index-"]')].map((l) => l.href),
      deployRev: document.querySelector('meta[name="deploy-rev"]')?.getAttribute('content') ?? null,
    }));
    await page.evaluate(() => document.querySelector('.chrome__dock [data-action="achievements"]')?.click());
    await page.waitForTimeout(900);
    const introTop = await page.evaluate(
      () => document.querySelector('.chrome__intro')?.getBoundingClientRect().top ?? 0,
    );
    const canvasPng = Buffer.from(
      await page.locator('#game-canvas').screenshot({ type: 'png', omitBackground: true }),
    );
    await writeFile(`${OUT}/390-logros-canvas-band.png`, canvasPng);
    const band = alphaBandPng(PNG.sync.read(canvasPng));
    report.checks.push({
      id: '390 logros map band alpha-0',
      pass: band.alpha0Pct < 5,
      introTop,
      band,
    });
    await ctx.close();
  }

  for (const [label, vp] of [
    ['390', { width: 390, height: 844, touch: true }],
    ['844', { width: 844, height: 390, touch: true }],
    ['1280', { width: 1280, height: 800, touch: false }],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1000);
    if (label !== '1280') {
      await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
      await page.waitForTimeout(400);
    }
    const sel =
      label === '1280'
        ? '.chrome__rail [data-action="contact"]'
        : '.chrome__dock [data-action="contact"], .chrome__dock [data-action="contact"]';
    const btn = page.locator(label === '1280' ? '.chrome__rail [data-action="contact"]' : '.chrome__dock [data-action="contact"]');
    const box = await btn.boundingBox();
    if (box) {
      if (vp.touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    await page.waitForTimeout(800);
    const toastAt2 = await page.evaluate(() => {
      const sub = document.getElementById('voice-subtitle');
      const r = sub?.getBoundingClientRect();
      return { text: sub?.textContent ?? '', hidden: sub?.hidden ?? true, rect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null };
    });
    await page.screenshot({ path: `${OUT}/${label}-toast-2s.png` });
    await page.waitForTimeout(4500);
    const toastAt6 = await page.evaluate(() => {
      const sub = document.getElementById('voice-subtitle');
      const text = sub?.textContent ?? '';
      const contact = /Hablemos|talk/i.test(text);
      return {
        text,
        hidden: sub?.hidden ?? true,
        empty: !text.trim(),
        stillContact: contact,
      };
    });
    await page.screenshot({ path: `${OUT}/${label}-toast-6s.png` });
    report.checks.push({
      id: `${label} toast placement@2s`,
      pass: toastAt2.text.length > 4 && !toastAt2.hidden,
      toastAt2,
    });
    report.checks.push({
      id: `${label} toast gone@6s`,
      pass: toastAt6.empty || toastAt6.hidden || !toastAt6.stillContact,
      toastAt6,
    });
    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
