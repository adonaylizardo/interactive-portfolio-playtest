import { Application, Container, Graphics, Point } from 'pixi.js';
import {
  cells,
  getBuildingAt,
  getBuildingAtDoor,
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
import { buildingPickHit } from './draw';
import {
  cameraFromPinchSession,
  centerMapInView,
  clampZoom,
  hardKeepMapPartiallyVisible,
  mapVisibleFractions,
  softClampMapInView,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAtScreenAnchor,
} from './cameraControl';
import {
  buildingFrontWallsCover,
  buildingInteriorGapSample,
  deskTopFillColor,
  drawBuilding,
  drawCharacter,
  drawDiamond,
  drawPropDesk,
  drawPropTree,
  treeCanopyTrunkOverlap,
} from './draw';

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

  charTx = 8;
  charTy = 8;
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
  private cameraPanned = false;
  private zoomChanged = false;
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
  private lastRoundedTile = { x: 8, y: 8 };
  private pointerGestureSerial = 0;
  private pixiTapGestureSerial = -1;
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
      this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, fromHash.zoom));
    } else if (this.shouldUseMobileFraming()) {
      this.frameMobileDefaultView();
    } else {
      this.centerOnCharacter(false);
    }
    this.applyCamera(true);

    this.bindInput();
    this.app.ticker.add(() => this.update());
    window.addEventListener('resize', () => this.applyCamera());
    window.addEventListener('hashchange', () => {
      const v = parseCameraFromHash();
      if (v) {
        this.cameraX = v.x;
        this.cameraY = v.y;
        this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom));
        this.applyCamera();
      }
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
        g.position.set(pos.x, pos.y);
        const fill =
          cell.groundId.includes('path')
            ? C.tileMid
            : cell.groundId.includes('concrete')
              ? C.tileDark
              : C.tileLight;
        drawDiamond(g, fill);
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
      else if (obj.name === 'arbol') drawPropTree(g, hover);
      else drawBuilding(g, hover);
    }
  }

  requestWalk(
    tx: number,
    ty: number,
    sprint: boolean,
    opts?: { buildingEntry?: { panelTitle: string; door: { x: number; y: number } } },
  ): void {
    const from = { x: Math.round(this.charTx), y: Math.round(this.charTy) };
    this.pendingBuildingEntry =
      opts?.buildingEntry ?? resolveBuildingEntryFromTile(tx, ty, from);
    const target = resolveWalkTarget(tx, ty);
    this.walkToTile(target.x, target.y, sprint);
  }

  clearWalkPreview(): void {
    this.path = [];
    this.drawPathPreview();
  }

  walkToTile(tx: number, ty: number, sprint: boolean): void {
    if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
    }
    if (!cells[ty][tx].walkable) {
      this.clearWalkPreview();
      this.events.onUnreachable?.();
      return;
    }
    const sx = Math.round(this.charTx);
    const sy = Math.round(this.charTy);
    const result = findPathOrNearest(sx, sy, tx, ty);
    if (!result?.direct) {
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

  private pickBuildingAtScreen(sx: number, sy: number): MapObject | undefined {
    const { x: wx, y: wy } = this.screenToWorld(sx, sy);
    const buildings = objects
      .filter((o) => o.type === 'building')
      .sort((a, b) => sortKey(b.x, b.y) - sortKey(a.x, a.y));
    for (const obj of buildings) {
      const foot = tileFootWorld(obj.x, obj.y);
      const local = { x: wx - foot.x, y: wy - foot.y };
      if (buildingPickHit(local)) return obj;
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

  applyCamera(persistHash = true): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.zoom = clampZoom(this.zoom);
    if (this.gestureActive) {
      const hardened = hardKeepMapPartiallyVisible(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = hardened.cameraX;
      this.cameraY = hardened.cameraY;
      this.zoom = hardened.zoom;
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
      this.canvasEl.dataset.camX = String(this.cameraX);
      this.canvasEl.dataset.camY = String(this.cameraY);
      this.canvasEl.dataset.zoom = String(this.zoom);
      this.canvasEl.dataset.camPx = String(sw / 2 + this.world.position.x);
      this.canvasEl.dataset.camPy = String(sh / 2 + this.world.position.y);
      this.canvasEl.dataset.mapFracW = String(vis.fracW);
      this.canvasEl.dataset.mapFracH = String(vis.fracH);
      this.canvasEl.dataset.mapIntersects = vis.intersects ? '1' : '0';
      this.canvasEl.dataset.pinchFrame = String(this.pinchFrameSerial);
      this.canvasEl.dataset.zoomSource = this.zoomSource;
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
    if (!this.gestureActive && this.zoom <= ZOOM_MIN + 0.02) {
      const centered = centerMapInView(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = centered.cameraX;
      this.cameraY = centered.cameraY;
      this.world.position.set(this.cameraX * this.zoom, this.cameraY * this.zoom);
      if (this.canvasEl) {
        this.canvasEl.dataset.camPx = String(sw / 2 + this.world.position.x);
        this.canvasEl.dataset.camPy = String(sh / 2 + this.world.position.y);
      }
    }

    if (this.zoomChanged) {
      this.events.onChecklist('zoom');
      this.zoomChanged = false;
    }
    if (this.cameraPanned) {
      this.events.onChecklist('move-camera');
      this.cameraPanned = false;
    }
  }

  /** QA: tile vs building foot global positions must match at every zoom. */
  private updateFootAnchorProbe(): void {
    if (!this.canvasEl) return;
    const tileIdx = 4 * MAP_WIDTH + 3;
    const tileG = this.tilesLayer.children[tileIdx] as Container | undefined;
    const buildG = this.objectGraphics.get('building/caso-1/default');
    if (!tileG || !buildG) return;
    const foot = tileFootWorld(3, 4);
    const expected = this.worldToScreen(foot.x, foot.y);
    const tileGlobal = tileG.getGlobalPosition(new Point());
    const buildGlobal = buildG.getGlobalPosition(new Point());
    const driftTileBuild = Math.hypot(tileGlobal.x - buildGlobal.x, tileGlobal.y - buildGlobal.y);
    const driftTileFormula = Math.hypot(tileGlobal.x - expected.x, tileGlobal.y - expected.y);
    this.canvasEl.dataset.footDriftPx = String(Math.max(driftTileBuild, driftTileFormula));
  }

  /** QA: local bounds of caso-1 must not change with zoom (no LOD geometry swap). */
  private updateBuildingSilhouetteProbe(): void {
    if (!this.canvasEl) return;
    const buildG = this.objectGraphics.get('building/caso-1/default');
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
    const building = tileToWorld(3, 4);
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
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(zoomX, zoomY) * 0.92));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.cameraX = -cx;
    this.cameraY = -cy + 24;
    const hardened = hardKeepMapPartiallyVisible(
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
      this.zoom = clampZoom(next);
    }
    if (Math.abs(this.zoom - ZOOM_MIN) < 0.001) {
      const centered = centerMapInView(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = centered.cameraX;
      this.cameraY = centered.cameraY;
      this.zoom = centered.zoom;
    } else {
      const softened = softClampMapInView(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = softened.cameraX;
      this.cameraY = softened.cameraY;
      this.zoom = softened.zoom;
    }
    this.zoomChanged = true;
    this.applyCamera();
  }

  private endZoomGesture(): void {
    this.pinchSession = null;
    this.webkitGestureSession = null;
    this.pinchGestureActive = false;
    this.gestureActive = false;
    this.zoomSource = 'none';
    this.suppressTapUntil = performance.now() + 400;
    this.panMoved = true;
    document.body.classList.remove('is-canvas-dragging');
  }

  private applyPinchCamera(next: { cameraX: number; cameraY: number; zoom: number }): void {
    this.cameraX = next.cameraX;
    this.cameraY = next.cameraY;
    this.zoom = clampZoom(next.zoom);
    this.pinchFrameSerial += 1;
    this.zoomChanged = true;
    this.cameraPanned = true;
    this.applyCamera(false);
  }

  private shouldBlockTap(): boolean {
    return (
      this.panMoved ||
      this.pinchGestureActive ||
      this.hadMultiPointerGesture ||
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

  private beginPinchAtMid(mid: { x: number; y: number }, dist: number): void {
    if (this.zoomSource === 'gesture') return;
    this.zoomSource = 'pointer';
    this.pinchGestureActive = true;
    this.gestureActive = true;
    this.hadMultiPointerGesture = true;
    this.panMoved = true;
    this.webkitGestureSession = null;
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
      next = hardKeepMapPartiallyVisible(next, sw, sh);
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

    const onTouchPinchStart = (e: TouchEvent) => {
      if (this.zoomSource === 'gesture') return;
      if (!e.touches || e.touches.length < 2) return;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      if (this.pinchGestureActive && !this.touchOnlyPinch) return;
      this.touchOnlyPinch = true;
      this.beginPinchAtMid(this.touchPairMidpoint(t0, t1), this.touchPairDistance(t0, t1));
    };

    const onTouchPinchMove = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        if (this.touchOnlyPinch && this.zoomSource === 'pointer') {
          const t0 = e.touches[0];
          const t1 = e.touches[1];
          this.applyActivePinch(this.touchPairMidpoint(t0, t1), this.touchPairDistance(t0, t1));
        }
      }
    };

    const endTouchPinch = () => {
      if (!this.touchOnlyPinch) return;
      this.touchOnlyPinch = false;
      this.endZoomGesture();
    };

    document.addEventListener('touchstart', onTouchPinchStart, { passive: false, capture: true });
    document.addEventListener('touchmove', onTouchPinchMove, { passive: false, capture: true });
    document.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length < 2) endTouchPinch();
      },
      { capture: true },
    );

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this.touchOnlyPinch = false;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.pointerGestureSerial += 1;
        this.pixiTapGestureSerial = -1;
        this.panMoved = false;
        this.hadMultiPointerGesture = false;
        this.lastPanPos = { x: e.clientX, y: e.clientY };
        this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
      if (this.pointers.size === 2 && this.zoomSource !== 'gesture') {
        const mid = this.pointerMidpoint()!;
        this.beginPinchAtMid(mid, this.pointerDistance());
      }
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
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;
        const next = cameraFromPinchSession(this.pinchSession, dist, mid, sw, sh);
        if (next) this.applyPinchCamera(next);
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
          this.cameraPanned = true;
          this.applyCamera();
        }
      }
    };

    const endPointerGesture = (e: PointerEvent) => {
      const wasPinch = this.pinchGestureActive;
      this.pointers.delete(e.pointerId);

      if (this.pointers.size === 1 && wasPinch && this.zoomSource === 'pointer') {
        const remaining = [...this.pointers.values()][0];
        this.lastPanPos = { x: remaining.x, y: remaining.y };
        this.pinchSession = null;
        this.pinchGestureActive = false;
        this.gestureActive = false;
        this.zoomSource = 'none';
        this.suppressTapUntil = performance.now() + 400;
        this.panMoved = true;
      }

      if (this.pointers.size === 0) {
        if (wasPinch || this.hadMultiPointerGesture) {
          this.suppressTapUntil = performance.now() + 400;
        }
        if (this.zoomSource === 'pointer') {
          this.endZoomGesture();
        }

        if (
          this.tapStart &&
          !this.shouldBlockTap() &&
          e.pointerType === 'touch' &&
          this.pixiTapGestureSerial !== this.pointerGestureSerial
        ) {
          const dt = performance.now() - this.tapStart.t;
          const dist = Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y);
          const tapSlop = 14;
          if (dt < 350 && dist < tapSlop) {
            const now = performance.now();
            const double = now - this.lastTapTime < 320;
            this.lastTapTime = now;
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            this.handleScreenTap(sx, sy, double);
          }
        }

        this.lastPanPos = null;
        this.tapStart = null;
        if (this.zoomSource === 'pointer') {
          this.pinchSession = null;
          this.pinchGestureActive = false;
          this.gestureActive = false;
          this.zoomSource = 'none';
        }
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

  /** For QA — place character on a walkable tile without opening doors. */
  setCharacterTileForQa(tx: number, ty: number): void {
    if (!cells[ty]?.[tx]?.walkable) return;
    this.path = [];
    this.charTx = tx;
    this.charTy = ty;
    this.syncRoundedTileFromCharacter();
    this.syncCharacterGraphic();
    this.drawPathPreview();
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
}
