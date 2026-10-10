import { ChecklistUI } from './checklist/ui';
import {
  getBuildingByName,
  getBuildingDoorTiles,
  getEnterableBuildings,
  INICIO,
  MAP_TRAMOS,
  validateWalkGridFootprint,
} from './data/map';
import { parseInteriorFromHash } from './camera/hash';
import { IsoScene } from './game/scene';
import { findPath } from './iso/pathfinding';
import { BuildingPanel } from './ui/buildingPanel';
import { showToast } from './ui/toast';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });

  let scene!: IsoScene;
  const panel = new BuildingPanel(
    uiRoot,
    () => checklist.setBuildingPanelOpen(false),
    () => {
      if (scene.isInInterior()) scene.exitInterior();
    },
  );

  scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (buildingId, title) => {
      checklist.complete('enter-building');
      checklist.setBuildingPanelOpen(true);
      scene.enterInterior(buildingId);
      panel.showInterior(title);
    },
    onExitInterior: () => {
      checklist.setBuildingPanelOpen(false);
      panel.hide();
    },
    onUnreachable: () => showToast('No se puede llegar'),
    buildingPanel: {
      isOpen: () => panel.isOpen(),
      openTitle: () => '',
      dismiss: () => panel.hide(),
    },
  });

  await scene.init(canvas);

  const bootInterior = parseInteriorFromHash();
  if (bootInterior) {
    const b = getBuildingByName(bootInterior);
    if (b?.panelTitle) {
      checklist.setBuildingPanelOpen(true);
      panel.showInterior(b.panelTitle);
    }
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
      })),
    inicio: INICIO,
    mapTramos: MAP_TRAMOS,
    findPath,
    getCharacterTile: () => scene.getCharacterTile(),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
    doorScreenPoint: (name: string) => scene.getDoorScreenClientPoint(name),
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
    readWalkGoal: () => {
      const raw = document.getElementById('game-canvas')?.dataset.walkGoal;
      return raw ? JSON.parse(raw) : null;
    },
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
