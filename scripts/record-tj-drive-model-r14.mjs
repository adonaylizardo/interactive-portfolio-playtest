#!/usr/bin/env node
/** CDP proof r14: heading never rotates into a prop; MTV unsticks;
 *  200 stick-sequence fuzz × 4 clusters on phone + desktop; toast above WASD. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-model-r14');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const CLUSTERS = [
  { id: 'spawn', cx: 25, cy: 17, dir: 'se' },
  { id: 'acacia', cx: 17, cy: 16, dir: 'nw' },
  { id: 'cuji-4', cx: 17, cy: 17, dir: 'se' },
  { id: 'cardon-park', cx: 14, cy: 32, dir: 'se' },
];

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
    window.__playtestQa.jacStick?.(null);
    window.__playtestQa.focusJac?.();
  });
  await wait(80);
}

async function holdStick(page, vec, ms, sampleEvery = 80) {
  await page.evaluate((v) => window.__playtestQa.jacStick?.(v), vec);
  const t0 = Date.now();
  let overlapFrames = 0;
  let samples = 0;
  let maxStuck = 0;
  let stuck = 0;
  let last = null;
  let prev = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    return { cx: j.cx, cy: j.cy };
  });
  while (Date.now() - t0 < ms) {
    await wait(sampleEvery);
    const s = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      return {
        cx: j.cx,
        cy: j.cy,
        dir: j.dir,
        mph: j.mph,
        overlap: window.__playtestQa.jacOverlapsProp?.() ?? false,
      };
    });
    samples += 1;
    last = s;
    if (s.overlap) overlapFrames += 1;
    const moved = Math.hypot((s.cx ?? 0) - prev.cx, (s.cy ?? 0) - prev.cy);
    if (moved < 0.04 && s.overlap) stuck += sampleEvery;
    else stuck = 0;
    if (stuck > maxStuck) maxStuck = stuck;
    prev = { cx: s.cx, cy: s.cy };
  }
  await page.evaluate(() => window.__playtestQa.jacStick?.(null));
  return { overlapFrames, samples, maxStuck, last };
}

async function wedgeRepro(page, tag, i) {
  await resetSpawn(page);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  const a = await holdStick(page, { x: 0, y: 1 }, 6000);
  const b = await holdStick(page, { x: 0, y: 1 }, 6000);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('D'));
  const c = await holdStick(page, { x: -0.75, y: -0.75 }, 6000);
  await page.screenshot({ path: path.join(OUT, `${tag}-wedge-${i}.png`) });
  const overlap = a.overlapFrames + b.overlapFrames + c.overlapFrames;
  const stuck = Math.max(a.maxStuck, b.maxStuck, c.maxStuck);
  if (overlap > 0) throw new Error(`${tag} wedge #${i}: ${overlap} overlap frames at ${c.last?.cx},${c.last?.cy}`);
  if (stuck > 2000) throw new Error(`${tag} wedge #${i}: stuck ${stuck}ms`);
  return { i, last: c.last, overlap, stuck };
}

async function fuzzCluster(page, cluster, n, seed) {
  return page.evaluate(
    ({ cluster, n, seed }) => {
      const qa = window.__playtestQa;
      let s = seed;
      const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
      qa.jacSet?.({ cx: cluster.cx, cy: cluster.cy, dir: cluster.dir, mode: 'drive' });
      qa.jacSetGear?.('D');
      let overlapFrames = 0;
      let stuckOver = 0;
      let maxStuck = 0;
      const samples = [];
      for (let i = 0; i < n; i++) {
        qa.jacSet?.({ cx: cluster.cx, cy: cluster.cy, dir: cluster.dir, mode: 'drive' });
        const segs = 3 + Math.floor(rnd() * 3);
        let stuck = 0;
        let prev = { cx: cluster.cx, cy: cluster.cy };
        for (let g = 0; g < segs; g++) {
          const dx = rnd() * 2 - 1;
          const dy = rnd() * 2 - 1;
          const mag = Math.hypot(dx, dy) || 1;
          const hold = 0.35 + rnd() * 0.7;
          const steps = Math.max(4, Math.round(hold / 0.05));
          for (let t = 0; t < steps; t++) {
            const st = qa.jacDriveStep?.(0.05, dx / mag, dy / mag);
            if (!st) continue;
            if (st.overlap) {
              overlapFrames += 1;
              samples.push({ i, g, t, ...st });
            }
            const moved = Math.hypot(st.cx - prev.cx, st.cy - prev.cy);
            if (moved < 0.03 && st.overlap) stuck += 50;
            else stuck = 0;
            if (stuck > maxStuck) maxStuck = stuck;
            if (stuck > 2000) stuckOver += 1;
            prev = { cx: st.cx, cy: st.cy };
          }
        }
      }
      const end = qa.jac();
      return {
        cluster: cluster.id,
        n,
        overlapFrames,
        stuckOver,
        maxStuck,
        end: { cx: end?.cx, cy: end?.cy, dir: end?.dir },
        hits: samples.slice(0, 8),
      };
    },
    { cluster, n, seed },
  );
}

async function toastChrome(page) {
  await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('R');
    const el = document.getElementById('playtest-toast') ?? document.createElement('div');
    el.id = 'playtest-toast';
    el.className = 'playtest-toast playtest-toast--visible';
    el.textContent = 'No se puede llegar';
    document.getElementById('ui-root')?.appendChild(el);
    const hint = document.querySelector('.jac-hint');
    if (hint) hint.hidden = false;
  });
  await wait(80);
  return page.evaluate(() => {
    const toast = document.getElementById('playtest-toast')?.getBoundingClientRect();
    const pip = document.querySelector('.jac-rear')?.getBoundingClientRect();
    const card = document.querySelector('.checklist')?.getBoundingClientRect();
    const hint = document.querySelector('.jac-hint')?.getBoundingClientRect();
    const dock = document.querySelector('.jac-dock')?.getBoundingClientRect();
    const hit = (a, b) =>
      !!a && !!b && a.width > 2 && b.width > 2 && !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    return {
      pip: hit(toast, pip),
      card: hit(toast, card),
      hint: hit(toast, hint),
      dock: hit(toast, dock),
      toast: toast ? { x: toast.x, y: toast.y, w: toast.width, h: toast.height } : null,
      hintBox: hint ? { x: hint.x, y: hint.y, w: hint.width, h: hint.height } : null,
      dockBox: dock ? { x: dock.x, y: dock.y, w: dock.width, h: dock.height } : null,
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

    const wedges = [];
    for (let i = 0; i < 4; i++) wedges.push(await wedgeRepro(page, tag, i));
    notes.push({ wedge: `${wedges.length}/4`, wedges });

    const fuzz = [];
    const per = 50;
    for (let c = 0; c < CLUSTERS.length; c++) {
      const r = await fuzzCluster(page, CLUSTERS[c], per, 47 + c * 99);
      if (r.overlapFrames > 0) throw new Error(`${tag} fuzz ${r.cluster}: ${r.overlapFrames} overlap frames`);
      if (r.stuckOver > 0 || r.maxStuck > 2000) {
        throw new Error(`${tag} fuzz ${r.cluster}: stuck ${r.maxStuck}ms (${r.stuckOver})`);
      }
      fuzz.push(r);
    }
    notes.push({ fuzz: `${fuzz.reduce((n, f) => n + f.n, 0)} sequences`, fuzz });

    if (!phone) {
      const chrome = await toastChrome(page);
      notes.push({ toastChrome: chrome });
      await page.screenshot({ path: path.join(OUT, `${tag}-toast-chrome.png`) });
      if (chrome.pip) throw new Error(`${tag}: toast overlaps PiP`);
      if (chrome.card) throw new Error(`${tag}: toast overlaps Getting started`);
      if (chrome.hint) throw new Error(`${tag}: toast overlaps WASD hint`);
      if (chrome.dock) throw new Error(`${tag}: toast overlaps dock`);
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

const only = process.env.R14_ONLY ?? '';
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
console.log('record-tj-drive-model-r14: ok', OUT);
