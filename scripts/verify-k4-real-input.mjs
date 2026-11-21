#!/usr/bin/env node
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
  const runner = path.join(ROOT, 'scripts/verify-k4-dates.mjs');
  for (const tz of [
    'America/Caracas',
    'America/Los_Angeles',
    'Europe/Madrid',
    'Asia/Tokyo',
    'Pacific/Kiritimati',
  ]) {
    const r = spawnSync(process.execPath, [runner], {
      env: { ...process.env, TZ: tz, VERIFY_LANG: 'en', PLAYTEST_BASE: BASE },
      encoding: 'utf8',
    });
    record(`H1-dates-${tz}`, r.status === 0, (r.stdout || r.stderr || '').trim().split('\n').pop(), tz);
  }
}

async function staleDepth(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => {
    sessionStorage.setItem('portfolio-playtest-reading-depth', '5');
  });
  await page.goto(`${BASE}#/leer/bain`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.locator('[data-back-list]').click();
  await page.waitForTimeout(500);
  const url = page.url();
  const onSite = url.includes('preview-contenido') || url.includes('127.0.0.1');
  record('M-stale-depth', onSite && url.includes('#/leer'), url, '390');
}

async function writingsNoChips(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.evaluate(() => window.__playtestQa?.tapBuildingDoor?.('biblioteca'));
  await page.waitForTimeout(8000);
  const st = await page.evaluate(() => {
    const filters = document.querySelector('[data-exp-filters]');
    const chips = filters ? [...filters.querySelectorAll('.experience__filter')].map((b) => b.textContent) : [];
    const rows = [...document.querySelectorAll('.experience__list .experience__row, .experience__list button')].length;
    return { hidden: filters?.hidden ?? true, chips, rows };
  });
  record(
    'M-writings-filters',
    st.hidden && st.chips.length === 0,
    `hidden=${st.hidden} chips=${st.chips.join('|')}`,
    '1280',
  );
}

async function main() {
  await runDateTzTests();
  const k3 = spawnSync(process.execPath, ['scripts/verify-k3-real-input.mjs', BASE], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  record('K3-regression', k3.status === 0, k3.status === 0 ? 'all pass' : 'k3 fail', '—');

  const browser = await launchBrowser(chromium);
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await ctx.newPage();
    await staleDepth(page);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await writingsNoChips(page);
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
  console.log(`\nOK k4 @ ${BASE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
