/**
 * Forge p14 persona evidence (844 sheet scroll, 844 Tercera subtitle, 1280 toast, 390 subtitle).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona');
fs.mkdirSync(OUT, { recursive: true });
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bundleHash(page) {
  return page.evaluate(() =>
    [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop(),
  );
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.setViewMode);
  await wait(1500);
  await page.evaluate(() => document.querySelector('[data-persona-close]')?.click());
  await wait(400);

  await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
  await wait(800);
  await page.evaluate(() => {
    document.querySelector('.chrome__dock [data-dock="intro"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(600);

  const scrollMetrics = await page.evaluate(() => {
    const panel = document.querySelector('.chrome__sheet-panel[data-intro]');
    const stack = document.querySelector('.chrome__sheet-stack');
    const pe = stack ? getComputedStyle(stack).pointerEvents : '';
    const oy = panel ? getComputedStyle(panel).overflowY : '';
    if (panel) panel.scrollTop = panel.scrollHeight;
    const details = document.querySelector('[data-details]');
    const dr = details?.getBoundingClientRect();
    const dock = document.querySelector('.chrome__dock')?.getBoundingClientRect();
    return {
      pointerEvents: pe,
      overflowY: oy,
      detailsTop: dr?.top,
      dockTop: dock?.top,
      scrollTop: panel?.scrollTop,
    };
  });
  await wait(300);
  await page.screenshot({ path: path.join(OUT, 'p14-844-intro-scroll-detalles.png') });

  await page.evaluate(() => {
    document.querySelector('.persona-kit__cam-opt[data-cam="persona"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForFunction(() => document.body.dataset.view === 'persona', null, { timeout: 20000 });
  await wait(500);
  await page.evaluate(() => {
    document.querySelector('.chrome__dock [data-action="contact"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(1200);
  const sub844 = await page.evaluate(() => {
    const sub = document.querySelector('.chrome__subtitle');
    const r = sub?.getBoundingClientRect();
    const cs = sub ? getComputedStyle(sub) : null;
    return { text: sub?.textContent?.slice(0, 60), display: cs?.display, visibility: cs?.visibility, rect: r };
  });
  await page.screenshot({ path: path.join(OUT, 'p14-844-tercera-subtitle.png') });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(2500);
  const toastBox = await page.evaluate(() => {
    const toast = document.getElementById('playtest-toast');
    const cam = document.querySelector('.persona-kit__cam');
    const tr = toast?.getBoundingClientRect();
    const cr = cam?.getBoundingClientRect();
    const pe = toast ? getComputedStyle(toast).pointerEvents : '';
    let overlap = 0;
    if (tr && cr) {
      const x = Math.max(0, Math.min(tr.right, cr.right) - Math.max(tr.left, cr.left));
      const y = Math.max(0, Math.min(tr.bottom, cr.bottom) - Math.max(tr.top, cr.top));
      overlap = x * y;
    }
    return { overlap, pointerEvents: pe, toastVisible: toast?.classList.contains('playtest-toast--visible') };
  });
  await page.screenshot({ path: path.join(OUT, 'p14-1280-toast-vs-cam.png') });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload({ waitUntil: 'networkidle' });
  await wait(1500);
  await page.evaluate(() => document.querySelector('[data-persona-close]')?.click());
  await page.evaluate(() => document.querySelector('.persona-kit__cam-opt[data-cam="persona"]')?.click());
  await page.waitForFunction(() => document.body.dataset.view === 'persona');
  await wait(800);
  await page.evaluate(() => document.querySelector('.chrome__dock [data-action="contact"]')?.click());
  await wait(1000);
  await page.screenshot({ path: path.join(OUT, 'p14-390-subtitle-vs-character.png') });

  const bundle = await bundleHash(page);
  const report = {
    base: BASE,
    bundle,
    scrollMetrics,
    sub844,
    toastBox,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'forge-p14-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
