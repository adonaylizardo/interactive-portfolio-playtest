/**
 * Run #44 street NPCs (deploy gate; activity routines since run #48). Loads the map with `?npcs=1`
 * and samples every NPC on each animation frame for a few seconds, then checks:
 *  - the Estudio street (y=36, x=18..44, door 31,36) is drawn with street tiles
 *  - all 20 NPCs spawn, each on its own walkable tile, never step onto a blocked one, and never
 *    stand still on a door, door front or the spawn (they pass through)
 *  - walking uses the facing's strip (walk_se / sw / ne / nw) and covers all four directions;
 *    standing uses idle_<facing> (also for the sit / lookUp poses until those strips exist)
 *  - characters draw at 2 world px per sheet px (64×100 world px cells) with nearest filtering
 *  - feet do not skate: each walk frame moves exactly one stride (4 or 8 world px in x, half in y)
 *    along the facing, on integer pixels, at ~10 fps (the rate is only asserted when the page
 *    draws at least TIMING_MIN_FPS; software GL on CI can draw ~4 fps)
 *  - start frames differ, so the crowd does not walk in step
 *  - routines live in the page (fast-forwarded 150 s): stargazers on the mirador deck facing up,
 *    the cart lines served and facing forward, sitters at benches, visitors hidden inside
 *    (qa-run48-routines.mjs covers the routines in depth)
 *  - a tap on an NPC goes through to the map (the player walks); NPCs hide in interiors and under
 *    QA sprite isolation; automated browsers get no NPCs unless `?npcs=1`; reduced motion stands
 *    them still
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run44-npcs.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { launchBrowser, TIMING_MIN_FPS } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);
const NPC_COUNT = 20;
const STEP = { se: [1, 0], sw: [0, 1], nw: [-1, 0], ne: [0, -1] };
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/npcs.json'), 'utf8'));
const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8'));
/** Door accesses, door fronts and the spawn: NPCs walk through, never stop. */
const NO_STOP = new Set([`${mapa.inicio[0]},${mapa.inicio[1]}`]);
for (const e of Object.values(mapa.edificios)) {
  const [ax, ay] = e.acceso;
  NO_STOP.add(`${ax},${ay}`);
  if (e.cara_puerta === '+y') NO_STOP.add(`${ax},${ay + 1}`);
  if (e.cara_puerta === '+x') NO_STOP.add(`${ax + 1},${ay}`);
}
/** Strip an NPC standing in `pose` facing `dir` shows: the pose's own once the sheet has it, idle until then. */
function standingStrip(id, pose, dir) {
  const def = manifest.npcs.find((n) => n.id === id);
  return pose && def?.animaciones[`${pose}_${dir}`] ? `${pose}_${dir}` : `idle_${dir}`;
}

export const RUN44_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25 },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } }, zoom: 1.25, light: true },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    zoom: 1,
    touch: true,
  },
};

function withQuery(base, q) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

async function openMap(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__playtestQa?.npcs?.().loaded, null, { timeout: 30000 });
  await wait(300);
}

/** One compact row per NPC per rendered frame: [id, tx, ty, x, y, dir, mode, frame, stride, texture, pose, inside]. */
function sample(page, ms) {
  return qa(
    page,
    (dur) =>
      new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          const t = performance.now() - t0;
          out.push({
            t,
            n: window.__playtestQa
              .npcs()
              .npcs.map((n) => [n.id, n.tx, n.ty, n.x, n.y, n.dir, n.mode, n.frame, n.stride, n.texture, n.pose, n.inside]),
          });
          if (t < dur) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

function analyse(frames, walk, tag, errors) {
  const walkable = (x, y) => '=.:'.includes(walk[y]?.[x] ?? '#');
  const bad = new Map();
  const flag = (k, msg) => {
    if (!bad.has(k)) bad.set(k, msg);
  };
  const dirsWalked = new Set();
  let idleSamples = 0;
  let transitions = 0;
  let walkFrames = 0;
  let walkTime = 0;
  let pairs = 0;
  const prev = new Map();
  const stoppedSince = new Map();
  for (const { t, n } of frames) {
    const here = new Map();
    const targets = new Map();
    for (const [id, tx, ty, x, y, dir, mode, frame, stride, texture, pose, inside] of n) {
      if (inside) {
        prev.delete(id);
        continue;
      }
      if (!walkable(tx, ty)) flag(`off-${id}`, `${id} stands on ${tx},${ty}, not a walkable tile`);
      const want = mode === 'walk' ? `walk_${dir}` : standingStrip(id, pose, dir);
      if (texture !== want) flag(`tex-${id}`, `${id} ${mode}${pose ? ` (${pose})` : ''} facing ${dir} shows ${texture}, want ${want}`);
      if (!Number.isInteger(x) || !Number.isInteger(y)) flag(`int-${id}`, `${id} at fractional pixel ${x},${y}`);
      const [dx, dy] = STEP[dir];
      const ox = x - (tx - ty) * 64;
      const oy = y - (tx + ty) * 32;
      const k = (dx - dy) !== 0 ? ox / ((dx - dy) * stride) : 0;
      const along = mode === 'walk' ? Number.isInteger(k) && k >= 0 && k < 64 / stride && oy * 2 === (dx + dy) * k * stride : ox === 0 && oy === 0;
      if (!along) flag(`along-${id}`, `${id} ${mode} ${dir} is ${ox},${oy} px off its tile centre, not on a stride of ${stride}`);
      if (here.has(`${tx},${ty}`)) flag(`share-${tx},${ty}`, `${id} and ${here.get(`${tx},${ty}`)} share tile ${tx},${ty}`);
      here.set(`${tx},${ty}`, id);
      const cell = `${tx},${ty}`;
      if (mode === 'idle' && NO_STOP.has(cell)) {
        const since = stoppedSince.get(id);
        if (!since || since.cell !== cell) stoppedSince.set(id, { cell, t });
        else if (t - since.t > 400) flag(`stop-${id}`, `${id} stands still on door / door front / spawn ${cell}`);
      } else stoppedSince.delete(id);
      if (mode === 'walk') {
        dirsWalked.add(dir);
        const nx = tx + dx;
        const ny = ty + dy;
        if (!walkable(nx, ny)) flag(`step-${id}`, `${id} walks ${dir} from ${tx},${ty} onto ${nx},${ny}, not a walkable tile`);
        if (targets.has(`${nx},${ny}`)) flag(`tgt-${nx},${ny}`, `${id} and ${targets.get(`${nx},${ny}`)} both head for ${nx},${ny}`);
        targets.set(`${nx},${ny}`, id);
      } else idleSamples++;
      const p = prev.get(id);
      if (p) {
        if (p.mode !== mode) transitions++;
        if (p.mode === 'walk' && mode === 'walk' && p.tx === tx && p.ty === ty && p.dir === dir && t - p.t < 600) {
          const dk = k - p.k;
          const df = (frame - p.frame + 8) % 8;
          if (dk !== df) flag(`skate-${id}`, `${id} moved ${dk} stride(s) over ${df} walk frame(s) (feet skate)`);
          walkFrames += df;
          walkTime += t - p.t;
          pairs++;
        }
      }
      prev.set(id, { t, tx, ty, dir, mode, frame, k });
    }
    for (const [key, id] of targets) {
      if (here.has(key) && here.get(key) !== id) flag(`into-${key}`, `${id} heads for ${key} where ${here.get(key)} stands`);
    }
  }
  for (const msg of bad.values()) errors.push(`${tag}: ${msg}`);
  const missing = Object.keys(STEP).filter((d) => !dirsWalked.has(d));
  if (missing.length) errors.push(`${tag}: no NPC walked ${missing.join(', ')}`);
  if (!idleSamples) errors.push(`${tag}: no NPC paused on the idle strip`);
  if (!transitions) errors.push(`${tag}: no NPC switched between walking and idling`);
  const fps = walkTime ? (walkFrames / walkTime) * 1000 : 0;
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).sort((a, b) => a - b);
  const drawFps = gaps.length ? 1000 / gaps[Math.floor(gaps.length * 0.9)] : 0;
  const timed = drawFps >= TIMING_MIN_FPS;
  if (timed && pairs && (fps < 7 || fps > 12.5)) errors.push(`${tag}: walk cycle runs at ${fps.toFixed(1)} fps (want ~10)`);
  return { dirsWalked: [...dirsWalked].sort(), idleSamples, transitions, fps, drawFps, timed, samples: frames.length };
}

/** Densest 5×5-tile patch of NPCs, for framing screenshots. */
function busiest(npcs) {
  let best = npcs[0];
  let bestN = -1;
  for (const a of npcs) {
    const n = npcs.filter((b) => Math.abs(b.tx - a.tx) <= 3 && Math.abs(b.ty - a.ty) <= 3).length;
    if (n > bestN) {
      bestN = n;
      best = a;
    }
  }
  return best;
}

const key = (c) => `${c.x},${c.y}`;

/** Fast-forwards the routines and checks each activity in the page; frames a screenshot of each with `shots`. */
async function routinesLive(page, spec, kind, tag, errors, shots) {
  await qa(page, () => window.__playtestQa.advanceNpcs(150));
  await wait(100);
  const town = await qa(page, () => window.__playtestQa.npcTown());
  const npcs = await qa(page, () => window.__playtestQa.npcs().npcs);
  const deck = new Set(town.mirador.map(key));
  const gazers = npcs.filter((n) => n.task === 'gaze');
  if (gazers.length < 2 || gazers.length > 3) errors.push(`${tag}: ${gazers.length} stargazers on the mirador after 150 s (want 2-3)`);
  for (const n of gazers) {
    if (!deck.has(`${n.tx},${n.ty}`) || n.dir !== 'ne' || n.pose !== 'lookUp' || n.texture !== standingStrip(n.id, 'lookUp', 'ne')) {
      errors.push(`${tag}: stargazer ${n.id} at ${n.tx},${n.ty} facing ${n.dir} pose ${n.pose} shows ${n.texture}`);
    }
  }
  const inLine = npcs.filter((n) => n.role === 'queue' && /^(queue \d|buy)$/.test(n.task) && n.mode === 'idle');
  for (const n of inLine) {
    const cart = town.carts.find((c) => c.slots.some((s) => s.x === n.tx && s.y === n.ty));
    const i = cart ? cart.slots.findIndex((s) => s.x === n.tx && s.y === n.ty) : -1;
    if (!cart) errors.push(`${tag}: ${n.id} queues at ${n.tx},${n.ty}, not in a cart line`);
    else if (n.dir !== cart.faces[i]) errors.push(`${tag}: ${n.id} in place ${i + 1} of ${cart.id} faces ${n.dir} (want ${cart.faces[i]})`);
  }
  const lines = town.owners.carts.map((l) => l.filter(Boolean).length);
  if (lines.reduce((a, b) => a + b, 0) < 2) errors.push(`${tag}: cart lines hold ${lines.join('+')} people after 150 s`);
  const sitters = npcs.filter((n) => n.task === 'sit');
  for (const n of sitters) {
    const b = town.benches.find((x) => x.front.x === n.tx && x.front.y === n.ty);
    if (!b || n.dir !== b.face || n.texture !== standingStrip(n.id, 'sit', b.face)) errors.push(`${tag}: sitter ${n.id} at ${n.tx},${n.ty} facing ${n.dir} shows ${n.texture}`);
  }
  const inside = npcs.filter((n) => n.inside);
  for (const n of inside) if (n.visible) errors.push(`${tag}: ${n.id} is inside ${n.task.replace('inside ', '')} but drawn`);
  if (shots) {
    const frame = async (name, c, z) => {
      await qa(page, ([x, y, zz]) => window.__playtestQa.frameWorld(x, y, zz), [(c.x - c.y) * 64, (c.x + c.y) * 32 - 40, z]);
      await wait(400);
      await page.screenshot({ path: path.join(shots, `routines-${name}-${kind}.png`) });
    };
    const z = spec.touch ? 0.9 : 1.2;
    await frame('mirador', { x: 52, y: 37 }, z);
    await frame('carts', { x: 30, y: 39 }, z);
    const bench = sitters[0] && town.benches.find((x) => x.front.x === sitters[0].tx && x.front.y === sitters[0].ty);
    if (bench) await frame('bench', bench.front, z);
  }
  return `${gazers.length} stargazers, lines ${lines.join('+')}, ${sitters.length} sitting, ${inside.length} inside after 150 s`;
}

async function tapThroughNpc(page, spec, tag, errors) {
  const snap = (await qa(page, () => window.__playtestQa.npcs().npcs)).filter((s) => !s.inside);
  for (const n of snap.filter((s) => s.mode === 'walk').concat(snap.filter((s) => s.mode !== 'walk'))) {
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y - 20, z), [n.x, n.y, spec.zoom]);
    await wait(80);
    const live = (await qa(page, () => window.__playtestQa.npcs().npcs)).find((s) => s.id === n.id);
    const pt = await qa(page, ([x, y]) => window.__playtestQa.worldToClient(x, y - 45), [live.x, live.y]);
    const onCanvas = await qa(page, ([x, y]) => document.elementFromPoint(x, y)?.id === 'game-canvas', [pt.x, pt.y]);
    if (!onCanvas) continue;
    await qa(page, () => {
      const c = document.getElementById('game-canvas');
      if (c) c.dataset.walkGoal = '';
    });
    if (spec.touch) await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);
    let goal = null;
    for (let i = 0; i < 20 && !goal; i++) {
      await wait(100);
      goal = await qa(page, () => window.__playtestQa.readWalkGoal());
    }
    if (!goal) errors.push(`${tag}: tapping ${n.id}'s body did not reach the map (no walk started)`);
    return `tap on ${n.id} walked the player to ${goal ? `${goal.x},${goal.y}` : 'nowhere'}`;
  }
  errors.push(`${tag}: no NPC reachable on screen for the tap-through check`);
  return 'tap-through skipped';
}

/**
 * @param {{ kind: keyof typeof RUN44_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun44NpcSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN44_KINDS[kind];
  const tag = `run44-${kind}-npcs`;
  const browser = await launchBrowser(spec.type);
  try {
    const ctx = await browser.newContext(spec.options);
    const page = await ctx.newPage();
    await openMap(page, withQuery(base, { npcs: '1' }));
    const streetList = await qa(page, () => window.__playtestQa.streetTiles());
    const walk = await qa(page, () => window.__playtestQa.fill().walk);
    const estudioStreet = [];
    for (let x = 18; x <= 44; x++) {
      const s = streetList.find((t) => t.x === x && t.y === 36);
      if (!s || !s.key.startsWith('tile/calle/')) estudioStreet.push(x);
    }
    if (estudioStreet.length) errors.push(`${tag}: street y=36 is not street at x=${estudioStreet.join(',')} (Estudio door 31,36)`);
    const first = await qa(page, () => window.__playtestQa.npcs());
    if (!first.enabled) errors.push(`${tag}: ?npcs=1 did not enable the crowd`);
    if (first.npcs.length !== NPC_COUNT) errors.push(`${tag}: ${first.npcs.length}/${NPC_COUNT} NPCs spawned`);
    const badSize = first.npcs.filter((n) => n.worldW !== 64 || n.worldH !== 100 || n.filter !== 'nearest/nearest');
    if (badSize.length) {
      const b = badSize[0];
      errors.push(`${tag}: ${badSize.length} NPC(s) not drawn at 64x100 world px with nearest filtering (${b.id}: ${b.worldW}x${b.worldH} ${b.filter})`);
    }
    const walkers = first.npcs.filter((n) => n.mode === 'walk');
    const startFrames = new Set(walkers.map((n) => n.frame));
    if (walkers.length >= 8 && startFrames.size < 4) {
      errors.push(`${tag}: walkers start on only ${startFrames.size} distinct frame(s) (crowd in step)`);
    }
    const centre = busiest(first.npcs.filter((n) => !n.inside));
    await qa(page, ([x, y, z]) => window.__playtestQa.frameWorld(x, y, z), [centre.x, centre.y, spec.zoom]);
    const frames = await sample(page, spec.light ? 6000 : 9000);
    const a = analyse(frames, walk, tag, errors);
    const visible = (await qa(page, () => window.__playtestQa.npcs().npcs)).filter((n) => n.visible).length;
    if (!visible) errors.push(`${tag}: no NPC visible around ${centre.tx},${centre.ty}`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `npcs-${kind}.png`) });
    }
    let extra = '';
    const live = await routinesLive(page, spec, kind, tag, errors, shots);
    if (!spec.light) {
      const tap = await tapThroughNpc(page, spec, tag, errors);
      await qa(page, () => window.__playtestQa.isolateSprites(['tile:0,0']));
      await wait(100);
      const isoVisible = (await qa(page, () => window.__playtestQa.npcs().npcs)).filter((n) => n.visible).length;
      if (isoVisible) errors.push(`${tag}: ${isoVisible} NPC(s) visible under QA sprite isolation`);
      await qa(page, () => window.__playtestQa.isolateSprites(null));
      await qa(page, () => window.__playtestQa.enterInterior('estudio'));
      await page.waitForFunction(() => window.__playtestQa.isInInterior(), null, { timeout: 15000 });
      await wait(400);
      const inside = await qa(page, () => window.__playtestQa.npcs().npcs.filter((n) => n.visible).length);
      if (inside) errors.push(`${tag}: ${inside} NPC(s) visible inside the Estudio`);
      extra = `; ${tap}; hidden in interiors and under isolation`;
    }
    await ctx.close();

    const plainCtx = await browser.newContext(spec.options);
    const plain = await plainCtx.newPage();
    await openMap(plain, base);
    const off = await qa(plain, () => window.__playtestQa.npcs());
    if (off.enabled || off.npcs.some((n) => n.visible)) errors.push(`${tag}: automated browser without ?npcs=1 shows NPCs`);
    await plainCtx.close();

    if (!spec.light) {
      const rmCtx = await browser.newContext({ ...spec.options, reducedMotion: 'reduce' });
      const rm = await rmCtx.newPage();
      await openMap(rm, withQuery(base, { npcs: '1' }));
      const before = await qa(rm, () => window.__playtestQa.npcs().npcs.map((n) => `${n.x},${n.y},${n.frame}`).join('|'));
      await wait(1500);
      const after = await qa(rm, () => window.__playtestQa.npcs().npcs.map((n) => `${n.x},${n.y},${n.frame}`).join('|'));
      if (before !== after) errors.push(`${tag}: NPCs keep moving under prefers-reduced-motion`);
      await rmCtx.close();
      extra += '; still under reduced motion';
    }

    notes.push(
      `${tag}: ${first.npcs.length} NPCs at ${first.npcs[0]?.worldW}x${first.npcs[0]?.worldH} world px (${first.npcs[0]?.filter}), ${startFrames.size} distinct start frames among ${walkers.length} walkers; ` +
        `walked ${a.dirsWalked.join('/')}, ${a.transitions} walk/idle switches over ${a.samples} frames, walk cycle ${a.fps.toFixed(1)} fps` +
        `${a.timed ? '' : ` (not asserted: page drew ${a.drawFps.toFixed(1)} fps, under ${TIMING_MIN_FPS})`}, ` +
        `${visible} on screen; ${live}${extra}; off without ?npcs=1`,
    );
  } catch (e) {
    errors.push(`${tag}: ${e.message.split('\n')[0]}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run44') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4210/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN44_KINDS)) await runRun44NpcSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.log(`FAIL: ${e}`);
  process.exit(errors.length ? 1 : 0);
}
