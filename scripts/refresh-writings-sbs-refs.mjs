#!/usr/bin/env node
/** Refresh writings list/reading golden PNGs from the live preview (real section counts + tuned layout). */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIGMA = path.join(ROOT, 'public', 'figma-specs');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizePhone(png) {
  if (png.width === 750 && png.height === 1624) {
    const out = new PNG({ width: 375, height: 812 });
    for (let y = 0; y < 812; y++) {
      for (let x = 0; x < 375; x++) {
        const j = (y * 2 * 750 + x * 2) * 4;
        const i = (y * 375 + x) * 4;
        out.data[i] = png.data[j];
        out.data[i + 1] = png.data[j + 1];
        out.data[i + 2] = png.data[j + 2];
        out.data[i + 3] = png.data[j + 3];
      }
    }
    return out;
  }
  return png;
}

function writePng(file, png) {
  fs.writeFileSync(file, PNG.sync.write(png));
}

async function enterPhoneBuilding(page, name) {
  await page.evaluate(() => window.__playtestQa.collapseChecklistForQa?.());
  await wait(150);
  await page.evaluate((n) => window.__playtestQa.prepareDoorEntryForQa(n), name);
  await wait(450);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForFunction(
    (n) => {
      const interior = window.__playtestQa.getInteriorId?.();
      const exp = document.querySelector('.building-panel--experience.building-panel--open');
      return interior === n || !!exp;
    },
    name,
    { timeout: 45000 },
  );
}

async function expandPhoneSheet(page) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__playtestQa.expandInteriorSheet?.());
    await wait(200);
  }
}

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(1500);

const browser = await launchBrowser(chromium);

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__playtestQa.setLayout?.('split'));
    await page.evaluate(() => window.__playtestQa.setLang?.('en'));
    await wait(250);
    await page.evaluate(() => window.__playtestQa.enterInterior('biblioteca'));
    await wait(900);
    const buf = await page.screenshot();
    writePng(path.join(FIGMA, 'writings-desktop-list.png'), PNG.sync.read(buf));
    await ctx.close();
    console.log('Updated writings-desktop-list.png');
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
      timeout: 60000,
    });
    await page.evaluate(() => window.__playtestQa.setLang?.('en'));
    await wait(250);
    await enterPhoneBuilding(page, 'biblioteca');
    await expandPhoneSheet(page);
    await wait(400);
    let buf = await page.screenshot();
    writePng(path.join(FIGMA, 'writings-phone-list.png'), normalizePhone(PNG.sync.read(buf)));
    await page.evaluate(() => document.querySelector('.experience__row')?.click());
    await wait(500);
    buf = await page.screenshot();
    writePng(path.join(FIGMA, 'writings-phone-reading.png'), normalizePhone(PNG.sync.read(buf)));
    await ctx.close();
    console.log('Updated writings-phone-list.png, writings-phone-reading.png');
  }
} finally {
  await browser.close();
  preview.kill();
}
