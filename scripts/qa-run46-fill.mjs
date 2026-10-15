/**
 * Run #46 map fill (deploy gate). Checks the relleno placements against the live map:
 *  - every plan item is placed where relleno.json says (the report lists no refused spot); no prop
 *    footprint or actor cell sits on a street, a building footprint, a door access or the cell in
 *    front of a door; every door cell is reachable; the facades keep their own door cell open
 *  - every bench seat cell is reachable from the spawn without a long way round
 *  - no fill sprite (bots included) overlaps the Estudio sprite's opaque pixels
 *  - props block only their own cells, the plaza stays walkable, no walkable pocket is sealed off
 *  - the replaced FILLER trees are gone; actors load, animate and sort in front of the Estudio
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run46-fill.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN46_FILL_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } } },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } } },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  },
};

const mapa = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mapa_datos.json'), 'utf8'));
const relleno = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/relleno.json'), 'utf8'));
const sprites = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprites.json'), 'utf8'));
const alpha = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/sprite-alpha.json'), 'utf8'));
const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/npcs.json'), 'utf8'));

/** FILLER plaza cells in src/data/world.ts: walkable park ground. */
const PLAZA = [[28, 37], [34, 37], [29, 38], [30, 38], [31, 38], [32, 38], [33, 38]];
const REPLACED = relleno.replaced.map(([x, y]) => `prop/tree/${x}-${y}`);

const key = (x, y) => `${x},${y}`;
const decode = (m) => ({ ...m, b: Buffer.from(m.bits, 'base64') });
const on = (m, cx, cy) => cx >= 0 && cy >= 0 && cx < m.w && cy < m.h && (m.b[(cy * m.w + cx) >> 3] & (1 << ((cy * m.w + cx) & 7))) !== 0;
const foot = (x, y) => ({ x: (x - y) * 64, y: (x + y) * 32 + 32 });

function estudioHit() {
  const e = mapa.edificios.estudio;
  const m = decode(alpha['ext/estudio']);
  const s = foot(e.x + e.w - 1, e.y + e.h - 1);
  const vfs = sprites.assets['ext/estudio/default/cerca'].vfs;
  const tl = { x: s.x - vfs.x, y: s.y - vfs.y };
  return (wx, wy) => on(m, Math.floor((wx - tl.x) / m.cell), Math.floor((wy - tl.y) / m.cell));
}

/** Opaque 4 px cells of `mask` placed at world `tl` that land on an opaque Estudio cell. */
function overlapCount(mask, tl, hit) {
  const m = decode(mask);
  let n = 0;
  for (let cy = 0; cy < m.h; cy++) {
    for (let cx = 0; cx < m.w; cx++) {
      if (!on(m, cx, cy)) continue;
      const x0 = tl.x + cx * m.cell;
      const y0 = tl.y + cy * m.cell;
      const e = m.cell - 1;
      if (hit(x0, y0) || hit(x0 + e, y0) || hit(x0, y0 + e) || hit(x0 + e, y0 + e)) n++;
    }
  }
  return n;
}

function dataChecks(f, streets, instances, benches, tag, errors, notes) {
  const missing = f.report.filter((r) => !r.placed);
  for (const r of missing) errors.push(`${tag}: ${r.id} was not placed (${r.plannedConflicts.join('; ')})`);
  // The report is what a reviewer reads: a planned spot that had to be refused means relleno.json is stale.
  for (const r of f.report.filter((r) => r.placed && r.plannedConflicts.length)) {
    errors.push(`${tag}: ${r.id} planned at (${r.planned}) was moved to (${r.placed}): ${r.plannedConflicts.join('; ')}`);
  }

  const footprint = new Map();
  const doors = new Set();
  for (const [id, e] of Object.entries(mapa.edificios)) {
    for (let dy = 0; dy < e.h; dy++) for (let dx = 0; dx < e.w; dx++) footprint.set(key(e.x + dx, e.y + dy), id);
    const [ax, ay] = e.acceso;
    doors.add(key(ax, ay));
    if (e.cara_puerta === '+y') doors.add(key(ax, ay + 1));
    if (e.cara_puerta === '+x') doors.add(key(ax + 1, ay));
  }
  const street = new Set(streets.map((s) => key(s.x, s.y)));
  const walkAt = (x, y) => f.walk[y]?.[x];
  const solid = new Set(f.solidCells.map(([x, y]) => key(x, y)));
  const fillCells = [...f.solidCells, ...f.flatCells];

  for (const [x, y] of fillCells) {
    const c = key(x, y);
    if (street.has(c)) errors.push(`${tag}: fill on street (${c})`);
    if (footprint.has(c)) errors.push(`${tag}: fill on the ${footprint.get(c)} footprint (${c})`);
    if (doors.has(c)) errors.push(`${tag}: fill on a door access / door front (${c})`);
  }
  // Each prop's whole declared footprint and every actor's cell, not only the cells that block.
  const occupied = [
    ...f.objects.flatMap((o) => o.cells.map(([x, y]) => ({ id: o.id, x, y }))),
    ...f.actors.filter((a) => !a.id.endsWith(':overlay')).map((a) => ({ id: a.id, x: a.tx, y: a.ty })),
  ];
  for (const { id, x, y } of occupied) {
    const c = key(x, y);
    if (footprint.has(c)) errors.push(`${tag}: ${id} overlaps the ${footprint.get(c)} footprint at (${c})`);
    if (doors.has(c)) errors.push(`${tag}: ${id} stands on a door access / door front (${c})`);
  }
  for (const c of doors) {
    const [x, y] = c.split(',').map(Number);
    if (!'=.:'.includes(walkAt(x, y))) errors.push(`${tag}: door cell (${c}) is not walkable`);
  }
  for (const o of f.objects) {
    const side = o.key.match(/\/(izq|der)\/cerca$/)?.[1];
    if (!/fachada/.test(o.key) || !side) continue;
    const front = o.cells.reduce((a, b) => (b[0] + b[1] > a[0] + a[1] ? b : a));
    const [dx, dy] = side === 'izq' ? [0, 1] : [1, 0];
    if (!'=.:'.includes(walkAt(front[0] + dx, front[1] + dy))) errors.push(`${tag}: ${o.id} door cell (${front[0] + dx},${front[1] + dy}) is blocked`);
  }

  for (const c of solid) {
    const [x, y] = c.split(',').map(Number);
    if (walkAt(x, y) !== '#') errors.push(`${tag}: fill cell (${c}) should block`);
  }
  for (const [x, y] of f.flatCells) {
    if (!solid.has(key(x, y)) && walkAt(x, y) === '#') errors.push(`${tag}: flat fill cell (${x},${y}) is not walkable`);
  }
  const owned = new Set(f.owned.map(([x, y]) => key(x, y)));
  for (let y = 0; y < f.walk.length; y++) {
    for (let x = 0; x < f.walk[y].length; x++) {
      if (f.walk[y][x] === '#' && !owned.has(key(x, y))) errors.push(`${tag}: (${x},${y}) is blocked but no prop or footprint owns it`);
    }
  }
  for (const [x, y] of PLAZA) if (walkAt(x, y) === '#') errors.push(`${tag}: plaza cell (${x},${y}) is blocked`);
  for (const id of REPLACED) if (instances.some((i) => i.id === id)) errors.push(`${tag}: replaced FILLER ${id} is still on the map`);

  // Walkable pockets sealed off by fill: BFS (4-neighbour) from the spawn over walkable cells.
  const seen = new Set([key(mapa.inicio[0], mapa.inicio[1])]);
  const queue = [mapa.inicio];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!'=.:'.includes(walkAt(nx, ny) ?? '#') || seen.has(key(nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  for (const [x, y] of f.solidCells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = key(x + dx, y + dy);
      if ('=.:'.includes(walkAt(x + dx, y + dy) ?? '#') && !seen.has(c)) errors.push(`${tag}: (${c}) next to fill cannot be reached from the spawn`);
    }
  }
  for (const c of doors) if (!seen.has(c)) errors.push(`${tag}: door cell (${c}) cannot be reached from the spawn`);
  // A seat cell boxed in by props is reachable only the long way round (the fountain once left
  // (30,40), bench 29-40's seat, 18 steps from a spawn 5 away).
  for (const b of benches) {
    if (b.path == null) errors.push(`${tag}: ${b.id} seat cell (${b.front.x},${b.front.y}) cannot be reached from the spawn`);
    else if (b.path > b.direct + 4) errors.push(`${tag}: ${b.id} seat cell (${b.front.x},${b.front.y}) is ${b.path} steps from the spawn, ${b.direct} as the crow walks`);
  }

  const hit = estudioHit();
  const overEstudio = [];
  for (const o of f.objects) {
    if (!o.key.startsWith('fill/')) continue;
    const n = overlapCount(relleno.masks[o.key.replace(/\/cerca$/, '')], o.tl, hit);
    if (n) overEstudio.push(`${o.id} (${n})`);
  }
  const bots = [];
  for (const a of f.actors) {
    if (a.id.endsWith(':overlay')) continue;
    if (a.sprite.startsWith('npc:')) {
      const def = npcs.npcs.find((n) => n.id === a.sprite.slice(4).split('/')[0]);
      if (!def) errors.push(`${tag}: ${a.id} uses unknown NPC ${a.sprite}`);
      let n = 0;
      for (let y = a.bounds.y0; y < a.bounds.y1; y += 4) for (let x = a.bounds.x0; x < a.bounds.x1; x += 4) if (hit(x, y)) n++;
      if (n) overEstudio.push(`${a.id} (${n})`);
      continue;
    }
    const n = overlapCount(relleno.masks[a.sprite], { x: a.bounds.x0, y: a.bounds.y0 }, hit);
    if (n) overEstudio.push(`${a.id} (${n})`);
    if (a.id.startsWith('bot-')) bots.push(`${a.id} (${a.tx},${a.ty})`);
    if (!(a.zIndex > -9)) errors.push(`${tag}: ${a.id} at (${a.tx},${a.ty}) sorts under the ground art (zIndex ${a.zIndex})`);
  }
  if (overEstudio.length) errors.push(`${tag}: sprites over the Estudio: ${overEstudio.join(', ')}`);
  if (bots.length !== 4) errors.push(`${tag}: ${bots.length} bots on the map, want 4`);

  const moved = f.report.filter((r) => r.placed && (r.placed[0] !== r.planned[0] || r.placed[1] !== r.planned[1]));
  const kept = f.report.filter((r) => r.note);
  notes.push(
    `${tag}: ${f.report.length - missing.length}/${f.report.length} placed, ${fillCells.length} fill cells clear of streets/footprints/doors, ` +
      `0 sprites over the Estudio; bots ${bots.join(', ')}; moved ${moved.map((r) => `${r.id} (${r.planned}) -> (${r.placed})`).join(', ') || 'none'}` +
      (kept.length ? `; ${kept.map((r) => `${r.id}: ${r.note}`).join('; ')}` : ''),
  );
}

/**
 * @param {{ kind: keyof typeof RUN46_FILL_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun46FillSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN46_FILL_KINDS[kind];
  const tag = `run46-${kind}-fill`;
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(spec.options);
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__playtestQa?.fill?.().loaded, null, { timeout: 20000 });
    const f = await qa(page, () => window.__playtestQa.fill());
    const streets = await qa(page, () => window.__playtestQa.streetTiles());
    const instances = await qa(page, () => window.__playtestQa.spriteInstances());
    const benches = await qa(page, () => {
      const q = window.__playtestQa;
      const [sx, sy] = q.inicio;
      return q.benches().benches.map((b) => ({
        id: b.id,
        front: b.front,
        path: q.findPath(sx, sy, b.front.x, b.front.y)?.length ?? null,
        direct: Math.abs(b.front.x - sx) + Math.abs(b.front.y - sy),
      }));
    });
    if (kind === 'chromium-1280') dataChecks(f, streets, instances, benches, tag, errors, notes);

    const placedProps = relleno.placements.filter((p) => p.kind === 'prop').length;
    const fillObjects = f.objects.filter((o) => o.key.startsWith('fill/'));
    if (fillObjects.length !== placedProps) errors.push(`${tag}: ${fillObjects.length} fill props drawn, want ${placedProps}`);
    for (const o of fillObjects) {
      if (!Number.isFinite(o.zIndex)) errors.push(`${tag}: ${o.id} has no sprite`);
      else if (o.flat !== (o.zIndex === -10)) errors.push(`${tag}: ${o.id} flat=${o.flat} but zIndex ${o.zIndex}`);
    }
    const wantActors = relleno.placements.filter((p) => p.kind === 'actor').length + 1;
    if (f.actors.length !== wantActors) errors.push(`${tag}: ${f.actors.length} fill actors, want ${wantActors} (with the golf ball)`);

    // Every drawn frame for 2.5 s: two snapshots can land on the same frame of a loop, more so when
    // a slow renderer (CI software GL, ~4 fps) runs game time slow.
    const seen = await qa(
      page,
      (ms) =>
        new Promise((resolve) => {
          const out = {};
          const t0 = performance.now();
          const tick = () => {
            for (const a of window.__playtestQa.fill().actors) (out[a.id] ??= new Set()).add(a.frame);
            if (performance.now() - t0 < ms) requestAnimationFrame(tick);
            else resolve(Object.fromEntries(Object.entries(out).map(([id, s]) => [id, s.size])));
          };
          requestAnimationFrame(tick);
        }),
      2500,
    );
    const still = Object.keys(seen).filter((id) => /^(bot-|golf-golfista|fill\/golf-green)/.test(id) && seen[id] < 2);
    if (still.length) errors.push(`${tag}: not animating: ${still.join(', ')}`);

    if (shots) {
      const c = (x, y) => [(x - y) * 64, (x + y) * 32];
      const phone = kind === 'chromium-375';
      const spots = { plaza: [31, 39, 0.9], bots: [35, 32, 1.3], mirador: [52, 37, 1.0], golf: [50, 47, 1.0], west: [17, 30, 0.6] };
      for (const [name, [x, y, z]] of Object.entries(spots)) {
        const [wx, wy] = c(x, y);
        await qa(page, ([a, b, zz]) => window.__playtestQa.frameWorld(a, b, zz), [wx, wy - 40, phone ? z * 0.8 : z]);
        await wait(600);
        await page.screenshot({ path: path.join(shots, `fill-${name}-${kind}.png`) });
      }
    }
    notes.push(`${tag}: ${fillObjects.length} props + ${f.actors.length} actors drawn, bots/golfer animating`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run46') : undefined;
  if (shots) fs.mkdirSync(shots, { recursive: true });
  const base = args.find((a) => /^https?:/.test(a)) ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN46_FILL_KINDS)) await runRun46FillSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
