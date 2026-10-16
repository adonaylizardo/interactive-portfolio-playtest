/**
 * Panel copy, keyed by building id. English text is verbatim from
 * `content/cases/{id}-panel.md` (Desktop/full on desktop, Mobile/short in the phone sheet).
 * The airline case never names the client — ignore that file's Español section. Landmark rooms
 * keep the place name as the title and a short placeholder. Internal draft sections are not stored here.
 */
export type CaseBlock =
  | { kind: 'section'; heading?: string; paragraphs: string[]; bullets?: string[] }
  | { kind: 'closing'; text: string };

export type CaseContent = {
  headline: string;
  /** Phone peek / short-version title when it differs from the desktop headline. */
  shortHeadline?: string;
  /** One-line role under the case name on the Pixel preview card. */
  subtitle: string;
  /**
   * Basename under `audio/voice/` (no extension). `null` = this slot has no file;
   * callers must not request `audio/voice/*.mp3`.
   */
  voice: string | null;
  /** Desktop (>= 768 px): the full text. */
  full: CaseBlock[];
  /** Phone (< 768 px): the short version. */
  short: CaseBlock[];
};

/** `null` when the room has no case, or the case has no recorded voice file. */
export function caseVoiceFile(id: string | null | undefined): string | null {
  if (!id) return null;
  return CASES[id]?.voice ?? null;
}

/** The five case houses stay on the map and use the preview-then-expand sheet. */
export const CASE_HOUSE_IDS = ['volaris', 'bain', 'mentoria', 'finoa', 'pg'] as const;
export type CaseHouseId = (typeof CASE_HOUSE_IDS)[number];

export function isCaseHouse(id: string | null | undefined): id is CaseHouseId {
  return !!id && (CASE_HOUSE_IDS as readonly string[]).includes(id);
}

/** Public card title. The airline case never names the client. */
export const CASE_CARD_TITLES: Record<CaseHouseId, string> = {
  volaris: 'Airline',
  bain: 'Bain',
  mentoria: 'Mentoría',
  finoa: 'Finoa',
  pg: 'P&G',
};

function sectionHeadings(blocks: CaseBlock[]): string[] {
  return blocks.flatMap((block) => (block.kind === 'section' && block.heading ? [block.heading] : []));
}

function endSentence(text: string): string {
  return /[.!?…]$/.test(text.trim()) ? text : `${text}.`;
}

export type CasePreviewCopy = {
  title: string;
  subtitle: string;
  teaser: string;
  teaserFull: string;
  kicker: string;
  placeholder: string;
  pillMeta: string;
};

/** Door-step card: CASE label, name, one-line role, headline teaser. */
export function casePreviewCopy(id: string): CasePreviewCopy | null {
  if (!isCaseHouse(id)) return null;
  const content = CASES[id];
  if (!content) return null;
  const title = CASE_CARD_TITLES[id];
  const headings = sectionHeadings(content.full).slice(0, 3);
  return {
    title,
    subtitle: content.subtitle,
    teaser: endSentence(content.shortHeadline ?? content.headline),
    teaserFull: content.headline,
    kicker: `CASE · ${title.toUpperCase()}`,
    placeholder: `${title.toUpperCase()} · IMAGE PLACEHOLDER`,
    pillMeta: headings.length ? headings.join(' · ') : 'Problem · What I did · Result',
  };
}

const AIRLINE_PROBLEM =
  "On a Latin American airline's booking app (Android and iOS), Figma, specs, and code each told a different story about the same component in a booking flow. Several design systems overlapped, so nobody could tell which one was the source of truth. Every gap got reinterpreted downstream, and reworked.";
const AIRLINE_DID =
  'As Product Strategist (Q4 2026), I was the sole approver: I cleaned up the Figma file, verified it against the existing booking flow implementation, and turned each component into an explicit sealed contract between design and code. AI agents helped draft and audit; I reviewed and sealed every one myself.';
const AIRLINE_DELIVERED =
  'No code was delivered. The deliverables: sealed contracts, markdown verification reports, and a Figma handoff.';
const AIRLINE_RESULT =
  '10 sealed contracts shipped to engineering on Oct 1, 2026. Full flow: before, 1 to 2 days to about 2 hours, on both Android and iOS. Engineering has already implemented it: what used to take a couple of weeks took just days with the contracts. Leadership gave it the green light as a standard process for projects facing similar problems.';
const AIRLINE_RULE = 'Design and code never sync directly. Both pass through the sealed contract first.';
const AIRLINE_CLOSING = "The goal wasn't zero defects. It was zero guessing.";

function landmarkPlaceholder(name: string, voice: string | null = null): CaseContent {
  const paragraphs = [`${name} — a landmark of the map. More coming soon.`];
  return {
    headline: name,
    subtitle: name,
    voice,
    full: [{ kind: 'section', paragraphs }],
    short: [{ kind: 'section', paragraphs }],
  };
}

export const CASES: Record<string, CaseContent> = {
  volaris: {
    headline: "A contract engineering couldn't misread",
    subtitle: 'Product strategist and sole approver',
    voice: '02-volaris',
    full: [
      { kind: 'section', heading: 'Problem', paragraphs: [AIRLINE_PROBLEM] },
      { kind: 'section', heading: 'What I did', paragraphs: [`${AIRLINE_DID} ${AIRLINE_DELIVERED}`] },
      { kind: 'section', heading: 'Result', paragraphs: [AIRLINE_RESULT] },
      {
        kind: 'section',
        heading: 'Then I scaled it',
        paragraphs: ['With that green light, I built a methodology to scale it to the rest of the team:'],
        bullets: [
          'Skills to speed up the process (before, 1 to 2 days to about 2 hours, on both Android and iOS)',
          'A course list for accelerated training',
          'Shadowing and workshops with key people on the project',
          'Alignment with leadership and the client for proper adoption',
        ],
      },
      { kind: 'section', heading: 'The rule', paragraphs: [AIRLINE_RULE] },
      { kind: 'closing', text: AIRLINE_CLOSING },
    ],
    short: [
      { kind: 'section', heading: 'Problem', paragraphs: [AIRLINE_PROBLEM] },
      { kind: 'section', heading: 'What I did', paragraphs: [AIRLINE_DID] },
      { kind: 'section', heading: 'Result', paragraphs: [AIRLINE_RESULT] },
      {
        kind: 'section',
        heading: 'Then I scaled it',
        paragraphs: [
          'Skills to speed up the process, a course list, shadowing and workshops, and alignment with leadership and the client.',
        ],
      },
      { kind: 'section', heading: 'The rule', paragraphs: [AIRLINE_RULE] },
      { kind: 'closing', text: AIRLINE_CLOSING },
    ],
  },
  bain: {
    headline: 'Leading 9 designers across Bain, while still shipping the work',
    shortHeadline: 'Leading 9 designers across Bain',
    subtitle: 'Squad lead, mentor, and hands-on designer',
    voice: '03-bain',
    full: [
      {
        kind: 'section',
        heading: 'Problem',
        paragraphs: [
          "Applaudo's designers were spread across several Bain products, each embedded in its own team. Without a shared space, overlaps and misalignments between products stayed invisible across the portfolio.",
        ],
      },
      {
        kind: 'section',
        heading: 'What I did',
        paragraphs: [
          'I was squad lead and mentor for 9 Applaudo designers distributed across several Bain accounts. I ran a weekly team ceremony to connect them, built around three blocks: a Visual Status review where designers look at work in progress side by side (to build horizontal visibility across the portfolio and surface overlaps, not to critique), a shared Experiment Tracker for portfolio initiatives, and a Red Flags block to raise risks early.',
        ],
      },
      {
        kind: 'section',
        heading: 'Result',
        paragraphs: [
          "The Bain team's CSAT rating of the Applaudo designers who worked with them rose from about 8.5 to 9.5 across 2025 to 2026, reaching 10 in some quarters.",
        ],
      },
      {
        kind: 'section',
        heading: 'Hands-on work',
        paragraphs: [],
        bullets: [
          "**Signal (Product Designer):** I built a new design process, with documentation and testing, behind several shipped features. The biggest was a Gantt view, Signal's largest release to date. I also ran a team feedback workshop on Gantt enhancements, and Signal's product team adopted the remote video collaboration method I introduced.",
          '**Case Wrap MVP** (around June to August 2026, Senior Product Designer / Product Strategist): I reframed case wrap-up as review-and-approve instead of one-click acceptance: AI drafts, humans decide, no "approve all." Three coded directions in Bain\'s design system turned the choice into a team decision. The deliverable was a validated MVP direction. I did not win a concept; I made the trade-off cheap to see.',
          '**NPS Prism, Instrument Management** (around April to June 2026, sole designer): what the admin called "instruments" were really presets, with real ownership and refresh data scattered in spreadsheets outside the platform. I designed a two-entity model with an in-platform refresh calendar and notifications. Product and engineering approved it for build.',
          '**PEG:** Product Designer on the account.',
          "**PAS:** product design on Bain's live Partner Assessment System.",
        ],
      },
      {
        kind: 'closing',
        text: "Leading the portfolio didn't mean stepping back from the work: I kept shipping product while helping nine other designers do the same.",
      },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problem:** Bain designers were scattered across teams with no shared space, so overlaps and misalignment stayed invisible.',
          '**What I did:** Squad lead and mentor for 9 designers; ran a weekly ceremony (Visual Status, Experiment Tracker, Red Flags).',
          '**Result:** Bain\'s CSAT rating of the designers rose from about 8.5 to 9.5 across 2025 to 2026, reaching 10 in some quarters.',
          "**Hands-on:** Signal's Gantt view, its largest release; Case Wrap moved to review-and-approve with AI drafts; NPS Prism moved ownership data off spreadsheets and into the product.",
        ],
      },
      {
        kind: 'closing',
        text: "Leading didn't mean stepping back: I kept shipping while nine designers got clarity across the portfolio.",
      },
    ],
  },
  pg: {
    headline: 'An app panelists actually want to open',
    subtitle: 'UX/UI designer, panelist health app',
    voice: '06-pg',
    full: [
      {
        kind: 'section',
        heading: 'Problem',
        paragraphs: [
          "P&G Latam's innovation team needed a mobile app for its panelists, one that could track the menstrual cycle, collect surveys, and run product tests, while meeting P&G's own standards for performance, reliability, and security around sensitive personal health data. The timeline was tight.",
        ],
      },
      {
        kind: 'section',
        heading: 'What I did',
        paragraphs: [
          'As UX/UI Designer at Talpor, I worked in a small cross-functional team (a PM, a science team, and a UI & motion designer), and together we co-created the app in about 8 weeks. The first 2 to 3 weeks were strategy: 4 user profiles, a competitive benchmark, feature focus maps, user flows, and wireframes. Interviews, heuristic tests, and design thinking sessions showed navigation needed to differ across profiles, which shaped a quick-access logging pattern around the calendar, the cycle wheel, and a single add button. From there we built the design system and UI, covering symptom tracking, gamification, a news feed, and "Diary," a survey and product-testing system tied into gamification.',
        ],
      },
      {
        kind: 'section',
        heading: 'Result',
        paragraphs: [
          'The app launched with real users in three languages (Portuguese, Spanish, English), reaching panelists mainly in Brazil, Mexico, and the US. It beat the agreed time and quality standards and opened the door to follow-up work with P&G.',
        ],
      },
      { kind: 'closing', text: 'Good research finds the shortest path to logging before design ever touches a screen.' },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          '**Problem:** P&G needed panelists to log their cycle, answer surveys, and test products in one app built to handle sensitive health data securely.',
          '**What I did:** As UX/UI Designer at Talpor, I worked over about 8 weeks, from research and user flows to a full design system and a gamified "Diary" feature.',
          '**Result:** Launched in 3 languages for panelists in Brazil, Mexico, and the US, beating the agreed time and quality bar.',
          '**Extra:** The logging flow (calendar, cycle wheel, add button) was shaped directly by interviews and heuristic testing across user profiles.',
        ],
      },
      { kind: 'closing', text: 'Good research finds the shortest path to logging before design touches a screen.' },
    ],
  },
  mentoria: {
    headline: 'Mentoring with the same rigor as client work',
    shortHeadline: 'Mentoring as a system',
    subtitle: 'Mentoring lead and Design Senior Council',
    voice: '04-mentoring',
    full: [
      {
        kind: 'section',
        heading: 'Problem',
        paragraphs: [
          "Growth inside the design team was hard to see, and there was no structured way to support it. The team needed both: visibility into how designers were developing, and a system to make that growth deliberate, so it could translate into real impact on client accounts and on Applaudo's own goals.",
        ],
      },
      {
        kind: 'section',
        heading: 'What I did',
        paragraphs: [
          "I co-created and help lead Applaudo's design mentoring program, run as a product: with releases, a measurement framework, and quarterly goals, not as an informal perk. It has four session formats: allocated 1:1 coaching, booked consultations on demand, scouted invitations, and group team sessions and workshops. Every session is tagged to a shared competencies library (critical thinking, strategic thinking, information architecture, business acumen, and more), so growth is tracked by skill, not just by hours spent. On top of that sit gamified events and email automations that keep participation alive between sessions. I also sit on Applaudo's Design Senior Council, one of seven seats. In my own mentoring practice, every review produces two outputs: internal notes with probing questions for myself, and student-ready feedback with concrete strengths and next steps.",
        ],
      },
      {
        kind: 'section',
        heading: 'Result',
        paragraphs: [
          'The program moved from an informal Notion log in 2023 to a measured system with quarterly goals, set up in January 2024. It tracks **51 designers** across **11 countries**, with **32** who attended at least one logged session. Program-wide, **247 attended sessions** have been logged, from January 2024 to February 2026. Global attendance held at **82 to 95%** every measured quarter from 2024 to Q1 2025, above the 80% goal. The program also ran **10 group events**, each drawing **11 to 21 designers**.',
        ],
      },
      {
        kind: 'section',
        heading: 'Beyond Applaudo',
        paragraphs: [
          "Across my career overall, separate from this program, I've mentored 200+ designers at Applaudo, DesignLab, CareerFoundry, ADPList, and others.",
        ],
      },
      {
        kind: 'section',
        heading: 'The rule',
        paragraphs: [
          '"Diagnosis before prescription, same as client work. Mentoring is not softer, it\'s more developmental."',
        ],
      },
      { kind: 'closing', text: "Growth isn't something that happens to a team. It's something you have to design for." },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          "**Problem:** The design team's growth was hard to see and had no structure behind it, limiting its impact on clients and on Applaudo's own goals.",
          '**What I did:** Co-created and help lead a measured mentoring program: 1:1 coaching, consultations, scouted invites, team workshops, all tagged to a competencies library with quarterly goals.',
          '**Result:** 51 designers across 11 countries, 247 attended sessions logged (Jan 2024 to Feb 2026), attendance of 82 to 95% every measured quarter above the 80% goal, and 10 group events with 11 to 21 designers each.',
          "**Career-wide:** I've mentored 200+ designers across Applaudo, DesignLab, CareerFoundry, ADPList, and others.",
        ],
      },
      { kind: 'closing', text: "Mentoring is not softer, it's more developmental." },
    ],
  },
  finoa: {
    headline: 'A custody platform institutions can trust at a glance',
    shortHeadline: 'A custody platform institutions can trust',
    subtitle: 'UX designer, institutional custody platform',
    voice: '05-finoa',
    full: [
      {
        kind: 'section',
        heading: 'Problem',
        paragraphs: [
          "Finoa is a regulated custodian for digital assets, built for institutional investors and corporations. The platform worked, but it didn't yet let users do everything they needed, and it had to clear the bar large institutions hold any platform to: performance, reliability, security. Time was short.",
        ],
      },
      {
        kind: 'section',
        heading: 'What I did',
        paragraphs: [
          "As UX Designer at LoremLabs, I joined a small cross-functional team, a Design Director, Finoa's product manager, and two UI designers, for an eight-week co-creation. I led the research side: customer interviews, friction points, user stories, story mapping, a feature focus map, and the information architecture. From there, flows and wireframes for the core screens.",
        ],
      },
      {
        kind: 'section',
        heading: 'Result',
        paragraphs: [
          'The main platform was redesigned and modernized, and we prototyped the mobile version, with a plan to iterate, test, and scale from there. What the redesign enabled:',
        ],
        bullets: [
          "Institutional users can read how their portfolio moves over time, the way they'd track any traded asset.",
          'Anything pending or processing is surfaced in one notification system instead of scattered across the product.',
          'User permissions and management are easier to reach.',
          'A mobile prototype covers the core screens beyond desktop.',
        ],
      },
      { kind: 'section', paragraphs: ['This was qualitative design work; no outcome metric was measured.'] },
      { kind: 'closing', text: "Institutions don't need more features. They need to trust what they're looking at." },
    ],
    short: [
      {
        kind: 'section',
        paragraphs: [],
        bullets: [
          "**Problem:** Finoa's platform worked, but institutional users needed more than it allowed, under a high bar for security and reliability.",
          '**What I did:** As UX Designer at LoremLabs, led research and IA in an eight-week co-creation: interviews, user stories, flows, wireframes.',
          '**Result:** Clearer portfolio tracking, one place for pending actions, simpler permissions, plus a mobile prototype. Qualitative work; no metrics measured.',
        ],
      },
      { kind: 'closing', text: "Institutions don't need more features. They need to trust what they're looking at." },
    ],
  },
  sambil: landmarkPlaceholder('Sambil', '10-sambil'),
  catedral: landmarkPlaceholder('Catedral', '09-cathedral'),
  flor: landmarkPlaceholder('Flor de Venezuela', '08-flor-de-venezuela'),
};
