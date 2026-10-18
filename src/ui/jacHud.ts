import { getEnterableBuildings } from '../data/map';
import { tileToWorld } from '../iso/math';
import { isMobileLayout } from '../checklist/ui';
import type { JacGear, JacLights, JacSnapshot, JacToggleId } from '../game/jacT9';
import type { Camera } from '../tokens';
import { getLang, onLangChange, t } from './i18n';
import { iconSvg } from './icons';

export type JacHudCallbacks = {
  onInfo: () => void;
  onGetIn: () => void;
  onGetOut: () => void;
  onClose: () => void;
  onLights: (lights: JacLights) => void;
  onGear: (gear: JacGear) => void;
  onToggle: (id: JacToggleId) => void;
  onEngine: () => void;
  onView?: (mode: Camera) => void;
  onRotate?: () => void;
  onMapOverview?: () => void;
  getView?: () => { mode: Camera; overview: boolean };
};

const TOGGLES: { id: JacToggleId; labelKey: 'jac.hazards'; icon: string }[] = [
  { id: 'hazards', labelKey: 'jac.hazards', icon: 'hazards' },
];

function glyph(name: string): string {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"';
  const paths: Record<string, string> = {
    left: `<path ${s} d="M9 3.5 4 7.5 9 11.5"/><path ${s} d="M4.5 7.5h7"/>`,
    right: `<path ${s} d="M6 3.5 11 7.5 6 11.5"/><path ${s} d="M3.5 7.5h7"/>`,
    hazards: `<path ${s} d="M7.5 2.5 13 12.5H2z"/><path ${s} d="M7.5 6v3M7.5 11h.01"/>`,
    fog: `<path ${s} d="M3 5.5h6M3 8h9M3 10.5h7"/><circle ${s} cx="11" cy="5.5" r="1.6"/>`,
    bed: `<path ${s} d="M2.5 10.5h10v2H2.5z"/><path ${s} d="M4 10.5V7.5h5.5l2 3"/>`,
    trailer: `<path ${s} d="M2.5 9.5h7.5v2.5H2.5z"/><path ${s} d="M10 10.5h2.5v1.5H10z"/><circle ${s} cx="5" cy="12.5" r="1"/><circle ${s} cx="11.5" cy="12.5" r="1"/>`,
    close: `<path ${s} d="m4 4 7 7M11 4 4 11"/>`,
    wheel: `<circle ${s} cx="7.5" cy="7.5" r="5"/><circle ${s} cx="7.5" cy="7.5" r="1.4"/><path ${s} d="M7.5 2.5v2.2M7.5 10.3v2.2M2.5 7.5h2.2M10.3 7.5h2.2"/>`,
    search: `<circle ${s} cx="6.5" cy="6.5" r="3.5"/><path ${s} d="m9.2 9.2 2.8 2.8"/>`,
    mute: `<path ${s} d="M3.5 6h2.2L8.5 3.8v7.4L5.7 9H3.5z"/><path ${s} d="m3 3 9 9"/>`,
    battery: `<rect ${s} x="2.5" y="5" width="9" height="5" rx="1"/><path ${s} d="M12.2 6.5v2"/>`,
  };
  return `<svg viewBox="0 0 15 15" width="15" height="15" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}

export class JacHud {
  readonly root: HTMLElement;
  private callbacks: JacHudCallbacks;
  private snap: JacSnapshot | null = null;
  private mobile = isMobileLayout();
  private menuEl: HTMLElement;
  private sheetEl: HTMLElement;
  private dockEl: HTMLElement;
  private barEl: HTMLElement;
  private steerEl: HTMLElement;
  private bubbleEl: HTMLElement;
  private rearEl: HTMLElement;
  private mini: HTMLCanvasElement;
  private hintEl: HTMLElement;
  private lastHtml = '';
  private lastActAt = 0;
  private hintUntil = 0;
  private rearFade = 0;
  private rearFadeFrom = 0;
  private rearFadeTo = 0;
  private rearFadeT0 = 0;

  constructor(container: HTMLElement, callbacks: JacHudCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'jac-hud';
    this.root.hidden = true;
    this.root.setAttribute('inert', '');
    this.root.innerHTML = this.shell();
    container.appendChild(this.root);
    this.menuEl = this.root.querySelector('.jac-menu')!;
    this.sheetEl = this.root.querySelector('.jac-sheet')!;
    this.dockEl = this.root.querySelector('.jac-dock')!;
    this.barEl = this.root.querySelector('.jac-bar')!;
    this.steerEl = this.root.querySelector('.jac-steer')!;
    this.bubbleEl = this.root.querySelector('.jac-bubble')!;
    this.rearEl = this.root.querySelector('.jac-rear')!;
    this.mini = this.root.querySelector('.jac-dock__mini')!;
    this.hintEl = this.root.querySelector('.jac-hint')!;
    this.applyLang();
    onLangChange(() => this.applyLang());
    this.bind();
    const onLayout = () => {
      this.mobile = isMobileLayout();
      if (this.snap) this.render(this.snap);
    };
    window.matchMedia('(max-width: 767px)').addEventListener('change', onLayout);
    window.matchMedia('(max-height: 500px)').addEventListener('change', onLayout);
  }

  park(): void {
    if (this.root.hidden && !document.body.classList.contains('jac-hud-open')) return;
    this.root.hidden = true;
    this.root.setAttribute('inert', '');
    document.body.classList.remove('jac-info', 'jac-drive', 'jac-rearcam', 'jac-hud-open', 'jac-menu-open');
    this.bubbleEl.hidden = true;
    this.bubbleEl.style.transform = '';
    this.hintEl.hidden = true;
    this.lastHtml = '';
    this.snap = null;
    this.rearFade = 0;
    this.rearFadeFrom = 0;
    this.rearFadeTo = 0;
    this.rearEl.style.opacity = '0';
  }

  update(
    snap: JacSnapshot | null,
    anchors: {
      menu: { x: number; y: number } | null;
      bubble: { x: number; y: number } | null;
      follow: { x: number; y: number };
    },
    rearBlit?: { canvas: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number } | null,
  ): void {
    const enteredDrive = snap?.mode === 'drive' && this.snap?.mode !== 'drive';
    this.snap = snap;
    const open = !!snap && snap.mode !== 'parked';
    if (!open || !snap) {
      this.park();
      return;
    }
    if (enteredDrive && !this.mobile) this.hintUntil = performance.now() + 5000;
    this.root.hidden = false;
    this.root.removeAttribute('inert');
    document.body.classList.toggle('jac-hud-open', snap.mode === 'info' || snap.mode === 'drive');
    document.body.classList.toggle('jac-menu-open', snap.mode === 'menu');
    document.body.classList.toggle('jac-info', snap.mode === 'info');
    document.body.classList.toggle('jac-drive', snap.mode === 'drive');
    document.body.classList.toggle('jac-rearcam', snap.rearCam);
    if (!snap.rearCam) {
      this.rearFade = 0;
      this.rearFadeFrom = 0;
      this.rearFadeTo = 0;
      this.rearEl.classList.remove('is-on');
      this.rearEl.hidden = true;
      this.rearEl.style.opacity = '0';
      this.rearEl.setAttribute('aria-hidden', 'true');
    }
    this.tickRearFade(snap.rearCam);
    this.render(snap);
    if (anchors.menu && snap.mode === 'menu') {
      const phone = this.mobile;
      const menuW = Math.max(this.menuEl.offsetWidth || 0, 220);
      const half = menuW / 2;
      const pad = 12;
      const check = document.querySelector('.checklist') as HTMLElement | null;
      const checkBox = check && !check.hidden ? check.getBoundingClientRect() : null;
      const checkReserve =
        !phone && checkBox && checkBox.width > 8 && checkBox.top < 160
          ? Math.max(0, window.innerWidth - checkBox.left + 12)
          : 0;
      const rightReserve = phone ? 88 : Math.max(16, checkReserve);
      const x = Math.max(pad + half, Math.min(window.innerWidth - rightReserve - half, anchors.menu.x));
      const y = Math.max(56, Math.min(window.innerHeight - 96, anchors.menu.y));
      this.menuEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    }
    this.bubbleEl.hidden = true;
    this.bubbleEl.style.transform = '';
    if (snap.mph > 0) this.hintUntil = 0;
    const showHint = !this.mobile && snap.mode === 'drive' && performance.now() < this.hintUntil;
    this.hintEl.hidden = !showHint;
    if (!this.mobile && (snap.mode === 'drive' || snap.mode === 'info')) this.drawMini(anchors.follow);
    void rearBlit;
  }

  qaRoot(): HTMLElement {
    return this.root;
  }

  private applyLang(): void {
    this.hintEl.textContent = t('jac.hint');
    this.root.querySelectorAll('.jac-gears, .jac-bar__gears').forEach((el) => {
      el.setAttribute('aria-label', t('jac.gear'));
    });
    this.lastHtml = '';
    if (this.snap) this.render(this.snap);
  }

  private bind(): void {
    const fire = (e: Event) => {
      const t = (e.target as HTMLElement).closest('[data-jac]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.jac;
      e.preventDefault();
      e.stopPropagation();
      (t as HTMLElement).blur();
      const now = performance.now();
      if (now - this.lastActAt < 200) return;
      this.lastActAt = now;
      if (act === 'info') this.callbacks.onInfo();
      else if (act === 'in') {
        this.hintUntil = performance.now() + 5000;
        this.callbacks.onGetIn();
      } else if (act === 'out') this.callbacks.onGetOut();
      else if (act === 'close') this.callbacks.onClose();
      else if (act === 'engine') this.callbacks.onEngine();
      else if (act === 'lights') this.callbacks.onLights(t.dataset.val as JacLights);
      else if (act === 'gear') this.callbacks.onGear(t.dataset.val as JacGear);
      else if (act === 'toggle') this.callbacks.onToggle(t.dataset.val as JacToggleId);
      else if (act === 'dial') this.cycleLights();
      else if (act === 'view') this.callbacks.onView?.(t.dataset.val as Camera);
      else if (act === 'overview') this.callbacks.onMapOverview?.();
    };
    this.root.addEventListener('pointerup', (e) => {
      if ('button' in e && (e as PointerEvent).button !== 0) return;
      fire(e);
    });
    this.root.addEventListener('click', fire);
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const t = (e.target as HTMLElement).closest('[data-jac]') as HTMLElement | null;
      if (t?.dataset.jac === 'out') fire(e);
    });
    this.root.addEventListener(
      'touchstart',
      (e) => {
        const t = (e.target as HTMLElement).closest('[data-jac]') as HTMLElement | null;
        if (t?.dataset.jac !== 'out') return;
        e.preventDefault();
        e.stopPropagation();
        fire(e);
      },
      { passive: false },
    );
  }

  private cycleLights(): void {
    const order: JacLights[] = ['off', 'auto', 'on'];
    const cur = this.snap?.lights ?? 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.callbacks.onLights(next);
  }

  private render(snap: JacSnapshot): void {
    const phone = this.mobile;
    this.menuEl.hidden = snap.mode !== 'menu';
    this.sheetEl.hidden = !(phone && snap.mode === 'info');
    this.dockEl.hidden = !(!phone && (snap.mode === 'info' || snap.mode === 'drive'));
    this.barEl.hidden = !(phone && snap.mode === 'drive');
    this.steerEl.hidden = true;
    this.bubbleEl.hidden = true;
    this.root.classList.toggle('jac-hud--drive', snap.mode === 'drive');
    this.rearEl.hidden = !snap.rearCam;
    this.rearEl.classList.toggle('is-on', snap.rearCam);
    if (this.rearFade < 0.02) this.rearEl.setAttribute('aria-hidden', 'true');
    else this.rearEl.removeAttribute('aria-hidden');
    this.barEl.classList.toggle('is-bump', snap.bump > 0.08);
    this.dockEl.classList.toggle('is-bump', snap.bump > 0.08);
    this.rearEl.classList.toggle('jac-rear--phone', phone);
    this.rearEl.classList.toggle('jac-rear--turn', Math.abs(snap.steering) > 0.25);
    this.steerEl.classList.toggle('is-live', snap.mph > 0);
    this.dockEl.dataset.mode = snap.mode;
    this.fillDash(snap, phone);
  }

  private fillDash(snap: JacSnapshot, phone: boolean): void {
    const key = `${getLang()}|${snap.mode}|${snap.lights}|${snap.gear}|${snap.rpm}|${snap.mph}|${snap.engineOn}|${JSON.stringify(snap.toggles)}|${phone}`;
    if (key === this.lastHtml && (snap.mode === 'drive' || snap.mode === 'info')) {
      this.syncLive(snap);
      return;
    }
    this.lastHtml = key;
    if (phone && snap.mode === 'info') this.sheetEl.innerHTML = this.sheetHtml(snap);
    if (!phone && (snap.mode === 'info' || snap.mode === 'drive')) {
      const body = this.dockEl.querySelector('.jac-dock__body');
      if (body) body.innerHTML = this.dockBody(snap);
      this.syncDockViews();
    }
    if (phone && snap.mode === 'drive') {
      const btn = this.barEl.querySelector('.jac-bar__btn');
      if (btn) btn.textContent = t('jac.getOut');
    }
    this.syncLive(snap);
  }

  private syncLive(snap: JacSnapshot): void {
    this.root.querySelectorAll('[data-jac="gear"]').forEach((el) => {
      const on = (el as HTMLElement).dataset.val === snap.gear;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this.root.querySelectorAll('[data-jac="lights"]').forEach((el) => {
      el.classList.toggle('is-on', (el as HTMLElement).dataset.val === snap.lights);
    });
    this.root.querySelectorAll('[data-jac="toggle"]').forEach((el) => {
      const id = (el as HTMLElement).dataset.val as JacToggleId;
      el.classList.toggle('is-on', !!snap.toggles[id]);
    });
    this.root.querySelectorAll('.jac-dial').forEach((el) => {
      (el as HTMLElement).dataset.pos = snap.lights;
    });
    this.root.querySelectorAll('[data-rpm]').forEach((el) => {
      el.textContent = snap.rpm ? snap.rpm.toLocaleString('en-US') : '0';
    });
    this.root.querySelectorAll('[data-mph]').forEach((el) => {
      el.textContent = String(snap.mph);
    });
    this.root.querySelectorAll('.jac-gauge--rpm .jac-gauge__needle').forEach((el) => {
      (el as HTMLElement).style.transform = `rotate(${this.needleDeg(snap.rpm, 4000, -120, 120)}deg)`;
    });
    this.root.querySelectorAll('.jac-gauge--mph .jac-gauge__needle').forEach((el) => {
      (el as HTMLElement).style.transform = `rotate(${this.needleDeg(snap.mph, 20, -120, 120)}deg)`;
    });
    const inBtn = snap.mode === 'drive';
    this.root.querySelectorAll('[data-jac="in"], [data-jac="out"]').forEach((el) => {
      if ((el as HTMLElement).dataset.jac === 'in') (el as HTMLElement).hidden = inBtn;
      if ((el as HTMLElement).dataset.jac === 'out') (el as HTMLElement).hidden = !inBtn;
    });
  }

  private syncDockViews(): void {
    const view = this.callbacks.getView?.();
    if (!view) return;
    this.dockEl.querySelectorAll('[data-jac="view"]').forEach((el) => {
      const mode = (el as HTMLElement).dataset.val as Camera;
      el.classList.toggle('is-on', !view.overview && mode === view.mode);
    });
    const ov = this.dockEl.querySelector('[data-jac="overview"]');
    if (ov) ov.classList.toggle('is-on', view.overview);
  }

  private needleDeg(value: number, max: number, from: number, to: number): number {
    const t = Math.max(0, Math.min(1, value / max));
    return from + (to - from) * t;
  }

  private sheetHtml(snap: JacSnapshot): string {
    return `
      <div class="jac-sheet__handle" aria-hidden="true"></div>
      <header class="jac-sheet__head">
        <span class="jac-badge">JAC</span>
        <h2>JAC T9</h2>
        <button type="button" class="jac-btn jac-btn--primary" data-jac="in">${t('jac.getIn')}</button>
        <button type="button" class="jac-icon-btn" data-jac="close" aria-label="${t('jac.close')}">${glyph('close')}</button>
      </header>
      <p class="jac-sheet__desc">${t('jac.desc')}</p>
      <div class="jac-sheet__grid">
        ${this.dialHtml(snap)}
        <div class="jac-toggles">${TOGGLES.map((t) => this.toggleHtml(t, snap)).join('')}</div>
      </div>
      <div class="jac-length"><span>${t('jac.length')}</span><span class="jac-length__dash">5.33 m</span></div>
    `;
  }

  private dockBody(snap: JacSnapshot): string {
    const go = snap.mode === 'drive';
    const desc = go
      ? ''
      : `<p class="jac-sheet__desc jac-dock__desc">${t('jac.desc')}</p>`;
    const length = go
      ? ''
      : `<div class="jac-length jac-dock__length"><span>${t('jac.length')}</span><span class="jac-length__dash">5.33 m</span></div>`;
    return `
      ${this.gaugeHtml('rpm', snap.rpm, 'rpm')}
      ${this.gaugeHtml('mph', snap.mph, 'mph')}
      <div class="jac-gears" role="group" aria-label="${t('jac.gear')}">
        ${(['P', 'R', 'N', 'D'] as JacGear[]).map((g) => `<button type="button" class="jac-gear${snap.gear === g ? ' is-on' : ''}" data-jac="gear" data-val="${g}" aria-pressed="${snap.gear === g}">${g}</button>`).join('')}
      </div>
      ${this.dialHtml(snap)}
      <div class="jac-toggles jac-toggles--dock">${TOGGLES.map((item) => this.toggleHtml(item, snap)).join('')}</div>
      <div class="jac-dock__id">
        <span class="jac-badge">JAC</span>
        <span class="jac-dock__name">JAC T9</span>
        ${desc}
        <button type="button" class="jac-btn jac-btn--primary" data-jac="${go ? 'out' : 'in'}">${go ? t('jac.getOut') : t('jac.getIn')} <kbd>E</kbd></button>
        ${length}
      </div>
    `;
  }

  private dialHtml(snap: JacSnapshot): string {
    return `
      <div class="jac-dial" data-pos="${snap.lights}" data-jac="dial" role="slider" aria-label="${t('jac.lights')}">
        <span class="jac-dial__auto">${t('jac.auto')}</span>
        <button type="button" class="jac-dial__off" data-jac="lights" data-val="off">${t('jac.off')}</button>
        <button type="button" class="jac-dial__on" data-jac="lights" data-val="on">${t('jac.on')}</button>
        <span class="jac-dial__knob" aria-hidden="true"></span>
        <button type="button" class="jac-dial__engine" data-jac="engine" aria-label="${t('jac.engine')}">${this.engineMark(snap)}</button>
      </div>
    `;
  }

  private engineMark(snap: JacSnapshot): string {
    return snap.engineOn ? 'I' : 'O';
  }

  private toggleHtml(item: { id: JacToggleId; labelKey: 'jac.hazards'; icon: string }, snap: JacSnapshot): string {
    const on = snap.toggles[item.id] ? ' is-on' : '';
    return `<button type="button" class="jac-toggle${on}" data-jac="toggle" data-val="${item.id}" aria-label="${t(item.labelKey)}" aria-pressed="${snap.toggles[item.id]}">${glyph(item.icon)}</button>`;
  }

  private gaugeHtml(kind: string, value: number, unit: string): string {
    return `
      <div class="jac-gauge jac-gauge--${kind}">
        <svg viewBox="0 0 112 112" aria-hidden="true">
          <circle cx="56" cy="56" r="48" fill="none" stroke="#2a2c31" stroke-width="6"/>
          <circle cx="56" cy="56" r="48" fill="none" stroke="#3a3d44" stroke-width="6" stroke-dasharray="2 10" stroke-linecap="butt"/>
        </svg>
        <span class="jac-gauge__needle"></span>
        <span class="jac-gauge__val" data-${kind}>${kind === 'rpm' ? (value ? value.toLocaleString('en-US') : '0') : value}</span>
        <span class="jac-gauge__unit">${unit}</span>
      </div>
    `;
  }

  private tickRearFade(on: boolean): void {
    const want = on ? 1 : 0;
    if (want !== this.rearFadeTo) {
      this.rearFadeFrom = this.rearFade;
      this.rearFadeTo = want;
      this.rearFadeT0 = performance.now();
    }
    const t = Math.min(1, (performance.now() - this.rearFadeT0) / 400);
    this.rearFade = this.rearFadeFrom + (this.rearFadeTo - this.rearFadeFrom) * t;
    this.rearEl.style.removeProperty('opacity');
    this.rearEl.style.removeProperty('transition');
  }

  private drawMini(follow: { x: number; y: number }): void {
    const ctx = this.mini.getContext('2d');
    if (!ctx) return;
    const w = this.mini.width;
    const h = this.mini.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0B0C0E';
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w - 4, h / 2);
    ctx.lineTo(w / 2, h - 4);
    ctx.lineTo(4, h / 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2A2C31';
    ctx.stroke();
    const buildings = getEnterableBuildings();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const pts = buildings.map((b) => {
      const p = tileToWorld(b.x + (b.w ?? 1) / 2, b.y + (b.h ?? 1) / 2);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
      return p;
    });
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const pad = 18;
    const sx = (w - pad * 2) / spanX;
    const sy = (h - pad * 2) / spanY;
    const map = (x: number, y: number) => ({ x: pad + (x - minX) * sx, y: pad + (y - minY) * sy });
    ctx.fillStyle = '#24262B';
    for (const p of pts) {
      const s = map(p.x, p.y);
      ctx.fillRect(s.x - 3, s.y - 2, 6, 4);
    }
    const c = map(follow.x, follow.y);
    ctx.fillStyle = '#EDEEF0';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private shell(): string {
    return `
      <div class="jac-menu" hidden>
        <div class="jac-pill jac-pill--name">JAC T9</div>
        <div class="jac-menu__row">
          <button type="button" class="jac-pill" data-jac="info"><i>1</i> ${t('jac.info')}</button>
          <button type="button" class="jac-pill" data-jac="in"><i>2</i> ${t('jac.getIn')}</button>
        </div>
      </div>
      <section class="jac-sheet" hidden></section>
      <section class="jac-dock" hidden>
        <div class="jac-dock__body"></div>
        <div class="jac-dock__right">
          <canvas class="jac-dock__mini" width="120" height="78" aria-hidden="true"></canvas>
          <div class="jac-dock__views" role="group">
            <button type="button" class="jac-dock__view" data-jac="view" data-val="isometrica" aria-label="${t('chrome.isometric')}">${iconSvg('cube')}</button>
            <button type="button" class="jac-dock__view" data-jac="view" data-val="cenital" aria-label="${t('chrome.topdown')}">${iconSvg('grid')}</button>
            <button type="button" class="jac-dock__view" data-jac="overview" aria-label="${t('chrome.map')}">${iconSvg('map')}</button>
          </div>
        </div>
      </section>
      <div class="jac-bar" hidden>
        <span class="jac-bar__id">
          <span>JAC T9</span>
          <span class="jac-bar__mph"><b data-mph>0</b> mph</span>
        </span>
        <div class="jac-bar__gears" role="group" aria-label="${t('jac.gear')}">
          ${(['P', 'R', 'N', 'D'] as JacGear[]).map((g) => `<button type="button" class="jac-gear" data-jac="gear" data-val="${g}" aria-pressed="false">${g}</button>`).join('')}
        </div>
        <button type="button" class="jac-btn jac-btn--primary jac-bar__btn" data-jac="out">${t('jac.getOut')}</button>
      </div>
      <div class="jac-steer" hidden aria-hidden="true">${glyph('wheel')}</div>
      <div class="jac-bubble" hidden></div>
      <div class="jac-hint" hidden></div>
      <div class="jac-rear" hidden>
        <div class="jac-rear__tools">
          <span class="jac-icon-btn" aria-hidden="true">${glyph('search')}</span>
          <span class="jac-icon-btn" aria-hidden="true">${glyph('mute')}</span>
        </div>
        <canvas class="jac-rear__view" width="640" height="220" aria-hidden="true"></canvas>
        <svg class="jac-rear__guides jac-rear__guides--straight" viewBox="0 0 320 110" aria-hidden="true">
          <line x1="70" y1="18" x2="118" y2="78" stroke="#edeef0" stroke-width="1.5"/>
          <line x1="250" y1="18" x2="202" y2="78" stroke="#edeef0" stroke-width="1.5"/>
          <line x1="160" y1="12" x2="160" y2="78" stroke="#edeef0" stroke-width="1.2" stroke-dasharray="3 5"/>
          <line x1="118" y1="78" x2="202" y2="78" stroke="#e23b3b" stroke-width="2"/>
        </svg>
        <svg class="jac-rear__guides jac-rear__guides--curve" viewBox="0 0 320 110" aria-hidden="true">
          <path d="M70 18 C 90 40, 70 62, 118 78" fill="none" stroke="#edeef0" stroke-width="1.5" stroke-dasharray="2 4"/>
          <path d="M160 12 C 132 40, 140 62, 160 78" fill="none" stroke="#edeef0" stroke-width="1.2" stroke-dasharray="3 5"/>
          <line x1="250" y1="18" x2="202" y2="78" stroke="#edeef0" stroke-width="1.5"/>
          <line x1="118" y1="78" x2="202" y2="78" stroke="#e23b3b" stroke-width="2"/>
        </svg>
        <span class="jac-rear__batt" aria-hidden="true">${glyph('battery')}</span>
      </div>
    `;
  }
}
