import { searchSite, type SearchResult, type SearchResultKind } from '../data/siteSearch';
import { iconSvg } from './icons';
import { getLang, onLangChange, t } from './i18n';

export type SearchPaletteCallbacks = {
  onSelect: (result: SearchResult) => void;
};

export class SearchPalette {
  readonly root: HTMLElement;
  private input: HTMLInputElement;
  private resultsEl: HTMLElement;
  private opened = false;
  private callbacks: SearchPaletteCallbacks;

  constructor(container: HTMLElement, callbacks: SearchPaletteCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'search-palette';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="search-palette__backdrop" data-search-backdrop hidden></div>
      <div class="search-palette__panel" role="dialog" aria-modal="true" aria-labelledby="search-palette-label">
        <label class="search-palette__field" id="search-palette-label">
          ${iconSvg('search')}
          <input type="search" class="search-palette__input" autocomplete="off" spellcheck="false" />
        </label>
        <div class="search-palette__results" data-results></div>
      </div>
    `;
    container.appendChild(this.root);
    this.input = this.root.querySelector('.search-palette__input')!;
    this.resultsEl = this.root.querySelector('[data-results]')!;
    this.bind();
    onLangChange(() => {
      this.syncPlaceholder();
      if (this.input.value.trim()) this.render(this.input.value);
    });
  }

  isOpen(): boolean {
    return this.opened;
  }

  private bind(): void {
    this.root.querySelector('[data-search-backdrop]')?.addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => this.render(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.opened) this.close();
    });
  }

  private syncPlaceholder(): void {
    this.input.placeholder = t('search.placeholder');
    this.input.setAttribute('aria-label', t('chrome.search'));
  }

  open(): void {
    this.opened = true;
    this.root.hidden = false;
    this.root.classList.add('search-palette--open');
    document.body.classList.add('search-palette-open');
    this.syncPlaceholder();
    this.input.value = '';
    this.render('');
    const backdrop = this.root.querySelector('.search-palette__backdrop') as HTMLElement;
    backdrop.hidden = !this.isSideSheet();
    requestAnimationFrame(() => {
      this.input.focus();
    });
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.root.classList.remove('search-palette--open');
    this.root.hidden = true;
    document.body.classList.remove('search-palette-open');
    this.input.blur();
  }

  private isSideSheet(): boolean {
    return window.matchMedia('(max-height: 500px) and (orientation: landscape) and (max-width: 900px)').matches;
  }

  private render(query: string): void {
    const q = query.trim();
    this.resultsEl.replaceChildren();
    if (!q) return;

    const groups = searchSite(q);
    if (!groups.length) {
      const empty = document.createElement('div');
      empty.className = 'search-palette__empty';
      const title = document.createElement('p');
      title.className = 'search-palette__empty-title';
      title.textContent =
        getLang() === 'es' ? `Sin resultados para “${q}”` : `No results for “${q}”`;
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
      h.textContent = group.label;
      section.append(h);
      const list = document.createElement('ul');
      list.className = 'search-palette__list';
      for (const item of group.items) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'search-palette__hit';
        btn.dataset.kind = item.kind;
        btn.innerHTML = `<span class="search-palette__hit-title">${escapeHtml(item.title)}</span>
          <span class="search-palette__hit-snippet">${escapeHtml(item.snippet)}</span>`;
        btn.addEventListener('click', () => {
          this.close();
          this.callbacks.onSelect(item);
        });
        li.append(btn);
        list.append(li);
      }
      section.append(list);
      this.resultsEl.append(section);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Re-export for tests. */
export type { SearchResultKind };
