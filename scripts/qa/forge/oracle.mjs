// Independent collision oracle for the Jac T9 gates (Sentinel r45k plan review §4).
// The footprint formula is frozen here (5×3 box for se/nw, 3×5 for sw/ne, FOOT_EPS 0.05, as in jacT9.ts @ 5a265621)
// and the open/closed drive grid is frozen in frozen-drive-grid.json (dumped from 5a265621's map, props, kerbs and
// building mass). Gates use this instead of the build's own poseBlocked, so editing collision code or src/data
// cannot make an overlap disappear.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FROZEN = JSON.parse(fs.readFileSync(path.join(HERE, 'frozen-drive-grid.json'), 'utf8'));
const W = FROZEN.w, H = FROZEN.h, OPEN = FROZEN.open.map((r) => [...r].map((c) => c === '1'));
const EPS = 0.05;
export const cellOpen = (x, y) => x >= 0 && y >= 0 && x < W && y < H && OPEN[y][x];
export function footprint(cx, cy, dir) {
  const w = dir === 'se' || dir === 'nw' ? 5 : 3, h = w === 5 ? 3 : 5;
  const x0 = Math.floor(cx - w / 2 + EPS - 0.5) + 1, x1 = Math.ceil(cx + w / 2 - EPS + 0.5) - 1;
  const y0 = Math.floor(cy - h / 2 + EPS - 0.5) + 1, y1 = Math.ceil(cy + h / 2 - EPS + 0.5) - 1;
  const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]); return out;
}
export const blocked = (cx, cy, dir) => { let n = 0; for (const [x, y] of footprint(cx, cy, dir)) if (!cellOpen(x, y)) n++; return n; };
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
export const freeAhead = (x, y, d, r) => { for (let s = 0; s <= r + 1e-9; s += 0.25) if (blocked(x + V[d][0] * s, y + V[d][1] * s, d) !== 0) return false; return true; };
// Compare the build's own cell model with the frozen grid. driveCellOpen answers a cell the truck itself sits on
// from `claimed` (its pre-occupation walkability), so the truck's own footprint does not count as a difference.
export function gridDiff(jac) {
  const diff = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!!jac.driveCellOpen(x, y) !== OPEN[y][x]) diff.push([x, y]);
  return diff;
}
