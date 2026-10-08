import { ChecklistUI } from './checklist/ui';
import { IsoScene } from './game/scene';
import { BuildingPanel } from './ui/buildingPanel';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {} });

  const panel = new BuildingPanel(uiRoot, () => {});

  let lastBuilding = '';
  const scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (title) => {
      if (panel.isOpen() && lastBuilding === title) return;
      lastBuilding = title;
      panel.show(title);
    },
  });

  await scene.init(canvas);

  window.__playtest = {
    walkToDoor: () => scene.walkToTile(3, 5, false),
  };
}

declare global {
  interface Window {
    __playtest?: { walkToDoor: () => void };
  }
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
