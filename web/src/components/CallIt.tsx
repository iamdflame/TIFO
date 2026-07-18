import { useEffect, useRef, useState } from 'react';
import type { MatchState, Moment } from '../lib/api';

type Pick = 'home' | 'away' | 'none';
const GOAL_KINDS = new Set(['goal', 'own_goal', 'penalty_goal']);

/**
 * CALL IT — micro-prediction streak game, settled by the TxLINE stream itself.
 * Call the next goal before it happens; goals settle it, full-time settles "no goal".
 * No wallets, no money — just streak pride (kept in localStorage).
 */
export default function CallIt({ state, lastMoment }: { state: MatchState; lastMoment: Moment | null }) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [streak, setStreak] = useState(() => Number(localStorage.getItem('tifo-streak') ?? 0));
  const [best, setBest] = useState(() => Number(localStorage.getItem('tifo-best') ?? 0));
  const lastId = useRef<string | null>(null);
  const pickRef = useRef<Pick | null>(null);
  pickRef.current = pick;

  const settle = (won: boolean) => {
    setResult(won ? 'win' : 'lose');
    setPick(null);
    setStreak(s => {
      const next = won ? s + 1 : 0;
      localStorage.setItem('tifo-streak', String(next));
      setBest(b => {
        const nb = Math.max(b, next);
        localStorage.setItem('tifo-best', String(nb));
        return nb;
      });
      return next;
    });
    setTimeout(() => setResult(null), 3500);
  };

  useEffect(() => {
    if (!lastMoment || lastMoment.id === lastId.current) return;
    lastId.current = lastMoment.id;
    const p = pickRef.current;
    if (!p) return;
    if (GOAL_KINDS.has(lastMoment.kind)) settle(lastMoment.side === p);
    else if (lastMoment.kind === 'full_time') settle(p === 'none');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMoment]);

  const inPlay = ['H1', 'H2', 'ET1', 'ET2'].includes(state.phase);

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Call it</span>
        <span>streak game</span>
      </div>
      <div className="callit">
        <div className="callit-q">
          {result === 'win' && <span className="callit-result win">CALLED IT! Streak +1 ⚡</span>}
          {result === 'lose' && <span className="callit-result lose">Wrong call — streak reset.</span>}
          {!result && (pick
            ? <>Locked in — waiting for the stream to settle it…</>
            : inPlay
              ? <>Who scores <span className="volt">next</span>?</>
              : <>Calls open while the ball is in play.</>)}
        </div>
        <div className="callit-opts">
          <button className={pick === 'home' ? 'picked' : ''} disabled={!inPlay || !!pick} onClick={() => setPick('home')}>
            {state.home.code}
          </button>
          <button className={pick === 'none' ? 'picked' : ''} disabled={!inPlay || !!pick} onClick={() => setPick('none')}>
            NO GOAL
          </button>
          <button className={pick === 'away' ? 'picked' : ''} disabled={!inPlay || !!pick} onClick={() => setPick('away')}>
            {state.away.code}
          </button>
        </div>
        <div className="callit-status">
          <span>Settled live by the TxLINE feed — no stakes, all glory.</span>
          <span className="callit-streak">🔥 {streak} · best {best}</span>
        </div>
      </div>
    </div>
  );
}
