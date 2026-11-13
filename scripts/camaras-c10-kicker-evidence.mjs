/**
 * Forge c10 — camaras preview ES case sheet kicker (CASO).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
fs.mkdirSync(OUT, { recursive: true });
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.showCasePreview);
  await wait(2000);

  await page.evaluate(() => {
    document.querySelector('.chrome__lang-opt[data-lang="es"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(400);

  await page.evaluate(() => window.__playtestQa.showCasePreview('bain'));
  await wait(600);

  const data = await page.evaluate(() => {
    const bundle = [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop();
    const kicker = document.querySelector('.case-preview__kicker')?.textContent?.trim();
    return { bundle, kicker, lang: document.documentElement.lang };
  });

  const shot = path.join(OUT, 'c10-es-case-kicker.png');
  await page.screenshot({ path: shot });
  const report = { base: BASE, ...data, kickerOk: data.kicker === 'CASO', screenshot: path.basename(shot), at: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'forge-c10-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
