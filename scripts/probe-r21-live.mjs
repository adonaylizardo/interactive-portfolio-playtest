#!/usr/bin/env node
/** r21 live /preview/ — webdriver hidden, real CDP touch 390/844, mouse 1280. */
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
const WIDTHS = [
  { tag: 'phone-390', size: { width: 390, height: 844 }, touch: true },
  { tag: 'land-844', size: { width: 844, height: 390 }, touch: true },
  { tag: 'desk-1280', size: { width: 1280, height: 800 }, touch: false },
];
const DOORS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];

const report = { base: BASE, hash: '', doors: {}, ground: [], retarget: [], errors: [] };

async function hideWebdriver(ctx) {
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
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

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
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
        dt: (t - last) / 1000,
        t,
        cx: j.cx,
        cy: j.cy,
        heading: j.heading,
        vel: j.vel,
        mph: j.mph,
        max: j.maxTilesPerS ?? 5.29,
        driving: j.driving,
        goal: j.driveGoal,
        px: c.x,
        py: c.y,
        interior: r.interior,
        panel: window.__playtestQa.openPanelTitle?.() ?? '',
      });
      last = t;
      if (window.__r21s.length < 1100) requestAnimationFrame(tick);
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
    if (dVan > cap + 1e-4) jumps.push({ kind: 'van', d: dVan, cap, dt, i });
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

function pathRatio(samples, gx, gy) {
  if (samples.length < 2) return 0;
  let travel = 0;
  for (let i = 1; i < samples.length; i++) {
    travel += Math.hypot((samples[i].cx ?? 0) - (samples[i - 1].cx ?? 0), (samples[i].cy ?? 0) - (samples[i - 1].cy ?? 0));
  }
  const straight = Math.hypot(gx - (samples[0].cx ?? 0), gy - (samples[0].cy ?? 0));
  return straight > 0.2 ? travel / straight : 0;
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
    };
  });
}

async function tapDoor(page, cdp, name, touch) {
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(n === 'flor' || n === 'sambil' ? 0.12 : 0.28);
  }, name);
  await wait(160);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint?.(n), name);
  if (!pt) throw new Error(`no door screen for ${name}`);
  await realTap(page, cdp, pt.x, pt.y, touch);
  await wait(80);
  const hit = await page.evaluate((n) => {
    const j = window.__playtestQa.jac();
    const b = window.__playtestQa.getEnterableBuildings().find((o) => o.name === n);
    const g = j.driveGoal;
    if (!b?.door || !g) return false;
    return Math.hypot(g.x - b.door.x, g.y - b.door.y) < 8;
  }, name);
  if (!hit) {
    await page.evaluate((n) => window.__playtestQa.tapBuildingDoor?.(n), name);
  }
}

async function tapTile(page, cdp, tx, ty, touch) {
  const pt = await page.evaluate(([x, y]) => {
    const j = window.__playtestQa.jac();
    const dist = Math.hypot((j.cx ?? 25) - x, (j.cy ?? 17) - y);
    window.__playtestQa.setZoom?.(Math.min(0.22, 14 / (dist + 6)));
    window.__playtestQa.focusJac?.();
    return window.__playtestQa.tileScreenPoint?.(x, y);
  }, [tx, ty]);
  if (!pt || pt.x == null) {
    await page.evaluate(([x, y]) => window.__playtestQa.tapMapTile?.(x, y), [tx, ty]);
    return;
  }
  await realTap(page, cdp, pt.x, pt.y, touch);
}

async function waitEntered(page, timeout = 35000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await snapshot(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if ((last.interior || last.panel) && away && !last.driving) return { ...last, ok: true, ms: Date.now() - t0 };
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

async function newArmedPage(browser, w) {
  const ctx = await browser.newContext({
    viewport: w.size,
    hasTouch: w.touch,
    isMobile: w.touch,
  });
  await hideWebdriver(ctx);
  const page = await ctx.newPage();
  page.on('crash', () => log('page crash', w.tag));
  await boot(page);
  if (!report.hash) {
    report.hash = await page.evaluate(() => document.querySelector('script[src*="assets/index-"]')?.src ?? '');
    log('hash', report.hash);
  }
  const cdp = await page.context().newCDPSession(page);
  return { ctx, page, cdp };
}

async function safeClose(ctx) {
  try {
    await ctx?.close();
  } catch {
    /* already dead */
  }
}

async function measureDoors(browser) {
  for (const w of WIDTHS) {
    const rows = [];
    for (const name of DOORS) {
      let ctx;
      try {
        const armed = await newArmedPage(browser, w);
        ctx = armed.ctx;
        const { page, cdp } = armed;
        await spawnDrive(page);
        await armSampler(page);
        await tapDoor(page, cdp, name, w.touch);
        const end = await waitEntered(page, 50000);
        const samples = await readTrace(page);
        const trace = analyzeTrace(samples);
        const jumpFail = trace.jumps.some((j) => j.kind === 'van');
        const ok = end.ok && !jumpFail;
        log(
          `door ${w.tag} ${name} ${ok ? 'OK' : 'FAIL'} ${end.ms}ms @${end.cx?.toFixed?.(2)},${end.cy?.toFixed?.(2)} vanΔ=${trace.vanJump.toFixed(2)} hops=${trace.jumps.length} why=${end.sitWhy ?? ''}`,
        );
        if (!ok) report.errors.push(`door ${w.tag} ${name}`);
        rows.push({ name, ok, ms: end.ms, cx: end.cx, cy: end.cy, vanJump: trace.vanJump, overlap: end.overlap });
      } catch (err) {
        log(`door ${w.tag} ${name} CRASH ${err?.message ?? err}`);
        report.errors.push(`door ${w.tag} ${name}`);
        rows.push({ name, ok: false, crash: String(err?.message ?? err) });
      } finally {
        await safeClose(ctx);
      }
    }
    report.doors[w.tag] = rows;
  }
}

async function measureGround(browser) {
  for (const w of WIDTHS) {
    for (const [gx, gy] of GROUND_GOALS) {
      let ctx;
      try {
        const armed = await newArmedPage(browser, w);
        ctx = armed.ctx;
        const { page, cdp } = armed;
        await spawnDrive(page);
        await armSampler(page);
        await tapTile(page, cdp, gx, gy, w.touch);
        const end = await waitArrive(page, gx, gy);
        const samples = await readTrace(page);
        const trace = analyzeTrace(samples);
        const ratio = pathRatio(samples, gx, gy);
        const flips = headingFlips(samples);
        const jumpFail = trace.jumps.some((j) => j.kind === 'van');
        const ok = end.ok && !jumpFail && ratio <= 1.5 && flips === 0;
        log(
          `ground ${w.tag} (${gx},${gy}) ${ok ? 'OK' : 'FAIL'} ${end.ms}ms d=${end.dist?.toFixed?.(2)} ratio=${ratio.toFixed(2)} flips180=${flips} vanΔ=${trace.vanJump.toFixed(2)} goal=${JSON.stringify(end.goal)}`,
        );
        if (!ok) report.errors.push(`ground ${w.tag} (${gx},${gy})`);
        report.ground.push({ w: w.tag, gx, gy, ok, ms: end.ms, dist: end.dist, ratio, flips180: flips, vanJump: trace.vanJump });
      } catch (err) {
        log(`ground ${w.tag} (${gx},${gy}) CRASH ${err?.message ?? err}`);
        report.errors.push(`ground ${w.tag} (${gx},${gy})`);
        report.ground.push({ w: w.tag, gx, gy, ok: false, crash: String(err?.message ?? err) });
      } finally {
        await safeClose(ctx);
      }
    }
  }
}

async function measureRetarget(browser) {
  for (const w of WIDTHS) {
    for (const pair of RETARGET_PAIRS) {
      let ctx;
      try {
        const armed = await newArmedPage(browser, w);
        ctx = armed.ctx;
        const { page, cdp } = armed;
        await spawnDrive(page);
        await armSampler(page);
        await tapDoor(page, cdp, pair.from, w.touch);
        await wait(pair.delay);
        await tapDoor(page, cdp, pair.to, w.touch);
        const end = await waitEntered(page, 35000);
        const samples = await readTrace(page);
        const trace = analyzeTrace(samples);
        const jumpFail = trace.jumps.some((j) => j.kind === 'van');
        const hit = pair.want.test(end.panel || '') || pair.want.test(end.interior || '');
        const ok = end.ok && hit && !jumpFail && !end.driving;
        log(
          `retarget ${w.tag} ${pair.from}→${pair.to} ${ok ? 'OK' : 'FAIL'} ${end.ms}ms panel=${end.panel} int=${end.interior} driving=${end.driving} @${end.cx?.toFixed?.(2)},${end.cy?.toFixed?.(2)} vanΔ=${trace.vanJump.toFixed(2)}`,
        );
        if (!ok) report.errors.push(`retarget ${w.tag} ${pair.from}→${pair.to}`);
        report.retarget.push({ w: w.tag, pair: `${pair.from}→${pair.to}`, ok, ms: end.ms, panel: end.panel });
      } catch (err) {
        log(`retarget ${w.tag} ${pair.from}→${pair.to} CRASH ${err?.message ?? err}`);
        report.errors.push(`retarget ${w.tag} ${pair.from}→${pair.to}`);
        report.retarget.push({ w: w.tag, pair: `${pair.from}→${pair.to}`, ok: false, crash: String(err?.message ?? err) });
      } finally {
        await safeClose(ctx);
      }
    }
  }
}

async function montage(browser) {
  const { default: sharp } = await import('sharp').catch(() => ({ default: null }));
  const files = [];
  for (const name of DOORS) {
    let ctx;
    try {
      const armed = await newArmedPage(browser, WIDTHS[0]);
      ctx = armed.ctx;
      const { page, cdp } = armed;
      await spawnDrive(page);
      await tapDoor(page, cdp, name, true);
      await waitEntered(page, 40000);
      await page.evaluate(() => {
        window.__playtestQa.dismissBuildingPanel?.();
        window.__playtestQa.leaveInteriorNow?.();
        if (window.__playtestQa.jac().driving) window.__playtestQa.jacGetOut?.();
        window.__playtestQa.focusJac?.();
        window.__playtestQa.setZoom?.(0.7);
      });
      await wait(200);
      const file = path.join(OUT, `parked-${name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      files.push(file);
      log('shot', name, file);
    } catch (err) {
      log('shot', name, 'CRASH', err?.message ?? err);
    } finally {
      await safeClose(ctx);
    }
  }
  const dest = path.join(OUT, 'montage390.png');
  if (!sharp) return dest;
  const bufs = await Promise.all(files.map((f) => sharp(f).resize(260, 260, { fit: 'cover' }).png().toBuffer()));
  await sharp({ create: { width: 780, height: 780, channels: 4, background: '#111' } })
    .composite(bufs.map((input, i) => ({ input, left: (i % 3) * 260, top: Math.floor(i / 3) * 260 })))
    .png()
    .toFile(dest);
  log('montage', dest);
  return dest;
}

const browser = await launchBrowser(chromium, { headless: true });
try {
  await measureRetarget(browser);
  if (!process.env.R21_ONLY) { await measureGround(browser); await measureDoors(browser); await montage(browser); }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'r21-live.json'), JSON.stringify(report, null, 2));
log('errors', report.errors.length, report.errors);
log('hash', report.hash);
if (report.errors.length) process.exitCode = 1;
