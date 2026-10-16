/** HTML name pills — crisp at every zoom, always above the Pixi depth sort. */

export type NameLabelTarget = {
  id: 'adonay' | 'pantone' | 'noah';
  name: string;
  x: number;
  y: number;
  visible: boolean;
};

export class NameLabels {
  readonly root: HTMLElement;
  private pills = new Map<string, HTMLElement>();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'name-labels';
    this.root.setAttribute('aria-hidden', 'true');
    for (const id of ['adonay', 'pantone', 'noah'] as const) {
      const pill = document.createElement('div');
      pill.className = 'name-label';
      pill.dataset.id = id;
      pill.hidden = true;
      pill.innerHTML = `<i class="name-label__dot"></i><span class="name-label__text"></span>`;
      this.root.appendChild(pill);
      this.pills.set(id, pill);
    }
    container.appendChild(this.root);
  }

  setHidden(hidden: boolean): void {
    if (this.root.hidden === hidden) return;
    this.root.hidden = hidden;
  }

  update(targets: NameLabelTarget[]): void {
    const seen = new Set<string>();
    for (const t of targets) {
      seen.add(t.id);
      const pill = this.pills.get(t.id);
      if (!pill) continue;
      const text = pill.querySelector('.name-label__text')!;
      if (text.textContent !== t.name) text.textContent = t.name;
      const show = t.visible && !this.root.hidden;
      pill.hidden = !show;
      if (!show) continue;
      pill.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
    }
    for (const [id, pill] of this.pills) {
      if (!seen.has(id)) pill.hidden = true;
    }
    this.separatePills();
  }

  /** Keep pills from stacking when two heads sit on the same screen point. */
  private separatePills(): void {
    const visible = [...this.pills.values()].filter((p) => !p.hidden);
    for (let i = 0; i < visible.length; i++) {
      for (let j = i + 1; j < visible.length; j++) {
        const a = visible[i].getBoundingClientRect();
        const b = visible[j].getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const cur = visible[j].style.transform;
        visible[j].style.transform = `${cur} translateY(${-Math.ceil(overlapY + 4)}px)`;
      }
    }
  }

  qa(): { id: string; name: string; visible: boolean; x: number; y: number }[] {
    return [...this.pills.values()].map((pill) => {
      const r = pill.getBoundingClientRect();
      return {
        id: pill.dataset.id ?? '',
        name: pill.querySelector('.name-label__text')?.textContent ?? '',
        visible: !pill.hidden && !this.root.hidden,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    });
  }
}
