import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  cells,
  doorInwardStep,
  fill,
  getBuildingAt,
  getBuildingAtDoor,
  getEnterableBuildings,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_H,
  TILE_W,
  objects,
  type MapObject,
} from '../data/map';
import { muroWallTiles } from '../data/world';
import { tileFootWorld, tileToWorld } from '../iso/math';
import { findPathWith } from '../iso/pathfinding';
import { objectOccluder, objectSpriteScale, playerBehind, type OccluderBox } from './mapSprites';
import { spriteOpaqueTopWorld } from './spriteTop';
import { spriteResolution } from './sprites';
import { WALK_TILES_PER_S, type FacingDir } from './player';

export const JAC_ID = 'fill/jac-t9';
/** Placeholder bark — never shown. Real lines land here once recorded. */
export const JAC_BUBBLE = '';

export type JacLights = 'off' | 'auto' | 'on';
export type JacGear = 'P' | 'R' | 'N' | 'D';
export type JacMode = 'parked' | 'menu' | 'info' | 'drive';
export type JacToggleId = 'left' | 'hazards' | 'right' | 'fog' | 'bed' | 'trailer';

const DIRS: FacingDir[] = ['se', 'sw', 'nw', 'ne'];
const DIR_ORDER: FacingDir[] = ['se', 'sw', 'nw', 'ne'];
const DIR_VEC: Record<FacingDir, { x: number; y: number }> = {
  se: { x: 1, y: 0 },
  sw: { x: 0, y: 1 },
  nw: { x: -1, y: 0 },
  ne: { x: 0, y: -1 },
};
/** Parked AABB: length along facing, 5×3 (SE/NW) or 3×5 (SW/NE). */
const PARK_SE = { w: 5, h: 3 };
const PARK_SW = { w: 3, h: 5 };
const DRIVE_BOX = 2;
/** Visual draw scale around the south vertex. Collision footprint stays 5×3 / 3×5 tiles. */
export const JAC_SPRITE_SCALE = 1.6;
const SCALE_HOME = JAC_SPRITE_SCALE;
const ANCHOR_1X = { x: 140, y: 90 };
const SOUTH_OFF_1X: Record<FacingDir, { x: number; y: number }> = {
  se: { x: 32, y: 48 },
  sw: { x: -32, y: 48 },
  ne: { x: -32, y: 48 },
  nw: { x: 32, y: 48 },
};
const CELL_1X = { w: 280, h: 192 };
const WHEEL_FPS = 10;
const DRIVE_TILES_PER_S = WALK_TILES_PER_S * 1.15;
const REVERSE_TILES_PER_S = WALK_TILES_PER_S * 0.85;
const ACCEL_TILES_S2 = 14;
const BRAKE_TILES_S2 = 18;
const EXIT_BRAKE_TILES_S2 = 220;
const EXIT_MAX_TRAVEL = 0.35;
const BUMP_AMP = 0.22;
const FRICTION_TILES_S2 = 10;
const TURN_RATE = 2.4;
const IDLE_RPM = 700;
const MOVE_RPM = 2250;
const MOVE_MPH = 10;
/** Hold at 0 for at least this long before auto-shifting D↔R (cold stop or brake). */
const SHIFT_DWELL_S = 0.45;
const STOPPED_SHIFT_S = 0.45;
/** Pure-pursuit look-ahead along the remaining polyline (tiles). */
const PATH_LOOKAHEAD = 1.45;
/** Collision / vehicle integration step. Large frames are split, never one 50 ms hop. */
const SUB_DT = 1 / 60;
const MAX_FRAME_DT = 0.25;
/** Stay on the current 4-way sprite until heading is 20° past the 45° line. */
const DIR_HYSTERESIS = 20 / 90;
const DIR_HOLD_S = 0.32;
const STUCK_REPLAN_S = 0.5;
/** Door taps use the spawn cache. Replans may search further. */
const TAP_BFS_BUDGET = 0;
/** Arrival = inside this radius of the collision-validated sit cell. */
const SIT_CELL_R = 1.45;

export type JacVisual = {
  obj: MapObject;
  sprite: Sprite;
  key: string;
  cull: { x0: number; y0: number; x1: number; y1: number };
  occluder: OccluderBox | null;
  zIndex: number;
};

export type JacInput = { dx: number; dy: number; autoShift?: boolean };

export type JacSnapshot = {
  mode: JacMode;
  loaded: boolean;
  driving: boolean;
  engineOn: boolean;
  lights: JacLights;
  lightsOn: boolean;
  gear: JacGear;
  dir: FacingDir;
  heading: number;
  vel: number;
  rpm: number;
  mph: number;
  reversing: boolean;
  steering: number;
  driveGoal: { x: number; y: number } | null;
  pathN: number;
  lastParkMs: number;
  sitWhy: string;
  maxTilesPerS: number;
  visualTx: number;
  visualTy: number;
  bump: number;
  exitCx: number | null;
  exitCy: number | null;
  trunkOpen: boolean;
  row: 'apagado' | 'luces' | 'freno';
  bubble: boolean;
  rearCam: boolean;
  x: number;
  y: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  toggles: Record<JacToggleId, boolean>;
};

type JacHooks = {
  container: Container;
  visual: JacVisual;
  tapBox: Map<string, Rectangle>;
  onChange?: () => void;
  onStuck?: () => void;
};

type DoorSit = {
  x: number;
  y: number;
  doorD: number;
  along: number;
  walkD: number;
  heading: FacingDir;
};

function vfsOf(dir: FacingDir): { x: number; y: number } {
  const o = SOUTH_OFF_1X[dir];
  return { x: ANCHOR_1X.x + o.x, y: ANCHOR_1X.y + o.y };
}

function parkSize(dir: FacingDir): { w: number; h: number } {
  return dir === 'se' || dir === 'nw' ? PARK_SE : PARK_SW;
}

function k(x: number, y: number): string {
  return `${x},${y}`;
}

const PROP_NAMES = new Set(['tree', 'bench', 'lamp', 'muro', 'fill']);
const CARDINALS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const EDGE_DIRS: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

const HARD_PROP_NAMES = new Set(['tree', 'muro']);

/** Trees, benches, lamps, muro walls and fill solids — never this van's own cells. */
function buildPropCells(): { all: Set<string>; hard: Set<string> } {
  const self = new Set<string>();
  for (const o of objects) {
    if (o.id !== JAC_ID) continue;
    const fx = o.footprintX ?? o.x;
    const fy = o.footprintY ?? o.y;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) self.add(k(fx + dx, fy + dy));
    }
  }
  const all = new Set<string>(muroWallTiles());
  const hard = new Set<string>(muroWallTiles());
  for (const [x, y] of fill.solidCells) {
    const key = k(x, y);
    if (!self.has(key)) all.add(key);
  }
  for (const o of objects) {
    if (o.id === JAC_ID || o.flat || !PROP_NAMES.has(o.name)) continue;
    const fx = o.footprintX ?? o.x;
    const fy = o.footprintY ?? o.y;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const key = k(fx + dx, fy + dy);
        all.add(key);
        if (HARD_PROP_NAMES.has(o.name)) hard.add(key);
      }
    }
  }
  return { all, hard };
}
const PROP_SETS = buildPropCells();
const PROP_CELLS = PROP_SETS.all;
const HARD_PROP_CELLS = PROP_SETS.hard;

function dirIndex(dir: FacingDir): number {
  const i = DIR_ORDER.indexOf(dir);
  return i < 0 ? 0 : i;
}

function dirFromHeading(h: number): FacingDir {
  return DIR_ORDER[(((Math.round(h) % 4) + 4) % 4)];
}

function headingDelta(from: number, to: number): number {
  let d = to - from;
  if (d > 2) d -= 4;
  if (d < -2) d += 4;
  return d;
}

export function tileIsStandable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
  if (!cells[y]?.[x]?.walkable) return false;
  const b = getBuildingAt(x, y);
  if (!b) return true;
  if (b.door && b.door.x === x && b.door.y === y) return true;
  if (b.name === 'muro' || b.name === 'obelisco') return true;
  return false;
}

function wrapHeading(h: number): number {
  let x = h % 4;
  if (x < 0) x += 4;
  return x;
}

function slide(
  x: number,
  y: number,
  dx: number,
  dy: number,
  ok: (nx: number, ny: number) => boolean,
): { x: number; y: number } {
  if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  if (dx !== 0 && ok(x + dx, y)) return { x: x + dx, y };
  if (dy !== 0 && ok(x, y + dy)) return { x, y: y + dy };
  return { x, y };
}

export class JacT9 {
  readonly obj: MapObject;
  private hooks: JacHooks;
  private body!: Sprite;
  private cone = new Sprite();
  private haze = new Sprite();
  private ghost = new Sprite();
  private ghostOnLayer = false;
  private loaded = false;
  private loading: Promise<void> | null = null;
  private textures = new Map<string, Texture>();

  mode: JacMode = 'parked';
  dir: FacingDir = 'se';
  lights: JacLights = 'auto';
  gear: JacGear = 'P';
  engineOn = false;
  rpm = 0;
  mph = 0;
  reversing = false;
  steering = 0;
  bubble = false;
  toggles: Record<JacToggleId, boolean> = {
    left: false,
    hazards: false,
    right: false,
    fog: false,
    bed: false,
    trailer: false,
  };

  /** Footprint centre in tile space (floats while driving). */
  cx: number;
  cy: number;
  /** Initial map placement of this same van (origin 23,16). Driving moves these coords. */
  readonly spawn: {
    origin: { x: number; y: number };
    center: { x: number; y: number };
    front: { x: number; y: number };
    size: { w: number; h: number };
  };
  private claimed = new Map<string, boolean>();
  private wheel = 0;
  private wheelAcc = 0;
  private row: 'apagado' | 'luces' | 'freno' = 'apagado';
  private qaSteer: number | null = null;
  /** True after the player taps D/R/P/N so auto-shift does not overwrite it. */
  private gearHeld = false;
  /** Stick was released after a gear-button press; next stick press may auto-shift. */
  private gearReleased = true;
  private hazardT = 0;
  /** Continuous heading: 0=se, 1=sw, 2=nw, 3=ne. */
  private heading = 0;
  /** Signed tiles/s: +forward along heading, −reverse. */
  private vel = 0;
  drivePath: { x: number; y: number }[] = [];
  driveGoal: { x: number; y: number } | null = null;
  private shiftDwell = 0;
  private shiftArmedAt = 0;
  private pendingExit = false;
  private exitHold = 0;
  private exitSit: { x: number; y: number } | null = null;
  private stuckT = 0;
  private unstickHold = 0;
  private driveHadSpeed = false;
  private lastUnstickAt = 0;
  private replanN = 0;
  private stuckGaveUp = false;
  private dirHoldT = 0;
  /** Door-park routes may use the 2×2 drive box, not both parked AABBs. */
  private followLoose = false;
  private followDir: FacingDir | null = null;
  private goalBest = Infinity;
  private noProgressT = 0;
  bumpT = 0;
  private bumpArmed = true;
  private exitFrom: { x: number; y: number } | null = null;
  /** Last `parkForDoor` search, milliseconds (performance.now). */
  lastParkMs = 0;
  lastParkHeading: FacingDir | null = null;
  private walkDistCache = new Map<string, Map<string, number>>();
  private doorSitCache = new Map<string, DoorSit[]>();
  private pathsFrom = '';
  private pathToSit = new Map<string, { x: number; y: number }[]>();
  private doorRouteCache = new Map<
    string,
    { x: number; y: number; path: { x: number; y: number }[]; heading: FacingDir }
  >();
  private parkDoor: { x: number; y: number } | null = null;
  private skippedSits = new Set<string>();
  private lastStuckCell = '';
  private pathCacheTimer = 0;
  /** Last reason a door sit did not finish — QA / console. */
  sitWhy = '';

  constructor(obj: MapObject, hooks: JacHooks) {
    this.obj = obj;
    this.hooks = hooks;
    this.body = hooks.visual.sprite;
    this.cx = (obj.footprintX ?? obj.x) + ((obj.w ?? 1) - 1) / 2;
    this.cy = (obj.footprintY ?? obj.y) + ((obj.h ?? 1) - 1) / 2;
    this.spawn = {
      origin: { x: obj.footprintX ?? obj.x, y: obj.footprintY ?? obj.y },
      center: { x: this.cx, y: this.cy },
      front: { x: 27, y: 18 },
      size: { w: obj.w ?? 5, h: obj.h ?? 3 },
    };
    this.cone.visible = false;
    this.haze.visible = false;
    this.ghost.visible = false;
    this.ghost.label = 'jac-ghost';
    this.cone.eventMode = 'none';
    this.haze.eventMode = 'none';
    this.ghost.eventMode = 'none';
    this.ghost.alpha = 0.62;
    this.ghost.tint = 0xf4f6f8;
    hooks.container.addChildAt(this.cone, 0);
    hooks.container.addChild(this.haze);
    this.snapshotClaimFromGrid();
    this.attachGhost();
    this.precomputeDoorSits();
  }

  get driving(): boolean {
    return this.mode === 'drive';
  }

  get lightsOn(): boolean {
    if (this.lights === 'on') return true;
    if (this.lights === 'off') return false;
    return this.driving && this.engineOn;
  }

  get trunkOpen(): boolean {
    return this.toggles.bed;
  }

  private rearHold = 0;

  get rearCam(): boolean {
    return this.driving && this.gear === 'R';
  }

  private tickRearHold(dt: number): void {
    if (this.vel < -0.08) this.rearHold = 0.5;
    else this.rearHold = Math.max(0, this.rearHold - dt);
  }

  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    this.loading = this.loadAll().then(() => {
      this.loaded = true;
      this.applySprite();
    });
    return this.loading;
  }

  setMode(mode: JacMode): void {
    if (this.mode === mode) return;
    const wasDrive = this.mode === 'drive';
    this.mode = mode;
    if (mode === 'drive') {
      this.engineOn = true;
      this.gear = 'P';
      this.rpm = IDLE_RPM;
      this.mph = 0;
      this.vel = 0;
      this.heading = dirIndex(this.dir);
      this.gearHeld = false;
      this.gearReleased = true;
      this.bubble = false;
      this.rearHold = 0;
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
      this.pendingExit = false;
      this.exitHold = 0;
      this.exitSit = null;
      this.stuckT = 0;
      this.bumpT = 0;
      this.bumpArmed = true;
      this.exitFrom = null;
      this.clearDrivePath();
      this.applyParkedSolid(false);
      this.precomputeDoorSits();
      this.precomputeDoorRoutes();
      this.schedulePathsFromHere();
    } else if (wasDrive) {
      this.engineOn = false;
      this.gear = 'P';
      this.gearHeld = false;
      this.gearReleased = true;
      this.rpm = 0;
      this.mph = 0;
      this.vel = 0;
      this.reversing = false;
      this.steering = 0;
      this.rearHold = 0;
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
      this.pendingExit = false;
      this.exitHold = 0;
      this.stuckT = 0;
      this.bumpT = 0;
      this.bumpArmed = true;
      this.exitFrom = null;
      this.clearDrivePath();
      this.relayoutParked();
      return;
    }
    if (mode === 'info') void this.ensureLoaded();
    if (mode === 'drive') void this.ensureLoaded();
    this.applySprite();
    this.hooks.onChange?.();
  }

  openMenu(): void {
    if (this.mode === 'drive') return;
    this.bubble = false;
    this.setMode('menu');
  }

  closeToMap(): void {
    if (this.mode === 'drive') return;
    this.setMode('parked');
  }

  openInfo(): void {
    if (this.mode === 'drive') return;
    this.setMode('info');
  }

  setLights(lights: JacLights): void {
    this.lights = lights;
    this.applySprite();
    this.hooks.onChange?.();
  }

  setGear(gear: JacGear): void {
    this.gear = gear;
    this.gearHeld = true;
    this.gearReleased = false;
    if (gear === 'P' || gear === 'N') {
      this.vel = 0;
      this.mph = 0;
      this.reversing = false;
      this.clearDrivePath();
    } else {
      this.reversing = gear === 'R';
    }
    this.rearHold = 0;
    this.hooks.onChange?.();
  }

  setToggle(id: JacToggleId, on?: boolean): void {
    this.toggles[id] = on ?? !this.toggles[id];
    this.applySprite();
    this.hooks.onChange?.();
  }

  setTrunk(open: boolean): void {
    this.toggles.bed = open;
    this.applySprite();
    this.hooks.onChange?.();
  }

  setEngine(on: boolean): void {
    this.engineOn = on;
    if (!on) {
      this.rpm = 0;
      this.mph = 0;
    } else if (this.rpm < 1) this.rpm = this.driving ? IDLE_RPM : 0;
    this.applySprite();
    this.hooks.onChange?.();
  }

  setBubble(on: boolean): void {
    this.bubble = on;
    this.hooks.onChange?.();
  }

  setDir(dir: FacingDir): void {
    if (this.dir === dir) return;
    if (!this.sitWith(this.cx, this.cy, dir) && !this.pathSit(this.cx, this.cy)) return;
    this.dir = dir;
    this.heading = dirIndex(dir);
    if (!this.driving) this.applyParkedSolid(true);
    this.layout();
    this.applySprite();
    this.hooks.onChange?.();
  }

  clearDrivePath(): void {
    this.drivePath = [];
    this.driveGoal = null;
    this.replanN = 0;
    this.stuckT = 0;
    this.unstickHold = 0;
    this.stuckGaveUp = false;
    this.driveHadSpeed = false;
    this.lastUnstickAt = 0;
    this.followLoose = false;
    this.followDir = null;
    this.goalBest = Infinity;
    this.noProgressT = 0;
    this.parkDoor = null;
    this.skippedSits.clear();
    this.lastStuckCell = '';
  }

  setDrivePath(path: { x: number; y: number }[], goal: { x: number; y: number }, opts?: { loose?: boolean }): void {
    this.drivePath = path.slice();
    this.driveGoal = goal;
    this.gearHeld = false;
    this.gearReleased = true;
    this.replanN = 0;
    this.stuckT = 0;
    this.unstickHold = 0;
    this.stuckGaveUp = false;
    this.followLoose = !!opts?.loose;
    this.followDir = null;
    this.goalBest = Math.hypot(this.cx - goal.x, this.cy - goal.y);
    this.noProgressT = 0;
    this.applyPathGear(false);
  }

  /** Follow in D; reverse only when the next node is clearly behind and we are allowed to. */
  private applyPathGear(allowReverse: boolean): void {
    if (this.gearHeld || this.drivePath.length === 0) return;
    const t = this.drivePath[0];
    const ax = t.x - this.cx;
    const ay = t.y - this.cy;
    const dist = Math.hypot(ax, ay);
    if (dist < 1e-4) {
      this.gear = 'D';
      return;
    }
    const ang = this.heading * (Math.PI / 2);
    const hx = Math.cos(ang);
    const hy = Math.sin(ang);
    const behind = hx * ax + hy * ay < -0.35 && dist > 0.75;
    this.gear = allowReverse && behind ? 'R' : 'D';
  }

  /**
   * Sit-centre depth, but stay behind a nearby building sprite (catedral wing overhangs
   * its footprint). Only draw in front once the sit is past both the east and south faces.
   */
  private sortDepth(): number {
    let z = this.cx + this.cy + 0.2;
    for (const o of objects) {
      if (o.type !== 'building' || o.flat) continue;
      const fx = o.footprintX ?? o.x;
      const fy = o.footprintY ?? o.y;
      const w = o.w ?? 1;
      const h = o.h ?? 1;
      const front = fx + w - 1 + fy + h - 1;
      if (this.cx < fx - 4 || this.cy < fy - 4 || this.cx > fx + w + 5 || this.cy > fy + h + 5) {
        continue;
      }
      const pastEast = this.cx > fx + w + 0.45;
      const pastSouth = this.cy > fy + h + 0.45;
      if (pastEast && pastSouth) continue;
      z = Math.min(z, front - 0.25);
    }
    return z;
  }

  /** Freeze D/R so an unreachable tap cannot auto-shift. */
  holdGear(): void {
    this.gearHeld = true;
  }

  canDriveAt(cx: number, cy: number): boolean {
    return this.canSit(cx, cy) || this.canSitLoose(cx, cy);
  }

  /** Same walkable grid the avatar uses, plus this van's own claimed cells. */
  driveTileOk(x: number, y: number): boolean {
    return this.canDriveTile(x, y);
  }

  private canDriveTile(x: number, y: number): boolean {
    if (this.claimed.has(k(x, y))) return true;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    return c.walkable;
  }

  findDrivePath(gx: number, gy: number): { x: number; y: number }[] | null {
    const sx = Math.round(this.cx);
    const sy = Math.round(this.cy);
    const finish = (path: { x: number; y: number }[], tx: number, ty: number) => {
      if (path.length === 0 || path[path.length - 1].x !== tx || path[path.length - 1].y !== ty) {
        return [...path, { x: tx, y: ty }];
      }
      return path;
    };
    const pass = (x: number, y: number) => this.pathSit(x, y) || (x === sx && y === sy);
    const routeTo = (tx: number, ty: number) => {
      if (sx === tx && sy === ty) return [];
      if (!pass(tx, ty)) return null;
      const path = findPathWith(sx, sy, tx, ty, pass);
      return path ? finish(path, tx, ty) : null;
    };
    if (this.pathSit(gx, gy) || (sx === gx && sy === gy)) {
      const direct = routeTo(gx, gy);
      if (direct) return direct;
      if (sx === gx && sy === gy) return [];
    }
    for (let r = 1; r <= 8; r++) {
      let best: { x: number; y: number }[] | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (!this.pathSit(x, y)) continue;
          const path = routeTo(x, y);
          if (!path) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bestD) {
            bestD = d;
            best = path;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Closest sit the 2×2 collider can occupy beside a door. The sit is a
   * collision-grid cell (drive box + parked 5×3 / 3×5). Arrival is being
   * within `SIT_CELL_R` of that cell — not a tighter waypoint radius.
   */
  parkForDoor(doorX: number, doorY: number): {
    x: number;
    y: number;
    path: { x: number; y: number }[];
    heading: FacingDir;
  } | null {
    const t0 = performance.now();
    if (!this.parkDoor || this.parkDoor.x !== doorX || this.parkDoor.y !== doorY) {
      this.parkDoor = { x: doorX, y: doorY };
      this.skippedSits.clear();
    }
    if (this.driveGoal && this.stuckT >= STUCK_REPLAN_S * 0.4) {
      this.skippedSits.add(k(this.driveGoal.x, this.driveGoal.y));
    }
    const originCell = this.laneOrigin();
    const origin = k(originCell.x, originCell.y);
    const cacheKey = `${origin}>${doorX},${doorY}`;
    const cached = this.doorRouteCache.get(cacheKey);
    const cacheStart = cached?.path[0] ?? cached;
    const cacheNear =
      !!cached &&
      !!cacheStart &&
      Math.hypot(this.cx - cacheStart.x, this.cy - cacheStart.y) <= 2.8;
    if (
      cached &&
      cacheNear &&
      !this.skippedSits.has(k(cached.x, cached.y)) &&
      this.sitCellHoldable(cached.x, cached.y) &&
      Math.hypot(cached.x - originCell.x, cached.y - originCell.y) > 3.2
    ) {
      this.lastParkMs = performance.now() - t0;
      this.lastParkHeading = cached.heading;
      return { ...cached, path: cached.path.slice() };
    }
    const bfsBudget = this.stuckT >= STUCK_REPLAN_S * 0.4 ? 3 : TAP_BFS_BUDGET;
    const found = this.solvePark(doorX, doorY, bfsBudget);
    this.lastParkMs = performance.now() - t0;
    if (!found) {
      this.lastParkHeading = null;
      return null;
    }
    this.doorRouteCache.set(cacheKey, { ...found, path: found.path.slice() });
    this.lastParkHeading = found.heading;
    return { ...found, path: found.path.slice() };
  }

  private solvePark(
    doorX: number,
    doorY: number,
    _bfsBudget: number,
  ): { x: number; y: number; path: { x: number; y: number }[]; heading: FacingDir } | null {
    const originCell = this.laneOrigin();
    const sx = originCell.x;
    const sy = originCell.y;
    const usable = this.sitsForDoor(doorX, doorY).filter(
      (c) => !this.skippedSits.has(k(c.x, c.y)) && this.sitCellHoldable(c.x, c.y),
    );
    const doorSide = usable.filter(
      (c) => c.along >= 0 && Math.hypot(c.x - sx, c.y - sy) > 3.2,
    );
    const closeEnough = doorSide.filter((c) => Math.hypot(c.x - doorX, c.y - doorY) <= 8);
    const front = closeEnough.filter((c) => c.along >= 1 && c.doorD >= 3 && c.doorD <= 6);
    const pool = front.length ? front : closeEnough.length ? closeEnough : doorSide.length ? doorSide : usable;
    if (pool.length === 0) return null;
    const prefer = (c: DoorSit) => (cells[c.y]?.[c.x]?.groundId?.includes('park') ? 0 : 1);
    const closeness = (c: DoorSit) => Math.abs(c.doorD - 3.5);
    const doorHug = (c: DoorSit) => (this.parkTouchesDoor(c.x, c.y, c.heading, doorX, doorY) ? 1 : 0);
    const origin = k(sx, sy);
    const exit = this.nearestRoadExit(sx, sy);
    const start = this.driveLaneWalkable(sx, sy) ? { x: sx, y: sy } : exit;
    const goals = new Set(pool.map((c) => k(c.x, c.y)));
    const fromStart = this.driveBfsMany(start.x, start.y, goals);
    const pass = (x: number, y: number) => this.driveLaneWalkable(x, y) || (x === start.x && y === start.y);
    const scored: { c: DoorSit; path: { x: number; y: number }[] }[] = [];
    for (const cand of pool) {
      const rest =
        this.axisDrivePath(start.x, start.y, cand.x, cand.y, pass) ??
        fromStart.get(k(cand.x, cand.y));
      if (!rest && !(cand.x === start.x && cand.y === start.y)) continue;
      const hop = start.x === sx && start.y === sy ? [] : exit.path;
      const path = hop.concat(rest ?? []);
      if (!this.pathReachesSit(path, cand.x, cand.y, sx, sy)) continue;
      if (this.pathsFrom === origin) this.pathToSit.set(k(cand.x, cand.y), path);
      scored.push({ c: cand, path });
    }
    scored.sort(
      (a, b) =>
        doorHug(a.c) - doorHug(b.c) ||
        a.path.length - b.path.length ||
        prefer(a.c) - prefer(b.c) ||
        closeness(a.c) - closeness(b.c) ||
        a.c.walkD - b.c.walkD,
    );
    const best = scored[0];
    return best ? { x: best.c.x, y: best.c.y, path: best.path, heading: best.c.heading } : null;
  }

  private isStreetCell(x: number, y: number): boolean {
    return cells[y]?.[x]?.groundId.includes('path/street') ?? false;
  }

  /** 2×2 drive box overlaps a carved street — the van is on the road network. */
  private onRoad(cx: number, cy: number): boolean {
    const o = {
      x: Math.round(cx - (DRIVE_BOX - 1) / 2),
      y: Math.round(cy - (DRIVE_BOX - 1) / 2),
    };
    for (const [x, y] of this.rect(o.x, o.y, DRIVE_BOX, DRIVE_BOX)) {
      if (this.isStreetCell(x, y)) return true;
    }
    return false;
  }

  /** Integer lane cell nearest the sit — `round(25.5)` is 26 and misses the south road. */
  private laneOrigin(): { x: number; y: number } {
    const gx = this.cx;
    const gy = this.cy;
    const seeds: { x: number; y: number }[] = [
      { x: Math.round(gx - 0.5), y: Math.round(gy) },
      { x: Math.floor(gx), y: Math.round(gy) },
      { x: Math.round(gx), y: Math.round(gy) },
      { x: Math.ceil(gx), y: Math.round(gy) },
    ];
    let best = seeds[0];
    let bestD = Infinity;
    const seen = new Set<string>();
    for (const s of seeds) {
      const id = k(s.x, s.y);
      if (seen.has(id)) continue;
      seen.add(id);
      if (!this.driveLaneWalkable(s.x, s.y) && !this.driveBoxWalkable(s.x, s.y, true)) continue;
      const d = Math.hypot(s.x - gx, s.y - gy) + (this.onRoad(s.x, s.y) ? 0 : 0.25);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (bestD < Infinity) return best;
    return { x: Math.round(gx - 0.5), y: Math.round(gy) };
  }

  /** Closest 2×2-walkable road cell, and the short hop off the lot onto it. */
  private nearestRoadExit(sx: number, sy: number): { x: number; y: number; path: { x: number; y: number }[] } {
    const pass = (x: number, y: number) => this.driveLaneWalkable(x, y) || (x === sx && y === sy);
    if (this.onRoad(sx, sy) && pass(sx, sy)) return { x: sx, y: sy, path: [] };
    const seen = new Set<string>([k(sx, sy)]);
    type Node = { x: number; y: number; parent: Node | null };
    const q: Node[] = [{ x: sx, y: sy, parent: null }];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      if ((cur.x !== sx || cur.y !== sy) && this.onRoad(cur.x, cur.y) && this.driveLaneWalkable(cur.x, cur.y)) {
        return { x: cur.x, y: cur.y, path: this.reconstructDrivePath(cur, sx, sy) };
      }
      for (const [dx, dy] of CARDINALS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const id = k(nx, ny);
        if (seen.has(id) || !pass(nx, ny)) continue;
        seen.add(id);
        q.push({ x: nx, y: ny, parent: cur });
      }
    }
    return { x: sx, y: sy, path: [] };
  }

  private reconstructDrivePath(
    node: { x: number; y: number; parent: { x: number; y: number; parent: unknown } | null },
    sx: number,
    sy: number,
  ): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let n: { x: number; y: number; parent: { x: number; y: number; parent: unknown } | null } | null = node;
    while (n) {
      path.push({ x: n.x, y: n.y });
      n = n.parent as typeof n;
    }
    path.reverse();
    if (path[0]?.x === sx && path[0]?.y === sy) path.shift();
    return path;
  }

  /** One flood fill to every sit — shortest 2×2 route in tiles, not Manhattan. */
  private driveBfsMany(
    sx: number,
    sy: number,
    goals: Set<string>,
  ): Map<string, { x: number; y: number }[]> {
    const out = new Map<string, { x: number; y: number }[]>();
    if (goals.has(k(sx, sy))) out.set(k(sx, sy), []);
    if (out.size >= goals.size) return out;
    const pass = (x: number, y: number) => this.driveLaneWalkable(x, y) || (x === sx && y === sy);
    const seen = new Set<string>([k(sx, sy)]);
    type Node = { x: number; y: number; parent: Node | null };
    const q: Node[] = [{ x: sx, y: sy, parent: null }];
    for (let i = 0; i < q.length && out.size < goals.size; i++) {
      const cur = q[i];
      for (const [dx, dy] of CARDINALS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const id = k(nx, ny);
        if (seen.has(id) || !pass(nx, ny)) continue;
        seen.add(id);
        const next: Node = { x: nx, y: ny, parent: cur };
        q.push(next);
        if (goals.has(id)) out.set(id, this.reconstructDrivePath(next, sx, sy));
      }
    }
    return out;
  }

  /** Sit must hold the parked 5×3 / 3×5, not only the live 2×2 drive box. */
  private sitCellHoldable(x: number, y: number): boolean {
    const keep = this.parkDoor ? this.doorKeepClear(this.parkDoor.x, this.parkDoor.y) : new Set<string>();
    return !!this.parkHeadingAt(x, y, keep);
  }

  /** Path must actually end on the sit cell (or already be there). */
  private pathReachesSit(
    path: { x: number; y: number }[],
    tx: number,
    ty: number,
    sx: number,
    sy: number,
  ): boolean {
    if (sx === tx && sy === ty) return true;
    const last = path[path.length - 1];
    return !!last && last.x === tx && last.y === ty;
  }

  private precomputeDoorSits(): void {
    for (const b of getEnterableBuildings()) {
      if (b.door) this.sitsForDoor(b.door.x, b.door.y);
    }
  }

  /** Warm per-door routes from this cell so a later tap is a cache hit (no BFS). */
  private precomputeDoorRoutes(): void {
    const originCell = this.laneOrigin();
    const origin = k(originCell.x, originCell.y);
    this.pathsFrom = origin;
    for (const b of getEnterableBuildings()) {
      if (!b.door) continue;
      const key = `${origin}>${b.door.x},${b.door.y}`;
      if (this.doorRouteCache.has(key)) continue;
      const found = this.solvePark(b.door.x, b.door.y, 8);
      if (found) this.doorRouteCache.set(key, found);
    }
  }

  private schedulePathsFromHere(): void {
    if (this.pathCacheTimer) return;
    const run = () => {
      this.pathCacheTimer = 0;
      this.ensurePathsFromHere();
    };
    if (typeof requestAnimationFrame === 'function') {
      this.pathCacheTimer = requestAnimationFrame(run);
    } else {
      run();
    }
  }

  private ensurePathsFromHere(): void {
    const origin = k(Math.round(this.cx), Math.round(this.cy));
    if (this.pathsFrom === origin) return;
    this.pathsFrom = origin;
    this.pathToSit.clear();
  }

  private sitsForDoor(doorX: number, doorY: number): DoorSit[] {
    const key = k(doorX, doorY);
    const hit = this.doorSitCache.get(key);
    if (hit) return hit;
    const keep = this.doorKeepClear(doorX, doorY);
    const building = getBuildingAtDoor(doorX, doorY);
    const inward = building ? doorInwardStep(building) : null;
    const out = inward ? { x: -inward.x, y: -inward.y } : { x: 0, y: 1 };
    const usable: DoorSit[] = [];
    const SCAN = 12;
    const x0 = Math.max(0, doorX - SCAN);
    const x1 = Math.min(MAP_WIDTH - 1, doorX + SCAN);
    const y0 = Math.max(0, doorY - SCAN);
    const y1 = Math.min(MAP_HEIGHT - 1, doorY + SCAN);
    const walk = this.walkDistFromDoor(doorX, doorY);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!this.driveBoxWalkable(x, y)) continue;
        const heading = this.parkHeadingAt(x, y, keep);
        if (!heading) continue;
        if (this.sitOverlapsBuilding(x, y, heading)) continue;
        if (!this.hasParkExit(x, y, heading)) continue;
        const walkD = this.walkDistParkToDoor(x, y, heading, walk);
        if (!Number.isFinite(walkD)) continue;
        usable.push({
          x,
          y,
          doorD: Math.abs(x - doorX) + Math.abs(y - doorY),
          along: (x - doorX) * out.x + (y - doorY) * out.y,
          walkD,
          heading,
        });
      }
    }
    this.doorSitCache.set(key, usable);
    return usable;
  }

  private hasParkExit(cx: number, cy: number, dir: FacingDir): boolean {
    const blocked = new Set(this.parkCellsAt(cx, cy, dir).map(([x, y]) => k(x, y)));
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (blocked.has(k(nx, ny))) continue;
        if (this.staticWalkable(nx, ny)) return true;
      }
    }
    return false;
  }

  private axisDrivePath(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    pass: (x: number, y: number) => boolean,
  ): { x: number; y: number }[] | null {
    const run = (firstX: boolean): { x: number; y: number }[] | null => {
      const path: { x: number; y: number }[] = [];
      let x = sx;
      let y = sy;
      const stepX = () => {
        while (x !== tx) {
          x += Math.sign(tx - x);
          if (!pass(x, y)) return false;
          path.push({ x, y });
        }
        return true;
      };
      const stepY = () => {
        while (y !== ty) {
          y += Math.sign(ty - y);
          if (!pass(x, y)) return false;
          path.push({ x, y });
        }
        return true;
      };
      if (firstX) {
        if (!stepX() || !stepY()) return null;
      } else if (!stepY() || !stepX()) return null;
      return path;
    };
    return run(true) ?? run(false);
  }

  /** + along the outward door axis (door side). Negative is behind the house. */
  doorSideAlong(doorX: number, doorY: number): number {
    const building = getBuildingAtDoor(doorX, doorY);
    const inward = building ? doorInwardStep(building) : null;
    const out = inward ? { x: -inward.x, y: -inward.y } : { x: 0, y: 1 };
    return (this.cx - doorX) * out.x + (this.cy - doorY) * out.y;
  }

  /** Parked 5×3 / 3×5 cells the walker must go around. */
  parkedFootprintKeys(): Set<string> {
    return new Set(this.parkCells().map(([x, y]) => k(x, y)));
  }

  /** Face a heading whose parked AABB leaves the door and its approach open. */
  faceClearOfDoor(doorX: number, doorY: number): void {
    const keep = this.doorKeepClear(doorX, doorY);
    const prefer = this.lastParkHeading;
    const dir =
      prefer && this.parkSitOk(this.cx, this.cy, prefer) && !this.headingCoversKeep(this.cx, this.cy, prefer, keep)
        ? prefer
        : this.parkHeadingAt(this.cx, this.cy, keep);
    if (!dir || dir === this.dir) return;
    this.dir = dir;
    this.heading = dirIndex(dir);
  }

  private doorKeepClear(doorX: number, doorY: number): Set<string> {
    const keep = new Set<string>([k(doorX, doorY)]);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = doorX + dx;
      const y = doorY + dy;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      const c = cells[y]?.[x];
      if (c?.walkable || this.claimed.has(k(x, y))) keep.add(k(x, y));
    }
    return keep;
  }

  private parkHeadingAt(cx: number, cy: number, keep: Set<string>): FacingDir | null {
    const order: FacingDir[] = [this.dir, ...DIRS.filter((d) => d !== this.dir)];
    for (const dir of order) {
      if (!this.parkSitOk(cx, cy, dir)) continue;
      if (this.headingCoversKeep(cx, cy, dir, keep)) continue;
      return dir;
    }
    return null;
  }

  /** Parked 5×3 / 3×5 plus the 1.6× sprite — used to pick a sit, never the live 2×2 drive box. */
  private parkSitOk(cx: number, cy: number, dir: FacingDir): boolean {
    const size = parkSize(dir);
    return (
      this.driveBoxWalkable(cx, cy) &&
      this.footprintClear(cx, cy, size.w, size.h) &&
      this.spriteFootprintClear(cx, cy, dir) &&
      this.visualSpriteClear(cx, cy, dir) &&
      !this.sitOverlapsBuilding(cx, cy, dir)
    );
  }

  private sitOverlapsBuilding(cx: number, cy: number, dir: FacingDir): boolean {
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      const b = getBuildingAt(x, y);
      if (!b || b.id === JAC_ID) continue;
      if (b.name === 'muro' || b.name === 'obelisco') continue;
      return true;
    }
    return false;
  }

  private exitFromPark(cx: number, cy: number, dir: FacingDir): { x: number; y: number } | null {
    const blocked = new Set(this.parkCellsAt(cx, cy, dir).map(([x, y]) => k(x, y)));
    const found: { x: number; y: number }[] = [];
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (blocked.has(k(nx, ny))) continue;
        if (tileIsStandable(nx, ny)) found.push({ x: nx, y: ny });
      }
    }
    found.sort((a, b) => b.x + b.y - (a.x + a.y));
    const reach = (spot: { x: number; y: number }) => {
      const pass = (x: number, y: number) => !blocked.has(k(x, y)) && tileIsStandable(x, y);
      return pass(spot.x, spot.y);
    };
    const first = found.find(reach);
    if (first) return first;
    for (let d = 1; d <= 6; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (blocked.has(k(x, y))) continue;
          if (tileIsStandable(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /** Parked AABB that shares a cell or edge with the door steals the door tap. */
  private parkTouchesDoor(cx: number, cy: number, dir: FacingDir, doorX: number, doorY: number): boolean {
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      if (Math.abs(x - doorX) + Math.abs(y - doorY) <= 1) return true;
    }
    return false;
  }

  private headingCoversKeep(cx: number, cy: number, dir: FacingDir, keep: Set<string>): boolean {
    const size = parkSize(dir);
    const ox = Math.round(cx - (size.w - 1) / 2);
    const oy = Math.round(cy - (size.h - 1) / 2);
    for (const [x, y] of this.rect(ox, oy, size.w, size.h)) {
      if (keep.has(k(x, y))) return true;
    }
    return false;
  }

  /** Reverse BFS from the door over static walk cells. Cached per door. */
  private walkDistFromDoor(doorX: number, doorY: number): Map<string, number> {
    const key = k(doorX, doorY);
    const hit = this.walkDistCache.get(key);
    if (hit) return hit;
    const dist = new Map<string, number>();
    const q: { x: number; y: number }[] = [];
    const LIMIT = 14;
    const seed = (x: number, y: number) => {
      const id = k(x, y);
      if (dist.has(id)) return;
      if (!this.staticWalkable(x, y) && !(x === doorX && y === doorY)) return;
      dist.set(id, 0);
      q.push({ x, y });
    };
    seed(doorX, doorY);
    for (const [dx, dy] of CARDINALS) seed(doorX + dx, doorY + dy);
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const d = dist.get(k(cur.x, cur.y)) ?? 0;
      if (d >= LIMIT) continue;
      for (const [dx, dy] of CARDINALS) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const id = k(nx, ny);
        if (dist.has(id) || !this.staticWalkable(nx, ny)) continue;
        dist.set(id, d + 1);
        q.push({ x: nx, y: ny });
      }
    }
    this.walkDistCache.set(key, dist);
    return dist;
  }

  /** Walkable when the van is not sitting on the cell (claimed restores the grid). */
  private staticWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    if (PROP_CELLS.has(k(x, y))) return false;
    const c = cells[y]?.[x];
    if (!c) return false;
    const open = c.walkable || this.claimed.has(k(x, y));
    if (!open) return !!getBuildingAtDoor(x, y);
    const b = getBuildingAt(x, y);
    if (!b) return true;
    if (b.door && b.door.x === x && b.door.y === y) return true;
    if (b.name === 'muro' || b.name === 'obelisco') return true;
    return false;
  }

  private walkDistParkToDoor(
    cx: number,
    cy: number,
    dir: FacingDir,
    walk: Map<string, number>,
  ): number {
    const blocked = new Set(this.parkCellsAt(cx, cy, dir).map(([x, y]) => k(x, y)));
    let best = Infinity;
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      for (const [dx, dy] of CARDINALS) {
        const nx = x + dx;
        const ny = y + dy;
        if (blocked.has(k(nx, ny))) continue;
        const d = walk.get(k(nx, ny));
        if (d != null && d < best) best = d;
      }
    }
    return best;
  }

  private parkCellsAt(cx: number, cy: number, dir: FacingDir): [number, number][] {
    const size = parkSize(dir);
    const o = {
      x: Math.round(cx - (size.w - 1) / 2),
      y: Math.round(cy - (size.h - 1) / 2),
    };
    return this.rect(o.x, o.y, size.w, size.h);
  }

  /** Nearest walkable tile beside the footprint that `from` can actually path to. */
  driverDoorTile(from?: { x: number; y: number }): { x: number; y: number } | null {
    return this.nearestReachableApproach(Math.round(from?.x ?? this.cx), Math.round(from?.y ?? this.cy));
  }

  /** Walkable cells touching the current solid footprint (door + every edge). */
  approachTiles(): { x: number; y: number }[] {
    const blocked = new Set(this.solidCells().map(([x, y]) => k(x, y)));
    const pass = (x: number, y: number) => {
      if (blocked.has(k(x, y))) return false;
      return !!cells[y]?.[x]?.walkable;
    };
    return this.edgeWalkable(pass);
  }

  /** Walkable tile beside the van, outside every building footprint. */
  exitTile(): { x: number; y: number } | null {
    return this.exitFromPark(this.cx, this.cy, this.dir);
  }

  /**
   * BFS from the door/edges to the nearest tile the walker can path to.
   * Never returns a blocked or island cell.
   */
  private nearestReachableApproach(fromX: number, fromY: number): { x: number; y: number } | null {
    const blocked = new Set(this.solidCells().map(([x, y]) => k(x, y)));
    const pass = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      if (blocked.has(k(x, y))) return false;
      return !!cells[y]?.[x]?.walkable;
    };
    if (pass(fromX, fromY) && this.touchesFootprint(fromX, fromY)) return { x: fromX, y: fromY };

    const seen = new Set<string>();
    let layer = this.edgeWalkable(pass);
    for (const s of layer) seen.add(k(s.x, s.y));

    while (layer.length && seen.size < 480) {
      const reachable: { x: number; y: number; len: number }[] = [];
      for (const s of layer) {
        if (s.x === fromX && s.y === fromY) return s;
        const path = findPathWith(fromX, fromY, s.x, s.y, pass);
        if (path) reachable.push({ x: s.x, y: s.y, len: path.length });
      }
      if (reachable.length) {
        reachable.sort((a, b) => a.len - b.len || b.x + b.y - (a.x + a.y));
        return { x: reachable[0].x, y: reachable[0].y };
      }
      const next: { x: number; y: number }[] = [];
      for (const s of layer) {
        for (const [dx, dy] of CARDINALS) {
          const x = s.x + dx;
          const y = s.y + dy;
          if (seen.has(k(x, y)) || !pass(x, y)) continue;
          seen.add(k(x, y));
          next.push({ x, y });
        }
      }
      layer = next;
    }
    return null;
  }

  private edgeWalkable(pass: (x: number, y: number) => boolean): { x: number; y: number }[] {
    const found: { x: number; y: number }[] = [];
    const seen = new Set<string>();
    for (const [sx, sy] of this.solidCells()) {
      for (const [dx, dy] of EDGE_DIRS) {
        const x = sx + dx;
        const y = sy + dy;
        const key = k(x, y);
        if (seen.has(key) || !pass(x, y)) continue;
        seen.add(key);
        found.push({ x, y });
      }
    }
    return found;
  }

  private touchesFootprint(x: number, y: number): boolean {
    for (const [sx, sy] of this.solidCells()) {
      if (Math.max(Math.abs(sx - x), Math.abs(sy - y)) <= 1 && (sx !== x || sy !== y)) return true;
    }
    return false;
  }

  update(dt: number, input: JacInput): void {
    const frame = Math.min(MAX_FRAME_DT, Math.max(0, dt));
    if (!this.driving) {
      this.steering = 0;
      this.reversing = false;
      this.vel = 0;
      this.rearHold = 0;
      if (!this.engineOn) {
        this.rpm = 0;
        this.mph = 0;
      }
      return;
    }
    let left = frame;
    let moved = 0;
    while (left > 1e-6) {
      const step = Math.min(SUB_DT, left);
      moved += this.stepDrive(step, input);
      left -= step;
    }
    this.syncMeters(moved, frame);
    this.holdAtGoal();
    if (this.toggles.hazards) this.hazardT += frame;
    else this.hazardT = 0;
    this.applySprite();
  }

  private stepDrive(dt: number, input: JacInput): number {
    let dx = input.dx;
    let dy = input.dy;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    if (this.pendingExit) {
      this.clearDrivePath();
      this.qaSteer = null;
      dx = 0;
      dy = 0;
    }
    if (this.unstickHold > 0) this.unstickHold = Math.max(0, this.unstickHold - dt);
    if (this.dirHoldT > 0) this.dirHoldT = Math.max(0, this.dirHoldT - dt);
    const live = !this.pendingExit && mag > 0.15 && this.unstickHold <= 0;
    if (live) {
      this.clearDrivePath();
      this.qaSteer = null;
    }

    this.resolveOverlap();

    const stickMag = Math.min(1, mag);
    let throttle = 0;
    let steer = 0;
    if (live) {
      if (Math.abs(dx) < 0.2) {
        throttle = (Math.abs(dy) > 0.02 ? Math.sign(-dy) : 1) * stickMag;
        steer = 0;
      } else {
        const isoX = dx + dy;
        const isoY = dy - dx;
        const wantDir: FacingDir =
          Math.abs(isoX) >= Math.abs(isoY) ? (isoX >= 0 ? 'se' : 'nw') : isoY >= 0 ? 'sw' : 'ne';
        let err = dirIndex(wantDir) - this.heading;
        if (err > 2) err -= 4;
        if (err < -2) err += 4;
        steer = Math.max(-1, Math.min(1, err * 2));
        throttle = stickMag;
      }
    }
    const following = !this.pendingExit && !live && (this.drivePath.length > 0 || !!this.driveGoal);
    if (following) {
      const cmd = this.pathFollowStick(dt);
      if (cmd) {
        throttle = cmd.throttle;
        steer = cmd.steer;
      }
    }
    if (!live && !following && this.qaSteer != null) steer = this.qaSteer;
    if (this.pendingExit) throttle = 0;

    this.steering = Math.max(-1, Math.min(1, steer));
    this.applyThrottle(dt, throttle, input.autoShift !== false);

    const moving = Math.abs(this.vel) > 0.08;
    const canTurn = moving || live || following;
    const turningInPlace = following && Math.abs(this.steering) > 0.35 && Math.abs(this.vel) < 0.3;
    if (canTurn && Math.abs(this.steering) > 0.08) {
      const sign = Math.abs(this.vel) > 0.08 ? (this.vel >= 0 ? 1 : -1) : throttle >= 0 ? 1 : -1;
      this.applyHeading(this.heading + this.steering * TURN_RATE * sign * dt);
    }
    if (following && this.followDir) this.commitFacing(this.followDir);

    this.reversing = this.vel < -0.08;
    this.tickRearHold(dt);
    if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 0.33);
    const ox = this.cx;
    const oy = this.cy;
    const fwd = DIR_VEC[this.dir];
    if (moving) {
      const mx = fwd.x;
      const my = fwd.y;
      const nx = mx * this.vel * dt;
      const ny = my * this.vel * dt;
      let next = slide(this.cx, this.cy, nx, ny, (x, y) => this.canSit(x, y));
      if (following && this.drivePath[0] && next.x === this.cx && next.y === this.cy) {
        const a = this.drivePath[0];
        const cap = Math.max(Math.abs(this.vel) * dt, DRIVE_TILES_PER_S * dt);
        const lx = Math.max(-cap, Math.min(cap, a.x - this.cx));
        const ly = Math.max(-cap, Math.min(cap, a.y - this.cy));
        if (lx && this.canSit(this.cx + lx, this.cy)) next = { x: this.cx + lx, y: this.cy };
        else if (ly && this.canSit(this.cx, this.cy + ly)) next = { x: this.cx, y: this.cy + ly };
      }
      const slid = Math.hypot(next.x - this.cx, next.y - this.cy);
      const wantStep = Math.hypot(nx, ny);
      const inContact = wantStep > 0.02 && slid < wantStep * 0.55;
      if (inContact || (following && slid < 0.003 && !!this.driveGoal)) {
        if (this.bumpArmed) this.noteBump();
        this.bumpArmed = false;
        if (following) {
          if (!turningInPlace) this.stuckT += dt;
          if (this.stuckT >= STUCK_REPLAN_S) {
            this.stuckT = 0;
            this.tryReplan();
          }
          if (slid < 1e-4 && this.gear !== 'R') this.vel *= 0.35;
        } else {
          this.vel = 0;
          next = { x: this.cx, y: this.cy };
        }
      } else if (slid > 0.02) {
        this.bumpArmed = true;
        this.stuckT = 0;
      }
      if (this.pendingExit && this.exitFrom) {
        const travel = Math.hypot(next.x - this.exitFrom.x, next.y - this.exitFrom.y);
        if (travel >= EXIT_MAX_TRAVEL) {
          const ang = Math.atan2(next.y - this.exitFrom.y, next.x - this.exitFrom.x);
          next = {
            x: this.exitFrom.x + Math.cos(ang) * EXIT_MAX_TRAVEL,
            y: this.exitFrom.y + Math.sin(ang) * EXIT_MAX_TRAVEL,
          };
          this.vel = 0;
        }
      }
      if (next.x !== this.cx || next.y !== this.cy) {
        const clamped = this.clampSit(next.x, next.y);
        this.cx = clamped.x;
        this.cy = clamped.y;
        this.occupy(this.driveCells());
        this.layout();
      }
      this.resolveOverlap();
      this.wheelAcc += dt * WHEEL_FPS * Math.min(1.4, Math.abs(this.vel) / DRIVE_TILES_PER_S);
      while (this.wheelAcc >= 1) {
        this.wheel = (this.wheel + 1) & 3;
        this.wheelAcc -= 1;
      }
    } else if (following && this.driveGoal) {
      if (!turningInPlace) this.stuckT += dt;
      if (this.stuckT >= STUCK_REPLAN_S) {
        this.stuckT = 0;
        this.tryReplan();
      }
      this.wheelAcc += dt * WHEEL_FPS * Math.min(1.4, Math.abs(this.vel) / DRIVE_TILES_PER_S);
      while (this.wheelAcc >= 1) {
        this.wheel = (this.wheel + 1) & 3;
        this.wheelAcc -= 1;
      }
    } else {
      this.wheelAcc = 0;
    }
    return Math.hypot(this.cx - ox, this.cy - oy);
  }

  /** Stick / S / down: brake to 0, dwell, then shift. Never skip the stop. */
  private applyThrottle(dt: number, throttle: number, autoShift: boolean): void {
    const want = throttle > 0.08 ? 1 : throttle < -0.08 ? -1 : 0;
    if (want === 0) this.gearReleased = true;
    else if (this.gearReleased) {
      this.gearHeld = false;
      this.gearReleased = false;
    }

    if (this.pendingExit || (this.gearHeld && (this.gear === 'P' || this.gear === 'N') && want === 0)) {
      this.brakeTowardZero(dt, this.pendingExit ? EXIT_BRAKE_TILES_S2 : BRAKE_TILES_S2);
      if (Math.abs(this.vel) <= 0.08) {
        this.vel = 0;
        if (this.pendingExit) {
          if (!this.exitSit) {
            this.exitSit = { x: this.cx, y: this.cy };
            this.exitHold = 0.12;
          } else {
            this.exitHold = Math.max(0, this.exitHold - dt);
          }
        }
      }
      return;
    }

    if (want === 0) {
      this.brakeTowardZero(dt, FRICTION_TILES_S2);
      if (Math.abs(this.vel) <= 0.08) {
        this.vel = 0;
        if (!this.shiftArmedAt) this.shiftArmedAt = performance.now();
        if (this.shiftDwell <= 0) this.shiftDwell = SHIFT_DWELL_S;
      }
      return;
    }

    const velSign = this.vel > 0.08 ? 1 : this.vel < -0.08 ? -1 : 0;
    if (velSign !== 0 && velSign !== want) {
      this.brakeTowardZero(dt);
      if (Math.abs(this.vel) <= 0.08) {
        this.vel = 0;
        if (!this.shiftArmedAt) this.shiftArmedAt = performance.now();
        this.shiftDwell = SHIFT_DWELL_S;
      }
      return;
    }

    if (Math.abs(this.vel) <= 0.08) {
      this.vel = 0;
      const need: JacGear = want > 0 ? 'D' : 'R';
      if (this.gearHeld && (this.gear === 'D' || this.gear === 'R') && this.gear !== need) {
        this.brakeTowardZero(dt);
        return;
      }
      if (autoShift && this.gear !== need) {
        if (this.driveGoal) {
          this.gear = need;
        } else {
          const dwell = Math.max(SHIFT_DWELL_S, STOPPED_SHIFT_S);
          if (this.shiftDwell <= 0) this.shiftDwell = dwell;
          this.shiftDwell = Math.max(0, this.shiftDwell - dt);
          if (this.shiftDwell > 0) return;
          this.gear = need;
        }
      } else if (autoShift && !this.gearHeld) {
        this.gear = need;
      }
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
    } else if (autoShift && !this.gearHeld && this.unstickHold <= 0) {
      this.gear = want > 0 ? 'D' : 'R';
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
    }

    const mag = Math.min(1, Math.abs(throttle));
    if (want > 0) this.vel = Math.min(DRIVE_TILES_PER_S, this.vel + ACCEL_TILES_S2 * mag * dt);
    else this.vel = Math.max(-REVERSE_TILES_PER_S, this.vel - ACCEL_TILES_S2 * mag * dt);
  }

  private brakeTowardZero(dt: number, rate = BRAKE_TILES_S2): void {
    if (this.vel > 0) this.vel = Math.max(0, this.vel - rate * dt);
    else if (this.vel < 0) this.vel = Math.min(0, this.vel + rate * dt);
  }

  private noteBump(): void {
    try {
      navigator.vibrate?.(40);
    } catch {
      /* no haptic */
    }
    this.bumpT = BUMP_AMP;
  }

  requestExit(): void {
    this.pendingExit = true;
    this.exitHold = 0;
    this.exitSit = { x: this.cx, y: this.cy };
    this.exitFrom = { x: this.cx, y: this.cy };
    this.clearDrivePath();
    this.gearHeld = false;
    this.qaSteer = null;
    this.vel = 0;
    this.mph = 0;
  }

  readyToExit(): boolean {
    return this.pendingExit && Math.abs(this.vel) <= 0.2 && !!this.exitSit;
  }

  isExiting(): boolean {
    return this.pendingExit;
  }

  isMoving(): boolean {
    return (
      Math.abs(this.vel) > 0.08 ||
      this.mph > 0 ||
      this.pendingExit ||
      this.drivePath.length > 0 ||
      !!this.driveGoal
    );
  }

  cancelExit(): void {
    this.pendingExit = false;
    this.exitHold = 0;
    this.exitSit = null;
  }

  visualCenterWorld(): { x: number; y: number } {
    return this.worldCenter();
  }

  visualCenterTile(): { x: number; y: number } {
    const w = this.visualCenterWorld();
    return {
      x: (w.x / (TILE_W / 2) + w.y / (TILE_H / 2)) / 2,
      y: (w.y / (TILE_H / 2) - w.x / (TILE_W / 2)) / 2,
    };
  }

  /** Collision centre that puts the sprite's visual centre on a tile. */
  sitForVisual(gx: number, gy: number): { x: number; y: number } {
    const off = this.visualOffsetWorld();
    const tw = tileToWorld(gx, gy);
    const wx = tw.x - off.x;
    const wy = tw.y - off.y;
    const tx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
    const ty = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
    if (this.propBodyClear(tx, ty) && (this.canSitLoose(tx, ty) || this.canDriveTile(Math.round(tx), Math.round(ty)))) {
      return { x: tx, y: ty };
    }
    return { x: gx, y: gy };
  }

  private visualOffsetWorld(): { x: number; y: number } {
    const c = this.worldCenter();
    const v = this.visualCenterWorld();
    return { x: v.x - c.x, y: v.y - c.y };
  }

  visualOnTile(gx: number, gy: number): boolean {
    const v = this.visualCenterTile();
    return Math.hypot(v.x - gx, v.y - gy) < 0.42;
  }

  /** Speedometer follows integrator |vel|, not a displacement sample that under-reads diagonals. */
  private syncMeters(_movedTiles: number, _dt: number): void {
    const speed = Math.abs(this.vel);
    if (speed < 0.55) {
      this.rpm = this.engineOn ? IDLE_RPM : 0;
      this.mph = 0;
      return;
    }
    this.rpm = MOVE_RPM;
    this.mph = Math.max(1, Math.min(MOVE_MPH, Math.round((speed / DRIVE_TILES_PER_S) * MOVE_MPH)));
    if (this.mph > 3) this.driveHadSpeed = true;
  }

  private isGoalNode(t: { x: number; y: number }): boolean {
    return !!this.driveGoal && t.x === this.driveGoal.x && t.y === this.driveGoal.y;
  }

  /**
   * Pure pursuit: steer toward a look-ahead on the remaining polyline and feed
   * the same throttle/steer model as the stick. Never teleport onto a node.
   */
  private pathFollowStick(dt: number): { throttle: number; steer: number } | null {
    this.dropPassedPathNodes();
    this.leashToLane();
    this.snapDoorCorner();
    this.recoverPathFollow();
    const goal = this.driveGoal;
    const goalDist = goal ? Math.hypot(goal.x - this.cx, goal.y - this.cy) : Infinity;
    if (this.holdAtGoal()) return { throttle: 0, steer: 0 };
    if (this.drivePath.length === 0) {
      if (goal) this.drivePath.push({ x: goal.x, y: goal.y });
      else {
        this.vel = 0;
        this.reversing = false;
        this.stuckT = 0;
        return { throttle: 0, steer: 0 };
      }
    }
    const look = this.pathLookAhead();
    if (!look) {
      if (this.holdAtGoal()) return { throttle: 0, steer: 0 };
      this.markStuck(dt);
      return { throttle: 0, steer: 0 };
    }
    this.applyPathGear(false);
    const first = this.drivePath[0] ?? look;
    const ax = first.x - this.cx;
    const ay = first.y - this.cy;
    const stepX: FacingDir = ax >= 0 ? 'se' : 'nw';
    const stepY: FacingDir = ay >= 0 ? 'sw' : 'ne';
    const clearStep = (dir: FacingDir) => {
      const v = DIR_VEC[dir];
      return this.followLoose
        ? this.driveLaneWalkable(this.cx + v.x * 0.4, this.cy + v.y * 0.4)
        : this.driveBoxWalkable(this.cx + v.x * 0.4, this.cy + v.y * 0.4);
    };
    let wantDir: FacingDir = (() => {
      const offX = Math.abs(ax) > 0.18;
      const offY = Math.abs(ay) > 0.18;
      const xOk = offX && clearStep(stepX);
      const yOk = offY && clearStep(stepY);
      if (offX && offY) {
        if (xOk !== yOk) return xOk ? stepX : stepY;
        const closer = Math.abs(ax) <= Math.abs(ay) ? stepX : stepY;
        const other = closer === stepX ? stepY : stepX;
        if (clearStep(closer)) return closer;
        if (clearStep(other)) return other;
        return closer;
      }
      if (offX) return stepX;
      if (offY) return stepY;
      return Math.abs(ax) >= Math.abs(ay) ? stepX : stepY;
    })();
    let runDir: FacingDir = wantDir;
    let runLen = this.pathStraightAhead(wantDir);
    for (const dir of DIR_ORDER) {
      const n = this.pathStraightAhead(dir);
      if (n > runLen) {
        runLen = n;
        runDir = dir;
      }
    }
    // Door lanes keep a long run. Ground taps follow the next node so they
    // do not flip heading 9–25 times hunting a leftover axis.
    if (this.followLoose && runLen >= 1.6) wantDir = runDir;
    const want = dirIndex(wantDir);
    let err = want - this.heading;
    if (err > 2) err -= 4;
    if (err < -2) err += 4;
    const steer = Math.max(-1, Math.min(1, err * 2));
    const goalSlow = goalDist < 2.2 ? Math.max(0.28, goalDist / 2.2) : 1;
    this.followDir = wantDir;
    const straight = this.pathStraightAhead(wantDir);
    const headingOnAxis = Math.abs(err) < 0.28;
    let throttle = goalSlow;
    if (this.dir !== wantDir) {
      // Full cruise on a long same-axis run; stop-to-turn only at the actual corner.
      throttle = straight >= 2 && headingOnAxis ? goalSlow : goalDist < 2.2 ? 0.35 : 0;
      if (goalDist > 2.8) this.stuckT = 0;
      if (this.gear === 'R') this.gear = 'D';
    }
    if (Math.hypot(ax, ay) < 0.05) this.markStuck(dt);
    else if (Math.abs(this.vel) > 0.08) this.stuckT = 0;
    this.noteGoalProgress(dt);
    return { throttle, steer };
  }

  /** Advance the polyline when the sit has reached or passed a node. Position is unchanged. */
  private dropPassedPathNodes(): void {
    const ang = this.heading * (Math.PI / 2);
    const hx = Math.cos(ang);
    const hy = Math.sin(ang);
    while (this.drivePath.length > 0) {
      const t = this.drivePath[0];
      const dx = t.x - this.cx;
      const dy = t.y - this.cy;
      const dist = Math.hypot(dx, dy);
      const next = this.drivePath[1];
      if (next && dist > 0.22) {
        const ox = next.x - t.x;
        const oy = next.y - t.y;
        const ol = Math.hypot(ox, oy);
        if (ol > 1e-4 && dist > 1e-4) {
          const corner = (dx * ox + dy * oy) / (dist * ol) <= 0.35;
          if (corner) break;
        }
      }
      const corner = next && dist > 0.15;
      const arrive = corner ? 0.22 : this.followLoose || this.isGoalNode(t) ? 0.5 : 0.35;
      if (dist < arrive) {
        this.drivePath.shift();
        continue;
      }
      const ahead = dx * hx + dy * hy;
      const behind = ahead < -0.05;
      const aligned = dist > 1e-4 && ahead / dist < -0.7;
      if (this.drivePath.length > 1 && behind && dist < 0.7 && aligned) {
        this.drivePath.shift();
        continue;
      }
      break;
    }
  }

  /** Rebuild a collapsed polyline. Position stays on the integrator — no hops. */
  private recoverPathFollow(): void {
    // Door routes stay on the cached lane. A 2×2 BFS rebuild is what sent
    // Estudio west around the bikes and burned 20 s.
    if (this.followLoose) return;
    if (!this.driveGoal) return;
    if (this.drivePath.length === 0) {
      const path = this.findDrivePath(this.driveGoal.x, this.driveGoal.y);
      if (path && path.length > 0) this.drivePath = path;
      return;
    }
    const first = this.drivePath[0];
    const far = Math.abs(first.x - this.cx) + Math.abs(first.y - this.cy) > 4;
    if (!far) return;
    const path = this.findDrivePath(this.driveGoal.x, this.driveGoal.y);
    if (path && path.length > 0) this.drivePath = path;
  }

  private pathLookAhead(): { x: number; y: number } | null {
    const pts = [...this.drivePath];
    if (
      this.driveGoal &&
      (pts.length === 0 ||
        pts[pts.length - 1].x !== this.driveGoal.x ||
        pts[pts.length - 1].y !== this.driveGoal.y)
    ) {
      pts.push(this.driveGoal);
    }
    if (pts.length === 0) return null;
    let budget = PATH_LOOKAHEAD;
    let x = this.cx;
    let y = this.cy;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const dx = p.x - x;
      const dy = p.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-4) continue;
      const nxt = pts[i + 1];
      if (nxt && dist > 0.15) {
        const ox = nxt.x - p.x;
        const oy = nxt.y - p.y;
        const ol = Math.hypot(ox, oy);
        if (ol > 1e-4 && (dx * ox + dy * oy) / (dist * ol) <= 0.35) {
          if (dist >= budget) return { x: x + (dx / dist) * budget, y: y + (dy / dist) * budget };
          return { x: p.x, y: p.y };
        }
      }
      if (dist >= budget) {
        return { x: x + (dx / dist) * budget, y: y + (dy / dist) * budget };
      }
      budget -= dist;
      x = p.x;
      y = p.y;
    }
    return { x, y };
  }

  /** Face the outgoing door-lane run. Position stays on the integrator. */
  private snapDoorCorner(): void {
    if (!this.followLoose || this.drivePath.length < 2) return;
    const a = this.drivePath[0];
    const b = this.drivePath[1];
    const ox = b.x - a.x;
    const oy = b.y - a.y;
    const dx = a.x - this.cx;
    const dy = a.y - this.cy;
    const dist = Math.hypot(dx, dy);
    const ol = Math.hypot(ox, oy);
    if (ol < 1e-4 || dist < 1e-4 || dist > 0.55) return;
    const corner = (dx * ox + dy * oy) / (dist * ol) <= 0.35;
    if (!corner) return;
    const axis: FacingDir = Math.abs(ox) >= Math.abs(oy) ? (ox >= 0 ? 'se' : 'nw') : oy >= 0 ? 'sw' : 'ne';
    this.followDir = axis;
  }

  /** Nudge sideways onto the door polyline. Never pull backward along it. */
  private leashToLane(): void {
    if (!this.followLoose || this.drivePath.length === 0) return;
    const t = this.drivePath[0];
    const next = this.drivePath[1] ?? this.driveGoal;
    if (next) {
      const ox = next.x - t.x;
      const oy = next.y - t.y;
      const ol = Math.hypot(ox, oy);
      if (ol > 1e-4) {
        const along = ((this.cx - t.x) * ox + (this.cy - t.y) * oy) / ol;
        if (along > 0.12) return;
      }
    }
    const dx = t.x - this.cx;
    const dy = t.y - this.cy;
    const d = Math.hypot(dx, dy);
    if (d < 0.85 || d > 6) return;
    const pull = Math.min(0.16, d - 0.7);
    const nx = this.cx + (dx / d) * pull;
    const ny = this.cy + (dy / d) * pull;
    if (!this.driveLaneWalkable(nx, ny)) return;
    this.cx = nx;
    this.cy = ny;
  }

  /** How far the remaining polyline stays on `dir`'s axis before the next corner. */
  private pathStraightAhead(dir: FacingDir): number {
    const v = DIR_VEC[dir];
    let x = this.cx;
    let y = this.cy;
    let n = 0;
    for (const p of this.drivePath) {
      const dx = p.x - x;
      const dy = p.y - y;
      const along = dx * v.x + dy * v.y;
      const side = Math.abs(dx * v.y - dy * v.x);
      if (along < -0.05 || side > 0.35) break;
      n += Math.hypot(dx, dy);
      x = p.x;
      y = p.y;
    }
    return n;
  }

  private noteGoalProgress(dt: number): void {
    if (this.followLoose || !this.driveGoal || this.stuckGaveUp) return;
    const d = Math.hypot(this.cx - this.driveGoal.x, this.cy - this.driveGoal.y);
    if (d < this.goalBest - 0.2) {
      this.goalBest = d;
      this.noProgressT = 0;
      return;
    }
    this.noProgressT += dt;
    if (this.noProgressT < 6) return;
    if (d < 1.4) {
      this.holdAtGoal();
      return;
    }
    this.stuckT = Math.max(this.stuckT, STUCK_REPLAN_S);
    this.tryReplan();
    this.noProgressT = 0;
  }

  /** True when the 2×2 sit is inside the arrival radius of the chosen park cell. */
  atParkSit(goal = this.driveGoal): boolean {
    if (!goal) return false;
    return Math.hypot(goal.x - this.cx, goal.y - this.cy) <= SIT_CELL_R;
  }

  private atDriveGoal(): boolean {
    return this.atParkSit();
  }

  /** Stop on the sit. Door follows keep the goal so the scene can get out. */
  private holdAtGoal(): boolean {
    if (!this.atDriveGoal()) return false;
    this.drivePath = [];
    this.vel = 0;
    this.mph = 0;
    this.reversing = false;
    this.stuckT = 0;
    this.followDir = null;
    if (!this.followLoose) this.driveGoal = null;
    return true;
  }

  private acceptNearGoal(): boolean {
    return this.holdAtGoal();
  }

  private clearDriveArrival(): boolean {
    this.drivePath = [];
    this.driveGoal = null;
    this.vel = 0;
    this.reversing = false;
    this.stuckT = 0;
    this.followLoose = false;
    this.followDir = null;
    return false;
  }

  /** Re-path from the current sit after a stall. Door-follow routes re-plan too. */
  private tryReplan(): boolean {
    if (!this.driveGoal) return this.tryNextSit();
    this.replanN += 1;
    const here = k(Math.round(this.cx), Math.round(this.cy));
    const sameCell = this.lastStuckCell === here;
    this.lastStuckCell = here;
    if (this.followLoose) {
      const origin = this.laneOrigin();
      const pass = (x: number, y: number) => this.driveLaneWalkable(x, y) || (x === origin.x && y === origin.y);
      const rest =
        this.axisDrivePath(origin.x, origin.y, this.driveGoal.x, this.driveGoal.y, pass) ??
        this.driveBfsMany(origin.x, origin.y, new Set([k(this.driveGoal.x, this.driveGoal.y)])).get(
          k(this.driveGoal.x, this.driveGoal.y),
        );
      if (rest && rest.length > 0) {
        this.drivePath = rest;
        this.applyPathGear(false);
        this.stuckT = 0;
        return true;
      }
      return false;
    }
    if (!sameCell && this.replanN < 2) {
      const path = this.findDrivePath(this.driveGoal.x, this.driveGoal.y);
      if (path && path.length > 0 && !this.pathStartsBlocked(path)) {
        this.drivePath = path;
        this.applyPathGear(false);
        this.stuckT = 0;
        return true;
      }
    }
    return this.tryNextSit();
  }

  private pathStartsBlocked(path: { x: number; y: number }[]): boolean {
    const n = path[0];
    if (!n) return true;
    const sx = Math.sign(n.x - this.cx);
    const sy = Math.sign(n.y - this.cy);
    const stepX = sx !== 0 && (this.followLoose
      ? this.driveLaneWalkable(this.cx + sx * 0.4, this.cy)
      : this.driveBoxWalkable(this.cx + sx * 0.4, this.cy));
    const stepY = sy !== 0 && (this.followLoose
      ? this.driveLaneWalkable(this.cx, this.cy + sy * 0.4)
      : this.driveBoxWalkable(this.cx, this.cy + sy * 0.4));
    return !stepX && !stepY;
  }

  private tryNextSit(): boolean {
    if (!this.parkDoor) return false;
    if (this.driveGoal) this.skippedSits.add(k(this.driveGoal.x, this.driveGoal.y));
    const sit = this.parkForDoor(this.parkDoor.x, this.parkDoor.y);
    if (!sit || sit.path.length === 0) return false;
    this.drivePath = sit.path;
    this.driveGoal = { x: sit.x, y: sit.y };
    this.lastParkHeading = sit.heading;
    this.applyPathGear(false);
    this.stuckT = 0;
    this.lastStuckCell = '';
    return true;
  }

  private markStuck(dt: number): void {
    if (this.stuckGaveUp) return;
    if (this.acceptNearGoal()) return;
    this.stuckT += dt;
    if (this.stuckT < STUCK_REPLAN_S || !this.driveGoal) return;
    if (this.tryReplan()) return;
    const far = Math.hypot(this.cx - this.driveGoal.x, this.cy - this.driveGoal.y) > 4;
    if (this.followLoose && far) {
      this.stuckT = 0;
      this.tryReplan();
      return;
    }
    this.clearDriveArrival();
    this.stuckGaveUp = true;
    this.hooks.onStuck?.();
  }

  worldFoot(): { x: number; y: number } {
    const s = this.south();
    return tileFootWorld(s.x, s.y);
  }

  worldCenter(): { x: number; y: number } {
    return tileToWorld(this.cx, this.cy);
  }

  /** Menu / bubble anchor: cab roof in world px. */
  worldRoof(): { x: number; y: number } {
    const c = this.worldCenter();
    return { x: c.x, y: c.y - 90 * objectSpriteScale(this.obj) };
  }

  /** Parked name pill sits on the body sprite's opaque top; driving keeps the cab roof. */
  labelAnchorWorld(): { x: number; y: number } {
    if (this.driving) return this.worldRoof();
    const local = spriteOpaqueTopWorld(this.body);
    const parent = this.body.parent;
    if (parent) return { x: parent.x + local.x, y: parent.y + local.y };
    return local;
  }

  /** World point looking behind the van (opposite facing), in iso tile space. */
  rearLookWorld(): { x: number; y: number } {
    const back = DIR_VEC[this.dir];
    return tileToWorld(this.cx - back.x * 5, this.cy - back.y * 5);
  }

  /** Region of the game canvas (CSS px) looking behind the van. */
  rearSource(toScreen: (x: number, y: number) => { x: number; y: number }, cw: number, ch: number): {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
  } {
    const look = this.rearLookWorld();
    const s = toScreen(look.x, look.y);
    const sw = Math.min(420, cw * 0.55);
    const sh = Math.min(180, ch * 0.28);
    return {
      sx: Math.max(0, Math.min(cw - sw, s.x - sw / 2)),
      sy: Math.max(0, Math.min(ch - sh, s.y - sh * 0.65)),
      sw,
      sh,
    };
  }

  applySprite(): void {
    const on = this.lightsOn;
    if (this.toggles.hazards) {
      const flash = Math.floor(this.hazardT / 0.35) % 2 === 0;
      this.row = flash ? 'freno' : on ? 'luces' : 'apagado';
    } else {
      const brake = this.reversing;
      this.row = brake && on ? 'freno' : on ? 'luces' : 'apagado';
    }
    const moving = this.driving && this.mph > 0.2;
    const hi = spriteResolution() >= 1.5;
    const tex = moving
      ? this.pickTex(
          this.hojaKey(this.dir, this.row, this.wheel, hi),
          this.hojaKey(this.dir, this.row, this.wheel, !hi),
          this.fixedKey(this.dir, this.row, hi),
          this.fixedKey(this.dir, this.row, !hi),
        )
      : this.pickTex(this.fixedKey(this.dir, this.row, hi), this.fixedKey(this.dir, this.row, !hi));
    if (tex) this.body.texture = tex;
    const coneKey = this.layerKey('cono_suelo', this.dir, hi);
    const hazeKey = this.layerKey('haz_salida', this.dir, hi);
    const coneTex = this.textures.get(coneKey);
    const hazeTex = this.textures.get(hazeKey);
    // luces/freno frames already include the ground cone; extra capas only fill gaps.
    const baked = this.row !== 'apagado' && !!tex;
    this.cone.visible = on && !baked && !!coneTex;
    if (coneTex) this.cone.texture = coneTex;
    this.haze.visible = on && !baked && !!hazeTex;
    if (hazeTex) this.haze.texture = hazeTex;
    this.layout();
  }

  snapshot(): JacSnapshot {
    const size = this.driving ? { w: DRIVE_BOX, h: DRIVE_BOX } : parkSize(this.dir);
    return {
      mode: this.mode,
      loaded: this.loaded,
      driving: this.driving,
      engineOn: this.engineOn,
      lights: this.lights,
      lightsOn: this.lightsOn,
      gear: this.gear,
      dir: this.dir,
      heading: this.heading,
      vel: this.vel,
      rpm: Math.round(this.rpm),
      mph: Math.round(this.mph),
      reversing: this.reversing,
      steering: this.steering,
      driveGoal: this.driveGoal,
      pathN: this.drivePath.length,
      lastParkMs: this.lastParkMs,
      sitWhy: this.sitWhy,
      maxTilesPerS: DRIVE_TILES_PER_S,
      visualTx: this.visualCenterTile().x,
      visualTy: this.visualCenterTile().y,
      bump: this.bumpT,
      exitCx: this.exitSit?.x ?? null,
      exitCy: this.exitSit?.y ?? null,
      trunkOpen: this.trunkOpen,
      row: this.row,
      bubble: this.bubble,
      rearCam: this.rearCam,
      x: this.obj.x,
      y: this.obj.y,
      cx: this.cx,
      cy: this.cy,
      w: size.w,
      h: size.h,
      toggles: { ...this.toggles },
    };
  }

  setQaSteer(value: number | null): void {
    this.qaSteer = value;
    this.steering = value ?? 0;
  }

  /** QA: snap the van to a tile centre and facing. */
  qaPlace(cx: number, cy: number, dir: FacingDir, driving: boolean): void {
    this.dir = dir;
    this.heading = dirIndex(dir);
    this.cx = cx;
    this.cy = cy;
    this.vel = 0;
    this.mph = 0;
    this.gear = driving ? 'D' : 'P';
    this.gearHeld = false;
    this.clearDrivePath();
    this.resolveOverlap();
    if (driving) {
      this.mode = 'drive';
      this.engineOn = true;
      this.occupy(this.driveCells());
      this.ensurePathsFromHere();
    } else {
      this.mode = this.mode === 'drive' ? 'parked' : this.mode;
      this.applyParkedSolid(true);
    }
    this.layout();
    this.applySprite();
    this.hooks.onChange?.();
  }

  private south(): { x: number; y: number } {
    // Always the parked AABB so Get in / Get out never jumps the sprite.
    const size = parkSize(this.dir);
    const o = this.origin(size.w, size.h);
    return { x: o.x + size.w - 1, y: o.y + size.h - 1 };
  }

  private origin(w: number, h: number): { x: number; y: number } {
    return {
      x: Math.round(this.cx - (w - 1) / 2),
      y: Math.round(this.cy - (h - 1) / 2),
    };
  }

  private driveCells(): [number, number][] {
    if (this.followLoose) return [[Math.round(this.cx), Math.round(this.cy)]];
    const o = this.origin(DRIVE_BOX, DRIVE_BOX);
    return this.rect(o.x, o.y, DRIVE_BOX, DRIVE_BOX);
  }

  private parkCells(): [number, number][] {
    const size = parkSize(this.dir);
    const o = this.origin(size.w, size.h);
    return this.rect(o.x, o.y, size.w, size.h);
  }

  private solidCells(): [number, number][] {
    return this.driving ? this.driveCells() : this.parkCells();
  }

  private rect(x: number, y: number, w: number, h: number): [number, number][] {
    const out: [number, number][] = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push([x + dx, y + dy]);
    return out;
  }

  /**
   * 2×2 drive collider. `loose` is the street lane: the box may cover a lamp /
   * bench / fill shoulder when it already overlaps a carved road. Trees, muro
   * and building footprints stay solid.
   */
  private driveBoxWalkable(cx: number, cy: number, loose = false): boolean {
    const o = {
      x: Math.round(cx - (DRIVE_BOX - 1) / 2),
      y: Math.round(cy - (DRIVE_BOX - 1) / 2),
    };
    const tiles = this.rect(o.x, o.y, DRIVE_BOX, DRIVE_BOX);
    let street = false;
    for (const [x, y] of tiles) {
      if (this.isStreetCell(x, y)) street = true;
    }
    const shoulder = loose && street;
    for (const [x, y] of tiles) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      const c = cells[y]?.[x];
      if (!c) return false;
      if (c.groundId.includes('borde')) return false;
      if (c.groundId.includes('building/footprint')) return false;
      if (HARD_PROP_CELLS.has(k(x, y))) return false;
      if (PROP_CELLS.has(k(x, y)) && !shoulder) return false;
      if (!c.walkable && !this.claimed.has(k(x, y)) && !shoulder) return false;
    }
    return true;
  }

  /**
   * Door-route lane: one walkable cell, not a tree / muro / building. The 2×2
   * may hang over a street shoulder; the sit cell at the end stays 2×2-strict.
   */
  private driveLaneWalkable(cx: number, cy: number): boolean {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    if (HARD_PROP_CELLS.has(k(x, y))) return false;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    if (c.walkable || this.claimed.has(k(x, y)) || this.isStreetCell(x, y)) return true;
    return PROP_CELLS.has(k(x, y));
  }

  private canSit(cx: number, cy: number): boolean {
    return this.sitWith(cx, cy, this.dir);
  }

  /** Current pose with an explicit facing — used to reject a turn that would clip. */
  /** Stick / keys: the parked hull must stay on the map and out of buildings. */
  private stickHullClear(cx: number, cy: number, dir: FacingDir): boolean {
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      if (HARD_PROP_CELLS.has(k(x, y))) return false;
      const c = cells[y]?.[x];
      if (!c) return false;
      if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
      const b = getBuildingAt(x, y);
      if (b && b.id !== JAC_ID && b.name !== 'muro' && b.name !== 'obelisco') return false;
    }
    return true;
  }

  private sitWith(cx: number, cy: number, dir: FacingDir): boolean {
    if (this.driving && !this.pendingExit) {
      if (this.followLoose) return this.driveLaneWalkable(cx, cy);
      return this.driveBoxWalkable(cx, cy) && this.stickHullClear(cx, cy, dir);
    }
    const size = parkSize(dir);
    return (
      this.driveBoxWalkable(cx, cy) &&
      this.footprintClear(cx, cy, size.w, size.h) &&
      this.visualSpriteClear(cx, cy, dir)
    );
  }

  /** Stick / keys / path-follow: never apply a heading whose footprint is blocked. */
  private applyHeading(next: number): void {
    const want = wrapHeading(next);
    const visual = this.facingWithHysteresis(want);
    const collision = dirFromHeading(want);
    const tryDir = visual !== this.dir ? visual : collision;
    if (tryDir === this.dir || this.sitWith(this.cx, this.cy, tryDir)) {
      this.heading = want;
      this.commitFacing(visual);
      return;
    }
    if (collision === this.dir || this.sitWith(this.cx, this.cy, collision)) {
      this.heading = want;
      return;
    }
    this.heading = this.headingAgainstBoundary(want);
  }

  private facingWithHysteresis(h: number): FacingDir {
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, h);
    if (d > 0.5 + DIR_HYSTERESIS) return DIR_ORDER[(idx + 1) & 3];
    if (d < -0.5 - DIR_HYSTERESIS) return DIR_ORDER[(idx + 3) & 3];
    return this.dir;
  }

  private commitFacing(want: FacingDir): void {
    if (want === this.dir) return;
    if (this.dirHoldT > 0) return;
    if (!this.sitWith(this.cx, this.cy, want) && !this.pathSit(this.cx, this.cy)) return;
    this.dir = want;
    this.dirHoldT = DIR_HOLD_S;
  }

  private headingAgainstBoundary(want: number): number {
    const idx = dirIndex(this.dir);
    let delta = want - this.heading;
    if (delta > 2) delta -= 4;
    if (delta < -2) delta += 4;
    const edge = delta >= 0 ? idx + 0.5 - 1e-3 : idx - 0.5 + 1e-3;
    return wrapHeading(edge);
  }

  private overlapCells(): [number, number][] {
    const out: [number, number][] = [];
    const seen = new Set<string>();
    for (const [x, y] of this.parkCellsAt(this.cx, this.cy, this.dir)) {
      const key = k(x, y);
      if (seen.has(key)) continue;
      const b = getBuildingAt(x, y);
      const building = !!b && b.id !== JAC_ID && b.name !== 'muro' && b.name !== 'obelisco';
      const ground = cells[y]?.[x]?.groundId ?? '';
      if (!PROP_CELLS.has(key) && !building && !ground.includes('building/footprint')) continue;
      seen.add(key);
      out.push([x, y]);
    }
    return out;
  }

  /** Smallest axis push that separates the parked AABB from overlapping prop cells. */
  private mtvFor(hit: [number, number][]): { x: number; y: number } {
    const size = parkSize(this.dir);
    const ox = Math.round(this.cx - (size.w - 1) / 2);
    const oy = Math.round(this.cy - (size.h - 1) / 2);
    let minx = Infinity;
    let maxx = -Infinity;
    let miny = Infinity;
    let maxy = -Infinity;
    for (const [x, y] of hit) {
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    const opts = [
      { x: -(ox + size.w - minx), y: 0 },
      { x: maxx + 1 - ox, y: 0 },
      { x: 0, y: -(oy + size.h - miny) },
      { x: 0, y: maxy + 1 - oy },
    ];
    opts.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    const best = opts[0];
    const pad = 0.08;
    return {
      x: best.x === 0 ? 0 : best.x + Math.sign(best.x) * pad,
      y: best.y === 0 ? 0 : best.y + Math.sign(best.y) * pad,
    };
  }

  /** Nudge at most a fraction of a tile. Never hop to another sit or flip heading. */
  resolveOverlap(): boolean {
    if (!this.overlapsProp()) return true;
    const hit = this.overlapCells();
    if (hit.length === 0) return true;
    const mtv = this.mtvFor(hit);
    const pull = Math.hypot(mtv.x, mtv.y);
    if (pull > 1e-4 && pull <= 0.28) {
      const cand = this.clampSit(this.cx + mtv.x, this.cy + mtv.y);
      if (this.sitWith(cand.x, cand.y, this.dir)) {
        this.cx = cand.x;
        this.cy = cand.y;
      }
    }
    this.occupy(this.driving ? this.driveCells() : this.usableParkCells());
    this.layout();
    return !this.overlapsProp();
  }

  /** Planner / replan: same 2×2 box the van actually drives with, so tight door corridors stay open. */
  private pathSit(cx: number, cy: number): boolean {
    return this.followLoose ? this.driveLaneWalkable(cx, cy) : this.driveBoxWalkable(cx, cy);
  }

  /** Last-hop sit: the 2×2 box often clips a wall two tiles short of the tap. */
  private canSitLoose(cx: number, cy: number): boolean {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    if (!(c.walkable || this.claimed.has(k(x, y)))) return false;
    return this.propBodyClear(cx, cy);
  }

  /**
   * Parked AABB (5×3 / 3×5) must not cover a tree, bench, lamp or muro cell —
   * the same footprint the character cannot walk through.
   */
  private footprintClear(cx: number, cy: number, w: number, h: number): boolean {
    const o = {
      x: Math.round(cx - (w - 1) / 2),
      y: Math.round(cy - (h - 1) / 2),
    };
    for (const [x, y] of this.rect(o.x, o.y, w, h)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      if (PROP_CELLS.has(k(x, y))) return false;
      const b = getBuildingAt(x, y);
      if (b && b.id !== JAC_ID && b.name !== 'muro' && b.name !== 'obelisco') return false;
      const c = cells[y]?.[x];
      if (!c) return false;
      if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    }
    return true;
  }

  /** 5×3 / 3×5 plus one extra bed row — sit finding uses this, not the iso-north hang. */
  private spriteFootprintClear(cx: number, cy: number, dir: FacingDir): boolean {
    const size = parkSize(dir);
    if (!this.footprintClear(cx, cy, size.w, size.h)) return false;
    const o = {
      x: Math.round(cx - (size.w - 1) / 2),
      y: Math.round(cy - (size.h - 1) / 2),
    };
    const rear = DIR_VEC[dir];
    const extra = rear.x !== 0 ? this.rect(o.x - rear.x, o.y, 1, size.h) : this.rect(o.x, o.y - rear.y, size.w, 1);
    for (const [x, y] of extra) {
      if (PROP_CELLS.has(k(x, y))) return false;
    }
    return true;
  }

  /**
   * Full drawn sprite: 5×3 / 3×5, bed row, and the iso-north L (south-anchored
   * 1.6× hang). Used to measure overlap at the real parked pose.
   */
  private visualSpriteClear(cx: number, cy: number, dir: FacingDir): boolean {
    if (!this.spriteFootprintClear(cx, cy, dir)) return false;
    const size = parkSize(dir);
    const o = {
      x: Math.round(cx - (size.w - 1) / 2),
      y: Math.round(cy - (size.h - 1) / 2),
    };
    const extra: [number, number][] = [
      ...this.rect(o.x - 1, o.y, 1, size.h),
      ...this.rect(o.x, o.y - 1, size.w, 1),
      [o.x - 1, o.y - 1],
    ];
    for (const [x, y] of extra) {
      if (PROP_CELLS.has(k(x, y))) return false;
    }
    return true;
  }

  /** Sit-finding pose: 2×2 drive box plus parked 5×3 / 3×5 and bed row. */
  canParkHere(): boolean {
    if (this.lastParkHeading && this.parkSitOk(this.cx, this.cy, this.lastParkHeading)) return true;
    return this.parkSitOk(this.cx, this.cy, this.dir);
  }

  private propBodyClear(cx: number, cy: number): boolean {
    const size = parkSize(this.dir);
    return this.footprintClear(cx, cy, size.w, size.h);
  }

  private clampSit(cx: number, cy: number): { x: number; y: number } {
    const hw = (Math.max(PARK_SE.w, PARK_SW.w) - 1) / 2;
    const hh = (Math.max(PARK_SE.h, PARK_SW.h) - 1) / 2;
    return {
      x: Math.min(MAP_WIDTH - 1 - hw, Math.max(hw, cx)),
      y: Math.min(MAP_HEIGHT - 1 - hh, Math.max(hh, cy)),
    };
  }

  /** Parked tap: the footprint only. Door tiles never belong to the van. */
  tapHitsTile(tx: number, ty: number): boolean {
    if (getBuildingAtDoor(tx, ty)) return false;
    for (const [x, y] of this.parkCells()) {
      if (x === tx && y === ty) return true;
    }
    return false;
  }

  /** Reverse through the integrator when a door route has stopped short of the sit. */
  unstickIfStopped(): boolean {
    if (this.mph > 3) this.driveHadSpeed = true;
    if (!this.driving || !this.driveGoal || !this.driveHadSpeed || this.mph > 0.8) return false;
    const now = performance.now();
    if (now - this.lastUnstickAt < 1600) return false;
    const d = Math.hypot(this.cx - this.driveGoal.x, this.cy - this.driveGoal.y);
    if (d < 2) return false;
    this.gear = 'R';
    this.vel = -2.2;
    this.unstickHold = 0.4;
    this.stuckT = 0;
    this.lastUnstickAt = now;
    this.tryReplan();
    return true;
  }

  /** QA: parked 5×3 / 3×5 plus the drawn sprite vs every prop and building. */
  overlapsProp(): boolean {
    const hull = this.parkCellsAt(this.cx, this.cy, this.dir);
    for (const [x, y] of hull) {
      if (PROP_CELLS.has(k(x, y))) return true;
      const b = getBuildingAt(x, y);
      if (b && b.id !== JAC_ID && b.name !== 'muro' && b.name !== 'obelisco') return true;
      const c = cells[y]?.[x];
      if (c?.groundId.includes('building/footprint') || c?.groundId.includes('borde')) return true;
    }
    if (!this.visualSpriteClear(this.cx, this.cy, this.dir)) return true;
    return false;
  }

  /** Reclaim the parked footprint, refresh the live hit box, and retarget the door. */
  relayoutParked(): void {
    this.applyParkedSolid(true);
    this.resolveOverlap();
    this.layout();
    this.applySprite();
    this.hooks.onChange?.();
  }

  private applyParkedSolid(park: boolean): void {
    this.occupy(park ? this.usableParkCells() : this.driveCells());
  }

  private usableParkCells(): [number, number][] {
    const want = this.parkCells();
    if (want.every(([x, y]) => this.cellFreeOrOurs(x, y))) return want;
    return this.driveCells();
  }

  private cellFreeOrOurs(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    return c.walkable || this.claimed.has(k(x, y));
  }

  private occupy(next: [number, number][]): void {
    const keep = new Set(next.map(([x, y]) => k(x, y)));
    for (const [key, was] of [...this.claimed]) {
      if (keep.has(key)) continue;
      const [x, y] = key.split(',').map(Number);
      if (cells[y]?.[x]) cells[y][x].walkable = was;
      this.claimed.delete(key);
    }
    for (const [x, y] of next) {
      const key = k(x, y);
      if (this.claimed.has(key)) continue;
      const c = cells[y]?.[x];
      if (!c) continue;
      this.claimed.set(key, c.walkable);
      c.walkable = false;
    }
  }

  private snapshotClaimFromGrid(): void {
    for (const [x, y] of this.parkCells()) {
      const c = cells[y]?.[x];
      if (!c) continue;
      this.claimed.set(k(x, y), true);
    }
  }

  private layout(): void {
    const south = this.south();
    this.obj.x = south.x;
    this.obj.y = south.y;
    const size = parkSize(this.dir);
    const o = this.origin(size.w, size.h);
    this.obj.footprintX = o.x;
    this.obj.footprintY = o.y;
    this.obj.w = size.w;
    this.obj.h = size.h;
    const foot = tileFootWorld(south.x, south.y);
    this.hooks.container.position.set(foot.x, foot.y);
    const sc = objectSpriteScale(this.obj) || SCALE_HOME;
    const vfs = vfsOf(this.dir);
    const lx = -vfs.x * sc;
    const ly = -vfs.y * sc;
    for (const s of [this.body, this.cone, this.haze]) {
      s.scale.set(sc);
      s.position.set(lx, ly);
    }
    const v = this.hooks.visual;
    v.occluder = objectOccluder(this.obj);
    v.cull = {
      x0: foot.x + lx - 8,
      y0: foot.y + ly - 8,
      x1: foot.x + lx + CELL_1X.w * sc + 8,
      y1: foot.y + ly + CELL_1X.h * sc + 8,
    };
    v.zIndex = this.sortDepth();
    this.hooks.container.zIndex = v.zIndex;
    this.layoutGhost(foot.x + lx, foot.y + ly, sc, v.zIndex);
    const pad = this.driving ? 0 : 8 * sc;
    const box = new Rectangle(lx + 40 * sc - pad, ly + 8 * sc - pad, 200 * sc + pad * 2, 120 * sc + pad * 2);
    this.hooks.tapBox.set(this.obj.id, box);
    this.hooks.container.hitArea = box;
    this.hooks.container.eventMode = 'static';
  }

  private vanBehindBuilding(): boolean {
    for (const o of objects) {
      if (o.type !== 'building' || o.flat) continue;
      const box = objectOccluder(o);
      if (box && playerBehind(box, this.cx, this.cy)) return true;
    }
    return false;
  }

  private attachGhost(): void {
    if (this.ghostOnLayer) return;
    const layer = this.hooks.container.parent;
    if (!layer) return;
    layer.addChild(this.ghost);
    this.ghostOnLayer = true;
  }

  /** Silhouette in front of a roof that is currently hiding the van body. */
  private layoutGhost(wx: number, wy: number, sc: number, vanZ: number): void {
    this.attachGhost();
    if (!this.ghostOnLayer) return;
    const occluded = vanZ < this.cx + this.cy + 0.05 || this.vanBehindBuilding();
    const tex = this.body.texture;
    const ready = !!tex && tex.frame.width > 8 && tex.frame.height > 8;
    this.ghost.position.set(wx, wy);
    this.ghost.scale.set(sc);
    this.ghost.zIndex = 1_000_000;
    const stray = Math.hypot(wx - (this.hooks.container.x + this.body.x), wy - (this.hooks.container.y + this.body.y)) > 48;
    this.ghost.visible = occluded && ready && !stray;
    if (!this.ghost.visible) return;
    this.ghost.texture = tex;
  }

  /** Skip empty / off-sheet frames so a bad wheel cell never blanks the van. */
  private pickTex(...keys: string[]): Texture | undefined {
    for (const key of keys) {
      const tex = this.textures.get(key);
      if (!tex || tex.frame.width < 8 || tex.frame.height < 8) continue;
      if (tex.frame.x + tex.frame.width > tex.source.width + 0.5) continue;
      if (tex.frame.y + tex.frame.height > tex.source.height + 0.5) continue;
      return tex;
    }
    return undefined;
  }

  private fixedKey(dir: FacingDir, row: string, hi: boolean): string {
    return `jac:${row}:${dir}:${hi ? 2 : 1}`;
  }
  private hojaKey(dir: FacingDir, row: string, col: number, hi: boolean): string {
    return `jac:hoja:${row}:${dir}:${col}:${hi ? 2 : 1}`;
  }
  private layerKey(layer: string, dir: FacingDir, hi: boolean): string {
    return `jac:capa:${layer}:${dir}:${hi ? 2 : 1}`;
  }

  private async loadAll(): Promise<void> {
    const hi = spriteResolution() >= 1.5;
    const suf = hi ? '@2x' : '@1x';
    const base = `${import.meta.env.BASE_URL}sprites/jac-t9-v3`;
    const rows = ['apagado', 'luces', 'freno'] as const;
    const layers = ['cono_suelo', 'haz_salida'] as const;
    /** NE/NW cone/haze files were never exported; skip so Get in/drive does not 404. */
    const capaDirs: Record<(typeof layers)[number], readonly FacingDir[]> = {
      cono_suelo: ['se', 'sw'],
      haz_salida: ['se', 'sw'],
    };
    const jobs: Promise<void>[] = [];
    for (const dir of DIRS) {
      for (const row of rows) {
        jobs.push(
          this.loadFixed(dir, row, hi, `${base}/jac-t9-v3__${row}_${dir}${suf}.png`),
        );
      }
      jobs.push(this.loadHoja(dir, hi, `${base}/jac-t9-v3__hoja_${dir}${suf}.png`));
      for (const layer of layers) {
        if (!capaDirs[layer].includes(dir)) continue;
        jobs.push(
          this.loadLayer(layer, dir, hi, `${base}/capas/jac-t9-v3__capa_${layer}_${dir}${suf}.png`),
        );
      }
    }
    await Promise.all(jobs);
  }

  private async loadTex(alias: string, url: string): Promise<Texture | null> {
    try {
      return await Assets.load<Texture>({
        alias,
        src: url,
        data: { autoGenerateMipmaps: false, magFilter: 'nearest', minFilter: 'nearest' },
      });
    } catch {
      return null;
    }
  }

  private async loadFixed(dir: FacingDir, row: string, hi: boolean, url: string): Promise<void> {
    const alias = this.fixedKey(dir, row, hi);
    const tex = await this.loadTex(alias, url);
    if (tex) this.textures.set(alias, tex);
  }

  private async loadLayer(layer: string, dir: FacingDir, hi: boolean, url: string): Promise<void> {
    const alias = this.layerKey(layer, dir, hi);
    const tex = await this.loadTex(alias, url);
    if (tex) this.textures.set(alias, tex);
  }

  private async loadHoja(dir: FacingDir, hi: boolean, url: string): Promise<void> {
    const alias = `jac:hoja:${dir}:${hi ? 2 : 1}`;
    try {
      const sheet = await this.loadTex(alias, url);
      if (!sheet) return;
      // @2x files load at resolution 2, so source.width is the 1x sheet (1120×576), not 2240×1152.
      const cw = sheet.source.width / 4;
      const ch = sheet.source.height / 3;
      const rows = ['apagado', 'luces', 'freno'] as const;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          const key = this.hojaKey(dir, rows[r], c, hi);
          this.textures.set(
            key,
            new Texture({ source: sheet.source, frame: new Rectangle(c * cw, r * ch, cw, ch) }),
          );
        }
      }
    } catch {
      /* wheels optional */
    }
  }
}
