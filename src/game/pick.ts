import alphaJson from '../data/sprite-alpha.json';
import spritesJson from '../data/sprites.json';
import type { MapObject } from '../data/world';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld, tileToWorld } from '../iso/math';
import { objectDepth, objectSpriteBase, objectSpriteTopLeft } from './mapSprites';

type Pt = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

type AlphaMask = { w: number; h: number; cell: number; bits: Uint8Array };

const rawMasks = alphaJson as Record<string, { w: number; h: number; cell: number; bits: string }>;
const masks = new Map<string, AlphaMask>();

function mask(base: string): AlphaMask | null {
  const hit = masks.get(base);
  if (hit) return hit;
  const raw = rawMasks[base];
  if (!raw) return null;
  const bin = atob(raw.bits);
  const bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i);
  const m = { w: raw.w, h: raw.h, cell: raw.cell, bits };
  masks.set(base, m);
  return m;
}

function pointInPoly(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Outer corners of a w×h footprint in world space (the ground diamond the building stands on). */
export function footprintCorners(o: MapObject): { west: Pt; south: Pt; east: Pt; north: Pt } {
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const sw = tileFootWorld(fx, fy + h - 1);
  const s = tileFootWorld(fx + w - 1, fy + h - 1);
  const ne = tileFootWorld(fx + w - 1, fy);
  const n = tileFootWorld(fx, fy);
  return {
    west: { x: sw.x - TILE_W / 2, y: sw.y - TILE_H / 2 },
    south: s,
    east: { x: ne.x + TILE_W / 2, y: ne.y - TILE_H / 2 },
    north: { x: n.x, y: n.y - TILE_H },
  };
}

export function footprintHit(o: MapObject, wx: number, wy: number): boolean {
  const c = footprintCorners(o);
  return pointInPoly({ x: wx, y: wy }, [c.west, c.south, c.east, c.north]);
}

function maskKey(o: MapObject): string | null {
  const base = objectSpriteBase(o);
  if (!base) return null;
  return o.type === 'building' ? `${base}/default/cerca` : `${base}/cerca`;
}

/** Opaque pixel of the object's sprite (any state or zoom variant) under the world point. */
export function spriteAlphaHit(o: MapObject, wx: number, wy: number): boolean {
  const base = objectSpriteBase(o);
  const key = maskKey(o);
  const m = base ? mask(base) : null;
  if (!m || !key) return false;
  const tl = objectSpriteTopLeft(o, key);
  const cx = Math.floor((wx - tl.x) / m.cell);
  const cy = Math.floor((wy - tl.y) / m.cell);
  if (cx < 0 || cy < 0 || cx >= m.w || cy >= m.h) return false;
  const i = cy * m.w + cx;
  return (m.bits[i >> 3] & (1 << (i & 7))) !== 0;
}

type Puerta = { x: number; y: number; alto_px?: number; ancho_casilla?: number };
const meta = spritesJson.meta as unknown as Record<string, { puerta?: Puerta }>;

const DOOR_H = 56;
const DOOR_HALF_W = 20;

/**
 * Bottom centre of the door opening in world space. Case houses carry it in their manifest
 * (`puerta`); the rest use the midpoint of the access cell's edge that touches the building.
 * TODO(catedral, sambil): Figma draws the Catedral door at the front corner and the Sambil
 * entrance at the right end; mapa_datos still puts both accesses mid-face (14,17) / (47,16).
 */
export function doorBottomCentre(o: MapObject): Pt | null {
  if (!o.door) return null;
  const puerta = meta[`ext/${o.name}`]?.puerta;
  if (puerta) {
    const tl = objectSpriteTopLeft(o, `ext/${o.name}/default/cerca`);
    return { x: tl.x + puerta.x, y: tl.y + puerta.y };
  }
  const c = tileToWorld(o.door.x, o.door.y);
  const dx = o.doorFace === '+x' ? -TILE_W / 4 : TILE_W / 4;
  return { x: c.x + dx, y: c.y - TILE_H / 4 };
}

export function doorRect(o: MapObject): Rect | null {
  const b = doorBottomCentre(o);
  if (!b) return null;
  const puerta = meta[`ext/${o.name}`]?.puerta;
  const h = puerta?.alto_px ?? DOOR_H;
  return { x0: b.x - DOOR_HALF_W, y0: b.y - h - 6, x1: b.x + DOOR_HALF_W, y1: b.y + 6 };
}

function accessCellHit(o: MapObject, wx: number, wy: number): boolean {
  if (!o.door) return false;
  const c = tileToWorld(o.door.x, o.door.y);
  return Math.hypot(wx - c.x, wy - c.y) < TILE_W * 0.52;
}

/** Door opening rectangle or the access cell in front of it. */
export function doorHit(o: MapObject, wx: number, wy: number): boolean {
  const r = doorRect(o);
  if (r && wx >= r.x0 && wx <= r.x1 && wy >= r.y0 && wy <= r.y1) return true;
  return accessCellHit(o, wx, wy);
}

/** World point for synthetic door taps: on the access cell, just in front of the opening. */
export function doorTapPoint(o: MapObject): Pt | null {
  const b = doorBottomCentre(o);
  if (!b || !o.door) return null;
  const c = tileToWorld(o.door.x, o.door.y);
  return { x: b.x + (c.x - b.x) * 0.35, y: b.y + (c.y - b.y) * 0.35 };
}

export function buildingBodyHit(o: MapObject, wx: number, wy: number): boolean {
  return spriteAlphaHit(o, wx, wy) || footprintHit(o, wx, wy);
}

/** Front-most first, matching the sprites' draw order. */
export function byDepthDesc(a: MapObject, b: MapObject): number {
  return objectDepth(b) + (b.x - b.y) * 0.0001 - (objectDepth(a) + (a.x - a.y) * 0.0001);
}
