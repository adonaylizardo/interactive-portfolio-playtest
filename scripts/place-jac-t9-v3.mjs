#!/usr/bin/env node
/**
 * Register the parked JAC T9 v3 SE sheet as a map-fill prop at S=(27,18).
 * Only the parked (apagado) SE frame is added so the boot atlas stays one page.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASK_CELL = 4;
const F1 = 'jac-t9-v3/jac-t9-v3__apagado_se@1x.png';
const F2 = 'jac-t9-v3/jac-t9-v3__apagado_se@2x.png';
const BASE = 'fill/jac-t9-v3';
const FRONT = [27, 18];
const FOOT = { x: 24, y: 17, w: 4, h: 2 };

const png1 = PNG.sync.read(readFileSync(path.join(ROOT, 'public/sprites', F1)));
const png2 = PNG.sync.read(readFileSync(path.join(ROOT, 'public/sprites', F2)));
if (png1.width * 2 !== png2.width || png1.height * 2 !== png2.height) {
  throw new Error(`jac-t9-v3: @2x ${png2.width}x${png2.height} is not 2× @1x ${png1.width}x${png1.height}`);
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

function packMask(png) {
  const w = Math.ceil(png.width / MASK_CELL);
  const h = Math.ceil(png.height / MASK_CELL);
  const bits = new Uint8Array(Math.ceil((w * h) / 8));
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] <= 64) continue;
      const i = Math.floor(y / MASK_CELL) * w + Math.floor(x / MASK_CELL);
      bits[i >> 3] |= 1 << (i & 7);
    }
  }
  return { w, h, cell: MASK_CELL, bits: Buffer.from(bits).toString('base64') };
}

const cells = [];
for (let dy = 0; dy < FOOT.h; dy++) {
  for (let dx = 0; dx < FOOT.w; dx++) cells.push([FOOT.x + dx, FOOT.y + dy]);
}

const frame = {
  w: png1.width,
  h: png1.height,
  vfs: { x: 172, y: 138 },
  bbox: opaqueBBox(png1),
  f1: F1,
  f2: F2,
};

const rellenoPath = path.join(ROOT, 'src/data/relleno.json');
const relleno = JSON.parse(readFileSync(rellenoPath, 'utf8'));
relleno.assets[`${BASE}/cerca`] = { ...frame };
relleno.assets[`${BASE}/lejos`] = { ...frame };
relleno.masks[BASE] = packMask(png1);
relleno.placements = relleno.placements.filter((p) => p.id !== 'jac-t9');
relleno.placements.push({
  id: 'jac-t9',
  kind: 'prop',
  sprite: BASE,
  footprint: FOOT,
  front: FRONT,
  cells,
});
writeFileSync(rellenoPath, `${JSON.stringify(relleno, null, 1)}\n`);

const manPath = path.join(ROOT, 'public/sprites/jac-t9-v3/manifest.v3.json');
const man = JSON.parse(readFileSync(manPath, 'utf8'));
man.estado = 'EN_MAPA';
man.aprobado_para_mapa = true;
man.aprobaciones.colocacion_en_mapa = 'aprobada por Adonay (15 oct 2026)';
man.colocacion.activa = true;
man.colocacion.propuesta.nota =
  'celda S = vértice sur de la huella 4×2; origen (24,17), frente (27,18), dir SE';
writeFileSync(manPath, `${JSON.stringify(man, null, 2)}\n`);

console.log('jac-t9-v3', {
  frame: `${frame.w}x${frame.h}`,
  vfs: frame.vfs,
  bbox: frame.bbox,
  footprint: FOOT,
  front: FRONT,
  mask: `${relleno.masks[BASE].w}x${relleno.masks[BASE].h}`,
});
