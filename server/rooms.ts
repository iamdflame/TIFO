/**
 * TIFO match rooms.
 *
 * A room binds one fixture to one engine instance and broadcasts MatchState to
 * every subscribed browser over SSE.
 *
 *  - LiveRoom:   hydrates from TxLINE snapshots, then consumes the scores and
 *                odds SSE streams in real time.
 *  - ReplayRoom: the Replay Director. Feeds a recorded timeline (TxLINE
 *                historical data or a bundled sample reel) through the exact
 *                same engine with play/pause/seek/speed — so judges can
 *                experience any match "live" at any time.
 */

import type { MatchState, Moment, RecordedMatch, TxFixture, TxOdds, TxScores } from '../shared/types.js';
import { applyItem, applyOdds, applyScore, buildTimeline, initialState, type TimelineItem } from './engine.js';
import type { TxLineClient } from './txline.js';

type Listener = (state: MatchState, newMoments: Moment[]) => void;

export abstract class Room {
  state: MatchState;
  private listeners = new Set<Listener>();
  lastActive = Date.now();

  constructor(fixture: TxFixture, source: 'live' | 'replay') {
    this.state = initialState(fixture, source);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    this.lastActive = Date.now();
    return () => { this.listeners.delete(fn); this.lastActive = Date.now(); };
  }

  get listenerCount() { return this.listeners.size; }

  protected emit(moments: Moment[] = []) {
    for (const fn of this.listeners) fn(this.state, moments);
  }

  abstract close(): void;
}

// ---------------------------------------------------------------------------

export class LiveRoom extends Room {
  private stops: Array<() => void> = [];
  private ticker: ReturnType<typeof setInterval>;

  constructor(fixture: TxFixture, private tx: TxLineClient) {
    super(fixture, 'live');
    this.ticker = setInterval(() => this.emit(), 2_000); // heartbeat so clocks tick client-side
    void this.start(fixture);
  }

  private async start(fixture: TxFixture) {
    const id = fixture.FixtureId;
    // hydrate: replay everything TxLINE already knows about this fixture
    try {
      const [snap, updates, odds] = await Promise.all([
        this.tx.scoresSnapshot(id).catch(() => [] as TxScores[]),
        this.tx.scoresUpdates(id).catch(() => [] as TxScores[]),
        this.tx.oddsSnapshot(id).catch(() => [] as TxOdds[]),
      ]);
      const seen = new Set<string>();
      const scoreHydrate = [...snap, ...updates]
        .filter(u => { const k = `${u.seq}:${u.ts}`; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.ts - b.ts || a.seq - b.seq);
      for (const u of scoreHydrate) applyScore(this.state, u);
      for (const o of [...odds].sort((a, b) => a.Ts - b.Ts)) applyOdds(this.state, o);
      this.emit();
    } catch (err) {
      console.error(`[room ${id}] hydrate failed:`, (err as Error).message);
    }

    // live streams
    this.stops.push(this.tx.stream('scores', id, obj => {
      const moments = applyScore(this.state, obj as TxScores);
      this.emit(moments);
    }, s => console.log(`[room ${id}] scores stream: ${s}`)));

    this.stops.push(this.tx.stream('odds', id, obj => {
      const moments = applyOdds(this.state, obj as TxOdds);
      this.emit(moments);
    }, s => console.log(`[room ${id}] odds stream: ${s}`)));
  }

  close() {
    clearInterval(this.ticker);
    for (const stop of this.stops) stop();
  }
}

// ---------------------------------------------------------------------------

export class ReplayRoom extends Room {
  private timeline: TimelineItem[];
  private fixture: TxFixture;
  private idx = 0;
  private playing = false;
  private speed = 8;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** cap dead time between updates so replays stay watchable */
  private static MAX_GAP_MS = 20_000;

  constructor(rec: RecordedMatch) {
    super(rec.fixture, 'replay');
    this.fixture = rec.fixture;
    this.timeline = buildTimeline(rec.scores, rec.odds);
    this.state.replay = {
      playing: false, speed: this.speed, position: 0, total: this.timeline.length,
      matchLabel: rec.meta?.label,
    };
    this.emit();
  }

  private sync() {
    this.state.replay = {
      playing: this.playing, speed: this.speed,
      position: this.idx, total: this.timeline.length,
      matchLabel: this.state.replay?.matchLabel,
    };
  }

  control(action: 'play' | 'pause' | 'seek' | 'speed' | 'restart', value?: number) {
    this.lastActive = Date.now();
    switch (action) {
      case 'play': this.playing = true; this.schedule(0); break;
      case 'pause': this.playing = false; this.clearTimer(); break;
      case 'speed': this.speed = Math.min(64, Math.max(1, value ?? 8)); break;
      case 'restart': this.seekTo(0); break;
      case 'seek': this.seekTo(Math.min(this.timeline.length, Math.max(0, Math.round((value ?? 0) / 100 * this.timeline.length)))); break;
    }
    this.sync();
    this.emit();
  }

  /** rebuild state deterministically from the start of the timeline */
  private seekTo(target: number) {
    this.clearTimer();
    this.state = initialState(this.fixture, 'replay');
    this.state.replay = { playing: this.playing, speed: this.speed, position: target, total: this.timeline.length, matchLabel: this.state.replay?.matchLabel };
    for (let i = 0; i < target; i++) applyItem(this.state, this.timeline[i]);
    this.idx = target;
    if (this.playing) this.schedule(0);
  }

  private clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }

  private schedule(delay: number) {
    this.clearTimer();
    this.timer = setTimeout(() => this.step(), delay);
  }

  private step() {
    if (!this.playing) return;
    if (this.idx >= this.timeline.length) { this.playing = false; this.sync(); this.emit(); return; }
    const item = this.timeline[this.idx++];
    const moments = applyItem(this.state, item);
    this.sync();
    this.emit(moments);

    const next = this.timeline[this.idx];
    if (!next) { this.playing = false; this.sync(); this.emit(); return; }
    const gap = Math.min(Math.max(next.t - item.t, 30), ReplayRoom.MAX_GAP_MS);
    this.schedule(gap / this.speed);
  }

  close() { this.clearTimer(); }
}
