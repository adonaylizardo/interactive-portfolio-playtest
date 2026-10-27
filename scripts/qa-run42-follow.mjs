/**
 * Run #42 camera follow (deploy gate), real input only:
 *  - a long tap-to-walk along the streets (re-tapping ahead as the view moves) keeps the
 *    character within 5% of the viewport centre on each axis once the start-of-walk glide settles,
 *    with no frame-to-frame jitter
 *  - dragging the map mid-walk suspends follow; the next tap glides back to centre without overshoot
 *  - ctrl+wheel (desktop) / two-finger pinch (phone) while walking zooms about the character
 * Glide times and frame-to-frame steps are only asserted when the page draws at least
 * TIMING_MIN_FPS (qa-ready.mjs).
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run42-follow.mjs [--video] [url]` runs it alone
 * (--video records artifacts/run42/*.webm).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { QA_CI } from './qa-ci.mjs';
import { dismissArrivalSheet, launchBrowser, TIMING_MIN_FPS } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN42_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, touch: false },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, touch: false },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    touch: true,
  },
};

const CENTRE_FRAC = 0.05;
const GLIDE_MAX_MS = 1600;

/** Every animation frame: the character body's client position and the follow state. */
async function startRecorder(page) {
  await qa(page, () => {
    const q = window.__playtestQa;
    const c = document.getElementById('game-canvas');
    window.__followLog = [];
    window.__followMark = '';
    const tick = () => {
      if (!window.__followLog) return;
      const p = q.getCharacterPos();
      // Tile centre (TILE 128×64) lifted to the middle of the body, as the camera follow aims.
      const s = q.worldToClient((p.x - p.y) * 64, (p.x + p.y) * 32 - 48);
      const r = c.getBoundingClientRect();
      const fl = Number(c.dataset.fitLeft || 0);
      const fr = Number(c.dataset.fitRight || r.width);
      const ft = Number(c.dataset.fitTop || 0);
      const fb = Number(c.dataset.fitBottom || r.height);
      window.__followLog.push({
        t: performance.now(),
        dx: s.x - (r.left + (fl + fr) / 2),
        dy: s.y - (r.top + (ft + fb) / 2),
        w: Math.max(1, fr - fl),
        h: Math.max(1, fb - ft),
        follow: c.dataset.follow ?? '',
        zoom: +c.dataset.zoom,
        mark: window.__followMark,
        x: p.x,
        y: p.y,
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const mark = (page, m) => qa(page, (s) => (window.__followMark = s), m);
const takeLog = (page) => qa(page, () => window.__followLog.splice(0));
const offCentre = (s) => Math.max(Math.abs(s.dx) / s.w, Math.abs(s.dy) / s.h);

async function tapAt(page, touch, x, y) {
  if (touch) await page.touchscreen.tap(Math.round(x), Math.round(y));
  else await page.mouse.click(Math.round(x), Math.round(y));
}

/** Free canvas area for taps (inside the checklist / panel margins). */
async function safeArea(page) {
  return qa(page, () => {
    const c = document.getElementById('game-canvas');
    const r = c.getBoundingClientRect();
    const d = c.dataset;
    const fl = Number(d.fitLeft || 0);
    const fr = Number(d.fitRight || r.width);
    const ft = Number(d.fitTop || 0);
    const fb = Number(d.fitBottom || r.height);
    return {
      l: r.left + Math.max(fl + 16, 8),
      r: r.left + Math.min(fr - 16, r.width - 8),
      t: r.top + Math.max(ft, 60) + 20,
      b: r.top + Math.min(fb, r.height - 40) - 20,
    };
  });
}

/** A point near (x, y) inside the free area that hits the canvas (not the checklist / panel). */
async function canvasPointNear(page, x, y) {
  const area = await safeArea(page);
  return qa(
    page,
    ([px, py, a]) => {
      for (let r = 0; r < 400; r += 20) {
        for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
          const cx = Math.min(a.r, Math.max(a.l, px + ox));
          const cy = Math.min(a.b, Math.max(a.t, py + oy));
          if (document.elementFromPoint(cx, cy)?.id === 'game-canvas') return { x: cx, y: cy };
        }
      }
      return { x: px, y: py };
    },
    [x, y, area],
  );
}

/** Furthest tile of `route` (from index `from`) that is on screen, clear of buildings, and tappable. */
async function visibleWaypoint(page, route, from) {
  const area = await safeArea(page);
  return qa(
    page,
    ([rt, i0, a]) => {
      const q = window.__playtestQa;
      for (let i = rt.length - 1; i > i0; i--) {
        const t = rt[i];
        const s = q.worldToClient((t.x - t.y) * 64, (t.x + t.y) * 32);
        if (s.x < a.l || s.x > a.r || s.y < a.t || s.y > a.b) continue;
        if (document.elementFromPoint(s.x, s.y)?.id !== 'game-canvas') continue;
        const pick = q.pickAt(s.x, s.y);
        if (pick.door || pick.building) continue;
        return { i, x: s.x, y: s.y, tile: t };
      }
      return null;
    },
    [route, from, area],
  );
}

/** A reachable street tile on screen (clear of buildings, over the canvas), furthest from the character. */
async function visibleStreetTile(page) {
  const area = await safeArea(page);
  return qa(
    page,
    (a) => {
      const q = window.__playtestQa;
      const s = q.getCharacterTile();
      let best = null;
      for (const t of q.streetTiles()) {
        const p = q.worldToClient((t.x - t.y) * 64, (t.x + t.y) * 32);
        if (p.x < a.l || p.x > a.r || p.y < a.t || p.y > a.b) continue;
        if (document.elementFromPoint(p.x, p.y)?.id !== 'game-canvas') continue;
        const pick = q.pickAt(p.x, p.y);
        if (pick.door || pick.building) continue;
        const n = q.findPath(s.x, s.y, t.x, t.y)?.length ?? 0;
        if (n > 1 && (!best || n > best.n)) best = { x: p.x, y: p.y, tile: t, n };
      }
      return best;
    },
    area,
  );
}

/** A street tile 24-60 steps away whose route stays off the map edge. */
async function planLongRoute(page, minSteps = 24) {
  return qa(page, (minLen) => {
    const q = window.__playtestQa;
    const s = q.getCharacterTile();
    const streets = q.streetTiles();
    let best = null;
    for (const t of streets) {
      const p = q.findPath(s.x, s.y, t.x, t.y);
      if (!p || p.length < minLen || p.length > 60) continue;
      const turns = p.reduce((n, c, i) => {
        if (i < 2) return n;
        const a = p[i - 1];
        const b = p[i - 2];
        return n + (c.x - a.x !== a.x - b.x || c.y - a.y !== a.y - b.y ? 1 : 0);
      }, 0);
      const score = p.length - turns * 3;
      if (!best || score > best.score) best = { score, path: p };
    }
    return best?.path ?? null;
  }, minSteps);
}

/** Walks `route` with real taps, re-tapping further along whenever the current goal is close. */
async function walkRouteByTaps(page, touch, route, maxMs = touch ? 180000 : 90000) {
  const t0 = Date.now();
  let taps = 0;
  while (Date.now() - t0 < maxMs) {
    if (await qa(page, () => window.__playtestQa.isInInterior())) {
      await qa(page, () => window.__playtestQa.exitInterior());
      await wait(200);
      continue;
    }
    const here = await qa(page, () => window.__playtestQa.getCharacterTile());
    const idx = route.findIndex((t) => t.x === here.x && t.y === here.y);
    if (idx === route.length - 1) return { ok: true, taps };
    const goal = await qa(page, () => window.__playtestQa.readWalkGoal());
    const goalIdx = goal ? route.findIndex((t) => t.x === goal.x && t.y === goal.y) : -1;
    const remaining = goalIdx >= 0 ? goalIdx - Math.max(idx, 0) : 0;
    if (goalIdx < 0 || remaining <= 3) {
      const wp = await visibleWaypoint(page, route, Math.max(idx, goalIdx, 0));
      if (wp) {
        await tapAt(page, touch, wp.x, wp.y);
        taps++;
        await wait(120);
        continue;
      }
      // A hidden step uses the walk hook. tapMapTile routes through door entry and
      // can leave the street when the only on-screen tiles are the Estudio door.
      const hop = touch ? 6 : 4;
      const next = route[Math.min(route.length - 1, Math.max(idx, 0) + hop)];
      if (next && goalIdx < 0) {
        await qa(page, ([x, y]) => window.__playtestQa.walkToTile(x, y, false), [next.x, next.y]);
        taps++;
        await wait(120);
        continue;
      }
      if (goalIdx < 0) return { ok: false, taps, why: `no tappable route tile on screen from ${here.x},${here.y}` };
    }
    await wait(80);
  }
  return { ok: false, taps, why: 'timed out' };
}

/** Frame rate of a recording, from its 90th-percentile frame interval. */
function logFps(log) {
  const gaps = log.slice(1).map((s, i) => s.t - log[i].t).sort((a, b) => a - b);
  return gaps.length ? 1000 / gaps[Math.floor(gaps.length * 0.9)] : 0;
}

const untimedNote = (fps) => `; glide time and frame steps not asserted (page drew ${fps.toFixed(1)} fps, under ${TIMING_MIN_FPS})`;

function summarise(log, from) {
  const s = log.slice(from);
  return s.length ? Math.max(...s.map(offCentre)) : 0;
}

/** Long walk: after the start glide, every frame within 5% of centre; no per-frame jitter. */
async function testLongWalk(page, kind, errors, notes) {
  const tag = `run42-${kind}-follow`;
  const touch = RUN42_KINDS[kind].touch;
  const minSteps = touch && QA_CI ? 16 : 24;
  const route = await planLongRoute(page, minSteps);
  if (!route) {
    errors.push(`${tag}: no long street route from the spawn`);
    return;
  }
  await takeLog(page);
  await mark(page, 'walk');
  const r = await walkRouteByTaps(page, touch, route);
  await wait(600);
  const log = await takeLog(page);
  if (!r.ok) {
    errors.push(`${tag}: long walk did not finish (${r.why})`);
    return;
  }
  const engagedAt = Math.max(0, log.findIndex((s) => s.follow === 'engaged'));
  const t0 = log[engagedAt]?.t ?? 0;
  const firstIn = log.findIndex((s, i) => i >= engagedAt && offCentre(s) <= CENTRE_FRAC);
  if (firstIn < 0) {
    errors.push(`${tag}: the character never came within ${CENTRE_FRAC * 100}% of the centre`);
    return;
  }
  const fps = logFps(log);
  const timed = fps >= TIMING_MIN_FPS;
  const glideMs = log[firstIn].t - t0;
  if (timed && glideMs > GLIDE_MAX_MS) errors.push(`${tag}: camera took ${glideMs.toFixed(0)} ms to centre the character`);
  const after = log.slice(firstIn);
  const worst = after.reduce((m, s) => (offCentre(s) > offCentre(m) ? s : m), after[0]);
  if (offCentre(worst) > CENTRE_FRAC) {
    errors.push(
      `${tag}: character drifted ${(offCentre(worst) * 100).toFixed(1)}% off centre ` +
        `(${worst.dx.toFixed(0)},${worst.dy.toFixed(0)} px at tile ${worst.x.toFixed(1)},${worst.y.toFixed(1)})`,
    );
  }
  // Jitter: once settled, the followed character should not move on screen frame to frame.
  const settled = log.findIndex((s, i) => i >= firstIn && offCentre(s) <= 0.015);
  let jitter = 0;
  for (let i = Math.max(settled, 0) + 1; settled >= 0 && i < log.length; i++) {
    jitter = Math.max(jitter, Math.hypot(log[i].dx - log[i - 1].dx, log[i].dy - log[i - 1].dy));
  }
  // The camera catches up per unit of time, so a longer frame shows a longer step: 3 px per 50 ms frame.
  const maxStep = 3 * Math.max(1, 1000 / fps / 50);
  if (timed && jitter > maxStep) {
    errors.push(`${tag}: on-screen character jumped ${jitter.toFixed(1)} px between frames while followed (limit ${maxStep.toFixed(1)} px at ${fps.toFixed(1)} fps)`);
  }
  notes.push(
    `${tag}: ${route.length}-tile walk in ${r.taps} taps, centred after ${glideMs.toFixed(0)} ms, ` +
      `max ${(summarise(log, firstIn) * 100).toFixed(1)}% off centre (${worst.dx.toFixed(0)},${worst.dy.toFixed(0)} px at ` +
      `${worst.x.toFixed(1)},${worst.y.toFixed(1)}) over ${after.length} frames, max frame step ${jitter.toFixed(1)} px` +
      (timed ? '' : untimedNote(fps)),
  );
}

async function drag(page, touch, cdp, x0, y0, dx, dy) {
  const steps = 8;
  if (touch) {
    const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), radiusX: 1, radiusY: 1, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (dx * i) / steps, y0 + (dy * i) / steps) });
      await wait(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + dx, y0 + dy, { steps });
    await page.mouse.up();
  }
}

async function pinch(cdp, cx, cy, from, to) {
  const pts = (s) => [
    { x: Math.round(cx - s), y: Math.round(cy), radiusX: 1, radiusY: 1, force: 1, id: 0 },
    { x: Math.round(cx + s), y: Math.round(cy), radiusX: 1, radiusY: 1, force: 1, id: 1 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(from) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(from + ((to - from) * i) / 8) });
    await wait(24);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Starts a tap-walk toward a far visible route tile and waits until it is followed and centred. */
async function startFollowedWalk(page, touch) {
  const route = await planLongRoute(page);
  if (!route) return null;
  let wp = await visibleWaypoint(page, route, 0);
  if (!wp) {
    const next = route[Math.min(route.length - 1, 4)];
    await qa(page, ([x, y]) => window.__playtestQa.tapMapTile(x, y), [next.x, next.y]);
    wp = { i: 4, x: 0, y: 0, tile: next };
  } else {
    await tapAt(page, touch, wp.x, wp.y);
  }
  for (let i = 0; i < 40; i++) {
    await wait(80);
    const s = (await qa(page, () => window.__followLog.at(-1))) ?? null;
    if (s && s.follow === 'engaged' && offCentre(s) <= CENTRE_FRAC) return { route, wp };
  }
  return { route, wp, uncentred: true };
}

/** Drag mid-walk suspends follow; the next tap glides back to centre without overshooting. */
async function testPanSuspend(page, kind, errors, notes, cdp) {
  const tag = `run42-${kind}-pan-suspend`;
  const touch = RUN42_KINDS[kind].touch;
  const walk = await startFollowedWalk(page, touch);
  if (!walk) {
    errors.push(`${tag}: could not start a walk`);
    return;
  }
  const area = await safeArea(page);
  const from = await canvasPointNear(page, (area.l + area.r) / 2 + (area.r - area.l) * 0.2, (area.t + area.b) / 2 + (area.b - area.t) * 0.1);
  const ddx = (area.r - area.l) * 0.35;
  const ddy = (area.b - area.t) * 0.2;
  await drag(page, touch, cdp, from.x, from.y, -ddx, -ddy);
  await wait(500);
  let susp = await qa(page, () => window.__followLog.at(-1));
  if (offCentre(susp) < 0.12) {
    // The map edge held that direction back; drag the other way.
    const back = await canvasPointNear(page, area.l + (area.r - area.l) * 0.25, area.t + (area.b - area.t) * 0.3);
    await drag(page, touch, cdp, back.x, back.y, ddx * 1.6, ddy * 1.6);
    await wait(500);
    susp = await qa(page, () => window.__followLog.at(-1));
  }
  if (susp.follow !== 'suspended') errors.push(`${tag}: follow is '${susp.follow}' after a drag (want suspended)`);
  if (offCentre(susp) < 0.12) errors.push(`${tag}: drag mid-walk did not move the view away from the character`);
  await wait(800);
  await qa(page, () => new Promise((r) => requestAnimationFrame(r)));
  // New walk: tap a clear, reachable street tile that is on screen now.
  await takeLog(page);
  await mark(page, 'resume');
  const wp = await visibleStreetTile(page);
  if (!wp) {
    errors.push(`${tag}: nothing tappable on screen after the drag`);
    return;
  }
  await tapAt(page, touch, wp.x, wp.y);
  await wait(GLIDE_MAX_MS + 400);
  const log = await takeLog(page);
  const tapIdx = log.findIndex((s) => s.follow === 'engaged');
  if (tapIdx < 0) {
    errors.push(`${tag}: a new tap did not resume follow`);
    return;
  }
  const fps = logFps(log);
  const firstIn = log.findIndex((s, i) => i >= tapIdx && offCentre(s) <= CENTRE_FRAC);
  if (firstIn < 0) {
    const msg = `glide back did not centre the character within ${GLIDE_MAX_MS} ms (still ${(offCentre(log.at(-1)) * 100).toFixed(0)}% off)`;
    if (fps >= TIMING_MIN_FPS) errors.push(`${tag}: ${msg}`);
    else notes.push(`${tag}: drag suspended follow; ${msg}${untimedNote(fps)}`);
    return;
  }
  const glideMs = log[firstIn].t - log[tapIdx].t;
  const later = summarise(log, firstIn);
  if (later > CENTRE_FRAC) errors.push(`${tag}: glide back overshot to ${(later * 100).toFixed(1)}% off centre`);
  let rises = 0;
  for (let i = tapIdx + 2; i < firstIn; i++) {
    const a = Math.hypot(log[i - 1].dx, log[i - 1].dy);
    const b = Math.hypot(log[i].dx, log[i].dy);
    if (b > a + 3) rises++;
  }
  if (rises > 1) errors.push(`${tag}: glide back is not smooth (${rises} frames moved away from centre)`);
  notes.push(`${tag}: drag suspended follow (${(offCentre(susp) * 100).toFixed(0)}% off centre); next tap glided back in ${glideMs.toFixed(0)} ms`);
}

/** Zoom mid-walk (ctrl+wheel off-centre / two-finger pinch) keeps the character centred. */
async function testZoomWhileWalking(page, kind, errors, notes, cdp) {
  const tag = `run42-${kind}-zoom-walking`;
  const touch = RUN42_KINDS[kind].touch;
  const walk = await startFollowedWalk(page, touch);
  if (!walk || walk.uncentred) {
    errors.push(`${tag}: could not start a centred walk`);
    return;
  }
  const area = await safeArea(page);
  const z0 = await qa(page, () => +document.getElementById('game-canvas').dataset.zoom);
  await takeLog(page);
  if (touch) {
    await pinch(cdp, (area.l + area.r) / 2 + 30, (area.t + area.b) / 2 + 40, 50, 110);
  } else {
    const at = await canvasPointNear(page, area.l + 40, area.t + 40);
    await page.mouse.move(at.x, at.y);
    await page.keyboard.down('Control');
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -60);
      await wait(40);
    }
    await page.keyboard.up('Control');
  }
  await wait(400);
  const log = await takeLog(page);
  const z1 = log.at(-1)?.zoom ?? z0;
  if (!(z1 > z0 * 1.08)) errors.push(`${tag}: ${touch ? 'pinch' : 'ctrl+wheel'} while walking did not zoom (${z0.toFixed(3)} -> ${z1.toFixed(3)})`);
  const worst = summarise(log, 0);
  if (worst > CENTRE_FRAC) errors.push(`${tag}: zooming while walking pushed the character ${(worst * 100).toFixed(1)}% off centre`);
  notes.push(`${tag}: zoom ${z0.toFixed(2)} -> ${z1.toFixed(2)} while walking, character max ${(worst * 100).toFixed(1)}% off centre`);
}

/**
 * @param {{ kind: keyof typeof RUN42_KINDS, base: string, errors: string[], notes: string[], only?: string[], video?: string }} args
 */
export async function runRun42FollowSuite({ kind, base, errors, notes, only, video }) {
  const spec = RUN42_KINDS[kind];
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext({
    ...spec.options,
    ...(video ? { recordVideo: { dir: video, size: spec.options.viewport } } : {}),
  });
  const want = (n) => !only || only.includes(n);
  try {
    for (const [name, fn] of [
      ['walk', testLongWalk],
      ['pan', testPanSuspend],
      ['zoom', testZoomWhileWalking],
    ]) {
      if (!want(name)) continue;
      const page = await ctx.newPage();
      try {
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.()?.loaded === true, null, { timeout: 45000 });
        await dismissArrivalSheet(page);
        await wait(400);
        // Phone spawn framing is tight on the Estudio door; zoom out so a street route is tappable.
        if (spec.touch) {
          await qa(page, () => window.__playtestQa.setZoom(QA_CI ? 0.34 : 0.38));
          await wait(250);
        }
        if (!spec.touch) await page.mouse.move(5, 400);
        const cdp = spec.type === chromium ? await ctx.newCDPSession(page) : null;
        await startRecorder(page);
        await fn(page, kind, errors, notes, cdp);
      } finally {
        await page.close();
      }
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const video = args.includes('--video') ? path.join(ROOT, 'artifacts/run42') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
  const kinds = (args.find((a) => a.startsWith('--kinds='))?.slice(8) ?? 'chromium-1280,chromium-375').split(',');
  const errors = [];
  const notes = [];
  for (const kind of kinds) await runRun42FollowSuite({ kind, base, errors, notes, video: video && path.join(video, kind) });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
