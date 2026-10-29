#!/usr/bin/env node
/** r40: desktop exp role wrap, case card entry animation, phone 44px hit areas. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4205;
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

function hitAt(page, x, y) {
  return page.evaluate(
    ([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return el?.tagName ?? '';
    },
    [x, y],
  );
}

async function measureExpRoles(page, w, lang) {
  await page.setViewportSize({ width: w, height: w === 1280 ? 800 : 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-action="show-panel"]')?.click());
  await wait(400);
  return page.evaluate(() => {
    const roles = [...document.querySelectorAll('#chrome-experiencia .chrome__exp-role, #chrome-experiencia-mobile .chrome__exp-role')];
    return roles.map((el) => {
      const cs = getComputedStyle(el);
      const lines = Math.round(el.getBoundingClientRect().height / (parseFloat(cs.lineHeight) || 16));
      return {
        id: el.closest('.chrome__exp-row')?.querySelector('.chrome__exp-name')?.textContent?.trim().slice(0, 24) ?? '',
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        lines,
        ellipsis: cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
        whiteSpace: cs.whiteSpace,
      };
    });
  });
}

async function sampleCaseEntry(page, w, lang) {
  await page.setViewportSize({ width: w, height: w === 1280 ? 800 : 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((l) => window.__playtestQa.setLang(l), lang);
  await wait(150);
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  const samples = [];
  await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
  for (let t = 0; t <= 350; t += 50) {
    if (t > 0) await wait(50);
    const s = await page.evaluate((ms) => {
      const panel = document.querySelector('.building-panel--preview');
      const sheet = document.querySelector(
        'body:has(#game-canvas[data-interior]) .building-panel--preview.building-panel--peek .building-panel__sheet',
      );
      const r = sheet?.getBoundingClientRect();
      const cs = sheet ? getComputedStyle(sheet) : null;
      const m = cs?.transform?.match(/matrix\(([^)]+)\)/);
      const tx = m ? parseFloat(m[1].split(',')[4]) : 0;
      return {
        ms,
        x: r ? Math.round(r.x) : null,
        y: r ? Math.round(r.y) : null,
        w: r ? Math.round(r.width) : null,
        h: r ? Math.round(r.height) : null,
        radius: cs?.borderRadius ?? '',
        transform: cs?.transform ?? '',
        translateX: tx,
        caseEnter: panel?.classList.contains('building-panel--case-enter') ?? false,
        open: panel?.classList.contains('building-panel--open') ?? false,
      };
    }, t);
    samples.push(s);
  }
  await wait(400);
  const settled = await page.evaluate(() => {
    const sheet = document.querySelector(
      'body:has(#game-canvas[data-interior]) .building-panel--preview.building-panel--peek .building-panel__sheet',
    );
    const r = sheet?.getBoundingClientRect();
    const cs = sheet ? getComputedStyle(sheet) : null;
    return {
      x: r ? Math.round(r.x) : null,
      y: r ? Math.round(r.y) : null,
      w: r ? Math.round(r.width) : null,
      h: r ? Math.round(r.height) : null,
      radius: cs?.borderRadius ?? '',
      transform: cs?.transform ?? '',
    };
  });
  await page.locator('.case-preview__read, [data-read]').first().click();
  await wait(400);
  await page.locator('.case-read__expand').first().click();
  await wait(400);
  const expanded = await page.evaluate(() => {
    const sheet = document.querySelector('.building-panel--preview.building-panel--expanded .building-panel__sheet');
    const r = sheet?.getBoundingClientRect();
    const col = document.querySelector('.building-panel--expanded .building-panel__body-wrap');
    return {
      sheet: r
        ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
        : null,
      col: col
        ? {
            w: Math.round(col.getBoundingClientRect().width),
            scrollH: col.scrollHeight,
            clientH: col.clientHeight,
          }
        : null,
    };
  });
  return { samples, settled, expanded };
}

async function measurePhoneTargets(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await wait(300);
  await page.locator('[data-details]').click();
  await wait(500);
  const result = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = (lx, ly) => {
        const x = Math.round(r.left + lx);
        const y = Math.round(r.top + ly);
        const t = document.elementFromPoint(x, y);
        return t === el || el.contains(t);
      };
      const cx = r.width / 2;
      const cy = r.height / 2;
      return {
        visualW: Math.round(r.width),
        visualH: Math.round(r.height),
        hitCenter: hit(cx, cy),
        hitOuterTL: hit(-2, -2),
        hitOuterBR: hit(r.width + 1, r.height + 1),
      };
    };
    return {
      search: probe('[data-action="search"]'),
      lang: probe('.chrome__phone-topbar .chrome__lang-toggle'),
      close: probe('.chrome__intro-title-actions .chrome__intro-close'),
      cv: probe('.chrome__ctas .ui-btn--primary'),
      contact: probe('.chrome__ctas [data-action="about-contact"]'),
    };
  });
  await ctx.close();
  return result;
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const out = { expRoles: {}, caseEntry: {}, phoneTargets: {}, consoleErrors: [] };

try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') out.consoleErrors.push(msg.text().slice(0, 120));
  });
  for (const w of [1280, 1440]) {
    for (const lang of ['es', 'en']) {
      out.expRoles[`${w}-${lang}`] = await measureExpRoles(page, w, lang);
    }
    out.caseEntry[`${w}-es`] = await sampleCaseEntry(page, w, 'es');
    out.caseEntry[`${w}-en`] = await sampleCaseEntry(page, w, 'en');
  }
  for (const width of [375, 390, 430]) {
    out.phoneTargets[width] = await measurePhoneTargets(browser, width);
  }
  await page.close();
} finally {
  await browser.close();
  if (stop) stop();
}

console.log(JSON.stringify(out, null, 2));
