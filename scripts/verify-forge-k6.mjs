#!/usr/bin/env node
/** Forge QA k6 — builds on Sentinel R1 checks. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium, devices } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';
const OUT = path.join(ROOT, 'artifacts/forge-k6');

const results = [];
const record = (id, pass, detail, viewport = '—') => results.push({ id, pass, detail, viewport });

async function hideWebdriver(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
}

async function openTalkFromRoom(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForSelector('.building-panel--experience.building-panel--open', { timeout: 20000 });
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.locator('[data-exp-expand]').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const row = document.querySelector('.experience__row');
    if (!row) return false;
    const r = row.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }, { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.experience__row')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(800);
  const openBtn = page.locator('.talks-player__open');
  const btnBox = await openBtn.boundingBox();
  const btnOk = btnBox && btnBox.height >= 44 && btnBox.width >= 44;
  const btnVisible = await openBtn.isVisible();
  let thumbOpens = false;
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
    page.locator('.talks-player__thumb').click({ timeout: 5000 }).catch(() => {}),
  ]);
  thumbOpens = !!popup;
  await page.screenshot({ path: path.join(OUT, `talk-open-${tag}.png`) });
  record(`H1-talk-room-${tag}`, btnVisible && btnOk && thumbOpens, `btn=${btnVisible} ${btnBox?.width}x${btnBox?.height} thumb=${thumbOpens}`, tag);
}

async function charlasScreen(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => window.__playtestQa?.enterInterior?.('teresa'));
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.__playtestQa?.expandInteriorSheetForQa?.());
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const box = document.querySelector('#game-canvas')?.dataset.interiorBox;
    const parsed = box ? JSON.parse(box) : null;
    const roomH = parsed ? parsed.b - parsed.t : 0;
    const firstTitle = document.querySelector('.experience__row-title')?.textContent?.trim() ?? '';
    const sheet = document.querySelector('.building-panel__sheet')?.getBoundingClientRect();
    return { roomH, firstTitle, sheetTop: sheet?.top ?? 0, vh: innerHeight };
  });
  const titleOk = m.firstTitle.split(/\s+/).length >= 2;
  const pass = m.roomH >= 120 && m.sheetTop > m.vh * 0.35 && titleOk;
  await page.screenshot({ path: path.join(OUT, `charlas-phone-${tag}.png`) });
  record('M1-charlas-screen', pass, JSON.stringify(m), tag);
}

async function landscapeOverlap(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const home = document.querySelector('.chrome__rail [data-action="home"]');
    const tools = document.querySelector('.chrome__tools-phone');
    const hr = home?.getBoundingClientRect();
    const tr = tools?.getBoundingClientRect();
    const overlap = hr && tr ? !(hr.right < tr.left || tr.right < hr.left || hr.bottom < tr.top || tr.bottom < hr.top) : false;
    return { overlap, home: hr ? { x: hr.x, y: hr.y, w: hr.width, h: hr.height } : null };
  });
  let tapOk = false;
  if (m.home) {
    tapOk = await page.evaluate(
      ({ x, y, w, h }) => {
        const el = document.elementFromPoint(x + w / 2, y + h / 2);
        return !!el?.closest('.chrome__rail [data-action="home"]');
      },
      { x: m.home.x, y: m.home.y, w: m.home.w, h: m.home.h },
    );
  }
  await page.screenshot({ path: path.join(OUT, `landscape-overlap-${tag}.png`) });
  record('M2-landscape-tap', !m.overlap && tapOk, JSON.stringify({ ...m, tapOk }), tag);
}

async function historyB7B8(page, tag) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  const sheetBefore = await page.evaluate(() => !!document.querySelector('.chrome.chrome--sheet'));
  await page.goto(`${BASE}#/leer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.locator('.reading-view [data-back]').click({ timeout: 8000 });
  await page.waitForTimeout(700);
  const sheetAfter = await page.evaluate(() => !!document.querySelector('.chrome.chrome--sheet'));
  record('B7-sheet-restore', sheetAfter, `before=${sheetBefore} after=${sheetAfter}`, tag);

  await page.goto(BASE.replace(/#.*$/, ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    history.replaceState({ playtest: true }, '', `${location.pathname}${location.search}`);
  });
  await page.goto(`${BASE.replace(/#.*$/, '')}#/leer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.reading-view__row').filter({ hasText: /Volaris|Bain/i }).first().click();
  await page.waitForTimeout(400);
  const caseSlug = await page.evaluate(() => location.hash.replace('#/leer/', ''));
  await page.locator('[data-back-list]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-back]').click();
  await page.waitForFunction(() => !location.hash.includes('/leer'), { timeout: 8000 });
  const hashes = [];
  for (let i = 0; i < 3; i++) {
    await page.goForward().catch(() => {});
    await page.waitForTimeout(450);
    hashes.push(await page.evaluate(() => location.hash));
  }
  const listHit = hashes.find((h) => h.includes('#/leer') && !h.includes(`/${caseSlug}`));
  const caseHit = hashes.find((h) => h.includes(`/${caseSlug}`));
  const pass = !!listHit && !!caseHit && hashes.indexOf(listHit) < hashes.indexOf(caseHit);
  record('B8-forward-list', pass, hashes.join(' → '), tag);
}

async function main() {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(OUT, { recursive: true });

  const sentinel = spawnSync(process.execPath, [path.join(ROOT, 'scripts/verify-sentinel-r1.mjs'), BASE], {
    encoding: 'utf8',
  });
  if (sentinel.status !== 0) {
    console.error(sentinel.stdout || sentinel.stderr);
    process.exit(1);
  }

  const browser = await launchBrowser(chromium);
  for (const { w, h, tag, touch } of [
    { w: 390, h: 844, tag: '390', touch: true },
    { w: 844, h: 390, tag: '844x390', touch: true },
    { w: 1280, h: 800, tag: '1280', touch: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: touch,
      isMobile: w < 768,
      locale: 'es-VE',
      ...(w === 390 ? devices['iPhone 12 Pro'] : {}),
    });
    const page = await ctx.newPage();
    await hideWebdriver(page);
    await openTalkFromRoom(page, tag);
    if (tag === '390') await charlasScreen(page, tag);
    if (tag === '844x390') await landscapeOverlap(page, tag);
    await ctx.close();
  }

  const phone = await browser.newContext({ ...devices['iPhone 12 Pro'], viewport: { width: 390, height: 844 }, locale: 'es-VE' });
  const phonePage = await phone.newPage();
  await hideWebdriver(phonePage);
  await historyB7B8(phonePage, '390');
  await phone.close();
  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n| Forge k6 | PASS | Viewport | Detail |');
  for (const r of results) {
    console.log(`| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.viewport} | ${String(r.detail).slice(0, 72)} |`);
  }
  if (failed.length) process.exit(1);
  console.log(`\nForge k6: ${results.length} new checks PASS (+ Sentinel R1)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
