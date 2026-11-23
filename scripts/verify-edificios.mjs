#!/usr/bin/env node
/**
 * Playwright verification for Teatro (Talks) + Biblioteca (Writings).
 * Usage: npm run build && node scripts/verify-edificios.mjs
 * Env: QA_BASE_URL (defaults to local preview with base path)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW_PORT = 4195;
const BASE =
  process.env.QA_BASE_URL ??
  `http://127.0.0.1:${PREVIEW_PORT}/interactive-portfolio-playtest/preview-edificios/`;
const OUT = path.join(ROOT, 'artifacts', 'verify-edificios');
const PIXEL = path.join(ROOT, 'portfolio');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const pixelNotes = [];

function pixelDiff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { pct: 100, diff: a.width * a.height };
  let diff = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    if (
      Math.abs(a.data[j] - b.data[j]) > 8 ||
      Math.abs(a.data[j + 1] - b.data[j + 1]) > 8 ||
      Math.abs(a.data[j + 2] - b.data[j + 2]) > 8
    ) {
      diff++;
    }
  }
  return { pct: (diff / n) * 100, diff };
}

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

async function compareShot(actualPath, refPath, label) {
  if (!fs.existsSync(refPath)) {
    errors.push(`${label}: missing Pixel reference ${refPath}`);
    return;
  }
  const a = readPng(actualPath);
  const b = readPng(refPath);
  if (a.width !== b.width || a.height !== b.height) {
    pixelNotes.push(
      `${label}: size ${a.width}×${a.height} vs Pixel ${b.width}×${b.height} — not comparable pixel-for-pixel`,
    );
    return;
  }
  const d = pixelDiff(a, b);
  const line = `${label}: ${d.pct.toFixed(2)}% pixels differ (${d.diff} px)`;
  if (d.pct > 8) pixelNotes.push(`${line} — NOT a match vs Pixel frame`);
  else console.log(`OK ${line}`);
}

async function consoleErrors(page) {
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') logs.push(msg.text());
  });
  return logs;
}

async function walkEnter(page, building) {
  await page.evaluate((name) => {
    window.__playtestQa.setCharacterTile(31, 37);
    window.__playtestQa.frameDoorForQa(name);
    window.__playtestQa.walkToBuilding(name);
  }, building);
  await page.waitForFunction(
    (name) => window.__playtestQa?.getInteriorId?.() === name,
    building,
    { timeout: 60000 },
  );
}

async function driveEnter(page, building) {
  await page.evaluate((name) => {
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === name);
    if (!b?.door) throw new Error(`no door for ${name}`);
    window.__playtestQa.setCharacterTile(31, 37);
    window.__playtestQa.jacGetIn();
    window.__playtestQa.tapBuildingDoor(name);
  }, building);
  await page.waitForFunction(
    (name) => window.__playtestQa?.getInteriorId?.() === name,
    building,
    { timeout: 120000 },
  );
}

async function flowBuilding(page, tag, building, refs, touch = false) {
  fs.mkdirSync(path.join(OUT, tag), { recursive: true });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
    timeout: 60000,
  });
  await page.screenshot({ path: path.join(OUT, tag, '1-map.png'), fullPage: false });

  await walkEnter(page, building);
  await wait(600);
  await page.screenshot({ path: path.join(OUT, tag, '2-list-walk.png'), fullPage: false });
  if (touch) await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
  await page.evaluate(() => document.querySelector('.experience__row')?.click());
  await wait(400);
  await page.screenshot({ path: path.join(OUT, tag, '3-detail-walk.png'), fullPage: false });
  await page.evaluate(() => window.__playtestQa.exitInterior());
  await wait(800);

  await driveEnter(page, building);
  await wait(600);
  await page.screenshot({ path: path.join(OUT, tag, '4-list-drive.png'), fullPage: false });
  if (touch) await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
  await page.evaluate(() => document.querySelector('.experience__row')?.click());
  await wait(400);
  await page.screenshot({ path: path.join(OUT, tag, '5-detail-drive.png'), fullPage: false });
  await page.evaluate(() => window.__playtestQa.exitInterior());
  await wait(500);

  if (refs.map) await compareShot(path.join(OUT, tag, '1-map.png'), refs.map, `${tag} map`);
  if (refs.list) await compareShot(path.join(OUT, tag, '2-list-walk.png'), refs.list, `${tag} list`);
  if (refs.detail)
    await compareShot(path.join(OUT, tag, '3-detail-walk.png'), refs.detail, `${tag} detail`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let preview;
  if (!process.env.QA_BASE_URL) {
    preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
      cwd: ROOT,
      stdio: 'ignore',
      env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT) },
    });
    await wait(800);
  }

  const browser = await launchBrowser(chromium);
  try {
    for (const { tag, building, viewport, touch, refs } of [
      {
        tag: 'desktop-talks',
        building: 'teresa',
        viewport: { width: 1280, height: 800 },
        touch: false,
        refs: {
          map: path.join(PIXEL, 'talks-ui', 'desktop-1-map.png'),
          list: path.join(PIXEL, 'talks-ui', 'desktop-2-list.png'),
          detail: path.join(PIXEL, 'talks-ui', 'desktop-3-player.png'),
        },
      },
      {
        tag: 'phone-talks',
        building: 'teresa',
        viewport: devices['iPhone 13'].viewport,
        touch: true,
        refs: {
          map: path.join(PIXEL, 'talks-ui', 'phone-1-map.png'),
          list: path.join(PIXEL, 'talks-ui', 'phone-2-list.png'),
          detail: path.join(PIXEL, 'talks-ui', 'phone-3-player.png'),
        },
      },
      {
        tag: 'desktop-writings',
        building: 'biblioteca',
        viewport: { width: 1280, height: 800 },
        touch: false,
        refs: {
          map: path.join(PIXEL, 'writings-ui', 'desktop-1-map.png'),
          list: path.join(PIXEL, 'writings-ui', 'desktop-2-list.png'),
          detail: path.join(PIXEL, 'writings-ui', 'desktop-3-reader.png'),
        },
      },
      {
        tag: 'phone-writings',
        building: 'biblioteca',
        viewport: devices['iPhone 13'].viewport,
        touch: true,
        refs: {
          map: path.join(PIXEL, 'writings-ui', 'phone-1-map.png'),
          list: path.join(PIXEL, 'writings-ui', 'phone-2-list.png'),
          detail: path.join(PIXEL, 'writings-ui', 'phone-3-reader.png'),
        },
      },
    ]) {
      const ctx = await browser.newContext({
        viewport,
        hasTouch: touch,
        isMobile: touch,
      });
      const page = await ctx.newPage();
      const cerr = await consoleErrors(page);
      try {
        await flowBuilding(page, tag, building, refs, touch);
        if (cerr.length) errors.push(`${tag}: console errors: ${cerr.join(' | ')}`);
      } catch (e) {
        errors.push(`${tag}: ${e}`);
      } finally {
        await ctx.close();
      }
    }

    // Van must not park on building footprint (Teresa door).
    try {
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
      if (overlap !== 'ok') errors.push(`teresa park: ${overlap}`);
      await ctx.close();
    } catch (e) {
      errors.push(`teresa park check: ${e}`);
    }
  } finally {
    await browser.close();
    preview?.kill();
  }

  if (pixelNotes.length) {
    console.log('\nPixel vs Pixel frames (honest diff):');
    for (const n of pixelNotes) console.log(`- ${n}`);
  }
  if (errors.length) {
    console.error('verify-edificios FAILED:\n' + errors.map((e) => `- ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('verify-edificios: functional checks passed');
}

main();
