import {
  TALK_SECTIONS,
  TALKS_COMING_SOON,
  WRITINGS,
  type TalkItem,
  type WritingItem,
  type WritingSection,
} from '../data/experiences';
import { searchableTalkCount, searchableTalkItems } from '../data/siteSearch';
import {
  talkMeta,
  talkThumbnailUrl,
  talkTitle,
  writingItemHasCopy,
  writingMeta,
  writingTitle,
} from './contentLabels';
import { FIGMA_DOC, FIGMA_DOC_PHONE } from './figmaAssets';
import { onLangChange, t, type I18nKey } from './i18n';

export type ChromeContentHandlers = {
  onTalk: (talkId: string) => void;
  onWriting: (itemId: string) => void;
};

function writingItemCount(): number {
  return WRITINGS.reduce((n, section) => n + section.items.filter(writingItemHasCopy).length, 0);
}

function isPhone(): boolean {
  return window.matchMedia('(max-width: 767px)').matches;
}

function talkRow(item: TalkItem, onOpen: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chrome__content-row experience__row';
  const thumb = document.createElement('span');
  thumb.className = 'experience__thumb experience__thumb--video chrome__content-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  const img = document.createElement('img');
  img.className = 'experience__thumb-img';
  img.src = talkThumbnailUrl(item) ?? '';
  img.alt = '';
  thumb.append(img);
  const copy = document.createElement('span');
  copy.className = 'experience__copy';
  const title = document.createElement('span');
  title.className = 'experience__row-title';
  title.textContent = talkTitle(item);
  const meta = document.createElement('span');
  meta.className = 'experience__row-meta';
  meta.textContent = talkMeta(item);
  copy.append(title, meta);
  btn.append(thumb, copy);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onOpen();
  });
  return btn;
}

function writingRow(_section: WritingSection, item: WritingItem, onOpen: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chrome__content-row experience__row';
  const thumb = document.createElement('span');
  thumb.className = 'experience__thumb experience__thumb--doc chrome__content-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  const doc = document.createElement('img');
  doc.className = 'experience__doc-icon';
  doc.src = isPhone() ? FIGMA_DOC_PHONE : FIGMA_DOC;
  doc.width = 15;
  doc.height = 15;
  doc.alt = '';
  thumb.append(doc);
  const copy = document.createElement('span');
  copy.className = 'experience__copy';
  const title = document.createElement('span');
  title.className = 'experience__row-title';
  title.textContent = writingTitle(item);
  const meta = document.createElement('span');
  meta.className = 'experience__row-meta';
  meta.textContent = writingMeta(item);
  copy.append(title, meta);
  btn.append(thumb, copy);
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onOpen();
  });
  return btn;
}

function syncSectionHead(root: HTMLElement, sectionId: 'articulos' | 'charlas', count: number): void {
  const key: I18nKey = sectionId === 'articulos' ? 'panel.writings' : 'panel.talks';
  root.querySelectorAll(`[data-chrome-section="${sectionId}"] .chrome__section-head-inline`).forEach((head) => {
    const title = head.querySelector('h2');
    const meta = head.querySelector('[data-section-count]');
    if (title) title.textContent = t(key);
    if (meta) meta.textContent = String(count);
  });
}

function buildTalksFragment(handlers: ChromeContentHandlers): DocumentFragment | HTMLElement {
  const listed = searchableTalkItems();
  if (TALKS_COMING_SOON || listed.length === 0) {
    const p = document.createElement('p');
    p.className = 'chrome__content-empty';
    p.textContent = t('talks.comingSoon');
    return p;
  }
  const listedIds = new Set(listed.map((x) => x.id));
  const frag = document.createDocumentFragment();
  let firstSection = true;
  for (const section of TALK_SECTIONS) {
    const items = section.items.filter((item) => listedIds.has(item.id));
    if (!items.length) continue;
    if (!firstSection) {
      const divider = document.createElement('hr');
      divider.className = 'experience__section-divider';
      frag.append(divider);
    }
    firstSection = false;
    for (const item of items) {
      frag.append(talkRow(item, () => handlers.onTalk(item.id)));
    }
  }
  return frag;
}

function buildWritingsFragment(handlers: ChromeContentHandlers): DocumentFragment {
  const sections = WRITINGS.map((s) => ({
    ...s,
    items: s.items.filter(writingItemHasCopy),
  })).filter((s) => s.items.length > 0);
  const frag = document.createDocumentFragment();
  let first = true;
  for (const section of sections) {
    if (!first) {
      const divider = document.createElement('hr');
      divider.className = 'experience__section-divider';
      frag.append(divider);
    }
    first = false;
    for (const item of section.items) {
      frag.append(writingRow(section, item, () => handlers.onWriting(item.id)));
    }
  }
  return frag;
}

function renderTalksList(root: HTMLElement, handlers: ChromeContentHandlers): void {
  const count = TALKS_COMING_SOON ? 0 : searchableTalkCount();
  syncSectionHead(root, 'charlas', count);
  root.querySelectorAll('[data-chrome-charlas-list]').forEach((list) => {
    list.replaceChildren();
    list.append(buildTalksFragment(handlers));
  });
}

function renderWritingsList(root: HTMLElement, handlers: ChromeContentHandlers): void {
  const count = writingItemCount();
  syncSectionHead(root, 'articulos', count);
  root.querySelectorAll('[data-chrome-articulos-list]').forEach((list) => {
    list.replaceChildren();
    list.append(buildWritingsFragment(handlers));
  });
}

export function renderChromeExperienceSections(root: HTMLElement, handlers: ChromeContentHandlers): void {
  renderTalksList(root, handlers);
  renderWritingsList(root, handlers);
}

export function mountChromeExperienceSections(root: HTMLElement, handlers: ChromeContentHandlers): void {
  renderChromeExperienceSections(root, handlers);
  onLangChange(() => renderChromeExperienceSections(root, handlers));
}

export function chromeSectionSelector(section: 'articulos' | 'charlas' | 'casos' | 'logros' | 'contact'): string {
  switch (section) {
    case 'articulos':
      return '#chrome-articulos';
    case 'charlas':
      return '#chrome-charlas';
    case 'casos':
      return '#chrome-casos, #chrome-mobile-casos';
    case 'logros':
      return '#chrome-logros, #chrome-mobile-logros';
    case 'contact':
      return '#chrome-contact, #chrome-mobile-contact';
    default:
      return '#chrome-articulos';
  }
}
