let armed = false;
let onFail: (() => void) | null = null;

function isBootAssetMessage(msg: string): boolean {
  return (
    /Failed to fetch/i.test(msg) ||
    /sprite load failed/i.test(msg) ||
    /boot sprites failed/i.test(msg) ||
    /loadInteriorSprite/i.test(msg) ||
    /\[Loader\.load\]/i.test(msg) ||
    /\/sprites\//i.test(msg)
  );
}

function handleFailure(reason: unknown): void {
  if (!armed || !onFail) return;
  const msg =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : String(reason ?? '');
  if (!isBootAssetMessage(msg)) return;
  armed = false;
  onFail();
}

function onRejection(ev: PromiseRejectionEvent): void {
  handleFailure(ev.reason);
}

function onError(ev: ErrorEvent): void {
  handleFailure(ev.error ?? ev.message);
}

/** Until disarmed, map/sprite boot failures surface the load-failed fatal screen. */
export function armBootAssetGuard(fail: () => void): void {
  if (armed) return;
  armed = true;
  onFail = fail;
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError);
}

export function disarmBootAssetGuard(): void {
  armed = false;
  onFail = null;
  window.removeEventListener('unhandledrejection', onRejection);
  window.removeEventListener('error', onError);
}

export function reportBootAssetFailure(err: unknown): void {
  console.error(err);
  handleFailure(err);
}
