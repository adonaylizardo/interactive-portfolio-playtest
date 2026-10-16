/**
 * Mobile / touch joystick. Idle is a Pixel-kit analog stick; a drag replaces it with a
 * ring + knob + dotted line at the finger. Mouse desktops never see it.
 */

export type StickVector = { x: number; y: number };

const RING_SIZE = 128;
const KNOB_SIZE = 48;
const MAX_RADIUS = 48;
const DEADZONE = 10;

function isCoarse(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

const STICK_GLYPH = `<svg class="joystick__glyph" viewBox="0 0 15 15" width="22" height="22" aria-hidden="true">
  <circle fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" cx="7.5" cy="7.5" r="5.5"/>
  <circle fill="none" stroke="currentColor" stroke-width="1.25" cx="7.5" cy="7.5" r="2"/>
</svg>`;

export class Joystick {
  readonly root: HTMLElement;
  private idle: HTMLButtonElement;
  private active: HTMLElement;
  private ring: HTMLElement;
  private knob: HTMLElement;
  private line: SVGLineElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private vec: StickVector = { x: 0, y: 0 };
  private touchSeen = false;
  private hidden = false;
  private onStart: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.root.hidden = true;
    this.root.innerHTML = `
      <button type="button" class="joystick__idle" aria-label="Mover">
        ${STICK_GLYPH}
      </button>
      <div class="joystick__active" hidden>
        <div class="joystick__ring"></div>
        <svg class="joystick__line" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0.5" y1="0.5" x2="0.5" y2="0.5" />
        </svg>
        <div class="joystick__knob"></div>
      </div>
    `;
    container.appendChild(this.root);
    this.idle = this.root.querySelector('.joystick__idle')!;
    this.active = this.root.querySelector('.joystick__active')!;
    this.ring = this.root.querySelector('.joystick__ring')!;
    this.knob = this.root.querySelector('.joystick__knob')!;
    this.line = this.root.querySelector('.joystick__line line')!;

    this.idle.addEventListener('pointerdown', (e) => this.begin(e));
    this.idle.addEventListener('pointermove', (e) => this.move(e));
    this.idle.addEventListener('pointerup', (e) => this.end(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.end(e));
    window.addEventListener('pointercancel', (e) => this.end(e));

    const noteTouch = () => {
      if (this.touchSeen) return;
      this.touchSeen = true;
      this.syncVisible();
    };
    window.addEventListener('touchstart', noteTouch, { capture: true, passive: true });
    window.matchMedia('(pointer: coarse)').addEventListener('change', () => this.syncVisible());
    this.syncVisible();
  }

  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) {
      if (hidden && this.pointerId !== null) this.release();
      return;
    }
    this.hidden = hidden;
    if (hidden) this.release();
    this.syncVisible();
  }

  onStickStart(fn: () => void): void {
    this.onStart = fn;
  }

  vector(): StickVector {
    return this.vec;
  }

  isActive(): boolean {
    return this.pointerId !== null;
  }

  qa(): { visible: boolean; active: boolean; x: number; y: number } {
    return { visible: !this.root.hidden, active: this.isActive(), x: this.vec.x, y: this.vec.y };
  }

  private wantsPad(): boolean {
    return !this.hidden && (isCoarse() || this.touchSeen);
  }

  private syncVisible(): void {
    this.root.hidden = !this.wantsPad();
    if (this.root.hidden) this.release();
  }

  private begin(e: PointerEvent): void {
    if (this.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    this.pointerId = e.pointerId;
    this.origin = { x: e.clientX, y: e.clientY };
    this.root.classList.add('is-dragging');
    this.active.hidden = false;
    this.placeActive(this.origin.x, this.origin.y);
    this.setKnob(0, 0);
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      try {
        this.idle.setPointerCapture(e.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    this.onStart?.();
  }

  private move(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    e.stopPropagation();
    const dx = e.clientX - this.origin.x;
    const dy = e.clientY - this.origin.y;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, MAX_RADIUS);
    const ux = dist > 0 ? (dx / dist) * clamped : 0;
    const uy = dist > 0 ? (dy / dist) * clamped : 0;
    this.setKnob(ux, uy);
    if (clamped < DEADZONE) {
      this.vec = { x: 0, y: 0 };
      return;
    }
    const gain = (clamped - DEADZONE) / (MAX_RADIUS - DEADZONE);
    this.vec = { x: (ux / clamped) * gain, y: (uy / clamped) * gain };
  }

  private end(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    this.release();
  }

  private release(): void {
    this.pointerId = null;
    this.vec = { x: 0, y: 0 };
    this.root.classList.remove('is-dragging');
    this.active.hidden = true;
  }

  private placeActive(cx: number, cy: number): void {
    const left = cx - RING_SIZE / 2;
    const top = cy - RING_SIZE / 2;
    this.active.style.left = `${left}px`;
    this.active.style.top = `${top}px`;
    this.active.style.width = `${RING_SIZE}px`;
    this.active.style.height = `${RING_SIZE}px`;
    this.ring.style.width = `${RING_SIZE}px`;
    this.ring.style.height = `${RING_SIZE}px`;
    this.line.ownerSVGElement?.setAttribute('viewBox', `0 0 ${RING_SIZE} ${RING_SIZE}`);
  }

  private setKnob(ox: number, oy: number): void {
    const cx = RING_SIZE / 2;
    const cy = RING_SIZE / 2;
    this.knob.style.left = `${cx + ox - KNOB_SIZE / 2}px`;
    this.knob.style.top = `${cy + oy - KNOB_SIZE / 2}px`;
    this.line.setAttribute('x1', String(cx));
    this.line.setAttribute('y1', String(cy));
    this.line.setAttribute('x2', String(cx + ox));
    this.line.setAttribute('y2', String(cy + oy));
  }
}
