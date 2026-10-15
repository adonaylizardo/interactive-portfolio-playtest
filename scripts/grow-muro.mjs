#!/usr/bin/env node
/** Replaced: the plywood grow redrew the wall. Use `node scripts/scale-muro.mjs`. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, 'scale-muro.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
