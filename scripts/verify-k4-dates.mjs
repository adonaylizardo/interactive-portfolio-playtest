#!/usr/bin/env node
/**
 * TZ unit proof: formatContentDate for talks (YYYY-MM-DD) and writings (Month D, YYYY).
 * Requires PLAYTEST_BASE pointing at a built preview.
 */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const BASE =
  process.env.PLAYTEST_BASE ??
  'http://127.0.0.1:5200/interactive-portfolio-playtest/preview-contenido/';

const tz = process.env.TZ ?? 'UTC';
const locale = process.env.VERIFY_LANG === 'en' ? 'en' : 'es';

async function main() {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    timezoneId: tz,
    locale: locale === 'en' ? 'en-US' : 'es-VE',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.formatContentDate, undefined, {
    timeout: 60000,
  });
  await page.evaluate((lang) => {
    document.documentElement.lang = lang;
  }, locale === 'en' ? 'en' : 'es');

  const { talk, year, writing } = await page.evaluate(() => ({
    talk: window.__playtestQa.formatContentDate('2025-11-27'),
    year: window.__playtestQa.formatContentDate('2020'),
    writing: window.__playtestQa.formatContentDate('May 26, 2022'),
  }));

  await browser.close();

  const talkOk =
    talk.includes('27') && (talk.toLowerCase().includes('nov') || talk.includes('November'));
  const yearOk = year === '2020';
  const writingOk =
    writing.includes('26') &&
    (writing.toLowerCase().includes('may') || writing.toLowerCase().includes('mayo')) &&
    !writing.includes('25');

  if (!talkOk || !yearOk || !writingOk) {
    console.error(`FAIL tz=${tz} talk=${talk} year=${year} writing=${writing}`);
    process.exit(1);
  }
  console.log(`PASS tz=${tz} talk=${talk} year=${year} writing=${writing}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
