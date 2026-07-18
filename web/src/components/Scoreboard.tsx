import type { MatchState } from '../lib/api';

const PHASE_LABEL: Record<string, string> = {
  NS: 'KICK-OFF SOON', H1: '1ST HALF', HT: 'HALF-TIME', H2: '2ND HALF', F: 'FULL-TIME',
  WET: 'ET COMING', ET1: 'EXTRA TIME', HTET: 'ET BREAK', ET2: 'EXTRA TIME', FET: 'AFTER ET',
  WPE: 'PENS COMING', PE: 'PENALTIES', FPE: 'DECIDED ON PENS',
  I: 'INTERRUPTED', A: 'ABANDONED', C: 'CANCELLED', P: 'POSTPONED',
};

export default function Scoreboard({ state }: { state: MatchState }) {
  const clock = state.phase === 'PE'
    ? 'shoot-out'
    : `${String(Math.floor(state.clockSeconds / 60)).padStart(2, '0')}:${String(state.clockSeconds % 60).padStart(2, '0')}`;

  const radar = radarText(state);

  return (
    <div className="panel">
      <div className="scoreboard">
        <div className="sb-row">
          <div className="sb-team home">
            <span className="sb-code">{state.home.code}</span>
            <span className="sb-name">{state.home.name}</span>
            <span className="sb-cards">
              {Array.from({ length: state.home.yellows }).map((_, i) => <span key={`y${i}`} className="card-chip y" />)}
              {Array.from({ length: state.home.reds }).map((_, i) => <span key={`r${i}`} className="card-chip r" />)}
            </span>
          </div>

          <div className="sb-center">
            <span className="sb-score">
              {state.home.goals}<span className="dash"> – </span>{state.away.goals}
            </span>
            {(state.home.pens > 0 || state.away.pens > 0) && (
              <span className="sb-pens">pens {state.home.pens}–{state.away.pens}</span>
            )}
            <span className="sb-clock">
              <span className="phase-chip">{PHASE_LABEL[state.phase] ?? state.phase}</span>
              {state.clockRunning || state.phase === 'PE' ? clock : null}
            </span>
          </div>

          <div className="sb-team away">
            <span className="sb-code">{state.away.code}</span>
            <span className="sb-name">{state.away.name}</span>
            <span className="sb-cards">
              {Array.from({ length: state.away.yellows }).map((_, i) => <span key={`y${i}`} className="card-chip y" />)}
              {Array.from({ length: state.away.reds }).map((_, i) => <span key={`r${i}`} className="card-chip r" />)}
            </span>
          </div>
        </div>

        <div className="sb-radar">
          {radar && <span className={`radar-chip ${radar.cls}`}>{radar.text}</span>}
        </div>
      </div>

      <div className="stat-strip">
        <Stat k="shots" h={state.home.shots} a={state.away.shots} />
        <Stat k="on target" h={state.home.shotsOnTarget} a={state.away.shotsOnTarget} />
        <Stat k="corners" h={state.home.corners} a={state.away.corners} />
        <Stat k="cards" h={state.home.yellows + state.home.reds} a={state.away.yellows + state.away.reds} />
      </div>
    </div>
  );
}

function Stat({ k, h, a }: { k: string; h: number; a: number }) {
  return (
    <div className="stat-cell">
      <div className="k">{k}</div>
      <div className="v"><span className="h">{h}</span><span className="sep">·</span><span className="a">{a}</span></div>
    </div>
  );
}

function radarText(s: MatchState): { text: string; cls: string } | null {
  const name = (side: 'home' | 'away') => (side === 'home' ? s.home.code : s.away.code);
  if (s.possibleEvents.var) return { text: '⏳ VAR CHECK IN PROGRESS', cls: 'var' };
  if (s.possibleEvents.penalty) return { text: `⚠ POSSIBLE PENALTY — ${name(s.possibleEvents.penalty)}`, cls: '' };
  if (s.possibleEvents.goal) return { text: `⚡ GOAL THREAT — ${name(s.possibleEvents.goal)}`, cls: '' };
  if (s.possibleEvents.corner) return { text: `◔ CORNER LIKELY — ${name(s.possibleEvents.corner)}`, cls: 'var' };
  if (s.danger === 3 && s.dangerSide) return { text: `🔥 HIGH DANGER — ${name(s.dangerSide)}`, cls: '' };
  return null;
}
