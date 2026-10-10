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
export const INTERIOR_PLINTH_H = 22;

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
  const spawn = opts?.spawn ?? { x: exit.x, y: h - 2 };
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
        setBlocked(cells, x, y);
      }
    }
    for (let x = 5; x < def.w - 1; x++) {
      cells[4][x].walkable = true;
    }
  } else if (def.id === 'flor') {
    for (let y = 0; y <= 2; y++) {
      setBlocked(cells, 0, y);
      setBlocked(cells, 1, y);
    }
    const seats: [number, number][] = [
      [5, 5],
      [4, 4],
      [3, 3],
      [2, 2],
      [5, 4],
      [4, 3],
    ];
    for (const [x, y] of seats) setBlocked(cells, x, y);
  } else if (def.id === 'estudio') {
    setBlocked(cells, 2, 1);
    setBlocked(cells, 3, 1);
  } else if (def.id === 'volaris') {
    setBlocked(cells, 1, 1);
    setBlocked(cells, 2, 1);
    setBlocked(cells, 1, 2);
  } else if (def.id === 'bain') {
    setBlocked(cells, 3, 2);
  } else if (def.id === 'mentoria') {
    setBlocked(cells, 1, 1);
    setBlocked(cells, 1, 2);
  } else if (def.id === 'finoa') {
    setBlocked(cells, 4, 1);
    setBlocked(cells, 4, 2);
  } else if (def.id === 'pg') {
    setBlocked(cells, 2, 1);
    setBlocked(cells, 3, 1);
    setBlocked(cells, 4, 1);
  }

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

function drawIsoBlock(
  g: Graphics,
  tx: number,
  ty: number,
  wTiles: number,
  hTiles: number,
  slabH: number,
  fill: number,
  top: number,
): void {
  const sw = localFoot(tx, ty + hTiles - 1);
  const se = localFoot(tx + wTiles - 1, ty + hTiles - 1);
  const nw = northTop(tx, ty);
  const ne = northTop(tx + wTiles - 1, ty);
  poly(g, [sw, se, raise(se, slabH), raise(sw, slabH)], fill);
  poly(g, [raise(sw, slabH), raise(se, slabH), raise(ne, slabH + 6), raise(nw, slabH + 6)], top);
}

function drawIdentityProps(g: Graphics, def: InteriorDef): void {
  const prop = 0xaaaaaa;
  const propDark = 0x959595;
  const propLight = 0xbcbcbc;

  if (def.id === 'catedral') {
    drawIsoBlock(g, 2, 0, 4, 1, 52, 0x8a8a8a, 0xc8c8c8);
    for (let row = 2; row <= 5; row++) {
      for (const col of [1, 2, 5, 6]) {
        drawIsoBlock(g, col, row, 1, 1, 22, 0x7a7568, 0xa09888);
      }
    }
    for (const col of [1, 2, 5, 6]) {
      drawIsoBlock(g, col, 2, 1, 1, 8, propDark, prop);
    }
  } else if (def.id === 'sambil') {
    const water = 0x7aa8bc;
    const waterDark = 0x5a8898;
    const walk = 0xd4ccc0;
    for (let y = 1; y < def.h - 1; y++) {
      for (let x = 5; x < def.w - 1; x++) {
        const pos = localFoot(x, y);
        g.moveTo(pos.x, pos.y);
        g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
        g.lineTo(pos.x, pos.y - TILE_H);
        g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
        g.closePath();
        g.fill(y === 4 ? walk : y < 4 ? waterDark : water);
      }
    }
    for (let x = 4; x <= 6; x++) {
      const pos = localFoot(x, 4);
      g.moveTo(pos.x, pos.y);
      g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
      g.lineTo(pos.x, pos.y - TILE_H);
      g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
      g.closePath();
      g.fill(walk);
    }
    g.moveTo(localFoot(5, 1).x, localFoot(5, 1).y - TILE_H / 2);
    g.lineTo(localFoot(7, 1).x, localFoot(7, 1).y - TILE_H / 2);
    g.stroke({ width: 3, color: 0x555555 });
  } else if (def.id === 'flor') {
    drawIsoBlock(g, 2, 0, 3, 1, 36, 0x505050, 0x707070);
    drawIsoBlock(g, 0, 0, 2, 3, 48, 0x606060, 0x888888);
    const screenH = def.backWallH - 12;
    const nw = northTop(2, 0);
    const ne = northTop(5, 0);
    poly(
      g,
      [raise(nw, 36), raise(ne, 36), raise(ne, screenH), raise(nw, screenH)],
      0x3a3a48,
    );
    poly(
      g,
      [
        raise(nw, screenH - 8),
        raise(ne, screenH - 8),
        raise(ne, screenH),
        raise(nw, screenH),
      ],
      0x555566,
    );
    const seatRows: [number, number, number][] = [
      [6, 6, 10],
      [5, 5, 14],
      [4, 4, 18],
      [3, 3, 22],
      [5, 5, 12],
      [4, 5, 16],
    ];
    for (const [x, y, h] of seatRows) {
      drawIsoBlock(g, x, y, 1, 1, h, 0x888888, propLight);
    }
  } else if (def.id === 'estudio') {
    drawIsoBlock(g, 2, 1, 2, 1, 24, 0x9a8a7a, propLight);
    drawIsoBlock(g, 2, 2, 1, 1, 14, prop, propLight);
  } else if (def.id === 'volaris') {
    drawIsoBlock(g, 1, 1, 2, 2, 28, 0x8a9098, propLight);
  } else if (def.id === 'bain') {
    drawIsoBlock(g, 2, 2, 2, 1, 18, 0x888888, propLight);
    g.circle(localFoot(3, 2).x, localFoot(3, 2).y - 18, 10);
    g.fill(propDark);
  } else if (def.id === 'mentoria') {
    drawIsoBlock(g, 1, 1, 2, 1, 28, 0x8a8478, 0xb0a898);
    drawIsoBlock(g, 1, 2, 1, 1, 20, 0x9a9088, propLight);
    drawIsoBlock(g, 3, 3, 1, 1, 16, prop, propDark);
  } else if (def.id === 'finoa') {
    drawIsoBlock(g, 4, 1, 1, 2, 30, 0x7a9080, 0x9ab0a0);
    drawIsoBlock(g, 2, 3, 2, 1, 18, 0x6a8078, 0x88a090);
    g.circle(localFoot(3, 3).x, localFoot(3, 3).y - 22, 8);
    g.fill(0x5a7068);
  } else if (def.id === 'pg') {
    drawIsoBlock(g, 2, 1, 3, 1, 20, 0x909090, propLight);
  }
}

function drawExitMat(g: Graphics, def: InteriorDef): void {
  const ex = def.exit.x;
  const ey = def.exit.y;
  const pos = localFoot(ex, ey);
  g.moveTo(pos.x, pos.y);
  g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
  g.lineTo(pos.x, pos.y - TILE_H);
  g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
  g.closePath();
  g.fill(0xa8a8a8);
  const frame = 0x707070;
  const lw = 5;
  const left = localFoot(ex - 1, ey);
  const right = localFoot(ex + 1, ey);
  g.moveTo(left.x - 4, left.y - TILE_H / 2);
  g.lineTo(left.x - 4, left.y - TILE_H / 2 - 28);
  g.lineTo(left.x + lw, left.y - TILE_H / 2 - 28);
  g.lineTo(left.x + lw, left.y - TILE_H / 2);
  g.closePath();
  g.fill(frame);
  g.moveTo(right.x + 4, right.y - TILE_H / 2);
  g.lineTo(right.x + 4, right.y - TILE_H / 2 - 28);
  g.lineTo(right.x - lw, right.y - TILE_H / 2 - 28);
  g.lineTo(right.x - lw, right.y - TILE_H / 2);
  g.closePath();
  g.fill(frame);
}

/** Gray dollhouse cutaway — per-building props; back (-x,-y) tall, front (+x,+y) low plinth. */
export function drawInteriorRoom(g: Graphics, def: InteriorDef): void {
  const floor = 0xc8c8c8;
  const floorDark = 0xb8b8b8;
  const wallBack = 0x9a9a9a;
  const wallSide = 0x8e8e8e;
  const wallFront = 0xa0a0a0;

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

  for (let tx = 0; tx < def.w; tx++) {
    const nw = northTop(tx, 0);
    const ne = northTop(tx + 1, 0);
    poly(g, [nw, ne, raise(ne, def.backWallH), raise(nw, def.backWallH)], wallBack);
  }

  {
    const sw0 = localFoot(0, def.h - 1);
    const nw0 = northTop(0, 0);
    const westOutS = { x: sw0.x - TILE_W * 0.48, y: sw0.y - TILE_H * 0.24 };
    const westOutN = { x: nw0.x - TILE_W * 0.48, y: nw0.y - TILE_H * 0.24 };
    const westH = def.id === 'flor' ? def.backWallH : def.backWallH;
    poly(g, [westOutS, sw0, raise(sw0, westH), raise(westOutS, westH)], 0x858585);
    poly(g, [westOutN, nw0, raise(nw0, westH), raise(westOutN, westH)], wallSide);
    poly(
      g,
      [westOutS, westOutN, raise(westOutN, westH), raise(westOutS, westH)],
      wallSide,
    );
    for (let ty = 0; ty < def.h; ty++) {
      const sw = localFoot(0, ty);
      const nw = northTop(0, ty);
      poly(g, [sw, nw, raise(nw, westH), raise(sw, westH)], wallSide);
    }
  }

  for (let ty = 0; ty < def.h; ty++) {
    const se = localFoot(def.w - 1, ty);
    const ne = northTop(def.w - 1, ty);
    poly(g, [se, ne, raise(ne, def.plinthH), raise(se, def.plinthH)], wallFront);
  }

  for (let tx = 0; tx < def.w; tx++) {
    const ty = def.h - 1;
    if (tx === def.exit.x && ty === def.exit.y) continue;
    if (tx === def.exit.x - 1 || tx === def.exit.x) continue;
    const sw = localFoot(tx, ty);
    const se = localFoot(tx + 1, ty);
    poly(g, [sw, se, raise(se, def.plinthH), raise(sw, def.plinthH)], wallFront);
  }

  drawIdentityProps(g, def);
  drawExitMat(g, def);
}

export function interiorWorldBounds(def: InteriorDef): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const push = (p: Pt) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  for (let ty = 0; ty < def.h; ty++) {
    for (let tx = 0; tx < def.w; tx++) {
      push(localFoot(tx, ty));
      push(northTop(tx, ty));
    }
  }
  push(raise(northTop(0, 0), def.backWallH));
  push(raise(northTop(def.w - 1, 0), def.backWallH));
  const sw0 = localFoot(0, def.h - 1);
  push({ x: sw0.x - TILE_W * 0.52, y: sw0.y - TILE_H * 0.28 });
  push(raise(northTop(0, 0), def.backWallH));
  push({ x: northTop(0, 0).x - TILE_W * 0.52, y: northTop(0, 0).y - TILE_H * 0.28 - def.backWallH });
  const pad = TILE_W * 0.35;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - def.backWallH - pad,
    maxY: maxY + pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + def.backWallH + pad * 2,
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

/** Screen-radius hit for exit tile + door gap (works at high zoom). */
export function interiorExitPick(
  def: InteriorDef,
  worldX: number,
  worldY: number,
  zoom: number,
): boolean {
  const tiles: { x: number; y: number }[] = [
    def.exit,
    { x: def.exit.x - 1, y: def.exit.y },
    { x: def.exit.x + 1, y: def.exit.y },
    { x: def.exit.x, y: def.exit.y - 1 },
  ];
  const r = Math.max(28, 48 / Math.max(zoom, 0.15));
  for (const t of tiles) {
    const f = tileFootWorld(t.x, t.y);
    if (Math.hypot(worldX - f.x, worldY - (f.y - TILE_H / 2)) <= r) return true;
  }
  return false;
}
