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

    const circleUi = await page.evaluate(() => {
      const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
      const headerText = cl?.querySelector('.checklist__header-text');
      const hit = cl?.querySelector('.checklist__ring-hit');
      const ringVis = cl?.querySelector('.checklist__ring-btn');
      const clRect = cl?.getBoundingClientRect();
      const ringRect = ringVis?.getBoundingClientRect();
      const ht = headerText ? getComputedStyle(headerText).display : '';
      const hitDisplay = hit ? getComputedStyle(hit).display : '';
      return {
        introCircle: cl?.classList.contains('checklist--phone-circle'),
        headerTextDisplay: ht,
        hitDisplay,
        ringInside:
          clRect && ringRect
            ? ringRect.left >= clRect.left - 1 &&
              ringRect.right <= clRect.right + 1 &&
              ringRect.top >= clRect.top - 1 &&
              ringRect.bottom <= clRect.bottom + 1
            : false,
      };
    });
    if (!circleUi.introCircle) errors.push(`${tag}: expected checklist--phone-circle when expanded`);
    if (circleUi.headerTextDisplay !== 'none') {
      errors.push(`${tag}: circle mode should hide header text (${circleUi.headerTextDisplay})`);
    }
    if (circleUi.hitDisplay === 'none') errors.push(`${tag}: circle ring-hit not shown`);
    if (!circleUi.ringInside && circleUi.hitDisplay !== 'block') {
      errors.push(`${tag}: ring button outside 48px circle`);
    }

    const clBox = await page.locator('.checklist').boundingBox();
    if (clBox) {
      await page.touchscreen.tap(clBox.x + clBox.width / 2, clBox.y + clBox.height / 2);
      await wait(350);
      const opened = await page.evaluate(() => {
        const cl = document.querySelector('.checklist');
        return cl && !cl.classList.contains('checklist--mobile-closed');
      });
      if (!opened) errors.push(`${tag}: tapping checklist circle did not open card`);
      else {
        await page.touchscreen.tap(clBox.x + clBox.width / 2, clBox.y + clBox.height / 2);
        await wait(300);
      }
    }

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

    await page.locator('[data-action="intro-close"]').click();
    await wait(450);
    const dock = await page.evaluate(() => ({
      dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
      layout: document.body.dataset.layout,
    }));
    if (!dock.dock || dock.layout !== 'map') errors.push(`${tag}: expected map dock after dismissing peek`);

    const overlap = await page.evaluate(() => {
      const targets = [
        { key: 'search', el: document.querySelector('.chrome__phone-topbar [data-action="search"]') },
        { key: 'sound', el: document.querySelector('.chrome__phone-topbar [data-action="sound"]') },
        { key: 'lang-en', el: document.querySelector('.chrome__phone-topbar [data-lang="en"]') },
        { key: 'lang-es', el: document.querySelector('.chrome__phone-topbar [data-lang="es"]') },
        { key: 'checklist', el: document.querySelector('.chrome__phone-topbar-checklist .checklist') },
      ];
      const rects = targets.map((t) => ({
        key: t.key,
        r: t.el?.getBoundingClientRect(),
      }));
      const failures = [];
      for (const { key, r } of rects) {
        if (!r || r.width < 2) {
          failures.push(`missing ${key}`);
          continue;
        }
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topEl = document.elementFromPoint(cx, cy);
        if (!topEl || !topEl.closest('.chrome, .checklist')) {
          failures.push(`${key} center not hittable`);
        } else if (key === 'lang-en' && !topEl.closest('[data-lang="en"]')) {
          failures.push(`lang-en center hits ${topEl.className}`);
        } else if (key === 'checklist' && !topEl.closest('.checklist')) {
          failures.push(`checklist center hits ${topEl.className}`);
        }
      }
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i].r;
          const b = rects[j].r;
          if (!a || !b) continue;
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 4 && overlapY > 4) {
            failures.push(`${rects[i].key} overlaps ${rects[j].key}`);
          }
        }
      }
      return failures;
    });
    for (const f of overlap) errors.push(`${tag}: dock top bar ${f}`);

    const recenter = await page.evaluate(() => {
      const btn = document.querySelector('.chrome__map-recenter');
      if (!btn || getComputedStyle(btn).display === 'none') return 'map recenter missing';
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit?.closest('[data-action="center"]')) return 'map recenter not hittable';
      return null;
    });
    if (recenter) errors.push(`${tag}: dock ${recenter}`);
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
