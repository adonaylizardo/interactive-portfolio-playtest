#!/usr/bin/env node
/** Batch r27 — pinned sheet header, dock circle, peek layout, r26 regression. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
const RING_C = 2 * Math.PI * 16.75;

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#boot').count()) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function touchDrag(page, from, to) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tapSelector(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!box) throw new Error(`tapSelector missing ${selector}`);
  await page.touchscreen.tap(box.x, box.y);
}

async function scrollIntroSwipes(page, count = 3) {
  const box = await page.locator('.chrome__intro').boundingBox();
  if (!box) throw new Error('intro missing for scroll');
  for (let i = 0; i < count; i++) {
    await touchDrag(
      page,
      { x: box.x + box.width / 2, y: box.y + box.height - 80 },
      { x: box.x + box.width / 2, y: box.y + 100 },
    );
    await wait(280);
  }
}

async function ensurePeek(page) {
  let st = await page.evaluate(() => ({
    peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
    expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
    dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
  }));
  if (st.expanded) {
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(400);
  } else if (st.dock) {
    await tapSelector(page, '[data-dock="intro"]');
    await wait(450);
  } else if (!st.peek) {
    await page.locator('[data-details]').tap();
    await wait(450);
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(400);
  }
  st = await page.evaluate(() => ({
    peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
  }));
  if (!st.peek) throw new Error('ensurePeek: not in peek');
}

async function main() {
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const w of [375, 430]) {
    const tag = `${w}`;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await boot(page);
    await page.locator('[data-details]').tap();
    await wait(550);
    await scrollIntroSwipes(page, 3);
    await wait(350);
    const h1 = await page.evaluate(() => {
      const intro = document.querySelector('.chrome__intro');
      const close = document.querySelector('[data-action="intro-close"]');
      const grab = document.querySelector('[data-intro-grab]');
      const cr = close?.getBoundingClientRect();
      const gr = grab?.getBoundingClientRect();
      return {
        scrollTop: intro?.scrollTop,
        closeY: cr?.top,
        closeH: cr?.height,
        grabY: gr?.top,
        grabH: gr?.height,
      };
    });
    metrics[`H1-scroll-${tag}`] = h1;
    if ((h1.scrollTop ?? 0) < 400) errors.push(`${tag} H1 scrollTop low ${h1.scrollTop}`);
    if ((h1.closeY ?? -9) < 12 || (h1.closeY ?? 999) > 220) {
      errors.push(`${tag} H1 close not pinned (${JSON.stringify(h1)})`);
    }
    if ((h1.grabY ?? -9) < 8 || (h1.grabY ?? 999) > 200) {
      errors.push(`${tag} H1 grab not pinned (${JSON.stringify(h1)})`);
    }
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(400);
    const afterClose = await page.evaluate(() => ({
      peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
    }));
    if (!afterClose.peek) errors.push(`${tag} H1 close after scroll failed`);
    await ctx.close();
  }

  for (const w of [375, 390, 414, 430]) {
    const tag = `${w}`;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await boot(page);
    await page.locator('[data-details]').tap();
    await wait(400);
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(350);
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(450);
    const m2 = await page.evaluate(() => {
      const c = document.querySelector('.checklist.checklist--phone-circle');
      const ring = c?.querySelector('.checklist__ring');
      const clip = c?.querySelector('.checklist__clipboard-figma');
      const fg = c?.querySelector('.checklist__ring-fg');
      const counter = c?.querySelector('.checklist__counter--in-ring');
      return {
        ringDisplay: ring ? getComputedStyle(ring).display : 'none',
        clipOk: !!(clip && clip.naturalWidth > 0),
        counter: counter?.textContent?.trim(),
        fgDisplay: fg ? getComputedStyle(fg).display : 'none',
      };
    });
    metrics[`M2-${tag}`] = m2;
    if (m2.ringDisplay === 'none' || m2.fgDisplay === 'none') {
      errors.push(`${tag} M2 ring hidden ${JSON.stringify(m2)}`);
    }
    if (!m2.clipOk) errors.push(`${tag} M2 clipboard missing`);
    if (!m2.counter || !/^\d+\/\d+$/.test(m2.counter)) errors.push(`${tag} M2 counter ${m2.counter}`);
    await ctx.close();
  }

  for (const lang of ['es', 'en']) {
    for (const w of [375, 390, 414, 430]) {
      const tag = `${lang}-${w}`;
      const ctx = await browser.newContext({
        viewport: { width: w, height: 812 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await ctx.newPage();
      await boot(page);
      const wantEn = lang === 'en';
      for (let i = 0; i < 5; i++) {
        const isEn = (await page.evaluate(() => document.documentElement.lang)) === 'en';
        if (isEn === wantEn) break;
        await page.locator('.chrome__tools-phone [data-action="lang-toggle"]').tap();
        await wait(280);
      }
      const st0 = await page.evaluate(() => ({
        peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
        expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
      }));
      if (st0.expanded) {
        await tapSelector(page, '[data-action="intro-close"]');
        await wait(400);
      } else if (!st0.peek) {
        await ensurePeek(page);
      }
      const m3 = await page.evaluate(() => {
        const blurb = document.querySelector('.chrome__intro .chrome__blurb');
        const row = document.querySelector('.chrome__intro .chrome__card-row');
        const strong = document.querySelector('.chrome__intro .chrome__card-id strong');
        const mono = document.querySelector('.chrome__intro .chrome__mono');
        const br = blurb?.getBoundingClientRect();
        const rr = row?.getBoundingClientRect();
        const sr = strong?.getBoundingClientRect();
        const mr = mono?.getBoundingClientRect();
        const cs = blurb ? getComputedStyle(blurb) : null;
        const clamped =
          cs && cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '0' && cs.webkitLineClamp !== '';
        return {
          gap: br && rr ? rr.top - br.bottom : 0,
          nameH: sr?.height,
          monoW: mr?.width,
          monoH: mr?.height,
          clamped,
          blurbScroll: blurb ? blurb.scrollHeight > blurb.clientHeight + 2 : false,
        };
      });
      metrics[`M3-${tag}`] = m3;
      if ((m3.gap ?? 0) < 12 || (m3.gap ?? 99) > 18) {
        errors.push(`${tag} M3 peek gap ${m3.gap}`);
      }
      if ((m3.nameH ?? 99) > 28) errors.push(`${tag} M3 name wraps h=${m3.nameH}`);
      if (!near(m3.monoW ?? 0, 48, 1) || !near(m3.monoH ?? 0, 48, 1)) {
        errors.push(`${tag} M3 mono ${m3.monoW}x${m3.monoH}`);
      }
      if (m3.clamped || m3.blurbScroll) errors.push(`${tag} M3 blurb clamped`);
      await ctx.close();
    }
  }

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await desk.newPage();
  await dPage.addInitScript(() => localStorage.removeItem('playtest-checklist-v3'));
  await boot(dPage);

  const l4 = await dPage.evaluate(() => {
    const arc = document.querySelector('.checklist .checklist__map-arc-fg');
    const circ = 2 * Math.PI * 16.75;
    const da = parseFloat(arc?.getAttribute('stroke-dasharray') || '0');
    const off = parseFloat(arc?.getAttribute('stroke-dashoffset') || '0');
    return { dasharray: da, offset: off, circ };
  });
  metrics.L4 = l4;
  if (!near(l4.dasharray, RING_C, 0.5) || !near(l4.offset, RING_C, 0.5)) {
    errors.push(`L4 map-arc attrs ${JSON.stringify(l4)}`);
  }

  await dPage.evaluate(() => {
    window.__playtestQa?.collapseChecklistForQa?.();
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': false,
      'walk-keys': false,
      'move-camera': false,
      zoom: false,
      'enter-building': false,
    });
  });
  await wait(200);
  const l5 = await dPage.evaluate(() => {
    const el = document.querySelector('body[data-chrome="desktop"] .checklist .checklist__counter--in-ring');
    const cs = el ? getComputedStyle(el) : null;
    return {
      fontSize: cs?.fontSize,
      fontWeight: cs?.fontWeight,
      lineHeight: cs?.lineHeight,
    };
  });
  metrics.L5 = l5;
  if (l5.fontSize !== '13px' || l5.fontWeight !== '500' || l5.lineHeight !== '16px') {
    errors.push(`L5 desktop counter ${JSON.stringify(l5)}`);
  }

  const ringY0 = await dPage.evaluate(() => {
    const wrap = document.querySelector('body[data-chrome="desktop"] .checklist .checklist__progress-wrap');
    return wrap?.getBoundingClientRect().y;
  });
  await dPage.evaluate(() => {
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': true,
      'walk-keys': true,
      'move-camera': true,
      zoom: true,
      'enter-building': true,
    });
  });
  await wait(450);
  const ringY5 = await dPage.evaluate(() => {
    const wrap = document.querySelector('body[data-chrome="desktop"] .checklist .checklist__progress-wrap');
    return wrap?.getBoundingClientRect().y;
  });
  metrics.L6 = { ringY0, ringY5, delta: Math.abs((ringY5 ?? 0) - (ringY0 ?? 0)) };
  if ((metrics.L6.delta ?? 9) > 0.5) errors.push(`L6 ring y shift ${metrics.L6.delta}`);

  await desk.close();
  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  const r26 = spawnSync('node', ['scripts/qa-batch-r26.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, QA_BASE_URL: BASE },
  });
  if (r26.status !== 0) {
    errors.push('qa-batch-r26 regression failed');
    console.error(r26.stdout?.slice(-800));
    console.error(r26.stderr?.slice(-800));
  }

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r27: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
