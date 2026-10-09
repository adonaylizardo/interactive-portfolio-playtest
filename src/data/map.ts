/** Map grid and objects — built from approved mapa_datos.json (64×64). */

import {
  buildWorld,
  INICIO,
  MAP_HEIGHT,
  MAP_TRAMOS,
  MAP_WIDTH,
  muroWallTiles,
  REDOMA_ANILLO,
  TILE_H,
  TILE_W,
  anchorForBuilding,
  type MapCell,
  type MapObject,
} from './world';

export {
  INICIO,
  MAP_HEIGHT,
  MAP_TRAMOS,
  MAP_WIDTH,
  REDOMA_ANILLO,
  TILE_H,
  TILE_W,
  anchorForBuilding,
};

export type { MapCell, MapObject };

const built = buildWorld();
export const cells = built.cells;
export const objects = built.objects;

function footprintCells(o: MapObject): { x: number; y: number }[] {
  const fx = o.footprintX ?? o.x;
  const fy = o.footprintY ?? o.y;
  const w = o.w ?? 1;
  const h = o.h ?? 1;
  const tiles: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      tiles.push({ x: fx + dx, y: fy + dy });
    }
  }
  return tiles;
}

const SCENERY_NAMES = new Set(['obelisco', 'redoma', 'muro']);

export function isSceneryObject(o: MapObject): boolean {
  return SCENERY_NAMES.has(o.name);
}

export function getSceneryAt(tx: number, ty: number): MapObject | undefined {
  for (const o of objects) {
    if (!isSceneryObject(o)) continue;
    for (const { x: ox, y: oy } of footprintCells(o)) {
      if (ox === tx && oy === ty) return o;
    }
  }
  return undefined;
}

/** QA: footprint tiles (except doors / muro interior) must stay blocked. */
export function validateWalkGridFootprint(): string[] {
  const errors: string[] = [];
  const muroWalls = muroWallTiles();
  for (const o of objects) {
    if (o.type !== 'building' && !isSceneryObject(o)) continue;
    if (!o.w || !o.h) continue;
    for (const { x: ox, y: oy } of footprintCells(o)) {
      const isDoor = o.door && o.door.x === ox && o.door.y === oy;
      if (isDoor) continue;
      if (o.name === 'muro' && !muroWalls.has(`${ox},${oy}`)) continue;
      if (cells[oy]?.[ox]?.walkable) {
        errors.push(`footprint tile (${ox},${oy}) walkable for ${o.name}`);
      }
    }
  }
  return errors;
}

export function getBuildingAtDoor(tx: number, ty: number): MapObject | undefined {
  return objects.find(
    (o) => o.type === 'building' && o.door && o.door.x === tx && o.door.y === ty,
  );
}

export function getBuildingAtDoorOrAdjacent(tx: number, ty: number): MapObject | undefined {
  return objects.find((o) => {
    if (o.type !== 'building' || !o.door) return false;
    const dx = Math.abs(o.door.x - tx);
    const dy = Math.abs(o.door.y - ty);
    return Math.max(dx, dy) <= 1;
  });
}

export function getBuildingAt(tx: number, ty: number): MapObject | undefined {
  for (const o of objects) {
    if (o.type !== 'building') continue;
    for (const { x: ox, y: oy } of footprintCells(o)) {
      if (ox === tx && oy === ty) return o;
    }
  }
  return undefined;
}

export function resolveBuildingEntryFromTile(
  tx: number,
  ty: number,
  from?: { x: number; y: number },
): { panelTitle: string; door: { x: number; y: number } } | null {
  const onDoor = getBuildingAtDoor(tx, ty);
  if (onDoor?.panelTitle && onDoor.door) {
    return { panelTitle: onDoor.panelTitle, door: onDoor.door };
  }
  const onFootprint = getBuildingAt(tx, ty);
  if (onFootprint?.panelTitle && onFootprint.door) {
    return { panelTitle: onFootprint.panelTitle, door: onFootprint.door };
  }
  if (!from || !cells[ty]?.[tx]?.walkable || getBuildingAt(tx, ty)) return null;
  for (const o of objects) {
    if (o.type !== 'building' || !o.door || !o.panelTitle) continue;
    const d = o.door;
    if (tx === d.x && ty === d.y) continue;
    const tapNearDoor = Math.max(Math.abs(tx - d.x), Math.abs(ty - d.y)) === 1;
    if (!tapNearDoor) continue;
    const charNearDoor = Math.max(Math.abs(from.x - d.x), Math.abs(from.y - d.y)) <= 2;
    if (charNearDoor) return { panelTitle: o.panelTitle, door: o.door };
  }
  return null;
}

export function resolveWalkTarget(tx: number, ty: number): { x: number; y: number } {
  const onDoor = getBuildingAtDoor(tx, ty);
  if (onDoor?.door) return onDoor.door;
  if (getSceneryAt(tx, ty)) return { x: tx, y: ty };
  const building = getBuildingAt(tx, ty);
  if (building?.door) return building.door;
  return { x: tx, y: ty };
}

export function getBuildingDoorTiles(): {
  name: string;
  x: number;
  y: number;
  door: { x: number; y: number };
}[] {
  return objects
    .filter((o) => o.type === 'building' && o.door)
    .map((o) => ({ name: o.name, x: o.x, y: o.y, door: o.door! }));
}

export function getEnterableBuildings(): MapObject[] {
  return objects.filter((o) => o.type === 'building' && o.panelTitle);
}

export function getBuildingByName(name: string): MapObject | undefined {
  return objects.find((o) => o.type === 'building' && o.name === name);
}

export function getObjectAt(tx: number, ty: number): MapObject | undefined {
  for (const o of objects) {
    if (o.type === 'building') {
      for (const { x: ox, y: oy } of footprintCells(o)) {
        if (ox === tx && oy === ty) return o;
      }
    } else if (o.w && o.h) {
      if (o.x === tx && o.y === ty) return o;
    }
  }
  return undefined;
}
