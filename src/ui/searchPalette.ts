import {
  resetSearchIndexForTests,
  searchResultsForKind,
  searchSite,
  searchTypeChips,
  type SearchResult,
  type SearchResultKind,
} from '../data/siteSearch';
import { iconSvg, type IconName } from './icons';
import { getLang, onLangChange, t } from './i18n';

export type SearchPaletteCallbacks = {
  onSelect: (result: SearchResult) => void;
  onChip?: (kind: SearchResultKind) => void;
  onOpenChange?: (open: boolean) => void;
};

const KIND_ICON: Record<SearchResultKind, IconName> = {
  cases: 'briefcase',
  articles: 'page',
  talks: 'page',
  achievements: 'trophy',
  landmarks: 'map',
  contact: 'mail',
  about: 'info',
};

export class SearchPalette {
  readonly root: HTMLElement;
  private input: HTMLInputElement;
  private resultsEl: HTMLElement;
  private chipsEl: HTMLElement;
  private backBtn: HTMLButtonElement;
  private closeBtn: HTMLButtonElement;
  private opened = false;
  private filterKind: SearchResultKind | null = null;
  private callbacks: SearchPaletteCallbacks;
  private flatHits: HTMLButtonElement[] = [];
  private activeHit = -1;

  constructor(container: HTMLElement, callbacks: SearchPaletteCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'search-palette';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="search-palette__backdrop" data-search-backdrop></div>
      <div class="search-palette__panel" role="dialog" aria-modal="true" aria-labelledby="search-palette-label">
        <div class="search-palette__field" id="search-palette-label">
          <button type="button" class="search-palette__back" data-search-back aria-label="Back">${iconSvg('chevron')}</button>
          <label class="search-palette__input-wrap">
            ${iconSvg('search')}
            <input type="text" class="search-palette__input" autocomplete="off" spellcheck="false" enterkeyhint="search" />
            <button type="button" class="search-palette__clear" data-search-clear hidden aria-label="Clear">${iconSvg('close')}</button>
          </label>
          <span class="search-palette__hint-key" aria-hidden="true">ESC</span>
          <button type="button" class="search-palette__close" data-search-close aria-label="Close">${iconSvg('close')}</button>
        </div>
        <div class="search-palette__chips" data-chips></div>
        <div class="search-palette__results" data-results></div>
      </div>
    `;
    container.appendChild(this.root);
    this.input = this.root.querySelector('.search-palette__input')!;
    this.resultsEl = this.root.querySelector('[data-results]')!;
    this.chipsEl = this.root.querySelector('[data-chips]')!;
    this.backBtn = this.root.querySelector('[data-search-back]') as HTMLButtonElement;
    this.closeBtn = this.root.querySelector('[data-search-close]') as HTMLButtonElement;
    this.bind();
    onLangChange(() => {
      resetSearchIndexForTests();
      this.syncPlaceholder();
      this.renderChips();
      this.syncView();
    });
  }

  isOpen(): boolean {
    return this.opened;
  }

  private bind(): void {
    this.root.querySelector('[data-search-backdrop]')?.addEventListener('click', () => this.close());
    this.backBtn.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());
    this.root.querySelector('[data-search-clear]')?.addEventListener('click', () => {
      this.input.value = '';
      this.filterKind = null;
      this.syncView();
    });
    this.input.addEventListener('input', () => {
      this.filterKind = null;
      this.syncView();
    });
    this.input.addEventListener('keydown', (e) => this.onInputKeydown(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.opened) this.close();
    });
  }

  private onInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.moveHit(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.moveHit(-1);
      return;
    }
    if (e.key === 'Enter' && this.activeHit >= 0 && this.flatHits[this.activeHit]) {
      e.preventDefault();
      this.flatHits[this.activeHit].click();
    }
  }

  private moveHit(delta: number): void {
    if (!this.flatHits.length) return;
    this.activeHit = (this.activeHit + delta + this.flatHits.length) % this.flatHits.length;
    this.flatHits.forEach((btn, i) => btn.classList.toggle('search-palette__hit--active', i === this.activeHit));
    this.flatHits[this.activeHit]?.scrollIntoView({ block: 'nearest' });
  }

  private syncPlaceholder(): void {
    this.input.placeholder = t('search.placeholder');
    this.input.setAttribute('aria-label', t('chrome.search'));
    this.backBtn.setAttribute('aria-label', t('search.back'));
    this.closeBtn.setAttribute('aria-label', t('panel.close'));
  }

  private isPhonePortrait(): boolean {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
  }

  private isDesktop(): boolean {
    return window.matchMedia('(min-width: 768px)').matches;
  }

  open(): void {
    this.opened = true;
    this.filterKind = null;
    this.root.hidden = false;
    this.root.classList.add('search-palette--open');
    document.body.classList.add('search-palette-open');
    this.syncPlaceholder();
    this.root.classList.toggle('search-palette--phone-full', this.isPhonePortrait());
    this.input.value = '';
    this.renderChips();
    this.syncView();
    requestAnimationFrame(() => this.input.focus());
    this.callbacks.onOpenChange?.(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.filterKind = null;
    this.root.classList.remove('search-palette--open', 'search-palette--phone-full');
    this.root.hidden = true;
    document.body.classList.remove('search-palette-open');
    this.input.blur();
    this.flatHits = [];
    this.activeHit = -1;
    this.callbacks.onOpenChange?.(false);
  }

  private syncView(): void {
    const q = this.input.value.trim();
    const clearBtn = this.root.querySelector('[data-search-clear]') as HTMLButtonElement;
    clearBtn.hidden = !q;
    if (this.filterKind) {
      const group = searchResultsForKind(this.filterKind, q);
      this.renderGroups(group ? [group] : [], q);
      return;
    }
    if (!q) {
      this.resultsEl.replaceChildren();
      this.chipsEl.hidden = false;
      this.root.classList.remove('search-palette--no-results');
      this.flatHits = [];
      this.activeHit = -1;
      return;
    }
    this.renderGroups(searchSite(q), q);
  }

  private renderChips(): void {
    this.chipsEl.replaceChildren();
    for (const chip of searchTypeChips()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-palette__chip';
      btn.innerHTML = `${iconSvg(KIND_ICON[chip.kind], 13)}<span>${chip.label}</span>`;
      btn.addEventListener('click', () => {
        this.filterKind = chip.kind;
        this.input.value = '';
        this.callbacks.onChip?.(chip.kind);
        this.syncView();
      });
      this.chipsEl.append(btn);
    }
  }

  private renderGroups(groups: ReturnType<typeof searchSite>, query: string): void {
    this.flatHits = [];
    this.activeHit = -1;
    this.resultsEl.replaceChildren();
    this.chipsEl.hidden = groups.length > 0;
    this.root.classList.toggle('search-palette--no-results', !groups.length && !!query.trim());

    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'search-palette__empty';
      empty.innerHTML = `<span class="search-palette__hit-icon search-palette__hit-icon--tile search-palette__empty-icon">${iconSvg('search')}</span>
        <p class="search-palette__empty-title">${escapeHtml(truncateQueryDisplay(query))}</p>
        <p class="search-palette__empty-hint">${escapeHtml(t('search.tryAnother'))}</p>`;
      this.resultsEl.append(empty);
      this.chipsEl.hidden = false;
      return;
    }
    this.root.classList.remove('search-palette--no-results');

    for (const group of groups) {
      const section = document.createElement('section');
      section.className = 'search-palette__group';
      const h = document.createElement('h3');
      h.className = 'search-palette__group-label';
      h.textContent = `${group.label} ${group.items.length}`;
      section.append(h);
      const list = document.createElement('ul');
      list.className = 'search-palette__list';
      for (const item of group.items) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-palette__hit';
        btn.dataset.kind = item.kind;
        btn.innerHTML = `
          <span class="search-palette__hit-icon search-palette__hit-icon--tile">${iconSvg(KIND_ICON[item.kind])}</span>
          <span class="search-palette__hit-body">
            <span class="search-palette__hit-title">${highlightMatch(escapeHtml(item.title), query)}</span>
            <span class="search-palette__hit-snippet">${highlightMatch(escapeHtml(item.snippet), query)}</span>
          </span>`;
        btn.addEventListener('click', () => {
          this.close();
          this.callbacks.onSelect(item);
        });
        li.append(btn);
        list.append(li);
        this.flatHits.push(btn);
      }
      section.append(list);
      this.resultsEl.append(section);
    }

    if (this.isDesktop() && this.flatHits[0]) {
      this.activeHit = 0;
      this.flatHits[0].classList.add('search-palette__hit--active');
    }
  }
}

function truncateQueryDisplay(q: string): string {
  if (!q) return getLang() === 'es' ? 'Sin resultados' : 'No results';
  const shown = q.length > 48 ? `${q.slice(0, 45)}…` : q;
  return getLang() === 'es' ? `Sin resultados para “${shown}”` : `No results for “${shown}”`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function highlightMatch(safeHtml: string, query: string): string {
  const q = query.trim();
  if (!q) return safeHtml;
  const plain = safeHtml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const nPlain = plain.toLowerCase();
  const nQ = q.toLowerCase();
  const idx = nPlain.indexOf(nQ);
  if (idx < 0) {
    const word = q.split(/\s+/).find((w) => nPlain.includes(w.toLowerCase()));
    if (!word) return safeHtml;
    const re = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return escapeHtml(plain).replace(re, '<strong>$1</strong>');
  }
  const before = escapeHtml(plain.slice(0, idx));
  const mid = escapeHtml(plain.slice(idx, idx + q.length));
  const after = escapeHtml(plain.slice(idx + q.length));
  return `${before}<strong>${mid}</strong>${after}`;
}

export type { SearchResultKind };
