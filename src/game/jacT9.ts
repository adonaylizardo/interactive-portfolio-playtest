import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { cells, MAP_HEIGHT, MAP_WIDTH, TILE_H, TILE_W, type MapObject } from '../data/map';
import { tileFootWorld, tileToWorld } from '../iso/math';
import { findPathWith } from '../iso/pathfinding';
import { objectDepth, objectOccluder, objectSpriteScale, type OccluderBox } from './mapSprites';
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
const EXIT_BRAKE_TILES_S2 = 56;
const FRICTION_TILES_S2 = 10;
const TURN_RATE = 2.4;
const IDLE_RPM = 700;
const MOVE_RPM = 2250;
const MOVE_MPH = 10;
/** Dwell only while braking from the opposite sign. A cold stop (already 0) flips immediately. */
const SHIFT_DWELL_S = 0.4;
const STOPPED_SHIFT_S = 0.18;

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
  rpm: number;
  mph: number;
  reversing: boolean;
  steering: number;
  driveGoal: { x: number; y: number } | null;
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

function facingFrom(dx: number, dy: number, prev: FacingDir): FacingDir {
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return prev;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'se' : 'nw';
  return dy > 0 ? 'sw' : 'ne';
}

function dirIndex(dir: FacingDir): number {
  const i = DIR_ORDER.indexOf(dir);
  return i < 0 ? 0 : i;
}

function dirFromHeading(h: number): FacingDir {
  return DIR_ORDER[(((Math.round(h) % 4) + 4) % 4)];
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
  bumpT = 0;

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
    this.cone.eventMode = 'none';
    this.haze.eventMode = 'none';
    hooks.container.addChildAt(this.cone, 0);
    hooks.container.addChild(this.haze);
    this.snapshotClaimFromGrid();
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
    return this.driving && (this.reversing || this.rearHold > 0.02);
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
      this.bubble = false;
      this.rearHold = 0;
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
      this.pendingExit = false;
      this.exitHold = 0;
      this.exitSit = null;
      this.stuckT = 0;
      this.bumpT = 0;
      this.clearDrivePath();
      this.applyParkedSolid(false);
    } else if (wasDrive) {
      this.engineOn = false;
      this.gear = 'P';
      this.gearHeld = false;
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
      this.clearDrivePath();
      this.applyParkedSolid(true);
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
    if (gear === 'P' || gear === 'N') {
      this.vel = 0;
      this.mph = 0;
      this.reversing = false;
      this.clearDrivePath();
    } else {
      this.reversing = gear === 'R';
    }
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
  }

  setDrivePath(path: { x: number; y: number }[], goal: { x: number; y: number }): void {
    this.drivePath = path;
    this.driveGoal = goal;
    this.gearHeld = false;
    const ax = goal.x - this.cx;
    const ay = goal.y - this.cy;
    const fwd = DIR_VEC[this.dir];
    const behind = fwd.x * ax + fwd.y * ay < -0.35 && Math.hypot(ax, ay) < 5;
    this.gear = behind ? 'R' : 'D';
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
    const pass = (x: number, y: number) => this.canDriveTile(x, y);
    const finish = (path: { x: number; y: number }[], tx: number, ty: number) => {
      if (path.length === 0 || path[path.length - 1].x !== tx || path[path.length - 1].y !== ty) {
        return [...path, { x: tx, y: ty }];
      }
      return path;
    };
    if (!pass(gx, gy) && !(sx === gx && sy === gy)) return null;
    if (pass(gx, gy) || (sx === gx && sy === gy)) {
      const direct = findPathWith(sx, sy, gx, gy, pass);
      if (direct) return finish(direct, gx, gy);
      if (sx === gx && sy === gy) return [];
    }
    for (let r = 1; r <= 2; r++) {
      let best: { x: number; y: number }[] | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (!pass(x, y)) continue;
          const path = findPathWith(sx, sy, x, y, pass);
          if (!path) continue;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bestD) {
            bestD = d;
            best = finish(path, x, y);
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Walkable tile beside the driver door (same hunt as get-out). */
  driverDoorTile(): { x: number; y: number } | null {
    return this.exitTile();
  }

  /** Walkable tile beside the van, or null if none. Prefers the near/south side so the avatar stays on screen. */
  exitTile(): { x: number; y: number } | null {
    const foot = this.solidCells();
    const blocked = new Set(foot.map(([x, y]) => k(x, y)));
    const tryCell = (x: number, y: number) => {
      const c = cells[y]?.[x];
      if (!c || blocked.has(k(x, y))) return false;
      return c.walkable;
    };
    const found: { x: number; y: number }[] = [];
    for (const [sx, sy] of foot) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, 0],
        [0, -1],
        [-1, -1],
      ] as const) {
        const x = sx + dx;
        const y = sy + dy;
        if (tryCell(x, y) && !found.some((p) => p.x === x && p.y === y)) found.push({ x, y });
      }
    }
    found.sort((a, b) => b.x + b.y - (a.x + a.y));
    if (found[0]) return found[0];
    for (let d = 1; d <= 3; d++) {
      for (let dy = -d; dy <= d; dy++) {
        for (let dx = -d; dx <= d; dx++) {
          const x = Math.round(this.cx + dx);
          const y = Math.round(this.cy + dy);
          if (tryCell(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  update(dt: number, input: JacInput): void {
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
    const live = !this.pendingExit && mag > 0.15;
    if (live) {
      this.clearDrivePath();
      this.qaSteer = null;
    }

    if (!this.pendingExit && !live && (this.drivePath.length > 0 || this.driveGoal)) {
      const moved = this.followDrivePath(dt);
      this.steering = 0;
      this.tickRearHold(dt);
      if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 0.35);
      this.syncMeters(moved);
      if (this.toggles.hazards) this.hazardT += dt;
      else this.hazardT = 0;
      this.applySprite();
      return;
    }

    let throttle = live ? -dy : 0;
    let steer = live ? dx : 0;
    if (!live && this.qaSteer != null) steer = this.qaSteer;
    if (this.pendingExit) throttle = 0;

    this.steering = Math.max(-1, Math.min(1, steer));
    this.applyThrottle(dt, throttle, input.autoShift !== false);

    const moving = Math.abs(this.vel) > 0.08;
    if (moving && Math.abs(this.steering) > 0.08) {
      const sign = this.vel >= 0 ? 1 : -1;
      this.heading = wrapHeading(this.heading + this.steering * TURN_RATE * sign * dt);
      this.dir = dirFromHeading(this.heading);
    }

    this.reversing = this.vel < -0.08;
    this.tickRearHold(dt);
    if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 0.35);
    const fwd = DIR_VEC[this.dir];
    if (moving) {
      const nx = fwd.x * this.vel * dt;
      const ny = fwd.y * this.vel * dt;
      const next = slide(this.cx, this.cy, nx, ny, (x, y) => this.canSit(x, y));
      const moved = Math.hypot(next.x - this.cx, next.y - this.cy);
      const wantStep = Math.hypot(nx, ny);
      if (wantStep > 0.04 && moved < wantStep * 0.55 && Math.abs(this.vel) > 0.25) {
        this.noteBump();
        if (moved < 1e-4) this.vel *= 0.35;
      }
      if (next.x !== this.cx || next.y !== this.cy) {
        this.cx = next.x;
        this.cy = next.y;
        this.occupy(this.driveCells());
        this.layout();
      }
      this.wheelAcc += dt * WHEEL_FPS * Math.min(1.4, Math.abs(this.vel) / DRIVE_TILES_PER_S);
      while (this.wheelAcc >= 1) {
        this.wheel = (this.wheel + 1) & 3;
        this.wheelAcc -= 1;
      }
      this.syncMeters(true);
    } else {
      this.syncMeters(false);
      this.wheelAcc = 0;
    }
    if (this.toggles.hazards) this.hazardT += dt;
    else this.hazardT = 0;
    this.applySprite();
  }

  /** Stick / S / down: brake to 0, dwell, then shift. Never skip the stop. */
  private applyThrottle(dt: number, throttle: number, autoShift: boolean): void {
    const want = throttle > 0.08 ? 1 : throttle < -0.08 ? -1 : 0;
    if (want !== 0) this.gearHeld = false;

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
        this.shiftDwell = 0;
        this.shiftArmedAt = 0;
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
      if (autoShift && this.gear !== need) {
        const fromBrake = this.shiftArmedAt > 0;
        const dwell = fromBrake ? SHIFT_DWELL_S : STOPPED_SHIFT_S;
        if (!this.shiftArmedAt) this.shiftArmedAt = performance.now();
        if (this.shiftDwell <= 0) this.shiftDwell = dwell;
        this.shiftDwell = Math.max(0, this.shiftDwell - dt);
        if (fromBrake && performance.now() - this.shiftArmedAt < SHIFT_DWELL_S * 1000) return;
        if (this.shiftDwell > 0) return;
        this.gear = need;
      } else if (autoShift) {
        this.gear = need;
      }
      this.shiftDwell = 0;
      this.shiftArmedAt = 0;
    } else if (autoShift) {
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
    if (this.bumpT < 0.25) {
      try {
        navigator.vibrate?.(40);
      } catch {
        /* no haptic */
      }
    }
    this.bumpT = 1.35;
  }

  requestExit(): void {
    this.pendingExit = true;
    this.exitHold = 0;
    this.exitSit = null;
    this.clearDrivePath();
    this.gearHeld = false;
  }

  readyToExit(): boolean {
    return this.pendingExit && Math.abs(this.vel) <= 0.08 && this.mph === 0 && this.exitHold <= 0 && !!this.exitSit;
  }

  isMoving(): boolean {
    return Math.abs(this.vel) > 0.08 || this.mph > 0;
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
    if (this.canSitLoose(tx, ty) || this.canDriveTile(Math.round(tx), Math.round(ty))) return { x: tx, y: ty };
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

  private syncMeters(moving: boolean): void {
    if (moving) {
      this.rpm = MOVE_RPM;
      this.mph = Math.max(1, Math.round((Math.abs(this.vel) / DRIVE_TILES_PER_S) * MOVE_MPH));
    } else {
      this.rpm = this.engineOn ? IDLE_RPM : 0;
      this.mph = 0;
    }
  }

  private isGoalNode(t: { x: number; y: number }): boolean {
    return !!this.driveGoal && t.x === this.driveGoal.x && t.y === this.driveGoal.y;
  }

  /** Step the same van along A* walkable waypoints. Joystick / keys cancel this in update(). */
  private followDrivePath(dt: number): boolean {
    if (this.driveGoal && Math.hypot(this.driveGoal.x - this.cx, this.driveGoal.y - this.cy) < 1.35) {
      const sit = this.sitForVisual(this.driveGoal.x, this.driveGoal.y);
      this.cx = sit.x;
      this.cy = sit.y;
      this.occupy(this.driveCells());
      this.layout();
      return this.clearDriveArrival();
    }
    while (this.drivePath.length > 0) {
      const t = this.drivePath[0];
      const arrive = this.isGoalNode(t) ? 0.18 : 0.28;
      if (Math.hypot(t.x - this.cx, t.y - this.cy) < arrive) this.drivePath.shift();
      else break;
    }
    if (this.driveGoal && this.visualOnTile(this.driveGoal.x, this.driveGoal.y)) {
      return this.clearDriveArrival();
    }
    if (this.drivePath.length === 0) {
      if (this.driveGoal) {
        const sit = this.sitForVisual(this.driveGoal.x, this.driveGoal.y);
        this.drivePath.push({ x: sit.x, y: sit.y });
      } else {
        this.driveGoal = null;
        this.vel = 0;
        this.reversing = false;
        this.stuckT = 0;
        return false;
      }
    }
    const last = this.drivePath.length === 1;
    if (this.driveGoal && Math.hypot(this.driveGoal.x - this.cx, this.driveGoal.y - this.cy) < 1.35) {
      const sit = this.sitForVisual(this.driveGoal.x, this.driveGoal.y);
      this.cx = sit.x;
      this.cy = sit.y;
      this.occupy(this.driveCells());
      this.layout();
      return this.clearDriveArrival();
    }
    const t = last && this.driveGoal ? this.sitForVisual(this.driveGoal.x, this.driveGoal.y) : this.drivePath[0];
    const ax = t.x - this.cx;
    const ay = t.y - this.cy;
    const dist = Math.hypot(ax, ay);
    if (dist < 1e-4) {
      this.drivePath.shift();
      return this.followDrivePath(dt);
    }
    const reverse = this.gear === 'R';
    const speed = (reverse ? REVERSE_TILES_PER_S : DRIVE_TILES_PER_S) * 0.92;
    const step = Math.min(dist, speed * Math.max(dt, 1 / 120));
    const ux = (ax / dist) * step;
    const uy = (ay / dist) * step;
    const ok = (x: number, y: number) => this.canSitLoose(x, y) || this.canDriveTile(Math.round(x), Math.round(y));
    const next = ok(this.cx + ux, this.cy + uy) ? { x: this.cx + ux, y: this.cy + uy } : slide(this.cx, this.cy, ux, uy, ok);
    if (next.x === this.cx && next.y === this.cy) {
      if (this.acceptNearGoal()) return false;
      if (!last) {
        this.drivePath.shift();
        if (this.drivePath.length === 0) {
          this.markStuck(dt);
          return false;
        }
        return this.followDrivePath(dt);
      }
      this.markStuck(dt);
      return false;
    }
    this.stuckT = 0;
    this.cx = next.x;
    this.cy = next.y;
    this.dir = reverse ? facingFrom(-ax, -ay, this.dir) : facingFrom(ax, ay, this.dir);
    this.heading = dirIndex(this.dir);
    this.vel = reverse ? -speed : speed;
    this.reversing = reverse;
    if (!reverse) this.gear = 'D';
    this.gearHeld = false;
    this.occupy(this.driveCells());
    this.layout();
    this.wheelAcc += dt * WHEEL_FPS;
    while (this.wheelAcc >= 1) {
      this.wheel = (this.wheel + 1) & 3;
      this.wheelAcc -= 1;
    }
    return true;
  }

  private visualGoalMiss(): number {
    if (!this.driveGoal) return Infinity;
    const v = this.visualCenterTile();
    return Math.hypot(v.x - this.driveGoal.x, v.y - this.driveGoal.y);
  }

  private acceptNearGoal(): boolean {
    if (!this.driveGoal || this.visualGoalMiss() > 0.42) return false;
    this.clearDriveArrival();
    return true;
  }

  private clearDriveArrival(): boolean {
    this.drivePath = [];
    this.driveGoal = null;
    this.vel = 0;
    this.reversing = false;
    this.stuckT = 0;
    return false;
  }

  private markStuck(dt: number): void {
    this.vel = 0;
    if (this.acceptNearGoal()) return;
    this.stuckT += dt;
    if (this.stuckT < 0.75 || !this.driveGoal) return;
    this.drivePath = [];
    this.driveGoal = null;
    this.stuckT = 0;
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
      rpm: Math.round(this.rpm),
      mph: Math.round(this.mph),
      reversing: this.reversing,
      steering: this.steering,
      driveGoal: this.driveGoal,
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
    if (driving) {
      this.mode = 'drive';
      this.engineOn = true;
      this.occupy(this.driveCells());
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

  private canSit(cx: number, cy: number): boolean {
    const o = {
      x: Math.round(cx - (DRIVE_BOX - 1) / 2),
      y: Math.round(cy - (DRIVE_BOX - 1) / 2),
    };
    for (const [x, y] of this.rect(o.x, o.y, DRIVE_BOX, DRIVE_BOX)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      const c = cells[y]?.[x];
      if (!c) return false;
      if (c.groundId.includes('borde')) return false;
      if (!c.walkable && !this.claimed.has(k(x, y))) return false;
    }
    return true;
  }

  /** Last-hop sit: the 2×2 box often clips a wall two tiles short of the tap. */
  private canSitLoose(cx: number, cy: number): boolean {
    const x = Math.round(cx);
    const y = Math.round(cy);
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    return c.walkable || this.claimed.has(k(x, y));
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
    // Driving: sit above street dashes / flat fill that share the footprint's front row.
    v.zIndex = objectDepth(this.obj) + (this.driving ? 24 : 0.2);
    this.hooks.container.zIndex = v.zIndex;
    const parent = this.hooks.container.parent;
    if (this.driving && parent && parent.children[parent.children.length - 1] !== this.hooks.container) {
      parent.addChild(this.hooks.container);
    }
    const box = new Rectangle(lx + 40 * sc, ly + 8 * sc, 200 * sc, 120 * sc);
    this.hooks.tapBox.set(this.obj.id, box);
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
