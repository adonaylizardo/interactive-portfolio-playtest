import {
  countCompleted,
  isTouchPrimary,
  loadChecklist,
  markAllComplete,
  saveChecklist,
  stepsForPlatform,
  TOTAL_STEPS,
  type ChecklistState,
  type ChecklistStepId,
} from './storage';

type StepCopy = {
  id: ChecklistStepId;
  title: string;
  detailDesktop: string;
  detailTouch: string;
  hintDesktop: string;
  hintTouch: string;
};

const STEP_COPY: Record<ChecklistStepId, StepCopy> = {
  'walk-around': {
    id: 'walk-around',
    title: 'Camina por ahí',
    detailDesktop: 'Haz clic en un tile para ir allí.',
    detailTouch: 'Toca un tile para ir allí.',
    hintDesktop: 'Clic en un tile para caminar.',
    hintTouch: 'Toca un tile para caminar.',
  },
  'walk-keys': {
    id: 'walk-keys',
    title: 'Camina con las teclas',
    detailDesktop: 'Usa WASD o las flechas para mover al personaje.',
    detailTouch: 'Usa WASD o las flechas para mover al personaje.',
    hintDesktop: 'WASD o flechas del teclado.',
    hintTouch: 'WASD o flechas del teclado.',
  },
  'sprint-touch': {
    id: 'sprint-touch',
    title: 'Corre',
    detailDesktop: 'Doble clic o Shift al caminar (solo referencia en touch).',
    detailTouch: 'Haz doble toque en un tile para correr hasta allí.',
    hintDesktop: 'Doble toque en tile (touch).',
    hintTouch: 'Doble toque en un tile para correr.',
  },
  'move-camera': {
    id: 'move-camera',
    title: 'Mueve la cámara',
    detailDesktop: 'Arrastra con el mouse para desplazar la vista.',
    detailTouch: 'Arrastra con un dedo para desplazar la vista.',
    hintDesktop: 'Arrastra el canvas para desplazar.',
    hintTouch: 'Arrastra con un dedo.',
  },
  zoom: {
    id: 'zoom',
    title: 'Acerca y aleja',
    detailDesktop: 'Usa la rueda del mouse o pellizco en trackpad.',
    detailTouch: 'Pellizca con dos dedos para acercar o alejar.',
    hintDesktop: 'Rueda del mouse o trackpad.',
    hintTouch: 'Pellizco con dos dedos.',
  },
  'enter-building': {
    id: 'enter-building',
    title: 'Entra a un edificio',
    detailDesktop: 'Camina hasta la puerta de un edificio para abrir el panel.',
    detailTouch: 'Camina hasta la puerta de un edificio para abrir el panel.',
    hintDesktop: 'Camina hasta una puerta.',
    hintTouch: 'Camina hasta una puerta.',
  },
};

export function isMobileLayout(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

export type ChecklistCallbacks = {
  onSkip: () => void;
};

export class ChecklistUI {
  private state: ChecklistState;
  private root: HTMLElement;
  private listEl: HTMLElement;
  private counterEl: HTMLElement;
  private ringEl: SVGCircleElement;
  private headerTitle: HTMLElement;
  private compactHint: HTMLElement;
  private headerEl: HTMLElement;
  private touch = isTouchPrimary();
  private mobile = isMobileLayout();

  constructor(container: HTMLElement, callbacks: ChecklistCallbacks) {
    this.state = loadChecklist();
    this.root = document.createElement('aside');
    this.root.className = 'checklist';
    this.applyLayoutClasses();

    if (countCompleted(this.state) >= TOTAL_STEPS) {
      this.root.classList.add('checklist--complete');
    }
    if (this.state.skipped) this.root.classList.add('checklist--skipped');

    this.root.innerHTML = `
      <header class="checklist__header">
        <div class="checklist__header-text">
          <span class="checklist__label">Primeros pasos</span>
          <h2 class="checklist__active-title"></h2>
          <p class="checklist__compact-hint"></p>
        </div>
        <div class="checklist__progress-wrap">
          <span class="checklist__counter"></span>
          <button type="button" class="checklist__ring-btn" aria-label="Expandir o contraer lista">
            <svg class="checklist__ring" viewBox="0 0 36 36" width="36" height="36">
              <circle class="checklist__ring-bg" cx="18" cy="18" r="15.5" fill="none" stroke-width="2"/>
              <circle class="checklist__ring-fg" cx="18" cy="18" r="15.5" fill="none" stroke-width="2.5"
                stroke-dasharray="97.4" stroke-dashoffset="97.4" transform="rotate(-90 18 18)"/>
            </svg>
          </button>
        </div>
      </header>
      <ul class="checklist__list"></ul>
      <footer class="checklist__footer">
        <button type="button" class="checklist__skip">Saltar tutorial</button>
      </footer>
    `;

    container.appendChild(this.root);
    this.listEl = this.root.querySelector('.checklist__list')!;
    this.counterEl = this.root.querySelector('.checklist__counter')!;
    this.ringEl = this.root.querySelector('.checklist__ring-fg')!;
    this.headerTitle = this.root.querySelector('.checklist__active-title')!;
    this.compactHint = this.root.querySelector('.checklist__compact-hint')!;
    this.headerEl = this.root.querySelector('.checklist__header')!;

    const toggleExpand = () => {
      if (this.mobile) {
        this.state.mobileExpanded = !this.state.mobileExpanded;
        this.applyLayoutClasses();
      } else {
        this.state.collapsed = !this.state.collapsed;
        this.root.classList.toggle('checklist--collapsed', this.state.collapsed);
      }
      saveChecklist(this.state);
    };

    this.root.querySelector('.checklist__ring-btn')!.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExpand();
    });

    this.headerEl.addEventListener('click', () => {
      if (this.mobile && !this.state.mobileExpanded) toggleExpand();
    });

    this.root.querySelector('.checklist__skip')!.addEventListener('click', () => {
      this.state.skipped = true;
      markAllComplete(this.state);
      saveChecklist(this.state);
      this.render();
      callbacks.onSkip();
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', () => {
      this.mobile = isMobileLayout();
      this.applyLayoutClasses();
      this.render();
    });

    this.render();
  }

  private applyLayoutClasses(): void {
    this.mobile = isMobileLayout();
    this.root.classList.toggle('checklist--mobile', this.mobile);
    this.root.classList.toggle(
      'checklist--mobile-compact',
      this.mobile && !this.state.mobileExpanded,
    );
    this.root.classList.toggle('checklist--collapsed', !this.mobile && this.state.collapsed);
  }

  complete(step: ChecklistStepId): void {
    if (this.state.skipped) return;
    if (this.state.completed[step]) return;
    this.state.completed[step] = true;
    saveChecklist(this.state);
    this.render();
  }

  isSkippedOrDone(): boolean {
    return this.state.skipped || countCompleted(this.state) >= TOTAL_STEPS;
  }

  private render(): void {
    const done = countCompleted(this.state);
    this.counterEl.textContent = `${done} / ${TOTAL_STEPS}`;
    const circumference = 97.4;
    const offset = circumference * (1 - done / TOTAL_STEPS);
    this.ringEl.style.strokeDashoffset = String(offset);

    if (done >= TOTAL_STEPS) {
      this.root.classList.add('checklist--complete');
    }

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
    const hint = activeStep
      ? this.touch
        ? activeStep.hintTouch
        : activeStep.hintDesktop
      : 'Completaste el tutorial.';
    this.compactHint.textContent = hint;
  }
}
