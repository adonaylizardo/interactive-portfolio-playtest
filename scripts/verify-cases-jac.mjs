#!/usr/bin/env node
/**
 * Real-tap verification for case panels + parked JAC T9.
 * Usage: node scripts/verify-cases-jac.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'cases-jac');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const CASES = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function openCase(page, id, phone) {
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel();
  });
  await wait(250);
  const door = await page.evaluate((name) => {
    window.__playtestQa.frameDoorForQa(name);
    return window.__playtestQa.doorScreenPoint(name);
  }, id);
  if (door) {
    await page.mouse.click(door.x, door.y);
    await wait(350);
  }
  await page.evaluate((name) => window.__playtestQa.tapBuildingDoor(name), id);
  await wait(400);
  let open = await page.evaluate(() => window.__playtestQa.isBuildingPanelOpen());
  if (!open) {
    await page.evaluate((name) => window.__playtestQa.enterInterior(name), id);
    await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 10000 });
    open = true;
  }
  if (phone) {
    await page.evaluate(() => window.__playtestQa.expandInteriorSheet());
    await wait(400);
  }
  return open;
}

async function readPanel(page) {
  return page.evaluate(() => {
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const article = document.querySelector('.case');
    const lines = [...(article?.querySelectorAll('h3, p.case__text, li, .case__closing em') ?? [])]
      .filter(shown)
      .map((el) => el.textContent.replace(/\s+/g, ' ').trim());
    return {
      title: document.querySelector('.building-panel__title')?.textContent ?? '',
      lines,
      bodyHasVolaris: /volaris/i.test(document.body.innerText),
      placeholders: [...document.querySelectorAll('[data-placeholder]')].filter(shown).length,
    };
  });
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
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(800);
    const boot = await page.evaluate(() => ({
      js: [...document.scripts].map((s) => s.src).filter((s) => /index-.*\.js/.test(s)),
      atlas: performance.getEntriesByType('resource').filter((r) => /boot-1x/.test(r.name)).map((r) => r.name),
    }));
    notes.push(`${tag} bundle ${boot.js.map((s) => s.split('/').pop()).join(',') || 'n/a'}`);

    for (const id of CASES) {
      const tapped = await openCase(page, id, phone);
      if (!tapped) errors.push(`${tag}: ${id} door tap did not open the panel`);
      const m = await readPanel(page);
      if (!m.lines.length) errors.push(`${tag}: ${id} panel has no visible copy`);
      if (m.placeholders) errors.push(`${tag}: ${id} shows placeholders`);
      if (m.bodyHasVolaris) errors.push(`${tag}: ${id} public text names Volaris`);
      if (id === 'volaris' && !m.lines.some((t) => t.includes('10 sealed contracts'))) {
        errors.push(`${tag}: airline Result line missing`);
      }
      await page.screenshot({ path: path.join(OUT, `${tag}-${id}.png`) });
      await page.evaluate(() => {
        window.__playtestQa.leaveInteriorNow();
        window.__playtestQa.dismissBuildingPanel();
      });
      await wait(350);
    }

    const car = await page.evaluate(() => {
      const fill = window.__playtestQa.fill();
      const obj = fill.objects.find((o) => o.id === 'fill/jac-t9');
      const report = fill.report.find((r) => r.id === 'jac-t9');
      const blocked = [];
      for (let y = 16; y <= 18; y++) {
        for (let x = 23; x <= 27; x++) {
          if (fill.walk[y][x] !== '#') blocked.push([x, y]);
        }
      }
      return { obj, report, blocked };
    });
    if (!car.obj) errors.push(`${tag}: JAC T9 not on the map`);
    if (car.report?.plannedConflicts?.length) {
      errors.push(`${tag}: JAC T9 was moved: ${car.report.plannedConflicts.join('; ')}`);
    }
    if (car.blocked?.length) errors.push(`${tag}: JAC T9 footprint not solid: ${car.blocked}`);
    if (Math.abs((car.obj?.scale ?? 1) - 1.6) > 1e-6) {
      errors.push(`${tag}: JAC T9 scale ${car.obj?.scale}, want 1.6`);
    }
    if (car.obj && Math.abs(car.obj.h - 192 * 1.6) > 1) {
      errors.push(`${tag}: JAC T9 drawn height ${car.obj.h}, want ${192 * 1.6}`);
    }
    notes.push(`${tag} car z=${car.obj?.zIndex} cells=${JSON.stringify(car.obj?.cells)} key=${car.obj?.key}`);
    await page.evaluate(() => window.__playtestQa.frameWorld((27 - 18) * 64, (27 + 18) * 32 + 32, 1.05));
    await wait(400);
    await page.screenshot({ path: path.join(OUT, `${tag}-car.png`) });

    for (const [tx, ty, label] of [
      [27, 19, 'south'],
      [22, 18, 'west'],
      [28, 17, 'east'],
      [25, 15, 'north'],
    ]) {
      await page.evaluate(([x, y]) => window.__playtestQa.setCharacterTile(x, y), [tx, ty]);
      await wait(250);
      const depth = await page.evaluate(() => {
        const p = window.__playtestQa.playerAvatar();
        const car = window.__playtestQa.fill().objects.find((o) => o.id === 'fill/jac-t9');
        const tile = window.__playtestQa.getCharacterTile();
        return { tile, playerZ: p?.zIndex ?? p?.z, carZ: car?.zIndex };
      });
      notes.push(`${tag} walker ${label} (${tx},${ty}) ${JSON.stringify(depth)}`);
      await page.screenshot({ path: path.join(OUT, `${tag}-car-walker-${label}.png`) });
    }
  } finally {
    await browser.close();
  }
  return { tag, errors, notes, req404, consoleErrors };
}

const results = [];
results.push(
  await runViewport(
    'desktop-1280',
    { viewport: { width: 1280, height: 800 } },
    false,
  ),
);
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
console.log('verify-cases-jac: ok');
