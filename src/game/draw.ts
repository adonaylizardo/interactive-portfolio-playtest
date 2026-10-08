import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

type Pt = { x: number; y: number };

const FOOT_INSET = 0.84;

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

/** Point on the front-right wall (u along ground s→e, v from ground to top). */
export function facePoint(s: Pt, e: Pt, sT: Pt, eT: Pt, u: number, v: number): Pt {
  return lerp(lerp(s, e, u), lerp(sT, eT, u), v);
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

type IsoFaceColors = {
  left: number;
  right: number;
  top: number;
  roofLeft?: number;
  roofRight?: number;
};

type RoofStyle = 'flat' | 'hip';

type WallCorners = { s: Pt; e: Pt; sT: Pt; eT: Pt };

/** Visible faces only: front-left w→s, front-right s→e, then roof. */
function drawVisibleIsoBox(
  g: Graphics,
  bw: number,
  bh: number,
  height: number,
  colors: IsoFaceColors,
  roof: RoofStyle,
  roofPitch = 22,
  groundDy = 0,
): WallCorners {
  const { s, e, n, w } = tileCorners(bw, bh);
  const S = off(s, 0, groundDy);
  const E = off(e, 0, groundDy);
  const W = off(w, 0, groundDy);
  const N = off(n, 0, groundDy);
  const sT = lift(S, height);
  const eT = lift(E, height);
  const wT = lift(W, height);
  const nT = lift(N, height);

  quad(g, W, S, sT, wT);
  g.fill(colors.left);

  quad(g, S, E, eT, sT);
  g.fill(colors.right);

  if (roof === 'flat') {
    quad(g, wT, sT, eT, nT);
    g.fill(colors.top);
  } else {
    const pitch = Math.min(roofPitch, height * 0.28);
    const peak: Pt = { x: 0, y: (sT.y + nT.y) / 2 - pitch };
    const roofL = colors.roofLeft ?? colors.left;
    const roofR = colors.roofRight ?? colors.right;
    g.moveTo(wT.x, wT.y);
    g.lineTo(sT.x, sT.y);
    g.lineTo(peak.x, peak.y);
    g.closePath();
    g.fill(roofL);
    g.moveTo(sT.x, sT.y);
    g.lineTo(eT.x, eT.y);
    g.lineTo(peak.x, peak.y);
    g.closePath();
    g.fill(roofR);
  }

  return { s: S, e: E, sT, eT };
}

/** Sample between front walls near the ground — must hit wall fill, not open tile. */
export function buildingInteriorGapSample(_height = TILE_H * 1.12): Pt {
  const { bw, bh } = footprint(1);
  const { s, w } = tileCorners(bw, bh);
  const mid = lerp(w, s, 0.5);
  return { x: mid.x * 0.92, y: mid.y * 0.92 - 5 };
}

export function buildingFrontWallsCover(p: Pt, height = TILE_H * 1.12): boolean {
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
  const height = TILE_H * 1.12;
  const { s, e, sT, eT } = drawVisibleIsoBox(
    g,
    bw,
    bh,
    height,
    {
      left: hover ? C.buildingLeftHover : C.buildingLeft,
      right: hover ? C.buildingRightHover : C.buildingRight,
      top: hover ? C.buildingTopHover : C.buildingTop,
      roofLeft: hover ? C.buildingRoofHover : C.buildingRoof,
      roofRight: hover ? C.buildingRoofPeakHover : C.buildingRoofPeak,
    },
    'hip',
  );

  const doorH = 0.52;
  quad(
    g,
    facePoint(s, e, sT, eT, 0.55, 0),
    facePoint(s, e, sT, eT, 0.78, 0),
    facePoint(s, e, sT, eT, 0.78, doorH),
    facePoint(s, e, sT, eT, 0.55, doorH),
  );
  g.fill(C.door);
}

export function drawPropDesk(g: Graphics, hover: boolean): void {
  const { bw, bh } = footprint(0.55);
  const height = TILE_H * 0.42;
  drawVisibleIsoBox(
    g,
    bw,
    bh,
    height,
    {
      left: hover ? C.propLeftHover : C.propLeft,
      right: hover ? C.propRightHover : C.propRight,
      top: hover ? C.propTopHover : C.propTop,
    },
    'flat',
  );
}

export function drawPropTree(g: Graphics, hover: boolean): void {
  const trunkBw = 10;
  const trunkBh = 5;
  const trunkH = TILE_H * 0.38;
  drawVisibleIsoBox(
    g,
    trunkBw,
    trunkBh,
    trunkH,
    {
      left: hover ? C.propLeftHover : C.propLeft,
      right: hover ? C.propRightHover : C.propRight,
      top: hover ? C.propTopHover : C.propTop,
    },
    'flat',
  );

  const { bw, bh } = footprint(0.62);
  const canopyBase = TILE_H * 0.52;
  const canopyH = TILE_H * 0.38;
  drawVisibleIsoBox(
    g,
    bw,
    bh,
    canopyH,
    {
      left: hover ? C.buildingLeftHover : C.buildingLeft,
      right: hover ? C.buildingRightHover : C.buildingRight,
      top: hover ? C.buildingTopHover : C.buildingTop,
      roofLeft: hover ? C.buildingRoofHover : C.buildingRoof,
      roofRight: hover ? C.buildingRoofPeakHover : C.buildingRoofPeak,
    },
    'hip',
    14,
    -canopyBase,
  );
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
