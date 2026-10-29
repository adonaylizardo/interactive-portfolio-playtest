import type { Sprite, Texture } from 'pixi.js';

/** Screen pixels between the sprite's opaque top and the bottom of the name pill. */
export const NAME_PILL_GAP_PX = 10;
const ALPHA = 1;
const TOP_BAND = 2;

const cache = new WeakMap<Texture, { x: number; y: number } | null>();
let scanCanvas: HTMLCanvasElement | null = null;
let scanCtx: CanvasRenderingContext2D | null = null;

function scanContext(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!scanCanvas) {
    scanCanvas = document.createElement('canvas');
    scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!scanCtx) return null;
  if (scanCanvas.width !== w || scanCanvas.height !== h) {
    scanCanvas.width = w;
    scanCanvas.height = h;
  }
  return scanCtx;
}

function resourceImage(tex: Texture): CanvasImageSource | null {
  const raw = (tex.source as { resource?: unknown } | undefined)?.resource;
  const r = raw && typeof raw === 'object' && 'source' in raw ? (raw as { source: unknown }).source : raw;
  if (
    r instanceof HTMLImageElement ||
    r instanceof HTMLCanvasElement ||
    (typeof ImageBitmap !== 'undefined' && r instanceof ImageBitmap)
  ) {
    return r;
  }
  return null;
}

function sourceCrop(tex: Texture): { sx: number; sy: number; sw: number; sh: number } {
  const frame = tex.frame;
  const res = tex.source.resolution || 1;
  if (Math.abs(frame.width - tex.width) < 0.5) {
    return { sx: frame.x * res, sy: frame.y * res, sw: frame.width * res, sh: frame.height * res };
  }
  return { sx: frame.x, sy: frame.y, sw: frame.width, sh: frame.height };
}

/** Local-frame (texture) px of the top centre of opaque pixels. Cached per texture. */
export function textureOpaqueTop(tex: Texture): { x: number; y: number } | null {
  if (cache.has(tex)) return cache.get(tex) ?? null;
  const img = resourceImage(tex);
  const w = Math.max(1, Math.round(tex.width));
  const h = Math.max(1, Math.round(tex.height));
  if (!img || w < 2 || h < 2) {
    cache.set(tex, null);
    return null;
  }
  try {
    const ctx = scanContext(w, h);
    if (!ctx) {
      cache.set(tex, null);
      return null;
    }
    const crop = sourceCrop(tex);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let minY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > ALPHA) {
          minY = y;
          break;
        }
      }
      if (minY >= 0) break;
    }
    if (minY < 0) {
      cache.set(tex, null);
      return null;
    }
    let sx = 0;
    let n = 0;
    const y1 = Math.min(h - 1, minY + TOP_BAND);
    for (let y = minY; y <= y1; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > ALPHA) {
          sx += x + 0.5;
          n++;
        }
      }
    }
    const hit = { x: n ? sx / n : w / 2, y: minY };
    cache.set(tex, hit);
    return hit;
  } catch {
    cache.set(tex, null);
    return null;
  }
}

/**
 * World point of the current frame's opaque top (hair, ears, raised hands).
 * Falls back to the cell top at the feet when the texture has no pixels yet.
 */
export function spriteOpaqueTopWorld(sprite: Sprite): { x: number; y: number } {
  const tex = sprite.texture;
  const local = textureOpaqueTop(tex);
  const sx = sprite.scale.x;
  const sy = sprite.scale.y;
  if (!local) {
    return {
      x: sprite.x,
      y: sprite.y - sprite.anchor.y * Math.abs(sprite.height),
    };
  }
  return {
    x: sprite.x + (local.x - sprite.anchor.x * tex.width) * sx,
    y: sprite.y + (local.y - sprite.anchor.y * tex.height) * sy,
  };
}
