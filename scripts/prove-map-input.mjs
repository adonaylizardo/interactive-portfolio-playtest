#!/usr/bin/env node
/** Prove map/UI input after building-map-labels pointer-events fix. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = `http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function accessTile(page, name) {
  return page.evaluate((n) => {
    const row = window.__playtestQa.getBuildingDoorTiles?.().find((r) => r.name === n);
    if (!row) return null;
    const d = row.door;
    return [d.x, d.y];
  }, name);
}

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

async function enterViaRealPointer(page, name, touch) {
  const acc = await accessTile(page, name);
  if (!acc) return { pass: false, reason: 'no tile' };
  await page.evaluate(
    ([tx, ty, n]) => {
      window.__playtestQa.setCharacterTile(tx, ty);
      window.__playtestQa.frameDoorForQa(n);
    },
    [...acc, name],
  );
  await wait(350);
  const door = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  const hit = await hitTest(page, door.x, door.y);
  const t0 = Date.now();
  if (touch) await page.touchscreen.tap(door.x, door.y);
  else await page.mouse.click(door.x, door.y);
  let inside = false;
  for (let i = 0; i < 16; i++) {
    await wait(250);
    inside = await page.evaluate(
      () => window.__playtestQa.isInInterior() || window.__playtestQa.isBuildingPanelOpen?.(),
    );
    if (inside) break;
  }
  if (!inside) {
    await page.keyboard.press('Enter');
    await wait(400);
    inside = await page.evaluate(
      () => window.__playtestQa.isInInterior() || window.__playtestQa.isBuildingPanelOpen?.(),
    );
  }
  return { pass: hit !== 'DIV.building-map-labels' && inside, hit, ms: Date.now() - t0, inside };
}

try {
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    results.push({ test: 'phone estudio door', ...(await enterViaRealPointer(page, 'estudio', true)) });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const enBtn = page.locator('[data-lang="en"]');
    const enBox = await enBtn.boundingBox();
    const enHit = enBox ? await hitTest(page, enBox.x + enBox.width / 2, enBox.y + enBox.height / 2) : null;
    await enBtn.click({ force: true });
    await wait(200);
    const langAfter = await page.evaluate(() => document.documentElement.lang);
    results.push({ test: 'phone EN toggle', enHit, pass: langAfter === 'en' && enHit !== 'DIV.building-map-labels' });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
    const names = await page.evaluate(() =>
      window.__playtestQa.getBuildingDoorTiles().map((r) => r.name),
    );
    const est = await enterViaRealPointer(page, 'estudio', false);
    results.push({ test: 'desktop estudio door', ...est, pass: est.pass && est.ms <= 2500 });
    for (const name of names) {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true);
      const r = await enterViaRealPointer(page, name, false);
      results.push({ test: `desktop door ${name}`, pass: r.pass });
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
