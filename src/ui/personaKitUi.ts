import { isMobileLayout } from '../checklist/ui';
import { personaEnabled } from '../game/persona/personaSpec';
import type { Camera } from '../tokens';
import { getLang, onLangChange, setLang, t } from './i18n';
import { iconSvg } from './icons';

const STORAGE_KEY = 'portfolio-persona-controls-v1';

export type PersonaKitCallbacks = {
  getViewMode: () => Camera;
  setViewMode: (mode: Camera) => void;
};

export class PersonaKitUI {
  readonly root: HTMLElement;
  private overlay: HTMLElement;
  private camSwitch: HTMLElement;
  private helpBtn: HTMLButtonElement;
  private langBtn: HTMLButtonElement;
  private callbacks: PersonaKitCallbacks;

  constructor(container: HTMLElement, callbacks: PersonaKitCallbacks) {
    if (!personaEnabled()) {
      this.root = document.createElement('div');
      this.overlay = this.root;
      this.camSwitch = this.root;
      this.helpBtn = document.createElement('button');
      this.langBtn = document.createElement('button');
      this.callbacks = callbacks;
      return;
    }
    this.callbacks = callbacks;
    document.body.classList.add('persona-kit');
    this.root = document.createElement('div');
    this.root.className = 'persona-kit';
    this.root.innerHTML = `
      <div class="persona-kit__overlay" data-persona-overlay hidden inert>
        <div class="persona-kit__card" role="dialog" aria-labelledby="persona-controls-title">
          <header class="persona-kit__card-head">
            <h2 id="persona-controls-title" class="persona-kit__card-title" data-i18n="persona.controls.title"></h2>
            <button type="button" class="persona-kit__icon-btn persona-kit__close" data-persona-close aria-label="">
              ${iconSvg('close', 18)}
            </button>
          </header>
          <div class="persona-kit__cols">
            <div class="persona-kit__col">
              <p class="persona-kit__col-title" data-i18n="persona.controls.move"></p>
              <div class="persona-kit__glyph persona-kit__glyph--stick" aria-hidden="true"></div>
              <p class="persona-kit__col-hint" data-i18n="persona.controls.moveHint"></p>
            </div>
            <div class="persona-kit__col">
              <p class="persona-kit__col-title" data-i18n="persona.controls.interact"></p>
              <div class="persona-kit__glyph persona-kit__glyph--tap" aria-hidden="true"></div>
              <p class="persona-kit__col-hint" data-i18n="persona.controls.interactHint"></p>
            </div>
          </div>
          <p class="persona-kit__note">
            ${iconSvg('info', 14)}
            <span data-i18n="persona.controls.helpHint"></span>
          </p>
          <button type="button" class="persona-kit__primary" data-persona-close data-i18n="persona.controls.understood"></button>
        </div>
      </div>
      <div class="persona-kit__cam" role="tablist" aria-label="">
        <button type="button" class="persona-kit__cam-opt" role="tab" data-cam="cenital"></button>
        <button type="button" class="persona-kit__cam-opt" role="tab" data-cam="persona"></button>
      </div>
      <button type="button" class="persona-kit__icon-btn persona-kit__help" data-persona-help aria-label="">
        ${iconSvg('info', 18)}
      </button>
      <button type="button" class="persona-kit__lang" data-persona-lang aria-label=""></button>
    `;
    container.appendChild(this.root);
    this.overlay = this.root.querySelector('[data-persona-overlay]')!;
    this.camSwitch = this.root.querySelector('.persona-kit__cam')!;
    this.helpBtn = this.root.querySelector('[data-persona-help]')!;
    this.langBtn = this.root.querySelector('[data-persona-lang]')!;
    this.bind();
    this.applyI18n();
    onLangChange(() => this.applyI18n());
    this.syncCameraSwitch();
  }

  private bind(): void {
    this.root.querySelectorAll('[data-persona-close]').forEach((el) => {
      el.addEventListener('click', () => this.closeOverlay(true));
    });
    this.helpBtn.addEventListener('click', () => this.openOverlay());
    this.langBtn.addEventListener('click', () => {
      setLang(getLang() === 'es' ? 'en' : 'es');
    });
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.cam as Camera;
        if (mode === 'cenital' || mode === 'persona') this.callbacks.setViewMode(mode);
        this.syncCameraSwitch();
      });
    });
  }

  private applyI18n(): void {
    this.root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
    this.camSwitch.setAttribute('aria-label', t('persona.cam.label'));
    const cen = this.camSwitch.querySelector('[data-cam="cenital"]')!;
    const tp = this.camSwitch.querySelector('[data-cam="persona"]')!;
    cen.textContent = t('persona.cam.cenital');
    tp.textContent = t('persona.cam.thirdPerson');
    cen.setAttribute('aria-label', t('persona.cam.cenital'));
    tp.setAttribute('aria-label', t('persona.cam.thirdPerson'));
    this.helpBtn.setAttribute('aria-label', t('persona.controls.title'));
    this.root.querySelectorAll('[data-persona-close]').forEach((el) => {
      if (el.classList.contains('persona-kit__close')) {
        el.setAttribute('aria-label', t('persona.controls.close'));
      }
    });
    this.langBtn.textContent = getLang() === 'es' ? 'ES' : 'EN';
    this.langBtn.setAttribute('aria-label', t('chrome.language'));
    const moveHint = this.root.querySelector('[data-i18n="persona.controls.moveHint"]');
    if (moveHint) {
      moveHint.textContent = isMobileLayout() ? t('persona.controls.moveHintTouch') : t('persona.controls.moveHintDesk');
    }
    const interactHint = this.root.querySelector('[data-i18n="persona.controls.interactHint"]');
    if (interactHint) {
      interactHint.textContent = isMobileLayout()
        ? t('persona.controls.interactHintTouch')
        : t('persona.controls.interactHintDesk');
    }
  }

  syncCameraSwitch(): void {
    if (!personaEnabled()) return;
    const mode = this.callbacks.getViewMode();
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      const on = (btn as HTMLElement).dataset.cam === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  openOverlay(): void {
    this.overlay.hidden = false;
    this.overlay.removeAttribute('inert');
  }

  closeOverlay(persist = false): void {
    this.overlay.hidden = true;
    this.overlay.setAttribute('inert', '');
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  }

  onBoot(): void {
    if (!personaEnabled()) return;
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      seen = false;
    }
    if (!seen) this.openOverlay();
    this.syncCameraSwitch();
  }
}
