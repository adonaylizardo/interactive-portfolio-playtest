import { mapWorldBounds } from '../iso/math';

export const ZOOM_MAX = 1.5;

/** Legacy constant — prefer `zoomMinForViewport()` (dynamic per screen size). */
export const ZOOM_MIN = 0.25;

/** Minimum fraction of map bbox (width & height) that must remain inside the viewport when zoomed in. */
export const MAP_VISIBLE_MIN_FRAC = 0.3;

/** Screen-pixel margin when fitting the full map at minimum zoom. */
export const MAP_FIT_MARGIN_PX = 16;

let viewportScreenW = 1280;
let viewportScreenH = 800;
let fitMarginLeft = MAP_FIT_MARGIN_PX;
let fitMarginTop = MAP_FIT_MARGIN_PX;
let fitMarginRight = MAP_FIT_MARGIN_PX;
let fitMarginBottom = MAP_FIT_MARGIN_PX;

export function setCameraViewportSize(screenW: number, screenH: number): void {
  if (Number.isFinite(screenW) && screenW > 0) viewportScreenW = screenW;
  if (Number.isFinite(screenH) && screenH > 0) viewportScreenH = screenH;
}

/** Extra inset (e.g. desktop checklist) applied when computing min zoom fit. */
export function setCameraFitMargins(margins: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}): void {
  fitMarginLeft = margins.left ?? MAP_FIT_MARGIN_PX;
  fitMarginTop = margins.top ?? MAP_FIT_MARGIN_PX;
  fitMarginRight = margins.right ?? MAP_FIT_MARGIN_PX;
  fitMarginBottom = margins.bottom ?? MAP_FIT_MARGIN_PX;
}

export function cameraFitMargins(): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  return {
    left: fitMarginLeft,
    top: fitMarginTop,
    right: fitMarginRight,
    bottom: fitMarginBottom,
  };
}

export type CameraState = {
  cameraX: number;
  cameraY: number;
  zoom: number;
};

/** Smallest zoom (most zoomed out) so the full 64×64 map bbox fits in the viewport with margin. */
export function zoomMinForViewport(
  screenW: number,
  screenH: number,
  margin = MAP_FIT_MARGIN_PX,
): number {
  const bounds = mapWorldBounds();
  const mapW = bounds.maxX - bounds.minX;
  const mapH = bounds.maxY - bounds.minY;
  if (mapW <= 0 || mapH <= 0 || screenW <= 0 || screenH <= 0) return ZOOM_MIN;
  const ml = Math.max(margin, fitMarginLeft);
  const mr = Math.max(margin, fitMarginRight);
  const mt = Math.max(margin, fitMarginTop);
  const mb = Math.max(margin, fitMarginBottom);
  const innerW = Math.max(1, screenW - ml - mr);
  const innerH = Math.max(1, screenH - mt - mb);
  const fit = Math.min(innerW / mapW, innerH / mapH);
  return Math.min(ZOOM_MAX, Math.max(0.04, fit));
}

export function clampZoom(
  zoom: number,
  screenW: number = viewportScreenW,
  screenH: number = viewportScreenH,
): number {
  const zMin = zoomMinForViewport(screenW, screenH);
  if (!Number.isFinite(zoom)) return zMin;
  return Math.min(ZOOM_MAX, Math.max(zMin, zoom));
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
  const clamped = clampZoom(nextZoom, screenW, screenH);
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

export function isMapFullyVisibleOnScreen(
  cam: CameraState,
  screenW: number,
  screenH: number,
  margin = MAP_FIT_MARGIN_PX,
): boolean {
  const ml = Math.max(margin, fitMarginLeft);
  const mr = Math.max(margin, fitMarginRight);
  const mt = Math.max(margin, fitMarginTop);
  const mb = Math.max(margin, fitMarginBottom);
  const m = mapBoundsOnScreen(cam, screenW, screenH);
  return (
    m.left >= ml - 2.5 &&
    m.right <= screenW - mr + 2.5 &&
    m.top >= mt - 2.5 &&
    m.bottom <= screenH - mb + 2.5
  );
}

/** Fraction of map bbox width/height visible inside the viewport. */
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

/** Fraction of viewport width/height covered by the map (keep-visible uses this, not map bbox %). */
export function viewportMapCoverage(
  cam: CameraState,
  screenW: number,
  screenH: number,
): { covW: number; covH: number; intersects: boolean } {
  const m = mapBoundsOnScreen(cam, screenW, screenH);
  const visLeft = Math.max(0, m.left);
  const visRight = Math.min(screenW, m.right);
  const visTop = Math.max(0, m.top);
  const visBottom = Math.min(screenH, m.bottom);
  const iw = Math.max(0, visRight - visLeft);
  const ih = Math.max(0, visBottom - visTop);
  return {
    covW: screenW > 0 ? iw / screenW : 0,
    covH: screenH > 0 ? ih / screenH : 0,
    intersects: iw > 0 && ih > 0,
  };
}

/** Keep entire map bbox inside the viewport (used at minimum zoom). */
export function clampPanMapFullyInView(
  cam: CameraState,
  screenW: number,
  screenH: number,
  margin = MAP_FIT_MARGIN_PX,
): CameraState {
  const ml = Math.max(margin, fitMarginLeft);
  const mr = Math.max(margin, fitMarginRight);
  const mt = Math.max(margin, fitMarginTop);
  const mb = Math.max(margin, fitMarginBottom);
  let { cameraX, cameraY, zoom } = cam;
  zoom = clampZoom(zoom, screenW, screenH);

  for (let i = 0; i < 10; i++) {
    const m = mapBoundsOnScreen({ cameraX, cameraY, zoom }, screenW, screenH);
    let changed = false;
    if (m.left > ml) {
      cameraX -= (m.left - ml) / zoom;
      changed = true;
    }
    if (m.right < screenW - mr) {
      cameraX += (screenW - mr - m.right) / zoom;
      changed = true;
    }
    if (m.top > mt) {
      cameraY -= (m.top - mt) / zoom;
      changed = true;
    }
    if (m.bottom < screenH - mb) {
      cameraY += (screenH - mb - m.bottom) / zoom;
      changed = true;
    }
    if (!changed) break;
  }

  return { cameraX, cameraY, zoom };
}

/** After pan/zoom/pinch: partial visibility when zoomed in; full-map pan clamp at min zoom. */
export function stabilizeCameraAfterGesture(
  cam: CameraState,
  screenW: number,
  screenH: number,
): CameraState {
  const zMin = zoomMinForViewport(screenW, screenH);
  let next = { ...cam, zoom: clampZoom(cam.zoom, screenW, screenH) };
  if (next.zoom <= zMin + 0.0005) {
    return clampPanMapFullyInView(next, screenW, screenH);
  }
  return hardKeepMapPartiallyVisible(next, screenW, screenH);
}

/** Keep at least MAP_VISIBLE_MIN_FRAC of the viewport over the map (camera position only; never caps zoom). */
export function hardKeepMapPartiallyVisible(
  cam: CameraState,
  screenW: number,
  screenH: number,
): CameraState {
  let { cameraX, cameraY, zoom } = cam;
  zoom = clampZoom(zoom, screenW, screenH);
  const minF = MAP_VISIBLE_MIN_FRAC;

  for (let i = 0; i < 12; i++) {
    const state = { cameraX, cameraY, zoom };
    const m = mapBoundsOnScreen(state, screenW, screenH);
    let { covW, covH, intersects } = viewportMapCoverage(state, screenW, screenH);

    if (intersects && covW >= minF && covH >= minF) {
      return { cameraX, cameraY, zoom };
    }

    if (!intersects || covW < minF) {
      const needW = screenW * minF;
      if (m.right < needW) {
        cameraX += (needW - m.right) / zoom;
      } else if (m.left > screenW - needW) {
        cameraX -= (m.left - (screenW - needW)) / zoom;
      } else if (!intersects) {
        const cx = (m.left + m.right) / 2;
        cameraX += (screenW / 2 - cx) / zoom;
      }
    }
    if (!intersects || covH < minF) {
      const needH = screenH * minF;
      if (m.bottom < needH) {
        cameraY += (needH - m.bottom) / zoom;
      } else if (m.top > screenH - needH) {
        cameraY -= (m.top - (screenH - needH)) / zoom;
      } else if (!intersects) {
        const cy = (m.top + m.bottom) / 2;
        cameraY += (screenH / 2 - cy) / zoom;
      }
    }

    ({ covW, covH, intersects } = viewportMapCoverage({ cameraX, cameraY, zoom }, screenW, screenH));
    if (intersects && covW >= minF - 0.002 && covH >= minF - 0.002) {
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

  const nextZoom = clampZoom(session.startZoom * ratio, screenW, screenH);
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

  return stabilizeCameraAfterGesture(next, screenW, screenH);
}

/** Center the map in the viewport (used at min zoom). */
export function centerMapInView(
  cam: CameraState,
  _screenW: number,
  _screenH: number,
): CameraState {
  const bounds = mapWorldBounds();
  const worldCx = (bounds.minX + bounds.maxX) / 2;
  const worldCy = (bounds.minY + bounds.maxY) / 2;
  const zoom = clampZoom(cam.zoom, _screenW, _screenH);
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
  return clampPanMapFullyInView(cam, screenW, screenH);
}
