#!/usr/bin/env node
/** Long UI sequence then Sambil play — must request audio and advance progress. */
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

const qa = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await qa(() => window.__playtestQa.openPlaceCard('catedral'));
await wait(400);
await qa(() => window.__playtestQa.closePlaceCard());
await qa(() => window.__playtestQa.enterInterior('flor'));
await wait(500);
await qa(() => window.__playtestQa.exitInterior());
await qa(() => window.__playtestQa.showCasePreview('volaris'));
await wait(400);
await qa(() => window.__playtestQa.expandCasePreview());
await wait(400);
await qa(() => window.__playtestQa.collapseCasePreview());
await qa(() => window.__playtestQa.dismissBuildingPanel());
await wait(300);

await qa(() => window.__playtestQa.openPlaceCard('sambil'));
await page.waitForSelector('.place-card--open');
await page.locator('[data-place-play]').click();
await wait(2500);

const snap = await page.evaluate(() => ({
  muted: window.__playtestQa.audioMuted(),
  unlocked: window.__playtestQa.audioUnlocked(),
  progress: window.__playtestQa.placeVoiceProgress(),
  fill: document.querySelector('.place-card__progress-fill')?.style.width ?? '0%',
}));

await browser.close();

const ok =
  audioReq.length > 0 &&
  (snap.progress.playing || parseFloat(snap.fill) > 0 || snap.progress.current > 0);
console.log(JSON.stringify({ ok, audioReq, snap }, null, 2));
if (!ok) process.exit(1);
console.log('qa-place-voice-stress: ok');
