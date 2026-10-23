import { isMobileLayout } from '../checklist/ui';
import { getLang, onLangChange, t } from './i18n';
import { iconSvg } from './icons';

export type PersonaEnterCallbacks = {
  onEnter: () => void;
};

export class PersonaEnterPrompt {
  readonly root: HTMLElement;
  private btn: HTMLButtonElement;
  private callbacks: PersonaEnterCallbacks;

  constructor(container: HTMLElement, callbacks: PersonaEnterCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'persona-enter-prompt';
    this.root.hidden = true;
    this.root.setAttribute('inert', '');
    this.root.innerHTML = `
      <button type="button" class="persona-enter-prompt__btn" data-persona-enter>
        <span class="persona-enter-prompt__touch" aria-hidden="true">${iconSvg('arrowNe', 16)}</span>
        <kbd class="persona-enter-prompt__kbd" aria-hidden="true">E</kbd>
        <span class="persona-enter-prompt__text"></span>
      </button>
    `;
    container.appendChild(this.root);
    this.btn = this.root.querySelector('[data-persona-enter]')!;
    this.applyLang();
    onLangChange(() => this.applyLang());
    this.btn.addEventListener('click', () => this.callbacks.onEnter());
  }

  private applyLang(): void {
    const touch = isMobileLayout();
    const label = touch ? t('persona.enterTouch') : `${t('persona.enterDesk')} (E)`;
    const text = this.root.querySelector('.persona-enter-prompt__text')!;
    text.textContent = touch ? t('persona.enterTouch') : t('persona.enterDesk');
    const kbd = this.root.querySelector('.persona-enter-prompt__kbd') as HTMLElement;
    const touchIcon = this.root.querySelector('.persona-enter-prompt__touch') as HTMLElement;
    kbd.hidden = touch;
    touchIcon.hidden = !touch;
    this.btn.classList.toggle('persona-enter-prompt__btn--desk', !touch);
    this.btn.setAttribute('aria-label', label);
    this.root.lang = getLang();
  }

  sync(show: boolean): void {
    this.root.hidden = !show;
    if (show) this.root.removeAttribute('inert');
    else this.root.setAttribute('inert', '');
  }
}
