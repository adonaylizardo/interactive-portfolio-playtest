import { ABOUT, ABOUT_PANELS, type AboutBlock } from '../data/about';
import { CASES, type CaseBlock } from '../data/cases';
import { WORKED_WITH, WORKED_WITH_PANELS, type WorkedWithLogo } from '../data/workedWith';

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
  const h = document.createElement('h3');
  h.className = 'case__heading';
  h.textContent = block.heading;
  section.appendChild(h);
  for (const text of block.paragraphs) {
    const p = document.createElement('p');
    p.className = 'case__text';
    p.textContent = text;
    section.appendChild(p);
  }
  if (block.bullets) {
    const ul = document.createElement('ul');
    ul.className = 'case__list';
    for (const text of block.bullets) {
      const li = document.createElement('li');
      li.textContent = text;
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
  private mode: 'hidden' | 'interior' = 'hidden';
  private peekOnly = true;
  private dragStartY = 0;

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
    this.aboutEl.append(...ABOUT.map(aboutBlockNode));
    // Touch has no hover: a tap shows that logo's colours until another logo (or the same one) is tapped.
    this.workedWithEl.addEventListener('click', (e) => {
      const hit = (e.target as HTMLElement).closest('.worked-with__logo');
      for (const img of this.workedWithEl.querySelectorAll('.worked-with__logo')) {
        img.classList.toggle('is-revealed', img === hit && !img.classList.contains('is-revealed'));
      }
    });

    this.el.querySelector('[data-exit]')!.addEventListener('click', () => this.salir());
    this.el.querySelector('[data-backdrop]')!.addEventListener('click', () => {
      if (this.isMobile() && this.mode === 'interior') this.setPeek(true);
    });
    this.sheet.addEventListener('scroll', () => this.syncScrolled(), { passive: true });
    this.sheet.addEventListener('click', (e) => e.stopPropagation());
    this.sheet.addEventListener('pointerdown', (e) => e.stopPropagation());

    const drag = this.el.querySelector('[data-drag]') as HTMLElement;
    drag.addEventListener('pointerdown', (e) => this.onDragStart(e));
    window.addEventListener('pointermove', (e) => this.onDragMove(e));
    window.addEventListener('pointerup', () => this.onDragEnd());

    this.titleEl.addEventListener('click', () => {
      if (this.isMobile() && this.peekOnly) this.setPeek(false);
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.salir();
      }
    });

    window.matchMedia('(max-width: 767px)').addEventListener('change', () => this.syncPeekClass());
  }

  private isMobile(): boolean {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  private setPeek(peek: boolean): void {
    this.peekOnly = peek;
    this.syncPeekClass();
    this.onVisibilityChange();
  }

  private syncPeekClass(): void {
    const mobileInterior = this.isMobile() && this.mode === 'interior' && this.isOpen();
    this.el.classList.toggle('building-panel--peek', mobileInterior && this.peekOnly);
    this.el.classList.toggle(
      'building-panel--expanded',
      mobileInterior && !this.peekOnly,
    );
  }

  private onDragStart(e: PointerEvent): void {
    if (!this.isMobile() || !this.isOpen()) return;
    this.dragStartY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  private onDragMove(e: PointerEvent): void {
    if (!this.dragStartY) return;
    const dy = e.clientY - this.dragStartY;
    if (dy > 40 && !this.peekOnly) this.setPeek(true);
    if (dy < -40 && this.peekOnly) this.setPeek(false);
  }

  private onDragEnd(): void {
    this.dragStartY = 0;
  }

  showInterior(title: string, interiorId: string | null = null): void {
    this.mode = 'interior';
    this.interiorId = interiorId;
    this.setTitle(title, this.renderCase());
    this.renderWorkedWith();
    this.renderAbout();
    this.peekOnly = this.isMobile();
    this.el.hidden = false;
    requestAnimationFrame(() => {
      this.el.classList.add('building-panel--open');
      this.syncPeekClass();
      this.onVisibilityChange();
    });
  }

  /** QA: overlay open while still on the map (dismiss consume test). */
  showOverlayForQa(title: string): void {
    this.mode = 'hidden';
    this.interiorId = null;
    this.setTitle(title, this.renderCase());
    this.renderAbout();
    this.peekOnly = false;
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add('building-panel--open'));
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
    return content?.headline ?? null;
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

  hide(): void {
    this.el.classList.remove('building-panel--open', 'building-panel--peek');
    const delay = this.reducedMotion() ? 0 : 200;
    setTimeout(() => {
      if (!this.el.classList.contains('building-panel--open')) {
        this.el.hidden = true;
        this.mode = 'hidden';
      }
    }, delay);
    this.onVisibilityChange();
  }

  salir(): void {
    this.hide();
    this.onSalir();
  }

  isOpen(): boolean {
    return this.el.classList.contains('building-panel--open');
  }

  isInteriorMode(): boolean {
    return this.mode === 'interior' && this.isOpen();
  }

  openTitle(): string {
    return this.isOpen() ? this.openKey : '';
  }

  /** Peek / sheet inset for interior camera fit. */
  layoutInsets(): { left: number; top: number; right: number; bottom: number } {
    if (!this.isOpen() || this.mode !== 'interior') {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }
    const sheet = this.sheet.getBoundingClientRect();
    if (this.isMobile()) {
      const peek = this.el.classList.contains('building-panel--peek');
      const bottom = peek ? Math.min(88, sheet.height) : sheet.height;
      return { left: 0, top: 0, right: 0, bottom: Math.ceil(bottom + 8) };
    }
    return { left: 0, top: 0, right: Math.ceil(sheet.width + 32), bottom: 0 };
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

  private reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
