#!/usr/bin/env node
/**
 * Regression: a two-finger gesture must not schedule an interior walk tap.
 * Exercises the same guards as scene.tryScheduleDeferredTap (structural test).
 */
import assert from 'node:assert/strict';

function shouldScheduleInteriorTap(state) {
  if (state.hadMultiPointerGesture) return false;
  if (state.secondFingerArrived) return false;
  if (state.pointersSize >= 2) return false;
  if (state.panMoved) return false;
  return true;
}

assert.equal(
  shouldScheduleInteriorTap({
    hadMultiPointerGesture: true,
    secondFingerArrived: false,
    pointersSize: 1,
    panMoved: false,
  }),
  false,
);

assert.equal(
  shouldScheduleInteriorTap({
    hadMultiPointerGesture: false,
    secondFingerArrived: true,
    pointersSize: 2,
    panMoved: false,
  }),
  false,
);

assert.equal(
  shouldScheduleInteriorTap({
    hadMultiPointerGesture: false,
    secondFingerArrived: false,
    pointersSize: 1,
    panMoved: false,
  }),
  true,
);

console.log('test-interior-two-finger: ok');
