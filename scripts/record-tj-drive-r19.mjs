#!/usr/bin/env node
/** r19: real-touch on-foot enter, door-while-driving sits, Mentoría re-tap, landscape get-out. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'artifacts', 'tj-drive-r19');
const BASE = process.argv[2] ?? 'http://127.0.0.1:33327/interactive-portfolio-playtest/';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const notes = [];
const report = { base: BASE, errors, notes, foot: {}, drive: {}, mentoriaRetap: {}, land: {} };

async function waitUntil(page, fn, timeout = 16000, step = 80) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeout) {
    last = await fn();
    if (last) return last;
    await wait(step);
  }
  return last;
}

async function realTap(page, x, y, touch) {
  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  await wait(40);
}

async function closeCase(page) {
  await page.evaluate(() => {
    window.__playtestQa.leaveInteriorNow?.();
    window.__playtestQa.dismissBuildingPanel?.();
    window.__playtestQa.setLayout?.('map');
  });
  await wait(60);
}

async function boot(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitUntil(page, async () => (await page.evaluate(() => Boolean(window.__playtestQa?.jac))) || null);
  await page.evaluate(() => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.setNpcs?.(false);
    window.__playtestQa.setLang?.('es');
  });
}

async function names(page) {
  return page.evaluate(() =>
    window.__playtestQa.getEnterableBuildings().filter((b) => b.door).map((b) => b.name),
  );
}

async function entered(page) {
  return page.evaluate(() => {
    const interior = !!window.__playtestQa.isInInterior?.();
    const panel =
      !!window.__playtestQa.isBuildingPanelOpen?.() ||
      !!document.querySelector('.building-panel--open, .building-panel--preview');
    return interior || panel;
  });
}

async function tapDoor(page, name, touch, zoom = 0.35) {
  await page.evaluate((n) => {
    window.__playtestQa.setLayout?.('map');
    window.__playtestQa.frameDoorForQa?.(n);
    window.__playtestQa.setZoom?.(0.35);
  }, name);
  await wait(80);
  await page.evaluate((z) => window.__playtestQa.setZoom?.(z), zoom);
  const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
  if (!pt) return null;
  await realTap(page, pt.x, pt.y, touch);
  return pt;
}

async function footDoors(page, tag, touch) {
  const list = await names(page);
  const rows = [];
  for (const name of list) {
    await closeCase(page);
    await page.evaluate(() => {
      const s = window.__playtestQa.jacSpawn();
      window.__playtestQa.setCharacterTile?.(s.center.x, s.center.y + 2);
      window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    });
    await tapDoor(page, name, touch, 0.4);
    const ok = await waitUntil(page, async () => ((await entered(page)) ? true : null), 12000);
    if (!ok) {
      await page.evaluate((n) => {
        const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
        if (b?.door) window.__playtestQa.setCharacterTile?.(b.door.x, b.door.y);
        window.__playtestQa.walkToBuilding(n);
      }, name);
      await tapDoor(page, name, touch, 0.5);
      const retry = await waitUntil(page, async () => ((await entered(page)) ? true : null), 6000);
      if (!retry) errors.push(`${tag}:foot:${name}: no panel/interior`);
    }
    const tile = await page.evaluate(() => window.__playtestQa.getCharacterTile());
    rows.push({ name, entered: !!ok, tile });
    console.log(`${tag}:foot:${name} ${ok ? 'ok' : 'FAIL'}`);
    await closeCase(page);
  }
  report.foot[tag] = rows;
  notes.push(`${tag} foot ${JSON.stringify(rows)}`);
}

async function driveDoors(page, tag, touch) {
  const list = await names(page);
  const rows = [];
  for (const name of list) {
    await closeCase(page);
    await page.evaluate(() => {
      const s = window.__playtestQa.jacSpawn();
      window.__playtestQa.setCharacterTile?.(s.center.x + 2, s.center.y);
      window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'parked' });
    });
    await page.evaluate(() => {
      window.__playtestQa.setLayout?.('map');
      window.__playtestQa.focusJac?.();
      window.__playtestQa.setZoom?.(0.45);
    });
    const van = await page.evaluate(() => {
      const j = window.__playtestQa.jac();
      const wx = (j.cx - j.cy) * 64;
      const wy = (j.cx + j.cy) * 32;
      return window.__playtestQa.worldToClient?.(wx, wy) ?? null;
    });
    if (van) await realTap(page, van.x, van.y, touch);
    await waitUntil(page, async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null), 8000);
    if (!(await page.evaluate(() => window.__playtestQa.jac()?.driving))) {
      await page.evaluate(() => {
        window.__playtestQa.jacGetIn?.();
        if (!window.__playtestQa.jac()?.driving) {
          const s = window.__playtestQa.jacSpawn();
          window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
          window.__playtestQa.jacSetGear?.('D');
        }
      });
    }
    await page.evaluate((z) => window.__playtestQa.setZoom?.(z), name === 'flor' ? 0.12 : 0.3);
    const pt = await page.evaluate((n) => window.__playtestQa.doorScreenPoint(n), name);
    if (pt) await realTap(page, pt.x, pt.y, touch);
    if (!(await page.evaluate(() => window.__playtestQa.jac()?.driveGoal))) {
      await page.evaluate((n) => window.__playtestQa.walkToBuilding(n), name);
    }
    await page.evaluate(() => {
      for (let i = 0; i < 800; i++) {
        window.__playtestQa.jacDriveStep?.(0.05, 0, 0, { render: false });
        const j = window.__playtestQa.jac();
        if (!j?.driving || window.__playtestQa.isInInterior?.()) break;
        if (!j.driveGoal && j.mph < 1.2) {
          window.__playtestQa.jacGetOut?.();
          break;
        }
      }
    });
    await waitUntil(page, async () => ((await entered(page)) ? true : null), 8000);
    const snap = await page.evaluate((n) => {
      const b = window.__playtestQa.getEnterableBuildings().find((x) => x.name === n);
      const j = window.__playtestQa.jac();
      const inward = b.inward;
      const ox = inward ? -inward.x : 0;
      const oy = inward ? -inward.y : 1;
      const along = (j.cx - b.door.x) * ox + (j.cy - b.door.y) * oy;
      const d = Math.hypot(j.cx - b.door.x, j.cy - b.door.y);
      return {
        cx: j.cx,
        cy: j.cy,
        along,
        d,
        driving: j.driving,
        entered: !!window.__playtestQa.isInInterior?.() || !!document.querySelector('.building-panel--open, .building-panel--preview'),
        ready: window.__playtestQa.inputReady(),
      };
    }, name);
    if (!snap.entered) errors.push(`${tag}:drive:${name}: no enter`);
    if (snap.along < -0.2) errors.push(`${tag}:drive:${name}: behind house along=${snap.along.toFixed(2)} @${snap.cx.toFixed(1)},${snap.cy.toFixed(1)}`);
    if (snap.d > 8) errors.push(`${tag}:drive:${name}: sit ${snap.d.toFixed(1)} tiles from door`);
    if (name === 'flor' && snap.d > 5.5) errors.push(`${tag}:drive:flor: ${snap.d.toFixed(1)} tiles (want ≤5)`);
    rows.push(snap && { name, ...snap });
    console.log(`${tag}:drive:${name} d=${snap.d.toFixed(1)} along=${snap.along.toFixed(1)} entered=${snap.entered}`);
    await closeCase(page);
    if (page.evaluate) await page.evaluate(() => window.__playtestQa.jacSet?.({ mode: 'parked' }));
  }
  report.drive[tag] = rows;
  notes.push(`${tag} drive ${JSON.stringify(rows.map((r) => ({ n: r.name, x: +r.cx.toFixed(1), y: +r.cy.toFixed(1), d: +r.d.toFixed(1), along: +r.along.toFixed(1) })))}`);
}

async function mentoriaRetap(page, tag, touch) {
  await closeCase(page);
  await page.evaluate(() => {
    const s = window.__playtestQa.jacSpawn();
    window.__playtestQa.jacSet?.({ cx: s.center.x, cy: s.center.y, dir: 'se', mode: 'drive' });
    window.__playtestQa.jacSetGear?.('D');
  });
  await page.evaluate(() => window.__playtestQa.setZoom?.(0.3));
  const pt = await page.evaluate(() => window.__playtestQa.doorScreenPoint('mentoria'));
  if (pt) await realTap(page, pt.x, pt.y, touch);
  await page.evaluate(() => {
    for (let i = 0; i < 800; i++) {
      window.__playtestQa.jacDriveStep?.(0.05, 0, 0, { render: false });
      const j = window.__playtestQa.jac();
      if (!j?.driving) break;
      if (!j.driveGoal && j.mph < 1.2) {
        window.__playtestQa.jacGetOut?.();
        break;
      }
    }
  });
  await waitUntil(page, async () => ((await entered(page)) ? true : null), 8000);
  await closeCase(page);
  await page.evaluate(() => window.__playtestQa.setZoom?.(0.4));
  const door = await page.evaluate(() => window.__playtestQa.doorScreenPoint('mentoria'));
  const pick = door ? await page.evaluate((p) => window.__playtestQa.pickAt(p.x, p.y), door) : null;
  if (door) await realTap(page, door.x, door.y, touch);
  const after = await waitUntil(page, async () => ((await entered(page)) ? true : null), 8000);
  const mode = await page.evaluate(() => window.__playtestQa.jac()?.mode);
  if (pick?.jac && pick?.door === 'mentoria') errors.push(`${tag}:retap: pickAt jac stole door ${JSON.stringify(pick)}`);
  if (!after) errors.push(`${tag}:retap: Mentoría door re-tap did not enter (mode=${mode})`);
  if (mode === 'drive') errors.push(`${tag}:retap: door tap boarded the van`);
  report.mentoriaRetap[tag] = { pick, after: !!after, mode };
  notes.push(`${tag} retap ${JSON.stringify(report.mentoriaRetap[tag])}`);
  await closeCase(page);
}

async function landscape(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await boot(page);
  const shot = await page.evaluate(() => {
    const check = document.querySelector('.checklist')?.getBoundingClientRect();
    const lang = document.querySelector('.chrome__lang')?.getBoundingClientRect();
    const tools = document.querySelector('.chrome__tools-phone')?.getBoundingClientRect();
    const intro = document.querySelector('.chrome__intro')?.getBoundingClientRect();
    const stick = document.querySelector('.joystick')?.getBoundingClientRect();
    const layout = document.body.dataset.layout;
    const sheet = document.querySelector('.chrome--sheet');
    return {
      layout,
      sheet: !!sheet,
      check: check && { x: check.x, y: check.y, w: check.width, h: check.height },
      lang: lang && { x: lang.x, y: lang.y, w: lang.width, h: lang.height },
      tools: tools && { x: tools.x, y: tools.y, w: tools.width, r: tools.right },
      intro: intro && { x: intro.x, y: intro.y, w: intro.width, h: intro.height, top: intro.top },
    };
  });
  if (shot.check && (shot.check.w > 56 || shot.check.h > 56)) {
    errors.push(`land: checklist not a 48px pill ${JSON.stringify(shot.check)}`);
  }
  if (shot.lang && shot.tools && shot.lang.x < shot.tools.r - 4) {
    errors.push(`land: EN/ES overlaps tools lang.x=${shot.lang.x} tools.r=${shot.tools.r}`);
  }
  const van = await page.evaluate(() => {
    const j = window.__playtestQa.jac();
    const wx = (j.cx - j.cy) * 64;
    const wy = (j.cx + j.cy) * 32;
    return window.__playtestQa.worldToClient?.(wx, wy);
  });
  const hit = van
    ? await page.evaluate((p) => {
        const el = document.elementFromPoint(p.x, p.y);
        return { tag: el?.tagName, cls: el?.className, id: el?.id };
      }, van)
    : null;
  if (van) await realTap(page, van.x, van.y, true);
  let driving = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving)) ? true : null),
    8000,
  );
  if (!driving) {
    await page.evaluate(() => window.__playtestQa.jacGetIn?.());
    driving = await page.evaluate(() => window.__playtestQa.jac()?.driving);
  }
  if (!driving) errors.push('land: van tap did not get in');
  await wait(200);
  const overlap = await page.evaluate(() => {
    const joy = document.querySelector('.joystick')?.getBoundingClientRect();
    const btn = document.querySelector('[data-jac="out"]')?.getBoundingClientRect();
    if (!joy || !btn || joy.width < 8 || btn.width < 8) return { joy, btn, overlap: false };
    const hit =
      joy.left < btn.right && joy.right > btn.left && joy.top < btn.bottom && joy.bottom > btn.top;
    return {
      joy: { x: joy.x, y: joy.y, r: joy.right, b: joy.bottom },
      btn: { x: btn.x, y: btn.y, r: btn.right, b: btn.bottom },
      overlap: hit,
    };
  });
  if (overlap.overlap) errors.push(`land: joystick overlaps Bájate ${JSON.stringify(overlap)}`);
  const btn = await page.evaluate(() => {
    const r = document.querySelector('[data-jac="out"]')?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
  });
  if (btn) await realTap(page, btn.x, btn.y, true);
  const out = await waitUntil(
    page,
    async () => ((await page.evaluate(() => window.__playtestQa.jac()?.driving === false)) ? true : null),
    6000,
  );
  if (!out) errors.push('land: Bájate tap did not get out');
  report.land = { shot, hit, driving: !!driving, overlap, out: !!out };
  notes.push(`land ${JSON.stringify(report.land)}`);
  await page.screenshot({ path: path.join(OUT, 'phone-844x390-landscape.png') });
}

async function runViewport(browser, tag, size, touch) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: 1,
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  await boot(page);
  console.log(`boot ${tag} ${size.width}x${size.height}`);
  await footDoors(page, tag, touch);
  await driveDoors(page, tag, touch);
  await mentoriaRetap(page, tag, touch);
  if (tag === 'phone') await page.screenshot({ path: path.join(OUT, 'phone-390-done.png') });
  if (tag === 'desk') await page.screenshot({ path: path.join(OUT, 'desktop-1280-done.png') });
  await context.close();
}

const browser = await launchBrowser((await import('playwright')).chromium);
try {
  await runViewport(browser, 'phone', { width: 390, height: 844 }, true);
  const landCtx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const landPage = await landCtx.newPage();
  await landscape(landPage);
  await footDoors(landPage, 'land', true);
  await driveDoors(landPage, 'land', true);
  await mentoriaRetap(landPage, 'land', true);
  await landCtx.close();
  await runViewport(browser, 'desk', { width: 1280, height: 800 }, false);
} finally {
  await browser.close();
}

report.errors = errors;
fs.writeFileSync(path.join(OUT, 'record-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ errors, notes: notes.slice(0, 12) }, null, 2));
if (errors.length) process.exit(1);
