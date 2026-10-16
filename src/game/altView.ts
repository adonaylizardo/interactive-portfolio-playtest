/**
 * Pixi-only alt cameras: true orthographic overhead (cenital) and a behind-the-character
 * follow cam (perspectiva). Isometric sprites stay untouched; these modes hide them and
 * draw footprint roofs / extruded boxes instead, then billboard walkers so they stay upright.
 */
import { Container, Graphics, Matrix, Sprite } from 'pixi.js';
import type { MapObject } from '../data/world';
import { TILE_H, TILE_W } from '../data/world';
import { mapWorldBounds, tileFootWorld, tileToWorld } from '../iso/math';
import { C } from './colors';
import { footprintCorners } from './pick';
import { objectSpriteKey } from './mapSprites';
import { hasSprite, spriteAsset } from './sprites';
import type { FacingDir } from './player';
import { CHARACTER_WORLD_SCALE } from './npcs';

export const CENITAL_VIEW_SY = 2;
export const CENITAL_VIEW_TILT = Math.PI / 4;
/** Extra screen px between a billboarded sprite's opaque top and the name pill. */
export const ALT_LABEL_GAP_PX = 18;
/** Perspectiva: put Adonay this far below the free-rect centre (looking over his shoulder). */
export const PERSPECTIVE_AIM_DOWN_FRAC = 0.2;

const ROOF: Record<string, number> = {
  estudio: 0x8b929c,
  volaris: 0x7a8896,
  bain: 0x8c867c,
  mentoria: 0x7c8c84,
  finoa: 0x96887a,
  pg: 0x848494,
  sambil: 0x7a7c8c,
  catedral: 0x9a948c,
  flor: 0x88947c,
};

const TREE_CANOPY: Record<string, number> = {
  redondo: 0x6d7d6d,
  cipres: 0x5a6e5a,
  araguaney: 0x8a9a5a,
};

type Rest = { sx: number; sy: number; rot: number };
const restPose = new WeakMap<Container, Rest>();
const billboardMat = new Matrix();

/** User yaw (rotate button) + facing so the camera sits behind Adonay. */
export const FACING_YAW: Record<FacingDir, number> = {
  nw: 0,
  ne: 1,
  se: 2,
  sw: 3,
};

export function perspectiveYaw(facing: FacingDir, userYaw: number): number {
  return (FACING_YAW[facing] + (userYaw % 4) + 4) % 4;
}

export function objectRisePx(o: MapObject): number {
  if (o.name === 'tree') return o.variant === 'cipres' ? 92 : 70;
  if (o.name === 'lamp') return 56;
  if (o.name === 'obelisco') return 140;
  if (o.name === 'muro') return 64;
  if (o.name === 'bench') return 16;
  if (o.flat || o.name === 'redoma') return 0;
  const key = objectSpriteKey(o, 'default', false);
  if (!key || !hasSprite(key)) return o.type === 'building' ? 96 : 36;
  const a = spriteAsset(key);
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const diamondH = ((w + h) * TILE_H) / 2;
  return Math.max(28, a.vfs.y - diamondH - (a.bbox.y0 ?? 0));
}

function poly(g: Graphics, pts: { x: number; y: number }[], fill: number, alpha = 1): void {
  if (pts.length < 3) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill({ color: fill, alpha });
}

function lift(p: { x: number; y: number }, z: number): { x: number; y: number } {
  return { x: p.x, y: p.y - z };
}

function shade(color: number, mul: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * mul)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * mul)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * mul)));
  return (r << 16) | (g << 8) | b;
}

function roofColor(o: MapObject, hover: boolean): number {
  const base = ROOF[o.name] ?? (o.type === 'building' ? C.buildingTop : C.propTop);
  return hover ? shade(base, 1.12) : base;
}

function isoDepth(tx: number, ty: number, yaw: number): number {
  const q = ((yaw % 4) + 4) % 4;
  if (q === 0) return tx + ty;
  if (q === 1) return tx - ty;
  if (q === 2) return -(tx + ty);
  return ty - tx;
}

function usesIsoSprite(o: MapObject): boolean {
  if (o.id === 'fill/jac-t9') return true;
  if (o.flat) return true;
  return false;
}

/** Hide iso building/prop art while an alt camera is drawing roofs/boxes instead. */
export function hideIsoPropSprite(o: MapObject): boolean {
  return !usesIsoSprite(o);
}

function paintRoof(g: Graphics, o: MapObject, hover: boolean): void {
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const c = footprintCorners(o);
  const roof = roofColor(o, hover);

  if (o.name === 'tree') {
    const p = tileToWorld(fx, fy);
    const r = o.variant === 'cipres' ? 16 : o.variant === 'araguaney' ? 26 : 22;
    g.circle(p.x, p.y, r);
    g.fill({ color: TREE_CANOPY[o.variant ?? 'redondo'] ?? C.treeCanopyMid });
    g.circle(p.x, p.y, 3);
    g.fill({ color: shade(C.treeCanopyDark, 0.85) });
    return;
  }
  if (o.name === 'lamp') {
    const p = tileToWorld(fx, fy);
    g.circle(p.x, p.y, 6);
    g.fill({ color: 0xb8bcc4 });
    g.circle(p.x, p.y, 2.5);
    g.fill({ color: 0xe8eaee });
    return;
  }
  if (o.name === 'bench') {
    const p = tileToWorld(fx, fy);
    const alongX = o.variant === 'der';
    const hw = alongX ? 18 : 8;
    const hh = alongX ? 8 : 16;
    g.rect(p.x - hw, p.y - hh, hw * 2, hh * 2);
    g.fill({ color: 0x6a6e74 });
    return;
  }
  if (o.name === 'redoma') {
    const p = tileToWorld(fx + (w - 1) / 2, fy + (h - 1) / 2);
    g.circle(p.x, p.y, Math.max(w, h) * 28);
    g.fill({ color: 0x6a7a6a, alpha: 0.9 });
    g.circle(p.x, p.y, Math.max(w, h) * 16);
    g.fill({ color: 0x8a9a7a, alpha: 0.85 });
    return;
  }
  if (o.name === 'obelisco') {
    poly(g, [c.west, c.south, c.east, c.north], 0x9aa0a8);
    const p = tileToWorld(fx + (w - 1) / 2, fy + (h - 1) / 2);
    g.rect(p.x - 8, p.y - 8, 16, 16);
    g.fill({ color: 0xc8ccd2 });
    return;
  }
  if (o.name === 'muro') {
    // L-shaped wall along −y and −x edges of the footprint.
    const n0 = tileFootWorld(fx - 1, fy - 1);
    const n1 = tileFootWorld(fx + w - 1, fy - 1);
    const n2 = tileFootWorld(fx + w - 1, fy);
    const n3 = tileFootWorld(fx, fy);
    const w0 = tileFootWorld(fx - 1, fy - 1);
    const w1 = tileFootWorld(fx - 1, fy + h - 1);
    const w2 = tileFootWorld(fx, fy + h - 1);
    const w3 = tileFootWorld(fx, fy);
    poly(g, [n0, n1, n2, n3], 0x6a6e76);
    poly(g, [w0, w1, w2, w3], 0x5e626a);
    return;
  }

  poly(g, [c.west, c.south, c.east, c.north], roof);
  const inset = 0.18;
  const inner = footprintCorners({
    ...o,
    footprintX: fx + inset,
    footprintY: fy + inset,
    w: Math.max(0.4, w - inset * 2),
    h: Math.max(0.4, h - inset * 2),
  });
  poly(g, [inner.west, inner.south, inner.east, inner.north], shade(roof, hover ? 1.06 : 0.92));
  g.moveTo(c.north.x, c.north.y);
  g.lineTo(c.south.x, c.south.y);
  g.stroke({ width: 1.5, color: shade(roof, 0.72), alpha: 0.9 });
  if (o.doorFace === '+y') {
    const door = tileToWorld(fx + (w - 1) / 2, fy + h - 0.15);
    g.circle(door.x, door.y, 4);
    g.fill({ color: 0x3a3c42 });
  } else if (o.doorFace === '+x') {
    const door = tileToWorld(fx + w - 0.15, fy + (h - 1) / 2);
    g.circle(door.x, door.y, 4);
    g.fill({ color: 0x3a3c42 });
  }
}

function paintBox(g: Graphics, o: MapObject, hover: boolean, yaw: number): void {
  const z = objectRisePx(o);
  if (z <= 0) {
    paintRoof(g, o, hover);
    return;
  }
  if (o.name === 'tree') {
    const fx = o.footprintX ?? o.x;
    const fy = o.footprintY ?? o.y;
    const p = tileToWorld(fx, fy);
    const trunk = 5;
    g.rect(p.x - trunk / 2, p.y - z, trunk, z);
    g.fill({ color: 0x5a5046 });
    const r = o.variant === 'cipres' ? 14 : 22;
    g.ellipse(p.x, p.y - z, r, r * 0.55);
    g.fill({ color: TREE_CANOPY[o.variant ?? 'redondo'] ?? C.treeCanopyMid });
    return;
  }
  if (o.name === 'lamp') {
    const p = tileToWorld(o.footprintX ?? o.x, o.footprintY ?? o.y);
    g.rect(p.x - 2, p.y - z, 4, z);
    g.fill({ color: 0x8a8e96 });
    g.circle(p.x, p.y - z, 6);
    g.fill({ color: 0xd8dce4 });
    return;
  }
  const c = footprintCorners(o);
  const top = {
    west: lift(c.west, z),
    south: lift(c.south, z),
    east: lift(c.east, z),
    north: lift(c.north, z),
  };
  const q = ((yaw % 4) + 4) % 4;
  const wallA = q === 0 || q === 3 ? C.buildingLeft : C.buildingRight;
  const wallB = q === 0 || q === 1 ? C.buildingRight : C.buildingLeft;
  const left = hover ? shade(wallA, 1.1) : wallA;
  const right = hover ? shade(wallB, 1.1) : wallB;
  const roof = roofColor(o, hover);
  // Painter's algorithm: far walls, then near walls, then roof.
  if (q === 0) {
    poly(g, [c.north, c.west, top.west, top.north], left);
    poly(g, [c.north, c.east, top.east, top.north], right);
    poly(g, [c.west, c.south, top.south, top.west], shade(left, 0.88));
    poly(g, [c.east, c.south, top.south, top.east], shade(right, 0.92));
  } else if (q === 1) {
    poly(g, [c.west, c.north, top.north, top.west], left);
    poly(g, [c.west, c.south, top.south, top.west], right);
    poly(g, [c.north, c.east, top.east, top.north], shade(left, 0.88));
    poly(g, [c.south, c.east, top.east, top.south], shade(right, 0.92));
  } else if (q === 2) {
    poly(g, [c.south, c.east, top.east, top.south], left);
    poly(g, [c.south, c.west, top.west, top.south], right);
    poly(g, [c.east, c.north, top.north, top.east], shade(left, 0.88));
    poly(g, [c.west, c.north, top.north, top.west], shade(right, 0.92));
  } else {
    poly(g, [c.east, c.south, top.south, top.east], left);
    poly(g, [c.east, c.north, top.north, top.east], right);
    poly(g, [c.south, c.west, top.west, top.south], shade(left, 0.88));
    poly(g, [c.north, c.west, top.west, top.north], shade(right, 0.92));
  }
  poly(g, [top.west, top.south, top.east, top.north], roof);
}

export function paintAltView(
  g: Graphics,
  objects: readonly MapObject[],
  mode: 'cenital' | 'perspectiva',
  yaw: number,
  hoverId: string | null,
): void {
  g.clear();
  const drawable = objects
    .filter((o) => hideIsoPropSprite(o))
    .sort((a, b) => {
      const da = isoDepth(a.footprintX ?? a.x, a.footprintY ?? a.y, yaw);
      const db = isoDepth(b.footprintX ?? b.x, b.footprintY ?? b.y, yaw);
      return da - db;
    });
  for (const o of drawable) {
    const hover = o.id === hoverId || o.name === hoverId;
    if (mode === 'cenital') paintRoof(g, o, hover);
    else paintBox(g, o, hover, yaw);
  }
}

/**
 * Cancel the camera's non-uniform scale + rotation on a sprite so it reads upright on screen
 * (a 2D billboard). Rest pose is captured the first time we billboard and restored on clear.
 */
export function applyBillboard(sprite: Container, viewRot: number, viewSx: number, viewSy: number): void {
  if (!restPose.has(sprite)) {
    restPose.set(sprite, { sx: sprite.scale.x, sy: sprite.scale.y, rot: sprite.rotation });
  }
  const rest = restPose.get(sprite)!;
  const sx = viewSx || 1;
  const sy = viewSy || 1;
  const px = sprite.position.x;
  const py = sprite.position.y;
  // Invert camera R*S around the sprite origin. Do not bake translation into the
  // matrix — Sprite pivot/anchor makes decompose shift the feet off the tile.
  billboardMat.identity();
  billboardMat.scale(1 / sx, 1 / sy);
  billboardMat.rotate(-viewRot);
  billboardMat.scale(rest.sx, rest.sy);
  sprite.setFromMatrix(billboardMat);
  sprite.position.set(px, py);
}

export function clearBillboard(sprite: Container): void {
  const rest = restPose.get(sprite);
  if (!rest) return;
  sprite.rotation = rest.rot;
  sprite.scale.set(rest.sx, rest.sy);
  sprite.skew.set(0, 0);
  restPose.delete(sprite);
}

export function isBillboarded(sprite: Container): boolean {
  return restPose.has(sprite);
}

/** Screen stick (x right, y down) → tile-space walk delta, undoing camera rot/scale. */
export function screenStickToTile(
  dx: number,
  dy: number,
  viewRot: number,
  viewSx: number,
  viewSy: number,
): { x: number; y: number } {
  const cos = Math.cos(viewRot);
  const sin = Math.sin(viewRot);
  const lx = (dx * cos + dy * sin) / (viewSx || 1);
  const ly = (-dx * sin + dy * cos) / (viewSy || 1);
  const dtx = lx / TILE_W + ly / TILE_H;
  const dty = ly / TILE_H - lx / TILE_W;
  return { x: dtx, y: dty };
}

export function defaultBillboardScale(): number {
  return CHARACTER_WORLD_SCALE;
}

/** Smallest zoom that fits the map's screen AABB after camera rot / non-uniform scale. */
export function zoomMinForView(
  viewRot: number,
  viewSx: number,
  viewSy: number,
  innerW: number,
  innerH: number,
): number {
  const b = mapWorldBounds();
  const cos = Math.cos(viewRot);
  const sin = Math.sin(viewRot);
  const sx = viewSx || 1;
  const sy = viewSy || 1;
  const corners: [number, number][] = [
    [b.minX, b.minY],
    [b.maxX, b.minY],
    [b.minX, b.maxY],
    [b.maxX, b.maxY],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [wx, wy] of corners) {
    const px = wx * sx;
    const py = wy * sy;
    const x = px * cos - py * sin;
    const y = px * sin + py * cos;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const mapW = Math.max(1, maxX - minX);
  const mapH = Math.max(1, maxY - minY);
  const fit = Math.min(Math.max(1, innerW) / mapW, Math.max(1, innerH) / mapH);
  return Math.min(1.5, Math.max(0.04, fit));
}

export type BillboardSprite = Sprite;
