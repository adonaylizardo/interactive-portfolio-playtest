/**
 * Forge c12 — Estudio ES headers, lang over panel, 390 Estudio door after zoom-out taps.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
fs.mkdirSync(OUT, { recursive: true });
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  const pageDesk = await browser.newPage();
  pageDesk.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await pageDesk.setViewportSize({ width: 1280, height: 800 });
  await pageDesk.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await pageDesk.waitForFunction(() => window.__playtestQa?.showBuildingPeek);
  await wait(1500);

  await pageDesk.evaluate(() => {
    document.querySelector('.chrome__lang-opt[data-lang="es"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(300);
  await pageDesk.evaluate(() => window.__playtestQa.showBuildingPeek('estudio', 'Estudio'));
  await wait(500);
  const esPanel = await pageDesk.evaluate(() => ({
    bundle: [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    workedWith: document.querySelector('#worked-with-title')?.textContent?.trim(),
    aboutMe: document.querySelector('#about-title')?.textContent?.trim(),
    langZ: getComputedStyle(document.querySelector('.chrome__lang')).zIndex,
    langRect: document.querySelector('.chrome__lang')?.getBoundingClientRect(),
  }));

  const phone = devices['iPhone 12 Pro'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const pageMob = await ctx.newPage();
  pageMob.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await pageMob.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await pageMob.waitForFunction(() => window.__playtestQa?.setZoomLevel);
  await wait(2000);
  for (let i = 0; i < 7; i++) {
    await pageMob.evaluate(() => {
      const z = window.__playtestQa.getZoom();
      window.__playtestQa.setZoomLevel(z * 0.82, { x: 195, y: 422 });
    });
    await wait(120);
  }
  await wait(400);
  const door = await pageMob.evaluate(() => {
    const pt = window.__playtestQa.doorScreenPoint('estudio');
    const rect = document.getElementById('game-canvas')?.getBoundingClientRect();
    if (!pt || !rect) return { ok: false };
    const pad = 36;
    return {
      ok:
        pt.x >= rect.left + pad &&
        pt.x <= rect.right - pad &&
        pt.y >= rect.top + pad &&
        pt.y <= rect.bottom - pad,
      pt,
      zoom: window.__playtestQa.getZoom(),
    };
  });

  await browser.close();
  const report = {
    base: BASE,
    esPanel,
    estudioDoor390After7ZoomOut: door,
    consoleErrors: errors,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'forge-c12-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(2);
  if (!door.ok) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
