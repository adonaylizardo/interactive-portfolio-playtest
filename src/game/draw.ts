import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

type Pt = { x: number; y: number };

/** House footprint ~96×48 @ 1 tile (128×64 diamond). */
export const BUILDING_BW = 48;
export const BUILDING_BH = 24;
export const BUILDING_WALL_H = 56;
export const BUILDING_RIDGE_RISE = 36;
export const BUILDING_OVERHANG = 6;

export const TREE_TRUNK_BW = 5;
export const TREE_TRUNK_H = 20;
export const TREE_CANOPY_RX = 24;
export const TREE_CANOPY_RY = 22;
export const TREE_CANOPY_CY = -34;
export const TREE_CANOPY_OVERLAP = 8;

export const DESK_BW = 28;
export const DESK_BH = 14;
export const DESK_PANEL_H = 16;
export const DESK_SLAB_T = 6;

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

export function lift(p: Pt, h: number): Pt {
  return { x: p.x, y: p.y - h };
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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

function line(g: Graphics, a: Pt, b: Pt, color: number, width = 1): void {
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width, color });
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

function pushOut(p: Pt, origin: Pt, dist: number): Pt {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * dist, y: p.y + (dy / len) * dist };
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
  const { s, w } = tileCorners(BUILDING_BW, BUILDING_BH);
  const mid = lerp(w, s, 0.5);
  return { x: mid.x * 0.92, y: mid.y * 0.92 - 5 };
}

export function buildingFrontWallsCover(p: Pt): boolean {
  const { s, e, w } = tileCorners(BUILDING_BW, BUILDING_BH);
  const sT = lift(s, BUILDING_WALL_H);
  const eT = lift(e, BUILDING_WALL_H);
  const wT = lift(w, BUILDING_WALL_H);
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
  const bw = BUILDING_BW;
  const bh = BUILDING_BH;
  const wallH = BUILDING_WALL_H;
  const { s, e, n, w } = tileCorners(bw, bh);
  const left = hover ? C.buildingLeftHover : C.buildingLeft;
  const right = hover ? C.buildingRightHover : C.buildingRight;
  const roofNear = hover ? C.buildingRoofNearHover : C.buildingRoofNear;
  const roofFar = hover ? C.buildingRoofFarHover : C.buildingRoofFar;
  const fascia = C.buildingFascia;

  const sT = lift(s, wallH);
  const eT = lift(e, wallH);
  const wT = lift(w, wallH);
  const nT = lift(n, wallH);

  quad(g, w, s, sT, wT);
  g.fill(left);
  quad(g, s, e, eT, sT);
  g.fill(right);

  const peak: Pt = { x: 0, y: sT.y - BUILDING_RIDGE_RISE };

  tri(g, sT, eT, peak, right);
  line(g, sT, peak, 0x606060, 1);
  line(g, eT, peak, 0x606060, 1);

  const center: Pt = { x: 0, y: (sT.y + nT.y) / 2 };
  const wE = pushOut(wT, center, BUILDING_OVERHANG);
  const sE = pushOut(sT, center, BUILDING_OVERHANG);
  const eE = pushOut(eT, center, BUILDING_OVERHANG);
  const nE = pushOut(nT, center, BUILDING_OVERHANG);
  const peakE: Pt = { x: 0, y: peak.y };

  tri(g, wE, sE, peakE, roofNear);
  tri(g, eE, nE, peakE, roofFar);

  line(g, wE, sE, fascia, 2);
  line(g, sE, eE, fascia, 2);

  const faceLen = Math.hypot(e.x - s.x, e.y - s.y);
  const doorW = 14;
  const doorH = 24;
  const u0 = 0.5 - doorW / (2 * faceLen);
  const u1 = 0.5 + doorW / (2 * faceLen);
  const v1 = doorH / wallH;
  quad(
    g,
    facePoint(s, e, sT, eT, u0, 0),
    facePoint(s, e, sT, eT, u1, 0),
    facePoint(s, e, sT, eT, u1, v1),
    facePoint(s, e, sT, eT, u0, v1),
  );
  g.fill(C.door);
}

export function deskTopFillColor(hover: boolean): number {
  return hover ? C.propTopHover : C.propTop;
}

export function drawPropDesk(g: Graphics, hover: boolean): void {
  const bw = DESK_BW;
  const bh = DESK_BH;
  const { s, e, n, w } = tileCorners(bw, bh);
  const left = hover ? C.propLeftHover : C.propLeft;
  const right = hover ? C.propRightHover : C.propRight;
  const back = hover ? C.propBackHover : C.propBack;
  const topColor = deskTopFillColor(hover);
  const panelH = DESK_PANEL_H;
  const thick = 4;
  const oh = 3;

  const endPanel = (tip: Pt, legA: Pt, legB: Pt, color: number) => {
    const a = lerp(tip, legA, 0.06);
    const b = lerp(tip, legB, 0.06);
    const ai = lerp(tip, a, thick / Math.hypot(a.x - tip.x, a.y - tip.y));
    const bi = lerp(tip, b, thick / Math.hypot(b.x - tip.x, b.y - tip.y));
    const aiT = lift(ai, panelH);
    const biT = lift(bi, panelH);
    quad(g, ai, bi, biT, aiT);
    g.fill(color);
  };

  endPanel(s, w, e, right);
  endPanel(n, w, e, left);

  const backMid = lerp(n, { x: 0, y: n.y + 4 }, 0.5);
  const backL = lerp(w, n, 0.5);
  const backR = lerp(e, n, 0.5);
  const backLi = lerp(backL, backMid, 0.15);
  const backRi = lerp(backR, backMid, 0.15);
  const backLiT = lift(backLi, panelH * 0.85);
  const backMiT = lift(backMid, panelH * 0.85);
  tri(g, backLi, backRi, backMiT, back);
  tri(g, backLi, backLiT, backMiT, back);

  const bwTop = bw + oh * 0.55;
  const bhTop = bh + oh * 0.55;
  const { s: ts, e: te, n: tn, w: tw } = tileCorners(bwTop, bhTop);
  const baseY = panelH;
  const sT = lift(ts, baseY);
  const eT = lift(te, baseY);
  const wT = lift(tw, baseY);
  const sTop = lift(ts, baseY + DESK_SLAB_T);
  const eTop = lift(te, baseY + DESK_SLAB_T);
  const wTop = lift(tw, baseY + DESK_SLAB_T);
  const nTop = lift(tn, baseY + DESK_SLAB_T);

  quad(g, wT, sT, sTop, wTop);
  g.fill(left);
  quad(g, sT, eT, eTop, sTop);
  g.fill(right);
  quad(g, wTop, sTop, eTop, nTop);
  g.fill(topColor);
}

export function drawPropTree(g: Graphics, hover: boolean): void {
  const dark = hover ? C.treeCanopyDarkHover : C.treeCanopyDark;
  const mid = hover ? C.treeCanopyMidHover : C.treeCanopyMid;
  const light = hover ? C.treeCanopyLightHover : C.treeCanopyLight;
  const left = hover ? C.propLeftHover : C.propLeft;
  const right = hover ? C.propRightHover : C.propRight;

  g.ellipse(0, -2, 20, 8);
  g.fill({ color: 0x888888, alpha: 0.2 });

  const trunkBh = 2.5;
  drawFrontTrunk(g, TREE_TRUNK_BW, trunkBh, TREE_TRUNK_H, left, right);

  const cx = 0;
  const cy = TREE_CANOPY_CY;
  const rx = TREE_CANOPY_RX;
  const ry = TREE_CANOPY_RY;

  g.ellipse(cx - 6, cy, 14, 13);
  g.fill({ color: dark, alpha: 0.95 });
  g.ellipse(cx + 5, cy + 2, 16, 14);
  g.fill({ color: mid, alpha: 0.92 });
  g.ellipse(cx + 10, cy - 8, 12, 11);
  g.fill({ color: light, alpha: 0.88 });

  g.ellipse(cx, cy, rx, ry);
  g.fill({ color: mid, alpha: 0.08 });
  g.ellipse(cx - 8, cy + 1, 14, 14);
  g.fill({ color: dark, alpha: 0.55 });
  g.ellipse(cx + 6, cy + 3, 16, 15);
  g.fill({ color: mid, alpha: 0.5 });
  g.ellipse(cx + 12, cy - 6, 11, 10);
  g.fill({ color: light, alpha: 0.45 });
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
  const sT = lift(s, height);
  const eT = lift(e, height);
  const wT = lift(w, height);
  quad(g, w, s, sT, wT);
  g.fill(left);
  quad(g, s, e, eT, sT);
  g.fill(right);
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
