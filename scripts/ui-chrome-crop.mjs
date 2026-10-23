/** Shared PNG crop / stack / diff helpers for controls + cam-switch UI gates. */
import fs from 'node:fs';
import { PNG } from 'pngjs';

export function cropPng(srcPath, clip) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const x0 = Math.max(0, Math.floor(clip.x));
  const y0 = Math.max(0, Math.floor(clip.y));
  const w = Math.min(src.width - x0, Math.ceil(clip.width));
  const h = Math.min(src.height - y0, Math.ceil(clip.height));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

export function stackCrops(pngs, gap = 14) {
  const w = Math.max(...pngs.map((p) => p.width));
  const h = pngs.reduce((acc, p, i) => acc + p.height + (i ? gap : 0), 0);
  const out = new PNG({ width: w, height: h });
  out.data.fill(20);
  let oy = 0;
  for (const src of pngs) {
    const ox = Math.floor((w - src.width) / 2);
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = ((oy + y) * w + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
    oy += src.height + gap;
  }
  return out;
}

export function sideBySidePng(oursPng, refPath, destPath) {
  if (!fs.existsSync(refPath)) {
    fs.writeFileSync(destPath, PNG.sync.write(oursPng));
    return { refMissing: true, diffPct: null };
  }
  const ref = PNG.sync.read(fs.readFileSync(refPath));
  const scale = (img, height) => {
    if (img.height === height) return img;
    const w = Math.max(1, Math.round((img.width * height) / img.height));
    const out = new PNG({ width: w, height });
    for (let y = 0; y < height; y++) {
      const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
      for (let x = 0; x < w; x++) {
        const sx = Math.min(img.width - 1, Math.floor((x * img.width) / w));
        const si = (sy * img.width + sx) * 4;
        const di = (y * w + x) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    return out;
  };
  const h = Math.max(oursPng.height, ref.height);
  const a = scale(ref, h);
  const b = scale(oursPng, h);
  let diffPx = 0;
  const total = a.width * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < a.width; x++) {
      const ai = (y * a.width + x) * 4;
      const bi = (y * b.width + Math.min(x, b.width - 1)) * 4;
      if (
        Math.abs(a.data[ai] - b.data[bi]) +
          Math.abs(a.data[ai + 1] - b.data[bi + 1]) +
          Math.abs(a.data[ai + 2] - b.data[bi + 2]) >
        48
      ) {
        diffPx += 1;
      }
    }
  }
  const gap = 12;
  const out = new PNG({ width: a.width + gap + b.width, height: h });
  out.data.fill(20);
  const blit = (src, ox) => {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * out.width + ox + x) * 4;
        out.data[di] = src.data[si];
        out.data[di + 1] = src.data[si + 1];
        out.data[di + 2] = src.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  blit(a, 0);
  blit(b, a.width + gap);
  fs.writeFileSync(destPath, PNG.sync.write(out));
  return { refMissing: false, diffPct: (100 * diffPx) / total };
}

export async function collectChromeBoxes(page, selectors) {
  return page.evaluate((sels) => {
    const pad = 6;
    const boxes = [];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el || el.hidden || el.hasAttribute('hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      boxes.push({
        sel,
        x: r.x - pad,
        y: r.y - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    }
    boxes.sort((a, b) => a.y - b.y || a.x - b.x);
    return boxes;
  }, selectors);
}

export function chromeStackFromShot(fullShotPath, boxes) {
  const crops = boxes.map((b) => cropPng(fullShotPath, b));
  return stackCrops(crops);
}

export function refChromeStack(refPath, vp, boxes) {
  if (!fs.existsSync(refPath)) return null;
  const refFull = PNG.sync.read(fs.readFileSync(refPath));
  const scaleClip = (c) => ({
    x: (c.x * refFull.width) / vp.width,
    y: (c.y * refFull.height) / vp.height,
    width: (c.width * refFull.width) / vp.width,
    height: (c.height * refFull.height) / vp.height,
  });
  return stackCrops(boxes.map((b) => cropPng(refPath, scaleClip(b))));
}

export function diffNotes(diffPct) {
  if (diffPct == null) return ['ref missing'];
  if (diffPct <= 4) return ['within tolerance'];
  const notes = [];
  if (diffPct > 4) notes.push('pixel delta above 4% — likely 3D viewport bleed in ref crop margins or checklist/chrome not in crop');
  if (diffPct > 15) notes.push('typography, icon glyph, or active-tab fill may differ');
  if (diffPct > 25) notes.push('layout offset (top/safe-area) or missing leader/anchor art in ref');
  return notes;
}
