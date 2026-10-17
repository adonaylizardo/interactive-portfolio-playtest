/**
 * Top-down camera preview QA at 390×844 touch and 1280 desktop.
 * Usage: node scripts/verify-preview-camaras.mjs [url]
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
  'http://127.0.0.1:4173/interactive-portfolio-playtest/preview-camaras/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

async function boot(page, tag) {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__playtestQa?.leaveInteriorNow), null, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.leaveInteriorNow();
    window.__playtestQa.dismissBuildingPanel?.();
  });
  await wait(400);
  const bundle =
    (await page.evaluate(() =>
      [...document.scripts].map((s) => s.src).find((s) => /index-.*\.js/.test(s)),
    )) ?? '';
  return { tag, loadMs: Date.now() - t0, bundle: bundle.split('/').pop() || 'dev' };
}

async function shot(page, name) {
  await wait(100);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

async function pinchZoom(page) {
  await page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const fire = (type, id, x, y) =>
      c.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: 'touch',
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    const cx = r.left + r.width * 0.5;
    const cy = r.top + r.height * 0.45;
    fire('pointerdown', 41, cx - 40, cy - 40);
    fire('pointerdown', 42, cx + 40, cy + 40);
    fire('pointermove', 41, cx - 90, cy - 90);
    fire('pointermove', 42, cx + 90, cy + 90);
    fire('pointerup', 41, cx - 90, cy - 90);
    fire('pointerup', 42, cx + 90, cy + 90);
  });
  await wait(180);
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
  let bundle = '';
  try {
    const bootInfo = await boot(page, tag);
    bundle = bootInfo.bundle;
    notes.push(`${tag} boot ${JSON.stringify(bootInfo)}`);

    await page.evaluate(() => window.__playtestQa.setViewMode('isometrica'));
    const iso = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (iso.mode !== 'isometrica') errors.push(`${tag}: iso mode ${iso.mode}`);
    if (iso.altView !== 'off') errors.push(`${tag}: iso altView ${iso.altView}`);
    await shot(page, `${tag}-iso`);

    await page.evaluate(() => window.__playtestQa.setViewMode('cenital'));
    const cen = await page.evaluate(() => window.__playtestQa.cameraViews());
    if (cen.mode !== 'cenital' || cen.altView !== 'cenital') {
      errors.push(`${tag}: cenital mode ${cen.mode}/${cen.altView}`);
    }
    if (!cen.altLayer) errors.push(`${tag}: cenital alt roof layer hidden`);
    if (cen.roofsHidden < cen.roofsTotal * 0.75) {
      errors.push(`${tag}: cenital hid only ${cen.roofsHidden}/${cen.roofsTotal} iso props`);
    }
    await shot(page, `${tag}-cenital`);

    await page.locator('.ui-view[data-view="isometrica"]').click();
    await wait(120);
    const backIso = await page.evaluate(
      () => document.getElementById('game-canvas')?.dataset.viewMode,
    );
    if (backIso !== 'isometrica') errors.push(`${tag}: toggle back to iso left ${backIso}`);

    await page.locator('.ui-view[data-view="cenital"]').click();
    await wait(120);

    const beforeWalk = await page.evaluate(() => window.__playtestQa.getCharacterPos());
    await page.evaluate(() => window.__playtestQa.tapMapTile(33, 34));
    await wait(2200);
    const afterWalk = await page.evaluate(() => window.__playtestQa.getCharacterPos());
    const walkD = Math.hypot(afterWalk.x - beforeWalk.x, afterWalk.y - beforeWalk.y);
    if (walkD < 0.35) {
      errors.push(
        `${tag}: cenital tap-walk did not move ${JSON.stringify(beforeWalk)} → ${JSON.stringify(afterWalk)}`,
      );
    }

    const buildings = ['estudio', 'sambil', 'catedral'];
    const enteredOk = [];
    for (const name of buildings) {
      await page.evaluate(() => {
        window.__playtestQa.setViewMode('cenital');
        window.__playtestQa.leaveInteriorNow();
        window.__playtestQa.dismissBuildingPanel?.();
      });
      await wait(200);
      await page.evaluate((n) => {
        const i = window.__playtestQa.inicio;
        window.__playtestQa.setCharacterTile(i[0], i[1]);
        window.__playtestQa.walkToBuilding(n);
      }, name);
      await wait(9000);
      let inside = await page.evaluate(() => window.__playtestQa.isInInterior());
      if (!inside) {
        await page.evaluate((n) => window.__playtestQa.tapBuildingDoor(n), name);
        await wait(4500);
        inside = await page.evaluate(() => window.__playtestQa.isInInterior());
      }
      if (!inside) {
        errors.push(`${tag}: cenital enter ${name} failed after walkToBuilding`);
        continue;
      }
      enteredOk.push(name);
      await page.evaluate(() => window.__playtestQa.leaveInteriorNow());
      await wait(900);
      if (await page.evaluate(() => window.__playtestQa.isInInterior())) {
        errors.push(`${tag}: exit ${name} stuck inside`);
      }
    }
    if (enteredOk.length < 3) {
      errors.push(`${tag}: only ${enteredOk.length}/3 building round-trips in cenital (${enteredOk.join(', ')})`);
    }
    notes.push(`${tag}: buildings in cenital: ${enteredOk.join(', ') || 'none'}`);

    await page.evaluate(() => {
      window.__playtestQa.setViewMode('cenital');
      window.__playtestQa.leaveInteriorNow();
      window.__playtestQa.setCharacterTile(27, 19);
      window.__playtestQa.tapJac();
      window.__playtestQa.jacGetIn();
    });
    await wait(1200);
    let driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
    if (!driving) {
      await page.evaluate(() => {
        window.__playtestQa.jacGetIn();
        window.__playtestQa.jacSetGear('D');
      });
      await wait(800);
      driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
    }
    if (!driving) errors.push(`${tag}: jacGetIn failed in cenital`);

    const z0 = await page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.zoom));
    await pinchZoom(page);
    const z1 = await page.evaluate(() => Number(document.getElementById('game-canvas')?.dataset.zoom));
    if (!Number.isFinite(z1) || z1 <= z0 + 0.005) {
      errors.push(`${tag}: pinch did not zoom (${z0} → ${z1})`);
    }

    await page.evaluate(() => window.__playtestQa.jacSetGear('D'));
    const startJac = await page.evaluate(() => window.__playtestQa.jac());
    await page.evaluate(() => {
      window.__playtestQa.jacStick({ x: 0, y: -1 });
      for (let i = 0; i < 24; i++) window.__playtestQa.jacDriveStep(0.05, 0, -1);
      window.__playtestQa.jacStick(null);
    });
    await wait(300);
    const movedJac = await page.evaluate(() => window.__playtestQa.jac());
    const jacDist = Math.hypot(
      (movedJac?.cx ?? 0) - (startJac?.cx ?? 0),
      (movedJac?.cy ?? 0) - (startJac?.cy ?? 0),
    );
    if (jacDist < 0.2) {
      errors.push(`${tag}: joystick drive in cenital did not move van (d=${jacDist.toFixed(2)})`);
    }

    const tapDrive = await page.evaluate(() => {
      const walk = window.__playtestQa.fill().walk;
      const clear = (x, y) => {
        for (let dy = -1; dy <= 2; dy++) {
          for (let dx = -1; dx <= 2; dx++) {
            const ch = walk[y + dy]?.[x + dx];
            if (!ch || ch === '#' || ch === 'x') return false;
          }
        }
        return true;
      };
      const j = window.__playtestQa.jac();
      let goal = null;
      for (let y = Math.round(j.cy); y < Math.round(j.cy) + 8; y++) {
        for (let x = Math.round(j.cx) + 2; x < Math.round(j.cx) + 10; x++) {
          if (clear(x, y)) {
            goal = { x, y };
            break;
          }
        }
        if (goal) break;
      }
      const ok = goal ? window.__playtestQa.jacDriveTo(goal.x, goal.y) : false;
      return { ok, goal, start: { cx: j.cx, cy: j.cy } };
    });
    await wait(1400);
    const afterTap = await page.evaluate(() => window.__playtestQa.jac());
    const tapDist = Math.hypot(
      (afterTap?.cx ?? 0) - (tapDrive.start.cx ?? 0),
      (afterTap?.cy ?? 0) - (tapDrive.start.cy ?? 0),
    );
    if (!tapDrive.ok) errors.push(`${tag}: cenital tap-drive path rejected`);
    else if (tapDist < 0.25) errors.push(`${tag}: cenital tap-drive did not move van`);

    await page.evaluate(() => window.__playtestQa.jacGetOut?.());
    await wait(400);

    if (consoleErrors.length) {
      errors.push(`${tag}: console ${consoleErrors.slice(0, 4).join(' | ')}`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  return { tag, errors, notes, bundle };
}

const viewports = [
  ['390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ['1280', { viewport: { width: 1280, height: 800 } }],
];

const results = [];
for (const [tag, options] of viewports) {
  results.push(await runViewport(tag, options));
}

const bundle = results.find((r) => r.bundle)?.bundle ?? '';
const report = { ok: results.every((r) => r.errors.length === 0), bundle, base: BASE, results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(`\n== ${r.tag} ==`);
  for (const n of r.notes) console.log(' ', n);
  for (const e of r.errors) console.log('  ERR', e);
}
if (!report.ok) {
  console.error('\npreview-camaras verify failed');
  process.exit(1);
}
console.log(`\npreview-camaras verify ok (bundle ${bundle})`);
