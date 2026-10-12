#!/usr/bin/env node
/**
 * Imports the Forge sprite pack into the game:
 *   node scripts/build-sprites.mjs <path/to/forge-paquete>
 * Copies the PNGs into public/sprites, writes src/data/sprites.json (sizes, anchors, doors,
 * walk masks, collisions) and public/sprites/probes.json (QA pixel-diff samples).
 */
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packDir = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('usage: node scripts/build-sprites.mjs <forge-paquete dir>');
  process.exit(1);
}
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

const GROUPS = [
  { dir: 'exteriores/flor-de-venezuela', key: (p) => `ext/flor/${stateOf(p)}/${p.zoom}` },
  { dir: 'exteriores/catedral-de-barquisimeto', key: (p) => `ext/catedral/${stateOf(p)}/${p.zoom}` },
  { dir: 'exteriores/sambil-barquisimeto', key: (p) => `ext/sambil/${stateOf(p)}/${p.zoom}` },
  { dir: 'exteriores/estudio-6x6', key: (p) => `ext/estudio/${stateOf(p)}/${p.zoom}` },
  ...['volaris', 'bain', 'mentoria', 'finoa', 'pg'].map((id) => ({
    dir: `exteriores/casas-caso/${id}`,
    key: (p) => `ext/${id}/${stateOf(p)}/${p.zoom}`,
    meta: ['puerta', 'llegada', 'punto_lejos'],
  })),
  ...['volaris', 'bain', 'mentoria', 'finoa', 'pg'].map((id) => ({
    dir: `interiores/casas-caso/${id}`,
    key: (p) => `int/${id}/${p.zoom}`,
    meta: ['mascara_caminable', 'puerta', 'tapete_salida'],
  })),
  { dir: 'paisaje/arbol', key: (p) => `prop/arbol/${p.especie}/${p.vista}` },
  { dir: 'paisaje/banco-exterior', key: (p) => `prop/banco/${p.orientacion}/${p.vista}` },
  { dir: 'paisaje/farol-exterior', key: (p) => `prop/farol/${p.orientacion}/${p.vista}` },
  { dir: 'paisaje/muro-escalada', key: (p) => `prop/muro/${p.vista}` },
  { dir: 'paisaje/obelisco', key: (p) => `prop/obelisco/${p.vista}`, meta: ['colision', 'punto_lejos', 'frente', 'arco'] },
  { dir: 'paisaje/redoma', key: (p) => `prop/redoma/${p.vista}` },
  { dir: 'tiles/suelo', key: (p) => `tile/suelo/${p.caminable}-${p.borde}` },
  { dir: 'tiles/calle', key: (p) => `tile/calle/${p.abre}` },
  { dir: 'tiles/parque', key: (p) => `tile/parque/${p.caminable}-${p.sendero}-${p.borde}` },
];

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

/** Pixels whose (2r+1)² neighbourhood is one opaque colour: stable under scaling and filtering. */
function uniformProbes(png, count, skip) {
  const r = 3;
  const cand = [];
  for (let y = r; y < png.height - r; y += 6) {
    for (let x = r; x < png.width - r; x += 6) {
      if (skip?.(x, y)) continue;
      const i0 = (y * png.width + x) * 4;
      const c = [png.data[i0], png.data[i0 + 1], png.data[i0 + 2], png.data[i0 + 3]];
      if (c[3] !== 255) continue;
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((y + dy) * png.width + (x + dx)) * 4;
          if (
            png.data[i] !== c[0] ||
            png.data[i + 1] !== c[1] ||
            png.data[i + 2] !== c[2] ||
            png.data[i + 3] !== 255
          ) {
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
  // First pass: one probe per distinct colour, then fill by spatial spread.
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

const MASK_CELL = 4;
const MASKED = /^(ext\/[^/]+|prop\/(muro|obelisco|redoma))\//;

/** Tap mask: a cell is solid when any pixel in it is clearly opaque (union over all states/zooms). */
function orAlphaMask(masks, baseId, png) {
  const cw = Math.ceil(png.width / MASK_CELL);
  const ch = Math.ceil(png.height / MASK_CELL);
  let m = masks[baseId];
  if (!m) m = masks[baseId] = { w: cw, h: ch, cell: MASK_CELL, bits: new Uint8Array(Math.ceil((cw * ch) / 8)) };
  if (m.w !== cw || m.h !== ch) throw new Error(`${baseId}: variant sizes differ, cannot share a tap mask`);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] <= 64) continue;
      const i = Math.floor(y / MASK_CELL) * cw + Math.floor(x / MASK_CELL);
      m.bits[i >> 3] |= 1 << (i & 7);
    }
  }
}

const assets = {};
const probes = {};
const meta = {};
const masks = {};

await rm(outDir, { recursive: true, force: true });

for (const g of GROUPS) {
  const manifest = JSON.parse(await readFile(path.join(packDir, g.dir, 'manifest.json'), 'utf8'));
  const idKey = g.key({ estado: 'default', zoom: 'cerca' });
  const baseId = idKey.split('/').slice(0, 2).join('/');
  if (g.meta) {
    meta[baseId] = {};
    for (const m of g.meta) if (manifest[m] !== undefined) meta[baseId][m] = manifest[m];
  }
  for (const v of manifest.variantes) {
    const p = parseName(v.nombre);
    const key = g.key(p);
    // Manifest placement: top-left = S − ancla − (0, offset_y); edge slabs hang below S with offset_y = −24.
    const vfs = v.vertice_frontal_suelo ?? { x: v.ancla.x, y: v.ancla.y + (v.offset_y ?? 0) };
    const dstDir = path.join(outDir, g.dir);
    await mkdir(dstDir, { recursive: true });
    for (const k of ['png1x', 'png2x']) {
      await copyFile(path.join(packDir, g.dir, v.archivos[k]), path.join(dstDir, v.archivos[k]));
    }
    const png1 = readPng(path.join(packDir, g.dir, v.archivos.png1x));
    if (png1.width !== v.tamano.w || png1.height !== v.tamano.h) {
      throw new Error(`${key}: PNG ${png1.width}x${png1.height} != manifest ${v.tamano.w}x${v.tamano.h}`);
    }
    assets[key] = {
      w: v.tamano.w,
      h: v.tamano.h,
      vfs: { x: vfs.x, y: vfs.y },
      bbox: opaqueBBox(png1),
      f1: `${g.dir}/${v.archivos.png1x}`,
      f2: `${g.dir}/${v.archivos.png2x}`,
    };
    // Keep the character's spawn and exit cells out of the interior probes.
    const skip = key.startsWith('int/') ? (x, y) => Math.abs(x - 300) < 90 && y > 380 : undefined;
    probes[key] = uniformProbes(png1, 12, skip);
    if (MASKED.test(key)) orAlphaMask(masks, key.split('/').slice(0, 2).join('/'), png1);
  }
}

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'probes.json'), JSON.stringify(probes));
await writeFile(
  path.join(root, 'src', 'data', 'sprites.json'),
  JSON.stringify({ assets, meta }, null, 1) + '\n',
);
const maskOut = {};
for (const [k, m] of Object.entries(masks)) {
  maskOut[k] = { w: m.w, h: m.h, cell: m.cell, bits: Buffer.from(m.bits).toString('base64') };
}
await writeFile(path.join(root, 'src', 'data', 'sprite-alpha.json'), JSON.stringify(maskOut) + '\n');
console.log(`sprites: ${Object.keys(assets).length} variants, ${Object.keys(meta).length} meta groups, ${Object.keys(masks).length} tap masks`);
