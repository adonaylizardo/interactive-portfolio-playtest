import { aboutForLang } from '../data/about';
import {
  caseCardTitle,
  CASE_HOUSE_IDS,
  caseForLang,
  isCaseHouse,
  type CaseBlock,
  type CaseHouseId,
} from '../data/cases';
import {
  TALK_SECTIONS,
  TALKS,
  TALKS_COMING_SOON,
  WRITINGS,
  type TalkItem,
  type WritingItem,
} from '../data/experiences';
import { iconSvg } from './icons';
import { getLang, onLangChange, setLang, t, type I18nKey } from './i18n';
import {
  talkMeta,
  talkSectionTitle,
  talkThumbnailUrl,
  talkTitle,
  writingMeta,
  writingTitle,
} from './contentLabels';
import { createAboutContactBlock } from './aboutContactBlock';
import {
  goBackToReadingList,
  navigateReading,
  parseReadingAnchor,
  type ReadingRoute,
} from './readingRoute';

const LANDMARK_IDS = ['sambil', 'catedral', 'flor'] as const;

const ACHIEVEMENT_KEYS: I18nKey[] = [
  'chrome.achievement1',
  'chrome.achievement2',
  'chrome.achievement3',
  'chrome.achievement4',
];

const DEFAULT_DOC_TITLE = typeof document !== 'undefined' ? document.title : 'Playtest';

const LIST_ROWS: { slug: string; section: I18nKey; labelKey?: I18nKey; label?: string }[] = [
  { slug: 'estudio', section: 'read.section.about', labelKey: 'read.section.about' },
  { slug: 'experiencia', section: 'read.section.experience', labelKey: 'read.section.experience' },
  { slug: 'logros', section: 'read.section.achievements', labelKey: 'read.section.achievements' },
  ...CASE_HOUSE_IDS.map((id) => ({
    slug: id,
    section: 'read.section.cases' as I18nKey,
  })),
  { slug: 'talks', section: 'read.section.talks', labelKey: 'read.section.talks' },
  { slug: 'writings', section: 'read.section.writings', labelKey: 'read.section.writings' },
  ...LANDMARK_IDS.map((id) => ({
    slug: id,
    section: 'read.section.landmarks' as I18nKey,
    label: id === 'flor' ? 'Flor de Venezuela' : id === 'catedral' ? 'Catedral' : 'Sambil',
  })),
];

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

export class ReadingView {
  readonly root: HTMLElement;
  private scroll: HTMLElement;
  private main: HTMLElement;
  private route: ReadingRoute = { kind: 'list' };
  private onExitMap: () => void;

  constructor(container: HTMLElement, onExitMap: () => void) {
    this.onExitMap = onExitMap;
    this.root = document.createElement('div');
    this.root.className = 'reading-view';
    this.root.hidden = true;
    this.root.innerHTML = `
      <header class="reading-view__header">
        <button type="button" class="reading-view__back-pill ui-btn ui-btn--secondary" data-back>
          <span data-i18n="read.backToMap">Volver al mapa</span>
        </button>
        <button type="button" class="reading-view__back-pill ui-btn ui-btn--secondary" data-back-list hidden>
          <span data-i18n="read.backToList">Volver a la lista</span>
        </button>
        <h1 class="reading-view__site-title" data-i18n="read.title">Leer</h1>
        <button type="button" class="reading-view__lang ui-round" data-reading-lang aria-label="Language">ES</button>
      </header>
      <div class="reading-view__scroll" tabindex="-1"></div>
    `;
    container.appendChild(this.root);
    this.scroll = this.root.querySelector('.reading-view__scroll')!;
    this.main = document.createElement('div');
    this.main.className = 'reading-view__main';
    this.scroll.appendChild(this.main);
    this.bind();
    onLangChange(() => {
      this.applyI18n();
      if (!this.root.hidden) {
        this.render();
        this.syncDocumentTitle();
      }
    });
  }

  private bind(): void {
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.onExitMap());
    this.root.querySelector('[data-back-list]')?.addEventListener('click', () => {
      goBackToReadingList(() => {
        this.route = { kind: 'list' };
        this.applyI18n();
        this.render();
        this.scroll.scrollTop = 0;
      });
    });
    this.root.querySelector('[data-reading-lang]')?.addEventListener('click', () => {
      setLang(getLang() === 'es' ? 'en' : 'es');
    });
  }

  isActive(): boolean {
    return !this.root.hidden;
  }

  syncRoute(route: ReadingRoute | null): void {
    if (!route) {
      this.root.hidden = true;
      document.body.dataset.reading = '0';
      this.syncDocumentTitle();
      return;
    }
    this.route = route;
    this.root.hidden = false;
    document.body.dataset.reading = '1';
    this.applyI18n();
    this.render();
    this.syncDocumentTitle();
    if (!(route.kind === 'detail' && route.slug === 'estudio' && parseReadingAnchor())) {
      this.scroll.scrollTop = 0;
    }
  }

  private syncDocumentTitle(): void {
    if (this.root.hidden) {
      document.title = DEFAULT_DOC_TITLE;
      return;
    }
    if (this.route.kind === 'list') {
      document.title = `${t('read.title')} — ${DEFAULT_DOC_TITLE}`;
      return;
    }
    const route = this.route;
    if (route.kind !== 'detail') return;
    const row = LIST_ROWS.find((r) => r.slug === route.slug);
    const page =
      route.slug === 'estudio'
        ? t('read.aboutTitle')
        : row?.label ?? (row?.labelKey ? t(row.labelKey) : route.slug);
    document.title = `${page} — ${t('read.title')}`;
  }

  private applyI18n(): void {
    this.root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as I18nKey;
      if (key) el.textContent = t(key);
    });
    this.root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18nAria as I18nKey;
      if (key) el.setAttribute('aria-label', t(key));
    });
    const backMap = this.root.querySelector('[data-back]') as HTMLElement;
    const backList = this.root.querySelector('[data-back-list]') as HTMLElement;
    const onDetail = this.route.kind === 'detail';
    backMap.hidden = onDetail;
    backList.hidden = !onDetail;
    const langBtn = this.root.querySelector('[data-reading-lang]') as HTMLButtonElement | null;
    if (langBtn) langBtn.textContent = getLang() === 'es' ? 'ES' : 'EN';
  }

  private render(): void {
    if (this.route.kind === 'list') {
      this.renderList();
      return;
    }
    this.renderDetail(this.route.slug);
  }

  private renderList(): void {
    const frag = document.createDocumentFragment();
    const intro = document.createElement('p');
    intro.className = 'reading-view__intro';
    intro.textContent = t('read.listIntro');
    frag.appendChild(intro);

    let lastSection: I18nKey | null = null;
    for (const row of LIST_ROWS) {
      if (row.section !== lastSection) {
        lastSection = row.section;
        const h = document.createElement('h2');
        h.className = 'reading-view__section-title';
        h.textContent = t(row.section);
        frag.appendChild(h);
      }
      const label = isCaseHouse(row.slug)
        ? caseCardTitle(row.slug, getLang())
        : row.label ?? (row.labelKey ? t(row.labelKey) : row.slug);
      const summary = isCaseHouse(row.slug as CaseHouseId)
        ? caseForLang(row.slug, getLang())?.subtitle
        : LANDMARK_IDS.includes(row.slug as (typeof LANDMARK_IDS)[number])
          ? (() => {
              const b = caseForLang(row.slug, getLang())?.full[0];
              return b && b.kind === 'section' ? b.paragraphs[0] : undefined;
            })()
          : undefined;
      frag.appendChild(this.listRow(row.slug, label, summary));
    }
    this.main.replaceChildren(frag);
  }

  private listRow(slug: string, label: string, summary?: string): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reading-view__row';
    const title = document.createElement('span');
    title.className = 'reading-view__row-title';
    title.textContent = label;
    btn.appendChild(title);
    if (summary) {
      const sub = document.createElement('span');
      sub.className = 'reading-view__row-summary';
      sub.textContent = summary;
      btn.appendChild(sub);
    }
    btn.addEventListener('click', () => {
      navigateReading({ kind: 'detail', slug });
      this.route = { kind: 'detail', slug };
      this.applyI18n();
      this.render();
      this.syncDocumentTitle();
      this.scroll.scrollTop = 0;
    });
    return btn;
  }

  private renderDetail(slug: string): void {
    if (slug === 'estudio') {
      this.renderAbout();
      return;
    }
    if (slug === 'logros') {
      this.renderAchievements();
      return;
    }
    if (slug === 'experiencia') {
      this.renderExperience();
      return;
    }
    if (slug === 'talks') {
      this.renderTalks();
      return;
    }
    if (slug === 'writings') {
      this.renderWritingsList();
      return;
    }
    if (isCaseHouse(slug) || LANDMARK_IDS.includes(slug as (typeof LANDMARK_IDS)[number])) {
      this.renderCase(slug);
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'reading-view__miss';
    const miss = document.createElement('p');
    miss.className = 'reading-view__empty';
    miss.textContent = t('read.notFound');
    const backList = document.createElement('button');
    backList.type = 'button';
    backList.className = 'reading-view__inline-back ui-btn ui-btn--secondary';
    backList.innerHTML = `<span>${t('read.backToList')}</span>`;
    backList.addEventListener('click', () => {
      goBackToReadingList(() => {
        this.route = { kind: 'list' };
        this.applyI18n();
        this.render();
        this.scroll.scrollTop = 0;
      });
    });
    wrap.append(miss, backList);
    this.main.replaceChildren(wrap);
  }

  private renderAbout(): void {
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article reading-view__article--about';
    const pageTitle = document.createElement('h2');
    pageTitle.className = 'reading-view__detail-title';
    pageTitle.textContent = t('read.aboutTitle');
    wrap.appendChild(pageTitle);

    let contactInserted = false;
    let introLedeDone = false;
    for (const block of aboutForLang(getLang())) {
      if (block.kind === 'heading') {
        const tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
        const hx = document.createElement(tag);
        hx.textContent = block.text;
        if (block.level >= 2) {
          hx.id = block.id;
          if (block.level === 3 && !introLedeDone) {
            introLedeDone = true;
            hx.className = 'reading-about__lede';
          } else {
            hx.className = 'reading-about__section-title';
          }
        } else {
          hx.className = 'reading-about__headline';
        }
        wrap.appendChild(hx);
        if (block.level === 3 && !contactInserted) {
          wrap.appendChild(createAboutContactBlock());
          contactInserted = true;
        }
      } else if (block.kind === 'paragraph') {
        const p = document.createElement('p');
        p.className = 'about__text';
        for (const line of block.lines) {
          for (const part of line) {
            if (part.href) {
              const a = document.createElement('a');
              a.href = part.href;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.textContent = part.text;
              p.appendChild(a);
            } else {
              p.appendChild(document.createTextNode(part.text));
            }
          }
          p.appendChild(document.createElement('br'));
        }
        wrap.appendChild(p);
      } else if (block.kind === 'image') {
        const picture = document.createElement('picture');
        const frame = document.createElement('div');
        frame.className = 'about__photo-frame';
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
        picture.append(webp, img);
        frame.appendChild(picture);
        wrap.appendChild(frame);
      }
    }
    this.main.replaceChildren(wrap);
    this.scrollToAboutAnchor();
  }

  private scrollToAboutAnchor(): void {
    const anchor = parseReadingAnchor();
    if (!anchor || this.route?.kind !== 'detail' || this.route.slug !== 'estudio') return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(anchor);
      if (!target) return;
      const scrollerTop = this.scroll.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      this.scroll.scrollTop += targetTop - scrollerTop - 12;
    });
  }

  private renderAchievements(): void {
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = t('read.section.achievements');
    wrap.appendChild(h);
    const list = document.createElement('ul');
    list.className = 'reading-view__achievements';
    for (const key of ACHIEVEMENT_KEYS) {
      const li = document.createElement('li');
      li.textContent = t(key);
      list.appendChild(li);
    }
    wrap.appendChild(list);
    this.main.replaceChildren(wrap);
  }

  private renderExperience(): void {
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = t('read.section.experience');
    wrap.appendChild(h);
    const list = document.createElement('div');
    list.className = 'reading-view__stack';
    for (const id of CASE_HOUSE_IDS) {
      const row = document.createElement('div');
      row.className = 'reading-view__row reading-view__row--static';
      const title = document.createElement('span');
      title.className = 'reading-view__row-title';
      title.textContent = caseCardTitle(id, getLang());
      const meta = document.createElement('span');
      meta.className = 'reading-view__row-summary';
      meta.textContent = t(`chrome.exp.${id}` as I18nKey);
      row.append(title, meta);
      list.appendChild(row);
    }
    wrap.appendChild(list);
    this.main.replaceChildren(wrap);
  }

  private renderCase(id: string): void {
    const content = caseForLang(id, getLang());
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article case-read';
    wrap.lang = getLang();
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    const headline = content?.headline ?? (isCaseHouse(id) ? caseCardTitle(id, getLang()) : id);
    h.textContent = headline;
    wrap.appendChild(h);
    if (content?.subtitle && content.subtitle !== headline) {
      const sub = document.createElement('p');
      sub.className = 'reading-view__detail-sub';
      sub.textContent = content.subtitle;
      wrap.appendChild(sub);
    }
    const body = document.createElement('div');
    body.className = 'case__version case__version--full';
    body.replaceChildren(...(content ? content.full.map(caseBlockNode) : []));
    wrap.appendChild(body);
    const backList = document.createElement('button');
    backList.type = 'button';
    backList.className = 'reading-view__back ui-btn ui-btn--secondary reading-view__back--inline';
    backList.innerHTML = `${iconSvg('chevron')} <span data-i18n="read.backToList">${t('read.backToList')}</span>`;
    backList.addEventListener('click', () => {
      goBackToReadingList(() => {
        this.route = { kind: 'list' };
        this.applyI18n();
        this.render();
        this.scroll.scrollTop = 0;
      });
    });
    wrap.appendChild(backList);
    this.main.replaceChildren(wrap);
  }

  private renderTalks(): void {
    const wrap = document.createElement('section');
    wrap.className = 'reading-view__article';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = t('read.section.talks');
    wrap.appendChild(h);
    if (TALKS_COMING_SOON || TALKS.length === 0) {
      const p = document.createElement('p');
      p.className = 'reading-view__empty';
      p.textContent = t('talks.comingSoon');
      wrap.appendChild(p);
    } else {
      const list = document.createElement('div');
      list.className = 'reading-view__stack';
      for (const section of TALK_SECTIONS) {
        const heading = talkSectionTitle(section);
        if (heading) {
          const sh = document.createElement('h3');
          sh.className = 'reading-view__section-title';
          sh.textContent = heading;
          list.appendChild(sh);
        }
        for (const item of section.items) {
          list.appendChild(this.talkRow(item));
        }
      }
      wrap.appendChild(list);
    }
    this.main.replaceChildren(wrap);
  }

  private talkRow(item: TalkItem): HTMLElement {
    const row = document.createElement('a');
    row.className = 'reading-view__row reading-view__row--link reading-view__row--talk';
    row.href = item.url;
    row.target = '_blank';
    row.rel = 'noopener noreferrer';
    const thumbSrc = talkThumbnailUrl(item);
    if (thumbSrc) {
      const thumb = document.createElement('img');
      thumb.className = 'reading-view__talk-thumb';
      thumb.src = thumbSrc;
      thumb.alt = '';
      thumb.loading = 'lazy';
      row.appendChild(thumb);
    }
    const copy = document.createElement('span');
    copy.className = 'reading-view__talk-copy';
    const title = document.createElement('span');
    title.className = 'reading-view__row-title';
    title.textContent = talkTitle(item);
    copy.appendChild(title);
    const meta = talkMeta(item);
    if (meta) {
      const m = document.createElement('span');
      m.className = 'reading-view__row-summary';
      m.textContent = meta;
      copy.appendChild(m);
    }
    row.appendChild(copy);
    return row;
  }

  private renderWritingsList(): void {
    const wrap = document.createElement('section');
    wrap.className = 'reading-view__article';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = t('read.section.writings');
    wrap.appendChild(h);
    const list = document.createElement('div');
    list.className = 'reading-view__stack';
    for (const section of WRITINGS) {
      for (const item of section.items) {
        list.appendChild(this.writingLinkRow(item));
      }
    }
    wrap.appendChild(list);
    this.main.replaceChildren(wrap);
  }

  private writingLinkRow(item: WritingItem): HTMLElement {
    const a = document.createElement('a');
    a.className = 'reading-view__row reading-view__row--link';
    a.href = item.url ?? '#';
    if (item.url) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    const title = document.createElement('span');
    title.className = 'reading-view__row-title';
    title.textContent = writingTitle(item);
    a.appendChild(title);
    const meta = writingMeta(item);
    if (meta) {
      const m = document.createElement('span');
      m.className = 'reading-view__row-summary';
      m.textContent = meta;
      a.appendChild(m);
    }
    return a;
  }
}
