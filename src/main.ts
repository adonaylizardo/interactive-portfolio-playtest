import { studio } from './audio/studio';
import { ChecklistUI } from './checklist/ui';
import {
  doorInwardStep,
  getBuildingByName,
  getBuildingDoorTiles,
  getEnterableBuildings,
  INICIO,
  MAP_TRAMOS,
  validateWalkGridFootprint,
} from './data/map';
import { parseInteriorFromHash } from './camera/hash';
import { getInteriorDef, interiorBlockedTilesHaveProps } from './game/interior';
import { IsoScene } from './game/scene';
import { findPath } from './iso/pathfinding';
import { BuildingPanel } from './ui/buildingPanel';
import { ChromeUI, type DesktopLayout } from './ui/chrome';
import { hideToast, showToast } from './ui/toast';
import type { Camera } from './tokens';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });

  let scene!: IsoScene;
  const chrome = new ChromeUI(uiRoot, {
    onLayoutChange: () => {
      const layout = chrome.getLayout();
      checklist.setCollapsed(layout === 'map' || layout === 'panel');
      scene?.applyCameraFromUi();
    },
    onView: (mode: Camera) => scene?.setViewMode(mode),
    onRotate: () => scene?.rotateView(),
    onMapOverview: () => scene?.toggleMapOverview(),
    onCenter: () => scene?.recenterOnCharacter(),
    onLocate: (id) => scene?.walkToBuildingForQa(id),
  });

  const panel = new BuildingPanel(
    uiRoot,
    () => {
      const open = panel.isInteriorMode();
      checklist.setBuildingPanelOpen(open);
      chrome.setInteriorOpen(open);
      scene?.applyCameraFromUi();
    },
    () => scene.leaveInteriorNow(),
  );

  const syncInteriorPanel = (interiorId: string | null): void => {
    if (interiorId) {
      const b = getBuildingByName(interiorId);
      if (b?.panelTitle) {
        checklist.setBuildingPanelOpen(true);
        chrome.setInteriorOpen(true);
        panel.showInterior(b.panelTitle, interiorId);
      }
    } else {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false);
      panel.hide({ snap: true });
    }
    scene.applyCameraFromUi();
  };

  scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (buildingId) => {
      checklist.complete('enter-building');
      scene.enterInterior(buildingId);
    },
    onExitInterior: () => {
      checklist.setBuildingPanelOpen(false);
      chrome.setInteriorOpen(false, { skipLayout: true });
      panel.hide({ snap: true, silent: true });
    },
    onInteriorIdChange: (id) => {
      hideToast();
      syncInteriorPanel(id);
    },
    onUnreachable: () => showToast('No se puede llegar'),
    buildingPanel: {
      isOpen: () => panel.isOpen(),
      openTitle: () => panel.openTitle(),
      dismiss: () => panel.hide(),
      layoutInsets: () => panel.layoutInsets(),
      consumeInteriorCanvasTap: (x, y) => panel.consumeInteriorCanvasTap(x, y),
      expandInteriorSheetForQa: () => panel.expandInteriorSheetForQa(),
    },
    checklist: {
      isMobileExpanded: () => checklist.isMobileExpanded(),
      collapseMobile: () => checklist.collapseMobile(),
    },
    chrome: {
      layoutInsets: () => chrome.layoutInsets(),
      onMapInteract: () => {
        if (chrome.isMobileSheetOpen()) chrome.setLayout('map');
      },
    },
  });

  chrome.bindScene({
    getCharTile: () => scene.getCharacterTile(),
    getView: () => scene.getViewMode(),
  });
  await scene.init(canvas);

  const bootInterior = parseInteriorFromHash();
  if (bootInterior) {
    syncInteriorPanel(bootInterior);
  }

  (window as unknown as { __playtestQa?: Record<string, unknown> }).__playtestQa = {
    validateWalkGridFootprint,
    getBuildingDoorTiles,
    getEnterableBuildings: () =>
      getEnterableBuildings().map((o) => ({
        name: o.name,
        x: o.x,
        y: o.y,
        panelTitle: o.panelTitle ?? '',
        door: o.door,
        doorFace: o.doorFace ?? '+y',
        inward: doorInwardStep(o),
      })),
    inicio: INICIO,
    mapTramos: MAP_TRAMOS,
    findPath,
    getCharacterTile: () => scene.getCharacterTile(),
    getCharacterPos: () => scene.getCharacterPosForQa(),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
    doorScreenPoint: (name: string) => scene.getDoorScreenClientPoint(name),
    frameDoorForQa: (name: string) => scene.frameBuildingDoorForQa(name),
    tapBuildingDoor: (name: string) => scene.tapBuildingDoor(name),
    setSuppressTap: (ms: number) => scene.setSuppressTapForQa(ms),
    tapMapTile: (tx: number, ty: number) => scene.tapMapTileForQa(tx, ty),
    tapScreen: (sx: number, sy: number) => scene.tapScreenForQa(sx, sy),
    isInInterior: () => scene.isInInterior(),
    getInteriorId: () => scene.getInteriorBuildingId(),
    enterInterior: (name: string) => scene.enterInterior(name),
    exitInterior: () => scene.exitInterior(),
    dismissBuildingPanel: () => panel.hide(),
    showPanelOverlayForQa: (title: string) => {
      checklist.setBuildingPanelOpen(true);
      panel.showOverlayForQa(title);
    },
    isBuildingPanelOpen: () => panel.isOpen(),
    setWorkedWith: (logos: { name: string; file: string }[] | null) => panel.setWorkedWithForQa(logos),
    readWalkGoal: () => {
      const raw = document.getElementById('game-canvas')?.dataset.walkGoal;
      return raw ? JSON.parse(raw) : null;
    },
    setZoom: (z: number) => scene.setZoomLevel(z),
    interiorTileScreenPoint: (tx: number, ty: number, liftPx = 0) =>
      scene.getInteriorTileScreenClientPoint(tx, ty, liftPx),
    interiorForwardScreenPoint: () => scene.getInteriorForwardScreenPoint(),
    interiorCharTile: () => scene.getInteriorCharTile(),
    interiorWalk: () => scene.getInteriorWalkForQa(),
    interiorLayout: () => scene.getInteriorLayoutForQa(),
    interiorPixelProbes: () => scene.getInteriorPixelProbesClient(),
    tapInteriorTile: (tx: number, ty: number) => scene.tapInteriorTileForQa(tx, ty),
    expandInteriorSheet: () => panel.expandInteriorSheetForQa(),
    leaveInteriorNow: () => scene.leaveInteriorNow(),
    collapseInteriorSheetToPeek: () => panel.collapseToPeekOnly(),
    reframeMobileDefault: () => scene.reframeMobileDefaultViewForQa(),
    interiorBlockedTilesHaveProps: (name: string) => {
      const def = getInteriorDef(name);
      return def ? interiorBlockedTilesHaveProps(def) : false;
    },
    sampleCanvasColor: (clientX: number, clientY: number) =>
      scene.sampleCanvasColorAtClient(clientX, clientY),
    sampleCanvasColors: (points: { x: number; y: number }[]) =>
      scene.sampleCanvasColorsAtClient(points),
    spriteInstances: () => scene.qaSpriteInstances(),
    forceBuildingState: (s: 'default' | 'hover' | 'resaltado' | null) => scene.qaForceBuildingState(s),
    previewSprite: (k: string | null, x?: number, y?: number) => scene.qaPreviewSprite(k, x, y),
    loadAllSprites: () => scene.qaLoadAllSprites(),
    isolateSprites: (ids: string[] | null) => scene.qaIsolateSprites(ids),
    frameWorld: (x: number, y: number, zoom: number) => scene.qaFrameWorld(x, y, zoom),
    worldToClient: (x: number, y: number) => scene.qaWorldToClient(x, y),
    pickAt: (x: number, y: number) => scene.qaPickAt(x, y),
    obeliscoSilhouettes: () => scene.qaObeliscoSilhouettes(),
    streetTiles: () => scene.qaStreetTiles(),
    npcs: () => scene.qaNpcs(),
    fill: () => scene.qaFill(),
    setNpcs: (on: boolean) => scene.qaSetNpcs(on),
    npcTown: () => scene.qaNpcTown(),
    advanceNpcs: (seconds: number) => scene.qaAdvanceNpcs(seconds),
    playerAvatar: () => scene.qaPlayerAvatar(),
    benches: () => scene.qaBenches(),
    skipQuiet: (seconds: number) => scene.qaSkipQuiet(seconds),
    noah: () => scene.qaNoah(),
    pixiTargetAt: (x: number, y: number) => scene.qaPixiTargetAt(x, y),
    getLayout: () => chrome.getLayout(),
    setLayout: (m: DesktopLayout) => chrome.setLayout(m),
    getViewMode: () => scene.getViewMode(),
    setViewMode: (m: Camera) => scene.setViewMode(m),
    rotateView: () => scene.rotateView(),
    toggleMapOverview: () => scene.toggleMapOverview(),
    isMobileSheetOpen: () => chrome.isMobileSheetOpen(),
    audioMuted: () => studio.isMuted(),
    audioUnlocked: () => studio.isUnlocked(),
    setAudioMuted: (muted: boolean) => studio.setMuted(muted),
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
