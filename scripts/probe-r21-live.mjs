#!/usr/bin/env node
/** r21 live /preview/ — one fresh browser per case, dsf 1, no zoom override. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r21');
const BASE =
  process.env.QA_BASE_URL ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(...a);

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
const RETARGET_REPS = 3;
const WIDTHS = [
  { tag: 'phone-390', size: { width: 390, height: 844 }, touch: true },
  { tag: 'land-844', size: { width: 844, height: 390 }, touch: true },
  { tag: 'desk-1280', size: { width: 1280, height: 800 }, touch: false },
];
const DOORS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];

const report = {
  base: BASE,
  hash: '',
  startedAt: new Date().toISOString(),
  doors: {},
  ground: [],
  retarget: [],
  errors: [],
};

const GL_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-gpu-rasterization',
  '--use-angle=swiftshader',
  '--max-active-webgl-contexts=1',
  '--force-device-scale-factor=1',
];

async function hideWebdriver(ctx) {
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
  });
}

async function cdpTouch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, radiusX: 8, radiusY: 8, force: 1, id: p.id ?? i + 1 })),
  });
}

async function realTap(page, cdp, x, y, touch) {
  if (touch) {
    await cdpTouch(cdp, 'touchStart', [{ x, y, id: 7 }]);
    await wait(35);
    await cdpTouch(cdp, 'touchEnd', []);
  } else {
    await page.mouse.click(x, y);
  }
  await wait(40);
}

function bootUrl() {
  return /[?&]npcs=/.test(BASE) ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}npcs=0`;
}

async function boot(page) {
  await page.goto(bootUrl(), { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 80; i++) {
    if (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) return;
    await wait(150);
  }
  throw new Error('qa api missing');
}

async function spawnDrive(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('es');
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
    window.__r21s = [];
    let last = performance.now();
    const tick = (t) => {
      const j = window.__playtestQa.jac();
      const c = window.__playtestQa.getCharacterPos?.() ?? { x: 0, y: 0 };
      const r = window.__playtestQa.inputReady();
      window.__r21s.push({
        dt: (window.__playtestQa.fps?.().elapsedMS ?? t - last) / 1000,
        t,
        cx: j.cx,
        cy: j.cy,
        heading: j.heading,
        vel: j.vel,
        mph: j.mph,
        max: j.maxTilesPerS ?? 5.29,
        driving: j.driving,
        goal: j.driveGoal,
        noProgressT: j.noProgressT ?? 0,
        px: c.x,
        py: c.y,
        interior: r.interior,
        panel: window.__playtestQa.openPanelTitle?.() ?? '',
      });
      last = t;
      if (window.__r21s.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function analyzeTrace(samples) {
  let vanJump = 0;
  const jumps = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(b.dt || 0, 1 / 120);
    const dVan = Math.hypot((b.cx ?? 0) - (a.cx ?? 0), (b.cy ?? 0) - (a.cy ?? 0));
    const cap = (b.max ?? 5.29) * dt + 0.22;
    if (dVan > vanJump) vanJump = dVan;
    if (dVan > 1 + 1e-4) jumps.push({ kind: 'van', d: dVan, cap, dt, i });
    let dh = (b.heading ?? 0) - (a.heading ?? 0);
    if (dh > 2) dh -= 4;
    if (dh < -2) dh += 4;
    const hCap = 2.4 * dt + 0.45;
    if (Math.abs(dh) > hCap) jumps.push({ kind: 'heading', d: Math.abs(dh), cap: hCap, i });
  }
  return { vanJump, jumps: jumps.slice(0, 8) };
}

function headingFlips(samples) {
  let flips180 = 0;
  let prev = null;
  for (const s of samples) {
    if (s.heading == null || !s.driving) continue;
    if (prev == null) {
      prev = s.heading;
      continue;
    }
    let dh = s.heading - prev;
    if (dh > 2) dh -= 4;
    if (dh < -2) dh += 4;
    if (Math.abs(dh) > 1.7) flips180 += 1;
    if (Math.abs(dh) > 0.35) prev = s.heading;
  }
  return flips180;
}

function pathMetrics(samples, gx, gy) {
  const start = samples.find((s) => {
    const g = s.goal;
    return g && Math.hypot(g.x - gx, g.y - gy) < 3;
  }) ?? samples[0];
  if (!start || samples.length < 2) {
    return { travel: 0, straight: 0, ratio: 0, maxNoProgressT: 0, goalClearedFar: false, prematureGetOut: false };
  }
  const i0 = samples.indexOf(start);
  let travel = 0;
  let maxNoProgressT = 0;
  let goalClearedFar = false;
  let prematureGetOut = false;
  let hadGoal = false;
  for (let i = i0 + 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    travel += Math.hypot((b.cx ?? 0) - (a.cx ?? 0), (b.cy ?? 0) - (a.cy ?? 0));
    maxNoProgressT = Math.max(maxNoProgressT, b.noProgressT ?? 0);
    const d = Math.hypot((b.cx ?? 0) - gx, (b.cy ?? 0) - gy);
    if (b.goal) hadGoal = true;
    if (hadGoal && !b.goal && d > 2.2 && (b.mph ?? 0) < 2) goalClearedFar = true;
    if (hadGoal && b.driving === false && d > 2.2 && !b.interior && !b.panel) prematureGetOut = true;
  }
  const straight = Math.hypot(gx - (start.cx ?? 0), gy - (start.cy ?? 0));
  return {
    travel,
    straight,
    ratio: straight > 0.2 ? travel / straight : 0,
    maxNoProgressT,
    goalClearedFar,
    prematureGetOut,
  };
}

function polylineLen(path, sx, sy) {
  if (!path?.length) return 0;
  let n = Math.hypot(path[0].x - sx, path[0].y - sy);
  for (let i = 1; i < path.length; i++) {
    n += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  }
  return n;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    return {
      driving: j.driving,
      goal: j.driveGoal,
      mph: j.mph,
      cx: j.cx,
      cy: j.cy,
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      overlap: window.__playtestQa.jacOverlapsProp(),
      sitWhy: j.sitWhy ?? '',
      noProgressT: j.noProgressT ?? 0,
    };
  });
}

function onScreen(pt, view) {
  return (
    !!pt &&
    !!view &&
    pt.x >= 8 &&
    pt.y >= 8 &&
    pt.x <= view.width - 8 &&
    pt.y <= view.height - 8
  );
}

async function tapDoor(page, cdp, name, touch) {
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
  }, name);
  await wait(180);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
  if (onScreen(pt, page.viewportSize())) await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(80);
  const hit = await page.evaluate((n) => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    const buildings = window.__playtestQa.getEnterableBuildings();
    const b = buildings.find((o) => o.name === n);
    const g = j.driveGoal;
    if (!b?.door) return { pending: !!r.pendingDrive, near: false, stolen: false };
    const own = g ? Math.hypot(g.x - b.door.x, g.y - b.door.y) : Infinity;
    const stolen = buildings.some((o) => {
      if (!o.door || o.name === n) return false;
      return g && Math.hypot(g.x - o.door.x, g.y - o.door.y) + 2.2 < own;
    });
    return { pending: !!r.pendingDrive, near: own < 12, stolen };
  }, name);
  if (!hit.pending || !hit.near || hit.stolen) {
    await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  }
}

async function tapTile(page, cdp, tx, ty, touch) {
  const info = await page.evaluate(([x, y]) => {
    window.__playtestQa.focusJac?.();
    const pt = window.__playtestQa.tileScreenPoint?.(x, y);
    const hit = pt ? window.__playtestQa.tileAtClient?.(pt.x, pt.y) : null;
    return { pt, hit };
  }, [tx, ty]);
  const matches =
    info.hit && Math.hypot((info.hit.x ?? 0) - tx, (info.hit.y ?? 0) - ty) < 1.2;
  if (onScreen(info.pt, page.viewportSize()) && matches) {
    await realTap(page, cdp, info.pt.x, info.pt.y, touch);
  }
  const going = await page.evaluate(([x, y]) => {
    const g = window.__playtestQa.jac().driveGoal;
    return !!g && Math.hypot(g.x - x, g.y - y) < 4;
  }, [tx, ty]);
  if (!going) {
    await page.evaluate(([x, y]) => {
      window.__playtestQa.tapMapTile?.(x, y);
      const g = window.__playtestQa.jac().driveGoal;
      if (!g || Math.hypot(g.x - x, g.y - y) >= 4) window.__playtestQa.jacDriveTo?.(x, y);
    }, [tx, ty]);
  }
}

async function waitEntered(page, timeout = 35000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snapshot(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if ((last.interior || last.panel) && away && !last.driving) return { ...last, ok: true, ms: Date.now() - t0 };
    const elapsed = Date.now() - t0;
    const crawling = last.goal && (last.mph ?? 0) > 0.2;
    if (elapsed > 9000 && !away && !crawling && !last.interior && !last.panel) {
      return { ...last, ok: false, ms: elapsed, why: 'never-left-spawn' };
    }
    await wait(50);
  }
  return { ...last, ok: false, ms: Date.now() - t0 };
}

async function waitArrive(page, gx, gy, timeout = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snapshot(page);
    const d = Math.hypot((last.cx ?? 0) - gx, (last.cy ?? 0) - gy);
    if (!last.goal && d <= 1.45 && last.mph < 2) return { ...last, ok: true, ms: Date.now() - t0, dist: d };
    await wait(50);
  }
  const d = Math.hypot((last?.cx ?? 0) - gx, (last?.cy ?? 0) - gy);
  return { ...last, ok: false, ms: Date.now() - t0, dist: d };
}

async function readTrace(page) {
  return page.evaluate(() => window.__r21s ?? []);
}

async function readHash(page) {
  return page.evaluate(() => document.querySelector('script[src*="assets/index-"]')?.src ?? '');
}

async function launchFresh(w) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    let browser;
    try {
      browser = await launchBrowser(chromium, { headless: true, args: GL_ARGS });
      const ctx = await browser.newContext({
        viewport: w.size,
        hasTouch: w.touch,
        isMobile: w.touch,
        deviceScaleFactor: 1,
      });
      await hideWebdriver(ctx);
      const page = await ctx.newPage();
      page.on('crash', () => log('page crash', w.tag));
      await boot(page);
      if (!report.hash) {
        report.hash = await readHash(page);
        log('hash', report.hash);
      }
      const cdp = await page.context().newCDPSession(page);
      return { browser, ctx, page, cdp };
    } catch (err) {
      lastErr = err;
      log('arm fail', w.tag, attempt, err?.message ?? err);
      try {
        await browser?.close();
      } catch {
        /* dead */
      }
    }
  }
  throw new Error(`could not arm ${w.tag}: ${lastErr?.message ?? lastErr}`);
}

async function closeFresh(armed) {
  try {
    await armed?.page?.close();
  } catch {
    /* already */
  }
  try {
    await armed?.ctx?.close();
  } catch {
    /* already */
  }
  try {
    await armed?.browser?.close();
  } catch {
    /* already */
  }
}

function fmt(n, d = 2) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—';
}

async function captureParked(page, w, name) {
  await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    if (window.__playtestQa.jac().driving) window.__playtestQa.jacGetOut?.();
    window.__playtestQa.focusJac?.();
    window.__playtestQa.setZoom?.(0.7);
  });
  await wait(200);
  const file = path.join(OUT, `parked-${w.tag}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function measureDoors() {
  for (const w of WIDTHS) {
    const rows = [];
    for (const name of DOORS) {
      let armed;
      try {
        armed = await launchFresh(w);
        const { page, cdp } = armed;
        await spawnDrive(page);
        await armSampler(page);
        await tapDoor(page, cdp, name, w.touch);
        const end = await waitEntered(page, 50000);
        const samples = await readTrace(page);
        const trace = analyzeTrace(samples);
        const jumpFail = trace.jumps.some((j) => j.kind === 'van');
        const leftSpawn = Math.hypot((end.cx ?? 0) - 25.5, (end.cy ?? 0) - 17) > 2.2;
        const ok = end.ok && !jumpFail && leftSpawn;
        log(
          `door ${w.tag} ${name} ${ok ? 'OK' : 'FAIL'} ${end.ms}ms @${fmt(end.cx)},${fmt(end.cy)} vanΔ=${fmt(trace.vanJump)} hops=${trace.jumps.length} why=${end.why ?? end.sitWhy ?? ''}`,
        );
        if (!ok) report.errors.push(`door ${w.tag} ${name}`);
        let shot = '';
        try {
          shot = await captureParked(page, w, name);
        } catch (err) {
          log('shot', w.tag, name, err?.message ?? err);
        }
        rows.push({
          name,
          ok,
          ms: end.ms,
          cx: end.cx,
          cy: end.cy,
          panel: end.panel,
          interior: end.interior,
          vanJump: trace.vanJump,
          hops: trace.jumps.length,
          overlap: end.overlap,
          why: end.why ?? '',
          shot,
        });
      } catch (err) {
        log(`door ${w.tag} ${name} CRASH ${err?.message ?? err}`);
        report.errors.push(`door ${w.tag} ${name}`);
        rows.push({ name, ok: false, crash: String(err?.message ?? err) });
      } finally {
        await closeFresh(armed);
      }
    }
    report.doors[w.tag] = rows;
  }
}

async function measureGround() {
  for (const w of WIDTHS) {
    for (const [gx, gy] of GROUND_GOALS) {
      let armed;
      try {
        armed = await launchFresh(w);
        const { page, cdp } = armed;
        await spawnDrive(page);
        const planned = await page.evaluate(([x, y]) => {
          const j = window.__playtestQa.jac();
          const path = window.__playtestQa.jacFindDrivePath?.(x, y, true);
          return { cx: j.cx, cy: j.cy, path };
        }, [gx, gy]);
        const straight = Math.hypot(gx - (planned.cx ?? 0), gy - (planned.cy ?? 0));
        const plannedLen = polylineLen(planned.path, planned.cx, planned.cy);
        const plannedRatio = straight > 0.2 ? plannedLen / straight : 0;
        await armSampler(page);
        await tapTile(page, cdp, gx, gy, w.touch);
        const end = await waitArrive(page, gx, gy);
        const samples = await readTrace(page);
        const trace = analyzeTrace(samples);
        const metrics = pathMetrics(samples, gx, gy);
        const flips = headingFlips(samples);
        const jumpFail = trace.jumps.some((j) => j.kind === 'van');
        const stallSafe = !metrics.goalClearedFar && !metrics.prematureGetOut && metrics.maxNoProgressT < 4.8;
        const pathOk = metrics.ratio <= 1.5 || (plannedRatio > 1.5 && metrics.ratio <= plannedRatio + 0.12);
        const ok = end.ok && !jumpFail && pathOk && flips === 0 && stallSafe;
        log(
          `ground ${w.tag} (${gx},${gy}) ${ok ? 'OK' : 'FAIL'} ${end.ms}ms d=${fmt(end.dist)} travel=${fmt(metrics.ratio)}× planned=${fmt(plannedRatio)}× flips180=${flips} stall=${fmt(metrics.maxNoProgressT)} clearedFar=${metrics.goalClearedFar} getOut=${metrics.prematureGetOut}`,
        );
        if (!ok) report.errors.push(`ground ${w.tag} (${gx},${gy})`);
        report.ground.push({
          w: w.tag,
          gx,
          gy,
          ok,
          ms: end.ms,
          dist: end.dist,
          ratio: metrics.ratio,
          travel: metrics.travel,
          straight,
          plannedLen,
          plannedRatio,
          flips180: flips,
          vanJump: trace.vanJump,
          maxNoProgressT: metrics.maxNoProgressT,
          goalClearedFar: metrics.goalClearedFar,
          prematureGetOut: metrics.prematureGetOut,
          pathN: planned.path?.length ?? 0,
        });
      } catch (err) {
        log(`ground ${w.tag} (${gx},${gy}) CRASH ${err?.message ?? err}`);
        report.errors.push(`ground ${w.tag} (${gx},${gy})`);
        report.ground.push({ w: w.tag, gx, gy, ok: false, crash: String(err?.message ?? err) });
      } finally {
        await closeFresh(armed);
      }
    }
  }
}

async function measureRetarget() {
  for (const w of WIDTHS) {
    for (const pair of RETARGET_PAIRS) {
      for (let rep = 1; rep <= RETARGET_REPS; rep++) {
        let armed;
        try {
          armed = await launchFresh(w);
          const { page, cdp } = armed;
          await spawnDrive(page);
          if (w.tag !== 'desk-1280') await armSampler(page);
          await tapDoor(page, cdp, pair.from, w.touch);
          await wait(pair.delay);
          const mid = await snapshot(page);
          await tapDoor(page, cdp, pair.to, w.touch);
          const after = await snapshot(page);
          const end = await waitEntered(page, 35000);
          const samples = await readTrace(page);
          const trace = analyzeTrace(samples);
          const jumpFail = trace.jumps.some((j) => j.kind === 'van');
          const hit = pair.want.test(end.panel || '') || pair.want.test(end.interior || '');
          const leftSpawn = Math.hypot((end.cx ?? 0) - 25.5, (end.cy ?? 0) - 17) > 2.2;
          const ok = end.ok && hit && !jumpFail && !end.driving && leftSpawn;
          log(
            `retarget ${w.tag} ${pair.from}→${pair.to} #${rep} ${ok ? 'OK' : 'FAIL'} ${end.ms}ms panel=${end.panel} int=${end.interior} driving=${end.driving} @${fmt(end.cx)},${fmt(end.cy)} mid@${fmt(mid.cx)},${fmt(mid.cy)} goal=${JSON.stringify(after.goal)} vanΔ=${fmt(trace.vanJump)}`,
          );
          if (!ok) report.errors.push(`retarget ${w.tag} ${pair.from}→${pair.to} #${rep}`);
          report.retarget.push({
            w: w.tag,
            pair: `${pair.from}→${pair.to}`,
            rep,
            ok,
            ms: end.ms,
            panel: end.panel,
            interior: end.interior,
            cx: end.cx,
            cy: end.cy,
            midCx: mid.cx,
            midCy: mid.cy,
            goal: after.goal,
            why: end.why ?? '',
          });
        } catch (err) {
          log(`retarget ${w.tag} ${pair.from}→${pair.to} #${rep} CRASH ${err?.message ?? err}`);
          report.errors.push(`retarget ${w.tag} ${pair.from}→${pair.to} #${rep}`);
          report.retarget.push({
            w: w.tag,
            pair: `${pair.from}→${pair.to}`,
            rep,
            ok: false,
            crash: String(err?.message ?? err),
          });
        } finally {
          await closeFresh(armed);
        }
      }
    }
  }
}

async function composeMontage(tag, destName) {
  const dest = path.join(OUT, destName);
  const files = DOORS.map((name) => path.join(OUT, `parked-${tag}-${name}.png`)).filter((f) => fs.existsSync(f));
  if (files.length === 0) {
    log('montage skip', destName, 'no parked shots');
    return dest;
  }
  const { default: sharp } = await import('sharp').catch(() => ({ default: null }));
  if (sharp) {
    const bufs = await Promise.all(files.map((f) => sharp(f).resize(260, 260, { fit: 'cover' }).png().toBuffer()));
    await sharp({ create: { width: 780, height: 780, channels: 4, background: '#111' } })
      .composite(bufs.map((input, i) => ({ input, left: (i % 3) * 260, top: Math.floor(i / 3) * 260 })))
      .png()
      .toFile(dest);
    log('montage', dest);
    return dest;
  }
  const { execFileSync } = await import('node:child_process');
  execFileSync('montage', [
    ...files,
    '-tile',
    '3x3',
    '-geometry',
    '260x260+0+0',
    '-background',
    '#111111',
    dest,
  ]);
  log('montage', dest);
  return dest;
}

function mdEscape(v) {
  return String(v ?? '').replace(/\|/g, '/');
}

function tableForWidth(tag) {
  const lines = [`## ${tag}`, '', '| kind | target | ok | ms | pos | extra |', '| --- | --- | --- | --- | --- | --- |'];
  for (const row of report.doors[tag] ?? []) {
    lines.push(
      `| door | ${row.name} | ${row.ok ? 'OK' : 'FAIL'} | ${row.ms ?? '—'} | ${fmt(row.cx)},${fmt(row.cy)} | hops=${row.hops ?? '—'} ${mdEscape(row.why || row.crash || row.panel || '')} |`,
    );
  }
  for (const row of report.ground.filter((g) => g.w === tag)) {
    lines.push(
      `| ground | (${row.gx},${row.gy}) | ${row.ok ? 'OK' : 'FAIL'} | ${row.ms ?? '—'} | d=${fmt(row.dist)} | travel=${fmt(row.ratio)}× planned=${fmt(row.plannedRatio)}× stall=${fmt(row.maxNoProgressT)} getOut=${row.prematureGetOut ?? false} ${mdEscape(row.crash || '')} |`,
    );
  }
  for (const row of report.retarget.filter((g) => g.w === tag)) {
    lines.push(
      `| retarget | ${row.pair} #${row.rep} | ${row.ok ? 'OK' : 'FAIL'} | ${row.ms ?? '—'} | ${fmt(row.cx)},${fmt(row.cy)} | ${mdEscape(row.panel || row.why || row.crash || '')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

function writeTables() {
  const parts = [
    `# r21 live ${report.hash}`,
    '',
    `base: ${report.base}`,
    `errors: ${report.errors.length}`,
    '',
    ...WIDTHS.map((w) => tableForWidth(w.tag)),
  ];
  const dest = path.join(OUT, 'tables.md');
  fs.writeFileSync(dest, parts.join('\n'));
  log('\n' + parts.join('\n'));
  return dest;
}

try {
  await measureRetarget();
  if (!process.env.R21_ONLY) {
    await measureGround();
    await measureDoors();
    await composeMontage('phone-390', 'montage390.png');
    await composeMontage('desk-1280', 'montage1280.png');
  }
} finally {
  report.finishedAt = new Date().toISOString();
}
fs.writeFileSync(path.join(OUT, 'r21-live.json'), JSON.stringify(report, null, 2));
writeTables();
log('errors', report.errors.length, report.errors);
log('hash', report.hash);
if (report.errors.length) process.exitCode = 1;
