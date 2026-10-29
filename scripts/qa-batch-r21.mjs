#!/usr/bin/env node
/** Batch r21 — H1-H3, M1-M4 measured rects. */
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
      return (
        document.body.classList.contains('boot-welcome') &&
        !!document.querySelector('[data-boot-start]')
      );
    },
    undefined,
    { timeout: 180000 },
  );
  if (await page.$('#boot')) {
    await page.waitForSelector('body.boot-welcome [data-boot-start]', {
      state: 'visible',
      timeout: 120000,
    });
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(600);
}

async function dismissToDock(page) {
  const details = page.locator('[data-details]');
  if (await details.isVisible({ timeout: 2000 }).catch(() => false)) {
    await details.click();
  } else {
    await page.evaluate(() => document.querySelector('[data-details]')?.click());
  }
  await wait(400);
  for (const ms of [350, 450]) {
    await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
    await wait(ms);
  }
}

async function testH1Phone(page, tag, errors) {
  const dock = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--dock'),
  );
  if (!dock) await dismissToDock(page);
  const d = await page.evaluate(() => {
    const failures = [];
    const dock = document.querySelector('.chrome__dock');
    const btns = dock ? [...dock.querySelectorAll('.ui-round, [data-dock]')] : [];
    if (btns.length !== 5) failures.push(`dock count ${btns.length} !== 5`);
    const dockRect = dock?.getBoundingClientRect();
    if (dockRect && dockRect.right > window.innerWidth + 1) failures.push('dock overflows viewport');
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.width < 46 || r.height < 46) failures.push(`dock btn small ${r.width}x${r.height}`);
    }
    const articles = dock?.querySelector('[data-action="articles"]');
    const talks = dock?.querySelector('[data-action="talks"]');
    if (articles) failures.push('dock should not have articles');
    if (talks) failures.push('dock should not have talks');
    return { failures, hasArticles: !!articles, hasTalks: !!talks };
  });
  for (const f of d.failures) errors.push(`${tag} H1 dock: ${f}`);

  await page.locator('[data-dock="intro"]').click();
  await page.evaluate(() => document.querySelector('[data-details]')?.click());
  await wait(600);
  const aboutSections = await page.evaluate(() => ({
    articles: document.querySelectorAll('#chrome-mobile-articulos .chrome__content-row').length,
    talks: document.querySelectorAll('#chrome-mobile-charlas .chrome__content-row').length,
    expOpen: !!document.querySelector('.building-panel--experience.building-panel--open'),
  }));
  if (aboutSections.articles < 1) errors.push(`${tag} H1: about missing articles rows`);
  if (aboutSections.talks < 1) errors.push(`${tag} H1: about missing charlas rows`);
  if (aboutSections.expOpen) errors.push(`${tag} H1: experience list panel should stay closed`);
  await page.evaluate(() => document.querySelector('[data-action="intro-close"]')?.click());
  await wait(400);
}

async function testH1Desktop(page, errors) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await boot(page);
  const d = await page.evaluate(() => {
    const failures = [];
    const a = document.querySelector('.chrome__rail [data-action="articles"]');
    const t = document.querySelector('.chrome__rail [data-action="talks"]');
    if (a) failures.push('rail should not have articles');
    if (t) failures.push('rail should not have talks');
    return failures;
  });
  for (const f of d) errors.push(`1440 H1: ${f}`);
  await page.evaluate(() => document.querySelector('.chrome__rail [data-action="home"]')?.click());
  await wait(500);
  const open = await page.evaluate(() => ({
    articles: document.querySelectorAll('#chrome-articulos .chrome__content-row').length,
    talks: document.querySelectorAll('#chrome-charlas .chrome__content-row').length,
  }));
  if (open.articles < 1) errors.push('1440 H1: desktop about missing articles rows');
  if (open.talks < 1) errors.push('1440 H1: desktop about missing charlas rows');
}

async function testH2Desktop(page, errors) {
  await page.evaluate(() => {
    document.querySelector('.about-panel__backdrop')?.click();
    document.querySelector('.building-panel__exit')?.click();
    document.body.classList.remove('about-panel-open');
    document.querySelector('.about-panel')?.classList.remove('about-panel--open');
  });
  await wait(350);
  for (const state of ['map', 'split']) {
    if (state === 'split') {
      await page.evaluate(() => document.querySelector('.chrome__rail [data-action="cases"]')?.click());
      await wait(400);
    }
    const hit = await page.evaluate(() => {
      const failures = [];
      const toggle = document.querySelector('.chrome__tools-stack [data-action="lang-toggle"]');
      const r = toggle?.getBoundingClientRect();
      if (!r || r.width < 2) failures.push('lang toggle missing');
      else {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        if (!top?.closest('[data-action="lang-toggle"]')) failures.push('lang toggle not hittable');
      }
      return failures;
    });
    for (const f of hit) errors.push(`1440 H2 ${state}: ${f}`);
  }
}

async function testH3Desktop(page, errors) {
  const d = await page.evaluate(() => {
    const failures = [];
    const cl = document.querySelector('.checklist:not(.checklist--mobile)');
    cl?.classList.add('checklist--collapsed');
    const label = cl?.querySelector('.checklist__label');
    const counter = cl?.querySelector('.checklist__counter--label');
    const title = cl?.querySelector('.checklist__active-title');
    const ring = cl?.querySelector('.checklist__ring-btn');
    const lr = label?.getBoundingClientRect();
    const cr = counter?.getBoundingClientRect();
    const tr = title?.getBoundingClientRect();
    const rr = ring?.getBoundingClientRect();
    if (lr && cr && cr.width > 2) {
      const ox = Math.min(lr.right, cr.right) - Math.max(lr.left, cr.left);
      const oy = Math.min(lr.bottom, cr.bottom) - Math.max(lr.top, cr.top);
      if (ox > 1 && oy > 1) failures.push('label overlaps counter label');
    }
    if (tr && rr) {
      const ox = Math.min(tr.right, rr.right) - Math.max(tr.left, rr.left);
      const oy = Math.min(tr.bottom, rr.bottom) - Math.max(tr.top, rr.top);
      if (ox > 2 && oy > 2) failures.push('title intersects ring');
    }
    return failures;
  });
  for (const f of d) errors.push(`1440 H3: ${f}`);
}

async function testPhoneM(page, tag, errors) {
  const alreadyDock = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--dock'),
  );
  if (!alreadyDock) await dismissToDock(page);
  const m1 = await page.evaluate(() => {
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    return cl?.classList.contains('checklist--phone-circle') ? [] : ['dock not circle'];
  });
  for (const f of m1) errors.push(`${tag} M1: ${f}`);

  await page.evaluate(() => document.querySelector('.checklist__ring-btn')?.click());
  await wait(400);
  const m2 = await page.evaluate(() => {
    const failures = [];
    const title = document.querySelector('.checklist--phone-open .checklist__active-title');
    if (!title) return ['no open title'];
    const cs = getComputedStyle(title);
    if (cs.textOverflow === 'ellipsis' || title.scrollWidth > title.clientWidth + 1) {
      failures.push(`title ellipsis/clips ${title.scrollWidth}>${title.clientWidth}`);
    }
    const hr = document.querySelector('.checklist--phone-open .checklist__ring')?.getBoundingClientRect();
    const mk = document.querySelector('.checklist--phone-open .checklist__item-mark')?.getBoundingClientRect();
    if (hr && mk) {
      const ringCx = hr.left + hr.width / 2;
      const markCx = mk.left + mk.width / 2;
      if (Math.abs(ringCx - markCx) > 2) failures.push(`ring/mark cx Δ ${Math.abs(ringCx - markCx)}`);
    }
    const counter = document.querySelector('.checklist--phone-open .checklist__counter--label');
    const card = document.querySelector('.checklist--phone-open');
    if (counter && card) {
      const cr = counter.getBoundingClientRect();
      const cardRight = card.getBoundingClientRect().right;
      if (Math.abs(cr.right - (cardRight - 54)) > 3) {
        failures.push(`counter right ${cr.right} vs card-54 ${cardRight - 54}`);
      }
    }
    return failures;
  });
  for (const f of m2) errors.push(`${tag} M2: ${f}`);

  await page.evaluate(() => document.querySelector('.checklist--phone-open .checklist__ring-btn')?.click());
  await wait(250);
}

async function testM4(page, tag, errors) {
  await page
    .waitForFunction(
      () => {
        const row =
          document.querySelector('#chrome-experiencia-mobile .chrome__exp-row[data-locate="volaris"]') ??
          document.querySelector('#chrome-experiencia .chrome__exp-row[data-locate="volaris"]') ??
          document.querySelector('.chrome__exp-row[data-locate="volaris"]');
        const date = row?.querySelector('.chrome__exp-date');
        return !!date?.textContent?.trim();
      },
      { timeout: 8000 },
    )
    .catch(() => {});
  const d = await page.evaluate(() => {
    const row =
      document.querySelector('#chrome-experiencia-mobile .chrome__exp-row[data-locate="volaris"]') ??
      document.querySelector('#chrome-experiencia .chrome__exp-row[data-locate="volaris"]') ??
      document.querySelector('.chrome__exp-row[data-locate="volaris"]');
    const date = row?.querySelector('.chrome__exp-date');
    const dr = date?.getBoundingClientRect();
    const failures = [];
    const hasText = !!date?.textContent?.trim();
    if (!date || (!hasText && (!dr?.width || dr.width < 1))) failures.push('volaris date missing');
    else if (getComputedStyle(date).whiteSpace !== 'nowrap') failures.push('date not nowrap');
    return failures;
  });
  for (const f of d) errors.push(`${tag} M4: ${f}`);
}

async function main() {
  const errors = [];
  const browser = await chromium.launch();
  const phone = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await phone.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const pp = await phone.newPage();
  await boot(pp);
  await testPhoneM(pp, '375', errors);
  await testH1Phone(pp, '375', errors);
  await phone.close();

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await deskCtx.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const desk = await deskCtx.newPage();
  await testH1Desktop(desk, errors);
  await testH2Desktop(desk, errors);
  await testH3Desktop(desk, errors);
  await testM4(desk, '1440', errors);
  const phone2 = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  await phone2.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const mp = await phone2.newPage();
  await boot(mp);
  const detailsM4 = mp.locator('[data-details]');
  if (await detailsM4.isVisible({ timeout: 2000 }).catch(() => false)) {
    await detailsM4.click();
  } else {
    await mp.evaluate(() => document.querySelector('[data-details]')?.click());
  }
  await wait(600);
  await mp
    .waitForFunction(() => document.querySelector('.chrome__intro--expanded'), { timeout: 8000 })
    .catch(async () => {
      await mp.evaluate(() => document.querySelector('[data-details]')?.click());
      await wait(500);
    });
  await testM4(mp, '375', errors);
  await phone2.close();
  await deskCtx.close();
  await browser.close();

  const r20 = spawnSync('node', ['scripts/qa-batch-r20.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, QA_BASE_URL: BASE } });
  if (r20.status !== 0) {
    for (const line of `${r20.stdout}\n${r20.stderr}`.split('\n').filter(Boolean)) {
      errors.push(line.replace(/^FAIL /, 'r20: '));
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('qa-batch-r21: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
