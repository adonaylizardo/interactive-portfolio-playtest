import type { TalkItem, TalkSection, WritingItem } from '../data/experiences';
import { getLang, t, type I18nKey } from './i18n';

/** Calendar-safe dates for YYYY-MM-DD / YYYY-MM / YYYY (avoids UTC midnight off-by-one). */
export function formatContentDate(raw: string): string {
  const trimmed = raw.trim();
  const locale = getLang() === 'es' ? 'es-VE' : 'en-US';

  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const ym = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const y = Number(ym[1]);
    const m = Number(ym[2]) - 1;
    if (m >= 0 && m <= 11) {
      return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(
        new Date(y, m, 1),
      );
    }
  }

  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]) - 1;
    const d = Number(ymd[3]);
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(
      new Date(y, m, d),
    );
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return raw;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(parsed));
}

export function writingTitle(item: WritingItem): string {
  if (item.title) return item.title;
  if (item.titleKey) return t(item.titleKey as I18nKey);
  return '';
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
  return item.title;
}

export function talkMeta(item: TalkItem): string {
  const parts: string[] = [];
  if (item.date) parts.push(formatContentDate(item.date));
  if (item.duration) parts.push(item.duration);
  return parts.join(' · ');
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
  const fromUrl = item.url.match(/(?:youtu\.be\/|v=|vi\/)([A-Za-z0-9_-]{11})/);
  return fromUrl?.[1] ?? null;
}

/** Prefer YouTube hqdefault when a YouTube id exists; otherwise use data thumbnail. */
export function talkThumbnailUrl(item: TalkItem): string | null {
  const yt = talkYoutubeId(item);
  if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
  return item.thumbnail ?? null;
}
