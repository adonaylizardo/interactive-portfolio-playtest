#!/usr/bin/env node
/**
 * Real-DOM QA: interior peek, list back, dismiss/reopen, pinch zoom, post-exit door grace.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { execPath } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_OUT = path.join(ROOT, 'test-output');
mkdirSync(TEST_OUT, { recursive: true });
const PREVIEW_PORT = Number(process.env.QA_PREVIEW_PORT) || 4198;
const GLOBAL_TIMEOUT_MS = 240_000;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function resolvePreviewBase() {
  if (process.env.QA_BASE_URL) {
    return process.env.QA_BASE_URL.replace(/\/?$/, '/');
  }
  let basePath = '/';
  try {
    const html = readFileSync(path.join(ROOT, 'dist/index.html'), 'utf8');
    const script =
      html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i) ??
      html.match(/<script[^>]+src="([^"]+)"/i);
    if (script?.[1]) {
      const src = script[1];
      const assets = src.indexOf('/assets/');
      basePath = assets > 0 ? src.slice(0, assets + 1) : src.replace(/\/[^/]+$/, '');
    }
  } catch {
    /* dist not built yet */
  }
  if (basePath === '/' || basePath === '/interactive-portfolio-playtest/') {
    basePath = '/interactive-portfolio-playtest/preview-integracion/';
  }
  if (!basePath.endsWith('/')) basePath += '/';
  return `http://127.0.0.1:${PREVIEW_PORT}${basePath}`;
}

function startPreview(basePath) {
  const base = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawn(
    execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', `--port=${PREVIEW_PORT}`, '--base', base],
    { cwd: ROOT, stdio: 'ignore', detached: true },
  );
}

async function stopPreview(preview) {
  if (!preview?.pid) return;
  try {
    process.kill(-preview.pid, 'SIGTERM');
  } catch {
    preview.kill('SIGTERM');
  }
  await wait(400);
  try {
    process.kill(-preview.pid, 'SIGKILL');
  } catch {
    /* already stopped */
  }
}

async function pinchZoom(cdp, cx, cy, spread) {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: cx - 24, y: cy },
      { x: cx + 24, y: cy },
    ],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: cx - spread, y: cy },
      { x: cx + spread, y: cy },
    ],
  });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function assertInViewport(loc) {
  const box = await loc.boundingBox();
  if (!box) throw new Error('element has no bounding box');
  const vh = await loc.page().evaluate(() => window.innerHeight);
  const vw = await loc.page().evaluate(() => window.innerWidth);
  if (box.bottom > vh - 72 || box.top < 0 || box.left < 0 || box.right > vw) {
    throw new Error(
      `peek not fully in viewport: top=${box.top.toFixed(0)} bottom=${box.bottom.toFixed(0)} vh=${vh}`,
    );
  }
}

async function main() {
  const timeout = setTimeout(() => {
    console.error(`test-interior-exp-peek: global timeout ${GLOBAL_TIMEOUT_MS}ms`);
    process.exit(1);
  }, GLOBAL_TIMEOUT_MS);

  const BASE = resolvePreviewBase();
  let preview = null;
  if (!process.env.QA_BASE_URL) {
    const basePath = new URL(BASE).pathname;
    preview = startPreview(basePath);
    await wait(1500);
  }
  const errors = [];

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);

  try {
    await page.addInitScript(() => {
      sessionStorage.setItem('playtest-welcome-done', '1');
    });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForQa(page);

    const EN_TITLE_IN_ES = /^(How to |UX Tricks|The |Creating |Everyone |You're )/i;
    const ES_TITLE_IN_EN = /[áéíóúñ¿]|^(Cómo |La |El |Todos le|Trucos |Píxeles|Método |Creando )/i;
    const ES_MONTH_IN_META = /enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i;

    const waitForDoorGraceAfterLeave = async (targetPage) => {
      await targetPage.evaluate(async () => {
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        const t0 = Number(document.getElementById('game-canvas')?.dataset.leaveGraceAt ?? 0);
        while (t0 > 0 && performance.now() < t0 + 1600) await delay(20);
      });
    };

    const assertExperienceLangInUi = async (lang, building) => {
      await page.evaluate((l) => window.__playtestQa.setLang(l), lang);
      if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
        await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
        await waitForDoorGraceAfterLeave(page);
      }
      await page.evaluate((b) => window.__playtestQa.enterInterior(b), building);
      await page.waitForSelector('.interior-exp-peek__excerpt', { timeout: 12_000 });
      await wait(350);
      const excerpt = (await page.locator('.interior-exp-peek__excerpt').textContent())?.trim() ?? '';
      if (lang === 'es' && /\b(How to|Top 10 tools|UX Tricks)\b/i.test(excerpt)) {
        errors.push(`${building} excerpt looks EN while ES: ${excerpt}`);
      }
      if (lang === 'en' && /\b(Cómo hackear|Trucos de UX|Píxeles en órbita)\b/i.test(excerpt)) {
        errors.push(`${building} excerpt looks ES while EN: ${excerpt}`);
      }
      await page.locator('[data-exp-peek-expand]').click();
      await wait(350);
      const titles = await page.$$eval(
        '.building-panel--interior-entry .experience__row-title',
        (els) => els.map((e) => e.textContent?.trim() ?? '').filter(Boolean),
      );
      for (const title of titles) {
        if (lang === 'es' && EN_TITLE_IN_ES.test(title)) {
          errors.push(`${building} list title EN in ES: ${title}`);
        }
        if (lang === 'en' && ES_TITLE_IN_EN.test(title)) {
          errors.push(`${building} list title ES in EN: ${title}`);
        }
      }
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
      await waitForDoorGraceAfterLeave(page);
    };

    await assertExperienceLangInUi('es', 'teresa');
    await assertExperienceLangInUi('en', 'teresa');
    await assertExperienceLangInUi('es', 'biblioteca');
    await assertExperienceLangInUi('en', 'biblioteca');

    const dismissAboutPeek = async () => {
      const close = page.locator(
        '.chrome:not(#mobile-peek-card-measure) [data-action="intro-close"]',
      );
      if (await close.first().isVisible()) await close.first().click();
      await wait(250);
    };

    const measureAbout = async (vw) =>
      page.evaluate((w) => {
        const intro = document.querySelector('.chrome--intro-peek .chrome__intro');
        const r = intro?.getBoundingClientRect();
        if (!r) return null;
        const vv = window.visualViewport;
        const vvBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
        return {
          left: r.left,
          right: w - r.right,
          bottom: vvBottom - r.bottom,
          height: r.height,
        };
      }, vw);

    const syncPeekRefHeight = async () =>
      page.evaluate(() => {
        window.__playtestQa?.syncMobilePeekCardHeight?.();
        return window.__playtestQa?.getMobilePeekCardHeight?.() ?? 0;
      });

    const assertMeasureCloneSanitized = async () => {
      const audit = await page.evaluate(() => {
        const host = document.getElementById('mobile-peek-card-measure');
        const cloneIds = host ? host.querySelectorAll(':scope [id]').length : -1;
        const labelled = host ? host.querySelectorAll('[aria-labelledby]').length : -1;
        const controls = host ? host.querySelectorAll('[aria-controls]').length : -1;
        const forAttr = host ? host.querySelectorAll('label[for]').length : -1;
        return { cloneIds, labelled, controls, forAttr };
      });
      if (audit.cloneIds !== 0) {
        errors.push(`measure clone must strip ids (found ${audit.cloneIds} in #mobile-peek-card-measure)`);
      }
      if (audit.labelled !== 0) {
        errors.push(`measure clone aria-labelledby: ${audit.labelled}`);
      }
      if (audit.controls !== 0) {
        errors.push(`measure clone aria-controls: ${audit.controls}`);
      }
      if (audit.forAttr !== 0) {
        errors.push(`measure clone label[for]: ${audit.forAttr}`);
      }
    };

    const measurePeekCtaLayout = async () =>
      page.evaluate(() => {
        const sheet = document.querySelector(
          '.building-panel--interior-entry.building-panel--floating-peek .building-panel__sheet',
        );
        const btn =
          document.querySelector('.building-panel--interior-entry [data-exp-peek-expand]') ??
          document.querySelector('.building-panel--interior-entry .interior-exp-peek__expand');
        const excerpt = document.querySelector(
          '.building-panel--interior-entry .interior-exp-peek__excerpt',
        );
        const aboutBtn = document.querySelector(
          '.chrome:not(#mobile-peek-card-measure).chrome--intro-peek .chrome__see-details',
        );
        const aboutIntro = document.querySelector(
          '.chrome:not(#mobile-peek-card-measure).chrome--intro-peek .chrome__intro',
        );
        if (!sheet || !btn || !excerpt) return null;
        const sheetR = sheet.getBoundingClientRect();
        const btnR = btn.getBoundingClientRect();
        const exR = excerpt.getBoundingClientRect();
        const padB = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
        const out = {
          btnToSheetBottom: sheetR.bottom - btnR.bottom,
          excerptToBtn: btnR.top - exR.bottom,
          innerBelowBtn: sheetR.bottom - padB - btnR.bottom,
          aboutBtnToCardBottom: null,
        };
        if (aboutBtn && aboutIntro) {
          const introR = aboutIntro.getBoundingClientRect();
          const abR = aboutBtn.getBoundingClientRect();
          out.aboutBtnToCardBottom = introR.bottom - abR.bottom;
        }
        return out;
      });

    const measureInteriorPeek = async (vw) =>
      page.evaluate((w) => {
        const sheet = document.querySelector(
          '.building-panel--interior-entry.building-panel--floating-peek .building-panel__sheet',
        );
        const r = sheet?.getBoundingClientRect();
        if (!r) return null;
        const vv = window.visualViewport;
        const vvBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight);
        return {
          left: r.left,
          right: w - r.right,
          bottom: vvBottom - r.bottom,
          height: r.height,
        };
      }, vw);

    const assertInteriorMatchesPeekRef = async (vw, label, interiorId) => {
      await dismissAboutPeek();
      const refH = await syncPeekRefHeight();
      if (refH < 80) errors.push(`peek ref height missing ${label} @${vw}`);
      await page.evaluate((id) => window.__playtestQa.enterInterior(id), interiorId);
      await page.waitForFunction(() => window.__playtestQa?.isInInterior?.() === true, null, {
        timeout: 20_000,
      });
      await page.waitForSelector('.building-panel--interior-entry.building-panel--floating-peek', {
        timeout: 10_000,
      });
      await wait(350);
      await assertMeasureCloneSanitized();
      const layout = await measureInteriorPeek(vw);
      if (!layout) errors.push(`missing interior floating peek ${label} @${vw}`);
      else if (refH > 0 && Math.abs(layout.height - refH) > 2) {
        errors.push(
          `peek height mismatch ${label} @${vw}: interior=${layout.height.toFixed(1)} ref=${refH.toFixed(1)} (Δ${Math.abs(layout.height - refH).toFixed(1)})`,
        );
      }
      const cta = await measurePeekCtaLayout();
      if (cta) {
        if (cta.excerptToBtn < 16) {
          errors.push(
            `excerpt→CTA gap < 16px ${label} @${vw}: ${cta.excerptToBtn.toFixed(1)}px`,
          );
        }
        if (cta.innerBelowBtn > 6) {
          errors.push(
            `empty padding below CTA ${label} @${vw}: ${cta.innerBelowBtn.toFixed(1)}px (max 6)`,
          );
        }
        if (cta.btnToSheetBottom < 28 || cta.btnToSheetBottom > 38) {
          errors.push(
            `CTA inset from card bottom ${label} @${vw}: ${cta.btnToSheetBottom.toFixed(1)}px (expected ~33±5)`,
          );
        }
      }
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
      await page.waitForFunction(() => window.__playtestQa.isInInterior() === false, null, {
        timeout: 10_000,
      });
      await wait(200);
    };

    for (const [vw, vh] of [
      [375, 667],
      [390, 844],
      [430, 932],
    ]) {
      await page.setViewportSize({ width: vw, height: vh });
      await wait(250);
      await page.evaluate(() => window.__playtestQa.setLang('es'));
      await wait(200);
      await assertInteriorMatchesPeekRef(vw, 'teresa ES about dismissed', 'teresa');
      await assertInteriorMatchesPeekRef(vw, 'biblioteca ES about dismissed', 'biblioteca');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__playtestQa.setLang('en'));
    await wait(350);
    await assertInteriorMatchesPeekRef(390, 'teresa EN about dismissed', 'teresa');
    const refEn = await syncPeekRefHeight();
    await page.evaluate(() => window.__playtestQa.setLang('es'));
    await wait(350);
    const refEs = await syncPeekRefHeight();
    if (refEn > 0 && refEs > 0 && Math.abs(refEs - refEn) < 1) {
      errors.push('peek ref height unchanged after EN→ES language switch');
    }
    await assertInteriorMatchesPeekRef(390, 'teresa ES after EN switch', 'teresa');

    for (const [vw, vh] of [[390, 844]]) {
      await page.setViewportSize({ width: vw, height: vh });
      await wait(250);
      await page.evaluate(() => {
        sessionStorage.setItem('playtest-welcome-done', '1');
        const chrome = document.querySelector('.chrome');
        if (chrome) {
          chrome.classList.add('chrome--sheet', 'chrome--intro-peek');
          chrome.classList.remove('chrome--intro-expanded', 'chrome--intro-full');
        }
      });
      const ref = await measureAbout(vw);
      const refH = await syncPeekRefHeight();
      if (ref && refH > 0 && Math.abs(ref.height - refH) > 2) {
        errors.push(
          `token vs visible about height @${vw}: token=${refH.toFixed(1)} visible=${ref.height.toFixed(1)}`,
        );
      }
      await assertMeasureCloneSanitized();
      const aboutCta = await page.evaluate(() => {
        const intro = document.querySelector(
          '.chrome:not(#mobile-peek-card-measure).chrome--intro-peek .chrome__intro',
        );
        const btn = document.querySelector(
          '.chrome:not(#mobile-peek-card-measure).chrome--intro-peek .chrome__see-details',
        );
        if (!intro || !btn) return null;
        const introR = intro.getBoundingClientRect();
        const abR = btn.getBoundingClientRect();
        return introR.bottom - abR.bottom;
      });
      if (aboutCta != null && (aboutCta < 24 || aboutCta > 40)) {
        errors.push(`about peek CTA bottom inset @${vw}: ${aboutCta.toFixed(1)}px (expected ~33±6)`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await page.waitForFunction(() => window.__playtestQa?.isInInterior?.() === true, null, {
      timeout: 20_000,
    });
    await page.waitForSelector('.building-panel--interior-entry.building-panel--open', {
      timeout: 10_000,
    });
    const enterId = await page.evaluate(() => window.__playtestQa.getInteriorId?.());
    if (enterId !== 'teresa') errors.push(`enter interior id ${enterId}`);
    await wait(400);
    await assertMeasureCloneSanitized();
    const ctaLayout = await measurePeekCtaLayout();
    if (ctaLayout) {
      if (ctaLayout.excerptToBtn < 16) {
        errors.push(`excerpt→CTA gap < 16px @390: ${ctaLayout.excerptToBtn.toFixed(1)}px`);
      }
      if (ctaLayout.innerBelowBtn > 6) {
        errors.push(`empty padding below CTA @390: ${ctaLayout.innerBelowBtn.toFixed(1)}px`);
      }
      await page.evaluate(() => {
        sessionStorage.setItem('playtest-welcome-done', '1');
        const chrome = document.querySelector('.chrome');
        if (chrome) {
          chrome.classList.add('chrome--sheet', 'chrome--intro-peek');
          chrome.classList.remove('chrome--intro-expanded', 'chrome--intro-full');
        }
      });
      await wait(200);
      const withAbout = await measurePeekCtaLayout();
      if (
        withAbout?.aboutBtnToCardBottom != null &&
        withAbout.aboutBtnToCardBottom > 8 &&
        Math.abs(ctaLayout.btnToSheetBottom - withAbout.aboutBtnToCardBottom) > 8
      ) {
        errors.push(
          `interior CTA bottom inset ${ctaLayout.btnToSheetBottom.toFixed(1)}px vs about ${withAbout.aboutBtnToCardBottom.toFixed(1)}px`,
        );
      }
    }

    const peekLabels = await page.evaluate(() => {
      const cta = document.querySelector('[data-exp-peek-expand-label]')?.textContent?.trim() ?? '';
      const chromeTitle = document.querySelector('.exp-mobile-chrome__title')?.textContent?.trim() ?? '';
      const stripTitle = document.querySelector('.interior-exp-peek__title');
      const stripVisible =
        !!stripTitle && stripTitle.checkVisibility?.() && getComputedStyle(stripTitle).display !== 'none';
      return { cta, chromeTitle, stripVisible };
    });
    if (!/ver charlas|view talks/i.test(peekLabels.cta)) {
      errors.push(`peek CTA expected Ver charlas / View talks, got "${peekLabels.cta}"`);
    }
    if (peekLabels.stripVisible) errors.push('duplicate title: interior-exp-peek__title visible on phone peek');

    await page.screenshot({ path: path.join(TEST_OUT, 'interior-peek-vs-about-390.png'), fullPage: true });

    const backBtn = page.locator('[data-exp-mobile-back]');
    if (await backBtn.isVisible()) {
      errors.push('back visible on interior peek (should be hidden)');
    }

    const peek = page.locator('.building-panel--interior-entry .interior-exp-peek__excerpt');
    await peek.waitFor({ state: 'visible', timeout: 8000 });
    const excerpt = (await peek.textContent())?.trim() ?? '';
    if (!excerpt || /placeholder/i.test(excerpt)) errors.push(`bad excerpt: ${excerpt}`);

    const expand = page.locator('.building-panel--interior-entry [data-exp-peek-expand]');
    await assertInViewport(expand);
    await expand.evaluate((el) => el.click());
    await page.waitForFunction(
      () =>
        document.querySelectorAll('.building-panel--interior-entry .experience__list .experience__row')
          .length > 0,
      null,
      { timeout: 5000 },
    );

    const dupIntro = await page
      .locator('.building-panel--interior-entry .experience__intro:not([hidden])')
      .count();
    if (dupIntro > 0) errors.push('duplicate experience intro on expanded sheet');
    if (await page.locator('.interior-exp-peek__title:visible').count()) {
      errors.push('duplicate title: peek strip title visible on expanded sheet');
    }

    const backVisible = await backBtn.isVisible();
    if (backVisible) {
      const peekHBeforeBack = await page.evaluate(() => {
        const sheet = document.querySelector(
          '.building-panel--interior-entry.building-panel--floating-peek .building-panel__sheet',
        );
        return sheet?.getBoundingClientRect().height ?? 0;
      });
      await backBtn.evaluate((el) => el.click());
      await wait(50);
      const peekHAfterBack = await page.evaluate(() => {
        const sheet = document.querySelector(
          '.building-panel--interior-entry.building-panel--floating-peek .building-panel__sheet',
        );
        return sheet?.getBoundingClientRect().height ?? 0;
      });
      if (peekHBeforeBack > 0 && Math.abs(peekHAfterBack - peekHBeforeBack) > 2) {
        errors.push(
          `peek height jump after ‹: ${peekHBeforeBack.toFixed(1)} → ${peekHAfterBack.toFixed(1)}`,
        );
      }
      await wait(350);
      const stillIn = await page.evaluate(() => window.__playtestQa.isInInterior());
      if (!stillIn) errors.push('‹ on expanded list exited building');
      const peekAgain = await page.locator('[data-exp-peek-expand]').isVisible();
      if (!peekAgain) errors.push('‹ did not return to peek');
    } else {
      errors.push('back not visible on expanded list');
    }

    const gracePack = await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      const wasIn = window.__playtestQa.isInInterior();
      const beforeId = window.__playtestQa.getInteriorId?.();
      const canvasInterior = document.getElementById('game-canvas')?.dataset.interior ?? '';
      window.__playtestQa.leaveInteriorNow();
      const leaveAt = window.__playtestQa.doorGraceSnapshot?.()?.leaveGraceAt ?? 0;
      const tapAt = leaveAt + 750;
      while (leaveAt > 0 && performance.now() < tapAt) {
        /* wall-clock spin — timers drift under Playwright load */
      }
      const tapNow = performance.now();
      const graceActive = leaveAt > 0 && tapNow < leaveAt + 1500;
      let tapped = false;
      if (graceActive) {
        const pt = window.__playtestQa.doorScreenPoint('teresa');
        if (pt) {
          window.__playtestQa.tapScreen(pt.x, pt.y);
          tapped = true;
        }
      }
      return {
        wasIn,
        beforeId,
        canvasInterior,
        leaveAt,
        now: tapNow,
        graceActive,
        tapped,
        grace: window.__playtestQa.doorGraceSnapshot?.(),
        canvasGrace: document.getElementById('game-canvas')?.dataset.doorGraceId ?? null,
      };
    });
    if (!gracePack.leaveAt) {
      errors.push(`missing leaveGraceAt after exit: ${JSON.stringify(gracePack)}`);
    }
    if (!gracePack.wasIn) errors.push('not inside building before grace leave');
    if (!gracePack.beforeId && !gracePack.canvasInterior) {
      errors.push(
        `no interior id before leave (beforeId=${gracePack.beforeId} canvas=${gracePack.canvasInterior})`,
      );
    }
    if (
      gracePack.grace?.graceId !== 'teresa' &&
      gracePack.canvasGrace !== 'teresa'
    ) {
      errors.push(`exit grace not armed: ${JSON.stringify(gracePack)}`);
    }
    if (!gracePack.graceActive || !gracePack.tapped) {
      errors.push(`grace door tap failed: ${JSON.stringify(gracePack)}`);
    }
    await wait(4000);
    if (gracePack.graceActive && (await page.evaluate(() => window.__playtestQa.isInInterior()))) {
      const snap = await page.evaluate(() => window.__playtestQa.doorGraceSnapshot?.());
      errors.push(`re-entered teresa during exit grace ${JSON.stringify(snap ?? {})}`);
    }

    const runGraceTapThenEnter = async (targetPage, cdpSession, label) => {
      const pack = await targetPage.evaluate(async () => {
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        window.__playtestQa.enterInterior('teresa');
        await delay(400);
        window.__playtestQa.leaveInteriorNow();
        const t0 = Number(document.getElementById('game-canvas')?.dataset.leaveGraceAt ?? 0);
        while (t0 > 0 && performance.now() < t0 + 800) await delay(10);
        const pt = window.__playtestQa.doorScreenPoint('teresa');
        if (!pt) return { error: 'no door point' };
        window.__playtestQa.tapScreen(pt.x, pt.y);
        while (t0 > 0 && performance.now() < t0 + 2000) await delay(10);
        const snap = window.__playtestQa.doorGraceSnapshot?.();
        const graceExpired = t0 > 0 && performance.now() >= t0 + 1500;
        if (graceExpired && snap?.doorGraceWalkNoEntry) {
          return { error: 'doorGraceWalkNoEntry still set after grace expired', snap };
        }
        window.__playtestQa.tapScreen(pt.x, pt.y);
        return { error: null, snap, graceExpired, t0 };
      });
      if (pack.error) errors.push(`${label}: ${pack.error} ${JSON.stringify(pack.snap ?? {})}`);
      await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      try {
        await targetPage.waitForFunction(() => window.__playtestQa.isInInterior() === true, null, {
          timeout: 22_000,
        });
      } catch {
        errors.push(`${label}: single door tap at 2s did not enter (CPU throttled)`);
      }
      await cdpSession.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      if (await targetPage.evaluate(() => window.__playtestQa.isInInterior())) {
        await targetPage.evaluate(() => window.__playtestQa.leaveInteriorNow());
        await wait(300);
      }
    };

    await runGraceTapThenEnter(page, cdp, 'phone grace 0.8s tap then 2s enter');

    await page.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await wait(500);
    const z0 = await page.evaluate(() => window.__playtestQa.getZoom());
    const canvas = await page.$('#game-canvas');
    const box = await canvas.boundingBox();
    await pinchZoom(cdp, box.x + box.width / 2, box.y + box.height / 2, 80);
    await wait(300);
    const z1 = await page.evaluate(() => window.__playtestQa.getZoom());
    if (Math.abs(z1 - z0) < 0.02) errors.push(`pinch did not change zoom (${z0} -> ${z1})`);

    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const dPage = await desk.newPage();
    await dPage.addInitScript(() => sessionStorage.setItem('playtest-welcome-done', '1'));
    await dPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForQa(dPage);

    const assertDesktopListLangAfterToggle = async (building) => {
      await dPage.evaluate(() => window.__playtestQa.setLang('es'));
      await wait(200);
      await dPage.evaluate((b) => window.__playtestQa.enterInterior(b), building);
      await dPage.waitForSelector('.building-panel--interior-entry.building-panel--open', {
        timeout: 12_000,
      });
      await wait(300);
      const listOpenBtn = dPage.locator('[data-exp-interior-list-open]');
      await listOpenBtn.waitFor({ state: 'visible', timeout: 8000 });
      await listOpenBtn.click();
      await wait(350);
      await dPage.evaluate(() => window.__playtestQa.setLang('en'));
      await wait(350);
      const titles = await dPage.$$eval(
        '.building-panel--interior-entry .experience__row-title',
        (els) => els.map((e) => e.textContent?.trim() ?? '').filter(Boolean),
      );
      const metas = await dPage.$$eval(
        '.building-panel--interior-entry .experience__row-meta',
        (els) => els.map((e) => e.textContent?.trim() ?? '').filter(Boolean),
      );
      if (!titles.length) errors.push(`desktop ${building}: no list titles after lang toggle`);
      for (const title of titles) {
        if (ES_TITLE_IN_EN.test(title)) {
          errors.push(`desktop ${building} list title still ES after EN toggle: ${title}`);
        }
      }
      for (const meta of metas) {
        if (ES_MONTH_IN_META.test(meta)) {
          errors.push(`desktop ${building} list date still ES after EN toggle: ${meta}`);
        }
      }
      await dPage.evaluate(() => window.__playtestQa.leaveInteriorNow());
      await waitForDoorGraceAfterLeave(dPage);
    };

    await assertDesktopListLangAfterToggle('teresa');
    await assertDesktopListLangAfterToggle('biblioteca');

    await dPage.evaluate(() => window.__playtestQa.setLang('es'));
    await dPage.evaluate(() => window.__playtestQa.enterInterior('teresa'));
    await dPage.waitForSelector('.building-panel--interior-entry.building-panel--open', {
      timeout: 10_000,
    });
    await wait(400);
    if (await dPage.locator('.interior-exp-peek').isVisible()) {
      errors.push('desktop 1280: interior-exp-peek strip must be hidden');
    }
    const header = dPage.locator('.building-panel--interior-entry .exp-header');
    const headerBox = await header.boundingBox();
    const intro = dPage.locator('.building-panel--interior-entry .experience__intro');
    const introBox = await intro.boundingBox();
    if (headerBox && headerBox.top < 2) {
      const peekStrip = await dPage.locator('.interior-exp-peek').boundingBox();
      if (peekStrip && peekStrip.top < headerBox.bottom) {
        errors.push('desktop: peek overlays header');
      }
    }
    if (headerBox && introBox && introBox.y < headerBox.y) {
      errors.push('desktop: experience intro above exp-header');
    }
    if (await dPage.locator('.ui-view[data-view="cenital"]').isVisible()) {
      errors.push('desktop: cenital toggle should be hidden');
    }
    const listOpen = dPage.locator('[data-exp-interior-list-open]');
    await listOpen.waitFor({ state: 'visible', timeout: 5000 });
    await listOpen.click();
    await wait(400);
    const rowCount = await dPage.locator('.building-panel--interior-entry .experience__list .experience__row').count();
    if (rowCount < 14) errors.push(`desktop list expected 14 rows, got ${rowCount}`);
    const deskBack = dPage.locator('[data-exp-back]');
    if (await deskBack.isVisible()) {
      await deskBack.click();
      await wait(350);
      if (!(await dPage.evaluate(() => window.__playtestQa.isInInterior()))) {
        errors.push('desktop ‹ on list exited building');
      }
      if (!(await listOpen.isVisible())) errors.push('desktop ‹ did not return to excerpt peek');
    } else {
      errors.push('desktop ‹ missing on expanded list');
    }
    const deskCdp = await dPage.context().newCDPSession(dPage);
    await runGraceTapThenEnter(dPage, deskCdp, 'desktop grace 0.8s tap then 2s enter');
    await desk.close();
  } catch (e) {
    errors.push(e.message || String(e));
  } finally {
    clearTimeout(timeout);
    await browser.close();
    await stopPreview(preview);
  }

  if (errors.length) {
    console.error('test-interior-exp-peek FAIL:\n', errors.join('\n'));
    process.exit(1);
  }
  console.log('test-interior-exp-peek: ok');
}

main();
