import talksJson from './talks.json';
import writingsJson from './writings.json';

export const EXPERIENCE_BUILDING_IDS = ['teresa', 'biblioteca'] as const;
export type ExperienceBuildingId = (typeof EXPERIENCE_BUILDING_IDS)[number];

export function isExperienceBuilding(id: string | null | undefined): id is ExperienceBuildingId {
  return !!id && (EXPERIENCE_BUILDING_IDS as readonly string[]).includes(id);
}

export type TalkItem = {
  id: string;
  example?: boolean;
  title?: string;
  meta?: string;
  titleKey?: string;
  metaKey?: string;
};

export type WritingItem = {
  id: string;
  example?: boolean;
  title?: string;
  url?: string;
  date?: string;
  publication?: string;
  readTime?: string;
  titleKey?: string;
  metaKey?: string;
};

export type WritingSection = {
  id: string;
  titleKey: string;
  descKey?: string;
  items: WritingItem[];
};

type WritingsFile = {
  sections: WritingSection[];
  substackUrl?: string;
};

type TalksFile = {
  items: TalkItem[];
  comingSoon?: boolean;
};

export const TALKS_COMING_SOON = !!(talksJson as TalksFile).comingSoon;
export const TALKS: TalkItem[] = (talksJson as TalksFile).items;
export const WRITINGS: WritingSection[] = (writingsJson as WritingsFile).sections;
export const WRITINGS_SUBSTACK_URL =
  (writingsJson as WritingsFile).substackUrl ?? 'https://uxsidekick.substack.com/';
