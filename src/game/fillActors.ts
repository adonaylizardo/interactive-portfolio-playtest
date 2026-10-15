import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { FILL_ANIMS, type FillActor, type FillOverlay } from '../data/fill';
import npcsJson from '../data/npcs.json';
import { tileFootWorld, tileToWorld } from '../iso/math';
import { CHARACTER_WORLD_SCALE } from './npcs';

type Anim = { textures: Texture[]; fps: number; anchor: { x: number; y: number } };
type NpcAnim = { archivo2x: string; frames: number[]; fps: number };
type NpcDef = { id: string; ancla_pies: { x: number; y: number }; animaciones: Record<string, NpcAnim> };

const npcManifest = npcsJson as unknown as { celda: { w: number; h: number }; npcs: NpcDef[] };

export type FillActorSnapshot = {
  id: string;
  sprite: string;
  tx: number;
  ty: number;
  x: number;
  y: number;
  zIndex: number;
  frame: number;
  visible: boolean;
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

type Live = {
  id: string;
  key: string;
  tx: number;
  ty: number;
  sprite: Sprite;
  anim: Anim;
  phase: number;
  frame: number;
};

const PIXEL = { magFilter: 'nearest', minFilter: 'nearest', mipmapFilter: 'linear', autoGenerateMipmaps: true } as const;

/** Small stable per-id phase so neighbouring bots do not animate in lockstep. */
function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 997) / 997;
}

/**
 * Map-fill characters that stay on their cell (Grok bots, golfer, queue pedestrians) and the golf
 * ball overlay. Pixel art draws from the @2x strip at 2 world px per art px, feet on the cell centre,
 * sorted like walkers; the golfer and the ball share one clock so the putt lands in the hole.
 */
export class FillActors {
  private live: Live[] = [];
  private overlays: Live[] = [];
  private clock = 0;
  private loaded = false;
  private hidden = false;
  private view: { minX: number; maxX: number; minY: number; maxY: number } | null = null;
  private readonly layer: Container;
  private readonly defs: FillActor[];
  private readonly overlayDefs: FillOverlay[];
  private readonly zIndexAt: (fx: number, fy: number) => number;
  private readonly still: boolean;

  constructor(
    layer: Container,
    defs: FillActor[],
    overlayDefs: FillOverlay[],
    zIndexAt: (fx: number, fy: number) => number,
    still: boolean,
  ) {
    this.layer = layer;
    this.defs = defs;
    this.overlayDefs = overlayDefs;
    this.zIndexAt = zIndexAt;
    this.still = still;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async load(resolution: number): Promise<void> {
    const base = import.meta.env.BASE_URL;
    const strip = async (alias: string, src: string, cell: { w: number; h: number }, frames: number[], pixel: boolean) => {
      const tex = await Assets.load<Texture>({ alias, src, data: pixel ? PIXEL : { autoGenerateMipmaps: true, scaleMode: 'linear' } });
      return frames.map((i) => new Texture({ source: tex.source, frame: new Rectangle(i * cell.w, 0, cell.w, cell.h) }));
    };
    const animFor = async (key: string): Promise<Anim> => {
      if (key.startsWith('npc:')) {
        const [id, name] = key.slice(4).split('/');
        const def = npcManifest.npcs.find((n) => n.id === id);
        const a = def?.animaciones[name];
        if (!def || !a) throw new Error(`fill: no NPC animation ${key}`);
        const textures = await strip(`npc/${id}/${name}`, `${base}sprites/personaje/npcs/${a.archivo2x}`, npcManifest.celda, a.frames, true);
        return { textures, fps: a.fps, anchor: def.ancla_pies };
      }
      const a = FILL_ANIMS[key];
      const textures = await strip(`fill:${key}`, `${base}sprites/${a.f2}`, a.cell, a.frames, true);
      return { textures, fps: a.fps, anchor: a.anchor! };
    };

    this.live = await Promise.all(
      this.defs.map(async (d) => {
        const anim = await animFor(d.sprite);
        const sprite = new Sprite(anim.textures[0]);
        sprite.eventMode = 'none';
        sprite.label = `fill:${d.id}`;
        sprite.anchor.set(anim.anchor.x / anim.textures[0].frame.width, anim.anchor.y / anim.textures[0].frame.height);
        sprite.scale.set(CHARACTER_WORLD_SCALE);
        const c = tileToWorld(d.x, d.y);
        sprite.position.set(c.x, c.y);
        sprite.zIndex = this.zIndexAt(d.x, d.y);
        this.layer.addChild(sprite);
        const golf = d.id.startsWith('golf');
        return { id: d.id, key: d.sprite, tx: d.x, ty: d.y, sprite, anim, phase: golf ? 0 : phaseOf(d.id), frame: 0 };
      }),
    );

    this.overlays = await Promise.all(
      this.overlayDefs.map(async (o) => {
        const a = FILL_ANIMS[o.anim];
        const textures = await strip(`fill:${o.anim}`, `${base}sprites/${resolution >= 1.5 ? a.f2 : a.f1}`, a.cell, a.frames, false);
        const sprite = new Sprite(textures[0]);
        sprite.eventMode = 'none';
        sprite.label = `fill:${o.id}:overlay`;
        const s = tileFootWorld(o.front.x, o.front.y);
        sprite.position.set(s.x - a.vfs!.x, s.y - a.vfs!.y);
        sprite.zIndex = -9.5;
        this.layer.addChild(sprite);
        return { id: `${o.id}:overlay`, key: o.anim, tx: o.front.x, ty: o.front.y, sprite, anim: { textures, fps: a.fps, anchor: { x: 0, y: 0 } }, phase: 0, frame: 0 };
      }),
    );
    this.loaded = true;
    this.applyVisibility();
    this.update(0);
  }

  update(dt: number): void {
    if (!this.loaded) return;
    if (!this.still) this.clock += dt;
    for (const l of [...this.live, ...this.overlays]) {
      const n = l.anim.textures.length;
      const f = this.still || !l.anim.fps ? 0 : Math.floor((this.clock + l.phase) * l.anim.fps) % n;
      if (f === l.frame && dt) continue;
      l.frame = f;
      l.sprite.texture = l.anim.textures[f];
    }
  }

  cull(view: { minX: number; maxX: number; minY: number; maxY: number }, hideAll: boolean): void {
    this.view = view;
    this.hidden = hideAll;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const v = this.view;
    for (const l of [...this.live, ...this.overlays]) {
      const b = this.boundsOf(l);
      l.sprite.visible = !this.hidden && (!v || (b.x1 >= v.minX && b.x0 <= v.maxX && b.y1 >= v.minY && b.y0 <= v.maxY));
    }
  }

  private boundsOf(l: Live): { x0: number; y0: number; x1: number; y1: number } {
    const s = l.sprite;
    const w = s.texture.frame.width * s.scale.x;
    const h = s.texture.frame.height * s.scale.y;
    const x0 = s.position.x - s.anchor.x * w;
    const y0 = s.position.y - s.anchor.y * h;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  }

  snapshot(): FillActorSnapshot[] {
    return [...this.live, ...this.overlays].map((l) => ({
      id: l.id,
      sprite: l.key,
      tx: l.tx,
      ty: l.ty,
      x: l.sprite.position.x,
      y: l.sprite.position.y,
      zIndex: l.sprite.zIndex,
      frame: l.frame,
      visible: l.sprite.visible,
      bounds: this.boundsOf(l),
    }));
  }
}
