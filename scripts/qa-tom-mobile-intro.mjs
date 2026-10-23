#!/usr/bin/env node
/** Tom-style phone intro: peek card → Ver detalles → expanded sheet. */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const OUT = '/tmp/tom-mobile-intro-qa';
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function runViewport(viewportW, height, tag) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: viewportW, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  try {
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForSelector('[data-boot-start]', { timeout: 180000 });
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
    await wait(700);
    const peek = await page.evaluate(() => {
      const chrome = document.querySelector('.chrome');
      const intro = document.querySelector('.chrome__intro');
      const ir = intro?.getBoundingClientRect();
      const checklist = document.querySelector('.checklist');
      return {
        introPeek: chrome?.classList.contains('chrome--intro-peek'),
        introExpanded: chrome?.classList.contains('chrome--intro-expanded'),
        introHeight: ir?.height ?? 0,
        introBottom: ir ? window.innerHeight - ir.bottom : 0,
        audienceDisplay: document.querySelector('.chrome__audience')
          ? getComputedStyle(document.querySelector('.chrome__audience')).display
          : null,
        checklistTop: checklist?.getBoundingClientRect().top ?? 0,
      };
    });
    await page.screenshot({ path: path.join(OUT, `${tag}-peek.png`) });
    if (!peek.introPeek) errors.push(`${tag}: expected chrome--intro-peek`);
    if (peek.introExpanded) errors.push(`${tag}: intro should not start expanded`);
    if (peek.introHeight > 320) errors.push(`${tag}: peek card too tall (${peek.introHeight})`);
    if (peek.audienceDisplay !== 'none') errors.push(`${tag}: audience visible in peek`);
    if (peek.checklistTop > 120) errors.push(`${tag}: checklist not near top (${peek.checklistTop})`);
    const pillRight = await page.evaluate(() => document.querySelector('.checklist')?.getBoundingClientRect().right);
    if (pillRight && pillRight > viewportW + 2) {
      errors.push(`${tag}: checklist overflows right (${pillRight} > ${viewportW})`);
    }

    await page.locator('[data-details]').click();
    await wait(500);
    const expanded = await page.evaluate(() => ({
      introExpanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
      audienceVisible: (() => {
        const el = document.querySelector('.chrome__audience');
        return el ? getComputedStyle(el).display !== 'none' : false;
      })(),
      checklistW: document.querySelector('.checklist')?.getBoundingClientRect().width ?? 0,
    }));
    await page.screenshot({ path: path.join(OUT, `${tag}-expanded.png`) });
    if (!expanded.introExpanded) errors.push(`${tag}: expected expanded sheet`);
    if (!expanded.audienceVisible) errors.push(`${tag}: audience hidden when expanded`);
    if (expanded.checklistW > 52) errors.push(`${tag}: checklist not shrunk (${expanded.checklistW})`);

    await page.locator('[data-action="intro-close"]').click();
    await wait(400);
    const afterClose = await page.evaluate(() => ({
      introPeek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
      introExpanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
    }));
    await page.screenshot({ path: path.join(OUT, `${tag}-after-close.png`) });
    if (!afterClose.introPeek || afterClose.introExpanded) {
      errors.push(`${tag}: close should collapse to peek card`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  return errors;
}

const allErrors = [];
for (const [w, h, tag] of [
  [375, 812, '375x812'],
  [390, 844, '390x844'],
]) {
  const errs = await runViewport(w, h, tag);
  allErrors.push(...errs);
}

if (allErrors.length) {
  for (const e of allErrors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`qa-tom-mobile-intro: ok (shots in ${OUT})`);
