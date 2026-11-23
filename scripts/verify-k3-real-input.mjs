#!/usr/bin/env node
/**
 * K3: content dates (TZ), cold deep link back, contact email, plus K2 smoke on preview.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

const results = [];

function record(id, pass, detail, viewport = '—') {
  results.push({ id, pass, detail, viewport });
}

async function runDateTzTests() {
  const runner = path.join(ROOT, 'scripts/verify-k3-dates.mjs');
  for (const tz of ['America/Caracas', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const r = spawnSync(process.execPath, [runner], {
      env: { ...process.env, TZ: tz, VERIFY_LANG: 'es', PLAYTEST_BASE: BASE },
      encoding: 'utf8',
    });
    const ok = r.status === 0;
    record(`H1-dates-${tz}`, ok, (r.stdout || r.stderr || '').trim().split('\n').pop() || 'ok', tz);
  }
}

async function coldDeepLink(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(`${BASE}#/leer/bain`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2000);
  const before = page.url();
  const back = page.locator('[data-back-list]');
  await back.click({ timeout: 8000 });
  await page.waitForTimeout(600);
  const after = page.url();
  const onSite = after.includes('preview-contenido') || after.includes('127.0.0.1');
  const listHash = after.includes('#/leer') && !after.includes('#/leer/bain');
  record('H2-cold-back-list', onSite && listHash, `${before} → ${after}`, '390');
}

async function contactEmail(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(800);
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')),
  );
  const bad = hrefs.filter((h) => h?.includes('hello@adonaylizardo.com'));
  const good = hrefs.some((h) => h?.includes('adolizardo@gmail.com'));
  record('H3-contact-mailto', good && bad.length === 0, hrefs.join(', ') || '(none)', '1280');
}

async function backToMapCamera(page) {
  await page.goto(`${BASE}#view=x=100.0&y=200.0&z=1.100`, {
    waitUntil: 'networkidle',
    timeout: 120000,
  });
  await page.waitForTimeout(1500);
  await page.locator('.chrome__column button[data-action="reading"]').click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.locator('.reading-view [data-back]').click();
  await page.waitForTimeout(600);
  const hash = await page.evaluate(() => location.hash);
  const pass = hash.includes('x=100') && hash.includes('y=200') && hash.includes('z=1.1');
  record('L-back-map-camera', pass, hash, '1280');
}

async function stockLink(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('estudio'));
  await page.waitForTimeout(6000);
  const href = await page.evaluate(() => {
    const a = [...document.querySelectorAll('.about__text a')].find((el) =>
      /stock market investing/i.test(el.textContent ?? ''),
    );
    return a?.getAttribute('href') ?? '';
  });
  record(
    'M-estudio-stock-link',
    href.includes('adonaylizardo.com') && !href.includes('adonay.design'),
    href,
    '1280',
  );
}

async function main() {
  await runDateTzTests();

  const k2 = spawnSync(process.execPath, ['scripts/verify-k2-real-input.mjs', BASE], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  record('K2-regression', k2.status === 0, k2.status === 0 ? 'all pass' : 'see k2 output', '—');

  const browser = await launchBrowser(chromium);
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await coldDeepLink(page);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await contactEmail(page);
    await backToMapCamera(page);
    await stockLink(page);
    await ctx.close();
  }
  await browser.close();

  console.log('\n| Check | Pass | Detail |');
  console.log('| --- | --- | --- |');
  for (const r of results) {
    console.log(`| ${r.viewport} ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail} |`);
  }
  const fail = results.filter((r) => !r.pass);
  if (fail.length) {
    console.error('\nFailed', fail.length);
    process.exit(1);
  }
  console.log(`\nOK k3 @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
