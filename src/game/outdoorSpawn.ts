import { cells, doorInwardStep, type MapObject } from '../data/map';

/** Minimum ms after exiting a building before the exterior door can re-trigger entry. */
export const EXTERIOR_DOOR_ENTRY_COOLDOWN_MS = 1500;

function walkable(tx: number, ty: number): boolean {
  return !!cells[ty]?.[tx]?.walkable;
}

function chebyshevDoor(door: { x: number; y: number }, tx: number, ty: number): number {
  return Math.max(Math.abs(tx - door.x), Math.abs(ty - door.y));
}

/**
 * After leaving a building, place the avatar at least `minTiles` walkable steps
 * away from the exterior door (avoid instant re-entry).
 */
export function outdoorSpawnTileAwayFromDoor(
  building: MapObject,
  minTiles = 2,
): { x: number; y: number } | null {
  if (!building.door) return null;
  const door = building.door;
  const inward = doorInwardStep(building);
  const seeds: { x: number; y: number }[] = [];
  if (inward) {
    seeds.push({ x: door.x - inward.x, y: door.y - inward.y });
  }
  for (const d of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    seeds.push({ x: door.x + d.x, y: door.y + d.y });
  }

  const seen = new Set<string>();
  const queue: { x: number; y: number }[] = [];
  for (const s of seeds) {
    const key = `${s.x},${s.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (walkable(s.x, s.y)) queue.push(s);
  }

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const dist = chebyshevDoor(door, cur.x, cur.y);
    if (dist >= minTiles) return { x: cur.x, y: cur.y };
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!walkable(nx, ny)) continue;
      queue.push({ x: nx, y: ny });
    }
  }

  if (inward) {
    const outward = { x: -inward.x, y: -inward.y };
    return walkable(door.x + outward.x, door.y + outward.y)
      ? { x: door.x + outward.x, y: door.y + outward.y }
      : null;
  }
  return walkable(door.x, door.y) ? { x: door.x, y: door.y } : null;
}
