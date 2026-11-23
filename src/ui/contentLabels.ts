import { TALKS, WRITINGS, type TalkItem, type TalkSection, type WritingItem } from '../data/experiences';
import { getLang, t, type I18nKey } from './i18n';

type DateParts = { y: number; m: number; d: number };
type YearMonthParts = { y: number; m: number };
type YearParts = { y: number };

const EN_MONTH: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function monthFromName(name: string): number | null {
  const key = name.trim().toLowerCase().replace(/\./g, '');
  return EN_MONTH[key] ?? null;
}

function parseContentDateParts(raw: string): DateParts | YearMonthParts | YearParts | null {
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return { y: Number(trimmed) };
  }

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return { y: Number(ymd[1]), m: Number(ymd[2]), d: Number(ymd[3]) };
  }

  const ym = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const m = Number(ym[2]);
    if (m >= 1 && m <= 12) return { y: Number(ym[1]), m };
  }

  const enLong = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (enLong) {
    const month = monthFromName(enLong[1]);
    if (month) {
      return { y: Number(enLong[3]), m: month, d: Number(enLong[2]) };
    }
  }

  return null;
}

function formatUtcParts(parts: DateParts | YearMonthParts | YearParts, locale: string): string {
  if (!('m' in parts)) {
    return String(parts.y);
  }
  if (!('d' in parts)) {
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(parts.y, parts.m - 1, 1)),
    );
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(parts.y, parts.m - 1, parts.d)));
}

/** Calendar dates for talks/writings — always Y/M/D via UTC (no local-midnight drift). */
export function formatContentDate(raw: string): string {
  const locale = getLang() === 'es' ? 'es-VE' : 'en-US';
  const parts = parseContentDateParts(raw);
  if (!parts) return raw;
  return formatUtcParts(parts, locale);
}

export function isPlaceholderCopy(text: string): boolean {
  return /placeholder|Título del artículo|Article title \(placeholder\)|Descripción de una línea|One-line description \(placeholder\)|Publicación · Fecha · X min|Publication · Date · X min|Texto del artículo \(placeholder\)/i.test(
    text,
  );
}

export function writingItemHasCopy(item: WritingItem): boolean {
  const title = writingTitle(item);
  return title.length > 0 && !isPlaceholderCopy(title);
}

export function writingTitle(item: WritingItem): string {
  if (item.titleKey) return t(item.titleKey as I18nKey);
  return item.title ?? '';
}

export function writingMeta(item: WritingItem): string {
  const parts: string[] = [];
  if (item.publication) parts.push(item.publication);
  if (item.date) parts.push(formatContentDate(item.date));
  if (item.readTime) parts.push(item.readTime);
  if (parts.length) return parts.join(' · ');
  if (item.metaKey) return t(item.metaKey as I18nKey);
  return '';
}

export function talkTitle(item: TalkItem): string {
  if (item.titleKey) return t(item.titleKey as I18nKey);
  return item.title ?? '';
}

export function talkItemHasCopy(item: TalkItem): boolean {
  const title = talkTitle(item);
  return title.length > 0 && !isPlaceholderCopy(title);
}

/** One-line peek for Teresa interior (real titles only). */
export function talksInteriorExcerpt(): string {
  const items = TALKS.filter(talkItemHasCopy);
  const n = items.length;
  const a = items[0] ? talkTitle(items[0]) : '';
  const b = items[1] ? talkTitle(items[1]) : '';
  if (getLang() === 'es') {
    if (n === 0) return 'Charlas';
    if (n === 1) return `${n} charla · ${a}`;
    return `${n} charlas · ${a} · ${b}`;
  }
  if (n === 0) return 'Talks';
  if (n === 1) return `${n} talk · ${a}`;
  return `${n} talks · ${a} · ${b}`;
}

export function writingsInteriorExcerpt(): string {
  const titles: string[] = [];
  for (const section of WRITINGS) {
    for (const item of section.items) {
      if (!writingItemHasCopy(item)) continue;
      titles.push(writingTitle(item));
      if (titles.length >= 2) break;
    }
    if (titles.length >= 2) break;
  }
  const n = WRITINGS.reduce(
    (acc, section) => acc + section.items.filter((item) => writingItemHasCopy(item)).length,
    0,
  );
  const a = titles[0] ?? '';
  const b = titles[1] ?? '';
  if (getLang() === 'es') {
    if (n === 0) return 'Artículos';
    if (n === 1) return `${n} artículo · ${a}`;
    return `${n} artículos · ${a} · ${b}`;
  }
  if (n === 0) return 'Articles';
  if (n === 1) return `${n} article · ${a}`;
  return `${n} articles · ${a} · ${b}`;
}

export function talkMeta(item: TalkItem): string {
  if (item.metaKey) return t(item.metaKey as I18nKey);
  const parts: string[] = [];
  if (item.date) parts.push(formatContentDate(item.date));
  if (item.duration) parts.push(item.duration);
  return parts.join(' · ');
}

export function writingArticleUrl(item: WritingItem): string | null {
  if (item.url?.startsWith('http')) return item.url;
  if (item.titleKey) {
    const key = item.titleKey.replace(/\.title$/, '.url') as I18nKey;
    const url = t(key);
    return url.startsWith('http') ? url : null;
  }
  return null;
}

export function talkSectionTitle(section: TalkSection): string {
  if (section.titleKey) return t(section.titleKey as I18nKey);
  return section.title ?? '';
}

export function writingSourceLabel(item: WritingItem): string {
  return item.publication ?? 'adonaylizardo.com';
}

export function talkYoutubeId(item: TalkItem): string | null {
  if (item.id.startsWith('yt-')) return item.id.slice(3);
  const fromUrl = item.url?.match(/(?:youtu\.be\/|v=|vi\/)([A-Za-z0-9_-]{11})/);
  return fromUrl?.[1] ?? null;
}

/** Talk row thumbnail (~2× chrome list thumb width). Substack originals go through substackcdn resize. */
export function talkThumbnailUrl(item: TalkItem, displayW = 256): string | null {
  const yt = talkYoutubeId(item);
  if (yt) {
    return displayW <= 200
      ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`
      : `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  }
  const thumb = item.thumbnail ?? null;
  if (!thumb) return null;
  if (/substack-post-media|substackcdn|substack\.com/i.test(thumb)) {
    const w = Math.min(512, Math.max(96, displayW));
    return `https://substackcdn.com/image/fetch/w_${w},c_limit,f_auto,q_auto:good/${encodeURIComponent(thumb)}`;
  }
  return thumb;
}
