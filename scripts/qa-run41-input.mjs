/**
 * Run #41 real-input checks (deploy gate):
 *  - keyboard: walk with arrows / WASD onto two building doors and step through them (no taps),
 *    leave each room by walking onto the mat, and Enter next to a third door walks in
 *  - wheel: plain wheel / two-finger scroll pans in the scroll direction without zooming;
 *    ctrl+wheel (trackpad pinch) and cmd+wheel zoom anchored on the cursor
 *  - Sambil / Flor interiors: a tap on furniture walks to the nearest reachable floor cell,
 *    and long walks are a few straight segments instead of a grid staircase
 */
import { chromium, webkit } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const RUN41_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, touch: false },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, touch: false },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    touch: true,
  },
};

const ARROWS = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const WASD = { '1,0': 'd', '-1,0': 'a', '0,1': 's', '0,-1': 'w' };

const qa = (page, fn, arg) => page.evaluate(fn, arg);
const inInterior = (page) => qa(page, () => window.__playtestQa.isInInterior() === true);

async function waitFor(page, pred, maxMs) {
  for (let t = 0; t < maxMs; t += 100) {
    if (await pred()) return true;
    await wait(100);
  }
  return false;
}

/**
 * Walks the character to `goal` with held keys only: follows `findPath` one straight run at a time
 * and re-plans after every run, so a key released a frame late never derails the walk.
 * Returns '' on arrival, otherwise why it gave up (for the failure message).
 */
async function keyWalkTo(page, goal, keys, maxMs = 120000) {
  const t0 = Date.now();
  let stuck = 0;
  let last = '';
  const trace = [];
  const traced = (why) => `${why}; ${frameMs.toFixed(0)} ms/frame; last steps: ${trace.slice(-10).join(' | ')}`;
  for (const k of Object.values(keys)) await page.keyboard.up(k);
  const frameMs = await qa(
    page,
    () =>
      new Promise((r) => {
        let n = 0;
        const t = performance.now();
        const f = () => (++n === 8 ? r((performance.now() - t) / 8) : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
  );
  while (Date.now() - t0 < maxMs) {
    const { at, pos, path, room } = await qa(
      page,
      (g) => {
        const q = window.__playtestQa;
        const t = q.getCharacterTile();
        return { at: t, pos: q.getCharacterPos(), path: q.findPath(t.x, t.y, g.x, g.y), room: q.getInteriorId() };
      },
      goal,
    );
    if (at.x === goal.x && at.y === goal.y) return '';
    if (room) return traced(`walked into ${room} on the way (at ${at.x},${at.y})`);
    const here = `${at.x},${at.y}`;
    stuck = here === last ? stuck + 1 : 0;
    last = here;
    const where = `at ${here} (${pos.x.toFixed(2)},${pos.y.toFixed(2)}) after ${((Date.now() - t0) / 1000).toFixed(1)} s`;
    if (stuck >= 8) return traced(`no progress ${where}`);
    if (!path?.length) return traced(`no path ${where}`);
    const d = { x: path[0].x - at.x, y: path[0].y - at.y };
    let n = 0;
    while (n < path.length && path[n].x - (n ? path[n - 1].x : at.x) === d.x && path[n].y - (n ? path[n - 1].y : at.y) === d.y) n++;
    const end = path[n - 1];
    const key = keys[`${d.x},${d.y}`];
    if (!key) return traced(`no key for step ${d.x},${d.y} ${where}`);
    trace.push(`${pos.x.toFixed(2)},${pos.y.toFixed(2)} ${key}x${n}->${end.x},${end.y} @${((Date.now() - t0) / 1000).toFixed(1)}s`);
    const axis = d.x ? 'x' : 'y';
    const dir = d.x || d.y;
    const slow = frameMs > 50;
    // Hold the key to a few tiles out, then nudge into the goal tile with fixed-length holds. A
    // release sent after seeing the move lands 2-3 frames late on software-GL runners (~0.45 tile
    // per frame), which oscillates around a corner; a timed down/up pair moves at most 1-2 frames.
    if (n > 1) {
      await page.keyboard.down(key);
      await page
        .waitForFunction(
          ([e, ax, dr, m]) => (window.__playtestQa.getCharacterPos()[ax] - e[ax]) * dr > -m,
          [end, axis, dir, slow ? 2.2 : 1.0],
          { polling: 'raf', timeout: 2000 + n * 1000 },
        )
        .catch(() => {});
      await page.keyboard.up(key);
      await wait(slow ? frameMs * 3 : 80);
    }
    let gap = 0;
    for (let i = 0; i < 24; i++) {
      const p0 = await qa(page, () => window.__playtestQa.getCharacterPos());
      const remaining = (end[axis] - p0[axis]) * dir;
      if (Math.round(p0[axis]) === end[axis] || remaining < -0.5) break;
      const tilesPerMs = (0.07 * Math.min(frameMs, 100)) / 16 / frameMs;
      gap = gap || (slow ? frameMs * 0.6 : Math.min(300, Math.max(8, (0.7 * remaining) / tilesPerMs)));
      await page.keyboard.down(key);
      await wait(gap);
      await page.keyboard.up(key);
      await wait(slow ? frameMs * 3 : 50);
      const p1 = await qa(page, () => window.__playtestQa.getCharacterPos());
      gap = p1.x === p0.x && p1.y === p0.y ? gap * 1.6 : slow ? frameMs * 0.6 : 0;
    }
    await wait(60);
  }
  return traced(`timed out after ${maxMs / 1000} s`);
}

async function testKeyboardEntry(ctx, kind, base, errors, notes) {
  const tag = `run41-${kind}-keys`;
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await wait(900);
    await page.mouse.move(5, 400);
    const buildings = await qa(page, () => window.__playtestQa.getEnterableBuildings().filter((b) => b.panelTitle && b.door && b.inward));
    const start = await qa(page, () => window.__playtestQa.getCharacterTile());
    const len = async (b) =>
      (await qa(page, ([s, d]) => window.__playtestQa.findPath(s.x, s.y, d.x, d.y)?.length ?? 1e9, [start, b.door]));
    const ranked = [];
    for (const b of buildings) ranked.push({ b, n: await len(b) });
    ranked.sort((a, b) => a.n - b.n);
    const targets = ranked.slice(0, 3).map((r) => r.b);
    if (targets.length < 3) {
      errors.push(`${tag}: only ${targets.length} enterable buildings with doors`);
      return;
    }
    const entered = [];
    for (const [i, b] of targets.slice(0, 2).entries()) {
      const keys = i === 0 ? ARROWS : WASD;
      // Approach every door from a few tiles out (the spawn tile is the Estudio door itself).
      const stage = await qa(
        page,
        (bb) => {
          const q = window.__playtestQa;
          for (const k of [5, 4, 3]) {
            for (const lat of [0, 2, -2]) {
              const t = {
                x: bb.door.x - bb.inward.x * k + (bb.inward.x ? 0 : lat),
                y: bb.door.y - bb.inward.y * k + (bb.inward.y ? 0 : lat),
              };
              const n = q.findPath(t.x, t.y, bb.door.x, bb.door.y)?.length ?? 0;
              if (n >= 3) return { ...t, n };
            }
          }
          return null;
        },
        b,
      );
      const awayWhy = stage ? await keyWalkTo(page, stage, keys) : 'no staging tile';
      if (awayWhy) {
        errors.push(`${tag}: could not walk away from the ${b.name} door to approach it: ${awayWhy}`);
        continue;
      }
      const doorWhy = await keyWalkTo(page, b.door, keys);
      if (doorWhy) {
        errors.push(`${tag}: could not walk to the ${b.name} door ${b.door.x},${b.door.y} with the keyboard: ${doorWhy}`);
        continue;
      }
      const inwardKey = keys[`${b.inward.x},${b.inward.y}`];
      // Walking straight at the door enters on arrival; otherwise step toward it from the access tile.
      const onArrival = await waitFor(page, () => inInterior(page), 1500);
      if (!onArrival) {
        await page.keyboard.down(inwardKey);
        await waitFor(page, () => inInterior(page), 2500);
        await page.keyboard.up(inwardKey);
      }
      const id = await qa(page, () => window.__playtestQa.getInteriorId());
      if (id !== b.name) {
        errors.push(`${tag}: walking into the ${b.name} door with ${inwardKey} did not enter (interior ${id})`);
        continue;
      }
      entered.push(`${b.name} (walked ${stage.n} tiles${onArrival ? ', entered on arrival' : `, then ${inwardKey}`})`);
      await wait(700);
      const face = await qa(page, () => window.__playtestQa.interiorLayout().exitFace);
      const outKey = keys[face === '+x' ? '1,0' : '0,1'];
      await page.keyboard.down(outKey);
      const left = await waitFor(page, async () => !(await inInterior(page)), 6000);
      await page.keyboard.up(outKey);
      if (!left) {
        errors.push(`${tag}: holding ${outKey} from the ${b.name} spawn did not walk out through the mat`);
        await qa(page, () => window.__playtestQa.exitInterior());
      }
      await wait(500);
    }

    const third = targets[2];
    const side = await qa(
      page,
      (b) => {
        const q = window.__playtestQa;
        const s = q.getCharacterTile();
        // Facing the door from the tile in front of it: reaching that never steps onto the door.
        const front = { x: b.door.x - b.inward.x, y: b.door.y - b.inward.y };
        const fp = q.findPath(s.x, s.y, front.x, front.y);
        if (fp) return { ...front, n: fp.length };
        let best = null;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const t = { x: b.door.x + dx, y: b.door.y + dy };
          const p = q.findPath(s.x, s.y, t.x, t.y);
          if (p && (!best || p.length < best.n)) best = { ...t, n: p.length };
        }
        return best;
      },
      third,
    );
    const sideWhy = side ? await keyWalkTo(page, side, ARROWS) : 'no free tile next to the door';
    if (sideWhy) {
      errors.push(`${tag}: could not walk next to the ${third.name} door: ${sideWhy}`);
    } else {
      await page.keyboard.press('Enter');
      const ok = await waitFor(page, () => inInterior(page), 5000);
      const id = await qa(page, () => window.__playtestQa.getInteriorId());
      if (!ok || id !== third.name) errors.push(`${tag}: Enter next to the ${third.name} door did not enter (interior ${id})`);
      else entered.push(`${third.name} (Enter)`);
    }
    if (entered.length < 3) errors.push(`${tag}: entered ${entered.length}/3 buildings by keyboard: ${entered.join(', ')}`);
    notes.push(`${tag}: entered ${entered.join(', ')} by keyboard only`);
  } finally {
    await page.close();
  }
}

async function cam(page) {
  return qa(page, () => {
    const d = document.getElementById('game-canvas').dataset;
    return { zoom: +d.zoom, camX: +d.camX, camY: +d.camY };
  });
}

async function worldUnder(page, x, y) {
  return qa(
    page,
    ([px, py]) => {
      const q = window.__playtestQa;
      const z = +document.getElementById('game-canvas').dataset.zoom;
      const o = q.worldToClient(0, 0);
      return { x: (px - o.x) / z, y: (py - o.y) / z };
    },
    [x, y],
  );
}

async function testWheel(ctx, kind, base, errors, notes) {
  const tag = `run41-${kind}-wheel`;
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await wait(900);
    const px = 700;
    const py = 420;
    await page.mouse.move(px, py);
    const pans = [
      ['down', 0, 160, (a, b) => a.camY - b.camY],
      ['right', 160, 0, (a, b) => a.camX - b.camX],
      ['up', 0, -160, (a, b) => b.camY - a.camY],
      ['left', -160, 0, (a, b) => b.camX - a.camX],
    ];
    for (const [dir, dx, dy, moved] of pans) {
      const a = await cam(page);
      await page.mouse.wheel(dx, dy);
      await wait(250);
      const b = await cam(page);
      if (Math.abs(b.zoom - a.zoom) > a.zoom * 0.01) errors.push(`${tag}: plain scroll ${dir} zoomed ${a.zoom.toFixed(3)} -> ${b.zoom.toFixed(3)}`);
      const px2 = moved(a, b) * a.zoom;
      if (!(px2 > 160 * 0.6)) errors.push(`${tag}: scroll ${dir} moved the view ${px2.toFixed(0)} px (want ~160 in the scroll direction)`);
    }

    for (const [mod, dy, grow] of [
      ['Control', -120, true],
      ['Control', 120, false],
      ['Meta', -120, true],
    ]) {
      const w = await worldUnder(page, px, py);
      const a = await cam(page);
      await page.keyboard.down(mod);
      await page.mouse.wheel(0, dy);
      await page.keyboard.up(mod);
      await wait(250);
      const b = await cam(page);
      const ratio = b.zoom / a.zoom;
      if (grow ? !(ratio > 1.1) : !(ratio < 0.9)) {
        errors.push(`${tag}: ${mod}+wheel ${dy} changed zoom ${a.zoom.toFixed(3)} -> ${b.zoom.toFixed(3)}`);
        continue;
      }
      const at = await qa(page, ([x, y]) => window.__playtestQa.worldToClient(x, y), [w.x, w.y]);
      const drift = Math.hypot(at.x - px, at.y - py);
      if (drift > 6) errors.push(`${tag}: ${mod}+wheel zoom is not centred on the cursor (point drifted ${drift.toFixed(1)} px)`);
    }
    notes.push(`${tag}: scroll pans 4 directions without zooming; ctrl / cmd + wheel zoom at the cursor`);
  } finally {
    await page.close();
  }
}

async function tapAt(page, kind, x, y) {
  if (RUN41_KINDS[kind].touch) await page.touchscreen.tap(Math.round(x), Math.round(y));
  else await page.mouse.click(Math.round(x), Math.round(y));
}

function reachable(layout, start) {
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
  return layout.walkable.filter((t) => seen.has(key(t.x, t.y)) && !(t.x === layout.exit.x && t.y === layout.exit.y));
}

async function testInteriorFeel(ctx, kind, base, errors, notes) {
  for (const name of ['sambil', 'flor']) {
    const tag = `run41-${kind}-interior-${name}`;
    const page = await ctx.newPage();
    try {
      await page.goto(base, { waitUntil: 'networkidle' });
      await wait(500);
      await qa(page, (n) => window.__playtestQa.enterInterior(n), name);
      if (!(await waitFor(page, () => inInterior(page), 15000))) {
        errors.push(`${tag}: room did not open`);
        continue;
      }
      await wait(800);
      const layout = await qa(page, () => window.__playtestQa.interiorLayout());
      const walk = new Set(layout.walkable.map((t) => `${t.x},${t.y}`));
      const start = await qa(page, () => window.__playtestQa.interiorCharTile());
      const reach = reachable(layout, start);

      const blocked = [];
      for (let y = 1; y < layout.h - 1; y++) {
        for (let x = 1; x < layout.w - 1; x++) {
          if (walk.has(`${x},${y}`)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.some((t) => t.x === x + dx && t.y === y + dy))) blocked.push({ x, y });
        }
      }
      const picks = [blocked[Math.floor(blocked.length * 0.3)], blocked[Math.floor(blocked.length * 0.8)]].filter(Boolean);
      let snapped = 0;
      for (const b of picks) {
        const pt = await qa(page, ([x, y]) => window.__playtestQa.interiorTileScreenPoint(x, y), [b.x, b.y]);
        await tapAt(page, kind, pt.x, pt.y);
        await page
          .waitForFunction(() => window.__playtestQa.interiorWalk()?.path.length > 0, null, { polling: 'raf', timeout: 1500 })
          .catch(() => {});
        const moving = await qa(page, () => window.__playtestQa.interiorWalk());
        const goal = moving.path.at(-1) ?? { x: Math.round(moving.pos.x), y: Math.round(moving.pos.y) };
        const best = Math.min(...reach.map((t) => Math.hypot(t.x - b.x, t.y - b.y)));
        const d = Math.hypot(goal.x - b.x, goal.y - b.y);
        if (!walk.has(`${goal.x},${goal.y}`) || d > best + 0.5) {
          errors.push(`${tag}: tap on furniture ${b.x},${b.y} went to ${goal.x},${goal.y} (nearest floor is ${best.toFixed(2)} away, got ${d.toFixed(2)})`);
        }
        await waitFor(page, async () => (await qa(page, () => window.__playtestQa.interiorWalk()))?.path.length === 0, 8000);
        if (!(await inInterior(page))) {
          errors.push(`${tag}: tap on furniture ${b.x},${b.y} left the room`);
          break;
        }
        const at = await qa(page, () => window.__playtestQa.interiorCharTile());
        if (at.x === goal.x && at.y === goal.y) snapped++;
      }

      const here = await qa(page, () => window.__playtestQa.interiorCharTile());
      const far = [...reach].sort((a, b) => Math.hypot(b.x - here.x, b.y - here.y) - Math.hypot(a.x - here.x, a.y - here.y))[0];
      const pt = await qa(page, ([x, y]) => window.__playtestQa.interiorTileScreenPoint(x, y), [far.x, far.y]);
      await tapAt(page, kind, pt.x, pt.y);
      const segs = await page
        .waitForFunction(() => window.__playtestQa.interiorWalk()?.path.length || 0, null, { polling: 'raf', timeout: 3000 })
        .then((h) => h.jsonValue())
        .catch(() => 0);
      if (!segs) errors.push(`${tag}: tap on ${far.x},${far.y} did not start a walk`);
      if (segs > 4) errors.push(`${tag}: walk ${here.x},${here.y} -> ${far.x},${far.y} zig-zags through ${segs} waypoints`);
      const arrived = await waitFor(
        page,
        async () => {
          const t = await qa(page, () => window.__playtestQa.interiorCharTile());
          return t?.x === far.x && t?.y === far.y;
        },
        12000,
      );
      if (!arrived) errors.push(`${tag}: walk to ${far.x},${far.y} did not arrive`);
      notes.push(`${tag}: ${snapped}/${picks.length} furniture taps snapped to the nearest floor; ${here.x},${here.y} -> ${far.x},${far.y} in ${segs} straight segment(s)`);
    } finally {
      await page.close();
    }
  }
}

/**
 * @param {{ kind: keyof typeof RUN41_KINDS, base: string, errors: string[], notes: string[], only?: string[] }} args
 */
export async function runRun41InputSuite({ kind, base, errors, notes, only }) {
  const spec = RUN41_KINDS[kind];
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(spec.options);
  // QA_CPU_THROTTLE=8 slows Chromium pages to software-GL runner frame times to reproduce CI.
  const throttle = Number(process.env.QA_CPU_THROTTLE);
  if (throttle > 1 && spec.type === chromium) {
    ctx.on('page', async (p) => {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    });
  }
  const want = (n) => !only || only.includes(n);
  try {
    if (want('keys')) await testKeyboardEntry(ctx, kind, base, errors, notes);
    if (want('wheel')) await testWheel(ctx, kind, base, errors, notes);
    if (want('interior')) await testInteriorFeel(ctx, kind, base, errors, notes);
  } finally {
    await ctx.close();
    await browser.close();
  }
}
