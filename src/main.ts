import { ChecklistUI } from './checklist/ui';
import {
  getBuildingDoorTiles,
  getEnterableBuildings,
  INICIO,
  MAP_TRAMOS,
  validateWalkGridFootprint,
} from './data/map';
import { IsoScene } from './game/scene';
import { findPath } from './iso/pathfinding';
import { BuildingPanel } from './ui/buildingPanel';
import { showToast } from './ui/toast';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });

  let scene!: IsoScene;
  const panel = new BuildingPanel(uiRoot, () => {
    checklist.setBuildingPanelOpen(false);
  });

  let lastBuilding = '';
  scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (title) => {
      checklist.complete('enter-building');
      if (panel.isOpen() && lastBuilding === title) return;
      lastBuilding = title;
      checklist.setBuildingPanelOpen(true);
      scene.clearWalkPreview();
      panel.show(title);
    },
    onUnreachable: () => showToast('No se puede llegar'),
    buildingPanel: {
      isOpen: () => panel.isOpen(),
      openTitle: () => lastBuilding,
      dismiss: () => panel.hide(),
    },
  });

  await scene.init(canvas);

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
      })),
    inicio: INICIO,
    mapTramos: MAP_TRAMOS,
    findPath,
    getCharacterTile: () => scene.getCharacterTile(),
    setCharacterTile: (x: number, y: number) => scene.setCharacterTileForQa(x, y),
    walkToBuilding: (name: string) => scene.walkToBuildingForQa(name),
  };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
