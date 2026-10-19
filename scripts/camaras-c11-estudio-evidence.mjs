/**
 * Forge c11 — Estudio map peek (ES/EN) + jac sprite HEAD check.
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
  const spriteUrl = `${BASE}sprites/v3/jac-t9-v3__hoja_se@2x.png`;
  const heads = await Promise.all(
    [1, 2, 3, 4, 5, 6].map(() =>
      fetch(spriteUrl, { method: 'HEAD' }).then((r) => r.status).catch(() => 0),
    ),
  );

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.showCasePreview);
  await wait(2000);

  for (const lang of ['es', 'en']) {
    await page.evaluate((l) => {
      document.querySelector(`.chrome__lang-opt[data-lang="${l}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, lang);
    await wait(400);
    await page.evaluate(() => window.__playtestQa.showBuildingPeek?.('estudio', 'Estudio') ?? window.__playtestQa.showCasePreview('estudio'));
    await wait(600);
    const dom = await page.evaluate(() => ({
      bundle: [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
      kicker: document.querySelector('.case-preview__kicker')?.textContent?.trim(),
      previewHidden: document.querySelector('[data-preview]')?.hidden,
      title: document.querySelector('.building-panel__title')?.textContent?.trim(),
      casePreviewTitle: document.querySelector('.case-preview__title')?.textContent?.trim(),
      lang: document.documentElement.lang,
    }));
    await page.screenshot({ path: path.join(OUT, `c11-estudio-${lang}.png`) });
    fs.writeFileSync(
      path.join(OUT, `c11-estudio-${lang}.json`),
      JSON.stringify(dom, null, 2),
    );
  }

  await browser.close();
  const report = {
    base: BASE,
    spriteUrl,
    spriteHeadStatuses: heads,
    spriteOk: heads.every((s) => s === 200),
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'forge-c11-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
