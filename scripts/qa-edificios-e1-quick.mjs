#!/usr/bin/env node
/** Smoke: 0 console errors, Estudio door click enters, Teresa park off footprint. */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4195/interactive-portfolio-playtest/preview-edificios/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const preview = spawn('node', ['scripts/serve-preview-edificios.mjs'], {
  stdio: 'ignore',
  env: { ...process.env, PREVIEW_PORT: '4195' },
});
await wait(800);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, {
  timeout: 60000,
});

const estudio = await page.evaluate(() => {
  const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === 'estudio');
  if (!b?.door) return null;
  return window.__playtestQa.doorScreenPoint('estudio');
});
if (!estudio) throw new Error('no estudio door point');
await page.mouse.click(estudio.x, estudio.y);
await page.waitForFunction(() => window.__playtestQa?.getInteriorId?.() === 'estudio', null, {
  timeout: 8000,
});

const park = await page.evaluate(() => {
  window.__playtestQa.exitInterior();
  const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === 'teresa');
  const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y, 'teresa');
  const inFp = (x, y) => x >= 26 && x <= 35 && y >= 8 && y <= 14;
  return sit && !inFp(sit.x, sit.y) ? 'ok' : 'bad';
});

await browser.close();
preview.kill();

if (errors.length) {
  console.error('console errors:', errors);
  process.exit(1);
}
if (park !== 'ok') {
  console.error('teresa park:', park);
  process.exit(1);
}
console.log('qa-edificios-e1-quick: PASS (estudio door click, 0 console errors, teresa park)');
