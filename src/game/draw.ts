import { Graphics } from 'pixi.js';
import { C } from './colors';

export const TREE_TRUNK_H = 20;
export const TREE_CANOPY_RY = 22;
export const TREE_CANOPY_CY = -34;
export const TREE_CANOPY_OVERLAP = 8;

/** South-top trunk y vs canopy ellipse bottom — overlap when bottomY >= trunkTopY. */
export function treeCanopyTrunkOverlap(): {
  canopyBottomY: number;
  trunkTopY: number;
  ok: boolean;
} {
  const trunkTopY = -TREE_TRUNK_H;
  const canopyBottomY = TREE_CANOPY_CY + TREE_CANOPY_RY;
  return {
    canopyBottomY,
    trunkTopY,
    ok: canopyBottomY >= trunkTopY && canopyBottomY - trunkTopY >= TREE_CANOPY_OVERLAP - 0.5,
  };
}

export function deskTopFillColor(hover: boolean): number {
  return hover ? C.propTopHover : C.propTop;
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
