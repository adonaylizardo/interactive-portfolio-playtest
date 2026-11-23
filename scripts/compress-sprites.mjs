#!/usr/bin/env node
/**
 * Sibling WebP for every PNG under public/sprites. Pixel-art strips (personaje) are lossless;
 * map art is lossy q=80. Skips files whose WebP is newer than the PNG.
 */
import { spawn } from 'node:child_process';
import { readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES = path.join(ROOT, 'public/sprites');
const JOBS = Math.max(2, Math.min(8, Number(process.env.CONVERT_JOBS) || 6));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith('.png')) out.push(p);
  }
  return out;
}

function convertOne(png) {
  const webp = png.replace(/\.png$/i, '.webp');
  if (existsSync(webp) && statSync(webp).mtimeMs >= statSync(png).mtimeMs) return Promise.resolve('skip');
  const lossless = png.includes(`${path.sep}personaje${path.sep}`);
  const args = lossless
    ? [png, '-define', 'webp:lossless=true', '-define', 'webp:method=4', webp]
    : [png, '-quality', '80', '-define', 'webp:method=4', webp];
  return new Promise((resolve, reject) => {
    const child = spawn('convert', args, { stdio: 'ignore' });
    child.on('exit', (code) => (code === 0 ? resolve('ok') : reject(new Error(`convert ${png} exit ${code}`))));
    child.on('error', reject);
  });
}

const files = walk(SPRITES);
let i = 0;
let done = 0;
let wrote = 0;
let skipped = 0;
const errors = [];

async function worker() {
  while (i < files.length) {
    const f = files[i++];
    try {
      const r = await convertOne(f);
      if (r === 'ok') wrote++;
      else skipped++;
    } catch (e) {
      errors.push(String(e));
    }
    done++;
    if (done % 80 === 0 || done === files.length) {
      console.log(`compress-sprites ${done}/${files.length} wrote ${wrote} skipped ${skipped}`);
    }
  }
}

await Promise.all(Array.from({ length: JOBS }, () => worker()));
if (errors.length) {
  console.error(errors.slice(0, 8).join('\n'));
  process.exit(1);
}
console.log(`compress-sprites done: ${wrote} webp, ${skipped} up to date, ${files.length} png`);
