import { Graphics } from 'pixi.js';
import roomData from '../data/interior-rooms.json';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld } from '../iso/math';
import { drawCharacter } from './draw';
import { cachedSpriteProbes, interiorSpriteKey, spriteAsset, spriteMeta } from './sprites';

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
  /** Tall back walls (~2× character). */
  backWallH: number;
  /** Low cut plinth on open (+x / +y) sides. */
  plinthH: number;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
  /** Room side the exit door opens through; the door gap past the mat is part of the exit target. */
  exitFace: '+x' | '+y';
  /** Room drawn from a baked Figma sprite (furniture included). */
  sprite?: boolean;
  /** Sprite rooms: walk grid rows y = 0.., '#' blocked, '.' 'E' 'S' free (manifest `mascara_caminable`). */
  mask?: readonly string[];
  /** Sprite drawn at this multiple of its @1x frame (building cutaways: one map tile = 2×2 room cells). */
  scale: number;
  /** Height of the walkable floor above the frame's ground plane, in world px. */
  lift: number;
  /** The art has no exit mat of its own: draw one on the exit cell. */
  matOverlay?: boolean;
};

/** ~2× character silhouette height in px. */
export const INTERIOR_BACK_WALL_H = 88;
export const INTERIOR_PLINTH_H = 12;

function def(
  id: InteriorBuildingId,
  w: number,
  h: number,
  opts?: Partial<Omit<InteriorDef, 'id' | 'w' | 'h'>>,
): InteriorDef {
  const exit = opts?.exit ?? { x: Math.floor(w / 2), y: h - 1 };
  const spawn = opts?.spawn ?? { x: exit.x, y: Math.max(1, exit.y - 2) };
  return {
    id,
    w,
    h,
    backWallH: opts?.backWallH ?? INTERIOR_BACK_WALL_H,
    plinthH: opts?.plinthH ?? INTERIOR_PLINTH_H,
    spawn,
    exit,
    exitFace: opts?.exitFace ?? '+y',
    sprite: opts?.sprite,
    mask: opts?.mask,
    scale: opts?.scale ?? 1,
    lift: opts?.lift ?? 0,
    matOverlay: opts?.matOverlay,
  };
}

function maskCells(mask: readonly string[]): { spawn: { x: number; y: number }; exit: { x: number; y: number } } {
  let spawn = { x: 3, y: 4 };
  let exit = { x: 3, y: 5 };
  mask.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === 'E') spawn = { x, y };
      if (c === 'S') exit = { x, y };
    });
  });
  return { spawn, exit };
}

function spriteRoom(id: InteriorBuildingId): InteriorDef {
  const mask = spriteMeta(`int/${id}`)?.mascara_caminable?.filas_y0_a_y5 as string[] | undefined;
  if (!mask) throw new Error(`missing walk mask for ${id}`);
  return def(id, mask[0].length, mask.length, { ...maskCells(mask), sprite: true, mask });
}

type ArtRoom = { scale: number; lift: number; exitFace: '+x' | '+y'; mask: string[] };

/**
 * Landmark interiors: the pack's `estado=interior` cutaway of the building, scaled up so each map
 * tile becomes 2×2 room cells. Walk masks are hand-authored against the art (src/data/interior-rooms.json).
 */
function artRoom(id: 'flor' | 'catedral' | 'sambil'): InteriorDef {
  const r = (roomData as Record<string, ArtRoom>)[id];
  return def(id, r.mask[0].length, r.mask.length, {
    ...maskCells(r.mask),
    sprite: true,
    mask: r.mask,
    scale: r.scale,
    lift: r.lift,
    exitFace: r.exitFace,
    matOverlay: true,
  });
}

const LAYOUTS: Record<InteriorBuildingId, InteriorDef> = {
  estudio: def('estudio', 6, 6),
  volaris: spriteRoom('volaris'),
  bain: spriteRoom('bain'),
  mentoria: spriteRoom('mentoria'),
  finoa: spriteRoom('finoa'),
  pg: spriteRoom('pg'),
  sambil: artRoom('sambil'),
  catedral: artRoom('catedral'),
  flor: artRoom('flor'),
};

export function getInteriorDef(id: string): InteriorDef | null {
  if (!(INTERIOR_BUILDING_IDS as readonly string[]).includes(id)) return null;
  return LAYOUTS[id as InteriorBuildingId];
}

export type InteriorCell = { walkable: boolean };

export function buildInteriorGrid(def: InteriorDef): InteriorCell[][] {
  if (def.mask) {
    const rows = def.mask.map((row) => [...row].map((c) => ({ walkable: c !== '#' })));
    rows[def.spawn.y][def.spawn.x].walkable = true;
    rows[def.exit.y][def.exit.x].walkable = true;
    return rows;
  }
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
  // Estudio desk.
  cells[1][1].walkable = false;
  return cells;
}

type Pt = { x: number; y: number };
type Palette = { top: number; left: number; right: number };

/**
 * World point of a grid-lattice coordinate (gx, gy) raised by z px.
 * Lattice (tx, ty) is the north vertex of tile (tx, ty); tile centers sit at (tx + 0.5, ty + 0.5),
 * matching `tileToWorld` / `tileFootWorld`.
 */
function P(gx: number, gy: number, z = 0): Pt {
  return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy - 1) * (TILE_H / 2) - z };
}

/**
 * World top-left of a sprite room: its floor front vertex sits on the foot of the last cell, and a
 * raised floor (`lift`) is lowered onto the room's ground plane.
 */
export function interiorSpriteTopLeft(def: InteriorDef): Pt {
  const a = spriteAsset(interiorSpriteKey(def.id, false));
  const foot = tileFootWorld(def.w - 1, def.h - 1);
  return { x: foot.x - a.vfs.x * def.scale, y: foot.y - a.vfs.y * def.scale + def.lift };
}

function poly(g: Graphics, pts: Pt[], fill: number, alpha = 1): void {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill({ color: fill, alpha });
}

function line(g: Graphics, a: Pt, b: Pt, color: number, width: number): void {
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width, color });
}

function tileDiamond(g: Graphics, tx: number, ty: number, fill: number, alpha = 1): void {
  poly(g, [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)], fill, alpha);
}

/**
 * Axis-aligned box on the floor lattice. Only the camera-facing faces are drawn:
 * +y ("left", faces down-left), +x ("right", faces down-right) and the top.
 */
function box(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  pal: Palette,
): void {
  poly(g, [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], pal.left);
  poly(g, [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)], pal.right);
  poly(g, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], pal.top);
}

/** Estudio noche: near-black room, dark tiles, amber is the only light. */
const BG = 0x0b0c0e;
const FLOOR_A = 0x1a1c20;
const FLOOR_B = 0x1d1f24;
const FLOOR_SEAM = 0x2a2d33;
const NORTH_WALL = 0x202226;
const WEST_WALL = 0x26292f;
const WALL_SEAM = 0x34373e;
const WALL_CAP = 0x3a3d44;
const WALL_END = 0x141518;
const AMBER = 0xffb547;
const WALL_THICK = 0.18;
const PLINTH_DEPTH = 0.14;
/** Art rooms: world px kept in view above the floor's back vertex. */
const ART_ROOM_HEADROOM = 120;
/** How far past the floor edge the door gap counts as the exit target (lattice tiles). */
const EXIT_GAP_DEPTH = 0.6;
const PLINTH: Palette = { top: 0x2a2d33, left: 0x1f2125, right: 0x17191c };
const POST: Palette = { top: 0x34373e, left: 0x24272d, right: 0x1a1c20 };
const MAT = 0x24272d;
const DESK: Palette = { top: 0x34373e, left: 0x24272d, right: 0x1a1c20 };
const SHELF: Palette = { top: 0x2e3137, left: 0x202226, right: 0x17191c };
const CHAIR: Palette = { top: 0x2a2d33, left: 0x1f2125, right: 0x17191c };
const MONITOR: Palette = { top: 0x24272d, left: AMBER, right: 0x1a1c20 };

function paintInteriorFloor(g: Graphics, def: InteriorDef): void {
  if (def.sprite) return;
  for (let ty = 0; ty < def.h; ty++) {
    for (let tx = 0; tx < def.w; tx++) {
      tileDiamond(g, tx, ty, (tx + ty) % 2 === 0 ? FLOOR_A : FLOOR_B);
    }
  }
  for (let i = 1; i < def.w; i++) line(g, P(i, 0), P(i, def.h), FLOOR_SEAM, 1);
  for (let i = 1; i < def.h; i++) line(g, P(0, i), P(def.w, i), FLOOR_SEAM, 1);
}

/** Window on the north wall (y = 0 plane), x range in tiles: amber panes, dark mullions. */
function northWindow(g: Graphics, x0: number, x1: number, z0: number, z1: number): void {
  const e = 0.02;
  poly(g, [P(x0, e, z0), P(x1, e, z0), P(x1, e, z1), P(x0, e, z1)], AMBER);
  const xm = (x0 + x1) / 2;
  const zm = (z0 + z1) / 2;
  line(g, P(xm, e, z0), P(xm, e, z1), BG, 3);
  line(g, P(x0, e, zm), P(x1, e, zm), BG, 3);
}

/** Window on the west wall (x = 0 plane), y range in tiles. */
function westWindow(g: Graphics, y0: number, y1: number, z0: number, z1: number): void {
  const e = 0.02;
  poly(g, [P(e, y0, z0), P(e, y1, z0), P(e, y1, z1), P(e, y0, z1)], AMBER);
  const ym = (y0 + y1) / 2;
  const zm = (z0 + z1) / 2;
  line(g, P(e, ym, z0), P(e, ym, z1), BG, 3);
  line(g, P(e, y0, zm), P(e, y1, zm), BG, 3);
}

/**
 * North wall runs along the y = 0 floor edge, west wall along the x = 0 edge; both rise from
 * the floor edge to backWallH and their caps share the inner corner vertex P(0, 0, H).
 */
function paintInteriorWalls(g: Graphics, def: InteriorDef): void {
  if (def.sprite) return;
  const H = def.backWallH;
  const t = WALL_THICK;
  const { w, h } = def;

  poly(g, [P(0, 0, 0), P(0, h, 0), P(0, h, H), P(0, 0, H)], WEST_WALL);
  poly(g, [P(0, 0, 0), P(w, 0, 0), P(w, 0, H), P(0, 0, H)], NORTH_WALL);
  for (let i = 1; i < h; i++) line(g, P(0.01, i, 0), P(0.01, i, H), WALL_SEAM, 1);
  for (let i = 1; i < w; i++) line(g, P(i, 0.01, 0), P(i, 0.01, H), WALL_SEAM, 1);
  westWindow(g, 2.2, 2.8, 34, 74);
  northWindow(g, 1.2, 1.8, 34, 74);
  northWindow(g, 4.9, 5.5, 34, 74);
  poly(g, [P(-t, h, 0), P(0, h, 0), P(0, h, H), P(-t, h, H)], WALL_END);
  poly(g, [P(w, -t, 0), P(w, 0, 0), P(w, 0, H), P(w, -t, H)], WALL_END);
  poly(g, [P(0, 0, H), P(-t, -t, H), P(-t, h, H), P(0, h, H)], WALL_CAP);
  poly(g, [P(0, 0, H), P(w, 0, H), P(w, -t, H), P(-t, -t, H)], WALL_CAP);

  const ex = def.exit.x;
  for (let tx = 0; tx < w; tx++) {
    if (tx === ex) continue;
    box(g, tx, h, tx + 1, h + PLINTH_DEPTH, 0, def.plinthH, PLINTH);
  }
  box(g, w, 0, w + PLINTH_DEPTH, h + PLINTH_DEPTH, 0, def.plinthH, PLINTH);
  box(g, ex - 0.1, h, ex + 0.02, h + PLINTH_DEPTH, 0, 34, POST);
  box(g, ex + 0.98, h, ex + 1.1, h + PLINTH_DEPTH, 0, 34, POST);
}

/** Exit mat: dark rug with an amber threshold line on the door side. */
function paintExitMat(g: Graphics, def: InteriorDef, alpha = 1): void {
  const { x, y } = def.exit;
  tileDiamond(g, x, y, MAT, alpha);
  g.moveTo(P(x, y).x, P(x, y).y);
  g.lineTo(P(x + 1, y).x, P(x + 1, y).y);
  g.lineTo(P(x + 1, y + 1).x, P(x + 1, y + 1).y);
  g.lineTo(P(x, y + 1).x, P(x, y + 1).y);
  g.closePath();
  g.stroke({ width: 2, color: FLOOR_SEAM });
  if (def.exitFace === '+x') line(g, P(x + 1, y + 0.08), P(x + 1, y + 0.92), AMBER, 4);
  else line(g, P(x + 0.08, y + 1), P(x + 0.92, y + 1), AMBER, 4);
}

function paintEstudio(g: Graphics): void {
  // Floor lamp in the west corner: amber pool of light, pole, shade.
  const lx = 0.45;
  const ly = 4.5;
  for (const [r, a] of [
    [0.75, 0.12],
    [0.5, 0.2],
    [0.28, 0.32],
  ] as const) {
    const x0 = Math.max(0.02, lx - r);
    poly(g, [P(x0, ly - r), P(lx + r, ly - r), P(lx + r, ly + r), P(x0, ly + r)], AMBER, a);
  }
  box(g, lx - 0.12, ly - 0.12, lx + 0.12, ly + 0.12, 0, 3, DESK);
  box(g, lx - 0.02, ly - 0.02, lx + 0.02, ly + 0.02, 3, 62, DESK);
  box(g, lx - 0.14, ly - 0.14, lx + 0.14, ly + 0.14, 62, 76, SHELF);
  poly(g, [P(lx - 0.14, ly + 0.14, 62), P(lx + 0.14, ly + 0.14, 62), P(lx + 0.14, ly - 0.14, 62)], AMBER, 0.9);

  // Bookshelf on the north wall with a small amber lamp on top.
  box(g, 2.9, 0.04, 4.1, 0.42, 0, 80, SHELF);
  for (const z of [20, 40, 60]) line(g, P(2.9, 0.42, z), P(4.1, 0.42, z), FLOOR_SEAM, 2);
  box(g, 3.75, 0.16, 3.9, 0.3, 80, 86, DESK);
  box(g, 3.78, 0.19, 3.87, 0.27, 86, 92, MONITOR);

  // Desk in the back corner, monitor glowing amber toward the room, chair in front.
  box(g, 0.15, 0.15, 1.85, 1.3, 0, 30, DESK);
  box(g, 0.55, 0.3, 1.35, 0.42, 30, 56, MONITOR);
  box(g, 0.75, 1.5, 1.25, 1.9, 0, 18, CHAIR);
}

function paintInteriorProps(g: Graphics, def: InteriorDef): void {
  if (def.sprite) {
    if (def.matOverlay) paintExitMat(g, def, 0.88);
    return;
  }
  paintExitMat(g, def);
  paintEstudio(g);
}

export function drawInteriorFloor(g: Graphics, def: InteriorDef): void {
  g.clear();
  paintInteriorFloor(g, def);
}

export function drawInteriorWalls(g: Graphics, def: InteriorDef): void {
  g.clear();
  paintInteriorWalls(g, def);
}

export function drawInteriorProps(g: Graphics, def: InteriorDef): void {
  g.clear();
  paintInteriorProps(g, def);
}

/** Single-buffer draw (floor → walls → props). The scene uses one Graphics per layer. */
export function drawInteriorRoom(g: Graphics, def: InteriorDef): void {
  g.clear();
  paintInteriorFloor(g, def);
  paintInteriorWalls(g, def);
  paintInteriorProps(g, def);
}

export function interiorWorldBounds(def: InteriorDef, tightSides = false): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (def.sprite) {
    const b = spriteAsset(interiorSpriteKey(def.id, false)).bbox;
    const fx = interiorSpriteTopLeft(def);
    const k = def.scale;
    const padX = TILE_W * (tightSides ? 0.03 : 0.25);
    const padY = TILE_H * 0.4;
    const minX = fx.x + b.x0 * k;
    const maxX = fx.x + b.x1 * k;
    // Cutaways draw the removed roof / spire as a dashed outline above the room: frame the room.
    const minY = def.matOverlay ? Math.max(fx.y + b.y0 * k, P(0, 0).y - ART_ROOM_HEADROOM) : fx.y + b.y0 * k;
    const maxY = fx.y + b.y1 * k;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
      width: maxX - minX + padX * 2,
      height: maxY - minY + padY * 2,
    };
  }
  const H = def.backWallH;
  const t = WALL_THICK;
  const d = PLINTH_DEPTH;
  const pts: Pt[] = [
    P(-t, -t, H),
    P(def.w, -t, H),
    P(-t, def.h, H),
    P(-t, def.h, 0),
    P(def.w + d, 0, def.plinthH),
    P(def.w + d, def.h + d, 0),
    P(0, def.h + d, 0),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const padX = TILE_W * (tightSides ? 0.03 : 0.25);
  const padY = TILE_H * 0.4;
  return {
    minX: minX - padX,
    maxX: maxX + padX,
    minY: minY - padY,
    maxY: maxY + padY,
    width: maxX - minX + padX * 2,
    height: maxY - minY + padY * 2,
  };
}

export function findPathInterior(
  grid: InteriorCell[][],
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] | null {
  const h = grid.length;
  const wd = grid[0]?.length ?? 0;
  if (gy < 0 || gx < 0 || gy >= h || gx >= wd) return null;
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
      if (nx < 0 || ny < 0 || nx >= wd || ny >= h) continue;
      if (!grid[ny][nx].walkable) continue;
      const nk = `${nx},${ny}`;
      if (closed.has(nk)) continue;
      const gCost = cur.g + 1;
      const f = gCost + heur(nx, ny, gx, gy);
      const ex = open.find((n) => n.x === nx && n.y === ny);
      if (ex && ex.g <= gCost) continue;
      if (ex) {
        ex.g = gCost;
        ex.f = f;
        ex.parent = cur;
      } else {
        open.push({ x: nx, y: ny, g: gCost, f, parent: cur });
      }
    }
  }
  return null;
}

export function syncInteriorCharacter(
  g: Graphics,
  tx: number,
  ty: number,
  state: 'idle' | 'walk' | 'sprint',
): void {
  g.clear();
  drawCharacter(g, state);
  const pos = tileFootWorld(tx, ty);
  g.position.set(pos.x, pos.y);
}

/** Interior tile whose drawn diamond contains the world point (null outside the floor). */
export function interiorPickTile(
  def: InteriorDef,
  worldX: number,
  worldY: number,
): { x: number; y: number } | null {
  const gx = (worldX / (TILE_W / 2) + worldY / (TILE_H / 2)) / 2;
  const gy = (worldY / (TILE_H / 2) - worldX / (TILE_W / 2)) / 2;
  const x = Math.round(gx);
  const y = Math.round(gy);
  if (x < 0 || y < 0 || x >= def.w || y >= def.h) return null;
  return { x, y };
}

/**
 * Exit target: the mat tile plus the door gap in front of it (between the two posts, outside the
 * floor on the exit face). Neighbouring floor tiles are not part of it.
 */
export function interiorHitExit(
  def: InteriorDef,
  worldX: number,
  worldY: number,
  _zoom: number,
): boolean {
  // Pick coordinates are tile-center based; lattice = pick + 0.5.
  const lx = (worldX / (TILE_W / 2) + worldY / (TILE_H / 2)) / 2 + 0.5;
  const ly = (worldY / (TILE_H / 2) - worldX / (TILE_W / 2)) / 2 + 0.5;
  const { x, y } = def.exit;
  if (def.exitFace === '+x') {
    return ly >= y - 0.1 && ly <= y + 1.1 && lx >= x && lx <= x + 1 + EXIT_GAP_DEPTH;
  }
  return lx >= x - 0.1 && lx <= x + 1.1 && ly >= y && ly <= y + 1 + EXIT_GAP_DEPTH;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isPerimeterShell(def: InteriorDef, x: number, y: number): boolean {
  if (def.sprite) return false;
  const edge = x === 0 || y === 0 || x === def.w - 1 || y === def.h - 1;
  const isExit = x === def.exit.x && y === def.exit.y;
  return edge && !isExit;
}

/** Blocked tiles that must show furniture/terrain (not plain wall shell). */
export function interiorBlockedPropTiles(def: InteriorDef): { x: number; y: number }[] {
  const grid = buildInteriorGrid(def);
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < def.h; y++) {
    for (let x = 0; x < def.w; x++) {
      if (!grid[y][x].walkable && !isPerimeterShell(def, x, y)) out.push({ x, y });
    }
  }
  return out;
}

/** Tiles whose footprint is covered by a drawn prop (same tables the painters use). */
export function interiorRenderedPropTiles(def: InteriorDef): { x: number; y: number }[] {
  const keys = new Set<string>();
  if (def.mask) {
    def.mask.forEach((row, y) => {
      [...row].forEach((c, x) => {
        if (c === '#') keys.add(tileKey(x, y));
      });
    });
  } else {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) keys.add(tileKey(x, y));
  }
  return [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
}

export function interiorBlockedTilesHaveProps(def: InteriorDef): boolean {
  const blocked = interiorBlockedPropTiles(def);
  const rendered = new Set(interiorRenderedPropTiles(def).map((t) => tileKey(t.x, t.y)));
  return blocked.every((t) => rendered.has(tileKey(t.x, t.y)));
}

export type InteriorPixelProbe = {
  label: string;
  world: Pt;
  /** Any of these colors counts as the feature being drawn at this point. */
  expect: number[];
};

/**
 * QA pixel probes. Sprite rooms: flat-colour samples of the exported frame at their world spots.
 * Estudio: one point per west-wall segment, the windows, the desk and the monitor.
 */
export function interiorPixelProbes(def: InteriorDef, lejos = false): InteriorPixelProbe[] {
  const out: InteriorPixelProbe[] = [];
  const pal = (p: Palette) => [p.top, p.left, p.right];
  if (def.sprite) {
    const key = interiorSpriteKey(def.id, lejos);
    const tl = interiorSpriteTopLeft(def);
    const k = def.scale;
    (cachedSpriteProbes()?.[key] ?? []).forEach(([x, y, r, g, b], i) => {
      out.push({
        label: `sprite-${def.id}-${lejos ? 'lejos' : 'cerca'}-${i}`,
        world: { x: tl.x + (x + 0.5) * k, y: tl.y + (y + 0.5) * k },
        expect: [(r << 16) | (g << 8) | b],
      });
    });
    return out;
  }
  const wallZ = def.backWallH - 6;
  for (let ty = 0; ty < def.h; ty++) {
    if (ty === 2) continue;
    out.push({ label: `west-wall-${ty}`, world: P(0, ty + 0.5, wallZ), expect: [WEST_WALL] });
  }
  out.push({ label: 'west-window', world: P(0.02, 2.35, 44), expect: [AMBER] });
  out.push({ label: 'north-window', world: P(1.35, 0.02, 44), expect: [AMBER] });
  out.push({ label: 'estudio-desk', world: P(1.2, 0.9, 30), expect: pal(DESK) });
  out.push({ label: 'estudio-monitor', world: P(0.95, 0.42, 43), expect: [AMBER] });
  return out;
}

export const INTERIOR_FLOOR_COLORS = [FLOOR_A, FLOOR_B];

/** Walkable tile next to spawn, away from the exit (typical “tap ahead” probe). */
export function interiorForwardTile(def: InteriorDef): { x: number; y: number } {
  const grid = buildInteriorGrid(def);
  const { x, y } = def.spawn;
  for (const [dx, dy] of [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
  ]) {
    const t = { x: x + dx, y: y + dy };
    if (t.x === def.exit.x && t.y === def.exit.y) continue;
    if (grid[t.y]?.[t.x]?.walkable) return t;
  }
  return { x, y: Math.max(0, y - 1) };
}
