#!/usr/bin/env node
/** Phone top bar flex row + checklist pill/circle/open-card (hostile QA r16). */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const INSET = 16;

function topBarTargets() {
  return [
    { key: 'search', sel: '.chrome__phone-topbar [data-action="search"]' },
    { key: 'lang-toggle', sel: '.chrome__phone-topbar [data-action="lang-toggle"]' },
    { key: 'checklist', sel: '.chrome__phone-topbar-checklist .checklist' },
  ];
}

async function assertTopBar(page, tag, errors) {
  const overlap = await page.evaluate((targets) => {
    const rects = targets.map((t) => {
      const el = document.querySelector(t.sel);
      const style = el ? getComputedStyle(el) : null;
      return {
        key: t.key,
        r: el?.getBoundingClientRect(),
        hidden: style?.display === 'none' || style?.visibility === 'hidden',
      };
    });
    const failures = [];
    for (const { key, r, hidden } of rects) {
      if (hidden) {
        failures.push(`${key} hidden`);
        continue;
      }
      if (!r || r.width < 2) {
        failures.push(`missing ${key}`);
        continue;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const topEl = document.elementFromPoint(cx, cy);
      const hitOk =
        key === 'search'
          ? topEl?.closest('[data-action="search"]')
          : key === 'lang-toggle'
            ? topEl?.closest('[data-action="lang-toggle"]')
            : topEl?.closest('.chrome__phone-topbar-checklist .checklist');
      if (!hitOk) failures.push(`${key} not hittable at center`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        if (!a || !b || rects[i].hidden || rects[j].hidden) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 4 && oy > 4) failures.push(`${rects[i].key} overlaps ${rects[j].key}`);
      }
    }
    const tools = document.querySelector('.chrome__phone-topbar .chrome__tools-phone');
    const toolsRect = tools?.getBoundingClientRect();
    const toolsStyle = tools ? getComputedStyle(tools) : null;
    if (toolsRect && toolsStyle && toolsRect.width > 96) {
      failures.push(`tools cluster too wide (${Math.round(toolsRect.width)}px)`);
    }
    const toolsBorder = toolsStyle ? parseFloat(toolsStyle.borderTopWidth) : 0;
    if (toolsBorder > 0) failures.push('tools host has outer border');
    return failures;
  }, topBarTargets());
  for (const f of overlap) errors.push(`${tag}: top bar ${f}`);
}

async function closeChecklistIfOpen(page) {
  const open = await page.evaluate(() => document.querySelector('.checklist.checklist--phone-open') != null);
  if (!open) return;
  await page.evaluate(() => {
    const btn = document.querySelector('.checklist.checklist--phone-open .checklist__ring-btn');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(350);
}

async function tapChecklistPill(page) {
  return await page.evaluate(() => {
    const host = document.querySelector('.chrome__phone-topbar-checklist');
    const cl =
      host?.querySelector('.checklist.checklist--mobile-closed') ??
      document.querySelector('.checklist.checklist--phone-open');
    if (!cl) return false;
    const hit = cl.querySelector('.checklist__ring-hit');
    const btn = cl.querySelector('.checklist__ring-btn');
    if (hit && getComputedStyle(hit).display !== 'none') hit.click();
    else btn?.click();
    return true;
  });
}

async function assertOpenCard(page, tag, errors) {
  await wait(350);
  try {
    await page.waitForFunction(
      () => {
        const cl = document.querySelector('.checklist.checklist--phone-open');
        return cl != null && cl.getBoundingClientRect().top < 200;
      },
      { timeout: 4000 },
    );
  } catch {
    /* evaluated below */
  }
  const card = await page.evaluate(({ inset }) => {
      const overlapArea = (a, b) => {
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return ox > 0 && oy > 0 ? ox * oy : 0;
      };
      const cl = document.querySelector('.checklist.checklist--phone-open');
      if (!cl) return { ok: false, why: 'no open card' };
      const rect = cl.getBoundingClientRect();
      const tools = document.querySelector('.chrome__tools-phone');
      const closed = document.querySelector('.chrome__phone-topbar-checklist .checklist');
      let anchorBottom = inset + 52;
      if (tools) anchorBottom = Math.max(anchorBottom, tools.getBoundingClientRect().bottom);
      if (closed && closed.getBoundingClientRect().height > 8) {
        anchorBottom = Math.max(anchorBottom, closed.getBoundingClientRect().bottom);
      }
      const minTop = anchorBottom + 8;
      const skip = cl.querySelector('.checklist__skip');
      const skipRect = skip?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const failures = [];
      if (rect.top < minTop - 2) {
        failures.push(`top ${Math.round(rect.top)} < anchor+8 (${Math.round(minTop)})`);
      }
      if (rect.top < inset - 2 || rect.left < -2 || rect.bottom > vh + 2 || rect.right > vw + 2) {
        failures.push(`card outside viewport (${rect.top},${rect.left},${rect.width}x${rect.height})`);
      }
      if (Math.abs(rect.right - (vw - inset)) > 3) {
        failures.push(`right inset not 16 (right=${rect.right})`);
      }
      for (const sel of [
        '.chrome__phone-topbar [data-action="lang-toggle"]',
        '.chrome__phone-topbar [data-action="search"]',
      ]) {
        const el = document.querySelector(sel);
        if (!el || getComputedStyle(el).display === 'none') continue;
        const er = el.getBoundingClientRect();
        const area = overlapArea(rect, er);
        if (area > 64) failures.push(`card overlaps ${sel} (${Math.round(area)}px²)`);
      }
      const intro = document.querySelector('.chrome__intro');
      const dock = document.querySelector('.chrome__dock');
      const introTop = intro && intro.offsetParent ? intro.getBoundingClientRect().top : null;
      const dockTop = dock && dock.offsetParent ? dock.getBoundingClientRect().top : null;
      const limit = Math.min(
        introTop != null && introTop > rect.top + 40 ? introTop - 8 : vh,
        dockTop != null && dockTop > rect.top + 40 ? dockTop - 8 : vh,
      );
      if (rect.bottom > limit + 4) {
        failures.push(`card bottom ${Math.round(rect.bottom)} past sheet/dock limit ${Math.round(limit)}`);
      }
      if (skipRect) {
        const cx = skipRect.left + skipRect.width / 2;
        const cy = skipRect.top + skipRect.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit?.closest('.checklist__skip')) failures.push('Saltar tutorial not hittable');
      }
      return { ok: failures.length === 0, failures, rect };
    }, INSET);
  if (!card.ok) {
    for (const f of card.failures ?? [card.why]) errors.push(`${tag}: open card ${f}`);
  }
}

async function assertCircleOk(page, tag, errors) {
  const d = await page.evaluate((inset) => {
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    const clRect = cl?.getBoundingClientRect();
    const ring =
      cl?.querySelector('.checklist__ring-figma') ?? cl?.querySelector('.checklist__ring-btn');
    const ringRect = ring?.getBoundingClientRect();
    const counter = cl?.querySelector('.checklist__counter--label');
    const counterRect = counter?.getBoundingClientRect();
    const counterVis =
      counter && getComputedStyle(counter).display !== 'none' && counterRect && counterRect.width > 2;
    const vw = window.innerWidth;
    const failures = [];
    const circle = cl?.classList.contains('checklist--phone-circle');
    const pill = cl?.classList.contains('checklist--phone-pill');
    if (!circle && !pill) failures.push('missing phone mode class');
    if (circle && clRect) {
      if (Math.abs(clRect.width - 48) > 2 || Math.abs(clRect.height - 48) > 2) {
        failures.push(`circle not 48x48 (${clRect.width}x${clRect.height})`);
      }
      if (clRect.right > vw - inset + 2) failures.push(`circle past right inset (right=${clRect.right})`);
      if (clRect.left < inset - 2) failures.push(`circle past left edge`);
      if (counterVis) failures.push('counter text visible in circle mode');
      if (ringRect && clRect) {
        const ccx = clRect.left + clRect.width / 2;
        const ccy = clRect.top + clRect.height / 2;
        const rcx = ringRect.left + ringRect.width / 2;
        const rcy = ringRect.top + ringRect.height / 2;
        if (Math.abs(rcx - ccx) > 1 || Math.abs(rcy - ccy) > 1) {
          failures.push(`ring off center (${(rcx - ccx).toFixed(1)},${(rcy - ccy).toFixed(1)})`);
        }
        if (
          ringRect.left < clRect.left - 0.5 ||
          ringRect.top < clRect.top - 0.5 ||
          ringRect.right > clRect.right + 0.5 ||
          ringRect.bottom > clRect.bottom + 0.5
        ) {
          failures.push('ring spills outside circle box');
        }
      }
    }
    return { failures, circle, pill };
  }, INSET);
  for (const f of d.failures) errors.push(`${tag}: ${f}`);
}

async function assertDockChecklistRadius(page, tag, errors) {
  const d = await page.evaluate(() => {
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    if (!cl) return ['missing dock checklist'];
    const br = parseFloat(getComputedStyle(cl).borderTopLeftRadius);
    if (br < 20) return [`checklist not rounded in dock (radius ${br})`];
    return [];
  });
  for (const f of d) errors.push(`${tag}: ${f}`);
}

async function assertPillLabel(page, tag, errors) {
  const d = await page.evaluate(() => {
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist.checklist--phone-pill');
    if (!cl) return { ok: true };
    const label = cl.querySelector('.checklist__label');
    const counter = cl.querySelector('.checklist__counter--label');
    const labelText = label?.textContent?.trim() ?? '';
    const failures = [];
    if (labelText.includes('…') || labelText.endsWith('...')) {
      failures.push(`label truncated (${labelText})`);
    }
    if (label && getComputedStyle(label).display !== 'none') {
      if (label.scrollWidth > label.clientWidth + 1) {
        failures.push(`label clips (${label.scrollWidth} > ${label.clientWidth})`);
      }
      const lr = label.getBoundingClientRect();
      const cr = counter?.getBoundingClientRect();
      if (cr && cr.width > 1) {
        const ox = Math.min(lr.right, cr.right) - Math.max(lr.left, cr.left);
        const oy = Math.min(lr.bottom, cr.bottom) - Math.max(lr.top, cr.top);
        if (ox > 1 && oy > 1) failures.push('label intersects counter');
      }
    }
    const br = parseFloat(getComputedStyle(cl).borderTopLeftRadius);
    if (br < 20) failures.push(`pill not rounded (radius ${br})`);
    return { ok: failures.length === 0, failures };
  });
  if (!d.ok) for (const f of d.failures) errors.push(`${tag}: pill ${f}`);
}

async function assertMapRecenter(page, tag, errors, expectVisible) {
  const d = await page.evaluate(() => {
    const btn = document.querySelector('.chrome__map-recenter');
    if (!btn) return { missing: true };
    const style = getComputedStyle(btn);
    const rect = btn.getBoundingClientRect();
    return { display: style.display, hidden: style.display === 'none', rect };
  });
  if (d.missing) {
    errors.push(`${tag}: map recenter missing`);
    return;
  }
  if (expectVisible && d.hidden) errors.push(`${tag}: map recenter hidden`);
  if (!expectVisible && !d.hidden && d.rect.width > 2) {
    errors.push(`${tag}: map recenter should be hidden`);
  }
}

async function bootPhone(page) {
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('[data-boot-start]', { timeout: 180000 });
  await page.locator('[data-boot-start]').click();
  await page.waitForFunction(() => !document.getElementById('boot'), { timeout: 60000 });
  await wait(600);
}

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
    await bootPhone(page);

    await assertTopBar(page, `${tag} peek`, errors);
    await assertPillLabel(page, `${tag} peek`, errors);
    await assertMapRecenter(page, `${tag} peek`, errors, true);

    await page.locator('[data-details]').click();
    await wait(450);
    await assertTopBar(page, `${tag} expanded`, errors);
    await assertCircleOk(page, `${tag} expanded`, errors);
    await assertMapRecenter(page, `${tag} expanded`, errors, false);

    if (await tapChecklistPill(page)) {
      await assertOpenCard(page, `${tag} expanded-open`, errors);
      await closeChecklistIfOpen(page);
    }

    await closeChecklistIfOpen(page);
    await page.locator('[data-action="intro-close"]').click();
    await wait(350);
    await assertTopBar(page, `${tag} peek-after-close`, errors);

    await closeChecklistIfOpen(page);
    await page.locator('[data-action="intro-close"]').click();
    await wait(450);
    await assertTopBar(page, `${tag} dock`, errors);
    await assertPillLabel(page, `${tag} dock`, errors);
    await assertDockChecklistRadius(page, `${tag} dock`, errors);
    await assertMapRecenter(page, `${tag} dock`, errors, true);

    await page.locator('.chrome__phone-topbar [data-action="lang-toggle"]').click();
    await wait(200);
    await assertTopBar(page, `${tag} dock-after-EN`, errors);
    await page.locator('.chrome__phone-topbar [data-action="lang-toggle"]').click();
    await wait(200);

    if (await tapChecklistPill(page)) {
      await assertOpenCard(page, `${tag} dock-open`, errors);
      await closeChecklistIfOpen(page);
    }

    await closeChecklistIfOpen(page);
    await page.locator('[data-dock="intro"]').click();
    await wait(450);
    await page.locator('[data-details]').click();
    await wait(400);
    await page.locator('.chrome.chrome--sheet .chrome__intro [data-action="reading"]').click();
    await wait(500);
    await page.goBack();
    await wait(600);
    await assertCircleOk(page, `${tag} after-reader-back`, errors);
    await assertTopBar(page, `${tag} after-reader-back`, errors);

    if (await tapChecklistPill(page)) {
      await assertOpenCard(page, `${tag} peek-open`, errors);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  return errors;
}

const all = [];
for (const [w, h, tag] of [
  [375, 812, '375x812'],
  [390, 844, '390x844'],
  [414, 896, '414x896'],
  [430, 932, '430x932'],
]) {
  all.push(...(await runViewport(w, h, tag)));
}

if (all.length) {
  for (const e of all) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('qa-phone-topbar: ok');
