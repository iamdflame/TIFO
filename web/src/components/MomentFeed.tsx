import { useEffect, useRef } from 'react';
import type { MatchState } from '../lib/api';

const HIDDEN = new Set(['comment']);

export default function MomentFeed({ state }: { state: MatchState }) {
  const ref = useRef<HTMLDivElement>(null);
  const moments = state.moments.filter(m => !HIDDEN.has(m.kind)).slice().reverse();

  // pin to top (newest first) when new moments arrive
  const count = moments.length;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [count]);

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Moments</span>
        <span>{state.updates} TxLINE updates</span>
      </div>
      <div className="feed" ref={ref}>
        {moments.length === 0 && (
          <div className="feed-item"><div className="fi-detail">Waiting for the first whistle…</div></div>
        )}
        {moments.map(m => (
          <div key={m.id} className={`feed-item k-${m.kind} ${m.side ? `side-${m.side}` : ''}`}>
            <div className="fi-min">{m.minute > 0 ? `${m.minute}'` : '—'}</div>
            <div>
              <div className="fi-head">{m.headline}</div>
              <div className="fi-detail">{m.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
