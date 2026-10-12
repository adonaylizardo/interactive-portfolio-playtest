import { Application, Container, Graphics, Point, Polygon, Rectangle, Sprite } from 'pixi.js';
import {
  cells,
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
import { mapWorldBounds, sortKey, tileFootWorld, tileToWorld, worldToTile } from '../iso/math';
import { findPathOrNearest } from '../iso/pathfinding';
import { C } from './colors';
import {
  buildingDoorOpeningPickHit,
  buildingDoorPickHit,
  buildingFootprintBodyPickHit,
  doorTapLocalPoint,
  buildingFrontWallsCover,
  buildingInteriorGapSample,
  buildingPickHit,
  deskTopFillColor,
  drawCharacter,
  treeCanopyTrunkOverlap,
  type FootprintDrawSpec,
} from './draw';
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
  isSpriteInterior,
  loadInteriorSprite,
  loadMapSprites,
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
  interiorPickTile,
  interiorPixelProbes,
  syncInteriorCharacter,
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
} from './cameraControl';

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
const DESKTOP_DEFAULT_VIEW = { x: 0, y: 0, zoom: 0.15 };

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

  hoveredObject: MapObject | null = null;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  private pathGfx = new Graphics();
  private charGfx = new Graphics();
  private events: SceneEvents;
  private objectGraphics = new Map<string, Container>();
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
  private lastRoundedTile = { x: INICIO[0], y: INICIO[1] };
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
  private interiorCharGfx = new Graphics();
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
    for (const id of ['volaris', 'bain', 'mentoria', 'finoa', 'pg']) void loadInteriorSprite(id);

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
    this.interiorLayer.addChild(this.interiorCharGfx);
    this.bindInteriorPointerRouting();

    this.pathLayer.addChild(this.pathGfx);
    this.objectsLayer.sortableChildren = true;
    this.objectsLayer.addChild(this.charGfx);

    this.fadeEl = document.createElement('div');
    this.fadeEl.className = 'scene-fade';
    document.getElementById('app')?.appendChild(this.fadeEl);

    this.buildTiles();
    this.buildVoidClickLayer();
    this.buildObjects();
    this.syncCharacterGraphic();
    this.syncRoundedTileFromCharacter();

    const bootInteriorId = parseInteriorFromHash();
    const fromHash = parseCameraFromHash();
    if (fromHash) {
      this.cameraX = fromHash.x;
      this.cameraY = fromHash.y;
      this.zoom = clampZoom(fromHash.zoom);
    } else if (this.shouldUseMobileFraming()) {
      this.frameMobileFirstLoadView();
    } else {
      this.cameraX = DESKTOP_DEFAULT_VIEW.x;
      this.cameraY = DESKTOP_DEFAULT_VIEW.y;
      this.zoom = clampZoom(DESKTOP_DEFAULT_VIEW.zoom);
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
    const spec = this.footprintSpec(obj);
    return {
      contains: (x: number, y: number) => {
        const local = { x, y };
        return (
          buildingDoorPickHit(local, spec) ||
          buildingFootprintBodyPickHit(local, spec) ||
          buildingPickHit(local, spec)
        );
      },
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
        g.hitArea =
          obj.type === 'building'
            ? this.buildingHitArea(obj)
            : new Rectangle(
                tlw.x + a.bbox.x0 - pos.x,
                tlw.y + a.bbox.y0 - pos.y,
                a.bbox.x1 - a.bbox.x0,
                a.bbox.y1 - a.bbox.y0,
              );
        const flat = obj.name === 'redoma';
        const zIndex = flat ? -10 : objectDepth(obj) + (obj.x - obj.y) * 0.0001;
        g.zIndex = zIndex;
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
        if (obj.name === 'obelisco' || obj.name === 'redoma' || obj.name === 'muro') {
          const pos = e.getLocalPosition(this.world);
          const tile = worldToTile(pos.x, pos.y);
          const gx = tile?.x ?? obj.x;
          const gy = tile?.y ?? obj.y;
          this.requestWalk(gx, gy, sprint);
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

  /** Applies the zoom variant (cerca / lejos) and building states to every object sprite. */
  private syncObjectSprites(force = false): void {
    const lejos = isLejosZoom(this.zoom);
    const lodChanged = lejos !== this.lodLejos;
    this.lodLejos = lejos;
    for (const v of this.objectVisuals.values()) {
      const state = v.obj.type === 'building' ? this.buildingSpriteState(v.obj) : 'default';
      if (!force && !lodChanged && state === v.state) continue;
      const key = objectSpriteKey(v.obj, state, lejos);
      if (!key) continue;
      v.state = state;
      v.key = key;
      v.sprite.texture = spriteTexture(key);
    }
    if (this.interiorSprite && this.interiorDef?.sprite) {
      const key = interiorSpriteKey(this.interiorDef.id, lejos);
      if (spritesLoaded(key)) this.interiorSprite.texture = spriteTexture(key);
    }
    if (this.canvasEl) this.canvasEl.dataset.lod = lejos ? 'lejos' : 'cerca';
  }

  /** Player draws in front of everything except objects it stands behind (front-row ordering). */
  private syncCharacterDepth(): void {
    let zi = Infinity;
    for (const v of this.objectVisuals.values()) {
      if (!v.occluder || v.zIndex >= zi) continue;
      if (playerBehind(v.occluder, this.charTx, this.charTy)) zi = v.zIndex;
    }
    this.charGfx.zIndex = Number.isFinite(zi) ? zi - 0.5 : 1_000_000;
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
    this.events.onChecklist('walk-around');
    this.drawPathPreview();
    if (this.path.length === 0) {
      this.charState = 'idle';
      this.sprint = false;
      this.syncCharacterGraphic();
      const rtx = Math.round(this.charTx);
      const rty = Math.round(this.charTy);
      this.lastRoundedTile = { x: rtx, y: rty };
      this.tryArriveAtDoorTile(rtx, rty);
    }
  }

  private footprintSpec(obj: MapObject): FootprintDrawSpec {
    return {
      fx: obj.footprintX ?? obj.x,
      fy: obj.footprintY ?? obj.y,
      w: obj.w ?? 3,
      h: obj.h ?? 3,
      ax: obj.x,
      ay: obj.y,
      doorFace: obj.doorFace ?? '+y',
      door: obj.door ?? { x: obj.x, y: obj.y + 1 },
      kind: obj.name,
    };
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
      const spec = this.footprintSpec(obj);
      const foot = tileFootWorld(obj.x, obj.y);
      const local = { x: wx - foot.x, y: wy - foot.y };
      if (!buildingDoorOpeningPickHit(local, spec) && !buildingDoorPickHit(local, spec)) {
        continue;
      }
      const tap = doorTapLocalPoint(spec);
      const dist = Math.hypot(local.x - tap.x, local.y - tap.y);
      const depth = sortKey(obj.x, obj.y);
      if (!best || dist < best.dist - 0.5 || (Math.abs(dist - best.dist) < 0.5 && depth > best.depth)) {
        best = { obj, dist, depth };
      }
    }
    return best?.obj;
  }

  private pickSceneryAtScreen(sx: number, sy: number): { tx: number; ty: number } | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const tile = worldToTile(wx, wy);
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
        const t = worldToTile(wx, wy);
        return t ? { tx: t.x, ty: t.y } : { tx: obj.x, ty: obj.y };
      }
    }
    return undefined;
  }

  private pickBuildingAtScreen(sx: number, sy: number): MapObject | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const buildings = objects
      .filter((o) => o.type === 'building')
      .sort((a, b) => sortKey(b.x, b.y) - sortKey(a.x, a.y));
    const fatFinger = this.zoom <= 0.11;
    for (const obj of buildings) {
      const foot = tileFootWorld(obj.x, obj.y);
      const local = { x: wx - foot.x, y: wy - foot.y };
      const spec = this.footprintSpec(obj);
      if (buildingDoorPickHit(local, spec)) return obj;
      if (fatFinger && buildingFootprintBodyPickHit(local, spec)) return obj;
      if (buildingPickHit(local, spec)) return obj;
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
        this.walkToInteriorExit(sprint);
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
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const tile = worldToTile(wx, wy);
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
    this.charGfx.clear();
    drawCharacter(this.charGfx, this.charState);
    const pos = tileFootWorld(this.charTx, this.charTy);
    this.charGfx.position.set(pos.x, pos.y);
    this.syncCharacterDepth();
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
    this.charGfx.visible = !iso;
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
    const expected = this.worldToScreen(foot.x, foot.y);
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
    const sample = buildingInteriorGapSample();
    const covered = buildingFrontWallsCover(sample);
    this.canvasEl.dataset.buildingInteriorWallCover = covered ? '1' : '0';
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

  private setZoom(next: number, anchorScreen?: { x: number; y: number }): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
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

  private shouldBlockTap(): boolean {
    return (
      this.interiorActive ||
      this.panMoved ||
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
    if (next) this.applyPinchCamera(next);
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

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
      if (e.key === 'Shift') this.shiftHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key === 'Shift') this.shiftHeld = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.pinchGestureActive || this.zoomSource === 'pointer' || this.zoomSource === 'gesture') {
          return;
        }
        this.zoomSource = 'wheel';
        let dy = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 24;
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= 480;
        const factor = e.ctrlKey ? 0.004 : 0.002;
        const delta = -dy * factor;
        this.setZoom(this.zoom * (1 + delta), { x: e.clientX, y: e.clientY });
        this.zoomSource = 'none';
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
        if (totalFromTap > panThreshold) {
          this.panMoved = true;
          document.body.classList.add('is-canvas-dragging');
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
    this.syncObjectSprites();
    if (this.doorCooldown > 0) {
      this.doorCooldown -= this.app.ticker.deltaMS;
    }
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
          const speed = (sprint ? 0.12 : 0.07) * (this.app.ticker.deltaMS / 16);
          const ntx = this.interiorCharTx + dx * speed;
          const nty = this.interiorCharTy + dy * speed;
          const tx = Math.round(ntx);
          const ty = Math.round(nty);
          if (this.interiorGrid[ty]?.[tx]?.walkable) {
            this.interiorCharTx = ntx;
            this.interiorCharTy = nty;
          }
          syncInteriorCharacter(
            this.interiorCharGfx,
            this.interiorCharTx,
            this.interiorCharTy,
            this.charState,
          );
          const rt = { x: Math.round(this.interiorCharTx), y: Math.round(this.interiorCharTy) };
          if (
            rt.x === this.interiorDef.exit.x &&
            rt.y === this.interiorDef.exit.y
          ) {
            this.exitInterior();
          }
        }
        return;
      }
      if (dx !== 0 || dy !== 0) {
        this.path = [];
        this.drawPathPreview();
        const sprint = this.shiftHeld;
        this.sprint = sprint;
        this.charState = sprint ? 'sprint' : 'walk';
        const speed = (sprint ? 0.12 : 0.07) * (this.app.ticker.deltaMS / 16);
        const tileBefore = this.roundedCharTile();
        const ntx = this.charTx + dx * speed;
        const nty = this.charTy + dy * speed;
        const tx = Math.round(ntx);
        const ty = Math.round(nty);
        if (cells[ty]?.[tx]?.walkable) {
          this.charTx = ntx;
          this.charTy = nty;
        }
        const tileAfter = this.roundedCharTile();
        if (tileBefore.x !== tileAfter.x || tileBefore.y !== tileAfter.y) {
          this.events.onChecklist('walk-keys');
          if (
            tileAfter.x !== this.lastRoundedTile.x ||
            tileAfter.y !== this.lastRoundedTile.y
          ) {
            this.lastRoundedTile = { x: tileAfter.x, y: tileAfter.y };
            this.tryArriveAtDoorTile(tileAfter.x, tileAfter.y);
          }
        }
        this.syncCharacterGraphic();
      } else if (this.path.length === 0) {
        this.charState = 'idle';
        this.syncCharacterGraphic();
      }
    }

    if (this.path.length > 0) {
      const target = this.path[0];
      const speed = (this.sprint ? 0.14 : 0.08) * (this.app.ticker.deltaMS / 16);
      const dx = target.x - this.charTx;
      const dy = target.y - this.charTy;
      const dist = Math.hypot(dx, dy);
      if (dist < speed) {
        this.charTx = target.x;
        this.charTy = target.y;
        this.path.shift();
        this.drawPathPreview();
        const tx = Math.round(this.charTx);
        const ty = Math.round(this.charTy);
        this.lastRoundedTile = { x: tx, y: ty };
        if (this.path.length === 0) {
          this.charState = 'idle';
          this.sprint = false;
          this.tryArriveAtDoorTile(tx, ty);
        }
      } else {
        this.charTx += (dx / dist) * speed;
        this.charTy += (dy / dist) * speed;
        this.charState = this.sprint ? 'sprint' : 'walk';
      }
      this.syncCharacterGraphic();
    }

    if (this.interiorActive && this.interiorPath.length > 0) {
      this.updateInteriorWalk();
    }
  }

  private doorCooldown = 0;

  private roundedCharTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
  }

  private syncRoundedTileFromCharacter(): void {
    this.lastRoundedTile = this.roundedCharTile();
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
    this.pendingBuildingEntry = null;

    this.doorCooldown = 120;
    this.mapReturnDoor = { x: building.door.x, y: building.door.y };
    this.charTx = tx;
    this.charTy = ty;
    this.syncRoundedTileFromCharacter();
    this.syncCharacterGraphic();
    this.events.onEnterBuilding(building.name, building.panelTitle);
    this.events.onChecklist('enter-building');
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
      this.pathLayer.visible = false;
      this.characterLayer.visible = false;
      this.interiorLayer.visible = true;
      this.interiorFloorGfx.eventMode = 'none';
      this.interiorWallGfx.eventMode = 'none';
      this.interiorPropGfx.eventMode = 'none';
      this.interiorCharGfx.eventMode = 'none';
      drawInteriorFloor(this.interiorFloorGfx, def);
      drawInteriorWalls(this.interiorWallGfx, def);
      drawInteriorProps(this.interiorPropGfx, def);
      this.interiorSprite?.destroy();
      this.interiorSprite = null;
      if (def.sprite) {
        const key = interiorSpriteKey(def.id, isLejosZoom(this.zoom));
        const sprite = new Sprite(spriteTexture(key));
        const tl = interiorSpriteTopLeft(def);
        sprite.position.set(tl.x, tl.y);
        sprite.zIndex = 0;
        sprite.eventMode = 'none';
        this.interiorLayer.addChild(sprite);
        this.interiorSprite = sprite;
      }
      syncInteriorCharacter(this.interiorCharGfx, this.interiorCharTx, this.interiorCharTy, 'idle');
      this.interiorCharGfx.zIndex = sortKey(this.interiorCharTx, this.interiorCharTy, 500);
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
        this.syncRoundedTileFromCharacter();
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
      this.walkToInteriorExit(sprint);
      return;
    }
    const tile = interiorPickTile(this.interiorDef, wx, wy);
    if (!tile) return;
    if (!this.interiorGrid[tile.y]?.[tile.x]?.walkable) {
      if (this.interiorDef.id === 'sambil' && tile.x >= 5) this.events.onUnreachable?.();
      return;
    }
    const sx0 = Math.round(this.interiorCharTx);
    const sy0 = Math.round(this.interiorCharTy);
    const path = findPathInterior(this.interiorGrid, sx0, sy0, tile.x, tile.y);
    if (!path) {
      this.events.onUnreachable?.();
      return;
    }
    this.interiorPath = path;
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
  }

  /** One tap on the exit mat / door gap: walk there from anywhere; the walk exits on arrival. */
  private walkToInteriorExit(sprint: boolean): void {
    const def = this.interiorDef;
    if (!def) return;
    const sx0 = Math.round(this.interiorCharTx);
    const sy0 = Math.round(this.interiorCharTy);
    const path = findPathInterior(this.interiorGrid, sx0, sy0, def.exit.x, def.exit.y);
    if (!path) {
      this.events.onUnreachable?.();
      return;
    }
    if (path.length === 0) {
      this.interiorPath = [];
      this.exitInterior({ immediate: true });
      return;
    }
    this.interiorPath = path;
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
  }

  private updateInteriorWalk(): void {
    const target = this.interiorPath[0];
    const speed = (this.sprint ? 0.14 : 0.08) * (this.app.ticker.deltaMS / 16);
    const dx = target.x - this.interiorCharTx;
    const dy = target.y - this.interiorCharTy;
    const dist = Math.hypot(dx, dy);
    if (dist < speed) {
      this.interiorCharTx = target.x;
      this.interiorCharTy = target.y;
      this.interiorPath.shift();
      if (this.interiorPath.length === 0) {
        this.charState = 'idle';
        this.sprint = false;
        const tx = Math.round(this.interiorCharTx);
        const ty = Math.round(this.interiorCharTy);
        if (
          this.interiorDef &&
          tx === this.interiorDef.exit.x &&
          ty === this.interiorDef.exit.y
        ) {
          this.exitInterior();
        }
      }
    } else {
      this.interiorCharTx += (dx / dist) * speed;
      this.interiorCharTy += (dy / dist) * speed;
      this.charState = this.sprint ? 'sprint' : 'walk';
    }
    syncInteriorCharacter(
      this.interiorCharGfx,
      this.interiorCharTx,
      this.interiorCharTy,
      this.charState,
    );
  }

  /** For QA — programmatic walk */
  getCharacterTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
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
    if (!obj?.door || !this.canvasEl) return null;
    const spec: FootprintDrawSpec = {
      fx: obj.footprintX ?? obj.x,
      fy: obj.footprintY ?? obj.y,
      w: obj.w ?? 3,
      h: obj.h ?? 3,
      ax: obj.x,
      ay: obj.y,
      doorFace: obj.doorFace ?? '+y',
      door: obj.door,
      kind: obj.name,
    };
    const foot = tileFootWorld(obj.x, obj.y);
    const tap = doorTapLocalPoint(spec);
    const wx = foot.x + tap.x;
    const wy = foot.y + tap.y;
    const screen = this.worldToScreen(wx, wy);
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
    this.syncRoundedTileFromCharacter();
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
    const foot = tileFootWorld(tx, ty);
    const scr = this.worldToScreen(foot.x, foot.y);
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
    return interiorPixelProbes(this.interiorDef, isLejosZoom(this.zoom)).map((p) => {
      const s = this.worldToScreen(p.world.x, p.world.y);
      return { label: p.label, x: rect.left + s.x, y: rect.top + s.y, expect: p.expect };
    });
  }

  getInteriorLayoutForQa(): {
    w: number;
    h: number;
    exit: { x: number; y: number };
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
    return { w: def.w, h: def.h, exit: def.exit, walkable };
  }

  getInteriorCharTile(): { x: number; y: number } | null {
    if (!this.interiorActive) return null;
    return { x: Math.round(this.interiorCharTx), y: Math.round(this.interiorCharTy) };
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
  }[] {
    const out: { id: string; key: string; tl: { x: number; y: number }; w: number; h: number; kind: string }[] = [];
    for (const v of this.objectVisuals.values()) {
      const key = objectSpriteKey(v.obj, 'default', false)!;
      const tl = objectSpriteTopLeft(v.obj, key);
      const a = spriteAsset(key);
      out.push({ id: v.obj.id, key, tl, w: a.w, h: a.h, kind: v.obj.name });
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
  qaForceBuildingState(state: BuildingSpriteState | null): void {
    this.qaForcedState = state;
    this.syncObjectSprites(true);
    this.app.render();
  }

  /** QA: put a world point at the canvas centre at an exact zoom. */
  qaFrameWorld(wx: number, wy: number, zoom: number): void {
    this.zoom = zoom;
    this.cameraX = -wx;
    this.cameraY = -wy;
    this.applyCamera(false);
    this.app.render();
  }

  qaWorldToClient(wx: number, wy: number): { x: number; y: number } {
    const rect = this.canvasEl?.getBoundingClientRect();
    const s = this.worldToScreen(wx, wy);
    return { x: (rect?.left ?? 0) + s.x, y: (rect?.top ?? 0) + s.y };
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
