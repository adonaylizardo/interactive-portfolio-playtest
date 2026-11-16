#!/usr/bin/env node
/**
 * r45 JAC vehicle model: heading steer, gears, collision, exit pose (headless Playwright + __playtestQa).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { waitForQa } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ART = '/opt/cursor/artifacts';
const BASE =
  process.env.QA_BASE_URL ?? `${process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173/interactive-portfolio-playtest/'}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootDrive(page) {
  await page.goto(`${BASE}#view=0,0,1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await waitForQa(page);
  await page.evaluate(() => {
    window.__playtestQa.setViewMode?.('cenital');
    window.__playtestQa.setLayout?.('map');
    const door = window.__playtestQa.jacDoor();
    if (door) window.__playtestQa.setCharacterTile(door.x, door.y);
    window.__playtestQa.jacGetIn();
    window.__playtestQa.jacSetGear?.('D');
  });
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 15_000 });
  await page.waitForFunction(
    () => window.__playtestQa.jac()?.gear === 'D' && window.__playtestQa.jac()?.engineOn === true,
    null,
    { timeout: 5000 },
  );
}

function step(page, dx, dy, n = 30) {
  return page.evaluate(
    ({ dx, dy, n }) => {
      let last = null;
      for (let i = 0; i < n; i++) {
        last = window.__playtestQa.jacDriveStep?.(1 / 60, dx, dy, { render: false });
      }
      return last;
    },
    { dx, dy, n },
  );
}

async function snapshot(page) {
  return page.evaluate(() => window.__playtestQa.jac());
}

async function runModelTests(page) {
  await bootDrive(page);
  const t0 = await snapshot(page);
  const h0 = t0.heading;

  const velSamples = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      window.__playtestQa.jacDriveStep(1 / 60, 0, -0.9, { render: false });
      out.push(window.__playtestQa.jac().vel);
    }
    return out;
  });
  assert.ok(velSamples[0] < 0.25, `initial speed near zero (got ${velSamples[0]})`);
  assert.ok(
    velSamples.at(-1) > velSamples[0] + 0.4,
    `throttle should build speed in D (samples: ${velSamples.map((v) => v.toFixed(2)).join('→')})`,
  );

  await step(page, 0.9, -0.4, 45);
  const t1 = await snapshot(page);
  assert.ok(Math.abs(t1.heading - h0) > 0.08, 'heading should change when steering with speed');
  assert.ok(t1.cx !== t0.cx || t1.cy !== t0.cy, 'truck should move forward in D');
  assert.ok(t1.vel > 0.05, 'positive velocity in D with throttle');

  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0.9, { render: false }));
  }
  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  const stopped = await snapshot(page);
  assert.ok(Math.abs(stopped.vel) < 0.1, 'must be stopped before in-place steer check');
  const hs = stopped.heading;
  await step(page, 0.85, 0, 20);
  const tSteerStopped = await snapshot(page);
  assert.ok(Math.abs(tSteerStopped.heading - hs) < 0.06, 'no in-place heading change when stopped');

  await page.evaluate(() => {
    window.__playtestQa.jacSetGear?.('P');
    const b = window.__playtestQa.jac();
    return { cx: b.cx, cy: b.cy, mph: b.mph, vel: b.vel };
  });
  const afterP = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('D'));
  const afterD = await snapshot(page);
  assert.equal(afterD.mph, 0, 'gear P→D must not show speed without throttle');
  assert.equal(afterD.vel, 0, 'gear P→D must not impart velocity');
  assert.ok(
    Math.hypot(afterD.cx - afterP.cx, afterD.cy - afterP.cy) < 0.01,
    'gear change alone must not move the truck',
  );

  await step(page, 0, -0.85, 50);
  const fwd = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  await step(page, 0, -0.85, 55);
  const rev = await snapshot(page);
  assert.ok(rev.vel < -0.05, 'R gear with throttle should produce negative velocity');
  assert.ok(fwd.cx !== rev.cx || fwd.cy !== rev.cy, 'reverse should move along heading');

  const wallProbe = await page.evaluate(() => {
    let blocked = null;
    for (let y = 12; y < 40 && !blocked; y++) {
      for (let x = 12; x < 40; x++) {
        if (
          !window.__playtestQa.jacDriveTileOk?.(x, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 1, y) &&
          window.__playtestQa.jacDriveTileOk?.(x - 2, y)
        ) {
          blocked = { x, y };
          break;
        }
      }
    }
    if (!blocked) return { ok: false, reason: 'no blocked tile found' };
    window.__playtestQa.jacSet?.({ mode: 'drive', gear: 'D', dir: 'se', cx: blocked.x - 2, cy: blocked.y });
    const startCx = window.__playtestQa.jac().cx;
    for (let i = 0; i < 90; i++) window.__playtestQa.jacDriveStep?.(1 / 60, 0, -1, { render: false });
    const end = window.__playtestQa.jac();
    const advanced = end.cx - startCx;
    const inside = window.__playtestQa.jacDriveTileOk?.(blocked.x, blocked.y) === false;
    const held = end.cx < blocked.x - 0.35 || (advanced < 0.45 && end.vel < 2.2);
    return { ok: inside && held, blocked, startCx, endCx: end.cx, advanced, vel: end.vel };
  });
  assert.ok(wallProbe.ok, `collision should stop before building tile (${JSON.stringify(wallProbe)})`);

}

async function runExitPersistTests(page) {
  await bootDrive(page);
  for (let i = 0; i < 70; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, -0.85, { render: false }));
  }
  const before = await snapshot(page);
  await page.evaluate(() => window.__playtestQa.jacGetOut?.());
  for (let i = 0; i < 120; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  const after = await snapshot(page);
  assert.ok(!after.driving, 'should be parked after exit');
  assert.ok(
    Math.hypot(after.cx - before.cx, after.cy - before.cy) < 0.45,
    'truck stays at exit pose',
  );
  await page.evaluate(() => window.__playtestQa.jacGetIn?.());
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 8000 });
  const re = await snapshot(page);
  assert.ok(Math.hypot(re.cx - after.cx, re.cy - after.cy) < 0.35, 're-enter continues from parked pose');
}

async function browserLoop(page, tag, viewport) {
  await bootDrive(page);
  const shots = [];
  const snap = (name) => path.join(ART, `r45-${tag}-${name}.png`);
  await page.screenshot({ path: snap('01-drive-start'), fullPage: false });
  shots.push(snap('01-drive-start'));

  await step(page, 0.5, -0.85, 90);
  await step(page, 0.75, 0, 40);
  await page.screenshot({ path: snap('02-loop'), fullPage: false });
  shots.push(snap('02-loop'));

  await step(page, 0, -1, 120);
  await page.screenshot({ path: snap('03-wall'), fullPage: false });
  shots.push(snap('03-wall'));

  await page.evaluate(() => window.__playtestQa.jacSetGear?.('R'));
  await step(page, 0, -0.7, 70);
  await page.screenshot({ path: snap('04-reverse'), fullPage: false });
  shots.push(snap('04-reverse'));

  await page.evaluate(() => {
    window.__playtestQa.jacGetOut?.();
  });
  for (let i = 0; i < 90; i++) {
    await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0, { render: false }));
  }
  await wait(200);
  await page.screenshot({ path: snap('05-exit'), fullPage: false });
  shots.push(snap('05-exit'));

  await page.evaluate(() => window.__playtestQa.jacGetIn?.());
  await wait(600);
  await page.screenshot({ path: snap('06-reenter'), fullPage: false });
  shots.push(snap('06-reenter'));

  return { viewport, shots };
}

async function main() {
  fs.mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  const boot = async (context) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem('playtest-welcome-done', '1');
      } catch {
        /* ignore */
      }
    });
  };
  const ctxDesk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await boot(ctxDesk);
  const pageDesk = await ctxDesk.newPage();
  await runModelTests(pageDesk);
  await runExitPersistTests(pageDesk);
  const desk = await browserLoop(pageDesk, 'desktop', '1440x900');
  await ctxDesk.close();

  const phone = devices['iPhone X'];
  const ctxPhone = await browser.newContext({ ...phone, hasTouch: true, isMobile: true });
  await boot(ctxPhone);
  await ctxPhone.addInitScript(() => {
    document.documentElement.dataset.chrome = 'phone';
  });
  const pagePhone = await ctxPhone.newPage();
  await browserLoop(pagePhone, 'iphone', '375x812');
  await ctxPhone.close();
  await browser.close();

  console.log(JSON.stringify({ ok: true, desk, phone: { viewport: '375x812' } }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});