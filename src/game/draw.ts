import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

type Pt = { x: number; y: number };

const FOOT_INSET = 0.84;
const BUILDING_WALL_H = TILE_H * 1.12;
const BUILDING_RIDGE_RISE = 28;

export function footprint(bwScale = 1): { bw: number; bh: number } {
  const bw = (TILE_W / 2) * FOOT_INSET * bwScale;
  const bh = (TILE_H / 2) * FOOT_INSET * bwScale;
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

export function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function off(p: Pt, dx: number, dy: number): Pt {
  return { x: p.x + dx, y: p.y + dy };
}

function quad(g: Graphics, a: Pt, b: Pt, c: Pt, d: Pt): void {
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineTo(d.x, d.y);
  g.closePath();
}

function tri(g: Graphics, a: Pt, b: Pt, c: Pt, fill: number): void {
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.closePath();
  g.fill(fill);
}

/** Point on wall parallelogram (u along ground a→b, v from ground to top). */
export function facePoint(a: Pt, b: Pt, aT: Pt, bT: Pt, u: number, v: number): Pt {
  return lerp(lerp(a, b, u), lerp(aT, bT, u), v);
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

type WallColors = { left: number; right: number; top: number };

export const TREE_TRUNK_H = TILE_H * 0.5;
export const TREE_TRUNK_BW = 11;
export const TREE_CANOPY_OVERLAP = 16;
export const TREE_CANOPY_LIFT = TREE_TRUNK_H - TREE_CANOPY_OVERLAP;
export const TREE_TIER1_H = TILE_H * 0.14;
export const TREE_TIER2_H = TILE_H * 0.17;

/** South-top trunk y vs south canopy ground y — overlap when canopyBottomY >= trunkTopY. */
export function treeCanopyTrunkOverlap(): {
  canopyBottomY: number;
  trunkTopY: number;
  ok: boolean;
} {
  const trunkTopY = -TREE_TRUNK_H;
  const canopyBottomY = -TREE_CANOPY_LIFT;
  return {
    canopyBottomY,
    trunkTopY,
    ok: canopyBottomY >= trunkTopY,
  };
}

/** Front-left + front-right walls only (no back faces). */
function drawFrontWalls(g: Graphics, bw: number, bh: number, height: number, colors: WallColors, groundDy = 0): WallCorners {
  const { s, e, n, w } = tileCorners(bw, bh);
  const S = off(s, 0, groundDy);
  const E = off(e, 0, groundDy);
  const W = off(w, 0, groundDy);
  const sT = lift(S, height);
  const eT = lift(E, height);
  const wT = lift(W, height);
  const nT = lift(off(n, 0, groundDy), height);

  quad(g, W, S, sT, wT);
  g.fill(colors.left);
  quad(g, S, E, eT, sT);
  g.fill(colors.right);

  return { s: S, e: E, n: off(n, 0, groundDy), w: W, sT, eT, wT, nT };
}

type WallCorners = { s: Pt; e: Pt; n: Pt; w: Pt; sT: Pt; eT: Pt; wT: Pt; nT: Pt };

/** Hip roof: eaves at wall tops, ridge `ridgeRise` px above eave center — no flat lid. */
function drawFrontHipRoof(
  g: Graphics,
  wT: Pt,
  sT: Pt,
  eT: Pt,
  nT: Pt,
  leftTone: number,
  rightTone: number,
  ridgeRise: number,
): void {
  const peak: Pt = { x: 0, y: (sT.y + nT.y) / 2 - ridgeRise };
  tri(g, wT, sT, peak, leftTone);
  tri(g, sT, eT, peak, rightTone);
}

function drawFlatTop(g: Graphics, wT: Pt, sT: Pt, eT: Pt, nT: Pt, fill: number): void {
  quad(g, wT, sT, eT, nT);
  g.fill(fill);
}

/** Sample between front walls near the ground — must hit wall fill, not open tile. */
export function buildingInteriorGapSample(_height = BUILDING_WALL_H): Pt {
  const { bw, bh } = footprint(1);
  const { s, w } = tileCorners(bw, bh);
  const mid = lerp(w, s, 0.5);
  return { x: mid.x * 0.92, y: mid.y * 0.92 - 5 };
}

export function buildingFrontWallsCover(p: Pt, height = BUILDING_WALL_H): boolean {
  const { bw, bh } = footprint(1);
  const { s, e, w } = tileCorners(bw, bh);
  const sT = lift(s, height);
  const eT = lift(e, height);
  const wT = lift(w, height);
  return pointInQuad(p, w, s, sT, wT) || pointInQuad(p, s, e, eT, sT);
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

export function drawBuilding(g: Graphics, hover: boolean): void {
  const { bw, bh } = footprint(1);
  const left = hover ? C.buildingLeftHover : C.buildingLeft;
  const right = hover ? C.buildingRightHover : C.buildingRight;
  const roofL = hover ? C.buildingRoofHover : C.buildingRoof;
  const roofR = hover ? C.buildingRoofPeakHover : C.buildingRoofPeak;

  const walls = drawFrontWalls(g, bw, bh, BUILDING_WALL_H, { left, right, top: 0 });
  drawFrontHipRoof(g, walls.wT, walls.sT, walls.eT, walls.nT, roofL, roofR, BUILDING_RIDGE_RISE);

  const doorH = 0.52;
  quad(
    g,
    facePoint(walls.s, walls.e, walls.sT, walls.eT, 0.55, 0),
    facePoint(walls.s, walls.e, walls.sT, walls.eT, 0.78, 0),
    facePoint(walls.s, walls.e, walls.sT, walls.eT, 0.78, doorH),
    facePoint(walls.s, walls.e, walls.sT, walls.eT, 0.55, doorH),
  );
  g.fill(C.door);
}

export function deskTopFillColor(hover: boolean): number {
  return hover ? C.propTopHover : C.propTop;
}

export function drawPropDesk(g: Graphics, hover: boolean): void {
  const { bw, bh } = footprint(0.52);
  const legH = TILE_H * 0.3;
  const slabT = 7;
  const left = hover ? C.propLeftHover : C.propLeft;
  const right = hover ? C.propRightHover : C.propRight;
  const topColor = deskTopFillColor(hover);
  const { s, e, n, w } = tileCorners(bw, bh);

  const legAt = (corner: Pt, toward: Pt, color: number) => {
    const inset = lerp(corner, toward, 0.14);
    const c2 = lerp(corner, toward, 0.02);
    const iT = lift(inset, legH);
    const cT = lift(c2, legH);
    quad(g, corner, c2, cT, iT);
    g.fill(color);
  };

  legAt(s, e, right);
  legAt(s, w, left);
  legAt(e, n, right);
  legAt(w, n, left);

  const sT = lift(s, legH);
  const eT = lift(e, legH);
  const wT = lift(w, legH);
  const sTop = lift(s, legH + slabT);
  const eTop = lift(e, legH + slabT);
  const wTop = lift(w, legH + slabT);
  const nTop = lift(n, legH + slabT);

  quad(g, wT, sT, sTop, wTop);
  g.fill(left);
  quad(g, sT, eT, eTop, sTop);
  g.fill(right);

  drawFlatTop(g, wTop, sTop, eTop, nTop, topColor);
}

function drawTreeCanopyTier(
  g: Graphics,
  bwScale: number,
  tierH: number,
  groundDy: number,
  colors: WallColors,
  withTop: boolean,
): number {
  const { bw, bh } = footprint(bwScale);
  const tier = drawFrontWalls(g, bw, bh, tierH, colors, groundDy);
  if (withTop) {
    drawFlatTop(g, tier.wT, tier.sT, tier.eT, tier.nT, colors.top);
  }
  return tierH;
}

export function drawPropTree(g: Graphics, hover: boolean): void {
  const left = hover ? C.propLeftHover : C.propLeft;
  const right = hover ? C.propRightHover : C.propRight;
  const top = hover ? C.buildingTopHover : C.buildingTop;

  g.ellipse(0, -5, 38, 12);
  g.fill({ color: 0x888888, alpha: 0.14 });

  const trunkBh = 5;
  drawFrontWalls(g, TREE_TRUNK_BW, trunkBh, TREE_TRUNK_H, { left, right, top });

  const tierColors = { left, right, top };
  const lift1 = -TREE_CANOPY_LIFT;
  drawTreeCanopyTier(g, 0.46, TREE_TIER1_H, lift1, tierColors, false);
  const lift2 = lift1 - TREE_TIER1_H;
  drawTreeCanopyTier(g, 0.32, TREE_TIER2_H, lift2, tierColors, true);
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
