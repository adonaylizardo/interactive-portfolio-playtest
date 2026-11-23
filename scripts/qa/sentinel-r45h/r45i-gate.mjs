// Permanent drive gate. Fails the process when a headless check regresses.
//   low-FPS overlap     ov.mjs at dt 1/60, 0.1, 0.25
//   no-steer facing     h1.mjs at the same steps
//   velocity honesty    honest.mjs (also repeats overlap and the 35° slide)
//   turn at speed       g10.mjs at dt 1/60 and 0.1 (>=75% clean 90° turns)
//   prop shuttle        h3b.mjs at dt 1/60 (a dead stop is a failure)
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const dts = [1 / 60, 0.1, 0.25];
const env = { ...process.env };

// The harness drives the real JacT9 class through a pixi stub. Build that
// bundle here so the gate runs without a pre-set BUNDLE.
if (!env.BUNDLE) {
  const out = path.join(os.tmpdir(), 'jac-r45i-bundle.mjs');
  const built = spawnSync(
    'npx',
    [
      'esbuild',
      path.join(here, 'entry.ts'),
      '--bundle',
      '--format=esm',
      '--platform=node',
      `--outfile=${out}`,
      `--alias:pixi.js=${path.join(here, 'pixi-stub.mjs')}`,
      '--define:import.meta.env.BASE_URL="/"',
    ],
    { cwd: repo, encoding: 'utf8' },
  );
  if (built.status !== 0) {
    process.stderr.write(`${built.stdout || ''}${built.stderr || ''}`);
    console.log('r45i gate: FAIL (bundle)');
    process.exit(1);
  }
  env.BUNDLE = out;
}
let failed = false;

function run(script, dt) {
  const r = spawnSync(process.execPath, [path.join(here, script), String(dt)], {
    env,
    encoding: 'utf8',
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  if (r.status !== 0 && r.status !== null) failed = true;
  return out;
}

for (const dt of dts) {
  const h1 = run('h1.mjs', dt);
  const auto = Number(h1.match(/NO steer input=(\d+)/)?.[1] ?? '1');
  const lat = Number(h1.match(/swap frame=([0-9.]+)/)?.[1] ?? '1');
  if (auto !== 0 || lat > 0.05) {
    console.log(`FAIL h1 dt=${dt} autoturn=${auto} lateral=${lat}`);
    failed = true;
  }
  const ov = run('ov.mjs', dt);
  const n = Number(ov.match(/overlapped:\s*(\d+)/)?.[1] ?? '1');
  if (n !== 0) {
    console.log(`FAIL ov dt=${dt} overlaps=${n}`);
    failed = true;
  }
  run('honest.mjs', dt);
}

for (const dt of [1 / 60, 0.1]) run('g10.mjs', dt);
run('h3b.mjs', 1 / 60);

if (failed) {
  console.log('r45i gate: FAIL');
  process.exit(1);
}
console.log('r45i gate: PASS');
