#!/usr/bin/env node
/**
 * Forge QA e7 — deployed preview-edificios only, no __playtestQa hooks.
 */
import { chromium, devices } from 'playwright';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';

async function waitMap(page, ms = 45000) {
  await page.waitForFunction(
    () => document.querySelector('#game-canvas') && document.querySelector('.chrome'),
    null,
    { timeout: ms },
  );
  await page.waitForTimeout(1500);
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
        cls: target.className?.toString?.().slice(0, 80) ?? '',
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
      collapsed: el.classList.contains('checklist--collapsed') || el.classList.contains('checklist--mobile-closed'),
    };
  });
}

const browser = await chromium.launch();
const out = { base: BASE, pass: true, checks: [] };

function record(name, ok, detail) {
  out.checks.push({ name, ok, ...detail });
  if (!ok) out.pass = false;
}

try {
  // Desktop 1280 — split panel must not expand checklist over lang
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    const lang = await langCenters(page);
    await page.locator('.chrome__rail [data-action="cases"]').click();
    await page.waitForTimeout(400);
    const cl = await checklistBox(page);
    const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
    record('1280 split: checklist collapsed', cl?.collapsed === true && (cl?.w ?? 999) < 200, { cl });
    record('1280 split: EN hit-test', enHit?.lang === 'en' || enHit?.cls.includes('lang-opt'), { enHit, lang });
    if (lang.en) {
      const before = await page.evaluate(() => document.documentElement.lang);
      await page.mouse.click(lang.en.x, lang.en.y);
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => document.documentElement.lang);
      record('1280 split: EN click changes lang', after.startsWith('en') && before !== after, { before, after });
    }
    await page.close();
  }

  // Phone 390x844 — lang not under checklist ring
  {
    const ctx = await browser.newContext({ ...devices['iPhone 12 Pro'], viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    const lang = await langCenters(page);
    const enHit = lang.en ? await hit(page, lang.en.x, lang.en.y) : null;
    record('390: EN not checklist', !enHit?.cls.includes('checklist'), { enHit });
    if (lang.en) {
      await page.touchscreen.tap(lang.en.x, lang.en.y);
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => document.documentElement.lang);
      record('390: EN tap → en', after.startsWith('en'), { after });
    }
    await ctx.close();
  }

  // Landscape 844x390 — Buscar not lang
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    const buscar = await page.evaluate(() => {
      const b = document.querySelector('.chrome__tools-phone [data-action="center"]');
      const r = b?.getBoundingClientRect();
      return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
    if (buscar) {
      const h = await hit(page, buscar.x, buscar.y);
      record('844x390: center hit-test', h?.action === 'center', { h, buscar });
    }
    await page.close();
  }

  // Intro defer — first gesture opens canvas click then wait; no subtitle if we can't hit door without hooks
  // Use real door: click canvas center after load without QA — limited; check deferred via hash biblioteca
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${BASE}#view=x=0&y=0&z=0.85&in=biblioteca`, { waitUntil: 'networkidle', timeout: 90000 });
    await waitMap(page);
    await page.waitForTimeout(800);
    const sub = await page.evaluate(() => document.querySelector('.chrome__subtitle')?.textContent?.trim() ?? '');
    record('1280 biblioteca hash: no intro subtitle', sub.length === 0, { subLen: sub.length });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
