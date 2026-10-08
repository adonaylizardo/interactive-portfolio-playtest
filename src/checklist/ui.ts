import {
  countCompleted,
  loadChecklist,
  saveChecklist,
  TOTAL_STEPS,
  type ChecklistState,
  type ChecklistStepId,
} from './storage';

type StepCopy = {
  id: ChecklistStepId;
  title: string;
  detailDesktop: string;
  detailTouch: string;
};

const STEPS: StepCopy[] = [
  {
    id: 'walk-around',
    title: 'Camina por ahí',
    detailDesktop:
      'Haz clic en un tile para ir allí. Doble clic o mantén Shift para correr.',
    detailTouch: 'Toca un tile para ir allí. Doble toque para correr.',
  },
  {
    id: 'walk-keys',
    title: 'Camina con las teclas',
    detailDesktop: 'Usa WASD o las flechas para mover al personaje.',
    detailTouch: 'En escritorio: WASD o flechas.',
  },
  {
    id: 'move-camera',
    title: 'Mueve la cámara',
    detailDesktop: 'Arrastra con el mouse para desplazar la vista.',
    detailTouch: 'Arrastra con un dedo para desplazar la vista.',
  },
  {
    id: 'zoom',
    title: 'Acerca y aleja',
    detailDesktop: 'Usa la rueda del mouse o pellizco en trackpad.',
    detailTouch: 'Pellizca con dos dedos para acercar o alejar.',
  },
  {
    id: 'enter-building',
    title: 'Entra a un edificio',
    detailDesktop: 'Camina hasta la puerta de un edificio para abrir el panel.',
    detailTouch: 'Camina hasta la puerta de un edificio para abrir el panel.',
  },
];

function isTouchPrimary(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
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
  private touch = isTouchPrimary();

  constructor(container: HTMLElement, callbacks: ChecklistCallbacks) {
    this.state = loadChecklist();
    this.root = document.createElement('aside');
    this.root.className = 'checklist';
    if (this.state.collapsed) this.root.classList.add('checklist--collapsed');
    if (countCompleted(this.state) >= TOTAL_STEPS) {
      this.root.classList.add('checklist--complete');
    }
    if (this.state.skipped) this.root.classList.add('checklist--skipped');

    this.root.innerHTML = `
      <header class="checklist__header">
        <div class="checklist__header-text">
          <span class="checklist__label">Primeros pasos</span>
          <h2 class="checklist__active-title"></h2>
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

    this.root.querySelector('.checklist__ring-btn')!.addEventListener('click', () => {
      this.state.collapsed = !this.state.collapsed;
      this.root.classList.toggle('checklist--collapsed', this.state.collapsed);
      saveChecklist(this.state);
    });

    this.root.querySelector('.checklist__skip')!.addEventListener('click', () => {
      this.state.skipped = true;
      for (const step of STEPS) {
        this.state.completed[step.id] = true;
      }
      saveChecklist(this.state);
      this.render();
      callbacks.onSkip();
    });

    this.render();
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

    this.listEl.replaceChildren();
    let activeStep: StepCopy | null = null;

    for (const step of STEPS) {
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
