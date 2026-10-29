#!/usr/bin/env node
/** r41 verification: about-panel hits, intro CTA visuals, desktop exp roles. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4207;
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

function grid9Hits(el) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const half = 22;
  const inset = 2;
  const left = cx - half;
  const top = cy - half;
  const right = cx + half;
  const bottom = cy + half;
  const pts = [
    [left + inset, top + inset],
    [cx, top + inset],
    [right - inset, top + inset],
    [left + inset, cy],
    [cx, cy],
    [right - inset, cy],
    [left + inset, bottom - inset],
    [cx, bottom - inset],
    [right - inset, bottom - inset],
  ];
  let hits = 0;
  const misses = [];
  for (const [x, y] of pts) {
    const t = document.elementFromPoint(Math.round(x), Math.round(y));
    const ok = t === el || el.contains(t);
    if (ok) hits += 1;
    else misses.push({ x: Math.round(x), y: Math.round(y), tag: t?.className?.slice?.(0, 40) ?? t?.tagName });
  }
  return {
    visual: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    hits,
    misses,
  };
}

async function measureAboutPanel(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 60000 });
  await wait(300);
  await page.evaluate(() => {
    document.querySelector('[data-action="intro-close"]')?.click();
  });
  await wait(200);
  await page.evaluate(() => {
    document.querySelector('.chrome__dock [data-action="contact"]')?.click();
  });
  await wait(600);
  return page.evaluate(() => {
    const close = document.querySelector('[data-about-close]');
    const cv = document.querySelector('.about-panel__cta-row .ui-btn--primary');
    const contact = document.querySelector('.about-panel__cta-row [data-about-mailto="contact"]');
    const probe = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const half = 22;
      const inset = 2;
      const left = cx - half;
      const top = cy - half;
      const right = cx + half;
      const bottom = cy + half;
      const pts = [
        [left + inset, top + inset],
        [cx, top + inset],
        [right - inset, top + inset],
        [left + inset, cy],
        [cx, cy],
        [right - inset, cy],
        [left + inset, bottom - inset],
        [cx, bottom - inset],
        [right - inset, bottom - inset],
      ];
      let hits = 0;
      const misses = [];
      for (const [x, y] of pts) {
        const t = document.elementFromPoint(Math.round(x), Math.round(y));
        const ok = t === el || el.contains(t);
        if (ok) hits += 1;
        else misses.push({ x: Math.round(x), y: Math.round(y), cls: typeof t?.className === 'string' ? t.className.slice(0, 48) : t?.tagName });
      }
      return { visual: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, hits, misses };
    };
    return { close: probe(close), cv: probe(cv), contact: probe(contact) };
  });
}

async function measureIntroCtas(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 60000 });
  await page.locator('[data-details]').click();
  await wait(500);
  return page.evaluate(() => {
    const row = document.querySelector('.chrome__intro .chrome__ctas');
    const btns = [...document.querySelectorAll('.chrome__intro .chrome__ctas .ui-btn')].map((el) => {
      const r = el.getBoundingClientRect();
      return { action: el.getAttribute('data-action') ?? 'cv', w: Math.round(r.width), h: Math.round(r.height) };
    });
    const rr = row?.getBoundingClientRect();
    return {
      block: rr ? { w: Math.round(rr.width), h: Math.round(rr.height) } : null,
      buttons: btns,
    };
  });
}

async function measureDesktopRoles(page, w, lang) {
  await page.setViewportSize({ width: w, height: w === 1280 ? 800 : 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 60000 });
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(200);
  await page.evaluate(() => document.querySelector('[data-action="show-panel"]')?.click());
  await wait(400);
  return page.evaluate(() =>
    [...document.querySelectorAll('#chrome-experiencia .chrome__exp-role')].map((el) => {
      const cs = getComputedStyle(el);
      return {
        id: el.closest('.chrome__exp-row')?.querySelector('.chrome__exp-name')?.textContent?.trim().slice(0, 16) ?? '',
        sw: el.scrollWidth,
        cw: el.clientWidth,
        lineClamp: cs.webkitLineClamp || cs.getPropertyValue('-webkit-line-clamp') || 'none',
        overflow: cs.overflow,
        textOverflow: cs.textOverflow,
        ellipsis: cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1,
      };
    }),
  );
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const out = { aboutPanel: {}, introCtas: {}, expRoles: {} };

try {
  for (const width of [375, 390, 430]) {
    const ctx = await browser.newContext({
      viewport: { width, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    out.aboutPanel[width] = await measureAboutPanel(page);
    out.introCtas[width] = await measureIntroCtas(page);
    await ctx.close();
  }
  const page = await browser.newPage();
  for (const w of [1280, 1440]) {
    for (const lang of ['es', 'en']) {
      out.expRoles[`${w}-${lang}`] = await measureDesktopRoles(page, w, lang);
    }
  }
  await page.close();
} finally {
  await browser.close();
  if (stop) stop();
}

console.log(JSON.stringify(out, null, 2));
