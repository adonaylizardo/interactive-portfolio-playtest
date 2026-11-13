#!/usr/bin/env node
/** r37 measurements: case card animation, gap/mat clicks, articulos meta, search titles. */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4202;
const BASE = process.env.QA_BASE_URL ?? `http://127.0.0.1:${PORT}/interactive-portfolio-playtest/`;
const ROOMS = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil'];
const VIEWPORTS = [
  [1280, 800],
  [1440, 900],
];
const META_WIDTHS = [375, 390, 430];
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

async function tilePoint(page, tx, ty) {
  return page.evaluate(
    ([x, y]) => {
      const qa = window.__playtestQa;
      const p = qa.worldToClient((x - y) * 64, (x + y) * 32 + 32);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    },
    [tx, ty],
  );
}

async function sampleCardAnimation(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate(() => window.__playtestQa.enterInterior('volaris'));
  const samples = [];
  for (let t = 0; t <= 600; t += 50) {
    if (t > 0) await wait(50);
    const s = await page.evaluate(() => {
      const sheet = document.querySelector(
        'body:has(#game-canvas[data-interior]) .building-panel--peek .building-panel__sheet',
      );
      const r = sheet?.getBoundingClientRect();
      const cs = sheet ? getComputedStyle(sheet) : null;
      return { x: r ? Math.round(r.x) : null, transform: cs?.transform ?? '' };
    });
    samples.push({ ms: t, ...s });
  }
  return samples;
}

async function tilesUnderCard(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector(
      'body:has(#game-canvas[data-interior]) .building-panel--peek.building-panel--open .building-panel__sheet',
    );
    if (!sheet) return [];
    const r = sheet.getBoundingClientRect();
    const qa = window.__playtestQa;
    const layout = qa.interiorLayout();
    if (!layout?.walkable) return [];
    const covered = [];
    for (const { x: tx, y: ty } of layout.walkable) {
      const p = qa.worldToClient((tx - ty) * 64, (tx + ty) * 32 + 32);
      if (p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom) covered.push(`${tx},${ty}`);
    }
    return covered;
  });
}

async function probeExit(page, room, w, h, target) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
  await page.evaluate((id) => window.__playtestQa.enterInterior(id), room);
  await page.waitForSelector('.building-panel--open', { timeout: 15000 });
  await wait(300);
  const layout = await page.evaluate(() => window.__playtestQa.interiorLayout());
  if (!layout) return { ok: false, err: 'no layout' };
  const gap = target === 'mat' ? 0 : 0.8;
  const tx = layout.exitFace === '+x' ? layout.exit.x + gap : layout.exit.x;
  const ty = layout.exitFace === '+x' ? layout.exit.y : layout.exit.y + gap;
  const pt = await tilePoint(page, tx, ty);
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return { id: el?.id ?? '', tag: el?.tagName ?? '' };
    },
    [pt.x, pt.y],
  );
  const ok = hit.id === 'game-canvas' || hit.tag === 'CANVAS';
  return { ok, pt, hit, room, target, w, h };
}

async function measureMeta(page, width, lang) {
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
      const source = el.querySelector('.experience__row-meta-source');
      const dcs = date ? getComputedStyle(date) : null;
      return {
        source: source?.textContent?.trim() ?? '',
        date: date?.textContent?.trim() ?? '',
        dateWhiteSpace: dcs?.whiteSpace ?? '',
        dateScrollW: date?.scrollWidth ?? 0,
        dateClientW: date?.clientWidth ?? 0,
        dateBreaksInternally: date ? date.scrollWidth > date.clientWidth + 1 : false,
      };
    });
  });
}

async function measureSearch(page, lang, query) {
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(150);
  return page.evaluate((q) => {
    const groups = window.__playtestQa?.searchForQa?.(q) ?? [];
    const rows = groups.flatMap((g) => g.items ?? g.results ?? []);
    return rows.slice(0, 8).map((r) => ({ kind: r.kind, title: r.title, snippet: r.snippet?.slice(0, 80) ?? '' }));
  }, query);
}

async function measureVolarisRole(page, lang) {
  await page.evaluate((l) => window.__playtestQa?.setLang?.(l), lang);
  await wait(150);
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(400);
  return page.evaluate(() => {
    const el = document.querySelector('.chrome__exp-role, .chrome__intro .chrome__exp-role');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 18;
    const lines = Math.round(el.scrollHeight / lh);
    return {
      text: el.textContent?.trim() ?? '',
      scrollHeight: el.scrollHeight,
      lineHeight: lh,
      lineCountApprox: lines,
      whiteSpace: cs.whiteSpace,
      overflow: cs.overflow,
    };
  });
}

const stop = await ensurePreview().catch(() => null);
const browser = await launchBrowser(chromium);
const out = { animation: {}, tilesUnderCard: {}, gap: [], meta: {}, search: {}, volarisRole: {} };

try {
  const page = await browser.newPage();
  for (const [w, h] of VIEWPORTS) {
    out.animation[`${w}x${h}`] = await sampleCardAnimation(page, w, h);
    out.tilesUnderCard[`${w}x${h}`] = await tilesUnderCard(page);
  }
  for (const [w, h] of VIEWPORTS) {
    for (const room of ROOMS) {
      for (const target of ['gap', 'mat']) {
        const r = await probeExit(page, room, w, h, target);
        out.gap.push({ ...r, pass: r.ok });
        if (!r.ok) console.error(`FAIL gap ${room}@${w} ${target}`, r);
      }
    }
  }
  for (const width of META_WIDTHS) {
    for (const lang of ['es', 'en']) {
      const key = `${width}-${lang}`;
      out.meta[key] = await measureMeta(page, width, lang);
    }
  }
  for (const lang of ['es', 'en']) {
    for (const q of ['volaris', 'adonay', 'diseño', 'design']) {
      if (lang === 'en' && q === 'diseño') continue;
      if (lang === 'es' && q === 'design') continue;
      out.search[`${lang}-${q}`] = await measureSearch(page, lang, q);
    }
  }
  out.volarisRole.es = await measureVolarisRole(page, 'es');
  out.volarisRole.en = await measureVolarisRole(page, 'en');
  await page.close();
} finally {
  await browser.close();
  if (stop) stop();
}

console.log(JSON.stringify(out, null, 2));
