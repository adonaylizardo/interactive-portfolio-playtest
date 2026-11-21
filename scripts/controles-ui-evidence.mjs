/**
 * Controls UI gate — 6 states × 3 viewports vs docs/ref/controles-ui (chrome crops only).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import {
  chromeStackFromShot,
  collectChromeBoxes,
  diffNotes,
  refChromeStack,
  sideBySidePng,
} from './ui-chrome-crop.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(ROOT, 'docs', 'ref', 'controles-ui');
const OUT = path.join(ROOT, 'artifacts', 'preview-persona', 'controles-ui');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-persona/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const STATES = [
  { id: '1-controles-primera-visita', refSuffix: '1-controles-primera-visita' },
  { id: '2-aviso-puerta', refSuffix: '2-aviso-puerta' },
  { id: '3a-t9-subir', refSuffix: '3a-t9-subir' },
  { id: '3b-t9-conduciendo-bajar', refSuffix: '3b-t9-conduciendo-bajar' },
  { id: '4a-camara-cenital', refSuffix: '4a-camara-cenital' },
  { id: '4b-camara-tercera-persona', refSuffix: '4b-camara-tercera-persona' },
];

const VIEWPORTS = [
  { tag: 'telefono-vertical', w: 390, h: 844, touch: true },
  { tag: 'telefono-horizontal', w: 844, h: 390, touch: true },
  { tag: 'desktop', w: 1440, h: 900, touch: false },
];

const BASE_CHROME = ['.persona-kit__cam', '.persona-kit__lang', '.persona-kit__help'];

function chromeSelectors(stateId) {
  switch (stateId) {
    case '1-controles-primera-visita':
      return [...BASE_CHROME, '.persona-kit__card'];
    case '2-aviso-puerta':
      return [...BASE_CHROME, '.persona-enter-prompt:not([hidden])'];
    case '3a-t9-subir':
    case '3b-t9-conduciendo-bajar':
      return [...BASE_CHROME, '.persona-jac-board:not([hidden])'];
    default:
      return BASE_CHROME;
  }
}

function refPath(vpTag, suffix) {
  return path.join(REF, `${vpTag}_${suffix}@2x.png`);
}

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function tapCenter(page, cdp, touch, sel) {
  const el = page.locator(sel).first();
  if (!(await el.isVisible().catch(() => false))) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  if (touch) await cdpTouch(cdp, x, y);
  else await page.mouse.click(x, y);
  await wait(350);
  return true;
}

async function hitTestControls(page) {
  return page.evaluate(() => {
    const sel = [
      '.persona-kit__cam-opt[data-cam="cenital"]',
      '.persona-kit__cam-opt[data-cam="persona"]',
      '.persona-kit__lang',
      '.persona-kit__help',
    ];
    const joy = document.querySelector('.joystick');
    const joyBox = joy && !joy.hidden ? joy.getBoundingClientRect() : null;
    const out = [];
    for (const s of sel) {
      const el = document.querySelector(s);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const hit = top === el || el.contains(top);
      let overlapsJoy = false;
      if (joyBox) {
        overlapsJoy =
          r.left < joyBox.right &&
          r.right > joyBox.left &&
          r.top < joyBox.bottom &&
          r.bottom > joyBox.top;
      }
      out.push({ sel: s, w: Math.round(r.width), h: Math.round(r.height), hit, overlapsJoy });
    }
    return { controls: out };
  });
}

async function prepareBase(page) {
  await page.evaluate(() => {
    localStorage.removeItem('portfolio-persona-controls-v1');
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.setViewMode?.('cenital');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 60000 });
  await wait(500);
}

async function closeOverlay(page, cdp, touch) {
  await tapCenter(page, cdp, touch, '.persona-kit__primary, .persona-kit__close');
  await wait(300);
}

async function reachDoorOffer(page) {
  await page.evaluate(() => window.__playtestQa.frameDoorForQa('estudio'));
  await wait(800);
}

async function reachJacBoard(page) {
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(Math.round(door.x), Math.round(door.y));
  });
  await wait(800);
  await page
    .waitForFunction(() => window.__playtestQa.personaState().jacBoard, null, { timeout: 20000 })
    .catch(() => null);
}

async function enterDrive(page, cdp, touch) {
  const tapped = await tapCenter(page, cdp, touch, '[data-persona-jac="in"]');
  if (!tapped) await page.keyboard.press('e');
  await wait(900);
  return page.evaluate(() => Boolean(window.__playtestQa.jac()?.driving));
}

async function captureState(page, cdp, touch, stateId) {
  switch (stateId) {
    case '1-controles-primera-visita':
      break;
    case '2-aviso-puerta':
      await closeOverlay(page, cdp, touch);
      await reachDoorOffer(page);
      break;
    case '3a-t9-subir':
      await closeOverlay(page, cdp, touch);
      await reachJacBoard(page);
      break;
    case '3b-t9-conduciendo-bajar':
      await closeOverlay(page, cdp, touch);
      await reachJacBoard(page);
      await enterDrive(page, cdp, touch);
      break;
    case '4a-camara-cenital':
      await closeOverlay(page, cdp, touch);
      await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
      await wait(400);
      break;
    case '4b-camara-tercera-persona':
      await closeOverlay(page, cdp, touch);
      await tapCenter(page, cdp, touch, '[data-cam="persona"]');
      await wait(600);
      break;
    default:
      break;
  }
}

async function runViewport(vp) {
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.touch,
    isMobile: vp.touch,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const rows = [];
  let bundle = '';

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__playtestQa?.setViewMode), null, { timeout: 60000 });
    bundle =
      (await page.evaluate(() =>
        [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
      ))?.split('/').pop() ?? 'dev';

    for (const st of STATES) {
      await prepareBase(page);
      await captureState(page, cdp, vp.touch, st.id);
      const fullShot = path.join(OUT, `${vp.tag}_${st.id}_full.png`);
      await page.screenshot({ path: fullShot });
      const sels = chromeSelectors(st.id);
      const boxes = await collectChromeBoxes(page, sels);
      if (!boxes.length) throw new Error(`${vp.tag}/${st.id}: no chrome boxes`);
      const stacked = chromeStackFromShot(fullShot, boxes);
      const shot = path.join(OUT, `${vp.tag}_${st.id}_chrome.png`);
      fs.writeFileSync(shot, PNG.sync.write(stacked));
      const ref = refPath(vp.tag, st.refSuffix);
      const refStackPath = path.join(OUT, `${vp.tag}_${st.id}_ref-chrome.png`);
      const refStack = refChromeStack(ref, { width: vp.w, height: vp.h }, boxes);
      let cmpRef = ref;
      if (refStack) {
        fs.writeFileSync(refStackPath, PNG.sync.write(refStack));
        cmpRef = refStackPath;
      }
      const cmp = path.join(OUT, `${vp.tag}_${st.id}-vs-ref_chrome.png`);
      const { refMissing, diffPct } = sideBySidePng(stacked, cmpRef, cmp);
      const hits = await hitTestControls(page);
      rows.push({
        viewport: vp.tag,
        state: st.id,
        ref: path.basename(ref),
        refMissing,
        diffPct: diffPct != null ? Number(diffPct.toFixed(2)) : null,
        diffNotes: diffNotes(diffPct),
        chromeBoxes: boxes.map(({ sel, x, y, width, height }) => ({
          sel,
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(width),
          h: Math.round(height),
        })),
        hitTests: hits,
        screenshot: path.basename(shot),
        compare: path.basename(cmp),
        fullFrame: path.basename(fullShot),
      });
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  return { viewport: vp.tag, bundle, rows };
}

const report = {
  base: BASE,
  at: new Date().toISOString(),
  compareMode: 'chrome-stack',
  viewports: [],
};
for (const vp of VIEWPORTS) {
  report.viewports.push(await runViewport(vp));
}
const allRows = report.viewports.flatMap((v) => v.rows.map((r) => ({ ...r, bundle: v.bundle })));
report.summary = {
  bundle: report.viewports[0]?.bundle,
  maxDiffPct: Math.max(...allRows.map((r) => r.diffPct ?? 0)),
  meanDiffPct: Number(
    (allRows.reduce((s, r) => s + (r.diffPct ?? 0), 0) / allRows.length).toFixed(2),
  ),
  passChrome4pct: allRows.every((r) => r.refMissing || (r.diffPct ?? 99) <= 4),
};
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
