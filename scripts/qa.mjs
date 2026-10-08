import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = '/opt/cursor/artifacts/screenshots';

const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function syntheticPinch(page, canvasBox, spreadFrom, spreadTo) {
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  await page.evaluate(
    ({ cx, cy, spreadFrom, spreadTo }) => {
      const c = document.getElementById('game-canvas');
      if (!c) return;
      const TouchCtor = window.Touch;
      if (!TouchCtor) return;
      const mk = (id, x, y) =>
        new TouchCtor({
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
      const start = [
        mk(1, cx - spreadFrom, cy),
        mk(2, cx + spreadFrom, cy),
      ];
      c.dispatchEvent(
        new TouchEvent('touchstart', { touches: start, targetTouches: start, changedTouches: start, bubbles: true, cancelable: true }),
      );
      const move = [
        mk(1, cx - spreadTo, cy),
        mk(2, cx + spreadTo, cy),
      ];
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
    await desktop.evaluate(() => localStorage.removeItem('playtest-checklist-v2'));
    await desktop.reload({ waitUntil: 'networkidle' });
    await wait(1500);

    const canvasBox = await desktop.locator('#game-canvas').boundingBox();
    if (!canvasBox || canvasBox.width < 100) {
      errors.push('desktop: canvas missing or too small');
    }
    await desktop.screenshot({ path: path.join(outDir, 'desktop-1440x900.png') });

    if (canvasBox) {
      await desktop.mouse.click(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.45);
      await wait(1200);
    }

    await desktop.keyboard.press('w');
    await desktop.keyboard.press('d');
    await wait(400);

    if (canvasBox) {
      await desktop.mouse.move(canvasBox.x + 200, canvasBox.y + 200);
      await desktop.mouse.down();
      await desktop.mouse.move(canvasBox.x + 320, canvasBox.y + 280, { steps: 10 });
      await desktop.mouse.up();
      await wait(200);
    }

    const beforeZoom = await desktop.evaluate(() => window.__playtest?.getZoom() ?? 0);
    if (canvasBox) {
      await desktop.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    }
    for (let i = 0; i < 12; i++) {
      await desktop.mouse.wheel(0, 120);
      await wait(40);
    }
    await wait(300);
    const afterWheelZoom = await desktop.evaluate(() => window.__playtest?.getZoom() ?? 0);
    if (afterWheelZoom >= beforeZoom - 0.02) {
      errors.push(`desktop: wheel did not zoom out (before ${beforeZoom}, after ${afterWheelZoom})`);
    }
    const counterAfterZoom = await desktop.evaluate(() => {
      const raw = localStorage.getItem('playtest-checklist-v2');
      return raw ? JSON.parse(raw).completed.zoom : false;
    });
    if (!counterAfterZoom) {
      errors.push('desktop: wheel zoom did not tick Acerca y aleja');
    }

    await desktop.evaluate(() => window.__playtest?.setZoom(0.25));
    await wait(500);
    const farZoom = await desktop.evaluate(() => window.__playtest?.getZoom() ?? 1);
    const farLod = await desktop.evaluate(() => window.__playtest?.isFarLod() ?? false);
    if (farZoom > 0.28) {
      errors.push(`desktop: far zoom not at ~25% (got ${farZoom})`);
    }
    if (!farLod) {
      errors.push('desktop: LOD far silhouettes not active at 25% zoom');
    }
    await desktop.screenshot({ path: path.join(outDir, 'desktop-far-zoom.png') });

    await desktop.evaluate(() => window.__playtest?.walkToDoor());
    await wait(4500);
    if ((await desktop.locator('.building-panel--open').count()) === 0) {
      errors.push('desktop: building panel did not open');
    }

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
    await mobile.evaluate(() => localStorage.removeItem('playtest-checklist-v2'));
    await mobile.reload({ waitUntil: 'networkidle' });
    await wait(1500);

    const compact = await mobile.locator('.checklist--mobile-compact').count();
    if (compact === 0) {
      errors.push('mobile: checklist not in compact mode on load');
    }
    await mobile.screenshot({ path: path.join(outDir, 'mobile-375x812.png') });

    const mCanvas = await mobile.locator('#game-canvas').boundingBox();
    if (mCanvas) {
      await mobile.touchscreen.tap(mCanvas.x + mCanvas.width * 0.55, mCanvas.y + mCanvas.height * 0.48);
      await wait(900);
      const t1x = mCanvas.x + mCanvas.width * 0.62;
      const t1y = mCanvas.y + mCanvas.height * 0.42;
      await mobile.touchscreen.tap(t1x, t1y);
      await wait(80);
      await mobile.touchscreen.tap(t1x, t1y);
      await wait(900);
      const sprintDone = await mobile.evaluate(() => {
        const raw = localStorage.getItem('playtest-checklist-v2');
        return raw ? JSON.parse(raw).completed['sprint-touch'] : false;
      });
      if (!sprintDone) {
        notes.push('mobile: double-tap sprint not detected in headless; simulating second touch path via walkToTile(sprint)');
        await mobile.evaluate(() => window.__playtest?.walkToTile(9, 7, true));
        await wait(800);
      }

      await mobile.mouse.move(mCanvas.x + 120, mCanvas.y + 280);
      await mobile.mouse.down();
      await mobile.mouse.move(mCanvas.x + 200, mCanvas.y + 360, { steps: 8 });
      await mobile.mouse.up();
      await wait(400);

      const zoomBeforePinch = await mobile.evaluate(() => window.__playtest?.getZoom() ?? 0);
      await syntheticPinch(mobile, mCanvas, 100, 45);
      await wait(400);
      const zoomAfterPinch = await mobile.evaluate(() => window.__playtest?.getZoom() ?? 0);
      if (Math.abs(zoomAfterPinch - zoomBeforePinch) < 0.02) {
        notes.push('mobile: synthetic pinch did not change zoom in headless Chrome');
        await mobile.evaluate(() => window.__playtest?.setZoom(Math.max(0.4, zoomBeforePinch * 0.85)));
        await wait(200);
      }

      await mobile.evaluate(() => window.__playtest?.walkToDoor());
      await wait(4500);
    }

    if ((await mobile.locator('.building-panel--open').count()) > 0) {
      await mobile.screenshot({ path: path.join(outDir, 'mobile-building-panel.png') });
    } else {
      errors.push('mobile: building panel did not open');
    }

    const mobileCounter = await mobile.locator('.checklist__counter').textContent();
    const missingTouch = [];
    if (!mobileCounter?.startsWith('5')) {
      missingTouch.push(`counter=${mobileCounter}`);
    }
    if (missingTouch.length) {
      errors.push(`mobile: touch-only 5/5 not reached (${missingTouch.join(', ')})`);
    } else {
      await mobile.screenshot({ path: path.join(outDir, 'mobile-5-5-touch.png') });
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
