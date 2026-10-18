import { ABOUT } from '../data/about';
import {
  CASE_CARD_TITLES,
  CASE_HOUSE_IDS,
  CASES,
  isCaseHouse,
  type CaseBlock,
} from '../data/cases';
import {
  TALK_SECTIONS,
  TALKS,
  TALKS_COMING_SOON,
  WRITINGS,
  WRITINGS_SUBSTACK_URL,
  type TalkItem,
  type WritingItem,
} from '../data/experiences';
import { VOICE_LINES } from '../data/voice-lines';
import { iconSvg } from './icons';
import { onLangChange, setLang, t, type I18nKey } from './i18n';
import {
  talkMeta,
  talkSectionTitle,
  talkThumbnailUrl,
  talkTitle,
  writingMeta,
  writingTitle,
} from './contentLabels';
import { navigateReading, type ReadingRoute } from './readingRoute';

const LANDMARK_IDS = ['sambil', 'catedral', 'flor'] as const;

const LIST_ROWS: { slug: string; section: I18nKey; label: string; summary?: string }[] = [
  { slug: 'estudio', section: 'read.section.about', label: 'Estudio' },
  ...CASE_HOUSE_IDS.map((id) => ({
    slug: id,
    section: 'read.section.cases' as I18nKey,
    label: CASE_CARD_TITLES[id],
    summary: CASES[id]?.subtitle,
  })),
  { slug: 'talks', section: 'read.section.talks', label: 'Talks' },
  { slug: 'writings', section: 'read.section.writings', label: 'Writings' },
  ...LANDMARK_IDS.map((id) => ({
    slug: id,
    section: 'read.section.landmarks' as I18nKey,
    label: CASES[id]?.headline ?? id,
    summary: VOICE_LINES[CASES[id]?.voice ?? '']?.script_text,
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
        <button type="button" class="reading-view__back ui-btn ui-btn--secondary" data-back>
          ${iconSvg('chevron')} <span data-i18n="read.backToMap">Volver al mapa</span>
        </button>
        <button type="button" class="reading-view__back ui-btn ui-btn--secondary" data-back-list hidden>
          ${iconSvg('chevron')} <span data-i18n="read.backToList">Volver a la lista</span>
        </button>
        <h1 class="reading-view__site-title" data-i18n="read.title">Leer</h1>
        <div class="reading-view__lang chrome__lang" role="group" aria-label="Language" data-i18n-aria="chrome.language">
          <button type="button" class="chrome__lang-opt" data-lang="en">EN</button>
          <button type="button" class="chrome__lang-opt is-active" data-lang="es">ES</button>
        </div>
      </header>
      <div class="reading-view__scroll" tabindex="-1"></div>
    `;
    container.appendChild(this.root);
    this.scroll = this.root.querySelector('.reading-view__scroll')!;
    this.main = document.createElement('div');
    this.main.className = 'reading-view__main';
    this.scroll.appendChild(this.main);
    this.bind();
    onLangChange(() => this.applyI18n());
  }

  private bind(): void {
    this.root.querySelector('[data-back]')?.addEventListener('click', () => this.onExitMap());
    this.root.querySelector('[data-back-list]')?.addEventListener('click', () => {
      navigateReading({ kind: 'list' });
      this.route = { kind: 'list' };
      this.applyI18n();
      this.render();
      this.scroll.scrollTop = 0;
    });
    this.root.querySelectorAll('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = (btn as HTMLElement).dataset.lang;
        if (lang === 'en' || lang === 'es') setLang(lang);
      });
    });
  }

  isActive(): boolean {
    return !this.root.hidden;
  }

  syncRoute(route: ReadingRoute | null): void {
    if (!route) {
      this.root.hidden = true;
      document.body.dataset.reading = '0';
      return;
    }
    this.route = route;
    this.root.hidden = false;
    document.body.dataset.reading = '1';
    this.applyI18n();
    this.render();
    this.scroll.scrollTop = 0;
    this.scroll.focus({ preventScroll: true });
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
      frag.appendChild(this.listRow(row.slug, row.label, row.summary));
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
      this.scroll.scrollTop = 0;
    });
    return btn;
  }

  private renderDetail(slug: string): void {
    if (slug === 'estudio') {
      this.renderAbout();
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
    const miss = document.createElement('p');
    miss.className = 'reading-view__empty';
    miss.textContent = t('read.notFound');
    this.main.replaceChildren(miss);
  }

  private renderAbout(): void {
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article reading-view__article--about';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = 'Estudio';
    wrap.appendChild(h);
    for (const block of ABOUT) {
      if (block.kind === 'heading') {
        const hx = document.createElement(`h${Math.min(block.level + 2, 6)}`);
        hx.textContent = block.text;
        wrap.appendChild(hx);
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
        wrap.appendChild(picture);
      }
    }
    this.main.replaceChildren(wrap);
  }

  private renderCase(id: string): void {
    const content = CASES[id];
    const wrap = document.createElement('article');
    wrap.className = 'reading-view__article case-read';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = isCaseHouse(id) ? CASE_CARD_TITLES[id] : (content?.headline ?? id);
    wrap.appendChild(h);
    if (content?.subtitle && content.subtitle !== content.headline) {
      const sub = document.createElement('p');
      sub.className = 'reading-view__detail-sub';
      sub.textContent = content.subtitle;
      wrap.appendChild(sub);
    }
    const body = document.createElement('div');
    body.className = 'case__version case__version--full';
    body.replaceChildren(...(content ? content.full.map(caseBlockNode) : []));
    wrap.appendChild(body);
    this.main.replaceChildren(wrap);
  }

  private renderTalks(): void {
    const wrap = document.createElement('section');
    wrap.className = 'reading-view__article';
    const h = document.createElement('h2');
    h.className = 'reading-view__detail-title';
    h.textContent = 'Talks';
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
    h.textContent = 'Writings';
    wrap.appendChild(h);
    const list = document.createElement('div');
    list.className = 'reading-view__stack';
    for (const section of WRITINGS) {
      for (const item of section.items) {
        list.appendChild(this.writingLinkRow(item));
      }
    }
    wrap.appendChild(list);
    const sub = document.createElement('a');
    sub.className = 'writings-reader__substack reading-view__substack';
    sub.href = WRITINGS_SUBSTACK_URL;
    sub.target = '_blank';
    sub.rel = 'noopener noreferrer';
    sub.textContent = t('writings.substack');
    wrap.appendChild(sub);
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
