import { useEffect, useRef } from 'react';
import type { MatchState } from '../lib/api';

/**
 * MomentumPitch — an animated top-down pitch where a glowing pressure wave
 * surges toward whichever goal is under siege, driven by TxLINE possession
 * danger states and the engine's momentum value.
 */
export default function MomentumPitch({ state }: { state: MatchState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let disp = 0;          // displayed momentum (eased)
    let glow = 0;          // displayed danger intensity (eased)
    const particles: { x: number; y: number; vx: number; life: number }[] = [];

    const resize = () => {
      const w = canvas.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = 150 * dpr;
      canvas.style.height = '150px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (t: number) => {
      const s = stateRef.current;
      const w = canvas.clientWidth;
      const h = 150;
      // ease towards live values
      disp += (s.momentum - disp) * 0.04;
      const targetGlow = s.danger / 3;
      glow += (targetGlow - glow) * 0.05;

      ctx.clearRect(0, 0, w, h);

      // pitch markings
      ctx.strokeStyle = 'rgba(147,160,180,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(10.5, 10.5, w - 21, h - 21);
      ctx.beginPath(); ctx.moveTo(w / 2 + 0.5, 10.5); ctx.lineTo(w / 2 + 0.5, h - 10.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 22, 0, Math.PI * 2); ctx.stroke();
      // boxes
      const boxH = 64, boxW = 34;
      ctx.strokeRect(10.5, (h - boxH) / 2 + 0.5, boxW, boxH);
      ctx.strokeRect(w - 10.5 - boxW, (h - boxH) / 2 + 0.5, boxW, boxH);

      // pressure wave: center of gravity of play
      // momentum +1 => home pressing => wave near AWAY goal (right)
      const cx = w / 2 + disp * (w / 2 - 60);
      const sideColor = disp >= 0 ? '78,177,255' : '255,93,115';

      const pulse = 1 + Math.sin(t / 300) * 0.08 * (0.4 + glow);
      const radius = (34 + glow * 46) * pulse;
      const grad = ctx.createRadialGradient(cx, h / 2, 4, cx, h / 2, radius);
      grad.addColorStop(0, `rgba(${sideColor},${0.45 + glow * 0.4})`);
      grad.addColorStop(0.6, `rgba(${sideColor},${0.12 + glow * 0.18})`);
      grad.addColorStop(1, `rgba(${sideColor},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, h / 2, radius, 0, Math.PI * 2);
      ctx.fill();

      // spark particles streaming toward the attacked goal when danger high
      if (glow > 0.45 && Math.random() < glow * 0.5) {
        particles.push({
          x: cx, y: h / 2 + (Math.random() - 0.5) * 50,
          vx: (disp >= 0 ? 1 : -1) * (1 + Math.random() * 2.2),
          life: 1,
        });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.life -= 0.02;
        if (p.life <= 0 || p.x < 0 || p.x > w) { particles.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(200,255,62,${p.life * 0.7})`;
        ctx.fillRect(p.x, p.y, 2.5, 1.5);
      }

      // ball dot
      ctx.fillStyle = '#eef2f7';
      ctx.beginPath();
      ctx.arc(cx, h / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // goal flash bars when radar predicts a goal
      const radar = s.possibleEvents.goal;
      if (radar) {
        const gx = radar === 'home' ? 10 : w - 14; // home attacking => away goal? radar side = team likely to score
        const attackRight = radar === 'home';
        const x = attackRight ? w - 14 : 10;
        void gx;
        ctx.fillStyle = `rgba(255,71,87,${0.35 + Math.sin(t / 120) * 0.25})`;
        ctx.fillRect(x, (h - boxH) / 2, 4, boxH);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <div className="canvas-wrap">
      <canvas ref={ref} />
      <div className="canvas-legend">
        <span><span className="sw" style={{ background: '#4eb1ff' }} />{state.home.code} pressing</span>
        <span><span className="sw" style={{ background: '#ff5d73' }} />{state.away.code} pressing</span>
      </div>
    </div>
  );
}
