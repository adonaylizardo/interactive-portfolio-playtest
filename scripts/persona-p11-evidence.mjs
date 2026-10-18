/**
 * Forge p11 — persona preview evidence (844 landscape + 1280 toast).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundleHash(page) {
  return page.evaluate(() =>
    [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
  );
}

async function tapDock(page, sel) {
  return page.evaluate((s) => {
    const btn = document.querySelector(`.chrome__dock ${s}`);
    if (!btn) return { ok: false };
    const r = btn.getBoundingClientRect();
    btn.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    );
    return { ok: true };
  }, sel);
}

async function landscape844(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.setViewMode);
  await wait(2500);
  const bundle = await bundleHash(page);

  await tapDock(page, '[data-action="cases"]');
  await wait(500);
  const casesShot = path.join(OUT, 'p11-844-casos-sheet.png');
  await page.screenshot({ path: casesShot });
  const casesDom = await page.evaluate(() => ({
    sheet: document.querySelector('.chrome')?.classList.contains('chrome--sheet'),
    dockVisible: !!document.querySelector('.chrome__dock')?.offsetParent,
    dockDisplay: getComputedStyle(document.querySelector('.chrome__dock')).display,
    panel: document.querySelector('.chrome')?.dataset.sheetPanel,
    casesActive: document.querySelector('[data-sheet-panel="cases"]')?.classList.contains('is-active'),
    caseRowCount: document.querySelectorAll('[data-sheet-panel="cases"] .chrome__case-row').length,
  }));

  await tapDock(page, '[data-action="achievements"]');
  await wait(500);
  const logrosShot = path.join(OUT, 'p11-844-logros-sheet.png');
  await page.screenshot({ path: logrosShot });
  const logrosDom = await page.evaluate(() => ({
    panel: document.querySelector('.chrome')?.dataset.sheetPanel,
    logrosActive: document.querySelector('[data-sheet-panel="achievements"]')?.classList.contains('is-active'),
    logroCount: document.querySelectorAll('[data-sheet-panel="achievements"] .chrome__logro').length,
    introHidden: !document.querySelector('[data-sheet-panel="intro"]')?.classList.contains('is-active'),
  }));

  await tapDock(page, '[data-action="map"]');
  await wait(500);
  const mapaShot = path.join(OUT, 'p11-844-mapa-closed.png');
  await page.screenshot({ path: mapaShot });
  const mapaDom = await page.evaluate(() => ({
    sheet: document.querySelector('.chrome')?.classList.contains('chrome--sheet'),
    layout: document.body.dataset.layout,
    dockVisible: !!document.querySelector('.chrome__dock')?.offsetParent,
  }));

  return { bundle, casesDom, logrosDom, mapaDom, shots: [casesShot, logrosShot, mapaShot] };
}

async function toast1280(page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}#in=bogus-place`, { waitUntil: 'networkidle', timeout: 120000 });
  await wait(1500);
  const toastShot = path.join(OUT, 'p11-1280-unknown-route-toast.png');
  await page.screenshot({ path: toastShot });
  const toastDom = await page.evaluate(() => {
    const el = document.getElementById('playtest-toast');
    if (!el) return { present: false };
    const style = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const visible =
      el.classList.contains('playtest-toast--visible') &&
      Number(style.opacity) > 0.5 &&
      r.width > 0 &&
      r.height > 0;
    return { present: true, visible, opacity: style.opacity, zIndex: style.zIndex, text: el.textContent };
  });
  return { toastDom, toastShot };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const landscape = await landscape844(page);
  const toast = await toast1280(await browser.newPage());
  await browser.close();

  const ok =
    landscape.casesDom.dockDisplay === 'flex' &&
    landscape.casesDom.panel === 'cases' &&
    landscape.casesDom.caseRowCount >= 5 &&
    landscape.logrosDom.panel === 'achievements' &&
    landscape.logrosDom.logroCount >= 3 &&
    landscape.mapaDom.sheet === false &&
    landscape.mapaDom.layout === 'map' &&
    toast.toastDom.visible === true;

  const report = {
    base: BASE,
    bundle: landscape.bundle,
    at: new Date().toISOString(),
    ok,
    landscape,
    toast,
  };
  fs.writeFileSync(path.join(OUT, 'forge-p11-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok, bundle: landscape.bundle }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
