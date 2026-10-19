import { buildingSpriteKey, spriteAsset } from '../game/sprites';
import { VOICE_LINES } from './voice-lines';

/** Map landmarks that open a place card on the map (not full interior). */
export const PLACE_CARD_IDS = ['catedral', 'sambil', 'flor'] as const;
export type PlaceCardId = (typeof PLACE_CARD_IDS)[number];

const VOICE_ID: Record<PlaceCardId, keyof typeof VOICE_LINES> = {
  catedral: '09-cathedral',
  sambil: '10-sambil',
  flor: '08-flor-de-venezuela',
};

/** Display names — must match `PANEL_TITLES` in world.ts. */
const TITLES: Record<PlaceCardId, string> = {
  catedral: 'Catedral',
  sambil: 'Sambil',
  flor: 'Flor de Venezuela',
};

export function isPlaceCard(id: string | null | undefined): id is PlaceCardId {
  return !!id && (PLACE_CARD_IDS as readonly string[]).includes(id);
}

export function placeCardTitle(id: PlaceCardId): string {
  return TITLES[id];
}

export function placeCardVoiceId(id: PlaceCardId): string {
  return VOICE_ID[id];
}

/** Verbatim English voice script (Spanish later — do not translate here). */
export function placeCardLine(id: PlaceCardId): string {
  return VOICE_LINES[VOICE_ID[id]].script_text;
}

export function placeCardHeroUrl(id: PlaceCardId): string {
  const key = buildingSpriteKey(id, 'default', false);
  const a = spriteAsset(key);
  const hi = typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.5;
  return `${import.meta.env.BASE_URL}sprites/${hi ? a.f2 : a.f1}`;
}
