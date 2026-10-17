import { studio } from '../audio/studio';
import { figmaAsset } from '../ui/figmaAssets';
import { onLangChange, t } from '../ui/i18n';
import {
  countCompleted,
  isChecklistHidden,
  isMobileOrCoarsePointer,
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

function stepCopy(): Record<ChecklistStepId, StepCopy> {
  return {
    'walk-around': {
      id: 'walk-around',
      title: t('check.walkAround'),
      detailDesktop: t('check.walkAround.desk'),
      detailTouch: t('check.walkAround.touch'),
    },
    'walk-keys': {
      id: 'walk-keys',
      title: t('check.walkKeys'),
      detailDesktop: t('check.walkKeys.desk'),
      detailTouch: t('check.walkKeys.touch'),
    },
    'move-camera': {
      id: 'move-camera',
      title: t('check.moveCamera'),
      detailDesktop: t('check.moveCamera.desk'),
      detailTouch: t('check.moveCamera.touch'),
    },
    zoom: {
      id: 'zoom',
      title: t('check.zoom'),
      detailDesktop: t('check.zoom.desk'),
      detailTouch: t('check.zoom.touch'),
    },
    'enter-building': {
      id: 'enter-building',
      title: t('check.enterBuilding'),
      detailDesktop: t('check.enterBuilding.desk'),
      detailTouch: t('check.enterBuilding.touch'),
    },
  };
}

export const COMPACT_LAYOUT_MQ = '(max-width: 767px), (max-height: 500px)';

export function isMobileLayout(): boolean {
  return window.matchMedia(COMPACT_LAYOUT_MQ).matches;
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
  private compactSteps = isMobileOrCoarsePointer();
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
          <span class="checklist__label"></span>
          <h2 class="checklist__active-title"></h2>
        </div>
        <div class="checklist__progress-wrap">
          <span class="checklist__counter checklist__counter--label"></span>
          <button type="button" class="checklist__ring-btn" aria-label="">
            <svg class="checklist__ring" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
              <circle class="checklist__ring-bg" cx="14" cy="14" r="11" fill="none" stroke-width="2"/>
              <circle class="checklist__ring-fg" cx="14" cy="14" r="11" fill="none" stroke-width="2.5"
                stroke-dasharray="69.12" stroke-dashoffset="69.12" transform="rotate(-90 14 14)"/>
            </svg>
            <span class="checklist__counter checklist__counter--in-ring"></span>
            <img class="checklist__ring-figma" src="" width="44" height="44" alt="" aria-hidden="true" />
            <img class="checklist__clipboard-figma" src="" width="15" height="15" alt="" aria-hidden="true" />
          </button>
        </div>
      </header>
      <ul class="checklist__list"></ul>
      <footer class="checklist__footer">
        <button type="button" class="checklist__skip"></button>
        <button type="button" class="checklist__dismiss" hidden></button>
      </footer>
    `;

    container.appendChild(this.root);
    this.listEl = this.root.querySelector('.checklist__list')!;
    this.counterEl = this.root.querySelector('.checklist__counter--label')!;
    this.counterInRing = this.root.querySelector('.checklist__counter--in-ring')!;
    this.ringEl = this.root.querySelector('.checklist__ring-fg')!;
    this.headerTitle = this.root.querySelector('.checklist__active-title')!;
    this.ringBtn = this.root.querySelector('.checklist__ring-btn')!;
    const ringFigma = this.root.querySelector('.checklist__ring-figma') as HTMLImageElement;
    const clipFigma = this.root.querySelector('.checklist__clipboard-figma') as HTMLImageElement;
    ringFigma.src = figmaAsset('talks-phone-map', '6af66.svg');
    clipFigma.src = figmaAsset('talks-phone-map', '629bf.svg');
    this.ringBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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

    const onLayout = () => {
      this.mobile = isMobileLayout();
      this.compactSteps = isMobileOrCoarsePointer();
      if (window.matchMedia('(max-height: 500px)').matches) this.state.mobileExpanded = false;
      this.applyLayoutClasses();
      this.render();
    };
    window.matchMedia('(max-width: 767px)').addEventListener('change', onLayout);
    window.matchMedia('(max-height: 500px)').addEventListener('change', onLayout);

    window.matchMedia('(hover: none) and (pointer: coarse)').addEventListener('change', () => {
      this.touch = isTouchPrimary();
      this.compactSteps = isMobileOrCoarsePointer();
      this.render();
    });

    this.render();
    onLangChange(() => this.render());
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

  isMobileExpanded(): boolean {
    return (
      this.mobile &&
      !isChecklistHidden(this.state) &&
      this.state.mobileExpanded === true
    );
  }

  collapseMobile(): void {
    if (!this.mobile) return;
    this.state.mobileExpanded = false;
    saveChecklist(this.state);
    this.applyLayoutClasses();
  }

  setCollapsed(collapsed: boolean): void {
    if (this.mobile) return;
    this.state.collapsed = collapsed;
    saveChecklist(this.state);
    this.applyLayoutClasses();
  }

  /** QA: set checklist progress through the real storage API (no render overrides). */
  setProgressForQa(completed: Partial<Record<ChecklistStepId, boolean>>): void {
    this.state = loadChecklist();
    for (const [id, done] of Object.entries(completed) as [ChecklistStepId, boolean][]) {
      if (done) this.state.completed[id] = true;
      else this.state.completed[id] = false;
    }
    saveChecklist(this.state);
    this.render();
  }

  private applyLayoutClasses(): void {
    this.mobile = isMobileLayout();
    const total = totalStepsForPlatform(this.compactSteps);
    const done = countCompleted(this.state, this.compactSteps);
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
  }

  complete(step: ChecklistStepId): void {
    if (this.state.skipped || this.state.dismissed) return;
    if (this.state.completed[step]) return;
    this.state.completed[step] = true;
    saveChecklist(this.state);
    this.render();
    studio.playLine('07-achievement');
  }

  isSkippedOrDone(): boolean {
    return (
      isChecklistHidden(this.state) ||
      countCompleted(this.state, this.compactSteps) >= totalStepsForPlatform(this.compactSteps)
    );
  }

  private render(): void {
    this.compactSteps = isMobileOrCoarsePointer();
    const total = totalStepsForPlatform(this.compactSteps);
    const done = countCompleted(this.state, this.compactSteps);
    const counterText = `${done}/${total}`;
    this.counterEl.textContent = counterText;
    this.counterInRing.textContent = counterText;
    const circumference = 69.12;
    const progress = done / total;
    const offset = circumference * (1 - progress);
    this.ringEl.style.strokeDashoffset = String(offset);

    const dismissBtn = this.root.querySelector('.checklist__dismiss') as HTMLButtonElement;
    const skipBtn = this.root.querySelector('.checklist__skip') as HTMLButtonElement;
    const labelEl = this.root.querySelector('.checklist__label') as HTMLElement;
    const allDone = done >= total;
    dismissBtn.hidden = !allDone;
    skipBtn.hidden = allDone;
    labelEl.textContent = t('check.label');
    skipBtn.textContent = t('check.skip');
    dismissBtn.textContent = t('check.close');
    this.ringBtn.setAttribute('aria-label', t('check.toggle'));

    this.applyLayoutClasses();

    const platformSteps = stepsForPlatform(this.compactSteps);
    const copy = stepCopy();
    this.listEl.replaceChildren();
    let activeStep: StepCopy | null = null;

    for (const stepId of platformSteps) {
      const step = copy[stepId];
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

    if (allDone) {
      this.headerTitle.textContent = t('check.done');
      this.headerTitle.classList.add('checklist__active-title--done');
    } else {
      this.headerTitle.textContent = activeStep?.title ?? '';
      this.headerTitle.classList.remove('checklist__active-title--done');
    }
  }
}
