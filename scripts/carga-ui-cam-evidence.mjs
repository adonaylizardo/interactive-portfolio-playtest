/**
 * Camera-switch loading UI vs docs/ref/carga-ui/*_3-cambio-camara@2x.png
 * Compares chrome crops: top cam tabs + center loading pill (not full frame).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import {
  chromeStackFromShot,
  collectChromeBoxes,
  diffNotes,
  refChromeStack,
  sideBySidePng,
} from './ui-chrome-crop.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'docs', 'ref', 'carga-ui');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona', 'carga-ui');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { tag: 'telefono-vertical', w: 390, h: 844, touch: true },
  { tag: 'telefono-horizontal', w: 844, h: 390, touch: true },
  { tag: 'desktop', w: 1280, h: 800, touch: false },
];

async function captureLoadingShot(page, cdp, touch, tag, vp) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setLayout('map');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(400);
  const tp = page.locator('[data-cam="persona"]');
  const tbox = await tp.boundingBox();
  if (touch && tbox) {
    const x = tbox.x + tbox.width / 2;
    const y = tbox.y + tbox.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y, radiusX: 1, radiusY: 1, force: 1 }],
    });
    await wait(30);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else if (tbox) {
    await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  }
  let sawLoad = false;
  for (let i = 0; i < 24; i++) {
    sawLoad = await page.evaluate(
      () => !document.querySelector('[data-cam-load]')?.hasAttribute('hidden'),
    );
    if (sawLoad) break;
    await wait(16);
  }
  const fullShot = path.join(OUT, `${tag}_3-cambio-camara_full.png`);
  await page.screenshot({ path: fullShot });
  const boxes = await collectChromeBoxes(page, [
    '.persona-kit__cam',
    '[data-cam-load]:not([hidden]) .persona-kit__cam-load-pill',
  ]);
  if (boxes.length < 2) throw new Error(`${tag}: loading chrome bbox missing`);
  const stacked = chromeStackFromShot(fullShot, boxes);
  const shot = path.join(OUT, `${tag}_3-cambio-camara_chrome.png`);
  fs.writeFileSync(shot, PNG.sync.write(stacked));
  const ref = path.join(REF, `${tag}_3-cambio-camara@2x.png`);
  const refStackPath = path.join(OUT, `${tag}_3-cambio-camara_ref-chrome.png`);
  const refStack = refChromeStack(ref, vp, boxes);
  let cmpRef = ref;
  if (refStack) {
    fs.writeFileSync(refStackPath, PNG.sync.write(refStack));
    cmpRef = refStackPath;
  }
  const cmp = path.join(OUT, `${tag}_3-cambio-camara-vs-ref_chrome.png`);
  const { diffPct, refMissing } = sideBySidePng(stacked, cmpRef, cmp);
  await page
    .waitForFunction(() => document.querySelector('[data-cam-load]')?.hasAttribute('hidden'), null, {
      timeout: 30000,
    })
    .catch(() => null);
  return {
    tag,
    sawLoad,
    diffPct,
    refMissing,
    diffNotes: diffNotes(diffPct),
    chromeBoxes: boxes,
    shot: path.basename(shot),
    compare: path.basename(cmp),
    fullFrame: path.basename(fullShot),
  };
}

async function main() {
  const browser = await launchBrowser(chromium);
  const rows = [];
  let bundle = '';
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, {
      timeout: 90000,
    });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;
    rows.push(await captureLoadingShot(page, cdp, vp.touch, vp.tag, { width: vp.w, height: vp.h }));
    await ctx.close();
  }
  await browser.close();
  const report = { base: BASE, bundle, compareMode: 'chrome-tabs-pill', rows };
  fs.writeFileSync(path.join(OUT, 'cam-switch-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
