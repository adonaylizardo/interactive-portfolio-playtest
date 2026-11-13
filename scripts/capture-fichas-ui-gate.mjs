#!/usr/bin/env node
/**
 * Place-card UI gate: 3 landmarks × 3 viewports + audio behaviour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/fichas-ui-gate');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { id: 'telefono-vertical', width: 390, height: 844 },
  { id: 'telefono-horizontal', width: 844, height: 390 },
  { id: 'desktop', width: 1280, height: 800 },
];

const PLACES = ['catedral', 'sambil', 'flor'];

async function dismissWelcome(page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* private mode */
    }
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__playtestQa?.openPlaceCard === 'function', {
    timeout: 180000,
  });
  await page.waitForFunction(() => document.getElementById('game-canvas')?.dataset?.zoom, {
    timeout: 180000,
  });
  const welcome = page.locator('[data-boot-start]');
  if (await welcome.isVisible().catch(() => false)) await welcome.click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 }).catch(() => {});
}

async function openPlace(page, id) {
  await page.evaluate((placeId) => {
    window.__playtestQa?.openPlaceCard?.(placeId);
  }, id);
  await page.waitForSelector('.place-card--open', { timeout: 15000 });
  await page.waitForTimeout(400);
}

async function cropCard(page, outPath) {
  const sheet = page.locator('.place-card__sheet');
  await sheet.screenshot({ path: outPath });
}

async function proveAudio(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await dismissWelcome(page);
  await openPlace(page, 'sambil');
  await page.evaluate(() => window.__playtestQa?.qaPlayPlaceVoice?.('10-sambil'));
  await page.waitForFunction(
    () => {
      const p = window.__playtestQa?.placeVoiceProgress?.();
      return p?.voiceId === '10-sambil' && p.playing;
    },
    { timeout: 12000 },
  ).catch(() => {});
  const playing1 = await page.evaluate(() => {
    const p = window.__playtestQa?.placeVoiceProgress?.();
    return p?.voiceId === '10-sambil' && p.playing;
  });
  await page.locator('[data-place-play]').click();
  await page.waitForTimeout(200);
  const paused = await page.evaluate(() => !document.querySelector('.place-card--playing'));
  await page.locator('[data-place-play]').click();
  await page.waitForTimeout(300);
  await openPlace(page, 'catedral');
  const sambilStopped = await page.evaluate(() => {
    const qa = window.__playtestQa;
    return qa?.placeVoiceProgress?.()?.voiceId !== '10-sambil';
  });
  return { playing1, paused, sambilStopped, errors };
}

async function main() {
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  for (const vp of VIEWPORTS) {
    for (const place of PLACES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.width <= 430 ? 3 : 1,
        locale: 'en-US',
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(180000);
      await dismissWelcome(page);
      await openPlace(page, place);
      await cropCard(page, path.join(OUT, `${vp.id}_${place}.png`));
      await ctx.close();
    }
  }

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  const audio = await proveAudio(page);
  await browser.close();

  console.log('Captures →', OUT);
  console.log('Audio:', JSON.stringify(audio, null, 2));
  if (audio.errors.length) process.exit(1);
  if (!audio.playing1 || !audio.paused || !audio.sambilStopped) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
