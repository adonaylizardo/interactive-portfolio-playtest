#!/usr/bin/env node
/**
 * Desktop layout gates @ 1440×900 DPR2: case peek dock, case reader full bleed, About Leer column.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? `http://127.0.0.1:4194/interactive-portfolio-playtest/`;
const OUT = '/tmp/desktop-casos-about-qa';
fs.mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dismissWelcome(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('playtest-welcome-done', '1');
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__playtestQa?.showCasePreview, { timeout: 120000 });
}

function loadPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

/** Mean absolute channel diff 0–255 (downscaled). */
function meanDiff(aPath, bPath) {
  const a = loadPng(aPath);
  const b = loadPng(bPath);
  const w = Math.min(a.width, b.width, 400);
  const h = Math.min(a.height, b.height, 300);
  let sum = 0;
  let n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ax = Math.floor((x / w) * a.width);
      const ay = Math.floor((y / h) * a.height);
      const bx = Math.floor((x / w) * b.width);
      const by = Math.floor((y / h) * b.height);
      const ia = (a.width * ay + ax) * 4;
      const ib = (b.width * by + bx) * 4;
      sum += Math.abs(a.data[ia] - b.data[ib]);
      sum += Math.abs(a.data[ia + 1] - b.data[ib + 1]);
      sum += Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      n += 3;
    }
  }
  return sum / n;
}

const errors = [];
const notes = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

try {
  await dismissWelcome(page);

  async function assertPeekHit(layout, expectSplitDock) {
    await page.evaluate((mode) => window.__playtestQa.setLayout(mode), layout);
    await page.evaluate(() => window.__playtestQa.showCasePreview('volaris'));
    await wait(600);
    const peekShot = path.join(OUT, `case-peek-1440-${layout}.png`);
    await page.screenshot({ path: peekShot });
    const colRight = 64 + 432;
    const minLeft = expectSplitDock ? colRight + 16 : 64;
    const maxLeft = expectSplitDock ? colRight + 24 : 80;
    const hit = await page.evaluate(
      ({ minLeft, expectSplitDock }) => {
        const sheet = document.querySelector('.building-panel__sheet');
        const col = document.querySelector('.chrome__column');
        const r = sheet?.getBoundingClientRect();
        const colR = col?.getBoundingClientRect();
        const cx = r ? r.left + r.width / 2 : 0;
        const cy = r ? r.top + r.height / 2 : 0;
        const top = document.elementFromPoint(cx, cy);
        const onPeek =
          !!top &&
          (top.closest('.building-panel__sheet') != null ||
            top.closest('.case-preview') != null);
        return {
          layout: document.body.dataset.layout,
          sheetLeft: r?.left,
          sheetWidth: r?.width,
          colRight: colR?.right,
          onPeek,
          topTag: top?.className?.slice?.(0, 60) ?? String(top),
        };
      },
      { minLeft, expectSplitDock },
    );
    notes.push(`peek ${layout} ${JSON.stringify(hit)}`);
    if (hit.layout !== layout) errors.push(`peek ${layout}: body layout ${hit.layout}`);
    if (!hit.sheetLeft || hit.sheetLeft < minLeft - 2) {
      errors.push(`peek ${layout}: left ${hit.sheetLeft} (want >= ${minLeft})`);
    }
    if (!expectSplitDock && hit.sheetLeft > maxLeft) {
      errors.push(`peek map: left ${hit.sheetLeft} (want ~64, under column)`);
    }
    if (!hit.onPeek) errors.push(`peek ${layout}: elementFromPoint center not on peek (${hit.topTag})`);
    await page.evaluate(() => window.__playtestQa.dismissBuildingPanel());
    await wait(200);
  }

  await assertPeekHit('split', true);
  await assertPeekHit('map', false);

  await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
  await wait(600);
  const peekShot = path.join(OUT, 'case-peek-1440.png');
  await page.screenshot({ path: peekShot });

  const chromeHidden = await page.evaluate(() => {
    const checklist = document.querySelector('.checklist');
    const lang = document.querySelector('.chrome__lang');
    const cl = checklist ? getComputedStyle(checklist).visibility : 'missing';
    const ll = lang ? getComputedStyle(lang).visibility : 'missing';
    return { checklist: cl, lang: ll };
  });
  notes.push(`peek chrome visibility ${JSON.stringify(chromeHidden)}`);

  await page.locator('[data-read]').click();
  await wait(700);
  const expandedShot = path.join(OUT, 'case-expanded-1440.png');
  await page.screenshot({ path: expandedShot });
  const expanded = await page.evaluate(() => {
    const sheet = document.querySelector('.building-panel__sheet')?.getBoundingClientRect();
    const canvas = getComputedStyle(document.getElementById('game-canvas'));
    const checklist = document.querySelector('.checklist');
    const lang = document.querySelector('.chrome__lang');
    return {
      sheetLeft: sheet?.left,
      sheetWidth: sheet?.width,
      canvasVis: canvas.visibility,
      checklistVis: checklist ? getComputedStyle(checklist).visibility : null,
      langVis: lang ? getComputedStyle(lang).visibility : null,
    };
  });
  if (expanded.sheetLeft > 100) errors.push(`case reader: sheet left ${expanded.sheetLeft} (want ~64)`);
  if (expanded.sheetWidth < 1200) errors.push(`case reader: sheet width ${expanded.sheetWidth} (want full bleed)`);
  if (expanded.canvasVis !== 'hidden') errors.push(`case reader: canvas still ${expanded.canvasVis}`);
  if (expanded.checklistVis !== 'hidden') errors.push(`case reader: checklist ${expanded.checklistVis}`);
  if (expanded.langVis !== 'hidden') errors.push(`case reader: lang ${expanded.langVis}`);

  await page.evaluate(() => {
    window.__playtestQa.collapseCasePreview();
    location.hash = '#/leer/estudio';
  });
  await page.waitForSelector('.reading-view__article--about', { timeout: 60000 });
  await wait(500);
  const aboutShot = path.join(OUT, 'about-leer-1440.png');
  await page.screenshot({ path: aboutShot });
  const about = await page.evaluate(() => {
    const main = document.querySelector('.reading-view__main')?.getBoundingClientRect();
    const title = document.querySelector('.reading-view__article--about .reading-view__detail-title');
    const ts = title ? getComputedStyle(title) : null;
    const lang = document.querySelector('.chrome__lang');
    return {
      mainLeft: main?.left,
      mainWidth: main?.width,
      titleSize: ts?.fontSize,
      titleWeight: ts?.fontWeight,
      langVis: lang ? getComputedStyle(lang).visibility : null,
    };
  });
  if (about.mainWidth < 680 || about.mainWidth > 760) {
    errors.push(`about leer: main width ${about.mainWidth} (want ~720)`);
  }
  const mainCenter = (about.mainLeft ?? 0) + (about.mainWidth ?? 0) / 2;
  if (Math.abs(mainCenter - 720) > 80) errors.push(`about leer: column not centered (center ${mainCenter})`);
  if (about.titleSize !== '22px' || about.titleWeight !== '600') {
    errors.push(`about title: ${about.titleSize}/${about.titleWeight} (want 22px/600)`);
  }
  if (about.langVis !== 'hidden') errors.push(`about leer: lang ${about.langVis}`);

  const refPeek = path.join(ROOT, 'portfolio/casos-ui/desktop-preview.png');
  const refExpanded = path.join(ROOT, 'portfolio/casos-ui/desktop-expanded.png');
  const refAbout = path.join(ROOT, 'docs/ref/about-ui/desktop_leer@2x.png');
  for (const [label, shot, ref] of [
    ['peek', peekShot, refPeek],
    ['expanded', expandedShot, refExpanded],
    ['about', aboutShot, refAbout],
  ]) {
    if (fs.existsSync(ref)) {
      const d = meanDiff(shot, ref);
      notes.push(`${label} meanDiff vs ref: ${d.toFixed(2)}`);
      if (d > 55) errors.push(`${label}: screenshot diverges from ref (meanDiff ${d.toFixed(1)})`);
    } else {
      notes.push(`${label}: ref missing at ${ref}`);
    }
  }
} finally {
  await ctx.close();
  await browser.close();
}

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(1);
}
console.log(`qa-desktop-casos-about: ok (shots in ${OUT})`);
