/**
 * TIFO — procedural stadium crowd, synthesized entirely in the browser.
 *
 * No samples, no assets: a noise-based crowd bed whose loudness and brightness
 * track the live danger/momentum state from TxLINE, plus synthesized roars,
 * groans, whistles and drums for big moments.
 */

type CrowdMoodInput = { danger: number; phase: string; goalRadar: boolean };

export class CrowdEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bedGain: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private chantGain: GainNode | null = null;
  private chantTimer: number | null = null;
  private started = false;
  private _enabled = false;
  private mood = 0.25; // 0..1 excitement

  get enabled() { return this._enabled; }

  /** Must be called from a user gesture. */
  async enable() {
    if (!this.ctx) this.build();
    if (this.ctx!.state === 'suspended') await this.ctx!.resume();
    this._enabled = true;
    this.master!.gain.cancelScheduledValues(this.ctx!.currentTime);
    this.master!.gain.setTargetAtTime(0.9, this.ctx!.currentTime, 0.8);
  }

  disable() {
    this._enabled = false;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.25);
    }
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.connect(ctx.destination);

    // -- crowd bed: two layers of looped pink-ish noise ----------------------
    const noiseBuf = this.makeNoise(ctx, 4);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    this.bedFilter = ctx.createBiquadFilter();
    this.bedFilter.type = 'bandpass';
    this.bedFilter.frequency.value = 500;
    this.bedFilter.Q.value = 0.35;

    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.16;

    // slow undulation so the bed never sounds static
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.035;
    lfo.connect(lfoDepth).connect(this.bedGain.gain);
    lfo.start();

    src.connect(this.bedFilter).connect(this.bedGain).connect(this.master);
    src.start();

    // -- chant layer (rhythmic hum bursts, driven when mood is high) ---------
    this.chantGain = ctx.createGain();
    this.chantGain.gain.value = 0;
    this.chantGain.connect(this.master);

    this.started = true;
    this.scheduleChants();
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      // pink-ish: integrate white noise with leak
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.03;
        b1 = 0.985 * b1 + white * 0.021;
        b2 = 0.95 * b2 + white * 0.012;
        data[i] = (b0 + b1 + b2 + white * 0.02) * 2.2;
      }
    }
    return buf;
  }

  /** Feed the live match mood — call whenever state updates. */
  setMood(input: CrowdMoodInput) {
    if (!this.ctx || !this.bedGain || !this.bedFilter) return;
    const playing = !['NS', 'HT', 'F', 'FET', 'FPE', 'WET', 'WPE', 'HTET', 'A', 'C', 'P', 'I'].includes(input.phase);
    let target = playing ? 0.3 + input.danger * 0.17 : 0.12;
    if (input.goalRadar) target += 0.18;
    if (input.phase === 'PE') target = 0.72; // shootout tension
    this.mood = Math.min(1, target);
    const t = this.ctx.currentTime;
    this.bedGain.gain.setTargetAtTime(0.1 + this.mood * 0.24, t, 1.2);
    this.bedFilter.frequency.setTargetAtTime(380 + this.mood * 900, t, 1.5);
  }

  private scheduleChants() {
    const tick = () => {
      if (this.ctx && this._enabled && this.mood > 0.45 && Math.random() < this.mood * 0.5) {
        this.chantBurst();
      }
      this.chantTimer = window.setTimeout(tick, 4000 + Math.random() * 6000);
    };
    this.chantTimer = window.setTimeout(tick, 5000);
  }

  /** Low rhythmic "oh-oh-oh" hum — synthesized chant. */
  private chantBurst() {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 110 + Math.random() * 12;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = ctx.createGain();
      const t = t0 + i * 0.42;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + this.mood * 0.05, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      osc.connect(f).connect(g).connect(this.chantGain!);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  /** Full-throated goal roar: white noise swell + celebratory drum hits. */
  roar(big = true) {
    if (!this.ctx || !this._enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(ctx, 3);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(700, t0);
    f.frequency.exponentialRampToValueAtTime(1600, t0 + 0.35);
    f.frequency.exponentialRampToValueAtTime(600, t0 + (big ? 2.6 : 1.4));
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(big ? 0.85 : 0.4, t0 + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (big ? 3.2 : 1.6));
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + 3.4);

    if (big) {
      for (let i = 0; i < 6; i++) this.drum(t0 + 0.6 + i * 0.28);
    }
  }

  /** Collective groan (missed pen, disallowed goal). */
  groan() {
    if (!this.ctx || !this._enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(ctx, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t0);
    f.frequency.exponentialRampToValueAtTime(240, t0 + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + 2);
  }

  /** Anticipation gasp — rising noise, used for VAR checks & penalty spots. */
  gasp() {
    if (!this.ctx || !this._enabled) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.makeNoise(ctx, 2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(400, t0);
    f.frequency.exponentialRampToValueAtTime(1400, t0 + 1.2);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + 1.8);
  }

  /** Referee whistle: kickoff (1 blast), half (2), full-time (3). */
  whistle(blasts = 1) {
    if (!this.ctx || !this._enabled) return;
    const ctx = this.ctx;
    for (let i = 0; i < blasts; i++) {
      const t = ctx.currentTime + i * 0.5;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(2350, t);
      // warble
      const warble = ctx.createOscillator();
      warble.frequency.value = 38;
      const warbleDepth = ctx.createGain();
      warbleDepth.gain.value = 120;
      warble.connect(warbleDepth).connect(osc.frequency);
      const g = ctx.createGain();
      const long = i === blasts - 1 && blasts > 1;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (long ? 0.9 : 0.32));
      osc.connect(g).connect(this.master!);
      osc.start(t); osc.stop(t + (long ? 1 : 0.4));
      warble.start(t); warble.stop(t + (long ? 1 : 0.4));
    }
  }

  private drum(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  destroy() {
    if (this.chantTimer) clearTimeout(this.chantTimer);
    this.ctx?.close();
    this.ctx = null;
    this.started = false;
    this._enabled = false;
  }
}

export const crowd = new CrowdEngine();
