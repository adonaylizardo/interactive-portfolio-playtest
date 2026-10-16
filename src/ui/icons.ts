/** 15×15 stroke icons (Tom John spec §1.2). */

const STROKE = `fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"`;

export function iconSvg(name: IconName, size = 15): string {
  return `<svg class="ui-icon" viewBox="0 0 15 15" width="${size}" height="${size}" aria-hidden="true">${PATHS[name]}</svg>`;
}

export type IconName =
  | 'briefcase'
  | 'trophy'
  | 'mail'
  | 'search'
  | 'download'
  | 'sound'
  | 'soundOn'
  | 'expand'
  | 'close'
  | 'collapse'
  | 'rotate'
  | 'cube'
  | 'grid'
  | 'persp'
  | 'map'
  | 'locate'
  | 'info'
  | 'page'
  | 'chevron'
  | 'arrowNe';

const PATHS: Record<IconName, string> = {
  briefcase: `<rect ${STROKE} x="1.5" y="5" width="12" height="8.5" rx="1.5"/><path ${STROKE} d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2h2A1.5 1.5 0 0 1 10 3.5V5M1.5 8.5h12"/>`,
  trophy: `<path ${STROKE} d="M4 2h7v3.5A3.5 3.5 0 0 1 7.5 9 3.5 3.5 0 0 1 4 5.5V2z"/><path ${STROKE} d="M4 3.5H2.5A1.5 1.5 0 0 0 2.5 6.5H4M11 3.5h1.5A1.5 1.5 0 0 1 12.5 6.5H11"/><path ${STROKE} d="M7.5 9v2.5M5 13h5"/>`,
  mail: `<rect ${STROKE} x="1.5" y="3.5" width="12" height="8.5" rx="1.5"/><path ${STROKE} d="m1.5 5 6 4 6-4"/>`,
  search: `<circle ${STROKE} cx="6.5" cy="6.5" r="4"/><path ${STROKE} d="m9.5 9.5 3.5 3.5"/>`,
  download: `<path ${STROKE} d="M7.5 2v8M4.5 7.5 7.5 10.5 10.5 7.5M3 13h9"/>`,
  sound: `<path ${STROKE} d="M3 6h2.5L8.5 3.5v8L5.5 9H3z"/><path ${STROKE} d="M10.5 5.5a3 3 0 0 1 0 4"/><path ${STROKE} d="m2 2 11 11"/>`,
  soundOn: `<path ${STROKE} d="M3 6h2.5L8.5 3.5v8L5.5 9H3z"/><path ${STROKE} d="M10.5 5.5a3 3 0 0 1 0 4"/><path ${STROKE} d="M12 4.5a5 5 0 0 1 0 6"/>`,
  expand: `<path ${STROKE} d="M9 3h3v3M6 12H3V9M12 3 9 6M3 12l3-3"/>`,
  close: `<path ${STROKE} d="m3.5 3.5 8 8M11.5 3.5l-8 8"/>`,
  collapse: `<path ${STROKE} d="M3 6h3V3M12 9H9v3M6 3 3 6M9 12l3-3"/>`,
  rotate: `<path ${STROKE} d="M12 7.5A4.5 4.5 0 1 1 10 3.5"/><path ${STROKE} d="M10 1.5v3h3"/>`,
  cube: `<path ${STROKE} d="M7.5 1.5 13 4.5v6L7.5 13.5 2 10.5v-6z"/><path ${STROKE} d="M7.5 13.5V7.5M2 4.5l5.5 3 5.5-3"/>`,
  grid: `<rect ${STROKE} x="2" y="2" width="4.5" height="4.5" rx="0.5"/><rect ${STROKE} x="8.5" y="2" width="4.5" height="4.5" rx="0.5"/><rect ${STROKE} x="2" y="8.5" width="4.5" height="4.5" rx="0.5"/><rect ${STROKE} x="8.5" y="8.5" width="4.5" height="4.5" rx="0.5"/>`,
  persp: `<path ${STROKE} d="M7.5 2 13 12.5H2z"/><path ${STROKE} d="M7.5 2v10.5M4.5 8.5h6"/>`,
  map: `<path ${STROKE} d="M2 3.5 5.5 2l4 2 3.5-1.5v9.5L9.5 13.5l-4-2L2 13z"/><path ${STROKE} d="M5.5 2v9.5M9.5 4v9.5"/>`,
  locate: `<circle ${STROKE} cx="7.5" cy="7.5" r="2"/><path ${STROKE} d="M7.5 1.5v2M7.5 11.5v2M1.5 7.5h2M11.5 7.5h2"/>`,
  info: `<circle ${STROKE} cx="7.5" cy="7.5" r="5.5"/><path ${STROKE} d="M7.5 7v3.5M7.5 4.5h.01"/>`,
  page: `<path ${STROKE} d="M4 2.5h5l3 3V12.5H4z"/><path ${STROKE} d="M9 2.5V5.5h3"/>`,
  chevron: `<path ${STROKE} d="m5 3.5 5 4-5 4"/>`,
  arrowNe: `<path ${STROKE} d="M4 11 11 4M6.5 4H11v4.5"/>`,
};
