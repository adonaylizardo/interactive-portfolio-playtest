#!/usr/bin/env node
/** Real-iPhone QA that Playwright/CDP missed on index-CD-yopTA.js:
 *  continuous tap-to-drive (60 / 120 / irregular dt), iOS stick scroll +
 *  pointercancel reset, PiP hides on R→D, single van after get-out + resize.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-iphone-r17');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4222/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const notes = [];

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
  await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving === false)) ? true : null),
    4000,
  );
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

function summarizeDeltas(samples, hz, maxStep, maxTurn) {
  const ds = samples.map((s) => s.d);
  const turns = samples.map((s) => s.dHeading);
  const maxD = ds.length ? Math.max(...ds) : 0;
  const jumps = samples.filter((s) => s.d > maxStep);
  const snaps = samples.filter((s) => s.dHeading > maxTurn);
  return {
    hz,
    n: samples.length,
    maxD: Number(maxD.toFixed(4)),
    meanD: ds.length ? Number((ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(4)) : 0,
    jumps: jumps.length,
    snaps: snaps.length,
    moved: samples.filter((s) => s.d > 0.002).length,
  };
}

async function samplePathFollow(page, dt, steps) {
  return page.evaluate(
    ({ dt, steps }) => {
      const qa = window.__playtestQa;
      const s = qa.jacSpawn();
      qa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
      const ok = qa.jacDriveTo(32, 22);
      const out = [];
      let prev = qa.jac();
      for (let i = 0; i < steps; i++) {
        qa.jacDriveStep?.(dt, 0, 0);
        const j = qa.jac();
        if (!j || !prev) continue;
        let dh = (j.heading ?? 0) - (prev.heading ?? 0);
        if (dh > 2) dh -= 4;
        if (dh < -2) dh += 4;
        out.push({
          i,
          d: Math.hypot(j.cx - prev.cx, j.cy - prev.cy),
          dHeading: Math.abs(dh),
          cx: j.cx,
          cy: j.cy,
          heading: j.heading,
          gear: j.gear,
        });
        prev = j;
      }
      return { ok, samples: out, end: qa.jac() };
    },
    { dt, steps },
  );
}

async function main() {
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: path.join(OUT, 'clips'), size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitUntil(page, async () => (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) || null);
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('es');
  });
  await parkVan(page);
  await ensureDriving(page, 'r17');

  const rates = [
    { hz: 60, dt: 1 / 60, steps: 180, maxStep: 0.16, maxTurn: 0.22 },
    { hz: 120, dt: 1 / 120, steps: 240, maxStep: 0.09, maxTurn: 0.14 },
    { hz: 'irregular', dt: 0.037, steps: 90, maxStep: 0.28, maxTurn: 0.28 },
  ];
  const pathStats = [];
  for (const r of rates) {
    const run = await samplePathFollow(page, r.dt, r.steps);
    if (!run.ok) errors.push(`path-follow ${r.hz}: drive path not accepted`);
    const stat = summarizeDeltas(run.samples, r.hz, r.maxStep, r.maxTurn);
    pathStats.push({ ...stat, end: { cx: run.end?.cx, cy: run.end?.cy } });
    notes.push(`path ${r.hz}Hz ${JSON.stringify(stat)}`);
    if (stat.moved < 8) errors.push(`path-follow ${r.hz}: van barely moved`);
    if (stat.jumps > 0) errors.push(`path-follow ${r.hz}: ${stat.jumps} position jumps > ${r.maxStep}`);
    if (stat.snaps > 0) errors.push(`path-follow ${r.hz}: ${stat.snaps} heading snaps > ${r.maxTurn}`);
  }

  await parkVan(page);
  await ensureDriving(page, 'r17-record');
  await page.evaluate(() => {
    window.__playtestQa.jacDriveTo(32, 22);
  });
  let midMph = 0;
  for (let i = 0; i < 90; i++) {
    const step = await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0));
    midMph = Math.max(midMph, step?.mph ?? 0);
    if (i === 24) await page.screenshot({ path: path.join(OUT, 'phone-390-tap-drive.png') });
    await wait(16);
  }
  notes.push(`tap-drive visual mph=${midMph}`);
  if (midMph < 1) errors.push(`tap-drive: HUD never rose above 1 mph (${midMph})`);

  const stick = await page.evaluate(async () => {
    const qa = window.__playtestQa;
    qa.setLang?.('es');
    const root = document.querySelector('.joystick');
    if (!root) return { error: 'no stick' };
    root.hidden = false;
    const r = root.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    root.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 9,
        pointerType: 'touch',
        clientX: cx,
        clientY: cy,
      }),
    );
    root.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId: 9,
        pointerType: 'touch',
        clientX: cx + 80,
        clientY: cy - 90,
      }),
    );
    window.scrollTo(40, 80);
    const mid = { joy: qa.joystick(), view: qa.viewportLock() };
    root.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        cancelable: true,
        pointerId: 9,
        pointerType: 'touch',
        clientX: cx + 80,
        clientY: cy - 90,
      }),
    );
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    const after = { joy: qa.joystick(), view: qa.viewportLock() };
    return { mid, after, knobR: after.joy?.knobR };
  });
  notes.push(`stick ${JSON.stringify(stick)}`);
  if (stick.mid?.joy?.knobR > 36) errors.push(`stick: knob escaped ring (r=${stick.mid.joy.knobR})`);
  if (stick.after?.joy?.active) errors.push('stick: stayed active after pointercancel');
  if ((stick.after?.joy?.knobR ?? 99) > 8) errors.push(`stick: knob did not reset after pointercancel (${stick.after?.joy?.knobR})`);
  if ((stick.after?.view?.scrollY ?? 0) !== 0) errors.push(`stick: window.scrollY is ${stick.after.view.scrollY}`);
  if ((stick.after?.view?.vvOffsetTop ?? 0) !== 0) {
    errors.push(`stick: visualViewport.offsetTop is ${stick.after.view.vvOffsetTop}`);
  }
  await page.screenshot({ path: path.join(OUT, 'phone-390-joystick.png') });

  await parkVan(page);
  await ensureDriving(page, 'r17-pip');
  await page.evaluate(() => {
    const qa = window.__playtestQa;
    qa.jacSetGear?.('R');
    qa.jacStick?.({ x: 0, y: 0.9 });
  });
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(0.05, 0, 0.9));
    await wait(16);
  }
  const inR = await page.evaluate(() => {
    const qa = window.__playtestQa;
    return {
      gear: qa.jac()?.gear,
      rearCam: qa.jac()?.rearCam,
      rear: qa.jacEntities()?.rearVisible,
      on: document.querySelector('.jac-rear')?.classList.contains('is-on'),
      hidden: document.querySelector('.jac-rear')?.hidden,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'phone-390-pip-r.png') });
  await page.evaluate(() => {
    const qa = window.__playtestQa;
    qa.jacStick?.(null);
    qa.jacSetGear?.('D');
  });
  await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0));
  await wait(50);
  const inD = await page.evaluate(() => {
    const qa = window.__playtestQa;
    return {
      gear: qa.jac()?.gear,
      rearCam: qa.jac()?.rearCam,
      rear: qa.jacEntities()?.rearVisible,
      on: document.querySelector('.jac-rear')?.classList.contains('is-on'),
      hidden: document.querySelector('.jac-rear')?.hidden,
      body: document.body.classList.contains('jac-rearcam'),
    };
  });
  const pip = { inR, inD };
  notes.push(`pip ${JSON.stringify(pip)}`);
  if (!pip.inR.rearCam && !pip.inR.on) errors.push('pip: R did not show rear-cam');
  if (pip.inD.rearCam || pip.inD.on || pip.inD.rear || pip.inD.body || pip.inD.hidden === false) {
    errors.push(`pip: still visible after R→D ${JSON.stringify(pip.inD)}`);
  }
  await page.screenshot({ path: path.join(OUT, 'phone-390-pip-d.png') });

  await parkVan(page);
  await ensureDriving(page, 'r17-dup');
  const spawn = await page.evaluate(() => window.__playtestQa.jacSpawn());
  const drove = await page.evaluate((spawn) => {
    const qa = window.__playtestQa;
    qa.jacSet?.({ cx: spawn.center.x, cy: spawn.center.y, dir: 'se', mode: 'drive' });
    const dests = [
      [32, 22],
      [30, 24],
      [28, 22],
      [18, 20],
    ];
    for (const [x, y] of dests) {
      if (qa.jacDriveTo(x, y)) return { ok: true, x, y };
    }
    return { ok: false, tile: qa.jacDriveTileOk?.(32, 22), path: qa.jacFindDrivePath?.(32, 22) };
  }, spawn);
  notes.push(`dup-drive ${JSON.stringify(drove)}`);
  if (!drove?.ok) errors.push(`dup: drive-away path not accepted ${JSON.stringify(drove)}`);
  for (let i = 0; i < 200; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0));
  }
  const midDrive = await page.evaluate((spawn) => {
    const j = window.__playtestQa.jac();
    return { cx: j?.cx, cy: j?.cy, away: Math.hypot((j?.cx ?? 0) - spawn.center.x, (j?.cy ?? 0) - spawn.center.y) };
  }, spawn);
  notes.push(`dup-mid ${JSON.stringify(midDrive)}`);
  if ((midDrive.away ?? 0) < 4) errors.push(`dup: van did not leave spawn before get-out (${midDrive.away})`);
  await page.evaluate(() => window.__playtestQa.jacGetOut());
  await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving === false)) ? true : null),
    4000,
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.visualViewport?.dispatchEvent(new Event('resize'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(200);
  const dup = await page.evaluate((spawn) => {
    const qa = window.__playtestQa;
    const j = qa.jac();
    const e = qa.jacEntities();
    const labels = qa.nameLabels?.() ?? [];
    const jacLabels = labels.filter((l) => /JAC/i.test(l.name) && l.visible);
    const away = Math.hypot((j?.cx ?? 0) - spawn.center.x, (j?.cy ?? 0) - spawn.center.y);
    return { cx: j?.cx, cy: j?.cy, away, entities: e, jacLabels, driving: j?.driving };
  }, spawn);
  notes.push(`dup ${JSON.stringify(dup)}`);
  if ((dup.entities?.count ?? 99) !== 1) errors.push(`dup: van entity count ${dup.entities?.count}`);
  if ((dup.entities?.sprites ?? 99) > 1) errors.push(`dup: jac sprites ${dup.entities?.sprites}`);
  if ((dup.jacLabels?.length ?? 99) > 1) errors.push(`dup: JAC labels ${dup.jacLabels.length}`);
  if (dup.away > 4 && (dup.entities?.spawnSprites ?? 0) > 0) {
    errors.push(`dup: leftover sprite at spawn while van is ${dup.away.toFixed(1)} tiles away`);
  }
  await page.screenshot({ path: path.join(OUT, 'phone-390-getout.png') });

  const lows = await page.evaluate(() => {
    const qa = window.__playtestQa;
    qa.setLang?.('es');
    const esGear = document.querySelector('.jac-bar__gears, .jac-gears')?.getAttribute('aria-label');
    qa.setLang?.('en');
    const enGear = document.querySelector('.jac-bar__gears, .jac-gears')?.getAttribute('aria-label');
    const off = document.querySelector('.jac-dial__off');
    const on = document.querySelector('.jac-dial__on');
    const overlap = (() => {
      if (!off || !on) return 0;
      const a = off.getBoundingClientRect();
      const b = on.getBoundingClientRect();
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    })();
    return { esGear, enGear, overlap, off: off?.textContent, on: on?.textContent };
  });
  notes.push(`lows ${JSON.stringify(lows)}`);
  if (lows.enGear === 'Marcha') errors.push("aria: 'Marcha' stayed after switching to EN");
  if ((lows.overlap ?? 0) > 4) errors.push(`dial: ES labels overlap (${lows.overlap})`);

  const flor = await page.evaluate(() => {
    const doors = window.__playtestQa.getEnterableBuildings?.() ?? [];
    const flor = doors.find((b) => b.name === 'flor');
    if (!flor?.door) return null;
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    const sit = window.__playtestQa.parkForDoor(flor.door.x, flor.door.y);
    const d = sit ? Math.abs(sit.x - flor.door.x) + Math.abs(sit.y - flor.door.y) : 99;
    return { sit, d, door: flor.door };
  });
  notes.push(`flor ${JSON.stringify(flor)}`);
  if (flor && flor.d > 14) errors.push(`flor: park sit ${flor.d} tiles from door`);

  const report = {
    base: BASE,
    errors,
    notes,
    pathStats,
    stick,
    pip,
    dup,
    lows,
    flor,
  };
  fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(OUT, 'phone-390-done.png') });
  const video = page.video();
  await context.close();
  if (video) {
    await video.saveAs(path.join(OUT, 'phone-390-tap-drive.webm'));
  }
  await browser.close();
  console.log(JSON.stringify({ errors, pathStats, out: OUT }, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
