import { mapWorldBounds } from '../iso/math';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 1.5;

/** Minimum fraction of map bbox (width & height) that must remain inside the viewport. */
export const MAP_VISIBLE_MIN_FRAC = 0.3;

export type CameraState = {
  cameraX: number;
  cameraY: number;
  zoom: number;
};

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Zoom while keeping the world point under `anchorScreen` fixed on screen. */
export function zoomAtScreenAnchor(
  cam: CameraState,
  screenW: number,
  screenH: number,
  _cameraScreenX: number,
  _cameraScreenY: number,
  nextZoom: number,
  anchorScreen: { x: number; y: number },
): CameraState {
  const clamped = clampZoom(nextZoom);
  if (Math.abs(clamped - cam.zoom) < 0.0001) return { ...cam, zoom: clamped };

  const invDelta = 1 / clamped - 1 / cam.zoom;
  const nextCamX = cam.cameraX + (anchorScreen.x - screenW / 2) * invDelta;
  const nextCamY = cam.cameraY + (anchorScreen.y - screenH / 2) * invDelta;

  return { cameraX: nextCamX, cameraY: nextCamY, zoom: clamped };
}

export type MapScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function mapBoundsOnScreen(
  cam: CameraState,
  screenW: number,
  screenH: number,
): MapScreenRect {
  const bounds = mapWorldBounds();
  const camPx = screenW / 2 + cam.cameraX * cam.zoom;
  const camPy = screenH / 2 + cam.cameraY * cam.zoom;
  const left = camPx + bounds.minX * cam.zoom;
  const right = camPx + bounds.maxX * cam.zoom;
  const top = camPy + bounds.minY * cam.zoom;
  const bottom = camPy + bounds.maxY * cam.zoom;
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

/** Fraction of map bbox width/height visible inside [0, screenW] x [0, screenH]. */
export function mapVisibleFractions(
  cam: CameraState,
  screenW: number,
  screenH: number,
): { fracW: number; fracH: number; intersects: boolean } {
  const m = mapBoundsOnScreen(cam, screenW, screenH);
  if (m.width <= 0 || m.height <= 0) {
    return { fracW: 0, fracH: 0, intersects: false };
  }
  const visLeft = Math.max(0, m.left);
  const visRight = Math.min(screenW, m.right);
  const visTop = Math.max(0, m.top);
  const visBottom = Math.min(screenH, m.bottom);
  const iw = Math.max(0, visRight - visLeft);
  const ih = Math.max(0, visBottom - visTop);
  return {
    fracW: iw / m.width,
    fracH: ih / m.height,
    intersects: iw > 0 && ih > 0,
  };
}

/** Keep at least MAP_VISIBLE_MIN_FRAC of the map on screen by moving the camera only (never caps zoom). */
export function hardKeepMapPartiallyVisible(
  cam: CameraState,
  screenW: number,
  screenH: number,
): CameraState {
  let { cameraX, cameraY, zoom } = cam;
  zoom = clampZoom(zoom);
  const minF = MAP_VISIBLE_MIN_FRAC;

  for (let i = 0; i < 10; i++) {
    const state = { cameraX, cameraY, zoom };
    const m = mapBoundsOnScreen(state, screenW, screenH);
    let { fracW, fracH, intersects } = mapVisibleFractions(state, screenW, screenH);

    if (intersects && fracW >= minF && fracH >= minF) {
      return { cameraX, cameraY, zoom };
    }

    if (!intersects || fracW < minF) {
      const needW = m.width * minF;
      if (m.right < needW) {
        cameraX += (needW - m.right) / zoom;
      } else if (m.left > screenW - needW) {
        cameraX -= (m.left - (screenW - needW)) / zoom;
      } else if (m.width > screenW) {
        const cx = (m.left + m.right) / 2;
        cameraX += (screenW / 2 - cx) / zoom;
      } else if (!intersects) {
        const cx = (m.left + m.right) / 2;
        cameraX += (screenW / 2 - cx) / zoom;
      }
    }
    if (!intersects || fracH < minF) {
      const needH = m.height * minF;
      if (m.bottom < needH) {
        cameraY += (needH - m.bottom) / zoom;
      } else if (m.top > screenH - needH) {
        cameraY -= (m.top - (screenH - needH)) / zoom;
      } else if (m.height > screenH) {
        const cy = (m.top + m.bottom) / 2;
        cameraY += (screenH / 2 - cy) / zoom;
      } else if (!intersects) {
        const cy = (m.top + m.bottom) / 2;
        cameraY += (screenH / 2 - cy) / zoom;
      }
    }

    ({ fracW, fracH, intersects } = mapVisibleFractions({ cameraX, cameraY, zoom }, screenW, screenH));
    if (intersects && fracW >= minF - 0.002 && fracH >= minF - 0.002) {
      return { cameraX, cameraY, zoom };
    }
  }

  return { cameraX, cameraY, zoom };
}

/** Pinch zoom from session start (no per-frame compounding on current zoom). */
export function cameraFromPinchSession(
  session: {
    startZoom: number;
    startDist: number;
    startCamX: number;
    startCamY: number;
    startMid: { x: number; y: number };
  },
  currentDist: number,
  currentMid: { x: number; y: number },
  screenW: number,
  screenH: number,
): CameraState | null {
  if (!Number.isFinite(currentDist) || currentDist < 10) return null;
  if (!Number.isFinite(session.startDist) || session.startDist < 10) return null;

  const ratio = currentDist / session.startDist;
  if (!Number.isFinite(ratio)) return null;

  const nextZoom = clampZoom(session.startZoom * ratio);
  const startCamPx = screenW / 2 + session.startCamX * session.startZoom;
  const startCamPy = screenH / 2 + session.startCamY * session.startZoom;

  let next = zoomAtScreenAnchor(
    { cameraX: session.startCamX, cameraY: session.startCamY, zoom: session.startZoom },
    screenW,
    screenH,
    startCamPx,
    startCamPy,
    nextZoom,
    currentMid,
  );

  next = {
    cameraX: next.cameraX + (currentMid.x - session.startMid.x) / next.zoom,
    cameraY: next.cameraY + (currentMid.y - session.startMid.y) / next.zoom,
    zoom: next.zoom,
  };

  return hardKeepMapPartiallyVisible(next, screenW, screenH);
}

/** Nudge camera only if map bounds fall outside the viewport (no hard recenter). */
/** Center the map in the viewport (used at min zoom). */
export function centerMapInView(
  cam: CameraState,
  _screenW: number,
  _screenH: number,
): CameraState {
  const bounds = mapWorldBounds();
  const worldCx = (bounds.minX + bounds.maxX) / 2;
  const worldCy = (bounds.minY + bounds.maxY) / 2;
  const zoom = clampZoom(cam.zoom);
  return {
    cameraX: -worldCx,
    cameraY: -worldCy,
    zoom,
  };
}

export function softClampMapInView(
  cam: CameraState,
  screenW: number,
  screenH: number,
): CameraState {
  const bounds = mapWorldBounds();
  const camPx = screenW / 2 + cam.cameraX * cam.zoom;
  const camPy = screenH / 2 + cam.cameraY * cam.zoom;

  const left = camPx + bounds.minX * cam.zoom;
  const right = camPx + bounds.maxX * cam.zoom;
  const top = camPy + bounds.minY * cam.zoom;
  const bottom = camPy + bounds.maxY * cam.zoom;

  let { cameraX, cameraY } = cam;
  const margin = 24;

  if (right < margin) cameraX += (margin - right) / cam.zoom;
  if (left > screenW - margin) cameraX -= (left - (screenW - margin)) / cam.zoom;
  if (bottom < margin) cameraY += (margin - bottom) / cam.zoom;
  if (top > screenH - margin) cameraY -= (top - (screenH - margin)) / cam.zoom;

  return { cameraX, cameraY, zoom: clampZoom(cam.zoom) };
}
