#!/usr/bin/env node
// Headless swaplock: a moving swap must not leave the truck nose-pinned with
// 0 t travelled and only R as a way out.
// 180 stick-circle cases on the street into the west wall at (37.95, ~14.9),
// the sw→nw repro (x=39, y=12, circle sign +1 lands on that pose).
// Exit 0 only when every case is driven and none of those pins occur.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SELF, '../../..');
const V = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
const dt = 1 / 60;

function bundle() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swaplock-'));
  const stub = path.join(tmp, 'pixi-stub.mjs');
  fs.writeFileSync(stub, `const mk = () => new Proxy(function () {}, { get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; }, set(t, p, v) { t[p] = v; return true; }, apply() { return mk(); }, construct() { return mk(); } });
export const Assets = mk(), Container = mk(), Graphics = mk(), Rectangle = mk(), Sprite = mk(), Texture = mk();
export default mk();
`);
  const entry = path.join(tmp, 'entry.ts');
  const src = path.join(REPO, 'src');
  fs.writeFileSync(entry, `import { JacT9 } from ${JSON.stringify(path.join(src, 'game/jacT9.ts'))};
import { objects } from ${JSON.stringify(path.join(src, 'data/map.ts'))};
(globalThis as any).__T = { JacT9, objects };
`);
  const out = path.join(tmp, 'bundle.mjs');
  const esb = path.join(REPO, 'node_modules/.bin/esbuild');
  execFileSync(esb, [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning', `--alias:pixi.js=${stub}`, '--define:import.meta.env.BASE_URL="/"'], { stdio: 'inherit' });
  return out;
}

const noseBlocked = (jac) => {
  const f = V[jac.dir];
  return jac.poseBlocked(jac.cx + f[0] * 0.12, jac.cy + f[1] * 0.12, jac.dir) > 0;
};
const backClear = (jac) => {
  const f = V[jac.dir];
  return jac.poseBlocked(jac.cx - f[0] * 0.4, jac.cy - f[1] * 0.4, jac.dir) === 0;
};

// Candidates facing sw on the street into the west wall. The first 180 that
// spawn are the cases. The sw→nw repro lane (x=39 and x=40, y=8..12) is first.
function candidates() {
  const out = [];
  const push = (x, y, sign) => out.push({ x: +x.toFixed(2), y: +y.toFixed(2), dir: 'sw', sign });
  for (let y = 8; y <= 12.01; y += 0.5) for (const x of [39, 40]) for (const sign of [1, -1]) push(x, y, sign);
  for (let y = 8; y <= 20.01; y += 0.5) for (let x = 36; x <= 55.01; x += 0.5) for (const sign of [1, -1]) push(x, y, sign);
  return out;
}

await import(pathToFileURL(bundle()).href);
const T = globalThis.__T;
const obj = T.objects.find((o) => o.id === 'fill/jac-t9');
const mk = () => new Proxy(function () {}, {
  get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (!(p in t)) t[p] = mk(); return t[p]; },
  set(t, p, v) { t[p] = v; return true; },
  apply() { return mk(); },
  construct() { return mk(); },
});
const jac = new T.JacT9(obj, { container: mk(), visual: new Proxy({}, { get: () => mk() }), tapBox: new Map(), onStuck() {} });
jac.setMode('drive');

const planned = candidates();
let driven = 0;
let pins = 0;
const examples = [];
let droveRepro = false;

for (const c of planned) {
  if (driven >= 180) break;
  if (jac.poseBlocked(c.x, c.y, c.dir) !== 0) continue;
  jac.qaSpawnDrive(c.x, c.y, c.dir);
  if (Math.hypot(jac.cx - c.x, jac.cy - c.y) > 0.08 || jac.dir !== c.dir) continue;
  jac.setGear('D');
  driven++;
  if (c.x === 39 && c.y === 12 && c.sign === 1) droveRepro = true;
  let t = 0;
  let pinned = false;
  while (t < 2.6 && !pinned) {
    const a = -Math.PI / 2 + c.sign * t * 2.1;
    const dx = Math.cos(a);
    const dy = Math.sin(a) > 0.15 ? Math.sin(a) : Math.min(-0.45, Math.sin(a));
    const prevDir = jac.dir;
    const prevVel = jac.vel;
    jac.update(dt, { dx, dy });
    t += dt;
    const freshSwap = prevDir !== jac.dir && jac.travelSinceDir < 0.02 && Math.abs(prevVel) > 3 && noseBlocked(jac);
    if (!freshSwap) continue;
    const at = [jac.cx, jac.cy, jac.dir];
    let moved = 0;
    let u = 0;
    while (u < 0.45) {
      const bx = jac.cx;
      const by = jac.cy;
      jac.update(dt, { dx, dy });
      moved += Math.hypot(jac.cx - bx, jac.cy - by);
      u += dt;
      t += dt;
    }
    // Nose still in the wall, D+steer did not leave, and a reverse step is open.
    if (moved < 0.15 && noseBlocked(jac) && backClear(jac)) {
      pinned = true;
      pins++;
      if (examples.length < 8) examples.push(`(${c.x},${c.y},${c.dir}) s=${c.sign} ${prevDir}->${at[2]} v${prevVel.toFixed(2)} @(${at[0].toFixed(2)},${at[1].toFixed(2)})`);
    }
  }
}

const fail = [];
if (driven !== 180) fail.push(`drove ${driven}/180`);
if (!droveRepro) fail.push('repro start (39, 12, sw, +1) was not driven');
if (pins !== 0) fail.push(`R-only pins ${pins}/180 ${examples.join(' | ')}`);
console.log(JSON.stringify({ cases: driven, rOnlyPins: pins, examples, droveRepro }));
if (fail.length) {
  for (const line of fail) console.error('FAIL', line);
  process.exit(1);
}
console.log('PASS swaplock 0/180 R-only pins');
