/**
 * Run #45 pixel-art player (deploy gate). Checks, through real keyboard / pointer input:
 *  - Adonay draws 64×100 world px and Pantone 52×44 (2 world px per sheet px), nearest filtering,
 *    from the @2x sheets on a high-DPI canvas and @1x otherwise
 *  - facing follows the movement vector in all four directions (SE/SW/NW/NE keys)
 *  - feet do not skate: the walk frame is the distance walked over the stride (8.94 world px),
 *    and the distance walked matches how far the sprite actually moved
 *  - walk speed is ~4.5 tiles/s on keys and on a tapped path (diagonal keys too), so the walk
 *    cycle runs at ~36 fps; idle breathes at ~3 fps after a stop
 *  - Pantone trots one tile of path behind (never farther) and idles when Adonay stops
 *  - Noah (48×72, nearest) by the muro: a tap from afar walks the player next to him, then he
 *    waves, walks to the wall, climbs, traverses, descends, lands on every manifest waypoint in
 *    order at 8 fps, walks back mirrored and idles; taps while busy are ignored; Enter beside him
 *    starts another run
 * Speeds, idle breathing, Noah's route time, his short wave and exact waypoints are only asserted
 * when the recording drew at least TIMING_MIN_FPS (qa-ready.mjs).
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run45-player.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { launchBrowser, TIMING_MIN_FPS } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);
const TILE_STEP = Math.hypot(64, 32);
const WALK_PX_S = 4.5 * TILE_STEP;
const NOAH_ROUTE = ['inicio_idle', 'base_muro', 'presa_arriba_izq', 'presa_arriba_der', 'abajo_der', 'aterrizaje'];
/** Manifest frames at 8 fps: hablar 4 + caminar 10 + subir 20 + travesía 12 + bajar 16 + salto 3 + idle 8. */
const NOAH_SEQUENCE_S = 73 / 8;

export const RUN45_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.6 },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.6, light: true },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    zoom: 1.2,
    touch: true,
  },
};

/** Frame rate of a recording whose rows start with a timestamp, from its 90th-percentile interval. */
function logFps(rows) {
  const gaps = rows.slice(1).map((r, i) => r[0] - rows[i][0]).sort((a, b) => a - b);
  return gaps.length ? 1000 / gaps[Math.floor(gaps.length * 0.9)] : 0;
}
const untimedNote = (what, fps) => ` (${what} not asserted: page drew ${fps.toFixed(1)} fps, under ${TIMING_MIN_FPS})`;

function facing(dx, dy, prev) {
  const v = Math.abs(dy) < 1e-6 ? prev[0] : dy > 0 ? 's' : 'n';
  const h = Math.abs(dx) < 1e-6 ? prev[1] : dx > 0 ? 'e' : 'w';
  return v + h;
}

/** Every rendered frame: [t, adonay x, y, dir, mode, frame, walked, pantone x, y, dir, mode, frame]. */
function startRecorder(page) {
  return qa(page, () => {
    window.__avatarLog = [];
    const t0 = performance.now();
    const tick = () => {
      if (!window.__avatarLog) return;
      const s = window.__playtestQa.playerAvatar();
      const a = s.adonay;
      const p = s.pantone;
      window.__avatarLog.push([performance.now() - t0, a.x, a.y, a.dir, a.mode, a.frame, a.walked, p.x, p.y, p.dir, p.mode, p.frame, window.__avatarMark ?? '']);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const mark = (page, m) => qa(page, (s) => (window.__avatarMark = s), m);
const stopRecorder = (page) =>
  qa(page, () => {
    const log = window.__avatarLog;
    window.__avatarLog = null;
    return log;
  });

/** Open block of walkable tiles (keys can walk ~3 tiles each way) reachable from the start. */
function findOpenSpot(page) {
  return qa(page, () => {
    const q = window.__playtestQa;
    const [sx, sy] = q.inicio;
    const ok = (x, y) => q.findPath(x, y, x, y) !== null;
    for (let r = 0; r < 40; r++) {
      for (let y = sy - r; y <= sy + r; y++) {
        for (let x = sx - r; x <= sx + r; x++) {
          if (Math.max(Math.abs(x - sx), Math.abs(y - sy)) !== r) continue;
          let open = true;
          for (let dy = -4; dy <= 4 && open; dy++) for (let dx = -4; dx <= 4 && open; dx++) open = ok(x + dx, y + dy);
          if (open && q.findPath(sx, sy, x, y)) return { x, y };
        }
      }
    }
    return null;
  });
}

function analyseWalk(log, tag, errors, stride) {
  const bad = new Map();
  const flag = (k, msg) => bad.has(k) || bad.set(k, msg);
  let prevDir = log[0]?.[3] ?? 'se';
  let runMoved = 0;
  let runStart = null;
  const speeds = new Map();
  const dirsSeen = new Set();
  let maxGap = 0;
  const gapsAtTurns = [];
  let legMoved = 0;
  for (let i = 1; i < log.length; i++) {
    const [t0, x0, y0] = log[i - 1];
    const [t, x, y, dir, mode, frame, walked, px, py, , pmode, , m] = log[i];
    const dx = x - x0;
    const dy = y - y0;
    const d = Math.hypot(dx, dy);
    if (m === log[i - 1][12]) legMoved += d;
    maxGap = Math.max(maxGap, Math.hypot(x - px, y - py));
    if (d > 0.5) {
      const want = facing(dx, dy, prevDir);
      if (dir !== want) flag(`dir-${want}`, `moving (${dx.toFixed(1)}, ${dy.toFixed(1)}) px shows ${dir}, want ${want}`);
      if (mode !== 'walk') flag('mode', `moving but showing ${mode}`);
      dirsSeen.add(dir);
      prevDir = dir;
      if (m && m === log[i - 1][12] && t - t0 > 0) {
        if (!speeds.has(m)) speeds.set(m, []);
        speeds.get(m).push({ d, dt: (t - t0) / 1000, t });
      }
    }
    if (mode === 'walk') {
      if (runStart === null) {
        runStart = walked - d;
        runMoved = 0;
      }
      runMoved += d;
      if (frame !== Math.floor(walked / stride) % 8) flag('frame', `walk frame ${frame} after ${walked.toFixed(1)} px (stride ${stride.toFixed(2)})`);
      if (Math.abs(walked - runStart - runMoved) > stride + runMoved * 0.02) {
        flag('skate', `walk counted ${(walked - runStart).toFixed(1)} px but the sprite moved ${runMoved.toFixed(1)} px (feet skate)`);
      }
    } else runStart = null;
    if (m !== log[i - 1][12] && log[i - 1][12]) {
      gapsAtTurns.push({ m: log[i - 1][12], gap: Math.hypot(x0 - log[i - 1][7], y0 - log[i - 1][8]), pmode, legMoved });
    }
    if (m !== log[i - 1][12]) legMoved = 0;
  }
  for (const msg of bad.values()) errors.push(`${tag}: ${msg}`);
  const missing = ['se', 'sw', 'nw', 'ne'].filter((d) => !dirsSeen.has(d));
  if (missing.length) errors.push(`${tag}: never faced ${missing.join(', ')} while walking`);
  if (maxGap > TILE_STEP + 1.5) errors.push(`${tag}: Pantone fell ${maxGap.toFixed(1)} px behind (one tile is ${TILE_STEP.toFixed(1)})`);
  for (const g of gapsAtTurns) {
    // Releasing two diagonal keys a frame apart bends the trail; the axis keys turn cleanly. A leg
    // shorter than 1.5 tiles (a few fps with capped frame time) leaves the last turn's corner within
    // Pantone's tile, so the straight-line gap reads short.
    if (g.m.startsWith('key-') && g.m !== 'key-diag' && g.legMoved >= TILE_STEP * 1.5 && Math.abs(g.gap - TILE_STEP) > 2) {
      errors.push(`${tag}: after ${g.m} Pantone is ${g.gap.toFixed(1)} px from Adonay, want one tile (${TILE_STEP.toFixed(1)})`);
    }
  }
  const out = {};
  for (const [m, list] of speeds) {
    const steady = list.filter((s) => s.t - list[0].t > 120);
    const dist = steady.reduce((a, s) => a + s.d, 0);
    const time = steady.reduce((a, s) => a + s.dt, 0);
    out[m] = time ? dist / time : 0;
  }
  return { speeds: out, maxGap, dirsSeen: [...dirsSeen].sort() };
}

async function walkChecks(page, spec, tag, errors) {
  const spot = await findOpenSpot(page);
  if (!spot) {
    errors.push(`${tag}: no open 9×9 block of walkable tiles to test keyboard walking`);
    return '';
  }
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [spot.x, spot.y]);
  await wait(250);
  const s0 = await qa(page, () => window.__playtestQa.playerAvatar());
  await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 40, z), [s0.adonay.x, s0.adonay.y, spec.zoom]);
  await page.mouse.move(2, 2);
  await wait(250);
  await startRecorder(page);
  for (const [key, label] of [
    ['d', 'key-se'],
    ['s', 'key-sw'],
    ['a', 'key-nw'],
    ['w', 'key-ne'],
  ]) {
    await mark(page, label);
    await page.keyboard.down(key);
    await wait(spec.light ? 900 : 750);
    await page.keyboard.up(key);
  }
  await mark(page, 'key-diag');
  await page.keyboard.down('d');
  await page.keyboard.down('s');
  await wait(500);
  await page.keyboard.up('s');
  await page.keyboard.up('d');
  await mark(page, 'stop');
  await wait(900);
  const log = await stopRecorder(page);
  const s1 = await qa(page, () => window.__playtestQa.playerAvatar());
  const a = analyseWalk(log, tag, errors, s1.stride);
  // Headless WebKit (and software GL on CI) can render a few fps here; speed then reads low (frame
  // time is capped), so light or slow-drawing runs report speed instead of asserting it.
  const fps = logFps(log);
  const timed = !spec.light && fps >= TIMING_MIN_FPS;
  for (const m of ['key-se', 'key-sw', 'key-nw', 'key-ne', 'key-diag']) {
    const v = a.speeds[m] ?? 0;
    if (timed && Math.abs(v - WALK_PX_S) > WALK_PX_S * 0.15) {
      errors.push(`${tag}: ${m} walks ${(v / TILE_STEP).toFixed(2)} tiles/s, want ~4.5`);
    }
  }
  if (s1.adonay.mode !== 'idle' || s1.pantone.mode !== 'idle') {
    errors.push(`${tag}: after stopping Adonay is ${s1.adonay.mode} and Pantone ${s1.pantone.mode}, want both idle`);
  }
  const tail = log.filter((r) => r[12] === 'stop' && r[4] === 'idle');
  const idleFrames = new Set(tail.map((r) => r[5]));
  if (idleFrames.size < 2 && (timed || spec.light)) errors.push(`${tag}: idle never alternated its 2 frames in ${tail.length} samples`);

  // Tapped path: same speed, Pantone trots behind and settles one tile back.
  const from = await qa(page, () => window.__playtestQa.getCharacterTile());
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [from.x, from.y]);
  await wait(300);
  const goal = await qa(page, (f) => {
    const q = window.__playtestQa;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const p = q.findPath(f.x, f.y, f.x + dx, f.y + dy);
      if (p && p.length === 4) return { x: f.x + dx, y: f.y + dy };
    }
    return null;
  }, from);
  let tapNote = '';
  if (goal) {
    const mx = (from.x + goal.x) / 2;
    const my = (from.y + goal.y) / 2;
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y, z), [(mx - my) * 64, (mx + my) * 32, spec.zoom]);
    await wait(300);
    await startRecorder(page);
    await mark(page, 'tap');
    const c = await qa(page, ([x, y]) => window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32), [goal.x, goal.y]);
    if (spec.touch) await page.touchscreen.tap(Math.round(c.x), Math.round(c.y));
    else await page.mouse.click(Math.round(c.x), Math.round(c.y));
    await page.waitForFunction(([x, y]) => {
      const t = window.__playtestQa.getCharacterTile();
      const p = window.__playtestQa.getCharacterPos();
      return t.x === x && t.y === y && p.x === x && p.y === y;
    }, [goal.x, goal.y], { timeout: 5000 }).catch(() => errors.push(`${tag}: tapped walk to ${goal.x},${goal.y} never arrived`));
    await wait(600);
    const tapLog = await stopRecorder(page);
    const moving = tapLog.filter((r, i) => i > 0 && Math.hypot(r[1] - tapLog[i - 1][1], r[2] - tapLog[i - 1][2]) > 0.01);
    const dur = moving.length ? (moving[moving.length - 1][0] - moving[0][0]) / 1000 : 0;
    const tilesPerS = dur ? 4 / dur : 0;
    const tapFps = logFps(tapLog);
    if (!spec.light && tapFps >= TIMING_MIN_FPS && Math.abs(tilesPerS - 4.5) > 4.5 * 0.15) errors.push(`${tag}: tapped 4-tile walk took ${dur.toFixed(2)} s (${tilesPerS.toFixed(2)} tiles/s, want ~4.5)`);
    const trotted = tapLog.some((r) => r[10] === 'walk');
    if (!trotted) errors.push(`${tag}: Pantone never trotted on the tapped walk`);
    const end = await qa(page, () => window.__playtestQa.playerAvatar());
    const gap = Math.hypot(end.adonay.x - end.pantone.x, end.adonay.y - end.pantone.y);
    if (Math.abs(gap - TILE_STEP) > 2) errors.push(`${tag}: Pantone settled ${gap.toFixed(1)} px from Adonay after a straight walk, want one tile`);
    tapNote = `; tapped 4 tiles at ${tilesPerS.toFixed(2)} tiles/s${!spec.light && tapFps < TIMING_MIN_FPS ? untimedNote('speed', tapFps) : ''}`;
  }
  const fmt = Object.entries(a.speeds).map(([k, v]) => `${k.replace('key-', '')} ${(v / TILE_STEP).toFixed(2)}`).join(', ');
  return (
    `keys ${fmt} tiles/s (walk ${(WALK_PX_S / s1.stride).toFixed(0)} fps)${!spec.light && !timed ? untimedNote('speeds and idle breathing', fps) : ''}, ` +
    `faced ${a.dirsSeen.join('/')}, Pantone ≤ ${a.maxGap.toFixed(1)} px behind${tapNote}`
  );
}

async function noahChecks(page, spec, tag, errors, shots, kind) {
  const n0 = await qa(page, () => window.__playtestQa.noah());
  if (!n0?.loaded) {
    errors.push(`${tag}: Noah did not load`);
    return '';
  }
  if (n0.worldW !== 24 * n0.scale || n0.worldH !== 36 * n0.scale || n0.filter !== 'nearest/nearest') {
    errors.push(`${tag}: Noah drawn ${n0.worldW}x${n0.worldH} ${n0.filter}, want ${24 * n0.scale}x${36 * n0.scale} nearest`);
  }
  const home = n0.waypoints.inicio_idle;
  if (n0.phase !== 'idle' || Math.abs(n0.x - home.x) > 0.01 || Math.abs(n0.y - home.y) > 0.01) {
    errors.push(`${tag}: Noah starts ${n0.phase} at ${n0.x},${n0.y}, want idle at inicio_idle ${home.x},${home.y}`);
  }
  // Stand the player a few tiles off so the tap has to walk there first.
  const far = await qa(page, (n) => {
    const q = window.__playtestQa;
    const nx = Math.round(n.fx);
    const ny = Math.round(n.fy);
    for (const [dx, dy] of [[4, 2], [3, 3], [5, 1], [2, 4], [4, 4], [6, 0], [0, 5], [-3, 4]]) {
      const x = nx + dx;
      const y = ny + dy;
      if (q.findPath(x, y, x, y) && q.findPath(x, y, nx + 1, ny + 1)) return { x, y };
    }
    return null;
  }, n0);
  if (!far) {
    errors.push(`${tag}: no walkable tile a few tiles from Noah`);
    return '';
  }
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [far.x, far.y]);
  await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x + 40, y - 40, z), [home.x, home.y, spec.zoom]);
  await wait(400);
  const n1 = await qa(page, () => window.__playtestQa.noah());
  if (spec.touch) await page.touchscreen.tap(Math.round(n1.client.x), Math.round(n1.client.y));
  else await page.mouse.click(Math.round(n1.client.x), Math.round(n1.client.y));
  const t0 = Date.now();
  const started = await page
    .waitForFunction(() => window.__playtestQa.noah().phase !== 'idle', null, { timeout: 12000 })
    .then(() => true)
    .catch(() => false);
  if (!started) {
    const c = await qa(page, () => window.__playtestQa.getCharacterPos());
    errors.push(`${tag}: tapping Noah from ${far.x},${far.y} never started his climb (player ended at ${c.x.toFixed(2)},${c.y.toFixed(2)})`);
    return '';
  }
  const walkedMs = Date.now() - t0;
  const c = await qa(page, () => window.__playtestQa.getCharacterPos());
  const nd = Math.hypot(c.x - n1.fx, c.y - n1.fy);
  if (nd > n1.talkRange + 0.01) errors.push(`${tag}: Noah started while the player was ${nd.toFixed(2)} tiles away`);

  const logP = qa(
    page,
    (ms) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          const s = window.__playtestQa.noah();
          const t = performance.now() - t0;
          out.push([t, s.phase, s.anim, s.frame, s.x, s.y, s.mirrored, s.onWall, s.zIndex, s.runs, s.reached.length]);
          if (s.phase === 'idle' || t > ms) resolve(out);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    22000,
  );
  await wait(150);
  const turned = await qa(page, () => window.__playtestQa.playerAvatar().adonay);
  const towardNoah = facing(n1.x - turned.x, n1.y - turned.y, turned.dir);
  if (turned.dir !== towardNoah) errors.push(`${tag}: after walking over Adonay faces ${turned.dir}, not toward Noah (${towardNoah})`);
  if (c.x + c.y <= n1.fx + n1.fy) errors.push(`${tag}: the player stopped behind Noah (${c.x},${c.y}), over the NOAH letters`);
  await wait(1350);
  const busy = await qa(page, () => window.__playtestQa.noah());
  if (busy.client) {
    if (spec.touch) await page.touchscreen.tap(Math.round(busy.client.x), Math.round(busy.client.y));
    else await page.mouse.click(Math.round(busy.client.x), Math.round(busy.client.y));
  }
  const log = await logP;
  const shot = async (name) => {
    if (!shots) return;
    fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, name) });
  };
  const last = log[log.length - 1];
  if (last[1] !== 'idle') errors.push(`${tag}: Noah still ${last[1]} (${last[2]}) after 22 s`);
  // Standing in front of (lower than) Noah within a sprite width to his side hides him behind the player.
  const cover = log.find((r) => {
    const sum = r[5] / 32;
    return c.x + c.y > sum && Math.abs((c.x - c.y) * 64 - r[4]) < 64;
  });
  if (cover) errors.push(`${tag}: the player at ${c.x},${c.y} covers Noah during ${cover[2]} (talk spot must be off his route)`);
  const n2 = await qa(page, () => window.__playtestQa.noah());
  const wantReached = [...NOAH_ROUTE, 'aterrizaje', 'inicio_idle'];
  if (n2.runs !== 1) errors.push(`${tag}: Noah ran his route ${n2.runs} times; a tap while busy must not restart it`);
  if (n2.reached.join('>') !== wantReached.join('>')) {
    errors.push(`${tag}: Noah reached ${n2.reached.join(' > ')}, want ${wantReached.join(' > ')}`);
  }
  // Sampled once per drawn frame: at a low draw rate whole manifest frames (the short wave, a
  // waypoint) can fall between samples and game time runs slow, so those are reported only.
  const noahFps = logFps(log);
  const noahTimed = noahFps >= TIMING_MIN_FPS;
  for (const wp of noahTimed ? NOAH_ROUTE : []) {
    const p = n2.waypoints[wp];
    if (!log.some((r) => Math.abs(r[4] - p.x) < 0.01 && Math.abs(r[5] - p.y) < 0.01)) {
      errors.push(`${tag}: Noah never stood exactly on ${wp} (${p.x}, ${p.y})`);
    }
  }
  const anims = [];
  for (const r of log) if (anims[anims.length - 1] !== r[2] + (r[6] ? '~' : '')) anims.push(r[2] + (r[6] ? '~' : ''));
  const wantAnims = ['hablar', 'caminar_ne', 'subir', 'travesia_derecha', 'bajar', 'salto_aterrizaje', 'idle', 'caminar_ne~', 'idle'];
  const waved = anims.indexOf('hablar');
  const seq = waved >= 0 ? anims.slice(waved) : anims;
  const want = waved >= 0 || noahTimed ? wantAnims : wantAnims.slice(1);
  if (seq.join(' ') !== want.slice(0, seq.length).join(' ') || seq.length < want.length - 1) {
    errors.push(`${tag}: Noah played ${anims.join(' > ')}, want ${wantAnims.join(' > ')}`);
  }
  const wallZ = log.filter((r) => r[7]).map((r) => r[8]);
  const groundZ = log.filter((r) => !r[7]).map((r) => r[8]);
  if (!wallZ.length || wallZ.some((z) => z !== wallZ[0])) errors.push(`${tag}: Noah's depth on the wall is not pinned just above the muro`);
  if (wallZ.length && groundZ.length && Math.abs(Math.max(...wallZ) - Math.min(...groundZ)) > 2) {
    errors.push(`${tag}: Noah's wall depth ${wallZ[0]} is far from his ground depth ${Math.min(...groundZ)}`);
  }
  const seqEnd = log.find((r) => r[6]);
  const seqSecs = seqEnd ? seqEnd[0] / 1000 : 0;
  if (noahTimed && Math.abs(seqSecs - NOAH_SEQUENCE_S) > NOAH_SEQUENCE_S * (spec.light ? 0.25 : 0.12)) {
    errors.push(`${tag}: Noah's route took ${seqSecs.toFixed(2)} s, want ~${NOAH_SEQUENCE_S.toFixed(2)} s at 8 fps`);
  }
  await shot(`noah-${kind}.png`);

  // Enter beside him starts another run (no walking needed).
  await page.keyboard.press('Enter');
  await wait(300);
  const n3 = await qa(page, () => window.__playtestQa.noah());
  if (n3.runs !== 2 || n3.phase !== 'sequence') errors.push(`${tag}: Enter beside Noah did not start another run (runs ${n3.runs}, ${n3.phase})`);
  if (shots) {
    await page.waitForFunction(() => window.__playtestQa.noah().anim === 'travesia_derecha', null, { timeout: 9000 }).catch(() => {});
    await wait(250);
    await shot(`noah-climb-${kind}.png`);
  }
  return (
    `Noah ${n0.worldW}x${n0.worldH}: walked over to ${c.x},${c.y} (clear of his route) in ${(walkedMs / 1000).toFixed(1)} s, route ${seqSecs.toFixed(2)} s through ${NOAH_ROUTE.length} waypoints, back mirrored` +
    `${noahTimed ? '' : untimedNote('route time, the wave and exact waypoints', noahFps)}; busy tap ignored; Enter restarts`
  );
}

export async function runRun45PlayerSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN45_KINDS[kind];
  const tag = `run45-${kind}-player`;
  const browser = await launchBrowser(spec.type);
  try {
    const ctx = await browser.newContext(spec.options);
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.playerAvatar?.().loaded && window.__playtestQa.noah()?.loaded, null, {
      timeout: 30000,
    });
    await wait(300);
    const s = await qa(page, () => window.__playtestQa.playerAvatar());
    const wantRes = s.rendererResolution >= 1.5 ? 2 : 1;
    for (const [who, w, h] of [['adonay', 64, 100], ['pantone', 52, 44]]) {
      const v = s[who];
      if (v.worldW !== w || v.worldH !== h || v.filter !== 'nearest/nearest') {
        errors.push(`${tag}: ${who} drawn ${v.worldW}x${v.worldH} ${v.filter}, want ${w}x${h} nearest`);
      }
      if (v.resolution !== wantRes) errors.push(`${tag}: ${who} uses the @${v.resolution}x sheet on a ${s.rendererResolution}x canvas`);
      if (!v.visible) errors.push(`${tag}: ${who} not visible on the map`);
      if (v.texture !== `idle_${v.dir}`) errors.push(`${tag}: ${who} starts on ${v.texture}, want idle_${v.dir}`);
    }
    const gap0 = Math.hypot(s.adonay.x - s.pantone.x, s.adonay.y - s.pantone.y);
    if (Math.abs(gap0 - TILE_STEP) > 1) errors.push(`${tag}: Pantone starts ${gap0.toFixed(1)} px from Adonay, want one tile behind`);
    const walk = await walkChecks(page, spec, tag, errors);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      const a = await qa(page, () => window.__playtestQa.playerAvatar());
      await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 40, z), [a.adonay.x, a.adonay.y, spec.zoom]);
      await wait(200);
      await page.screenshot({ path: path.join(shots, `player-${kind}.png`) });
    }
    const noah = spec.light ? '' : await noahChecks(page, spec, tag, errors, shots, kind);
    try {
      await qa(page, () => window.__playtestQa.isolateSprites(['tile:0,0']));
      await wait(100);
      const iso = await qa(page, () => window.__playtestQa.playerAvatar());
      if (iso.adonay.visible || iso.pantone.visible) errors.push(`${tag}: player visible under QA sprite isolation`);
      await qa(page, () => window.__playtestQa.isolateSprites(null));
    } catch (e) {
      if (!/Target crashed|has been closed|destroyed/i.test(e?.message ?? String(e))) throw e;
      notes.push(`${tag}: sprite isolation skipped after renderer crash`);
    }
    await ctx.close().catch(() => {});
    notes.push(`${tag}: ${walk}${noah ? `; ${noah}` : ''}`);
  } finally {
    await browser.close().catch(() => {});
  }

  await wait(1500);
  let roomOk = false;
  let roomErr = null;
  for (let attempt = 0; attempt < 2 && !roomOk; attempt++) {
    const roomBrowser = await launchBrowser(spec.type);
    try {
      const roomCtx = await roomBrowser.newContext(spec.options);
      const roomPage = await roomCtx.newPage();
      await roomPage.goto(base, { waitUntil: 'networkidle' });
      await roomPage.waitForFunction(() => window.__playtestQa?.playerAvatar?.().loaded, null, { timeout: 30000 });
      await qa(roomPage, () => window.__playtestQa.enterInterior('estudio'));
      await roomPage.waitForFunction(() => window.__playtestQa.isInInterior(), null, { timeout: 15000 });
      await wait(400);
      const room = await qa(roomPage, () => window.__playtestQa.playerAvatar());
      if (room.scope !== 'room' || !room.adonay.visible || !room.pantone.visible) {
        errors.push(`${tag}: in the Estudio the avatar is ${room.scope}, Adonay ${room.adonay.visible ? 'shown' : 'hidden'}, Pantone ${room.pantone.visible ? 'shown' : 'hidden'}`);
      }
      if (room.adonay.worldH !== 100) errors.push(`${tag}: Adonay is ${room.adonay.worldH} px tall in the Estudio`);
      const noahInside = await qa(roomPage, () => window.__playtestQa.noah().visible);
      if (noahInside) errors.push(`${tag}: Noah visible inside the Estudio`);
      notes.push(`${tag}: in rooms too`);
      roomOk = true;
      await roomCtx.close();
    } catch (e) {
      roomErr = e;
      await wait(1500);
    } finally {
      await roomBrowser.close().catch(() => {});
    }
  }
  if (!roomOk) {
    const msg = roomErr?.message ?? String(roomErr);
    if (/Target crashed|has been closed|destroyed/i.test(msg)) {
      notes.push(`${tag}: Estudio interior skipped after renderer crash (${msg.split('\n')[0]})`);
    } else {
      throw roomErr;
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts', 'run45') : null;
  const base = args.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:4210/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN45_KINDS)) {
    await runRun45PlayerSuite({ kind, base, errors, notes, shots });
  }
  for (const n of notes) console.log('ok   ', n);
  for (const e of errors) console.log('FAIL ', e);
  process.exit(errors.length ? 1 : 0);
}
