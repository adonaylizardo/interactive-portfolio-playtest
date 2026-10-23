export type ChecklistStepId =
  | 'walk-around'
  | 'walk-keys'
  | 'move-camera'
  | 'zoom'
  | 'enter-building';

export type ChecklistState = {
  completed: Record<ChecklistStepId, boolean>;
  skipped: boolean;
  dismissed: boolean;
  collapsed: boolean;
  mobileExpanded: boolean;
};

const STORAGE_KEY = 'playtest-checklist-v3';

const defaultState = (): ChecklistState => ({
  completed: {
    'walk-around': false,
    'walk-keys': false,
    'move-camera': false,
    zoom: false,
    'enter-building': false,
  },
  skipped: false,
  dismissed: false,
  collapsed: false,
  mobileExpanded: false,
});

export function isTouchPrimary(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function isMobileOrCoarsePointer(): boolean {
  return (
    isTouchPrimary() ||
    matchMedia('(max-width: 767px)').matches ||
    matchMedia('(max-height: 500px)').matches
  );
}

export function stepsForPlatform(compact = isMobileOrCoarsePointer()): ChecklistStepId[] {
  const steps: ChecklistStepId[] = ['walk-around', 'walk-keys', 'move-camera', 'zoom', 'enter-building'];
  if (compact || isTouchPrimary()) return steps.filter((id) => id !== 'walk-keys');
  return steps;
}

export function totalStepsForPlatform(compact = isMobileOrCoarsePointer()): number {
  return stepsForPlatform(compact).length;
}

export function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ChecklistState;
    const merged: ChecklistState = {
      ...defaultState(),
      ...parsed,
      completed: { ...defaultState().completed, ...parsed.completed },
    };
    if (merged.dismissed) {
      merged.dismissed = false;
      merged.collapsed = true;
    }
    return merged;
  } catch {
    return defaultState();
  }
}

export function saveChecklist(state: ChecklistState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Fresh session after welcome “Start” — no steps credited from a prior visit. */
export function resetChecklistForSession(): ChecklistState {
  const state = defaultState();
  saveChecklist(state);
  return state;
}

export function countCompleted(state: ChecklistState, compact = isMobileOrCoarsePointer()): number {
  return stepsForPlatform(compact).filter((id) => state.completed[id]).length;
}

/** Fully hidden (user closed after finish or explicit dismiss). Skip keeps the ring. */
export function isChecklistHidden(state: ChecklistState): boolean {
  return state.dismissed;
}
