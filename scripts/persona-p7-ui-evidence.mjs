/**
 * p7 UI overlap: Entrar prompt vs chrome at 844×390 and 1280×800 on deployed preview-persona.
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

const VIEWPORTS = [
  { tag: '844x390', width: 844, height: 390, touch: true },
  { tag: '1280', width: 1280, height: 800, touch: false },
];

async function main() {
  const browser = await launchBrowser(chromium);
  const rows = [];
  let bundle = '';
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, {
      timeout: 90000,
    });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;
    await page.evaluate((touch) => {
      localStorage.setItem('portfolio-persona-controls-v1', '1');
      window.__playtestQa.setLayout(touch ? 'split' : 'map');
      window.__playtestQa.setViewMode('persona');
    }, vp.touch);
    await wait(600);
    const estudio = await page.evaluate(() =>
      window.__playtestQa.getEnterableBuildings().find((b) => b.name === 'estudio'),
    );
    if (estudio?.door) {
      await page.evaluate(({ door, inward }) => {
        window.__playtestQa.setCharacterTile(door.x - inward.x, door.y - inward.y);
        for (let deg = 0; deg < 360; deg += 5) {
          window.__playtestQa.setPersonaYawDeg(deg);
          if (window.__playtestQa.personaEnterOffer().show) return;
        }
      }, estudio);
      await wait(200);
    }
    const metrics = await page.evaluate(() => window.__playtestQa.personaScreenMetrics());
    const enterEl = await page.$('.persona-enter-prompt:not([hidden])');
    const overlaps = await page.evaluate(() => {
      const enter = document.querySelector('.persona-enter-prompt:not([hidden])');
      if (!enter) return { hasEnter: false, hits: [] };
      const er = enter.getBoundingClientRect();
      const blockers = [
        '.persona-kit__cam',
        '.persona-kit__help',
        '.persona-kit__lang',
        '.chrome__dock',
        '.chrome__title',
        '.persona-jac-board:not([hidden])',
      ];
      const hits = [];
      for (const sel of blockers) {
        const el = document.querySelector(sel);
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2) continue;
        const overlap =
          er.left < r.right && er.right > r.left && er.top < r.bottom && er.bottom > r.top;
        if (overlap) hits.push(sel);
      }
      return { hasEnter: true, hits };
    });
    await page.screenshot({ path: path.join(OUT, `p7-enter-overlap-${vp.tag}.png`) });
    rows.push({
      tag: vp.tag,
      bundle,
      enterOffer: await page.evaluate(() => window.__playtestQa.personaEnterOffer()),
      metrics,
      overlaps,
      pass: overlaps.hasEnter && overlaps.hits.length === 0,
    });
    await ctx.close();
  }
  await browser.close();
  const report = { base: BASE, bundle, rows, ok: rows.every((r) => r.pass) };
  fs.writeFileSync(path.join(OUT, 'p7-ui-overlap.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
