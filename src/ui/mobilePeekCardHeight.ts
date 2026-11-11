import { onLangChange } from './i18n';

const CSS_VAR = '--mobile-peek-card-height';

let measureHost: HTMLDivElement | null = null;
let initialized = false;

function sanitizeMeasureClone(root: HTMLElement): void {
  root.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  root.querySelectorAll('[aria-labelledby]').forEach((el) => el.removeAttribute('aria-labelledby'));
  root.querySelectorAll('[aria-controls]').forEach((el) => el.removeAttribute('aria-controls'));
  root.querySelectorAll('[aria-describedby]').forEach((el) => el.removeAttribute('aria-describedby'));
  root.querySelectorAll('label[for]').forEach((el) => el.removeAttribute('for'));
}

/** Offscreen clone of the About intro peek — does not require the peek to be on screen. */
export function syncMobilePeekCardHeight(): number {
  const source = document.querySelector('.chrome .chrome__intro');
  if (!source) {
    document.documentElement.style.removeProperty(CSS_VAR);
    return 0;
  }
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.id = 'mobile-peek-card-measure';
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.inert = true;
    measureHost.className = 'chrome chrome--mobile chrome--sheet chrome--intro-peek';
    measureHost.style.cssText =
      'position:fixed;inset:0 auto auto 0;width:100vw;height:0;overflow:hidden;visibility:hidden;pointer-events:none;z-index:-1';
    document.body.appendChild(measureHost);
  }
  measureHost.style.width = `${window.innerWidth}px`;
  measureHost.replaceChildren();
  const clone = source.cloneNode(true) as HTMLElement;
  sanitizeMeasureClone(clone);
  measureHost.appendChild(clone);
  const h = clone.getBoundingClientRect().height;
  if (h > 80) {
    const px = `${Math.round(h)}px`;
    document.documentElement.style.setProperty(CSS_VAR, px);
    return h;
  }
  document.documentElement.style.removeProperty(CSS_VAR);
  return 0;
}

export function getMobilePeekCardHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(CSS_VAR).trim();
  if (raw) {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return syncMobilePeekCardHeight();
}

export function initMobilePeekCardHeight(): void {
  if (initialized) return;
  initialized = true;
  const run = () => {
    syncMobilePeekCardHeight();
  };
  run();
  window.addEventListener('resize', run);
  window.visualViewport?.addEventListener('resize', run);
  onLangChange(() => {
    requestAnimationFrame(run);
  });
}
