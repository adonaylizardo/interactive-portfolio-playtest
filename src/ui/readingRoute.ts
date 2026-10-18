export type ReadingRoute =
  | { kind: 'list' }
  | { kind: 'detail'; slug: string };

const PREFIX = '/leer';

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
  if (mode === 'replace') history.replaceState({ reading: true }, '', next);
  else history.pushState({ reading: true }, '', next);
}

export function leaveReadingHash(): void {
  if (!isReadingHash()) return;
  history.pushState({ reading: false }, '', `${location.pathname}${location.search}`);
}
