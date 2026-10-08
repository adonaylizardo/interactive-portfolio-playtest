/** Map dimensions and tile/object definitions. Edit this file to change the world layout. */

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
    door: { x: 3, y: 5 },
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
    door: { x: 12, y: 6 },
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
    door: { x: 10, y: 12 },
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
    door: { x: 5, y: 13 },
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
  [2, 5],
  [3, 5],
  [3, 6],
  [3, 7],
  [3, 8],
  [12, 6],
  [12, 7],
  [12, 8],
  [10, 12],
  [10, 11],
  [10, 10],
  [10, 9],
  [10, 8],
  [7, 12],
  [5, 13],
  [5, 12],
  [5, 11],
  [5, 10],
  [5, 9],
  [5, 8],
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

export function resolveWalkTarget(tx: number, ty: number): { x: number; y: number } {
  const onDoor = getBuildingAtDoor(tx, ty);
  if (onDoor?.door) return onDoor.door;
  const building = getBuildingAt(tx, ty);
  if (building?.door) return building.door;
  return { x: tx, y: ty };
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
