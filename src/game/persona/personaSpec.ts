import piezas from '../../../art/primera-persona/piezas.json';

export const PERSONA_REF = { w: 1280, h: 720 } as const;
export const FOCAL_PX_1X = piezas.focal_px_1x as number;
export const HORIZON_Y_1X = piezas.camaras['tercera-persona'].horizonte_y as number;
export const EYE_TP_M = piezas.camaras['tercera-persona'].alto_m as number;
export const BEHIND_TP_M = piezas.camaras['tercera-persona'].detras_m as number;
export const EYE_JAC_M = piezas.camaras['jac-t9'].ojo_m as number;
export const PX_PER_M = 16;
export const FEET_Y_1X = piezas.frames.c.camara.adonay.pies_y as number;
export const ADONAY_ALTO_PX_1X = piezas.frames.c.camara.adonay.alto_px as number;
export const PANTONE_DX_M = piezas.frames.c.camara.pantone.dx_m as number;
export const PANTONE_DZ_M = piezas.frames.c.camara.pantone.dz_m as number;
export const PANTONE_SCALE = piezas.frames.c.camara.pantone.escala_pixi as number;
export const WHEEL_POS_1X = [640, 610] as const;

/** Frame-C parked T9 (passenger side x, nose z, physical width for billboard scale). */
export const JAC_T9_POSE = { x: 2.0, z: 8.2, widthM: 1.96 } as const;
/** Beside-van target width @1280 reference (frame C ≈0.24–0.35 vw). */
export const T9_TARGET_VW = 0.24;
/** Single art-pipeline multiplier on projected billboard scale (not per-frame vw renorm). */
export const T9_PROJECTION_CALIB = 1.48;

/** Calibration: jac spawn tile ↔ frame-C player meters. */
export const CAL_TILE = { x: 27, y: 18 };
export const CAL_M = { x: -0.15, z: 5.649 };
export const METERS_PER_TILE = 2.35;

export type PiezaEntry = (typeof piezas.piezas)[number];

export function piezaById(id: string): PiezaEntry | undefined {
  return piezas.piezas.find((p) => p.id === id);
}

export const FACADE_BY_BUILDING: Record<string, string> = {
  catedral: 'fachada-catedral-de-barquisimeto',
  flor: 'fachada-flor-de-venezuela-profundidad',
  sambil: 'fachada-sambil-barquisimeto',
  'biblioteca-ingenieria': 'fachada-biblioteca-ingenieria',
  'teresa-carreno': 'fachada-teresa-carreno',
  estudio: 'fachada-estudio-6x6',
  volaris: 'fachada-casa-volaris',
  bain: 'fachada-casa-bain',
  mentoria: 'fachada-casa-mentoria',
  finoa: 'fachada-casa-finoa',
  pg: 'fachada-casa-pg',
};

export function personaEnabled(): boolean {
  return import.meta.env.BASE_URL.includes('preview-persona');
}

export function tileToPersonaMeters(tx: number, ty: number): { x: number; z: number } {
  return {
    x: CAL_M.x + (tx - CAL_TILE.x) * METERS_PER_TILE,
    z: CAL_M.z + (ty - CAL_TILE.y) * METERS_PER_TILE,
  };
}

/** Live parked T9 anchor in persona meters (van centre on the ground plane). */
export function jacPersonaAnchorMeters(jacCx: number, jacCy: number): { x: number; z: number; widthM: number } {
  const van = tileToPersonaMeters(jacCx, jacCy);
  return { x: van.x, z: van.z, widthM: JAC_T9_POSE.widthM };
}
