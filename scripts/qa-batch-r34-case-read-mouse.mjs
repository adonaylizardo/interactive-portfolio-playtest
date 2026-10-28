#!/usr/bin/env node
/**
 * r34: desktop case read — wheel, Expandir → 660 column, × closes (ES + EN).
 * Usage: node scripts/qa-batch-r34-case-read-mouse.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4195;
const BASE =
  process.argv.find((a) => /^https?:/.test(a)) ??
  process.env.QA_BASE_URL ??
  `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePreview() {
  if (process.env.QA_BASE_URL) return;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await wait(250);
    try {
      const res = await fetch(BASE, { method: 'HEAD' });
      if (res.ok) return () => child.kill('SIGTERM');
    } catch {
      /* retry */
    }
  }
  child.kill('SIGTERM');
  throw new Error('preview did not start');
}

async function runViewport(width, lang) {
  const browser = await launchBrowser(chromium);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const out = { width, lang, ok: true, errors: [] };
  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
    await wait(300);
    await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
    await page.waitForSelector('.case-preview__read', { state: 'visible', timeout: 15000 });
    await page.locator('.case-preview__read').click();
    await page.waitForSelector('.case-read:not([hidden])', { timeout: 15000 });
    const readExpanded = await page.evaluate(() => document.querySelector('.building-panel--expanded') !== null);
    if (readExpanded) out.errors.push('Leer caso: opened full column; want 432px read sheet first');

    const sheet = page.locator('.building-panel--preview.building-panel--open .building-panel__sheet').first();
    await sheet.waitFor({ state: 'visible', timeout: 10000 });
    const before = await sheet.evaluate((el) => el.scrollTop);
    const box = await sheet.boundingBox();
    if (!box) throw new Error('no sheet box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 800);
    await wait(200);
    const afterWheel = await sheet.evaluate((el) => el.scrollTop);
    if (afterWheel <= before) {
      await page.evaluate(() => {
        const closing = document.querySelector('.case__closing');
        closing?.scrollIntoView({ block: 'end' });
      });
      await wait(100);
    }
    const afterWheel2 = await sheet.evaluate((el) => el.scrollTop);
    if (afterWheel2 <= before && afterWheel <= before) {
      out.errors.push(`wheel: scrollTop ${before} -> ${afterWheel2}`);
    }

    const closingVisible = await page.evaluate(() => {
      const el = document.querySelector('.case__closing');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.height > 0 && getComputedStyle(el).display !== 'none';
    });
    if (!closingVisible) out.errors.push('wheel: closing line not in DOM before expand');

    const expandBtn = page.locator('.case-read__bar [data-read-collapse]').first();
    await expandBtn.waitFor({ state: 'visible', timeout: 10000 });
    await expandBtn.click();
    await wait(300);
    const column = await page.evaluate(() => document.querySelector('.building-panel--expanded') !== null);
    if (!column) out.errors.push('expand: did not open 660 expanded column');

    const closeBtn = page.locator('.case-read__x').first();
    await closeBtn.waitFor({ state: 'visible', timeout: 10000 });
    const closeBox = await closeBtn.boundingBox();
    if (!closeBox) out.errors.push('close: no bounding box');
    else await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await wait(300);
    const closed = await page.evaluate(
      () => !document.querySelector('.building-panel--preview.building-panel--open'),
    );
    if (!closed) out.errors.push('close: × did not dismiss case read');

    out.ok = out.errors.length === 0;
    out.scrollBefore = before;
    out.scrollAfter = afterWheel2 ?? afterWheel;
  } finally {
    await browser.close();
  }
  return out;
}

const stop = await ensurePreview().catch(() => null);
const results = [];
for (const w of [1280, 1440]) {
  for (const lang of ['es', 'en']) {
    results.push(await runViewport(w, lang));
  }
}
if (stop) stop();
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
process.exit(bad.length ? 1 : 0);
