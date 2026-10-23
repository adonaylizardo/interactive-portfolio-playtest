import list from './worked-with.json';

/**
 * "Worked with" logo strip in the Estudio panel: one `{ name, file }` entry per company in
 * worked-with.json, files in public/logos/ in their original colours (the strip grays them and
 * reveals the colours on hover / focus / tap). `npm run check:logos` validates them; `mono: true`
 * marks a brand that really is black and white.
 */
export type WorkedWithLogo = { name: string; file: string; mono?: boolean };

export const WORKED_WITH: WorkedWithLogo[] = list;

/** Interiors whose panel shows the strip (Adonay's own studio). */
export const WORKED_WITH_PANELS = new Set(['estudio']);
