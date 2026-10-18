const HASH_PREFIX = 'view=';

export type CameraView = {
  x: number;
  y: number;
  zoom: number;
  interiorId?: string | null;
  jacX?: number;
  jacY?: number;
  jacDir?: string;
  charX?: number;
  charY?: number;
};

export type HistoryNavigationState = {
  playtest?: boolean;
  interior?: string | null;
  preview?: string | null;
  outdoorCam?: { x: number; y: number; zoom: number };
};

function hashParams(): URLSearchParams {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return new URLSearchParams();
  if (raw.startsWith(HASH_PREFIX)) {
    return new URLSearchParams(raw.slice(HASH_PREFIX.length));
  }
  return new URLSearchParams(raw);
}

/** Building ids that name an NDA client get a neutral public id in the URL. */
const PUBLIC_INTERIOR_IDS: Record<string, string> = { volaris: 'airline' };

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
  if (view.jacX != null && view.jacY != null) {
    params.set('jx', view.jacX.toFixed(2));
    params.set('jy', view.jacY.toFixed(2));
    if (view.jacDir) params.set('jd', view.jacDir);
  }
  if (view.charX != null && view.charY != null) {
    params.set('px', view.charX.toFixed(2));
    params.set('py', view.charY.toFixed(2));
  }
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
  const jacX = num('jx');
  const jacY = num('jy');
  const charX = num('px');
  const charY = num('py');
  return {
    x,
    y,
    zoom,
    interiorId: interiorId || null,
    jacX: Number.isFinite(jacX) ? jacX : undefined,
    jacY: Number.isFinite(jacY) ? jacY : undefined,
    jacDir: params.get('jd') || undefined,
    charX: Number.isFinite(charX) ? charX : undefined,
    charY: Number.isFinite(charY) ? charY : undefined,
  };
}

export function parseInteriorFromHash(): string | null {
  return interiorIdFromPublic(hashParams().get('in'));
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastInteriorId: string | null = null;
let suppressDebouncedHash = false;
let popstateHandler: ((ev: PopStateEvent) => void) | null = null;

export function setHashWriteSuppressed(suppressed: boolean): void {
  suppressDebouncedHash = suppressed;
}

function flushHash(view: CameraView, replace: boolean): void {
  const interiorId = view.interiorId !== undefined ? view.interiorId : lastInteriorId;
  if (view.interiorId !== undefined) lastInteriorId = view.interiorId;
  const next = buildHash({ ...view, interiorId: interiorId || null });
  if (location.hash === next) return;
  const prev = history.state as HistoryNavigationState | null;
  const state: HistoryNavigationState = {
    playtest: true,
    interior: interiorId || null,
    preview: prev?.preview ?? null,
    outdoorCam: prev?.outdoorCam,
  };
  // Van / player / camera pose always replaceState. A push here is what made
  // Back after reload teleport to the spawn jx/jy entry.
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
