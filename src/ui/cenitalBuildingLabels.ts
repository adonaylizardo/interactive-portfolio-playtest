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

  qa(): { count: number; visible: number; overlaps: number } {
    let visible = 0;
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const pill of this.pills.values()) {
      if (pill.hidden) continue;
      visible += 1;
      const r = pill.getBoundingClientRect();
      boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 4 && oy > 4) overlaps += 1;
      }
    }
    return { count: this.pills.size, visible, overlaps };
  }
}

export function defaultCenitalBuildingNames(): string[] {
  return getEnterableBuildings().map((b) => b.panelTitle ?? b.name ?? b.id);
}
