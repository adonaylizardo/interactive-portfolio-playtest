/** Shared CI toggles for Playwright gate scripts (set in .github/workflows/gate.yml). */
export const QA_CI = process.env.QA_CI === '1' || process.env.GITHUB_ACTIONS === 'true';
export const QA_CHROMIUM_ONLY = process.env.QA_CHROMIUM_ONLY === '1' || QA_CI;

export const QA_REDUCE_DPR = process.env.QA_REDUCE_DPR === '1';

/** Lower DPR on phone smoke contexts in CI so software GL keeps exits inside timing budgets. */
export function ciContextOptions(options = {}) {
  if (!QA_REDUCE_DPR) return options;
  const o = { ...options };
  if (typeof o.deviceScaleFactor === 'number' && o.deviceScaleFactor > 1) {
    o.deviceScaleFactor = 1;
  }
  return o;
}

function isWebkitKind(entry) {
  if (typeof entry === 'string') return entry.includes('webkit');
  if (Array.isArray(entry) && typeof entry[0] === 'string') return entry[0].includes('webkit');
  const name = entry?.tag ?? entry?.kind ?? '';
  return String(name).includes('webkit');
}

export function chromiumOnlyKinds(kinds) {
  return QA_CHROMIUM_ONLY ? kinds.filter((k) => !isWebkitKind(k)) : kinds;
}
