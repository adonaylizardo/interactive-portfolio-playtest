/**
 * Forge QA c7 — driving road taps vs glyph enter, mobile cenital overview zoom.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setupDrive(page) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setViewMode('cenital');
    window.__playtestQa.focusJac?.();
  });
  await wait(800);
  await page.evaluate(() => window.__playtestQa.driveEnter?.('estudio'));
  await wait(1200);
}

async function roadTapNoEnter(page, tx, ty) {
  const before = await page.evaluate(() => ({
    panel: document.querySelector('.building-panel--open') != null,
    pending: window.__playtestQa.jacSnapshot?.()?.driving,
  }));
  await page.evaluate(
    ([x, y]) => window.__playtestQa.tapMapTile(x, y),
    [tx, ty],
  );
  await wait(400);
  const after = await page.evaluate(() => ({
    panel: document.querySelector('.building-panel--open') != null,
    mode: document.querySelector('.building-panel--preview') != null,
  }));
  return { tx, ty, enter: after.panel || after.mode, ...before, ...after };
}

async function overviewProbe(page, vp) {
  await page.evaluate(() => {
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(400);
  const z0 = await page.evaluate(() => window.__playtestQa.getViewMode().zoom);
  await page.evaluate(() => window.__playtestQa.toggleMapOverview());
  await wait(500);
  let z1 = z0;
  for (let i = 0; i < 8; i++) {
    z1 = await page.evaluate(() => window.__playtestQa.getViewMode().zoom);
    if (z1 < z0 * 0.85) break;
    await wait(400);
  }
  const cov = await page.evaluate(() => window.__playtestQa.overviewCoverage());
  await page.screenshot({ path: path.join(OUT, `c7-overview-${vp.tag}.png`) });
  return { z0, z1, cov, zoomedOut: z1 < z0 * 0.85 && cov.overview };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await launchBrowser(chromium);
  const viewports = [
    { tag: '390', width: 390, height: 844 },
    { tag: '844', width: 844, height: 390 },
    { tag: '1280', width: 1280, height: 800 },
  ];
  let bundle = '';
  const roads = [];
  const overviews = [];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__playtestQa?.setViewMode);
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;

    await setupDrive(page);
    for (const [tx, ty] of [
      [40, 27],
      [16, 17],
      [25, 23],
      [46, 17],
      [38, 37],
    ]) {
      roads.push({ viewport: vp.tag, ...(await roadTapNoEnter(page, tx, ty)) });
    }
    overviews.push({ viewport: vp.tag, ...(await overviewProbe(page, vp)) });
    await page.close();
  }
  await browser.close();

  const roadOk = roads.every((r) => !r.enter);
  const overviewOk = overviews.every((o) => o.zoomedOut);
  const report = {
    base: BASE,
    bundle,
    at: new Date().toISOString(),
    roads,
    roadOk,
    overviews,
    overviewOk,
  };
  fs.writeFileSync(path.join(OUT, 'forge-c7-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ bundle, roadOk, overviewOk }, null, 2));
  if (!roadOk || !overviewOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
