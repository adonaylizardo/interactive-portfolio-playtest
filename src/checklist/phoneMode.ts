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
export function cachePhoneChecklistAnchorBeforeOpen(): void {
  const topbar = document.querySelector('.chrome__phone-topbar') as HTMLElement | null;
  const tools = document.querySelector('.chrome__tools-phone') as HTMLElement | null;
  const checklist = document.querySelector(
    '.chrome__phone-topbar-checklist .checklist',
  ) as HTMLElement | null;
  let bottom = 0;
  if (topbar) bottom = Math.max(bottom, topbar.getBoundingClientRect().bottom);
  if (tools) bottom = Math.max(bottom, tools.getBoundingClientRect().bottom);
  if (checklist) bottom = Math.max(bottom, checklist.getBoundingClientRect().bottom);
  cachedChecklistAnchorBottom = bottom > 32 ? bottom : null;
}

export function clearPhoneChecklistAnchorCache(): void {
  cachedChecklistAnchorBottom = null;
}

export function phoneOpenCardAnchorBottom(): number {
  const inset = 16;
  if (cachedChecklistAnchorBottom != null && cachedChecklistAnchorBottom > inset + 20) {
    return cachedChecklistAnchorBottom;
  }
  const topbar = document.querySelector('.chrome__phone-topbar') as HTMLElement | null;
  if (topbar) {
    const bar = topbar.getBoundingClientRect();
    if (bar.height > 8) return bar.bottom;
  }
  const tools = document.querySelector('.chrome__tools-phone') as HTMLElement | null;
  if (tools) {
    const tr = tools.getBoundingClientRect();
    if (tr.height > 8) return tr.bottom;
  }
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

function measureClosedPillWidth(root: HTMLElement): number {
  const list = root.querySelector('.checklist__list') as HTMLElement | null;
  const foot = root.querySelector('.checklist__footer') as HTMLElement | null;
  const prevList = list?.style.display;
  const prevFoot = foot?.style.display;
  if (list) list.style.display = 'none';
  if (foot) foot.style.display = 'none';
  root.classList.add('checklist--phone-pill');
  const header = root.querySelector('.checklist__header') as HTMLElement | null;
  const needed = header?.scrollWidth ?? root.getBoundingClientRect().width;
  root.classList.remove('checklist--phone-pill');
  if (list) list.style.display = prevList ?? '';
  if (foot) foot.style.display = prevFoot ?? '';
  return needed;
}

export function applyPhoneChecklistMode(root: HTMLElement, mode: PhoneChecklistMode | null): void {
  root.classList.remove(
    'checklist--phone-pill',
    'checklist--phone-circle',
    'checklist--phone-open',
    'checklist--intro-circle',
    'checklist--phone-pill-tight',
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

  root.classList.add('checklist--phone-pill');
  if (measureClosedPillWidth(root) > topbarChecklistSlotWidth(root) + 2) {
    root.classList.remove('checklist--phone-pill');
    root.classList.add('checklist--phone-circle', 'checklist--intro-circle');
  }
}
