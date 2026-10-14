/**
 * Run #46 airline case panel (deploy gate). Opens the case building's panel and checks:
 *  - the title is the headline; the client is never named (page text, panel, URL hash)
 *  - desktop (>= 768 px) shows the full English text, line for line; phone shows the short version
 *  - the text is readable (font sizes, no sideways scroll) and the panel scrolls to the closing line
 * Usage: imported by qa-smoke.mjs; `node scripts/qa-run46-case.mjs [--shots] [url]` runs it alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';
import { installReadyWait } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN46_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } } },
  'webkit-1280': { type: webkit, options: { viewport: { width: 1280, height: 800 } } },
  'chromium-375': {
    type: chromium,
    options: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    phone: true,
  },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, phone: true },
};

const HEADLINE = "A contract engineering couldn't misread";
const PROBLEM =
  "On a Latin American airline's booking app (Android and iOS), Figma, specs, and code each told a different story about the same component in a booking flow. Several design systems overlapped, so nobody could tell which one was the source of truth. Every gap got reinterpreted downstream, and reworked.";
const DID =
  'As Product Strategist (Q4 2026), I was the sole approver: I cleaned up the Figma file, verified it against the existing booking flow implementation, and turned each component into an explicit sealed contract between design and code. AI agents helped draft and audit; I reviewed and sealed every one myself.';
const DELIVERED = 'No code was delivered. The deliverables: sealed contracts, markdown verification reports, and a Figma handoff.';
const RESULT =
  '10 sealed contracts shipped to engineering on Oct 1, 2026. Full flow: before, 1 to 2 days to about 2 hours, on both Android and iOS. Engineering has already implemented it: what used to take a couple of weeks took just days with the contracts. Leadership gave it the green light as a standard process for projects facing similar problems.';
const RULE = 'Design and code never sync directly. Both pass through the sealed contract first.';
const CLOSING = "The goal wasn't zero defects. It was zero guessing.";

/** The English section of case-airline-panel.md, as [tag, text] in reading order. */
const FULL = [
  ['h3', 'Problem'], ['p', PROBLEM],
  ['h3', 'What I did'], ['p', `${DID} ${DELIVERED}`],
  ['h3', 'Result'], ['p', RESULT],
  ['h3', 'Then I scaled it'], ['p', 'With that green light, I built a methodology to scale it to the rest of the team:'],
  ['li', 'Skills to speed up the process (before, 1 to 2 days to about 2 hours, on both Android and iOS)'],
  ['li', 'A course list for accelerated training'],
  ['li', 'Shadowing and workshops with key people on the project'],
  ['li', 'Alignment with leadership and the client for proper adoption'],
  ['h3', 'The rule'], ['p', RULE],
  ['em', CLOSING],
];
const SHORT = [
  ['h3', 'Problem'], ['p', PROBLEM],
  ['h3', 'What I did'], ['p', DID],
  ['h3', 'Result'], ['p', RESULT],
  ['h3', 'Then I scaled it'],
  ['p', 'Skills to speed up the process, a course list, shadowing and workshops, and alignment with leadership and the client.'],
  ['h3', 'The rule'], ['p', RULE],
  ['em', CLOSING],
];

async function readPanel(page) {
  return qa(page, () => {
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const sheet = document.querySelector('.building-panel__sheet');
    const title = document.querySelector('.building-panel__title');
    const article = document.querySelector('.case');
    const lines = [...(article?.querySelectorAll('h3, p.case__text, li, .case__closing em') ?? [])]
      .filter(shown)
      .map((el) => [el.tagName.toLowerCase(), el.textContent.replace(/\s+/g, ' ').trim()]);
    const sizes = [...(article?.querySelectorAll('p.case__text, li') ?? [])].filter(shown).map((el) => parseFloat(getComputedStyle(el).fontSize));
    const closing = article?.querySelector('.case__closing em');
    return {
      title: title?.textContent ?? '',
      closingStyle: closing ? getComputedStyle(closing).fontStyle : '',
      lines,
      minFont: sizes.length ? Math.min(...sizes) : 0,
      bodyText: document.body.innerText,
      placeholders: [...document.querySelectorAll('[data-placeholder]')].filter(shown).length,
      sheet: { scrollH: sheet.scrollHeight, clientH: sheet.clientHeight, overflowX: sheet.scrollWidth - sheet.clientWidth, overflowY: getComputedStyle(sheet).overflowY },
      pageOverflowX: document.documentElement.scrollWidth - window.innerWidth,
      hash: location.hash,
      key: document.querySelector('.building-panel')?.dataset.panelKey ?? '',
    };
  });
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

function compare(tag, got, want, errors) {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) {
    const g = got[i];
    const w = want[i];
    if (!g || !w || g[0] !== w[0] || g[1] !== w[1]) {
      errors.push(`${tag}: line ${i + 1} is ${g ? `<${g[0]}> "${g[1].slice(0, 70)}"` : 'missing'}, want ${w ? `<${w[0]}> "${w[1].slice(0, 70)}"` : 'nothing'}`);
      return false;
    }
  }
  return true;
}

/**
 * @param {{ kind: keyof typeof RUN46_KINDS, base: string, errors: string[], notes: string[], shots?: string }} args
 */
export async function runRun46CaseSuite({ kind, base, errors, notes, shots }) {
  const spec = RUN46_KINDS[kind];
  const tag = `run46-${kind}-case`;
  const browser = installReadyWait(await spec.type.launch());
  const ctx = await browser.newContext(spec.options);
  const page = await ctx.newPage();
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await wait(600);
    await qa(page, () => window.__playtestQa.enterInterior('volaris'));
    await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
    await wait(500);

    if (spec.phone) {
      const peek = await readPanel(page);
      if (peek.title !== HEADLINE) errors.push(`${tag}: peek title is "${peek.title}"`);
      const peekFit = await qa(page, () => {
        const t = document.querySelector('.building-panel__title');
        return { overflow: t.scrollWidth - t.clientWidth, h: t.getBoundingClientRect().height };
      });
      if (peekFit.h > 30) errors.push(`${tag}: peek title wraps (${peekFit.h.toFixed(0)}px tall)`);
      if (shots) await page.screenshot({ path: path.join(shots, `case-panel-${kind}-peek.png`) });
      await page.locator('.building-panel__title').tap();
      await wait(500);
    }

    const m = await readPanel(page);
    if (m.title !== HEADLINE) errors.push(`${tag}: title is "${m.title}", want the headline`);
    if (m.key !== 'Volaris') errors.push(`${tag}: panel key is "${m.key}"`);
    for (const [where, text] of [['page text', m.bodyText], ['URL hash', m.hash]]) {
      if (/volaris/i.test(text)) errors.push(`${tag}: the client name shows in the ${where}`);
    }
    if (!/in=airline/.test(m.hash)) errors.push(`${tag}: URL hash is "${m.hash}", want in=airline`);
    if (m.placeholders) errors.push(`${tag}: placeholder copy still visible`);
    const okText = compare(tag, m.lines, spec.phone ? SHORT : FULL, errors);
    if (spec.phone && m.lines.some(([, t]) => t.includes('No code was delivered'))) errors.push(`${tag}: phone shows the deliverables sentences`);
    if (m.closingStyle !== 'italic') errors.push(`${tag}: closing line is not italic`);
    const minFont = spec.phone ? 16 : 15;
    if (m.minFont < minFont) errors.push(`${tag}: body text ${m.minFont}px (want >= ${minFont}px)`);
    if (m.sheet.overflowX > 0) errors.push(`${tag}: panel scrolls sideways by ${m.sheet.overflowX}px`);
    if (m.pageOverflowX > 0) errors.push(`${tag}: page scrolls sideways by ${m.pageOverflowX}px`);
    if (!/auto|scroll/.test(m.sheet.overflowY)) errors.push(`${tag}: panel overflow-y is ${m.sheet.overflowY}`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `case-panel-${kind}.png`) });
    }

    const scrolls = m.sheet.scrollH > m.sheet.clientH + 1;
    if (spec.phone && !scrolls) errors.push(`${tag}: expanded phone panel does not scroll (${m.sheet.scrollH}/${m.sheet.clientH})`);
    if (scrolls) {
      const box = await page.locator('.building-panel__sheet').boundingBox();
      if (kind.startsWith('chromium')) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 400);
      } else {
        await qa(page, () => {
          const s = document.querySelector('.building-panel__sheet');
          s.scrollTop = s.scrollHeight;
        });
      }
      await wait(400);
    }
    if (!(await closingInView(page))) errors.push(`${tag}: the closing line cannot be scrolled into view`);
    if (shots && scrolls) await page.screenshot({ path: path.join(shots, `case-panel-${kind}-end.png`) });

    notes.push(
      `${tag}: "${m.title}", ${m.lines.length} ${spec.phone ? 'short' : 'full'} lines ${okText ? 'match' : 'DIFFER'}, ` +
        `body ${m.minFont}px, ${scrolls ? `scrolls ${m.sheet.scrollH - m.sheet.clientH}px to the closing line` : 'fits without scrolling'}, hash ${m.hash.match(/in=\w+/)?.[0]}`,
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const shots = args.includes('--shots') ? path.join(ROOT, 'artifacts/run46') : undefined;
  const base = args.find((a) => /^https?:/.test(a)) ?? 'https://adonaylizardo.github.io/interactive-portfolio-playtest/';
  const errors = [];
  const notes = [];
  for (const kind of Object.keys(RUN46_KINDS)) await runRun46CaseSuite({ kind, base, errors, notes, shots });
  for (const n of notes) console.log(`note: ${n}`);
  for (const e of errors) console.error(`FAIL ${e}`);
  process.exit(errors.length ? 1 : 0);
}
