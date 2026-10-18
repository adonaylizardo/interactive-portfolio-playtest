#!/usr/bin/env node
/** 1280 one-click Estudio after board + Volaris close, real mouse only. */
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const BASE = process.env.QA_BASE_URL ?? 'http://127.0.0.1:4303/interactive-portfolio-playtest/preview/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const GL_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--disable-gpu-rasterization',
  '--use-angle=swiftshader',
  '--max-active-webgl-contexts=1',
  '--force-device-scale-factor=1',
];

const browser = await launchBrowser(chromium, { args: GL_ARGS, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
});
const page = await ctx.newPage();
const url = BASE.includes('npcs=') ? BASE : `${BASE}${BASE.includes('?') ? '&' : '?'}npcs=0`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 80; i++) {
  if (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) break;
  await wait(150);
}
await page.evaluate(() => {
  window.__playtestQa.setLayout?.('map');
  window.__playtestQa.setNpcs?.(false);
  window.__playtestQa.setLang?.('es');
});

const snap = () =>
  page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const r = window.__playtestQa.inputReady();
    return {
      driving: j.driving,
      cx: j.cx,
      cy: j.cy,
      goal: j.driveGoal,
      mph: j.mph,
      pending: r.pendingDrive,
      interior: r.interior,
      panel: window.__playtestQa.openPanelTitle?.() ?? '',
      preview: !!window.__playtestQa.isCasePreview?.(),
      accepts: window.__playtestQa.pointerDriveAccepts?.() ?? 0,
      zoom: window.__playtestQa.getZoom?.() ?? 0,
      follow: document.getElementById('game-canvas')?.dataset.follow ?? '',
    };
  });

async function board() {
  for (let i = 0; i < 8; i++) {
    if ((await snap()).driving) return true;
    await page.evaluate(() => {
      window.__playtestQa.dismissBuildingPanel?.();
      window.__playtestQa.focusJac?.();
      window.__playtestQa.setZoom?.(0.45);
    });
    await wait(160);
    const pt = await page.evaluate(() => {
      const e = window.__playtestQa.jacEntities();
      return window.__playtestQa.worldToClient(e.worldX, e.worldY);
    });
    if (pt) await page.mouse.click(pt.x, pt.y);
    for (let w = 0; w < 50; w++) {
      if ((await snap()).driving) return true;
      await wait(80);
    }
  }
  return false;
}

const boarded = await board();
const afterBoard = await snap();
await page.evaluate(() => window.__playtestQa.frameDoorForQa?.('estudio'));
await wait(240);
const door = await page.evaluate(() => window.__playtestQa.doorScreenPoint?.('estudio'));
const pick = door ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), door) : null;
const accepts0 = afterBoard.accepts;
await page.mouse.click(door.x, door.y);
await wait(200);
const afterClick = await snap();
const firstClick = {
  boarded,
  afterBoard,
  door,
  pick,
  accepts0,
  afterClick,
  accepted: afterClick.accepts > accepts0 || !!afterClick.pending || !!afterClick.goal,
};

// Drive to Volaris if first click worked, else tap Volaris
if (firstClick.accepted) {
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const s = await snap();
    if (!s.driving && (s.interior || s.preview || s.panel)) break;
    await wait(80);
  }
}
const atEstudio = await snap();
if (atEstudio.interior || atEstudio.preview || atEstudio.panel) {
  const box = await page.evaluate(() => {
    const el = document.querySelector('.building-panel__exit, [data-exit]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 8) return null;
    const st = getComputedStyle(el);
    if (st.display === 'none') return { hidden: true, w: r.width };
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, hidden: false };
  });
  if (box && !box.hidden) await page.mouse.click(box.x, box.y);
  else {
    const visible = await page.evaluate(() => {
      const el = document.querySelector('.case-preview__salir, .case-preview__x, .building-panel__exit');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 8 || st.display === 'none') return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (visible) await page.mouse.click(visible.x, visible.y);
  }
  await wait(400);
}
await board();
await page.evaluate(() => window.__playtestQa.frameDoorForQa?.('volaris'));
await wait(220);
const vdoor = await page.evaluate(() => window.__playtestQa.doorScreenPoint?.('volaris'));
if (vdoor) await page.mouse.click(vdoor.x, vdoor.y);
const t1 = Date.now();
let vol = null;
while (Date.now() - t1 < 45000) {
  vol = await snap();
  if (!vol.driving && (vol.preview || vol.panel || vol.interior)) break;
  await wait(80);
}
const closeTargets = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-exit], [data-close], .case-preview__x, .case-preview__salir')].map((el) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return {
      cls: el.className,
      w: r.width,
      h: r.height,
      display: st.display,
      hidden: el.hidden,
      vis: st.visibility,
    };
  });
});
const salir = await page.evaluate(() => {
  const el = document.querySelector('.case-preview__salir');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
});
const salirLoc = page.locator('.case-preview__salir');
if (await salirLoc.isVisible().catch(() => false)) {
  await salirLoc.click({ timeout: 2000 });
} else if (salir) {
  await page.mouse.click(salir.x, salir.y);
}
await wait(350);
const afterSalir = await snap();
let afterBack = afterSalir;
if (afterSalir.preview) {
  await page.goBack();
  await wait(300);
  afterBack = await snap();
}
const xbtn = await page.evaluate(() => {
  const el = document.querySelector('.case-preview__x');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
});
if (afterBack.preview && xbtn) {
  await page.mouse.click(xbtn.x, xbtn.y);
  await wait(300);
}
const afterClose = await snap();
const reboard = await board();
const afterReboard = await snap();

console.log(
  JSON.stringify(
    {
      firstClick,
      atEstudio,
      vol,
      closeTargets,
      afterSalir,
      afterClose,
      reboard,
      afterReboard,
    },
    null,
    2,
  ),
);
await browser.close();
if (!firstClick.accepted || afterClose.preview || !reboard) process.exitCode = 1;
