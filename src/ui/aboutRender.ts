import type { AboutBlock } from '../data/about';
import { aboutSectionId } from '../data/aboutSectionId';

export function aboutHeadingSectionId(block: AboutBlock): string | undefined {
  if (block.kind !== 'heading' || block.level === 1) return undefined;
  return aboutSectionId(block.text);
}

export function aboutBlockNode(block: AboutBlock): HTMLElement {
  if (block.kind === 'heading') {
    const level = block.level;
    const tag = level === 1 ? 'h4' : level === 2 ? 'h5' : 'h6';
    const h = document.createElement(tag);
    h.className = `about__h${level}`;
    h.textContent = block.text;
    const id = aboutHeadingSectionId(block);
    if (id) {
      h.id = id;
      h.dataset.aboutSection = id;
    }
    return h;
  }
  if (block.kind === 'image') {
    const picture = document.createElement('picture');
    picture.className = 'about__photo';
    const webp = document.createElement('source');
    webp.type = 'image/webp';
    webp.srcset = `${import.meta.env.BASE_URL}about/${block.name}.webp`;
    const img = document.createElement('img');
    img.src = `${import.meta.env.BASE_URL}about/${block.fallback}`;
    img.width = block.width;
    img.height = block.height;
    img.alt = block.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    picture.append(webp, img);
    return picture;
  }
  const p = document.createElement('p');
  p.className = 'about__text';
  block.lines.forEach((line, i) => {
    if (i > 0) p.appendChild(document.createElement('br'));
    for (const part of line) {
      if (!part.href) {
        p.appendChild(document.createTextNode(part.text));
        continue;
      }
      const a = document.createElement('a');
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = part.text;
      p.appendChild(a);
    }
  });
  return p;
}

/** Intro = title (h1, h3); body starts at the first paragraph after the h3 (EN + ES). */
export function splitAboutIntroBody(blocks: AboutBlock[]): { intro: AboutBlock[]; body: AboutBlock[] } {
  const intro: AboutBlock[] = [];
  const body: AboutBlock[] = [];
  let seenH3 = false;
  let pastIntro = false;
  for (const block of blocks) {
    if (!pastIntro) {
      if (block.kind === 'heading' && block.level === 3) {
        seenH3 = true;
        intro.push(block);
        continue;
      }
      if (seenH3 && block.kind === 'paragraph') {
        pastIntro = true;
        body.push(block);
        continue;
      }
      intro.push(block);
      continue;
    }
    body.push(block);
  }
  return { intro, body };
}
