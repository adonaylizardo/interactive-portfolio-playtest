#!/usr/bin/env node
/**
 * Sentinel-style iPhone exit timing: tap until the room is closed and the map is interactive.
 * 3 runs per room per method (mat, Salir). Target ≤150 ms.
 * Usage: QA_BASE_URL=… node scripts/qa-exit-interactive.mjs
 */
import { webkit, devices } from 'playwright';
import { armExitTimer, readExitTimer, describeExit, exitIsImmediate } from './qa-exit-timer.mjs';

const ROOMS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor'];
const RUNS = 3;
const BASE = process.env.QA_BASE_URL || 'http://127.0.0.1:4195/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function openRoom(page, name) {
  await page.goto(`${BASE}?cb=${Math.random()}`, { waitUntil: 'networkidle' });
  await wait(600);
  await page.evaluate((n) => window.__playtestQa.enterInterior(n), name);
  await page.waitForFunction(() => window.__playtestQa.isInInterior() === true, null, { timeout: 10000 });
  await wait(700);
}

async function tapMat(page) {
  const L = await page.evaluate(() => window.__playtestQa.interiorLayout());
  const pt = await page.evaluate(([x, y]) => window.__playtestQa.interiorTileScreenPoint(x, y), [L.exit.x, L.exit.y]);
  await page.touchscreen.tap(Math.round(pt.x), Math.round(pt.y));
}

async function tapSalir(page) {
  await page.waitForSelector('.building-panel--open [data-exit]', { state: 'visible', timeout: 5000 });
  const box = await page.locator('.building-panel [data-exit]').first().boundingBox();
  if (!box) throw new Error('Salir has no box');
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  // Same-tick down+up: a quick tap. Playwright's touchscreen.tap holds ~100 ms, which
  // ate the 150 ms budget once leave moved to pointerup.
  await page.evaluate(([cx, cy]) => {
    const el = document.elementFromPoint(cx, cy)?.closest('[data-exit]') || document.querySelector('.building-panel [data-exit]');
    const extra = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 11, pointerType: 'touch', isPrimary: true };
    el.dispatchEvent(new PointerEvent('pointerdown', extra));
    el.dispatchEvent(new PointerEvent('pointerup', extra));
  }, [x, y]);
}

async function main() {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const rows = [];
  for (const room of ROOMS) {
    const rec = { room, mat: [], salir: [] };
    for (const [method, tap] of [
      ['mat', tapMat],
      ['salir', tapSalir],
    ]) {
      for (let i = 0; i < RUNS; i++) {
        const page = await ctx.newPage();
        try {
          await openRoom(page, room);
          await armExitTimer(page);
          await tap(page);
          const r = await readExitTimer(page);
          rec[method].push(r);
          const ok = exitIsImmediate(r) ? 'ok' : 'FAIL';
          console.log(`${room} ${method} #${i + 1} ${describeExit(r)} ${ok}`);
        } finally {
          await page.close();
        }
      }
    }
    rows.push(rec);
  }
  await browser.close();

  const nums = (arr) => arr.map((r) => r?.ms).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const median = (arr) => {
    const ms = nums(arr);
    if (!ms.length) return null;
    const mid = Math.floor(ms.length / 2);
    return ms.length % 2 ? ms[mid] : Math.round((ms[mid - 1] + ms[mid]) / 2);
  };
  const band = (arr) => {
    const ms = nums(arr);
    if (!ms.length) return '—';
    const med = median(arr);
    return `${ms[0]}–${ms[ms.length - 1]} (med ${med})`;
  };
  console.log('\nroom\tmat (ms)\tSalir (ms)');
  let fail = 0;
  const allMat = [];
  const allSalir = [];
  for (const rec of rows) {
    console.log(`${rec.room}\t${band(rec.mat)}\t${band(rec.salir)}`);
    allMat.push(...rec.mat);
    allSalir.push(...rec.salir);
    for (const r of [...rec.mat, ...rec.salir]) if (!exitIsImmediate(r)) fail++;
  }
  console.log(`ALL\t${band(allMat)}\t${band(allSalir)}`);
  console.log(`median mat ${median(allMat)} ms; median Salir ${median(allSalir)} ms`);
  if (fail) {
    console.error(`${fail} run(s) over 150 ms (or walked first)`);
    process.exit(1);
  }
}

main();
