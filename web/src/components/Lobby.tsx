import { useEffect, useState } from 'react';
import { fetchMatches, fetchStatus, type MatchListItem, type ServerStatus } from '../lib/api';

export default function Lobby() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      Promise.all([fetchMatches(), fetchStatus()])
        .then(([m, s]) => { if (alive) { setMatches(m); setStatus(s); setError(null); } })
        .catch(e => alive && setError(String(e)));
    };
    load();
    const t = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const live = matches.filter(m => m.source === 'live');
  const replays = matches.filter(m => m.source === 'replay');

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">TIF<em>O</em></a>
        <span className="brand-tag">the match you can feel</span>
        <div className="topbar-right">
          {status && (
            <span className={`pill ${status.live ? 'live' : 'replay'}`}>
              <span className="dot" />
              {status.live ? `TxLINE LIVE · ${status.network}` : 'REPLAY MODE'}
            </span>
          )}
        </div>
      </header>

      <section className="hero">
        <h1>Feel every<br /><span className="volt">second</span> of the cup.</h1>
        <p>
          TIFO turns TxODDS's TxLINE real-time feed into a living second screen —
          synthesized crowd audio that breathes with the danger state, radio commentary
          spoken as it happens, win-probability rivers, haptic goals and cinematic moments.
          Pick a match and turn the sound on.
        </p>
      </section>

      {error && <div className="conn-warn">server unreachable — {error}</div>}

      {live.length > 0 && (
        <>
          <div className="section-label">Live now — TxLINE feed</div>
          <div className="match-grid">
            {live.map(m => <MatchCard key={m.fixtureId} m={m} />)}
          </div>
        </>
      )}

      {live.length === 0 && status && !status.live && (
        <div className="lobby-note">
          No TxLINE credentials configured — running in <strong>replay mode</strong>.
          Every reel below plays through the exact same engine, schema and pipeline as
          the live feed. To go live, run <code>npm run activate</code> (on-chain Solana
          subscription) and restart.
        </div>
      )}

      <div className="section-label">Replay theatre — full matches, every heartbeat</div>
      <div className="match-grid">
        {replays.map(m => <MatchCard key={m.fixtureId} m={m} />)}
      </div>

      <footer className="footer">
        Built on <a href="https://txline.txodds.com" target="_blank" rel="noreferrer">TxLINE</a> by
        TxODDS — real-time scores, game-state and demargined win probabilities, activated on-chain
        via Solana. Sample reels are synthetic data in the exact TxLINE schema and are labeled as such;
        live &amp; recorded matches use the real feed.
      </footer>
    </>
  );
}

function MatchCard({ m }: { m: MatchListItem }) {
  const started = m.phase && m.phase !== 'NS';
  return (
    <a className="match-card" href={`#/match/${m.fixtureId}`} style={{ textDecoration: 'none' }}>
      <div className="mc-top">
        <span className="mc-label">{m.label ?? m.competition}</span>
        <span className={`pill ${m.source === 'live' ? 'live' : 'replay'}`}>
          <span className="dot" />{m.source === 'live' ? 'LIVE' : m.synthetic ? 'SAMPLE REEL' : 'REPLAY'}
        </span>
      </div>
      <div className="mc-teams">
        <div className="mc-team">
          <span className="mc-code">{m.homeCode}</span>
          <span className="mc-name">{m.home}</span>
        </div>
        {started && m.score
          ? <span className="mc-score">{m.score.home}–{m.score.away}</span>
          : <span className="mc-vs">VS</span>}
        <div className="mc-team">
          <span className="mc-code">{m.awayCode}</span>
          <span className="mc-name">{m.away}</span>
        </div>
      </div>
      <div className="mc-bottom">
        <span>{m.source === 'live' ? new Date(m.startTime).toLocaleString() : 'tap to enter the stadium'}</span>
        <span>→</span>
      </div>
    </a>
  );
}
