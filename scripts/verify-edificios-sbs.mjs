#!/usr/bin/env node
/** Capture 12 UI screens at Pixel viewports and write BUILD|REF side-by-sides. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'verify-edificios-sbs');
const PIXEL = path.join(ROOT, 'portfolio');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

function writeSbs(buildPath, refPath, outPath, label) {
  const a = readPng(buildPath);
  const b = readPng(refPath);
  if (a.width !== b.width || a.height !== b.height) {
    console.log(`${label}: size mismatch build ${a.width}×${a.height} vs ref ${b.width}×${b.height}`);
  }
  const w = a.width + b.width + 8;
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = 20,
        g = 21,
        bl = 24,
        al = 255;
      if (x < a.width && y < a.height) {
        const j = (y * a.width + x) * 4;
        r = a.data[j];
        g = a.data[j + 1];
        bl = a.data[j + 2];
        al = a.data[j + 3];
      } else if (x >= a.width + 8 && x - a.width - 8 < b.width && y < b.height) {
        const bx = x - a.width - 8;
        const j = (y * b.width + bx) * 4;
        r = b.data[j];
        g = b.data[j + 1];
        bl = b.data[j + 2];
        al = b.data[j + 3];
      }
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = bl;
      out.data[i + 3] = al;
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, PNG.sync.write(out));
  let diff = 0;
  const n = Math.min(a.width, b.width) * Math.min(a.height, b.height);
  for (let y = 0; y < Math.min(a.height, b.height); y++) {
    for (let x = 0; x < Math.min(a.width, b.width); x++) {
      const j = (y * a.width + x) * 4;
      const k = (y * b.width + x) * 4;
      if (
        Math.abs(a.data[j] - b.data[k]) > 8 ||
        Math.abs(a.data[j + 1] - b.data[k + 1]) > 8 ||
        Math.abs(a.data[j + 2] - b.data[k + 2]) > 8
      ) {
        diff++;
      }
    }
  }
  const pct = n ? ((diff / n) * 100).toFixed(2) : '100';
  console.log(`${label}: ${pct}% pixel diff (comparable region)`);
}

async function captureFlow(page, building, steps) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  await page.evaluate((name) => {
    window.__playtestQa.setZoom(0.5);
    window.__playtestQa.frameDoorForQa(name);
  }, building);
  await wait(400);
  await page.screenshot({ path: steps.map });
  await page.evaluate((name) => window.__playtestQa.enterInterior(name), building);
  await wait(800);
  await page.screenshot({ path: steps.list });
  if (steps.expand) await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
  await page.evaluate(() => document.querySelector('.experience__row')?.click());
  await wait(500);
  await page.screenshot({ path: steps.detail });
}

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(800);

const browser = await launchBrowser(chromium);
try {
  const flows = [
    {
      tag: 'talks-desktop',
      building: 'teresa',
      viewport: { width: 1440, height: 900 },
      refs: ['desktop-1-map.png', 'desktop-2-list.png', 'desktop-3-player.png'],
      dir: 'talks-ui',
    },
    {
      tag: 'talks-phone',
      building: 'teresa',
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      refs: ['phone-1-map.png', 'phone-2-list.png', 'phone-3-player.png'],
      dir: 'talks-ui',
    },
    {
      tag: 'writings-desktop',
      building: 'biblioteca',
      viewport: { width: 1440, height: 900 },
      refs: ['desktop-1-map.png', 'desktop-2-list.png', 'desktop-3-reader.png'],
      dir: 'writings-ui',
    },
    {
      tag: 'writings-phone',
      building: 'biblioteca',
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      refs: ['phone-1-map.png', 'phone-2-list.png', 'phone-3-reader.png'],
      dir: 'writings-ui',
    },
  ];
  for (const f of flows) {
    const ctx = await browser.newContext({
      viewport: f.viewport,
      deviceScaleFactor: f.deviceScaleFactor ?? 1,
    });
    const page = await ctx.newPage();
    const base = path.join(OUT, f.tag);
    await captureFlow(page, f.building, {
      map: path.join(base, 'build-map.png'),
      list: path.join(base, 'build-list.png'),
      detail: path.join(base, 'build-detail.png'),
      expand: f.viewport.width < 768,
    });
    for (const [i, name] of ['map', 'list', 'detail'].entries()) {
      const build = path.join(base, `build-${name}.png`);
      const ref = path.join(PIXEL, f.dir, f.refs[i]);
      writeSbs(build, ref, path.join(OUT, 'sbs', `${f.tag}-${i + 1}-${name}.png`), `${f.tag} ${name}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  preview.kill();
}
console.log(`Side-by-sides written under ${OUT}/sbs/`);
