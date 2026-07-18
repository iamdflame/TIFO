/**
 * TIFO — haptic feedback (mobile). Each moment kind gets its own vibration
 * signature, so you can feel the match with the phone in your pocket.
 */

import type { MomentKind } from '../../../shared/types';

const PATTERNS: Partial<Record<MomentKind, number[]>> = {
  goal: [80, 60, 80, 60, 220],
  own_goal: [80, 60, 80, 60, 220],
  penalty_goal: [80, 60, 80, 60, 220],
  shootout_pen: [60, 40, 160],
  red: [300, 120, 300],
  yellow: [120],
  penalty_awarded: [50, 50, 50, 50, 50, 50, 200],
  penalty_missed: [400],
  var_start: [40, 80, 40, 80, 40],
  var_end: [200, 100, 200],
  big_swing: [30, 40, 30, 40, 30],
  kickoff: [100],
  full_time: [100, 80, 100, 80, 300],
  corner: [35],
  shot: [45],
};

let enabled = true;

export const haptics = {
  get supported() { return typeof navigator !== 'undefined' && 'vibrate' in navigator; },
  get enabled() { return enabled; },
  setEnabled(v: boolean) { enabled = v; },
  buzz(kind: MomentKind) {
    if (!enabled || !this.supported) return;
    const p = PATTERNS[kind];
    if (p) navigator.vibrate(p);
  },
};
