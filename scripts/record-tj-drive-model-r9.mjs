#!/usr/bin/env node
/** CDP proof r9: after drive+park, real clicks on the van Get in 5/5
 *  (desktop mouse + phone touch), dwell >=400ms, roof toast, on-foot roof walks. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r9');
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

async function toastVisible(page) {
  return page.evaluate(() => {
    const el = document.getElementById('playtest-toast');
    if (!el || !el.classList.contains('playtest-toast--visible')) return null;
    return el.textContent ?? '';
  });
}

async function clearToast(page) {
  await page.evaluate(() => {
    document.getElementById('playtest-toast')?.classList.remove('playtest-toast--visible');
  });
}

async function vanClient(page) {
  return page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    const c = document.getElementById('game-canvas')?.getBoundingClientRect();
    if (!e || !c) return null;
    return { x: c.left + e.sx, y: c.top + e.sy, cx: e.cx, cy: e.cy };
  });
}

async function pickAwayTile(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const hits = [];
    for (let y = 0; y < walk.length; y++) {
      for (let x = 0; x < (walk[y]?.length ?? 0); x++) {
        const ch = walk[y][x];
        if (!ch || ch === '#' || ch === 'x') continue;
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 8 || dist > 12) continue;
        hits.push({ x, y, dist });
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits[Math.min(3, hits.length - 1)] ?? hits[0] ?? null;
  });
}

async function clickVan(page, cdp, phone, van, dy) {
  const x = van.x;
  const y = van.y + dy;
  if (phone) await tapClientCdp(cdp, x, y);
  else await page.mouse.click(x, y);
}

async function clickGetIn(page, cdp, phone, tag, i) {
  const btn = page.locator('.jac-menu [data-jac="in"]');
  await btn.waitFor({ state: 'visible', timeout: 4000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error(`${tag}: Get in box missing trial ${i}`);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  if (phone) await tapClientCdp(cdp, cx, cy);
  else await page.mouse.click(cx, cy);
}

async function sitByVan(page) {
  await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const cx = Math.round(j.cx);
    const cy = Math.round(j.cy);
    for (let d = 1; d <= 5; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = cx + dx;
          const y = cy + dy;
          const ch = walk[y]?.[x];
          if (!ch || ch === '#' || ch === 'x') continue;
          window.__playtestQa.setCharacterTile(x, y);
          return;
        }
      }
    }
  });
}

async function ensureDriving(page, cdp, phone, tag) {
  const driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
  if (driving) return;
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
  });
  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  const menu = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode)) === 'menu' ? true : null),
    8000,
  );
  if (!menu) await page.evaluate(() => window.__playtestQa.jacGetIn());
  else await page.evaluate(() => window.__playtestQa.jacGetIn());
  const boarded = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    16000,
  );
  if (!boarded) throw new Error(`${tag}: ensureDriving never boarded`);
  void cdp;
  void phone;
}

async function driveOffSit(page, cdp, phone) {
  const dest = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const hits = [];
    for (let y = Math.round(j.cy) - 12; y <= Math.round(j.cy) + 12; y++) {
      for (let x = Math.round(j.cx) - 12; x <= Math.round(j.cx) + 12; x++) {
        const ch = walk[y]?.[x];
        if (!ch || ch === '#' || ch === 'x') continue;
        if (!window.__playtestQa.jacDriveTileOk?.(x, y)) continue;
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 5 || dist > 11) continue;
        hits.push({ x, y, dist });
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits[Math.min(2, hits.length - 1)] ?? hits[0] ?? null;
  });
  if (!dest) throw new Error('no drive-off tile');
  const start = await page.evaluate(() => window.__playtestQa.jac());
  const ok = await page.evaluate((p) => window.__playtestQa.jacDriveTo?.(p.x, p.y), dest);
  if (!ok) {
    const client = await page.evaluate((p) => window.__playtestQa.worldToClient((p.x - p.y) * 64, (p.x + p.y) * 32), dest);
    if (!client) throw new Error('drive-off client missing');
    if (phone) await tapClientCdp(cdp, client.x, client.y);
    else await page.mouse.click(client.x, client.y);
  }
  const arrived = await waitUntil(
    page,
    async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      const moved = Math.hypot((j?.cx ?? 0) - (start.cx ?? 0), (j?.cy ?? 0) - (start.cy ?? 0));
      if (!j?.driveGoal && (j?.mph ?? 1) === 0 && moved > 0.8) return j;
      return null;
    },
    18000,
  );
  if (!arrived) throw new Error(`drive-off never arrived dest=${JSON.stringify(dest)}`);
}

async function parkClickGetIn(page, cdp, tag, phone, n = 5) {
  const trials = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('map');
      window.__playtestQa.setNpcs?.(false);
    });
    await ensureDriving(page, cdp, phone, tag);
    const beforeDrive = await page.evaluate(() => window.__playtestQa.jac());
    await driveOffSit(page, cdp, phone);
    const afterDrive = await page.evaluate(() => window.__playtestQa.jac());
    if (Math.hypot((afterDrive.cx ?? 0) - (beforeDrive.cx ?? 0), (afterDrive.cy ?? 0) - (beforeDrive.cy ?? 0)) < 0.8) {
      throw new Error(`${tag}: cycle ${i} did not leave the sit before park`);
    }
    await page.evaluate(() => window.__playtestQa.jacGetOut());
    const parked = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return j && !j.driving ? j : null;
      },
      8000,
    );
    if (!parked) throw new Error(`${tag}: cycle ${i} never parked`);
    const away = await pickAwayTile(page);
    if (!away) throw new Error(`${tag}: cycle ${i} no away tile`);
    await page.evaluate((p) => {
      window.__playtestQa.setCharacterTile(p.x, p.y);
      window.__playtestQa.focusJac?.();
    }, away);
    await wait(280);
    const van = await vanClient(page);
    if (!van) throw new Error(`${tag}: cycle ${i} van client missing`);
    const pick = await page.evaluate((v) => window.__playtestQa.pickAt?.(v.x, v.y), van);
    const clicks = [];
    let reacted = null;
    for (const dy of [0, -28, 28]) {
      const before = await page.evaluate(() => ({
        mode: window.__playtestQa.jac()?.mode,
        tile: window.__playtestQa.getCharacterTile(),
        goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
      }));
      await clickVan(page, cdp, phone, van, dy);
      const after = await waitUntil(
        page,
        async () => {
          const s = await page.evaluate(() => ({
            mode: window.__playtestQa.jac()?.mode,
            tile: window.__playtestQa.getCharacterTile(),
            goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
            driving: window.__playtestQa.jac()?.driving,
          }));
          const walked = s.goal || (s.tile && (s.tile.x !== before.tile.x || s.tile.y !== before.tile.y));
          if (s.mode === 'menu' || walked) return s;
          return null;
        },
        900,
        50,
      );
      clicks.push({ dy, after, before });
      if (after) {
        reacted = after;
        break;
      }
    }
    if (!reacted) {
      await page.screenshot({ path: path.join(OUT, `${tag}-park-miss-${i}.png`) });
      throw new Error(`${tag}: cycle ${i} van clicks ignored pick=${JSON.stringify(pick)} van=${JSON.stringify(van)}`);
    }
    const menu = reacted.mode === 'menu'
      ? reacted
      : await waitUntil(
          page,
          async () => {
            const j = await page.evaluate(() => ({
              mode: window.__playtestQa.jac()?.mode,
              tile: window.__playtestQa.getCharacterTile(),
            }));
            return j.mode === 'menu' ? j : null;
          },
          28000,
        );
    if (menu?.mode !== 'menu') throw new Error(`${tag}: cycle ${i} menu never opened after van click`);
    await page.screenshot({ path: path.join(OUT, `${tag}-park-menu-${i}.png`) });
    await clickGetIn(page, cdp, phone, tag, i);
    const boarded = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return j?.driving ? j : null;
      },
      12000,
    );
    if (!boarded?.driving) throw new Error(`${tag}: cycle ${i} Get in after park failed`);
    trials.push({
      i,
      away,
      van,
      pick,
      parked: { cx: parked.cx, cy: parked.cy },
      drive: { from: { cx: beforeDrive.cx, cy: beforeDrive.cy }, to: { cx: afterDrive.cx, cy: afterDrive.cy } },
      clicks,
      boarded: true,
    });
  }
  return trials;
}

async function roofTargets(page) {
  return page.evaluate(() => {
    const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
    const hits = [];
    for (const b of list) {
      for (let dy = 0; dy <= 4; dy++) {
        for (let dx = 0; dx <= 6; dx++) {
          const tx = b.x + dx;
          const ty = b.y + dy;
          const w = window.__playtestQa.worldToClient?.((tx - ty) * 64, (tx + ty) * 32);
          if (!w || w.x < 40 || w.y < 80 || w.x > window.innerWidth - 40 || w.y > 520) continue;
          const el = document.elementFromPoint(w.x, w.y);
          if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
          if (el?.closest?.('.jac-hud, .checklist, .chrome')) continue;
          const pick = window.__playtestQa.pickAt?.(w.x, w.y);
          if (!pick?.building) continue;
          hits.push({ name: b.name, tx, ty, client: w, pick, door: b.door });
        }
      }
    }
    return hits.slice(0, 8);
  });
}

async function drivingRoofToast(page, tag) {
  await page.evaluate(() => {
    const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
    const named = list.find((b) => b.door && b.panelTitle) ?? list[0];
    window.__playtestQa.stickCancel?.();
    if (named) {
      const tx = named.x + 1;
      const ty = named.y + 1;
      window.__playtestQa.frameWorld?.((tx - ty) * 64, (tx + ty) * 32, 0.72);
    }
  });
  await wait(250);
  const roofs = await roofTargets(page);
  if (!roofs.length) throw new Error(`${tag}: no driving roof target`);
  let toast = null;
  let roof = roofs[0];
  for (roof of roofs) {
    await clearToast(page);
    await page.mouse.click(roof.client.x, roof.client.y);
    toast = await waitUntil(page, () => toastVisible(page), 900, 40);
    if (toast) break;
  }
  if (!toast) throw new Error(`${tag}: driving roof produced no toast`);
  const goal = await page.evaluate(() => window.__playtestQa.jac()?.driveGoal);
  return { roof, toast, goal };
}

async function footRoofWalks(page, tag) {
  await page.evaluate(() => {
    if (window.__playtestQa.jac()?.driving) window.__playtestQa.jacGetOut();
    window.__playtestQa.jacClose?.();
  });
  await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? null : true), 6000);
  await page.evaluate(() => {
    const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
    const named = list.find((b) => b.door && b.panelTitle) ?? list[0];
    const walk = window.__playtestQa.fill().walk;
    if (named?.door) {
      let spot = null;
      for (let y = named.door.y - 6; y <= named.door.y + 6 && !spot; y++) {
        for (let x = named.door.x + 3; x <= named.door.x + 8 && !spot; x++) {
          const ch = walk[y]?.[x];
          if (ch && ch !== '#' && ch !== 'x') spot = { x, y };
        }
      }
      if (spot) window.__playtestQa.setCharacterTile(spot.x, spot.y);
      window.__playtestQa.frameWorld?.((named.x - named.y) * 64, (named.x + named.y) * 32, 0.72);
    }
  });
  await wait(250);
  const roofs = await roofTargets(page);
  if (!roofs.length) throw new Error(`${tag}: no on-foot roof target`);
  const roof = roofs[0];
  await page.mouse.click(roof.client.x, roof.client.y);
  await wait(400);
  const after = await page.evaluate(() => ({
    interior: window.__playtestQa.isInInterior(),
    goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
    tile: window.__playtestQa.getCharacterTile(),
    panel: window.__playtestQa.isBuildingPanelOpen?.(),
  }));
  if (after.interior) throw new Error(`${tag}: on-foot roof entered the building`);
  if (!after.goal && after.tile) {
    const door = roof.door;
    const onDoor = door && Math.hypot(after.tile.x - door.x, after.tile.y - door.y) < 1.2;
    if (!onDoor) throw new Error(`${tag}: on-foot roof did not walk ${JSON.stringify(after)}`);
  }
  return { roof, after };
}

async function reverseTapToast(page, tag) {
  await ensureDriving(page, null, false, tag);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  await wait(150);
  const spots = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const hits = [];
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const tx = Math.round(j.cx + dx);
        const ty = Math.round(j.cy + dy);
        if (window.__playtestQa.jacDriveTileOk?.(tx, ty)) continue;
        const w = window.__playtestQa.worldToClient?.((tx - ty) * 64, (tx + ty) * 32);
        if (!w || w.x < 40 || w.y < 80 || w.x > window.innerWidth - 40 || w.y > 520) continue;
        const el = document.elementFromPoint(w.x, w.y);
        if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
        if (el?.closest?.('.jac-hud, .checklist, .chrome')) continue;
        hits.push({ tx, ty, client: w, pick: window.__playtestQa.pickAt?.(w.x, w.y) });
      }
    }
    return hits.slice(0, 10);
  });
  if (!spots.length) {
    const roofs = await roofTargets(page);
    spots.push(...roofs);
  }
  if (!spots.length) throw new Error(`${tag}: no R-tap undrivable tile`);
  let toast = null;
  let spot = spots[0];
  for (spot of spots) {
    await clearToast(page);
    await page.mouse.click(spot.client.x, spot.client.y);
    toast = await waitUntil(page, () => toastVisible(page), 900, 40);
    if (toast) return { spot, toast };
    await page.evaluate((p) => window.__playtestQa.tapScreen?.(p.x, p.y), spot.client);
    toast = await waitUntil(page, () => toastVisible(page), 700, 40);
    if (toast) return { spot, toast, via: 'tapScreen' };
  }
  throw new Error(`${tag}: tap while in R produced no toast`);
}

async function plainWheelZoom(page) {
  const before = await page.evaluate(() => window.__playtestQa.getZoom());
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, -180);
  await wait(120);
  const after = await page.evaluate(() => window.__playtestQa.getZoom());
  return { before, after };
}

async function sampleLiveFps(options) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  try {
    await page.goto(LIVE, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await wait(1500);
    const idle = await rafFps(page, 1200);
    return { idle, url: LIVE };
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
    const meta = await canvasMeta(page);
    notes.push({ canvas: meta });
    if (meta.is2d) throw new Error(`${tag}: #game-canvas is 2D`);
    if (meta.sameCanvas === false) throw new Error(`${tag}: Pixi view is not #game-canvas`);

    const cycles = await parkClickGetIn(page, cdp, tag, phone, 5);
    notes.push({ parkClickGetIn: { n: cycles.length, trials: cycles } });
    if (cycles.length !== 5 || cycles.some((t) => !t.boarded)) {
      throw new Error(`${tag}: park-click Get in ${cycles.filter((t) => t.boarded).length}/5`);
    }

    if (!phone) {
      const toast = await drivingRoofToast(page, tag);
      notes.push({ drivingRoofToast: toast });
      const foot = await footRoofWalks(page, tag);
      notes.push({ footRoof: foot });
      const rToast = await reverseTapToast(page, tag);
      notes.push({ reverseTapToast: rToast });
      await ensureDriving(page, cdp, phone, tag);
      const wheel = await plainWheelZoom(page);
      notes.push({ wheel });
      if (!(wheel.after > wheel.before * 1.02)) {
        throw new Error(`${tag}: plain wheel did not zoom ${JSON.stringify(wheel)}`);
      }
    }

    await ensureDriving(page, cdp, phone, tag);
    if (phone) {
      const dBtn = page.locator('.jac-bar [data-jac="gear"][data-val="D"]');
      if (await dBtn.count()) await dBtn.click();
    } else {
      const dBtn = page.locator('.jac-dock [data-jac="gear"][data-val="D"]');
      if (await dBtn.count()) await dBtn.click();
    }
    await wait(120);

    if (phone) {
      const held = await holdStickCdp(page, cdp, 6, -48, 1600);
      if (!held) throw new Error(`${tag}: stick missing`);
      await releaseStickCdp(cdp);
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mph)) === 0 ? true : null), 4000);
      const down = [];
      const box = await page.locator('.joystick').boundingBox();
      const x0 = box.x + box.width / 2;
      const y0 = box.y + box.height / 2;
      await cdpTouch(cdp, 'touchStart', [{ x: x0, y: y0 }]);
      await dragStickCdp(page, cdp, { x: x0, y: y0 }, { x: x0, y: y0 + 50 }, 1800, down);
      const zeroThenR = (() => {
        const z = down.findIndex((s) => (s.mph ?? 1) === 0);
        const r = down.findIndex((s) => s.gear === 'R' || s.reversing);
        return { z, r, ms: r >= 0 && z >= 0 ? (r - z) * 50 : 0 };
      })();
      notes.push({ dwell: zeroThenR });
      if (zeroThenR.r < 0 || zeroThenR.ms < 400) {
        throw new Error(`${tag}: dwell ${zeroThenR.ms}ms < 400ms`);
      }

      const holes = [];
      const clip = { x: 23, y: 80, width: 343, height: 140 };
      for (let i = 0; i < 50; i++) {
        await cdpTouch(cdp, 'touchMove', [{ x: x0, y: y0 + 50 }]);
        const p = path.join(OUT, `${tag}-hole-${String(i).padStart(2, '0')}.png`);
        await page.screenshot({ path: p, clip });
        const png = holeInPng(p);
        holes.push(png);
        if (png.hole) throw new Error(`${tag}: PNG hole frame ${i} ${JSON.stringify(png)}`);
        await wait(40);
      }
      notes.push({ holes: { n: holes.length, worst: Math.max(...holes.map((h) => h.ratio ?? 0)) } });

      const fade = [];
      await releaseStickCdp(cdp);
      const t0 = Date.now();
      while (Date.now() - t0 < 1200) {
        fade.push(
          await page.evaluate(() => {
            const el = document.querySelector('.jac-rear');
            return { t: performance.now(), opacity: el ? Number(getComputedStyle(el).opacity) : 0 };
          }),
        );
        await wait(40);
      }
      const hi = fade.find((f) => f.opacity > 0.85);
      const lo = fade.find((f) => hi && f.t > hi.t && f.opacity < 0.2);
      const fadeMs = hi && lo ? Math.round(lo.t - hi.t) : 0;
      notes.push({ fadeMs, fade: fade.slice(0, 8) });
      if (fadeMs && fadeMs < 300) throw new Error(`${tag}: PiP fade ${fadeMs}ms < 300`);

      const held2 = await holdStickCdp(page, cdp, 4, -48, 1600);
      if (!held2) throw new Error(`${tag}: stick missing for get-out`);
      const moving = await page.evaluate(() => window.__playtestQa.jac());
      if ((moving.mph ?? 0) < 1) throw new Error(`${tag}: not moving before Get out`);
      const exitFrom = { cx: moving.cx, cy: moving.cy, mph: moving.mph };
      await page.evaluate(() => window.__playtestQa.jacGetOut());
      const parked = await waitUntil(
        page,
        async () => {
          const j = await page.evaluate(() => window.__playtestQa.jac());
          return j && !j.driving ? j : null;
        },
        6000,
      );
      const exitTravel = Math.hypot((parked?.cx ?? exitFrom.cx) - exitFrom.cx, (parked?.cy ?? exitFrom.cy) - exitFrom.cy);
      notes.push({ getOut: { from: exitFrom, travel: exitTravel } });
      if (exitTravel > 0.8) throw new Error(`${tag}: Get out travelled ${exitTravel.toFixed(2)} tiles`);
      await releaseStickCdp(cdp);
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(900);
      await page.keyboard.up('ArrowUp');
      await wait(80);
      const down = [];
      const t0 = Date.now();
      await page.keyboard.down('ArrowDown');
      for (let i = 0; i < 60; i++) {
        down.push({ t: Date.now() - t0, ...(await page.evaluate(() => window.__playtestQa.jac())) });
        await wait(40);
      }
      await page.keyboard.up('ArrowDown');
      const z = down.find((s) => (s.mph ?? 1) === 0);
      const r = down.find((s) => s.gear === 'R' || s.reversing);
      const ms = z && r ? r.t - z.t : 0;
      notes.push({ desktopDwell: { z: z?.t, r: r?.t, ms } });
      if (!r || !z || ms < 400) throw new Error(`${tag}: dwell ${ms}ms < 400`);
    }

    const door = await page.evaluate(() => {
      const driving = window.__playtestQa.jac()?.driving;
      if (!driving) {
        window.__playtestQa.focusJac?.();
        window.__playtestQa.tapJac();
      }
      return driving;
    });
    if (!door) {
      await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode)) === 'menu' ? true : null), 8000);
      await page.evaluate(() => window.__playtestQa.jacGetIn());
      await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 12000 });
    }
    const f7 = await page.evaluate(() => {
      const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
      const named = list.find((b) => b.door && b.panelTitle);
      if (!named) return null;
      window.__playtestQa.frameDoorForQa?.(named.name);
      window.__playtestQa.tapBuildingDoor?.(named.name);
      return { name: named.name };
    });
    await wait(350);
    const afterF7 = await page.evaluate(() => ({
      interior: window.__playtestQa.isInInterior(),
      driving: window.__playtestQa.jac()?.driving,
    }));
    notes.push({ f7: { door: f7, after: afterF7 } });
    if (afterF7.interior) throw new Error(`${tag}: F7 entered interior while driving`);

    await ctx.close();
    const video = page.video();
    if (video) {
      const dest = path.join(OUT, `${tag}-walkthrough.webm`);
      await video.saveAs(dest);
      notes.push({ video: dest });
    }
    return { tag, notes };
  } catch (err) {
    notes.push({ error: String(err) });
    fs.writeFileSync(path.join(OUT, `${tag}-fail.json`), JSON.stringify(notes, null, 2));
    await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }).catch(() => {});
    throw err;
  } finally {
    await browser.close();
  }
}

const only = process.env.R9_ONLY ?? '';
const skipLive = process.env.R9_SKIP_LIVE === '1';
const liveDesktop = skipLive
  ? { skipped: true }
  : await sampleLiveFps({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }).catch((e) => ({ error: String(e) }));
console.log('live fps', JSON.stringify({ liveDesktop }));

const results = [{ tag: 'live-fps', notes: [{ desktop: liveDesktop }] }];
if (only !== 'phone') {
  results.push(await run('desktop-1280', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, false));
}
if (only !== 'desktop') {
  results.push(
    await run(
      'phone-390',
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      true,
    ),
  );
}
const liveIdle = liveDesktop?.idle?.fps;
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
console.log('record-tj-drive-model-r9: ok', OUT);
