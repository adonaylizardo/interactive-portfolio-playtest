// Permanent r45i checks the shuttle harness does not cover on its own:
// end-of-frame overlap, velocity honesty, and slides wider than 35° from the sprite.
import { load } from './common.mjs';
const dt = +(process.argv[2] || 1 / 60);
const { jac } = await load(process.env.BUNDLE || './bundle.mjs');
const DIRS = ['se', 'sw', 'nw', 'ne'];
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
let frames = 0;
let honest = 0;
let overlap = 0;
let wide = 0;
let maxErr = 0;
for (let y = 4; y < 60; y += 6) {
  for (let x = 4; x < 60; x += 6) {
    for (const d of DIRS) {
      for (const s of [-1, 0, 1]) {
        if (jac.poseBlocked(x, y, d) !== 0) continue;
        jac.qaSpawnDrive(x, y, d);
        if (jac.cx !== x || jac.cy !== y || jac.dir !== d) continue;
        let t = 0;
        while (t < 2) {
          const px = jac.cx;
          const py = jac.cy;
          jac.update(dt, { dx: s, dy: -1 });
          t += dt;
          frames++;
          // The frame draws the sprite it finished on. A swap frame has already
          // yawed onto that facing and moved with it.
          const v = V[jac.dir];
          const along = ((jac.cx - px) * v[0] + (jac.cy - py) * v[1]) / dt;
          const err = Math.abs(jac.vel - along);
          maxErr = Math.max(maxErr, err);
          if (err <= 0.1) honest++;
          if (jac.poseBlocked(jac.cx, jac.cy, jac.dir) > 0) overlap++;
          const disp = Math.hypot(jac.cx - px, jac.cy - py);
          if (disp >= 0.15) {
            const ang = Math.atan2(jac.cy - py, jac.cx - px) / (Math.PI / 2);
            const sprite = { se: 0, sw: 1, nw: 2, ne: 3 }[jac.dir];
            let dlt = ang - sprite;
            while (dlt > 2) dlt -= 4;
            while (dlt < -2) dlt += 4;
            const off = Math.min(Math.abs(dlt), Math.abs(Math.abs(dlt) - 2));
            if (off > 35 / 90) wide++;
          }
        }
      }
    }
  }
}
const pct = frames ? (100 * honest) / frames : 100;
console.log(
  `dt=${dt} frames=${frames} honest<=0.1=${honest} (${pct.toFixed(2)}%) maxErr=${maxErr.toFixed(3)} overlap=${overlap} wide35=${wide}`,
);
if (pct < 99 || overlap > 0 || wide > 0) process.exitCode = 1;
