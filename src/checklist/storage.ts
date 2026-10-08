export type ChecklistStepId =
  | 'walk-around'
  | 'walk-keys'
  | 'move-camera'
  | 'zoom'
  | 'enter-building';

export type ChecklistState = {
  completed: Record<ChecklistStepId, boolean>;
  skipped: boolean;
  collapsed: boolean;
};

const STORAGE_KEY = 'playtest-checklist-v1';

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
});

export function loadChecklist(): ChecklistState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as ChecklistState;
    return { ...defaultState(), ...parsed, completed: { ...defaultState().completed, ...parsed.completed } };
  } catch {
    return defaultState();
  }
}

export function saveChecklist(state: ChecklistState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function countCompleted(state: ChecklistState): number {
  return (Object.values(state.completed) as boolean[]).filter(Boolean).length;
}

export const TOTAL_STEPS = 5;
