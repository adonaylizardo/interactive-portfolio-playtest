import { Application, Container, Graphics } from 'pixi.js';
import {
  cells,
  getBuildingAtDoor,
  MAP_HEIGHT,
  MAP_WIDTH,
  objects,
  resolveWalkTarget,
  TILE_H,
  TILE_W,
  type MapObject,
} from '../data/map';
import { parseCameraFromHash, writeCameraToHash } from '../camera/hash';
import { isTouchPrimary, type ChecklistStepId } from '../checklist/storage';
import { tileToWorld, worldToTile, sortKey } from '../iso/math';
import { findPathOrNearest } from '../iso/pathfinding';
import { C } from './colors';
import {
  softClampMapInView,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAtScreenAnchor,
} from './cameraControl';
import { drawBuilding, drawCharacter, drawDiamond, drawPropDesk, drawPropTree } from './draw';

const LOD_ZOOM = 0.35;

export type SceneEvents = {
  onChecklist: (step: ChecklistStepId) => void;
  onEnterBuilding: (title: string) => void;
  onUnreachable?: () => void;
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
    startMid: { x: number; y: number };
    lastMid: { x: number; y: number };
  } | null = null;
  private pinchGestureActive = false;
  private suppressTapUntil = 0;
  private hadMultiPointerGesture = false;
  private gestureActive = false;

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
    this.buildObjects();
    this.syncCharacterGraphic();

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

  private buildTiles(): void {
    for (let ty = 0; ty < MAP_HEIGHT; ty++) {
      for (let tx = 0; tx < MAP_WIDTH; tx++) {
        const cell = cells[ty][tx];
        const pos = tileToWorld(tx, ty);
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
      const pos = tileToWorld(obj.x, obj.y);
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
        const sprint = (e.detail >= 2 && !isTouchPrimary()) || this.shiftHeld;
        if (obj.type === 'building' && obj.door) {
          this.requestWalk(obj.door.x, obj.door.y, sprint);
          return;
        }
        this.requestWalk(obj.x, obj.y, sprint);
      });
      this.objectGraphics.set(obj.id, g);
      this.objectsLayer.addChild(g);
    }
    this.refreshObjectVisuals();
  }

  private refreshObjectVisuals(): void {
    const far = this.zoom <= LOD_ZOOM;
    for (const obj of objects) {
      const g = this.objectGraphics.get(obj.id);
      if (!g) continue;
      g.clear();
      const hover = this.hoveredObject?.id === obj.id;
      if (obj.name === 'escritorio') drawPropDesk(g, far, hover);
      else if (obj.name === 'arbol') drawPropTree(g, far, hover);
      else drawBuilding(g, far, hover);
    }
  }

  requestWalk(tx: number, ty: number, sprint: boolean): void {
    const target = resolveWalkTarget(tx, ty);
    this.walkToTile(target.x, target.y, sprint);
  }

  walkToTile(tx: number, ty: number, sprint: boolean): void {
    const sx = Math.round(this.charTx);
    const sy = Math.round(this.charTy);
    const result = findPathOrNearest(sx, sy, tx, ty);
    if (!result) {
      this.events.onUnreachable?.();
      return;
    }
    this.path = result.path;
    this.sprint = sprint;
    this.charState = sprint ? 'sprint' : 'walk';
    this.events.onChecklist('walk-around');
    this.drawPathPreview();
  }

  private drawPathPreview(): void {
    this.pathGfx.clear();
    if (this.path.length === 0) return;
    const points = [{ x: this.charTx, y: this.charTy }, ...this.path];
    for (const p of points) {
      const w = tileToWorld(p.x, p.y);
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
    const pos = tileToWorld(this.charTx, this.charTy);
    this.charGfx.position.set(pos.x, pos.y);
    this.charGfx.zIndex = sortKey(this.charTx, this.charTy, 500);
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
    this.camera.position.set(sw / 2 + this.cameraX * this.zoom, sh / 2 + this.cameraY * this.zoom);
    this.camera.scale.set(this.zoom);
    this.refreshObjectVisuals();
    if (this.canvasEl) {
      this.canvasEl.dataset.camX = String(this.cameraX);
      this.canvasEl.dataset.camY = String(this.cameraY);
      this.canvasEl.dataset.zoom = String(this.zoom);
      this.canvasEl.dataset.camPx = String(this.camera.position.x);
      this.canvasEl.dataset.camPy = String(this.camera.position.y);
      this.canvasEl.dataset.charTile = JSON.stringify({
        x: Math.round(this.charTx),
        y: Math.round(this.charTy),
      });
    }
    if (persistHash) {
      writeCameraToHash({ x: this.cameraX, y: this.cameraY, zoom: this.zoom });
    }
    if (!this.gestureActive && this.zoom <= ZOOM_MIN + 0.02) {
      const softened = softClampMapInView(
        { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
        sw,
        sh,
      );
      this.cameraX = softened.cameraX;
      this.cameraY = softened.cameraY;
      this.camera.position.set(sw / 2 + this.cameraX * this.zoom, sh / 2 + this.cameraY * this.zoom);
      if (this.canvasEl) {
        this.canvasEl.dataset.camPx = String(this.camera.position.x);
        this.canvasEl.dataset.camPy = String(this.camera.position.y);
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
  }

  private setZoom(next: number, anchorScreen?: { x: number; y: number }): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    const camPx = this.camera.position.x;
    const camPy = this.camera.position.y;
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
      this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    }
    this.zoomChanged = true;
    this.applyCamera();
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

  private bindInput(): void {
    const canvas = this.canvasEl!;
    const appRoot = document.getElementById('app');
    canvas.style.touchAction = 'none';
    if (appRoot) appRoot.style.touchAction = 'none';

    for (const type of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }

    document.addEventListener(
      'wheel',
      (e) => {
        if (e.ctrlKey) e.preventDefault();
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.keys.add(k);
        this.events.onChecklist('walk-keys');
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
        let dy = e.deltaY;
        if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) dy *= 24;
        else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) dy *= 480;
        const factor = e.ctrlKey ? 0.004 : 0.002;
        const delta = -dy * factor;
        this.setZoom(this.zoom * (1 + delta), { x: e.clientX, y: e.clientY });
      },
      { passive: false },
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length >= 2) e.preventDefault();
      },
      { passive: false },
    );

    const onPointerDown = (e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.panMoved = false;
        this.hadMultiPointerGesture = false;
        this.lastPanPos = { x: e.clientX, y: e.clientY };
        this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      }
      if (this.pointers.size === 2) {
        this.pinchGestureActive = true;
        this.gestureActive = true;
        this.hadMultiPointerGesture = true;
        this.panMoved = true;
        const mid = this.pointerMidpoint()!;
        const dist = this.pointerDistance();
        this.pinchSession = {
          startDist: Math.max(dist, 24),
          startZoom: this.zoom,
          startMid: mid,
          lastMid: mid,
        };
      }
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size >= 2 && this.pinchSession) {
        e.preventDefault();
        const mid = this.pointerMidpoint()!;
        const dist = Math.max(this.pointerDistance(), 8);
        const scale = dist / this.pinchSession.startDist;
        const nextZoom = this.pinchSession.startZoom * scale;
        const sw = this.app.screen.width;
        const sh = this.app.screen.height;
        const anchored = zoomAtScreenAnchor(
          { cameraX: this.cameraX, cameraY: this.cameraY, zoom: this.zoom },
          sw,
          sh,
          this.camera.position.x,
          this.camera.position.y,
          nextZoom,
          mid,
        );
        this.cameraX =
          anchored.cameraX + (mid.x - this.pinchSession.lastMid.x) / anchored.zoom;
        this.cameraY =
          anchored.cameraY + (mid.y - this.pinchSession.lastMid.y) / anchored.zoom;
        this.zoom = anchored.zoom;
        this.pinchSession.lastMid = mid;
        this.zoomChanged = true;
        this.cameraPanned = true;
        this.applyCamera();
        return;
      }

      if (this.pointers.size === 1 && this.lastPanPos && !this.pinchGestureActive) {
        const dx = e.clientX - this.lastPanPos.x;
        const dy = e.clientY - this.lastPanPos.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
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

    const onPointerUp = (e: PointerEvent) => {
      const wasPinch = this.pinchGestureActive;
      this.pointers.delete(e.pointerId);

      if (this.pointers.size === 1 && wasPinch) {
        const remaining = [...this.pointers.values()][0];
        this.lastPanPos = { x: remaining.x, y: remaining.y };
        this.pinchSession = null;
        this.pinchGestureActive = false;
        this.gestureActive = false;
        this.suppressTapUntil = performance.now() + 400;
        this.panMoved = true;
      }

      if (this.pointers.size === 0) {
        if (wasPinch || this.hadMultiPointerGesture) {
          this.suppressTapUntil = performance.now() + 400;
        }

        if (
          this.tapStart &&
          !this.shouldBlockTap() &&
          e.pointerType === 'touch'
        ) {
          const dt = performance.now() - this.tapStart.t;
          const dist = Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y);
          if (dt < 350 && dist < 12) {
            const now = performance.now();
            const double = now - this.lastTapTime < 320;
            this.lastTapTime = now;
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const wx = (sx - this.camera.position.x) / this.zoom;
            const wy = (sy - this.camera.position.y) / this.zoom;
            const tile = worldToTile(wx, wy);
            if (tile) this.requestWalk(tile.x, tile.y, double);
            else this.events.onUnreachable?.();
          }
        }

        this.lastPanPos = null;
        this.tapStart = null;
        this.pinchSession = null;
        this.pinchGestureActive = false;
        this.gestureActive = false;
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
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
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
        const ntx = this.charTx + dx * speed;
        const nty = this.charTy + dy * speed;
        const tx = Math.round(ntx);
        const ty = Math.round(nty);
        if (cells[ty]?.[tx]?.walkable) {
          this.charTx = ntx;
          this.charTy = nty;
        }
        this.syncCharacterGraphic();
        this.checkDoor();
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
        this.checkDoor();
        if (this.path.length === 0) {
          this.charState = 'idle';
          this.sprint = false;
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

  private checkDoor(): void {
    if (this.doorCooldown > 0) return;
    const tx = Math.round(this.charTx);
    const ty = Math.round(this.charTy);
    const building = getBuildingAtDoor(tx, ty);
    if (building?.panelTitle) {
      this.doorCooldown = 120;
      this.events.onEnterBuilding(building.panelTitle);
      this.events.onChecklist('enter-building');
    }
  }

  /** For QA — programmatic walk */
  getCharacterTile(): { x: number; y: number } {
    return { x: Math.round(this.charTx), y: Math.round(this.charTy) };
  }

  getObjectIds(): string[] {
    return objects.map((o) => o.id);
  }

  getZoom(): number {
    return this.zoom;
  }

  isFarLod(): boolean {
    return this.zoom <= LOD_ZOOM;
  }

  setZoomLevel(level: number, anchorScreen?: { x: number; y: number }): void {
    this.setZoom(level, anchorScreen);
  }
}
