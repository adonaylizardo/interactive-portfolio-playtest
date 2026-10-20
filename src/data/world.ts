import { placeFill, type FillResult } from './fill';
import mapData from './mapa_datos.json';
import spritesJson from './sprites.json';

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
  acceso?: { x: number; y: number };
  /** Sprite variant: tree species (redondo|cipres|araguaney) or bench/lamp side (izq|der). */
  variant?: string;
  /** Map-fill sprite base key (`fill/...`), drawn from src/data/relleno.json. */
  sprite?: string;
  /** Ground-level art (court, deck, green): drawn under walkers and never hides them. */
  flat?: boolean;
  /** Uniform sprite scale around the front vertex. */
  scale?: number;
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
  teresa: 'Talks',
  biblioteca: 'Writings',
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
  /** Approved van sit beside the door (map cell centre). */
  estacionamiento?: [number, number];
  estacionamiento_dir?: 'ne' | 'se' | 'sw' | 'nw';
};

export type BuildingParkPrefer = { x: number; y: number; dir?: 'ne' | 'se' | 'sw' | 'nw' };

export function buildingParkPrefer(buildingId: string): BuildingParkPrefer | null {
  const ed = mapData.edificios[buildingId as keyof typeof mapData.edificios] as EdificioJson | undefined;
  if (!ed?.estacionamiento) return null;
  const [x, y] = ed.estacionamiento;
  return { x, y, dir: ed.estacionamiento_dir };
}

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

/** Front cell stays (37, 41); 2× original L grows the diamond to 6×4. Access (38, 41). */
const MURO_FOOTPRINT = { x: 32, y: 38, w: 6, h: 4 };
const MURO_APPROACH: [number, number] = [38, 41];

type ObeliscoManifest = {
  colision: { solida: { celdas: [number, number][] }; acceso?: [number, number] };
  frente: { mira_a: [number, number] };
};
const obeliscoManifest = (spritesJson as unknown as { meta: Record<string, ObeliscoManifest> }).meta['prop/obelisco'];

/** Obelisco collision comes from the sprite manifest (`colision.solida`); the rest of the plaza is walkable decoration. */
export const OBELISCO_SOLID_TILES: readonly [number, number][] = obeliscoManifest.colision.solida.celdas;

/** Stair foot on the front (+x) face, from the manifest `frente.mira_a`: where the player stops. */
export const OBELISCO_ACCESS: { x: number; y: number } = {
  x: obeliscoManifest.frente.mira_a[0],
  y: obeliscoManifest.frente.mira_a[1],
};

export function obeliscoSolidTiles(): Set<string> {
  return new Set(OBELISCO_SOLID_TILES.map(([x, y]) => `${x},${y}`));
}

/**
 * The muro sprite stands its two walls on the back (−y) and left (−x) edges of the 6×4 footprint and
 * draws them upward over the row and column behind, so those cells (and the corner) carry the
 * collision. All footprint cells are open floor the player can stand on.
 */
export function muroWallTiles(): Set<string> {
  const { x, y, w, h } = MURO_FOOTPRINT;
  const out = new Set<string>([`${x - 1},${y - 1}`]);
  for (let dx = 0; dx < w; dx++) out.add(`${x + dx},${y - 1}`);
  for (let dy = 0; dy < h; dy++) out.add(`${x - 1},${y + dy}`);
  return out;
}

export const MURO_FOOTPRINT_TILES: { x: number; y: number }[] = footprintTiles(
  MURO_FOOTPRINT.x,
  MURO_FOOTPRINT.y,
  MURO_FOOTPRINT.w,
  MURO_FOOTPRINT.h,
);

export function nearMuroClearance(tx: number, ty: number): boolean {
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
  { kind: 'lamp', x: 17, y: 35 },
  { kind: 'lamp', x: 49, y: 36 },
  { kind: 'tree', x: 23, y: 42 },
  { kind: 'tree', x: 50, y: 40 },
  { kind: 'tree', x: 15, y: 40 },
  { kind: 'plaza', x: 28, y: 37 },
  { kind: 'plaza', x: 34, y: 37 },
  { kind: 'bench', x: 29, y: 40 },
  { kind: 'bench', x: 33, y: 40 },
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
  { kind: 'lamp', x: 19, y: 35 },
  { kind: 'lamp', x: 23, y: 35 },
  { kind: 'lamp', x: 27, y: 35 },
  { kind: 'lamp', x: 35, y: 35 },
  { kind: 'lamp', x: 45, y: 41 },
  { kind: 'lamp', x: 45, y: 43 },
];

const TREE_SPECIES = ['redondo', 'redondo', 'redondo', 'redondo', 'redondo', 'cipres', 'cipres', 'cipres', 'araguaney', 'araguaney'];

/** Benches face the street they sit beside (izq = +y, der = +x); lamps arm over it the same way. */
function sideFacingStreet(cells: MapCell[][], x: number, y: number): 'izq' | 'der' {
  const isStreet = (tx: number, ty: number) => cells[ty]?.[tx]?.groundId.includes('path/street') ?? false;
  if (isStreet(x, y + 1)) return 'izq';
  if (isStreet(x + 1, y)) return 'der';
  return (x + y) % 2 === 0 ? 'izq' : 'der';
}

export function buildWorld(): {
  cells: MapCell[][];
  objects: MapObject[];
  fill: FillResult;
  /** Door accesses, the cell in front of each door, the spawn and the monument stop (`x,y` keys). */
  keepClear: ReadonlySet<string>;
} {
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
    if (ed.paisaje) {
      const kind =
        id === 'obelisco' ? 'obelisco' : id === 'redoma' ? 'redoma' : id === 'muro' ? 'muro' : 'paisaje';
      const muroWalls = id === 'muro' ? muroWallTiles() : null;
      const obeliscoSolid = id === 'obelisco' ? obeliscoSolidTiles() : null;
      for (const { x: fx, y: fy } of footprintTiles(ed.x, ed.y, ed.w, ed.h)) {
        if (fx < 0 || fy < 0 || fx >= MAP_WIDTH || fy >= MAP_HEIGHT) continue;
        if (borderKind(fx, fy)) continue;
        const isWall = muroWalls
          ? muroWalls.has(`${fx},${fy}`)
          : obeliscoSolid
            ? obeliscoSolid.has(`${fx},${fy}`)
            : true;
        cells[fy][fx].walkable = !isWall;
        cells[fy][fx].groundId =
          isWall && !muroWalls && !obeliscoSolid ? 'tile/building/footprint' : 'tile/ground/default';
      }
      for (const key of muroWalls ?? []) {
        const [wx, wy] = key.split(',').map(Number);
        if (cells[wy]?.[wx] && !borderKind(wx, wy)) cells[wy][wx].walkable = false;
      }
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
        acceso: { x: ed.acceso[0], y: ed.acceso[1] },
      });
      if (Array.isArray(ed.acceso) && ed.acceso.length >= 2) {
        const [ax, ay] = ed.acceso as [number, number];
        if (ax >= 0 && ay >= 0 && ax < MAP_WIDTH && ay < MAP_HEIGHT && !borderKind(ax, ay)) {
          cells[ay][ax].walkable = true;
        }
      }
      continue;
    }

    for (const { x: fx, y: fy } of footprintTiles(ed.x, ed.y, ed.w, ed.h)) {
      if (fx < 0 || fy < 0 || fx >= MAP_WIDTH || fy >= MAP_HEIGHT) continue;
      if (borderKind(fx, fy)) continue;
      cells[fy][fx].walkable = false;
      cells[fy][fx].groundId = 'tile/building/footprint';
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
      ...(id === 'teresa' || id === 'biblioteca' ? { scale: 2 } : {}),
    });
  }

  const pathDirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // Dead ends come from the carved layout, not from cells cleared earlier in this pass;
  // otherwise one stub unzips the whole street behind it.
  const street = cells.map((row) => row.map((c) => c.groundId.includes('path/street')));
  const deadEnds: [number, number][] = [];
  for (let ty = 0; ty < MAP_HEIGHT; ty++) {
    for (let tx = 0; tx < MAP_WIDTH; tx++) {
      if (!street[ty][tx]) continue;
      let pathNeighbors = 0;
      for (const [dx, dy] of pathDirs) {
        if (street[ty + dy]?.[tx + dx]) pathNeighbors++;
      }
      if (pathNeighbors < 2) deadEnds.push([tx, ty]);
    }
  }
  for (const [tx, ty] of deadEnds) cells[ty][tx].groundId = 'tile/ground/default';

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
      variant:
        f.kind === 'tree'
          ? TREE_SPECIES[(f.x * 31 + f.y * 17) % TREE_SPECIES.length]
          : sideFacingStreet(cells, f.x, f.y),
      w: 1,
      h: 1,
      walkable: false,
    });
  }

  const keepClear = new Set<string>([`${INICIO[0]},${INICIO[1]}`, `${OBELISCO_ACCESS.x},${OBELISCO_ACCESS.y}`]);
  for (const ed of Object.values(mapData.edificios) as EdificioJson[]) {
    const [ax, ay] = ed.acceso;
    keepClear.add(`${ax},${ay}`);
    if (ed.cara_puerta === '+y') keepClear.add(`${ax},${ay + 1}`);
    if (ed.cara_puerta === '+x') keepClear.add(`${ax + 1},${ay}`);
  }
  const benchFronts = new Set(
    objects.filter((o) => o.name === 'bench').map((o) => (o.variant === 'izq' ? `${o.x},${o.y + 1}` : `${o.x + 1},${o.y}`)),
  );
  const fill = placeFill({
    cells,
    objects,
    keepClear,
    benchFronts,
    nearMuro: nearMuroClearance,
    lampVariant: sideFacingStreet,
    start: INICIO,
  });
  objects.push(...fill.objects);

  const [ix, iy] = INICIO;
  if (!borderKind(ix, iy)) {
    cells[iy][ix].walkable = true;
    carveStreet(ix, iy);
  }

  return { cells, objects, fill, keepClear };
}
