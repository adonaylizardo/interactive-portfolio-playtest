#!/usr/bin/env node
/**
 * Imports the map-fill pack (forge-paquete/relleno + mapa/plan-relleno.json):
 *   node scripts/build-relleno.mjs <path/to/forge-paquete/relleno> <path/to/plan-relleno.json>
 * Copies only the variants the plan uses into public/sprites/relleno and writes src/data/relleno.json
 * (vector prop frames, pixel animations, 4 px alpha masks and the plan's placements). Placement
 * validation against the live map happens at runtime in src/data/fill.ts.
 */
import { readFileSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [packArg, planArg] = process.argv.slice(2);
if (!packArg || !planArg) {
  console.error('usage: node scripts/build-relleno.mjs <relleno dir> <plan-relleno.json>');
  process.exit(1);
}
const packDir = path.resolve(packArg);
const plan = JSON.parse(readFileSync(path.resolve(planArg), 'utf8'));
const outRel = 'relleno';
const outDir = path.join(root, 'public', 'sprites', outRel);
const MASK_CELL = 4;

const manifests = new Map();
const manifest = (dir) => {
  if (!manifests.has(dir)) manifests.set(dir, JSON.parse(readFileSync(path.join(packDir, dir, 'manifest.json'), 'utf8')));
  return manifests.get(dir);
};
const readPng = (file) => PNG.sync.read(readFileSync(file));

function parseNombre(nombre) {
  const out = {};
  for (const part of nombre.split(',')) {
    const t = part.trim();
    if (!t.includes('=')) {
      out[t] = true;
      continue;
    }
    const [k, v] = t.split('=');
    out[k.trim()] = v.trim();
  }
  return out;
}

/** Plan variants come as `orientacion-izq`, `quien-senor-cafecito_orientacion-der`, `pieza=telescopio, uso=libre`, `bot=forge dir=se`. */
function parsePlanVariant(s) {
  const out = {};
  for (const tok of s.split(/[,_ ]+/).filter(Boolean)) {
    const i = tok.indexOf('=') >= 0 ? tok.indexOf('=') : tok.indexOf('-');
    if (i < 0) continue;
    out[tok.slice(0, i)] = tok.slice(i + 1);
  }
  return out;
}

const matches = (v, want) => Object.entries(want).every(([k, val]) => parseNombre(v.nombre)[k] === val);

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

function newMask(w, h) {
  const cw = Math.ceil(w / MASK_CELL);
  const ch = Math.ceil(h / MASK_CELL);
  return { w: cw, h: ch, cell: MASK_CELL, bits: new Uint8Array(Math.ceil((cw * ch) / 8)) };
}

/** OR the opaque pixels of a png region (sx, sy, w, h) into a mask, `scale` mask px per png px. */
function orMask(m, png, sx, sy, w, h, scale = 1) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (png.data[((sy + y) * png.width + sx + x) * 4 + 3] <= 64) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = Math.floor((y * scale + dy) / MASK_CELL) * m.w + Math.floor((x * scale + dx) / MASK_CELL);
          m.bits[i >> 3] |= 1 << (i & 7);
        }
      }
    }
  }
}

const packMask = (m) => ({ w: m.w, h: m.h, cell: m.cell, bits: Buffer.from(m.bits).toString('base64') });

function over(dst, src) {
  for (let i = 0; i < dst.data.length; i += 4) {
    const a = src.data[i + 3] / 255;
    if (a === 0) continue;
    const da = dst.data[i + 3] / 255;
    const oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) {
      dst.data[i + c] = Math.round((src.data[i + c] * a + dst.data[i + c] * da * (1 - a)) / oa);
    }
    dst.data[i + 3] = Math.round(oa * 255);
  }
}

const assets = {};
const anims = {};
const masks = {};

async function copyPair(dir, files) {
  await mkdir(path.join(outDir, dir), { recursive: true });
  for (const f of files) await copyFile(path.join(packDir, dir, f), path.join(outDir, dir, f));
}

/** Registers a vector prop (cerca + lejos) under `fill/<asset>/<slug>/{cerca,lejos}`; returns the base key. */
async function vectorProp(dir, want, slug, layers) {
  const m = manifest(dir);
  const base = `fill/${dir}${slug ? `/${slug}` : ''}`;
  for (const vista of ['cerca', 'lejos']) {
    const key = `${base}/${vista}`;
    if (assets[key]) continue;
    const v = m.variantes.find((x) => matches(x, { ...want, vista }));
    if (!v) throw new Error(`${dir}: no variant ${JSON.stringify({ ...want, vista })}`);
    let f1 = v.archivos.png1x;
    let f2 = v.archivos.png2x;
    let png1 = readPng(path.join(packDir, dir, f1));
    if (layers && vista === 'cerca') {
      const extra = layers.map((l) => m.variantes.find((x) => matches(x, { ...want, capa: l, vista })));
      if (extra.some((x) => !x)) throw new Error(`${dir}: missing layer in ${layers.join(',')}`);
      const name = (scale) => `${dir}__capas-${[want.capa, ...layers].join('+')}_vista-${vista}@${scale}x.png`;
      await mkdir(path.join(outDir, dir), { recursive: true });
      for (const [scale, k] of [[1, 'png1x'], [2, 'png2x']]) {
        const out = readPng(path.join(packDir, dir, v.archivos[k]));
        for (const x of extra) over(out, readPng(path.join(packDir, dir, x.archivos[k])));
        await writeFile(path.join(outDir, dir, name(scale)), PNG.sync.write(out));
        if (scale === 1) png1 = out;
      }
      f1 = name(1);
      f2 = name(2);
    } else {
      await copyPair(dir, [f1, f2]);
    }
    if (png1.width !== v.tamano.w || png1.height !== v.tamano.h) throw new Error(`${key}: size mismatch`);
    const vfs = v.vertice_frontal_suelo ?? { x: v.ancla.x, y: v.ancla.y + (v.offset_y ?? 0) };
    assets[key] = {
      w: v.tamano.w,
      h: v.tamano.h,
      vfs: { x: vfs.x, y: vfs.y },
      bbox: opaqueBBox(png1),
      f1: `${outRel}/${dir}/${f1}`,
      f2: `${outRel}/${dir}/${f2}`,
    };
    if (vista === 'cerca') {
      const mk = newMask(png1.width, png1.height);
      orMask(mk, png1, 0, 0, png1.width, png1.height);
      masks[base] = packMask(mk);
    }
  }
  return base;
}

/** Registers a pixel strip animation drawn from its @2x file at 1:1 world px; mask is in world px. */
async function pixelAnim(key, dir, a) {
  if (anims[key]) return key;
  await copyPair(dir, [a.f1, a.f2]);
  const png2 = readPng(path.join(packDir, dir, a.f2));
  const cw = a.cell.w * 2;
  const ch = a.cell.h * 2;
  if (png2.height !== ch || png2.width < cw * (Math.max(...a.frames) + 1)) throw new Error(`${key}: strip size`);
  const mk = newMask(cw, ch);
  for (const f of new Set(a.frames)) orMask(mk, png2, f * cw, 0, cw, ch);
  anims[key] = {
    f1: `${outRel}/${dir}/${a.f1}`,
    f2: `${outRel}/${dir}/${a.f2}`,
    cell: a.cell,
    anchor: a.anchor,
    frames: a.frames,
    fps: a.fps,
  };
  masks[key] = packMask(mk);
  return key;
}

/**
 * The golf ball overlay is a green-sized strip (12 × 512×360) that is almost all transparent, too
 * wide for phone GPUs. Crop every frame to the union of the ball's opaque boxes and keep the offset.
 */
async function ballStrip(key, dir, v) {
  const png1 = readPng(path.join(packDir, dir, v.archivos.png1x));
  const png2 = readPng(path.join(packDir, dir, v.archivos.png2x));
  const n = v.frames.length;
  const fw = v.celda.w;
  let x0 = fw;
  let y0 = v.celda.h;
  let x1 = 0;
  let y1 = 0;
  for (let f = 0; f < n; f++) {
    for (let y = 0; y < v.celda.h; y++) {
      for (let x = 0; x < fw; x++) {
        if (png1.data[(y * png1.width + f * fw + x) * 4 + 3] > 8) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
      }
    }
  }
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(fw, x1 + 1);
  y1 = Math.min(v.celda.h, y1 + 1);
  const cw = x1 - x0;
  const ch = y1 - y0;
  await mkdir(path.join(outDir, dir), { recursive: true });
  const names = [];
  for (const [scale, src] of [[1, png1], [2, png2]]) {
    const out = new PNG({ width: cw * scale * n, height: ch * scale });
    for (let f = 0; f < n; f++) {
      for (let y = 0; y < ch * scale; y++) {
        for (let x = 0; x < cw * scale; x++) {
          const si = ((y0 * scale + y) * src.width + f * fw * scale + x0 * scale + x) * 4;
          const di = (y * out.width + f * cw * scale + x) * 4;
          for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c];
        }
      }
    }
    const name = `golf-bola__anim-putt_recorte@${scale}x.png`;
    await writeFile(path.join(outDir, dir, name), PNG.sync.write(out));
    names.push(name);
  }
  anims[key] = {
    f1: `${outRel}/${dir}/${names[0]}`,
    f2: `${outRel}/${dir}/${names[1]}`,
    cell: { w: cw, h: ch },
    /** Frame point that sits on the green's front vertex (same S as the green). */
    vfs: { x: v.ancla.x - x0, y: v.ancla.y - y0 },
    frames: v.frames,
    fps: v.fps,
    scale: 1,
  };
  return key;
}

await rm(outDir, { recursive: true, force: true });

const placements = [];
const cellsOf = (it) => it.celdas.map(([x, y]) => [x, y]);

for (const it of plan.items) {
  const want = parsePlanVariant(it.variante);
  delete want.vista;
  const front = it.casilla_frontal;
  const fp = { x: Math.min(...it.celdas.map((c) => c[0])), y: Math.min(...it.celdas.map((c) => c[1])), w: it.huella[0], h: it.huella[1] };
  if (it.asset === 'npc') {
    const [npc, anim] = it.variante.split(' ');
    placements.push({ id: it.id, kind: 'npc', npc, anim, cell: front });
    continue;
  }
  if (it.asset === 'bots') {
    const bot = want.bot;
    const dir = want.dir;
    const v = manifest('bots').variantes.find((x) => matches(x, { bot, dir }));
    const f = (s) => `bot-${bot}__trabajar_${dir}@${s}x.png`;
    const key = await pixelAnim(`anim/bots/${bot}-${dir}`, 'bots', {
      f1: f(1),
      f2: f(2),
      cell: v.celda,
      anchor: v.ancla,
      frames: v.frames,
      fps: v.fps,
    });
    placements.push({ id: it.id, kind: 'actor', anim: key, cell: front });
    continue;
  }
  if (it.asset === 'golf' && want.pieza === 'golfista') {
    const v = manifest('golf').variantes.find((x) => matches(x, { pieza: 'golfista' }));
    const key = await pixelAnim('anim/golf/golfista-sw', 'golf', {
      f1: v.archivos.png1x,
      f2: v.archivos.png2x,
      cell: v.celda,
      anchor: v.ancla,
      frames: v.secuencia_12 ?? v.frames,
      fps: v.fps,
    });
    placements.push({ id: it.id, kind: 'actor', anim: key, cell: front, group: 'golf' });
    continue;
  }

  let base;
  let slug = Object.values(want).join('-');
  let layers;
  const flat = { cancha: true, mirador: true, 'golf-green': true, 'golf-tapete': true };
  if (it.asset === 'mural-logo') {
    want.capa = 'base';
    layers = ['wireframe-mentoria'];
    slug = 'base-wireframe';
  }
  if (it.asset === 'mirador' && want.pieza === 'telescopio') slug = `telescopio-${want.uso}`;
  if (it.asset === 'mirador' && want.pieza === 'deck') slug = 'deck';
  if (it.asset === 'golf') slug = want.pieza;
  base = await vectorProp(it.asset, want, slug, layers);

  const p = { id: it.id, kind: 'prop', sprite: base, footprint: fp, front, cells: cellsOf(it) };
  if (flat[it.id] || it.id === 'golf-green' || it.id === 'golf-tapete') {
    p.flat = true;
    p.solid = [];
  }
  if (it.id === 'cancha') p.solid = [[49, 24], [49, 28]];
  if (it.id === 'golf-green') {
    p.solid = [[49, 48], [51, 49]];
    const bola = manifest('golf').variantes.find((x) => matches(x, { pieza: 'bola' }));
    p.overlay = await ballStrip('anim/golf/bola', 'golf', bola);
  }
  if (it.id === 'mirador' || it.id.startsWith('telescopio') || it.id.startsWith('cola-mirador')) p.group = 'mirador';
  if (it.id.startsWith('golf')) p.group = 'golf';
  if (it.id === 'cachapas') p.group = 'cachapas';
  if (it.id === 'perrera') p.group = 'perrera';
  if (it.id === 'cafe') p.doorFront = [21, 17];
  if (it.id === 'disqueria') p.doorFront = [24, 20];
  placements.push(p);
}

for (const pl of placements) if (pl.id.startsWith('cola-mirador')) pl.group = 'mirador';

/** The cachapas queue: three NPCs in idle_ne, not already standing elsewhere on the map. */
const QUEUE_NPCS = ['chamo-audifonos', 'mujer-rizos', 'abuelo-baston'];
plan.cola_cachapas.forEach((c, i) =>
  placements.push({ id: `cola-cachapas-${i + 1}`, kind: 'npc', npc: QUEUE_NPCS[i], anim: 'idle_ne', cell: c, group: 'cachapas' }),
);
plan.faroles.forEach((c, i) => placements.push({ id: `farol-${i + 1}`, kind: 'lamp', cell: c }));
if (plan.sendero_aprobado) placements.push({ id: 'sendero-perrera', kind: 'path', cells: plan.sendero_nuevo_propuesto, group: 'perrera' });

await writeFile(
  path.join(root, 'src', 'data', 'relleno.json'),
  JSON.stringify({ assets, anims, masks, placements, replaced: plan.filler_props_reemplazados }, null, 1) + '\n',
);
console.log(
  `relleno: ${Object.keys(assets).length} prop frames, ${Object.keys(anims).length} animations, ${placements.length} placements`,
);
