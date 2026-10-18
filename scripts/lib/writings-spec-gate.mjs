/**
 * Writings panel spec gate: Figma metadata geometry + typography vs DOM (±2px, exact type).
 * Metadata XML excerpts from Figma MCP get_metadata (file D1Vq9b3rBzXquj0FjwSV2q).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, 'scripts', 'data');

const TOL = 2;

/** @type {Record<string, { fontSize: number, lineHeight?: number, fontWeight: number, fontFamilyIncludes?: string }>} */
const TYPO_BY_ROLE = {
  chipLabel: { fontSize: 13, lineHeight: 16, fontWeight: 500 },
  sectionName: { fontSize: 16, lineHeight: 24, fontWeight: 600 },
  sectionDesc: { fontSize: 13, lineHeight: 18, fontWeight: 400 },
  seeAll: { fontSize: 13, lineHeight: 16, fontWeight: 500 },
  countLabel: { fontSize: 11, fontWeight: 500, fontFamilyIncludes: 'Geist Mono' },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: 500 },
  rowMeta: { fontSize: 12, lineHeight: 16, fontWeight: 400 },
  mobileHeaderTitle: { fontSize: 16, lineHeight: 24, fontWeight: 500 },
  readerKicker: { fontSize: 11, fontWeight: 500 },
  readerTitle: { fontSize: 22, lineHeight: 28, fontWeight: 600 },
  readerMeta: { fontSize: 13, lineHeight: 16, fontWeight: 400 },
  readerBody: { fontSize: 15, lineHeight: 24, fontWeight: 400 },
  substackLabel: { fontSize: 13, lineHeight: 16, fontWeight: 500 },
};

function parseXmlNodes(xml) {
  /** @type {{ x: number, y: number, name: string }[]} */
  const stack = [];
  /** @type {Array<{ kind: string, id: string, name: string, x: number, y: number, w: number, h: number, absX: number, absY: number, parentName: string }>} */
  const nodes = [];
  const tagRe =
    /<(frame|text|instance|rounded-rectangle)\s+id="([^"]+)"\s+name="([^"]*)"\s+x="([^"]+)"\s+y="([^"]+)"\s+width="([^"]+)"\s+height="([^"]+)"\s*\/?>/;
  for (const line of xml.split('\n')) {
    if (line.trim() === '</frame>') stack.pop();
    const m = line.match(tagRe);
    if (!m) continue;
    let ax = 0;
    let ay = 0;
    for (const s of stack) {
      ax += s.x;
      ay += s.y;
    }
    const x = parseFloat(m[4]);
    const y = parseFloat(m[5]);
    const node = {
      kind: m[1],
      id: m[2],
      name: m[3],
      x,
      y,
      w: parseFloat(m[6]),
      h: parseFloat(m[7]),
      absX: ax + x,
      absY: ay + y,
      parentName: stack.length ? stack[stack.length - 1].name : '',
    };
    nodes.push(node);
    if (m[1] === 'frame' && !line.trim().endsWith('/>')) stack.push({ x, y, name: node.name });
  }
  return nodes;
}

function typRole(node, parentName = '') {
  const n = node.name;
  const p = parentName;
  if (node.kind === 'text') {
    if (n === 'etiqueta' && p.includes('chip')) return 'chipLabel';
    if (n === 'nombre') return 'sectionName';
    if (n === 'descripcion') return 'sectionDesc';
    if (n === 'etiqueta' && p.includes('ver-todo')) return 'seeAll';
    if (n === 'etiqueta' && p.includes('conteo')) return 'countLabel';
    if (n === 'titulo' && p === 'encabezado') return 'mobileHeaderTitle';
    if (n === 'titulo' && p.includes('fila-articulo')) return 'rowTitle';
    if (n === 'titulo' && node.absY >= 300) return 'readerTitle';
    if (n === 'meta' && node.absY >= 300) return 'readerMeta';
    if (n === 'meta') return 'rowMeta';
    if (n === 'cuerpo') return 'readerBody';
    if (n === 'etiqueta' && p.includes('boton')) return 'substackLabel';
    if (n === 'etiqueta' && node.absY >= 280) return 'readerKicker';
    if (n === 'etiqueta' && node.absY < 200) return 'readerKicker';
  }
  return null;
}

/** nodeId -> CSS selector (panel-local) */
const SELECTORS = {
  '199:2651': '.exp-header',
  '199:2669': '.experience__filters',
  '199:2670': '.experience__filter[data-writings-filter="all"]',
  '199:2672': '.experience__filter[data-writings-filter="uxsc"]',
  '199:2678': '.experience__list > .experience__section:nth-child(1)',
  '199:2679': '.experience__list > .experience__section:nth-child(1) .experience__section-row',
  '199:2680': '.experience__list > .experience__section:nth-child(1) .experience__section-title',
  '199:2681': '.experience__list > .experience__section:nth-child(1) .experience__section-count',
  '199:2684': '.experience__list > .experience__section:nth-child(1) .experience__see-all',
  '199:2686': '.experience__list > .experience__section:nth-child(1) .experience__section-desc',
  '199:2687': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)',
  '199:2688': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc',
  '199:2692': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title',
  '199:2693': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta',
  '199:2694': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)',
  '199:2000': '.exp-mobile-chrome__grab',
  '199:2001': '.exp-mobile-chrome__bar',
  '199:2002': '.exp-mobile-chrome__row',
  '199:2003': '.exp-mobile-chrome__title',
  '199:2004': '[data-exp-mobile-close]',
  '199:2007': '.experience__filters',
  '199:2008': '.experience__filter[data-writings-filter="all"]',
  '199:2017': '.experience__list > .experience__section:nth-child(1) .experience__section-row',
  '199:2018': '.experience__list > .experience__section:nth-child(1) .experience__section-title',
  '199:2019': '.experience__list > .experience__section:nth-child(1) .experience__section-count',
  '199:2024': '.experience__list > .experience__section:nth-child(1) .experience__section-desc',
  '199:2025': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)',
  '199:2026': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc',
  '199:2030': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title',
  '199:2031': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta',
  '199:2010': '.experience__filter[data-writings-filter="uxsc"]',
  '199:2016': '.experience__list > .experience__section:nth-child(1)',
  '199:2032': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)',
  '199:2033': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc',
  '199:2039': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3)',
  '199:2040': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__thumb--doc',
  '199:2000': '.exp-mobile-chrome__grab',
  '199:2668': '.building-panel__body-wrap',
  '199:2678': '.experience__list > .experience__section:nth-child(1)',
  '199:2687': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)',
  '199:2688': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc',
  '199:2691': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__copy',
  '199:2694': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)',
  '199:2695': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc',
  '199:2217': '.writings-reader__hero',
  '199:2207': '.exp-mobile-chrome__grab',
  '199:2208': '.exp-mobile-chrome__bar',
  '199:2209': '.exp-mobile-chrome__row',
  '199:2210': '[data-exp-mobile-back]',
  '199:2213': '.exp-mobile-chrome__title',
  '199:2214': '[data-exp-mobile-close]',
  '199:2217': '.writings-reader__hero',
  '199:2221': '.writings-reader__title',
  '199:2222': '.writings-reader__meta',
  '199:2223': '.writings-reader__p',
  '199:2224': '.writings-reader__p',
  '199:2225': '.writings-reader__p',
  '199:2226': '.writings-reader__substack',
};

const FRAME_CONFIG = {
  'writings-desktop-list': {
    xml: 'writings-desktop-panel.xml',
    rootId: '199:2650',
    sheetSelector: '.building-panel--writings.building-panel--exp-list .building-panel__sheet',
  },
  'writings-phone-list': {
    xml: 'writings-phone-list-panel.xml',
    rootId: '199:1999',
    sheetSelector: '.building-panel--writings.building-panel--exp-list .building-panel__sheet',
  },
  'writings-phone-reading': {
    xml: 'writings-phone-reading-panel.xml',
    rootId: '199:2206',
    sheetSelector: '.building-panel--writings.building-panel--exp-detail .building-panel__sheet',
  },
};

function loadSpec(frameKey) {
  const cfg = FRAME_CONFIG[frameKey];
  if (!cfg) return null;
  const xml = fs.readFileSync(path.join(DATA, cfg.xml), 'utf8');
  const nodes = parseXmlNodes(xml);
  const root = nodes.find((n) => n.id === cfg.rootId) ?? nodes[0];
  const ox = root?.absX ?? 0;
  const oy = root?.absY ?? 0;
  return {
    frameKey,
    sheetSelector: cfg.sheetSelector,
    elements: nodes
      .filter((n) => SELECTORS[n.id] && (n.kind === 'text' || n.kind === 'frame' || n.kind === 'instance'))
      .map((n) => {
        const role = n.kind === 'text' ? typRole(n, n.parentName) : null;
        const queryIndex =
          n.id === '199:2223' ? 0 : n.id === '199:2224' ? 1 : n.id === '199:2225' ? 2 : undefined;
        return {
          nodeId: n.id,
          name: n.name,
          kind: n.kind,
          selector: SELECTORS[n.id],
          queryIndex,
          figma: { x: n.absX - ox, y: n.absY - oy, w: n.w, h: n.h },
          typography: role ? TYPO_BY_ROLE[role] : null,
        };
      }),
  };
}

function near(a, b) {
  return Math.abs(a - b) <= TOL;
}

/**
 * @param {import('playwright').Page} page
 * @param {string} frameKey
 */
export async function runWritingsSpecGate(page, frameKey) {
  const spec = loadSpec(frameKey);
  if (!spec) return { frameKey, rows: [], pass: false };

  const results = await page.evaluate(
    ({ spec, tol }) => {
      const sheet = document.querySelector(spec.sheetSelector);
      if (!sheet) return { error: 'sheet not found', rows: [] };
      const sr = sheet.getBoundingClientRect();
      const rows = [];
      for (const el of spec.elements) {
        const dom =
          el.queryIndex != null
            ? sheet.querySelectorAll(el.selector)[el.queryIndex]
            : sheet.querySelector(el.selector);
        if (!dom) {
          rows.push({
            nodeId: el.nodeId,
            name: el.name,
            selector: el.selector,
            gate: 'FAIL',
            note: 'missing DOM',
          });
          continue;
        }
        const dr = dom.getBoundingClientRect();
        const rx = dr.left - sr.left;
        const ry = dr.top - sr.top;
        const rw = dr.width;
        const rh = dr.height;
        const textBox = !!el.typography;
        const flexHeight = el.name === 'cuerpo' || el.name === 'hoja-writings';
        const flexWidth = el.name === 'filtros' || el.name.startsWith('chip');
        const boxOk = textBox
          ? Math.abs(rx - el.figma.x) <= tol && Math.abs(ry - el.figma.y) <= tol
          : flexHeight || flexWidth
            ? Math.abs(rx - el.figma.x) <= tol &&
              Math.abs(ry - el.figma.y) <= tol &&
              (flexWidth || Math.abs(rw - el.figma.w) <= tol)
            : Math.abs(rx - el.figma.x) <= tol &&
              Math.abs(ry - el.figma.y) <= tol &&
              Math.abs(rw - el.figma.w) <= tol &&
              Math.abs(rh - el.figma.h) <= tol;
        let typeOk = true;
        let typeNote = '';
        if (el.typography) {
          const cs = getComputedStyle(dom);
          const fw = parseInt(cs.fontWeight, 10) >= 600 ? 600 : parseInt(cs.fontWeight, 10) >= 500 ? 500 : 400;
          const fsPx = parseFloat(cs.fontSize);
          const lhPx = cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight);
          typeOk =
            Math.abs(fsPx - el.typography.fontSize) < 0.01 &&
            (el.typography.lineHeight == null || (lhPx != null && Math.abs(lhPx - el.typography.lineHeight) < 0.51)) &&
            fw === el.typography.fontWeight;
          if (el.typography.fontFamilyIncludes) {
            typeOk = typeOk && cs.fontFamily.includes(el.typography.fontFamilyIncludes);
          }
          if (!typeOk) {
            typeNote = `type fs=${fsPx} lh=${cs.lineHeight} fw=${cs.fontWeight}`;
          }
        }
        rows.push({
          nodeId: el.nodeId,
          name: el.name,
          selector: el.selector,
          figmaBox: `${el.figma.x},${el.figma.y},${el.figma.w}×${el.figma.h}`,
          domBox: `${rx.toFixed(1)},${ry.toFixed(1)},${rw.toFixed(1)}×${rh.toFixed(1)}`,
          gate: boxOk && typeOk ? 'PASS' : 'FAIL',
          boxOk,
          typeOk: el.typography ? typeOk : 'n/a',
          note: !boxOk ? 'bbox' : typeNote,
        });
      }
      return { rows };
    },
    { spec, tol: TOL },
  );

  if (results.error) {
    return { frameKey, rows: [], pass: false, error: results.error };
  }
  const pass = results.rows.length > 0 && results.rows.every((r) => r.gate === 'PASS');
  return { frameKey, rows: results.rows, pass };
}

export function writeSpecGateMarkdown(results, outPath) {
  let md = '# Writings spec gate (Figma metadata vs DOM)\n\n';
  for (const res of results) {
    md += `## ${res.frameKey}\n\n`;
    md += `**Overall:** ${res.pass ? 'PASS' : 'FAIL'}${res.error ? ` (${res.error})` : ''}\n\n`;
    md += '| Node | Name | Selector | Figma box | DOM box | Type | Gate |\n|---|---|---|---|---|---|---|\n';
    for (const r of res.rows) {
      md += `| \`${r.nodeId}\` | ${r.name} | \`${r.selector}\` | ${r.figmaBox} | ${r.domBox} | ${r.typeOk} | ${r.gate} |\n`;
    }
    md += '\n';
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md);
}
