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
  titleKey: string;
  metaKey: string;
};

export type WritingItem = TalkItem;

export type WritingSection = {
  id: string;
  titleKey: string;
  descKey: string;
  items: WritingItem[];
};

export const TALKS: TalkItem[] = talksJson.items as TalkItem[];
export const WRITINGS: WritingSection[] = writingsJson.sections as WritingSection[];
