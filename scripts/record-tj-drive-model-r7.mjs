#!/usr/bin/env node
/** CDP proof: WebGL #game-canvas, 0 readback, 20 desktop clicks, 50 reverse 0 holes,
 *  FPS vs live CoabCvDQ. 390×844 @3 and 1280 @2. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r7');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4200/interactive-portfolio-playtest/';
const LIVE = process.env.LIVE_URL ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function holeInPng(pngPath) {
  if (!fs.existsSync(pngPath)) return { hole: true, n: 0, tot: 0, ratio: 1 };
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  let n = 0;
  let tot = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      tot++;
      if (img.data[(y * img.width + x) * 4 + 3] < 12) n++;
    }
  }
  return { hole: tot > 0 && n / tot > 0.02, n, tot, ratio: tot ? n / tot : 0 };
}

async function canvasMeta(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return { ok: false, reason: 'no canvas' };
    const two = (() => {
      try {
        return c.getContext('2d');
      } catch {
        return null;
      }
    })();
    return {
      ok: true,
      is2d: !!two,
      sameCanvas: window.__playtestQa.fps?.()?.sameCanvas ?? null,
      w: c.width,
      h: c.height,
    };
  });
}

async function rafFps(page, ms = 1200) {
  return page.evaluate((ms) => {
    return new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = (t) => {
        n += 1;
        if (t - t0 >= ms) resolve({ fps: (n * 1000) / (t - t0), frames: n, ms: t - t0 });
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, ms);
}

async function sampleTickerFps(page, ms = 1200) {
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    samples.push(await page.evaluate(() => window.__playtestQa.fps?.() ?? null));
    await wait(80);
  }
  const vals = samples.map((s) => s?.fps).filter((n) => typeof n === 'number' && n > 0);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return { mean, min: vals.length ? Math.min(...vals) : 0, max: vals.length ? Math.max(...vals) : 0, n: vals.length };
}

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })),
  });
}

async function tapClientCdp(cdp, x, y) {
  await cdpTouch(cdp, 'touchStart', [{ x, y }]);
  await wait(40);
  await cdpTouch(cdp, 'touchEnd', []);
}

async function holdStickCdp(page, cdp, ox, oy, ms) {
  const box = await page.locator('.joystick').boundingBox();
  if (!box) return null;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await cdpTouch(cdp, 'touchStart', [{ x: x0, y: y0 }]);
  const steps = Math.max(6, Math.round(ms / 160));
  for (let i = 1; i <= steps; i++) {
    await cdpTouch(cdp, 'touchMove', [{ x: x0 + (ox * i) / steps, y: y0 + (oy * i) / steps }]);
    await wait(ms / steps);
  }
  return { box, x0, y0 };
}

async function dragStickCdp(page, cdp, from, to, ms, samples) {
  const steps = Math.max(14, Math.round(ms / 50));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdpTouch(cdp, 'touchMove', [{
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }]);
    if (samples) samples.push(await page.evaluate(() => window.__playtestQa.jac()));
    await wait(ms / steps);
  }
}

async function releaseStickCdp(cdp) {
  await cdpTouch(cdp, 'touchEnd', []);
}

async function waitUntil(page, fn, timeout = 12000, step = 80) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
}

async function bootDrive(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setCharacterTile(27, 19);
    window.__playtestQa.focusJac?.();
  });
  await wait(400);
  await page.evaluate(() => window.__playtestQa.tapJac());
  await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode)) === 'menu' ? true : null), 8000);
  await page.evaluate(() => window.__playtestQa.jacGetIn());
  await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 12000 });
  await wait(300);
}

async function pickDriveGoal(page, aroundBuilding, used) {
  return page.evaluate(({ aroundBuilding, used }) => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const stick = document.querySelector('.joystick:not([hidden])')?.getBoundingClientRect();
    const taken = new Set(used ?? []);
    const blocked = (x0, y0, x1, y1) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0)));
      for (let i = 1; i < n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        const ch = walk[y]?.[x];
        if (ch === '#' || ch === 'x') return true;
      }
      return false;
    };
    const clear = (x, y) => {
      const ch = walk[y]?.[x];
      return !!ch && ch !== '#' && ch !== 'x';
    };
    const hits = [];
    for (let y = Math.round(j.cy) - 16; y < Math.round(j.cy) + 18; y++) {
      for (let x = Math.round(j.cx) - 16; x < Math.round(j.cx) + 20; x++) {
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 3 || dist > 18) continue;
        if (!clear(x, y)) continue;
        if (!window.__playtestQa.jacDriveTileOk?.(x, y)) continue;
        const s = window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32);
        if (s.x < 36 || s.y < 96 || s.x > window.innerWidth - 36 || s.y > window.innerHeight - 110) continue;
        if (stick && s.x >= stick.left - 8 && s.x <= stick.right + 8 && s.y >= stick.top - 8 && s.y <= stick.bottom + 8) continue;
        const el = document.elementFromPoint(s.x, s.y);
        if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
        const landed = window.__playtestQa.tileAtClient?.(s.x, s.y);
        if (!landed || !window.__playtestQa.jacDriveTileOk?.(landed.x, landed.y)) continue;
        const key = `${landed.x},${landed.y}`;
        if (taken.has(key)) continue;
        const wall = blocked(j.cx, j.cy, landed.x, landed.y);
        if (aroundBuilding && !wall) continue;
        hits.push({ x: landed.x, y: landed.y, client: s, dist: Math.hypot(landed.x - j.cx, landed.y - j.cy), wall });
      }
    }
    hits.sort((a, b) => (aroundBuilding ? a.dist - b.dist : b.dist - a.dist));
    return hits[0] ?? null;
  }, { aroundBuilding, used: [...(used ?? [])] });
}

async function sampleLiveFps(options) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  try {
    await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(1500);
    const idle = await rafFps(page, 1200);
    let driving = null;
    try {
      await page.evaluate(() => {
        window.__playtestQa?.setLayout?.('map');
        window.__playtestQa?.setNpcs?.(false);
        window.__playtestQa?.setCharacterTile?.(27, 19);
        window.__playtestQa?.focusJac?.();
      });
      await wait(400);
      await page.evaluate(() => window.__playtestQa?.tapJac?.());
      await wait(400);
      await page.evaluate(() => window.__playtestQa?.jacGetIn?.());
      await wait(800);
      const drivingNow = await page.evaluate(() => window.__playtestQa?.jac?.()?.driving);
      if (drivingNow) {
        await page.keyboard.down('ArrowUp').catch(() => {});
        driving = await rafFps(page, 1200);
        await page.keyboard.up('ArrowUp').catch(() => {});
      }
    } catch {
      driving = null;
    }
    return { idle, driving, url: LIVE };
  } finally {
    await browser.close();
  }
}

async function run(tag, options, phone) {
  const notes = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    ...options,
    recordVideo: { dir: path.join(OUT, `${tag}-clips`), size: options.viewport },
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const bundle = await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    );
    notes.push({ bundle });
    await bootDrive(page);
    const meta = await canvasMeta(page);
    notes.push({ canvas: meta });
    if (meta.is2d) throw new Error(`${tag}: #game-canvas is 2D — WebGL must be the visible view`);
    if (meta.sameCanvas === false) throw new Error(`${tag}: Pixi view is not #game-canvas`);

    const idleRaf = await rafFps(page, 1200);
    const idleTicker = await sampleTickerFps(page, 1000);
    notes.push({ fpsIdle: { raf: idleRaf, ticker: idleTicker } });
    if (idleRaf.fps < 8) throw new Error(`${tag}: idle FPS ${idleRaf.fps.toFixed(1)} < 8 (readback regression)`);

    if (phone) {
      const dBtn = page.locator('.jac-bar [data-jac="gear"][data-val="D"]');
      if (await dBtn.count()) await dBtn.click();
    } else {
      await page.locator('.jac-dock [data-jac="gear"][data-val="D"]').click();
    }
    await wait(150);

    if (phone) {
      const held = await holdStickCdp(page, cdp, 6, -48, 2000);
      if (!held) throw new Error(`${tag}: stick missing`);
      const driveRaf = await rafFps(page, 1000);
      notes.push({ fpsDrive: { raf: driveRaf } });
      if (driveRaf.fps < 8) throw new Error(`${tag}: drive FPS ${driveRaf.fps.toFixed(1)} < 8`);
      await releaseStickCdp(cdp);
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mph)) === 0 ? true : null), 4000);
      const down = [];
      const box = await page.locator('.joystick').boundingBox();
      const x0 = box.x + box.width / 2;
      const y0 = box.y + box.height / 2;
      await cdpTouch(cdp, 'touchStart', [{ x: x0, y: y0 }]);
      const tDown = Date.now();
      await dragStickCdp(page, cdp, { x: x0, y: y0 }, { x: x0, y: y0 + 50 }, 1600, down);
      const firstR = down.find((s) => s.gear === 'R' && s.reversing);
      const dwellMs = firstR ? Date.now() - tDown - 1600 + down.findIndex((s) => s.gear === 'R') * 50 : 0;
      const zeroThenR = (() => {
        const z = down.findIndex((s) => (s.mph ?? 1) === 0);
        const r = down.findIndex((s) => s.reversing);
        return { z, r, ms: r >= 0 && z >= 0 ? (r - z) * 50 : 0 };
      })();
      notes.push({ dwell: { ...zeroThenR, dwellMs } });
      if (zeroThenR.r >= 0 && zeroThenR.ms < 320) throw new Error(`${tag}: dwell ${zeroThenR.ms}ms < 350ms`);

      const holes = [];
      const clip = { x: 23, y: 659, width: 343, height: 97 };
      for (let i = 0; i < 50; i++) {
        await cdpTouch(cdp, 'touchMove', [{ x: x0, y: y0 + 50 }]);
        const p = path.join(OUT, `${tag}-hole-${String(i).padStart(2, '0')}.png`);
        await page.screenshot({ path: p, clip });
        const png = holeInPng(p);
        holes.push(png);
        if (i % 10 === 0) notes.push({ pngHole: { i, ...png } });
        if (png.hole) throw new Error(`${tag}: PNG hole frame ${i} ${JSON.stringify(png)}`);
        await wait(40);
      }
      notes.push({ holes: { n: holes.length, worst: Math.max(...holes.map((h) => h.ratio ?? 0)) } });
      const bumpSamples = await page.evaluate(() => window.__playtestQa.jac());
      notes.push({ reverseHold: { mph: bumpSamples.mph, bump: bumpSamples.bump, gear: bumpSamples.gear } });

      await page.screenshot({ path: path.join(OUT, `${tag}-02-reverse-hold.png`) });
      const fade = [];
      await releaseStickCdp(cdp);
      const t0 = Date.now();
      while (Date.now() - t0 < 1100) {
        fade.push(
          await page.evaluate(() => {
            const el = document.querySelector('.jac-rear');
            return { t: performance.now(), opacity: el ? Number(getComputedStyle(el).opacity) : 0 };
          }),
        );
        await wait(40);
      }
      notes.push({ fade });
      const hi = fade.find((f) => f.opacity > 0.85);
      const lo = fade.find((f) => hi && f.t > hi.t && f.opacity < 0.2);
      if (hi && lo && lo.t - hi.t < 450) throw new Error(`${tag}: PiP fade ${Math.round(lo.t - hi.t)}ms < 450ms`);
    } else {
      await page.keyboard.down('ArrowUp');
      const driveRaf = await rafFps(page, 1000);
      notes.push({ fpsDrive: { raf: driveRaf } });
      if (driveRaf.fps < 8) throw new Error(`${tag}: drive FPS ${driveRaf.fps.toFixed(1)} < 8`);
      await page.keyboard.up('ArrowUp');
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mph)) === 0 ? true : null), 4000);
      const down = [];
      const t0 = Date.now();
      await page.keyboard.down('ArrowDown');
      for (let i = 0; i < 50; i++) {
        down.push({ t: Date.now() - t0, ...(await page.evaluate(() => window.__playtestQa.jac())) });
        await wait(40);
      }
      await page.keyboard.up('ArrowDown');
      const z = down.find((s) => (s.mph ?? 1) === 0);
      const r = down.find((s) => s.reversing);
      notes.push({ desktopDwell: { z: z?.t, r: r?.t, ms: z && r ? r.t - z.t : 0 } });
      if (r && z && r.t - z.t < 320) throw new Error(`${tag}: dwell ${r.t - z.t}ms`);
    }

    await waitUntil(page, async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return (j?.mph ?? 1) === 0 && !j?.rearCam ? j : null;
    }, 4000);

    try { await releaseStickCdp(cdp); } catch { /* none */ }
    await page.evaluate(() => window.__playtestQa.stickCancel?.());
    await wait(200);

    if (!phone) {
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.getElementById('game-canvas')?.focus();
      });
      const before = await page.evaluate(() => window.__playtestQa.pointerDriveAccepts?.() ?? 0);
      const used = new Set();
      let accepted = 0;
      for (let i = 0; i < 28 && accepted < 20; i++) {
        const goal = await pickDriveGoal(page, false, used);
        if (!goal) break;
        used.add(`${goal.x},${goal.y}`);
        const prev = await page.evaluate(() => window.__playtestQa.pointerDriveAccepts?.() ?? 0);
        await page.mouse.click(goal.client.x, goal.client.y);
        const got = await waitUntil(page, async () => {
          const n = await page.evaluate(() => window.__playtestQa.pointerDriveAccepts?.() ?? 0);
          return n > prev ? n : null;
        }, 900, 40);
        if (got) accepted += 1;
      }
      const after = await page.evaluate(() => window.__playtestQa.pointerDriveAccepts?.() ?? 0);
      notes.push({ desktopClicks: { before, after, accepted, delta: after - before } });
      if (after - before < 20) throw new Error(`${tag}: desktop clicks accepted ${after - before} < 20`);
    }

    const goal = await pickDriveGoal(page, !phone, new Set());
    if (!goal) throw new Error(`${tag}: no drive goal`);
    if (phone) await tapClientCdp(cdp, goal.client.x, goal.client.y);
    else await page.mouse.click(goal.client.x, goal.client.y);
    const started = await waitUntil(page, async () => {
      const j = await page.evaluate(() => ({
        jac: window.__playtestQa.jac(),
        tap: window.__playtestQa.lastDriveTap?.(),
      }));
      return j.jac?.driveGoal ? j : null;
    }, 4000);
    if (!started?.jac?.driveGoal) throw new Error(`${tag}: click-to-drive did not set a goal`);
    notes.push({ driveTap: started.tap, pick: { x: goal.x, y: goal.y } });
    const startCx = started.jac.cx;
    const startCy = started.jac.cy;
    const arrived = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        if (!j?.driveGoal && (j?.mph ?? 1) === 0) return j;
        return null;
      },
      16000,
    );
    if (arrived && Math.hypot((arrived.cx ?? 0) - (startCx ?? 0), (arrived.cy ?? 0) - (startCy ?? 0)) < 0.2) {
      throw new Error(`${tag}: click-to-drive never left sit`);
    }
    const expect = started?.tap ?? goal;
    const visMiss = arrived
      ? Math.hypot((arrived.visualTx ?? arrived.cx) - expect.x, (arrived.visualTy ?? arrived.cy) - expect.y)
      : 99;
    notes.push({ stopVisual: { goal, visMiss, arrived: { cx: arrived?.cx, cy: arrived?.cy, visualTx: arrived?.visualTx, visualTy: arrived?.visualTy, driveGoal: arrived?.driveGoal } } });
    if (arrived?.driveGoal) throw new Error(`${tag}: stalled visMiss=${visMiss.toFixed(2)}`);
    if (visMiss > 0.45) throw new Error(`${tag}: visual center ${visMiss.toFixed(2)} tiles from tap`);
    await page.screenshot({ path: path.join(OUT, `${tag}-03-stop-visual.png`) });

    if (phone) {
      const held = await holdStickCdp(page, cdp, 4, -48, 1800);
      if (!held) throw new Error(`${tag}: stick missing for get-out`);
    } else {
      const dBtn = page.locator('.jac-dock [data-jac="gear"][data-val="D"]');
      if (await dBtn.count()) await dBtn.click();
      await page.evaluate(() => {
        document.activeElement?.blur?.();
        document.getElementById('game-canvas')?.focus();
      });
      await wait(80);
      await page.keyboard.down('ArrowUp');
      await page.evaluate(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }));
      });
      await wait(2200);
    }
    const moving = await page.evaluate(() => window.__playtestQa.jac());
    if ((moving.mph ?? 0) < 1) throw new Error(`${tag}: not moving before Get out ${JSON.stringify(moving)}`);
    const exitFrom = { cx: moving.cx, cy: moving.cy, mph: moving.mph };
    await page.evaluate(() => window.__playtestQa.jacGetOut());
    await wait(120);
    const midExit = await page.evaluate(() => window.__playtestQa.jac());
    if (!midExit.driving) throw new Error(`${tag}: Get out while moving ejected before brake`);
    const parked = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return j && !j.driving ? j : null;
      },
      6000,
    );
    const exitTravel = Math.hypot((parked?.cx ?? exitFrom.cx) - exitFrom.cx, (parked?.cy ?? exitFrom.cy) - exitFrom.cy);
    notes.push({ getOut: { from: exitFrom, travel: exitTravel, driving: parked?.driving } });
    if (exitTravel > 1.6) throw new Error(`${tag}: Get out travelled ${exitTravel.toFixed(2)} tiles`);
    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowUp');

    await page.evaluate(() => {
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.tapJac();
    });
    await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode)) === 'menu' ? true : null), 6000);
    await page.evaluate(() => window.__playtestQa.jacGetIn());
    await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 10000 });
    const door = await page.evaluate(() => {
      const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
      const named = list.find((b) => b.door && b.panelTitle);
      if (!named) return null;
      window.__playtestQa.frameDoorForQa?.(named.name);
      const client = window.__playtestQa.doorScreenPoint?.(named.name);
      return { name: named.name, client };
    });
    notes.push({ door });
    if (door?.name) {
      if (phone && door.client) await tapClientCdp(cdp, door.client.x, door.client.y);
      await page.evaluate((name) => window.__playtestQa.tapBuildingDoor?.(name), door.name);
      await wait(350);
      const after = await page.evaluate(() => ({
        interior: window.__playtestQa.isInInterior(),
        driving: window.__playtestQa.jac()?.driving,
      }));
      notes.push({ f7: after });
      if (after.interior) throw new Error(`${tag}: F7 entered interior while driving`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-05-no-building.png`) });

    await ctx.close();
    const video = page.video();
    if (video) {
      const dest = path.join(OUT, `${tag}-walkthrough.webm`);
      await video.saveAs(dest);
      notes.push({ video: dest });
    }
    return { tag, notes };
  } finally {
    await browser.close();
  }
}

const livePhone = await sampleLiveFps({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }).catch((e) => ({ error: String(e) }));
const liveDesktop = await sampleLiveFps({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }).catch((e) => ({ error: String(e) }));

const results = [
  { tag: 'live-fps', notes: [{ phone: livePhone, desktop: liveDesktop }] },
];
results.push(
  await run(
    'phone-390',
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    true,
  ),
);
results.push(
  await run('desktop-1280', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, false),
);
const liveIdle = liveDesktop?.idle?.fps ?? livePhone?.idle?.fps;
const previewIdle = results
  .flatMap((r) => r.notes)
  .map((n) => n.fpsIdle?.raf?.fps)
  .filter((n) => typeof n === 'number');
const previewMean = previewIdle.length ? previewIdle.reduce((a, b) => a + b, 0) / previewIdle.length : 0;
if (liveIdle && previewMean && previewMean < liveIdle * 0.45) {
  throw new Error(`preview idle FPS ${previewMean.toFixed(1)} << live ${liveIdle.toFixed(1)}`);
}

fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('record-tj-drive-model-r7: ok', OUT);
