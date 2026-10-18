import { ABOUT } from './about';
import { CASES, CASE_CARD_TITLES, CASE_HOUSE_IDS, type CaseHouseId } from './cases';
import { TALKS, WRITINGS } from './experiences';
import { aboutSectionId } from './aboutSectionId';
import { talkTitle, writingTitle } from '../ui/contentLabels';
import { t } from '../ui/i18n';
import { CONTACT_EMAIL } from './contactLinks';

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
  /** Case / landmark building id, talk id, writing id, or about section id. */
  targetId: string;
  score: number;
};

export type SearchResultGroup = {
  kind: SearchResultKind;
  label: string;
  items: SearchResult[];
};

const LANDMARK_IDS = ['sambil', 'catedral', 'flor'] as const;

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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
  const chunks: string[] = [c.headline, c.subtitle, c.shortHeadline ?? ''];
  for (const block of [...c.full, ...c.short]) {
    if (block.kind === 'section') {
      if (block.heading) chunks.push(block.heading);
      chunks.push(...block.paragraphs);
      if (block.bullets) chunks.push(...block.bullets);
    } else chunks.push(block.text);
  }
  return chunks.join(' ');
}

function buildIndex(): SearchResult[] {
  const out: SearchResult[] = [];

  for (const id of CASE_HOUSE_IDS) {
    const title = CASE_CARD_TITLES[id];
    const text = caseText(id);
    out.push({
      kind: 'cases',
      title,
      snippet: CASES[id]?.subtitle ?? title,
      targetId: id,
      score: 0,
    });
    out.push({
      kind: 'cases',
      title,
      snippet: text.slice(0, 120),
      targetId: id,
      score: 0,
    });
  }

  for (const section of WRITINGS) {
    for (const item of section.items) {
      const title = writingTitle(item);
      out.push({
        kind: 'articles',
        title,
        snippet: item.publication ?? 'adonaylizardo.com',
        targetId: item.id,
        score: 0,
      });
    }
  }

  for (const talk of TALKS) {
    out.push({
      kind: 'talks',
      title: talkTitle(talk),
      snippet: talk.url ?? 'Talk',
      targetId: talk.id,
      score: 0,
    });
  }

  out.push({
    kind: 'achievements',
    title: 'mentorship-stat',
    snippet: 'achievements',
    targetId: 'mentorship',
    score: 0,
  });

  for (const id of LANDMARK_IDS) {
    const c = CASES[id];
    out.push({
      kind: 'landmarks',
      title: c?.headline ?? id,
      snippet: c?.full[0]?.kind === 'section' ? c.full[0].paragraphs[0] ?? '' : '',
      targetId: id,
      score: 0,
    });
  }

  out.push({
    kind: 'contact',
    title: 'contact',
    snippet: CONTACT_EMAIL,
    targetId: 'contact',
    score: 0,
  });
  out.push({
    kind: 'contact',
    title: 'Email',
    snippet: CONTACT_EMAIL,
    targetId: 'email',
    score: 0,
  });

  let sectionText = '';
  let sectionTitle = '';
  let sectionId = '';
  const flushAbout = () => {
    if (!sectionTitle) return;
    out.push({
      kind: 'about',
      title: sectionTitle,
      snippet: sectionText.slice(0, 140),
      targetId: sectionId || 'about',
      score: 0,
    });
  };

  for (const block of ABOUT) {
    if (block.kind === 'heading') {
      flushAbout();
      sectionTitle = block.text;
      sectionId = block.level >= 2 ? aboutSectionId(block.text) : 'about';
      sectionText = block.text;
      continue;
    }
    if (block.kind === 'paragraph') {
      const line = block.lines.flat().map((p) => p.text).join(' ');
      sectionText += ` ${line}`;
      if (!sectionTitle) sectionTitle = line.slice(0, 80);
    }
  }
  flushAbout();

  return out;
}

const INDEX = buildIndex();

export function searchSite(query: string): SearchResultGroup[] {
  const q = query.trim();
  if (!q) return [];

  const scored = INDEX.map((row) => {
    let title = row.title;
    let snippet = row.snippet;
    if (row.kind === 'achievements' && row.targetId === 'mentorship') {
      title = t('chrome.mentorshipStat');
      snippet = t('chrome.achievements');
    }
    if (row.kind === 'contact' && row.targetId === 'contact') {
      title = t('chrome.contact');
    }
    const blob = `${title} ${snippet}`;
    const score = Math.max(matchScore(blob, q), matchScore(title, q));
    return { ...row, title, snippet, score };
  }).filter((r) => r.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const byKind = new Map<SearchResultKind, SearchResult[]>();
  const seen = new Set<string>();
  for (const row of scored) {
    const key = `${row.kind}:${row.targetId}:${row.title}`;
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
