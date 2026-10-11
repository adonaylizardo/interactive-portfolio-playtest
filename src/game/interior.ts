import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld, worldToTile } from '../iso/math';
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
    setBlocked(cells, 1, 0);
    setBlocked(cells, 2, 0);
    const tierRows: { y: number; cols: number[] }[] = [
      { y: 2, cols: [4, 5, 6] },
      { y: 3, cols: [3, 4, 5] },
      { y: 4, cols: [2, 3, 4] },
      { y: 5, cols: [2, 3] },
    ];
    for (const row of tierRows) {
      for (const x of row.cols) setBlocked(cells, x, row.y);
    }
  } else if (
    def.id === 'estudio' ||
    def.id === 'volaris' ||
    def.id === 'bain' ||
    def.id === 'mentoria' ||
    def.id === 'finoa' ||
    def.id === 'pg'
  ) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        setBlocked(cells, 1 + dx, 1 + dy);
      }
    }
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

/** NW walkable corner — both back walls meet at grid (0,0). */
const CASE_CORNER = { x: 1, y: 1, w: 2, h: 2 };
const WEST_FACE_DEPTH = TILE_W * 0.44;
/** ~1.5–2× character silhouette (~52px). */
const CASE_PROP_H = 58;

function drawCaseRug(g: Graphics, accent: number): void {
  const light = Math.min(0xffffff, accent + 0x141414);
  for (let dy = 0; dy < CASE_CORNER.h; dy++) {
    for (let dx = 0; dx < CASE_CORNER.w; dx++) {
      const tx = CASE_CORNER.x + dx;
      const ty = CASE_CORNER.y + dy;
      const pos = localFoot(tx, ty);
      g.moveTo(pos.x, pos.y);
      g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
      g.lineTo(pos.x, pos.y - TILE_H);
      g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
      g.closePath();
      g.fill((tx + ty) % 2 === 0 ? accent : light);
    }
  }
}

type CasePropKind = 'desk' | 'panel' | 'table' | 'round' | 'books' | 'display';

function drawCaseCornerProp(
  g: Graphics,
  accent: number,
  kind: CasePropKind,
  body = 0xaaaaaa,
  top = 0xbcbcbc,
): void {
  drawCaseRug(g, accent);
  const { x, y, w, h } = CASE_CORNER;
  if (kind === 'panel') {
    const wn = northTop(0, 0);
    const ws = northTop(0, 2);
    const panelH = CASE_PROP_H + 22;
    poly(
      g,
      [
        raise(wn, 12),
        raise(ws, 12),
        raise(ws, panelH),
        raise(wn, panelH),
      ],
      0x2e2e38,
    );
    poly(
      g,
      [
        raise(wn, panelH - 12),
        raise(ws, panelH - 12),
        raise(ws, panelH),
        raise(wn, panelH),
      ],
      0x484858,
    );
    drawIsoBlock(g, x, y, w, h, CASE_PROP_H, body, top);
  } else if (kind === 'display') {
    drawIsoBlock(g, x, y, w, h, CASE_PROP_H, body, top);
    const cap = localFoot(x + 1, y);
    g.moveTo(cap.x - 16, cap.y - CASE_PROP_H - 4);
    g.lineTo(cap.x + 16, cap.y - CASE_PROP_H - 4);
    g.lineTo(cap.x + 14, cap.y - CASE_PROP_H - 22);
    g.lineTo(cap.x - 14, cap.y - CASE_PROP_H - 22);
    g.closePath();
    g.fill(0xe8eef8);
    g.stroke({ width: 2, color: 0xb0b8c8 });
    for (const shelfY of [0.35, 0.55, 0.72]) {
      const sy = cap.y - CASE_PROP_H * shelfY;
      g.moveTo(cap.x - 12, sy);
      g.lineTo(cap.x + 12, sy);
      g.stroke({ width: 2, color: 0x909090 });
    }
  } else if (kind === 'round') {
    drawIsoBlock(g, x, y, w, h, CASE_PROP_H - 8, body, top);
    g.ellipse(localFoot(x + 1, y + 1).x, localFoot(x + 1, y + 1).y - CASE_PROP_H, 16, 10);
    g.fill(0x707070);
  } else if (kind === 'books') {
    drawIsoBlock(g, x, y, 2, 1, CASE_PROP_H, body, top);
    drawIsoBlock(g, x, y + 1, 1, 1, CASE_PROP_H - 16, 0x9a9088, top);
  } else if (kind === 'table') {
    drawIsoBlock(g, x, y, w, 1, CASE_PROP_H - 10, body, top);
    drawIsoBlock(g, x, y + 1, 1, 1, 22, 0x888888, 0xa0a0a0);
    drawIsoBlock(g, x + 1, y + 1, 1, 1, 22, 0x888888, 0xa0a0a0);
  } else {
    drawIsoBlock(g, x, y, w, h, CASE_PROP_H, body, top);
  }
}

function drawIdentityProps(g: Graphics, def: InteriorDef): void {
  const propLight = 0xbcbcbc;

  if (def.id === 'catedral') {
    drawIsoBlock(g, 2, 0, 4, 1, 52, 0x8a8a8a, 0xc8c8c8);
    const pewSeat = 0x4a4540;
    const pewTop = 0x7a7268;
    for (let row = 2; row <= 5; row++) {
      for (const col of [1, 2, 5, 6]) {
        const h = 20 + (5 - row) * 2;
        drawIsoBlock(g, col, row, 1, 1, h, pewSeat, pewTop);
      }
    }
    drawIsoBlock(g, 3, 1, 1, 1, 18, pewSeat, pewTop);
    drawIsoBlock(g, 4, 1, 1, 1, 18, pewSeat, pewTop);
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
    const screenH = def.backWallH - 4;
    const wn = northTop(0, 0);
    const ws = northTop(0, 2);
    poly(g, [raise(wn, 20), raise(ws, 20), raise(ws, screenH), raise(wn, screenH)], 0x2a2a34);
    poly(
      g,
      [raise(wn, screenH - 14), raise(ws, screenH - 14), raise(ws, screenH), raise(wn, screenH)],
      0x444455,
    );
    drawIsoBlock(g, 1, 1, 2, 2, 28, 0x585858, 0x787878);
    drawIsoBlock(g, 1, 0, 2, 1, 44, 0x454545, 0x656565);
    const tierRows: { y: number; h: number; cols: number[] }[] = [
      { y: 5, h: 12, cols: [2, 3] },
      { y: 4, h: 18, cols: [2, 3, 4] },
      { y: 3, h: 24, cols: [3, 4, 5] },
      { y: 2, h: 30, cols: [4, 5, 6] },
    ];
    for (const row of tierRows) {
      for (const x of row.cols) {
        drawIsoBlock(g, x, row.y, 1, 1, row.h, 0x656565, 0x909090);
      }
    }
  } else if (def.id === 'estudio') {
    drawCaseCornerProp(g, 0x8a7868, 'desk', 0x9a8a7a, propLight);
  } else if (def.id === 'volaris') {
    drawCaseCornerProp(g, 0x5a88b8, 'panel', 0x8a9098, propLight);
  } else if (def.id === 'bain') {
    drawCaseCornerProp(g, 0x787878, 'round', 0x888888, propLight);
  } else if (def.id === 'mentoria') {
    drawCaseCornerProp(g, 0x8a8070, 'books', 0x8a8478, 0xb0a898);
  } else if (def.id === 'finoa') {
    drawCaseCornerProp(g, 0x6a9080, 'table', 0x7a9080, 0x9ab0a0);
  } else if (def.id === 'pg') {
    drawCaseCornerProp(g, 0x989898, 'display', 0x909090, propLight);
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
  g.fill(0xe4e2dc);
  g.moveTo(pos.x, pos.y);
  g.lineTo(pos.x + TILE_W / 2, pos.y - TILE_H / 2);
  g.lineTo(pos.x, pos.y - TILE_H);
  g.lineTo(pos.x - TILE_W / 2, pos.y - TILE_H / 2);
  g.closePath();
  g.stroke({ width: 2, color: 0xc8c4bc });
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

  for (let ty = 0; ty < def.h; ty++) {
    const sw = localFoot(0, ty);
    const nw = northTop(0, ty);
    const swOut = { x: sw.x - WEST_FACE_DEPTH * 0.52, y: sw.y + TILE_H * 0.06 };
    const nwOut = { x: nw.x - WEST_FACE_DEPTH * 0.52, y: nw.y + TILE_H * 0.06 };
    poly(g, [swOut, nwOut, raise(nwOut, def.backWallH), raise(swOut, def.backWallH)], wallSide);
    poly(g, [sw, nw, raise(nw, def.backWallH), raise(sw, def.backWallH)], 0x858585);
  }
  {
    const nw0 = northTop(0, 0);
    const nwOut0 = { x: nw0.x - WEST_FACE_DEPTH * 0.52, y: nw0.y + TILE_H * 0.06 };
    poly(
      g,
      [nwOut0, nw0, raise(nw0, def.backWallH), raise(nwOut0, def.backWallH)],
      0x828282,
    );
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
  push(raise(localFoot(0, def.h - 1), def.backWallH));
  {
    const nw0 = northTop(0, 0);
    push({ x: nw0.x - WEST_FACE_DEPTH * 0.55, y: nw0.y - def.backWallH });
    const sw0 = localFoot(0, def.h - 1);
    push({ x: sw0.x - WEST_FACE_DEPTH * 0.55, y: sw0.y });
  }
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

/** Exit mat / doorway — generous so real clicks on the cream tile always exit. */
export function interiorHitExit(
  def: InteriorDef,
  worldX: number,
  worldY: number,
  zoom: number,
): boolean {
  const f = tileFootWorld(def.exit.x, def.exit.y);
  const cx = f.x;
  const cy = f.y - TILE_H * 0.38;
  const r = Math.max(28, 52 / Math.max(zoom, 0.25));
  if (Math.hypot(worldX - cx, worldY - cy) <= r) return true;
  const tile = worldToTile(worldX, worldY);
  if (!tile) return false;
  if (tile.x === def.exit.x && tile.y === def.exit.y) return true;
  if (tile.y === def.exit.y && Math.abs(tile.x - def.exit.x) === 1) return true;
  return false;
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

/** Tiles covered by drawIdentityProps (must match every blocked tile). */
export function interiorRenderedPropTiles(def: InteriorDef): { x: number; y: number }[] {
  const keys = new Set<string>();
  const mark = (x: number, y: number, w = 1, h = 1) => {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) keys.add(tileKey(x + dx, y + dy));
    }
  };
  if (def.id === 'catedral') {
    mark(2, 0, 4, 1);
    for (let row = 2; row <= 5; row++) {
      for (const col of [1, 2, 5, 6]) mark(col, row);
    }
    mark(3, 1);
    mark(4, 1);
  } else if (def.id === 'sambil') {
    for (let y = 1; y < def.h - 1; y++) {
      for (let x = 5; x < def.w - 1; x++) {
        if (y !== 4) mark(x, y);
      }
    }
  } else if (def.id === 'flor') {
    for (let y = 0; y <= 2; y++) {
      mark(0, y);
      mark(1, y);
    }
    mark(1, 0);
    mark(2, 0);
    const tiers: { y: number; cols: number[] }[] = [
      { y: 2, cols: [4, 5, 6] },
      { y: 3, cols: [3, 4, 5] },
      { y: 4, cols: [2, 3, 4] },
      { y: 5, cols: [2, 3] },
    ];
    for (const row of tiers) for (const x of row.cols) mark(x, row.y);
    mark(1, 1, 2, 2);
    mark(1, 0, 2, 1);
  } else if (
    def.id === 'estudio' ||
    def.id === 'volaris' ||
    def.id === 'bain' ||
    def.id === 'mentoria' ||
    def.id === 'finoa' ||
    def.id === 'pg'
  ) {
    mark(CASE_CORNER.x, CASE_CORNER.y, CASE_CORNER.w, CASE_CORNER.h);
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

/** Tile one step inward from spawn (typical “tap ahead” probe). */
export function interiorForwardTile(def: InteriorDef): { x: number; y: number } {
  return { x: def.spawn.x, y: Math.max(0, def.spawn.y - 1) };
}
