#!/usr/bin/env node
/**
 * Hostile QA: desktop case read view must accept real mouse (wheel, ×, expand).
 * Usage: node scripts/qa-batch-r33-case-read-mouse.mjs [baseUrl]
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
    const sheet = page.locator('.building-panel--expanded .building-panel__sheet');
    await sheet.waitFor({ state: 'visible', timeout: 10000 });
    const before = await sheet.evaluate((el) => el.scrollTop);
    const box = await sheet.boundingBox();
    if (!box) throw new Error('no sheet box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 400);
    await wait(200);
    const afterWheel = await sheet.evaluate((el) => el.scrollTop);
    if (afterWheel <= before) out.errors.push(`wheel: scrollTop ${before} -> ${afterWheel}`);
    const expandBox = await page.locator('[data-read-collapse]').first().boundingBox();
    if (!expandBox) out.errors.push('expand: no bounding box');
    else {
      await page.mouse.click(expandBox.x + expandBox.width / 2, expandBox.y + expandBox.height / 2);
      await wait(250);
      const peeked = await page.evaluate(() => document.querySelector('.building-panel--peek') !== null);
      if (!peeked) out.errors.push('expand: did not collapse read to peek after expand click');
    }
    const closeSel = '.case-preview__x, .case-read__x';
    const closeBox = await page.locator(closeSel).first().boundingBox();
    if (!closeBox) out.errors.push('close: no bounding box');
    else await page.mouse.click(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
    await wait(300);
    const closed = await page.evaluate(
      () => !document.querySelector('.building-panel--preview.building-panel--open'),
    );
    if (!closed) out.errors.push('close: × did not dismiss case read');
    out.ok = out.errors.length === 0;
    out.scrollBefore = before;
    out.scrollAfter = afterWheel;
  } finally {
    await browser.close();
  }
  return out;
}

const stop = await ensurePreview().catch(() => null);
const results = [];
for (const w of [1280, 1440]) {
  results.push(await runViewport(w, 'es'));
}
if (stop) stop();
console.log(JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok);
process.exit(bad.length ? 1 : 0);
