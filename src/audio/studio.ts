/**
 * Sound: tiny Web Audio synthesis plus Adonay's recorded voice lines.
 * Autoplay-safe: the graph starts on the first user gesture. Mute persists.
 */
import { caseVoiceFile } from '../data/cases';
import { VOICE_LINES, type VoiceLine } from '../data/voice-lines';
import { getLang, onLangChange } from '../ui/i18n';

const MUTE_KEY = 'studio-audio-muted';
const VOICE_DIR = `${import.meta.env.BASE_URL}audio/voice/`;
const AMBIENCE_DIR = `${import.meta.env.BASE_URL}audio/`;
const BARK_DIR = `${import.meta.env.BASE_URL}audio/barks/`;
/** −12 dB vs the previous 0.16 foot gain (0.16 × 10^(−12/20) ≈ 0.040). */
const FOOT_GAIN = 0.04;
const BARK_COOLDOWN_MS = 6000;

type BarkLine = { id: string; phrase: string; mp3: string; ogg: string };
const FOOT_MIN_MS_WALK = 140;
const FOOT_MIN_MS_SPRINT = 95;
/** Walk-cycle frames where a foot plants (8-frame strip, two contacts). */
const FOOT_CONTACT = new Set([0, 4]);

function readMute(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeMute(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* private mode */
  }
}

function canPlayOgg(): boolean {
  if (typeof Audio === 'undefined') return false;
  const a = new Audio();
  return a.canPlayType('audio/ogg; codecs=vorbis') !== '';
}

/** Playwright WebKit-on-phone: HTMLAudio + Pixi takes the software-GL renderer down. */
function automatedWebKitPhone(): boolean {
  if (typeof navigator === 'undefined' || !navigator.webdriver) return false;
  const phone = window.matchMedia('(pointer: coarse), (max-width: 767px)').matches;
  if (!phone) return false;
  const ua = navigator.userAgent;
  // Playwright mobile Chromium is HeadlessChrome but often has no `window.chrome`.
  if (/Chrome|Chromium|HeadlessChrome|CriOS|EdgA|EdgiOS/i.test(ua)) return false;
  return true;
}

export class StudioAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private unlocked = false;
  private muted = readMute();
  private interior = false;
  private lastFootFrame = -1;
  private lastFootAt = 0;
  private voice: HTMLAudioElement | null = null;
  private activeLineId: string | null = null;
  private subtitleText = '';
  private subtitleLineId: string | null = null;
  private subtitleHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly subtitleVisibleMs = 4000;
  private readonly played = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private preferOgg: boolean | null = null;
  /** First gesture owns the intro; other lines wait until it has finished. */
  private introLock = false;
  /** Intro was skipped because a panel was open on unlock; play when back on map. */
  private introDeferred = false;
  private introKickTimer: ReturnType<typeof setTimeout> | null = null;
  /** Persona controls card blocks the welcome line until the user dismisses it. */
  private deferIntroForPersonaOverlay = false;
  /** Welcome is still up: keep ambience and barks from fetching on the Start click. */
  private bootHold = true;
  private graphPending = false;
  private pending: string | null = null;
  private voiceQueue: string[] = [];
  private bark: HTMLAudioElement | null = null;
  private barkLines: BarkLine[] = [];
  private barkReady = new Set<string>();
  private lastBarkId = '';
  private lastBarkAt = 0;
  private barksLoaded = false;
  private placeVoiceEl: HTMLAudioElement | null = null;
  private placeVoiceKey: string | null = null;

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchend', unlock, { capture: true });
    onLangChange(() => {
      if (!this.activeLineId) return;
      const line = VOICE_LINES[this.activeLineId];
      if (line) {
        this.setSubtitle(this.activeLineId, this.lineSubtitle(line));
      }
    });
  }

  private lineSubtitle(line: VoiceLine): string {
    if (getLang() === 'es' && line.script_text_es) return line.script_text_es;
    return line.script_text;
  }

  private enqueueVoice(id: string): void {
    if (this.voiceQueue.includes(id)) return;
    this.voiceQueue.push(id);
  }

  private drainVoiceQueue(): void {
    const next = this.voiceQueue.shift() ?? this.pending;
    this.pending = null;
    if (next) this.playLine(next, { force: true });
  }

  isMuted(): boolean {
    return this.muted;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  isVoicePlaying(): boolean {
    return !!this.voice;
  }

  hasIntroCompleted(): boolean {
    return this.played.has('01-intro');
  }

  qaBarks(): { ready: string[]; lastId: string; cooldownMs: number } {
    return {
      ready: [...this.barkReady],
      lastId: this.lastBarkId,
      cooldownMs: BARK_COOLDOWN_MS,
    };
  }

  subtitle(): string {
    return this.subtitleText;
  }

  subtitleVoiceId(): string | null {
    return this.subtitleLineId;
  }

  private setSubtitle(id: string | null, text: string): void {
    this.subtitleLineId = id;
    this.subtitleText = text;
    if (this.subtitleHideTimer) {
      clearTimeout(this.subtitleHideTimer);
      this.subtitleHideTimer = null;
    }
    if (text) {
      this.subtitleHideTimer = window.setTimeout(() => {
        this.subtitleHideTimer = null;
        this.subtitleText = '';
        this.subtitleLineId = null;
        this.emit();
      }, this.subtitleVisibleMs);
    }
    this.emit();
  }

  /** Clear chrome subtitle (e.g. experience rooms without a case voice line). */
  clearSubtitle(): void {
    this.stopVoice();
    this.emit();
  }

  /** Map-only: play intro if unlock happened while a panel was open. */
  maybePlayDeferredIntro(): void {
    if (!this.unlocked || this.muted || this.played.has('01-intro')) return;
    if (this.isVoicePlaying()) {
      this.introDeferred = true;
      this.scheduleIntroWhenMapIdle(450);
      return;
    }
    if (this.shouldDeferIntro()) {
      this.introDeferred = true;
      return;
    }
    this.introDeferred = false;
    this.playLine('01-intro');
  }

  /** Panel / preview opened — cancel pending intro kick and defer playback. */
  noteIntroPanelOpen(): void {
    this.cancelIntroKick();
    this.introDeferred = true;
    if (this.activeLineId === '01-intro') this.stopVoice();
  }

  /** After returning to the map with no panel, try intro again (debounced). */
  scheduleIntroWhenMapIdle(delayMs = 500): void {
    if (this.played.has('01-intro') || this.muted || !this.unlocked) return;
    if (!this.introDeferred) this.introDeferred = true;
    this.cancelIntroKick();
    this.introKickTimer = window.setTimeout(() => {
      this.introKickTimer = null;
      this.maybePlayDeferredIntro();
    }, delayMs);
  }

  private cancelIntroKick(): void {
    if (this.introKickTimer != null) {
      clearTimeout(this.introKickTimer);
      this.introKickTimer = null;
    }
  }

  private shouldDeferIntro(): boolean {
    if (typeof document === 'undefined') return false;
    const layout = document.body.dataset.layout;
    if (layout === 'panel') return true;
    const chrome = document.querySelector('.chrome');
    if (chrome?.classList.contains('chrome--sheet')) return true;
    const panel = document.querySelector(
      '#ui-root > .building-panel.building-panel--open',
    );
    if (panel) return true;
    if (document.body.classList.contains('about-panel-open')) return true;
    return false;
  }

  /** User-initiated chrome voice (Contact, etc.) while intro is playing. */
  playLineForced(id: string): void {
    this.cancelIntroKick();
    this.introDeferred = true;
    this.introLock = false;
    this.pending = null;
    this.voiceQueue = [];
    if (this.activeLineId === '01-intro') this.stopVoice({ preserveQueue: true });
    const line = VOICE_LINES[id];
    if (line) {
      this.setSubtitle(id, this.lineSubtitle(line));
    }
    this.playLine(id, { force: true });
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    writeMute(muted);
    if (this.master) this.master.gain.value = muted ? 0 : 1;
    if (muted) {
      this.stopVoice();
      this.stopBark();
    } else this.syncAmbience();
    this.emit();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    this.unlock();
    if (!this.muted) this.playClick();
    return this.muted;
  }

  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    this.unlocked = true;
    this.introLock = true;
    // After the gesture frame: starting the graph mid-setZoom / interior swap
    // takes WebKit's renderer down.
    const phone = window.matchMedia('(pointer: coarse), (max-width: 767px)').matches;
    window.setTimeout(() => this.startGraphAndIntro(), phone ? 900 : 320);
  }

  private personaControlsBlockingIntro(): boolean {
    if (typeof document === 'undefined') return false;
    return !!document.querySelector('.persona-kit__overlay:not([hidden])');
  }

  /** Call when the persona intro card closes so the welcome line can play. */
  playIntroWhenPersonaReady(): void {
    if (!this.unlocked || this.muted || this.played.has('01-intro')) return;
    this.deferIntroForPersonaOverlay = false;
    this.introLock = true;
    this.playLine('01-intro');
    if (!this.played.has('01-intro')) this.introLock = false;
  }

  /** Spawn view has finished booting; a gesture that arrived during welcome can start audio now. */
  releaseBootHold(): void {
    if (!this.bootHold) return;
    this.bootHold = false;
    if (!this.graphPending) return;
    this.graphPending = false;
    this.startGraphAndIntro();
  }

  private startGraphAndIntro(): void {
    if (this.bootHold) {
      this.graphPending = true;
      return;
    }
    if (this.personaControlsBlockingIntro()) {
      this.deferIntroForPersonaOverlay = true;
      this.introLock = true;
    }
    if (automatedWebKitPhone()) {
      if (!this.deferIntroForPersonaOverlay) {
        this.introDeferred = true;
        this.introLock = false;
        this.scheduleIntroWhenMapIdle(900);
      }
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx && !this.ctx) {
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);
        void this.ctx.resume();
        this.startAmbience();
        void this.loadBarks();
      } else {
        void this.ctx?.resume();
      }
    } catch {
      /* autoplay / context limits: mute state still flips */
    }
    if (!this.deferIntroForPersonaOverlay) {
      this.introDeferred = true;
      this.introLock = false;
      this.scheduleIntroWhenMapIdle(700);
    }
  }

  setInterior(open: boolean): void {
    this.interior = open;
    if (!open) this.stopVoice();
    this.syncAmbience();
    this.emit();
  }

  noteWalk(walking: boolean, frame = 0, sprint = false): void {
    if (!walking) {
      this.lastFootFrame = -1;
      return;
    }
    if (!FOOT_CONTACT.has(frame) || frame === this.lastFootFrame) return;
    const now = performance.now();
    const minMs = sprint ? FOOT_MIN_MS_SPRINT : FOOT_MIN_MS_WALK;
    if (now - this.lastFootAt < minMs) return;
    this.lastFootFrame = frame;
    this.lastFootAt = now;
    this.playFoot(sprint, frame === 0);
  }

  playDoor(): void {
    this.blip(180, 0.045, 0.11);
    window.setTimeout(() => this.blip(140, 0.03, 0.08), 55);
  }

  playClick(): void {
    this.blip(920, 0.018, 0.05);
  }

  playCaseVoice(id: string | null | undefined): void {
    const file = caseVoiceFile(id);
    if (!file) return;
    this.playLineForced(file);
  }

  stopPlaceVoice(): void {
    if (this.placeVoiceEl) {
      this.placeVoiceEl.pause();
      this.placeVoiceEl.src = '';
      this.placeVoiceEl = null;
    }
    this.placeVoiceKey = null;
    this.syncAmbience();
    this.emit();
  }

  getPlaceVoiceProgress(): { current: number; duration: number; playing: boolean; voiceId: string | null } {
    const el = this.placeVoiceEl;
    if (!el) return { current: 0, duration: 0, playing: false, voiceId: null };
    const duration = Number.isFinite(el.duration) ? el.duration : 0;
    return {
      current: el.currentTime,
      duration,
      playing: !el.paused && !el.ended,
      voiceId: this.placeVoiceKey,
    };
  }

  /** QA / automation: start place voice without gesture (headless may block HTMLAudio.play otherwise). */
  qaPlayPlaceVoice(voiceId: string): boolean {
    this.setMuted(false);
    if (!this.unlocked) {
      this.unlocked = true;
      this.introLock = false;
    }
    return this.startPlaceVoice(voiceId, { qa: true });
  }

  /** Play / pause / switch landmark voice. Returns whether audio is playing after the call. */
  togglePlaceVoice(voiceId: string): boolean {
    if (this.muted) return false;
    if (!this.unlocked) this.unlock();
    if (this.placeVoiceKey === voiceId && this.placeVoiceEl) {
      if (this.placeVoiceEl.paused) {
        void this.placeVoiceEl.play().catch(() => this.stopPlaceVoice());
        this.emit();
        return true;
      }
      this.placeVoiceEl.pause();
      this.emit();
      return false;
    }
    return this.startPlaceVoice(voiceId, { qa: false });
  }

  private startPlaceVoice(voiceId: string, opts?: { qa?: boolean }): boolean {
    this.stopVoice();
    this.stopBark();
    this.stopPlaceVoice();
    const line = VOICE_LINES[voiceId];
    if (!line) return false;
    if (!opts?.qa && automatedWebKitPhone()) return false;
    this.preferOgg ??= canPlayOgg();
    const file = this.preferOgg ? line.files.ogg : line.files.mp3;
    const el = new Audio(`${VOICE_DIR}${file}`);
    el.preload = 'auto';
    el.addEventListener('ended', () => {
      if (this.placeVoiceEl === el) this.stopPlaceVoice();
    });
    el.addEventListener('error', () => {
      if (this.placeVoiceEl === el) this.stopPlaceVoice();
    });
    this.placeVoiceEl = el;
    this.placeVoiceKey = voiceId;
    this.duckAmbience(true);
    this.emit();
    void el.play().catch(() => this.stopPlaceVoice());
    return true;
  }

  /** Move command: a random bark ≠ last, ~6 s cooldown, never over a case line. */
  dismissIntroSubtitle(): void {
    if (!this.subtitleText) return;
    this.stopVoice();
    this.subtitleText = '';
    this.introLock = false;
    this.emit();
  }

  noteMoveCommand(): void {
    if (!this.played.has('01-intro') && this.unlocked) {
      this.introDeferred = true;
      this.scheduleIntroWhenMapIdle(900);
    }
    if (this.muted || !this.unlocked || this.voice) return;
    try {
      if (typeof localStorage !== 'undefined') {
        const lang = document.documentElement.lang || 'es';
        if (lang.startsWith('es')) return;
      }
    } catch {
      /* ignore */
    }
    if (automatedWebKitPhone()) return;
    const now = performance.now();
    if (now - this.lastBarkAt < BARK_COOLDOWN_MS) return;
    if (!this.barksLoaded) void this.loadBarks();
    if (this.barkReady.size === 0) return;
    const pool = [...this.barkReady].filter((id) => id !== this.lastBarkId);
    const pick = (pool.length ? pool : [...this.barkReady])[Math.floor(Math.random() * (pool.length || this.barkReady.size))];
    const line = this.barkLines.find((l) => l.id === pick);
    if (!line) return;
    this.preferOgg ??= canPlayOgg();
    const file = this.preferOgg ? line.ogg : line.mp3;
    this.stopBark();
    const el = new Audio(`${BARK_DIR}${file}`);
    el.preload = 'auto';
    el.addEventListener('error', () => {
      this.barkReady.delete(line.id);
      if (this.bark === el) this.bark = null;
    });
    el.addEventListener('ended', () => {
      if (this.bark === el) this.bark = null;
    });
    this.bark = el;
    this.lastBarkId = line.id;
    this.lastBarkAt = now;
    void el.play().catch(() => {
      this.barkReady.delete(line.id);
      if (this.bark === el) this.bark = null;
    });
  }

  playLine(id: string, opts: { force?: boolean } = {}): void {
    const line = VOICE_LINES[id];
    if (!line) return;
    if (!opts.force && this.muted) return;
    if (!opts.force && this.played.has(id)) return;
    if (!this.unlocked && !opts.force) return;
    if (opts.force && (this.muted || !this.unlocked)) return;
    if (id === '01-intro' && this.shouldDeferIntro()) {
      this.introDeferred = true;
      this.introLock = false;
      return;
    }
    if (this.voice && id !== '01-intro' && !opts.force) {
      this.enqueueVoice(id);
      return;
    }
    if (this.introLock && id !== '01-intro' && !opts.force) {
      this.enqueueVoice(id);
      return;
    }
    if (this.voice && opts.force) this.stopVoice({ preserveQueue: true });
    else this.stopVoice();
    this.stopBark();
    if (id !== '01-intro') this.played.add(id);
    this.activeLineId = id;
    this.setSubtitle(id, this.lineSubtitle(line));
    if (automatedWebKitPhone()) {
      window.setTimeout(() => this.finishVoice(true), 80);
      return;
    }
    this.preferOgg ??= canPlayOgg();
    const file = this.preferOgg ? line.files.ogg : line.files.mp3;
    const el = new Audio(`${VOICE_DIR}${file}`);
    el.preload = 'auto';
    el.addEventListener('error', () => {
      if (this.voice === el) this.finishVoice(false);
    });
    el.addEventListener('ended', () => {
      if (this.voice === el) this.finishVoice(true);
    });
    this.voice = el;
    this.duckAmbience(true);
    void el.play().catch(() => {
      if (this.voice === el) this.finishVoice(false);
    });
  }

  private finishVoice(completed = true): void {
    if (completed && this.activeLineId === '01-intro') this.played.add('01-intro');
    if (!completed && this.activeLineId === '01-intro') this.introDeferred = true;
    this.activeLineId = null;
    this.introLock = false;
    this.stopVoice({ preserveQueue: true, clearCaption: false });
    this.syncAmbience();
    this.emit();
    this.drainVoiceQueue();
  }

  private stopVoice(opts: { preserveQueue?: boolean; clearCaption?: boolean } = {}): void {
    const hadVoice = !!this.voice;
    const interruptedIntro = this.activeLineId === '01-intro';
    if (this.voice) {
      this.voice.pause();
      this.voice.src = '';
      this.voice = null;
    }
    if (interruptedIntro) {
      this.introDeferred = true;
      this.activeLineId = null;
    }
    if (opts.clearCaption !== false) {
      if (this.subtitleHideTimer) {
        clearTimeout(this.subtitleHideTimer);
        this.subtitleHideTimer = null;
      }
      this.subtitleText = '';
      this.subtitleLineId = null;
    }
    if (hadVoice || this.introLock) {
      this.introLock = false;
      if (!opts.preserveQueue) this.pending = null;
    }
    this.duckAmbience(false);
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambience) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    this.ambienceGain = gain;
    void this.loadAmbienceBuffer(ctx)
      .then((buffer) => {
        if (this.ambience || this.ctx !== ctx) return;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gain);
        src.start();
        this.ambience = src;
        this.syncAmbience();
      })
      .catch(() => {
        if (this.ambience || this.ctx !== ctx) return;
        this.startFallbackAmbience(ctx, gain);
      });
  }

  private async loadAmbienceBuffer(ctx: AudioContext): Promise<AudioBuffer> {
    this.preferOgg ??= canPlayOgg();
    const file = this.preferOgg ? 'ambience-nature.ogg' : 'ambience-nature.mp3';
    const res = await fetch(`${AMBIENCE_DIR}${file}`);
    if (!res.ok) throw new Error('ambience missing');
    const raw = await res.arrayBuffer();
    return ctx.decodeAudioData(raw.slice(0));
  }

  /** Soft brown-noise bed if the CC0 file cannot decode. */
  private startFallbackAmbience(ctx: AudioContext, gain: GainNode): void {
    const seconds = 2.5;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown += (Math.random() * 2 - 1) * 0.02;
      brown *= 0.98;
      data[i] = brown;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 720;
    filter.Q.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    src.start();
    this.ambience = src;
    this.syncAmbience();
  }

  private async loadBarks(): Promise<void> {
    if (this.barksLoaded) return;
    this.barksLoaded = true;
    try {
      const res = await fetch(`${BARK_DIR}manifest.json`);
      if (!res.ok) return;
      const data = (await res.json()) as { lines?: BarkLine[]; files?: string[] };
      this.barkLines = data.lines ?? [];
      const present = new Set(data.files ?? []);
      if (present.size === 0) return;
      this.preferOgg ??= canPlayOgg();
      await Promise.all(
        this.barkLines.map(async (line) => {
          const file = this.preferOgg ? line.ogg : line.mp3;
          if (!file || !present.has(file)) return;
          try {
            const probe = await fetch(`${BARK_DIR}${file}`);
            const type = probe.headers.get('content-type') ?? '';
            if (probe.ok && /audio/i.test(type)) this.barkReady.add(line.id);
          } catch {
            /* listed file failed: stay silent */
          }
        }),
      );
    } catch {
      /* empty slot: stay silent */
    }
  }

  private stopBark(): void {
    if (!this.bark) return;
    this.bark.pause();
    this.bark.src = '';
    this.bark = null;
  }

  private ambienceTarget(): number {
    if (this.muted || !this.unlocked) return 0;
    if (this.voice) return this.interior ? 0.004 : 0.012;
    return this.interior ? 0.012 : 0.04;
  }

  private syncAmbience(): void {
    this.duckAmbience(!!this.voice);
  }

  private duckAmbience(on: boolean): void {
    const gain = this.ambienceGain;
    const ctx = this.ctx;
    if (!gain || !ctx) return;
    void on;
    const target = this.ambienceTarget();
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.18);
  }

  private playFoot(sprint: boolean, left: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const variant = Math.floor(Math.random() * 4);
    const dur = sprint ? 0.045 : 0.055;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = (sprint ? 1.08 : 1) * (0.92 + variant * 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (left ? 380 : 470) + variant * 18;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.value = FOOT_GAIN * (sprint ? 0.85 : 1) * (0.82 + variant * 0.08);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    src.stop(ctx.currentTime + dur);
  }

  private blip(freq: number, dur: number, vol: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }
}

export const studio = new StudioAudio();
