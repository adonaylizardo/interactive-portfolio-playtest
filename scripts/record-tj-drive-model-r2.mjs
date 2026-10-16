#!/usr/bin/env node
/** CDP-touch proof for the Tom John drive-model r2 fixes. 390×844 @3 and 1280 @2. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r2');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4191/interactive-portfolio-playtest/';
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
  const y0 = Math.max(8, Math.floor(img.height * 0.04));
  const y1 = Math.floor(img.height * 0.28);
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
  return box;
}

async function releaseStickCdp(cdp) {
  await cdpTouch(cdp, 'touchEnd', []);
}

async function tapClientCdp(cdp, x, y) {
  await cdpTouch(cdp, 'touchStart', [{ x, y }]);
  await wait(40);
  await cdpTouch(cdp, 'touchEnd', []);
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
    for (let y = Math.round(j.cy) - 2; y < Math.round(j.cy) + 12; y++) {
      for (let x = Math.round(j.cx) - 2; x < Math.round(j.cx) + 14; x++) {
        if (Math.hypot(x - j.cx, y - j.cy) < 3) continue;
        if (!clear(x, y)) continue;
        const wx = (x - y) * 64;
        const wy = (x + y) * 32;
        const s = window.__playtestQa.worldToClient(wx, wy);
        if (s.x < 36 || s.y < 72 || s.x > window.innerWidth - 36 || s.y > window.innerHeight - 96) continue;
        if (stick && s.x >= stick.left - 8 && s.x <= stick.right + 8 && s.y >= stick.top - 8 && s.y <= stick.bottom + 8) {
          continue;
        }
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
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.focusJac?.();
    });
    await wait(500);

    await page.screenshot({ path: path.join(OUT, `${tag}-01-before-get-in.png`) });
    const before = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      joy: window.__playtestQa.joystick(),
      locate: [...document.querySelectorAll('[aria-label="Center on Adonay"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, right: window.innerWidth - r.right, visible: r.width > 0 && getComputedStyle(el).visibility !== 'hidden' };
      }),
    }));
    notes.push({ before });
    if ((before.entities?.count ?? 0) !== 1) throw new Error(`${tag}: ${before.entities?.count} vans before Get in`);

    await page.evaluate(() => {
      window.__playtestQa.tapJac();
      window.__playtestQa.jacInfo();
    });
    await wait(300);
    await page.evaluate(() => window.__playtestQa.jacGetIn());
    await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 12000 });
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-02-get-in.png`) });
    const boarded = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      joy: window.__playtestQa.joystick(),
      sticks: document.querySelectorAll('.joystick:not([hidden])').length,
      photo: !!document.querySelector('.joystick__glyph'),
    }));
    notes.push({ boarded });
    if ((boarded.entities?.count ?? 0) !== 1) throw new Error(`${tag}: van cloned on Get in`);
    if (phone && boarded.sticks !== 1) throw new Error(`${tag}: expected one stick, got ${boarded.sticks}`);
    if (phone && boarded.joy?.floating) throw new Error(`${tag}: floating stick on Get in`);

    const start = await page.evaluate(() => window.__playtestQa.jac());
    const goal = await pickDriveGoal(page);
    if (!goal) throw new Error(`${tag}: no drive goal`);
    const client = goal.client ?? (await goalClient(page, goal));
    notes.push({ tapTarget: { goal, client, hit: await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.id, client) } });
    if (phone) {
      await tapClientCdp(cdp, client.x, client.y);
    } else {
      await page.mouse.click(client.x, client.y);
    }
    await wait(2800);
    await page.screenshot({ path: path.join(OUT, `${tag}-05-tap-drive.png`) });
    const afterPath = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      goal: window.__playtestQa.jac()?.driveGoal,
    }));
    notes.push({ tapDrive: { start: { cx: start?.cx, cy: start?.cy }, goal, client, after: afterPath } });
    const moved =
      Math.hypot((afterPath.jac?.cx ?? start.cx) - start.cx, (afterPath.jac?.cy ?? start.cy) - start.cy) > 0.35;
    if (!moved) throw new Error(`${tag}: tap/click path did not move the van ${JSON.stringify({ start, afterPath })}`);
    if ((afterPath.entities?.count ?? 0) !== 1) throw new Error(`${tag}: extra van during path follow`);

    const followSamples = [];
    if (phone) {
      const box = await holdStickCdp(page, cdp, 8, -46, 3200);
      notes.push({ stickBox: box });
      if (!box) throw new Error(`${tag}: fixed stick missing`);
      for (let i = 0; i < 6; i++) {
        followSamples.push(
          await page.evaluate(() => ({
            entities: window.__playtestQa.jacEntities?.(),
            jac: window.__playtestQa.jac(),
            joy: window.__playtestQa.joystick(),
            sticks: document.querySelectorAll('.joystick:not([hidden])').length,
          })),
        );
        await wait(200);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-03-drive-stick.png`) });
      await releaseStickCdp(cdp);
      await wait(250);
    } else {
      await page.keyboard.down('ArrowUp');
      for (let i = 0; i < 8; i++) {
        followSamples.push(
          await page.evaluate(() => ({
            entities: window.__playtestQa.jacEntities?.(),
            jac: window.__playtestQa.jac(),
            joy: window.__playtestQa.joystick(),
          })),
        );
        await wait(280);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-03-drive-stick.png`) });
      await page.keyboard.up('ArrowUp');
      await wait(200);
    }
    const moving = followSamples.find((s) => (s.jac?.mph ?? 0) > 0 && (s.entities?.count ?? 0) === 1);
    notes.push({ followSamples: followSamples.slice(0, 3), moving });
    if (!moving) throw new Error(`${tag}: van did not move / mph stayed 0`);
    if (followSamples.some((s) => (s.entities?.count ?? 1) !== 1)) throw new Error(`${tag}: van count changed while driving`);
    if (phone && followSamples.some((s) => s.joy?.floating || s.sticks !== 1)) {
      throw new Error(`${tag}: floating or extra stick while driving`);
    }

    if (phone) {
      await holdStickCdp(page, cdp, 0, 48, 1800);
    } else {
      await page.keyboard.down('ArrowDown');
      await wait(1800);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-04-reverse-pip.png`) });
    const rear = await page.evaluate(() => {
      const el = document.querySelector('.jac-rear');
      const r = el?.getBoundingClientRect();
      return {
        hidden: el?.hidden ?? true,
        w: r?.width ?? 0,
        h: r?.height ?? 0,
        rearCam: window.__playtestQa.jac()?.rearCam,
        gear: window.__playtestQa.jac()?.gear,
      };
    });
    notes.push({ rear });
    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowDown');
    if (rear.hidden || !rear.rearCam) throw new Error(`${tag}: rear PiP missing`);
    const pip = pipTerrain(path.join(OUT, `${tag}-04-reverse-pip.png`));
    notes.push({ pip });
    if (!pip.pip) throw new Error(`${tag}: rear PiP has no terrain (var=${pip.variance.toFixed(1)})`);

    if (!phone) {
      await page.locator('.jac-dock [data-jac="gear"][data-val="R"]').click();
      await wait(200);
      const gearR = await page.evaluate(() => window.__playtestQa.jac()?.gear);
      notes.push({ gearClick: gearR });
      if (gearR !== 'R') throw new Error(`${tag}: D/R click did not register (gear=${gearR})`);
      await page.locator('.jac-dock [data-jac="gear"][data-val="D"]').click();
    }

    const lastDrive = await page.evaluate(() => window.__playtestQa.jac());
    await page.evaluate(() => window.__playtestQa.jacGetOut());
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-06-get-out.png`) });
    const afterOut = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
      char: window.__playtestQa.getCharacterTile(),
      joy: window.__playtestQa.joystick(),
    }));
    notes.push({ afterOut, lastDrive });
    if (afterOut.jac?.driving) throw new Error(`${tag}: still driving after Get out`);
    if ((afterOut.entities?.count ?? 0) !== 1) throw new Error(`${tag}: van cloned after Get out`);
    const parkedNearDrive = Math.hypot(afterOut.jac.cx - lastDrive.cx, afterOut.jac.cy - lastDrive.cy) < 0.8;
    if (!parkedNearDrive) throw new Error(`${tag}: Get out teleported the van back to spawn`);

    await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities?.();
      if (e) window.__playtestQa.frameWorld(e.worldX, e.worldY, 0.62);
    });
    await wait(300);
    await page.screenshot({ path: path.join(OUT, `${tag}-07-one-van.png`) });
    const zoom = await page.evaluate(() => window.__playtestQa.jacEntities?.());
    notes.push({ zoomOut: zoom });
    if ((zoom?.count ?? 0) !== 1 || (zoom?.onScreen ?? 0) !== 1) {
      throw new Error(`${tag}: zoom-out van count ${JSON.stringify(zoom)}`);
    }

    for (const id of ['01-before-get-in', '02-get-in', '03-drive-stick', '05-tap-drive', '06-get-out', '07-one-van']) {
      const p = path.join(OUT, `${tag}-${id}.png`);
      const n = vanPixels(p);
      notes.push({ shot: id, vanPixels: n });
      if (n < 600) throw new Error(`${tag} ${id} has no van (${n} gray px)`);
    }

    const touchListeners = await page.evaluate(() => {
      const c = document.getElementById('game-canvas');
      return c ? c.getAttribute('data-touch') : null;
    });
    notes.push({ touchListeners });

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
console.log('record-tj-drive-model-r2: ok', OUT);
