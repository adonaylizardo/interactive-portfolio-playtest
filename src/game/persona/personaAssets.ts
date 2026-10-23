import { Assets, Rectangle, Texture } from 'pixi.js';

const cache = new Map<string, Texture>();
let loadedBytes = 0;
let loadPromise: Promise<void> | null = null;

function assetUrl(rel: string, dpr: number): string {
  const base = import.meta.env.BASE_URL;
  const suffix = dpr >= 2 ? '@2x' : '@1x';
  const path = rel.replace('@1x', suffix).replace('@2x', suffix);
  if (!path.includes('@')) {
    const dot = path.lastIndexOf('.');
    const stem = dot >= 0 ? path.slice(0, dot) : path;
    const ext = dot >= 0 ? path.slice(dot) : '.png';
    return `${base}primera-persona/${stem}${suffix}${ext}`;
  }
  return `${base}primera-persona/${path}`;
}

async function loadOne(key: string, url: string): Promise<Texture> {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = await Assets.load<Texture>({ alias: key, src: url, data: { crossOrigin: 'anonymous' } });
  cache.set(key, tex);
  const w = tex.width ?? 256;
  const h = tex.height ?? 256;
  loadedBytes += Math.max(32_000, w * h);
  return tex;
}

export function personaAssetReport(): { textures: number; bytesLoaded: number; keys: string[] } {
  return { textures: cache.size, bytesLoaded: loadedBytes, keys: [...cache.keys()] };
}

export async function ensurePersonaBoot(dpr: number): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const sky = assetUrl('piezas/cielo-noche__tile@1x.png', dpr);
    const avila = assetUrl('piezas/cerros-avila__tile@1x.png', dpr);
    await Promise.all([
      loadOne(`cielo:${dpr}`, sky),
      loadOne(`avila:${dpr}`, avila),
      loadOne(`adonay-idle:${dpr}`, assetUrl('piezas/adonay-espalda__idle@1x.png', dpr)),
    ]);
  })();
  return loadPromise;
}

export async function loadFacade(id: string, lightsOn: boolean, dpr: number): Promise<Texture | null> {
  const tag = lightsOn ? 'luz-encendida' : 'luz-apagada';
  const key = `${id}__${tag}:${dpr}`;
  const url = assetUrl(`piezas/${id}__${tag}@1x.png`, dpr);
  try {
    return await loadOne(key, url);
  } catch {
    return null;
  }
}

export async function loadProp(name: string, dpr: number): Promise<Texture | null> {
  const key = `${name}:${dpr}`;
  try {
    return await loadOne(key, assetUrl(`piezas/${name}@1x.png`, dpr));
  } catch {
    return null;
  }
}

export async function loadStrip(prefix: string, dpr: number): Promise<Texture | null> {
  const key = `${prefix}:${dpr}`;
  try {
    return await loadOne(key, assetUrl(`piezas/${prefix}@1x.png`, dpr));
  } catch {
    return null;
  }
}

export async function loadJacCabin(lightsOn: boolean, dpr: number): Promise<{
  capo: Texture | null;
  cabina: Texture | null;
  volante: Texture | null;
}> {
  const tag = lightsOn ? 'luces-on' : 'luces-off';
  const [capo, cabina, volante] = await Promise.all([
    loadOne(`capo:${dpr}`, assetUrl('piezas/jac-t9-capo@1x.png', dpr)),
    loadOne(`cabina-${tag}:${dpr}`, assetUrl(`piezas/jac-t9-cabina__${tag}@1x.png`, dpr)),
    loadOne(`volante:${dpr}`, assetUrl('piezas/jac-t9-volante@1x.png', dpr)),
  ]);
  return { capo, cabina, volante };
}

export function textureFrame(tex: Texture, frameW: number, index: number): Texture {
  return new Texture({
    source: tex.source,
    frame: new Rectangle(index * frameW, 0, frameW, tex.height),
  });
}
