#!/usr/bin/env node
/**
 * Merge Teresa Carreño + Biblioteca sprites from portfolio/forge-paquete into the game
 * without wiping the rest of public/sprites.
 */
import { readFileSync, existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packDir = path.join(root, 'portfolio', 'forge-paquete');
const outDir = path.join(root, 'public', 'sprites');

const strip = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parseName(nombre) {
  const out = {};
  for (const part of nombre.split(',')) {
    const [k, v] = part.split('=').map((s) => strip(s.trim()));
    out[k] = v;
  }
  return out;
}

function stateOf(p) {
  const s = p.estado;
  return s === 'exterior' || s === 'default' ? 'default' : s;
}

function readPng(file) {
  return PNG.sync.read(readFileSync(file));
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

const MASK_CELL = 4;
const maskBase = (key) => key.split('/').slice(0, 2).join('/');

function orAlphaMask(masks, baseId, png) {
  const cw = Math.ceil(png.width / MASK_CELL);
  const ch = Math.ceil(png.height / MASK_CELL);
  let m = masks[baseId];
  if (!m) m = masks[baseId] = { w: cw, h: ch, cell: MASK_CELL, bits: new Uint8Array(Math.ceil((cw * ch) / 8)) };
  if (m.w !== cw || m.h !== ch) throw new Error(`${baseId}: variant sizes differ`);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] <= 64) continue;
      const i = Math.floor(y / MASK_CELL) * cw + Math.floor(x / MASK_CELL);
      m.bits[i >> 3] |= 1 << (i & 7);
    }
  }
}

function exteriorKey(id, p) {
  const state = stateOf(p);
  const zoom = p.zoom ?? 'cerca';
  if (zoom === 'lejos') return `ext/${id}/${state}/${zoom}`;
  if (state === 'default' && p.luz) {
    const raw = p.luz;
    const luz = raw.includes('apagada') ? 'apagada' : 'encendida';
    return `ext/${id}/${state}/${luz}/${zoom}`;
  }
  return `ext/${id}/${state}/${zoom}`;
}

const GROUPS = [
  { dir: 'exteriores/teresa-carreno', id: 'teresa', key: (p) => exteriorKey('teresa', p) },
  { dir: 'exteriores/biblioteca-ingenieria', id: 'biblioteca', key: (p) => exteriorKey('biblioteca', p) },
  { dir: 'interiores/teresa-carreno', id: 'teresa', key: (p) => `int/teresa/${p.zoom}` },
  { dir: 'interiores/biblioteca-ingenieria', id: 'biblioteca', key: (p) => `int/biblioteca/${p.zoom}` },
];

const spritesJson = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'sprites.json'), 'utf8'));
const alphaJson = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'sprite-alpha.json'), 'utf8'));
const probesPath = path.join(outDir, 'probes.json');
const probes = existsSync(probesPath) ? JSON.parse(readFileSync(probesPath, 'utf8')) : {};

const masks = {};
for (const [k, raw] of Object.entries(alphaJson)) {
  masks[k] = {
    w: raw.w,
    h: raw.h,
    cell: raw.cell,
    bits: Uint8Array.from(Buffer.from(raw.bits, 'base64')),
  };
}

let added = 0;

for (const g of GROUPS) {
  const manifestPath = path.join(packDir, g.dir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`missing ${manifestPath}`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const v of manifest.variantes) {
    const p = parseName(v.nombre);
    const key = g.key(p);
    const vfs = v.vertice_frontal_suelo ?? { x: v.ancla.x, y: v.ancla.y + (v.offset_y ?? 0) };
    const dstDir = path.join(outDir, g.dir);
    await mkdir(dstDir, { recursive: true });
    for (const k of ['png1x', 'png2x']) {
      const dst = path.join(dstDir, v.archivos[k]);
      await copyFile(path.join(packDir, g.dir, v.archivos[k]), dst);
      copyFileSync(dst, dst.replace(/\.png$/i, '.webp'));
    }
    const png1 = readPng(path.join(packDir, g.dir, v.archivos.png1x));
    spritesJson.assets[key] = {
      w: v.tamano.w,
      h: v.tamano.h,
      vfs: { x: vfs.x, y: vfs.y },
      bbox: opaqueBBox(png1),
      f1: `${g.dir}/${v.archivos.png1x}`,
      f2: `${g.dir}/${v.archivos.png2x}`,
    };
    added++;
    if (key.startsWith('ext/')) orAlphaMask(masks, maskBase(key), png1);
  }
}

for (const id of ['teresa', 'biblioteca']) {
  const enc = spritesJson.assets[`ext/${id}/default/encendida/cerca`];
  const apg = spritesJson.assets[`ext/${id}/default/apagada/cerca`];
  if (enc) spritesJson.assets[`ext/${id}/default/cerca`] = { ...enc };
  if (apg && !spritesJson.assets[`ext/${id}/default/apagada/cerca`]) {
    spritesJson.assets[`ext/${id}/default/apagada/cerca`] = { ...apg };
  }
}

await writeFile(path.join(root, 'src', 'data', 'sprites.json'), JSON.stringify(spritesJson, null, 1) + '\n');

const maskOut = {};
for (const [k, m] of Object.entries(masks)) {
  maskOut[k] = { w: m.w, h: m.h, cell: m.cell, bits: Buffer.from(m.bits).toString('base64') };
}
await writeFile(path.join(root, 'src', 'data', 'sprite-alpha.json'), JSON.stringify(maskOut) + '\n');

console.log(`import-teatro-biblioteca: ${added} sprite variants merged`);
