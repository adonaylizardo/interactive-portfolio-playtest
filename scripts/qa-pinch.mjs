import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/opt/cursor/artifacts/screenshots';
const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readZoom(page) {
  return page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.zoom ?? 0));
}

async function readCharTile(page) {
  return page.evaluate(() => {
    const raw = document.getElementById('game-canvas')?.dataset.charTile;
    return raw ? JSON.parse(raw) : null;
  });
}

async function cdpPinch(page, cx, cy, spreadFrom, spreadTo) {
  const client = await page.context().newCDPSession(page);
  const points = (spread) => [
    { x: Math.round(cx - spread), y: Math.round(cy), radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 },
    { x: Math.round(cx + spread), y: Math.round(cy), radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 },
  ];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(spreadFrom) });
  await wait(40);
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(spreadTo) });
  await wait(40);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function runPinchCase(page, name, viewportLabel) {
  const errors = [];
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push(`${name}: no canvas`);
    return errors;
  }
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;

  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1500);

  const z0 = await readZoom(page);
  const char0 = await readCharTile(page);
  await page.screenshot({ path: path.join(outDir, `${viewportLabel}-pinch-before.png`) });

  await cdpPinch(page, cx, cy, 70, 140);
  await wait(500);
  const zOut = await readZoom(page);
  if (zOut <= z0) errors.push(`${name}: pinch out did not increase zoom (${z0} -> ${zOut})`);

  await cdpPinch(page, cx, cy, 140, 60);
  await wait(500);
  const zIn = await readZoom(page);
  if (zIn >= zOut) errors.push(`${name}: pinch in did not decrease zoom (${zOut} -> ${zIn})`);

  const char1 = await readCharTile(page);
  if (char0 && char1 && (char0.x !== char1.x || char0.y !== char1.y)) {
    errors.push(`${name}: pinch triggered character walk ${JSON.stringify(char0)} -> ${JSON.stringify(char1)}`);
  }

  await page.screenshot({ path: path.join(outDir, `${viewportLabel}-pinch-after.png`) });
  return errors;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    await wait(200);
    if (preview.stdout?.readable) break;
  }

  const errors = [];
  const browser = await chromium.launch();

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    const zBefore = await readZoom(desktop);
    const canvas = await desktop.locator('#game-canvas').boundingBox();
    await desktop.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await desktop.keyboard.down('Control');
    for (let i = 0; i < 6; i++) {
      await desktop.mouse.wheel(0, -100);
      await wait(30);
    }
    await desktop.keyboard.up('Control');
    await wait(300);
    const zAfter = await readZoom(desktop);
    if (zAfter <= zBefore) errors.push(`desktop ctrl+wheel: zoom did not increase (${zBefore}->${zAfter})`);

    const iphone = devices['iPhone 13'];
    const mobile = await browser.newPage({ ...iphone, viewport: { width: 375, height: 812 } });
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    errors.push(...(await runPinchCase(mobile, 'iphone-375', 'mobile-375')));

    const ipad = await browser.newPage({
      ...devices['iPad Pro 11'],
      viewport: { width: 820, height: 1180 },
    });
    await ipad.goto(BASE, { waitUntil: 'networkidle' });
    errors.push(...(await runPinchCase(ipad, 'ipad-820', 'ipad-820')));

    await desktop.goto(BASE);
    await desktop.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
    await desktop.reload();
    await wait(1000);
    await desktop.locator('.checklist__skip').click();
    await wait(200);
    const hidden = await desktop.locator('.checklist').isHidden();
    const ringVisible = await desktop.locator('.checklist__ring-btn').isVisible();
    if (hidden) errors.push('desktop skip: checklist fully hidden (ring should stay)');
    if (!ringVisible) errors.push('desktop skip: ring not visible');

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
