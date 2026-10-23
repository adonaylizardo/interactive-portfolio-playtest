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

/** Closed pill/circle slot in the phone top bar (checklist may be reparented when open). */
function topBarChecklistAnchorRect(): DOMRect | null {
  const host = document.querySelector('.chrome__phone-topbar-checklist') as HTMLElement | null;
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  if (rect.width < 4 && rect.height < 4) return null;
  return rect;
}

export function positionPhoneOpenCard(root: HTMLElement): void {
  const pillRect = topBarChecklistAnchorRect();
  const inset = 16;
  const gap = 8;
  const width = Math.min(296, window.innerWidth - 32);
  const anchorBottom =
    pillRect != null ? pillRect.bottom : inset + 52;
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

function shouldCollapseToCircle(root: HTMLElement): boolean {
  const topbar = root.closest('.chrome__phone-topbar');
  if (!topbar) return false;
  const tools = topbar.querySelector('.chrome__tools-phone');
  const barRect = topbar.getBoundingClientRect();
  const pad = 32;
  const gap = 8;
  let toolsRight = barRect.left + pad / 2;
  if (tools) {
    for (const child of tools.children) {
      const r = child.getBoundingClientRect();
      if (r.width > 1) toolsRight = Math.max(toolsRight, r.right);
    }
  }
  const available = barRect.right - pad / 2 - toolsRight - gap;
  return available < 112;
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

  if (!mode) return;

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

  if (mode === 'circle' || (mode === 'pill' && shouldCollapseToCircle(root))) {
    root.classList.add('checklist--phone-circle', 'checklist--intro-circle');
    return;
  }

  root.classList.add('checklist--phone-pill');
}
