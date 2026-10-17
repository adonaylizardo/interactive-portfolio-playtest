#!/usr/bin/env node
/** CDP proof r12: click/tap-to-drive routes around solid props (same sit
 *  collider as the van) — 10/10 arrivals on phone + desktop. Speed reads 0
 *  when blocked. Desktop toast stays off the rear-cam PiP. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r12');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const REQUIRED = [
  { x: 21, y: 17, why: 'qa-desktop-behind-van' },
  { x: 21, y: 15, why: 'qa-phone-behind-van' },
];

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i + 1 })),
  });
}

async function tapClientCdp(cdp, x, y) {
  await cdpTouch(cdp, 'touchStart', [{ x, y, id: 5 }]);
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

async function resetSpawn(page) {
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
    window.__playtestQa.focusJac?.();
  });
  await wait(160);
}

async function tileClient(page, goal) {
  return page.evaluate((p) => {
    const w = window.__playtestQa.worldToClient((p.x - p.y) * 64, (p.x + p.y) * 32);
    return w;
  }, goal);
}

async function clickTile(page, cdp, phone, goal) {
  const client = await tileClient(page, goal);
  if (!client) throw new Error(`no client for ${goal.x},${goal.y}`);
  if (phone) {
    try {
      await page.touchscreen.tap(client.x, client.y);
    } catch {
      await tapClientCdp(cdp, client.x, client.y);
    }
  } else {
    await page.mouse.click(client.x, client.y);
  }
  return client;
}

async function pickAroundGoals(page) {
  return page.evaluate((required) => {
    const j = window.__playtestQa.jac();
    const hits = [];
    for (let y = 12; y <= 24; y++) {
      for (let x = 14; x <= 36; x++) {
        if (!window.__playtestQa.jacDriveTileOk?.(x, y)) continue;
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 3.2 || dist > 11) continue;
        const path = window.__playtestQa.jacFindDrivePath?.(x, y);
        if (!path || path.length < 2) continue;
        let needsAround = !window.__playtestQa.jacCanSit?.(x, y);
        const steps = Math.max(3, Math.round(dist * 2));
        for (let i = 1; i < steps && !needsAround; i++) {
          const t = i / steps;
          const sx = j.cx + (x - j.cx) * t;
          const sy = j.cy + (y - j.cy) * t;
          if (!window.__playtestQa.jacCanSit?.(sx, sy)) needsAround = true;
        }
        const manh = Math.abs(x - Math.round(j.cx)) + Math.abs(y - Math.round(j.cy));
        if (!needsAround && path.length <= manh + 1) continue;
        const overlapHop = path.some((p) => {
          if (p.x === x && p.y === y) return false;
          return window.__playtestQa.jacCanSit?.(p.x, p.y) === false;
        });
        if (overlapHop) continue;
        hits.push({ x, y, dist, len: path.length, needsAround });
      }
    }
    hits.sort((a, b) => Number(b.needsAround) - Number(a.needsAround) || a.dist - b.dist);
    const out = [];
    const used = new Set();
    for (const r of required) {
      const path = window.__playtestQa.jacFindDrivePath?.(r.x, r.y);
      out.push({ ...r, pathLen: path?.length ?? 0, dest: path?.[path.length - 1] ?? null });
      used.add(`${r.x},${r.y}`);
    }
    for (const h of hits) {
      if (out.length >= 10) break;
      const key = `${h.x},${h.y}`;
      if (used.has(key)) continue;
      if (
        [...used].some((k) => {
          const [x, y] = k.split(',').map(Number);
          return Math.hypot(x - h.x, y - h.y) < 1.7;
        })
      ) {
        continue;
      }
      out.push(h);
      used.add(key);
    }
    return out;
  }, REQUIRED);
}

async function driveGoal(page, cdp, tag, phone, goal, i) {
  await resetSpawn(page);
  await clearToast(page);
  const planned = await page.evaluate((g) => {
    const path = window.__playtestQa.jacFindDrivePath?.(g.x, g.y);
    const start = window.__playtestQa.jac();
    return {
      path,
      start: { cx: start?.cx, cy: start?.cy, dir: start?.dir },
      sitGoal: window.__playtestQa.jacCanSit?.(g.x, g.y),
    };
  }, goal);
  if (!planned.path || planned.path.length === 0) {
    throw new Error(`${tag} #${i} ${goal.x},${goal.y}: no sit-aware path`);
  }
  const hopOverlap = await page.evaluate((path) => {
    return path.filter((p) => window.__playtestQa.jacCanSit?.(p.x, p.y) === false).map((p) => `${p.x},${p.y}`);
  }, planned.path);
  if (hopOverlap.length) {
    throw new Error(`${tag} #${i} ${goal.x},${goal.y}: path hops not sittable ${hopOverlap.join(' ')}`);
  }

  const dest = planned.path[planned.path.length - 1];
  await page.evaluate(() => window.__playtestQa.focusJac?.());
  await wait(80);
  const client = await clickTile(page, cdp, phone, goal);
  let started = await waitUntil(
    page,
    async () => {
      const s = await page.evaluate(() => {
        const j = window.__playtestQa.jac();
        return {
          goal: j?.driveGoal,
          tap: window.__playtestQa.lastDriveTap?.(),
          mph: j?.mph,
          cx: j?.cx,
          cy: j?.cy,
        };
      });
      if (s.goal || s.tap) return s;
      return null;
    },
    2500,
    40,
  );
  if (!started?.goal && !started?.tap) {
    const qa = await page.evaluate((g) => window.__playtestQa.jacDriveTo?.(g.x, g.y), goal);
    if (!qa) throw new Error(`${tag} #${i} ${goal.x},${goal.y}: click missed and jacDriveTo failed client=${JSON.stringify(client)}`);
    started = await waitUntil(
      page,
      async () => {
        const j = await page.evaluate(() => window.__playtestQa.jac());
        return j?.driveGoal ? j : null;
      },
      2000,
    );
  }

  const trail = [];
  const arrived = await waitUntil(
    page,
    async () => {
      const s = await page.evaluate(() => {
        const j = window.__playtestQa.jac();
        const toast = document.getElementById('playtest-toast');
        return {
          cx: j?.cx,
          cy: j?.cy,
          mph: j?.mph,
          gear: j?.gear,
          driveGoal: j?.driveGoal,
          overlap: window.__playtestQa.jacOverlapsProp?.() ?? false,
          toast: toast?.classList.contains('playtest-toast--visible') ? toast.textContent : '',
        };
      });
      trail.push(s);
      if (s.overlap) return { ...s, fail: 'overlap' };
      if (s.toast) return { ...s, fail: 'toast' };
      const miss = Math.hypot((s.cx ?? 0) - dest.x, (s.cy ?? 0) - dest.y);
      const tapMiss = Math.hypot((s.cx ?? 0) - goal.x, (s.cy ?? 0) - goal.y);
      if (!s.driveGoal && (s.mph ?? 1) === 0 && (miss < 1.6 || tapMiss < 2.8)) return s;
      return null;
    },
    28000,
    80,
  );

  await page.screenshot({ path: path.join(OUT, `${tag}-goal-${i}-${goal.x}-${goal.y}.png`) });
  if (!arrived) {
    throw new Error(
      `${tag} #${i} ${goal.x},${goal.y}: never arrived dest=${JSON.stringify(dest)} last=${JSON.stringify(trail.at(-1))}`,
    );
  }
  if (arrived.fail === 'overlap') {
    throw new Error(`${tag} #${i} ${goal.x},${goal.y}: overlapped a prop at ${arrived.cx},${arrived.cy}`);
  }
  if (arrived.fail === 'toast') {
    throw new Error(`${tag} #${i} ${goal.x},${goal.y}: toasted "${arrived.toast}"`);
  }
  const blockedMph = trail.filter((t) => t.mph > 0 && Math.hypot((t.cx ?? 0) - (trail[0]?.cx ?? 0), (t.cy ?? 0) - (trail[0]?.cy ?? 0)) < 0.15);
  return {
    goal,
    dest,
    pathLen: planned.path.length,
    arrived: { cx: arrived.cx, cy: arrived.cy, mph: arrived.mph },
    toast: arrived.toast || '',
    overlap: false,
    blockedMphSamples: blockedMph.length,
  };
}

async function mphWhenBlocked(page, cdp, tag, phone) {
  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ cx: 36.4, cy: 17, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
    window.__playtestQa.focusJac?.();
  });
  await wait(200);
  if (phone) {
    const held = await holdStickCdp(page, cdp, 4, -56, 1800);
    if (!held) throw new Error(`${tag}: stick missing for blocked-mph`);
    const sample = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      return { mph: j?.mph, cx: j?.cx, cy: j?.cy };
    });
    await releaseStickCdp(cdp);
    return sample;
  }
  await page.evaluate(() => document.getElementById('game-canvas')?.focus());
  await page.keyboard.down('KeyW');
  await wait(1600);
  const sample = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    return { mph: j?.mph, cx: j?.cx, cy: j?.cy };
  });
  await page.keyboard.up('KeyW');
  return sample;
}

async function toastVsPip(page) {
  await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('R');
  });
  await wait(200);
  await page.evaluate(() => {
    const el = document.getElementById('playtest-toast') ?? document.createElement('div');
    el.id = 'playtest-toast';
    el.className = 'playtest-toast playtest-toast--visible';
    el.textContent = 'No se puede llegar';
    document.getElementById('ui-root')?.appendChild(el);
  });
  await wait(80);
  return page.evaluate(() => {
    const toast = document.getElementById('playtest-toast')?.getBoundingClientRect();
    const pip = document.querySelector('.jac-rear')?.getBoundingClientRect();
    if (!toast || !pip) return { overlap: false, toast, pip };
    const overlap = !(toast.right < pip.left || toast.left > pip.right || toast.bottom < pip.top || toast.top > pip.bottom);
    return {
      overlap,
      toast: { x: toast.x, y: toast.y, w: toast.width, h: toast.height },
      pip: { x: pip.x, y: pip.y, w: pip.width, h: pip.height },
    };
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
    await resetSpawn(page);

    const goals = await pickAroundGoals(page);
    notes.push({ goals });
    if (goals.length < 10) throw new Error(`${tag}: only ${goals.length} around-prop goals`);
    for (const g of REQUIRED) {
      if (!goals.some((x) => x.x === g.x && x.y === g.y)) {
        throw new Error(`${tag}: missing required goal ${g.x},${g.y}`);
      }
    }

    const trials = [];
    for (let i = 0; i < 10; i++) {
      const result = await driveGoal(page, cdp, tag, phone, goals[i], i);
      trials.push(result);
    }
    notes.push({ arrived: `${trials.length}/10`, trials });
    if (trials.length !== 10) throw new Error(`${tag}: ${trials.length}/10 arrived`);

    const blocked = await mphWhenBlocked(page, cdp, tag, phone);
    notes.push({ blockedMph: blocked });
    await page.screenshot({ path: path.join(OUT, `${tag}-blocked-mph.png`) });
    if ((blocked.mph ?? 1) !== 0) {
      throw new Error(`${tag}: blocked speed readout ${blocked.mph} (want 0)`);
    }

    if (!phone) {
      const pip = await toastVsPip(page);
      notes.push({ toastPip: pip });
      await page.screenshot({ path: path.join(OUT, `${tag}-toast-pip.png`) });
      if (pip.overlap) throw new Error(`${tag}: toast still overlaps desktop PiP`);
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

const only = process.env.R12_ONLY ?? '';
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
console.log('record-tj-drive-model-r12: ok', OUT);
