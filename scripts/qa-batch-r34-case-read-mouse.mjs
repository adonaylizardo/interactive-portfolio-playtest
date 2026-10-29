#!/usr/bin/env node
/**
 * r34/r35: desktop case read — wheel to closing, text click does not hit map,
 * Expandir → 660 column @ ~422, × closes (ES + EN).
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
const near = (a, b, tol = 12) => Math.abs(a - b) <= tol;

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
    const metrics = await sheet.evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    const box = await sheet.boundingBox();
    if (!box) throw new Error('no sheet box');
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height * 0.55, box.height - 40));
    for (let i = 0; i < 24 && metrics.scrollH > metrics.clientH + 8; i++) {
      await page.mouse.wheel(0, 500);
      await wait(80);
      const closingInView = await page.evaluate(() => {
        const el = document.querySelector('.case__closing');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = document.querySelector('.building-panel--preview.building-panel--open .building-panel__sheet');
        if (!s) return false;
        const sr = s.getBoundingClientRect();
        return r.top >= sr.top && r.bottom <= sr.bottom + 2;
      });
      if (closingInView) break;
    }
    const afterWheel = await sheet.evaluate((el) => el.scrollTop);
    const closingInView = await page.evaluate(() => {
      const el = document.querySelector('.case__closing');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = document.querySelector('.building-panel--preview.building-panel--open .building-panel__sheet');
      if (!s) return false;
      const sr = s.getBoundingClientRect();
      return r.height > 0 && r.top >= sr.top - 2 && r.bottom <= sr.bottom + 4;
    });
    if (!closingInView) {
      out.errors.push(
        `wheel: closing not in view (scrollTop ${before}→${afterWheel}, sheet ${metrics.clientH}/${metrics.scrollH})`,
      );
    }

    const mapBeforeClick = await page.evaluate(() => ({
      zoom: window.__playtestQa?.getZoom?.() ?? null,
      goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
    }));
    const textEl = page.locator('.case__text, .case-read__lede').first();
    const tb = await textEl.boundingBox();
    if (!tb) out.errors.push('click: no case text box');
    else {
      await page.mouse.click(tb.x + Math.min(40, tb.width / 2), tb.y + Math.min(20, tb.height / 2));
      await wait(200);
      const mapAfterClick = await page.evaluate(() => ({
        zoom: window.__playtestQa?.getZoom?.() ?? null,
        goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
        hit: (() => {
          const r = document.querySelector('.case__text, .case-read__lede')?.getBoundingClientRect();
          if (!r) return '';
          const el = document.elementFromPoint(r.left + 20, r.top + 10);
          return el?.id ?? el?.tagName ?? '';
        })(),
      }));
      if (mapAfterClick.goal && mapAfterClick.goal !== mapBeforeClick.goal) {
        out.errors.push(`click: walk goal changed to ${mapAfterClick.goal}`);
      }
      if (mapAfterClick.hit === 'game-canvas' || mapAfterClick.hit === 'CANVAS') {
        out.errors.push('click: elementFromPoint on case text hit the canvas (map ate the click)');
      }
    }

    const expandBtn = page.locator('.case-read__bar [data-read-collapse]').first();
    await expandBtn.waitFor({ state: 'visible', timeout: 10000 });
    await expandBtn.click();
    await wait(400);
    const column = await page.evaluate(() => document.querySelector('.building-panel--expanded') !== null);
    if (!column) out.errors.push('expand: did not open expanded column');
    else {
      const panel = await page.evaluate(() => {
        const wrap = document.querySelector('.building-panel--expanded .building-panel__body-wrap');
        const r = wrap?.getBoundingClientRect();
        return r ? { w: r.width, x: r.x } : null;
      });
      if (!panel) out.errors.push('expand: no expanded body-wrap rect');
      else {
        if (!near(panel.w, 660)) out.errors.push(`expand: column width ${Math.round(panel.w)}px (want ~660)`);
        if (width >= 1440 && !near(panel.x, 422)) {
          out.errors.push(`expand: column @ x${Math.round(panel.x)} (want ~422 at ${width}px)`);
        }
      }
    }

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
    out.scrollAfter = afterWheel;
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
