/**
 * Run #38 real-input suite, shared by Chromium (phone + desktop) and WebKit (iPhone emulation):
 * single-tap exit on the mat / door gap / Salir in all 9 rooms (≤150 ms until the map
 * accepts input, or ≤6 frames on a slow renderer), then a cheap re-enter,
 * floor walks, interior camera lock,
 * door entry only on arrival, and near-edge taps.
 */
import { chromium, webkit, devices } from 'playwright';
import { launchBrowser, waitForBuildingPanelSettled } from './qa-ready.mjs';
import { ciContextOptions } from './qa-ci.mjs';
import { armExitTimer, readExitTimer, exitIsImmediate, describeExit } from './qa-exit-timer.mjs';

const ROOMS = (process.env.R38_ROOMS ? process.env.R38_ROOMS.split(',') : ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg', 'sambil', 'catedral', 'flor']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const RUN38_KINDS = {
  'chromium-phone': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    touch: true,
  },
  'chromium-desktop': {
    type: chromium,
    options: { viewport: { width: 1280, height: 800 } },
    touch: false,
  },
  'webkit-iphone': {
    type: webkit,
    options: { ...devices['iPhone 13'] },
    touch: true,
  },
};

async function tapAt(page, kind, x, y) {
  if (RUN38_KINDS[kind].touch) {
    await page.touchscreen.tap(Math.round(x), Math.round(y));
    return;
  }
  const inInterior = await page.evaluate(() => window.__playtestQa?.isInInterior?.() === true);
  if (inInterior) {
    await page.evaluate(
      ([cx, cy]) => window.__playtestQa.tapScreen(cx, cy, false),
      [x, y],
    );
    return;
  }
  await page.mouse.click(Math.round(x), Math.round(y));
}

async function ensureOnMap(page) {
  if (await page.evaluate(() => !window.__playtestQa?.isInInterior?.())) return;
  await page.evaluate(() => window.__playtestQa.exitInterior());
  await page.waitForFunction(() => !window.__playtestQa?.isInInterior?.(), null, { timeout: 15000 });
}

async function openMapOnce(page, base) {
  const ready = await page
    .evaluate(() => window.__playtestQa?.playerAvatar?.()?.loaded === true)
    .catch(() => false);
  if (!ready) {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    return;
  }
  await ensureOnMap(page);
}

async function enterRoomOnPage(page, name) {
  await ensureOnMap(page);
  await page.evaluate((n) => window.__playtestQa.enterInterior(n), name);
  await page.waitForFunction(() => window.__playtestQa.isInInterior() === true, null, { timeout: 20000 });
  await page.waitForFunction(
    () => {
      if (!window.__playtestQa.isInInterior()) return false;
      const walk = window.__playtestQa.interiorLayout()?.walkable?.length ?? 0;
      if (walk > 0) return true;
      return !window.__playtestQa.isBuildingPanelOpen?.();
    },
    null,
    { timeout: 15000 },
  );
  await waitForBuildingPanelSettled(page);
}

async function mapAcceptsInput(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas || window.__playtestQa?.isBuildingPanelOpen?.()) return false;
    const r = canvas.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.4);
    return hit === canvas || canvas.contains(hit) || !!hit?.closest?.('#game-canvas');
  });
}

const inInterior = (page) => page.evaluate(() => window.__playtestQa?.isInInterior?.() === true);
const charTile = (page) => page.evaluate(() => window.__playtestQa?.interiorCharTile?.());
const tilePoint = (page, x, y) =>
  page.evaluate(([a, b]) => window.__playtestQa?.interiorTileScreenPoint?.(a, b), [x, y]);

async function waitForChar(page, tx, ty, maxMs = 9000) {
  try {
    await page.waitForFunction(
      ([x, y]) => {
        const at = window.__playtestQa?.interiorCharTile?.();
        return at?.x === x && at?.y === y;
      },
      [tx, ty],
      { timeout: maxMs },
    );
    return true;
  } catch {
    return false;
  }
}

async function waitLeftRoom(page, maxMs = 10000) {
  try {
    await page.waitForFunction(() => !window.__playtestQa?.isInInterior?.(), null, { timeout: maxMs });
    return true;
  } catch {
    return false;
  }
}

/** Walkable tiles connected to the character (some corners of Catedral are enclosed islands). */
async function reachableTiles(page, layout) {
  const start = await charTile(page);
  const key = (x, y) => `${x},${y}`;
  const walk = new Set(layout.walkable.map((t) => key(t.x, t.y)));
  const seen = new Set([key(start.x, start.y)]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c.x + dx, c.y + dy);
      if (walk.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return layout.walkable.filter((t) => seen.has(key(t.x, t.y)));
}

/** Real tap on a far floor tile so the exit tap has to walk. Returns the layout. */
async function standFarFromExit(page, kind, errors, tag) {
  const layout = await page.evaluate(() => window.__playtestQa?.interiorLayout?.());
  if (!layout) {
    errors.push(`${tag}: no interior layout`);
    return null;
  }
  const reach = await reachableTiles(page, layout);
  const dist = (t) => Math.abs(t.x - layout.exit.x) + Math.abs(t.y - layout.exit.y);
  const far = [...reach].sort((a, b) => dist(b) - dist(a))[0];
  const pt = await tilePoint(page, far.x, far.y);
  await tapAt(page, kind, pt.x, pt.y);
  if (!(await waitForChar(page, far.x, far.y))) {
    errors.push(`${tag}: could not walk to far tile ${far.x},${far.y}`);
    return null;
  }
  return { layout, far };
}

async function assertReenter(page, name, tag, errors) {
  await page.evaluate((n) => window.__playtestQa.enterInterior(n), name);
  try {
    await page.waitForFunction(
      () => window.__playtestQa.isInInterior() === true && window.__playtestQa.isBuildingPanelOpen() === true,
      null,
      { timeout: 8000 },
    );
  } catch {
    errors.push(`${tag}: re-enter did not open the sheet`);
    return;
  }
  const title = await page.evaluate(() => document.querySelector('.building-panel--open .building-panel__title')?.textContent?.trim());
  if (!title) errors.push(`${tag}: re-enter sheet has no title`);
}

async function testExitSingleTap(ctx, kind, base, errors) {
  const page = await ctx.newPage();
  try {
    await openMapOnce(page, base);
    for (const name of ROOMS) {
      for (const target of ['mat', 'gap']) {
        const tag = `run38-${kind}-exit-${target}-${name}`;
        await enterRoomOnPage(page, name);
        if (!(await inInterior(page))) {
          errors.push(`${tag}: room did not open`);
          continue;
        }
        const st = await standFarFromExit(page, kind, errors, tag);
        if (!st) continue;
        const { layout } = st;
        const gap = target === 'mat' ? 0 : 0.8;
        const pt =
          layout.exitFace === '+x'
            ? await tilePoint(page, layout.exit.x + gap, layout.exit.y)
            : await tilePoint(page, layout.exit.x, layout.exit.y + gap);
        await armExitTimer(page);
        await tapAt(page, kind, pt.x, pt.y);
        const r = await readExitTimer(page, 8000);
        if (!r) {
          errors.push(`${tag}: one tap on the ${target} from the far tile did not exit`);
        } else if (!exitIsImmediate(r)) {
          errors.push(`${tag}: exit was not immediate (${describeExit(r)}, want ≤150 ms or ≤6 frames)`);
        } else {
          await assertReenter(page, name, tag, errors);
        }
      }
    }
  } finally {
    await page.close();
  }
}

async function testExitSalir(ctx, kind, base, errors) {
  const page = await ctx.newPage();
  try {
    await openMapOnce(page, base);
    for (const name of ROOMS) {
    const tag = `run38-${kind}-exit-salir-${name}`;
      await enterRoomOnPage(page, name);
      if (!(await inInterior(page))) {
        errors.push(`${tag}: room did not open`);
        continue;
      }
      await waitForBuildingPanelSettled(page);
      const isPreview = await page.evaluate(() => window.__playtestQa?.isCasePreview?.() === true);
      if (isPreview) {
        const close = page.locator('.building-panel--preview .case-preview__x').first();
        await close.waitFor({ state: 'visible', timeout: 10000 });
        await close.click();
        await wait(300);
        if (!(await mapAcceptsInput(page))) {
          errors.push(`${tag}: preview × did not return map input`);
        } else {
          await ensureOnMap(page);
          await assertReenter(page, name, `${tag}-preview-x`, errors);
        }
        await enterRoomOnPage(page, name);
        await page.keyboard.press('Escape');
        await wait(300);
        if (!(await mapAcceptsInput(page))) {
          errors.push(`${tag}: preview Esc did not return map input`);
        } else {
          await ensureOnMap(page);
          await assertReenter(page, name, `${tag}-preview-esc`, errors);
        }
        continue;
      }
      const exitVisible = await page
        .locator('.building-panel--open [data-exit]')
        .first()
        .isVisible()
        .catch(() => false);
      if (!exitVisible) {
        errors.push(`${tag}: Salir not visible and not a case preview`);
        continue;
      }
      await armExitTimer(page);
      const exit = page.locator('.building-panel [data-exit]').first();
      if (RUN38_KINDS[kind].touch) {
        const box = await exit.boundingBox();
        if (!box) {
          errors.push(`${tag}: Salir has no box`);
          continue;
        }
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        await page.evaluate(([cx, cy]) => {
          const el = document.elementFromPoint(cx, cy)?.closest('[data-exit]') || document.querySelector('.building-panel [data-exit]');
          const extra = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, pointerId: 11, pointerType: 'touch', isPrimary: true };
          el.dispatchEvent(new PointerEvent('pointerdown', extra));
          el.dispatchEvent(new PointerEvent('pointerup', extra));
        }, [x, y]);
      } else {
        await exit.click();
      }
      const r = await readExitTimer(page);
      if (!r) {
        errors.push(`${tag}: Salir did not leave`);
      } else if (!exitIsImmediate(r)) {
        errors.push(`${tag}: Salir was not immediate (${describeExit(r)}, want ≤150 ms or ≤6 frames)`);
      } else {
        await assertReenter(page, name, tag, errors);
      }
    }
  } finally {
    await page.close();
  }
}

async function testExitNeighboursDoNotExit(ctx, kind, base, errors) {
  const page = await ctx.newPage();
  try {
    await openMapOnce(page, base);
    for (const name of ROOMS) {
    const tag = `run38-${kind}-exit-neighbour-${name}`;
      await enterRoomOnPage(page, name);
      const layout = await page.evaluate(() => window.__playtestQa?.interiorLayout?.());
      if (!layout) {
        errors.push(`${tag}: no layout`);
        continue;
      }
      const { exit } = layout;
      const neighbours = [
        { x: exit.x - 1, y: exit.y },
        { x: exit.x + 1, y: exit.y },
        { x: exit.x, y: exit.y - 1 },
      ].filter((n) => layout.walkable.some((w) => w.x === n.x && w.y === n.y));
      const reach = await reachableTiles(page, layout);
      neighbours.splice(0, neighbours.length, ...neighbours.filter((n) => reach.some((w) => w.x === n.x && w.y === n.y)));
      for (const n of neighbours) {
        const pt = await tilePoint(page, n.x, n.y);
        await tapAt(page, kind, pt.x, pt.y);
        if (!(await waitForChar(page, n.x, n.y, 6000))) {
          errors.push(`${tag}: tap on neighbour ${n.x},${n.y} did not walk there`);
        }
        if (!(await inInterior(page))) {
          errors.push(`${tag}: tapping floor next to the exit (${n.x},${n.y}) left the room`);
          break;
        }
      }
    }
  } finally {
    await page.close();
  }
}

async function testFloorWalks(ctx, kind, base, errors) {
  const page = await ctx.newPage();
  try {
    await openMapOnce(page, base);
    for (const name of ROOMS) {
    const tag = `run38-${kind}-walk-${name}`;
      await enterRoomOnPage(page, name);
      const layout = await page.evaluate(() => window.__playtestQa?.interiorLayout?.());
      if (!layout) {
        errors.push(`${tag}: no layout`);
        continue;
      }
      const reach = await reachableTiles(page, layout);
      const floor = reach.filter((t) => !(t.x === layout.exit.x && t.y === layout.exit.y));
      const picks = [0.2, 0.55, 0.9].map((f) => floor[Math.min(floor.length - 1, Math.floor(floor.length * f))]);
      for (const t of picks) {
        const pt = await tilePoint(page, t.x, t.y);
        await tapAt(page, kind, pt.x, pt.y);
        if (!(await waitForChar(page, t.x, t.y))) {
          errors.push(`${tag}: tap on ${t.x},${t.y} did not arrive (${JSON.stringify(await charTile(page))})`);
        }
        if (!(await inInterior(page))) {
          errors.push(`${tag}: floor tap on ${t.x},${t.y} left the room`);
          break;
        }
      }
    }
  } finally {
    await page.close();
  }
}

async function readBoxes(page) {
  return page.evaluate(() => {
    const d = document.getElementById('game-canvas')?.dataset ?? {};
    return {
      box: d.interiorBox ? JSON.parse(d.interiorBox) : null,
      free: d.interiorFree ? JSON.parse(d.interiorFree) : null,
      cam: [Number(d.camX), Number(d.camY)],
    };
  });
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await wait(250);
}

async function testInteriorCameraLock(ctx, kind, base, errors) {
  const page = await ctx.newPage();
  try {
    await openMapOnce(page, base);
    for (const name of ROOMS) {
    const tag = `run38-${kind}-camlock-${name}`;
      await enterRoomOnPage(page, name);
      const vp = page.viewportSize();
      const start = { x: Math.round(vp.width * 0.5), y: Math.round(vp.height * 0.5) };
      const before = await readBoxes(page);
      if (!before.box || !before.free) {
        errors.push(`${tag}: interior camera data missing`);
        continue;
      }
      for (const d of [
        { x: -260, y: -180 },
        { x: 260, y: 200 },
        { x: -200, y: 220 },
      ]) {
        await drag(page, start, { x: start.x + d.x, y: start.y + d.y });
      }
      const after = await readBoxes(page);
      const shift = Math.hypot(after.cam[0] - before.cam[0], after.cam[1] - before.cam[1]);
      if (shift > 0.5) errors.push(`${tag}: dragging moved the room camera (${shift.toFixed(1)} world px)`);
      if (!(await inInterior(page))) errors.push(`${tag}: dragging left the room`);

      await page.evaluate(() => window.__playtestQa?.setZoom?.(1.1));
      await wait(300);
      const reach = Math.round(vp.width * 0.45);
      const reachY = Math.round(vp.height * 0.3);
      for (const d of [
        { x: reach, y: reachY },
        { x: -reach, y: -reachY },
        { x: reach, y: -reachY },
        { x: -reach, y: reachY },
        { x: -reach, y: 0 },
      ]) {
        for (let k = 0; k < 3; k++) await drag(page, start, { x: start.x + d.x, y: start.y + d.y });
        const z = await readBoxes(page);
        const b = z.box;
        const f = z.free;
        const tol = 1.5;
        if (b && f) {
          const wide = b.r - b.l > f.r - f.l;
          const tall = b.b - b.t > f.b - f.t;
          if (wide && (b.l > f.l + tol || b.r < f.r - tol)) {
            errors.push(`${tag}: zoomed pan shows void horizontally (box ${Math.round(b.l)}..${Math.round(b.r)}, free ${Math.round(f.l)}..${Math.round(f.r)})`);
            break;
          }
          if (tall && (b.t > f.t + tol || b.b < f.b - tol)) {
            errors.push(`${tag}: zoomed pan shows void vertically (box ${Math.round(b.t)}..${Math.round(b.b)}, free ${Math.round(f.t)}..${Math.round(f.b)})`);
            break;
          }
          if (!wide && Math.abs((b.l + b.r) / 2 - (f.l + f.r) / 2) > tol) {
            errors.push(`${tag}: room narrower than the free area drifted off-center`);
            break;
          }
        }
      }
    }
  } finally {
    await page.close();
  }
}

async function testDoorEntryOnArrival(ctx, kind, base, errors) {
  const tag = `run38-${kind}-door`;
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    await page.evaluate(() => {
      window.__playtestQa?.setCharacterTile?.(35, 36);
      window.__playtestQa?.frameDoorForQa?.('volaris');
    });
    await wait(600);
    const pt = await page.evaluate(() => window.__playtestQa?.doorScreenPoint?.('volaris'));
    if (!pt) {
      errors.push(`${tag}: no door screen point`);
      return;
    }
    await tapAt(page, kind, pt.x, pt.y);
    await wait(120);
    const caseOpen = () => page.evaluate(() => window.__playtestQa.isBuildingPanelOpen() === true);
    if (await inInterior(page)) errors.push(`${tag}: entered the building instantly without walking`);
    if (await caseOpen()) errors.push(`${tag}: case preview opened instantly without walking`);
    let entered = false;
    for (let i = 0; i < 70 && !entered; i++) {
      entered = (await inInterior(page)) || (await caseOpen());
      if (!entered) await wait(150);
    }
    if (!entered) errors.push(`${tag}: door tap never entered after walking`);
  } finally {
    await page.close();
  }
}

async function testNearTaps(ctx, kind, base, errors) {
  const tag = `run38-${kind}-neartap`;
  const page = await ctx.newPage();
  const toast = () =>
    page.evaluate(() => document.getElementById('playtest-toast')?.classList.contains('playtest-toast--visible') ?? false);
  try {
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
    await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(20, 20));
    await wait(300);
    await page.evaluate(() => window.__playtestQa?.tapMapTile?.(-2, 30));
    await wait(300);
    const goal = await page.evaluate(() => document.getElementById('game-canvas')?.dataset.walkGoal ?? '');
    if (!goal) errors.push(`${tag}: tap just past the map edge did not walk anywhere`);
    if (await toast()) errors.push(`${tag}: tap just past the map edge raised 'No se puede llegar'`);
    await page.evaluate(() => window.__playtestQa?.tapMapTile?.(-40, 30));
    await wait(300);
    if (!(await toast())) errors.push(`${tag}: far-off tap gave no feedback`);
    const goal2 = await page.evaluate(() => document.getElementById('game-canvas')?.dataset.walkGoal ?? '');
    if (goal2) errors.push(`${tag}: far-off tap left a stale walk goal ${goal2}`);

    await page.evaluate(() => window.__playtestQa?.setCharacterTile?.(20, 20));
    await wait(300);
    await page.evaluate(() => window.__playtestQa?.tapMapTile?.(11, 14));
    await wait(150);
    if (await inInterior(page)) errors.push(`${tag}: Catedral body tap entered without walking`);
    let entered = false;
    for (let i = 0; i < 80 && !entered; i++) {
      entered = await inInterior(page);
      if (!entered) await wait(150);
    }
    if (!entered) errors.push(`${tag}: Catedral body tap never entered on arrival`);
  } finally {
    await page.close();
  }
}

/**
 * @param {{ kind: keyof typeof RUN38_KINDS, base: string, errors: string[], only?: string[] }} args
 */
export async function runRun38InputSuite({ kind, base, errors, only }) {
  const spec = RUN38_KINDS[kind];
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(ciContextOptions(spec.options));
  const want = (n) => !only || only.includes(n);
  try {
    if (want('exit')) {
      await testExitSingleTap(ctx, kind, base, errors);
      await testExitSalir(ctx, kind, base, errors);
    }
    if (want('neighbours')) await testExitNeighboursDoNotExit(ctx, kind, base, errors);
    if (want('walk')) await testFloorWalks(ctx, kind, base, errors);
    if (want('camlock')) await testInteriorCameraLock(ctx, kind, base, errors);
    if (want('door')) await testDoorEntryOnArrival(ctx, kind, base, errors);
    if (kind === 'chromium-desktop' && want('near')) await testNearTaps(ctx, kind, base, errors);
  } finally {
    await ctx.close();
    await browser.close();
  }
}
