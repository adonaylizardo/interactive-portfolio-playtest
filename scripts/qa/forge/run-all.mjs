#!/usr/bin/env node
// Forge cumulative headless gate for the Jac T9 truck (r45h Sentinel + r45i Forge + r45j Forge probes).
// Drives the REAL JacT9 class (bundled with esbuild, pixi stubbed) with the same input the browser feeds it.
//
// usage:  node scripts/qa/forge/run-all.mjs [--repo <checkout with src/ + node_modules>] [--dt 0.0166667,0.1,0.25]
//                                           [--only check1,check2] [--jobs N] [--json out.json]
// exit:   0 = every check passes at every dt, 1 = at least one FAIL, 2 = harness error (bundle/worker crash/timeout)
//
// Every threshold is in THRESH below. A check never relies on escapeGaveUp alone: r45j stopped arming it, so the
// GU-based r45i metrics are kept for history and paired with GU-independent behaviour metrics (monitor()).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const TOP = 4.5 * 1.15; // DRIVE_TILES_PER_S (WALK_TILES_PER_S 4.5 × 1.15)
const DIRS = ['se', 'sw', 'nw', 'ne'];
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
const wrap = (d) => { while (d > 2) d -= 4; while (d < -2) d += 4; return d; };
const PROPS = { porch: [29.5, 21], cactus: [26.5, 18] };
// isolated pocket that a qaSpawn can reach but driving cannot (r45j trap2/pocket.mjs); excluded from trap counts
const inPocket = (x, y) => x >= 24.5 && x <= 25.5 && y >= 22.5 && y <= 24.5;

export const THRESH = {
  // r45h Sentinel
  ovRuns: 0, // runs that end any frame with the 5×3 footprint overlapping
  h1AutoTurn: 0, h1SwapLat: 0.05, // straight gas, no steer: facing changes / lateral tiles in a swap frame
  h3bShuttle: 0, h3bDead: 0, h3bVelBad: 0, // 1.5-tile shuttle box, ≥0.5 s dead stop, |vel−displacement|>0.5 t/s frames
  honestPct: 99, honestOverlap: 0, honestWide35: 0,
  arrive237: 2.0, arriveBain: 20, arriveVolaris: 30, arriveOverlap: 0, parkDoorDist: 4.5,
  g10Pct: 80, // turn at speed: heading 90° within 3 s and no ≥0.5 s stop (agent gate used 75%)
  // r45i Forge
  turnPct: 80, snapAtGU: 0, hardStopAtGU: 0,
  swapJumpQ: 0.1, swapSpeedMin: 0.85, swapSpeedMax: 1.2,
  monkeyTrap30: 0, monkeyGUPct: 2, monkeySnap06: 0,
  esc2Trapped: 0, trapTrapped: 0, mtrapTrapped: 0,
  // r45j Forge (GU-independent monitor, applied to every manual run)
  snap04: 0, // sprite change whose 1-frame heading jump beats the wheel's yaw (2.4 q/s·|steer|·dt) by >0.4 q (r45i HIGH-A)
  flips: 0, // D + gas held: vel from >+1 to <−0.5 within one frame (r45j HIGH-2 signature)
  backDMaxRun: 0.25, // longest continuous backward travel (tiles) along the sprite in D with gas held (r45j HIGH-1)
  jumpExcess: 0.05, // per frame |displacement| − 1.1·TOP·dt may not exceed this (teleport / lateral hop / speed surge)
  offSpriteDeg: 60, restOffSpriteDeg: 60, // hidden heading vs drawn sprite, any frame / at rest
  shortSwap: 0, // sprite swaps after <0.1 tile of travel since the previous swap
  shuttle3: 0, // ≥2 D velocity reversals and ≥6 s inside a 3-tile box during 12 s gas+steer into a prop or the edge
  escNeedRPct: 10, escTrapped: 0, // stuck cases that steering alone (no R) cannot free; not freed at all
};

// ---------------------------------------------------------------- worker side
async function loadJac(bundle) {
  globalThis.window = globalThis;
  const mk = () => new Proxy(function () {}, {
    get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; },
    set(t, p, v) { t[p] = v; return true; }, apply() { return mk(); }, construct() { return mk(); },
  });
  const S = mk();
  await import(pathToFileURL(bundle).href);
  const T = globalThis.__T;
  const obj = T.objects.find((o) => o.id === 'fill/jac-t9');
  const jac = new T.JacT9(obj, { container: S, visual: new Proxy({}, { get: () => S }), tapBox: new Map(), onStuck: () => {} });
  jac.setMode('drive');
  return { T, jac };
}

// GU-independent per-frame monitor. step() is the only way checks advance the truck in manual runs.
function monitor(jac, dt) {
  const M = { frames: 0, snap04: 0, snapEx: null, flips: 0, flipEx: null, backDMaxRun: 0, backDTotal: 0, backEx: null,
    jumpMax: 0, jumps: 0, jumpEx: null, offMax: 0, restOffMax: 0, restOffEx: null, shortSwap: 0, shortEx: null, revs: 0 };
  let run = 0, travel = Infinity, prevSign = 0;
  const reset = () => { run = 0; travel = Infinity; prevSign = 0; };
  const step = (inp, tag = '') => {
    const px = jac.cx, py = jac.cy, pd = jac.dir, ph = jac.heading, pv = jac.vel;
    jac.update(dt, inp); M.frames++;
    const dx = jac.cx - px, dy = jac.cy - py, dist = Math.hypot(dx, dy);
    const fh = wrap(jac.heading - ph);
    const gasD = jac.gear === 'D' && inp.dy < 0;
    // a facing change whose heading jump exceeds what the wheel can yaw this frame (TURN_RATE 2.4 q/s × |steer|) by >0.4 q
    if (pd !== jac.dir && Math.abs(fh) > 0.4 + 2.4 * Math.min(dt, 0.25) * Math.abs(inp.dx)) { M.snap04++; if (!M.snapEx) M.snapEx = `${tag} (${px.toFixed(2)},${py.toFixed(2)}) ${pd}->${jac.dir} ${(fh * 90).toFixed(0)}deg v${pv.toFixed(2)}->${jac.vel.toFixed(2)}`; }
    if (gasD && pv > 1 && jac.vel < -0.5) { M.flips++; if (!M.flipEx) M.flipEx = `${tag} (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) v${pv.toFixed(2)}->${jac.vel.toFixed(2)}`; }
    const sg = jac.vel > 0.3 ? 1 : jac.vel < -0.3 ? -1 : 0;
    if (gasD && sg && prevSign && sg !== prevSign) M.revs++;
    if (sg) prevSign = sg;
    const along = dx * V[jac.dir][0] + dy * V[jac.dir][1];
    if (gasD && along < -1e-4) { run += -along; M.backDTotal += -along; if (run > M.backDMaxRun) { M.backDMaxRun = run; M.backEx = `${tag} to (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) run ${run.toFixed(2)}t`; } }
    else if (along > 1e-4 || !gasD) run = 0;
    // the frame's straight-line displacement can never exceed the path the truck may drive in it (top speed × dt)
    const excess = dist - 1.1 * TOP * Math.min(dt, 0.25);
    if (excess > M.jumpMax) { M.jumpMax = excess; M.jumpEx = `${tag} (${px.toFixed(2)},${py.toFixed(2)},${pd})->(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) ${dist.toFixed(3)}t in ${dt.toFixed(3)}s`; }
    if (excess > THRESH.jumpExcess) M.jumps++;
    const off = Math.abs(wrap(jac.heading - DIRS.indexOf(jac.dir))) * 90;
    if (off > M.offMax) M.offMax = off;
    if (Math.abs(jac.vel) < 0.05 && dist < 1e-3 && off > M.restOffMax) { M.restOffMax = off; M.restOffEx = `${tag} (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) h${jac.heading.toFixed(2)}`; }
    if (pd !== jac.dir) { if (travel < 0.1) { M.shortSwap++; if (!M.shortEx) M.shortEx = `${tag} (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) ${pd}->${jac.dir} after ${travel.toFixed(3)}t gear ${jac.gear}`; } travel = 0; }
    else travel += dist;
  };
  return { M, step, reset };
}
const monFails = (M, f, keys = ['snap04', 'flips', 'backDMaxRun', 'jumps', 'offSpriteDeg', 'restOffSpriteDeg', 'shortSwap']) => {
  const t = THRESH;
  if (keys.includes('snap04') && M.snap04 > t.snap04) f.push(`1-frame snap >0.4q: ${M.snap04} (${M.snapEx})`);
  if (keys.includes('flips') && M.flips > t.flips) f.push(`fwd->reverse flips in D+gas: ${M.flips} (${M.flipEx})`);
  if (keys.includes('backDMaxRun') && M.backDMaxRun > t.backDMaxRun) f.push(`backward in D+gas run ${M.backDMaxRun.toFixed(2)}t > ${t.backDMaxRun} (total ${M.backDTotal.toFixed(1)}t; ${M.backEx})`);
  if (keys.includes('jumps') && M.jumps > 0) f.push(`frame jumps excess>${t.jumpExcess}t: ${M.jumps}, max ${M.jumpMax.toFixed(3)} (${M.jumpEx})`);
  if (keys.includes('offSpriteDeg') && M.offMax > t.offSpriteDeg) f.push(`heading off sprite ${M.offMax.toFixed(0)}deg > ${t.offSpriteDeg}`);
  if (keys.includes('restOffSpriteDeg') && M.restOffMax > t.restOffSpriteDeg) f.push(`at-rest heading off sprite ${M.restOffMax.toFixed(0)}deg (${M.restOffEx})`);
  if (keys.includes('shortSwap') && M.shortSwap > t.shortSwap) f.push(`sprite swaps after <0.1t travel: ${M.shortSwap} (${M.shortEx})`);
};
const monSummary = (M) => ({ snap04: M.snap04, flips: M.flips, backDMaxRun: +M.backDMaxRun.toFixed(3), backDTotal: +M.backDTotal.toFixed(1),
  jumps: M.jumps, jumpMax: +M.jumpMax.toFixed(3), offMaxDeg: +M.offMax.toFixed(0), restOffMaxDeg: +M.restOffMax.toFixed(0), shortSwap: M.shortSwap });

const freeAhead = (jac, x, y, d, r) => { for (let s = 0; s <= r; s += 0.25) if (jac.poseBlocked(x + V[d][0] * s, y + V[d][1] * s, d) !== 0) return false; return true; };
// poses within 7 tiles whose nose points at the prop (h3b / shut3 / esc2 selection)
function* propPoses(jac, [qx, qy], minY = 1) {
  for (let y = Math.max(minY, Math.round(qy - 7)); y <= qy + 7; y++) for (let x = Math.round(qx - 7); x <= qx + 7; x++) for (const d of DIRS) for (const s of [-1, 1]) {
    if (jac.poseBlocked(x, y, d) !== 0) continue; jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y) continue;
    const v = V[d], to = [qx - x, qy - y], dist = Math.hypot(...to); if (dist > 7 || dist < 0.5 || (to[0] * v[0] + to[1] * v[1]) / dist < 0.5) continue;
    yield [x, y, d, s];
  }
}

const CHECKS = {
  // ---- r45h Sentinel (sentinel-r45h/ov.mjs)
  ov(jac, T, dt) {
    let n = 0; const ex = [];
    for (let y = 2; y < 62; y += 4) for (let x = 2; x < 62; x += 4) for (const d of DIRS) for (const s of [-1, 0, 1]) {
      if (jac.poseBlocked(x, y, d) !== 0) continue; jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y || jac.dir !== d) continue;
      let t = 0; while (t < 10) { jac.update(dt, { dx: s, dy: -1 }); t += dt; if (jac.poseBlocked(jac.cx, jac.cy, jac.dir) > 0) { n++; if (ex.length < 3) ex.push(`(${x},${y},${d}) s=${s}`); break; } }
    }
    const f = []; if (n > THRESH.ovRuns) f.push(`overlap runs ${n} ${ex.join(' ')}`);
    return { m: { overlapRuns: n }, f };
  },
  // ---- r45h Sentinel (h1.mjs): straight gas never changes facing
  h1(jac, T, dt) {
    let runs = 0, auto = 0, lat = 0; const ex = [];
    for (let y = 3; y < 60; y += 3) for (let x = 3; x < 60; x += 3) for (const d of DIRS) {
      if (jac.poseBlocked(x, y, d) !== 0 || !jac.driveBoxWalkable(x, y)) continue; jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y || jac.dir !== d) continue;
      runs++; let t = 0, px = jac.cx, py = jac.cy;
      while (t < 4) { jac.update(dt, { dx: 0, dy: -1 }); t += dt;
        if (jac.dir !== d) { auto++; const v = V[jac.dir]; lat = Math.max(lat, Math.abs((jac.cx - px) * v[1] - (jac.cy - py) * v[0])); if (ex.length < 3) ex.push(`(${x},${y},${d})->${jac.dir}`); break; }
        px = jac.cx; py = jac.cy; }
    }
    const f = []; if (auto > THRESH.h1AutoTurn) f.push(`no-steer facing changes ${auto}/${runs} ${ex.join(' ')}`); if (lat > THRESH.h1SwapLat) f.push(`swap-frame lateral ${lat.toFixed(3)}`);
    return { m: { runs, autoTurn: auto, swapLat: +lat.toFixed(3) }, f };
  },
  // ---- r45h Sentinel (h3b.mjs): shuttle in a 1.5-tile box, dead stops, honest speed — porch + cactus
  h3b(jac, T, dt) {
    const m = {}, f = [];
    for (const [pn, q] of Object.entries(PROPS)) {
      let runs = 0, sh = 0, dead = 0, velBad = 0, shEx = '', deadEx = '';
      for (const [x, y, d, s] of propPoses(jac, q, -99)) {
        runs++; let t = 0, H = [], hc = 0, ph = jac.heading, best = 0, still = 0, deadThis = 0;
        while (t < 12) { const px = jac.cx, py = jac.cy; jac.update(dt, { dx: s, dy: -1 }); t += dt;
          const vv = V[jac.dir]; const along = ((jac.cx - px) * vv[0] + (jac.cy - py) * vv[1]) / dt; if (Math.abs(jac.vel - along) > 0.5) velBad++;
          const st = Math.hypot(jac.cx - px, jac.cy - py); if (st < 0.08 * dt && Math.abs(jac.vel) < 0.2) still += dt; else still = 0; if (still >= 0.5) deadThis = still;
          hc += wrap(jac.heading - ph); ph = jac.heading; H.push([t, jac.cx, jac.cy, hc]);
          let j = H.length - 1; while (j > 0 && t - H[j][0] < 3) j--; if (t - H[j][0] < 3) continue;
          let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, pl = 0;
          for (let k = j; k < H.length; k++) { mnx = Math.min(mnx, H[k][1]); mxx = Math.max(mxx, H[k][1]); mny = Math.min(mny, H[k][2]); mxy = Math.max(mxy, H[k][2]); if (k > j) pl += Math.hypot(H[k][1] - H[k - 1][1], H[k][2] - H[k - 1][2]); }
          if (Math.max(mxx - mnx, mxy - mny) < 1.5 && Math.abs(hc - H[j][3]) < 0.33 && pl > 0.5) best += dt; }
        if (best > 0) { sh++; if (!shEx) shEx = `(${x},${y},${d}) s=${s} ${best.toFixed(1)}s`; }
        if (deadThis >= 0.5) { dead++; if (!deadEx) deadEx = `(${x},${y},${d}) s=${s} ${deadThis.toFixed(1)}s at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)})`; }
      }
      m[pn] = { runs, shuttle15: sh, dead, velBad };
      if (sh > THRESH.h3bShuttle) f.push(`${pn} shuttle(1.5 box) ${sh}/${runs} ${shEx}`);
      if (dead > THRESH.h3bDead) f.push(`${pn} dead stops ${dead}/${runs} ${deadEx}`);
      if (velBad > THRESH.h3bVelBad) f.push(`${pn} vel-vs-displacement bad frames ${velBad}`);
    }
    return { m, f };
  },
  // ---- r45h Sentinel (honest.mjs)
  honest(jac, T, dt) {
    let frames = 0, ok = 0, ov = 0, wide = 0, maxErr = 0;
    for (let y = 4; y < 60; y += 6) for (let x = 4; x < 60; x += 6) for (const d of DIRS) for (const s of [-1, 0, 1]) {
      if (jac.poseBlocked(x, y, d) !== 0) continue; jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y || jac.dir !== d) continue;
      let t = 0; while (t < 2) { const px = jac.cx, py = jac.cy; jac.update(dt, { dx: s, dy: -1 }); t += dt; frames++;
        const v = V[jac.dir]; const err = Math.abs(jac.vel - ((jac.cx - px) * v[0] + (jac.cy - py) * v[1]) / dt); maxErr = Math.max(maxErr, err); if (err <= 0.1) ok++;
        if (jac.poseBlocked(jac.cx, jac.cy, jac.dir) > 0) ov++;
        if (Math.hypot(jac.cx - px, jac.cy - py) >= 0.15) { const dl = wrap(Math.atan2(jac.cy - py, jac.cx - px) / (Math.PI / 2) - DIRS.indexOf(jac.dir)); if (Math.min(Math.abs(dl), Math.abs(Math.abs(dl) - 2)) > 35 / 90) wide++; } }
    }
    const pct = frames ? (100 * ok) / frames : 100; const f = [];
    if (pct < THRESH.honestPct) f.push(`honest ${pct.toFixed(2)}%`); if (ov > THRESH.honestOverlap) f.push(`overlap frames ${ov}`); if (wide > THRESH.honestWide35) f.push(`motion >35deg off sprite frames ${wide}`);
    return { m: { frames, honestPct: +pct.toFixed(2), maxErr: +maxErr.toFixed(3), overlap: ov, wide35: wide }, f };
  },
  // ---- r45h Sentinel (arrive.mjs / park.mjs): route follower arrival
  park(jac, T, dt) {
    const m = {}, f = [];
    for (const tgt of ['23,7', 'bain', 'volaris', '22,18']) {
      jac.qaSpawnDrive(20, 6, 'se'); let pth, goal, door = null;
      if (tgt.includes(',')) { const [x, y] = tgt.split(',').map(Number); pth = jac.findDrivePath(x, y); goal = { x, y }; }
      else { const b = T.getEnterableBuildings().find((b) => b.name === tgt); door = b.door; const s = jac.parkForDoor(b.door.x, b.door.y); if (!s) { m[tgt] = 'NULL'; f.push(`${tgt} parkForDoor NULL`); continue; } pth = s.path; goal = { x: s.x, y: s.y }; }
      if (!pth) { m[tgt] = { path: null }; if (tgt !== '22,18') f.push(`${tgt} no path`); continue; }
      jac.setDrivePath(pth, pth[pth.length - 1] ?? goal, { loose: true });
      let t = 0, arr = null, ov = 0;
      while (t < 60) { jac.update(dt, { dx: 0, dy: 0 }); t += dt; ov = Math.max(ov, jac.poseBlocked(jac.cx, jac.cy, jac.dir));
        if (arr == null && Math.hypot(jac.cx - goal.x, jac.cy - goal.y) < 0.5 && Math.abs(jac.vel) < 0.1) { arr = t; break; }
        if (!jac.drivePath.length && !jac.driveGoal) break; }
      const r = { arrived: arr == null ? null : +arr.toFixed(1), end: [+jac.cx.toFixed(2), +jac.cy.toFixed(2)], maxOverlap: ov };
      if (door) r.parkToDoor = +Math.hypot(goal.x - door.x, goal.y - door.y).toFixed(2);
      m[tgt] = r;
      if (ov > THRESH.arriveOverlap) f.push(`${tgt} overlap ${ov}`);
      const lim = { '23,7': THRESH.arrive237, bain: THRESH.arriveBain, volaris: THRESH.arriveVolaris }[tgt];
      if (lim && (arr == null || arr > lim)) f.push(`${tgt} arrival ${arr == null ? 'NO' : arr.toFixed(1) + 's'} > ${lim}s (end ${r.end})`);
      if (door && r.parkToDoor > THRESH.parkDoorDist) f.push(`${tgt} park site ${r.parkToDoor}t from door > ${THRESH.parkDoorDist}`);
    }
    return { m, f };
  },
  // ---- r45h/r45i G10 (g10.mjs) + r45i turn90b + GU-independent monitor on every turn run
  turn(jac, T, dt) {
    const mon = monitor(jac, dt);
    let runs = 0, clean = 0, done = 0, gu = 0, snapGU = 0, hardGU = 0, ir = 0, ic = 0;
    for (let y = 1; y < T.MAP_HEIGHT - 1; y++) for (let x = 1; x < T.MAP_WIDTH - 1; x++) for (const d of DIRS) for (const s of [-1, 1]) {
      if (jac.poseBlocked(x, y, d) !== 0 || !freeAhead(jac, x, y, d, 3.5)) continue; jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y) continue; jac.setGear('D');
      mon.reset(); const tag = `turn(${x},${y},${d},${s})`;
      let t = 0; while (t < 0.5) { mon.step({ dx: 0, dy: -1 }, tag); t += dt; }
      const h0 = jac.heading; let tt = 0, stop = 0, maxStop = 0, ok = false, okG10 = false;
      while (tt < 3) { const px = jac.cx, py = jac.cy, pd = jac.dir, pv = jac.vel, ph = jac.heading; mon.step({ dx: s, dy: -1 }, tag); tt += dt;
        if (Math.hypot(jac.cx - px, jac.cy - py) < 0.04 && Math.abs(jac.vel) < 0.25) { stop += dt; maxStop = Math.max(maxStop, stop); } else stop = 0;
        const turned = Math.abs(wrap(jac.heading - h0)) >= 0.9;
        // turn90b (r45i) counts a turn only if it finished before escapeGaveUp; G10 (g10.mjs) checks the heading first
        if (jac.escapeGaveUp) { gu++; if (turned) okG10 = true; if (pd !== jac.dir && Math.abs(wrap(jac.heading - ph)) > 0.4) snapGU++; if (Math.abs(pv) > 3) hardGU++; break; }
        if (turned) { ok = true; break; } }
      const interior = x >= 10 && x < 50 && y >= 10 && y < 50;
      runs++; if (interior) ir++; if (ok) done++; if ((ok || okG10) && maxStop <= 0.5) { clean++; if (interior) ic++; }
    }
    const g10 = (100 * clean) / runs, tp = (100 * done) / runs; const f = [];
    if (g10 < THRESH.g10Pct) f.push(`G10 clean ${g10.toFixed(1)}% < ${THRESH.g10Pct}%`);
    if (tp < THRESH.turnPct) f.push(`turn90b completed ${tp.toFixed(1)}% < ${THRESH.turnPct}%`);
    if (snapGU > THRESH.snapAtGU) f.push(`snap at GU onset ${snapGU}`); if (hardGU > THRESH.hardStopAtGU) f.push(`GU stop from >3 t/s ${hardGU}`);
    monFails(mon.M, f, ['snap04', 'flips', 'backDMaxRun', 'jumps', 'shortSwap']);
    return { m: { runs, g10Clean: clean, g10Pct: +g10.toFixed(1), interior: `${ic}/${ir}`, turn90bDone: done, turnPct: +tp.toFixed(1), GU: gu, snapGU, hardGU, ...monSummary(mon.M) }, f };
  },
  // ---- r45i swapq.mjs: open-field circles, swap smoothness
  swapq(jac, T, dt) {
    const m = {}, f = []; let worstJ = 0;
    for (const [g, s] of [['D', 1], ['D', -1], ['R', 1], ['R', -1]]) {
      jac.qaSpawnDrive(21, 52, 'se'); jac.setGear(g); let t = 0, n = 0, sj = 0, yawMax = 0, rmin = 9, rmax = 0;
      while (t < 6) { const pd = jac.dir, ph = jac.heading, pv = jac.vel; jac.update(dt, { dx: s, dy: -1 }); t += dt; const fh = Math.abs(wrap(jac.heading - ph));
        if (pd !== jac.dir) { n++; sj = Math.max(sj, fh); if (Math.abs(pv) > 1) { const r = Math.abs(jac.vel) / Math.abs(pv); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); } } else yawMax = Math.max(yawMax, fh); }
      // swap-frame heading jump beyond the largest ordinary per-frame yaw of the same circle (dt-invariant)
      const mj = Math.max(0, sj - yawMax);
      m[`${g}${s}`] = { swaps: n, swapFrameQ: +sj.toFixed(3), plainYawQ: +yawMax.toFixed(3), excessQ: +mj.toFixed(3), speedRatio: [+rmin.toFixed(2), +rmax.toFixed(2)] }; worstJ = Math.max(worstJ, mj);
      if (n < 3) f.push(`${g}${s} only ${n} swaps in 6 s circle`);
      if (mj > THRESH.swapJumpQ) f.push(`${g}${s} swap heading jump ${sj.toFixed(2)}q = ${mj.toFixed(2)}q beyond plain yaw > ${THRESH.swapJumpQ}`);
      if (rmin < THRESH.swapSpeedMin || rmax > THRESH.swapSpeedMax) f.push(`${g}${s} swap speed ratio ${rmin.toFixed(2)}..${rmax.toFixed(2)} outside ${THRESH.swapSpeedMin}..${THRESH.swapSpeedMax}`);
    }
    return { m, f };
  },
  // ---- r45i monkey.mjs + r45j spin.mjs: 60 seeds × 120 s of random real-input-like play from spawn
  monkey(jac, T, dt) {
    const mon = monitor(jac, dt); const SEEDS = 60;
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const acts = [['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['R', 0, -1], ['R', -1, -1], ['R', 1, -1], [null, 0, 0], ['D', 0, 1]];
    let traps = 0, gu = 0, total = 0, snaps = 0; const ex = [];
    for (let k = 1; k <= SEEDS; k++) { seed = k * 7919; jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); mon.reset(); let t = 0; const H = [];
      while (t < 120) { const a = acts[Math.floor(rnd() * acts.length)]; const sec = 0.3 + rnd() * 1.5; if (a[0] && a[0] !== jac.gear) jac.setGear(a[0]); let u = 0;
        while (u < sec) { const ph = jac.heading, pd = jac.dir; mon.step({ dx: a[1], dy: a[2] }, `seed${k}`); u += dt; t += dt; if (jac.escapeGaveUp) gu += dt; if (pd !== jac.dir && Math.abs(wrap(jac.heading - ph)) > 0.6) snaps++; }
        H.push([t, jac.cx, jac.cy]); }
      total += t;
      for (let i = 0; i < H.length; i++) { let j = i, a = 1e9, b = -1e9, c = 1e9, e = -1e9; while (j < H.length && H[j][0] - H[i][0] < 30) { a = Math.min(a, H[j][1]); b = Math.max(b, H[j][1]); c = Math.min(c, H[j][2]); e = Math.max(e, H[j][2]); j++; }
        if (j < H.length && Math.max(b - a, e - c) < 1.5) { traps++; if (ex.length < 3) ex.push(`seed${k} t=${H[i][0].toFixed(0)} at (${a.toFixed(1)},${c.toFixed(1)})`); break; } }
    }
    const guPct = (100 * gu) / total; const f = [];
    if (traps > THRESH.monkeyTrap30) f.push(`seeds boxed 30 s (<1.5t) ${traps}/${SEEDS} ${ex.join(' ')}`);
    if (guPct > THRESH.monkeyGUPct) f.push(`escapeGaveUp share ${guPct.toFixed(1)}%`);
    if (snaps > THRESH.monkeySnap06) f.push(`1-frame sprite turns >0.6q ${snaps}`);
    monFails(mon.M, f);
    return { m: { seeds: SEEDS, boxed30s: traps, guPct: +guPct.toFixed(1), snap06: snaps, ...monSummary(mon.M) }, f };
  },
  // ---- r45i esc2.mjs (GU-based, kept for history; trivially 0 when GU never arms)
  esc2(jac, T, dt) {
    const go = (sec, inp) => { let t = 0; while (t < sec) { jac.update(dt, inp); t += dt; } };
    const m = {}, f = [];
    for (const [pn, q] of Object.entries(PROPS)) { let stopped = 0, trapped = 0; const ex = [];
      for (const [x, y, d, s] of propPoses(jac, q, -99)) {
        jac.setGear('D'); go(6, { dx: s, dy: -1 }); if (!jac.escapeGaveUp) continue; stopped++; const sp = [jac.cx, jac.cy, jac.dir]; let freed = false;
        outer: for (const rt of [1, 2, 3]) for (const rs of [0, -s, s]) for (const ds of [0, -s, s]) {
          jac.qaSpawnDrive(x, y, d); jac.setGear('D'); go(6, { dx: s, dy: -1 }); go(0.2, { dx: 0, dy: 0 }); jac.setGear('R'); go(rt, { dx: rs, dy: -1 }); go(0.2, { dx: 0, dy: 0 }); jac.setGear('D');
          let mx = 0, t = 0; while (t < 4) { jac.update(dt, { dx: ds, dy: -1 }); t += dt; mx = Math.max(mx, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); }
          if (mx >= 2.5 && !jac.escapeGaveUp) { freed = true; break outer; } }
        if (!freed && !inPocket(x, y)) { trapped++; if (ex.length < 3) ex.push(`(${x},${y},${d}) s=${s}`); }
      }
      m[pn] = { guStopped: stopped, trapped }; if (trapped > THRESH.esc2Trapped) f.push(`${pn} GU-stop TRAPPED ${trapped} ${ex.join(' ')}`); }
    return { m, f };
  },
  // ---- r45j GU-independent escape: stuck after 6 s gas+steer into a prop; can steering alone (no R) free it?
  escsteer(jac, T, dt) {
    const go = (sec, inp, g) => { if (g && g !== jac.gear) jac.setGear(g); let t = 0; while (t < sec) { jac.update(dt, inp); t += dt; } };
    const m = {}, f = []; let allStuck = 0, allNeedR = 0;
    for (const [pn, q] of Object.entries(PROPS)) { let runs = 0, stuck = 0, steerOnly = 0, needR = 0, trapped = 0; const ex = [], rex = [];
      for (const [x, y, d, s] of propPoses(jac, q, -99)) { if (inPocket(x, y)) continue; runs++;
        const recreate = () => { jac.qaSpawnDrive(x, y, d); jac.setGear('D'); const H = []; let t = 0; while (t < 6) { jac.update(dt, { dx: s, dy: -1 }); t += dt; H.push([t, jac.cx, jac.cy]); } return H; };
        const H = recreate(); const k = H.findIndex((h) => h[0] >= 3); const sp = [jac.cx, jac.cy];
        let mv = 0; for (let i = k; i < H.length; i++) mv = Math.max(mv, Math.hypot(H[i][1] - sp[0], H[i][2] - sp[1]));
        if (mv >= 0.5) continue; stuck++;
        const tryIt = (seq) => { recreate(); let mx = 0; for (const [sec, g, dx, dy] of seq) { if (g && g !== jac.gear) jac.setGear(g); let t = 0; while (t < sec) { jac.update(dt, { dx, dy }); t += dt; mx = Math.max(mx, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); } } return mx; };
        // a player who lets go and steers the other way / straight, gas in D, never touching R
        const steer = Math.max(tryIt([[0.3, null, 0, 0], [3, 'D', -s, -1]]), tryIt([[0.3, null, 0, 0], [3, 'D', 0, -1]]), tryIt([[0.3, null, 0, 0], [1.5, 'D', -s, -1], [1.5, 'D', s, -1]]));
        if (steer >= 1.5) { steerOnly++; continue; }
        needR++; if (rex.length < 3) rex.push(`(${x},${y},${d}) s=${s} stuck@(${sp[0].toFixed(2)},${sp[1].toFixed(2)}) steer-only ${steer.toFixed(2)}t`);
        const withR = Math.max(tryIt([[0.3, null, 0, 0], [2, 'R', 0, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]), tryIt([[0.3, null, 0, 0], [2, 'R', -s, -1], [0.3, null, 0, 0], [3, 'D', 0, -1]]), tryIt([[0.3, null, 0, 0], [2, 'R', s, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]));
        if (withR < 1.5) { trapped++; if (ex.length < 3) ex.push(`(${x},${y},${d}) s=${s}`); } }
      m[pn] = { runs, stuck, freedBySteerOnly: steerOnly, neededR: needR, trapped }; allStuck += stuck; allNeedR += needR;
      if (trapped > THRESH.escTrapped) f.push(`${pn} TRAPPED (R battery too) ${trapped} ${ex.join(' ')}`);
      if (needR) m[pn].needREx = rex; }
    const pct = allStuck ? (100 * allNeedR) / allStuck : 0; m.needRPct = +pct.toFixed(1);
    if (pct > THRESH.escNeedRPct) f.push(`steering out (no R) fails in ${allNeedR}/${allStuck} stuck cases = ${pct.toFixed(0)}% > ${THRESH.escNeedRPct}%`);
    return { m, f };
  },
  // ---- r45i trap.mjs (natural approaches) + mtrap.mjs (monkey end states) with a frustrated-player battery
  trap(jac, T, dt) {
    const go = (sec, inp, g) => { if (g) jac.setGear(g); let t = 0; while (t < sec) { jac.update(dt, inp); t += dt; } };
    const f = []; let nat = 0, natT = 0, mt = 0; const ex = [];
    const battery = (sp, s) => { let best = 0; for (const [sec, g, dx, dy] of [[0.3, null, 0, 0], [2, 'R', 0, -1], [2, 'R', -s, -1], [2, 'R', s, -1], [0.3, null, 0, 0], [3, 'D', -s, -1], [3, 'D', 0, -1], [3, 'D', s, -1], [0.3, null, 0, 0], [3, 'R', 0, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]) { go(sec, { dx, dy }, g); best = Math.max(best, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); } return best; };
    for (const [sx, sy, d] of [[20, 17, 'se'], [21, 17, 'se'], [22, 17, 'se'], [30, 16, 'nw'], [33, 16, 'nw'], [34, 16, 'nw'], [28, 14, 'sw'], [28, 15, 'sw'], [30, 14, 'sw'], [28, 25, 'ne'], [28, 26, 'ne']]) for (const s of [-1, 1]) {
      if (jac.poseBlocked(sx, sy, d) !== 0) continue; nat++; jac.qaSpawnDrive(sx, sy, d); go(5, { dx: 0, dy: -1 }, 'D'); go(6, { dx: s, dy: -1 });
      const sp = [jac.cx, jac.cy]; const b = battery(sp, s); if (b < 1.5) { natT++; if (ex.length < 3) ex.push(`nat(${sx},${sy},${d}) s=${s} ${b.toFixed(2)}t`); } }
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const acts = [['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['R', 0, -1], ['R', -1, -1], ['R', 1, -1], [null, 0, 0], ['D', 0, 1]];
    let mtrap = 0;
    for (const [k, T0] of [[39, 20], [1, 100], [44, 70], [58, 50], [71, 25], [4, 90]]) { seed = k * 7919; jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); let t = 0;
      while (t < T0) { const a = acts[Math.floor(rnd() * acts.length)]; const sec = 0.3 + rnd() * 1.5; if (a[0] && a[0] !== jac.gear) jac.setGear(a[0]); let u = 0; while (u < sec) { jac.update(dt, { dx: a[1], dy: a[2] }); u += dt; t += dt; } }
      mt++; const sp = [jac.cx, jac.cy]; const b = battery(sp, 1); if (b < 1.5) { mtrap++; if (ex.length < 6) ex.push(`monkey seed${k}@${T0}s (${sp[0].toFixed(2)},${sp[1].toFixed(2)}) ${b.toFixed(2)}t`); } }
    if (natT > THRESH.trapTrapped) f.push(`natural-approach TRAPPED ${natT}/${nat}`); if (mtrap > THRESH.mtrapTrapped) f.push(`monkey-state TRAPPED ${mtrap}/${mt}`);
    if ((natT || mtrap) && ex.length) f.push(ex.join(' '));
    return { m: { natural: nat, naturalTrapped: natT, monkeyStates: mt, monkeyTrapped: mtrap }, f };
  },
  // ---- r45j shut3.mjs: shuttle in a 3-tile box (porch, cactus, top edge) + monitor
  shuttle(jac, T, dt) {
    const mon = monitor(jac, dt); const m = {}, f = [];
    for (const [pn, q] of Object.entries({ ...PROPS, edge: [28, 1] })) { let runs = 0, sh = 0, worst = 0, ex = '';
      for (const [x, y, d, s] of propPoses(jac, q, 1)) { runs++; jac.setGear('D'); mon.reset(); const r0 = mon.M.revs; let t = 0; const H = [];
        while (t < 12) { mon.step({ dx: s, dy: -1 }, `${pn}(${x},${y},${d},${s})`); t += dt; H.push([t, jac.cx, jac.cy]); }
        const rev = mon.M.revs - r0; let best = 0;
        for (let i = 0, k = 0; i < H.length; i++) { let a = 1e9, b = -1e9, c = 1e9, e = -1e9; for (k = i; k < H.length; k++) { a = Math.min(a, H[k][1]); b = Math.max(b, H[k][1]); c = Math.min(c, H[k][2]); e = Math.max(e, H[k][2]); if (Math.max(b - a, e - c) >= 3) break; } best = Math.max(best, H[k - 1][0] - H[i][0]); if (k >= H.length) break; }
        if (rev >= 2 && best >= 6) { sh++; if (best > worst) { worst = best; ex = `(${x},${y},${d}) s=${s} rev=${rev} ${best.toFixed(1)}s`; } } }
      m[pn] = { runs, shuttle3: sh, worstS: +worst.toFixed(1) }; if (sh > THRESH.shuttle3) f.push(`${pn} shuttle(3 box, >=2 D reversals) ${sh}/${runs} ${ex}`); }
    monFails(mon.M, f, ['flips', 'backDMaxRun', 'jumps', 'offSpriteDeg']);
    return { m: { ...m, ...monSummary(mon.M) }, f };
  },
  // ---- r45j HIGH-2 repro: spawn street, W then hard left/right into the top edge, plus an x sweep along y=6
  edge(jac, T, dt) {
    const mon = monitor(jac, dt); const m = {}, f = []; let runs = 0;
    const scen = [];
    for (const [cx, s] of [[24, -1], [30, -1], [30, 1], [22, 1], [22, -1]]) scen.push({ name: `spawnW-x${cx}-steer${s}`, x: 20, y: 6, d: 'se', until: cx, s });
    for (let x = 6; x <= 56; x += 2) for (const d of ['se', 'nw']) for (const s of [-1, 1]) scen.push({ name: `y6(${x},${d})${s}`, x, y: 6, d, s, w: 0.6 });
    for (const c of scen) { if (jac.poseBlocked(c.x, c.y, c.d) !== 0) continue; jac.qaSpawnDrive(c.x, c.y, c.d); if (jac.cx !== c.x || jac.cy !== c.y) continue; jac.setGear('D'); mon.reset(); runs++;
      let t = 0; if (c.until) { while (jac.cx < c.until && t < 5) { mon.step({ dx: 0, dy: -1 }, c.name); t += dt; } } else { while (t < c.w) { mon.step({ dx: 0, dy: -1 }, c.name); t += dt; } }
      t = 0; while (t < 3) { mon.step({ dx: c.s, dy: -1 }, c.name); t += dt; }
      if (c.until) m[c.name] = [+jac.cx.toFixed(2), +jac.cy.toFixed(2), jac.dir]; }
    monFails(mon.M, f, ['flips', 'backDMaxRun', 'jumps', 'snap04']);
    return { m: { runs, ...monSummary(mon.M), ends: m }, f };
  },
};

async function worker(name, dt, bundle) {
  const { T, jac } = await loadJac(bundle);
  const t0 = Date.now(); const r = CHECKS[name](jac, T, dt);
  process.stdout.write('\n@@RESULT ' + JSON.stringify({ name, dt, ms: Date.now() - t0, ...r }) + '\n');
}

// ---------------------------------------------------------------- main side
function bundleFor(repo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-runall-'));
  const stub = path.join(tmp, 'pixi-stub.mjs');
  fs.writeFileSync(stub, "const mk = () => new Proxy(function () {}, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return mk(); }, construct() { return mk(); } });\nexport const Assets = mk(), Container = mk(), Graphics = mk(), Rectangle = mk(), Sprite = mk(), Texture = mk();\nexport default mk();\n");
  const src = path.join(repo, 'src');
  const entry = path.join(tmp, 'entry.ts');
  fs.writeFileSync(entry, `import { JacT9 } from ${JSON.stringify(path.join(src, 'game/jacT9'))};\nimport { objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings } from ${JSON.stringify(path.join(src, 'data/map'))};\nimport { buildingParkPrefer } from ${JSON.stringify(path.join(src, 'data/world'))};\n(globalThis as any).__T = { JacT9, objects, cells, MAP_WIDTH, MAP_HEIGHT, getEnterableBuildings, buildingParkPrefer };\n`);
  const out = path.join(tmp, 'bundle.mjs');
  const esb = [path.join(repo, 'node_modules/.bin/esbuild'), path.resolve(path.dirname(SELF), '../../../node_modules/.bin/esbuild')].find((p) => fs.existsSync(p));
  if (!esb) throw new Error('esbuild not found (run npm ci in --repo)');
  execFileSync(esb, [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning', `--alias:pixi.js=${stub}`, '--define:import.meta.env.BASE_URL="/"'], { stdio: 'inherit' });
  return out;
}

function runWorker(name, dt, bundle, timeoutMs) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [SELF, '--worker', name, String(dt), bundle], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; const to = setTimeout(() => c.kill('SIGKILL'), timeoutMs);
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => { clearTimeout(to); const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      resolve(line ? JSON.parse(line.slice(9)) : { name, dt, error: `worker exit ${code}: ${err.slice(-600)}` }); });
  });
}

async function main() {
  const a = process.argv.slice(2); const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  if (a[0] === '--worker') return worker(a[1], +a[2], a[3]);
  const repo = path.resolve(opt('--repo', process.cwd()));
  const dts = opt('--dt', '0.0166667,0.1,0.25').split(',').map(Number);
  const only = opt('--only', null)?.split(',');
  const jobs = +opt('--jobs', Math.max(1, Math.min(6, os.cpus().length - 1)));
  const names = Object.keys(CHECKS).filter((n) => !only || only.includes(n));
  let rev = ''; try { rev = execFileSync('git', ['-C', repo, 'rev-parse', '--short=9', 'HEAD']).toString().trim(); } catch {}
  console.log(`# Forge run-all — repo ${repo} @ ${rev || '?'} — dt ${dts.join(', ')} — ${names.length} checks — ${new Date().toISOString()}`);
  let bundle; try { bundle = bundleFor(repo); } catch (e) { console.error('BUNDLE ERROR', e.message); process.exit(2); }
  const queue = []; for (const dt of dts) for (const n of names) queue.push([n, dt]);
  const res = []; let harnessErr = false;
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) { const [n, dt] = queue.shift(); const r = await runWorker(n, dt, bundle, 1500000); res.push(r);
    const st = r.error ? 'ERROR' : r.f.length ? 'FAIL' : 'PASS'; if (r.error) harnessErr = true;
    console.log(`${st.padEnd(5)} ${n.padEnd(9)} dt=${String(dt).padEnd(9)} ${r.error ?? JSON.stringify(r.m)}${r.ms ? ` (${(r.ms / 1000).toFixed(0)}s)` : ''}`);
    for (const x of r.f ?? []) console.log(`      ✗ ${x}`); } }));
  const order = (r) => names.indexOf(r.name) * 10 + dts.indexOf(r.dt); res.sort((p, q) => order(p) - order(q));
  console.log('\n## Summary (check × dt)'); console.log(`| check | ${dts.map((d) => `dt ${d}`).join(' | ')} |`); console.log(`|---|${dts.map(() => '---').join('|')}|`);
  for (const n of names) console.log(`| ${n} | ${dts.map((dt) => { const r = res.find((x) => x.name === n && x.dt === dt); return !r ? '-' : r.error ? 'ERROR' : r.f.length ? `FAIL(${r.f.length})` : 'PASS'; }).join(' | ')} |`);
  const fails = res.filter((r) => r.f?.length).length;
  console.log(`\nRESULT: ${harnessErr ? 'HARNESS ERROR' : fails ? `FAIL — ${fails}/${res.length} check×dt cells fail` : `PASS — all ${res.length} check×dt cells pass`}`);
  const j = opt('--json', null); if (j) fs.writeFileSync(j, JSON.stringify({ repo, rev, dts, thresholds: THRESH, results: res }, null, 1));
  process.exit(harnessErr ? 2 : fails ? 1 : 0);
}
await main();
