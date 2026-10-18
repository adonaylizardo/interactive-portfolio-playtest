import type { TalkItem, TalkSection, WritingItem } from '../data/experiences';
import { t, type I18nKey } from './i18n';

export function writingTitle(item: WritingItem): string {
  if (item.title) return item.title;
  if (item.titleKey) return t(item.titleKey as I18nKey);
  return '';
}

export function writingMeta(item: WritingItem): string {
  const parts: string[] = [];
  if (item.publication) parts.push(item.publication);
  if (item.date) parts.push(item.date);
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
  if (item.date) parts.push(item.date);
  if (item.duration) parts.push(item.duration);
  return parts.join(' · ');
}

export function talkSectionTitle(section: TalkSection): string {
  if (section.titleKey) return t(section.titleKey as I18nKey);
  return section.title ?? '';
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
