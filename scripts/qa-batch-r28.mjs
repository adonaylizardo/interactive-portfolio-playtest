#!/usr/bin/env node
/** Batch r28 — section scroll under pinned head, peek overlap, dock circle, desktop ring. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#boot').count()) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function tapSelector(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((node) => {
      const r = node.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    });
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!box) throw new Error(`tapSelector missing ${selector}`);
  await page.touchscreen.tap(box.x, box.y);
}

async function setLang(page, wantEn) {
  for (let i = 0; i < 6; i++) {
    const isEn = (await page.evaluate(() => document.documentElement.lang)) === 'en';
    if (isEn === wantEn) return;
    await page.locator('.chrome__tools-phone [data-action="lang-toggle"]').tap();
    await wait(280);
  }
}

async function expandMobileSheet(page) {
  const expanded = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
  );
  if (!expanded) {
    await page.locator('[data-details]').tap();
    await wait(550);
  }
}

async function sectionHeadMetrics(page, h2Sel) {
  return page.evaluate((sel) => {
    const pinned = document.querySelector('[data-intro-pinned]');
    const h2 = document.querySelector(sel);
    const pr = pinned?.getBoundingClientRect();
    const hr = h2?.getBoundingClientRect();
    if (!hr || !pr) return { ok: false, reason: 'missing' };
    const gap = hr.top - pr.bottom;
    const cx = hr.left + Math.min(hr.width / 2, 40);
    const cy = hr.top + Math.min(hr.height / 2, 12);
        const hit = document.elementFromPoint(cx, cy);
        const hittable = !!(hit && (hit === h2 || h2.contains(hit) || hit.closest('h2') === h2));
    return {
      gap,
      pinnedBottom: pr.bottom,
      h2Top: hr.top,
      hittable,
      hitTag: hit?.tagName,
      ok: gap >= 11 && gap <= 42 && hittable,
    };
  }, h2Sel);
}

async function waitSectionLand(page, h2Sel) {
  await page
    .waitForFunction(
      (sel) => {
        const pinned = document.querySelector('[data-intro-pinned]');
        const h2 = document.querySelector(sel);
        if (!pinned || !h2) return false;
        const gap = h2.getBoundingClientRect().top - pinned.getBoundingClientRect().bottom;
        return gap >= 11 && gap <= 42;
      },
      h2Sel,
      { timeout: 10000 },
    )
    .catch(() => {});
}

async function openSearchChip(page, re, h2Sel) {
  await page.evaluate(() => window.__playtestQa?.openSearchForQa?.());
  await wait(450);
  await page.evaluate((pattern) => {
    const chip = [...document.querySelectorAll('.search-palette__chip')].find((c) =>
      pattern.test(c.textContent ?? ''),
    );
    chip?.click();
  }, re);
  await wait(700);
  await waitSectionLand(page, h2Sel);
}

async function main() {
  const errors = [];
  const metrics = {};

  const browser = await chromium.launch();

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
      await setLang(page, lang === 'en');
      await expandMobileSheet(page);

      await openSearchChip(
        page,
        lang === 'en' ? /Talks/i : /Charlas/i,
        '#chrome-mobile-charlas h2',
      );
      const h1a = await sectionHeadMetrics(page, '#chrome-mobile-charlas h2');
      metrics[`H1-search-${tag}`] = h1a;
      if (!h1a.ok) errors.push(`H1 search ${tag} ${JSON.stringify(h1a)}`);

      await openSearchChip(
        page,
        lang === 'en' ? /Articles/i : /Artículos/i,
        '#chrome-mobile-articulos h2',
      );
      const h1b = await sectionHeadMetrics(page, '#chrome-mobile-articulos h2');
      metrics[`H1-chip-art-${tag}`] = h1b;
      if (!h1b.ok) errors.push(`H1 articulos chip ${tag} ${JSON.stringify(h1b)}`);

      await page.evaluate(() => window.__playtestQa?.openSearchForQa?.());
      await wait(350);
      await page.evaluate(() => {
        const input = document.querySelector('.search-palette__input');
        if (input instanceof HTMLInputElement) {
          input.value = 'teresa';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await wait(500);
      await page.evaluate(() => {
        const hit = [...document.querySelectorAll('.search-palette__hit')].find((h) =>
          /teresa/i.test(h.textContent ?? ''),
        );
        hit?.click();
      });
      await wait(900);
      await waitSectionLand(page, '#chrome-mobile-charlas h2');
      const h1c = await sectionHeadMetrics(page, '#chrome-mobile-charlas h2');
      metrics[`H1-teresa-${tag}`] = h1c;
      if (!h1c.ok) errors.push(`H1 teresa ${tag} ${JSON.stringify(h1c)}`);

      const row = page.locator('#chrome-mobile-charlas .chrome__content-row').first();
      if (await row.count()) {
        await row.tap();
        await wait(1200);
        const backSel = '[data-exp-mobile-back]';
        const hasBack = await page.locator(backSel).count();
        if (hasBack) {
          await tapSelector(page, backSel);
          await wait(1000);
          await expandMobileSheet(page);
          await waitSectionLand(page, '#chrome-mobile-charlas h2');
          const h1d = await sectionHeadMetrics(page, '#chrome-mobile-charlas h2');
          metrics[`H1-back-${tag}`] = h1d;
          if (!h1d.ok) errors.push(`H1 back ${tag} ${JSON.stringify(h1d)}`);
        } else {
          errors.push(`H1 back ${tag} missing exp back button`);
        }
      }

      const h2 = await page.evaluate(() => {
        const close = document.querySelector('[data-action="intro-close"]');
        const cr = close?.getBoundingClientRect();
        const cx = cr ? cr.left + cr.width / 2 : 0;
        const cy = cr ? cr.top + cr.height / 2 : 0;
        const hit = document.elementFromPoint(cx, cy);
        const counter = document.querySelector(
          '.chrome__phone-topbar-checklist .checklist__counter--in-ring',
        );
        const counterVis = counter ? getComputedStyle(counter).visibility : 'gone';
        const counterDisplay = counter ? getComputedStyle(counter).display : 'gone';
        return {
          closeHit: !!hit?.closest('[data-action="intro-close"]'),
          counterVis,
          counterDisplay,
          hitTag: hit?.tagName,
          hitClass: hit?.className?.slice?.(0, 40),
        };
      });
      metrics[`H2-${tag}`] = h2;
      if (!h2.closeHit) errors.push(`H2 close blocked ${tag} ${JSON.stringify(h2)}`);
      if (h2.counterDisplay !== 'none' && h2.counterVis !== 'hidden') {
        errors.push(`H2 counter visible ${tag} ${JSON.stringify(h2)}`);
      }

      await tapSelector(page, '[data-action="intro-close"]');
      await wait(400);
      const st = await page.evaluate(() => ({
        peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
        dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
      }));
      if (!st.peek && st.dock) {
        await tapSelector(page, '[data-dock="intro"]');
        await wait(400);
      }
      const m3 = await page.evaluate(() => {
        const strong = document.querySelector('.chrome__intro .chrome__card-id strong');
        const small = document.querySelector('.chrome__intro .chrome__card-id small');
        const btn = document.querySelector('.chrome__intro .chrome__see-details');
        const sr = strong?.getBoundingClientRect();
        const br = btn?.getBoundingClientRect();
        const name = strong?.textContent?.trim() ?? '';
        return {
          strongRight: sr?.right,
          btnLeft: br?.left,
          name,
          nameFull: name === 'Adonay Lizardo',
          roleLines: small ? Math.round(small.getBoundingClientRect().height / 16) : 0,
        };
      });
      metrics[`M3-${tag}`] = m3;
      if (!m3.nameFull) errors.push(`M3 name truncated ${tag} "${m3.name}"`);
      if ((m3.strongRight ?? 999) > (m3.btnLeft ?? 0) - 2) {
        errors.push(`M3 under button ${tag} ${JSON.stringify(m3)}`);
      }

      const dockSt = await page.evaluate(() => ({
        dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
        peek: document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'),
        expanded: document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
      }));
      if (!dockSt.dock) {
        if (dockSt.expanded || dockSt.peek) {
          await tapSelector(page, '[data-action="intro-close"]');
          await wait(400);
        }
        const dockSt2 = await page.evaluate(() =>
          document.querySelector('.chrome')?.classList.contains('chrome--dock'),
        );
        if (!dockSt2) {
          await tapSelector(page, '[data-action="intro-close"]');
          await wait(400);
        }
      }
      const m4 = await page.evaluate(() => {
        const c = document.querySelector('.checklist.checklist--phone-circle');
        const counter = c?.querySelector('.checklist__counter--in-ring');
        const clip = c?.querySelector('.checklist__clipboard-figma');
        const cr = counter?.getBoundingClientRect();
        const cl = clip?.getBoundingClientRect();
        return {
          counterDisplay: counter ? getComputedStyle(counter).display : 'none',
          clipOk: !!(clip && clip.naturalWidth > 0),
          overlap:
            cr && cl
              ? Math.abs(cr.left + cr.width / 2 - (cl.left + cl.width / 2)) < 2 &&
                Math.abs(cr.top + cr.height / 2 - (cl.top + cl.height / 2)) < 2
              : false,
        };
      });
      metrics[`M4-${tag}`] = m4;
      if (m4.counterDisplay !== 'none') errors.push(`M4 counter on circle ${tag}`);
      if (!m4.clipOk) errors.push(`M4 clipboard ${tag}`);
      if (m4.overlap) errors.push(`M4 overlap ${tag}`);

      await ctx.close();
    }
  }

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await desk.newPage();
  await dPage.addInitScript(() => localStorage.removeItem('playtest-checklist-v3'));
  await boot(dPage);
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
  await wait(250);
  const m5 = await dPage.evaluate(() => {
    const header = document.querySelector('body[data-chrome="desktop"] .checklist.checklist--collapsed .checklist__header');
    const btn = document.querySelector(
      'body[data-chrome="desktop"] .checklist.checklist--collapsed .checklist__ring-btn',
    );
    const hr = header?.getBoundingClientRect();
    const br = btn?.getBoundingClientRect();
    const hx = hr ? hr.left + hr.width / 2 : 0;
    const bx = br ? br.left + br.width / 2 : 0;
    return {
      header: { x: hr?.x, y: hr?.y, w: hr?.width, h: hr?.height },
      btn: { x: br?.x, y: br?.y, w: br?.width, h: br?.height },
      dx: bx - hx,
      dy: br && hr ? br.top + br.height / 2 - (hr.top + hr.height / 2) : 0,
      clipped: br && hr ? br.left < hr.left - 0.5 : false,
    };
  });
  metrics.M5 = m5;
  if (Math.abs(m5.dx ?? 9) > 1 || Math.abs(m5.dy ?? 9) > 1 || m5.clipped) {
    errors.push(`M5 collapsed ring ${JSON.stringify(m5)}`);
  }

  await dPage.evaluate(() => window.__playtestQa?.expandChecklistForQa?.());
  await wait(200);
  const ringY0 = await dPage.evaluate(() =>
    document
      .querySelector('body[data-chrome="desktop"] .checklist:not(.checklist--collapsed) .checklist__progress-wrap')
      ?.getBoundingClientRect().y,
  );
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
  const ringY5 = await dPage.evaluate(() =>
    document
      .querySelector('body[data-chrome="desktop"] .checklist:not(.checklist--collapsed) .checklist__progress-wrap')
      ?.getBoundingClientRect().y,
  );
  metrics.L7 = { ringY0, ringY5, delta: Math.abs((ringY5 ?? 0) - (ringY0 ?? 0)) };
  if ((metrics.L7.delta ?? 9) > 0.5) errors.push(`L7 expanded ring shift ${metrics.L7.delta}`);

  await desk.close();

  const bleedCtx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const bleedPage = await bleedCtx.newPage();
  await boot(bleedPage);
  await expandMobileSheet(bleedPage);
  await bleedPage.evaluate(() => {
    const intro = document.querySelector('.chrome__intro');
    intro?.scrollTo({ top: 600, behavior: 'auto' });
  });
  await wait(200);
  const l6 = await bleedPage.evaluate(() => {
    const intro = document.querySelector('.chrome__intro');
    const ir = intro?.getBoundingClientRect();
    const x = ir ? ir.left + ir.width / 2 : 187;
    const y = ir ? ir.top + 6 : 6;
    const hit = document.elementFromPoint(x, y);
    const pinned = document.querySelector('[data-intro-pinned]');
    const ok =
      !!(hit && pinned && (pinned.contains(hit) || hit === pinned || hit.closest('[data-intro-pinned]')));
    return { y, hitTag: hit?.tagName, hitClass: hit?.className?.slice?.(0, 48), ok };
  });
  metrics.L6 = l6;
  if (!l6.ok) errors.push(`L6 bleed strip ${JSON.stringify(l6)}`);
  await bleedCtx.close();

  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  const r27 = spawnSync('node', ['scripts/qa-batch-r27.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, QA_BASE_URL: BASE },
  });
  if (r27.status !== 0) errors.push('qa-batch-r27 regression failed');

  if (errors.length) {
    for (const e of errors) console.error(`FAIL ${e}`);
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    process.exit(1);
  }
  console.log('qa-batch-r28: ok');
  console.log('METRICS', JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
