import { isMobileLayout } from '../checklist/ui';
import { getLang, onLangChange, t } from './i18n';
export type PersonaJacBoardCallbacks = {
  onGetIn: () => void;
  onGetOut: () => void;
};

export class PersonaJacBoard {
  readonly root: HTMLElement;
  private inBtn: HTMLButtonElement;
  private outBtn: HTMLButtonElement;
  private label: HTMLElement;
  private callbacks: PersonaJacBoardCallbacks;

  constructor(container: HTMLElement, callbacks: PersonaJacBoardCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'persona-jac-board';
    this.root.hidden = true;
    this.root.setAttribute('inert', '');
    this.root.innerHTML = `
      <p class="persona-jac-board__label" data-jac-label hidden></p>
      <button type="button" class="persona-jac-board__btn" data-persona-jac="in" hidden>
        <span class="persona-jac-board__wheel" aria-hidden="true"></span>
        <span class="persona-jac-board__text"></span>
      </button>
      <button type="button" class="persona-jac-board__btn persona-jac-board__btn--out" data-persona-jac="out" hidden>
        <span class="persona-jac-board__text"></span>
        <kbd class="persona-jac-board__kbd" aria-hidden="true">E</kbd>
      </button>
    `;
    container.appendChild(this.root);
    this.label = this.root.querySelector('[data-jac-label]')!;
    this.inBtn = this.root.querySelector('[data-persona-jac="in"]')!;
    this.outBtn = this.root.querySelector('[data-persona-jac="out"]')!;
    this.applyLang();
    onLangChange(() => this.applyLang());
    this.inBtn.addEventListener('click', () => this.callbacks.onGetIn());
    this.outBtn.addEventListener('click', () => this.callbacks.onGetOut());
  }

  private applyLang(): void {
    this.label.textContent = t('persona.jacLabel');
    this.inBtn.querySelector('.persona-jac-board__text')!.textContent = t('persona.jacBoardIn');
    this.outBtn.querySelector('.persona-jac-board__text')!.textContent = t('persona.jacBoardOut');
    this.inBtn.setAttribute('aria-label', t('persona.jacBoardIn'));
    this.outBtn.setAttribute('aria-label', `${t('persona.jacBoardOut')} (E)`);
    const outKbd = this.outBtn.querySelector('.persona-jac-board__kbd') as HTMLElement;
    outKbd.hidden = isMobileLayout();
    this.outBtn.classList.toggle('persona-jac-board__btn--desk', !isMobileLayout());
    this.root.lang = getLang();
  }

  sync(opts: { showIn: boolean; showOut: boolean }): void {
    this.inBtn.hidden = !opts.showIn;
    this.outBtn.hidden = !opts.showOut;
    this.label.hidden = !opts.showIn;
    const any = opts.showIn || opts.showOut;
    this.root.hidden = !any;
    if (any) this.root.removeAttribute('inert');
    else this.root.setAttribute('inert', '');
  }
}
