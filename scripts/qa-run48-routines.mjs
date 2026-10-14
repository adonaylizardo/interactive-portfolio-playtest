#!/usr/bin/env node
/**
 * Run #48 NPC activity routines (deploy gate, no browser). Bundles src/game/npcRoutines.ts with
 * esbuild and runs the 20 NPCs for 15 simulated minutes per seed while a stand-in player parks on a
 * queue place, a bench front, a door front and the Estudio street. Checks:
 *  - roles: 2-3 stargazers, 3-4 in the cart queues, 3-4 on benches, 4-5 crossers, 3-4 building
 *    visitors, the rest strolling by the fountain and the dog park
 *  - stargazers stand on the mirador deck (x51-53, y35-37) on the stargaze strip (lookUp pose,
 *    estrellas_se / _sw, head tilted back), 2-3 there
 *    nearly all the time (one stretches their legs at a time)
 *  - cart queues: the front person orders, buys (short pause) and walks away, the line steps up one
 *    place at a time with a pause, newcomers join at the back, everyone faces the person ahead / the
 *    cart; 2+ people in line most of the time, rarely nobody
 *  - benches: walk to a bench, sit (sit pose, facing out) 20-50 s, stand up and leave
 *  - crossers walk end to end along the main streets; visitors vanish on a door for 20-60 s and
 *    come out of the same door
 *  - strollers stop by the fountain / dog park (walking between the two is fine); start times and frames are staggered
 *  - nobody shares a tile, steps onto the player's tile, stops on a door, door front, spawn or
 *    monument stop, or enters the climbing-wall clearance; nobody gets stuck
 *  - sitters hold the sit strip facing the way the bench looks (der: sentado_se, izq: sentado_sw)
 *  - pose hooks: estrellas plays its 0,0,0,1 sequence at 1 fps; with the pose strips taken out of
 *    the sheet, sitters stand at the bench front facing out and gazers stand on the idle strip
 * Usage: imported by qa-smoke.mjs (group `routines`); `node scripts/qa-run48-routines.mjs` runs it alone.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIM_S = 900;
const DT = 1 / 30;
const SEEDS = [1, 7, 42, 2026];
/** Strollers stay within this many tiles (Manhattan) of the fountain / dog park areas. */
const STROLL_REACH = 6;
const BRISK = new Set(['corredora', 'repartidor']);
const key = (c) => `${c.x},${c.y}`;
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

async function loadRoutines() {
  const out = path.join(os.tmpdir(), `qa-run48-routines-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, 'src/game/npcRoutines.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'error',
  });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(out, { force: true });
  return mod;
}

/** Routine defs from the manifest, as npcs.ts builds them; `poses: false` drops the pose strips. */
function defs({ poses = true } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/npcs.json'), 'utf8'));
  return manifest.npcs.map((n) => ({
    id: n.id,
    stride: BRISK.has(n.id) ? 8 : 4,
    anims: Object.fromEntries(
      Object.entries(n.animaciones)
        .filter(([k]) => poses || /^(idle|walk)_/.test(k))
        .map(([k, a]) => [k, { count: (a.secuencia ?? a.frames).length, fps: a.fps }]),
    ),
  }));
}

/** Where the stand-in player parks, and for how long (s). Cells come from the town so they track the map. */
function playerPlan(town) {
  const plan = [];
  const cart = town.carts[0];
  if (cart) plan.push({ at: cart.slots[1], s: 40, what: `queue place 2 of ${cart.id}` });
  const bench = town.benches[0];
  if (bench) plan.push({ at: bench.front, s: 60, what: `in front of ${bench.id}` });
  plan.push({ at: { x: 39, y: 37 }, s: 40, what: 'Volaris door front' });
  plan.push({ at: { x: 28, y: 36 }, s: 60, what: 'the Estudio street' });
  plan.push({ at: { x: 31, y: 36 }, s: 40, what: 'the spawn / Estudio door' });
  return plan;
}

function simulate(R, seed, errors, tag) {
  const town = R.buildTown();
  const plan = playerPlan(town);
  let player = { x: 31, y: 36 };
  let playerSince = 0;
  const host = { blocked: (x, y) => x === player.x && y === player.y };
  const routines = new R.NpcRoutines(defs(), host, R.mulberry32(seed), town);
  const W = routines.walkers;
  const fail = new Map();
  const flag = (k, msg) => {
    if (!fail.has(k)) fail.set(k, `${tag}: ${msg}`);
  };

  const roles = {};
  for (const w of W) roles[w.role] = (roles[w.role] ?? 0) + 1;
  const want = { stargazer: [2, 3], queue: [3, 4], bench: [3, 4], crosser: [4, 5], visitor: [3, 4] };
  for (const [r, [a, b]] of Object.entries(want)) {
    if (!(roles[r] >= a && roles[r] <= b)) flag(`role-${r}`, `${roles[r] ?? 0} ${r}(s), want ${a}-${b}`);
  }
  const rest = W.length - Object.keys(want).reduce((s, r) => s + (roles[r] ?? 0), 0);
  if ((roles.stroller ?? 0) !== rest) flag('role-stroller', `${roles.stroller ?? 0} strollers, want the remaining ${rest}`);

  const deck = new Set(town.mirador.map(key));
  const inDeckBox = (c) => c.x >= 51 && c.x <= 53 && c.y >= 35 && c.y <= 37;
  for (const c of town.mirador) if (!inDeckBox(c)) flag('deck', `mirador spot ${key(c)} outside x51-53,y35-37`);
  if (town.mirador.length < 3) flag('deck-n', `only ${town.mirador.length} mirador spots`);
  if (town.carts.length < 2) flag('carts', `${town.carts.length} cart lines (want cachapas and jugos)`);
  for (const c of town.carts) {
    if (dist(c.at, { x: 27, y: 38 }) > 2 && dist(c.at, { x: 34, y: 38 }) > 2) flag(`cart-${c.id}`, `${c.id} at ${key(c.at)}, not near (27,38)/(34,38)`);
    for (const s of c.slots) if (town.street(s.x, s.y)) flag(`cart-street-${c.id}`, `${c.id} line stands on the street at ${key(s)}`);
  }
  const zoneCells = new Set(town.zones.flatMap((z) => z.cells.map(key)));
  const zoneOf = new Map(town.zones.flatMap((z) => z.cells.map((c) => [key(c), z.name])));
  const ends = town.ends;
  if (ends.length < 2) flag('ends', `${ends.length} street ends`);

  const st = new Map(
    W.map((w) => [
      w,
      {
        task: w.task,
        taskT: 0,
        cell: key({ x: w.tx, y: w.ty }),
        cellT: 0,
        lastEnd: null,
        crossCells: 0,
        crossStreet: 0,
        insideAt: null,
        insideDoor: null,
        insideFrom: null,
        zonesSeen: new Set(),
        idle: 0,
        idleInZone: 0,
        firstWalk: null,
        tasks: 0,
        sitFrom: null,
        far: null,
        blockedSince: null,
        crossFrom: null,
        claim: '',
      },
    ]),
  );
  const ev = { buys: [], joins: 0, steps: 0, sits: [], ends: 0, visits: [], emerges: 0, gazeSamples: [], queueSamples: [], stuck: 0, rethinks: 0 };
  const lineSeen = town.carts.map(() => new Set());

  let planI = 0;
  let planLeft = 15;
  for (let t = 0; t < SIM_S; t += DT) {
    planLeft -= DT;
    if (planLeft <= 0) {
      const p = plan[planI % plan.length];
      planI++;
      player = { ...p.at };
      playerSince = t;
      planLeft = p.s;
    }
    const before = new Map(W.map((w) => [w, { tx: w.tx, ty: w.ty, inside: w.inside, mode: w.mode, slot: w.slot, cart: w.cart, phase: w.phase }]));
    routines.update(DT);

    const here = new Map();
    let gazing = 0;
    let queued = 0;
    for (const w of W) {
      const s = st.get(w);
      const b = before.get(w);
      const cell = { x: w.tx, y: w.ty };
      const ck = key(cell);
      if (w.mode === 'walk' && s.firstWalk === null) s.firstWalk = t;
      if (w.task !== s.task) {
        if (s.task === 'buy') {
          const dur = t - s.taskT;
          ev.buys.push({ id: w.id, dur, t });
          if (s.taskT > 0 && dur < 2.4 || dur > 5.1) flag(`buy-${w.id}-${Math.round(t)}`, `${w.id} bought for ${dur.toFixed(1)} s (want 2.5-5)`);
        }
        if (s.task === 'sit' && s.sitFrom !== null) {
          const dur = t - s.sitFrom;
          if (s.taskT > 1) {
            ev.sits.push({ id: w.id, dur });
            if (dur < 19.9 || dur > 50.1) flag(`sit-${w.id}-${Math.round(t)}`, `${w.id} sat for ${dur.toFixed(1)} s (want 20-50)`);
          }
        }
        if (w.task === 'sit') s.sitFrom = t;
        if (w.task === 'join the line') ev.joins++;
        if (w.task === 'cross the map' && s.task !== 'make way') s.crossFrom = cell;
        if (w.task === 'rethink') ev.rethinks++;
        s.task = w.task;
        s.taskT = t;
        s.tasks++;
      }
      if (ck !== s.cell) {
        s.cell = ck;
        s.cellT = t;
      }
      if (w.inside) {
        if (!b.inside) {
          s.insideAt = t;
          s.insideDoor = ck;
          const door = town.doors[w.door];
          if (!door || key(door.door) !== s.insideDoor) flag(`vanish-${w.id}`, `${w.id} went inside away from a door (at ${s.insideDoor})`);
        }
        continue;
      }
      if (b.inside) {
        ev.emerges++;
        if (s.insideAt !== null) {
          const dur = t - s.insideAt;
          ev.visits.push({ id: w.id, dur });
          if (dur < 19.9 || dur > 61) flag(`inside-${w.id}-${Math.round(t)}`, `${w.id} stayed inside ${dur.toFixed(1)} s (want 20-60)`);
        }
        if (s.insideDoor && ck !== s.insideDoor) flag(`emerge-${w.id}`, `${w.id} came out at ${ck}, went in at ${s.insideDoor}`);
      }

      if (!town.walk(cell.x, cell.y)) flag(`walk-${w.id}-${ck}`, `${w.id} on ${ck}, not walkable (or climbing-wall clearance)`);
      if (here.has(ck)) flag(`share-${ck}`, `${w.id} and ${here.get(ck)} share ${ck}`);
      here.set(ck, w.id);
      if (w.mode === 'walk') {
        const next = w.claims[0];
        if (next && here.get(key(next)) && here.get(key(next)) !== w.id) flag(`into-${key(next)}`, `${w.id} walks into ${key(next)} where ${here.get(key(next))} stands`);
        const claim = w.claims.map(key).join(' ');
        if (claim !== s.claim && w.claims.length && w.claims.length === w.claims.length && !s.claim.endsWith(claim)) {
          const onPlayer = w.claims.find((c) => c.x === player.x && c.y === player.y);
          if (onPlayer) flag(`player-${w.id}`, `${w.id} set off onto the player's tile ${key(onPlayer)}`);
        }
        s.claim = claim;
      } else s.claim = '';
      if (w.mode === 'idle') {
        if (town.noStop(cell.x, cell.y) && t - s.cellT > 0.2) flag(`nostop-${w.id}-${ck}`, `${w.id} stopped on door / door front / stop cell ${ck} (${w.task})`);
        if (w.role === 'stroller' && w.task.startsWith('stroll') && !w.path.length) {
          s.idle += DT;
          if (zoneCells.has(ck)) {
            s.idleInZone += DT;
            s.zonesSeen.add(zoneOf.get(ck));
          }
        }
      }
      if (w.task === 'rethink' && t - s.taskT > 20) flag(`stuck-${w.id}`, `${w.id} stuck rethinking at ${ck}`);
      if (w.mode === 'idle' && w.path.length) {
        s.blockedSince ??= t;
        if (t - s.blockedSince > 20) flag(`stuck-path-${w.id}`, `${w.id} waited ${Math.round(t - s.blockedSince)} s at ${ck} for a blocked route`);
      } else if (w.mode === 'walk') s.blockedSince = null;

      if (w.role === 'stargazer' && w.task === 'gaze') {
        if (!deck.has(ck)) flag(`gaze-off-${w.id}`, `${w.id} gazes from ${ck}, off the deck`);
        if (!['se', 'sw'].includes(w.dir) || w.pose !== 'lookUp') flag(`gaze-face-${w.id}`, `${w.id} gazes facing ${w.dir} pose ${w.pose}`);
        if (routines.animKey(w) !== `estrellas_${w.dir}`) flag(`gaze-tex-${w.id}`, `${w.id} gazing shows ${routines.animKey(w)} (want estrellas_${w.dir})`);
        gazing++;
      }
      if (w.role === 'bench' && w.task === 'sit') {
        const bench = town.benches.find((x) => key(x.front) === ck);
        if (!bench) flag(`sit-off-${w.id}`, `${w.id} sits at ${ck}, not at a bench`);
        else {
          if (w.dir !== bench.seatFace || w.pose !== 'sit' || key(w.seat ?? {}) !== key(bench.seat)) flag(`sit-face-${w.id}`, `${w.id} sits on ${bench.id} (${bench.variant}) facing ${w.dir} (want ${bench.seatFace}) pose ${w.pose}`);
          if (routines.animKey(w) !== `sentado_${bench.seatFace}`) flag(`sit-tex-${w.id}`, `${w.id} sitting shows ${routines.animKey(w)} (want sentado_${bench.seatFace})`);
        }
      }
      if (w.role === 'queue' && (w.phase === 'inLine' || w.phase === 'ordering' || w.phase === 'buying') && w.mode === 'idle' && !w.path.length && w.task !== 'make way') {
        const cart = town.carts[w.cart];
        const slot = cart.slots.findIndex((c) => key(c) === ck);
        if (slot < 0) flag(`line-off-${w.id}`, `${w.id} queues at ${ck}, not a place in ${cart.id}'s line`);
        else {
          if (w.dir !== cart.faces[slot]) flag(`line-face-${w.id}`, `${w.id} in place ${slot + 1} faces ${w.dir} (want ${cart.faces[slot]})`);
          lineSeen[w.cart].add(slot);
          queued++;
          if ((w.phase === 'buying' || w.phase === 'ordering') && slot !== 0) flag(`buy-slot-${w.id}`, `${w.id} ${w.phase} at place ${slot + 1}`);
        }
      }
      if (b.phase === 'inLine' && w.phase === 'inLine' && b.slot === w.slot + 1) {
        ev.steps++;
        if (b.slot >= 1 && routines.owners().carts[w.cart][b.slot] === w.id) flag(`step-${w.id}`, `${w.id} still owns its old place after stepping up`);
      }
      if (w.role === 'stroller' && w.mode === 'idle' && !w.path.length && !s.far && !town.zones.some((z) => z.cells.some((c) => dist(c, cell) <= STROLL_REACH))) s.far = ck;
      if (w.role === 'crosser') {
        if (w.mode === 'walk' && w.task === 'cross the map' && !town.street(player.x, player.y)) {
          s.crossCells++;
          if (town.street(cell.x, cell.y)) s.crossStreet++;
          else if (process.env.QA_DEBUG_OFF === w.id && seed === Number(process.env.QA_DEBUG_SEED)) console.log(t.toFixed(1), w.id, ck, w.task, w.path.slice(0, 4).map(key).join('>'), 'blocked', w.blockedFor.toFixed(1));
        }
        if (w.task === 'street end' && s.task === 'street end' && t - s.taskT < DT * 1.5) {
          const e = ends.find((x) => key(x) === ck);
          if (!e) flag(`end-${w.id}`, `${w.id} paused at ${ck}, not a street end`);
          else {
            if (s.crossFrom && dist(s.crossFrom, e) < 10) flag(`short-${w.id}`, `${w.id} crossed only ${key(s.crossFrom)} -> ${ck}`);
            s.lastEnd = e;
            ev.ends++;
          }
        }
      }
    }
    if (t > 8) {
      ev.gazeSamples.push(gazing);
      ev.queueSamples.push(queued);
    }
  }

  for (const w of W) {
    const s = st.get(w);
    if (s.tasks < 2 && w.role !== 'stargazer') flag(`idle-${w.id}`, `${w.id} (${w.role}) never changed task in ${SIM_S} s`);
    if (w.role === 'stroller') {
      if (s.idle && s.idleInZone / s.idle < 0.99) flag(`zone-${w.id}`, `${w.id} made only ${Math.round((100 * s.idleInZone) / s.idle)}% of its stroll stops by the fountain / dog park`);
      if (s.far) flag(`zone-far-${w.id}`, `${w.id} strayed to ${s.far}, over ${STROLL_REACH} tiles from the fountain / dog park`);
    }
    if (w.role === 'crosser' && s.crossCells && s.crossStreet / s.crossCells < 0.8) {
      flag(`street-${w.id}`, `${w.id} crossed on the street only ${Math.round((100 * s.crossStreet) / s.crossCells)}% of the way (player off the street)`);
    }
  }
  const strollZones = new Set(W.filter((w) => w.role === 'stroller').flatMap((w) => [...st.get(w).zonesSeen]));
  if (strollZones.size < Math.min(2, town.zones.length)) flag('zones', `strollers only visited ${[...strollZones].join(', ')}`);
  const g = ev.gazeSamples;
  const ok = g.filter((n) => n >= 2 && n <= 3).length / g.length;
  if (ok < 0.95) flag('gaze-n', `2-3 stargazers on the deck only ${Math.round(ok * 100)}% of the time`);
  const lined = ev.queueSamples.filter((n) => n >= 2).length / ev.queueSamples.length;
  if (lined < 0.55) flag('queue-n', `2+ people standing in the cart lines only ${Math.round(lined * 100)}% of the time`);
  const empty = ev.queueSamples.filter((n) => n === 0).length / ev.queueSamples.length;
  if (empty > 0.15) flag('queue-empty', `nobody standing at either cart ${Math.round(empty * 100)}% of the time`);
  if (g.some((n) => n > 3)) flag('gaze-max', `more than 3 stargazers at once`);
  if (ev.buys.length < 12) flag('buys', `only ${ev.buys.length} purchases in ${SIM_S} s`);
  for (let i = 0; i < town.carts.length; i++) {
    if (!lineSeen[i].has(0) || !lineSeen[i].has(1)) flag(`line-${i}`, `${town.carts[i].id}: line never had a front and a second place (${[...lineSeen[i]]})`);
  }
  if (ev.joins < 8) flag('joins', `only ${ev.joins} people joined a line`);
  if (ev.steps < 6) flag('steps', `lines stepped up only ${ev.steps} times`);
  if (ev.sits.length < 6) flag('sits', `only ${ev.sits.length} bench sessions`);
  if (ev.ends < 8) flag('ends-n', `crossers reached only ${ev.ends} street ends`);
  if (ev.visits.length < 6) flag('visits', `only ${ev.visits.length} building visits`);
  const starts = W.map((w) => st.get(w).firstWalk).filter((x) => x !== null);
  const buckets = new Set(starts.map((x) => Math.floor(x / 0.25)));
  if (buckets.size < Math.min(10, starts.length)) flag('stagger', `first steps bunch into ${buckets.size} quarter-seconds`);

  for (const m of fail.values()) errors.push(m);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return (
    `${tag}: roles ${Object.entries(roles).map(([r, n]) => `${r} ${n}`).join(', ')}; ` +
    `${ev.buys.length} purchases (avg ${avg(ev.buys.map((b) => b.dur)).toFixed(1)} s), ${ev.joins} joins, ${ev.steps} step-ups; ` +
    `${ev.sits.length} bench sessions (avg ${avg(ev.sits.map((b) => b.dur)).toFixed(0)} s); ${ev.ends} street ends; ` +
    `${ev.visits.length} visits (avg ${avg(ev.visits.map((b) => b.dur)).toFixed(0)} s inside); ` +
    `deck 2-3 stargazers ${Math.round(ok * 100)}% of the time; in line 0/1/2/3+ ${[0, 1, 2, 3].map((n) => Math.round((100 * ev.queueSamples.filter((q) => (n === 3 ? q >= 3 : q === n)).length) / ev.queueSamples.length)).join('/')}%; ${ev.rethinks} dropped errands; strollers by ${[...strollZones].join(' + ')}`
  );
}

function poseHooks(R, errors) {
  const town = R.buildTown();
  const strips = new R.NpcRoutines(defs(), { blocked: () => false }, R.mulberry32(5), town);
  const plain = new R.NpcRoutines(defs({ poses: false }), { blocked: () => false }, R.mulberry32(5), town);
  const seen = { sat: false, looked: false, plainSat: false, plainLooked: false };
  const gazeFrames = new Map();
  for (let t = 0; t < 400 && !Object.values(seen).every(Boolean); t += DT) {
    strips.update(DT);
    plain.update(DT);
    for (const w of strips.walkers) {
      if (w.task !== 'gaze') continue;
      seen.looked = true;
      const shown = gazeFrames.get(w) ?? [];
      if (shown.at(-1)?.frame !== w.frame) shown.push({ frame: w.frame, t });
      gazeFrames.set(w, shown);
    }
    for (const w of strips.walkers) if (w.task === 'sit' && w.mode === 'idle') seen.sat = true;
    for (const w of plain.walkers) {
      if (w.task === 'sit' && w.mode === 'idle') {
        seen.plainSat = true;
        const b = town.benches[w.bench];
        if (plain.animKey(w) !== `idle_${b.face}` || w.dir !== b.face) errors.push(`run48-poses: without a sit strip ${w.id} shows ${plain.animKey(w)} facing ${w.dir} (want idle_${b.face})`);
      }
      if (w.task === 'gaze') {
        seen.plainLooked = true;
        if (plain.animKey(w) !== `idle_${w.dir}`) errors.push(`run48-poses: without a stargaze strip ${w.id} shows ${plain.animKey(w)}`);
      }
    }
  }
  for (const [k, v] of Object.entries(seen)) if (!v) errors.push(`run48-poses: ${k} never exercised`);
  // estrellas: 4 steps (0,0,0,1) at 1 fps, so the play index ticks once a second through 0..3.
  for (const [w, shown] of gazeFrames) {
    const a = w.anims[strips.animKey(w)];
    if (a.count !== 4 || a.fps !== 1) errors.push(`run48-poses: ${w.id} stargaze strip plays ${a.count} steps at ${a.fps} fps (want 4 at 1)`);
    const steps = shown.slice(1).map((s, i) => s.t - shown[i].t);
    if (steps.some((d) => Math.abs(d - 1) > 2 * DT)) errors.push(`run48-poses: ${w.id} stargaze steps ${steps.map((d) => d.toFixed(2)).join(', ')} s apart (want 1 s)`);
  }
  return 'run48-poses: sit and stargaze strips drawn from the manifest (estrellas 0,0,0,1 at 1 fps); without them, idle facing out of the bench / the gaze direction';
}

/** @param {{ errors: string[], notes: string[] }} args */
export async function runRun48RoutineSuite({ errors, notes }) {
  const R = await loadRoutines();
  for (const seed of SEEDS) notes.push(simulate(R, seed, errors, `run48-seed${seed}`));
  notes.push(poseHooks(R, errors));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const errors = [];
  const notes = [];
  await runRun48RoutineSuite({ errors, notes });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.log(`FAIL: ${e}`);
  process.exit(errors.length ? 1 : 0);
}
