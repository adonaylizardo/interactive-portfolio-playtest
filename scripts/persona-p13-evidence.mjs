/**
 * Forge p13 — persona: 390 Tercera Contacto subtitle vs joystick + bundle hash.
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

function overlap(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => window.__playtestQa?.setViewMode);
  await wait(1500);

  await page.evaluate(() => {
    document.querySelector('[data-persona-close]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await wait(400);

  await page.evaluate(async () => {
    await window.__playtestQa.setViewMode('persona');
  });
  await wait(1200);

  await page.evaluate(() => {
    const btn = document.querySelector('.chrome__dock [data-action="contact"]');
    const r = btn.getBoundingClientRect();
    btn.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }),
    );
  });
  await wait(800);

  const metrics = await page.evaluate(() => {
    const sub = document.querySelector('.chrome__subtitle');
    const joy = document.querySelector('.joystick:not([hidden])');
    const sr = sub?.getBoundingClientRect();
    const jr = joy?.getBoundingClientRect();
    const bundle = [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s))?.split('/').pop();
    return {
      bundle,
      subtitle: sr ? { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom, text: sub.textContent?.slice(0, 80) } : null,
      joystick: jr ? { left: jr.left, top: jr.top, right: jr.right, bottom: jr.bottom } : null,
      view: document.body.dataset.view,
    };
  });

  let overlapPx = 0;
  if (metrics.subtitle && metrics.joystick) {
    overlapPx = overlap(metrics.subtitle, metrics.joystick);
  }

  const shot = path.join(OUT, 'p13-390-tercera-contacto.png');
  await page.screenshot({ path: shot });

  const report = {
    base: BASE,
    bundle: metrics.bundle,
    overlapPx2: overlapPx,
    subtitleClear: overlapPx === 0,
    metrics,
    screenshot: path.basename(shot),
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'forge-p13-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
