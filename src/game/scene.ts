import { Application, Container, Graphics } from 'pixi.js';
import {
  cells,
  getBuildingAtDoor,
  MAP_HEIGHT,
  MAP_WIDTH,
  objects,
  type MapObject,
} from '../data/map';
import { parseCameraFromHash, writeCameraToHash } from '../camera/hash';
import type { ChecklistStepId } from '../checklist/storage';
import { tileToWorld, worldToTile, sortKey } from '../iso/math';
import { findPath } from '../iso/pathfinding';
import { C } from './colors';
import { drawBuilding, drawCharacter, drawDiamond, drawPropDesk, drawPropTree } from './draw';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const LOD_ZOOM = 0.35;

export type SceneEvents = {
  onChecklist: (step: ChecklistStepId) => void;
  onEnterBuilding: (title: string) => void;
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
  private pinchStart: { dist: number; zoom: number } | null = null;
  private tapStart: { x: number; y: number; t: number } | null = null;
  private lastTapTime = 0;
  private pointerDownOnCanvas = false;
  private panMoved = false;
  private cameraPanned = false;
  private zoomChanged = false;
  private canvasEl: HTMLCanvasElement | null = null;

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
    } else {
      this.centerOnCharacter(false);
    }
    this.applyCamera();

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
          if (this.panMoved) return;
          const sprint = e.detail >= 2 || this.shiftHeld;
          this.walkToTile(tx, ty, sprint);
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

  walkToTile(tx: number, ty: number, sprint: boolean): void {
    if (!cells[ty]?.[tx]?.walkable) return;
    const path = findPath(
      Math.round(this.charTx),
      Math.round(this.charTy),
      tx,
      ty,
    );
    if (!path) return;
    this.path = path;
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

  applyCamera(): void {
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.camera.position.set(sw / 2 + this.cameraX * this.zoom, sh / 2 + this.cameraY * this.zoom);
    this.camera.scale.set(this.zoom);
    this.refreshObjectVisuals();
    writeCameraToHash({ x: this.cameraX, y: this.cameraY, zoom: this.zoom });
    if (this.zoomChanged) {
      this.events.onChecklist('zoom');
      this.zoomChanged = false;
    }
    if (this.cameraPanned) {
      this.events.onChecklist('move-camera');
      this.cameraPanned = false;
    }
  }

  private setZoom(next: number, anchorScreen?: { x: number; y: number }): void {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (Math.abs(clamped - this.zoom) < 0.001) return;
    if (anchorScreen) {
      const wx = (anchorScreen.x - this.camera.position.x) / this.zoom;
      const wy = (anchorScreen.y - this.camera.position.y) / this.zoom;
      this.zoom = clamped;
      const sw = this.app.screen.width;
      const sh = this.app.screen.height;
      this.cameraX = wx - (anchorScreen.x - sw / 2) / this.zoom;
      this.cameraY = wy - (anchorScreen.y - sh / 2) / this.zoom;
    } else {
      this.zoom = clamped;
    }
    this.zoomChanged = true;
    this.applyCamera();
  }

  private bindInput(): void {
    const canvas = this.canvasEl!;
    canvas.style.touchAction = 'none';

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
        const delta = -e.deltaY * 0.001;
        this.setZoom(this.zoom * (1 + delta), { x: e.clientX, y: e.clientY });
      },
      { passive: false },
    );

    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDownOnCanvas = true;
      this.panMoved = false;
      this.lastPanPos = { x: e.clientX, y: e.clientY };
      this.tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (e.pointerType === 'touch') canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this.hoveredObject && matchMedia('(hover: hover)').matches) {
        // hover handled by pixi
      }
      if (!this.lastPanPos || !this.pointerDownOnCanvas) return;
      const dx = e.clientX - this.lastPanPos.x;
      const dy = e.clientY - this.lastPanPos.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        this.panMoved = true;
        this.cameraX += dx / this.zoom;
        this.cameraY += dy / this.zoom;
        this.lastPanPos = { x: e.clientX, y: e.clientY };
        this.cameraPanned = true;
        this.applyCamera();
      }
    });

    const endPointer = (e: PointerEvent) => {
      if (this.tapStart && !this.panMoved && e.pointerType === 'touch') {
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
          if (tile) this.walkToTile(tile.x, tile.y, double);
        }
      }
      this.pointerDownOnCanvas = false;
      this.lastPanPos = null;
      this.tapStart = null;
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          const [a, b] = [e.touches[0], e.touches[1]];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          this.pinchStart = { dist, zoom: this.zoom };
        }
      },
      { passive: false },
    );

    canvas.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 2 && this.pinchStart) {
          e.preventDefault();
          const [a, b] = [e.touches[0], e.touches[1]];
          const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const cx = (a.clientX + b.clientX) / 2;
          const cy = (a.clientY + b.clientY) / 2;
          const scale = dist / this.pinchStart.dist;
          this.setZoom(this.pinchStart.zoom * scale, { x: cx, y: cy });
          this.zoomChanged = true;
        }
      },
      { passive: false },
    );

    canvas.addEventListener('touchend', () => {
      this.pinchStart = null;
    });
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
}
