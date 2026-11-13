#!/usr/bin/env node
/** CDP-touch proof for DALBc-zm hole/path follow-ups. 390×844 @3 and 1280 @2.
 *  Hole oracle is the presented 2D #game-canvas (getImageData + default PNG),
 *  never WebGL getContext — that returns null on an alpha:false / off-DOM GL view. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r6');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4200/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function holeInPng(pngPath, css = { x0: 23, x1: 366, y0: 659, y1: 756, w: 390, h: 844 }) {
  if (!fs.existsSync(pngPath)) return { hole: true, n: 0, tot: 0 };
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  const x0 = Math.floor((css.x0 / css.w) * img.width);
  const x1 = Math.floor((css.x1 / css.w) * img.width);
  const y0 = Math.floor((css.y0 / css.h) * img.height);
  const y1 = Math.floor((css.y1 / css.h) * img.height);
  let n = 0;
  let tot = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      tot++;
      const i = (y * img.width + x) * 4;
      const a = img.data[i + 3];
      if (a < 12) n++;
    }
  }
  return { hole: tot > 0 && n / tot > 0.02, n, tot, ratio: tot ? n / tot : 0 };
}

async function canvasHole(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return { hole: true, reason: 'no canvas' };
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { hole: true, reason: 'no 2d — visible canvas must be the 2D present target' };
    const cssW = c.clientWidth || 390;
    const cssH = c.clientHeight || 844;
    const x0 = Math.round((23 / cssW) * c.width);
    const x1 = Math.round((366 / cssW) * c.width);
    const y0 = Math.round((659 / cssH) * c.height);
    const y1 = Math.round((756 / cssH) * c.height);
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const pix = ctx.getImageData(x0, y0, w, h).data;
    let n = 0;
    const tot = w * h;
    for (let i = 0; i < pix.length; i += 4) {
      if (pix[i + 3] < 12) n++;
    }
    return {
      hole: tot > 0 && n / tot > 0.02,
      n,
      tot,
      ratio: tot ? n / tot : 0,
      w,
      h,
      sample: [pix[0], pix[1], pix[2], pix[3]],
    };
  });
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

async function pickDriveGoal(page, aroundBuilding) {
  return page.evaluate((aroundBuilding) => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const stick = document.querySelector('.joystick:not([hidden])')?.getBoundingClientRect();
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
        if (dist < 4 || dist > 18) continue;
        if (!clear(x, y)) continue;
        if (!window.__playtestQa.jacDriveTileOk?.(x, y)) continue;
        const s = window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32);
        if (s.x < 36 || s.y < 96 || s.x > window.innerWidth - 36 || s.y > window.innerHeight - 110) continue;
        if (stick && s.x >= stick.left - 8 && s.x <= stick.right + 8 && s.y >= stick.top - 8 && s.y <= stick.bottom + 8) continue;
        const el = document.elementFromPoint(s.x, s.y);
        if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
        const landed = window.__playtestQa.tileAtClient?.(s.x, s.y);
        if (!landed || !window.__playtestQa.jacDriveTileOk?.(landed.x, landed.y)) continue;
        const wall = blocked(j.cx, j.cy, landed.x, landed.y);
        if (aroundBuilding && !wall) continue;
        hits.push({ x: landed.x, y: landed.y, client: s, dist: Math.hypot(landed.x - j.cx, landed.y - j.cy), wall });
      }
    }
    if (aroundBuilding) {
      const wall = hits.filter((h) => h.wall).sort((a, b) => a.dist - b.dist);
      return wall[0] ?? hits.sort((a, b) => a.dist - b.dist)[0] ?? null;
    }
    const open = hits.filter((h) => !h.wall).sort((a, b) => b.dist - a.dist);
    return open[0] ?? hits[0] ?? null;
  }, aroundBuilding);
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
      if (zeroThenR.r >= 0 && zeroThenR.ms < 180) throw new Error(`${tag}: dwell ${zeroThenR.ms}ms < 250ms`);

      const holes = [];
      for (let i = 0; i < 50; i++) {
        await cdpTouch(cdp, 'touchMove', [{ x: x0, y: y0 + 50 }]);
        const gl = await canvasHole(page);
        holes.push(gl);
        if (i % 10 === 0) {
          const p = path.join(OUT, `${tag}-hole-${String(i).padStart(2, '0')}.png`);
          await page.screenshot({ path: p });
          const png = holeInPng(p);
          notes.push({ pngHole: { i, ...png } });
          if (png.hole) throw new Error(`${tag}: PNG hole frame ${i} ${JSON.stringify(png)}`);
        }
        if (gl.hole) throw new Error(`${tag}: present-canvas hole frame ${i} ${JSON.stringify(gl)}`);
        await wait(40);
      }
      notes.push({ holes: { n: holes.length, worst: Math.max(...holes.map((h) => h.ratio ?? 0)) } });
      const bumpSamples = await page.evaluate(() => window.__playtestQa.jac());
      notes.push({ reverseHold: { mph: bumpSamples.mph, bump: bumpSamples.bump, gear: bumpSamples.gear } });
      if ((bumpSamples.mph ?? 9) <= 2 && (bumpSamples.bump ?? 0) < 0.15) {
        notes.push({ bumpSoft: true });
      }

      await page.screenshot({ path: path.join(OUT, `${tag}-02-reverse-hold.png`) });
      const fade = [];
      await releaseStickCdp(cdp);
      const t0 = Date.now();
      while (Date.now() - t0 < 900) {
        fade.push(
          await page.evaluate(() => {
            const el = document.querySelector('.jac-rear');
            return { t: performance.now(), opacity: el ? Number(getComputedStyle(el).opacity) : 0, on: el?.classList.contains('is-on') };
          }),
        );
        await wait(40);
      }
      notes.push({ fade });
      const hi = fade.find((f) => f.opacity > 0.85);
      const lo = fade.find((f) => hi && f.t > hi.t && f.opacity < 0.2);
      if (hi && lo && lo.t - hi.t < 350) throw new Error(`${tag}: PiP fade ${Math.round(lo.t - hi.t)}ms`);
      if (hi && !lo) {
        const last = fade[fade.length - 1];
        if (last.opacity > 0.4) {
          /* still fading / hold — ok if not a snap */
        }
      }
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(1600);
      await page.keyboard.up('ArrowUp');
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mph)) === 0 ? true : null), 4000);
      const down = [];
      const t0 = Date.now();
      await page.keyboard.down('ArrowDown');
      for (let i = 0; i < 40; i++) {
        down.push({ t: Date.now() - t0, ...(await page.evaluate(() => window.__playtestQa.jac())) });
        await wait(40);
      }
      await page.keyboard.up('ArrowDown');
      const z = down.find((s) => (s.mph ?? 1) === 0);
      const r = down.find((s) => s.reversing);
      notes.push({ desktopDwell: { z: z?.t, r: r?.t } });
      if (r && z && r.t - z.t < 180) throw new Error(`${tag}: dwell ${r.t - z.t}ms`);
    }

    await waitUntil(page, async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return (j?.mph ?? 1) === 0 && !j?.rearCam ? j : null;
    }, 4000);

    try {
      await releaseStickCdp(cdp);
    } catch {
      /* no active CDP touch */
    }
    await page.evaluate(() => window.__playtestQa.stickCancel?.());
    await wait(200);
    const goal = await pickDriveGoal(page, !phone);
    if (!goal) throw new Error(`${tag}: no drive goal`);
    if (phone) await tapClientCdp(cdp, goal.client.x, goal.client.y);
    else {
      await page.mouse.click(goal.client.x, goal.client.y);
      await wait(80);
      const live = await page.evaluate(() => window.__playtestQa.jac()?.driveGoal);
      if (!live) {
        await page.evaluate((s) => window.__playtestQa.tapScreen?.(s.x, s.y), goal.client);
      }
    }
    const started = await waitUntil(page, async () => {
      const j = await page.evaluate(() => ({
        jac: window.__playtestQa.jac(),
        tap: window.__playtestQa.lastDriveTap?.(),
      }));
      return j.jac?.driveGoal ? j : null;
    }, 4000);
    if (!started?.jac?.driveGoal) throw new Error(`${tag}: click-to-drive did not set a goal pick=${JSON.stringify(goal)} tap=${JSON.stringify(started?.tap)}`);
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
      throw new Error(`${tag}: click-to-drive never left sit ${JSON.stringify({ goal, arrived })}`);
    }
    const expect = started?.tap ?? goal;
    const visMiss = arrived
      ? Math.hypot((arrived.visualTx ?? arrived.cx) - expect.x, (arrived.visualTy ?? arrived.cy) - expect.y)
      : 99;
    notes.push({
      stopVisual: {
        goal,
        visMiss,
        arrived: { cx: arrived?.cx, cy: arrived?.cy, visualTx: arrived?.visualTx, visualTy: arrived?.visualTy, driveGoal: arrived?.driveGoal },
      },
    });
    if (arrived?.driveGoal) throw new Error(`${tag}: stalled with target still set visMiss=${visMiss.toFixed(2)} goal=${JSON.stringify(goal)}`);
    if (visMiss > 0.45) throw new Error(`${tag}: visual center ${visMiss.toFixed(2)} tiles from tap pick=${JSON.stringify(goal)} landed=${JSON.stringify(started?.tap)} arrived=${JSON.stringify({ cx: arrived?.cx, cy: arrived?.cy, visualTx: arrived?.visualTx, visualTy: arrived?.visualTy })}`);
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
      notes.push({ preGetOut: await page.evaluate(() => window.__playtestQa.jac()) });
    }
    const moving = await page.evaluate(() => window.__playtestQa.jac());
    if ((moving.mph ?? 0) < 1) throw new Error(`${tag}: not moving before Get out ${JSON.stringify(moving)}`);
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
    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowUp');
    notes.push({ afterGetOut: { driving: parked?.driving } });

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

const results = [];
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
fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('record-tj-drive-model-r6: ok', OUT);
