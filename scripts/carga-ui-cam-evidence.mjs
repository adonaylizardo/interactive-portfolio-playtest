/**
 * Camera-switch loading UI vs docs/ref/carga-ui/*_3-cambio-camara@2x.png
 * Compares chrome-only crops (dim overlay + center pill + top cam tabs), not full frames.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'docs', 'ref', 'carga-ui');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona', 'carga-ui');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function cropPng(srcPath, clip) {
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

function sideBySide(oursPng, refPath, destPath) {
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

/** Separate crops: top cam tabs + center loading pill (excludes full-screen dim). */
async function chromeClips(page) {
  return page.evaluate(() => {
    const pad = 6;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hasAttribute('hidden')) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return {
        x: r.x - pad,
        y: r.y - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      };
    };
    const tabs = box('.persona-kit__cam');
    const pill = box('[data-cam-load]:not([hidden]) .persona-kit__cam-load-pill');
    if (!tabs || !pill) return null;
    return { tabs, pill };
  });
}

function stackCrops(pngA, pngB, gap = 16) {
  const w = Math.max(pngA.width, pngB.width);
  const h = pngA.height + gap + pngB.height;
  const out = new PNG({ width: w, height: h });
  out.data.fill(20);
  const blit = (src, oy) => {
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
  };
  blit(pngA, 0);
  blit(pngB, pngA.height + gap);
  return out;
}

const VIEWPORTS = [
  { tag: 'telefono-vertical', w: 390, h: 844, touch: true },
  { tag: 'telefono-horizontal', w: 844, h: 390, touch: true },
  { tag: 'desktop', w: 1280, h: 800, touch: false },
];

async function captureLoadingShot(page, cdp, touch, tag) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setLayout('map');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(400);
  const cen = page.locator('[data-cam="cenital"]');
  await cen.waitFor({ state: 'visible', timeout: 15000 });
  const tp = page.locator('[data-cam="persona"]');
  const tbox = await tp.boundingBox();
  if (touch && tbox) {
    const x = tbox.x + tbox.width / 2;
    const y = tbox.y + tbox.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await wait(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else if (tbox) {
    await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  }
  let sawLoad = false;
  for (let i = 0; i < 24; i++) {
    sawLoad = await page.evaluate(
      () => !document.querySelector('[data-cam-load]')?.hasAttribute('hidden'),
    );
    if (sawLoad) break;
    await wait(16);
  }
  const fullShot = path.join(OUT, `${tag}_3-cambio-camara_full.png`);
  await page.screenshot({ path: fullShot });
  const clips = await chromeClips(page);
  if (!clips) throw new Error(`${tag}: loading chrome bbox missing`);
  const vp = page.viewportSize();
  const tabsCrop = cropPng(fullShot, clips.tabs);
  const pillCrop = cropPng(fullShot, clips.pill);
  const cropped = stackCrops(tabsCrop, pillCrop);
  const shot = path.join(OUT, `${tag}_3-cambio-camara_chrome.png`);
  fs.writeFileSync(shot, PNG.sync.write(cropped));
  const ref = path.join(REF, `${tag}_3-cambio-camara@2x.png`);
  const refCropPath = path.join(OUT, `${tag}_3-cambio-camara_ref-chrome.png`);
  let cmpRef = ref;
  if (fs.existsSync(ref)) {
    const refFull = PNG.sync.read(fs.readFileSync(ref));
    const scaleClip = (c) => ({
      x: (c.x * refFull.width) / vp.width,
      y: (c.y * refFull.height) / vp.height,
      width: (c.width * refFull.width) / vp.width,
      height: (c.height * refFull.height) / vp.height,
    });
    const refStack = stackCrops(
      cropPng(ref, scaleClip(clips.tabs)),
      cropPng(ref, scaleClip(clips.pill)),
    );
    fs.writeFileSync(refCropPath, PNG.sync.write(refStack));
    cmpRef = refCropPath;
  }
  const cmp = path.join(OUT, `${tag}_3-cambio-camara-vs-ref_chrome.png`);
  const { diffPct, refMissing } = sideBySide(cropped, cmpRef, cmp);
  await page
    .waitForFunction(() => document.querySelector('[data-cam-load]')?.hasAttribute('hidden'), null, {
      timeout: 30000,
    })
    .catch(() => null);
  return {
    tag,
    sawLoad,
    diffPct,
    refMissing,
    clips,
    shot: path.basename(shot),
    compare: path.basename(cmp),
    fullFrame: path.basename(fullShot),
  };
}

async function main() {
  const browser = await launchBrowser(chromium);
  const rows = [];
  let bundle = '';
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, {
      timeout: 90000,
    });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;
    rows.push(await captureLoadingShot(page, cdp, vp.touch, vp.tag));
    await ctx.close();
  }
  await browser.close();
  const report = { base: BASE, bundle, compareMode: 'chrome-crop', rows };
  fs.writeFileSync(path.join(OUT, 'cam-switch-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
