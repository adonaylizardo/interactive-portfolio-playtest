#!/usr/bin/env node
/** Record Tom John drive-model evidence at 390×844 touch and 1280 desktop. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4191/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

function vanPixels(pngPath) {
  if (!fs.existsSync(pngPath)) return 0;
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  let n = 0;
  const x0 = Math.floor(img.width * 0.12);
  const x1 = Math.floor(img.width * 0.88);
  const y0 = Math.floor(img.height * 0.16);
  const y1 = Math.floor(img.height * 0.72);
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

async function holdStick(page, ox, oy) {
  const box = await page.locator('.joystick__idle').boundingBox();
  if (!box) return null;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.evaluate(
    ({ x0, y0, ox, oy }) => {
      const el = document.querySelector('.joystick__idle');
      if (!el) return;
      el.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerId: 7,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x0,
          clientY: y0,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 7,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x0 + ox,
          clientY: y0 + oy,
        }),
      );
    },
    { x0, y0, ox, oy },
  );
  return box;
}

async function releaseStick(page) {
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 7,
        pointerType: 'touch',
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

async function run(tag, options, phone) {
  const notes = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    ...options,
    recordVideo: { dir: path.join(OUT, `${tag}-clips`), size: options.viewport },
  });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const bundle = await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    );
    notes.push({ bundle });
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('map');
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
    });
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-01-walk-start.png`) });

    const t0 = await page.evaluate(() => window.__playtestQa.getCharacterTile());
    await page.evaluate((t) => window.__playtestQa.tapMapTile(t.x + 2, t.y), t0);
    await wait(900);
    await page.screenshot({ path: path.join(OUT, `${tag}-02-tap-walk.png`) });
    const joyWalk = await page.evaluate(() => window.__playtestQa.joystick());
    notes.push({ tapWalk: { from: t0, to: await page.evaluate(() => window.__playtestQa.getCharacterTile()), joy: joyWalk } });

    await page.evaluate(() => {
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.tapJac();
      window.__playtestQa.jacInfo();
    });
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-03-info.png`) });
    await page.evaluate(() => window.__playtestQa.jacGetIn());
    await page.waitForFunction(() => window.__playtestQa.jac?.()?.driving, null, { timeout: 12000 });
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-04-get-in.png`) });

    const followSamples = [];
    if (phone) {
      await holdStick(page, 18, -40);
      for (let i = 0; i < 20; i++) {
        await wait(500);
        followSamples.push(
          await page.evaluate(() => ({
            t: performance.now(),
            follow: document.getElementById('game-canvas')?.dataset.follow,
            entities: window.__playtestQa.jacEntities?.(),
            jac: { cx: window.__playtestQa.jac()?.cx, cy: window.__playtestQa.jac()?.cy, gear: window.__playtestQa.jac()?.gear, mph: window.__playtestQa.jac()?.mph },
            joy: window.__playtestQa.joystick(),
          })),
        );
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-05-drive-forward.png`) });
      await releaseStick(page);
      await wait(200);
      await holdStick(page, 28, -28);
      await wait(2500);
      await page.screenshot({ path: path.join(OUT, `${tag}-06-drive-turn.png`) });
      await releaseStick(page);
      await wait(200);
      await holdStick(page, 0, 40);
      await wait(1500);
      const rear = await page.evaluate(() => {
        const el = document.querySelector('.jac-rear');
        const r = el?.getBoundingClientRect();
        return { hidden: el?.hidden ?? true, w: r?.width ?? 0, h: r?.height ?? 0, rearCam: window.__playtestQa.jac()?.rearCam };
      });
      notes.push({ rear });
      await page.screenshot({ path: path.join(OUT, `${tag}-07-reverse-pip.png`) });
      await releaseStick(page);
    } else {
      await page.keyboard.down('ArrowUp');
      for (let i = 0; i < 20; i++) {
        await wait(500);
        followSamples.push(
          await page.evaluate(() => ({
            follow: document.getElementById('game-canvas')?.dataset.follow,
            entities: window.__playtestQa.jacEntities?.(),
            jac: { cx: window.__playtestQa.jac()?.cx, cy: window.__playtestQa.jac()?.cy, gear: window.__playtestQa.jac()?.gear },
          })),
        );
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-05-drive-forward.png`) });
      await page.keyboard.up('ArrowUp');
      await page.keyboard.down('KeyD');
      await page.keyboard.down('ArrowUp');
      await wait(2500);
      await page.screenshot({ path: path.join(OUT, `${tag}-06-drive-turn.png`) });
      await page.keyboard.up('KeyD');
      await page.keyboard.up('ArrowUp');
      await page.keyboard.down('ArrowDown');
      await wait(1500);
      const rear = await page.evaluate(() => ({
        hidden: document.querySelector('.jac-rear')?.hidden ?? true,
        rearCam: window.__playtestQa.jac()?.rearCam,
      }));
      notes.push({ rear });
      await page.screenshot({ path: path.join(OUT, `${tag}-07-reverse-pip.png`) });
      await page.keyboard.up('ArrowDown');
    }
    notes.push({ followSamples });
    const off = followSamples.filter(
      (s) => (s.entities?.onScreen ?? 0) !== 1 || s.follow === 'suspended' || s.entities?.frameOk === false,
    );
    if (off.length) notes.push({ followMisses: off.length, first: off[0] });

    const start = await page.evaluate(() => window.__playtestQa.jac());
    const goal = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      const walk = window.__playtestQa.fill().walk;
      const clear = (x, y) => {
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = -1; dx <= 2; dx++) {
            const ch = walk[y + dy]?.[x + dx];
            if (!ch || ch === '#' || ch === 'x') return false;
          }
        }
        return true;
      };
      for (let y = Math.round(j.cy); y < Math.round(j.cy) + 8; y++) {
        for (let x = Math.round(j.cx) + 2; x < Math.round(j.cx) + 12; x++) {
          if (clear(x, y)) return { x, y };
        }
      }
      return null;
    });
    const ok = goal ? await page.evaluate((g) => window.__playtestQa.jacDriveTo(g.x, g.y), goal) : false;
    await wait(1800);
    await page.screenshot({ path: path.join(OUT, `${tag}-08-tap-drive.png`) });
    const afterDrive = await page.evaluate(() => ({
      jac: window.__playtestQa.jac(),
      entities: window.__playtestQa.jacEntities?.(),
    }));
    notes.push({ tapDrive: { start: { cx: start?.cx, cy: start?.cy }, goal, ok, after: afterDrive } });

    await page.evaluate(() => window.__playtestQa.jacGetOut());
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-09-get-out.png`) });

    await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities?.();
      if (e) window.__playtestQa.frameWorld(e.worldX, e.worldY, 0.62);
    });
    await wait(300);
    const zoom = await page.evaluate(() => window.__playtestQa.jacEntities?.());
    notes.push({ zoomOut: zoom });
    await page.screenshot({ path: path.join(OUT, `${tag}-10-zoom-one-van.png`) });
    for (const id of ['04-get-in', '05-drive-forward', '06-drive-turn', '08-tap-drive', '09-get-out', '10-zoom-one-van']) {
      const p = path.join(OUT, `${tag}-${id}.png`);
      const n = vanPixels(p);
      notes.push({ shot: id, vanPixels: n });
      if (n < 800) throw new Error(`${tag} ${id} has no van (${n} gray px)`);
    }
    if (off.length) throw new Error(`${tag}: camera lost the van (${off.length} samples)`);
    if ((zoom?.count ?? 0) !== 1 || (zoom?.onScreen ?? 0) !== 1) {
      throw new Error(`${tag}: zoom-out van count ${JSON.stringify(zoom)}`);
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
    { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    true,
  ),
);
results.push(await run('desktop-1280', { viewport: { width: 1280, height: 800 } }, false));
fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('record-tj-drive-model: ok', OUT);
