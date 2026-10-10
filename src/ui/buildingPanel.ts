/** Interior content — bottom sheet (mobile) / right rail (desktop). */
export class BuildingPanel {
  private el: HTMLElement;
  private sheet: HTMLElement;
  private titleEl: HTMLElement;
  private onVisibilityChange: () => void;
  private onSalir: () => void;
  private mode: 'hidden' | 'interior' = 'hidden';
  private peekOnly = true;
  private dragStartY = 0;

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
      <div class="building-panel__backdrop" data-backdrop></div>
      <div class="building-panel__sheet" role="dialog" aria-modal="true">
        <div class="building-panel__drag" data-drag aria-hidden="true"></div>
        <button type="button" class="building-panel__close" data-close aria-label="Cerrar">×</button>
        <h2 class="building-panel__title"></h2>
        <div class="building-panel__body-wrap">
          <p class="building-panel__body">Caso de ejemplo [falta]</p>
          <p class="building-panel__hint">Contenido provisional — solo prueba de interacción.</p>
        </div>
        <button type="button" class="building-panel__salir" data-exit>Salir</button>
      </div>
    `;
    container.appendChild(this.el);
    this.sheet = this.el.querySelector('.building-panel__sheet')!;
    this.titleEl = this.el.querySelector('.building-panel__title')!;

    this.el.querySelector('[data-exit]')!.addEventListener('click', () => this.salir());
    this.el.querySelector('[data-close]')!.addEventListener('click', () => this.salir());
    this.el.querySelector('[data-backdrop]')!.addEventListener('click', () => {
      if (this.isMobile()) this.setPeek(true);
    });
    this.sheet.addEventListener('click', (e) => e.stopPropagation());
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());

    const drag = this.el.querySelector('[data-drag]') as HTMLElement;
    drag.addEventListener('pointerdown', (e) => this.onDragStart(e));
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', () => this.onDragEnd());

    this.titleEl.addEventListener('click', () => {
      if (this.isMobile() && this.peekOnly) this.setPeek(false);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.salir();
      }
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', () => this.syncPeekClass());
  }

  private isMobile(): boolean {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  private setPeek(peek: boolean): void {
    this.peekOnly = peek;
    this.syncPeekClass();
    this.onVisibilityChange();
  }

  private syncPeekClass(): void {
    this.el.classList.toggle('building-panel--peek', this.isMobile() && this.peekOnly && this.isOpen());
  }

  private onDragStart(e: PointerEvent): void {
    if (!this.isMobile() || !this.isOpen()) return;
    this.dragStartY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onDragMove(e: PointerEvent): void {
    if (!this.dragStartY) return;
    const dy = e.clientY - this.dragStartY;
    if (dy > 40 && !this.peekOnly) this.setPeek(true);
    if (dy < -40 && this.peekOnly) this.setPeek(false);
  }

  private onDragEnd(): void {
    this.dragStartY = 0;
  }

  showInterior(title: string): void {
    this.mode = 'interior';
    this.titleEl.textContent = title;
    this.peekOnly = this.isMobile();
    this.el.hidden = false;
    requestAnimationFrame(() => {
      this.el.classList.add('building-panel--open');
      this.syncPeekClass();
      this.onVisibilityChange();
    });
  }

  /** QA: overlay open while still on the map (dismiss consume test). */
  showOverlayForQa(title: string): void {
    this.mode = 'hidden';
    this.titleEl.textContent = title;
    this.peekOnly = false;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('building-panel--open'));
  }

  hide(): void {
    this.el.classList.remove('building-panel--open', 'building-panel--peek');
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

  openTitle(): string {
    return this.isOpen() ? this.titleEl.textContent ?? '' : '';
  }

  /** Peek / sheet inset for interior camera fit. */
  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (!this.isOpen() || this.mode !== 'interior') {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const sheet = this.sheet.getBoundingClientRect();
    if (this.isMobile()) {
      const peek = this.el.classList.contains('building-panel--peek');
      const bottom = peek ? Math.min(88, sheet.height) : sheet.height;
      return { left: 0, top: 0, right: 0, bottom: Math.ceil(bottom + 8) };
    }
    return { left: 0, top: 0, right: Math.ceil(sheet.width + 12), bottom: 0 };
  }

  private reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
