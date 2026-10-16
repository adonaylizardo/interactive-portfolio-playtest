/**
 * Real 375 touch: expanded case sheet stays 100% wide, never pans sideways.
 * Usage: node scripts/verify-case-scroll.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'case-scroll');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const CASES = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

function measure(vw) {
  const sheet = document.querySelector('.building-panel--preview.building-panel--expanded .building-panel__sheet');
  const bar = document.querySelector('.case-read__bar');
  const body = document.body;
  const html = document.documentElement;
  if (!sheet) return { missing: true };
  const sr = sheet.getBoundingClientRect();
  const br = bar?.getBoundingClientRect();
  const cs = getComputedStyle(sheet);
  const bcs = bar ? getComputedStyle(bar) : null;
  const wrap = (sel) => {
    const el = sheet.querySelector(sel);
    return el ? getComputedStyle(el).overflowWrap : null;
  };
  const wide = [];
  for (const el of sheet.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement)) continue;
    if (!el.getClientRects().length) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.width > vw + 1.5 || r.right > vw + 1.5 || r.left < -1.5) {
      wide.push({
        tag: el.className || el.tagName,
        w: Math.round(r.width),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  return {
    missing: false,
    expanded: window.__playtestQa.isCasePreviewExpanded(),
    vw,
    sheet: {
      w: Math.round(sr.width),
      left: Math.round(sr.left),
      right: Math.round(sr.right),
      scrollLeft: sheet.scrollLeft,
      scrollWidth: sheet.scrollWidth,
      clientWidth: sheet.clientWidth,
      scrollTop: Math.round(sheet.scrollTop),
      scrollHeight: sheet.scrollHeight,
      clientHeight: sheet.clientHeight,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      touchAction: cs.touchAction,
      overflowWrap: cs.overflowWrap,
      width: cs.width,
    },
    bar: br
      ? {
          w: Math.round(br.width),
          left: Math.round(br.left),
          right: Math.round(br.right),
          top: Math.round(br.top),
          width: bcs?.width,
        }
      : null,
    bodyOverflowX: getComputedStyle(body).overflowX,
    htmlOverflowX: getComputedStyle(html).overflowX,
    wraps: {
      headline: wrap('.case-read__headline'),
      heading: wrap('.case__heading'),
      text: wrap('.case__text'),
      barTitle: wrap('.case-read__bar-title'),
    },
    wide: wide.slice(0, 8),
  };
}

async function swipeX(cdp, x, y, dx) {
  const pt = (px, py) => [{ x: Math.round(px), y: Math.round(py), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pt(x + (dx * i) / 10, y),
    });
    await wait(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function swipeY(cdp, x, y, dy) {
  const pt = (px, py) => [{ x: Math.round(px), y: Math.round(py), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: pt(x, y + (dy * i) / 12),
    });
    await wait(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function openExpanded(page, id) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel();
  });
  await wait(200);
  await page.evaluate((name) => window.__playtestQa.showCasePreview(name), id);
  await wait(250);
  await page.evaluate(() => window.__playtestQa.expandCasePreview());
  await wait(400);
  if (!(await page.evaluate(() => window.__playtestQa.isCasePreviewExpanded()))) {
    await page.evaluate(() => window.__playtestQa.expandCasePreview());
    await wait(400);
  }
}

async function boot(page) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.isInInterior), null, { timeout: 45000 });
  await wait(400);
  const info = await page.evaluate(() => ({
    js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
  }));
  return {
    loadMs: Date.now() - t0,
    bundle: info.js.map((s) => s.split('/').pop()).join(',') || 'dev',
  };
}

const errors = [];
const notes = [];
const req404 = [];
const consoleErrors = [];
const browser = await launchBrowser(chromium);
const vw = 375;
const vh = 812;
const ctx = await browser.newContext({
  viewport: { width: vw, height: vh },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
page.on('response', (res) => {
  if (res.status() >= 400) req404.push(`${res.status()} ${res.url()}`);
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

try {
  const bootInfo = await boot(page);
  notes.push(`bundle ${bootInfo.bundle} load=${bootInfo.loadMs}ms`);
  await page.evaluate(() => window.__playtestQa.setLayout?.('map'));
  await wait(200);

  for (const id of CASES) {
    await openExpanded(page, id);
    const top = await page.evaluate(measure, vw);
    notes.push(`${id} top ${JSON.stringify({ sheet: top.sheet, bar: top.bar, wraps: top.wraps, wide: top.wide.length })}`);
    if (top.missing || !top.expanded) errors.push(`${id}: expanded sheet missing`);
    else {
      if (top.sheet.w !== vw) errors.push(`${id}: sheet width ${top.sheet.w}px, want ${vw}`);
      if (top.sheet.left !== 0 || top.sheet.right !== vw) {
        errors.push(`${id}: sheet left/right ${top.sheet.left}/${top.sheet.right}, want 0/${vw}`);
      }
      if (top.sheet.overflowX !== 'hidden') errors.push(`${id}: sheet overflow-x is ${top.sheet.overflowX}`);
      if (top.bodyOverflowX !== 'hidden' || top.htmlOverflowX !== 'hidden') {
        errors.push(`${id}: html/body overflow-x ${top.htmlOverflowX}/${top.bodyOverflowX}`);
      }
      if (!/\bpan-y\b/.test(top.sheet.touchAction) || /\bpan-x\b/.test(top.sheet.touchAction)) {
        errors.push(`${id}: sheet touch-action is ${top.sheet.touchAction}, want pan-y`);
      }
      if (top.sheet.overflowWrap !== 'anywhere') {
        errors.push(`${id}: sheet overflow-wrap is ${top.sheet.overflowWrap}, want anywhere`);
      }
      for (const [k, v] of Object.entries(top.wraps)) {
        if (v && v !== 'anywhere') errors.push(`${id}: ${k} overflow-wrap is ${v}`);
      }
      if (!top.bar) errors.push(`${id}: sticky bar missing`);
      else {
        if (top.bar.w !== vw) errors.push(`${id}: sticky bar width ${top.bar.w}px, want ${vw}`);
        if (top.bar.left !== 0) errors.push(`${id}: sticky bar left ${top.bar.left}, want 0`);
        if (top.bar.top > 2) errors.push(`${id}: sticky bar top ${top.bar.top}, want 0`);
      }
      if (top.sheet.scrollLeft !== 0) errors.push(`${id}: sheet scrollLeft ${top.sheet.scrollLeft} at top`);
      if (top.sheet.scrollWidth > top.sheet.clientWidth + 1) {
        errors.push(`${id}: sheet scrollWidth ${top.sheet.scrollWidth} > clientWidth ${top.sheet.clientWidth}`);
      }
      if (top.wide.length) errors.push(`${id}: element(s) wider than viewport ${JSON.stringify(top.wide)}`);
    }
    await page.screenshot({ path: path.join(OUT, `375-${id}-top.png`) });

    const midY = Math.round(vh * 0.55);
    const midX = Math.round(vw * 0.5);
    await swipeY(cdp, midX, Math.round(vh * 0.72), -280);
    await wait(200);
    await page.evaluate(() => {
      const sheet = document.querySelector('.building-panel__sheet');
      if (sheet) sheet.scrollTop = Math.min(sheet.scrollHeight, Math.max(180, sheet.scrollTop || 180));
    });
    await wait(120);
    const mid = await page.evaluate(measure, vw);
    await page.screenshot({ path: path.join(OUT, `375-${id}-mid.png`) });
    if (mid.sheet && mid.sheet.scrollLeft !== 0) errors.push(`${id}: scrollLeft ${mid.sheet.scrollLeft} after vertical pan`);
    if (mid.bar && (mid.bar.w !== vw || mid.bar.left !== 0 || mid.bar.top > 2)) {
      errors.push(
        `${id}: sticky bar shifted after vertical pan w=${mid.bar.w} left=${mid.bar.left} top=${mid.bar.top}`,
      );
    }
    if (mid.wide?.length) errors.push(`${id}: wide after vertical pan ${JSON.stringify(mid.wide)}`);

    const beforeSwipe = await page.evaluate(measure, vw);
    await swipeX(cdp, Math.round(vw * 0.72), midY, -140);
    await wait(150);
    await swipeX(cdp, Math.round(vw * 0.28), midY, 140);
    await wait(150);
    const afterSwipe = await page.evaluate(measure, vw);
    await page.screenshot({ path: path.join(OUT, `375-${id}-swipe.png`) });
    if (afterSwipe.sheet.scrollLeft !== 0) {
      errors.push(`${id}: horizontal swipe moved scrollLeft to ${afterSwipe.sheet.scrollLeft}`);
    }
    if (afterSwipe.sheet.left !== 0 || afterSwipe.sheet.w !== vw) {
      errors.push(`${id}: sheet shifted after swipe left=${afterSwipe.sheet.left} w=${afterSwipe.sheet.w}`);
    }
    if (afterSwipe.bar && (afterSwipe.bar.left !== 0 || afterSwipe.bar.w !== vw || afterSwipe.bar.top > 2)) {
      errors.push(
        `${id}: sticky bar shifted after swipe w=${afterSwipe.bar.w} left=${afterSwipe.bar.left} top=${afterSwipe.bar.top}`,
      );
    }
    const dx = afterSwipe.sheet.left - beforeSwipe.sheet.left;
    if (dx !== 0) errors.push(`${id}: sheet left moved ${dx}px on horizontal swipe`);

    await page.evaluate(() => {
      const sheet = document.querySelector('.building-panel__sheet');
      if (sheet) sheet.scrollTop = sheet.scrollHeight;
    });
    await wait(150);
    const bottom = await page.evaluate(measure, vw);
    await page.screenshot({ path: path.join(OUT, `375-${id}-bottom.png`) });
    if (bottom.sheet.scrollLeft !== 0) errors.push(`${id}: scrollLeft ${bottom.sheet.scrollLeft} at bottom`);
    if (bottom.bar && (bottom.bar.w !== vw || bottom.bar.left !== 0 || bottom.bar.top > 2)) {
      errors.push(
        `${id}: sticky bar not full width at bottom w=${bottom.bar.w} left=${bottom.bar.left} top=${bottom.bar.top}`,
      );
    }
    if (bottom.wide?.length) errors.push(`${id}: wide at bottom ${JSON.stringify(bottom.wide)}`);
    notes.push(`${id} bottom scrollTop=${bottom.sheet?.scrollTop}/${bottom.sheet?.scrollHeight}`);
  }
} finally {
  await browser.close();
}

for (const n of notes) console.log(' ', n);
for (const u of req404) errors.push(`404: ${u}`);
for (const u of consoleErrors) errors.push(`console: ${u}`);
if (errors.length) {
  for (const e of errors) console.error('FAIL', e);
  process.exit(1);
}
console.log('verify-case-scroll: ok');
