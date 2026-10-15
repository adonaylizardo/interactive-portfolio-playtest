import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForInterior(page) {
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => window.__playtestQa?.isInInterior?.() === true)) return true;
    await wait(250);
  }
  return false;
}

async function cdpClickBuildingDoor(page, name) {
  return page.evaluate(async (n) => window.__playtestQa?.tapBuildingDoor?.(n), name);
}

async function main() {
  const dir = path.join(root, 'artifacts', 'run31');
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch();
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const name of ['catedral', 'sambil', 'bain', 'flor']) {
    await desktop.goto(BASE, { waitUntil: 'networkidle' });
    await desktop.reload({ waitUntil: 'networkidle' });
    await wait(600);
    await desktop.evaluate((n) => window.__playtestQa?.enterInterior?.(n), name);
    await waitForInterior(desktop);
    await wait(600);
    await desktop.screenshot({ path: path.join(dir, `interior-${name}-desktop.png`) });
    await desktop.keyboard.press('Escape');
    await wait(700);
  }
  await desktop.goto(`${BASE}#view=x=1420&y=-1580&z=1.2`, { waitUntil: 'networkidle' });
  await wait(800);
  await desktop.screenshot({ path: path.join(dir, 'obelisco-z1.2.png') });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } });
  for (const [name, start] of [
    ['flor', [46, 37]],
    ['sambil', [39, 36]],
  ]) {
    await mobile.goto(BASE, { waitUntil: 'networkidle' });
    await mobile.reload({ waitUntil: 'networkidle' });
    await wait(600);
    await mobile.evaluate(([x, y]) => window.__playtestQa?.setCharacterTile?.(x, y), start);
    await wait(200);
    if (name === 'sambil') {
      await cdpClickBuildingDoor(mobile, name);
    } else {
      await mobile.evaluate(() => window.__playtestQa?.enterInterior?.('flor'));
    }
    await waitForInterior(mobile);
    await wait(600);
    if (name === 'flor') {
      await mobile.screenshot({ path: path.join(dir, 'interior-flor-375.png') });
    }
    if (name === 'sambil') {
      await mobile.screenshot({ path: path.join(dir, 'interior-sambil-fitted-375.png') });
    }
    await mobile.keyboard.press('Escape');
    await wait(900);
    await mobile.screenshot({ path: path.join(dir, `map-after-${name}-exit-375.png`) });
  }
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.reload({ waitUntil: 'networkidle' });
  await wait(600);
  await mobile.evaluate(() => window.__playtestQa?.setCharacterTile?.(39, 35));
  await cdpClickBuildingDoor(mobile, 'volaris');
  await waitForInterior(mobile);
  await mobile.keyboard.press('Escape');
  await wait(900);
  await mobile.screenshot({ path: path.join(dir, 'map-after-volaris-exit-375.png') });
  await mobile.close();
  await browser.close();
  console.log('Captured run31 screenshots in', dir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
