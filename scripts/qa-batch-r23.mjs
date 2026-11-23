#!/usr/bin/env node
/** Batch r23 — F2 align, F5 toggle, search hub, peek padding + r22 regression subset. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const PHONE_WIDTHS = [375, 390, 414, 430];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(
    () => {
      if (!document.getElementById('boot')) return true;
      return document.body.classList.contains('boot-welcome') && !!document.querySelector('[data-boot-start]');
    },
    undefined,
    { timeout: 180000 },
  );
  if (await page.$('#boot')) {
    await page.waitForSelector('body.boot-welcome [data-boot-start]', { state: 'visible', timeout: 120000 });
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(500);
}

async function dismissToDock(page) {
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(400);
  for (const ms of [350, 450]) {
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await wait(ms);
  }
}

async function setLang(page, lang) {
  await page.evaluate((l) => {
    document.querySelector(`.chrome__lang-opt[data-lang="${l}"]`)?.click();
  }, lang);
  await wait(350);
}

async function openChecklistCard(page) {
  await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
  await wait(400);
}

async function testF2(page, tag, errors, metrics) {
  for (const w of PHONE_WIDTHS) {
    await page.setViewportSize({ width: w, height: 812 });
    await wait(200);
    await openChecklistCard(page);
    const d = await page.evaluate(() => {
      const ring = document.querySelector('.checklist--phone-open .checklist__ring');
      const mark = document.querySelector('.checklist--phone-open .checklist__item-mark');
      const counter = document.querySelector('.checklist--phone-open .checklist__counter--label');
      const rr = ring?.getBoundingClientRect();
      const mr = mark?.getBoundingClientRect();
      const cr = counter?.getBoundingClientRect();
      if (!rr || !mr) return { fail: 'missing ring/mark' };
      const card = document.querySelector('.checklist--phone-open');
      const cardRight = card?.getBoundingClientRect().right ?? 0;
      const ringCx = rr.left + rr.width / 2;
      const markCx = mr.left + mr.width / 2;
      const ringCy = rr.top + rr.height / 2;
      const counterRight = cr?.right ?? 0;
      const counterDy = cr ? Math.abs(ringCy - (cr.top + cr.height / 2)) : 0;
      return {
        ringRight: rr.right,
        markRight: mr.right,
        ringCx,
        markCx,
        counterRight,
        cardRight,
        counterDy,
      };
    });
    const key = `F2-${tag}-${w}`;
    metrics[key] = d;
    if (d.fail) errors.push(`${tag} F2 ${w}: ${d.fail}`);
    else {
      const dr = Math.abs(d.ringRight - d.markRight);
      const dc = Math.abs(d.ringCx - d.markCx);
      if (dc > 2) errors.push(`${tag} F2 ${w}: |ringCx-markCx|=${dc.toFixed(2)}`);
      if (Math.abs(d.counterRight - (d.cardRight - 54)) > 3) {
        errors.push(`${tag} F2 ${w}: counter right ${d.counterRight} vs ${d.cardRight - 54}`);
      }
      if (d.counterDy > 4) errors.push(`${tag} F2 ${w}: counter vertical Δ${d.counterDy.toFixed(2)}`);
    }
    await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
    await wait(200);
  }
}

async function testPeekPadding(page, tag, lang, errors, metrics) {
  await setLang(page, lang);
  for (const w of PHONE_WIDTHS) {
    await page.setViewportSize({ width: w, height: 812 });
    await wait(250);
    const d = await page.evaluate(() => {
      const intro = document.querySelector('.chrome--intro-peek .chrome__intro');
      const ir = intro?.getBoundingClientRect();
      if (!ir) return { fail: 'no peek intro' };
      const nodes = [
        document.querySelector('.chrome__see-details'),
        document.querySelector('.chrome__card-id .chrome__mono'),
        document.querySelector('.chrome__card-id strong'),
      ].filter(Boolean);
      const pads = [];
      let worst = 999;
      for (const n of nodes) {
        const r = n.getBoundingClientRect();
        if (r.height < 1) continue;
        const pad = ir.bottom - r.bottom;
        pads.push({ id: n.className, pad, bottom: r.bottom, introBottom: ir.bottom });
        worst = Math.min(worst, pad);
      }
      return { h: ir.height, worst, pads };
    });
    const key = `peek-${tag}-${w}`;
    metrics[key] = d;
    if (d.fail) errors.push(`${tag} peek ${w}: ${d.fail}`);
    else if (d.worst < 8) errors.push(`${tag} peek ${w}: bottom pad ${d.worst.toFixed(1)} < 8`);
    else if (d.h > 204) errors.push(`${tag} peek ${w}: height ${d.h.toFixed(1)} > 204`);
  }
}

async function testF5(page, lang, tag, errors, metrics) {
  await setLang(page, lang);
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(200);
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(500);
  const w0 = await page.evaluate(() => document.querySelector('.chrome__column')?.getBoundingClientRect().width ?? 0);
  await page.evaluate(() => document.querySelector('[data-action="panel-only"]')?.click());
  await wait(350);
  const after1 = await page.evaluate(() => ({
    layout: document.body.dataset.layout,
    w: document.querySelector('.chrome__column')?.getBoundingClientRect().width ?? 0,
    aria: document.querySelector('[data-action="panel-only"]')?.getAttribute('aria-label') ?? '',
  }));
  await page.evaluate(() => document.querySelector('[data-action="hide-panel"]')?.click());
  await wait(350);
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(350);
  const after2 = await page.evaluate(() => ({
    layout: document.body.dataset.layout,
    w: document.querySelector('.chrome__column')?.getBoundingClientRect().width ?? 0,
    aria: document.querySelector('[data-action="panel-only"]')?.getAttribute('aria-label') ?? '',
  }));
  metrics[`F5-${tag}`] = { w0, after1, after2 };
  if (after1.layout !== 'panel') errors.push(`${tag} F5 expand layout ${after1.layout}`);
  if (after1.w < 1200) errors.push(`${tag} F5 expanded width ${after1.w.toFixed(0)}`);
  if (after2.layout !== 'split') errors.push(`${tag} F5 collapse layout ${after2.layout}`);
  if (Math.abs(after2.w - w0) > 24) errors.push(`${tag} F5 collapsed width ${after2.w.toFixed(0)} vs ${w0.toFixed(0)}`);
}

async function testSearchHub(page, tag, errors, metrics) {
  await page.evaluate(() => {
    document.querySelector('.chrome__rail [data-action="cases"]')?.click();
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
  });
  await wait(500);
  for (const q of ['charlas', 'podcast', 'talks']) {
    await page.evaluate(() => document.querySelector('.chrome__rail [data-action="search"]')?.click());
    await wait(350);
    await page.locator('.search-palette__input').fill(q);
    await wait(400);
    const d = await page.evaluate(() => {
      const hits = [...document.querySelectorAll('.search-palette__hit[data-kind="talks"]')];
      const hub = hits.find(
        (h) => h.querySelector('.search-palette__hit-snippet')?.textContent?.trim() === 'Teresa',
      );
      return { count: hits.length, hub: !!hub, titles: hits.map((h) => h.querySelector('.search-palette__hit-title')?.textContent?.trim()) };
    });
    metrics[`search-${q}-${tag}`] = d;
    await page.keyboard.press('Escape');
    await wait(250);
    if (!d.hub) errors.push(`${tag} search "${q}" missing teresa-building hub`);
  }
}

async function testF7Counts(page, tag, errors, metrics) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.querySelector('.chrome__rail [data-action="cases"]')?.click();
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
  });
  await wait(500);
  const d = await page.evaluate(() => {
    const count = Number(document.querySelector('#chrome-charlas [data-section-count]')?.textContent || 0);
    const rows = document.querySelectorAll('#chrome-charlas .chrome__content-row').length;
    return { count, rows };
  });
  metrics[`F7-${tag}`] = d;
  if (d.rows !== 14 || d.count !== 14) {
    errors.push(`${tag} F7 talks count rows=${d.rows} meta=${d.count}`);
  }
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="search"]')?.click());
  await wait(350);
  const chip = page.locator('.search-palette__chip').filter({ hasText: /Talks|Charlas/ });
  if (await chip.count()) await chip.first().click();
  await wait(350);
  const talkRows = await page.evaluate(
    () => document.querySelectorAll('.search-palette__hit[data-kind="talks"]').length,
  );
  await page.keyboard.press('Escape');
  if (talkRows !== 14) errors.push(`${tag} F7 chip talk hits ${talkRows} (want 14)`);
}

async function main() {
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const [lang, tag] of [['es', 'es'], ['en', 'en']]) {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await ctx.addInitScript(() => {
      sessionStorage.clear();
      localStorage.clear();
    });
    const page = await ctx.newPage();
    await boot(page);
    await setLang(page, lang);
    await testF2(page, `${tag}-phone`, errors, metrics);
    await testPeekPadding(page, `${lang}-phone`, lang, errors, metrics);
    await ctx.close();
  }

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await deskCtx.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const desk = await deskCtx.newPage();
  await boot(desk);
  await testF5(desk, 'es', '1440-es', errors, metrics);
  await testF5(desk, 'en', '1440-en', errors, metrics);
  await testSearchHub(desk, '1440', errors, metrics);
  await testF7Counts(desk, '1440', errors, metrics);
  await deskCtx.close();
  await browser.close();

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r23: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
