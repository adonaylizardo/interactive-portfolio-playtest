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

export function findPath(
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] | null {
  if (gx < 0 || gy < 0 || gx >= MAP_WIDTH || gy >= MAP_HEIGHT) return null;
  if (!cells[gy][gx].walkable) return null;
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
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      if (!cells[ny][nx].walkable) continue;
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
