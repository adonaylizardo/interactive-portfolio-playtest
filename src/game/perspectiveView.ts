/**
 * Behind-character camera for `perspectiva`. Affine Pixi 2.5D (R*S on the iso map) cannot
 * produce a horizon or 1/z, so this mode draws a small 3D projector in Pixi: textured boxes
 * from exterior sprites, a ground plane, and screen-space character billboards.
 */
import { Container, Graphics, PerspectiveMesh, Rectangle, Texture } from 'pixi.js';
import type { MapCell, MapObject } from '../data/world';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/world';
import { objectSpriteKey } from './mapSprites';
import { hasSprite, spritesLoaded, spriteTexture } from './sprites';
import { objectRisePx } from './altView';
import type { FacingDir } from './player';

export const TILE_M = 2;
export const EYE_H_M = 2.2;
export const LOOK_Y_M = 1.45;
export const LOOK_AHEAD_M = 14;
export const FOV_Y = (62 * Math.PI) / 180;
export const NEAR_M = 0.45;
const GROUND_R = 18;
const BUILDING_R = 22;

const GROUND: Record<string, number> = {
  street: 0x4a4c52,
  park: 0x3d4a38,
  soil: 0x5c5e64,
  block: 0x2c2e34,
};

const WALL: Record<string, number> = {
  estudio: 0x2a2c32,
  volaris: 0x3a424c,
  bain: 0x4a463c,
  mentoria: 0x3a4a42,
  finoa: 0x4a4038,
  pg: 0x3a3a48,
  sambil: 0x3a3c4a,
  catedral: 0x5a544c,
  flor: 0x4a5a42,
};

const ROOF: Record<string, number> = {
  estudio: 0x3a3c42,
  volaris: 0x4a5460,
  bain: 0x5a5448,
  mentoria: 0x4a5a52,
  finoa: 0x5a4e44,
  pg: 0x4a4a58,
  sambil: 0x4a4c5a,
  catedral: 0x6a645c,
  flor: 0x5a6a52,
};

type Vec3 = { x: number; y: number; z: number };

export type PerspCam = {
  eye: Vec3;
  right: Vec3;
  up: Vec3;
  forward: Vec3;
  fovY: number;
};

export type PerspHit = { x: number; y: number; z: number; scale: number };

const FORWARD: Record<FacingDir, Vec3> = {
  nw: { x: -1, y: 0, z: -1 },
  ne: { x: 1, y: 0, z: -1 },
  se: { x: 1, y: 0, z: 1 },
  sw: { x: -1, y: 0, z: 1 },
};

function len(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z) || 1;
}

function norm(v: Vec3): Vec3 {
  const L = len(v);
  return { x: v.x / L, y: v.y / L, z: v.z / L };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function shade(color: number, mul: number): number {
  const r = Math.max(0, Math.min(255, Math.round(((color >> 16) & 255) * mul)));
  const g = Math.max(0, Math.min(255, Math.round(((color >> 8) & 255) * mul)));
  const b = Math.max(0, Math.min(255, Math.round((color & 255) * mul)));
  return (r << 16) | (g << 8) | b;
}

function yawForward(dir: FacingDir, userYaw: number): Vec3 {
  const order: FacingDir[] = ['nw', 'ne', 'se', 'sw'];
  const i = (order.indexOf(dir) + ((userYaw % 4) + 4) % 4) % 4;
  return norm(FORWARD[order[i]]);
}

export function distanceFromZoom(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - 0.4) / 1.1));
  return 12.5 - t * 7.5;
}

export function makePerspCam(
  tx: number,
  ty: number,
  dir: FacingDir,
  userYaw: number,
  zoom: number,
  overview: boolean,
): PerspCam {
  const f = yawForward(dir, userYaw);
  const px = tx * TILE_M;
  const pz = ty * TILE_M;
  const back = overview ? 28 : distanceFromZoom(zoom);
  const eyeY = overview ? 22 : EYE_H_M;
  const lookY = overview ? 0.4 : LOOK_Y_M;
  const ahead = overview ? 2 : LOOK_AHEAD_M;
  const eye: Vec3 = { x: px - f.x * back, y: eyeY, z: pz - f.z * back };
  const target: Vec3 = { x: px + f.x * ahead, y: lookY, z: pz + f.z * ahead };
  const forward = norm({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z });
  const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
  let right = cross(worldUp, forward);
  if (len(right) < 1e-4) right = { x: f.z, y: 0, z: -f.x };
  right = norm(right);
  const up = norm(cross(forward, right));
  return { eye, right, up, forward, fovY: overview ? (50 * Math.PI) / 180 : FOV_Y };
}

export function projectPersp(p: Vec3, cam: PerspCam, sw: number, sh: number): PerspHit | null {
  const dx = p.x - cam.eye.x;
  const dy = p.y - cam.eye.y;
  const dz = p.z - cam.eye.z;
  const cx = dx * cam.right.x + dy * cam.right.y + dz * cam.right.z;
  const cy = dx * cam.up.x + dy * cam.up.y + dz * cam.up.z;
  const cz = dx * cam.forward.x + dy * cam.forward.y + dz * cam.forward.z;
  if (cz < NEAR_M) return null;
  const f = 1 / Math.tan(cam.fovY / 2);
  const ndcX = (cx / cz) * f * (sh / sw);
  const ndcY = (cy / cz) * f;
  return {
    x: (ndcX * 0.5 + 0.5) * sw,
    y: (0.5 - ndcY * 0.5) * sh,
    z: cz,
    scale: (f * sh * 0.5) / cz,
  };
}

export function unprojectGround(
  sx: number,
  sy: number,
  cam: PerspCam,
  sw: number,
  sh: number,
): { tx: number; ty: number } | null {
  const f = 1 / Math.tan(cam.fovY / 2);
  const ndcX = (sx / sw) * 2 - 1;
  const ndcY = 1 - (sy / sh) * 2;
  const dir: Vec3 = {
    x: cam.right.x * ((ndcX * sw) / sh / f) + cam.up.x * (ndcY / f) + cam.forward.x,
    y: cam.right.y * ((ndcX * sw) / sh / f) + cam.up.y * (ndcY / f) + cam.forward.y,
    z: cam.right.z * ((ndcX * sw) / sh / f) + cam.up.z * (ndcY / f) + cam.forward.z,
  };
  if (Math.abs(dir.y) < 1e-5) return null;
  const t = -cam.eye.y / dir.y;
  if (t < NEAR_M) return null;
  return { tx: (cam.eye.x + dir.x * t) / TILE_M, ty: (cam.eye.z + dir.z * t) / TILE_M };
}

function riseM(o: MapObject): number {
  if (o.name === 'tree') return o.variant === 'cipres' ? 5.4 : 3.6;
  if (o.name === 'lamp') return 3.1;
  if (o.name === 'obelisco') return 14;
  if (o.name === 'muro') return 2.3;
  if (o.name === 'bench') return 0.45;
  if (o.flat || o.name === 'redoma') return 0.12;
  if (o.type === 'building') {
    const span = (o.w ?? 1) + (o.h ?? 1);
    return Math.max(4.4, Math.min(7.2, span * 0.36));
  }
  return Math.max(1.2, objectRisePx(o) / 28);
}

function groundColor(cell: MapCell | undefined): number {
  if (!cell) return GROUND.block;
  const id = cell.groundId;
  if (id.includes('path/street')) return GROUND.street;
  if (id.includes('park')) return GROUND.park;
  if (cell.walkable) return GROUND.soil;
  return GROUND.block;
}

type Facade = { south: Texture; east: Texture };

const facadeCache = new Map<string, Facade>();

function facadesFor(o: MapObject): Facade | null {
  const key = objectSpriteKey(o, 'default', false);
  if (!key || !hasSprite(key) || !spritesLoaded(key)) return null;
  let hit = facadeCache.get(key);
  if (hit) return hit;
  const tex = spriteTexture(key);
  const fr = tex.frame;
  const left = new Texture({
    source: tex.source,
    frame: new Rectangle(fr.x, fr.y + fr.height * 0.28, Math.max(1, fr.width * 0.52), Math.max(1, fr.height * 0.72)),
  });
  const right = new Texture({
    source: tex.source,
    frame: new Rectangle(
      fr.x + fr.width * 0.48,
      fr.y + fr.height * 0.28,
      Math.max(1, fr.width * 0.52),
      Math.max(1, fr.height * 0.72),
    ),
  });
  hit = { south: left, east: right };
  facadeCache.set(key, hit);
  return hit;
}

function poly(g: Graphics, pts: PerspHit[], fill: number, alpha = 1): void {
  if (pts.length < 3) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill({ color: fill, alpha });
}

export type PerspSync = {
  active: boolean;
  tx: number;
  ty: number;
  dir: FacingDir;
  userYaw: number;
  zoom: number;
  overview: boolean;
  sw: number;
  sh: number;
  cells: MapCell[][];
  objects: readonly MapObject[];
  hoverId: string | null;
};

export class PerspectiveView {
  readonly layer = new Container();
  private readonly sky = new Graphics();
  private readonly world3d = new Container();
  private readonly gfxPool: Graphics[] = [];
  private gfxUsed = 0;
  private readonly meshPool: PerspectiveMesh[] = [];
  private meshUsed = 0;
  cam: PerspCam | null = null;
  sw = 1;
  sh = 1;

  constructor() {
    this.layer.label = 'perspective-view';
    this.layer.eventMode = 'none';
    this.layer.visible = false;
    this.world3d.sortableChildren = true;
    this.layer.addChild(this.sky, this.world3d);
  }

  private takeGfx(): Graphics {
    let g = this.gfxPool[this.gfxUsed];
    if (!g) {
      g = new Graphics();
      g.eventMode = 'none';
      this.world3d.addChild(g);
      this.gfxPool.push(g);
    }
    g.visible = true;
    g.clear();
    this.gfxUsed += 1;
    return g;
  }

  private takeMesh(tex: Texture): PerspectiveMesh {
    let m = this.meshPool[this.meshUsed];
    if (!m) {
      m = new PerspectiveMesh({ texture: tex, verticesX: 6, verticesY: 6 });
      m.eventMode = 'none';
      this.world3d.addChild(m);
      this.meshPool.push(m);
    } else {
      m.texture = tex;
      m.visible = true;
    }
    this.meshUsed += 1;
    return m;
  }

  private endPools(): void {
    for (let i = this.gfxUsed; i < this.gfxPool.length; i++) this.gfxPool[i].visible = false;
    for (let i = this.meshUsed; i < this.meshPool.length; i++) this.meshPool[i].visible = false;
  }

  project(tx: number, ty: number, y: number): PerspHit | null {
    if (!this.cam) return null;
    return projectPersp({ x: tx * TILE_M, y, z: ty * TILE_M }, this.cam, this.sw, this.sh);
  }

  playerScreen(tx: number, ty: number, y = 0): PerspHit | null {
    return this.project(tx, ty, y);
  }

  unproject(sx: number, sy: number): { tx: number; ty: number } | null {
    if (!this.cam) return null;
    return unprojectGround(sx, sy, this.cam, this.sw, this.sh);
  }

  sync(s: PerspSync): void {
    this.layer.visible = s.active;
    if (!s.active) {
      this.cam = null;
      return;
    }
    this.sw = s.sw;
    this.sh = s.sh;
    this.cam = makePerspCam(s.tx, s.ty, s.dir, s.userYaw, s.zoom, s.overview);
    this.gfxUsed = 0;
    this.meshUsed = 0;
    this.paintSky();
    this.paintGround(s);
    this.paintObjects(s);
    this.endPools();
  }

  private paintSky(): void {
    const g = this.sky;
    g.clear();
    const h = this.sh;
    const w = this.sw;
    g.rect(0, 0, w, h);
    g.fill({ color: 0x5a6572 });
    g.rect(0, 0, w, h * 0.42);
    g.fill({ color: 0x6a7684 });
    g.rect(0, h * 0.38, w, h * 0.16);
    g.fill({ color: 0x8a929c, alpha: 0.55 });
  }

  private paintGround(s: PerspSync): void {
    const x0 = Math.max(0, Math.floor(s.tx) - GROUND_R);
    const x1 = Math.min(MAP_WIDTH - 1, Math.floor(s.tx) + GROUND_R);
    const y0 = Math.max(0, Math.floor(s.ty) - GROUND_R);
    const y1 = Math.min(MAP_HEIGHT - 1, Math.floor(s.ty) + GROUND_R);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const p00 = this.project(tx - 0.5, ty - 0.5, 0);
        const p10 = this.project(tx + 0.5, ty - 0.5, 0);
        const p11 = this.project(tx + 0.5, ty + 0.5, 0);
        const p01 = this.project(tx - 0.5, ty + 0.5, 0);
        if (!p00 || !p10 || !p11 || !p01) continue;
        const z = (p00.z + p10.z + p11.z + p01.z) / 4;
        const g = this.takeGfx();
        g.zIndex = Math.round(20_000 - z * 40);
        poly(g, [p00, p10, p11, p01], groundColor(s.cells[ty]?.[tx]));
      }
    }
  }

  private paintObjects(s: PerspSync): void {
    const hover = s.hoverId;
    for (const o of s.objects) {
      const fx = o.footprintX ?? o.x;
      const fy = o.footprintY ?? o.y;
      const w = o.w ?? 1;
      const h = o.h ?? 1;
      const cx = fx + (w - 1) / 2;
      const cy = fy + (h - 1) / 2;
      if (Math.hypot(cx - s.tx, cy - s.ty) > BUILDING_R) continue;
      const lit = o.id === hover || o.name === hover;
      if (o.name === 'tree') {
        this.paintTree(cx, cy, o, lit);
        continue;
      }
      if (o.name === 'lamp') {
        this.paintLamp(cx, cy, lit);
        continue;
      }
      if (o.name === 'bench') {
        this.paintBench(fx, fy, w, h, o.variant === 'der');
        continue;
      }
      if (o.name === 'redoma' || o.flat) {
        this.paintFlat(fx, fy, w, h, o);
        continue;
      }
      this.paintBox(o, fx, fy, w, h, lit);
    }
  }

  private paintTree(tx: number, ty: number, o: MapObject, lit: boolean): void {
    const z = riseM(o);
    const trunk = this.project(tx, ty, 0);
    const top = this.project(tx, ty, z);
    if (!trunk || !top) return;
    const g = this.takeGfx();
    g.zIndex = Math.round(20_000 - trunk.z * 40);
    const tw = Math.max(2, trunk.scale * 0.18);
    g.rect(trunk.x - tw / 2, top.y, tw, trunk.y - top.y);
    g.fill({ color: 0x5a5046 });
    const r = (o.variant === 'cipres' ? 0.7 : 1.4) * top.scale;
    g.ellipse(top.x, top.y, r, r * (o.variant === 'cipres' ? 1.4 : 0.75));
    g.fill({ color: lit ? 0x7a8a6a : 0x5a6e54 });
  }

  private paintLamp(tx: number, ty: number, lit: boolean): void {
    const base = this.project(tx, ty, 0);
    const top = this.project(tx, ty, 3.1);
    if (!base || !top) return;
    const g = this.takeGfx();
    g.zIndex = Math.round(20_000 - base.z * 40);
    const w = Math.max(2, base.scale * 0.08);
    g.rect(base.x - w / 2, top.y, w, base.y - top.y);
    g.fill({ color: 0x8a8e96 });
    g.circle(top.x, top.y, Math.max(3, top.scale * 0.18));
    g.fill({ color: lit ? 0xf2f0c8 : 0xd8dce4 });
  }

  private paintBench(fx: number, fy: number, w: number, h: number, alongX: boolean): void {
    const tx = fx + (w - 1) / 2;
    const ty = fy + (h - 1) / 2;
    const p = this.project(tx, ty, 0.2);
    if (!p) return;
    const g = this.takeGfx();
    g.zIndex = Math.round(20_000 - p.z * 40);
    const bw = p.scale * (alongX ? 1.4 : 0.45);
    const bh = p.scale * 0.18;
    g.rect(p.x - bw / 2, p.y - bh, bw, bh);
    g.fill({ color: 0x6a6e74 });
  }

  private paintFlat(fx: number, fy: number, w: number, h: number, o: MapObject): void {
    const p00 = this.project(fx - 0.5, fy - 0.5, 0.05);
    const p10 = this.project(fx + w - 0.5, fy - 0.5, 0.05);
    const p11 = this.project(fx + w - 0.5, fy + h - 0.5, 0.05);
    const p01 = this.project(fx - 0.5, fy + h - 0.5, 0.05);
    if (!p00 || !p10 || !p11 || !p01) return;
    const g = this.takeGfx();
    g.zIndex = Math.round(20_000 - ((p00.z + p11.z) / 2) * 40);
    poly(g, [p00, p10, p11, p01], o.name === 'redoma' ? 0x4a5a48 : 0x3a4a3a, 0.92);
  }

  private paintBox(o: MapObject, fx: number, fy: number, w: number, h: number, lit: boolean): void {
    const z = riseM(o);
    const x0 = fx - 0.5;
    const y0 = fy - 0.5;
    const x1 = fx + w - 0.5;
    const y1 = fy + h - 0.5;
    const corners = [
      this.project(x0, y0, 0),
      this.project(x1, y0, 0),
      this.project(x1, y1, 0),
      this.project(x0, y1, 0),
      this.project(x0, y0, z),
      this.project(x1, y0, z),
      this.project(x1, y1, z),
      this.project(x0, y1, z),
    ];
    const roofPts = [corners[4], corners[5], corners[6], corners[7]];
    if (roofPts.every(Boolean)) {
      const g = this.takeGfx();
      const zAvg = roofPts.reduce((a, p) => a + p!.z, 0) / 4;
      g.zIndex = Math.round(20_000 - zAvg * 40);
      const roof = shade(ROOF[o.name] ?? 0x4a4c52, lit ? 1.12 : 1);
      poly(g, roofPts as PerspHit[], roof);
      g.moveTo(roofPts[0]!.x, roofPts[0]!.y);
      g.lineTo(roofPts[1]!.x, roofPts[1]!.y);
      g.lineTo(roofPts[2]!.x, roofPts[2]!.y);
      g.lineTo(roofPts[3]!.x, roofPts[3]!.y);
      g.closePath();
      g.stroke({ width: 1.25, color: shade(roof, 0.62), alpha: 0.95 });
    }

    const facades = o.type === 'building' ? facadesFor(o) : null;
    const wall = shade(WALL[o.name] ?? 0x3a3c42, lit ? 1.1 : 1);
    const faces: { bl: number; br: number; tr: number; tl: number; tex: Texture | null; tint: number }[] = [
      { bl: 3, br: 2, tr: 6, tl: 7, tex: facades?.south ?? null, tint: 1 },
      { bl: 2, br: 1, tr: 5, tl: 6, tex: facades?.east ?? null, tint: 0.92 },
      { bl: 1, br: 0, tr: 4, tl: 5, tex: facades?.south ?? null, tint: 0.72 },
      { bl: 0, br: 3, tr: 7, tl: 4, tex: facades?.east ?? null, tint: 0.78 },
    ];
    for (const face of faces) {
      const bl = corners[face.bl];
      const br = corners[face.br];
      const tr = corners[face.tr];
      const tl = corners[face.tl];
      if (!bl || !br || !tr || !tl) continue;
      const zAvg = (bl.z + br.z + tr.z + tl.z) / 4;
      const zIndex = Math.round(20_000 - zAvg * 40) + 1;
      if (face.tex) {
        const m = this.takeMesh(face.tex);
        m.tint = shade(0xffffff, face.tint);
        m.zIndex = zIndex;
        m.setCorners(tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y);
      } else {
        const g = this.takeGfx();
        g.zIndex = zIndex;
        poly(g, [bl, br, tr, tl], shade(wall, face.tint));
      }
    }
  }
}

export function billboardHeightM(label: string): number {
  if (label === 'adonay') return 1.72;
  if (label === 'pantone') return 0.52;
  if (label === 'noah') return 1.38;
  if (label.includes('jac')) return 1.55;
  return 1.62;
}
