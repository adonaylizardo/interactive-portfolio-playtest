/**
 * Forge p10 — phone landscape dock taps (844×390).
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

const DOCK_ACTIONS = [
  { sel: '[data-dock="intro"]', label: 'AL', expectSheet: true },
  { sel: '[data-action="cases"]', label: 'Casos', expectSheet: true },
  { sel: '[data-action="achievements"]', label: 'Logros', expectSheet: true },
  { sel: '[data-action="contact"]', label: 'Contacto', expectSheet: false },
  { sel: '[data-action="map"]', label: 'Mapa', expectSheet: false },
];

async function tapDock(page, spec) {
  const before = await page.evaluate(() => ({
    sheet: document.querySelector('.chrome')?.classList.contains('chrome--sheet'),
    dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
  }));
  const clicked = await page.evaluate((sel) => {
    const btn = document.querySelector(`.chrome__dock ${sel}`);
    if (!btn) return { ok: false, reason: 'missing' };
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    return {
      ok: true,
      hit: top === btn || btn.contains(top),
      x,
      y,
    };
  }, spec.sel);
  await wait(450);
  const after = await page.evaluate(() => ({
    sheet: document.querySelector('.chrome')?.classList.contains('chrome--sheet'),
    dock: document.querySelector('.chrome')?.classList.contains('chrome--dock'),
    layout: document.body.dataset.layout,
  }));
  return { label: spec.label, clicked, before, after, expectSheet: spec.expectSheet };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.__playtestQa?.setViewMode);
  await wait(3000);
  const bundle = await page.evaluate(() =>
    [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
  );
  const results = [];
  for (const spec of DOCK_ACTIONS) {
    results.push(await tapDock(page, spec));
    if (spec.expectSheet) {
      await page.evaluate(() => window.__playtestQa?.setLayout?.('map'));
      await wait(300);
    }
  }
  await browser.close();
  const ok = results.every((r) => {
    if (!r.clicked.ok) return false;
    if (r.expectSheet) return r.after.sheet;
    return true;
  });
  const report = { base: BASE, bundle, at: new Date().toISOString(), results, ok };
  fs.writeFileSync(path.join(OUT, 'forge-p10-dock-844.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ bundle, ok, results }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
