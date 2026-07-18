import { useEffect, useRef } from 'react';
import type { MatchState } from '../lib/api';

/**
 * ProbRiver — the story of the match told by the market.
 * A stacked area chart of TxLINE demargined win probabilities over time,
 * with goal/red-card markers stamped where the river bends.
 */
export default function ProbRiver({ state }: { state: MatchState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const resize = () => {
      const w = canvas.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = 190 * dpr;
      canvas.style.height = '190px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = () => {
      const s = stateRef.current;
      const w = canvas.clientWidth;
      const h = 190;
      const padT = 26, padB = 20, padL = 8, padR = 8;
      const plotH = h - padT - padB;
      const plotW = w - padL - padR;
      ctx.clearRect(0, 0, w, h);

      const pts = s.probHistory;
      if (pts.length < 2) {
        ctx.fillStyle = 'rgba(147,160,180,0.5)';
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('waiting for market data…', w / 2, h / 2);
        raf = requestAnimationFrame(draw);
        return;
      }

      const t0 = pts[0].ts;
      const t1 = pts[pts.length - 1].ts;
      const span = Math.max(t1 - t0, 1);
      const X = (ts: number) => padL + ((ts - t0) / span) * plotW;
      const Y = (frac: number) => padT + (1 - frac) * plotH;

      // stacked areas: home (bottom), draw (middle), away (top)
      const layers: { color: string; lo: (p: typeof pts[0]) => number; hi: (p: typeof pts[0]) => number }[] = [
        { color: 'rgba(78,177,255,0.5)', lo: () => 0, hi: p => p.home / 100 },
        { color: 'rgba(147,160,180,0.28)', lo: p => p.home / 100, hi: p => (p.home + p.draw) / 100 },
        { color: 'rgba(255,93,115,0.5)', lo: p => (p.home + p.draw) / 100, hi: () => 1 },
      ];

      for (const layer of layers) {
        ctx.beginPath();
        ctx.moveTo(X(pts[0].ts), Y(layer.lo(pts[0])));
        for (const p of pts) ctx.lineTo(X(p.ts), Y(layer.lo(p)));
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(X(pts[i].ts), Y(layer.hi(pts[i])));
        ctx.closePath();
        ctx.fillStyle = layer.color;
        ctx.fill();
      }

      // boundary strokes
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(78,177,255,0.95)';
      ctx.beginPath();
      pts.forEach((p, i) => { const x = X(p.ts), y = Y(p.home / 100); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,93,115,0.95)';
      ctx.beginPath();
      pts.forEach((p, i) => { const x = X(p.ts), y = Y((p.home + p.draw) / 100); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();

      // event markers
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (const m of s.moments) {
        if (!['goal', 'own_goal', 'penalty_goal', 'red', 'var_end', 'penalty_missed'].includes(m.kind)) continue;
        if (m.ts < t0 || m.ts > t1) continue;
        const x = X(m.ts);
        ctx.strokeStyle = 'rgba(238,242,247,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, h - padB); ctx.stroke();
        ctx.setLineDash([]);
        const isGoal = ['goal', 'own_goal', 'penalty_goal'].includes(m.kind);
        const glyph = isGoal ? '⚽' : m.kind === 'red' ? '🟥' : m.kind === 'penalty_missed' ? '✕' : 'VAR';
        ctx.fillStyle = isGoal ? '#c8ff3e' : m.kind === 'red' ? '#ff4757' : '#ffcf5e';
        ctx.fillText(glyph, x, padT - 8);
      }

      // current numbers
      if (s.probs) {
        ctx.textAlign = 'left';
        ctx.font = '600 11px "JetBrains Mono", monospace';
        const last = pts[pts.length - 1];
        const label = (txt: string, frac: number, color: string) => {
          const y = Math.max(padT + 9, Math.min(h - padB - 2, Y(frac)));
          ctx.fillStyle = color;
          ctx.fillText(txt, Math.min(X(last.ts) + 6, w - 58), y);
        };
        label(`${s.home.code} ${s.probs.home.toFixed(0)}%`, last.home / 200, '#7ec9ff');
        label(`DRW ${s.probs.draw.toFixed(0)}%`, (last.home + last.draw / 2) / 100, '#aab6c8');
        label(`${s.away.code} ${s.probs.away.toFixed(0)}%`, (last.home + last.draw + last.away / 2) / 100, '#ff8a9b');
      }

      // minute axis (sparse)
      ctx.fillStyle = 'rgba(90,102,120,0.9)';
      ctx.font = '9.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      const seen = new Set<number>();
      for (const p of pts) {
        const tick = Math.floor(p.minute / 15) * 15;
        if (tick > 0 && !seen.has(tick)) {
          seen.add(tick);
          ctx.fillText(`${tick}'`, X(p.ts), h - 7);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
    </div>
  );
}
