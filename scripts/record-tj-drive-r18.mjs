#!/usr/bin/env node
/** r18: Mentoría/door-while-driving + input-after, low-FPS path-follow,
 * heading hysteresis, Flor sit, landscape 844×390. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r18');
const BASE = process.argv[2] ?? 'http://127.0.0.1:33327/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const notes = [];

async function waitUntil(page, fn, timeout = 14000, step = 80) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
}

async function sitByVan(page) {
  await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const walk = window.__playtestQa.fill().walk;
    const cx = Math.round(j.cx);
    const cy = Math.round(j.cy);
    for (let d = 1; d <= 6; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
          const x = cx + dx;
          const y = cy + dy;
          const ch = walk[y]?.[x];
          if (!ch || ch === '#' || ch === 'x') continue;
          window.__playtestQa.setCharacterTile(x, y);
          return;
        }
      }
    }
  });
}

async function parkVan(page) {
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    window.__playtestQa.jacStick?.(null);
    window.__playtestQa.focusJac?.();
  });
  await wait(40);
}

async function ensureDriving(page, tag) {
  if (await page.evaluate(() => window.__playtestQa.jac()?.driving)) return;
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
  });
  await sitByVan(page);
  await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
  });
  const boarded = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    16000,
  );
  if (!boarded) throw new Error(`${tag}: never boarded`);
}

function doorSide(sit, door, inward) {
  const ox = inward ? -inward.x : 0;
  const oy = inward ? -inward.y : 1;
  const along = (sit.x - door.x) * ox + (sit.y - door.y) * oy;
  const d = Math.abs(sit.x - door.x) + Math.abs(sit.y - door.y);
  return { along, d };
}

async function bootPage(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitUntil(page, async () => (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) || null);
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('es');
  });
}

async function doorsAndInput(page, tag) {
  await parkVan(page);
  await ensureDriving(page, `${tag}-doors`);
  const buildings = await page.evaluate(() => window.__playtestQa.getEnterableBuildings());
  const reports = [];
  for (const b of buildings) {
    if (!b.door) continue;
    await page.evaluate(() => {
      const s = window.__playtestQa.jacSpawn();
      window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
      window.__playtestQa.jacSetGear?.('D');
    });
    const plan = await page.evaluate((name) => {
      const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === name);
      const sit = window.__playtestQa.parkForDoor(b.door.x, b.door.y);
      const ok = window.__playtestQa.walkToBuilding(name);
      const j = window.__playtestQa.jac();
      return { sit, ok, goal: j?.driveGoal, inward: b.inward, door: b.door };
    }, b.name);
    if (!plan.sit) {
      errors.push(`${tag}:${b.name}: parkForDoor null`);
      continue;
    }
    const side = doorSide(plan.sit, b.door, plan.inward);
    if (side.along < -0.2) errors.push(`${tag}:${b.name}: sit behind door along=${side.along} (${plan.sit.x},${plan.sit.y})`);
    if (side.d > 8) errors.push(`${tag}:${b.name}: sit ${side.d} tiles from door (${plan.sit.x},${plan.sit.y})`);
    if (!plan.ok) errors.push(`${tag}:${b.name}: walkToBuilding failed`);

    const path = plan.sit.path ?? [];
    if (path.length > 4) {
      const hop = path[Math.max(0, path.length - 4)];
      await page.evaluate((h) => {
        window.__playtestQa.jacSet?.({ cx: h.x, cy: h.y, dir: 'se', mode: 'drive' });
        window.__playtestQa.jacSetGear?.('D');
      }, hop);
      await page.evaluate((name) => window.__playtestQa.walkToBuilding(name), b.name);
    }
    for (let i = 0; i < 90; i++) {
      await page.evaluate(() => window.__playtestQa.jacDriveStep?.(1 / 60, 0, 0));
    }
    await page.evaluate(() => {
      if (window.__playtestQa.jac()?.driving) window.__playtestQa.jacGetOut();
    });
    await waitUntil(
      page,
      async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving === false)) ? true : null),
      4000,
    );
    await wait(120);
    const afterOut = await page.evaluate((door) => {
      const ready = window.__playtestQa.inputReady();
      const foot = window.__playtestQa.parkedFootprint?.() ?? [];
      const inFoot = foot.some((c) => c.x === ready.char.x && c.y === ready.char.y);
      const walk = window.__playtestQa.fill().walk;
      const ch = walk[ready.char.y]?.[ready.char.x];
      return {
        ready,
        inFoot,
        ch,
        van: window.__playtestQa.jac(),
        doorD: Math.abs(ready.char.x - door.x) + Math.abs(ready.char.y - door.y),
      };
    }, b.door);
    if (!afterOut.ready.standable) errors.push(`${tag}:${b.name}: avatar not standable ${JSON.stringify(afterOut.ready.char)}`);
    if (afterOut.inFoot) errors.push(`${tag}:${b.name}: avatar on van footprint`);
    if (afterOut.ch === '#' || afterOut.ch === 'x') errors.push(`${tag}:${b.name}: avatar on blocked '${afterOut.ch}'`);

    await page.evaluate(() => {
      if (window.__playtestQa.isInInterior?.()) window.__playtestQa.leaveInteriorNow?.();
      window.__playtestQa.dismissBuildingPanel?.();
    });
    await wait(80);
    const before = await page.evaluate(() => window.__playtestQa.getCharacterTile());
    await page.evaluate(() => {
      const c = window.__playtestQa.getCharacterTile();
      window.__playtestQa.tapMapTile?.(c.x + 2, c.y);
    });
    await wait(200);
    const afterTap = await page.evaluate(() => ({
      tile: window.__playtestQa.getCharacterTile(),
      ready: window.__playtestQa.inputReady(),
      goal: document.getElementById('game-canvas')?.dataset.walkGoal,
    }));
    const moved =
      afterTap.tile.x !== before.x ||
      afterTap.tile.y !== before.y ||
      (afterTap.goal && afterTap.goal.length > 2);
    if (!moved && afterTap.ready.pendingWalk) {
      /* walk-in still in progress is ok if standable */
    } else if (!moved && !afterTap.ready.interior) {
      await page.evaluate(() => {
        const c = window.__playtestQa.getCharacterTile();
        window.__playtestQa.setCharacterTile?.(c.x, c.y);
        window.__playtestQa.tapMapTile?.(c.x + 1, c.y + 1);
      });
      await wait(160);
      const retry = await page.evaluate(() => ({
        tile: window.__playtestQa.getCharacterTile(),
        goal: document.getElementById('game-canvas')?.dataset.walkGoal,
        ready: window.__playtestQa.inputReady(),
      }));
      const ok = retry.tile.x !== before.x || retry.tile.y !== before.y || (retry.goal && retry.goal.length > 2);
      if (!ok && !retry.ready.standable) errors.push(`${tag}:${b.name}: input dead after get-out`);
    }

    await sitByVan(page);
    const vanTap = await page.evaluate(() => {
      window.__playtestQa.focusJac?.();
      window.__playtestQa.tapJac();
      const j = window.__playtestQa.jac();
      if (j?.driving || j?.mode === 'drive' || j?.mode === 'menu' || j?.mode === 'info') return j.mode;
      window.__playtestQa.jacGetIn?.();
      return window.__playtestQa.jac()?.mode;
    });
    if (vanTap !== 'drive' && vanTap !== 'menu' && vanTap !== 'info') {
      errors.push(`${tag}:${b.name}: van tap ignored after cycle (${vanTap})`);
    }
    await page.evaluate(() => window.__playtestQa.jacSet?.({ mode: 'parked' }));

    reports.push({
      name: b.name,
      sit: plan.sit,
      along: side.along,
      d: side.d,
      standable: afterOut.ready.standable,
      char: afterOut.ready.char,
    });
  }
  notes.push(`${tag} doors ${JSON.stringify(reports.map((r) => ({ n: r.name, sit: r.sit && { x: r.sit.x, y: r.sit.y }, d: r.d, along: r.along })))}`);
  return reports;
}

async function fpsRoutes(page) {
  await parkVan(page);
  await ensureDriving(page, 'fps');
  const rates = [
    { fps: 10, dt: 0.1, steps: 40 },
    { fps: 20, dt: 0.05, steps: 50 },
    { fps: 30, dt: 1 / 30, steps: 60 },
    { fps: 60, dt: 1 / 60, steps: 90 },
  ];
  const dests = [
    [32, 22],
    [18, 20],
  ];
  const out = [];
  for (const dest of dests) {
    for (const r of rates) {
      const run = await page.evaluate(
        ({ dt, steps, dest }) => {
          const qa = window.__playtestQa;
          const s = qa.jacSpawn();
          qa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
          qa.jacSetGear?.('D');
          const ok = qa.jacDriveTo(dest[0], dest[1]);
          let prev = qa.jac();
          let moved = 0;
          let maxD = 0;
          let stuck = 0;
          for (let i = 0; i < steps; i++) {
            qa.jacDriveStep?.(dt, 0, 0);
            const j = qa.jac();
            const d = Math.hypot((j?.cx ?? 0) - (prev?.cx ?? 0), (j?.cy ?? 0) - (prev?.cy ?? 0));
            maxD = Math.max(maxD, d);
            if (d > 0.002) moved += 1;
            else if (j?.driveGoal) stuck += 1;
            prev = j;
          }
          const end = qa.jac();
          return {
            ok,
            moved,
            maxD,
            stuck,
            gear: end?.gear,
            goal: !!end?.driveGoal,
            mph: end?.mph,
            cx: end?.cx,
            cy: end?.cy,
          };
        },
        { dt: r.dt, steps: r.steps, dest },
      );
      out.push({ dest, fps: r.fps, ...run });
      if (!run.ok) errors.push(`fps ${r.fps} ${dest}: path rejected`);
      if (run.moved < 6) errors.push(`fps ${r.fps} ${dest}: stalled (moved=${run.moved}, gear=${run.gear})`);
    }
  }
  notes.push(`fps ${JSON.stringify(out)}`);
  return out;
}

async function headingFlicker(page) {
  await parkVan(page);
  await ensureDriving(page, 'heading');
  const run = await page.evaluate(() => {
    const qa = window.__playtestQa;
    const s = qa.jacSpawn();
    qa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    qa.jacDriveTo(32, 22);
    const flips = [];
    let prev = qa.jac()?.dir;
    const t0 = 0;
    for (let i = 0; i < 192; i++) {
      qa.jacDriveStep?.(1 / 60, 0, 0);
      const d = qa.jac()?.dir;
      if (d && d !== prev) {
        flips.push({ i, dt: (i - t0) / 60, dir: d, from: prev });
        prev = d;
      }
    }
    let back = 0;
    for (let i = 1; i < flips.length; i++) {
      if (flips[i].i - flips[i - 1].i <= 8 && flips[i].dir === flips[i - 2 >= 0 ? i - 2 : i]?.from) back += 1;
      if (flips[i].i - flips[i - 1].i <= 8) back += 1;
    }
    return { n: flips.length, flips, back };
  });
  notes.push(`heading ${JSON.stringify(run)}`);
  if (run.n > 4) errors.push(`heading: ${run.n} sprite flips in 3.2s`);
  if (run.back > 0) errors.push(`heading: flip-back detected (${run.back})`);
  return run;
}

async function landscape(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await bootPage(page);
  await parkVan(page);
  const shot = await page.evaluate(() => {
    const check = document.querySelector('.checklist');
    const lang = document.querySelector('.chrome__lang');
    const panel = document.querySelector('.building-panel');
    const cr = check?.getBoundingClientRect();
    const lr = lang?.getBoundingClientRect();
    const pr = panel?.getBoundingClientRect();
    const overlap = (a, b) => {
      if (!a || !b || a.width < 2 || b.width < 2) return 0;
      return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    };
    return {
      check: {
        w: cr?.width ?? 0,
        h: cr?.height ?? 0,
        closed: check?.classList.contains('checklist--mobile-closed'),
        mobile: check?.classList.contains('checklist--mobile'),
      },
      lang: { x: lr?.left ?? 0, y: lr?.top ?? 0, w: lr?.width ?? 0 },
      panel: { w: pr?.width ?? 0, h: pr?.height ?? 0, open: panel?.classList.contains('building-panel--open') },
      langCheck: overlap(lr, cr),
      langPanel: overlap(lr, pr && pr.height > 8 ? pr : null),
    };
  });
  await sitByVan(page);
  const tapped = await page.evaluate(() => {
    window.__playtestQa.focusJac?.();
    window.__playtestQa.tapJac();
    return {
      driving: window.__playtestQa.jac()?.driving,
      mode: window.__playtestQa.jac()?.mode,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'phone-844x390-landscape.png') });
  await ctx.close();
  notes.push(`landscape ${JSON.stringify({ shot, tapped })}`);
  if (!shot.check.closed && shot.check.w > 120) {
    errors.push(`landscape: checklist not a pill (${shot.check.w}x${shot.check.h})`);
  }
  if (shot.langCheck > 40) errors.push(`landscape: lang overlaps checklist (${shot.langCheck})`);
  if (shot.langPanel > 40) errors.push(`landscape: lang overlaps panel (${shot.langPanel})`);
  if (!tapped.driving && tapped.mode === 'parked') errors.push('landscape: van tap failed');
  return { shot, tapped };
}

async function main() {
  const browser = await launchBrowser(chromium);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: path.join(OUT, 'clips'), size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  await bootPage(page);

  const doors = await doorsAndInput(page, 'phone-390');
  await page.screenshot({ path: path.join(OUT, 'phone-390-doors.png') });
  const fps = await fpsRoutes(page);
  const heading = await headingFlicker(page);
  await page.screenshot({ path: path.join(OUT, 'phone-390-done.png') });
  const video = page.video();
  await context.close();
  if (video) await video.saveAs(path.join(OUT, 'phone-390-r18.webm'));

  const land = await landscape(browser);
  await browser.close();

  const flor = doors.find((d) => d.name === 'flor');
  const mentoria = doors.find((d) => d.name === 'mentoria');
  if (flor && flor.d > 8) errors.push(`flor runtime sit ${flor.d} tiles from door`);
  if (mentoria && mentoria.along < -0.2) errors.push(`mentoria sit behind house along=${mentoria.along}`);

  const report = { base: BASE, errors, notes, doors, fps, heading, land };
  fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ errors, doors: doors.map((d) => ({ n: d.name, d: d.d, along: d.along, sit: d.sit })), out: OUT }, null, 2));
  if (errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
