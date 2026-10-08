import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

type Pt = { x: number; y: number };

const FOOT_INSET = 0.84;

function footprint(bwScale = 1): { bw: number; bh: number } {
  const bw = (TILE_W / 2) * FOOT_INSET * bwScale;
  const bh = (TILE_H / 2) * FOOT_INSET * bwScale;
  return { bw, bh };
}

function tileCorners(bw: number, bh: number): { s: Pt; e: Pt; n: Pt; w: Pt } {
  return {
    s: { x: 0, y: 0 },
    e: { x: bw, y: -bh },
    n: { x: 0, y: -2 * bh },
    w: { x: -bw, y: -bh },
  };
}

function lift(p: Pt, h: number): Pt {
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

type IsoFaceColors = {
  left: number;
  right: number;
  top: number;
  roofLeft?: number;
  roofRight?: number;
};

/** Isometric box on tile footprint; south vertex anchor at (0, 0). */
function drawIsoBox(
  g: Graphics,
  bw: number,
  bh: number,
  height: number,
  colors: IsoFaceColors,
  roofPitch = 22,
): void {
  const { s, e, n, w } = tileCorners(bw, bh);
  const sT = lift(s, height);
  const eT = lift(e, height);
  const nT = lift(n, height);
  const wT = lift(w, height);

  quad(g, w, n, nT, wT);
  g.fill(colors.left);

  quad(g, s, e, eT, sT);
  g.fill(colors.right);

  quad(g, wT, nT, eT, sT);
  g.fill(colors.top);

  if (roofPitch <= 0) return;

  const pitch = Math.min(roofPitch, height * 0.28);
  const peak: Pt = { x: 0, y: nT.y - pitch };
  const roofL = colors.roofLeft ?? colors.left;
  const roofR = colors.roofRight ?? colors.right;

  g.moveTo(wT.x, wT.y);
  g.lineTo(nT.x, nT.y);
  g.lineTo(peak.x, peak.y);
  g.closePath();
  g.fill(roofL);

  g.moveTo(nT.x, nT.y);
  g.lineTo(eT.x, eT.y);
  g.lineTo(peak.x, peak.y);
  g.closePath();
  g.fill(roofR);
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
  drawIsoBox(g, bw, bh, height, {
    left: hover ? C.buildingLeftHover : C.buildingLeft,
    right: hover ? C.buildingRightHover : C.buildingRight,
    top: hover ? C.buildingTopHover : C.buildingTop,
    roofLeft: hover ? C.buildingRoofHover : C.buildingRoof,
    roofRight: hover ? C.buildingRoofPeakHover : C.buildingRoofPeak,
  });

  const { s, e } = tileCorners(bw, bh);
  const sT = lift(s, height);
  const eT = lift(e, height);
  const d0 = lerp(s, e, 0.52);
  const d1 = lerp(s, e, 0.78);
  const d2 = lerp(sT, eT, 0.78);
  const d3 = lerp(sT, eT, 0.52);
  const inset = 0.35;
  const door0 = lerp(d0, d3, inset);
  const door1 = lerp(d1, d2, inset);
  const door2 = lerp(d1, d2, 0.08);
  const door3 = lerp(d0, d3, 0.08);
  quad(g, door0, door1, door2, door3);
  g.fill(C.door);
}

export function drawPropDesk(g: Graphics, hover: boolean): void {
  const { bw, bh } = footprint(0.55);
  const height = TILE_H * 0.42;
  drawIsoBox(
    g,
    bw,
    bh,
    height,
    {
      left: hover ? C.propLeftHover : C.propLeft,
      right: hover ? C.propRightHover : C.propRight,
      top: hover ? C.propTopHover : C.propTop,
    },
    0,
  );
}

export function drawPropTree(g: Graphics, hover: boolean): void {
  const trunkBw = 10;
  const trunkBh = 5;
  const trunkH = TILE_H * 0.38;
  drawIsoBox(
    g,
    trunkBw,
    trunkBh,
    trunkH,
    {
      left: hover ? C.propLeftHover : C.propLeft,
      right: hover ? C.propRightHover : C.propRight,
      top: hover ? C.propTopHover : C.propTop,
    },
    0,
  );

  const { bw, bh } = footprint(0.62);
  const canopyBase = TILE_H * 0.52;
  const canopyH = TILE_H * 0.38;
  const { s, e, n, w } = tileCorners(bw, bh);
  const shift = (p: Pt): Pt => ({ x: p.x, y: p.y - canopyBase });
  const sB = shift(s);
  const eB = shift(e);
  const nB = shift(n);
  const wB = shift(w);
  const sT = lift(sB, canopyH);
  const eT = lift(eB, canopyH);
  const nT = lift(nB, canopyH);
  const wT = lift(wB, canopyH);

  const canopyLeft = hover ? C.buildingLeftHover : C.buildingLeft;
  const canopyRight = hover ? C.buildingRightHover : C.buildingRight;
  const canopyTop = hover ? C.buildingTopHover : C.buildingTop;

  quad(g, wB, nB, nT, wT);
  g.fill(canopyLeft);
  quad(g, sB, eB, eT, sT);
  g.fill(canopyRight);
  quad(g, wT, nT, eT, sT);
  g.fill(canopyTop);

  const peak: Pt = { x: 0, y: nT.y - 14 };
  g.moveTo(wT.x, wT.y);
  g.lineTo(nT.x, nT.y);
  g.lineTo(peak.x, peak.y);
  g.closePath();
  g.fill(canopyLeft);
  g.moveTo(nT.x, nT.y);
  g.lineTo(eT.x, eT.y);
  g.lineTo(peak.x, peak.y);
  g.closePath();
  g.fill(canopyRight);
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
