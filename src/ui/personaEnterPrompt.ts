import { getLang, onLangChange, t } from './i18n';

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
      <button type="button" class="persona-enter-prompt__btn" data-persona-enter></button>
    `;
    container.appendChild(this.root);
    this.btn = this.root.querySelector('[data-persona-enter]')!;
    this.applyLang();
    onLangChange(() => this.applyLang());
    this.btn.addEventListener('click', () => this.callbacks.onEnter());
  }

  private applyLang(): void {
    this.btn.textContent = t('persona.enter');
    this.btn.setAttribute('aria-label', t('persona.enter'));
    this.root.lang = getLang();
  }

  sync(show: boolean): void {
    this.root.hidden = !show;
    if (show) this.root.removeAttribute('inert');
    else this.root.setAttribute('inert', '');
  }
}
