/**
 * Forge QA p8 — W/S screen motion vs camera forward, persona switch render probe, UI overlaps.
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

function angDelta(a, b) {
  let d = Math.abs(((a - b + 540) % 360) - 180);
  return d;
}

function overlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function measureWalk(page, yawDeg, key) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setLayout('map');
    window.__playtestQa.setViewMode('persona');
    window.__playtestQa.clearInput?.();
  });
  await page.evaluate((d) => window.__playtestQa.setPersonaYawDeg(d), yawDeg);
  await wait(200);
  await page.evaluate(() => window.__playtestQa.flushPersonaView());
  await wait(100);
  const expected = await page.evaluate(() => window.__playtestQa.personaScreenForwardDeg());
  const before = await page.evaluate(() => window.__playtestQa.personaClientChar());
  await page.keyboard.down(key);
  await wait(900);
  await page.keyboard.up(key);
  await wait(150);
  const after = await page.evaluate(() => window.__playtestQa.personaClientChar());
  const motionDeg =
    ((Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI + 360) % 360;
  const delta = angDelta(motionDeg, expected);
  return { yawDeg, key, expected, motionDeg, deltaDeg: delta, pass: delta < 18, before, after };
}

async function personaSwitchProbe(page, vp) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(400);
  const cen = page.locator('[data-cam="persona"]');
  await cen.click();
  await wait(600);
  const probe = await page.evaluate(() => window.__playtestQa.personaRenderProbe());
  const shot = path.join(OUT, `p8-persona-switch-${vp.tag}.png`);
  await page.screenshot({ path: shot });
  const colors = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const mid = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.35), 1, 1).data;
    const top = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.08), 1, 1).data;
    return { mid: [...mid], top: [...top] };
  });
  const ok =
    probe.viewMode === 'persona' &&
    !probe.worldVisible &&
    !probe.tilesVisible &&
    probe.personaLayerVisible &&
    !probe.cenitalVanVisible &&
    !probe.altLayerVisible &&
    probe.adonayVisible;
  return { ...probe, colors, ok, screenshot: path.basename(shot) };
}

async function uiOverlaps(page, vp) {
  await page.evaluate(() => {
    localStorage.setItem('portfolio-persona-controls-v1', '1');
    window.__playtestQa.setViewMode('cenital');
  });
  await wait(300);
  const rects = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return null;
      const b = el.getBoundingClientRect();
      if (b.width < 2) return null;
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, w: b.width, h: b.height };
    };
    return {
      cam: r('.persona-kit__cam'),
      locate: r('.chrome__locate'),
      sound: r('.chrome__tools-stack [data-action="sound"], .chrome__tools-phone [data-action="sound"]'),
      ring: r('.checklist__ring-btn'),
      lang: r('.persona-kit__lang'),
      help: r('.persona-kit__help'),
      checklist: r('.checklist__header'),
    };
  });
  const rows = [];
  if (rects.locate && rects.cam) {
    rows.push({
      id: 'locate-vs-cam',
      pass: !overlap(rects.locate, rects.cam),
      locate: rects.locate,
      cam: rects.cam,
    });
  }
  if (rects.sound && rects.ring) {
    rows.push({
      id: 'sound-vs-ring',
      pass: !overlap(rects.sound, rects.ring),
      sound: rects.sound,
      ring: rects.ring,
    });
  }
  await page.evaluate(() => localStorage.removeItem('portfolio-persona-controls-v1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__playtestQa?.setViewMode);
  await wait(400);
  const overlayRects = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el || el.hidden) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    };
    return {
      lang: r('.persona-kit__lang'),
      help: r('.persona-kit__help'),
      checklist: r('.checklist__header'),
      overlay: r('.persona-kit__card'),
    };
  });
  if (overlayRects.lang && overlayRects.checklist) {
    rows.push({
      id: 'overlay-lang-vs-checklist',
      pass: !overlap(overlayRects.lang, overlayRects.checklist),
      ...overlayRects,
    });
  }
  if (overlayRects.help && overlayRects.checklist) {
    rows.push({
      id: 'overlay-help-vs-checklist',
      pass: !overlap(overlayRects.help, overlayRects.checklist),
      help: overlayRects.help,
      checklist: overlayRects.checklist,
    });
  }
  return rows;
}

async function main() {
  const browser = await launchBrowser(chromium);
  const viewports = [
    { tag: '390', width: 390, height: 844, touch: true },
    { tag: '844x390', width: 844, height: 390, touch: true },
    { tag: '1280', width: 1280, height: 800, touch: false },
  ];
  let bundle = '';
  const walk = [];
  const switches = [];
  const overlaps = [];

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 90000 });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? bundle;

    if (vp.tag === '390' || vp.tag === '1280') {
      for (const yawDeg of [0, 90, 180, 270, 30]) {
        walk.push({ viewport: vp.tag, ...(await measureWalk(page, yawDeg, 'w')) });
      }
      walk.push({ viewport: vp.tag, ...(await measureWalk(page, 0, 's')) });
    }
    switches.push({ viewport: vp.tag, ...(await personaSwitchProbe(page, vp)) });
    overlaps.push({ viewport: vp.tag, rows: await uiOverlaps(page, vp) });
    await ctx.close();
  }
  await browser.close();

  const report = {
    base: BASE,
    bundle,
    at: new Date().toISOString(),
    walk,
    walkOk: walk.every((r) => r.pass),
    switches,
    switchOk: switches.every((s) => s.ok),
    overlaps,
    overlapOk: overlaps.every((o) => o.rows.every((r) => r.pass)),
  };
  fs.writeFileSync(path.join(OUT, 'forge-p8-evidence.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
