#!/usr/bin/env node
/** Batch r29 — peek name at 375, search artículos/articles, exit settle regression. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#boot').count()) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function setLang(page, wantEn) {
  for (let i = 0; i < 6; i++) {
    const isEn = (await page.evaluate(() => document.documentElement.lang)) === 'en';
    if (isEn === wantEn) return;
    await page.locator('.chrome__tools-phone [data-action="lang-toggle"]').tap();
    await wait(280);
  }
}

async function ensurePeekCard(page) {
  const peek = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
  );
  if (peek) return;
  const expanded = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
  );
  if (expanded) {
    await page.locator('[data-action="intro-close"]').tap();
    await wait(450);
    return;
  }
  const dock = await page.evaluate(() => document.querySelector('.chrome')?.classList.contains('chrome--dock'));
  if (dock) {
    await page.locator('[data-dock="intro"]').tap();
    await wait(450);
  }
}

async function lastCharElementFromPoint(page) {
  return page.evaluate(() => {
    const strong = document.querySelector('.chrome--intro-peek .chrome__card-id strong');
    const text = strong?.textContent?.trim() ?? '';
    if (!strong || !text) return { ok: false, reason: 'missing strong' };
    const range = document.createRange();
    range.selectNodeContents(strong);
    const rects = [...range.getClientRects()];
    const last = rects[rects.length - 1];
    if (!last) return { ok: false, reason: 'no rects', text };
    const x = last.right - 1;
    const y = last.top + last.height / 2;
    const hit = document.elementFromPoint(x, y);
    const onName = !!(hit && (hit === strong || strong.contains(hit)));
    const onButton = !!hit?.closest?.('.chrome__see-details');
    const btn = document.querySelector('.chrome__see-details');
    const br = btn?.getBoundingClientRect();
    return {
      ok: onName && !onButton && text === 'Adonay Lizardo',
      text,
      lastChar: text.slice(-1),
      x,
      y,
      hitTag: hit?.tagName,
      hitClass: typeof hit?.className === 'string' ? hit.className.slice(0, 48) : '',
      btnLeft: br?.left,
      strongRight: last.right,
    };
  });
}

async function waitSectionLand(page, h2Sel) {
  await page
    .waitForFunction(
      (sel) => {
        const pinned = document.querySelector('[data-intro-pinned]');
        const h2 = document.querySelector(sel);
        if (!pinned || !h2) return false;
        const gap = h2.getBoundingClientRect().top - pinned.getBoundingClientRect().bottom;
        return gap >= 11 && gap <= 42;
      },
      h2Sel,
      { timeout: 10000 },
    )
    .catch(() => {});
}

async function searchQueryOpensArticulos(page, query, wantTitle) {
  await page.evaluate(() => window.__playtestQa?.openSearchForQa?.());
  await wait(400);
  const hitCount = await page.evaluate((q) => {
    const input = document.querySelector('.search-palette__input');
    if (input instanceof HTMLInputElement) {
      input.value = q;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return document.querySelectorAll('.search-palette__hit').length;
  }, query);
  if (!hitCount) return { ok: false, reason: 'no hits', hitCount };
  await page.locator('.search-palette__hit').first().tap();
  await page
    .waitForFunction(
      (title) => {
        const expanded = document.querySelector('.chrome--intro-expanded');
        const h2 = document.querySelector('#chrome-mobile-articulos h2');
        return !!expanded && h2?.textContent?.trim() === title;
      },
      wantTitle,
      { timeout: 12000 },
    )
    .catch(() => {});
  await waitSectionLand(page, '#chrome-mobile-articulos h2');
  const land = await page.evaluate((title) => {
    const h2 = document.querySelector('#chrome-mobile-articulos h2');
    const expanded = document.querySelector('.chrome--intro-expanded');
    const pr = document.querySelector('[data-intro-pinned]')?.getBoundingClientRect();
    const hr = h2?.getBoundingClientRect();
    const gap = hr && pr ? hr.top - pr.bottom : null;
    const cx = hr ? hr.left + Math.min(hr.width / 2, 40) : 0;
    const cy = hr ? hr.top + 8 : 0;
    const hit = hr ? document.elementFromPoint(cx, cy) : null;
    const hittable = !!(hit && h2 && (h2.contains(hit) || hit === h2));
    const titleOk = h2?.textContent?.trim() === title;
    return {
      ok: !!expanded && titleOk,
      gap,
      hittable,
      hitTag: hit?.tagName,
      title: h2?.textContent?.trim(),
    };
  }, wantTitle);
  return { ok: land.ok, hitCount, land };
}

async function main() {
  const errors = [];
  const metrics = {};

  const browser = await chromium.launch();
  for (const lang of ['es', 'en']) {
    for (const w of [375, 390]) {
      const tag = `${lang}-${w}`;
      const ctx = await browser.newContext({
        viewport: { width: w, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await boot(page);
      await setLang(page, lang === 'en');
      await ensurePeekCard(page);
      const m1 = await lastCharElementFromPoint(page);
      metrics[`M1-${tag}`] = m1;
      if (!m1.ok) errors.push(`M1 peek name ${tag} ${JSON.stringify(m1)}`);

      await ctx.close();
    }
  }

  for (const lang of ['es', 'en']) {
    for (const w of [375, 390]) {
      const tag = `${lang}-${w}`;
      const ctx = await browser.newContext({
        viewport: { width: w, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await boot(page);
      await setLang(page, lang === 'en');
      const q = lang === 'en' ? 'articles' : 'artículos';
      const wantTitle = lang === 'en' ? 'Articles' : 'Artículos';
      const m2 = await searchQueryOpensArticulos(page, q, wantTitle);
      metrics[`M2-${tag}`] = m2;
      if (!m2.ok) errors.push(`M2 search ${q} ${tag} ${JSON.stringify(m2)}`);

      await ctx.close();
    }
  }
  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  const r28 = spawnSync('node', ['scripts/qa-batch-r28.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, QA_BASE_URL: BASE },
  });
  if (r28.status !== 0) errors.push('qa-batch-r28 regression failed');

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r29: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
