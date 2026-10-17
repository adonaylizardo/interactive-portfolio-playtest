#!/usr/bin/env node
/** Door-while-driving for every enterable building, desktop 1280 + phone 390.
 *  Park sit is reachable, never on/blocking the door or approach; then walk in
 *  around the van. Default language stays ES. No r11–r14 regressions. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-doors-r16');
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

async function parkVan(page) {
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    window.__playtestQa.jacStick?.(null);
    window.__playtestQa.focusJac?.();
  });
  await wait(80);
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
  const boarded = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    16000,
  );
  if (!boarded) throw new Error(`${tag}: never boarded`);
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

function parkCovers(sit, door, keep) {
  const sizes = [
    { w: 5, h: 3 },
    { w: 3, h: 5 },
  ];
  for (const size of sizes) {
    const ox = Math.round(sit.x - (size.w - 1) / 2);
    const oy = Math.round(sit.y - (size.h - 1) / 2);
    for (let dy = 0; dy < size.h; dy++) {
      for (let dx = 0; dx < size.w; dx++) {
        const key = `${ox + dx},${oy + dy}`;
        if (keep.has(key)) return true;
        if (ox + dx === door.x && oy + dy === door.y) return true;
      }
    }
  }
  return false;
}

async function doorWhileDriving(page, tag, phone) {
  const buildings = await page.evaluate(() => window.__playtestQa.getEnterableBuildings?.() ?? []);
  if (!buildings.length) throw new Error(`${tag}: no enterable buildings`);
  const reports = [];
  const limit = phone ? 28000 : 20000;

  for (const b of buildings) {
    if (!b?.door || !b.name) continue;
    const name = b.name;
    await page.evaluate(() => {
      if (window.__playtestQa.isInInterior?.()) window.__playtestQa.leaveInteriorNow?.();
    });
    await parkVan(page);
    await ensureDriving(page, `${tag}:${name}`);
    await page.evaluate(() => window.__playtestQa.setZoom?.(0.12));
    await wait(80);

    const plan = await page.evaluate((door) => {
      const sit = window.__playtestQa.parkForDoor?.(door.x, door.y);
      const path = sit ? window.__playtestQa.jacFindDrivePath?.(sit.x, sit.y) : null;
      const walk = window.__playtestQa.fill?.().walk ?? [];
      const keep = [`${door.x},${door.y}`];
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = door.x + dx;
        const y = door.y + dy;
        const ch = walk[y]?.[x];
        if (ch && ch !== '#' && ch !== 'x') keep.push(`${x},${y}`);
      }
      if (sit && path && path.length > 70) {
        const hop = path[Math.max(0, path.length - 12)];
        window.__playtestQa.jacSet?.({ cx: hop.x, cy: hop.y, dir: 'se', mode: 'drive' });
        window.__playtestQa.jacSetGear?.('D');
      }
      return { sit, pathLen: path?.length ?? null, keep, cx: window.__playtestQa.jac()?.cx, cy: window.__playtestQa.jac()?.cy };
    }, b.door);

    if (!plan.sit) throw new Error(`${tag}:${name}: parkForDoor returned null`);
    if (parkCovers(plan.sit, b.door, new Set(plan.keep))) {
      throw new Error(`${tag}:${name}: park sit (${plan.sit.x},${plan.sit.y}) covers door/approach`);
    }

    const started = Date.now();
    const ok = await page.evaluate((n) => window.__playtestQa.walkToBuilding(n), name);
    if (!ok) throw new Error(`${tag}:${name}: walkToBuilding while driving failed`);

    const entered = await waitUntil(
      page,
      async () => {
        return page.evaluate((expected) => {
          const toast = document.getElementById('playtest-toast');
          const toastOn = toast?.classList.contains('playtest-toast--visible');
          const toastText = toast?.textContent ?? '';
          if (toastOn && /Get out to enter|Bájate para entrar/.test(toastText)) {
            return { kind: 'toast', text: toastText };
          }
          if (window.__playtestQa.isInInterior?.()) {
            return { kind: 'interior', id: window.__playtestQa.getInteriorId?.() };
          }
          return null;
        }, name);
      },
      limit,
      100,
    );
    const ms = Date.now() - started;
    const after = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      const foot = window.__playtestQa.parkedFootprint?.() ?? [];
      const char = window.__playtestQa.getCharacterTile?.();
      return {
        driving: j?.driving,
        cx: j?.cx,
        cy: j?.cy,
        foot,
        char,
        interior: window.__playtestQa.isInInterior?.(),
        id: window.__playtestQa.getInteriorId?.(),
      };
    });

    if (entered?.kind === 'toast') {
      throw new Error(`${tag}:${name}: fell back to toast '${entered.text}'`);
    }
    if (!entered || entered.kind !== 'interior' || !after.interior) {
      throw new Error(`${tag}:${name}: never entered (${ms}ms, sit ${plan.sit.x},${plan.sit.y}, van ${after.cx},${after.cy})`);
    }
    if (!phone && ms > 20000) {
      throw new Error(`${tag}:${name}: entered in ${ms}ms (>20s desktop)`);
    }
    const doorKey = `${b.door.x},${b.door.y}`;
    const footKeys = new Set(after.foot.map((c) => `${c.x},${c.y}`));
    if (footKeys.has(doorKey)) {
      throw new Error(`${tag}:${name}: parked footprint still covers door ${doorKey}`);
    }
    for (const k of plan.keep) {
      if (k !== doorKey && footKeys.has(k)) {
        throw new Error(`${tag}:${name}: parked footprint covers approach ${k}`);
      }
    }

    reports.push({
      name,
      door: b.door,
      sit: plan.sit,
      pathLen: plan.pathLen,
      ms,
      interior: after.id,
    });
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}-inside.png`) });
    await page.evaluate(() => window.__playtestQa.leaveInteriorNow?.());
    await wait(200);
  }

  return reports;
}

async function productFlow(page, tag, phone) {
  const notes = {};
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
  });

  const boot = await page.evaluate(() => ({
    lang: window.__playtestQa.getLang?.(),
    html: document.documentElement.lang,
    label: document.querySelector('.checklist__label')?.textContent ?? '',
    canvas: document.getElementById('game-canvas')?.getAttribute('aria-label') ?? '',
    dock: document.querySelector('.chrome__dock')?.getAttribute('aria-label') ?? '',
    stick: document.querySelector('.joystick')?.getAttribute('aria-label') ?? '',
    info: (() => {
      const el = document.querySelector('.name-label__info');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, hidden: el.hidden };
    })(),
    esActive: document.querySelector('.chrome__lang-opt[data-lang="es"]')?.classList.contains('is-active') ?? false,
  }));
  notes.boot = boot;
  if (boot.lang !== 'es') throw new Error(`${tag}: default lang is '${boot.lang}', expected es`);
  if (boot.html !== 'es') throw new Error(`${tag}: <html lang> is '${boot.html}', expected es`);
  if (boot.label !== 'Primeros pasos') throw new Error(`${tag}: default checklist '${boot.label}'`);
  if (boot.canvas !== 'Mundo isométrico de prueba') throw new Error(`${tag}: canvas label '${boot.canvas}'`);
  if (boot.dock && boot.dock !== 'Barra') throw new Error(`${tag}: dock aria '${boot.dock}'`);
  if (boot.info && (boot.info.w < 44 || boot.info.h < 44) && !boot.info.hidden) {
    throw new Error(`${tag}: i-button hit ${boot.info.w}x${boot.info.h} < 44`);
  }

  await page.evaluate(() => window.__playtestQa.setLang?.('en'));
  await wait(80);
  const en = await page.evaluate(() => ({
    canvas: document.getElementById('game-canvas')?.getAttribute('aria-label') ?? '',
    off: window.__playtestQa.t?.('jac.off'),
    on: window.__playtestQa.t?.('jac.on'),
    drive: window.__playtestQa.t?.('jac.drive'),
    gear: window.__playtestQa.t?.('jac.gear'),
  }));
  notes.en = en;
  if (en.canvas !== 'Isometric playtest world') throw new Error(`${tag}: EN canvas '${en.canvas}'`);
  if (en.off !== 'Off' || en.on !== 'On') throw new Error(`${tag}: EN dial ${en.off}/${en.on}`);

  await page.evaluate(() => window.__playtestQa.setLang?.('es'));
  await wait(80);
  const es = await page.evaluate(() => ({
    off: window.__playtestQa.t?.('jac.off'),
    on: window.__playtestQa.t?.('jac.on'),
    drive: window.__playtestQa.t?.('jac.drive'),
    gear: window.__playtestQa.t?.('jac.gear'),
    canvas: document.getElementById('game-canvas')?.getAttribute('aria-label') ?? '',
  }));
  notes.es = es;
  if (es.off !== 'Apagado' || es.on !== 'Encendido') throw new Error(`${tag}: ES dial ${es.off}/${es.on}`);
  if (es.drive !== 'Conducir') throw new Error(`${tag}: ES drive '${es.drive}'`);
  if (es.gear !== 'Marcha') throw new Error(`${tag}: ES gear '${es.gear}'`);

  notes.doors = await doorWhileDriving(page, tag, phone);
  await page.screenshot({ path: path.join(OUT, `${tag}-doors-done.png`) });

  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  notes.consoleErrors = logs.filter((t) => !/Failed to load resource|404/.test(t));

  const fuzz = [];
  const per = phone ? 25 : 25;
  for (let c = 0; c < CLUSTERS.length; c++) {
    const r = await fuzzCluster(page, CLUSTERS[c], per, 47 + c * 99);
    if (r.overlapFrames > 0) throw new Error(`${tag} fuzz ${r.cluster}: ${r.overlapFrames} overlap frames`);
    if (r.stuckOver > 0 || r.maxStuck > 2000) {
      throw new Error(`${tag} fuzz ${r.cluster}: stuck ${r.maxStuck}ms (${r.stuckOver})`);
    }
    fuzz.push(r);
  }
  notes.fuzz = { n: fuzz.reduce((n, f) => n + f.n, 0), fuzz };

  if (phone) {
    const sticks = await page.evaluate(() => document.querySelectorAll('.joystick').length);
    if (sticks !== 1) throw new Error(`${tag}: expected 1 joystick, got ${sticks}`);
  }

  return notes;
}

async function run(tag, options, phone) {
  const notes = [];
  const errors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    ...options,
    recordVideo: { dir: path.join(OUT, `${tag}-clips`), size: options.viewport },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const bundle = await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    );
    notes.push({ bundle });
    const flow = await productFlow(page, tag, phone);
    notes.push(flow);
    const realErrors = errors.filter((t) => !/Failed to load resource|404|net::ERR/.test(t));
    if (realErrors.length) throw new Error(`${tag}: console errors ${realErrors.join(' | ')}`);
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

const only = process.env.R16_ONLY ?? '';
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
console.log('record-tj-drive-doors-r16: ok', OUT);
