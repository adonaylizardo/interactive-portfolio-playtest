#!/usr/bin/env node
/** Hostile QA batch r19 — measured rects + console errors. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootPhone(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-boot-start]', { timeout: 180000 });
  await page.locator('[data-boot-start]').click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
  await wait(600);
}

async function assertNoConsoleErrors(page, tag, errors) {
  const logs = await page.evaluate(() => window.__qaConsoleErrors ?? []);
  for (const e of logs) errors.push(`${tag}: console ${e}`);
}

async function phoneArrival(page, tag, errors) {
  const d = await page.evaluate(() => {
    const failures = [];
    const tools = document.querySelector('.chrome__tools-phone');
    const search = document.querySelector('.chrome__phone-topbar [data-action="search"]');
    const lang = document.querySelector('.chrome__phone-topbar [data-action="lang-toggle"]');
    const soundTop = document.querySelector('.chrome__phone-topbar [data-action="sound"]');
    const soundIntro = document.querySelector('.chrome__intro-toolbar [data-action="sound"]');
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    if (soundTop && getComputedStyle(soundTop).display !== 'none') failures.push('sound still in top bar');
    if (!soundIntro || getComputedStyle(soundIntro).display === 'none') failures.push('sound missing in intro toolbar');
    if (!lang) failures.push('lang toggle missing');
    for (const el of [search, lang]) {
      const r = el?.getBoundingClientRect();
      if (!r || r.width < 2) continue;
      if (Math.abs(r.width - 40) > 3 || Math.abs(r.height - 40) > 3) {
        failures.push(`control not 40px (${el?.getAttribute('data-action')} ${r.width}x${r.height})`);
      }
    }
    const clRect = cl?.getBoundingClientRect();
    if (clRect && (clRect.height < 48 || clRect.height > 56)) {
      failures.push(`arrival pill height ${clRect.height}`);
    }
    if (!cl?.classList.contains('checklist--phone-pill')) failures.push('arrival should be pill not circle');
    const label = cl?.querySelector('.checklist__label');
    if (label && label.scrollWidth > label.clientWidth + 1) {
      failures.push(`label ellipsis/clipped ${label.scrollWidth}>${label.clientWidth}`);
    }
    const br = cl ? parseFloat(getComputedStyle(cl).borderTopLeftRadius) : 0;
    if (br < 20) failures.push(`checklist radius ${br}`);
    const views = document.querySelector('.chrome__views');
    if (views && getComputedStyle(views).display !== 'none') failures.push('floating views visible on arrival');
    return failures;
  });
  for (const f of d) errors.push(`${tag}: ${f}`);
}

async function phoneDock(page, tag, errors) {
  const details = page.locator('[data-details]');
  if (await details.isVisible({ timeout: 2000 }).catch(() => false)) {
    await details.click();
  } else {
    await page.evaluate(() => document.querySelector('[data-details]')?.click());
  }
  await wait(450);
  await page.locator('[data-action="intro-close"]').click();
  await wait(350);
  await page.locator('[data-action="intro-close"]').click();
  await wait(450);
  const d = await page.evaluate(() => {
    const failures = [];
    const views = document.querySelector('.chrome__views');
    if (views && getComputedStyle(views).display !== 'none') failures.push('floating views on dock');
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    if (!cl?.classList.contains('checklist--phone-circle')) failures.push('dock should be circle not pill');
    return failures;
  });
  for (const f of d) errors.push(`${tag}: dock ${f}`);
}

async function desktopChecks(page, tag, errors) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-boot-start]', { timeout: 120000 });
  await page.locator('[data-boot-start]').click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
  await wait(800);
  const d = await page.evaluate(() => {
    const failures = [];
    const lang = document.querySelector('.chrome__lang');
    const rail = document.querySelector('.chrome__tools-stack');
    if (!lang?.classList.contains('chrome__lang--in-rail')) failures.push('desktop lang not in rail');
    const lr = lang?.getBoundingClientRect();
    const rr = rail?.getBoundingClientRect();
    if (lr && rr && lr.top < rr.top - 4) failures.push('lang floats above rail tools');
    const cl = document.querySelector('.checklist');
    cl?.classList.add('checklist--collapsed');
    const ring = cl?.querySelector('.checklist__ring-btn');
    const header = cl?.querySelector('.checklist__header');
    const ringR = ring?.getBoundingClientRect();
    const headR = header?.getBoundingClientRect();
    if (ringR && headR) {
      if (Math.abs(ringR.width - 40) > 2) failures.push(`desktop collapsed ring ${ringR.width}px`);
      if (ringR.right > headR.right - 4 || ringR.top < headR.top + 4) {
        failures.push('desktop ring not inset in header');
      }
    }
    cl?.classList.remove('checklist--collapsed');
    return failures;
  });
  for (const f of d) errors.push(`${tag}: ${f}`);
}

async function runPhone(w, h, tag) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const page = await ctx.newPage();
  const errors = [];
  await page.addInitScript(() => {
    window.__qaConsoleErrors = [];
    window.addEventListener('error', (e) => window.__qaConsoleErrors.push(String(e.message)));
  });
  try {
    await bootPhone(page);
    await phoneArrival(page, `${tag} arrival`, errors);
    await phoneDock(page, `${tag}`, errors);
    await assertNoConsoleErrors(page, tag, errors);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return errors;
}

async function main() {
  const all = [];
  for (const [w, h, tag] of [
    [375, 812, '375x812'],
    [390, 844, '390x844'],
    [414, 896, '414x896'],
    [430, 932, '430x932'],
  ]) {
    all.push(...(await runPhone(w, h, tag)));
  }
  const browser = await chromium.launch();
  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await deskCtx.addInitScript(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  const page = await deskCtx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') all.push(`desktop: console ${msg.text()}`);
  });
  try {
    await desktopChecks(page, '1440x900', all);
  } finally {
    await deskCtx.close();
    await browser.close();
  }
  const { spawnSync } = await import('node:child_process');
  const phoneTop = spawnSync('node', ['scripts/qa-phone-topbar.mjs', BASE], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (phoneTop.status !== 0) {
    for (const line of (phoneTop.stderr || phoneTop.stdout || '').split('\n').filter(Boolean)) {
      all.push(line.replace(/^FAIL /, ''));
    }
  }
  if (all.length) {
    for (const e of all) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('qa-batch-r19: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
