/**
 * Forge p9 — persona switch facade / presentation screenshots (+0.3s, +1s, +4s).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function captureSwitch(page, vp) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(400);
  const t0 = Date.now();
  await page.locator('[data-cam="persona"]').click();
  const shots = [];
  for (const delay of [300, 1000, 4000]) {
    const elapsed = Date.now() - t0;
    if (elapsed < delay) await wait(delay - elapsed);
    const probe = await page.evaluate(() => window.__playtestQa.personaRenderProbe());
    const file = `p9-persona-switch-${vp.tag}-${delay}ms.png`;
    await page.screenshot({ path: path.join(OUT, file) });
    shots.push({ delayMs: delay, file, probe });
  }
  return shots;
}

async function main() {
  const browser = await launchBrowser(chromium);
  const viewports = [
    { tag: '390', width: 390, height: 844 },
    { tag: '844x390', width: 844, height: 390 },
    { tag: '1280', width: 1280, height: 800 },
  ];
  let bundle = '';
  const all = [];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__playtestQa?.setViewMode);
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;
    all.push({ viewport: vp.tag, shots: await captureSwitch(page, vp) });
    await page.close();
  }
  await browser.close();
  const ok = all.every((v) =>
    v.shots.every(
      (s) =>
        s.delayMs < 1000 ||
        (s.probe.presentationReady && s.probe.adonayVisible && !s.probe.facade?.oversized),
    ),
  );
  const report = { base: BASE, bundle, at: new Date().toISOString(), ok, viewports: all };
  fs.writeFileSync(path.join(OUT, 'forge-p9-facade-switch.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ bundle, ok }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
