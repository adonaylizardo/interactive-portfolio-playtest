/**
 * Camaras acceptance extras: 844×390 overview ≥85%, 5/5 door-tap-while-driving.
 * Runs verify-preview-camaras logic inline + door tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'preview-camaras');
const BASE =
  process.argv[2] ??
  'https://adonaylizardo.github.io/interactive-portfolio-playtest/preview-camaras/';
const EXPECT_BUNDLE = process.argv[3] ?? 'index-BdWCf4Jg.js';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function cdpTouch(cdp, x, y) {
  const pt = [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await wait(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function boot(page, touch, cdp) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, { timeout: 90000 });
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('split');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
  });
  await wait(400);
  const bundle =
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    ))?.split('/').pop() ?? '';
  return bundle;
}

async function startDriving(page, cdp, touch) {
  await page.evaluate(() => {
    window.__playtestQa.setViewMode('cenital');
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.focusJac?.();
  });
  await wait(400);
  const canvasTap = await page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    if (!Number.isFinite(e?.sx) || !Number.isFinite(e?.sy)) return null;
    return { x: e.sx, y: e.sy };
  });
  if (!canvasTap) return false;
  const canvas = page.locator('#game-canvas');
  const rect = await canvas.boundingBox();
  if (!rect) return false;
  if (touch) await cdpTouch(cdp, rect.x + canvasTap.x, rect.y + canvasTap.y);
  else await canvas.click({ position: { x: canvasTap.x, y: canvasTap.y } });
  await wait(1000);
  await page.evaluate(() => window.__playtestQa.jacSetGear('D'));
  return page.evaluate(() => window.__playtestQa.jac()?.driving);
}

async function doorTapWhileDrivingOnce(page, cdp, touch, building) {
  await page.evaluate(() => {
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
    const sp = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: sp.center.x, cy: sp.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear('D');
  });
  await wait(300);
  const driving = await startDriving(page, cdp, touch);
  if (!driving) return { ok: false, reason: 'no-drive' };
  await page.evaluate(() => window.__playtestQa.setZoom?.(0.28));
  await wait(200);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), building);
  if (!pt) return { ok: false, reason: 'no-door-point' };
  const canvas = page.locator('#game-canvas');
  const rect = await canvas.boundingBox();
  if (!rect) return { ok: false, reason: 'no-canvas' };
  const x = rect.x + pt.x;
  const y = rect.y + pt.y;
  if (touch) await cdpTouch(cdp, x, y);
  else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await wait(30);
    await page.mouse.up();
  }
  await wait(1200);
  const snap = await page.evaluate((n) => {
    const j = window.__playtestQa.jac();
    const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
    const goal = j?.driveGoal;
    const d = b?.door ? Math.hypot(j.cx - b.door.x, j.cy - b.door.y) : null;
    return {
      driving: j?.driving,
      driveGoal: goal,
      mph: j?.mph,
      distDoor: d,
      interior: window.__playtestQa.isInInterior?.(),
    };
  }, building);
  const ok = !!(snap.driveGoal || snap.interior || (snap.distDoor != null && snap.distDoor < 12));
  return { ok, snap };
}

async function runPhoneOverview(tag, opts) {
  const errors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  let bundle = '';
  try {
    bundle = await boot(page, true, cdp);
    if (bundle !== EXPECT_BUNDLE) errors.push(`bundle ${bundle} != ${EXPECT_BUNDLE}`);
    await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
    await wait(300);
    await page.evaluate(() => window.__playtestQa.toggleMapOverview?.());
    await wait(400);
    const overview = await page.evaluate(() => window.__playtestQa.overviewCoverage?.());
    const minCov = Math.min(overview?.covW ?? 0, overview?.covH ?? 0);
    let mapBtn = 0;
    try {
      mapBtn = await page.locator('.ui-view[data-view="map"], .jac-dock__view').count();
    } catch {
      errors.push(`${tag}: page crashed before map control check`);
    }
    await page.screenshot({ path: path.join(OUT, `${tag}-overview-accept.png`) });
    if (minCov < 0.85) errors.push(`${tag}: overview fill ${(minCov * 100).toFixed(1)}% < 85%`);
    if (mapBtn < 1) errors.push(`${tag}: map control not visible in DOM`);
    await page.evaluate(() => window.__playtestQa.toggleMapOverview?.());
    return { tag, errors, bundle, overview, minCov };
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function runDoorTapSuite(tag, opts) {
  const errors = [];
  const log = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await page.context().newCDPSession(page);
  const touch = !!opts.hasTouch;
  try {
    await boot(page, touch, cdp);
    const buildings = ['estudio', 'sambil', 'flor', 'mentoria', 'volaris'];
    for (let i = 0; i < 5; i++) {
      const name = buildings[i % buildings.length];
      const r = await doorTapWhileDrivingOnce(page, cdp, touch, name);
      log.push({ attempt: i + 1, building: name, ...r });
      if (!r.ok) errors.push(`${tag}: door-tap ${i + 1}/5 ${name} failed ${JSON.stringify(r.snap ?? r.reason)}`);
      await page.evaluate(() => {
        window.__playtestQa.jacGetOut?.();
        window.__playtestQa.leaveInteriorNow();
        window.__playtestQa.dismissBuildingPanel?.();
      });
      await wait(600);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `${tag}-door-tap-log.json`), JSON.stringify(log, null, 2));
  return { tag, errors, log, pass: log.filter((x) => x.ok).length };
}

const overview390 = await runPhoneOverview('390-portrait', {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
});
const overview844 = await runPhoneOverview('844-landscape', {
  viewport: { width: 844, height: 390 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
});

const door390 = await runDoorTapSuite('390', {
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
});

const report = {
  ok:
    overview390.errors.length === 0 &&
    overview844.errors.length === 0 &&
    door390.errors.length === 0 &&
    door390.pass === 5,
  expectedBundle: EXPECT_BUNDLE,
  overview390,
  overview844,
  door390,
  at: new Date().toISOString(),
};
fs.writeFileSync(path.join(OUT, 'accept-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
