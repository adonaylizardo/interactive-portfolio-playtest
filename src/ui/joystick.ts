/**
 * One analog stick, fixed bottom-right, used only while driving (Tom John model).
 * Knob stays inside the pad. Never spawns a second stick at the finger, never used for walking.
 */

import { onLangChange, t } from './i18n';

export type StickVector = { x: number; y: number };

const PAD = 112;
const KNOB = 44;
const MAX_RADIUS = 28;
const DEADZONE = 8;

function isCoarse(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export class Joystick {
  readonly root: HTMLElement;
  private idle: HTMLElement;
  private knob: HTMLElement;
  private pointerId: number | null = null;
  private origin = { x: 0, y: 0 };
  private vec: StickVector = { x: 0, y: 0 };
  private touchSeen = false;
  private hidden = true;
  private touchActive = false;
  private onStart: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'joystick';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', t('jac.drive'));
    this.root.innerHTML = `
      <div class="joystick__ring" aria-hidden="true"></div>
      <div class="joystick__idle" aria-hidden="true"></div>
    `;
    container.appendChild(this.root);
    onLangChange(() => this.root.setAttribute('aria-label', t('jac.drive')));
    this.idle = this.root.querySelector('.joystick__idle')!;
    this.knob = this.idle;

    this.root.addEventListener('pointerdown', (e) => this.beginPointer(e));
    window.addEventListener('pointermove', (e) => this.movePointer(e));
    window.addEventListener('pointerup', (e) => this.endPointer(e));
    window.addEventListener('pointercancel', (e) => this.endPointer(e));
    this.root.addEventListener(
      'touchstart',
      (e) => {
        this.noteTouch();
        this.beginTouch(e);
      },
      { passive: false },
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        if (!this.touchActive) return;
        e.preventDefault();
        this.moveTouch(e);
      },
      { passive: false },
    );
    window.addEventListener(
      'touchend',
      (e) => {
        if (e.touches.length === 0 && this.touchActive) this.release();
        else if (this.touchActive) this.endTouch(e);
      },
      { passive: true },
    );
    window.addEventListener(
      'touchcancel',
      (e) => {
        if (!this.touchActive) return;
        this.endTouch(e);
      },
      { passive: true },
    );

    window.addEventListener(
      'touchstart',
      () => this.noteTouch(),
      { capture: true, passive: true },
    );
    window.matchMedia('(pointer: coarse)').addEventListener('change', () => this.syncVisible());
    this.syncVisible();
    this.setKnob(0, 0);
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
    return this.pointerId !== null || this.touchActive;
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
    const slop = 4;
    const floating =
      this.isActive() &&
      (kn.left < pad.left - slop ||
        kn.right > pad.right + slop ||
        kn.top < pad.top - slop ||
        kn.bottom > pad.bottom + slop);
    return { visible: !this.root.hidden, active: this.isActive(), x: this.vec.x, y: this.vec.y, floating };
  }

  private wantsPad(): boolean {
    return !this.hidden && (isCoarse() || this.touchSeen);
  }

  private noteTouch(): void {
    if (this.touchSeen) return;
    this.touchSeen = true;
    this.syncVisible();
  }

  private syncVisible(): void {
    this.root.hidden = !this.wantsPad();
    if (this.root.hidden) this.release();
  }

  private padCenter(): { x: number; y: number } {
    const r = this.root.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  private beginPointer(e: PointerEvent): void {
    if (this.hidden || !this.wantsPad()) return;
    if (this.touchActive || this.pointerId !== null) return;
    if (e.pointerType === 'touch') this.noteTouch();
    e.preventDefault();
    e.stopPropagation();
    this.pointerId = e.pointerId;
    this.origin = this.padCenter();
    this.root.classList.add('is-dragging');
    this.applyDelta(e.clientX - this.origin.x, e.clientY - this.origin.y);
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* capture is optional */
    }
    this.onStart?.();
  }

  private movePointer(e: PointerEvent): void {
    if (this.touchActive || this.pointerId !== e.pointerId) return;
    e.stopPropagation();
    this.applyDelta(e.clientX - this.origin.x, e.clientY - this.origin.y);
  }

  private endPointer(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    this.release();
  }

  private beginTouch(e: TouchEvent): void {
    if (this.hidden || !this.wantsPad()) return;
    if (this.touchActive || this.pointerId !== null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    this.touchActive = true;
    this.origin = this.padCenter();
    this.root.classList.add('is-dragging');
    this.applyDelta(t.clientX - this.origin.x, t.clientY - this.origin.y);
    this.onStart?.();
  }

  private moveTouch(e: TouchEvent): void {
    if (!this.touchActive) return;
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    this.applyDelta(t.clientX - this.origin.x, t.clientY - this.origin.y);
  }

  private endTouch(e: TouchEvent): void {
    if (!this.touchActive) return;
    if (e.touches.length > 0) {
      const t = e.touches[0];
      this.applyDelta(t.clientX - this.origin.x, t.clientY - this.origin.y);
      return;
    }
    this.release();
  }

  private applyDelta(dx: number, dy: number): void {
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

  private release(): void {
    this.pointerId = null;
    this.touchActive = false;
    this.vec = { x: 0, y: 0 };
    this.root.classList.remove('is-dragging');
    this.setKnob(0, 0);
  }

  private setKnob(ox: number, oy: number): void {
    const cx = PAD / 2 - KNOB / 2;
    const cy = PAD / 2 - KNOB / 2;
    this.idle.style.left = `${cx + ox}px`;
    this.idle.style.top = `${cy + oy}px`;
  }
}
