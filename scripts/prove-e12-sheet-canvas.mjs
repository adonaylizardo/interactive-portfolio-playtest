#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = '/opt/cursor/artifacts/e12-sheet-canvas';

async function bundle(page) {
  return page.evaluate(() => ({
    js: [...document.querySelectorAll('script[src*="index-"]')].map((s) => s.src),
    css: [...document.querySelectorAll('link[href*="index-"]')].map((l) => l.href),
    deployRev: document.querySelector('meta[name="deploy-rev"]')?.getAttribute('content') ?? null,
  }));
}

async function mapPaintsAboveSheet(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const intro = document.querySelector('.chrome__intro')?.getBoundingClientRect();
    if (!canvas || !intro) return { pass: false, reason: 'missing nodes' };
    const mapTop = Number(canvas.dataset.mapTop ?? NaN);
    const fitTop = Number(canvas.dataset.fitTop ?? NaN);
    const gap = intro.top - mapTop;
    return {
      pass: Number.isFinite(mapTop) && mapTop <= fitTop + 24 && gap < intro.top * 0.35,
      mapTop,
      fitTop,
      sheetTop: intro.top,
    };
  });
}

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const report = { base: BASE, checks: [], bundle: null };

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1200);
    report.bundle = await bundle(page);
    const intro = await page.evaluate(() => {
      const el = document.querySelector('.chrome__intro');
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    });
    report.checks.push({ id: '844 intro rail width', pass: intro?.w != null && intro.w <= 380, intro });
    const closeBox = await page.locator('[data-action="intro-close"]').boundingBox();
    await page.touchscreen.tap(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await page.waitForTimeout(400);
    const layout = await page.evaluate(() => document.body.dataset.layout);
    report.checks.push({ id: '844 intro close tap', pass: layout === 'map', layout });
    await page.screenshot({ path: path.join(OUT, '844-intro-closed.png') });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(1000);
    await page.evaluate(() =>
      document.querySelector('.chrome__dock [data-action="achievements"]')?.click(),
    );
    await page.waitForTimeout(800);
    const hole = await mapPaintsAboveSheet(page);
    const tags = await page.evaluate(() => ({
      visible: [...document.querySelectorAll('.name-label')].filter((e) => !e.hidden).length,
      labelsHidden: document.querySelector('.name-labels')?.hidden ?? false,
    }));
    report.checks.push({ id: '390 logros canvas hole', pass: hole.pass, hole });
    report.checks.push({
      id: '390 logros name tags',
      pass: tags.labelsHidden || tags.visible === 0,
      tags,
    });
    await page.screenshot({ path: path.join(OUT, '390-logros-sheet.png') });
    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
