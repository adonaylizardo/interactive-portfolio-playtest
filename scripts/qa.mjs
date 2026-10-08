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
  const browser = await chromium.launch();

  try {
    // Desktop 1440x900
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`desktop: ${msg.text()}`);
    });
    desktop.on('pageerror', (e) => errors.push(`desktop pageerror: ${e.message}`));

    await desktop.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(1500);
    const canvasBox = await desktop.locator('#game-canvas').boundingBox();
    if (!canvasBox || canvasBox.width < 100) {
      errors.push('desktop: canvas missing or too small');
    }
    await desktop.screenshot({ path: path.join(outDir, 'desktop-1440x900.png') });

    // Tap/walk — click a walkable tile away from character
    if (canvasBox) {
      await desktop.mouse.click(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.45);
      await wait(1200);
    }

    // Keyboard WASD
    await desktop.keyboard.press('w');
    await desktop.keyboard.press('d');
    await wait(400);

    // Pan
    if (canvasBox) {
      await desktop.mouse.move(canvasBox.x + 200, canvasBox.y + 200);
      await desktop.mouse.down();
      await desktop.mouse.move(canvasBox.x + 280, canvasBox.y + 260, { steps: 8 });
      await desktop.mouse.up();
    }

    // Zoom
    await desktop.mouse.wheel(0, -400);
    await wait(300);
    await desktop.screenshot({ path: path.join(outDir, 'desktop-far-zoom.png') });
    await desktop.mouse.wheel(0, 800);
    await wait(300);

    await desktop.evaluate(() => window.__playtest?.walkToDoor());
    await wait(4500);
    const panelOpen = await desktop.locator('.building-panel--open').count();
    if (panelOpen === 0) {
      errors.push('desktop: building panel did not open after walk to door');
    } else {
      await desktop.screenshot({ path: path.join(outDir, 'desktop-building-panel.png') });
    }

    const checklistText = await desktop.locator('.checklist__counter').textContent();
    if (!checklistText || checklistText === '0 / 5') {
      errors.push(`desktop: checklist expected progress, got ${checklistText}`);
    }
    await desktop.reload({ waitUntil: 'networkidle' });
    await wait(800);
    const afterReload = await desktop.locator('.checklist__counter').textContent();
    if (afterReload === '0 / 5' && checklistText && checklistText !== '0 / 5') {
      errors.push('desktop: checklist did not persist after reload');
    }

    await desktop.locator('.checklist__skip').click();
    await wait(300);
    const afterSkip = await desktop.locator('.checklist__counter').textContent();
    if (afterSkip !== '5 / 5') {
      errors.push(`desktop: skip tutorial failed (${afterSkip})`);
    }

    // Mobile 375x812
    const iphone = devices['iPhone X'];
    const mobile = await browser.newPage({ ...iphone, viewport: { width: 375, height: 812 } });
    mobile.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`mobile: ${msg.text()}`);
    });
    mobile.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));

    await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await wait(1500);
    await mobile.screenshot({ path: path.join(outDir, 'mobile-375x812.png') });

    const mCanvas = await mobile.locator('#game-canvas').boundingBox();
    if (mCanvas) {
      await mobile.touchscreen.tap(mCanvas.x + mCanvas.width * 0.6, mCanvas.y + mCanvas.height * 0.5);
      await wait(1000);
    }

    await desktop.close();
    await mobile.close();

    console.log(JSON.stringify({ errors, screenshots: outDir }, null, 2));
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
