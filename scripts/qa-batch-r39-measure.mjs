#!/usr/bin/env node
/** r39: case sheet rects (read/expand), articulos meta, invalid #/leer toast once. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4204;
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

function sheetRect(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector('.building-panel--preview .building-panel__sheet');
    const r = sheet?.getBoundingClientRect();
    const cs = sheet ? getComputedStyle(sheet) : null;
    const col =
      document.querySelector('.building-panel--expanded .building-panel__body-wrap') ??
      document.querySelector('.case-read__page');
    const colR = col?.getBoundingClientRect();
    return {
      sheet: r
        ? {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            radius: cs?.borderRadius ?? '',
            pointerEvents: cs?.pointerEvents ?? '',
            transform: cs?.transform ?? '',
          }
        : null,
      column: colR
        ? {
            w: Math.round(colR.width),
            scrollH: col?.scrollHeight ?? 0,
            clientH: col?.clientHeight ?? 0,
            overflowY: col ? getComputedStyle(col).overflowY : '',
          }
        : null,
      expanded: document.querySelector('.building-panel--preview')?.classList.contains('building-panel--expanded'),
      peek: document.querySelector('.building-panel--preview')?.classList.contains('building-panel--peek'),
    };
  });
}

async function measureDesktopMeta(page, w, lang) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-action="show-panel"]')?.click());
  await wait(400);
  await page.evaluate(() => document.querySelector('#chrome-articulos')?.scrollIntoView({ block: 'start' }));
  await wait(300);
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#chrome-articulos .experience__row-meta')].slice(0, 5);
    return rows.map((el) => ({
      text: el.textContent ?? '',
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
    }));
  });
}

async function caseFlow(page, { w, h, lang, interior, peekOnly = false }) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa.setLang(l), lang);
  await wait(150);
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  await wait(200);
  if (interior) {
    await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
    await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
    await wait(600);
  } else {
    await page.evaluate(() => {
      document.querySelector('[data-action="show-panel"]')?.click();
      document.querySelector('[data-dock="casos"]')?.click();
    });
    await wait(500);
    await page.evaluate(() => document.querySelector('.chrome__case-row[data-locate="volaris"]')?.click());
    await wait(500);
  }
  const peek = await sheetRect(page);
  if (peekOnly) return { peek, read: null, expanded: null, closeBox: null, afterClose: null };
  await page.locator('.case-preview__read, [data-read]').first().click();
  await wait(500);
  const read = await sheetRect(page);
  const expand = page.locator('.case-read__expand').first();
  await expand.click({ timeout: 8000 });
  await wait(450);
  const expanded = await sheetRect(page);
  const closeBox = await page.locator('.case-read__x').first().boundingBox();
  await page.locator('.case-read__x').first().click();
  await wait(350);
  const afterClose = await page.evaluate(
    () => document.querySelector('.building-panel--preview')?.classList.contains('building-panel--expanded') ?? false,
  );
  return { peek, read, expanded, closeBox, afterClose };
}

async function measureInvalidToast(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}#/leer/doesnotexist`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await wait(900);
  return page.evaluate(() => {
    const toast = document.getElementById('playtest-toast');
    const visible = toast?.classList.contains('playtest-toast--visible');
    return {
      toastFlashCount: window.__toastFlashCount ?? 0,
      visible,
      text: toast?.textContent?.trim().slice(0, 80) ?? '',
    };
  });
}

async function measurePhone375(page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
  await wait(800);
  return sheetRect(page);
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const out = { desktopMeta: {}, caseFlows: {}, readingToast: {}, phone375: null };

try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__toastFlashCount = 0;
    const watch = () => {
      const el = document.getElementById('playtest-toast');
      if (!el) return;
      let was = el.classList.contains('playtest-toast--visible');
      const obs = new MutationObserver(() => {
        const now = el.classList.contains('playtest-toast--visible');
        if (now && !was) window.__toastFlashCount = (window.__toastFlashCount ?? 0) + 1;
        was = now;
      });
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
    else watch();
  });
  for (const w of [1280, 1440]) {
    for (const lang of ['es', 'en']) {
      out.desktopMeta[`${w}-${lang}`] = await measureDesktopMeta(page, w, lang);
    }
  }
  for (const w of [1280, 1440]) {
    for (const lang of ['es', 'en']) {
      out.caseFlows[`${w}-${lang}-interior`] = await caseFlow(page, {
        w,
        h: w === 1280 ? 800 : 900,
        lang,
        interior: true,
      });
    }
  }
  out.caseFlows['1280-es-split-peek'] = await caseFlow(page, {
    w: 1280,
    h: 800,
    lang: 'es',
    interior: false,
    peekOnly: true,
  });
  out.readingToast = await measureInvalidToast(page);
  out.phone375 = await measurePhone375(page);
  await page.close();
} finally {
  await browser.close();
  if (stop) stop();
}

console.log(JSON.stringify(out, null, 2));
