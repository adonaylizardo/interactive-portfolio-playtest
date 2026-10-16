import { studio } from '../audio/studio';
import { ABOUT, ABOUT_PANELS, type AboutBlock } from '../data/about';
import { CASES, casePreviewCopy, isCaseHouse, type CaseBlock } from '../data/cases';
import { WORKED_WITH, WORKED_WITH_PANELS, type WorkedWithLogo } from '../data/workedWith';
import { iconSvg } from './icons';

function aboutBlockNode(block: AboutBlock): HTMLElement {
  if (block.kind === 'heading') {
    const h = document.createElement(`h${block.level + 3}`);
    h.className = `about__h${block.level}`;
    h.textContent = block.text;
    return h;
  }
  if (block.kind === 'image') {
    const picture = document.createElement('picture');
    picture.className = 'about__photo';
    const webp = document.createElement('source');
    webp.type = 'image/webp';
    webp.srcset = `${import.meta.env.BASE_URL}about/${block.name}.webp`;
    const img = document.createElement('img');
    img.src = `${import.meta.env.BASE_URL}about/${block.fallback}`;
    img.width = block.width;
    img.height = block.height;
    img.alt = block.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    picture.append(webp, img);
    return picture;
  }
  const p = document.createElement('p');
  p.className = 'about__text';
  block.lines.forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    for (const part of line) {
      if (!part.href) {
        p.appendChild(document.createTextNode(part.text));
        continue;
      }
      const a = document.createElement('a');
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = part.text;
      p.appendChild(a);
    }
  });
  return p;
}

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
  private onSalir: () => void;
  private mode: 'hidden' | 'interior' | 'preview' = 'hidden';
  private previewEl: HTMLElement | null = null;
  private previewTitle: HTMLElement | null = null;
  private previewSubtitle: HTMLElement | null = null;
  private previewTeaser: HTMLElement | null = null;
  private readEl: HTMLElement | null = null;
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

  constructor(
    container: HTMLElement,
    onVisibilityChange: () => void,
    onSalir: () => void,
  ) {
    this.onVisibilityChange = onVisibilityChange;
    this.onSalir = onSalir;
    this.el = document.createElement('div');
    this.el.className = 'building-panel building-panel--interior-only';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="building-panel__backdrop" data-backdrop></div>
      <div class="building-panel__sheet" role="dialog" aria-modal="true">
        <div class="building-panel__drag" data-drag aria-hidden="true"></div>
        <div class="building-panel__bar">
          <button type="button" class="building-panel__exit" data-exit>Salir</button>
          <button type="button" class="building-panel__close" data-close aria-label="Cerrar">×</button>
        </div>
        <div class="case-preview" data-preview hidden>
          <div class="case-preview__handle" aria-hidden="true"></div>
          <div class="case-preview__head">
            <div class="case-preview__titles">
              <p class="case-preview__kicker">CASE</p>
              <h2 class="case-preview__title"></h2>
            </div>
            <button type="button" class="case-preview__x" data-close aria-label="Cerrar">${iconSvg('close')}</button>
          </div>
          <p class="case-preview__subtitle"></p>
          <p class="case-preview__teaser"></p>
          <button type="button" class="case-preview__read" data-read>
            <span class="case-preview__read-logo">${iconSvg('briefcase')}</span>
            <span class="case-preview__read-copy">
              <span class="case-preview__read-label">Read case</span>
              <span class="case-preview__read-meta">Problem · What I did · Result</span>
            </span>
            <span class="case-preview__read-go" aria-hidden="true">${iconSvg('arrowNe')}</span>
          </button>
        </div>
        <div class="case-read" data-read-view hidden>
          <div class="case-read__bar">
            <p class="case-read__bar-title"></p>
            <button type="button" class="case-read__x" data-close aria-label="Cerrar">${iconSvg('close')}</button>
          </div>
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
            <h3 class="worked-with__title" id="worked-with-title">Worked with</h3>
            <ul class="worked-with__logos"></ul>
          </section>
          <section class="about" lang="en" aria-labelledby="about-title" hidden>
            <h3 class="about__title" id="about-title">About me</h3>
          </section>
        </div>
      </div>
    `;
    container.appendChild(this.el);
    this.sheet = this.el.querySelector('.building-panel__sheet')!;
    this.titleEl = this.el.querySelector('.building-panel__title')!;
    this.workedWithEl = this.el.querySelector('.worked-with')!;
    this.caseEl = this.el.querySelector('.case')!;
    this.aboutEl = this.el.querySelector('.about')!;
    this.previewEl = this.el.querySelector('[data-preview]') as HTMLElement;
    this.previewTitle = this.el.querySelector('.case-preview__title');
    this.previewSubtitle = this.el.querySelector('.case-preview__subtitle');
    this.previewTeaser = this.el.querySelector('.case-preview__teaser');
    this.readEl = this.el.querySelector('[data-read-view]') as HTMLElement;
    this.readBarTitle = this.el.querySelector('.case-read__bar-title');
    this.readKicker = this.el.querySelector('.case-read__kicker');
    this.readHeadline = this.el.querySelector('.case-read__headline');
    this.readLede = this.el.querySelector('.case-read__lede');
    this.readHeroLabel = this.el.querySelector('.case-read__hero-label');
    this.aboutEl.append(...ABOUT.map(aboutBlockNode));
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
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());

    const drag = this.el.querySelector('[data-drag]') as HTMLElement;
    drag.addEventListener('pointerdown', (e) => this.onDragStart(e));
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', () => this.onDragEnd());

    this.titleEl.addEventListener('click', () => {
      if (this.peekOnly && this.isMobile() && this.mode === 'interior') this.setPeek(false);
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
        this.closePreview();
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

  private setPeek(peek: boolean): void {
    this.peekOnly = peek;
    this.dragStartY = 0;
    this.ignoreDragUntil = performance.now() + 400;
    this.syncPeekClass();
    this.onVisibilityChange();
  }

  private syncPeekClass(): void {
    const preview = this.mode === 'preview' && this.isOpen();
    const mobileInterior = this.isMobile() && this.mode === 'interior' && this.isOpen();
    const peek = (preview || mobileInterior) && this.peekOnly;
    const expanded = (preview || mobileInterior) && !this.peekOnly;
    this.el.classList.toggle('building-panel--peek', peek);
    this.el.classList.toggle('building-panel--expanded', expanded);
    this.el.classList.toggle('building-panel--preview', preview);
    if (this.previewEl) this.previewEl.hidden = !preview || !this.peekOnly;
    if (this.readEl) this.readEl.hidden = !preview || this.peekOnly;
    this.titleEl.hidden = preview;
  }

  private closePreview(): void {
    if (this.mode !== 'preview') return;
    if (!this.peekOnly || this.el.classList.contains('building-panel--expanded')) {
      this.setPeek(true);
      return;
    }
    this.hide();
  }

  private onDragStart(e: PointerEvent): void {
    if (!this.isMobile() || !this.isOpen() || this.mode === 'preview') return;
    if (performance.now() < this.ignoreDragUntil) return;
    this.dragStartY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
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

  showInterior(title: string, interiorId: string | null = null): void {
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    this.mode = 'interior';
    this.interiorId = interiorId;
    this.peekOnly = this.isMobile();
    this.el.classList.remove('building-panel--preview');
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
    studio.playClick();
    studio.playCaseVoice(interiorId);
  }

  /** Stay on the map: lower-third card, then a full-copy expand. */
  showPreview(interiorId: string): void {
    if (!isCaseHouse(interiorId)) return;
    this.leaveArmed = false;
    this.exitPress = null;
    this.exitFromPointer = false;
    this.mode = 'preview';
    this.interiorId = interiorId;
    this.peekOnly = true;
    this.el.hidden = false;
    this.el.style.visibility = '';
    this.el.style.pointerEvents = '';
    this.aboutEl.style.contentVisibility = '';
    this.el.removeAttribute('inert');
    this.el.classList.remove('building-panel--snap');
    const preview = casePreviewCopy(interiorId);
    const shown = this.renderCase();
    const title = preview?.title ?? shown ?? interiorId;
    const subtitle = preview?.subtitle ?? '';
    const teaser = this.isMobile()
      ? (preview?.teaser ?? '')
      : (preview?.teaserFull ?? preview?.teaser ?? '');
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
    if (this.readKicker) this.readKicker.textContent = preview?.kicker ?? 'CASE';
    if (this.readHeadline) {
      this.readHeadline.textContent = this.isMobile()
        ? (preview?.teaser ?? title).replace(/[.]$/, '')
        : (preview?.teaserFull ?? preview?.teaser ?? title);
    }
    if (this.readLede) this.readLede.textContent = subtitle;
    if (this.readHeroLabel) this.readHeroLabel.textContent = preview?.placeholder ?? 'IMAGE PLACEHOLDER';
    this.setTitle(interiorId, title);
    this.renderWorkedWith();
    this.renderAbout();
    this.el.classList.add('building-panel--open');
    this.syncPeekClass();
    this.onVisibilityChange();
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
    const content = this.interiorId ? CASES[this.interiorId] : undefined;
    this.caseEl.hidden = !content;
    this.el.classList.toggle('building-panel--case', !!content);
    const full = this.caseEl.querySelector('.case__version--full')!;
    const short = this.caseEl.querySelector('.case__version--short')!;
    full.replaceChildren(...(content ? content.full.map(caseBlockNode) : []));
    short.replaceChildren(...(content ? content.short.map(caseBlockNode) : []));
    if (!content) return null;
    return this.isMobile() ? (content.shortHeadline ?? content.headline) : content.headline;
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
    // Snap out of the hit tree on this frame (same as the mat). A transforming sheet still
    // intercepts iOS taps even with pointer-events:none, so Salir waited ~250 ms for map input.
    this.el.classList.add('building-panel--snap');
    this.el.classList.remove(
      'building-panel--open',
      'building-panel--peek',
      'building-panel--expanded',
      'building-panel--preview',
    );
    this.el.setAttribute('inert', '');
    this.el.style.visibility = 'hidden';
    this.el.style.pointerEvents = 'none';
    this.aboutEl.style.contentVisibility = 'hidden';
    this.el.hidden = true;
    this.mode = 'hidden';
    this.titleEl.hidden = false;
    if (this.previewEl) this.previewEl.hidden = true;
    if (this.readEl) this.readEl.hidden = true;
    this.el.classList.remove('building-panel--snap');
    if (!opts?.silent) this.onVisibilityChange();
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
    return this.mode === 'interior' && this.isOpen();
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

  /** Peek / sheet inset for interior camera fit. */
  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (!this.isOpen() || (this.mode !== 'interior' && this.mode !== 'preview')) {
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
    if (!this.isMobile()) return;
    this.peekOnly = false;
    this.syncPeekClass();
    this.onVisibilityChange();
  }

  collapseToPeekOnly(): void {
    if (!this.isMobile() || !this.isOpen()) return;
    this.setPeek(true);
  }

  consumeInteriorCanvasTap(clientX: number, clientY: number): boolean {
    if (!this.isOpen() || this.mode !== 'interior' || !this.isMobile()) return false;
    if (this.containsSheetPoint(clientX, clientY)) return false;
    if (this.peekOnly) return false;
    this.setPeek(true);
    return true;
  }
}
