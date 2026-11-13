import { Assets, type Texture } from 'pixi.js';

let webp: boolean | null = null;

/** True when this browser can decode WebP (every Chromium / Safari we ship to). */
export function canUseWebp(): boolean {
  if (webp != null) return webp;
  if (typeof document === 'undefined') {
    webp = false;
    return false;
  }
  try {
    webp = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    webp = false;
  }
  return webp;
}

/** Same path with a `.webp` suffix when the browser supports it. */
export function imageSrc(pngUrl: string): string {
  if (!canUseWebp() || !/\.png$/i.test(pngUrl)) return pngUrl;
  return pngUrl.replace(/\.png$/i, '.webp');
}

/** Pixi load of a PNG, preferring the sibling WebP, falling back if that file is missing. */
export async function unloadAlias(alias: string): Promise<void> {
  try {
    await Assets.unload(alias);
  } catch {
    /* never loaded */
  }
}

export async function loadPngOrWebp(
  alias: string,
  pngUrl: string,
  data?: object,
): Promise<Texture> {
  const preferred = imageSrc(pngUrl);
  try {
    return await Assets.load<Texture>({ alias, src: preferred, data });
  } catch (err) {
    if (preferred === pngUrl) throw err;
    return await Assets.load<Texture>({ alias, src: pngUrl, data });
  }
}

export function dismissBootScreen(): void {
  const el = document.getElementById('boot');
  if (!el || el.classList.contains('boot--done')) return;
  el.classList.add('boot--done');
  window.setTimeout(() => el.remove(), 500);
}
