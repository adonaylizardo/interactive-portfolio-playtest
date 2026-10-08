import { Graphics } from 'pixi.js';
import { TILE_H, TILE_W } from '../data/map';
import { C } from './colors';

export function drawDiamond(g: Graphics, fill: number, stroke?: number): void {
  g.moveTo(0, -TILE_H / 2);
  g.lineTo(TILE_W / 2, 0);
  g.lineTo(0, TILE_H / 2);
  g.lineTo(-TILE_W / 2, 0);
  g.closePath();
  g.fill(fill);
  if (stroke !== undefined) {
    g.stroke({ width: 1, color: stroke, alpha: 0.25 });
  }
}

export function drawBuilding(g: Graphics, far: boolean, hover: boolean): void {
  const base = hover ? C.buildingHover : C.building;
  if (far) {
    g.rect(-20, -48, 40, 48);
    g.fill(base);
    return;
  }
  g.moveTo(-36, -8);
  g.lineTo(0, -28);
  g.lineTo(36, -8);
  g.lineTo(36, 0);
  g.lineTo(-36, 0);
  g.closePath();
  g.fill(C.buildingRoof);
  g.rect(-32, -56, 64, 48);
  g.fill(base);
  g.rect(-8, -16, 16, 16);
  g.fill(C.door);
}

export function drawPropDesk(g: Graphics, far: boolean, hover: boolean): void {
  const c = hover ? C.propHover : C.prop;
  if (far) {
    g.rect(-12, -24, 24, 24);
    g.fill(c);
    return;
  }
  g.rect(-28, -20, 56, 8);
  g.fill(c);
  g.rect(-6, -36, 12, 16);
  g.fill(c);
}

export function drawPropTree(g: Graphics, far: boolean, hover: boolean): void {
  const c = hover ? C.propHover : C.prop;
  if (far) {
    g.circle(0, -20, 10);
    g.fill(c);
    return;
  }
  g.rect(-4, -32, 8, 32);
  g.fill(c);
  g.circle(0, -40, 18);
  g.fill(c);
}

export function drawCharacter(
  g: Graphics,
  state: 'idle' | 'walk' | 'sprint',
): void {
  const c =
    state === 'sprint' ? C.characterSprint : state === 'walk' ? C.characterWalk : C.character;
  g.roundRect(-14, -44, 28, 44, 6);
  g.fill(c);
  g.circle(0, -52, 10);
  g.fill(c);
}
