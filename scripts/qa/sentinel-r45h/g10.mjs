// G10 — turn at speed. 0.5s straight, then full steer.
// A run is clean when the heading moves 90° and the truck never sits still for 0.5s.
// Fails unless at least 75% of the open-road attempts are clean.
import { load } from './common.mjs';
const dt = +(process.argv[2] || 1 / 60);
const { T, jac } = await load(process.env.BUNDLE);
const DIRS = ['se', 'sw', 'nw', 'ne'];
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
const freeAhead = (x, y, d, r) => {
  for (let s = 0; s <= r; s += 0.25) if (jac.poseBlocked(x + V[d][0] * s, y + V[d][1] * s, d) !== 0) return false;
  return true;
};
let runs = 0;
let clean = 0;
let ir = 0;
let ic = 0;
for (let y = 1; y < T.MAP_HEIGHT - 1; y++) {
  for (let x = 1; x < T.MAP_WIDTH - 1; x++) {
    for (const d of DIRS) {
      for (const s of [-1, 1]) {
        if (jac.poseBlocked(x, y, d) !== 0 || !freeAhead(x, y, d, 3.5)) continue;
        jac.qaSpawnDrive(x, y, d);
        if (jac.cx !== x || jac.cy !== y) continue;
        jac.setGear('D');
        let t = 0;
        while (t < 0.5) {
          jac.update(dt, { dx: 0, dy: -1 });
          t += dt;
        }
        const h0 = jac.heading;
        let tt = 0;
        let stop = 0;
        let maxStop = 0;
        let ok = false;
        while (tt < 3) {
          const px = jac.cx;
          const py = jac.cy;
          jac.update(dt, { dx: s, dy: -1 });
          tt += dt;
          const step = Math.hypot(jac.cx - px, jac.cy - py);
          if (step < 0.04 && Math.abs(jac.vel) < 0.25) {
            stop += dt;
            if (stop > maxStop) maxStop = stop;
          } else stop = 0;
          let dh = jac.heading - h0;
          while (dh > 2) dh -= 4;
          while (dh < -2) dh += 4;
          if (Math.abs(dh) >= 0.9) {
            ok = true;
            break;
          }
          if (jac.escapeGaveUp) break;
        }
        const interior = x >= 10 && x < 50 && y >= 10 && y < 50;
        runs++;
        if (interior) ir++;
        if (ok && maxStop <= 0.5) {
          clean++;
          if (interior) ic++;
        }
      }
    }
  }
}
const pct = runs ? (100 * clean) / runs : 0;
console.log(
  `g10 dt=${dt} clean=${clean}/${runs} (${pct.toFixed(1)}%) interior=${ic}/${ir} need>=75%`,
);
if (pct < 75) process.exitCode = 1;
