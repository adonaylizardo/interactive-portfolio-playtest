#!/usr/bin/env node
/** Batch r30 — CI-only: panel settle, case preview expand, pinch load (regression guard). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';

const errors = [];
for (const [name, script] of [
  ['case-375', 'QA_SMOKE_ONLY=case-375 node scripts/qa-smoke.mjs'],
  ['exits-desktop-c', 'QA_SMOKE_ONLY=exits-desktop-c node scripts/qa-smoke.mjs'],
]) {
  const r = spawnSync('bash', ['-lc', script], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, QA_BASE_URL: BASE, QA_CI: '1', QA_CHROMIUM_ONLY: '1' },
    timeout: 900_000,
  });
  if (r.status !== 0) {
    errors.push(`${name}: exit ${r.status}`);
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
  }
}

const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
if (lint.status !== 0) errors.push('typecheck failed');

if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('qa-batch-r30: ok');
