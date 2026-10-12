import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld } from '../iso/math';
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
  /** Tall back walls (~2× character). */
  backWallH: number;
  /** Low cut plinth on open (+x / +y) sides. */
  plinthH: number;
  spawn: { x: number; y: number };
  exit: { x: number; y: number };
};

/** ~2× character silhouette height in px. */
export const INTERIOR_BACK_WALL_H = 88;
export const INTERIOR_PLINTH_H = 12;

function def(
  id: InteriorBuildingId,
  w: number,
  h: number,
  opts?: {
    backWallH?: number;
    plinthH?: number;
    spawn?: { x: number; y: number };
    exit?: { x: number; y: number };
  },
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

const CASE_IDS: readonly InteriorBuildingId[] = ['estudio', 'volaris', 'bain', 'mentoria', 'finoa', 'pg'];

function isCaseRoom(def: InteriorDef): boolean {
  return CASE_IDS.includes(def.id);
}

/** Flor: stage against the west-wall screen, seating tiers rising away from it (+x). */
const FLOR_STAGE = { x0: 0, x1: 2, y0: 1, y1: 4, h: 20 };
const FLOR_TIERS = [
  { x: 3, h: 16 },
  { x: 4, h: 36 },
  { x: 5, h: 56 },
];
const FLOR_TIER_Y0 = 1;
const FLOR_TIER_Y1 = 4;

export type InteriorCell = { walkable: boolean };

function setBlocked(cells: InteriorCell[][], x: number, y: number): void {
  if (cells[y]?.[x]) cells[y][x].walkable = false;
}

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

  if (def.id === 'catedral') {
    for (let row = 2; row <= 5; row++) {
      for (let col = 1; col <= 6; col++) {
        if (col === 3 || col === 4) continue;
        setBlocked(cells, col, row);
      }
    }
    setBlocked(cells, 3, 1);
    setBlocked(cells, 4, 1);
  } else if (def.id === 'sambil') {
    for (let y = 1; y < def.h - 1; y++) {
      for (let x = 5; x < def.w - 1; x++) {
        if (y !== 4) setBlocked(cells, x, y);
      }
    }
  } else if (def.id === 'flor') {
    for (let y = FLOR_STAGE.y0; y < FLOR_STAGE.y1; y++) {
      for (let x = Math.max(1, FLOR_STAGE.x0); x < FLOR_STAGE.x1; x++) setBlocked(cells, x, y);
    }
    for (const tier of FLOR_TIERS) {
      for (let y = FLOR_TIER_Y0; y < FLOR_TIER_Y1; y++) setBlocked(cells, tier.x, y);
    }
  } else if (isCaseRoom(def)) {
    setBlocked(cells, 1, 1);
  }

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

function poly(g: Graphics, pts: Pt[], fill: number): void {
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill(fill);
}

function tileDiamond(g: Graphics, tx: number, ty: number, fill: number): void {
  poly(g, [P(tx, ty), P(tx + 1, ty), P(tx + 1, ty + 1), P(tx, ty + 1)], fill);
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

/** Vertical cylinder centered at lattice (cx, cy), radius r in tiles. */
function drum(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  z0: number,
  z1: number,
  side: number,
  top: number,
): void {
  const rx = r * (TILE_W / 2) * Math.SQRT2;
  const ry = r * (TILE_H / 2) * Math.SQRT2;
  const b = P(cx, cy, z0);
  const t = P(cx, cy, z1);
  g.ellipse(b.x, b.y, rx, ry);
  g.fill(side);
  g.rect(b.x - rx, t.y, rx * 2, b.y - t.y);
  g.fill(side);
  g.ellipse(t.x, t.y, rx, ry);
  g.fill(top);
}

const FLOOR_A = 0xc8c8c8;
const FLOOR_B = 0xb8b8b8;
const NORTH_WALL = 0x9e9e9e;
const WEST_WALL = 0x8a8a8a;
const WALL_CAP = 0x5e5e5e;
const WALL_END = 0x747474;
const WALL_THICK = 0.18;
const PLINTH_DEPTH = 0.14;
/** How far past the floor edge the door gap counts as the exit target (lattice tiles). */
const EXIT_GAP_DEPTH = 0.6;
const PLINTH: Palette = { top: 0xa8a8a8, left: 0x8c8c8c, right: 0x7a7a7a };
const POST: Palette = { top: 0x8a8a8a, left: 0x6a6a6a, right: 0x585858 };
const MAT = 0xe8e4da;

const PEW: Palette = { top: 0x9c7650, left: 0x7a5638, right: 0x5c3f28 };
const STONE: Palette = { top: 0xdcd6cc, left: 0xb2aca2, right: 0x968f85 };
const STAGE: Palette = { top: 0xa87c52, left: 0x7c5a3a, right: 0x5e4329 };
/** Treads are light; each riser (the +y / +x walls) is one step darker than its own tread. */
const TIER: Palette = { top: 0xa6a6b6, left: 0x62626f, right: 0x52525e };
const TIER_ALT: Palette = { top: 0x9696a6, left: 0x565663, right: 0x484855 };
const TIER_NOSING = 0xd2d2de;
const SEAT: Palette = { top: 0xc04c4c, left: 0x983838, right: 0x762a2a };
const TIER_EDGE = 0x2e2e36;
const BENCH: Palette = { top: 0xa08058, left: 0x7a5e3e, right: 0x5e462c };
const SCREEN_FRAME = 0x2a2a36;
const SCREEN_GLOW = 0x46506a;

const WOOD: Palette = { top: 0xc49a74, left: 0x9c7656, right: 0x7c5a40 };
const DARK: Palette = { top: 0x4a4a54, left: 0x34343c, right: 0x26262c };
const CHAIR: Palette = { top: 0x707070, left: 0x585858, right: 0x464646 };
const CONSOLE: Palette = { top: 0x8ea4bc, left: 0x6a8098, right: 0x52667c };
const SHELF: Palette = { top: 0x8a6a4c, left: 0x6c5038, right: 0x523c2a };
const LIGHT_WOOD: Palette = { top: 0xd8bc98, left: 0xb09472, right: 0x8e7656 };
const FINOA_TABLE: Palette = { top: 0x8fb0a0, left: 0x6c8c7c, right: 0x547062 };
const PEDESTAL: Palette = { top: 0x5a5a64, left: 0x44444c, right: 0x34343a };
const GLASS: Palette = { top: 0xeef4fa, left: 0xd2e2ee, right: 0xb6cadc };
const PRODUCT: Palette = { top: 0xf0a860, left: 0xd08440, right: 0xa86830 };

const CASE_RUG: Record<string, number> = {
  estudio: 0xb08a68,
  volaris: 0x6a96c8,
  bain: 0xb86a5e,
  mentoria: 0xa08c70,
  finoa: 0x7aa090,
  pg: 0x7f92c4,
};

function paintInteriorFloor(g: Graphics, def: InteriorDef): void {
  for (let ty = 0; ty < def.h; ty++) {
    for (let tx = 0; tx < def.w; tx++) {
      tileDiamond(g, tx, ty, (tx + ty) % 2 === 0 ? FLOOR_A : FLOOR_B);
    }
  }
}

/**
 * North wall runs along the y = 0 floor edge, west wall along the x = 0 edge; both rise from
 * the floor edge to backWallH and their caps share the inner corner vertex P(0, 0, H).
 */
function paintInteriorWalls(g: Graphics, def: InteriorDef): void {
  const H = def.backWallH;
  const t = WALL_THICK;
  const { w, h } = def;

  poly(g, [P(0, 0, 0), P(0, h, 0), P(0, h, H), P(0, 0, H)], WEST_WALL);
  poly(g, [P(0, 0, 0), P(w, 0, 0), P(w, 0, H), P(0, 0, H)], NORTH_WALL);
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

function paintExitMat(g: Graphics, def: InteriorDef): void {
  const { x, y } = def.exit;
  tileDiamond(g, x, y, MAT);
  g.moveTo(P(x, y).x, P(x, y).y);
  g.lineTo(P(x + 1, y).x, P(x + 1, y).y);
  g.lineTo(P(x + 1, y + 1).x, P(x + 1, y + 1).y);
  g.lineTo(P(x, y + 1).x, P(x, y + 1).y);
  g.closePath();
  g.stroke({ width: 2, color: 0xc4bfb2 });
}

function paintCaseRug(g: Graphics, accent: number): void {
  const light = Math.min(0xffffff, accent + 0x141414);
  for (let ty = 0; ty < 3; ty++) {
    for (let tx = 0; tx < 3; tx++) tileDiamond(g, tx, ty, (tx + ty) % 2 === 0 ? accent : light);
  }
}

/** Panel mounted on the west wall face (x = 0 plane), y range in tiles. */
function westWallPanel(g: Graphics, y0: number, y1: number, z0: number, z1: number, frame: number, glow: number): void {
  const e = 0.02;
  poly(g, [P(e, y0, z0), P(e, y1, z0), P(e, y1, z1), P(e, y0, z1)], frame);
  const iy0 = y0 + 0.12;
  const iy1 = y1 - 0.12;
  poly(g, [P(e, iy0, z0 + 6), P(e, iy1, z0 + 6), P(e, iy1, z1 - 6), P(e, iy0, z1 - 6)], glow);
}

function paintCaseProp(g: Graphics, def: InteriorDef): void {
  paintCaseRug(g, CASE_RUG[def.id] ?? 0x999999);
  switch (def.id) {
    case 'estudio':
      box(g, 0.15, 0.15, 1.85, 1.3, 0, 30, WOOD);
      box(g, 0.55, 0.3, 1.35, 0.42, 30, 56, DARK);
      box(g, 0.75, 1.5, 1.25, 1.9, 0, 18, CHAIR);
      break;
    case 'volaris':
      westWallPanel(g, 0.25, 1.85, 30, 76, 0x1e2a44, 0x4a7ab8);
      box(g, 0.2, 0.2, 1.6, 1.4, 0, 28, CONSOLE);
      box(g, 0.5, 0.35, 1.3, 0.5, 28, 44, DARK);
      break;
    case 'bain':
      paintBainTable(g);
      break;
    case 'mentoria': {
      box(g, 0.1, 0.05, 1.9, 0.55, 0, 80, SHELF);
      const books = [0x6a4a8a, 0x3a6a8a, 0x8a5a3a, 0x4a7a4a, 0x8a3a3a];
      for (const z of [8, 30, 52]) {
        for (let i = 0; i < 5; i++) {
          const bx0 = 0.2 + i * 0.33;
          poly(
            g,
            [P(bx0, 0.551, z), P(bx0 + 0.26, 0.551, z), P(bx0 + 0.26, 0.551, z + 16), P(bx0, 0.551, z + 16)],
            books[(i + z) % books.length],
          );
        }
      }
      box(g, 0.35, 0.9, 1.65, 1.75, 0, 26, LIGHT_WOOD);
      break;
    }
    case 'finoa':
      box(g, 0.2, 0.3, 1.8, 1.7, 0, 30, FINOA_TABLE);
      box(g, 0.7, 0.75, 1.3, 1.15, 30, 33, DARK);
      box(g, 0.7, 0.7, 1.3, 0.78, 33, 52, DARK);
      break;
    case 'pg':
      paintDisplayCase(g);
      break;
    default:
      break;
  }
}

const BAIN_TABLE_Z = 34;
const BAIN_TABLE_TOP = 0xb08e6c;
const BAIN_TABLE_SIDE = 0x6a5646;

/** Round pedestal table at table height, with a chair on each open side against the walls. */
function paintBainTable(g: Graphics): void {
  box(g, 0.12, 0.7, 0.58, 1.3, 0, 16, CHAIR);
  box(g, 0.12, 0.7, 0.24, 1.3, 16, 40, CHAIR);
  box(g, 0.7, 0.12, 1.3, 0.58, 0, 16, CHAIR);
  box(g, 0.7, 0.12, 1.3, 0.24, 16, 40, CHAIR);
  drum(g, 1.05, 1.05, 0.16, 0, BAIN_TABLE_Z - 6, BAIN_TABLE_SIDE, BAIN_TABLE_SIDE);
  drum(g, 1.05, 1.05, 0.62, BAIN_TABLE_Z - 6, BAIN_TABLE_Z, BAIN_TABLE_SIDE, BAIN_TABLE_TOP);
}

function paintDisplayCase(g: Graphics): void {
  box(g, 0.3, 0.3, 1.7, 1.7, 0, 24, PEDESTAL);
  box(g, 0.35, 0.35, 1.65, 1.65, 24, 72, GLASS);
  box(g, 0.8, 0.8, 1.2, 1.2, 24, 50, PRODUCT);
  const frame = { width: 2, color: 0x4c5660 };
  const edges: [Pt, Pt][] = [
    [P(0.35, 1.65, 24), P(0.35, 1.65, 72)],
    [P(1.65, 1.65, 24), P(1.65, 1.65, 72)],
    [P(1.65, 0.35, 24), P(1.65, 0.35, 72)],
    [P(0.35, 0.35, 72), P(1.65, 0.35, 72)],
    [P(1.65, 0.35, 72), P(1.65, 1.65, 72)],
    [P(1.65, 1.65, 72), P(0.35, 1.65, 72)],
    [P(0.35, 1.65, 72), P(0.35, 0.35, 72)],
  ];
  for (const [a, b] of edges) {
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke(frame);
  }
  const plate = [P(0.75, 1.701, 8), P(1.25, 1.701, 8), P(1.25, 1.701, 16), P(0.75, 1.701, 16)];
  poly(g, plate, 0xf2f2f2);
}

function paintPew(g: Graphics, tx: number, ty: number): void {
  box(g, tx + 0.06, ty + 0.14, tx + 0.94, ty + 0.34, 0, 38, PEW);
  box(g, tx + 0.06, ty + 0.34, tx + 0.94, ty + 0.86, 0, 18, PEW);
}

function paintCatedral(g: Graphics, def: InteriorDef, grid: InteriorCell[][]): void {
  box(g, 2, 0.1, 6, 0.8, 0, 40, STONE);
  const cross = 0x5a4632;
  const c = 4;
  const e = 0.02;
  poly(g, [P(c - 0.06, e, 52), P(c + 0.06, e, 52), P(c + 0.06, e, 84), P(c - 0.06, e, 84)], cross);
  poly(g, [P(c - 0.3, e, 70), P(c + 0.3, e, 70), P(c + 0.3, e, 76), P(c - 0.3, e, 76)], cross);
  box(g, 3, 1.25, 5, 1.55, 0, 16, PEW);
  const tiles: { x: number; y: number }[] = [];
  for (let y = 2; y < def.h - 1; y++) {
    for (let x = 1; x < def.w - 1; x++) {
      if (!grid[y][x].walkable) tiles.push({ x, y });
    }
  }
  tiles.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
  for (const t of tiles) paintPew(g, t.x, t.y);
}

/** Small benches on the walkway (row 4), tucked to opposite edges so the lane stays clear. */
const SAMBIL_BENCHES = [
  { x0: 5.12, y0: 4.04, x1: 5.88, y1: 4.3 },
  { x0: 6.12, y0: 4.7, x1: 6.88, y1: 4.96 },
];

function paintBench(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const leg = 0.1;
  box(g, x0 + 0.04, y0, x0 + 0.04 + leg, y1, 0, 9, BENCH);
  box(g, x1 - 0.04 - leg, y0, x1 - 0.04, y1, 0, 9, BENCH);
  box(g, x0, y0, x1, y1, 9, 15, BENCH);
}

function paintSambil(g: Graphics, def: InteriorDef): void {
  const water = 0x7aa8bc;
  const waterDark = 0x5a8898;
  const walk = 0xd4ccc0;
  for (let y = 1; y < def.h - 1; y++) {
    for (let x = 5; x < def.w - 1; x++) {
      tileDiamond(g, x, y, y === 4 ? walk : y < 4 ? waterDark : water);
    }
  }
  tileDiamond(g, 4, 4, walk);
  for (const b of SAMBIL_BENCHES) paintBench(g, b.x0, b.y0, b.x1, b.y1);
  const a = P(5, 1.5, 6);
  const b = P(7, 1.5, 6);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width: 3, color: 0x555555 });
}

function paintFlor(g: Graphics, def: InteriorDef): void {
  const H = def.backWallH;
  westWallPanel(g, FLOR_STAGE.y0 - 0.2, FLOR_STAGE.y1 + 0.2, 34, H - 16, SCREEN_FRAME, SCREEN_GLOW);
  box(g, FLOR_STAGE.x0, FLOR_STAGE.y0, FLOR_STAGE.x1, FLOR_STAGE.y1, 0, FLOR_STAGE.h, STAGE);
  const lip = [P(FLOR_STAGE.x1, FLOR_STAGE.y0, FLOR_STAGE.h), P(FLOR_STAGE.x1, FLOR_STAGE.y1, FLOR_STAGE.h)];
  g.moveTo(lip[0].x, lip[0].y);
  g.lineTo(lip[1].x, lip[1].y);
  g.stroke({ width: 2, color: 0xd8b088 });

  FLOR_TIERS.forEach((tier, i) => {
    box(g, tier.x, FLOR_TIER_Y0, tier.x + 1, FLOR_TIER_Y1, 0, tier.h, i % 2 === 0 ? TIER : TIER_ALT);
    // Risers face the stage (away from the camera), so the step reads through this edge line.
    const a = P(tier.x, FLOR_TIER_Y0, tier.h);
    const b = P(tier.x, FLOR_TIER_Y1, tier.h);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 3, color: TIER_EDGE });
    const n0 = P(tier.x, FLOR_TIER_Y1, tier.h);
    const n1 = P(tier.x + 1, FLOR_TIER_Y1, tier.h);
    g.moveTo(n0.x, n0.y);
    g.lineTo(n1.x, n1.y);
    g.stroke({ width: 2, color: TIER_NOSING });
    for (let y = FLOR_TIER_Y0; y < FLOR_TIER_Y1; y++) {
      box(g, tier.x + 0.22, y + 0.14, tier.x + 0.66, y + 0.86, tier.h, tier.h + 8, SEAT);
      box(g, tier.x + 0.66, y + 0.14, tier.x + 0.84, y + 0.86, tier.h, tier.h + 26, SEAT);
    }
  });
}

function paintInteriorProps(g: Graphics, def: InteriorDef): void {
  const grid = buildInteriorGrid(def);
  paintExitMat(g, def);
  if (isCaseRoom(def)) paintCaseProp(g, def);
  else if (def.id === 'catedral') paintCatedral(g, def, grid);
  else if (def.id === 'sambil') paintSambil(g, def);
  else if (def.id === 'flor') paintFlor(g, def);
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
 * floor). Neighbouring floor tiles are not part of it. Tapping it walks there and exits on arrival.
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
  return lx >= x - 0.1 && lx <= x + 1.1 && ly >= y && ly <= y + 1 + EXIT_GAP_DEPTH;
}

/** @deprecated use interiorHitExit */
export function interiorExitPick(
  def: InteriorDef,
  worldX: number,
  worldY: number,
  zoom: number,
): boolean {
  return interiorHitExit(def, worldX, worldY, zoom);
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isPerimeterShell(def: InteriorDef, x: number, y: number): boolean {
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
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) keys.add(tileKey(x, y));
  };
  if (def.id === 'catedral') {
    const grid = buildInteriorGrid(def);
    for (let y = 2; y < def.h - 1; y++) {
      for (let x = 1; x < def.w - 1; x++) if (!grid[y][x].walkable) mark(x, y, x + 1, y + 1);
    }
    mark(3, 1, 5, 2);
    mark(2, 0, 6, 1);
  } else if (def.id === 'sambil') {
    for (let y = 1; y < def.h - 1; y++) for (let x = 5; x < def.w - 1; x++) mark(x, y, x + 1, y + 1);
  } else if (def.id === 'flor') {
    mark(FLOR_STAGE.x0, FLOR_STAGE.y0, FLOR_STAGE.x1, FLOR_STAGE.y1);
    for (const tier of FLOR_TIERS) mark(tier.x, FLOR_TIER_Y0, tier.x + 1, FLOR_TIER_Y1);
  } else if (isCaseRoom(def)) {
    mark(0, 0, 2, 2);
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
 * QA pixel probes: one point per west-wall segment, per pew tile, per Flor stage/tier, per case
 * prop. Each must render as its feature color (not floor, not background).
 */
export function interiorPixelProbes(def: InteriorDef): InteriorPixelProbe[] {
  const out: InteriorPixelProbe[] = [];
  const pal = (p: Palette) => [p.top, p.left, p.right];
  const wallZ = def.backWallH - 6;
  for (let ty = 0; ty < def.h; ty++) {
    out.push({ label: `west-wall-${ty}`, world: P(0, ty + 0.5, wallZ), expect: [WEST_WALL] });
  }
  if (def.id === 'catedral') {
    const grid = buildInteriorGrid(def);
    for (let y = 2; y < def.h - 1; y++) {
      for (let x = 1; x < def.w - 1; x++) {
        if (!grid[y][x].walkable) {
          out.push({ label: `pew-${x}-${y}`, world: P(x + 0.5, y + 0.6, 18), expect: pal(PEW) });
        }
      }
    }
  } else if (def.id === 'sambil') {
    SAMBIL_BENCHES.forEach((b, i) => {
      out.push({
        label: `sambil-bench-${i}`,
        world: P((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 15),
        expect: [BENCH.top],
      });
    });
  } else if (def.id === 'flor') {
    out.push({
      label: 'flor-stage',
      world: P((FLOR_STAGE.x0 + FLOR_STAGE.x1) / 2, (FLOR_STAGE.y0 + FLOR_STAGE.y1) / 2, FLOR_STAGE.h),
      expect: pal(STAGE),
    });
    for (const tier of FLOR_TIERS) {
      out.push({
        label: `flor-tier-${tier.x}`,
        world: P(tier.x + 0.75, FLOR_TIER_Y1 - 0.5, tier.h + 18),
        expect: [...pal(SEAT), ...pal(TIER), ...pal(TIER_ALT)],
      });
    }
  } else if (isCaseRoom(def)) {
    const caseProbe: Record<string, { world: Pt; expect: number[] }> = {
      estudio: { world: P(1.2, 0.9, 30), expect: pal(WOOD) },
      volaris: { world: P(1.2, 1.0, 28), expect: pal(CONSOLE) },
      bain: { world: P(1.05, 1.05, BAIN_TABLE_Z), expect: [BAIN_TABLE_TOP] },
      mentoria: { world: P(1.0, 1.3, 26), expect: pal(LIGHT_WOOD) },
      finoa: { world: P(1.5, 1.4, 30), expect: pal(FINOA_TABLE) },
      pg: { world: P(1.65, 1.0, 40), expect: [...pal(GLASS), ...pal(PRODUCT)] },
    };
    const c = caseProbe[def.id];
    if (c) out.push({ label: `case-${def.id}`, ...c });
  }
  return out;
}

export const INTERIOR_FLOOR_COLORS = [FLOOR_A, FLOOR_B];

/** Tile one step inward from spawn (typical “tap ahead” probe). */
export function interiorForwardTile(def: InteriorDef): { x: number; y: number } {
  return { x: def.spawn.x, y: Math.max(0, def.spawn.y - 1) };
}
