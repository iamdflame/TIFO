import { useState } from 'react';
import { replayControl, type MatchState } from '../lib/api';

const SPEEDS = [1, 4, 16, 64];

export default function ReplayControls({ state }: { state: MatchState }) {
  const r = state.replay;
  const [scrub, setScrub] = useState<number | null>(null);
  if (!r) return null;

  const pct = r.total ? Math.round((r.position / r.total) * 100) : 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Replay director</span>
        <span>{r.matchLabel}</span>
      </div>
      <div className="replay-bar">
        <div className="rb-row">
          <button
            className={`rb-btn ${r.playing ? '' : 'primary'}`}
            onClick={() => replayControl(state.fixtureId, r.playing ? 'pause' : 'play')}
          >
            {r.playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button className="rb-btn" onClick={() => replayControl(state.fixtureId, 'restart')}>↺ Restart</button>
          <div className="rb-speed">
            {SPEEDS.map(s => (
              <button key={s} className={r.speed === s ? 'on' : ''} onClick={() => replayControl(state.fixtureId, 'speed', s)}>
                {s}×
              </button>
            ))}
          </div>
        </div>
        <div className="rb-row">
          <input
            className="rb-scrub"
            type="range"
            min={0}
            max={100}
            value={scrub ?? pct}
            onChange={e => setScrub(Number(e.target.value))}
            onMouseUp={() => { if (scrub !== null) { void replayControl(state.fixtureId, 'seek', scrub); setScrub(null); } }}
            onTouchEnd={() => { if (scrub !== null) { void replayControl(state.fixtureId, 'seek', scrub); setScrub(null); } }}
          />
          <span className="rb-pos">{r.position}/{r.total}</span>
        </div>
      </div>
    </div>
  );
}
