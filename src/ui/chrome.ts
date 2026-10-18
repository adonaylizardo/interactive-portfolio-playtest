import { studio } from '../audio/studio';
import { CASES, CASE_CARD_TITLES, type CaseHouseId } from '../data/cases';
import { getEnterableBuildings } from '../data/map';
import { tileToWorld } from '../iso/math';
import { isMobileLayout } from '../checklist/ui';
import { iconSvg, type IconName } from './icons';
import type { Camera } from '../tokens';
import { getLang, onLangChange, setLang, t, type Lang } from './i18n';

export type DesktopLayout = 'split' | 'map' | 'panel';
export type Audience = 'recruiter' | 'mentoria' | 'cliente';
export type { Lang };

export type ChromeCallbacks = {
  onLayoutChange: () => void;
  onView: (mode: Camera) => void;
  onRotate: () => void;
  onMapOverview: () => void;
  onCenter: () => void;
  onLocate: (buildingId: string) => void;
  onReadingOpen?: () => void;
  onReadingClose?: () => void;
};

const EXPERIENCE: { id: CaseHouseId; label: string }[] = [
  { id: 'volaris', label: CASE_CARD_TITLES.volaris },
  { id: 'bain', label: CASE_CARD_TITLES.bain },
  { id: 'mentoria', label: 'Mentoría en Applaudo' },
  { id: 'finoa', label: CASE_CARD_TITLES.finoa },
  { id: 'pg', label: CASE_CARD_TITLES.pg },
];

const CASES_ROWS: { id: CaseHouseId; label: string }[] = [
  { id: 'volaris', label: CASE_CARD_TITLES.volaris },
  { id: 'bain', label: CASE_CARD_TITLES.bain },
  { id: 'mentoria', label: 'Mentoría en Applaudo' },
  { id: 'finoa', label: CASE_CARD_TITLES.finoa },
  { id: 'pg', label: CASE_CARD_TITLES.pg },
];

function caseRowSummary(id: CaseHouseId): string {
  const content = CASES[id];
  return content?.subtitle ?? content?.shortHeadline ?? '';
}

const CV_HREF = `${import.meta.env.BASE_URL}cv/adonay-lizardo-cv.pdf`;
const CONTACT_HREF = 'mailto:hello@adonaylizardo.com';

function roundBtn(icon: IconName, label: string, extra = '', action?: string): string {
  const act = action ? ` data-action="${action}"` : '';
  return `<button type="button" class="ui-round ${extra}" data-icon="${icon}"${act} aria-label="${label}">${iconSvg(icon)}</button>`;
}

export class ChromeUI {
  readonly root: HTMLElement;
  private layout: DesktopLayout = 'split';
  private mobileSheet = true;
  private audience: Audience = 'recruiter';
  private lang: Lang = getLang();
  private interiorOpen = false;
  private mobile = isMobileLayout();
  private callbacks: ChromeCallbacks;
  private minimap: HTMLCanvasElement;
  private soundHintTimer: ReturnType<typeof setTimeout> | null = null;
  private getCharTile: () => { x: number; y: number } = () => ({ x: 0, y: 0 });
  private getView: () => { mode: Camera; yaw: number; overview: boolean } = () => ({
    mode: 'isometrica',
    yaw: 0,
    overview: false,
  });

  constructor(container: HTMLElement, callbacks: ChromeCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'chrome';
    this.root.innerHTML = this.template();
    container.appendChild(this.root);
    this.minimap = this.root.querySelector('.chrome__minimap') as HTMLCanvasElement;
    this.bind();
    this.applyI18n();
    onLangChange(() => this.applyI18n());
    this.sync();
    studio.onChange(() => {
      this.syncSound();
      this.syncSubtitle();
    });
    const onLayout = () => {
      this.mobile = isMobileLayout();
      this.sync();
      this.callbacks.onLayoutChange();
    };
    window.matchMedia('(max-width: 767px)').addEventListener('change', onLayout);
    window.matchMedia('(max-height: 500px)').addEventListener('change', onLayout);
    const draw = () => {
      this.drawMinimap();
      this.syncViewButtons();
      this.placeLang();
      this.placeSubtitle();
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  }

  bindScene(opts: {
    getCharTile: () => { x: number; y: number };
    getView: () => { mode: Camera; yaw: number; overview: boolean };
  }): void {
    this.getCharTile = opts.getCharTile;
    this.getView = opts.getView;
  }

  getLayout(): DesktopLayout {
    return this.layout;
  }

  isMobileSheetOpen(): boolean {
    return this.mobile && this.mobileSheet && !this.interiorOpen;
  }

  setInteriorOpen(open: boolean, opts?: { skipLayout?: boolean }): void {
    this.interiorOpen = open;
    if (open && this.mobile) this.mobileSheet = false;
    if (open && !this.mobile && this.layout === 'map') this.layout = 'split';
    this.sync({ deferColumn: !!opts?.skipLayout && !open });
    if (!opts?.skipLayout) this.callbacks.onLayoutChange();
  }

  setLayout(next: DesktopLayout): void {
    if (this.mobile) {
      this.mobileSheet = next !== 'map';
    } else {
      this.layout = next;
    }
    this.sync();
    studio.playClick();
    this.callbacks.onLayoutChange();
  }

  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (this.interiorOpen) {
      return this.mobile ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: 64, top: 0, right: 0, bottom: 0 };
    }
    if (this.mobile) {
      if (this.mobileSheet) {
        const sheet = this.root.querySelector('.chrome__intro')?.getBoundingClientRect();
        const bottom = sheet ? Math.ceil(window.innerHeight - sheet.top + 8) : 280;
        return { left: 0, top: 72, right: 0, bottom };
      }
      return { left: 0, top: 72, right: 0, bottom: 72 };
    }
    if (this.layout === 'map') return { left: 72, top: 16, right: 16, bottom: 24 };
    if (this.layout === 'panel') return { left: window.innerWidth, top: 0, right: 0, bottom: 0 };
    return { left: 496, top: 16, right: 16, bottom: 24 };
  }

  private template(): string {
    const expRows = EXPERIENCE.map(
      (row) => `
      <button type="button" class="chrome__exp-row" data-locate="${row.id}">
        <span class="chrome__exp-name">${row.label}</span>
        <span class="chrome__exp-meta"><span class="chrome__skeleton chrome__skeleton--bar"></span>${iconSvg('locate', 16)}</span>
      </button>`,
    ).join('');
    const caseRows = CASES_ROWS.map((row) => {
      return `
      <button type="button" class="chrome__case-row" data-locate="${row.id}">
        <span class="chrome__case-thumb">${iconSvg('map')}</span>
        <span class="chrome__case-copy">
          <span class="chrome__case-title">${row.label}</span>
          <span class="chrome__case-subtitle">${caseRowSummary(row.id)}</span>
        </span>
      </button>`;
    }).join('');

    return `
      <nav class="chrome__rail" aria-label="Primary" data-i18n-aria="chrome.primary">
        <button type="button" class="ui-round ui-round--avatar chrome__nav" data-action="home" aria-label="Adonay Lizardo">AL</button>
        ${roundBtn('briefcase', 'Casos', 'chrome__nav', 'cases')}
        ${roundBtn('trophy', 'Logros', 'chrome__nav', 'achievements')}
        ${roundBtn('mail', 'Contacto', 'chrome__nav', 'contact')}
        ${roundBtn('search', 'Buscar', 'chrome__nav', 'search')}
        <span class="chrome__rail-spacer"></span>
        <div class="chrome__tools-stack">
          ${roundBtn('download', 'Descargar CV', '', 'download')}
          ${roundBtn('sound', 'Sonido', '', 'sound')}
          ${roundBtn('page', 'Página completa', '', 'fullpage')}
        </div>
      </nav>
      <aside class="chrome__column" data-column>
        <header class="chrome__header">
          <p class="chrome__header-name">Adonay Lizardo</p>
          <div class="chrome__header-actions">
            ${roundBtn('expand', 'Panel only', '', 'panel-only')}
            ${roundBtn('close', 'Hide panel', '', 'hide-panel')}
          </div>
        </header>
        <div class="chrome__intro-body">
          <div class="chrome__lede">
            <h1 class="chrome__title" data-i18n="chrome.title">Líder de diseño con IA.</h1>
            <div class="chrome__skeleton-stack" aria-hidden="true">
              <span class="chrome__skeleton"></span>
              <span class="chrome__skeleton"></span>
              <span class="chrome__skeleton chrome__skeleton--half"></span>
            </div>
          </div>
          <div class="chrome__ctas">
            <a class="ui-btn ui-btn--primary" href="${CV_HREF}" target="_blank" rel="noopener noreferrer">${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span></a>
            <a class="ui-btn ui-btn--secondary" href="${CONTACT_HREF}">${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span></a>
            <button type="button" class="ui-btn ui-btn--secondary" data-action="reading">${iconSvg('page')} <span data-i18n="read.title">Leer</span></button>
          </div>
          <div class="chrome__audience">
            <p class="chrome__label" data-i18n="chrome.who">¿Quién eres?</p>
            <div class="ui-seg" role="tablist" aria-label="Audience" data-i18n-aria="chrome.audience">
              <button type="button" class="ui-seg__opt is-active" data-audience="recruiter">Recruiter</button>
              <button type="button" class="ui-seg__opt" data-audience="mentoria" data-i18n="chrome.mentorship">Mentoría</button>
              <button type="button" class="ui-seg__opt" data-audience="cliente" data-i18n="chrome.client">Cliente</button>
            </div>
          </div>
          <section class="chrome__section" id="chrome-experiencia">
            <h2 data-i18n="chrome.experience">Experiencia</h2>
            <div class="chrome__exp">${expRows}</div>
          </section>
          <section class="chrome__section" id="chrome-logros">
            <div class="chrome__section-head">
              <h2 data-i18n="chrome.achievements">Logros</h2>
              <button type="button" class="ui-btn ui-btn--secondary ui-btn--small" data-i18n="chrome.seeAll">Ver todos</button>
            </div>
            <div class="chrome__logros">
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.mentorshipStat">Mentoría: 30+ personas</p>
              </div>
              <div class="chrome__logro chrome__logro--empty">
                <div class="chrome__logro-art">?</div>
                <p data-i18n="chrome.comingSoon">Coming soon</p>
              </div>
              <div class="chrome__logro chrome__logro--empty">
                <div class="chrome__logro-art">?</div>
                <p data-i18n="chrome.comingSoon">Coming soon</p>
              </div>
            </div>
          </section>
          <section class="chrome__section" id="chrome-casos">
            <h2 data-i18n="chrome.cases">Casos</h2>
            <div class="chrome__cases">${caseRows}</div>
          </section>
        </div>
      </aside>
      <button type="button" class="chrome__tab" data-action="show-panel" aria-label="Show panel">${iconSvg('chevron')}</button>
      <div class="chrome__tools-phone">
        ${roundBtn('search', 'Buscar', '', 'search')}
        ${roundBtn('sound', 'Sonido', '', 'sound')}
        ${roundBtn('locate', 'Center on Adonay', '', 'center')}
      </div>
      <div class="chrome__intro" data-intro>
        <button type="button" class="chrome__intro-close" data-action="intro-close" aria-label="Close" data-i18n-aria="jac.close">${iconSvg('close')}</button>
        <div class="chrome__lede">
          <h1 class="chrome__title" data-i18n="chrome.title">Líder de diseño con IA.</h1>
          <div class="chrome__skeleton-stack" aria-hidden="true">
            <span class="chrome__skeleton"></span>
            <span class="chrome__skeleton chrome__skeleton--half"></span>
          </div>
        </div>
        <div class="chrome__audience">
          <p class="chrome__label" data-i18n="chrome.who">¿Quién eres?</p>
          <div class="ui-seg ui-seg--phone" role="tablist" aria-label="Audience" data-i18n-aria="chrome.audience">
            <button type="button" class="ui-seg__opt is-active" data-audience="recruiter">Recruiter</button>
            <button type="button" class="ui-seg__opt" data-audience="mentoria" data-i18n="chrome.mentorship">Mentoría</button>
            <button type="button" class="ui-seg__opt" data-audience="cliente" data-i18n="chrome.client">Cliente</button>
          </div>
        </div>
        <div class="chrome__ctas">
          <a class="ui-btn ui-btn--primary" href="${CV_HREF}" target="_blank" rel="noopener noreferrer">${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span></a>
          <a class="ui-btn ui-btn--secondary" href="${CONTACT_HREF}">${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span></a>
          <button type="button" class="ui-btn ui-btn--secondary" data-action="reading">${iconSvg('page')} <span data-i18n="read.title">Leer</span></button>
        </div>
        <div class="chrome__card-row">
          <div class="chrome__card-id">
            <span class="chrome__mono">AL</span>
            <span>
              <strong>Adonay Lizardo</strong>
              <small data-i18n="chrome.titleShort">Líder de diseño con IA</small>
            </span>
          </div>
          <button type="button" class="ui-btn ui-btn--secondary" data-details data-i18n="chrome.details">Detalles</button>
        </div>
      </div>
      <nav class="chrome__dock" aria-label="Dock" data-i18n-aria="chrome.dock">
        <button type="button" class="ui-round ui-round--lg ui-round--avatar" data-dock="intro" aria-label="Adonay">AL</button>
        ${roundBtn('briefcase', 'Casos', 'ui-round--lg', 'cases')}
        ${roundBtn('trophy', 'Logros', 'ui-round--lg', 'achievements')}
        ${roundBtn('mail', 'Contacto', 'ui-round--lg', 'contact')}
        ${roundBtn('map', 'Map', 'ui-round--lg', 'map')}
      </nav>
      <div class="chrome__lang" role="group" aria-label="Language" data-i18n-aria="chrome.language">
        <button type="button" class="chrome__lang-opt" data-lang="en">EN</button>
        <button type="button" class="chrome__lang-opt is-active" data-lang="es">ES</button>
      </div>
      <div class="chrome__sound" role="note" data-hint="1">
        ${iconSvg('info')}
        <span data-i18n="chrome.soundHint">No sound? Check silent mode</span>
      </div>
      <p class="chrome__subtitle"></p>
      <div class="chrome__views" data-views>
        <div class="chrome__minimap-wrap">
          <canvas class="chrome__minimap" width="248" height="161" aria-hidden="true"></canvas>
          ${roundBtn('locate', 'Center on Adonay', 'chrome__locate', 'center')}
        </div>
        <div class="chrome__view-btns">
          <button type="button" class="ui-view" data-view="rotate" aria-label="Rotate" data-i18n-aria="chrome.rotate">${iconSvg('rotate')}</button>
          <button type="button" class="ui-view is-active" data-view="isometrica" aria-label="Isometric" data-i18n-aria="chrome.isometric">${iconSvg('cube')}</button>
          <button type="button" class="ui-view" data-view="cenital" aria-label="Top-down" data-i18n-aria="chrome.topdown">${iconSvg('grid')}</button>
          <button type="button" class="ui-view" data-view="perspectiva" aria-label="Perspective" data-i18n-aria="chrome.perspective">${iconSvg('persp')}</button>
          <button type="button" class="ui-view" data-view="map" aria-label="Map overview" data-i18n-aria="chrome.map">${iconSvg('map')}</button>
        </div>
      </div>
    `;
  }

  private bind(): void {
    this.root.querySelectorAll('[data-action="reading"]').forEach((btn) => {
      btn.addEventListener('click', () => this.callbacks.onReadingOpen?.());
    });
    this.root.querySelector('[data-action="panel-only"]')?.addEventListener('click', () => {
      if (this.callbacks.onReadingOpen) this.callbacks.onReadingOpen();
      else this.setLayout('panel');
    });
    this.root.querySelector('[data-action="hide-panel"]')?.addEventListener('click', () => this.setLayout('map'));
    this.root.querySelector('[data-action="show-panel"]')?.addEventListener('click', () => this.setLayout('split'));
    this.root.querySelector('[data-action="intro-close"]')?.addEventListener('click', () => this.setLayout('map'));
    this.root.querySelector('[data-details]')?.addEventListener('click', () => {
      this.root.querySelector('.chrome__intro')?.classList.toggle('chrome__intro--expanded');
    });
    this.root.querySelector('[data-action="home"]')?.addEventListener('click', () => {
      this.setLayout('split');
      this.scrollTo('#chrome-experiencia');
    });
    this.root.querySelectorAll('[data-audience]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audience = (btn as HTMLElement).dataset.audience as Audience;
        this.syncAudience();
      });
    });
    this.root.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.lang = (btn as HTMLElement).dataset.lang as Lang;
        setLang(this.lang);
      });
    });
    this.root.querySelectorAll('[data-locate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.locate;
        if (id) this.callbacks.onLocate(id);
      });
    });
    this.root.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = (btn as HTMLElement).dataset.view;
        if (v === 'rotate') this.callbacks.onRotate();
        else if (v === 'map') this.callbacks.onMapOverview();
        else this.callbacks.onView(v as Camera);
      });
    });
    this.root.querySelectorAll('[data-action="center"]').forEach((btn) => {
      btn.addEventListener('click', () => this.callbacks.onCenter());
    });
    this.root.querySelector('[data-dock="intro"]')?.addEventListener('click', () => this.setLayout('split'));
    this.root.querySelector('.chrome__dock [data-action="cases"]')?.addEventListener('click', () => {
      this.setLayout('split');
    });
    this.root.querySelector('.chrome__dock [data-action="achievements"]')?.addEventListener('click', () => {
      this.setLayout('split');
    });
    this.root.querySelector('.chrome__dock [data-action="contact"]')?.addEventListener('click', () => {
      studio.playLine('11-contact');
      this.callbacks.onLocate('contacto');
    });
    this.root.querySelector('.chrome__dock [data-action="map"]')?.addEventListener('click', () => this.setLayout('map'));
    this.root.querySelector('.chrome__rail [data-action="cases"]')?.addEventListener('click', () => {
      this.setLayout('split');
      this.scrollTo('#chrome-casos');
    });
    this.root.querySelector('.chrome__rail [data-action="achievements"]')?.addEventListener('click', () => {
      this.setLayout('split');
      this.scrollTo('#chrome-logros');
    });
    this.root.querySelector('.chrome__rail [data-action="contact"]')?.addEventListener('click', () => {
      studio.playLine('11-contact');
      this.callbacks.onLocate('contacto');
    });
    this.root.querySelector('[data-action="fullpage"]')?.addEventListener('click', () => {
      if (this.callbacks.onReadingOpen && this.callbacks.onReadingClose) {
        if (document.body.dataset.reading === '1') this.callbacks.onReadingClose();
        else this.callbacks.onReadingOpen();
        return;
      }
      if (this.layout === 'panel') this.setLayout('split');
      else this.setLayout('panel');
    });
    this.root.querySelector('[data-action="download"]')?.addEventListener('click', () => {
      window.open(CV_HREF, '_blank', 'noopener,noreferrer');
    });
    this.root.querySelectorAll('[data-action="sound"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        studio.toggleMute();
      });
    });
    this.syncSound();
    this.root.querySelectorAll(`a[href="${CONTACT_HREF}"]`).forEach((a) => {
      a.addEventListener('click', () => studio.playLine('11-contact'));
    });
    this.syncSubtitle();
  }

  private syncSubtitle(): void {
    const sub = this.root.querySelector('.chrome__subtitle') as HTMLElement | null;
    if (!sub) return;
    sub.textContent = studio.subtitle();
  }

  /** 'No sound? Check silent mode' is a boot hint — fade out after ~4s, then stay gone. */
  beginSoundHint(): void {
    this.scheduleSoundHint();
  }

  private scheduleSoundHint(): void {
    const el = this.root.querySelector('.chrome__sound') as HTMLElement | null;
    if (!el || this.soundHintTimer) return;
    el.dataset.hint = '1';
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visibleMs = 4000;
    const fadeMs = reduced ? 0 : 400;
    this.soundHintTimer = window.setTimeout(() => {
      if (reduced) {
        el.hidden = true;
      } else {
        el.classList.add('chrome__sound--fade');
      }
      el.dataset.hint = '0';
      el.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => {
        el.hidden = true;
      }, fadeMs);
    }, visibleMs);
  }

  private syncSound(): void {
    const muted = studio.isMuted();
    this.root.querySelectorAll('[data-action="sound"]').forEach((btn) => {
      const el = btn as HTMLElement;
      el.setAttribute('aria-pressed', muted ? 'false' : 'true');
      el.dataset.icon = muted ? 'sound' : 'soundOn';
      el.innerHTML = iconSvg(muted ? 'sound' : 'soundOn');
    });
  }

  private applyI18n(): void {
    this.lang = getLang();
    document.documentElement.lang = this.lang;
    this.root.querySelectorAll('[data-lang]').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.lang === this.lang);
    });
    this.root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
    this.root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18nAria as Parameters<typeof t>[0];
      if (key) el.setAttribute('aria-label', t(key));
    });
    const ariaByAction: Record<string, Parameters<typeof t>[0]> = {
      cases: 'chrome.cases',
      achievements: 'chrome.achievements',
      contact: 'chrome.contact',
      search: 'chrome.search',
      download: 'chrome.downloadCv',
      sound: 'chrome.sound',
      fullpage: 'chrome.fullPage',
      'panel-only': 'chrome.panelOnly',
      'hide-panel': 'chrome.hidePanel',
      'show-panel': 'chrome.showPanel',
      center: 'chrome.center',
      map: 'chrome.map',
    };
    this.root.querySelectorAll('[data-action]').forEach((el) => {
      const key = ariaByAction[(el as HTMLElement).dataset.action ?? ''];
      if (key) el.setAttribute('aria-label', t(key));
    });
  }

  private scrollTo(sel: string): void {
    this.root.querySelector(sel)?.scrollIntoView({ block: 'start' });
  }

  private syncAudience(): void {
    this.root.querySelectorAll('[data-audience]').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.audience === this.audience);
    });
  }

  sync(opts?: { deferColumn?: boolean }): void {
    this.mobile = isMobileLayout();
    const layout = this.mobile ? (this.mobileSheet ? 'split' : 'map') : this.layout;
    document.body.dataset.layout = layout;
    document.body.dataset.chrome = this.mobile ? 'phone' : 'desktop';
    document.body.dataset.interior = this.interiorOpen ? '1' : '0';
    this.root.dataset.layout = layout;
    this.root.classList.toggle('chrome--mobile', this.mobile);
    this.root.classList.toggle('chrome--interior', this.interiorOpen);
    this.root.classList.toggle('chrome--sheet', this.mobile && this.mobileSheet && !this.interiorOpen);
    this.root.classList.toggle('chrome--dock', this.mobile && !this.mobileSheet && !this.interiorOpen);
    this.root.classList.toggle('chrome--map', !this.mobile && this.layout === 'map');
    this.root.classList.toggle('chrome--panel', !this.mobile && this.layout === 'panel');
    this.root.classList.toggle('chrome--split', !this.mobile && this.layout === 'split');
    this.syncSound();
    if (opts?.deferColumn) return;
    const col = this.root.querySelector('.chrome__column') as HTMLElement | null;
    if (col) {
      // Inline display wins over `.chrome--split { display:block }`, so innerText
      // Hide the intro column while a case interior is open.
      col.style.display = this.interiorOpen ? 'none' : '';
      col.hidden = this.interiorOpen;
      col.setAttribute('aria-hidden', this.interiorOpen ? 'true' : 'false');
    }
  }

  private syncViewButtons(): void {
    const v = this.getView();
    this.root.querySelectorAll('[data-view]').forEach((btn) => {
      const key = (btn as HTMLElement).dataset.view;
      if (key !== 'rotate' && key !== 'map') btn.classList.toggle('is-active', key === v.mode);
      if (key === 'map') btn.classList.toggle('is-active', v.overview);
    });
  }

  private placeSubtitle(): void {
    const sub = this.root.querySelector('.chrome__subtitle') as HTMLElement | null;
    if (!sub) return;
    if (this.mobile && this.mobileSheet && !this.interiorOpen) {
      const intro = this.root.querySelector('.chrome__intro') as HTMLElement | null;
      const r = intro?.getBoundingClientRect();
      if (r && r.height > 8) {
        sub.style.bottom = `${Math.max(12, window.innerHeight - r.top + 8)}px`;
        sub.style.top = 'auto';
        return;
      }
    }
    sub.style.bottom = '';
    sub.style.top = '';
  }

  private placeLang(): void {
    const lang = this.root.querySelector('.chrome__lang') as HTMLElement | null;
    if (!lang) return;
    const shortLand = window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
    if (shortLand) {
      lang.style.top = '12px';
      lang.style.left = '16px';
      lang.style.right = 'auto';
      return;
    }
    lang.style.left = '';
    const cl = document.querySelector('.checklist') as HTMLElement | null;
    const ring = cl && !cl.hidden ? cl.getBoundingClientRect() : null;
    if (ring && ring.width > 8) {
      const top = Math.max(this.mobile ? 24 : 16, ring.top + (ring.height - 40) / 2);
      const right = Math.max(16, window.innerWidth - ring.left + 8);
      lang.style.top = `${top}px`;
      lang.style.right = `${right}px`;
      return;
    }
    lang.style.top = this.mobile ? '24px' : '20px';
    lang.style.right = '16px';
  }

  private drawMinimap(): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const w = this.minimap.width;
    const h = this.minimap.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0B0C0E';
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w - 4, h / 2);
    ctx.lineTo(w / 2, h - 4);
    ctx.lineTo(4, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2A2C31';
    ctx.stroke();

    const buildings = getEnterableBuildings();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const pts = buildings.map((b) => {
      const p = tileToWorld(b.x + (b.w ?? 1) / 2, b.y + (b.h ?? 1) / 2);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      return { b, p };
    });
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const pad = 28;
    const sx = (w - pad * 2) / spanX;
    const sy = (h - pad * 2) / spanY;
    const map = (x: number, y: number) => ({
      x: pad + (x - minX) * sx,
      y: pad + (y - minY) * sy,
    });
    ctx.fillStyle = '#24262B';
    for (const { p } of pts) {
      const s = map(p.x, p.y);
      ctx.fillRect(s.x - 4, s.y - 3, 8, 6);
    }
    const t = this.getCharTile();
    const c = map(tileToWorld(t.x, t.y).x, tileToWorld(t.x, t.y).y);
    ctx.fillStyle = '#EDEEF0';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

