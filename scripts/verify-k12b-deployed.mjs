#!/usr/bin/env node
/** k12b consolidated checks on deployed preview-contenido. */
import { chromium } from 'playwright';

const BASE =
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

const results = {};

async function main() {
  const browser = await chromium.launch({
    args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--autoplay-policy=no-user-gesture-required'],
  });

  // Bundle hash
  const p0 = await browser.newPage();
  await p0.goto(BASE, { waitUntil: 'domcontentloaded' });
  const html = await p0.content();
  const js = html.match(/assets\/(index-[^"]+\.js)/)?.[1] ?? 'missing';
  const css = html.match(/assets\/(index-[^"]+\.css)/)?.[1] ?? 'missing';
  results.bundle = { js, css };
  await p0.close();

  // document.title list → detail
  const ctx1 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const p1 = await ctx1.newPage();
  await p1.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {}
  });
  p1.setDefaultTimeout(180000);
  await p1.goto(`${BASE}#/leer`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.reading-view:not([hidden])', { timeout: 180000 });
  const titleList = await p1.title();
  await p1.locator('.reading-view__row').first().click();
  await p1.waitForFunction(() => location.hash.includes('/leer/'), { timeout: 15000 });
  await p1.waitForTimeout(200);
  const titleDetail = await p1.title();
  results.documentTitle = {
    list: titleList,
    detail: titleDetail,
    pass: titleDetail !== titleList && /About me|Sobre mí|Estudio/i.test(titleDetail),
  };
  await ctx1.close();

  // Place card sheet top @ 390
  const ctx2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'en-US',
  });
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(180000);
  await p2.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {}
  });
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => typeof window.__playtestQa?.openPlaceCard === 'function', {
    timeout: 180000,
  });
  await p2.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });
  await p2.evaluate(() => window.__playtestQa?.openPlaceCard?.('sambil'));
  await p2.waitForSelector('.place-card--open', { timeout: 15000 });
  results.placeCardSheet = await p2.evaluate(() => {
    const r = document.querySelector('.place-card__sheet')?.getBoundingClientRect();
    const hero = document.querySelector('.place-card__hero')?.getBoundingClientRect();
    return {
      sheetTop: r ? Math.round(r.top) : null,
      sheetHeight: r ? Math.round(r.height) : null,
      heroW: hero ? Math.round(hero.width) : null,
      heroH: hero ? Math.round(hero.height) : null,
      pass: r ? r.top >= 400 && r.top <= 445 : false,
    };
  });
  await ctx2.close();

  // Vulkan MED-1 Teresa expanded
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const p3 = await ctx3.newPage();
  p3.setDefaultTimeout(180000);
  await p3.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {}
  });
  await p3.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => typeof window.__playtestQa?.enterInterior === 'function', {
    timeout: 180000,
  });
  await p3.waitForFunction(() => !document.getElementById('boot'), { timeout: 30000 });
  await p3.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await p3.waitForSelector('.building-panel--open', { timeout: 30000 });
  await p3.evaluate(() => window.__playtestQa?.expandInteriorSheet?.());
  await p3.waitForSelector('.building-panel--expanded', { timeout: 15000 });
  await p3.waitForTimeout(2000);
  results.vulkanAlpha = await p3.evaluate(() => {
    const sheet = document.querySelector('.building-panel__sheet');
    if (!sheet) return { pass: false, error: 'no sheet' };
    const top = sheet.getBoundingClientRect().top;
    const points = [];
    for (let y = 32; y < top - 8; y += 28) {
      for (let x = 32; x < 358; x += 36) points.push({ x, y });
    }
    const colors = window.__playtestQa?.sampleCanvasColors?.(points) ?? [];
    let alpha0 = 0;
    let n = 0;
    for (const c of colors) {
      if (!c) continue;
      n++;
      if (c.a === 0) alpha0++;
    }
    const pct = n ? (alpha0 / n) * 100 : 100;
    return { alpha0Pct: pct, samples: n, sheetTop: Math.round(top), pass: pct < 10 };
  });
  await ctx3.close();

  // Load-failed blocked sprites
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p4 = await ctx4.newPage();
  p4.setDefaultTimeout(60000);
  await p4.route('**/sprites/**', (r) => r.abort());
  await p4.route('**/preview-contenido/sprites/**', (r) => r.abort());
  const errors = [];
  p4.on('pageerror', (e) => errors.push(e.message));
  await p4.goto(BASE, { waitUntil: 'domcontentloaded' });
  const fatal = await p4
    .waitForSelector('#fatal-state', { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  results.loadFailed = {
    fatalVisible: fatal,
    title: fatal ? await p4.locator('.fatal-state__title').textContent() : null,
    lede: fatal ? await p4.locator('.fatal-state__lede').textContent() : null,
    tryAgain: fatal ? await p4.locator('.fatal-state__btn--primary').textContent() : null,
    uncaught: errors.length,
    pass: fatal && errors.length === 0,
  };
  await ctx4.close();

  // WebGL off — no uncaught screen error
  const ctx5 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p5 = await ctx5.newPage();
  const wglErrors = [];
  p5.on('pageerror', (e) => wglErrors.push(e.message));
  await p5.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = function () {
      return null;
    };
  });
  await p5.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p5.waitForSelector('#fatal-state', { timeout: 30000 }).catch(() => {});
  results.webglFatal = {
    visible: await p5.locator('#fatal-state').isVisible().catch(() => false),
    uncaught: wglErrors,
    pass: wglErrors.every((m) => !/reading 'screen'/.test(m)),
  };
  await ctx5.close();

  // About end padding / emoji font link
  const ctx6 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const p6 = await ctx6.newPage();
  p6.setDefaultTimeout(180000);
  await p6.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {}
  });
  await p6.goto(`${BASE}#/leer/estudio`, { waitUntil: 'domcontentloaded' });
  await p6.waitForSelector('.reading-view__article--about', { timeout: 180000 });
  await p6.evaluate(() => {
    const el = document.querySelector('.reading-view__scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
  await p6.waitForTimeout(300);
  results.aboutEndClamp = await p6.evaluate(() => {
    const ids = ['lead-with-context-not-control', 'and-above-all-treat-others-with-kindness-and-respect'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) {
        out[id] = { missing: true };
        continue;
      }
      const r = el.getBoundingClientRect();
      const header = document.querySelector('.reading-view__header')?.getBoundingClientRect();
      const stickyBottom = header ? header.bottom + 12 : 56;
      out[id] = { top: Math.round(r.top), pass: r.top <= stickyBottom + 8 };
    }
    const pad = getComputedStyle(document.querySelector('.reading-view__article--about')).paddingBottom;
    out.paddingBottom = pad;
    return out;
  });
  results.notoEmoji = await p6.evaluate(() =>
    [...document.querySelectorAll('link[href*="fonts.googleapis.com"]')].some((l) =>
      l.getAttribute('href')?.includes('Noto+Color+Emoji'),
    ),
  );
  await ctx6.close();

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const fails = Object.entries(results).filter(([k, v]) => {
    if (k === 'bundle' || k === 'notoEmoji') return false;
    if (typeof v === 'object' && v && 'pass' in v) return !v.pass;
    return false;
  });
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
