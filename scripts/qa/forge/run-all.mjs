#!/usr/bin/env node
// Forge cumulative headless gate for the Jac T9 truck: r45h Sentinel + r45i Forge + r45j Forge probes,
// revised per Sentinel's r45k plan review (/workspace/qa/portafolio-r45k-plan-review/REVIEW.md).
// Drives the REAL JacT9 class (bundled with esbuild, pixi stubbed) with the input the browser feeds it.
// Collision is judged by an independent oracle (oracle.mjs: frozen footprint formula + frozen drive grid),
// never by the build's own poseBlocked.
//
// usage:  node scripts/qa/forge/run-all.mjs [--repo <checkout with src/ + node_modules>] [--dt 0.0166667,0.1,0.25]
//                                           [--only check1,check2] [--jobs N] [--json out.json]
// exit:   0 = every check passes, 1 = at least one FAIL, 2 = harness error (bundle/worker crash/timeout)
// Only Forge (QA) edits this file or its thresholds. A fix agent must leave scripts/qa/** untouched.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as OR from './oracle.mjs';

const SELF = fileURLToPath(import.meta.url);
const TOP = 4.5 * 1.15; // DRIVE_TILES_PER_S (WALK_TILES_PER_S 4.5 × 1.15)
const MOVE_MPH = 10; // HUD mph at top speed
const DIRS = ['se', 'sw', 'nw', 'ne'];
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
const wrap = (d) => { while (d > 2) d -= 4; while (d < -2) d += 4; return d; };
const PROPS = { porch: [29.5, 21], cactus: [26.5, 18] };
// isolated pocket that a qaSpawn can reach but driving cannot (r45j trap2/pocket.mjs); excluded from trap counts
const inPocket = (x, y) => x >= 24.5 && x <= 25.5 && y >= 22.5 && y <= 24.5;
const HEADING_CAP_Q = 0.62; // hard cap of |heading − sprite| (Sentinel r45k: 0.62 q = 55.8°)
// Park reference poses Forge drove to with 0 overlap on 5a265621 (r45j near2.mjs): nearest reachable to the door.
const PARK_REFS = { bain: [[42, 25, 'sw']], volaris: [[39, 37.96, 'ne'], [39, 38.36, 'ne']] };

export const THRESH = {
  // r45h Sentinel
  ovRuns: 0, // runs with any frame ending overlapped (oracle)
  h1AutoTurn: 0, h1SwapLat: 0.05, // straight gas, no steer: facing changes / lateral tiles in a swap frame
  h3bShuttle: 0, h3bDead: 0, h3bHudBad: 0, // 1.5-tile shuttle box, ≥0.5 s dead stop, HUD mph vs real displacement
  hudPct: 99, hudTol: 1, // HUD mph within ±1 of the mph implied by the frame's real displacement
  wide35Both: 0, honestOverlap: 0, // frames ≥0.15 t moving >35° off BOTH the pre- and end-of-frame sprite
  arrive237Base: 1.6, // (23,7) from spawn: ≤ 1.6 s + 2·dt
  arriveBain: 20, arriveVolaris: 30, arriveOtherOrigin: 45, arriveOverlap: 0,
  parkSlack: 0.5, parkCap: 6, // park end ≤ nearest reachable + 0.5 t, never more than 6 t from the door
  routeStillS: 3, // follower may not sit still ≥3 s before arriving
  // turn at speed: G10 (heading first) and turn90b (must finish before escapeGaveUp) on the arc-legal population
  g10ArcPct: 98, turn90bArcPct: 98,
  // r45i Forge
  swapJumpQ: 0.1, swapSpeedMin: 0.85, swapSpeedMax: 1.2,
  monkeyTrap30: 0, monkeyGUPct: 2, monkeySnap06: 0,
  esc2Trapped: 0, trapTrapped: 0, mtrapTrapped: 0,
  // r45j Forge per-frame monitor (applied to every manual run)
  snap04: 0, // sprite change whose heading jump beats the wheel's yaw (2.4 q/s·|steer|·dt) by >0.4 q
  snapX: 0, // sprite change whose heading jump exceeds the previous plain frame's yaw by >0.5 q (every dt)
  flips: 0, // D + gas: vel from >+1 to <−0.5 in one frame (R mirrored: <−1 to >+0.5)
  backDMaxRun: 0.1, // longest continuous backward travel along the sprite in D with gas held (R mirrored: forward)
  behindStart: 0, behindTol: 0.05, // frames in D+gas ending >0.05 t behind where they started (R mirrored)
  jumpExcess: 0.05, // |frame displacement| − 1.1·TOP·dt may not exceed this (teleport / hop / surge)
  offSpriteQ: HEADING_CAP_Q + 0.005, // |heading − sprite| on every frame, moving or at rest
  shortSwap: 0, // sprite changes after <0.1 t of travel since the previous change
  inPlaceBad: 0, // in-place sprite change (<0.02 t moved) where the rotated box overlaps, <0.1 t since the last change, or <1 t free ahead
  overlapFrames: 0, // frames ending with the footprint overlapping (oracle)
  shuttle3: 0, // ≥2 D velocity reversals and ≥6 s inside a 3-tile box during 12 s gas+steer into a prop or edge
  escNeedRPct: 25, escRCuePct: 100, escTrapped: 0, // needs-R share is INFORMATIONAL since G-C (r45k ruling); needRUnjustified must be 0, R cue 100 %, trapped 0
  d1AheadT: 1.0, // D1: in-place sprite change needs >=1 t free ahead; used to judge whether an R cue / needs-R is justified (G-A, G-C)
  h3bStillNoCueS: 1.0, // G-A (QA1 ruling: 1.5 -> 1.0 s; also used by drive-real G-E): still with no R cue for >=1.0 s is a dead stop even while the heading yaws in place (0.5 s if not yawing)
  partialSymPts: 3, // turn completion with +s vs −s on symmetric-clearance poses may differ ≤3 points
  partialSymMin: 0.5, // symmetry enforced for |steer| ≥0.5; ±0.25 turns on a ~4× wider arc the full-lock clearance test does not cover → info only
  vardtBoxed: 0,
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

const freeAlong = (x, y, d, sign, r) => { for (let s = 0; s <= r + 1e-9; s += 0.25) if (OR.blocked(x + V[d][0] * s * sign, y + V[d][1] * s * sign, d) !== 0) return false; return true; };
const expMph = (disp, dt) => (disp < 0.01 ? 0 : Math.max(1, Math.min(MOVE_MPH, Math.round(Math.min(1, disp / dt / TOP) * MOVE_MPH))));
const hudOk = (jac, disp, dt) => Math.abs((jac.mph ?? 0) - expMph(disp, dt)) <= THRESH.hudTol;

// GU-independent per-frame monitor. step() is the only way checks advance the truck in manual runs.
function monitor(jac, dt0) {
  const M = { frames: 0, snap04: 0, snapX: 0, snapEx: null, flips: 0, flipEx: null, backDMaxRun: 0, backDTotal: 0, backEx: null,
    behind: 0, behindEx: null, rFwdMaxRun: 0, rEx: null, rFlips: 0,
    jumpMax: 0, jumps: 0, jumpEx: null, offMax: 0, offEx: null, restOffMax: 0, restOffEx: null, shortSwap: 0, shortEx: null,
    inPlaceBad: 0, inPlaceEx: null, overlap: 0, overlapEx: null, revs: 0 };
  let run = 0, rrun = 0, travel = Infinity, prevSign = 0, plainFh = 0, lastGear = null, carry = false;
  // carry: a gear change made while still rolling the other way. Coasting off that momentum is physics, not an
  // auto-reverse, so backD/behind/R-mirror/flips ignore it until vel reaches 0 or the gear's sign.
  const reset = () => { run = 0; rrun = 0; travel = Infinity; prevSign = 0; plainFh = 0; lastGear = null; carry = false; };
  const P = (x, y, d) => `(${x.toFixed(2)},${y.toFixed(2)}${d ? ',' + d : ''})`;
  const step = (inp, tag = '', dtArg) => {
    const dt = dtArg ?? dt0;
    const px = jac.cx, py = jac.cy, pd = jac.dir, ph = jac.heading, pv = jac.vel;
    if (jac.gear !== lastGear) { carry = lastGear !== null && (jac.gear === 'R' ? pv > 0.3 : pv < -0.3); lastGear = jac.gear; }
    const carried = carry;
    jac.update(dt, inp); M.frames++;
    if (carry && (jac.gear === 'R' ? jac.vel <= 0.05 : jac.vel >= -0.05)) carry = false;
    const dx = jac.cx - px, dy = jac.cy - py, dist = Math.hypot(dx, dy), fh = wrap(jac.heading - ph), afh = Math.abs(fh);
    const gasD = !carried && jac.gear === 'D' && inp.dy < 0, gasR = !carried && jac.gear === 'R' && inp.dy < 0;
    if (pd !== jac.dir) {
      if (afh > 0.4 + 2.4 * Math.min(dt, 0.25) * Math.abs(inp.dx)) { M.snap04++; if (!M.snapEx) M.snapEx = `${tag} ${P(px, py)} ${pd}->${jac.dir} ${(fh * 90).toFixed(0)}deg v${pv.toFixed(2)}->${jac.vel.toFixed(2)}`; }
      if (afh - Math.max(plainFh, 2.4 * Math.min(dt, 0.25) * Math.abs(inp.dx)) > 0.5) { M.snapX++; if (!M.snapEx) M.snapEx = `${tag} ${P(px, py)} ${pd}->${jac.dir} ${(fh * 90).toFixed(0)}deg vs plain ${(plainFh * 90).toFixed(0)}deg`; }
    } else plainFh = afh;
    if (gasD && pv > 1 && jac.vel < -0.5) { M.flips++; if (!M.flipEx) M.flipEx = `${tag} ${P(jac.cx, jac.cy, jac.dir)} v${pv.toFixed(2)}->${jac.vel.toFixed(2)}`; }
    if (gasR && pv < -1 && jac.vel > 0.5) M.rFlips++;
    const sg = jac.vel > 0.3 ? 1 : jac.vel < -0.3 ? -1 : 0;
    if (gasD && sg && prevSign && sg !== prevSign) M.revs++;
    if (sg) prevSign = sg;
    const along = dx * V[jac.dir][0] + dy * V[jac.dir][1];
    if (gasD && along < -1e-4) { run += -along; M.backDTotal += -along; if (run > M.backDMaxRun) { M.backDMaxRun = run; M.backEx = `${tag} to ${P(jac.cx, jac.cy, jac.dir)} run ${run.toFixed(2)}t`; } }
    else if (along > 1e-4 || !gasD) run = 0;
    if (gasD && along < -THRESH.behindTol) { M.behind++; if (!M.behindEx) M.behindEx = `${tag} ${P(px, py, pd)}->${P(jac.cx, jac.cy, jac.dir)} ${along.toFixed(3)}t`; }
    if (gasR && along > THRESH.behindTol) { M.behind++; if (!M.behindEx) M.behindEx = `${tag} R ${P(px, py, pd)}->${P(jac.cx, jac.cy, jac.dir)} +${along.toFixed(3)}t`; }
    if (gasR && along > 1e-4) { rrun += along; if (rrun > M.rFwdMaxRun) { M.rFwdMaxRun = rrun; M.rEx = `${tag} to ${P(jac.cx, jac.cy, jac.dir)} run ${rrun.toFixed(2)}t`; } }
    else if (along < -1e-4 || !gasR) rrun = 0;
    const excess = dist - 1.1 * TOP * Math.min(dt, 0.25);
    if (excess > M.jumpMax) { M.jumpMax = excess; M.jumpEx = `${tag} ${P(px, py, pd)}->${P(jac.cx, jac.cy, jac.dir)} ${dist.toFixed(3)}t in ${dt.toFixed(3)}s`; }
    if (excess > THRESH.jumpExcess) M.jumps++;
    const off = Math.abs(wrap(jac.heading - DIRS.indexOf(jac.dir)));
    if (off > M.offMax) { M.offMax = off; M.offEx = `${tag} ${P(jac.cx, jac.cy, jac.dir)} h${jac.heading.toFixed(2)}`; }
    if (Math.abs(jac.vel) < 0.05 && dist < 1e-3 && off > M.restOffMax) { M.restOffMax = off; M.restOffEx = `${tag} ${P(jac.cx, jac.cy, jac.dir)} h${jac.heading.toFixed(2)}`; }
    if (pd !== jac.dir) {
      if (travel < 0.1) { M.shortSwap++; if (!M.shortEx) M.shortEx = `${tag} ${P(jac.cx, jac.cy)} ${pd}->${jac.dir} after ${travel.toFixed(3)}t gear ${jac.gear}`; }
      if (dist < 0.02) {
        const sign = jac.gear === 'R' ? -1 : 1;
        const why = OR.blocked(jac.cx, jac.cy, jac.dir) > 0 ? 'rotated box overlaps' : travel < 0.1 ? `only ${travel.toFixed(3)}t since last change` : !freeAlong(jac.cx, jac.cy, jac.dir, sign, 1.0) ? '<1 t free ahead' : '';
        if (why) { M.inPlaceBad++; if (!M.inPlaceEx) M.inPlaceEx = `${tag} ${P(jac.cx, jac.cy)} ${pd}->${jac.dir}: ${why}`; }
      }
      travel = 0;
    } else travel += dist;
    if (OR.blocked(jac.cx, jac.cy, jac.dir) > 0) { M.overlap++; if (!M.overlapEx) M.overlapEx = `${tag} ${P(jac.cx, jac.cy, jac.dir)}`; }
  };
  return { M, step, reset };
}
const ALL_MON = ['snap04', 'snapX', 'flips', 'backD', 'behind', 'rmirror', 'jumps', 'off', 'restOff', 'shortSwap', 'inPlace', 'overlap'];
const monFails = (M, f, keys = ALL_MON) => {
  const t = THRESH, on = (k) => keys.includes(k), deg = (q) => (q * 90).toFixed(0);
  if (on('snap04') && M.snap04 > t.snap04) f.push(`sprite snap >0.4q beyond wheel yaw: ${M.snap04} (${M.snapEx})`);
  if (on('snapX') && M.snapX > t.snapX) f.push(`sprite jump >0.5q beyond plain yaw: ${M.snapX} (${M.snapEx})`);
  if (on('flips') && M.flips > t.flips) f.push(`fwd->reverse flips in D+gas: ${M.flips} (${M.flipEx})`);
  if (on('backD') && M.backDMaxRun > t.backDMaxRun) f.push(`backward in D+gas run ${M.backDMaxRun.toFixed(2)}t > ${t.backDMaxRun} (total ${M.backDTotal.toFixed(1)}t; ${M.backEx})`);
  if (on('behind') && M.behind > t.behindStart) f.push(`frames ending behind their start (>${t.behindTol}t against the gear): ${M.behind} (${M.behindEx})`);
  if (on('rmirror') && (M.rFwdMaxRun > t.backDMaxRun || M.rFlips > t.flips)) f.push(`R mirror: forward run with R gas ${M.rFwdMaxRun.toFixed(2)}t, flips ${M.rFlips} (${M.rEx})`);
  if (on('jumps') && M.jumps > 0) f.push(`frame jumps excess>${t.jumpExcess}t: ${M.jumps}, max ${M.jumpMax.toFixed(3)} (${M.jumpEx})`);
  if (on('off') && M.offMax > t.offSpriteQ) f.push(`heading off sprite ${deg(M.offMax)}deg > ${deg(HEADING_CAP_Q)} (${M.offEx})`);
  if (on('restOff') && M.restOffMax > t.offSpriteQ) f.push(`at-rest heading off sprite ${deg(M.restOffMax)}deg (${M.restOffEx})`);
  if (on('shortSwap') && M.shortSwap > t.shortSwap) f.push(`sprite changes after <0.1t travel: ${M.shortSwap} (${M.shortEx})`);
  if (on('inPlace') && M.inPlaceBad > t.inPlaceBad) f.push(`illegal in-place sprite changes: ${M.inPlaceBad} (${M.inPlaceEx})`);
  if (on('overlap') && M.overlap > t.overlapFrames) f.push(`frames overlapping (oracle): ${M.overlap} (${M.overlapEx})`);
};
const monSummary = (M) => ({ snap04: M.snap04, snapX: M.snapX, flips: M.flips, backDMaxRun: +M.backDMaxRun.toFixed(3), backDTotal: +M.backDTotal.toFixed(1), behind: M.behind,
  rFwdMaxRun: +M.rFwdMaxRun.toFixed(3), rFlips: M.rFlips, jumps: M.jumps, jumpMax: +M.jumpMax.toFixed(3), offMaxDeg: +(M.offMax * 90).toFixed(0),
  restOffMaxDeg: +(M.restOffMax * 90).toFixed(0), shortSwap: M.shortSwap, inPlaceBad: M.inPlaceBad, overlap: M.overlap });

// legal start (oracle) that the build also accepts as-is
const spawnOk = (jac, x, y, d) => { if (OR.blocked(x, y, d) !== 0) return false; jac.qaSpawnDrive(x, y, d); return jac.cx === x && jac.cy === y && jac.dir === d; };
// poses within 7 tiles whose nose (sign 1) or tail (sign −1) points at the prop
function* propPoses(jac, [qx, qy], minY = 1, sign = 1) {
  for (let y = Math.max(minY, Math.round(qy - 7)); y <= qy + 7; y++) for (let x = Math.round(qx - 7); x <= qx + 7; x++) for (const d of DIRS) for (const s of [-1, 1]) {
    const v = V[d], to = [qx - x, qy - y], dist = Math.hypot(...to); if (dist > 7 || dist < 0.5 || sign * (to[0] * v[0] + to[1] * v[1]) / dist < 0.5) continue;
    if (!spawnOk(jac, x, y, d)) continue;
    yield [x, y, d, s];
  }
}
// Sentinel r45k turnpop.mjs: poses where an ideal arc (R 2.6 t, swap at the 0.62 q line, 1 t out) stays legal (oracle)
const ARC_R = 2.6;
function arcOk(x, y, d, s) {
  const i = DIRS.indexOf(d); if (!OR.freeAhead(x, y, d, 2.5)) return false; const cx = x + V[d][0] * 2.5, cy = y + V[d][1] * 2.5;
  const fx = Math.cos(i * Math.PI / 2), fy = Math.sin(i * Math.PI / 2), lx = Math.cos((i + s) * Math.PI / 2), ly = Math.sin((i + s) * Math.PI / 2);
  for (let a = 0; a <= Math.PI / 2 + 1e-9; a += Math.PI / 40) {
    const px = cx + fx * ARC_R * Math.sin(a) + lx * ARC_R * (1 - Math.cos(a)), py = cy + fy * ARC_R * Math.sin(a) + ly * ARC_R * (1 - Math.cos(a));
    if (OR.blocked(px, py, a / (Math.PI / 2) < HEADING_CAP_Q ? d : DIRS[(i + (s > 0 ? 1 : 3)) & 3]) !== 0) return false;
  }
  return OR.freeAhead(cx + fx * ARC_R + lx * ARC_R, cy + fy * ARC_R + ly * ARC_R, DIRS[(i + (s > 0 ? 1 : 3)) & 3], 1);
}
function* turnPoses(jac, T, every = 1) {
  let k = 0;
  for (let y = 1; y < T.MAP_HEIGHT - 1; y++) for (let x = 1; x < T.MAP_WIDTH - 1; x++) for (const d of DIRS) {
    if (OR.blocked(x, y, d) !== 0 || !OR.freeAhead(x, y, d, 3.5)) continue;
    if (k++ % every) continue;
    yield [x, y, d];
  }
}
// one turn attempt: 0.5 s straight, then steer s for up to lim seconds
function turnRun(jac, mon, dt, x, y, d, s, lim = 3) {
  jac.qaSpawnDrive(x, y, d); if (jac.cx !== x || jac.cy !== y) return null; jac.setGear('D'); mon.reset(); const tag = `turn(${x},${y},${d},${s})`;
  let t = 0; while (t < 0.5) { mon.step({ dx: 0, dy: -1 }, tag); t += dt; }
  const h0 = jac.heading; let tt = 0, stop = 0, maxStop = 0, ok = false, okG10 = false, gu = false, snapGU = false, hardGU = false;
  while (tt < lim) { const px = jac.cx, py = jac.cy, pd = jac.dir, pv = jac.vel, ph = jac.heading; mon.step({ dx: s, dy: -1 }, tag); tt += dt;
    if (Math.hypot(jac.cx - px, jac.cy - py) < 0.04 && Math.abs(jac.vel) < 0.25) { stop += dt; maxStop = Math.max(maxStop, stop); } else stop = 0;
    const turned = Math.abs(wrap(jac.heading - h0)) >= 0.9;
    // turn90b (r45i) counts a turn only if it finished before escapeGaveUp; G10 checks the heading first
    if (jac.escapeGaveUp) { gu = true; if (turned) okG10 = true; snapGU = pd !== jac.dir && Math.abs(wrap(jac.heading - ph)) > 0.4; hardGU = Math.abs(pv) > 3; break; }
    if (turned) { ok = true; break; } }
  return { t90b: ok, g10: (ok || okG10) && maxStop <= 0.5, gu, snapGU, hardGU };
}

// r45k G-A/G-C (Sentinel ruling, applied by Forge): the R cue / needs-R is justified only if the in-place swap is illegal under D1
// (oracle box fits, >=1.0 t free ahead per D1 §3, >=0.1 t since a real sprite change; getting in / spawn is not a change).
// Forge review: Sentinel proposed 1.5 t ahead; D1 and the build's SWAP_AHEAD_TILES say 1.0 t, so the gate uses 1.0 t.
const sideDir = (d, s) => DIRS[(DIRS.indexOf(d) + (s > 0 ? 1 : 3)) & 3];
const legalSwap = (x, y, nd, sign, gtrav) => gtrav >= 0.1 && OR.blocked(x, y, nd) === 0 && freeAlong(x, y, nd, sign, THRESH.d1AheadT);
const cueJustBad = (x, y, d, s, sign, gtrav) => legalSwap(x, y, sideDir(d, s), sign, gtrav);
const CHECKS = {
  // ---- frozen-map guard: src/data (map, props, kerbs, building mass) must be exactly what the oracle was frozen from
  oracle(jac, T) {
    const diff = OR.gridDiff(jac); let n = 0, dis = 0;
    for (let y = 1; y < 63; y += 0.37) for (let x = 1; x < 63; x += 0.41) for (const d of DIRS) { n++; if ((jac.poseBlocked(x, y, d) > 0) !== (OR.blocked(x, y, d) > 0)) dis++; }
    const f = []; if (diff.length) f.push(`drive grid differs from the frozen map in ${diff.length} cells, e.g. ${JSON.stringify(diff.slice(0, 6))} (src/data or cell rules changed)`);
    if (dis) f.push(`build's poseBlocked disagrees with the oracle on ${dis}/${n} poses (footprint formula changed)`);
    return { m: { frozenFrom: OR.FROZEN.source, gridDiff: diff.length, poseDisagree: dis, posesSampled: n }, f };
  },
  // ---- r45h Sentinel ov.mjs (oracle)
  ov(jac, T, dt) {
    let n = 0; const ex = [];
    for (let y = 2; y < 62; y += 4) for (let x = 2; x < 62; x += 4) for (const d of DIRS) for (const s of [-1, 0, 1]) {
      if (!spawnOk(jac, x, y, d)) continue;
      let t = 0; while (t < 10) { jac.update(dt, { dx: s, dy: -1 }); t += dt; if (OR.blocked(jac.cx, jac.cy, jac.dir) > 0) { n++; if (ex.length < 3) ex.push(`(${x},${y},${d}) s=${s} at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`); break; } }
    }
    const f = []; if (n > THRESH.ovRuns) f.push(`overlap runs ${n} ${ex.join(' ')}`);
    return { m: { overlapRuns: n }, f };
  },
  // ---- r45h Sentinel h1.mjs: straight gas never changes facing
  h1(jac, T, dt) {
    let runs = 0, auto = 0, lat = 0; const ex = [];
    for (let y = 3; y < 60; y += 3) for (let x = 3; x < 60; x += 3) for (const d of DIRS) {
      if (!jac.driveBoxWalkable(x, y) || !spawnOk(jac, x, y, d)) continue;
      runs++; let t = 0, px = jac.cx, py = jac.cy;
      while (t < 4) { jac.update(dt, { dx: 0, dy: -1 }); t += dt;
        if (jac.dir !== d) { auto++; const v = V[jac.dir]; lat = Math.max(lat, Math.abs((jac.cx - px) * v[1] - (jac.cy - py) * v[0])); if (ex.length < 3) ex.push(`(${x},${y},${d})->${jac.dir}`); break; }
        px = jac.cx; py = jac.cy; }
    }
    const f = []; if (auto > THRESH.h1AutoTurn) f.push(`no-steer facing changes ${auto}/${runs} ${ex.join(' ')}`); if (lat > THRESH.h1SwapLat) f.push(`swap-frame lateral ${lat.toFixed(3)}`);
    return { m: { runs, autoTurn: auto, swapLat: +lat.toFixed(3) }, f };
  },
  // ---- r45h Sentinel h3b.mjs (original, pre-frame axis) + dead stops; speed judged as HUD vs real displacement
  h3b(jac, T, dt) {
    const m = {}, f = [];
    for (const [pn, q] of Object.entries(PROPS)) {
      let runs = 0, sh = 0, dead = 0, hudBad = 0, velBadPre = 0, frames = 0, shEx = '', deadEx = '', cueUnj = 0, cueEx = '';
      for (const [x, y, d, s] of propPoses(jac, q, -99)) {
        runs++; let t = 0, H = [], hc = 0, ph = jac.heading, best = 0, still = 0, deadThis = 0, gtrav = Infinity, cueBad = 0, stillAny = 0, cueRun = 0;
        while (t < 12) { const px = jac.cx, py = jac.cy, vv = V[jac.dir], pdir = jac.dir, phd = jac.heading; jac.update(dt, { dx: s, dy: -1 }); t += dt; frames++;
          const disp = Math.hypot(jac.cx - px, jac.cy - py);
          if (Math.abs(jac.vel - ((jac.cx - px) * vv[0] + (jac.cy - py) * vv[1]) / dt) > 0.5) velBadPre++;
          if (!hudOk(jac, disp, dt)) hudBad++;
          if (jac.dir !== pdir) gtrav = 0; else gtrav += disp;
          // r45k G-A: in-place yaw is motion; a stop that shows a JUSTIFIED R cue is the D1 outcome, not a dead stop
          const cueOn = jac.reverseCue === true; if (cueOn && cueJustBad(jac.cx, jac.cy, jac.dir, s, jac.gear === 'R' ? -1 : 1, gtrav)) cueRun += dt; else cueRun = 0; if (cueRun >= 0.3 - 1e-9) cueBad++; // a 1-frame flash before the swap lands next frame is tolerated; >=0.3 s is not
          const stillF = disp < 0.08 * dt && Math.abs(jac.vel) < 0.2;
          if (stillF && Math.abs(wrap(jac.heading - phd)) < 0.1 * dt && !cueOn) still += dt; else still = 0; if (still >= 0.5) deadThis = Math.max(deadThis, still);
          if (stillF && !cueOn) stillAny += dt; else stillAny = 0; if (stillAny >= THRESH.h3bStillNoCueS) deadThis = Math.max(deadThis, stillAny); // in-place yaw to the cap takes 0.62/0.667 = 0.93 s; >=1.0 s (h3bStillNoCueS) still without a cue is dead even while the heading moves
          hc += wrap(jac.heading - ph); ph = jac.heading; H.push([t, jac.cx, jac.cy, hc]);
          let j = H.length - 1; while (j > 0 && t - H[j][0] < 3) j--; if (t - H[j][0] < 3) continue;
          let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9, pl = 0;
          for (let k = j; k < H.length; k++) { mnx = Math.min(mnx, H[k][1]); mxx = Math.max(mxx, H[k][1]); mny = Math.min(mny, H[k][2]); mxy = Math.max(mxy, H[k][2]); if (k > j) pl += Math.hypot(H[k][1] - H[k - 1][1], H[k][2] - H[k - 1][2]); }
          const net = Math.hypot(H[H.length - 1][1] - H[j][1], H[H.length - 1][2] - H[j][2]);
          // r45k G-B: a shuttle goes back and forth: path must exceed net displacement by >=0.5 t
          if (Math.max(mxx - mnx, mxy - mny) < 1.5 && Math.abs(hc - H[j][3]) < 0.33 && pl > 0.5 && pl - net >= 0.5) best += dt; }
        if (cueBad) { cueUnj++; if (!cueEx) cueEx = `(${x},${y},${d}) s=${s} at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir})`; }
        if (best > 0) { sh++; if (!shEx) shEx = `(${x},${y},${d}) s=${s} ${best.toFixed(1)}s`; }
        if (deadThis >= 0.5) { dead++; if (!deadEx) deadEx = `(${x},${y},${d}) s=${s} ${deadThis.toFixed(1)}s at (${jac.cx.toFixed(2)},${jac.cy.toFixed(2)})`; }
      }
      m[pn] = { runs, shuttle15: sh, dead, cueUnjustifiedRuns: cueUnj, hudBad, info_velBadPreFrame: `${velBadPre}/${frames}` };
      if (cueUnj) f.push(`${pn} R cue shown while a legal in-place swap to the steering side exists: ${cueUnj}/${runs} runs ${cueEx}`);
      if (sh > THRESH.h3bShuttle) f.push(`${pn} shuttle(1.5 box) ${sh}/${runs} ${shEx}`);
      if (dead > THRESH.h3bDead) f.push(`${pn} dead stops ${dead}/${runs} ${deadEx}`);
      if (hudBad > THRESH.h3bHudBad) f.push(`${pn} HUD mph off the real displacement in ${hudBad}/${frames} frames`);
    }
    return { m, f };
  },
  // ---- r45h Sentinel honest.mjs (original) + Sentinel r45k: wide35 fails only if off BOTH axes; HUD vs real displacement
  honest(jac, T, dt) {
    let frames = 0, hud = 0, ov = 0, wideBoth = 0, widePre = 0, okPre = 0, okPost = 0, ex = '';
    for (let y = 4; y < 60; y += 6) for (let x = 4; x < 60; x += 6) for (const d of DIRS) for (const s of [-1, 0, 1]) {
      if (!spawnOk(jac, x, y, d)) continue;
      let t = 0; while (t < 2) { const px = jac.cx, py = jac.cy, pd = jac.dir; jac.update(dt, { dx: s, dy: -1 }); t += dt; frames++;
        const disp = Math.hypot(jac.cx - px, jac.cy - py);
        if (hudOk(jac, disp, dt)) hud++;
        const e = (dir) => Math.abs(jac.vel - ((jac.cx - px) * V[dir][0] + (jac.cy - py) * V[dir][1]) / dt);
        if (e(pd) <= 0.1) okPre++; if (e(jac.dir) <= 0.1) okPost++;
        if (OR.blocked(jac.cx, jac.cy, jac.dir) > 0) ov++;
        if (disp >= 0.15) { const ang = Math.atan2(jac.cy - py, jac.cx - px) / (Math.PI / 2);
          const off = (dir) => { const dl = wrap(ang - DIRS.indexOf(dir)); return Math.min(Math.abs(dl), Math.abs(Math.abs(dl) - 2)) > 35 / 90; };
          const a = off(pd), b = off(jac.dir); if (a) widePre++; if (a && b) { wideBoth++; if (!ex) ex = `(${px.toFixed(2)},${py.toFixed(2)},${pd})->(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)},${jac.dir}) ${disp.toFixed(3)}t`; } } }
    }
    const pct = (n) => +(frames ? (100 * n) / frames : 100).toFixed(2); const f = [];
    if (pct(hud) < THRESH.hudPct) f.push(`HUD mph within ±${THRESH.hudTol} of real displacement in only ${pct(hud)}% of frames`);
    if (ov > THRESH.honestOverlap) f.push(`overlap frames (oracle) ${ov}`);
    if (wideBoth > THRESH.wide35Both) f.push(`motion >35deg off both pre- and end-of-frame sprite: ${wideBoth} frames ${ex}`);
    return { m: { frames, hudPct: pct(hud), overlap: ov, wide35Both: wideBoth, info_wide35Pre: widePre, info_velHonestPre: pct(okPre), info_velHonestPost: pct(okPost) }, f };
  },
  // ---- r45h Sentinel arrive/park + Sentinel r45k: relative door distance, 3 more origins, after manual driving, HUD in route
  park(jac, T, dt) {
    const m = {}, f = []; const B = Object.fromEntries(T.getEnterableBuildings().map((b) => [b.name, b]));
    const nearest = {};
    for (const n of ['bain', 'volaris']) { const door = B[n].door; let best = Infinity, from = '';
      for (const [x, y, d] of PARK_REFS[n]) { if (OR.blocked(x, y, d) !== 0) throw new Error(`park ref ${n} (${x},${y},${d}) not legal on the frozen map`); const dd = Math.hypot(x - door.x, y - door.y); if (dd < best) { best = dd; from = `forge ref (${x},${y},${d})`; } }
      if (jac.sitsForDoor && jac.footprintPath) { jac.qaSpawnDrive(20, 6, 'se'); for (const c of jac.sitsForDoor(door.x, door.y)) { const dd = Math.hypot(c.x - door.x, c.y - door.y); if (dd < best && OR.blocked(c.x, c.y, c.heading ?? c.dir ?? 'se') === 0 && jac.footprintPath(c.x, c.y)) { best = dd; from = `planner (${c.x},${c.y})`; } } }
      nearest[n] = { dist: +best.toFixed(2), from, limit: +Math.min(best + THRESH.parkSlack, THRESH.parkCap).toFixed(2) }; }
    m.nearestReachable = nearest;
    const findLegal = (x0, y0) => { for (let r = 0; r < 8; r++) for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) for (const d of DIRS) if (OR.blocked(x, y, d) === 0 && OR.freeAhead(x, y, d, 2)) return [x, y, d]; return null; };
    const origins = { spawn: [20, 6, 'se'], west: findLegal(12, 30), southeast: findLegal(45, 46), northeast: findLegal(52, 12), manual: 'manual' };
    const follow = (tgt, origin) => {
      if (origin === 'manual') { jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); let t = 0; while (t < 2) { jac.update(dt, { dx: 0, dy: -1 }); t += dt; } t = 0; while (t < 1) { jac.update(dt, { dx: 1, dy: -1 }); t += dt; } t = 0; while (t < 0.6) { jac.update(dt, { dx: 0, dy: 0 }); t += dt; } }
      else jac.qaSpawnDrive(...origin);
      let pth, goal, door = null;
      if (tgt.includes(',')) { const [x, y] = tgt.split(',').map(Number); pth = jac.findDrivePath(x, y); goal = { x, y }; }
      else { door = B[tgt].door; const s = jac.parkForDoor(door.x, door.y); if (!s) return { null: true }; pth = s.path.length ? s.path : jac.findDrivePath(s.x, s.y); goal = { x: s.x, y: s.y }; }
      if (!pth) return { path: null };
      jac.setDrivePath(pth, pth[pth.length - 1] ?? goal, { loose: true });
      let t = 0, arr = null, ov = 0, frames = 0, hud = 0, still = 0, maxStill = 0;
      while (t < 60) { const px = jac.cx, py = jac.cy; jac.update(dt, { dx: 0, dy: 0 }); t += dt; frames++; const disp = Math.hypot(jac.cx - px, jac.cy - py);
        if (hudOk(jac, disp, dt)) hud++; if (disp < 1e-3) { still += dt; maxStill = Math.max(maxStill, still); } else still = 0;
        if (OR.blocked(jac.cx, jac.cy, jac.dir) > 0) ov++;
        if (arr == null && Math.hypot(jac.cx - goal.x, jac.cy - goal.y) < 0.5 && Math.abs(jac.vel) < 0.1) { arr = t; break; }
        if (!jac.drivePath.length && !jac.driveGoal) break; }
      const r = { arrived: arr == null ? null : +arr.toFixed(2), end: [+jac.cx.toFixed(2), +jac.cy.toFixed(2), jac.dir], overlapFrames: ov, hudPct: +(100 * hud / Math.max(1, frames)).toFixed(1), maxStillS: +maxStill.toFixed(1) };
      if (door) r.endToDoor = +Math.hypot(jac.cx - door.x, jac.cy - door.y).toFixed(2);
      return r;
    };
    const lim237 = THRESH.arrive237Base + 2 * dt;
    for (const [on, o] of Object.entries(origins)) {
      if (!o) { f.push(`origin ${on}: no legal pose found`); continue; }
      for (const tgt of on === 'spawn' ? ['23,7', 'bain', 'volaris', '22,18'] : ['bain', 'volaris']) {
        const r = follow(tgt, o); m[`${on}->${tgt}`] = r; const lab = `${on}->${tgt}`;
        if (tgt === '22,18') continue; // unreachable tile: the toast (≤0.5 s) is a browser gate
        if (r.null) { f.push(`${lab}: parkForDoor NULL`); continue; } if (r.path === null) { f.push(`${lab}: no path`); continue; }
        const lim = tgt === '23,7' ? lim237 : on !== 'spawn' ? THRESH.arriveOtherOrigin : tgt === 'bain' ? THRESH.arriveBain : THRESH.arriveVolaris;
        if (r.arrived == null || r.arrived > lim) f.push(`${lab} arrival ${r.arrived == null ? 'NO' : r.arrived + 's'} > ${+lim.toFixed(2)}s (end ${r.end})`);
        if (r.overlapFrames > THRESH.arriveOverlap) f.push(`${lab} overlap frames (oracle) ${r.overlapFrames}`);
        if (r.hudPct < THRESH.hudPct) f.push(`${lab} HUD honest ${r.hudPct}% in route`);
        if (r.arrived == null && r.maxStillS >= THRESH.routeStillS) f.push(`${lab} sat still ${r.maxStillS}s without arriving`);
        if (r.endToDoor != null && r.endToDoor > nearest[tgt].limit) f.push(`${lab} parked ${r.endToDoor}t from the door > nearest reachable ${nearest[tgt].dist} (${nearest[tgt].from}) + ${THRESH.parkSlack} (cap ${THRESH.parkCap})`);
      }
    }
    return { m, f };
  },
  // ---- turn at speed: G10 (g10.mjs) + turn90b (r45i) on the arc-legal population (Sentinel turnpop.mjs) + monitor
  turn(jac, T, dt) {
    const mon = monitor(jac, dt);
    let runs = 0, g10All = 0, popN = 0, popG10 = 0, popT90 = 0, gu = 0, snapGU = 0, hardGU = 0; const miss = [];
    for (const [x, y, d] of turnPoses(jac, T)) for (const s of [-1, 1]) {
      const r = turnRun(jac, mon, dt, x, y, d, s); if (!r) continue; runs++; if (r.g10) g10All++; if (r.gu) gu++; if (r.snapGU) snapGU++; if (r.hardGU) hardGU++;
      if (arcOk(x, y, d, s)) { popN++; if (r.g10) popG10++; if (r.t90b) popT90++; else if (miss.length < 4) miss.push(`(${x},${y},${d},${s})`); }
    }
    const pc = (a, b) => +(100 * a / Math.max(1, b)).toFixed(1); const f = [];
    if (pc(popG10, popN) < THRESH.g10ArcPct) f.push(`G10 on arc-legal poses ${popG10}/${popN} = ${pc(popG10, popN)}% < ${THRESH.g10ArcPct}%`);
    if (pc(popT90, popN) < THRESH.turn90bArcPct) f.push(`turn90b on arc-legal poses ${popT90}/${popN} = ${pc(popT90, popN)}% < ${THRESH.turn90bArcPct}% e.g. ${miss.join(' ')}`);
    if (snapGU) f.push(`snap at give-up onset ${snapGU}`); if (hardGU) f.push(`give-up stop from >3 t/s ${hardGU}`);
    monFails(mon.M, f, ['snap04', 'snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'shortSwap', 'inPlace', 'overlap']);
    return { m: { arcPop: popN, g10ArcPct: pc(popG10, popN), turn90bArcPct: pc(popT90, popN), info_allPoses: runs, info_g10AllPct: pc(g10All, runs), GU: gu, snapGU, hardGU, ...monSummary(mon.M) }, f };
  },
  // ---- Sentinel r45k: partial steer ±0.25/0.5/0.707/0.9 (stick diagonals, real asymmetry +0.895/−0.905)
  partial(jac, T, dt) {
    const mon = monitor(jac, dt); const m = {}, f = [];
    const poses = []; for (const p of turnPoses(jac, T, 4)) if (arcOk(...p, 1) && arcOk(...p, -1)) poses.push(p);
    for (const a of [0.25, 0.5, 0.707, 0.9]) { const done = {};
      for (const s of [a, -a]) { let n = 0, ok = 0; for (const [x, y, d] of poses) { const r = turnRun(jac, mon, dt, x, y, d, s, 5); if (!r) continue; n++; if (r.t90b) ok++; } done[s] = +(100 * ok / Math.max(1, n)).toFixed(1); }
      m[`steer${a}`] = { right: done[a], left: done[-a] };
      if (a >= THRESH.partialSymMin && Math.abs(done[a] - done[-a]) > THRESH.partialSymPts) f.push(`steer ±${a}: turn completion ${done[a]}% right vs ${done[-a]}% left (asymmetric > ${THRESH.partialSymPts} pts)`); }
    monFails(mon.M, f, ['snap04', 'snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'shortSwap', 'inPlace', 'overlap']);
    return { m: { poses: poses.length, ...m, ...monSummary(mon.M) }, f };
  },
  // ---- r45i swapq.mjs: open-field circles, swap smoothness (dt-invariant)
  swapq(jac, T, dt) {
    const m = {}, f = [];
    for (const [g, s] of [['D', 1], ['D', -1], ['R', 1], ['R', -1]]) {
      jac.qaSpawnDrive(21, 52, 'se'); jac.setGear(g); let t = 0, n = 0, sj = 0, yawMax = 0, rmin = 9, rmax = 0;
      while (t < 6) { const pd = jac.dir, ph = jac.heading, pv = jac.vel; jac.update(dt, { dx: s, dy: -1 }); t += dt; const fh = Math.abs(wrap(jac.heading - ph));
        if (pd !== jac.dir) { n++; sj = Math.max(sj, fh); if (Math.abs(pv) > 1) { const r = Math.abs(jac.vel) / Math.abs(pv); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); } } else yawMax = Math.max(yawMax, fh); }
      const mj = Math.max(0, sj - yawMax);
      m[`${g}${s}`] = { swaps: n, swapFrameQ: +sj.toFixed(3), plainYawQ: +yawMax.toFixed(3), excessQ: +mj.toFixed(3), speedRatio: [+rmin.toFixed(2), +rmax.toFixed(2)] };
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
    let traps = 0, gu = 0, total = 0, snaps = 0, infoBoxedFreed = 0; const ex = [];
    for (let k = 1; k <= SEEDS; k++) { seed = k * 7919; jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); mon.reset(); let t = 0; const H = [];
      while (t < 120) { const a = acts[Math.floor(rnd() * acts.length)]; const sec = 0.3 + rnd() * 1.5; if (a[0] && a[0] !== jac.gear) jac.setGear(a[0]); let u = 0;
        while (u < sec) { const ph = jac.heading, pd = jac.dir; mon.step({ dx: a[1], dy: a[2] }, `seed${k}`); u += dt; t += dt; if (jac.escapeGaveUp) gu += dt; if (pd !== jac.dir && Math.abs(wrap(jac.heading - ph)) > 0.6) snaps++; }
        H.push([t, jac.cx, jac.cy]); }
      total += t;
      for (let i = 0; i < H.length; i++) { let j = i, a = 1e9, b = -1e9, c = 1e9, e = -1e9; while (j < H.length && H[j][0] - H[i][0] < 30) { a = Math.min(a, H[j][1]); b = Math.max(b, H[j][1]); c = Math.min(c, H[j][2]); e = Math.max(e, H[j][2]); j++; }
        if (j < H.length && Math.max(b - a, e - c) < 1.5) { const bt = boxBattery(jac, 'monkey', k, dt, H[j - 1][0]); if (bt < 1.5) { traps++; if (ex.length < 3) ex.push(`seed${k} t=${H[i][0].toFixed(0)} at (${a.toFixed(1)},${c.toFixed(1)}) battery ${bt.toFixed(2)}t`); } else infoBoxedFreed++; break; } }
    }
    const guPct = (100 * gu) / total; const f = [];
    if (traps > THRESH.monkeyTrap30) f.push(`seeds boxed 30 s (<1.5t) AND R battery fails ${traps}/${SEEDS} ${ex.join(' ')}`);
    if (guPct > THRESH.monkeyGUPct) f.push(`escapeGaveUp share ${guPct.toFixed(1)}%`);
    if (snaps > THRESH.monkeySnap06) f.push(`1-frame sprite turns >0.6q ${snaps}`);
    monFails(mon.M, f);
    return { m: { seeds: SEEDS, boxed30s: traps, info_boxedButBatteryFrees: infoBoxedFreed, guPct: +guPct.toFixed(1), snap06: snaps, ...monSummary(mon.M) }, f };
  },
  // ---- Sentinel r45k: variable frame time (seeded 16/33/250 ms) catches timers a fixed dt hides
  vardt(jac, T) {
    const mon = monitor(jac, 1 / 60); const SEEDS = 30;
    let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const acts = [['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['D', 0, -1], ['D', -0.5, -1], ['D', 0.707, -1], ['R', 0, -1], ['R', -1, -1], ['R', 1, -1], [null, 0, 0], ['D', 1, 1]];
    const dts = [1 / 60, 1 / 60, 1 / 30, 0.25]; let boxed = 0, infoBoxedFreed = 0; const ex = [];
    for (let k = 1; k <= SEEDS; k++) { seed = k * 104729; jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); mon.reset(); let t = 0; const H = [];
      while (t < 90) { const a = acts[Math.floor(rnd() * acts.length)]; const sec = 0.3 + rnd() * 1.5; if (a[0] && a[0] !== jac.gear) jac.setGear(a[0]); let u = 0;
        while (u < sec) { const dt = dts[Math.floor(rnd() * dts.length)]; mon.step({ dx: a[1], dy: a[2] }, `vseed${k}`, dt); u += dt; t += dt; }
        H.push([t, jac.cx, jac.cy]); }
      for (let i = 0; i < H.length; i++) { let j = i, a = 1e9, b = -1e9, c = 1e9, e = -1e9; while (j < H.length && H[j][0] - H[i][0] < 30) { a = Math.min(a, H[j][1]); b = Math.max(b, H[j][1]); c = Math.min(c, H[j][2]); e = Math.max(e, H[j][2]); j++; }
        if (j < H.length && Math.max(b - a, e - c) < 1.5) { const bt = boxBattery(jac, 'vardt', k, 0, H[j - 1][0]); if (bt < 1.5) { boxed++; if (ex.length < 3) ex.push(`vseed${k} t=${H[i][0].toFixed(0)} at (${a.toFixed(1)},${c.toFixed(1)}) battery ${bt.toFixed(2)}t`); } else infoBoxedFreed++; break; } } }
    const f = []; if (boxed > THRESH.vardtBoxed) f.push(`seeds boxed 30 s ${boxed}/${SEEDS} ${ex.join(' ')}`);
    monFails(mon.M, f);
    return { m: { seeds: SEEDS, boxed30s: boxed, info_boxedButBatteryFrees: infoBoxedFreed, ...monSummary(mon.M) }, f };
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
  // ---- Sentinel r45k D1 rule: stuck after 6 s gas+steer into a prop. Steering alone (no R) frees it, or the truck
  // stands still showing the R cue (jac.reverseCue === true). Never backward in D; in-place sprite change only when legal.
  escsteer(jac, T, dt) {
    const mon = monitor(jac, dt); const m = {}, f = []; let allStuck = 0, allNeedR = 0, allRCue = 0;
    for (const [pn, q] of Object.entries(PROPS)) { let runs = 0, stuck = 0, steerOnly = 0, needR = 0, rcue = 0, trapped = 0, unjust = 0; const ex = [], rex = [], uex = [];
      for (const [x, y, d, s] of propPoses(jac, q, -99)) { if (inPocket(x, y)) continue; runs++;
        let gtrav = Infinity; const recreate = (watch) => { jac.qaSpawnDrive(x, y, d); jac.setGear('D'); mon.reset(); gtrav = Infinity; const H = []; let t = 0; while (t < 6) { const px = jac.cx, py = jac.cy, pd = jac.dir; if (watch) mon.step({ dx: s, dy: -1 }, `${pn}(${x},${y},${d},${s})`); else jac.update(dt, { dx: s, dy: -1 }); if (jac.dir !== pd) gtrav = 0; else gtrav += Math.hypot(jac.cx - px, jac.cy - py); t += dt; H.push([t, jac.cx, jac.cy]); } return H; };
        const H = recreate(true); const k = H.findIndex((h) => h[0] >= 3); const sp = [jac.cx, jac.cy];
        let mv = 0; for (let i = k; i < H.length; i++) mv = Math.max(mv, Math.hypot(H[i][1] - sp[0], H[i][2] - sp[1]));
        if (mv >= 0.5) continue; stuck++; const cue = jac.reverseCue === true; const stDir = jac.dir, stTrav = gtrav;
        const unj = legalSwap(sp[0], sp[1], sideDir(stDir, s), 1, stTrav) || legalSwap(sp[0], sp[1], sideDir(stDir, -s), 1, stTrav);
        const tryIt = (seq) => { recreate(false); let mx = 0; for (const [sec, g, dx, dy] of seq) { if (g && g !== jac.gear) jac.setGear(g); let t = 0; while (t < sec) { mon.step({ dx, dy }, `${pn}-esc`); t += dt; mx = Math.max(mx, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); } } return mx; };
        const steer = Math.max(tryIt([[0.3, null, 0, 0], [3, 'D', -s, -1]]), tryIt([[0.3, null, 0, 0], [3, 'D', 0, -1]]), tryIt([[0.3, null, 0, 0], [1.5, 'D', -s, -1], [1.5, 'D', s, -1]]));
        if (steer >= 1.5) { steerOnly++; continue; }
        needR++; if (cue) rcue++; if (unj) { unjust++; if (uex.length < 3) uex.push(`(${x},${y},${d}) s=${s} stuck@(${sp[0].toFixed(2)},${sp[1].toFixed(2)},${stDir}) travelSinceChange=${stTrav === Infinity ? 'spawn' : stTrav.toFixed(2)}`); } if (rex.length < 3) rex.push(`(${x},${y},${d}) s=${s} stuck@(${sp[0].toFixed(2)},${sp[1].toFixed(2)}) steer-only ${steer.toFixed(2)}t Rcue=${cue}`);
        const withR = Math.max(tryIt([[0.3, null, 0, 0], [2, 'R', 0, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]), tryIt([[0.3, null, 0, 0], [2, 'R', -s, -1], [0.3, null, 0, 0], [3, 'D', 0, -1]]), tryIt([[0.3, null, 0, 0], [2, 'R', s, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]));
        if (withR < 1.5) { trapped++; if (ex.length < 3) ex.push(`(${x},${y},${d}) s=${s}`); } }
      m[pn] = { runs, stuck, freedBySteerOnly: steerOnly, neededR: needR, needRUnjustified: unjust, rCueShown: rcue, trapped }; allStuck += stuck; allNeedR += needR; allRCue += rcue;
      if (unjust) f.push(`${pn} needs-R where D1 allows an in-place swap (oracle): ${unjust} ${uex.join(' ')}`);
      if (trapped > THRESH.escTrapped) f.push(`${pn} TRAPPED (R battery too) ${trapped} ${ex.join(' ')}`);
      if (needR) m[pn].needREx = rex; }
    const pct = allStuck ? (100 * allNeedR) / allStuck : 0, cuePct = allNeedR ? (100 * allRCue) / allNeedR : 100; m.needRPct = +pct.toFixed(1); m.rCuePct = +cuePct.toFixed(1);
    if (false) f.push(`(G-C: informational) steering out (no R) fails in ${allNeedR}/${allStuck} stuck cases = ${pct.toFixed(0)}% > ${THRESH.escNeedRPct}%`);
    if (cuePct < THRESH.escRCuePct) f.push(`R cue (jac.reverseCue) shown in ${allRCue}/${allNeedR} needs-R cases = ${cuePct.toFixed(0)}% < ${THRESH.escRCuePct}%`);
    monFails(mon.M, f, ['snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'inPlace', 'overlap']);
    return { m: { ...m, ...monSummary(mon.M) }, f };
  },
  // ---- r45i trap.mjs (natural approaches) + mtrap.mjs (monkey end states) with a frustrated-player battery
  trap(jac, T, dt) {
    const go = (sec, inp, g) => { if (g) jac.setGear(g); let t = 0; while (t < sec) { jac.update(dt, inp); t += dt; } };
    const f = []; let nat = 0, natT = 0, mt = 0; const ex = [];
    const battery = (sp, s) => { let best = 0; for (const [sec, g, dx, dy] of [[0.3, null, 0, 0], [2, 'R', 0, -1], [2, 'R', -s, -1], [2, 'R', s, -1], [0.3, null, 0, 0], [3, 'D', -s, -1], [3, 'D', 0, -1], [3, 'D', s, -1], [0.3, null, 0, 0], [3, 'R', 0, -1], [0.3, null, 0, 0], [3, 'D', -s, -1]]) { go(sec, { dx, dy }, g); best = Math.max(best, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); } return best; };
    for (const [sx, sy, d] of [[20, 17, 'se'], [21, 17, 'se'], [22, 17, 'se'], [30, 16, 'nw'], [33, 16, 'nw'], [34, 16, 'nw'], [28, 14, 'sw'], [28, 15, 'sw'], [30, 14, 'sw'], [28, 25, 'ne'], [28, 26, 'ne']]) for (const s of [-1, 1]) {
      if (OR.blocked(sx, sy, d) !== 0) continue; nat++; jac.qaSpawnDrive(sx, sy, d); go(5, { dx: 0, dy: -1 }, 'D'); go(6, { dx: s, dy: -1 });
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
    monFails(mon.M, f, ['snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'inPlace', 'overlap']);
    return { m: { ...m, ...monSummary(mon.M) }, f };
  },
  // ---- r45j HIGH-2 repro: spawn street W then hard left/right into the top edge, plus an x sweep along y=6
  edge(jac, T, dt) {
    const mon = monitor(jac, dt); const m = {}, f = []; let runs = 0;
    const scen = [];
    for (const [cx, s] of [[24, -1], [30, -1], [30, 1], [22, 1], [22, -1]]) scen.push({ name: `spawnW-x${cx}-steer${s}`, x: 20, y: 6, d: 'se', until: cx, s });
    for (let x = 6; x <= 56; x += 2) for (const d of ['se', 'nw']) for (const s of [-1, 1]) scen.push({ name: `y6(${x},${d})${s}`, x, y: 6, d, s, w: 0.6 });
    for (const c of scen) { if (!spawnOk(jac, c.x, c.y, c.d)) continue; jac.setGear('D'); mon.reset(); runs++;
      let t = 0; if (c.until) { while (jac.cx < c.until && t < 5) { mon.step({ dx: 0, dy: -1 }, c.name); t += dt; } } else { while (t < c.w) { mon.step({ dx: 0, dy: -1 }, c.name); t += dt; } }
      t = 0; while (t < 3) { mon.step({ dx: c.s, dy: -1 }, c.name); t += dt; }
      if (c.until) m[c.name] = [+jac.cx.toFixed(2), +jac.cy.toFixed(2), jac.dir]; }
    monFails(mon.M, f, ['snap04', 'snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'inPlace', 'overlap']);
    return { m: { runs, ...monSummary(mon.M), ends: m }, f };
  },
  // ---- Sentinel r45k borders.mjs: all four map borders and corners, steer −1/−0.5/0/0.5/1, nose into the edge
  borders(jac, T, dt) {
    const mon = monitor(jac, dt); const W = T.MAP_WIDTH, H = T.MAP_HEIGHT; let runs = 0; const f = [];
    const poses = []; for (let k = 3; k < W - 3; k += 2) poses.push([k, 4, 'ne'], [k, H - 5, 'sw'], [4, k, 'nw'], [W - 5, k, 'se']);
    for (const [x, y, d] of poses) for (const s of [-1, -0.5, 0, 0.5, 1]) { if (!spawnOk(jac, x, y, d)) continue; jac.setGear('D'); mon.reset(); runs++;
      let t = 0; while (t < 6) { mon.step({ dx: s, dy: -1 }, `border(${x},${y},${d},${s})`); t += dt; } }
    monFails(mon.M, f, ['snap04', 'snapX', 'flips', 'backD', 'behind', 'jumps', 'off', 'inPlace', 'overlap']);
    return { m: { runs, ...monSummary(mon.M) }, f };
  },
  // ---- Sentinel r45k: R mirror. Tail into the porch/cactus and into the four borders with R gas + steer: never forward
  rmirror(jac, T, dt) {
    const mon = monitor(jac, dt); const W = T.MAP_WIDTH, H = T.MAP_HEIGHT; let runs = 0; const f = [];
    const go = (x, y, d, s, tag, sec) => { jac.setGear('R'); mon.reset(); runs++; let t = 0; while (t < sec) { mon.step({ dx: s, dy: -1 }, tag); t += dt; } };
    for (const [pn, q] of Object.entries(PROPS)) for (const [x, y, d, s] of propPoses(jac, q, -99, -1)) go(x, y, d, s, `R-${pn}(${x},${y},${d},${s})`, 8);
    const poses = []; for (let k = 3; k < W - 3; k += 4) poses.push([k, 4, 'sw'], [k, H - 5, 'ne'], [4, k, 'se'], [W - 5, k, 'nw']);
    for (const [x, y, d] of poses) for (const s of [-1, 0, 1]) { if (!spawnOk(jac, x, y, d)) continue; go(x, y, d, s, `R-border(${x},${y},${d},${s})`, 5); }
    monFails(mon.M, f, ['snapX', 'rmirror', 'behind', 'jumps', 'off', 'inPlace', 'overlap']);
    return { m: { runs, ...monSummary(mon.M) }, f };
  },
  // ---- Sentinel r45k: brake + steer at rest (D and R): the heading stays within the cap, nothing moves through walls
  brakesteer(jac, T, dt) {
    const mon = monitor(jac, dt); let runs = 0, moved = 0; const f = [];
    for (let y = 4; y < 60; y += 6) for (let x = 4; x < 60; x += 6) for (const d of DIRS) for (const g of ['D', 'R']) for (const s of [-1, 1]) {
      if (!spawnOk(jac, x, y, d)) continue; jac.setGear(g); mon.reset(); runs++; const x0 = jac.cx, y0 = jac.cy;
      let t = 0; while (t < 3) { mon.step({ dx: s, dy: 1 }, `brake(${x},${y},${d},${g},${s})`); t += dt; }
      moved = Math.max(moved, Math.hypot(jac.cx - x0, jac.cy - y0)); }
    monFails(mon.M, f, ['snap04', 'snapX', 'jumps', 'off', 'restOff', 'inPlace', 'overlap']);
    return { m: { runs, info_maxMovedT: +moved.toFixed(2), ...monSummary(mon.M) }, f };
  },
};
// r45k G-D: replay a monkey/vardt seed to tEnd (no monitor; same inputs) and run the trap battery there
function boxBattery(jac, mode, k, DT, tEnd) {
  let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const acts = mode === 'monkey' ? [['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['R', 0, -1], ['R', -1, -1], ['R', 1, -1], [null, 0, 0], ['D', 0, 1]]
    : [['D', 0, -1], ['D', -1, -1], ['D', 1, -1], ['D', 0, -1], ['D', -0.5, -1], ['D', 0.707, -1], ['R', 0, -1], ['R', -1, -1], ['R', 1, -1], [null, 0, 0], ['D', 1, 1]];
  const dts = [1 / 60, 1 / 60, 1 / 30, 0.25];
  seed = k * (mode === 'monkey' ? 7919 : 104729); jac.qaSpawnDrive(20, 6, 'se'); jac.setGear('D'); let t = 0;
  while (t < tEnd - 1e-9) { const a = acts[Math.floor(rnd() * acts.length)]; const sec = 0.3 + rnd() * 1.5; if (a[0] && a[0] !== jac.gear) jac.setGear(a[0]); let u = 0;
    while (u < sec) { const dt = mode === 'monkey' ? DT : dts[Math.floor(rnd() * dts.length)]; jac.update(dt, { dx: a[1], dy: a[2] }); u += dt; t += dt; } }
  const bdt = mode === 'monkey' ? DT : 1 / 60; const sp = [jac.cx, jac.cy]; let best = 0;
  const go = (sec, inp, g) => { if (g) jac.setGear(g); let q = 0; while (q < sec) { jac.update(bdt, inp); q += bdt; best = Math.max(best, Math.hypot(jac.cx - sp[0], jac.cy - sp[1])); } };
  for (const s of [1, -1]) for (const [sec, g, dx, dy] of [[0.3, null, 0, 0], [2, 'R', 0, -1], [2, 'R', -s, -1], [2, 'R', s, -1], [0.3, null, 0, 0], [3, 'D', -s, -1], [3, 'D', 0, -1], [3, 'D', s, -1]]) go(sec, { dx, dy }, g);
  return best;
}
const ONCE = { oracle: 'once', vardt: 'var' }; // checks that do not take the --dt list

async function worker(name, dt, bundle) {
  const { T, jac } = await loadJac(bundle);
  const t0 = Date.now(); const r = CHECKS[name](jac, T, dt);
  process.stdout.write('\n@@RESULT ' + JSON.stringify({ name, dt: ONCE[name] ?? dt, ms: Date.now() - t0, ...r }) + '\n');
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
      resolve(line ? JSON.parse(line.slice(9)) : { name, dt: ONCE[name] ?? dt, error: `worker exit ${code}: ${err.slice(-600)}` }); });
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
  console.log(`# Forge run-all (r45k rev.) — repo ${repo} @ ${rev || '?'} — dt ${dts.join(', ')} — ${names.length} checks — ${new Date().toISOString()}`);
  let bundle; try { bundle = bundleFor(repo); } catch (e) { console.error('BUNDLE ERROR', e.message); process.exit(2); }
  const queue = []; for (const n of names) if (ONCE[n]) queue.push([n, 0.0166667]);
  for (const dt of dts) for (const n of names) if (!ONCE[n]) queue.push([n, dt]);
  // long checks first so the pool drains evenly
  const slow = ['ov', 'park', 'escsteer', 'esc2', 'partial', 'turn']; queue.sort((p, q) => slow.indexOf(q[0]) - slow.indexOf(p[0]));
  const res = []; let harnessErr = false;
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) { const [n, dt] = queue.shift(); const r = await runWorker(n, dt, bundle, 2400000); res.push(r);
    const st = r.error ? 'ERROR' : r.f.length ? 'FAIL' : 'PASS'; if (r.error) harnessErr = true;
    console.log(`${st.padEnd(5)} ${n.padEnd(10)} dt=${String(r.dt).padEnd(9)} ${r.error ?? JSON.stringify(r.m)}${r.ms ? ` (${(r.ms / 1000).toFixed(0)}s)` : ''}`);
    for (const x of r.f ?? []) console.log(`      ✗ ${x}`); } }));
  const cols = [...dts, 'once', 'var'];
  console.log('\n## Summary (check × dt)'); console.log(`| check | ${cols.map((d) => (typeof d === 'number' ? `dt ${d}` : d)).join(' | ')} |`); console.log(`|---|${cols.map(() => '---').join('|')}|`);
  for (const n of names) console.log(`| ${n} | ${cols.map((dt) => { const r = res.find((x) => x.name === n && x.dt === dt); return !r ? '-' : r.error ? 'ERROR' : r.f.length ? `FAIL(${r.f.length})` : 'PASS'; }).join(' | ')} |`);
  const fails = res.filter((r) => r.f?.length).length;
  console.log(`\nRESULT: ${harnessErr ? 'HARNESS ERROR' : fails ? `FAIL — ${fails}/${res.length} cells fail` : `PASS — all ${res.length} cells pass`}`);
  const j = opt('--json', null); if (j) fs.writeFileSync(j, JSON.stringify({ repo, rev, dts, thresholds: THRESH, results: res }, null, 1));
  process.exit(harnessErr ? 2 : fails ? 1 : 0);
}
await main();
