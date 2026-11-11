#!/usr/bin/env node
/**
 * Real-DOM QA: Teresa interior peek card, list expand, dismiss/reopen, pinch zoom.
 * Uses vite preview + Chromium with iPhone 390px viewport and CDP touch.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4198;
const BASE = `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function startPreview() {
  return spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT)], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

async function pinchZoom(cdp, cx, cy, spread) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 24, y: cy },
      { x: cx + 24, y: cy },
    ],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: cx - spread, y: cy },
      { x: cx + spread, y: cy },
    ],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function assertInViewport(loc) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  const vh = await loc.page().evaluate(() => window.innerHeight);
  const vw = await loc.page().evaluate(() => window.innerWidth);
  if (box.bottom > vh - 72 || box.top < 0 || box.left < 0 || box.right > vw) {
    throw new Error(
      `peek not fully in viewport: top=${box.top.toFixed(0)} bottom=${box.bottom.toFixed(0)} vh=${vh}`,
    );
  }
}

async function main() {
  const preview = startPreview();
  await wait(1200);
  const errors = [];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);

  try {
    await page.addInitScript(() => {
      sessionStorage.setItem('playtest-welcome-done', '1');
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitForQa(page);
    await page.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await page.waitForFunction(() => window.__playtestQa?.isInInterior?.() === true, null, {
      timeout: 20000,
    });
    await page.waitForSelector('.building-panel--interior-entry.building-panel--open', {
      timeout: 10000,
    });
    await wait(800);

    const peek = page.locator('.building-panel--interior-entry .interior-exp-peek__excerpt');
    await peek.waitFor({ state: 'visible', timeout: 8000 });
    const excerpt = (await peek.textContent())?.trim() ?? '';
    if (!excerpt || /placeholder/i.test(excerpt)) errors.push(`bad excerpt: ${excerpt}`);

    const expand = page.locator(
      '.building-panel--interior-entry [data-exp-peek-expand]',
    );
    await assertInViewport(expand);

    await expand.evaluate((el) => el.click());
    await page.waitForFunction(
      () => document.querySelectorAll('.building-panel--interior-entry .experience__list .experience__row').length > 0,
      null,
      { timeout: 5000 },
    );
    const rows = await page.locator('.building-panel--interior-entry .experience__row').count();
    if (rows < 3) errors.push(`expected list rows, got ${rows}`);

    await page.locator('[data-exp-mobile-close]').tap();
    await wait(400);
    const stillIn = await page.evaluate(() => window.__playtestQa.isInInterior());
    if (!stillIn) errors.push('× closed building (should only hide card)');
    const fab = page.locator('[data-exp-reopen-fab]');
    await fab.waitFor({ state: 'visible', timeout: 3000 });

    await fab.tap();
    await peek.waitFor({ state: 'visible', timeout: 3000 });

    const z0 = await page.evaluate(() => window.__playtestQa.getZoom());
    const canvas = await page.$('#game-canvas');
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await pinchZoom(cdp, cx, cy, 80);
    await wait(300);
    const z1 = await page.evaluate(() => window.__playtestQa.getZoom());
    if (Math.abs(z1 - z0) < 0.02) errors.push(`pinch did not change zoom (${z0} -> ${z1})`);
  } catch (e) {
    errors.push(e.message || String(e));
  } finally {
    await browser.close();
    preview.kill('SIGTERM');
  }

  if (errors.length) {
    console.error('test-interior-exp-peek FAIL:\n', errors.join('\n'));
    process.exit(1);
  }
  console.log('test-interior-exp-peek: ok');
}

main();
