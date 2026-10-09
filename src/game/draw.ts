import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

type Pt = { x: number; y: number };

/** Tile center from south-vertex anchor (foot-local). */
const TILE_CENTER: Pt = { x: 0, y: -TILE_H / 2 };

export const TREE_TRUNK_BW = 5;
export const TREE_TRUNK_H = 20;
export const TREE_CANOPY_RX = 24;
export const TREE_CANOPY_RY = 22;
export const TREE_CANOPY_CY = -34;
export const TREE_CANOPY_OVERLAP = 8;

const TREE_CANOPY_DARK = 0x5f5f5f;
const TREE_CANOPY_MID = 0x777777;
const TREE_CANOPY_LIGHT = 0x8e8e8e;

/** Shift footprint so its centroid sits on the tile center (south vertex stays anchor). */
function centeringOffset(footprintCorners: Pt[]): Pt {
  const cx = footprintCorners.reduce((s, p) => s + p.x, 0) / footprintCorners.length;
  const cy = footprintCorners.reduce((s, p) => s + p.y, 0) / footprintCorners.length;
  return { x: TILE_CENTER.x - cx, y: TILE_CENTER.y - cy };
}

const HOUSE_FOOT: Pt[] = [
  { x: 0, y: 0 },
  { x: 48, y: -24 },
  { x: 0, y: -48 },
  { x: -48, y: -24 },
];
const HOUSE_OFFSET = centeringOffset(HOUSE_FOOT);

const DESK_FOOT: Pt[] = [
  { x: 0, y: 0 },
  { x: 24, y: -12 },
  { x: -16, y: -32 },
  { x: -40, y: -20 },
];
const DESK_OFFSET = centeringOffset(DESK_FOOT);

function ht(p: Pt, scale = 1): Pt {
  return { x: p.x * scale + HOUSE_OFFSET.x * scale, y: p.y * scale + HOUSE_OFFSET.y * scale };
}

function dt(p: Pt): Pt {
  return { x: p.x + DESK_OFFSET.x, y: p.y + DESK_OFFSET.y };
}

function poly(g: Graphics, pts: Pt[], fill: number | { color: number; alpha: number }): void {
  if (pts.length < 3) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill(fill);
}

function strokeSeg(g: Graphics, a: Pt, b: Pt, width: number, color: number): void {
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width, color });
}

function pointInTri(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const sign = (p1: Pt, p2: Pt, p3: Pt) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function pointInQuad(p: Pt, a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return pointInTri(p, a, b, c) || pointInTri(p, a, c, d);
}

/** South-top trunk y vs canopy ellipse bottom — overlap when bottomY >= trunkTopY. */
export function treeCanopyTrunkOverlap(): {
  canopyBottomY: number;
  trunkTopY: number;
  ok: boolean;
} {
  const trunkTopY = -TREE_TRUNK_H;
  const canopyBottomY = TREE_CANOPY_CY + TREE_CANOPY_RY;
  return {
    canopyBottomY,
    trunkTopY,
    ok: canopyBottomY >= trunkTopY && canopyBottomY - trunkTopY >= TREE_CANOPY_OVERLAP - 0.5,
  };
}

export function buildingInteriorGapSample(): Pt {
  return ht({ x: -18, y: -22 });
}

export function buildingFrontWallsCover(p: Pt): boolean {
  const S = ht({ x: 0, y: 0 });
  const W = ht({ x: -48, y: -24 });
  const Wp = ht({ x: -48, y: -80 });
  const Sp = ht({ x: 0, y: -56 });
  return pointInQuad(p, S, W, Wp, Sp);
}

/** Roof, gable, walls, and door — used for tap hit testing on buildings. */
export function buildingPickHit(localP: Pt, scale = 1): boolean {
  const S = ht({ x: 0, y: 0 }, scale);
  const E = ht({ x: 48, y: -24 }, scale);
  const Sp = ht({ x: 0, y: -56 }, scale);
  const Ep = ht({ x: 48, y: -80 }, scale);
  const Wp = ht({ x: -48, y: -80 }, scale);
  const R1 = ht({ x: 24, y: -104 }, scale);
  const R2 = ht({ x: -24, y: -128 }, scale);
  if (buildingFrontWallsCoverScaled(localP, scale)) return true;
  if (pointInQuad(localP, S, E, Ep, R1) || pointInQuad(localP, S, E, R1, Sp)) return true;
  if (pointInQuad(localP, Sp, R1, R2, Wp)) return true;
  if (
    pointInQuad(
      localP,
      ht({ x: 18, y: -9 }, scale),
      ht({ x: 30, y: -15 }, scale),
      ht({ x: 30, y: -39 }, scale),
      ht({ x: 18, y: -33 }, scale),
    )
  ) {
    return true;
  }
  return false;
}

function buildingFrontWallsCoverScaled(p: Pt, scale: number): boolean {
  const S = ht({ x: 0, y: 0 }, scale);
  const W = ht({ x: -48, y: -24 }, scale);
  const Wp = ht({ x: -48, y: -80 }, scale);
  const Sp = ht({ x: 0, y: -56 }, scale);
  return pointInQuad(p, S, W, Wp, Sp);
}

export function footprint(bwScale = 1): { bw: number; bh: number } {
  const bw = (TILE_W / 2) * 0.84 * bwScale;
  const bh = (TILE_H / 2) * 0.84 * bwScale;
  return { bw, bh };
}

export function tileCorners(bw: number, bh: number): { s: Pt; e: Pt; n: Pt; w: Pt } {
  return {
    s: { x: 0, y: 0 },
    e: { x: bw, y: -bh },
    n: { x: 0, y: -2 * bh },
    w: { x: -bw, y: -bh },
  };
}

/** Point on wall parallelogram (legacy QA helpers). */
export function facePoint(a: Pt, b: Pt, aT: Pt, bT: Pt, u: number, v: number): Pt {
  const lerp = (p: Pt, q: Pt, t: number) => ({
    x: p.x + (q.x - p.x) * t,
    y: p.y + (q.y - p.y) * t,
  });
  return lerp(lerp(a, b, u), lerp(aT, bT, u), v);
}

/** South vertex at local (0, 0); diamond extends upward (negative y). */
export function drawDiamond(g: Graphics, fill: number, stroke?: number): void {
  g.moveTo(0, 0);
  g.lineTo(TILE_W / 2, -TILE_H / 2);
  g.lineTo(0, -TILE_H);
  g.lineTo(-TILE_W / 2, -TILE_H / 2);
  g.closePath();
  g.fill(fill);
  if (stroke !== undefined) {
    g.stroke({ width: 1, color: stroke, alpha: 0.25 });
  }
}

export function drawBuilding(
  g: Graphics,
  hover: boolean,
  scale = 1,
  _doorFace: '+y' | '+x' = '+y',
): void {
  const left = hover ? C.buildingLeftHover : C.buildingLeft;
  const gable = hover ? C.buildingRightHover : C.buildingRight;
  const roof = hover ? C.buildingRoofNearHover : C.buildingRoofNear;
  const line = C.buildingFascia;
  const door = C.door;

  const S = ht({ x: 0, y: 0 }, scale);
  const E = ht({ x: 48, y: -24 }, scale);
  const W = ht({ x: -48, y: -24 }, scale);
  const Sp = ht({ x: 0, y: -56 }, scale);
  const Ep = ht({ x: 48, y: -80 }, scale);
  const Wp = ht({ x: -48, y: -80 }, scale);
  const R1 = ht({ x: 24, y: -104 }, scale);
  const R2 = ht({ x: -24, y: -128 }, scale);

  poly(g, [S, W, Wp, Sp], left);
  poly(g, [S, E, Ep, R1, Sp], gable);
  poly(g, [Sp, R1, R2, Wp], roof);

  strokeSeg(g, Sp, Wp, 1.5, line);
  strokeSeg(g, Sp, R1, 1.5, line);
  strokeSeg(g, R1, Ep, 1.5, line);
  strokeSeg(g, R1, R2, 1.5, line);

  poly(
    g,
    [
      ht({ x: 18, y: -9 }, scale),
      ht({ x: 30, y: -15 }, scale),
      ht({ x: 30, y: -39 }, scale),
      ht({ x: 18, y: -33 }, scale),
    ],
    door,
  );
}

export function drawObelisco(g: Graphics, hover: boolean): void {
  const slab = hover ? 0x707070 : 0x626262;
  const base = hover ? 0x585858 : 0x4a4a4a;
  poly(g, [ht({ x: -8, y: 0 }), ht({ x: 8, y: 0 }), ht({ x: 8, y: -120 }), ht({ x: -8, y: -120 })], base);
  poly(g, [ht({ x: -6, y: -8 }), ht({ x: 6, y: -8 }), ht({ x: 6, y: -112 }), ht({ x: -6, y: -112 })], slab);
  g.circle(ht({ x: 0, y: -100 }).x, ht({ x: 0, y: -100 }).y, 5);
  g.fill(0x888888);
}

/** Climbing wall (muro): L-shaped plank walls, open top with beams, hold dots on +y face. */
export function drawMuro(g: Graphics, hover: boolean): void {
  const plank = hover ? 0x7a7a7a : 0x6e6e6e;
  const plankDark = hover ? 0x656565 : 0x585858;
  const beam = hover ? 0x848484 : 0x757575;
  const hold = hover ? 0x959595 : 0x888888;

  poly(
    g,
    [ht({ x: -20, y: 0 }), ht({ x: 20, y: 0 }), ht({ x: 20, y: -52 }), ht({ x: -20, y: -52 })],
    plankDark,
  );
  poly(
    g,
    [ht({ x: -18, y: -2 }), ht({ x: 18, y: -2 }), ht({ x: 18, y: -48 }), ht({ x: -18, y: -48 })],
    plank,
  );

  poly(
    g,
    [ht({ x: -48, y: 0 }), ht({ x: -20, y: 0 }), ht({ x: -20, y: -40 }), ht({ x: -48, y: -40 })],
    plankDark,
  );
  poly(
    g,
    [ht({ x: -46, y: -2 }), ht({ x: -22, y: -2 }), ht({ x: -22, y: -36 }), ht({ x: -46, y: -36 })],
    plank,
  );

  strokeSeg(g, ht({ x: -18, y: -48 }), ht({ x: 18, y: -48 }), 3, beam);
  strokeSeg(g, ht({ x: -22, y: -36 }), ht({ x: -18, y: -48 }), 3, beam);

  for (const pt of [
    { x: -6, y: -14 },
    { x: 4, y: -22 },
    { x: -2, y: -32 },
    { x: 8, y: -38 },
  ]) {
    const p = ht(pt);
    g.circle(p.x, p.y, 3);
    g.fill(hold);
  }
}

export function drawRedoma(g: Graphics, hover: boolean): void {
  const island = hover ? 0x6a6a6a : 0x5c5c5c;
  const ring = hover ? 0x787878 : 0x686868;
  g.ellipse(0, -8, 36, 18);
  g.fill(ring);
  g.ellipse(0, -10, 22, 12);
  g.fill(island);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = Math.cos(a) * 14;
    const y1 = -10 + Math.sin(a) * 7;
    const x2 = Math.cos(a) * 28;
    const y2 = -8 + Math.sin(a) * 10;
    strokeSeg(g, { x: x1, y: y1 }, { x: x2, y: y2 }, 2, 0x808080);
  }
}

export function drawBench(g: Graphics, hover: boolean): void {
  const c = hover ? 0x8a8a8a : 0x757575;
  g.roundRect(-16, -10, 32, 8, 2);
  g.fill(c);
  g.rect(-14, -18, 4, 10);
  g.fill(c);
  g.rect(10, -18, 4, 10);
  g.fill(c);
}

export function drawLamp(g: Graphics, hover: boolean): void {
  const c = hover ? 0x909090 : 0x7a7a7a;
  g.rect(-2, -28, 4, 24);
  g.fill(c);
  g.roundRect(-6, -34, 12, 8, 2);
  g.fill(c);
}

/** 128×88 frame: top diamond aligns with walkable tiles; slab hangs 24px below south anchor. */
export function drawBorderTile(g: Graphics, kind: string): void {
  const slab = 0x565656;
  const slabDark = 0x4a4a4a;
  drawDiamond(g, C.tileLight);

  const isSe = kind.includes('borde-se') || kind.includes('esquina-s');
  const isSw = kind.includes('borde-sw') || kind.includes('esquina-s');

  if (isSe) {
    g.moveTo(0, 0);
    g.lineTo(TILE_W / 2, -TILE_H / 2);
    g.lineTo(TILE_W / 2, -TILE_H / 2 + 24);
    g.lineTo(0, 24);
    g.closePath();
    g.fill({ color: slabDark, alpha: 0.9 });
  }
  if (isSw) {
    g.moveTo(0, 0);
    g.lineTo(-TILE_W / 2, -TILE_H / 2);
    g.lineTo(-TILE_W / 2, -TILE_H / 2 + 24);
    g.lineTo(0, 24);
    g.closePath();
    g.fill({ color: slab, alpha: 0.85 });
  }
}

export function deskTopFillColor(hover: boolean): number {
  return hover ? C.propTopHover : C.propTop;
}

export function drawPropDesk(g: Graphics, hover: boolean): void {
  const right = hover ? C.propRightHover : C.propRight;
  const rightDark = hover ? 0x8a8a8a : 0x8b8b8b;
  const left = hover ? C.propLeftHover : C.propLeft;
  const topColor = deskTopFillColor(hover);

  poly(g, [dt({ x: 0, y: 0 }), dt({ x: 24, y: -12 }), dt({ x: -16, y: -32 }), dt({ x: -40, y: -20 })], {
    color: 0x000000,
    alpha: 0.15,
  });

  poly(
    g,
    [dt({ x: -36, y: -18 }), dt({ x: -12, y: -30 }), dt({ x: -12, y: -46 }), dt({ x: -36, y: -34 })],
    rightDark,
  );
  poly(g, [dt({ x: 0, y: 0 }), dt({ x: 24, y: -12 }), dt({ x: 24, y: -28 }), dt({ x: 0, y: -16 })], right);
  poly(g, [dt({ x: 0, y: 0 }), dt({ x: -4, y: -2 }), dt({ x: -4, y: -18 }), dt({ x: 0, y: -16 })], left);
  poly(g, [dt({ x: 0, y: -16 }), dt({ x: -40, y: -36 }), dt({ x: -40, y: -42 }), dt({ x: 0, y: -22 })], left);
  poly(g, [dt({ x: 0, y: -16 }), dt({ x: 24, y: -28 }), dt({ x: 24, y: -34 }), dt({ x: 0, y: -22 })], right);
  poly(
    g,
    [dt({ x: 0, y: -22 }), dt({ x: 24, y: -34 }), dt({ x: -16, y: -54 }), dt({ x: -40, y: -42 })],
    topColor,
  );
}

function drawFrontTrunk(
  g: Graphics,
  bw: number,
  bh: number,
  height: number,
  left: number,
  right: number,
): void {
  const { s, e, w } = tileCorners(bw, bh);
  const sT = { x: s.x, y: s.y - height };
  const eT = { x: e.x, y: e.y - height };
  const wT = { x: w.x, y: w.y - height };
  poly(g, [w, s, sT, wT], left);
  poly(g, [s, e, eT, sT], right);
}

export function drawPropTree(g: Graphics, hover: boolean): void {
  const left = hover ? C.propLeftHover : C.propLeft;
  const right = hover ? C.propRightHover : C.propRight;
  const dark = hover ? 0x676767 : TREE_CANOPY_DARK;
  const mid = hover ? 0x858585 : TREE_CANOPY_MID;
  const light = hover ? 0x9c9c9c : TREE_CANOPY_LIGHT;

  g.ellipse(0, -2, 20, 8);
  g.fill({ color: 0x888888, alpha: 0.2 });

  drawFrontTrunk(g, TREE_TRUNK_BW, 2.5, TREE_TRUNK_H, left, right);

  const cx = 0;
  const cy = TREE_CANOPY_CY;

  g.ellipse(cx - 6, cy, 14, 13);
  g.fill(dark);
  g.ellipse(cx + 5, cy + 2, 16, 14);
  g.fill(mid);
  g.ellipse(cx + 10, cy - 8, 12, 11);
  g.fill(light);

  g.ellipse(cx - 8, cy + 1, 14, 14);
  g.fill(dark);
  g.ellipse(cx + 6, cy + 3, 16, 15);
  g.fill(mid);
  g.ellipse(cx + 12, cy - 6, 11, 10);
  g.fill(light);
}

export function drawCharacter(
  g: Graphics,
  state: 'idle' | 'walk' | 'sprint',
): void {
  const c =
    state === 'sprint' ? C.characterSprint : state === 'walk' ? C.characterWalk : C.character;
  g.roundRect(-14, -44, 28, 44, 6);
  g.fill(c);
  g.circle(0, -52, 10);
  g.fill(c);
}
