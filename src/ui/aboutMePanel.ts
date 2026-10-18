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
      <div class="about-panel__backdrop" data-about-backdrop hidden></div>
      <div class="about-panel__sheet" role="dialog" aria-modal="true" aria-labelledby="about-panel-title">
        <header class="about-panel__header">
          <h2 class="about-panel__title" id="about-panel-title">About me</h2>
          <button type="button" class="ui-round" data-about-close aria-label="Close">${iconSvg('close')}</button>
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
    bodyWrap.className = 'about-panel__body';
    bodyWrap.append(...body.map(aboutBlockNode));

    this.scrollEl.append(introWrap, this.contactEl, bodyWrap);
  }

  private contactRowsHtml(): string {
    return `
      <a class="about-panel__row ui-btn ui-btn--primary" href="${CV_HREF}" target="_blank" rel="noopener noreferrer" download>
        ${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span>
      </a>
      <a class="about-panel__row ui-btn ui-btn--secondary" href="${CONTACT_MAILTO}" data-about-mailto="contact">
        ${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span>
      </a>
      <a class="about-panel__row about-panel__link" href="${CONTACT_MAILTO}">
        ${iconSvg('link')} <span>Email</span>
        <span class="about-panel__link-meta">${CONTACT_MAILTO.replace('mailto:', '')}</span>
      </a>
      <a class="about-panel__row about-panel__link" href="${LINKEDIN_URL}" target="_blank" rel="noopener noreferrer">
        ${iconSvg('link')} <span>Linked In</span>
        ${iconSvg('arrowNe', 15)}
      </a>
      <a class="about-panel__row about-panel__link" href="${MEDIUM_URL}" target="_blank" rel="noopener noreferrer">
        ${iconSvg('link')} <span>Medium</span>
        ${iconSvg('arrowNe', 15)}
      </a>
    `;
  }

  private bind(): void {
    this.root.querySelector('[data-about-close]')?.addEventListener('click', () => this.close());
    this.root.querySelector('[data-about-backdrop]')?.addEventListener('click', () => this.close());
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
    const backdrop = this.root.querySelector('.about-panel__backdrop') as HTMLElement;
    backdrop.hidden = !this.isSideSheet();

    requestAnimationFrame(() => {
      if (opts.sectionId) {
        const target =
          this.scrollEl.querySelector(`#${CSS.escape(opts.sectionId)}`) ??
          this.scrollEl.querySelector(`[data-about-section="${CSS.escape(opts.sectionId)}"]`);
        target?.scrollIntoView({ block: 'start' });
      } else if (opts.highlightContact) {
        this.contactEl.scrollIntoView({ block: 'start' });
      } else {
        this.scrollEl.scrollTop = 0;
      }
      if (opts.highlightContact) this.flashContact();
    });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('about-panel--open');
    this.root.hidden = true;
    document.body.classList.remove('about-panel-open');
    this.onClose?.();
  }

  scrollToSection(sectionId: string): void {
    if (!this.opened) this.open({ sectionId });
    else {
      const target = this.scrollEl.querySelector(`#${CSS.escape(sectionId)}`);
      target?.scrollIntoView({ block: 'start' });
    }
  }

  flashContact(): void {
    this.contactEl.classList.add('about-panel__contact--flash');
    window.setTimeout(() => this.contactEl.classList.remove('about-panel__contact--flash'), 1200);
  }

  private isSideSheet(): boolean {
    return window.matchMedia('(max-height: 500px) and (orientation: landscape) and (max-width: 900px)').matches;
  }
}
