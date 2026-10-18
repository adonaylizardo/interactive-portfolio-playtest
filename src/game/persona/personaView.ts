import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { MapObject } from '../../data/world';
import { objects } from '../../data/map';
import type { FacingDir } from '../player';
import {
  BEHIND_TP_M,
  CAL_M,
  CAL_TILE,
  EYE_JAC_M,
  EYE_TP_M,
  FACADE_BY_BUILDING,
  FEET_Y_1X,
  FOCAL_PX_1X,
  HORIZON_Y_1X,
  METERS_PER_TILE,
  PANTONE_SCALE,
  PERSONA_REF,
  PX_PER_M,
  piezaById,
  WHEEL_POS_1X,
} from './personaSpec';
import {
  ensurePersonaBoot,
  loadFacade,
  loadJacCabin,
  loadProp,
  loadStrip,
  personaAssetReport,
  textureFrame,
} from './personaAssets';

const NIGHT_TINT = 0xccd1e6;

export type PersonaAnim = 'idle' | 'walk' | 'sit';

export type PersonaFrameInput = {
  sw: number;
  sh: number;
  dpr: number;
  charTx: number;
  charTy: number;
  facing: FacingDir;
  yawQuarter: number;
  /** Continuous camera yaw (radians); drives chase cam when set. */
  yawRad?: number;
  walking: boolean;
  idleSec: number;
  jacDriving: boolean;
  jacLightsOn: boolean;
  steer: number;
  timeSec: number;
};

type FacadeSlot = { sprite: Sprite; building: string; x: number; z: number };

function tileToPersonaMeters(tx: number, ty: number): { x: number; z: number } {
  return {
    x: CAL_M.x + (tx - CAL_TILE.x) * METERS_PER_TILE,
    z: CAL_M.z + (ty - CAL_TILE.y) * METERS_PER_TILE,
  };
}

function forwardFromYawRad(yawRad: number): { x: number; z: number } {
  return { x: Math.sin(yawRad), z: Math.cos(yawRad) };
}

function projectTp(
  wx: number,
  wy: number,
  wz: number,
  cam: { x: number; z: number },
  sw: number,
  sh: number,
): { x: number; y: number; scale: number } | null {
  const f = FOCAL_PX_1X * (sw / PERSONA_REF.w);
  const horY = HORIZON_Y_1X * (sh / PERSONA_REF.h);
  const dx = wx - cam.x;
  const dz = wz - cam.z;
  if (dz < 0.4) return null;
  return {
    x: sw / 2 + (dx * f) / dz,
    y: horY - ((wy - EYE_TP_M) * f) / dz,
    scale: f / (dz * PX_PER_M),
  };
}

function buildingFacadeAnchor(b: MapObject): { x: number; z: number } | null {
  const id = b.name ?? '';
  if (!FACADE_BY_BUILDING[id]) return null;
  const fx = (b.footprintX ?? b.x) + (b.w ?? 1) / 2;
  const fy = (b.footprintY ?? b.y) + (b.h ?? 1) / 2;
  const door = b.door;
  let tx = fx;
  let ty = fy + 2;
  if (door) {
    tx = door.x;
    ty = door.y + 1.5;
  }
  return tileToPersonaMeters(tx, ty);
}

export class PersonaView {
  readonly layer = new Container();
  private sky: TilingSprite | null = null;
  private avila: TilingSprite | null = null;
  private ground = new Graphics();
  private facades: FacadeSlot[] = [];
  private adonay = new Sprite();
  private pantone = new Sprite();
  private jacCapo = new Sprite();
  private jacCabina = new Sprite();
  private jacWheel = new Sprite();
  private jacT9Ext = new Sprite();
  private propSprites: { sprite: Sprite; x: number; z: number }[] = [];
  private lastGroundKey = '';
  private facadeTick = 0;
  private booted = false;
  private adonayStrip: { idle: import('pixi.js').Texture | null; walk: import('pixi.js').Texture | null } = {
    idle: null,
    walk: null,
  };
  private pantoneStrip: {
    idle: import('pixi.js').Texture | null;
    walk: import('pixi.js').Texture | null;
    sit: import('pixi.js').Texture | null;
  } = { idle: null, walk: null, sit: null };
  lastPantoneVisible = false;
  lastPantoneAnim: PersonaAnim = 'idle';
  lastJacCabin = false;

  constructor() {
    this.layer.label = 'persona-view';
    this.layer.eventMode = 'none';
    this.layer.interactiveChildren = false;
    this.layer.sortableChildren = true;
    this.layer.addChild(this.ground);
    this.adonay.zIndex = 800;
    this.pantone.zIndex = 750;
    this.jacCapo.zIndex = 900;
    this.jacCabina.zIndex = 910;
    this.jacWheel.zIndex = 920;
    this.jacT9Ext.zIndex = 600;
    this.layer.addChild(this.adonay, this.pantone, this.jacT9Ext, this.jacCapo, this.jacCabina, this.jacWheel);
    this.jacCapo.visible = this.jacCabina.visible = this.jacWheel.visible = false;
  }

  assetReport(): ReturnType<typeof personaAssetReport> {
    return personaAssetReport();
  }

  async ensureLoaded(dpr: number): Promise<void> {
    await ensurePersonaBoot(dpr);
    if (this.booted) return;
    this.adonayStrip.idle = await loadStrip('adonay-espalda__idle', dpr);
    this.adonayStrip.walk = await loadStrip('adonay-espalda__walk', dpr);
    this.pantoneStrip.idle = await loadStrip('pantone-espalda__idle', dpr);
    this.pantoneStrip.walk = await loadStrip('pantone-espalda__walk', dpr);
    this.pantoneStrip.sit = await loadStrip('pantone-espalda__sit', dpr);
    const cielo = await loadStrip('cielo-noche__tile', dpr);
    const avila = await loadStrip('cerros-avila__tile', dpr);
    if (cielo) {
      this.sky = new TilingSprite({ texture: cielo, width: 4096, height: 400 * (dpr >= 2 ? 0.5 : 1) });
      this.sky.zIndex = -1e9;
      this.layer.addChildAt(this.sky, 0);
    }
    if (avila) {
      this.avila = new TilingSprite({ texture: avila, width: 4096, height: 128 * (dpr >= 2 ? 0.5 : 1) });
      this.avila.zIndex = -1e8;
      this.layer.addChildAt(this.avila, this.sky ? 1 : 0);
    }
    await this.refreshFacades(dpr);
    const t9Tex = await loadProp('jac-t9-ext__34-frontal-3p__apagado', dpr);
    if (t9Tex) {
      this.jacT9Ext.texture = t9Tex;
      this.jacT9Ext.anchor.set(0.5, 1);
      this.jacT9Ext.visible = true;
    }
    const propPlacements: { file: string; id: string; x: number; z: number }[] = [
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 1.3, z: 30 },
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 1.3, z: 15.5 },
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 11.8, z: 24 },
      { file: 'arbol-cuji-frente', id: 'arbol-cuji-frente', x: -5.2, z: 31 },
      { file: 'arbol-cuji-frente', id: 'arbol-cuji-frente', x: 17.5, z: 17 },
      { file: 'banco-frente', id: 'banco-frente', x: -4.3, z: 28.5 },
    ];
    for (const pl of propPlacements) {
      const tex = await loadProp(pl.file, dpr);
      if (!tex) continue;
      const meta = piezaById(pl.id);
      const ancla = meta?.ancla?.px_1x ?? [tex.width / 2, tex.height - 1];
      const sp = new Sprite(tex);
      sp.anchor.set(ancla[0] / tex.width, ancla[1] / tex.height);
      sp.tint = NIGHT_TINT;
      sp.zIndex = 500;
      this.layer.addChild(sp);
      this.propSprites.push({ sprite: sp, x: pl.x, z: pl.z });
    }
    this.booted = true;
  }

  private async refreshFacades(dpr: number): Promise<void> {
    for (const f of this.facades) f.sprite.destroy();
    this.facades = [];
    for (const o of objects) {
      if (o.type !== 'building') continue;
      const anchor = buildingFacadeAnchor(o);
      const facadeId = FACADE_BY_BUILDING[o.name ?? ''];
      if (!anchor || !facadeId) continue;
      const tex = await loadFacade(facadeId, true, dpr);
      if (!tex) continue;
      const meta = piezaById(facadeId);
      const ancla = meta?.ancla?.px_1x ?? [tex.width / 2, tex.height - 1];
      const sp = new Sprite(tex);
      sp.anchor.set(ancla[0] / tex.width, ancla[1] / tex.height);
      sp.tint = NIGHT_TINT;
      sp.zIndex = -Math.round(anchor.z * 10);
      this.layer.addChild(sp);
      this.facades.push({ sprite: sp, building: o.name ?? '', x: anchor.x, z: anchor.z });
    }
  }

  private drawGround(cam: { x: number; z: number }, sw: number, sh: number): void {
    const key = `${Math.round(cam.x * 2) / 2}:${Math.round(cam.z * 4) / 4}`;
    if (key === this.lastGroundKey) return;
    this.lastGroundKey = key;
    this.ground.clear();
    const stripes = 16;
    for (let i = 0; i < stripes; i++) {
      const z0 = cam.z + i * 3;
      const z1 = z0 + 3;
      const p0 = projectTp(0, 0, z0, cam, sw, sh);
      const p1 = projectTp(0, 0, z1, cam, sw, sh);
      if (!p0 || !p1) continue;
      const yTop = Math.min(p0.y, p1.y);
      const yBot = Math.max(p0.y, p1.y);
      const col = i % 2 === 0 ? 0x2a2c32 : 0x32343a;
      this.ground.rect(0, yTop, sw, Math.max(2, yBot - yTop)).fill({ color: col, alpha: 0.95 });
    }
    this.ground.zIndex = -500;
  }

  private syncBackdrops(sw: number, sh: number, yawQ: number): void {
    const parallax = (-yawQ * 2048) / 4;
    if (this.sky) {
      this.sky.width = sw * 2;
      this.sky.height = sh * 0.55;
      this.sky.tilePosition.x = parallax * (sw / PERSONA_REF.w);
      this.sky.y = 0;
    }
    if (this.avila) {
      const portrait = sh > sw;
      this.avila.visible = !portrait;
      if (!portrait) {
        this.avila.width = sw * 2;
        this.avila.height = sh * 0.18;
        this.avila.tilePosition.x = parallax * (sw / PERSONA_REF.w);
        this.avila.y = HORIZON_Y_1X * (sh / PERSONA_REF.h) - this.avila.height * 0.85;
      }
    }
  }

  async sync(input: PersonaFrameInput): Promise<void> {
    const { sw, sh, dpr } = input;
    await this.ensureLoaded(dpr);
    const player = tileToPersonaMeters(input.charTx, input.charTy);
    const yawRad = input.yawRad ?? input.yawQuarter * (Math.PI / 2);
    const fwd = forwardFromYawRad(yawRad);
    const cam = { x: player.x - fwd.x * BEHIND_TP_M, z: player.z - fwd.z * BEHIND_TP_M };

    this.syncBackdrops(sw, sh, yawRad / (Math.PI / 2));
    this.drawGround(cam, sw, sh);

    this.facadeTick += 1;
    const heavyFacades = input.walking || this.facadeTick % 2 === 0;
    for (const f of this.facades) {
      if (Math.abs(f.z - player.z) > 52) {
        f.sprite.visible = false;
        continue;
      }
      if (!heavyFacades) continue;
      const p = projectTp(f.x, 0, f.z, cam, sw, sh);
      if (!p || p.scale < 0.07) {
        f.sprite.visible = false;
        continue;
      }
      f.sprite.visible = true;
      f.sprite.x = p.x;
      f.sprite.y = p.y;
      f.sprite.scale.set(p.scale);
      f.sprite.zIndex = -Math.round(f.z * 10);
    }

    if (input.jacDriving) {
      this.adonay.visible = false;
      this.pantone.visible = false;
      this.lastJacCabin = true;
      this.lastPantoneVisible = false;
      await this.syncJacCabin(input, sw, sh, dpr);
      return;
    }

    this.lastJacCabin = false;
    this.jacCapo.visible = this.jacCabina.visible = this.jacWheel.visible = false;
    this.adonay.visible = true;
    this.pantone.visible = true;

    const feetY = FEET_Y_1X * (sh / PERSONA_REF.h);
    const adonayAnim = input.walking ? 'walk' : 'idle';
    const strip = adonayAnim === 'walk' ? this.adonayStrip.walk : this.adonayStrip.idle;
    if (strip) {
      const frameW = strip.width / (adonayAnim === 'walk' ? 4 : 2);
      const fi = Math.floor(input.timeSec * (adonayAnim === 'walk' ? 9 : 3)) % (adonayAnim === 'walk' ? 4 : 2);
      this.adonay.texture = textureFrame(strip, frameW, fi);
      this.adonay.anchor.set(0.5, 1);
      this.adonay.x = sw / 2;
      this.adonay.y = feetY;
      this.adonay.scale.set(sh / PERSONA_REF.h);
      this.adonay.tint = NIGHT_TINT;
    }

    let pAnim: PersonaAnim = 'idle';
    if (input.idleSec >= 30 && !input.walking) pAnim = 'sit';
    else if (input.walking) pAnim = 'walk';
    const pStrip =
      pAnim === 'sit' ? this.pantoneStrip.sit : pAnim === 'walk' ? this.pantoneStrip.walk : this.pantoneStrip.idle;
    if (pStrip) {
      const n = pAnim === 'walk' ? 4 : pAnim === 'idle' ? 2 : 1;
      const frameW = pStrip.width / n;
      const fi =
        pAnim === 'sit' ? 0 : Math.floor(input.timeSec * (pAnim === 'walk' ? 9 : 3)) % Math.max(1, n);
      this.pantone.texture = textureFrame(pStrip, frameW, fi);
      const feetScale = sh / PERSONA_REF.h;
      this.pantone.anchor.set(0.5, 1);
      this.pantone.x = sw / 2 - 120.5 * feetScale;
      this.pantone.y = feetY - 26.4 * feetScale;
      this.pantone.scale.set(feetScale * PANTONE_SCALE);
      this.pantone.tint = NIGHT_TINT;
      this.pantone.visible = true;
      this.lastPantoneVisible = true;
      this.lastPantoneAnim = pAnim;
    }

    const t9p = projectTp(2.0, 0, 8.2, cam, sw, sh);
    if (t9p && this.jacT9Ext.texture) {
      this.jacT9Ext.visible = !input.jacDriving;
      this.jacT9Ext.x = t9p.x;
      this.jacT9Ext.y = t9p.y;
      this.jacT9Ext.scale.set(t9p.scale);
    } else {
      this.jacT9Ext.visible = false;
    }
    for (const p of this.propSprites) {
      const pr = projectTp(p.x, 0, p.z, cam, sw, sh);
      if (!pr) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.visible = !input.jacDriving;
      p.sprite.x = pr.x;
      p.sprite.y = pr.y;
      p.sprite.scale.set(pr.scale);
    }
  }

  private async syncJacCabin(input: PersonaFrameInput, sw: number, sh: number, dpr: number): Promise<void> {
    const { capo, cabina, volante } = await loadJacCabin(input.jacLightsOn, dpr);
    const s = sh / PERSONA_REF.h;
    if (cabina) {
      this.jacCabina.texture = cabina;
      this.jacCabina.anchor.set(0, 0);
      this.jacCabina.x = 0;
      this.jacCabina.y = 0;
      this.jacCabina.scale.set(sw / cabina.width, sh / cabina.height);
      this.jacCabina.visible = true;
    }
    if (capo) {
      this.jacCapo.texture = capo;
      this.jacCapo.anchor.set(0.5, 1);
      this.jacCapo.x = sw / 2;
      this.jacCapo.y = sh * 0.72;
      this.jacCapo.scale.set(s);
      this.jacCapo.visible = true;
    }
    if (volante) {
      this.jacWheel.texture = volante;
      this.jacWheel.anchor.set(0.5, 0.5446);
      this.jacWheel.x = WHEEL_POS_1X[0] * (sw / PERSONA_REF.w);
      this.jacWheel.y = WHEEL_POS_1X[1] * (sh / PERSONA_REF.h);
      this.jacWheel.scale.set(s);
      this.jacWheel.rotation = input.steer * 0.65;
      this.jacWheel.visible = true;
    }
    void EYE_JAC_M;
  }
}
