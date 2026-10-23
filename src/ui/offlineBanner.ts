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

function applyOffline(offline: boolean): void {
  const node = ensureEl();
  node.classList.toggle('playtest-toast--visible', offline);
  document.body.dataset.offline = offline ? '1' : '';
  if (offline) syncCopy();
  else delete document.body.dataset.offline;
}

async function probeReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const base = import.meta.env.BASE_URL || '/';
    const url = new URL('favicon.svg', new URL(base, location.href)).href;
    await fetch(url, { method: 'HEAD', cache: 'no-store', credentials: 'same-origin' });
    return true;
  } catch {
    return false;
  }
}

async function refreshOnlineState(): Promise<void> {
  applyOffline(!(await probeReachable()));
}

export function startOfflineMonitor(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  ensureEl();
  onLangChange(syncCopy);
  syncCopy();
  applyOffline(false);
  void refreshOnlineState();
  window.addEventListener('online', () => void refreshOnlineState());
  window.addEventListener('offline', () => applyOffline(true));
  window.addEventListener('load', () => void refreshOnlineState());
}

export function isOfflineBannerVisible(): boolean {
  return !!el?.classList.contains('playtest-toast--visible');
}
