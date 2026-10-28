import { studio } from '../audio/studio';
import { CASES, CASE_CARD_TITLES, type CaseHouseId } from '../data/cases';
import { getEnterableBuildings } from '../data/map';
import { tileToWorld } from '../iso/math';
import { isMobileLayout } from '../checklist/ui';
import { CV_HREF } from '../data/contactLinks';
import { personaEnabled } from '../game/persona/personaSpec';
import { iconSvg, type IconName } from './icons';
import type { Camera } from '../tokens';
import { getLang, onLangChange, setLang, t, type Lang } from './i18n';
import { chromeSectionSelector, mountChromeExperienceSections } from './chromeExperienceSections';

export type AdonaySection = 'articulos' | 'charlas' | 'casos' | 'logros' | 'contact' | 'intro';

export type AboutPanelOpenOpts = {
  highlightContact?: boolean;
  sectionId?: string;
};

export type DesktopLayout = 'split' | 'map' | 'panel';
export type Audience = 'recruiter' | 'mentoria' | 'cliente';
export type { Lang };

export type ChromeLayoutChangeOpts = {
  /** Keep map camera when the phone sheet opens (Logros/Casos). */
  preserveMapCamera?: boolean;
  /** Skip the synthetic click blip (map overlay / programmatic layout). */
  silent?: boolean;
};

export type ChromeCallbacks = {
  onLayoutChange: (opts?: ChromeLayoutChangeOpts) => void;
  onView: (mode: Camera) => void;
  onRotate: () => void;
  onMapOverview: () => void;
  onCenter: () => void;
  onLocate: (buildingId: string) => void;
  onOpenAbout: (opts?: AboutPanelOpenOpts) => void;
  onOpenSearch: () => void;
  onOpenArticles: () => void;
  onOpenTalks: () => void;
  onOpenWritingDetail: (itemId: string) => void;
  onOpenTalkDetail: (talkId: string) => void;
  onReadingOpen?: () => void;
  onReadingClose?: () => void;
};

const EXPERIENCE: { id: CaseHouseId; label: string }[] = [
  { id: 'volaris', label: CASE_CARD_TITLES.volaris },
  { id: 'bain', label: CASE_CARD_TITLES.bain },
  { id: 'mentoria', label: 'Mentoring at Applaudo' },
  { id: 'finoa', label: CASE_CARD_TITLES.finoa },
  { id: 'pg', label: CASE_CARD_TITLES.pg },
];

const CASES_ROWS: { id: CaseHouseId; label: string }[] = [
  { id: 'volaris', label: CASE_CARD_TITLES.volaris },
  { id: 'bain', label: CASE_CARD_TITLES.bain },
  { id: 'mentoria', label: 'Mentoring at Applaudo' },
  { id: 'finoa', label: CASE_CARD_TITLES.finoa },
  { id: 'pg', label: CASE_CARD_TITLES.pg },
];

function caseRowSummary(id: CaseHouseId): string {
  const content = CASES[id];
  return content?.subtitle ?? content?.shortHeadline ?? '';
}

const MOBILE_SHEET_STORAGE_KEY = 'portfolio-playtest-mobile-sheet';

function isLandscapePhone(): boolean {
  return (
    isMobileLayout() &&
    window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches
  );
}

function roundBtn(icon: IconName, label: string, extra = '', action?: string): string {
  const act = action ? ` data-action="${action}"` : '';
  return `<button type="button" class="ui-round ${extra}" data-icon="${icon}"${act} aria-label="${label}">${iconSvg(icon)}</button>`;
}

export class ChromeUI {
  readonly root: HTMLElement;
  /** Voice caption; may be portaled to `document.body` while About is open. */
  private subtitleEl: HTMLElement;
  private layout: DesktopLayout = 'map';
  private mobileSheet = true;
  private mobileSheetPanel: 'intro' | 'casos' | 'logros' | 'contact' | 'articulos' | 'charlas' = 'intro';
  private audience: Audience = 'recruiter';
  private lang: Lang = getLang();
  private interiorOpen = false;
  private placeCardOpen = false;
  private mobile = isMobileLayout();
  private callbacks: ChromeCallbacks;
  private minimap: HTMLCanvasElement;
  private soundHintTimer: ReturnType<typeof setTimeout> | null = null;
  private soundHintDismissed = false;
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
    this.subtitleEl = this.root.querySelector('.chrome__subtitle') as HTMLElement;
    this.minimap = this.root.querySelector('.chrome__minimap') as HTMLCanvasElement;
    this.bind();
    mountChromeExperienceSections(this.root, {
      onTalk: (id) => this.callbacks.onOpenTalkDetail(id),
      onWriting: (id) => this.callbacks.onOpenWritingDetail(id),
    });
    this.applyI18n();
    onLangChange(() => this.applyI18n());
    if (this.shortLandscape()) this.mobileSheet = false;
    this.sync();
    studio.onChange(() => {
      this.syncSound();
      this.syncSubtitle();
    });
    const onLayout = () => {
      this.mobile = isMobileLayout();
      if (this.shortLandscape()) this.mobileSheet = false;
      this.sync();
      this.callbacks.onLayoutChange();
    };
    window.matchMedia('(max-width: 767px)').addEventListener('change', onLayout);
    window.matchMedia('(max-height: 500px)').addEventListener('change', onLayout);
    window.matchMedia('(orientation: landscape)').addEventListener('change', onLayout);
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

  phoneChecklistHost(): HTMLElement {
    return this.root.querySelector('[data-phone-checklist-host]') as HTMLElement;
  }

  isMobileSheetOpen(): boolean {
    return this.mobile && this.mobileSheet && !this.interiorOpen && !isLandscapePhone();
  }

  rememberMobileSheetBeforeReading(): void {
    try {
      sessionStorage.setItem(MOBILE_SHEET_STORAGE_KEY, this.mobileSheet ? '1' : '0');
    } catch {
      /* private mode */
    }
  }

  restoreMobileSheetAfterReading(): void {
    try {
      const v = sessionStorage.getItem(MOBILE_SHEET_STORAGE_KEY);
      if (v === '0') this.mobileSheet = false;
      else if (v === '1') this.mobileSheet = true;
      sessionStorage.removeItem(MOBILE_SHEET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.sync();
    this.callbacks.onLayoutChange({ silent: true });
  }

  expandIntroDetail(scrollTarget?: string): void {
    const intro = this.root.querySelector('.chrome__intro') as HTMLElement | null;
    const detail = this.root.querySelector('[data-intro-detail]') as HTMLElement | null;
    if (detail) detail.hidden = false;
    intro?.classList.add('chrome__intro--expanded');
    if (scrollTarget) this.scrollTo(scrollTarget);
  }

  setPlaceCardOpen(open: boolean, opts?: { skipLayout?: boolean }): void {
    this.placeCardOpen = open;
    if (open) document.body.dataset.placeCard = '1';
    else delete document.body.dataset.placeCard;
    if (!opts?.skipLayout) this.callbacks.onLayoutChange();
  }

  setInteriorOpen(open: boolean, opts?: { skipLayout?: boolean }): void {
    this.interiorOpen = open;
    if (open && this.mobile) this.mobileSheet = false;
    if (open && !this.mobile && this.layout === 'map') this.layout = 'split';
    this.sync({ deferColumn: !!opts?.skipLayout && !open });
    if (!opts?.skipLayout) this.callbacks.onLayoutChange();
  }

  setLayout(next: DesktopLayout, opts?: ChromeLayoutChangeOpts): void {
    if (this.mobile) {
      this.mobileSheet = next !== 'map';
      if (this.shortLandscape()) this.mobileSheet = false;
    } else {
      this.layout = next;
    }
    this.sync();
    if (!opts?.silent) studio.playClick();
    this.callbacks.onLayoutChange(opts);
  }

  /** Close the phone intro / About sheet so a single map overlay (ficha, case, etc.) is visible. */
  dismissMobileIntroSheet(opts?: { silent?: boolean }): void {
    if (!this.mobile || !this.mobileSheet) return;
    this.mobileSheet = false;
    this.sync();
    if (!opts?.silent) studio.playClick();
    this.callbacks.onLayoutChange({ silent: true });
  }

  private isLandscapeSideSheet(): boolean {
    return (
      window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches &&
      window.innerWidth >= 768
    );
  }

  private isPhonePortrait(): boolean {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
  }

  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (this.interiorOpen) {
      return this.mobile ? { left: 0, top: 0, right: 0, bottom: 0 } : { left: 64, top: 0, right: 0, bottom: 0 };
    }
    if (this.mobile) {
      if (isLandscapePhone() && this.mobileSheet) {
        const col = this.root.querySelector('.chrome__column')?.getBoundingClientRect();
        const left = col && col.width > 8 ? Math.ceil(col.right + 8) : 320;
        return { left, top: 16, right: 16, bottom: 24 };
      }
      if (this.mobileSheet) {
        const sheet = this.root.querySelector('.chrome__intro')?.getBoundingClientRect();
        if (sheet && sheet.width > 8 && this.isLandscapeSideSheet()) {
          return {
            left: 0,
            top: 12,
            right: Math.ceil(window.innerWidth - sheet.left + 8),
            bottom: 12,
          };
        }
        const bottom = sheet ? Math.ceil(window.innerHeight - sheet.top + 8) : 280;
        return { left: 0, top: 12, right: 0, bottom };
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
        <span class="chrome__exp-copy">
          <span class="chrome__exp-name"${row.id === 'mentoria' ? ' data-i18n="chrome.expRow.mentoria"' : ''}>${row.id === 'mentoria' ? 'Mentoring at Applaudo' : row.label}</span>
          <span class="chrome__exp-role" data-i18n="chrome.expRole.${row.id}"></span>
        </span>
        <span class="chrome__exp-date" data-i18n="chrome.expDate.${row.id}"></span>
        <span class="chrome__exp-side" aria-hidden="true">${iconSvg('locate', 16)}</span>
      </button>`,
    ).join('');
    const caseRows = CASES_ROWS.map((row) => {
      return `
      <button type="button" class="chrome__case-row" data-locate="${row.id}">
        <span class="chrome__case-thumb">${iconSvg('map')}</span>
        <span class="chrome__case-copy">
          <span class="chrome__case-title"${row.id === 'mentoria' ? ' data-i18n="chrome.expRow.mentoria"' : ''}>${row.id === 'mentoria' ? 'Mentoring at Applaudo' : row.label}</span>
          <span class="chrome__case-subtitle" data-i18n="chrome.caseSub.${row.id}">${caseRowSummary(row.id)}</span>
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
          <button type="button" class="ui-round chrome__lang-toggle chrome__lang-toggle--rail" data-action="lang-toggle" aria-label="Language" data-i18n-aria="chrome.language"><span data-lang-toggle-label-rail>ES</span></button>
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
            <p class="chrome__blurb" data-i18n="chrome.lede">Explore the map, open cases from the doors, and browse talks and writings inside the buildings.</p>
          </div>
          <div class="chrome__ctas" id="chrome-contact">
            <a class="ui-btn ui-btn--primary" href="${CV_HREF}" target="_blank" rel="noopener noreferrer" download>${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span></a>
            <button type="button" class="ui-btn ui-btn--secondary" data-action="about-contact">${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span></button>
            <button type="button" class="ui-btn ui-btn--secondary" data-action="reading">${iconSvg('page')} <span data-i18n="read.title">Leer</span></button>
          </div>
          <div class="chrome__audience">
            <p class="chrome__label" data-i18n="chrome.who">¿Quién eres?</p>
            <div class="ui-seg" role="tablist" aria-label="Audience" data-i18n-aria="chrome.audience">
              <button type="button" class="ui-seg__opt is-active" data-audience="recruiter" data-i18n="chrome.recruiter">Recruiter</button>
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
                <p data-i18n="chrome.achievement1">Main speaker at Innova360, 200+ students</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement2">Proposed and lead the Bain Designers Guild</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement3">AI Transformation Lead, 5/7 phases</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement4">ADPList 2023: 31 sessions, 15 countries</p>
              </div>
            </div>
          </section>
          <section class="chrome__section" id="chrome-casos">
            <h2 data-i18n="chrome.cases">Casos</h2>
            <div class="chrome__cases">${caseRows}</div>
          </section>
          <section class="chrome__section chrome__section--content" id="chrome-articulos" data-chrome-section="articulos">
            <div class="chrome__section-head-inline">
              <h2 data-i18n="panel.writings">Artículos</h2>
              <span class="chrome__section-meta" data-section-count aria-hidden="true"></span>
            </div>
            <div class="chrome__content-list" data-chrome-articulos-list></div>
          </section>
          <section class="chrome__section chrome__section--content" id="chrome-charlas" data-chrome-section="charlas">
            <div class="chrome__section-head-inline">
              <h2 data-i18n="panel.talks">Charlas</h2>
              <span class="chrome__section-meta" data-section-count aria-hidden="true"></span>
            </div>
            <div class="chrome__content-list" data-chrome-charlas-list></div>
          </section>
        </div>
      </aside>
      <button type="button" class="chrome__tab" data-action="show-panel" aria-label="Show panel">${iconSvg('chevron')}</button>
      <header class="chrome__phone-topbar" data-phone-topbar>
        <div class="chrome__tools-phone">
          ${roundBtn('search', 'Buscar', '', 'search')}
          <button type="button" class="ui-round chrome__lang-toggle" data-action="lang-toggle" aria-label="Language" data-i18n-aria="chrome.language"><span data-lang-toggle-label>ES</span></button>
        </div>
        <div class="chrome__phone-topbar-checklist" data-phone-checklist-host></div>
      </header>
      ${roundBtn('locate', 'Center on Adonay', 'chrome__map-recenter', 'center')}
      <div class="chrome__intro" data-intro>
        <div class="chrome__intro-pinned" data-intro-pinned>
          <div class="chrome__sheet-grab" data-intro-grab aria-hidden="true"><span></span></div>
          <div class="chrome__intro-title-row">
            <h1 class="chrome__title" data-i18n="chrome.title">Líder de diseño con IA.</h1>
            <div class="chrome__intro-title-actions">
              ${roundBtn('sound', 'Sonido', 'chrome__intro-sound', 'sound')}
              <button type="button" class="chrome__intro-close" data-action="intro-close" data-i18n-aria="jac.close" aria-label="Close">${iconSvg('close')}</button>
            </div>
          </div>
        </div>
        <div class="chrome__intro-toolbar" data-intro-toolbar hidden>
          <div class="chrome__intro-lang-host" data-intro-lang-host></div>
        </div>
        <div class="chrome__lede">
          <p class="chrome__blurb" data-i18n="chrome.lede">Explore the map, open cases from the doors, and browse talks and writings inside the buildings.</p>
        </div>
        <div class="chrome__audience">
          <p class="chrome__label" data-i18n="chrome.who">¿Quién eres?</p>
          <div class="ui-seg ui-seg--phone" role="tablist" aria-label="Audience" data-i18n-aria="chrome.audience">
            <button type="button" class="ui-seg__opt is-active" data-audience="recruiter" data-i18n="chrome.recruiter">Recruiter</button>
            <button type="button" class="ui-seg__opt" data-audience="mentoria" data-i18n="chrome.mentorship">Mentoría</button>
            <button type="button" class="ui-seg__opt" data-audience="cliente" data-i18n="chrome.client">Cliente</button>
          </div>
        </div>
        <div class="chrome__ctas">
          <a class="ui-btn ui-btn--primary" href="${CV_HREF}" target="_blank" rel="noopener noreferrer" download>${iconSvg('download')} <span data-i18n="chrome.downloadCv">Descargar CV</span></a>
          <button type="button" class="ui-btn ui-btn--secondary" data-action="about-contact">${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span></button>
          <button type="button" class="ui-btn ui-btn--secondary" data-action="reading">${iconSvg('page')} <span data-i18n="read.title">Leer</span></button>
        </div>
        <div class="chrome__card-row">
          <div class="chrome__card-id">
            <span class="chrome__mono">AL</span>
            <span class="chrome__card-id-text">
              <strong>Adonay Lizardo</strong>
              <small data-i18n="chrome.titleShort">Líder de diseño con IA</small>
            </span>
          </div>
          <button type="button" class="ui-btn ui-btn--primary chrome__see-details" data-details data-i18n="chrome.seeDetails">Ver detalles</button>
        </div>
        <div class="chrome__sheet-body chrome__sheet-body--collapsed" data-sheet-body data-intro-detail>
          <section class="chrome__section" id="chrome-experiencia-mobile">
            <h2 data-i18n="chrome.experience">Experiencia</h2>
            <div class="chrome__exp">${expRows}</div>
          </section>
          <section class="chrome__section" id="chrome-mobile-logros">
            <div class="chrome__section-head">
              <h2 data-i18n="chrome.achievements">Logros</h2>
            </div>
            <div class="chrome__logros">
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement1">Speaker principal de Innova360, 200+ estudiantes</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement2">Propuse y lidero el Bain Designers Guild</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement3">AI Transformation Lead, 5/7 fases</p>
              </div>
              <div class="chrome__logro">
                <div class="chrome__logro-art">${iconSvg('trophy', 22)}</div>
                <p data-i18n="chrome.achievement4">ADPList 2023: 31 sesiones, 15 países</p>
              </div>
            </div>
          </section>
          <section class="chrome__section" id="chrome-mobile-casos">
            <h2 data-i18n="chrome.cases">Casos</h2>
            <div class="chrome__cases">${caseRows}</div>
          </section>
          <section class="chrome__section chrome__section--content" id="chrome-mobile-articulos" data-chrome-section="articulos">
            <div class="chrome__section-head-inline">
              <h2 data-i18n="panel.writings">Artículos</h2>
              <span class="chrome__section-meta" data-section-count aria-hidden="true"></span>
            </div>
            <div class="chrome__content-list" data-chrome-articulos-list></div>
          </section>
          <section class="chrome__section chrome__section--content" id="chrome-mobile-charlas" data-chrome-section="charlas">
            <div class="chrome__section-head-inline">
              <h2 data-i18n="panel.talks">Charlas</h2>
              <span class="chrome__section-meta" data-section-count aria-hidden="true"></span>
            </div>
            <div class="chrome__content-list" data-chrome-charlas-list></div>
          </section>
          <div class="chrome__sheet-contact" id="chrome-mobile-contact">
            <button type="button" class="ui-btn ui-btn--secondary" data-action="about-contact">${iconSvg('mail')} <span data-i18n="chrome.contact">Contacto</span></button>
          </div>
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
      <p class="chrome__subtitle" id="voice-subtitle" data-voice-subtitle></p>
      <div class="chrome__views" data-views>
        <div class="chrome__minimap-wrap">
          <canvas class="chrome__minimap" width="248" height="161" aria-hidden="true"></canvas>
          ${roundBtn('locate', 'Center on Adonay', 'chrome__locate', 'center')}
        </div>
        <div class="chrome__view-btns">
          <button type="button" class="ui-view" data-view="rotate" aria-label="Rotate" data-i18n-aria="chrome.rotate">${iconSvg('rotate')}</button>
          <button type="button" class="ui-view is-active" data-view="isometrica" aria-label="Isometric" data-i18n-aria="chrome.isometric">${iconSvg('cube')}</button>
          <button type="button" class="ui-view" data-view="cenital" aria-label="Top-down" data-i18n-aria="chrome.topdown">${iconSvg('grid')}</button>
          ${
            personaEnabled()
              ? `<button type="button" class="ui-view" data-view="persona" aria-label="Over-the-shoulder" data-i18n-aria="chrome.persona">${iconSvg('persp')}</button>`
              : ''
          }
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
      this.setLayout('panel');
    });
    this.root.querySelector('[data-action="hide-panel"]')?.addEventListener('click', () => this.setLayout('map'));
    this.root.querySelector('[data-action="show-panel"]')?.addEventListener('click', () => this.setLayout('split'));
    this.root.querySelector('[data-action="intro-close"]')?.addEventListener('click', () => {
      const intro = this.root.querySelector('.chrome__intro');
      if (intro?.classList.contains('chrome__intro--expanded')) {
        this.expandMobileSheet(false);
        return;
      }
      this.setLayout('map');
    });
    this.root.querySelector('[data-details]')?.addEventListener('click', () => {
      this.root.classList.add('chrome--intro-detail-seen');
      this.expandMobileSheet(true);
    });
    this.bindMobileSheetGestures();
    this.root.querySelector('[data-action="home"]')?.addEventListener('click', () => {
      this.openAboutPanel();
    });
    this.root.querySelectorAll('[data-action="about-contact"]').forEach((btn) => {
      btn.addEventListener('click', () => this.openContact());
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
    this.root.querySelectorAll('[data-action="lang-toggle"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = getLang() === 'es' ? 'en' : 'es';
        this.lang = next;
        setLang(next);
        this.applyI18n();
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
        (btn as HTMLElement).blur();
        const v = (btn as HTMLElement).dataset.view;
        if (v === 'rotate') this.callbacks.onRotate();
        else if (v === 'map') this.callbacks.onMapOverview();
        else this.callbacks.onView(v as Camera);
      });
    });
    this.root.querySelectorAll('[data-action="center"]').forEach((btn) => {
      btn.addEventListener('click', () => this.callbacks.onCenter());
    });
    this.root.querySelector('[data-dock="intro"]')?.addEventListener('click', () => {
      if (this.mobile) this.reopenMobileIntroPeek();
      else this.openAboutPanel();
    });
    this.root.querySelector('.chrome__dock [data-action="cases"]')?.addEventListener('click', () => {
      this.openMobileSheetSection('casos');
    });
    this.root.querySelector('.chrome__dock [data-action="achievements"]')?.addEventListener('click', () => {
      this.openMobileSheetSection('logros');
    });
    this.root.querySelector('.chrome__dock [data-action="contact"]')?.addEventListener('click', () => {
      this.openContact();
    });
    this.root.querySelector('.chrome__dock [data-action="map"]')?.addEventListener('click', () => {
      if (this.getView().mode === 'cenital') {
        this.callbacks.onMapOverview();
        return;
      }
      this.setLayout('map');
      this.callbacks.onMapOverview();
    });
    this.root.querySelector('.chrome__rail [data-action="cases"]')?.addEventListener('click', () => {
      this.setLayout('split');
      this.scrollTo('#chrome-casos');
    });
    this.root.querySelector('.chrome__rail [data-action="achievements"]')?.addEventListener('click', () => {
      this.setLayout('split');
      this.scrollTo('#chrome-logros');
    });
    this.root.querySelector('.chrome__rail [data-action="contact"]')?.addEventListener('click', () => {
      this.openContact();
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
    this.root.querySelectorAll('[data-action="search"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openSearch();
      });
    });
    this.root.querySelectorAll('[data-action="download"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.downloadCv();
      });
    });
    this.syncSound();
    this.syncSubtitle();
  }

  private subtitleElement(): HTMLElement {
    return (
      (document.getElementById('voice-subtitle') as HTMLElement | null) ??
      (document.querySelector('[data-voice-subtitle]') as HTMLElement | null) ??
      this.subtitleEl
    );
  }

  private syncSubtitle(): void {
    const sub = this.subtitleElement();
    if (!sub) return;
    const v = this.getView();
    const text = studio.subtitle();
    document.body.dataset.voiceContact = studio.subtitleVoiceId() === '11-contact' ? '1' : '0';
    if (v.mode === 'cenital' && text.startsWith('Hey, welcome')) {
      sub.classList.remove('chrome__subtitle--compact');
      sub.textContent = '';
      sub.hidden = true;
      sub.style.visibility = 'hidden';
      return;
    }
    const checklist = this.root.querySelector('.checklist') as HTMLElement | null;
    const checklistExpanded =
      checklist &&
      !checklist.hidden &&
      !checklist.classList.contains('checklist--collapsed') &&
      !checklist.classList.contains('checklist--mobile-closed');
    const checklistRect = checklistExpanded ? checklist.getBoundingClientRect() : null;
    const checklistBlocksTop =
      checklistRect &&
      checklistRect.height > 40 &&
      checklistRect.bottom > 48 &&
      !this.mobile;
    const blocksLabels =
      v.overview ||
      (v.mode === 'cenital' && (this.mobile || this.shortLandscape()));
    sub.classList.toggle('chrome__subtitle--compact', !!(blocksLabels && text));
    sub.hidden = !text;
    if (blocksLabels && text && !checklistBlocksTop) {
      sub.style.visibility = 'visible';
      sub.textContent = text;
      return;
    }
    if (blocksLabels && text && checklistBlocksTop) {
      sub.style.visibility = 'hidden';
      sub.textContent = text;
      return;
    }
    sub.style.visibility = text ? 'visible' : 'hidden';
    sub.textContent = text;
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
      this.soundHintDismissed = true;
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
    const toggleLabel = this.root.querySelector('[data-lang-toggle-label]');
    if (toggleLabel) toggleLabel.textContent = this.lang === 'es' ? 'ES' : 'EN';
    const railToggleLabel = this.root.querySelector('[data-lang-toggle-label-rail]');
    if (railToggleLabel) railToggleLabel.textContent = this.lang === 'es' ? 'ES' : 'EN';
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

  scrollToAdonaySection(section: AdonaySection): void {
    if (section === 'intro') return;
    if (this.mobile && this.mobileSheet) {
      this.mobileSheetPanel =
        section === 'articulos' || section === 'charlas' || section === 'casos' || section === 'logros'
          ? section
          : this.mobileSheetPanel;
      this.setLayout('split');
      this.expandMobileSheet(true, { full: true });
    } else if (!this.mobile) {
      this.setLayout('split');
    }
    const mobileSel =
      section === 'articulos'
        ? '#chrome-mobile-articulos'
        : section === 'charlas'
          ? '#chrome-mobile-charlas'
          : section === 'casos'
            ? '#chrome-mobile-casos, #chrome-casos'
            : section === 'logros'
              ? '#chrome-mobile-logros, #chrome-logros'
              : chromeSectionSelector(section).split(',')[0].trim();
    const desktopSel = `.chrome__column ${chromeSectionSelector(section).split(',')[0].trim()}`;
    const doScroll = () => {
      const target = this.mobile
        ? this.root.querySelector(mobileSel.split(',')[0].trim())
        : this.root.querySelector(desktopSel);
      const scrollHost = this.mobile
        ? (this.root.querySelector('.chrome__intro') as HTMLElement | null)
        : (this.root.querySelector('.chrome__column') as HTMLElement | null);
      if (!target || !scrollHost) return;
      const introExpanded =
        this.root.classList.contains('chrome--intro-expanded') ||
        this.root.classList.contains('chrome--intro-full');
      const topbar = this.root.querySelector('[data-phone-topbar]') as HTMLElement | null;
      const pinned = this.root.querySelector('[data-intro-pinned]') as HTMLElement | null;
      const hostRect = scrollHost.getBoundingClientRect();
      const pinnedRect = pinned?.getBoundingClientRect();
      const pinnedHead = pinned?.offsetHeight ?? 0;
      const headerInset = this.mobile
        ? introExpanded
          ? Math.max(
              Math.round((pinnedRect ? pinnedRect.bottom - hostRect.top : pinnedHead) + 12),
              72,
            )
          : Math.round(topbar?.getBoundingClientRect().height ?? 72) + 12
        : 77;
      if (this.mobile && introExpanded) {
        scrollHost.style.setProperty('--intro-sheet-scroll-margin', `${headerInset}px`);
      }
      const targetRect = target.getBoundingClientRect();
      const offset = scrollHost.scrollTop + (targetRect.top - hostRect.top) - headerInset;
      scrollHost.scrollTo({ top: Math.max(0, offset), behavior: 'auto' });
    };
    doScroll();
    window.requestAnimationFrame(() => window.requestAnimationFrame(doScroll));
    window.setTimeout(doScroll, 120);
    window.setTimeout(doScroll, 450);
  }

  openAdonaySection(section: 'articulos' | 'charlas'): void {
    studio.playClick();
    this.mobileSheetPanel = section;
    if (this.mobile) {
      this.setLayout('split');
      this.expandMobileSheet(true);
      window.requestAnimationFrame(() => this.scrollToAdonaySection(section));
      return;
    }
    this.setLayout('split');
    this.scrollToAdonaySection(section);
  }

  openSearch(): void {
    studio.playClick();
    this.callbacks.onOpenSearch();
  }

  openArticles(): void {
    studio.playClick();
    this.callbacks.onOpenArticles();
  }

  openTalks(): void {
    studio.playClick();
    this.callbacks.onOpenTalks();
  }

  openAboutPanel(opts?: AboutPanelOpenOpts): void {
    studio.playClick();
    this.callbacks.onOpenAbout(opts);
  }

  expandMobileSheet(expanded: boolean, opts?: { full?: boolean }): void {
    const intro = this.root.querySelector('.chrome__intro') as HTMLElement | null;
    const body = this.root.querySelector('[data-sheet-body]') as HTMLElement | null;
    const grab = this.root.querySelector('[data-intro-grab]') as HTMLElement | null;
    if (!intro) return;
    if (expanded) this.root.classList.add('chrome--intro-detail-seen');
    intro.classList.toggle('chrome__intro--expanded', expanded);
    this.root.classList.toggle('chrome--intro-full', !!opts?.full && expanded);
    if (!expanded) this.root.classList.remove('chrome--intro-full');
    if (body) body.classList.toggle('chrome__sheet-body--collapsed', !expanded);
    if (grab) grab.hidden = !expanded;
    this.sync();
    this.callbacks.onLayoutChange();
  }

  resetMobileIntroPeek(): void {
    if (!this.mobile) return;
    this.mobileSheet = true;
    this.expandMobileSheet(false);
  }

  reopenMobileIntroPeek(): void {
    if (!this.mobile) return;
    this.mobileSheet = true;
    this.expandMobileSheet(false);
    this.sync();
    this.callbacks.onLayoutChange({ silent: true });
  }

  getMobileSheetPanel(): 'intro' | 'casos' | 'logros' | 'contact' | 'articulos' | 'charlas' {
    return this.mobileSheetPanel;
  }

  openMobileSheetSection(target: 'casos' | 'logros' | 'intro' | 'contact' | 'articulos' | 'charlas'): void {
    this.mobileSheetPanel = target;
    this.setLayout('split');
    if (target === 'intro') {
      this.expandMobileSheet(false);
      return;
    }
    this.expandMobileSheet(true);
    window.requestAnimationFrame(() => {
      const sel =
        target === 'logros'
          ? '#chrome-mobile-logros'
          : target === 'contact'
            ? '#chrome-mobile-contact'
            : target === 'articulos'
              ? '#chrome-mobile-articulos'
              : target === 'charlas'
                ? '#chrome-mobile-charlas'
                : '#chrome-mobile-casos';
      this.scrollTo(sel);
    });
  }

  private downloadCv(): void {
    const a = document.createElement('a');
    a.href = CV_HREF;
    a.download = 'adonay-lizardo-cv.pdf';
    a.rel = 'noopener';
    document.body.append(a);
    a.click();
    a.remove();
  }

  private bindMobileSheetGestures(): void {
    const intro = this.root.querySelector('.chrome__intro');
    const grab = this.root.querySelector('[data-intro-grab]');
    if (!intro) return;
    let startY = 0;
    const onTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      startY = te.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (e: Event) => {
      const te = e as TouchEvent;
      const endY = te.changedTouches[0]?.clientY ?? startY;
      const delta = endY - startY;
      const expanded = intro.classList.contains('chrome__intro--expanded');
      if (expanded) {
        if (delta > 48) {
          this.expandMobileSheet(false);
          return;
        }
        if (startY - endY > 36) this.expandMobileSheet(true, { full: true });
        return;
      }
      if (startY - endY > 48) this.expandMobileSheet(true);
    };
    intro.addEventListener('touchstart', onTouchStart, { passive: true });
    intro.addEventListener('touchend', onTouchEnd, { passive: true });
    grab?.addEventListener('touchstart', onTouchStart, { passive: true });
    grab?.addEventListener('touchend', onTouchEnd, { passive: true });
  }

  private openContact(): void {
    this.openAboutPanel({ highlightContact: true });
    studio.unlock();
    studio.playLineForced('11-contact');
  }

  private syncAudience(): void {
    this.root.querySelectorAll('[data-audience]').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.audience === this.audience);
    });
  }

  sync(opts?: { deferColumn?: boolean }): void {
    this.mobile = isMobileLayout();
    const landscapeSide = this.mobile && isLandscapePhone() && this.mobileSheet && !this.interiorOpen;
    const layout = this.mobile ? (this.mobileSheet ? 'split' : 'map') : this.layout;
    document.body.dataset.layout = layout;
    document.body.dataset.chrome = this.mobile ? 'phone' : 'desktop';
    document.body.dataset.interior = this.interiorOpen ? '1' : '0';
    this.root.dataset.layout = layout;
    this.root.classList.toggle('chrome--mobile', this.mobile);
    this.root.classList.toggle('chrome--interior', this.interiorOpen);
    this.root.classList.toggle('chrome--place-card', this.placeCardOpen);
    this.root.classList.toggle(
      'chrome--landscape-side',
      landscapeSide,
    );
    const introEl = this.root.querySelector('.chrome__intro');
    const introExpanded =
      !!introEl?.classList.contains('chrome__intro--expanded') &&
      this.mobile &&
      this.mobileSheet &&
      !this.interiorOpen;
    this.root.classList.toggle(
      'chrome--sheet',
      this.mobile && this.mobileSheet && !this.interiorOpen && !landscapeSide,
    );
    this.root.classList.toggle(
      'chrome--intro-peek',
      this.mobile && this.mobileSheet && !this.interiorOpen && !landscapeSide && !introExpanded,
    );
    this.root.classList.toggle('chrome--intro-expanded', introExpanded);
    const introToolbar = this.root.querySelector('[data-intro-toolbar]') as HTMLElement | null;
    if (introToolbar) {
      introToolbar.hidden = !introExpanded;
    }
    this.syncMobileLang();
    this.root.classList.toggle('chrome--dock', this.mobile && !this.mobileSheet && !this.interiorOpen);
    this.root.classList.toggle('chrome--map', !this.mobile && this.layout === 'map');
    this.root.classList.toggle('chrome--panel', !this.mobile && this.layout === 'panel');
    this.root.classList.toggle('chrome--split', !this.mobile && this.layout === 'split');
    this.syncSound();
    this.placeLang();
    this.placeSubtitle();
    if (opts?.deferColumn) return;
    const col = this.root.querySelector('.chrome__column') as HTMLElement | null;
    if (col) {
      // Inline display wins over `.chrome--split { display:block }`, so innerText
      // Hide the intro column while a case interior is open.
      const showCol = !this.interiorOpen && (!this.mobile || landscapeSide);
      col.style.display = showCol ? '' : 'none';
      col.hidden = !showCol;
      col.setAttribute('aria-hidden', showCol ? 'false' : 'true');
    }
    const rail = this.root.querySelector('.chrome__rail') as HTMLElement | null;
    if (rail && landscapeSide) {
      rail.style.display = 'flex';
    } else if (rail && this.mobile) {
      rail.style.display = '';
    }
  }

  private syncViewButtons(): void {
    const v = this.getView();
    this.root.querySelectorAll('[data-view]').forEach((btn) => {
      const key = (btn as HTMLElement).dataset.view;
      if (key !== 'rotate' && key !== 'map') btn.classList.toggle('is-active', key === v.mode);
      if (key === 'map') btn.classList.toggle('is-active', v.overview);
    });
    this.syncSubtitle();
    this.root.classList.toggle('chrome--alt-view', v.mode !== 'isometrica');
    this.root.classList.toggle('chrome--overview', v.overview);
    const hint = this.root.querySelector('.chrome__sound') as HTMLElement | null;
    if (hint && (this.soundHintDismissed || v.mode !== 'isometrica') && !hint.hidden) {
      hint.hidden = true;
      hint.dataset.hint = '0';
      hint.setAttribute('aria-hidden', 'true');
      hint.classList.remove('chrome__sound--fade');
      if (!this.soundHintDismissed) this.soundHintDismissed = true;
    }
  }

  private placeSubtitle(): void {
    const sub = this.subtitleElement();
    if (!sub) return;
    if (studio.subtitleVoiceId() === '11-contact') {
      sub.style.position = 'fixed';
      sub.style.zIndex = '70';
      if (this.mobile && this.isLandscapeSideSheet()) {
        const sheet = document.querySelector('.about-panel__sheet')?.getBoundingClientRect();
        const mapW = sheet?.width ? sheet.left : window.innerWidth * 0.55;
        sub.style.left = `${Math.max(80, mapW / 2)}px`;
        sub.style.width = `${Math.min(280, Math.max(160, mapW - 48))}px`;
        sub.style.transform = 'translateX(-50%)';
        sub.style.top = `${Math.min(340, Math.max(300, window.innerHeight - 56))}px`;
        sub.style.bottom = 'auto';
        return;
      }
      if (this.mobile && this.isPhonePortrait()) {
        sub.style.left = '50%';
        sub.style.width = `${Math.min(340, window.innerWidth - 48)}px`;
        sub.style.transform = 'translateX(-50%)';
        sub.style.top = '118px';
        sub.style.bottom = 'auto';
        return;
      }
      if (!this.mobile) {
        const mapLeft = this.layout === 'split' ? 496 : 72;
        const mapW = window.innerWidth - mapLeft - 16;
        sub.style.left = `${mapLeft + mapW / 2}px`;
        sub.style.transform = 'translateX(-50%)';
        sub.style.width = 'fit-content';
        sub.style.maxWidth = '';
        sub.style.bottom = '96px';
        sub.style.top = 'auto';
        return;
      }
    }
    const previewOpen = document.querySelector('.building-panel--preview.building-panel--open');
    if (this.mobile && previewOpen && !this.interiorOpen) {
      sub.style.bottom = '76px';
      sub.style.top = 'auto';
      sub.style.left = '50%';
      sub.style.transform = 'translateX(-50%)';
      sub.style.width = 'min(560px, calc(100vw - 32px))';
      return;
    }
    if (document.body.classList.contains('about-panel-open')) {
      const sheet = document.querySelector('.about-panel__sheet')?.getBoundingClientRect();
      if (sheet && sheet.width > 8) {
        sub.style.position = 'fixed';
        sub.style.zIndex = '70';
        if (this.mobile && this.isLandscapeSideSheet()) {
          const mapW = sheet.left;
          sub.style.left = `${Math.max(16, mapW / 2)}px`;
          sub.style.width = `${Math.max(160, mapW - 32)}px`;
          sub.style.transform = 'translateX(-50%)';
          sub.style.bottom = '24px';
          sub.style.top = 'auto';
          return;
        }
        if (this.mobile && this.isPhonePortrait()) {
          sub.style.left = '50%';
          sub.style.width = `${Math.min(340, window.innerWidth - 32)}px`;
          sub.style.transform = 'translateX(-50%)';
          sub.style.bottom = `${Math.max(24, window.innerHeight - sheet.top + 12)}px`;
          sub.style.top = 'auto';
          return;
        }
        const mapLeft = sheet.right;
        const mapW = window.innerWidth - mapLeft;
        sub.style.left = `${mapLeft + mapW / 2}px`;
        sub.style.width = `${Math.min(480, mapW - 32)}px`;
        sub.style.transform = 'translateX(-50%)';
        sub.style.bottom = '28px';
        sub.style.top = 'auto';
        return;
      }
    } else {
      sub.style.position = '';
      sub.style.zIndex = '';
    }
    if (this.mobile && this.mobileSheet && !this.interiorOpen) {
      const intro = this.root.querySelector('.chrome__intro') as HTMLElement | null;
      const r = intro?.getBoundingClientRect();
      if (r && r.height > 8) {
        sub.style.position = 'fixed';
        sub.style.zIndex = '70';
        if (this.isLandscapeSideSheet()) {
          const mapW = r.left;
          sub.style.left = `${Math.max(80, mapW / 2)}px`;
          sub.style.width = `${Math.min(280, Math.max(160, mapW - 48))}px`;
          sub.style.transform = 'translateX(-50%)';
          sub.style.top = `${Math.min(340, Math.max(300, r.top - 56))}px`;
          sub.style.bottom = 'auto';
          return;
        }
        if (this.isPhonePortrait()) {
          sub.style.left = '50%';
          sub.style.width = `${Math.min(340, window.innerWidth - 48)}px`;
          sub.style.transform = 'translateX(-50%)';
          sub.style.top = `${Math.max(110, Math.min(130, r.top - 120))}px`;
          sub.style.bottom = 'auto';
          return;
        }
        sub.style.bottom = `${Math.max(12, window.innerHeight - r.top + 8)}px`;
        sub.style.top = 'auto';
        return;
      }
    }
    sub.style.bottom = '';
    sub.style.top = '';
    sub.style.left = '';
    sub.style.width = '';
    sub.style.transform = '';
  }

  private shortLandscape(): boolean {
    return window.matchMedia('(max-height: 500px) and (orientation: landscape)').matches;
  }

  private langHome: HTMLElement | null = null;

  private syncMobileLang(): void {
    const lang = this.root.querySelector('.chrome__lang') as HTMLElement | null;
    if (!lang) return;
    if (!this.langHome) {
      this.langHome = document.createElement('span');
      this.langHome.hidden = true;
      this.langHome.setAttribute('aria-hidden', 'true');
      lang.after(this.langHome);
    }
    lang.classList.remove('chrome__lang--in-intro', 'chrome__lang--in-tools');
    if (this.mobile && !this.interiorOpen) {
      lang.hidden = true;
      if (lang.parentElement !== this.root && this.langHome.parentElement === this.root) {
        this.langHome.before(lang);
      }
      return;
    }
    lang.hidden = false;
    if (!this.mobile) {
      lang.hidden = true;
      return;
    }
    if (lang.parentElement !== this.root && this.langHome.parentElement === this.root) {
      this.langHome.before(lang);
    }
  }

  private placeLang(): void {
    const lang = this.root.querySelector('.chrome__lang') as HTMLElement | null;
    if (!lang) return;
    if (
      lang.hidden ||
      lang.classList.contains('chrome__lang--in-rail') ||
      lang.classList.contains('chrome__lang--in-intro') ||
      lang.classList.contains('chrome__lang--in-tools')
    ) {
      lang.style.top = '';
      lang.style.left = '';
      lang.style.right = '';
      return;
    }
    const shortLand = this.shortLandscape();
    if (shortLand && this.mobile) {
      if (document.body.classList.contains('about-panel-open')) {
        lang.style.top = '12px';
        lang.style.left = '12px';
        lang.style.right = 'auto';
        return;
      }
      if (this.mobileSheet && !this.interiorOpen) {
        lang.style.top = '68px';
        lang.style.left = '12px';
        lang.style.right = 'auto';
      } else {
        lang.style.top = '12px';
        lang.style.right = '12px';
        lang.style.left = 'auto';
      }
      return;
    }
    lang.style.left = '';
    const cl = document.querySelector('.checklist') as HTMLElement | null;
    const ring = cl && !cl.hidden ? cl.getBoundingClientRect() : null;
    if (!this.mobile && ring && ring.width > 8 && ring.left + ring.width <= window.innerWidth + 1) {
      const top = Math.max(16, ring.top + (ring.height - 40) / 2);
      const topClamped = Math.min(window.innerHeight - 48, top);
      const right = Math.max(16, window.innerWidth - ring.left + 8);
      lang.style.top = `${topClamped}px`;
      lang.style.right = `${right}px`;
    } else if (!this.mobile) {
      lang.style.top = '20px';
      lang.style.right = '16px';
    } else if (document.body.dataset.layout === 'map') {
      lang.style.top = '';
      lang.style.left = '';
      lang.style.right = '';
    } else {
      lang.style.top = '24px';
      lang.style.right = '16px';
    }
    const locate = this.root.querySelector('.chrome__locate') as HTMLElement | null;
    const wrap = this.root.querySelector('.chrome__minimap-wrap') as HTMLElement | null;
    if (locate && wrap && wrap.offsetParent !== null && !locate.hidden) {
      const lr = locate.getBoundingClientRect();
      const gr = lang.getBoundingClientRect();
      if (gr.bottom > lr.top - 4 && gr.right > lr.left - 4 && gr.left < lr.right + 4) {
        const bumped = Math.max(8, lr.bottom + 6);
        lang.style.top = `${Math.min(window.innerHeight - 48, bumped)}px`;
        lang.style.right = `${Math.max(16, window.innerWidth - lr.right)}px`;
      }
    }
    const tools = this.root.querySelector('.chrome__tools-phone') as HTMLElement | null;
    if (this.mobile && tools && tools.offsetParent !== null && document.body.dataset.layout !== 'map') {
      const tr = tools.getBoundingClientRect();
      lang.style.left = 'auto';
      lang.style.right = '16px';
      lang.style.top = `${Math.max(tr.bottom + 10, 24)}px`;
    }
  }

  private drawMinimap(): void {
    const ctx = this.minimap.getContext('2d');
    if (!ctx) return;
    const w = this.minimap.width;
    const h = this.minimap.height;
    const view = this.getView();
    const cenital = view.mode === 'cenital';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0B0C0E';
    if (cenital) {
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#2A2C31';
      ctx.strokeRect(2, 2, w - 4, h - 4);
    } else {
      ctx.beginPath();
      ctx.moveTo(w / 2, 4);
      ctx.lineTo(w - 4, h / 2);
      ctx.lineTo(w / 2, h - 4);
      ctx.lineTo(4, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(237, 238, 240, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

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
      if (cenital) ctx.fillRect(s.x - 5, s.y - 4, 10, 8);
      else ctx.fillRect(s.x - 4, s.y - 3, 8, 6);
    }
    const t = this.getCharTile();
    const c = map(tileToWorld(t.x, t.y).x, tileToWorld(t.x, t.y).y);
    ctx.fillStyle = '#EDEEF0';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

