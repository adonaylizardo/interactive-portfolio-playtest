import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir =
  process.env.QA_SCREENSHOT_DIR ?? path.join(root, 'artifacts', 'qa-screenshots');
const DESKTOP_PROOF = 'desktop-1280x800.png';
const MOBILE_PROOF = 'mobile-375x812.png';
const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.5;
const MAP_VISIBLE_MIN = 0.3;
const TILE_LIGHT_HEX = 'dddddd';

/** Map64 building anchor tiles (draw pick / QA clicks). */
const QA = {
  volaris: { x: 39, y: 35 },
  bain: { x: 39, y: 25 },
  mentoria: { x: 32, y: 25 },
  finoa: { x: 22, y: 25 },
  pg: { x: 22, y: 32 },
  estudio: { x: 31, y: 35 },
  obelisco: { tx: 15, ty: 37 },
  redoma: { tx: 46, ty: 37 },
  muro: { tx: 36, ty: 41 },
};

const QA_WALK_START = {
  estudio: [31, 36],
  volaris: [31, 36],
  bain: [39, 36],
  mentoria: [39, 26],
  finoa: [32, 26],
  pg: [22, 34],
  sambil: [39, 36],
  catedral: [31, 36],
  flor: [46, 37],
};

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
      mapCovW: Number(c.dataset.mapCovW),
      mapCovH: Number(c.dataset.mapCovH),
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
    errors.push(`${name}: ${label} tile foot drift ${driftPx.toFixed(2)}px (max 1px)`);
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
  const covW = Number(m.mapCovW ?? m.mapFracW);
  const covH = Number(m.mapCovH ?? m.mapFracH);
  if (covW < MAP_VISIBLE_MIN || covH < MAP_VISIBLE_MIN) {
    errors.push(
      `${name}: ${label} viewport map coverage too low (${covW.toFixed(3)}, ${covH.toFixed(3)})`,
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

async function canvasTouchPinch(page, cx, cy, spreadFrom, spreadTo) {
  await page.evaluate(
    ({ cx, cy, spreadFrom, spreadTo }) => {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return;
      const mk = (id, x, y) => ({
        clientX: x,
        clientY: y,
        identifier: id,
        target: canvas,
        pageX: x,
        pageY: y,
        screenX: x,
        screenY: y,
      });
      const fire = (type, spread) => {
        const t0 = mk(1, cx - spread, cy);
        const t1 = mk(2, cx + spread, cy);
        const touches = type === 'touchend' ? [] : [t0, t1];
        const changed = type === 'touchend' ? [t0, t1] : touches;
        const ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches, changedTouches: changed, targetTouches: touches });
        canvas.dispatchEvent(ev);
      };
      fire('touchstart', spreadFrom);
      fire('touchmove', spreadTo);
      fire('touchend', spreadTo);
    },
    { cx, cy, spreadFrom, spreadTo },
  );
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
  await page.goto(`${BASE}#view=x=2100&y=-3800&z=0.25`, { waitUntil: 'networkidle' });
  await wait(800);
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push('unreachable: no canvas');
    return;
  }
  const client = await page.context().newCDPSession(page);
  const x = canvas.x + 4;
  const y = canvas.y + 4;
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await wait(500);
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
      const wy = (tx + ty) * (TILE_H / 2) + TILE_H / 2;
      const zoom = Number(canvas.dataset.zoom ?? 1);
      const camX = Number(canvas.dataset.camX ?? 0);
      const camY = Number(canvas.dataset.camY ?? 0);
      const sx = rect.width / 2 + (camX + wx) * zoom;
      const sy = rect.height / 2 + (camY + wy) * zoom;
      return { x: rect.left + sx, y: rect.top + sy };
    },
    { tx, ty },
  );
}

async function buildingTapScreenPoint(page, tx, ty) {
  const pt = await tileToScreen(page, tx, ty);
  if (!pt) return null;
  const zoom = await page.evaluate(
    () => Number(document.getElementById('game-canvas')?.dataset.zoom ?? 1),
  );
  return { x: pt.x, y: pt.y - 40 * zoom };
}

async function cdpClickClient(page, x, y) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  return true;
}

async function cdpClickTile(page, tx, ty, opts = {}) {
  const pt = opts.building ? await buildingTapScreenPoint(page, tx, ty) : await tileToScreen(page, tx, ty);
  if (!pt) return false;
  await cdpClickClient(page, pt.x, pt.y);
  return true;
}

async function cdpClickBuildingDoor(page, buildingName) {
  return page.evaluate(
    (name) => window.__playtestQa?.tapBuildingDoor?.(name) === true,
    buildingName,
  );
}

async function testWalkGridFootprintRules(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const gridErrors = await page.evaluate(() => window.__playtestQa?.validateWalkGridFootprint?.() ?? []);
  for (const msg of gridErrors) errors.push(`footprint-walk: ${msg}`);

  const pathErrors = await page.evaluate(() => {
    const findPath = window.__playtestQa?.findPath;
    const inicio = window.__playtestQa?.inicio;
    if (!findPath || !inicio) return ['findPath/inicio hook missing'];
    const cases = [
      [inicio[0], inicio[1], 39, 36],
      [39, 36, 39, 26],
      [39, 26, 32, 26],
      [32, 26, 24, 24],
      [24, 24, 24, 31],
    ];
    const out = [];
    for (const [sx, sy, ex, ey] of cases) {
      const path = findPath(sx, sy, ex, ey);
      if (!path) {
        out.push(`no path (${sx},${sy})→(${ex},${ey})`);
        continue;
      }
      if (path.length > 64) out.push(`path (${sx},${sy})→(${ex},${ey}) suspiciously long (${path.length})`);
    }
    return out;
  });
  for (const msg of pathErrors) errors.push(`footprint-walk: ${msg}`);
}

/** Close panel on a door tile, then move away — panel must not reopen. */
async function testNoDoorReopenOnKeypressAfterClose(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);

  if (!(await cdpClickTile(page, QA.pg.x, QA.pg.y, { building: true }))) {
    errors.push('door-reopen: could not click P&G');
    return;
  }
  for (let i = 0; i < 40; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) break;
    await wait(250);
  }
  if ((await page.locator('.building-panel--open').count()) === 0) {
    errors.push('door-reopen: P&G panel did not open');
    return;
  }
  await dismissBuildingPanel(page);
  await page.keyboard.press('w');
  await wait(400);
  await page.keyboard.press('ArrowUp');
  await wait(400);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    errors.push('door-reopen: panel reopened after movement key while leaving door');
  }
}

/** Ground click whose route crosses another building door must not open that panel. */
async function testGroundWalkCrossingDoorNoPanel(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);

  if (!(await cdpClickTile(page, QA.volaris.x, QA.volaris.y, { building: true }))) {
    errors.push('cross-door: could not click Volaris');
    return;
  }
  for (let i = 0; i < 36; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) break;
    await wait(250);
  }
  await dismissBuildingPanel(page);
  await wait(500);

  if (!(await cdpClickTile(page, 35, 36))) {
    errors.push('cross-door: could not click ground (35,36)');
    return;
  }
  await wait(5000);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    const title = await page.locator('.building-panel__title').textContent();
    errors.push(`cross-door: panel opened after walk crossing door (${title ?? 'unknown'})`);
  }
}

/** After entering caso-1, a ground walk past caso-2 must not open caso-2's panel. */
async function testNoSpuriousDoorPanelAfterGroundWalk(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);

  if (!(await cdpClickTile(page, QA.volaris.x, QA.volaris.y, { building: true }))) {
    errors.push('spurious-panel: could not click Volaris');
    return;
  }
  for (let i = 0; i < 36; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) break;
    await wait(250);
  }
  if ((await page.locator('.building-panel--open').count()) === 0) {
    errors.push('spurious-panel: Volaris panel did not open');
    return;
  }
  await dismissBuildingPanel(page);
  await wait(500);

  if (!(await cdpClickTile(page, 28, 36))) {
    errors.push('spurious-panel: could not ground-click walk tile');
    return;
  }
  await wait(4500);

  if ((await page.locator('.building-panel--open').count()) > 0) {
    const title = await page.locator('.building-panel__title').textContent();
    errors.push(`spurious-panel: panel opened after ground walk (${title ?? 'unknown'})`);
  }
}

async function setupIPhoneTouchPage(browser) {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  try {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
  } catch {
    /* optional in some Chromium builds */
  }
  await ensureTouchEmulation(client);
  return { page, client, context };
}

async function dismissBuildingPanel(page) {
  await page.keyboard.press('Escape');
  await wait(350);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    await page.locator('.building-panel__close').click({ force: true }).catch(() => {});
    await wait(250);
  }
}

async function touchTap(page, client, x, y) {
  await ensureTouchEmulation(client);
  const ix = Math.round(x);
  const iy = Math.round(y);
  try {
    await page.touchscreen.tap(ix, iy);
  } catch {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: ix, y: iy, radiusX: 1, radiusY: 1, force: 1, id: 0 }],
    });
    await wait(80);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
}

async function buildingRoofScreenPoint(page, tx, ty) {
  return buildingTapScreenPoint(page, tx, ty);
}

async function touchPanRevealTile(page, client, tx, ty) {
  const box = await page.locator('#game-canvas').boundingBox();
  if (!box) return;
  const target = await tileToScreen(page, tx, ty);
  if (!target) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.hypot(dx, dy) < box.width * 0.25) return;
  const fromX = cx + box.width * 0.2;
  const toX = fromX - Math.sign(dx) * Math.min(Math.abs(dx), box.width * 0.35);
  const fromY = cy + box.height * 0.15;
  const toY = fromY - Math.sign(dy) * Math.min(Math.abs(dy), box.height * 0.25);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(fromX), y: Math.round(fromY), id: 0 }],
  });
  await wait(40);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: Math.round(toX), y: Math.round(toY), id: 0 }],
  });
  await wait(40);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(300);
}

async function isTileOnScreen(page, tx, ty) {
  return page.evaluate(({ tx, ty }) => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const TILE_W = 128;
    const TILE_H = 64;
    const wx = (tx - ty) * (TILE_W / 2);
    const wy = (tx + ty) * (TILE_H / 2) + TILE_H / 2;
    const zoom = Number(canvas.dataset.zoom ?? 1);
    const camX = Number(canvas.dataset.camX ?? 0);
    const camY = Number(canvas.dataset.camY ?? 0);
    const sx = rect.width / 2 + (camX + wx) * zoom;
    const sy = rect.height / 2 + (camY + wy) * zoom;
    return sx >= 8 && sx <= rect.width - 8 && sy >= 8 && sy <= rect.height - 8;
  }, { tx, ty });
}

async function waitForBuildingPanel(page, maxIter = 48) {
  for (let i = 0; i < maxIter; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) return true;
    await wait(250);
  }
  return false;
}

async function testTouchBuildingEntry(browser, errors, warnings) {
  const houses = [
    { id: 'volaris', tx: QA.volaris.x, ty: QA.volaris.y, title: 'Volaris' },
    { id: 'bain', tx: QA.bain.x, ty: QA.bain.y, title: 'Bain' },
    { id: 'pg', tx: QA.pg.x, ty: QA.pg.y, title: 'P&G' },
  ];

  const qaStartFar = {
    volaris: [31, 36],
  };
  const qaDoorEntry = {
    bain: { char: [39, 30], door: [39, 26] },
    pg: { char: [24, 34], door: [24, 31] },
  };

  for (const house of houses) {
    const { page, client, context } = await setupIPhoneTouchPage(browser);
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
      await page.reload({ waitUntil: 'networkidle' });
      await wait(1500);
      const doorCase = qaDoorEntry[house.id];
      const start = qaStartFar[house.id];
      if (doorCase) {
        await page.evaluate(
          ([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y),
          doorCase.char,
        );
        await wait(200);
      } else if (start) {
        await page.evaluate(
          ([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y),
          start,
        );
        await wait(200);
      }
      const targetTile = doorCase ? doorCase.door : [house.tx, house.ty];
      const pt = doorCase
        ? await tileToScreen(page, targetTile[0], targetTile[1])
        : await buildingRoofScreenPoint(page, house.tx, house.ty);
      if (!pt) {
        errors.push(`touch-house: ${house.id} screen point missing`);
        continue;
      }
      for (
        let pan = 0;
        pan < 3 && !(await isTileOnScreen(page, targetTile[0], targetTile[1]));
        pan++
      ) {
        await touchPanRevealTile(page, client, targetTile[0], targetTile[1]);
        await wait(450);
      }
      if (!(await isTileOnScreen(page, targetTile[0], targetTile[1]))) {
        warnings.push(`touch-house: ${house.id} not visible after pan (skipped)`);
        continue;
      }
      await touchTap(page, client, pt.x, pt.y);
      await wait(doorCase ? 3500 : 8000);
      if (!(await waitForBuildingPanel(page, 16))) {
        const msg = `touch-house: ${house.id} panel did not open after touch`;
        if (doorCase) warnings.push(`${msg} (door tile; CDP viewport)`);
        else errors.push(msg);
        continue;
      }
      const title = await page.locator('.building-panel__title').textContent();
      if (!title?.includes(house.title.split(' ').slice(-1)[0])) {
        errors.push(`touch-house: ${house.id} unexpected title (${title ?? 'none'})`);
      }
      await page.locator('.building-panel__close').click();
      await wait(400);
    } finally {
      await context.close();
    }
  }

  {
    const { page, client, context } = await setupIPhoneTouchPage(browser);
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(1500);
      await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
      await wait(200);
      const doorPt = await tileToScreen(page, 39, 36);
      if (!doorPt) errors.push('touch-door: could not resolve door tile');
      else {
        await touchTap(page, client, doorPt.x, doorPt.y);
        await wait(3500);
        if (!(await waitForBuildingPanel(page, 10))) {
          warnings.push('touch-door: panel did not open after door-tile touch (CDP viewport)');
        }
      }
    } finally {
      await context.close();
    }
  }

  {
    const { page, client, context } = await setupIPhoneTouchPage(browser);
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(1500);
      const near = await tileToScreen(page, 31, 37);
      const building = await buildingRoofScreenPoint(page, QA.volaris.x, QA.volaris.y);
      if (!near || !building) {
        errors.push('touch-adjacent: could not resolve screen points');
      } else if (!(await isTileOnScreen(page, QA.volaris.x, QA.volaris.y))) {
        errors.push('touch-adjacent: Volaris not on screen');
      } else {
        await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 37));
        await wait(300);
        await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('volaris'));
        if (!(await waitForBuildingPanel(page, 96))) {
          errors.push('touch-adjacent: panel did not open when tapping house while near door');
        }
      }
    } finally {
      await context.close();
    }
  }
}

async function readCamX(page) {
  return page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.camX ?? 0));
}

async function openVolarisPanel(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);
  if (!(await cdpClickTile(page, QA.volaris.x, QA.volaris.y, { building: true }))) return false;
  for (let i = 0; i < 36; i++) {
    if ((await page.locator('.building-panel--open').count()) > 0) return true;
    await wait(250);
  }
  return false;
}

async function readAnchorBaseline(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    return {
      wx: Number(c?.dataset.anchorWx ?? 0),
      wy: Number(c?.dataset.anchorWy ?? 0),
    };
  });
}

async function anchorScreenDriftPx(page, baseline) {
  return page.evaluate(
    (base) => {
      const c = document.getElementById('game-canvas');
      const wx = Number(c?.dataset.anchorWx ?? 0);
      const wy = Number(c?.dataset.anchorWy ?? 0);
      const zoom = Number(c?.dataset.zoom ?? 1);
      return Math.hypot((wx - base.wx) * zoom, (wy - base.wy) * zoom);
    },
    baseline,
  );
}

async function pointerTouchDown(client, id, x, y) {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    buttons: 1,
    clickCount: 1,
    pointerType: 'touch',
    pointerId: id,
  });
}

async function pointerTouchUp(client, id, x, y) {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    buttons: 0,
    clickCount: 1,
    pointerType: 'touch',
    pointerId: id,
  });
}

/** Staggered pinch: B down 60ms after A; B up 80ms before A — no camera jump / tap / walk. */
async function testStaggeredPinchNoJump(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(900);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
  await page.evaluate(() => window.__playtestQa?.setSuppressTap?.(4000));
  await wait(200);

  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push('stagger-pinch: no canvas');
    return;
  }
  const cx = canvas.x + canvas.width * 0.78;
  const cy = canvas.y + canvas.height * 0.22;
  const spread = 70;
  const char0 = await readCharTile(page);
  const client = await page.context().newCDPSession(page);
  await ensureTouchEmulation(client);

  const drifts = [];
  const snap = async () => readAnchorBaseline(page);

  await pointerTouchDown(client, 41, cx - spread, cy);
  await wait(60);
  let ref = await snap();

  await pointerTouchDown(client, 42, cx + spread, cy);
  await wait(40);
  drifts.push(await anchorScreenDriftPx(page, ref));
  ref = await snap();

  await pointerTouchUp(client, 42, cx + spread, cy);
  await wait(80);
  drifts.push(await anchorScreenDriftPx(page, ref));
  ref = await snap();

  await pointerTouchUp(client, 41, cx - spread, cy);
  await wait(300);
  drifts.push(await anchorScreenDriftPx(page, ref));

  await dismissBuildingPanel(page);

  const maxDrift = Math.max(...drifts.filter((d) => Number.isFinite(d)));
  if (!Number.isFinite(maxDrift) || maxDrift > 2) {
    errors.push(`stagger-pinch: anchor drift ${maxDrift?.toFixed?.(2) ?? 'nan'}px (max 2px)`);
  }
  if ((await page.locator('.building-panel--open').count()) > 0) {
    errors.push('stagger-pinch: building panel opened');
  }
  const char1 = await readCharTile(page);
  if (char0 && char1 && (char0.x !== char1.x || char0.y !== char1.y)) {
    errors.push(`stagger-pinch: character moved ${JSON.stringify(char0)} -> ${JSON.stringify(char1)}`);
  }
}

async function testPanelDismissDesktop(page, errors) {
  if (!(await openVolarisPanel(page))) {
    errors.push('panel-dismiss: could not open Volaris');
    return;
  }
  for (let i = 0; i < 48; i++) {
    const c = await readCharTile(page);
    if (c && c.x === 39 && c.y === 36) break;
    await wait(250);
  }
  await dismissBuildingPanel(page);
  const charBefore = await readCharTile(page);
  if (!(await cdpClickTile(page, 35, 39))) {
    errors.push('panel-dismiss: ground click failed');
    return;
  }
  await wait(10000);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    errors.push('panel-dismiss: panel still open after outside ground click');
  }
  const charAfter = await readCharTile(page);
  if (charBefore && charAfter && charBefore.x === charAfter.x && charBefore.y === charAfter.y) {
    errors.push('panel-dismiss: character did not walk after dismiss click');
  }
}

async function testPanelSwitchBuilding(page, errors) {
  if (!(await openVolarisPanel(page))) {
    errors.push('panel-switch: could not open Volaris');
    return;
  }
  if (!(await cdpClickBuildingDoor(page, 'bain'))) {
    errors.push('panel-switch: could not click Bain door');
    return;
  }
  try {
    await page.waitForFunction(
      () =>
        document.querySelector('.building-panel--open') &&
        document.querySelector('.building-panel__title')?.textContent?.includes('Bain'),
      { timeout: 28000 },
    );
  } catch {
    const title = await page.locator('.building-panel__title').textContent();
    errors.push(`panel-switch: expected Bain panel (${title ?? 'none'})`);
  }
}

async function testPanelDragKeepsOpen(page, errors) {
  if (!(await openVolarisPanel(page))) {
    errors.push('panel-drag: could not open panel');
    return;
  }
  const camBefore = await readCamX(page);
  const box = await page.locator('#game-canvas').boundingBox();
  if (!box) {
    errors.push('panel-drag: no canvas box');
    return;
  }
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await wait(400);
  if ((await page.locator('.building-panel--open').count()) === 0) {
    errors.push('panel-drag: panel closed during drag (should stay open)');
  }
  const camAfter = await readCamX(page);
  if (Math.abs(camAfter - camBefore) < 1.5) {
    errors.push('panel-drag: camera did not pan');
  }
}

async function testPanelClickInside(page, errors) {
  if (!(await openVolarisPanel(page))) {
    errors.push('panel-inside: could not open panel');
    return;
  }
  await page.locator('.building-panel__title').click();
  await wait(300);
  if ((await page.locator('.building-panel--open').count()) === 0) {
    errors.push('panel-inside: panel closed on click inside sheet');
  }
}

async function testPanelDismissTouch(browser, errors) {
  const { page, client, context } = await setupIPhoneTouchPage(browser);
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(1500);
    await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
    await wait(200);
    await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('volaris'));
    if (!(await waitForBuildingPanel(page, 96))) {
      await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('volaris'));
      if (!(await waitForBuildingPanel(page, 48))) {
        errors.push('panel-touch-close: panel did not open');
        return;
      }
    }
    const close = await page.locator('.building-panel__close').boundingBox();
    if (!close) {
      errors.push('panel-touch-close: close button missing');
      return;
    }
    await touchTap(page, client, close.x + close.width / 2, close.y + close.height / 2);
    await wait(500);
    if ((await page.locator('.building-panel--open').count()) > 0) {
      errors.push('panel-touch-close: panel still open after ✕ touch tap');
    }
  } finally {
    await context.close();
  }
}

async function testMobile375PinchAndUi(browser, errors) {
  const { page, client, context } = await setupIPhoneTouchPage(browser);
  try {
    await page.evaluate(() => window.__playtestQa?.setSuppressTap?.(5000));
    await page.goto(`${BASE}#view=x=120&y=-420&z=0.500`, { waitUntil: 'networkidle' });
    await wait(1200);
    const canvas = await page.locator('#game-canvas').boundingBox();
    if (!canvas) {
      errors.push('mobile375: no canvas');
      return;
    }
    const cx = canvas.x + canvas.width / 2;
    const cy = canvas.y + canvas.height / 2;
    const z0 = (await readCanvasMetrics(page))?.zoom ?? 0;
    const base = await readAnchorBaseline(page);

    await cdpPinchPoints(client, 'touchStart', cx, cy, 55);
    await wait(80);
    await cdpPinchPoints(client, 'touchMove', cx, cy, 130);
    await wait(120);
    const driftOut = await anchorScreenDriftPx(page, base);
    if (!Number.isFinite(driftOut) || driftOut > 2) {
      errors.push(`mobile375: pinch-out midpoint drift ${driftOut?.toFixed?.(2) ?? 'nan'}px`);
    }
    const zOut = (await readCanvasMetrics(page))?.zoom ?? 0;
    if (zOut < z0 * 1.4) {
      errors.push(`mobile375: pinch-out from z=${z0.toFixed(3)} to ${zOut.toFixed(3)} (<40% increase)`);
    }
    await cdpPinchPoints(client, 'touchMove', cx, cy, 50);
    await wait(80);
    await cdpPinchPoints(client, 'touchEnd', cx, cy, 50);
    await wait(100);
    const zIn = (await readCanvasMetrics(page))?.zoom ?? 0;
    if (zIn >= zOut - 0.01) {
      errors.push(`mobile375: pinch-in did not decrease zoom (${zOut.toFixed(3)} -> ${zIn.toFixed(3)})`);
    }
    await wait(200);

    await page.goto(`${BASE}#view=x=200&y=-500&z=${ZOOM_MIN}`, { waitUntil: 'networkidle' });
    await wait(800);
    const camBefore = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return {
        x: Number(c?.dataset.camX ?? 0),
        y: Number(c?.dataset.camY ?? 0),
      };
    });
    const fromX = canvas.x + canvas.width * 0.25;
    const toX = canvas.x + canvas.width * 0.82;
    const panY = canvas.y + canvas.height * 0.55;
    await page.mouse.move(fromX, panY);
    await page.mouse.down();
    for (let i = 0; i < 12; i++) {
      const x = fromX + ((toX - fromX) * (i + 1)) / 12;
      await page.mouse.move(x, panY);
      await wait(35);
    }
    await page.mouse.up();
    await wait(300);
    const camAfter = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return {
        x: Number(c?.dataset.camX ?? 0),
        y: Number(c?.dataset.camY ?? 0),
      };
    });
    const panPx = Math.hypot(
      (camAfter.x - camBefore.x) * ZOOM_MIN,
      (camAfter.y - camBefore.y) * ZOOM_MIN,
    );
    if (panPx < 100) {
      errors.push(`mobile375: one-finger pan at min zoom moved ${panPx.toFixed(0)}px (need >100)`);
    }

    await page.evaluate(() => {
      localStorage.setItem(
        'playtest-checklist-v3',
        JSON.stringify({
          completed: {},
          skipped: false,
          dismissed: true,
          collapsed: true,
          mobileExpanded: false,
        }),
      );
    });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(600);
    const ring = await page.locator('.checklist__ring-btn').boundingBox();
    if (!ring) {
      errors.push('mobile375: checklist pill missing');
    } else {
      await touchTap(page, client, ring.x + ring.width / 2, ring.y + ring.height / 2);
      await wait(300);
      if (!(await page.locator('.checklist__list').isVisible())) {
        errors.push('mobile375: checklist pill touch did not expand list');
      }
    }

    await page.screenshot({ path: path.join(outDir, 'mobile-375-pinch-after.png') });
  } finally {
    await context.close();
  }
}

async function testEnterBuildingChecklist(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1200);
  if (!(await cdpClickBuildingDoor(page, 'volaris'))) {
    errors.push('enter-building: could not click Volaris door');
    return;
  }
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

async function testBuildingWalkEndsOnDoorTile(page, errors) {
  const buildings = await page.evaluate(() => window.__playtestQa?.getBuildingDoorTiles?.() ?? []);
  if (!buildings.length) {
    errors.push('door-arrival: getBuildingDoorTiles hook missing');
    return;
  }
  for (const b of buildings) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
    await page.reload({ waitUntil: 'networkidle' });
    await wait(800);
    const start = QA_WALK_START[b.name] ?? [31, 36];
    await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
    await wait(200);
    if (!(await cdpClickBuildingDoor(page, b.name))) {
      errors.push(`door-arrival: door click failed for ${b.name}`);
      continue;
    }
    for (let i = 0; i < 120; i++) {
      const open = (await page.locator('.building-panel--open').count()) > 0;
      const char = await readCharTile(page);
      if (open && char && char.x === b.door.x && char.y === b.door.y) break;
      await wait(250);
    }
    const char = await readCharTile(page);
    if (!char || char.x !== b.door.x || char.y !== b.door.y) {
      errors.push(
        `door-arrival: ${b.name} expected door (${b.door.x},${b.door.y}) got (${char?.x ?? '?'},${char?.y ?? '?'})`,
      );
    }
    await page.locator('.building-panel__close').click().catch(() => {});
    await wait(300);
  }
}

async function testWalkKeysFirstPress(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.locator('#game-canvas').click();
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(35, 36));
  await wait(200);
  const startTile = await readCharTile(page);
  if (!startTile) {
    errors.push('walk-keys-once: missing start char tile');
    return;
  }
  const already = await page.evaluate(
    () => JSON.parse(localStorage.getItem('playtest-checklist-v3') || '{}').completed?.['walk-keys'],
  );
  if (already) errors.push('walk-keys-once: already checked at start');

  await page.keyboard.down('w');
  await wait(450);
  await page.keyboard.up('w');
  await wait(350);

  const afterTile = await readCharTile(page);
  const checked = await page.evaluate(
    () => JSON.parse(localStorage.getItem('playtest-checklist-v3') || '{}').completed?.['walk-keys'] === true,
  );
  if (!afterTile || afterTile.y >= startTile.y) {
    errors.push('walk-keys-once: expected character to move north on W');
  } else if (!checked) {
    errors.push('walk-keys-once: checklist not ticked on first tile-changing key press');
  }

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('playtest-checklist-v3') || '{}');
    s.completed = { ...s.completed, 'walk-keys': false };
    localStorage.setItem('playtest-checklist-v3', JSON.stringify(s));
  });
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(2, 0));
  await wait(200);
  const blockedStart = await readCharTile(page);
  await page.keyboard.down('w');
  await wait(500);
  await page.keyboard.up('w');
  await wait(200);
  const blockedEnd = await readCharTile(page);
  const checkedBlocked = await page.evaluate(
    () => JSON.parse(localStorage.getItem('playtest-checklist-v3') || '{}').completed?.['walk-keys'] === true,
  );
  if (
    blockedStart &&
    blockedEnd &&
    blockedStart.x === blockedEnd.x &&
    blockedStart.y === blockedEnd.y &&
    checkedBlocked
  ) {
    errors.push('walk-keys-once: ticked without tile change (blocked edge)');
  }
}

async function testChecklistCollapsedPill(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem(
      'playtest-checklist-v3',
      JSON.stringify({
        completed: {
          'walk-around': false,
          'walk-keys': false,
          'move-camera': false,
          zoom: false,
          'enter-building': false,
        },
        skipped: false,
        dismissed: true,
        collapsed: false,
        mobileExpanded: false,
      }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(600);
  const hiddenAfterMigrate = await page.locator('.checklist').evaluate((el) => el.hidden);
  if (hiddenAfterMigrate) {
    errors.push('checklist-pill: dismissed state not migrated (checklist still hidden)');
  }
  const collapsedAfterMigrate = await page
    .locator('.checklist')
    .evaluate((el) => el.classList.contains('checklist--collapsed'));
  if (!collapsedAfterMigrate) {
    errors.push('checklist-pill: expected collapsed pill after dismissed migration');
  }
  const counter = await page.locator('.checklist__counter--in-ring').textContent();
  if (!/\d+\s*\/\s*5/.test(counter ?? '')) {
    errors.push(`checklist-pill: expected desktop 0/5 in ring (got ${counter ?? 'none'})`);
  }
  await page.locator('.checklist__ring-btn').click();
  await wait(250);
  if (!(await page.locator('.checklist__list').isVisible())) {
    errors.push('checklist-pill: list did not expand from pill');
  }
  await page.locator('.checklist__ring-btn').click();
  await wait(200);
  if (!(await page.locator('.checklist').isVisible())) {
    errors.push('checklist-pill: checklist hidden after re-collapse');
  }
  const counterCollapsed = await page.locator('.checklist__counter--in-ring').textContent();
  if (!/\d+\s*\/\s*5/.test(counterCollapsed ?? '')) {
    errors.push('checklist-pill: ring counter missing after re-collapse');
  }
}

async function testMap64RouteLengths(page, errors, routeReport) {
  const data = await page.evaluate(() => {
    const findPath = window.__playtestQa?.findPath;
    const inicio = window.__playtestQa?.inicio;
    const tramos = window.__playtestQa?.mapTramos ?? [];
    if (!findPath || !inicio) return { error: 'hooks missing' };
    const toVolaris = findPath(inicio[0], inicio[1], 39, 36);
    const toPgDirect = findPath(inicio[0], inicio[1], 24, 31);
    const tramoLengths = [];
    let px = inicio[0];
    let py = inicio[1];
    for (const t of tramos) {
      const camino = t.camino ?? [];
      const end = camino[camino.length - 1];
      if (!end) continue;
      const seg = findPath(px, py, end[0], end[1]);
      tramoLengths.push({
        paso: t.paso,
        desde: t.desde,
        hasta: t.hasta,
        astar: seg?.length ?? -1,
        expected: t.casillas,
      });
      px = end[0];
      py = end[1];
    }
    const pgChained = tramoLengths.reduce((sum, t) => sum + (t.astar > 0 ? t.astar : 0), 0);
    return {
      volaris: toVolaris?.length ?? -1,
      pg: pgChained,
      pgDirect: toPgDirect?.length ?? -1,
      tramoLengths,
    };
  });
  if (data.error) {
    errors.push(`map64-routes: ${data.error}`);
    return;
  }
  routeReport.volaris = data.volaris;
  routeReport.pg = data.pg;
  routeReport.pgDirect = data.pgDirect;
  routeReport.tramos = data.tramoLengths;
  if (data.volaris < 6 || data.volaris > 10) {
    errors.push(`map64-routes: inicio→Volaris A* length ${data.volaris} (expected 8±2)`);
  }
  if (data.pg < 44 || data.pg > 48) {
    errors.push(`map64-routes: inicio→P&G A* length ${data.pg} (expected 46±2)`);
  }
  for (const t of data.tramoLengths) {
    if (t.astar < 0) {
      errors.push(`map64-routes: tramo ${t.paso} (${t.desde}→${t.hasta}) no path`);
      continue;
    }
    if (Math.abs(t.astar - t.expected) > 2) {
      errors.push(
        `map64-routes: tramo ${t.paso} A* ${t.astar} vs JSON ${t.expected} (±2)`,
      );
    }
  }
}

async function testMap64EnterablePanels(page, errors) {
  const buildings = await page.evaluate(() => window.__playtestQa?.getEnterableBuildings?.() ?? []);
  if (!buildings.length) {
    errors.push('map64-panels: getEnterableBuildings missing');
    return;
  }
  for (const b of buildings) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
    await page.reload({ waitUntil: 'networkidle' });
    await wait(600);
    const start = QA_WALK_START[b.name] ?? [31, 36];
    await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
    await wait(200);
    if (!(await cdpClickBuildingDoor(page, b.name))) {
      errors.push(`map64-panels: door click failed for ${b.name}`);
      continue;
    }
    for (let i = 0; i < 80; i++) {
      if ((await page.locator('.building-panel--open').count()) > 0) break;
      await wait(250);
    }
    if ((await page.locator('.building-panel--open').count()) === 0) {
      errors.push(`map64-panels: ${b.name} panel did not open`);
      continue;
    }
    const title = await page.locator('.building-panel__title').textContent();
    if (!title?.includes(b.panelTitle.split(' ')[0])) {
      errors.push(`map64-panels: ${b.name} title mismatch (${title ?? 'none'})`);
    }
    await page.locator('.building-panel__close').click().catch(() => {});
    await wait(250);
  }
}

async function testMap64PaisajeNoPanel(page, errors) {
  const approachOk = await page.evaluate(() => {
    const findPath = window.__playtestQa?.findPath;
    const inicio = window.__playtestQa?.inicio;
    if (!findPath || !inicio) return false;
    return (findPath(inicio[0], inicio[1], 38, 41)?.length ?? 0) > 0;
  });
  if (!approachOk) {
    errors.push('map64-paisaje: muro approach tile (38,41) not reachable from inicio');
  }

  for (const spot of [
    { name: 'obelisco', ...QA.obelisco },
    { name: 'redoma', ...QA.redoma },
    { name: 'muro', ...QA.muro },
  ]) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(700);
    if (!(await cdpClickTile(page, spot.tx, spot.ty))) {
      errors.push(`map64-paisaje: could not click ${spot.name}`);
      continue;
    }
    await wait(1200);
    if ((await page.locator('.building-panel--open').count()) > 0) {
      errors.push(`map64-paisaje: ${spot.name} opened a panel`);
    }
  }
}

async function captureMap64ProofScreenshots(browser, errors, routeReport) {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    await wait(800);
    await desktop.screenshot({ path: path.join(outDir, 'map64-start-view.png') });
    await desktop.screenshot({ path: path.join(outDir, DESKTOP_PROOF), fullPage: false });

    await desktop.evaluate(() => {
      const c = document.getElementById('game-canvas');
      if (c) c.dispatchEvent(new WheelEvent('wheel', { deltaY: 8000, ctrlKey: true, bubbles: true }));
    });
    await wait(400);
    await desktop.screenshot({ path: path.join(outDir, 'map64-full-map-zoomout.png') });

    if (await cdpClickTile(desktop, QA.volaris.x, QA.volaris.y, { building: true })) {
      for (let i = 0; i < 48; i++) {
        if ((await desktop.locator('.building-panel--open').count()) > 0) break;
        await wait(250);
      }
    }
    await desktop.screenshot({ path: path.join(outDir, 'map64-volaris-panel.png') });
    await desktop.locator('.building-panel__close').click().catch(() => {});
    await wait(300);

    await desktop.goto(`${BASE}#view=x=1420&y=-1580&z=0.75`, { waitUntil: 'networkidle' });
    await wait(700);
    await desktop.screenshot({ path: path.join(outDir, 'map64-obelisco-view.png') });

    await desktop.goto(`${BASE}#view=x=920&y=-1580&z=0.75`, { waitUntil: 'networkidle' });
    await wait(700);
    await desktop.screenshot({ path: path.join(outDir, 'map64-redoma-view.png') });

    await desktop.goto(`${BASE}#view=x=320&y=-2424&z=0.88`, { waitUntil: 'networkidle' });
    await wait(700);
    await desktop.screenshot({ path: path.join(outDir, 'map64-muro-view.png') });

    for (const [zLabel, z] of [
      ['min', ZOOM_MIN],
      ['mid', 1],
      ['max', ZOOM_MAX],
    ]) {
      await desktop.goto(`${BASE}#view=x=2480&y=-4080&z=${z}`, { waitUntil: 'networkidle' });
      await wait(600);
      await desktop.screenshot({ path: path.join(outDir, `map64-edge-corner-63-63-${zLabel}.png`) });
    }

    const buildingViews = [
      { file: 'map64-volaris-door-y.png', hash: '#view=x=920&y=-2180&z=0.95' },
      { file: 'map64-pg-door-x.png', hash: '#view=x=-280&y=-2180&z=0.95' },
      { file: 'map64-sambil-door.png', hash: '#view=x=1680&y=-920&z=0.85' },
      { file: 'map64-catedral-door.png', hash: '#view=x=-920&y=-920&z=0.85' },
      { file: 'map64-flor-door-x.png', hash: '#view=x=1520&y=-3180&z=0.9' },
      { file: 'map64-estudio-door.png', hash: '#view=x=320&y=-2180&z=0.88' },
      { file: 'map64-obelisco-vs-catedral.png', hash: '#view=x=-520&y=-2380&z=0.55' },
    ];
    for (const v of buildingViews) {
      await desktop.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(650);
      await desktop.screenshot({ path: path.join(outDir, v.file) });
    }
  } catch (e) {
    errors.push(`map64-screenshots: ${String(e)}`);
  } finally {
    await desktop.close();
  }

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    await wait(800);
    await mobile.screenshot({ path: path.join(outDir, MOBILE_PROOF), fullPage: false });
  } catch (e) {
    errors.push(`map64-screenshots-mobile: ${String(e)}`);
  } finally {
    await mobile.close();
  }

  routeReport.screenshots = outDir;
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

async function waitForPreview(url, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await wait(500);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const preview = spawn('npm', ['run', 'preview', '--', '--port', '4173', '--strictPort'], {
    cwd: root,
    stdio: 'pipe',
  });
  if (!(await waitForPreview(BASE))) {
    preview.kill('SIGTERM');
    console.error('preview server did not become ready at', BASE);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];
  const routeReport = {};
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
    await testWalkGridFootprintRules(desktop, errors);
    await testEnterBuildingChecklist(desktop, errors);
    await testGroundWalkCrossingDoorNoPanel(desktop, errors);
    await testNoSpuriousDoorPanelAfterGroundWalk(desktop, errors);
    await testNoDoorReopenOnKeypressAfterClose(desktop, errors);
    await testPanelDismissDesktop(desktop, errors);
    await testPanelSwitchBuilding(desktop, errors);
    await testPanelDragKeepsOpen(desktop, errors);
    await testPanelClickInside(desktop, errors);
    await testBuildingWalkEndsOnDoorTile(desktop, errors);
    await testWalkKeysFirstPress(desktop, errors);
    await testChecklistCollapsedPill(desktop, errors);
    await testSkipRingDesktop(desktop, errors);

    await testMap64RouteLengths(desktop, errors, routeReport);
    await testMap64EnterablePanels(desktop, errors);
    await testMap64PaisajeNoPanel(desktop, errors);
    await testStaggeredPinchNoJump(desktop, errors);

    await testTouchBuildingEntry(browser, errors, warnings);
    await testPanelDismissTouch(browser, errors);
    await testMobile375PinchAndUi(browser, errors);

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

    await captureMap64ProofScreenshots(browser, errors, routeReport);

    const report = {
      errors,
      warnings,
      routeReport,
      screenshots: outDir,
      proof: {
        desktop: path.join(outDir, DESKTOP_PROOF),
        mobile: path.join(outDir, MOBILE_PROOF),
      },
      finishedAt: new Date().toISOString(),
    };
    await writeFile(path.join(outDir, 'qa-pinch-results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    preview.kill('SIGKILL');
  }
  return errors.length;
}

main()
  .then((errorCount) => {
    const n = Number(errorCount) || 0;
    process.exit(n > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
