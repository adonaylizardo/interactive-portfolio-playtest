#!/usr/bin/env node
/** Sambil ficha play on mobile emulation — progress must advance after tap. */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const audioReq = [];
page.on('request', (r) => {
  if (/10-sambil\.(ogg|mp3)/.test(r.url())) audioReq.push(r.url());
});

await page.addInitScript(() => {
  sessionStorage.setItem('playtest-welcome-done', '1');
});
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__playtestQa?.openPlaceCard, { timeout: 120000 });
await page.evaluate(() => window.__playtestQa.openPlaceCard('sambil'));
await page.waitForSelector('.place-card--open');
await page.locator('[data-place-play]').click();
await page.waitForTimeout(2000);
const snap = await page.evaluate(() => {
  const p = window.__playtestQa.placeVoiceProgress();
  const fill = document.querySelector('.place-card__progress-fill');
  return {
    progress: p,
    fillWidth: fill?.style.width ?? '0%',
    playingClass: document.querySelector('.place-card')?.classList.contains('place-card--playing'),
  };
});
await browser.close();

const pct = parseFloat(snap.fillWidth) || snap.progress.current;
const ok = audioReq.length > 0 && (snap.progress.playing || pct > 0 || parseFloat(snap.fillWidth) > 0);
console.log(JSON.stringify({ ok, audioReq, snap }, null, 2));
if (!ok) process.exit(1);
console.log('qa-placecard-play-mobile: ok');
