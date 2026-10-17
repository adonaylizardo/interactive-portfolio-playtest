import {
  Application,
  Container,
  Graphics,
  Point,
  Polygon,
  Rectangle,
  RenderTexture,
  Sprite,
  Texture,
  TilingSprite,
  UPDATE_PRIORITY,
} from 'pixi.js';
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
import { buildingParkPrefer, muroWallTiles, OBELISCO_ACCESS, OBELISCO_SOLID_TILES } from '../data/world';
import { mapWorldBounds, sortKey, tileFootWorld, tileToWorld, worldToTile } from '../iso/math';
import { findPathOrNearestWith, findPathWith } from '../iso/pathfinding';
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
  objectSpriteScale,
  objectSpriteTopLeft,
  playerBehind,
  tileSpriteKey,
  TILE_DIAMOND,
  type OccluderBox,
} from './mapSprites';
import { NAME_PILL_GAP_PX, spriteOpaqueTopWorld } from './spriteTop';
import {
  allSpriteKeys,
  hasSprite,
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
  remainingMapKeys,
  loadedSpriteKeys,
  upgradeLoadedSprites,
  spriteAsset,
  spritesLoaded,
  spriteTexture,
  worldBackgroundColor,
  type BuildingSpriteState,
} from './sprites';
import { dismissBootScreen } from './assetUrl';
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
import type { Camera } from '../tokens';
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
import { studio } from '../audio/studio';
import { FillActors, type FillActorSnapshot } from './fillActors';
import { NpcCrowd, type NpcSnapshot } from './npcs';
import { buildTown, type Bench } from './npcRoutines';
import { Noah, type NoahSnapshot } from './noah';
import { JacT9, JAC_ID, type JacGear, type JacLights, type JacSnapshot, type JacToggleId } from './jacT9';
import {
  loadPlayerSheets,
  loadRestSheets,
  PlayerAvatar,
  prefetchRestSheets,
  upgradePlayerSheets,
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
  isPreview?: () => boolean;
  layoutInsets?: () => { left: number; top: number; right: number; bottom: number };
  consumeInteriorCanvasTap?: (clientX: number, clientY: number) => boolean;
  expandInteriorSheetForQa?: () => void;
};

export type ChecklistBridge = {
  isMobileExpanded: () => boolean;
  collapseMobile: () => void;
};

export type ChromeBridge = {
  layoutInsets?: () => { left: number; top: number; right: number; bottom: number };
  onMapInteract?: () => void;
  onJacHud?: () => void;
};

export type SceneEvents = {
  onChecklist: (step: ChecklistStepId) => void;
  onEnterBuilding: (buildingId: string, panelTitle: string) => void;
  onExitInterior?: () => void;
  onInteriorIdChange?: (interiorId: string | null) => void;
  onUnreachable?: () => void;
  onGetOutToEnter?: () => void;
  onMoveCommand?: () => void;
  onFrame?: () => void;
  stick?: () => { x: number; y: number };
  stickActive?: () => boolean;
  /** Touch/coarse pad is the 1-finger move control — do not pan or capture the pointer. */
  stickShown?: () => boolean;
  stickCancel?: () => void;
  buildingPanel?: BuildingPanelBridge;
  checklist?: ChecklistBridge;
  chrome?: ChromeBridge;
};

/** Desktop first-load camera when the URL carries no #view. */
const DESKTOP_FIRST_LOAD_BUILDINGS = ['estudio', 'volaris', 'mentoria', 'pg'] as const;
const DESKTOP_ROOF_RISE = 160;
/** World px from the character's foot up to the middle of its body (Adonay is ~96 tall). */
const CHAR_BODY_CENTRE_RISE = 48;
/** Glide time when the camera catches up to the character (walk start, after a manual pan). */
const FOLLOW_SMOOTH_S = 0.35;
const FOLLOW_DRIVE_SMOOTH_S = 0.12;
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
  private viewMode: Camera = 'isometrica';
  private yaw = 0;
  private viewRot = 0;
  private viewSx = 1;
  private viewSy = 1;
  private mapOverview = false;
  private savedCam: { x: number; y: number; zoom: number } | null = null;

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
  private jac: JacT9 | null = null;
  private jacBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  qaLastDriveTap: { x: number; y: number } | null = null;
  qaPointerDriveAccepts = 0;
  private qaStick: { x: number; y: number } | null = null;
  /** GPU rear crop. Shown as a stage sprite — never readPixels / drawImage of the game GL view. */
  private rearRT: RenderTexture | null = null;
  private rearSprite: Sprite | null = null;
  private rearMask: Graphics | null = null;
  private rearLayer: Container | null = null;
  private rearFade = 0;
  private rearFadeFrom = 0;
  private rearFadeTo = 0;
  private rearFadeT0 = 0;
  private static readonly REAR_FADE_MS = 120;
  private pendingJacExit = false;
  private suppressDriveTapUntil = 0;
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
      lightsOn?: boolean;
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
  private pendingDriveEnter: { panelTitle: string; door: { x: number; y: number } } | null = null;
  private pendingDriveEnterAt = 0;
  private pendingJacEnter = false;
  private pendingJacPanel = false;
  private tileCullEntries: { g: Sprite; tx: number; ty: number }[] = [];
  private tileByCell = new Map<string, { g: Sprite; tx: number; ty: number }>();
  private readonly tileHit = new Polygon(TILE_DIAMOND);
  private tilesBackfilled = false;
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
  /** Cancels a deferred Salir cleanup if the player re-enters before the next frame. */
  private interiorExitGen = 0;
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
      backgroundAlpha: 1,
      antialias: true,
      autoDensity: true,
      premultipliedAlpha: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: window,
      preference: 'webgl',
    });

    this.rearLayer = new Container();
    this.rearLayer.eventMode = 'none';
    this.rearLayer.label = 'jac-rear';
    this.app.stage.addChild(this.camera);
    this.app.stage.addChild(this.rearLayer);
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

    const bootInterior = parseInteriorFromHash();
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
    this.syncViewTransform();

    await loadMapSprites(this.app.renderer.resolution, this.firstPaintKeys());
    if (bootInterior && isSpriteInterior(bootInterior)) await loadInteriorSprite(bootInterior);
    await loadPlayerSheets(1);
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

    this.ensureVisibleTiles();
    this.buildVoidClickLayer();
    this.buildOutskirts();
    this.buildObjects();
    this.initJac();
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
    this.fillActors = new FillActors(
      this.objectsLayer,
      fill.actors,
      fill.overlays,
      (fx, fy) => this.walkerZIndex(fx, fy),
      this.reducedMotion,
    );
    this.syncCharacterGraphic();

    if (bootInterior) {
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
    canvas.tabIndex = 0;
    const focusCanvas = () => canvas.focus({ preventScroll: true });
    focusCanvas();
    requestAnimationFrame(focusCanvas);
    this.app.ticker.add(() => this.update(), undefined, UPDATE_PRIORITY.NORMAL);
    this.app.ticker.add(() => this.composeRearPass(), undefined, UPDATE_PRIORITY.NORMAL);
    this.app.ticker.add(() => this.events.onFrame?.(), undefined, UPDATE_PRIORITY.UTILITY);
    window.addEventListener('resize', () => this.onWindowViewportChange());
    window.visualViewport?.addEventListener('resize', () => this.onWindowViewportChange());
    const lockViewport = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    window.visualViewport?.addEventListener('scroll', lockViewport);
    window.addEventListener('scroll', lockViewport, { passive: true });
    window.addEventListener('hashchange', () => {
      if (this.historySyncInProgress) return;
      this.applyHashNavigation(null);
    });

    bindPopstate((ev) => {
      this.applyHashNavigation((ev.state as HistoryNavigationState | null) ?? null);
    });

    if (bootInterior) {
      replaceOutdoorHash(this.outdoorCamBeforeInterior ?? { x: this.cameraX, y: this.cameraY, zoom: this.zoom });
      this.enterInterior(bootInterior, { skipFade: true });
    }
    setHashWriteSuppressed(false);
    this.applyCamera(true);
    this.app.render();
    this.events.onFrame?.();
    dismissBootScreen();
    this.hydrateMap();
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
      const local = this.federatedToCanvas(e);
      if (!local) return;
      const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
      this.handleScreenTap(local.x, local.y, sprint);
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
      if (this.interiorActive || this.jac?.driving) {
        const local = this.federatedToCanvas(e);
        if (!local) return;
        this.handleScreenTap(local.x, local.y, sprint);
        return;
      }
      if (this.claimJacTap(e)) {
        this.tapJac();
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

  /** Unique cerca keys whose art overlaps the current camera (plus the outskirts tile). */
  private firstPaintKeys(): string[] {
    const keys = new Set<string>(['tile/suelo/si-no']);
    const { minX, maxX, minY, maxY } = this.viewWorldAabb(TILE_W * 2);
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const foot = tileFootWorld(tx, ty);
        if (foot.x < minX - TILE_W || foot.x > maxX + TILE_W || foot.y < minY - TILE_H || foot.y > maxY + TILE_H) {
          continue;
        }
        keys.add(tileSpriteKey(cells, tx, ty));
      }
    }
    for (const obj of objects) {
      const key = objectSpriteKey(obj, 'default', false);
      if (!key || !hasSprite(key) || key.endsWith('/lejos')) continue;
      const tl = objectSpriteTopLeft(obj, key);
      const a = spriteAsset(key);
      const sc = objectSpriteScale(obj);
      if (tl.x + a.w * sc < minX || tl.x > maxX || tl.y + a.h * sc < minY || tl.y > maxY) continue;
      keys.add(key);
    }
    return [...keys];
  }

  private viewWorldAabb(pad: number): { minX: number; maxX: number; minY: number; maxY: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const corners = [
      this.screenToWorld(-pad, -pad),
      this.screenToWorld(sw + pad, -pad),
      this.screenToWorld(-pad, sh + pad),
      this.screenToWorld(sw + pad, sh + pad),
    ];
    return {
      minX: Math.min(...corners.map((c) => c.x)),
      maxX: Math.max(...corners.map((c) => c.x)),
      minY: Math.min(...corners.map((c) => c.y)),
      maxY: Math.max(...corners.map((c) => c.y)),
    };
  }

  private ensureTile(tx: number, ty: number): Sprite | null {
    const id = `${tx},${ty}`;
    const existing = this.tileByCell.get(id);
    if (existing) return existing.g;
    const key = tileSpriteKey(cells, tx, ty);
    if (!spritesLoaded(key)) {
      void loadKeys([key]).then(() => this.ensureTile(tx, ty));
      return null;
    }
    const cell = cells[ty][tx];
    const g = new Sprite(spriteTexture(key));
    const foot = tileFootWorld(tx, ty);
    const a = spriteAsset(key);
    g.position.set(foot.x - a.vfs.x, foot.y - a.vfs.y);
    g.hitArea = this.tileHit;
    g.eventMode = 'static';
    g.cursor = cell.walkable ? 'pointer' : 'default';
    g.on('pointertap', (e) => {
      if (this.shouldBlockTap()) return;
      this.pixiTapGestureSerial = this.pointerGestureSerial;
      if (this.jac?.driving) {
        const local = this.federatedToCanvas(e);
        if (!local) return;
        this.handleScreenTap(local.x, local.y, false);
        return;
      }
      if (this.claimJacTap(e)) {
        this.tapJac();
        return;
      }
      if (!this.prepareMapTap(undefined, tx, ty)) return;
      const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
      this.requestWalk(tx, ty, sprint);
    });
    this.tilesLayer.addChild(g);
    const entry = { g, tx, ty };
    this.tileByCell.set(id, entry);
    this.tileCullEntries.push(entry);
    return g;
  }

  private ensureVisibleTiles(): void {
    if (!this.app?.screen) return;
    const { minX, maxX, minY, maxY } = this.viewWorldAabb(TILE_W * 1.5);
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const foot = tileFootWorld(tx, ty);
        if (foot.x < minX - TILE_W || foot.x > maxX + TILE_W || foot.y < minY - TILE_H || foot.y > maxY + TILE_H) {
          continue;
        }
        this.ensureTile(tx, ty);
      }
    }
  }

  private ensureAllTiles(): void {
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) this.ensureTile(tx, ty);
    }
    this.tilesBackfilled = true;
  }

  private refreshTileTextures(): void {
    for (const { g, tx, ty } of this.tileCullEntries) {
      const key = tileSpriteKey(cells, tx, ty);
      if (spritesLoaded(key)) g.texture = spriteTexture(key);
    }
  }

  /** After first paint: rest of the town, @2x swap, then interiors/hover stay on demand. */
  private hydrateMap(): void {
    const hi = this.app.renderer.resolution;
    void (async () => {
      await upgradeLoadedSprites(hi);
      await upgradePlayerSheets(hi);
      this.refreshTileTextures();
      this.syncObjectSprites(true);
      await loadKeys(remainingMapKeys(loadedSpriteKeys()));
      this.ensureVisibleTiles();
      this.syncObjectSprites(true);
      this.queueTileBackfill();
    })();
    window.setTimeout(() => {
      void loadKeys(allSpriteKeys().filter((k) => k.endsWith('/lejos'))).then(() => this.syncObjectSprites(true));
    }, 800);
    window.setTimeout(() => {
      void loadBuildingStateSprites().then(() => this.syncObjectSprites(true));
    }, 2500);
    void loadSpriteProbes();
    if (this.npcs.isEnabled()) this.loadNpcs();
    const fillLoad = this.fillActors.load(hi).then(() => this.cullVisibleTiles());
    void Promise.allSettled([fillLoad, this.buildNoah()]).then(prefetchRestSheets);
  }

  private queueTileBackfill(): void {
    if (this.tilesBackfilled) return;
    let i = 0;
    const total = MAP_WIDTH * MAP_HEIGHT;
    const step = () => {
      const end = Math.min(i + 96, total);
      for (; i < end; i++) this.ensureTile(i % MAP_WIDTH, (i / MAP_WIDTH) | 0);
      if (i < total) {
        if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 80 });
        else requestAnimationFrame(step);
      } else {
        this.tilesBackfilled = true;
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(step, { timeout: 80 });
    else requestAnimationFrame(step);
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
      if (key && hasSprite(key)) {
        const ready = spritesLoaded(key);
        const sprite = new Sprite(ready ? spriteTexture(key) : Texture.EMPTY);
        const tl = objectSpriteTopLeft(obj, key);
        const sc = objectSpriteScale(obj);
        sprite.scale.set(sc);
        sprite.position.set(tl.x - pos.x, tl.y - pos.y);
        g.addChild(sprite);
        const a = spriteAsset(key);
        const tlw = { x: tl.x, y: tl.y };
        const box = new Rectangle(
          tlw.x + a.bbox.x0 * sc - pos.x,
          tlw.y + a.bbox.y0 * sc - pos.y,
          (a.bbox.x1 - a.bbox.x0) * sc,
          (a.bbox.y1 - a.bbox.y0) * sc,
        );
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
          x1: tlw.x + a.w * sc + 8,
          y1: tlw.y + a.h * sc + 8,
        };
        this.objectVisuals.set(obj.id, {
          obj,
          sprite,
          key: ready ? key : '',
          state: 'default',
          cull: spriteBox,
          occluder: objectOccluder(obj),
          zIndex,
        });
        if (!ready) void loadKeys([key]).then(() => this.syncObjectSprites(true));
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
        if (this.jac?.driving) {
          const local = this.federatedToCanvas(e);
          if (!local) return;
          this.handleScreenTap(local.x, local.y, false);
          return;
        }
        if (obj.id === JAC_ID || this.claimJacTap(e)) {
          this.tapJac();
          return;
        }
        if (obj.type === 'building' && obj.panelTitle && !this.prepareMapTap(obj)) return;
        const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
        if (obj.type === 'building' && obj.door && obj.panelTitle) {
          this.requestWalk(obj.door.x, obj.door.y, sprint, { walkOnly: true });
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
      if (v.obj.id === JAC_ID) {
        this.jac?.applySprite();
        continue;
      }
      const state = v.obj.type === 'building' ? this.buildingSpriteState(v.obj) : 'default';
      const lightsOn = this.jac?.lightsOn ?? true;
      if (!force && !lodChanged && state === v.state && v.lightsOn === lightsOn) continue;
      let key = objectSpriteKey(v.obj, state, lejos, lightsOn);
      if (key && !hasSprite(key) && v.obj.type === 'building') {
        key = objectSpriteKey(v.obj, state, lejos, true);
      }
      if (!key) continue;
      if (!spritesLoaded(key)) {
        void loadKeys([key]).then(() => this.syncObjectSprites(true));
        continue;
      }
      v.state = state;
      v.lightsOn = lightsOn;
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
    studio.playLine('12-climbing-wall');
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
      const snap = this.interiorAvatar.snapshot();
      studio.noteWalk(snap.adonay.mode === 'walk', snap.adonay.frame, this.sprint);
      return;
    }
    const f = tileToWorld(this.charTx, this.charTy);
    this.avatar.update(f.x, f.y, dt);
    this.noah?.update(dt);
    this.noah?.syncDepth();
    const snap = this.avatar.snapshot();
    studio.noteWalk(snap.adonay.mode === 'walk', snap.adonay.frame, this.sprint);
  }

  /** Screen coords (canvas pixels) ↔ world coords with world scaled under a fixed camera pivot. */
  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const z = this.zoom;
    const dx = sx - sw / 2;
    const dy = sy - sh / 2;
    const cos = Math.cos(this.viewRot);
    const sin = Math.sin(this.viewRot);
    const lx = (dx * cos + dy * sin) / this.viewSx;
    const ly = (-dx * sin + dy * cos) / this.viewSy;
    return {
      x: lx / z - this.cameraX,
      y: ly / z - this.cameraY,
    };
  }

  private worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const z = this.zoom;
    const lx = (this.cameraX + wx) * z;
    const ly = (this.cameraY + wy) * z;
    const cos = Math.cos(this.viewRot);
    const sin = Math.sin(this.viewRot);
    return {
      x: sw / 2 + lx * this.viewSx * cos - ly * this.viewSy * sin,
      y: sh / 2 + lx * this.viewSx * sin + ly * this.viewSy * cos,
    };
  }

  private syncViewTransform(): void {
    if (this.interiorActive) {
      this.viewRot = 0;
      this.viewSx = 1;
      this.viewSy = 1;
      return;
    }
    const yaw = (this.yaw % 4) * (Math.PI / 2);
    if (this.viewMode === 'cenital') {
      this.viewRot = yaw + Math.PI / 4;
      this.viewSx = 1;
      this.viewSy = 2;
    } else if (this.viewMode === 'perspectiva') {
      this.viewRot = yaw;
      this.viewSx = 1;
      this.viewSy = 1.38;
    } else {
      this.viewRot = yaw;
      this.viewSx = 1;
      this.viewSy = 1;
    }
  }

  getViewMode(): { mode: Camera; yaw: number; overview: boolean; rot: number; sy: number } {
    return {
      mode: this.viewMode,
      yaw: this.yaw,
      overview: this.mapOverview,
      rot: this.viewRot,
      sy: this.viewSy,
    };
  }

  setViewMode(mode: Camera): void {
    if (this.interiorActive) return;
    this.viewMode = mode;
    this.mapOverview = false;
    this.centerOnCharacter(false);
    this.applyCamera(true);
  }

  rotateView(): void {
    if (this.interiorActive) return;
    this.yaw = (this.yaw + 1) % 4;
    this.centerOnCharacter(false);
    this.applyCamera(true);
  }

  toggleMapOverview(): void {
    if (this.interiorActive) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    if (this.mapOverview) {
      this.mapOverview = false;
      if (this.savedCam) {
        this.cameraX = this.savedCam.x;
        this.cameraY = this.savedCam.y;
        this.zoom = this.savedCam.zoom;
      }
      this.applyCamera(true);
      return;
    }
    this.savedCam = { x: this.cameraX, y: this.cameraY, zoom: this.zoom };
    this.mapOverview = true;
    this.zoom = zoomMinForViewport(sw, sh);
    const fitted = clampPanMapFullyInView(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = fitted.cameraX;
    this.cameraY = fitted.cameraY;
    this.zoom = fitted.zoom;
    this.applyCamera(true);
  }

  requestWalk(
    tx: number,
    ty: number,
    sprint: boolean,
    opts?: {
      buildingEntry?: { panelTitle: string; door: { x: number; y: number } };
      walkOnly?: boolean;
    },
  ): void {
    if (this.jac?.driving) {
      if (opts?.buildingEntry) {
        this.requestDriveToEnter(opts.buildingEntry);
        return;
      }
      this.driveToTile(tx, ty, true);
      return;
    }
    this.pendingJacPanel = false;
    this.pendingJacEnter = false;
    this.pendingDriveEnter = null;
    this.pendingNoahTalk = false;
    this.dropBenchWalk();
    if (!this.interiorActive) this.events.chrome?.onMapInteract?.();
    if (!opts?.buildingEntry) {
      const bench = this.benchAtSeat(tx, ty);
      if (bench && this.sitOnBench(bench, sprint)) return;
    }
    const walkTx = tx;
    const walkTy = ty;
    const entry = opts?.walkOnly
      ? null
      : (opts?.buildingEntry ??
        resolveBuildingEntryFromTile(walkTx, walkTy, this.roundedCharTile()));
    this.pendingBuildingEntry = entry;
    const walkable = !!cells[walkTy]?.[walkTx]?.walkable;
    const target = walkable ? { x: walkTx, y: walkTy } : resolveWalkTarget(walkTx, walkTy);
    this.walkToTile(target.x, target.y, sprint);
  }

  clearWalkPreview(): void {
    this.path = [];
    this.drawPathPreview();
    if (this.canvasEl) this.canvasEl.dataset.walkGoal = '';
  }

  walkToTile(tx: number, ty: number, sprint: boolean, opts?: { keepView?: boolean }): void {
    if (this.seatedBench && !this.interiorActive) {
      this.standThen(() => this.walkToTile(tx, ty, sprint, opts));
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
    const destWalkable = !!cells[ty]?.[tx]?.walkable;
    const scenery = !!getSceneryAt(tx, ty);
    const extra = this.vanWalkBlock();
    const pass = (x: number, y: number) => {
      if (extra.has(`${x},${y}`)) return false;
      return !!cells[y]?.[x]?.walkable;
    };
    const destOk = destWalkable && pass(tx, ty);
    const wantDoor =
      !!this.pendingBuildingEntry &&
      this.pendingBuildingEntry.door.x === tx &&
      this.pendingBuildingEntry.door.y === ty;
    const result = destOk
      ? (() => {
          const path = findPathWith(sx, sy, tx, ty, pass);
          return path
            ? { path, target: { x: tx, y: ty }, direct: true }
            : findPathOrNearestWith(sx, sy, tx, ty, pass);
        })()
      : scenery || wantDoor
        ? findPathOrNearestWith(sx, sy, tx, ty, pass)
        : null;
    if (!result) {
      this.pendingBuildingEntry = null;
      this.pendingJacPanel = false;
      this.pendingJacEnter = false;
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
    }
    if (!result.direct && this.pendingBuildingEntry) {
      const d = this.pendingBuildingEntry.door;
      const near = Math.abs(result.target.x - d.x) + Math.abs(result.target.y - d.y) <= 2;
      if (!near && !wantDoor) this.pendingBuildingEntry = null;
    }
    this.path = result.path;
    if (
      destWalkable &&
      (this.path.length === 0 ||
        this.path[this.path.length - 1].x !== tx ||
        this.path[this.path.length - 1].y !== ty) &&
      (sx !== tx || sy !== ty)
    ) {
      this.path = [...this.path, { x: tx, y: ty }];
    }
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
    if (!opts?.keepView) this.startCameraFollow();
    this.events.onMoveCommand?.();
    this.events.onChecklist('walk-around');
    this.drawPathPreview();
    if (this.path.length === 0) {
      this.charState = 'idle';
      this.sprint = false;
      this.syncCharacterGraphic();
      this.snapToWalkGoal();
      const rtx = Math.round(this.charTx);
      const rty = Math.round(this.charTy);
      this.tryArriveAtDoorTile(rtx, rty);
      if (this.pendingJacEnter) this.trySeatInJac();
      else if (this.pendingJacPanel) this.tryOpenJacMenu();
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
    const same = (o?: { panelTitle?: string; name?: string } | null) =>
      !!o && (o.panelTitle === openTitle || o.name === openTitle);
    if (same(building)) return false;
    if (tx !== undefined && ty !== undefined) {
      if (same(getBuildingAtDoor(tx, ty))) return false;
      if (same(getBuildingAt(tx, ty))) return false;
    }
    const preview = !!bridge.isPreview?.();
    bridge.dismiss();
    this.pendingBuildingEntry = null;
    this.clearWalkPreview();
    const ctx = Math.round(this.charTx);
    const cty = Math.round(this.charTy);
    if (getBuildingAtDoor(ctx, cty)) {
      this.doorCooldown = 200;
    }
    if (preview) return true;
    this.suppressMapTapOnce = true;
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
    if (!this.interiorActive && this.events.buildingPanel?.isOpen() && !this.events.buildingPanel.isPreview?.()) {
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
    if (this.jac?.driving) {
      if (this.jac.isExiting()) return;
      if (performance.now() < this.suppressDriveTapUntil) return;
      if (this.pickJacAtScreen(sx, sy)) return;
      const doorHit = this.pickBuildingDoorAtScreen(sx, sy);
      const buildingHit = doorHit ?? this.pickBuildingAtScreen(sx, sy);
      if (buildingHit?.door && buildingHit.panelTitle) {
        this.requestDriveToEnter({ panelTitle: buildingHit.panelTitle, door: buildingHit.door });
        return;
      }
      const { x: wx, y: wy } = this.screenToWorld(sx, sy);
      const raw = worldToTile(wx, wy);
      if (raw && !this.jac.driveTileOk(raw.x, raw.y)) {
        this.toastDriveUnreachable();
        return;
      }
      this.requestDriveToScreen(sx, sy);
      return;
    }
    if (this.jac && (this.jac.mode === 'menu' || this.jac.mode === 'info')) {
      if (this.pickJacAtScreen(sx, sy)) {
        this.tapJac();
        return;
      }
      this.jacClose();
      return;
    }
    if (this.pickJacAtScreen(sx, sy)) {
      this.tapJac();
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
      this.requestWalk(building.door.x, building.door.y, sprint, { walkOnly: true });
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

  private federatedToCanvas(e: {
    clientX?: number;
    clientY?: number;
    global?: { x: number; y: number };
    nativeEvent?: unknown;
  }): { x: number; y: number } | null {
    const canvas = this.canvasEl;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const native = e.nativeEvent as { clientX?: number; clientY?: number } | undefined;
    const cx = Number.isFinite(e.clientX) ? e.clientX : native?.clientX;
    const cy = Number.isFinite(e.clientY) ? e.clientY : native?.clientY;
    if (typeof cx === 'number' && typeof cy === 'number') {
      return { x: cx - rect.left, y: cy - rect.top };
    }
    if (e.global) return { x: e.global.x, y: e.global.y };
    return null;
  }

  private toastDriveUnreachable(): void {
    this.pendingDriveEnter = null;
    this.jac?.clearDrivePath();
    this.jac?.holdGear();
    this.suppressDriveTapUntil = performance.now() + 450;
    this.events.onUnreachable?.();
  }

  private vanWalkBlock(): Set<string> {
    if (!this.jac || this.jac.driving) return new Set();
    return this.jac.parkedFootprintKeys();
  }

  private requestDriveToEnter(entry: { panelTitle: string; door: { x: number; y: number } }): boolean {
    if (!this.jac?.driving || this.jac.isExiting()) return false;
    if (performance.now() < this.suppressDriveTapUntil) return false;
    const building = objects.find(
      (o) => o.type === 'building' && o.door?.x === entry.door.x && o.door?.y === entry.door.y,
    );
    const prefer = building ? buildingParkPrefer(building.name) : null;
    const sit = this.jac.parkForDoor(entry.door.x, entry.door.y, prefer ?? undefined);
    if (!sit) {
      this.pendingDriveEnter = entry;
      this.jacGetOut({ thenEnter: true });
      return true;
    }
    const path = sit.path.length > 0 ? sit.path : this.jac.findDrivePath(sit.x, sit.y);
    if (!path) {
      this.pendingDriveEnter = entry;
      this.jacGetOut({ thenEnter: true });
      return true;
    }
    this.events.stickCancel?.();
    this.pendingBuildingEntry = null;
    this.pendingDriveEnter = entry;
    this.pendingDriveEnterAt = performance.now();
    const dest = path.length > 0 ? path[path.length - 1] : sit;
    if (path.length === 0 || (Math.hypot(this.jac.cx - dest.x, this.jac.cy - dest.y) < 1.2 && this.jac.mph < 1)) {
      this.jacGetOut({ thenEnter: true });
      return true;
    }
    this.qaLastDriveTap = { x: dest.x, y: dest.y };
    this.qaPointerDriveAccepts += 1;
    this.jac.setDrivePath(path, dest, { loose: true });
    this.startCameraFollow();
    this.drawPathPreview();
    this.fireMoveCommand();
    return true;
  }

  private requestDriveToScreen(sx: number, sy: number): void {
    if (!this.jac?.driving || this.jac.isExiting()) return;
    if (performance.now() < this.suppressDriveTapUntil) return;
    if (this.pickJacAtScreen(sx, sy)) return;
    const doorHit = this.pickBuildingDoorAtScreen(sx, sy);
    const buildingHit = doorHit ?? this.pickBuildingAtScreen(sx, sy);
    if (buildingHit?.door && buildingHit.panelTitle) {
      this.requestDriveToEnter({ panelTitle: buildingHit.panelTitle, door: buildingHit.door });
      return;
    }
    this.events.stickCancel?.();
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const tile = worldToTile(wx, wy);
    if (!tile || !this.jac.driveTileOk(tile.x, tile.y)) {
      this.toastDriveUnreachable();
      return;
    }
    this.driveToTile(tile.x, tile.y, true);
  }

  private driveToTile(gx: number, gy: number, fromPointer = false): boolean {
    if (!this.jac?.driving || this.jac.isExiting()) return false;
    this.events.stickCancel?.();
    this.pendingBuildingEntry = null;
    this.pendingDriveEnter = null;
    if (!this.jac.driveTileOk(gx, gy)) {
      this.toastDriveUnreachable();
      return false;
    }
    const path = this.jac.findDrivePath(gx, gy);
    if (!path) {
      this.toastDriveUnreachable();
      return false;
    }
    this.qaLastDriveTap = { x: gx, y: gy };
    if (fromPointer) this.qaPointerDriveAccepts += 1;
    const dest = path.length > 0 ? path[path.length - 1] : { x: gx, y: gy };
    this.jac.setDrivePath(path.length > 0 ? path : [dest], dest);
    this.startCameraFollow();
    this.drawPathPreview();
    this.fireMoveCommand();
    return true;
  }

  private drawPathPreview(): void {
    this.pathGfx.clear();
    if (this.events.buildingPanel?.isOpen()) return;
    const drivePts =
      this.jac?.driving && (this.jac.drivePath.length > 0 || this.jac.driveGoal)
        ? [
            { x: this.jac.cx, y: this.jac.cy },
            ...this.jac.drivePath,
            ...(this.jac.driveGoal ? [this.jac.driveGoal] : []),
          ]
        : [];
    const points =
      drivePts.length > 0
        ? drivePts
        : this.path.length === 0
          ? []
          : [{ x: this.charTx, y: this.charTy }, ...this.path];
    if (points.length === 0) return;
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

  recenterOnCharacter(): void {
    this.centerOnCharacter(false);
  }

  private freeRectCenter(): { x: number; y: number } {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const m = cameraFitMargins();
    return {
      x: m.left + (sw - m.left - m.right) / 2,
      y: m.top + (sh - m.top - m.bottom) / 2,
    };
  }

  private placeWorldAtScreen(wx: number, wy: number, sx: number, sy: number): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.cameraX = (sx - sw / 2) / this.zoom - wx;
    this.cameraY = (sy - sh / 2) / this.zoom - wy;
  }

  private centerOnCharacter(animate: boolean): void {
    this.updateCameraFitMargins();
    const t = this.followTargetWorld();
    const aim = this.freeRectCenter();
    this.placeWorldAtScreen(t.x, t.y, aim.x, aim.y);
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
    const chromeInsets = this.events.chrome?.layoutInsets?.();
    if (chromeInsets) {
      left = Math.max(left, chromeInsets.left);
      top = Math.max(top, chromeInsets.top);
      right = Math.max(right, chromeInsets.right);
      bottom = Math.max(bottom, chromeInsets.bottom);
    }
    if (this.jac && (this.jac.mode === 'info' || this.jac.mode === 'drive')) {
      const phone = this.app.screen.width <= 767;
      bottom = Math.max(bottom, phone ? (this.jac.mode === 'info' ? 320 : 80) : 180);
      if (this.jac.rearCam) top = Math.max(top, phone ? 140 : 160);
    }
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
        // Layouts v2: the tutorial is a top-right overlay. Never treat it as a left
        // sidebar — that used to steal the map hole and shove the character off-screen.
        if (bottomAnchored && box.left < sw * 0.45) {
          bottom = Math.max(bottom, Math.ceil(sh - box.top + pad));
        } else if (box.left < sw * 0.35 && box.top <= sh * 0.5) {
          left = Math.max(left, Math.ceil(box.right + pad));
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
    this.syncViewTransform();
    this.camera.position.set(sw / 2, sh / 2);
    this.camera.scale.set(this.viewSx, this.viewSy);
    this.camera.rotation = this.viewRot;
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
      this.canvasEl.dataset.fitLeft = String(margins.left);
      this.canvasEl.dataset.fitRight = String(sw - margins.right);
      this.canvasEl.dataset.fitTop = String(margins.top);
      this.canvasEl.dataset.fitBottom = String(sh - margins.bottom);
      this.canvasEl.dataset.mapCovW = String(cov.covW);
      this.canvasEl.dataset.mapCovH = String(cov.covH);
      this.canvasEl.dataset.mapIntersects = cov.intersects ? '1' : '0';
      this.canvasEl.dataset.pinchFrame = String(this.pinchFrameSerial);
      this.canvasEl.dataset.zoomSource = this.zoomSource;
      this.canvasEl.dataset.anchorWx = String(-this.cameraX);
      this.canvasEl.dataset.anchorWy = String(-this.cameraY);
      this.canvasEl.dataset.viewMode = this.viewMode;
      this.canvasEl.dataset.yaw = String(this.yaw);
      this.canvasEl.dataset.viewSy = String(this.viewSy);
      this.canvasEl.dataset.viewRot = String(this.viewRot);
      this.canvasEl.dataset.mapOverview = this.mapOverview ? '1' : '0';
      this.canvasEl.dataset.layout = document.body.dataset.layout ?? '';
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
    this.ensureVisibleTiles();
    const { minX, maxX, minY, maxY } = this.viewWorldAabb(TILE_W * 1.5);
    const iso = this.qaIsolation;
    this.avatar?.setVisible(!iso && !this.jac?.driving);
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
    const tileG = this.tileByCell.get(`${INICIO[0]},${INICIO[1]}`)?.g;
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
    this.updateCameraFitMargins();
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const margins = cameraFitMargins();
    const innerW = Math.max(1, sw - margins.left - margins.right);
    const innerH = Math.max(1, sh - margins.top - margins.bottom);
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
    const fit = Math.min(innerW / (2 * (hw + 60)), innerH / (2 * (hh + 40)));
    this.zoom = clampZoom(Math.min(1, Math.max(0.45, fit)), sw, sh);
    const cx = margins.left + innerW / 2;
    const cy = margins.top + innerH / 2;
    this.placeWorldAtScreen(char.x, char.y, cx, cy);
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
    this.updateCameraFitMargins();
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
    const chrome = this.events.chrome?.layoutInsets?.();
    const ml = Math.max(side, chrome?.left ?? 0);
    const mr = Math.max(side, chrome?.right ?? 0);
    const mt = Math.max(48, chrome?.top ?? 0);
    const mb = Math.max(96, chrome?.bottom ?? 0);
    const zoom = clampZoom((sw - ml - mr) / (maxX - minX), sw, sh);
    const cx = (minX + maxX) / 2;
    const cy = (minY - roofRise + maxY) / 2;
    setCameraFitMargins({ left: ml, right: mr, top: mt, bottom: mb });
    this.zoom = zoom;
    this.placeWorldAtScreen(cx, cy, ml + (sw - ml - mr) / 2, mt + (sh - mt - mb) / 2);
    const hardened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = hardened.cameraX;
    this.cameraY = hardened.cameraY;
    this.zoom = hardened.zoom;
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
    if (this.jac?.driving) return;
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
    // Rooms have no pinch: fire on the next turn so a tap on the mat leaves without the 120 ms
    // map wait (that wait plus the sheet close was the ~650 ms iPhone exit).
    const waitMs = this.interiorActive ? 0 : Math.max(0, this.firstPointerDownAt + 120 - performance.now());
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
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && focused.closest('.jac-hud')) focused.blur();
        // A press shorter than a frame never reaches updateMovement on slow devices.
        if (this.seatedBench && !this.interiorActive) this.standThen(null);
        e.preventDefault();
      }
      if (e.key === 'Shift') this.shiftHeld = true;
      if (!e.repeat && !isTypingTarget(e.target) && (k === 'e' || k === '1' || k === '2')) {
        if (this.handleJacKey(k)) e.preventDefault();
      }
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !isTypingTarget(e.target)) {
        if (e.key === 'Enter' && this.handleJacKey('enter')) e.preventDefault();
        else if (this.seatedBench && !this.interiorActive) {
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
        // Plain mouse wheel zooms (Tom John). ctrl/meta is trackpad pinch — also zoom.
        // Shift+wheel or a mostly-horizontal trackpad swipe still pans.
        if (e.shiftKey && dx === 0) {
          dx = dy;
          dy = 0;
        }
        if (e.ctrlKey || e.metaKey || Math.abs(dy) >= Math.abs(dx)) {
          this.zoomSource = 'wheel';
          const rate = Math.abs(dy) < 50 ? 1 / 100 : 1 / 450;
          const d = Math.max(-240, Math.min(240, dy));
          const rect = canvas.getBoundingClientRect();
          this.setZoom(this.zoom * Math.pow(2, -d * rate), { x: e.clientX - rect.left, y: e.clientY - rect.top });
          this.zoomSource = 'none';
          return;
        }
        this.panByScreen(-dx, -dy);
      },
      { passive: false },
    );

    let lastTouchCount = 0;
    let driveTap: { x: number; y: number; t: number } | null = null;

    const onTouchPinchStartPassive = (e: TouchEvent) => {
      if (e.touches.length < 2) lastTouchCount = e.touches.length;
      if (this.jac?.driving && e.touches.length === 1) {
        const t = e.touches[0];
        driveTap = { x: t.clientX, y: t.clientY, t: performance.now() };
        const rect = canvas.getBoundingClientRect();
        const sx = t.clientX - rect.left;
        const sy = t.clientY - rect.top;
        if (this.pickJacAtScreen(sx, sy)) {
          driveTap = null;
        }
      } else if (e.touches.length >= 2) {
        driveTap = null;
      }
    };
    const onTouchPinchStart = (e: TouchEvent) => {
      if (!isGameTouchTarget(e.target)) return;
      if (this.zoomSource === 'gesture') return;
      const n = e.touches.length;
      if (n < 2) return;
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const mid = this.touchPairMidpoint(t0, t1);
      const dist = this.touchPairDistance(t0, t1);
      if (this.pointers.size >= 2) {
        lastTouchCount = n;
        return;
      }
      this.touchOnlyPinch = true;
      this.beginPinchAtMid(mid, dist);
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

    const noteUnreachableAtClient = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (!this.jac?.driving || this.jac.isExiting()) return false;
      if (performance.now() < this.suppressDriveTapUntil) return false;
      if (target instanceof HTMLElement && target.closest('[data-jac], .joystick, .checklist, .chrome')) {
        return false;
      }
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      if (this.pickJacAtScreen(sx, sy)) {
        driveTap = null;
        return true;
      }
      return false;
    };
    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        noteUnreachableAtClient(t.clientX, t.clientY, e.target);
      },
      { capture: true, passive: true },
    );
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0) return;
        noteUnreachableAtClient(e.clientX, e.clientY, e.target);
      },
      { capture: true },
    );
    canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
      },
      { passive: false },
    );
    canvas.addEventListener('touchstart', onTouchPinchStartPassive, { passive: true });
    canvas.addEventListener('touchstart', onTouchPinchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchPinchMove, { passive: false });
    canvas.addEventListener(
      'touchend',
      (e) => {
        lastTouchCount = e.touches.length;
        if (e.touches.length < 2) endTouchPinch();
        if (
          this.jac?.driving &&
          driveTap &&
          e.changedTouches.length === 1 &&
          e.touches.length === 0 &&
          !this.pinchGestureActive
        ) {
          const t = e.changedTouches[0];
          const dt = performance.now() - driveTap.t;
          const dist = Math.hypot(t.clientX - driveTap.x, t.clientY - driveTap.y);
          driveTap = null;
          if (
            dt < 450 &&
            dist < 22 &&
            !this.jac.isExiting() &&
            performance.now() >= this.suppressDriveTapUntil
          ) {
            const rect = canvas.getBoundingClientRect();
            this.requestDriveToScreen(t.clientX - rect.left, t.clientY - rect.top);
          }
        } else if (e.touches.length === 0) {
          driveTap = null;
        }
      },
      { passive: true },
    );

    const stickOwnsFinger = () => !!this.events.stickActive?.();

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
        this.events.stickCancel?.();
      }
      this.onPointerCountChanged(prevCount, this.pointers.size);
      if (e.pointerType !== 'touch' && !stickOwnsFinger()) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.pointers.size < 2 && (this.events.stickActive?.() || this.jac?.driving)) {
        if (this.tapStart) {
          this.tapDriftPx = Math.max(
            this.tapDriftPx,
            Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y),
          );
        }
        return;
      }
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

  /**
   * Rear PiP: render the world into a RenderTexture, then restore the main canvas
   * with an opaque clear. Pixi's LOW ticker then presents the stage (including the
   * PiP sprite). Never readPixels / drawImage the game WebGL view.
   */
  private composeRearPass(): void {
    const want = this.jac?.rearCam ? 1 : 0;
    if (want === 0) {
      this.rearFade = 0;
      this.rearFadeFrom = 0;
      this.rearFadeTo = 0;
    } else if (want !== this.rearFadeTo) {
      this.rearFadeFrom = this.rearFade;
      this.rearFadeTo = want;
      this.rearFadeT0 = performance.now();
    }
    if (want === 1) {
      const t = Math.min(1, (performance.now() - this.rearFadeT0) / IsoScene.REAR_FADE_MS);
      this.rearFade = this.rearFadeFrom + (this.rearFadeTo - this.rearFadeFrom) * t;
    }
    const drewRear = !!this.jac?.rearCam;
    if (drewRear) this.renderRearTexture();
    this.layoutRearSprite();
    if (drewRear) this.restoreMainTarget();
  }

  private opaqueBgRgba(): [number, number, number, number] {
    const bg = worldBackgroundColor();
    return [((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255, 1];
  }

  private ensureRearTexture(sw: number, sh: number): RenderTexture {
    const w = Math.max(2, Math.ceil(sw));
    const h = Math.max(2, Math.ceil(sh));
    if (!this.rearRT || this.rearRT.width !== w || this.rearRT.height !== h) {
      this.rearRT?.destroy(true);
      this.rearRT = RenderTexture.create({ width: w, height: h });
      if (!this.rearSprite) {
        this.rearSprite = new Sprite(this.rearRT);
        this.rearSprite.eventMode = 'none';
        this.rearLayer?.addChildAt(this.rearSprite, 0);
      } else {
        this.rearSprite.texture = this.rearRT;
      }
      if (!this.rearMask) {
        this.rearMask = new Graphics();
        this.rearMask.eventMode = 'none';
        this.rearLayer?.addChild(this.rearMask);
        if (this.rearLayer) this.rearLayer.mask = this.rearMask;
      }
    }
    return this.rearRT;
  }

  private renderRearTexture(): void {
    if (!this.jac || !this.app) return;
    const cw = this.app.screen.width || 1;
    const ch = this.app.screen.height || 1;
    const rt = this.ensureRearTexture(cw, ch);
    const sprite = this.rearSprite;
    if (sprite) sprite.visible = false;
    try {
      this.app.renderer.render({
        container: this.camera,
        target: rt,
        clear: true,
        clearColor: [0.063, 0.067, 0.078, 1],
      });
    } catch {
      /* rear RT skip */
    }
    if (sprite) sprite.visible = true;
  }

  private layoutRearSprite(): void {
    const sprite = this.rearSprite;
    const layer = this.rearLayer;
    const mask = this.rearMask;
    const canvas = this.canvasEl;
    if (!sprite || !layer || !canvas || !this.app) return;
    if (this.rearFade < 0.01) {
      layer.visible = false;
      return;
    }
    layer.visible = true;
    const cr = canvas.getBoundingClientRect();
    const slot = document.querySelector('.jac-rear__view') as HTMLElement | null;
    let left = 16;
    let top = cr.width <= 767 ? 80 : 12;
    let w = Math.min(420, Math.max(120, cr.width - 32));
    let h = cr.width <= 767 ? 110 : 128;
    if (slot) {
      const sr = slot.getBoundingClientRect();
      if (sr.width > 8 && sr.height > 8) {
        left = sr.left - cr.left;
        top = sr.top - cr.top;
        w = sr.width;
        h = sr.height;
      } else {
        left = (cr.width - w) / 2;
      }
    } else {
      left = (cr.width - w) / 2;
    }
    const cw = this.app.screen.width || 1;
    const ch = this.app.screen.height || 1;
    const region = this.jac?.rearSource((x, y) => this.worldToScreen(x, y), cw, ch) ?? {
      sx: 0,
      sy: 0,
      sw: w,
      sh: h,
    };
    const scaleX = w / Math.max(1, region.sw);
    const scaleY = h / Math.max(1, region.sh);
    sprite.position.set(left - region.sx * scaleX, top - region.sy * scaleY);
    sprite.width = cw * scaleX;
    sprite.height = ch * scaleY;
    const chrome = document.querySelector('.jac-rear') as HTMLElement | null;
    const cssFade = chrome ? Number(getComputedStyle(chrome).opacity) : this.rearFade;
    sprite.alpha = Number.isFinite(cssFade) ? cssFade : this.rearFade;
    if (mask) {
      mask.clear();
      mask.rect(left, top, w, h);
      mask.fill({ color: 0xffffff });
    }
  }

  private restoreMainTarget(): void {
    if (!this.app || !this.canvasEl) return;
    try {
      this.app.renderer.renderTarget.bind(this.canvasEl, true, this.opaqueBgRgba());
    } catch {
      /* next ticker present still targets the canvas */
    }
  }

  private followTargetWorld(): { x: number; y: number } {
    if (this.jac?.driving && !this.interiorActive) {
      const c = this.jac.worldCenter();
      return { x: c.x, y: c.y - CHAR_BODY_CENTRE_RISE };
    }
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
    const driving = !!this.jac?.driving && !this.interiorActive;
    if (driving) {
      f.suspended = false;
      f.engaged = true;
    }
    const t = this.followTargetWorld();
    const scope = this.interiorActive ? `room:${this.interiorDef?.id ?? ''}` : 'map';
    const jumped =
      !driving &&
      (f.scope !== scope ||
        !Number.isFinite(f.prevX) ||
        Math.hypot(t.x - f.prevX, t.y - f.prevY) > FOLLOW_TELEPORT_WORLD);
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
    if (moved || walking || driving) f.engaged = true;
    if (!f.engaged) return;

    const dt = Math.min(0.1, this.app.ticker.deltaMS / 1000);
    const camBeforeX = this.cameraX;
    const camBeforeY = this.cameraY;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const aim = this.freeRectCenter();
    const aimWx = (aim.x - sw / 2) / this.zoom;
    const aimWy = (aim.y - sh / 2) / this.zoom;
    // Offset of the character from the map hole (free-rect) centre, in world px.
    let ox = this.cameraX - stepX + t.x - aimWx;
    let oy = this.cameraY - stepY + t.y - aimWy;
    if (this.reducedMotion) {
      ox = 0;
      oy = 0;
      f.vx = 0;
      f.vy = 0;
    } else {
      const smooth = driving ? FOLLOW_DRIVE_SMOOTH_S : FOLLOW_SMOOTH_S;
      const sx = smoothDampToZero(ox, f.vx, smooth, dt);
      const sy = smoothDampToZero(oy, f.vy, smooth, dt);
      ox = sx.offset;
      oy = sy.offset;
      f.vx = sx.velocity;
      f.vy = sy.velocity;
    }
    const wantX = ox - t.x + aimWx;
    const wantY = oy - t.y + aimWy;
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
    if (!driving && !moved && !walking && camMoved < 0.05 && residual < 0.5) {
      f.engaged = false;
      f.vx = 0;
      f.vy = 0;
      this.applyCamera(true);
    }
  }

  private moveCommandArmed = true;

  private updateMovement(): void {
    this.syncObjectSprites();
    if (this.doorCooldown > 0) {
      this.doorCooldown -= this.app.ticker.deltaMS;
    }
    this.leaveBenchIfStood();
    const stick = this.qaStick ?? this.events.stick?.() ?? { x: 0, y: 0 };
    const stickHeld = !!this.qaStick || !!this.events.stickActive?.();
    const stickLive = Math.abs(stick.x) > 0.02 || Math.abs(stick.y) > 0.02;
    if (this.jac?.driving && !this.interiorActive) {
      let dx = 0;
      let dy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
      if (dx === 0 && dy === 0 && (stickLive || stickHeld) && !this.jac.isExiting()) {
        dx = stick.x;
        dy = stick.y;
      }
      if (this.jac.isExiting()) {
        dx = 0;
        dy = 0;
      }
      if (dx !== 0 || dy !== 0) this.pendingDriveEnter = null;
      this.startCameraFollow();
      if (dx !== 0 || dy !== 0 || stickHeld || this.jac.drivePath.length > 0) {
        if (dx !== 0 || dy !== 0) this.fireMoveCommand();
      }
      this.jac.update(this.app.ticker.deltaMS / 1000, { dx, dy, autoShift: true });
      this.charTx = this.jac.cx;
      this.charTy = this.jac.cy;
      if (this.pendingJacExit && this.jac.readyToExit()) this.finishJacGetOut();
      else this.tryFinishDriveEnter();
      this.drawPathPreview();
      return;
    }
    if (stickLive) {
      this.noteAvatarInput();
      this.startCameraFollow();
    }
    if (this.keys.size > 0 || stickLive) {
      let dx = 0;
      let dy = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;
      if (dx === 0 && dy === 0 && stickLive) {
        dx = stick.x;
        dy = stick.y;
      }
      if (this.interiorActive && this.interiorDef) {
        if (dx !== 0 || dy !== 0) {
          this.interiorPath = [];
          this.fireMoveCommand();
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
        this.fireMoveCommand();
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

    if (this.keys.size === 0 && !stickLive && this.path.length === 0 && this.interiorPath.length === 0) {
      this.moveCommandArmed = true;
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
          this.snapToWalkGoal();
          this.tryArriveAtDoorTile(Math.round(this.charTx), Math.round(this.charTy));
          if (this.pendingJacEnter) this.trySeatInJac();
          else if (this.pendingJacPanel) this.tryOpenJacMenu();
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

  private fireMoveCommand(): void {
    if (!this.moveCommandArmed) return;
    this.moveCommandArmed = false;
    this.events.onMoveCommand?.();
  }

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
    const tx = Math.round(x);
    const ty = Math.round(y);
    if (!walkable(tx, ty)) {
      const sx = Math.sign(dx);
      const sy = Math.sign(dy);
      if (sx && walkable(tx + sx, ty)) return { x: tx + sx, y: ty };
      if (sy && walkable(tx, ty + sy)) return { x: tx, y: ty + sy };
    }
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
    if (this.interiorActive || this.jac?.driving) return;
    if (this.path.length > 0) return;
    if (this.doorCooldown > 0) return;
    const building = getBuildingAtDoor(tx, ty);
    if (!building?.panelTitle || !building.door) return;

    if (!this.pendingBuildingEntry) return;
    const d = this.pendingBuildingEntry.door;
    const onPendingDoor = tx === d.x && ty === d.y;
    const adjacentPending =
      Math.abs(tx - d.x) + Math.abs(ty - d.y) <= 2 &&
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
    if (this.jac?.driving) return;
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
    if (this.interiorActive || this.jac?.driving || this.doorCooldown > 0) return;
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
    if (this.interiorActive || this.jac?.driving || this.doorCooldown > 0) return false;
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

  /** Camera numbers onto the Pixi world, without layout reads, tile cull, or hash writes. */
  private syncOutdoorTransform(): void {
    this.syncViewTransform();
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.camera.position.set(sw / 2, sh / 2);
    this.camera.scale.set(this.viewSx, this.viewSy);
    this.camera.rotation = this.viewRot;
    this.world.position.set(this.cameraX * this.zoom, this.cameraY * this.zoom);
    this.world.scale.set(this.zoom);
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
      this.interiorExitGen += 1;
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
      this.interiorSprite?.destroy({ children: false, texture: false, textureSource: false });
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
      studio.setInterior(true);
      if (!opts?.fromHash && !opts?.skipFade) studio.playDoor();
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
    const dyingSprite = this.interiorSprite;
    const fromHash = !!opts?.fromHash;
    const immediate = !!opts?.immediate;
    const finish = () => {
      this.interiorActive = false;
      this.interiorDef = null;
      this.interiorGrid = [];
      this.interiorPath = [];
      this.interiorSprite = null;
      // Sheet off first, before the outdoor restore, so leave is visible and timed without the close transition.
      this.events.onExitInterior?.();
      this.tilesLayer.visible = true;
      this.objectsLayer.visible = true;
      this.pathLayer.visible = true;
      this.characterLayer.visible = true;
      this.interiorLayer.visible = false;
      if (door) {
        this.charTx = door.x;
        this.charTy = door.y;
        this.syncCharacterGraphic();
      }
      this.restoreOutdoorCameraAfterExit(opts?.outdoorCam);
      this.syncOutdoorTransform();
      if (this.canvasEl) {
        this.canvasEl.dataset.interior = '';
        this.canvasEl.dataset.interiorW = '';
        this.canvasEl.dataset.interiorH = '';
      }
      const cleanup = () => {
        dyingSprite?.destroy({ children: false, texture: false, textureSource: false });
        if (this.interiorActive) return;
        this.fitOutskirts(this.app.screen.width, this.app.screen.height);
        this.cullVisibleTiles();
        this.interiorFloorGfx.clear();
        this.interiorWallGfx.clear();
        this.interiorPropGfx.clear();
        if (!fromHash) {
          replaceOutdoorHash({
            x: this.cameraX,
            y: this.cameraY,
            zoom: this.zoom,
          });
        }
        this.outdoorCamBeforeInterior = null;
        if (fromHash) {
          this.interiorHistoryEntries = Math.max(0, this.interiorHistoryEntries - 1);
          this.historySyncInProgress = false;
        }
        this.events.onInteriorIdChange?.(null);
        this.applyCamera(!fromHash);
        studio.setInterior(false);
        if (!fromHash) studio.playDoor();
      };
      if (immediate) {
        const gen = ++this.interiorExitGen;
        requestAnimationFrame(() => {
          if (gen !== this.interiorExitGen) {
            dyingSprite?.destroy({ children: false, texture: false, textureSource: false });
            return;
          }
          cleanup();
        });
        return;
      }
      cleanup();
    };

    finish();
    // Tap / Salir: the room is already gone. Fade afterwards so leave stays under 150 ms until the map accepts input.
    if (opts?.skipFade || opts?.fromHash || opts?.immediate || this.reducedMotion) return;
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
    this.fireMoveCommand();
  }

  /**
   * Shared leave for the mat tap and Salir: room gone and overlay snapped off this frame
   * so the map can take a pointer immediately.
   */
  leaveInteriorNow(): void {
    if (!this.interiorActive) return;
    const t0 = performance.now();
    this.interiorPath = [];
    this.exitInterior({ immediate: true });
    if (this.canvasEl) this.canvasEl.dataset.exitWorkMs = String(Math.round(performance.now() - t0));
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
    this.leaveInteriorNow();
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

  private initJac(): void {
    const obj = objects.find((o) => o.id === JAC_ID);
    const g = obj ? this.objectGraphics.get(obj.id) : undefined;
    const v = obj ? this.objectVisuals.get(obj.id) : undefined;
    if (!obj || !g || !v) return;
    this.jac = new JacT9(obj, {
      container: g,
      visual: v,
      tapBox: this.objectTapBoxes,
      onStuck: () => {
        if (this.pendingDriveEnter) this.jacGetOut({ thenEnter: true });
        else this.events.onUnreachable?.();
      },
    });
    g.label = JAC_ID;
  }

  /** A tap on the van sprite always wins, even under a building or tile. */
  private claimJacTap(e: { clientX?: number; clientY?: number; global?: { x: number; y: number }; nativeEvent?: unknown }): boolean {
    if (!this.jac || this.jac.driving) return false;
    const local = this.federatedToCanvas(e);
    return !!local && this.pickJacAtScreen(local.x, local.y);
  }

  private pickJacAtScreen(sx: number, sy: number): boolean {
    if (!this.jac || this.interiorActive) return false;
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const g = this.objectGraphics.get(this.jac.obj.id);
    if (g) {
      const lx = wx - g.x;
      const ly = wy - g.y;
      const hit = g.hitArea;
      if (hit && typeof hit.contains === 'function' && hit.contains(lx, ly)) return true;
      const box = this.objectTapBoxes.get(this.jac.obj.id);
      if (box?.contains(lx, ly)) return true;
    }
    const tile = worldToTile(wx, wy);
    if (tile && this.jac.tapHitsTile(tile.x, tile.y)) return true;
    const c = this.jac.worldCenter();
    const s = this.worldToScreen(c.x, c.y);
    return Math.hypot(sx - s.x, sy - s.y) < 92;
  }

  tapJac(): void {
    if (!this.jac || this.interiorActive || this.jac.driving) return;
    this.jacGetIn();
  }

  private atJacDoor(maxDist: number): boolean {
    if (!this.jac) return false;
    if (this.jac.approachTiles().some((s) => Math.hypot(this.charTx - s.x, this.charTy - s.y) < maxDist)) {
      return true;
    }
    const door = this.jac.driverDoorTile({ x: this.charTx, y: this.charTy });
    if (!door) return false;
    return Math.hypot(this.charTx - door.x, this.charTy - door.y) < maxDist;
  }

  private tryOpenJacMenu(): void {
    if (!this.atJacDoor(1.6)) {
      this.pendingJacPanel = false;
      return;
    }
    this.openJacMenu();
  }

  private trySeatInJac(): void {
    if (!this.atJacDoor(1.6)) {
      this.pendingJacEnter = false;
      return;
    }
    const door = this.jac?.driverDoorTile({ x: this.charTx, y: this.charTy });
    if (door && Math.hypot(this.charTx - door.x, this.charTy - door.y) > 0.2) {
      this.charTx = door.x;
      this.charTy = door.y;
      this.syncCharacterGraphic();
    }
    this.seatInJac();
  }

  private snapToWalkGoal(): void {
    const raw = this.canvasEl?.dataset.walkGoal;
    if (!raw) return;
    try {
      const goal = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof goal.x !== 'number' || typeof goal.y !== 'number') return;
      if (!cells[goal.y]?.[goal.x]?.walkable) return;
      const d = Math.hypot(this.charTx - goal.x, this.charTy - goal.y);
      if (d > 0.04 && d < 1.2) {
        this.charTx = goal.x;
        this.charTy = goal.y;
        this.syncCharacterGraphic();
      }
    } catch {
      /* ignore */
    }
  }

  private openJacMenu(): void {
    this.pendingJacPanel = false;
    if (!this.jac || this.jac.driving) return;
    if (!this.atJacDoor(1.6)) return;
    this.path = [];
    this.drawPathPreview();
    this.jac.openMenu();
    void this.jac.ensureLoaded();
    this.events.chrome?.onJacHud?.();
  }

  jacClose(): void {
    this.jac?.closeToMap();
  }

  jacOpenInfo(): void {
    if (!this.jac || this.jac.driving) return;
    this.events.chrome?.onJacHud?.();
    this.jac.openInfo();
    void this.jac.ensureLoaded();
  }

  jacGetIn(): void {
    if (!this.jac || this.interiorActive || this.jac.driving) return;
    this.pendingBuildingEntry = null;
    if (this.seatedBench) {
      this.standThen(() => this.jacGetIn());
      return;
    }
    const door = this.jac.driverDoorTile({ x: this.charTx, y: this.charTy });
    if (!door) {
      this.events.onUnreachable?.();
      return;
    }
    if (this.atJacDoor(1.2)) {
      this.seatInJac();
      return;
    }
    this.pendingJacEnter = true;
    this.pendingJacPanel = false;
    if (this.jac.mode === 'menu' || this.jac.mode === 'info') this.jac.closeToMap();
    this.events.chrome?.onJacHud?.();
    this.walkToTile(door.x, door.y, false);
    if (this.path.length === 0) this.trySeatInJac();
  }

  private seatInJac(): void {
    if (!this.jac || this.jac.driving) {
      this.pendingJacEnter = false;
      return;
    }
    this.pendingJacEnter = false;
    this.pendingJacPanel = false;
    this.path = [];
    this.drawPathPreview();
    this.pendingBuildingEntry = null;
    this.events.chrome?.onJacHud?.();
    this.jac.setMode('drive');
    this.avatar.setVisible(false);
    this.startCameraFollow();
    void this.jac.ensureLoaded();
  }

  jacGetOut(opts?: { thenEnter?: boolean }): void {
    if (!this.jac?.driving) return;
    this.pendingJacEnter = false;
    this.pendingJacPanel = false;
    if (!opts?.thenEnter) this.pendingDriveEnter = null;
    this.events.stickCancel?.();
    this.suppressDriveTapUntil = performance.now() + 800;
    this.pendingJacExit = true;
    this.jac.requestExit();
  }

  private finishJacGetOut(): void {
    if (!this.jac?.driving) {
      this.pendingJacExit = false;
      return;
    }
    this.pendingJacExit = false;
    const snap = this.jac.snapshot();
    const spot = this.jac.exitTile();
    this.jac.cancelExit();
    if (snap.exitCx != null && snap.exitCy != null) {
      this.jac.cx = snap.exitCx;
      this.jac.cy = snap.exitCy;
    }
    if (this.pendingDriveEnter) {
      this.jac.faceClearOfDoor(this.pendingDriveEnter.door.x, this.pendingDriveEnter.door.y);
    }
    this.jac.setMode('parked');
    this.jac.relayoutParked();
    if (spot) {
      this.charTx = spot.x;
      this.charTy = spot.y;
      this.syncCharacterGraphic();
    }
    this.avatar.setVisible(true);
    this.jac.setBubble(false);
    if (this.jacBubbleTimer) {
      clearTimeout(this.jacBubbleTimer);
      this.jacBubbleTimer = null;
    }
    this.startCameraFollow();
    const entry = this.pendingDriveEnter;
    this.pendingDriveEnter = null;
    if (entry) {
      this.requestWalk(entry.door.x, entry.door.y, false, { buildingEntry: entry });
    }
  }

  private tryFinishDriveEnter(): void {
    if (!this.pendingDriveEnter || !this.jac?.driving || this.jac.isExiting()) return;
    const door = this.pendingDriveEnter.door;
    const dist = Math.hypot(this.jac.cx - door.x, this.jac.cy - door.y);
    const idle = this.jac.drivePath.length === 0 && !this.jac.driveGoal;
    const near = dist < 7 && this.jac.mph < 1;
    const timedOut = this.pendingDriveEnterAt > 0 && performance.now() - this.pendingDriveEnterAt > 12000;
    if (!near && !timedOut && !(idle && this.jac.mph <= 0.4)) return;
    this.jacGetOut({ thenEnter: true });
  }

  qaDriveTo(tx: number, ty: number): boolean {
    return this.driveToTile(tx, ty, false);
  }

  qaFindDrivePath(tx: number, ty: number): { x: number; y: number }[] | null {
    return this.jac?.findDrivePath(tx, ty) ?? null;
  }

  qaFps(): { fps: number; elapsedMS: number; sameCanvas: boolean } {
    return {
      fps: this.app?.ticker.FPS ?? 0,
      elapsedMS: this.app?.ticker.elapsedMS ?? 0,
      sameCanvas: !!this.app && this.app.canvas === this.canvasEl,
    };
  }

  qaTileAtClient(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvasEl?.getBoundingClientRect();
    if (!rect) return null;
    const { x: wx, y: wy } = this.screenToWorld(clientX - rect.left, clientY - rect.top);
    return this.resolveGroundTap(wx, wy);
  }

  qaDriveTileOk(x: number, y: number): boolean {
    return this.jac?.driveTileOk(x, y) ?? false;
  }

  qaJacDoor(from?: { x: number; y: number }): { x: number; y: number } | null {
    if (!this.jac) return null;
    return this.jac.driverDoorTile(from ?? { x: this.charTx, y: this.charTy });
  }

  qaJacApproach(): { x: number; y: number }[] {
    return this.jac?.approachTiles() ?? [];
  }

  qaJacOverlapsProp(): boolean {
    return this.jac?.overlapsProp() ?? false;
  }

  qaJacCanSit(cx: number, cy: number): boolean {
    return this.jac?.canDriveAt(cx, cy) ?? false;
  }

  qaParkForDoor(
    doorX: number,
    doorY: number,
    buildingName?: string,
  ): { x: number; y: number; path?: { x: number; y: number }[] } | null {
    const prefer = buildingName ? buildingParkPrefer(buildingName) : null;
    const sit = this.jac?.parkForDoor(doorX, doorY, prefer ?? undefined);
    return sit ? { x: sit.x, y: sit.y, path: sit.path } : null;
  }

  qaParkedFootprint(): { x: number; y: number }[] {
    if (!this.jac) return [];
    return [...this.jac.parkedFootprintKeys()].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    });
  }

  qaJacStick(vec: { x: number; y: number } | null): void {
    this.qaStick = vec;
  }

  qaJacDriveStep(dt: number, dx: number, dy: number): {
    cx: number;
    cy: number;
    dir: string;
    overlap: boolean;
    mph: number;
  } | null {
    if (!this.jac?.driving) return null;
    this.jac.update(dt, { dx, dy, autoShift: true });
    this.charTx = this.jac.cx;
    this.charTy = this.jac.cy;
    this.startCameraFollow();
    this.updateCameraFollow();
    this.app?.render();
    this.events.onFrame?.();
    const s = this.jac.snapshot();
    return { cx: s.cx, cy: s.cy, dir: s.dir, overlap: this.jac.overlapsProp(), mph: s.mph };
  }

  jacSetLights(lights: JacLights): void {
    const prev = this.jac?.lightsOn;
    this.jac?.setLights(lights);
    if (prev !== this.jac?.lightsOn) this.syncObjectSprites(true);
  }

  jacSetGear(gear: JacGear): void {
    this.jac?.setGear(gear);
  }

  jacSetToggle(id: JacToggleId): void {
    this.jac?.setToggle(id);
  }

  jacSetEngine(): void {
    if (!this.jac) return;
    this.jac.setEngine(!this.jac.engineOn);
  }

  jacSetBubble(on: boolean): void {
    if (this.jacBubbleTimer) {
      clearTimeout(this.jacBubbleTimer);
      this.jacBubbleTimer = null;
    }
    this.jac?.setBubble(on);
  }

  private handleJacKey(k: string): boolean {
    if (!this.jac || this.interiorActive) return false;
    if (k === 'e') {
      if (this.jac.driving) {
        this.jacGetOut();
        return true;
      }
      if (this.atJacDoor(1.6) || this.jac.mode === 'menu' || this.jac.mode === 'info') {
        this.jacGetIn();
        return true;
      }
      return false;
    }
    if (k === 'enter') {
      if (this.jac.driving) return false;
      if (this.atJacDoor(1.6) || this.jac.mode === 'menu' || this.jac.mode === 'info') {
        this.jacGetIn();
        return true;
      }
      return false;
    }
    if (this.jac.mode === 'menu' && k === '1') {
      this.jacOpenInfo();
      return true;
    }
    if (this.jac.mode === 'menu' && k === '2') {
      this.jacGetIn();
      return true;
    }
    return false;
  }

  jacSnapshot(): JacSnapshot | null {
    return this.jac?.snapshot() ?? null;
  }

  jacHudActive(): boolean {
    return !!this.jac && this.jac.mode !== 'parked';
  }

  jacInfoOpen(): boolean {
    return this.jac?.mode === 'info';
  }

  jacHudAnchors(): {
    menu: { x: number; y: number } | null;
    bubble: { x: number; y: number } | null;
    follow: { x: number; y: number };
    rear: { canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } | null;
  } {
    const follow = this.jac?.driving ? this.jac.worldCenter() : tileToWorld(this.charTx, this.charTy);
    const needClient = this.jac?.mode === 'menu' || !!this.jac?.bubble;
    let menu: { x: number; y: number } | null = null;
    let bubble: { x: number; y: number } | null = null;
    let rear: { canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } | null = null;
    if (needClient) {
      const rect = this.canvasEl?.getBoundingClientRect();
      const toClient = (wx: number, wy: number) => {
        const s = this.worldToScreen(wx, wy);
        return { x: (rect?.left ?? 0) + s.x, y: (rect?.top ?? 0) + s.y };
      };
      if (this.jac && this.jac.mode === 'menu') {
        const v = this.objectVisuals.get(JAC_ID);
        if (v) {
          menu = toClient((v.cull.x0 + v.cull.x1) / 2, v.cull.y0 + 28);
        } else {
          const roof = this.jac.worldRoof();
          menu = toClient(roof.x, roof.y);
        }
      }
      if (this.jac?.bubble) {
        const head = this.worldToScreen(
          tileToWorld(this.charTx, this.charTy).x,
          tileToWorld(this.charTx, this.charTy).y - 90,
        );
        bubble = { x: (rect?.left ?? 0) + head.x, y: (rect?.top ?? 0) + head.y };
      }
    }
    return { menu, bubble, follow, rear };
  }

  qaJac(): JacSnapshot | null {
    return this.jacSnapshot();
  }

  /**
   * Parked JAC T9: footprint origin (23,16) 5×3, centre (25, 17), approach tile (27, 18).
   * `?focus=jac` frames this. Debug-free for QA.
   */
  focusJac(): boolean {
    if (this.interiorActive) this.leaveInteriorNow();
    if (!this.jac) return false;
    const c = this.jac.worldCenter();
    this.follow.suspended = false;
    this.follow.engaged = false;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.zoom = clampZoom(Math.max(this.zoom, 1), sw, sh);
    this.updateCameraFitMargins();
    const aim = this.freeRectCenter();
    this.placeWorldAtScreen(c.x, c.y - 24, aim.x, aim.y);
    this.applyCamera(true);
    return true;
  }

  jacSpawn(): {
    origin: { x: number; y: number };
    center: { x: number; y: number };
    front: { x: number; y: number };
    size: { w: number; h: number };
  } | null {
    if (!this.jac) return null;
    return this.jac.spawn;
  }

  qaJacEntities(): {
    count: number;
    ids: string[];
    sprites: number;
    onScreen: number;
    frameOk: boolean;
    texW: number;
    texH: number;
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    worldX: number;
    worldY: number;
    ghostVisible: boolean;
    spawnSprites: number;
    labels: number;
    rearVisible: boolean;
  } {
    const ids: string[] = [];
    for (const id of this.objectGraphics.keys()) if (id === JAC_ID || id.includes('jac')) ids.push(id);
    for (const id of this.objectVisuals.keys()) {
      if ((id === JAC_ID || id.includes('jac')) && !ids.includes(id)) ids.push(id);
    }
    const w = this.jac?.worldCenter() ?? { x: 0, y: 0 };
    const s = this.worldToScreen(w.x, w.y);
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const vanOnScreen = s.x > 8 && s.x < sw - 8 && s.y > 8 && s.y < sh - 8;
    const spr = this.jac ? this.objectVisuals.get(this.jac.obj.id)?.sprite : undefined;
    const bodyOn = spr ? spr.visible && spr.renderable && spr.alpha > 0.05 : false;
    const tex = spr?.texture;
    const frame = tex?.frame;
    const src = tex?.source;
    const frameOk = !!(
      frame &&
      src &&
      frame.width > 8 &&
      frame.height > 8 &&
      frame.x + frame.width <= src.width + 0.5 &&
      frame.y + frame.height <= src.height + 0.5
    );
    let worldSprites = 0;
    let spawnSprites = 0;
    let ghostVisible = false;
    const spawn = this.jac?.spawn.center;
    const spawnW = spawn ? tileToWorld(spawn.x, spawn.y) : null;
    const walk = (node: { label?: string; visible?: boolean; worldTransform?: { tx: number; ty: number }; children?: Iterable<{ label?: string }> }) => {
      const label = node.label ?? '';
      const vis = node.visible !== false;
      if (vis && (label === JAC_ID || label.includes('jac-t9') || label.startsWith('fill:jac'))) {
        worldSprites += 1;
        const wt = node.worldTransform;
        if (spawnW && wt && Math.hypot(wt.tx - spawnW.x, wt.ty - spawnW.y) < 80) spawnSprites += 1;
      }
      if (vis && label.includes('ghost')) ghostVisible = true;
      const kids = (node as { children?: Iterable<typeof node> }).children;
      if (kids) for (const c of kids) walk(c);
    };
    if (this.objectsLayer) walk(this.objectsLayer);
    if (!worldSprites && bodyOn) worldSprites = 1;
    const labels = [...document.querySelectorAll('.name-label, .jac-pill--name')].filter((el) => {
      const html = el as HTMLElement;
      if (html.hidden || html.closest('[hidden]')) return false;
      const text = html.textContent ?? '';
      return /JAC T9/i.test(text) && getComputedStyle(html).display !== 'none';
    }).length;
    const rearChrome = document.querySelector('.jac-rear') as HTMLElement | null;
    const rearOn = !!rearChrome && !rearChrome.hidden && rearChrome.classList.contains('is-on');
    return {
      count: Math.max(ids.length, worldSprites || (bodyOn ? 1 : 0)),
      ids,
      sprites: worldSprites || (bodyOn ? 1 : 0),
      onScreen: vanOnScreen && bodyOn && frameOk ? 1 : 0,
      frameOk,
      texW: frame?.width ?? 0,
      texH: frame?.height ?? 0,
      sx: s.x,
      sy: s.y,
      cx: this.jac?.cx ?? NaN,
      cy: this.jac?.cy ?? NaN,
      worldX: w.x,
      worldY: w.y,
      ghostVisible,
      spawnSprites,
      labels,
      rearVisible: rearOn || this.rearFade > 0.05,
    };
  }

  qaJacSet(partial: {
    mode?: JacSnapshot['mode'];
    lights?: JacLights;
    gear?: JacGear;
    dir?: 'se' | 'sw' | 'ne' | 'nw';
    engineOn?: boolean;
    bubble?: boolean;
    reversing?: boolean;
    steering?: number;
    trunk?: boolean;
    cx?: number;
    cy?: number;
  }): JacSnapshot | null {
    if (!this.jac) return null;
    if (partial.lights) this.jac.setLights(partial.lights);
    if (partial.gear) this.jac.setGear(partial.gear);
    if (partial.engineOn !== undefined) this.jac.setEngine(partial.engineOn);
    if (partial.trunk !== undefined) this.jac.setTrunk(partial.trunk);
    if (partial.bubble !== undefined) this.jacSetBubble(partial.bubble);
    if (partial.dir || partial.cx !== undefined || partial.cy !== undefined) {
      this.jac.qaPlace(partial.cx ?? this.jac.cx, partial.cy ?? this.jac.cy, partial.dir ?? this.jac.dir, this.jac.driving);
    }
    if (partial.mode === 'menu') this.openJacMenu();
    else if (partial.mode === 'info') this.jacOpenInfo();
    else if (partial.mode === 'drive') this.seatInJac();
    else if (partial.mode === 'parked' && this.jac.driving) {
      this.jac.cancelExit();
      this.pendingJacExit = false;
      this.avatar.setVisible(true);
      this.jac.setMode('parked');
    } else if (partial.mode === 'parked') this.jacClose();
    if (partial.reversing !== undefined) this.jac.reversing = partial.reversing;
    if (partial.steering !== undefined) this.jac.setQaSteer(partial.steering);
    this.jac.applySprite();
    this.app?.render();
    return this.jac.snapshot();
  }

  /** For QA — programmatic walk */
  getCharacterTile(): { x: number; y: number } {
    if (this.jac?.driving) return { x: Math.round(this.jac.cx), y: Math.round(this.jac.cy) };
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
    this.updateCameraFitMargins();
    const m = cameraFitMargins();
    const innerW = Math.max(1, sw - m.left - m.right);
    const innerH = Math.max(1, sh - m.top - m.bottom);
    const zoomX = innerW / spanX;
    const zoomY = innerH / spanY;
    this.zoom = clampZoom(Math.min(zoomX, zoomY) * 0.88, sw, sh);
    const aim = this.freeRectCenter();
    this.placeWorldAtScreen(mid.x, mid.y - 40, aim.x, aim.y);
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
    scale?: number;
  }[] {
    const out: { id: string; key: string; tl: { x: number; y: number }; w: number; h: number; kind: string; zIndex?: number; scale?: number }[] = [];
    for (const v of this.objectVisuals.values()) {
      const key = objectSpriteKey(v.obj, 'default', false)!;
      const tl = objectSpriteTopLeft(v.obj, key);
      const a = spriteAsset(key);
      const sc = objectSpriteScale(v.obj);
      out.push({ id: v.obj.id, key, tl, w: a.w * sc, h: a.h * sc, kind: v.obj.name, zIndex: v.zIndex, scale: sc });
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
    if (ids) {
      for (const id of ids) {
        const m = /^tile:(\d+),(\d+)$/.exec(id);
        if (m) this.ensureTile(Number(m[1]), Number(m[2]));
      }
    }
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
    this.ensureAllTiles();
    this.syncObjectSprites(true);
    this.refreshTileTextures();
  }

  /** QA: put a world point at the canvas centre at an exact zoom. */
  qaFrameWorld(wx: number, wy: number, zoom: number): void {
    this.suspendCameraFollow();
    this.zoom = zoom;
    this.updateCameraFitMargins();
    const aim = this.freeRectCenter();
    this.placeWorldAtScreen(wx, wy, aim.x, aim.y);
    this.applyCamera(false);
    this.app.render();
  }

  /** QA: what a tap at client (x, y) would pick, without acting on it. */
  qaPickAt(cx: number, cy: number): { door: string | null; building: string | null; jac: boolean } {
    const rect = this.canvasEl?.getBoundingClientRect();
    const sx = cx - (rect?.left ?? 0);
    const sy = cy - (rect?.top ?? 0);
    return {
      door: this.pickBuildingDoorAtScreen(sx, sy)?.name ?? null,
      building: this.pickBuildingAtScreen(sx, sy)?.name ?? null,
      jac: this.pickJacAtScreen(sx, sy),
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

  /** Client pixels of the name-pill anchors (just above each head). */
  nameLabelAnchors(): {
    id: 'adonay' | 'pantone' | 'noah' | 'jac';
    name: string;
    x: number;
    y: number;
    visible: boolean;
    info?: boolean;
  }[] {
    const rect = this.canvasEl?.getBoundingClientRect();
    const sw = this.app?.screen.width ?? 0;
    const sh = this.app?.screen.height ?? 0;
    const aboveHead = (sprite: Sprite) => {
      const top = spriteOpaqueTopWorld(sprite);
      const s = this.worldToScreen(top.x, top.y);
      return {
        x: (rect?.left ?? 0) + s.x,
        y: (rect?.top ?? 0) + s.y - NAME_PILL_GAP_PX,
        sx: s.x,
        sy: s.y - NAME_PILL_GAP_PX,
      };
    };
    const onScreen = (sx: number, sy: number) => sx > -40 && sy > -40 && sx < sw + 40 && sy < sh + 40;
    const avatar = this.interiorActive ? this.interiorAvatar : this.avatar;
    const snap = avatar.snapshot();
    const adonay = aboveHead(avatar.adonay.sprite);
    const pantone = aboveHead(avatar.pantone.sprite);
    let pantoneY = pantone.y;
    if (Math.hypot(pantone.x - adonay.x, pantone.y - adonay.y) < 28) pantoneY -= 26;
    const nearJac =
      !!this.jac &&
      !this.jac.driving &&
      Math.hypot(this.charTx - this.jac.cx, this.charTy - this.jac.cy) < 4;
    const out: {
      id: 'adonay' | 'pantone' | 'noah' | 'jac';
      name: string;
      x: number;
      y: number;
      visible: boolean;
      info?: boolean;
    }[] = [
      {
        id: 'adonay',
        name: 'Adonay',
        x: adonay.x,
        y: nearJac ? adonay.y - 18 : adonay.y,
        visible: this.jac?.driving
          ? false
          : snap.adonay.visible && onScreen(adonay.sx, adonay.sy),
      },
      {
        id: 'pantone',
        name: 'Pantone',
        x: pantone.x,
        y: nearJac ? pantoneY - 18 : pantoneY,
        visible: snap.pantone.visible && onScreen(pantone.sx, pantone.sy) && !this.jac?.driving,
      },
    ];
    if (!this.interiorActive && this.noah) {
      const n = this.noah.snapshot();
      const head = aboveHead(this.noah.sprite);
      out.push({
        id: 'noah',
        name: 'Noah',
        x: head.x,
        y: head.y,
        visible: n.visible && n.loaded && onScreen(head.sx, head.sy),
      });
    }
    if (!this.interiorActive && this.jac && (this.jac.driving || this.jac.mode === 'parked')) {
      const roof = this.jac.labelAnchorWorld();
      const s = this.worldToScreen(roof.x, roof.y);
      const x = (rect?.left ?? 0) + s.x;
      const y = (rect?.top ?? 0) + s.y - NAME_PILL_GAP_PX;
      out.push({
        id: 'jac',
        name: 'JAC T9',
        x,
        y,
        visible: onScreen(s.x, s.y),
        info: !this.jac.driving,
      });
    }
    return out;
  }

  /** QA: opaque-top client point vs the HTML pill's bottom (gap should stay ~NAME_PILL_GAP_PX). */
  qaNamePillHeads(): { id: string; headX: number; headY: number; pillBottom: number; gap: number }[] {
    const rect = this.canvasEl?.getBoundingClientRect();
    const avatar = this.interiorActive ? this.interiorAvatar : this.avatar;
    const of = (id: string, sprite: Sprite) => {
      const top = spriteOpaqueTopWorld(sprite);
      const s = this.worldToScreen(top.x, top.y);
      return { id, headX: (rect?.left ?? 0) + s.x, headY: (rect?.top ?? 0) + s.y };
    };
    const heads = [of('adonay', avatar.adonay.sprite), of('pantone', avatar.pantone.sprite)];
    if (!this.interiorActive && this.noah) heads.push(of('noah', this.noah.sprite));
    if (!this.interiorActive && this.jac && !this.jac.driving) {
      const top = this.jac.labelAnchorWorld();
      const s = this.worldToScreen(top.x, top.y);
      heads.push({ id: 'jac', headX: (rect?.left ?? 0) + s.x, headY: (rect?.top ?? 0) + s.y });
    }
    const pills = [...document.querySelectorAll('.name-label')];
    return heads.map((h) => {
      const pill = pills.find((p) => (p as HTMLElement).dataset.id === h.id) as HTMLElement | undefined;
      const box = pill && !pill.hidden ? pill.getBoundingClientRect() : null;
      const pillBottom = box ? box.bottom : NaN;
      return { ...h, pillBottom, gap: Number.isFinite(pillBottom) ? h.headY - pillBottom : NaN };
    });
  }

  qaFill(): {
    loaded: boolean;
    report: typeof fill.report;
    actors: FillActorSnapshot[];
    objects: { id: string; key: string; tl: { x: number; y: number }; w: number; h: number; flat: boolean; zIndex: number; cells: [number, number][]; scale: number }[];
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
      const sc = objectSpriteScale(o);
      return {
        id: o.id,
        key,
        tl: objectSpriteTopLeft(o, key),
        w: a.w * sc,
        h: a.h * sc,
        flat: !!o.flat,
        zIndex: this.objectVisuals.get(o.id)?.zIndex ?? NaN,
        cells: cellsOut,
        scale: sc,
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

  qaSetAnim(dir: FacingDir, walk: boolean, frame = 0): void {
    const a = this.interiorActive ? this.interiorAvatar : this.avatar;
    a.qaSetAnim(dir, walk, frame);
    this.app?.render();
  }

  qaClearAnim(): void {
    this.avatar.qaClearAnim();
    this.interiorAvatar?.qaClearAnim();
    this.app?.render();
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
