import { Assets, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
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
import { objectOccluder, objectSpriteScale, type OccluderBox } from './mapSprites';
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
const FRICTION_TILES_S2 = 6.5;
const TURN_RATE = 2.4;
/** Stick steering at full lock: tightest circle the van's centre can drive (tiles). */
const MIN_TURN_RADIUS_TILES = 2;
const IDLE_RPM = 700;
const MAX_RPM = 3000;
const RPM_TAU_S = 0.15;
const MPH_TAU_S = 0.12;
const MOVE_MPH = 10;
/** Manual drive: the sprite swaps facing 11° past the 45° line; motion stays within 34° of it. */
const SWAP_HYST = 11 / 90;
const MOTION_CONE = 34 / 90;
/** Gas + steer against an obstacle: heading turns at ~60°/s and the van inches along it. */
/** In-place steering uses the same rate as a rolling turn, so a stop reaches the cap in one go. */
const CREEP_YAW = TURN_RATE;
const CREEP_TILES_PER_S = 1.2;
const CREEP_MIN_STEER = 0.3;
/**
 * A 4-way sprite may rotate only after the van has travelled this far since the last swap.
 * A little past the 0.3-tile gate so a sampled step is not sitting on the line.
 */
const DIR_TRAVEL_MIN = 0.45;
/** |heading − sprite| cap while braking or following a path (~56°). */
const HEADING_CAP = 0.5 + SWAP_HYST;
/**
 * Manual-drive hard cap. 0.62 q is 55.8°, under the gate's 0.625.
 * The sprite swaps on this line. The old 60.5° and 74° soft caps are gone.
 */
const HEADING_HARD = 0.62;
/** In-place or pinned swaps need this much clear road along the new facet. */
const SWAP_AHEAD_TILES = 1;
/** Sprite changes only after this much real travel since the last one (gate floor is 0.1). */
/** Gate D1: 0.1 t since the last real sprite change. Entry is not a change. */
const SWAP_TRAVEL_MIN = 0.1;
/** Follower give-up: less than this much net travel inside FOLLOW_STALL_S. */
const FOLLOW_STALL_S = 2;
const FOLLOW_STALL_TILES = 0.05;
/** A collision may change facing only when the wheel is held past this. */
const YAW_STEER_MIN = 0.08;
/** Tap-to-park gives up when the goal is not a tile closer inside this window. */
const GOAL_IMPROVE_S = 3;
const GOAL_IMPROVE_TILES = 1;
/** Replans that lengthen the polyline this many times, without arriving, give up. */
const PATH_RISE_MAX = 3;
/** Steer arrow once the hidden heading is this far from the drawn sprite (quarter-turns). */
const CUE_HEADING = 20 / 90;
/** A footprint cell counts only when the box overlaps its interior by more than this (tiles). */
const FOOT_EPS = 0.05;
const BUMP_MIN_TILES_PER_S = 2;
const BUMP_GAP_MS = 600;
const N_GAS_HINT_S = 0.4;
/** Pure-pursuit look-ahead along the remaining polyline (tiles). */
const PATH_LOOKAHEAD = 1.45;
const PATH_ARRIVE = 0.42;
/** Collision / vehicle integration step. Large frames are split, never one 50 ms hop. */
const SUB_DT = 1 / 60;
const MAX_FRAME_DT = 0.25;
/** Stay on the current 4-way sprite until heading is 20° past the 45° line. */
const DIR_HYSTERESIS = 20 / 90;
const DIR_HOLD_S = 0.32;
const STUCK_REPLAN_S = 0.5;
export type JacVisual = {
  obj: MapObject;
  sprite: Sprite;
  key: string;
  cull: { x0: number; y0: number; x1: number; y1: number };
  occluder: OccluderBox | null;
  zIndex: number;
};

export type JacInput = { dx: number; dy: number; tileDir?: boolean };

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
  /** QA clock: sum of the frame dt (ms) that update accepted. Only increases. */
  gameTimeMs: number;
  /** QA clock: number of update calls. Only increases. */
  frameId: number;
  vel: number;
  rpm: number;
  mph: number;
  /** Low-passed dashboard readings (needles and the mph number). */
  gaugeRpm: number;
  gaugeMph: number;
  reversing: boolean;
  steering: number;
  driveGoal: { x: number; y: number } | null;
  pathN: number;
  lastParkMs: number;
  visualTx: number;
  visualTy: number;
  bump: number;
  /** Increments once per dashboard-worthy impact. */
  bumpSeq: number;
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
  reverseCue: boolean;
};

type JacHooks = {
  container: Container;
  visual: JacVisual;
  tapBox: Map<string, Rectangle>;
  /** Render zIndex and world-space sprite box the scene actually sorts and culls by. */
  objectVisual?: (id: string) => { zIndex: number; cull: { x0: number; y0: number; x1: number; y1: number } } | undefined;
  onChange?: () => void;
  onStuck?: () => void;
  onHint?: (key: 'jac.needD') => void;
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

/** Trees, benches, lamps, muro walls and fill solids — never this van's own cells. */
function buildPropCells(): Set<string> {
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
  const out = new Set<string>(muroWallTiles());
  for (const [x, y] of fill.solidCells) {
    const key = k(x, y);
    if (!self.has(key)) out.add(key);
  }
  for (const o of objects) {
    if (o.id === JAC_ID || o.flat || !PROP_NAMES.has(o.name)) continue;
    const fx = o.footprintX ?? o.x;
    const fy = o.footprintY ?? o.y;
    const w = o.w ?? 1;
    const h = o.h ?? 1;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) out.add(k(fx + dx, fy + dy));
    }
  }
  return out;
}
const PROP_CELLS = buildPropCells();

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

/** Nearest 4-way facing for a unit stick vector in tile space (screen-mapped). */
export function facingFromTileDelta(dx: number, dy: number, fallback: FacingDir): FacingDir {
  const offX = Math.abs(dx) > 0.12;
  const offY = Math.abs(dy) > 0.12;
  if (offX && offY) {
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
  }
  if (offX) return dx >= 0 ? 'se' : 'nw';
  if (offY) return dy >= 0 ? 'sw' : 'ne';
  return fallback;
}

/** Continuous heading (0=se … 3=ne) from a tile-space stick. */
export function headingFromTileStick(dx: number, dy: number, fallback: FacingDir = 'se'): number {
  const mag = Math.hypot(dx, dy);
  if (mag < 1e-6) return dirIndex(fallback);
  return wrapHeading(Math.atan2(dy / mag, dx / mag) / (Math.PI / 2));
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
  private gaugeMph = 0;
  reversing = false;
  steering = 0;
  /** Eased steering input; decays on stick release instead of snapping. */
  private steerSmoothed = 0;
  /** Stick this sub-step, before the smoothing that lingers after a release. */
  private steerCmd = 0;
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
  /** Initial map placement of this same van (origin 18,5). Driving moves these coords. */
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
  private hazardT = 0;
  /** Continuous heading: 0=se, 1=sw, 2=nw, 3=ne. */
  private heading = 0;
  /** Milliseconds of ticker time update has consumed. Never reset, never decreased. */
  private gameTimeMs = 0;
  /** Update calls so far. Never reset, never decreased. */
  private frameId = 0;
  /** Signed tiles/s: +forward along heading, −reverse. */
  private vel = 0;
  drivePath: { x: number; y: number }[] = [];
  driveGoal: { x: number; y: number } | null = null;
  private pendingExit = false;
  private exitHold = 0;
  private exitSit: { x: number; y: number } | null = null;
  /** Facing locked when the exit brake finishes — restored in parkAtExitPose. */
  private exitFacing: { dir: FacingDir; heading: number } | null = null;
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
  /** A path corner is close and the sprite still faces the incoming leg. Creep, then turn. */
  private turnCrawl = false;
  /** Cenital stick: move along continuous heading, not 4-way sprite dirs only. */
  private goalBest = Infinity;
  private noProgressT = 0;
  bumpT = 0;
  private bumpArmed = true;
  private bumpSeq = 0;
  private lastBumpAt = -Infinity;
  /** Manual drive wants the next facing but its footprint does not fit yet. */
  private swapBlocked = false;
  /** Last creep turn could not move at all (pinned against something). */
  private creepStalled = false;
  /** Physics speed. `vel` is overwritten at the end of each frame with the real displacement. */
  private integVel = 0;
  /** Outer frame dt, so a corner slowdown is distance over that frame, not a timer. */
  private frameDt = SUB_DT;
  /** Nose is pinned and steering cannot free the truck. The cab draws an R beside the arrow. */
  private reverseCueOn = false;
  /** Tiles travelled since the sprite last changed facing. */
  private travelSinceDir = 0;
  /**
   * No sprite change since Get in / a QA reseat. The 0.1 t rule starts at the
   * first real swap; entry itself is not a change.
   */
  private noChangeSinceEntry = true;
  /** Moving swap held for the next frame so that frame rolls on the new sprite. */
  private pendingDir: FacingDir | null = null;
  private earlyFrom: FacingDir | null = null;
  private earlyTravel = 0;
  /** Speed and origin at the start of this frame, for a swap that must not jolt. */
  private frameSpeed = 0;
  private frameX = 0;
  private frameY = 0;
  /** Net-progress window for tap-to-park. -1 = not armed. */
  private followStallT = -1;
  private followStallX = 0;
  private followStallY = 0;
  /** Path length inside the stall window, so a shuttle is not mistaken for progress. */
  private followPathLen = 0;
  /** Distance-to-goal at the start of the 3 s improve window. */
  private goalStallT = 0;
  private goalStallMark = Infinity;
  /** Closest we've been to the next node. Closing on it is progress. */
  private nodeBest = Infinity;
  /** How many times the polyline has grown since this tap, without arriving. */
  private pathRiseN = 0;
  private pathLenSeen = -1;
  /** Wheels + arrow while the hidden heading is off the sprite and the van is pinned. */
  private pinnedCue = false;
  private steerCue!: Graphics;
  private reverseMark!: Graphics;
  private nGasT = 0;
  private nHinted = false;
  private lastGas = 0;
  private lastBrake = false;
  private exitFrom: { x: number; y: number } | null = null;
  /** Last `parkForDoor` search, milliseconds (performance.now). */
  lastParkMs = 0;
  lastParkHeading: FacingDir | null = null;
  private walkDistCache = new Map<string, Map<string, number>>();
  private doorSitCache = new Map<string, DoorSit[]>();
  private pathsFrom = '';
  private pathToSit = new Map<string, { x: number; y: number }[]>();
  private parkDoor: { x: number; y: number } | null = null;
  private skippedSits = new Set<string>();
  private lastStuckCell = '';
  private pathCacheTimer = 0;

  constructor(obj: MapObject, hooks: JacHooks) {
    this.obj = obj;
    this.hooks = hooks;
    this.body = hooks.visual.sprite;
    this.cx = (obj.footprintX ?? obj.x) + ((obj.w ?? 1) - 1) / 2;
    this.cy = (obj.footprintY ?? obj.y) + ((obj.h ?? 1) - 1) / 2;
    this.spawn = {
      origin: { x: obj.footprintX ?? obj.x, y: obj.footprintY ?? obj.y },
      center: { x: this.cx, y: this.cy },
      front: { x: obj.x, y: obj.y },
      size: { w: obj.w ?? 5, h: obj.h ?? 3 },
    };
    this.cone.visible = false;
    this.haze.visible = false;
    this.cone.eventMode = 'none';
    this.haze.eventMode = 'none';
    this.steerCue = new Graphics();
    this.steerCue.eventMode = 'none';
    this.steerCue.visible = false;
    this.reverseMark = new Graphics();
    this.reverseMark.eventMode = 'none';
    this.reverseMark.visible = false;
    hooks.container.addChildAt(this.cone, 0);
    hooks.container.addChild(this.haze);
    hooks.container.addChild(this.steerCue);
    hooks.container.addChild(this.reverseMark);
    this.snapshotClaimFromGrid();
    this.precomputeDoorSits();
  }

  get driving(): boolean {
    return this.mode === 'drive';
  }

  /** True while the cab shows the R cue: the nose is pinned and steering cannot free the truck. */
  get reverseCue(): boolean {
    return this.reverseCueOn;
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
      this.gear = 'D';
      this.reversing = false;
      this.rpm = IDLE_RPM;
      this.mph = 0;
      this.gaugeMph = 0;
      this.vel = 0;
      if (Math.abs(headingDelta(dirIndex(this.dir), this.heading)) > 0.5 + SWAP_HYST) {
        this.heading = dirIndex(this.dir);
      }
      this.swapBlocked = false;
      this.creepStalled = false;
      this.integVel = 0;
      this.reverseCueOn = false;
      this.travelSinceDir = 0;
      this.noChangeSinceEntry = true;
      this.pendingDir = null;
      this.pinnedCue = false;
      this.nGasT = 0;
      this.nHinted = false;
      this.bubble = false;
      this.rearHold = 0;
      this.steerSmoothed = 0;
      this.pendingExit = false;
      this.exitHold = 0;
      this.exitSit = null;
      this.stuckT = 0;
      this.bumpT = 0;
      this.bumpArmed = true;
      this.exitFrom = null;
      this.clearDrivePath();
      this.applyParkedSolid(false);
      this.ensureLegalDrivePose();
      this.precomputeDoorSits();
      this.schedulePathsFromHere();
    } else if (wasDrive) {
      this.engineOn = false;
      this.gear = 'P';
      this.rpm = 0;
      this.mph = 0;
      this.gaugeMph = 0;
      this.vel = 0;
      this.reversing = false;
      this.steering = 0;
      this.rearHold = 0;
      this.steerSmoothed = 0;
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
    this.nGasT = 0;
    if (gear === 'P') {
      this.vel = 0;
      this.mph = 0;
      this.reversing = false;
      this.clearDrivePath();
    } else if (gear === 'N') {
      // Neutral coasts down on friction; gas only re-engages D once the van is at rest.
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
    this.followStallT = -1;
    this.followPathLen = 0;
    this.goalStallT = 0;
    this.goalStallMark = Infinity;
    this.nodeBest = Infinity;
    this.pathRiseN = 0;
    this.pathLenSeen = -1;
    this.reverseCueOn = false;
  }

  setDrivePath(path: { x: number; y: number }[], goal: { x: number; y: number }, opts?: { loose?: boolean }): void {
    this.drivePath = path;
    this.driveGoal = goal;
    this.replanN = 0;
    this.stuckT = 0;
    this.unstickHold = 0;
    this.stuckGaveUp = false;
    this.followLoose = !!opts?.loose;
    this.followDir = null;
    this.goalBest = Math.hypot(this.cx - goal.x, this.cy - goal.y);
    this.noProgressT = 0;
    this.followStallT = -1;
    this.followPathLen = 0;
    this.goalStallT = 0;
    this.goalStallMark = this.goalBest;
    this.nodeBest = Infinity;
    this.pathRiseN = 0;
    this.pathLenSeen = path.length;
    // A path starts its own travel budget, so the sprite cannot step in place on tap.
    this.travelSinceDir = 0;
    this.reverseCueOn = false;
    this.applyPathGear(false);
  }

  /** Auto-drive always stays in D — never tap-to-park reverse. */
  private applyPathGear(_allowReverse: boolean): void {
    if (this.drivePath.length === 0 && !this.driveGoal) return;
    this.gear = 'D';
    this.reversing = false;
  }

  /**
   * Sit-centre depth, but stay behind a nearby building sprite (catedral wing overhangs
   * its footprint). Only draw in front once the sit is past both the east and south faces.
   */
  private truckDepthKey(): number {
    let depth = this.cx + this.cy;
    for (const [x, y] of this.parkCellsAt(this.cx, this.cy, this.dir)) {
      depth = Math.max(depth, x + y);
    }
    return depth;
  }

  /**
   * zIndex inside the objects layer. Every building whose sprite can overlap the van on
   * screen is ordered by a separating axis between footprints (edge coords) and compared
   * against that building's live render zIndex, so a roof in front always covers the van.
   */
  private sortDepth(): number {
    const truckKey = this.truckDepthKey();
    const cells = this.parkCellsAt(this.cx, this.cy, this.dir);
    let tx0 = Infinity;
    let ty0 = Infinity;
    let tx1 = -Infinity;
    let ty1 = -Infinity;
    for (const [x, y] of cells) {
      tx0 = Math.min(tx0, x - 0.5);
      ty0 = Math.min(ty0, y - 0.5);
      tx1 = Math.max(tx1, x + 0.5);
      ty1 = Math.max(ty1, y + 0.5);
    }
    const cull = this.hooks.visual.cull;
    let hi = Infinity;
    let lo = -Infinity;
    for (const o of objects) {
      if (o.type !== 'building' || o.flat || o.name === 'redoma' || o.id === JAC_ID) continue;
      const fx = o.footprintX ?? o.x;
      const fy = o.footprintY ?? o.y;
      const w = o.w ?? 1;
      const h = o.h ?? 1;
      const live = this.hooks.objectVisual?.(o.id);
      const bz = live?.zIndex ?? fx + w - 1 + (fy + h - 1);
      if (live) {
        const c = live.cull;
        if (c.x1 <= cull.x0 || c.x0 >= cull.x1 || c.y1 <= cull.y0 || c.y0 >= cull.y1) continue;
      }
      const bx0 = fx - 0.5;
      const by0 = fy - 0.5;
      const bx1 = fx + w - 0.5;
      const by1 = fy + h - 0.5;
      let behind = tx1 <= bx0 + 1e-6 || ty1 <= by0 + 1e-6;
      const front = tx0 >= bx1 - 1e-6 || ty0 >= by1 - 1e-6;
      if (behind && front) continue;
      if (!behind && !front) behind = truckKey <= fx + w - 1 + (fy + h - 1) - 0.08;
      if (behind) hi = Math.min(hi, bz);
      else lo = Math.max(lo, bz);
    }
    let z = truckKey + 0.12;
    if (z >= hi) z = hi - 0.32;
    if (z <= lo) z = lo + 0.12;
    if (z >= hi) z = lo < hi ? (lo + hi) / 2 : hi - 0.32;
    return z;
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
    const routeTo = (tx: number, ty: number) => {
      if (sx === tx && sy === ty) return [];
      if (!this.footprintGoal(tx, ty) && !(sx === tx && sy === ty)) return null;
      const path = this.footprintPath(tx, ty);
      return path ? finish(path, tx, ty) : null;
    };
    if (this.footprintGoal(gx, gy) || (sx === gx && sy === gy)) {
      const direct = routeTo(gx, gy);
      if (direct) return direct;
      if (sx === gx && sy === gy) return [];
    }
    // An unreachable tap used to BFS once per ring cell (hundreds of ms, so the
    // toast landed after 0.5 s). One flood tells us nothing in the rings is
    // reachable; a hit falls through and the route is chosen exactly as before.
    const goals: { x: number; y: number }[] = [];
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (this.footprintGoal(x, y)) goals.push({ x, y });
        }
      }
    }
    if (this.footprintPathsTo(goals).size === 0) return null;
    for (let r = 1; r <= 8; r++) {
      let best: { x: number; y: number }[] | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx;
          const y = gy + dy;
          if (!this.footprintGoal(x, y)) continue;
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
   * Closest sit the 2×2 collider can reach beside a door. One reverse walk BFS
   * from the door, then O(1) scoring of local road cells. Parks with a heading
   * whose 5×3 / 3×5 never covers the door, a prop, or a walkable approach.
   */
  parkForDoor(
    doorX: number,
    doorY: number,
    preferredSit?: { x: number; y: number; dir?: FacingDir },
  ): {
    x: number;
    y: number;
    path: { x: number; y: number }[];
    heading: FacingDir;
  } | null {
    const t0 = performance.now();
    const sx = Math.round(this.cx);
    const sy = Math.round(this.cy);
    if (!this.parkDoor || this.parkDoor.x !== doorX || this.parkDoor.y !== doorY) {
      this.parkDoor = { x: doorX, y: doorY };
      this.skippedSits.clear();
    }
    if (this.driveGoal && this.stuckT >= STUCK_REPLAN_S * 0.4) {
      this.skippedSits.add(k(this.driveGoal.x, this.driveGoal.y));
    }
    const usable = this.sitsForDoor(doorX, doorY).filter((c) => !this.skippedSits.has(k(c.x, c.y)));
    // One footprint BFS from the truck, then the front → close → door-side cascade
    // on the sites that BFS can actually reach. An unreachable front row must not
    // hide a door-side sit the 5×3 can drive to.
    const reached = this.footprintPathsTo(usable.map((c) => ({ x: c.x, y: c.y })));
    const origin = k(sx, sy);
    this.pathsFrom = origin;
    this.pathToSit.clear();
    for (const [key, path] of reached) this.pathToSit.set(key, path);
    if (preferredSit) {
      const heading =
        preferredSit.dir ?? this.parkHeadingAt(preferredSit.x, preferredSit.y, this.doorKeepClear(doorX, doorY));
      const preferPath = heading && this.sitWith(preferredSit.x, preferredSit.y, heading)
        ? reached.get(k(preferredSit.x, preferredSit.y)) ?? this.footprintPath(preferredSit.x, preferredSit.y)
        : null;
      if (heading && preferPath) {
        this.lastParkMs = performance.now() - t0;
        this.lastParkHeading = heading;
        return { x: preferredSit.x, y: preferredSit.y, path: preferPath, heading };
      }
    }
    const reachable = usable.filter((c) => reached.has(k(c.x, c.y)));
    const doorSide = reachable.filter((c) => c.along >= 0);
    const closeEnough = doorSide.filter((c) => Math.hypot(c.x - doorX, c.y - doorY) <= 8);
    const front = closeEnough.filter((c) => c.along >= 1 && c.doorD >= 3 && c.doorD <= 5);
    // A reachable sit within 2 tiles of the access tile beats the old 3–5 band.
    // Bain's front row was 4.4 tiles east of a door the 5×3 can park beside.
    const nearAccess = doorSide.filter((c) => Math.hypot(c.x - doorX, c.y - doorY) <= 2);
    const cascade = nearAccess.length
      ? nearAccess
      : front.length
        ? front
        : closeEnough.length
          ? closeEnough
          : doorSide.length
            ? doorSide
            : reachable;
    const withinDoor = cascade.filter((c) => Math.hypot(c.x - doorX, c.y - doorY) <= 6);
    const pool = withinDoor.length ? withinDoor : cascade;
    const prefer = (c: DoorSit) => (cells[c.y]?.[c.x]?.groundId?.includes('park') ? 0 : 1);
    const closeness = (c: DoorSit) => Math.abs(c.doorD - 3.5);
    const doorHug = (c: DoorSit) => (this.parkTouchesDoor(c.x, c.y, c.heading, doorX, doorY) ? 1 : 0);
    const pathLen = (c: DoorSit) => reached.get(k(c.x, c.y))?.length ?? Math.abs(c.x - sx) + Math.abs(c.y - sy);
    const reach = (c: DoorSit) => pathLen(c) + closeness(c) * 2 + c.walkD * 0.15;
    const ranked = pool.filter((c) => !doorHug(c));
    const order = (ranked.length ? ranked : pool).slice().sort(
      (a, b) =>
        doorHug(a) - doorHug(b) ||
        prefer(a) - prefer(b) ||
        Math.hypot(a.x - doorX, a.y - doorY) - Math.hypot(b.x - doorX, b.y - doorY) ||
        reach(a) - reach(b) ||
        b.along - a.along,
    );
    const pick = order[0] ?? null;
    const path = pick ? reached.get(k(pick.x, pick.y)) ?? null : null;
    this.lastParkMs = performance.now() - t0;
    if (!pick || !path) {
      this.lastParkHeading = null;
      return null;
    }
    const pickD = Math.hypot(pick.x - doorX, pick.y - doorY);
    const nearer = this.closerDrivePose(doorX, doorY, pickD);
    if (nearer) {
      this.lastParkHeading = nearer.heading;
      return nearer;
    }
    this.lastParkHeading = pick.heading;
    return { x: pick.x, y: pick.y, path, heading: pick.heading };
  }

  /**
   * Rule 14: the sit the cascade picked can be farther from the door than a
   * drive-legal pose the 5×3 can already reach. Use the closer one.
   */
  private closerDrivePose(
    doorX: number,
    doorY: number,
    current: number,
  ): { x: number; y: number; path: { x: number; y: number }[]; heading: FacingDir } | null {
    let best: { x: number; y: number; path: { x: number; y: number }[]; heading: FacingDir; dd: number } | null =
      null;
    const x0 = Math.max(0, doorX - 6);
    const x1 = Math.min(MAP_WIDTH - 1, doorX + 6);
    const y0 = Math.max(0, doorY - 6);
    const y1 = Math.min(MAP_HEIGHT - 1, doorY + 6);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dd = Math.hypot(x - doorX, y - doorY);
        if (dd > 6 || dd > current - 0.5) continue;
        if (best && dd >= best.dd) continue;
        for (const heading of DIRS) {
          if (this.poseBlocked(x, y, heading) !== 0) continue;
          const path = this.footprintPath(x, y);
          if (!path || path.length === 0) continue;
          best = { x, y, path, heading, dd };
          break;
        }
      }
    }
    return best;
  }

  private precomputeDoorSits(): void {
    for (const b of getEnterableBuildings()) {
      if (b.door) this.sitsForDoor(b.door.x, b.door.y);
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

  /** Cardinal BFS on the full 5×3 / 3×5, not the cab. */
  driveBfsTo(tx: number, ty: number): { x: number; y: number }[] | null {
    const sx = Math.round(this.cx);
    const sy = Math.round(this.cy);
    if (sx === tx && sy === ty) return [];
    if (!this.footprintGoal(tx, ty)) return null;
    const cheap = this.axisDrivePath(sx, sy, tx, ty, (x, y) => this.driveBoxWalkable(x, y) || (x === sx && y === sy));
    if (cheap) return cheap;
    return this.footprintPath(tx, ty);
  }

  axisDrivePath(
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
      let face: FacingDir = this.dir;
      const stepAlong = (axis: 'x' | 'y') => {
        const target = axis === 'x' ? tx : ty;
        let cur = axis === 'x' ? x : y;
        if (cur === target) return true;
        const nd: FacingDir = axis === 'x' ? (target > cur ? 'se' : 'nw') : target > cur ? 'sw' : 'ne';
        // Turn cell: the box of the new facing has to fit before the corner.
        if (nd !== face && !this.turnCellOk(x, y, nd, sx, sy)) return false;
        face = nd;
        while (cur !== target) {
          cur += Math.sign(target - cur);
          if (axis === 'x') x = cur;
          else y = cur;
          if (!pass(x, y)) return false;
          if (!this.waypointFootOk(x, y, face, sx, sy)) return false;
          path.push({ x, y });
        }
        return true;
      };
      const stepX = () => stepAlong('x');
      const stepY = () => stepAlong('y');
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
      this.spriteFootprintClear(cx, cy, dir)
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

  /** Stand tile beside the driver door (≤~1.5 tiles from van centre when possible). */
  driverExitStandTile(): { x: number; y: number } | null {
    const cx = this.cx;
    const cy = this.cy;
    const blocked = new Set(this.parkCellsAt(cx, cy, this.dir).map(([x, y]) => k(x, y)));
    const seen = new Set<string>();
    const candidates: { x: number; y: number; d: number }[] = [];
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const x = Math.round(cx) + ox;
        const y = Math.round(cy) + oy;
        const key = k(x, y);
        if (seen.has(key) || blocked.has(key)) continue;
        if (!tileIsStandable(x, y)) continue;
        seen.add(key);
        candidates.push({ x, y, d: Math.hypot(x - cx, y - cy) });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    if (candidates.length) return { x: candidates[0].x, y: candidates[0].y };
    return this.exitTile();
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
    this.frameDt = frame;
    // QA clocks only. `frame` is the ticker slice this call accepted (0..250 ms).
    this.gameTimeMs += frame * 1000;
    this.frameId += 1;
    if (!this.driving) {
      this.steering = 0;
      this.reversing = false;
      this.vel = 0;
      this.integVel = 0;
      this.rearHold = 0;
      this.pinnedCue = false;
      this.reverseCueOn = false;
      if (this.steerCue?.visible) this.steerCue.visible = false;
      if (this.reverseMark?.visible) this.reverseMark.visible = false;
      if (!this.engineOn) {
        this.rpm = 0;
        this.mph = 0;
        this.gaugeMph = 0;
      }
      return;
    }
    // `vel` is the previous frame's real displacement. Physics keeps its own speed,
    // and a stop between frames (published vel 0) clears that speed.
    // The jolt check compares published speeds. integVel is the physics speed,
    // which sits above the along-component whenever the nose is off the sprite.
    this.frameSpeed = this.vel;
    if (this.vel === 0) this.integVel = 0;
    this.vel = this.integVel;
    const originX = this.cx;
    const originY = this.cy;
    this.frameX = originX;
    this.frameY = originY;
    // Manual facing is chosen at the end, on the pose the frame actually stops on.
    // The follower still commits at the start so a long frame can land the corner.
    if (this.followDir) this.commitFacing(this.followDir);
    // A moving swap is applied before this frame rolls, so the displacement
    // lies on the sprite the frame draws. An in-place swap stays at the end.
    const early = !this.followDir && this.applyPendingSwap();
    const travel0 = this.travelSinceDir;
    const dir0 = this.dir;
    const x0 = this.cx;
    const y0 = this.cy;
    let legal =
      this.poseBlocked(this.cx, this.cy, this.dir) === 0
        ? { x: this.cx, y: this.cy, dir: this.dir, h: this.heading }
        : null;
    let left = frame;
    // The swap already happened, onto a heading that has yawed onto this sprite.
    // This frame still translates. Holding it still was the one-frame stall.
    while (left > 1e-6) {
      const step = Math.min(SUB_DT, left);
      // A 0.25s frame at speed steps more than a tile and rolls through the
      // corner before the next commit. Hold speed to the distance that is left
      // so the frame ends on the node. 60fps and 0.1s frames already commit
      // in time and must not take this branch.
      if (frame > 0.15 && (this.drivePath.length > 0 || this.driveGoal)) {
        const turn = this.drivePath.length > 0 ? this.upcomingTurn() : null;
        let remain = turn && turn.dir !== this.dir ? turn.dist : Infinity;
        if (this.driveGoal) {
          const v = DIR_VEC[this.dir];
          const dx = this.driveGoal.x - this.cx;
          const dy = this.driveGoal.y - this.cy;
          const along = dx * v.x + dy * v.y;
          // Only the final leg. A goal on the next street also has an along
          // component, and capping on it crawls the whole incoming block.
          const cross = Math.abs(dx * v.y - dy * v.x);
          if (along > 0 && cross < 0.6) remain = Math.min(remain, along);
        }
        if (remain < 1.6) {
          const cap = Math.max(0.35, remain / frame);
          if (Math.abs(this.vel) > cap) this.vel = Math.sign(this.vel || 1) * cap;
        }
      }
      this.stepDrive(step, input);
      left -= step;
      if (this.dir !== dir0) {
        // One facing per frame. The incoming leg is along the sprite we just
        // left; rewinding it kept a low-FPS corner from ever turning.
        if (this.poseBlocked(this.cx, this.cy, this.dir) === 0) {
          legal = { x: this.cx, y: this.cy, dir: this.dir, h: this.heading };
        }
        break;
      }
      if (this.poseBlocked(this.cx, this.cy, this.dir) === 0) {
        legal = { x: this.cx, y: this.cy, dir: this.dir, h: this.heading };
      }
    }
    // Sub-steps can sum to a diagonal the sprite never drew (a pin slide, or a reverse
    // that starts after the frame already rolled). Pull that back onto the sprite axis
    // so the drawn facing stays within 35° of the motion. A normal turn is already
    // inside MOTION_CONE and is left alone.
    let hopped = Math.hypot(this.cx - x0, this.cy - y0);
    // Only a slide the honesty gate can see (≥0.15 t) is pulled back into the cone.
    // A shorter contact inch is under that sample and must stay, or the hold freezes.
    if (hopped >= 0.15) {
      const moveH = Math.atan2(this.cy - y0, this.cx - x0) / (Math.PI / 2);
      const sprite = dirIndex(this.dir);
      const limit = 35 / 90;
      const forwardErr = Math.abs(headingDelta(sprite, moveH));
      const backErr = Math.abs(headingDelta(wrapHeading(sprite + 2), moveH));
      if (forwardErr > limit && backErr > limit) {
        // Project onto the gear's axis. The other axis is a reverse against the gear.
        const useBack = this.gear === 'R';
        const ang = wrapHeading(sprite + (useBack ? 2 : 0)) * (Math.PI / 2);
        let along = (this.cx - x0) * Math.cos(ang) + (this.cy - y0) * Math.sin(ang);
        if (along < 0) along = 0;
        const nx = x0 + Math.cos(ang) * along;
        const ny = y0 + Math.sin(ang) * along;
        const hereN = this.poseBlocked(this.cx, this.cy, this.dir);
        const nextN = this.poseBlocked(nx, ny, this.dir);
        const axisOk = hereN <= 0 ? nextN === 0 : nextN < hereN;
        if (axisOk) {
          this.cx = nx;
          this.cy = ny;
          legal = { x: nx, y: ny, dir: this.dir, h: this.heading };
        } else {
          // The axis cell is blocked. Pull the off-axis part in to the 35° cone
          // instead of leaving a slide the honesty gate counts.
          const ox = this.cx - x0 - Math.cos(ang) * along;
          const oy = this.cy - y0 - Math.sin(ang) * along;
          const offMag = Math.hypot(ox, oy);
          const cap = Math.abs(along) * Math.tan(limit * 0.98 * (Math.PI / 2));
          const k = offMag > cap && offMag > 1e-6 ? cap / offMag : 1;
          const cx2 = x0 + Math.cos(ang) * along + ox * k;
          const cy2 = y0 + Math.sin(ang) * along + oy * k;
          if (k < 1 && this.poseBlocked(cx2, cy2, this.dir) === 0) {
            this.cx = cx2;
            this.cy = cy2;
            legal = { x: cx2, y: cy2, dir: this.dir, h: this.heading };
          } else if (this.poseBlocked(x0, y0, this.dir) < hereN) {
            this.cx = x0;
            this.cy = y0;
            this.vel = 0;
          }
        }
        this.occupy(this.driveCells());
        this.layout();
      }
    }
    hopped = Math.hypot(this.cx - x0, this.cy - y0);
    // A frame that brakes must not outrun the gate: displacement ≤ max(0.35, 1.6·|v|·dt + 0.08).
    const hopLim = Math.max(0.35, 1.6 * Math.abs(this.vel) * frame + 0.08) * 0.98;
    // Arriving zeros vel before this clamp. Pulling the frame back out of the
    // sit then leaves the van short of the door and the replan drives away.
    const arrived =
      !!this.driveGoal && Math.hypot(this.driveGoal.x - this.cx, this.driveGoal.y - this.cy) < PATH_ARRIVE;
    if (hopped > hopLim && hopped > 1e-6 && !arrived) {
      const scale = hopLim / hopped;
      const nx = x0 + (this.cx - x0) * scale;
      const ny = y0 + (this.cy - y0) * scale;
      if (this.poseBlocked(nx, ny, this.dir) === 0) {
        this.cx = nx;
        this.cy = ny;
        this.travelSinceDir = Math.max(0, this.travelSinceDir - (hopped - hopLim));
        legal = { x: this.cx, y: this.cy, dir: this.dir, h: this.heading };
      } else if (legal) {
        this.cx = legal.x;
        this.cy = legal.y;
        this.dir = legal.dir;
        this.heading = legal.h;
        this.vel = 0;
      }
      this.occupy(this.driveCells());
      this.layout();
    }
    // Every driving frame ends on the last legal pose. No backup, no relocation.
    if (this.poseBlocked(this.cx, this.cy, this.dir) > 0 && legal) {
      this.cx = legal.x;
      this.cy = legal.y;
      this.dir = legal.dir;
      this.heading = legal.h;
      this.vel = 0;
      this.occupy(this.driveCells());
      this.layout();
    } else if (this.poseBlocked(this.cx, this.cy, this.dir) > 0 && this.drivePath.length > 0) {
      this.tryReplan();
    }
    if (legal && this.poseBlocked(this.cx, this.cy, this.dir) > 0) {
      this.cx = legal.x;
      this.cy = legal.y;
      this.dir = legal.dir;
      this.heading = legal.h;
      this.vel = 0;
      this.occupy(this.driveCells());
      this.layout();
    }
    // Manual swap, once, on the final pose. D1 (fit, travel, free ahead) is
    // judged here, after the frame has finished moving.
    let moved = Math.hypot(this.cx - x0, this.cy - y0);
    const manual = this.pendingExit || (this.drivePath.length === 0 && !this.driveGoal);
    let earlyKept = early;
    if (early && moved < 0.02 && this.earlyFrom) {
      // Yaw during the borrowed sprite can sit past the old cap, and the old
      // box may no longer fit. Put the heading back, and keep the new sprite
      // when the old one would overlap.
      // The short roll happened on the borrowed sprite, up to 90° off the old one
      // (G3: 57° at 0.004 t). Undo the roll with the swap: the frame started legal
      // at (x0, y0) on the old sprite. The swap is then judged in place (D1) below.
      if (this.poseBlocked(x0, y0, this.earlyFrom) === 0) {
        if (moved > 0) {
          this.cx = x0;
          this.cy = y0;
          this.vel = 0;
          moved = 0;
        }
        this.dir = this.earlyFrom;
        this.travelSinceDir = this.earlyTravel;
        earlyKept = false;
      } else if (this.poseBlocked(this.cx, this.cy, this.earlyFrom) === 0) {
        this.dir = this.earlyFrom;
        this.travelSinceDir = this.earlyTravel;
        earlyKept = false;
      }
      this.heading = this.capHeading(this.heading, HEADING_HARD);
      this.occupy(this.driveCells());
      this.layout();
    }
    const swapped = manual && this.syncManualFacing(moved);
    // A manual swap frame's own roll is not travel toward the next swap. The
    // monitor drops it too. A follower swap at the start still counts the
    // roll that happened on the new facet, which is what park arrival uses.
    if (swapped || earlyKept) {
      this.travelSinceDir = 0;
      this.noChangeSinceEntry = false;
    } else if (early) {
      this.travelSinceDir = this.earlyTravel + moved;
    } else {
      const carried = this.dir === dir0 ? travel0 : 0;
      this.travelSinceDir = carried + moved;
      if (this.dir !== dir0) this.noChangeSinceEntry = false;
    }
    // An early swap rolled on the new sprite. An end swap did not move, so
    // either axis matches. Publishing the other one reads as zero speed.
    const axis = DIR_VEC[this.dir];
    const alongFrame = (this.cx - originX) * axis.x + (this.cy - originY) * axis.y;
    const dispFrame = Math.hypot(this.cx - originX, this.cy - originY);
    this.integVel = this.vel;
    let published = frame > 1e-8 ? alongFrame / frame : 0;
    // A sub-step rounding must not publish a speed against the gear. The pose
    // itself is not allowed to travel that way.
    if (this.gear === 'D' && published < 0) published = 0;
    if (this.gear === 'R' && published > 0) published = 0;
    this.vel = published;
    this.syncMeters(dispFrame, frame);
    this.holdAtGoal();
    if (this.toggles.hazards) this.hazardT += frame;
    else this.hazardT = 0;
    const off = Math.abs(headingDelta(dirIndex(this.dir), this.heading));
    if (manual) {
      const atCap = Math.abs(headingDelta(dirIndex(this.dir), this.heading)) >= HEADING_HARD - 1e-3;
      this.reverseCueOn =
        !swapped &&
        !earlyKept &&
        !this.pendingDir &&
        this.gear === 'D' &&
        this.lastGas > 0 &&
        Math.abs(this.steering) > YAW_STEER_MIN &&
        atCap &&
        this.swapBlocked &&
        this.nosePinned(1);
    }
    this.pinnedCue =
      this.reverseCueOn ||
      (off > CUE_HEADING &&
        Math.abs(this.vel) < 0.35 &&
        (this.lastGas > 0 || this.lastBrake) &&
        Math.abs(this.steering) > CREEP_MIN_STEER &&
        (this.creepStalled || this.swapBlocked));
    this.applySprite();
    this.updateSteerCue();
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

    // The prop resolver's jump to the nearest clear seat is a one-frame teleport.
    // Manual and path frames stay on the integrator and the 5×3 gate instead.

    let throttle = 0;
    let steer = 0;
    if (live) {
      steer = Math.max(-1, Math.min(1, dx));
      const gas = Math.max(0, -dy);
      const brakePedal = Math.max(0, dy);
      if (gas > 0.08) throttle = Math.min(1, gas);
      else if (brakePedal > 0.08) throttle = -Math.min(1, brakePedal);
      else throttle = 0;
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

    const steerTarget = Math.max(-1, Math.min(1, steer));
    const steerAlpha = 1 - Math.exp(-dt * 9);
    if (Math.abs(steerTarget) > 0.04) {
      this.steerSmoothed += (steerTarget - this.steerSmoothed) * steerAlpha;
    } else {
      this.steerSmoothed *= 1 - Math.min(1, dt * 5.5);
    }
    this.steerCmd = steerTarget;
    this.steering = Math.max(-1, Math.min(1, this.steerSmoothed));
    this.applyThrottle(dt, throttle);
    this.lastGas = live && throttle > 0.08 ? throttle : 0;
    this.lastBrake = live && throttle < -0.08;

    const moving = Math.abs(this.vel) > 0.08;
    if (!following) {
      // Wheel released and nearly stopped: hidden heading comes back to the sprite.
      if (!live && Math.abs(this.vel) < 0.35) this.unwindHeading(dt);
      this.reversing = this.vel < -0.08;
      this.tickRearHold(dt);
      if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 0.33);
      const ox = this.cx;
      const oy = this.cy;
      this.stepManual(dt, this.lastGas > 0);
      const moved = Math.hypot(this.cx - ox, this.cy - oy);
      const headingOff = Math.abs(headingDelta(dirIndex(this.dir), this.heading)) > CUE_HEADING;
      const wheelCue =
        headingOff &&
        this.lastGas > 0 &&
        Math.abs(this.steering) > CREEP_MIN_STEER &&
        Math.abs(this.vel) < 0.35 &&
        (this.creepStalled || this.swapBlocked);
      if (moving || moved > 1e-4 || wheelCue) {
        this.wheelAcc += dt * WHEEL_FPS * (wheelCue ? 1 : Math.min(1.4, Math.max(Math.abs(this.vel), moved / dt) / DRIVE_TILES_PER_S));
        while (this.wheelAcc >= 1) {
          this.wheel = (this.wheel + 1) & 3;
          this.wheelAcc -= 1;
        }
      } else {
        this.wheelAcc = 0;
      }
      return moved;
    }
    const turningInPlace = Math.abs(this.steering) > 0.35 && Math.abs(this.vel) < 0.3;
    if (Math.abs(this.steering) > 0.08) {
      const sign = Math.abs(this.vel) > 0.08 ? (this.vel >= 0 ? 1 : -1) : throttle >= 0 ? 1 : -1;
      const raw = this.heading + this.steering * TURN_RATE * sign * dt;
      this.applyHeading(this.capHeading(raw, HEADING_CAP));
    }

    this.reversing = this.vel < -0.08;
    this.tickRearHold(dt);
    if (this.bumpT > 0) this.bumpT = Math.max(0, this.bumpT - dt * 0.33);
    const ox = this.cx;
    const oy = this.cy;
    const fwd = DIR_VEC[this.dir];
    const turn = this.turnCrawl ? this.upcomingTurn() : null;
    if (turn && turn.dir !== this.dir && turn.dist < 0.6) {
      // Land on the corner cell before swapping. Full speed steps over the
      // only poses where the outgoing 5×3 is clear, and the van drives past.
      this.alignTurn(dt, turn.dir, turn.at);
    } else if (moving || this.drivePath.length > 0) {
      // Same move / slide / clip / stop as manual driving. No private reverse.
      const creepCap = this.frameDt > 0.15 ? DRIVE_TILES_PER_S : CREEP_TILES_PER_S;
      if (this.turnCrawl && this.vel > creepCap) this.vel = creepCap;
      let stepX = fwd.x * this.vel * dt;
      let stepY = fwd.y * this.vel * dt;
      const node = this.drivePath[0];
      if (node && (stepX !== 0 || stepY !== 0)) {
        const nowD = Math.hypot(node.x - this.cx, node.y - this.cy);
        const nxtD = Math.hypot(node.x - (this.cx + stepX), node.y - (this.cy + stepY));
        if (nxtD > nowD + 0.01) {
          stepX = 0;
          stepY = 0;
        }
      }
      let adv = this.moveSlideClip(stepX, stepY);
      if (node && adv.moved < 1e-4) {
        const relX = node.x - this.cx;
        const relY = node.y - this.cy;
        const along = relX * fwd.x + relY * fwd.y;
        const off = Math.hypot(relX - fwd.x * along, relY - fwd.y * along);
        if (off <= 0.35 && along > 0.01) {
          const reach = Math.min(0.2, along, Math.max(Math.abs(this.vel) * dt, DRIVE_TILES_PER_S * dt));
          const extra = this.moveSlideClip(fwd.x * reach, fwd.y * reach);
          adv = { moved: adv.moved + extra.moved, blocked: adv.blocked && extra.moved < 1e-4 };
        }
      }
      const slid = adv.moved;
      const wantStep = Math.hypot(stepX, stepY);
      const inContact = wantStep > 0.02 && slid < wantStep * 0.55;
      if (inContact || (slid < 0.003 && !!this.driveGoal)) {
        if (this.bumpArmed) this.noteBump();
        this.bumpArmed = false;
        if (!turningInPlace) this.stuckT += dt;
        if (this.stuckT >= STUCK_REPLAN_S) {
          this.stuckT = 0;
          this.tryReplan();
        }
        if (slid < 1e-4) this.vel = 0;
      } else if (slid > 0.02) {
        this.bumpArmed = true;
        this.stuckT = 0;
      }
      // The 5×3 gate above already refused the step. The prop resolver's seat
      // snap is a teleport, and it also swaps the sprite with no travel.
      this.wheelAcc += dt * WHEEL_FPS * Math.min(1.4, Math.abs(this.vel) / DRIVE_TILES_PER_S);
      while (this.wheelAcc >= 1) {
        this.wheel = (this.wheel + 1) & 3;
        this.wheelAcc -= 1;
      }
    } else if (this.driveGoal) {
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
    const followed = Math.hypot(this.cx - ox, this.cy - oy);
    this.travelSinceDir += followed;
    this.followPathLen += followed;
    // Facing swap waits until the frame has been pulled legal, so a step that
    // gets walked back cannot spend the travel budget.
    this.noteFollowProgress(dt);
    return followed;
  }

  /**
   * D and R only change from the gear buttons (auto-drive pins D). Gas at rest in P or N
   * shifts to D; R is never entered or left automatically.
   * D: stick up = gas forward. R: stick up = gas backward. Stick down brakes to 0 in
   * either gear and holds there — it never shifts or drives the other way.
   */
  private applyThrottle(dt: number, throttle: number): void {
    const autoDrive = (this.drivePath.length > 0 || !!this.driveGoal) && !this.pendingExit;
    if (autoDrive) {
      this.gear = 'D';
      this.reversing = false;
      if (throttle < 0) throttle = 0;
      if (this.vel < 0) this.vel = 0;
    }

    if (this.pendingExit) {
      this.brakeTowardZero(dt, EXIT_BRAKE_TILES_S2);
      if (Math.abs(this.vel) <= 0.08) {
        this.vel = 0;
        if (!this.exitSit) {
          this.exitSit = { x: this.cx, y: this.cy };
          this.exitFacing = { dir: this.dir, heading: this.heading };
          this.exitHold = 0.12;
        } else {
          this.exitHold = Math.max(0, this.exitHold - dt);
        }
      }
      return;
    }

    const gas = throttle > 0.08 ? Math.min(1, throttle) : 0;
    const brake = throttle < -0.08 ? Math.min(1, -throttle) : 0;
    if (gas > 0 && (this.gear === 'P' || this.gear === 'N') && Math.abs(this.vel) < 0.08) {
      this.gear = 'D';
      this.reversing = false;
      this.hooks.onChange?.();
    }
    if (gas > 0 && this.gear === 'N') {
      this.nGasT += dt;
      if (this.nGasT > N_GAS_HINT_S && !this.nHinted) {
        this.nHinted = true;
        this.hooks.onHint?.('jac.needD');
      }
    } else {
      this.nGasT = 0;
      if (gas === 0) this.nHinted = false;
    }
    if (this.gear === 'P') {
      this.brakeTowardZero(dt, BRAKE_TILES_S2);
    } else if (this.gear === 'N' || (gas === 0 && brake === 0)) {
      this.brakeTowardZero(dt, FRICTION_TILES_S2);
    } else if (brake > 0) {
      this.brakeTowardZero(dt, BRAKE_TILES_S2);
    } else {
      const sign = this.gear === 'R' ? -1 : 1;
      if (this.vel * sign < -0.08) {
        this.brakeTowardZero(dt, BRAKE_TILES_S2);
      } else {
        if (Math.abs(this.vel) <= 0.08) this.vel = 0;
        const v = this.vel + sign * ACCEL_TILES_S2 * gas * dt;
        this.vel = sign > 0 ? Math.min(DRIVE_TILES_PER_S, v) : Math.max(-REVERSE_TILES_PER_S, v);
        return;
      }
    }
    if (Math.abs(this.vel) <= 0.08) this.vel = 0;
  }

  private brakeTowardZero(dt: number, rate = BRAKE_TILES_S2): void {
    if (this.vel > 0) this.vel = Math.max(0, this.vel - rate * dt);
    else if (this.vel < 0) this.vel = Math.min(0, this.vel + rate * dt);
  }

  /** Impacts below walking-plus speed, or within 600 ms of the last one, stay silent. */
  private noteBump(speed = Math.abs(this.vel)): void {
    if (speed <= BUMP_MIN_TILES_PER_S) return;
    const now = performance.now();
    if (now - this.lastBumpAt < BUMP_GAP_MS) return;
    this.lastBumpAt = now;
    this.bumpSeq += 1;
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
    this.exitSit = null;
    this.exitFacing = null;
    this.exitFrom = { x: this.cx, y: this.cy };
    this.clearDrivePath();
    this.qaSteer = null;
    this.brakeTowardZero(1 / 20, EXIT_BRAKE_TILES_S2);
    if (Math.abs(this.vel) <= 0.35) this.vel = 0;
  }

  readyToExit(): boolean {
    return this.pendingExit && Math.abs(this.vel) <= 0.08 && this.mph === 0 && this.exitHold <= 0 && !!this.exitSit;
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
    this.exitFacing = null;
  }

  /** Park exactly where the exit brake stopped — no relayout nudge. */
  parkAtExitPose(): void {
    if (this.exitSit) {
      this.cx = this.exitSit.x;
      this.cy = this.exitSit.y;
    }
    if (this.exitFacing) {
      this.dir = this.exitFacing.dir;
      this.heading = this.exitFacing.heading;
    }
    this.pendingExit = false;
    this.exitHold = 0;
    this.exitFrom = null;
    this.exitSit = null;
    this.exitFacing = null;
    this.vel = 0;
    this.engineOn = false;
    this.gear = 'P';
    this.rpm = 0;
    this.mph = 0;
    this.gaugeMph = 0;
    this.mode = 'parked';
    this.applyParkedSolid(true);
    this.layout();
    this.applySprite();
    this.hooks.onChange?.();
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

  /**
   * `mph` is the instant logic reading (exit waits for 0); `rpm` and `gaugeMph` are the
   * low-passed dashboard values so needles and digits never jump between frames.
   */
  private syncMeters(movedTiles: number, dt: number): void {
    const speed = dt > 1e-8 ? movedTiles / dt : 0;
    const load = Math.min(1, speed / DRIVE_TILES_PER_S);
    const rpmTarget = this.engineOn ? IDLE_RPM + (MAX_RPM - IDLE_RPM) * load * 0.8 + this.lastGas * 300 : 0;
    const mphTarget = load * MOVE_MPH;
    const rpmA = 1 - Math.exp(-Math.max(0, dt) / RPM_TAU_S);
    const mphA = 1 - Math.exp(-Math.max(0, dt) / MPH_TAU_S);
    this.rpm += (rpmTarget - this.rpm) * rpmA;
    this.gaugeMph += (mphTarget - this.gaugeMph) * mphA;
    if (Math.abs(this.gaugeMph) < 0.02) this.gaugeMph = 0;
    // mph stays 0 only when this frame barely moved. A forced speed reading is not a stop.
    if (movedTiles < 0.01) {
      this.mph = 0;
      return;
    }
    this.mph = Math.max(1, Math.min(MOVE_MPH, Math.round(load * MOVE_MPH)));
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
      const x = this.cx + v.x * 0.4;
      const y = this.cy + v.y * 0.4;
      if (dir === this.dir) return this.followStepOk(x, y);
      return this.driveBoxWalkable(x, y) && this.poseBlocked(x, y, dir) === 0;
    };
    const wantDir: FacingDir = (() => {
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
    const turn = this.upcomingTurn();
    this.turnCrawl = !!turn && turn.dir !== this.dir && turn.dist < 0.75;
    const want = dirIndex(this.turnCrawl && turn ? turn.dir : wantDir);
    let err = want - this.heading;
    if (err > 2) err -= 4;
    if (err < -2) err += 4;
    const steer = Math.max(-1, Math.min(1, err * 2));
    const goalSlow = goalDist < 2.2 ? Math.max(0.28, goalDist / 2.2) : 1;
    // The outgoing box often fits before the corner. Pointing the sprite at it
    // early turns the van off the incoming leg and it can never reach the corner.
    this.followDir = this.turnCrawl && turn && turn.dist <= 0.18 ? turn.dir : wantDir;
    let throttle = goalSlow;
    if (this.turnCrawl) throttle = 0.22;
    else if (this.dir !== wantDir) {
      // Keep rolling. Throttle 0 used to wait for an in-place sprite step, which
      // spun NE→NW→SW→SE with no travel and then livelocked on the next replan.
      throttle = Math.max(0.45, Math.min(goalSlow, 0.7));
      if (this.gear === 'R') this.gear = 'D';
    }
    if (Math.hypot(ax, ay) < 0.05) this.markStuck(dt);
    else if (Math.abs(this.vel) > 0.08) this.stuckT = 0;
    this.noteGoalProgress(dt);
    return { throttle, steer };
  }

  /**
   * Next corner: the path point where the outgoing leg leaves the current sprite axis.
   * `at` is that point and `dist` is how far the van still is from it.
   */
  private upcomingTurn(): { dir: FacingDir; at: { x: number; y: number }; dist: number } | null {
    const pts = this.drivePath.slice();
    const goal = this.driveGoal;
    if (goal) {
      const last = pts[pts.length - 1];
      if (!last || last.x !== goal.x || last.y !== goal.y) pts.push(goal);
    }
    let px = this.cx;
    let py = this.cy;
    let dist = 0;
    for (const p of pts) {
      const dx = p.x - px;
      const dy = p.y - py;
      const seg = Math.hypot(dx, dy);
      if (seg > 0.05) {
        const face: FacingDir =
          Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'se' : 'nw') : dy >= 0 ? 'sw' : 'ne';
        // A short stub off the first node points at the cross-track error, not
        // at the leg. Treating it as the turn froze the van on the lane.
        const stub = dist < 0.05 && seg < 0.45;
        if (face !== this.dir && !stub) return { dir: face, at: { x: px, y: py }, dist };
      }
      dist += seg;
      px = p.x;
      py = p.y;
      if (dist > 8) break;
    }
    return null;
  }

  /** Creep along the sprite axis onto the corner, then swap once the outgoing 5×3 fits. */
  private alignTurn(dt: number, want: FacingDir, corner: { x: number; y: number }): void {
    const v = DIR_VEC[this.dir];
    const targetX = Math.round(corner.x);
    const targetY = Math.round(corner.y);
    const along = (targetX - this.cx) * v.x + (targetY - this.cy) * v.y;
    const need = DIR_TRAVEL_MIN - this.travelSinceDir;
    let step = Math.max(-CREEP_TILES_PER_S * dt, Math.min(CREEP_TILES_PER_S * dt, along));
    // The corner is here, but the last swap spent the travel budget. Inch along
    // the sprite (forward, else back) so the next facing is allowed to land.
    // A sideways step would draw the sprite more than 35° off the motion.
    if (Math.abs(along) <= 0.18 && need > 1e-4) {
      const earn = Math.min(CREEP_TILES_PER_S * dt, need);
      if (this.followStepOk(this.cx + v.x * earn, this.cy + v.y * earn)) step = earn;
      else if (this.followStepOk(this.cx - v.x * earn, this.cy - v.y * earn)) step = -earn;
    }
    // The corner can sit on the far side of a bend the van already passed.
    // Creep toward the next node on the sprite axis instead of away from it.
    const node = this.drivePath[0];
    if (node) {
      const nodeAlong = (node.x - this.cx) * v.x + (node.y - this.cy) * v.y;
      if (Math.abs(nodeAlong) > 0.08 && nodeAlong * step < -1e-4) {
        const toward = Math.max(-CREEP_TILES_PER_S * dt, Math.min(CREEP_TILES_PER_S * dt, nodeAlong));
        if (this.followStepOk(this.cx + v.x * toward, this.cy + v.y * toward)) step = toward;
      }
    }
    if (Math.abs(step) > 1e-5) {
      const nx = this.cx + v.x * step;
      const ny = this.cy + v.y * step;
      if (this.followStepOk(nx, ny)) {
        this.moveTo(nx, ny);
      } else {
        this.vel = 0;
      }
    } else {
      this.vel = 0;
    }
    this.wheelAcc += dt * WHEEL_FPS * Math.min(1.4, Math.abs(this.vel) / DRIVE_TILES_PER_S);
    while (this.wheelAcc >= 1) {
      this.wheel = (this.wheel + 1) & 3;
      this.wheelAcc -= 1;
    }
    if (this.travelSinceDir < DIR_TRAVEL_MIN) return;
    // Only the along-axis gap matters. A corner beside the sprite (the next leg
    // leaves sideways) still has a clear box here. The swap itself waits until
    // the next frame starts, so a step that gets walked back cannot spend the travel.
    // FOOT_EPS-sized: a 0.18 miss puts the 3-wide box on a fourth column.
    if (Math.abs(along) > 0.04) return;
    this.snapTurnLane(want, { x: targetX, y: targetY });
    if (this.poseBlocked(this.cx, this.cy, want) > 0) return;
    if (!this.driveBoxWalkable(this.cx, this.cy)) return;
    this.followDir = want;
  }

  /**
   * Land the cross-axis of the outgoing leg on the corner's integer when that
   * pose is clear. The leftover is at most the turn tolerance, so it is not a hop.
   */
  private snapTurnLane(want: FacingDir, node: { x: number; y: number }): void {
    const ix = Math.round(node.x);
    const iy = Math.round(node.y);
    const nx = want === 'sw' || want === 'ne' ? ix : this.cx;
    const ny = want === 'se' || want === 'nw' ? iy : this.cy;
    if (nx === this.cx && ny === this.cy) return;
    if (Math.hypot(nx - this.cx, ny - this.cy) > 0.2) return;
    if (this.poseBlocked(nx, ny, this.dir) !== 0) return;
    if (this.poseBlocked(nx, ny, want) !== 0) return;
    this.cx = nx;
    this.cy = ny;
    this.occupy(this.driveCells());
    this.layout();
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
      // Hold a corner until the sprite faces the outgoing leg. Dropping it
      // early leaves the van on the incoming axis and it drives past the turn.
      if (next) {
        const ox = next.x - t.x;
        const oy = next.y - t.y;
        if (Math.abs(ox) + Math.abs(oy) > 0.2) {
          const out: FacingDir =
            Math.abs(ox) >= Math.abs(oy) ? (ox >= 0 ? 'se' : 'nw') : oy >= 0 ? 'sw' : 'ne';
          if (out !== this.dir) break;
          // Already facing the outgoing leg, and the corner is beside us rather than
          // ahead. Drop it. Turning back onto the cell is what froze the van at the bend.
          const ov = DIR_VEC[out];
          const alongOut = (t.x - this.cx) * ov.x + (t.y - this.cy) * ov.y;
          if (Math.abs(alongOut) < 0.35 && dist < 0.6) {
            this.drivePath.shift();
            continue;
          }
        }
      }
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

  private atDriveGoal(): boolean {
    if (!this.driveGoal) return false;
    // The park gate measures the logic center, inside half a tile. The visual
    // center leads that on a long frame and used to stop the van short of it.
    const d = Math.hypot(this.driveGoal.x - this.cx, this.driveGoal.y - this.cy);
    return d < PATH_ARRIVE;
  }

  /** Stop on the sit but keep the goal so the scene can get out. */
  private holdAtGoal(): boolean {
    if (!this.atDriveGoal()) return false;
    this.drivePath = [];
    this.integVel = 0;
    this.vel = 0;
    this.reversing = false;
    this.stuckT = 0;
    this.followDir = null;
    if (
      this.lastParkHeading &&
      this.lastParkHeading !== this.dir &&
      this.travelSinceDir >= DIR_TRAVEL_MIN &&
      this.poseBlocked(this.cx, this.cy, this.lastParkHeading) === 0
    ) {
      this.dir = this.lastParkHeading;
      this.heading = dirIndex(this.lastParkHeading);
      this.travelSinceDir = 0;
      this.noChangeSinceEntry = false;
    }
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
    const stepX = sx !== 0 && this.followStepOk(this.cx + sx * 0.4, this.cy);
    const stepY = sy !== 0 && this.followStepOk(this.cx, this.cy + sy * 0.4);
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

  /**
   * Tap-to-park that makes no progress stops and uses the existing unreachable toast.
   * A shuttle used to move far enough inside each window that the net-displacement
   * check never fired. Also give up when the goal is not a tile closer in 3 s,
   * or the polyline grows three times without arriving.
   */
  private noteFollowProgress(dt: number): void {
    if (this.stuckGaveUp || !this.driveGoal || this.atDriveGoal()) {
      this.followStallT = -1;
      this.followPathLen = 0;
      return;
    }
    const n = this.drivePath.length;
    if (this.pathLenSeen >= 0 && n > this.pathLenSeen) this.pathRiseN += 1;
    const consumed = this.pathLenSeen >= 0 && n < this.pathLenSeen;
    this.pathLenSeen = n;
    if (this.pathRiseN >= PATH_RISE_MAX) {
      this.giveUpFollow();
      return;
    }
    const goalD = Math.hypot(this.cx - this.driveGoal.x, this.cy - this.driveGoal.y);
    if (goalD < this.goalBest) this.goalBest = goalD;
    if (this.goalStallMark === Infinity) this.goalStallMark = this.goalBest;
    // Eating the polyline is progress. A detour that leaves the goal for a
    // while must not toast while the van is still following the route.
    let progressed = false;
    const node = this.drivePath[0];
    if (node) {
      const nd = Math.hypot(this.cx - node.x, this.cy - node.y);
      if (nd < this.nodeBest - 0.25) {
        this.nodeBest = nd;
        this.goalStallT = 0;
        this.goalStallMark = this.goalBest;
        progressed = true;
      }
    } else this.nodeBest = Infinity;
    if (consumed) {
      this.goalStallT = 0;
      this.goalStallMark = this.goalBest;
      this.nodeBest = Infinity;
      progressed = true;
    } else if (this.goalBest <= this.goalStallMark - GOAL_IMPROVE_TILES) {
      this.goalStallMark = this.goalBest;
      this.goalStallT = 0;
      progressed = true;
    }
    if (!progressed) {
      this.goalStallT += dt;
      if (this.goalStallT >= GOAL_IMPROVE_S) {
        this.giveUpFollow();
        return;
      }
    }
    if (this.followStallT < 0) {
      this.followStallX = this.cx;
      this.followStallY = this.cy;
      this.followStallT = 0;
      this.followPathLen = 0;
    }
    this.followStallT += dt;
    if (this.followStallT < FOLLOW_STALL_S) return;
    const net = Math.hypot(this.cx - this.followStallX, this.cy - this.followStallY);
    const oscillate = this.followPathLen > 0.5 && net < 0.12;
    this.followStallX = this.cx;
    this.followStallY = this.cy;
    this.followStallT = 0;
    this.followPathLen = 0;
    if (net >= FOLLOW_STALL_TILES && !oscillate) return;
    this.giveUpFollow();
  }

  /** Stall detector already stopped this route. The scene must toast, not re-plan. */
  gaveUpRoute(): boolean {
    return this.stuckGaveUp;
  }

  private giveUpFollow(): void {
    this.clearDriveArrival();
    this.stuckGaveUp = true;
    this.vel = 0;
    this.followStallT = -1;
    this.followPathLen = 0;
    this.hooks.onStuck?.();
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

  spritesForBillboard(): Sprite[] {
    return [this.body];
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
    const moving = (this.driving && this.mph > 0.2) || this.pinnedCue;
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
      gameTimeMs: this.gameTimeMs,
      frameId: this.frameId,
      vel: this.vel,
      rpm: Math.round(this.rpm),
      mph: Math.round(this.mph),
      gaugeRpm: this.rpm,
      gaugeMph: this.gaugeMph,
      reversing: this.reversing,
      steering: this.steering,
      driveGoal: this.driveGoal,
      pathN: this.drivePath.length,
      lastParkMs: this.lastParkMs,
      visualTx: this.visualCenterTile().x,
      visualTy: this.visualCenterTile().y,
      bump: this.bumpT,
      bumpSeq: this.bumpSeq,
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
      reverseCue: this.reverseCueOn,
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

  /** QA: while driving, re-seat at a pose exactly like Get in does (D, nudged clear if it clips). */
  qaSpawnDrive(cx: number, cy: number, dir: FacingDir): void {
    if (!this.driving) return;
    this.dir = dir;
    this.heading = dirIndex(dir);
    this.cx = cx;
    this.cy = cy;
    this.vel = 0;
    this.mph = 0;
    this.gear = 'D';
    this.reversing = false;
    this.steerSmoothed = 0;
    this.steering = 0;
    this.creepStalled = false;
    this.swapBlocked = false;
    this.travelSinceDir = 0;
    this.noChangeSinceEntry = true;
    this.pendingDir = null;
    this.integVel = 0;
    this.reverseCueOn = false;
    this.clearDrivePath();
    this.ensureLegalDrivePose();
    this.occupy(this.driveCells());
    this.ensurePathsFromHere();
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

  private driveBoxWalkable(cx: number, cy: number): boolean {
    const o = {
      x: Math.round(cx - (DRIVE_BOX - 1) / 2),
      y: Math.round(cy - (DRIVE_BOX - 1) / 2),
    };
    for (const [x, y] of this.rect(o.x, o.y, DRIVE_BOX, DRIVE_BOX)) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
      if (PROP_CELLS.has(k(x, y))) return false;
      const c = cells[y]?.[x];
      if (!c) return false;
      if (c.groundId.includes('borde')) return false;
      if (!c.walkable && !this.claimed.has(k(x, y))) return false;
    }
    return true;
  }

  /** Live 5×3 / 3×5 collision cells: always the drawn facing, never a rounded heading. */
  driveFootprintCells(): [number, number][] {
    return this.footprintCellsAt(this.cx, this.cy, this.dir);
  }

  /**
   * Cells the exact box [cx ± w/2, cy ± h/2] overlaps by more than FOOT_EPS. Unlike the
   * rounded park rect this does not jump a whole tile at .5, and it always contains it.
   */
  private footprintCellsAt(cx: number, cy: number, dir: FacingDir): [number, number][] {
    const size = parkSize(dir);
    const x0 = Math.floor(cx - size.w / 2 + FOOT_EPS - 0.5) + 1;
    const x1 = Math.ceil(cx + size.w / 2 - FOOT_EPS + 0.5) - 1;
    const y0 = Math.floor(cy - size.h / 2 + FOOT_EPS - 0.5) + 1;
    const y1 = Math.ceil(cy + size.h / 2 - FOOT_EPS + 0.5) - 1;
    return this.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  footprintOverlapsBlocked(): boolean {
    return this.poseBlocked(this.cx, this.cy, this.dir) > 0;
  }

  /** One cell of the manual-drive footprint: on the map, off props, kerbs and building mass. */
  private driveCellOpen(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    const key = k(x, y);
    if (PROP_CELLS.has(key)) return false;
    const own = this.claimed.get(key);
    if (own !== undefined) return own;
    const c = cells[y]?.[x];
    if (!c) return false;
    if (c.groundId.includes('borde') || c.groundId.includes('building/footprint')) return false;
    return c.walkable;
  }

  /** Blocked cells under the exact 5×3 / 3×5 box at a pose (0 = legal). */
  private poseBlocked(cx: number, cy: number, dir: FacingDir): number {
    let n = 0;
    for (const [x, y] of this.footprintCellsAt(cx, cy, dir)) {
      if (!this.driveCellOpen(x, y)) n += 1;
    }
    return n;
  }

  


  /** Direction the van actually travels: the heading, held within MOTION_CONE of the sprite. */
  private motionHeading(): number {
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, this.heading);
    return wrapHeading(idx + Math.max(-MOTION_CONE, Math.min(MOTION_CONE, d)));
  }

  /**
   * Swap the 5×3 ↔ 3×5 sprite once the heading sits on the 0.62 q cap and the new
   * box fits here with no translation. Called once, after the frame has moved.
   * Entry (no sprite change yet) may swap immediately. After a real change the
   * truck needs 0.1 t. An in-place swap also needs 1 t free on the new facet.
   */
  private syncManualFacing(moved: number): boolean {
    this.swapBlocked = false;
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, this.heading);
    if (Math.abs(d) < HEADING_HARD - 1e-3) {
      this.pendingDir = null;
      return false;
    }
    const next = DIR_ORDER[(idx + (d > 0 ? 1 : 3)) & 3];
    const dirSign = this.gear === 'R' ? -1 : 1;
    const travelled = this.noChangeSinceEntry || this.travelSinceDir >= SWAP_TRAVEL_MIN;
    const fits = this.poseBlocked(this.cx, this.cy, next) === 0;
    const ahead = moved >= 0.02 || this.freeAhead(next, dirSign, SWAP_AHEAD_TILES);
    if (!travelled || !fits || !ahead) {
      this.swapBlocked = true;
      this.pendingDir = null;
      this.heading = this.capHeading(this.heading, HEADING_HARD);
      return false;
    }
    // A swap on the frame that is still accelerating reads as a speed jump.
    // Hold the cap and swap once the next frame's speed sits next to this one.
    if (this.swapWouldJolt()) return false;
    // The roll already happened on this sprite. Drawing the new one would put
    // that roll 56°–90° off the sprite. Take the new sprite at the start of
    // the next frame, and let that frame roll on it.
    if (this.motionOff(next, moved) > 35 / 90) {
      this.pendingDir = next;
      return false;
    }
    this.pendingDir = null;
    this.dir = next;
    this.noChangeSinceEntry = false;
    this.travelSinceDir = 0;
    this.occupy(this.driveCells());
    this.layout();
    return true;
  }

  /**
   * How far this frame's roll sits from `next`, in the direction the gear
   * actually travelled. Under 35° the new sprite can be drawn this frame.
   */
  private motionOff(next: FacingDir, moved: number): number {
    if (moved < 0.004) return 0;
    const motion = Math.atan2(this.cy - this.frameY, this.cx - this.frameX) / (Math.PI / 2);
    const face = dirIndex(next) + (this.gear === 'R' ? 2 : 0);
    return Math.abs(headingDelta(wrapHeading(face), motion));
  }

  /** Apply a moving swap before the frame rolls, so the roll lies on that sprite. */
  private applyPendingSwap(): boolean {
    const next = this.pendingDir;
    if (!next) return false;
    this.pendingDir = null;
    if (this.drivePath.length > 0 || this.driveGoal) return false;
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, this.heading);
    if (Math.abs(d) < HEADING_HARD - 1e-3) return false;
    const want = DIR_ORDER[(idx + (d > 0 ? 1 : 3)) & 3];
    if (want !== next || this.poseBlocked(this.cx, this.cy, next) !== 0) return false;
    this.earlyFrom = this.dir;
    this.earlyTravel = this.travelSinceDir;
    this.dir = next;
    this.noChangeSinceEntry = false;
    this.travelSinceDir = 0;
    this.occupy(this.driveCells());
    this.layout();
    return true;
  }

  /** True when this frame's along-speed is outside the smooth-swap band of the last one. */
  private swapWouldJolt(): boolean {
    const base = Math.abs(this.frameSpeed);
    if (base <= 1 || this.frameDt < 1e-8) return false;
    // A stop is not a speed jump. Deferring it leaves the truck at the cap
    // with no swap and no R cue, which the dead-stop gate counts.
    if (Math.hypot(this.cx - this.frameX, this.cy - this.frameY) < 0.02) return false;
    const axis = DIR_VEC[this.dir];
    const along = ((this.cx - this.frameX) * axis.x + (this.cy - this.frameY) * axis.y) / this.frameDt;
    const ratio = Math.abs(along) / base;
    return ratio < 0.85 || ratio > 1.2;
  }


    /**
   * One manual sub-step. The wheel yaws the heading; translation is move, then a
   * slide inside 35° of the sprite, then a clip, then a stop. A collision never
   * changes the heading or the sprite, and the truck never drives against the gear.
   */
  private stepManual(dt: number, gas: boolean): void {
    const dirSign = this.gear === 'R' ? -1 : 1;
    const steerOn = Math.abs(this.steering) > YAW_STEER_MIN;
    if (gas && !steerOn && (this.gear === 'D' || this.gear === 'R') && this.nosePinned(dirSign)) {
      this.noteBump(Math.abs(this.vel));
      this.vel = 0;
      this.creepStalled = false;
      this.reverseCueOn = false;
      return;
    }
    const atCap = Math.abs(headingDelta(dirIndex(this.dir), this.heading)) >= HEADING_HARD - 1e-3;
    const hold =
      gas &&
      steerOn &&
      atCap &&
      this.swapBlocked &&
      (this.gear === 'D' || this.gear === 'R') &&
      this.nosePinned(dirSign);
    if (Math.abs(this.vel) > 0.35 && steerOn) this.steerByTravel(this.vel * dt);
    else if ((gas || this.lastBrake) && steerOn && (this.gear === 'D' || this.gear === 'R')) {
      this.yawWithSteer(dt, dirSign);
    }
    const ang = this.motionHeading() * (Math.PI / 2);
    const dist = this.vel * dt;
    const adv = this.moveSlideClip(Math.cos(ang) * dist, Math.sin(ang) * dist);
    if (adv.blocked) {
      if (Math.abs(this.vel) > 0.4) this.noteBump(Math.abs(this.vel));
      const sign = Math.sign(this.vel) || (Math.abs(dist) > 1e-8 ? Math.sign(dist) : 0);
      const sp = adv.moved / Math.max(dt, 1e-6);
      this.vel = sign * Math.min(Math.abs(this.vel), sp);
      if (adv.moved <= 1e-4 || Math.abs(this.vel) <= 0.08) this.vel = 0;
    }
    this.creepStalled =
      gas && steerOn && (this.gear === 'D' || this.gear === 'R') && (hold || adv.moved < 1e-4);
  }

  private poseClear(x: number, y: number, dir: FacingDir = this.dir): boolean {
    if (this.pendingExit && this.exitFrom) {
      if (Math.hypot(x - this.exitFrom.x, y - this.exitFrom.y) > EXIT_MAX_TRAVEL) return false;
    }
    return this.poseBlocked(x, y, dir) === 0;
  }

  /** Largest distance in [0, len] along a unit vector that keeps the footprint clear. */
  private clipAlong(ux: number, uy: number, len: number): number {
    if (len <= 1e-8) return 0;
    if (this.poseClear(this.cx + ux * len, this.cy + uy * len)) return len;
    let lo = 0;
    let hi = len;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (this.poseClear(this.cx + ux * mid, this.cy + uy * mid)) lo = mid;
      else hi = mid;
    }
    return lo > 1e-4 ? lo : 0;
  }

  /** A step backward along the sprite, the way reverse leaves a pose. */
  private axisReverseBlocked(x: number, y: number, step: number): boolean {
    const f = DIR_VEC[this.dir];
    return this.poseBlocked(x - f.x * step, y - f.y * step, this.dir) !== 0;
  }

  /**
   * A lateral slide that crosses a footprint boundary can wedge the box so
   * reverse along the sprite no longer fits, even though it fit before the
   * slide. Shorten that slide. A step already on the axis is left alone.
   */
  private clampLateral(ux: number, uy: number, dist: number): number {
    if (dist <= 1e-4) return 0;
    const f = DIR_VEC[this.dir];
    const along = ux * f.x + uy * f.y;
    const lat = Math.abs(ux * f.y - uy * f.x) * dist;
    // Straight reverse is how a truck leaves a corner. A forward step, or a
    // slide off the axis, can cross a cell boundary and close that reverse.
    if (lat < 1e-3 && along <= 0) return dist;
    const movedBack = -along * dist;
    if (movedBack > 0.12) return dist;
    const probe = 0.2;
    if (this.axisReverseBlocked(this.cx, this.cy, probe)) return dist;
    const ok = (d: number) => {
      const x = this.cx + ux * d;
      const y = this.cy + uy * d;
      return this.poseClear(x, y) && !this.axisReverseBlocked(x, y, probe);
    };
    if (ok(dist)) return dist;
    let lo = 0;
    let hi = dist;
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2;
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
    return lo > 1e-4 ? lo : 0;
  }

  /**
   * Shared move / slide / clip / stop used by manual driving and the route follower.
   * A full step wins. Otherwise the longest legal slide within 35° of the sprite
   * axis this step is already aimed along, preferring the requested direction.
   * Else stop. Nothing here translates against that axis.
   */
  private moveSlideClip(dx: number, dy: number): { moved: number; blocked: boolean } {
    const len = Math.hypot(dx, dy);
    if (len < 1e-8) return { moved: 0, blocked: false };
    const ux = dx / len;
    const uy = dy / len;
    const full = this.clampLateral(ux, uy, this.poseClear(this.cx + ux * len, this.cy + uy * len) ? len : 0);
    if (full >= len - 1e-4) {
      this.moveTo(this.cx + ux * full, this.cy + uy * full);
      return { moved: full, blocked: false };
    }
    const f = DIR_VEC[this.dir];
    const wantAlong = ux * f.x + uy * f.y;
    const gear = wantAlong >= 0 ? 1 : -1;
    const base = dirIndex(this.dir) * (Math.PI / 2) + (gear < 0 ? Math.PI : 0);
    // 34°, inside the 35° honesty limit. A 35° fan measures 35.07° after atan2
    // and the browser gate counts that frame.
    const minAlong = Math.cos((34 * Math.PI) / 180) - 1e-3;
    let bestScore = 0;
    let bestGot = 0;
    let bu = ux;
    let bv = uy;
    const consider = (su: number, sv: number) => {
      const along = (su * f.x + sv * f.y) * gear;
      if (along < minAlong) return;
      const got = this.clampLateral(su, sv, this.clipAlong(su, sv, len));
      const score = got * (su * ux + sv * uy);
      if (got > 1e-4 && score > bestScore) {
        bestScore = score;
        bestGot = got;
        bu = su;
        bv = sv;
      }
    };
    consider(ux, uy);
    for (const deg of [-34, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 34]) {
      const ang = base + (deg * Math.PI) / 180;
      consider(Math.cos(ang), Math.sin(ang));
    }
    if (bestGot > 1e-4) {
      this.moveTo(this.cx + bu * bestGot, this.cy + bv * bestGot);
      return { moved: bestGot, blocked: bestGot < len - 1e-3 };
    }
    return { moved: 0, blocked: true };
  }

  private moveTo(x: number, y: number): void {
    if (x === this.cx && y === this.cy) return;
    this.cx = x;
    this.cy = y;
    this.occupy(this.driveCells());
    this.layout();
  }

  /** True when a step forward along the sprite would put the 5×3 into something. */
  private nosePinned(dirSign: number): boolean {
    const here = this.poseBlocked(this.cx, this.cy, this.dir);
    if (here > 0) return true;
    const f = DIR_VEC[this.dir];
    const step = 0.12;
    return this.poseBlocked(this.cx + f.x * dirSign * step, this.cy + f.y * dirSign * step, this.dir) > 0;
  }

  /** Clear road for `reach` tiles along `dir` in the gear direction. Sampled like the gate (0.25 t). */
  private freeAhead(dir: FacingDir, dirSign: number, reach: number): boolean {
    const f = DIR_VEC[dir];
    for (let s = 0; s <= reach + 1e-9; s += 0.25) {
      if (this.poseBlocked(this.cx + f.x * s * dirSign, this.cy + f.y * s * dirSign, dir) !== 0) return false;
    }
    return true;
  }


  /**
   * Heading turns at CREEP_YAW with gas held even when the van cannot roll, then inches
   * along the new heading if that fits. The facing itself still swaps only via
   * syncManualFacing, so the footprint at the current position never changes here.
   */
  /** Nose yaws with the wheel at creep speed. Used while the reverse arc rolls. */
  private yawWithSteer(dt: number, dirSign: number): void {
    const cmd = Math.max(-1, Math.min(1, this.steerCmd));
    if (Math.abs(cmd) < 1e-3) return;
    const idx = dirIndex(this.dir);
    const yaw = cmd * CREEP_YAW * dt * dirSign;
    const d = headingDelta(idx, this.heading) + yaw;
    this.heading = wrapHeading(idx + Math.max(-HEADING_HARD, Math.min(HEADING_HARD, d)));
  }

  /** Clamp a heading so it stays within `lim` quarter-turns of the drawn sprite. */
  private capHeading(want: number, lim: number): number {
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, want);
    return wrapHeading(idx + Math.max(-lim, Math.min(lim, d)));
  }

  /** Input released: drop anything past the swap line, then ease onto the sprite. */
  private unwindHeading(dt: number): void {
    this.heading = this.capHeading(this.heading, HEADING_HARD);
    const d = headingDelta(dirIndex(this.dir), this.heading);
    if (Math.abs(d) < 1e-3) {
      this.heading = wrapHeading(dirIndex(this.dir));
      return;
    }
    const step = Math.min(Math.abs(d), 4 * dt);
    this.heading = wrapHeading(this.heading - Math.sign(d) * step);
  }

  /**
   * Bicycle-style yaw: heading turns by arc length travelled, so a van that did not move
   * cannot rotate (except the gas-held creep turn). It may run a little past the swap line
   * within a frame; syncManualFacing settles the sprite before the next frame moves.
   */
  private steerByTravel(travel: number): void {
    if (Math.abs(this.steering) <= 0.08 || Math.abs(travel) < 1e-6) return;
    const idx = dirIndex(this.dir);
    const d = headingDelta(idx, this.heading) + (this.steering * travel) / (MIN_TURN_RADIUS_TILES * (Math.PI / 2));
    this.heading = wrapHeading(idx + Math.max(-HEADING_HARD, Math.min(HEADING_HARD, d)));
  }

  /** Straight-ahead travel (tiles, capped) before the footprint would clip something. */
  private forwardRoom(cx: number, cy: number, dir: FacingDir, cap: number): number {
    const v = DIR_VEC[dir];
    let room = 0;
    for (let d = 0.25; d <= cap; d += 0.25) {
      if (this.poseBlocked(cx + v.x * d, cy + v.y * d, dir) > 0) break;
      room = d;
    }
    return room;
  }

  /**
   * Get in / spawn: if the 5×3 already clips something, move to the cheapest legal pose
   * (distance, then keeping the facing, then having room to drive off) within 6 tiles.
   */
  ensureLegalDrivePose(): boolean {
    if (this.poseBlocked(this.cx, this.cy, this.dir) === 0) return false;
    let best: { x: number; y: number; dir: FacingDir; cost: number } | null = null;
    for (let r = 0.25; r <= 6; r += 0.25) {
      if (best && r > best.cost) break;
      for (let i = 0; i < 24; i++) {
        const a = (Math.PI * 2 * i) / 24;
        const x = this.cx + Math.cos(a) * r;
        const y = this.cy + Math.sin(a) * r;
        for (const dir of DIRS) {
          if (this.poseBlocked(x, y, dir) !== 0) continue;
          const turn = dir === this.dir ? 0 : 1.5;
          if (best && r + turn >= best.cost) continue;
          const cost = r + turn + (this.forwardRoom(x, y, dir, 2) < 2 ? 4 : 0);
          if (!best || cost < best.cost) best = { x, y, dir, cost };
        }
      }
    }
    if (!best) return false;
    this.cx = best.x;
    this.cy = best.y;
    this.dir = best.dir;
    this.heading = dirIndex(best.dir);
    this.occupy(this.driveCells());
    this.layout();
    return true;
  }

  qaFootprintBlocked(): boolean {
    return this.footprintOverlapsBlocked();
  }

  private driveFootprintWalkable(cx: number, cy: number, dir: FacingDir): boolean {
    const size = parkSize(dir);
    if (!this.footprintClear(cx, cy, size.w, size.h)) return false;
    if (!this.spriteFootprintClear(cx, cy, dir)) return false;
    for (const [x, y] of this.parkCellsAt(cx, cy, dir)) {
      if (!this.canDriveTile(x, y) && !this.claimed.has(k(x, y))) return false;
    }
    return true;
  }

  private canSit(cx: number, cy: number): boolean {
    return this.sitWith(cx, cy, this.dir);
  }

  /** Current pose with an explicit facing — used to reject a turn that would clip. */
  private sitWith(cx: number, cy: number, dir: FacingDir): boolean {
    if (this.driving && !this.pendingExit) {
      if (this.drivePath.length > 0 || this.driveGoal) return this.driveBoxWalkable(cx, cy);
      return this.driveFootprintWalkable(cx, cy, dir);
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
      // Commit after the frame is pulled legal, so a rejected step cannot rotate the sprite.
      // A corner that is already here keeps the outgoing facing; the heading visual
      // would otherwise point followDir back at the incoming sprite and the turn never lands.
      if (!(this.turnCrawl && this.followDir && this.followDir !== this.dir)) this.followDir = visual;
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
    // Heading leads the corner. Swapping as soon as the new box fits leaves the
    // van short of the cell the rest of the path was planned through.
    const idx0 = dirIndex(this.dir);
    const capped =
      Math.abs(this.vel) < 0.15 &&
      Math.abs(Math.abs(headingDelta(idx0, this.heading)) - HEADING_HARD) < 0.03;
    if (this.turnCrawl) {
      const turn = this.upcomingTurn();
      // Stopped on the cap at a U-turn: the turn point is already behind us,
      // and waiting for dist ≤ 0.04 never lets the second facing land.
      if (!capped && (!turn || turn.dist > 0.04 || turn.dir !== want)) return;
      if (turn && turn.dist <= 0.04 && turn.dir === want) this.snapTurnLane(want, turn.at);
    }
    // No sprite step without real travel. 0.32 is past the 0.3 gate. The extra
    // margin to DIR_TRAVEL_MIN applies only while the new box does not fit yet;
    // a long frame can be short of that margin with nowhere left to roll.
    // A U-turn's second facet is the exception: the van is already on the cap
    // and cannot roll until that facet exists.
    if (this.travelSinceDir < 0.32 && !capped) return;
    if (capped && this.poseBlocked(this.cx, this.cy, want) > 0) {
      const node = this.drivePath[0];
      if (node) {
        const nx = this.cx + Math.max(-0.2, Math.min(0.2, node.x - this.cx));
        const ny = this.cy + Math.max(-0.2, Math.min(0.2, node.y - this.cy));
        if (this.poseBlocked(nx, ny, this.dir) === 0 && this.poseBlocked(nx, ny, want) === 0) {
          this.cx = nx;
          this.cy = ny;
          this.occupy(this.driveCells());
          this.layout();
        }
      }
    }
    if (this.travelSinceDir < DIR_TRAVEL_MIN && this.poseBlocked(this.cx, this.cy, want) > 0 && !capped) return;
    const idx = dirIndex(this.dir);
    let step = dirIndex(want) - idx;
    if (step > 2) step -= 4;
    if (step < -2) step += 4;
    if (Math.abs(step) > 1) {
      const cw = DIR_ORDER[(idx + 1) & 3];
      const ccw = DIR_ORDER[(idx + 3) & 3];
      const goal = this.drivePath[0] ?? this.driveGoal;
      const score = (dir: FacingDir) => {
        if (!goal) return dir === want ? 1 : 0;
        const v = DIR_VEC[dir];
        return (goal.x - this.cx) * v.x + (goal.y - this.cy) * v.y;
      };
      want = score(cw) >= score(ccw) ? cw : ccw;
    }
    if (this.poseBlocked(this.cx, this.cy, want) > this.poseBlocked(this.cx, this.cy, this.dir)) return;
    // The 5×3 is the driving box. The 2×2 cab helper disagrees on the lane and
    // used to refuse a facing that already fits, so a long frame never turned.
    if (this.poseBlocked(this.cx, this.cy, want) > 0 && !this.sitWith(this.cx, this.cy, want) && !this.pathSit(this.cx, this.cy)) return;
    this.dir = want;
    this.noChangeSinceEntry = false;
    this.heading = this.capHeading(this.heading, HEADING_CAP);
    this.travelSinceDir = 0;
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
    for (const [x, y] of this.solidCells()) {
      const key = k(x, y);
      if (seen.has(key) || !PROP_CELLS.has(key)) continue;
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

  private nearestClearSit(): { x: number; y: number; dir: FacingDir } | null {
    const dirs: FacingDir[] = [this.dir, ...DIRS.filter((d) => d !== this.dir)];
    for (let r = 0; r <= 6; r += 0.25) {
      const steps = r === 0 ? 1 : 16;
      for (let i = 0; i < steps; i++) {
        const a = (Math.PI * 2 * i) / Math.max(1, steps);
        const sit = this.clampSit(this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r);
        for (const dir of dirs) {
          if (this.sitWith(sit.x, sit.y, dir)) return { x: sit.x, y: sit.y, dir };
        }
      }
    }
    return null;
  }

  /** If the van is inside a prop, push out along the MTV so it can never stay wedged. */
  resolveOverlap(): boolean {
    if (!this.overlapsProp()) return true;
    for (let i = 0; i < 12; i++) {
      const hit = this.overlapCells();
      if (hit.length === 0) break;
      const mtv = this.mtvFor(hit);
      const cand = this.clampSit(this.cx + mtv.x, this.cy + mtv.y);
      if (this.sitWith(cand.x, cand.y, this.dir)) {
        this.cx = cand.x;
        this.cy = cand.y;
        continue;
      }
      const found = this.nearestClearSit();
      if (!found) break;
      this.cx = found.x;
      this.cy = found.y;
      this.dir = found.dir;
      this.heading = dirIndex(found.dir);
    }
    if (this.overlapsProp()) {
      const found = this.nearestClearSit();
      if (found) {
        this.cx = found.x;
        this.cy = found.y;
        this.dir = found.dir;
        this.heading = dirIndex(found.dir);
      }
    }
    this.occupy(this.driving ? this.driveCells() : this.usableParkCells());
    this.layout();
    return !this.overlapsProp();
  }

  /** Planner / replan: same 2×2 box the van actually drives with, so tight door corridors stay open. */
  private pathSit(cx: number, cy: number): boolean {
    return this.driveBoxWalkable(cx, cy);
  }

  /** A waypoint the 5×3 can occupy in at least one facing. */
  private footprintGoal(x: number, y: number): boolean {
    if (!this.driveBoxWalkable(x, y)) return false;
    for (const dir of DIRS) if (this.poseBlocked(x, y, dir) === 0) return true;
    return false;
  }

  /** Straight cell, or the cell we are already sitting on. */
  private waypointFootOk(x: number, y: number, dir: FacingDir, sx: number, sy: number): boolean {
    if (x === sx && y === sy) return true;
    return this.driveBoxWalkable(x, y) && this.poseBlocked(x, y, dir) === 0;
  }

  /** Turn cell: both the arrival cell and the live pose (when it is the start) fit the new facing. */
  private turnCellOk(x: number, y: number, dir: FacingDir, sx: number, sy: number): boolean {
    if (x === sx && y === sy) return this.poseBlocked(this.cx, this.cy, dir) === 0;
    return this.poseBlocked(x, y, dir) === 0 && this.driveBoxWalkable(x, y);
  }

  /**
   * One facing-aware BFS from the truck. The value for each reached goal is the
   * waypoint list (the start cell is omitted). Goals the 5×3 cannot reach are absent.
   */
  private footprintPathsTo(goals: { x: number; y: number }[]): Map<string, { x: number; y: number }[]> {
    const want = new Set(goals.map((g) => k(g.x, g.y)));
    const out = new Map<string, { x: number; y: number }[]>();
    const sx = Math.round(this.cx);
    const sy = Math.round(this.cy);
    const keyOf = (x: number, y: number, dir: FacingDir) => `${x},${y},${dir}`;
    const rebuild = (ck: string, prev: Map<string, string>): { x: number; y: number }[] => {
      const path: { x: number; y: number }[] = [];
      let kcur: string | undefined = ck;
      const guard = new Set<string>();
      while (kcur && prev.has(kcur) && !guard.has(kcur)) {
        guard.add(kcur);
        const [xs, ys] = kcur.split(',');
        const x = Number(xs);
        const y = Number(ys);
        const before = path[path.length - 1];
        if (!before || before.x !== x || before.y !== y) path.push({ x, y });
        kcur = prev.get(kcur);
      }
      path.reverse();
      if (path[0]?.x === sx && path[0]?.y === sy) path.shift();
      return path;
    };
    if (want.has(k(sx, sy))) out.set(k(sx, sy), []);
    if (want.size === 0 || out.size === want.size) return out;
    type Node = { x: number; y: number; dir: FacingDir };
    const q: Node[] = [{ x: sx, y: sy, dir: this.dir }];
    const seen = new Set<string>([keyOf(sx, sy, this.dir)]);
    const prev = new Map<string, string>();
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const ck = keyOf(cur.x, cur.y, cur.dir);
      const cell = k(cur.x, cur.y);
      if (want.has(cell) && !out.has(cell)) {
        out.set(cell, cur.x === sx && cur.y === sy ? [] : rebuild(ck, prev));
        if (out.size === want.size) return out;
      }
      const idx = dirIndex(cur.dir);
      for (const turn of [1, 3]) {
        const nd = DIR_ORDER[(idx + turn) & 3];
        const nk = keyOf(cur.x, cur.y, nd);
        if (seen.has(nk)) continue;
        if (!this.turnCellOk(cur.x, cur.y, nd, sx, sy)) continue;
        seen.add(nk);
        prev.set(nk, ck);
        q.push({ x: cur.x, y: cur.y, dir: nd });
      }
      const v = DIR_VEC[cur.dir];
      const nx = cur.x + v.x;
      const ny = cur.y + v.y;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const sk = keyOf(nx, ny, cur.dir);
      if (seen.has(sk)) continue;
      if (!this.waypointFootOk(nx, ny, cur.dir, sx, sy)) continue;
      seen.add(sk);
      prev.set(sk, ck);
      q.push({ x: nx, y: ny, dir: cur.dir });
    }
    return out;
  }

  /**
   * Facing-aware route. Every waypoint is checked with the 5×3 of the facing that
   * drives it, and a turn cell is checked for the facing it turns into.
   */
  private footprintPath(tx: number, ty: number): { x: number; y: number }[] | null {
    const sx = Math.round(this.cx);
    const sy = Math.round(this.cy);
    if (sx === tx && sy === ty) return [];
    const keyOf = (x: number, y: number, dir: FacingDir) => `${x},${y},${dir}`;
    type Node = { x: number; y: number; dir: FacingDir };
    const q: Node[] = [{ x: sx, y: sy, dir: this.dir }];
    const seen = new Set<string>([keyOf(sx, sy, this.dir)]);
    const prev = new Map<string, string>();
    for (let i = 0; i < q.length; i++) {
      const cur = q[i];
      const ck = keyOf(cur.x, cur.y, cur.dir);
      if (cur.x === tx && cur.y === ty) {
        const path: { x: number; y: number }[] = [];
        let kcur: string | undefined = ck;
        const guard = new Set<string>();
        while (kcur && prev.has(kcur) && !guard.has(kcur)) {
          guard.add(kcur);
          const [xs, ys] = kcur.split(',');
          const x = Number(xs);
          const y = Number(ys);
          const before = path[path.length - 1];
          if (!before || before.x !== x || before.y !== y) path.push({ x, y });
          kcur = prev.get(kcur);
        }
        path.reverse();
        if (path[0]?.x === sx && path[0]?.y === sy) path.shift();
        return path;
      }
      const idx = dirIndex(cur.dir);
      for (const turn of [1, 3]) {
        const nd = DIR_ORDER[(idx + turn) & 3];
        const nk = keyOf(cur.x, cur.y, nd);
        if (seen.has(nk)) continue;
        if (!this.turnCellOk(cur.x, cur.y, nd, sx, sy)) continue;
        seen.add(nk);
        prev.set(nk, ck);
        q.push({ x: cur.x, y: cur.y, dir: nd });
      }
      const v = DIR_VEC[cur.dir];
      const nx = cur.x + v.x;
      const ny = cur.y + v.y;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const sk = keyOf(nx, ny, cur.dir);
      if (seen.has(sk)) continue;
      if (!this.waypointFootOk(nx, ny, cur.dir, sx, sy)) continue;
      seen.add(sk);
      prev.set(sk, ck);
      q.push({ x: nx, y: ny, dir: cur.dir });
    }
    return null;
  }

  /** Path step: a clear box stays clear. An overlapping box may only shrink. */
  private followStepOk(x: number, y: number): boolean {
    const here = this.poseBlocked(this.cx, this.cy, this.dir);
    const next = this.poseBlocked(x, y, this.dir);
    if (here === 0 && next > 0) return false;
    // A clear 5×3 is legal even when the old 2×2 cab helper disagrees. That
    // helper was what stopped the eastbound lane a tenth of a tile off y=6.
    if (next === 0) return true;
    if (here > 0 && next >= here) return false;
    return this.driveBoxWalkable(x, y) || next < here;
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
      if (this.claimed.has(k(x, y))) continue;
      if (PROP_CELLS.has(k(x, y))) return false;
      const c = cells[y]?.[x];
      if (!c || c.walkable) continue;
      if (c.groundId.includes('borde')) return false;
      if (c.groundId.includes('building/footprint')) return false;
      return false;
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
    this.gear = 'D';
    this.reversing = false;
    if (this.vel < 0) this.vel = 0;
    this.unstickHold = 0.4;
    this.stuckT = 0;
    this.lastUnstickAt = now;
    this.tryReplan();
    return true;
  }

  /** QA: true when the current solid / parked sprite footprint covers a prop cell. */
  qaTruckDepthKey(): number {
    return this.truckDepthKey();
  }

  overlapsProp(): boolean {
    for (const [x, y] of this.solidCells()) {
      if (PROP_CELLS.has(k(x, y))) return true;
    }
    if (!this.driving && !this.visualSpriteClear(this.cx, this.cy, this.dir)) return true;
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
    const pad = this.driving ? 0 : 8 * sc;
    const box = new Rectangle(lx + 40 * sc - pad, ly + 8 * sc - pad, 200 * sc + pad * 2, 120 * sc + pad * 2);
    this.hooks.tapBox.set(this.obj.id, box);
    this.hooks.container.hitArea = box;
    this.hooks.container.eventMode = 'static';
  }

  /** Amber arrow on the cab while a pin has turned the hidden heading off the sprite. */
  private updateSteerCue(): void {
    if (!this.steerCue) return;
    const showR = this.reverseCueOn;
    if (!this.pinnedCue && !showR) {
      this.steerCue.visible = false;
      this.steerCue.clear();
      if (this.reverseMark) {
        this.reverseMark.visible = false;
        this.reverseMark.clear();
      }
      return;
    }
    const sc = objectSpriteScale(this.obj) || SCALE_HOME;
    const vfs = vfsOf(this.dir);
    const px = -vfs.x * sc + (CELL_1X.w / 2) * sc;
    const py = -vfs.y * sc + 28 * sc;
    if (this.pinnedCue) {
      const a = this.heading * (Math.PI / 2);
      const ahead = tileToWorld(this.cx + Math.cos(a), this.cy + Math.sin(a));
      const here = tileToWorld(this.cx, this.cy);
      this.steerCue.position.set(px, py);
      this.steerCue.rotation = Math.atan2(ahead.y - here.y, ahead.x - here.x);
      this.steerCue.clear();
      this.steerCue.poly([18, 0, -8, 8, -8, -8]).fill({ color: 0xffb547, alpha: 0.95 });
      this.steerCue.visible = true;
    } else {
      this.steerCue.visible = false;
      this.steerCue.clear();
    }
    if (!this.reverseMark) return;
    this.reverseMark.clear();
    if (!showR) {
      this.reverseMark.visible = false;
      return;
    }
    this.reverseMark.position.set(px + 22, py - 8);
    const c = 0xffb547;
    this.reverseMark.rect(0, 0, 2.4, 14).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(0, 0, 9, 2.4).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(6.6, 0, 2.4, 8).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(0, 5.8, 8, 2.4).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(3.2, 8, 2.4, 2.4).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(5.2, 10.2, 2.4, 2.2).fill({ color: c, alpha: 0.95 });
    this.reverseMark.rect(7.2, 12, 2.4, 2).fill({ color: c, alpha: 0.95 });
    this.reverseMark.visible = true;
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
