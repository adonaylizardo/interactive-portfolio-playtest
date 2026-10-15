/**
 * Sound: tiny Web Audio synthesis plus Adonay's recorded voice lines.
 * Autoplay-safe: the graph starts on the first user gesture. Mute persists.
 */
import { caseVoiceFile } from '../data/cases';
import { VOICE_LINES } from '../data/voice-lines';

const MUTE_KEY = 'studio-audio-muted';
const VOICE_DIR = `${import.meta.env.BASE_URL}audio/voice/`;
/** −12 dB vs the previous 0.16 foot gain (0.16 × 10^(−12/20) ≈ 0.040). */
const FOOT_GAIN = 0.04;
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
  private subtitleText = '';
  private readonly played = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private preferOgg: boolean | null = null;

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchend', unlock, { capture: true });
  }

  isMuted(): boolean {
    return this.muted;
  }

  isUnlocked(): boolean {
    return this.unlocked;
  }

  subtitle(): string {
    return this.subtitleText;
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
    if (muted) this.stopVoice();
    else this.syncAmbience();
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
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      void this.ctx.resume();
      this.startAmbience();
    } catch {
      /* autoplay / context limits: mute state still flips */
    }
    queueMicrotask(() => {
      if (!this.voice && !this.muted) this.playLine('01-intro');
    });
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
    this.playLine(file);
  }

  playLine(id: string): void {
    const line = VOICE_LINES[id];
    if (!line || this.played.has(id) || this.muted) return;
    this.unlock();
    this.stopVoice();
    this.played.add(id);
    this.preferOgg ??= canPlayOgg();
    const file = this.preferOgg ? line.files.ogg : line.files.mp3;
    const el = new Audio(`${VOICE_DIR}${file}`);
    el.preload = 'auto';
    el.addEventListener('error', () => {
      if (this.voice === el) this.finishVoice();
    });
    el.addEventListener('ended', () => {
      if (this.voice === el) this.finishVoice();
    });
    this.voice = el;
    this.subtitleText = line.script_text;
    this.duckAmbience(true);
    this.emit();
    void el.play().catch(() => {
      if (this.voice === el) this.finishVoice();
    });
  }

  private finishVoice(): void {
    this.stopVoice();
    this.syncAmbience();
    this.emit();
  }

  private stopVoice(): void {
    if (this.voice) {
      this.voice.pause();
      this.voice.src = '';
      this.voice = null;
    }
    this.subtitleText = '';
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.ambience) return;
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
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    this.ambience = src;
    this.ambienceGain = gain;
    this.syncAmbience();
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
