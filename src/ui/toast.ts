export function showToast(message: string, durationMs = 2200): void {
  let el = document.getElementById('playtest-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'playtest-toast';
    el.className = 'playtest-toast';
    document.getElementById('ui-root')?.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('playtest-toast--visible');
  window.clearTimeout((el as HTMLElement & { _t?: number })._t);
  (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => {
    el?.classList.remove('playtest-toast--visible');
  }, durationMs);
}
