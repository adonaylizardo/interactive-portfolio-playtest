import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import data from '../data/noah.json';
import { CHARACTER_WORLD_SCALE } from './npcs';
import { loadStrip, renderedVisible, sheetSuffix, worldToTileFrac } from './player';

type Waypoint = keyof typeof data.waypoints_marco_muro;
type Step = { anim: string; from: Waypoint | null; to: Waypoint; frames: number };

const FPS = data.fps;
const CELL_W = data.celda.w;
const CELL_H = data.celda.h;
const ANCHOR = data.anclas.pies;
const WAYPOINTS = data.waypoints_marco_muro;
const START: Waypoint = 'inicio_idle';
const SEQUENCE: Step[] = data.secuencia.map((s) => ({
  anim: s.anim,
  from: s.desde as Waypoint | null,
  to: s.hasta as Waypoint,
  frames: s.frames_totales,
}));
/** Climbing anims draw just above the muro; everything else sorts with the walkers. */
const ON_WALL = new Set(['subir', 'travesia_derecha', 'bajar', 'salto_aterrizaje']);
const MURO_DEPTH_EPS = 0.25;

/**
 * Walk back to the start: there is no south-west walk yet, so `caminar_ne` mirrored, at the pace of
 * the walk to the wall (manifest README).
 */
function returnStep(): Step & { mirror: true } {
  const walk = SEQUENCE.find((s) => s.anim === 'caminar_ne')!;
  const a = WAYPOINTS[walk.from!]['1x'];
  const b = WAYPOINTS[walk.to]['1x'];
  const pace = Math.hypot(b[0] - a[0], b[1] - a[1]) / walk.frames;
  const end = WAYPOINTS[SEQUENCE[SEQUENCE.length - 1].to]['1x'];
  const home = WAYPOINTS[START]['1x'];
  const frames = Math.max(1, Math.round(Math.hypot(home[0] - end[0], home[1] - end[1]) / pace));
  return { anim: 'caminar_ne', from: SEQUENCE[SEQUENCE.length - 1].to, to: START, frames, mirror: true };
}
const RETURN = returnStep();

export type NoahHost = {
  /** World top-left of the muro sprite frame (the manifest's waypoint origin). */
  muroTopLeft(): { x: number; y: number };
  muroZIndex(): number;
  zIndexAt(fx: number, fy: number): number;
};

export type NoahSnapshot = {
  loaded: boolean;
  phase: 'idle' | 'sequence' | 'return';
  step: number;
  anim: string;
  frame: number;
  mirrored: boolean;
  onWall: boolean;
  x: number;
  y: number;
  fx: number;
  fy: number;
  zIndex: number;
  visible: boolean;
  worldW: number;
  worldH: number;
  scale: number;
  filter: string;
  /** Waypoints reached this run, in order. */
  reached: string[];
  runs: number;
  waypoints: Record<string, { x: number; y: number }>;
};

/** Noah, the climbing kid by the muro. A talk (tap or Enter beside him) plays his route once. */
export class Noah {
  readonly sprite = new Sprite();
  private frames = new Map<string, Texture[]>();
  private loaded = false;
  private phase: NoahSnapshot['phase'] = 'idle';
  private stepIndex = 0;
  private k = 0;
  private clock = 0;
  private anim = 'idle';
  private frame = 0;
  private mirrored = false;
  private reached: string[] = [];
  private runs = 0;
  private x = 0;
  private y = 0;
  private hidden = false;

  private readonly layer: Container;
  private readonly host: NoahHost;
  private readonly scale: number;

  constructor(layer: Container, host: NoahHost, scale = CHARACTER_WORLD_SCALE) {
    this.layer = layer;
    this.host = host;
    this.scale = scale;
    this.sprite.label = 'noah';
    this.sprite.anchor.set(ANCHOR.x / CELL_W, ANCHOR.y / CELL_H);
    this.sprite.scale.set(scale);
    this.sprite.eventMode = 'static';
    this.sprite.cursor = 'pointer';
    this.sprite.hitArea = new Rectangle(-ANCHOR.x - 4, -ANCHOR.y - 4, CELL_W + 8, CELL_H + 8);
    this.sprite.visible = false;
  }

  async load(resolution: number): Promise<void> {
    if (this.loaded) return;
    const base = `${import.meta.env.BASE_URL}sprites/personaje/noah/`;
    const suffix = sheetSuffix(resolution);
    await Promise.all(
      Object.entries(data.animaciones).map(async ([name, anim]) => {
        const file = anim.archivo1x.replace('@1x', suffix);
        this.frames.set(name, await loadStrip(base + file, `noah/${name}`, CELL_W, CELL_H, anim.frames.length));
      }),
    );
    this.loaded = true;
    this.layer.addChild(this.sprite);
    this.goIdle();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Waypoint in world px. */
  waypoint(name: Waypoint): { x: number; y: number } {
    const o = this.host.muroTopLeft();
    const [x, y] = WAYPOINTS[name]['1x'];
    return { x: o.x + x, y: o.y + y };
  }

  /** Fractional tile of Noah's feet. */
  tile(): { x: number; y: number } {
    return worldToTileFrac(this.x, this.y);
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sprite.visible = this.loaded && !hidden;
  }

  /** Starts the route; false while it is already playing. */
  talk(): boolean {
    if (!this.loaded || this.busy()) return false;
    this.phase = 'sequence';
    this.stepIndex = 0;
    this.k = 0;
    this.clock = 0;
    this.reached = [];
    this.runs += 1;
    this.advanceFrame();
    return true;
  }

  update(dt: number): void {
    if (!this.loaded || this.phase === 'idle') return;
    const period = 1 / FPS;
    this.clock += dt;
    while (this.clock >= period && this.busy()) {
      this.clock -= period;
      this.advanceFrame();
    }
  }

  private currentStep(): (Step & { mirror?: boolean }) | null {
    if (this.phase === 'sequence') return SEQUENCE[this.stepIndex];
    if (this.phase === 'return') return RETURN;
    return null;
  }

  /** One manifest frame: next anim frame and one linear step toward the step's waypoint. */
  private advanceFrame(): void {
    let step = this.currentStep();
    if (!step) return;
    if (this.k >= step.frames) {
      this.reached.push(step.to);
      if (this.phase === 'sequence' && this.stepIndex < SEQUENCE.length - 1) {
        this.stepIndex += 1;
      } else if (this.phase === 'sequence') {
        this.phase = 'return';
      } else {
        this.goIdle();
        return;
      }
      this.k = 0;
      step = this.currentStep()!;
    }
    this.k += 1;
    const to = this.waypoint(step.to);
    const from = step.from ? this.waypoint(step.from) : to;
    const t = this.k / step.frames;
    this.anim = step.anim;
    this.mirrored = !!step.mirror;
    const count = data.animaciones[step.anim as keyof typeof data.animaciones].frames.length;
    const loops = data.animaciones[step.anim as keyof typeof data.animaciones].loop;
    this.frame = loops ? (this.k - 1) % count : Math.min(this.k - 1, count - 1);
    this.place(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
  }

  private goIdle(): void {
    this.phase = 'idle';
    this.anim = 'idle';
    this.frame = 0;
    this.mirrored = false;
    this.k = 0;
    const p = this.waypoint(START);
    this.place(p.x, p.y);
  }

  private place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.sprite.position.set(Math.round(x), Math.round(y));
    this.sprite.scale.set(this.mirrored ? -this.scale : this.scale, this.scale);
    const list = this.frames.get(this.anim);
    if (list) this.sprite.texture = list[this.frame % list.length];
    this.syncDepth();
    this.sprite.visible = this.loaded && !this.hidden;
  }

  syncDepth(): void {
    if (ON_WALL.has(this.anim)) {
      this.sprite.zIndex = this.host.muroZIndex() + MURO_DEPTH_EPS;
      return;
    }
    const f = worldToTileFrac(this.x, this.y);
    this.sprite.zIndex = this.host.zIndexAt(f.x, f.y);
  }

  bindTap(handler: (e: import('pixi.js').FederatedPointerEvent) => void): void {
    this.sprite.on('pointertap', handler);
  }

  snapshot(): NoahSnapshot {
    const f = worldToTileFrac(this.x, this.y);
    const src = this.sprite.texture.source;
    const waypoints: Record<string, { x: number; y: number }> = {};
    for (const name of Object.keys(WAYPOINTS) as Waypoint[]) waypoints[name] = this.waypoint(name);
    return {
      loaded: this.loaded,
      phase: this.phase,
      step: this.stepIndex,
      anim: this.anim,
      frame: this.frame,
      mirrored: this.mirrored,
      onWall: ON_WALL.has(this.anim),
      x: this.x,
      y: this.y,
      fx: f.x,
      fy: f.y,
      zIndex: this.sprite.zIndex,
      visible: renderedVisible(this.sprite),
      worldW: Math.abs(this.sprite.width),
      worldH: this.sprite.height,
      scale: this.scale,
      filter: `${src.magFilter}/${src.minFilter}`,
      reached: [...this.reached],
      runs: this.runs,
      waypoints,
    };
  }
}
