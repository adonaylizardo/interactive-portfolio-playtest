#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE =
  process.env.PLAYTEST_BASE ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-contenido/';

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('playtest-welcome-done', '1');
    } catch {
      /* */
    }
  });
  await page.goto(`${BASE}#/leer/estudio`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.reading-view') && !document.getElementById('boot'), {
    timeout: 180000,
  });
  const report = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')]
      .map((el) => el.id)
      .filter((id) => id && !id.startsWith('panel-'));
    const aboutSectionIds = [
      'about-me',
      'my-journey',
      'my-principles',
      'people-before-pixels',
      'data-informed-decisions',
      'purpose-over-process',
      'collaboration-over-competition',
      'and-above-all-empathy',
      'lets-dive-in',
      'what-i-do',
      'how-i-work',
      'what-sets-me-apart',
      'connect-with-me',
    ];
    const dupes = [];
    for (const id of aboutSectionIds) {
      const n = document.querySelectorAll(`#${CSS.escape(id)}`).length;
      if (n !== 1) dupes.push({ id, count: n });
    }
    const panelPrefixed = document.querySelectorAll('[id^="panel-"]').length;
    return { dupes, panelPrefixed, totalIds: ids.length };
  });
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (report.dupes.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
