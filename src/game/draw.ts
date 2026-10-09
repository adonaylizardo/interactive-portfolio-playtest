import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { tileFootWorld } from '../iso/math';
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

const DESK_FOOT: Pt[] = [
  { x: 0, y: 0 },
  { x: 24, y: -12 },
  { x: -16, y: -32 },
  { x: -40, y: -20 },
];
const DESK_OFFSET = centeringOffset(DESK_FOOT);

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

export type FootprintDrawSpec = {
  fx: number;
  fy: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  doorFace: '+y' | '+x';
  door: { x: number; y: number };
  kind: string;
};

function localFoot(ax: number, ay: number, tx: number, ty: number): Pt {
  const a = tileFootWorld(ax, ay);
  const f = tileFootWorld(tx, ty);
  return { x: f.x - a.x, y: f.y - a.y };
}

function northTop(ax: number, ay: number, tx: number, ty: number): Pt {
  const f = localFoot(ax, ay, tx, ty);
  return { x: f.x, y: f.y - TILE_H };
}

function raise(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function wallHeightForKind(kind: string, w: number, h: number): number {
  if (kind === 'estudio') return 46;
  if (kind === 'sambil') return 58;
  if (kind === 'catedral') return 88;
  if (kind === 'flor') return 50;
  if (w >= 6 || h >= 6) return 46;
  return 72;
}

function footprintCorners(spec: FootprintDrawSpec): { sw: Pt; se: Pt; nw: Pt; ne: Pt } {
  const { fx, fy, w, h, ax, ay } = spec;
  return {
    sw: localFoot(ax, ay, fx, fy + h - 1),
    se: localFoot(ax, ay, fx + w - 1, fy + h - 1),
    nw: northTop(ax, ay, fx, fy),
    ne: northTop(ax, ay, fx + w - 1, fy),
  };
}

export function doorCenterLocal(spec: FootprintDrawSpec): Pt {
  const { sw, se, ne } = footprintCorners(spec);
  const wallH = wallHeightForKind(spec.kind, spec.w, spec.h);
  const doorH = Math.min(34, wallH * 0.45);
  if (spec.doorFace === '+y') {
    const u = spec.w <= 1 ? 0.5 : (spec.door.x - spec.fx) / (spec.w - 1);
    const base = lerpPt(sw, se, Math.min(1, Math.max(0, u)));
    return { x: base.x, y: base.y - doorH * 0.55 };
  }
  const v = spec.h <= 1 ? 0.5 : (spec.door.y - spec.fy) / (spec.h - 1);
  const base = lerpPt(se, ne, Math.min(1, Math.max(0, v)));
  return { x: base.x, y: base.y - doorH * 0.55 };
}

const ESTUDIO_SPEC: FootprintDrawSpec = {
  fx: 28,
  fy: 30,
  w: 6,
  h: 6,
  ax: 31,
  ay: 35,
  doorFace: '+y',
  door: { x: 31, y: 36 },
  kind: 'estudio',
};

export function buildingInteriorGapSample(): Pt {
  const { sw, se } = footprintCorners(ESTUDIO_SPEC);
  const wallH = wallHeightForKind('estudio', 6, 6);
  const mid = lerpPt(sw, se, 0.38);
  return { x: mid.x - 10, y: mid.y - wallH * 0.38 };
}

export function buildingFrontWallsCover(p: Pt): boolean {
  const { sw, se, nw } = footprintCorners(ESTUDIO_SPEC);
  const wallH = wallHeightForKind('estudio', 6, 6);
  return (
    pointInQuad(p, sw, nw, raise(nw, wallH), raise(sw, wallH)) ||
    pointInQuad(p, sw, se, raise(se, wallH), raise(sw, wallH))
  );
}

/** Walls, roof, and door — tap hit testing on footprint buildings. */
export function buildingPickHit(localP: Pt, spec: FootprintDrawSpec): boolean {
  const { sw, se, nw, ne } = footprintCorners(spec);
  const wallH = wallHeightForKind(spec.kind, spec.w, spec.h);
  const faces = [
    [sw, nw, raise(nw, wallH), raise(sw, wallH)],
    [sw, se, raise(se, wallH), raise(sw, wallH)],
    [se, ne, raise(ne, wallH), raise(se, wallH)],
    [raise(sw, wallH), raise(se, wallH), raise(ne, wallH), raise(nw, wallH)],
  ] as Pt[][];
  for (const f of faces) {
    if (pointInQuad(localP, f[0], f[1], f[2], f[3])) return true;
  }
  const dc = doorCenterLocal(spec);
  if (Math.abs(localP.x - dc.x) < 14 && Math.abs(localP.y - dc.y) < 22) return true;
  return false;
}

/** Door-only hit — checked before roof/walls so low-zoom taps stay deterministic. */
export function buildingDoorPickHit(localP: Pt, spec: FootprintDrawSpec): boolean {
  if (buildingDoorOpeningPickHit(localP, spec)) return true;
  const dc = doorCenterLocal(spec);
  return Math.abs(localP.x - dc.x) < 20 && Math.abs(localP.y - dc.y) < 32;
}

/** Drawn door opening on the front face (+y or +x) — zoom-invariant (foot-local coords). */
export function buildingDoorOpeningPickHit(localP: Pt, spec: FootprintDrawSpec): boolean {
  const { sw, se, ne } = footprintCorners(spec);
  const wallH = wallHeightForKind(spec.kind, spec.w, spec.h);
  const doorH = Math.min(34, wallH * 0.45);
  const doorFoot = localFoot(spec.ax, spec.ay, spec.door.x, spec.door.y);
  const doorGround = { x: doorFoot.x, y: doorFoot.y - TILE_H / 2 };
  if (Math.hypot(localP.x - doorGround.x, localP.y - doorGround.y) < TILE_W * 0.52) {
    return true;
  }

  if (spec.doorFace === '+y') {
    const u = spec.w <= 1 ? 0.5 : (spec.door.x - spec.fx) / (spec.w - 1);
    const u0 = Math.max(0, u - 0.22);
    const u1 = Math.min(1, u + 0.22);
    const a = lerpPt(sw, se, u0);
    const b = lerpPt(sw, se, u1);
    const aTop = raise(a, wallH);
    const bTop = raise(b, wallH);
    const aMid = lerpPt(a, aTop, doorH / wallH);
    const bMid = lerpPt(b, bTop, doorH / wallH);
    if (pointInQuad(localP, a, b, bMid, aMid)) return true;
    if (pointInQuad(localP, aMid, bMid, bTop, aTop)) return true;
  } else {
    const v = spec.h <= 1 ? 0.5 : (spec.door.y - spec.fy) / (spec.h - 1);
    const v0 = Math.max(0, v - 0.22);
    const v1 = Math.min(1, v + 0.22);
    const a = lerpPt(se, ne, v0);
    const b = lerpPt(se, ne, v1);
    const aTop = raise(a, wallH);
    const bTop = raise(b, wallH);
    const aMid = lerpPt(a, aTop, doorH / wallH);
    const bMid = lerpPt(b, bTop, doorH / wallH);
    if (pointInQuad(localP, a, b, bMid, aMid)) return true;
    if (pointInQuad(localP, aMid, bMid, bTop, aTop)) return true;
  }
  return false;
}

/** World-local point used for QA / synthetic door taps (ground in front of opening). */
export function doorTapLocalPoint(spec: FootprintDrawSpec): Pt {
  const doorFoot = localFoot(spec.ax, spec.ay, spec.door.x, spec.door.y);
  const { sw, se } = footprintCorners(spec);
  const u = spec.w <= 1 ? 0.5 : (spec.door.x - spec.fx) / (spec.w - 1);
  const mouth = lerpPt(sw, se, u);
  return {
    x: (doorFoot.x + mouth.x) / 2,
    y: Math.min(doorFoot.y - TILE_H / 2, mouth.y + 6),
  };
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

function drawDoorOnFace(
  g: Graphics,
  a: Pt,
  b: Pt,
  aTop: Pt,
  bTop: Pt,
  u: number,
  fill: number,
): void {
  const w = 14;
  const h = 28;
  const c = lerpPt(lerpPt(a, b, u), lerpPt(aTop, bTop, u), 0.5);
  poly(
    g,
    [
      { x: c.x - w / 2, y: c.y - h / 2 },
      { x: c.x + w / 2, y: c.y - h / 2 - 4 },
      { x: c.x + w / 2, y: c.y + h / 2 - 4 },
      { x: c.x - w / 2, y: c.y + h / 2 },
    ],
    fill,
  );
}

export function drawFootprintBuilding(g: Graphics, hover: boolean, spec: FootprintDrawSpec): void {
  const left = hover ? C.buildingLeftHover : C.buildingLeft;
  const gable = hover ? C.buildingRightHover : C.buildingRight;
  const roof = hover ? C.buildingRoofNearHover : C.buildingRoofNear;
  const line = C.buildingFascia;
  const door = C.door;

  const { sw, se, nw, ne } = footprintCorners(spec);
  const wallH = wallHeightForKind(spec.kind, spec.w, spec.h);

  poly(g, [sw, nw, raise(nw, wallH), raise(sw, wallH)], left);
  poly(g, [sw, se, raise(se, wallH), raise(sw, wallH)], gable);
  poly(g, [se, ne, raise(ne, wallH), raise(se, wallH)], gable);
  poly(g, [raise(sw, wallH), raise(se, wallH), raise(ne, wallH), raise(nw, wallH)], roof);

  strokeSeg(g, raise(sw, wallH), raise(se, wallH), 1.5, line);
  strokeSeg(g, raise(se, wallH), raise(ne, wallH), 1.5, line);
  strokeSeg(g, raise(ne, wallH), raise(nw, wallH), 1.5, line);
  strokeSeg(g, raise(nw, wallH), raise(sw, wallH), 1.5, line);

  if (spec.doorFace === '+y') {
    const u = spec.w <= 1 ? 0.5 : (spec.door.x - spec.fx) / (spec.w - 1);
    drawDoorOnFace(g, sw, se, raise(sw, wallH), raise(se, wallH), u, door);
  } else {
    const v = spec.h <= 1 ? 0.5 : (spec.door.y - spec.fy) / (spec.h - 1);
    drawDoorOnFace(g, se, ne, raise(se, wallH), raise(ne, wallH), v, door);
  }

  if (spec.kind === 'catedral') {
    drawGroundTower(g, sw, left, gable, 112);
    drawGroundTower(g, se, gable, left, 112);
  }
}

function drawGroundTower(
  g: Graphics,
  southFoot: Pt,
  faceLeft: number,
  faceRight: number,
  height: number,
): void {
  const tw = (TILE_W / 2) * 0.4;
  const depth = (TILE_H / 2) * 0.4;
  const se = { x: southFoot.x + tw, y: southFoot.y - tw * 0.5 };
  const nw = { x: southFoot.x - tw * 0.5, y: southFoot.y - depth };
  const ne = { x: southFoot.x + tw * 0.5, y: southFoot.y - depth };
  poly(g, [southFoot, se, raise(se, height), raise(southFoot, height)], faceRight);
  poly(g, [southFoot, nw, raise(nw, height), raise(southFoot, height)], faceLeft);
  poly(g, [raise(southFoot, height), raise(se, height), raise(ne, height), raise(nw, height)], faceLeft);
  poly(
    g,
    [
      raise(se, height),
      raise(ne, height),
      { x: ne.x, y: raise(ne, height).y - 5 },
      { x: se.x, y: raise(se, height).y - 5 },
    ],
    faceRight,
  );
}

/** Tallest landmark — thin slab ~1.1×0.3 tiles, wide face toward +y. */
export function drawObelisco(
  g: Graphics,
  hover: boolean,
  fx = 14,
  fy = 35,
  w = 3,
  h = 3,
  ax = 15,
  ay = 37,
): void {
  const faceLeft = hover ? C.buildingLeftHover : C.buildingLeft;
  const faceRight = hover ? C.buildingRightHover : C.buildingRight;
  const cap = hover ? 0x757575 : 0x686868;
  const cx = localFoot(ax, ay, fx + Math.floor(w / 2), fy + Math.floor(h / 2));
  const halfW = (TILE_W / 2) * 0.55;
  const depth = (TILE_H / 2) * 0.55;
  const height = 138;
  const taper = 0.88;
  const sw = { x: cx.x - halfW * 0.5, y: cx.y + depth * 0.5 };
  const se = { x: cx.x + halfW * 0.5, y: cx.y + depth * 0.5 };
  const ne = { x: cx.x + halfW * 0.5, y: cx.y - depth * 0.5 };
  const nw = { x: cx.x - halfW * 0.5, y: cx.y - depth * 0.5 };
  const midH = height * 0.72;
  const topH = height;
  const swT = lerpPt(sw, cx, 1 - taper);
  const seT = lerpPt(se, cx, 1 - taper);
  const neT = lerpPt(ne, cx, 1 - taper);
  const nwT = lerpPt(nw, cx, 1 - taper);
  poly(g, [sw, se, raise(se, midH), raise(sw, midH)], faceRight);
  poly(g, [se, ne, raise(ne, midH), raise(se, midH)], faceRight);
  poly(g, [sw, nw, raise(nw, midH), raise(sw, midH)], faceLeft);
  poly(g, [raise(sw, midH), raise(se, midH), raise(seT, topH), raise(swT, topH)], faceRight);
  poly(g, [raise(se, midH), raise(ne, midH), raise(neT, topH), raise(seT, topH)], faceRight);
  poly(g, [raise(sw, midH), raise(nw, midH), raise(nwT, topH), raise(swT, topH)], faceLeft);
  poly(g, [raise(swT, topH), raise(seT, topH), raise(neT, topH), raise(nwT, topH)], cap);
  poly(
    g,
    [
      raise(swT, topH),
      raise(seT, topH),
      { x: cx.x, y: raise(swT, topH).y - 10 },
    ],
    cap,
  );
}

/** Thin iso L wall (Chroma frame 320×224, anchor south +32px front extent). */
export function drawMuro(
  g: Graphics,
  hover: boolean,
  fx = 35,
  fy = 40,
  w = 3,
  h = 2,
  ax = 36,
  ay = 41,
): void {
  const plank = hover ? 0x7a7a7a : 0x6e6e6e;
  const plankDark = hover ? 0x656565 : 0x585858;
  const hold = hover ? 0x959595 : 0x888888;
  const wallH = 40;
  const inset = 0.14;

  const backInnerL = lerpPt(northTop(ax, ay, fx, fy), localFoot(ax, ay, fx, fy), inset);
  const backInnerR = lerpPt(
    northTop(ax, ay, fx + w - 1, fy),
    localFoot(ax, ay, fx + w - 1, fy),
    inset,
  );
  poly(g, [backInnerL, backInnerR, raise(backInnerR, wallH), raise(backInnerL, wallH)], plank);
  poly(
    g,
    [raise(backInnerL, wallH), raise(backInnerR, wallH), raise(backInnerR, wallH + 1), raise(backInnerL, wallH + 1)],
    plankDark,
  );

  const leftInnerA = lerpPt(northTop(ax, ay, fx, fy), localFoot(ax, ay, fx, fy), inset);
  const leftInnerB = lerpPt(
    northTop(ax, ay, fx, fy + h - 1),
    localFoot(ax, ay, fx, fy + h - 1),
    inset,
  );
  const leftOuterA = localFoot(ax, ay, fx, fy);
  const leftOuterB = localFoot(ax, ay, fx, fy + h - 1);
  poly(
    g,
    [leftOuterA, leftOuterB, raise(leftInnerB, wallH), raise(leftInnerA, wallH)],
    plankDark,
  );
  poly(
    g,
    [leftInnerA, leftInnerB, raise(leftInnerB, wallH), raise(leftInnerA, wallH)],
    plank,
  );
  poly(
    g,
    [raise(leftInnerA, wallH), raise(leftInnerB, wallH), raise(leftInnerB, wallH + 1), raise(leftInnerA, wallH + 1)],
    plankDark,
  );

  const corner = lerpPt(leftInnerA, backInnerL, 0.5);
  poly(
    g,
    [corner, backInnerL, raise(backInnerL, wallH), raise(corner, wallH * 0.85)],
    plankDark,
  );

  for (const [u, v] of [
    [0.25, 0.35],
    [0.55, 0.5],
    [0.8, 0.28],
  ] as const) {
    const p = {
      x: backInnerL.x + (backInnerR.x - backInnerL.x) * u,
      y: backInnerL.y + (backInnerR.y - backInnerL.y) * u - wallH * v,
    };
    g.circle(p.x, p.y, 3);
    g.fill(hold);
  }
  for (const [u, v] of [
    [0.35, 0.4],
    [0.65, 0.55],
  ] as const) {
    const p = {
      x: leftInnerA.x + (leftInnerB.x - leftInnerA.x) * u,
      y: leftInnerA.y + (leftInnerB.y - leftInnerA.y) * u - wallH * v,
    };
    g.circle(p.x, p.y, 3);
    g.fill(hold);
  }

  g.moveTo(-8, 32);
  g.lineTo(8, 32);
  g.stroke({ width: 1, color: 0x666666, alpha: 0.25 });
}

export function drawRedoma(
  g: Graphics,
  hover: boolean,
  fx = 45,
  fy = 35,
  w = 3,
  h = 3,
  ax = 46,
  ay = 37,
): void {
  const island = hover ? 0x6a6a6a : 0x5c5c5c;
  const ring = hover ? 0x787878 : 0x686868;
  const cx = localFoot(ax, ay, fx + Math.floor(w / 2), fy + Math.floor(h / 2));
  const discRx = (TILE_W / 2) * 0.6;
  const discRy = (TILE_H / 2) * 0.6;
  g.ellipse(cx.x, cx.y - TILE_H / 2, discRx, discRy);
  g.fill(ring);
  g.ellipse(cx.x, cx.y - TILE_H / 2, discRx * 0.22, discRy * 0.22);
  g.fill(0x4a4a4a);
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x1 = cx.x + Math.cos(a) * discRx * 0.35;
    const y1 = cx.y - TILE_H / 2 + Math.sin(a) * discRy * 0.35;
    const x2 = cx.x + Math.cos(a) * discRx * 0.92;
    const y2 = cx.y - TILE_H / 2 + Math.sin(a) * discRy * 0.92;
    strokeSeg(g, { x: x1, y: y1 }, { x: x2, y: y2 }, 2, island);
  }
  g.ellipse(cx.x, cx.y - TILE_H / 2, discRx * 0.55, discRy * 0.55);
  g.fill({ color: island, alpha: 0.35 });
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
