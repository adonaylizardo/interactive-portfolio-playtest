// Permanent checks the shuttle harness does not cover on its own: end-of-frame overlap, speedometer honesty,
// and slides wider than 35° from the sprite.
// r45k (Forge, per Sentinel's plan review): the r45j fix agent's edit of this file (measuring against the
// end-of-frame sprite, which made the velocity half tautological) is reverted. Now:
//  - speedometer: the HUD mph must match the mph implied by the frame's REAL displacement (±1 mph, ≥99 % of frames);
//  - 35° slide: a frame fails only if it is >35° off BOTH the pre-frame and the end-of-frame sprite;
//  - overlap: judged by the independent oracle (scripts/qa/forge/oracle.mjs), not the build's poseBlocked;
//  - Sentinel's original pre-frame velocity honesty is printed as information.
// Same logic as `run-all.mjs` check `honest`. Only Forge edits gates.
import { load } from './common.mjs';
import { blocked } from '../forge/oracle.mjs';
const dt = +(process.argv[2] || 1 / 60);
const { jac } = await load(process.env.BUNDLE || './bundle.mjs');
const DIRS = ['se', 'sw', 'nw', 'ne'];
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
const TOP = 4.5 * 1.15;
const wrap = (d) => { while (d > 2) d -= 4; while (d < -2) d += 4; return d; };
const expMph = (disp) => (disp < 0.01 ? 0 : Math.max(1, Math.min(10, Math.round(Math.min(1, disp / dt / TOP) * 10))));
let frames = 0, hud = 0, preHonest = 0, maxErrPre = 0, overlap = 0, wideBoth = 0, widePre = 0;
for (let y = 4; y < 60; y += 6) for (let x = 4; x < 60; x += 6) for (const d of DIRS) for (const s of [-1, 0, 1]) {
  if (blocked(x, y, d) !== 0) continue;
  jac.qaSpawnDrive(x, y, d);
  if (jac.cx !== x || jac.cy !== y || jac.dir !== d) continue;
  let t = 0;
  while (t < 2) {
    const px = jac.cx, py = jac.cy, dir = jac.dir;
    jac.update(dt, { dx: s, dy: -1 });
    t += dt; frames++;
    const disp = Math.hypot(jac.cx - px, jac.cy - py);
    if (Math.abs((jac.mph ?? 0) - expMph(disp)) <= 1) hud++;
    const errPre = Math.abs(jac.vel - ((jac.cx - px) * V[dir][0] + (jac.cy - py) * V[dir][1]) / dt);
    maxErrPre = Math.max(maxErrPre, errPre); if (errPre <= 0.1) preHonest++;
    if (blocked(jac.cx, jac.cy, jac.dir) > 0) overlap++;
    if (disp >= 0.15) {
      const ang = Math.atan2(jac.cy - py, jac.cx - px) / (Math.PI / 2);
      const off = (dd) => { const dl = wrap(ang - DIRS.indexOf(dd)); return Math.min(Math.abs(dl), Math.abs(Math.abs(dl) - 2)) > 35 / 90; };
      if (off(dir)) widePre++;
      if (off(dir) && off(jac.dir)) wideBoth++;
    }
  }
}
const pct = (n) => (frames ? (100 * n) / frames : 100).toFixed(2);
console.log(`dt=${dt} frames=${frames} hudHonest=${pct(hud)}% overlap=${overlap} wide35Both=${wideBoth} | info: velHonestPreFrame=${pct(preHonest)}% maxErrPre=${maxErrPre.toFixed(3)} wide35Pre=${widePre}`);
if (+pct(hud) < 99 || overlap > 0 || wideBoth > 0) process.exitCode = 1;
