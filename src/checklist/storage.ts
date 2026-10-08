export type ChecklistStepId =
  | 'walk-around'
  | 'walk-keys'
  | 'move-camera'
  | 'zoom'
  | 'enter-building';

export type ChecklistState = {
  completed: Record<ChecklistStepId, boolean>;
  skipped: boolean;
  /** Desktop: collapsed to progress ring only (top-left) */
  collapsed: boolean;
  /** Mobile: full list expanded from bottom ring */
  mobileExpanded: boolean;
};

const STORAGE_KEY = 'playtest-checklist-v3';

const ALL_STEP_IDS: ChecklistStepId[] = [
  'walk-around',
  'walk-keys',
  'move-camera',
  'zoom',
  'enter-building',
];

const defaultState = (): ChecklistState => ({
  completed: {
    'walk-around': false,
    'walk-keys': false,
    'move-camera': false,
    zoom: false,
    'enter-building': false,
  },
  skipped: false,
  collapsed: false,
  mobileExpanded: false,
});

export function isTouchPrimary(): boolean {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

export function stepsForPlatform(touch = isTouchPrimary()): ChecklistStepId[] {
  if (touch) {
    return ['walk-around', 'move-camera', 'zoom', 'enter-building'];
  }
  return ['walk-around', 'walk-keys', 'move-camera', 'zoom', 'enter-building'];
}

export function totalStepsForPlatform(touch = isTouchPrimary()): number {
  return stepsForPlatform(touch).length;
}

export function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ChecklistState;
    return {
      ...defaultState(),
      ...parsed,
      completed: { ...defaultState().completed, ...parsed.completed },
    };
  } catch {
    return defaultState();
  }
}

export function saveChecklist(state: ChecklistState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function countCompleted(state: ChecklistState, touch = isTouchPrimary()): number {
  return stepsForPlatform(touch).filter((id) => state.completed[id]).length;
}

export function markAllComplete(state: ChecklistState): void {
  for (const id of ALL_STEP_IDS) {
    state.completed[id] = true;
  }
}
