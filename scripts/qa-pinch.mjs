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

const ZOOM_MAX = 1.5;
const MAP_VISIBLE_MIN = 0.3;
const MAP_FIT_MARGIN_PX = 16;
const MAP64_TILE_W = 128;
const MAP64_TILE_H = 64;
const MAP64_SIZE = 64;

/** Match `zoomMinForViewport` in cameraControl.ts (64×64 iso bounds). */
function zoomMinForViewportJs(screenW, screenH, margin = MAP_FIT_MARGIN_PX) {
  const halfW = MAP64_TILE_W / 2;
  const halfH = MAP64_TILE_H / 2;
  const c0 = { x: 0, y: 0 };
  const c1 = { x: (MAP64_SIZE - 1) * halfW, y: (MAP64_SIZE - 1) * halfH };
  const c2 = { x: -(MAP64_SIZE - 1) * halfW, y: (MAP64_SIZE - 1) * halfH };
  const c3 = { x: 0, y: (MAP64_SIZE - 1) * halfH * 2 };
  const minX = Math.min(c0.x, c1.x, c2.x, c3.x) - MAP64_TILE_W;
  const maxX = Math.max(c0.x, c1.x, c2.x, c3.x) + MAP64_TILE_W;
  const minY = Math.min(c0.y, c1.y, c2.y, c3.y);
  const maxY = Math.max(c0.y, c1.y, c2.y, c3.y) + MAP64_TILE_H * 2;
  const mapW = maxX - minX;
  const mapH = maxY - minY;
  const innerW = Math.max(1, screenW - margin * 2);
  const innerH = Math.max(1, screenH - margin * 2);
  const fit = Math.min(innerW / mapW, innerH / mapH);
  return Math.min(ZOOM_MAX, Math.max(0.04, fit));
}
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
      zoomMin: Number(c.dataset.zoomMin),
      mapFullyVisible: c.dataset.mapFullyVisible === '1',
      mapTop: Number(c.dataset.mapTop),
      mapBottom: Number(c.dataset.mapBottom),
      fitTop: Number(c.dataset.fitTop),
      fitBottom: Number(c.dataset.fitBottom),
    };
  });
}

async function testMinZoomPhoneFraming(browser, errors) {
  for (const { label, width, height } of [
    { label: 'phone375', width: 375, height: 812 },
    { label: 'phone390', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
      await page.reload({ waitUntil: 'networkidle' });
      await wait(800);
      const canvas = await page.locator('#game-canvas').boundingBox();
      if (!canvas) {
        errors.push(`${label}-frame: no canvas`);
        continue;
      }
      await wheelOutToMinZoom(page, canvas);
      const m = await readCanvasMetrics(page);
      if (!m) {
        errors.push(`${label}-frame: metrics missing`);
        continue;
      }
      if (m.mapBottom > m.fitBottom - 6) {
        errors.push(
          `${label}-frame: map bottom ${m.mapBottom.toFixed(0)} overlaps pill (fit bottom ${m.fitBottom.toFixed(0)})`,
        );
      }
      const freeCy = (m.fitTop + m.fitBottom) / 2;
      const mapCy = (m.mapTop + m.mapBottom) / 2;
      if (Math.abs(mapCy - freeCy) > 48) {
        errors.push(
          `${label}-frame: map not centered in free rect (Δy=${Math.abs(mapCy - freeCy).toFixed(0)}px)`,
        );
      }
      await page.screenshot({
        path: path.join(outDir, `${label}-min-zoom-default-pill.png`),
      });
    } finally {
      await page.close();
    }
  }
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

  const zMinDesktop = zoomMinForViewportJs(1280, 800);
  const zoomLevels = [zMinDesktop, 0.85, ZOOM_MAX];
  const samples = [];

  for (const z of zoomLevels) {
    const hash = `#view=x=${cam.x}&y=${cam.y}&z=${z.toFixed(3)}`;
    await page.goto(`${BASE}${hash}`, { waitUntil: 'networkidle' });
    await wait(900);
    await page.evaluate((targetZ) => window.__playtestQa?.setZoom?.(targetZ), z);
    await wait(200);
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
  const zMin = Number.isFinite(m.zoomMin) ? m.zoomMin : zoomMinForViewportJs(1280, 800);
  if (m.zoom < zMin - 0.001 || m.zoom > ZOOM_MAX + 0.001) {
    errors.push(`${name}: ${label} zoom out of range (${m.zoom}, min=${zMin.toFixed(4)})`);
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
    if (next.mapFullyVisible && dz < 0.02) return;
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

  const zMin = Number.isFinite(prev?.zoomMin) ? prev.zoomMin : zoomMinForViewportJs(canvas.width, canvas.height);
  if (prev && Math.abs(prev.zoom - zMin) > 0.02) {
    errors.push(`${name}: wheel-out did not reach min zoom (${prev.zoom} vs ${zMin})`);
  }
}

async function wheelOutToMinZoom(page, canvas) {
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 48; i++) {
    const m = await readCanvasMetrics(page);
    if (m && Number.isFinite(m.zoomMin) && Math.abs(m.zoom - m.zoomMin) < 0.003) break;
    await page.mouse.wheel(0, 120);
    await wait(25);
  }
  await wait(200);
}

async function testMinZoomFullMapVisible(browser, errors) {
  for (const { label, width, height, desktopChecklist } of [
    { label: 'mobile375', width: 375, height: 812, desktopChecklist: false },
    { label: 'ipad820', width: 820, height: 1180, desktopChecklist: false },
    { label: 'desktop1280', width: 1280, height: 800, desktopChecklist: true },
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await wait(900);
      if (desktopChecklist) {
        await page.evaluate(() =>
          localStorage.setItem(
            'playtest-checklist-v3',
            JSON.stringify({
              completed: {},
              skipped: false,
              dismissed: false,
              collapsed: false,
              mobileExpanded: false,
            }),
          ),
        );
        await page.reload({ waitUntil: 'networkidle' });
        await wait(900);
      }
      const canvas = await page.locator('#game-canvas').boundingBox();
      if (!canvas) {
        errors.push(`${label}-fullmap: no canvas`);
        continue;
      }
      await wheelOutToMinZoom(page, canvas);
      const m = await readCanvasMetrics(page);
      if (!m) {
        errors.push(`${label}-fullmap: metrics missing`);
        continue;
      }
      const expectedMin = Number.isFinite(m.zoomMin) ? m.zoomMin : zoomMinForViewportJs(width, height);
      if (Math.abs(m.zoom - expectedMin) > 0.025) {
        errors.push(
          `${label}-fullmap: zoom ${m.zoom.toFixed(4)} not at fit min ${expectedMin.toFixed(4)}`,
        );
      }
      const fullOk =
        m.mapFullyVisible ||
        (Number(m.mapFracW) >= 0.995 && Number(m.mapFracH) >= 0.995);
      if (!fullOk) {
        errors.push(`${label}-fullmap: map bounds not fully inside viewport at min zoom`);
      }
      const vis = await page.evaluate(() => {
        const c = document.getElementById('game-canvas');
        return {
          fracW: Number(c?.dataset.mapFracW),
          fracH: Number(c?.dataset.mapFracH),
        };
      });
      if (label === 'ipad820') {
        const frame = await readCanvasMetrics(page);
        if (frame) {
          const freeCy = (frame.fitTop + frame.fitBottom) / 2;
          const mapCy = (frame.mapTop + frame.mapBottom) / 2;
          if (Math.abs(mapCy - freeCy) > 40) {
            errors.push(
              `ipad820-fullmap: map not vertically centered in free rect (Δy=${Math.abs(mapCy - freeCy).toFixed(0)}px)`,
            );
          }
        }
        await page.screenshot({
          path: path.join(outDir, 'ipad-820-min-zoom-default-pill.png'),
        });
      }
      if (vis.fracW < 0.995 || vis.fracH < 0.995) {
        errors.push(
          `${label}-fullmap: map visible fraction ${vis.fracW?.toFixed(3)}, ${vis.fracH?.toFixed(3)} (need ≥0.995)`,
        );
      }
    } finally {
      await page.close();
    }
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
  const doorPt = await page.evaluate(
    ([x, y]) => {
      const buildings = window.__playtestQa?.getEnterableBuildings?.() ?? [];
      const hit = buildings.find((b) => b.door?.x === x && b.door?.y === y);
      if (!hit) return null;
      return window.__playtestQa?.doorScreenPoint?.(hit.name) ?? null;
    },
    [tx, ty],
  );
  if (doorPt) return doorPt;
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
  await page.evaluate(() => {
    if (window.__playtestQa?.isInInterior?.()) {
      window.__playtestQa?.exitInterior?.();
    }
  });
  await wait(200);
  await page.keyboard.press('Escape');
  await wait(350);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    await page.locator('[data-exit], .building-panel__salir').first().click({ force: true }).catch(() => {});
    await wait(250);
  }
  await page.evaluate(() => window.__playtestQa?.dismissBuildingPanel?.());
  await wait(200);
}

async function waitForInterior(page, maxMs = 20000) {
  for (let i = 0; i < maxMs / 250; i++) {
    const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.() === true);
    if (inside) return true;
    await wait(250);
  }
  return false;
}

/** Run #30: panel overlay on map — outside tap closes without walking (next tap walks). */
async function testRun30DismissOutsideTapNoWalk(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
  await page.evaluate(() => window.__playtestQa?.showPanelOverlayForQa?.('Volaris'));
  await wait(300);
  const charBefore = await readCharTile(page);
  const pt = await tileToScreen(page, 35, 39);
  if (!pt) {
    errors.push('run30-dismiss: could not resolve screen point');
    return;
  }
  await page.evaluate(
    ([x, y]) => window.__playtestQa?.tapScreen?.(x, y),
    [pt.x, pt.y],
  );
  await wait(400);
  if ((await page.locator('.building-panel--open').count()) > 0) {
    errors.push('run30-dismiss: panel still open after outside tap');
  }
  const charAfterDismiss = await readCharTile(page);
  if (
    charBefore &&
    charAfterDismiss &&
    (charBefore.x !== charAfterDismiss.x || charBefore.y !== charAfterDismiss.y)
  ) {
    errors.push('run30-dismiss: outside tap moved character (should only close panel)');
  }
  const goal0 = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
  if (goal0 && goal0.x !== undefined) {
    errors.push('run30-dismiss: path preview started on dismiss tap');
  }
  await page.evaluate(
    ([x, y]) => window.__playtestQa?.tapScreen?.(x, y),
    [pt.x, pt.y],
  );
  await wait(3500);
  const charAfterWalk = await readCharTile(page);
  if (
    charBefore &&
    charAfterWalk &&
    charBefore.x === charAfterWalk.x &&
    charBefore.y === charAfterWalk.y
  ) {
    errors.push('run30-dismiss: second tap did not start a walk');
  }
}

/** Run #30: roof tap while walking must not open interior until door arrival. */
async function testRun30NoEarlyInteriorOnRoofTap(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
  await page.evaluate(() => window.__playtestQa?.tapMapTile?.(46, 36));
  await wait(400);
  if (!(await cdpClickTile(page, QA.bain.x, QA.bain.y, { building: true }))) {
    errors.push('run30-early-entry: could not tap Bain building');
    return;
  }
  for (let i = 0; i < 8; i++) {
    await wait(250);
    const open = await page.evaluate(() => window.__playtestQa?.isBuildingPanelOpen?.());
    const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.());
    const char = await readCharTile(page);
    if (open || inside) {
      if (char && (char.x !== 39 || char.y !== 26)) {
        errors.push(
          `run30-early-entry: interior/panel opened before door (char at ${char.x},${char.y})`,
        );
        return;
      }
    }
  }
  for (let i = 0; i < 80; i++) {
    const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.());
    if (inside) break;
    await wait(250);
  }
  if (!(await page.evaluate(() => window.__playtestQa?.isInInterior?.()))) {
    errors.push('run30-early-entry: never entered Bain interior after walk');
  }
}

/** Run #30: long walk survives staggered pinches and drags. */
async function testRun30WalkSurvivesPinch(page, errors, client) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
  await page.evaluate(() => window.__playtestQa?.tapMapTile?.(46, 36));
  await wait(500);
  const goal = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
  if (!goal?.x) {
    errors.push('run30-walk-pinch: no walk goal after map tap');
    return;
  }
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push('run30-walk-pinch: no canvas');
    return;
  }
  const cx = canvas.x + canvas.width * 0.5;
  const cy = canvas.y + canvas.height * 0.45;
  for (let p = 0; p < 5; p++) {
    const spread = 55 + p * 12;
    await pointerTouchDown(client, 80 + p * 2, cx - spread, cy);
    await wait(50);
    await pointerTouchDown(client, 81 + p * 2, cx + spread, cy);
    await wait(80);
    await pointerTouchMove(client, 80 + p * 2, cx - spread - 20, cy);
    await pointerTouchMove(client, 81 + p * 2, cx + spread + 20, cy);
    await wait(60);
    await pointerTouchUp(client, 81 + p * 2, cx + spread + 20, cy);
    await wait(70);
    await pointerTouchUp(client, 80 + p * 2, cx - spread - 20, cy);
    await wait(120);
  }
  for (let d = 0; d < 2; d++) {
    await pointerTouchDown(client, 90 + d, cx, cy - 40);
    for (let i = 0; i < 8; i++) {
      await pointerTouchMove(client, 90 + d, cx + i * 8, cy - 40 + i * 10);
      await wait(30);
    }
    await pointerTouchUp(client, 90 + d, cx + 56, cy + 40);
    await wait(200);
  }
  const goalMid = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
  if (!goalMid?.x) {
    errors.push('run30-walk-pinch: walk goal cleared during pinch/drag');
    return;
  }
  for (let i = 0; i < 100; i++) {
    const g = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
    const char = await readCharTile(page);
    if (!g?.x && char && char.x === goal.x && char.y === goal.y) break;
    if (!g?.x && char && (char.x !== goal.x || char.y !== goal.y)) {
      await wait(250);
      continue;
    }
    await wait(250);
  }
  const charEnd = await readCharTile(page);
  const md = charEnd ? Math.abs(charEnd.x - goal.x) + Math.abs(charEnd.y - goal.y) : 99;
  if (!charEnd || md > 1) {
    errors.push(
      `run30-walk-pinch: expected (${goal.x},${goal.y}) got (${charEnd?.x ?? '?'},${charEnd?.y ?? '?'}), md=${md}`,
    );
  }
}

/** Run #30: enter + exit all 9 buildings (click path). */
async function testRun30AllInteriorsClick(page, errors) {
  const buildings = await page.evaluate(() => window.__playtestQa?.getEnterableBuildings?.() ?? []);
  for (const b of buildings) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(600);
    const start = QA_WALK_START[b.name] ?? [31, 36];
    await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
    await wait(200);
    if (!(await cdpClickBuildingDoor(page, b.name))) {
      errors.push(`run30-interiors: door click failed ${b.name}`);
      continue;
    }
    if (!(await waitForInterior(page))) {
      errors.push(`run30-interiors: ${b.name} did not enter interior`);
      continue;
    }
    await wait(400);
    const hash = await page.evaluate(() => location.hash);
    if (!hash.includes(`in=${b.name}`)) {
      errors.push(`run30-interiors: hash missing in=${b.name} (${hash})`);
    }
    await page.keyboard.press('Escape');
    await wait(600);
    if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) {
      errors.push(`run30-interiors: ${b.name} still inside after Esc`);
    }
    const char = await readCharTile(page);
    if (!char || char.x !== b.door.x || char.y !== b.door.y) {
      errors.push(
        `run30-interiors: ${b.name} exit char (${char?.x},${char?.y}) not door (${b.door.x},${b.door.y})`,
      );
    }
  }
}

/** Run #31: browser back exits interior without leaving the app. */
async function testRun31HistoryBackExitsInterior(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(39, 30));
  await cdpClickBuildingDoor(page, 'bain');
  if (!(await waitForInterior(page))) {
    errors.push('run31-history: failed to enter Bain');
    return;
  }
  const origin = await page.evaluate(() => location.origin + location.pathname);
  await page.goBack();
  await wait(700);
  if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) {
    errors.push('run31-history: still in interior after goBack');
  }
  const after = await page.evaluate(() => location.origin + location.pathname);
  if (after !== origin) {
    errors.push('run31-history: goBack left the playtest route');
  }
}

/** Run #31: deep-link opens interior + panel on first load. */
async function testRun31DeepLinkInterior(page, errors) {
  await page.goto(`${BASE}#view=x=0&y=0&z=0.85&in=flor`, { waitUntil: 'networkidle' });
  await wait(1200);
  if (!(await page.evaluate(() => window.__playtestQa?.isInInterior?.()))) {
    errors.push('run31-deeplink: flor interior not active on boot');
  }
  if ((await page.locator('.building-panel--open').count()) < 1) {
    errors.push('run31-deeplink: interior panel not open on boot');
  }
  const hash = await page.evaluate(() => location.hash);
  if (!hash.includes('in=flor')) {
    errors.push(`run31-deeplink: hash lost interior (${hash})`);
  }
}

/** Run #31: per-building interior grid sizes. */
async function testRun31InteriorSizes(page, errors) {
  const expected = {
    catedral: [8, 8],
    sambil: [8, 8],
    flor: [7, 7],
    bain: [6, 6],
  };
  for (const [name, [ew, eh]] of Object.entries(expected)) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(600);
    await page.evaluate(
      ([n]) => window.__playtestQa?.enterInterior?.(n),
      [name],
    );
    await wait(500);
    const dims = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return { w: Number(c?.dataset.interiorW), h: Number(c?.dataset.interiorH) };
    });
    if (dims.w !== ew || dims.h !== eh) {
      errors.push(`run31-size-${name}: expected ${ew}x${eh} got ${dims.w}x${dims.h}`);
    }
    await page.evaluate(() => window.__playtestQa?.exitInterior?.());
    await wait(400);
  }
}

/** Run #31: mid-walk map tap cancels pending Sambil entry. */
async function testRun31SambilWalkCancel(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(800);
  await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(39, 36));
  await page.evaluate(() => window.__playtestQa?.walkToBuilding?.('sambil'));
  await wait(350);
  await page.evaluate(() => window.__playtestQa?.tapMapTile?.(44, 18));
  await wait(4500);
  const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.());
  const char = await readCharTile(page);
  if (inside) {
    errors.push('run31-sambil-cancel: entered interior after diverting walk');
  }
  if (char && char.x === 39 && char.y === 26) {
    errors.push('run31-sambil-cancel: character still on Sambil door after cancel walk');
  }
}

/** Run #31: exit tile tap at high zoom. */
async function testRun31InteriorExitTileZoom(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(600);
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('bain'));
  await waitForInterior(page);
  await page.evaluate(() => window.__playtestQa?.setZoom?.(1.5));
  await wait(300);
  const pt = await page.evaluate(() => window.__playtestQa?.interiorTileScreenPoint?.(3, 5));
  if (!pt) {
    errors.push('run31-exit-tile: could not compute exit screen point');
    return;
  }
  await page.evaluate(([x, y]) => window.__playtestQa?.tapScreen?.(x, y), [pt.x, pt.y]);
  await wait(800);
  if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) {
    errors.push('run31-exit-tile: still inside after exit tap at zoom 1.5');
  }
}

async function testRun31ChecklistOutsideTapMobile(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(800);
    await page.locator('.checklist__ring-btn').click();
    await wait(300);
    const expanded = await page.locator('.checklist__list').isVisible();
    if (!expanded) {
      errors.push('run31-checklist: could not expand mobile checklist');
      return;
    }
    const charBefore = await readCharTile(page);
    const pt = await tileToScreen(page, 35, 39);
    if (!pt) {
      errors.push('run31-checklist: no screen point');
      return;
    }
    await page.evaluate(([x, y]) => window.__playtestQa?.tapScreen?.(x, y), [pt.x, pt.y]);
    await wait(400);
    if (await page.locator('.checklist__list').isVisible()) {
      errors.push('run31-checklist: list still open after outside tap');
    }
    const goal = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
    if (goal?.x !== undefined) {
      errors.push('run31-checklist: outside tap started walk while dismissing sheet');
    }
    const charAfter = await readCharTile(page);
    if (
      charBefore &&
      charAfter &&
      (charBefore.x !== charAfter.x || charBefore.y !== charAfter.y)
    ) {
      errors.push('run31-checklist: character moved on dismiss tap');
    }
  } finally {
    await page.close();
  }
}

/** Run #32: doorScreenPoint tap must enter every building @375 min zoom. */
async function testRun32DoorPointEntersAll375(browser, errors) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    const buildings = await page.evaluate(() => window.__playtestQa?.getEnterableBuildings?.() ?? []);
    for (const b of buildings) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(700);
      await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
      const canvas = await page.locator('#game-canvas').boundingBox();
      if (canvas) await wheelOutToMinZoom(page, canvas);
      await wait(400);
      const start = QA_WALK_START[b.name] ?? [31, 36];
      await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
      await wait(250);
      const pt = await page.evaluate((n) => window.__playtestQa?.doorScreenPoint?.(n), b.name);
      if (!pt?.x) {
        errors.push(`run32-door-enter: no door point ${b.name}`);
        continue;
      }
      await page.evaluate(([x, y]) => window.__playtestQa?.tapScreen?.(x, y), [pt.x, pt.y]);
      if (!(await waitForInterior(page, 25000))) {
        errors.push(`run32-door-enter: ${b.name} did not enter via door point @375 min zoom`);
      }
      await page.evaluate(() => window.__playtestQa?.exitInterior?.());
      await wait(500);
    }
  } finally {
    await page.close();
  }
}

/** Run #32: outside tap on expanded/peek interior sheet must not walk or toast. */
async function testRun32SheetOutsideTapMobile(browser, errors) {
  for (const name of ['flor', 'volaris']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(800);
      await page.evaluate(([n]) => window.__playtestQa?.enterInterior?.(n), [name]);
      await waitForInterior(page);
      await wait(500);
      await page.evaluate(() => window.__playtestQa?.expandInteriorSheet?.());
      await wait(400);
      const hasPeekBefore = await page.evaluate(() =>
        document.querySelector('.building-panel--peek') !== null,
      );
      if (hasPeekBefore) {
        errors.push(`run32-sheet-${name}: expected expanded sheet before outside tap`);
      }
      await page.evaluate(() => window.__playtestQa?.tapScreen?.(187, 60));
      await wait(500);
      const toast = await page.locator('.playtest-toast--visible').count();
      if (toast > 0) {
        errors.push(`run32-sheet-${name}: toast after outside tap on expanded sheet`);
      }
      const goal = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
      if (goal?.x !== undefined) {
        errors.push(`run32-sheet-${name}: walk goal set after outside tap (expanded)`);
      }
      const hasPeekAfter = await page.evaluate(() =>
        document.querySelector('.building-panel--peek') !== null,
      );
      if (!hasPeekAfter) {
        errors.push(`run32-sheet-${name}: sheet should collapse to peek, not close`);
      }
      await page.evaluate(() => window.__playtestQa?.collapseInteriorSheetToPeek?.());
      await wait(300);
      await page.evaluate(() => window.__playtestQa?.tapScreen?.(187, 60));
      await wait(400);
      if ((await page.locator('.playtest-toast--visible').count()) > 0) {
        errors.push(`run32-sheet-${name}: toast after outside tap in peek`);
      }
      if ((await page.evaluate(() => window.__playtestQa?.readWalkGoal?.()))?.x !== undefined) {
        errors.push(`run32-sheet-${name}: walk started from outside tap in peek`);
      }
      if (!(await page.evaluate(() => window.__playtestQa?.isInInterior?.()))) {
        errors.push(`run32-sheet-${name}: interior closed after peek outside tap`);
      }
    } finally {
      await page.close();
    }
  }
}

/** Run #32: exit tile reachable in every interior on phone. */
async function testRun32InteriorExitAllMobile(browser, errors) {
  const buildings = [
    'estudio',
    'volaris',
    'bain',
    'mentoria',
    'finoa',
    'pg',
    'sambil',
    'catedral',
    'flor',
  ];
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    for (const name of buildings) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(600);
      await page.evaluate(([n]) => window.__playtestQa?.enterInterior?.(n), [name]);
      await waitForInterior(page);
      await wait(400);
      const exit = await page.evaluate((n) => {
        const defs = {
          estudio: [3, 5],
          volaris: [3, 5],
          bain: [3, 5],
          mentoria: [3, 5],
          finoa: [3, 5],
          pg: [3, 5],
          sambil: [4, 7],
          catedral: [4, 7],
          flor: [3, 6],
        };
        const [tx, ty] = defs[n] ?? [3, 5];
        return window.__playtestQa?.interiorTileScreenPoint?.(tx, ty);
      }, name);
      if (!exit?.x) {
        errors.push(`run32-exit-${name}: no exit screen point`);
        continue;
      }
      await page.evaluate(([x, y]) => window.__playtestQa?.tapScreen?.(x, y), [exit.x, exit.y]);
      await wait(900);
      if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) {
        errors.push(`run32-exit-${name}: still inside after exit tile tap`);
      }
    }
  } finally {
    await page.close();
  }
}

/** Run #32: walk survives 5 pinch cycles + 2 drags (5 trials). */
async function testRun32WalkPinchFiveTrials(page, errors, client) {
  for (let trial = 0; trial < 5; trial++) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(700);
    await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(31, 36));
    await page.evaluate(() => window.__playtestQa?.tapMapTile?.(46, 36));
    await wait(500);
    const goal = await page.evaluate(() => window.__playtestQa?.readWalkGoal?.());
    if (!goal?.x) {
      errors.push(`run32-walk-pinch trial ${trial}: no walk goal`);
      continue;
    }
    const canvas = await page.locator('#game-canvas').boundingBox();
    if (!canvas) continue;
    const cx = canvas.x + canvas.width * 0.5;
    const cy = canvas.y + canvas.height * 0.45;
    for (let p = 0; p < 5; p++) {
      const spread = 55 + p * 12;
      await pointerTouchDown(client, 80 + p * 2 + trial, cx - spread, cy);
      await wait(50);
      await pointerTouchDown(client, 81 + p * 2 + trial, cx + spread, cy);
      await wait(80);
      await pointerTouchUp(client, 81 + p * 2 + trial, cx + spread, cy);
      await wait(70);
      await pointerTouchUp(client, 80 + p * 2 + trial, cx - spread, cy);
      await wait(120);
    }
    for (let d = 0; d < 2; d++) {
      await pointerTouchDown(client, 90 + d + trial * 3, cx, cy - 40);
      for (let i = 0; i < 8; i++) {
        await pointerTouchMove(client, 90 + d + trial * 3, cx + i * 8, cy - 40 + i * 10);
        await wait(30);
      }
      await pointerTouchUp(client, 90 + d + trial * 3, cx + 56, cy + 40);
      await wait(200);
    }
    if (!(await page.evaluate(() => window.__playtestQa?.readWalkGoal?.()))?.x) {
      errors.push(`run32-walk-pinch trial ${trial}: walk goal cleared during gesture`);
    }
  }
}

/** Run #32: roof tap only enters on door arrival (pg, sambil, catedral, flor). */
async function testRun32ArrivalOnlyFour(page, errors) {
  const cases = [
    { name: 'pg', start: [22, 34], roof: QA.pg },
    { name: 'sambil', start: [39, 36], roof: { x: 39, y: 25 } },
    { name: 'catedral', start: [31, 36], roof: { x: 31, y: 25 } },
    { name: 'flor', start: [46, 37], roof: { x: 46, y: 25 } },
  ];
  for (const c of cases) {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await wait(700);
    await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), c.start);
    await wait(200);
    if (!(await cdpClickTile(page, c.roof.x, c.roof.y, { building: true }))) {
      errors.push(`run32-arrival-${c.name}: roof tap failed`);
      continue;
    }
    await wait(400);
    for (let i = 0; i < 6; i++) {
      await wait(250);
      const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.());
      const char = await readCharTile(page);
      const b = await page.evaluate(
        (n) => window.__playtestQa?.getEnterableBuildings?.().find((x) => x.name === n),
        c.name,
      );
      if (inside && b?.door && char && (char.x !== b.door.x || char.y !== b.door.y)) {
        errors.push(`run32-arrival-${c.name}: entered before door tile`);
        break;
      }
    }
    for (let i = 0; i < 80; i++) {
      if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) break;
      await wait(250);
    }
    if (!(await page.evaluate(() => window.__playtestQa?.isInInterior?.()))) {
      errors.push(`run32-arrival-${c.name}: never entered after roof walk`);
    }
  }
}

async function captureRun32Interiors(browser) {
  const dir = path.join(root, 'artifacts', 'run32');
  await mkdir(dir, { recursive: true });
  const names = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const name of names) {
      await desktop.goto(BASE, { waitUntil: 'networkidle' });
      await desktop.reload({ waitUntil: 'networkidle' });
      await wait(500);
      await desktop.evaluate(([n]) => window.__playtestQa?.enterInterior?.(n), [name]);
      await waitForInterior(desktop);
      await wait(500);
      await desktop.screenshot({ path: path.join(dir, `interior-${name}-desktop.png`) });
      await desktop.keyboard.press('Escape');
      await wait(600);
    }
  } finally {
    await desktop.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    for (const name of names) {
      await mobile.goto(BASE, { waitUntil: 'networkidle' });
      await mobile.reload({ waitUntil: 'networkidle' });
      await wait(500);
      await mobile.evaluate(([n]) => window.__playtestQa?.enterInterior?.(n), [name]);
      await waitForInterior(mobile);
      await wait(500);
      await mobile.screenshot({ path: path.join(dir, `interior-${name}-375.png`) });
      await mobile.keyboard.press('Escape');
      await wait(600);
    }
  } finally {
    await mobile.close();
  }
}

async function captureRun31(browser, errors) {
  const dir = path.join(root, 'artifacts', 'run31');
  await mkdir(dir, { recursive: true });
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const name of ['catedral', 'sambil', 'bain', 'flor']) {
      await desktop.goto(BASE, { waitUntil: 'networkidle' });
      await desktop.reload({ waitUntil: 'networkidle' });
      await wait(600);
      await desktop.evaluate(([n]) => window.__playtestQa?.enterInterior?.(n), [name]);
      await waitForInterior(desktop);
      await wait(600);
      await desktop.screenshot({ path: path.join(dir, `interior-${name}-desktop.png`) });
      await desktop.keyboard.press('Escape');
      await wait(700);
    }
    await desktop.goto(`${BASE}#view=x=1420&y=-1580&z=1.2`, { waitUntil: 'networkidle' });
    await wait(800);
    await desktop.screenshot({ path: path.join(dir, 'obelisco-z1.2.png') });
  } finally {
    await desktop.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  try {
    for (const [name, start] of [
      ['flor', [46, 37]],
      ['sambil', [39, 36]],
    ]) {
      await mobile.goto(BASE, { waitUntil: 'networkidle' });
      await mobile.reload({ waitUntil: 'networkidle' });
      await wait(600);
      if (start) {
        await mobile.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
        await wait(200);
      }
      if (name === 'sambil') {
        await cdpClickBuildingDoor(mobile, name);
        await waitForInterior(mobile);
      } else {
        await mobile.evaluate(() => window.__playtestQa?.enterInterior?.('flor'));
        await waitForInterior(mobile);
      }
      await wait(600);
      if (name === 'flor') {
        await mobile.screenshot({ path: path.join(dir, 'interior-flor-375.png') });
      }
      if (name === 'sambil') {
        await mobile.screenshot({ path: path.join(dir, 'interior-sambil-fitted-375.png') });
      }
      await mobile.keyboard.press('Escape');
      await wait(900);
      await mobile.screenshot({ path: path.join(dir, `map-after-${name}-exit-375.png`) });
    }
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    await mobile.reload({ waitUntil: 'networkidle' });
    await wait(600);
    await mobile.evaluate(() => window.__playtestQa?.setCharacterTile?.(39, 35));
    await cdpClickBuildingDoor(mobile, 'volaris');
    await waitForInterior(mobile);
    await mobile.keyboard.press('Escape');
    await wait(900);
    await mobile.screenshot({ path: path.join(dir, 'map-after-volaris-exit-375.png') });
  } finally {
    await mobile.close();
  }
}

async function captureRun30Interiors(browser) {
  const dir = path.join(root, 'artifacts', 'run30');
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const [name, start] of [
      ['bain', [39, 30]],
      ['flor', [46, 37]],
      ['sambil', [39, 36]],
    ]) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await wait(600);
      await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
      await wait(200);
      await cdpClickBuildingDoor(page, name);
      await waitForInterior(page);
      await wait(500);
      await page.screenshot({ path: path.join(dir, `interior-${name}.png`) });
      await page.keyboard.press('Escape');
      await wait(700);
      await page.screenshot({ path: path.join(dir, `map-after-${name}-exit.png`) });
    }
  } finally {
    await page.close();
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
      await page.keyboard.press('Escape');
      await wait(500);
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

async function pointerTouchMove(client, id, x, y) {
  await client.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'left',
    buttons: 1,
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
  await testRun30DismissOutsideTapNoWalk(page, errors);
}

async function testPanelSwitchBuilding(page, errors) {
  if (!(await openVolarisPanel(page))) {
    errors.push('panel-switch: could not open Volaris');
    return;
  }
  await dismissBuildingPanel(page);
  for (let i = 0; i < 24; i++) {
    const inside = await page.evaluate(() => window.__playtestQa?.isInInterior?.());
    if (!inside) break;
    await wait(250);
  }
  if (await page.evaluate(() => window.__playtestQa?.isInInterior?.())) {
    errors.push('panel-switch: still inside Volaris after dismiss');
    return;
  }
  await wait(300);
  if (!(await cdpClickBuildingDoor(page, 'bain'))) {
    errors.push('panel-switch: could not click Bain door');
    return;
  }
  if (!(await waitForInterior(page, 28000))) {
    errors.push('panel-switch: did not enter Bain interior');
    return;
  }
  const title = await page.locator('.building-panel__title').textContent();
  if (!title?.includes('Bain')) {
    errors.push(`panel-switch: expected Bain interior (${title ?? 'none'})`);
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
    const close = await page.locator('.building-panel__float-exit, .building-panel__close').first().boundingBox();
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

    await page.evaluate(() =>
      localStorage.setItem(
        'playtest-checklist-v3',
        JSON.stringify({
          completed: {},
          skipped: false,
          dismissed: true,
          collapsed: true,
          mobileExpanded: false,
        }),
      ),
    );
    await page.reload({ waitUntil: 'networkidle' });
    await wait(600);
    const zMin375 =
      (await readCanvasMetrics(page))?.zoomMin ?? zoomMinForViewportJs(375, 812);
    const panZoom = zMin375 + 0.012;
    await page.goto(`${BASE}#view=x=200&y=-500&z=${panZoom.toFixed(3)}`, { waitUntil: 'networkidle' });
    await wait(800);
    const camBefore = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return {
        x: Number(c?.dataset.camX ?? 0),
        y: Number(c?.dataset.camY ?? 0),
      };
    });
    const panX = canvas.x + canvas.width * 0.5;
    const fromY = canvas.y + canvas.height * 0.22;
    const toY = canvas.y + canvas.height * 0.78;
    await pointerTouchDown(client, 30, panX, fromY);
    for (let i = 0; i < 12; i++) {
      const y = fromY + ((toY - fromY) * (i + 1)) / 12;
      await pointerTouchMove(client, 30, panX, y);
      await wait(35);
    }
    await pointerTouchUp(client, 30, panX, toY);
    await wait(500);
    const camAfter = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return {
        x: Number(c?.dataset.camX ?? 0),
        y: Number(c?.dataset.camY ?? 0),
      };
    });
    const panPx = Math.hypot(
      (camAfter.x - camBefore.x) * zMin375,
      (camAfter.y - camBefore.y) * zMin375,
    );
    if (panPx < 50) {
      errors.push(`mobile375: one-finger pan near min zoom moved ${panPx.toFixed(0)}px (need >50)`);
    }

    await wheelOutToMinZoom(page, canvas);
    await wait(400);
    await pointerTouchDown(client, 31, canvas.x + 20, canvas.y + 100);
    for (let i = 0; i < 14; i++) {
      const x = canvas.x + 20 + ((355 - 20) * (i + 1)) / 14;
      const y = canvas.y + 100 + ((712 - 100) * (i + 1)) / 14;
      await pointerTouchMove(client, 31, x, y);
      await wait(30);
    }
    await pointerTouchUp(client, 31, canvas.x + 355, canvas.y + 712);
    await wait(500);
    const pinchCx = canvas.x + canvas.width * 0.55;
    const pinchCy = canvas.y + canvas.height * 0.32;
    const pinchBase = await readAnchorBaseline(page);
    await pointerTouchDown(client, 71, pinchCx - 50, pinchCy);
    await wait(40);
    await pointerTouchDown(client, 72, pinchCx + 50, pinchCy);
    await wait(80);
    await pointerTouchMove(client, 71, pinchCx - 120, pinchCy);
    await pointerTouchMove(client, 72, pinchCx + 120, pinchCy);
    await wait(120);
    const panPinchDrift = await anchorScreenDriftPx(page, pinchBase);
    if (!Number.isFinite(panPinchDrift) || panPinchDrift > 50) {
      errors.push(
        `mobile375: min-zoom pan then pinch-out snap ${panPinchDrift?.toFixed?.(1) ?? 'nan'}px (max 50)`,
      );
    }
    await pointerTouchUp(client, 72, pinchCx + 120, pinchCy);
    await pointerTouchUp(client, 71, pinchCx - 120, pinchCy);
    await wait(200);

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
    await page.locator('[data-exit]').first().click().catch(() => {});
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

async function testHashCameraChecklistRebaseline(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
  await page.reload({ waitUntil: 'networkidle' });
  await wait(600);
  await page.evaluate(() => {
    location.hash = '#view=x=120&y=-420&z=1.500';
  });
  await wait(500);
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push('hash-rebaseline: no canvas');
    return;
  }
  const cx = canvas.x + canvas.width / 2;
  const cy = canvas.y + canvas.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 4, cy + 4);
  await page.mouse.up();
  await wait(250);
  const spurious = await page.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('playtest-checklist-v3') || '{}').completed ?? {};
    return c['move-camera'] === true || c.zoom === true;
  });
  if (spurious) {
    errors.push('hash-rebaseline: move-camera or zoom ticked after hash change without real gesture');
  }
}

async function testBainDoorLowZoomDeterministic(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), [39, 36]);
  await wait(200);
  await page.goto(`${BASE}#view=x=920&y=-2180&z=0.370`, { waitUntil: 'networkidle' });
  await wait(900);
  for (let i = 0; i < 7; i++) {
    await page.locator('[data-exit]').first().click().catch(() => {});
    await page.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
    await wait(150);
    if (!(await cdpClickBuildingDoor(page, 'bain'))) {
      errors.push('bain-door-lowzoom: tapBuildingDoor failed');
      return;
    }
    for (let w = 0; w < 40; w++) {
      const char = await readCharTile(page);
      const panel = (await page.locator('.building-panel--open').count()) > 0;
      const goal = await page.evaluate(() => {
        const raw = document.getElementById('game-canvas')?.dataset.walkGoal;
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch {
          return null;
        }
      });
      if (
        char?.x === 39 &&
        char?.y === 29 &&
        !panel &&
        goal?.x === 39 &&
        goal?.y === 29
      ) {
        errors.push(`bain-door-lowzoom: run ${i + 1}/7 stopped at (39,29) without panel`);
        return;
      }
      if (char?.x === 39 && char?.y === 26 && panel) break;
      if (char?.x === 39 && char?.y === 26 && w > 30) break;
      await wait(250);
    }
    await page.evaluate(() => {
      window.__playtestQa?.setCharacterTile?.(39, 36);
    });
    await wait(200);
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
    await page.locator('[data-exit]').first().click().catch(() => {});
    await wait(250);
  }
}

function charAdjacentToFootprint(cx, cy, fx, fy, w, h) {
  for (let y = fy; y < fy + h; y++) {
    for (let x = fx; x < fx + w; x++) {
      const md = Math.abs(cx - x) + Math.abs(cy - y);
      if (md === 1) return true;
    }
  }
  return false;
}

async function waitForCharNear(page, predicate, maxMs = 12000) {
  const steps = Math.ceil(maxMs / 250);
  for (let i = 0; i < steps; i++) {
    const c = await readCharTile(page);
    if (c && predicate(c.x, c.y)) return c;
    await wait(250);
  }
  return null;
}

/** Scenery taps from several starts must walk to a tile adjacent to the landmark footprint. */
async function testSceneryTapWalks(page, errors) {
  const starts = [
    [31, 36],
    [39, 36],
    [22, 34],
  ];
  const cases = [
    {
      name: 'obelisco',
      fx: 14,
      fy: 35,
      w: 3,
      h: 3,
      taps: [
        [15, 36],
        [14, 35],
        [15, 37],
      ],
    },
    {
      name: 'redoma',
      fx: 45,
      fy: 35,
      w: 3,
      h: 3,
      taps: [
        [46, 36],
        [46, 37],
        [45, 36],
      ],
    },
    {
      name: 'muro',
      fx: 35,
      fy: 40,
      w: 3,
      h: 2,
      taps: [
        [36, 40],
        [35, 41],
        [36, 41],
      ],
    },
  ];

  for (const spot of cases) {
    for (const start of starts) {
      for (const [tx, ty] of spot.taps) {
        await page.goto(BASE, { waitUntil: 'networkidle' });
        await wait(500);
        await page.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
        await wait(200);
        await page.evaluate(([x, y]) => window.__playtestQa?.tapMapTile?.(x, y), [tx, ty]);
        const end = await waitForCharNear(page, (cx, cy) =>
          charAdjacentToFootprint(cx, cy, spot.fx, spot.fy, spot.w, spot.h),
        );
        if (!end) {
          const last = await readCharTile(page);
          errors.push(
            `scenery-tap: ${spot.name} tap (${tx},${ty}) from (${start.join(',')}) ended at (${last?.x},${last?.y}), not adjacent to footprint`,
          );
        }
      }
    }
  }
}

/** After pan at min zoom, first pinch-out must not snap the on-map anchor. */
async function testMinZoomPanThenPinchOutNoSnap(page, errors) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(800);
  const canvas = await page.locator('#game-canvas').boundingBox();
  if (!canvas) {
    errors.push('pinch-after-pan: no canvas');
    return;
  }
  await wheelOutToMinZoom(page, canvas);
  await wait(300);
  const panX = canvas.x + canvas.width * 0.55;
  const fromY = canvas.y + canvas.height * 0.35;
  const toY = canvas.y + canvas.height * 0.65;
  await page.mouse.move(panX, fromY);
  await page.mouse.down();
  for (let i = 0; i < 14; i++) {
    const y = fromY + ((toY - fromY) * (i + 1)) / 14;
    await page.mouse.move(panX, y);
    await wait(30);
  }
  await page.mouse.up();
  await wait(400);
  const base = await readAnchorBaseline(page);
  const client = await page.context().newCDPSession(page);
  await ensureTouchEmulation(client);
  const cx = canvas.x + canvas.width * 0.72;
  const cy = canvas.y + canvas.height * 0.28;
  await pointerTouchDown(client, 61, cx - 55, cy);
  await wait(40);
  await pointerTouchDown(client, 62, cx + 55, cy);
  await wait(80);
  await pointerTouchMove(client, 61, cx - 130, cy);
  await pointerTouchMove(client, 62, cx + 130, cy);
  await wait(120);
  const drift = await anchorScreenDriftPx(page, base);
  if (!Number.isFinite(drift) || drift > 85) {
    errors.push(`pinch-after-pan: first pinch-out anchor snap ${drift?.toFixed?.(1) ?? 'nan'}px (max 85 on-map)`);
  }
  await pointerTouchUp(client, 62, cx + 130, cy);
  await pointerTouchUp(client, 61, cx - 55, cy);
  await wait(200);
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

async function captureRun25Closeups(browser) {
  const run25Dir = path.join(root, 'artifacts', 'run25');
  await mkdir(run25Dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const v of [
      { file: 'muro-close.png', hash: '#view=x=320&y=-2424&z=0.95' },
      { file: 'obelisco-close.png', hash: '#view=x=1420&y=-1580&z=0.95' },
      { file: 'redoma-close.png', hash: '#view=x=920&y=-1580&z=0.95' },
      { file: 'catedral-close.png', hash: '#view=x=-920&y=-920&z=0.95' },
      { file: 'pg-door-close.png', hash: '#view=x=-280&y=-2180&z=0.95' },
      { file: 'bain-door-close.png', hash: '#view=x=920&y=-2180&z=0.95' },
    ]) {
      await page.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(700);
      await page.screenshot({ path: path.join(run25Dir, v.file) });
    }
  } finally {
    await page.close();
  }
}

async function captureRun29Closeups(browser) {
  const dir = path.join(root, 'artifacts', 'run29');
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const v of [
      { file: 'redoma-z1.2.png', hash: '#view=x=920&y=-1580&z=1.2' },
      { file: 'muro-z1.2.png', hash: '#view=x=320&y=-2424&z=1.2' },
      { file: 'catedral-door-z1.2.png', hash: '#view=x=-920&y=-920&z=1.2' },
      { file: 'catedral-towers-z1.2.png', hash: '#view=x=-1180&y=-780&z=1.2' },
      { file: 'obelisco-z1.2.png', hash: '#view=x=1420&y=-1580&z=1.2' },
    ]) {
      await page.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(700);
      await page.screenshot({ path: path.join(dir, v.file) });
    }
  } finally {
    await page.close();
  }
}

async function captureRun28Closeups(browser) {
  const dir = path.join(root, 'artifacts', 'run28');
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const v of [
      { file: 'muro-z1.2.png', hash: '#view=x=320&y=-2424&z=1.2' },
      { file: 'redoma-z1.2.png', hash: '#view=x=920&y=-1580&z=1.2' },
      { file: 'estudio-door-z1.2.png', hash: '#view=x=-520&y=-2180&z=1.2' },
    ]) {
      await page.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(700);
      await page.screenshot({ path: path.join(dir, v.file) });
    }
  } finally {
    await page.close();
  }
  for (const { file, width, height } of [
    { file: 'min-zoom-375-default-pill.png', width: 375, height: 812 },
    { file: 'min-zoom-820-default-pill.png', width: 820, height: 1180 },
  ]) {
    const p = await browser.newPage({ viewport: { width, height } });
    try {
      await p.goto(BASE, { waitUntil: 'networkidle' });
      await p.evaluate(() => localStorage.removeItem('playtest-checklist-v3'));
      await p.reload({ waitUntil: 'networkidle' });
      await wait(800);
      const canvas = await p.locator('#game-canvas').boundingBox();
      if (canvas) await wheelOutToMinZoom(p, canvas);
      await wait(300);
      await p.screenshot({ path: path.join(dir, file) });
    } finally {
      await p.close();
    }
  }
}

async function captureRun27Closeups(browser) {
  const run27Dir = path.join(root, 'artifacts', 'run27');
  await mkdir(run27Dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const v of [
      { file: 'obelisco-z1.2.png', hash: '#view=x=1420&y=-1580&z=1.2' },
      { file: 'obelisco-top-3x.png', hash: '#view=x=1420&y=-1580&z=1.2', clip: { x: 580, y: 120, width: 240, height: 240 } },
      { file: 'muro-z1.2.png', hash: '#view=x=320&y=-2424&z=1.2' },
      { file: 'redoma-z1.2.png', hash: '#view=x=920&y=-1580&z=1.2' },
      { file: 'catedral-front-left-z1.2.png', hash: '#view=x=-1180&y=-780&z=1.2' },
    ]) {
      await page.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(700);
      if (v.clip) {
        await page.screenshot({ path: path.join(run27Dir, v.file), clip: v.clip });
      } else {
        await page.screenshot({ path: path.join(run27Dir, v.file) });
      }
    }
  } finally {
    await page.close();
  }
}

async function captureRun26Closeups(browser) {
  const run26Dir = path.join(root, 'artifacts', 'run26');
  await mkdir(run26Dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    for (const v of [
      { file: 'obelisco-z1.2.png', hash: '#view=x=1420&y=-1580&z=1.2' },
      { file: 'muro-z1.2.png', hash: '#view=x=320&y=-2424&z=1.2' },
      { file: 'catedral-front-left-z1.2.png', hash: '#view=x=-1180&y=-780&z=1.2' },
      { file: 'catedral-z1.2.png', hash: '#view=x=-920&y=-920&z=1.2' },
      { file: 'redoma-z1.2.png', hash: '#view=x=920&y=-1580&z=1.2' },
    ]) {
      await page.goto(`${BASE}${v.hash}`, { waitUntil: 'networkidle' });
      await wait(700);
      await page.screenshot({ path: path.join(run26Dir, v.file) });
    }
  } finally {
    await page.close();
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
    await desktop.locator('[data-exit]').first().click().catch(() => {});
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

    const zMinDesktop = zoomMinForViewportJs(1280, 800);
    for (const [zLabel, z] of [
      ['min', zMinDesktop],
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
    await testHashCameraChecklistRebaseline(desktop, errors);
    await testBainDoorLowZoomDeterministic(desktop, errors);
    await testSkipRingDesktop(desktop, errors);

    await testMap64RouteLengths(desktop, errors, routeReport);
    await testMap64EnterablePanels(desktop, errors);
    await testMap64PaisajeNoPanel(desktop, errors);
    await testSceneryTapWalks(desktop, errors);
    await testMinZoomPanThenPinchOutNoSnap(desktop, errors);
    await testStaggeredPinchNoJump(desktop, errors);
    await testRun30NoEarlyInteriorOnRoofTap(desktop, errors);
    await testRun30AllInteriorsClick(desktop, errors);
    await testRun31HistoryBackExitsInterior(desktop, errors);
    await testRun31DeepLinkInterior(desktop, errors);
    await testRun31InteriorSizes(desktop, errors);
    await testRun31SambilWalkCancel(desktop, errors);
    await testRun31InteriorExitTileZoom(desktop, errors);
    await testRun31ChecklistOutsideTapMobile(browser, errors);
    await testRun32DoorPointEntersAll375(browser, errors);
    await testRun32SheetOutsideTapMobile(browser, errors);
    await testRun32InteriorExitAllMobile(browser, errors);
    await testRun32ArrivalOnlyFour(desktop, errors);
    const desktopCdp = await desktop.context().newCDPSession(desktop);
    await testRun32WalkPinchFiveTrials(desktop, errors, desktopCdp);
    await ensureTouchEmulation(desktopCdp);
    await testRun30WalkSurvivesPinch(desktop, errors, desktopCdp);
    await testMinZoomFullMapVisible(browser, errors);
    await testMinZoomPhoneFraming(browser, errors);

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
    await captureRun25Closeups(browser);
    await captureRun26Closeups(browser);
    await captureRun27Closeups(browser);
    await captureRun28Closeups(browser);
    await captureRun29Closeups(browser);
    await captureRun30Interiors(browser);
    await captureRun31(browser, errors);
    await captureRun32Interiors(browser);

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
