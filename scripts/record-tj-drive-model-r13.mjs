#!/usr/bin/env node
/** CDP proof r13: acacia stall 5/5; 10 around-prop goals per device;
 *  one toast; mph from displacement; toast off PiP and Getting started. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r13');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const REQUIRED = [
  { x: 21, y: 17, why: 'behind-van' },
  { x: 21, y: 15, why: 'behind-van-n' },
  { x: 10, y: 17, why: 'acacia' },
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
  await clearToast(page);
  await wait(120);
}

async function driveQa(page, x, y, timeout = 22000) {
  const start = await page.evaluate(([gx, gy]) => {
    const path = window.__playtestQa.jacFindDrivePath?.(gx, gy);
    const ok = window.__playtestQa.jacDriveTo?.(gx, gy);
    return { ok, dest: path?.[path.length - 1] ?? null, len: path?.length ?? 0 };
  }, [x, y]);
  if (!start.ok || !start.dest) return { ...start, arrived: null, toastN: 0, maxMph: 0, overlap: false };
  let toastN = 0;
  let seenToast = false;
  let maxMph = 0;
  let overlap = false;
  const arrived = await waitUntil(
    page,
    async () => {
      const s = await page.evaluate(() => {
        const j = window.__playtestQa.jac();
        const el = document.getElementById('playtest-toast');
        const toast = el?.classList.contains('playtest-toast--visible') ? el.textContent : '';
        return {
          cx: j?.cx,
          cy: j?.cy,
          mph: j?.mph ?? 0,
          goal: j?.driveGoal,
          overlap: window.__playtestQa.jacOverlapsProp?.() ?? false,
          toast,
        };
      });
      if (s.mph > maxMph) maxMph = s.mph;
      if (s.overlap) overlap = true;
      if (s.toast) {
        if (!seenToast) toastN += 1;
        seenToast = true;
      } else {
        seenToast = false;
      }
      const miss = Math.hypot((s.cx ?? 0) - start.dest.x, (s.cy ?? 0) - start.dest.y);
      if (!s.goal && (s.mph ?? 1) === 0 && miss < 1.6) return s;
      if (!s.goal && s.toast && toastN >= 1) return { ...s, gaveUp: true };
      return null;
    },
    timeout,
    70,
  );
  return { ...start, arrived, toastN, maxMph, overlap };
}

async function acaciaRepro(page, tag, i) {
  await resetSpawn(page);
  const a = await driveQa(page, 22, 14);
  if (!a.arrived || a.arrived.gaveUp) throw new Error(`${tag} acacia #${i}: never reached (22,14)`);
  const b = await driveQa(page, 18, 16);
  if (!b.arrived || b.arrived.gaveUp) throw new Error(`${tag} acacia #${i}: never reached (18,16)`);
  await page.evaluate(() => window.__playtestQa.focusJac?.());
  await wait(80);
  const c = await driveQa(page, 10, 17, 24000);
  await page.screenshot({ path: path.join(OUT, `${tag}-acacia-${i}.png`) });
  if (c.overlap) throw new Error(`${tag} acacia #${i}: overlapped a prop`);
  if (c.maxMph > 12) throw new Error(`${tag} acacia #${i}: mph spiked to ${c.maxMph}`);
  if (c.toastN > 1) throw new Error(`${tag} acacia #${i}: toast fired ${c.toastN} times`);
  if (!c.ok) throw new Error(`${tag} acacia #${i}: planner rejected (10,17)`);
  if (!c.arrived) throw new Error(`${tag} acacia #${i}: stalled with no arrival and no single toast`);
  if (c.arrived.gaveUp && c.toastN !== 1) {
    throw new Error(`${tag} acacia #${i}: give-up must toast once, got ${c.toastN}`);
  }
  if (!c.arrived.gaveUp) {
    const miss = Math.hypot((c.arrived.cx ?? 0) - (c.dest?.x ?? 10), (c.arrived.cy ?? 0) - (c.dest?.y ?? 17));
    if (miss > 2.6) throw new Error(`${tag} acacia #${i}: stopped ${miss.toFixed(2)} from dest`);
  }
  return { i, dest: c.dest, arrived: { cx: c.arrived.cx, cy: c.arrived.cy }, toastN: c.toastN, maxMph: c.maxMph };
}

async function pickAroundGoals(page) {
  return page.evaluate((required) => {
    const j = window.__playtestQa.jac();
    const hits = [];
    for (let y = 12; y <= 24; y++) {
      for (let x = 10; x <= 36; x++) {
        if (!window.__playtestQa.jacDriveTileOk?.(x, y)) continue;
        const dist = Math.hypot(x - j.cx, y - j.cy);
        if (dist < 3.2 || dist > 12) continue;
        const path = window.__playtestQa.jacFindDrivePath?.(x, y);
        if (!path || path.length < 2 || path.length > 22) continue;
        let needsAround = !window.__playtestQa.jacCanSit?.(x, y);
        const steps = Math.max(3, Math.round(dist * 2));
        for (let i = 1; i < steps && !needsAround; i++) {
          const t = i / steps;
          if (!window.__playtestQa.jacCanSit?.(j.cx + (x - j.cx) * t, j.cy + (y - j.cy) * t)) needsAround = true;
        }
        if (!needsAround && path.length <= Math.abs(x - Math.round(j.cx)) + Math.abs(y - Math.round(j.cy)) + 1) continue;
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
      if ([...used].some((k) => {
        const [x, y] = k.split(',').map(Number);
        return Math.hypot(x - h.x, y - h.y) < 1.7;
      })) continue;
      out.push(h);
      used.add(key);
    }
    return out;
  }, REQUIRED);
}

async function aroundGoals(page, tag) {
  await resetSpawn(page);
  const goals = await pickAroundGoals(page);
  if (goals.length < 10) throw new Error(`${tag}: only ${goals.length} around-prop goals`);
  const trials = [];
  for (let i = 0; i < 10; i++) {
    await resetSpawn(page);
    const g = goals[i];
    const r = await driveQa(page, g.x, g.y);
    await page.screenshot({ path: path.join(OUT, `${tag}-goal-${i}-${g.x}-${g.y}.png`) });
    if (r.overlap) throw new Error(`${tag} #${i} ${g.x},${g.y}: overlapped a prop`);
    if (r.maxMph > 12) throw new Error(`${tag} #${i} ${g.x},${g.y}: mph spiked to ${r.maxMph}`);
    if (r.toastN > 1) throw new Error(`${tag} #${i} ${g.x},${g.y}: toast ${r.toastN} times`);
    if (!r.ok) throw new Error(`${tag} #${i} ${g.x},${g.y}: planner rejected`);
    if (!r.arrived) throw new Error(`${tag} #${i} ${g.x},${g.y}: never arrived`);
    trials.push({ goal: g, dest: r.dest, arrived: { cx: r.arrived.cx, cy: r.arrived.cy }, toastN: r.toastN, maxMph: r.maxMph });
  }
  return trials;
}

async function toastChrome(page) {
  await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('R');
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
    const card = document.querySelector('.checklist')?.getBoundingClientRect();
    const hit = (a, b) =>
      !!a && !!b && !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    return {
      pip: hit(toast, pip),
      card: hit(toast, card),
      toast: toast ? { x: toast.x, y: toast.y, w: toast.width, h: toast.height } : null,
      pipBox: pip ? { x: pip.x, y: pip.y, w: pip.width, h: pip.height } : null,
      cardBox: card ? { x: card.x, y: card.y, w: card.width, h: card.height } : null,
    };
  });
}

async function edgeClamp(page, tag) {
  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ cx: 2, cy: 2, dir: 'nw', mode: 'drive' });
    window.__playtestQa.jacDriveTo?.(0, 0);
  });
  await wait(2500);
  const s = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    return { cx: j.cx, cy: j.cy, w: j.w, h: j.h, overlap: window.__playtestQa.jacOverlapsProp?.() };
  });
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  const parked = await waitUntil(page, async () => {
    const j = await page.evaluate(() => window.__playtestQa.jac());
    return j && !j.driving ? j : null;
  }, 6000);
  if ((parked?.cx ?? 0) < 1.4 || (parked?.cy ?? 0) < 0.9) {
    throw new Error(`${tag}: van overhangs the void at ${parked?.cx},${parked?.cy}`);
  }
  return { drive: s, parked: { cx: parked.cx, cy: parked.cy } };
}

async function behindHouse(page, tag, phone) {
  await ensureDriving(page, tag);
  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ cx: 17, cy: 16, dir: 'nw', mode: 'drive' });
    window.__playtestQa.focusJac?.();
  });
  await clearToast(page);
  const before = await page.evaluate(() => window.__playtestQa.jac());
  const tap = { x: 14, y: 12 };
  const planned = await page.evaluate((g) => window.__playtestQa.jacFindDrivePath?.(g.x, g.y), tap);
  const ok = await page.evaluate((g) => window.__playtestQa.jacDriveTo?.(g.x, g.y), tap);
  await wait(2200);
  const after = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const el = document.getElementById('playtest-toast');
    return {
      cx: j?.cx,
      cy: j?.cy,
      goal: j?.driveGoal,
      toast: el?.classList.contains('playtest-toast--visible') ? el.textContent : '',
    };
  });
  const moved = Math.hypot((after.cx ?? 0) - (before.cx ?? 0), (after.cy ?? 0) - (before.cy ?? 0));
  if (!ok && !planned) {
    if (moved > 0.35 && !after.toast) {
      throw new Error(`${tag}: behind-house creep ${moved.toFixed(2)} with no toast`);
    }
    return { routed: false, toast: !!after.toast, moved };
  }
  return { routed: true, dest: planned?.[planned.length - 1], moved };
}

async function vanTapOnce(page, cdp, tag, phone) {
  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ cx: 17, cy: 16, dir: 'se', mode: 'drive' });
  });
  await wait(80);
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  const parked = await waitUntil(page, async () => {
    const j = await page.evaluate(() => window.__playtestQa.jac());
    return j && !j.driving ? j : null;
  }, 8000);
  if (!parked) throw new Error(`${tag}: never parked for van tap`);
  await sitByVan(page);
  await page.evaluate(() => window.__playtestQa.focusJac?.());
  await wait(200);
  const van = await page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    const c = document.getElementById('game-canvas')?.getBoundingClientRect();
    if (!e || !c) return null;
    return { x: c.left + e.sx, y: c.top + e.sy };
  });
  if (!van) throw new Error(`${tag}: van client missing`);
  if (phone) {
    try {
      await page.touchscreen.tap(van.x, van.y);
    } catch {
      await tapClientCdp(cdp, van.x, van.y);
    }
  } else {
    await page.mouse.click(van.x, van.y);
  }
  const menu = await waitUntil(page, async () => {
    const mode = await page.evaluate(() => window.__playtestQa.jac()?.mode);
    return mode === 'menu' ? true : null;
  }, 8000);
  if (!menu) throw new Error(`${tag}: parked van tap behind house did not open menu on first tap`);
  return { menu: true };
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

    const acacias = [];
    for (let i = 0; i < 5; i++) acacias.push(await acaciaRepro(page, tag, i));
    notes.push({ acacia: `${acacias.length}/5`, acacias });

    const around = await aroundGoals(page, tag);
    notes.push({ around: `${around.length}/10`, around });

    const house = await behindHouse(page, tag, phone);
    notes.push({ behindHouse: house });

    await ensureDriving(page, tag);
    const edge = await edgeClamp(page, tag);
    notes.push({ edge });

    if (!phone) {
      await ensureDriving(page, tag);
      const chrome = await toastChrome(page);
      notes.push({ toastChrome: chrome });
      await page.screenshot({ path: path.join(OUT, `${tag}-toast-chrome.png`) });
      if (chrome.pip) throw new Error(`${tag}: toast overlaps PiP`);
      if (chrome.card) throw new Error(`${tag}: toast overlaps Getting started`);
    }

    const tap = await vanTapOnce(page, cdp, tag, phone);
    notes.push({ vanTap: tap });

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

const only = process.env.R13_ONLY ?? '';
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
console.log('record-tj-drive-model-r13: ok', OUT);
