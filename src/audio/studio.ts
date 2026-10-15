/**
 * Sound v1: tiny Web Audio synthesis (no bundled samples) plus an optional per-case
 * voice file if Adonay has recorded one. Autoplay-safe: the graph starts on the first
 * user gesture. Mute persists in localStorage.
 */
const MUTE_KEY = 'studio-audio-muted';
const VOICE_DIR = `${import.meta.env.BASE_URL}audio/voice/`;

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

export class StudioAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambience: AudioBufferSourceNode | null = null;
  private unlocked = false;
  private muted = readMute();
  private interior = false;
  private lastFoot = -1;
  private voice: HTMLAudioElement | null = null;
  private readonly listeners = new Set<() => void>();

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
    this.unlock();
    this.setMuted(!this.muted);
    if (!this.muted) this.playClick();
    return this.muted;
  }

  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    this.unlocked = true;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    void this.ctx.resume();
    this.startAmbience();
    this.emit();
  }

  setInterior(open: boolean): void {
    this.interior = open;
    if (!open) this.stopVoice();
    this.syncAmbience();
  }

  noteWalk(walking: boolean, walked: number, stride = 8.94): void {
    if (!walking) {
      this.lastFoot = -1;
      return;
    }
    const step = Math.floor(walked / Math.max(1, stride));
    if (step === this.lastFoot || step < 0) return;
    this.lastFoot = step;
    this.playFoot(step % 2 === 0);
  }

  playDoor(): void {
    this.blip(180, 0.045, 0.11);
    window.setTimeout(() => this.blip(140, 0.03, 0.08), 55);
  }

  playClick(): void {
    this.blip(920, 0.018, 0.05);
  }

  playCaseVoice(id: string | null | undefined): void {
    this.stopVoice();
    if (!id || this.muted) return;
    this.unlock();
    const el = new Audio(`${VOICE_DIR}${id}.mp3`);
    el.preload = 'auto';
    el.addEventListener('error', () => {
      if (this.voice === el) this.voice = null;
    });
    this.voice = el;
    void el.play().catch(() => {
      if (this.voice === el) this.voice = null;
    });
  }

  private stopVoice(): void {
    if (!this.voice) return;
    this.voice.pause();
    this.voice.src = '';
    this.voice = null;
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

  private syncAmbience(): void {
    const gain = this.ambienceGain;
    const ctx = this.ctx;
    if (!gain || !ctx) return;
    const target = this.muted || !this.unlocked ? 0 : this.interior ? 0.012 : 0.04;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(target, ctx.currentTime, 0.25);
  }

  private playFoot(left: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const dur = 0.06;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = left ? 420 : 560;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = 0.16;
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
