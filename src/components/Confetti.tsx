import { useMemo } from 'react';

// A lightweight, self-contained confetti burst for celebratory moments (join, squad
// locked, big round). Motion is disabled under prefers-reduced-motion.
const COLORS = ['#D99A00', '#0E6FC4', '#12A150', '#E5472B', '#7DE2FC', '#FFFFFF'];

export default function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: (i * 61) % 100,
    color: COLORS[i % COLORS.length],
    delay: (i % 12) * 0.18,
    duration: 2.6 + (i % 7) * 0.35,
    size: 6 + (i % 4) * 2,
    rot: (i * 37) % 360,
    round: i % 3 === 0,
  })), [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes gsgm-confetti { 0% { transform: translateY(-12vh) rotate(0deg); opacity: 0; } 8% { opacity: 1; } 100% { transform: translateY(112vh) rotate(720deg); opacity: 1; } }
        .gsgm-piece { position: absolute; top: -12vh; animation: gsgm-confetti linear infinite; }
        @media (prefers-reduced-motion: reduce) { .gsgm-piece { display: none; } }
      `}</style>
      {pieces.map((p, i) => (
        <span key={i} className="gsgm-piece" style={{
          left: `${p.left}%`, width: p.size, height: p.size * (p.round ? 1 : 1.6),
          background: p.color, borderRadius: p.round ? '50%' : 2,
          transform: `rotate(${p.rot}deg)`, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s`,
        }} />
      ))}
    </div>
  );
}
