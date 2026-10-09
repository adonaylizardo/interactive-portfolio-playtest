export class BuildingPanel {
  private el: HTMLElement;
  private titleEl: HTMLElement;
  private onClose: () => void;

  constructor(container: HTMLElement, onClose: () => void) {
    this.onClose = onClose;
    this.el = document.createElement('div');
    this.el.className = 'building-panel';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="building-panel__backdrop" data-close></div>
      <div class="building-panel__sheet" role="dialog" aria-modal="true">
        <button type="button" class="building-panel__close" aria-label="Cerrar">×</button>
        <h2 class="building-panel__title"></h2>
        <p class="building-panel__body">Caso de ejemplo [falta]</p>
        <p class="building-panel__hint">Contenido provisional — solo prueba de interacción.</p>
      </div>
    `;
    container.appendChild(this.el);
    this.titleEl = this.el.querySelector('.building-panel__title')!;

    this.el.querySelector('.building-panel__close')!.addEventListener('click', () => this.hide());
    const sheet = this.el.querySelector('.building-panel__sheet')!;
    sheet.addEventListener('click', (e) => e.stopPropagation());
    sheet.addEventListener('pointerdown', (e) => e.stopPropagation());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.hide();
      }
    });
  }

  show(title: string): void {
    this.titleEl.textContent = title;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('building-panel--open'));
  }

  hide(): void {
    this.el.classList.remove('building-panel--open');
    setTimeout(() => {
      this.el.hidden = true;
    }, this.reducedMotion() ? 0 : 200);
    this.onClose();
  }

  isOpen(): boolean {
    return this.el.classList.contains('building-panel--open');
  }

  private reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
