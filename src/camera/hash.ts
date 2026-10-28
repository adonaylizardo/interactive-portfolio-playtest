import { isReadingHash, isSupportedReadingHash } from '../ui/readingRoute';

const HASH_PREFIX = 'view=';

export type CameraView = {
  x: number;
  y: number;
  zoom: number;
  interiorId?: string | null;
};

export type HistoryNavigationState = {
  playtest?: boolean;
  interior?: string | null;
  outdoorCam?: { x: number; y: number; zoom: number };
};

function hashParams(): URLSearchParams {
  const raw = location.hash.replace(/^#/, '');
  if (raw.startsWith('/leer')) return new URLSearchParams();
  if (!raw) return new URLSearchParams();
  if (raw.startsWith(HASH_PREFIX)) {
    return new URLSearchParams(raw.slice(HASH_PREFIX.length));
  }
  return new URLSearchParams(raw);
}

/** Optional public URL aliases for interior building ids (empty = use id as-is). */
const PUBLIC_INTERIOR_IDS: Record<string, string> = {};

export function publicInteriorId(interiorId: string): string {
  return PUBLIC_INTERIOR_IDS[interiorId] ?? interiorId;
}

function interiorIdFromPublic(id: string | null): string | null {
  if (!id) return id;
  return Object.keys(PUBLIC_INTERIOR_IDS).find((k) => PUBLIC_INTERIOR_IDS[k] === id) ?? id;
}

export function buildHash(view: CameraView): string {
  const params = new URLSearchParams();
  params.set('x', view.x.toFixed(1));
  params.set('y', view.y.toFixed(1));
  params.set('z', view.zoom.toFixed(3));
  if (view.interiorId) params.set('in', publicInteriorId(view.interiorId));
  return `#${HASH_PREFIX}${params.toString()}`;
}

export function parseCameraFromHash(): CameraView | null {
  const params = hashParams();
  const num = (key: string) => (params.has(key) ? Number(params.get(key)) : NaN);
  const x = num('x');
  const y = num('y');
  const zoom = num('z');
  const interiorId = interiorIdFromPublic(params.get('in'));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) {
    if (!interiorId) return null;
    return { x: 0, y: 0, zoom: 0.85, interiorId };
  }
  return {
    x,
    y,
    zoom,
    interiorId: interiorId || null,
  };
}

export function parseInteriorFromHash(): string | null {
  const raw = hashParams().get('in');
  if (!raw) return null;
  if (!/^[\w-]+$/i.test(raw)) return null;
  return interiorIdFromPublic(raw);
}

/** False when the hash is non-empty but not a supported playtest route shape. */
export function isSupportedPlaytestHash(hash = location.hash): boolean {
  const raw = hash.replace(/^#/, '').trim();
  if (!raw) return true;
  if (isSupportedReadingHash(hash)) return true;
  if (raw.startsWith('/') || raw.includes('<') || raw.includes('>')) return false;
  if (/^caso=/i.test(raw) || /^\/caso\//i.test(raw) || /^edificio\//i.test(raw)) return false;
  if (raw.startsWith(HASH_PREFIX)) {
    const params = new URLSearchParams(raw.slice(HASH_PREFIX.length));
    const inRaw = params.get('in');
    if (inRaw != null && !/^[\w-]+$/i.test(inRaw)) return false;
    return parseCameraFromHash() !== null || inRaw !== null;
  }
  if (/^in=/i.test(raw)) {
    const m = raw.match(/^in=(.+)$/i);
    return !!(m && /^[\w-]+$/i.test(m[1]));
  }
  return false;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastInteriorId: string | null = null;
let suppressDebouncedHash = false;
let popstateHandler: ((ev: PopStateEvent) => void) | null = null;

export function setHashWriteSuppressed(suppressed: boolean): void {
  suppressDebouncedHash = suppressed;
}

function flushHash(view: CameraView, replace: boolean): void {
  if (isReadingHash()) return;
  const interiorId = view.interiorId !== undefined ? view.interiorId : lastInteriorId;
  if (view.interiorId !== undefined) lastInteriorId = view.interiorId;
  const next = buildHash({ ...view, interiorId: interiorId || null });
  if (location.hash === next) return;
  const state: HistoryNavigationState = {
    playtest: true,
    interior: interiorId || null,
    outdoorCam: (history.state as HistoryNavigationState | null)?.outdoorCam,
  };
  if (replace) {
    history.replaceState(state, '', next);
  } else {
    history.pushState(state, '', next);
  }
}

export function writeCameraToHash(view: CameraView): void {
  if (suppressDebouncedHash) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    flushHash(view, true);
  }, 150);
}

export function writeInteriorToHash(
  interiorId: string | null,
  cam: CameraView,
  mode: 'replace' | 'push' = 'replace',
): void {
  if (isReadingHash() || suppressDebouncedHash) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  lastInteriorId = interiorId;
  flushHash({ ...cam, interiorId }, mode === 'push' ? false : true);
}

export function pushInteriorEntry(
  interiorId: string,
  cam: CameraView,
  outdoorCam: { x: number; y: number; zoom: number },
): void {
  if (isReadingHash() || suppressDebouncedHash) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  lastInteriorId = interiorId;
  const next = buildHash({ ...cam, interiorId });
  const state: HistoryNavigationState = {
    playtest: true,
    interior: interiorId,
    outdoorCam,
  };
  history.pushState(state, '', next);
}

export function replaceOutdoorHash(cam: CameraView): void {
  if (isReadingHash() || suppressDebouncedHash) return;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  lastInteriorId = null;
  const next = buildHash({ ...cam, interiorId: null });
  history.replaceState({ playtest: true, interior: null }, '', next);
}

export function navigateBackFromInterior(): void {
  history.back();
}

export function bindPopstate(handler: (ev: PopStateEvent) => void): void {
  if (popstateHandler) window.removeEventListener('popstate', popstateHandler);
  popstateHandler = handler;
  window.addEventListener('popstate', handler);
}
