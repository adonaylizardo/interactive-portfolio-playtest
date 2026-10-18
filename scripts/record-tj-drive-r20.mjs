#!/usr/bin/env node
/** r20: door-drive completion, sprite overlap, longtask+rAF, stick mph, ES case copy. */
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const notes = [];
const report = {
  base: BASE,
  errors,
  notes,
  doors: {},
  overlap: {},
  tapLongtask: {},
  stick: {},
  caseEs: {},
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
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
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

async function armTapMetrics(page) {
  await page.evaluate(() => {
    window.__r20lt = [];
    window.__r20raf = [];
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__r20lt.push(e.duration);
    });
    obs.observe({ type: 'longtask', buffered: false });
    window.__r20obs = obs;
    let last = performance.now();
    let n = 0;
    const tick = (t) => {
      window.__r20raf.push(t - last);
      last = t;
      n += 1;
      if (n < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function readTapMetrics(page) {
  return page.evaluate(() => {
    window.__r20obs?.disconnect?.();
    const lt = window.__r20lt ?? [];
    const raf = window.__r20raf ?? [];
    return {
      longtask: lt.length ? Math.max(...lt) : 0,
      longtasks: lt.slice().sort((a, b) => b - a).slice(0, 5),
      rafMax: raf.length ? Math.max(...raf) : 0,
    };
  });
}

async function waitDoorDone(page, timeout = 30000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      const r = window.__playtestQa.inputReady();
      const panel = window.__playtestQa.openPanelTitle?.() ?? '';
      return {
        driving: j.driving,
        goal: j.driveGoal,
        mph: j.mph,
        cx: j.cx,
        cy: j.cy,
        gear: j.gear,
        pathN: j.pathN,
        interior: r.interior,
        pendingWalk: r.pendingWalk,
        panel,
        preview: !!window.__playtestQa.isCasePreview?.(),
      };
    });
    if (last.interior || last.preview || last.panel) return { ...last, done: true, ms: Date.now() - t0 };
    await wait(50);
  }
  return { ...last, done: false, ms: Date.now() - t0 };
}

async function driveDoor(page, name, touch, { tap = false, cpu } = {}) {
  await spawnDrive(page);
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(n === 'flor' || n === 'sambil' ? 0.12 : 0.28);
  }, name);
  await wait(60);
  if (cpu) await cpu.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await armTapMetrics(page);
  if (tap) {
    const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
    if (pt) await realTap(page, pt.x, pt.y, touch);
    else await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  } else {
    await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  }
  const metrics = await readTapMetrics(page);
  if (cpu) await cpu.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const end = await waitDoorDone(page);
  const parked = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    if (j.driving) {
      window.__playtestQa.jacGetOut?.();
    }
    const s = window.__playtestQa.jac();
    return {
      cx: s.cx,
      cy: s.cy,
      dir: s.dir,
      driving: s.driving,
      overlap: window.__playtestQa.jacOverlapsProp(),
    };
  });
  await wait(80);
  const overlap = await page.evaluate(() => window.__playtestQa.jacOverlapsProp());
  return { ...end, ...metrics, overlap: overlap || parked.overlap, parked };
}

async function measureDoors(page, tag, touch, cpu) {
  const list = await names(page);
  const rows = [];
  for (const name of list) {
    const attempts = [];
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      const row = await driveDoor(page, name, touch, { tap: i === 0, cpu });
      attempts.push(row);
      ok = row.done;
      notes.push(
        `${tag} ${name}#${i + 1}: ${row.done ? 'OK' : 'FAIL'} ${row.ms}ms @${row.cx?.toFixed?.(2)},${row.cy?.toFixed?.(2)} lt=${row.longtask.toFixed(0)} raf=${row.rafMax.toFixed(0)} ov=${row.overlap}`,
      );
    }
    const best = attempts.find((a) => a.done) ?? attempts[attempts.length - 1];
    rows.push({ name, ok, n: attempts.length, ms: best.ms, cx: best.cx, cy: best.cy, overlap: best.overlap, longtask: best.longtask, rafMax: best.rafMax });
    if (!ok) errors.push(`${tag}:${name}: door-drive did not complete (3/3)`);
    if (best.overlap) errors.push(`${tag}:${name}: parked sprite overlaps a prop`);
    if (best.longtask > 50) errors.push(`${tag}:${name}: longtask ${best.longtask.toFixed(0)} ms (want ≤50)`);
  }
  report.doors[tag] = rows;
  report.overlap[tag] = Object.fromEntries(rows.map((r) => [r.name, r.overlap]));
  report.tapLongtask[tag] = Object.fromEntries(rows.map((r) => [r.name, { longtask: r.longtask, rafMax: r.rafMax }]));
}

async function shotParked(page, name, file) {
  await spawnDrive(page);
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(0.55);
  }, name);
  await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  const end = await waitDoorDone(page, 22000);
  await page.evaluate(() => {
    if (window.__playtestQa.jac().driving) window.__playtestQa.jacGetOut?.();
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.focusJac?.();
    window.__playtestQa.setZoom?.(0.7);
  });
  await wait(200);
  await page.screenshot({ path: path.join(OUT, file), fullPage: false });
  notes.push(`shot ${name}: done=${end.done} @${end.cx?.toFixed?.(2)},${end.cy?.toFixed?.(2)}`);
  return end;
}

async function measureStick(page) {
  await spawnDrive(page);
  const row = await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('D');
    const side = (() => {
      let last = { mph: 0, cx: 0, cy: 0 };
      for (let i = 0; i < 90; i++) {
        last = window.__playtestQa.jacDriveStep?.(1 / 60, -60, -10, { render: false }) ?? last;
      }
      return last;
    })();
    window.__playtestQa.jacSet?.({
      cx: window.__playtestQa.jacSpawn().center.x,
      cy: window.__playtestQa.jacSpawn().center.y,
      dir: 'se',
      mode: 'drive',
    });
    window.__playtestQa.jacSetGear?.('D');
    const diag = (() => {
      let last = { mph: 0, cx: 0, cy: 0 };
      for (let i = 0; i < 90; i++) {
        last = window.__playtestQa.jacDriveStep?.(1 / 60, 40, 40, { render: false }) ?? last;
      }
      return last;
    })();
    return { side, diag };
  });
  report.stick = row;
  notes.push(`stick side mph=${row.side.mph} diag mph=${row.diag.mph}`);
  if (row.side.mph < 9) errors.push(`stick: sideways mph ${row.side.mph} (want 9–10)`);
  if (row.diag.mph < 9) errors.push(`stick: down-diagonal mph ${row.diag.mph} (want 9–10)`);
}

async function measureCaseEs(page) {
  const row = await page.evaluate(() => {
    window.__playtestQa.setLang?.('es');
    window.__playtestQa.showCasePreview?.('finoa');
    const title = document.querySelector('.case-preview__title')?.textContent ?? '';
    const sub = document.querySelector('.case-preview__subtitle')?.textContent ?? '';
    const teaser = document.querySelector('.case-preview__teaser')?.textContent ?? '';
    const pill = document.querySelector('.case-preview__read-meta')?.textContent ?? '';
    return { title, sub, teaser, pill, lang: window.__playtestQa.getLang?.() };
  });
  report.caseEs = row;
  notes.push(`case ES title="${row.title}" sub="${row.sub}" teaser="${row.teaser}" pill="${row.pill}"`);
  const english = /Product strategist|Problem · What I did|institutional custody platform|What I did|A custody platform/;
  if (english.test(`${row.title} ${row.sub} ${row.teaser} ${row.pill}`)) {
    errors.push(`case ES still English: ${JSON.stringify(row)}`);
  }
  await page.evaluate(() => window.__playtestQa.dismissBuildingPanel?.());
}

async function runViewport(browser, tag, size, touch, { doors = true, shots = false } = {}) {
  const ctx = await browser.newContext({
    viewport: size,
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cpu = await throttleCpu(page, 1);
  await boot(page);
  if (doors) await measureDoors(page, tag, touch, cpu);
  if (tag === 'phone-390') {
    await measureStick(page);
    await measureCaseEs(page);
  }
  if (shots) {
    await shotParked(page, 'pg', 'parked-pg.png');
    await shotParked(page, 'estudio', 'parked-estudio.png');
    await shotParked(page, 'finoa', 'parked-finoa.png');
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
  await runViewport(browser, 'phone-390', { width: 390, height: 844 }, true, { shots: true });
  await runViewport(browser, 'land-844', { width: 844, height: 390 }, true);
  await runViewport(browser, 'desk-1280', { width: 1280, height: 800 }, false);
} finally {
  await browser.close();
  preview?.kill('SIGKILL');
}

fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
