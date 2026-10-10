const HASH_PREFIX = 'view=';

export type CameraView = {
  x: number;
  y: number;
  zoom: number;
  interiorId?: string | null;
};

function hashParams(): URLSearchParams {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return new URLSearchParams();
  if (raw.startsWith(HASH_PREFIX)) {
    return new URLSearchParams(raw.slice(HASH_PREFIX.length));
  }
  return new URLSearchParams(raw);
}

export function parseCameraFromHash(): CameraView | null {
  const params = hashParams();
  const x = Number(params.get('x'));
  const y = Number(params.get('y'));
  const zoom = Number(params.get('z'));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
  const interiorId = params.get('in');
  return {
    x,
    y,
    zoom,
    interiorId: interiorId || null,
  };
}

export function parseInteriorFromHash(): string | null {
  return hashParams().get('in');
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastInteriorId: string | null = null;

function flushHash(view: CameraView): void {
  const interiorId = view.interiorId !== undefined ? view.interiorId : lastInteriorId;
  if (view.interiorId !== undefined) lastInteriorId = view.interiorId;
  const params = new URLSearchParams();
  params.set('x', view.x.toFixed(1));
  params.set('y', view.y.toFixed(1));
  params.set('z', view.zoom.toFixed(3));
  if (interiorId) params.set('in', interiorId);
  const next = `#${HASH_PREFIX}${params.toString()}`;
  if (location.hash !== next) {
    history.replaceState(null, '', next);
  }
}

export function writeCameraToHash(view: CameraView): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    flushHash(view);
  }, 150);
}

export function writeInteriorToHash(interiorId: string | null, cam: CameraView): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  flushHash({ ...cam, interiorId });
}
