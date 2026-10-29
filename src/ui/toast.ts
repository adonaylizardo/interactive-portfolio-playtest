let lastToast = { text: '', at: 0 };

export function showToast(message: string, durationMs = 2200): void {
  const now = performance.now();
  if (message === lastToast.text && now - lastToast.at < 2200) return;
  lastToast = { text: message, at: now };
  let el = document.getElementById('playtest-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'playtest-toast';
    el.className = 'playtest-toast';
    document.getElementById('ui-root')?.appendChild(el);
  }
  el.textContent = message;
  el.style.top = '';
  el.style.left = '';
  el.style.right = '';
  el.style.bottom = '';
  el.style.transform = '';
  el.classList.add('playtest-toast--visible');
  if (document.body.classList.contains('persona-kit') && window.matchMedia('(min-width: 768px)').matches) {
    el.style.top = 'auto';
    el.style.left = 'auto';
    el.style.right = 'max(16px, env(safe-area-inset-right, 0px) + 16px)';
    el.style.bottom = 'max(24px, env(safe-area-inset-bottom, 0px) + 16px)';
    el.style.transform = 'translateY(8px)';
  }
  window.clearTimeout((el as HTMLElement & { _t?: number })._t);
  (el as HTMLElement & { _t?: number })._t = window.setTimeout(() => {
    el?.classList.remove('playtest-toast--visible');
  }, durationMs);
}

export function hideToast(): void {
  const el = document.getElementById('playtest-toast') as (HTMLElement & { _t?: number }) | null;
  if (!el) return;
  window.clearTimeout(el._t);
  el.classList.remove('playtest-toast--visible');
}
