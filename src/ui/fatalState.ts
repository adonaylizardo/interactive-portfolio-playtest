import { enterReadingFromWelcome } from './bootFlow';
import { getLang, onLangChange, setLang, t } from './i18n';

export type FatalKind = 'webgl' | 'load-failed';

let mounted = false;

let onFatalReadInstead: (() => void) | null = null;

/** Wired from main so reading chrome syncs after leaving a fatal screen. */
export function setOnFatalReadInstead(fn: (() => void) | null): void {
  onFatalReadInstead = fn;
}

function readInstead(): void {
  mounted = false;
  document.getElementById('fatal-state')?.remove();
  const ui = document.getElementById('ui-root');
  if (ui) {
    ui.style.visibility = '';
    ui.style.pointerEvents = '';
  }
  document.body.classList.remove('boot-loading', 'boot-welcome');
  enterReadingFromWelcome();
  onFatalReadInstead?.();
}

export function showFatalState(kind: FatalKind): void {
  if (mounted) return;
  mounted = true;

  document.getElementById('boot')?.remove();
  document.body.classList.remove('boot-loading', 'boot-welcome');

  const root = document.createElement('div');
  root.id = 'fatal-state';
  root.className = `fatal-state fatal-state--${kind}`;
  root.setAttribute('role', 'alertdialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <button type="button" class="fatal-state__lang ui-round" data-fatal-lang aria-label="Language">ES</button>
    <div class="fatal-state__center">
      <div class="fatal-state__monogram" aria-hidden="true">AL</div>
      <p class="fatal-state__name">Adonay Lizardo</p>
      <h1 class="fatal-state__title"></h1>
      <p class="fatal-state__lede"></p>
      <div class="fatal-state__actions"></div>
    </div>
  `;
  document.getElementById('app')?.appendChild(root);

  const titleEl = root.querySelector('.fatal-state__title') as HTMLElement;
  const ledeEl = root.querySelector('.fatal-state__lede') as HTMLElement;
  const actions = root.querySelector('.fatal-state__actions') as HTMLElement;
  const langBtn = root.querySelector('[data-fatal-lang]') as HTMLButtonElement;

  const apply = (): void => {
    document.documentElement.lang = getLang();
    if (kind === 'webgl') {
      titleEl.textContent = t('state.webgl.title');
      ledeEl.textContent = t('read.listIntro');
    } else {
      titleEl.textContent = t('state.loadFailed.title');
      ledeEl.textContent = t('state.loadFailed.sub');
    }
    langBtn.textContent = getLang() === 'es' ? 'ES' : 'EN';
    actions.replaceChildren();
    if (kind === 'load-failed') {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'fatal-state__btn fatal-state__btn--primary';
      retry.textContent = t('state.tryAgain');
      retry.addEventListener('click', () => location.reload());
      actions.appendChild(retry);
    }
    const read = document.createElement('button');
    read.type = 'button';
    read.className =
      kind === 'webgl'
        ? 'fatal-state__btn fatal-state__btn--primary'
        : 'fatal-state__btn fatal-state__btn--ghost';
    read.textContent = t('state.readInstead');
    read.addEventListener('click', () => readInstead());
    actions.appendChild(read);
  };

  langBtn.addEventListener('click', () => {
    setLang(getLang() === 'es' ? 'en' : 'es');
  });
  onLangChange(apply);
  apply();

  document.getElementById('ui-root')!.style.visibility = 'hidden';
  document.getElementById('ui-root')!.style.pointerEvents = 'none';
}

export function isFatalStateVisible(): boolean {
  return mounted;
}

if (typeof window !== 'undefined') {
  (window as unknown as { __showFatalState?: typeof showFatalState }).__showFatalState = showFatalState;
}
