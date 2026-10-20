import { onLangChange, t } from './i18n';

let el: HTMLElement | null = null;
let listening = false;

function ensureEl(): HTMLElement {
  if (el) return el;
  el = document.createElement('div');
  el.id = 'playtest-offline';
  el.className = 'playtest-toast playtest-toast--offline';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<span class="playtest-toast__icon" aria-hidden="true"></span><span class="playtest-toast__text"></span>`;
  document.getElementById('ui-root')?.appendChild(el);
  return el;
}

function syncCopy(): void {
  if (!el) return;
  const text = el.querySelector('.playtest-toast__text');
  if (text) text.textContent = t('state.offline');
}

function syncVisible(): void {
  const node = ensureEl();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  node.classList.toggle('playtest-toast--visible', offline);
  document.body.dataset.offline = offline ? '1' : '';
  if (offline) syncCopy();
}

export function startOfflineMonitor(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  ensureEl();
  onLangChange(syncCopy);
  syncCopy();
  syncVisible();
  window.addEventListener('online', syncVisible);
  window.addEventListener('offline', syncVisible);
}

export function isOfflineBannerVisible(): boolean {
  return !!el?.classList.contains('playtest-toast--visible');
}
