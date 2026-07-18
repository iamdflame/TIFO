import { useCallback, useEffect, useRef, useState } from 'react';
import { useMatchStream, type Moment } from '../lib/api';
import { crowd } from '../lib/audio';
import { haptics } from '../lib/haptics';
import { radio } from '../lib/radio';
import CallIt from './CallIt';
import MomentFeed from './MomentFeed';
import MomentumPitch from './MomentumPitch';
import ProbRiver from './ProbRiver';
import RecapCard from './RecapCard';
import ReplayControls from './ReplayControls';
import Scoreboard from './Scoreboard';
import TakeoverLayer from './Takeover';

const ROAR_KINDS = new Set(['goal', 'own_goal', 'penalty_goal', 'shootout_pen']);
const GROAN_KINDS = new Set(['penalty_missed', 'var_end']);
const GASP_KINDS = new Set(['penalty_awarded', 'var_start', 'red']);

export default function MatchView({ fixtureId }: { fixtureId: number }) {
  const [soundOn, setSoundOn] = useState(false);
  const [radioOn, setRadioOn] = useState(false);
  const [buzzOn, setBuzzOn] = useState(true);
  const [showRecap, setShowRecap] = useState(false);
  const autoRecapDone = useRef(false);

  const onMoment = useCallback((m: Moment) => {
    haptics.buzz(m.kind);
    radio.call(m);
    if (ROAR_KINDS.has(m.kind)) crowd.roar(m.kind !== 'shootout_pen');
    else if (GROAN_KINDS.has(m.kind) && (m.headline.includes('MISSED') || m.headline.includes('DISALLOWED') || m.headline.includes('OVERTURNED'))) crowd.groan();
    else if (GASP_KINDS.has(m.kind)) crowd.gasp();
    else if (m.kind === 'kickoff') crowd.whistle(1);
    else if (m.kind === 'phase' && m.headline.includes('HALF-TIME')) crowd.whistle(2);
    else if (m.kind === 'full_time') crowd.whistle(3);
  }, []);

  const { state, connected, lastMoment } = useMatchStream(fixtureId, onMoment);

  // crowd bed follows danger + phase
  useEffect(() => {
    if (!state) return;
    crowd.setMood({
      danger: state.danger,
      phase: state.phase,
      goalRadar: !!state.possibleEvents.goal || !!state.possibleEvents.penalty,
    });
  }, [state]);

  // auto-offer the recap card at full time
  useEffect(() => {
    if (!state || autoRecapDone.current) return;
    if (['F', 'FET', 'FPE'].includes(state.phase) && state.moments.length > 5) {
      autoRecapDone.current = true;
      setTimeout(() => setShowRecap(true), 5200);
    }
  }, [state]);

  // cleanup senses on unmount
  useEffect(() => () => { crowd.disable(); radio.disable(); }, []);

  const toggleSound = async () => {
    if (soundOn) { crowd.disable(); setSoundOn(false); }
    else { await crowd.enable(); setSoundOn(true); }
  };
  const toggleRadio = () => {
    if (radioOn) { radio.disable(); setRadioOn(false); }
    else { radio.enable(); setRadioOn(true); }
  };
  const toggleBuzz = () => {
    haptics.setEnabled(!buzzOn);
    setBuzzOn(!buzzOn);
  };

  if (!state) {
    return (
      <>
        <header className="topbar">
          <a className="brand" href="#/">TIF<em>O</em></a>
        </header>
        <div className="loading">entering the stadium…</div>
      </>
    );
  }

  const codes = { home: state.home.code, away: state.away.code };
  const finished = ['F', 'FET', 'FPE'].includes(state.phase);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">TIF<em>O</em></a>
        <div className="topbar-right">
          <span className={`pill ${state.source === 'live' ? 'live' : 'replay'}`}>
            <span className="dot" />
            {state.source === 'live' ? 'LIVE · TXLINE' : 'REPLAY'}
          </span>
        </div>
      </header>

      <div className="match-topmeta">
        <button className="back-btn" onClick={() => { window.location.hash = '#/'; }}>← all matches</button>
        <span className="comp">{state.competition}</span>
        {finished && (
          <button className="rb-btn" style={{ marginLeft: 'auto' }} onClick={() => setShowRecap(true)}>
            ★ Recap card
          </button>
        )}
      </div>

      {!connected && <div className="conn-warn">stream reconnecting…</div>}

      <div className="match-shell">
        <div>
          <Scoreboard state={state} />

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head"><span>Pressure map</span><span>possession danger · TxLINE</span></div>
            <MomentumPitch state={state} />
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="panel-head"><span>Win probability river</span><span>demargined 3-way market</span></div>
            <ProbRiver state={state} />
          </div>

          {state.replay && <div style={{ marginTop: 18 }}><ReplayControls state={state} /></div>}
        </div>

        <div>
          <div className="panel">
            <div className="panel-head"><span>Senses</span><span>feel the match</span></div>
            <div className="senses">
              <button className={`sense-btn ${soundOn ? 'on' : ''}`} onClick={toggleSound}>
                <span className="ic">{soundOn ? '🔊' : '🔇'}</span>
                Crowd
              </button>
              <button className={`sense-btn ${radioOn ? 'on' : ''}`} onClick={toggleRadio} disabled={!radio.supported}>
                <span className="ic">📻</span>
                Radio
              </button>
              <button className={`sense-btn ${buzzOn ? 'on' : ''}`} onClick={toggleBuzz} disabled={!haptics.supported}>
                <span className="ic">📳</span>
                Haptics
              </button>
            </div>
            <div className="sense-hint">
              Crowd is synthesized live in your browser and swells with TxLINE danger states.
              Radio speaks the commentary. Haptics buzz goals into your hand (mobile).
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <CallIt state={state} lastMoment={lastMoment} />
          </div>

          <div style={{ marginTop: 18 }}>
            <MomentFeed state={state} />
          </div>
        </div>
      </div>

      <TakeoverLayer moment={lastMoment} codes={codes} />
      {showRecap && <RecapCard state={state} onClose={() => setShowRecap(false)} />}
    </>
  );
}
