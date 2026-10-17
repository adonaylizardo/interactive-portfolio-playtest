#!/usr/bin/env node
/** Every enterable building: walk in/out desktop + phone 390 touch; 0 console errors; van park check. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
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

async function enterBuilding(page, name) {
  await page.evaluate((n) => {
    window.__playtestQa.setCharacterTile(31, 37);
    window.__playtestQa.frameDoorForQa(n);
  }, name);
  await wait(350);
  const tapped = await page.evaluate((n) => window.__playtestQa.tapBuildingDoor(n), name);
  if (!tapped) {
    await page.evaluate((n) => window.__playtestQa.walkToBuilding(n), name);
  }
  if (CASE_HOUSES.has(name)) {
    await page.waitForFunction(
      () => document.querySelector('.building-panel--preview.building-panel--open'),
      null,
      { timeout: 60000 },
    );
  } else {
    await page.waitForFunction(
      (n) => window.__playtestQa?.getInteriorId?.() === n,
      name,
      { timeout: 120000 },
    );
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
  } else {
    if (touch && (name === 'teresa' || name === 'biblioteca')) {
      await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
      await wait(200);
    }
    await page.evaluate(() => window.__playtestQa.exitInterior());
    await page.waitForFunction(() => !window.__playtestQa?.getInteriorId?.(), null, { timeout: 30000 });
  }
  await wait(400);
}

async function enterExitDesktop(page, name) {
  await enterBuilding(page, name);
  await wait(400);
  await leaveBuilding(page, name, false);
}

async function enterExitTouch(page, name) {
  await enterBuilding(page, name);
  await wait(400);
  await leaveBuilding(page, name, true);
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
    if (touch) await enterExitTouch(page, name);
    else await enterExitDesktop(page, name);
  }
  return names;
}

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
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
    {
      tag: 'phone390',
      viewport: { width: 390, height: 844 },
      touch: true,
    },
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
