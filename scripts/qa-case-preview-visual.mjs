#!/usr/bin/env node
/**
 * Case preview / reader DOM + screenshots at 390×844 @2x and 1280 desktop.
 * Usage: node scripts/qa-case-preview-visual.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const OUT = '/tmp/case-preview-visual';
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismissWelcome(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.showCasePreview, { timeout: 120000 });
  const start = page.locator('[data-boot-start]');
  if (await start.isVisible().catch(() => false)) await start.click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 }).catch(() => {});
}

function sampleButtonRgb(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  // Center hits label text (#0b0c0e); sample upper-left fill inside the pill padding.
  const x = Math.max(8, Math.floor(png.width * 0.22));
  const y = Math.floor(png.height * 0.38);
  const i = (png.width * y + x) * 4;
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] };
}

function pngSize(pngPath) {
  const png = PNG.sync.read(fs.readFileSync(pngPath));
  return { w: png.width, h: png.height };
}

/** Peek sheet should be materially taller than legacy one-line interior bar (~72px logical). */
function assertPeekTallerThanOneLineBar(pngPath, tag, errors) {
  const { h } = pngSize(pngPath);
  if (h < 140) errors.push(`${tag}: sheet screenshot height ${h}px — still one-line peek?`);
}

async function readHudState(page) {
  return page.evaluate(() => {
    const views = document.querySelector('.chrome__views');
    const minimap = document.querySelector('.chrome__minimap-wrap');
    const locate = document.querySelector('.chrome__locate');
    const snap = (el) =>
      el
        ? {
            visibility: getComputedStyle(el).visibility,
            display: getComputedStyle(el).display,
          }
        : null;
    return { views: snap(views), minimap: snap(minimap), locate: snap(locate) };
  });
}

function assertHudHidden(state, tag, errors) {
  for (const key of ['views', 'minimap', 'locate']) {
    const el = state[key];
    if (!el) continue;
    if (el.visibility !== 'hidden' && el.display !== 'none') {
      errors.push(`${tag}: HUD ${key} still visible (${el.visibility}/${el.display})`);
    }
  }
  if (state.views && state.views.display !== 'none' && state.views.visibility !== 'hidden') {
    errors.push(`${tag}: chrome__views not hidden`);
  }
}

function assertHudShown(state, tag, errors) {
  if (!state.views) return;
  if (state.views.display === 'none' || state.views.visibility === 'hidden') {
    errors.push(`${tag}: chrome__views still hidden after reader closed`);
  }
}

async function assertCasePreview(page, tag, errors) {
  const dom = await page.evaluate(() => {
    const panel = document.querySelector('.building-panel');
    const preview = document.querySelector('[data-preview]');
    const kicker = document.querySelector('.case-preview__kicker');
    const read = document.querySelector('.case-read');
    const hero = document.querySelector('.case-read__hero');
    return {
      previewMode: panel?.classList.contains('building-panel--preview'),
      interiorMode: panel?.classList.contains('building-panel--interior-only'),
      peek: panel?.classList.contains('building-panel--peek'),
      previewHidden: preview?.hidden ?? true,
      kicker: kicker?.textContent?.trim() ?? '',
      kickerVisible: kicker ? getComputedStyle(kicker).display !== 'none' : false,
      readHidden: read?.hidden ?? true,
      heroDisplay: hero ? getComputedStyle(hero).display : 'missing',
      titleHidden: document.querySelector('.building-panel__title')?.hidden ?? false,
    };
  });
  if (!dom.previewMode) errors.push(`${tag}: building-panel--preview missing (interior peek path?)`);
  if (dom.previewHidden) errors.push(`${tag}: [data-preview] still hidden`);
  if (!dom.kicker || !/CASE|CASO/.test(dom.kicker)) errors.push(`${tag}: case-preview kicker missing (${dom.kicker})`);
  if (!dom.kickerVisible) errors.push(`${tag}: case-preview kicker display:none`);
  return dom;
}

async function runPhone(errors, notes) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  try {
    await dismissWelcome(page);
    await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
    await wait(600);
    const dom = await assertCasePreview(page, 'phone-peek', errors);
    notes.push(`phone-peek dom ${JSON.stringify(dom)}`);
    const peekShot = path.join(OUT, 'phone-peek.png');
    await page.locator('.building-panel__sheet').screenshot({ path: peekShot });
    assertPeekTallerThanOneLineBar(peekShot, 'phone-peek', errors);
    await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
    await page.locator('[data-read]').click();
    await wait(500);
    const expanded = await page.evaluate(() => ({
      expanded: document.querySelector('.building-panel')?.classList.contains('building-panel--expanded'),
      readKicker: document.querySelector('.case-read__kicker')?.textContent?.trim(),
      heroDisplay: getComputedStyle(document.querySelector('.case-read__hero')).display,
      readHidden: document.querySelector('[data-read-view]')?.hidden,
      hasExpandBtn: !!document.querySelector('[data-read-collapse]'),
    }));
    if (!expanded.expanded) errors.push('phone-expanded: not expanded');
    if (!expanded.readKicker) errors.push('phone-expanded: read kicker empty');
    if (expanded.heroDisplay === 'none') errors.push('phone-expanded: hero hidden');
    if (!expanded.hasExpandBtn) errors.push('phone-expanded: reader expand control missing');
    notes.push(`phone-expanded dom ${JSON.stringify(expanded)}`);
    const hudReader = await readHudState(page);
    assertHudHidden(hudReader, 'phone-expanded', errors);
    notes.push(`phone-expanded hud ${JSON.stringify(hudReader)}`);
    await page.locator('.building-panel__sheet').screenshot({
      path: path.join(OUT, 'phone-expanded.png'),
    });
    await page.evaluate(() => window.__playtestQa.collapseCasePreview());
    await wait(400);
    const hudPeek = await readHudState(page);
    assertHudShown(hudPeek, 'phone-peek-after-reader', errors);
    notes.push(`phone-peek hud ${JSON.stringify(hudPeek)}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function runDesktop(errors, notes) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  try {
    await dismissWelcome(page);
    await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
    await page.locator('[data-read]').click();
    await wait(500);
    const hudReader = await readHudState(page);
    assertHudHidden(hudReader, 'desktop-expanded', errors);
    notes.push(`desktop-expanded hud ${JSON.stringify(hudReader)}`);
    await page.screenshot({ path: path.join(OUT, 'desktop-expanded-1440.png') });
    await page.locator('.building-panel__sheet').screenshot({
      path: path.join(OUT, 'desktop-expanded.png'),
    });
    await page.evaluate(() => window.__playtestQa.collapseCasePreview());
    await wait(400);
    const hudPeek = await readHudState(page);
    assertHudShown(hudPeek, 'desktop-peek-after-reader', errors);
    await page.evaluate(() => window.__playtestQa.dismissBuildingPanel());
    await wait(300);
    const hudMap = await readHudState(page);
    assertHudShown(hudMap, 'desktop-map-after-dismiss', errors);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function runBootButton(errors, notes) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('.boot-flow--welcome', { timeout: 180000 });
    await page.waitForSelector('[data-boot-start]', { timeout: 30000 });
    const btn = page.locator('[data-boot-start]');
    const shot = path.join(OUT, 'boot-primary-btn.png');
    await btn.screenshot({ path: shot });
    const rgb = sampleButtonRgb(shot);
    notes.push(`boot primary sample rgb(${rgb.r},${rgb.g},${rgb.b})`);
    const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    if (lum < 215) errors.push(`boot-welcome: primary button renders too dark (rgb ${rgb.r},${rgb.g},${rgb.b})`);
    if (rgb.r < 220 || rgb.g < 220 || rgb.b < 220) {
      errors.push(`boot-welcome: primary button not light pill (rgb ${rgb.r},${rgb.g},${rgb.b})`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

const errors = [];
const notes = [];
await runPhone(errors, notes);
await runDesktop(errors, notes);
await runBootButton(errors, notes);
for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`qa-case-preview-visual: ok (shots in ${OUT})`);
