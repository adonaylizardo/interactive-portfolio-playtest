#!/usr/bin/env node
/** Batch r32 — hostile QA for r31 fixes (role/pill, grabber, ring, search, skip). */
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4194/interactive-portfolio-playtest/';
const WIDTHS = [375, 390, 414, 430];
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

async function ensurePeek(page) {
  const peek = await page.evaluate(() => document.querySelector('.chrome')?.classList.contains('chrome--intro-peek'));
  if (!peek) {
    const close = page.locator('[data-action="intro-close"]');
    if (await close.isVisible().catch(() => false)) await close.tap();
    await wait(400);
  }
}

async function measureRole(page) {
  return page.evaluate(() => {
    const role = document.querySelector('.chrome--intro-peek .chrome__card-id small');
    const pill = document.querySelector('.chrome--intro-peek .chrome__see-details');
    const row = document.querySelector('.chrome--intro-peek .chrome__card-row');
    const rr = role?.getBoundingClientRect();
    const pr = pill?.getBoundingClientRect();
    const overlap =
      rr && pr
        ? Math.max(0, Math.min(rr.right, pr.right) - Math.max(rr.left, pr.left)) *
            Math.max(0, Math.min(rr.bottom, pr.bottom) - Math.max(rr.top, pr.top))
        : 0;
    return {
      scrollW: role?.scrollWidth ?? 0,
      clientW: role?.clientWidth ?? 0,
      pillW: pr?.width ?? 0,
      rowH: row?.getBoundingClientRect().height ?? 0,
      overlap,
    };
  });
}

async function measureGrabber(page) {
  return page.evaluate(() => {
    const grab = document.querySelector('.chrome__sheet-grab');
    const span = grab?.querySelector('span');
    const gr = grab?.getBoundingClientRect();
    const sr = span?.getBoundingClientRect();
    return {
      hit: gr ? { w: gr.width, h: gr.height } : null,
      visual: sr ? { w: sr.width, h: sr.height } : null,
    };
  });
}

async function measureRingDock(page) {
  return page.evaluate(() => {
    const btn = document.querySelector(
      'body[data-chrome="phone"] .chrome__phone-topbar-checklist .checklist.checklist--phone-circle .checklist__ring-btn',
    );
    const ring = btn?.querySelector('.checklist__ring');
    if (!btn || !ring) return { ok: false, reason: 'missing dock circle ring' };
    const br = btn.getBoundingClientRect();
    const rr = ring.getBoundingClientRect();
    return {
      ok: true,
      inset: {
        left: rr.left - br.left,
        top: rr.top - br.top,
        right: br.right - rr.right,
        bottom: br.bottom - rr.bottom,
      },
    };
  });
}

async function main() {
  const errors = [];
  const metrics = {};

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    viewport: { width: 375, height: 812 },
  });

  for (const w of WIDTHS) {
    for (const en of [false, true]) {
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: 812 });
      await boot(page);
      await setLang(page, en);
      const tag = `${w}_${en ? 'EN' : 'ES'}`;
      await ensurePeek(page);

      const role = await measureRole(page);
      metrics[`role_${tag}`] = role;
      if (role.scrollW > role.clientW + 1) errors.push(`${tag} role scroll ${role.scrollW}>${role.clientW}`);
      if (role.overlap > 1) errors.push(`${tag} role overlaps pill by ${role.overlap.toFixed(1)}px`);
      if (!near(role.rowH, 72, 2)) errors.push(`${tag} peek row h=${role.rowH}`);
      if (role.pillW > 0 && role.pillW < 44) errors.push(`${tag} pill width ${role.pillW}`);

      const closeAria = await page.evaluate(() =>
        document.querySelector('[data-action="intro-close"]')?.getAttribute('aria-label'),
      );
      metrics[`close_${tag}`] = closeAria;
      const wantClose = en ? 'Close' : 'Cerrar';
      if (closeAria !== wantClose) errors.push(`${tag} close aria ${closeAria} want ${wantClose}`);

      await page.locator('[data-details]').tap();
      await wait(500);
      const grab = await measureGrabber(page);
      metrics[`grab_${tag}`] = grab;
      if (grab.hit && (!near(grab.hit.w, w <= 375 ? 341 : 343, 4) || !near(grab.hit.h, 24, 2))) {
        errors.push(`${tag} grab hit ${grab.hit.w}x${grab.hit.h}`);
      }
      if (grab.visual && (!near(grab.visual.w, 36, 2) || !near(grab.visual.h, 4, 1))) {
        errors.push(`${tag} grab visual ${grab.visual.w}x${grab.visual.h}`);
      }

      await page.locator('[data-action="intro-close"]').tap();
      await wait(450);

      const ring = await measureRingDock(page);
      metrics[`ring_${tag}`] = ring;
      if (!ring.ok) errors.push(`${tag} ${ring.reason}`);
      else {
        for (const side of ['left', 'top', 'right', 'bottom']) {
          if (!near(ring.inset[side], 6, 2)) errors.push(`${tag} ring inset ${side}=${ring.inset[side]?.toFixed(2)}`);
        }
      }

      if (!en) {
        await page.locator('.chrome__tools-phone [data-action="search"]').tap();
        await wait(450);
        const chipFit = await page.evaluate(() => {
          const chip = [...document.querySelectorAll('.search-palette__chip')].find((c) =>
            (c.textContent ?? '').includes('Lugares'),
          );
          const label = chip?.querySelector('span') ?? chip;
          const cs = label ? getComputedStyle(label) : null;
          return {
            text: label?.textContent?.trim(),
            scrollW: label?.scrollWidth ?? 0,
            clientW: label?.clientWidth ?? 0,
            chipH: chip?.getBoundingClientRect().height ?? 0,
            nowrap: cs?.whiteSpace,
            ellipsis: cs?.textOverflow,
          };
        });
        metrics[`copy_chip_${w}`] = chipFit;
        if (chipFit.text !== 'Lugares') errors.push(`${tag} landmarks chip text ${chipFit.text}`);
        if (chipFit.scrollW > chipFit.clientW + 1) errors.push(`${tag} Lugares chip trunc ${chipFit.scrollW}>${chipFit.clientW}`);
        await page.keyboard.press('Escape');
        await wait(200);
        await page.evaluate(() => document.querySelector('.checklist__ring-hit')?.click());
        await wait(350);
        const walkFit = await page.evaluate(() => {
          const detail = document.querySelector('.checklist__item--active .checklist__item-detail');
          const want = 'Toca el suelo para ir allí. Doble toque para correr.';
          const cs = detail ? getComputedStyle(detail) : null;
          return {
            text: detail?.textContent?.trim(),
            scrollW: detail?.scrollWidth ?? 0,
            clientW: detail?.clientWidth ?? 0,
            lineCount: detail ? Math.round(detail.getBoundingClientRect().height / (parseFloat(cs?.lineHeight || '16') || 16)) : 0,
            clamp: cs?.webkitLineClamp,
          };
        });
        metrics[`copy_walk_${w}`] = walkFit;
        const wantWalk = 'Toca el suelo para ir allí. Doble toque para correr.';
        if (walkFit.text !== wantWalk) errors.push(`${tag} walk touch copy mismatch`);
        if (walkFit.scrollW > walkFit.clientW + 1) errors.push(`${tag} walk detail trunc ${walkFit.scrollW}>${walkFit.clientW}`);
        await page.evaluate(() => document.querySelector('.checklist.checklist--phone-open .checklist__ring-hit')?.click());
        await wait(250);
      }

      await page.locator('.chrome__tools-phone [data-action="search"]').tap();
      await wait(450);
      await page.locator('.search-palette__input').fill('a');
      await wait(200);
      const clear = await page.evaluate(() => {
        const btn = document.querySelector('.search-palette__clear');
        const br = btn?.getBoundingClientRect();
        return { w: br?.width, h: br?.height, aria: btn?.getAttribute('aria-label') };
      });
      metrics[`clear_${tag}`] = clear;
      const wantClear = en ? 'Clear search' : 'Borrar búsqueda';
      if (clear.aria !== wantClear) errors.push(`${tag} clear aria ${clear.aria}`);
      await page.keyboard.press('Escape');
      await wait(200);

      await page.evaluate(() => document.querySelector('.checklist__ring-hit')?.click());
      await wait(350);
      const skipH = await page.evaluate(() => document.querySelector('.checklist__skip')?.getBoundingClientRect().height);
      metrics[`skip_${tag}`] = skipH;
      if (skipH && skipH < 44) errors.push(`${tag} skip h=${skipH}`);

      await page.close();
    }
  }

  const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dPage = await deskCtx.newPage();
  await boot(dPage);
  await dPage.evaluate(() => window.__playtestQa?.collapseChecklistForQa?.());
  await wait(250);
  const deskRing = await dPage.evaluate(() => {
    const header = document.querySelector('body[data-chrome="desktop"] .checklist.checklist--collapsed .checklist__header');
    const btn = document.querySelector('body[data-chrome="desktop"] .checklist.checklist--collapsed .checklist__ring-btn');
    const hr = header?.getBoundingClientRect();
    const br = btn?.getBoundingClientRect();
    if (!hr || !br) return { ok: false };
    const hx = hr.left + hr.width / 2;
    const hy = hr.top + hr.height / 2;
    const bx = br.left + br.width / 2;
    const by = br.top + br.height / 2;
    return { ok: true, dx: bx - hx, dy: by - hy };
  });
  metrics.desktop_ring_center = deskRing;
  if (!deskRing.ok || Math.abs(deskRing.dy ?? 9) > 1) errors.push(`desktop ring dy=${deskRing.dy?.toFixed?.(2)}`);
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
  console.log('qa-batch-r32: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
