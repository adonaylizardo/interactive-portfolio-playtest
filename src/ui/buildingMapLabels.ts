/** Map pills above Talks / Writings buildings (Pixel kit). */

export type BuildingMapLabelTarget = {
  id: 'teresa' | 'biblioteca';
  label: string;
  x: number;
  y: number;
  visible: boolean;
};

export class BuildingMapLabels {
  readonly root: HTMLElement;
  private pills = new Map<string, HTMLElement>();
  private onPillTap?: (id: 'teresa' | 'biblioteca') => void;

  constructor(container: HTMLElement, onPillTap?: (id: 'teresa' | 'biblioteca') => void) {
    this.onPillTap = onPillTap;
    this.root = document.createElement('div');
    this.root.className = 'building-map-labels';
    for (const id of ['teresa', 'biblioteca'] as const) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'building-map-label';
      pill.dataset.id = id;
      pill.hidden = true;
      pill.innerHTML = '<span class="building-map-label__text"></span>';
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onPillTap?.(id);
      });
      this.root.appendChild(pill);
      this.pills.set(id, pill);
    }
    container.appendChild(this.root);
  }

  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }

  update(targets: BuildingMapLabelTarget[]): void {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.id);
      const pill = this.pills.get(t.id);
      if (!pill) continue;
      const text = pill.querySelector('.building-map-label__text')!;
      if (text.textContent !== t.label) text.textContent = t.label;
      const show = t.visible && !this.root.hidden;
      pill.hidden = !show;
      if (!show) continue;
      pill.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
    }
    for (const [id, pill] of this.pills) {
      if (!seen.has(id)) pill.hidden = true;
    }
  }
}
