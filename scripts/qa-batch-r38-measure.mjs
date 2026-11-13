#!/usr/bin/env node
/** r38: desktop articulos meta, case card entry animation, reading deep-link toast. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4203;
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

async function measureDesktopMeta(page, w, lang) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => {
    document.querySelector('[data-action="show-panel"]')?.click();
  });
  await wait(400);
  await page.evaluate(() => document.querySelector('#chrome-articulos')?.scrollIntoView({ block: 'start' }));
  await wait(300);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#chrome-articulos .experience__row-meta')].slice(0, 5);
    return rows.map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent ?? '',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        ellipsis: cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
        textOverflow: cs.textOverflow,
      };
    });
  });
}

async function measurePhoneMeta(page, width, lang) {
  await page.setViewportSize({ width, height: 812 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(500);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#chrome-mobile-articulos .experience__row-meta')].slice(0, 3);
    return rows.map((el) => {
      const date = el.querySelector('.experience__row-meta-date');
      const dcs = date ? getComputedStyle(date) : null;
      return {
        text: el.textContent?.trim() ?? '',
        dateBreaksInternally: date ? date.scrollWidth > date.clientWidth + 1 : false,
        dateWhiteSpace: dcs?.whiteSpace ?? '',
      };
    });
  });
}

async function sampleCaseEntry(page, w) {
  await page.setViewportSize({ width: w, height: w === 1280 ? 800 : 900 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate(() => window.__playtestQa.setLang('es'));
  await wait(150);
  await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
  const samples = [];
  for (let t = 0; t <= 800; t += 50) {
    if (t > 0) await wait(50);
    const s = await page.evaluate(() => {
      const sheet = document.querySelector(
        'body:has(#game-canvas[data-interior]) .building-panel--preview .building-panel__sheet',
      );
      const r = sheet?.getBoundingClientRect();
      const cs = sheet ? getComputedStyle(sheet) : null;
      const layout = window.__playtestQa.interiorLayout();
      const char = window.__playtestQa.getInteriorCharTile?.();
      let matPt = null;
      if (layout) {
        const tx = layout.exitFace === '+x' ? layout.exit.x : layout.exit.x;
        const ty = layout.exitFace === '+x' ? layout.exit.y : layout.exit.y;
        matPt = window.__playtestQa.worldToClient((tx - ty) * 64, (tx + ty) * 32 + 32);
      }
      const cardRect = r
        ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, x: Math.round(r.x) }
        : null;
      const matHit =
        matPt && cardRect
          ? !(
              matPt.x < cardRect.left ||
              matPt.x > cardRect.right ||
              matPt.y < cardRect.top ||
              matPt.y > cardRect.bottom
            )
          : null;
      return {
        x: cardRect?.x ?? null,
        transform: cs?.transform ?? '',
        pointerEvents: cs?.pointerEvents ?? '',
        matOverlapsCard: matHit,
        charTile: char,
      };
    });
    samples.push({ ms: t, ...s });
  }
  const matClicks = {};
  for (const ms of [100, 300]) {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
    await wait(ms);
    const hit = await page.evaluate(() => {
      const layout = window.__playtestQa.interiorLayout();
      if (!layout) return { ok: false };
      const tx = layout.exitFace === '+x' ? layout.exit.x : layout.exit.x;
      const ty = layout.exitFace === '+x' ? layout.exit.y : layout.exit.y;
      const pt = window.__playtestQa.worldToClient((tx - ty) * 64, (tx + ty) * 32 + 32);
      const el = document.elementFromPoint(Math.round(pt.x), Math.round(pt.y));
      return {
        ok: el?.id === 'game-canvas' || el?.tagName === 'CANVAS',
        tag: el?.tagName ?? '',
        id: el?.id ?? '',
        cls: typeof el?.className === 'string' ? el.className.slice(0, 48) : '',
      };
    });
    matClicks[ms] = hit;
  }
  return { samples, matClicks };
}

async function measureReadingToast(page, hash) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await wait(800);
  return page.evaluate(() => {
    const toast = document.getElementById('playtest-toast');
    const text = toast?.textContent?.trim() ?? '';
    const visible =
      !!toast &&
      toast.classList.contains('playtest-toast--visible') &&
      !toast.classList.contains('playtest-toast--offline') &&
      getComputedStyle(toast).visibility !== 'hidden';
    const article = document.querySelector('.reading-view__article, .reading-view .case, .reading-view');
    return {
      toastVisible: visible,
      toastText: text.slice(0, 80),
      readingActive: document.body.dataset.reading === '1',
      hasArticle: !!article?.textContent?.trim(),
    };
  });
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const out = { desktopMeta: {}, phoneMeta: {}, caseEntry: {}, readingToast: {} };

try {
  const page = await browser.newPage();
  for (const w of [1280, 1440]) {
    for (const lang of ['es', 'en']) {
      out.desktopMeta[`${w}-${lang}`] = await measureDesktopMeta(page, w, lang);
    }
  }
  for (const width of [375, 390, 430]) {
    for (const lang of ['es', 'en']) {
      out.phoneMeta[`${width}-${lang}`] = await measurePhoneMeta(page, width, lang);
    }
  }
  out.caseEntry['1280'] = await sampleCaseEntry(page, 1280);
  out.caseEntry['1440'] = await sampleCaseEntry(page, 1440);
  out.readingToast.volaris = await measureReadingToast(page, '#/leer/volaris');
  out.readingToast.doesnotexist = await measureReadingToast(page, '#/leer/doesnotexist');
  await page.close();
} finally {
  await browser.close();
  if (stop) stop();
}

console.log(JSON.stringify(out, null, 2));
