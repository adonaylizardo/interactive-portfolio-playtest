/**
 * One analog stick, fixed bottom-right, used only while driving (Tom John model).
 * Knob moves inside the pad. Never spawns a second stick at the finger, never used for walking.
 */

export type StickVector = { x: number; y: number };

const PAD = 72;
const KNOB = 56;
const MAX_RADIUS = 22;
const DEADZONE = 8;

function isCoarse(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

const STICK_GLYPH = `<svg class="joystick__glyph" viewBox="0 0 15 15" width="18" height="18" aria-hidden="true">
  <circle fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" cx="7.5" cy="7.5" r="5.5"/>
  <circle fill="none" stroke="currentColor" stroke-width="1.25" cx="7.5" cy="7.5" r="2"/>
</svg>`;

export class Joystick {
  readonly root: HTMLElement;
  private idle: HTMLButtonElement;
  private knob: HTMLElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private vec: StickVector = { x: 0, y: 0 };
  private touchSeen = false;
  private hidden = true;
  private onStart: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="joystick__ring" aria-hidden="true"></div>
      <button type="button" class="joystick__idle" aria-label="Conducir">
        ${STICK_GLYPH}
      </button>
      <div class="joystick__knob" hidden></div>
    `;
    container.appendChild(this.root);
    this.idle = this.root.querySelector('.joystick__idle')!;
    this.knob = this.root.querySelector('.joystick__knob')!;

    this.idle.addEventListener('pointerdown', (e) => this.begin(e));
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

  cancel(): void {
    this.release();
  }

  /** True when the driving pad is on screen (coarse/touch, not hidden). */
  isShown(): boolean {
    return this.wantsPad();
  }

  qa(): { visible: boolean; active: boolean; x: number; y: number; floating: boolean } {
    const kn = this.knob.getBoundingClientRect();
    const pad = this.root.getBoundingClientRect();
    const floating = this.isActive() && (kn.left < pad.left - 8 || kn.right > pad.right + 8 || kn.top < pad.top - 8 || kn.bottom > pad.bottom + 8);
    return { visible: !this.root.hidden, active: this.isActive(), x: this.vec.x, y: this.vec.y, floating };
  }

  private wantsPad(): boolean {
    return !this.hidden && (isCoarse() || this.touchSeen);
  }

  private syncVisible(): void {
    this.root.hidden = !this.wantsPad();
    if (this.root.hidden) this.release();
  }

  private padCenter(): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private begin(e: PointerEvent): void {
    if (this.hidden || !this.wantsPad()) return;
    if (this.pointerId !== null) return;
    e.preventDefault();
    e.stopPropagation();
    this.pointerId = e.pointerId;
    this.origin = this.padCenter();
    this.root.classList.add('is-dragging');
    this.knob.hidden = false;
    this.idle.style.opacity = '0';
    this.setKnob(0, 0);
    try {
      this.idle.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
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
    this.knob.hidden = true;
    this.idle.style.opacity = '';
  }

  private setKnob(ox: number, oy: number): void {
    const cx = PAD / 2 - KNOB / 2;
    const cy = PAD / 2 - KNOB / 2;
    this.knob.style.left = `${cx + ox}px`;
    this.knob.style.top = `${cy + oy}px`;
  }
}
