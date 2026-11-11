#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  MOBILE_SHEET_AUTO_COLLAPSE_AFTER_MS,
  mobileSheetExpandedAfterDrag,
  mobileSheetExpandedAfterIdleMs,
  mobileSheetExpandedAfterScheduledIdle,
} from '../src/ui/mobileIntroSheet.ts';

assert.equal(
  mobileSheetExpandedAfterDrag({
    expanded: true,
    startY: 100,
    endY: 200,
    grabOnlyCollapse: true,
    fromGrab: false,
  }),
  null,
  'scroll on sheet body must not collapse without grab',
);

assert.equal(
  mobileSheetExpandedAfterDrag({
    expanded: true,
    startY: 100,
    endY: 200,
    grabOnlyCollapse: true,
    fromGrab: true,
  }),
  false,
  'grab handle may collapse',
);

assert.equal(MOBILE_SHEET_AUTO_COLLAPSE_AFTER_MS, null);

let expanded = true;
for (let fakeMs = 0; fakeMs <= 30_000; fakeMs += 1_000) {
  expanded = mobileSheetExpandedAfterIdleMs(expanded, fakeMs);
  expanded = mobileSheetExpandedAfterScheduledIdle(expanded, fakeMs);
}
assert.equal(expanded, true, 'sheet stays expanded after 30s simulated idle');

console.log('test-mobile-sheet-idle: ok');
