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
    }));
    if (!expanded.expanded) errors.push('phone-expanded: not expanded');
    if (!expanded.readKicker) errors.push('phone-expanded: read kicker empty');
    if (expanded.heroDisplay === 'none') errors.push('phone-expanded: hero hidden');
    notes.push(`phone-expanded dom ${JSON.stringify(expanded)}`);
    await page.locator('.building-panel__sheet').screenshot({
      path: path.join(OUT, 'phone-expanded.png'),
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function runDesktop(errors, notes) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    await dismissWelcome(page);
    await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
    await page.locator('[data-read]').click();
    await wait(500);
    await page.locator('.building-panel__sheet').screenshot({
      path: path.join(OUT, 'desktop-expanded.png'),
    });
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
