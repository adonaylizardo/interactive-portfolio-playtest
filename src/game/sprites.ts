import { Assets, Sprite, Texture } from 'pixi.js';
import spriteData from '../data/sprites.json';
import { tokens } from '../tokens';

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

const assets = spriteData.assets as Record<string, SpriteAsset>;
const meta = spriteData.meta as unknown as Meta;

/** Below this zoom the `lejos` variants replace the `cerca` ones (kit.zoomLejosBelow). */
export const ZOOM_LEJOS_BELOW = tokens.kit.zoomLejosBelow;

export function isLejosZoom(zoom: number): boolean {
  return zoom < ZOOM_LEJOS_BELOW;
}

export type BuildingSpriteId = 'estudio' | 'volaris' | 'bain' | 'mentoria' | 'finoa' | 'pg' | 'flor' | 'catedral' | 'sambil';
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

export function interiorSpriteKey(id: string, lejos: boolean): string {
  return `int/${id}/${lejos ? 'lejos' : 'cerca'}`;
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

/** `lejos` frames only show below zoom 0.4, so @1x is plenty and keeps texture memory a quarter. */
function spriteUrl(key: string): string {
  const a = spriteAsset(key);
  const hi = resolution >= 2 && !key.endsWith('/lejos');
  return `${import.meta.env.BASE_URL}sprites/${hi ? a.f2 : a.f1}`;
}

export async function loadKeys(keys: string[]): Promise<void> {
  const todo = keys.filter((k) => !textures.has(k));
  await Promise.all(
    todo.map((k) => {
      let p = loading.get(k);
      if (!p) {
        p = (async () => {
          const tex = await Assets.load<Texture>({
            alias: k,
            src: spriteUrl(k),
            data: { autoGenerateMipmaps: true, scaleMode: 'linear' },
          });
          textures.set(k, tex);
        })();
        loading.set(k, p);
      }
      return p;
    }),
  );
}

/** Building sprite keys for one state (both zoom variants). */
export function buildingStateKeys(state: BuildingSpriteState): string[] {
  return allSpriteKeys().filter((k) => k.startsWith('ext/') && k.includes(`/${state}/`));
}

/**
 * What the map needs on first paint: ground, props and every building's default frames.
 * Hover / resaltado frames and interiors are fetched later so phones keep a small texture budget.
 */
export async function loadMapSprites(rendererResolution: number): Promise<void> {
  resolution = rendererResolution >= 1.5 ? 2 : 1;
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
  await loadKeys([interiorSpriteKey(id, false), interiorSpriteKey(id, true)]);
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
