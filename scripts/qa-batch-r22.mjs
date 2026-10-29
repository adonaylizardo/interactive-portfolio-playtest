#!/usr/bin/env node
/** Batch r22 — F1-F8 (+F13) measured evidence. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
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

async function testF1(page, tag, errors) {
  const paths = ['dock', 'expanded'];
  for (const p of paths) {
    if (p === 'dock') {
      const dock = await page.evaluate(() => document.querySelector('.chrome')?.classList.contains('chrome--dock'));
      if (!dock) await dismissToDock(page);
    } else {
      await page.evaluate(() => document.querySelector('[data-details]')?.click());
      await wait(500);
    }
    const d = await page.evaluate(() => {
      const cl = document.querySelector('.checklist--phone-circle');
      if (!cl) return { ok: false, reason: 'no circle' };
      const ring = cl.getBoundingClientRect();
      const counters = cl.querySelectorAll('.checklist__counter');
      for (const c of counters) {
        const cs = getComputedStyle(c);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = c.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        const ox = Math.min(ring.right, r.right) - Math.max(ring.left, r.left);
        const oy = Math.min(ring.bottom, r.bottom) - Math.max(ring.top, r.top);
        if (ox > 0 && oy > 0) return { ok: false, text: c.textContent, w: r.width, h: r.height };
      }
      return { ok: true };
    });
    if (!d.ok) errors.push(`${tag} F1 ${p}: counter visible ${JSON.stringify(d)}`);
    if (p === 'expanded') {
      await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
      await wait(350);
    }
  }
}

async function testF2(page, tag, errors) {
  await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
  await wait(400);
  const d = await page.evaluate(() => {
    const ring = document.querySelector('.checklist--phone-open .checklist__ring');
    const counter = document.querySelector('.checklist--phone-open .checklist__counter--label');
    const mark = document.querySelector('.checklist--phone-open .checklist__item-mark');
    const rr = ring?.getBoundingClientRect();
    const cr = counter?.getBoundingClientRect();
    const mr = mark?.getBoundingClientRect();
    if (!rr || !cr || !mr) return { fail: 'missing nodes' };
    const card = document.querySelector('.checklist--phone-open');
    const cardRight = card?.getBoundingClientRect().right ?? 0;
    const ringCx = rr.left + rr.width / 2;
    const markCx = mr.left + mr.width / 2;
    const counterRight = cr.right;
    const ringCy = rr.top + rr.height / 2;
    const ccy = cr.top + cr.height / 2;
    return {
      dr: Math.abs(rr.right - mr.right),
      dc: Math.abs(ringCx - markCx),
      counterRight,
      cardRight,
      counterDy: Math.abs(ringCy - ccy),
    };
  });
  if (d.fail) errors.push(`${tag} F2: ${d.fail}`);
  else {
    if (d.dc > 2) errors.push(`${tag} F2: |ringCx-markCx|=${d.dc.toFixed(2)}`);
    if (Math.abs(d.counterRight - (d.cardRight - 54)) > 3) {
      errors.push(`${tag} F2: counter right ${d.counterRight} vs card-54 ${d.cardRight - 54}`);
    }
    if (d.counterDy > 4) errors.push(`${tag} F2: counter vertical Δ${d.counterDy.toFixed(2)}`);
  }
  await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
  await wait(250);
}

async function testF3F4F5(page, lang, tag, errors) {
  await setLang(page, lang);
  await page.setViewportSize({ width: 1440, height: 900 });
  await wait(200);
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(500);
  const section = lang === 'es' ? 'articulos' : 'charlas';
  const title = await page.evaluate((id) => {
    const h = document.querySelector(`#chrome-${id} h2`);
    return h?.textContent?.trim();
  }, section);
  const want = lang === 'es' ? (section === 'articulos' ? 'Artículos' : 'Charlas') : section === 'articulos' ? 'Articles' : 'Talks';
  if (title !== want) errors.push(`${tag} F3 section title "${title}" want "${want}"`);
  const layoutBefore = await page.evaluate(() => document.body.dataset.layout);
  await page.evaluate(() => document.querySelector('[data-action="panel-only"]')?.click());
  await wait(300);
  const layoutAfter = await page.evaluate(() => document.body.dataset.layout);
  if (layoutAfter !== 'panel') errors.push(`${tag} F5 expand layout ${layoutBefore}->${layoutAfter}`);
  await page.evaluate(() => document.querySelector('[data-action="hide-panel"]')?.click());
  await wait(300);
  const aria = await page.evaluate(() => ({
    dockA: document.querySelector('.chrome__dock [data-action="articles"]'),
    railT: document.querySelector('.chrome__rail [data-action="talks"]'),
  }));
  if (aria.dockA) errors.push(`${tag} F4 dock still has articles`);
  if (aria.railT) errors.push(`${tag} F4 rail still has talks`);
}

async function testF6(page, tag, errors) {
  await dismissToDock(page);
  let circle = await page.evaluate(() =>
    document.querySelector('.checklist')?.classList.contains('checklist--phone-circle'),
  );
  if (!circle) errors.push(`${tag} F6 dock not circle`);
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(400);
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  await wait(400);
  circle = await page.evaluate(() =>
    document.querySelector('.checklist')?.classList.contains('checklist--phone-circle'),
  );
  if (!circle) errors.push(`${tag} F6 after expanded->close not circle`);
  await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
  await wait(350);
  await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
  await wait(350);
  circle = await page.evaluate(() =>
    document.querySelector('.checklist')?.classList.contains('checklist--phone-circle'),
  );
  if (!circle) errors.push(`${tag} F6 after open-card->close not circle`);
}

async function testF7(page, tag, errors) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    document.querySelector('.chrome__rail [data-action="cases"]')?.click();
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
  });
  await wait(500);
  const d = await page.evaluate(() => {
    const count = document.querySelector('#chrome-charlas [data-section-count]')?.textContent;
    const rows = document.querySelectorAll('#chrome-charlas .chrome__content-row').length;
    return { count, rows };
  });
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="search"]')?.click());
  await wait(400);
  const chip = page.locator('.search-palette__chip').filter({ hasText: /Talks|Charlas/ });
  if (await chip.count()) await chip.first().click();
  await wait(350);
  const counts = await page.evaluate(() => {
    const input = document.querySelector('.search-palette__input');
    return { hasSearch: !!input };
  });
  if (!counts.hasSearch) {
    await page.keyboard.press('Escape');
  } else {
    const talkRows = await page.evaluate(
      () => document.querySelectorAll('.search-palette__hit[data-kind="talks"]').length,
    );
    await page.keyboard.press('Escape');
    const panelRows = d.rows;
    const badgeSum = Number(d.count || 0);
    if (badgeSum < 1) errors.push(`${tag} F7 no charlas count meta`);
    if (talkRows > 0 && panelRows !== talkRows) {
      errors.push(`${tag} F7 panel rows ${panelRows} vs search ${talkRows}`);
    }
    return { panelRows, searchTalks: talkRows, badgeSum };
  }
  return { panelRows: d.rows, badgeSum: Number(d.count || 0) };
}

async function testF8(page, tag, errors) {
  await page.goto(BASE, { waitUntil: 'load' });
  await boot(page);
  const d = await page.evaluate(() => {
    const intro = document.querySelector('.chrome__intro');
    const ir = intro?.getBoundingClientRect();
    const sound = document.querySelector('.chrome__intro-title-actions [data-action="sound"]');
    const close = document.querySelector('.chrome__intro-title-actions [data-action="intro-close"]');
    const sr = sound?.getBoundingClientRect();
    const cr = close?.getBoundingClientRect();
    return { h: ir?.height, sw: sr?.width, sh: sr?.height, cw: cr?.width, ch: cr?.height };
  });
  if (d.h > 224) errors.push(`${tag} F8 peek height ${d.h?.toFixed(1)} > 224`);
  if ((d.sw ?? 0) < 39 || (d.sh ?? 0) < 39) errors.push(`${tag} F8 sound ${d.sw}x${d.sh}`);
  if ((d.cw ?? 0) < 39 || (d.ch ?? 0) < 39) errors.push(`${tag} F8 close ${d.cw}x${d.ch}`);
  return d;
}

async function testF13(page, tag, errors) {
  await page.evaluate(() => {
    document.querySelector('.chrome__rail [data-action="cases"]')?.click();
    document.querySelector('.chrome__rail [data-action="home"]')?.click();
    document.querySelector('.chrome__rail [data-action="search"]')?.click();
  });
  await wait(400);
  await page.locator('.search-palette__input').fill('a');
  await wait(350);
  const d = await page.evaluate(() => {
    const article = document.querySelector('.search-palette__hit[data-kind="articles"]');
    const talk = document.querySelector('.search-palette__hit[data-kind="talks"]');
    const aSnip = article?.querySelector('.search-palette__hit-snippet')?.textContent ?? '';
    const tSnip = talk?.querySelector('.search-palette__hit-snippet')?.textContent ?? '';
    const longMonth = /(January|February|March|April|May|June|July|August|September|October|November|December|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i;
    return { aSnip, tSnip, talkLong: longMonth.test(tSnip), articleLong: longMonth.test(aSnip) };
  });
  await page.keyboard.press('Escape');
  if (d.articleLong && d.talkLong === false && d.tSnip && d.tSnip.length > 6) {
    errors.push(`${tag} F13 talk snippet "${d.tSnip}" not long-form like article`);
  }
}

async function main() {
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const [lang, tag] of [['es', '375-es'], ['en', '375-en']]) {
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
    await testF1(page, tag, errors);
    await testF2(page, tag, errors);
    await testF6(page, tag, errors);
    const dockAria = await page.evaluate(() => ({
      articles: document.querySelector('.chrome__dock [data-action="articles"]'),
      talks: document.querySelector('.chrome__dock [data-action="talks"]'),
    }));
    if (dockAria.articles || dockAria.talks) {
      errors.push(`${tag} F4 dock should not expose articles/talks buttons`);
    }
    const f8 = await testF8(page, tag, errors);
    metrics[`F8-${tag}`] = f8;
    await ctx.close();
  }

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await deskCtx.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  const desk = await deskCtx.newPage();
  await boot(desk);
  await testF3F4F5(desk, 'es', '1440-es', errors);
  await testF3F4F5(desk, 'en', '1440-en', errors);
  const f7 = await testF7(desk, '1440', errors);
  metrics.F7 = f7;
  await testF13(desk, '1440', errors);
  await deskCtx.close();
  await browser.close();

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics));
    process.exit(1);
  }
  console.log('qa-batch-r22: ok');
  console.log('METRICS', JSON.stringify(metrics));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
