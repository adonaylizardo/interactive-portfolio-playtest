/** HTML name pills — crisp at every zoom, always above the Pixi depth sort. */

import { t } from './i18n';

export type NameLabelTarget = {
  id: 'adonay' | 'pantone' | 'noah' | 'jac';
  name: string;
  x: number;
  y: number;
  visible: boolean;
  info?: boolean;
};

export class NameLabels {
  readonly root: HTMLElement;
  private pills = new Map<string, HTMLElement>();
  private onJacInfo?: () => void;

  constructor(container: HTMLElement, opts?: { onJacInfo?: () => void }) {
    this.onJacInfo = opts?.onJacInfo;
    this.root = document.createElement('div');
    this.root.className = 'name-labels';
    this.root.setAttribute('aria-hidden', 'true');
    for (const id of ['adonay', 'pantone', 'noah', 'jac'] as const) {
      const pill = document.createElement('div');
      pill.className = 'name-label';
      pill.dataset.id = id;
      pill.hidden = true;
      pill.innerHTML =
        `<i class="name-label__dot"></i><span class="name-label__text"></span>` +
        (id === 'jac'
          ? `<button type="button" class="name-label__info" hidden aria-label="${t('jac.info')}">i</button>`
          : '');
      this.root.appendChild(pill);
      this.pills.set(id, pill);
    }
    const infoBtn = this.pills.get('jac')?.querySelector('.name-label__info');
    if (infoBtn) {
      const open = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        this.onJacInfo?.();
      };
      infoBtn.addEventListener('pointerdown', open);
      infoBtn.addEventListener('click', open);
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
      const infoBtn = pill.querySelector('.name-label__info') as HTMLButtonElement | null;
      if (infoBtn) {
        infoBtn.hidden = !t.info;
        infoBtn.setAttribute('aria-label', t.info ? `${t.name} — ${this.infoLabel()}` : '');
      }
      const show = t.visible && !this.root.hidden;
      pill.hidden = !show;
      if (!show) continue;
      pill.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px) translate(-50%, -100%)`;
    }
    for (const [id, pill] of this.pills) {
      if (!seen.has(id)) pill.hidden = true;
    }
    this.separatePills();
    this.hideOverChrome();
  }

  private infoLabel(): string {
    return t('jac.info');
  }

  /** Stack overlapping pills vertically. JAC stays put; Adonay then Pantone then Noah lift. */
  private separatePills(): void {
    const GAP = 4;
    type Item = { el: HTMLElement; x: number; y: number; w: number; h: number; baseY: number; rank: number; movable: boolean };
    const rankOf = (el: HTMLElement) => {
      if (el.classList.contains('jac-pill--name') || el.dataset.id === 'jac') return 0;
      if (el.dataset.id === 'adonay') return 1;
      if (el.dataset.id === 'pantone') return 2;
      return 3;
    };
    const items: Item[] = [];
    const add = (el: HTMLElement, movable: boolean) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      items.push({ el, x: r.left, y: r.top, w: r.width, h: r.height, baseY: r.top, rank: rankOf(el), movable });
    };
    for (const p of this.pills.values()) if (!p.hidden) add(p, true);
    for (const extra of document.querySelectorAll('.jac-pill--name')) {
      const html = extra as HTMLElement;
      if (html.hidden || html.closest('[hidden]')) continue;
      const cs = getComputedStyle(html);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      add(html, false);
    }
    const overlaps = (a: Item, b: Item) =>
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
    for (let pass = 0; pass < 10; pass++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (!overlaps(a, b)) continue;
          const ovY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          const lift = ovY + GAP;
          const [keep, slide] =
            a.rank === b.rank ? a.y <= b.y ? [a, b] : [b, a] : a.rank < b.rank ? [a, b] : [b, a];
          if (!slide.movable) {
            if (!keep.movable) continue;
            keep.y -= lift;
            moved = true;
            continue;
          }
          slide.y -= lift;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const it of items) {
      if (!it.movable) continue;
      const dy = Math.round(it.y - it.baseY);
      if (!dy) continue;
      it.el.style.transform = `${it.el.style.transform} translateY(${dy}px)`;
    }
  }

  /** Noah (and others) must not cover Getting-started 5 / 5 or other chrome. */
  private hideOverChrome(): void {
    const blockers = [
      ...document.querySelectorAll(
        '.checklist, .chrome__lang, .chrome__tools-phone, .chrome__intro, .chrome--sheet .chrome__intro, .chrome__column, .about-panel__sheet, .building-panel__sheet, .chrome__subtitle, .cenital-building-label',
      ),
    ].filter(
      (el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 2 &&
          r.height > 2 &&
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          !(el as HTMLElement).hidden
        );
      },
    ) as HTMLElement[];
    if (!blockers.length) return;
    const overlap = (a: DOMRect, b: DOMRect) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    for (const pill of this.pills.values()) {
      if (pill.hidden) continue;
      const a = pill.getBoundingClientRect();
      if (blockers.some((el) => overlap(a, el.getBoundingClientRect()) > 4)) pill.hidden = true;
    }
  }

  qa(): { id: string; name: string; visible: boolean; x: number; y: number; info: boolean }[] {
    return [...this.pills.values()].map((pill) => {
      const r = pill.getBoundingClientRect();
      const info = pill.querySelector('.name-label__info') as HTMLElement | null;
      return {
        id: pill.dataset.id ?? '',
        name: pill.querySelector('.name-label__text')?.textContent ?? '',
        visible: !pill.hidden && !this.root.hidden,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        info: !!info && !info.hidden && !pill.hidden,
      };
    });
  }
}
