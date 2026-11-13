#!/usr/bin/env node
/** BUILD | REF side-by-sides for k12 fichas + carga gates. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts/k12-sbs');
fs.mkdirSync(OUT, { recursive: true });

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writeSbs(buildPath, refPath, outPath, label) {
  const a = readPng(buildPath);
  const b = readPng(refPath);
  const w = a.width + b.width + 8;
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 20,
        g = 21,
        bl = 24,
        al = 255;
      if (x < a.width && y < a.height) {
        const j = (y * a.width + x) * 4;
        r = a.data[j];
        g = a.data[j + 1];
        bl = a.data[j + 2];
        al = a.data[j + 3];
      } else if (x >= a.width + 8 && x - a.width - 8 < b.width && y < b.height) {
        const bx = x - a.width - 8;
        const j = (y * b.width + bx) * 4;
        r = b.data[j];
        g = b.data[j + 1];
        bl = b.data[j + 2];
        al = b.data[j + 3];
      }
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = bl;
      out.data[i + 3] = al;
    }
  }
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(`${label}: build ${a.width}×${a.height} | ref ${b.width}×${b.height} → ${path.basename(outPath)}`);
}

const fichasBuild = path.join(ROOT, 'artifacts/fichas-ui-gate');
const fichasRef = path.join(ROOT, 'docs/ref/fichas-ui');
for (const name of fs.readdirSync(fichasBuild).filter((f) => f.endsWith('.png'))) {
  const base = name.replace('.png', '');
  const refName = `${base}@2x.png`;
  const refPath = path.join(fichasRef, refName);
  if (!fs.existsSync(refPath)) {
    console.warn(`skip fichas (no ref): ${refName}`);
    continue;
  }
  writeSbs(path.join(fichasBuild, name), refPath, path.join(OUT, `fichas_${base}.png`), `fichas/${base}`);
}

const cargaBuild = path.join(ROOT, 'artifacts/carga-ui-gate');
const cargaRef = path.join(ROOT, 'docs/ref/carga-ui');
const cargaMap = {
  'telefono-vertical-carga': 'telefono-vertical_1-carga@2x.png',
  'telefono-horizontal-carga': 'telefono-horizontal_1-carga@2x.png',
  'desktop-carga': 'desktop_1-carga@2x.png',
};
for (const [buildKey, refName] of Object.entries(cargaMap)) {
  const buildPath = path.join(cargaBuild, `${buildKey}.png`);
  const refPath = path.join(cargaRef, refName);
  if (!fs.existsSync(buildPath) || !fs.existsSync(refPath)) {
    console.warn(`skip carga: ${buildKey}`);
    continue;
  }
  writeSbs(buildPath, refPath, path.join(OUT, `carga_${buildKey}.png`), `carga/${buildKey}`);
}

console.log('Side-by-sides →', OUT);
