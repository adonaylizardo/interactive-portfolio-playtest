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
import { launchBrowser } from './qa-ready.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const qa = (page, fn, arg) => page.evaluate(fn, arg);

export const RUN55_KINDS = {
  'chromium-1280': { type: chromium, options: { viewport: { width: 1280, height: 800 } } },
  'webkit-iphone': { type: webkit, options: { ...devices['iPhone 13'] }, phone: true },
};

const CASES = {
  bain: {
    id: 'bain',
    key: 'Bain',
    headline: 'Leading 9 designers across Bain, while still shipping the work',
    shortHeadline: 'Leading 9 designers across Bain',
    full: [
      ['h3', 'Problem'],
      [
        'p',
        "Applaudo's designers were spread across several Bain products, each embedded in its own team. Without a shared space, overlaps and misalignments between products stayed invisible across the portfolio.",
      ],
      ['h3', 'What I did'],
      [
        'p',
        'I was squad lead and mentor for 9 Applaudo designers distributed across several Bain accounts. I ran a weekly team ceremony to connect them, built around three blocks: a Visual Status review where designers look at work in progress side by side (to build horizontal visibility across the portfolio and surface overlaps, not to critique), a shared Experiment Tracker for portfolio initiatives, and a Red Flags block to raise risks early.',
      ],
      ['h3', 'Result'],
      [
        'p',
        "The Bain team's CSAT rating of the Applaudo designers who worked with them rose from about 8.5 to 9.5 across 2025 to 2026, reaching 10 in some quarters.",
      ],
      ['h3', 'Hands-on work'],
      [
        'li',
        "Signal (Product Designer): I built a new design process, with documentation and testing, behind several shipped features. The biggest was a Gantt view, Signal's largest release to date. I also ran a team feedback workshop on Gantt enhancements, and Signal's product team adopted the remote video collaboration method I introduced.",
      ],
      [
        'li',
        'Case Wrap MVP (around June to August 2026, Senior Product Designer / Product Strategist): I reframed case wrap-up as review-and-approve instead of one-click acceptance: AI drafts, humans decide, no "approve all." Three coded directions in Bain\'s design system turned the choice into a team decision. The deliverable was a validated MVP direction. I did not win a concept; I made the trade-off cheap to see.',
      ],
      [
        'li',
        'NPS Prism, Instrument Management (around April to June 2026, sole designer): what the admin called "instruments" were really presets, with real ownership and refresh data scattered in spreadsheets outside the platform. I designed a two-entity model with an in-platform refresh calendar and notifications. Product and engineering approved it for build.',
      ],
      ['li', 'PEG: Product Designer on the account.'],
      ['li', "PAS: product design on Bain's live Partner Assessment System."],
      [
        'em',
        "Leading the portfolio didn't mean stepping back from the work: I kept shipping product while helping nine other designers do the same.",
      ],
    ],
    short: [
      ['li', 'Problem: Bain designers were scattered across teams with no shared space, so overlaps and misalignment stayed invisible.'],
      ['li', 'What I did: Squad lead and mentor for 9 designers; ran a weekly ceremony (Visual Status, Experiment Tracker, Red Flags).'],
      [
        'li',
        "Result: Bain's CSAT rating of the designers rose from about 8.5 to 9.5 across 2025 to 2026, reaching 10 in some quarters.",
      ],
      [
        'li',
        "Hands-on: Signal's Gantt view, its largest release; Case Wrap moved to review-and-approve with AI drafts; NPS Prism moved ownership data off spreadsheets and into the product.",
      ],
      ['em', "Leading didn't mean stepping back: I kept shipping while nine designers got clarity across the portfolio."],
    ],
  },
  pg: {
    id: 'pg',
    key: 'P&G',
    headline: 'An app panelists actually want to open',
    full: [
      ['h3', 'Problem'],
      [
        'p',
        "P&G Latam's innovation team needed a mobile app for its panelists, one that could track the menstrual cycle, collect surveys, and run product tests, while meeting P&G's own standards for performance, reliability, and security around sensitive personal health data. The timeline was tight.",
      ],
      ['h3', 'What I did'],
      [
        'p',
        'As UX/UI Designer at Talpor, I worked in a small cross-functional team (a PM, a science team, and a UI & motion designer), and together we co-created the app in about 8 weeks. The first 2 to 3 weeks were strategy: 4 user profiles, a competitive benchmark, feature focus maps, user flows, and wireframes. Interviews, heuristic tests, and design thinking sessions showed navigation needed to differ across profiles, which shaped a quick-access logging pattern around the calendar, the cycle wheel, and a single add button. From there we built the design system and UI, covering symptom tracking, gamification, a news feed, and "Diary," a survey and product-testing system tied into gamification.',
      ],
      ['h3', 'Result'],
      [
        'p',
        'The app launched with real users in three languages (Portuguese, Spanish, English), reaching panelists mainly in Brazil, Mexico, and the US. It beat the agreed time and quality standards and opened the door to follow-up work with P&G.',
      ],
      ['em', 'Good research finds the shortest path to logging before design ever touches a screen.'],
    ],
    short: [
      [
        'li',
        'Problem: P&G needed panelists to log their cycle, answer surveys, and test products in one app built to handle sensitive health data securely.',
      ],
      [
        'li',
        'What I did: As UX/UI Designer at Talpor, I worked over about 8 weeks, from research and user flows to a full design system and a gamified "Diary" feature.',
      ],
      [
        'li',
        'Result: Launched in 3 languages for panelists in Brazil, Mexico, and the US, beating the agreed time and quality bar.',
      ],
      [
        'li',
        'Extra: The logging flow (calendar, cycle wheel, add button) was shaped directly by interviews and heuristic testing across user profiles.',
      ],
      ['em', 'Good research finds the shortest path to logging before design touches a screen.'],
    ],
  },
  mentoria: {
    id: 'mentoria',
    key: 'Mentoría',
    headline: 'Mentoring with the same rigor as client work',
    shortHeadline: 'Mentoring as a system',
    full: [
      ['h3', 'Problem'],
      [
        'p',
        "Growth inside the design team was hard to see, and there was no structured way to support it. The team needed both: visibility into how designers were developing, and a system to make that growth deliberate, so it could translate into real impact on client accounts and on Applaudo's own goals.",
      ],
      ['h3', 'What I did'],
      [
        'p',
        "I co-created and help lead Applaudo's design mentoring program, run as a product: with releases, a measurement framework, and quarterly goals, not as an informal perk. It has four session formats: allocated 1:1 coaching, booked consultations on demand, scouted invitations, and group team sessions and workshops. Every session is tagged to a shared competencies library (critical thinking, strategic thinking, information architecture, business acumen, and more), so growth is tracked by skill, not just by hours spent. On top of that sit gamified events and email automations that keep participation alive between sessions. I also sit on Applaudo's Design Senior Council, one of seven seats. In my own mentoring practice, every review produces two outputs: internal notes with probing questions for myself, and student-ready feedback with concrete strengths and next steps.",
      ],
      ['h3', 'Result'],
      [
        'p',
        'The program moved from an informal Notion log in 2023 to a measured system with quarterly goals, set up in January 2024. It tracks 51 designers across 11 countries, with 32 who attended at least one logged session. Program-wide, 247 attended sessions have been logged, from January 2024 to February 2026. Global attendance held at 82 to 95% every measured quarter from 2024 to Q1 2025, above the 80% goal. The program also ran 10 group events, each drawing 11 to 21 designers.',
      ],
      ['h3', 'Beyond Applaudo'],
      [
        'p',
        "Across my career overall, separate from this program, I've mentored 200+ designers at Applaudo, DesignLab, CareerFoundry, ADPList, and others.",
      ],
      ['h3', 'The rule'],
      ['p', '"Diagnosis before prescription, same as client work. Mentoring is not softer, it\'s more developmental."'],
      ['em', "Growth isn't something that happens to a team. It's something you have to design for."],
    ],
    short: [
      [
        'li',
        "Problem: The design team's growth was hard to see and had no structure behind it, limiting its impact on clients and on Applaudo's own goals.",
      ],
      [
        'li',
        'What I did: Co-created and help lead a measured mentoring program: 1:1 coaching, consultations, scouted invites, team workshops, all tagged to a competencies library with quarterly goals.',
      ],
      [
        'li',
        'Result: 51 designers across 11 countries, 247 attended sessions logged (Jan 2024 to Feb 2026), attendance of 82 to 95% every measured quarter above the 80% goal, and 10 group events with 11 to 21 designers each.',
      ],
      ['li', "Career-wide: I've mentored 200+ designers across Applaudo, DesignLab, CareerFoundry, ADPList, and others."],
      ['em', "Mentoring is not softer, it's more developmental."],
    ],
  },
  finoa: {
    id: 'finoa',
    key: 'Finoa',
    headline: 'A custody platform institutions can trust at a glance',
    shortHeadline: 'A custody platform institutions can trust',
    full: [
      ['h3', 'Problem'],
      [
        'p',
        "Finoa is a regulated custodian for digital assets, built for institutional investors and corporations. The platform worked, but it didn't yet let users do everything they needed, and it had to clear the bar large institutions hold any platform to: performance, reliability, security. Time was short.",
      ],
      ['h3', 'What I did'],
      [
        'p',
        "As UX Designer at LoremLabs, I joined a small cross-functional team, a Design Director, Finoa's product manager, and two UI designers, for an eight-week co-creation. I led the research side: customer interviews, friction points, user stories, story mapping, a feature focus map, and the information architecture. From there, flows and wireframes for the core screens.",
      ],
      ['h3', 'Result'],
      [
        'p',
        'The main platform was redesigned and modernized, and we prototyped the mobile version, with a plan to iterate, test, and scale from there. What the redesign enabled:',
      ],
      [
        'li',
        "Institutional users can read how their portfolio moves over time, the way they'd track any traded asset.",
      ],
      ['li', 'Anything pending or processing is surfaced in one notification system instead of scattered across the product.'],
      ['li', 'User permissions and management are easier to reach.'],
      ['li', 'A mobile prototype covers the core screens beyond desktop.'],
      ['p', 'This was qualitative design work; no outcome metric was measured.'],
      ['em', "Institutions don't need more features. They need to trust what they're looking at."],
    ],
    short: [
      [
        'li',
        "Problem: Finoa's platform worked, but institutional users needed more than it allowed, under a high bar for security and reliability.",
      ],
      [
        'li',
        'What I did: As UX Designer at LoremLabs, led research and IA in an eight-week co-creation: interviews, user stories, flows, wireframes.',
      ],
      [
        'li',
        'Result: Clearer portfolio tracking, one place for pending actions, simpler permissions, plus a mobile prototype. Qualitative work; no metrics measured.',
      ],
      ['em', "Institutions don't need more features. They need to trust what they're looking at."],
    ],
  },
};

const LANDMARKS = {
  sambil: ['Sambil', 'Sambil, Barquisimeto. A mall shaped like a cuatro, our little guitar.'],
  catedral: ['Catedral', "Barquisimeto's Cathedral. My city has a thing for bold shapes."],
  flor: ['Flor de Venezuela', "Flor de Venezuela. A piece of Barquisimeto, where I'm from."],
};

async function readPanel(page) {
  return qa(page, () => {
    const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const sheet = document.querySelector('.building-panel__sheet');
    const title = document.querySelector('.building-panel__title');
    const article = document.querySelector('.case');
    const lines = [...(article?.querySelectorAll('h3, p.case__text, li, .case__closing em') ?? [])]
      .filter(shown)
      .map((el) => [el.tagName.toLowerCase(), el.textContent.replace(/\s+/g, ' ').trim()]);
    return {
      title: title?.textContent ?? '',
      lines,
      articleText: article?.innerText ?? '',
      bodyText: document.body.innerText,
      hash: location.hash,
      key: document.querySelector('.building-panel')?.dataset.panelKey ?? '',
      placeholders: [...document.querySelectorAll('[data-placeholder]')].filter(shown).length,
      closingStyle: (() => {
        const em = [...(article?.querySelectorAll('.case__closing em') ?? [])].find(shown);
        return em ? getComputedStyle(em).fontStyle : '';
      })(),
    };
  });
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
  const spec = RUN55_KINDS[kind];
  const browser = await launchBrowser(spec.type);
  const ctx = await browser.newContext(spec.options);
  const page = await ctx.newPage();
  const voiceHits = [];
  const onVoice = (req) => {
    if (/\/audio\/voice\//.test(req.url())) voiceHits.push(req.url());
  };
  try {
    page.on('request', onVoice);
    await page.goto(base, { waitUntil: 'networkidle' });
    await wait(500);

    for (const specCase of Object.values(CASES)) {
      const tag = `run55-${kind}-${specCase.id}`;
      await qa(page, (id) => window.__playtestQa.enterInterior(id), specCase.id);
      await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
      await wait(400);
      if (spec.phone) {
        await page.locator('.building-panel__title').tap();
        await wait(400);
      }
      const m = await readPanel(page);
      const wantTitle = spec.phone ? (specCase.shortHeadline ?? specCase.headline) : specCase.headline;
      if (m.title !== wantTitle) errors.push(`${tag}: title is "${m.title}", want "${wantTitle}"`);
      if (m.key !== specCase.key) errors.push(`${tag}: panel key is "${m.key}", want "${specCase.key}"`);
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
      compare(tag, m.lines, spec.phone ? specCase.short : specCase.full, errors);
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
      await page.waitForFunction(() => window.__playtestQa.isBuildingPanelOpen(), null, { timeout: 15000 });
      await wait(300);
      if (spec.phone) {
        await page.locator('.building-panel__title').tap();
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
