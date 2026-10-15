/**
 * Panel copy, keyed by building id. Case-study rooms show the headline as their title and never
 * name the client. Landmark rooms keep the place name as the title and use a short placeholder.
 */
export type CaseBlock =
  | { kind: 'section'; heading?: string; paragraphs: string[]; bullets?: string[] }
  | { kind: 'closing'; text: string };

export type CaseContent = {
  headline: string;
  /** Desktop (>= 768 px): the full text. */
  full: CaseBlock[];
  /** Phone (< 768 px): the short version. */
  short: CaseBlock[];
};

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

function landmarkPlaceholder(name: string): CaseContent {
  const paragraphs = [`${name} is a landmark of the map. More coming soon.`];
  return {
    headline: name,
    full: [{ kind: 'section', paragraphs }],
    short: [{ kind: 'section', paragraphs }],
  };
}

export const CASES: Record<string, CaseContent> = {
  volaris: {
    headline: "A contract engineering couldn't misread",
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
  sambil: landmarkPlaceholder('Sambil'),
  catedral: landmarkPlaceholder('Catedral'),
  flor: landmarkPlaceholder('Flor de Venezuela'),
};
