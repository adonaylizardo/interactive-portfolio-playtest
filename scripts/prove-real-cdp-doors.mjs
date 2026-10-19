#!/usr/bin/env node
/**
 * Real input proof via Chrome DevTools Protocol only (no tapBuildingDoor / prepareDoorEntryForQa).
 * Coordinate reads use doorScreenPoint; every press/release is Input.dispatchMouseEvent or dispatchTouchEvent.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const CASE = new Set(['volaris', 'bain', 'mentoria', 'finoa', 'pg']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpSession(page) {
  return page.context().newCDPSession(page);
}

async function cdpMouseClick(page, x, y) {
  const cdp = await cdpSession(page);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'none',
    clickCount: 0,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
}

async function cdpTouchTap(page, x, y) {
  const cdp = await cdpSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function waitEntered(page, name, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await page.evaluate(
      (n) => ({
        interior: window.__playtestQa?.getInteriorId?.(),
        preview: !!document.querySelector('.building-panel--preview.building-panel--open'),
        exp: !!document.querySelector('.building-panel--experience.building-panel--open'),
      }),
      name,
    );
    if (CASE.has(name) && state.preview) return true;
    if (!CASE.has(name) && name !== 'teresa' && name !== 'biblioteca' && state.interior === name) {
      return true;
    }
    if ((name === 'teresa' || name === 'biblioteca') && state.exp) return true;
    await wait(200);
  }
  return false;
}

/** Camera only — same as a player framing a building before tapping (not an entry hook). */
async function frameDoorOnMap(page, name) {
  await page.evaluate((n) => {
    window.__playtestQa.frameDoorForQa(n);
  }, name);
  await wait(450);
}

/** Scan the visible canvas for a pick that matches the target door (read-only). */
async function findVisibleDoorClientPoint(page, name) {
  return page.evaluate((n) => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const inView = (x, y) =>
      x >= r.left + 8 && x <= r.right - 8 && y >= r.top + 8 && y <= r.bottom - 8;
    const pt = window.__playtestQa.doorScreenPoint?.(n);
    if (pt && inView(pt.x, pt.y) && window.__playtestQa.pickAt(pt.x, pt.y)?.door === n) {
      return { x: pt.x, y: pt.y };
    }
    for (let y = r.top + 32; y < r.bottom - 32; y += 12) {
      for (let x = r.left + 32; x < r.right - 32; x += 12) {
        const pick = window.__playtestQa.pickAt(x, y);
        if (pick?.door === n) return { x, y };
      }
    }
    return null;
  }, name);
}

async function resolveDoorClientPoint(page, name) {
  await frameDoorOnMap(page, name);
  let pt = await findVisibleDoorClientPoint(page, name);
  if (pt) return pt;
  await wait(350);
  await frameDoorOnMap(page, name);
  return findVisibleDoorClientPoint(page, name);
}

function hitIsCanvas(hit) {
  return typeof hit === 'string' && hit.startsWith('CANVAS#game-canvas');
}

const preview = spawn(process.execPath, ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(1200);

const browser = await launchBrowser(chromium);
const results = [];

try {
  {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const labelsPass = await page.evaluate(() => {
      const root = document.querySelector('#ui-root > .building-map-labels');
      if (!root) return { ok: false, reason: 'missing layer' };
      const pe = getComputedStyle(root).pointerEvents;
      const canvas = document.getElementById('game-canvas');
      const r = canvas.getBoundingClientRect();
      const cx = r.left + r.width * 0.55;
      const cy = r.top + r.height * 0.45;
      const hit = document.elementFromPoint(cx, cy);
      const hitClass = hit?.className?.toString?.() ?? '';
      return {
        ok: pe === 'none' && !hitClass.includes('building-map-labels'),
        pointerEvents: pe,
        hit: hit ? `${hit.tagName}.${hitClass.split(/\s+/)[0]}` : null,
      };
    });
    results.push({
      test: 'building-map-labels pointer-events none (CSS + hit-through)',
      pass: labelsPass.ok,
      ...labelsPass,
    });
    await page.close();
  }

  {
    const page = await (
      await browser.newContext({ viewport: { width: 1440, height: 900 } })
    ).newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    let pt = await resolveDoorClientPoint(page, 'teresa');
    if (!pt) throw new Error('no visible pick for teresa door on canvas');
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el
        ? `${el.tagName}${el.id ? `#${el.id}` : ''}.${String(el.className || '').split(/\s+/)[0] || ''}`
        : null;
    }, pt);
    results.push({
      test: 'map labels do not swallow door hit (desktop)',
      pass: hitIsCanvas(hit),
      hit,
      pt,
    });
    await cdpMouseClick(page, pt.x, pt.y);
    results.push({
      test: 'desktop CDP door teresa (experience)',
      pass: await waitEntered(page, 'teresa', 45000),
    });
    await page.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    await page.evaluate(() => window.__playtestQa.setLayout('map'));
    await wait(400);
    const pt = await resolveDoorClientPoint(page, 'bain');
    if (!pt) throw new Error('no visible pick for bain door on canvas');
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el
        ? `${el.tagName}${el.id ? `#${el.id}` : ''}.${String(el.className || '').split(/\s+/)[0] || ''}`
        : null;
    }, pt);
    results.push({
      test: 'map labels do not swallow door hit (phone map dock)',
      pass: hitIsCanvas(hit),
      hit,
      pt,
    });
    await cdpTouchTap(page, pt.x, pt.y);
    results.push({
      test: 'phone CDP touch door bain (case preview)',
      pass: await waitEntered(page, 'bain', 45000),
    });

    await page.evaluate(() => window.__playtestQa.dismissBuildingPanel());
    await page.waitForFunction(() => !document.querySelector('.building-panel--open'));
    await wait(500);
    const pt2 = await resolveDoorClientPoint(page, 'finoa');
    if (!pt2) throw new Error('no visible pick for finoa door on canvas');
    await cdpTouchTap(page, pt2.x, pt2.y);
    results.push({
      test: 'phone CDP chained finoa after case dismiss',
      pass: await waitEntered(page, 'finoa', 35000),
    });
    await ctx.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);
