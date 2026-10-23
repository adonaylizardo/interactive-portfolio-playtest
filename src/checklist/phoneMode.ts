import { isChecklistHidden, type ChecklistState } from './storage';

export type PhoneChecklistMode = 'pill' | 'circle' | 'open';

export type PhoneChromeSnapshot = {
  mobile: boolean;
  hidden: boolean;
  mobileExpanded: boolean;
  introExpanded: boolean;
};

const POSITION_PROPS = [
  'top',
  'bottom',
  'left',
  'right',
  'width',
  'max-height',
  'height',
  'overflow',
  'overflow-y',
  'position',
] as const;

let cachedChecklistAnchorBottom: number | null = null;

/** Call while the closed pill/circle is still in the top bar, before reparenting open. */
function phoneTopBarControlsBottom(): number {
  const tools = document.querySelector('.chrome__tools-phone') as HTMLElement | null;
  const checklist = document.querySelector(
    '.chrome__phone-topbar-checklist .checklist',
  ) as HTMLElement | null;
  let bottom = 0;
  if (tools) bottom = Math.max(bottom, tools.getBoundingClientRect().bottom);
  if (checklist && checklist.getBoundingClientRect().height > 4) {
    bottom = Math.max(bottom, checklist.getBoundingClientRect().bottom);
  }
  return bottom;
}

export function cachePhoneChecklistAnchorBeforeOpen(): void {
  const bottom = phoneTopBarControlsBottom();
  cachedChecklistAnchorBottom = bottom > 32 && bottom < 160 ? bottom : null;
}

export function clearPhoneChecklistAnchorCache(): void {
  cachedChecklistAnchorBottom = null;
}

export function phoneOpenCardAnchorBottom(): number {
  const inset = 16;
  const maxControlBottom = 160;
  if (
    cachedChecklistAnchorBottom != null &&
    cachedChecklistAnchorBottom > inset + 20 &&
    cachedChecklistAnchorBottom < maxControlBottom
  ) {
    return cachedChecklistAnchorBottom;
  }
  const bottom = phoneTopBarControlsBottom();
  if (bottom > inset + 20 && bottom < maxControlBottom) return bottom;
  return inset + 52;
}

export function clearPhoneChecklistInline(root: HTMLElement): void {
  root.classList.remove('checklist--anchored');
  for (const prop of POSITION_PROPS) {
    root.style.removeProperty(prop);
  }
}

export function derivePhoneChecklistMode(snap: PhoneChromeSnapshot): PhoneChecklistMode | null {
  if (!snap.mobile || snap.hidden) return null;
  if (snap.mobileExpanded) return 'open';
  if (snap.introExpanded) return 'circle';
  return 'pill';
}

export function readPhoneChromeSnapshot(
  state: ChecklistState,
  compactHidden: boolean,
): PhoneChromeSnapshot {
  const chrome = document.querySelector('.chrome');
  return {
    mobile: true,
    hidden: isChecklistHidden(state) || compactHidden,
    mobileExpanded: state.mobileExpanded === true,
    introExpanded: !!chrome?.classList.contains('chrome--intro-expanded'),
  };
}

function peekSheetTop(): number | null {
  const intro = document.querySelector('.chrome__intro') as HTMLElement | null;
  if (!intro || intro.offsetParent === null) return null;
  const rect = intro.getBoundingClientRect();
  if (rect.height < 24) return null;
  return rect.top;
}

function dockSheetTop(): number | null {
  const dock = document.querySelector('.chrome__dock') as HTMLElement | null;
  if (!dock || dock.offsetParent === null) return null;
  const rect = dock.getBoundingClientRect();
  if (rect.height < 8) return null;
  return rect.top;
}

export function positionPhoneOpenCard(root: HTMLElement): void {
  const inset = 16;
  const gap = 8;
  const width = Math.min(296, window.innerWidth - 32);
  const anchorBottom = phoneOpenCardAnchorBottom();
  const top = Math.max(inset, anchorBottom + gap);
  const peekTop = peekSheetTop();
  const dockTop = dockSheetTop();
  let bottomLimit = window.innerHeight - inset;
  if (peekTop != null && peekTop > top + 40) {
    bottomLimit = Math.min(bottomLimit, peekTop - gap);
  }
  if (dockTop != null && dockTop > top + 40) {
    bottomLimit = Math.min(bottomLimit, dockTop - gap);
  }
  const maxHeight = Math.max(120, bottomLimit - top);

  root.style.setProperty('position', 'fixed', 'important');
  root.style.setProperty('--phone-open-top', `${top}px`);
  root.style.setProperty('top', `${top}px`, 'important');
  root.style.setProperty('right', `${inset}px`, 'important');
  root.style.setProperty('left', 'auto', 'important');
  root.style.setProperty('bottom', 'auto', 'important');
  root.style.setProperty('width', `${width}px`, 'important');
  root.style.setProperty('max-height', `${maxHeight}px`, 'important');
  root.style.setProperty('height', 'auto', 'important');
  root.style.setProperty('min-height', '0', 'important');
  root.style.setProperty('overflow', 'hidden', 'important');
  root.style.setProperty('box-sizing', 'border-box', 'important');
}

function topbarChecklistSlotWidth(root: HTMLElement): number {
  const topbar = root.closest('.chrome__phone-topbar');
  if (!topbar) return window.innerWidth;
  const tools = topbar.querySelector('.chrome__tools-phone');
  const barRect = topbar.getBoundingClientRect();
  const inset = 16;
  const gap = 8;
  const toolsRight = tools?.getBoundingClientRect().right ?? barRect.left + inset;
  return Math.max(48, barRect.right - inset - toolsRight - gap);
}

function withClosedHeaderMeasure(
  root: HTMLElement,
  fn: (header: HTMLElement) => number,
): number {
  const list = root.querySelector('.checklist__list') as HTMLElement | null;
  const foot = root.querySelector('.checklist__footer') as HTMLElement | null;
  const prevList = list?.style.display;
  const prevFoot = foot?.style.display;
  if (list) list.style.display = 'none';
  if (foot) foot.style.display = 'none';
  const header = root.querySelector('.checklist__header') as HTMLElement | null;
  const value = header ? fn(header) : root.getBoundingClientRect().width;
  if (list) list.style.display = prevList ?? '';
  if (foot) foot.style.display = prevFoot ?? '';
  return value;
}

function measurePillHeaderWidths(root: HTMLElement): { full: number; compact: number } {
  const prevPill = root.classList.contains('checklist--phone-pill');
  const prevCompact = root.classList.contains('checklist--phone-pill-compact');
  root.classList.add('checklist--phone-pill');
  root.classList.remove('checklist--phone-pill-compact');
  const full = withClosedHeaderMeasure(root, (h) => h.scrollWidth);
  root.classList.add('checklist--phone-pill-compact');
  const compact = withClosedHeaderMeasure(root, (h) => h.scrollWidth);
  if (!prevPill) root.classList.remove('checklist--phone-pill');
  if (!prevCompact) root.classList.remove('checklist--phone-pill-compact');
  return { full, compact };
}

function applyPillCircleOrCompact(root: HTMLElement): void {
  const available = topbarChecklistSlotWidth(root);
  const { full, compact } = measurePillHeaderWidths(root);
  root.classList.remove('checklist--phone-pill-compact');
  if (full <= available + 2) {
    root.classList.add('checklist--phone-pill');
    return;
  }
  if (compact <= available + 2) {
    root.classList.add('checklist--phone-pill', 'checklist--phone-pill-compact');
    return;
  }
  root.classList.add('checklist--phone-circle', 'checklist--intro-circle');
}

export function applyPhoneChecklistMode(root: HTMLElement, mode: PhoneChecklistMode | null): void {
  root.classList.remove(
    'checklist--phone-pill',
    'checklist--phone-circle',
    'checklist--phone-open',
    'checklist--intro-circle',
    'checklist--phone-pill-tight',
    'checklist--phone-pill-compact',
  );
  clearPhoneChecklistInline(root);

  if (!mode) {
    clearPhoneChecklistAnchorCache();
    return;
  }

  if (mode === 'open') {
    root.classList.add('checklist--phone-open', 'checklist--anchored');
    const place = () => positionPhoneOpenCard(root);
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    return;
  }

  clearPhoneChecklistAnchorCache();

  if (mode === 'circle') {
    root.classList.add('checklist--phone-circle', 'checklist--intro-circle');
    return;
  }

  applyPillCircleOrCompact(root);
}
