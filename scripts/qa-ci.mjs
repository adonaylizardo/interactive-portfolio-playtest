/** Shared CI toggles for Playwright gate scripts (set in .github/workflows/gate.yml). */
export const QA_CI = process.env.QA_CI === '1' || process.env.GITHUB_ACTIONS === 'true';
export const QA_CHROMIUM_ONLY = process.env.QA_CHROMIUM_ONLY === '1' || QA_CI;

/** Lower DPR on phone contexts in CI so software GL keeps exits inside timing budgets. */
export function ciContextOptions(options = {}) {
  if (!QA_CI) return options;
  const o = { ...options };
  if (typeof o.deviceScaleFactor === 'number' && o.deviceScaleFactor > 1) {
    o.deviceScaleFactor = 1;
  }
  return o;
}

export function chromiumOnlyKinds(kinds) {
  return QA_CHROMIUM_ONLY ? kinds.filter((k) => !String(k).includes('webkit')) : kinds;
}
