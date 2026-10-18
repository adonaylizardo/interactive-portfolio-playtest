import { ABOUT, type AboutBlock } from './about';
import { CASES, CASE_CARD_TITLES, CASE_HOUSE_IDS, type CaseHouseId } from './cases';
import { TALKS, WRITINGS } from './experiences';
import { aboutSectionId } from './aboutSectionId';
import { talkTitle, writingTitle } from '../ui/contentLabels';
import { t, getLang } from '../ui/i18n';
import { CONTACT_EMAIL, CV_HREF } from './contactLinks';

export type SearchResultKind =
  | 'cases'
  | 'articles'
  | 'talks'
  | 'achievements'
  | 'landmarks'
  | 'contact'
  | 'about';

export type SearchResult = {
  kind: SearchResultKind;
  title: string;
  snippet: string;
  targetId: string;
  score: number;
  /** Lowercase haystack used for match highlighting. */
  haystack: string;
};

export type SearchResultGroup = {
  kind: SearchResultKind;
  label: string;
  items: SearchResult[];
};

export type SearchTypeChip = {
  kind: SearchResultKind;
  label: string;
};

const LANDMARK_IDS = ['sambil', 'catedral', 'flor'] as const;

const CASE_ALIASES: Record<CaseHouseId, string[]> = {
  volaris: ['volaris', 'airline', 'aerolinea', 'aerolínea'],
  bain: ['bain', 'consulting'],
  mentoria: ['mentoria', 'mentoría', 'applaudo'],
  finoa: ['finoa', 'crypto'],
  pg: ['pg', 'p&g', 'procter', 'gamble'],
};

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .toLowerCase();
}

function matchScore(haystack: string, query: string): number {
  const h = norm(haystack);
  const q = norm(query.trim());
  if (!q) return 0;
  if (h.includes(q)) return q.length / Math.max(h.length, 1) + (h.startsWith(q) ? 0.5 : 0);
  const words = q.split(/\s+/).filter(Boolean);
  if (words.every((w) => h.includes(w))) return 0.35 + words.length * 0.05;
  return 0;
}

function caseText(id: CaseHouseId): string {
  const c = CASES[id];
  if (!c) return '';
  const chunks: string[] = [c.headline, c.subtitle, c.shortHeadline ?? '', ...CASE_ALIASES[id]];
  for (const block of [...c.full, ...c.short]) {
    if (block.kind === 'section') {
      if (block.heading) chunks.push(block.heading);
      chunks.push(...block.paragraphs);
      if (block.bullets) chunks.push(...block.bullets);
    } else chunks.push(block.text);
  }
  return chunks.join(' ');
}

function aboutBlockPlain(block: AboutBlock): string {
  if (block.kind === 'heading') return block.text;
  if (block.kind === 'image') return '';
  return block.lines.flat().map((p) => p.text).join(' ');
}

function excerpt(text: string, query: string, maxLen = 96): string {
  const n = norm(text);
  const q = norm(query);
  const idx = q ? n.indexOf(q.split(/\s+/)[0] ?? q) : -1;
  let slice = text;
  if (idx >= 0) {
    const start = Math.max(0, idx - 24);
    slice = text.slice(start, start + maxLen);
    if (start > 0) slice = `…${slice}`;
  } else slice = text.slice(0, maxLen);
  if (slice.length < text.length && !slice.endsWith('…')) slice += '…';
  return slice.replace(/\s+/g, ' ').trim();
}

function pushRow(out: SearchResult[], row: Omit<SearchResult, 'score'> & { score?: number }): void {
  out.push({ ...row, score: row.score ?? 0 });
}

function buildIndex(): SearchResult[] {
  const out: SearchResult[] = [];

  for (const id of CASE_HOUSE_IDS) {
    const title = CASE_CARD_TITLES[id];
    const text = caseText(id);
    pushRow(out, {
      kind: 'cases',
      title,
      snippet: CASES[id]?.subtitle ?? title,
      targetId: id,
      haystack: `${title} ${text}`,
    });
  }

  for (const section of WRITINGS) {
    for (const item of section.items) {
      const title = writingTitle(item);
      pushRow(out, {
        kind: 'articles',
        title,
        snippet: item.publication ?? 'adonaylizardo.com',
        targetId: item.id,
        haystack: `${title} ${item.publication ?? ''} ${item.url ?? ''} artículo article diseño design`,
      });
    }
  }

  for (const talk of TALKS) {
    const title = talkTitle(talk);
    pushRow(out, {
      kind: 'talks',
      title,
      snippet: talk.date ?? 'Talk',
      targetId: talk.id,
      haystack: `${title} ${talk.url ?? ''} talk charla speaker teresa teatro`,
    });
  }
  pushRow(out, {
    kind: 'talks',
    title: t('panel.talks'),
    snippet: 'Teresa',
    targetId: 'teresa-building',
    haystack: 'talks charlas speaker teresa teatro podcast video',
  });

  pushRow(out, {
    kind: 'achievements',
    title: t('chrome.mentorshipStat'),
    snippet: t('chrome.achievements'),
    targetId: 'mentorship',
    haystack: `${t('chrome.mentorshipStat')} ${t('chrome.achievements')} logros achievements mentor`,
  });

  for (const id of LANDMARK_IDS) {
    const c = CASES[id];
    pushRow(out, {
      kind: 'landmarks',
      title: c?.headline ?? id,
      snippet: c?.full[0]?.kind === 'section' ? (c.full[0].paragraphs[0] ?? '') : '',
      targetId: id,
      haystack: `${c?.headline ?? id} landmark map`,
    });
  }

  pushRow(out, {
    kind: 'contact',
    title: t('chrome.contact'),
    snippet: CONTACT_EMAIL,
    targetId: 'contact',
    haystack: `${t('chrome.contact')} ${CONTACT_EMAIL} email correo`,
  });
  pushRow(out, {
    kind: 'contact',
    title: 'Email',
    snippet: CONTACT_EMAIL,
    targetId: 'email',
    haystack: `email ${CONTACT_EMAIL}`,
  });
  pushRow(out, {
    kind: 'contact',
    title: t('chrome.downloadCv'),
    snippet: 'CV PDF',
    targetId: 'cv',
    haystack: `cv curriculum vitae download ${CV_HREF} ${t('chrome.downloadCv')}`,
  });

  let sectionTitle = '';
  let sectionId = 'about';
  let sectionParts: string[] = [];
  const flushAbout = () => {
    if (!sectionParts.length && !sectionTitle) return;
    const full = sectionParts.join(' ').replace(/\s+/g, ' ').trim();
    pushRow(out, {
      kind: 'about',
      title: sectionTitle || 'About me',
      snippet: full.slice(0, 120),
      targetId: sectionId,
      haystack: `${sectionTitle} ${full}`,
    });
  };

  for (const block of ABOUT) {
    if (block.kind === 'heading') {
      flushAbout();
      sectionTitle = block.text;
      sectionId = block.level >= 2 ? aboutSectionId(block.text) : 'about';
      sectionParts = [block.text];
      continue;
    }
    const plain = aboutBlockPlain(block);
    if (plain) sectionParts.push(plain);
  }
  flushAbout();

  pushRow(out, {
    kind: 'about',
    title: 'About me',
    snippet: 'Adonay Lizardo',
    targetId: 'about',
    haystack: ABOUT.map(aboutBlockPlain).join(' '),
  });

  return out;
}

let indexCache: SearchResult[] | null = null;

function getIndex(): SearchResult[] {
  if (!indexCache) indexCache = buildIndex();
  return indexCache;
}

/** Rebuild when language changes (achievement/contact labels). */
export function resetSearchIndexForTests(): void {
  indexCache = null;
}

export function searchTypeChips(): SearchTypeChip[] {
  const kinds: SearchResultKind[] = [
    'cases',
    'articles',
    'talks',
    'achievements',
    'landmarks',
    'contact',
  ];
  const labels: Record<SearchResultKind, Parameters<typeof t>[0]> = {
    cases: 'search.group.cases',
    articles: 'search.group.articles',
    talks: 'search.group.talks',
    achievements: 'search.group.achievements',
    landmarks: 'search.group.landmarks',
    contact: 'search.group.contact',
    about: 'search.group.about',
  };
  return kinds.map((kind) => ({ kind, label: t(labels[kind]) }));
}

export function searchSite(query: string): SearchResultGroup[] {
  const q = query.trim();
  if (!q) return [];
  void getLang();

  const scored = getIndex().map((row) => {
    const score = matchScore(row.haystack, q);
    const snippet = row.kind === 'about' ? excerpt(row.haystack.replace(row.title, '').trim() || row.haystack, q) : excerpt(row.snippet || row.haystack, q);
    return { ...row, snippet, score };
  }).filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const byKind = new Map<SearchResultKind, SearchResult[]>();
  const seen = new Set<string>();
  for (const row of scored) {
    const key = `${row.kind}:${row.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byKind.get(row.kind) ?? [];
    if (list.length >= 8) continue;
    list.push(row);
    byKind.set(row.kind, list);
  }

  const order: SearchResultKind[] = [
    'cases',
    'articles',
    'talks',
    'achievements',
    'landmarks',
    'contact',
    'about',
  ];

  const labels: Record<SearchResultKind, Parameters<typeof t>[0]> = {
    cases: 'search.group.cases',
    articles: 'search.group.articles',
    talks: 'search.group.talks',
    achievements: 'search.group.achievements',
    landmarks: 'search.group.landmarks',
    contact: 'search.group.contact',
    about: 'search.group.about',
  };

  return order
    .filter((k) => byKind.has(k))
    .map((kind) => ({
      kind,
      label: t(labels[kind]),
      items: byKind.get(kind)!,
    }));
}

/** Chip filter: all items of a type (optional query narrows within that type). */
export function searchResultsForKind(
  kind: SearchResultKind,
  query = '',
): SearchResultGroup | null {
  void getLang();
  const q = query.trim();
  const labels: Record<SearchResultKind, Parameters<typeof t>[0]> = {
    cases: 'search.group.cases',
    articles: 'search.group.articles',
    talks: 'search.group.talks',
    achievements: 'search.group.achievements',
    landmarks: 'search.group.landmarks',
    contact: 'search.group.contact',
    about: 'search.group.about',
  };

  const scored = getIndex()
    .filter((row) => row.kind === kind)
    .map((row) => {
      const score = q ? matchScore(row.haystack, q) : 1;
      const snippet =
        row.kind === 'about'
          ? excerpt(row.haystack.replace(row.title, '').trim() || row.haystack, q || row.title)
          : excerpt(row.snippet || row.haystack, q || row.title);
      return { ...row, snippet, score };
    })
    .filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const items: SearchResult[] = [];
  for (const row of scored) {
    const key = `${row.targetId}:${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(row);
    if (items.length >= 20) break;
  }
  if (!items.length) return null;
  return { kind, label: t(labels[kind]), items };
}
