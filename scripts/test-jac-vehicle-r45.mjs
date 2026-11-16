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
  process.env.QA_BASE_URL ??
  `${process.env.PREVIEW_URL ?? 'http://127.0.0.1:4196/interactive-portfolio-playtest/preview-integracion/'}`;
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
    window.__playtestQa.jacCancelRoute?.();
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
    // Legacy poses overlap Mentoria under the 5×3 footprint, so they go through the spawn nudge.
    { cx: 34, cy: 24, dir: 'se', label: 'bain-se', building: 'bain' },
    { cx: 31, cy: 27.5, dir: 'sw', label: 'estudio-sw', building: 'estudio' },
    { cx: 38, cy: 20, dir: 'sw', label: 'bain-sw', building: 'bain', contact: true },
  ];
  for (const pose of cases) {
    const hit = await page.evaluate((p) => {
      window.__playtestQa.jacSpawnDrive(p.cx, p.cy, p.dir);
      window.__playtestQa.jacSetGear?.('D');
      const seat = window.__playtestQa.jac();
      const start = { cx: seat.cx, cy: seat.cy, dir: seat.dir };
      let blockedEver = !!window.__playtestQa.jacFootprintBlocked?.();
      for (let i = 0; i < 140; i++) {
        window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
        if (window.__playtestQa.jacFootprintBlocked?.()) blockedEver = true;
      }
      const end = window.__playtestQa.jac();
      const dist = Math.hypot(end.cx - start.cx, end.cy - start.cy);
      const fp = window.__playtestQa.jacRenderOrder(p.building)?.footprint;
      return {
        ...p,
        start,
        end: { cx: end.cx, cy: end.cy, dir: end.dir, mph: end.mph },
        fp,
        blockedEver,
        dist,
        overlap: window.__playtestQa.jacFootprintBlocked?.(),
      };
    }, pose);
    assert.ok(
      Math.hypot(hit.start.cx - pose.cx, hit.start.cy - pose.cy) < 3.5,
      `${pose.label}: spawn nudge should stay local (${JSON.stringify(hit.start)})`,
    );
    assert.ok(!hit.blockedEver, `${pose.label}: 5×3 footprint must never overlap a building or prop (${JSON.stringify(hit)})`);
    assert.ok(!hit.overlap, `${pose.label}: footprint must not overlap building at end`);
    const c = truckCells(hit.end.cx, hit.end.cy, hit.end.dir);
    const ahead = { se: hit.fp.x - c.x1, sw: hit.fp.y - c.y1, nw: c.x0 - (hit.fp.x + hit.fp.w - 1), ne: c.y0 - (hit.fp.y + hit.fp.h - 1) }[hit.end.dir];
    footprintHits.push({ label: pose.label, start: hit.start, end: hit.end, ahead, dist: +hit.dist.toFixed(2) });
    if (pose.contact) {
      assert.ok(
        hit.start.cx === pose.cx && hit.start.cy === pose.cy && hit.start.dir === pose.dir,
        `${pose.label}: contact case must start on a legal pose without a nudge`,
      );
      assert.ok(ahead === 1 && hit.end.mph === 0, `${pose.label}: should stop flush against ${pose.building} (${JSON.stringify({ ahead, ...hit })})`);
      assert.ok(hit.dist < 8.5, `${pose.label}: should not climb deep onto roof (dist=${hit.dist})`);
    }
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

const PARK_SIM_TARGETS = [
  { id: 'teresa', start: { cx: 44, cy: 30, dir: 'se' }, kind: 'door', building: 'teresa' },
  { id: 'uturn', start: { cx: 44, cy: 30, dir: 'se' }, kind: 'tile', goal: { x: 38, y: 30 } },
  { id: 'corner', start: { cx: 36, cy: 20, dir: 'sw' }, kind: 'tile', goal: { x: 44, y: 27 } },
  { id: 'open', start: { cx: 44, cy: 30, dir: 'se' }, kind: 'tile', goal: { x: 39, y: 30 } },
  { id: 'bain', start: { cx: 34, cy: 23, dir: 'se' }, kind: 'door', building: 'bain' },
  { id: 'mentoria', start: { cx: 31, cy: 27.5, dir: 'sw' }, kind: 'door', building: 'mentoria' },
];

async function simulateParkTarget(page, target) {
  return page.evaluate((t) => {
    window.__playtestQa.jacSet?.({
      gear: 'D',
      cx: t.start.cx,
      cy: t.start.cy,
      dir: t.start.dir,
    });
    let goal = t.goal ?? null;
    if (t.kind === 'door') {
      window.__playtestQa.driveParkBuilding?.(t.building);
      const g = window.__playtestQa.jac().driveGoal;
      if (g) goal = { x: g.x, y: g.y };
    } else if (goal) {
      window.__playtestQa.jacDriveTo?.(goal.x, goal.y);
      const g = window.__playtestQa.jac().driveGoal;
      if (g) goal = { x: g.x, y: g.y };
    }
    if (!goal) return { id: t.id, ok: false, reason: 'no goal' };
    let steps = 0;
    let flips = 0;
    let prevDir = window.__playtestQa.jac().dir;
    let minVel = 0;
    let sawR = false;
    for (; steps < 1200; steps++) {
      window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false });
      const j = window.__playtestQa.jac();
      if (j.gear === 'R' || j.vel < -0.08) sawR = true;
      if (j.dir !== prevDir) {
        flips += 1;
        prevDir = j.dir;
      }
      if (j.vel < minVel) minVel = j.vel;
      const g = window.__playtestQa.jac().driveGoal ?? goal;
      const d = Math.hypot(j.cx - g.x, j.cy - g.y);
      if (d < 1.35 && Math.abs(j.vel) < 1.2) break;
    }
    const ms = (steps * 1000) / 60;
    const end = window.__playtestQa.jac();
    const dist = Math.hypot(end.cx - goal.x, end.cy - goal.y);
    const ok = dist < 1.75 && !sawR && end.gear === 'D' && minVel >= -0.05;
    return { id: t.id, ok, dist, ms, flips, gear: end.gear, minVel, sawR };
  }, target);
}

async function runSixTargetParkSim(page) {
  const results = [];
  for (const target of PARK_SIM_TARGETS) {
    await bootDrive(page, 'cenital');
    results.push(await simulateParkTarget(page, target));
  }
  const passed = results.filter((r) => r.ok).length;
  parkSimResults.push(...results.map((r) => ({ id: r.id, ok: r.ok, s: +(r.ms / 1000).toFixed(2), flips: r.flips })));
  assert.ok(
    passed === PARK_SIM_TARGETS.length,
    `tap-to-park sim need 6/6 (got ${passed}/6): ${JSON.stringify(results)}`,
  );
}

async function runDepthOrderTest(page) {
  await bootDrive(page, 'isometrica');
  const poses = [
    { cx: 38, cy: 20.5, dir: 'sw', label: 'bain-southwest' },
    { cx: 34, cy: 24, dir: 'se', label: 'bain-west-start' },
  ];
  for (const pose of poses) {
    const d = await page.evaluate((p) => {
      window.__playtestQa.jacSet?.({ gear: 'D', cx: p.cx, cy: p.cy, dir: p.dir });
      window.__playtestQa.jacDriveStep?.(0, 0, 0, { render: true });
      const truck = window.__playtestQa.jacTruckDepth?.();
      const bain = window.__playtestQa.objectDepth?.('bain');
      const zTruck = window.__playtestQa.jacZIndex?.();
      const zBain = window.__playtestQa.buildingZIndex?.('bain');
      return { truck, bain, zTruck, zBain, behind: truck < bain - 0.05 };
    }, pose);
    assert.ok(d.behind, `${pose.label}: truck footprint should sit behind Bain (${JSON.stringify(d)})`);
    if (d.zTruck != null && d.zBain != null) {
      assert.ok(d.zTruck < d.zBain, `${pose.label}: z-order truck ${d.zTruck} < bain ${d.zBain}`);
    }
    await page.screenshot({
      path: path.join(ART, `r45-depth-${pose.label}.png`),
      fullPage: false,
    });
  }
}

async function runTeresaParkTest(page) {
  await bootDrive(page, 'cenital');
  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ gear: 'D', cx: 44, cy: 30, dir: 'se' });
  });
  const result = await page.evaluate(async () => {
    window.__playtestQa.driveParkBuilding?.('teresa');
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
        ms <= 7500 &&
        flips <= 18 &&
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
      off: pick('.jac-lights-seg__btn[data-val="off"]'),
      auto: pick('.jac-lights-seg__btn[data-val="auto"]'),
      on: pick('.jac-lights-seg__btn[data-val="on"]'),
      engine: pick('.jac-engine-btn'),
    };
  });
  for (const [k, v] of Object.entries(sizes)) {
    if (!v) continue;
    assert.ok(v.w >= 44 && v.h >= 44, `${k} control ${v.w}x${v.h} < 44px`);
  }
  await page.click('.jac-lights-seg__btn[data-val="off"]');
  let snap = await snapshot(page);
  assert.equal(snap.lights, 'off', 'off label tap sets lights off');
  assert.ok(snap.engineOn, 'off tap must not toggle engine');
  await page.click('.jac-lights-seg__btn[data-val="on"]');
  snap = await snapshot(page);
  assert.equal(snap.lights, 'on', 'on label tap sets lights on');
  await page.click('.jac-engine-btn');
  snap = await snapshot(page);
  const engineBefore = snap.engineOn;
  await page.click('.jac-lights-seg__btn[data-val="auto"]');
  snap = await snapshot(page);
  assert.equal(snap.lights, 'auto', 'auto label tap sets lights auto');
  assert.equal(snap.engineOn, engineBefore, 'lights tap must not toggle engine');
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

const KEY_FOR = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

/** Live input through the scene's own tick: keyboard on desktop, the stick feed on touch. */
async function holdInput(page, touch, dirs, ms) {
  const vec = { x: 0, y: 0 };
  for (const d of dirs) {
    if (d === 'up') vec.y -= 1;
    if (d === 'down') vec.y += 1;
    if (d === 'left') vec.x -= 1;
    if (d === 'right') vec.x += 1;
  }
  if (touch) await page.evaluate((v) => window.__playtestQa.jacStick(v), vec);
  else for (const d of dirs) await page.keyboard.down(KEY_FOR[d]);
  const start = await snapshot(page);
  const samples = [start];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await wait(40);
    samples.push(await snapshot(page));
  }
  if (touch) await page.evaluate(() => window.__playtestQa.jacStick(null));
  else for (const d of dirs) await page.keyboard.up(KEY_FOR[d]);
  const end = samples.at(-1);
  let turned = 0;
  for (let i = 1; i < samples.length; i++) {
    turned += Math.abs((((samples[i].heading - samples[i - 1].heading + 6) % 4) + 4) % 4 - 2);
  }
  const along = (s) => {
    const a = start.heading * (Math.PI / 2);
    return (s.cx - start.cx) * Math.cos(a) + (s.cy - start.cy) * Math.sin(a);
  };
  return {
    start,
    end,
    dist: Math.hypot(end.cx - start.cx, end.cy - start.cy),
    along: along(end),
    turned,
    minVel: Math.min(...samples.map((s) => s.vel)),
    maxVel: Math.max(...samples.map((s) => s.vel)),
    gears: [...new Set(samples.map((s) => s.gear))],
    samples,
  };
}

async function tapGear(page, touch, gear) {
  const btn = page.locator(`.jac-gear[data-val="${gear}"]:visible`).first();
  if (touch) await btn.tap();
  else await btn.click();
  await page.waitForFunction((g) => window.__playtestQa.jac()?.gear === g, gear, { timeout: 4000 });
}

/** Fresh page, real Get in at the parked spawn (no QA pose rewrite). */
async function freshGetIn(page, view) {
  await page.goto('about:blank');
  await page.goto(`${BASE}#view=0,0,1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForQa(page);
  await page.evaluate((v) => {
    window.__playtestQa.setViewMode?.(v);
    window.__playtestQa.setLayout?.('map');
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
  }, view);
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 15_000 });
  await wait(250);
}

async function runDriveOffSpawnTests(page, { touch, view, tag }) {
  await freshGetIn(page, view);
  const spawn = await snapshot(page);
  assert.ok(
    Math.hypot(spawn.cx - 25, spawn.cy - 17) < 0.01 && spawn.dir === 'se',
    `${tag}: fresh Get in should seat at spawn (25,17) SE, got ${JSON.stringify([spawn.cx, spawn.cy, spawn.dir])}`,
  );
  assert.equal(spawn.gear, 'P', `${tag}: Get in starts in P`);
  assert.equal(await page.evaluate(() => window.__playtestQa.jacFootprintBlocked()), false, `${tag}: spawn pose is legal`);
  await tapGear(page, touch, 'D');
  const fwd = await holdInput(page, touch, ['up'], 2200);
  assert.ok(
    fwd.along >= 5,
    `${tag}: stick up in D must drive forward from spawn ≥5 tiles (along=${fwd.along.toFixed(2)}, maxMph=${Math.max(...fwd.samples.map((s) => s.mph))})`,
  );
  assert.ok(fwd.turned < 0.02, `${tag}: straight stick up must not turn (turned=${fwd.turned})`);
  assert.deepEqual(fwd.gears, ['D'], `${tag}: gear stays D while driving off spawn`);
  await page.screenshot({ path: path.join(ART, `r45d-${tag}-spawn-drive.png`) });

  for (const p of [
    { cx: 30, cy: 40, dir: 'se' },
    { cx: 12, cy: 20, dir: 'se' },
  ]) {
    const seat = await page.evaluate((q) => window.__playtestQa.jacSpawnDrive(q.cx, q.cy, q.dir), p);
    const legal = await page.evaluate(() => !window.__playtestQa.jacFootprintBlocked());
    assert.ok(legal, `${tag}: spawn at ${JSON.stringify(p)} must be seated on a legal 5×3 pose (${JSON.stringify([seat.cx, seat.cy, seat.dir])})`);
    await tapGear(page, touch, 'D');
    const run = await holdInput(page, touch, ['up'], 2200);
    assert.ok(
      run.along >= 5,
      `${tag}: drive forward from ${JSON.stringify(p)} (seated ${seat.cx.toFixed(2)},${seat.cy.toFixed(2)} ${seat.dir}) ≥5 tiles, got ${run.along.toFixed(2)}`,
    );
    assert.ok(run.turned < 0.02, `${tag}: no turning on straight stick from ${JSON.stringify(p)}`);
  }
}

async function runNoInPlaceRotationTests(page, { touch, view, tag }) {
  await freshGetIn(page, view);
  const inP = await holdInput(page, touch, ['up', 'left'], 1200);
  assert.ok(inP.dist < 0.01 && inP.turned < 1e-6, `${tag}: P + gas + steer must not move or rotate (${inP.dist}, ${inP.turned})`);

  await tapGear(page, touch, 'D');
  const arc = await holdInput(page, touch, ['up', 'left'], 2200);
  assert.ok(arc.dist > 2, `${tag}: up+left from spawn must drive, not pivot (dist=${arc.dist.toFixed(2)})`);
  const pathLen = arc.samples.reduce(
    (acc, s, i, all) => (i ? acc + Math.hypot(s.cx - all[i - 1].cx, s.cy - all[i - 1].cy) : 0),
    0,
  );
  assert.ok(
    arc.turned <= pathLen * 0.4 + 0.02,
    `${tag}: heading change must follow travelled arc (turned=${arc.turned.toFixed(2)} q over ${pathLen.toFixed(2)} tiles)`,
  );

  await page.evaluate(() => window.__playtestQa.jacSpawnDrive(12, 20, 'se'));
  await tapGear(page, touch, 'D');
  await holdInput(page, touch, ['up'], 2200);
  const pinned = await snapshot(page);
  for (const steer of ['left', 'right']) {
    const push = await holdInput(page, touch, ['up', steer], 1500);
    assert.ok(
      push.turned < 1e-6 && push.dist < 0.02,
      `${tag}: gas+${steer} against an obstacle at speed 0 must not rotate (turned=${push.turned}, dist=${push.dist}, from ${pinned.cx.toFixed(2)},${pinned.cy.toFixed(2)})`,
    );
    assert.ok(Math.max(...push.samples.map((s) => s.mph)) === 0, `${tag}: speedometer stays 0 when pinned`);
  }
  await wait(600);
  const coast = await holdInput(page, touch, ['left'], 1000);
  assert.ok(coast.turned < 1e-6, `${tag}: steer alone at rest must not rotate (turned=${coast.turned})`);
}

async function runGearSemanticsTests(page, { touch, view, tag }) {
  await freshGetIn(page, view);
  await page.evaluate(() => window.__playtestQa.jacSpawnDrive(30, 43.5, 'sw'));
  await tapGear(page, touch, 'D');
  await holdInput(page, touch, ['up'], 700);
  await holdInput(page, touch, [], 1400);
  const stoppedD = await snapshot(page);
  assert.ok(Math.abs(stoppedD.vel) < 1e-6, `${tag}: released stick coasts to 0 in D`);
  const dDown = await holdInput(page, touch, ['down'], 3000);
  assert.deepEqual(dDown.gears, ['D'], `${tag}: D + down must never shift to R (gears ${dDown.gears})`);
  assert.ok(dDown.minVel >= 0 && dDown.dist < 0.01, `${tag}: D + down from rest stays at 0 (minVel=${dDown.minVel}, dist=${dDown.dist})`);

  await holdInput(page, touch, ['up'], 600);
  const fast = await snapshot(page);
  assert.ok(fast.vel > 2, `${tag}: D gas builds speed (vel=${fast.vel})`);
  const brake = await holdInput(page, touch, ['down'], 1500);
  const stopAt = brake.samples.findIndex((s) => s.vel === 0);
  assert.ok(stopAt > 0 && stopAt * 40 < 700, `${tag}: D + down brakes to 0 quickly (sample ${stopAt})`);
  assert.ok(brake.minVel >= 0, `${tag}: D brake never reverses (minVel=${brake.minVel})`);
  assert.deepEqual(brake.gears, ['D'], `${tag}: braking keeps D`);
  const afterStop = brake.samples.slice(stopAt);
  assert.ok(
    Math.hypot(afterStop.at(-1).cx - afterStop[0].cx, afterStop.at(-1).cy - afterStop[0].cy) < 0.01,
    `${tag}: D + down holds at 0 after the stop`,
  );

  await tapGear(page, touch, 'R');
  const rev = await holdInput(page, touch, ['up'], 900);
  assert.ok(rev.minVel < -1 && rev.maxVel <= 0, `${tag}: R + up is reverse throttle (min=${rev.minVel}, max=${rev.maxVel})`);
  assert.ok(rev.along < -1.2, `${tag}: R + up moves backward along heading (along=${rev.along})`);
  const rBrake = await holdInput(page, touch, ['down'], 1500);
  const rStop = rBrake.samples.findIndex((s) => s.vel === 0);
  assert.ok(rStop > 0 && rStop * 40 < 700, `${tag}: R + down brakes to 0 (sample ${rStop})`);
  assert.ok(rBrake.maxVel <= 0, `${tag}: R brake never drives forward (max=${rBrake.maxVel})`);
  assert.deepEqual(rBrake.gears, ['R'], `${tag}: R + down keeps R`);
  const rRest = await holdInput(page, touch, ['down'], 1500);
  assert.ok(rRest.dist < 0.01 && rRest.minVel === 0 && rRest.maxVel === 0, `${tag}: R + down at rest stays at 0`);

  const fromR = await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ gear: 'R', cx: 44, cy: 30, dir: 'se' });
    window.__playtestQa.driveParkBuilding?.('teresa');
    let sawR = false;
    let minVel = 0;
    for (let i = 0; i < 600; i++) {
      window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false });
      const j = window.__playtestQa.jac();
      if (j.gear === 'R') sawR = true;
      minVel = Math.min(minVel, j.vel);
      if (!j.driveGoal) break;
    }
    return { sawR, minVel };
  });
  assert.ok(!fromR.sawR && fromR.minVel >= 0, `${tag}: tap-to-park from R must drive in D only (${JSON.stringify(fromR)})`);
}

function truckCells(cx, cy, dir) {
  const [w, h] = dir === 'se' || dir === 'nw' ? [5, 3] : [3, 5];
  const ox = Math.round(cx - (w - 1) / 2);
  const oy = Math.round(cy - (h - 1) / 2);
  return { x0: ox, y0: oy, x1: ox + w - 1, y1: oy + h - 1 };
}

/** Nearest legal pose from `cands`; behind poses must also overlap the building on screen. */
async function findSweepPose(page, building, cands, behind) {
  return page.evaluate(
    ({ b, cands, behind }) => {
      const q = window.__playtestQa;
      let pixelTries = 0;
      for (const p of cands) {
        q.jacSet?.({ gear: 'D', cx: p.cx, cy: p.cy, dir: p.dir });
        q.jacCancelRoute?.();
        const j = q.jac();
        if (Math.hypot(j.cx - p.cx, j.cy - p.cy) > 1e-6 || j.dir !== p.dir || q.jacFootprintBlocked()) continue;
        q.jacDriveStep?.(0, 0, 0, { render: true });
        const order = q.jacRenderOrder(b);
        if (!behind) return { pose: p, order, occ: null };
        if (order.boundsOverlap < 900) continue;
        const occ = q.jacOcclusion(b);
        if (occ.overlap >= 50) return { pose: p, order, occ };
        if (++pixelTries >= 8) break;
      }
      return null;
    },
    { b: building, cands, behind },
  );
}

/** Rendered-pixel and display-list occlusion: every facing, behind and in front of Bain and Estudio. */
async function runRenderedOcclusionTests(page, { touch, tag }) {
  await freshGetIn(page, 'isometrica');
  await page.evaluate(() => window.__playtestQa.setZoom?.(1));
  await tapGear(page, touch, 'D');

  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ gear: 'D', cx: 38, cy: 20, dir: 'sw' });
    window.__playtestQa.jacCancelRoute?.();
  });
  await holdInput(page, touch, ['up'], 1800);
  await wait(200);
  const bainStop = await page.evaluate(() => ({
    j: window.__playtestQa.jac(),
    order: window.__playtestQa.jacRenderOrder('bain'),
    occ: window.__playtestQa.jacOcclusion('bain'),
    blocked: window.__playtestQa.jacFootprintBlocked(),
  }));
  assert.ok(Math.abs(bainStop.j.cx - 38) < 0.01 && bainStop.j.cy > 20.3 && bainStop.j.cy < 20.55, `${tag}: Bain SW approach stops at ~(38,20.5) (${bainStop.j.cx},${bainStop.j.cy})`);
  assert.ok(!bainStop.blocked, `${tag}: Bain stop footprint is legal`);
  assert.ok(bainStop.order.sameLayer, `${tag}: truck and Bain share the sorted objects layer`);
  assert.ok(
    bainStop.order.truckIndex < bainStop.order.buildingIndex && bainStop.order.jacAbove.length === 0,
    `${tag}: rendered order truck behind Bain at (38,20.5) SW ${JSON.stringify(bainStop.order)}`,
  );
  assert.ok(bainStop.occ.overlap > 50, `${tag}: Bain stop pose must overlap Bain on screen (${JSON.stringify(bainStop.occ)})`);
  assert.equal(bainStop.occ.leak, 0, `${tag}: truck pixels drawn over Bain's roof at (38,20.5) SW ${JSON.stringify(bainStop.occ)}`);
  await page.screenshot({ path: path.join(ART, `r45d-${tag}-bain-sw-stop.png`) });

  await page.evaluate(() => {
    window.__playtestQa.jacSet?.({ gear: 'D', cx: 25.7, cy: 31.5, dir: 'sw' });
    window.__playtestQa.jacCancelRoute?.();
  });
  if (touch) await page.evaluate(() => window.__playtestQa.jacStick({ x: 0, y: -1 }));
  else await page.keyboard.down('ArrowUp');
  let maxLeak = 0;
  let maxOverlap = 0;
  let worstOrder = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 1800) {
    const s = await page.evaluate(() => ({
      occ: window.__playtestQa.jacOcclusion('estudio'),
      order: window.__playtestQa.jacRenderOrder('estudio'),
    }));
    if (s.occ.overlap > maxOverlap) maxOverlap = s.occ.overlap;
    if (s.occ.leak > maxLeak) maxLeak = s.occ.leak;
    if (s.order.truckIndex > s.order.buildingIndex || s.order.jacAbove.length) worstOrder = s.order;
    await wait(60);
  }
  if (touch) await page.evaluate(() => window.__playtestQa.jacStick(null));
  else await page.keyboard.up('ArrowUp');
  assert.ok(maxOverlap > 50, `${tag}: Estudio west approach overlaps the roof on screen (max ${maxOverlap})`);
  assert.equal(maxLeak, 0, `${tag}: truck painted over Estudio's roof while driving in from (25.7,31.5) SW`);
  assert.equal(worstOrder, null, `${tag}: Estudio approach render order ${JSON.stringify(worstOrder)}`);
  await page.screenshot({ path: path.join(ART, `r45d-${tag}-estudio-west.png`) });

  for (const building of ['bain', 'estudio']) {
    const fp = (await page.evaluate((b) => window.__playtestQa.jacRenderOrder(b), building)).footprint;
    const bx1 = fp.x + fp.w - 1;
    const by1 = fp.y + fp.h - 1;
    for (const dir of ['se', 'sw', 'nw', 'ne']) {
      for (const side of ['behind', 'front']) {
        const cands = [];
        for (let y = fp.y - 9; y <= by1 + 9; y += 0.5) {
          for (let x = fp.x - 9; x <= bx1 + 9; x += 0.5) {
            const c = truckCells(x, y, dir);
            const behind = c.x1 < fp.x || c.y1 < fp.y;
            const front = c.x0 > bx1 || c.y0 > by1;
            if (behind === front) continue;
            if ((side === 'behind') !== behind) continue;
            const gap = Math.max(fp.x - c.x1, fp.y - c.y1, c.x0 - bx1, c.y0 - by1);
            const lateral = Math.max(0, fp.x - c.x1 - 1, c.x0 - bx1 - 1) + Math.max(0, fp.y - c.y1 - 1, c.y0 - by1 - 1);
            cands.push({ cx: x, cy: y, dir, score: gap + lateral * 2 });
          }
        }
        cands.sort((a, b) => a.score - b.score);
        const hit = await findSweepPose(page, building, cands, side === 'behind');
        if (!hit) continue;
        if (side === 'behind') {
          assert.equal(hit.occ.leak, 0, `${tag}: ${building} ${dir} behind ${JSON.stringify(hit.pose)} leaks ${JSON.stringify(hit.occ)}`);
          assert.ok(hit.order.truckIndex < hit.order.buildingIndex, `${tag}: ${building} ${dir} behind render order ${JSON.stringify(hit.order)}`);
        } else {
          assert.ok(hit.order.truckIndex > hit.order.buildingIndex, `${tag}: ${building} ${dir} in front must draw over it ${JSON.stringify(hit.order)}`);
        }
        occlusionHits.push({
          tag,
          building,
          dir,
          side,
          pose: hit.pose,
          order: [hit.order.truckIndex, hit.order.buildingIndex],
          leak: hit.occ?.leak ?? null,
          edge: hit.occ?.edge ?? null,
          overlap: hit.occ?.overlap ?? null,
        });
      }
    }
  }
  const behindDirs = new Set(occlusionHits.filter((h) => h.tag === tag && h.side === 'behind').map((h) => `${h.building}:${h.dir}`));
  assert.ok(behindDirs.size === 8, `${tag}: need behind-building pixel coverage in every facing (got ${[...behindDirs]})`);
  const frontDirs = new Set(occlusionHits.filter((h) => h.tag === tag && h.side === 'front').map((h) => `${h.building}:${h.dir}`));
  assert.ok(frontDirs.size === 8, `${tag}: need in-front render-order coverage in every facing (got ${[...frontDirs]})`);
}

const occlusionHits = [];
const parkSimResults = [];
const footprintHits = [];

async function main() {
  const t0 = Date.now();
  const lap = (name) => console.error(`[r45 ${((Date.now() - t0) / 1000).toFixed(1)}s] ${name} ok`);
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
  lap('runCenitalRemapTests');
  await runFootprintCollisionTests(pageDesk);
  lap('runFootprintCollisionTests');
  await runWallNoSlideTest(pageDesk);
  lap('runWallNoSlideTest');
  await runSixTargetParkSim(pageDesk);
  lap('runSixTargetParkSim');
  await runTeresaParkTest(pageDesk);
  lap('runTeresaParkTest');
  await runDepthOrderTest(pageDesk);
  lap('runDepthOrderTest');
  await runModelTests(pageDesk);
  lap('runModelTests');
  await runExitPersistTests(pageDesk);
  lap('runExitPersistTests');
  await runDialHitTargetTest(pageDesk);
  lap('runDialHitTargetTest');
  for (const view of ['isometrica', 'cenital']) {
    const opts = { touch: false, view, tag: `desktop-${view}` };
    await runDriveOffSpawnTests(pageDesk, opts);
    lap('runDriveOffSpawnTests');
    await runNoInPlaceRotationTests(pageDesk, opts);
    lap('runNoInPlaceRotationTests');
    await runGearSemanticsTests(pageDesk, opts);
    lap('runGearSemanticsTests');
  }
  await runRenderedOcclusionTests(pageDesk, { touch: false, tag: 'desktop' });
  lap('runRenderedOcclusionTests');
  const desk = await browserLoop(pageDesk, 'desktop', '1440x900');
  lap('browserLoop');
  await ctxDesk.close();

  const phone = devices['iPhone X'];
  const ctxPhone = await browser.newContext({ ...phone, hasTouch: true, isMobile: true });
  await boot(ctxPhone);
  await ctxPhone.addInitScript(() => {
    document.documentElement.dataset.chrome = 'phone';
  });
  const pagePhone = await ctxPhone.newPage();
  await runCenitalRemapTests(pagePhone);
  lap('runCenitalRemapTests');
  await pagePhone.evaluate(() => window.__playtestQa.setViewMode?.('isometrica'));
  await bootDrive(pagePhone, 'isometrica');
  await step(pagePhone, 0, -0.85, 40);
  for (const view of ['isometrica', 'cenital']) {
    const opts = { touch: true, view, tag: `iphone-${view}` };
    await runDriveOffSpawnTests(pagePhone, opts);
    lap('runDriveOffSpawnTests');
    await runNoInPlaceRotationTests(pagePhone, opts);
    lap('runNoInPlaceRotationTests');
    await runGearSemanticsTests(pagePhone, opts);
    lap('runGearSemanticsTests');
  }
  await runRenderedOcclusionTests(pagePhone, { touch: true, tag: 'iphone' });
  lap('runRenderedOcclusionTests');
  const phoneLoop = await browserLoop(pagePhone, 'iphone', '375x812');
  lap('browserLoop');
  await ctxPhone.close();
  await browser.close();

  console.log(
    JSON.stringify({ ok: true, art: ART, desk, phone: phoneLoop, parkSim: parkSimResults, footprint: footprintHits, occlusion: occlusionHits }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});