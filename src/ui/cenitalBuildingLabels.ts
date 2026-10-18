/** Upright HTML labels for enterable buildings in top-down view. */

import { getEnterableBuildings } from '../data/map';

export type CenitalBuildingLabel = {
  id: string;
  name: string;
  x: number;
  y: number;
  visible: boolean;
};

export class CenitalBuildingLabels {
  readonly root: HTMLElement;
  private pills = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'cenital-building-labels';
    this.root.setAttribute('aria-hidden', 'true');
    container.appendChild(this.root);
  }

  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
    if (hidden) {
      for (const pill of this.pills.values()) pill.hidden = true;
    }
  }

  update(targets: CenitalBuildingLabel[]): void {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.id);
      let pill = this.pills.get(t.id);
      if (!pill) {
        pill = document.createElement('div');
        pill.className = 'cenital-building-label';
        pill.dataset.id = t.id;
        pill.innerHTML = '<span class="cenital-building-label__text"></span>';
        this.root.appendChild(pill);
        this.pills.set(t.id, pill);
      }
      const text = pill.querySelector('.cenital-building-label__text')!;
      if (text.textContent !== t.name) text.textContent = t.name;
      const show = t.visible && !this.root.hidden;
      pill.hidden = !show;
      if (!show) continue;
      pill.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -50%)`;
    }
    for (const [id, pill] of this.pills) {
      if (!seen.has(id)) pill.hidden = true;
    }
  }

  qa(): { count: number; visible: number } {
    let visible = 0;
    for (const pill of this.pills.values()) if (!pill.hidden) visible += 1;
    return { count: this.pills.size, visible };
  }
}

export function defaultCenitalBuildingNames(): string[] {
  return getEnterableBuildings().map((b) => b.panelTitle ?? b.name ?? b.id);
}
