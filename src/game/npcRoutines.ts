import { cells, keepClear, MAP_HEIGHT, MAP_WIDTH, nearMuroClearance, objects, type MapObject } from '../data/map';

/**
 * Activity routines for the 20 street NPCs. No Pixi here: this owns where everyone is, where they
 * are going and which strip they show, and `NpcCrowd` (npcs.ts) draws it. Movement is one tile at a
 * time in the four sprite facings, exactly as the walk cycle is drawn.
 *
 * Rules every routine shares:
 *  - nobody steps onto the player's tile (or Pantone's / Noah's), and the player is never blocked:
 *    NPC cells are not part of the player's walk grid, so the player walks through
 *  - door accesses, door fronts, the spawn and monument stops are pass-through only: an NPC enters
 *    one only after reserving every cell up to the next ordinary cell, so it never waits, pauses
 *    or turns up on one (a building visitor vanishes on its own door the moment it arrives)
 *  - the climbing wall's clearance stays free for Noah
 *  - the bench the player sits on (or is walking to) is nobody else's
 *  - start times, pauses and start frames are random so nobody moves in step
 */

export type NpcDir = 'se' | 'sw' | 'ne' | 'nw';
export type NpcPose = 'sit' | 'lookUp';
/** Manifest strip for each pose: `<strip>_<dir>` (sentado_se, estrellas_sw, ...). */
export const POSE_STRIP: Record<NpcPose, string> = { sit: 'sentado', lookUp: 'estrellas' };
export type NpcRole = 'stargazer' | 'queue' | 'bench' | 'crosser' | 'visitor' | 'stroller';
export type Cell = { x: number; y: number };

/** Tile step per facing: se = +x, sw = +y, nw = −x, ne = −y. */
export const DIR_STEP: Record<NpcDir, { dx: number; dy: number }> = {
  se: { dx: 1, dy: 0 },
  sw: { dx: 0, dy: 1 },
  nw: { dx: -1, dy: 0 },
  ne: { dx: 0, dy: -1 },
};
const DIRS: NpcDir[] = ['se', 'sw', 'ne', 'nw'];

/** Who does what. Ids missing here stroll. */
export const NPC_ROLES: Readonly<Record<string, NpcRole>> = {
  estudiante: 'stargazer',
  'pana-gorra': 'stargazer',
  'senora-mono': 'stargazer',
  'chamo-audifonos': 'queue',
  'mujer-rizos': 'queue',
  'senor-bigote': 'queue',
  'chama-trenzas': 'queue',
  'abuelo-baston': 'bench',
  'senora-hijab': 'bench',
  profesora: 'bench',
  corredora: 'crosser',
  repartidor: 'crosser',
  obrero: 'crosser',
  'chica-telefono': 'crosser',
  'mujer-tote': 'visitor',
  'senor-sombrero': 'visitor',
  'mujer-alta-rizos': 'visitor',
  'senor-calvo': 'stroller',
  vendedora: 'stroller',
  'senor-cafecito': 'stroller',
};

type Range = readonly [number, number];
const START_STAGGER_S: Range = [0, 6];
const GAZE_S: Range = [45, 150];
const GAZE_BREAK_S: Range = [4, 12];
/** Gazers face the viewer: the stargaze strip tilts the head back in se / sw (from behind, ne / nw, it barely shows). */
const GAZE_DIRS: NpcDir[] = ['se', 'sw'];
/** At the front, the vendor makes the order before the (short) purchase: this is what keeps the line slow. */
const ORDER_S: Range = [10, 18];
const BUY_S: Range = [2.5, 5];
/** Pause before stepping up when the place ahead in the line opens. */
const QUEUE_STEP_S: Range = [0.8, 2.2];
const QUEUE_AWAY_S: Range = [3, 8];
/** Longest walk (tiles) from the cart to where a buyer stands with the snack. */
const SNACK_WALK = 4;
const SIT_S: Range = [20, 50];
const BENCH_BREAK_S: Range = [3, 10];
const END_PAUSE_S: Range = [2, 6];
/** The stay leaves a few seconds for stepping out when the door is busy, within the 20-60 s visit. */
const INSIDE_S: Range = [20, 55];
const VISIT_BREAK_S: Range = [2, 8];
const STROLL_PAUSE_S: Range = [2, 8];
const BLOCKED_RETRY_S: Range = [0.3, 0.8];
const POLL_S = 0.25;
/** Blocked this long (and again every as long): look for a way around the NPCs in the way. */
const REPATH_AFTER_S = 2.5;
/** Face to face with someone who wants this tile: one of the two steps aside after this long. */
const YIELD_AFTER_S = 1;
const STEP_ASIDE_S: Range = [1, 2];
/** Tiles (Manhattan) around a blocked walker whose NPCs a way round avoids. */
const JAM_RADIUS = 3;
/** Blocked this long: drop the errand and pick a new one. */
const GIVE_UP_S = 8;
const QUEUE_SLOTS = 3;
const ZONE_RADIUS = 3;
/** A stroll stop may take at most this many tiles more than the straight (Manhattan) distance. */
const STROLL_DETOUR = 4;
/** Half a tile's width: a one-tile step moves 64 px in x and 32 px in y. */
export const TILE_STEP_X = 64;

/**
 * `front` is where a sitter stands up to (facing `face`, away from the bench); seated, they face
 * `seatFace`, the way the bench art looks: orientacion-der benches face se, izq benches sw.
 */
export type Bench = { id: string; variant: 'der' | 'izq'; seat: Cell; front: Cell; face: NpcDir; seatFace: NpcDir };
/** A cart's line: `slots[0]` is served; each place faces the one ahead (the first faces the cart). */
export type Cart = { id: string; at: Cell; slots: Cell[]; faces: NpcDir[] };
export type Door = { name: string; door: Cell };
export type Zone = { name: string; cells: Cell[] };

/** Everything the routines need from the map, worked out once from the live grid. */
export type Town = {
  /** Walkable and outside the climbing wall's clearance. */
  walk(x: number, y: number): boolean;
  street(x: number, y: number): boolean;
  /** Door access, door front, spawn or monument stop: walk through, never stop. */
  noStop(x: number, y: number): boolean;
  /** Fine to stop on for an errand that does not own the cell (not a queue place, seat or deck spot). */
  standable(x: number, y: number): boolean;
  benches: Bench[];
  carts: Cart[];
  mirador: Cell[];
  doors: Door[];
  /** Ends of the main streets, for crossers. */
  ends: Cell[];
  zones: Zone[];
};

const key = (x: number, y: number) => y * MAP_WIDTH + x;
const STEPS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function dirBetween(from: Cell, to: Cell): NpcDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'se' : 'nw';
  return dy >= 0 ? 'sw' : 'ne';
}

function footprint(o: MapObject): Cell[] {
  const out: Cell[] = [];
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  for (let dy = 0; dy < (o.h ?? 1); dy++) for (let dx = 0; dx < (o.w ?? 1); dx++) out.push({ x: fx + dx, y: fy + dy });
  return out;
}

export function buildTown(): Town {
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
  const walk = (x: number, y: number) => inMap(x, y) && cells[y][x].walkable && !nearMuroClearance(x, y) && !(x === 38 && y === 41);
  const street = (x: number, y: number) => inMap(x, y) && cells[y][x].groundId.includes('path/street');
  const noStop = (x: number, y: number) => keepClear.has(`${x},${y}`);
  const owned = new Set<number>();
  const free = (x: number, y: number) => walk(x, y) && !noStop(x, y) && !owned.has(key(x, y));

  const carts: Cart[] = [];
  for (const o of objects) {
    const m = o.sprite?.match(/^fill\/(carrito-cachapas|puesto-jugos)\/(izq|der)$/);
    if (!m) continue;
    const at = { x: o.x, y: o.y };
    const facing = m[2] === 'izq' ? STEPS[2] : STEPS[0];
    const ok = (c: Cell) => free(c.x, c.y) && !street(c.x, c.y);
    // The first place is beside the cart (its serving side first); the line runs straight from
    // there, away from the cart first, and may turn the corner when the cells behind are taken.
    let best: Cell[] = [];
    for (const n of [facing, ...STEPS.filter((s) => s !== facing)]) {
      const first = { x: at.x + n.x, y: at.y + n.y };
      if (!ok(first)) continue;
      for (const d of [n, ...STEPS.filter((s) => s !== n && (s.x !== -n.x || s.y !== -n.y))]) {
        const line = [first];
        while (line.length < QUEUE_SLOTS) {
          const c = { x: first.x + d.x * line.length, y: first.y + d.y * line.length };
          if (!ok(c)) break;
          line.push(c);
        }
        if (line.length > best.length) best = line;
      }
      if (best.length === QUEUE_SLOTS) break;
    }
    if (best.length < 2) continue;
    for (const c of best) owned.add(key(c.x, c.y));
    carts.push({ id: o.id, at, slots: best, faces: best.map((c, i) => dirBetween(c, i ? best[i - 1] : at)) });
  }

  const mirador: Cell[] = [];
  const deck = objects.find((o) => o.id === 'fill/mirador');
  if (deck) {
    for (const c of footprint(deck)) {
      if (!free(c.x, c.y)) continue;
      mirador.push(c);
      owned.add(key(c.x, c.y));
    }
  }

  const benches: Bench[] = [];
  for (const o of objects) {
    if (o.name !== 'bench') continue;
    const seat = { x: o.x, y: o.y };
    const facing = o.variant === 'izq' ? STEPS[2] : STEPS[0];
    const d = [facing, ...STEPS.filter((s) => s !== facing)].find((s) => free(seat.x + s.x, seat.y + s.y));
    if (!d) continue;
    const front = { x: seat.x + d.x, y: seat.y + d.y };
    owned.add(key(front.x, front.y));
    const variant = o.variant === 'izq' ? 'izq' : 'der';
    benches.push({ id: o.id, variant, seat, front, face: dirBetween(seat, front), seatFace: variant === 'izq' ? 'sw' : 'se' });
  }

  const doors: Door[] = objects
    .filter((o) => o.type === 'building' && o.door && o.name !== 'estudio' && walk(o.door.x, o.door.y))
    .map((o) => ({ name: o.name, door: { ...o.door! } }));

  const zones: Zone[] = [];
  for (const [name, id] of [
    ['fountain', 'fill/fuente'],
    ['dog park', 'fill/perrera'],
  ] as const) {
    const o = objects.find((p) => p.id === id);
    if (!o) continue;
    const fp = footprint(o);
    const x0 = Math.min(...fp.map((c) => c.x)) - ZONE_RADIUS;
    const x1 = Math.max(...fp.map((c) => c.x)) + ZONE_RADIUS;
    const y0 = Math.min(...fp.map((c) => c.y)) - ZONE_RADIUS;
    const y1 = Math.max(...fp.map((c) => c.y)) + ZONE_RADIUS;
    const zc: Cell[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (free(x, y) && !street(x, y)) zc.push({ x, y });
    if (zc.length) zones.push({ name, cells: zc });
  }

  return {
    walk,
    street,
    noStop,
    standable: free,
    benches,
    carts,
    mirador,
    doors,
    ends: streetEnds(walk, street, noStop),
    zones,
  };
}

/**
 * Both ends of the two longest straight streets (the Estudio street and the avenue, which the
 * redoma interrupts), for crossers.
 */
function streetEnds(
  walk: (x: number, y: number) => boolean,
  street: (x: number, y: number) => boolean,
  noStop: (x: number, y: number) => boolean,
): Cell[] {
  const ok = (c: Cell) => street(c.x, c.y) && walk(c.x, c.y) && !noStop(c.x, c.y);
  const MAX_GAP = 5;
  const runs: Cell[][] = [];
  for (const horizontal of [true, false]) {
    for (let a = 0; a < MAP_WIDTH; a++) {
      let run: Cell[] = [];
      let gap = 0;
      for (let b = 0; b <= MAP_WIDTH; b++) {
        const c = horizontal ? { x: b, y: a } : { x: a, y: b };
        if (b < MAP_WIDTH && street(c.x, c.y)) {
          run.push(c);
          gap = 0;
        } else if (b < MAP_WIDTH && run.length && ++gap <= MAX_GAP) {
          continue;
        } else {
          if (run.length) runs.push(run);
          run = [];
          gap = 0;
        }
      }
    }
  }
  runs.sort((a, b) => b.length - a.length);
  const out: Cell[] = [];
  for (const run of runs.slice(0, 2)) {
    for (const end of [run, [...run].reverse()]) {
      const c = end.find(ok);
      if (c) out.push(c);
    }
  }
  return out;
}

type PathOpts = {
  streetOnly?: boolean;
  /** Off-street cells cost much more, so a detour rejoins the street as soon as it can. */
  preferStreet?: boolean;
  /** The goal may be a pass-through cell (a visitor's own door). */
  goalNoStop?: boolean;
  avoid?: (x: number, y: number) => boolean;
};

/** A* over the four facings; streets are a little cheaper so people keep to them. */
export function findPath(town: Town, from: Cell, to: Cell, opts: PathOpts = {}): Cell[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  const passable = (x: number, y: number) => {
    if (!town.walk(x, y)) return false;
    if (opts.streetOnly && !town.street(x, y)) return false;
    if (x === to.x && y === to.y) return true;
    return !opts.avoid?.(x, y);
  };
  if (!passable(to.x, to.y)) return null;
  if (!opts.goalNoStop && town.noStop(to.x, to.y)) return null;
  const n = MAP_WIDTH * MAP_HEIGHT;
  const g = new Float32Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const h = (x: number, y: number) => Math.abs(x - to.x) + Math.abs(y - to.y);
  const start = key(from.x, from.y);
  const goal = key(to.x, to.y);
  g[start] = 0;
  push(h(from.x, from.y), start);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) break;
    const x = k % MAP_WIDTH;
    const y = (k - x) / MAP_WIDTH;
    for (const s of STEPS) {
      const nx = x + s.x;
      const ny = y + s.y;
      if (!passable(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;
      const cost = (town.street(nx, ny) ? 1 : opts.preferStreet ? 4 : 1.25) + (town.noStop(nx, ny) && nk !== goal ? 0.75 : 0);
      if (g[k] + cost < g[nk]) {
        g[nk] = g[k] + cost;
        parent[nk] = k;
        push(g[nk] + h(nx, ny), nk);
      }
    }
  }
  if (parent[goal] < 0) return null;
  const out: Cell[] = [];
  for (let k = goal; k !== start; k = parent[k]) out.push({ x: k % MAP_WIDTH, y: Math.floor(k / MAP_WIDTH) });
  return out.reverse();
}

export type AnimInfo = { count: number; fps: number };
export type NpcDefInfo = { id: string; stride: number; anims: Record<string, AnimInfo> };

export type RoutineHost = {
  /** Tiles NPCs must not step onto right now (the player's, Pantone's, Noah's). */
  blocked(x: number, y: number): boolean;
  /** Bench the player sits on or is walking to sit on (nobody else takes it). */
  playerBench?(): string | null;
};

export type Walker = {
  id: string;
  role: NpcRole;
  stride: number;
  anims: Record<string, AnimInfo>;
  tx: number;
  ty: number;
  dir: NpcDir;
  mode: 'walk' | 'idle';
  /** Walk frames taken toward the next tile (0 … stepsPerTile). */
  progress: number;
  frame: number;
  clock: number;
  pose: NpcPose | null;
  /** Bench tile a sitter sits on once a sitting strip exists (until then they stand in front of it). */
  seat: Cell | null;
  /** Inside a building: not drawn and holding no tile. */
  inside: boolean;
  /** What the NPC is doing, for QA and debugging. */
  task: string;
  phase: string;
  path: Cell[];
  /** Cells reserved ahead of the walker (the next tile, or a whole pass-through run). */
  claims: Cell[];
  goalOpts: PathOpts;
  wait: number;
  blockedFor: number;
  repathedAt: number;
  arrive: (() => void) | null;
  /** After stepping aside: picks the errand up again. */
  resume: (() => void) | null;
  /** Role bookkeeping: queue cart + place (and the cart usually queued at), bench (and the last one sat on), deck spot, last door, stroll zone. */
  cart: number;
  homeCart: number;
  slot: number;
  bench: number;
  lastBench: number;
  spot: number;
  door: number;
  zone: number;
  stepUp: boolean;
  /** Seconds since the routine last changed task (QA). */
  since: number;
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NpcRoutines {
  readonly town: Town;
  readonly walkers: Walker[] = [];
  private host: RoutineHost;
  private rand: () => number;
  private reserved = new Map<number, Walker>();
  private queueOwners: (Walker | null)[][];
  private benchOwners: (Walker | null)[];
  private spotOwners: (Walker | null)[];

  constructor(defs: NpcDefInfo[], host: RoutineHost, rand: () => number, town: Town = buildTown()) {
    this.town = town;
    this.host = host;
    this.rand = rand;
    this.queueOwners = town.carts.map((c) => c.slots.map(() => null));
    this.benchOwners = town.benches.map(() => null);
    this.spotOwners = town.mirador.map(() => null);
    for (const def of defs) this.walkers.push(this.make(def));
    this.spawn();
  }

  private range([a, b]: Range): number {
    return a + this.rand() * (b - a);
  }

  private pick<T>(list: readonly T[]): T | undefined {
    return list.length ? list[Math.floor(this.rand() * list.length)] : undefined;
  }

  private make(def: NpcDefInfo): Walker {
    return {
      id: def.id,
      role: NPC_ROLES[def.id] ?? 'stroller',
      stride: def.stride,
      anims: def.anims,
      tx: 0,
      ty: 0,
      dir: DIRS[Math.floor(this.rand() * 4)],
      mode: 'idle',
      progress: 0,
      frame: 0,
      clock: 0,
      pose: null,
      seat: null,
      inside: false,
      task: 'start',
      phase: 'start',
      path: [],
      claims: [],
      goalOpts: {},
      wait: 0,
      blockedFor: 0,
      repathedAt: 0,
      arrive: null,
      resume: null,
      cart: -1,
      homeCart: 0,
      slot: -1,
      bench: -1,
      lastBench: -1,
      spot: -1,
      door: -1,
      zone: Math.floor(this.rand() * Math.max(1, this.town.zones.length)),
      stepUp: false,
      since: 0,
    };
  }

  stepsPerTile(w: Walker): number {
    return TILE_STEP_X / w.stride;
  }

  /** Strip shown now: the pose's strip when the sheet has one, the idle strip facing the same way otherwise. */
  animKey(w: Walker): string {
    if (w.mode === 'walk') return `walk_${w.dir}`;
    if (w.pose && w.anims[`${POSE_STRIP[w.pose]}_${w.dir}`]) return `${POSE_STRIP[w.pose]}_${w.dir}`;
    return `idle_${w.dir}`;
  }

  /** Fractional tile of the feet (between tiles while walking). */
  feet(w: Walker): Cell {
    const s = DIR_STEP[w.dir];
    const t = w.mode === 'walk' ? w.progress / this.stepsPerTile(w) : 0;
    return { x: w.tx + s.dx * t, y: w.ty + s.dy * t };
  }

  /** Who owns each queue place, seat and deck spot (QA). */
  owners(): { carts: (string | null)[][]; benches: (string | null)[]; mirador: (string | null)[] } {
    const id = (w: Walker | null) => w?.id ?? null;
    return {
      carts: this.queueOwners.map((l) => l.map(id)),
      benches: this.benchOwners.map(id),
      mirador: this.spotOwners.map(id),
    };
  }

  // --- spawning -------------------------------------------------------------------------------

  private occupy(w: Walker, c: Cell): void {
    w.tx = c.x;
    w.ty = c.y;
    w.inside = false;
    this.reserved.set(key(c.x, c.y), w);
  }

  private open(c: Cell): boolean {
    return !this.reserved.has(key(c.x, c.y)) && !this.host.blocked(c.x, c.y);
  }

  private randomFree(cands: readonly Cell[], extra: (c: Cell) => boolean = () => true): Cell | null {
    const list = cands.filter((c) => this.open(c) && this.town.standable(c.x, c.y) && extra(c));
    return this.pick(list) ?? null;
  }

  private streetCells(): Cell[] {
    const out: Cell[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (this.town.street(x, y)) out.push({ x, y });
    return out;
  }

  /** Puts everyone somewhere along their routine, so the map is lively from the first frame. */
  private spawn(): void {
    const byRole = (r: NpcRole) => this.walkers.filter((w) => w.role === r);
    const streets = this.streetCells();
    const anyZone = this.town.zones.flatMap((z) => z.cells);
    const fallback = (w: Walker) => {
      const c = this.randomFree(streets) ?? this.randomFree(anyZone);
      if (c) this.occupy(w, c);
      w.wait = this.range(START_STAGGER_S);
    };

    const spots = [...this.town.mirador.keys()].sort(() => this.rand() - 0.5);
    for (const w of byRole('stargazer')) {
      const i = spots.find((s) => !this.spotOwners[s] && this.open(this.town.mirador[s]));
      if (i === undefined) {
        fallback(w);
        continue;
      }
      this.spotOwners[i] = w;
      w.spot = i;
      this.occupy(w, this.town.mirador[i]);
      this.gaze(w, this.range([5, GAZE_S[1]]));
    }

    const queuers = byRole('queue');
    const order: [number, number][] = [];
    for (let c = 0; c < this.town.carts.length; c++) for (let s = 0; s < Math.min(QUEUE_SLOTS, this.town.carts[c].slots.length); s++) order.push([c, s]);
    queuers.forEach((w, i) => {
      // Most queue at the first cart, so it holds a proper line; the last one keeps the other cart busy.
      w.homeCart = i < queuers.length - 1 || this.town.carts.length < 2 ? 0 : 1;
      const at = i < queuers.length - 1 ? order[i] : undefined;
      const cell = at && this.town.carts[at[0]].slots[at[1]];
      if (!at || !cell || !this.open(cell) || (at[1] > 0 && !this.queueOwners[at[0]][at[1] - 1])) {
        fallback(w);
        w.phase = 'away';
        return;
      }
      this.queueOwners[at[0]][at[1]] = w;
      w.cart = at[0];
      w.slot = at[1];
      this.occupy(w, cell);
      this.inLine(w);
      if (at[1] === 0) this.order(w, this.range([0.5, ORDER_S[1]]));
      else w.wait = this.range([0, 2]);
    });

    const sitters = byRole('bench');
    const seats = [...this.town.benches.keys()].sort(() => this.rand() - 0.5);
    sitters.forEach((w, i) => {
      const b = i < sitters.length - 1 ? seats.find((s) => this.benchFree(s)) : undefined;
      if (b === undefined) {
        fallback(w);
        w.phase = 'break';
        return;
      }
      this.benchOwners[b] = w;
      w.bench = b;
      this.occupy(w, this.town.benches[b].front);
      this.sit(w, this.range([3, SIT_S[1]]));
    });

    for (const w of byRole('crosser')) {
      fallback(w);
      w.phase = 'end';
    }

    byRole('visitor').forEach((w, i) => {
      const d = i === 0 ? this.pick([...this.town.doors.keys()]) : undefined;
      if (d === undefined) {
        fallback(w);
        w.phase = 'out';
        return;
      }
      w.door = d;
      w.tx = this.town.doors[d].door.x;
      w.ty = this.town.doors[d].door.y;
      this.goInside(w, this.range([3, INSIDE_S[1]]));
    });

    for (const w of byRole('stroller')) {
      const z = this.town.zones[w.zone];
      const c = z && this.randomFree(z.cells);
      if (c) {
        this.occupy(w, c);
        w.wait = this.range(START_STAGGER_S);
        w.dir = this.faceZone(w, c);
      } else fallback(w);
      w.phase = 'stroll';
    }

    for (const w of this.walkers) {
      const anim = w.anims[this.animKey(w)];
      w.frame = Math.floor(this.rand() * anim.count);
      w.clock = this.rand() / anim.fps;
    }
  }

  // --- states -------------------------------------------------------------------------------

  private setTask(w: Walker, task: string): void {
    if (w.task !== task) w.since = 0;
    w.task = task;
  }

  private stand(w: Walker, seconds: number, task: string, dir?: NpcDir, pose: NpcPose | null = null): void {
    w.mode = 'idle';
    w.progress = 0;
    w.wait = seconds;
    w.pose = pose;
    if (dir) w.dir = dir;
    if (!pose) w.seat = null;
    this.setTask(w, task);
  }

  private gaze(w: Walker, seconds: number): void {
    w.phase = 'gazing';
    this.stand(w, seconds, 'gaze', this.pick(GAZE_DIRS), 'lookUp');
  }

  private inLine(w: Walker): void {
    w.phase = 'inLine';
    w.stepUp = false;
    this.stand(w, POLL_S, `queue ${w.slot + 1}`, this.town.carts[w.cart].faces[w.slot]);
  }

  private order(w: Walker, seconds: number): void {
    w.phase = 'ordering';
    this.stand(w, seconds, 'order', this.town.carts[w.cart].faces[0]);
  }

  private buy(w: Walker, seconds: number): void {
    w.phase = 'buying';
    this.stand(w, seconds, 'buy', this.town.carts[w.cart].faces[0]);
  }

  private sit(w: Walker, seconds: number): void {
    const b = this.town.benches[w.bench];
    w.phase = 'sitting';
    // On the bench facing the way it looks; without a sit strip, standing at its front facing out.
    const seated = !!w.anims[`${POSE_STRIP.sit}_${b.seatFace}`];
    this.stand(w, seconds, 'sit', seated ? b.seatFace : b.face, 'sit');
    w.seat = { ...b.seat };
  }

  private goInside(w: Walker, seconds: number): void {
    const k = key(w.tx, w.ty);
    if (this.reserved.get(k) === w) this.reserved.delete(k);
    w.inside = true;
    w.phase = 'inside';
    this.stand(w, seconds, `inside ${this.town.doors[w.door].name}`);
  }

  private faceZone(w: Walker, c: Cell): NpcDir {
    const z = this.town.zones[w.zone];
    if (!z) return w.dir;
    const mx = z.cells.reduce((s, p) => s + p.x, 0) / z.cells.length;
    const my = z.cells.reduce((s, p) => s + p.y, 0) / z.cells.length;
    return this.rand() < 0.6 ? dirBetween(c, { x: Math.round(mx), y: Math.round(my) }) : DIRS[Math.floor(this.rand() * 4)];
  }

  // --- errands ------------------------------------------------------------------------------

  /**
   * Cells to keep out of: the player's, and other NPCs'. Planning an errand skips walkers (they move
   * on); a jam only counts within JAM_RADIUS, so a way round one does not cross the whole map.
   */
  private avoidNow(w: Walker, mode: 'all' | 'still' | 'jam' = 'all') {
    return (x: number, y: number) => {
      const r = this.reserved.get(key(x, y));
      if (r && r !== w) {
        if (mode === 'all') return true;
        if (mode === 'still' && r.mode === 'idle' && !r.path.length) return true;
        if (mode === 'jam' && Math.abs(x - w.tx) + Math.abs(y - w.ty) <= JAM_RADIUS) return true;
      }
      return this.host.blocked(x, y);
    };
  }

  private goTo(w: Walker, to: Cell, task: string, arrive: () => void, opts: PathOpts = {}): boolean {
    const from = { x: w.tx, y: w.ty };
    const avoid = opts.streetOnly ? this.avoidNow(w, 'jam') : this.avoidNow(w, 'still');
    const player = (x: number, y: number) => this.host.blocked(x, y);
    // Crossers keep to the street even past people standing on it (they make way when met); off
    // the street only around the player.
    const path =
      findPath(this.town, from, to, { ...opts, avoid }) ??
      (opts.streetOnly ? findPath(this.town, from, to, { ...opts, avoid: player }) : null) ??
      (opts.streetOnly ? findPath(this.town, from, to, { ...opts, streetOnly: false, avoid }) : null) ??
      findPath(this.town, from, to, opts);
    if (!path) return false;
    w.path = path;
    w.goalOpts = opts;
    w.arrive = arrive;
    w.resume = null;
    w.blockedFor = 0;
    w.repathedAt = 0;
    w.pose = null;
    w.seat = null;
    this.setTask(w, task);
    if (!path.length) {
      w.arrive = null;
      arrive();
    }
    return true;
  }

  /** Somewhere off the street to stand `min`..`max` tiles (straight-line) from `c`. */
  private spotNear(c: Cell, min: number, max: number, extra: (p: Cell) => boolean = () => true): Cell | null {
    for (let i = 0; i < 60; i++) {
      const a = this.rand() * Math.PI * 2;
      const r = min + this.rand() * (max - min);
      const p = { x: Math.round(c.x + Math.cos(a) * r), y: Math.round(c.y + Math.sin(a) * r) };
      if (this.town.standable(p.x, p.y) && !this.town.street(p.x, p.y) && this.open(p) && extra(p)) return p;
    }
    return null;
  }

  /** Errand fell through (no route, or blocked too long): let go of any place held and rethink shortly. */
  private abandon(w: Walker): void {
    this.dropClaims(w);
    w.path = [];
    w.arrive = null;
    w.resume = null;
    this.releaseRole(w);
    w.phase = { stargazer: 'break', queue: 'away', bench: 'break', crosser: 'end', visitor: 'out', stroller: 'stroll' }[w.role];
    this.stand(w, this.range([1, 2]), 'rethink');
  }

  private releaseRole(w: Walker): void {
    if (w.cart >= 0 && w.slot >= 0 && this.queueOwners[w.cart][w.slot] === w) this.queueOwners[w.cart][w.slot] = null;
    w.cart = -1;
    w.slot = -1;
    if (w.bench >= 0 && this.benchOwners[w.bench] === w) this.benchOwners[w.bench] = null;
    w.bench = -1;
    if (w.spot >= 0 && this.spotOwners[w.spot] === w) this.spotOwners[w.spot] = null;
    w.spot = -1;
  }

  /** Called when the current pause is over and there is no route left to walk. */
  private think(w: Walker): void {
    switch (w.role) {
      case 'stargazer':
        return this.thinkStargazer(w);
      case 'queue':
        return this.thinkQueue(w);
      case 'bench':
        return this.thinkBench(w);
      case 'crosser':
        return this.thinkCrosser(w);
      case 'visitor':
        return this.thinkVisitor(w);
      default:
        return this.thinkStroller(w);
    }
  }

  private retryLater(w: Walker): void {
    this.stand(w, this.range([1, 2]), 'rethink');
  }

  private thinkStargazer(w: Walker): void {
    if (w.phase === 'gazing') {
      // Only one stretches their legs at a time, so the deck keeps two gazers.
      const others = this.walkers.filter((o) => o !== w && o.role === 'stargazer' && o.phase === 'gazing').length;
      if (others < 2) return this.gaze(w, this.range(GAZE_BREAK_S) * 2);
      this.releaseRole(w);
      const c = this.town.mirador[0];
      const p = c && this.spotNear(c, 2, 6);
      w.phase = 'break';
      if (p && this.goTo(w, p, 'stretch legs', () => this.stand(w, this.range(GAZE_BREAK_S), 'stretch legs', dirBetween(p, c)))) return;
    }
    const free = [...this.town.mirador.keys()].filter((i) => !this.spotOwners[i] && this.open(this.town.mirador[i]));
    const near = free.filter((i) => this.town.mirador[i].y === Math.min(...free.map((j) => this.town.mirador[j].y)));
    const i = this.pick(near.length && this.rand() < 0.7 ? near : free);
    if (i === undefined) return this.wander(w, 'break');
    this.spotOwners[i] = w;
    w.spot = i;
    w.phase = 'toSpot';
    if (!this.goTo(w, this.town.mirador[i], 'to the mirador', () => this.gaze(w, this.range(GAZE_S)))) {
      this.releaseRole(w);
      this.retryLater(w);
    }
  }

  private thinkQueue(w: Walker): void {
    if (w.phase === 'inLine') {
      const cart = this.town.carts[w.cart];
      if (w.slot === 0) return this.order(w, this.range(ORDER_S));
      const line = this.queueOwners[w.cart];
      if (this.placeTaken(w.cart, w.slot - 1)) {
        w.stepUp = false;
        w.wait = POLL_S;
        return;
      }
      if (!w.stepUp) {
        w.stepUp = true;
        w.wait = this.range(QUEUE_STEP_S);
        return;
      }
      line[w.slot - 1] = w;
      line[w.slot] = null;
      w.slot--;
      if (!this.goTo(w, cart.slots[w.slot], `queue ${w.slot + 1}`, () => this.inLine(w))) this.abandon(w);
      return;
    }
    if (w.phase === 'ordering') return this.buy(w, this.range(BUY_S));
    if (w.phase === 'buying') {
      const cart = this.town.carts[w.cart];
      this.releaseRole(w);
      w.phase = 'away';
      // A few steps off, so the walk back to the line stays short.
      const here = { x: w.tx, y: w.ty };
      const close = (c: Cell) => {
        if (cart.slots.some((q) => q.x === c.x && q.y === c.y)) return false;
        const route = findPath(this.town, here, c, { avoid: this.avoidNow(w, 'still') });
        return !!route && route.length >= 2 && route.length <= SNACK_WALK;
      };
      const p = this.spotNear(here, 2, SNACK_WALK, close) ?? this.spotNear(here, 3, 8);
      if (p && this.goTo(w, p, 'walk off with a snack', () => this.stand(w, this.range(QUEUE_AWAY_S), 'snack', dirBetween(p, cart.at)))) return;
      return this.retryLater(w);
    }
    // Back to the usual cart; the other one only when that line is full.
    const choices = this.town.carts
      .map((c, i) => ({ i, back: c.slots.reduce((b, _, s) => (this.placeTaken(i, s) ? s + 1 : b), 0) }))
      .filter(({ i, back }) => back < this.town.carts[i].slots.length);
    const pick = choices.find((c) => c.i === w.homeCart) ?? choices[0];
    if (!pick) return this.wander(w, 'away');
    this.queueOwners[pick.i][pick.back] = w;
    w.cart = pick.i;
    w.slot = pick.back;
    w.phase = 'join';
    if (!this.goTo(w, this.town.carts[pick.i].slots[pick.back], 'join the line', () => this.inLine(w))) {
      this.releaseRole(w);
      w.phase = 'away';
      this.retryLater(w);
    }
  }

  /** Nobody holds the bench, the player has not claimed it, and its front cell is clear. */
  private benchFree(i: number): boolean {
    const b = this.town.benches[i];
    return !this.benchOwners[i] && this.host.playerBench?.() !== b.id && this.open(b.front);
  }

  /**
   * The player wants bench `id`: false when an NPC already sits on it; one only walking there gives
   * it up. Call before the player claims it through `RoutineHost.playerBench`.
   */
  yieldBenchToPlayer(id: string): boolean {
    const i = this.town.benches.findIndex((b) => b.id === id);
    const owner = i >= 0 ? this.benchOwners[i] : null;
    if (!owner) return true;
    if (owner.phase === 'sitting') return false;
    this.abandon(owner);
    return true;
  }

  /** A place in a cart's line is taken by its owner, or by the player standing there. */
  private placeTaken(cart: number, slot: number): boolean {
    const c = this.town.carts[cart].slots[slot];
    return !!this.queueOwners[cart][slot] || this.host.blocked(c.x, c.y);
  }

  private thinkBench(w: Walker): void {
    if (w.phase === 'sitting') {
      const b = this.town.benches[w.bench];
      this.releaseRole(w);
      w.phase = 'break';
      w.lastBench = this.town.benches.indexOf(b);
      const p = this.spotNear(b.front, 5, 12);
      if (p && this.goTo(w, p, 'leave the bench', () => this.stand(w, this.range(BENCH_BREAK_S), 'look around'))) return;
      return this.retryLater(w);
    }
    const free = [...this.town.benches.keys()].filter((i) => i !== w.lastBench && this.benchFree(i));
    const i = this.pick(free);
    if (i === undefined) return this.wander(w, 'break');
    this.benchOwners[i] = w;
    w.bench = i;
    w.phase = 'toBench';
    if (!this.goTo(w, this.town.benches[i].front, 'to a bench', () => this.sit(w, this.range(SIT_S)))) {
      this.releaseRole(w);
      this.retryLater(w);
    }
  }

  private thinkCrosser(w: Walker): void {
    const here = { x: w.tx, y: w.ty };
    // An end someone is pausing on now is usually free again by the time this crosser gets there.
    const far = this.town.ends.filter((e) => Math.abs(e.x - here.x) + Math.abs(e.y - here.y) >= 12);
    const clear = far.filter((e) => this.open(e));
    const end = this.pick(clear.length ? clear : far);
    w.phase = 'cross';
    const pause = () => {
      w.phase = 'end';
      this.stand(w, this.range(END_PAUSE_S), 'street end');
    };
    if (end && this.goTo(w, end, 'cross the map', pause, { streetOnly: true, preferStreet: true })) return;
    this.retryLater(w);
  }

  private thinkVisitor(w: Walker): void {
    if (w.phase === 'inside') return this.emerge(w);
    const doors = [...this.town.doors.keys()].filter((d) => d !== w.door);
    const d = this.pick(doors);
    if (d === undefined) return this.wander(w, 'out');
    w.door = d;
    w.phase = 'toDoor';
    const door = this.town.doors[d];
    if (!this.goTo(w, door.door, `visit ${door.name}`, () => this.goInside(w, this.range(INSIDE_S)), { goalNoStop: true })) this.retryLater(w);
  }

  /** Steps out of the door only when the door and the cells up to the first ordinary cell are free. */
  private emerge(w: Walker): void {
    const door = this.town.doors[w.door].door;
    if (!this.open(door)) return void (w.wait = 1);
    const p = this.spotNear(door, 3, 10);
    const path = p && findPath(this.town, door, p, { avoid: this.avoidNow(w) });
    if (!p || !path?.length) return void (w.wait = 1);
    const run: Cell[] = [door];
    for (const c of path) {
      run.push(c);
      if (!this.town.noStop(c.x, c.y)) break;
    }
    if (!run.every((c) => this.open(c))) return void (w.wait = 1);
    this.occupy(w, door);
    w.phase = 'out';
    w.path = path;
    w.goalOpts = {};
    w.blockedFor = 0;
    w.repathedAt = 0;
    w.arrive = () => this.stand(w, this.range(VISIT_BREAK_S), 'look around');
    this.setTask(w, `leave ${this.town.doors[w.door].name}`);
    if (!this.tryStep(w)) {
      w.path = [];
      w.arrive = null;
      this.goInside(w, 1);
    }
  }

  private thinkStroller(w: Walker): void {
    if (this.rand() < 0.25 && this.town.zones.length > 1) w.zone = (w.zone + 1) % this.town.zones.length;
    const z = this.town.zones[w.zone];
    const here = { x: w.tx, y: w.ty };
    // Some zone cells sit in pockets behind benches and carts; skip those that need a long way round.
    const near = (p: Cell) => {
      const d = Math.abs(p.x - here.x) + Math.abs(p.y - here.y);
      if (d < 2) return false;
      const route = findPath(this.town, here, p, { avoid: this.avoidNow(w, 'still') });
      return !!route && route.length <= d + STROLL_DETOUR;
    };
    let c: Cell | null = null;
    for (let i = 0; i < 6 && z && !c; i++) {
      const p = this.randomFree(z.cells);
      if (p && near(p)) c = p;
    }
    // Muro clearance can leave a stroller in a pocket where every short stroll needs a long detour.
    if (!c && z) {
      const loose = (p: Cell) => {
        const d = Math.abs(p.x - here.x) + Math.abs(p.y - here.y);
        if (d < 2) return false;
        const route = findPath(this.town, here, p, { avoid: this.avoidNow(w, 'still') });
        return !!route && route.length <= d + STROLL_DETOUR * 2;
      };
      for (let i = 0; i < 8 && !c; i++) {
        const p = this.randomFree(z.cells);
        if (p && loose(p)) c = p;
      }
    }
    w.phase = 'stroll';
    if (c && this.goTo(w, c, `stroll by the ${z.name}`, () => this.stand(w, this.range(STROLL_PAUSE_S), `stroll by the ${z.name}`, this.faceZone(w, c)))) return;
    this.retryLater(w);
  }

  /** No place free for this errand right now: take a short walk and try again after. */
  private wander(w: Walker, phase: string): void {
    w.phase = phase;
    const p = this.spotNear({ x: w.tx, y: w.ty }, 2, 6);
    if (p && this.goTo(w, p, 'wander', () => this.stand(w, this.range([2, 6]), 'wander'))) return;
    this.retryLater(w);
  }

  // --- stepping -----------------------------------------------------------------------------

  private dropClaims(w: Walker): void {
    for (const c of w.claims) {
      const k = key(c.x, c.y);
      if (this.reserved.get(k) === w) this.reserved.delete(k);
    }
    w.claims = [];
  }

  /**
   * Reserves the next tile, or the whole run of pass-through cells up to the first ordinary one, and
   * starts walking. False (and nothing reserved) when any of them is taken.
   */
  private tryStep(w: Walker): boolean {
    const run: Cell[] = [];
    for (let i = 0; i < w.path.length; i++) {
      const c = w.path[i];
      run.push(c);
      const last = i === w.path.length - 1;
      if (!this.town.noStop(c.x, c.y) || last) break;
    }
    if (!run.length || !run.every((c) => this.open(c))) return false;
    for (const c of run) this.reserved.set(key(c.x, c.y), w);
    w.claims = run;
    const wasWalking = w.mode === 'walk';
    w.dir = dirBetween({ x: w.tx, y: w.ty }, run[0]);
    w.mode = 'walk';
    w.progress = 0;
    w.pose = null;
    w.seat = null;
    if (!wasWalking) {
      w.frame = Math.floor(this.rand() * w.anims[`walk_${w.dir}`].count);
      w.clock = 0;
    }
    return true;
  }

  private onBlocked(w: Walker, dt: number): void {
    w.blockedFor += dt;
    if (w.blockedFor >= GIVE_UP_S) return this.abandon(w);
    const next = w.path[0];
    const other = next && this.reserved.get(key(next.x, next.y));
    const faceToFace = !!other && other !== w && other.mode === 'idle' && other.path[0]?.x === w.tx && other.path[0]?.y === w.ty;
    // Both see the stand-off; the first id yields, the other only if that one found no room.
    if (faceToFace && w.blockedFor >= (w.id < other.id ? YIELD_AFTER_S : 3 * YIELD_AFTER_S) && this.stepAside(w)) return;
    if (w.blockedFor - w.repathedAt >= REPATH_AFTER_S) {
      w.repathedAt = w.blockedFor;
      const goal = w.path[w.path.length - 1];
      const alt = findPath(this.town, { x: w.tx, y: w.ty }, goal, { ...w.goalOpts, streetOnly: false, avoid: this.avoidNow(w, 'jam') });
      if (alt?.length) w.path = alt;
    }
    if (w.path[0]) w.dir = dirBetween({ x: w.tx, y: w.ty }, w.path[0]);
    w.wait = this.range(BLOCKED_RETRY_S);
    w.blockedFor += w.wait;
  }

  /** Moves onto a free side cell (never a pass-through one), waits a moment, then carries on with the errand. */
  private stepAside(w: Walker): boolean {
    const next = w.path[0];
    const goal = w.path[w.path.length - 1];
    const sides = STEPS.map((s) => ({ x: w.tx + s.x, y: w.ty + s.y })).filter(
      (c) => (c.x !== next.x || c.y !== next.y) && this.town.walk(c.x, c.y) && !this.town.noStop(c.x, c.y) && this.open(c),
    );
    const off = sides.filter((c) => !this.town.street(c.x, c.y));
    const side = this.pick(off.length ? off : sides);
    if (!side) return false;
    const { goalOpts, arrive, task } = w;
    w.path = [side];
    if (!this.tryStep(w)) {
      w.path = [next];
      return false;
    }
    w.goalOpts = {};
    w.blockedFor = 0;
    w.repathedAt = 0;
    w.arrive = () => {
      this.stand(w, this.range(STEP_ASIDE_S), 'make way');
      w.resume = () => {
        if (!arrive || !this.goTo(w, goal, task, arrive, goalOpts)) this.abandon(w);
      };
    };
    return true;
  }

  private arriveTile(w: Walker): void {
    const left = key(w.tx, w.ty);
    if (this.reserved.get(left) === w) this.reserved.delete(left);
    const c = w.claims.shift()!;
    w.path.shift();
    w.tx = c.x;
    w.ty = c.y;
    w.progress = 0;
    if (w.claims.length) {
      w.dir = dirBetween(c, w.claims[0]);
      return;
    }
    if (w.path.length) {
      if (this.tryStep(w)) {
        w.blockedFor = 0;
        return;
      }
      w.mode = 'idle';
      w.frame = 0;
      w.clock = 0;
      this.onBlocked(w, 0);
      return;
    }
    w.mode = 'idle';
    w.frame = 0;
    w.clock = 0;
    const done = w.arrive;
    w.arrive = null;
    done?.();
  }

  update(dt: number): void {
    for (const w of this.walkers) {
      w.since += dt;
      if (w.mode === 'idle') {
        w.wait -= dt;
        if (w.wait <= 0) {
          if (w.inside) this.think(w);
          else if (w.path.length) {
            if (this.tryStep(w)) w.blockedFor = 0;
            else this.onBlocked(w, 0);
          } else if (w.resume) {
            const resume = w.resume;
            w.resume = null;
            resume();
          } else this.think(w);
        }
      }
      if (w.inside) continue;
      let anim = w.anims[this.animKey(w)];
      w.clock += dt;
      while (w.clock >= 1 / anim.fps) {
        w.clock -= 1 / anim.fps;
        w.frame = (w.frame + 1) % anim.count;
        if (w.mode !== 'walk') continue;
        w.progress += 1;
        if (w.progress >= this.stepsPerTile(w)) {
          this.arriveTile(w);
          anim = w.anims[this.animKey(w)];
          if (w.mode !== 'walk') break;
        }
      }
    }
  }
}
