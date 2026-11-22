#!/usr/bin/env node
/**
 * Real-input JAC T9 drive gate.
 *
 * Input is real keyboard / mouse (desktop) and CDP touch (phone) only: the map is panned by dragging,
 * the truck is tapped, "Súbete" is tapped, and the truck is driven with WASD or the on-screen stick.
 * `window.__playtestQa` (`?qa=1`) is read for observation only — never to seat, move, steer or shift.
 *
 * Gates (each viewport):
 *   G1 gas right after a real Get in moves the truck ≥ 1 tile in 1.5 s
 *   G2 anywhere, no 1.5 s window with gas + steer held and < 0.02 tiles of travel; the nose
 *      must actually touch the cactus (26,20) and the tree (40,18), then steer + gas frees it
 *   G3 motion direction never more than 35° off the drawn sprite
 *   G4 desktop dock stable while driving: gear buttons keep DOM identity, no needle jump > 40° per
 *      60 fps frame, no full-dock colour flash
 *   G5 phone: the stick stays visible for the whole drive and tracks its own finger
 *   G6 zero console errors / page errors
 *   G7 per-frame displacement ≤ max(0.35, 1.6·|v|·dt + 0.08)
 *   G8 no sprite rotation of 90° or more with < 0.3 tiles of travel since the previous facing
 *   G9 no driving frame whose 5×3 / 3×5 footprint overlaps a blocked cell
 *   G10 from spawn, 0.5 s straight then full steer: a 90° turn completes with no stop
 *      longer than 0.5 s, and no frame yaws more than 0.3 quarter-turns. Both steer
 *      sides are tried; at least 75% must finish.
 *
 * The approach to a prop reads the pose to steer. Every steer change is appended to `reroutes`.
 *
 * Usage:
 *   npm run build:preview-integracion
 *   npx vite preview --port 4196 --base /interactive-portfolio-playtest/preview-integracion/
 *   node scripts/qa/drive-real.mjs [--only=desktop|phone]
 * Env: QA_BASE_URL (default http://127.0.0.1:4196/interactive-portfolio-playtest/preview-integracion/),
 *      QA_OUT_DIR (screenshots + JSON; default /opt/cursor/artifacts/drive-real or $TMPDIR/drive-real).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const BASE =
  process.env.QA_BASE_URL ?? 'http://127.0.0.1:4196/interactive-portfolio-playtest/preview-integracion/';
const OUT =
  process.env.QA_OUT_DIR ??
  (fs.existsSync('/opt/cursor/artifacts')
    ? '/opt/cursor/artifacts/drive-real'
    : path.join(os.tmpdir(), 'drive-real'));
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const url = () => `${BASE}${BASE.includes('?') ? '&' : '?'}qa=1`;

const G2_WINDOW_MS = 1500;
const G2_MIN_TRAVEL = 0.02;
const G3_MAX_DEG = 35;
const G4_MAX_NEEDLE_DEG = 40;

/** Observation-only sampler: one record per animation frame, plus DOM identity / mutation tracking. */
function installSampler() {
  const w = window;
  if (w.__gate) return;
  const keys = new Set();
  window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()), true);
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), true);
  window.addEventListener('blur', () => keys.clear());
  const angleOf = (el) => {
    if (!el || el.offsetParent === null) return null;
    const tr = getComputedStyle(el).transform;
    const m = tr && tr.match(/matrix\(([^)]+)\)/);
    if (!m) return null;
    const [a, b] = m[1].split(',').map(Number);
    return (Math.atan2(b, a) * 180) / Math.PI;
  };
  const gate = {
    on: false,
    samples: [],
    dockMutations: 0,
    gearRefs: null,
    gearReplaced: 0,
    start() {
      this.samples = [];
      this.dockMutations = 0;
      this.gearReplaced = 0;
      this.gearRefs = [...document.querySelectorAll('.jac-dock .jac-gear')];
      this.on = true;
    },
    stop() {
      this.on = false;
    },
  };
  w.__gate = gate;
  const dock = () => document.querySelector('.jac-dock');
  const mo = new MutationObserver((list) => {
    if (!gate.on) return;
    for (const m of list) if (m.type === 'childList') gate.dockMutations += 1;
  });
  const hook = () => {
    const d = dock();
    if (d) mo.observe(d, { childList: true, subtree: true });
    else setTimeout(hook, 200);
  };
  hook();
  const tick = (t) => {
    requestAnimationFrame(tick);
    if (!gate.on) return;
    const q = w.__playtestQa;
    const j = q?.jac?.();
    if (!j) return;
    const d = dock();
    const ds = d && !d.hidden ? getComputedStyle(d) : null;
    const stickEl = document.querySelector('.joystick');
    const sr = stickEl?.getBoundingClientRect();
    const stickVisible =
      !!stickEl &&
      !stickEl.hidden &&
      getComputedStyle(stickEl).display !== 'none' &&
      sr.width > 20 &&
      sr.right > 0 &&
      sr.bottom > 0 &&
      sr.left < innerWidth &&
      sr.top < innerHeight;
    const stick = q.joystick?.() ?? { x: 0, y: 0, active: false };
    if (gate.gearRefs?.length) {
      const now = [...document.querySelectorAll('.jac-dock .jac-gear')];
      if (now.length !== gate.gearRefs.length || now.some((el, i) => el !== gate.gearRefs[i])) {
        gate.gearReplaced += 1;
        gate.gearRefs = now;
      }
    }
    gate.samples.push({
      t,
      cx: j.cx,
      cy: j.cy,
      dir: j.dir,
      heading: j.heading,
      vel: j.vel,
      gear: j.gear,
      mph: j.mph,
      rpm: j.rpm,
      driving: j.driving,
      keys: [...keys].join(''),
      sx: stick.x,
      sy: stick.y,
      sActive: !!stick.active,
      stickVisible,
      rpmDeg: angleOf(document.querySelector('.jac-dock .jac-gauge--rpm .jac-gauge__needle')),
      mphDeg: angleOf(document.querySelector('.jac-dock .jac-gauge--mph .jac-gauge__needle')),
      dockBg: ds?.backgroundColor ?? null,
      dockShadow: ds?.boxShadow ?? null,
      blocked: !!q.jacFootprintBlocked?.(),
    });
  };
  requestAnimationFrame(tick);
}

async function boot(page, input) {
  await page.goto(url(), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  for (let i = 0; i < 600; i++) {
    const state = await page
      .evaluate(() => {
        if (typeof window.__playtestQa?.jac === 'function' && window.__playtestQa.jac()) return 'ready';
        const b = document.querySelector('[data-boot-start]');
        if (b && !b.closest('[hidden]') && b.getBoundingClientRect().width > 0) return 'welcome';
        return 'loading';
      })
      .catch(() => 'loading');
    if (state === 'ready') break;
    if (state === 'welcome') await realTapSelector(page, input, '[data-boot-start]').catch(() => {});
    await wait(100);
  }
  await page.evaluate(installSampler);
  await wait(1200);
  // Phone: close the arrival sheet by tapping its own close button.
  for (let i = 0; i < 3; i++) {
    const closed = await realTapSelector(page, input, '.chrome--sheet [data-action="intro-close"], .chrome--intro-expanded [data-action="intro-close"], .chrome--intro-full [data-action="intro-close"]').catch(() => false);
    if (!closed) break;
    await wait(500);
  }
}

async function visibleBox(page, selector) {
  return page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width < 4 || r.height < 4 || st.visibility === 'hidden' || st.display === 'none') continue;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }
    return null;
  }, selector);
}

async function realTapSelector(page, input, selector) {
  const box = await visibleBox(page, selector);
  if (!box) return false;
  await input.tap(box.x, box.y);
  return true;
}

/** Mouse for desktop, CDP Input.dispatchTouchEvent for phone. */
function makeInput(page, cdp, touch) {
  const touchEv = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id, radiusX: 6, radiusY: 6, force: 1 })),
    });
  return {
    touch,
    touchEv,
    async tap(x, y) {
      if (touch) {
        // Playwright's touchscreen tap carries real input timestamps. A raw CDP
        // touchEnd does not, and the map rejects that as a long-press.
        await page.touchscreen.tap(Math.round(x), Math.round(y));
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await wait(50);
        await page.mouse.up();
      }
    },
    async drag(x0, y0, x1, y1, steps = 14) {
      if (touch) {
        await touchEv('touchStart', [{ x: x0, y: y0, id: 1 }]);
        for (let i = 1; i <= steps; i++) {
          await touchEv('touchMove', [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }]);
          await wait(16);
        }
        await wait(80);
        await touchEv('touchEnd', []);
      } else {
        await page.mouse.move(x0, y0);
        await page.mouse.down();
        for (let i = 1; i <= steps; i++) {
          await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps);
          await wait(16);
        }
        await wait(80);
        await page.mouse.up();
      }
    },
  };
}

async function truckScreen(page) {
  return page.evaluate(() => {
    const e = window.__playtestQa.jacEntities();
    return { x: e.sx, y: e.sy };
  });
}

async function canvasAt(page, x, y) {
  return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id === 'game-canvas', [x, y]);
}

/** Drag the map until the parked truck sits on bare canvas near `aim`, then tap it and tap Súbete. */
async function realGetIn(page, input, aim) {
  for (let i = 0; i < 10; i++) {
    const s = await truckScreen(page);
    if (Math.hypot(s.x - aim.x, s.y - aim.y) < 40 && (await canvasAt(page, s.x, s.y))) break;
    const dx = Math.max(-260, Math.min(260, aim.x - s.x));
    const dy = Math.max(-260, Math.min(260, aim.y - s.y));
    let start = null;
    for (const [ox, oy] of [[0, 0], [-60, 40], [60, 40], [-60, -40], [60, -40], [0, 90], [0, -90]]) {
      const x0 = aim.x + ox - dx / 2;
      const y0 = aim.y + oy - dy / 2;
      if ((await canvasAt(page, x0, y0)) && (await canvasAt(page, x0 + dx, y0 + dy))) {
        start = { x: x0, y: y0 };
        break;
      }
    }
    if (!start) start = { x: aim.x - dx / 2, y: aim.y - dy / 2 };
    await input.drag(start.x, start.y, start.x + dx, start.y + dy);
    await wait(450);
  }
  const s = await truckScreen(page);
  let tappedIn = false;
  for (const oy of [0, -20]) {
    await input.tap(s.x, s.y + oy);
    for (let i = 0; i < 12 && !tappedIn; i++) {
      await wait(150);
      tappedIn = await realTapSelector(page, input, '.jac-menu [data-jac="in"], .jac-sheet [data-jac="in"], .jac-dock [data-jac="in"]');
    }
    if (tappedIn) break;
  }
  if (!tappedIn) throw new Error(`Súbete never appeared after tapping the truck at ${JSON.stringify(s)}`);
  await page.waitForFunction(() => window.__playtestQa.jac()?.driving === true, null, { timeout: 40_000 });
  await wait(300);
}

const KEY = { up: 'w', down: 's', left: 'a', right: 'd' };

async function holdKeys(page, dirs, ms) {
  for (const d of dirs) await page.keyboard.down(KEY[d]);
  await wait(ms);
  for (const d of dirs) await page.keyboard.up(KEY[d]);
}

async function stickPad(page) {
  const b = await visibleBox(page, '.joystick');
  if (!b) throw new Error('stick pad not visible while driving');
  return b;
}

/** Hold the stick with finger `id` at a vector (unit circle, screen space; y<0 = up). */
async function holdStick(page, input, vec, ms, id = 1) {
  const pad = await stickPad(page);
  const R = 44;
  await input.touchEv('touchStart', [{ x: pad.x, y: pad.y, id }]);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await input.touchEv('touchMove', [{ x: pad.x + vec.x * R * (i / steps), y: pad.y + vec.y * R * (i / steps), id }]);
    await wait(16);
  }
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await wait(100);
    await input.touchEv('touchMove', [{ x: pad.x + vec.x * R, y: pad.y + vec.y * R, id }]);
  }
  await input.touchEv('touchEnd', []);
}

/** Full-deflection stick circle: the finger sweeps the ring `turns` times. */
async function stickCircle(page, input, ms, turns, startDeg = -90, sign = 1) {
  const pad = await stickPad(page);
  const R = 44;
  const at = (deg) => ({ x: pad.x + Math.cos((deg * Math.PI) / 180) * R, y: pad.y + Math.sin((deg * Math.PI) / 180) * R, id: 1 });
  await input.touchEv('touchStart', [{ x: pad.x, y: pad.y, id: 1 }]);
  await input.touchEv('touchMove', [at(startDeg)]);
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = (Date.now() - t0) / ms;
    await input.touchEv('touchMove', [at(startDeg + sign * 360 * turns * f)]);
    await wait(33);
  }
  await input.touchEv('touchEnd', []);
}

/** Desktop "stick circle": walk through the 8 key combos around the compass. */
async function keyCircle(page, ms, turns, sign = 1) {
  const ring = [['up'], ['up', 'right'], ['right'], ['down', 'right'], ['down'], ['down', 'left'], ['left'], ['up', 'left']];
  const seq = sign > 0 ? ring : [ring[0], ...ring.slice(1).reverse()];
  const per = ms / (8 * turns);
  for (let i = 0; i < 8 * turns; i++) await holdKeys(page, seq[i % 8], per);
}

const NOSE = { se: [1, 0], sw: [0, 1], nw: [-1, 0], ne: [0, -1] };

/** Front of the 5-tile body. Snapshot w/h is the 2×2 drive box while driving, so dir decides. */
function nosePoint(pose) {
  const v = NOSE[pose.dir] || [1, 0];
  return { x: pose.cx + v[0] * 2.5, y: pose.cy + v[1] * 2.5 };
}

/** Distance from a point to the unit cell rectangle [cellX, cellX+1] × [cellY, cellY+1]. */
function distToCell(px, py, cellX, cellY) {
  const dx = Math.max(cellX - px, 0, px - (cellX + 1));
  const dy = Math.max(cellY - py, 0, py - (cellY + 1));
  return Math.hypot(dx, dy);
}

function noseDist(pose, cellX, cellY) {
  if (!pose) return Infinity;
  const n = nosePoint(pose);
  return distToCell(n.x, n.y, cellX, cellY);
}

/**
 * Closed-loop driver: reads the pose and steers with real input — W + A/D on desktop, one finger
 * on the stick on phone. Never reverses and never touches the gear buttons.
 * Every change of steer command is pushed to `reroutes` (open-loop holds do not come through here).
 * `contact` keeps steering at that prop cell until the nose is within 0.3 tiles of it.
 * The reported nose distance is the pose at the stop, after the brake, not the closest sample of the chase.
 * `precise` does not skip a waypoint just because the truck is alongside it.
 */
async function driveTo(page, input, waypoints, { timeoutMs = 20_000, arrive = 0.7, stopOnStall = false, contact = null, precise = false } = {}) {
  const touch = input.touch;
  const pad = touch ? await stickPad(page) : null;
  const R = 44;
  const held = new Set();
  const setKeys = async (want) => {
    for (const k of [...held]) if (!want.includes(k)) {
      await page.keyboard.up(KEY[k]);
      held.delete(k);
    }
    for (const k of want) if (!held.has(k)) {
      await page.keyboard.down(KEY[k]);
      held.add(k);
    }
  };
  if (touch) await input.touchEv('touchStart', [{ x: pad.x, y: pad.y, id: 1 }]);
  const t0 = Date.now();
  let i = 0;
  let pose = null;
  const trace = [];
  const reroutes = [];
  let lastCmd = '';
  let restSince = null;
  let stalled = false;
  let contactDist = contact ? Infinity : null;
  let pinSide = 0;
  let pinHold = 0;
  // Segment the truck is following. Bearing-only pursuit turns across a one-tile
  // lane once the waypoint is beside the truck; the cross-track term holds the line.
  let segFrom = null;
  while (Date.now() - t0 < timeoutMs) {
    pose = await page.evaluate(() => window.__playtestQa.jac());
    if (contact) {
      contactDist = noseDist(pose, contact.x, contact.y);
      // Stop on a slow contact. A fast pass through 0.3 coasts off before the brake reading.
      if (contactDist <= 0.3 && Math.abs(pose.vel) < 0.45) break;
    }
    if (Date.now() - t0 > 600) {
      if (Math.abs(pose.vel) < 0.3) restSince ??= Date.now();
      else restSince = null;
      if (stopOnStall && !contact && restSince && Date.now() - restSince > 400) {
        stalled = true;
        break;
      }
    }
    // After the approach point, keep the centre on that point's line and drive
    // straight into the prop. Aiming the nose at the cell centre turns the truck
    // off the only row where the stop is legal.
    const lineY = waypoints.length ? waypoints[waypoints.length - 1].y : contact ? contact.y + 0.5 : 0;
    const wp = i < waypoints.length ? waypoints[i] : contact ? { x: contact.x - 1, y: lineY } : null;
    if (!wp) break;
    // Nosed into something with the target dead ahead: steer (like a driver would) instead of
    // holding plain gas against it.
    const pinned = !!restSince && Date.now() - restSince > 500;
    if (trace.length === 0 || Date.now() - trace.at(-1)[0] > 400) {
      trace.push([Date.now(), +pose.cx.toFixed(2), +pose.cy.toFixed(2), +pose.heading.toFixed(2), pose.dir, i]);
    }
    // jac().x/y is the footprint origin, not the centre.
    const aimFrom = { x: pose.cx, y: pose.cy };
    const dx = wp.x - aimFrom.x;
    const dy = wp.y - aimFrom.y;
    const dist = Math.hypot(dx, dy);
    if (!segFrom) segFrom = { x: aimFrom.x, y: aimFrom.y };
    let e;
    let passedOnLine = false;
    if (i < waypoints.length) {
      const ax = wp.x - segFrom.x;
      const ay = wp.y - segFrom.y;
      const len = Math.hypot(ax, ay) || 1;
      const segH = Math.atan2(ay, ax) / (Math.PI / 2);
      const rx = aimFrom.x - segFrom.x;
      const ry = aimFrom.y - segFrom.y;
      // Positive cross: left of the segment. Steer back toward the line, capped
      // so a one-tile miss is a turn and not a U-turn.
      const cross = (rx * ay - ry * ax) / len;
      const along = (rx * ax + ry * ay) / len;
      const corr = Math.max(-0.28, Math.min(0.28, cross * 0.3));
      const past = along > len - Math.min(arrive, 1);
      // A contact approach that has gone past its line must hand off to the prop
      // aim. Turning back onto a waypoint already beside the truck is the U-turn
      // that leaves the only legal row.
      const contactPast = !!contact && along > len;
      passedOnLine = contactPast || (past && Math.abs(cross) < 1.3);
      // Still on the segment: hold the line. Past it and wide of it: aim at the
      // point itself, or the truck sails off the end of a one-tile road.
      e = past && !passedOnLine ? Math.atan2(dy, dx) / (Math.PI / 2) - pose.heading : segH + corr - pose.heading;
    } else {
      // Bearing to a far point barely notices a one-tile drift, so the truck
      // arrives north of the only row where the nose touches the prop.
      const bearing = Math.atan2(dy, dx) / (Math.PI / 2);
      const cross = contact ? aimFrom.y - lineY : 0;
      const corr = Math.max(-0.3, Math.min(0.3, cross * 0.45));
      e = bearing + corr - pose.heading;
    }
    e = ((((e + 2) % 4) + 4) % 4) - 2;
    // Arrived, or already alongside / past it (the van cannot turn tighter than ~2 tiles).
    // The contact chase ignores that shortcut and stops only when the nose touches the cell.
    // A contact chase has to actually reach the approach point. The "already
    // alongside" shortcut leaves the nose a tile off a one-cell prop.
    if (i < waypoints.length && (dist < arrive || passedOnLine || (!contact && !precise && dist < 1.6 && Math.abs(e) > 0.8))) {
      segFrom = waypoints[i];
      i++;
      continue;
    }
    // Desktop steer is a full-lock key. Held across a 7 fps frame it yaws ~20° and the
    // truck rocks off a one-tile lane. Pulse it unless the corner still needs a real turn.
    // Closing on a one-cell prop: a pinned full-lock steer walks the nose off the cell.
    const closing = !!contact && i >= waypoints.length && contactDist != null && contactDist < 2.2;
    const absE = Math.abs(e);
    let side;
    // Full lock on a closing row walks a 7 fps frame off the only line where the
    // nose can legally touch the prop. Pulse a small correction instead.
    if (closing) {
      if (absE > 0.4) side = Math.sign(e);
      else if (absE > 0.06) {
        const period = 280;
        const duty = Math.min(0.22, 0.06 + absE * 0.28);
        side = Date.now() % period < duty * period ? Math.sign(e) : 0;
      } else side = 0;
    }
    else if (pinned) {
      // A sign flip every sample shuttles the reverse arc. Hold one lock long enough to yaw off.
      if (!pinSide || Date.now() > pinHold) {
        pinSide = e < 0 ? -1 : 1;
        pinHold = Date.now() + 1400;
      }
      side = pinSide;
    } else {
      pinSide = 0;
      // Full lock only for a real corner. Anything under ~70° is a pulse, or the
      // heading swings past the line and the sprite steps on a few tenths of a tile.
      if (absE > 0.5) side = Math.sign(e);
      else if (absE > 0.1) {
        const period = 280;
        const duty = Math.min(0.34, 0.1 + absE * 0.35);
        side = Date.now() % period < duty * period ? Math.sign(e) : 0;
      } else side = 0;
    }
    const cmd = side > 0 ? 'right' : side < 0 ? 'left' : 'straight';
    if (cmd !== lastCmd) {
      if (lastCmd) {
        reroutes.push({
          t: Date.now() - t0,
          from: lastCmd,
          to: cmd,
          pinned,
          cx: +pose.cx.toFixed(2),
          cy: +pose.cy.toFixed(2),
          dir: pose.dir,
        });
      }
      lastCmd = cmd;
    }
    if (touch) {
      // Same pulse as the desktop keys. A proportional stick (e·2.2) full-locks
      // on a 20° error and walks the 5×3 off the one-tile highway.
      // Near a waypoint a full stick overshoots the bearing and U-turns in the lane.
      // On the last row a small proportional deflection tracks the line. A pulse
      // at this frame rate walks the nose off it.
      const contactPhase = i >= waypoints.length && !!contact;
      const mag = contactPhase ? 0 : closing ? 0.35 : pinned ? 0.9 : absE > 0.5 ? 0.8 : 0.42;
      const sx = contactPhase ? Math.max(-0.55, Math.min(0.55, e * 1.1)) : mag * side;
      // Creep the last tile and brake once the nose is on the cell, so a frame
      // cannot coast through the 0.3 window. Coast the stick through real turns.
      const gy = contactPhase
        ? contactDist < 0.55 && Math.abs(pose.vel) > 0.3
          ? -0.85
          : absE > 0.35
            ? 0.1
            : 0.36
        : closing
          ? contactDist < 0.55 && Math.abs(pose.vel) > 0.3
            ? -0.85
            : 0.4
          : pinned
            ? 0.7
            : absE > 0.28
              ? 0.12
              : 0.55;
      await input.touchEv('touchMove', [{ x: pad.x + sx * R, y: pad.y - gy * R, id: 1 }]);
    } else {
      // Coast through any real turn. Full gas on a 7 fps frame carries the truck
      // past the corner before the heading catches up, and a fast straight drifts
      // off the one row where the nose can legally touch the prop.
      const gasOn = pinned || (closing ? absE < 0.16 && !(contactDist < 0.55 && Math.abs(pose.vel) > 0.3) : absE < 0.28 || Math.abs(pose.vel) < 1.15);
      const keys = [];
      if (closing && contactDist < 0.55 && Math.abs(pose.vel) > 0.3) keys.push('down');
      else if (gasOn) keys.push('up');
      if (side > 0) keys.push('right');
      else if (side < 0) keys.push('left');
      await setKeys(keys);
    }
    await wait(60);
  }
    // Brake on the contact pose, then read the nose once the truck has actually stopped.
    // The minimum during the chase is not the stop distance: coasting off the prop used to pass a miss.
    if (contact) {
      const tBrake = Date.now();
      while (Date.now() - tBrake < 700) {
        pose = await page.evaluate(() => window.__playtestQa.jac());
        if (Math.abs(pose.vel) < 0.08) break;
        if (touch) await input.touchEv('touchMove', [{ x: pad.x, y: pad.y + R, id: 1 }]);
        else await setKeys(['down']);
        await wait(40);
      }
      pose = await page.evaluate(() => window.__playtestQa.jac());
      contactDist = noseDist(pose, contact.x, contact.y);
    }
  if (touch) await input.touchEv('touchEnd', []);
  else await setKeys([]);
  const reached = i >= waypoints.length && (!contact || (contactDist != null && contactDist <= 0.3));
  return {
    reached,
    reroutes,
    ...(contact ? { contactDist: contactDist == null ? null : +contactDist.toFixed(3) } : {}),
    ...(stopOnStall ? { stalled } : {}),
    at: pose ? [+pose.cx.toFixed(2), +pose.cy.toFixed(2), pose.dir] : null,
    ...(reached ? {} : { trace: trace.map(([t, ...r]) => [t - t0, ...r]) }),
  };
}

/** Gas straight ahead until the truck has been at rest for 400 ms (it hit something) or `ms` passes. */
async function startSampling(page) {
  await page.evaluate(() => window.__gate.start());
}

async function stopSampling(page) {
  return page.evaluate(() => {
    window.__gate.stop();
    const g = window.__gate;
    return { samples: g.samples, dockMutations: g.dockMutations, gearReplaced: g.gearReplaced };
  });
}

function gasSteer(s, touch) {
  if (touch) return s.sActive && s.sy < -0.3 && Math.abs(s.sx) > 0.3;
  const gas = s.keys.includes('w') || s.keys.includes('arrowup');
  const steer = s.keys.includes('a') || s.keys.includes('d');
  return gas && steer && !s.keys.includes('s');
}

/** G2: longest continuous gas+steer stretch with < G2_MIN_TRAVEL travel inside any 1.5 s window. */
function deadlocks(samples, touch) {
  const bad = [];
  let i = 0;
  while (i < samples.length) {
    if (!gasSteer(samples[i], touch)) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < samples.length && gasSteer(samples[j + 1], touch)) j++;
    let a = i;
    let travel = 0;
    for (let b = i + 1; b <= j; b++) {
      travel += Math.hypot(samples[b].cx - samples[b - 1].cx, samples[b].cy - samples[b - 1].cy);
      while (samples[b].t - samples[a].t > G2_WINDOW_MS) {
        travel -= Math.hypot(samples[a + 1].cx - samples[a].cx, samples[a + 1].cy - samples[a].cy);
        a++;
      }
      if (samples[b].t - samples[a].t >= G2_WINDOW_MS - 40 && travel < G2_MIN_TRAVEL) {
        bad.push({ at: [+samples[b].cx.toFixed(2), +samples[b].cy.toFixed(2)], dir: samples[b].dir, gear: samples[b].gear, t: Math.round(samples[b].t) });
        while (b <= j && samples[b].t - samples[a].t < G2_WINDOW_MS * 2) b++;
        break;
      }
    }
    i = j + 1;
  }
  return bad;
}

const FACING_DEG = { se: 0, sw: 90, nw: 180, ne: 270 };

function angleDiff(a, b) {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** G3: per-frame motion direction vs the sprite drawn at the end of that frame. */
function spriteMismatch(samples) {
  let worst = { deg: 0 };
  let frames = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dtMs = b.t - a.t;
    if (!(dtMs > 0 && dtMs <= 400)) continue;
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.004) continue;
    frames++;
    const motion = (Math.atan2(dy, dx) * 180) / Math.PI;
    const back = b.vel < -0.05 || (Math.abs(b.vel) <= 0.05 && a.vel < -0.05);
    const face = FACING_DEG[b.dir] + (back ? 180 : 0);
    const deg = angleDiff(motion, face);
    if (deg > worst.deg) worst = { deg: +deg.toFixed(1), at: [+b.cx.toFixed(2), +b.cy.toFixed(2)], dir: b.dir, prevDir: a.dir, heading: +b.heading.toFixed(3), vel: +b.vel.toFixed(2) };
  }
  return { ...worst, frames };
}

/** G4: needle jump per frame normalised to a 60 fps frame, dock colour flashes, gear identity. */
function dockStability(samples, dockMutations, gearReplaced) {
  let maxJump = 0;
  let where = null;
  const bgs = new Set();
  let orange = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = Math.max(1, b.t - a.t);
    for (const k of ['rpmDeg', 'mphDeg']) {
      if (a[k] == null || b[k] == null) continue;
      const jump = angleDiff(b[k], a[k]) * Math.min(1, 16.7 / dt);
      if (jump > maxJump) {
        maxJump = jump;
        where = { needle: k, from: +a[k].toFixed(1), to: +b[k].toFixed(1), dtMs: Math.round(dt) };
      }
    }
    if (b.dockBg) bgs.add(b.dockBg);
    if (b.dockShadow && /255,\s*181,\s*71/.test(b.dockShadow)) orange++;
  }
  return { maxNeedleJumpDeg: +maxJump.toFixed(1), where, dockBackgrounds: [...bgs], orangeFrames: orange, dockMutations, gearReplaced };
}

const G7_FLOOR = 0.35;
const FACING_STEP = { se: 0, sw: 1, nw: 2, ne: 3 };

/** G7: one animation frame must not jump farther than the speed budget. */
function teleports(samples) {
  const bad = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    const dtMs = b.t - a.t;
    // A gap or a backwards clock is a missed frame or a new session, not one step.
    if (!(dtMs > 0 && dtMs <= 400)) continue;
    const dt = dtMs / 1000;
    const lim = Math.max(G7_FLOOR, 1.6 * Math.abs(b.vel) * dt + 0.08);
    if (d > lim + 1e-3) {
      bad.push({
        d: +d.toFixed(3),
        lim: +lim.toFixed(3),
        dtMs: Math.round(b.t - a.t),
        vel: +b.vel.toFixed(2),
        at: [+b.cx.toFixed(2), +b.cy.toFixed(2)],
      });
    }
  }
  return bad;
}

function facingSteps(from, to) {
  const d = Math.abs((FACING_STEP[from] ?? 0) - (FACING_STEP[to] ?? 0)) % 4;
  return Math.min(d, 4 - d);
}

/** G8: a sprite step is 90°. It needs ≥ 0.3 tiles since the previous facing. */
function spins(samples) {
  const bad = [];
  let worst = null;
  if (samples.length < 2) return { bad, worst };
  let travel = 0;
  let dir = samples[0].dir;
  for (let i = 1; i < samples.length; i++) {
    const dtMs = samples[i].t - samples[i - 1].t;
    if (!(dtMs > 0 && dtMs <= 400)) {
      dir = samples[i].dir;
      travel = 0;
      continue;
    }
    travel += Math.hypot(samples[i].cx - samples[i - 1].cx, samples[i].cy - samples[i - 1].cy);
    if (samples[i].dir === dir) continue;
    if (facingSteps(dir, samples[i].dir) >= 1) {
      const step = {
        from: dir,
        to: samples[i].dir,
        travel: +travel.toFixed(3),
        at: [+samples[i].cx.toFixed(2), +samples[i].cy.toFixed(2)],
      };
      if (!worst || step.travel < worst.travel) worst = step;
      if (travel < 0.3) bad.push(step);
    }
    dir = samples[i].dir;
    travel = 0;
  }
  return { bad, worst };
}

function headingWrap(d) {
  let x = d;
  while (x > 2) x -= 4;
  while (x < -2) x += 4;
  return x;
}

/** Largest |heading − sprite| while the truck is driving and essentially stopped with no input. */
function restHeading(samples, touch) {
  let worst = 0;
  let at = null;
  for (const s of samples) {
    if (!s.driving || Math.abs(s.vel) > 0.08) continue;
    if (touch) {
      if (s.sActive) continue;
    } else if (/[wasd]|arrow/.test(s.keys || '')) continue;
    const face = FACING_STEP[s.dir] ?? 0;
    const deg = Math.abs(headingWrap(s.heading - face)) * 90;
    if (deg > worst) {
      worst = deg;
      at = [+s.cx.toFixed(2), +s.cy.toFixed(2), s.dir];
    }
  }
  return { deg: +worst.toFixed(1), at };
}

function footprintHits(samples) {
  return samples.filter((s) => s.driving && s.blocked);
}

/** Longest gas+steer stretch that barely moves, and the biggest one-frame heading step. */
function turnAtSpeed(samples) {
  let worstStop = 0;
  let stopAt = null;
  let runT = 0;
  let runD = 0;
  let runAt = null;
  let maxDh = 0;
  let dhAt = null;
  const face = { se: 0, sw: 1, nw: 2, ne: 3 };
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dtMs = b.t - a.t;
    if (!(dtMs > 0 && dtMs <= 400)) {
      runT = 0;
      runD = 0;
      continue;
    }
    let dh = b.heading - a.heading;
    while (dh > 2) dh -= 4;
    while (dh < -2) dh += 4;
    if (Math.abs(dh) > maxDh) {
      maxDh = Math.abs(dh);
      dhAt = [+b.cx.toFixed(2), +b.cy.toFixed(2), b.dir];
    }
    const movingInput = b.driving && (b.sActive ? b.sy < -0.3 : /w|arrowup/.test(b.keys || ''));
    const steered = b.sActive ? Math.abs(b.sx) > 0.3 : /a|d|arrowleft|arrowright/.test(b.keys || '');
    const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
    if (movingInput && steered && d < 0.04 && Math.abs(b.vel) < 0.25) {
      if (runT === 0) runAt = [+b.cx.toFixed(2), +b.cy.toFixed(2)];
      runT += dtMs;
      runD += d;
      if (runT >= 500 && runD < 0.15 && runT > worstStop) {
        worstStop = runT;
        stopAt = runAt;
      }
    } else {
      runT = 0;
      runD = 0;
    }
  }
  let h0 = samples[0]?.heading ?? 0;
  let h1 = h0;
  for (const s of samples) {
    if (s.driving) {
      h1 = s.heading;
    }
  }
  let turned = h1 - h0;
  while (turned > 2) turned -= 4;
  while (turned < -2) turned += 4;
  return {
    turned: +Math.abs(turned).toFixed(3),
    stopMs: Math.round(worstStop),
    stopAt,
    maxDh: +maxDh.toFixed(3),
    dhAt,
    endDir: samples.at(-1)?.dir,
    startFace: face[samples[0]?.dir] ?? 0,
  };
}

function fpsOf(samples) {
  if (samples.length < 2) return 0;
  return +(((samples.length - 1) * 1000) / (samples.at(-1).t - samples[0].t)).toFixed(1);
}

function travelOf(samples) {
  let d = 0;
  for (let i = 1; i < samples.length; i++) d += Math.hypot(samples[i].cx - samples[i - 1].cx, samples[i].cy - samples[i - 1].cy);
  return d;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {});
}

async function newSession(browser, kind) {
  const opts =
    kind === 'phone'
      ? { ...devices['iPhone X'], hasTouch: true, isMobile: true }
      : { viewport: { width: 1440, height: 900 } };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const cdp = await ctx.newCDPSession(page);
  const input = makeInput(page, cdp, kind === 'phone');
  await boot(page, input);
  const vp = page.viewportSize();
  const aim = kind === 'phone' ? { x: vp.width / 2, y: vp.height * 0.42 } : { x: vp.width * 0.55, y: vp.height * 0.45 };
  return { ctx, page, input, errors, aim, vp };
}

async function runViewport(browser, kind) {
  const touch = kind === 'phone';
  const tag = touch ? '375' : '1440';
  const res = { viewport: tag, runs: {} };
  const all = [];
  /** Runs that start from the spawn pose: any gas + steer stall there fails G2. */
  const spawnSeq = [];
  const errors = [];
  let dock = null;
  let stickTrack = null;

  // Run 1: G1, then gas + steer combos and a stick circle from where it stopped.
  if (process.env.QA_SKIP_FREE === '1') {
    res.runs.g1 = { dist: 1, seat: { gear: 'D' }, end: { gear: 'D' } };
    res.runs.free = { travel: 0, fps: 0 };
    if (!touch) dock = { gearReplaced: 0, maxNeedleJumpDeg: 0, dockBackgrounds: ['rgb(0,0,0)'], orangeFrames: 0 };
  } else {
    const s = await newSession(browser, kind);
    await realGetIn(s.page, s.input, s.aim);
    const seat = await s.page.evaluate(() => window.__playtestQa.jac());
    await shot(s.page, `${tag}-01-seated`);
    await startSampling(s.page);
    if (touch) await holdStick(s.page, s.input, { x: 0, y: -1 }, 1500);
    else await holdKeys(s.page, ['up'], 1500);
    const g1 = await stopSampling(s.page);
    const after = await s.page.evaluate(() => window.__playtestQa.jac());
    const g1Dist = Math.hypot(after.cx - seat.cx, after.cy - seat.cy);
    res.runs.g1 = {
      seat: { cx: +seat.cx.toFixed(2), cy: +seat.cy.toFixed(2), dir: seat.dir, gear: seat.gear },
      end: { cx: +after.cx.toFixed(2), cy: +after.cy.toFixed(2), gear: after.gear },
      dist: +g1Dist.toFixed(2),
      fps: fpsOf(g1.samples),
    };
    all.push(g1.samples);
    await shot(s.page, `${tag}-02-after-gas`);

    await startSampling(s.page);
    const combos = [['up', 'left'], ['up', 'right'], ['up', 'right'], ['up', 'left'], ['up'], ['up', 'left'], ['up', 'right']];
    for (const c of combos) {
      if (touch) {
        const v = { x: c.includes('left') ? -0.75 : c.includes('right') ? 0.75 : 0, y: -0.66 };
        await holdStick(s.page, s.input, v, 1500);
      } else await holdKeys(s.page, c, 1500);
    }
    if (touch) await stickCircle(s.page, s.input, 6000, 2);
    else await keyCircle(s.page, 6000, 2);
    const free = await stopSampling(s.page);
    all.push(free.samples);
    spawnSeq.push(g1.samples, free.samples);
    res.runs.free = { travel: +travelOf(free.samples).toFixed(2), fps: fpsOf(free.samples) };
    if (!touch) dock = dockStability([...g1.samples, ...free.samples], g1.dockMutations + free.dockMutations, g1.gearReplaced + free.gearReplaced);
    await shot(s.page, `${tag}-03-free`);
    errors.push(...s.errors);
    await s.ctx.close();
  }

  // Run 2: from spawn, W+D 1.5 s then alternating W+A / W+D (spec B2 acceptance), then a reverse stick circle.
  if (process.env.QA_SKIP_FREE === '1') {
    res.runs.spawnSteer = { travel: 0, end: [0, 0, 'se'], fps: 0 };
  } else {
    const s = await newSession(browser, kind);
    await realGetIn(s.page, s.input, s.aim);
    await startSampling(s.page);
    const right = touch ? { x: 0.75, y: -0.66 } : ['up', 'right'];
    const left = touch ? { x: -0.75, y: -0.66 } : ['up', 'left'];
    for (const c of [right, left, right, left]) {
      if (touch) await holdStick(s.page, s.input, c, 1500);
      else await holdKeys(s.page, c, 1500);
    }
    if (touch) await stickCircle(s.page, s.input, 8000, 2, -90, -1);
    else await keyCircle(s.page, 8000, 2, -1);
    const r = await stopSampling(s.page);
    all.push(r.samples);
    spawnSeq.push(r.samples);
    const end = await s.page.evaluate(() => window.__playtestQa.jac());
    res.runs.spawnSteer = { travel: +travelOf(r.samples).toFixed(2), end: [+end.cx.toFixed(2), +end.cy.toFixed(2), end.dir], fps: fpsOf(r.samples) };
    await shot(s.page, `${tag}-04-spawn-steer`);
    errors.push(...s.errors);
    await s.ctx.close();
  }

  // G10: spawn, 0.5 s straight, then full steer. Both sides. A finished 90° turn
  // does not stop, and the sprite does not yaw a third of a turn in one frame.
  {
    const attempts = [];
    for (const side of ['right', 'left']) {
      const s = await newSession(browser, kind);
      await realGetIn(s.page, s.input, s.aim);
      await startSampling(s.page);
      if (touch) await holdStick(s.page, s.input, { x: 0, y: -1 }, 500);
      else await holdKeys(s.page, ['up'], 500);
      const steer = side === 'right' ? { x: 1, y: -1 } : { x: -1, y: -1 };
      if (touch) await holdStick(s.page, s.input, steer, 2800);
      else await holdKeys(s.page, side === 'right' ? ['up', 'right'] : ['up', 'left'], 2800);
      const r = await stopSampling(s.page);
      all.push(r.samples);
      spawnSeq.push(r.samples);
      const rep = turnAtSpeed(r.samples);
      attempts.push({ side, ...rep, ok: rep.turned >= 0.9 && rep.stopMs < 500 && rep.maxDh <= 0.3 });
      await shot(s.page, `${tag}-g10-${side}`);
      errors.push(...s.errors);
      await s.ctx.close();
    }
    const done = attempts.filter((a) => a.ok).length;
    res.runs.g10 = { attempts, done, of: attempts.length };
  }

  // Run 3: drive (real input) next to the cardón cactus at (26,20) — the old (27.15,18.50) /
  // (27.93,18.50) stop area — then W+D / W+A holds toward it and a reverse-direction stick circle.
  {
    const s = await newSession(browser, kind);
    await realGetIn(s.page, s.input, s.aim);
    await startSampling(s.page);
    // East along the open y≈5 road (Teresa's roof starts at y=8), south in the
    // x≈37.5 lane, then west so the nose meets the cardón's east edge. A west
    // approach cannot get the nose inside 0.3 without covering the cell.
    const route = await driveTo(
      s.page,
      s.input,
      [
        { x: 28.0, y: 5.0 },
        { x: 35.3, y: 5.0 },
        { x: 37.5, y: 19.0 },
      ],
      { timeoutMs: 32_000, arrive: 1.15, precise: true },
    );
    const cactusContact = { x: 26, y: 20 };
    const cactusLine = { x: 31.6, y: 20.75 };
    let chase = await driveTo(s.page, s.input, [cactusLine], {
      contact: cactusContact,
      timeoutMs: 22_000,
      precise: true,
      arrive: 1.1,
    });
    if ((chase.contactDist ?? 1) > 0.3) {
      await driveTo(s.page, s.input, [{ x: 36.8, y: 20.2 }], { timeoutMs: 12_000, arrive: 1.2, precise: true });
      chase = await driveTo(s.page, s.input, [cactusLine], {
        contact: cactusContact,
        timeoutMs: 16_000,
        precise: true,
        arrive: 1.1,
      });
    }
    const atCactus = await s.page.evaluate(() => window.__playtestQa.jac());
    const cactusNose = chase.contactDist ?? noseDist(atCactus, 26, 20);
    await shot(s.page, `${tag}-04a-cactus`);
    const right = touch ? { x: 0.75, y: -0.66 } : ['up', 'right'];
    const left = touch ? { x: -0.75, y: -0.66 } : ['up', 'left'];
    for (const c of [right, left, right, left]) {
      if (touch) await holdStick(s.page, s.input, c, 1500);
      else await holdKeys(s.page, c, 1500);
    }
    if (touch) await stickCircle(s.page, s.input, 8000, 2, -90, -1);
    else await keyCircle(s.page, 8000, 2, -1);
    // The circle can finish back on the prop. Drive clear so the stop is a tile away.
    await driveTo(s.page, s.input, [{ x: 36.2, y: 18.6 }], { timeoutMs: 10_000, arrive: 1.3, precise: true });
    const r2 = await stopSampling(s.page);
    all.push(r2.samples);
    const end = await s.page.evaluate(() => window.__playtestQa.jac());
    const endBlocked = await s.page.evaluate(() => !!window.__playtestQa.jacFootprintBlocked?.());
    res.runs.cactus = {
      route,
      chase,
      reroutes: [...route.reroutes, ...chase.reroutes],
      atCactus: [+atCactus.cx.toFixed(2), +atCactus.cy.toFixed(2), atCactus.dir],
      noseDist: +cactusNose.toFixed(3),
      nearCactus: cactusNose <= 0.3,
      travel: +travelOf(r2.samples).toFixed(2),
      end: [+end.cx.toFixed(2), +end.cy.toFixed(2), end.dir],
      endLegal: !endBlocked,
      freed: !endBlocked && Math.hypot(end.cx - atCactus.cx, end.cy - atCactus.cy) > 1,
      gearsUsed: [...new Set(r2.samples.map((x) => x.gear))],
      fps: fpsOf(r2.samples),
    };
    await shot(s.page, `${tag}-04b-cactus-free`);
    errors.push(...s.errors);
    await s.ctx.close();
  }

  // Run 4: drive (real input) along y≈17.5 into the tree at (40,18), then steer + gas / stick circle to get free without R.
  {
    const s = await newSession(browser, kind);
    await realGetIn(s.page, s.input, s.aim);
    await startSampling(s.page);
    // The y≈17 line clips the tree, and the gap south of it is one row too narrow
    // for the 5×3. Go east on y≈5 all the way past the block, south at x≈55, then
    // west so the nose sits on the tree's east edge.
    const route = await driveTo(
      s.page,
      s.input,
      [
        { x: 28.0, y: 5.0 },
        { x: 53.0, y: 5.0 },
        // Desktop keys turn west during the chase from y≈16.4. The phone finishes
        // that turn on the row first; a key-style pulse there hunts off the line.
        ...(touch
          ? [
              { x: 55.2, y: 16.2 },
              { x: 50.5, y: 18.5 },
            ]
          : [{ x: 55.2, y: 16.4 }]),
      ],
      { timeoutMs: 40_000, arrive: 1.15, precise: true },
    );
    // A 90° turn from south toward west swings the centre about two tiles south.
    // Starting at y≈16.4 lands that arc on the row (y≈18.5) where an NW stop
    // puts the nose on the tree. A second pass recovers a miss without R.
    const treeContact = { x: 40, y: 18 };
    const treeLine = { x: 48.5, y: 18.5 };
    let chase = await driveTo(s.page, s.input, [treeLine], {
      contact: treeContact,
      timeoutMs: 22_000,
      precise: true,
      arrive: 1.0,
    });
    if ((chase.contactDist ?? 1) > 0.3) {
      const pose = await s.page.evaluate(() => window.__playtestQa.jac());
      // A second pass only helps while the truck is still on the east approach.
      // Beside the tree, turning around swings south into the wall.
      const onApproach = pose.cx > 50 && pose.cy > 14 && pose.cy < 19.2;
      if (onApproach) {
        const again = await driveTo(s.page, s.input, [treeLine], {
          contact: treeContact,
          timeoutMs: 16_000,
          precise: true,
          arrive: 1.0,
        });
        if ((again.contactDist ?? 9) < (chase.contactDist ?? 9)) chase = again;
      }
    }
    const atTree = await s.page.evaluate(() => window.__playtestQa.jac());
    const treeNose = chase.contactDist ?? noseDist(atTree, 40, 18);
    await shot(s.page, `${tag}-05-tree`);
    if (touch) {
      await holdStick(s.page, s.input, { x: 0.75, y: -0.66 }, 1500);
      await stickCircle(s.page, s.input, 8000, 2);
    } else {
      await holdKeys(s.page, ['up', 'right'], 1500);
      await keyCircle(s.page, 8000, 2);
    }
    // A tight nose-in pin shuttles if the wheel keeps changing direction. Hold one
    // lock long enough for the reverse arc to yaw clear, and stop once it is a tile away.
    {
      const origin = atTree;
      const clearNow = async () => {
        const pose = await s.page.evaluate(() => window.__playtestQa.jac());
        const blocked = await s.page.evaluate(() => !!window.__playtestQa.jacFootprintBlocked?.());
        return Math.hypot(pose.cx - origin.cx, pose.cy - origin.cy) > 1.2 && !blocked;
      };
      for (const side of [1, -1]) {
        if (await clearNow()) break;
        if (touch) await holdStick(s.page, s.input, { x: side * 0.85, y: -0.7 }, 2200);
        else await holdKeys(s.page, side > 0 ? ['up', 'right'] : ['up', 'left'], 2200);
      }
      if (!(await clearNow())) {
        await driveTo(s.page, s.input, [{ x: 52.5, y: 18.35 }], { timeoutMs: 12_000, arrive: 1.4, precise: true });
      }
    }
    const r3 = await stopSampling(s.page);
    all.push(r3.samples);
    const end = await s.page.evaluate(() => window.__playtestQa.jac());
    const endBlocked = await s.page.evaluate(() => !!window.__playtestQa.jacFootprintBlocked?.());
    const gearsUsed = [...new Set(r3.samples.map((x) => x.gear))];
    res.runs.tree = {
      route,
      chase,
      reroutes: [...route.reroutes, ...chase.reroutes],
      atTree: [+atTree.cx.toFixed(2), +atTree.cy.toFixed(2), atTree.dir],
      noseDist: +treeNose.toFixed(3),
      touchingTree: treeNose <= 0.3,
      end: [+end.cx.toFixed(2), +end.cy.toFixed(2), end.dir],
      endLegal: !endBlocked,
      freed: !endBlocked && Math.hypot(end.cx - atTree.cx, end.cy - atTree.cy) > 1,
      gearsUsed,
    };
    if (touch) {
      // B6: a second finger on the map must not steal or release the stick. (CDP touchEnd lists
      // the points that lift.)
      const pad = await stickPad(s.page);
      const stick = { x: pad.x, y: pad.y - 44, id: 1 };
      await s.input.touchEv('touchStart', [{ x: pad.x, y: pad.y, id: 1 }]);
      await s.input.touchEv('touchMove', [stick]);
      await wait(150);
      const other = { x: s.vp.width * 0.3, y: s.vp.height * 0.3, id: 2 };
      const moved = { ...other, x: other.x + 40, y: other.y + 60 };
      await s.input.touchEv('touchStart', [stick, other]);
      await wait(80);
      await s.input.touchEv('touchMove', [stick, moved]);
      await wait(120);
      const during = await s.page.evaluate(() => window.__playtestQa.joystick());
      await s.input.touchEv('touchEnd', [moved]);
      await wait(150);
      const afterLift = await s.page.evaluate(() => window.__playtestQa.joystick());
      await s.input.touchEv('touchEnd', [stick]);
      await wait(100);
      const released = await s.page.evaluate(() => window.__playtestQa.joystick());
      stickTrack = {
        during: { x: +during.x.toFixed(2), y: +during.y.toFixed(2), active: during.active },
        afterOtherLift: { x: +afterLift.x.toFixed(2), y: +afterLift.y.toFixed(2), active: afterLift.active },
        released: { active: released.active },
        ok: during.active && during.y < -0.8 && afterLift.active && afterLift.y < -0.8 && !released.active,
      };
    }
    errors.push(...s.errors);
    await s.ctx.close();
  }

  const samples = all.flat();
  const dl = all.flatMap((x) => deadlocks(x, touch));
  if (process.env.QA_DUMP_SAMPLES) {
    const near = (d) => samples.filter((x) => Math.abs(x.t - d.t) < 2500);
    res.deadlockSamples = dl.map((d) => ({ ...d, samples: near(d) }));
  }
  const g3 = all.map(spriteMismatch).reduce((a, b) => (b.deg > a.deg ? { ...b, frames: a.frames + b.frames } : { ...a, frames: a.frames + b.frames }));
  const g7 = all.flatMap((x) => teleports(x));
  const spinReports = all.map((x) => spins(x));
  const g8 = spinReports.flatMap((x) => x.bad);
  const g8Worst = spinReports.reduce((a, b) => (!a || (b.worst && b.worst.travel < a.travel) ? b.worst || a : a), null);
  const g9 = all.flatMap((x) => footprintHits(x));
  const rest = restHeading(samples, touch);
  res.stats = {
    overlapFrames: g9.length,
    drivingFrames: samples.filter((s) => s.driving).length,
    worstSpriteStep: g8Worst,
    worstRestHeadingDeg: rest.deg,
    worstRestHeadingAt: rest.at,
    deadlocks: dl.length,
  };
  const stickHidden = touch ? samples.filter((x) => x.driving && !x.stickVisible).length : 0;
  const freedOk = (r, touching) => touching && r.freed && !r.gearsUsed.includes('R');
  const treeOk = freedOk(res.runs.tree, res.runs.tree.touchingTree);
  const cactusOk = freedOk(res.runs.cactus, res.runs.cactus.nearCactus);
  const rerouteN = (res.runs.cactus.reroutes?.length ?? 0) + (res.runs.tree.reroutes?.length ?? 0);

  res.gates = {
    G1: { pass: res.runs.g1.dist >= 1, detail: `seat ${JSON.stringify(res.runs.g1.seat)} → moved ${res.runs.g1.dist} tiles in 1.5 s (gear ${res.runs.g1.end.gear})` },
    G2: {
      pass: dl.length === 0 && treeOk && cactusOk,
      detail:
        `gas+steer windows with <${G2_MIN_TRAVEL} tile travel: ${dl.length} ${JSON.stringify(dl.slice(0, 4))}; ` +
        `cactus nose ${res.runs.cactus.noseDist} freed without R=${cactusOk}; ` +
        `tree nose ${res.runs.tree.noseDist} freed without R=${treeOk}; ` +
        `closed-loop reroutes logged: ${rerouteN}`,
    },
    G3: { pass: g3.deg <= G3_MAX_DEG, detail: `worst ${g3.deg}° over ${g3.frames} moving frames ${JSON.stringify(g3)}` },
    G4: touch
      ? { pass: true, detail: 'n/a (phone uses the bar, not the dock)' }
      : {
          pass:
            dock.gearReplaced === 0 &&
            dock.maxNeedleJumpDeg <= G4_MAX_NEEDLE_DEG &&
            dock.dockBackgrounds.length <= 1 &&
            dock.orangeFrames === 0,
          detail: JSON.stringify(dock),
        },
    G5: touch
      ? { pass: stickHidden === 0 && !!stickTrack?.ok, detail: `stick hidden in ${stickHidden} driving frames; multi-touch ${JSON.stringify(stickTrack)}` }
      : { pass: true, detail: 'n/a (desktop has no stick)' },
    G6: { pass: errors.length === 0, detail: errors.length ? errors.slice(0, 5).join(' | ') : '0 console errors' },
    G7: {
      pass: g7.length === 0,
      detail: g7.length ? `${g7.length} frames over the step cap ${JSON.stringify(g7.slice(0, 3))}` : 'no per-frame teleport',
    },
    G8: {
      pass: g8.length === 0,
      detail: g8.length
        ? `${g8.length} sprite spins ${JSON.stringify(g8.slice(0, 3))}`
        : `no 90° sprite step under 0.3 tiles; smallest step ${g8Worst ? g8Worst.travel : 'n/a'}`,
    },
    G9: {
      pass: g9.length === 0,
      detail: g9.length
        ? `${g9.length} driving frames with the footprint on a blocked cell ${JSON.stringify({ at: [+g9[0].cx.toFixed(2), +g9[0].cy.toFixed(2)], dir: g9[0].dir, vel: +g9[0].vel.toFixed(2) })}`
        : `0 overlapping driving frames of ${res.stats.drivingFrames}`,
    },
    G10: {
      pass: (res.runs.g10?.of ?? 0) > 0 && res.runs.g10.done / res.runs.g10.of >= 0.75,
      detail: `turn-at-speed ${res.runs.g10?.done ?? 0}/${res.runs.g10?.of ?? 0} ${JSON.stringify(res.runs.g10?.attempts ?? [])}`,
    },
  };
  return res;
}

/** Tap a tile the 5×3 cannot cross and confirm the unreachable toast, not a spin. */
async function stallProbe(browser, kind) {
  const s = await newSession(browser, kind);
  await realGetIn(s.page, s.input, s.aim);
  const taps = [
    [24, 20],
    [22, 18],
  ];
  const log = [];
  for (const [x, y] of taps) {
    const before = await s.page.evaluate(() => window.__playtestQa.jac());
    const t0 = Date.now();
    await s.page.evaluate(([tx, ty]) => window.__playtestQa.tapMapTile(tx, ty), [x, y]);
    let toastAt = null;
    let toast = '';
    let prev = before;
    const steps = [];
    let pose = before;
    while (Date.now() - t0 < 8000) {
      await wait(200);
      pose = await s.page.evaluate(() => window.__playtestQa.jac());
      const text = await s.page.evaluate(() => {
        const el = document.getElementById('playtest-toast');
        return el && el.classList.contains('playtest-toast--visible') ? el.textContent : '';
      });
      if (pose.dir !== prev.dir) {
        steps.push({
          from: prev.dir,
          to: pose.dir,
          travel: +Math.hypot(pose.cx - prev.cx, pose.cy - prev.cy).toFixed(3),
        });
        prev = pose;
      }
      if (text && toastAt == null) {
        toastAt = Date.now() - t0;
        toast = text;
      }
      if (toastAt != null && pose.pathN === 0 && !pose.driveGoal) break;
    }
    log.push({
      tap: [x, y],
      toastAt,
      toast,
      pathN: pose.pathN,
      goal: pose.driveGoal,
      moved: +Math.hypot(pose.cx - before.cx, pose.cy - before.cy).toFixed(3),
      at: [+pose.cx.toFixed(2), +pose.cy.toFixed(2), pose.dir],
      steps,
    });
    await wait(400);
  }
  console.log(JSON.stringify({ kind, errors: s.errors, log }, null, 2));
  await s.ctx.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Headless VMs: Vulkan through Mesa llvmpipe runs ~4× faster than SwiftShader (QA_GL=swiftshader to opt out).
  const gl =
    process.env.QA_GL === 'swiftshader' ? [] : ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', ...gl],
  });
  if (process.env.QA_STALL === '1') {
    try {
      for (const kind of ['desktop', 'phone']) {
        if (ONLY && ONLY !== kind) continue;
        await stallProbe(browser, kind);
      }
    } finally {
      await browser.close();
    }
    return;
  }
  const results = [];
  try {
    for (const kind of ['desktop', 'phone']) {
      if (ONLY && ONLY !== kind) continue;
      results.push(await runViewport(browser, kind));
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'drive-real.json'), JSON.stringify(results, null, 2));
  let ok = true;
  console.log('\nGate | ' + results.map((r) => r.viewport).join(' | '));
  for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']) {
    console.log(`${g}   | ${results.map((r) => (r.gates[g].pass ? 'PASS' : 'FAIL')).join(' | ')}`);
    for (const r of results) {
      if (!r.gates[g].pass) ok = false;
      console.log(`      ${r.viewport}: ${r.gates[g].detail}`);
    }
  }
  console.log(`\nstats: ${JSON.stringify(results.map((r) => ({ viewport: r.viewport, ...r.stats })))}`);
  console.log(`\nruns: ${JSON.stringify(results.map((r) => ({ viewport: r.viewport, ...r.runs })))}`);
  console.log(`out: ${OUT}`);
  console.log(ok ? 'DRIVE-REAL: ALL GATES PASS' : 'DRIVE-REAL: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
