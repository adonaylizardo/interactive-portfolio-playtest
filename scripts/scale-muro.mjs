#!/usr/bin/env node
/**
 * Restore the original muro-escalada art (pre-grow) and scale that silhouette
 * uniformly to the taller height (~2× the original 224 px frame ≈ 448, the
 * size of the resized wall). Nearest-neighbour; no new plywood.
 *
 *   node scripts/scale-muro.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** 2× original: 320×224 → 640×448, same angles/holds/base, grounded on the same south vertex. */
const NUM = 2;
const DEN = 1;
const ORIGIN = 'b4f9b71^';

const FILES = [
  'muro-escalada__vista-cerca@1x.png',
  'muro-escalada__vista-cerca@2x.png',
  'muro-escalada__vista-lejos@1x.png',
  'muro-escalada__vista-lejos@2x.png',
];

function gitPng(name) {
  const buf = execFileSync('git', ['show', `${ORIGIN}:public/sprites/paisaje/muro-escalada/${name}`], {
    cwd: root,
    maxBuffer: 20 * 1024 * 1024,
  });
  return PNG.sync.read(buf);
}

function scaleNn(src, num, den) {
  const w = Math.round((src.width * num) / den);
  const h = Math.round((src.height * num) / den);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * den) / num));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * den) / num));
      src.data.copy(out.data, (y * w + x) * 4, (sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4);
    }
  }
  return out;
}

function opaqueBBox(png) {
  let x0 = png.width;
  let y0 = png.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

function uniformProbes(png, count) {
  const r = 3;
  const cand = [];
  for (let y = r; y < png.height - r; y += 6) {
    for (let x = r; x < png.width - r; x += 6) {
      const i0 = (y * png.width + x) * 4;
      const c = [png.data[i0], png.data[i0 + 1], png.data[i0 + 2], png.data[i0 + 3]];
      if (c[3] !== 255) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((y + dy) * png.width + (x + dx)) * 4;
          if (png.data[i] !== c[0] || png.data[i + 1] !== c[1] || png.data[i + 2] !== c[2] || png.data[i + 3] !== 255) {
            ok = false;
            break;
          }
        }
      }
      if (ok) cand.push({ x, y, c });
    }
  }
  const seen = new Map();
  const picked = [];
  for (const p of cand) {
    const k = p.c.join(',');
    if (!seen.has(k)) {
      seen.set(k, true);
      picked.push(p);
    }
  }
  const step = Math.max(1, Math.floor(cand.length / count));
  for (let i = 0; i < cand.length && picked.length < count * 2; i += step) picked.push(cand[i]);
  const out = [];
  const stride = Math.max(1, Math.floor(picked.length / count));
  for (let i = 0; i < picked.length && out.length < count; i += stride) out.push(picked[i]);
  return out.map((p) => [p.x, p.y, p.c[0], p.c[1], p.c[2]]);
}

function orAlphaMask(png) {
  const cell = 4;
  const cw = Math.ceil(png.width / cell);
  const ch = Math.ceil(png.height / cell);
  const bits = new Uint8Array(Math.ceil((cw * ch) / 8));
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] <= 64) continue;
      const i = Math.floor(y / cell) * cw + Math.floor(x / cell);
      bits[i >> 3] |= 1 << (i & 7);
    }
  }
  return { w: cw, h: ch, cell, bits: Buffer.from(bits).toString('base64') };
}

function scalePt(p) {
  return [Math.round((p[0] * NUM) / DEN), Math.round((p[1] * NUM) / DEN)];
}

const dir = path.join(root, 'public', 'sprites', 'paisaje', 'muro-escalada');
const grown = {};
for (const name of FILES) {
  const src = gitPng(name);
  const out = scaleNn(src, NUM, DEN);
  writeFileSync(path.join(dir, name), PNG.sync.write(out));
  grown[name] = out;
  console.log(`muro: ${name} ${src.width}x${src.height} → ${out.width}x${out.height} (×${NUM}/${DEN} original)`);
}

const cerca = grown['muro-escalada__vista-cerca@1x.png'];
const lejos = grown['muro-escalada__vista-lejos@1x.png'];
const bbox = opaqueBBox(cerca);
const w = cerca.width;
const h = cerca.height;
const vfs = { x: Math.round((192 * NUM) / DEN), y: h };

const spritesPath = path.join(root, 'src', 'data', 'sprites.json');
const sprites = JSON.parse(readFileSync(spritesPath, 'utf8'));
for (const key of ['prop/muro/cerca', 'prop/muro/lejos']) {
  sprites.assets[key].w = w;
  sprites.assets[key].h = h;
  sprites.assets[key].vfs = vfs;
  sprites.assets[key].bbox = bbox;
}
writeFileSync(spritesPath, JSON.stringify(sprites, null, 1) + '\n');

const probesPath = path.join(root, 'public', 'sprites', 'probes.json');
const probes = JSON.parse(readFileSync(probesPath, 'utf8'));
probes['prop/muro/cerca'] = uniformProbes(cerca, 12);
probes['prop/muro/lejos'] = uniformProbes(lejos, 12);
writeFileSync(probesPath, JSON.stringify(probes));

const alphaPath = path.join(root, 'src', 'data', 'sprite-alpha.json');
const alpha = JSON.parse(readFileSync(alphaPath, 'utf8'));
const maskC = orAlphaMask(cerca);
const maskL = orAlphaMask(lejos);
if (maskC.w !== maskL.w || maskC.h !== maskL.h) throw new Error('muro cerca/lejos mask size mismatch');
const bitsC = Buffer.from(maskC.bits, 'base64');
const bitsL = Buffer.from(maskL.bits, 'base64');
for (let i = 0; i < bitsC.length; i++) bitsC[i] |= bitsL[i];
alpha['prop/muro'] = { w: maskC.w, h: maskC.h, cell: 4, bits: bitsC.toString('base64') };
writeFileSync(alphaPath, JSON.stringify(alpha) + '\n');

const noahPath = path.join(root, 'src', 'data', 'noah.json');
const noah = JSON.parse(readFileSync(noahPath, 'utf8'));
const origWp = {
  inicio_idle: [244, 148],
  base_muro: [264, 138],
  presa_arriba_izq: [264, 125],
  presa_arriba_der: [298, 142],
  abajo_der: [298, 149],
  aterrizaje: [305, 160],
};
for (const [name, p] of Object.entries(origWp)) {
  const p1 = scalePt(p);
  noah.waypoints_marco_muro[name]['1x'] = p1;
  noah.waypoints_marco_muro[name]['2x'] = [p1[0] * 2, p1[1] * 2];
}
noah.geometria_muro_principal =
  `cara de madera (~2.5× Adonay): original silhouette ×${NUM}/${DEN}; ` +
  `borde superior y = ${(66 * NUM) / DEN} + 0.5*(x-${(200 * NUM) / DEN}), ` +
  `base y = ${(101 * NUM) / DEN} + 0.5*(x-${(200 * NUM) / DEN}), marco @1x ${w}×${h}`;
writeFileSync(noahPath, JSON.stringify(noah, null, 1) + '\n');

console.log(`muro: sprites.json ${w}x${h} vfs=${JSON.stringify(vfs)} bbox=${JSON.stringify(bbox)}`);
console.log(`muro: alpha ${maskC.w}x${maskC.h} cell 4`);
