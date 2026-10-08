const HASH_PREFIX = 'view=';

export type CameraView = {
  x: number;
  y: number;
  zoom: number;
};

export function parseCameraFromHash(): CameraView | null {
  const hash = location.hash.replace(/^#/, '');
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    const params = new URLSearchParams(hash.slice(HASH_PREFIX.length));
    const x = Number(params.get('x'));
    const y = Number(params.get('y'));
    const zoom = Number(params.get('z'));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom)) return null;
    return { x, y, zoom };
  } catch {
    return null;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

export function writeCameraToHash(view: CameraView): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const params = new URLSearchParams();
    params.set('x', view.x.toFixed(1));
    params.set('y', view.y.toFixed(1));
    params.set('z', view.zoom.toFixed(3));
    const next = `#${HASH_PREFIX}${params.toString()}`;
    if (location.hash !== next) {
      history.replaceState(null, '', next);
    }
  }, 150);
}
