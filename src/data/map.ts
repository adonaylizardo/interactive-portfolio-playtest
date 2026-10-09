/** Map dimensions and tile/object definitions. Edit this file to change the world layout. */

import { tileFootWorld, worldToTile } from '../iso/math';

export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 16;

export const TILE_W = 128;
export const TILE_H = 64;

export type MapObject = {
  id: string;
  type: 'tile' | 'prop' | 'building';
  name: string;
  state: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  walkable?: boolean;
  door?: { x: number; y: number };
  panelTitle?: string;
};

export type MapCell = {
  walkable: boolean;
  groundId: string;
};

/** Matches drawBuilding east-face door — ground tile in front of the drawn door. */
function buildingDoorApproachTile(anchorTx: number, anchorTy: number): { x: number; y: number } | null {
  const foot = tileFootWorld(anchorTx, anchorTy);
  const tileCenterY = -TILE_H / 2;
  const houseFoot = [
    { x: 0, y: 0 },
    { x: 48, y: -24 },
    { x: 0, y: -48 },
    { x: -48, y: -24 },
  ];
  const cx = houseFoot.reduce((s, p) => s + p.x, 0) / houseFoot.length;
  const cy = houseFoot.reduce((s, p) => s + p.y, 0) / houseFoot.length;
  const off = { x: -cx, y: tileCenterY - cy };
  const probe = { x: 40 + off.x, y: -4 + off.y };
  return worldToTile(foot.x + probe.x, foot.y + probe.y);
}

function emptyGrid(): MapCell[][] {
  const grid: MapCell[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    grid[y] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      grid[y][x] = { walkable: true, groundId: 'tile/grass/default' };
    }
  }
  return grid;
}

export const cells = emptyGrid();

function blockRect(tx: number, ty: number, w: number, h: number, ground = 'tile/concrete/default') {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = tx + dx - Math.floor(w / 2);
      const y = ty - dy;
      if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
        cells[y][x].walkable = false;
        cells[y][x].groundId = ground;
      }
    }
  }
}

function carvePath(tx: number, ty: number) {
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
  cells[ty][tx].walkable = true;
  cells[ty][tx].groundId = 'tile/path/default';
}

// Main walk network
for (let x = 2; x < 14; x++) carvePath(x, 8);
for (let y = 4; y < 13; y++) carvePath(7, y);

// Decorative blocked pads (away from doors)
blockRect(11, 10, 2, 1, 'tile/concrete/default');
blockRect(14, 6, 1, 1, 'tile/concrete/default');

export const objects: MapObject[] = [
  {
    id: 'building/caso-1/default',
    type: 'building',
    name: 'caso-1',
    state: 'default',
    x: 3,
    y: 4,
    w: 2,
    h: 2,
    walkable: false,
    door: { x: 4, y: 4 },
    panelTitle: 'Caso de ejemplo 1',
  },
  {
    id: 'building/caso-2/default',
    type: 'building',
    name: 'caso-2',
    state: 'default',
    x: 12,
    y: 5,
    w: 2,
    h: 2,
    walkable: false,
    door: { x: 13, y: 5 },
    panelTitle: 'Caso de ejemplo 2',
  },
  {
    id: 'building/caso-3/default',
    type: 'building',
    name: 'caso-3',
    state: 'default',
    x: 10,
    y: 11,
    w: 2,
    h: 2,
    walkable: false,
    door: { x: 11, y: 11 },
    panelTitle: 'Caso de ejemplo 3',
  },
  {
    id: 'building/caso-4/default',
    type: 'building',
    name: 'caso-4',
    state: 'default',
    x: 5,
    y: 12,
    w: 2,
    h: 2,
    walkable: false,
    door: { x: 6, y: 12 },
    panelTitle: 'Caso de ejemplo 4',
  },
  {
    id: 'prop/escritorio/default',
    type: 'prop',
    name: 'escritorio',
    state: 'default',
    x: 8,
    y: 6,
    w: 1,
    h: 1,
    walkable: false,
  },
  {
    id: 'prop/arbol/default',
    type: 'prop',
    name: 'arbol',
    state: 'default',
    x: 13,
    y: 8,
    w: 1,
    h: 1,
    walkable: false,
  },
  {
    id: 'prop/arbol/default-2',
    type: 'prop',
    name: 'arbol',
    state: 'default',
    x: 2,
    y: 9,
    w: 1,
    h: 1,
    walkable: false,
  },
];

for (const obj of objects) {
  if (obj.type === 'building' && obj.w && obj.h) {
    const approach = buildingDoorApproachTile(obj.x, obj.y);
    if (approach) obj.door = approach;
  }
}

for (const obj of objects) {
  if (obj.walkable === false && obj.w && obj.h) {
    blockRect(obj.x, obj.y, obj.w, obj.h);
    if (obj.door) {
      carvePath(obj.door.x, obj.door.y);
    }
  } else if (obj.type === 'prop') {
    const px = obj.x;
    const py = obj.y;
    if (px >= 0 && px < MAP_WIDTH && py >= 0 && py < MAP_HEIGHT) {
      cells[py][px].walkable = false;
    }
  }
}

// Corridors from each door to the main path network
const doorCorridors: [number, number][] = [
  [3, 4],
  [4, 4],
  [4, 5],
  [4, 6],
  [4, 7],
  [4, 8],
  [13, 5],
  [13, 6],
  [13, 7],
  [13, 8],
  [11, 11],
  [11, 10],
  [11, 9],
  [11, 8],
  [10, 8],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [6, 8],
  [7, 8],
];
function isBuildingFootprintTile(tx: number, ty: number, allowDoor = false): boolean {
  for (const o of objects) {
    if (o.type !== 'building' || !o.w || !o.h) continue;
    if (allowDoor && o.door && o.door.x === tx && o.door.y === ty) continue;
    const w = o.w;
    const h = o.h;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ox = o.x + dx - Math.floor(w / 2);
        const oy = o.y - dy;
        if (ox === tx && oy === ty) return true;
      }
    }
  }
  return false;
}

for (const [x, y] of doorCorridors) {
  if (!isBuildingFootprintTile(x, y, true)) carvePath(x, y);
}

/** QA: footprint tiles (except doors) must stay blocked. */
export function validateWalkGridFootprint(): string[] {
  const errors: string[] = [];
  for (const o of objects) {
    if (o.type !== 'building' || !o.w || !o.h) continue;
    const w = o.w;
    const h = o.h;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ox = o.x + dx - Math.floor(w / 2);
        const oy = o.y - dy;
        const isDoor = o.door && o.door.x === ox && o.door.y === oy;
        if (isDoor) continue;
        if (cells[oy]?.[ox]?.walkable) {
          errors.push(`footprint tile (${ox},${oy}) walkable for ${o.name}`);
        }
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

/** Door tile or any tile adjacent (including diagonal) within 1 step. */
export function getBuildingAtDoorOrAdjacent(tx: number, ty: number): MapObject | undefined {
  return objects.find((o) => {
    if (o.type !== 'building' || !o.door) return false;
    const dx = Math.abs(o.door.x - tx);
    const dy = Math.abs(o.door.y - ty);
    return Math.max(dx, dy) <= 1;
  });
}

export function getBuildingAt(tx: number, ty: number): MapObject | undefined {
  return objects.find((o) => {
    if (o.type !== 'building') return false;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ox = o.x + dx - Math.floor(w / 2);
        const oy = o.y - dy;
        if (ox === tx && oy === ty) return true;
      }
    }
    return false;
  });
}

/** Entry intent for taps on the door tile, footprint, or ground one step in front when already near. */
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
  const building = getBuildingAt(tx, ty);
  if (building?.door) return building.door;
  return { x: tx, y: ty };
}

export function getBuildingDoorTiles(): { name: string; x: number; y: number; door: { x: number; y: number } }[] {
  return objects
    .filter((o) => o.type === 'building' && o.door)
    .map((o) => ({ name: o.name, x: o.x, y: o.y, door: o.door! }));
}

export function getObjectAt(tx: number, ty: number): MapObject | undefined {
  return objects.find((o) => {
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const ox = o.x + dx - Math.floor(w / 2);
        const oy = o.y - dy;
        if (ox === tx && oy === ty) return true;
      }
    }
    return false;
  });
}
