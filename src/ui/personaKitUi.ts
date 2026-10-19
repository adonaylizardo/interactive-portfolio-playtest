import { isMobileLayout } from '../checklist/ui';
import { personaEnabled } from '../game/persona/personaSpec';
import type { Camera } from '../tokens';
import { getLang, onLangChange, setLang, t } from './i18n';
import { studio } from '../audio/studio';
import { iconSvg } from './icons';

const STORAGE_KEY = 'portfolio-persona-controls-v1';

export type PersonaKitCallbacks = {
  getViewMode: () => Camera;
  switchView: (mode: Camera) => Promise<void>;
};

export class PersonaKitUI {
  readonly root: HTMLElement;
  private overlay: HTMLElement;
  private camSwitch: HTMLElement;
  private camLoad: HTMLElement;
  private camLoadLabel: HTMLElement;
  private helpBtn: HTMLButtonElement;
  private langBtn: HTMLButtonElement;
  private callbacks: PersonaKitCallbacks;
  private switching = false;

  constructor(container: HTMLElement, callbacks: PersonaKitCallbacks) {
    if (!personaEnabled()) {
      this.root = document.createElement('div');
      this.overlay = this.root;
      this.camSwitch = this.root;
      this.camLoad = this.root;
      this.camLoadLabel = this.root;
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
      <div class="persona-kit__cam-load" data-cam-load hidden inert>
        <div class="persona-kit__cam-load-dim" aria-hidden="true"></div>
        <div class="persona-kit__cam-load-pill" role="status" aria-live="polite">
          <span class="persona-kit__cam-load-spin" aria-hidden="true"></span>
          <span data-cam-load-label></span>
        </div>
      </div>
      <div class="persona-kit__cam" role="tablist" aria-label="">
        <button type="button" class="persona-kit__cam-opt" role="tab" data-cam="cenital">
          <span class="persona-kit__cam-opt-spin" aria-hidden="true"></span>
          <span class="persona-kit__cam-opt-label"></span>
        </button>
        <button type="button" class="persona-kit__cam-opt" role="tab" data-cam="persona">
          <span class="persona-kit__cam-opt-spin" aria-hidden="true"></span>
          <span class="persona-kit__cam-opt-label"></span>
        </button>
      </div>
      <button type="button" class="persona-kit__icon-btn persona-kit__help" data-persona-help aria-label="">
        ${iconSvg('info', 18)}
      </button>
      <button type="button" class="persona-kit__lang" data-persona-lang aria-label=""></button>
    `;
    container.appendChild(this.root);
    this.overlay = this.root.querySelector('[data-persona-overlay]')!;
    this.camLoad = this.root.querySelector('[data-cam-load]')!;
    this.camLoadLabel = this.root.querySelector('[data-cam-load-label]')!;
    this.camSwitch = this.root.querySelector('.persona-kit__cam')!;
    this.helpBtn = this.root.querySelector('[data-persona-help]')!;
    this.langBtn = this.root.querySelector('[data-persona-lang]')!;
    this.bind();
    this.applyI18n();
    onLangChange(() => this.applyI18n());
    this.syncCameraSwitch();
  }

  private bind(): void {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || this.overlay.hidden) return;
      e.preventDefault();
      this.closeOverlay(true);
    };
    this.overlay.addEventListener('keydown', onEsc);
    window.addEventListener('keydown', onEsc);
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
        if (mode === 'cenital' || mode === 'persona') void this.requestCam(mode);
      });
    });
  }

  private switchingLabel(target: 'cenital' | 'persona'): string {
    return target === 'persona' ? t('persona.cam.switchingToThird') : t('persona.cam.switchingToCenital');
  }

  private lockCamWidths(): void {
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      const w = (btn as HTMLElement).getBoundingClientRect().width;
      if (w > 0) (btn as HTMLElement).style.minWidth = `${Math.ceil(w)}px`;
    });
  }

  private clearCamWidthLock(): void {
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      (btn as HTMLElement).style.minWidth = '';
    });
  }

  private showCamLoading(target: 'cenital' | 'persona'): void {
    this.camLoadLabel.textContent = this.switchingLabel(target);
    this.camLoad.hidden = false;
    this.camLoad.removeAttribute('inert');
    this.camSwitch.classList.add('is-switching');
    this.camSwitch.dataset.switchTo = target;
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      const el = btn as HTMLElement;
      const pending = el.dataset.cam === target;
      el.classList.toggle('is-pending', pending);
      el.querySelector('.persona-kit__cam-opt-spin')?.classList.toggle('is-on', pending);
    });
  }

  private hideCamLoading(): void {
    this.camLoad.hidden = true;
    this.camLoad.setAttribute('inert', '');
    this.camSwitch.classList.remove('is-switching');
    delete this.camSwitch.dataset.switchTo;
    this.camSwitch.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.classList.remove('is-pending');
      btn.querySelector('.persona-kit__cam-opt-spin')?.classList.remove('is-on');
    });
    this.clearCamWidthLock();
  }

  private async requestCam(mode: 'cenital' | 'persona'): Promise<void> {
    if (this.switching) return;
    if (this.callbacks.getViewMode() === mode) return;
    this.switching = true;
    this.lockCamWidths();
    this.showCamLoading(mode);
    try {
      await this.callbacks.switchView(mode);
    } finally {
      this.hideCamLoading();
      this.switching = false;
      this.syncCameraSwitch();
    }
  }

  private applyI18n(): void {
    this.root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
    this.camSwitch.setAttribute('aria-label', t('persona.cam.label'));
    const cen = this.camSwitch.querySelector('[data-cam="cenital"]')!;
    const tp = this.camSwitch.querySelector('[data-cam="persona"]')!;
    cen.querySelector('.persona-kit__cam-opt-label')!.textContent = t('persona.cam.cenital');
    tp.querySelector('.persona-kit__cam-opt-label')!.textContent = t('persona.cam.thirdPerson');
    cen.setAttribute('aria-label', t('persona.cam.cenital'));
    tp.setAttribute('aria-label', t('persona.cam.thirdPerson'));
    if (this.switching && this.camSwitch.dataset.switchTo) {
      this.camLoadLabel.textContent = this.switchingLabel(
        this.camSwitch.dataset.switchTo as 'cenital' | 'persona',
      );
    }
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
    if (!personaEnabled() || this.switching) return;
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
    const primary = this.root.querySelector('.persona-kit__primary') as HTMLButtonElement | null;
    requestAnimationFrame(() => {
      primary?.focus({ preventScroll: true });
    });
  }

  closeOverlay(persist = false): void {
    this.overlay.hidden = true;
    this.overlay.setAttribute('inert', '');
    studio.playIntroWhenPersonaReady();
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
