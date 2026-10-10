/** In-interior content board (map uses 3D room slab; no bottom sheet on the map). */
export class BuildingPanel {
  private el: HTMLElement;
  private titleEl: HTMLElement;
  private onVisibilityChange: () => void;
  private onSalir: () => void;
  private mode: 'hidden' | 'interior' = 'hidden';

  constructor(
    container: HTMLElement,
    onVisibilityChange: () => void,
    onSalir: () => void,
  ) {
    this.onVisibilityChange = onVisibilityChange;
    this.onSalir = onSalir;
    this.el = document.createElement('div');
    this.el.className = 'building-panel building-panel--interior-only';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="interior-panel" role="dialog" aria-modal="true">
        <button type="button" class="interior-panel__back" data-exit>Salir</button>
        <h2 class="building-panel__title"></h2>
        <p class="building-panel__body">Caso de ejemplo [falta]</p>
        <p class="building-panel__hint">Contenido provisional — solo prueba de interacción.</p>
      </div>
    `;
    container.appendChild(this.el);
    this.titleEl = this.el.querySelector('.building-panel__title')!;

    this.el.querySelector('[data-exit]')!.addEventListener('click', () => this.salir());
    const sheet = this.el.querySelector('.interior-panel')!;
    sheet.addEventListener('click', (e) => e.stopPropagation());
    sheet.addEventListener('pointerdown', (e) => e.stopPropagation());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.salir();
      }
    });
  }

  showInterior(title: string): void {
    this.mode = 'interior';
    this.titleEl.textContent = title;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('building-panel--open'));
  }

  /** QA: overlay open while still on the map (dismiss consume test). */
  showOverlayForQa(title: string): void {
    this.mode = 'hidden';
    this.titleEl.textContent = title;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('building-panel--open'));
  }

  hide(): void {
    this.el.classList.remove('building-panel--open');
    const delay = this.reducedMotion() ? 0 : 200;
    setTimeout(() => {
      if (!this.el.classList.contains('building-panel--open')) {
        this.el.hidden = true;
        this.mode = 'hidden';
      }
    }, delay);
    this.onVisibilityChange();
  }

  salir(): void {
    this.hide();
    this.onSalir();
  }

  isOpen(): boolean {
    return this.el.classList.contains('building-panel--open');
  }

  isInteriorMode(): boolean {
    return this.mode === 'interior' && this.isOpen();
  }

  private reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
