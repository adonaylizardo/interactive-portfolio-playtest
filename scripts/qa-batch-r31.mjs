#!/usr/bin/env node
/** Batch r31 — design-gate UI rects at 375/390 ES+EN. */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const WIDTHS = [375, 390];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (await page.locator('#boot').count()) {
    await page.locator('[data-boot-start]').click();
    await page.waitForFunction(() => !document.getElementById('boot'), undefined, { timeout: 120000 });
  }
  await wait(400);
}

async function setLang(page, wantEn) {
  for (let i = 0; i < 6; i++) {
    const isEn = (await page.evaluate(() => document.documentElement.lang)) === 'en';
    if (isEn === wantEn) return;
    await page.locator('.chrome__tools-phone [data-action="lang-toggle"]').tap();
    await wait(280);
  }
}

async function expandSheet(page) {
  const expanded = await page.evaluate(() =>
    document.querySelector('.chrome')?.classList.contains('chrome--intro-expanded'),
  );
  if (!expanded) {
    await page.locator('[data-details]').tap();
    await wait(550);
  }
}

async function measurePhone(page, tag, metrics, errors) {
  const m = await page.evaluate(() => {
    const pinned = document.querySelector('[data-intro-pinned]');
    const grab = document.querySelector('.chrome__sheet-grab');
    const titleRow = document.querySelector('.chrome__intro-title-row');
    const title = document.querySelector('.chrome__intro-pinned .chrome__title');
    const sound = document.querySelector('.chrome__intro-title-actions .chrome__intro-sound');
    const close = document.querySelector('.chrome__intro-close');
    const pr = pinned?.getBoundingClientRect();
    const gr = grab?.getBoundingClientRect();
    const tr = titleRow?.getBoundingClientRect();
    const ts = title ? getComputedStyle(title) : null;
    const cardRow = document.querySelector('.chrome--intro-peek .chrome__card-row');
    const role = document.querySelector('.chrome--intro-peek .chrome__card-id small');
    const tools = document.querySelector('.chrome__phone-topbar .chrome__tools-phone');
    const ringBtn = document.querySelector(
      '.chrome__phone-topbar-checklist .checklist--phone-circle .checklist__ring-btn',
    );
    const ring = document.querySelector(
      '.chrome__phone-topbar-checklist .checklist--phone-circle .checklist__ring',
    );
    const skip = document.querySelector('.checklist__skip');
    const meta = document.querySelector('.chrome__section--content .experience__row-meta');
    const pinnedH = pr ? pr.height : 0;
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)')) || 0;
    const contentH = pinnedH - Math.max(12, safeTop);
    const roleStyle = role ? getComputedStyle(role) : null;
    const titleScrollW = title ? title.scrollWidth : 0;
    const titleClientW = title ? title.clientWidth : 0;
    const roleScrollW = role ? role.scrollWidth : 0;
    const roleClientW = role ? role.clientWidth : 0;
    let ringInset = null;
    if (ringBtn && ring) {
      const br = ringBtn.getBoundingClientRect();
      const rr = ring.getBoundingClientRect();
      ringInset = {
        left: rr.left - br.left,
        top: rr.top - br.top,
        right: br.right - rr.right,
        bottom: br.bottom - rr.bottom,
      };
    }
    const rectMini = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return {
      pinnedH,
      contentH,
      grab: grab ? { w: gr.width, h: gr.height } : null,
      titleRow: tr ? { h: tr.height } : null,
      title: ts
        ? { fontSize: ts.fontSize, lineHeight: ts.lineHeight, fontWeight: ts.fontWeight, nowrap: ts.whiteSpace }
        : null,
      titleOverflow: titleScrollW > titleClientW + 1,
      sound: sound ? rectMini(sound) : null,
      close: close ? { w: close.getBoundingClientRect().width, h: close.getBoundingClientRect().height, aria: close.getAttribute('aria-label') } : null,
      cardRow: cardRow ? { h: cardRow.getBoundingClientRect().height } : null,
      roleOverflow: roleScrollW > roleClientW + 1,
      roleNowrap: roleStyle?.whiteSpace,
      tools: tools ? { w: tools.getBoundingClientRect().width, h: tools.getBoundingClientRect().height } : null,
      ringInset,
      skipH: skip ? skip.getBoundingClientRect().height : null,
      metaNowrap: meta ? getComputedStyle(meta).whiteSpace : null,
    };
  });

  metrics[tag] = m;

  const isExpanded = tag.includes('_expanded');
  const isPeek = tag.includes('_peek');

  if (isExpanded) {
    if (!near(m.contentH, 76, 3)) {
      errors.push(`${tag} MED-A pinned contentH=${m.contentH?.toFixed?.(1)}`);
    }
    if (m.grab && (!near(m.grab.w, 343, 4) || !near(m.grab.h, 24, 2))) {
      errors.push(`${tag} MED-A grab ${m.grab.w}x${m.grab.h}`);
    }
    if (m.titleRow && !near(m.titleRow.h, 44, 2)) errors.push(`${tag} MED-A titleRow h=${m.titleRow.h}`);
    if (m.sound && (!near(m.sound.w, 44, 1) || !near(m.sound.h, 44, 1))) {
      errors.push(`${tag} MED-A sound ${m.sound.w}x${m.sound.h}`);
    }
    if (m.titleOverflow) errors.push(`${tag} MED-A title clipped (no body duplicate)`);
  }

  if (isPeek) {
    if (m.cardRow && !near(m.cardRow.h, 72, 2)) errors.push(`${tag} MED-4 cardRow h=${m.cardRow.h}`);
    if (m.ringInset) {
      for (const side of ['left', 'top', 'right', 'bottom']) {
        if (!near(m.ringInset[side], 6, 2)) {
          errors.push(`${tag} MED-7 ring inset ${side}=${m.ringInset[side]?.toFixed(2)}`);
        }
      }
    }
  }

  if (m.tools && (!near(m.tools.w, 88, 2) || !near(m.tools.h, 48, 2))) {
    errors.push(`${tag} MED-8 tools ${m.tools.w}x${m.tools.h}`);
  }
}

async function measureSearchClear(page, tag, metrics, errors) {
  await page.evaluate(() => window.__playtestQa?.openSearchForQa?.());
  await wait(400);
  await page.locator('.search-palette__input').fill('a');
  await wait(200);
  const m = await page.evaluate(() => {
    const btn = document.querySelector('.search-palette__clear');
    const icon = btn?.querySelector('.ui-icon');
    const br = btn?.getBoundingClientRect();
    const ir = icon?.getBoundingClientRect();
    return {
      w: br?.width,
      h: br?.height,
      iconW: ir?.width,
      aria: btn?.getAttribute('aria-label'),
    };
  });
  metrics[`${tag}_clear`] = m;
  if (!near(m.w ?? 0, 44, 1) || !near(m.h ?? 0, 44, 1)) errors.push(`${tag} MED-C clear ${m.w}x${m.h}`);
  if (m.iconW && !near(m.iconW, 16, 2)) errors.push(`${tag} MED-C icon ${m.iconW}`);
  await page.keyboard.press('Escape');
  await wait(200);
}

async function main() {
  const errors = [];
  const metrics = { beforeNote: 'after build only' };

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true });

  for (const w of WIDTHS) {
    for (const en of [false, true]) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: 844 });
      await boot(page);
      await setLang(page, en);
      const lang = en ? 'EN' : 'ES';
      const tag = `${w}_${lang}`;

      await expandSheet(page);
      await measurePhone(page, `${tag}_expanded`, metrics, errors);
      await measureSearchClear(page, tag, metrics, errors);

      await page.evaluate(() => {
        document.querySelector('[data-action="intro-close"]')?.click();
      });
      await wait(400);
      await measurePhone(page, `${tag}_peek`, metrics, errors);

      await page.close();
    }
  }

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await deskCtx.newPage();
  await boot(dPage);
  await dPage.evaluate(() => window.__playtestQa?.collapseChecklistForQa?.());
  await wait(250);
  const desk = await dPage.evaluate(() => {
    const clip = document.querySelector(
      'body[data-chrome="desktop"] .checklist.checklist--collapsed .checklist__clipboard-figma',
    );
    const cs = clip ? getComputedStyle(clip) : null;
    return { clipboardDisplay: cs?.display, clipboardW: clip?.getBoundingClientRect().width };
  });
  metrics.desktop_ring = desk;
  if (desk.clipboardDisplay !== 'block') errors.push(`MED-9 desktop clipboard display=${desk.clipboardDisplay}`);
  await deskCtx.close();
  await browser.close();

  const lint = spawnSync('npm', ['run', 'typecheck'], { cwd: ROOT, encoding: 'utf8' });
  if (lint.status !== 0) errors.push('typecheck failed');

  if (errors.length) {
    console.error('METRICS', JSON.stringify(metrics, null, 2));
    for (const e of errors) console.error('FAIL', e);
    process.exit(1);
  }
  console.log('METRICS', JSON.stringify(metrics, null, 2));
  console.log('qa-batch-r31: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
