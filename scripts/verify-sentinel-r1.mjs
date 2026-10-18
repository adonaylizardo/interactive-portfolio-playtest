#!/usr/bin/env node
/**
 * Sentinel QA round 1 — real CDP touch (390×844, 844×390) + mouse 1280.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/sentinel-r1');

const results = [];
function record(id, pass, detail, viewport = '—') {
  results.push({ id, pass, detail, viewport });
}

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

async function measureTarget(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }, selector);
}

async function logrosCopy(page, lang, tag) {
  const mobile = (page.viewportSize()?.width ?? 0) < 800;
  if (mobile && lang === 'en') {
    await page.goto(`${BASE}#/leer/logros`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.locator('.reading-view__header [data-lang="en"]').click({ timeout: 5000 });
    await page.waitForTimeout(500);
  } else {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(800);
    if (lang !== 'es') {
      await page.evaluate((l) => {
        localStorage.setItem('portfolio-playtest-lang', l);
      }, lang);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
    }
    await page.evaluate(() => window.__playtestQa?.dismissBuildingPanel?.());
    await page.waitForTimeout(300);
    if (mobile) {
      await page.locator('[data-details]').click({ timeout: 8000 });
      await page.waitForTimeout(500);
    } else {
      await page.locator('.chrome__rail [data-action="achievements"]').click({ timeout: 8000 });
      await page.waitForTimeout(600);
    }
  }
  const texts = await page.evaluate(() => {
    const list = document.querySelector('.reading-view__achievements');
    if (list) return [...list.querySelectorAll('li')].map((li) => li.textContent?.trim());
    const mobile = window.innerWidth < 768;
    const root = document.querySelector(mobile ? '#chrome-logros-mobile' : '#chrome-logros');
    return root
      ? [...root.querySelectorAll('p[data-i18n^="chrome.achievement"]')].map((p) => p.textContent?.trim())
      : [];
  });
  const expected =
    lang === 'es'
      ? [
          'Speaker principal de Innova360, 200+ estudiantes',
          'Propuse y lidero el Bain Designers Guild',
          'AI Transformation Lead, 5/7 fases',
          'ADPList 2023: 31 sesiones, 15 países',
        ]
      : [
          'Main speaker at Innova360, 200+ students',
          'Proposed and lead the Bain Designers Guild',
          'AI Transformation Lead, 5/7 phases',
          'ADPList 2023: 31 sessions, 15 countries',
        ];
  const pass = expected.every((e, i) => texts[i] === e);
  await page.screenshot({ path: path.join(OUT, `logros-${lang}-${tag}.png`) });
  record(`A1-logros-${lang}`, pass, texts.join(' | '), tag);
}

async function bibliotecaFive(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__playtestQa?.dismissBuildingPanel?.();
    window.__playtestQa?.enterInterior?.('biblioteca');
  });
  await page.waitForSelector('.building-panel--experience.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const btn = document.querySelector('.experience__see-all');
    btn?.scrollIntoView({ block: 'center' });
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const badge = document.querySelector('.experience__section-count')?.textContent?.trim();
    const rows = document.querySelectorAll('.experience__row').length;
    const titles = [...document.querySelectorAll('.experience__row-title')].map((el) => el.textContent?.trim());
    return { badge, rows, titles };
  });
  const pass = m.badge === '5' && m.rows === 5 && m.titles.some((t) => /pixel/i.test(t ?? ''));
  await page.screenshot({ path: path.join(OUT, `biblioteca-${tag}.png`) });
  record('A2-biblioteca-5', pass, JSON.stringify(m), tag);
}

async function phoneLogrosExperiencia(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(600);
  await page.locator('[data-details]').click({ timeout: 8000 });
  await page.waitForTimeout(400);
  const hasExp = await page.locator('#chrome-experiencia-mobile').isVisible();
  const hasLog = await page.locator('#chrome-logros-mobile').isVisible();
  const logVisible = await page.evaluate(
    () => !!document.querySelector('#chrome-logros-mobile') && !document.querySelector('[data-intro-detail]')?.hidden,
  );
  await page.goto(`${BASE}#/leer/logros`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const leerLog = await page.evaluate(() => document.body.innerText.includes('Innova360'));
  await page.goto(`${BASE}#/leer/experiencia`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const leerExp = await page.evaluate(() => /Volaris|volaris/i.test(document.body.innerText));
  const pass = hasExp && hasLog && logVisible && leerLog && leerExp;
  await page.screenshot({ path: path.join(OUT, `phone-leer-sections-${tag}.png`) });
  record('M1-phone-sections', pass, `exp=${hasExp} log=${hasLog} leer=${leerLog}/${leerExp}`, tag);
}

async function charlasExpand(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('teresa'));
  await page.waitForTimeout(5000);
  await page.locator('[data-exp-expand]').click({ timeout: 8000 });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const box = document.querySelector('#game-canvas')?.dataset.interiorBox;
    const interior = document.querySelector('#game-canvas')?.dataset.interior;
    return { interior, box: box ? JSON.parse(box) : null, h: innerHeight };
  });
  const roomH = m.box ? m.box.b - m.box.t : 0;
  const pass = m.interior === 'teresa' && roomH > 55;
  await page.screenshot({ path: path.join(OUT, `charlas-expanded-${tag}.png`) });
  record('M2-charlas-room', pass, `interior=${m.interior} roomH=${Math.round(roomH)}`, tag);
}

async function estudioEs(page, tag) {
  await page.goto(`${BASE}#/leer/estudio`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('.reading-view__header .chrome__lang-opt[data-lang="es"]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  const bodyCheck = await page.evaluate(() => {
    const art = document.querySelector('.reading-view__article--about');
    const t = art?.textContent ?? '';
    return /Hola, me llamo Adonay/i.test(t) && !/Hey there, my name is/i.test(t);
  });
  const pass = bodyCheck;
  const first = await page.evaluate(
    () => document.querySelector('.reading-view__article--about')?.textContent?.slice(0, 80) ?? '',
  );
  await page.screenshot({ path: path.join(OUT, `estudio-es-${tag}.png`) });
  record('M3-estudio-es', pass && bodyCheck, first.slice(0, 60), tag);
}

async function landscapeSide(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const col = document.querySelector('.chrome__column');
    const intro = document.querySelector('.chrome__intro');
    const csCol = col ? getComputedStyle(col).display : 'none';
    const csIntro = intro ? getComputedStyle(intro).display : 'none';
    const sheet = intro?.getBoundingClientRect();
    return { csCol, csIntro, sheetH: sheet?.height ?? 0, vh: innerHeight };
  });
  const pass = m.csCol !== 'none' && m.sheetH < m.vh * 0.55;
  await page.screenshot({ path: path.join(OUT, `landscape-side-${tag}.png`) });
  record('M4-landscape-side', pass, JSON.stringify(m), tag);
}

async function touchTargets(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(500);
  const targets = await page.evaluate(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height };
    };
    return {
      center: q('.chrome__tools-phone [data-action="center"]'),
      sound: q('.chrome__tools-phone [data-action="sound"]'),
      search: q('.chrome__tools-phone [data-action="search"]'),
    };
  });
  const ok = (t) => t && t.w >= 44 && t.h >= 44;
  record('L-touch-tools', ok(targets.center) && ok(targets.sound) && ok(targets.search), JSON.stringify(targets), tag);
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser(chromium);

  const phone = await browser.newContext({
    ...devices['iPhone 12 Pro'],
    viewport: { width: 390, height: 844 },
    locale: 'es-VE',
  });
  const phonePage = await phone.newPage();
  await hideWebdriver(phonePage);
  await logrosCopy(phonePage, 'es', '390');
  await logrosCopy(phonePage, 'en', '390');
  await bibliotecaFive(phonePage, '390');
  await phoneLogrosExperiencia(phonePage, '390');
  await charlasExpand(phonePage, '390');
  await estudioEs(phonePage, '390');
  await touchTargets(phonePage, '390');
  await phone.close();

  const land = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
    locale: 'es-VE',
  });
  const landPage = await land.newPage();
  await hideWebdriver(landPage);
  await landscapeSide(landPage, '844x390');
  await land.close();

  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const deskPage = await desk.newPage();
  await hideWebdriver(deskPage);
  await logrosCopy(deskPage, 'es', '1280');
  await desk.close();

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n| ID | PASS | Viewport | Detail |');
  console.log('|----|------|----------|--------|');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${r.detail.slice(0, 80)} |`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} FAIL`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} checks PASS`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
