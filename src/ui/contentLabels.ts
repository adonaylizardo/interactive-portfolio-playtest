import type { TalkItem, WritingItem } from '../data/experiences';
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
  if (item.title) return item.title;
  if (item.titleKey) return t(item.titleKey as I18nKey);
  return '';
}

export function talkMeta(item: TalkItem): string {
  if (item.meta) return item.meta;
  if (item.metaKey) return t(item.metaKey as I18nKey);
  return '';
}
