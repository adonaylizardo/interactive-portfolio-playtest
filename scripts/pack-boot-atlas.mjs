#!/usr/bin/env node
/**
 * Pack outdoor cerca @1x sprites and the player walk/idle strips into boot atlases.
 *   node scripts/pack-boot-atlas.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/sprites/atlas');
const MAX = 4096;
const PAD = 2;

const sprites = JSON.parse(readFileSync(path.join(ROOT, 'src/data/sprites.json'), 'utf8'));
const relleno = JSON.parse(readFileSync(path.join(ROOT, 'src/data/relleno.json'), 'utf8'));
const jugador = JSON.parse(readFileSync(path.join(ROOT, 'src/data/jugador.json'), 'utf8'));
const assets = { ...sprites.assets, ...relleno.assets };

function readPng(rel) {
  return PNG.sync.read(readFileSync(path.join(ROOT, 'public/sprites', rel)));
}

function pack(items) {
  items = [...items].sort((a, b) => b.png.height - a.png.height || b.png.width - a.png.width);
  const pages = [];
  const place = (page, item) => {
    const w = item.png.width + PAD;
    const h = item.png.height + PAD;
    if (page.x + w > MAX) {
      page.x = 0;
      page.y += page.rowH;
      page.rowH = 0;
    }
    if (page.y + h > MAX) return false;
    item.x = page.x;
    item.y = page.y;
    item.page = pages.length;
    page.x += w;
    page.rowH = Math.max(page.rowH, h);
    page.usedW = Math.max(page.usedW, item.x + item.png.width);
    page.usedH = Math.max(page.usedH, item.y + item.png.height);
    page.items.push(item);
    return true;
  };
  for (const item of items) {
    if (item.png.width > MAX || item.png.height > MAX) throw new Error(`${item.key} too big`);
    let ok = false;
    for (const page of pages) {
      if (place(page, item)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      const page = { x: 0, y: 0, rowH: 0, usedW: 0, usedH: 0, items: [] };
      if (!place(page, item)) throw new Error(`cannot place ${item.key}`);
      pages.push(page);
    }
  }
  return pages;
}

function writePage(page, basename) {
  const img = new PNG({ width: page.usedW, height: page.usedH, colorType: 6 });
  img.data.fill(0);
  const frames = {};
  for (const it of page.items) {
    const src = it.png;
    for (let y = 0; y < src.height; y++) {
      const srcOff = y * src.width * 4;
      const dstOff = ((it.y + y) * img.width + it.x) * 4;
      src.data.copy(img.data, dstOff, srcOff, srcOff + src.width * 4);
    }
    frames[it.key] = { x: it.x, y: it.y, w: src.width, h: src.height };
  }
  const pngPath = path.join(OUT, `${basename}.png`);
  const webpPath = path.join(OUT, `${basename}.webp`);
  writeFileSync(pngPath, PNG.sync.write(img));
  execFileSync('convert', [pngPath, '-quality', '80', '-define', 'webp:method=4', webpPath]);
  writeFileSync(
    path.join(OUT, `${basename}.json`),
    JSON.stringify({ image: `${basename}.webp`, png: `${basename}.png`, frames }, null, 0),
  );
  return { basename, n: page.items.length, w: page.usedW, h: page.usedH };
}

mkdirSync(OUT, { recursive: true });

const mapItems = [];
for (const [key, a] of Object.entries(assets)) {
  if (key.startsWith('int/') || key.includes('/hover/') || key.includes('/resaltado/') || key.endsWith('/lejos')) continue;
  mapItems.push({ key, png: readPng(a.f1) });
}
const mapPages = pack(mapItems);
const mapOut = mapPages.map((p, i) => writePage(p, mapPages.length === 1 ? 'boot-1x' : `boot-1x-${i}`));

const WALK = /^(idle|walk|trot)_/;
const playerItems = [];
for (const who of ['adonay', 'pantone']) {
  for (const [name, anim] of Object.entries(jugador[who].animaciones)) {
    if (!WALK.test(name)) continue;
    playerItems.push({ key: `${who}/${name}`, png: readPng(`personaje/${who}/${anim.archivo1x}`) });
  }
}
const playerPages = pack(playerItems);
const playerOut = playerPages.map((p, i) => writePage(p, playerPages.length === 1 ? 'player-1x' : `player-1x-${i}`));

writeFileSync(
  path.join(OUT, 'manifest.json'),
  JSON.stringify({ map: mapOut.map((o) => o.basename), player: playerOut.map((o) => o.basename) }),
);
console.log('boot atlas', mapOut);
console.log('player atlas', playerOut);
