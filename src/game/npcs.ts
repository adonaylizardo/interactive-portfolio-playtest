import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import manifest from '../data/npcs.json';
import { tileFootWorld, tileToWorld } from '../iso/math';
import {
  DIR_STEP,
  mulberry32,
  NPC_ROLES,
  NpcRoutines,
  POSE_STRIP,
  type AnimInfo,
  type NpcDir,
  type NpcPose,
  type NpcRole,
  type RoutineHost,
  type Walker,
} from './npcRoutines';

export type { NpcDir, NpcPose, NpcRole };

type AnimEntry = {
  archivo2x: string;
  frames: number[];
  fps: number;
  /** Play order over `frames` at `fps` (estrellas: 0,0,0,1); `frames` in order without it. */
  secuencia?: number[];
  /** Sit strips: where the feet go, in world px from the bench sprite's anchor (null for ne / nw). */
  asiento?: { pies_desde_ancla_banco_mapa: { dx: number; dy: number } | null };
};
type ManifestNpc = {
  id: string;
  ancla_pies: { x: number; y: number };
  /**
   * `idle_<dir>` and `walk_<dir>` for every facing, plus the pose strips (`sentado_<dir>`,
   * `estrellas_<dir>`, see POSE_STRIP). Pose strips are optional: an NPC holding a pose shows the
   * idle strip facing the same way when its sheet has none.
   */
  animaciones: Record<string, AnimEntry>;
};

/** Poses the routines ask for; the loader picks up their strips from the manifest when present. */
export const NPC_POSES: readonly NpcPose[] = Object.keys(POSE_STRIP) as NpcPose[];
/** The only role that takes each pose: other NPCs never need (or fetch) those strips. */
const ROLE_POSE: Partial<Record<NpcRole, NpcPose>> = { bench: 'sit', stargazer: 'lookUp' };

/** Strips an NPC can show: idle and walk, plus its role's pose strips. */
function usedAnims(def: ManifestNpc): [string, AnimEntry][] {
  const pose = ROLE_POSE[NPC_ROLES[def.id] ?? 'stroller'];
  const strip = pose && POSE_STRIP[pose];
  return Object.entries(def.animaciones).filter(([name]) => /^(idle|walk)_/.test(name) || (!!strip && name.startsWith(`${strip}_`)));
}

const CELL_W = manifest.celda.w;
const CELL_H = manifest.celda.h;
/**
 * Pixel-art characters draw at 2 world px per sheet px (the @2x sheet 1:1), so a 50 px cell is
 * 100 world px tall next to a 59 px bench.
 */
export const CHARACTER_WORLD_SCALE = 2;
/**
 * World px per walk frame along x (y is half). The pack's walk cycle is drawn for 2 sheet px per
 * frame, or 4 for a brisker pace; any other stride makes the feet skate.
 */
const STRIDE_DEFAULT = 2 * CHARACTER_WORLD_SCALE;
const STRIDE_BRISK = 4 * CHARACTER_WORLD_SCALE;
const BRISK_IDS = new Set(['corredora', 'repartidor']);
/** Game-time step when QA fast-forwards the routines. */
const QA_ADVANCE_STEP_S = 1 / 30;

export type NpcSnapshot = {
  id: string;
  role: NpcRole;
  task: string;
  tx: number;
  ty: number;
  fx: number;
  fy: number;
  x: number;
  y: number;
  dir: NpcDir;
  mode: 'walk' | 'idle';
  /** Pose the routine asks for; `texture` says whether its strip or the idle fallback is drawn. */
  pose: NpcPose | null;
  /** Bench tile while sitting (drawn there when the sit strip exists), else null. */
  seat: { x: number; y: number } | null;
  inside: boolean;
  /** Seconds in the current task. */
  since: number;
  /** Remaining route (next tile first). */
  path: { x: number; y: number }[];
  frame: number;
  stride: number;
  visible: boolean;
  zIndex: number;
  texture: string;
  /** Drawn frame size in world px, and the texture's sampling filters. */
  worldW: number;
  worldH: number;
  filter: string;
};

function playOrder(a: AnimEntry): number[] {
  return a.secuencia ?? a.frames.map((_, i) => i);
}

export type NpcHost = RoutineHost & {
  /** Draw order for a walker standing at fractional tile (fx, fy). */
  zIndexAt(fx: number, fy: number): number;
};

/**
 * Draws the street crowd. Where everyone goes and what they do lives in npcRoutines.ts; sprites
 * are direct children of `layer` so they depth-sort with the map objects.
 */
export class NpcCrowd {
  readonly layer: Container;
  private routines: NpcRoutines | null = null;
  private sprites = new Map<Walker, Sprite>();
  private pos = new Map<Walker, { x: number; y: number }>();
  private frames = new Map<string, Texture[]>();
  /** `<id>/sentado_<dir>` → feet offset from the bench anchor (world px). */
  private seatOffsets = new Map<string, { dx: number; dy: number }>();
  private seed: number;
  private loaded = false;
  private loading: Promise<void> | null = null;
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
    this.seed = opts.seed ?? (Date.now() ^ 0x5eed);
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  load(): Promise<void> {
    this.loading ??= this.loadStrips();
    return this.loading;
  }

  private async loadStrips(): Promise<void> {
    const defs = manifest.npcs as ManifestNpc[];
    const base = `${import.meta.env.BASE_URL}sprites/personaje/npcs/`;
    await Promise.all(
      defs.flatMap((def) =>
        usedAnims(def).map(async ([name, anim]) => {
          const tex = await Assets.load<Texture>({
            alias: `npc/${def.id}/${name}`,
            src: base + anim.archivo2x,
            data: {
              autoGenerateMipmaps: true,
              magFilter: 'nearest',
              minFilter: 'nearest',
              mipmapFilter: 'linear',
            },
          });
          const cells = anim.frames.map(
            (i) => new Texture({ source: tex.source, frame: new Rectangle(i * CELL_W, 0, CELL_W, CELL_H) }),
          );
          this.frames.set(`${def.id}/${name}`, playOrder(anim).map((i) => cells[i]));
          const seat = anim.asiento?.pies_desde_ancla_banco_mapa;
          if (seat) this.seatOffsets.set(`${def.id}/${name}`, { dx: seat.dx, dy: seat.dy });
        }),
      ),
    );
    const routines = new NpcRoutines(
      defs.map((def) => ({
        id: def.id,
        stride: BRISK_IDS.has(def.id) ? STRIDE_BRISK : STRIDE_DEFAULT,
        anims: Object.fromEntries(
          usedAnims(def).map(([name, a]): [string, AnimInfo] => [name, { count: playOrder(a).length, fps: a.fps }]),
        ),
      })),
      this.host,
      mulberry32(this.seed),
    );
    for (const w of routines.walkers) {
      const def = defs.find((d) => d.id === w.id)!;
      const sprite = new Sprite();
      sprite.eventMode = 'none';
      sprite.anchor.set(def.ancla_pies.x / CELL_W, def.ancla_pies.y / CELL_H);
      sprite.scale.set(CHARACTER_WORLD_SCALE);
      sprite.label = `npc:${def.id}`;
      this.sprites.set(w, sprite);
      this.layer.addChild(sprite);
    }
    this.routines = routines;
    this.loaded = true;
    this.placeAll();
  }

  update(dt: number): void {
    if (!this.routines || !this.enabled || this.stillPose) return;
    this.routines.update(dt);
    this.placeAll();
  }

  /** QA: runs the routines `seconds` of game time ahead in small steps. */
  advance(seconds: number): void {
    if (!this.routines) return;
    for (let t = 0; t < seconds; t += QA_ADVANCE_STEP_S) this.routines.update(Math.min(QA_ADVANCE_STEP_S, seconds - t));
    this.placeAll();
  }

  private placeAll(): void {
    if (!this.routines) return;
    for (const w of this.routines.walkers) this.place(this.routines, w);
  }

  private place(r: NpcRoutines, w: Walker): void {
    const sprite = this.sprites.get(w)!;
    const anim = r.animKey(w);
    const seatOffset = w.seat && w.mode === 'idle' ? this.seatOffsets.get(`${w.id}/${anim}`) : undefined;
    let p: { x: number; y: number };
    if (w.seat && seatOffset) {
      // On the bench: feet at the bench sprite's anchor (its tile's south vertex) plus the strip's seat offset.
      const a = tileFootWorld(w.seat.x, w.seat.y);
      p = { x: a.x + seatOffset.dx, y: a.y + seatOffset.dy };
    } else {
      const foot = tileToWorld(w.tx, w.ty);
      const s = DIR_STEP[w.dir];
      const along = w.mode === 'walk' ? w.progress * w.stride : 0;
      p = { x: foot.x + (s.dx - s.dy) * along, y: foot.y + ((s.dx + s.dy) * along) / 2 };
    }
    this.pos.set(w, p);
    sprite.position.set(p.x, p.y);
    const frames = this.frames.get(`${w.id}/${anim}`)!;
    sprite.texture = frames[w.frame % frames.length];
    // A sitter sorts on the bench's own tile, which the bench never hides, so it draws over the bench.
    const f = w.seat && seatOffset ? w.seat : r.feet(w);
    sprite.zIndex = this.host.zIndexAt(f.x, f.y);
    this.syncVisible(w);
  }

  /** Shows only NPCs inside the padded view rectangle (world coords). */
  cull(view: { minX: number; maxX: number; minY: number; maxY: number }, hideAll: boolean): void {
    this.view = view;
    this.hidden = hideAll;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    for (const w of this.sprites.keys()) this.syncVisible(w);
  }

  private syncVisible(w: Walker): void {
    const v = this.view;
    const p = this.pos.get(w);
    this.sprites.get(w)!.visible =
      this.enabled &&
      !this.hidden &&
      !w.inside &&
      !!p &&
      (!v || (p.x >= v.minX && p.x <= v.maxX && p.y >= v.minY && p.y <= v.maxY + CELL_H * CHARACTER_WORLD_SCALE));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.applyVisibility();
  }

  /** QA: the town the routines read (benches, cart lines, deck spots, doors, street ends, stroll zones) and who holds which place. */
  town(): {
    carts: { id: string; at: { x: number; y: number }; slots: { x: number; y: number }[]; faces: NpcDir[] }[];
    benches: {
      id: string;
      variant: 'der' | 'izq';
      seat: { x: number; y: number };
      front: { x: number; y: number };
      face: NpcDir;
      seatFace: NpcDir;
    }[];
    mirador: { x: number; y: number }[];
    doors: { name: string; door: { x: number; y: number } }[];
    ends: { x: number; y: number }[];
    zones: { name: string; cells: { x: number; y: number }[] }[];
    owners: { carts: (string | null)[][]; benches: (string | null)[]; mirador: (string | null)[] };
  } | null {
    const r = this.routines;
    if (!r) return null;
    const { carts, benches, mirador, doors, ends, zones } = r.town;
    return { carts, benches, mirador, doors, ends, zones, owners: r.owners() };
  }

  snapshot(): NpcSnapshot[] {
    const r = this.routines;
    if (!r) return [];
    return r.walkers.map((w) => {
      const sprite = this.sprites.get(w)!;
      const p = this.pos.get(w) ?? { x: 0, y: 0 };
      const f = r.feet(w);
      return {
        id: w.id,
        role: w.role,
        task: w.task,
        tx: w.tx,
        ty: w.ty,
        fx: f.x,
        fy: f.y,
        x: p.x,
        y: p.y,
        dir: w.dir,
        mode: w.mode,
        pose: w.pose,
        seat: w.seat ? { ...w.seat } : null,
        inside: w.inside,
        since: w.since,
        path: w.path.map((c) => ({ ...c })),
        frame: w.frame,
        stride: w.stride,
        visible: sprite.visible,
        zIndex: sprite.zIndex,
        texture: r.animKey(w),
        worldW: sprite.width,
        worldH: sprite.height,
        filter: `${sprite.texture.source.magFilter}/${sprite.texture.source.minFilter}`,
      };
    });
  }
}
