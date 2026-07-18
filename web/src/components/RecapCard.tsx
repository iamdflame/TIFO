import { useEffect, useRef, useState } from 'react';
import type { MatchState } from '../lib/api';

/**
 * RecapCard — a shareable, canvas-rendered full-time poster:
 * final score, the win-probability river, and the match's biggest swings.
 */
export default function RecapCard({ state, onClose }: { state: MatchState; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const W = 960, H = 1200;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // background
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0c1016');
    bg.addColorStop(1, '#07090d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // floodlight
    const spot = ctx.createRadialGradient(W / 2, -100, 50, W / 2, -100, 900);
    spot.addColorStop(0, 'rgba(200,255,62,0.14)');
    spot.addColorStop(1, 'rgba(200,255,62,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    // brand
    ctx.font = '900 44px Anton, Impact, sans-serif';
    ctx.fillStyle = '#eef2f7';
    ctx.textAlign = 'left';
    ctx.fillText('TIF', 60, 96);
    const w1 = ctx.measureText('TIF').width;
    ctx.fillStyle = '#c8ff3e';
    ctx.fillText('O', 60 + w1, 96);
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5a6678';
    ctx.textAlign = 'right';
    ctx.fillText('FULL-TIME RECAP', W - 60, 92);

    // competition
    ctx.textAlign = 'center';
    ctx.font = '600 24px "JetBrains Mono", monospace';
    ctx.fillStyle = '#93a0b4';
    ctx.fillText(state.competition.toUpperCase(), W / 2, 190);

    // score
    ctx.font = '900 120px Anton, Impact, sans-serif';
    ctx.fillStyle = '#4eb1ff';
    ctx.textAlign = 'right';
    ctx.fillText(state.home.code, W / 2 - 150, 330);
    ctx.fillStyle = '#ff5d73';
    ctx.textAlign = 'left';
    ctx.fillText(state.away.code, W / 2 + 150, 330);
    ctx.fillStyle = '#eef2f7';
    ctx.textAlign = 'center';
    ctx.fillText(`${state.home.goals}–${state.away.goals}`, W / 2, 330);
    if (state.home.pens || state.away.pens) {
      ctx.font = '600 30px "JetBrains Mono", monospace';
      ctx.fillStyle = '#ffcf5e';
      ctx.fillText(`pens ${state.home.pens}–${state.away.pens}`, W / 2, 385);
    }

    // prob river
    const pts = state.probHistory;
    const px = 60, py = 460, pw = W - 120, ph = 320;
    ctx.fillStyle = '#5a6678';
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WIN PROBABILITY — TXLINE DEMARGINED MARKET', px, py - 18);
    ctx.strokeStyle = '#1c2431';
    ctx.strokeRect(px, py, pw, ph);
    if (pts.length > 1) {
      const t0 = pts[0].ts, span = Math.max(pts[pts.length - 1].ts - t0, 1);
      const X = (ts: number) => px + ((ts - t0) / span) * pw;
      const Y = (f: number) => py + (1 - f) * ph;
      const layer = (lo: (p: typeof pts[0]) => number, hi: (p: typeof pts[0]) => number, color: string) => {
        ctx.beginPath();
        ctx.moveTo(X(pts[0].ts), Y(lo(pts[0])));
        for (const p of pts) ctx.lineTo(X(p.ts), Y(lo(p)));
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i].ts), Y(hi(pts[i])));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      layer(() => 0, p => p.home / 100, 'rgba(78,177,255,0.55)');
      layer(p => p.home / 100, p => (p.home + p.draw) / 100, 'rgba(147,160,180,0.3)');
      layer(p => (p.home + p.draw) / 100, () => 1, 'rgba(255,93,115,0.55)');
      // goal markers
      ctx.font = '28px serif';
      ctx.textAlign = 'center';
      for (const m of state.moments) {
        if (!['goal', 'own_goal', 'penalty_goal'].includes(m.kind)) continue;
        if (m.ts < t0) continue;
        ctx.fillStyle = '#c8ff3e';
        ctx.fillText('⚽', X(m.ts), py + ph + 32);
      }
    }

    // key moments
    const big = state.moments.filter(m =>
      ['goal', 'own_goal', 'penalty_goal', 'red', 'penalty_missed', 'var_end', 'full_time'].includes(m.kind)).slice(-8);
    let y = py + ph + 105;
    ctx.textAlign = 'left';
    ctx.font = '600 20px "JetBrains Mono", monospace';
    ctx.fillStyle = '#5a6678';
    ctx.fillText('THE STORY', px, y - 26);
    for (const m of big) {
      ctx.fillStyle = '#5a6678';
      ctx.font = '600 22px "JetBrains Mono", monospace';
      ctx.fillText(`${m.minute}'`, px, y);
      ctx.fillStyle = ['goal', 'own_goal', 'penalty_goal'].includes(m.kind) ? '#c8ff3e' : m.kind === 'red' ? '#ff4757' : '#eef2f7';
      ctx.font = '800 24px Archivo, sans-serif';
      ctx.fillText(m.headline, px + 80, y);
      y += 44;
      if (y > H - 120) break;
    }

    // footer
    ctx.fillStyle = '#5a6678';
    ctx.font = '600 18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('powered by TxLINE real-time data · txline.txodds.com', W / 2, H - 50);

    setUrl(canvas.toDataURL('image/png'));
  }, [state]);

  return (
    <div className="recap-overlay" onClick={onClose}>
      <canvas ref={ref} onClick={e => e.stopPropagation()} />
      <div className="recap-actions" onClick={e => e.stopPropagation()}>
        {url && (
          <a className="rb-btn primary" href={url} download={`tifo-${state.home.code}-${state.away.code}.png`}>
            ↓ Save recap card
          </a>
        )}
        <button className="rb-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
