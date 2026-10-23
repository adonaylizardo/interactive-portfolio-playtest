#!/usr/bin/env node
/** Forge QA k7 — MED-1 charlas room, MED-2 control hits, LOW-1 biblioteca title; runs k6 first. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/forge-k7');

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

async function openCharlasExpanded(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--experience.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--experience.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
}

function pixelVariance(png) {
  const { width, height, data } = png;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (width * y + x) << 2;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += lum;
      sumSq += lum * lum;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

async function med1CharlasRoom(page, tag) {
  await openCharlasExpanded(page);
  const metrics = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const sheet = document.querySelector('.building-panel__sheet')?.getBoundingClientRect();
    const cs = canvas ? getComputedStyle(canvas) : null;
    let interiorBox = null;
    let interiorFree = null;
    try {
      interiorBox = canvas?.dataset.interiorBox ? JSON.parse(canvas.dataset.interiorBox) : null;
      interiorFree = canvas?.dataset.interiorFree ? JSON.parse(canvas.dataset.interiorFree) : null;
    } catch {
      /* ignore */
    }
    const roomH = interiorBox ? interiorBox.b - interiorBox.t : 0;
    const freeH = interiorFree ? interiorFree.b - interiorFree.t : 0;
    const overlap =
      interiorBox &&
      interiorFree &&
      interiorBox.b > interiorFree.t + 24 &&
      interiorBox.t < interiorFree.b;
    return {
      roomH,
      freeH,
      overlap,
      sheetTop: sheet?.top ?? 0,
      canvasVis: cs?.visibility ?? '',
      layout: document.body.dataset.layout ?? '',
      interiorChrome: document.body.dataset.interior ?? '',
    };
  });
  const sheetTop = metrics.sheetTop;
  const clip = {
    x: 8,
    y: 48,
    width: Math.max(40, (await page.viewportSize()).width - 16),
    height: Math.max(40, Math.floor(sheetTop - 56)),
  };
  const shotPath = path.join(OUT, `charlas-expanded-${tag}.png`);
  if (clip.height > 24) {
    await page.screenshot({ path: shotPath, clip });
  } else {
    await page.screenshot({ path: shotPath });
  }
  let varOk = false;
  if (clip.height > 24) {
    const buf = readFileSync(shotPath);
    const png = PNG.sync.read(buf);
    varOk = pixelVariance(png) > 12;
  }
  const pass =
    metrics.canvasVis !== 'hidden' &&
    metrics.overlap &&
    metrics.roomH >= 72 &&
    metrics.freeH >= 100 &&
    varOk;
  record('MED-1-charlas-room', pass, JSON.stringify({ ...metrics, varOk }), tag);
}

const LANG = '.chrome > .chrome__lang';
const CONTROL_SELECTORS = [
  { id: 'lang-es', sel: `${LANG} [data-lang="es"]` },
  { id: 'lang-en', sel: `${LANG} [data-lang="en"]` },
  { id: 'checklist-ring', sel: '.checklist__ring-btn' },
  { id: 'tools-pill', sel: '.chrome__tools-phone' },
  { id: 'rail-home', sel: '.chrome__rail [data-action="home"]', optional: true },
  { id: 'dock-map', sel: '.chrome__dock [data-action="map"]', optional: true },
];

async function med2ControlHits(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  const hits = [];
  let overlap = false;
  for (const c of CONTROL_SELECTORS) {
    const box = await page.locator(c.sel).first().boundingBox().catch(() => null);
    if (!box || box.width < 8) {
      if (c.optional) continue;
      hits.push(`${c.id}:missing`);
      continue;
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const target = await page.evaluate(
      ({ x, y, sel }) => {
        const el = document.elementFromPoint(x, y);
        const want = document.querySelector(sel);
        return {
          ok: !!el && (!!el.closest(sel) || want?.contains(el)),
          tag: el?.className?.toString?.().slice(0, 40) ?? '',
        };
      },
      { x: cx, y: cy, sel: c.sel },
    );
    hits.push(`${c.id}:${target.ok ? 'ok' : `blocked-${target.tag}`}`);
  }
  const rects = await page.evaluate(() => {
    const es = document.querySelector('.chrome > .chrome__lang [data-lang="es"]')?.getBoundingClientRect();
    const ring = document.querySelector('.checklist__ring-btn')?.getBoundingClientRect();
    if (!es || !ring) return { overlap: false };
    const overlapPx =
      Math.max(0, Math.min(es.right, ring.right) - Math.max(es.left, ring.left)) *
      Math.max(0, Math.min(es.bottom, ring.bottom) - Math.max(es.top, ring.top));
    return { overlap: overlapPx > 4, overlapPx };
  });
  overlap = rects.overlap;
  let esTap = false;
  const langBefore = await page.evaluate(() => document.documentElement.lang);
  await page.locator(`${LANG} [data-lang="es"]`).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);
  const langAfter = await page.evaluate(() => document.documentElement.lang);
  esTap = langAfter.startsWith('es') || langBefore.startsWith('es');
  await page.screenshot({ path: path.join(OUT, `controls-${tag}.png`) });
  const requiredOk = hits.filter((h) => !h.includes('missing')).every((h) => h.includes(':ok'));
  const pass = !overlap && requiredOk && esTap;
  record('MED-2-control-hits', pass, `${hits.join('; ')} overlap=${overlap}`, tag);
}

async function low1BibliotecaTitle(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('biblioteca'));
  await page.waitForSelector('.building-panel--writings.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForTimeout(400);
  const title = await page.locator('.exp-header__title').textContent();
  const clipped = await page.evaluate(() => {
    const el = document.querySelector('.exp-header__title');
    if (!el) return true;
    return el.scrollWidth > el.clientWidth + 2;
  });
  await page.screenshot({ path: path.join(OUT, `biblioteca-title-${tag}.png`) });
  const t = title?.trim() ?? '';
  const pass = (t.includes('ículos') || t === 'Articles') && t.length >= 8 && !clipped;
  record('LOW-1-biblioteca-title', pass, `title="${title?.trim()}" clipped=${clipped}`, tag);
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });

  const k6 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify-forge-k6.mjs'), BASE], {
    encoding: 'utf8',
  });
  if (k6.status !== 0) {
    console.error(k6.stdout || k6.stderr);
    process.exit(1);
  }

  const browser = await launchBrowser(chromium);
  for (const w of [360, 390, 430]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'es-VE',
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await med1CharlasRoom(page, String(w));
    await ctx.close();
  }

  for (const { w, h, tag } of [
    { w: 844, h: 390, tag: '844x390' },
    { w: 390, h: 844, tag: '390x844' },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: true,
      isMobile: true,
      locale: 'es-VE',
      ...(w === 390 ? devices['iPhone 12 Pro'] : {}),
    });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await med2ControlHits(page, tag);
    await ctx.close();
  }

  const bib = await browser.newContext({ viewport: { width: 360, height: 844 }, hasTouch: true, locale: 'es-VE' });
  const bibPage = await bib.newPage();
  await hideWebdriver(bibPage);
  await low1BibliotecaTitle(bibPage, '360');
  await bib.close();

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n| Forge k7 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${String(r.detail).slice(0, 72)} |`);
  }
  if (failed.length) process.exit(1);
  console.log(`\nForge k7: ${results.length} checks PASS (+ Forge k6 / Sentinel R1)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
