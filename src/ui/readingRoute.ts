export type ReadingRoute =
  | { kind: 'list' }
  | { kind: 'detail'; slug: string };

const PREFIX = '/leer';
const OUTDOOR_HASH_KEY = 'portfolio-playtest-outdoor-hash';

type ReadingNavState = { reading?: boolean; rDepth?: number; playtest?: boolean };

/** In-memory only — reset on every full document load. */
let readingDepthInDoc = 0;

function isMapViewHash(hash: string): boolean {
  const raw = hash.replace(/^#/, '');
  return raw.startsWith('view=') || (raw.includes('x=') && raw.includes('z='));
}

function saveOutdoorHashIfNeeded(): void {
  if (isReadingHash()) return;
  const hash = location.hash;
  if (hash && isMapViewHash(hash)) {
    sessionStorage.setItem(OUTDOOR_HASH_KEY, hash);
  }
}

export function resetReadingNavigationForLoad(): void {
  readingDepthInDoc = 0;
  try {
    sessionStorage.removeItem('portfolio-playtest-reading-depth');
  } catch {
    /* ignore */
  }
}

export function readingDepth(): number {
  return readingDepthInDoc;
}

function setReadingDepth(n: number): void {
  readingDepthInDoc = Math.max(0, n);
}

function inferReadingDepthFromHash(): number {
  const route = parseReadingRoute();
  if (!route) return 0;
  return route.kind === 'detail' ? 2 : 1;
}

/** Sync depth from history.state.rDepth after back/forward (not +/- counting). */
export function syncReadingDepthFromHistory(): void {
  const skipped = skipNextReadingPopstateDepth;
  skipNextReadingPopstateDepth = false;
  if (!isReadingHash()) {
    setReadingDepth(0);
    return;
  }
  const st = history.state as ReadingNavState | null;
  if (typeof st?.rDepth === 'number') {
    setReadingDepth(st.rDepth);
    return;
  }
  if (!skipped) setReadingDepth(inferReadingDepthFromHash());
}

export function canNavigateReadingBack(): boolean {
  return readingDepth() > 0;
}

let skipNextReadingPopstateDepth = false;

export function goBackToReadingList(onFallback: () => void): void {
  if (canNavigateReadingBack()) {
    skipNextReadingPopstateDepth = true;
    window.history.back();
    return;
  }
  navigateReading({ kind: 'list' }, 'replace');
  setReadingDepth(0);
  onFallback();
}

export function isReadingHash(rawHash = location.hash): boolean {
  const raw = rawHash.replace(/^#/, '');
  return raw === PREFIX || raw.startsWith(`${PREFIX}/`);
}

export function parseReadingRoute(rawHash = location.hash): ReadingRoute | null {
  const raw = rawHash.replace(/^#/, '');
  if (raw === PREFIX) return { kind: 'list' };
  if (!raw.startsWith(`${PREFIX}/`)) return null;
  const slug = decodeURIComponent(raw.slice(PREFIX.length + 1)).trim();
  if (!slug) return { kind: 'list' };
  return { kind: 'detail', slug };
}

export function readingHash(slug?: string): string {
  if (!slug) return `#${PREFIX}`;
  return `#${PREFIX}/${encodeURIComponent(slug)}`;
}

export function navigateReading(route: ReadingRoute, mode: 'push' | 'replace' = 'push'): void {
  const next =
    route.kind === 'list' ? readingHash() : readingHash(route.slug);
  if (location.hash === next) return;
  if (mode === 'replace') {
    const depth = route.kind === 'list' ? 0 : inferReadingDepthFromHash();
    setReadingDepth(depth);
    history.replaceState({ reading: true, rDepth: depth }, '', next);
    return;
  }
  if (route.kind === 'detail' && !isReadingHash()) {
    saveOutdoorHashIfNeeded();
    setReadingDepth(1);
    history.pushState({ reading: true, rDepth: 1 }, '', readingHash());
    setReadingDepth(2);
    history.pushState({ reading: true, rDepth: 2 }, '', next);
    return;
  }
  let depth: number;
  if (!isReadingHash()) {
    saveOutdoorHashIfNeeded();
    depth = 1;
  } else {
    depth = readingDepth() + 1;
  }
  setReadingDepth(depth);
  history.pushState({ reading: true, rDepth: depth }, '', next);
}

export function leaveReadingHash(): void {
  if (!isReadingHash()) return;
  const saved = sessionStorage.getItem(OUTDOOR_HASH_KEY);
  const base = `${location.pathname}${location.search}`;
  const target = saved && saved.startsWith('#') ? `${base}${saved}` : base;
  const depth = readingDepth();

  if (depth >= 1) {
    skipNextReadingPopstateDepth = true;
    setReadingDepth(0);
    if (depth === 1) {
      history.back();
    } else {
      history.go(-depth);
    }
    return;
  }

  setReadingDepth(0);
  history.replaceState({ reading: false, playtest: true }, '', target);
}
