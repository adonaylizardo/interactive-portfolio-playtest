import { mapWorldBounds } from '../iso/math';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;

export type CameraState = {
  cameraX: number;
  cameraY: number;
  zoom: number;
};

/** Zoom while keeping the world point under `anchorScreen` fixed on screen. */
export function zoomAtScreenAnchor(
  cam: CameraState,
  screenW: number,
  screenH: number,
  cameraScreenX: number,
  cameraScreenY: number,
  nextZoom: number,
  anchorScreen: { x: number; y: number },
): CameraState {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  if (Math.abs(clamped - cam.zoom) < 0.0001) return { ...cam, zoom: clamped };

  const wx = (anchorScreen.x - cameraScreenX) / cam.zoom;
  const wy = (anchorScreen.y - cameraScreenY) / cam.zoom;

  const nextCamX = wx - (anchorScreen.x - screenW / 2) / clamped;
  const nextCamY = wy - (anchorScreen.y - screenH / 2) / clamped;

  return { cameraX: nextCamX, cameraY: nextCamY, zoom: clamped };
}

/** Nudge camera only if map bounds fall outside the viewport (no hard recenter). */
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

  return { cameraX, cameraY, zoom: cam.zoom };
}
