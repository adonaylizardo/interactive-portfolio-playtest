#!/usr/bin/env node
/** Batch r25 — measured asserts (375 + 1440, ES + EN). */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.$('#boot')) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function setLang(page, lang) {
  for (let i = 0; i < 5; i++) {
    if ((await page.evaluate(() => document.documentElement.lang)) === lang) return;
    await page.evaluate(() => {
      const phone = document.querySelector('.chrome__tools-phone [data-action="lang-toggle"]');
      phone?.click();
    });
    await wait(280);
  }
}

async function dismissToDock(page) {
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(300);
  for (const ms of [300, 400]) {
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await wait(ms);
  }
}

async function main() {
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const [w, lang] of [
    [375, 'es'],
    [375, 'en'],
    [390, 'es'],
    [430, 'es'],
  ]) {
    const tag = `${w}-${lang}`;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') logs.push(m.text());
    });
    await boot(page);
    await setLang(page, lang);

    const beforeLang = await page.evaluate(() => document.documentElement.lang);
    await page.locator('.chrome__tools-phone [data-action="lang-toggle"]').click();
    await wait(350);
    const afterLang = await page.evaluate(() => document.documentElement.lang);
    const langToggle = { before: beforeLang, after: afterLang, hadPhone: true };
    metrics[`H1-${tag}`] = langToggle;
    if (langToggle.before === langToggle.after) errors.push(`${tag} H1 phone lang dead`);

    await setLang(page, lang);
    await page.evaluate(() => localStorage.setItem('portfolio-playtest-lang', document.documentElement.lang));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(500);
    const persisted = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      stored: localStorage.getItem('portfolio-playtest-lang'),
    }));
    metrics[`H1persist-${tag}`] = persisted;
    if (persisted.lang !== lang || persisted.stored !== lang) {
      errors.push(`${tag} H1 lang persist ${JSON.stringify(persisted)}`);
    }

    await page.locator('[data-details]').click();
    await wait(700);
    const scrollArea = await page.evaluate(() => {
      const intro = document.querySelector('.chrome__intro');
      const ir = intro?.getBoundingClientRect();
      return {
        clientH: intro?.clientHeight,
        scrollH: intro?.scrollHeight,
        viewportH: intro ? ir.height : 0,
      };
    });
    metrics[`H3-${tag}`] = scrollArea;
    if ((scrollArea.clientH ?? 0) < 400) {
      errors.push(`${tag} H3 intro scroll clientH ${scrollArea.clientH}`);
    }

    await dismissToDock(page);
    const dock = await page.evaluate((vw) => {
      const d = document.querySelector('.chrome__dock')?.getBoundingClientRect();
      return { x: d?.x, w: d?.width, wantX: (vw - 272) / 2 };
    }, w);
    metrics[`M8dock-${tag}`] = dock;
    if (w >= 390 && !near(dock.x ?? 0, dock.wantX, 2)) {
      errors.push(`${tag} M8 dock x ${dock.x} want ${dock.wantX}`);
    }

    await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
    await wait(350);
    const openCard = await page.evaluate((vw) => {
      const card = document.querySelector('.checklist--phone-open');
      const r = card?.getBoundingClientRect();
      const ring = card?.querySelector('.checklist__ring-btn')?.getBoundingClientRect();
      const svg = card?.querySelector('.checklist__ring-bg');
      const stroke = svg ? getComputedStyle(svg).stroke : '';
      return {
        right: r?.right,
        wantRight: vw - 16,
        ringW: ring?.width,
        ringH: ring?.height,
        track: stroke,
      };
    }, w);
    metrics[`M8card-${tag}`] = openCard;
    if (!near(openCard.right ?? 0, openCard.wantRight ?? 0)) {
      errors.push(`${tag} M8 open card right ${openCard.right} vs ${openCard.wantRight}`);
    }
    if (!near(openCard.ringW ?? 0, 44) || !near(openCard.ringH ?? 0, 44)) {
      errors.push(`${tag} M7 ring tap ${openCard.ringW}x${openCard.ringH}`);
    }
    await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
    await wait(200);

    const circle = await page.evaluate(() => {
      const cl = document.querySelector('.checklist.checklist--phone-circle');
      const r = cl?.getBoundingClientRect();
      return { x: r?.x, y: r?.y, w: r?.width, h: r?.height };
    });
    metrics[`L10-${tag}`] = circle;
    if (w === 375 && (!near(circle.x, 311) || !near(circle.w, 48))) {
      errors.push(`${tag} L10 circle ${JSON.stringify(circle)}`);
    }

    if (lang === 'en' && (w === 375 || w === 390)) {
      await page.locator('[data-dock="intro"]').click();
      await wait(450);
      const peek = await page.evaluate(() => {
        const blurb = document.querySelector('.chrome__blurb');
        const row = document.querySelector('.chrome__card-row');
        const br = blurb?.getBoundingClientRect();
        const rr = row?.getBoundingClientRect();
        return { gap: rr && br ? rr.top - br.bottom : 0 };
      });
      metrics[`M9-${tag}`] = peek;
      if ((peek.gap ?? 0) < 12) errors.push(`${tag} M9 EN peek gap ${peek.gap}`);
    }

    if (logs.length) errors.push(`${tag} console: ${logs.slice(0, 2).join('; ')}`);
    await ctx.close();
  }

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desk.newPage();
  const deskLogs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') deskLogs.push(m.text());
  });
  await boot(page);

  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(400);
  await page.evaluate(() => document.querySelector('[data-action="panel-only"]')?.click());
  await wait(400);
  const panel = await page.evaluate(() => {
    const body = document.querySelector('.chrome__intro-body');
    const br = body?.getBoundingClientRect();
    const reading = document.body.dataset.reading;
    return { x: br?.x, w: br?.width, reading };
  });
  metrics.M5 = panel;
  if (panel.reading === '1') errors.push('M5 opened reading view');
  if (!near(panel.w ?? 0, 660) || !near(panel.x ?? 0, 422)) {
    errors.push(`M5 panel column ${JSON.stringify(panel)}`);
  }
  await page.keyboard.press('Escape');
  await wait(300);
  const afterEsc = await page.evaluate(() => document.body.dataset.layout);
  metrics.M5esc = afterEsc;
  if (afterEsc === 'panel') errors.push('M5 Esc did not collapse panel');

  await page.evaluate(() => {
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
    document.querySelector('.chrome__rail [data-action="search"]')?.click();
  });
  await wait(400);
  await page.evaluate(() => {
    [...document.querySelectorAll('.search-palette__chip')].find((c) =>
      /Artículos|Articles/i.test(c.textContent ?? ''),
    )?.click();
  });
  await wait(600);
  const chipArt = await page.evaluate(() => ({
    layout: document.body.dataset.layout,
    visible: !!document.querySelector('#chrome-articulos')?.getBoundingClientRect().height,
    expOpen: !!document.querySelector('.building-panel--experience.building-panel--open'),
  }));
  metrics.M4art = chipArt;
  if (!chipArt.visible || chipArt.expOpen) errors.push(`M4 articles chip ${JSON.stringify(chipArt)}`);

  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="search"]')?.click());
  await wait(300);
  await page.evaluate(() => {
    [...document.querySelectorAll('.search-palette__chip')].find((c) =>
      /Charlas|Talks/i.test(c.textContent ?? ''),
    )?.click();
  });
  await wait(600);
  const chipTalk = await page.evaluate(() => ({
    visible: !!document.querySelector('#chrome-charlas')?.getBoundingClientRect().height,
  }));
  metrics.M4talk = chipTalk;
  if (!chipTalk.visible) errors.push(`M4 talks chip ${JSON.stringify(chipTalk)}`);

  await page.evaluate(() => {
    document.querySelector('.about-panel--open [data-about-close]')?.click();
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
  });
  await wait(400);
  await page.evaluate(() => {
    document.querySelector('#chrome-articulos .chrome__content-row')?.click();
  });
  await wait(700);
  await page.evaluate(() => document.querySelector('[data-exp-back]')?.click());
  await page.waitForFunction(
    () => {
      if (document.querySelector('.building-panel--experience.building-panel--open')) return false;
      const col = document.querySelector('.chrome__column');
      return (col?.scrollTop ?? 0) > 800;
    },
    undefined,
    { timeout: 8000 },
  );
  const h2 = await page.evaluate(() => {
    const h = document.querySelector('.chrome__column .chrome__header')?.getBoundingClientRect();
    const s = document.querySelector('.chrome__column #chrome-articulos h2')?.getBoundingClientRect();
    const col = document.querySelector('.chrome__column');
    return {
      expOpen: !!document.querySelector('.building-panel--experience.building-panel--open'),
      gap: s && h ? s.top - h.bottom : 0,
      colScroll: col?.scrollTop ?? 0,
      layout: document.body.dataset.layout,
    };
  });
  metrics.H2 = h2;
  if (h2.expOpen) errors.push(`H2 experience panel still open ${JSON.stringify(h2)}`);

  await page.evaluate(() => document.querySelector('#chrome-charlas')?.scrollIntoView({ block: 'start' }));
  await wait(200);
  const scrollLand = await page.evaluate(() => {
    const h = document.querySelector('.chrome__column .chrome__header')?.getBoundingClientRect();
    const s = document.querySelector('.chrome__column #chrome-charlas h2')?.getBoundingClientRect();
    return { gap: s && h ? s.top - h.bottom : 0 };
  });
  metrics.M6 = scrollLand;
  if ((scrollLand.gap ?? 0) < 12) errors.push(`M6 scroll land gap ${scrollLand.gap}`);

  const sm = await page.evaluate(() => {
    const el = document.querySelector('#chrome-charlas');
    return el ? getComputedStyle(el).scrollMarginTop : '0';
  });
  metrics.M6sm = sm;
  if (parseFloat(sm) < 77) errors.push(`M6 scroll-margin-top ${sm}`);

  if (deskLogs.length) errors.push(`desktop console: ${deskLogs.slice(0, 2).join('; ')}`);

  await desk.close();
  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r25: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
