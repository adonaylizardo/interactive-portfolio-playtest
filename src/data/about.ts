import source from './about.md?raw';

/**
 * "About me" section of the Estudio panel, rendered from about.md (the text of adonaylizardo.com/about,
 * kept verbatim apart from two typo fixes and the site-relative link made absolute). Photos live in
 * public/about/ as 800 px WebP with a PNG / JPEG fallback that keeps the original format.
 */
export type AboutInline = { text: string; href?: string };

export type AboutBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; lines: AboutInline[][] }
  | { kind: 'image'; name: string; fallback: string; width: number; height: number; alt: string };

/** Pixel sizes of the exported files, so the panel reserves each photo's height before it loads. */
const PHOTOS: Record<string, { width: number; height: number; alt: string }> = {
  '01': {
    width: 800,
    height: 598,
    alt: 'Collage: Adonay and his child on a hillside, at his desk, with friends in a cave and with a martial arts class',
  },
  '02': { width: 800, height: 551, alt: 'Old photo of Adonay as a child on a bicycle next to a telescope' },
  '03': { width: 800, height: 341, alt: 'Panorama of the startup office, with a whiteboard and desks' },
  '04': {
    width: 800,
    height: 613,
    alt: 'Roadmap with Later, Next and Now columns above a diagram where user needs meet business needs',
  },
  '05': { width: 800, height: 1317, alt: 'Collage: Adonay teaching a workshop, with course screens on a tablet and a phone' },
};

function parseInline(line: string): AboutInline[] {
  const out: AboutInline[] = [];
  let last = 0;
  for (const m of line.matchAll(/\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[1], href: m[2] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

export function parseAbout(md: string): AboutBlock[] {
  const blocks: AboutBlock[] = [];
  for (const chunk of md.replace(/<!--[\s\S]*?-->/g, '').split(/\n\s*\n/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => l.trim());
    if (!lines.length) continue;
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
    if (heading && lines.length === 1) {
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    const image = /^!\[[^\]]*\]\(photos\/(\d+)\.(png|jpg)\)$/.exec(lines[0]);
    if (image && lines.length === 1) {
      const photo = PHOTOS[image[1]];
      if (!photo) throw new Error(`about.md: no export for photo ${image[1]}`);
      blocks.push({ kind: 'image', name: image[1], fallback: `${image[1]}.${image[2]}`, ...photo });
      continue;
    }
    blocks.push({ kind: 'paragraph', lines: lines.map(parseInline) });
  }
  return blocks;
}

export const ABOUT: AboutBlock[] = parseAbout(source);

/** Interiors whose panel shows the section (Adonay's own studio). */
export const ABOUT_PANELS = new Set(['estudio']);
