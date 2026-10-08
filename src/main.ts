import { ChecklistUI } from './checklist/ui';
import { IsoScene } from './game/scene';
import { BuildingPanel } from './ui/buildingPanel';
import { showToast } from './ui/toast';

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;

  const checklist = new ChecklistUI(uiRoot, { onSkip: () => {}, onDismiss: () => {} });

  const panel = new BuildingPanel(uiRoot, () => {
    checklist.setBuildingPanelOpen(false);
  });

  let lastBuilding = '';
  const scene = new IsoScene({
    onChecklist: (step) => checklist.complete(step),
    onEnterBuilding: (title) => {
      checklist.complete('enter-building');
      if (panel.isOpen() && lastBuilding === title) return;
      lastBuilding = title;
      checklist.setBuildingPanelOpen(true);
      panel.show(title);
    },
    onUnreachable: () => showToast('No se puede llegar'),
  });

  await scene.init(canvas);
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    'beforeend',
    `<p style="padding:16px;color:red">Error al cargar: ${String(err)}</p>`,
  );
});
