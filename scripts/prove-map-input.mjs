#!/usr/bin/env node
/** Real pointer proof: 11/11 doors + phone EN/ES (no Enter, no tapBuildingDoor). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const CASE_HOUSES = new Set(['volaris', 'bain', 'mentoria', 'finoa', 'pg']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const preview = spawn(process.execPath, ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(1200);

const browser = await launchBrowser(chromium);
const results = [];

async function hitTest(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el
        ? `${el.tagName}${el.id ? `#${el.id}` : ''}.${String(el.className || '').split(/\s+/)[0] || ''}`
        : null;
    },
    { x, y },
  );
}

async function waitEntered(page, name, touch, timeoutMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await page.evaluate(
      (n) => ({
        interior: window.__playtestQa.getInteriorId?.(),
        preview: !!document.querySelector('.building-panel--preview.building-panel--open'),
        exp: !!document.querySelector('.building-panel--experience.building-panel--open'),
      }),
      name,
    );
    if (CASE_HOUSES.has(name) && state.preview) {
      return {
        ok: true,
        ms: Date.now() - t0,
        mode: 'preview',
        entryKind: 'case-preview (live: case sheet via mouse/tap on door)',
      };
    }
    if (!CASE_HOUSES.has(name) && state.interior === name) return { ok: true, ms: Date.now() - t0, mode: 'interior' };
    if ((name === 'teresa' || name === 'biblioteca') && state.exp) {
      return { ok: true, ms: Date.now() - t0, mode: 'experience' };
    }
    await wait(200);
  }
  return { ok: false, ms: Date.now() - t0, mode: 'timeout' };
}

async function enterDoorRealPointer(page, name, touch) {
  const prepared = await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
  if (!prepared) return { pass: false, reason: 'prepare failed' };
  await wait(400);
  const door = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  if (!door) return { pass: false, reason: 'no door point' };
  const hit = await hitTest(page, door.x, door.y);
  const t0 = Date.now();
  if (touch) await page.touchscreen.tap(door.x, door.y);
  else await page.mouse.click(door.x, door.y);
  const entered = await waitEntered(page, name, touch);
  return {
    pass: hit !== 'DIV.building-map-labels' && entered.ok,
    hit,
    ms: entered.ms ?? Date.now() - t0,
    mode: entered.mode,
    reason: entered.ok ? null : entered.mode,
  };
}

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const names = await page.evaluate(() =>
      window.__playtestQa.getEnterableBuildings().map((b) => b.name).sort(),
    );
    for (const name of names) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
      const r = await enterDoorRealPointer(page, name, true);
      results.push({ test: `phone door ${name}`, ...r });
    }
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    await page.evaluate(() => window.__playtestQa.setLayout('map'));
    await wait(300);
    const en = page.locator('.chrome__lang [data-lang="en"]');
    const es = page.locator('.chrome__lang [data-lang="es"]');
    const enBox = await en.boundingBox();
    const enHit = enBox ? await hitTest(page, enBox.x + enBox.width / 2, enBox.y + enBox.height / 2) : null;
    if (enBox) await page.touchscreen.tap(enBox.x + enBox.width / 2, enBox.y + enBox.height / 2);
    await wait(250);
    const langEn = await page.evaluate(() => document.documentElement.lang);
    const esBox = await es.boundingBox();
    if (esBox) await page.touchscreen.tap(esBox.x + esBox.width / 2, esBox.y + esBox.height / 2);
    await wait(250);
    const langEs = await page.evaluate(() => document.documentElement.lang);
    results.push({
      test: 'phone EN/ES toggle',
      enHit,
      pass:
        langEn === 'en' &&
        langEs === 'es' &&
        enHit !== 'DIV.building-map-labels' &&
        String(enHit ?? '').includes('chrome__lang-opt'),
      langEn,
      langEs,
    });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const chainNames = await page.evaluate(() =>
      window.__playtestQa.getEnterableBuildings().map((b) => b.name).sort(),
    );
    let chainOk = true;
    for (const name of chainNames) {
      const prepared = await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
      if (!prepared) {
        chainOk = false;
        results.push({ test: `phone chained ${name}`, pass: false, reason: 'prepare failed', mode: 'chain' });
        break;
      }
      await wait(350);
      await page.evaluate(() => window.__playtestQa.releaseMapTapGestureForQa?.());
      const door = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
      await page.touchscreen.tap(door.x, door.y);
      const entered = await waitEntered(page, name, true, 45000);
      const entryKind = CASE_HOUSES.has(name)
        ? 'case-preview (same as live: map case sheet, not 3D interior)'
        : name === 'teresa' || name === 'biblioteca'
          ? 'experience-sheet'
          : 'interior';
      results.push({
        test: `phone chained ${name}`,
        pass: entered.ok,
        mode: entered.mode,
        entryKind,
        reason: entered.ok ? null : entered.mode,
      });
      if (!entered.ok) {
        chainOk = false;
        break;
      }
      if (CASE_HOUSES.has(name)) {
        await page.evaluate(() => window.__playtestQa.dismissBuildingPanel());
        await page.waitForFunction(() => !document.querySelector('.building-panel--open'));
      } else if (name === 'teresa' || name === 'biblioteca') {
        await page.evaluate(() => window.__playtestQa.exitInterior());
        await page.waitForFunction(() => !window.__playtestQa?.getInteriorId?.());
      } else {
        await page.evaluate(() => window.__playtestQa.exitInterior());
        await page.waitForFunction(() => !window.__playtestQa?.getInteriorId?.());
      }
      await page.evaluate(() => window.__playtestQa.releaseMapTapGestureForQa?.());
      await wait(400);
    }
    results.push({
      test: 'phone 11/11 chained session (no reload)',
      pass: chainOk && chainNames.length === 11,
      count: chainNames.length,
    });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const names = await page.evaluate(() =>
      window.__playtestQa.getEnterableBuildings().map((b) => b.name).sort(),
    );
    for (const name of names) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
      const r = await enterDoorRealPointer(page, name, false);
      results.push({ test: `desktop door ${name}`, ...r });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  preview.kill();
}

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass);
process.exit(failed.length ? 1 : 0);
