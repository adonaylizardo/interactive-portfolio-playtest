#!/usr/bin/env node
/**
 * Real-tap verification: name pills vs heads at 4 facings × 3 zooms, JAC T9 scale, no bark 404s.
 * Usage: node scripts/verify-iphone-pills.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'iphone-pills');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = ['se', 'sw', 'ne', 'nw'];
const ZOOM_MAX = 1.5;

fs.mkdirSync(OUT, { recursive: true });

async function boot(page, tag) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.isInInterior), null, { timeout: 45000 });
  await wait(500);
  const info = await page.evaluate(() => ({
    js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
  }));
  return {
    tag,
    loadMs: Date.now() - t0,
    bundle: info.js.map((s) => s.split('/').pop()).join(',') || 'dev',
  };
}

async function resetMap(page) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel();
    window.__playtestQa.clearAnim?.();
  });
  await wait(200);
}

async function runViewport(tag, options, phone) {
  const errors = [];
  const notes = [];
  const req404 = [];
  const consoleErrors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  page.on('response', (res) => {
    if (res.status() >= 400) req404.push(`${res.status()} ${res.url()}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    const bootInfo = await boot(page, tag);
    notes.push(`${tag} bundle ${bootInfo.bundle} load=${bootInfo.loadMs}ms`);

    await resetMap(page);
    await page.mouse.click(Math.min(180, options.viewport.width / 2), Math.min(360, options.viewport.height / 2));
    await wait(250);

    const zooms = await page.evaluate((zMax) => {
      const canvas = document.getElementById('game-canvas');
      const zMin = Number(canvas?.dataset.zoomMin ?? 0.25);
      return { zMin, zMid: (zMin + zMax) / 2, zMax };
    }, ZOOM_MAX);
    notes.push(`${tag} zoom min=${zooms.zMin.toFixed(3)} mid=${zooms.zMid.toFixed(3)} max=${zooms.zMax}`);

    const DIR_STEP = { se: [1, 0], sw: [0, 1], ne: [0, -1], nw: [-1, 0] };
    await page.evaluate(() => window.__playtestQa.setCharacterTile(31, 40));
    await wait(200);

    for (const zKey of ['zMin', 'zMid', 'zMax']) {
      const z = zooms[zKey];
      for (const dir of DIRS) {
        const [dx, dy] = DIR_STEP[dir];
        await page.evaluate(
          ([tx, ty, zoom]) => {
            window.__playtestQa.clearAnim?.();
            window.__playtestQa.setCharacterTile(tx, ty);
            window.__playtestQa.setZoom(zoom);
          },
          [31, 40, z],
        );
        await wait(120);
        const dest = { x: 31 + dx * 4, y: 40 + dy * 4 };
        const tap = await page.evaluate(({ x, y }) => {
          const wx = (x - y) * 64;
          const wy = (x + y) * 32;
          return window.__playtestQa.worldToClient(wx, wy);
        }, dest);
        if (phone) await page.tap(tap.x, tap.y);
        else await page.mouse.click(tap.x, tap.y);
        await wait(280);
        await page.evaluate(([d]) => window.__playtestQa.setAnim(d, true, 3), [dir]);
        await wait(80);
        const geom = await page.evaluate(() => window.__playtestQa.namePillHeads());
        for (const g of geom) {
          if (!Number.isFinite(g.gap)) continue;
          if (g.gap < 2) {
            errors.push(`${tag} ${zKey} ${dir} ${g.id}: pill overlaps sprite (gap ${g.gap.toFixed(1)}px)`);
          }
          if (g.gap > 18) {
            errors.push(`${tag} ${zKey} ${dir} ${g.id}: pill floats too high (gap ${g.gap.toFixed(1)}px)`);
          }
        }
        const gaps = geom.map((g) => `${g.id}:${g.gap.toFixed?.(1) ?? g.gap}`).join(' ');
        notes.push(`${tag} ${zKey} ${dir} ${gaps}`);
        await page.screenshot({ path: path.join(OUT, `${tag}-${zKey}-${dir}.png`) });
      }
    }

    await page.evaluate(() => window.__playtestQa.clearAnim?.());
    await page.evaluate(() => {
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05);
      window.__playtestQa.setAnim('nw', false, 0);
    });
    await wait(300);
    const car = await page.evaluate(() => {
      const fill = window.__playtestQa.fill();
      const obj = fill.objects.find((o) => o.id === 'fill/jac-t9');
      const player = window.__playtestQa.playerAvatar();
      return {
        scale: obj?.scale,
        h: obj?.h,
        w: obj?.w,
        cells: obj?.cells,
        conflicts: fill.report.find((r) => r.id === 'jac-t9')?.plannedConflicts ?? [],
        avatarH: player.adonay.worldH,
        roofRatio: obj && player.adonay.worldH ? (138 - 13) * (obj.scale ?? 1) / player.adonay.worldH : null,
      };
    });
    if (Math.abs((car.scale ?? 0) - 1.35) > 1e-6) errors.push(`${tag}: JAC scale ${car.scale}, want 1.35`);
    if (car.conflicts.length) errors.push(`${tag}: JAC moved: ${car.conflicts.join('; ')}`);
    if (car.roofRatio != null && (car.roofRatio < 1.55 || car.roofRatio > 1.8)) {
      errors.push(`${tag}: JAC roof/avatar ${car.roofRatio.toFixed(3)}, want ~1.6–1.7`);
    }
    notes.push(`${tag} car ${JSON.stringify(car)}`);
    await page.screenshot({ path: path.join(OUT, `${tag}-car.png`) });

    const barks = await page.evaluate(() => window.__playtestQa.barks());
    if (barks.ready?.length) errors.push(`${tag}: bark files should be empty (${barks.ready.join(',')})`);
    notes.push(`${tag} barks ${JSON.stringify(barks)}`);

    const bark404 = req404.filter((u) => /\/audio\/barks\/.+\.(ogg|mp3)/.test(u));
    if (bark404.length) errors.push(`${tag}: bark 404s ${bark404.join(' | ')}`);
  } finally {
    await browser.close();
  }
  return { tag, errors, notes, req404, consoleErrors };
}

const results = [];
results.push(await runViewport('desktop-1280', { viewport: { width: 1280, height: 800 } }, false));
results.push(
  await runViewport(
    'mobile-375',
    { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    true,
  ),
);

const errors = results.flatMap((r) => [
  ...r.errors,
  ...r.req404.map((u) => `${r.tag} 404: ${u}`),
  ...r.consoleErrors.map((u) => `${r.tag} console: ${u}`),
]);
for (const r of results) {
  console.log('---', r.tag);
  for (const n of r.notes) console.log(' ', n);
}
if (errors.length) {
  for (const e of errors) console.error('FAIL', e);
  process.exit(1);
}
console.log('verify-iphone-pills: ok');
