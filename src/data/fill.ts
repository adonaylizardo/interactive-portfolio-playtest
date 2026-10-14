import alphaJson from './sprite-alpha.json';
import relleno from './relleno.json';
import spritesJson from './sprites.json';
import type { MapCell, MapObject } from './world';

/**
 * Map fill (forge-paquete/relleno, placed by mapa/plan-relleno.json). The plan was drawn against an
 * older copy of the map, so every placement is checked against the live grid here and moved to the
 * nearest free spot (whole group by one offset) when it lands on a street, a footprint, a door or
 * the cell in front of one, the plaza, another prop, or over the Estudio sprite.
 */

type Cell = [number, number];
type Mask = { w: number; h: number; cell: number; bits: string };

type PropPlacement = {
  id: string;
  kind: 'prop';
  sprite: string;
  footprint: { x: number; y: number; w: number; h: number };
  front: Cell;
  cells: Cell[];
  flat?: boolean;
  solid?: Cell[];
  overlay?: string;
  group?: string;
  doorFront?: Cell;
};
type ActorPlacement = { id: string; kind: 'actor'; anim: string; cell: Cell; group?: string };
type NpcPlacement = { id: string; kind: 'npc'; npc: string; anim: string; cell: Cell; group?: string };
type LampPlacement = { id: string; kind: 'lamp'; cell: Cell };
type PathPlacement = { id: string; kind: 'path'; cells: Cell[]; group?: string };
type Placement = PropPlacement | ActorPlacement | LampPlacement | PathPlacement;

export type FillAnim = {
  f1: string;
  f2: string;
  cell: { w: number; h: number };
  anchor?: { x: number; y: number };
  vfs?: { x: number; y: number };
  frames: number[];
  fps: number;
};

export type FillActor = {
  id: string;
  /** `anim/...` key in relleno.json, or `npc:<id>/<anim>` for a still pedestrian from npcs.json. */
  sprite: string;
  x: number;
  y: number;
};

export type FillOverlay = { id: string; anim: string; front: { x: number; y: number } };

export type FillReportEntry = {
  id: string;
  planned: Cell;
  placed: Cell | null;
  /** Why the planned spot was refused (empty when it was used as is). */
  conflicts: string[];
  note?: string;
};

export type FillResult = {
  objects: MapObject[];
  actors: FillActor[];
  overlays: FillOverlay[];
  /** Cells drawn as a park path (perrera gate). */
  pathCells: Cell[];
  /** Every cell the fill made unwalkable. */
  solidCells: Cell[];
  /** Ground-level fill cells that stay walkable (court, deck, green, mat, path). */
  flatCells: Cell[];
  report: FillReportEntry[];
};

export type FillContext = {
  cells: MapCell[][];
  objects: MapObject[];
  /** Cells that must stay open: door accesses, the cell in front of each door, spawn, monument stops. */
  keepClear: Set<string>;
  /** Cells next to the climbing wall that stay open for Noah's route. */
  nearMuro: (x: number, y: number) => boolean;
  lampVariant: (cells: MapCell[][], x: number, y: number) => 'izq' | 'der';
  /** Spawn cell: every walkable cell next to a fill prop must stay reachable from here. */
  start: Cell;
};

const data = relleno as unknown as {
  assets: Record<string, { w: number; h: number; vfs: { x: number; y: number }; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
  anims: Record<string, FillAnim>;
  masks: Record<string, Mask>;
  placements: (Placement | NpcPlacement)[];
  replaced: Cell[];
};

/** The plan's still pedestrians (mirador line, cachapas queue) are live NPC routines now (src/game/npcRoutines.ts). */
const placements = data.placements.filter((p): p is Placement => p.kind !== 'npc');

export const FILL_ASSETS = data.assets;
export const FILL_ANIMS = data.anims;
export const FILL_REPLACED_FILLER: readonly Cell[] = data.replaced;

const k = (x: number, y: number) => `${x},${y}`;
const centre = (x: number, y: number) => ({ x: (x - y) * 64, y: (x + y) * 32 });
const foot = (x: number, y: number) => ({ x: (x - y) * 64, y: (x + y) * 32 + 32 });

type Bits = { w: number; h: number; cell: number; bits: Uint8Array };
function decode(m: Mask): Bits {
  const bin = atob(m.bits);
  const bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  return { w: m.w, h: m.h, cell: m.cell, bits };
}
const on = (m: Bits, cx: number, cy: number) =>
  cx >= 0 && cy >= 0 && cx < m.w && cy < m.h && (m.bits[(cy * m.w + cx) >> 3] & (1 << ((cy * m.w + cx) & 7))) !== 0;

/** World-space opaque cells of the Estudio (union of every state and zoom frame). */
function estudioMask(objects: MapObject[]): ((wx: number, wy: number) => boolean) | null {
  const est = objects.find((o) => o.type === 'building' && o.name === 'estudio');
  const raw = (alphaJson as Record<string, Mask>)['ext/estudio'];
  const asset = (spritesJson.assets as Record<string, { vfs: { x: number; y: number } }>)['ext/estudio/default/cerca'];
  if (!est || !raw || !asset) return null;
  const m = decode(raw);
  const s = foot((est.footprintX ?? est.x) + (est.w ?? 1) - 1, (est.footprintY ?? est.y) + (est.h ?? 1) - 1);
  const tl = { x: s.x - asset.vfs.x, y: s.y - asset.vfs.y };
  return (wx, wy) => on(m, Math.floor((wx - tl.x) / m.cell), Math.floor((wy - tl.y) / m.cell));
}

/** Opaque world cells of one fill sprite placed with its frame top-left at `tl`. */
function maskHits(m: Bits, tl: { x: number; y: number }, hit: (wx: number, wy: number) => boolean): boolean {
  for (let cy = 0; cy < m.h; cy++) {
    for (let cx = 0; cx < m.w; cx++) {
      if (!on(m, cx, cy)) continue;
      const x0 = tl.x + cx * m.cell;
      const y0 = tl.y + cy * m.cell;
      const e = m.cell - 1;
      if (hit(x0, y0) || hit(x0 + e, y0) || hit(x0, y0 + e) || hit(x0 + e, y0 + e)) return true;
    }
  }
  return false;
}

function rectHits(r: { x0: number; y0: number; x1: number; y1: number }, hit: (wx: number, wy: number) => boolean): boolean {
  for (let y = r.y0; y < r.y1; y += 4) for (let x = r.x0; x < r.x1; x += 4) if (hit(x, y)) return true;
  return false;
}

const masks = new Map<string, Bits>();
const maskOf = (key: string) => {
  let m = masks.get(key);
  if (!m) masks.set(key, (m = decode(data.masks[key])));
  return m;
};

/** One placement moved by (dx, dy): the cells it blocks, the flat cells it covers, and its sprite's world hit test. */
type Member = {
  p: Placement;
  solid: (dx: number, dy: number) => Cell[];
  flat: (dx: number, dy: number) => Cell[];
  overEstudio: (dx: number, dy: number, est: (wx: number, wy: number) => boolean) => boolean;
  anchor: Cell;
};

function member(p: Placement): Member {
  const shift = (cs: Cell[], dx: number, dy: number): Cell[] => cs.map(([x, y]) => [x + dx, y + dy]);
  switch (p.kind) {
    case 'prop': {
      const solid = p.flat ? (p.solid ?? []) : p.cells;
      const flat = p.flat ? p.cells : [];
      const a = data.assets[`${p.sprite}/cerca`];
      return {
        p,
        anchor: p.front,
        solid: (dx, dy) => shift(solid, dx, dy),
        flat: (dx, dy) => shift(flat, dx, dy),
        overEstudio: (dx, dy, est) => {
          const s = foot(p.front[0] + dx, p.front[1] + dy);
          return maskHits(maskOf(p.sprite), { x: s.x - a.vfs.x, y: s.y - a.vfs.y }, est);
        },
      };
    }
    case 'actor': {
      const a = data.anims[p.anim];
      return {
        p,
        anchor: p.cell,
        solid: (dx, dy) => shift([p.cell], dx, dy),
        flat: () => [],
        overEstudio: (dx, dy, est) => {
          const c = centre(p.cell[0] + dx, p.cell[1] + dy);
          return maskHits(maskOf(p.anim), { x: c.x - 2 * a.anchor!.x, y: c.y - 2 * a.anchor!.y }, est);
        },
      };
    }
    case 'lamp': {
      const a = (spritesJson.assets as Record<string, { vfs: { x: number; y: number }; bbox: { x0: number; y0: number; x1: number; y1: number } }>)['prop/farol/izq/cerca'];
      return {
        p,
        anchor: p.cell,
        solid: (dx, dy) => shift([p.cell], dx, dy),
        flat: () => [],
        overEstudio: (dx, dy, est) => {
          const s = foot(p.cell[0] + dx, p.cell[1] + dy);
          const tl = { x: s.x - a.vfs.x, y: s.y - a.vfs.y };
          return rectHits({ x0: tl.x + a.bbox.x0, y0: tl.y + a.bbox.y0, x1: tl.x + a.bbox.x1, y1: tl.y + a.bbox.y1 }, est);
        },
      };
    }
    case 'path':
      return {
        p,
        anchor: p.cells[0],
        solid: () => [],
        flat: (dx, dy) => shift(p.cells, dx, dy),
        overEstudio: () => false,
      };
  }
}

/** Offsets by distance: Manhattan, then Chebyshev, then toward the viewer (+y, +x) first. */
const OFFSETS: Cell[] = (() => {
  const out: Cell[] = [];
  const R = 4;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) out.push([dx, dy]);
  const d = ([x, y]: Cell) => Math.abs(x) + Math.abs(y);
  const c = ([x, y]: Cell) => Math.max(Math.abs(x), Math.abs(y));
  return out.sort((a, b) => d(a) - d(b) || c(a) - c(b) || b[1] - a[1] || b[0] - a[0]);
})();

export function placeFill(ctx: FillContext): FillResult {
  const { cells } = ctx;
  const est = estudioMask(ctx.objects);
  const taken = new Set<string>();
  const flatTaken = new Set<string>();
  const result: FillResult = { objects: [], actors: [], overlays: [], pathCells: [], solidCells: [], flatCells: [], report: [] };
  const lampAt = new Set(ctx.objects.filter((o) => o.name === 'lamp').map((o) => k(o.x, o.y)));

  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const g = ('group' in p && p.group) || p.id;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(p);
  }

  const groundConflict = (x: number, y: number): string | null => {
    const c = cells[y]?.[x];
    if (!c) return 'off the map';
    if (c.groundId.includes('borde')) return 'map edge';
    if (c.groundId.includes('path/street')) return 'street';
    if (c.groundId.includes('building/footprint')) return 'building footprint';
    if (ctx.keepClear.has(k(x, y))) return 'door / door front / stop cell';
    if (taken.has(k(x, y))) return 'another fill prop';
    if (!c.walkable) return 'blocked cell (footprint, wall or prop)';
    return null;
  };

  const STEPS: Cell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  /** Walkable cells beside `solids` that the spawn can no longer reach once they block. */
  const sealed = (solids: Cell[]): Cell[] => {
    const prev = solids.map(([x, y]) => cells[y][x].walkable);
    for (const [x, y] of solids) cells[y][x].walkable = false;
    const seen = new Set<string>([k(...ctx.start)]);
    const queue: Cell[] = [ctx.start];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of STEPS) {
        const c = cells[y + dy]?.[x + dx];
        if (!c?.walkable || seen.has(k(x + dx, y + dy))) continue;
        seen.add(k(x + dx, y + dy));
        queue.push([x + dx, y + dy]);
      }
    }
    solids.forEach(([x, y], i) => (cells[y][x].walkable = prev[i]));
    const out: Cell[] = [];
    for (const [x, y] of solids) {
      for (const [dx, dy] of STEPS) {
        const c = cells[y + dy]?.[x + dx];
        if (c?.walkable && !solids.some(([sx, sy]) => sx === x + dx && sy === y + dy) && !seen.has(k(x + dx, y + dy))) {
          out.push([x + dx, y + dy]);
        }
      }
    }
    return out;
  };

  for (const [gid, list] of groups) {
    const ms = list.map(member);
    const tryAt = (dx: number, dy: number): string[] => {
      const why = new Set<string>();
      const solids = new Set<string>();
      const flats = new Set<string>();
      for (const m of ms) {
        for (const [x, y] of m.flat(dx, dy)) {
          const g = groundConflict(x, y);
          if (g) why.add(`${g} at (${x},${y})`);
          else if (flatTaken.has(k(x, y))) why.add(`another fill area at (${x},${y})`);
          flats.add(k(x, y));
        }
      }
      for (const m of ms) {
        for (const [x, y] of m.solid(dx, dy)) {
          const g = groundConflict(x, y);
          if (g) why.add(`${g} at (${x},${y})`);
          else if (flatTaken.has(k(x, y))) why.add(`another fill area at (${x},${y})`);
          else if (cells[y][x].groundId.includes('park')) why.add(`plaza at (${x},${y})`);
          else if (ctx.nearMuro(x, y)) why.add(`climbing-wall clearance at (${x},${y})`);
          if (solids.has(k(x, y))) why.add(`two props on (${x},${y})`);
          solids.add(k(x, y));
        }
        if (est && m.overEstudio(dx, dy, est)) why.add(`${m.p.id} sprite over the Estudio`);
        if (m.p.kind === 'prop' && m.p.doorFront) {
          const [fx, fy] = [m.p.doorFront[0] + dx, m.p.doorFront[1] + dy];
          const c = cells[fy]?.[fx];
          if (!c || !c.walkable || taken.has(k(fx, fy))) why.add(`${m.p.id} door front (${fx},${fy}) not open`);
        }
      }
      if (!why.size) {
        const cut = sealed([...solids].map((s) => s.split(',').map(Number) as Cell));
        if (cut.length) why.add(`seals off ${cut.map(([x, y]) => `(${x},${y})`).join(' ')}`);
      }
      return [...why];
    };

    if (list.length === 1 && list[0].kind === 'lamp' && lampAt.has(k(...list[0].cell))) {
      result.report.push({ id: gid, planned: list[0].cell, placed: list[0].cell, conflicts: [], note: 'a lamp already stands here; kept the existing one' });
      continue;
    }

    const planned = tryAt(0, 0);
    let offset: Cell | null = planned.length ? null : [0, 0];
    if (!offset) {
      for (const o of OFFSETS) {
        if ((o[0] || o[1]) && !tryAt(o[0], o[1]).length) {
          offset = o;
          break;
        }
      }
    }
    for (const m of ms) {
      const at: Cell | null = offset ? [m.anchor[0] + offset[0], m.anchor[1] + offset[1]] : null;
      result.report.push({ id: m.p.id, planned: m.anchor, placed: at, conflicts: planned });
    }
    if (!offset) continue;
    const [dx, dy] = offset;
    for (const m of ms) {
      for (const [x, y] of m.flat(dx, dy)) {
        flatTaken.add(k(x, y));
        result.flatCells.push([x, y]);
      }
      for (const [x, y] of m.solid(dx, dy)) {
        taken.add(k(x, y));
        cells[y][x].walkable = false;
        result.solidCells.push([x, y]);
      }
      emit(m.p, dx, dy);
    }
  }

  function emit(p: Placement, dx: number, dy: number): void {
    switch (p.kind) {
      case 'prop': {
        const f = p.footprint;
        const obj: MapObject = {
          id: `fill/${p.id}`,
          type: 'prop',
          name: 'fill',
          state: 'default',
          x: p.front[0] + dx,
          y: p.front[1] + dy,
          footprintX: f.x + dx,
          footprintY: f.y + dy,
          w: f.w,
          h: f.h,
          walkable: !!p.flat,
          sprite: p.sprite,
          flat: !!p.flat,
        };
        result.objects.push(obj);
        if (p.overlay) result.overlays.push({ id: `fill/${p.id}`, anim: p.overlay, front: { x: obj.x, y: obj.y } });
        break;
      }
      case 'actor':
        result.actors.push({ id: p.id, sprite: p.anim, x: p.cell[0] + dx, y: p.cell[1] + dy });
        break;
      case 'lamp': {
        const [x, y] = [p.cell[0] + dx, p.cell[1] + dy];
        result.objects.push({
          id: `prop/lamp/${x}-${y}`,
          type: 'prop',
          name: 'lamp',
          state: 'default',
          x,
          y,
          variant: ctx.lampVariant(cells, x, y),
          w: 1,
          h: 1,
          walkable: false,
        });
        break;
      }
      case 'path':
        for (const [x, y] of p.cells) {
          const c = cells[y + dy][x + dx];
          c.groundId = 'tile/ground/park';
          result.pathCells.push([x + dx, y + dy]);
        }
        break;
    }
  }

  return result;
}
