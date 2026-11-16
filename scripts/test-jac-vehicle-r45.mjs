#!/usr/bin/env node
/**
 * r45 JAC vehicle model: heading steer, gears, collision, exit pose (headless Playwright + __playtestQa).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART =
  process.env.QA_ARTIFACTS_DIR ??
  process.env.CURSOR_ARTIFACTS_DIR ??
  (fs.existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : path.join(ROOT, 'artifacts'));
const BASE =
  process.env.QA_BASE_URL ?? `${process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/'}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootDrive(page, view = 'cenital') {
  await page.goto(`${BASE}#view=0,0,1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForQa(page);
  await page.evaluate((view) => {
    window.__playtestQa.setViewMode?.(view);
    window.__playtestQa.setLayout?.('map');
    if (window.__playtestQa.jac()?.driving) {
      window.__playtestQa.jacGetOut?.();
      for (let i = 0; i < 150; i++) {
        window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false });
        if (!window.__playtestQa.jac()?.driving) break;
      }
    }
    const spawn = window.__playtestQa.jacSpawn?.();
    if (spawn?.center) {
      window.__playtestQa.jacSet?.({
        mode: 'parked',
        cx: spawn.center.x,
        cy: spawn.center.y,
        dir: 'se',
      });
    }
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
    window.__playtestQa.jacSetGear?.('D');
  }, view);
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 15_000 });
  await page.waitForFunction(
    () => window.__playtestQa.jac()?.gear === 'D' && window.__playtestQa.jac()?.engineOn === true,
    null,
    { timeout: 5000 },
  );
}

function step(page, dx, dy, n = 30) {
  return page.evaluate(
    ({ dx, dy, n }) => {
      let last = null;
      for (let i = 0; i < n; i++) {
        last = window.__playtestQa.jacDriveStep?.(1 / 60, dx, dy, { render: false });
      }
      return last;
    },
    { dx, dy, n },
  );
}

async function snapshot(page) {
  return page.evaluate(() => window.__playtestQa.jac());
}

async function runCenitalRemapTests(page) {
  await bootDrive(page, 'cenital');
  const quarters = [0, 1, 2, 3];
  for (const q of quarters) {
    const check = await page.evaluate((quarter) => {
      window.__playtestQa.setMapYawQuarter?.(quarter);
      window.__playtestQa.jacSet?.({ gear: 'D', dir: 'se', cx: 15, cy: 18 });
      const up = window.__playtestQa.remapDriveStick?.(0, -1);
      const right = window.__playtestQa.remapDriveStick?.(1, 0);
      const left = window.__playtestQa.remapDriveStick?.(-1, 0);
      const down = window.__playtestQa.remapDriveStick?.(0, 1);
      const okMap =
        Math.abs(up.x) < 0.01 &&
        Math.abs(up.y + 1) < 0.01 &&
        Math.abs(right.x - 1) < 0.01 &&
        Math.abs(right.y) < 0.01 &&
        Math.abs(left.x + 1) < 0.01 &&
        Math.abs(down.y - 1) < 0.01;
      let h0 = window.__playtestQa.jac().heading;
      let velUp = 0;
      for (let i = 0; i < 40; i++) {
        window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
        velUp = window.__playtestQa.jac().vel;
      }
      const h1 = window.__playtestQa.jac().heading;
      const dH = Math.abs(((h1 - h0 + 6) % 4) - 2);
      return { quarter, okMap, velUp, dH, up, right };
    }, q);
    assert.ok(check.okMap, `cenital Q${q}: stick not raw-mapped ${JSON.stringify(check)}`);
    assert.ok(check.velUp > 0.15, `cenital Q${q}: screen-up should throttle (vel=${check.velUp})`);
    assert.ok(check.dH < 0.2, `cenital Q${q}: screen-up should not hard-steer (dH=${check.dH})`);
  }
}

async function runFootprintCollisionTests(page) {
  await bootDrive(page, 'cenital');
  const cases = [
    { cx: 34, cy: 24, dir: 'se', label: 'bain-se' },
    { cx: 31, cy: 27.5, dir: 'sw', label: 'estudio-sw' },
  ];
  for (const pose of cases) {
    const hit = await page.evaluate((p) => {
      window.__playtestQa.jacSet?.({ gear: 'D', dir: p.dir, cx: p.cx, cy: p.cy });
      const start = { cx: window.__playtestQa.jac().cx, cy: window.__playtestQa.jac().cy };
      let blockedEver = false;
      for (let i = 0; i < 140; i++) {
        window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
        if (window.__playtestQa.jacFootprintBlocked?.()) blockedEver = true;
      }
      const end = window.__playtestQa.jac();
      const dist = Math.hypot(end.cx - start.cx, end.cy - start.cy);
      return { ...p, blockedEver, dist, overlap: window.__playtestQa.jacFootprintBlocked?.() };
    }, pose);
    assert.ok(!hit.overlap, `${pose.label}: footprint must not overlap building at end`);
    assert.ok(hit.dist < 8.5, `${pose.label}: should not climb deep onto roof (dist=${hit.dist})`);
  }
}

async function runWallNoSlideTest(page) {
  await bootDrive(page, 'cenital');
  const slide = await page.evaluate(() => {
    let blocked = null;
    for (let y = 12; y < 40 && !blocked; y++) {
      for (let x = 12; x < 40; x++) {
        if (
          !window.__playtestQa.jacDriveTileOk?.(x, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 1, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 2, y)
        ) {
          blocked = { x, y };
          break;
        }
      }
    }
    if (!blocked) return { ok: false, reason: 'no wall' };
    window.__playtestQa.jacSet?.({ gear: 'D', dir: 'se', cx: blocked.x - 2.3, cy: blocked.y });
    const start = window.__playtestQa.jac();
    let maxLateral = 0;
    let minMph = 99;
    for (let i = 0; i < 120; i++) {
      window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
      const j = window.__playtestQa.jac();
      const h = j.heading * (Math.PI / 2);
      const hx = Math.cos(h);
      const hy = Math.sin(h);
      const dx = j.cx - start.cx;
      const dy = j.cy - start.cy;
      maxLateral = Math.max(maxLateral, Math.abs(-hy * dx + hx * dy));
      if (j.mph < minMph) minMph = j.mph;
    }
    const end = window.__playtestQa.jac();
    return { ok: maxLateral < 0.45 && end.mph < 1.5 && minMph < 1.5, maxLateral, minMph, mph: end.mph };
  });
  assert.ok(slide.ok, `straight wall contact should not slide sideways (${JSON.stringify(slide)})`);
}

async function runTeresaParkTest(page) {
  await bootDrive(page, 'cenital');
  const result = await page.evaluate(async () => {
    window.__playtestQa.driveEnter?.('teresa');
    const raw =
      window.__playtestQa.jac().driveGoal ?? window.__playtestQa.parkForDoor?.(34, 14, 'teresa');
    if (!raw) return { ok: false, reason: 'no park goal' };
    const goal = { x: raw.x, y: raw.y };
    let steps = 0;
    let flips = 0;
    let prevDir = window.__playtestQa.jac().dir;
    let minVel = 0;
    for (; steps < 900; steps++) {
      window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false });
      const j = window.__playtestQa.jac();
      if (j.dir !== prevDir) {
        flips += 1;
        prevDir = j.dir;
      }
      if (j.vel < minVel) minVel = j.vel;
      const g = window.__playtestQa.jac().driveGoal ?? goal;
      const d = Math.hypot(j.cx - g.x, j.cy - g.y);
      if (d < 1.0) break;
    }
    const ms = (steps * 1000) / 60;
    const end = window.__playtestQa.jac();
    const dist = Math.hypot(end.cx - goal.x, end.cy - goal.y);
    const ang = Math.atan2(goal.y - end.cy, goal.x - end.cx) / (Math.PI / 2);
    let headErr = ang - end.heading;
    if (headErr > 2) headErr -= 4;
    if (headErr < -2) headErr += 4;
    return {
      ok:
        dist < 1.0 &&
        ms < 5800 &&
        flips < 35 &&
        end.gear === 'D' &&
        minVel >= -0.02 &&
        Math.abs(headErr) < 1.05,
      dist,
      ms,
      flips,
      gear: end.gear,
      minVel,
      headErr: Math.abs(headErr),
    };
  });
  assert.ok(
    result.ok,
    `Teresa tap-to-park should arrive in D without reversing (${JSON.stringify(result)})`,
  );
}

async function runModelTests(page) {
  await bootDrive(page, 'cenital');
  const t0 = await snapshot(page);
  const h0 = t0.heading;

  const velSamples = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      window.__playtestQa.jacDriveStep(1 / 60, 0, -0.9, { render: false });
      out.push(window.__playtestQa.jac().vel);
    }
    return out;
  });
  assert.ok(velSamples[0] < 0.25, `initial speed near zero (got ${velSamples[0]})`);
  assert.ok(
    velSamples.at(-1) > velSamples[0] + 0.4,
    `throttle should build speed in D (samples: ${velSamples.map((v) => v.toFixed(2)).join('→')})`,
  );

  await step(page, 0.9, -0.4, 45);
  const t1 = await snapshot(page);
  assert.ok(Math.abs(t1.heading - h0) > 0.08, 'heading should change when steering with speed');
  assert.ok(t1.cx !== t0.cx || t1.cy !== t0.cy, 'truck should move forward in D');
  assert.ok(t1.vel > 0.05, 'positive velocity in D with throttle');

  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0.9, { render: false }));
  }
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  const stopped = await snapshot(page);
  assert.ok(Math.abs(stopped.vel) < 0.1, 'must be stopped before in-place steer check');
  const hs = stopped.heading;
  await step(page, 0.85, 0, 20);
  const tSteerStopped = await snapshot(page);
  assert.ok(Math.abs(tSteerStopped.heading - hs) < 0.06, 'no in-place heading change when stopped');

  await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('P');
    const b = window.__playtestQa.jac();
    return { cx: b.cx, cy: b.cy, mph: b.mph, vel: b.vel };
  });
  const afterP = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('D'));
  const afterD = await snapshot(page);
  assert.equal(afterD.mph, 0, 'gear P→D must not show speed without throttle');
  assert.equal(afterD.vel, 0, 'gear P→D must not impart velocity');
  assert.ok(
    Math.hypot(afterD.cx - afterP.cx, afterD.cy - afterP.cy) < 0.01,
    'gear change alone must not move the truck',
  );

  await step(page, 0, -0.85, 50);
  const fwd = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  await step(page, 0, -0.85, 55);
  const rev = await snapshot(page);
  assert.ok(rev.vel < -0.05, 'R gear with throttle should produce negative velocity');
  assert.ok(fwd.cx !== rev.cx || fwd.cy !== rev.cy, 'reverse should move along heading');

  const wallProbe = await page.evaluate(() => {
    let blocked = null;
    for (let y = 12; y < 40 && !blocked; y++) {
      for (let x = 12; x < 40; x++) {
        if (
          !window.__playtestQa.jacDriveTileOk?.(x, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 1, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 2, y)
        ) {
          blocked = { x, y };
          break;
        }
      }
    }
    if (!blocked) return { ok: false, reason: 'no blocked tile found' };
    window.__playtestQa.jacSet?.({ mode: 'drive', gear: 'D', dir: 'se', cx: blocked.x - 2, cy: blocked.y });
    const startCx = window.__playtestQa.jac().cx;
    for (let i = 0; i < 90; i++) window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
    const end = window.__playtestQa.jac();
    const advanced = end.cx - startCx;
    const inside = window.__playtestQa.jacDriveTileOk?.(blocked.x, blocked.y) === false;
    const held = end.cx < blocked.x - 0.35 || (advanced < 0.45 && end.vel < 2.2);
    return { ok: inside && held, blocked, startCx, endCx: end.cx, advanced, vel: end.vel, mph: end.mph };
  });
  assert.ok(wallProbe.ok, `collision should stop before building tile (${JSON.stringify(wallProbe)})`);
}

async function runExitPersistTests(page) {
  await bootDrive(page, 'cenital');
  for (let i = 0; i < 70; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, -0.85, { render: false }));
  }
  const before = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacGetOut?.());
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  const after = await snapshot(page);
  assert.ok(!after.driving, 'should be parked after exit');
  assert.ok(
    Math.hypot(after.cx - before.cx, after.cy - before.cy) < 0.45,
    'truck stays at exit pose',
  );
  const avatarGap = await page.evaluate(() => {
    const c = window.__playtestQa.getCharacterTile?.();
    const j = window.__playtestQa.jac();
    if (!c || !j) return { ok: false };
    const d = Math.hypot(c.x - j.cx, c.y - j.cy);
    return { ok: d <= 2.05, d };
  });
  assert.ok(avatarGap.ok, `avatar should spawn beside truck (d=${avatarGap.d})`);
  await page.evaluate(() => window.__playtestQa.jacGetIn?.());
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 8000 });
  const re = await snapshot(page);
  assert.ok(Math.hypot(re.cx - after.cx, re.cy - after.cy) < 0.35, 're-enter continues from parked pose');
}

async function runDialHitTargetTest(page) {
  await bootDrive(page, 'cenital');
  const sizes = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    };
    return {
      off: pick('.jac-dial__off'),
      on: pick('.jac-dial__on'),
      engine: pick('.jac-dial__engine'),
    };
  });
  for (const [k, v] of Object.entries(sizes)) {
    if (!v) continue;
    assert.ok(v.w >= 44 && v.h >= 44, `${k} dial target ${v.w}x${v.h} < 44px`);
  }
}

async function browserLoop(page, tag, viewport) {
  await bootDrive(page, tag.includes('iphone') ? 'cenital' : 'cenital');
  const shots = [];
  const snap = (name) => path.join(ART, `r45-${tag}-${name}.png`);
  await page.screenshot({ path: snap('01-drive-start'), fullPage: false });
  shots.push(snap('01-drive-start'));

  await step(page, 0.5, -0.85, 90);
  await step(page, 0.75, 0, 40);
  await page.screenshot({ path: snap('02-loop'), fullPage: false });
  shots.push(snap('02-loop'));

  await step(page, 0, -1, 120);
  await page.screenshot({ path: snap('03-wall'), fullPage: false });
  shots.push(snap('03-wall'));

  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  await step(page, 0, -0.7, 70);
  await page.screenshot({ path: snap('04-reverse'), fullPage: false });
  shots.push(snap('04-reverse'));

  await page.evaluate(() => {
    window.__playtestQa.jacGetOut?.();
  });
  for (let i = 0; i < 90; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  await wait(200);
  await page.screenshot({ path: snap('05-exit'), fullPage: false });
  shots.push(snap('05-exit'));

  await page.evaluate(() => window.__playtestQa.jacGetIn?.());
  await wait(600);
  await page.screenshot({ path: snap('06-reenter'), fullPage: false });
  shots.push(snap('06-reenter'));

  return { viewport, shots };
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  const boot = async (context) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem('playtest-welcome-done', '1');
      } catch {
        /* ignore */
      }
    });
  };
  const ctxDesk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await boot(ctxDesk);
  const pageDesk = await ctxDesk.newPage();
  await runCenitalRemapTests(pageDesk);
  await runFootprintCollisionTests(pageDesk);
  await runWallNoSlideTest(pageDesk);
  await runTeresaParkTest(pageDesk);
  await runModelTests(pageDesk);
  await runExitPersistTests(pageDesk);
  await runDialHitTargetTest(pageDesk);
  const desk = await browserLoop(pageDesk, 'desktop', '1440x900');
  await ctxDesk.close();

  const phone = devices['iPhone X'];
  const ctxPhone = await browser.newContext({ ...phone, hasTouch: true, isMobile: true });
  await boot(ctxPhone);
  await ctxPhone.addInitScript(() => {
    document.documentElement.dataset.chrome = 'phone';
  });
  const pagePhone = await ctxPhone.newPage();
  await runCenitalRemapTests(pagePhone);
  await pagePhone.evaluate(() => window.__playtestQa.setViewMode?.('isometrica'));
  await bootDrive(pagePhone, 'isometrica');
  await step(pagePhone, 0, -0.85, 40);
  await ctxPhone.close();
  await browser.close();

  console.log(JSON.stringify({ ok: true, art: ART, desk, phone: { viewport: '375x812' } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});