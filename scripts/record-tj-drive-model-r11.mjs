#!/usr/bin/env node
/** CDP proof r11: van cannot overlap trees/props; tap-the-van always BFS to a
 *  reachable edge (5/5 at a tree, a wall and a building corner, phone + desktop);
 *  parked JAC T9 label re-anchors on the body. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r11');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const SITES = [
  { id: 'tree', cx: 37, cy: 17, dir: 'se', prop: { x: 40, y: 18 } },
  { id: 'wall', cx: 34, cy: 35, dir: 'se', prop: { x: 35, y: 37 } },
  { id: 'corner', cx: 19, cy: 17, dir: 'se', prop: { x: 16, y: 16 } },
];

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })),
  });
}

async function tapClientCdp(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdpTouch(cdp, 'touchStart', [{ x, y, id: 3 }]);
  await wait(50);
  await cdpTouch(cdp, 'touchEnd', []);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
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

async function toastText(page) {
  return page.evaluate(() => {
    const el = document.getElementById('playtest-toast');
    if (!el || !el.classList.contains('playtest-toast--visible')) return '';
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
    const door = window.__playtestQa.jacDoor?.();
    const hits = [];
    for (let y = 0; y < walk.length; y++) {
      for (let x = 0; x < (walk[y]?.length ?? 0); x++) {
        const ch = walk[y][x];
        if (!ch || ch === '#' || ch === 'x') continue;
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 6 || dist > 10) continue;
        if (door && x === door.x && y === door.y) continue;
        hits.push({ x, y, dist });
      }
    }
    hits.sort((a, b) => a.dist - b.dist);
    return hits[Math.min(2, hits.length - 1)] ?? hits[0] ?? null;
  });
}

async function clickVan(page, cdp, phone, van) {
  if (phone) await tapClientCdp(cdp, van.x, van.y);
  else await page.mouse.click(van.x, van.y);
}

async function clickGetIn(page, cdp, phone, tag, i) {
  const btn = page.locator('.jac-menu [data-jac="in"]');
  await btn.waitFor({ state: 'visible', timeout: 4000 });
  const box = await btn.boundingBox();
  if (!box) throw new Error(`${tag}: Get in box missing ${i}`);
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
    for (let d = 1; d <= 6; d++) {
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

async function parkAt(page, site) {
  await page.evaluate((s) => {
    window.__playtestQa.jacSet?.({ cx: s.cx, cy: s.cy, dir: s.dir, mode: 'drive' });
  }, site);
  await wait(120);
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  const parked = await waitUntil(page, async () => {
    const j = await page.evaluate(() => window.__playtestQa.jac());
    return j && !j.driving ? j : null;
  }, 8000);
  if (!parked) throw new Error(`parkAt ${site.id} never parked`);
  return parked;
}

async function labelGap(page) {
  return page.evaluate(() => {
    const heads = window.__playtestQa.namePillHeads?.() ?? [];
    const jac = heads.find((h) => h.id === 'jac');
    const pills = window.__playtestQa.nameLabels?.() ?? [];
    const pill = pills.find((p) => p.id === 'jac');
    return { jac, pill, gap: jac?.gap ?? NaN };
  });
}

async function tapVanReentry(page, cdp, tag, phone, site, n = 5) {
  const trials = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('map');
      window.__playtestQa.setNpcs?.(false);
    });
    const parked = await parkAt(page, site);
    const overlap = await page.evaluate(() => window.__playtestQa.jacOverlapsProp?.());
    if (overlap) throw new Error(`${tag} ${site.id} #${i}: parked overlapping a prop at ${parked.cx},${parked.cy}`);
    const door = await page.evaluate(() => window.__playtestQa.jacDoor?.());
    if (!door) throw new Error(`${tag} ${site.id} #${i}: no reachable door`);
    const walkable = await page.evaluate((d) => {
      const ch = window.__playtestQa.fill().walk[d.y]?.[d.x];
      return { ch, blocked: !ch || ch === '#' || ch === 'x' };
    }, door);
    if (walkable.blocked) throw new Error(`${tag} ${site.id} #${i}: door ${JSON.stringify(door)} is blocked`);
    const away = await pickAwayTile(page);
    if (!away) throw new Error(`${tag} ${site.id} #${i}: no away tile`);
    await page.evaluate((p) => {
      window.__playtestQa.setCharacterTile(p.x, p.y);
      window.__playtestQa.focusJac?.();
    }, away);
    await wait(240);
    await clearToast(page);
    const van = await vanClient(page);
    if (!van) throw new Error(`${tag} ${site.id} #${i}: van client missing`);
    const pick = await page.evaluate((v) => window.__playtestQa.pickAt?.(v.x, v.y), van);
    const before = await page.evaluate(() => ({
      mode: window.__playtestQa.jac()?.mode,
      tile: window.__playtestQa.getCharacterTile(),
      goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
    }));
    await clickVan(page, cdp, phone, van);
    const reacted = await waitUntil(
      page,
      async () => {
        const s = await page.evaluate(() => ({
          mode: window.__playtestQa.jac()?.mode,
          tile: window.__playtestQa.getCharacterTile(),
          goal: document.getElementById('game-canvas')?.dataset.walkGoal ?? '',
          toast: document.getElementById('playtest-toast')?.classList.contains('playtest-toast--visible')
            ? document.getElementById('playtest-toast')?.textContent
            : '',
        }));
        if (s.toast) return s;
        const walked = s.goal || (s.tile && (s.tile.x !== before.tile.x || s.tile.y !== before.tile.y));
        if (s.mode === 'menu' || walked) return s;
        return null;
      },
      1400,
      50,
    );
    if (reacted?.toast) {
      await page.screenshot({ path: path.join(OUT, `${tag}-${site.id}-toast-${i}.png`) });
      throw new Error(`${tag} ${site.id} #${i}: van tap toasted "${reacted.toast}"`);
    }
    if (!reacted) {
      await page.screenshot({ path: path.join(OUT, `${tag}-${site.id}-miss-${i}.png`) });
      throw new Error(`${tag} ${site.id} #${i}: van tap ignored pick=${JSON.stringify(pick)} van=${JSON.stringify(van)}`);
    }
    const menu = reacted.mode === 'menu'
      ? reacted
      : await waitUntil(
          page,
          async () => {
            const j = await page.evaluate(() => window.__playtestQa.jac()?.mode);
            return j === 'menu' ? { mode: j } : null;
          },
          28000,
        );
    if (menu?.mode !== 'menu') throw new Error(`${tag} ${site.id} #${i}: menu never opened`);
    await page.screenshot({ path: path.join(OUT, `${tag}-${site.id}-menu-${i}.png`) });
    await clickGetIn(page, cdp, phone, tag, `${site.id}-${i}`);
    const boarded = await waitUntil(page, async () => {
      const j = await page.evaluate(() => window.__playtestQa.jac());
      return j?.driving ? j : null;
    }, 12000);
    if (!boarded?.driving) throw new Error(`${tag} ${site.id} #${i}: Get in failed`);
    trials.push({
      i,
      site: site.id,
      parked: { cx: parked.cx, cy: parked.cy },
      door,
      away,
      pick,
      boarded: true,
    });
  }
  return trials;
}

async function driveIntoTree(page, cdp, tag, phone) {
  await ensureDriving(page, tag);
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
    window.__playtestQa.focusJac?.();
  });
  await wait(200);
  const sit = await page.evaluate(() => ({
    overlapAtRepro: window.__playtestQa.jacCanSit?.(38.9, 17),
    sitNear: window.__playtestQa.jacCanSit?.(36.4, 17),
    spawn: window.__playtestQa.jac(),
  }));
  if (sit.overlapAtRepro) throw new Error(`${tag}: canSit(38.9,17) still allows the cypress overlap`);
  if (!sit.sitNear) throw new Error(`${tag}: canSit(36.4,17) should stay free beside the tree`);
  if (phone) {
    const held = await holdStickCdp(page, cdp, 4, -56, 5200);
    if (!held) throw new Error(`${tag}: stick missing for tree drive`);
    await releaseStickCdp(cdp);
  } else {
    await page.evaluate(() => document.getElementById('game-canvas')?.focus());
    await page.keyboard.down('KeyW');
    await wait(9000);
    await page.keyboard.up('KeyW');
  }
  await waitUntil(page, async () => {
    const j = await page.evaluate(() => window.__playtestQa.jac());
    return (j?.mph ?? 1) === 0 && (j?.cx ?? 0) > 28 ? j : null;
  }, 4000);
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  const parked = await waitUntil(page, async () => {
    const j = await page.evaluate(() => window.__playtestQa.jac());
    return j && !j.driving ? j : null;
  }, 8000);
  const overlap = await page.evaluate(() => window.__playtestQa.jacOverlapsProp?.());
  const shot = path.join(OUT, `${tag}-tree-drive.png`);
  await page.evaluate(() => window.__playtestQa.focusJac?.());
  await wait(200);
  await page.screenshot({ path: shot });
  if (!parked) throw new Error(`${tag}: tree drive never parked`);
  if (overlap) throw new Error(`${tag}: tree drive parked overlapping a prop at ${parked.cx},${parked.cy}`);
  if (parked.cx >= 38.5 && Math.abs(parked.cy - 17) < 1.2) {
    throw new Error(`${tag}: tree drive still reached the QA sit ${parked.cx},${parked.cy}`);
  }
  return { parked: { cx: parked.cx, cy: parked.cy }, overlap, sit };
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

    const treeDrive = await driveIntoTree(page, cdp, tag, phone);
    notes.push({ treeDrive });

    await parkAt(page, SITES[0]);
    await page.evaluate(() => window.__playtestQa.focusJac?.());
    await wait(280);
    const gap = await labelGap(page);
    notes.push({ label: gap });
    await page.screenshot({ path: path.join(OUT, `${tag}-label.png`) });
    if (!Number.isFinite(gap.gap) || gap.gap < 2 || gap.gap > 36) {
      throw new Error(`${tag}: parked JAC T9 label gap ${gap.gap} (want ~10px on the body)`);
    }

    for (const site of SITES) {
      const trials = await tapVanReentry(page, cdp, tag, phone, site, 5);
      notes.push({ site: site.id, n: trials.length, trials });
      if (trials.length !== 5 || trials.some((t) => !t.boarded)) {
        throw new Error(`${tag}: ${site.id} re-entry ${trials.filter((t) => t.boarded).length}/5`);
      }
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

const only = process.env.R11_ONLY ?? '';
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
console.log('record-tj-drive-model-r11: ok', OUT);
