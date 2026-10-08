import { MAP_HEIGHT, MAP_WIDTH, TILE_H, TILE_W } from '../data/map';

export function tileToWorld(tx: number, ty: number): { x: number; y: number } {
  const x = (tx - ty) * (TILE_W / 2);
  const y = (tx + ty) * (TILE_H / 2);
  return { x, y };
}

export function worldToTile(wx: number, wy: number): { x: number; y: number } | null {
  const tx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
  const ty = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
  const x = Math.round(tx);
  const y = Math.round(ty);
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
  return { x, y };
}

export function mapWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const c0 = tileToWorld(0, 0);
  const c1 = tileToWorld(MAP_WIDTH - 1, 0);
  const c2 = tileToWorld(0, MAP_HEIGHT - 1);
  const c3 = tileToWorld(MAP_WIDTH - 1, MAP_HEIGHT - 1);
  const xs = [c0.x, c1.x, c2.x, c3.x];
  const ys = [c0.y, c1.y, c2.y, c3.y];
  return {
    minX: Math.min(...xs) - TILE_W,
    maxX: Math.max(...xs) + TILE_W,
    minY: Math.min(...ys),
    maxY: Math.max(...ys) + TILE_H * 2,
  };
}

export function sortKey(tx: number, ty: number, layer = 0): number {
  return (tx + ty) * 1000 + tx + layer;
}
