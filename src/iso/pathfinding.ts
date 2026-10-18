import { cells, MAP_HEIGHT, MAP_WIDTH } from '../data/map';

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

/** Drop colinear midpoints so followers see long axis runs, not stair steps. */
export function compressColinear(path: { x: number; y: number }[]): { x: number; y: number }[] {
  if (path.length < 3) return path;
  const out: { x: number; y: number }[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    if (abx * bcy === aby * bcx && Math.sign(abx) === Math.sign(bcx) && Math.sign(aby) === Math.sign(bcy)) {
      continue;
    }
    out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * Shortest 4-way path that prefers long straight runs. A turn costs extra so
 * the search does not emit Manhattan staircases (ne↔sw flips every tile).
 */
export function findPathPreferStraight(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  passable: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  if (!inBounds(gx, gy)) return null;
  if (!passable(gx, gy)) return null;
  if (sx === gx && sy === gy) return [];

  type TurnNode = Node & { dir: number };
  const open: TurnNode[] = [];
  const bestG = new Map<string, number>();
  const start: TurnNode = { x: sx, y: sy, g: 0, f: heuristic(sx, sy, gx, gy), dir: -1 };
  open.push(start);
  bestG.set(key(sx, sy), 0);

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift()!;
    if (current.x === gx && current.y === gy) {
      const path: { x: number; y: number }[] = [];
      let n: Node | undefined = current;
      while (n?.parent) {
        path.push({ x: n.x, y: n.y });
        n = n.parent;
      }
      path.reverse();
      return compressColinear(path);
    }
    for (let di = 0; di < NEIGHBORS.length; di++) {
      const [dx, dy] = NEIGHBORS[di];
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!inBounds(nx, ny) || !passable(nx, ny)) continue;
      const turned = current.dir >= 0 && current.dir !== di;
      const g = current.g + 1 + (turned ? 0.65 : 0);
      const nk = `${key(nx, ny)}:${di}`;
      const prev = bestG.get(nk);
      if (prev != null && prev <= g) continue;
      bestG.set(nk, g);
      open.push({
        x: nx,
        y: ny,
        g,
        f: g + heuristic(nx, ny, gx, gy),
        dir: di,
        parent: current,
      });
    }
  }
  return null;
}

export function findPathWith(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  passable: (x: number, y: number) => boolean,
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
  return findPathWith(sx, sy, gx, gy, (x, y) => !!cells[y]?.[x]?.walkable);
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
