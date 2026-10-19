/**
 * Forge p15 — Detalles expand, bogus-hash toast placement (1280), subtitle vs sprite (390).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
fs.mkdirSync(OUT, { recursive: true });
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch();
  const errors = [];

  const phone = devices['iPhone 12 Pro'];
  const ctx = await browser.newContext({ ...phone, viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await wait(2500);

  const intro = page.locator('[data-sheet-panel="intro"]');
  await intro.locator('[data-details]').tap();
  await wait(300);
  const detalles = await page.evaluate(() => {
    const panel = document.querySelector('[data-sheet-panel="intro"]');
    const card = panel?.querySelector('.chrome__card-id');
    return {
      expanded: panel?.classList.contains('chrome__intro--expanded'),
      cardDisplay: card ? getComputedStyle(card).display : null,
      cardHeight: card?.getBoundingClientRect().height ?? 0,
    };
  });

  const desk = await browser.newPage();
  desk.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await desk.setViewportSize({ width: 1280, height: 800 });
  await desk.goto(`${BASE}#/caso/nope`, { waitUntil: 'networkidle', timeout: 120000 });
  await wait(800);
  const toast = await desk.evaluate(() => {
    const el = document.querySelector('.toast');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const rail = document.querySelector('.chrome__rail')?.getBoundingClientRect();
    let overlapRail = 0;
    if (rail) {
      const w = Math.max(0, Math.min(r.right, rail.right) - Math.max(r.left, rail.left));
      const h = Math.max(0, Math.min(r.bottom, rail.bottom) - Math.max(r.top, rail.top));
      overlapRail = w * h;
    }
    return {
      found: true,
      left: r.left,
      top: r.top,
      bottom: r.bottom,
      overlapRail,
      bundle: [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
    };
  });

  await browser.close();
  const report = {
    base: BASE,
    detalles390: detalles,
    toast1280FreshBogusHash: toast,
    consoleErrors: errors,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'forge-p15-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exit(2);
  if (!detalles.expanded || detalles.cardDisplay === 'none') process.exit(3);
  if (toast.found && (toast.left < 100 || toast.overlapRail > 500)) process.exit(4);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
