#!/usr/bin/env node
/** Forge QA k8 — screenshot pixel checks, control hits, biblioteca room, regressions. */
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
const OUT = path.join(ROOT, 'artifacts/forge-k8');

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
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
  return { var: sumSq / n - mean * mean, mean };
}

async function openCharlasExpanded(page, viaLeer) {
  if (viaLeer) {
    await page.goto(`${BASE.replace(/#.*$/, '')}#/leer`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(500);
    await page.locator('.reading-view [data-back]').click({ timeout: 8000 }).catch(() => {});
    await page.waitForFunction(() => !location.hash.includes('/leer'), { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);
  } else {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  }
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--experience.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.locator('[data-exp-expand]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function med1ScreenshotRoom(page, tag, viaLeer) {
  await openCharlasExpanded(page, viaLeer);
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 0,
  );
  const clip = {
    x: 0,
    y: 0,
    width: (await page.viewportSize()).width,
    height: Math.max(80, Math.floor(sheetTop - 8)),
  };
  const shotPath = path.join(OUT, `charlas-expanded-${tag}${viaLeer ? '-leer' : ''}.png`);
  const buf = await page.screenshot({ path: shotPath, clip, type: 'png' });
  const png = PNG.sync.read(buf);
  const { var: v, mean } = pixelVariance(png);
  const tickerOk = await page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    const cs = canvas ? getComputedStyle(canvas) : null;
    return cs?.visibility !== 'hidden' && document.body.dataset.reading !== '1';
  });
  const pass = tickerOk && v > 18 && mean > 14 && mean < 240;
  record(`MED-1-charlas-capture-${viaLeer ? 'leer' : 'door'}`, pass, `var=${v.toFixed(1)} mean=${mean.toFixed(1)} sheetTop=${sheetTop}`, tag);
}

async function med1bBiblioteca(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('biblioteca'));
  await page.waitForSelector('.building-panel--writings.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('.building-panel__sheet')?.getBoundingClientRect();
    const free = document.getElementById('game-canvas')?.dataset.interiorFree;
    const parsed = free ? JSON.parse(free) : null;
    const freeW = parsed ? parsed.r - parsed.l : 0;
    return { sheetLeft: sheet?.left ?? 0, sheetRight: sheet?.right ?? 0, freeW, vw: innerWidth };
  });
  const sheetPath = path.join(OUT, `biblioteca-expanded-${tag}.png`);
  await page.screenshot({ path: sheetPath });
  const pass = m.sheetLeft < 16 && m.freeW >= m.vw * 0.45;
  record('MED-1b-biblioteca-room', pass, JSON.stringify(m), tag);
}

const LANG = '.chrome > .chrome__lang';
const CONTROLS = [
  { id: 'lang-es', sel: `${LANG} [data-lang="es"]` },
  { id: 'lang-en', sel: `${LANG} [data-lang="en"]` },
  { id: 'checklist-ring', sel: '.checklist__ring-btn' },
  { id: 'tools-pill', sel: '.chrome__tools-phone' },
  { id: 'rail-home', sel: '.chrome__rail [data-action="home"]', optional: true },
  { id: 'dock-map', sel: '.chrome__dock [data-action="map"]', optional: true },
  { id: 'col-title', sel: '.chrome__column h1, .chrome__column .chrome__name', optional: true },
];

async function med2Hits(page, tag) {
  await page.waitForTimeout(600);
  const hits = [];
  for (const c of CONTROLS) {
    const box = await page.locator(c.sel).first().boundingBox().catch(() => null);
    if (!box || box.width < 8) {
      if (!c.optional) hits.push(`${c.id}:missing`);
      continue;
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const ok = await page.evaluate(
      ({ x, y, sel }) => {
        const el = document.elementFromPoint(x, y);
        const primary = sel.split(',')[0].trim();
        return !!el?.closest(primary) || !!el?.closest('.chrome__lang');
      },
      { x: cx, y: cy, sel: c.sel },
    );
    hits.push(`${c.id}:${ok ? 'ok' : 'blocked'}`);
  }
  const overlap = await page.evaluate(() => {
    const es = document.querySelector('.chrome > .chrome__lang [data-lang="es"]')?.getBoundingClientRect();
    const tools = document.querySelector('.chrome__tools-phone')?.getBoundingClientRect();
    if (!es || !tools) return false;
    const ox = Math.max(0, Math.min(es.right, tools.right) - Math.max(es.left, tools.left));
    const oy = Math.max(0, Math.min(es.bottom, tools.bottom) - Math.max(es.top, tools.top));
    return ox > 4 && oy > 4;
  });
  await page.screenshot({ path: path.join(OUT, `controls-${tag}.png`) });
  const required = hits.filter((h) => !h.includes('missing'));
  record('MED-2-controls', !overlap && required.every((h) => h.endsWith(':ok')), `${hits.join('; ')} overlap=${overlap}`, tag);
}

async function lowTalkScroll(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--experience.building-panel--open');
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.locator('.experience__row').first().click();
  await page.waitForTimeout(400);
  const box = await page.locator('.talks-player__open').boundingBox();
  const pass = box && box.y >= 0 && box.height >= 44;
  record('LOW-talk-open-visible', !!pass, box ? `y=${box.y} h=${box.height}` : 'no box', '844x390');
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });

  const k7 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify-forge-k7.mjs'), BASE], {
    encoding: 'utf8',
  });
  if (k7.status !== 0) {
    console.error(k7.stdout || k7.stderr);
    process.exit(1);
  }

  const browser = await launchBrowser(chromium);
  for (const w of [360, 390, 430]) {
    for (const viaLeer of [false, true]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 844 },
        hasTouch: true,
        isMobile: true,
        locale: 'es-VE',
      });
      const page = await ctx.newPage();
      await hideWebdriver(page);
      await med1ScreenshotRoom(page, String(w), viaLeer);
      await ctx.close();
    }
  }

  for (const w of [360, 390, 430]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, hasTouch: true, locale: 'es-VE' });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await med1bBiblioteca(page, String(w));
    await ctx.close();
  }

  const layouts = [
    { w: 844, h: 390, tag: '844x390-dock', prep: async (page) => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.locator('.chrome__dock [data-action="map"]').click().catch(() => {});
      await page.waitForTimeout(400);
    }},
    { w: 844, h: 390, tag: '844x390-side', prep: async (page) => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.locator('.chrome__dock [data-dock="intro"]').click().catch(() => {});
      await page.waitForTimeout(400);
    }},
    { w: 390, h: 844, tag: '390x844', prep: async (page) => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
    }},
    { w: 1280, h: 800, tag: '1280', prep: async (page) => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
    }},
  ];

  for (const L of layouts) {
    const ctx = await browser.newContext({
      viewport: { width: L.w, height: L.h },
      hasTouch: L.w < 768,
      isMobile: L.w < 768,
      locale: 'es-VE',
      ...(L.w === 390 ? devices['iPhone 12 Pro'] : {}),
    });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await L.prep(page);
    await med2Hits(page, L.tag);
    await ctx.close();
  }

  const lowCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const lowPage = await lowCtx.newPage();
  await hideWebdriver(lowPage);
  await lowTalkScroll(lowPage);
  await lowCtx.close();

  await browser.close();

  console.log('\n| Forge k8 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${String(r.detail).slice(0, 72)} |`);
  }
  const failed = results.filter((r) => !r.pass);
  if (failed.length) process.exit(1);
  console.log(`\nForge k8: ${results.length} checks PASS (+ Forge k7 chain)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
