import { Application, Container, Graphics, Point } from 'pixi.js';
import {
  cells,
  getBuildingAt,
  getBuildingAtDoor,
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
import { parseCameraFromHash, writeCameraToHash } from '../camera/hash';
import { isTouchPrimary, type ChecklistStepId } from '../checklist/storage';
import { sortKey, tileFootWorld, tileToWorld, worldToTile } from '../iso/math';
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
  drawBench,
  drawBorderTile,
  drawCharacter,
  drawDiamond,
  drawFootprintBuilding,
  drawLamp,
  drawMuro,
  drawObelisco,
  drawPropDesk,
  drawPropTree,
  drawRedoma,
  treeCanopyTrunkOverlap,
  type FootprintDrawSpec,
} from './draw';
import {
  cameraFromPinchSession,
  clampPanMapFullyInView,
  clampZoom,
  isMapFullyVisibleOnScreen,
  mapVisibleFractions,
  setCameraFitMargins,
  setCameraViewportSize,
  stabilizeCameraAfterGesture,
  viewportMapCoverage,
  zoomMinForViewport,
  zoomAtScreenAnchor,
} from './cameraControl';

export type BuildingPanelBridge = {
  isOpen: () => boolean;
  openTitle: () => string;
  dismiss: () => void;
};

export type SceneEvents = {
  onChecklist: (step: ChecklistStepId) => void;
  onEnterBuilding: (title: string) => void;
  onUnreachable?: () => void;
  buildingPanel?: BuildingPanelBridge;
};

export class IsoScene {
  app!: Application;
  world = new Container();
  camera = new Container();
  tilesLayer = new Container();
  objectsLayer = new Container();
  pathLayer = new Container();
  characterLayer = new Container();
  highlightLayer = new Container();

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
  private objectGraphics = new Map<string, Graphics>();
  private lastPanPos: { x: number; y: number } | null = null;
  private tapStart: { x: number; y: number; t: number } | null = null;
  private lastTapTime = 0;
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
  private tileCullEntries: { g: Graphics; tx: number; ty: number }[] = [];
  private pointerGestureSerial = 0;
  private pixiTapGestureSerial = -1;
  private firstPointerDownAt = 0;
  private secondFingerArrived = false;
  private deferredTapTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingViewportApply = false;
  /** Last map tap in canvas pixels — used to re-resolve door intent for walk targets. */
  private lastMapTapScreen: { x: number; y: number } | null = null;
  constructor(events: SceneEvents) {
    this.events = events;
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvasEl = canvas;
    this.app = new Application();
    await this.app.init({
      canvas,
      background: C.bg,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: window,
    });

    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.world);
    this.world.addChild(this.tilesLayer);
    this.world.addChild(this.pathLayer);
    this.world.addChild(this.objectsLayer);
    this.world.addChild(this.highlightLayer);
    this.world.addChild(this.characterLayer);

    this.pathLayer.addChild(this.pathGfx);
    this.characterLayer.addChild(this.charGfx);

    this.buildTiles();
    this.buildVoidClickLayer();
    this.buildObjects();
    this.syncCharacterGraphic();
    this.syncRoundedTileFromCharacter();

    const fromHash = parseCameraFromHash();
    if (fromHash) {
      this.cameraX = fromHash.x;
      this.cameraY = fromHash.y;
      this.zoom = clampZoom(fromHash.zoom);
    } else if (this.shouldUseMobileFraming()) {
      this.frameMobileDefaultView();
    } else {
      this.centerOnCharacter(false);
    }
    this.applyCamera(true);
    this.lastChecklistZoom = this.zoom;

    this.bindInput();
    this.app.ticker.add(() => this.update());
    window.addEventListener('resize', () => this.onWindowViewportChange());
    window.visualViewport?.addEventListener('resize', () => this.onWindowViewportChange());
    window.visualViewport?.addEventListener('scroll', () => {
      window.scrollTo(0, 0);
    });
    window.addEventListener('hashchange', () => {
      const v = parseCameraFromHash();
      if (v) {
        this.cameraX = v.x;
        this.cameraY = v.y;
        this.zoom = clampZoom(v.zoom);
        this.applyCamera(false);
        this.rebaselineChecklistFromCamera();
      }
    });
  }

  /** After programmatic #view hash updates, do not treat the next gesture as user zoom/pan. */
  private rebaselineChecklistFromCamera(): void {
    this.lastChecklistZoom = this.zoom;
    this.zoomChanged = false;
    this.panDragScreenPx = 0;
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
      const pos = e.getLocalPosition(this.world);
      const tile = worldToTile(pos.x, pos.y);
      if (!tile) {
        this.events.onUnreachable?.();
        return;
      }
      if (!this.prepareMapTap(undefined, tile.x, tile.y)) return;
      const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
      this.requestWalk(tile.x, tile.y, sprint);
    });
    this.world.addChildAt(g, 0);
  }

  private buildTiles(): void {
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const cell = cells[ty][tx];
        const pos = tileFootWorld(tx, ty);
        const g = new Graphics();
        const isFrame = cell.groundId.includes('borde');
        g.position.set(pos.x, pos.y);
        if (isFrame) {
          drawBorderTile(g, cell.groundId);
        } else {
          const isBuildingDoorTile = !!getBuildingAtDoor(tx, ty);
          const fill = isBuildingDoorTile
            ? C.tileLight
            : cell.groundId.includes('path')
            ? C.tileMid
            : cell.groundId.includes('park')
              ? 0xd0d4cc
              : cell.groundId.includes('footprint') || cell.groundId.includes('building')
                ? C.tileDark
                : C.tileLight;
          drawDiamond(g, fill);
        }
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

  private buildObjects(): void {
    const sorted = [...objects].sort((a, b) => sortKey(a.x, a.y) - sortKey(b.x, b.y));
    for (const obj of sorted) {
      const pos = tileFootWorld(obj.x, obj.y);
      const g = new Graphics();
      g.position.set(pos.x, pos.y);
      g.eventMode = 'static';
      g.cursor = 'pointer';
      g.on('pointerover', () => {
        if (matchMedia('(hover: hover)').matches) {
          this.hoveredObject = obj;
          this.refreshObjectVisuals();
        }
      });
      g.on('pointerout', () => {
        if (this.hoveredObject?.id === obj.id) {
          this.hoveredObject = null;
          this.refreshObjectVisuals();
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
    this.refreshObjectVisuals();
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

  private refreshObjectVisuals(): void {
    for (const obj of objects) {
      const g = this.objectGraphics.get(obj.id);
      if (!g) continue;
      g.clear();
      const hover = this.hoveredObject?.id === obj.id;
      if (obj.name === 'escritorio') drawPropDesk(g, hover);
      else if (obj.name === 'arbol' || obj.name === 'tree') drawPropTree(g, hover);
      else if (obj.name === 'bench') drawBench(g, hover);
      else if (obj.name === 'lamp') drawLamp(g, hover);
      else if (obj.name === 'obelisco')
        drawObelisco(g, hover, obj.footprintX, obj.footprintY, obj.w, obj.h, obj.x, obj.y);
      else if (obj.name === 'redoma')
        drawRedoma(g, hover, obj.footprintX, obj.footprintY, obj.w, obj.h, obj.x, obj.y);
      else if (obj.name === 'muro')
        drawMuro(g, hover, obj.footprintX, obj.footprintY, obj.w, obj.h, obj.x, obj.y);
      else if (obj.type === 'building') {
        const spec: FootprintDrawSpec = {
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
        drawFootprintBuilding(g, hover, spec);
      }
    }
  }

  requestWalk(
    tx: number,
    ty: number,
    sprint: boolean,
    opts?: { buildingEntry?: { panelTitle: string; door: { x: number; y: number } } },
  ): void {
    let walkTx = tx;
    let walkTy = ty;
    let entry = opts?.buildingEntry;
    if (!entry && this.lastMapTapScreen) {
      const doorBuilding = this.pickBuildingDoorAtScreen(
        this.lastMapTapScreen.x,
        this.lastMapTapScreen.y,
      );
      if (doorBuilding?.door && doorBuilding.panelTitle) {
        walkTx = doorBuilding.door.x;
        walkTy = doorBuilding.door.y;
        entry = { panelTitle: doorBuilding.panelTitle, door: doorBuilding.door };
      }
    }
    const from = { x: Math.round(this.charTx), y: Math.round(this.charTy) };
    this.pendingBuildingEntry = entry ?? resolveBuildingEntryFromTile(walkTx, walkTy, from);
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
      this.clearWalkPreview();
      if (this.canvasEl) this.canvasEl.dataset.walkGoal = '';
      this.events.onUnreachable?.();
      return;
    }
    const sx = Math.round(this.charTx);
    const sy = Math.round(this.charTy);
    const result = findPathOrNearest(sx, sy, tx, ty);
    if (!result) {
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
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
      this.tryCompletePendingBuildingEntry();
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
    this.clearWalkPreview();
    const ctx = Math.round(this.charTx);
    const cty = Math.round(this.charTy);
    if (getBuildingAtDoor(ctx, cty)) {
      this.doorCooldown = 200;
    }
    return true;
  }

  private handleScreenTap(sx: number, sy: number, sprint: boolean): void {
    this.lastMapTapScreen = { x: sx, y: sy };
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
      if (!this.prepareMapTap(undefined, tile.x, tile.y)) return;
      this.requestWalk(tile.x, tile.y, sprint);
    } else this.events.onUnreachable?.();
  }

  private drawPathPreview(): void {
    this.pathGfx.clear();
    if (this.path.length === 0) return;
    if (this.events.buildingPanel?.isOpen()) return;
    const points = [{ x: this.charTx, y: this.charTy }, ...this.path];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
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
    this.charGfx.zIndex = sortKey(this.charTx, this.charTy, 500);
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
    const right = 16;
    const bottom = 16;
    const checklist = document.querySelector('.checklist');
    if (checklist && !checklist.classList.contains('checklist--collapsed')) {
      const box = checklist.getBoundingClientRect();
      if (box.width > 40 && box.height > 40) {
        const sidebarObstruction =
          sw > 900 && (box.bottom > sh * 0.5 || box.height > sh * 0.42);
        if (sidebarObstruction) {
          left = Math.max(left, Math.ceil(box.right + 10));
        } else {
          top = Math.max(top, Math.ceil(box.bottom + 10));
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
    this.zoom = clampZoom(this.zoom, sw, sh);
    const hardened = stabilizeCameraAfterGesture(
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
      writeCameraToHash({ x: this.cameraX, y: this.cameraY, zoom: this.zoom });
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
    for (const { g, tx, ty } of this.tileCullEntries) {
      const foot = tileFootWorld(tx, ty);
      g.visible =
        foot.x >= minX - TILE_W &&
        foot.x <= maxX + TILE_W &&
        foot.y >= minY - TILE_H &&
        foot.y <= maxY + TILE_H;
    }
    for (const obj of objects) {
      const g = this.objectGraphics.get(obj.id);
      if (!g) continue;
      const foot = tileFootWorld(obj.x, obj.y);
      g.visible =
        foot.x >= minX - TILE_W * 3 &&
        foot.x <= maxX + TILE_W * 3 &&
        foot.y >= minY - TILE_H * 6 &&
        foot.y <= maxY + TILE_H * 2;
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

  /** Frame character (8,8) and building caso-1 (3,4) on narrow viewports. */
  private frameMobileDefaultView(): void {
    const char = tileToWorld(this.charTx, this.charTy);
    const building = tileToWorld(39, 35);
    const minX = Math.min(char.x, building.x) - TILE_W;
    const maxX = Math.max(char.x, building.x) + TILE_W;
    const minY = Math.min(char.y, building.y) - TILE_H * 4;
    const maxY = Math.max(char.y, building.y) + TILE_H * 2;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    const padding = 1.12;
    const zoomX = sw / (worldW * padding);
    const zoomY = sh / (worldH * padding);
    this.zoom = clampZoom(Math.min(zoomX, zoomY) * 0.92, sw, sh);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.cameraX = -cx;
    this.cameraY = -cy + 24;
    const hardened = stabilizeCameraAfterGesture(
      { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
      sw,
      sh,
    );
    this.cameraX = hardened.cameraX;
    this.cameraY = hardened.cameraY;
    this.zoom = hardened.zoom;
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
    this.path = [];
    this.pendingBuildingEntry = null;
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
    this.path = [];
    this.drawPathPreview();
    this.pendingBuildingEntry = null;
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
    this.path = [];
    this.drawPathPreview();
    this.pendingBuildingEntry = null;
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

  private tryScheduleDeferredTap(e: PointerEvent): void {
    this.clearDeferredTap();
    if (!this.tapStart) return;
    if (this.pixiTapGestureSerial === this.pointerGestureSerial) return;
    if (e.pointerType !== 'touch') return;

    const hadMulti = this.hadMultiPointerGesture;
    const hadSecond = this.secondFingerArrived;
    if (hadMulti || hadSecond || this.panMoved) return;

    const dist = Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y);
    if (dist >= 10) return;

    const fire = () => {
      this.deferredTapTimer = null;
      if (this.pointers.size > 0) return;
      if (performance.now() < this.suppressTapUntil) return;
      if (!this.tapStart) return;
      const now = performance.now();
      const dt = now - this.tapStart.t;
      if (dt > 450) return;
      const canvas = this.canvasEl;
      if (!canvas) return;
      const nowDist = Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y);
      if (nowDist >= 10) return;
      const double = now - this.lastTapTime < 320;
      this.lastTapTime = now;
      const rect = canvas.getBoundingClientRect();
      this.handleScreenTap(e.clientX - rect.left, e.clientY - rect.top, double);
    };

    const waitMs = Math.max(0, this.firstPointerDownAt + 120 - performance.now());
    if (waitMs > 0) {
      this.deferredTapTimer = setTimeout(fire, waitMs);
    } else {
      fire();
    }
  }

  private applyActivePinch(mid: { x: number; y: number }, dist: number): void {
    if (this.zoomSource !== 'pointer' || !this.pinchSession) return;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const zMin = zoomMinForViewport(sw, sh);
    if (this.zoom <= zMin + 0.0005) {
      const stable = stabilizeCameraAfterGesture(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = stable.cameraX;
      this.cameraY = stable.cameraY;
      this.zoom = stable.zoom;
      this.pinchSession = {
        ...this.pinchSession,
        startCamX: this.cameraX,
        startCamY: this.cameraY,
        startMid: mid,
      };
    }
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
            this.openDoorIfOnTile(tileAfter.x, tileAfter.y);
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
          this.tryCompletePendingBuildingEntry();
        }
      } else {
        this.charTx += (dx / dist) * speed;
        this.charTy += (dy / dist) * speed;
        this.charState = this.sprint ? 'sprint' : 'walk';
      }
      this.syncCharacterGraphic();
    }
  }

  private doorCooldown = 0;

  private roundedCharTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
  }

  private syncRoundedTileFromCharacter(): void {
    this.lastRoundedTile = this.roundedCharTile();
  }

  private openDoorIfOnTile(tx: number, ty: number): void {
    if (this.doorCooldown > 0) return;
    const building = getBuildingAtDoor(tx, ty);
    if (!building?.panelTitle) return;
    this.doorCooldown = 120;
    this.pendingBuildingEntry = null;
    this.events.onEnterBuilding(building.panelTitle);
    this.events.onChecklist('enter-building');
  }

  /** Mouse/tap path end: only when this walk was started from a building click. */
  private tryCompletePendingBuildingEntry(): void {
    if (this.doorCooldown > 0 || !this.pendingBuildingEntry) return;
    const tx = Math.round(this.charTx);
    const ty = Math.round(this.charTy);
    const d = this.pendingBuildingEntry.door;
    if (tx !== d.x || ty !== d.y) {
      this.pendingBuildingEntry = null;
      return;
    }
    const building = objects.find((o) => o.panelTitle === this.pendingBuildingEntry!.panelTitle);
    this.pendingBuildingEntry = null;
    if (!building?.panelTitle) return;
    this.doorCooldown = 120;
    this.events.onEnterBuilding(building.panelTitle);
    this.events.onChecklist('enter-building');
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
  }

  /** QA: synthetic map tap (scenery / ground) matching player pointer routing. */
  tapMapTileForQa(tx: number, ty: number): void {
    const foot = tileFootWorld(tx, ty);
    const scr = this.worldToScreen(foot.x, foot.y);
    this.handleScreenTap(scr.x, scr.y, false);
  }
}
