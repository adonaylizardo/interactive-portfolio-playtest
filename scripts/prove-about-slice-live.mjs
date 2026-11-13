#!/usr/bin/env node
/**
 * About + Contact + Search slice — deployed /preview-edificios/ evidence.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE =
  process.env.DEPLOY_URL ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-edificios/';
const OUT = process.env.ARTIFACT_DIR ?? '/opt/cursor/artifacts/about-slice';

async function waitMap(page) {
  await page.waitForFunction(() => document.querySelector('#game-canvas') && document.querySelector('.chrome'), {
    timeout: 60000,
  });
  await page.waitForTimeout(1000);
}

async function dismissIntro(page) {
  await page.evaluate(() => {
    document.querySelector('[data-action="intro-close"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
}

async function tapSelector(page, sel, touch) {
  const pt = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 2) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!pt) return false;
  if (touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
  return true;
}

async function closeAbout(page) {
  await page.evaluate(() => document.querySelector('[data-about-close]')?.click());
  await page.waitForTimeout(350);
}

async function setEn(page) {
  const lang = await page.evaluate(() => {
    const en = document.querySelector('.chrome__lang-opt[data-lang="en"]');
    const r = en?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (lang) await page.mouse.click(lang.x, lang.y);
  await page.waitForTimeout(300);
}

async function cropShot(page, name, clip) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip });
}

const report = { base: BASE, checks: [], bundle: null };

const browser = await chromium.launch();
try {
  await mkdir(OUT, { recursive: true });

  for (const vp of [
    { w: 390, h: 844, tag: '390x844', touch: true },
    { w: 844, h: 390, tag: '844x390', touch: true },
    { w: 1280, h: 800, tag: '1280x800', touch: false },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch,
      isMobile: vp.w < 900,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await waitMap(page);
    if (vp.touch) await dismissIntro(page);
    await setEn(page);

    if (!report.bundle) {
      report.bundle = await page.evaluate(() => ({
        js: [...document.querySelectorAll('script[src*="assets/index-"]')].map((s) => s.src),
        css: [...document.querySelectorAll('link[href*="assets/index-"]')].map((l) => l.href),
      }));
    }

    const avatarSel = vp.touch
      ? '.chrome__dock [data-dock="intro"]'
      : '.chrome__rail [data-action="home"]';
    await tapSelector(page, avatarSel, vp.touch);
    await page.waitForTimeout(600);
    const aboutOpen = await page.evaluate(
      () => document.querySelector('.about-panel--open') && document.querySelector('#about-panel-title')?.textContent,
    );
    report.checks.push({ id: `${vp.tag} avatar opens About`, pass: aboutOpen === 'About me', aboutOpen });
    await cropShot(page, `${vp.tag}-about`, { x: 0, y: 0, width: vp.w, height: vp.h });

    await closeAbout(page);

    const contactSel = vp.touch
      ? '.chrome__dock [data-action="contact"]'
      : '.chrome__rail [data-action="contact"]';
    await tapSelector(page, contactSel, vp.touch);
    await page.waitForTimeout(800);
    const contactState = await page.evaluate(() => ({
      open: !!document.querySelector('.about-panel--open'),
      flash: !!document.querySelector('.about-panel__contact--flash'),
      mailto: document.querySelector('#about-contact a[href^="mailto:"]')?.getAttribute('href') ?? null,
    }));
    report.checks.push({
      id: `${vp.tag} contact panel + mailto`,
      pass: contactState.open && contactState.mailto === 'mailto:adolizardo@gmail.com',
      contactState,
    });
    await cropShot(page, `${vp.tag}-contact`, { x: 0, y: 0, width: vp.w, height: vp.h });

    await closeAbout(page);

    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-action="search"]')];
      const visible = buttons.find((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      });
      visible?.click();
    });
    await page.waitForTimeout(600);
    await page.waitForSelector('.search-palette--open .search-palette__input', { timeout: 15000 });
    await page.locator('.search-palette__input').fill('design');
    await page.waitForTimeout(500);
    const designGroups = await page.evaluate(() =>
      [...document.querySelectorAll('.search-palette__group-label')].map((el) => el.textContent?.trim()),
    );
    report.checks.push({
      id: `${vp.tag} search design`,
      pass: designGroups.length > 0,
      designGroups,
    });
    await cropShot(page, `${vp.tag}-search-design`, { x: 0, y: 0, width: vp.w, height: vp.h });

    await page.locator('.search-palette__input').fill('pricing');
    await page.waitForTimeout(400);
    const noResults = await page.evaluate(() => ({
      title: document.querySelector('.search-palette__empty-title')?.textContent?.trim(),
      hint: document.querySelector('.search-palette__empty-hint')?.textContent?.trim(),
    }));
    report.checks.push({
      id: `${vp.tag} search pricing empty`,
      pass:
        noResults.title === 'No results for “pricing”' &&
        noResults.hint === 'Try another word, or browse by type.',
      noResults,
    });
    await cropShot(page, `${vp.tag}-search-pricing`, { x: 0, y: 0, width: vp.w, height: vp.h });

    await ctx.close();
  }
} finally {
  await browser.close();
}

report.pass = report.checks.every((c) => c.pass);
await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
