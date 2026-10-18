import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import type { MapObject } from '../../data/world';
import { objects } from '../../data/map';
import type { FacingDir } from '../player';
import {
  ADONAY_ALTO_PX_1X,
  BEHIND_TP_M,
  EYE_JAC_M,
  EYE_TP_M,
  FACADE_BY_BUILDING,
  FEET_Y_1X,
  FOCAL_PX_1X,
  HORIZON_Y_1X,
  JAC_T9_POSE,
  PANTONE_SCALE,
  T9_PROJECTION_CALIB,
  PERSONA_REF,
  PX_PER_M,
  jacPersonaAnchorMeters,
  piezaById,
  tileToPersonaMeters,
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
  jacCx?: number;
  jacCy?: number;
};

type FacadeSlot = { sprite: Sprite; building: string; x: number; z: number };

function forwardFromYawRad(yawRad: number): { x: number; z: number } {
  return { x: Math.sin(yawRad), z: Math.cos(yawRad) };
}

/** Projected scale × (meters-wide × px/m) / texture width → Pixi sprite scale. */
function billboardScale(projScale: number, texWidth: number, widthM: number): number {
  return projScale * ((widthM * PX_PER_M) / texWidth);
}

export function personaT9WidthFrac(
  sw: number,
  sh: number,
  charTx: number,
  charTy: number,
  yawRad: number,
  texWidth: number,
  jacCx?: number,
  jacCy?: number,
): number | null {
  const player = tileToPersonaMeters(charTx, charTy);
  const cam = personaCam(player.x, player.z, yawRad);
  const anchor =
    jacCx != null && jacCy != null
      ? jacPersonaAnchorMeters(jacCx, jacCy)
      : { x: JAC_T9_POSE.x, z: JAC_T9_POSE.z, widthM: JAC_T9_POSE.widthM };
  const t9p = projectTp(anchor.x, 0, anchor.z, cam, sw, sh);
  if (!t9p || !texWidth) return null;
  const sc = billboardScale(t9p.scale, texWidth, anchor.widthM) * T9_PROJECTION_CALIB;
  return (texWidth * sc) / sw;
}

type PersonaCam = { x: number; z: number; yaw: number };

/** Screen-space angle (deg) of walking forward at yaw — for Forge W-key QA. */
/** Client pixel of a map tile as drawn in persona view (for Forge screen-motion QA). */
export function personaTileClientPx(
  charTx: number,
  charTy: number,
  markTx: number,
  markTy: number,
  yawRad: number,
  sw: number,
  sh: number,
): { x: number; y: number } | null {
  const player = tileToPersonaMeters(charTx, charTy);
  const mark = tileToPersonaMeters(markTx, markTy);
  const cam = personaCam(player.x, player.z, yawRad);
  const p = projectTp(mark.x, 0, mark.z, cam, sw, sh);
  return p ? { x: p.x, y: p.y } : null;
}

export function personaScreenForwardDeg(
  charTx: number,
  charTy: number,
  yawRad: number,
  sw: number,
  sh: number,
): number {
  const player = tileToPersonaMeters(charTx, charTy);
  const cam = personaCam(player.x, player.z, yawRad);
  const fwd = forwardFromYawRad(yawRad);
  const a = projectTp(player.x, 0, player.z, cam, sw, sh);
  const b = projectTp(player.x + fwd.x * 3, 0, player.z + fwd.z * 3, cam, sw, sh);
  if (!a || !b) return NaN;
  return ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 360;
}

function personaCam(px: number, pz: number, yawRad: number): PersonaCam {
  const fwd = forwardFromYawRad(yawRad);
  return {
    x: px - fwd.x * BEHIND_TP_M,
    z: pz - fwd.z * BEHIND_TP_M,
    yaw: yawRad,
  };
}

/** Camera-relative third-person: +depth along view axis, lateral for screen X. */
function projectTp(
  wx: number,
  wy: number,
  wz: number,
  cam: PersonaCam,
  sw: number,
  sh: number,
): { x: number; y: number; scale: number } | null {
  const f = FOCAL_PX_1X * (sw / PERSONA_REF.w);
  const horY = HORIZON_Y_1X * (sh / PERSONA_REF.h);
  const dx = wx - cam.x;
  const dz = wz - cam.z;
  const sin = Math.sin(cam.yaw);
  const cos = Math.cos(cam.yaw);
  const depth = dx * sin + dz * cos;
  const lateral = dx * cos - dz * sin;
  if (depth < 0.4) return null;
  return {
    x: sw / 2 + (lateral * f) / depth,
    y: horY - ((wy - EYE_TP_M) * f) / depth,
    scale: f / (depth * PX_PER_M),
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
  private groundFill = new Graphics();
  private ground = new Graphics();
  private facades: FacadeSlot[] = [];
  private adonay = new Sprite();
  private pantone = new Sprite();
  private jacCapo = new Sprite();
  private jacCabina = new Sprite();
  private jacWheel = new Sprite();
  private jacT9Ext = new Sprite();
  private propSprites: { sprite: Sprite; x: number; z: number; piezaId: string }[] = [];
  private lastGroundKey = '';
  private booted = false;
  private bootDpr = 0;
  private bootPromise: Promise<void> | null = null;
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
  lastJacScreen: { visible: boolean; x: number; y: number; w: number; h: number } | null = null;

  constructor() {
    this.layer.label = 'persona-view';
    this.layer.eventMode = 'none';
    this.layer.interactiveChildren = false;
    this.layer.sortableChildren = true;
    this.groundFill.zIndex = -4000;
    this.ground.zIndex = -800;
    this.layer.addChild(this.groundFill, this.ground);
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

  jacT9TextureWidth(): number {
    return this.jacT9Ext.texture?.width ?? 0;
  }

  qaAdonayVisible(): boolean {
    return this.adonay.visible;
  }

  qaSkyVisible(): boolean {
    return !!this.sky?.visible;
  }

  async ensureLoaded(dpr: number): Promise<void> {
    await ensurePersonaBoot(dpr);
    if (this.booted && this.bootDpr === dpr) return;
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.loadOnce(dpr);
    return this.bootPromise;
  }

  private async loadOnce(dpr: number): Promise<void> {
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
      const t9Meta = piezaById('jac-t9-ext__34-frontal-3p');
      const ancla = t9Meta?.ancla?.px_1x ?? [t9Tex.width / 2, t9Tex.height - 1];
      this.jacT9Ext.anchor.set(ancla[0] / t9Tex.width, ancla[1] / t9Tex.height);
      this.jacT9Ext.visible = true;
    }
    const propPlacements: { file: string; id: string; x: number; z: number }[] = [
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 1.3, z: 30 },
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 1.3, z: 15.5 },
      { file: 'farol-frente__estado-encendido', id: 'farol-frente', x: 11.8, z: 24 },
      { file: 'arbol-cuji-frente', id: 'arbol-cuji-frente', x: 11.8, z: 24 },
      { file: 'arbol-cuji-frente', id: 'arbol-cuji-frente', x: 17.5, z: 17 },
      { file: 'banco-frente', id: 'banco-frente', x: -4.3, z: 12.5 },
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
      this.propSprites.push({ sprite: sp, x: pl.x, z: pl.z, piezaId: pl.id });
    }
    this.booted = true;
    this.bootDpr = dpr;
    this.bootPromise = null;
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
      sp.roundPixels = true;
      if (tex.source?.style) tex.source.style.scaleMode = 'nearest';
      sp.tint = NIGHT_TINT;
      sp.zIndex = 120;
      this.layer.addChild(sp);
      this.facades.push({ sprite: sp, building: o.name ?? '', x: anchor.x, z: anchor.z });
    }
  }

  private fillGroundRect(
    cam: PersonaCam,
    sw: number,
    sh: number,
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    color: number,
    alpha = 1,
  ): void {
    const tl = projectTp(x0, 0, z0, cam, sw, sh);
    const tr = projectTp(x1, 0, z0, cam, sw, sh);
    const br = projectTp(x1, 0, z1, cam, sw, sh);
    const bl = projectTp(x0, 0, z1, cam, sw, sh);
    if (!tl || !tr || !br || !bl) return;
    this.ground.poly([tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]).fill({ color, alpha });
  }

  private drawGround(cam: PersonaCam, sw: number, sh: number): void {
    const yawKey = Math.round((cam.yaw * 180) / Math.PI / 6);
    const key = `${Math.round(cam.x * 2) / 2}:${Math.round(cam.z * 4) / 4}:${yawKey}:${sw}x${sh}`;
    if (key === this.lastGroundKey) return;
    this.lastGroundKey = key;
    this.groundFill.clear();
    this.ground.clear();
    const horY = HORIZON_Y_1X * (sh / PERSONA_REF.h);
    this.groundFill.rect(0, horY, sw, sh - horY).fill({ color: 0x1a1c20, alpha: 1 });
    const zFar = 58;
    const SW0 = -3.2;
    const CURB0 = 1.6;
    const CURB1 = 1.77;
    const STR1 = 11.3;
    const FC1 = 11.47;
    const FS1 = 15.5;
    const ZX0 = zFar;
    const grass = 0x1e261c;
    const acera = 0x24262b;
    const brocal = 0xd8dbe0;
    const asf = 0x16171b;
    this.fillGroundRect(cam, sw, sh, -80, SW0, 0, zFar, grass);
    this.fillGroundRect(cam, sw, sh, FS1, 80, 0, zFar, grass);
    this.fillGroundRect(cam, sw, sh, SW0, CURB0, 0, ZX0, acera);
    this.fillGroundRect(cam, sw, sh, CURB0, CURB1, 0, ZX0, brocal);
    this.fillGroundRect(cam, sw, sh, CURB1, STR1, 0, ZX0, asf);
    for (let z = 3; z < ZX0 - 4; z += 9) {
      this.fillGroundRect(cam, sw, sh, 7.8, 7.85, z, z + 3.5, 0x787c84, 0.85);
    }
    this.fillGroundRect(cam, sw, sh, 4.25, 4.35, 2, ZX0 - 3, 0x34383e, 0.7);
    this.fillGroundRect(cam, sw, sh, STR1, FC1, 0, ZX0, brocal);
    this.fillGroundRect(cam, sw, sh, FC1, FS1, 0, ZX0, acera);
  }

  private depthSortZ(wx: number, wz: number, player: { x: number; z: number }, yawRad: number): number {
    const behind = BEHIND_TP_M;
    const camX = player.x - Math.sin(yawRad) * behind;
    const camZ = player.z - Math.cos(yawRad) * behind;
    const dist = Math.hypot(wx - camX, wz - camZ);
    return Math.round(900 - dist * 18);
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
    if (!this.booted) await this.ensureLoaded(dpr);
    const player = tileToPersonaMeters(input.charTx, input.charTy);
    const yawRad = input.yawRad ?? input.yawQuarter * (Math.PI / 2);
    const cam = personaCam(player.x, player.z, yawRad);

    this.syncBackdrops(sw, sh, yawRad / (Math.PI / 2));
    this.drawGround(cam, sw, sh);

    for (const f of this.facades) {
      if (Math.abs(f.z - player.z) > 52) {
        f.sprite.visible = false;
        continue;
      }
      const p = projectTp(f.x, 0, f.z, cam, sw, sh);
      if (!p || p.scale < 0.07) {
        f.sprite.visible = false;
        continue;
      }
      f.sprite.visible = true;
      f.sprite.x = p.x;
      f.sprite.y = p.y;
      f.sprite.scale.set(p.scale);
      f.sprite.zIndex = this.depthSortZ(f.x, f.z, player, yawRad);
    }

    if (input.jacDriving) {
      this.adonay.visible = false;
      this.pantone.visible = false;
      this.jacT9Ext.visible = false;
      this.lastJacScreen = null;
      this.lastJacCabin = true;
      this.lastPantoneVisible = false;
      await this.syncJacCabin(input, sw, sh, dpr);
      return;
    }

    this.lastJacCabin = false;
    this.jacCapo.visible = this.jacCabina.visible = this.jacWheel.visible = false;
    this.adonay.visible = true;
    this.pantone.visible = true;

    const refScale = sh / PERSONA_REF.h;
    const portraitNarrow = sh > sw && sw < 420;
    const feetScale = portraitNarrow
      ? Math.min(refScale, (sw * 0.34) / ADONAY_ALTO_PX_1X)
      : refScale;
    const feetY = portraitNarrow
      ? Math.min(FEET_Y_1X * refScale, sh * 0.78)
      : Math.min(FEET_Y_1X * refScale, sh - (sh <= 500 ? 72 : 8));
    const adonayAnim = input.walking ? 'walk' : 'idle';
    const strip = adonayAnim === 'walk' ? this.adonayStrip.walk : this.adonayStrip.idle;
    if (strip) {
      const frameW = strip.width / (adonayAnim === 'walk' ? 4 : 2);
      const fi = Math.floor(input.timeSec * (adonayAnim === 'walk' ? 9 : 3)) % (adonayAnim === 'walk' ? 4 : 2);
      this.adonay.texture = textureFrame(strip, frameW, fi);
      this.adonay.anchor.set(0.5, 1);
      this.adonay.x = sw / 2;
      this.adonay.y = feetY;
      this.adonay.scale.set(feetScale);
      this.adonay.roundPixels = true;
      this.adonay.tint = NIGHT_TINT;
      this.adonay.zIndex = this.depthSortZ(player.x, player.z, player, yawRad);
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
      this.pantone.anchor.set(0.5, 1);
      this.pantone.x = Math.max(52 * feetScale, sw / 2 - 120.5 * feetScale);
      this.pantone.y = feetY - 26.4 * feetScale;
      this.pantone.scale.set(feetScale * PANTONE_SCALE);
      this.pantone.tint = NIGHT_TINT;
      this.pantone.visible = true;
      this.lastPantoneVisible = true;
      this.lastPantoneAnim = pAnim;
    }

    const jacAnchor =
      input.jacCx != null && input.jacCy != null
        ? jacPersonaAnchorMeters(input.jacCx, input.jacCy)
        : { x: JAC_T9_POSE.x, z: JAC_T9_POSE.z, widthM: JAC_T9_POSE.widthM };
    const t9p = projectTp(jacAnchor.x, 0, jacAnchor.z, cam, sw, sh);
    if (t9p && this.jacT9Ext.texture) {
      this.jacT9Ext.visible = !input.jacDriving;
      this.jacT9Ext.x = t9p.x;
      this.jacT9Ext.y = t9p.y;
      const tw = this.jacT9Ext.texture.width;
      const th = this.jacT9Ext.texture.height;
      const sc = billboardScale(t9p.scale, tw, jacAnchor.widthM) * T9_PROJECTION_CALIB;
      this.jacT9Ext.scale.set(sc);
      this.jacT9Ext.zIndex = this.depthSortZ(jacAnchor.x, jacAnchor.z, player, yawRad);
      const w = tw * sc;
      const h = th * sc;
      this.lastJacScreen = {
        visible: true,
        x: this.jacT9Ext.x - w / 2,
        y: this.jacT9Ext.y - h,
        w,
        h,
      };
    } else {
      this.jacT9Ext.visible = false;
      this.lastJacScreen = null;
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
      const meta = piezaById(p.piezaId);
      const wM = meta?.metros?.ancho;
      const tw = p.sprite.texture.width;
      p.sprite.scale.set(wM && tw ? billboardScale(pr.scale, tw, wM) : pr.scale);
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
