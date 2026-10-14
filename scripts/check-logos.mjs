#!/usr/bin/env node
/**
 * Sanity checks for the "Worked with" strip (src/data/worked-with.json -> public/logos/):
 * every entry has a name and an existing file; PNGs are real PNGs with an alpha channel (the strip
 * tints logos to one flat colour, so an opaque background would become a solid block); SVGs have an
 * <svg> root and no scripts; aspect ratio looks like a logo (0.5-12 wide per tall); no duplicates;
 * files in public/logos/ that no entry uses are reported.
 * Files must keep their original colours: the strip grays them in CSS and reveals the colours on
 * hover, so an all-gray file fails unless its entry says `"mono": true` (a black-and-white brand).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/logos');
const list = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/worked-with.json'), 'utf8'));
const errors = [];
const notes = [];

function pngInfo(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let off = 8;
  const info = { w: 0, h: 0, colorType: -1, trns: false, idat: [], depth: 8, plte: null };
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      info.w = data.readUInt32BE(0);
      info.h = data.readUInt32BE(4);
      info.depth = data[8];
      info.colorType = data[9];
    } else if (type === 'tRNS') info.trns = true;
    else if (type === 'PLTE') info.plte = Buffer.from(data);
    else if (type === 'IDAT') info.idat.push(data);
    off += 12 + len;
  }
  return info;
}

const chroma = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b);

/** Palette PNGs: does any palette entry have colour? */
function paletteHasColour(info) {
  if (!info.plte) return null;
  for (let i = 0; i + 2 < info.plte.length; i += 3) if (chroma(info.plte[i], info.plte[i + 1], info.plte[i + 2]) > 24) return true;
  return false;
}

/**
 * 8-bit RGBA / gray+alpha PNGs (non-interlaced): share of transparent pixels, and whether any visible
 * pixel has colour.
 */
function scanPixels(info) {
  if (info.depth !== 8 || (info.colorType !== 6 && info.colorType !== 4)) return null;
  const bpp = info.colorType === 6 ? 4 : 2;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(info.idat));
  } catch {
    return null;
  }
  const stride = info.w * bpp;
  const out = Buffer.alloc(stride);
  let prev = Buffer.alloc(stride);
  let clear = 0;
  let coloured = false;
  for (let y = 0; y < info.h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      out[i] = (line[i] + pred) & 255;
    }
    for (let x = bpp - 1; x < stride; x += bpp) {
      if (out[x] < 16) clear++;
      else if (bpp === 4 && out[x] > 128 && chroma(out[x - 3], out[x - 2], out[x - 1]) > 24) coloured = true;
    }
    prev = Buffer.from(out);
  }
  return { share: clear / (info.w * info.h), coloured };
}

const grayOnly = (tag, file) =>
  `${tag}: ${file} has no colour (pre-tinted?). Use the original-colour file, or mark the entry "mono": true if the brand is black and white`;

const seen = new Set();
for (const [i, e] of list.entries()) {
  const tag = `entry ${i} (${e?.name ?? '?'})`;
  if (!e?.name || typeof e.name !== 'string') errors.push(`${tag}: missing company name (used as alt text)`);
  if (!e?.file || typeof e.file !== 'string') {
    errors.push(`${tag}: missing file`);
    continue;
  }
  if (seen.has(e.file)) errors.push(`${tag}: ${e.file} listed twice`);
  seen.add(e.file);
  const fp = path.join(DIR, e.file);
  if (!fs.existsSync(fp)) {
    errors.push(`${tag}: public/logos/${e.file} does not exist`);
    continue;
  }
  const buf = fs.readFileSync(fp);
  const ext = path.extname(e.file).toLowerCase();
  let w = 0;
  let h = 0;
  if (ext === '.png') {
    const info = pngInfo(buf);
    if (!info) {
      errors.push(`${tag}: ${e.file} is not a PNG`);
      continue;
    }
    ({ w, h } = info);
    const alpha = info.colorType === 4 || info.colorType === 6 || info.trns;
    if (!alpha) errors.push(`${tag}: ${e.file} has no transparency (an opaque background tints to a solid block)`);
    const px = scanPixels(info);
    const share = px?.share ?? null;
    if (share !== null && share < 0.15) errors.push(`${tag}: ${e.file} is only ${(share * 100).toFixed(0)}% transparent (background not removed?)`);
    const coloured = px ? px.coloured : info.colorType === 3 ? paletteHasColour(info) : info.colorType === 2;
    if (coloured === false && !e.mono) errors.push(grayOnly(tag, e.file));
    if (Math.min(w, h) < 16) errors.push(`${tag}: ${e.file} is tiny (${w}×${h})`);
    notes.push(`${e.file}: PNG ${w}×${h}${share !== null ? `, ${(share * 100).toFixed(0)}% transparent` : ''}`);
  } else if (ext === '.svg') {
    const text = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(text)) {
      errors.push(`${tag}: ${e.file} has no <svg> root`);
      continue;
    }
    if (/<script|on\w+\s*=|javascript:/i.test(text)) errors.push(`${tag}: ${e.file} contains script`);
    const colours = [...text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)].map((m) => {
      if (m[2]) return [+m[2], +m[3], +m[4]];
      const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
      return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16));
    });
    if (!colours.some(([r, g, b]) => chroma(r, g, b) > 24) && !e.mono) errors.push(grayOnly(tag, e.file));
    const vb = text.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    const ww = text.match(/<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i);
    const hh = text.match(/<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i);
    w = vb ? +vb[1] : ww ? +ww[1] : 0;
    h = vb ? +vb[2] : hh ? +hh[1] : 0;
    if (!w || !h) errors.push(`${tag}: ${e.file} has no viewBox or width/height (cannot size it)`);
    notes.push(`${e.file}: SVG ${w}×${h}`);
  } else {
    errors.push(`${tag}: ${e.file} is not .png or .svg`);
    continue;
  }
  if (w && h && (w / h < 0.5 || w / h > 12)) errors.push(`${tag}: ${e.file} is ${w}×${h}; that aspect does not look like a logo`);
}
if (fs.existsSync(DIR)) {
  for (const f of fs.readdirSync(DIR)) if (!seen.has(f)) notes.push(`public/logos/${f} is not listed in worked-with.json`);
}

for (const n of notes) console.log(`note: ${n}`);
for (const e of errors) console.error(`FAIL ${e}`);
console.log(`check-logos: ${list.length} logo(s), ${errors.length} problem(s)`);
process.exit(errors.length ? 1 : 0);
