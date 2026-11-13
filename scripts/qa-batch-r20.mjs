#!/usr/bin/env node
/** Hostile QA batch r20 — measured rects on top of r19 suite. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootPhone(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-boot-start]', { timeout: 120000 });
  await page.locator('[data-boot-start]').click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
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
  await page.locator('[data-action="intro-close"]').click();
  await wait(350);
  await page.locator('[data-action="intro-close"]').click();
  await wait(450);
}

function rect(r) {
  if (!r) return null;
  return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
}

async function measureR20(page) {
  return await page.evaluate(() => {
    const failures = [];
    const tools = document.querySelector('.chrome__phone-topbar .chrome__tools-phone');
    const toolsStyle = tools ? getComputedStyle(tools) : null;
    const search = document.querySelector('.chrome__phone-topbar [data-action="search"]');
    const lang = document.querySelector('.chrome__phone-topbar [data-action="lang-toggle"]');
    const sr = search?.getBoundingClientRect();
    const lr = lang?.getBoundingClientRect();
    const tr = tools?.getBoundingClientRect();
    if (toolsStyle && parseFloat(toolsStyle.borderWidth) < 0.5) {
      failures.push(`tools pill missing border (${toolsStyle.borderWidth})`);
    }
    if (tr && (Math.abs(tr.width - 88) > 3 || Math.abs(tr.height - 48) > 3)) {
      failures.push(`tools pill not 88x48 (${tr?.width}x${tr?.height})`);
    }
    for (const [name, r] of [['search', sr], ['lang', lr]]) {
      if (!r || r.width < 2) failures.push(`${name} missing`);
      else if (Math.abs(r.width - 40) > 2 || Math.abs(r.height - 40) > 2) {
        failures.push(`${name} not 40px (${r.width}x${r.height})`);
      }
    }
    if (tr && Math.abs(tr.x - 16) > 3) failures.push(`tools pill x ${tr.x}`);

    const pill = document.querySelector('.chrome__phone-topbar-checklist .checklist.checklist--phone-pill');
    const pr = pill?.getBoundingClientRect();
    const vw = window.innerWidth;
    if (!pr || pr.height < 48) failures.push(`pill missing/small (${pr?.width}x${pr?.height})`);
    else {
      if (pr.width < 245) failures.push(`pill too narrow (${pr.width}px < 245)`);
      if (Math.abs(pr.height - 52) > 3) failures.push(`pill height ${pr.height}`);
      if (pr.right > vw - 14 || pr.right < vw - 18) failures.push(`pill right inset ${vw - pr.right}`);
    }

    const intro = document.querySelector('.chrome__intro');
    const ir = intro?.getBoundingClientRect();
    if (ir) {
      const targetW = vw - 32;
      if (Math.abs(ir.width - targetW) > 3) failures.push(`peek intro width ${ir.width} (want ${targetW})`);
      if (ir.height < 188 || ir.height > 224) failures.push(`peek intro height ${ir.height} (want 188-224)`);
    }

    return { failures, pill: pr ? { w: pr.width, h: pr.height, r: pr.right } : null };
  });
}

async function measureExpandedGap(page) {
  const details = page.locator('[data-details]');
  if (await details.isVisible({ timeout: 2000 }).catch(() => false)) {
    await details.click();
  } else {
    await page.evaluate(() => document.querySelector('[data-details]')?.click());
  }
  await wait(500);
  return await page.evaluate(() => {
    const failures = [];
    const leer = document.querySelector('.chrome__intro [data-action="reading"]');
    const h2 = document.querySelector('.chrome__intro .chrome__sheet-body h2');
    if (!leer || !h2) failures.push('leer or experiencia h2 missing');
    else {
      const gap = h2.getBoundingClientRect().top - leer.getBoundingClientRect().bottom;
      if (gap < 20 || gap > 28) failures.push(`Leer→Experiencia gap ${gap.toFixed(1)}px (want ~24)`);
    }
    return failures;
  });
}

async function measureOpenRingAlign(page) {
  await page.evaluate(() => {
    const btn = document.querySelector('.chrome__phone-topbar-checklist .checklist .checklist__ring-btn');
    btn?.click();
  });
  await wait(400);
  return await page.evaluate(() => {
    const failures = [];
    const cl = document.querySelector('.checklist.checklist--phone-open');
    if (!cl) return ['open card missing'];
    const headRing = cl.querySelector('.checklist__ring')?.getBoundingClientRect();
    const mark = cl.querySelector('.checklist__item-mark')?.getBoundingClientRect();
    if (headRing && mark) {
      const deltaC = Math.abs(headRing.left + headRing.width / 2 - (mark.left + mark.width / 2));
      if (deltaC > 2) failures.push(`header ring vs row mark Δcenter ${deltaC.toFixed(1)}px`);
    }
    const title = cl.querySelector('.checklist__active-title');
    if (title && getComputedStyle(title).whiteSpace !== 'nowrap') {
      failures.push('open title not nowrap');
    }
    return failures;
  });
}

async function measureDockViews(page) {
  return await page.evaluate(() => {
    const failures = [];
    const views = document.querySelector('.chrome__views');
    if (views && getComputedStyle(views).display !== 'none') {
      failures.push(`floating views visible in dock (${getComputedStyle(views).display})`);
    }
    return failures;
  });
}

async function runViewport(w, h, tag, errors) {
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
  try {
    await bootPhone(page);
    const m = await measureR20(page);
    for (const f of m.failures) errors.push(`${tag} arrival: ${f}`);

    const gapFails = await measureExpandedGap(page);
    for (const f of gapFails) errors.push(`${tag} expanded: ${f}`);

    await page.locator('[data-action="intro-close"]').click();
    await wait(350);

    const ringFails = await measureOpenRingAlign(page);
    for (const f of ringFails) errors.push(`${tag} open: ${f}`);

    await page.evaluate(() => {
      document.querySelector('.checklist.checklist--phone-open .checklist__ring-btn')?.click();
    });
    await wait(250);
    await dismissToDock(page);
    const dockFails = await measureDockViews(page);
    for (const f of dockFails) errors.push(`${tag} dock: ${f}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function main() {
  const errors = [];
  for (const [w, h, tag] of [
    [375, 812, '375x812'],
    [390, 844, '390x844'],
  ]) {
    await runViewport(w, h, tag, errors);
  }

  const r19 = spawnSync('node', ['scripts/qa-batch-r19.mjs', BASE], { cwd: ROOT, encoding: 'utf8' });
  if (r19.status !== 0) {
    for (const line of `${r19.stdout}\n${r19.stderr}`.split('\n').filter(Boolean)) {
      errors.push(line.replace(/^FAIL /, 'r19: '));
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    process.exit(1);
  }
  console.log('qa-batch-r20: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
