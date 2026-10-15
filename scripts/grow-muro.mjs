#!/usr/bin/env node
/**
 * Grow the climbing wall ~2.5× character height (100 world px) while keeping the 3×2
 * isometric floor diamond grounded on the same south vertex.
 *
 *   node scripts/grow-muro.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Extra rows on the 1× art. 215 + ~35 px wood face ≈ 250 px = 2.5 × Adonay. */
const EXTRA_1X = 215;
const HOLD = [66, 66, 68, 255];
const HOLD_HI = [96, 98, 104, 255];

const FILES = [
  'muro-escalada__vista-cerca@1x.png',
  'muro-escalada__vista-cerca@2x.png',
  'muro-escalada__vista-lejos@1x.png',
  'muro-escalada__vista-lejos@2x.png',
];

function hash(x, y) {
  return Math.imul(x * 374761393 + y * 668265263, 1597334677) >>> 0;
}

function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

function grow(src, extra) {
  const out = new PNG({ width: src.width, height: src.height + extra });
  out.data.fill(0);
  for (let y = 0; y < src.height; y++) {
    src.data.copy(out.data, ((y + extra) * src.width + 0) * 4, (y * src.width) * 4, ((y + 1) * src.width) * 4);
  }

  const colTop = new Int16Array(src.width);
  colTop.fill(-1);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (colTop[x] >= 0) continue;
      if (src.data[(y * src.width + x) * 4 + 3] > 16) colTop[x] = y;
    }
  }

  const k = extra / EXTRA_1X;
  const cap = Math.max(3, Math.round(4 * k));
  const holdR = Math.max(2, Math.round(3.5 * k));
  const wood = [42, 37, 33, 255];
  const woodHi = [58, 52, 46, 255];
  const woodLo = [32, 28, 26, 255];
  const edge = [26, 28, 32, 255];

  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
    const i = (y * out.width + x) * 4;
    out.data[i] = c[0];
    out.data[i + 1] = c[1];
    out.data[i + 2] = c[2];
    out.data[i + 3] = c[3];
  };
  const getSrc = (x, y) => {
    y = Math.max(0, Math.min(src.height - 1, y));
    x = Math.max(0, Math.min(src.width - 1, x));
    const i = (y * src.width + x) * 4;
    return [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
  };

  // Roof cap + plywood face from the original silhouette up to the old roof.
  for (let x = 0; x < src.width; x++) {
    const top = colTop[x];
    if (top < 0) continue;
    const seam = Math.abs(((x + Math.round(top * 2)) / Math.max(8, Math.round(40 * k))) % 1 - 0.5) < 0.04;
    for (let y = top; y < extra + top; y++) {
      if (y < top + cap) {
        put(x, y, getSrc(x, top + (y - top)));
        continue;
      }
      const grain = (hash(x, Math.floor(y / Math.max(2, k))) >> 8) & 7;
      const shade = seam ? woodHi : grain < 2 ? woodLo : wood;
      put(x, y, shade);
    }
    put(x, top, edge);
  }

  const holdAt = (hx, hy) => {
    const cx = Math.round(hx);
    const cy = Math.round(hy);
    for (let dy = -holdR; dy <= holdR; dy++) {
      for (let dx = -holdR - 1; dx <= holdR + 1; dx++) {
        const rr = (dx * dx) / ((holdR + 1.4) * (holdR + 1.4)) + (dy * dy) / (holdR * holdR);
        if (rr > 1) continue;
        put(cx + dx, cy + dy, dy < -1 ? HOLD_HI : HOLD);
      }
    }
  };

  const stagger = Math.max(16, Math.round(28 * k));
  for (let x = 14; x < src.width - 14; x += Math.max(18, Math.round(32 * k))) {
    const top = colTop[x];
    if (top < 0) continue;
    for (let y = top + cap + holdR + 6; y < extra + top - 10; y += stagger) {
      if ((hash(x, y) & 3) === 0) continue;
      holdAt(x + ((hash(x, y) >> 2) % 5) - 2, y);
    }
  }
  for (const [hx, hy] of [
    [264, 95],
    [298, 112],
    [250, 170],
    [280, 155],
    [264, 230],
    [298, 248],
    [240, 300],
    [286, 318],
  ]) {
    holdAt(hx * k, hy * k);
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

const dir = path.join(root, 'public', 'sprites', 'paisaje', 'muro-escalada');
const grown = {};
for (const name of FILES) {
  const src = readPng(path.join(dir, name));
  const extra = name.includes('@2x') ? EXTRA_1X * 2 : EXTRA_1X;
  const wantH = (name.includes('@2x') ? 448 : 224) + extra;
  if (src.height === wantH) {
    grown[name] = src;
    console.log(`muro: ${name} already ${src.width}x${src.height}`);
    continue;
  }
  if (src.height !== (name.includes('@2x') ? 448 : 224)) {
    throw new Error(`${name}: unexpected ${src.width}x${src.height}`);
  }
  const out = grow(src, extra);
  writeFileSync(path.join(dir, name), PNG.sync.write(out));
  grown[name] = out;
  console.log(`muro: ${name} ${src.width}x${src.height} → ${out.width}x${out.height}`);
}

const cerca = grown['muro-escalada__vista-cerca@1x.png'];
const lejos = grown['muro-escalada__vista-lejos@1x.png'];
const bbox = opaqueBBox(cerca);
const vfsY = 224 + EXTRA_1X;

const spritesPath = path.join(root, 'src', 'data', 'sprites.json');
const sprites = JSON.parse(readFileSync(spritesPath, 'utf8'));
for (const key of ['prop/muro/cerca', 'prop/muro/lejos']) {
  sprites.assets[key].h = 224 + EXTRA_1X;
  sprites.assets[key].vfs.y = vfsY;
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

console.log(`muro: sprites.json h=${224 + EXTRA_1X} vfs.y=${vfsY} bbox=${JSON.stringify(bbox)}`);
console.log(`muro: alpha ${maskC.w}x${maskC.h} cell 4`);
