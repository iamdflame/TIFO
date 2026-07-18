import { useEffect, useRef, useState } from 'react';
import type { Moment } from '../lib/api';

interface Takeover {
  cls: string;
  kicker: string;
  head: string;
  sub: string;
  score?: string;
  confetti: boolean;
  ms: number;
}

function takeoverFor(m: Moment, codes: { home: string; away: string }): Takeover | null {
  const score = `${codes.home} ${m.score.home} – ${m.score.away} ${codes.away}`;
  switch (m.kind) {
    case 'goal':
    case 'penalty_goal':
    case 'own_goal':
      return { cls: 't-goal', kicker: `${m.minute}' · ${m.side === 'home' ? codes.home : codes.away}`, head: 'GOOOAL', sub: m.detail, score, confetti: true, ms: 4200 };
    case 'shootout_pen':
      return { cls: 't-goal', kicker: 'penalty shoot-out', head: 'SCORED', sub: m.detail, score, confetti: false, ms: 2400 };
    case 'red':
      return { cls: 't-red', kicker: `${m.minute}'`, head: 'RED CARD', sub: m.detail, score, confetti: false, ms: 3600 };
    case 'penalty_awarded':
      return { cls: 't-pen', kicker: `${m.minute}'`, head: 'PENALTY!', sub: m.detail, score, confetti: false, ms: 3600 };
    case 'penalty_missed':
      return { cls: 't-pen', kicker: `${m.minute}'`, head: 'MISSED!', sub: m.detail, score, confetti: false, ms: 3600 };
    case 'var_start':
      return { cls: 't-var', kicker: 'video assistant referee', head: 'VAR CHECK', sub: m.detail, confetti: false, ms: 3000 };
    case 'var_end':
      return m.headline.includes('DISALLOWED') || m.headline.includes('OVERTURNED')
        ? { cls: 't-var', kicker: 'VAR decision', head: 'OVERTURNED', sub: m.detail, score, confetti: false, ms: 3600 }
        : null;
    case 'full_time':
      return { cls: 't-ft', kicker: 'that’s all', head: 'FULL-TIME', sub: m.detail, score, confetti: false, ms: 4200 };
    default:
      return null;
  }
}

export default function TakeoverLayer({ moment, codes }: { moment: Moment | null; codes: { home: string; away: string } }) {
  const [active, setActive] = useState<Takeover | null>(null);
  const [confetti, setConfetti] = useState<{ id: number; left: number; delay: number; color: string; size: number; dur: number }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!moment || moment.id === lastId.current) return;
    lastId.current = moment.id;
    const t = takeoverFor(moment, codes);
    if (!t) return;
    if (timer.current) clearTimeout(timer.current);
    setActive(t);
    document.body.classList.remove('shake');
    // force reflow so re-adding restarts the animation
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    if (t.confetti) {
      const colors = ['#c8ff3e', '#4eb1ff', '#ff5d73', '#ffcf5e', '#eef2f7'];
      setConfetti(Array.from({ length: 90 }, (_, i) => ({
        id: Date.now() + i,
        left: Math.random() * 100,
        delay: Math.random() * 0.7,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 7,
        dur: 2 + Math.random() * 2,
      })));
    }
    timer.current = setTimeout(() => { setActive(null); setConfetti([]); }, t.ms);
  }, [moment, codes]);

  return (
    <>
      {confetti.map(c => (
        <span
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.left}vw`,
            width: c.size,
            height: c.size * 0.45,
            background: c.color,
            animationDuration: `${c.dur}s`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}
      {active && (
        <div className={`takeover ${active.cls}`}>
          <div className="to-bg" />
          <div className="to-inner">
            <div className="to-kicker">{active.kicker}</div>
            <div className="to-head">{active.head}</div>
            <div className="to-sub">{active.sub}</div>
            {active.score && <div className="to-score">{active.score}</div>}
          </div>
        </div>
      )}
    </>
  );
}
