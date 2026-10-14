import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import manifest from '../data/jugador.json';
import { CHARACTER_WORLD_SCALE } from './npcs';

export type FacingDir = 'se' | 'sw' | 'ne' | 'nw';
type Mode = 'idle' | 'walk';

/** World px of one tile step along a map axis (64 across, 32 down). */
export const TILE_STEP_WORLD = Math.hypot(64, 32);
/** Player foot speed on the map and in rooms, in tile steps per second. */
export const WALK_TILES_PER_S = 4.5;
export const SPRINT_TILES_PER_S = 7;
/**
 * World px per walk frame: the pack's brisk step (4 sheet px across, 2 down) at the character
 * scale. Eight frames cover exactly one tile, and frames advance by distance walked, so the walk
 * runs at speed / stride fps (≈36 walking, ≈56 sprinting) and the feet never skate.
 */
export const WALK_STRIDE_WORLD = Math.hypot(4, 2) * CHARACTER_WORLD_SCALE;
/** Pantone trails the player by one tile of walked path (manifest `seguir.distancia_celdas`). */
export const PANTONE_FOLLOW_WORLD = manifest.pantone.seguir.distancia_celdas * TILE_STEP_WORLD;
/** No movement for this long turns a walk into idle (path corners and blocked keys don't flicker). */
const IDLE_AFTER_S = 0.09;
const TELEPORT_WORLD = 3 * TILE_STEP_WORLD;

const DIRS: FacingDir[] = ['se', 'sw', 'ne', 'nw'];

type SheetKind = { cellW: number; cellH: number; anchorX: number; anchorY: number };

/** Horizontal strip of `count` cells; `@2x` files load at resolution 2 so frames stay in sheet px. */
export async function loadStrip(
  src: string,
  alias: string,
  cellW: number,
  cellH: number,
  count: number,
): Promise<Texture[]> {
  const tex = await Assets.load<Texture>({
    alias,
    src,
    data: { autoGenerateMipmaps: true, magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'linear' },
  });
  return Array.from(
    { length: count },
    (_, i) => new Texture({ source: tex.source, frame: new Rectangle(i * cellW, 0, cellW, cellH) }),
  );
}

/** High-DPI canvases sample the @2x sheets; the art is the same pixels doubled either way. */
export function sheetSuffix(resolution: number): '@1x' | '@2x' {
  return resolution >= 1.5 ? '@2x' : '@1x';
}

export function facingFrom(dx: number, dy: number, prev: FacingDir): FacingDir {
  const eps = 1e-6;
  const v = Math.abs(dy) < eps ? prev[0] : dy > 0 ? 's' : 'n';
  const h = Math.abs(dx) < eps ? prev[1] : dx > 0 ? 'e' : 'w';
  return (v + h) as FacingDir;
}

class Walker {
  readonly sprite = new Sprite();
  dir: FacingDir = 'se';
  mode: Mode = 'idle';
  frame = 0;
  /** World px walked since this walk started (drives the frame). */
  walked = 0;
  idleClock = 0;
  stillFor = 0;
  stillTicks = 0;
  x = 0;
  y = 0;

  private readonly name: string;
  private readonly walkAnim: string;
  private readonly frames: Map<string, Texture[]>;

  constructor(name: string, kind: SheetKind, walkAnim: string, frames: Map<string, Texture[]>) {
    this.name = name;
    this.walkAnim = walkAnim;
    this.frames = frames;
    this.sprite.eventMode = 'none';
    this.sprite.label = name;
    this.sprite.anchor.set(kind.anchorX / kind.cellW, kind.anchorY / kind.cellH);
    this.sprite.scale.set(CHARACTER_WORLD_SCALE);
  }

  textureKey(): string {
    return `${this.mode === 'walk' ? this.walkAnim : 'idle'}_${this.dir}`;
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sprite.position.set(Math.round(x), Math.round(y));
  }

  /** Moves by (dx, dy) world px this frame and advances the animation. */
  advance(dx: number, dy: number, dt: number, stillPose: boolean, faceDx = dx, faceDy = dy): void {
    const d = Math.hypot(dx, dy);
    if (d > 1e-3) {
      if (this.mode !== 'walk') {
        this.mode = 'walk';
        this.walked = 0;
      }
      this.dir = facingFrom(faceDx, faceDy, this.dir);
      this.walked += d;
      this.stillFor = 0;
      this.stillTicks = 0;
      this.frame = Math.floor(this.walked / WALK_STRIDE_WORLD) % 8;
    } else {
      this.stillFor += dt;
      this.stillTicks += 1;
      if (this.mode === 'walk' && this.stillFor >= IDLE_AFTER_S && this.stillTicks >= 2) {
        this.mode = 'idle';
        this.idleClock = 0;
        this.frame = 0;
      } else if (this.mode === 'idle' && !stillPose) {
        this.idleClock += dt;
        this.frame = Math.floor(this.idleClock * 3) % 2;
      }
    }
    this.applyTexture();
  }

  applyTexture(): void {
    const list = this.frames.get(`${this.name}/${this.textureKey()}`);
    if (list) this.sprite.texture = list[this.frame % list.length];
  }
}

export type AvatarHost = {
  /** Draw order for a walker whose feet stand at fractional tile (fx, fy). */
  zIndexAt(fx: number, fy: number): number;
  /** Whether the tile under world point (wx, wy) can be stood on. */
  walkableAt(wx: number, wy: number): boolean;
};

export type WalkerSnapshot = {
  x: number;
  y: number;
  fx: number;
  fy: number;
  dir: FacingDir;
  mode: Mode;
  frame: number;
  walked: number;
  texture: string;
  zIndex: number;
  visible: boolean;
  worldW: number;
  worldH: number;
  filter: string;
  resolution: number;
};

export type AvatarSnapshot = {
  loaded: boolean;
  adonay: WalkerSnapshot;
  pantone: WalkerSnapshot;
  /** World px of walked path between Adonay and Pantone (straight-line gap is in the snapshots). */
  trailGap: number;
  stride: number;
  walkTilesPerS: number;
  sprintTilesPerS: number;
};

/** Visible itself and through every ancestor. */
export function renderedVisible(node: Container): boolean {
  for (let n: Container | null = node; n; n = n.parent) if (!n.visible) return false;
  return true;
}

/** Fractional tile coordinates of a world point (tile centres at integers). */
export function worldToTileFrac(wx: number, wy: number): { x: number; y: number } {
  return { x: (wx / 64 + wy / 32) / 2, y: (wy / 32 - wx / 64) / 2 };
}

const sharedFrames = new Map<string, Texture[]>();
let framesLoading: Promise<void> | null = null;

export function loadPlayerSheets(resolution: number): Promise<void> {
  if (framesLoading) return framesLoading;
  const suffix = sheetSuffix(resolution);
  const base = `${import.meta.env.BASE_URL}sprites/personaje/`;
  const jobs: Promise<void>[] = [];
  for (const who of ['adonay', 'pantone'] as const) {
    const m = manifest[who];
    for (const [name, anim] of Object.entries(m.animaciones)) {
      const file = (anim as { archivo1x: string }).archivo1x.replace('@1x', suffix);
      jobs.push(
        loadStrip(`${base}${who}/${file}`, `player/${who}/${name}`, m.celda.w, m.celda.h, anim.frames.length).then(
          (frames) => void sharedFrames.set(`${who}/${name}`, frames),
        ),
      );
    }
  }
  framesLoading = Promise.all(jobs).then(() => undefined);
  return framesLoading;
}

/**
 * Adonay with Pantone one tile behind. Both sprites are direct children of `layer` so they
 * depth-sort with the scenery. Call `update` every frame with the player's foot in world px.
 */
export class PlayerAvatar {
  readonly adonay: Walker;
  readonly pantone: Walker;
  private trail: { x: number; y: number; s: number }[] = [];
  private travelled = 0;
  private hasFoot = false;
  private visible = true;
  private facingHold: { dir: FacingDir; fresh: boolean } | null = null;

  private readonly host: AvatarHost;
  private readonly stillPose: boolean;

  constructor(layer: Container, host: AvatarHost, stillPose: boolean) {
    this.host = host;
    this.stillPose = stillPose;
    const a = manifest.adonay;
    const p = manifest.pantone;
    this.adonay = new Walker(
      'adonay',
      { cellW: a.celda.w, cellH: a.celda.h, anchorX: a.ancla_pies.x, anchorY: a.ancla_pies.y },
      'walk',
      sharedFrames,
    );
    this.pantone = new Walker(
      'pantone',
      { cellW: p.celda.w, cellH: p.celda.h, anchorX: p.ancla_pies.x, anchorY: p.ancla_pies.y },
      'trot',
      sharedFrames,
    );
    layer.addChild(this.pantone.sprite, this.adonay.sprite);
  }

  setVisible(on: boolean): void {
    this.visible = on;
    this.adonay.sprite.visible = on;
    this.pantone.sprite.visible = on;
  }

  /** Turns Adonay to `dir` (e.g. toward Noah) until he next walks; outlasts this tick's last step. */
  setFacing(dir: FacingDir): void {
    this.facingHold = { dir, fresh: true };
    this.adonay.dir = dir;
    this.adonay.applyTexture();
  }

  /** Drops the trail and stands Pantone behind the player (first placement, rooms, teleports). */
  reset(x: number, y: number, dir: FacingDir = this.adonay.dir): void {
    this.adonay.dir = dir;
    this.adonay.mode = 'idle';
    this.adonay.frame = 0;
    this.adonay.idleClock = 0;
    this.adonay.place(x, y);
    const offsets = manifest.pantone.seguir.offset_detras_2x as Record<FacingDir, number[]>;
    const order = [dir, ...DIRS.filter((d) => d !== dir)];
    const pick = order.find((d) => this.host.walkableAt(x + offsets[d][0], y + offsets[d][1]));
    const off = pick ? offsets[pick] : [-8, -4];
    const px = x + off[0];
    const py = y + off[1];
    this.pantone.dir = pick ? facingFrom(-off[0], -off[1], dir) : dir;
    this.pantone.mode = 'idle';
    this.pantone.frame = 0;
    this.pantone.place(px, py);
    this.travelled = PANTONE_FOLLOW_WORLD;
    this.trail = [
      { x: px, y: py, s: 0 },
      { x, y, s: PANTONE_FOLLOW_WORLD },
    ];
    this.hasFoot = true;
    this.adonay.applyTexture();
    this.pantone.applyTexture();
    this.syncDepth();
  }

  update(x: number, y: number, dt: number): void {
    if (!this.hasFoot || Math.hypot(x - this.adonay.x, y - this.adonay.y) > TELEPORT_WORLD) {
      this.reset(x, y);
      return;
    }
    const dx = x - this.adonay.x;
    const dy = y - this.adonay.y;
    const d = Math.hypot(dx, dy);
    this.adonay.advance(dx, dy, dt, this.stillPose);
    const hold = this.facingHold;
    if (hold && !hold.fresh && d > 1e-3) this.facingHold = null;
    else if (hold) {
      hold.fresh = false;
      this.adonay.dir = hold.dir;
      this.adonay.applyTexture();
    }
    this.adonay.place(x, y);
    if (d > 1e-3) {
      this.travelled += d;
      this.trail.push({ x, y, s: this.travelled });
    }
    const target = this.trailPoint(this.travelled - PANTONE_FOLLOW_WORLD);
    const pdx = target.x - this.pantone.x;
    const pdy = target.y - this.pantone.y;
    this.pantone.advance(pdx, pdy, dt, this.stillPose, target.dirX, target.dirY);
    this.pantone.place(target.x, target.y);
    this.syncDepth();
  }

  /** Point on the walked trail at path distance `s`, plus that segment's heading. */
  private trailPoint(s: number): { x: number; y: number; dirX: number; dirY: number } {
    const t = this.trail;
    while (t.length > 2 && t[1].s <= s) t.shift();
    const a = t[0];
    const b = t[1] ?? a;
    const span = b.s - a.s;
    const k = span > 1e-6 ? Math.min(1, Math.max(0, (s - a.s) / span)) : 1;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dirX: b.x - a.x, dirY: b.y - a.y };
  }

  private syncDepth(): void {
    for (const w of [this.adonay, this.pantone]) {
      const f = worldToTileFrac(w.x, w.y);
      w.sprite.zIndex = this.host.zIndexAt(f.x, f.y);
    }
  }

  /** Tile Pantone stands on (NPCs keep off it). */
  pantoneTile(): { x: number; y: number } {
    const f = worldToTileFrac(this.pantone.x, this.pantone.y);
    return { x: Math.round(f.x), y: Math.round(f.y) };
  }

  private walkerSnapshot(w: Walker): WalkerSnapshot {
    const f = worldToTileFrac(w.x, w.y);
    const src = w.sprite.texture.source;
    return {
      x: w.x,
      y: w.y,
      fx: f.x,
      fy: f.y,
      dir: w.dir,
      mode: w.mode,
      frame: w.frame,
      walked: w.walked,
      texture: w.textureKey(),
      zIndex: w.sprite.zIndex,
      visible: this.visible && renderedVisible(w.sprite),
      worldW: w.sprite.width,
      worldH: w.sprite.height,
      filter: `${src.magFilter}/${src.minFilter}`,
      resolution: src.resolution,
    };
  }

  snapshot(): AvatarSnapshot {
    return {
      loaded: sharedFrames.size > 0,
      adonay: this.walkerSnapshot(this.adonay),
      pantone: this.walkerSnapshot(this.pantone),
      trailGap: this.travelled - Math.max(this.trail[0]?.s ?? 0, this.travelled - PANTONE_FOLLOW_WORLD),
      stride: WALK_STRIDE_WORLD,
      walkTilesPerS: WALK_TILES_PER_S,
      sprintTilesPerS: SPRINT_TILES_PER_S,
    };
  }
}
