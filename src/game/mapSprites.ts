import type { MapCell, MapObject } from '../data/world';
import { OBELISCO_SOLID_TILES, TILE_H, TILE_W } from '../data/world';
import { tileFootWorld } from '../iso/math';
import { spriteAsset } from './sprites';

type CellGrid = MapCell[][];

const isStreet = (cells: CellGrid, x: number, y: number): boolean =>
  cells[y]?.[x]?.groundId.includes('path/street') ?? false;

const isPark = (cells: CellGrid, x: number, y: number): boolean =>
  cells[y]?.[x]?.groundId.includes('park') ?? false;

/** Street sides in manifest order: ne = −y, se = +x, sw = +y, nw = −x. */
export function streetOpenSides(cells: CellGrid, x: number, y: number): string[] {
  const sides: string[] = [];
  if (isStreet(cells, x, y - 1)) sides.push('ne');
  if (isStreet(cells, x + 1, y)) sides.push('se');
  if (isStreet(cells, x, y + 1)) sides.push('sw');
  if (isStreet(cells, x - 1, y)) sides.push('nw');
  return sides;
}

/** Ground sprite for one cell: street piece by neighbour connectivity, park, suelo, edge slab. */
export function tileSpriteKey(cells: CellGrid, x: number, y: number): string {
  const cell = cells[y][x];
  const id = cell.groundId;
  if (id.includes('borde-esquina-s')) return 'tile/suelo/no-esquina-s';
  if (id.includes('borde-se')) return 'tile/suelo/no-se';
  if (id.includes('borde-sw')) return 'tile/suelo/no-sw';
  if (id.includes('path/street')) {
    const sides = streetOpenSides(cells, x, y);
    if (sides.length > 0) return `tile/calle/${sides.join('-')}`;
  }
  if (id.includes('park')) {
    const alongX = isPark(cells, x - 1, y) && isPark(cells, x + 1, y);
    const alongY = isPark(cells, x, y - 1) && isPark(cells, x, y + 1);
    const path = alongX ? 'se-nw' : alongY ? 'ne-sw' : 'no';
    return `tile/parque/si-${path}-no`;
  }
  return cell.walkable ? 'tile/suelo/si-no' : 'tile/suelo/no-no';
}

/** Front cell of a footprint: the sprite's front vertex sits on this cell's south vertex. */
export function frontCell(o: MapObject): { x: number; y: number } {
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  return { x: fx + (o.w ?? 1) - 1, y: fy + (o.h ?? 1) - 1 };
}

export function objectSpriteBase(o: MapObject): string | null {
  if (o.type === 'building') return `ext/${o.name}`;
  if (o.name === 'tree') return `prop/arbol/${o.variant ?? 'redondo'}`;
  if (o.name === 'bench') return `prop/banco/${o.variant ?? 'izq'}`;
  if (o.name === 'lamp') return `prop/farol/${o.variant ?? 'izq'}`;
  if (o.name === 'obelisco') return 'prop/obelisco';
  if (o.name === 'redoma') return 'prop/redoma';
  if (o.name === 'muro') return 'prop/muro';
  return null;
}

/** Sprite key for an object given its state (buildings) and zoom variant. */
export function objectSpriteKey(
  o: MapObject,
  state: 'default' | 'hover' | 'resaltado',
  lejos: boolean,
): string | null {
  const base = objectSpriteBase(o);
  if (!base) return null;
  const zoom = lejos ? 'lejos' : 'cerca';
  return o.type === 'building' ? `${base}/${state}/${zoom}` : `${base}/${zoom}`;
}

/** World top-left of an object's sprite. */
export function objectSpriteTopLeft(o: MapObject, key: string): { x: number; y: number } {
  const f = frontCell(o);
  const s = tileFootWorld(f.x, f.y);
  const a = spriteAsset(key);
  return { x: s.x - a.vfs.x, y: s.y - a.vfs.y };
}

/** Draw order against the player: front row of the footprint (x + y). */
export function objectDepth(o: MapObject): number {
  const f = frontCell(o);
  return f.x + f.y;
}

export type OccluderBox = { x0: number; y0: number; x1: number; y1: number };

/**
 * Cells (cell-centre coordinates, edges at ±0.5) whose mass can hide the player from behind.
 * The redoma island is flat and never hides anyone; the obelisco only occludes with its solid strip.
 */
export function objectOccluder(o: MapObject): OccluderBox | null {
  if (o.name === 'redoma') return null;
  if (o.name === 'obelisco') {
    const xs = OBELISCO_SOLID_TILES.map(([x]) => x);
    const ys = OBELISCO_SOLID_TILES.map(([, y]) => y);
    return { x0: Math.min(...xs) - 0.5, y0: Math.min(...ys) - 0.5, x1: Math.max(...xs) + 0.5, y1: Math.max(...ys) + 0.5 };
  }
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  return { x0: fx - 0.5, y0: fy - 0.5, x1: fx + (o.w ?? 1) - 0.5, y1: fy + (o.h ?? 1) - 0.5 };
}

/** True when a player at (cx, cy) stands behind the occluder (farther from the viewer). */
export function playerBehind(box: OccluderBox, cx: number, cy: number): boolean {
  return (cx < box.x0 || cy < box.y0) && cx < box.x1 && cy < box.y1;
}

/** Diamond hit area for a 128×64 rhombus placed at the top of its sprite frame. */
export const TILE_DIAMOND = [TILE_W / 2, 0, TILE_W, TILE_H / 2, TILE_W / 2, TILE_H, 0, TILE_H / 2];
