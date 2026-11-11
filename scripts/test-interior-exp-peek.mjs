#!/usr/bin/env node
/**
 * Real-DOM QA: interior peek, list back, dismiss/reopen, pinch zoom, post-exit door grace.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = Number(process.env.QA_PREVIEW_PORT) || 4198;
const GLOBAL_TIMEOUT_MS = 120_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function resolvePreviewBase() {
  if (process.env.QA_BASE_URL) {
    return process.env.QA_BASE_URL.replace(/\/?$/, '/');
  }
  const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
  const m = html.match(/<base\s+href="([^"]+)"/i);
  const basePath = m?.[1] ?? '/';
  return `http://127.0.0.1:${PREVIEW_PORT}${basePath}`;
}

function startPreview(basePath) {
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', `--port=${PREVIEW_PORT}`, '--base', base],
    { cwd: ROOT, stdio: 'ignore' },
  );
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
  const timeout = setTimeout(() => {
    console.error(`test-interior-exp-peek: global timeout ${GLOBAL_TIMEOUT_MS}ms`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);

  const BASE = resolvePreviewBase();
  const basePath = new URL(BASE).pathname;
  const preview = startPreview(basePath);
  await wait(1500);
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
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForQa(page);
    await page.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await page.waitForFunction(() => window.__playtestQa?.isInInterior?.() === true, null, {
      timeout: 20_000,
    });
    await page.waitForSelector('.building-panel--interior-entry.building-panel--open', {
      timeout: 10_000,
    });
    await wait(600);

    const backBtn = page.locator('[data-exp-mobile-back]');
    if (await backBtn.isVisible()) {
      errors.push('back visible on interior peek (should be hidden)');
    }

    const peek = page.locator('.building-panel--interior-entry .interior-exp-peek__excerpt');
    await peek.waitFor({ state: 'visible', timeout: 8000 });
    const excerpt = (await peek.textContent())?.trim() ?? '';
    if (!excerpt || /placeholder/i.test(excerpt)) errors.push(`bad excerpt: ${excerpt}`);

    const expand = page.locator('.building-panel--interior-entry [data-exp-peek-expand]');
    await assertInViewport(expand);
    await expand.evaluate((el) => el.click());
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.building-panel--interior-entry .experience__list .experience__row')
          .length > 0,
      null,
      { timeout: 5000 },
    );

    const dupIntro = await page
      .locator('.building-panel--interior-entry .experience__intro:not([hidden])')
      .count();
    if (dupIntro > 0) errors.push('duplicate experience intro on expanded sheet');

    const backVisible = await backBtn.isVisible();
    if (backVisible) {
      await backBtn.evaluate((el) => el.click());
      await wait(400);
      const stillIn = await page.evaluate(() => window.__playtestQa.isInInterior());
      if (!stillIn) errors.push('‹ on expanded list exited building');
      const peekAgain = await page.locator('[data-exp-peek-expand]').isVisible();
      if (!peekAgain) errors.push('‹ did not return to peek');
    } else {
      errors.push('back not visible on expanded list');
    }

    await expand.evaluate((el) => el.click());
    await wait(300);
    await page.locator('[data-exp-mobile-close]').tap();
    await wait(400);
    if (!(await page.evaluate(() => window.__playtestQa.isInInterior()))) {
      errors.push('× closed building');
    }
    await page.locator('[data-exp-reopen-fab]').waitFor({ state: 'visible', timeout: 3000 });

    await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
    await page.waitForFunction(() => window.__playtestQa.isInInterior() === false, null, {
      timeout: 10_000,
    });
    await wait(900);
    const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('teresa'));
    if (pt) {
      await page.evaluate(([x, y]) => window.__playtestQa.tapScreen(x, y), [pt.x, pt.y]);
    }
    await wait(4000);
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
      errors.push('re-entered teresa during exit grace');
    }

    await page.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await wait(500);
    const z0 = await page.evaluate(() => window.__playtestQa.getZoom());
    const canvas = await page.$('#game-canvas');
    const box = await canvas.boundingBox();
    await pinchZoom(cdp, box.x + box.width / 2, box.y + box.height / 2, 80);
    await wait(300);
    const z1 = await page.evaluate(() => window.__playtestQa.getZoom());
    if (Math.abs(z1 - z0) < 0.02) errors.push(`pinch did not change zoom (${z0} -> ${z1})`);

    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const dPage = await desk.newPage();
    await dPage.addInitScript(() => sessionStorage.setItem('playtest-welcome-done', '1'));
    await dPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForQa(dPage);
    await dPage.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await dPage.waitForSelector('.building-panel--interior-entry.building-panel--open', {
      timeout: 10_000,
    });
    await wait(400);
    if (await dPage.locator('.interior-exp-peek').isVisible()) {
      errors.push('desktop 1280: interior-exp-peek strip must be hidden');
    }
    const header = dPage.locator('.building-panel--interior-entry .exp-header');
    const headerBox = await header.boundingBox();
    const intro = dPage.locator('.building-panel--interior-entry .experience__intro');
    const introBox = await intro.boundingBox();
    if (headerBox && headerBox.top < 2) {
      const peekStrip = await dPage.locator('.interior-exp-peek').boundingBox();
      if (peekStrip && peekStrip.top < headerBox.bottom) {
        errors.push('desktop: peek overlays header');
      }
    }
    if (headerBox && introBox && introBox.y < headerBox.y) {
      errors.push('desktop: experience intro above exp-header');
    }
    await desk.close();
  } catch (e) {
    errors.push(e.message || String(e));
  } finally {
    clearTimeout(timeout);
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
