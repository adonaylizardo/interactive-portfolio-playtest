#!/usr/bin/env node
/** Every enterable building: walk in/out desktop + phone 390 touch; 0 console errors; van park check. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4195;
const BASE = `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CASE_HOUSES = new Set(['volaris', 'bain', 'mentoria', 'finoa', 'pg']);

function trackConsole(page) {
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  page.on('pageerror', (e) => logs.push(String(e)));
  return logs;
}

async function waitEntered(page, name, timeoutMs = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const state = await page.evaluate((n) => ({
      interior: window.__playtestQa.getInteriorId?.(),
      preview: !!document.querySelector('.building-panel--preview.building-panel--open'),
      exp: !!document.querySelector('.building-panel--experience.building-panel--open'),
    }), name);
    if (CASE_HOUSES.has(name) && state.preview) return true;
    if (!CASE_HOUSES.has(name) && state.interior === name) return true;
    if ((name === 'teresa' || name === 'biblioteca') && state.exp) return true;
    await wait(200);
  }
  return false;
}

async function enterBuilding(page, name, touch) {
  if (touch) {
    const ok = await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
    if (!ok) throw new Error(`prepareDoorEntryForQa(${name}) failed`);
    await wait(350);
    await page.evaluate(() => window.__playtestQa.releaseMapTapGestureForQa?.());
    const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
    if (!pt) throw new Error(`doorScreenPoint(${name}) null`);
    await page.touchscreen.tap(pt.x, pt.y);
    await wait(300);
  } else {
    const ok = await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
    if (!ok) throw new Error(`prepareDoorEntryForQa(${name}) failed`);
    await wait(450);
    const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
    if (!pt) throw new Error(`doorScreenPoint(${name}) null`);
    await page.mouse.click(pt.x, pt.y);
  }
  if (!(await waitEntered(page, name))) {
    throw new Error(`enter timeout for ${name}`);
  }
}

async function expandExperienceSheet(page) {
  const title = page.locator('.exp-mobile-chrome__title').first();
  if (await title.isVisible().catch(() => false)) {
    const box = await title.boundingBox();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await wait(400);
  }
  const grab = page.locator('.exp-mobile-chrome__grab').first();
  const box = await grab.boundingBox();
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 120, { steps: 10 });
    await page.mouse.up();
    await wait(500);
  }
}

async function leaveBuilding(page, name, touch) {
  if (CASE_HOUSES.has(name)) {
    await page.evaluate(() => window.__playtestQa.dismissBuildingPanel());
    await page.waitForFunction(
      () => !document.querySelector('.building-panel--open'),
      null,
      { timeout: 15000 },
    );
    await page.evaluate(() => window.__playtestQa.releaseMapTapGestureForQa?.());
  } else {
    if (touch && (name === 'teresa' || name === 'biblioteca')) {
      await expandExperienceSheet(page);
      await wait(200);
      const salir = page.locator('.building-panel__exit').first();
      if (await salir.isVisible()) {
        const b = await salir.boundingBox();
        if (b) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      } else {
        await page.evaluate(() => window.__playtestQa.exitInterior());
      }
    } else {
      await page.evaluate(() => window.__playtestQa.exitInterior());
    }
    await page.waitForFunction(() => !window.__playtestQa?.getInteriorId?.(), null, { timeout: 30000 });
  }
  await wait(400);
}

async function enterExit(page, name, touch) {
  await enterBuilding(page, name, touch);
  await wait(400);
  await leaveBuilding(page, name, touch);
}

async function runSuite(page, tag, touch) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  const names = await page.evaluate(() =>
    window.__playtestQa.getEnterableBuildings().map((b) => b.name).sort(),
  );
  for (const name of names) {
    await enterExit(page, name, touch);
  }
  return names;
}

const preview = spawn(process.execPath, ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT) },
});
await wait(1200);

const errors = [];
const browser = await launchBrowser(chromium);
try {
  for (const { tag, viewport, touch } of [
    { tag: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
    { tag: 'phone390', viewport: { width: 390, height: 844 }, touch: true },
  ]) {
    const ctx = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await ctx.newPage();
    const cerr = trackConsole(page);
    try {
      const names = await runSuite(page, tag, touch);
      console.log(`${tag}: ${names.length} buildings — ${names.join(', ')}`);
      if (cerr.length) errors.push(`${tag} console: ${cerr.join(' | ')}`);
    } catch (e) {
      errors.push(`${tag}: ${e}`);
    } finally {
      await ctx.close();
    }
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__playtestQa.setLayout('map'));
    await wait(400);
    try {
      const ok = await page.evaluate(() => window.__playtestQa.prepareDoorEntryForQa('teresa'));
      if (!ok) errors.push('phone-map-dock: prepare failed');
      else {
        await wait(350);
        await page.evaluate(() => window.__playtestQa.releaseMapTapGestureForQa?.());
        const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('teresa'));
        if (!pt) errors.push('phone-map-dock: doorScreenPoint null');
        else await page.touchscreen.tap(pt.x, pt.y);
      }
      const dockFailed = errors.some((e) => e.startsWith('phone-map-dock'));
      if (!dockFailed && !(await waitEntered(page, 'teresa'))) {
        errors.push('phone-map-dock: enter timeout teresa');
      } else if (!dockFailed) {
        console.log('phone-map-dock: teresa enter ok (map layout, touch path)');
      }
    } catch (e) {
      errors.push(`phone-map-dock: ${e}`);
    }
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  const overlap = await page.evaluate(() => {
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === 'teresa');
    if (!b?.door) return 'no door';
    const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y, 'teresa');
    if (!sit) return 'no sit';
    const inFp = (x, y) => x >= 26 && x <= 35 && y >= 8 && y <= 14;
    if (inFp(sit.x, sit.y)) return `sit on footprint ${sit.x},${sit.y}`;
    return 'ok';
  });
  if (overlap !== 'ok') errors.push(`van teresa park: ${overlap}`);
  else console.log('van teresa park: ok');
  await ctx.close();
} finally {
  await browser.close();
  preview.kill();
}

if (errors.length) {
  console.error('verify-edificios-full-drive FAILED:\n' + errors.map((e) => `- ${e}`).join('\n'));
  process.exit(1);
}
console.log('verify-edificios-full-drive: ok');
