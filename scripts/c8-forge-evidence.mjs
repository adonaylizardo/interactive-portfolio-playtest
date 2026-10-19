/**
 * Forge QA c8 — off-glyph road taps at zoomed-out cenital drive + overview fill.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const BUILDINGS = ['bain', 'mentoria', 'estudio', 'volaris', 'catedral'];

async function setupDrive(page) {
  await page.evaluate(() => {
    if (window.__playtestQa.overviewCoverage().overview) {
      window.__playtestQa.toggleMapOverview();
    }
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setViewMode('cenital');
    window.__playtestQa.focusJac?.();
  });
  await wait(800);
  await page.evaluate(() => window.__playtestQa.driveEnter?.('estudio'));
  await wait(1200);
}

async function tapCanvasLocal(page, sx, sy) {
  const before = await page.evaluate(() => ({
    panel: document.querySelector('.building-panel--open') != null,
  }));
  await page.evaluate(([x, y]) => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    window.__playtestQa.tapScreen(rect.left + x, rect.top + y);
  }, [sx, sy]);
  await wait(450);
  const after = await page.evaluate(() => ({
    panel: document.querySelector('.building-panel--open') != null,
    preview: document.querySelector('.building-panel--preview') != null,
  }));
  return { sx, sy, enter: after.panel || after.preview, ...before, ...after };
}

async function pinchZoomOut(page, targetZoom) {
  await page.evaluate(() => {
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.clearDriveTapSuppress?.();
  });
  await wait(200);
  await page.evaluate((z) => window.__playtestQa.setZoom(z), [targetZoom]);
  await wait(350);
  return page.evaluate(() => Number(document.querySelector('canvas')?.dataset.zoom ?? 0));
}

async function offGlyphMatrix(page, vpTag, zoomTarget) {
  const z = await pinchZoomOut(page, zoomTarget);
  const probes = [];
  for (const name of BUILDINGS) {
    await page.evaluate((n) => window.__playtestQa.frameDoorForQa(n), name);
    await wait(350);
    const g = await page.evaluate(
      (n) => window.__playtestQa.cenitalDoorGlyphScreen(n),
      name,
    );
    if (!g) continue;
    const halfW = (g.right - g.left) / 2;
    const off = 15;
    const sx = g.cx - halfW - off;
    const sy = g.cy;
    const pick = await page.evaluate(
      ([x, y]) => window.__playtestQa.pickDrivingEnterAtScreen(x, y),
      [sx, sy],
    );
    const tap = await tapCanvasLocal(page, sx, sy);
    probes.push({ viewport: vpTag, zoom: z, name, offPx: off, pick, ...tap });
  }
  return probes;
}

async function overviewProbe(page, vp) {
  await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
  await wait(400);
  await page.evaluate(() => window.__playtestQa.toggleMapOverview());
  await wait(600);
  const cov = await page.evaluate(() => window.__playtestQa.overviewCoverage());
  return { viewport: vp.tag, cov };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { tag: '390', width: 390, height: 844, zoom: 0.15 },
    { tag: '844', width: 844, height: 390, zoom: 0.18 },
    { tag: '1280', width: 1280, height: 800, zoom: 0.143 },
  ];
  let bundle = '';
  const offGlyph = [];
  const overviews = [];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForFunction(() => window.__playtestQa?.setViewMode);
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;

    overviews.push(await overviewProbe(page, vp));
    await setupDrive(page);
    offGlyph.push(...(await offGlyphMatrix(page, vp.tag, vp.zoom)));
    await page.close();
  }
  await browser.close();

  const enters = offGlyph.filter((p) => p.enter);
  const offGlyphOk = enters.length === 0;
  const overviewOk = overviews.every(
    (o) => o.cov.overview && o.cov.viewportLimitingFill >= 0.85,
  );
  const report = {
    base: BASE,
    bundle,
    at: new Date().toISOString(),
    offGlyph,
    offGlyphEnterCount: enters.length,
    offGlyphOk,
    overviews,
    overviewOk,
  };
  fs.writeFileSync(path.join(OUT, 'forge-c8-evidence.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { bundle, offGlyphEnterCount: enters.length, offGlyphOk, overviewOk },
      null,
      2,
    ),
  );
  if (!offGlyphOk || !overviewOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
