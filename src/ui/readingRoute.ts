export type ReadingRoute =
  | { kind: 'list' }
  | { kind: 'detail'; slug: string };

const PREFIX = '/leer';
const OUTDOOR_HASH_KEY = 'portfolio-playtest-outdoor-hash';
const READING_DEPTH_KEY = 'portfolio-playtest-reading-depth';

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

export function readingDepth(): number {
  const n = Number(sessionStorage.getItem(READING_DEPTH_KEY) ?? '0');
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function setReadingDepth(n: number): void {
  sessionStorage.setItem(READING_DEPTH_KEY, String(Math.max(0, n)));
}

export function noteReadingPopstate(): void {
  if (skipNextReadingPopstateDepth) {
    skipNextReadingPopstateDepth = false;
    return;
  }
  setReadingDepth(readingDepth() - 1);
}

export function canNavigateReadingBack(): boolean {
  return readingDepth() > 0;
}

let skipNextReadingPopstateDepth = false;

export function goBackToReadingList(onFallback: () => void): void {
  if (canNavigateReadingBack()) {
    setReadingDepth(readingDepth() - 1);
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
    setReadingDepth(0);
    history.replaceState({ reading: true }, '', next);
    return;
  }
  if (!isReadingHash()) {
    saveOutdoorHashIfNeeded();
    setReadingDepth(1);
  } else {
    setReadingDepth(readingDepth() + 1);
  }
  history.pushState({ reading: true }, '', next);
}

export function leaveReadingHash(): void {
  if (!isReadingHash()) return;
  const saved = sessionStorage.getItem(OUTDOOR_HASH_KEY);
  const base = `${location.pathname}${location.search}`;
  const next = saved && saved.startsWith('#') ? `${base}${saved}` : base;
  history.replaceState({ reading: false, playtest: true }, '', next);
  setReadingDepth(0);
}
