#!/usr/bin/env node
/** CDP-touch proof for CAPBy5ow F1–F7. 390×844 @3 and 1280 @2. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r3');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4193/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function vanPixels(pngPath) {
  if (!fs.existsSync(pngPath)) return 0;
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  let n = 0;
  const x0 = Math.floor(img.width * 0.08);
  const x1 = Math.floor(img.width * 0.92);
  const y0 = Math.floor(img.height * 0.12);
  const y1 = Math.floor(img.height * 0.78);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 90 && max < 230 && max - min < 42) n++;
    }
  }
  return n;
}

function pipTerrain(pngPath) {
  if (!fs.existsSync(pngPath)) return { pip: false, variance: 0 };
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  const x0 = Math.floor(img.width * 0.18);
  const x1 = Math.floor(img.width * 0.82);
  const y0 = Math.max(8, Math.floor(img.height * 0.08));
  const y1 = Math.floor(img.height * 0.36);
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * img.width + x) * 4;
      const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      n++;
      sum += lum;
      sum2 += lum * lum;
    }
  }
  const mean = n ? sum / n : 0;
  const variance = n ? sum2 / n - mean * mean : 0;
  return { pip: variance > 80 && mean > 18, variance, mean };
}

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({
      x: p.x,
      y: p.y,
      id: p.id ?? i + 1,
    })),
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
  const steps = Math.max(6, Math.round(ms / 180));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdpTouch(cdp, 'touchMove', [{ x: x0 + ox * t, y: y0 + oy * t }]);
    await wait(ms / steps);
  }
  return { box, x0, y0 };
}

async function moveStickCdp(cdp, x0, y0, ox, oy, ms) {
  const steps = Math.max(6, Math.round(ms / 80));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdpTouch(cdp, 'touchMove', [{ x: x0 + ox * t, y: y0 + oy * t }]);
    await wait(ms / steps);
  }
}

async function releaseStickCdp(cdp) {
  await cdpTouch(cdp, 'touchEnd', []);
}

async function pickDriveGoal(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const stick = document.querySelector('.joystick:not([hidden])')?.getBoundingClientRect();
    const pip = document.querySelector('.jac-rear.is-on')?.getBoundingClientRect();
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
        const wx = (x - y) * 64;
        const wy = (x + y) * 32;
        const s = window.__playtestQa.worldToClient(wx, wy);
        if (s.x < 36 || s.y < 96 || s.x > window.innerWidth - 36 || s.y > window.innerHeight - 110) continue;
        if (stick && s.x >= stick.left - 8 && s.x <= stick.right + 8 && s.y >= stick.top - 8 && s.y <= stick.bottom + 8) {
          continue;
        }
        if (pip && s.x >= pip.left && s.x <= pip.right && s.y >= pip.top && s.y <= pip.bottom) continue;
        const el = document.elementFromPoint(s.x, s.y);
        if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
        hits.push({ x, y, client: s, dist: Math.hypot(x - j.cx, y - j.cy) });
      }
    }
    hits.sort((a, b) => b.dist - a.dist);
    return hits[0] ?? null;
  });
}

async function goalClient(page, goal) {
  return page.evaluate((g) => {
    const wx = (g.x - g.y) * 64;
    const wy = (g.x + g.y) * 32;
    return window.__playtestQa.worldToClient(wx, wy);
  }, goal);
}

async function layoutProbe(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.jac-menu');
    const inBtn = document.querySelector('.jac-menu [data-jac="in"]');
    const check = document.querySelector('.checklist');
    const tools = document.querySelector('.chrome__tools-phone');
    const pip = document.querySelector('.jac-rear');
    const mph = document.querySelector('.jac-bar [data-mph]');
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        right: r.right,
        bottom: r.bottom,
        hidden: el.hidden,
        vis: st.visibility,
        opacity: Number(st.opacity),
        on: el.classList.contains('is-on'),
      };
    };
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      menu: box(menu),
      inBtn: box(inBtn),
      check: box(check),
      tools: box(tools),
      pip: box(pip),
      mphText: mph?.textContent ?? null,
      jac: window.__playtestQa.jac(),
      interior: window.__playtestQa.isInInterior(),
      panel: window.__playtestQa.isBuildingPanelOpen(),
    };
  });
}

async function camSnap(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    return {
      follow: c?.dataset.follow ?? '',
      char: window.__playtestQa.getCharacterTile(),
      jac: window.__playtestQa.jac(),
      mode: window.__playtestQa.jac()?.mode,
    };
  });
}

async function waitUntil(page, fn, timeout = 14000, step = 120) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
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
    });
    await wait(400);

    // F3: character far, camera on van. Tap must walk first; no panel, no camera snap.
    const far = await page.evaluate(() => {
      const walk = window.__playtestQa.fill().walk;
      const spawn = window.__playtestQa.jacSpawn();
      const sx = spawn.center.x;
      const sy = spawn.center.y;
      let best = null;
      for (let y = 0; y < walk.length; y++) {
        for (let x = 0; x < (walk[y]?.length ?? 0); x++) {
          const ch = walk[y][x];
          if (!ch || ch === '#' || ch === 'x') continue;
          const d = Math.hypot(x - sx, y - sy);
          if (d < 10 || d > 18) continue;
          if (!best || d > best.d) best = { x, y, d };
        }
      }
      if (best) window.__playtestQa.setCharacterTile(best.x, best.y);
      window.__playtestQa.focusJac?.();
      return { far: best, char: window.__playtestQa.getCharacterTile(), jac: window.__playtestQa.jac() };
    });
    notes.push({ farSetup: far });
    if (!far.far) throw new Error(`${tag}: no far walkable tile`);
    await wait(350);
    await page.screenshot({ path: path.join(OUT, `${tag}-01-far-before-tap.png`) });
    const beforeTap = await camSnap(page);
    const beforeLayout = await layoutProbe(page);
    notes.push({ beforeTap, beforeLayout });
    if (beforeTap.mode === 'menu') throw new Error(`${tag}: menu already open before tap`);

    await page.evaluate(() => window.__playtestQa.tapJac());
    await wait(180);
    const justAfter = await camSnap(page);
    notes.push({ justAfterTap: justAfter });
    if (justAfter.mode === 'menu' || justAfter.mode === 'info') {
      throw new Error(`${tag}: F3 panel opened on first tap while far (mode=${justAfter.mode})`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-02-walking-to-van.png`) });
    const arrived = await waitUntil(
      page,
      async () => {
        const s = await camSnap(page);
        if (s.mode === 'menu') return s;
        return null;
      },
      16000,
    );
    notes.push({ arrived });
    if (arrived?.mode !== 'menu') throw new Error(`${tag}: F3 panel did not open on arrival`);
    const charNear = Math.hypot((arrived.char?.x ?? 0) - (arrived.jac?.cx ?? 0), (arrived.char?.y ?? 0) - (arrived.jac?.cy ?? 0));
    if (charNear > 3.2) throw new Error(`${tag}: F3 panel opened while still far (${charNear.toFixed(2)})`);
    await page.screenshot({ path: path.join(OUT, `${tag}-03-panel-on-arrival.png`) });
    const pill = await layoutProbe(page);
    notes.push({ pill });
    if (phone) {
      if (!pill.inBtn) throw new Error(`${tag}: Get in pill missing`);
      if (pill.inBtn.right > pill.vw + 1) throw new Error(`${tag}: F5 Get in overflows right (${pill.inBtn.right}>${pill.vw})`);
      if (pill.check && pill.inBtn.right > pill.check.x + 4 && pill.inBtn.y < pill.check.bottom) {
        throw new Error(`${tag}: F5 Get in covers checklist ${JSON.stringify({ inBtn: pill.inBtn, check: pill.check })}`);
      }
    }

    const camBeforeIn = await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities?.();
      return { worldX: e?.worldX, worldY: e?.worldY, follow: document.getElementById('game-canvas')?.dataset.follow };
    });
    await page.evaluate(() => window.__playtestQa.jacGetIn());
    await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 12000 });
    await wait(400);
    const camAfterIn = await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities?.();
      return {
        worldX: e?.worldX,
        worldY: e?.worldY,
        follow: document.getElementById('game-canvas')?.dataset.follow,
        driving: window.__playtestQa.jac()?.driving,
      };
    });
    notes.push({ getIn: { camBeforeIn, camAfterIn } });
    if (camAfterIn.follow === 'idle') {
      /* follow may settle; do not treat as snap */
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-04-get-in.png`) });
    const boarded = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      joy: window.__playtestQa.joystick(),
      sticks: document.querySelectorAll('.joystick:not([hidden])').length,
    }));
    notes.push({ boarded });
    if ((boarded.entities?.count ?? 0) !== 1) throw new Error(`${tag}: van cloned on Get in`);
    if (phone && boarded.sticks !== 1) throw new Error(`${tag}: expected one stick, got ${boarded.sticks}`);

    // F2 + brake: hold forward to ~10 mph, then down through 0 before reverse.
    const start = await page.evaluate(() => window.__playtestQa.jac());
    let brakeSamples = [];
    if (phone) {
      const held = await holdStickCdp(page, cdp, 8, -48, 2600);
      if (!held) throw new Error(`${tag}: fixed stick missing`);
      const atSpeed = await page.evaluate(() => {
        const el = document.querySelector('.jac-bar [data-mph]');
        return { jac: window.__playtestQa.jac(), mphText: el?.textContent ?? null };
      });
      notes.push({ atSpeed });
      if ((atSpeed.jac?.mph ?? 0) < 4) throw new Error(`${tag}: F2 internal mph stayed low ${JSON.stringify(atSpeed)}`);
      if (!atSpeed.mphText || atSpeed.mphText === '0') throw new Error(`${tag}: F2 phone bar has no mph readout`);
      await page.screenshot({ path: path.join(OUT, `${tag}-05-mph-bar.png`) });
      await moveStickCdp(cdp, held.x0, held.y0, 0, 50, 900);
      for (let i = 0; i < 10; i++) {
        brakeSamples.push(await page.evaluate(() => window.__playtestQa.jac()));
        await wait(90);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-06-brake-then-reverse.png`) });
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(2200);
      const atSpeed = await page.evaluate(() => window.__playtestQa.jac());
      notes.push({ atSpeed });
      if ((atSpeed.mph ?? 0) < 4) throw new Error(`${tag}: desktop mph stayed low`);
      await page.screenshot({ path: path.join(OUT, `${tag}-05-mph-bar.png`) });
      await page.keyboard.up('ArrowUp');
      await page.keyboard.down('ArrowDown');
      for (let i = 0; i < 10; i++) {
        brakeSamples.push(await page.evaluate(() => window.__playtestQa.jac()));
        await wait(90);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-06-brake-then-reverse.png`) });
    }
    notes.push({ brakeSamples: brakeSamples.map((s) => ({ mph: s.mph, gear: s.gear, reversing: s.reversing })) });
    const hitZero = brakeSamples.some((s) => (s.mph ?? 1) === 0);
    const thenRev = brakeSamples.some((s, i) => {
      const priorZero = brakeSamples.slice(0, i + 1).some((p) => (p.mph ?? 1) === 0);
      return priorZero && (s.reversing || s.gear === 'R');
    });
    if (!hitZero) throw new Error(`${tag}: brake did not reach 0 mph before reverse`);
    if (!thenRev) throw new Error(`${tag}: did not reverse after braking to 0`);

    // F4: PiP only while actually reversing.
    await wait(200);
    const reversing = await page.evaluate(() => {
      const el = document.querySelector('.jac-rear');
      const r = el?.getBoundingClientRect();
      const tools = document.querySelector('.chrome__tools-phone')?.getBoundingClientRect();
      return {
        hidden: el?.hidden ?? true,
        on: el?.classList.contains('is-on') ?? false,
        opacity: el ? Number(getComputedStyle(el).opacity) : 0,
        top: r?.top ?? 0,
        bottom: r?.bottom ?? 0,
        toolsBottom: tools?.bottom ?? 0,
        toolsVis: tools ? getComputedStyle(tools).visibility : 'missing',
        rearCam: window.__playtestQa.jac()?.rearCam,
        reversing: window.__playtestQa.jac()?.reversing,
        mph: window.__playtestQa.jac()?.mph,
      };
    });
    notes.push({ reversingPip: reversing });
    if (!reversing.rearCam || !reversing.on) throw new Error(`${tag}: F4 PiP missing while reversing`);
    await page.screenshot({ path: path.join(OUT, `${tag}-07-reverse-pip.png`) });
    const pip = pipTerrain(path.join(OUT, `${tag}-07-reverse-pip.png`));
    notes.push({ pip });
    if (!pip.pip) throw new Error(`${tag}: rear PiP has no terrain (var=${pip.variance.toFixed(1)})`);
    if (phone) {
      if (reversing.toolsVis === 'hidden') throw new Error(`${tag}: F5 PiP hid search/sound`);
      if (reversing.top + 2 < reversing.toolsBottom) {
        throw new Error(`${tag}: F5 PiP covers tools (pip.top=${reversing.top} tools.bottom=${reversing.toolsBottom})`);
      }
    }

    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowDown');
    await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return (j?.mph ?? 1) === 0 && !j?.reversing ? j : null;
      },
      4000,
    );
    await wait(700);
    const afterStop = await page.evaluate(() => {
      const el = document.querySelector('.jac-rear');
      return {
        on: el?.classList.contains('is-on') ?? false,
        opacity: el ? Number(getComputedStyle(el).opacity) : 0,
        rearCam: window.__playtestQa.jac()?.rearCam,
        reversing: window.__playtestQa.jac()?.reversing,
        gear: window.__playtestQa.jac()?.gear,
        mph: window.__playtestQa.jac()?.mph,
      };
    });
    notes.push({ afterStop });
    if (afterStop.rearCam || afterStop.on) {
      throw new Error(`${tag}: F4 PiP stayed up after reverse stopped (${JSON.stringify(afterStop)})`);
    }

    // F1: still in R (or click R), tap map must drive.
    if (phone) {
      const rBtn = page.locator('.jac-bar [data-jac="gear"][data-val="R"]');
      if (await rBtn.count()) await rBtn.click();
    } else {
      await page.locator('.jac-dock [data-jac="gear"][data-val="R"]').click();
    }
    await wait(200);
    const inR = await page.evaluate(() => window.__playtestQa.jac());
    notes.push({ inR: { gear: inR?.gear, mph: inR?.mph, rearCam: inR?.rearCam } });
    if (inR?.gear !== 'R') throw new Error(`${tag}: could not hold gear R`);
    const goal = await pickDriveGoal(page);
    if (!goal) throw new Error(`${tag}: no drive goal`);
    const client = goal.client ?? (await goalClient(page, goal));
    notes.push({ tapFromR: { goal, client } });
    if (phone) await tapClientCdp(cdp, client.x, client.y);
    else await page.mouse.click(client.x, client.y);
    const pathOn = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        if (j?.driveGoal || (j?.mph ?? 0) > 0) return j;
        return null;
      },
      4000,
    );
    notes.push({ tapFromRAfter: pathOn });
    if (!pathOn?.driveGoal && (pathOn?.mph ?? 0) < 1) {
      throw new Error(`${tag}: F1 tap from R did nothing`);
    }
    await wait(2400);
    await page.screenshot({ path: path.join(OUT, `${tag}-08-tap-from-r.png`) });
    const afterPath = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
    }));
    notes.push({ tapDrive: { start: { cx: start.cx, cy: start.cy }, goal, after: afterPath } });
    const moved = Math.hypot((afterPath.jac?.cx ?? start.cx) - start.cx, (afterPath.jac?.cy ?? start.cy) - start.cy) > 0.35;
    if (!moved) throw new Error(`${tag}: F1 tap/click from R did not move the van`);
    if ((afterPath.entities?.count ?? 0) !== 1) throw new Error(`${tag}: extra van during path follow`);

    // F6: stop on the target (desktop especially).
    const stopGoal = await pickDriveGoal(page);
    if (stopGoal) {
      if (phone) {
        const c = stopGoal.client ?? (await goalClient(page, stopGoal));
        await tapClientCdp(cdp, c.x, c.y);
      } else {
        const c = stopGoal.client ?? (await goalClient(page, stopGoal));
        await page.mouse.click(c.x, c.y);
      }
      const arrivedGoal = await waitUntil(
        page,
        async () => {
          const j = await page.evaluate(() => window.__playtestQa.jac());
          if (!j?.driveGoal && (j?.mph ?? 1) === 0) return j;
          return null;
        },
        16000,
      );
      const miss = arrivedGoal
        ? Math.hypot((arrivedGoal.cx ?? 0) - stopGoal.x, (arrivedGoal.cy ?? 0) - stopGoal.y)
        : 99;
      notes.push({ stopOnTarget: { stopGoal, miss, arrived: arrivedGoal } });
      if (miss > 0.85) throw new Error(`${tag}: F6 stopped ${miss.toFixed(2)} tiles short of target`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-09-stop-on-target.png`) });

    // F7: building click while driving must not enter.
    const building = await page.evaluate(() => {
      const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
      const j = window.__playtestQa.jac();
      const named = list.find((b) => b.door && b.panelTitle);
      if (!named) return null;
      const door = named.door;
      const s = window.__playtestQa.doorScreenPoint?.(named.name);
      return { name: named.name, door, client: s, dist: Math.hypot((door?.x ?? 0) - j.cx, (door?.y ?? 0) - j.cy) };
    });
    notes.push({ building });
    if (building?.name) {
      await page.evaluate((name) => window.__playtestQa.tapBuildingDoor?.(name), building.name);
      await wait(400);
      const afterB = await page.evaluate(() => ({
        interior: window.__playtestQa.isInInterior(),
        panel: window.__playtestQa.isBuildingPanelOpen(),
        driving: window.__playtestQa.jac()?.driving,
      }));
      notes.push({ afterBuildingTap: afterB });
      if (afterB.interior) throw new Error(`${tag}: F7 entered interior while driving`);
      if (!afterB.driving) throw new Error(`${tag}: F7 left the van after a building tap`);
    }
    if (!phone && building?.client) {
      await page.mouse.click(building.client.x, building.client.y);
      await wait(400);
      const afterClick = await page.evaluate(() => ({
        interior: window.__playtestQa.isInInterior(),
        driving: window.__playtestQa.jac()?.driving,
      }));
      notes.push({ afterBuildingClick: afterClick });
      if (afterClick.interior) throw new Error(`${tag}: F7 desktop building click entered interior`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-10-no-building.png`) });

    const lastDrive = await page.evaluate(() => window.__playtestQa.jac());
    await page.evaluate(() => window.__playtestQa.jacGetOut());
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-11-get-out.png`) });
    const afterOut = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      interior: window.__playtestQa.isInInterior(),
    }));
    notes.push({ afterOut, lastDrive });
    if (afterOut.jac?.driving) throw new Error(`${tag}: still driving after Get out`);
    if ((afterOut.entities?.count ?? 0) !== 1) throw new Error(`${tag}: van cloned after Get out`);

    for (const id of [
      '01-far-before-tap',
      '03-panel-on-arrival',
      '04-get-in',
      '08-tap-from-r',
      '11-get-out',
    ]) {
      const p = path.join(OUT, `${tag}-${id}.png`);
      const n = vanPixels(p);
      notes.push({ shot: id, vanPixels: n });
      if (n < 400) throw new Error(`${tag} ${id} has no van (${n} gray px)`);
    }

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
console.log('record-tj-drive-model-r3: ok', OUT);
