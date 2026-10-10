import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld } from '../iso/math';
import { C } from './colors';
import { drawCharacter } from './draw';

export const INTERIOR_BUILDING_IDS = [
  'estudio',
  'volaris',
  'bain',
  'mentoria',
  'finoa',
  'pg',
  'sambil',
  'catedral',
  'flor',
] as const;

export type InteriorBuildingId = (typeof INTERIOR_BUILDING_IDS)[number];

export type InteriorDef = {
  id: InteriorBuildingId;
  w: number;
  h: number;
  /** Full wall height for back / stage (px). */
  backWallH: number;
  /** Cut wall height on open sides (3.3 m ≈ 66px). */
  cutWallH: number;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  board: { x: number; y: number; w: number; h: number };
};

const CUT_WALL_H = 66;

function def(
  id: InteriorBuildingId,
  w: number,
  h: number,
  opts?: { backWallH?: number; spawn?: { x: number; y: number }; exit?: { x: number; y: number } },
): InteriorDef {
  const spawn = opts?.spawn ?? { x: Math.floor(w / 2), y: h - 2 };
  const exit = opts?.exit ?? { x: Math.floor(w / 2), y: h - 1 };
  const boardW = Math.min(4, w - 2);
  const boardH = Math.min(3, h - 3);
  return {
    id,
    w,
    h,
    backWallH: opts?.backWallH ?? CUT_WALL_H,
    cutWallH: CUT_WALL_H,
    spawn,
    exit,
    board: {
      x: Math.floor((w - boardW) / 2),
      y: Math.floor((h - boardH) / 2) - 1,
      w: boardW,
      h: boardH,
    },
  };
}

const LAYOUTS: Record<InteriorBuildingId, InteriorDef> = {
  estudio: def('estudio', 6, 6),
  volaris: def('volaris', 6, 6),
  bain: def('bain', 6, 6),
  mentoria: def('mentoria', 6, 6),
  finoa: def('finoa', 6, 6),
  pg: def('pg', 6, 6),
  sambil: def('sambil', 8, 8),
  catedral: def('catedral', 8, 8),
  flor: def('flor', 7, 7, { backWallH: 140 }),
};

export function getInteriorDef(id: string): InteriorDef | null {
  if (!(INTERIOR_BUILDING_IDS as readonly string[]).includes(id)) return null;
  return LAYOUTS[id as InteriorBuildingId];
}

export type InteriorCell = { walkable: boolean };

export function buildInteriorGrid(def: InteriorDef): InteriorCell[][] {
  const cells: InteriorCell[][] = [];
  for (let y = 0; y < def.h; y++) {
    cells[y] = [];
    for (let x = 0; x < def.w; x++) {
      const edge = x === 0 || y === 0 || x === def.w - 1 || y === def.h - 1;
      const isExit = x === def.exit.x && y === def.exit.y;
      cells[y][x] = { walkable: !edge || isExit };
    }
  }
  cells[def.spawn.y][def.spawn.x].walkable = true;
  cells[def.exit.y][def.exit.x].walkable = true;
  return cells;
}

type Pt = { x: number; y: number };

function localFoot(tx: number, ty: number): Pt {
  const f = tileFootWorld(tx, ty);
  return { x: f.x, y: f.y };
}

function northTop(tx: number, ty: number): Pt {
  const f = localFoot(tx, ty);
  return { x: f.x, y: f.y - TILE_H };
}

function raise(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

function poly(g: Graphics, pts: Pt[], fill: number | { color: number; alpha?: number }): void {
  if (!pts.length) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  if (typeof fill === 'number') g.fill(fill);
  else g.fill(fill);
}

/** Gray dollhouse cutaway — floor tiles + partial walls + content board slab. */
export function drawInteriorRoom(g: Graphics, def: InteriorDef): void {
  const floor = 0xc8c8c8;
  const floorDark = 0xb8b8b8;
  const wallL = 0x9a9a9a;
  const wallR = 0x8e8e8e;
  const wallTop = 0xa4a4a4;
  const board = 0xd4d4d4;

  for (let ty = 0; ty < def.h; ty++) {
    for (let tx = 0; tx < def.w; tx++) {
      const pos = localFoot(tx, ty);
      const fill = (tx + ty) % 2 === 0 ? floor : floorDark;
      g.moveTo(pos.x, pos.y);
      g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
      g.lineTo(pos.x, pos.y - TILE_H);
      g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
      g.closePath();
      g.fill(fill);
    }
  }

  const northH = def.backWallH;
  for (let tx = 0; tx < def.w; tx++) {
    const nw = northTop(tx, 0);
    const ne = northTop(tx + 1, 0);
    const h = def.id === 'flor' ? northH : def.cutWallH;
    poly(g, [nw, ne, raise(ne, h), raise(nw, h)], wallTop);
  }
  for (let ty = 0; ty < def.h; ty++) {
    const sw = localFoot(0, ty);
    const nw = northTop(0, ty);
    poly(g, [sw, nw, raise(nw, def.cutWallH), raise(sw, def.cutWallH)], wallL);
    const se = localFoot(def.w - 1, ty);
    const ne = northTop(def.w - 1, ty);
    poly(g, [se, ne, raise(ne, def.cutWallH), raise(se, def.cutWallH)], wallR);
  }
  for (let tx = 0; tx < def.w - 1; tx++) {
    const ty = def.h - 1;
    if (tx === def.exit.x && ty === def.exit.y) continue;
    const sw = localFoot(tx, ty);
    const se = localFoot(tx + 1, ty);
    poly(g, [sw, se, raise(se, def.cutWallH), raise(sw, def.cutWallH)], wallR);
  }

  const bx0 = def.board.x;
  const by0 = def.board.y;
  const bx1 = bx0 + def.board.w - 1;
  const by1 = by0 + def.board.h - 1;
  const sw = localFoot(bx0, by1 + 1);
  const se = localFoot(bx1 + 1, by1 + 1);
  const nw = northTop(bx0, by0);
  const ne = northTop(bx1 + 1, by0);
  const slabH = 48;
  poly(g, [sw, se, raise(se, slabH), raise(sw, slabH)], board);
  poly(g, [raise(sw, slabH), raise(se, slabH), raise(ne, slabH + 8), raise(nw, slabH + 8)], 0xe0e0e0);

  if (def.exit) {
    const ex = localFoot(def.exit.x, def.exit.y);
    g.circle(ex.x, ex.y - TILE_H / 2 - 4, 6);
    g.fill({ color: C.door, alpha: 0.85 });
  }
}

export function findPathInterior(
  grid: InteriorCell[][],
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] | null {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (gy < 0 || gx < 0 || gy >= h || gx >= w) return null;
  if (!grid[gy][gx].walkable) return null;
  if (sx === gx && sy === gy) return [];

  type Node = { x: number; y: number; g: number; f: number; parent?: Node };
  const open: Node[] = [];
  const closed = new Set<string>();
  const heur = (ax: number, ay: number, bx: number, by: number) => Math.abs(ax - bx) + Math.abs(ay - by);
  open.push({ x: sx, y: sy, g: 0, f: heur(sx, sy, gx, gy) });
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const ck = `${cur.x},${cur.y}`;
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === gx && cur.y === gy) {
      const path: { x: number; y: number }[] = [];
      let n: Node | undefined = cur;
      while (n?.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!grid[ny][nx].walkable) continue;
      const nk = `${nx},${ny}`;
      if (closed.has(nk)) continue;
      const g = cur.g + 1;
      const f = g + heur(nx, ny, gx, gy);
      const ex = open.find((n) => n.x === nx && n.y === ny);
      if (ex && ex.g <= g) continue;
      if (ex) {
        ex.g = g;
        ex.f = f;
        ex.parent = cur;
      } else {
        open.push({ x: nx, y: ny, g, f, parent: cur });
      }
    }
  }
  return null;
}

export function syncInteriorCharacter(g: Graphics, tx: number, ty: number, state: 'idle' | 'walk' | 'sprint'): void {
  g.clear();
  drawCharacter(g, state);
  const pos = tileFootWorld(tx, ty);
  g.position.set(pos.x, pos.y);
}
