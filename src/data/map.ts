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
  /** Footprint in tiles (width × height from anchor bottom-center). */
  w?: number;
  h?: number;
  walkable?: boolean;
  /** Door tile for buildings — character entering triggers panel. */
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

/** Place non-walkable rects (bottom-center anchor at tile x,y). */
function blockRect(tx: number, ty: number, w: number, h: number, ground = 'tile/path/default') {
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

// Paths and blocked areas
for (let x = 2; x < 14; x++) {
  cells[8][x].groundId = 'tile/path/default';
}
for (let y = 4; y < 12; y++) {
  cells[y][7].groundId = 'tile/path/default';
}

blockRect(4, 5, 2, 2, 'tile/concrete/default');
blockRect(11, 10, 2, 1, 'tile/concrete/default');
blockRect(6, 11, 3, 1, 'tile/concrete/default');

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

// Sync building footprints to grid
for (const obj of objects) {
  if (obj.walkable === false && obj.w && obj.h) {
    blockRect(obj.x, obj.y, obj.w, obj.h);
    if (obj.door) {
      cells[obj.door.y][obj.door.x].walkable = true;
    }
  } else if (obj.type === 'prop') {
    const px = obj.x;
    const py = obj.y;
    if (px >= 0 && px < MAP_WIDTH && py >= 0 && py < MAP_HEIGHT) {
      cells[py][px].walkable = false;
    }
  }
}

export function getBuildingAtDoor(tx: number, ty: number): MapObject | undefined {
  return objects.find(
    (o) => o.type === 'building' && o.door && o.door.x === tx && o.door.y === ty,
  );
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
