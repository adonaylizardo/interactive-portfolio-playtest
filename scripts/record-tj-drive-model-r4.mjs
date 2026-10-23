#!/usr/bin/env node
/** CDP-touch proof for BfS1VWKB follow-ups. 390×844 @3 and 1280 @2. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r4');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4200/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function whiteSlab(pngPath) {
  if (!fs.existsSync(pngPath)) return { slab: false, n: 0 };
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  const x0 = Math.floor(img.width * 0.08);
  const x1 = Math.floor(img.width * 0.92);
  const y0 = Math.floor(img.height * 0.55);
  const y1 = Math.floor(img.height * 0.88);
  let n = 0;
  let tot = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      tot++;
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (r > 230 && g > 230 && b > 230) n++;
    }
  }
  return { slab: tot > 0 && n / tot > 0.18, n, tot, ratio: tot ? n / tot : 0 };
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

async function pickDriveGoal(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const stick = document.querySelector('.joystick:not([hidden])')?.getBoundingClientRect();
    const clear = (x, y) => {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          const ch = walk[y + dy]?.[x + dx];
          if (!ch || ch === '#' || ch === 'x') return false;
        }
      }
      return true;
    };
    const hits = [];
    for (let y = Math.round(j.cy) - 2; y < Math.round(j.cy) + 14; y++) {
      for (let x = Math.round(j.cx) - 2; x < Math.round(j.cx) + 16; x++) {
        if (Math.hypot(x - j.cx, y - j.cy) < 3) continue;
        if (!clear(x, y)) continue;
        const s = window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32);
        if (s.x < 36 || s.y < 96 || s.x > window.innerWidth - 36 || s.y > window.innerHeight - 110) continue;
        if (stick && s.x >= stick.left - 8 && s.x <= stick.right + 8 && s.y >= stick.top - 8 && s.y <= stick.bottom + 8) continue;
        const el = document.elementFromPoint(s.x, s.y);
        if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
        hits.push({ x, y, client: s, dist: Math.hypot(x - j.cx, y - j.cy) });
      }
    }
    hits.sort((a, b) => b.dist - a.dist);
    return hits[0] ?? null;
  });
}

async function strayCanvases(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('canvas')].map((c) => {
      const r = c.getBoundingClientRect();
      const st = getComputedStyle(c);
      return {
        id: c.id,
        w: r.width,
        h: r.height,
        top: r.top,
        vis: st.visibility,
        display: st.display,
        opacity: Number(st.opacity),
        parent: c.parentElement?.id || c.parentElement?.className || '',
      };
    }),
  );
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
    await page.evaluate(() => {
      window.__playtestQa.tapJac();
    });
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
    notes.push({ afterD: await page.evaluate(() => window.__playtestQa.jac()) });

    if (phone) {
      const held = await holdStickCdp(page, cdp, 6, -48, 2400);
      if (!held) throw new Error(`${tag}: stick missing`);
      await releaseStickCdp(cdp);
      await waitUntil(page, async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return (j?.mph ?? 1) === 0 ? j : null;
      }, 4000);
      const down = [];
      const box = await page.locator('.joystick').boundingBox();
      const x0 = box.x + box.width / 2;
      const y0 = box.y + box.height / 2;
      await cdpTouch(cdp, 'touchStart', [{ x: x0, y: y0 }]);
      await dragStickCdp(page, cdp, { x: x0, y: y0 }, { x: x0, y: y0 + 50 }, 5500, down);
      await page.screenshot({ path: path.join(OUT, `${tag}-01-down-after-d.png`) });
      const reversed = down.some((s) => s.reversing || s.gear === 'R');
      const maxRev = Math.max(0, ...down.filter((s) => s.reversing).map((s) => s.mph ?? 0));
      notes.push({
        downAfterD: down.map((s) => ({ mph: s.mph, gear: s.gear, reversing: s.reversing })).filter((_, i) => i % 6 === 0),
        reversed,
        maxRev,
      });
      if (!reversed) throw new Error(`${tag}: HIGH stick-down after D stayed in D at 0`);
      if (maxRev < 2) throw new Error(`${tag}: reversed but mph stayed ${maxRev}`);

      const firstZero = down.findIndex((s) => (s.mph ?? 1) === 0);
      const firstBack = down.findIndex((s) => s.reversing);
      notes.push({ dwell: { firstZero, firstBack } });
      if (firstBack >= 0 && firstZero >= 0 && firstBack < firstZero) {
        throw new Error(`${tag}: reversed before braking to 0`);
      }

      await page.screenshot({ path: path.join(OUT, `${tag}-02-reverse-hold.png`) });
      const slab = whiteSlab(path.join(OUT, `${tag}-02-reverse-hold.png`));
      const stray = await strayCanvases(page);
      notes.push({ slab, stray });
      if (slab.slab) throw new Error(`${tag}: white slab while reversing ${JSON.stringify(slab)}`);
      const visibleStray = stray.filter(
        (c) =>
          c.id !== 'game-canvas' &&
          !/jac-rear|jac-hud|jac-dock/.test(c.parent) &&
          c.w > 80 &&
          c.h > 80 &&
          c.display !== 'none' &&
          c.opacity > 0.05 &&
          c.vis !== 'hidden',
      );
      if (visibleStray.length) throw new Error(`${tag}: stray canvas ${JSON.stringify(visibleStray)}`);

      const fade = [];
      await releaseStickCdp(cdp);
      const t0 = Date.now();
      while (Date.now() - t0 < 800) {
        fade.push(
          await page.evaluate(() => {
            const el = document.querySelector('.jac-rear');
            return { t: performance.now(), opacity: el ? Number(getComputedStyle(el).opacity) : 0, on: el?.classList.contains('is-on') };
          }),
        );
        await wait(80);
      }
      notes.push({ fade });
      const started = fade.find((f) => f.opacity > 0.4);
      const ended = fade.find((f) => started && f.opacity < 0.15);
      if (started && ended && ended.t - started.t < 350) {
        throw new Error(`${tag}: PiP fade ${Math.round(ended.t - started.t)}ms < 500ms`);
      }
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(2000);
      await page.keyboard.up('ArrowUp');
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mph)) === 0 ? true : null), 4000);
      const down = [];
      await page.keyboard.down('ArrowDown');
      for (let i = 0; i < 36; i++) {
        down.push(await page.evaluate(() => window.__playtestQa.jac()));
        await wait(80);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-01-down-after-d.png`) });
      notes.push({ downAfterD: down.map((s) => ({ mph: s.mph, gear: s.gear, reversing: s.reversing })).filter((_, i) => i % 4 === 0) });
      if (!down.some((s) => s.reversing)) throw new Error(`${tag}: S/down after D never reversed`);
      const z = down.findIndex((s) => (s.mph ?? 1) === 0);
      const r = down.findIndex((s) => s.reversing);
      if (r >= 0 && z >= 0 && r < z) throw new Error(`${tag}: desktop reversed before 0`);
      await page.screenshot({ path: path.join(OUT, `${tag}-02-reverse-hold.png`) });
      await page.keyboard.up('ArrowDown');
    }

    await waitUntil(page, async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return (j?.mph ?? 1) === 0 && !j?.rearCam ? j : null;
    }, 4000);

    const goal = await pickDriveGoal(page);
    if (!goal) throw new Error(`${tag}: no drive goal`);
    if (phone) await tapClientCdp(cdp, goal.client.x, goal.client.y);
    else await page.mouse.click(goal.client.x, goal.client.y);
    await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driveGoal)) ? true : null), 3000);
    const arrived = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        if (!j?.driveGoal && (j?.mph ?? 1) === 0) return j;
        return null;
      },
      16000,
    );
    const visMiss = arrived
      ? Math.hypot((arrived.visualTx ?? arrived.cx) - goal.x, (arrived.visualTy ?? arrived.cy) - goal.y)
      : 99;
    notes.push({ stopVisual: { goal, visMiss, arrived: { cx: arrived?.cx, cy: arrived?.cy, visualTx: arrived?.visualTx, visualTy: arrived?.visualTy } } });
    if (visMiss > 1.15) throw new Error(`${tag}: visual center ${visMiss.toFixed(2)} tiles from tap`);
    await page.screenshot({ path: path.join(OUT, `${tag}-03-stop-visual.png`) });

    if (phone) {
      const held = await holdStickCdp(page, cdp, 4, -48, 2200);
      if (!held) throw new Error(`${tag}: stick missing for get-out`);
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(1800);
    }
    const moving = await page.evaluate(() => window.__playtestQa.jac());
    notes.push({ beforeGetOut: { mph: moving.mph, cx: moving.cx, cy: moving.cy } });
    if ((moving.mph ?? 0) < 4) throw new Error(`${tag}: not moving before Get out`);
    await page.evaluate(() => window.__playtestQa.jacGetOut());
    await wait(120);
    const midExit = await page.evaluate(() => window.__playtestQa.jac());
    notes.push({ midExit: { driving: midExit.driving, mph: midExit.mph, cx: midExit.cx, cy: midExit.cy } });
    if (!midExit.driving) throw new Error(`${tag}: Get out while moving ejected before brake`);
    let stoppedAt = null;
    const parked = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        if (j?.driving && (j.mph ?? 1) === 0) stoppedAt = { cx: j.cx, cy: j.cy };
        return j && !j.driving ? j : null;
      },
      6000,
    );
    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowUp');
    const origin = stoppedAt
      ?? (parked?.exitCx != null ? { cx: parked.exitCx, cy: parked.exitCy } : { cx: moving.cx, cy: moving.cy });
    const slide = parked ? Math.hypot(parked.cx - origin.cx, parked.cy - origin.cy) : 99;
    notes.push({ afterGetOut: { slide, stoppedAt, origin, parked: { cx: parked?.cx, cy: parked?.cy, driving: parked?.driving } } });
    if (slide > 0.55) throw new Error(`${tag}: Get out slid the van ${slide.toFixed(2)} tiles`);
    await page.screenshot({ path: path.join(OUT, `${tag}-04-get-out.png`) });

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
        panel: window.__playtestQa.isBuildingPanelOpen(),
        driving: window.__playtestQa.jac()?.driving,
      }));
      notes.push({ f7: after });
      if (after.interior) throw new Error(`${tag}: F7 entered interior while driving`);
      if (!after.driving) throw new Error(`${tag}: F7 left the van`);
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
console.log('record-tj-drive-model-r4: ok', OUT);
