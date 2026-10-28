/**
 * Run #55 case panels (deploy gate): Bain, P&G, Mentoría, Finoa — desktop full vs phone short,
 * verbatim from the attached panel files (internal draft sections omitted). Also checks
 * Sambil / Catedral / Flor landmark copy, no Volaris / [FALTA] / placeholder Spanish in
 * the rendered panel, and 9.5 only on Bain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { launchBrowser, waitForBuildingPanelSettled } from './qa-ready.mjs';
import { ciContextOptions } from './qa-ci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN55_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } } },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    phone: true,
  },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, phone: true },
};

const CASE_SPECS = [
  { id: 'bain', key: 'Bain' },
  { id: 'pg', key: 'P&G' },
  { id: 'mentoria', key: 'Mentoría' },
  { id: 'finoa', key: 'Finoa' },
];

const LANDMARKS = {
  sambil: ['Sambil', 'Sambil, Barquisimeto. A mall shaped like a cuatro, our little guitar.'],
  catedral: ['Catedral', "Barquisimeto's Cathedral. My city has a thing for bold shapes."],
  flor: ['Flor de Venezuela', "Flor de Venezuela. A piece of Barquisimeto, where I'm from."],
};

async function readPanel(page) {
  return qa(page, () => {
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const sheet = document.querySelector('.building-panel__sheet');
    const article = document.querySelector('.case');
    const headline = document.querySelector('.case-read__headline');
    const caseTitle = article?.querySelector('h2, .case__title');
    const titleEl = document.querySelector('.building-panel__title');
    const previewTitle = document.querySelector('.case-preview__title');
    const isPhone = window.matchMedia('(max-width: 767px)').matches;
    const versionRoot = isPhone
      ? document.querySelector('.case__version--short')
      : document.querySelector('.case__version--full');
    const lineRoot = versionRoot && shown(versionRoot) ? versionRoot : article;
    const lines = [...(lineRoot?.querySelectorAll('h3, p.case__text, li, .case__closing em') ?? [])]
      .filter(shown)
      .map((el) => [el.tagName.toLowerCase(), el.textContent.replace(/\s+/g, ' ').trim()]);
    const title =
      (shown(caseTitle) && caseTitle.textContent.trim()) ||
      (shown(headline) && headline.textContent.trim()) ||
      (shown(titleEl) && titleEl.textContent.trim()) ||
      (shown(previewTitle) && previewTitle.textContent.trim()) ||
      '';
    return {
      title,
      lines,
      articleText: article?.innerText ?? '',
      bodyText: document.body.innerText,
      hash: location.hash,
      key: document.querySelector('.building-panel')?.dataset.panelKey ?? '',
      placeholders: [...document.querySelectorAll('[data-placeholder]')].filter(shown).length,
      closingStyle: (() => {
        const em = [...(lineRoot?.querySelectorAll('.case__closing em') ?? article?.querySelectorAll('.case__closing em') ?? [])].find(
          shown,
        );
        return em ? getComputedStyle(em).fontStyle : '';
      })(),
      sheet: sheet
        ? {
            scrollH: sheet.scrollHeight,
            clientH: sheet.clientHeight,
            overflowY: getComputedStyle(sheet).overflowY,
          }
        : null,
    };
  });
}

async function openCasePanelContent(page, spec) {
  const previewRead = page.locator('.case-preview__read, [data-read]').first();
  if (!(await previewRead.isVisible().catch(() => false))) {
    if (spec.phone) {
      await page.locator('.building-panel__title').tap({ timeout: 8000 });
      await wait(400);
    }
    return;
  }
  if (spec.phone) {
    await previewRead.tap();
    await wait(400);
    return;
  }
  await previewRead.click();
  await page
    .waitForFunction(
      () => {
        const art = document.querySelector('.case');
        return !!art && art.getClientRects().length > 0;
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  await wait(350);
  const expand = page.locator('.case-read__bar [data-read-collapse]').first();
  if (await expand.isVisible().catch(() => false)) {
    await page.evaluate(() => {
      document.querySelector('.case-read__bar [data-read-collapse]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    await wait(400);
  }
}

function compare(tag, got, want, errors) {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) {
    const g = got[i];
    const w = want[i];
    if (!g || !w || g[0] !== w[0] || g[1] !== w[1]) {
      errors.push(
        `${tag}: line ${i + 1} is ${g ? `<${g[0]}> "${g[1].slice(0, 80)}"` : 'missing'}, want ${w ? `<${w[0]}> "${w[1].slice(0, 80)}"` : 'nothing'}`,
      );
      return false;
    }
  }
  return true;
}

async function closingInView(page) {
  return qa(page, () => {
    const sheet = document.querySelector('.building-panel__sheet').getBoundingClientRect();
    const em = [...document.querySelectorAll('.case__closing em')].find((el) => el.getClientRects().length > 0);
    if (!em) return false;
    const r = em.getBoundingClientRect();
    return r.top >= sheet.top - 1 && r.bottom <= Math.min(sheet.bottom, window.innerHeight) + 1;
  });
}

/**
 * @param {{ kind: keyof typeof RUN55_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun55CaseSuite({ kind, base, errors, notes, shots }) {
  console.log(`run55-${kind}: starting`);
  const spec = RUN55_KINDS[kind];
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(ciContextOptions(spec.options));
  const page = await ctx.newPage();
  const voiceHits = [];
  const onVoice = (req) => {
    if (/\/audio\/voice\//.test(req.url())) voiceHits.push(req.url());
  };
  try {
    page.on('request', onVoice);
    await page.goto(base, { waitUntil: 'load' });
    await wait(500);

    for (const specCase of CASE_SPECS) {
      const tag = `run55-${kind}-${specCase.id}`;
      await qa(page, (id) => window.__playtestQa.enterInterior(id), specCase.id);
      await waitForBuildingPanelSettled(page);
      await wait(400);
      await openCasePanelContent(page, spec);
      const m = await readPanel(page);
      const variant = await qa(page, () => {
        const phone = window.matchMedia('(max-width:767px)').matches;
        if (!phone) return 'full';
        return document.querySelector('.building-panel--preview.building-panel--expanded') ? 'full' : 'short';
      });
      const expected = await qa(
        page,
        ({ id, v }) => {
          const exp = window.__playtestQa.casePanelQaExpectation(id, v, 'en');
          if (!exp) return null;
          const phone = window.matchMedia('(max-width:767px)').matches;
          const expanded = !!document.querySelector('.building-panel--preview.building-panel--expanded');
          if (phone && expanded) {
            const peek = window.__playtestQa.casePanelQaExpectation(id, 'short', 'en');
            if (peek?.title) exp.title = peek.title;
          }
          return exp;
        },
        { id: specCase.id, v: variant },
      );
      if (!expected) {
        errors.push(`${tag}: no CASES fixture in src/data/cases.ts for ${specCase.id}`);
      } else {
        if (m.title !== expected.title) errors.push(`${tag}: title is "${m.title}", want "${expected.title}"`);
        compare(tag, m.lines, expected.lines, errors);
      }
      if (m.key !== specCase.key && m.key !== specCase.id) {
        errors.push(`${tag}: panel key is "${m.key}", want "${specCase.key}"`);
      }
      if (/volaris/i.test(m.articleText) || /volaris/i.test(m.bodyText)) errors.push(`${tag}: Volaris appears in public text`);
      if (/\[falta\]|Caso de ejemplo|Contenido provisional/i.test(m.articleText)) {
        errors.push(`${tag}: placeholder copy in the panel`);
      }
      if (m.placeholders) errors.push(`${tag}: [data-placeholder] still visible`);
      if (/Omitted brief facts|Brief facts left out|Change notes|testimonial/i.test(m.articleText)) {
        errors.push(`${tag}: internal draft section rendered`);
      }
      const hasNine = /9\.5/.test(m.articleText);
      if (specCase.id === 'bain' && !hasNine) errors.push(`${tag}: Bain is missing 9.5`);
      if (specCase.id !== 'bain' && hasNine) errors.push(`${tag}: 9.5 leaked into ${specCase.id}`);
      if (m.closingStyle !== 'italic') errors.push(`${tag}: closing line is not italic`);
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${specCase.id}-${kind}.png`) });
      }
      const box = await page.locator('.building-panel__sheet').boundingBox();
      if (box && kind.startsWith('chromium')) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 500);
      } else {
        await qa(page, () => {
          const s = document.querySelector('.building-panel__sheet');
          s.scrollTop = s.scrollHeight;
        });
      }
      await wait(300);
      if (!(await closingInView(page))) errors.push(`${tag}: the closing line cannot be scrolled into view`);
      await qa(page, () => window.__playtestQa.leaveInteriorNow());
      await wait(250);
      notes.push(`${tag}: "${m.title}", ${m.lines.length} lines`);
    }

    for (const [id, [name, line]] of Object.entries(LANDMARKS)) {
      const tag = `run55-${kind}-landmark-${id}`;
      await qa(page, (n) => window.__playtestQa.enterInterior(n), id);
      await waitForBuildingPanelSettled(page);
      await wait(300);
      if (spec.phone) {
        const previewRead = page.locator('.case-preview__read, [data-read]').first();
        if (await previewRead.isVisible().catch(() => false)) {
          await previewRead.tap();
        } else {
          await page.locator('.building-panel__title').tap({ timeout: 8000 });
        }
        await wait(300);
      }
      const m = await readPanel(page);
      if (m.title !== name) errors.push(`${tag}: title is "${m.title}"`);
      if (!m.lines.some(([, t]) => t === line)) errors.push(`${tag}: missing "${line}" (got ${JSON.stringify(m.lines)})`);
      if (/volaris|\[falta\]|Caso de ejemplo/i.test(m.articleText)) errors.push(`${tag}: forbidden string in landmark panel`);
      await qa(page, () => window.__playtestQa.leaveInteriorNow());
      await wait(200);
      notes.push(`${tag}: ok`);
    }
    const empty = voiceHits.filter(
      (u) => !/\/(01-intro|0[2-6]|08-flor-de-venezuela|09-cathedral|10-sambil)\S*\.(ogg|mp3)$/.test(u),
    );
    if (empty.length) {
      errors.push(`run55-${kind}: fetched empty voice slot(s) ${empty.join(' | ')}`);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run55') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'http://127.0.0.1:4197/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN55_KINDS)) await runRun55CaseSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
