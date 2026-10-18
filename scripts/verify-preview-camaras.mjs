/**
 * preview-camaras QA with real CDP touch (390×844) and real mouse (1280).
 * No tapBuildingDoor / tapScreen shortcuts.
 * Usage: node scripts/verify-preview-camaras.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function cdpDrag(cdp, x0, y0, dx, dy, steps = 10) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pt(x0 + (dx * i) / steps, y0 + (dy * i) / steps),
    });
    await wait(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function realClick(page, x, y) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await wait(30);
  await page.mouse.up();
}

const DIR_IDX = { se: 0, sw: 1, nw: 2, ne: 3 };

function headingErrDeg(actual, expected) {
  if (expected == null || actual == null) return 180;
  let d = actual - expected;
  if (d > 2) d -= 4;
  if (d < -2) d += 4;
  return Math.abs(d) * 90;
}

function wrapQuarter(h) {
  let x = h;
  if (x < 0) x += 4;
  if (x >= 4) x -= 4;
  return x;
}

function summarizeDrive(samples, start, expectedHeading) {
  let path = 0;
  let prev = start;
  let maxErr = 0;
  let sumErr = 0;
  let errN = 0;
  const settleFrom = Math.max(0, samples.length - 25);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    path += Math.hypot(s.cx - prev.cx, s.cy - prev.cy);
    prev = s;
    const settled = i >= settleFrom;
    const steering = Math.abs(s.steering ?? 0);
    if (
      expectedHeading != null &&
      s.heading != null &&
      settled &&
      Math.abs(s.mph ?? 0) > 0.5 &&
      steering < 0.28
    ) {
      const e = headingErrDeg(wrapQuarter(s.heading), expectedHeading);
      maxErr = Math.max(maxErr, e);
      sumErr += e;
      errN += 1;
    }
  }
  const end = samples.length ? samples[samples.length - 1] : start;
  const net = Math.hypot(end.cx - start.cx, end.cy - start.cy);
  if (net > 1.2 && expectedHeading != null) {
    let nh = Math.atan2(end.cy - start.cy, end.cx - start.cx) / (Math.PI / 2);
    nh = wrapQuarter(nh);
    const dispErr = headingErrDeg(nh, expectedHeading);
    maxErr = Math.max(maxErr, dispErr);
    if (errN === 0) {
      sumErr = dispErr;
      errN = 1;
    }
  }
  const meanErrFinal = errN ? sumErr / errN : maxErr;
  return {
    path,
    net,
    ratio: path > 0.05 ? net / path : 0,
    maxErr,
    meanErr: meanErrFinal,
    headingSamples: errN,
  };
}

function headingGate(sum) {
  if (sum.headingSamples >= 4) return sum.meanErr > 10;
  if (sum.net > 1.2) return sum.maxErr > 10;
  return false;
}

async function holdKeyboardDrive(page, key, holdMs) {
  await page.keyboard.down(key);
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) {
    await wait(100);
    samples.push(
      await page.evaluate(() => {
        const j = window.__playtestQa.jac();
        return {
          cx: j.cx,
          cy: j.cy,
          heading: j.heading,
          dir: j.dir,
          mph: j.mph,
          steering: j.steering,
        };
      }),
    );
  }
  await page.keyboard.up(key);
  return samples;
}

async function holdTouchDrive(cdp, page, dx, dy, holdMs = 3500) {
  const joy = page.locator('.joystick');
  const box = await joy.boundingBox();
  if (!box) return [];
  const cx = box.x + box.width * 0.5;
  const cy = box.y + box.height * 0.5;
  const dist = 28;
  const mag = Math.hypot(dx, dy) || 1;
  const tx = cx + (dx / mag) * dist;
  const ty = cy + (dy / mag) * dist;
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(tx, ty) });
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < holdMs) {
    await wait(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(tx, ty) });
    samples.push(
      await page.evaluate(() => {
        const j = window.__playtestQa.jac();
        return {
          cx: j.cx,
          cy: j.cy,
          heading: j.heading,
          dir: j.dir,
          mph: j.mph,
          steering: j.steering,
        };
      }),
    );
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return samples;
}

const DRIVE_DIRS = [
  { name: 'down', dx: 0, dy: 1, key: 's' },
  { name: 'right', dx: 1, dy: 0, key: 'd' },
  { name: 'left', dx: -1, dy: 0, key: 'a' },
  { name: 'up', dx: 0, dy: -1, key: 'w' },
];

/** Screen stick unit vector for angle deg from screen-up (clockwise). */
function stickFromAngle(deg) {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  return { dx, dy };
}

const OFF_AXIS_ANGLES = [0, -10, 10, -30, 30, 45, -45];

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, {
    timeout: 60000,
  });
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
  });
  await wait(400);
  const bundle =
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    )) ?? '';
  return bundle.split('/').pop() || 'dev';
}

async function tapView(page, cdp, touch, mode) {
  const btn = page.locator(`.ui-view[data-view="${mode}"]`);
  const box = await btn.boundingBox();
  if (!box) throw new Error(`view button ${mode} missing`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await realClick(page, x, y);
  await wait(200);
}

async function dismissIntro(page, cdp, touch) {
  const close = page.locator('[data-action="intro-close"]');
  if (await close.isVisible().catch(() => false)) {
    const box = await close.boundingBox();
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      if (touch) await cdpTouch(cdp, x, y);
      else await realClick(page, x, y);
      await wait(250);
    }
  }
}

async function enterBuildingReal(page, cdp, touch, name, viewMode) {
  await page.evaluate((m) => window.__playtestQa.setViewMode(m), viewMode);
  await wait(150);
  await dismissIntro(page, cdp, touch);
  await page.evaluate((n) => {
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
    if (b?.door && b.inward) {
      window.__playtestQa.setCharacterTile(b.door.x - b.inward.x, b.door.y - b.inward.y);
    } else {
      const i = window.__playtestQa.inicio;
      window.__playtestQa.setCharacterTile(i[0], i[1]);
    }
    window.__playtestQa.frameDoorForQa(n);
  }, name);
  await wait(350);
  const readyBefore = await page.evaluate(() => window.__playtestQa.inputReady().pendingWalk);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  if (!pt?.x) return { ok: false, reason: 'no doorScreenPoint', readyBefore };
  if (touch) await cdpTouch(cdp, pt.x, pt.y);
  else await realClick(page, pt.x, pt.y);
  await wait(300);
  const readyAfter = await page.evaluate(() => window.__playtestQa.inputReady().pendingWalk);
  for (let t = 0; t < 55; t++) {
    if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
      return { ok: true, readyBefore, readyAfter, ms: t * 400 };
    }
    await wait(400);
  }
  return { ok: false, reason: 'timeout', readyBefore, readyAfter };
}

async function runViewport(tag, options) {
  const errors = [];
  const notes = [];
  const touch = !!options.hasTouch;
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    ...options,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.setIgnoreInputEvents', { ignore: false });
  let bundle = '';
  let driveMetrics = [];
  let offAxisMetrics = [];
  try {
    bundle = await boot(page);
    await dismissIntro(page, cdp, touch);
    notes.push(`${tag} bundle ${bundle}`);

    await tapView(page, cdp, touch, 'cenital');
    const cen = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (cen.mode !== 'cenital') errors.push(`${tag}: cenital mode ${cen.mode}`);
    if (cen.altView !== 'cenital') errors.push(`${tag}: altView ${cen.altView}`);
    await page.screenshot({ path: path.join(OUT, `${tag}-cenital.png`) });

    await page.evaluate(() => window.__playtestQa.toggleMapOverview?.());
    await wait(350);
    const overview = await page.evaluate(() => window.__playtestQa.overviewCoverage?.());
    notes.push(`${tag}: overview coverage ${JSON.stringify(overview)}`);
    const minCov = Math.min(overview?.covW ?? 0, overview?.covH ?? 0);
    notes.push(`${tag}: overview limiting dim ${(minCov * 100).toFixed(1)}% (goal ≥85%)`);
    if ((tag === '390' || tag === '844x390') && minCov < 0.85) {
      errors.push(`${tag}: overview fill ${(minCov * 100).toFixed(1)}% < 85%`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-overview.png`) });
    await page.evaluate(() => window.__playtestQa.toggleMapOverview?.());
    await wait(200);

    const perspBtn = page.locator('.ui-view[data-view="perspectiva"]');
    if ((await perspBtn.count()) > 0) errors.push(`${tag}: perspectiva button still in DOM`);

    for (const building of ['sambil', 'estudio']) {
      const r = await enterBuildingReal(page, cdp, touch, building, 'cenital');
      notes.push(`${tag}: enter ${building} cenital ${JSON.stringify(r)}`);
      if (!r.ok) errors.push(`${tag}: real tap did not enter ${building} in cenital (${r.reason})`);
      else {
        await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
        await wait(600);
      }
    }

    const isoDoor = await enterBuildingReal(page, cdp, touch, 'estudio', 'isometrica');
    notes.push(`${tag}: enter estudio iso ${JSON.stringify(isoDoor)}`);
    if (!isoDoor.ok) errors.push(`${tag}: real tap did not enter estudio in iso (${isoDoor.reason})`);
    else {
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
      await wait(600);
    }

    await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      const door = window.__playtestQa.jacDoor();
      if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
      window.__playtestQa.focusJac?.();
    });
    await wait(400);
    const spawn = await page.evaluate(() => window.__playtestQa.jacSpawn());
    const canvasTap = await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities();
      if (!Number.isFinite(e?.sx) || !Number.isFinite(e?.sy)) return null;
      return { x: e.sx, y: e.sy };
    });
    const tapJacOnCanvas = async () => {
      if (!canvasTap) return;
      const canvas = page.locator('#game-canvas');
      if (touch) {
        const rect = await canvas.boundingBox();
        if (rect) await cdpTouch(cdp, rect.x + canvasTap.x, rect.y + canvasTap.y);
      } else {
        await canvas.click({ position: { x: canvasTap.x, y: canvasTap.y } });
      }
    };
    await tapJacOnCanvas();
    await wait(900);
    let driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
    if (!driving) {
      await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
      await wait(250);
      await tapJacOnCanvas();
      await wait(1200);
      driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
      if (driving) {
        await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
        await wait(250);
      }
    }
    driveMetrics = [];
    offAxisMetrics = [];
    if (!driving) {
      errors.push(`${tag}: real tap did not start jac drive (spawn ${JSON.stringify(spawn)})`);
    } else {
      if (!touch) {
        const isoBtn = page.locator('.jac-dock__view[data-val="isometrica"]');
        const box = await isoBtn.boundingBox();
        if (!box) errors.push(`${tag}: jac dock isometric view button missing`);
        else {
          await realClick(page, box.x + box.width / 2, box.y + box.height / 2);
          await wait(350);
          const mode = await page.evaluate(() => window.__playtestQa.getViewMode().mode);
          notes.push(`${tag}: dock view click → ${mode}`);
          if (mode !== 'isometrica') errors.push(`${tag}: dock view button did not switch to isometrica (${mode})`);
          await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
          await wait(200);
        }
      }
      await page.evaluate(() => {
        const sp = window.__playtestQa.jacSpawn();
        window.__playtestQa.jacSet?.({ cx: sp.center.x, cy: sp.center.y, dir: 'se' });
        window.__playtestQa.jacSetGear('D');
      });
      await wait(200);
      if (touch) {
        const quads = [
          { quad: 'up', base: 0 },
          { quad: 'right', base: 90 },
          { quad: 'down', base: 180 },
          { quad: 'left', base: 270 },
        ];
        for (const q of quads) {
          for (const off of OFF_AXIS_ANGLES) {
            const { dx, dy } = stickFromAngle(q.base + off);
            await page.evaluate(() => {
              const sp = window.__playtestQa.jacSpawn();
              window.__playtestQa.jacSet?.({ cx: sp.center.x, cy: sp.center.y, dir: 'se' });
              window.__playtestQa.jacSetGear('D');
            });
            await wait(120);
            const start = await page.evaluate(() => {
              const j = window.__playtestQa.jac();
              return { cx: j.cx, cy: j.cy, heading: j.heading };
            });
            const expected = await page.evaluate(
              ({ dx, dy }) => window.__playtestQa.cenitalExpectedHeading(dx, dy),
              { dx, dy },
            );
            const samples = await holdTouchDrive(cdp, page, dx, dy, 4500);
            const sum = summarizeDrive(samples, start, expected);
            const label = `${q.quad}${off >= 0 ? '+' : ''}${off}`;
            offAxisMetrics.push({ quad: q.quad, offDeg: off, label, expected, ...sum });
            if (headingGate(sum)) {
              errors.push(
                `${tag}: off-axis ${label} heading err mean=${sum.meanErr.toFixed(1)}° max=${sum.maxErr.toFixed(1)}° (>10)`,
              );
            }
            if (sum.ratio < 0.65 && sum.path > 1) {
              errors.push(`${tag}: off-axis ${label} ratio ${sum.ratio.toFixed(2)} (<0.65)`);
            }
            await wait(350);
          }
        }
        await page.evaluate(() => {
          const sp = window.__playtestQa.jacSpawn();
          window.__playtestQa.jacSet?.({ cx: sp.center.x, cy: sp.center.y, dir: 'se' });
          window.__playtestQa.jacSetGear('D');
        });
        await wait(200);
      }
      for (const dir of DRIVE_DIRS) {
        const start = await page.evaluate(() => {
          const j = window.__playtestQa.jac();
          return { cx: j.cx, cy: j.cy, heading: j.heading };
        });
        await page.evaluate(() => window.__playtestQa.jacSetGear('D'));
        const expected = await page.evaluate(
          ({ dx, dy }) => window.__playtestQa.cenitalExpectedHeading(dx, dy),
          { dx: dir.dx, dy: dir.dy },
        );
        const samples =
          touch ?
            await holdTouchDrive(cdp, page, dir.dx, dir.dy, 7000)
          : await holdKeyboardDrive(page, dir.key, 7000);
        const sum = summarizeDrive(samples, start, expected);
        driveMetrics.push({ dir: dir.name, expected, ...sum });
        notes.push(
          `${tag}: drive ${dir.name} net=${sum.net.toFixed(2)} path=${sum.path.toFixed(2)} ratio=${sum.ratio.toFixed(2)} maxErr=${sum.maxErr.toFixed(1)}°`,
        );
        if (sum.ratio < 0.72) errors.push(`${tag}: ${dir.name} path ratio ${sum.ratio.toFixed(2)} (<0.72)`);
        else if (sum.net < 2.5 && sum.ratio < 0.92) {
          errors.push(`${tag}: ${dir.name} net displacement ${sum.net.toFixed(2)} tiles (<2.5) with ratio ${sum.ratio.toFixed(2)}`);
        }
        if (headingGate(sum)) {
          errors.push(
            `${tag}: ${dir.name} heading err mean=${sum.meanErr.toFixed(1)}° max=${sum.maxErr.toFixed(1)}° (>10)`,
          );
        }
        await wait(450);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-driving.png`) });
      await page.evaluate(() => window.__playtestQa.jacGetOut?.());
      await wait(500);
    }

    const entities = await page.evaluate(() => window.__playtestQa.jacEntities());
    if (entities?.ghostVisible) notes.push(`${tag}: ghostVisible still true (check zoom/occlusion)`);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { tag, errors, notes, bundle, driveMetrics, offAxisMetrics };
}

const results = [];
for (const [tag, opts] of [
  ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
  ['844x390', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }],
  ['1280', { viewport: { width: 1280, height: 800 } }],
]) {
  results.push(await runViewport(tag, opts));
}

const bundle = results.find((r) => r.bundle)?.bundle ?? '';
const report = {
  ok: results.every((r) => r.errors.length === 0),
  bundle,
  base: BASE,
  results,
  offAxisTable: results.flatMap((r) =>
    (r.offAxisMetrics ?? []).map((m) => ({
      viewport: r.tag,
      quadrant: m.quad,
      offsetDeg: m.offDeg,
      maxHeadingErrDeg: Number(m.maxErr.toFixed(1)),
      meanHeadingErrDeg: Number(m.meanErr.toFixed(1)),
      netOverPath: Number(m.ratio.toFixed(3)),
    })),
  ),
  driveTable: results.flatMap((r) =>
    (r.driveMetrics ?? []).map((m) => ({
      viewport: r.tag,
      direction: m.dir,
      netTiles: Number(m.net.toFixed(2)),
      pathTiles: Number(m.path.toFixed(2)),
      netOverPath: Number(m.ratio.toFixed(3)),
      maxHeadingErrDeg: Number(m.maxErr.toFixed(1)),
      meanHeadingErrDeg: Number(m.meanErr.toFixed(1)),
      headingSamples: m.headingSamples ?? 0,
    })),
  ),
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(`\n== ${r.tag} ==`);
  for (const n of r.notes) console.log(' ', n);
  for (const e of r.errors) console.log('  ERR', e);
}
if (!report.ok) {
  console.error('\npreview-camaras verify failed');
  process.exit(1);
}
console.log(`\npreview-camaras verify ok (bundle ${bundle})`);
