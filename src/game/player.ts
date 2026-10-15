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
/** Adonay's step between a bench's front cell and its seat. */
const STEP_WORLD_PER_S = WALK_TILES_PER_S * TILE_STEP_WORLD;
/** Pantone's trot to the bench and back onto the trail: faster than a sprint, so he always catches up. */
const RUN_WORLD_PER_S = SPRINT_TILES_PER_S * TILE_STEP_WORLD * 1.25;

const REST = manifest.pantone.comportamiento_reposo;
/** Seconds without input before Pantone sits, then lies down (manifest `temporizador`). */
export const PANTONE_SIT_AFTER_S = REST.temporizador.sentarse_tras_s;
export const PANTONE_LIE_AFTER_S = REST.temporizador.echarse_tras_s_adicionales;
/** The rest strips start loading this long before Pantone first needs them. */
const REST_PRELOAD_LEAD_S = 10;

const DIRS: FacingDir[] = ['se', 'sw', 'ne', 'nw'];

type Who = 'adonay' | 'pantone';
type AnimEntry = { archivo1x: string; frames: number[]; fps: number; loop: boolean };
type SeatEntry = AnimEntry & {
  asiento?: { pies_desde_ancla_banco_mapa: { orientacion: string; dx: number; dy: number } | null };
};

function animEntries(who: Who): Record<string, SeatEntry> {
  return manifest[who].animaciones as Record<string, SeatEntry>;
}

export type BenchVariant = 'der' | 'izq';
/** World point plus the way the character faces there. */
export type Spot = { x: number; y: number; dir: FacingDir };
type SpotOffset = { dx: number; dy: number; dir: FacingDir };

/** Adonay's feet from the bench anchor, from the `sentado_*` strips' `asiento` (only se / sw have legs). */
const SEAT_FEET = (() => {
  const out: Partial<Record<BenchVariant, SpotOffset>> = {};
  for (const dir of DIRS) {
    const p = animEntries('adonay')[`sentado_${dir}`]?.asiento?.pies_desde_ancla_banco_mapa;
    if (p) out[p.orientacion as BenchVariant] = { dx: p.dx, dy: p.dy, dir };
  }
  return out as Record<BenchVariant, SpotOffset>;
})();
/** Pantone sits on the ground beside the bench's near end, never on it. */
const DOG_SPOT = REST.banco.offset_desde_ancla_banco_mapa as Record<BenchVariant, SpotOffset>;

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
  /** Strip shown instead of idle / walk (sentarse, sentado, echado…), played by `tickPose`. */
  pose: string | null = null;
  /** Last poses entered, oldest first (QA reads the order; a 0.25 s transition can fall between drawn frames). */
  readonly poseLog: string[] = [];
  private poseClock = 0;

  private readonly name: Who;
  private readonly walkAnim: string;
  private readonly frames: Map<string, Texture[]>;

  constructor(name: Who, kind: SheetKind, walkAnim: string, frames: Map<string, Texture[]>) {
    this.name = name;
    this.walkAnim = walkAnim;
    this.frames = frames;
    this.sprite.eventMode = 'none';
    this.sprite.label = name;
    this.sprite.anchor.set(kind.anchorX / kind.cellW, kind.anchorY / kind.cellH);
    this.sprite.scale.set(CHARACTER_WORLD_SCALE);
  }

  textureKey(): string {
    if (this.pose) return `${this.pose}_${this.dir}`;
    return `${this.mode === 'walk' ? this.walkAnim : 'idle'}_${this.dir}`;
  }

  playPose(pose: string): void {
    this.poseLog.push(pose);
    if (this.poseLog.length > 12) this.poseLog.shift();
    this.pose = pose;
    this.poseClock = 0;
    this.mode = 'idle';
    this.frame = 0;
    this.applyTexture();
  }

  /** Advances the pose at the strip's fps; true once a one-shot strip has held its last frame a frame's time. */
  tickPose(dt: number, stillPose: boolean): boolean {
    const a = animEntries(this.name)[this.textureKey()];
    if (!a) return true;
    this.poseClock += dt;
    const n = Math.floor(this.poseClock * a.fps);
    const count = a.frames.length;
    this.frame = a.loop ? (stillPose ? 0 : n % count) : Math.min(n, count - 1);
    this.applyTexture();
    return !a.loop && n >= count;
  }

  clearPose(): void {
    this.pose = null;
    this.mode = 'idle';
    this.frame = 0;
    this.idleClock = 0;
    this.applyTexture();
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
  pose: string | null;
  poseLog: string[];
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
  /** Adonay on a bench: stepping in, sitting down, seated, getting up, stepping back out (or free). */
  sit: SitPhase;
  /** Pantone: following, catching up, trotting to the bench, or one of his rest strips. */
  rest: RestPhase;
  restAt: 'here' | 'bench' | null;
  /** Seconds since the last input (the rest timer), and seconds Pantone has sat quietly. */
  quiet: number;
  lieClock: number;
  restLoaded: boolean;
  seat: { feet: Spot; dog: Spot; front: { x: number; y: number }; tile: { x: number; y: number } } | null;
};

type SitPhase = 'free' | 'stepIn' | 'sentarse' | 'sentado' | 'levantarse' | 'stepOut';
type RestPhase =
  | 'follow'
  | 'catchup'
  | 'toBench'
  | 'sentarse'
  | 'sentado'
  | 'echarse'
  | 'echado'
  | 'levantarse_echado'
  | 'levantarse';

/** A bench the scene seats Adonay on; the avatar works out his and Pantone's spots from the manifest. */
export type BenchSeat = {
  variant: BenchVariant;
  /** The bench sprite's anchor: its tile's south vertex. */
  anchor: { x: number; y: number };
  /** Centre of the front cell Adonay walks up to and stands back up onto. */
  front: { x: number; y: number };
  /** Bench tile; seated, Adonay sorts on it like the NPC sitters. */
  tile: { x: number; y: number };
  /** The bench sprite's draw order (Pantone beside it draws after it). */
  benchZ: number;
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
let sheetResolution = 1;
let framesLoading: Promise<void> | null = null;
let restLoading: Promise<void> | null = null;
let restLoaded = false;
/** Walking strips load with the map; sit / lie strips on first need. `meditar_*` ships unused for now. */
const WALK_ANIM = /^(idle|walk|trot)_/;
const UNUSED_ANIM = /^meditar_/;

function loadSheets(pick: (name: string) => boolean): Promise<void> {
  const suffix = sheetSuffix(sheetResolution);
  const base = `${import.meta.env.BASE_URL}sprites/personaje/`;
  const jobs: Promise<void>[] = [];
  for (const who of ['adonay', 'pantone'] as const) {
    const m = manifest[who];
    for (const [name, anim] of Object.entries(animEntries(who))) {
      if (!pick(name)) continue;
      const file = anim.archivo1x.replace('@1x', suffix);
      jobs.push(
        loadStrip(`${base}${who}/${file}`, `player/${who}/${name}`, m.celda.w, m.celda.h, anim.frames.length).then(
          (frames) => void sharedFrames.set(`${who}/${name}`, frames),
        ),
      );
    }
  }
  return Promise.all(jobs).then(() => undefined);
}

export function loadPlayerSheets(resolution: number): Promise<void> {
  if (framesLoading) return framesLoading;
  sheetResolution = resolution;
  framesLoading = loadSheets((name) => WALK_ANIM.test(name));
  return framesLoading;
}

/** Sit / lie / stand-up strips for both characters; fetched once, retried on the next need if it fails. */
export function loadRestSheets(): Promise<void> {
  restLoading ??= loadSheets((name) => !WALK_ANIM.test(name) && !UNUSED_ANIM.test(name)).then(
    () => void (restLoaded = true),
    () => void (restLoading = null),
  );
  return restLoading;
}

/**
 * Adonay with Pantone one tile behind. Both sprites are direct children of `layer` so they
 * depth-sort with the scenery. Call `update` every frame with the player's foot in world px.
 *
 * On a bench (`sitOn`) Adonay steps from the front cell onto the seat and sits; the scene keeps his
 * tile at the front cell and holds movement until `isFree()` again. Pantone rests per the manifest's
 * `comportamiento_reposo`: beside the bench while Adonay sits, or where he stands after a quiet spell.
 */
export class PlayerAvatar {
  readonly adonay: Walker;
  readonly pantone: Walker;
  private trail: { x: number; y: number; s: number }[] = [];
  private travelled = 0;
  /** Path distance Pantone stands at on the trail; never goes back. */
  private trailAt = 0;
  private hasFoot = false;
  private visible = true;
  private facingHold: { dir: FacingDir; fresh: boolean } | null = null;

  private seat: (BenchSeat & { feet: Spot; dog: Spot }) | null = null;
  private sit: SitPhase = 'free';
  private wantStand = false;
  private rest: RestPhase = 'follow';
  private restAt: 'here' | 'bench' | null = null;
  /** Bench draw order while Pantone is at (or heading to) its side. */
  private dogBenchZ: number | null = null;
  /** Input arrived while Pantone rests: get up once the current transition ends. */
  private wake = false;
  /** Pantone left the trail for the bench: he rejoins once Adonay is back on the front cell. */
  private rejoin = false;
  private quiet = 0;
  private lieClock = 0;

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
    this.adonay.pose = null;
    this.pantone.pose = null;
    this.sit = 'free';
    this.seat = null;
    this.wantStand = false;
    this.rest = 'follow';
    this.restAt = null;
    this.dogBenchZ = null;
    this.wake = false;
    this.rejoin = false;
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
    this.trailAt = 0;
    this.trail = [
      { x: px, y: py, s: 0 },
      { x, y, s: PANTONE_FOLLOW_WORLD },
    ];
    this.hasFoot = true;
    this.adonay.applyTexture();
    this.pantone.applyTexture();
    this.syncDepth();
  }

  /** Starts the bench sequence from the front cell; false while already on (or leaving) a bench. */
  sitOn(bench: BenchSeat): boolean {
    if (this.sit !== 'free') return false;
    const f = SEAT_FEET[bench.variant];
    const d = DOG_SPOT[bench.variant];
    this.seat = {
      ...bench,
      feet: { x: bench.anchor.x + f.dx, y: bench.anchor.y + f.dy, dir: f.dir },
      dog: { x: bench.anchor.x + d.dx, y: bench.anchor.y + d.dy, dir: d.dir },
    };
    this.sit = 'stepIn';
    this.wantStand = false;
    this.facingHold = null;
    void loadRestSheets();
    return true;
  }

  /** Gets Adonay up: the current transition finishes first, then levantarse and the step back out. */
  standUp(): void {
    if (this.sit !== 'free') this.wantStand = true;
  }

  isFree(): boolean {
    return this.sit === 'free';
  }

  /** Any player input: restarts the rest timer and wakes a resting Pantone. */
  noteInput(): void {
    this.quiet = 0;
    this.lieClock = 0;
    if (this.rest !== 'follow' && this.rest !== 'catchup' && this.rest !== 'toBench') this.wake = true;
  }

  /** QA: as if `seconds` more passed without input. */
  qaSkipQuiet(seconds: number): void {
    this.quiet += seconds;
    if (this.rest === 'sentado') this.lieClock += seconds;
  }

  update(x: number, y: number, dt: number): void {
    this.quiet += dt;
    const far = (px: number, py: number) => Math.hypot(x - px, y - py) > TELEPORT_WORLD;
    if (!this.hasFoot || (this.seat ? far(this.seat.front.x, this.seat.front.y) : far(this.adonay.x, this.adonay.y))) {
      this.reset(x, y);
      return;
    }
    if (this.sit === 'free') {
      const d = this.stepAdonay(x, y, dt);
      const hold = this.facingHold;
      if (hold && !hold.fresh && d > 1e-3) this.facingHold = null;
      else if (hold) {
        hold.fresh = false;
        this.adonay.dir = hold.dir;
        this.adonay.applyTexture();
      }
    } else this.tickSeat(dt);
    this.tickPantone(dt);
    this.syncDepth();
  }

  /** Moves Adonay's feet to (x, y), walking by distance, and extends the trail Pantone follows. */
  private stepAdonay(x: number, y: number, dt: number): number {
    const a = this.adonay;
    const dx = x - a.x;
    const dy = y - a.y;
    const d = Math.hypot(dx, dy);
    a.advance(dx, dy, dt, this.stillPose);
    a.place(x, y);
    if (d > 1e-3) {
      this.travelled += d;
      this.trail.push({ x, y, s: this.travelled });
    }
    return d;
  }

  private tickSeat(dt: number): void {
    const a = this.adonay;
    const s = this.seat!;
    switch (this.sit) {
      case 'stepIn':
      case 'stepOut': {
        if (this.wantStand) this.sit = 'stepOut';
        const out = this.sit === 'stepOut';
        const to = out ? s.front : s.feet;
        const d = Math.hypot(to.x - a.x, to.y - a.y);
        const k = d > 1e-6 ? Math.min(1, (STEP_WORLD_PER_S * dt) / d) : 1;
        this.stepAdonay(a.x + (to.x - a.x) * k, a.y + (to.y - a.y) * k, dt);
        if (k < 1) return;
        if (out) {
          this.sit = 'free';
          this.seat = null;
          this.wantStand = false;
          if (this.rejoin) this.rejoinTrail();
          return;
        }
        a.dir = s.feet.dir;
        if (restLoaded) {
          a.playPose('sentarse');
          this.sit = 'sentarse';
        } else {
          void loadRestSheets();
          a.mode = 'idle';
          a.frame = 0;
          a.applyTexture();
        }
        return;
      }
      case 'sentarse':
        if (a.tickPose(dt, this.stillPose)) {
          this.sit = this.wantStand ? 'levantarse' : 'sentado';
          a.playPose(this.sit);
        }
        return;
      case 'sentado':
        a.tickPose(dt, this.stillPose);
        if (this.wantStand) {
          this.sit = 'levantarse';
          a.playPose('levantarse');
        }
        return;
      case 'levantarse':
        if (a.tickPose(dt, this.stillPose)) {
          a.clearPose();
          this.sit = 'stepOut';
        }
        return;
    }
  }

  /** Adonay is (going to be) seated, so Pantone keeps to the bench. */
  private pantoneStays(): boolean {
    return this.sit !== 'free' && !this.wantStand;
  }

  /** Pantone should get up: Adonay left the bench, input came, or he rests somewhere other than the bench. */
  private pantoneShouldRise(): boolean {
    return this.pantoneStays() ? this.restAt !== 'bench' : this.wake || this.restAt === 'bench';
  }

  private chainPantone(pose: RestPhase): void {
    this.rest = pose;
    this.pantone.playPose(pose);
  }

  private tickPantone(dt: number): void {
    const p = this.pantone;
    const still = this.stillPose;
    switch (this.rest) {
      case 'follow':
      case 'catchup':
        if (this.pantoneStays() && this.seat) {
          this.rest = 'toBench';
          this.rejoin = true;
          this.wake = false;
          this.dogBenchZ = this.seat.benchZ;
          return;
        }
        if (this.quiet >= PANTONE_SIT_AFTER_S - REST_PRELOAD_LEAD_S) void loadRestSheets();
        if (
          this.rest === 'follow' &&
          !this.rejoin &&
          this.sit === 'free' &&
          restLoaded &&
          this.quiet >= PANTONE_SIT_AFTER_S &&
          this.adonay.mode === 'idle' &&
          p.mode === 'idle'
        ) {
          this.restAt = 'here';
          this.lieClock = 0;
          this.chainPantone('sentarse');
          return;
        }
        this.followTrail(dt);
        return;
      case 'toBench': {
        const s = this.seat;
        if (!this.pantoneStays() || !s) {
          this.rest = 'catchup';
          this.dogBenchZ = null;
          return;
        }
        const to = s.dog;
        const d = Math.hypot(to.x - p.x, to.y - p.y);
        const k = d > 1e-6 ? Math.min(1, (RUN_WORLD_PER_S * dt) / d) : 1;
        const nx = p.x + (to.x - p.x) * k;
        const ny = p.y + (to.y - p.y) * k;
        p.advance(nx - p.x, ny - p.y, dt, still);
        p.place(nx, ny);
        if (k < 1) return;
        p.dir = to.dir;
        if (restLoaded) {
          this.restAt = 'bench';
          this.lieClock = 0;
          this.chainPantone('sentarse');
        } else {
          void loadRestSheets();
          p.applyTexture();
        }
        return;
      }
      case 'sentarse':
        if (p.tickPose(dt, still)) this.chainPantone(this.pantoneShouldRise() ? 'levantarse' : 'sentado');
        return;
      case 'sentado':
        p.tickPose(dt, still);
        // Beside Adonay's bench input does not move him; only Adonay getting up does.
        if (this.pantoneStays()) this.wake = false;
        if (this.pantoneShouldRise()) this.chainPantone('levantarse');
        else if (this.lieClock >= PANTONE_LIE_AFTER_S) this.chainPantone('echarse');
        else this.lieClock += dt;
        return;
      case 'echarse':
        if (p.tickPose(dt, still)) {
          this.chainPantone(this.pantoneShouldRise() || this.wake ? 'levantarse_echado' : 'echado');
        }
        return;
      case 'echado':
        p.tickPose(dt, still);
        if (this.pantoneShouldRise() || this.wake) this.chainPantone('levantarse_echado');
        return;
      case 'levantarse_echado':
        if (!p.tickPose(dt, still)) return;
        if (this.pantoneShouldRise()) this.chainPantone('levantarse');
        else {
          this.wake = false;
          this.lieClock = 0;
          this.chainPantone('sentado');
        }
        return;
      case 'levantarse':
        if (!p.tickPose(dt, still)) return;
        p.clearPose();
        this.restAt = null;
        this.dogBenchZ = null;
        this.wake = false;
        this.rest = 'catchup';
        return;
    }
  }

  /** Follows one tile behind on the walked trail; catching up, at a run until back in place. */
  private followTrail(dt: number): void {
    const p = this.pantone;
    if (this.rejoin) {
      p.advance(0, 0, dt, this.stillPose);
      return;
    }
    const want = this.travelled - PANTONE_FOLLOW_WORLD;
    if (want > this.trailAt) {
      this.trailAt = this.rest === 'catchup' ? Math.min(want, this.trailAt + RUN_WORLD_PER_S * dt) : want;
    }
    if (this.rest === 'catchup' && this.trailAt >= want - 0.5) this.rest = 'follow';
    const target = this.trailPoint(this.trailAt);
    p.advance(target.x - p.x, target.y - p.y, dt, this.stillPose, target.dirX, target.dirY);
    p.place(target.x, target.y);
  }

  /** Back from the bench: a straight trail from where Pantone is to Adonay on the front cell. */
  private rejoinTrail(): void {
    const p = this.pantone;
    const a = this.adonay;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    this.trail = [
      { x: p.x, y: p.y, s: this.travelled - d },
      { x: a.x, y: a.y, s: this.travelled },
    ];
    this.trailAt = this.travelled - d;
    this.rejoin = false;
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
    const a = this.adonay;
    // Seated, Adonay sorts on the bench's own tile (which the bench never hides), like the NPC sitters.
    const fa = this.seat && a.pose ? this.seat.tile : worldToTileFrac(a.x, a.y);
    a.sprite.zIndex = this.host.zIndexAt(fa.x, fa.y);
    const p = this.pantone;
    const fp = worldToTileFrac(p.x, p.y);
    const zp = this.host.zIndexAt(fp.x, fp.y);
    p.sprite.zIndex = this.dogBenchZ === null ? zp : Math.max(zp, this.dogBenchZ + 0.01);
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
      pose: w.pose,
      poseLog: [...w.poseLog],
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
    const s = this.seat;
    return {
      loaded: sharedFrames.size > 0,
      adonay: this.walkerSnapshot(this.adonay),
      pantone: this.walkerSnapshot(this.pantone),
      trailGap: this.travelled - this.trailAt,
      stride: WALK_STRIDE_WORLD,
      walkTilesPerS: WALK_TILES_PER_S,
      sprintTilesPerS: SPRINT_TILES_PER_S,
      sit: this.sit,
      rest: this.rest,
      restAt: this.restAt,
      quiet: this.quiet,
      lieClock: this.lieClock,
      restLoaded,
      seat: s ? { feet: { ...s.feet }, dog: { ...s.dog }, front: { ...s.front }, tile: { ...s.tile } } : null,
    };
  }
}
