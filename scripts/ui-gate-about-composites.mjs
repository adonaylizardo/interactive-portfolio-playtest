#!/usr/bin/env node
/**
 * Side-by-side composites: build (left) | ref (right) for 15 about-ui gate states.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import path from 'node:path';

const BASE =
  process.env.PREVIEW_URL ??
  process.env.DEPLOY_URL ??
  'http://127.0.0.1:4173/interactive-portfolio-playtest/preview-edificios/';
const REF_DIR = path.join(process.cwd(), 'docs/ref/about-ui');
const OUT = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/ui-gate-composites';

const STATES = [
  { key: 'telefono-vertical_buscar-vacio', w: 390, h: 844, touch: true, mode: 'search-empty' },
  { key: 'telefono-vertical_buscar-sin-resultados', w: 390, h: 844, touch: true, mode: 'search-none' },
  { key: 'telefono-vertical_buscar-resultados', w: 390, h: 844, touch: true, mode: 'search-hits' },
  { key: 'telefono-vertical_about', w: 390, h: 844, touch: true, mode: 'about' },
  { key: 'telefono-vertical_contacto', w: 390, h: 844, touch: true, mode: 'contact' },
  { key: 'telefono-horizontal_buscar-vacio', w: 844, h: 390, touch: true, mode: 'search-empty' },
  { key: 'telefono-horizontal_buscar-sin-resultados', w: 844, h: 390, touch: true, mode: 'search-none' },
  { key: 'telefono-horizontal_buscar-resultados', w: 844, h: 390, touch: true, mode: 'search-hits' },
  { key: 'telefono-horizontal_about', w: 844, h: 390, touch: true, mode: 'about' },
  { key: 'telefono-horizontal_contacto', w: 844, h: 390, touch: true, mode: 'contact' },
  { key: 'desktop_buscar-vacio', w: 1280, h: 800, touch: false, mode: 'search-empty' },
  { key: 'desktop_buscar-sin-resultados', w: 1280, h: 800, touch: false, mode: 'search-none' },
  { key: 'desktop_buscar-resultados', w: 1280, h: 800, touch: false, mode: 'search-hits' },
  { key: 'desktop_about', w: 1280, h: 800, touch: false, mode: 'about' },
  { key: 'desktop_contacto', w: 1280, h: 800, touch: false, mode: 'contact' },
];

function scaleDown2x(src, targetW, targetH) {
  const out = new PNG({ width: targetW, height: targetH });
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = Math.min(src.width - 1, x * 2);
      const sy = Math.min(src.height - 1, y * 2);
      const si = (src.width * sy + sx) * 4;
      const di = (targetW * y + x) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function fitRefToViewport(ref, w, h) {
  if (ref.width === w * 2 && ref.height === h * 2) return scaleDown2x(ref, w, h);
  const scale = Math.min(w / ref.width, h / ref.height);
  const tw = Math.round(ref.width * scale);
  const th = Math.round(ref.height * scale);
  const out = new PNG({ width: w, height: h });
  out.data.fill(11);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(ref.width - 1, Math.floor((x / tw) * ref.width));
      const sy = Math.min(ref.height - 1, Math.floor((y / th) * ref.height));
      const si = (ref.width * sy + sx) * 4;
      const di = (w * y + x) * 4;
      out.data[di] = ref.data[si];
      out.data[di + 1] = ref.data[si + 1];
      out.data[di + 2] = ref.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function compositeSideBySide(build, refFit, w, h) {
  const out = new PNG({ width: w * 2 + 2, height: h + 24 });
  out.data.fill(11);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bi = (build.width * y + x) * 4;
      const oi = (out.width * (y + 12) + x) * 4;
      out.data[oi] = build.data[bi];
      out.data[oi + 1] = build.data[bi + 1];
      out.data[oi + 2] = build.data[bi + 2];
      out.data[oi + 3] = 255;
      const ri = (refFit.width * y + x) * 4;
      const oi2 = (out.width * (y + 12) + w + 2 + x) * 4;
      out.data[oi2] = refFit.data[ri];
      out.data[oi2 + 1] = refFit.data[ri + 1];
      out.data[oi2 + 2] = refFit.data[ri + 2];
      out.data[oi2 + 3] = 255;
    }
  }
  return out;
}

async function tapCenter(page, sel, touch) {
  const pt = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 2) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!pt) return false;
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  return true;
}

async function setupState(page, state) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    document.querySelector('.chrome__lang-opt[data-lang="en"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
  });
  await page.waitForTimeout(250);
  if (state.touch) {
    await page.evaluate(() =>
      document.querySelector('[data-action="intro-close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await page.waitForTimeout(400);
  }
  const dockSearch = '.chrome__tools-phone [data-action="search"]';
  const railSearch = '.chrome__rail [data-action="search"]';
  const dockHome = '.chrome__dock [data-dock="intro"]';
  const railHome = '.chrome__rail [data-action="home"]';
  const dockContact = '.chrome__dock [data-action="contact"]';
  const railContact = '.chrome__rail [data-action="contact"]';

  const openSearch = async (query) => {
    await tapCenter(page, state.touch ? dockSearch : railSearch, state.touch);
    await page.waitForSelector('.search-palette--open', { timeout: 15000 });
    await page.waitForTimeout(300);
    await page.evaluate((q) => {
      const input = document.querySelector('.search-palette__input');
      if (!(input instanceof HTMLInputElement)) return;
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    }, query);
    await page.waitForTimeout(400);
  };

  if (state.mode === 'search-empty') {
    await openSearch('');
    return;
  }
  if (state.mode === 'search-none') {
    await openSearch('zzzznotfound');
    return;
  }
  if (state.mode === 'search-hits') {
    await openSearch('case');
    return;
  }
  if (state.mode === 'about') {
    await tapCenter(page, state.touch ? dockHome : railHome, state.touch);
    await page.waitForTimeout(600);
    return;
  }
  if (state.mode === 'contact') {
    await tapCenter(page, state.touch ? dockContact : railContact, state.touch);
    await page.waitForTimeout(700);
  }
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const report = { base: BASE, states: [] };

for (const state of STATES) {
  const ctx = await browser.newContext({
    viewport: { width: state.w, height: state.h },
    hasTouch: state.touch,
    isMobile: state.w < 900,
  });
  const page = await ctx.newPage();
  await setupState(page, state);
  const buildBuf = await page.screenshot({ type: 'png' });
  await ctx.close();

  const build = PNG.sync.read(buildBuf);
  const refPath = path.join(REF_DIR, `${state.key}@2x.png`);
  const refRaw = PNG.sync.read(readFileSync(refPath));
  const refFit = fitRefToViewport(refRaw, state.w, state.h);
  const combo = compositeSideBySide(build, refFit, state.w, state.h);
  const outPath = path.join(OUT, `${state.key}-build-ref.png`);
  writeFileSync(outPath, PNG.sync.write(combo));
  report.states.push({ key: state.key, out: outPath, w: state.w, h: state.h });
}

await browser.close();
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
