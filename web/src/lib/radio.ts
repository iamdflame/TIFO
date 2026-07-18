/**
 * TIFO Radio — spoken commentary via the Web Speech API.
 *
 * Every big Moment from the TxLINE stream is voiced like a radio broadcast.
 * Queue keeps lines from talking over each other; urgent lines (goals) jump
 * the queue.
 */

import type { Moment } from '../../../shared/types';

const URGENT = new Set(['goal', 'own_goal', 'penalty_goal', 'red', 'penalty_awarded', 'var_end', 'full_time', 'shootout_pen']);
const SPOKEN = new Set([
  'kickoff', 'phase', 'goal', 'own_goal', 'penalty_goal', 'red', 'yellow',
  'penalty_awarded', 'penalty_missed', 'var_start', 'var_end', 'big_swing',
  'full_time', 'shootout_pen', 'shot',
]);

class Radio {
  private queue: string[] = [];
  private speaking = false;
  private _enabled = false;
  private voice: SpeechSynthesisVoice | null = null;

  get enabled() { return this._enabled; }
  get supported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }

  enable() {
    if (!this.supported) return;
    this._enabled = true;
    this.pickVoice();
    speechSynthesis.onvoiceschanged = () => this.pickVoice();
  }

  disable() {
    this._enabled = false;
    this.queue = [];
    if (this.supported) speechSynthesis.cancel();
    this.speaking = false;
  }

  private pickVoice() {
    const voices = speechSynthesis.getVoices();
    this.voice =
      voices.find(v => /en-GB/i.test(v.lang) && /male|daniel|arthur|george/i.test(v.name)) ??
      voices.find(v => /en-GB/i.test(v.lang)) ??
      voices.find(v => /^en/i.test(v.lang)) ??
      voices[0] ?? null;
  }

  /** Voice a moment from the stream. */
  call(m: Moment) {
    if (!this._enabled || !this.supported || !SPOKEN.has(m.kind)) return;
    // shots: only voice the dramatic ones
    if (m.kind === 'shot' && !/WOODWORK|BIG CHANCE/.test(m.headline)) return;

    const line = m.detail || m.headline;
    if (URGENT.has(m.kind)) {
      speechSynthesis.cancel();
      this.queue = [line];
      this.speaking = false;
    } else {
      if (this.queue.length >= 2) return; // don't build a backlog
      this.queue.push(line);
    }
    this.pump();
  }

  say(text: string) {
    if (!this._enabled || !this.supported) return;
    this.queue.push(text);
    this.pump();
  }

  private pump() {
    if (this.speaking || !this.queue.length) return;
    const text = this.queue.shift()!;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 1.12;
    u.pitch = 1.02;
    u.volume = 1;
    this.speaking = true;
    u.onend = u.onerror = () => {
      this.speaking = false;
      this.pump();
    };
    speechSynthesis.speak(u);
  }
}

export const radio = new Radio();
