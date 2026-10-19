import { getLang, onLangChange, setLang, t } from './i18n';
import { isReadingHash, navigateReading, parseReadingRoute } from './readingRoute';
import { parseInteriorFromHash } from '../camera/hash';

export const WELCOME_DONE_KEY = 'playtest-welcome-done';

export function shouldSkipWelcomeFlow(): boolean {
  try {
    if (sessionStorage.getItem(WELCOME_DONE_KEY) === '1') return true;
  } catch {
    /* ignore */
  }
  if (isReadingHash()) return true;
  if (parseInteriorFromHash()) return true;
  const raw = location.hash.replace(/^#/, '');
  if (raw.startsWith('view=')) return true;
  return false;
}

export function markWelcomeDone(): void {
  try {
    sessionStorage.setItem(WELCOME_DONE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export type WelcomeChoice = 'start' | 'read';

export class BootFlow {
  private root: HTMLElement | null = null;
  private loadingEl: HTMLElement | null = null;
  private welcomeEl: HTMLElement | null = null;
  private barFill: HTMLElement | null = null;
  private pctEl: HTMLElement | null = null;
  private headlineEl: HTMLElement | null = null;
  private choiceResolve: ((c: WelcomeChoice) => void) | null = null;
  private progress = 0;

  mount(): void {
    const existing = document.getElementById('boot');
    if (existing) existing.remove();
    this.root = document.createElement('div');
    this.root.id = 'boot';
    this.root.className = 'boot-flow';
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = `
      <div class="boot-flow__loading" data-boot-loading>
        <div class="boot-flow__center">
          <div class="boot-flow__monogram" aria-hidden="true">AL</div>
          <p class="boot-flow__name">Adonay Lizardo</p>
          <div class="boot-flow__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="boot-flow__fill"></div>
          </div>
          <div class="boot-flow__meta">
            <span class="boot-flow__status" data-i18n="boot.loading">Cargando el mapa</span>
            <span class="boot-flow__pct">0%</span>
          </div>
        </div>
      </div>
      <div class="boot-flow__welcome" data-boot-welcome hidden>
        <button type="button" class="boot-flow__lang ui-round" data-boot-lang aria-label="Language">ES</button>
        <div class="boot-flow__sheet" role="dialog" aria-modal="true" aria-labelledby="boot-welcome-title">
          <div class="boot-flow__handle" aria-hidden="true"></div>
          <h1 class="boot-flow__headline" id="boot-welcome-title"></h1>
          <div class="boot-flow__actions">
            <button type="button" class="boot-flow__btn boot-flow__btn--primary" data-boot-start></button>
            <button type="button" class="boot-flow__btn boot-flow__btn--ghost" data-boot-read></button>
          </div>
        </div>
      </div>
    `;
    document.getElementById('app')?.appendChild(this.root);
    document.body.classList.add('boot-loading');

    this.loadingEl = this.root.querySelector('[data-boot-loading]');
    this.welcomeEl = this.root.querySelector('[data-boot-welcome]');
    this.barFill = this.root.querySelector('.boot-flow__fill');
    this.pctEl = this.root.querySelector('.boot-flow__pct');
    this.headlineEl = this.root.querySelector('.boot-flow__headline');

    this.root.querySelector('[data-boot-start]')?.addEventListener('click', () => this.resolveChoice('start'));
    this.root.querySelector('[data-boot-read]')?.addEventListener('click', () => this.resolveChoice('read'));
    this.root.querySelector('[data-boot-lang]')?.addEventListener('click', () => {
      setLang(getLang() === 'es' ? 'en' : 'es');
    });

    onLangChange(() => this.applyCopy());
    this.applyCopy();
  }

  isVisible(): boolean {
    return !!this.root && !this.root.classList.contains('boot-flow--done');
  }

  setProgress(pct: number): void {
    this.progress = Math.max(this.progress, Math.min(100, Math.round(pct)));
    if (this.barFill) this.barFill.style.width = `${this.progress}%`;
    if (this.pctEl) this.pctEl.textContent = `${this.progress}%`;
    const track = this.root?.querySelector('.boot-flow__track');
    track?.setAttribute('aria-valuenow', String(this.progress));
  }

  /** Loading hit 100% — show welcome or dismiss immediately. */
  async finishLoading(skipWelcome: boolean): Promise<WelcomeChoice | null> {
    this.setProgress(100);
    if (skipWelcome) {
      this.dismiss();
      return null;
    }
    await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
    this.loadingEl?.classList.add('boot-flow__loading--out');
    this.welcomeEl?.removeAttribute('hidden');
    this.root?.classList.add('boot-flow--welcome');
    document.body.classList.remove('boot-loading');
    document.body.classList.add('boot-welcome');
    await new Promise<void>((r) => window.setTimeout(r, 220));
    this.loadingEl?.setAttribute('hidden', '');
    return this.waitForChoice();
  }

  waitForChoice(): Promise<WelcomeChoice> {
    return new Promise((resolve) => {
      this.choiceResolve = resolve;
    });
  }

  private resolveChoice(c: WelcomeChoice): void {
    this.choiceResolve?.(c);
    this.choiceResolve = null;
  }

  dismiss(): void {
    if (!this.root) return;
    this.root.classList.add('boot-flow--done');
    document.body.classList.remove('boot-loading', 'boot-welcome');
    window.setTimeout(() => {
      this.root?.remove();
      this.root = null;
    }, 420);
  }

  private applyCopy(): void {
    document.documentElement.lang = getLang();
    this.root?.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = (el as HTMLElement).dataset.i18n as Parameters<typeof t>[0];
      if (key) el.textContent = t(key);
    });
    if (this.headlineEl) this.headlineEl.textContent = t('welcome.headline');
    const start = this.root?.querySelector('[data-boot-start]') as HTMLElement | null;
    const read = this.root?.querySelector('[data-boot-read]') as HTMLElement | null;
    if (start) start.textContent = t('welcome.start');
    if (read) read.textContent = t('welcome.readOnly');
    const langBtn = this.root?.querySelector('[data-boot-lang]') as HTMLElement | null;
    if (langBtn) langBtn.textContent = getLang() === 'es' ? 'ES' : 'EN';
  }
}

export function enterReadingFromWelcome(): void {
  if (parseReadingRoute()) return;
  navigateReading({ kind: 'list' }, 'replace');
}
