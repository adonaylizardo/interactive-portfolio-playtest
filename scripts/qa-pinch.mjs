import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/opt/cursor/artifacts/screenshots';
const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const MAP_VISIBLE_MIN = 0.28;
const TILE_LIGHT_HEX = 'dddddd';

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readCanvasMetrics(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return null;
    const zoom = Number(c.dataset.zoom);
    return {
      zoom,
      camX: Number(c.dataset.camX),
      camY: Number(c.dataset.camY),
      mapFracW: Number(c.dataset.mapFracW),
      mapFracH: Number(c.dataset.mapFracH),
      mapIntersects: c.dataset.mapIntersects === '1',
      pinchFrame: Number(c.dataset.pinchFrame ?? 0),
      zoomSource: c.dataset.zoomSource ?? 'none',
    };
  });
}

async function readCharTile(page) {
  return page.evaluate(() => {
    const raw = document.getElementById('game-canvas')?.dataset.charTile;
    return raw ? JSON.parse(raw) : null;
  });
}

async function readFootDriftPx(page) {
  return page.evaluate(() => {
    const raw = document.getElementById('game-canvas')?.dataset.footDriftPx;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  });
}

async function readBuildingSilhouette(page) {
  return page.evaluate(() => {
    const raw = document.getElementById('game-canvas')?.dataset.buildingSilhouette;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });
}

function buildingSilhouettesMatch(a, b) {
  if (!a || !b) return false;
  for (const k of ['w', 'h', 'x', 'y']) {
    if (Math.abs(Number(a[k]) - Number(b[k])) > 0.5) return false;
  }
  return true;
}

async function testBuildingSilhouetteStable(page, name, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(800);
  const cam = await page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    return { x: c?.dataset.camX ?? '0', y: c?.dataset.camY ?? '0' };
  });

  const zoomLevels = [ZOOM_MIN, 0.85, ZOOM_MAX];
  const samples = [];

  for (const z of zoomLevels) {
    const hash = `#view=x=${cam.x}&y=${cam.y}&z=${z.toFixed(3)}`;
    await page.goto(`${BASE}${hash}`, { waitUntil: 'networkidle' });
    await wait(900);
    const sil = await readBuildingSilhouette(page);
    const metrics = await readCanvasMetrics(page);
    if (!sil) {
      errors.push(`${name}: buildingSilhouette missing at target z=${z}`);
      continue;
    }
    if (metrics && Math.abs(metrics.zoom - z) > 0.06) {
      errors.push(`${name}: zoom ${metrics.zoom.toFixed(3)} != target ${z} during silhouette test`);
    }
    samples.push({ z, sil });
  }

  if (samples.length < 2) return;
  const ref = samples[0].sil;
  for (let i = 1; i < samples.length; i++) {
    if (!buildingSilhouettesMatch(ref, samples[i].sil)) {
      errors.push(
        `${name}: building LOD/silhouette changed at z=${samples[0].z} vs z=${samples[i].z} (${JSON.stringify(ref)} vs ${JSON.stringify(samples[i].sil)})`,
      );
    }
  }
}

function assertFootAnchor(name, driftPx, errors, label) {
  if (driftPx === null) {
    errors.push(`${name}: ${label} footDriftPx missing`);
    return;
  }
  if (driftPx > 1) {
    errors.push(`${name}: ${label} tile/building foot drift ${driftPx.toFixed(2)}px`);
  }
}

async function readBuildingInteriorCover(page) {
  return page.evaluate(() => document.getElementById('game-canvas')?.dataset.buildingInteriorWallCover ?? '');
}

function assertBuildingInteriorClosed(name, cover, errors, label) {
  if (cover !== '1') {
    errors.push(`${name}: ${label} floor visible between front walls (buildingInteriorWallCover=${cover})`);
  }
}

async function readTreeDeskProbes(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return null;
    return {
      treeOverlap: c.dataset.treeCanopyOverlap ?? '',
      canopyBottomY: Number(c.dataset.treeCanopyBottomY),
      trunkTopY: Number(c.dataset.trunkTopY),
      deskTopColor: c.dataset.deskTopColor ?? '',
    };
  });
}

function assertTreeCanopyOverlap(name, probes, errors, label) {
  if (!probes) {
    errors.push(`${name}: ${label} tree/desk probes missing`);
    return;
  }
  if (probes.treeOverlap !== '1') {
    errors.push(
      `${name}: ${label} tree canopy gap (bottomY=${probes.canopyBottomY} trunkTopY=${probes.trunkTopY})`,
    );
  }
  if (probes.deskTopColor === TILE_LIGHT_HEX) {
    errors.push(`${name}: ${label} desk top matches plot tile color`);
  }
}

function assertFrameMetrics(name, m, errors, label) {
  if (!m) {
    errors.push(`${name}: ${label} missing canvas metrics`);
    return;
  }
  if (!Number.isFinite(m.zoom)) {
    errors.push(`${name}: ${label} zoom not finite (${m.zoom})`);
  }
  if (m.zoom < ZOOM_MIN - 0.001 || m.zoom > ZOOM_MAX + 0.001) {
    errors.push(`${name}: ${label} zoom out of range (${m.zoom})`);
  }
  if (!m.mapIntersects) {
    errors.push(`${name}: ${label} map does not intersect viewport`);
  }
  if (m.mapFracW < MAP_VISIBLE_MIN || m.mapFracH < MAP_VISIBLE_MIN) {
    errors.push(
      `${name}: ${label} map visible frac too low (${m.mapFracW.toFixed(3)}, ${m.mapFracH.toFixed(3)})`,
    );
  }
}

function assertNoSignJump(name, prev, next, errors, label) {
  if (!prev || !next) return;
  if (Math.sign(prev.camY) !== 0 && Math.sign(next.camY) !== 0 && Math.sign(prev.camY) !== Math.sign(next.camY)) {
    if (Math.abs(next.camY + prev.camY) < Math.max(40, Math.abs(prev.camY) * 0.35)) {
      errors.push(`${name}: ${label} camera Y sign flip (${prev.camY.toFixed(1)} -> ${next.camY.toFixed(1)})`);
    }
  }
  const dz = Math.abs(next.zoom - prev.zoom);
  const dCam = Math.hypot(next.camX - prev.camX, next.camY - prev.camY);
  if (dz > 0.001 && dCam > 800) {
    errors.push(`${name}: ${label} discontinuous camera jump (d=${dCam.toFixed(0)} dz=${dz.toFixed(3)})`);
  }
}

async function ensureTouchEmulation(client) {
  try {
    await client.send('Input.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  } catch {
    /* unsupported in this Chromium build */
  }
}

async function domPinchPoints(page, type, cx, cy, spread) {
  const touches =
    type === 'touchend'
      ? []
      : [
          { clientX: cx - spread, clientY: cy, identifier: 1 },
          { clientX: cx + spread, clientY: cy, identifier: 2 },
        ];
  const changed =
    type === 'touchend'
      ? [
          { clientX: cx - spread, clientY: cy, identifier: 1 },
          { clientX: cx + spread, clientY: cy, identifier: 2 },
        ]
      : touches;
  await page.evaluate(
    ({ type, touches, changed }) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: touches });
      Object.defineProperty(ev, 'targetTouches', { value: touches });
      Object.defineProperty(ev, 'changedTouches', { value: changed });
      document.dispatchEvent(ev);
    },
    { type, touches, changed },
  );
}

async function pointerPinchDown(page, client, cx, cy, spread) {
  const pts = [
    { id: 1, x: cx - spread, y: cy },
    { id: 2, x: cx + spread, y: cy },
  ];
  for (const p of pts) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
      pointerType: 'touch',
      pointerId: p.id,
    });
  }
}

async function pointerPinchMove(page, client, cx, cy, spread) {
  const pts = [
    { id: 1, x: cx - spread, y: cy },
    { id: 2, x: cx + spread, y: cy },
  ];
  for (const p of pts) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: p.x,
      y: p.y,
      button: 'none',
      buttons: 1,
      pointerType: 'touch',
      pointerId: p.id,
    });
  }
}

async function pointerPinchUp(page, client, cx, cy, spread) {
  const pts = [
    { id: 1, x: cx - spread, y: cy },
    { id: 2, x: cx + spread, y: cy },
  ];
  for (const p of pts) {
    await client.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
      pointerType: 'touch',
      pointerId: p.id,
    });
  }
}

async function startTwoFingerTouch(page, client, cx, cy, spread) {
  await pointerPinchDown(page, client, cx, cy, spread);
  await wait(40);
}

async function cdpPinchPoints(client, type, cx, cy, spread) {
  const touchPoints = [
    {
      x: Math.round(cx - spread),
      y: Math.round(cy),
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    },
    {
      x: Math.round(cx + spread),
      y: Math.round(cy),
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 1,
    },
  ];
  await client.send('Input.dispatchTouchEvent', { type, touchPoints });
}

async function cdpPinch(page, cx, cy, spreadFrom, spreadTo, client) {
  await startTwoFingerTouch(page, client, cx, cy, spreadFrom);
  await wait(40);
  await pointerPinchMove(page, client, cx, cy, spreadTo);
  await wait(40);
  await pointerPinchUp(page, client, cx, cy, spreadTo);
}

async function cdpLongPinch(page, name, cx, cy, spreads, errors, client) {
  await startTwoFingerTouch(page, client, cx, cy, spreads[0]);
  await wait(30);
  assertFrameMetrics(name, await readCanvasMetrics(page), errors, 'long-pinch-start');

  for (let i = 1; i < spreads.length; i++) {
    await pointerPinchMove(page, client, cx, cy, spreads[i]);
    await wait(25);
    assertFrameMetrics(name, await readCanvasMetrics(page), errors, `long-pinch-step-${i}`);
  }
  await pointerPinchUp(page, client, cx, cy, spreads[spreads.length - 1]);
  await wait(200);
}

async function cdpJitteryPinch(page, name, cx, cy, errors, client) {
  await startTwoFingerTouch(page, client, cx, cy, 90);
  await wait(20);
  const wobbles = [88, 92, 85, 95, 80, 100, 75, 110, 70, 115, 65, 120];
  for (let i = 0; i < wobbles.length; i++) {
    const jitter = (i % 3) - 1;
    await pointerPinchMove(page, client, cx + jitter, cy - jitter, wobbles[i]);
    await wait(20);
    assertFrameMetrics(name, await readCanvasMetrics(page), errors, `jitter-${i}`);
  }
  await pointerPinchUp(page, client, cx, cy, wobbles[wobbles.length - 1]);
  await wait(150);
}

async function conflictDuringPointerPinch(page, name, cx, cy, errors, client) {
  await startTwoFingerTouch(page, client, cx, cy, 80);
  await wait(80);
  const before = await readCanvasMetrics(page);
  if (before?.zoomSource !== 'pointer') {
    errors.push(`${name}: expected zoomSource pointer during pinch (${before?.zoomSource})`);
    await pointerPinchUp(page, client, cx, cy, 80);
    return;
  }

  const afterConflict = await page.evaluate(({ cx: x, cy: y }) => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return null;
    const z0 = Number(canvas.dataset.zoom);
    const f0 = Number(canvas.dataset.pinchFrame ?? 0);
    const ge = new Event('gesturechange', { bubbles: true, cancelable: true });
    Object.defineProperty(ge, 'scale', { value: 4, configurable: true });
    Object.defineProperty(ge, 'clientX', { value: x, configurable: true });
    Object.defineProperty(ge, 'clientY', { value: y, configurable: true });
    canvas.dispatchEvent(ge);
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -240,
      ctrlKey: true,
      clientX: x,
      clientY: y,
    });
    canvas.dispatchEvent(wheel);
    return {
      z0,
      f0,
      z1: Number(canvas.dataset.zoom),
      f1: Number(canvas.dataset.pinchFrame ?? 0),
      zoomSource: canvas.dataset.zoomSource,
    };
  }, { cx, cy });

  if (!afterConflict) {
    errors.push(`${name}: conflict evaluate failed`);
  } else {
    const dz = Math.abs(afterConflict.z1 - afterConflict.z0);
    if (dz > 0.02) {
      errors.push(
        `${name}: wheel/gesture changed zoom during pointer pinch (${afterConflict.z0} -> ${afterConflict.z1})`,
      );
    }
    if (afterConflict.f1 !== afterConflict.f0) {
      errors.push(`${name}: pinchFrame changed from synthetic events (${afterConflict.f0} -> ${afterConflict.f1})`);
    }
    if (afterConflict.zoomSource !== 'pointer') {
      errors.push(`${name}: zoomSource switched during pointer pinch (${afterConflict.zoomSource})`);
    }
  }

  await pointerPinchMove(page, client, cx, cy, 120);
  await wait(60);
  const mid = await readCanvasMetrics(page);
  assertFrameMetrics(name, mid, errors, 'after-real-pinch-move');
  if (mid && before && Math.abs(mid.zoom - before.zoom) < 0.005 && mid.pinchFrame <= before.pinchFrame) {
    errors.push(`${name}: real pinch move did not update pinch (${before.pinchFrame}->${mid.pinchFrame})`);
  }

  await pointerPinchUp(page, client, cx, cy, 120);
  await wait(100);
}

async function wheelSweep(page, name, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push(`${name}: no canvas for wheel sweep`);
    return;
  }
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy);

  let prev = await readCanvasMetrics(page);
  assertFrameMetrics(name, prev, errors, 'wheel-start');
  assertFootAnchor(name, await readFootDriftPx(page), errors, 'wheel-start');

  for (let i = 0; i < 28; i++) {
    await page.mouse.wheel(0, -80);
    await wait(35);
    const next = await readCanvasMetrics(page);
    assertFrameMetrics(name, next, errors, `wheel-in-${i}`);
    assertNoSignJump(name, prev, next, errors, `wheel-in-${i}`);
    if (i === 0 || i === 14 || i === 27) {
      assertFootAnchor(name, await readFootDriftPx(page), errors, `wheel-in-${i}`);
    }
    prev = next;
  }

  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 80);
    await wait(35);
    const next = await readCanvasMetrics(page);
    assertFrameMetrics(name, next, errors, `wheel-out-${i}`);
    assertNoSignJump(name, prev, next, errors, `wheel-out-${i}`);
    if (i === 0 || i === 20 || i === 39) {
      assertFootAnchor(name, await readFootDriftPx(page), errors, `wheel-out-${i}`);
    }
    prev = next;
  }

  if (prev && Math.abs(prev.zoom - ZOOM_MIN) > 0.02) {
    errors.push(`${name}: wheel-out did not reach min zoom (${prev.zoom})`);
  }
}

async function runPinchCase(page, name, viewportLabel) {
  const errors = [];
  const client = await page.context().newCDPSession(page);
  await ensureTouchEmulation(client);
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

  const z0 = (await readCanvasMetrics(page))?.zoom ?? 0;
  const char0 = await readCharTile(page);

  await startTwoFingerTouch(page, client, cx, cy, 80);
  await wait(80);
  const pinchReady = (await readCanvasMetrics(page))?.zoomSource === 'pointer';
  if (!pinchReady) {
    return [`${name}: multi-touch pinch skipped (CDP cannot drive two pointers in this Chromium build)`];
  }
  await pointerPinchUp(page, client, cx, cy, 80);
  await wait(100);

  await conflictDuringPointerPinch(page, name, cx, cy, errors, client);

  await cdpPinch(page, cx, cy, 70, 140, client);
  await wait(500);
  const zOut = (await readCanvasMetrics(page))?.zoom ?? 0;
  if (zOut <= z0 + 0.01) errors.push(`${name}: pinch out did not increase zoom (${z0} -> ${zOut})`);

  await cdpPinch(page, cx, cy, 140, 60, client);
  await wait(500);
  const zIn = (await readCanvasMetrics(page))?.zoom ?? 0;
  if (zIn >= zOut - 0.01) errors.push(`${name}: pinch in did not decrease zoom (${zOut} -> ${zIn})`);

  const pinchOutSpreads = [70, 85, 100, 120, 150, 180, 220, 260, 300];
  await cdpLongPinch(page, `${name}-long-out`, cx, cy, pinchOutSpreads, errors, client);

  const pinchInSpreads = [280, 240, 200, 160, 120, 90, 60, 40, 25];
  await cdpLongPinch(page, `${name}-long-in`, cx, cy, pinchInSpreads, errors, client);

  await cdpJitteryPinch(page, name, cx, cy, errors, client);

  const char1 = await readCharTile(page);
  if (char0 && char1 && (char0.x !== char1.x || char0.y !== char1.y)) {
    errors.push(`${name}: pinch triggered character walk ${JSON.stringify(char0)} -> ${JSON.stringify(char1)}`);
  }

  await page.screenshot({ path: path.join(outDir, `${viewportLabel}-pinch-after.png`) });
  return errors;
}

async function testUnreachableClick(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(800);
  const canvas = await page.locator('#game-canvas').boundingBox();
  const client = await page.context().newCDPSession(page);
  const x = canvas.x + canvas.width * 0.92;
  const y = canvas.y + canvas.height * 0.15;
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(400);
  const toastVisible = await page.locator('.playtest-toast--visible').isVisible();
  if (!toastVisible) errors.push('unreachable: toast not shown for off-map CDP click');
}

async function tileToScreen(page, tx, ty) {
  return page.evaluate(
    ({ tx, ty }) => {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return null;
      const TILE_W = 128;
      const TILE_H = 64;
      const rect = canvas.getBoundingClientRect();
      const wx = (tx - ty) * (TILE_W / 2);
      const wy = (tx + ty) * (TILE_H / 2);
      const camPx = Number(canvas.dataset.camPx ?? 0);
      const camPy = Number(canvas.dataset.camPy ?? 0);
      const zoom = Number(canvas.dataset.zoom ?? 1);
      return { x: rect.left + camPx + wx * zoom, y: rect.top + camPy + wy * zoom };
    },
    { tx, ty },
  );
}

async function testEnterBuildingChecklist(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);
  const pt = await tileToScreen(page, 12, 5);
  if (!pt) {
    errors.push('enter-building: could not resolve building screen position');
    return;
  }
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = 'none';
  });
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: pt.x,
    y: pt.y,
    button: 'left',
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: pt.x,
    y: pt.y,
    button: 'left',
    clickCount: 1,
  });
  await page.evaluate(() => {
    const ui = document.getElementById('ui-root');
    if (ui) ui.style.pointerEvents = '';
  });
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) break;
    await wait(250);
  }
  if ((await page.locator('.building-panel--open').count()) === 0) {
    errors.push('enter-building: panel did not open after CDP building click');
    return;
  }
  const checked = await page.evaluate(() => {
    const raw = localStorage.getItem('playtest-checklist-v3');
    return raw ? JSON.parse(raw).completed?.['enter-building'] === true : false;
  });
  if (!checked) errors.push('enter-building: checklist step not checked after panel open');
}

async function testSkipRingDesktop(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload();
  await wait(800);
  await page.locator('.checklist__skip').click();
  await wait(200);
  const box = await page.locator('.checklist').boundingBox();
  if (box && box.width > 200) {
    errors.push(`desktop skip: collapsed width too wide (${Math.round(box.width)}px)`);
  }
  const ringCounter = await page.locator('.checklist__counter--in-ring').textContent();
  if (!ringCounter?.includes('/')) errors.push('desktop skip: counter missing in ring');
  await page.locator('.checklist__ring-btn').click();
  await wait(200);
  const listVisible = await page.locator('.checklist__list').isVisible();
  if (!listVisible) errors.push('desktop skip: first ring click did not expand list');
  const skipVisible = await page.locator('.checklist__skip').isVisible();
  if (!skipVisible) errors.push('desktop skip: Saltar link missing after reopen');
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    await wait(200);
    try {
      const res = await fetch(BASE);
      if (res.ok) break;
    } catch {
      /* retry */
    }
  }

  const errors = [];
  const warnings = [];
  const browser = await chromium.launch();

  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await wheelSweep(desktop, 'desktop-wheel', errors);
    await testBuildingSilhouetteStable(desktop, 'desktop-silhouette', errors);
    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    await wait(800);
    assertBuildingInteriorClosed(
      'desktop-interior',
      await readBuildingInteriorCover(desktop),
      errors,
      'default-zoom',
    );
    assertTreeCanopyOverlap(
      'desktop-tree-desk',
      await readTreeDeskProbes(desktop),
      errors,
      'default-zoom',
    );

    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    const canvas = await desktop.locator('#game-canvas').boundingBox();
    await desktop.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await desktop.keyboard.down('Control');
    for (let i = 0; i < 6; i++) {
      await desktop.mouse.wheel(0, -100);
      await wait(30);
    }
    await desktop.keyboard.up('Control');
    await wait(300);
    const m = await readCanvasMetrics(desktop);
    assertFrameMetrics('desktop-ctrl-wheel', m, errors, 'after-ctrl-wheel');

    await testUnreachableClick(desktop, errors);
    await testEnterBuildingChecklist(desktop, errors);
    await testSkipRingDesktop(desktop, errors);

    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    const mobileOut = await runPinchCase(mobile, 'iphone-375', 'mobile-375');
    for (const msg of mobileOut) {
      if (msg.includes('skipped')) warnings.push(msg);
      else errors.push(msg);
    }

    const ipad = await browser.newPage({ viewport: { width: 820, height: 1180 } });
    await ipad.goto(BASE, { waitUntil: 'networkidle' });
    const ipadOut = await runPinchCase(ipad, 'ipad-820', 'ipad-820');
    for (const msg of ipadOut) {
      if (msg.includes('skipped')) warnings.push(msg);
      else errors.push(msg);
    }

    console.log(JSON.stringify({ errors, warnings, screenshots: outDir }, null, 2));
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
