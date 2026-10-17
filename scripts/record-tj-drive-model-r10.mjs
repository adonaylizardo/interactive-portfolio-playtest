#!/usr/bin/env node
/** CDP proof r10: one bump per wall, no camera offset, Get-out pill brakes,
 *  400ms PiP fade, R-tap keeps R, van sorts behind the catedral wing. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r10');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4200/interactive-portfolio-playtest/';
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

function pipContent(pngPath) {
  if (!fs.existsSync(pngPath)) return { empty: true, n: 0, tot: 0, ratio: 1 };
  const img = PNG.sync.read(fs.readFileSync(pngPath));
  let empty = 0;
  let tot = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      tot++;
      const i = (y * img.width + x) * 4;
      const lum = img.data[i] + img.data[i + 1] + img.data[i + 2];
      if (img.data[i + 3] < 12 || lum < 40) empty++;
    }
  }
  return { empty: tot > 0 && empty / tot > 0.72, n: empty, tot, ratio: tot ? empty / tot : 1 };
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

async function ensureDriving(page, tag) {
  if (await page.evaluate(() => window.__playtestQa.jac()?.driving)) return;
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
  });
  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.mode)) === 'menu' ? true : null), 8000);
  await page.evaluate(() => window.__playtestQa.jacGetIn());
  const boarded = await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null), 16000);
  if (!boarded) throw new Error(`${tag}: never boarded`);
}

async function placeNear(page, cx, cy, dir) {
  await page.evaluate(({ cx, cy, dir }) => {
    window.__playtestQa.jacSet?.({ cx, cy, dir, mode: 'drive' });
    window.__playtestQa.focusJac?.();
  }, { cx, cy, dir });
  await wait(200);
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
    await ensureDriving(page, tag);

    // MED: one bump per wall contact, van stays on screen, PiP has content.
    await placeNear(page, 22, 18, 'se');
    await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
    await wait(120);
    const bumpHits = [];
    let lastBump = 0;
    let edges = 0;
    if (phone) {
      const held = await holdStickCdp(page, cdp, 4, 52, 2200);
      if (!held) throw new Error(`${tag}: stick missing`);
      const t0 = Date.now();
      while (Date.now() - t0 < 2000) {
        const s = await page.evaluate(() => {
          const j = window.__playtestQa.jac();
          const e = window.__playtestQa.jacEntities();
          const c = document.getElementById('game-canvas')?.getBoundingClientRect();
          return {
            bump: j?.bump ?? 0,
            cx: j?.cx,
            cy: j?.cy,
            sx: e?.sx,
            sy: e?.sy,
            cw: c?.width,
            ch: c?.height,
          };
        });
        bumpHits.push(s);
        if (s.bump > 0.08 && lastBump <= 0.08) edges += 1;
        lastBump = s.bump;
        await wait(50);
      }
      await releaseStickCdp(cdp);
    } else {
      await page.keyboard.down('ArrowDown');
      const t0 = Date.now();
      while (Date.now() - t0 < 2000) {
        const s = await page.evaluate(() => window.__playtestQa.jac());
        bumpHits.push(s);
        if ((s?.bump ?? 0) > 0.08 && lastBump <= 0.08) edges += 1;
        lastBump = s?.bump ?? 0;
        await wait(50);
      }
      await page.keyboard.up('ArrowDown');
    }
    const last = bumpHits[bumpHits.length - 1];
    const onScreen = last && last.sx > 24 && last.sy > 24 && last.sx < (last.cw ?? 800) - 24 && last.sy < (last.ch ?? 600) - 24;
    notes.push({ bump: { edges, samples: bumpHits.length, last: { bump: last?.bump, cx: last?.cx, cy: last?.cy, sx: last?.sx, sy: last?.sy }, onScreen } });
    if (edges > 2) throw new Error(`${tag}: bump retriggered ${edges} times`);
    if (phone && last && !onScreen) throw new Error(`${tag}: van left the screen during bump ${JSON.stringify(last)}`);

    if (phone) {
      await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
      const held = await holdStickCdp(page, cdp, 2, 48, 800);
      if (!held) throw new Error(`${tag}: stick missing for PiP`);
      let content = 0;
      for (let i = 0; i < 24; i++) {
        const p = path.join(OUT, `${tag}-pip-${String(i).padStart(2, '0')}.png`);
        const rear = await page.locator('.jac-rear').boundingBox();
        if (rear) await page.screenshot({ path: p, clip: { x: rear.x, y: rear.y, width: rear.width, height: Math.min(rear.height, 160) } });
        else await page.screenshot({ path: p, clip: { x: 20, y: 70, width: 350, height: 140 } });
        const pip = pipContent(p);
        if (!pip.empty) content += 1;
        await wait(40);
      }
      notes.push({ pipContent: { content, of: 24 } });
      if (content < 10) throw new Error(`${tag}: PiP content frames ${content}/24`);
      await releaseStickCdp(cdp);
      await page.evaluate(() => window.__playtestQa.jacSetGear?.('D'));
      const fade = [];
      const tFade = Date.now();
      while (Date.now() - tFade < 1400) {
        fade.push(
          await page.evaluate(() => {
            const el = document.querySelector('.jac-rear');
            return { t: performance.now(), opacity: el ? Number(getComputedStyle(el).opacity) : 0, on: el?.classList.contains('is-on') };
          }),
        );
        await wait(20);
      }
      const hi = fade.find((f) => f.opacity > 0.85);
      const lo = fade.find((f) => hi && f.t > hi.t && f.opacity < 0.15);
      const fadeMs = hi && lo ? Math.round(lo.t - hi.t) : 0;
      notes.push({ fadeMs, fadeHead: fade.slice(0, 3), fadeTail: fade.slice(-3) });
      if (fadeMs < 320 || fadeMs > 700) throw new Error(`${tag}: PiP fade ${fadeMs}ms not ~400`);
    }

    // LOW: Get out via the real pill.
    await placeNear(page, 26, 16, 'se');
    await page.evaluate(() => window.__playtestQa.jacSetGear?.('D'));
    if (phone) {
      const held = await holdStickCdp(page, cdp, 4, -48, 1600);
      if (!held) throw new Error(`${tag}: stick missing for Get out`);
    } else {
      await page.keyboard.down('ArrowUp');
      await wait(1400);
    }
    const moving = await waitUntil(page, async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return (j?.mph ?? 0) >= 6 ? j : null;
    }, 4000);
    if (!moving) throw new Error(`${tag}: not moving before Get out`);
    const exitFrom = { cx: moving.cx, cy: moving.cy, mph: moving.mph };
    const pill = page.locator('.jac-bar [data-jac="out"], .jac-dock [data-jac="out"]');
    await pill.waitFor({ state: 'visible', timeout: 4000 });
    const box = await pill.boundingBox();
    if (!box) throw new Error(`${tag}: Get out pill missing`);
    if (phone) await tapClientCdp(cdp, box.x + box.width / 2, box.y + box.height / 2);
    else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const parked = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return j && !j.driving ? j : null;
      },
      7000,
    );
    const travel = Math.hypot((parked?.cx ?? exitFrom.cx) - exitFrom.cx, (parked?.cy ?? exitFrom.cy) - exitFrom.cy);
    notes.push({ getOutPill: { from: exitFrom, travel, parked: !!parked } });
    if (!parked) throw new Error(`${tag}: Get out pill did not park`);
    if (travel > 0.8) throw new Error(`${tag}: Get out pill travelled ${travel.toFixed(2)} tiles`);
    if (phone) await releaseStickCdp(cdp);
    else await page.keyboard.up('ArrowUp');

    // LOW: roof tap in R keeps R.
    await ensureDriving(page, tag);
    await page.evaluate(() => {
      window.__playtestQa.jacSetGear?.('R');
      const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
      const named = list.find((b) => b.door && b.panelTitle) ?? list[0];
      if (named) window.__playtestQa.frameWorld?.((named.x - named.y) * 64, (named.x + named.y) * 32, 0.72);
    });
    await wait(200);
    const roof = await page.evaluate(() => {
      const list = window.__playtestQa.getEnterableBuildings?.() ?? [];
      for (const b of list) {
        for (let dy = 0; dy <= 4; dy++) {
          for (let dx = 0; dx <= 6; dx++) {
            const tx = b.x + dx;
            const ty = b.y + dy;
            const w = window.__playtestQa.worldToClient?.((tx - ty) * 64, (tx + ty) * 32);
            if (!w || w.x < 40 || w.y < 80 || w.x > window.innerWidth - 40 || w.y > 500) continue;
            const el = document.elementFromPoint(w.x, w.y);
            if (el && el.id !== 'game-canvas' && !el.closest('#game-canvas')) continue;
            const pick = window.__playtestQa.pickAt?.(w.x, w.y);
            if (pick?.building) return { name: b.name, client: w, pick };
          }
        }
      }
      return null;
    });
    if (!roof) throw new Error(`${tag}: no roof for R-tap`);
    if (phone) await tapClientCdp(cdp, roof.client.x, roof.client.y);
    else await page.mouse.click(roof.client.x, roof.client.y);
    await wait(350);
    const afterR = await page.evaluate(() => ({
      gear: window.__playtestQa.jac()?.gear,
      toast: document.getElementById('playtest-toast')?.classList.contains('playtest-toast--visible')
        ? document.getElementById('playtest-toast')?.textContent
        : '',
    }));
    notes.push({ rTap: { roof, afterR } });
    if (afterR.gear !== 'R') throw new Error(`${tag}: R-tap changed gear to ${afterR.gear}`);
    if (!afterR.toast) throw new Error(`${tag}: R-tap produced no toast`);

    // LOW: van depth vs catedral.
    await page.evaluate(() => {
      window.__playtestQa.jacSet?.({ cx: 17.2, cy: 16.2, dir: 'se', mode: 'drive' });
    });
    await wait(120);
    const z = await page.evaluate(() => {
      const list = window.__playtestQa.spriteInstances?.() ?? [];
      const jac = list.find((o) => String(o.id).includes('jac'));
      const cat = list.find((o) => o.kind === 'catedral' || String(o.id).includes('catedral'));
      return { jacZ: jac?.zIndex, catZ: cat?.zIndex, jacId: jac?.id, catId: cat?.id };
    });
    notes.push({ depth: z });
    if (typeof z.jacZ === 'number' && typeof z.catZ === 'number' && z.jacZ >= z.catZ) {
      throw new Error(`${tag}: van z ${z.jacZ} >= catedral ${z.catZ}`);
    }

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

const only = process.env.R10_ONLY ?? '';
const results = [];
if (only !== 'desktop') {
  results.push(
    await run(
      'phone-390',
      { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
      true,
    ),
  );
}
if (only !== 'phone') {
  results.push(await run('desktop-1280', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, false));
}
fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
console.log('record-tj-drive-model-r10: ok', OUT);
