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
  let basePath = '/';
  const viteConfig = readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');
  const cfg = viteConfig.match(/base:\s*['"]([^'"]+)['"]/);
  if (cfg?.[1]) basePath = cfg[1];
  else {
    const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
    const m = html.match(/<base\s+href="([^"]+)"/i);
    if (m?.[1]) basePath = m[1];
  }
  if (!basePath.endsWith('/')) basePath += '/';
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
    const enterId = await page.evaluate(() => window.__playtestQa.getInteriorId?.());
    if (enterId !== 'teresa') errors.push(`enter interior id ${enterId}`);
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
    if (await page.locator('.interior-exp-peek__title:visible').count()) {
      errors.push('duplicate title: peek strip title visible on expanded sheet');
    }

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

    const gracePack = await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const wasIn = window.__playtestQa.isInInterior();
      const beforeId = window.__playtestQa.getInteriorId?.();
      const canvasInterior = document.getElementById('game-canvas')?.dataset.interior ?? '';
      window.__playtestQa.leaveInteriorNow();
      const leaveAt = window.__playtestQa.doorGraceSnapshot?.()?.leaveGraceAt ?? 0;
      const tapAt = leaveAt + 750;
      while (leaveAt > 0 && performance.now() < tapAt) {
        /* wall-clock spin — timers drift under Playwright load */
      }
      const tapNow = performance.now();
      const graceActive = leaveAt > 0 && tapNow < leaveAt + 1500;
      let tapped = false;
      if (graceActive) {
        const pt = window.__playtestQa.doorScreenPoint('teresa');
        if (pt) {
          window.__playtestQa.tapScreen(pt.x, pt.y);
          tapped = true;
        }
      }
      return {
        wasIn,
        beforeId,
        canvasInterior,
        leaveAt,
        now: tapNow,
        graceActive,
        tapped,
        grace: window.__playtestQa.doorGraceSnapshot?.(),
        canvasGrace: document.getElementById('game-canvas')?.dataset.doorGraceId ?? null,
      };
    });
    if (!gracePack.leaveAt) {
      errors.push(`missing leaveGraceAt after exit: ${JSON.stringify(gracePack)}`);
    }
    if (!gracePack.wasIn) errors.push('not inside building before grace leave');
    if (!gracePack.beforeId && !gracePack.canvasInterior) {
      errors.push(
        `no interior id before leave (beforeId=${gracePack.beforeId} canvas=${gracePack.canvasInterior})`,
      );
    }
    if (
      gracePack.grace?.graceId !== 'teresa' &&
      gracePack.canvasGrace !== 'teresa'
    ) {
      errors.push(`exit grace not armed: ${JSON.stringify(gracePack)}`);
    }
    if (!gracePack.graceActive || !gracePack.tapped) {
      errors.push(`grace door tap failed: ${JSON.stringify(gracePack)}`);
    }
    await wait(4000);
    if (gracePack.graceActive && (await page.evaluate(() => window.__playtestQa.isInInterior()))) {
      const snap = await page.evaluate(() => window.__playtestQa.doorGraceSnapshot?.());
      errors.push(`re-entered teresa during exit grace ${JSON.stringify(snap ?? {})}`);
    }

    await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__playtestQa.enterInterior('teresa');
      await delay(400);
      window.__playtestQa.leaveInteriorNow();
      const t0 = Number(document.getElementById('game-canvas')?.dataset.leaveGraceAt ?? 0);
      while (t0 > 0 && performance.now() < t0 + 2500) {
        await delay(20);
      }
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const ptAfterGrace = await page.evaluate(() => window.__playtestQa.doorScreenPoint('teresa'));
    if (ptAfterGrace) {
      await page.evaluate(([x, y]) => window.__playtestQa.tapScreen(x, y), [ptAfterGrace.x, ptAfterGrace.y]);
    }
    try {
      await page.waitForFunction(() => window.__playtestQa.isInInterior() === true, null, {
        timeout: 22_000,
      });
    } catch {
      errors.push('single door tap after grace did not enter (throttled CPU)');
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
    await wait(300);

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
    if (await dPage.locator('.ui-view[data-view="cenital"]').isVisible()) {
      errors.push('desktop: cenital toggle should be hidden');
    }
    const listOpen = dPage.locator('[data-exp-interior-list-open]');
    await listOpen.waitFor({ state: 'visible', timeout: 5000 });
    await listOpen.click();
    await wait(400);
    const rowCount = await dPage.locator('.building-panel--interior-entry .experience__list .experience__row').count();
    if (rowCount < 14) errors.push(`desktop list expected 14 rows, got ${rowCount}`);
    const deskBack = dPage.locator('[data-exp-back]');
    if (await deskBack.isVisible()) {
      await deskBack.click();
      await wait(350);
      if (!(await dPage.evaluate(() => window.__playtestQa.isInInterior()))) {
        errors.push('desktop ‹ on list exited building');
      }
      if (!(await listOpen.isVisible())) errors.push('desktop ‹ did not return to excerpt peek');
    } else {
      errors.push('desktop ‹ missing on expanded list');
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
