/**
 * Camera views: true overhead, behind-character follow, rotate/overview/center.
 * Usage: node scripts/verify-camera-views.mjs [url]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'camera-views');
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function boot(page, tag) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, { timeout: 45000 });
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
  });
  await wait(500);
  return { tag, loadMs: Date.now() - t0 };
}

async function shot(page, name) {
  await wait(120);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function holdKey(page, key, ms) {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
  await wait(80);
}

async function runViewport(tag, options) {
  const errors = [];
  const notes = [];
  const consoleErrors = [];
  const browser = await launchBrowser(chromium);
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  try {
    notes.push(`${tag} ${JSON.stringify(await boot(page, tag))}`);

    const iso = await page.evaluate(() => {
      window.__playtestQa.setViewMode('isometrica');
      return window.__playtestQa.cameraViews();
    });
    if (iso.mode !== 'isometrica') errors.push(`${tag}: iso mode ${iso.mode}`);
    if (Math.abs(iso.sy - 1) > 0.01) errors.push(`${tag}: iso viewSy ${iso.sy} (want 1)`);
    if (iso.altView !== 'off') errors.push(`${tag}: iso altView ${iso.altView}`);
    if (iso.altLayer) errors.push(`${tag}: iso drew alt roofs`);
    if (iso.roofsHidden > 0) errors.push(`${tag}: iso hid ${iso.roofsHidden} building sprites`);
    notes.push(`${tag} iso ${JSON.stringify({ sy: iso.sy, rot: iso.rot, hidden: iso.roofsHidden })}`);
    await shot(page, `${tag}-iso`);

    const tileBeforeW = await page.evaluate(() => window.__playtestQa.getCharacterTile());
    await holdKey(page, 'w', 500);
    const tileAfterW = await page.evaluate(() => window.__playtestQa.getCharacterTile());
    if (!(tileAfterW.y < tileBeforeW.y - 0.05)) {
      errors.push(`${tag}: iso W should walk −y (NE); ${JSON.stringify(tileBeforeW)} → ${JSON.stringify(tileAfterW)}`);
    }

    const cen = await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      return window.__playtestQa.cameraViews();
    });
    if (cen.mode !== 'cenital' || cen.altView !== 'cenital') errors.push(`${tag}: cenital mode ${cen.mode}/${cen.altView}`);
    if (Math.abs(cen.sy - 2) > 0.01) errors.push(`${tag}: cenital viewSy ${cen.sy} (want 2)`);
    if (!cen.altLayer) errors.push(`${tag}: cenital alt layer hidden`);
    if (cen.roofsHidden < cen.roofsTotal * 0.8) {
      errors.push(`${tag}: cenital hid ${cen.roofsHidden}/${cen.roofsTotal} iso props`);
    }
    if (!(cen.adonayScreen.h > cen.adonayScreen.w * 0.7)) {
      errors.push(
        `${tag}: cenital Adonay looks squashed/lying down ${JSON.stringify(cen.adonayScreen)}`,
      );
    }
    const adonayLabel = cen.labels.find((l) => l.id === 'adonay' && l.visible);
    if (adonayLabel && adonayLabel.y > cen.adonayScreen.y + 12) {
      errors.push(`${tag}: cenital Adonay pill overlaps sprite (pill ${adonayLabel.y} spriteTop ${cen.adonayScreen.y})`);
    }
    notes.push(
      `${tag} cenital ${JSON.stringify({
        sy: cen.sy,
        hidden: `${cen.roofsHidden}/${cen.roofsTotal}`,
        sprite: cen.adonayScreen,
        labelY: adonayLabel?.y,
      })}`,
    );
    await shot(page, `${tag}-cenital`);

    const screenBefore = await page.evaluate(() => window.__playtestQa.cameraViews().charScreen);
    await holdKey(page, 'w', 600);
    const screenAfter = await page.evaluate(() => window.__playtestQa.cameraViews().charScreen);
    if (!(screenAfter.y < screenBefore.y - 4)) {
      errors.push(
        `${tag}: cenital W should move up on screen; ${JSON.stringify(screenBefore)} → ${JSON.stringify(screenAfter)}`,
      );
    }

    const persp = await page.evaluate(() => {
      window.__playtestQa.setAnim?.('se', false, 0);
      window.__playtestQa.setViewMode('perspectiva');
      return window.__playtestQa.cameraViews();
    });
    if (persp.mode !== 'perspectiva' || persp.altView !== 'perspectiva') {
      errors.push(`${tag}: perspectiva mode ${persp.mode}/${persp.altView}`);
    }
    if (Math.abs(persp.sy - 1) > 0.01) errors.push(`${tag}: perspectiva viewSy ${persp.sy} (want 1, not 1.38)`);
    if (!persp.altLayer) errors.push(`${tag}: perspectiva alt layer hidden`);
    if (persp.roofsHidden < persp.roofsTotal * 0.8) {
      errors.push(`${tag}: perspectiva hid ${persp.roofsHidden}/${persp.roofsTotal} iso props`);
    }
    if (persp.charScreen.y + 24 < persp.aim.y) {
      errors.push(`${tag}: perspectiva character not in lower third ${JSON.stringify({ char: persp.charScreen, aim: persp.aim })}`);
    }
    notes.push(
      `${tag} perspectiva ${JSON.stringify({
        sy: persp.sy,
        yaw: persp.cameraYaw,
        char: persp.charScreen,
        aim: persp.aim,
      })}`,
    );
    await shot(page, `${tag}-perspectiva`);

    const yawSe = persp.cameraYaw;
    const yawNw = await page.evaluate(() => {
      window.__playtestQa.setAnim?.('nw', false, 0);
      return window.__playtestQa.cameraViews().cameraYaw;
    });
    if (yawSe === yawNw) errors.push(`${tag}: perspectiva yaw did not follow facing (${yawSe} vs ${yawNw})`);
    await shot(page, `${tag}-perspectiva-nw`);

    await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
    const beforeRotate = await page.evaluate(() => window.__playtestQa.cameraViews());
    await page.evaluate(() => window.__playtestQa.rotateView());
    const afterRotate = await page.evaluate(() => window.__playtestQa.cameraViews());
    const dx = Math.abs(afterRotate.charScreen.x - afterRotate.aim.x);
    const dy = Math.abs(afterRotate.charScreen.y - afterRotate.aim.y);
    if (dx > 48 || dy > 48) {
      errors.push(
        `${tag}: rotate left character off-center dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} aim=${JSON.stringify(afterRotate.aim)} char=${JSON.stringify(afterRotate.charScreen)}`,
      );
    }
    if (afterRotate.yaw === beforeRotate.yaw) errors.push(`${tag}: rotate did not change yaw`);
    notes.push(`${tag} rotate yaw ${beforeRotate.yaw}→${afterRotate.yaw} off=(${dx.toFixed(1)},${dy.toFixed(1)})`);
    await shot(page, `${tag}-rotate`);

    const zoomBeforeOverview = afterRotate;
    await page.evaluate(() => window.__playtestQa.toggleMapOverview());
    const overview = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (!overview.overview) errors.push(`${tag}: map overview did not engage`);
    await shot(page, `${tag}-overview`);
    await page.evaluate(() => window.__playtestQa.rotateView());
    const overviewRot = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (!overviewRot.overview) errors.push(`${tag}: rotate dropped overview`);
    const mapOff = Math.hypot(overviewRot.charScreen.x - overview.charScreen.x, overviewRot.charScreen.y - overview.charScreen.y);
    notes.push(`${tag} overview-rotate charShift=${mapOff.toFixed(1)} yaw ${overview.yaw}→${overviewRot.yaw}`);
    await shot(page, `${tag}-overview-rotate`);

    await page.evaluate(() => window.__playtestQa.toggleMapOverview());
    const leftOverview = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (leftOverview.overview) errors.push(`${tag}: leaving overview stayed in overview`);
    if (Math.abs(leftOverview.sy - zoomBeforeOverview.sy) > 0.01 && leftOverview.mode !== zoomBeforeOverview.mode) {
      /* mode may differ if rotate changed view transform; zoom is the one that used to stick at zMin */
    }
    const cv = await page.evaluate(() => {
      const el = document.querySelector('canvas');
      return { zoom: Number(el?.dataset.zoom), zoomMin: Number(el?.dataset.zoomMin), overview: el?.dataset.mapOverview };
    });
    if (cv.overview === '1') errors.push(`${tag}: canvas still mapOverview after leave`);
    if (cv.zoom <= cv.zoomMin + 0.02) {
      errors.push(`${tag}: leaving overview kept min zoom ${cv.zoom} (min ${cv.zoomMin})`);
    }
    notes.push(`${tag} left-overview zoom=${cv.zoom.toFixed(3)} min=${cv.zoomMin.toFixed(3)}`);
    await shot(page, `${tag}-overview-leave`);

    await page.evaluate(() => window.__playtestQa.toggleMapOverview());
    await page.evaluate(() => window.__playtestQa.cameraViews());
    await page.evaluate(() => {
      document.querySelector('[aria-label="Center on Adonay"]')?.click();
    });
    await wait(200);
    const centered = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (centered.overview) errors.push(`${tag}: Center on Adonay stayed in overview`);
    const cdx = Math.abs(centered.charScreen.x - centered.aim.x);
    const cdy = Math.abs(centered.charScreen.y - centered.aim.y);
    if (cdx > 48 || cdy > 48) {
      errors.push(`${tag}: Center on Adonay missed character dx=${cdx.toFixed(1)} dy=${cdy.toFixed(1)}`);
    }
    notes.push(`${tag} center off=(${cdx.toFixed(1)},${cdy.toFixed(1)}) overview=${centered.overview}`);
    await shot(page, `${tag}-center`);

    if (consoleErrors.length) errors.push(`${tag}: console ${consoleErrors.slice(0, 3).join(' | ')}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { tag, errors, notes };
}

const viewports = [
  ['375', { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true }],
  ['1280', { viewport: { width: 1280, height: 800 } }],
];

const results = [];
for (const [tag, options] of viewports) {
  results.push(await runViewport(tag, options));
}

const report = { ok: results.every((r) => r.errors.length === 0), results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(`\n== ${r.tag} ==`);
  for (const n of r.notes) console.log(' ', n);
  for (const e of r.errors) console.log('  ERR', e);
}
if (!report.ok) {
  console.error('\ncamera-views verify failed');
  process.exit(1);
}
console.log('\ncamera-views verify ok');
