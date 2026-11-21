/**
 * Forge QA p9 — pointer-events / hit-test on deployed preview-persona.
 * elementFromPoint + optional tap at control centers; fails if .persona-kit root steals hits.
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

const KIT_ALLOW =
  '.persona-kit__cam, .persona-kit__help, .persona-kit__lang, .persona-kit__overlay:not([hidden]), .persona-kit__overlay:not([hidden]) *, .persona-enter-prompt:not([hidden]), .persona-enter-prompt:not([hidden]) *, .persona-jac-board:not([hidden]) .persona-jac-board__btn, .persona-kit__cam-load:not([hidden])';

function probesForViewport(tag) {
  const common = [
    { id: 'canvas-center', sel: 'canvas' },
    { id: 'dock-cases', sel: '[data-dock="cases"]' },
    { id: 'dock-achievements', sel: '[data-dock="achievements"]' },
    { id: 'dock-contact', sel: '[data-dock="contact"]' },
    { id: 'dock-map', sel: '[data-dock="map"]' },
    { id: 'search', sel: '[data-action="search"]' },
    { id: 'sound', sel: '[data-action="sound"]' },
    { id: 'checklist-ring', sel: '.checklist__ring-btn' },
    { id: 'checklist-skip', sel: '.checklist__skip' },
    { id: 'cam-cenital', sel: '[data-cam="cenital"]' },
    { id: 'cam-persona', sel: '[data-cam="persona"]' },
    { id: 'help', sel: '[data-persona-help]' },
    { id: 'lang', sel: '[data-persona-lang]' },
  ];
  if (tag === '1280') {
    common.push(
      { id: 'locate', sel: '.chrome__locate, [data-action="center"]' },
      { id: 'rotate', sel: '[data-view="rotate"]' },
      { id: 'map-view', sel: '[data-view="map"]' },
      { id: 'cv-download', sel: '.chrome__ctas a.ui-btn--primary' },
      { id: 'panel-tab', sel: '[data-action="show-panel"]' },
    );
  }
  if (tag === '390') {
    common.push({ id: 'joystick', sel: '.joystick:not([hidden])' });
  }
  return common;
}

async function hitProbe(page, sel) {
  return page.evaluate(
    ({ sel, kitAllow }) => {
      const pick = (s) => {
        for (const part of s.split(',').map((x) => x.trim())) {
          const el = document.querySelector(part);
          if (el && !el.hidden && el.getBoundingClientRect().width > 2) return el;
        }
        return null;
      };
      const el = pick(sel);
      if (!el) return { skip: true, reason: 'missing' };
      const b = el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > window.innerHeight || b.right < 0 || b.left > window.innerWidth) {
        return { skip: true, reason: 'offscreen' };
      }
      const x = b.left + b.width / 2;
      const y = b.top + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) return { skip: false, pass: false, x, y, hit: null };
      const kitRoot = document.querySelector('.persona-kit');
      if (hit === kitRoot) return { skip: false, pass: false, x, y, hit: 'div.persona-kit' };
      if (hit.closest?.('.persona-kit') && !hit.closest(kitAllow)) {
        return { skip: false, pass: false, x, y, hit: hit.className || hit.tagName };
      }
      return { skip: false, pass: true, x, y, hit: hit.className || hit.tagName };
    },
    { sel, kitAllow: KIT_ALLOW },
  );
}

async function setupState(page, state) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setLayout('map');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(300);
  if (state === 'overlay') {
    await page.evaluate(() => {
      localStorage.removeItem('portfolio-persona-controls-v1');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__playtestQa?.setViewMode);
    await wait(400);
    return;
  }
  if (state === 'persona-idle') {
    await page.evaluate(() => window.__playtestQa.setViewMode('persona'));
    await wait(500);
    await page.evaluate(() => window.__playtestQa.flushPersonaView());
    return;
  }
  if (state === 'near-door') {
    await page.evaluate(() => {
      window.__playtestQa.setViewMode('persona');
      window.__playtestQa.setCharacterTile(30, 36);
      window.__playtestQa.flushPersonaView();
    });
    await wait(400);
    return;
  }
  if (state === 'near-van') {
    await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      window.__playtestQa.walkToBuilding?.('jac') ?? window.__playtestQa.focusJac?.();
    });
    await wait(1200);
    return;
  }
  if (state === 'driving') {
    await page.evaluate(async () => {
      window.__playtestQa.setViewMode('cenital');
      if (window.__playtestQa.focusJac) window.__playtestQa.focusJac();
    });
    await wait(800);
    await page.evaluate(() => window.__playtestQa.driveEnter?.('estudio')).catch(() => {});
    await wait(1500);
  }
}

async function tapProbe(page, sel) {
  const pt = await page.evaluate((s) => {
    for (const part of s.split(',').map((x) => x.trim())) {
      const el = document.querySelector(part);
      if (el && !el.hidden) {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, ok: true };
      }
    }
    return { ok: false };
  }, sel);
  if (!pt.ok) return { skip: true };
  await page.mouse.click(pt.x, pt.y);
  await wait(200);
  return { clicked: true, x: pt.x, y: pt.y };
}

async function main() {
  const browser = await launchBrowser(chromium);
  const viewports = [
    { tag: '390', width: 390, height: 844, touch: true },
    { tag: '844x390', width: 844, height: 390, touch: true },
    { tag: '1280', width: 1280, height: 800, touch: false },
  ];
  const states = ['fresh', 'overlay', 'persona-idle', 'near-door', 'near-van', 'driving'];
  let bundle = '';
  const rows = [];

  for (const vp of viewports) {
    for (const state of states) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.touch,
      });
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => window.__playtestQa?.setViewMode, null, { timeout: 90000 });
      bundle =
        (await page.evaluate(() =>
          [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
        ))?.split('/').pop() ?? bundle;

      await setupState(page, state);
      const probes = probesForViewport(vp.tag);
      for (const p of probes) {
        if (state === 'overlay' && p.id !== 'help' && !p.id.startsWith('cam-')) continue;
        const r = await hitProbe(page, p.sel);
        rows.push({ viewport: vp.tag, state, probe: p.id, ...r });
      }
      await ctx.close();
    }
  }

  await browser.close();
  const tested = rows.filter((r) => !r.skip);
  const report = {
    base: BASE,
    bundle,
    at: new Date().toISOString(),
    hitOk: tested.every((r) => r.pass),
    failCount: tested.filter((r) => !r.pass).length,
    rows,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'forge-p9-hit-test.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ bundle, hitOk: report.hitOk, failCount: report.failCount }, null, 2));
  if (!report.hitOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
