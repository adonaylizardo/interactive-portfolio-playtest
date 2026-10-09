import mapData from './mapa_datos.json';

export type MapCell = {
  walkable: boolean;
  groundId: string;
};

export type MapObject = {
  id: string;
  type: 'tile' | 'prop' | 'building';
  name: string;
  state: string;
  x: number;
  y: number;
  footprintX?: number;
  footprintY?: number;
  w?: number;
  h?: number;
  walkable?: boolean;
  door?: { x: number; y: number };
  doorFace?: '+y' | '+x';
  panelTitle?: string;
};

export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 64;
export const TILE_W = 128;
export const TILE_H = 64;

export const INICIO = mapData.inicio as [number, number];
export const MAP_TRAMOS = mapData.tramos;
export const MAP_EDIFICIOS = mapData.edificios;
export const REDOMA_ANILLO = mapData.redoma_anillo as [number, number][];

const PANEL_TITLES: Record<string, string> = {
  estudio: 'Estudio',
  volaris: 'Volaris',
  bain: 'Bain',
  mentoria: 'Mentoría',
  finoa: 'Finoa',
  pg: 'P&G',
  sambil: 'Sambil',
  catedral: 'Catedral',
  flor: 'Flor de Venezuela',
};

type EdificioJson = {
  x: number;
  y: number;
  w: number;
  h: number;
  cara_puerta: '+y' | '+x' | null;
  acceso: [number, number];
  paisaje: boolean;
  interior: boolean;
};

function footprintTiles(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      out.push({ x: x + dx, y: y + dy });
    }
  }
  return out;
}

export function anchorForBuilding(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return { x: x + Math.floor(w / 2), y: y + h - 1 };
}

/** Front-edge frame only: x=63 (se), y=63 (sw), corner (63,63). Back edges x=0/y=0 have no frame tile. */
const MURO_FOOTPRINT = { x: 35, y: 40, w: 3, h: 2 };
const MURO_APPROACH: [number, number] = [38, 41];

function nearMuroClearance(tx: number, ty: number): boolean {
  if (tx === MURO_APPROACH[0] && ty === MURO_APPROACH[1]) return false;
  for (let dy = 0; dy < MURO_FOOTPRINT.h; dy++) {
    for (let dx = 0; dx < MURO_FOOTPRINT.w; dx++) {
      const fx = MURO_FOOTPRINT.x + dx;
      const fy = MURO_FOOTPRINT.y + dy;
      if (Math.max(Math.abs(tx - fx), Math.abs(ty - fy)) <= 1) return true;
    }
  }
  return false;
}

function borderKind(tx: number, ty: number): string {
  const last = MAP_WIDTH - 1;
  if (tx === last && ty === last) return 'tile/suelo/borde-esquina-s';
  if (tx === last && ty < last) return 'tile/suelo/borde-se';
  if (ty === last && tx < last) return 'tile/suelo/borde-sw';
  return '';
}

/** Provisional filler — keeps gaps visually occupied; not enterable. */
const FILLER_PROPS: { kind: 'tree' | 'bench' | 'lamp' | 'plaza'; x: number; y: number }[] = [
  { kind: 'plaza', x: 29, y: 38 },
  { kind: 'plaza', x: 30, y: 38 },
  { kind: 'plaza', x: 31, y: 38 },
  { kind: 'plaza', x: 32, y: 38 },
  { kind: 'plaza', x: 33, y: 38 },
  { kind: 'tree', x: 27, y: 38 },
  { kind: 'tree', x: 34, y: 38 },
  { kind: 'tree', x: 26, y: 37 },
  { kind: 'tree', x: 35, y: 37 },
  { kind: 'bench', x: 30, y: 39 },
  { kind: 'bench', x: 32, y: 39 },
  { kind: 'lamp', x: 28, y: 39 },
  { kind: 'tree', x: 20, y: 32 },
  { kind: 'tree', x: 41, y: 32 },
  { kind: 'tree', x: 18, y: 28 },
  { kind: 'tree', x: 43, y: 28 },
  { kind: 'tree', x: 16, y: 22 },
  { kind: 'tree', x: 50, y: 22 },
  { kind: 'tree', x: 22, y: 18 },
  { kind: 'tree', x: 40, y: 18 },
  { kind: 'bench', x: 19, y: 34 },
  { kind: 'bench', x: 42, y: 34 },
  { kind: 'lamp', x: 17, y: 36 },
  { kind: 'lamp', x: 49, y: 36 },
  { kind: 'tree', x: 23, y: 42 },
  { kind: 'tree', x: 50, y: 40 },
  { kind: 'tree', x: 15, y: 40 },
  { kind: 'plaza', x: 28, y: 37 },
  { kind: 'plaza', x: 34, y: 37 },
  { kind: 'bench', x: 29, y: 40 },
  { kind: 'bench', x: 33, y: 40 },
  { kind: 'lamp', x: 31, y: 40 },
  { kind: 'lamp', x: 36, y: 39 },
  { kind: 'tree', x: 25, y: 35 },
  { kind: 'tree', x: 37, y: 35 },
  { kind: 'tree', x: 21, y: 38 },
  { kind: 'tree', x: 44, y: 38 },
  { kind: 'tree', x: 12, y: 30 },
  { kind: 'tree', x: 52, y: 30 },
  { kind: 'tree', x: 10, y: 45 },
  { kind: 'tree', x: 54, y: 44 },
  { kind: 'tree', x: 8, y: 50 },
  { kind: 'tree', x: 58, y: 50 },
  { kind: 'tree', x: 6, y: 55 },
  { kind: 'tree', x: 60, y: 55 },
  { kind: 'bench', x: 24, y: 36 },
  { kind: 'bench', x: 38, y: 36 },
  { kind: 'lamp', x: 20, y: 36 },
  { kind: 'lamp', x: 45, y: 36 },
];

export function buildWorld(): { cells: MapCell[][]; objects: MapObject[] } {
  const cells: MapCell[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    cells[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const frame = borderKind(x, y);
      cells[y][x] = {
        walkable: !frame,
        groundId: frame || 'tile/ground/default',
      };
    }
  }

  const carveStreet = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
    if (borderKind(tx, ty)) return;
    cells[ty][tx].walkable = true;
    cells[ty][tx].groundId = 'tile/path/street';
  };

  for (const tramo of mapData.tramos) {
    for (const [tx, ty] of tramo.camino as [number, number][]) {
      carveStreet(tx, ty);
    }
  }
  for (let x = 17; x <= 44; x++) carveStreet(x, 36);
  for (let y = 17; y <= 45; y++) carveStreet(46, y);

  for (const [tx, ty] of REDOMA_ANILLO) carveStreet(tx, ty);

  const objects: MapObject[] = [];
  const doorTiles = new Set<string>();

  for (const [id, raw] of Object.entries(mapData.edificios) as [string, EdificioJson][]) {
    const ed = raw;
    const anchor = anchorForBuilding(ed.x, ed.y, ed.w, ed.h);
    for (const { x: fx, y: fy } of footprintTiles(ed.x, ed.y, ed.w, ed.h)) {
      if (fx < 0 || fy < 0 || fx >= MAP_WIDTH || fy >= MAP_HEIGHT) continue;
      if (borderKind(fx, fy)) continue;
      cells[fy][fx].walkable = false;
      cells[fy][fx].groundId = 'tile/building/footprint';
    }

    if (ed.paisaje) {
      const kind =
        id === 'obelisco' ? 'obelisco' : id === 'redoma' ? 'redoma' : id === 'muro' ? 'muro' : 'paisaje';
      objects.push({
        id: `paisaje/${id}`,
        type: 'prop',
        name: kind,
        state: 'default',
        x: anchor.x,
        y: anchor.y,
        footprintX: ed.x,
        footprintY: ed.y,
        w: ed.w,
        h: ed.h,
        walkable: false,
      });
      if (Array.isArray(ed.acceso) && ed.acceso.length >= 2) {
        const [ax, ay] = ed.acceso as [number, number];
        if (ax >= 0 && ay >= 0 && ax < MAP_WIDTH && ay < MAP_HEIGHT && !borderKind(ax, ay)) {
          cells[ay][ax].walkable = true;
        }
      }
      continue;
    }

    const [ax, ay] = ed.acceso;
    doorTiles.add(`${ax},${ay}`);
    carveStreet(ax, ay);

    objects.push({
      id: `building/${id}`,
      type: 'building',
      name: id,
      state: 'default',
      x: anchor.x,
      y: anchor.y,
      footprintX: ed.x,
      footprintY: ed.y,
      w: ed.w,
      h: ed.h,
      walkable: false,
      door: { x: ax, y: ay },
      doorFace: ed.cara_puerta ?? '+y',
      panelTitle: PANEL_TITLES[id] ?? id,
    });
  }

  for (const f of FILLER_PROPS) {
    if (f.x < 0 || f.y < 0 || f.x >= MAP_WIDTH || f.y >= MAP_HEIGHT) continue;
    if (nearMuroClearance(f.x, f.y)) continue;
    if (!cells[f.y][f.x].walkable) continue;
    if (cells[f.y][f.x].groundId.includes('path/street')) continue;
    if (doorTiles.has(`${f.x},${f.y}`)) continue;
    if (f.kind === 'plaza') {
      cells[f.y][f.x].groundId = 'tile/ground/park';
      continue;
    }
    cells[f.y][f.x].walkable = false;
    objects.push({
      id: `prop/${f.kind}/${f.x}-${f.y}`,
      type: 'prop',
      name: f.kind,
      state: 'default',
      x: f.x,
      y: f.y,
      w: 1,
      h: 1,
      walkable: false,
    });
  }

  return { cells, objects };
}
