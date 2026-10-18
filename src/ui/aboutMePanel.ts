import { studio } from '../audio/studio';
import { ABOUT } from '../data/about';
import {
  CONTACT_MAILTO,
  CV_HREF,
  LINKEDIN_URL,
  MEDIUM_URL,
} from '../data/contactLinks';
import { iconSvg } from './icons';
import { aboutBlockNode, splitAboutIntroBody } from './aboutRender';
import { onLangChange, t } from './i18n';

export type AboutOpenOpts = {
  highlightContact?: boolean;
  sectionId?: string;
};

export class AboutMePanel {
  readonly root: HTMLElement;
  private scrollEl: HTMLElement;
  private contactEl!: HTMLElement;
  private opened = false;
  private onClose?: () => void;

  constructor(container: HTMLElement, opts?: { onClose?: () => void }) {
    this.onClose = opts?.onClose;
    this.root = document.createElement('div');
    this.root.className = 'about-panel';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="about-panel__backdrop" data-about-backdrop></div>
      <div class="about-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="about-panel-title">
        <div class="about-panel__grab" aria-hidden="true"></div>
        <header class="about-panel__header">
          <h2 class="about-panel__title" id="about-panel-title">About me</h2>
          <div class="about-panel__header-actions">
            <button type="button" class="about-panel__icon-btn" data-about-expand aria-label="Expand">${iconSvg('expand')}</button>
            <button type="button" class="about-panel__icon-btn about-panel__icon-btn--plain" data-about-close aria-label="Close">${iconSvg('close')}</button>
          </div>
        </header>
        <div class="about-panel__scroll"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.scrollEl = this.root.querySelector('.about-panel__scroll')!;
    this.buildContent();
    this.bind();
    onLangChange(() => this.applyI18n());
  }

  isOpen(): boolean {
    return this.opened;
  }

  private buildContent(): void {
    const { intro, body } = splitAboutIntroBody(ABOUT);
    this.scrollEl.replaceChildren();

    const introWrap = document.createElement('div');
    introWrap.className = 'about-panel__intro';
    introWrap.append(...intro.map(aboutBlockNode));

    this.contactEl = document.createElement('div');
    this.contactEl.className = 'about-panel__contact';
    this.contactEl.id = 'about-contact';
    this.contactEl.innerHTML = this.contactRowsHtml();

    const bodyWrap = document.createElement('div');
    bodyWrap.className = 'about-panel__body about-panel__photos';
    bodyWrap.append(...body.map(aboutBlockNode));

    this.scrollEl.append(introWrap, this.contactEl, bodyWrap);
  }

  private contactRowsHtml(): string {
    return `
      <div class="about-panel__cta-row">
        <a class="ui-btn ui-btn--primary about-panel__cta-half" href="${CV_HREF}" target="_blank" rel="noopener noreferrer" download>
          ${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span>
        </a>
        <a class="about-panel__cta-half ui-btn ui-btn--secondary" href="${CONTACT_MAILTO}" data-about-mailto="contact">
          ${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span>
        </a>
      </div>
      <a class="about-panel__link" href="${CONTACT_MAILTO}">
        ${iconSvg('mail')} <span>Email</span>
        <span class="about-panel__link-trail">${iconSvg('arrowNe', 15)}</span>
      </a>
      <a class="about-panel__link" href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer">
        ${iconSvg('link')} <span>Linked In</span>
        <span class="about-panel__link-trail">${iconSvg('arrowNe', 15)}</span>
      </a>
      <a class="about-panel__link" href="${MEDIUM_URL}" target="_blank" rel="noopener noreferrer">
        ${iconSvg('link')} <span>Medium</span>
        <span class="about-panel__link-trail">${iconSvg('arrowNe', 15)}</span>
      </a>
    `;
  }

  private bind(): void {
    this.root.querySelector('[data-about-close]')?.addEventListener('click', () => this.close());
    this.root.querySelector('[data-about-backdrop]')?.addEventListener('click', () => this.close());
    this.root.querySelector('[data-about-expand]')?.addEventListener('click', () => {
      this.root.classList.toggle('about-panel--expanded');
    });
    this.root.querySelectorAll('[data-about-mailto]').forEach((a) => {
      a.addEventListener('click', () => studio.playLine('11-contact'));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.opened) this.close();
    });
  }

  private applyI18n(): void {
    this.root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
  }

  open(opts: AboutOpenOpts = {}): void {
    this.opened = true;
    this.root.hidden = false;
    this.root.classList.add('about-panel--open');
    document.body.classList.add('about-panel-open');
    this.root.classList.toggle('about-panel--phone-portrait', this.isPhonePortrait());
    this.root.classList.toggle('about-panel--landscape', this.isSideSheet());

    requestAnimationFrame(() => {
      if (opts.sectionId) {
        const target =
          this.scrollEl.querySelector(`#${CSS.escape(opts.sectionId)}`) ??
          this.scrollEl.querySelector(`[data-about-section="${CSS.escape(opts.sectionId)}"]`);
        target?.scrollIntoView({ block: 'start' });
      } else if (opts.highlightContact) {
        this.scrollEl.scrollTop = Math.max(0, this.contactEl.offsetTop - 80);
      } else {
        this.scrollEl.scrollTop = 0;
      }
      if (opts.highlightContact) this.flashContact();
    });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('about-panel--open', 'about-panel--expanded', 'about-panel--phone-portrait', 'about-panel--landscape');
    this.root.hidden = true;
    document.body.classList.remove('about-panel-open');
    this.onClose?.();
  }

  flashContact(): void {
    this.contactEl.classList.add('about-panel__contact--flash');
    window.setTimeout(() => this.contactEl.classList.remove('about-panel__contact--flash'), 1200);
  }

  private isPhonePortrait(): boolean {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
  }

  private isSideSheet(): boolean {
    return window.matchMedia('(max-height: 500px) and (orientation: landscape) and (max-width: 900px)').matches;
  }
}
