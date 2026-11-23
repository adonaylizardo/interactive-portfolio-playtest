/** Pure helpers for the phone About sheet drag-to-expand/collapse (unit-tested). */

export type MobileSheetDragInput = {
  expanded: boolean;
  startY: number;
  endY: number;
  /** When true, only the grab handle may collapse an expanded sheet. */
  grabOnlyCollapse: boolean;
  fromGrab: boolean;
};

/**
 * Returns the expanded state after a vertical drag ends.
 * `null` means no change (ignored gesture).
 */
export function mobileSheetExpandedAfterDrag(input: MobileSheetDragInput): boolean | null {
  const delta = input.endY - input.startY;
  if (input.expanded) {
    if (delta > 48) {
      if (input.grabOnlyCollapse && !input.fromGrab) return null;
      return false;
    }
    if (input.startY - input.endY > 36) return true;
    return null;
  }
  if (input.startY - input.endY > 48) return true;
  return null;
}

/** No auto-collapse timer on the mobile About sheet (regression guard). */
export const MOBILE_SHEET_AUTO_COLLAPSE_AFTER_MS: number | null = null;

/** Sheets must not auto-collapse on a timer; idle helpers always keep expanded state. */
export function mobileSheetExpandedAfterIdleMs(expanded: boolean, idleMs: number): boolean {
  return mobileSheetExpandedAfterScheduledIdle(expanded, idleMs);
}

export function mobileSheetExpandedAfterScheduledIdle(
  expanded: boolean,
  elapsedMs: number,
  autoCollapseMs: number | null = MOBILE_SHEET_AUTO_COLLAPSE_AFTER_MS,
): boolean {
  if (!expanded || autoCollapseMs == null) return expanded;
  return elapsedMs < autoCollapseMs;
}
