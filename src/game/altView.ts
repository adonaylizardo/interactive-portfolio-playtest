/**
 * Pixi-only alt cameras: true orthographic overhead (cenital) plus helpers for the
 * behind-character follow cam. Isometric sprites stay untouched in iso; cenital hides them
 * and draws footprint roofs, then screen-space billboards keep walkers upright.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import type { MapObject } from '../data/world';
import { cells } from '../data/map';
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

type BillboardHome = {
  parent: Container;
  index: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number;
  skewX: number;
  skewY: number;
  zIndex: number;
};
const restPose = new WeakMap<Container, BillboardHome>();

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
  if (o.id === 'fill/jac-t9') return false;
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
  g.moveTo(c.west.x, c.west.y);
  g.lineTo(c.south.x, c.south.y);
  g.lineTo(c.east.x, c.east.y);
  g.lineTo(c.north.x, c.north.y);
  g.closePath();
  g.stroke({ width: 1.6, color: shade(roof, 0.55), alpha: 0.95 });
  g.moveTo(inner.west.x, inner.west.y);
  g.lineTo(inner.south.x, inner.south.y);
  g.lineTo(inner.east.x, inner.east.y);
  g.lineTo(inner.north.x, inner.north.y);
  g.closePath();
  g.stroke({ width: 1, color: shade(roof, 0.78), alpha: 0.7 });
  if (o.doorFace === '+y') {
    const door = tileToWorld(fx + (w - 1) / 2, fy + h - 0.08);
    const hw = Math.min(22, w * TILE_W * 0.22);
    g.roundRect(door.x - hw, door.y - 5, hw * 2, 10, 2);
    g.fill({ color: 0x1e2228, alpha: 0.95 });
    g.roundRect(door.x - hw * 0.55, door.y - 3.5, hw * 1.1, 7, 1.5);
    g.fill({ color: 0xc8d0dc });
    g.rect(door.x + hw * 0.35, door.y - 1.5, 2.5, 3);
    g.fill({ color: 0xf0b030 });
  } else if (o.doorFace === '+x') {
    const door = tileToWorld(fx + w - 0.08, fy + (h - 1) / 2);
    const hh = Math.min(22, h * TILE_H * 0.22);
    g.roundRect(door.x - 5, door.y - hh, 10, hh * 2, 2);
    g.fill({ color: 0x1e2228, alpha: 0.95 });
    g.roundRect(door.x - 3.5, door.y - hh * 0.55, 7, hh * 1.1, 1.5);
    g.fill({ color: 0xc8d0dc });
    g.rect(door.x - 1.5, door.y + hh * 0.35, 3, 2.5);
    g.fill({ color: 0xf0b030 });
  }
}

function paintStreetOverlay(g: Graphics): void {
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      if (!cells[y][x].groundId.includes('path/street')) continue;
      const p = tileToWorld(x, y);
      g.moveTo(p.x, p.y - TILE_H / 2);
      g.lineTo(p.x + TILE_W / 2, p.y);
      g.lineTo(p.x, p.y + TILE_H / 2);
      g.lineTo(p.x - TILE_W / 2, p.y);
      g.closePath();
      g.fill({ color: 0x3a424e, alpha: 0.55 });
    }
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
  if (mode === 'cenital') paintStreetOverlay(g);
  for (const o of drawable) {
    const hover = o.id === hoverId || o.name === hoverId;
    if (mode === 'cenital') paintRoof(g, o, hover);
    else paintBox(g, o, hover, yaw);
  }
}

/** Top-down van body in world space (cenital only). Heading: 0=+x tile (SE). */
export function paintJacCenital(
  g: Graphics,
  cx: number,
  cy: number,
  heading: number,
  _driving: boolean,
): void {
  const c = tileToWorld(cx, cy);
  const len = TILE_W * 2;
  const wid = TILE_H;
  const ang = heading * (Math.PI / 2);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const hw = len / 2;
  const hh = wid / 2;
  const body = 0x4a7ab0;
  const cab = 0x5c90c8;
  const trim = 0x2e4a66;
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map(({ x, y }) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos }));
  poly(g, corners, body);
  const cabInset = 0.38;
  poly(
    g,
    corners.map((p) => ({
      x: c.x + (p.x - c.x) * cabInset + (-hh * 0.15) * sin,
      y: c.y + (p.y - c.y) * cabInset + (hh * 0.15) * cos,
    })),
    cab,
  );
  g.moveTo(corners[0].x, corners[0].y);
  g.lineTo(corners[1].x, corners[1].y);
  g.stroke({ width: 2.5, color: trim, alpha: 0.85 });
  const nose = { x: c.x + hw * cos, y: c.y + hw * sin };
  g.circle(nose.x, nose.y, 5);
  g.fill({ color: 0xe8eef4 });
}

export function captureBillboardHome(sprite: Container): BillboardHome {
  let home = restPose.get(sprite);
  if (!home) {
    if (!sprite.parent) {
      home = {
        parent: sprite as unknown as Container,
        index: 0,
        x: sprite.position.x,
        y: sprite.position.y,
        sx: sprite.scale.x,
        sy: sprite.scale.y,
        rot: sprite.rotation,
        skewX: sprite.skew.x,
        skewY: sprite.skew.y,
        zIndex: sprite.zIndex,
      };
    } else {
      home = {
        parent: sprite.parent,
        index: sprite.parent.getChildIndex(sprite),
        x: sprite.position.x,
        y: sprite.position.y,
        sx: sprite.scale.x,
        sy: sprite.scale.y,
        rot: sprite.rotation,
        skewX: sprite.skew.x,
        skewY: sprite.skew.y,
        zIndex: sprite.zIndex,
      };
    }
    restPose.set(sprite, home);
  }
  return home;
}

/**
 * Reparent a sprite onto an identity screen layer so it stays upright. Affine inverse of
 * camera R*S cannot cancel non-uniform scale through world translation, so walkers were
 * left lying down in cenital. Rest pose is captured the first time and restored on clear.
 */
export function applyScreenBillboard(
  sprite: Container,
  layer: Container,
  screenX: number,
  screenY: number,
  scaleX: number,
  scaleY: number,
  zIndex: number,
): void {
  captureBillboardHome(sprite);
  layer.addChild(sprite);
  sprite.position.set(screenX, screenY);
  sprite.rotation = 0;
  sprite.skew.set(0, 0);
  sprite.scale.set(scaleX, scaleY);
  sprite.zIndex = zIndex;
}

export function clearBillboard(sprite: Container): void {
  const rest = restPose.get(sprite);
  if (!rest) return;
  if (rest.parent && rest.parent !== sprite) {
    const i = Math.max(0, Math.min(rest.index, rest.parent.children.length));
    rest.parent.addChildAt(sprite, i);
  }
  sprite.position.set(rest.x, rest.y);
  sprite.scale.set(rest.sx, rest.sy);
  sprite.rotation = rest.rot;
  sprite.skew.set(rest.skewX, rest.skewY);
  sprite.zIndex = rest.zIndex;
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
  const mag = Math.hypot(dtx, dty);
  if (mag < 1e-6) return { x: 0, y: 0 };
  return { x: dtx / mag, y: dty / mag };
}

/** Screen stick for driving: undo view rot/scale, keep screen-up as screen-up (unit length). */
export function screenStickToDrive(
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
  const mag = Math.hypot(lx, ly);
  if (mag < 1e-6) return { x: 0, y: 0 };
  return { x: lx / mag, y: ly / mag };
}

/** Screen drag (px) → camera pan in world units, undoing view rot / non-uniform scale. */
export function screenDragToCameraDelta(
  dx: number,
  dy: number,
  viewRot: number,
  viewSx: number,
  viewSy: number,
  zoom: number,
): { dx: number; dy: number } {
  const cos = Math.cos(-viewRot);
  const sin = Math.sin(-viewRot);
  const lx = (dx * cos - dy * sin) / (viewSx || 1);
  const ly = (dx * sin + dy * cos) / (viewSy || 1);
  const z = zoom || 1;
  return { dx: lx / z, dy: ly / z };
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
