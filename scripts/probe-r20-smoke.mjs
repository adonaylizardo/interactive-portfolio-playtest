#!/usr/bin/env node
/** Fast sit / one-width / ground / retarget smoke before the full table. */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4293/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

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
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    window.__playtestQa.setCharacterTile?.(s.center.x + 2, s.center.y);
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
  });
}

function analyze(samples) {
  const jumps = [];
  let vanJump = 0;
  let charJump = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(b.dt || 0, 1 / 120);
    const dVan = Math.hypot((b.cx ?? 0) - (a.cx ?? 0), (b.cy ?? 0) - (a.cy ?? 0));
    const cap = (b.max ?? 5) * dt + 0.22;
    if (dVan > vanJump) vanJump = dVan;
    if (dVan > cap + 1e-4) jumps.push({ kind: 'van', d: +dVan.toFixed(3), cap: +cap.toFixed(3), i });
    const dChar = Math.hypot((b.px ?? 0) - (a.px ?? 0), (b.py ?? 0) - (a.py ?? 0));
    if (a.driving && !b.driving && dChar <= 3.2) continue;
    if (dChar > charJump) charJump = dChar;
    if (dChar > 4.5) jumps.push({ kind: 'char', d: +dChar.toFixed(3), i });
  }
  return { vanJump, charJump, jumps: jumps.slice(0, 6) };
}

async function arm(page) {
  await page.evaluate(() => {
    window.__r20s = [];
    let last = performance.now();
    const tick = (t) => {
      const j = window.__playtestQa.jac();
      const c = window.__playtestQa.getCharacterPos?.() ?? { x: 0, y: 0 };
      const r = window.__playtestQa.inputReady();
      window.__r20s.push({
        dt: (t - last) / 1000,
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

async function snap(page) {
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
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      px: c.x,
      py: c.y,
      overlap: window.__playtestQa.jacOverlapsProp(),
      sitWhy: j.sitWhy ?? '',
    };
  });
}

const browser = await launchBrowser(chromium, { headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
await boot(page);
const hash = await page.evaluate(() => document.querySelector('script[src*="assets/index-"]')?.src ?? '');
log('hash', hash);

await spawnDrive(page);
const sits = await page.evaluate(() =>
  window.__playtestQa
    .getEnterableBuildings()
    .filter((b) => b.door)
    .map((b) => {
      const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
      return { name: b.name, door: b.door, sit: sit ? { x: sit.x, y: sit.y, heading: sit.heading, pathN: sit.path?.length ?? 0, ms: sit.ms } : null };
    }),
);
log('sits', JSON.stringify(sits, null, 2));

const names = sits.map((s) => s.name);
for (const name of names) {
  await spawnDrive(page);
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(n === 'flor' || n === 'sambil' ? 0.12 : 0.28);
  }, name);
  await wait(40);
  await arm(page);
  await page.evaluate((n) => window.__playtestQa.driveEnter?.(n), name);
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 40000) {
    last = await snap(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if ((last.interior || last.panel) && away && !last.driving) break;
    last = null;
    await wait(50);
  }
  last = last ?? (await snap(page));
  const samples = await page.evaluate(() => window.__r20s ?? []);
  const trace = analyze(samples);
  const parked = await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.leaveInteriorNow?.();
    if (window.__playtestQa.jac().driving) window.__playtestQa.jacGetOut?.();
    const s = window.__playtestQa.jac();
    return { cx: s.cx, cy: s.cy, dir: s.dir, overlap: window.__playtestQa.jacOverlapsProp() };
  });
  const ok = !!(last.interior || last.panel) && !last.driving && trace.jumps.length === 0;
  log(
    `${ok ? 'OK' : 'FAIL'} ${name} ${Date.now() - t0}ms @${last.cx?.toFixed?.(2)},${last.cy?.toFixed?.(2)} dir=${last.dir} ov=${parked.overlap} vanΔ=${trace.vanJump.toFixed(2)} charΔ=${trace.charJump.toFixed(2)} hops=${JSON.stringify(trace.jumps)} why=${last.sitWhy} panel=${last.panel} driving=${last.driving} px=${last.px?.toFixed?.(1)},${last.py?.toFixed?.(1)}`,
  );
}

await spawnDrive(page);
await page.evaluate(() => window.__playtestQa.setZoom?.(0.4));
await arm(page);
await page.evaluate(() => window.__playtestQa.jacDriveTo?.(18, 10));
{
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 12000) {
    last = await snap(page);
    const d = Math.hypot((last.cx ?? 0) - 18, (last.cy ?? 0) - 10);
    if (!last.goal && d <= 1.4 && last.mph < 2) {
      last.ok = true;
      last.dist = d;
      break;
    }
    await wait(50);
  }
  const samples = await page.evaluate(() => window.__r20s ?? []);
  const trace = analyze(samples);
  const d = last?.dist ?? Math.hypot((last?.cx ?? 0) - 18, (last?.cy ?? 0) - 10);
  log(`ground ${last?.ok && !trace.jumps.length ? 'OK' : 'FAIL'} ${Date.now() - t0}ms d=${d.toFixed(2)} goal=${JSON.stringify(last?.goal)} vanΔ=${trace.vanJump.toFixed(2)} hops=${JSON.stringify(trace.jumps)}`);
}

await spawnDrive(page);
await page.evaluate(() => {
  window.__playtestQa.frameDoorForQa?.('sambil');
  window.__playtestQa.setZoom?.(0.12);
});
await arm(page);
await page.evaluate(() => window.__playtestQa.driveEnter?.('sambil'));
await wait(800);
await page.evaluate(() => window.__playtestQa.driveEnter?.('finoa'));
{
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 20000) {
    last = await snap(page);
    const away = Math.hypot((last.cx ?? 0) - 25.5, (last.cy ?? 0) - 17) > 2.2;
    if ((last.interior || last.panel) && away && !last.driving) break;
    await wait(50);
  }
  last = last ?? (await snap(page));
  const samples = await page.evaluate(() => window.__r20s ?? []);
  const trace = analyze(samples);
  const finoa = /finoa/i.test(last.panel || '') || last.interior;
  log(`retarget ${last && (last.interior || last.panel) && !last.driving && finoa && !trace.jumps.length ? 'OK' : 'FAIL'} ${Date.now() - t0}ms panel=${last.panel} driving=${last.driving} vanΔ=${trace.vanJump.toFixed(2)} hops=${JSON.stringify(trace.jumps)} why=${last.sitWhy}`);
}

await browser.close();
