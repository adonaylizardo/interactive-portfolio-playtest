#!/usr/bin/env node
/** r20: park freeze, tap-drive tiles/frame, prop overlap, sideways stick, Mentoría pill. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r20');
const PORT = Number(process.env.QA_PREVIEW_PORT ?? 4173);
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const DRIVE_TILES_PER_S = 4.5 * 1.15;
const MAX_FRAME_DT = 0.25;
const LEGAL_STEP = DRIVE_TILES_PER_S * MAX_FRAME_DT + 0.08;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const notes = [];
const report = {
  base: BASE,
  errors,
  notes,
  parkMs: {},
  tapLongtask: {},
  tilesPerFrame: {},
  overlap: {},
  stick: {},
  pill: {},
};

async function waitUntil(page, fn, timeout = 16000, step = 80) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
}

async function realTap(page, x, y, touch) {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await wait(40);
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitUntil(page, async () => (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) || null);
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('es');
  });
}

async function spawnDrive(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.setCharacterTile?.(s.center.x + 2, s.center.y);
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
  });
}

async function names(page) {
  return page.evaluate(() =>
    window.__playtestQa.getEnterableBuildings().filter((b) => b.door).map((b) => b.name),
  );
}

async function throttleCpu(page, rate) {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  return client;
}

async function measureParkApi(page) {
  await spawnDrive(page);
  const rows = await page.evaluate(() => {
    const list = window.__playtestQa.getEnterableBuildings().filter((b) => b.door);
    const out = [];
    for (const b of list) {
      const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
      const j = window.__playtestQa.jac();
      out.push({
        name: b.name,
        ms: sit?.ms ?? j.lastParkMs ?? 0,
        x: sit?.x ?? null,
        y: sit?.y ?? null,
        door: b.door,
      });
    }
    return out;
  });
  report.parkMs.api = rows;
  for (const r of rows) {
    notes.push(`park-api ${r.name}: ${r.ms.toFixed(2)} ms → (${r.x},${r.y})`);
    if (r.ms > 16) errors.push(`park-api:${r.name}: ${r.ms.toFixed(2)} ms (want <16)`);
  }
  return rows;
}

async function measureParkTap(page, tag, touch) {
  const list = await names(page);
  const rows = [];
  for (const name of list) {
    await spawnDrive(page);
    await page.evaluate(() => {
      window.__r20lt = [];
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__r20lt.push(e.duration);
      });
      obs.observe({ type: 'longtask', buffered: true });
      window.__r20obs = obs;
    });
    await page.evaluate((n) => {
      window.__playtestQa.frameDoorForQa?.(n);
      window.__playtestQa.setZoom?.(0.3);
    }, name);
    await wait(80);
    const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
    const t0 = await page.evaluate(() => performance.now());
    if (pt) await realTap(page, pt.x, pt.y, touch);
    const timed = await page.evaluate((t0) => {
      const j = window.__playtestQa.jac();
      return {
        wall: performance.now() - t0,
        parkMs: j?.lastParkMs ?? 0,
        longtask: Math.max(0, ...(window.__r20lt ?? [])),
      };
    }, t0);
    rows.push({ name, ...timed });
    notes.push(`${tag}:tap ${name}: park=${timed.parkMs.toFixed(2)} wall=${timed.wall.toFixed(0)} lt=${timed.longtask.toFixed(0)}`);
    if (timed.parkMs > 16) errors.push(`${tag}:tap:${name}: park ${timed.parkMs.toFixed(2)} ms (want <16)`);
    if (timed.longtask > 80) errors.push(`${tag}:tap:${name}: longtask ${timed.longtask.toFixed(0)} ms`);
  }
  report.tapLongtask[tag] = rows;
}

async function startTrace(page) {
  await page.evaluate((cap) => {
    const j = window.__playtestQa.jac();
    window.__r20tr = {
      cap,
      max: 0,
      n: 0,
      samples: [],
      prev: { x: j.cx, y: j.cy, t: performance.now() },
    };
    const step = () => {
      const tr = window.__r20tr;
      if (!tr || tr.stop) return;
      const jj = window.__playtestQa.jac();
      const now = performance.now();
      const d = Math.hypot(jj.cx - tr.prev.x, jj.cy - tr.prev.y);
      const dt = (now - tr.prev.t) / 1000;
      tr.max = Math.max(tr.max, d);
      tr.n += 1;
      if (tr.samples.length < 80) tr.samples.push({ x: jj.cx, y: jj.cy, d, dt, mph: jj.mph });
      tr.prev = { x: jj.cx, y: jj.cy, t: now };
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, LEGAL_STEP);
}

async function readTrace(page) {
  return page.evaluate(() => {
    const tr = window.__r20tr;
    if (tr) tr.stop = true;
    const j = window.__playtestQa.jac();
    return {
      max: tr?.max ?? 0,
      n: tr?.n ?? 0,
      samples: tr?.samples ?? [],
      cx: j.cx,
      cy: j.cy,
      goal: j.driveGoal,
    };
  });
}

async function driveToTile(page, tag, gx, gy, touch) {
  await spawnDrive(page);
  await page.evaluate(() => window.__playtestQa.setZoom?.(0.4));
  await startTrace(page);
  await page.evaluate((t) => window.__playtestQa.jacDriveTo(t.gx, t.gy), { gx, gy });
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const j = await page.evaluate(() => {
      const s = window.__playtestQa.jac();
      return { goal: s.driveGoal, mph: s.mph, cx: s.cx, cy: s.cy };
    });
    if (!j.goal && Math.hypot(j.cx - gx, j.cy - gy) < 1.6) break;
    await wait(40);
  }
  const tr = await readTrace(page);
  const row = { tag, dest: `${gx},${gy}`, max: tr.max, n: tr.n, cx: tr.cx, cy: tr.cy };
  report.tilesPerFrame[`${tag}:${gx},${gy}`] = row;
  notes.push(`${tag} →(${gx},${gy}) maxStep=${tr.max.toFixed(3)} legal=${LEGAL_STEP.toFixed(3)}`);
  if (tr.max > LEGAL_STEP) errors.push(`${tag}:tiles:${gx},${gy}: max ${tr.max.toFixed(3)} > ${LEGAL_STEP.toFixed(3)}`);
}

async function driveDoorSteps(page, tag, name, touch) {
  await spawnDrive(page);
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(n === 'flor' ? 0.12 : 0.3);
  }, name);
  await wait(80);
  await startTrace(page);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  if (pt) await realTap(page, pt.x, pt.y, touch);
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) {
    const j = await page.evaluate(() => {
      const s = window.__playtestQa.jac();
      return { driving: s.driving, goal: s.driveGoal, mph: s.mph };
    });
    if (!j.goal && j.mph < 1.2) break;
    if (!j.driving) break;
    await wait(40);
  }
  const tr = await readTrace(page);
  report.tilesPerFrame[`${tag}:door:${name}`] = { max: tr.max, n: tr.n, cx: tr.cx, cy: tr.cy };
  notes.push(`${tag} door ${name} maxStep=${tr.max.toFixed(3)}`);
  if (tr.max > LEGAL_STEP) errors.push(`${tag}:tiles:door:${name}: max ${tr.max.toFixed(3)} > ${LEGAL_STEP.toFixed(3)}`);
}

async function measureOverlap(page) {
  const list = await names(page);
  const rows = [];
  for (const name of list) {
    await spawnDrive(page);
    const row = await page.evaluate((n) => {
      const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
      const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
      if (sit) {
        window.__playtestQa.jacSet?.({
          cx: sit.x,
          cy: sit.y,
          dir: sit.heading ?? window.__playtestQa.jac().dir,
          mode: 'parked',
        });
      }
      const j = window.__playtestQa.jac();
      const inward = b.inward;
      const ox = inward ? -inward.x : 0;
      const oy = inward ? -inward.y : 1;
      const along = (j.cx - b.door.x) * ox + (j.cy - b.door.y) * oy;
      return {
        name: n,
        cx: j.cx,
        cy: j.cy,
        d: Math.hypot(j.cx - b.door.x, j.cy - b.door.y),
        along,
        overlap: window.__playtestQa.jacOverlapsProp(),
        ms: sit?.ms ?? j.lastParkMs,
      };
    }, name);
    rows.push(row);
    notes.push(`overlap ${name}: ${row.overlap} @${row.cx.toFixed(1)},${row.cy.toFixed(1)} d=${row.d.toFixed(1)} along=${row.along.toFixed(1)}`);
    if (row.overlap) errors.push(`overlap:${name}: parked van covers a prop`);
    if (row.along < -0.2) errors.push(`overlap:${name}: behind house along=${row.along.toFixed(2)}`);
    if (name === 'flor' && row.d > 5.5) errors.push(`overlap:flor: ${row.d.toFixed(1)} tiles (want ≤5)`);
    if (row.d > 8) errors.push(`overlap:${name}: sit ${row.d.toFixed(1)} tiles from door`);
  }
  report.overlap = rows;
}

async function measureStick(page) {
  await spawnDrive(page);
  const row = await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('D');
    let last = { mph: 0, cx: 0, cy: 0 };
    for (let i = 0; i < 90; i++) {
      last = window.__playtestQa.jacDriveStep?.(1 / 60, -60, -10, { render: false }) ?? last;
    }
    return last;
  });
  report.stick = row;
  notes.push(`stick (-60,-10) mph=${row.mph} @${row.cx.toFixed(2)},${row.cy.toFixed(2)}`);
  if (row.mph < 9) errors.push(`stick: mph ${row.mph} (want 9–10)`);
}

async function measurePill(page) {
  await spawnDrive(page);
  await page.evaluate(() => {
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === 'mentoria');
    const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
    if (sit) window.__playtestQa.jacSet?.({ cx: sit.x, cy: sit.y, dir: 'sw', mode: 'parked' });
    window.__playtestQa.jacGetOut?.();
    window.__playtestQa.setZoom?.(1.2);
    window.__playtestQa.focusJac?.();
  });
  await wait(120);
  const row = await page.evaluate(() => {
    const labels = window.__playtestQa.nameLabels();
    const ad = labels.find((l) => l.id === 'adonay');
    const jac = labels.find((l) => l.id === 'jac');
    const d = ad && jac && ad.visible && jac.visible ? Math.hypot(ad.x - jac.x, ad.y - jac.y) : Infinity;
    return { ad, jac, d };
  });
  report.pill = row;
  notes.push(`pill Mentoría d=${Number.isFinite(row.d) ? row.d.toFixed(1) : 'hidden'} ad=${row.ad?.visible} jac=${row.jac?.visible}`);
  if (row.ad?.visible && row.jac?.visible && row.d < 40) {
    errors.push(`pill: Adonay over van roof d=${row.d.toFixed(1)}`);
  }
}

async function runViewport(browser, tag, size, touch) {
  const ctx = await browser.newContext({
    viewport: size,
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await throttleCpu(page, 4);
  await boot(page);
  if (tag === 'phone-390') {
    await measureParkApi(page);
    await measureParkTap(page, tag, touch);
    await driveToTile(page, tag, 18, 10, touch);
    await driveToTile(page, tag, 20, 13, touch);
    await driveDoorSteps(page, tag, 'mentoria', touch);
    await driveDoorSteps(page, tag, 'pg', touch);
    await driveDoorSteps(page, tag, 'flor', touch);
    await measureOverlap(page);
    await measureStick(page);
    await measurePill(page);
  } else if (tag === 'land-844') {
    await measureParkTap(page, tag, touch);
    await driveToTile(page, tag, 20, 13, touch);
    await measureStick(page);
  } else {
    await measureParkTap(page, tag, touch);
    await driveToTile(page, tag, 18, 10, touch);
    await driveToTile(page, tag, 20, 13, touch);
    await measureStick(page);
  }
  await page.screenshot({ path: path.join(OUT, `${tag}.png`), fullPage: true });
  await ctx.close();
}

async function ensurePreview() {
  if (process.env.QA_BASE_URL) return null;
  try {
    if ((await fetch(BASE)).ok) return null;
  } catch {
    /* start one */
  }
  const preview = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return preview;
    } catch {
      /* wait */
    }
    await wait(250);
  }
  preview.kill('SIGKILL');
  throw new Error(`preview did not start at ${BASE}`);
}

const preview = await ensurePreview();
const browser = await launchBrowser(chromium, { headless: true });
try {
  await runViewport(browser, 'phone-390', { width: 390, height: 844 }, true);
  await runViewport(browser, 'land-844', { width: 844, height: 390 }, true);
  await runViewport(browser, 'desk-1280', { width: 1280, height: 800 }, false);
} finally {
  await browser.close();
  preview?.kill('SIGKILL');
}

fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ errors: errors.length, notes, parkMs: report.parkMs, tap: report.tapLongtask, steps: report.tilesPerFrame, overlap: report.overlap, stick: report.stick, pill: report.pill }, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
