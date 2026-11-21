import { cells, doorInwardStep, getBuildingAtDoor, MAP_HEIGHT, MAP_WIDTH } from '../data/map';

type Node = { x: number; y: number; g: number; f: number; parent?: Node };

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

/** Stepping onto a door toward the building enters, so a through-route has to cross it sideways. */
function blocksInwardDoor(x: number, y: number, nx: number, ny: number, gx: number, gy: number): boolean {
  if (nx === gx && ny === gy) return false;
  const door = getBuildingAtDoor(nx, ny);
  if (!door) return false;
  const inward = doorInwardStep(door);
  if (!inward) return false;
  return (nx - x) * inward.x + (ny - y) * inward.y > 0;
}

export function findPathWith(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  passable: (x: number, y: number) => boolean,
  blockStep?: (x: number, y: number, nx: number, ny: number) => boolean,
): { x: number; y: number }[] | null {
  if (!inBounds(gx, gy)) return null;
  if (!passable(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];

  const open: Node[] = [];
  const closed = new Set<string>();
  const start: Node = { x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy) };
  open.push(start);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    const ck = key(current.x, current.y);
    if (closed.has(ck)) continue;
    closed.add(ck);

    if (current.x === gx && current.y === gy) {
      const path: { x: number; y: number }[] = [];
      let n: Node | undefined = current;
      while (n?.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return path;
    }

    for (const [dx, dy] of NEIGHBORS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(nx, ny)) continue;
      if (!passable(nx, ny)) continue;
      if (blockStep?.(current.x, current.y, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const g = current.g + 1;
      const f = g + heuristic(nx, ny, gx, gy);
      const existing = open.find((n) => n.x === nx && n.y === ny);
      if (existing && existing.g <= g) continue;
      if (existing) {
        existing.g = g;
        existing.f = f;
        existing.parent = current;
      } else {
        open.push({ x: nx, y: ny, g, f, parent: current });
      }
    }
  }
  return null;
}

export function findPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] | null {
  return findPathWith(
    sx,
    sy,
    gx,
    gy,
    (x, y) => !!cells[y]?.[x]?.walkable,
    (x, y, nx, ny) => blocksInwardDoor(x, y, nx, ny, gx, gy),
  );
}

export type PathResult = {
  path: { x: number; y: number }[];
  target: { x: number; y: number };
  direct: boolean;
};

/** Path to goal, or to the nearest reachable tile toward the goal. */
export function findPathOrNearest(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): PathResult | null {
  return findPathOrNearestWith(sx, sy, gx, gy, (x, y) => !!cells[y]?.[x]?.walkable);
}

/** Same as findPathOrNearest with an explicit walkable test (van footprint, etc.). */
export function findPathOrNearestWith(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  passable: (x: number, y: number) => boolean,
): PathResult | null {
  const direct = findPathWith(sx, sy, gx, gy, passable);
  if (direct) {
    return { path: direct, target: { x: gx, y: gy }, direct: true };
  }

  const candidates: { x: number; y: number; dist: number }[] = [];
  const maxRadius = 40;
  for (let dy = -maxRadius; dy <= maxRadius; dy++) {
    for (let dx = -maxRadius; dx <= maxRadius; dx++) {
      const x = gx + dx;
      const y = gy + dy;
      if (!inBounds(x, y)) continue;
      if (!passable(x, y)) continue;
      candidates.push({ x, y, dist: Math.abs(dx) + Math.abs(dy) });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  let best: PathResult | null = null;
  for (const c of candidates) {
    const path = findPathWith(sx, sy, c.x, c.y, passable);
    if (!path) continue;
    if (!best) {
      best = { path, target: { x: c.x, y: c.y }, direct: false };
      continue;
    }
    const bestGoalDist = heuristic(best.target.x, best.target.y, gx, gy);
    if (
      c.dist < bestGoalDist ||
      (c.dist === bestGoalDist && path.length < best.path.length)
    ) {
      best = { path, target: { x: c.x, y: c.y }, direct: false };
    }
  }
  return best;
}
