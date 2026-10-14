import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { cells, MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import manifest from '../data/npcs.json';
import { tileToWorld } from '../iso/math';

export type NpcDir = 'se' | 'sw' | 'ne' | 'nw';
type AnimKind = 'idle' | 'walk';

type AnimEntry = { archivo2x: string; frames: number[]; fps: number };
type ManifestNpc = {
  id: string;
  ancla_pies: { x: number; y: number };
  animaciones: Record<string, AnimEntry>;
};

const CELL_W = manifest.celda.w;
const CELL_H = manifest.celda.h;
const DIRS: NpcDir[] = ['se', 'sw', 'ne', 'nw'];
/** Tile step per facing: se = +x, sw = +y, nw = −x, ne = −y. */
const DIR_STEP: Record<NpcDir, { dx: number; dy: number }> = {
  se: { dx: 1, dy: 0 },
  sw: { dx: 0, dy: 1 },
  nw: { dx: -1, dy: 0 },
  ne: { dx: 0, dy: -1 },
};
const REVERSE: Record<NpcDir, NpcDir> = { se: 'nw', nw: 'se', sw: 'ne', ne: 'sw' };
/**
 * World px per walk frame along x (y is half). The pack's walk cycle is drawn for 2 px @1x per
 * frame, or 4 px for a brisker pace; any other stride makes the feet skate.
 */
const STRIDE_DEFAULT = 2;
const STRIDE_BRISK = 4;
const BRISK_IDS = new Set(['corredora', 'repartidor']);
/** Half a tile's width: a one-tile step moves 64 px in x and 32 px in y. */
const TILE_STEP_X = 64;
const IDLE_CHANCE = 0.14;
const IDLE_MIN_S = 1.5;
const IDLE_MAX_S = 5;
const KEEP_STRAIGHT = 0.65;

export type NpcSnapshot = {
  id: string;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
  dir: NpcDir;
  mode: AnimKind;
  frame: number;
  stride: number;
  visible: boolean;
  zIndex: number;
  texture: string;
};

type Npc = {
  def: ManifestNpc;
  sprite: Sprite;
  tx: number;
  ty: number;
  dir: NpcDir;
  mode: AnimKind;
  /** Walk frames taken toward the next tile (0 … stepsPerTile). */
  progress: number;
  frame: number;
  clock: number;
  idleLeft: number;
  stride: number;
  x: number;
  y: number;
};

export type NpcHost = {
  /** Draw order for a walker standing at fractional tile (fx, fy). */
  zIndexAt(fx: number, fy: number): number;
  /** Tiles NPCs should not step onto (the player's tile). */
  blocked(tx: number, ty: number): boolean;
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (x: number, y: number) => y * MAP_WIDTH + x;

export function isNpcStreet(x: number, y: number): boolean {
  const c = cells[y]?.[x];
  return !!c && c.walkable && c.groundId.includes('path/street');
}

/**
 * Ambient pedestrians that wander the streets one tile at a time, in four directions. Their sprites
 * are direct children of `layer` so they depth-sort with the map objects.
 */
export class NpcCrowd {
  readonly layer: Container;
  private npcs: Npc[] = [];
  private frames = new Map<string, Texture[]>();
  private reserved = new Map<number, Npc>();
  private rand: () => number;
  private loaded = false;
  private enabled: boolean;
  private stillPose: boolean;
  private hidden = false;
  private view: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  private host: NpcHost;

  constructor(layer: Container, host: NpcHost, opts: { enabled: boolean; seed?: number; stillPose: boolean }) {
    this.layer = layer;
    this.host = host;
    this.enabled = opts.enabled;
    this.stillPose = opts.stillPose;
    this.rand = mulberry32(opts.seed ?? (Date.now() ^ 0x5eed));
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    const defs = manifest.npcs as ManifestNpc[];
    const base = `${import.meta.env.BASE_URL}sprites/personaje/npcs/`;
    await Promise.all(
      defs.flatMap((def) =>
        Object.entries(def.animaciones).map(async ([name, anim]) => {
          const tex = await Assets.load<Texture>({
            alias: `npc/${def.id}/${name}`,
            src: base + anim.archivo2x,
            data: {
              autoGenerateMipmaps: true,
              magFilter: 'nearest',
              minFilter: 'linear',
              mipmapFilter: 'linear',
            },
          });
          this.frames.set(
            `${def.id}/${name}`,
            anim.frames.map(
              (i) => new Texture({ source: tex.source, frame: new Rectangle(i * CELL_W, 0, CELL_W, CELL_H) }),
            ),
          );
        }),
      ),
    );
    this.spawn(defs);
    this.loaded = true;
  }

  private spawn(defs: ManifestNpc[]): void {
    const streets: { x: number; y: number }[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (isNpcStreet(x, y) && !this.host.blocked(x, y)) streets.push({ x, y });
      }
    }
    for (let i = streets.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [streets[i], streets[j]] = [streets[j], streets[i]];
    }
    const picked = defs.slice(0, streets.length);
    const born: Npc[] = picked.map((def, i) => {
      const { x, y } = streets[i];
      const open = DIRS.filter((d) => isNpcStreet(x + DIR_STEP[d].dx, y + DIR_STEP[d].dy));
      const dir = open.length ? open[Math.floor(this.rand() * open.length)] : DIRS[i % 4];
      const sprite = new Sprite();
      sprite.eventMode = 'none';
      sprite.anchor.set(def.ancla_pies.x / CELL_W, def.ancla_pies.y / CELL_H);
      sprite.label = `npc:${def.id}`;
      const startIdle = this.rand() < 0.3;
      const npc: Npc = {
        def,
        sprite,
        tx: x,
        ty: y,
        dir,
        mode: startIdle ? 'idle' : 'walk',
        progress: 0,
        frame: 0,
        clock: 0,
        idleLeft: startIdle ? IDLE_MIN_S + this.rand() * (IDLE_MAX_S - IDLE_MIN_S) : 0,
        stride: BRISK_IDS.has(def.id) ? STRIDE_BRISK : STRIDE_DEFAULT,
        x: 0,
        y: 0,
      };
      this.reserved.set(key(x, y), npc);
      return npc;
    });
    for (const npc of born) {
      if (npc.mode === 'walk' && !this.chooseNext(npc, false)) {
        npc.mode = 'idle';
        npc.idleLeft = IDLE_MIN_S;
      }
      const anim = this.anim(npc);
      npc.frame = Math.floor(this.rand() * anim.frames.length);
      npc.clock = this.rand() / anim.fps;
      this.npcs.push(npc);
      this.layer.addChild(npc.sprite);
      this.place(npc);
    }
    this.applyVisibility();
  }

  private anim(npc: Npc): AnimEntry {
    return npc.def.animaciones[`${npc.mode}_${npc.dir}`];
  }

  private stepsPerTile(npc: Npc): number {
    return TILE_STEP_X / npc.stride;
  }

  /** Picks and reserves the next street tile; prefers going straight and avoids U-turns. */
  private chooseNext(npc: Npc, allowReverse: boolean): boolean {
    const free = (d: NpcDir) => {
      const nx = npc.tx + DIR_STEP[d].dx;
      const ny = npc.ty + DIR_STEP[d].dy;
      return isNpcStreet(nx, ny) && !this.reserved.has(key(nx, ny)) && !this.host.blocked(nx, ny);
    };
    const open = DIRS.filter(free);
    let options = open.filter((d) => d !== REVERSE[npc.dir]);
    if (!options.length && allowReverse) options = open;
    if (!options.length) return false;
    const dir =
      options.includes(npc.dir) && this.rand() < KEEP_STRAIGHT
        ? npc.dir
        : options[Math.floor(this.rand() * options.length)];
    npc.dir = dir;
    npc.progress = 0;
    this.reserved.set(key(npc.tx + DIR_STEP[dir].dx, npc.ty + DIR_STEP[dir].dy), npc);
    return true;
  }

  private startIdle(npc: Npc, seconds: number): void {
    npc.mode = 'idle';
    npc.idleLeft = seconds;
    npc.frame = 0;
    npc.clock = 0;
  }

  private arrive(npc: Npc): void {
    const left = key(npc.tx, npc.ty);
    if (this.reserved.get(left) === npc) this.reserved.delete(left);
    npc.tx += DIR_STEP[npc.dir].dx;
    npc.ty += DIR_STEP[npc.dir].dy;
    npc.progress = 0;
    if (this.rand() < IDLE_CHANCE) {
      this.startIdle(npc, IDLE_MIN_S + this.rand() * (IDLE_MAX_S - IDLE_MIN_S));
    } else if (!this.chooseNext(npc, true)) {
      this.startIdle(npc, IDLE_MIN_S);
    }
  }

  update(dt: number): void {
    if (!this.loaded || !this.enabled || this.stillPose) return;
    for (const npc of this.npcs) {
      if (npc.mode === 'idle') {
        npc.idleLeft -= dt;
        if (npc.idleLeft <= 0) {
          if (this.chooseNext(npc, true)) {
            npc.mode = 'walk';
            npc.frame = Math.floor(this.rand() * this.anim(npc).frames.length);
            npc.clock = 0;
          } else {
            npc.idleLeft = 0.5 + this.rand();
          }
        }
      }
      const anim = this.anim(npc);
      const period = 1 / anim.fps;
      npc.clock += dt;
      while (npc.clock >= period) {
        npc.clock -= period;
        npc.frame = (npc.frame + 1) % anim.frames.length;
        if (npc.mode === 'walk') {
          npc.progress += 1;
          if (npc.progress >= this.stepsPerTile(npc)) {
            this.arrive(npc);
            if (npc.mode !== 'walk') break;
          }
        }
      }
      this.place(npc);
    }
  }

  private place(npc: Npc): void {
    const foot = tileToWorld(npc.tx, npc.ty);
    const s = DIR_STEP[npc.dir];
    const along = npc.mode === 'walk' ? npc.progress * npc.stride : 0;
    npc.x = foot.x + (s.dx - s.dy) * along;
    npc.y = foot.y + ((s.dx + s.dy) * along) / 2;
    npc.sprite.position.set(npc.x, npc.y);
    const frames = this.frames.get(`${npc.def.id}/${npc.mode}_${npc.dir}`)!;
    npc.sprite.texture = frames[npc.frame % frames.length];
    const t = npc.mode === 'walk' ? npc.progress / this.stepsPerTile(npc) : 0;
    npc.sprite.zIndex = this.host.zIndexAt(npc.tx + s.dx * t, npc.ty + s.dy * t);
    this.syncVisible(npc);
  }

  /** Shows only NPCs inside the padded view rectangle (world coords). */
  cull(view: { minX: number; maxX: number; minY: number; maxY: number }, hideAll: boolean): void {
    this.view = view;
    this.hidden = hideAll;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    for (const npc of this.npcs) this.syncVisible(npc);
  }

  private syncVisible(npc: Npc): void {
    const v = this.view;
    npc.sprite.visible =
      this.enabled &&
      !this.hidden &&
      (!v || (npc.x >= v.minX && npc.x <= v.maxX && npc.y >= v.minY && npc.y <= v.maxY + CELL_H));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVisibility();
  }

  snapshot(): NpcSnapshot[] {
    return this.npcs.map((n) => {
      const s = DIR_STEP[n.dir];
      const t = n.mode === 'walk' ? n.progress / this.stepsPerTile(n) : 0;
      return {
        id: n.def.id,
        tx: n.tx,
        ty: n.ty,
        fx: n.tx + s.dx * t,
        fy: n.ty + s.dy * t,
        x: n.x,
        y: n.y,
        dir: n.dir,
        mode: n.mode,
        frame: n.frame,
        stride: n.stride,
        visible: n.sprite.visible,
        zIndex: n.sprite.zIndex,
        texture: `${n.mode}_${n.dir}`,
      };
    });
  }
}
