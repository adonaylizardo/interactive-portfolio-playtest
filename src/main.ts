import { ChecklistUI } from './checklist/ui';
import { IsoScene } from './game/scene';
import { BuildingPanel } from './ui/buildingPanel';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {} });

  const panel = new BuildingPanel(uiRoot, () => {
    checklist.setBuildingPanelOpen(false);
  });

  let lastBuilding = '';
  const scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (title) => {
      if (panel.isOpen() && lastBuilding === title) return;
      lastBuilding = title;
      checklist.setBuildingPanelOpen(true);
      panel.show(title);
    },
  });

  await scene.init(canvas);

  window.__playtest = {
    walkToDoor: () => scene.walkToTile(3, 5, false),
    setZoom: (z: number) => scene.setZoomLevel(z, { x: window.innerWidth / 2, y: window.innerHeight / 2 }),
    getZoom: () => scene.getZoom(),
    isFarLod: () => scene.isFarLod(),
    walkToTile: (x: number, y: number, sprint: boolean) => scene.walkToTile(x, y, sprint),
  };
}

declare global {
  interface Window {
    __playtest?: {
      walkToDoor: () => void;
      setZoom: (z: number) => void;
      getZoom: () => number;
      isFarLod: () => boolean;
      walkToTile: (x: number, y: number, sprint: boolean) => void;
    };
  }
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
