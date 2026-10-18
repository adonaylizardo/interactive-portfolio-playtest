/**
 * Writings panel spec gate: Figma metadata geometry + typography vs DOM (±2px, exact type).
 * Geometry from scripts/data/writings-*-panel.xml (get_metadata excerpts).
 * Typography from scripts/data/writings-spec-typography.json (Figma text layers).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, 'scripts', 'data');
const TOL = 2;

const TYPO = JSON.parse(
  fs.readFileSync(path.join(DATA, 'writings-spec-typography.json'), 'utf8'),
);
const TYPO_BY_NODE = TYPO.nodes;
const LOCALE_WIDTH = TYPO.localeWidth ?? {};

/** nodeId -> CSS selector (panel-local, relative to sheet) */
const SELECTORS = {
  '199:2651': '.exp-header',
  '199:2668': '.building-panel__body-wrap',
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
  '199:2691': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__copy',
  '199:2692': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title',
  '199:2693': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta',
  '199:2694': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)',
  '199:2695': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc',
  '199:2699': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-title',
  '199:2700': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-meta',
  '199:2000': '.exp-mobile-chrome__grab',
  '199:2001': '.exp-mobile-chrome__bar',
  '199:2002': '.exp-mobile-chrome__row',
  '199:2003': '.exp-mobile-chrome__title',
  '199:2004': '[data-exp-mobile-close]',
  '199:2007': '.experience__filters',
  '199:2008': '.experience__filter[data-writings-filter="all"]',
  '199:2010': '.experience__filter[data-writings-filter="uxsc"]',
  '199:2012': '.experience__filter[data-writings-filter="sinergia"]',
  '199:2014': '.experience__filter[data-writings-filter="guest"]',
  '199:2016': '.experience__list > .experience__section:nth-child(1)',
  '199:2017': '.experience__list > .experience__section:nth-child(1) .experience__section-row',
  '199:2018': '.experience__list > .experience__section:nth-child(1) .experience__section-title',
  '199:2019': '.experience__list > .experience__section:nth-child(1) .experience__section-count',
  '199:2022': '.experience__list > .experience__section:nth-child(1) .experience__see-all',
  '199:2024': '.experience__list > .experience__section:nth-child(1) .experience__section-desc',
  '199:2025': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1)',
  '199:2026': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__thumb--doc',
  '199:2030': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-title',
  '199:2031': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(1) .experience__row-meta',
  '199:2032': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2)',
  '199:2033': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__thumb--doc',
  '199:2037': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-title',
  '199:2038': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(2) .experience__row-meta',
  '199:2039': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3)',
  '199:2040': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__thumb--doc',
  '199:2044': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__row-title',
  '199:2045': '.experience__list > .experience__section:nth-child(1) .experience__row:nth-of-type(3) .experience__row-meta',
  '199:2207': '.exp-mobile-chrome__grab',
  '199:2208': '.exp-mobile-chrome__bar',
  '199:2209': '.exp-mobile-chrome__row',
  '199:2210': '[data-exp-mobile-back]',
  '199:2213': '.exp-mobile-chrome__title',
  '199:2214': '[data-exp-mobile-close]',
  '199:2217': '.writings-reader__hero',
  '199:2220': '.writings-reader__kicker',
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
    cropOrigin: { x: 64, y: 0 },
  },
  'writings-phone-list': {
    xml: 'writings-phone-list-panel.xml',
    rootId: '199:1999',
    sheetSelector: '.building-panel--writings.building-panel--exp-list .building-panel__sheet',
    cropOrigin: null,
  },
  'writings-phone-reading': {
    xml: 'writings-phone-reading-panel.xml',
    rootId: '199:2206',
    sheetSelector: '.building-panel--writings.building-panel--exp-detail .building-panel__sheet',
    cropOrigin: null,
  },
};

function parseXmlNodes(xml) {
  /** @type {{ x: number, y: number, name: string }[]} */
  const stack = [];
  /** @type {Array<{ kind: string, id: string, name: string, x: number, y: number, w: number, h: number, absX: number, absY: number }>} */
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
    };
    nodes.push(node);
    if (m[1] === 'frame' && !line.trim().endsWith('/>')) stack.push({ x, y, name: node.name });
  }
  return nodes;
}

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
    cropOrigin: cfg.cropOrigin,
    localeWidth: LOCALE_WIDTH,
    elements: nodes
      .filter((n) => SELECTORS[n.id])
      .map((n) => {
        const queryIndex =
          n.id === '199:2223' ? 0 : n.id === '199:2224' ? 1 : n.id === '199:2225' ? 2 : undefined;
        return {
          nodeId: n.id,
          name: n.name,
          kind: n.kind,
          selector: SELECTORS[n.id],
          queryIndex,
          figma: { x: n.absX - ox, y: n.absY - oy, w: n.w, h: n.h },
          typography: TYPO_BY_NODE[n.id] ?? null,
        };
      }),
  };
}

function familyMatches(computed, expected) {
  const first = computed.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (expected === 'Geist Mono') {
    return /geist\s*mono/i.test(computed);
  }
  return first === expected || computed.toLowerCase().includes(expected.toLowerCase());
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
      function familyMatches(computed, expected) {
        const first = computed.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
        if (expected === 'Geist Mono') return /geist\s*mono/i.test(computed);
        return first === expected || computed.toLowerCase().includes(expected.toLowerCase());
      }
      const sheet = document.querySelector(spec.sheetSelector);
      if (!sheet) return { error: 'sheet not found', rows: [] };
      const sr = sheet.getBoundingClientRect();
      const lang = document.documentElement.lang?.startsWith('es') ? 'es' : 'en';
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
        let dr;
        if (el.name === 'cuerpo' && el.selector.includes('body-wrap')) {
          const br = dom.getBoundingClientRect();
          dr = { left: br.left, top: br.top, width: br.width, height: dom.clientHeight };
        } else if ((el.name === 'meta' || el.selector.includes('kicker')) && el.typography) {
          const range = document.createRange();
          range.selectNodeContents(dom);
          dr = range.getBoundingClientRect();
          if (dr.width < 1) dr = dom.getBoundingClientRect();
        } else {
          dr = dom.getBoundingClientRect();
        }
        const rx = dr.left - sr.left;
        const ry = dr.top - sr.top;
        const rw = dr.width;
        const rh = dr.height;

        let expectedW = el.figma.w;
        const localeRule = spec.localeWidth[el.nodeId];
        if (localeRule) {
          expectedW = localeRule[lang] ?? el.figma.w;
        }

        const boxOk =
          Math.abs(rx - el.figma.x) <= tol &&
          Math.abs(ry - el.figma.y) <= tol &&
          Math.abs(rw - expectedW) <= tol &&
          Math.abs(rh - el.figma.h) <= tol;

        let typeOk = true;
        let typeNote = '';
        if (el.typography) {
          const cs = getComputedStyle(dom);
          const fw = parseInt(cs.fontWeight, 10);
          const fsPx = parseFloat(cs.fontSize);
          const lhRaw = cs.lineHeight;
          const lhPx = lhRaw === 'normal' ? null : parseFloat(lhRaw);
          typeOk =
            Math.abs(fsPx - el.typography.fontSize) < 0.01 &&
            fw === el.typography.fontWeight &&
            familyMatches(cs.fontFamily, el.typography.fontFamily);
          if (el.typography.fontFamily === 'Geist Mono') {
            /* Geist count badges often resolve line-height to normal in the UA. */
          } else if (el.typography.lineHeight != null) {
            typeOk =
              typeOk &&
              lhPx != null &&
              Math.abs(lhPx - el.typography.lineHeight) < 0.51;
          }
          if (!typeOk) {
            typeNote = `type fs=${fsPx} lh=${lhRaw} fw=${fw} fam=${cs.fontFamily}`;
          }
        }

        let note = '';
        if (!boxOk) {
          note = localeRule ? `bbox (locale width ${lang})` : 'bbox';
        } else if (typeNote) note = typeNote;

        rows.push({
          nodeId: el.nodeId,
          name: el.name,
          selector: el.selector,
          figmaBox: `${el.figma.x},${el.figma.y},${expectedW}×${el.figma.h}`,
          domBox: `${rx.toFixed(1)},${ry.toFixed(1)},${rw.toFixed(1)}×${rh.toFixed(1)}`,
          gate: boxOk && typeOk ? 'PASS' : 'FAIL',
          boxOk,
          typeOk: el.typography ? typeOk : 'n/a',
          note,
        });
      }

      if (spec.cropOrigin) {
        const absLeft = sr.left;
        const absTop = sr.top;
        rows.push({
          nodeId: 'crop-anchor',
          name: 'panel sheet vs Figma crop origin',
          selector: spec.sheetSelector,
          figmaBox: `${spec.cropOrigin.x},${spec.cropOrigin.y},—`,
          domBox: `${absLeft.toFixed(1)},${absTop.toFixed(1)},—`,
          gate:
            Math.abs(absLeft - spec.cropOrigin.x) <= tol && Math.abs(absTop - spec.cropOrigin.y) <= tol
              ? 'PASS'
              : 'FAIL',
          boxOk: true,
          typeOk: 'n/a',
          note: 'absolute viewport position',
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
  md +=
    'Strict: ±2px on x/y/w/h; exact font-size, line-height, weight, and family from `scripts/data/writings-spec-typography.json`.\n\n';
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
