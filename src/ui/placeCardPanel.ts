import { studio } from '../audio/studio';
import {
  isPlaceCard,
  placeCardHeroUrl,
  placeCardLine,
  placeCardTitle,
  placeCardVoiceId,
  type PlaceCardId,
} from '../data/placeCards';
import { iconSvg } from './icons';

export class PlaceCardPanel {
  private el: HTMLElement;
  private sheet: HTMLElement;
  private titleEl: HTMLElement;
  private lineEl: HTMLElement;
  private progressFill: HTMLElement;
  private playBtn: HTMLButtonElement;
  private heroImg: HTMLImageElement;
  private openId: PlaceCardId | null = null;
  private onChange: () => void;
  private escHandler: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, onChange: () => void) {
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'place-card';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="place-card__backdrop" data-place-backdrop></div>
      <div class="place-card__sheet" role="dialog" aria-modal="true" aria-labelledby="place-card-title">
        <div class="place-card__handle" aria-hidden="true"></div>
        <header class="place-card__head">
          <h2 class="place-card__title" id="place-card-title"></h2>
          <button type="button" class="place-card__close" data-place-close aria-label="Close">${iconSvg('close', 18)}</button>
        </header>
        <div class="place-card__hero">
          <img class="place-card__hero-img" alt="" decoding="async" />
        </div>
        <div class="place-card__audio">
          <button type="button" class="place-card__play" data-place-play aria-label="Play">${iconSvg('play', 16)}</button>
          <div class="place-card__copy">
            <p class="place-card__line"></p>
            <div class="place-card__progress" aria-hidden="true"><i class="place-card__progress-fill"></i></div>
          </div>
        </div>
      </div>
    `;
    container.appendChild(this.el);
    this.sheet = this.el.querySelector('.place-card__sheet')!;
    this.titleEl = this.el.querySelector('.place-card__title')!;
    this.lineEl = this.el.querySelector('.place-card__line')!;
    this.progressFill = this.el.querySelector('.place-card__progress-fill')!;
    this.playBtn = this.el.querySelector('[data-place-play]')!;
    this.heroImg = this.el.querySelector('.place-card__hero-img')!;

    this.el.querySelector('[data-place-close]')?.addEventListener('click', () => this.hide());
    this.el.querySelector('[data-place-backdrop]')?.addEventListener('click', () => this.hide());
    this.playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.openId) return;
      studio.togglePlaceVoice(placeCardVoiceId(this.openId));
      this.syncPlayUi();
    });

    this.escHandler = (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.hide();
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.syncLocateInset());
      ro.observe(this.sheet);
    }
    window.addEventListener('resize', () => this.syncLocateInset());
    studio.onChange(() => {
      if (this.isOpen()) this.syncPlayUi();
    });
  }

  isOpen(): boolean {
    return !this.el.hidden && !!this.openId;
  }

  openIdOrNull(): PlaceCardId | null {
    return this.openId;
  }

  open(id: PlaceCardId): void {
    studio.stopPlaceVoice();
    this.openId = id;
    this.el.hidden = false;
    this.el.classList.add('place-card--open');
    document.body.dataset.placeCard = '1';
    this.titleEl.textContent = placeCardTitle(id);
    this.lineEl.textContent = placeCardLine(id);
    this.heroImg.src = placeCardHeroUrl(id);
    this.heroImg.alt = placeCardTitle(id);
    this.syncPlayUi();
    this.syncLocateInset();
    window.addEventListener('keydown', this.escHandler);
    this.onChange();
    studio.playClick();
  }

  hide(): void {
    if (!this.openId) return;
    studio.stopPlaceVoice();
    this.openId = null;
    this.el.hidden = true;
    this.el.classList.remove('place-card--open');
    delete document.body.dataset.placeCard;
    document.documentElement.style.removeProperty('--place-locate-bottom');
    window.removeEventListener('keydown', this.escHandler);
    this.onChange();
  }

  /** Progress bar + play icon — call from main onFrame. */
  tickUi(): void {
    if (!this.openId) return;
    const voiceId = placeCardVoiceId(this.openId);
    const { current, duration, playing, voiceId: active } = studio.getPlaceVoiceProgress();
    if (active === voiceId && duration > 0) {
      const pct = Math.min(100, (current / duration) * 100);
      this.progressFill.style.width = `${pct}%`;
      this.el.classList.toggle('place-card--playing', playing);
    } else {
      this.progressFill.style.width = '0%';
      this.el.classList.remove('place-card--playing');
    }
    this.syncPlayUi();
  }

  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (!this.isOpen()) return { left: 0, top: 0, right: 0, bottom: 0 };
    const sheet = this.sheet.getBoundingClientRect();
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const landscapeSide = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
    if (!mobile) {
      return { left: Math.ceil(sheet.width + 64), top: 0, right: 0, bottom: 0 };
    }
    if (landscapeSide) {
      return { left: 0, top: 0, right: Math.ceil(sheet.width + 8), bottom: 0 };
    }
    return { left: 0, top: 0, right: 0, bottom: Math.ceil(window.innerHeight - sheet.top + 8) };
  }

  private syncPlayUi(): void {
    if (!this.openId) return;
    const voiceId = placeCardVoiceId(this.openId);
    const { playing, voiceId: active } = studio.getPlaceVoiceProgress();
    const isPlaying = active === voiceId && playing;
    this.playBtn.innerHTML = iconSvg(isPlaying ? 'pause' : 'play', 16);
    this.playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
  }

  private syncLocateInset(): void {
    if (!this.isOpen()) return;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const landscapeSide = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
    if (!mobile || landscapeSide) {
      document.documentElement.style.removeProperty('--place-locate-bottom');
      return;
    }
    const top = this.sheet.getBoundingClientRect().top;
    document.documentElement.style.setProperty('--place-locate-bottom', `${Math.max(96, window.innerHeight - top + 12)}px`);
  }
}

export function tryOpenPlaceCard(id: string, panel: PlaceCardPanel): boolean {
  if (!isPlaceCard(id)) return false;
  panel.open(id);
  return true;
}
