import { Application, Container, Graphics, Point, Polygon, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import {
  cells,
  doorInwardStep,
  fill,
  getBuildingAt,
  getBuildingAtDoor,
  getBuildingByName,
  getSceneryAt,
  INICIO,
  MAP_HEIGHT,
  MAP_WIDTH,
  objects,
  resolveBuildingEntryFromTile,
  resolveWalkTarget,
  TILE_H,
  TILE_W,
  type MapObject,
} from '../data/map';
import {
  bindPopstate,
  navigateBackFromInterior,
  parseCameraFromHash,
  parseInteriorFromHash,
  pushInteriorEntry,
  replaceOutdoorHash,
  setHashWriteSuppressed,
  writeInteriorToHash,
  type HistoryNavigationState,
} from '../camera/hash';
import { isTouchPrimary, type ChecklistStepId } from '../checklist/storage';
import { muroWallTiles, OBELISCO_ACCESS, OBELISCO_SOLID_TILES } from '../data/world';
import { mapWorldBounds, sortKey, tileFootWorld, tileToWorld, worldToTile } from '../iso/math';
import { findPathOrNearest } from '../iso/pathfinding';
import { C } from './colors';
import { deskTopFillColor, treeCanopyTrunkOverlap } from './draw';
import {
  buildingBodyHit,
  byDepthDesc,
  doorHit,
  doorTapPoint,
  footprintCorners,
  hasSpriteMask,
  obeliscoMonumentHit,
  obeliscoSilhouettes,
  spriteAlphaHit,
} from './pick';
import {
  streetOpenSides,
  objectDepth,
  objectOccluder,
  objectSpriteKey,
  objectSpriteTopLeft,
  playerBehind,
  tileSpriteKey,
  TILE_DIAMOND,
  type OccluderBox,
} from './mapSprites';
import {
  interiorSpriteKey,
  isLejosZoom,
  lejosZoomThreshold,
  isSpriteInterior,
  loadInteriorSprite,
  loadMapSprites,
  loadBuildingStateSprites,
  loadKeys,
  loadAllSprites,
  loadSpriteProbes,
  spriteAsset,
  spritesLoaded,
  spriteTexture,
  worldBackgroundColor,
  type BuildingSpriteState,
} from './sprites';
import {
  buildInteriorGrid,
  drawInteriorFloor,
  drawInteriorProps,
  drawInteriorWalls,
  findPathInterior,
  interiorSpriteTopLeft,
  getInteriorDef,
  interiorWorldBounds,
  interiorForwardTile,
  interiorHitExit,
  interiorNearestReachable,
  interiorPickPoint,
  interiorPickTile,
  interiorPixelProbes,
  type InteriorCell,
  type InteriorDef,
} from './interior';
import {
  cameraFitMargins,
  cameraFromPinchSession,
  clampInteriorPanInView,
  clampPanMapFullyInView,
  clampZoom,
  fitCameraToInteriorBounds,
  isMapFullyVisibleOnScreen,
  mapBoundsOnScreen,
  mapVisibleFractions,
  MAP_FIT_MARGIN_PX,
  setCameraFitMargins,
  setCameraViewportSize,
  stabilizeCameraAfterGesture,
  stabilizeCameraDuringPinch,
  viewportMapCoverage,
  zoomMinForInteriorBounds,
  zoomMinForViewport,
  zoomAtScreenAnchor,
  smoothDampToZero,
} from './cameraControl';
import { FillActors, type FillActorSnapshot } from './fillActors';
import { NpcCrowd, type NpcSnapshot } from './npcs';
import { buildTown, type Bench } from './npcRoutines';
import { Noah, type NoahSnapshot } from './noah';
import {
  loadPlayerSheets,
  loadRestSheets,
  PlayerAvatar,
  prefetchRestSheets,
  SPRINT_TILES_PER_S,
  TILE_STEP_WORLD,
  WALK_TILES_PER_S,
  type AvatarSnapshot,
  type FacingDir,
} from './player';

/** World px the player covers this frame. */
function walkStepWorld(sprint: boolean, deltaMS: number): number {
  return (sprint ? SPRINT_TILES_PER_S : WALK_TILES_PER_S) * TILE_STEP_WORLD * (deltaMS / 1000);
}

/** World px length of a move of (dx, dy) tiles. */
function tileMoveWorld(dx: number, dy: number): number {
  return Math.hypot((dx - dy) * (TILE_W / 2), (dx + dy) * (TILE_H / 2));
}

/** `?noahScale=1` draws Noah at the scale his wall route was authored for (QA comparison). */
function noahScale(): number | undefined {
  const raw = new URLSearchParams(location.search).get('noahScale');
  return raw === '1' || raw === '2' ? Number(raw) : undefined;
}

/** Tiles within this distance of Noah can talk to him without walking. */
const NOAH_TALK_RANGE = 1.6;
/**
 * A talk spot in front of (lower on screen than) a point of Noah's route must sit at least this far
 * to its side in world px, so the player never covers him (both characters are 64 world px wide).
 */
const NOAH_CLEAR_WORLD_X = 64;
/**
 * Props tapped by their opaque pixels, so a bench under a lamp's or a mural's bounding box still gets
 * its taps (the wall, obelisco and redoma keep their own tap rules).
 */
const ALPHA_TAP_PROPS = new Set(['tree', 'bench', 'lamp', 'fill']);
/**
 * A mouse or trackpad press on Noah may drift this far and still count as a click. The 4 px mouse
 * pan threshold is easy to cross with a physical trackpad click (touch already allows 14 px).
 */
const NOAH_CLICK_SLOP_PX = 12;

/**
 * Keyboard step on a tile grid: move on both axes if the target tile is walkable, otherwise slide
 * along whichever single axis is free (so a diagonal into a wall follows the wall).
 */
function slideStep(
  x: number,
  y: number,
  dx: number,
  dy: number,
  walkable: (tx: number, ty: number) => boolean,
): { x: number; y: number } {
  const ok = (nx: number, ny: number) => walkable(Math.round(nx), Math.round(ny));
  if (ok(x + dx, y + dy)) return { x: x + dx, y: y + dy };
  if (dx !== 0 && ok(x + dx, y)) return { x: x + dx, y };
  if (dy !== 0 && ok(x, y + dy)) return { x, y: y + dy };
  return { x, y };
}

export type BuildingPanelBridge = {
  isOpen: () => boolean;
  openTitle: () => string;
  dismiss: () => void;
  layoutInsets?: () => { left: number; top: number; right: number; bottom: number };
  consumeInteriorCanvasTap?: (clientX: number, clientY: number) => boolean;
  expandInteriorSheetForQa?: () => void;
};

export type ChecklistBridge = {
  isMobileExpanded: () => boolean;
  collapseMobile: () => void;
};

export type SceneEvents = {
  onChecklist: (step: ChecklistStepId) => void;
  onEnterBuilding: (buildingId: string, panelTitle: string) => void;
  onExitInterior?: () => void;
  onInteriorIdChange?: (interiorId: string | null) => void;
  onUnreachable?: () => void;
  buildingPanel?: BuildingPanelBridge;
  checklist?: ChecklistBridge;
};

/** Desktop first-load camera when the URL carries no #view. */
const DESKTOP_FIRST_LOAD_BUILDINGS = ['estudio', 'volaris', 'mentoria', 'pg'] as const;
const DESKTOP_ROOF_RISE = 160;
/** World px from the character's foot up to the middle of its body (Adonay is ~96 tall). */
const CHAR_BODY_CENTRE_RISE = 48;
/** Glide time when the camera catches up to the character (walk start, after a manual pan). */
const FOLLOW_SMOOTH_S = 0.35;
/** A per-frame character move longer than this (3 tiles) is a teleport, not walking. */
const FOLLOW_TELEPORT_WORLD = 3 * Math.hypot(TILE_W / 2, TILE_H / 2);

/** `?npcs=0|1` forces the street crowd; automated browsers get an empty street unless asked. */
function npcsWanted(): boolean {
  const flag = new URLSearchParams(location.search).get('npcs');
  if (flag === '0' || flag === '1') return flag === '1';
  return !navigator.webdriver;
}

function npcSeed(): number | undefined {
  const raw = new URLSearchParams(location.search).get('npcSeed');
  return raw && /^\d+$/.test(raw) ? Number(raw) : undefined;
}

export class IsoScene {
  app!: Application;
  world = new Container();
  camera = new Container();
  tilesLayer = new Container();
  objectsLayer = new Container();
  pathLayer = new Container();
  characterLayer = new Container();
  highlightLayer = new Container();
  interiorLayer = new Container();
  private interiorTapRoutingBound = false;

  charTx = INICIO[0];
  charTy = INICIO[1];
  path: { x: number; y: number }[] = [];
  moveSpeed = 4;
  sprint = false;
  charState: 'idle' | 'walk' | 'sprint' = 'idle';
  keys = new Set<string>();
  shiftHeld = false;

  cameraX = 0;
  cameraY = 0;
  zoom = 0.85;

  /**
   * Camera follow. `engaged` while the character moves (and until the glide settles); `suspended`
   * after a manual pan until the next walk starts. The camera moves with the character each frame
   * and a critically damped spring removes whatever offset is left.
   */
  private follow = {
    engaged: false,
    suspended: false,
    vx: 0,
    vy: 0,
    prevX: NaN,
    prevY: NaN,
    scope: '',
  };

  hoveredObject: MapObject | null = null;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private pathGfx = new Graphics();
  private avatar!: PlayerAvatar;
  private interiorAvatar!: PlayerAvatar;
  private noah!: Noah;
  /** Set by a tap on Noah from afar: talk to him once the walk there ends. */
  private pendingNoahTalk = false;
  /** Where that walk ends; arriving there always starts the talk. */
  private noahTalkSpot: { x: number; y: number } | null = null;
  /** Benches the player can sit on (the routines' town benches, with their front cells). */
  private benchList: Bench[] | null = null;
  /** Bench the player sits on or is walking to; NPCs keep off it. */
  private claimedBench: Bench | null = null;
  /** Walking to `claimedBench`: sit once the walk ends on its front cell. */
  private pendingBench: Bench | null = null;
  /** On the bench, from stepping onto it until back on the front cell; movement waits meanwhile. */
  private seatedBench: Bench | null = null;
  /** What to do once the player is back on their feet (a tap's walk; held keys resume on their own). */
  private afterStand: (() => void) | null = null;
  private npcs!: NpcCrowd;
  private fillActors!: FillActors;
  private events: SceneEvents;
  private objectGraphics = new Map<string, Container>();
  /** Opaque bounding box of each non-building object's sprite, relative to its container. */
  private objectTapBoxes = new Map<string, Rectangle>();
  private objectVisuals = new Map<
    string,
    {
      obj: MapObject;
      sprite: Sprite;
      key: string;
      state: BuildingSpriteState;
      cull: { x0: number; y0: number; x1: number; y1: number };
      occluder: OccluderBox | null;
      zIndex: number;
    }
  >();
  private lodLejos = false;
  private qaIsolation: Set<string> | null = null;
  private qaForcedState: BuildingSpriteState | null = null;
  private qaPreview: Sprite | null = null;
  private interiorSprite: Sprite | null = null;
  private lastPanPos: { x: number; y: number } | null = null;
  private tapStart: { x: number; y: number; t: number } | null = null;
  private lastTapTime = 0;
  /** Event timestamp of the gesture's first pointerdown (input time, not handler time). */
  private tapDownStamp = 0;
  private panMoved = false;
  /** Screen pixels dragged during an active single-finger pan (pinch does not increment). */
  private panDragScreenPx = 0;
  /** Farthest the single pointer of this gesture has strayed from where it went down, in screen px. */
  private tapDriftPx = 0;
  private zoomChanged = false;
  private lastChecklistZoom = 0;
  private canvasEl: HTMLCanvasElement | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchSession: {
    startDist: number;
    startZoom: number;
    startCamX: number;
    startCamY: number;
    startMid: { x: number; y: number };
  } | null = null;
  private webkitGestureSession: {
    startScale: number;
    startZoom: number;
    startCamX: number;
    startCamY: number;
    anchor: { x: number; y: number };
  } | null = null;
  private pinchGestureActive = false;
  private suppressTapUntil = 0;
  private hadMultiPointerGesture = false;
  private gestureActive = false;
  /** Exactly one zoom driver per gesture: pointer pinch, WebKit gesture*, or wheel. */
  private zoomSource: 'none' | 'pointer' | 'gesture' | 'wheel' = 'none';
  private pinchFrameSerial = 0;
  /** CDP / legacy touch paths that do not emit PointerEvents for each finger. */
  private touchOnlyPinch = false;
  private pendingBuildingEntry: { panelTitle: string; door: { x: number; y: number } } | null =
    null;
  private tileCullEntries: { g: Container; tx: number; ty: number }[] = [];
  private pointerGestureSerial = 0;
  private pixiTapGestureSerial = -1;
  private firstPointerDownAt = 0;
  private secondFingerArrived = false;
  private deferredTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingViewportApply = false;
  private fadeEl: HTMLElement | null = null;
  private interiorActive = false;
  private interiorDef: InteriorDef | null = null;
  private interiorGrid: InteriorCell[][] = [];
  private interiorCharTx = 0;
  private interiorCharTy = 0;
  private interiorPath: { x: number; y: number }[] = [];
  private interiorFloorGfx = new Graphics();
  private interiorWallGfx = new Graphics();
  private interiorBottomSheet = false;
  private interiorPropGfx = new Graphics();
  private mapReturnDoor: { x: number; y: number } | null = null;
  private outdoorCamBeforeInterior: { x: number; y: number; zoom: number } | null = null;
  private interiorHistoryEntries = 0;
  private historySyncInProgress = false;
  private suppressMapTapOnce = false;
  constructor(events: SceneEvents) {
    this.events = events;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvasEl = canvas;
    this.app = new Application();
    await this.app.init({
      canvas,
      background: worldBackgroundColor(),
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: window,
      preserveDrawingBuffer: true,
    });

    await loadMapSprites(this.app.renderer.resolution);
    void loadSpriteProbes();
    const bootInterior = parseInteriorFromHash();
    if (bootInterior && isSpriteInterior(bootInterior)) await loadInteriorSprite(bootInterior);
    window.setTimeout(() => {
      void loadBuildingStateSprites().then(() => this.syncObjectSprites(true));
    }, 2500);

    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.world);
    this.world.addChild(this.tilesLayer);
    this.world.addChild(this.pathLayer);
    this.world.addChild(this.objectsLayer);
    this.world.addChild(this.highlightLayer);
    this.world.addChild(this.characterLayer);
    this.world.addChild(this.interiorLayer);
    this.interiorLayer.visible = false;
    this.interiorLayer.sortableChildren = true;
    this.interiorFloorGfx.zIndex = 0;
    this.interiorWallGfx.zIndex = 100;
    this.interiorPropGfx.zIndex = 200;
    this.interiorLayer.addChild(this.interiorFloorGfx);
    this.interiorLayer.addChild(this.interiorWallGfx);
    this.interiorLayer.addChild(this.interiorPropGfx);
    this.bindInteriorPointerRouting();

    this.pathLayer.addChild(this.pathGfx);
    this.objectsLayer.sortableChildren = true;
    await loadPlayerSheets(this.app.renderer.resolution);
    this.avatar = new PlayerAvatar(
      this.objectsLayer,
      {
        zIndexAt: (fx, fy) => this.walkerZIndex(fx, fy),
        walkableAt: (wx, wy) => {
          const t = worldToTile(wx, wy);
          return !!t && !!cells[t.y]?.[t.x]?.walkable;
        },
      },
      this.reducedMotion,
    );
    this.interiorAvatar = new PlayerAvatar(
      this.interiorLayer,
      {
        zIndexAt: (fx, fy) => sortKey(fx, fy, 500),
        walkableAt: (wx, wy) => {
          const p = interiorPickPoint(wx, wy);
          return !!this.interiorGrid[Math.round(p.y)]?.[Math.round(p.x)]?.walkable;
        },
      },
      this.reducedMotion,
    );

    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'scene-fade';
    document.getElementById('app')?.appendChild(this.fadeEl);

    this.buildTiles();
    this.buildVoidClickLayer();
    this.buildOutskirts();
    this.buildObjects();
    this.npcs = new NpcCrowd(
      this.objectsLayer,
      {
        zIndexAt: (fx, fy) => this.walkerZIndex(fx, fy),
        blocked: (tx, ty) => {
          if (Math.round(this.charTx) === tx && Math.round(this.charTy) === ty) return true;
          const dog = this.avatar.pantoneTile();
          if (dog.x === tx && dog.y === ty) return true;
          const noah = this.noah?.isLoaded() ? this.noah.tile() : null;
          return !!noah && Math.round(noah.x) === tx && Math.round(noah.y) === ty;
        },
        playerBench: () => this.claimedBench?.id ?? null,
      },
      { enabled: npcsWanted(), seed: npcSeed(), stillPose: this.reducedMotion },
    );
    // 300+ strips: only fetched once the crowd is on, so automated runs without ?npcs=1 skip them.
    if (this.npcs.isEnabled()) this.loadNpcs();
    this.fillActors = new FillActors(
      this.objectsLayer,
      fill.actors,
      fill.overlays,
      (fx, fy) => this.walkerZIndex(fx, fy),
      this.reducedMotion,
    );
    const fillLoad = this.fillActors.load(this.app.renderer.resolution).then(() => this.cullVisibleTiles());
    void Promise.allSettled([fillLoad, this.buildNoah()]).then(prefetchRestSheets);
    this.syncCharacterGraphic();

    const bootInteriorId = parseInteriorFromHash();
    const fromHash = parseCameraFromHash();
    if (fromHash) {
      this.cameraX = fromHash.x;
      this.cameraY = fromHash.y;
      this.zoom = clampZoom(fromHash.zoom);
    } else if (this.shouldUseMobileFraming()) {
      this.frameMobileFirstLoadView();
    } else {
      this.frameDesktopFirstLoadView();
    }
    if (bootInteriorId) {
      this.outdoorCamBeforeInterior = {
        x: this.cameraX,
        y: this.cameraY,
        zoom: this.zoom,
      };
    }
    setHashWriteSuppressed(true);
    this.applyCamera(false);
    this.lastChecklistZoom = this.zoom;

    this.bindInput();
    this.app.ticker.add(() => this.update());
    window.addEventListener('resize', () => this.onWindowViewportChange());
    window.visualViewport?.addEventListener('resize', () => this.onWindowViewportChange());
    window.visualViewport?.addEventListener('scroll', () => {
      window.scrollTo(0, 0);
    });
    window.addEventListener('hashchange', () => {
      if (this.historySyncInProgress) return;
      this.applyHashNavigation(null);
    });

    bindPopstate((ev) => {
      this.applyHashNavigation((ev.state as HistoryNavigationState | null) ?? null);
    });

    if (bootInteriorId) {
      replaceOutdoorHash(this.outdoorCamBeforeInterior ?? { x: this.cameraX, y: this.cameraY, zoom: this.zoom });
      this.enterInterior(bootInteriorId, { skipFade: true });
    }
    setHashWriteSuppressed(false);
    this.applyCamera(true);
  }

  private applyHashNavigation(state: HistoryNavigationState | null): void {
    const v = parseCameraFromHash();
    const id = parseInteriorFromHash();
    if (v && !this.interiorActive) {
      this.cameraX = v.x;
      this.cameraY = v.y;
      this.zoom = clampZoom(v.zoom);
    }
    if (id && !this.interiorActive) {
      if (state?.outdoorCam && !this.outdoorCamBeforeInterior) {
        this.outdoorCamBeforeInterior = { ...state.outdoorCam };
      }
      this.enterInterior(id, { skipFade: true, fromHash: true });
    } else if (!id && this.interiorActive) {
      this.exitInterior({
        skipFade: true,
        fromHash: true,
        outdoorCam: state?.outdoorCam ?? this.outdoorCamBeforeInterior ?? undefined,
      });
    } else if (v && this.interiorActive) {
      this.cameraX = v.x;
      this.cameraY = v.y;
      this.zoom = clampZoom(v.zoom);
      this.applyCamera(false);
    }
    this.rebaselineChecklistFromCamera();
  }

  /** After programmatic #view hash updates, do not treat the next gesture as user zoom/pan. */
  private rebaselineChecklistFromCamera(): void {
    this.lastChecklistZoom = this.zoom;
    this.zoomChanged = false;
    this.panDragScreenPx = 0;
  }

  /** Desktop mouse uses Pixi pointertap — route interior hits to handleScreenTap (not map walk). */
  private bindInteriorPointerRouting(): void {
    if (this.interiorTapRoutingBound) return;
    this.interiorTapRoutingBound = true;
    this.interiorLayer.eventMode = 'static';
    this.interiorLayer.hitArea = new Rectangle(-12000, -12000, 24000, 24000);
    this.interiorLayer.on('pointertap', (e) => {
      if (!this.interiorActive) return;
      if (this.shouldBlockTap()) return;
      this.pixiTapGestureSerial = this.pointerGestureSerial;
      const canvas = this.canvasEl;
      if (!canvas) return;
      const native = e.nativeEvent as PointerEvent | undefined;
      const clientX = native?.clientX ?? 0;
      const clientY = native?.clientY ?? 0;
      const rect = canvas.getBoundingClientRect();
      const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
      this.handleScreenTap(clientX - rect.left, clientY - rect.top, sprint);
    });
  }

  /**
   * Ground beyond the 64×64 town, in the same tile art and a shade darker, so zooming all the way
   * out shows the town on open ground instead of floating in a black void. Drawing only: taps out
   * there still reach the void layer under it.
   */
  private buildOutskirts(): void {
    const tile = spriteTexture('tile/suelo/si-no').source;
    // One diamond centred in a 128×64 cell plus the four quarters at its corners tiles the iso grid.
    // A canvas (power-of-two at @2x) so the pattern gets mipmaps like the tiles: no moiré far out.
    const res = 2;
    const canvas = document.createElement('canvas');
    canvas.width = TILE_W * res;
    canvas.height = TILE_H * res;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (const [cx, cy] of [[64, 32], [0, 0], [128, 0], [0, 64], [128, 64]]) {
      ctx.drawImage(tile.resource as CanvasImageSource, (cx - TILE_W / 2) * res, (cy - TILE_H / 2) * res, TILE_W * res, TILE_H * res);
    }
    const pattern = Texture.from({ resource: canvas, resolution: res, autoGenerateMipmaps: true, scaleMode: 'linear' });
    const ground = new TilingSprite({ texture: pattern, width: TILE_W, height: TILE_H });
    ground.alpha = 0.7;
    ground.eventMode = 'none';
    this.outskirts = ground;
    this.world.addChildAt(ground, 1);
  }

  private outskirts: TilingSprite | null = null;

  /**
   * Stretches the outskirts over exactly what the camera sees (a tall phone at the 0.04 zoom floor
   * sees ~20 000 px of world), starting on a whole cell from the origin so the pattern's corner
   * diamonds stay on the tile centres ((x − y)·64, (x + y)·32) and continue the town's grid.
   * Hidden while the town covers the whole screen: a full-screen blended quad costs software-GL
   * phones ~4 ms a frame.
   */
  private fitOutskirts(sw: number, sh: number): void {
    const g = this.outskirts;
    if (!g) return;
    const left = -sw / 2 / this.zoom - this.cameraX;
    const right = sw / 2 / this.zoom - this.cameraX;
    const top = -sh / 2 / this.zoom - this.cameraY;
    const bottom = sh / 2 / this.zoom - this.cameraY;
    // Screen corners in tile coordinates, one tile in from the edge to clear the slab's side faces.
    const inTown = (wx: number, wy: number) => {
      const tx = wx / TILE_W + wy / TILE_H;
      const ty = wy / TILE_H - wx / TILE_W;
      return tx >= 0.5 && ty >= 0.5 && tx <= MAP_WIDTH - 1.5 && ty <= MAP_HEIGHT - 1.5;
    };
    const covered = inTown(left, top) && inTown(right, top) && inTown(left, bottom) && inTown(right, bottom);
    g.visible = !this.interiorActive && !covered;
    if (!g.visible) return;
    const x0 = Math.floor(left / TILE_W - 1) * TILE_W;
    const y0 = Math.floor(top / TILE_H - 1) * TILE_H;
    const x1 = Math.ceil(right / TILE_W + 1) * TILE_W;
    const y1 = Math.ceil(bottom / TILE_H + 1) * TILE_H;
    g.position.set(x0, y0);
    g.width = x1 - x0;
    g.height = y1 - y0;
  }

  private buildVoidClickLayer(): void {
    const g = new Graphics();
    g.rect(-12000, -12000, 24000, 24000);
    g.fill({ color: 0xffffff, alpha: 0.001 });
    g.eventMode = 'static';
    g.zIndex = -1000;
    g.on('pointertap', (e) => {
      if (this.shouldBlockTap()) return;
      this.pixiTapGestureSerial = this.pointerGestureSerial;
      const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
      if (this.interiorActive) {
        const canvas = this.canvasEl;
        if (!canvas) return;
        const native = e.nativeEvent as PointerEvent | undefined;
        const clientX = native?.clientX ?? 0;
        const clientY = native?.clientY ?? 0;
        const rect = canvas.getBoundingClientRect();
        this.handleScreenTap(clientX - rect.left, clientY - rect.top, sprint);
        return;
      }
      const pos = e.getLocalPosition(this.world);
      const tile = worldToTile(pos.x, pos.y);
      if (!tile) {
        this.tapBeyondMapEdge(pos.x, pos.y, sprint);
        return;
      }
      if (!this.prepareMapTap(undefined, tile.x, tile.y)) return;
      this.requestWalk(tile.x, tile.y, sprint);
    });
    this.world.addChildAt(g, 0);
  }

  private buildTiles(): void {
    const diamond = new Polygon(TILE_DIAMOND);
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const cell = cells[ty][tx];
        const key = tileSpriteKey(cells, tx, ty);
        const g = new Sprite(spriteTexture(key));
        const foot = tileFootWorld(tx, ty);
        const a = spriteAsset(key);
        g.position.set(foot.x - a.vfs.x, foot.y - a.vfs.y);
        g.hitArea = diamond;
        g.eventMode = 'static';
        g.cursor = cell.walkable ? 'pointer' : 'default';
        g.on('pointertap', (e) => {
          if (this.shouldBlockTap()) return;
          this.pixiTapGestureSerial = this.pointerGestureSerial;
          if (!this.prepareMapTap(undefined, tx, ty)) return;
          const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
          this.requestWalk(tx, ty, sprint);
        });
        this.tilesLayer.addChild(g);
        this.tileCullEntries.push({ g, tx, ty });
      }
    }
  }

  private buildingHitArea(obj: MapObject): { contains(x: number, y: number): boolean } {
    const pos = tileFootWorld(obj.x, obj.y);
    return {
      contains: (x: number, y: number) =>
        doorHit(obj, pos.x + x, pos.y + y) || buildingBodyHit(obj, pos.x + x, pos.y + y),
    };
  }

  private buildObjects(): void {
    const sorted = [...objects].sort((a, b) => sortKey(a.x, a.y) - sortKey(b.x, b.y));
    for (const obj of sorted) {
      const pos = tileFootWorld(obj.x, obj.y);
      const g = new Container();
      g.position.set(pos.x, pos.y);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      const key = objectSpriteKey(obj, 'default', false);
      if (key) {
        const sprite = new Sprite(spriteTexture(key));
        const tl = objectSpriteTopLeft(obj, key);
        sprite.position.set(tl.x - pos.x, tl.y - pos.y);
        g.addChild(sprite);
        const a = spriteAsset(key);
        const tlw = { x: tl.x, y: tl.y };
        const box = new Rectangle(tlw.x + a.bbox.x0 - pos.x, tlw.y + a.bbox.y0 - pos.y, a.bbox.x1 - a.bbox.x0, a.bbox.y1 - a.bbox.y0);
        this.objectTapBoxes.set(obj.id, box);
        g.hitArea =
          obj.type === 'building'
            ? this.buildingHitArea(obj)
            : ALPHA_TAP_PROPS.has(obj.name) && hasSpriteMask(obj)
              ? { contains: (x: number, y: number) => box.contains(x, y) && spriteAlphaHit(obj, pos.x + x, pos.y + y) }
              : box;
        const flat = obj.name === 'redoma' || !!obj.flat;
        const zIndex = flat ? -10 : objectDepth(obj) + (obj.x - obj.y) * 0.0001;
        g.zIndex = zIndex;
        if (obj.flat) g.eventMode = 'none';
        const spriteBox = {
          x0: tlw.x - 8,
          y0: tlw.y - 8,
          x1: tlw.x + a.w + 8,
          y1: tlw.y + a.h + 8,
        };
        this.objectVisuals.set(obj.id, {
          obj,
          sprite,
          key,
          state: 'default',
          cull: spriteBox,
          occluder: objectOccluder(obj),
          zIndex,
        });
      }
      g.on('pointerover', () => {
        if (matchMedia('(hover: hover)').matches) {
          this.hoveredObject = obj;
        }
      });
      g.on('pointerout', () => {
        if (this.hoveredObject?.id === obj.id) {
          this.hoveredObject = null;
        }
      });
      g.on('pointertap', (e) => {
        if (this.shouldBlockTap()) return;
        e.stopPropagation();
        this.pixiTapGestureSerial = this.pointerGestureSerial;
        if (obj.type === 'building' && obj.panelTitle && !this.prepareMapTap(obj)) return;
        const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
        if (obj.type === 'building' && obj.door && obj.panelTitle) {
          this.requestWalk(obj.door.x, obj.door.y, sprint, {
            buildingEntry: { panelTitle: obj.panelTitle, door: obj.door },
          });
          return;
        }
        this.pendingBuildingEntry = null;
        const pos = e.getLocalPosition(this.world);
        const bench = obj.name === 'bench' ? this.benchAtSeat(obj.x, obj.y) : obj.type !== 'building' ? this.pickBenchAtWorld(pos.x, pos.y) : undefined;
        if (bench) {
          if (!this.prepareMapTap(undefined, bench.seat.x, bench.seat.y)) return;
          if (this.sitOnBench(bench, sprint)) return;
        }
        const tile = this.resolveGroundTap(pos.x, pos.y);
        const scenery = obj.name === 'obelisco' || obj.name === 'redoma' || obj.name === 'muro';
        if (tile && (scenery || cells[tile.y][tile.x].walkable)) {
          if (!this.prepareMapTap(undefined, tile.x, tile.y)) return;
          this.requestWalk(tile.x, tile.y, sprint);
          return;
        }
        this.requestWalk(obj.x, obj.y, sprint);
      });
      this.objectGraphics.set(obj.id, g);
      this.objectsLayer.addChild(g);
    }
    this.syncObjectSprites(true);
  }

  /** Building state sprite: hover (pointer) > resaltado (panel open / walking to it) > default. */
  private buildingSpriteState(obj: MapObject): BuildingSpriteState {
    if (this.qaForcedState) return this.qaForcedState;
    if (this.hoveredObject?.id === obj.id) return 'hover';
    if (this.pendingBuildingEntry && obj.door) {
      const d = this.pendingBuildingEntry.door;
      if (d.x === obj.door.x && d.y === obj.door.y) return 'resaltado';
    }
    const bridge = this.events.buildingPanel;
    if (obj.panelTitle && bridge?.isOpen() && bridge.openTitle() === obj.panelTitle) return 'resaltado';
    return 'default';
  }

  private isLejos(): boolean {
    return isLejosZoom(this.zoom, zoomMinForViewport(this.app.screen.width, this.app.screen.height));
  }

  /** Applies the zoom variant (cerca / lejos) and building states to every object sprite. */
  private syncObjectSprites(force = false): void {
    const lejos = this.isLejos();
    const lodChanged = lejos !== this.lodLejos;
    this.lodLejos = lejos;
    for (const v of this.objectVisuals.values()) {
      const state = v.obj.type === 'building' ? this.buildingSpriteState(v.obj) : 'default';
      if (!force && !lodChanged && state === v.state) continue;
      const key = objectSpriteKey(v.obj, state, lejos);
      if (!key) continue;
      if (!spritesLoaded(key)) {
        void loadKeys([key]).then(() => this.syncObjectSprites(true));
        continue;
      }
      v.state = state;
      v.key = key;
      v.sprite.texture = spriteTexture(key);
    }
    if (this.interiorSprite && this.interiorDef?.sprite) {
      const key = interiorSpriteKey(this.interiorDef.id, lejos);
      if (spritesLoaded(key)) this.interiorSprite.texture = spriteTexture(key);
    }
    if (this.canvasEl) {
      this.canvasEl.dataset.lod = lejos ? 'lejos' : 'cerca';
      this.canvasEl.dataset.lodBelow = String(
        lejosZoomThreshold(zoomMinForViewport(this.app.screen.width, this.app.screen.height)),
      );
    }
  }

  /**
   * Walkers (player and NPCs) draw in front of everything except objects they stand behind
   * (front-row ordering); among themselves the one further down the screen draws on top.
   */
  private walkerZIndex(fx: number, fy: number): number {
    let zi = Infinity;
    for (const v of this.objectVisuals.values()) {
      if (!v.occluder || v.zIndex >= zi) continue;
      if (playerBehind(v.occluder, fx, fy)) zi = v.zIndex;
    }
    return (Number.isFinite(zi) ? zi - 0.5 : 1_000_000) + (fx + fy) * 1e-4;
  }

  private buildNoah(): Promise<void> | undefined {
    const muro = objects.find((o) => o.name === 'muro');
    if (!muro) return undefined;
    const muroKey = objectSpriteKey(muro, 'default', false)!;
    this.noah = new Noah(
      this.objectsLayer,
      {
        muroTopLeft: () => objectSpriteTopLeft(muro, muroKey),
        muroZIndex: () => this.objectVisuals.get(muro.id)?.zIndex ?? objectDepth(muro),
        zIndexAt: (fx, fy) => this.walkerZIndex(fx, fy),
      },
      noahScale(),
    );
    this.noah.bindTap((e) => {
      if (this.shouldBlockTap(e.pointerType === 'touch' ? 0 : NOAH_CLICK_SLOP_PX)) return;
      e.stopPropagation();
      this.pixiTapGestureSerial = this.pointerGestureSerial;
      if (!this.prepareMapTap()) return;
      this.talkToNoahOrWalkThere(this.shiftHeld);
    });
    return this.noah.load(this.app.renderer.resolution).then(() => this.cullVisibleTiles());
  }

  /** Within talk range, or on any of the 8 tiles around his (his feet sit off the tile centre). */
  private playerNearNoah(): boolean {
    if (!this.noah?.isLoaded() || this.interiorActive) return false;
    const n = this.noah.tile();
    if (Math.hypot(this.charTx - n.x, this.charTy - n.y) <= NOAH_TALK_RANGE) return true;
    const p = this.roundedCharTile();
    return Math.max(Math.abs(p.x - Math.round(n.x)), Math.abs(p.y - Math.round(n.y))) <= 1;
  }

  /** Beside Noah: he starts his climb. Farther away: walk next to him first, then talk. */
  private talkToNoahOrWalkThere(sprint: boolean): void {
    if (!this.noah?.isLoaded() || this.noah.busy()) return;
    if (this.playerNearNoah() && this.path.length === 0) {
      this.startNoahTalk();
      return;
    }
    const spot = this.noahTalkSpots()[0];
    if (!spot) return;
    this.requestWalk(spot.x, spot.y, sprint);
    this.noahTalkSpot = spot;
    this.pendingNoahTalk = this.path.length > 0 || this.playerNearNoah();
    if (this.path.length === 0 && this.pendingNoahTalk) {
      this.pendingNoahTalk = false;
      this.startNoahTalk();
    }
  }

  /**
   * Walkable tiles within talk range, best first. Never a tile his route passes over, nor one in
   * front of a route point close enough to cover him (the wall base right below him included).
   */
  private noahTalkSpots(): { x: number; y: number }[] {
    const n = this.noah.tile();
    const route = this.noah.routeTiles();
    const spots: { x: number; y: number; d: number }[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(n.x) + dx;
        const y = Math.round(n.y) + dy;
        const d = Math.hypot(x - n.x, y - n.y);
        if (d < 0.6 || d > NOAH_TALK_RANGE || !cells[y]?.[x]?.walkable) continue;
        if (route.some((r) => Math.round(r.x) === x && Math.round(r.y) === y)) continue;
        const covers = (r: { x: number; y: number }) =>
          x + y > r.x + r.y && Math.abs(x - y - (r.x - r.y)) * (TILE_W / 2) < NOAH_CLEAR_WORLD_X;
        if (route.some(covers)) continue;
        // In front of him (lower on screen) first, so the player never stands over the NOAH letters.
        spots.push({ x, y, d: d + (x + y > n.x + n.y ? 0 : 10) });
      }
    }
    return spots.sort((a, b) => a.d - b.d);
  }

  private startNoahTalk(): void {
    if (this.seatedBench) {
      this.standThen(() => this.startNoahTalk());
      return;
    }
    if (!this.noah.talk()) return;
    const n = this.noah.tile();
    this.avatar.setFacing(
      (n.y + n.x >= this.charTx + this.charTy ? 's' : 'n') + (n.x - n.y >= this.charTx - this.charTy ? 'e' : 'w') as FacingDir,
    );
  }

  private townBenches(): Bench[] {
    this.benchList ??= buildTown().benches;
    return this.benchList;
  }

  private benchAtSeat(tx: number, ty: number): Bench | undefined {
    return this.townBenches().find((b) => b.seat.x === tx && b.seat.y === ty);
  }

  /** Bench whose drawn sprite (its tap box) is under a screen point. */
  private pickBenchAtScreen(sx: number, sy: number): Bench | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    return this.pickBenchAtWorld(wx, wy);
  }

  /** Bench with an opaque pixel at a world point, even under a prop drawn over it (the bus stop's). */
  private pickBenchAtWorld(wx: number, wy: number): Bench | undefined {
    return this.townBenches()
      .filter((b) => {
        const g = this.objectGraphics.get(b.id);
        return !!g?.hitArea?.contains(wx - g.x, wy - g.y);
      })
      .sort((a, b) => sortKey(b.seat.x, b.seat.y) - sortKey(a.seat.x, a.seat.y))[0];
  }

  /**
   * Walks to the bench's front cell and sits (Pantone beside it). False when an NPC is already
   * sitting there, so the tap falls back to an ordinary walk.
   */
  private sitOnBench(bench: Bench, sprint: boolean): boolean {
    if (this.interiorActive) return false;
    if (this.seatedBench) {
      if (this.seatedBench.id !== bench.id) this.standThen(() => this.sitOnBench(bench, sprint));
      return true;
    }
    if (this.claimedBench?.id !== bench.id && !this.npcs.yieldBenchToPlayer(bench.id)) return false;
    this.claimedBench = bench;
    void loadRestSheets();
    this.pendingBuildingEntry = null;
    this.pendingNoahTalk = false;
    this.walkToTile(bench.front.x, bench.front.y, sprint);
    this.pendingBench = bench;
    if (this.path.length === 0) this.arriveAtBench();
    return true;
  }

  /** Enter / Space next to a bench (around its seat, or on its front cell) sits on the nearest one. */
  private sitOnNearbyBench(): boolean {
    if (this.interiorActive) return false;
    const t = this.roundedCharTile();
    const near = this.townBenches()
      .filter(
        (b) =>
          Math.max(Math.abs(b.seat.x - t.x), Math.abs(b.seat.y - t.y)) <= 1 ||
          (b.front.x === t.x && b.front.y === t.y),
      )
      .sort((a, b) => Math.hypot(a.seat.x - t.x, a.seat.y - t.y) - Math.hypot(b.seat.x - t.x, b.seat.y - t.y));
    return near.some((b) => this.sitOnBench(b, false));
  }

  private arriveAtBench(): void {
    const b = this.pendingBench;
    this.pendingBench = null;
    if (!b) return;
    if (this.charTx !== b.front.x || this.charTy !== b.front.y) {
      this.claimedBench = null;
      return;
    }
    this.seatedBench = b;
    this.avatar.sitOn({
      variant: b.variant,
      anchor: tileFootWorld(b.seat.x, b.seat.y),
      front: tileToWorld(b.front.x, b.front.y),
      tile: { ...b.seat },
      benchZ: this.objectVisuals.get(b.id)?.zIndex ?? objectDepth(objects.find((o) => o.id === b.id)!),
    });
  }

  /** A walk elsewhere (tap or keys) drops the bench the player was heading for. */
  private dropBenchWalk(): void {
    if (this.seatedBench) return;
    this.pendingBench = null;
    this.claimedBench = null;
  }

  /** Gets up off the bench, then runs `next` (or nothing: held movement keys carry on by themselves). */
  private standThen(next: (() => void) | null): void {
    this.afterStand = next;
    this.avatar.standUp();
  }

  /** Back on the front cell: the bench is free again and the queued action runs. */
  private leaveBenchIfStood(): void {
    if (!this.seatedBench || !this.avatar.isFree()) return;
    this.seatedBench = null;
    this.claimedBench = null;
    const next = this.afterStand;
    this.afterStand = null;
    next?.();
  }

  /** Any key, press or wheel: restarts Pantone's rest timer and wakes him. */
  private noteAvatarInput(): void {
    this.avatar?.noteInput();
    this.interiorAvatar?.noteInput();
  }

  /** Feeds the player's foot to whichever avatar is on screen; once per tick. */
  private updateAvatars(dt: number): void {
    if (this.interiorActive) {
      const f = tileToWorld(this.interiorCharTx, this.interiorCharTy);
      this.interiorAvatar.update(f.x, f.y, dt);
      return;
    }
    const f = tileToWorld(this.charTx, this.charTy);
    this.avatar.update(f.x, f.y, dt);
    this.noah?.update(dt);
  }

  /** Screen coords (canvas pixels) ↔ world coords with world scaled under a fixed camera pivot. */
  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const z = this.zoom;
    return {
      x: (sx - sw / 2) / z - this.cameraX,
      y: (sy - sh / 2) / z - this.cameraY,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const z = this.zoom;
    return {
      x: sw / 2 + (this.cameraX + wx) * z,
      y: sh / 2 + (this.cameraY + wy) * z,
    };
  }

  requestWalk(
    tx: number,
    ty: number,
    sprint: boolean,
    opts?: { buildingEntry?: { panelTitle: string; door: { x: number; y: number } } },
  ): void {
    this.pendingNoahTalk = false;
    this.dropBenchWalk();
    if (!opts?.buildingEntry) {
      const bench = this.benchAtSeat(tx, ty);
      if (bench && this.sitOnBench(bench, sprint)) return;
    }
    const walkTx = tx;
    const walkTy = ty;
    const entry =
      opts?.buildingEntry ??
      resolveBuildingEntryFromTile(walkTx, walkTy, this.roundedCharTile());
    this.pendingBuildingEntry = entry;
    const target = resolveWalkTarget(walkTx, walkTy);
    this.walkToTile(target.x, target.y, sprint);
  }

  clearWalkPreview(): void {
    this.path = [];
    this.drawPathPreview();
    if (this.canvasEl) this.canvasEl.dataset.walkGoal = '';
  }

  walkToTile(tx: number, ty: number, sprint: boolean): void {
    if (this.seatedBench && !this.interiorActive) {
      this.standThen(() => this.walkToTile(tx, ty, sprint));
      return;
    }
    if (OBELISCO_SOLID_TILES.some(([ox, oy]) => ox === tx && oy === ty)) {
      tx = OBELISCO_ACCESS.x;
      ty = OBELISCO_ACCESS.y;
    }
    if (this.canvasEl) {
      this.canvasEl.dataset.walkGoal = JSON.stringify({ x: tx, y: ty });
    }
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
      this.pendingBuildingEntry = null;
      this.clearWalkPreview();
      if (this.canvasEl) this.canvasEl.dataset.walkGoal = '';
      this.events.onUnreachable?.();
      return;
    }
    const sx = Math.round(this.charTx);
    const sy = Math.round(this.charTy);
    const result = findPathOrNearest(sx, sy, tx, ty);
    if (!result) {
      this.pendingBuildingEntry = null;
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
    }
    if (!result.direct && this.pendingBuildingEntry) {
      const d = this.pendingBuildingEntry.door;
      if (result.target.x !== d.x || result.target.y !== d.y) this.pendingBuildingEntry = null;
    }
    this.path = result.path;
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
    this.startCameraFollow();
    this.events.onChecklist('walk-around');
    this.drawPathPreview();
    if (this.path.length === 0) {
      this.charState = 'idle';
      this.sprint = false;
      this.syncCharacterGraphic();
      const rtx = Math.round(this.charTx);
      const rty = Math.round(this.charTy);
      this.tryArriveAtDoorTile(rtx, rty);
    }
  }

  /** Door pick in world space (stable at min zoom ~0.04–0.15); closest opening wins. */
  private pickBuildingDoorAtScreen(sx: number, sy: number): MapObject | undefined {
    if (this.zoom <= 0.15) {
      const body = this.pickBuildingAtScreen(sx, sy);
      if (body?.door && body.panelTitle) return body;
    }
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const buildings = objects.filter((o) => o.type === 'building' && o.door && o.panelTitle);
    let best: { obj: MapObject; dist: number; depth: number } | null = null;
    for (const obj of buildings) {
      if (!doorHit(obj, wx, wy)) continue;
      const tap = doorTapPoint(obj);
      if (!tap) continue;
      const dist = Math.hypot(wx - tap.x, wy - tap.y);
      const depth = sortKey(obj.x, obj.y);
      if (!best || dist < best.dist - 0.5 || (Math.abs(dist - best.dist) < 0.5 && depth > best.depth)) {
        best = { obj, dist, depth };
      }
    }
    return best?.obj;
  }

  /**
   * Tile a map tap targets when it lands on scenery or a prop. Walkable ground under the tap wins,
   * even where a tall sprite is drawn over it. On a solid obelisco cell only the drawn monument
   * (steps, slab, stair, arch) counts as the monument; bare plaza there goes to the nearest open cell.
   */
  private resolveGroundTap(wx: number, wy: number): { x: number; y: number } | null {
    const tile = worldToTile(wx, wy);
    if (!tile || cells[tile.y][tile.x].walkable) return tile;
    const obelisco = getSceneryAt(tile.x, tile.y);
    if (obelisco?.name !== 'obelisco' || obeliscoMonumentHit(obelisco, wx, wy)) return tile;
    let best: { x: number; y: number; d: number } | null = null;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tile.x + dx;
        const y = tile.y + dy;
        if (!cells[y]?.[x]?.walkable) continue;
        const c = tileToWorld(x, y);
        const d = Math.hypot(wx - c.x, wy - c.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    return best ? { x: best.x, y: best.y } : tile;
  }

  private pickSceneryAtScreen(sx: number, sy: number): { tx: number; ty: number } | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const tile = this.resolveGroundTap(wx, wy);
    if (tile && getSceneryAt(tile.x, tile.y)) return { tx: tile.x, ty: tile.y };
    const scenery = objects
      .filter((o) => o.name === 'obelisco' || o.name === 'redoma' || o.name === 'muro')
      .sort((a, b) => sortKey(b.x, b.y) - sortKey(a.x, b.y));
    for (const obj of scenery) {
      const foot = tileFootWorld(obj.x, obj.y);
      const local = { x: wx - foot.x, y: wy - foot.y };
      const w = obj.w ?? 3;
      const h = obj.h ?? 2;
      const hitW = 36 + w * 14;
      const hitH = 52 + h * 18;
      if (Math.abs(local.x) < hitW && local.y > -hitH && local.y < 28) {
        return tile ? { tx: tile.x, ty: tile.y } : { tx: obj.x, ty: obj.y };
      }
    }
    return undefined;
  }

  private pickBuildingAtScreen(sx: number, sy: number): MapObject | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const buildings = objects.filter((o) => o.type === 'building').sort(byDepthDesc);
    const fatFinger = this.zoom <= 0.11;
    for (const obj of buildings) {
      if (doorHit(obj, wx, wy)) return obj;
      if (buildingBodyHit(obj, wx, wy)) return obj;
    }
    if (fatFinger) {
      const tile = worldToTile(wx, wy);
      if (tile) {
        const onBuilding = getBuildingAt(tile.x, tile.y);
        if (onBuilding?.door) return onBuilding;
      }
    }
    return undefined;
  }

  /**
   * When the building panel is open: dismiss it and continue the map action, unless the
   * tap is on the same building (keep panel). Returns false to abort the tap entirely.
   */
  private prepareMapTap(building?: MapObject, tx?: number, ty?: number): boolean {
    const bridge = this.events.buildingPanel;
    if (!bridge?.isOpen()) return true;
    const openTitle = bridge.openTitle();
    if (building?.panelTitle === openTitle) return false;
    if (tx !== undefined && ty !== undefined) {
      if (getBuildingAtDoor(tx, ty)?.panelTitle === openTitle) return false;
      if (getBuildingAt(tx, ty)?.panelTitle === openTitle) return false;
    }
    bridge.dismiss();
    this.pendingBuildingEntry = null;
    this.clearWalkPreview();
    this.suppressMapTapOnce = true;
    const ctx = Math.round(this.charTx);
    const cty = Math.round(this.charTy);
    if (getBuildingAtDoor(ctx, cty)) {
      this.doorCooldown = 200;
    }
    return false;
  }

  private handleScreenTap(sx: number, sy: number, sprint: boolean): void {
    if (this.suppressMapTapOnce) {
      this.suppressMapTapOnce = false;
      return;
    }
    if (!this.interiorActive && this.events.checklist?.isMobileExpanded()) {
      this.events.checklist.collapseMobile();
      return;
    }
    if (!this.interiorActive && this.events.buildingPanel?.isOpen()) {
      this.events.buildingPanel.dismiss();
      this.pendingBuildingEntry = null;
      this.clearWalkPreview();
      return;
    }
    if (this.interiorActive) {
      const { x: iwx, y: iwy } = this.screenToWorld(sx, sy);
      if (
        this.interiorDef &&
        interiorHitExit(this.interiorDef, iwx, iwy, this.zoom)
      ) {
        this.exitInteriorFromTap();
        return;
      }
      const client = this.canvasLocalToClient(sx, sy);
      if (this.events.buildingPanel?.consumeInteriorCanvasTap?.(client.x, client.y)) {
        return;
      }
      this.handleInteriorScreenTap(sx, sy, sprint);
      return;
    }
    const doorFirst = this.pickBuildingDoorAtScreen(sx, sy);
    if (doorFirst?.door && doorFirst.panelTitle) {
      if (!this.prepareMapTap(doorFirst)) return;
      this.requestWalk(doorFirst.door.x, doorFirst.door.y, sprint, {
        buildingEntry: { panelTitle: doorFirst.panelTitle, door: doorFirst.door },
      });
      return;
    }
    const sceneryTile = this.pickSceneryAtScreen(sx, sy);
    if (sceneryTile) {
      if (!this.prepareMapTap(undefined, sceneryTile.tx, sceneryTile.ty)) return;
      this.requestWalk(sceneryTile.tx, sceneryTile.ty, sprint);
      return;
    }
    const building = this.pickBuildingAtScreen(sx, sy);
    if (building?.door && building.panelTitle) {
      if (!this.prepareMapTap(building)) return;
      this.requestWalk(building.door.x, building.door.y, sprint, {
        buildingEntry: { panelTitle: building.panelTitle, door: building.door },
      });
      return;
    }
    const bench = this.pickBenchAtScreen(sx, sy);
    if (bench) {
      if (!this.prepareMapTap(undefined, bench.seat.x, bench.seat.y)) return;
      if (this.sitOnBench(bench, sprint)) return;
    }
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const tile = this.resolveGroundTap(wx, wy);
    if (tile) {
      const onDoor = getBuildingAtDoor(tile.x, tile.y);
      if (onDoor?.panelTitle && onDoor.door) {
        if (!this.prepareMapTap(onDoor)) return;
        this.requestWalk(onDoor.door.x, onDoor.door.y, sprint, {
          buildingEntry: { panelTitle: onDoor.panelTitle, door: onDoor.door },
        });
        return;
      }
      if (!this.prepareMapTap(undefined, tile.x, tile.y)) return;
      this.requestWalk(tile.x, tile.y, sprint);
    } else this.tapBeyondMapEdge(wx, wy, sprint);
  }

  /** A tap just past the map edge walks to the nearest reachable tile; a far tap cancels and says so. */
  private tapBeyondMapEdge(wx: number, wy: number, sprint: boolean): void {
    const gx = (wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2;
    const gy = (wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2;
    const cx = Math.min(MAP_WIDTH - 1, Math.max(0, Math.round(gx)));
    const cy = Math.min(MAP_HEIGHT - 1, Math.max(0, Math.round(gy)));
    if (Math.hypot(gx - cx, gy - cy) > 6) {
      this.pendingBuildingEntry = null;
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
    }
    if (!this.prepareMapTap(undefined, cx, cy)) return;
    this.requestWalk(cx, cy, sprint);
  }

  private canvasLocalToClient(sx: number, sy: number): { x: number; y: number } {
    const rect = this.canvasEl?.getBoundingClientRect();
    if (!rect) return { x: sx, y: sy };
    return { x: rect.left + sx, y: rect.top + sy };
  }

  private drawPathPreview(): void {
    this.pathGfx.clear();
    if (this.path.length === 0) return;
    if (this.events.buildingPanel?.isOpen()) return;
    const points = [{ x: this.charTx, y: this.charTy }, ...this.path];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (i === points.length - 1 && getBuildingAtDoor(p.x, p.y)) continue;
      const foot = tileFootWorld(p.x, p.y);
      const w = { x: foot.x, y: foot.y - TILE_H / 2 };
      this.pathGfx.moveTo(w.x, w.y - 8);
      this.pathGfx.lineTo(w.x + 6, w.y);
      this.pathGfx.lineTo(w.x, w.y + 8);
      this.pathGfx.lineTo(w.x - 6, w.y);
      this.pathGfx.closePath();
    }
    this.pathGfx.fill({ color: C.path, alpha: 0.2 });
    this.pathGfx.stroke({ width: 2, color: C.path, alpha: 0.8 });
  }

  private syncCharacterGraphic(): void {
    if (this.canvasEl) {
      this.canvasEl.dataset.charTile = JSON.stringify({
        x: Math.round(this.charTx),
        y: Math.round(this.charTy),
      });
    }
  }

  private centerOnCharacter(animate: boolean): void {
    const pos = tileToWorld(this.charTx, this.charTy);
    this.cameraX = -pos.x;
    this.cameraY = -pos.y + 40;
    if (!animate || this.reducedMotion) this.applyCamera();
  }

  private updateCameraFitMargins(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    let left = 16;
    let top = 16;
    let right = 16;
    let bottom = 16;
    const pad = 10;
    const panelInsets = this.events.buildingPanel?.layoutInsets?.();
    const bottomSheet =
      !!panelInsets && this.interiorActive && panelInsets.bottom > 0 && panelInsets.right === 0;
    this.interiorBottomSheet = bottomSheet;
    if (this.interiorActive && !bottomSheet) {
      left = Math.max(left, 24);
      right = Math.max(right, 24);
    }
    if (panelInsets && this.interiorActive) {
      if (bottomSheet) {
        // Phone: the room spans ~90% of the width, centered between the Salir pill and the sheet.
        const side = Math.round(sw * 0.05);
        left = Math.max(left, panelInsets.left + side);
        right = Math.max(right, panelInsets.right + side);
        top = Math.max(top, panelInsets.top);
      } else {
        left = Math.max(left, panelInsets.left + pad, 24 + pad);
        right = Math.max(right, panelInsets.right + pad, 25 + pad);
        top = Math.max(top, panelInsets.top + pad);
      }
      bottom = Math.max(bottom, panelInsets.bottom + pad);
    }
    const checklist = document.querySelector('.checklist');
    if (checklist) {
      const box = checklist.getBoundingClientRect();
      if (box.width > 8 && box.height > 8) {
        const centerY = (box.top + box.bottom) / 2;
        const bottomAnchored =
          checklist.classList.contains('checklist--mobile') ||
          box.bottom >= sh - 96 ||
          centerY > sh * 0.58;
        if (bottomAnchored) {
          bottom = Math.max(bottom, Math.ceil(sh - box.top + pad));
        } else if (box.top <= sh * 0.5) {
          const tallSidebar =
            sw > 900 &&
            !checklist.classList.contains('checklist--collapsed') &&
            box.height > sh * 0.42;
          if (tallSidebar) {
            left = Math.max(left, Math.ceil(box.right + pad));
          } else {
            top = Math.max(top, Math.ceil(box.bottom + pad));
          }
        }
      }
    }
    setCameraFitMargins({ left, top, right, bottom });
    setCameraViewportSize(sw, sh);
  }

  applyCamera(persistHash = true): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.updateCameraFitMargins();
    if (this.interiorActive && this.interiorDef) {
      const bounds = interiorWorldBounds(this.interiorDef, this.interiorBottomSheet);
      const zMin = zoomMinForInteriorBounds(bounds, sw, sh);
      this.zoom = Math.min(1.5, Math.max(zMin, this.zoom));
      const fitted = clampInteriorPanInView(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        bounds,
        sw,
        sh,
      );
      this.cameraX = fitted.cameraX;
      this.cameraY = fitted.cameraY;
      this.zoom = fitted.zoom;
      if (this.canvasEl) {
        const camPx = sw / 2 + this.cameraX * this.zoom;
        const camPy = sh / 2 + this.cameraY * this.zoom;
        const m = cameraFitMargins();
        this.canvasEl.dataset.interiorBox = JSON.stringify({
          l: camPx + bounds.minX * this.zoom,
          r: camPx + bounds.maxX * this.zoom,
          t: camPy + bounds.minY * this.zoom,
          b: camPy + bounds.maxY * this.zoom,
        });
        this.canvasEl.dataset.interiorFree = JSON.stringify({
          l: Math.max(12, m.left),
          r: sw - Math.max(12, m.right),
          t: Math.max(24, m.top),
          b: sh - Math.max(24, m.bottom),
        });
      }
    } else {
      this.zoom = clampZoom(this.zoom, sw, sh);
      const stabilize =
        this.pinchGestureActive && this.zoomSource === 'pointer'
          ? stabilizeCameraDuringPinch
          : stabilizeCameraAfterGesture;
      const hardened = stabilize(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = hardened.cameraX;
      this.cameraY = hardened.cameraY;
      this.zoom = hardened.zoom;
      const zMin = zoomMinForViewport(sw, sh);
      if (this.zoom <= zMin + 0.001) {
        const fitted = clampPanMapFullyInView(
          { cameraX: this.cameraX, cameraY: this.cameraY, zoom: zMin },
          sw,
          sh,
        );
        this.cameraX = fitted.cameraX;
        this.cameraY = fitted.cameraY;
        this.zoom = fitted.zoom;
      }
    }
    this.camera.position.set(sw / 2, sh / 2);
    this.camera.scale.set(1);
    this.world.position.set(this.cameraX * this.zoom, this.cameraY * this.zoom);
    this.world.scale.set(this.zoom);
    this.fitOutskirts(sw, sh);
    if (this.canvasEl) {
      const vis = mapVisibleFractions(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      const cov = viewportMapCoverage(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.canvasEl.dataset.camX = String(this.cameraX);
      this.canvasEl.dataset.camY = String(this.cameraY);
      this.canvasEl.dataset.zoom = String(this.zoom);
      this.canvasEl.dataset.zoomMin = String(zoomMinForViewport(sw, sh));
      this.canvasEl.dataset.mapFullyVisible = isMapFullyVisibleOnScreen(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      )
        ? '1'
        : '0';
      const camPxDrawn = sw / 2 + this.cameraX * this.zoom;
      const camPyDrawn = sh / 2 + this.cameraY * this.zoom;
      this.canvasEl.dataset.camPx = String(camPxDrawn);
      this.canvasEl.dataset.camPy = String(camPyDrawn);
      this.canvasEl.dataset.mapFracW = String(vis.fracW);
      this.canvasEl.dataset.mapFracH = String(vis.fracH);
      const mapRect = mapBoundsOnScreen(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      const margins = cameraFitMargins();
      this.canvasEl.dataset.mapTop = String(mapRect.top);
      this.canvasEl.dataset.mapBottom = String(mapRect.bottom);
      this.canvasEl.dataset.fitTop = String(margins.top);
      this.canvasEl.dataset.fitBottom = String(sh - margins.bottom);
      this.canvasEl.dataset.mapCovW = String(cov.covW);
      this.canvasEl.dataset.mapCovH = String(cov.covH);
      this.canvasEl.dataset.mapIntersects = cov.intersects ? '1' : '0';
      this.canvasEl.dataset.pinchFrame = String(this.pinchFrameSerial);
      this.canvasEl.dataset.zoomSource = this.zoomSource;
      this.canvasEl.dataset.anchorWx = String(-this.cameraX);
      this.canvasEl.dataset.anchorWy = String(-this.cameraY);
      const charScreen = this.followTargetScreen();
      this.canvasEl.dataset.charScreen = JSON.stringify({
        x: Math.round(charScreen.x * 10) / 10,
        y: Math.round(charScreen.y * 10) / 10,
      });
      this.canvasEl.dataset.charTile = JSON.stringify({
        x: Math.round(this.charTx),
        y: Math.round(this.charTy),
      });
      this.updateFootAnchorProbe();
      this.updateBuildingSilhouetteProbe();
      this.updateBuildingInteriorProbe();
      this.updateTreeDeskProbes();
    }
    if (persistHash) {
      writeInteriorToHash(this.interiorActive ? this.interiorDef?.id ?? null : null, {
        x: this.cameraX,
        y: this.cameraY,
        zoom: this.zoom,
      });
    }
    if (
      this.zoomChanged &&
      Math.abs(this.zoom - this.lastChecklistZoom) / Math.max(this.lastChecklistZoom, 0.05) > 0.02
    ) {
      this.events.onChecklist('zoom');
      this.lastChecklistZoom = this.zoom;
      this.zoomChanged = false;
    } else if (this.zoomChanged) {
      this.zoomChanged = false;
    }
    if (this.panDragScreenPx >= 8) {
      this.events.onChecklist('move-camera');
      this.panDragScreenPx = 0;
    }
    this.syncObjectSprites();
    this.cullVisibleTiles();
  }

  private cullVisibleTiles(): void {
    if (!this.app?.screen) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const pad = TILE_W * 1.5;
    const corners = [
      this.screenToWorld(-pad, -pad),
      this.screenToWorld(sw + pad, -pad),
      this.screenToWorld(-pad, sh + pad),
      this.screenToWorld(sw + pad, sh + pad),
    ];
    const minX = Math.min(...corners.map((c) => c.x));
    const maxX = Math.max(...corners.map((c) => c.x));
    const minY = Math.min(...corners.map((c) => c.y));
    const maxY = Math.max(...corners.map((c) => c.y));
    const iso = this.qaIsolation;
    this.avatar?.setVisible(!iso);
    this.noah?.setHidden(!!iso || this.interiorActive);
    this.npcs?.cull({ minX, maxX, minY, maxY }, !!iso || this.interiorActive);
    this.fillActors?.cull({ minX, maxX, minY, maxY }, !!iso || this.interiorActive);
    for (const { g, tx, ty } of this.tileCullEntries) {
      if (iso) {
        g.visible = iso.has(`tile:${tx},${ty}`);
        continue;
      }
      const foot = tileFootWorld(tx, ty);
      g.visible =
        foot.x >= minX - TILE_W &&
        foot.x <= maxX + TILE_W &&
        foot.y >= minY - TILE_H &&
        foot.y <= maxY + TILE_H;
    }
    for (const v of this.objectVisuals.values()) {
      const g = this.objectGraphics.get(v.obj.id);
      if (!g) continue;
      const c = v.cull;
      g.visible = iso
        ? iso.has(v.obj.id)
        : c.x1 >= minX && c.x0 <= maxX && c.y1 >= minY && c.y0 <= maxY;
    }
  }

  /** QA: tile vs building foot global positions must match at every zoom. */
  private updateFootAnchorProbe(): void {
    if (!this.canvasEl) return;
    const tileIdx = INICIO[1] * MAP_WIDTH + INICIO[0];
    const tileG = this.tilesLayer.children[tileIdx] as Container | undefined;
    const buildG = this.objectGraphics.get('building/estudio');
    if (!tileG || !buildG) return;
    const foot = tileFootWorld(INICIO[0], INICIO[1]);
    const vfs = spriteAsset(tileSpriteKey(cells, INICIO[0], INICIO[1])).vfs;
    const expected = this.worldToScreen(foot.x - vfs.x, foot.y - vfs.y);
    const tileGlobal = tileG.getGlobalPosition(new Point());
    const driftTileFormula = Math.hypot(tileGlobal.x - expected.x, tileGlobal.y - expected.y);
    this.canvasEl.dataset.footDriftPx = String(driftTileFormula);
  }

  /** QA: local bounds of caso-1 must not change with zoom (no LOD geometry swap). */
  private updateBuildingSilhouetteProbe(): void {
    if (!this.canvasEl) return;
    const buildG = this.objectGraphics.get('building/estudio');
    if (!buildG) return;
    const b = buildG.getLocalBounds();
    this.canvasEl.dataset.buildingSilhouette = JSON.stringify({
      w: Math.round(b.width * 10) / 10,
      h: Math.round(b.height * 10) / 10,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
    });
  }

  private updateBuildingInteriorProbe(): void {
    if (!this.canvasEl) return;
    const estudio = objects.find((o) => o.id === 'building/estudio');
    if (!estudio) return;
    const { west, south } = footprintCorners(estudio);
    const sx = west.x + (south.x - west.x) * 0.38;
    const sy = west.y + (south.y - west.y) * 0.38 - 40;
    this.canvasEl.dataset.buildingInteriorWallCover = spriteAlphaHit(estudio, sx, sy) ? '1' : '0';
  }

  private updateTreeDeskProbes(): void {
    if (!this.canvasEl) return;
    const tree = treeCanopyTrunkOverlap();
    this.canvasEl.dataset.treeCanopyOverlap = tree.ok ? '1' : '0';
    this.canvasEl.dataset.treeCanopyBottomY = String(Math.round(tree.canopyBottomY * 10) / 10);
    this.canvasEl.dataset.trunkTopY = String(Math.round(tree.trunkTopY * 10) / 10);
    const deskTop = deskTopFillColor(false);
    this.canvasEl.dataset.deskTopColor = deskTop.toString(16).padStart(6, '0');
  }

  private shouldUseMobileFraming(): boolean {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  /** First-load mobile: center the map in the upper viewport (above future sheet). */
  reframeMobileDefaultViewForQa(): void {
    if (!this.shouldUseMobileFraming()) return;
    this.frameMobileDefaultView();
    this.applyCamera(false);
  }

  /**
   * Desktop first load: centred on the character, zoomed so the Estudio and the nearest houses
   * (Volaris, Mentoría, P&G, roofs included) fit around it.
   */
  private frameDesktopFirstLoadView(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const char = tileToWorld(this.charTx, this.charTy);
    let hw = 0;
    let hh = 0;
    for (const name of DESKTOP_FIRST_LOAD_BUILDINGS) {
      const b = getBuildingByName(name);
      if (!b) continue;
      const x0 = b.footprintX ?? b.x;
      const y0 = b.footprintY ?? b.y;
      const w = b.w ?? 1;
      const h = b.h ?? 1;
      for (const [cx, cy] of [
        [x0, y0],
        [x0 + w, y0],
        [x0, y0 + h],
        [x0 + w, y0 + h],
      ]) {
        const c = tileToWorld(cx, cy);
        hw = Math.max(hw, Math.abs(c.x - char.x));
        hh = Math.max(hh, Math.abs(c.y - DESKTOP_ROOF_RISE - char.y), Math.abs(c.y - char.y));
      }
    }
    const fit = Math.min(sw / (2 * (hw + 60)), sh / (2 * (hh + 40)));
    this.zoom = clampZoom(Math.min(1, Math.max(0.4, fit)), sw, sh);
    this.cameraX = -char.x;
    this.cameraY = -char.y;
    const hardened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = hardened.cameraX;
    this.cameraY = hardened.cameraY;
    this.zoom = hardened.zoom;
  }

  /** Phone first load: Estudio and the first house (Volaris) fill the width, character at the door. */
  private frameMobileFirstLoadView(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const estudio = getBuildingByName('estudio');
    const volaris = getBuildingByName('volaris');
    if (!estudio || !volaris) {
      this.frameMobileDefaultView();
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const b of [estudio, volaris]) {
      const x0 = b.footprintX ?? b.x;
      const y0 = b.footprintY ?? b.y;
      const w = b.w ?? 1;
      const h = b.h ?? 1;
      const corners = [
        tileToWorld(x0, y0),
        tileToWorld(x0 + w, y0),
        tileToWorld(x0, y0 + h),
        tileToWorld(x0 + w, y0 + h),
      ];
      for (const c of corners) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
      }
    }
    const roofRise = 140;
    const side = 12;
    const zoom = clampZoom((sw - side * 2) / (maxX - minX), sw, sh);
    const cx = (minX + maxX) / 2;
    const cy = (minY - roofRise + maxY) / 2;
    setCameraFitMargins({ left: 20, right: 20, top: 48, bottom: 96 });
    this.zoom = zoom;
    this.cameraX = -cx;
    this.cameraY = -cy + (sh * 0.42 - sh / 2) / zoom;
    const hardened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = hardened.cameraX;
    this.cameraY = hardened.cameraY;
    this.zoom = hardened.zoom;
    setCameraFitMargins({ left: MAP_FIT_MARGIN_PX, right: MAP_FIT_MARGIN_PX, top: MAP_FIT_MARGIN_PX, bottom: MAP_FIT_MARGIN_PX });
  }

  private frameMobileDefaultView(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    setCameraFitMargins({ left: 20, right: 20, top: 48, bottom: 96 });
    const bounds = mapWorldBounds();
    this.zoom = clampZoom(zoomMinForViewport(sw, sh) * 0.92, sw, sh);
    const worldCx = (bounds.minX + bounds.maxX) / 2;
    const worldCy = (bounds.minY + bounds.maxY) / 2 - TILE_H * 2.5;
    this.cameraX = -worldCx;
    this.cameraY = -worldCy;
    const hardened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = hardened.cameraX;
    this.cameraY = hardened.cameraY;
    this.zoom = hardened.zoom;
    setCameraFitMargins({ left: MAP_FIT_MARGIN_PX, right: MAP_FIT_MARGIN_PX, top: MAP_FIT_MARGIN_PX, bottom: MAP_FIT_MARGIN_PX });
  }

  /** Wheel / two-finger scroll: move the view by screen pixels (content follows the fingers). */
  private panByScreen(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.suspendCameraFollow();
    this.cameraX += dx / this.zoom;
    this.cameraY += dy / this.zoom;
    this.panDragScreenPx += Math.hypot(dx, dy);
    this.applyCamera();
  }

  private setZoom(next: number, anchorScreen?: { x: number; y: number }): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    if (this.follow.engaged) anchorScreen = this.followTargetScreen();
    const camPx = sw / 2 + this.cameraX * this.zoom;
    const camPy = sh / 2 + this.cameraY * this.zoom;
    if (anchorScreen) {
      const nextCam = zoomAtScreenAnchor(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
        camPx,
        camPy,
        next,
        anchorScreen,
      );
      this.cameraX = nextCam.cameraX;
      this.cameraY = nextCam.cameraY;
      this.zoom = nextCam.zoom;
    } else {
      this.zoom = clampZoom(next, sw, sh);
    }
    const softened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = softened.cameraX;
    this.cameraY = softened.cameraY;
    this.zoom = softened.zoom;
    this.zoomChanged = true;
    this.applyCamera();
  }

  private endZoomGesture(): void {
    this.pinchSession = null;
    this.webkitGestureSession = null;
    this.pinchGestureActive = false;
    this.gestureActive = false;
    this.zoomSource = 'none';
    this.touchOnlyPinch = false;
    this.drawPathPreview();
    this.suppressTapUntil = performance.now() + 250;
    this.panMoved = true;
    this.panDragScreenPx = 0;
    document.body.classList.remove('is-canvas-dragging');
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const stable = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = stable.cameraX;
    this.cameraY = stable.cameraY;
    this.zoom = stable.zoom;
    this.applyCamera(false);
    this.flushPendingViewport();
  }

  private clearDeferredTap(): void {
    if (this.deferredTapTimer !== null) {
      clearTimeout(this.deferredTapTimer);
      this.deferredTapTimer = null;
    }
  }

  private onWindowViewportChange(): void {
    if (
      this.pointers.size > 0 ||
      this.pinchGestureActive ||
      this.gestureActive ||
      this.zoomSource !== 'none'
    ) {
      this.pendingViewportApply = true;
      return;
    }
    this.applyCamera(false);
  }

  private flushPendingViewport(): void {
    if (!this.pendingViewportApply) return;
    this.pendingViewportApply = false;
    if (this.pointers.size > 0 || this.pinchGestureActive || this.gestureActive) return;
    this.applyCamera(false);
  }

  private applyPinchCamera(next: { cameraX: number; cameraY: number; zoom: number }): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    if (this.follow.engaged) {
      // While following, pinch only zooms, about the character, so it stays where it is on screen.
      next = zoomAtScreenAnchor(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
        0,
        0,
        next.zoom,
        this.followTargetScreen(),
      );
    }
    this.cameraX = next.cameraX;
    this.cameraY = next.cameraY;
    this.zoom = clampZoom(next.zoom, sw, sh);
    this.pinchFrameSerial += 1;
    this.zoomChanged = true;
    this.applyCamera(false);
  }

  /** Pinch baseline uses post-clamp camera so the first pinch frame does not snap. */
  private syncPinchSessionBaseline(mid: { x: number; y: number }, dist: number): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const stable = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = stable.cameraX;
    this.cameraY = stable.cameraY;
    this.zoom = stable.zoom;
    if (dist >= 10 && Number.isFinite(dist)) {
      this.pinchSession = {
        startDist: dist,
        startZoom: this.zoom,
        startCamX: this.cameraX,
        startCamY: this.cameraY,
        startMid: mid,
      };
    } else {
      this.pinchSession = null;
    }
  }

  /** `panSlopPx`: a press that strayed no farther than this still taps, even if it nudged the camera. */
  private shouldBlockTap(panSlopPx = 0): boolean {
    return (
      this.interiorActive ||
      (this.panMoved && (panSlopPx === 0 || this.tapDriftPx > panSlopPx)) ||
      this.pinchGestureActive ||
      this.hadMultiPointerGesture ||
      this.secondFingerArrived ||
      this.pointers.size >= 2 ||
      performance.now() < this.suppressTapUntil
    );
  }

  private pointerMidpoint(): { x: number; y: number } | null {
    if (this.pointers.size < 2) return null;
    const pts = [...this.pointers.values()];
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
    };
  }

  private pointerDistance(): number {
    const pts = [...this.pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private touchPairMidpoint(t0: Touch, t1: Touch): { x: number; y: number } {
    return { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
  }

  private touchPairDistance(t0: Touch, t1: Touch): number {
    return Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  }

  private rebaselinePinchSession(): void {
    if (this.zoomSource === 'gesture') return;
    const mid = this.pointerMidpoint();
    if (!mid) return;
    const dist = this.pointerDistance();
    this.drawPathPreview();
    this.zoomSource = 'pointer';
    this.pinchGestureActive = true;
    this.gestureActive = true;
    this.hadMultiPointerGesture = true;
    this.panMoved = true;
    this.panDragScreenPx = 0;
    this.webkitGestureSession = null;
    this.clearDeferredTap();
    this.syncPinchSessionBaseline(mid, dist);
  }

  private beginPinchAtMid(mid: { x: number; y: number }, dist: number): void {
    if (this.zoomSource === 'gesture') return;
    this.drawPathPreview();
    this.zoomSource = 'pointer';
    this.pinchGestureActive = true;
    this.gestureActive = true;
    this.hadMultiPointerGesture = true;
    this.panMoved = true;
    this.panDragScreenPx = 0;
    this.webkitGestureSession = null;
    this.clearDeferredTap();
    this.syncPinchSessionBaseline(mid, dist);
  }

  private transitionToSingleFingerPan(remaining: { x: number; y: number }): void {
    this.pinchSession = null;
    this.pinchGestureActive = false;
    this.gestureActive = false;
    this.zoomSource = 'none';
    this.touchOnlyPinch = false;
    this.hadMultiPointerGesture = true;
    this.panMoved = true;
    this.panDragScreenPx = 0;
    this.suppressTapUntil = performance.now() + 250;
    this.clearDeferredTap();
    this.lastPanPos = { x: remaining.x, y: remaining.y };
    this.tapStart = { x: remaining.x, y: remaining.y, t: performance.now() };
  }

  private onPointerCountChanged(prevCount: number, newCount: number): void {
    if (newCount >= 2 && this.zoomSource !== 'gesture') {
      this.rebaselinePinchSession();
    } else if (prevCount >= 2 && newCount === 1) {
      const remaining = [...this.pointers.values()][0];
      this.transitionToSingleFingerPan(remaining);
    }
  }

  /**
   * Touch taps on the map, and every tap (touch or mouse) inside an interior, resolve here
   * after the pointer is released so both input types share one picking path.
   */
  private tryScheduleDeferredTap(e: PointerEvent): void {
    const tapStart = this.tapStart;
    if (!tapStart) return;
    this.clearDeferredTap();
    if (this.pixiTapGestureSerial === this.pointerGestureSerial) return;
    if (e.pointerType !== 'touch' && !this.interiorActive) return;

    const hadMulti = this.hadMultiPointerGesture;
    const hadSecond = this.secondFingerArrived;
    if (hadMulti || hadSecond || this.panMoved) return;

    const dist = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    if (dist >= 10) return;
    // Rooms have no long-press action, so any still press is a tap there. On the map, press length
    // comes from input timestamps: handlers and timers run late on a busy main thread.
    if (!this.interiorActive && e.timeStamp - this.tapDownStamp > 450) return;
    const upStamp = e.timeStamp;
    const gestureSerial = this.pointerGestureSerial;

    const fire = () => {
      this.deferredTapTimer = null;
      if (this.pointers.size > 0) return;
      if (this.pointerGestureSerial !== gestureSerial) return;
      if (this.pixiTapGestureSerial === gestureSerial) return;
      if (upStamp < this.suppressTapUntil) return;
      const canvas = this.canvasEl;
      if (!canvas) return;
      const double = upStamp - this.lastTapTime < 320;
      this.lastTapTime = upStamp;
      const rect = canvas.getBoundingClientRect();
      this.handleScreenTap(e.clientX - rect.left, e.clientY - rect.top, double);
    };

    // Always async so a Pixi pointertap dispatched by this same pointerup can claim the tap first.
    const waitMs = Math.max(0, this.firstPointerDownAt + 120 - performance.now());
    this.deferredTapTimer = setTimeout(fire, waitMs);
  }

  private applyActivePinch(mid: { x: number; y: number }, dist: number): void {
    if (this.zoomSource !== 'pointer' || !this.pinchSession) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const next = cameraFromPinchSession(this.pinchSession, dist, mid, sw, sh);
    if (!next) return;
    this.applyPinchCamera(next);
    if (this.follow.engaged) {
      // Follow zoomed about the character, not the fingers: restart the gesture from here so
      // the pinch carries on smoothly if the walk ends before the fingers lift.
      this.pinchSession = {
        startDist: dist,
        startZoom: this.zoom,
        startCamX: this.cameraX,
        startCamY: this.cameraY,
        startMid: mid,
      };
    }
  }

  /** Follow moved the camera mid-gesture: move the gesture baselines with it. */
  private shiftGestureBaselines(dx: number, dy: number): void {
    if (this.pinchSession) {
      this.pinchSession.startCamX += dx;
      this.pinchSession.startCamY += dy;
    }
    if (this.webkitGestureSession) {
      this.webkitGestureSession.startCamX += dx;
      this.webkitGestureSession.startCamY += dy;
    }
  }

  private bindInput(): void {
    const canvas = this.canvasEl!;
    const appRoot = document.getElementById('app');
    canvas.style.touchAction = 'none';
    if (appRoot) appRoot.style.touchAction = 'none';

    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false },
    );

    const uiRoot = document.getElementById('ui-root');
    const isGameTouchTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof Node)) return false;
      if (uiRoot?.contains(target)) return false;
      return canvas.contains(target) || target === canvas || appRoot?.contains(target);
    };
    const preventNativeGesture = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener('gesturestart', preventNativeGesture, { passive: false, capture: true });
    document.addEventListener('gesturechange', preventNativeGesture, { passive: false, capture: true });
    document.addEventListener('gestureend', preventNativeGesture, { passive: false, capture: true });

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      if (this.zoomSource === 'pointer') return;
      const ge = e as unknown as { scale: number; clientX: number; clientY: number };
      this.zoomSource = 'gesture';
      this.pinchGestureActive = true;
      this.gestureActive = true;
      this.hadMultiPointerGesture = true;
      this.panMoved = true;
      this.pinchSession = null;
      this.webkitGestureSession = {
        startScale: ge.scale || 1,
        startZoom: this.zoom,
        startCamX: this.cameraX,
        startCamY: this.cameraY,
        anchor: { x: ge.clientX, y: ge.clientY },
      };
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (this.zoomSource !== 'gesture' || !this.webkitGestureSession) return;
      const ge = e as unknown as { scale: number; clientX: number; clientY: number };
      const s = this.webkitGestureSession;
      const ratio = (ge.scale || 1) / (s.startScale || 1);
      if (!Number.isFinite(ratio)) return;
      const sw = this.app.screen.width;
      const sh = this.app.screen.height;
      const startCamPx = sw / 2 + s.startCamX * s.startZoom;
      const startCamPy = sh / 2 + s.startCamY * s.startZoom;
      const anchor = { x: ge.clientX, y: ge.clientY };
      let next = zoomAtScreenAnchor(
        { cameraX: s.startCamX, cameraY: s.startCamY, zoom: s.startZoom },
        sw,
        sh,
        startCamPx,
        startCamPy,
        s.startZoom * ratio,
        anchor,
      );
      next = stabilizeCameraAfterGesture(next, sw, sh);
      this.applyPinchCamera(next);
      if (this.follow.engaged) {
        this.webkitGestureSession = {
          startScale: ge.scale || 1,
          startZoom: this.zoom,
          startCamX: this.cameraX,
          startCamY: this.cameraY,
          anchor,
        };
      }
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      if (this.zoomSource === 'gesture') this.endZoomGesture();
    };

    for (const [type, fn] of [
      ['gesturestart', onGestureStart],
      ['gesturechange', onGestureChange],
      ['gestureend', onGestureEnd],
    ] as const) {
      canvas.addEventListener(type, fn, { passive: false });
    }

    const isTypingTarget = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(t.tagName));
    window.addEventListener('keydown', (e) => {
      this.noteAvatarInput();
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        if (!e.repeat && !this.keys.has(k)) {
          this.startCameraFollow();
          this.armDoorPush();
        }
        this.keys.add(k);
        // A press shorter than a frame never reaches updateMovement on slow devices.
        if (this.seatedBench && !this.interiorActive) this.standThen(null);
        e.preventDefault();
      }
      if (e.key === 'Shift') this.shiftHeld = true;
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !isTypingTarget(e.target)) {
        if (this.seatedBench && !this.interiorActive) {
          this.standThen(null);
          e.preventDefault();
        } else if (this.enterNearbyDoorFromKeyboard()) e.preventDefault();
        else if (this.playerNearNoah() && !this.noah.busy()) {
          this.startNoahTalk();
          e.preventDefault();
        } else if (this.sitOnNearbyBench()) e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.shiftHeld = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.noteAvatarInput();
        if (this.pinchGestureActive || this.zoomSource === 'pointer' || this.zoomSource === 'gesture') {
          return;
        }
        const unit =
          e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 24 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 480 : 1;
        let dx = e.deltaX * unit;
        let dy = e.deltaY * unit;
        // Trackpad pinch arrives as ctrl+wheel; ctrl/cmd + mouse wheel zooms too. Everything else pans.
        if (e.ctrlKey || e.metaKey) {
          this.zoomSource = 'wheel';
          // Pinch deltas are small and frequent; mouse notches are ~100 px.
          const rate = Math.abs(dy) < 50 ? 1 / 100 : 1 / 450;
          const d = Math.max(-240, Math.min(240, dy));
          const rect = canvas.getBoundingClientRect();
          this.setZoom(this.zoom * Math.pow(2, -d * rate), { x: e.clientX - rect.left, y: e.clientY - rect.top });
          this.zoomSource = 'none';
          return;
        }
        if (e.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }
        this.panByScreen(-dx, -dy);
      },
      { passive: false },
    );

    let lastTouchCount = 0;

    const onTouchPinchStart = (e: TouchEvent) => {
      if (!isGameTouchTarget(e.target)) return;
      if (this.zoomSource === 'gesture') return;
      const n = e.touches.length;
      if (n >= 1) e.preventDefault();
      if (n < 2) {
        lastTouchCount = n;
        return;
      }
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const mid = this.touchPairMidpoint(t0, t1);
      const dist = this.touchPairDistance(t0, t1);
      if (this.pointers.size >= 2) {
        lastTouchCount = n;
        return;
      }
      this.touchOnlyPinch = true;
      if (lastTouchCount >= 2 || this.pinchGestureActive) {
        this.beginPinchAtMid(mid, dist);
      } else {
        this.beginPinchAtMid(mid, dist);
      }
      lastTouchCount = n;
    };

    const onTouchPinchMove = (e: TouchEvent) => {
      if (!isGameTouchTarget(e.target)) return;
      if (e.touches.length >= 1) e.preventDefault();
      if (e.touches.length >= 2) {
        if (this.pointers.size >= 2) return;
        if (this.touchOnlyPinch && this.zoomSource === 'pointer') {
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          if (lastTouchCount !== e.touches.length) {
            this.beginPinchAtMid(this.touchPairMidpoint(t0, t1), this.touchPairDistance(t0, t1));
          }
          this.applyActivePinch(this.touchPairMidpoint(t0, t1), this.touchPairDistance(t0, t1));
        }
      }
      lastTouchCount = e.touches.length;
    };

    const endTouchPinch = () => {
      if (!this.touchOnlyPinch) return;
      if (this.pointers.size > 0) return;
      this.touchOnlyPinch = false;
      this.endZoomGesture();
    };

    canvas.addEventListener('touchstart', onTouchPinchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchPinchMove, { passive: false });
    canvas.addEventListener(
      'touchend',
      (e) => {
        lastTouchCount = e.touches.length;
        if (e.touches.length < 2) endTouchPinch();
      },
      { passive: true },
    );

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.touchOnlyPinch = false;
      }
      const prevCount = this.pointers.size;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.pointerGestureSerial += 1;
        this.pixiTapGestureSerial = -1;
        this.firstPointerDownAt = performance.now();
        this.secondFingerArrived = false;
        if (!this.hadMultiPointerGesture) {
          this.panMoved = false;
          this.panDragScreenPx = 0;
        }
        this.tapDriftPx = 0;
        this.lastPanPos = { x: e.clientX, y: e.clientY };
        this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
        this.tapDownStamp = e.timeStamp;
      }
      if (this.pointers.size >= 2) {
        this.secondFingerArrived = true;
        this.clearDeferredTap();
      }
      this.onPointerCountChanged(prevCount, this.pointers.size);
      if (e.pointerType !== 'touch') {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (
        this.zoomSource === 'pointer' &&
        this.pointers.size >= 2 &&
        this.pinchSession
      ) {
        e.preventDefault();
        const mid = this.pointerMidpoint()!;
        const dist = this.pointerDistance();
        this.applyActivePinch(mid, dist);
        return;
      }

      if (this.pointers.size === 1 && this.lastPanPos && !this.pinchGestureActive && this.tapStart) {
        const dx = e.clientX - this.lastPanPos.x;
        const dy = e.clientY - this.lastPanPos.y;
        const panThreshold = e.pointerType === 'touch' ? 14 : 4;
        const totalFromTap = Math.hypot(
          e.clientX - this.tapStart.x,
          e.clientY - this.tapStart.y,
        );
        this.tapDriftPx = Math.max(this.tapDriftPx, totalFromTap);
        if (totalFromTap > panThreshold) {
          this.panMoved = true;
          document.body.classList.add('is-canvas-dragging');
          this.suspendCameraFollow();
          this.cameraX += dx / this.zoom;
          this.cameraY += dy / this.zoom;
          this.lastPanPos = { x: e.clientX, y: e.clientY };
          this.panDragScreenPx += Math.hypot(dx, dy);
          this.applyCamera();
        }
      }
    };

    const endPointerGesture = (e: PointerEvent) => {
      const wasPinch = this.pinchGestureActive;
      const prevCount = this.pointers.size;
      this.pointers.delete(e.pointerId);
      this.onPointerCountChanged(prevCount, this.pointers.size);

      if (this.pointers.size === 0) {
        if (wasPinch || this.hadMultiPointerGesture) {
          this.suppressTapUntil = performance.now() + 250;
        }
        if (this.zoomSource === 'pointer') {
          this.endZoomGesture();
        } else if (!wasPinch) {
          this.applyCamera(true);
        }
        this.tryScheduleDeferredTap(e);
        this.lastPanPos = null;
        this.tapStart = null;
        this.hadMultiPointerGesture = false;
        this.secondFingerArrived = false;
        document.body.classList.remove('is-canvas-dragging');
      }

      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerdown', () => this.noteAvatarInput());
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointerGesture);
    canvas.addEventListener('pointercancel', endPointerGesture);
    canvas.addEventListener('lostpointercapture', endPointerGesture);
    canvas.addEventListener(
      'touchcancel',
      () => {
        this.touchOnlyPinch = false;
        if (this.zoomSource === 'pointer' || this.pinchGestureActive) {
          this.pointers.clear();
          this.endZoomGesture();
        }
      },
      { passive: true },
    );
  }

  private update(): void {
    this.updateMovement();
    this.updateAvatars(Math.min(0.25, this.app.ticker.elapsedMS / 1000));
    this.updateCameraFollow();
    if (!this.interiorActive) {
      const dt = Math.min(0.25, this.app.ticker.elapsedMS / 1000);
      this.npcs.update(dt);
      this.fillActors?.update(dt);
    }
  }

  private followTargetWorld(): { x: number; y: number } {
    const foot = this.interiorActive
      ? tileToWorld(this.interiorCharTx, this.interiorCharTy)
      : tileToWorld(this.charTx, this.charTy);
    return { x: foot.x, y: foot.y - CHAR_BODY_CENTRE_RISE };
  }

  private followTargetScreen(): { x: number; y: number } {
    const t = this.followTargetWorld();
    return this.worldToScreen(t.x, t.y);
  }

  private startCameraFollow(): void {
    this.follow.suspended = false;
    this.follow.engaged = true;
  }

  private suspendCameraFollow(): void {
    this.follow.suspended = true;
    this.follow.engaged = false;
    this.follow.vx = 0;
    this.follow.vy = 0;
  }

  private updateCameraFollow(): void {
    const f = this.follow;
    const t = this.followTargetWorld();
    const scope = this.interiorActive ? `room:${this.interiorDef?.id ?? ''}` : 'map';
    const jumped =
      f.scope !== scope ||
      !Number.isFinite(f.prevX) ||
      Math.hypot(t.x - f.prevX, t.y - f.prevY) > FOLLOW_TELEPORT_WORLD;
    const stepX = jumped ? 0 : t.x - f.prevX;
    const stepY = jumped ? 0 : t.y - f.prevY;
    f.prevX = t.x;
    f.prevY = t.y;
    f.scope = scope;
    if (jumped) {
      // Entering / leaving a room or a teleport places its own camera; follow resumes on the next walk.
      f.engaged = false;
      f.vx = 0;
      f.vy = 0;
    }
    if (this.canvasEl) {
      this.canvasEl.dataset.follow = f.suspended ? 'suspended' : f.engaged ? 'engaged' : 'idle';
    }
    if (jumped || f.suspended) return;
    const moved = Math.hypot(stepX, stepY) > 1e-4;
    const walking = this.interiorActive ? this.interiorPath.length > 0 : this.path.length > 0;
    if (moved || walking) f.engaged = true;
    if (!f.engaged) return;

    const dt = Math.min(0.1, this.app.ticker.deltaMS / 1000);
    const camBeforeX = this.cameraX;
    const camBeforeY = this.cameraY;
    // Offset of the character from screen centre, in world px, after moving with it this frame.
    let ox = this.cameraX - stepX + t.x;
    let oy = this.cameraY - stepY + t.y;
    if (this.reducedMotion) {
      ox = 0;
      oy = 0;
      f.vx = 0;
      f.vy = 0;
    } else {
      const sx = smoothDampToZero(ox, f.vx, FOLLOW_SMOOTH_S, dt);
      const sy = smoothDampToZero(oy, f.vy, FOLLOW_SMOOTH_S, dt);
      ox = sx.offset;
      oy = sy.offset;
      f.vx = sx.velocity;
      f.vy = sy.velocity;
    }
    const wantX = ox - t.x;
    const wantY = oy - t.y;
    this.cameraX = wantX;
    this.cameraY = wantY;
    this.applyCamera(false);
    this.shiftGestureBaselines(this.cameraX - camBeforeX, this.cameraY - camBeforeY);
    // Map / room bounds held the camera back: drop the spring's speed on that axis (no wind-up).
    const heldX = Math.abs(this.cameraX - wantX) > 0.01;
    const heldY = Math.abs(this.cameraY - wantY) > 0.01;
    if (heldX) f.vx = 0;
    if (heldY) f.vy = 0;
    const camMoved = Math.hypot(this.cameraX - camBeforeX, this.cameraY - camBeforeY);
    const residual = Math.hypot(heldX ? 0 : ox, heldY ? 0 : oy);
    if (!moved && !walking && camMoved < 0.05 && residual < 0.5) {
      f.engaged = false;
      f.vx = 0;
      f.vy = 0;
      this.applyCamera(true);
    }
  }

  private updateMovement(): void {
    this.syncObjectSprites();
    if (this.doorCooldown > 0) {
      this.doorCooldown -= this.app.ticker.deltaMS;
    }
    this.leaveBenchIfStood();
    if (this.keys.size > 0) {
      let dx = 0;
      let dy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
      if (this.interiorActive && this.interiorDef) {
        if (dx !== 0 || dy !== 0) {
          this.interiorPath = [];
          const sprint = this.shiftHeld;
          this.sprint = sprint;
          this.charState = sprint ? 'sprint' : 'walk';
          const grid = this.interiorGrid;
          const next = this.keyboardStep(
            this.interiorCharTx,
            this.interiorCharTy,
            dx,
            dy,
            sprint,
            (x, y) => !!grid[y]?.[x]?.walkable,
          );
          this.interiorCharTx = next.x;
          this.interiorCharTy = next.y;
          const def = this.interiorDef;
          const rt = { x: Math.round(this.interiorCharTx), y: Math.round(this.interiorCharTy) };
          // Only stepping onto the mat toward the door leaves; crossing the mat sideways does not.
          const towardDoor = def.exitFace === '+x' ? dx > 0 : dy > 0;
          if (rt.x === def.exit.x && rt.y === def.exit.y && towardDoor) {
            this.exitInterior();
          }
        }
        return;
      }
      if ((dx !== 0 || dy !== 0) && this.seatedBench) {
        // Keys held through the stand-up walk on once the player is back on the front cell.
        this.standThen(null);
      } else if (dx !== 0 || dy !== 0) {
        this.path = [];
        this.drawPathPreview();
        const sprint = this.shiftHeld;
        this.sprint = sprint;
        this.charState = sprint ? 'sprint' : 'walk';
        this.pendingNoahTalk = false;
        this.dropBenchWalk();
        const tileBefore = this.roundedCharTile();
        const next = this.keyboardStep(this.charTx, this.charTy, dx, dy, sprint, (x, y) => !!cells[y]?.[x]?.walkable);
        this.charTx = next.x;
        this.charTy = next.y;
        const tileAfter = this.roundedCharTile();
        const stepped = tileBefore.x !== tileAfter.x || tileBefore.y !== tileAfter.y;
        if (stepped) {
          this.doorPushArmed = null;
          this.events.onChecklist('walk-keys');
        }
        this.syncCharacterGraphic();
        this.tryEnterDoorFromKeyboard(dx, dy, stepped);
      } else if (this.path.length === 0) {
        this.charState = 'idle';
        this.syncCharacterGraphic();
      }
    }

    if (this.path.length > 0) {
      // Distance left over at a path node carries on toward the next one (steady speed at any fps).
      let step = walkStepWorld(this.sprint, this.app.ticker.deltaMS);
      while (this.path.length > 0 && step > 0) {
        const target = this.path[0];
        const dx = target.x - this.charTx;
        const dy = target.y - this.charTy;
        const dist = tileMoveWorld(dx, dy);
        if (dist > step) {
          this.charTx += (dx / dist) * step;
          this.charTy += (dy / dist) * step;
          this.charState = this.sprint ? 'sprint' : 'walk';
          break;
        }
        step -= dist;
        this.charTx = target.x;
        this.charTy = target.y;
        this.path.shift();
        this.drawPathPreview();
        if (this.path.length === 0) {
          this.charState = 'idle';
          this.sprint = false;
          this.tryArriveAtDoorTile(Math.round(this.charTx), Math.round(this.charTy));
          if (this.pendingNoahTalk) {
            this.pendingNoahTalk = false;
            const s = this.noahTalkSpot;
            const onSpot = !!s && Math.round(this.charTx) === s.x && Math.round(this.charTy) === s.y;
            if (onSpot || this.playerNearNoah()) this.startNoahTalk();
          }
          if (this.pendingBench) this.arriveAtBench();
        }
      }
      this.syncCharacterGraphic();
    }

    if (this.interiorActive && this.interiorPath.length > 0) {
      this.updateInteriorWalk();
    }
  }

  private doorCooldown = 0;

  /**
   * One frame of keyboard walking: the same world speed in every direction, and a diagonal pushed
   * into a wall slides along it at full speed.
   */
  private keyboardStep(
    x: number,
    y: number,
    dx: number,
    dy: number,
    sprint: boolean,
    walkable: (tx: number, ty: number) => boolean,
  ): { x: number; y: number } {
    const world = walkStepWorld(sprint, this.app.ticker.deltaMS);
    const k = world / tileMoveWorld(dx, dy);
    const next = slideStep(x, y, dx * k, dy * k, walkable);
    if (dx !== 0 && dy !== 0 && (next.x === x) !== (next.y === y)) {
      const ax = next.x !== x ? dx : 0;
      const ay = next.y !== y ? dy : 0;
      const ka = world / tileMoveWorld(ax, ay);
      return slideStep(x, y, ax * ka, ay * ka, walkable);
    }
    return next;
  }

  private roundedCharTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
  }

  /** Enter interior only when idle on the door tile (never mid-path). */
  private tryArriveAtDoorTile(tx: number, ty: number): void {
    if (this.interiorActive) return;
    if (this.path.length > 0) return;
    if (this.doorCooldown > 0) return;
    const building = getBuildingAtDoor(tx, ty);
    if (!building?.panelTitle || !building.door) return;

    if (!this.pendingBuildingEntry) return;
    const d = this.pendingBuildingEntry.door;
    const onPendingDoor = tx === d.x && ty === d.y;
    const adjacentPending =
      Math.abs(tx - d.x) + Math.abs(ty - d.y) === 1 &&
      getBuildingAtDoor(d.x, d.y)?.panelTitle === this.pendingBuildingEntry.panelTitle;
    if (!onPendingDoor && !adjacentPending) return;
    if (!onPendingDoor) {
      this.charTx = d.x;
      this.charTy = d.y;
      tx = d.x;
      ty = d.y;
    }
    this.enterBuildingFromDoor(building);
  }

  private enterBuildingFromDoor(building: MapObject): void {
    if (!building.door || !building.panelTitle) return;
    this.pendingBuildingEntry = null;
    this.path = [];
    this.drawPathPreview();
    this.doorCooldown = 120;
    this.mapReturnDoor = { x: building.door.x, y: building.door.y };
    this.charTx = building.door.x;
    this.charTy = building.door.y;
    this.charState = 'idle';
    this.syncCharacterGraphic();
    this.events.onEnterBuilding(building.name, building.panelTitle);
    this.events.onChecklist('enter-building');
  }

  /**
   * Door access tile on which a movement key went down. Standing on a door (after leaving the room,
   * or a tap that stopped there) only lets a fresh press walk in, never a key held from before.
   */
  private doorPushArmed: string | null = null;

  private armDoorPush(): void {
    if (this.interiorActive) return;
    const t = this.roundedCharTile();
    this.doorPushArmed = getBuildingAtDoor(t.x, t.y)?.panelTitle ? `${t.x},${t.y}` : null;
  }

  /**
   * Arrow/WASD: stepping onto a door's access tile toward the building enters, and so does a key
   * pressed toward it while already standing there.
   */
  private tryEnterDoorFromKeyboard(dx: number, dy: number, stepped: boolean): void {
    if (this.interiorActive || this.doorCooldown > 0) return;
    const t = this.roundedCharTile();
    if (!stepped && this.doorPushArmed !== `${t.x},${t.y}`) return;
    const building = getBuildingAtDoor(t.x, t.y);
    if (!building?.panelTitle) return;
    const inward = doorInwardStep(building);
    if (!inward || dx * inward.x + dy * inward.y <= 0) return;
    this.enterBuildingFromDoor(building);
  }

  /** Enter / Space: on a door's access tile enters; next to one walks onto it and enters. */
  private enterNearbyDoorFromKeyboard(): boolean {
    if (this.interiorActive || this.doorCooldown > 0) return false;
    const t = this.roundedCharTile();
    const onDoor = getBuildingAtDoor(t.x, t.y);
    if (onDoor?.panelTitle) {
      this.enterBuildingFromDoor(onDoor);
      return true;
    }
    const near = objects.find(
      (o) =>
        o.type === 'building' &&
        o.panelTitle &&
        o.door &&
        Math.max(Math.abs(o.door.x - t.x), Math.abs(o.door.y - t.y)) === 1,
    );
    if (!near?.door || !near.panelTitle) return false;
    this.requestWalk(near.door.x, near.door.y, false, {
      buildingEntry: { panelTitle: near.panelTitle, door: near.door },
    });
    return true;
  }

  private async runFade(active: boolean): Promise<void> {
    if (!this.fadeEl) return;
    if (this.reducedMotion) {
      this.fadeEl.classList.toggle('scene-fade--active', active);
      return;
    }
    this.fadeEl.classList.toggle('scene-fade--active', active);
    await new Promise((r) => setTimeout(r, active ? 280 : 280));
  }

  private fitInteriorCamera(): void {
    if (!this.interiorDef) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.updateCameraFitMargins();
    const fitted = fitCameraToInteriorBounds(
      interiorWorldBounds(this.interiorDef, this.interiorBottomSheet),
      sw,
      sh,
    );
    this.cameraX = fitted.cameraX;
    this.cameraY = fitted.cameraY;
    this.zoom = fitted.zoom;
  }

  private restoreOutdoorCameraAfterExit(outdoorCam?: { x: number; y: number; zoom: number }): void {
    const saved = outdoorCam ?? this.outdoorCamBeforeInterior;
    if (saved) {
      this.cameraX = saved.x;
      this.cameraY = saved.y;
      this.zoom = clampZoom(saved.zoom);
      return;
    }
    const door = this.mapReturnDoor;
    if (door) {
      const pos = tileToWorld(door.x, door.y);
      this.cameraX = -pos.x;
      this.cameraY = -pos.y + 40;
      this.zoom = clampZoom(this.zoom);
    } else {
      this.centerOnCharacter(false);
    }
  }

  enterInterior(
    buildingId: string,
    opts?: { skipFade?: boolean; fromHash?: boolean },
  ): void {
    if (this.interiorActive && this.interiorDef?.id === buildingId) return;
    const def = getInteriorDef(buildingId);
    const building = objects.find((o) => o.type === 'building' && o.name === buildingId);
    const door = building?.door;
    if (!def || !door) return;
    if (def.sprite && !spritesLoaded(interiorSpriteKey(def.id, false))) {
      void loadInteriorSprite(def.id).then(() => this.enterInterior(buildingId, opts));
      return;
    }

    if (!opts?.fromHash && !this.outdoorCamBeforeInterior) {
      this.outdoorCamBeforeInterior = {
        x: this.cameraX,
        y: this.cameraY,
        zoom: this.zoom,
      };
    }

    const finish = () => {
      this.interiorActive = true;
      this.interiorDef = def;
      this.interiorGrid = buildInteriorGrid(def);
      this.interiorCharTx = def.spawn.x;
      this.interiorCharTy = def.spawn.y;
      this.interiorPath = [];
      this.path = [];
      this.drawPathPreview();
      this.tilesLayer.visible = false;
      this.objectsLayer.visible = false;
      if (this.outskirts) this.outskirts.visible = false;
      this.cullVisibleTiles();
      this.pathLayer.visible = false;
      this.characterLayer.visible = false;
      this.interiorLayer.visible = true;
      this.interiorFloorGfx.eventMode = 'none';
      this.interiorWallGfx.eventMode = 'none';
      this.interiorPropGfx.eventMode = 'none';
      drawInteriorFloor(this.interiorFloorGfx, def);
      drawInteriorWalls(this.interiorWallGfx, def);
      drawInteriorProps(this.interiorPropGfx, def);
      this.interiorSprite?.destroy();
      this.interiorSprite = null;
      if (def.sprite) {
        const key = interiorSpriteKey(def.id, this.isLejos());
        const sprite = new Sprite(spriteTexture(key));
        const tl = interiorSpriteTopLeft(def);
        sprite.position.set(tl.x, tl.y);
        sprite.scale.set(def.scale);
        sprite.zIndex = 0;
        sprite.eventMode = 'none';
        this.interiorLayer.addChild(sprite);
        this.interiorSprite = sprite;
      }
      const spawn = tileToWorld(this.interiorCharTx, this.interiorCharTy);
      this.interiorAvatar.reset(spawn.x, spawn.y, this.interiorSpawnFacing(def));
      if (!this.mapReturnDoor) {
        this.mapReturnDoor = { x: door.x, y: door.y };
      }
      this.fitInteriorCamera();
      this.applyCamera(false);
      if (this.canvasEl) {
        this.canvasEl.dataset.interior = buildingId;
        this.canvasEl.dataset.interiorW = String(def.w);
        this.canvasEl.dataset.interiorH = String(def.h);
      }
      const cam = { x: this.cameraX, y: this.cameraY, zoom: this.zoom };
      if (opts?.fromHash) {
        writeInteriorToHash(buildingId, cam, 'replace');
      } else {
        const outdoor = this.outdoorCamBeforeInterior ?? cam;
        pushInteriorEntry(buildingId, cam, outdoor);
        this.interiorHistoryEntries += 1;
      }
      this.events.onInteriorIdChange?.(buildingId);
    };

    if (opts?.skipFade) {
      finish();
      return;
    }
    void this.runFade(true).then(() => {
      finish();
      void this.runFade(false);
    });
  }

  exitInterior(opts?: {
    skipFade?: boolean;
    fromHash?: boolean;
    outdoorCam?: { x: number; y: number; zoom: number };
    /** User tapped exit tile / Salir — finish immediately (no history.pop delay). */
    immediate?: boolean;
  }): void {
    if (!this.interiorActive) return;
    if (!opts?.fromHash && !opts?.immediate && this.interiorHistoryEntries > 0) {
      this.historySyncInProgress = true;
      navigateBackFromInterior();
      return;
    }
    if (opts?.immediate && this.interiorHistoryEntries > 0) {
      this.interiorHistoryEntries = 0;
    }
    const door = this.mapReturnDoor;
    const finish = () => {
      this.interiorActive = false;
      this.interiorDef = null;
      this.interiorGrid = [];
      this.interiorPath = [];
      this.tilesLayer.visible = true;
      this.objectsLayer.visible = true;
      this.fitOutskirts(this.app.screen.width, this.app.screen.height);
      this.cullVisibleTiles();
      this.pathLayer.visible = true;
      this.characterLayer.visible = true;
      this.interiorLayer.visible = false;
      this.interiorFloorGfx.clear();
      this.interiorWallGfx.clear();
      this.interiorPropGfx.clear();
      this.interiorSprite?.destroy();
      this.interiorSprite = null;
      if (door) {
        this.charTx = door.x;
        this.charTy = door.y;
        this.syncCharacterGraphic();
      }
      this.restoreOutdoorCameraAfterExit(opts?.outdoorCam);
      this.events.onExitInterior?.();
      if (this.canvasEl) {
        this.canvasEl.dataset.interior = '';
        this.canvasEl.dataset.interiorW = '';
        this.canvasEl.dataset.interiorH = '';
      }
      if (!opts?.fromHash) {
        replaceOutdoorHash({
          x: this.cameraX,
          y: this.cameraY,
          zoom: this.zoom,
        });
      }
      this.outdoorCamBeforeInterior = null;
      if (opts?.fromHash) {
        this.interiorHistoryEntries = Math.max(0, this.interiorHistoryEntries - 1);
        this.historySyncInProgress = false;
      }
      this.events.onInteriorIdChange?.(null);
      this.applyCamera(!opts?.fromHash);
    };

    finish();
    if (opts?.skipFade || opts?.fromHash || this.reducedMotion) return;
    void this.runFade(true).then(() => void this.runFade(false));
  }

  isInInterior(): boolean {
    return this.interiorActive;
  }

  /** Refit camera when the interior sheet peek height changes. */
  applyCameraFromUi(): void {
    if (this.interiorActive) this.fitInteriorCamera();
    this.applyCamera(false);
  }

  getInteriorBuildingId(): string | null {
    return this.interiorActive ? this.interiorDef?.id ?? null : null;
  }

  private handleInteriorScreenTap(sx: number, sy: number, sprint: boolean): void {
    if (!this.interiorDef) return;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    if (interiorHitExit(this.interiorDef, wx, wy, this.zoom)) {
      this.exitInteriorFromTap();
      return;
    }
    const def = this.interiorDef;
    const pick = interiorPickPoint(wx, wy);
    if (pick.x < -1.5 || pick.y < -1.5 || pick.x > def.w + 0.5 || pick.y > def.h + 0.5) return;
    const sx0 = Math.round(this.interiorCharTx);
    const sy0 = Math.round(this.interiorCharTy);
    let tile = interiorPickTile(def, wx, wy);
    if (!tile || !this.interiorGrid[tile.y]?.[tile.x]?.walkable || (tile.x === def.exit.x && tile.y === def.exit.y)) {
      tile = interiorNearestReachable(this.interiorGrid, def, pick.x, pick.y, { x: sx0, y: sy0 });
    }
    if (!tile) return;
    const path = findPathInterior(this.interiorGrid, sx0, sy0, tile.x, tile.y, {
      x: this.interiorCharTx,
      y: this.interiorCharTy,
    });
    if (!path) {
      this.events.onUnreachable?.();
      return;
    }
    this.interiorPath = path;
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
    this.startCameraFollow();
  }

  /** One tap on the exit mat / door gap leaves right away, from anywhere the exit is reachable. */
  private exitInteriorFromTap(): void {
    const def = this.interiorDef;
    if (!def) return;
    const sx0 = Math.round(this.interiorCharTx);
    const sy0 = Math.round(this.interiorCharTy);
    if (!findPathInterior(this.interiorGrid, sx0, sy0, def.exit.x, def.exit.y)) {
      this.events.onUnreachable?.();
      return;
    }
    this.interiorPath = [];
    this.exitInterior({ immediate: true });
  }

  private updateInteriorWalk(): void {
    let step = walkStepWorld(this.sprint, this.app.ticker.deltaMS);
    while (this.interiorPath.length > 0 && step > 0) {
      const target = this.interiorPath[0];
      const dx = target.x - this.interiorCharTx;
      const dy = target.y - this.interiorCharTy;
      const dist = tileMoveWorld(dx, dy);
      if (dist > step) {
        this.interiorCharTx += (dx / dist) * step;
        this.interiorCharTy += (dy / dist) * step;
        this.charState = this.sprint ? 'sprint' : 'walk';
        return;
      }
      step -= dist;
      this.interiorCharTx = target.x;
      this.interiorCharTy = target.y;
      this.interiorPath.shift();
      if (this.interiorPath.length === 0) {
        this.charState = 'idle';
        this.sprint = false;
        const def = this.interiorDef;
        if (def && Math.round(this.interiorCharTx) === def.exit.x && Math.round(this.interiorCharTy) === def.exit.y) {
          this.exitInterior();
        }
      }
    }
  }

  /** On entering a room the player faces into it, away from the door behind. */
  private interiorSpawnFacing(def: InteriorDef): FacingDir {
    return def.exitFace === '+x' ? 'nw' : 'ne';
  }

  /** For QA — programmatic walk */
  getCharacterTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
  }

  getCharacterPosForQa(): { x: number; y: number } {
    return { x: this.charTx, y: this.charTy };
  }

  /** Same code path as a tap on the drawn door (QA / Playwright). */
  tapBuildingDoor(name: string): boolean {
    const client = this.getDoorScreenClientPoint(name);
    if (!client || !this.canvasEl) return false;
    const rect = this.canvasEl.getBoundingClientRect();
    this.handleScreenTap(client.x - rect.left, client.y - rect.top, false);
    return true;
  }

  /** QA: pan so the character and target door are both on screen before a real pointer tap. */
  frameBuildingDoorForQa(name: string): void {
    const obj = objects.find((o) => o.type === 'building' && o.name === name);
    if (!obj?.door) return;
    const d = obj.door;
    const midTx = (this.charTx + d.x) / 2;
    const midTy = (this.charTy + d.y) / 2;
    const mid = tileToWorld(midTx, midTy);
    const doorW = tileToWorld(d.x, d.y);
    const charW = tileToWorld(this.charTx, this.charTy);
    const spanX = Math.abs(doorW.x - charW.x) + TILE_W * 2;
    const spanY = Math.abs(doorW.y - charW.y) + TILE_H * 4;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const zoomX = sw / spanX;
    const zoomY = sh / spanY;
    this.zoom = clampZoom(Math.min(zoomX, zoomY) * 0.88, sw, sh);
    this.cameraX = -mid.x;
    this.cameraY = -mid.y + 40;
    this.applyCamera(false);
  }

  /** Client coordinates for tapping the drawn door of a building (QA). */
  getDoorScreenClientPoint(name: string): { x: number; y: number } | null {
    const obj = objects.find((o) => o.type === 'building' && o.name === name);
    const tap = obj ? doorTapPoint(obj) : null;
    if (!tap || !this.canvasEl) return null;
    const screen = this.worldToScreen(tap.x, tap.y);
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }

  /** For QA — place character on a walkable tile without opening doors. */
  setSuppressTapForQa(ms: number): void {
    this.suppressTapUntil = performance.now() + ms;
  }

  setCharacterTileForQa(tx: number, ty: number): void {
    if (!cells[ty]?.[tx]?.walkable) return;
    this.path = [];
    this.charTx = tx;
    this.charTy = ty;
    this.syncCharacterGraphic();
    this.drawPathPreview();
    this.centerOnCharacter(false);
  }

  /** QA: same entry path as tapping a building (walk to door + open panel). */
  walkToBuildingForQa(name: string): boolean {
    const obj = objects.find((o) => o.type === 'building' && o.name === name);
    if (!obj?.door || !obj.panelTitle) return false;
    this.requestWalk(obj.door.x, obj.door.y, false, {
      buildingEntry: { panelTitle: obj.panelTitle, door: obj.door },
    });
    return true;
  }

  getObjectIds(): string[] {
    return objects.map((o) => o.id);
  }

  getZoom(): number {
    return this.zoom;
  }

  setZoomLevel(level: number, anchorScreen?: { x: number; y: number }): void {
    this.setZoom(level, anchorScreen);
    this.applyCamera(false);
  }

  /** QA: synthetic map tap (scenery / ground) matching player pointer routing. */
  tapMapTileForQa(tx: number, ty: number): void {
    const c = tileToWorld(tx, ty);
    const scr = this.worldToScreen(c.x, c.y);
    this.handleScreenTap(scr.x, scr.y, false);
  }

  /** QA: client/screen coords (same routing as pointer release → handleScreenTap). */
  tapScreenForQa(clientX: number, clientY: number, sprint = false): void {
    const rect = this.canvasEl?.getBoundingClientRect();
    if (!rect) return;
    this.handleScreenTap(clientX - rect.left, clientY - rect.top, sprint);
  }

  /** QA: client point for an interior grid tile (same space as tapScreen). */
  getInteriorTileScreenClientPoint(
    tx: number,
    ty: number,
    liftPx = 0,
  ): { x: number; y: number } | null {
    if (!this.interiorDef || !this.canvasEl) return null;
    const foot = tileFootWorld(tx, ty);
    const screen = this.worldToScreen(foot.x, foot.y - TILE_H / 2 - liftPx);
    const rect = this.canvasEl.getBoundingClientRect();
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }

  /** QA: interior feature probes (west wall, pews, Flor tiers, case props) in client coordinates. */
  getInteriorPixelProbesClient(): { label: string; x: number; y: number; expect: number[] }[] {
    if (!this.interiorDef || !this.canvasEl) return [];
    const rect = this.canvasEl.getBoundingClientRect();
    return interiorPixelProbes(this.interiorDef, this.isLejos()).map((p) => {
      const s = this.worldToScreen(p.world.x, p.world.y);
      return { label: p.label, x: rect.left + s.x, y: rect.top + s.y, expect: p.expect };
    });
  }

  getInteriorLayoutForQa(): {
    w: number;
    h: number;
    exit: { x: number; y: number };
    exitFace: '+x' | '+y';
    walkable: { x: number; y: number }[];
  } | null {
    const def = this.interiorDef;
    if (!def) return null;
    const walkable: { x: number; y: number }[] = [];
    for (let y = 0; y < def.h; y++) {
      for (let x = 0; x < def.w; x++) {
        if (this.interiorGrid[y]?.[x]?.walkable) walkable.push({ x, y });
      }
    }
    return { w: def.w, h: def.h, exit: def.exit, exitFace: def.exitFace, walkable };
  }

  getInteriorCharTile(): { x: number; y: number } | null {
    if (!this.interiorActive) return null;
    return { x: Math.round(this.interiorCharTx), y: Math.round(this.interiorCharTy) };
  }

  getInteriorWalkForQa(): { pos: { x: number; y: number }; path: { x: number; y: number }[] } | null {
    if (!this.interiorActive) return null;
    return { pos: { x: this.interiorCharTx, y: this.interiorCharTy }, path: this.interiorPath.map((p) => ({ ...p })) };
  }

  getInteriorForwardScreenPoint(): { x: number; y: number } | null {
    if (!this.interiorDef) return null;
    const t = interiorForwardTile(this.interiorDef);
    return this.getInteriorTileScreenClientPoint(t.x, t.y);
  }

  /** QA: tap an interior tile (walk / exit). */
  tapInteriorTileForQa(tx: number, ty: number, sprint = false): void {
    const pt = this.getInteriorTileScreenClientPoint(tx, ty);
    if (!pt) return;
    this.tapScreenForQa(pt.x, pt.y, sprint);
  }

  expandInteriorSheetForQa(): void {
    this.events.buildingPanel?.expandInteriorSheetForQa?.();
  }

  /** QA: RGBA at a client point on the game canvas (WebGL readPixels). */
  /** QA: every map sprite (objects + one tile per ground variant) with its world top-left. */
  qaSpriteInstances(): {
    id: string;
    key: string;
    tl: { x: number; y: number };
    w: number;
    h: number;
    kind: string;
    zIndex?: number;
  }[] {
    const out: { id: string; key: string; tl: { x: number; y: number }; w: number; h: number; kind: string; zIndex?: number }[] = [];
    for (const v of this.objectVisuals.values()) {
      const key = objectSpriteKey(v.obj, 'default', false)!;
      const tl = objectSpriteTopLeft(v.obj, key);
      const a = spriteAsset(key);
      out.push({ id: v.obj.id, key, tl, w: a.w, h: a.h, kind: v.obj.name, zIndex: v.zIndex });
    }
    const seen = new Set<string>();
    for (const { tx, ty } of this.tileCullEntries) {
      const key = tileSpriteKey(cells, tx, ty);
      if (seen.has(key)) continue;
      seen.add(key);
      const foot = tileFootWorld(tx, ty);
      const a = spriteAsset(key);
      out.push({
        id: `tile:${tx},${ty}`,
        key,
        tl: { x: foot.x - a.vfs.x, y: foot.y - a.vfs.y },
        w: a.w,
        h: a.h,
        kind: 'tile',
      });
    }
    return out;
  }

  /** QA: draw only the given sprite ids (objects by id, tiles as `tile:x,y`), no character. */
  qaIsolateSprites(ids: string[] | null): void {
    this.qaIsolation = ids ? new Set(ids) : null;
    this.applyCamera(false);
  }

  /** QA: show one sprite key on its own with its front vertex at world (sx, sy); null removes it. */
  qaPreviewSprite(key: string | null, sx = 0, sy = 0): { tl: { x: number; y: number }; w: number; h: number } | null {
    this.qaPreview?.destroy();
    this.qaPreview = null;
    if (!key) return null;
    const a = spriteAsset(key);
    const sp = new Sprite(spriteTexture(key));
    sp.position.set(sx - a.vfs.x, sy - a.vfs.y);
    sp.zIndex = 2_000_000;
    sp.eventMode = 'none';
    this.objectsLayer.addChild(sp);
    this.qaPreview = sp;
    return { tl: { x: sx - a.vfs.x, y: sy - a.vfs.y }, w: a.w, h: a.h };
  }

  /** QA: force every building sprite into one state (default | hover | resaltado), or null to release. */
  async qaForceBuildingState(state: BuildingSpriteState | null): Promise<void> {
    this.qaForcedState = state;
    await loadAllSprites();
    this.syncObjectSprites(true);
    this.app.render();
  }

  async qaLoadAllSprites(): Promise<void> {
    await loadAllSprites();
  }

  /** QA: put a world point at the canvas centre at an exact zoom. */
  qaFrameWorld(wx: number, wy: number, zoom: number): void {
    this.suspendCameraFollow();
    this.zoom = zoom;
    this.cameraX = -wx;
    this.cameraY = -wy;
    this.applyCamera(false);
    this.app.render();
  }

  /** QA: what a tap at client (x, y) would pick, without acting on it. */
  qaPickAt(cx: number, cy: number): { door: string | null; building: string | null } {
    const rect = this.canvasEl?.getBoundingClientRect();
    const sx = cx - (rect?.left ?? 0);
    const sy = cy - (rect?.top ?? 0);
    return {
      door: this.pickBuildingDoorAtScreen(sx, sy)?.name ?? null,
      building: this.pickBuildingAtScreen(sx, sy)?.name ?? null,
    };
  }

  /** QA: screen silhouettes (world coords) of the obelisco's solid parts. */
  qaObeliscoSilhouettes(): { x: number; y: number }[][] {
    const o = objects.find((ob) => ob.name === 'obelisco');
    return o ? obeliscoSilhouettes(o) : [];
  }

  qaWorldToClient(wx: number, wy: number): { x: number; y: number } {
    const rect = this.canvasEl?.getBoundingClientRect();
    const s = this.worldToScreen(wx, wy);
    return { x: (rect?.left ?? 0) + s.x, y: (rect?.top ?? 0) + s.y };
  }

  qaFill(): {
    loaded: boolean;
    report: typeof fill.report;
    actors: FillActorSnapshot[];
    objects: { id: string; key: string; tl: { x: number; y: number }; w: number; h: number; flat: boolean; zIndex: number; cells: [number, number][] }[];
    pathCells: [number, number][];
    solidCells: [number, number][];
    flatCells: [number, number][];
    owned: [number, number][];
    walk: string[];
  } {
    const objectsOut = fill.objects.map((o) => {
      const key = objectSpriteKey(o, 'default', false)!;
      const a = spriteAsset(key);
      const cellsOut: [number, number][] = [];
      for (let dy = 0; dy < (o.h ?? 1); dy++) {
        for (let dx = 0; dx < (o.w ?? 1); dx++) cellsOut.push([(o.footprintX ?? o.x) + dx, (o.footprintY ?? o.y) + dy]);
      }
      return {
        id: o.id,
        key,
        tl: objectSpriteTopLeft(o, key),
        w: a.w,
        h: a.h,
        flat: !!o.flat,
        zIndex: this.objectVisuals.get(o.id)?.zIndex ?? NaN,
        cells: cellsOut,
      };
    });
    const owned: [number, number][] = [...fill.solidCells];
    for (const o of objects) {
      if (o.flat) continue;
      for (let dy = 0; dy < (o.h ?? 1); dy++) {
        for (let dx = 0; dx < (o.w ?? 1); dx++) owned.push([(o.footprintX ?? o.x) + dx, (o.footprintY ?? o.y) + dy]);
      }
    }
    for (const [x, y] of OBELISCO_SOLID_TILES) owned.push([x, y]);
    for (const key of muroWallTiles()) owned.push(key.split(',').map(Number) as [number, number]);
    const walk = cells.map((row) =>
      row
        .map((c) =>
          c.groundId.includes('borde') ? 'x' : !c.walkable ? '#' : c.groundId.includes('street') ? '=' : c.groundId.includes('park') ? ':' : '.',
        )
        .join(''),
    );
    return {
      loaded: this.fillActors?.isLoaded() ?? false,
      report: fill.report,
      actors: this.fillActors?.snapshot() ?? [],
      objects: objectsOut,
      pathCells: fill.pathCells,
      solidCells: fill.solidCells,
      flatCells: fill.flatCells,
      owned,
      walk,
    };
  }

  qaNpcs(): { enabled: boolean; loaded: boolean; npcs: NpcSnapshot[] } {
    return { enabled: this.npcs.isEnabled(), loaded: this.npcs.isLoaded(), npcs: this.npcs.snapshot() };
  }

  qaSetNpcs(on: boolean): void {
    this.npcs.setEnabled(on);
    if (on) this.loadNpcs();
  }

  private loadNpcs(): void {
    void this.npcs.load().then(() => this.cullVisibleTiles());
  }

  qaNpcTown(): ReturnType<NpcCrowd['town']> {
    return this.npcs.town();
  }

  qaAdvanceNpcs(seconds: number): void {
    this.npcs.advance(seconds);
  }

  /** QA: the on-screen player avatar (map or room) and the canvas resolution it was loaded for. */
  qaPlayerAvatar(): AvatarSnapshot & { scope: 'map' | 'room'; rendererResolution: number } {
    const a = this.interiorActive ? this.interiorAvatar : this.avatar;
    return {
      ...a.snapshot(),
      scope: this.interiorActive ? 'room' : 'map',
      rendererResolution: this.app.renderer.resolution,
    };
  }

  /** QA: benches the player can sit on (anchor, draw order, a client point inside the tap box) and which one they hold. */
  qaBenches(): {
    claimed: string | null;
    pending: string | null;
    seated: string | null;
    benches: (Bench & {
      anchor: { x: number; y: number };
      benchZ: number | null;
      tapWorld: { x: number; y: number };
      client: { x: number; y: number } | null;
    })[];
  } {
    const rect = this.canvasEl?.getBoundingClientRect();
    return {
      claimed: this.claimedBench?.id ?? null,
      pending: this.pendingBench?.id ?? null,
      seated: this.seatedBench?.id ?? null,
      benches: this.townBenches().map((b) => {
        const anchor = tileFootWorld(b.seat.x, b.seat.y);
        const g = this.objectGraphics.get(b.id);
        const box = this.objectTapBoxes.get(b.id);
        let tapWorld = anchor;
        if (g && box) {
          const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          let best = Infinity;
          for (let y = box.y; y < box.y + box.height; y += 4) {
            for (let x = box.x; x < box.x + box.width; x += 4) {
              const d = Math.hypot(x - c.x, y - c.y);
              if (d < best && g.hitArea?.contains(x, y)) {
                best = d;
                tapWorld = { x: g.x + x, y: g.y + y };
              }
            }
          }
        }
        const scr = this.worldToScreen(tapWorld.x, tapWorld.y);
        return {
          ...b,
          anchor,
          benchZ: this.objectVisuals.get(b.id)?.zIndex ?? null,
          tapWorld,
          client: rect ? { x: rect.left + scr.x, y: rect.top + scr.y } : null,
        };
      }),
    };
  }

  /** QA: as if `seconds` more passed without input (Pantone's rest timer). */
  qaSkipQuiet(seconds: number): void {
    this.avatar.qaSkipQuiet(seconds);
    this.interiorAvatar.qaSkipQuiet(seconds);
  }

  /** QA: what Pixi's event boundary would deliver a mouse event at this client point to. */
  qaPixiTargetAt(clientX: number, clientY: number): string | null {
    const rect = this.canvasEl?.getBoundingClientRect();
    if (!rect) return null;
    const boundary = this.app.renderer.events.rootBoundary;
    boundary.rootTarget ??= this.app.stage;
    const t = boundary.hitTest(clientX - rect.left, clientY - rect.top);
    if (!t) return null;
    if (t === this.noah?.sprite) return 'noah';
    for (const [id, v] of this.objectVisuals) if (v.sprite === t) return `object:${id}`;
    for (const [id, g] of this.objectGraphics) if (g === t) return `object:${id}`;
    return t.label || t.constructor.name;
  }

  qaNoah(): (NoahSnapshot & { client: { x: number; y: number } | null; talkRange: number }) | null {
    if (!this.noah) return null;
    const s = this.noah.snapshot();
    const rect = this.canvasEl?.getBoundingClientRect();
    // Middle of the body: half the drawn height above the feet.
    const scr = this.worldToScreen(s.x, s.y - s.worldH * 0.45);
    return {
      ...s,
      client: rect ? { x: rect.left + scr.x, y: rect.top + scr.y } : null,
      talkRange: NOAH_TALK_RANGE,
    };
  }
  /** QA: which ground sprite each street cell uses, and its open sides (for neighbour checks). */
  qaStreetTiles(): { x: number; y: number; key: string; sides: string[] }[] {
    const out: { x: number; y: number; key: string; sides: string[] }[] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (!cells[y][x].groundId.includes('path/street')) continue;
        out.push({ x, y, key: tileSpriteKey(cells, x, y), sides: streetOpenSides(cells, x, y) });
      }
    }
    return out;
  }

  sampleCanvasColorsAtClient(
    points: { x: number; y: number }[],
  ): ({ r: number; g: number; b: number; a: number } | null)[] {
    const canvas = this.canvasEl;
    if (!canvas) return points.map(() => null);
    this.app.render();
    const rect = canvas.getBoundingClientRect();
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    if (!ctx) return points.map(() => null);
    ctx.drawImage(canvas, 0, 0);
    return points.map((p) => {
      const sx = Math.floor((p.x - rect.left) * (canvas.width / rect.width));
      const sy = Math.floor((p.y - rect.top) * (canvas.height / rect.height));
      if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) return null;
      const d = ctx.getImageData(sx, sy, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    });
  }

  sampleCanvasColorAtClient(clientX: number, clientY: number): {
    r: number;
    g: number;
    b: number;
    a: number;
  } | null {
    const canvas = this.canvasEl;
    if (!canvas) return null;
    this.app.render();
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    const tmp = document.createElement('canvas');
    tmp.width = 1;
    tmp.height = 1;
    const ctx = tmp.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, Math.floor(sx), Math.floor(sy), 1, 1, 0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }
}
