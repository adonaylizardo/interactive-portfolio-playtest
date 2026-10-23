import alphaJson from '../data/sprite-alpha.json';
import rellenoJson from '../data/relleno.json';
import spritesJson from '../data/sprites.json';
import type { MapObject } from '../data/world';
import { TILE_H, TILE_W } from '../data/world';
import { tileFootWorld, tileToWorld } from '../iso/math';
import {
  buildingPickSpriteKey,
  objectDepth,
  objectSpriteBase,
  objectSpriteScale,
  objectSpriteTopLeft,
} from './mapSprites';
import { hasSprite } from './sprites';

type Pt = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };

type AlphaMask = { w: number; h: number; cell: number; bits: Uint8Array };

const rawMasks = {
  ...(alphaJson as Record<string, { w: number; h: number; cell: number; bits: string }>),
  ...(rellenoJson.masks as Record<string, { w: number; h: number; cell: number; bits: string }>),
};
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
  if (o.type === 'building') return buildingPickSpriteKey(o, true);
  const base = objectSpriteBase(o);
  return base ? `${base}/cerca` : null;
}

export function hasSpriteMask(o: MapObject): boolean {
  const base = objectSpriteBase(o);
  return !!base && !!mask(base);
}

/** Opaque pixel of the object's sprite (any state or zoom variant) under the world point. */
export function spriteAlphaHit(o: MapObject, wx: number, wy: number): boolean {
  const base = objectSpriteBase(o);
  const key = maskKey(o);
  const m = base ? mask(base) : null;
  if (!m || !key || !hasSprite(key)) return false;
  const tl = objectSpriteTopLeft(o, key);
  const cell = m.cell * objectSpriteScale(o);
  const cx = Math.floor((wx - tl.x) / cell);
  const cy = Math.floor((wy - tl.y) / cell);
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
    const pickKey = buildingPickSpriteKey(o, true) ?? `ext/${o.name}/default/cerca`;
    if (!hasSprite(pickKey)) return null;
    const tl = objectSpriteTopLeft(o, pickKey);
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

type Box3 = { u: [number, number]; v: [number, number]; z: [number, number] };
const obeliscoBoxes = Object.values(
  (spritesJson.meta as unknown as Record<string, { colision: { rectangulos_locales: Record<string, Box3> } }>)['prop/obelisco']
    .colision.rectangulos_locales,
);

function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Screen silhouettes of the monument's solid parts (steps, slab, stair, arch) from the manifest
 * `colision.rectangulos_locales`, in footprint-local lattice units (u = x, v = y, z = px up).
 */
export function obeliscoSilhouettes(o: MapObject): Pt[][] {
  const fx = (o.footprintX ?? o.x) - 0.5;
  const fy = (o.footprintY ?? o.y) - 0.5;
  const at = (u: number, v: number, z: number): Pt => ({
    x: (fx + u - (fy + v)) * (TILE_W / 2),
    y: (fx + u + fy + v) * (TILE_H / 2) - z,
  });
  return obeliscoBoxes.map((b) => {
    const pts: Pt[] = [];
    for (const u of b.u) for (const v of b.v) for (const z of b.z) pts.push(at(u, v, z));
    return hull(pts);
  });
}

/** True when the world point lands on the drawn monument, not on plaza ground around it. */
export function obeliscoMonumentHit(o: MapObject, wx: number, wy: number): boolean {
  return obeliscoSilhouettes(o).some((h) => pointInPoly({ x: wx, y: wy }, h));
}

/** Front-most first, matching the sprites' draw order. */
export function byDepthDesc(a: MapObject, b: MapObject): number {
  return objectDepth(b) + (b.x - b.y) * 0.0001 - (objectDepth(a) + (a.x - a.y) * 0.0001);
}
