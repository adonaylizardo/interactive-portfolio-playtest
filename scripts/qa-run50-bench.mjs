/**
 * Run #50 player on a bench, Pantone resting (deploy gate). Checks:
 *  - first load fetches only the idle / walk / trot strips; the sit / lie strips load on first need
 *    and `meditar_*` (shipped, not wired) is never fetched
 *  - a real tap / click on a bench walks Adonay to its front cell, steps him onto the seat and plays
 *    sentarse then sentado; his feet sit at the bench anchor plus the manifest seat offset
 *    (orientacion-der (+4,-22) facing se, izq (-4,-22) facing sw), drawn over the bench
 *  - Pantone trots beside it (der (-46,-4) se, izq (+46,-4) sw), sits, and is drawn after the bench;
 *    15 quiet seconds later he lies down (echarse, echado)
 *  - a movement key (a tap elsewhere on touch) gets both up: Adonay levantarse, then walks on;
 *    Pantone levantarse_echado, levantarse, then follows again on the trail
 *  - away from benches: 30 s without input Pantone sits, 15 s more he lies down, any input gets him up
 *    (the timer is fast-forwarded through `skipQuiet`; transitions play in real time)
 *  - Enter next to a bench sits on it, Enter again stands up (keyboard kinds)
 *  - with `?npcs=1`: no NPC takes the bench the player sits on over 300 s of routines, and a bench an
 *    NPC already sits on is left to them (the tap just walks)
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run50-bench.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';
import { QA_CI } from './qa-ci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/jugador.json'), 'utf8'));
const REST_STRIP = /__(sentarse|sentado|levantarse|echarse|echado|meditar)_/;

/** Adonay's seated feet and Pantone's spot, from the bench anchor (manifest offsets). */
function benchSpots(bench) {
  const seat = Object.values(manifest.adonay.animaciones)
    .map((a) => a.asiento?.pies_desde_ancla_banco_mapa)
    .find((p) => p?.orientacion === bench.variant);
  const dog = manifest.pantone.comportamiento_reposo.banco.offset_desde_ancla_banco_mapa[bench.variant];
  return {
    feet: { x: bench.anchor.x + seat.dx, y: bench.anchor.y + seat.dy, dir: bench.variant === 'izq' ? 'sw' : 'se' },
    dog: { x: bench.anchor.x + dog.dx, y: bench.anchor.y + dog.dy, dir: dog.dir },
  };
}

export const RUN50_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25, keys: true, npcs: true },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25, keys: true },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    zoom: 1,
    touch: true,
  },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, zoom: 1, touch: true },
};

function withQuery(base, q) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

async function openMap(page, url, crowd = false) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(
    (c) => window.__playtestQa?.playerAvatar?.().loaded && (!c || window.__playtestQa.npcs().loaded),
    crowd,
    { timeout: 45000 },
  );
  await wait(300);
}

const avatar = (page) => qa(page, () => window.__playtestQa.playerAvatar());

/** Software-GL WebKit on CI draws a few fps with capped frame time, so game time runs several times slower. */
const SLOW_WAIT = QA_CI ? 8 : 3;

async function until(page, fn, arg, timeout, what) {
  try {
    await page.waitForFunction(fn, arg, { timeout: timeout * SLOW_WAIT, polling: 50 });
    return true;
  } catch {
    const s = await qa(page, () => {
      const a = window.__playtestQa.playerAvatar();
      const b = window.__playtestQa.benches();
      const t = window.__playtestQa.getCharacterTile();
      return `sit ${a.sit}, Pantone ${a.rest}, bench claimed ${b.claimed} pending ${b.pending} seated ${b.seated}, player ${t.x},${t.y}`;
    }).catch(() => 'state unavailable');
    throw new Error(`timed out waiting for ${what} (${s})`);
  }
}

/** Ends with `want` in order (other poses may come before). */
function endsWith(log, want) {
  return want.every((p, i) => log[log.length - want.length + i] === p);
}

async function tapClient(page, spec, pt) {
  if (spec.touch) await page.touchscreen.tap(pt.x, pt.y);
  else await page.mouse.click(pt.x, pt.y);
}

/** Stands the player a few tiles from the bench's front cell and frames the bench. */
async function approach(page, spec, bench) {
  const walk = await qa(page, () => window.__playtestQa.fill().walk);
  const ok = (x, y) => '=.:'.includes(walk[y]?.[x] ?? '#');
  let start = null;
  for (let r = 3; r <= 6 && !start; r++) {
    for (const [dx, dy] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const x = bench.front.x + dx;
      const y = bench.front.y + dy;
      if (!ok(x, y)) continue;
      const route = await qa(page, ([a, b, c, d]) => window.__playtestQa.findPath(a, b, c, d), [x, y, bench.front.x, bench.front.y]);
      if (route?.length) {
        start = { x, y };
        break;
      }
    }
  }
  if (!start) throw new Error(`no walkable start near bench ${bench.id}`);
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [start.x, start.y]);
  await wait(200);
  await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y, z), [bench.tapWorld.x, bench.tapWorld.y - 10, spec.zoom]);
  await wait(150);
  return start;
}

/**
 * A client point on the bench's opaque pixels that Pixi delivers to the bench, or to a prop drawn
 * over it (the bus stop shelters one bench; a lamp post stands in front of another).
 */
async function benchTapPoint(page, bench) {
  const fresh = (await qa(page, () => window.__playtestQa.benches())).benches.find((b) => b.id === bench.id);
  const c = fresh.client;
  let over = null;
  for (const [dx, dy] of [[0, 0], [0, 4], [-4, 2], [4, 2], [0, -4]]) {
    const pt = { x: c.x + dx, y: c.y + dy };
    const target = await qa(page, ([x, y]) => window.__playtestQa.pixiTargetAt(x, y), [pt.x, pt.y]);
    if (target === `object:${bench.id}`) return { pt, via: 'the bench' };
    if (!over && /^object:(fill|prop)\//.test(target ?? '')) over = { pt, via: target.slice(7) };
  }
  return over;
}

/** Time Adonay stands at the seat waiting for the sit strips (stepIn on an idle frame). */
const startStallWatch = (page) =>
  qa(page, () => {
    const w = (window.__seatWait = { ms: 0, last: performance.now(), on: true });
    const tick = () => {
      if (!w.on) return;
      const now = performance.now();
      const a = window.__playtestQa.playerAvatar();
      if (a.sit === 'stepIn' && a.adonay.texture.startsWith('idle_')) w.ms += now - w.last;
      w.last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const stopStallWatch = (page) =>
  qa(page, () => {
    window.__seatWait.on = false;
    return Math.round(window.__seatWait.ms);
  });

async function sitByTap(page, spec, bench, tag, errors) {
  await approach(page, spec, bench);
  const hit = await benchTapPoint(page, bench);
  if (!hit) throw new Error(`${bench.id}: no point of its tap box reaches the bench`);
  await startStallWatch(page);
  await tapClient(page, spec, hit.pt);
  const walking = await until(
    page,
    () => window.__playtestQa.playerAvatar().sit !== 'free' || !!window.__playtestQa.benches().pending,
    null,
    2500,
    `${tag}: walk to ${bench.id}`,
  ).catch(() => false);
  if (!walking) {
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 10, z), [bench.tapWorld.x, bench.tapWorld.y, spec.zoom]);
    await wait(150);
    const fresh = (await qa(page, () => window.__playtestQa.benches())).benches.find((b) => b.id === bench.id);
    if (fresh?.client) await qa(page, ([x, y]) => window.__playtestQa.tapScreen(x, y), [fresh.client.x, fresh.client.y]);
    else await qa(page, ([x, y]) => window.__playtestQa.tapMapTile(x, y), [bench.front.x, bench.front.y]);
  }
  await until(page, () => window.__playtestQa.playerAvatar().sit !== 'free' || !!window.__playtestQa.benches().pending, null, 8000, `${tag}: walk to ${bench.id}`);
  await until(
    page,
    () => {
      const a = window.__playtestQa.playerAvatar();
      return a.sit === 'sentado' && a.rest === 'sentado';
    },
    null,
    15000,
    `${tag}: Adonay and Pantone seated at ${bench.id}`,
  );
  const waited = await stopStallWatch(page);
  if (errors && waited > 250) errors.push(`${tag}: Adonay stood ${waited} ms at ${bench.id}'s seat waiting for the sit strips`);
  return hit.via;
}

function checkSeated(a, b, bench, tag, errors) {
  const want = benchSpots(bench);
  const off = (w, p) => Math.hypot(w.x - p.x, w.y - p.y);
  if (off(a.adonay, want.feet) > 0.01) {
    errors.push(`${tag}: ${bench.id} (${bench.variant}) Adonay's feet at ${a.adonay.x.toFixed(1)},${a.adonay.y.toFixed(1)}, want anchor + offset ${want.feet.x},${want.feet.y}`);
  }
  if (a.adonay.dir !== want.feet.dir || a.adonay.texture !== `sentado_${want.feet.dir}`) {
    errors.push(`${tag}: ${bench.id} Adonay shows ${a.adonay.texture} facing ${a.adonay.dir}, want sentado_${want.feet.dir}`);
  }
  if (!endsWith(a.adonay.poseLog, ['sentarse', 'sentado'])) errors.push(`${tag}: Adonay's poses ${a.adonay.poseLog.join('>')} do not end sentarse>sentado`);
  if (off(a.pantone, want.dog) > 0.01) {
    errors.push(`${tag}: ${bench.id} Pantone at ${a.pantone.x.toFixed(1)},${a.pantone.y.toFixed(1)}, want ${want.dog.x},${want.dog.y}`);
  }
  if (a.pantone.texture !== `sentado_${want.dog.dir}`) errors.push(`${tag}: Pantone shows ${a.pantone.texture}, want sentado_${want.dog.dir}`);
  if (!(a.pantone.zIndex > bench.benchZ)) errors.push(`${tag}: Pantone (z ${a.pantone.zIndex}) not drawn after the bench (z ${bench.benchZ})`);
  if (!(a.adonay.zIndex > bench.benchZ)) errors.push(`${tag}: seated Adonay (z ${a.adonay.zIndex}) not drawn over the bench (z ${bench.benchZ})`);
  if (b.claimed !== bench.id || b.seated !== bench.id) errors.push(`${tag}: bench state claimed=${b.claimed} seated=${b.seated}, want ${bench.id}`);
}

/** Pantone lies down after 15 quiet seconds (fast-forwarded). */
async function lieDown(page, tag) {
  await qa(page, (s) => window.__playtestQa.skipQuiet(s), 15.5);
  await until(page, () => window.__playtestQa.playerAvatar().rest === 'echado', null, 5000, `${tag}: Pantone lying down`);
  const a = await avatar(page);
  return endsWith(a.pantone.poseLog, ['sentarse', 'sentado', 'echarse', 'echado']) ? null : a.pantone.poseLog.join('>');
}

async function standByMoving(page, spec, tag, errors) {
  const before = await qa(page, () => window.__playtestQa.getCharacterTile());
  const walk = await qa(page, () => window.__playtestQa.fill().walk);
  const ok = (x, y) => '=.:'.includes(walk[y]?.[x] ?? '#');
  if (spec.keys) {
    const key = Object.entries({ ArrowDown: [0, 1], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowLeft: [-1, 0] }).find(([, [dx, dy]]) =>
      ok(before.x + dx, before.y + dy) && ok(before.x + 2 * dx, before.y + 2 * dy),
    )?.[0];
    if (!key) throw new Error(`${tag}: no open direction off the bench's front cell`);
    await page.keyboard.down(key);
    try {
      await until(page, () => window.__playtestQa.playerAvatar().sit === 'free', null, 5000, `${tag}: Adonay back on his feet`);
      await until(
        page,
        (t) => {
          const c = window.__playtestQa.getCharacterTile();
          return c.x !== t.x || c.y !== t.y;
        },
        before,
        5000,
        `${tag}: walking on after getting up`,
      );
    } finally {
      await page.keyboard.up(key);
    }
  } else {
    const vp = page.viewportSize();
    let goal = null;
    let pt = null;
    for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2], [2, 2], [-2, 2], [2, -2], [-2, -2], [3, 0], [0, 3], [-3, 0], [0, -3]]) {
      const g = { x: before.x + dx, y: before.y + dy };
      if (!ok(g.x, g.y)) continue;
      const route = await qa(page, ([a, b, c, d]) => window.__playtestQa.findPath(a, b, c, d), [before.x, before.y, g.x, g.y]);
      if (!route?.length || route.length > 5) continue;
      const c = await qa(page, ([x, y]) => window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32), [g.x, g.y]);
      if (c.x < 30 || c.y < 120 || c.x > vp.width - 30 || c.y > vp.height - 160) continue;
      const target = await qa(page, ([x, y]) => window.__playtestQa.pixiTargetAt(x, y), [c.x, c.y]);
      if (target?.startsWith('object:') || target === 'noah') continue;
      goal = g;
      pt = c;
      break;
    }
    if (!goal) throw new Error(`${tag}: no open on-screen tile to tap near the bench`);
    await tapClient(page, spec, pt);
    await until(page, () => window.__playtestQa.playerAvatar().sit === 'free', null, 5000, `${tag}: Adonay back on his feet`);
    await until(page, (g) => {
      const c = window.__playtestQa.getCharacterTile();
      return c.x === g.x && c.y === g.y;
    }, goal, 12000, `${tag}: the tap's walk after getting up`);
  }
  const a = await avatar(page);
  if (!endsWith(a.adonay.poseLog, ['sentarse', 'sentado', 'levantarse'])) errors.push(`${tag}: Adonay's poses ${a.adonay.poseLog.join('>')} do not end sentado>levantarse`);
  await until(page, () => window.__playtestQa.playerAvatar().rest === 'follow', null, 8000, `${tag}: Pantone following again`);
  const p = await avatar(page);
  if (!endsWith(p.pantone.poseLog, ['echado', 'levantarse_echado', 'levantarse'])) {
    errors.push(`${tag}: Pantone's poses ${p.pantone.poseLog.join('>')} do not end echado>levantarse_echado>levantarse`);
  }
  const b = await qa(page, () => window.__playtestQa.benches());
  if (b.claimed || b.seated) errors.push(`${tag}: bench still held after getting up (claimed=${b.claimed} seated=${b.seated})`);
}

/** Away from benches: sits at 30 quiet seconds, lies at 45, any input gets him up and following. */
async function restTimer(page, spec, tag, errors) {
  await until(page, () => {
    const a = window.__playtestQa.playerAvatar();
    return a.rest === 'follow' && a.adonay.mode === 'idle' && a.pantone.mode === 'idle';
  }, null, 8000, `${tag}: player and Pantone standing still`);
  // Walking counts as quiet time too (only input restarts the timer), so skip to 28 s from wherever it is.
  const q0 = (await avatar(page)).quiet;
  await qa(page, (s) => window.__playtestQa.skipQuiet(s), Math.max(0, 27.6 - q0));
  await wait(400);
  const early = await avatar(page);
  if (early.rest !== 'follow') errors.push(`${tag}: Pantone ${early.rest} after ~28 s without input (sits at 30 s)`);
  await qa(page, () => window.__playtestQa.skipQuiet(2.5));
  await until(page, () => window.__playtestQa.playerAvatar().rest === 'sentado', null, 5000, `${tag}: Pantone sitting after 30 s`);
  const sat = await avatar(page);
  if (sat.restAt !== 'here') errors.push(`${tag}: Pantone rests at ${sat.restAt}, want here`);
  const lie = await lieDown(page, tag);
  if (lie) errors.push(`${tag}: Pantone's idle poses ${lie} do not end sentarse>sentado>echarse>echado`);
  const spot = await avatar(page);
  if (spec.keys) await page.keyboard.press('Shift');
  else {
    // A tap on the player's own tile: input, but no walk.
    const t = await qa(page, () => window.__playtestQa.getCharacterTile());
    const c = await qa(page, ([x, y]) => window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32), [t.x, t.y]);
    await page.touchscreen.tap(c.x, c.y);
  }
  await until(page, () => window.__playtestQa.playerAvatar().rest === 'follow', null, 5000, `${tag}: Pantone up and following after input`);
  const up = await avatar(page);
  if (!endsWith(up.pantone.poseLog, ['echado', 'levantarse_echado', 'levantarse'])) errors.push(`${tag}: Pantone got up via ${up.pantone.poseLog.join('>')}`);
  if (Math.hypot(up.pantone.x - spot.pantone.x, up.pantone.y - spot.pantone.y) > 1) errors.push(`${tag}: Pantone jumped when getting up with nobody walking`);
}

async function enterSits(page, spec, bench, tag, errors) {
  const walk = await qa(page, () => window.__playtestQa.fill().walk);
  const ok = (x, y) => '=.:'.includes(walk[y]?.[x] ?? '#');
  const near = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [1, 0], [0, -1], [-1, 0]]
    .map(([dx, dy]) => ({ x: bench.seat.x + dx, y: bench.seat.y + dy }))
    .find((p) => ok(p.x, p.y) && (p.x !== bench.front.x || p.y !== bench.front.y));
  if (!near) return `Enter skipped (no tile beside ${bench.id})`;
  await qa(page, ([x, y]) => window.__playtestQa.setCharacterTile(x, y), [near.x, near.y]);
  await wait(300);
  await page.keyboard.press('Enter');
  await until(page, () => window.__playtestQa.playerAvatar().sit === 'sentado', null, 8000, `${tag}: Enter beside ${bench.id} sits`);
  const b = await qa(page, () => window.__playtestQa.benches());
  if (b.seated !== bench.id) errors.push(`${tag}: Enter beside ${bench.id} sat on ${b.seated}`);
  await page.keyboard.press('Enter');
  await until(page, () => window.__playtestQa.playerAvatar().sit === 'free', null, 5000, `${tag}: Enter again stands up`);
  return `Enter beside ${bench.id} sat and stood`;
}

async function npcReservation(page, spec, tag, errors) {
  const town = await qa(page, () => window.__playtestQa.npcTown());
  const list = (await qa(page, () => window.__playtestQa.benches())).benches;
  const npcs = (await qa(page, () => window.__playtestQa.npcs())).npcs;
  const sitting = npcs.find((n) => n.task === 'sit' && n.seat);
  let occupied = 'no NPC seated to test against';
  if (sitting) {
    const bench = list.find((b) => b.seat.x === sitting.seat.x && b.seat.y === sitting.seat.y);
    await approach(page, spec, bench);
    const hit = await benchTapPoint(page, bench);
    if (hit) {
      await tapClient(page, spec, hit.pt);
      await wait(1500);
      const a = await avatar(page);
      const b = await qa(page, () => window.__playtestQa.benches());
      if (a.sit !== 'free' || b.claimed === bench.id) errors.push(`${tag}: player sat on ${bench.id}, where ${sitting.id} already sits`);
      occupied = `${sitting.id}'s bench left to them`;
    }
  }
  const owners = town.owners.benches;
  const free = list.find((b) => owners[town.benches.findIndex((t) => t.id === b.id)] === null);
  if (!free) return `${occupied}; every bench held, reservation not tested`;
  await sitByTap(page, spec, free, tag);
  await qa(page, () => window.__playtestQa.advanceNpcs(300));
  const after = await qa(page, () => window.__playtestQa.npcTown());
  const idx = after.benches.findIndex((t) => t.id === free.id);
  const taker = (await qa(page, () => window.__playtestQa.npcs())).npcs.find((n) => n.seat && n.seat.x === free.seat.x && n.seat.y === free.seat.y);
  if (after.owners.benches[idx] || taker) errors.push(`${tag}: ${after.owners.benches[idx] ?? taker.id} took ${free.id} while the player sat on it`);
  return `${occupied}; ${free.id} kept free of NPCs over 300 s while seated`;
}

/**
 * @param {{ kind: keyof typeof RUN50_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun50BenchSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN50_KINDS[kind];
  const tag = `run50-${kind}-bench`;
  const browser = await launchBrowser(spec.type);
  try {
    const ctx = await browser.newContext(spec.options);
    const page = await ctx.newPage();
    const fetched = [];
    page.on('request', (r) => {
      if (/\/sprites\/personaje\/(adonay|pantone)\//.test(r.url())) fetched.push(r.url());
    });
    await openMap(page, base);
    const firstLoad = fetched.filter((u) => !REST_STRIP.test(u)).length;
    const prefetched = await until(page, () => window.__playtestQa.playerAvatar().restLoaded, null, 8000, `${tag}: rest strips prefetched`)
      .then(() => true)
      .catch((e) => (errors.push(`${tag}: no input yet and the sit/rest strips never arrived (${e.message})`), false));
    // Off the critical path: no first-load sprite may still be downloading when the first rest strip is requested.
    const overlap = await qa(page, (src) => {
      const rest = new RegExp(src);
      const all = performance.getEntriesByType('resource').filter((r) => r.name.includes('/sprites/'));
      const starts = all.filter((r) => rest.test(r.name)).map((r) => r.startTime);
      if (!starts.length) return null;
      const t = Math.min(...starts);
      return all.filter((r) => !rest.test(r.name) && r.startTime < t && r.responseEnd > t).map((r) => r.name.split('/').pop());
    }, REST_STRIP.source);
    if (overlap?.length) errors.push(`${tag}: sit/rest strips requested while ${overlap.length} first-load sprite(s) still loading (${overlap[0]})`);

    const { benches } = await qa(page, () => window.__playtestQa.benches());
    if (benches.length < 2) throw new Error(`only ${benches.length} benches to sit on`);
    const der = benches.find((b) => b.variant === 'der');
    const izq = benches.find((b) => b.variant === 'izq');
    const first = der ?? benches[0];
    const firstVia = await sitByTap(page, spec, first, tag, errors);
    checkSeated(await avatar(page), await qa(page, () => window.__playtestQa.benches()), first, tag, errors);
    const meditar = fetched.filter((u) => u.includes('__meditar_'));
    if (meditar.length) errors.push(`${tag}: fetched ${meditar.length} meditar strip(s), which nothing uses`);
    const lie = await lieDown(page, tag);
    if (lie) errors.push(`${tag}: at the bench Pantone's poses ${lie} do not end sentarse>sentado>echarse>echado`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `bench-${first.variant}-${kind}.png`) });
    }
    await standByMoving(page, spec, tag, errors);

    let second = '';
    const other = first === der ? izq : der;
    if (other) {
      const via = await sitByTap(page, spec, other, tag, errors);
      checkSeated(await avatar(page), await qa(page, () => window.__playtestQa.benches()), other, tag, errors);
      if (shots) await page.screenshot({ path: path.join(shots, `bench-${other.variant}-${kind}.png`) });
      if (spec.keys) await page.keyboard.press('ArrowUp');
      else {
        const t = await qa(page, () => window.__playtestQa.getCharacterTile());
        const c = await qa(page, ([x, y]) => window.__playtestQa.worldToClient((x - y) * 64, (x + y) * 32), [t.x, t.y]);
        await page.touchscreen.tap(c.x, c.y);
      }
      await until(page, () => window.__playtestQa.playerAvatar().sit === 'free', null, 5000, `${tag}: up from ${other.id}`);
      second = `, ${other.id} (${other.variant}, tapped via ${via})`;
    }

    await restTimer(page, spec, tag, errors);
    if (shots) {
      await qa(page, () => window.__playtestQa.skipQuiet(31));
      await until(page, () => window.__playtestQa.playerAvatar().rest === 'sentado', null, 6000, `${tag}: Pantone sitting for the shot`);
      await qa(page, () => window.__playtestQa.skipQuiet(15.5));
      await until(page, () => window.__playtestQa.playerAvatar().rest === 'echado', null, 6000, `${tag}: Pantone lying for the shot`);
      const a = await avatar(page);
      await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 30, z), [a.adonay.x, a.adonay.y, spec.zoom * 1.6]);
      await wait(150);
      await page.screenshot({ path: path.join(shots, `pantone-echado-${kind}.png`) });
    }
    const enter = spec.keys ? await enterSits(page, spec, izq ?? first, tag, errors) : 'Enter not tested (touch)';
    await ctx.close();

    let reserve = '';
    if (spec.npcs) {
      const nctx = await browser.newContext(spec.options);
      const npage = await nctx.newPage();
      await openMap(npage, withQuery(base, { npcs: '1' }), true);
      reserve = `; ${await npcReservation(npage, spec, tag, errors)}`;
      await nctx.close();
    }

    notes.push(
      `${tag}: first load ${firstLoad} player strips, sit/rest strips ${prefetched ? 'prefetched once it settled' : 'NOT prefetched'}; sat on ${first.id} (${first.variant}, tapped via ${firstVia})${second} at the manifest offsets, Pantone drawn after the bench, ` +
        `lay down after 15 s, both got up on ${spec.keys ? 'an arrow key' : 'a tap'}; idle timer sit 30 s / lie 45 s / up on input; ${enter}${reserve}`,
    );
  } catch (e) {
    errors.push(`${tag}: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run50') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4195/interactive-portfolio-playtest/';
  const only = process.env.RUN50_KINDS?.split(',') ?? Object.keys(RUN50_KINDS);
  const errors = [];
  const notes = [];
  for (const kind of only) await runRun50BenchSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.log(`FAIL: ${e}`);
  process.exit(errors.length ? 1 : 0);
}
