import talksJson from './talks.json';
import writingsJson from './writings.json';

export const EXPERIENCE_BUILDING_IDS = ['teresa', 'biblioteca'] as const;
export type ExperienceBuildingId = (typeof EXPERIENCE_BUILDING_IDS)[number];

export function isExperienceBuilding(id: string | null | undefined): id is ExperienceBuildingId {
  return !!id && (EXPERIENCE_BUILDING_IDS as readonly string[]).includes(id);
}

export type TalkItem = {
  id: string;
  title: string;
  url: string;
  date?: string;
  duration?: string;
  thumbnail?: string;
};

export type TalkSection = {
  id?: string;
  title?: string;
  titleKey?: string;
  items: TalkItem[];
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
  sections?: TalkSection[];
  items?: TalkItem[];
  comingSoon?: boolean;
};

const talksFile = talksJson as TalksFile;

export const TALK_SECTIONS: TalkSection[] = talksFile.sections?.length
  ? talksFile.sections
  : [{ items: talksFile.items ?? [] }];

export const TALKS: TalkItem[] = TALK_SECTIONS.flatMap((s) => s.items);

export const TALKS_COMING_SOON =
  !!talksFile.comingSoon || (TALKS.length === 0 && !talksFile.sections?.length);

export const WRITINGS: WritingSection[] = (writingsJson as WritingsFile).sections;
export const WRITINGS_SUBSTACK_URL = (writingsJson as WritingsFile).substackUrl;
