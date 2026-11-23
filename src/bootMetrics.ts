/** Performance marks for load QA (`measure-load.mjs`, batch r44). */
export function markMapFirstFrame(): void {
  try {
    if (!performance.getEntriesByName('playtest-map-first-frame').length) {
      performance.mark('playtest-map-first-frame');
    }
  } catch {
    /* perf unavailable */
  }
}

export function markMapVisible(): void {
  try {
    if (!performance.getEntriesByName('playtest-map-visible').length) {
      performance.mark('playtest-map-visible');
    }
  } catch {
    /* perf unavailable */
  }
}

export function markTti(): void {
  try {
    if (!performance.getEntriesByName('playtest-tti').length) {
      performance.mark('playtest-tti');
    }
  } catch {
    /* perf unavailable */
  }
}
