#!/usr/bin/env node
// swaplock, Sentinel QA4 §7.2. 180 cases. An accepted swap that pins the nose
// within 2 frames, with < 0.02 t travelled, and is still pinned 1.5 s later
// counts as one. The fix must report 0/180.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as OR from './oracle.mjs';

const SELF = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SELF, '../../..');
const DTS = [1 / 60, 0.1, 0.12];
const XS = [38.9, 39.0, 39.1, 39.2, 39.3];
const YS = [6.5, 7, 7.5, 8];
const RAMPS = [1.2, 1.6, 2.0];

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
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning', `--alias:pixi.js=${stub}`, '--define:import.meta.env.BASE_URL="/"'], { stdio: 'inherit' });
  return out;
}

const stick = (t, ramp) => {
  if (t < 0.3) return { dx: 0, dy: -1 };
  const u = Math.max(0, Math.min(1, (t - 0.3) / ramp));
  const a = (0.32 + 0.4 * u) * (Math.PI / 2);
  return { dx: Math.sin(a), dy: -Math.cos(a) };
};
const pinned = (jac) => !OR.freeAhead(jac.cx, jac.cy, jac.dir, 0.25);

function runCase(jac, dt, x0, y0, ramp) {
  jac.qaSpawnDrive(x0, y0, 'sw');
  jac.setGear('D');
  let t = 0;
  let since = null;
  let confirmAt = null;
  const end = 6;
  while (t < end - 1e-9 || (confirmAt !== null && t < confirmAt + 1.5 - 1e-9)) {
    const prev = jac.dir;
    jac.update(dt, stick(Math.min(t, end), ramp));
    t += dt;
    if (confirmAt === null) {
      if (jac.dir !== prev) since = 0;
      else if (since !== null) since += 1;
      if (since !== null && since <= 2 && jac.travelSinceDir < 0.02 && pinned(jac)) confirmAt = t;
      else if (since !== null && since >= 2) since = null;
    } else if (t >= confirmAt + 1.5 - 1e-9) {
      if (pinned(jac) && Math.abs(jac.vel) < 0.01) {
        return `${prev}->${jac.dir} @(${jac.cx.toFixed(2)},${jac.cy.toFixed(2)}) v=${jac.vel.toFixed(3)}`;
      }
      confirmAt = null;
      since = null;
    }
  }
  return null;
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

const examples = [];
let cases = 0;
let locks = 0;
for (const dt of DTS) for (const x0 of XS) for (const y0 of YS) for (const ramp of RAMPS) {
  cases += 1;
  const hit = runCase(jac, dt, x0, y0, ramp);
  if (hit) {
    locks += 1;
    if (examples.length < 8) examples.push(`dt=${dt} (${x0},${y0}) ramp=${ramp} ${hit}`);
  }
}

console.log(JSON.stringify({ cases, locks, examples }));
if (cases !== 180 || locks !== 0) {
  console.error(`FAIL swaplock ${locks}/${cases}`);
  process.exit(1);
}
console.log('PASS swaplock 0/180');
