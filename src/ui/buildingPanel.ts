import { studio } from '../audio/studio';
import { aboutForLang, ABOUT_PANELS } from '../data/about';
import { aboutBlockNode } from './aboutRender';
import { caseForLang, casePreviewCopy, isCaseHouse, type CaseBlock } from '../data/cases';
import {
  TALK_SECTIONS,
  TALKS,
  TALKS_COMING_SOON,
  WRITINGS,
  type TalkItem,
  type WritingItem,
  type WritingSection,
} from '../data/experiences';
import {
  isPlaceholderCopy,
  talkMeta,
  talkSectionTitle,
  talkThumbnailUrl,
  talkTitle,
  writingArticleUrl,
  writingItemHasCopy,
  writingMeta,
  writingSourceLabel,
  writingTitle,
} from './contentLabels';
import { WORKED_WITH, WORKED_WITH_PANELS, type WorkedWithLogo } from '../data/workedWith';
import {
  FIGMA_BACK_PHONE_READING,
  FIGMA_CLOSE_PHONE_READING,
  FIGMA_DOC,
  FIGMA_DOC_PHONE,
  FIGMA_SUBSTACK_PHONE,
  figmaAsset,
} from './figmaAssets';
import { iconSvg } from './icons';
import { getLang, onLangChange, t, type I18nKey } from './i18n';

const FIGMA_BACK = figmaAsset('talks-desktop-list', '9f9c4.svg');
const FIGMA_EXPAND = figmaAsset('talks-desktop-list', 'ce7c9.svg');
const FIGMA_CLOSE = figmaAsset('talks-desktop-list', 'f1b3a.svg');
const FIGMA_SUBSTACK = figmaAsset('writings-desktop-reading', 'c0026.svg');

/** `**bold**` in case copy becomes a <strong>; the rest is a text node. */
function appendMarkdown(el: HTMLElement, text: string): void {
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) el.appendChild(document.createTextNode(text.slice(last, at)));
    const strong = document.createElement('strong');
    strong.textContent = m[1];
    el.appendChild(strong);
    last = at + m[0].length;
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
}

function caseBlockNode(block: CaseBlock): HTMLElement {
  if (block.kind === 'closing') {
    const p = document.createElement('p');
    p.className = 'case__closing';
    const em = document.createElement('em');
    em.textContent = block.text;
    p.appendChild(em);
    return p;
  }
  const section = document.createElement('section');
  section.className = 'case__section';
  if (block.heading) {
    const h = document.createElement('h3');
    h.className = 'case__heading';
    h.textContent = block.heading;
    section.appendChild(h);
  }
  for (const text of block.paragraphs) {
    if (!text) continue;
    const p = document.createElement('p');
    p.className = 'case__text';
    appendMarkdown(p, text);
    section.appendChild(p);
  }
  if (block.bullets?.length) {
    const ul = document.createElement('ul');
    ul.className = 'case__list';
    for (const text of block.bullets) {
      const li = document.createElement('li');
      appendMarkdown(li, text);
      ul.appendChild(li);
    }
    section.appendChild(ul);
  }
  return section;
}

/** Interior content — bottom sheet (mobile) / right rail (desktop). */
export class BuildingPanel {
  private el: HTMLElement;
  private sheet: HTMLElement;
  private titleEl: HTMLElement;
  private workedWithEl: HTMLElement;
  private caseEl: HTMLElement;
  private aboutEl: HTMLElement;
  /** Building panel title as passed in: the identity scene code compares against (may differ from what is shown). */
  private openKey = '';
  private workedWithLogos: WorkedWithLogo[] = WORKED_WITH;
  private interiorId: string | null = null;
  private onVisibilityChange: () => void;
  private onSheetTransitionEnd: () => void;
  private onSalir: () => void;
  private onCasePreviewClosed: () => void;
  private mode: 'hidden' | 'interior' | 'preview' | 'talks' | 'writings' = 'hidden';
  private experienceEl: HTMLElement | null = null;
  private experienceIntro: HTMLElement | null = null;
  private experienceFilters: HTMLElement | null = null;
  private experienceList: HTMLElement | null = null;
  private experienceDetail: HTMLElement | null = null;
  private expHeader: HTMLElement | null = null;
  private expHeaderTitle: HTMLElement | null = null;
  private expMobileChrome: HTMLElement | null = null;
  private expMobileTitle: HTMLElement | null = null;
  private experienceView: 'list' | 'detail' = 'list';
  private experiencePanelTitle = '';
  private writingsFilter: 'all' | string = 'all';
  /** Writings “See all” — single-section list before reader detail. */
  private writingsSectionFocus: string | null = null;
  private activeTalkId: string | null = null;
  private activeWriting: { sectionId: string; itemId: string } | null = null;
  private previewEl: HTMLElement | null = null;
  private previewTitle: HTMLElement | null = null;
  private previewKicker: HTMLElement | null = null;
  private previewSubtitle: HTMLElement | null = null;
  private previewTeaser: HTMLElement | null = null;
  private readEl: HTMLElement | null = null;
  private readBar: HTMLElement | null = null;
  private readBarTitle: HTMLElement | null = null;
  private readKicker: HTMLElement | null = null;
  private readHeadline: HTMLElement | null = null;
  private readLede: HTMLElement | null = null;
  private readHeroLabel: HTMLElement | null = null;
  private peekOnly = true;
  private dragStartY = 0;
  private ignoreDragUntil = 0;
  private leaveArmed = false;
  /** Press on Salir: leave only on lift, and only if the finger stayed within ~10 px. */
  private exitPress: { x: number; y: number; drift: number } | null = null;
  private exitFromPointer = false;
  private visibilitySyncQueued = false;

  constructor(
    container: HTMLElement,
    onVisibilityChange: () => void,
    onSalir: () => void,
    onSheetTransitionEnd?: () => void,
    onCasePreviewClosed?: () => void,
  ) {
    this.onVisibilityChange = onVisibilityChange;
    this.onSalir = onSalir;
    this.onSheetTransitionEnd = onSheetTransitionEnd ?? onVisibilityChange;
    this.onCasePreviewClosed = onCasePreviewClosed ?? onSheetTransitionEnd ?? (() => {});
    this.el = document.createElement('div');
    this.el.className = 'building-panel building-panel--interior-only';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="building-panel__backdrop" data-backdrop></div>
      <div class="building-panel__sheet" role="dialog" aria-modal="true">
        <div class="building-panel__drag" data-drag aria-hidden="true"></div>
        <div class="exp-mobile-chrome" data-exp-mobile-chrome hidden>
          <div class="exp-mobile-chrome__grab" aria-hidden="true"><span class="exp-mobile-chrome__bar"></span></div>
          <div class="exp-mobile-chrome__row">
            <button type="button" class="exp-mobile-chrome__btn exp-mobile-chrome__back" data-exp-mobile-back aria-label="">
              <img class="exp-mobile-chrome__icon" src="${FIGMA_BACK}" width="15" height="15" alt="" />
            </button>
            <h2 class="exp-mobile-chrome__title"></h2>
            <button type="button" class="exp-mobile-chrome__btn exp-mobile-chrome__close" data-exp-mobile-close aria-label="">
              <img class="exp-mobile-chrome__icon" src="${FIGMA_CLOSE}" width="15" height="15" alt="" />
            </button>
          </div>
        </div>
        <header class="exp-header" data-exp-header hidden>
          <button type="button" class="exp-header__btn exp-header__back" data-exp-back aria-label="">
            <img class="exp-header__icon" src="${FIGMA_BACK}" width="15" height="15" alt="" />
          </button>
          <h2 class="exp-header__title"></h2>
          <div class="exp-header__actions">
            <button type="button" class="exp-header__btn" data-exp-expand aria-label="">
              <img class="exp-header__icon" src="${FIGMA_EXPAND}" width="15" height="15" alt="" />
            </button>
            <button type="button" class="exp-header__btn exp-header__close" data-close aria-label="">
              <img class="exp-header__icon" src="${FIGMA_CLOSE}" width="15" height="15" alt="" />
            </button>
          </div>
        </header>
        <div class="building-panel__bar">
          <button type="button" class="building-panel__exit" data-exit></button>
          <button type="button" class="building-panel__close" data-close aria-label="">×</button>
        </div>
        <div class="case-preview" data-preview hidden>
          <div class="case-preview__handle" aria-hidden="true"></div>
          <div class="case-preview__head">
            <div class="case-preview__titles">
              <p class="case-preview__kicker"></p>
              <h2 class="case-preview__title"></h2>
            </div>
            <button type="button" class="case-preview__x" data-close aria-label="">${iconSvg('close')}</button>
          </div>
          <p class="case-preview__subtitle"></p>
          <p class="case-preview__teaser"></p>
          <button type="button" class="case-preview__read" data-read>
            <span class="case-preview__read-logo">${iconSvg('briefcase')}</span>
            <span class="case-preview__read-copy">
              <span class="case-preview__read-label"></span>
              <span class="case-preview__read-meta">Problem · What I did · Result</span>
            </span>
            <span class="case-preview__read-go" aria-hidden="true">${iconSvg('arrowNe')}</span>
          </button>
        </div>
        <div class="case-read__bar" data-read-bar hidden>
          <p class="case-read__bar-title"></p>
          <button type="button" class="case-read__x" data-close aria-label="">${iconSvg('close')}</button>
        </div>
        <div class="case-read" data-read-view hidden>
          <div class="case-read__page">
            <div class="case-read__hero" aria-hidden="true">
              <span class="case-read__hero-logo">${iconSvg('briefcase', 20)}</span>
              <p class="case-read__hero-label"></p>
            </div>
            <header class="case-read__intro">
              <p class="case-read__kicker"></p>
              <h2 class="case-read__headline"></h2>
              <p class="case-read__lede"></p>
            </header>
          </div>
        </div>
        <h2 class="building-panel__title"></h2>
        <div class="building-panel__body-wrap">
          <article class="case" lang="en" hidden>
            <div class="case__version case__version--full"></div>
            <div class="case__version case__version--short"></div>
          </article>
          <section class="worked-with" aria-labelledby="worked-with-title" hidden>
            <h3 class="worked-with__title" id="worked-with-title" data-i18n="panel.workedWith">Worked with</h3>
            <ul class="worked-with__logos"></ul>
          </section>
          <section class="about" lang="en" aria-labelledby="about-title" hidden>
            <h3 class="about__title" id="about-title" data-i18n="panel.aboutMe">About me</h3>
          </section>
          <section class="experience" data-experience hidden>
            <p class="experience__intro"></p>
            <div class="experience__filters" data-exp-filters hidden></div>
            <div class="experience__list" data-exp-list></div>
            <div class="experience__detail" data-exp-detail hidden></div>
          </section>
        </div>
      </div>
    `;
    container.appendChild(this.el);
    this.sheet = this.el.querySelector('.building-panel__sheet')!;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (this.isOpen() && this.isMobile() && this.isInteriorMode()) this.queueVisibilitySync();
      });
      ro.observe(this.sheet);
    }
    this.sheet.addEventListener('transitionend', (ev) => {
      if (ev.target !== this.sheet || ev.propertyName !== 'transform') return;
      if (!this.isOpen() || !this.isMobile()) return;
      if (!this.isInteriorMode() && !this.isPreviewMode()) return;
      this.sheet.scrollTop = 0;
      this.syncScrolled();
      this.onSheetTransitionEnd();
    });
    this.titleEl = this.el.querySelector('.building-panel__title')!;
    this.workedWithEl = this.el.querySelector('.worked-with')!;
    this.caseEl = this.el.querySelector('.case')!;
    this.aboutEl = this.el.querySelector('.about')!;
    this.previewEl = this.el.querySelector('[data-preview]') as HTMLElement;
    this.previewTitle = this.el.querySelector('.case-preview__title');
    this.previewKicker = this.el.querySelector('.case-preview__kicker');
    this.previewSubtitle = this.el.querySelector('.case-preview__subtitle');
    this.previewTeaser = this.el.querySelector('.case-preview__teaser');
    this.readEl = this.el.querySelector('[data-read-view]') as HTMLElement;
    this.readBar = this.el.querySelector('[data-read-bar]') as HTMLElement;
    this.readBarTitle = this.el.querySelector('.case-read__bar-title');
    this.readKicker = this.el.querySelector('.case-read__kicker');
    this.readHeadline = this.el.querySelector('.case-read__headline');
    this.readLede = this.el.querySelector('.case-read__lede');
    this.readHeroLabel = this.el.querySelector('.case-read__hero-label');
    this.aboutEl.append(...aboutForLang(getLang()).map(aboutBlockNode));
    this.experienceEl = this.el.querySelector('[data-experience]');
    this.experienceIntro = this.el.querySelector('.experience__intro');
    this.experienceFilters = this.el.querySelector('[data-exp-filters]');
    this.experienceList = this.el.querySelector('[data-exp-list]');
    this.experienceDetail = this.el.querySelector('[data-exp-detail]');
    this.expHeader = this.el.querySelector('[data-exp-header]');
    this.expHeaderTitle = this.el.querySelector('.exp-header__title');
    this.expMobileChrome = this.el.querySelector('[data-exp-mobile-chrome]');
    this.expMobileTitle = this.el.querySelector('.exp-mobile-chrome__title');
    this.el.querySelector('[data-exp-mobile-back]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onExperienceBack();
    });
    this.el.querySelector('[data-exp-mobile-close]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onCloseClick();
    });
    this.el.querySelector('[data-exp-back]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onExperienceBack();
    });
    this.el.querySelector('[data-exp-expand]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.isExperienceMode() || !this.isMobile()) return;
      this.setPeek(!this.peekOnly);
    });
    this.applyI18n();
    onLangChange(() => {
      this.applyI18n();
      this.refreshExperienceCopy();
      if (this.interiorId && this.mode === 'interior' && ABOUT_PANELS.has(this.interiorId)) {
        this.aboutEl.replaceChildren(...aboutForLang(getLang()).map(aboutBlockNode));
      }
      if (this.interiorId && this.mode === 'interior') {
        this.setTitle(this.openKey, this.renderCase());
      }
      if (this.isPreviewMode() && this.interiorId) {
        this.syncCasePreview(this.interiorId);
      }
    });
    // Touch has no hover: a tap shows that logo's colours until another logo (or the same one) is tapped.
    this.workedWithEl.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('.worked-with__logo');
      for (const img of this.workedWithEl.querySelectorAll('.worked-with__logo')) {
        img.classList.toggle('is-revealed', img === hit && !img.classList.contains('is-revealed'));
      }
    });

    const exitBtn = this.el.querySelector('[data-exit]') as HTMLButtonElement;
    // Leave on lift, not press: a sheet drag that starts on Salir must not exit.
    // Slop 10 px. Touchend/pointerup (not click) so iOS does not wait ~300 ms.
    const point = (e: Event): { x: number; y: number } | null => {
      if ('changedTouches' in e) {
        const t = (e as TouchEvent).changedTouches[0];
        return t ? { x: t.clientX, y: t.clientY } : null;
      }
      if ('clientX' in e) return { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
      return null;
    };
    const onExitDown = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const p = point(e);
      if (!p) return;
      this.exitPress = { x: p.x, y: p.y, drift: 0 };
      this.exitFromPointer = false;
      if ('pointerId' in e) {
        try {
          (e.target as HTMLElement).setPointerCapture((e as PointerEvent).pointerId);
        } catch {
          /* capture is optional */
        }
      }
    };
    const onExitMove = (e: Event) => {
      const g = this.exitPress;
      const p = point(e);
      if (!g || !p) return;
      g.drift = Math.max(g.drift, Math.hypot(p.x - g.x, p.y - g.y));
    };
    const onExitUp = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const g = this.exitPress;
      this.exitPress = null;
      if (!g) return;
      const p = point(e) ?? g;
      const drift = Math.max(g.drift, Math.hypot(p.x - g.x, p.y - g.y));
      this.exitFromPointer = true;
      if (drift < 10) this.salir();
    };
    const onExitCancel = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.exitPress = null;
      this.exitFromPointer = true;
    };
    exitBtn.addEventListener('touchstart', onExitDown, { passive: false });
    exitBtn.addEventListener('touchmove', onExitMove, { passive: false });
    exitBtn.addEventListener('touchend', onExitUp, { passive: false });
    exitBtn.addEventListener('touchcancel', onExitCancel, { passive: false });
    exitBtn.addEventListener('pointerdown', onExitDown);
    exitBtn.addEventListener('pointermove', onExitMove);
    exitBtn.addEventListener('pointerup', onExitUp);
    exitBtn.addEventListener('pointercancel', onExitCancel);
    exitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.exitFromPointer) return;
      this.salir();
    });
    this.el.querySelector('[data-backdrop]')!.addEventListener('click', () => {
      if (this.isMobile() && this.mode === 'interior') this.setPeek(true);
    });
    this.sheet.addEventListener('scroll', () => this.syncScrolled(), { passive: true });
    this.sheet.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this.sheet.addEventListener('pointerdown', (e) => {
      if (
        this.isMobile() &&
        this.mode === 'interior' &&
        this.peekOnly &&
        (e.target as HTMLElement).closest('[data-drag], .building-panel__title, .building-panel__bar')
      ) {
        this.onDragStart(e);
      }
      e.stopPropagation();
    });

    const drag = this.el.querySelector('[data-drag]') as HTMLElement;
    drag.addEventListener('pointerdown', (e) => this.onDragStart(e));
    const grab = this.el.querySelector('.exp-mobile-chrome__grab') as HTMLElement | null;
    grab?.addEventListener('pointerdown', (e) => this.onDragStart(e));
    this.expMobileChrome?.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.onDragStart(e);
    });
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', () => this.onDragEnd());

    this.titleEl.addEventListener('click', () => {
      if (this.peekOnly && this.isMobile() && this.isInteriorExperienceSheet()) this.setPeek(false);
    });
    this.expMobileTitle?.addEventListener('click', () => {
      if (this.peekOnly && this.isMobile() && this.isExperienceMode()) this.setPeek(false);
    });
    this.el.querySelector('[data-read]')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.mode === 'preview' && this.peekOnly) this.setPeek(false);
    });
    this.el.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onCloseClick();
      });
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        if (this.mode === 'preview') this.closePreview();
        else this.salir();
      }
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', () => this.syncPeekClass());
  }

  private isMobile(): boolean {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  private queueVisibilitySync(): void {
    if (this.visibilitySyncQueued) return;
    this.visibilitySyncQueued = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.visibilitySyncQueued = false;
        this.sheet.scrollTop = 0;
        this.syncScrolled();
        this.onVisibilityChange();
      });
    });
  }

  private setPeek(peek: boolean): void {
    this.peekOnly = peek;
    this.dragStartY = 0;
    this.ignoreDragUntil = performance.now() + 400;
    this.syncPeekClass();
    this.queueVisibilitySync();
    if (this.isMobile() && this.isOpen() && (this.isInteriorMode() || this.isPreviewMode())) {
      window.setTimeout(() => this.onSheetTransitionEnd(), 280);
    }
  }

  private syncPeekClass(): void {
    const preview = this.mode === 'preview' && this.isOpen();
    const mobileInterior =
      this.isMobile() && (this.mode === 'interior' || this.mode === 'talks' || this.mode === 'writings') && this.isOpen();
    const peek = (preview || mobileInterior) && this.peekOnly;
    const expanded = (preview || mobileInterior) && !this.peekOnly;
    this.el.classList.toggle('building-panel--peek', peek);
    this.el.classList.toggle('building-panel--expanded', expanded);
    this.el.classList.toggle('building-panel--preview', preview);
    if (this.previewEl) this.previewEl.hidden = !preview || !this.peekOnly;
    if (this.readEl) this.readEl.hidden = !preview || this.peekOnly;
    if (this.readBar) this.readBar.hidden = !preview || this.peekOnly;
    this.titleEl.hidden = preview || this.mode === 'talks' || this.mode === 'writings';
  }

  private onCloseClick(): void {
    if (this.mode === 'preview') this.closePreview();
    else if (this.mode === 'talks' || this.mode === 'writings') {
      this.salir();
      this.clearExperiencePresentation();
    }
  }

  /** Drop Talks/Writings chrome so the next building sheet is not stacked underneath. */
  private clearExperiencePresentation(): void {
    this.experienceView = 'list';
    this.activeTalkId = null;
    this.activeWriting = null;
    if (this.experienceEl) this.experienceEl.hidden = true;
    if (this.experienceList) this.experienceList.hidden = true;
    if (this.experienceDetail) {
      this.experienceDetail.hidden = true;
      this.experienceDetail.replaceChildren();
    }
    if (this.experienceFilters) this.experienceFilters.hidden = true;
    if (this.experienceIntro) this.experienceIntro.hidden = true;
    if (this.expHeader) this.expHeader.hidden = true;
    if (this.expMobileChrome) this.expMobileChrome.hidden = true;
    this.el.classList.remove(
      'building-panel--experience',
      'building-panel--writings',
      'building-panel--exp-list',
      'building-panel--exp-detail',
    );
  }

  private onExperienceBack(): void {
    if (!this.isExperienceMode()) return;
    if (this.experienceView === 'detail') {
      this.setExperienceView('list');
      return;
    }
    if (this.mode === 'writings' && this.writingsSectionFocus) {
      this.writingsSectionFocus = null;
      this.renderWritingsList();
      this.syncExperienceBackButton();
      return;
    }
    this.salir();
  }

  private closePreview(): void {
    if (this.mode !== 'preview') return;
    if (!this.peekOnly || this.el.classList.contains('building-panel--expanded')) {
      this.setPeek(true);
      return;
    }
    this.hide();
    studio.maybePlayDeferredIntro();
  }

  private isInteriorExperienceSheet(): boolean {
    return (
      this.mode === 'interior' ||
      this.mode === 'talks' ||
      this.mode === 'writings'
    );
  }

  private onDragStart(e: PointerEvent): void {
    if (!this.isMobile() || !this.isOpen() || this.mode === 'preview') return;
    if (performance.now() < this.ignoreDragUntil) return;
    this.dragStartY = e.clientY;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* optional */
    }
  }

  private onDragMove(e: PointerEvent): void {
    if (!this.dragStartY || e.buttons === 0) return;
    if (performance.now() < this.ignoreDragUntil) return;
    const dy = e.clientY - this.dragStartY;
    if (dy > 40 && !this.peekOnly) this.setPeek(true);
    if (dy < -40 && this.peekOnly) this.setPeek(false);
  }

  private onDragEnd(): void {
    this.dragStartY = 0;
  }

  showTalks(title: string, interiorId: string | null = 'teresa'): void {
    this.openExperience('talks', title, interiorId);
    this.renderTalksList();
  }

  /** QA / gate: Talks shell with empty list copy (refs `talks-vacio`). */
  showTalksEmptyForQa(): void {
    this.showTalks(t('panel.talks'), 'teresa');
    if (!this.experienceList) return;
    const p = document.createElement('p');
    p.className = 'experience__empty';
    p.textContent = t('talks.comingSoon');
    this.experienceList.replaceChildren(p);
    if (this.isMobile() && this.peekOnly) this.setPeek(false);
  }

  showWritings(title: string, interiorId: string | null = 'biblioteca'): void {
    this.openExperience('writings', title, interiorId);
    this.renderWritingsList();
  }

  /** Site search: open a specific writing in the reader. */
  openWritingById(itemId: string): boolean {
    for (const section of WRITINGS) {
      const item = section.items.find((x) => x.id === itemId);
      if (!item) continue;
      this.openWriting(section, item);
      return true;
    }
    return false;
  }

  openTalkById(talkId: string): boolean {
    if (talkId === 'teresa-building') {
      this.setExperienceView('list');
      return true;
    }
    const item = TALKS.find((x) => x.id === talkId);
    if (!item) return false;
    this.activeTalkId = item.id;
    this.renderTalkPlayer(item);
    this.setExperienceView('detail');
    if (this.isMobile()) this.setPeek(false);
    return true;
  }

  expandExperienceSheet(): void {
    if (this.isMobile() && this.isExperienceMode()) this.setPeek(false);
  }

  private openExperience(mode: 'talks' | 'writings', title: string, interiorId: string | null): void {
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    studio.clearSubtitle();
    this.mode = mode;
    this.interiorId = interiorId;
    this.writingsFilter = 'all';
    this.writingsSectionFocus = null;
    this.activeTalkId = null;
    this.activeWriting = null;
    this.peekOnly = this.isMobile();
    this.el.classList.remove('building-panel--preview');
    this.titleEl.hidden = true;
    this.caseEl.hidden = true;
    this.aboutEl.hidden = true;
    this.workedWithEl.hidden = true;
    if (this.previewEl) this.previewEl.hidden = true;
    if (this.readEl) this.readEl.hidden = true;
    if (this.readBar) this.readBar.hidden = true;
    if (this.expHeader) this.expHeader.hidden = this.isMobile();
    this.experienceEl!.hidden = false;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.el.removeAttribute('inert');
    this.el.classList.remove('building-panel--snap');
    this.experiencePanelTitle = title;
    this.setTitle(interiorId ?? mode, title);
    this.syncExperienceIntro();
    if (this.expHeaderTitle) this.expHeaderTitle.textContent = title;
    this.el.classList.add('building-panel--open', 'building-panel--experience');
    this.el.classList.toggle('building-panel--writings', mode === 'writings');
    this.syncPeekClass();
    this.setExperienceView('list');
    if (mode === 'talks') this.renderTalksList();
    else {
      if (this.experienceFilters) {
        this.experienceFilters.replaceChildren();
        this.experienceFilters.hidden = true;
      }
      this.renderWritingsList();
    }
    this.queueVisibilitySync();
    studio.playClick();
  }

  private syncExperienceIntro(): void {
    if (!this.experienceIntro) return;
    this.experienceIntro.hidden = true;
  }

  private refreshExperienceCopy(): void {
    if (!this.isExperienceMode()) return;
    this.syncExperienceIntro();
    if (this.expHeaderTitle) this.expHeaderTitle.textContent = this.experiencePanelTitle;
    if (this.experienceView === 'list') {
      if (this.mode === 'talks') this.renderTalksList();
      else this.renderWritingsList();
      return;
    }
    if (this.mode === 'talks' && this.activeTalkId) {
      const item = TALKS.find((x) => x.id === this.activeTalkId);
      if (item) this.renderTalkPlayer(item);
    }
    if (this.mode === 'writings' && this.activeWriting) {
      const section = WRITINGS.find((s) => s.id === this.activeWriting!.sectionId);
      const item = section?.items.find((x) => x.id === this.activeWriting!.itemId);
      if (section && item) this.renderWritingReader(section, item);
    }
  }

  private syncMobileExperienceChrome(): void {
    const mobile = this.isMobile() && this.isExperienceMode() && this.isOpen();
    if (this.expMobileChrome) this.expMobileChrome.hidden = !mobile;
    if (this.expHeader) this.expHeader.hidden = mobile || !this.isExperienceMode();
    if (!mobile || !this.expMobileChrome) return;
    if (this.expMobileTitle) this.expMobileTitle.textContent = this.experiencePanelTitle;
    const back = this.expMobileChrome.querySelector('[data-exp-mobile-back]') as HTMLElement | null;
    const showBack = this.experienceView === 'detail';
    if (back) back.hidden = !showBack;
    const talksList = this.mode === 'talks' && this.experienceView === 'list';
    this.expMobileChrome.classList.toggle('exp-mobile-chrome--grab-wide', talksList);
    this.expMobileChrome.classList.toggle('exp-mobile-chrome--grab-compact', !talksList);
    this.expMobileChrome.classList.toggle('exp-mobile-chrome--list-pad', talksList);
    if (this.mode === 'writings' && this.experienceView === 'detail') {
      const backIcon = this.expMobileChrome.querySelector(
        '.exp-mobile-chrome__back .exp-mobile-chrome__icon',
      ) as HTMLImageElement | null;
      const closeIcon = this.expMobileChrome.querySelector(
        '.exp-mobile-chrome__close .exp-mobile-chrome__icon',
      ) as HTMLImageElement | null;
      if (backIcon) backIcon.src = FIGMA_BACK_PHONE_READING;
      if (closeIcon) closeIcon.src = FIGMA_CLOSE_PHONE_READING;
    }
  }

  private setExperienceView(view: 'list' | 'detail'): void {
    if (!this.experienceList || !this.experienceDetail || !this.experienceFilters) return;
    this.experienceView = view;
    this.experienceList.hidden = view !== 'list';
    this.experienceDetail.hidden = view !== 'detail';
    this.experienceFilters.hidden = true;
    if (this.experienceIntro) {
      this.experienceIntro.hidden = this.mode !== 'talks' || view !== 'list';
    }
    const back = this.el.querySelector('[data-exp-back]') as HTMLElement | null;
    const expand = this.el.querySelector('[data-exp-expand]') as HTMLElement | null;
    if (back) {
      const showWritingsSection =
        this.mode === 'writings' && view === 'list' && !!this.writingsSectionFocus;
      back.hidden = this.isMobile() && view === 'list' && !showWritingsSection;
    }
    if (expand) expand.hidden = this.isMobile();
    this.el.classList.toggle('building-panel--exp-list', view === 'list');
    this.el.classList.toggle('building-panel--exp-detail', view === 'detail');
    this.syncMobileExperienceChrome();
    if (view === 'list') {
      this.activeTalkId = null;
      this.activeWriting = null;
      this.writingsSectionFocus = null;
      if (this.experienceDetail) this.experienceDetail.replaceChildren();
      if (this.mode === 'talks') this.renderTalksList();
      else this.renderWritingsList();
    }
  }

  private renderTalksList(): void {
    if (!this.experienceList) return;
    if (TALKS_COMING_SOON || TALKS.length === 0) {
      const p = document.createElement('p');
      p.className = 'experience__empty';
      p.textContent = t('talks.comingSoon');
      this.experienceList.replaceChildren(p);
      return;
    }
    const nodes: HTMLElement[] = [];
    for (const section of TALK_SECTIONS) {
      const heading = talkSectionTitle(section);
      if (heading) {
        const h = document.createElement('h3');
        h.className = 'experience__section-title';
        h.textContent = heading;
        nodes.push(h);
      }
      for (const item of section.items) {
        const title = talkTitle(item);
        if (!title.length || isPlaceholderCopy(title)) continue;
        nodes.push(this.talkRow(item, () => this.openTalk(item)));
      }
    }
    this.experienceList.replaceChildren(...nodes);
  }

  private talkRow(
    item: TalkItem | WritingItem,
    onOpen: () => void,
    opts?: { compact?: boolean; kind?: 'talk' | 'writing' },
  ): HTMLElement {
    const compact = opts?.compact ?? false;
    const kind = opts?.kind ?? 'talk';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = compact ? 'experience__row experience__row--compact' : 'experience__row';
    const thumb = document.createElement('span');
    thumb.className =
      kind === 'writing'
        ? 'experience__thumb experience__thumb--doc'
        : 'experience__thumb experience__thumb--video';
    thumb.setAttribute('aria-hidden', 'true');
    if (kind === 'writing') {
      const doc = document.createElement('img');
      doc.className = 'experience__doc-icon';
      doc.src = this.isMobile() ? FIGMA_DOC_PHONE : FIGMA_DOC;
      doc.width = 15;
      doc.height = 15;
      doc.alt = '';
      thumb.append(doc);
    } else {
      const talk = item as TalkItem;
      const src = talkThumbnailUrl(talk);
      if (src) {
        const img = document.createElement('img');
        img.className = 'experience__thumb-img';
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        thumb.appendChild(img);
      } else {
        thumb.innerHTML = '<span class="experience__play" aria-hidden="true">▶</span>';
      }
    }
    const copy = document.createElement('span');
    copy.className = 'experience__copy';
    const title = document.createElement('span');
    title.className = 'experience__row-title';
    const titleText = kind === 'writing' ? writingTitle(item as WritingItem) : talkTitle(item as TalkItem);
    if (titleText && !isPlaceholderCopy(titleText)) title.textContent = titleText;
    else title.hidden = true;
    const meta = document.createElement('span');
    meta.className = 'experience__row-meta';
    const metaText = kind === 'writing' ? writingMeta(item as WritingItem) : talkMeta(item as TalkItem);
    if (metaText && !isPlaceholderCopy(metaText)) meta.textContent = metaText;
    meta.hidden = !metaText || isPlaceholderCopy(metaText);
    copy.append(title, meta);
    btn.append(thumb, copy);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onOpen();
    });
    return btn;
  }

  private writingRow(item: WritingItem, section: WritingSection, compact = false): HTMLElement {
    const row = this.talkRow(item, () => this.openWriting(section, item), { compact, kind: 'writing' });
    if (item.id === 'ux-example-2' || item.id === 'sin-example-2') {
      row.querySelector('.experience__row-title')?.classList.add('experience__row-title--two-line');
    }
    return row;
  }

  private openTalk(item: TalkItem): void {
    this.activeTalkId = item.id;
    this.activeWriting = null;
    this.renderTalkPlayer(item);
    this.setExperienceView('detail');
    if (this.isMobile() && this.peekOnly) this.setPeek(false);
  }

  private openTalkUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private renderTalkPlayer(item: TalkItem): void {
    if (!this.experienceDetail) return;
    const title = talkTitle(item);
    const meta = talkMeta(item);
    const upNext = TALKS.filter((x) => x.id !== item.id).slice(0, 3);
    const thumb = talkThumbnailUrl(item);
    const wrap = document.createElement('div');
    wrap.className = 'talks-player';
    const media = document.createElement('div');
    media.className = 'talks-player__media';
    if (thumb) {
      const img = document.createElement('img');
      img.className = 'talks-player__thumb';
      img.src = thumb;
      img.alt = '';
      img.tabIndex = 0;
      img.role = 'button';
      img.addEventListener('click', () => this.openTalkUrl(item.url));
      img.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openTalkUrl(item.url);
        }
      });
      media.appendChild(img);
    }
    const open = document.createElement('a');
    open.className = 'ui-btn ui-btn--primary talks-player__open';
    open.href = item.url;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    open.textContent = t('talks.openVideo');
    wrap.append(media, open);
    requestAnimationFrame(() => {
      open.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    const h3 = document.createElement('h3');
    h3.className = 'talks-player__title';
    h3.textContent = title;
    wrap.appendChild(h3);
    const pMeta = document.createElement('p');
    pMeta.className = 'talks-player__meta';
    pMeta.textContent = meta;
    wrap.appendChild(pMeta);
    wrap.appendChild(Object.assign(document.createElement('hr'), { className: 'experience__divider' }));
    const h4 = document.createElement('h4');
    h4.className = 'experience__up-next';
    h4.textContent = t('talks.upNext');
    wrap.appendChild(h4);
    const list = document.createElement('div');
    list.className = 'experience__up-next-list';
    list.replaceChildren(
      ...upNext.map((talk) => this.talkRow(talk, () => this.openTalk(talk), { compact: true })),
    );
    wrap.appendChild(list);
    this.experienceDetail.replaceChildren(wrap);
  }

  private renderWritingsFilters(): void {
    if (!this.experienceFilters) return;
    type WritingsFilterId = 'all' | string;
    const sectionFilters = WRITINGS.filter((s) => s.items.some((i) => writingItemHasCopy(i))).map(
      (s) => ({
        id: s.id as WritingsFilterId,
        label: t(s.titleKey as I18nKey),
      }),
    );
    const filters: { id: WritingsFilterId; label: string }[] = [
      { id: 'all', label: t('writings.filter.all') },
      ...sectionFilters,
    ];
    this.experienceFilters.replaceChildren(
      ...filters.map(({ id, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'experience__filter';
        btn.dataset.writingsFilter = id;
        if (id === this.writingsFilter) btn.classList.add('is-active');
        btn.textContent = label;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.writingsFilter === id) return;
          this.writingsFilter = id;
          this.writingsSectionFocus = null;
          this.renderWritingsFilters();
          this.renderWritingsList();
        });
        return btn;
      }),
    );
  }

  private syncExperienceBackButton(): void {
    const back = this.el.querySelector('[data-exp-back]') as HTMLElement | null;
    if (!back) return;
    const showWritingsSection =
      this.mode === 'writings' &&
      this.experienceView === 'list' &&
      !!this.writingsSectionFocus;
    back.hidden = this.isMobile() && this.experienceView === 'list' && !showWritingsSection;
  }

  private renderWritingsList(): void {
    if (!this.experienceList) return;
    let sections =
      this.writingsFilter === 'all'
        ? WRITINGS
        : WRITINGS.filter((s) => s.id === this.writingsFilter);
    if (this.writingsSectionFocus) {
      sections = WRITINGS.filter((s) => s.id === this.writingsSectionFocus);
    }
    sections = sections
      .map((s) => ({ ...s, items: s.items.filter((i) => writingItemHasCopy(i)) }))
      .filter((s) => s.items.length > 0);
    const frag = document.createDocumentFragment();
    const rowLimit: Record<string, number> = { uxsc: 3 };
    let firstSection = true;
    for (const section of sections) {
      if (!firstSection) {
        const divider = document.createElement('hr');
        divider.className = 'experience__section-divider';
        frag.appendChild(divider);
      }
      firstSection = false;
      const previewLimit = rowLimit[section.id] ?? 3;
      const truncated = section.items.length > previewLimit;
      const showAll =
        this.writingsSectionFocus === section.id || this.writingsFilter === section.id;
      const visibleItems =
        showAll || !truncated ? section.items : section.items.slice(0, previewLimit);
      const block = document.createElement('div');
      block.className = 'experience__section';
      const head = document.createElement('div');
      head.className = 'experience__section-head';
      const row = document.createElement('div');
      row.className = 'experience__section-row';
      const h = document.createElement('h3');
      h.className = 'experience__section-title';
      h.textContent = t(section.titleKey as I18nKey);
      const badge = document.createElement('span');
      badge.className = 'experience__section-count';
      badge.textContent = String(section.items.length);
      const seeAll = document.createElement('button');
      seeAll.type = 'button';
      seeAll.className = 'experience__see-all';
      seeAll.textContent = t('writings.seeAll');
      seeAll.hidden =
        this.writingsSectionFocus === section.id || visibleItems.length >= section.items.length;
      seeAll.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.writingsSectionFocus = section.id;
        this.renderWritingsList();
        this.syncExperienceBackButton();
      });
      const spacer = document.createElement('div');
      spacer.className = 'experience__section-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      row.append(h, badge, spacer, seeAll);
      if (section.descKey) {
        const descText = t(section.descKey as I18nKey);
        if (descText && !isPlaceholderCopy(descText)) {
          const p = document.createElement('p');
          p.className = 'experience__section-desc';
          p.textContent = descText;
          head.append(row, p);
        } else {
          head.append(row);
        }
      } else {
        head.append(row);
      }
      block.appendChild(head);
      for (const item of visibleItems) {
        block.appendChild(this.writingRow(item, section));
      }
      frag.appendChild(block);
    }
    this.experienceList.replaceChildren(frag);
    this.syncExperienceBackButton();
  }

  private openWriting(section: WritingSection, item: WritingItem): void {
    this.activeWriting = { sectionId: section.id, itemId: item.id };
    this.activeTalkId = null;
    this.renderWritingReader(section, item);
    this.setExperienceView('detail');
    if (this.isMobile() && this.peekOnly) this.setPeek(false);
  }

  private renderWritingReader(_section: WritingSection, item: WritingItem): void {
    if (!this.experienceDetail) return;
    const title = writingTitle(item);
    const meta = writingMeta(item);
    const wrap = document.createElement('article');
    wrap.className = 'writings-reader';
    const docIcon = this.isMobile() ? FIGMA_DOC_PHONE : FIGMA_DOC;
    const substackIcon = this.isMobile() ? FIGMA_SUBSTACK_PHONE : FIGMA_SUBSTACK;
    const articleUrl = writingArticleUrl(item);
    wrap.innerHTML = `
      <div class="writings-reader__hero" aria-hidden="true">
        <img class="writings-reader__hero-icon" src="${docIcon}" width="15" height="15" alt="" />
      </div>
      <p class="writings-reader__kicker"></p>
      <h3 class="writings-reader__title"></h3>
      <p class="writings-reader__meta"></p>
    `;
    wrap.querySelector('.writings-reader__kicker')!.textContent = writingSourceLabel(item);
    wrap.querySelector('.writings-reader__title')!.textContent = title;
    const metaEl = wrap.querySelector('.writings-reader__meta') as HTMLElement;
    metaEl.textContent = meta;
    metaEl.hidden = !meta;
    if (articleUrl) {
      const sub = document.createElement('a');
      sub.className = 'writings-reader__substack';
      sub.href = articleUrl;
      sub.target = '_blank';
      sub.rel = 'noopener noreferrer';
      sub.innerHTML = `<img class="writings-reader__substack-icon" src="${substackIcon}" width="15" height="15" alt="" /><span class="writings-reader__substack-label"></span>`;
      sub.querySelector('.writings-reader__substack-label')!.textContent = t('writings.openArticle');
      wrap.appendChild(sub);
    }
    this.experienceDetail.replaceChildren(wrap);
  }

  showInterior(title: string, interiorId: string | null = null): void {
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    this.mode = 'interior';
    this.interiorId = interiorId;
    this.peekOnly = this.isMobile();
    this.el.classList.remove('building-panel--preview', 'building-panel--experience', 'building-panel--writings');
    if (this.expHeader) this.expHeader.hidden = true;
    if (this.experienceEl) this.experienceEl.hidden = true;
    this.titleEl.hidden = false;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.aboutEl.style.contentVisibility = '';
    this.el.removeAttribute('inert');
    this.el.classList.remove('building-panel--snap');
    this.setTitle(title, this.renderCase());
    this.renderWorkedWith();
    this.renderAbout();
    this.el.classList.add('building-panel--open');
    this.syncPeekClass();
    this.onVisibilityChange();
    studio.clearSubtitle();
    studio.playClick();
    studio.playCaseVoice(interiorId);
  }

  /** Map peek for non-case enterable buildings (e.g. estudio) while still on the map. */
  showBuildingPeek(buildingId: string, panelTitle?: string): void {
    const title = panelTitle ?? buildingId;
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    this.mode = 'interior';
    this.interiorId = buildingId;
    const expandOnPhone = this.isMobile() && buildingId === 'estudio';
    this.peekOnly = !expandOnPhone;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.aboutEl.style.contentVisibility = '';
    this.el.removeAttribute('inert');
    this.el.classList.remove('building-panel--snap');
    this.el.classList.remove('building-panel--preview');
    this.titleEl.hidden = false;
    if (this.previewEl) this.previewEl.hidden = true;
    this.setTitle(buildingId, title);
    this.renderWorkedWith();
    this.renderAbout();
    this.el.classList.add('building-panel--open');
    this.syncPeekClass();
    if (expandOnPhone) this.setPeek(false);
    this.onVisibilityChange();
    this.applyI18n();
    studio.playClick();
  }

  /** Stay on the map: lower-third card, then a full-copy expand. */
  showPreview(interiorId: string): void {
    if (!isCaseHouse(interiorId)) return;
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    this.clearExperiencePresentation();
    this.mode = 'preview';
    this.interiorId = interiorId;
    this.peekOnly = true;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.aboutEl.style.contentVisibility = '';
    this.el.removeAttribute('inert');
    this.el.classList.remove('building-panel--snap');
    const preview = casePreviewCopy(interiorId, getLang());
    const shown = this.renderCase();
    const title = preview?.title ?? shown ?? interiorId;
    const subtitle = preview?.subtitle ?? '';
    const teaser = this.isMobile()
      ? (preview?.teaser ?? '')
      : (preview?.teaserFull ?? preview?.teaser ?? '');
    if (this.previewKicker) {
      this.previewKicker.textContent = preview?.kicker?.split(' · ')[0] ?? t('panel.caseTag');
    }
    if (this.previewTitle) this.previewTitle.textContent = title;
    if (this.previewSubtitle) this.previewSubtitle.textContent = subtitle;
    if (this.previewTeaser) this.previewTeaser.textContent = teaser;
    const meta = this.el.querySelector('.case-preview__read-meta');
    if (meta) meta.textContent = preview?.pillMeta ?? 'Problem · What I did · Result';
    if (this.readBarTitle) {
      this.readBarTitle.textContent = this.isMobile() || !subtitle
        ? title
        : `${title}: ${subtitle.charAt(0).toLowerCase()}${subtitle.slice(1)}`;
    }
    if (this.readKicker) {
      const tag = t('panel.caseTag');
      const raw = preview?.kicker ?? tag;
      this.readKicker.textContent = raw.replace(/^CASE\b/, tag);
    }
    if (this.readHeadline) {
      this.readHeadline.textContent = this.isMobile()
        ? (preview?.teaser ?? title).replace(/[.]$/, '')
        : (preview?.teaserFull ?? preview?.teaser ?? title);
    }
    if (this.readLede) this.readLede.textContent = subtitle;
    const hero = this.el.querySelector('.case-read__hero');
    if (hero) hero.classList.add('case-read__hero--neutral');
    if (this.readHeroLabel) {
      this.readHeroLabel.textContent = '';
      this.readHeroLabel.hidden = true;
    }
    this.setTitle(interiorId, title);
    this.renderWorkedWith();
    this.renderAbout();
    this.el.classList.add('building-panel--open');
    this.syncPeekClass();
    this.onVisibilityChange();
    studio.clearSubtitle();
    studio.playClick();
    studio.playCaseVoice(interiorId);
  }

  /** QA: overlay open while still on the map (dismiss consume test). */
  showOverlayForQa(title: string): void {
    this.leaveArmed = false;
    this.mode = 'hidden';
    this.interiorId = null;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.el.removeAttribute('inert');
    this.setTitle(title, this.renderCase());
    this.renderAbout();
    this.peekOnly = false;
    this.el.hidden = false;
    this.el.classList.add('building-panel--open');
  }

  private setTitle(key: string, shown: string | null): void {
    this.openKey = key;
    this.el.dataset.panelKey = key;
    this.titleEl.textContent = shown ?? key;
    this.sheet.scrollTop = 0;
    this.syncScrolled();
  }

  private syncScrolled(): void {
    this.el.classList.toggle('building-panel--scrolled', this.sheet.scrollTop > 4);
  }

  /** Fills the case article for the current interior; returns its headline, or null when there is no case. */
  private renderCase(): string | null {
    const lang = getLang();
    const content = this.interiorId ? caseForLang(this.interiorId, lang) : undefined;
    this.caseEl.hidden = !content;
    this.caseEl.lang = lang;
    this.el.classList.toggle('building-panel--case', !!content);
    const full = this.caseEl.querySelector('.case__version--full')!;
    const short = this.caseEl.querySelector('.case__version--short')!;
    full.replaceChildren(...(content ? content.full.map(caseBlockNode) : []));
    short.replaceChildren(...(content ? content.short.map(caseBlockNode) : []));
    if (!content) return null;
    return this.isMobile() ? (content.shortHeadline ?? content.headline) : content.headline;
  }

  private syncCasePreview(interiorId: string): void {
    const preview = casePreviewCopy(interiorId, getLang());
    if (!preview) return;
    const teaser = this.isMobile() ? preview.teaser : (preview.teaserFull ?? preview.teaser);
    if (this.previewTitle) this.previewTitle.textContent = preview.title;
    if (this.previewSubtitle) this.previewSubtitle.textContent = preview.subtitle;
    if (this.previewTeaser) this.previewTeaser.textContent = teaser;
  }

  private renderAbout(): void {
    const about = !!this.interiorId && ABOUT_PANELS.has(this.interiorId);
    this.aboutEl.hidden = !about;
    this.el.classList.toggle('building-panel--about', about);
  }

  private renderWorkedWith(): void {
    const logos = this.interiorId && WORKED_WITH_PANELS.has(this.interiorId) ? this.workedWithLogos : [];
    const list = this.workedWithEl.querySelector('.worked-with__logos')!;
    list.replaceChildren(
      ...logos.map((logo) => {
        const li = document.createElement('li');
        li.className = 'worked-with__item';
        const img = document.createElement('img');
        img.className = logo.mono ? 'worked-with__logo worked-with__logo--mono' : 'worked-with__logo';
        img.src = /^(data:|https?:|\/)/.test(logo.file) ? logo.file : `${import.meta.env.BASE_URL}logos/${logo.file}`;
        img.alt = logo.name;
        img.decoding = 'async';
        img.loading = 'lazy';
        img.tabIndex = 0;
        li.appendChild(img);
        return li;
      }),
    );
    this.workedWithEl.hidden = logos.length === 0;
  }

  /** QA: render the strip with other logos (layout checks without the real files). */
  setWorkedWithForQa(logos: WorkedWithLogo[] | null): void {
    this.workedWithLogos = logos ?? WORKED_WITH;
    this.renderWorkedWith();
  }

  hide(opts?: { snap?: boolean; silent?: boolean }): void {
    const closingPreview = this.mode === 'preview';
    this.leaveArmed = false;
    this.clearExperiencePresentation();
    // Snap out of the hit tree on this frame (same as the mat). A transforming sheet still
    // intercepts iOS taps even with pointer-events:none, so Salir waited ~250 ms for map input.
    this.el.classList.add('building-panel--snap');
    this.el.classList.remove(
      'building-panel--open',
      'building-panel--peek',
      'building-panel--expanded',
      'building-panel--preview',
      'building-panel--experience',
      'building-panel--writings',
    );
    if (this.expHeader) this.expHeader.hidden = true;
    this.el.setAttribute('inert', '');
    this.el.style.visibility = 'hidden';
    this.el.style.pointerEvents = 'none';
    this.aboutEl.style.contentVisibility = 'hidden';
    this.el.hidden = true;
    this.mode = 'hidden';
    this.titleEl.hidden = false;
    if (this.previewEl) this.previewEl.hidden = true;
    if (this.readEl) this.readEl.hidden = true;
    if (this.readBar) this.readBar.hidden = true;
    this.el.classList.remove('building-panel--snap');
    if (!opts?.silent) {
      if (closingPreview) this.onCasePreviewClosed();
      this.onVisibilityChange();
    }
    if (opts?.snap) requestAnimationFrame(() => this.releaseCaseDom());
  }

  /** Drop case nodes after the sheet is off the hit tree. Safe if the panel reopened. */
  private releaseCaseDom(): void {
    if (this.mode !== 'hidden') return;
    this.caseEl.querySelector('.case__version--full')?.replaceChildren();
    this.caseEl.querySelector('.case__version--short')?.replaceChildren();
  }

  /** Same leave as the mat: `onSalir` → `leaveInteriorNow()`. */
  salir(): void {
    if (this.leaveArmed) return;
    this.leaveArmed = true;
    this.onSalir();
  }

  isOpen(): boolean {
    return this.el.classList.contains('building-panel--open');
  }

  isInteriorMode(): boolean {
    return (this.mode === 'interior' || this.mode === 'talks' || this.mode === 'writings') && this.isOpen();
  }

  isExperienceMode(): boolean {
    return (this.mode === 'talks' || this.mode === 'writings') && this.isOpen();
  }

  isPreviewMode(): boolean {
    return this.mode === 'preview' && this.isOpen();
  }

  isPreviewExpanded(): boolean {
    return this.isPreviewMode() && !this.peekOnly;
  }

  expandPreviewForQa(): void {
    if (!this.isPreviewMode()) return;
    this.setPeek(false);
  }

  collapsePreviewForQa(): void {
    if (!this.isPreviewMode()) return;
    this.setPeek(true);
  }

  openTitle(): string {
    return this.isOpen() ? this.openKey : '';
  }

  /** Mobile interior / experience sheet fully expanded (not peek). */
  isInteriorSheetExpanded(): boolean {
    if (!this.isOpen() || !this.isMobile() || this.peekOnly) return false;
    return (
      this.mode === 'interior' ||
      this.mode === 'talks' ||
      this.mode === 'writings' ||
      this.mode === 'preview'
    );
  }

  /** Peek / sheet inset for interior camera fit. */
  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (
      !this.isOpen() ||
      (this.mode !== 'interior' && this.mode !== 'preview' && this.mode !== 'talks' && this.mode !== 'writings')
    ) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    if (this.mode === 'preview') {
      const sheet = this.sheet.getBoundingClientRect();
      if (this.isMobile()) {
        return {
          left: 0,
          top: 0,
          right: 0,
          bottom: Math.ceil(Math.min(sheet.height, this.peekOnly ? 280 : window.innerHeight) + 8),
        };
      }
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const sheet = this.sheet.getBoundingClientRect();
    if (this.isMobile()) {
      const peek = this.el.classList.contains('building-panel--peek');
      if (this.isExperienceMode() && !peek) {
        const cap = Math.min(window.innerHeight * 0.42, 340);
        const bottom = Math.min(sheet.height, cap, window.innerHeight - 120);
        return { left: 0, top: 0, right: 0, bottom: Math.ceil(Math.max(88, bottom) + 8) };
      }
      const bottom = peek ? Math.min(88, sheet.height) : sheet.height;
      return { left: 0, top: 0, right: 0, bottom: Math.ceil(bottom + 8) };
    }
    return { left: Math.ceil(sheet.width + 64), top: 0, right: 0, bottom: 0 };
  }

  containsSheetPoint(clientX: number, clientY: number): boolean {
    if (!this.isOpen()) return false;
    const sheet = this.sheet.getBoundingClientRect();
    return (
      clientX >= sheet.left &&
      clientX <= sheet.right &&
      clientY >= sheet.top &&
      clientY <= sheet.bottom
    );
  }

  /** Mobile interior: outside sheet tap collapses expanded sheet or consumes (no map walk). */
  expandInteriorSheetForQa(): void {
    if (!this.isMobile() || !this.isOpen()) return;
    this.setPeek(false);
  }

  getExperienceSheetRectForQa(): { x: number; y: number; w: number; h: number } | null {
    if (!this.isOpen() || !this.isExperienceMode()) return null;
    const r = this.sheet.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  }

  collapseToPeekOnly(): void {
    if (!this.isMobile() || !this.isOpen()) return;
    this.setPeek(true);
  }

  consumeInteriorCanvasTap(clientX: number, clientY: number): boolean {
    if (!this.isOpen() || !this.isInteriorMode() || !this.isMobile()) return false;
    if (this.containsSheetPoint(clientX, clientY)) return false;
    if (this.peekOnly) return false;
    this.setPeek(true);
    return true;
  }

  private applyI18n(): void {
    this.el.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
    const exit = this.el.querySelector('[data-exit]') as HTMLElement | null;
    if (exit) exit.textContent = t('panel.exit');
    this.el.querySelectorAll('[data-close]').forEach((el) => {
      el.setAttribute('aria-label', t('panel.close'));
    });
    const read = this.el.querySelector('.case-preview__read-label');
    if (read) read.textContent = t('panel.readCase');
    const back = this.el.querySelector('[data-exp-back]') as HTMLElement | null;
    if (back) back.setAttribute('aria-label', t('experience.back'));
    const mobBack = this.el.querySelector('[data-exp-mobile-back]') as HTMLElement | null;
    if (mobBack) mobBack.setAttribute('aria-label', t('experience.back'));
    const mobClose = this.el.querySelector('[data-exp-mobile-close]') as HTMLElement | null;
    if (mobClose) mobClose.setAttribute('aria-label', t('panel.close'));
    this.el.querySelectorAll('[data-exp-expand]').forEach((el) => {
      el.setAttribute('aria-label', t('panel.expandSheet'));
    });
    const workedWithTitle = this.el.querySelector('#worked-with-title');
    if (workedWithTitle) workedWithTitle.textContent = t('panel.workedWith');
    const aboutTitle = this.el.querySelector('#about-title');
    if (aboutTitle) aboutTitle.textContent = t('panel.aboutMe');
  }
}
