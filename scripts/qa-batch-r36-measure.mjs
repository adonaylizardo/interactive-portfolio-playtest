#!/usr/bin/env node
/** r36 layout measurements (run after build + preview). */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4201;
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePreview() {
  if (process.env.QA_BASE_URL) return null;
  const child = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    await wait(250);
    try {
      if ((await fetch(BASE, { method: 'HEAD' })).ok) return () => child.kill('SIGTERM');
    } catch {
      /* retry */
    }
  }
  child.kill('SIGTERM');
  throw new Error('preview did not start');
}

async function measureSheetHeader(page, lang) {
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => {
    document.querySelector('[data-details]')?.click();
  });
  await wait(400);
  return page.evaluate(() => {
    const pin = document.querySelector('.chrome__intro-pinned');
    const grab = document.querySelector('.chrome__sheet-grab');
    const bar = grab?.querySelector('span');
    const row = document.querySelector('.chrome__intro-title-row');
    const close = document.querySelector('.chrome__intro-title-actions .chrome__intro-close');
    const r = (el) => el?.getBoundingClientRect();
    return {
      pinned: r(pin),
      grab: r(grab),
      bar: r(bar),
      titleRow: r(row),
      close: r(close),
    };
  });
}

async function measureClip(page, lang) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(500);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#chrome-mobile-articulos .experience__row-meta')];
    const roles = [...document.querySelectorAll('#chrome-mobile-intro .chrome__exp-role, .chrome__intro .chrome__exp-role')];
    const meta = rows.map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent?.trim() ?? '',
        sw: el.scrollWidth,
        cw: el.clientWidth,
        overflow: cs.textOverflow,
        ellipsis: cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
      };
    });
    const expRoles = roles.map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent?.trim() ?? '',
        sw: el.scrollWidth,
        cw: el.clientWidth,
        lines: el.getClientRects().length,
        overflow: cs.textOverflow,
      };
    });
    return { meta, expRoles };
  });
}

async function measureCaseCard(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
  await page.waitForSelector('.case-preview__read', { timeout: 15000 });
  const samples = [];
  for (const ms of [0, 150, 400]) {
    if (ms) await wait(ms);
    const box = await page.evaluate(() => {
      const el = document.querySelector(
        '.building-panel--preview.building-panel--peek .building-panel__sheet',
      );
      return el?.getBoundingClientRect();
    });
    samples.push({ ms, x: box?.x, y: box?.y, w: box?.width, h: box?.height, right: box?.right, bottom: box?.bottom });
  }
  const tile = await page.evaluate(() => {
    const p = window.__playtestQa.interiorTileScreenPoint?.(5, 2);
    const el = p ? document.elementFromPoint(p.x, p.y) : null;
    return { pt: p, hit: el?.id ?? el?.className?.slice?.(0, 40) };
  });
  return { samples, tile52: tile };
}

async function searchEs(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate(() => window.__playtestQa.setLang('es'));
  await wait(200);
  return page.evaluate(() => {
    const groups = window.__playtestQa?.searchForQa?.('volaris') ?? [];
    return groups.map((g) => ({ label: g.label, titles: g.items.map((i) => i.title).slice(0, 3) }));
  });
}

const stop = await ensurePreview();
const browser = await launchBrowser(chromium);
const out = { header: {}, clip: {}, card: {}, search: null };
try {
  for (const [w, h, tag] of [
    [375, 812, '375'],
    [390, 844, '390'],
  ]) {
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    for (const lang of ['es', 'en']) {
      await page.goto(BASE, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
      out.header[`${tag}-${lang}`] = await measureSheetHeader(page, lang);
      out.clip[`${tag}-${lang}`] = await measureClip(page, lang);
    }
    await page.close();
  }
  const page430 = await browser.newPage({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  for (const lang of ['es', 'en']) {
    await page430.goto(BASE, { waitUntil: 'load' });
    await page430.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    out.clip[`430-${lang}`] = await measureClip(page430, lang);
  }
  await page430.close();

  const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  out.card['1440'] = await measureCaseCard(desk, 1440, 900);
  await desk.close();
  const desk2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  out.card['1280'] = await measureCaseCard(desk2, 1280, 800);
  out.search = await searchEs(await browser.newPage({ viewport: { width: 1280, height: 800 } }));
} finally {
  await browser.close();
  if (stop) stop();
}
console.log(JSON.stringify(out, null, 2));
