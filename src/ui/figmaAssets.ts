/** Local Figma MCP exports (file D1Vq9b3rBzXquj0FjwSV2q). */
const BASE = `${import.meta.env.BASE_URL}figma-specs`;

export type FigmaFrame =
  | 'talks-phone-map'
  | 'talks-phone-list'
  | 'talks-phone-player'
  | 'talks-desktop-map'
  | 'talks-desktop-list'
  | 'talks-desktop-player'
  | 'writings-phone-map'
  | 'writings-phone-list'
  | 'writings-phone-reading'
  | 'writings-desktop-map'
  | 'writings-desktop-list'
  | 'writings-desktop-reading';

export function figmaAsset(frame: FigmaFrame, file: string): string {
  return `${BASE}/assets/${frame}/${file}`;
}

export function figmaFramePng(frame: FigmaFrame): string {
  return `${BASE}/${frame}.png`;
}

/** Shared play glyph used on talk list thumbs. */
export const FIGMA_PLAY = figmaAsset('talks-desktop-list', '6a8ac.svg');
export const FIGMA_PAUSE = figmaAsset('talks-desktop-player', 'd0608.svg');
export const FIGMA_STAGE = figmaAsset('talks-desktop-player', '0f6fa.png');
export const FIGMA_DOC = figmaAsset('writings-desktop-list', '53843.png');
