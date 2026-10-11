import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = '/opt/cursor/artifacts/screenshots';
const STORAGE_KEY = 'playtest-checklist-v3';
const TILE_W = 128;
const TILE_H = 64;

const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tileToScreen(page, tx, ty) {
  return page.evaluate(
    ({ tx, ty, TILE_W, TILE_H }) => {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const wx = (tx - ty) * (TILE_W / 2);
      const wy = (tx + ty) * (TILE_H / 2);
      const camPx = Number(canvas.dataset.camPx ?? 0);
      const camPy = Number(canvas.dataset.camPy ?? 0);
      const zoom = Number(canvas.dataset.zoom ?? 1);
      return {
        x: rect.left + camPx + wx * zoom,
        y: rect.top + camPy + wy * zoom,
      };
    },
    { tx, ty, TILE_W, TILE_H },
  );
}

async function readZoom(page) {
  return page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.zoom ?? 0));
}

async function clickTileWithMouse(page, tx, ty, touch = false) {
  const pt = await tileToScreen(page, tx, ty);
  if (!pt) return false;
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = 'none';
  });
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = '';
  });
  return true;
}

async function panCanvas(page, canvasBox) {
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = 'none';
  });
  await page.mouse.move(canvasBox.x + 200, canvasBox.y + 220);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + 340, canvasBox.y + 300, { steps: 10 });
  await page.mouse.up();
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = '';
  });
}

async function syntheticPinch(page, canvasBox, spreadFrom, spreadTo) {
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  await page.evaluate(
    ({ cx, cy, spreadFrom, spreadTo }) => {
      const c = document.getElementById('game-canvas');
      if (!c || !window.Touch) return;
      const mk = (id, x, y) =>
        new window.Touch({
          identifier: id,
          target: c,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
          radiusX: 2,
          radiusY: 2,
          rotationAngle: 0,
          force: 1,
        });
      const start = [mk(1, cx - spreadFrom, cy), mk(2, cx + spreadFrom, cy)];
      c.dispatchEvent(
        new TouchEvent('touchstart', { touches: start, targetTouches: start, changedTouches: start, bubbles: true, cancelable: true }),
      );
      const move = [mk(1, cx - spreadTo, cy), mk(2, cx + spreadTo, cy)];
      c.dispatchEvent(
        new TouchEvent('touchmove', { touches: move, targetTouches: move, changedTouches: move, bubbles: true, cancelable: true }),
      );
      c.dispatchEvent(
        new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: move, bubbles: true, cancelable: true }),
      );
    },
    { cx, cy, spreadFrom, spreadTo },
  );
}

async function waitForBuildingPanel(page, timeoutMs = 16000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((await page.locator('.building-panel--open').count()) > 0) return true;
    await wait(250);
  }
  return false;
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });

  let previewReady = false;
  preview.stdout.on('data', (d) => {
    if (String(d).includes('4173')) previewReady = true;
  });
  preview.stderr.on('data', (d) => {
    if (String(d).includes('4173')) previewReady = true;
  });

  for (let i = 0; i < 50 && !previewReady; i++) await wait(200);

  const errors = [];
  const notes = [];
  const browser = await chromium.launch();

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`desktop: ${msg.text()}`);
    });
    desktop.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));

    await desktop.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await desktop.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await desktop.reload({ waitUntil: 'networkidle' });
    await wait(2000);

    const canvasBox = await desktop.locator('#game-canvas').boundingBox();
    if (!canvasBox) errors.push('desktop: no canvas');

    await desktop.locator('.checklist__ring-btn').click();
    await wait(200);
    await desktop.screenshot({ path: path.join(outDir, 'desktop-1440x900.png') });

    await clickTileWithMouse(desktop, 10, 8);
    await wait(1500);

    for (const key of ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowRight']) {
      await desktop.keyboard.press(key);
      await wait(150);
    }

    if (canvasBox) {
      await panCanvas(desktop, canvasBox);
      await wait(300);
    }

    if (canvasBox) {
      await desktop.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    }
    for (let i = 0; i < 18; i++) {
      await desktop.mouse.wheel(0, 160);
      await wait(50);
    }
    await wait(400);

    let zoom = await readZoom(desktop);
    if (zoom > 0.28) {
      for (let i = 0; i < 10; i++) {
        await desktop.mouse.wheel(0, 200);
        await wait(40);
      }
      zoom = await readZoom(desktop);
    }
    if (zoom > 0.28) errors.push(`desktop: far zoom not reached via wheel (${zoom})`);
    await desktop.screenshot({ path: path.join(outDir, 'desktop-far-zoom.png') });

    if (!(await clickTileWithMouse(desktop, 12, 5))) {
      errors.push('desktop: could not resolve building screen position');
    } else {
      const opened = await waitForBuildingPanel(desktop);
      if (!opened) errors.push('desktop: building panel did not open after real click on caso-2');
      else {
        await desktop.screenshot({ path: path.join(outDir, 'desktop-building-panel.png') });
        const enterChecked = await desktop.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return false;
          return Boolean(JSON.parse(raw).completed?.['enter-building']);
        }, STORAGE_KEY);
        if (!enterChecked) {
          errors.push('desktop: enter-building checklist step not checked after building panel opened');
        }
        const stepDom = await desktop.locator('.checklist__item--done').filter({ hasText: 'Entra a un edificio' }).count();
        if (stepDom < 1) {
          errors.push('desktop: enter-building step not marked done in checklist UI');
        }
      }
    }

    const desktopDone = await desktop.evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      const c = JSON.parse(raw).completed;
      return ['walk-around', 'walk-keys', 'move-camera', 'zoom', 'enter-building'].filter((s) => c[s]).length;
    }, STORAGE_KEY);
    if (desktopDone !== 5) {
      const missing = await desktop.evaluate((key) => {
        const raw = localStorage.getItem(key);
        const c = JSON.parse(raw).completed;
        return ['walk-around', 'walk-keys', 'move-camera', 'zoom', 'enter-building'].filter((s) => !c[s]);
      }, STORAGE_KEY);
      errors.push(`desktop: expected 5/5 via real input, got ${desktopDone}/5 missing ${missing.join(',')}`);
    } else {
      await desktop.locator('.building-panel__close').click();
      await wait(400);
      await desktop.screenshot({ path: path.join(outDir, 'desktop-5-5-real.png') });
    }

    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    await desktop.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await desktop.reload({ waitUntil: 'networkidle' });
    await wait(1200);
    await desktop.locator('.checklist__skip').click();
    await wait(300);
    const skipState = await desktop.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, STORAGE_KEY);
    const ringVisible = await desktop.locator('.checklist__ring-btn').isVisible();
    if (!ringVisible) errors.push('desktop: skip should keep ring visible to reopen');
    if (!skipState?.skipped) errors.push('desktop: skip flag not set');
    if (skipState?.completed?.['enter-building']) {
      errors.push('desktop: skip marked enter-building complete');
    }
    await desktop.screenshot({ path: path.join(outDir, 'desktop-after-skip.png') });

    const iphone = devices['iPhone X'];
    const mobile = await browser.newPage({
      ...iphone,
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });
    await mobile.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = (query) => {
        if (query === '(hover: none) and (pointer: coarse)') {
          return {
            matches: true,
            media: query,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
          };
        }
        return orig(query);
      };
    });
    mobile.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`mobile: ${msg.text()}`);
    });
    mobile.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));

    await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await mobile.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
    await mobile.reload({ waitUntil: 'networkidle' });
    await wait(2000);

    if ((await mobile.locator('.checklist--mobile-closed').count()) === 0) {
      errors.push('mobile: ring not closed on load');
    }
    await mobile.screenshot({ path: path.join(outDir, 'mobile-375x812.png') });

    const mCanvas = await mobile.locator('#game-canvas').boundingBox();
    await clickTileWithMouse(mobile, 10, 8, true);
    await wait(1200);

    if (mCanvas) {
      await mobile.mouse.move(mCanvas.x + 100, mCanvas.y + 300);
      await mobile.mouse.down();
      await mobile.mouse.move(mCanvas.x + 180, mCanvas.y + 380, { steps: 8 });
      await mobile.mouse.up();
      await wait(400);
      await syntheticPinch(mobile, mCanvas, 90, 35);
      await wait(400);
      if (Math.abs((await readZoom(mobile)) - (await readZoom(mobile))) < 0) {
        notes.push('mobile: pinch may be noop in headless');
      }
      for (let i = 0; i < 6; i++) {
        await syntheticPinch(mobile, mCanvas, 80, 30);
        await wait(80);
      }
    }

    await clickTileWithMouse(mobile, 12, 5, true);
    const mobilePanel = await waitForBuildingPanel(mobile);
    if (!mobilePanel) errors.push('mobile: building panel did not open after real tap');
    else await mobile.screenshot({ path: path.join(outDir, 'mobile-building-panel.png') });

    const touchDone = await mobile.evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      const c = JSON.parse(raw).completed;
      return ['walk-around', 'move-camera', 'zoom', 'enter-building'].filter((s) => c[s]).length;
    }, STORAGE_KEY);
    if (touchDone !== 4) {
      errors.push(`mobile: expected 4/4 via real input, got ${touchDone}/4`);
    } else {
      await mobile.locator('.building-panel__close').click();
      await wait(400);
      await mobile.screenshot({ path: path.join(outDir, 'mobile-4-4-touch.png') });
    }

    await desktop.close();
    await mobile.close();

    console.log(JSON.stringify({ errors, notes, screenshots: outDir }, null, 2));
    if (errors.length) process.exitCode = 1;
  } finally {
    await browser.close();
    preview.kill('SIGTERM');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
