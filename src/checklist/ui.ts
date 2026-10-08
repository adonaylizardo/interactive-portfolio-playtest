import {
  countCompleted,
  isChecklistHidden,
  isTouchPrimary,
  loadChecklist,
  saveChecklist,
  stepsForPlatform,
  totalStepsForPlatform,
  type ChecklistState,
  type ChecklistStepId,
} from './storage';

type StepCopy = {
  id: ChecklistStepId;
  title: string;
  detailDesktop: string;
  detailTouch: string;
};

const STEP_COPY: Record<ChecklistStepId, StepCopy> = {
  'walk-around': {
    id: 'walk-around',
    title: 'Camina por ahí',
    detailDesktop: 'Haz clic en un tile para ir allí. Doble clic o Shift para correr.',
    detailTouch: 'Toca un tile para ir allí. Doble toque en un tile para correr.',
  },
  'walk-keys': {
    id: 'walk-keys',
    title: 'Camina con las teclas',
    detailDesktop: 'Usa WASD o las flechas para mover al personaje.',
    detailTouch: 'Usa WASD o las flechas para mover al personaje.',
  },
  'move-camera': {
    id: 'move-camera',
    title: 'Mueve la cámara',
    detailDesktop: 'Arrastra con el mouse para desplazar la vista.',
    detailTouch: 'Arrastra con un dedo para desplazar la vista.',
  },
  zoom: {
    id: 'zoom',
    title: 'Acerca y aleja',
    detailDesktop: 'Usa la rueda del mouse o pellizco en trackpad.',
    detailTouch: 'Pellizca con dos dedos para acercar o alejar.',
  },
  'enter-building': {
    id: 'enter-building',
    title: 'Entra a un edificio',
    detailDesktop: 'Haz clic en un edificio para ir a su puerta y abrir el panel.',
    detailTouch: 'Toca un edificio para ir a su puerta y abrir el panel.',
  },
};

export function isMobileLayout(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

export type ChecklistCallbacks = {
  onSkip: () => void;
  onDismiss: () => void;
};

export class ChecklistUI {
  private state: ChecklistState;
  private root: HTMLElement;
  private listEl: HTMLElement;
  private counterEl: HTMLElement;
  private counterInRing: HTMLElement;
  private ringEl: SVGCircleElement;
  private headerTitle: HTMLElement;
  private ringBtn: HTMLButtonElement;
  private touch = isTouchPrimary();
  private mobile = isMobileLayout();
  private panelOpen = false;

  constructor(container: HTMLElement, callbacks: ChecklistCallbacks) {
    this.state = loadChecklist();
    this.root = document.createElement('aside');
    this.root.className = 'checklist';
    this.applyLayoutClasses();

    this.root.innerHTML = `
      <header class="checklist__header">
        <div class="checklist__header-text">
          <span class="checklist__label">Primeros pasos</span>
          <h2 class="checklist__active-title"></h2>
        </div>
        <div class="checklist__progress-wrap">
          <span class="checklist__counter checklist__counter--label"></span>
          <button type="button" class="checklist__ring-btn" aria-label="Abrir o cerrar lista de pasos">
            <svg class="checklist__ring" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
              <circle class="checklist__ring-bg" cx="28" cy="28" r="24" fill="none" stroke-width="2.5"/>
              <circle class="checklist__ring-fg" cx="28" cy="28" r="24" fill="none" stroke-width="3"
                stroke-dasharray="150.8" stroke-dashoffset="150.8" transform="rotate(-90 28 28)"/>
            </svg>
            <span class="checklist__counter checklist__counter--in-ring"></span>
          </button>
        </div>
      </header>
      <ul class="checklist__list"></ul>
      <footer class="checklist__footer">
        <button type="button" class="checklist__skip">Saltar tutorial</button>
        <button type="button" class="checklist__dismiss" hidden>Cerrar</button>
      </footer>
    `;

    container.appendChild(this.root);
    this.listEl = this.root.querySelector('.checklist__list')!;
    this.counterEl = this.root.querySelector('.checklist__counter--label')!;
    this.counterInRing = this.root.querySelector('.checklist__counter--in-ring')!;
    this.ringEl = this.root.querySelector('.checklist__ring-fg')!;
    this.headerTitle = this.root.querySelector('.checklist__active-title')!;
    this.ringBtn = this.root.querySelector('.checklist__ring-btn')!;
    this.ringBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const total = totalStepsForPlatform(this.touch);
      const done = countCompleted(this.state);
      if (done >= total && !this.mobile) {
        this.dismiss(callbacks);
        return;
      }
      if (this.mobile) {
        this.state.mobileExpanded = !this.state.mobileExpanded;
        this.applyLayoutClasses();
        saveChecklist(this.state);
        return;
      }
      this.state.collapsed = !this.state.collapsed;
      this.root.classList.toggle('checklist--collapsed', this.state.collapsed);
      saveChecklist(this.state);
    });

    this.root.querySelector('.checklist__skip')!.addEventListener('click', () => {
      this.state.skipped = true;
      if (!this.mobile) this.state.collapsed = true;
      this.state.mobileExpanded = false;
      saveChecklist(this.state);
      this.applyLayoutClasses();
      callbacks.onSkip();
    });

    this.root.querySelector('.checklist__dismiss')!.addEventListener('click', () => {
      this.dismiss(callbacks);
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', () => {
      this.mobile = isMobileLayout();
      this.applyLayoutClasses();
      this.render();
    });

    this.render();
  }

  private dismiss(callbacks: ChecklistCallbacks): void {
    this.state.dismissed = true;
    saveChecklist(this.state);
    this.applyLayoutClasses();
    callbacks.onDismiss();
  }

  setBuildingPanelOpen(open: boolean): void {
    this.panelOpen = open;
    if (open && this.mobile) {
      this.state.mobileExpanded = false;
      saveChecklist(this.state);
    }
    this.applyLayoutClasses();
  }

  private applyLayoutClasses(): void {
    this.mobile = isMobileLayout();
    const total = totalStepsForPlatform(this.touch);
    const done = countCompleted(this.state);
    const hidden = isChecklistHidden(this.state);

    this.root.hidden = hidden;
    this.root.classList.toggle('checklist--mobile', this.mobile);
    this.root.classList.toggle(
      'checklist--mobile-closed',
      this.mobile && !this.state.mobileExpanded,
    );
    this.root.classList.toggle('checklist--collapsed', !this.mobile && this.state.collapsed);
    this.root.classList.toggle('checklist--panel-open', this.mobile && this.panelOpen);
    this.root.classList.toggle('checklist--complete', done >= total);
    this.root.classList.toggle('checklist--skipped', this.state.skipped);
    if (this.state.skipped && !this.mobile) {
      this.root.classList.add('checklist--collapsed');
    }
  }

  complete(step: ChecklistStepId): void {
    if (this.state.skipped || this.state.dismissed) return;
    if (this.state.completed[step]) return;
    this.state.completed[step] = true;
    saveChecklist(this.state);
    this.render();
  }

  isSkippedOrDone(): boolean {
    return (
      isChecklistHidden(this.state) ||
      countCompleted(this.state) >= totalStepsForPlatform(this.touch)
    );
  }

  private render(): void {
    const total = totalStepsForPlatform(this.touch);
    const done = countCompleted(this.state);
    const counterText = `${done} / ${total}`;
    this.counterEl.textContent = counterText;
    this.counterInRing.textContent = counterText;
    const circumference = 150.8;
    const offset = circumference * (1 - done / total);
    this.ringEl.style.strokeDashoffset = String(offset);

    const dismissBtn = this.root.querySelector('.checklist__dismiss') as HTMLButtonElement;
    const skipBtn = this.root.querySelector('.checklist__skip') as HTMLButtonElement;
    const allDone = done >= total;
    dismissBtn.hidden = !allDone;
    skipBtn.hidden = allDone;

    this.applyLayoutClasses();

    const platformSteps = stepsForPlatform(this.touch);
    this.listEl.replaceChildren();
    let activeStep: StepCopy | null = null;

    for (const stepId of platformSteps) {
      const step = STEP_COPY[stepId];
      const completed = this.state.completed[step.id];
      if (!completed && !activeStep) activeStep = step;

      const li = document.createElement('li');
      li.className = 'checklist__item';
      if (completed) li.classList.add('checklist__item--done');
      if (!completed && step.id === activeStep?.id) li.classList.add('checklist__item--active');

      const detail = this.touch ? step.detailTouch : step.detailDesktop;
      li.innerHTML = `
        <div class="checklist__item-row">
          <span class="checklist__item-title">${step.title}</span>
          <span class="checklist__item-mark" aria-hidden="true"></span>
        </div>
        <p class="checklist__item-detail">${detail}</p>
      `;
      this.listEl.appendChild(li);
    }

    this.headerTitle.textContent = activeStep?.title ?? '¡Listo!';
  }
}
