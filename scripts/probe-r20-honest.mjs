#!/usr/bin/env node
/** Honest r20 table: per-frame van/heading caps, walk-in, ground tap, retarget, montage. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r20');
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4293/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

const report = {
  base: BASE,
  hash: '',
  doors: {},
  overlap: {},
  ground: [],
  retarget: [],
  tapLongtask: {},
  errors: [],
};

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) return;
    await wait(100);
  }
  throw new Error('qa api missing');
}

async function spawnDrive(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
  });
  await wait(40);
  await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    window.__playtestQa.setCharacterTile?.(s.center.x + 2, s.center.y);
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
  });
}

async function armSampler(page) {
  await page.evaluate(() => {
    window.__r20s = [];
    let last = performance.now();
    const tick = (t) => {
      const j = window.__playtestQa.jac();
      const c = window.__playtestQa.getCharacterPos?.() ?? { x: 0, y: 0 };
      const r = window.__playtestQa.inputReady();
      window.__r20s.push({
        dt: (t - last) / 1000,
        t,
        cx: j.cx,
        cy: j.cy,
        heading: j.heading,
        vel: j.vel,
        mph: j.mph,
        max: j.maxTilesPerS ?? 5,
        driving: j.driving,
        goal: j.driveGoal,
        px: c.x,
        py: c.y,
        interior: r.interior,
        panel: window.__playtestQa.openPanelTitle?.() ?? '',
      });
      last = t;
      if (window.__r20s.length < 900) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function analyzeTrace(samples) {
  let vanJump = 0;
  let headJump = 0;
  let charJump = 0;
  let getOutHop = 0;
  const jumps = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(b.dt || 0, 1 / 120);
    const dVan = Math.hypot((b.cx ?? 0) - (a.cx ?? 0), (b.cy ?? 0) - (a.cy ?? 0));
    // Real dt only — r21 forbids the 0.85 floor that hid desktop cruise frames.
    const cap = (b.max ?? 5) * dt + 0.22;
    if (dVan > vanJump) vanJump = dVan;
    if (dVan > cap + 1e-4) jumps.push({ kind: 'van', d: dVan, cap, i });
    let dh = (b.heading ?? 0) - (a.heading ?? 0);
    if (dh > 2) dh -= 4;
    if (dh < -2) dh += 4;
    const hCap = 2.4 * dt + 0.45;
    if (Math.abs(dh) > headJump) headJump = Math.abs(dh);
    if (Math.abs(dh) > hCap) jumps.push({ kind: 'heading', d: Math.abs(dh), cap: hCap, i });
    const dChar = Math.hypot((b.px ?? 0) - (a.px ?? 0), (b.py ?? 0) - (a.py ?? 0));
    if (a.driving && !b.driving && dChar <= 3.2) {
      getOutHop = Math.max(getOutHop, dChar);
      continue;
    }
    if (dChar > charJump) charJump = dChar;
    if (dChar > 4.5) jumps.push({ kind: 'char', d: dChar, cap: 4.5, i });
  }
  return { vanJump, headJump, charJump, getOutHop, jumps: jumps.slice(0, 8) };
}

function done(s) {
  const away = Math.hypot((s.cx ?? 0) - 25.5, (s.cy ?? 0) - 17) > 2.2;
  return !!(s.interior || s.panel) && away && !s.driving;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    const c = window.__playtestQa.getCharacterPos?.() ?? { x: 0, y: 0 };
    return {
      driving: j.driving,
      goal: j.driveGoal,
      mph: j.mph,
      cx: j.cx,
      cy: j.cy,
      dir: j.dir,
      heading: j.heading,
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      px: c.x,
      py: c.y,
      overlap: window.__playtestQa.jacOverlapsProp(),
      sitWhy: j.sitWhy ?? '',
    };
  });
}

async function waitDone(page, timeout = 50000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snapshot(page);
    if (done(last)) return { ...last, ok: true, ms: Date.now() - t0 };
    await wait(50);
  }
  return { ...last, ok: false, ms: Date.now() - t0 };
}

async function readTrace(page) {
  return page.evaluate(() => window.__r20s ?? []);
}

async function driveOne(page, name) {
  await spawnDrive(page);
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(n === 'flor' || n === 'sambil' ? 0.12 : 0.28);
  }, name);
  await wait(40);
  await armSampler(page);
  await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  const end = await waitDone(page);
  const samples = await readTrace(page);
  const trace = analyzeTrace(samples);
  const parked = await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    if (window.__playtestQa.jac().driving) window.__playtestQa.jacGetOut?.();
    const s = window.__playtestQa.jac();
    return { cx: s.cx, cy: s.cy, dir: s.dir, overlap: window.__playtestQa.jacOverlapsProp() };
  });
  return { ...end, parked, trace };
}

async function measureViewport(browser, tag, size, touch) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  await boot(page);
  if (!report.hash) {
    report.hash = await page.evaluate(() => document.querySelector('script[src*="assets/index-"]')?.src ?? '');
    log('hash', report.hash);
  }
  const sits = await page.evaluate(() => {
    return window.__playtestQa
      .getEnterableBuildings()
      .filter((b) => b.door)
      .map((b) => {
        const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
        return {
          name: b.name,
          sit: sit ? { x: sit.x, y: sit.y, heading: sit.heading, pathN: sit.path?.length ?? 0 } : null,
        };
      });
  }).catch(() => []);
  if (sits.length) log('sits', JSON.stringify(sits));
  const list = await page.evaluate(() =>
    window.__playtestQa.getEnterableBuildings().filter((b) => b.door).map((b) => b.name),
  );
  const rows = [];
  for (const name of list) {
    const attempts = [];
    for (let i = 0; i < 3; i++) {
      const row = await driveOne(page, name);
      const jumpFail = row.trace.jumps.some((j) => j.kind === 'van' || j.kind === 'char');
      log(
        `${tag} ${name}#${i + 1} ${row.ok && !jumpFail ? 'OK' : 'FAIL'} ${row.ms}ms @${row.cx?.toFixed?.(2)},${row.cy?.toFixed?.(2)} ov=${row.parked?.overlap} vanΔ=${row.trace.vanJump.toFixed(2)} charΔ=${row.trace.charJump.toFixed(2)} hops=${row.trace.jumps.length} why=${row.sitWhy ?? ''}`,
      );
      if (jumpFail) {
        report.errors.push(`${tag}:${name}#${i + 1}: jump ${JSON.stringify(row.trace.jumps[0])}`);
        row.ok = false;
      }
      if (attempts.every((a) => a.parked?.overlap)) report.errors.push(`${tag}:${name}: overlap TRUE on all 3`);
      attempts.push(row);
    }
    const best = attempts.find((a) => a.ok) ?? attempts[attempts.length - 1];
    const ok = attempts.every((a) => a.ok);
    rows.push({
      name,
      ok,
      n: `${attempts.filter((a) => a.ok).length}/3`,
      ms: attempts.map((a) => a.ms),
      cx: best.cx,
      cy: best.cy,
      overlap: attempts.some((a) => a.parked?.overlap),
      vanJump: Math.max(...attempts.map((a) => a.trace.vanJump)),
    });
    if (!ok) report.errors.push(`${tag}:${name}: did not complete 3/3 honestly`);
  }
  report.doors[tag] = rows;
  report.overlap[tag] = Object.fromEntries(rows.map((r) => [r.name, r.overlap]));
  await ctx.close();
}

function headingFlips(samples) {
  let changes = 0;
  let flips180 = 0;
  let prev = null;
  for (const s of samples) {
    const h = s.heading;
    if (h == null || !s.driving) continue;
    if (prev == null) {
      prev = h;
      continue;
    }
    let dh = h - prev;
    if (dh > 2) dh -= 4;
    if (dh < -2) dh += 4;
    if (Math.abs(dh) > 0.35) {
      changes += 1;
      if (Math.abs(dh) > 1.7) flips180 += 1;
      prev = h;
    }
  }
  return { changes, flips180 };
}

function pathRatio(samples, gx, gy) {
  if (samples.length < 2) return { travel: 0, straight: 0, ratio: 0 };
  let travel = 0;
  const a0 = samples[0];
  for (let i = 1; i < samples.length; i++) {
    travel += Math.hypot((samples[i].cx ?? 0) - (samples[i - 1].cx ?? 0), (samples[i].cy ?? 0) - (samples[i - 1].cy ?? 0));
  }
  const straight = Math.hypot(gx - (a0.cx ?? 0), gy - (a0.cy ?? 0));
  return { travel, straight, ratio: straight > 0.2 ? travel / straight : 0 };
}

const GROUND_GOALS = [
  [46, 20],
  [24, 27],
  [37, 26],
  [44, 36],
  [18, 36],
];
const RETARGET_PAIRS = [
  { from: 'sambil', to: 'finoa', delay: 800, want: /finoa/i },
  { from: 'sambil', to: 'mentoria', delay: 800, want: /mentor/i },
  { from: 'flor', to: 'volaris', delay: 1500, want: /volaris|airline/i },
  { from: 'estudio', to: 'pg', delay: 800, want: /p&g|pg/i },
];
const WIDTHS = [
  { tag: 'phone-390', size: { width: 390, height: 844 }, touch: true },
  { tag: 'land-844', size: { width: 844, height: 390 }, touch: true },
  { tag: 'desk-1280', size: { width: 1280, height: 800 }, touch: false },
];

async function measureGround(browser) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: w.size, hasTouch: w.touch, isMobile: w.touch });
    const page = await ctx.newPage();
    await boot(page);
    for (const [gx, gy] of GROUND_GOALS) {
      await spawnDrive(page);
      await page.evaluate(() => window.__playtestQa.setZoom?.(0.4));
      await armSampler(page);
      await page.evaluate(([x, y]) => window.__playtestQa.jacDriveTo?.(x, y), [gx, gy]);
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < 20000) {
        last = await snapshot(page);
        const d = Math.hypot((last.cx ?? 0) - gx, (last.cy ?? 0) - gy);
        if (!last.goal && d <= 1.45 && last.mph < 2) {
          last = { ...last, ok: true, ms: Date.now() - t0, dist: d };
          break;
        }
        await wait(50);
      }
      if (!last?.ok) {
        last = {
          ...last,
          ok: false,
          ms: Date.now() - t0,
          dist: Math.hypot((last?.cx ?? 0) - gx, (last?.cy ?? 0) - gy),
        };
      }
      const samples = await readTrace(page);
      const trace = analyzeTrace(samples);
      const flips = headingFlips(samples);
      const ratio = pathRatio(samples, gx, gy);
      const jumpFail = trace.jumps.some((j) => j.kind === 'van');
      const wanderFail = ratio.ratio > 1.5 || flips.flips180 > 0;
      const ok = last.ok && !jumpFail && !wanderFail;
      log(
        `ground ${w.tag} (${gx},${gy}) ${ok ? 'OK' : 'FAIL'} ${last.ms}ms d=${last.dist?.toFixed?.(2)} ratio=${ratio.ratio.toFixed(2)} flips180=${flips.flips180} vanΔ=${trace.vanJump.toFixed(2)}`,
      );
      if (!ok) report.errors.push(`ground ${w.tag} (${gx},${gy}) failed`);
      report.ground.push({
        w: w.tag,
        gx,
        gy,
        ok,
        ms: last.ms,
        dist: last.dist,
        ratio: ratio.ratio,
        flips180: flips.flips180,
        vanJump: trace.vanJump,
      });
    }
    await ctx.close();
  }
}

async function measureRetarget(browser) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: w.size, hasTouch: w.touch, isMobile: w.touch });
    const page = await ctx.newPage();
    await boot(page);
    for (const pair of RETARGET_PAIRS) {
      await spawnDrive(page);
      await page.evaluate((n) => {
        window.__playtestQa.frameDoorForQa?.(n);
        window.__playtestQa.setZoom?.(0.12);
      }, pair.from);
      await armSampler(page);
      await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), pair.from);
      await wait(pair.delay);
      await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), pair.to);
      const end = await waitDone(page, 22000);
      const samples = await readTrace(page);
      const trace = analyzeTrace(samples);
      const jumpFail = trace.jumps.some((j) => j.kind === 'van' || j.kind === 'char');
      const hit = pair.want.test(end.panel || '') || pair.want.test(end.interior || '');
      const ok = end.ok && hit && !jumpFail && !end.driving;
      log(
        `retarget ${w.tag} ${pair.from}→${pair.to} ${ok ? 'OK' : 'FAIL'} ${end.ms}ms panel=${end.panel} driving=${end.driving} @${end.cx?.toFixed?.(2)},${end.cy?.toFixed?.(2)} vanΔ=${trace.vanJump.toFixed(2)}`,
      );
      if (!ok) report.errors.push(`retarget ${w.tag} ${pair.from}→${pair.to} failed`);
      report.retarget.push({ w: w.tag, pair: `${pair.from}→${pair.to}`, ok, ms: end.ms, panel: end.panel });
    }
    await ctx.close();
  }
}

async function shotDoor(browser, name, file) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await boot(page);
  const end = await driveOne(page, name);
  await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.focusJac?.();
    window.__playtestQa.setZoom?.(0.7);
  });
  await wait(200);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  log(`shot ${name} ok=${end.ok} ov=${end.parked?.overlap} -> ${file}`);
  await ctx.close();
  return path.join(OUT, file);
}

async function montage(files) {
  const { default: sharp } = await import('sharp').catch(() => ({ default: null }));
  const dest = path.join(OUT, 'montage390.png');
  if (!sharp) {
    log('sharp missing, skip montage stitch');
    return dest;
  }
  const bufs = await Promise.all(files.map((f) => sharp(f).resize(260, 260, { fit: 'cover' }).png().toBuffer()));
  const cols = 3;
  const w = 260;
  const h = 260;
  const rows = Math.ceil(bufs.length / cols);
  const composites = bufs.map((input, i) => ({
    input,
    left: (i % cols) * w,
    top: Math.floor(i / cols) * h,
  }));
  await sharp({
    create: { width: cols * w, height: rows * h, channels: 4, background: '#111' },
  })
    .composite(composites)
    .png()
    .toFile(dest);
  log('montage', dest);
  return dest;
}

const browser = await launchBrowser(chromium, { headless: true });
try {
  await measureViewport(browser, 'phone-390', { width: 390, height: 844 }, true);
  await measureViewport(browser, 'land-844', { width: 844, height: 390 }, true);
  await measureViewport(browser, 'desk-1280', { width: 1280, height: 800 }, false);
  await measureGround(browser);
  await measureRetarget(browser);
  const names = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
  const shots = [];
  for (const name of names) {
    shots.push(await shotDoor(browser, name, `parked-${name}.png`));
  }
  await montage(shots);
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, 'honest-report.json'), JSON.stringify(report, null, 2));
log(JSON.stringify({ errors: report.errors, doors: report.doors, ground: report.ground, retarget: report.retarget, overlap: report.overlap, hash: report.hash }, null, 2));
if (report.errors.length) process.exit(1);
