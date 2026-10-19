import { Rectangle, Sprite, Texture } from 'pixi.js';
import { FILL_ASSETS } from '../data/fill';
import spriteData from '../data/sprites.json';
import { tokens } from '../tokens';
import { canUseWebp, loadPngOrWebp } from './assetUrl';

export type SpriteAsset = {
  w: number;
  h: number;
  /** Frame point that sits on the placement vertex (front vertex of the footprint / tile foot). */
  vfs: { x: number; y: number };
  /** Opaque bounds of the @1x frame. */
  bbox: { x0: number; y0: number; x1: number; y1: number };
  f1: string;
  f2: string;
};

type Meta = Record<string, Record<string, any>>;

const assets = { ...spriteData.assets, ...FILL_ASSETS } as Record<string, SpriteAsset>;
const meta = spriteData.meta as unknown as Meta;

/** `lejos` never shows at or above this zoom (kit.zoomLejosBelow). */
export const ZOOM_LEJOS_BELOW = tokens.kit.zoomLejosBelow;
/** ...and only within this factor of the viewport's minimum zoom, so normal play keeps the detailed art. */
export const LEJOS_ZOOM_MIN_FACTOR = 2;

export function lejosZoomThreshold(zoomMin: number): number {
  return Math.min(ZOOM_LEJOS_BELOW, zoomMin * LEJOS_ZOOM_MIN_FACTOR);
}

export function isLejosZoom(zoom: number, zoomMin: number): boolean {
  return zoom < lejosZoomThreshold(zoomMin);
}

export type BuildingSpriteId =
  | 'estudio'
  | 'volaris'
  | 'bain'
  | 'mentoria'
  | 'finoa'
  | 'pg'
  | 'flor'
  | 'catedral'
  | 'sambil'
  | 'teresa'
  | 'biblioteca';
export type BuildingSpriteState = 'default' | 'hover' | 'resaltado';

export function spriteAsset(key: string): SpriteAsset {
  const a = assets[key];
  if (!a) throw new Error(`missing sprite ${key}`);
  return a;
}

export function hasSprite(key: string): boolean {
  return key in assets;
}

export function spriteMeta(id: string): Record<string, any> | undefined {
  return meta[id];
}

export function allSpriteKeys(): string[] {
  return Object.keys(assets);
}

/** Same key with the zoom segment swapped (keys ending in /cerca or /lejos). */
export function lodVariant(key: string, lejos: boolean): string {
  return key.replace(/\/(cerca|lejos)$/, lejos ? '/lejos' : '/cerca');
}

export function hasLod(key: string): boolean {
  return /\/(cerca|lejos)$/.test(key);
}

export function buildingSpriteKey(id: string, state: BuildingSpriteState, lejos: boolean): string {
  return `ext/${id}/${state}/${lejos ? 'lejos' : 'cerca'}`;
}

/** Landmark cutaways' `lejos` frame is the closed exterior silhouette, so their rooms stay on `cerca`. */
const CERCA_ONLY_INTERIORS = new Set(['flor', 'catedral', 'sambil', 'teresa', 'biblioteca']);

export function interiorSpriteKey(id: string, lejos: boolean): string {
  return `int/${id}/${lejos && !CERCA_ONLY_INTERIORS.has(id) ? 'lejos' : 'cerca'}`;
}

export function isSpriteBuilding(id: string): boolean {
  return `ext/${id}/default/cerca` in assets;
}

export function isSpriteInterior(id: string): boolean {
  return `int/${id}/cerca` in assets;
}

let resolution = 1;
const textures = new Map<string, Texture>();
const loading = new Map<string, Promise<void>>();

export function spriteResolution(): number {
  return resolution;
}

/** Landmark interiors are their @1x cutaway drawn at 2×: the @2x file is their 1:1 texture. */
const SCALED_INTERIORS = /^int\/(flor|catedral|sambil)\//;

const TEX_DATA = { autoGenerateMipmaps: false, scaleMode: 'linear' as const };

/** `lejos` frames only show below zoom 0.25, so @1x is plenty and keeps texture memory a quarter. */
function spriteUrl(key: string): string {
  const a = spriteAsset(key);
  const hi = (resolution >= 2 && !key.endsWith('/lejos')) || SCALED_INTERIORS.test(key);
  return `${import.meta.env.BASE_URL}sprites/${hi ? a.f2 : a.f1}`;
}

type AtlasSpec = { image: string; png: string; frames: Record<string, { x: number; y: number; w: number; h: number }> };

async function loadBootAtlas(): Promise<void> {
  const base = `${import.meta.env.BASE_URL}sprites/atlas/`;
  const spec = (await (await fetch(`${base}boot-1x.json`)).json()) as AtlasSpec;
  const file = canUseWebp() ? spec.image : spec.png;
  const image = await loadPngOrWebp('atlas/boot-1x', `${base}${file}`, TEX_DATA);
  for (const [key, f] of Object.entries(spec.frames)) {
    if (textures.has(key)) continue;
    // Boot atlas still has the pre-scale muro frame; load the scaled wall as its own texture.
    if (key.startsWith('prop/muro')) continue;
    textures.set(
      key,
      new Texture({ source: image.source, frame: new Rectangle(f.x, f.y, f.w, f.h) }),
    );
    loading.set(key, Promise.resolve());
  }
}

export async function loadKeys(keys: string[], onKeyDone?: () => void): Promise<void> {
  await Promise.all(
    keys.map(async (k) => {
      if (textures.has(k)) {
        onKeyDone?.();
        return;
      }
      let p = loading.get(k);
      if (!p) {
        p = (async () => {
          const tex = await loadPngOrWebp(k, spriteUrl(k), TEX_DATA);
          textures.set(k, tex);
        })();
        loading.set(k, p);
      }
      await p;
      onKeyDone?.();
    }),
  );
}

export function loadedSpriteKeys(): string[] {
  return [...textures.keys()];
}

/** Hover / resaltado / interiors / lejos — not needed for the spawn view. */
export function deferredMapKeys(): string[] {
  const stateFrames = new Set([...buildingStateKeys('hover'), ...buildingStateKeys('resaltado')]);
  return allSpriteKeys().filter((k) => k.startsWith('int/') || stateFrames.has(k) || k.endsWith('/lejos'));
}

/** Outdoor cerca frames that are not in `except` (the rest of the town after first paint). */
export function remainingMapKeys(except: Iterable<string>): string[] {
  const skip = new Set([...except, ...deferredMapKeys()]);
  return allSpriteKeys().filter((k) => !skip.has(k));
}

/**
 * Decode @2x under a fresh alias, then swap. The @1x frame stays on screen until the
 * retina textures are ready, so the map never blanks.
 */
export async function upgradeLoadedSprites(rendererResolution: number): Promise<string[]> {
  if (rendererResolution < 1.5 || resolution >= 2) return [];
  const keys = [...textures.keys()];
  resolution = 2;
  await Promise.all(
    keys.map(async (k) => {
      const alias = `${k}@@2`;
      const tex = await loadPngOrWebp(alias, spriteUrl(k), TEX_DATA);
      textures.set(k, tex);
      loading.set(k, Promise.resolve());
    }),
  );
  return keys;
}

/** Building sprite keys for one state (both zoom variants). */
export function buildingStateKeys(state: BuildingSpriteState): string[] {
  return allSpriteKeys().filter((k) => k.startsWith('ext/') && k.includes(`/${state}/`));
}

/**
 * Decode `keys` (spawn view) at @1x so the first frame is small. Pass nothing to load every
 * outdoor default frame (QA / `loadAllSprites` still want the old set).
 */
export async function loadMapSprites(
  rendererResolution: number,
  keys?: string[],
  onKeyDone?: () => void,
): Promise<void> {
  resolution = keys ? 1 : rendererResolution >= 1.5 ? 2 : 1;
  try {
    await loadBootAtlas();
  } catch {
    /* atlas missing in an old deploy: fall through to individual files */
  }
  if (keys) {
    await loadKeys(keys, onKeyDone);
    const missing = keys.filter((k) => !spritesLoaded(k));
    if (missing.length) {
      throw new Error(`boot sprites failed to load (${missing.length}): ${missing.slice(0, 4).join(', ')}`);
    }
    return;
  }
  const stateFrames = new Set([...buildingStateKeys('hover'), ...buildingStateKeys('resaltado')]);
  await loadKeys(allSpriteKeys().filter((k) => !k.startsWith('int/') && !stateFrames.has(k)));
}

/** Hover and resaltado frames, after the first frame is on screen. */
export function loadBuildingStateSprites(): Promise<void> {
  return loadKeys([...buildingStateKeys('hover'), ...buildingStateKeys('resaltado')]);
}

export async function loadAllSprites(): Promise<void> {
  await loadKeys(allSpriteKeys());
}

export async function loadInteriorSprite(id: string): Promise<void> {
  try {
    await loadKeys([interiorSpriteKey(id, false), interiorSpriteKey(id, true)]);
  } catch (err) {
    throw new Error(`loadInteriorSprite(${id}) failed`, { cause: err });
  }
}

export function spriteTexture(key: string): Texture {
  const t = textures.get(key);
  if (!t) throw new Error(`sprite not loaded: ${key}`);
  return t;
}

export function spritesLoaded(key: string): boolean {
  return textures.has(key);
}

/** Top-left of a frame placed so that its front vertex lands on `at`. */
export function spriteTopLeft(key: string, at: { x: number; y: number }): { x: number; y: number } {
  const a = spriteAsset(key);
  return { x: at.x - a.vfs.x, y: at.y - a.vfs.y };
}

export function makeSprite(key: string, at: { x: number; y: number }): Sprite {
  const s = new Sprite(spriteTexture(key));
  const tl = spriteTopLeft(key, at);
  s.position.set(tl.x, tl.y);
  return s;
}

/** Door of a house sprite in world coordinates (frame `puerta` + top-left). */
export function houseDoorFramePoint(id: string): { x: number; y: number; h: number } | null {
  const p = meta[`ext/${id}`]?.puerta;
  if (!p) return null;
  return { x: p.x, y: p.y, h: p.alto_px };
}

/** Colour of the QA background: Estudio noche `ui.bg`. */
export function worldBackgroundColor(): number {
  return parseInt(tokens.color.ui.bg.slice(1), 16);
}

let probesCache: Record<string, number[][]> | null = null;

export function cachedSpriteProbes(): Record<string, number[][]> | null {
  return probesCache;
}

/** QA: pixel-diff samples `[x, y, r, g, b]` in @1x frame coordinates (fetched on demand). */
export async function loadSpriteProbes(): Promise<Record<string, number[][]>> {
  if (!probesCache) {
    const res = await fetch(`${import.meta.env.BASE_URL}sprites/probes.json`);
    probesCache = (await res.json()) as Record<string, number[][]>;
  }
  return probesCache;
}
