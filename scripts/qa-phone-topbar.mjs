#!/usr/bin/env node
/** Phone top bar flex row + checklist pill/circle/open-card (hostile QA r14). */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function topBarTargets() {
  return [
    { key: 'search', sel: '.chrome__phone-topbar [data-action="search"]' },
    { key: 'lang-en', sel: '.chrome__phone-topbar [data-lang="en"]' },
    { key: 'lang-es', sel: '.chrome__phone-topbar [data-lang="es"]' },
    { key: 'center', sel: '.chrome__phone-topbar [data-action="center"]' },
    { key: 'checklist', sel: '.chrome__phone-topbar-checklist .checklist' },
  ];
}

async function assertTopBar(page, tag, errors) {
  const overlap = await page.evaluate((targets) => {
    const rects = targets.map((t) => {
      const el = document.querySelector(t.sel);
      return { key: t.key, r: el?.getBoundingClientRect() };
    });
    const failures = [];
    for (const { key, r } of rects) {
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
          : key === 'lang-en'
            ? topEl?.closest('[data-lang="en"]')
            : key === 'lang-es'
              ? topEl?.closest('[data-lang="es"]')
              : key === 'center'
                ? topEl?.closest('[data-action="center"]')
                : topEl?.closest('.chrome__phone-topbar-checklist .checklist');
      if (!hitOk) failures.push(`${key} not hittable at center`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        if (!a || !b) continue;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 4 && oy > 4) failures.push(`${rects[i].key} overlaps ${rects[j].key}`);
      }
    }
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
    const cl = document.querySelector(
      '.chrome__phone-topbar-checklist .checklist.checklist--mobile-closed',
    );
    if (!cl) return false;
    const hit = cl.querySelector('.checklist__ring-hit');
    const btn = cl.querySelector('.checklist__ring-btn');
    if (hit) hit.click();
    else btn?.click();
    return true;
  });
}

async function assertOpenCard(page, tag, errors) {
  await wait(350);
  const card = await page.evaluate(() => {
    const cl = document.querySelector('.checklist.checklist--phone-open');
    if (!cl) return { ok: false, why: 'no open card' };
    const rect = cl.getBoundingClientRect();
    const inset = 16;
    const skip = cl.querySelector('.checklist__skip');
    const skipRect = skip?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const failures = [];
    if (rect.top < 0 || rect.left < 0 || rect.bottom > vh + 2 || rect.right > vw + 2) {
      failures.push(`card outside viewport (${rect.top},${rect.left},${rect.width}x${rect.height})`);
    }
    if (Math.abs(rect.right - (vw - inset)) > 3) {
      failures.push(`right inset not 16 (right=${rect.right})`);
    }
    if (skipRect) {
      const cx = skipRect.left + skipRect.width / 2;
      const cy = skipRect.top + skipRect.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit?.closest('.checklist__skip')) failures.push('Saltar tutorial not hittable');
      if (
        skipRect.bottom > rect.bottom + 2 ||
        skipRect.top < rect.top - 2 ||
        skipRect.right > rect.right + 2 ||
        skipRect.left < rect.left - 2
      ) {
        failures.push('skip button spills outside card');
      }
    }
    const list = cl.querySelector('.checklist__list');
    const listRect = list?.getBoundingClientRect();
    if (listRect && list && list.scrollHeight <= list.clientHeight + 2) {
      const items = cl.querySelectorAll('.checklist__item');
      for (const item of items) {
        const ir = item.getBoundingClientRect();
        if (ir.bottom > listRect.bottom + 2 || ir.top < listRect.top - 2) {
          failures.push('list row spills outside scroll area');
          break;
        }
      }
    }
    return { ok: failures.length === 0, failures, rect };
  });
  if (!card.ok) {
    for (const f of card.failures ?? [card.why]) errors.push(`${tag}: open card ${f}`);
  }
}

async function assertCircleOk(page, tag, errors) {
  const d = await page.evaluate(() => {
    const cl = document.querySelector('.chrome__phone-topbar-checklist .checklist');
    const clRect = cl?.getBoundingClientRect();
    const ring =
      cl?.querySelector('.checklist__ring-btn') ??
      cl?.querySelector('.checklist__ring-figma') ??
      cl?.querySelector('.checklist__map-arc');
    const ringRect = ring?.getBoundingClientRect();
    const ht = cl?.querySelector('.checklist__header-text');
    const vw = window.innerWidth;
    const hit = cl?.querySelector('.checklist__ring-hit');
    const hitDisplay = hit ? getComputedStyle(hit).display : '';
    return {
      circle: cl?.classList.contains('checklist--phone-circle'),
      pill: cl?.classList.contains('checklist--phone-pill'),
      clRect,
      ringRect,
      hitDisplay,
      headerHidden: ht ? getComputedStyle(ht).display === 'none' : true,
      ringInside:
        clRect && ringRect
          ? ringRect.left >= clRect.left - 1 &&
            ringRect.right <= clRect.right + 1 &&
            ringRect.top >= clRect.top - 1 &&
            ringRect.bottom <= clRect.bottom + 1
          : false,
      offScreen: clRect ? clRect.right > vw + 2 || clRect.left < -2 : true,
    };
  });
  if (!d.circle && !d.pill) errors.push(`${tag}: checklist missing phone mode class`);
  if (d.circle && !d.headerHidden) errors.push(`${tag}: circle should hide header text`);
  if (d.circle && !d.ringInside && d.hitDisplay === 'none') {
    errors.push(`${tag}: ring outside circle box`);
  }
  if (d.offScreen) errors.push(`${tag}: checklist off-screen`);
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

    await page.locator('[data-details]').click();
    await wait(450);
    await assertTopBar(page, `${tag} expanded`, errors);
    await assertCircleOk(page, `${tag} expanded`, errors);

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

    await page.locator('.chrome__phone-topbar [data-lang="en"]').click();
    await wait(200);
    await assertTopBar(page, `${tag} dock-after-EN`, errors);
    await page.locator('.chrome__phone-topbar [data-lang="es"]').click();
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
]) {
  all.push(...(await runViewport(w, h, tag)));
}

if (all.length) {
  for (const e of all) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log('qa-phone-topbar: ok');
