import { isChecklistHidden, type ChecklistState } from './storage';

export type PhoneChecklistMode = 'pill' | 'circle' | 'open';

export type PhoneChromeSnapshot = {
  mobile: boolean;
  hidden: boolean;
  mobileExpanded: boolean;
  introExpanded: boolean;
  dock: boolean;
  introPeek: boolean;
  introDetailSeen: boolean;
  panelOpen: boolean;
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
  if (
    snap.panelOpen ||
    snap.introExpanded ||
    snap.dock ||
    (snap.introPeek && snap.introDetailSeen)
  ) {
    return 'circle';
  }
  return 'pill';
}

export function readPhoneChromeSnapshot(
  state: ChecklistState,
  panelOpen: boolean,
): PhoneChromeSnapshot {
  const chrome = document.querySelector('.chrome');
  return {
    mobile: true,
    hidden: isChecklistHidden(state),
    mobileExpanded: state.mobileExpanded === true,
    introExpanded: !!chrome?.classList.contains('chrome--intro-expanded'),
    dock: !!chrome?.classList.contains('chrome--dock'),
    introPeek: !!chrome?.classList.contains('chrome--intro-peek'),
    introDetailSeen: !!chrome?.classList.contains('chrome--intro-detail-seen'),
    panelOpen,
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
  const width = Math.min(247, window.innerWidth - 112 - inset);
  const left = 112;
  const top = 16;
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
  root.style.setProperty('left', `${left}px`, 'important');
  root.style.setProperty('right', 'auto', 'important');
  root.style.setProperty('bottom', 'auto', 'important');
  root.style.setProperty('width', `${width}px`, 'important');
  root.style.setProperty('max-height', `${maxHeight}px`, 'important');
  root.style.setProperty('height', 'auto', 'important');
  root.style.setProperty('min-height', '0', 'important');
  root.style.setProperty('overflow', 'hidden', 'important');
  root.style.setProperty('box-sizing', 'border-box', 'important');
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

  root.classList.add('checklist--phone-pill');
}
