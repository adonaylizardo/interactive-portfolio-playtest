#!/usr/bin/env node
/**
 * Forge QA e7 — deployed preview-edificios only, no __playtestQa hooks.
 */
import { chromium, devices } from 'playwright';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';

const INTRO_SNIPPET = 'welcome to my studio';

async function waitMap(page, ms = 45000) {
  await page.waitForFunction(
    () => document.querySelector('#game-canvas') && document.querySelector('.chrome'),
    null,
    { timeout: ms },
  );
  await page.waitForTimeout(1200);
}

async function bundleHash(page) {
  return page.evaluate(() => {
    const js = [...document.querySelectorAll('script[src*="assets/index-"]')].map((s) => s.src);
    const css = [...document.querySelectorAll('link[href*="assets/index-"]')].map((l) => l.href);
    return { js, css };
  });
}

async function langCenters(page) {
  return page.evaluate(() => {
    const out = {};
    for (const btn of document.querySelectorAll('.chrome__lang-opt')) {
      const r = btn.getBoundingClientRect();
      out[btn.dataset.lang] = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }
    return out;
  });
}

async function hit(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const lang = el.closest('.chrome__lang-opt');
      const rail = el.closest('.chrome__rail button');
      const dock = el.closest('.chrome__dock button');
      const tools = el.closest('.chrome__tools-phone button');
      const target = lang ?? rail ?? dock ?? tools ?? el;
      const r = target.getBoundingClientRect();
      return {
        tag: target.tagName,
        cls: target.className?.toString?.().slice(0, 96) ?? '',
        lang: target instanceof HTMLElement ? target.dataset.lang : '',
        action: target instanceof HTMLElement ? target.dataset.action : '',
        x: r.x,
        y: r.y,
      };
    },
    { x, y },
  );
}

async function checklistBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.checklist');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      cls: el.className,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
      collapsed:
        el.classList.contains('checklist--collapsed') ||
        el.classList.contains('checklist--mobile-closed'),
    };
  });
}

async function tapLang(page, lang, touch = false) {
  const centers = await langCenters(page);
  const pt = centers[lang];
  if (!pt) return { ok: false, reason: 'no lang button' };
  const before = await page.evaluate(() => document.documentElement.lang);
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(280);
  const after = await page.evaluate(() => document.documentElement.lang);
  return { ok: after.startsWith(lang), before, after, pt };
}

async function dismissPhoneIntro(page) {
  const close = page.locator('[data-action="intro-close"]');
  if (await close.isVisible().catch(() => false)) {
    await close.tap().catch(() => close.click());
    await page.waitForTimeout(400);
  }
}

const browser = await chromium.launch();
const out = { base: BASE, pass: true, checks: [], bundle: null };

function record(name, ok, detail) {
  out.checks.push({ name, ok, ...detail });
  if (!ok) out.pass = false;
}

try {
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    out.bundle = await bundleHash(page);
    await waitMap(page);

    const lang = await langCenters(page);
    for (const action of ['home', 'cases', 'achievements']) {
      await page.locator(`.chrome__rail [data-action="${action}"]`).click();
      await page.waitForTimeout(350);
      const cl = await checklistBox(page);
      const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
      record(`1280 split (${action}): checklist collapsed`, cl?.collapsed === true && (cl?.h ?? 999) < 100, { cl });
      record(`1280 split (${action}): EN hit-test`, enHit?.lang === 'en', { enHit });
      const r = await tapLang(page, 'en');
      record(`1280 split (${action}): EN → en`, r.ok, r);
      await page.locator('.chrome__column [data-action="hide-panel"]').click({ timeout: 8000 });
      await page.waitForTimeout(250);
    }

    await page.locator('.chrome__rail [data-action="search"]').click();
    await page.waitForTimeout(300);
    record('1280: search opens casos', (await page.evaluate(() => document.body.dataset.layout)) === 'split', {});

    const [dl] = await Promise.all([
      page.waitForEvent('popup', { timeout: 8000 }).catch(() => null),
      page.locator('.chrome__rail [data-action="download"]').click(),
    ]);
    record('1280: download opens tab', !!dl, {});

    await page.goto(`${BASE}#view=x=0&y=0&z=0.85&in=biblioteca`, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.waitForTimeout(600);
    const subBib = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
    record('1280 biblioteca hash: no intro subtitle', !subBib.toLowerCase().includes(INTRO_SNIPPET), { subBib });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.mouse.click(640, 400);
    await page.waitForTimeout(200);
    await page.locator('.chrome__rail [data-action="cases"]').click();
    await page.waitForTimeout(300);
    await page.locator('.chrome__case-row[data-locate="volaris"]').click();
    await page.waitForTimeout(3500);
    const subPreview = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
    const previewOpen = await page.evaluate(() =>
      document.querySelector('.building-panel--preview.building-panel--open'),
    );
    record('1280 door path: preview open', !!previewOpen, {});
    record('1280 door path: no intro during preview', !subPreview.toLowerCase().includes(INTRO_SNIPPET), {
      subPreview,
    });
    await page.locator('.case-preview__x[data-close]').click({ timeout: 8000 });
    let subAfter = '';
    for (let i = 0; i < 24; i++) {
      subAfter = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
      if (subAfter.toLowerCase().includes(INTRO_SNIPPET)) break;
      await page.waitForTimeout(500);
    }
    record('1280: intro plays after preview close', subAfter.toLowerCase().includes(INTRO_SNIPPET), { subAfter });

    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(400);
    await page.hover('#game-canvas', { position: { x: 200, y: 300 } });
    await page.waitForTimeout(800);
    const bibErrors = errors.filter((m) => m.includes('biblioteca') && m.includes('lejos'));
    record('1280: no biblioteca hover/lejos errors', bibErrors.length === 0, { count: bibErrors.length, sample: bibErrors[0] });

    await page.close();
  }

  {
    const ctx = await browser.newContext({ ...devices['iPhone 12 Pro'], viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await dismissPhoneIntro(page);
    const lang = await langCenters(page);
    const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
    const cl = await checklistBox(page);
    record('390: checklist not over EN', !enHit?.cls.includes('checklist'), { enHit, cl });
    record('390: EN tap → en', (await tapLang(page, 'en', true)).ok, {});
    await page.close();
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await dismissPhoneIntro(page);
    const sound = await page.evaluate(() => {
      const b = document.querySelector('.chrome__tools-phone [data-action="sound"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (sound) {
      const h = await hit(page, sound.x, sound.y);
      record('844x390: sound hit-test', h?.action === 'sound', { h });
      const before = await page.evaluate(() =>
        document.querySelector('[data-action="sound"]')?.getAttribute('aria-pressed'),
      );
      await page.touchscreen.tap(sound.x, sound.y);
      await page.waitForTimeout(200);
      const after = await page.evaluate(() =>
        document.querySelector('[data-action="sound"]')?.getAttribute('aria-pressed'),
      );
      record('844x390: sound toggles', before !== after, { before, after });
    }
    const center = await page.evaluate(() => {
      const b = document.querySelector('.chrome__tools-phone [data-action="center"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (center) {
      const h = await hit(page, center.x, center.y);
      record('844x390: center not lang', h?.action === 'center', { h });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
