import {
  resetSearchIndexForTests,
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
  private opened = false;
  private callbacks: SearchPaletteCallbacks;
  private flatHits: HTMLButtonElement[] = [];
  private activeHit = -1;

  constructor(container: HTMLElement, callbacks: SearchPaletteCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'search-palette';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="search-palette__backdrop" data-search-backdrop hidden></div>
      <div class="search-palette__panel" role="dialog" aria-modal="true" aria-labelledby="search-palette-label">
        <div class="search-palette__field" id="search-palette-label">
          <button type="button" class="search-palette__back" data-search-back aria-label="Back">${iconSvg('chevron')}</button>
          <label class="search-palette__input-wrap">
            ${iconSvg('search')}
            <input type="search" class="search-palette__input" autocomplete="off" spellcheck="false" enterkeyhint="search" />
          </label>
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
    this.bind();
    onLangChange(() => {
      resetSearchIndexForTests();
      this.syncPlaceholder();
      this.renderChips();
      if (this.input.value.trim()) this.render(this.input.value);
      else this.renderEmpty();
    });
  }

  isOpen(): boolean {
    return this.opened;
  }

  private bind(): void {
    this.root.querySelector('[data-search-backdrop]')?.addEventListener('click', () => this.close());
    this.backBtn.addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.render(this.input.value));
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
  }

  private isPhonePortrait(): boolean {
    return window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
  }

  private isSideSheet(): boolean {
    return window.matchMedia('(max-height: 500px) and (orientation: landscape) and (max-width: 900px)').matches;
  }

  open(): void {
    this.opened = true;
    this.root.hidden = false;
    this.root.classList.add('search-palette--open');
    document.body.classList.add('search-palette-open');
    this.syncPlaceholder();
    this.root.classList.toggle('search-palette--phone-full', this.isPhonePortrait());
    this.input.value = '';
    this.renderChips();
    this.renderEmpty();
    const backdrop = this.root.querySelector('.search-palette__backdrop') as HTMLElement;
    backdrop.hidden = !this.isSideSheet();
    requestAnimationFrame(() => this.input.focus());
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('search-palette--open', 'search-palette--phone-full');
    this.root.hidden = true;
    document.body.classList.remove('search-palette-open');
    this.input.blur();
    this.flatHits = [];
    this.activeHit = -1;
  }

  private renderChips(): void {
    this.chipsEl.replaceChildren();
    for (const chip of searchTypeChips()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-palette__chip';
      btn.textContent = chip.label;
      btn.addEventListener('click', () => {
        this.input.value = chip.label.split(' ')[0] ?? chip.label;
        this.input.dispatchEvent(new Event('input', { bubbles: true }));
        this.callbacks.onChip?.(chip.kind);
      });
      this.chipsEl.append(btn);
    }
  }

  private renderEmpty(): void {
    this.resultsEl.replaceChildren();
    const hint = document.createElement('p');
    hint.className = 'search-palette__idle';
    hint.textContent = t('search.tryAnother');
    this.resultsEl.append(hint);
  }

  private render(query: string): void {
    const q = query.trim();
    this.flatHits = [];
    this.activeHit = -1;
    this.resultsEl.replaceChildren();
    if (!q) {
      this.renderEmpty();
      return;
    }

    const groups = searchSite(q);
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'search-palette__empty';
      const title = document.createElement('p');
      title.className = 'search-palette__empty-title';
      title.textContent = truncateQueryDisplay(q);
      const hint = document.createElement('p');
      hint.className = 'search-palette__empty-hint';
      hint.textContent = t('search.tryAnother');
      empty.append(title, hint);
      this.resultsEl.append(empty);
      return;
    }

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
          <span class="search-palette__hit-icon">${iconSvg(KIND_ICON[item.kind])}</span>
          <span class="search-palette__hit-body">
            <span class="search-palette__hit-title">${highlightMatch(escapeHtml(item.title), q)}</span>
            <span class="search-palette__hit-snippet">${highlightMatch(escapeHtml(item.snippet), q)}</span>
          </span>`;
        btn.addEventListener('click', () => {
          this.close();
          this.callbacks.onSelect(item);
        });
        list.append(btn);
        li.append(btn);
        this.flatHits.push(btn);
      }
      section.append(list);
      this.resultsEl.append(section);
    }
  }
}

function truncateQueryDisplay(q: string): string {
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
