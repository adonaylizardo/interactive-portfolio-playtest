#!/usr/bin/env node
/** Batch r26 — touch/drag measured asserts + r25 regression hooks. */
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

async function ringProgress(page, rootSel = 'body[data-chrome="desktop"] .checklist') {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const fg = root?.querySelector('.checklist__ring-fg');
    const raw = fg?.style.strokeDashoffset || fg?.getAttribute('stroke-dashoffset');
    const off = raw != null && raw !== '' ? parseFloat(raw) : NaN;
    const circ = 2 * Math.PI * 16.75;
    return { offset: off, fill: Number.isFinite(off) ? 1 - off / circ : NaN };
  }, rootSel);
}

async function main() {
  const errors = [];
  const metrics = {};
  const browser = await chromium.launch();

  for (const w of [375, 390, 414, 430]) {
    const tag = `${w}`;
    const ctx = await browser.newContext({
      viewport: { width: w, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') logs.push(m.text());
    });
    await boot(page);

    await page.locator('[data-details]').tap();
    await wait(600);
    const h1 = await page.evaluate(() => {
      const topbar = document.querySelector('[data-phone-topbar]');
      const tb = topbar ? getComputedStyle(topbar) : null;
      const title = document.querySelector('.chrome__intro .chrome__title');
      const tr = title?.getBoundingClientRect();
      const intro = document.querySelector('.chrome__intro');
      return {
        topbarVis: tb?.visibility,
        topbarPE: tb?.pointerEvents,
        titleTop: tr?.top,
        expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
      };
    });
    metrics[`H1-expand-${tag}`] = h1;
    if (h1.topbarVis !== 'hidden' || h1.topbarPE !== 'none') {
      errors.push(`${tag} H1 topbar should not intercept (${JSON.stringify(h1)})`);
    }
    if ((h1.titleTop ?? 0) < 24) errors.push(`${tag} H1 title under chrome (${h1.titleTop})`);

    await tapSelector(page, '[data-action="intro-close"]');
    await wait(400);
    const afterClose = await page.evaluate(() => ({
      open: !!document.querySelector('.checklist--phone-open'),
      peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
    }));
    metrics[`H1-close-${tag}`] = afterClose;
    if (afterClose.open) errors.push(`${tag} H1 close opened checklist`);

    await page.locator('[data-details]').tap();
    await wait(500);
    const grab = page.locator('[data-intro-grab]');
    const gb = await grab.boundingBox();
    if (gb) {
      await touchDrag(
        page,
        { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 },
        { x: gb.x + gb.width / 2, y: gb.y + gb.height / 2 + 120 },
      );
      await wait(450);
    }
    const afterDrag = await page.evaluate(() => ({
      peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
      expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
    }));
    metrics[`H1-drag-${tag}`] = afterDrag;
    if (!afterDrag.peek || afterDrag.expanded) {
      errors.push(`${tag} H1 grab drag should collapse to peek ${JSON.stringify(afterDrag)}`);
    }

    await page.locator('[data-details]').tap();
    await wait(500);
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(350);
    await tapSelector(page, '[data-action="intro-close"]');
    await wait(450);
    const dock = await page.evaluate(() => {
      const d = document.querySelector('.chrome__dock')?.getBoundingClientRect();
      const wantBottom = window.innerHeight - 16;
      return { bottom: d?.bottom, wantBottom, y: d?.y };
    });
    metrics[`M4-${tag}`] = dock;
    if (!near(dock.bottom ?? 0, dock.wantBottom, 4)) {
      errors.push(`${tag} M4 dock bottom ${dock.bottom} want ~${dock.wantBottom}`);
    }

    const circle = await page.evaluate((vw) => {
      const cl = document.querySelector('.checklist.checklist--phone-circle');
      const r = cl?.getBoundingClientRect();
      const ring = cl?.querySelector('.checklist__ring-fg');
      const vis = ring ? getComputedStyle(ring).display : 'none';
      return { x: r?.x, y: r?.y, w: r?.width, h: r?.height, wantX: vw - 64, ringDisplay: vis };
    }, w);
    metrics[`L7-${tag}`] = circle;
    if (!near(circle.x ?? 0, circle.wantX ?? 0, 3) || !near(circle.w ?? 0, 48)) {
      errors.push(`${tag} L7 circle ${JSON.stringify(circle)}`);
    }
    if (circle.ringDisplay === 'none') errors.push(`${tag} L7 ring not visible`);

    const tools = await page.evaluate(() => {
      const search = document.querySelector('.chrome__tools-phone [data-action="search"]');
      const lang = document.querySelector('.chrome__tools-phone [data-action="lang-toggle"]');
      return { sx: search?.getBoundingClientRect().left, lx: lang?.getBoundingClientRect().left };
    });
    metrics[`L8-${tag}`] = tools;
    if (w === 375 && (!near(tools.sx ?? 0, 20) || !near(tools.lx ?? 0, 60))) {
      errors.push(`${tag} L8 tools x ${JSON.stringify(tools)}`);
    }

    if (logs.length) errors.push(`${tag} console: ${logs.slice(0, 2).join('; ')}`);
    await ctx.close();
  }

  const deskRing = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ringPage = await deskRing.newPage();
  await ringPage.addInitScript(() => localStorage.removeItem('playtest-checklist-v3'));
  await boot(ringPage);
  await ringPage.evaluate(() => {
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': false,
      'walk-keys': false,
      'move-camera': false,
      zoom: false,
      'enter-building': false,
    });
  });
  await wait(250);
  const h2a = await ringProgress(ringPage);
  metrics.H2_0 = h2a;
  if (!near(h2a.offset ?? 0, RING_C, 2)) errors.push(`H2 0/5 offset ${h2a.offset} want ${RING_C}`);

  await ringPage.evaluate(() => {
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': true,
      'walk-keys': false,
      'move-camera': true,
      zoom: false,
      'enter-building': false,
    });
  });
  await wait(250);
  const h2b = await ringProgress(ringPage);
  metrics.H2_2 = { ...h2b, expectedFill: 0.4, note: '2/5 desktop steps' };
  if (!near(h2b.offset ?? 0, RING_C * 0.6, 2)) errors.push(`H2 2/5 offset ${h2b.offset}`);

  await ringPage.evaluate(() => {
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': true,
      'walk-keys': true,
      'move-camera': true,
      zoom: true,
      'enter-building': true,
    });
  });
  await wait(200);
  const h2c = await ringProgress(ringPage);
  metrics.H2_4 = h2c;
  if ((h2c.offset ?? 99) > 1) errors.push(`H2 5/5 offset ${h2c.offset}`);

  const mRing = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
  });
  const mRingPage = await mRing.newPage();
  await mRingPage.addInitScript(() => localStorage.removeItem('playtest-checklist-v3'));
  await boot(mRingPage);
  await mRingPage.evaluate(() => {
    window.__playtestQa?.setChecklistProgressForQa?.({
      'walk-around': true,
      'move-camera': true,
      zoom: false,
      'enter-building': false,
    });
  });
  await wait(250);
  const h2phone = await ringProgress(
    mRingPage,
    '.chrome__phone-topbar-checklist .checklist.checklist--phone-pill',
  );
  metrics.H2_phone_2_4 = h2phone;
  if (!near(h2phone.offset ?? 0, RING_C * 0.5, 2)) errors.push(`H2 phone 2/4 offset ${h2phone.offset}`);
  await mRing.close();

  await deskRing.close();

  const enCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const enPage = await enCtx.newPage();
  await boot(enPage);
  for (let i = 0; i < 4; i++) {
    if ((await enPage.evaluate(() => document.documentElement.lang)) === 'en') break;
    await enPage.locator('.chrome__tools-phone [data-action="lang-toggle"]').tap();
    await wait(280);
  }
  const introState = await enPage.evaluate(() => ({
    peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
    expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
  }));
  if (introState.expanded) {
    await tapSelector(enPage, '[data-action="intro-close"]');
    await wait(450);
  } else if (!introState.peek) {
    await enPage.locator('[data-details]').tap();
    await wait(500);
    await tapSelector(enPage, '[data-action="intro-close"]');
    await wait(450);
  }
  const m5 = await enPage.evaluate(() => {
    const blurb = document.querySelector('.chrome__intro .chrome__blurb');
    const row = document.querySelector('.chrome__intro .chrome__card-row');
    const br = blurb?.getBoundingClientRect();
    const rr = row?.getBoundingClientRect();
    const cs = blurb ? getComputedStyle(blurb) : null;
    const clamped =
      cs && cs.webkitLineClamp !== 'none' && cs.webkitLineClamp !== '0' && cs.webkitLineClamp !== '';
    return {
      gap: rr && br ? rr.top - br.bottom : 0,
      clamped,
      scrollH: blurb?.scrollHeight ?? 0,
      clientH: blurb?.clientHeight ?? 0,
      hasBlurb: !!blurb,
    };
  });
  metrics.M5 = m5;
  if (!m5.hasBlurb) errors.push('M5 EN peek blurb missing');
  if ((m5.gap ?? 0) < 12) errors.push(`M5 EN peek gap ${m5.gap}`);
  if (m5.clamped) errors.push('M5 EN blurb line-clamp still on');
  if (m5.scrollH > m5.clientH + 2) errors.push(`M5 EN blurb clipped ${m5.scrollH} > ${m5.clientH}`);
  await enCtx.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await desk.newPage();
  await boot(dPage);
  await dPage.locator('.chrome__rail [data-action="home"]').click();
  await wait(300);
  const m3before = await dPage.evaluate(() =>
    getComputedStyle(document.querySelector('.chrome__column .chrome__header')).position,
  );
  await dPage.evaluate(() =>
    document.querySelector('.chrome__column')?.scrollTo({ top: 2400, behavior: 'auto' }),
  );
  await wait(200);
  const m3 = await dPage.evaluate(() => {
    const h = document.querySelector('.chrome__column .chrome__header')?.getBoundingClientRect();
    return { position: getComputedStyle(document.querySelector('.chrome__column .chrome__header')).position, top: h?.top };
  });
  metrics.M3 = { before: m3before, ...m3 };
  if (m3.position !== 'sticky' || (m3.top ?? 99) > 2) {
    errors.push(`M3 sticky header ${JSON.stringify(metrics.M3)}`);
  }
  const m6 = await dPage.evaluate(() => !document.querySelector('[data-exp-list]'));
  metrics.M6 = m6;
  if (!m6) errors.push('M6 data-exp-list still in DOM');
  await desk.close();

  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    console.error('RING_C', RING_C);
    process.exit(1);
  }
  console.log('qa-batch-r26: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
// ensure failures exit non-zero
process.on('unhandledRejection', () => process.exit(1));
