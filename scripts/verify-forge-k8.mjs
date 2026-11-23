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

function transparentFraction(png) {
  const n = png.width * png.height;
  let zero = 0;
  for (let i = 0; i < n; i++) if (png.data[i * 4 + 3] === 0) zero++;
  return (zero / n) * 100;
}

async function stageAtDoor(page, name) {
  await page.evaluate((building) => {
    const qa = window.__playtestQa;
    const b = qa.getEnterableBuildings().find((o) => o.name === building);
    if (b?.door && b?.inward) {
      qa.setCharacterTile(b.door.x + b.inward.x, b.door.y + b.inward.y);
    }
    qa.frameDoorForQa(building);
  }, name);
  await page.waitForTimeout(400);
}

async function openCharlasExpanded(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  await stageAtDoor(page, 'teresa');
  const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('teresa'));
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  let entered = await page
    .waitForFunction(
      () =>
        window.__playtestQa?.isInInterior?.() &&
        document.querySelector('.building-panel--experience.building-panel--open'),
      { timeout: 45000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!entered) {
    await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
    await page.waitForSelector('.building-panel--experience.building-panel--open', { timeout: 20000 });
  }
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--experience.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
}

async function med1ScreenshotRoom(page, tag) {
  await openCharlasExpanded(page);
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 0,
  );
  const vw = (await page.viewportSize()).width;
  const clip = {
    x: 6,
    y: 1,
    width: Math.min(vw - 12, 384),
    height: Math.max(40, Math.floor(Math.min(sheetTop - 8, 334))),
  };
  const shotPath = path.join(OUT, `charlas-expanded-${tag}.png`);
  const buf = await page.screenshot({ path: shotPath, clip, type: 'png' });
  const png = PNG.sync.read(buf);
  const transparentPct = transparentFraction(png);
  record('MED-1-charlas-alpha', transparentPct === 0, `transparent=${transparentPct.toFixed(2)}% sheetTop=${sheetTop}`, tag);
}

async function med1bBiblioteca(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  await stageAtDoor(page, 'biblioteca');
  const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('biblioteca'));
  if (pt) await page.touchscreen.tap(pt.x, pt.y);
  let entered = await page
    .waitForFunction(
      () =>
        window.__playtestQa?.isInInterior?.() &&
        document.querySelector('.building-panel--writings.building-panel--open'),
      { timeout: 45000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!entered) {
    await page.evaluate(() => window.__playtestQa?.enterInterior?.('biblioteca'));
    await page.waitForSelector('.building-panel--writings.building-panel--open', { timeout: 20000 });
  }
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForFunction(
    () =>
      document.querySelector('.building-panel--writings.building-panel--expanded') &&
      !document.querySelector('.building-panel--peek'),
    { timeout: 8000 },
  );
  await page.waitForTimeout(600);
  const sheetTop = await page.evaluate(
    () => document.querySelector('.building-panel__sheet')?.getBoundingClientRect().top ?? 0,
  );
  const vw = (await page.viewportSize()).width;
  const clip = { x: 6, y: 1, width: Math.min(vw - 12, 384), height: Math.max(40, Math.floor(Math.min(sheetTop - 8, 334))) };
  const buf = await page.screenshot({ path: path.join(OUT, `biblioteca-expanded-${tag}.png`), clip, type: 'png' });
  const transparentPct = transparentFraction(PNG.sync.read(buf));
  record('MED-1b-biblioteca-alpha', transparentPct === 0, `transparent=${transparentPct.toFixed(2)}%`, tag);
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
    const ctx = await browser.newContext({
      viewport: { width: w, height: 844 },
      hasTouch: true,
      isMobile: true,
      locale: 'es-VE',
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await med1ScreenshotRoom(page, String(w));
    await ctx.close();
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
